import { supabase } from "../supabaseClient.js";

const SIGNAL_EVENT = "signal";
const SUBSCRIBE_TIMEOUT_MS = 10000;
const VALID_SIGNAL_TYPES = new Set([
  "offer",
  "answer",
  "ice-candidate",
  "hangup",
  "mute",
  "unmute",
]);
const channelRegistry = new Map();

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeConversationType(value) {
  return String(value || "").trim().toLowerCase() === "group" ? "group" : "dm";
}

function createChannelName(conversationId, conversationType) {
  const convId = normalizeId(conversationId);
  if (!convId) throw new Error("callRealtime: conversationId is required");
  const type = normalizeConversationType(conversationType);
  return type === "group" ? `call:group_${convId}` : `call:dm_${convId}`;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coerceIsoString(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
}

function normalizeSignal(signal = {}, fallbackConversationId = "", fallbackUserId = "") {
  const next = isPlainObject(signal) ? { ...signal } : {};
  const type = String(next.type || "").trim().toLowerCase();
  if (!VALID_SIGNAL_TYPES.has(type)) {
    throw new Error(`callRealtime: invalid signal type "${next.type || ""}"`);
  }

  const conversationId = normalizeId(next.conversationId || fallbackConversationId);
  if (!conversationId) throw new Error("callRealtime: signal conversationId is required");

  const fromUserId = normalizeId(next.fromUserId || fallbackUserId);
  if (!fromUserId) throw new Error("callRealtime: signal fromUserId is required");

  return {
    type,
    conversationId,
    fromUserId,
    data: Object.prototype.hasOwnProperty.call(next, "data") ? next.data : null,
    createdAt: coerceIsoString(next.createdAt),
  };
}

function normalizePresenceEntry(key, presence = {}) {
  const userId = normalizeId(presence?.userId || key);
  if (!userId) return null;
  const meta = isPlainObject(presence?.meta) ? { ...presence.meta } : {};
  const joinedAt = coerceIsoString(presence?.joinedAt || presence?.online_at || presence?.onlineAt);
  return {
    userId,
    joinedAt,
    meta,
    raw: presence,
  };
}

function readPresenceMembers(channel) {
  const state = typeof channel?.presenceState === "function" ? channel.presenceState() : {};
  const members = [];
  const seen = new Set();
  Object.entries(state || {}).forEach(([key, entries]) => {
    const list = Array.isArray(entries) ? entries : [];
    list.forEach((entry) => {
      const member = normalizePresenceEntry(key, entry);
      if (!member || seen.has(member.userId)) return;
      seen.add(member.userId);
      members.push(member);
    });
  });
  return members;
}

function invokeCallback(callback, ...args) {
  if (typeof callback !== "function") return;
  try {
    callback(...args);
  } catch (error) {
    console.error("callRealtime callback failed", error);
  }
}

function getTargetUserId(signal) {
  return normalizeId(
    signal?.data?.targetUserId
    || signal?.data?.toUserId
    || signal?.data?.recipientUserId
    || ""
  );
}

function bindChannelHandlers(context) {
  const { channel } = context;

  channel
    .on("broadcast", { event: SIGNAL_EVENT }, (message = {}) => {
      if (context.closed) return;
      let signal = null;
      try {
        signal = normalizeSignal(message?.payload || {}, context.conversationId, "");
      } catch (error) {
        invokeCallback(context.onError, error, context);
        return;
      }

      if (normalizeId(signal.fromUserId) === context.currentUserId) return;

      const targetUserId = getTargetUserId(signal);
      if (targetUserId && targetUserId !== context.currentUserId) return;

      invokeCallback(context.onSignal, signal, context);
    })
    .on("presence", { event: "sync" }, () => {
      if (context.closed) return;
      context.presenceMembers = readPresenceMembers(channel);
      context.presenceSynced = true;
      context.lastPresenceSyncAt = Date.now();
      invokeCallback(context.onPresenceSync, context.presenceMembers.slice(), context);
    })
    .on("presence", { event: "join" }, ({ key, newPresences } = {}) => {
      if (context.closed) return;
      const joined = (Array.isArray(newPresences) ? newPresences : [])
        .map((entry) => normalizePresenceEntry(key, entry))
        .filter(Boolean);
      context.presenceMembers = readPresenceMembers(channel);
      context.presenceSynced = true;
      context.lastPresenceSyncAt = Date.now();
      invokeCallback(context.onPresenceJoin, joined, context.presenceMembers.slice(), context);
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences } = {}) => {
      if (context.closed) return;
      const left = (Array.isArray(leftPresences) ? leftPresences : [])
        .map((entry) => normalizePresenceEntry(key, entry))
        .filter(Boolean);
      context.presenceMembers = readPresenceMembers(channel);
      context.presenceSynced = true;
      context.lastPresenceSyncAt = Date.now();
      invokeCallback(context.onPresenceLeave, left, context.presenceMembers.slice(), context);
    });
}

