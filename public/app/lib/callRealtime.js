import { supabase } from "../supabaseClient.js";

const SIGNAL_EVENT = "signal";
const TERMINAL_SUBSCRIBE_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);
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

function createServerMediatedChannelName(conversationId) {
  const convId = normalizeId(conversationId);
  if (!convId) throw new Error("callRealtime: conversationId is required");
  return `gdm-user-fanout:${convId}`;
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

function applyPresenceSnapshot(context, { notify = true } = {}) {
  if (!context || context.closed) return [];
  context.presenceMembers = context.serverMediated ? [] : readPresenceMembers(context.channel);
  context.presenceSynced = true;
  context.lastPresenceSyncAt = Date.now();
  if (notify) {
    invokeCallback(context.onPresenceSync, context.presenceMembers.slice(), context);
  }
  return context.presenceMembers.slice();
}

function invokeCallback(callback, ...args) {
  if (typeof callback !== "function") return;
  try {
    callback(...args);
  } catch (error) {
    console.error("callRealtime callback failed", error);
  }
}

function createSubscriptionError(status = "CHANNEL_ERROR", category = "subscribe_failed") {
  const normalizedStatus = String(status || "CHANNEL_ERROR").trim().toUpperCase() || "CHANNEL_ERROR";
  const error = new Error(`callRealtime: subscribe failed (${normalizedStatus})`);
  error.name = "CallRealtimeSubscriptionError";
  error.code = category;
  error.status = normalizedStatus;
  return error;
}

function cleanupNativeChannel(context) {
  if (!context || context.serverMediated) return;
  try { void Promise.resolve(context.channel?.unsubscribe?.()).catch(() => {}); } catch (_) {}
  try { void Promise.resolve(context.supabaseClient?.removeChannel?.(context.channel)).catch(() => {}); } catch (_) {}
}

function retireCallChannel(context, {
  error = null,
  cleanupNative = true,
  failureCategory = null,
} = {}) {
  if (!context) return false;
  const wasClosed = context.closed === true;
  const pendingReject = context.subscribeReject;
  context.closed = true;
  context.joined = false;
  context.lastPresencePayload = null;
  context.presenceMembers = [];
  context.presenceSynced = false;
  context.lastPresenceSyncAt = 0;
  context.subscribed = false;
  context.subscribePromise = null;
  context.subscribeResolve = null;
  context.subscribeReject = null;
  context.subscriptionGeneration += 1;
  context.cleanupCompleted = true;
  if (failureCategory) context.lastFailureCategory = failureCategory;
  if (channelRegistry.get(context.channelName) === context) {
    channelRegistry.delete(context.channelName);
  }
  if (typeof pendingReject === "function") {
    pendingReject(error || createSubscriptionError("CLOSED", "subscribe_cancelled"));
  }
  if (cleanupNative) cleanupNativeChannel(context);
  return !wasClosed;
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
  if (context.serverMediated) {
    context.status = "SUBSCRIBED";
    context.subscribed = true;
    return context;
  }
  if (context.subscribed && context.status === "SUBSCRIBED") {
    const barrierRecord = context.channel?.__altaraStartupBarrierRecord || null;
    const barrierStatus = String(barrierRecord?.subscribeStatus || "").trim().toUpperCase();
    if (!barrierRecord?.cancelled && !TERMINAL_SUBSCRIBE_STATUSES.has(barrierStatus)) return context;
    const error = createSubscriptionError(barrierStatus || "CLOSED", "stale_subscription");
    retireCallChannel(context, {
      error,
      cleanupNative: true,
      failureCategory: "stale_subscription",
    });
    throw error;
  }
  if (context.subscribePromise) return context.subscribePromise;

  const subscriptionGeneration = context.subscriptionGeneration + 1;
  context.subscriptionGeneration = subscriptionGeneration;
  context.subscribeAttempt += 1;
  context.lastSubscribeRequestedAt = Date.now();
  context.lastSubscribeStatus = "REQUESTED";
  context.cleanupCompleted = false;
  const currentPromise = new Promise((resolve, reject) => {
    context.subscribeResolve = resolve;
    context.subscribeReject = reject;
    context.channel.subscribe((status) => {
      if (context.closed) return;
      const normalizedStatus = String(status || "").trim().toUpperCase() || "UNKNOWN";
      context.status = status;
      context.lastSubscribeStatus = normalizedStatus;
      context.lastSubscribeStatusAt = Date.now();
      invokeCallback(context.onStatus, status, context);

      if (subscriptionGeneration !== context.subscriptionGeneration) return;
      if (normalizedStatus === "SUBSCRIBED") {
        context.subscribed = true;
        context.lastFailureCategory = null;
        const settle = context.subscribeResolve;
        context.subscribePromise = null;
        context.subscribeResolve = null;
        context.subscribeReject = null;
        if (typeof settle === "function") settle(context);
        return;
      }
      if (TERMINAL_SUBSCRIBE_STATUSES.has(normalizedStatus)) {
        const category = normalizedStatus === "TIMED_OUT" ? "subscribe_timeout" : "subscribe_failed";
        retireCallChannel(context, {
          error: createSubscriptionError(normalizedStatus, category),
          cleanupNative: true,
          failureCategory: category,
        });
      }
    });
  });
  context.subscribePromise = currentPromise;

  try {
    await currentPromise;
    return context;
  } catch (error) {
    if (!context.closed && subscriptionGeneration === context.subscriptionGeneration) {
      retireCallChannel(context, {
        error,
        cleanupNative: true,
        failureCategory: String(error?.code || "subscribe_failed"),
      });
    }
    throw error;
  }
}

export async function createCallChannel({
  conversationId,
  conversationType = "dm",
  privateChannel = true,
  serverMediatedSend = null,
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

  const serverMediated = typeof serverMediatedSend === "function";
  const channelName = serverMediated
    ? createServerMediatedChannelName(convId)
    : createChannelName(convId, conversationType);
  const existing = channelRegistry.get(channelName);
  if (existing && !existing.closed) {
    existing.onSignal = onSignal;
    existing.onPresenceSync = onPresenceSync;
    existing.onPresenceJoin = onPresenceJoin;
    existing.onPresenceLeave = onPresenceLeave;
    existing.onStatus = onStatus;
    existing.onError = onError;
    existing.serverMediatedSend = serverMediatedSend;
    const ready = await waitForSubscription(existing);
    // Replaying the full snapshot matters when an observer attaches to an
    // already-subscribed channel after private-call grace discovery. Presence
    // observation must not require this client to call track().
    applyPresenceSnapshot(ready);
    return ready;
  }

  const channel = serverMediated
    ? null
    : supabaseClient.channel(channelName, {
        config: {
          private: privateChannel === true,
          // Shutdown waits on the graceful-leave send before retiring this
          // channel. Server acknowledgement makes that wait meaningful and
          // prevents a fire-and-forget X-close signal from being discarded.
          broadcast: { self: false, ack: true },
          presence: { key: userId },
        },
      });

  const context = {
    channel,
    channelName,
    conversationId: convId,
    conversationType: normalizeConversationType(conversationType),
    privateChannel: privateChannel === true,
    serverMediated,
    serverMediatedSend,
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
    subscribeResolve: null,
    subscribeReject: null,
    subscribeAttempt: 0,
    subscriptionGeneration: 0,
    lastSubscribeRequestedAt: null,
    lastSubscribeStatusAt: null,
    lastSubscribeStatus: "INITIAL",
    lastFailureCategory: null,
    cleanupCompleted: false,
    joined: false,
    closed: false,
    supabaseClient,
  };

  if (!serverMediated) bindChannelHandlers(context);
  channelRegistry.set(channelName, context);
  if (serverMediated) invokeCallback(context.onStatus, "SUBSCRIBED", context);
  const ready = await waitForSubscription(context);
  // Supabase also emits an initial `sync`; this immediate read closes the
  // subscribe/render race and the later authoritative sync still reconciles
  // any state that arrived after SUBSCRIBED.
  applyPresenceSnapshot(ready);
  return ready;
}

export async function ensureCallChannelReady(context) {
  if (!context || context.closed) throw new Error("callRealtime: invalid channel context");
  const ready = await waitForSubscription(context);
  applyPresenceSnapshot(ready);
  return ready;
}

export function replayCallChannelPresence(context) {
  return applyPresenceSnapshot(context);
}

export function getCallChannelDiagnostics(context) {
  if (!context) return null;
  const barrierRecord = context.channel?.__altaraStartupBarrierRecord || null;
  const nativeState = String(
    barrierRecord?.subscribeStatus
    || context.channel?.state
    || context.lastSubscribeStatus
    || context.status
    || "UNKNOWN"
  ).trim().toUpperCase() || "UNKNOWN";
  return {
    signallingTopicFamily: context.conversationType === "dm" ? "private_dm" : "group_call",
    desiredSubscription: barrierRecord
      ? barrierRecord.cancelled !== true && barrierRecord.descriptor?.desired !== false
      : !context.closed,
    nativeSubscriptionState: nativeState,
    lastSubscribeStartedAt: Number(barrierRecord?.startedAt || context.lastSubscribeRequestedAt || 0) || null,
    lastSubscribeStatus: String(context.lastSubscribeStatus || context.status || "UNKNOWN").trim().toUpperCase(),
    subscribeAttempt: Number(context.subscribeAttempt || 0),
    subscriptionGeneration: Number(barrierRecord?.descriptor?.generation || context.subscriptionGeneration || 0),
    retryScheduled: !!(
      barrierRecord?.descriptor?.retryTimer
      || (Number(barrierRecord?.notBeforeAt || 0) > Date.now())
    ),
    lastFailureCategory: context.lastFailureCategory || null,
    cleanupCompleted: context.cleanupCompleted === true,
  };
}

export async function joinCallChannel(context, presenceMeta = {}) {
  if (!context || context.closed) throw new Error("callRealtime: invalid channel context");
  await waitForSubscription(context);

  const payload = {
    userId: context.currentUserId,
    joinedAt: new Date().toISOString(),
    meta: isPlainObject(presenceMeta) ? { ...presenceMeta } : {},
  };

  if (!context.serverMediated) await context.channel.track(payload);
  context.lastPresencePayload = payload;
  context.joined = true;
  context.presenceMembers = context.serverMediated ? [] : readPresenceMembers(context.channel);
  context.presenceSynced = true;
  context.lastPresenceSyncAt = Date.now();
  invokeCallback(context.onPresenceSync, context.presenceMembers.slice(), context);
  return context;
}

export async function sendCallSignal(context, signal) {
  if (!context || context.closed) throw new Error("callRealtime: invalid channel context");
  await waitForSubscription(context);
  const payload = normalizeSignal(signal, context.conversationId, context.currentUserId);
  if (context.serverMediated) {
    await context.serverMediatedSend(payload);
    return payload;
  }
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
    if (!context.serverMediated) {
      try {
        await context.channel.untrack();
      } catch (_) {}
    }
    context.joined = false;
    context.lastPresencePayload = null;
  }

  if (!unsubscribe) return;

  retireCallChannel(context, {
    error: createSubscriptionError("CLOSED", "subscribe_cancelled"),
    cleanupNative: false,
  });

  if (!context.serverMediated) {
    try { await context.channel.unsubscribe(); } catch (_) {}
    try { context.supabaseClient.removeChannel(context.channel); } catch (_) {}
  }
}

export function discardCallChannelForRecovery(context) {
  if (!context || context.closed) return false;
  return retireCallChannel(context, {
    error: createSubscriptionError("CLOSED", "subscribe_cancelled"),
    cleanupNative: true,
  });
}