async function waitForSubscription(context) {
  if (context.closed) throw new Error("callRealtime: channel already closed");
  if (context.subscribePromise) return context.subscribePromise;

  context.subscribePromise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`callRealtime: subscribe timeout for ${context.channelName}`));
    }, SUBSCRIBE_TIMEOUT_MS);

    context.channel.subscribe((status) => {
      context.status = status;
      invokeCallback(context.onStatus, status, context);

      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        clearTimeout(timer);
        resolve(context);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`callRealtime: subscribe failed (${status}) for ${context.channelName}`));
      }
    });
  });

  try {
    await context.subscribePromise;
    context.subscribed = true;
    return context;
  } catch (error) {
    context.subscribePromise = null;
    context.subscribed = false;
    throw error;
  }
}

export async function createCallChannel({
  conversationId,
  conversationType = "dm",
  currentUserId,
  onSignal,
  onPresenceSync,
  onPresenceJoin,
  onPresenceLeave,
  onStatus,
  onError,
  supabaseClient = supabase,
} = {}) {
  const convId = normalizeId(conversationId);
  const userId = normalizeId(currentUserId);
  if (!convId) throw new Error("callRealtime: conversationId is required");
  if (!userId) throw new Error("callRealtime: currentUserId is required");

  const channelName = createChannelName(convId, conversationType);
  const existing = channelRegistry.get(channelName);
  if (existing && !existing.closed) {
    existing.onSignal = onSignal;
    existing.onPresenceSync = onPresenceSync;
    existing.onPresenceJoin = onPresenceJoin;
    existing.onPresenceLeave = onPresenceLeave;
    existing.onStatus = onStatus;
    existing.onError = onError;
    return waitForSubscription(existing);
  }

  const channel = supabaseClient.channel(channelName, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: userId },
    },
  });

  const context = {
    channel,
    channelName,
    conversationId: convId,
    conversationType: normalizeConversationType(conversationType),
    currentUserId: userId,
    onSignal,
    onPresenceSync,
    onPresenceJoin,
    onPresenceLeave,
    onStatus,
    onError,
    presenceMembers: [],
    presenceSynced: false,
    lastPresenceSyncAt: 0,
    lastPresencePayload: null,
    status: "INITIAL",
    subscribed: false,
    subscribePromise: null,
    joined: false,
    closed: false,
    supabaseClient,
  };

  bindChannelHandlers(context);
  channelRegistry.set(channelName, context);
  return waitForSubscription(context);
}

export async function joinCallChannel(context, presenceMeta = {}) {
  if (!context || context.closed) throw new Error("callRealtime: invalid channel context");
  await waitForSubscription(context);

  const payload = {
    userId: context.currentUserId,
    joinedAt: new Date().toISOString(),
    meta: isPlainObject(presenceMeta) ? { ...presenceMeta } : {},
  };

  await context.channel.track(payload);
  context.lastPresencePayload = payload;
  context.joined = true;
  context.presenceMembers = readPresenceMembers(context.channel);
  context.presenceSynced = true;
  context.lastPresenceSyncAt = Date.now();
  invokeCallback(context.onPresenceSync, context.presenceMembers.slice(), context);
  return context;
}

export async function sendCallSignal(context, signal) {
  if (!context || context.closed) throw new Error("callRealtime: invalid channel context");
  await waitForSubscription(context);
  const payload = normalizeSignal(signal, context.conversationId, context.currentUserId);
  const result = await context.channel.send({
    type: "broadcast",
    event: SIGNAL_EVENT,
    payload,
  });

  if (typeof result === "string" && result !== "ok") {
    throw new Error(`callRealtime: broadcast failed (${result}) for ${context.channelName}`);
  }
  return payload;
}

export async function leaveCallChannel(context, { unsubscribe = true } = {}) {
  if (!context || context.closed) return;

  if (context.joined) {
    try {
      await context.channel.untrack();
    } catch (_) {}
    context.joined = false;
    context.lastPresencePayload = null;
  }

  if (!unsubscribe) return;

  context.closed = true;
  context.presenceMembers = [];
  context.presenceSynced = false;
  context.lastPresenceSyncAt = 0;
  context.subscribed = false;
  context.subscribePromise = null;
  channelRegistry.delete(context.channelName);

  try {
    await context.channel.unsubscribe();
  } catch (_) {}
  try {
    context.supabaseClient.removeChannel(context.channel);
  } catch (_) {}
}
