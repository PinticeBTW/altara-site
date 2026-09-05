export const CALL_RECONNECT_GRACE_MS = 45_000;
export const CALL_RECONNECT_RESUME_STORAGE_KEY = "altara.call_reconnect_resume.v1";

const CALL_KINDS = new Set(["private", "group", "server"]);
const RESUME_MODES = new Set(["explicit_join", "transient_reconnect", "active_marker"]);

function normalizeId(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeKind(value = "") {
  const kind = String(value || "").trim().toLowerCase();
  return CALL_KINDS.has(kind) ? kind : "";
}

function normalizeResumeMode(value = "", reason = "") {
  const mode = String(value || "").trim().toLowerCase();
  if (RESUME_MODES.has(mode)) return mode;
  const normalizedReason = String(reason || "").trim().toLowerCase();
  if (/window_close|app_quit|pagehide|beforeunload|renderer_shutdown|tray_quit/.test(normalizedReason)) {
    return "explicit_join";
  }
  if (/unexpected|transport_disconnect|network|reconnect/.test(normalizedReason)) {
    return "transient_reconnect";
  }
  return "active_marker";
}

function recordKey(conversationId, userId) {
  return `${normalizeId(conversationId)}|${normalizeId(userId)}`;
}

function cloneRecord(record) {
  return record ? { ...record } : null;
}

function errorText(error = null) {
  return [
    error?.code,
    error?.name,
    error?.message,
    error?.details,
    error?.hint,
    error?.error,
    error?.context?.body,
  ]
    .map((value) => {
      if (value && typeof value === "object") {
        try { return JSON.stringify(value); } catch (_) { return ""; }
      }
      return String(value || "");
    })
    .join(" ")
    .trim()
    .toLowerCase();
}

export function isPrivateCallConversationBusyError(error = null) {
  return errorText(error).includes("private_call_conversation_busy");
}

export function normalizeCallReconnectGraceRecord(input = {}, {
  now = Date.now(),
  graceMs = CALL_RECONNECT_GRACE_MS,
} = {}) {
  const currentTime = Number(now);
  const boundedGraceMs = Math.max(1_000, Number(graceMs) || CALL_RECONNECT_GRACE_MS);
  const conversationId = normalizeId(input?.conversationId || input?.conversation_id || "");
  const userId = normalizeId(input?.userId || input?.user_id || input?.disconnectedUserId || "");
  const kind = normalizeKind(input?.kind || input?.callKind || "");
  const requestedExpiry = Number(input?.expiresAt || input?.expires_at || 0);
  const expiresAt = Math.min(
    currentTime + boundedGraceMs,
    requestedExpiry > currentTime ? requestedExpiry : currentTime + boundedGraceMs,
  );
  if (!conversationId || !userId || !kind || !Number.isFinite(expiresAt) || expiresAt <= currentTime) return null;
  return {
    conversationId,
    userId,
    kind,
    callGeneration: normalizeId(input?.callGeneration || input?.call_generation || "") || null,
    otherUserId: normalizeId(input?.otherUserId || input?.other_user_id || "") || null,
    label: String(input?.label || "").trim().slice(0, 160) || null,
    avatar: String(input?.avatar || "").trim().slice(0, 2048) || null,
    expiresAt,
    startedAt: Number(input?.startedAt || input?.started_at || currentTime) || currentTime,
    source: String(input?.source || "transport_disconnect").trim().slice(0, 100) || "transport_disconnect",
  };
}

export function createCallReconnectGraceController({
  now = () => Date.now(),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (timer) => clearTimeout(timer),
  graceMs = CALL_RECONNECT_GRACE_MS,
  onChange = null,
  onExpire = null,
} = {}) {
  const records = new Map();
  const timers = new Map();

  const emitChange = (event, record) => {
    try { onChange?.(event, cloneRecord(record)); } catch (_) {}
  };

  const clearTimer = (key) => {
    const timer = timers.get(key);
    if (timer != null) {
      try { cancelSchedule(timer); } catch (_) {}
      timers.delete(key);
    }
  };

  const expireKey = (key) => {
    clearTimer(key);
    const record = records.get(key) || null;
    if (!record) return false;
    if (record.expiresAt > Number(now())) {
      arm(record);
      return false;
    }
    records.delete(key);
    emitChange("expired", record);
    try { onExpire?.(cloneRecord(record)); } catch (_) {}
    return true;
  };

  const arm = (record) => {
    const key = recordKey(record.conversationId, record.userId);
    clearTimer(key);
    const delayMs = Math.max(0, record.expiresAt - Number(now()));
    timers.set(key, schedule(() => expireKey(key), delayMs));
  };

  const begin = (input = {}) => {
    const next = normalizeCallReconnectGraceRecord(input, {
      now: Number(now()),
      graceMs,
    });
    if (!next) return null;
    const key = recordKey(next.conversationId, next.userId);
    const previous = records.get(key) || null;
    if (previous && previous.callGeneration && next.callGeneration && previous.callGeneration !== next.callGeneration) {
      clearTimer(key);
    } else if (previous) {
      // Duplicate transport/realtime events must never extend the grace window.
      next.startedAt = Math.min(previous.startedAt, next.startedAt);
      next.expiresAt = Math.min(previous.expiresAt, next.expiresAt);
      next.label = next.label || previous.label;
      next.avatar = next.avatar || previous.avatar;
    }
    records.set(key, next);
    arm(next);
    emitChange(previous ? "updated" : "started", next);
    return cloneRecord(next);
  };

  const clear = (conversationId, userId, { reason = "restored" } = {}) => {
    const key = recordKey(conversationId, userId);
    if (!key || key === "|") return false;
    clearTimer(key);
    const record = records.get(key) || null;
    if (!record) return false;
    records.delete(key);
    emitChange(String(reason || "restored"), record);
    return true;
  };

  const clearConversation = (conversationId, { reason = "conversation_cleared" } = {}) => {
    const convId = normalizeId(conversationId);
    if (!convId) return 0;
    let removed = 0;
    Array.from(records.values()).forEach((record) => {
      if (record.conversationId !== convId) return;
      if (clear(convId, record.userId, { reason })) removed += 1;
    });
    return removed;
  };

  const get = (conversationId, userId) => {
    const key = recordKey(conversationId, userId);
    const record = records.get(key) || null;
    if (!record) return null;
    if (record.expiresAt <= Number(now())) {
      expireKey(key);
      return null;
    }
    return cloneRecord(record);
  };

  const list = (conversationId = "") => {
    const convId = normalizeId(conversationId);
    return Array.from(records.values())
      .filter((record) => !convId || record.conversationId === convId)
      .map((record) => get(record.conversationId, record.userId))
      .filter(Boolean);
  };

  return {
    begin,
    clear,
    clearConversation,
    get,
    list,
    isReconnecting: (conversationId, userId) => !!get(conversationId, userId),
    getSnapshot: () => ({
      graceMs: Math.max(1_000, Number(graceMs) || CALL_RECONNECT_GRACE_MS),
      reconnectingCount: list().length,
      records: list(),
    }),
  };
}

export function normalizeLocalCallResumeRecord(input = {}, {
  now = Date.now(),
  graceMs = CALL_RECONNECT_GRACE_MS,
} = {}) {
  const currentTime = Number(now);
  const boundedGraceMs = Math.max(1_000, Number(graceMs) || CALL_RECONNECT_GRACE_MS);
  const ownerUserId = normalizeId(input?.ownerUserId || input?.owner_user_id || "");
  const conversationId = normalizeId(input?.conversationId || input?.conversation_id || "");
  const kind = normalizeKind(input?.kind || input?.callKind || "");
  const lastActiveAt = Number(input?.lastActiveAt || input?.last_active_at || 0);
  const explicitExpiry = Number(input?.expiresAt || input?.expires_at || 0);
  const expiresAt = explicitExpiry > 0 ? explicitExpiry : lastActiveAt + boundedGraceMs;
  if (!ownerUserId || !conversationId || !kind || !lastActiveAt || !Number.isFinite(expiresAt) || expiresAt <= currentTime) {
    return null;
  }
  const reason = String(input?.reason || "active_call_marker").trim().slice(0, 100) || "active_call_marker";
  return {
    ownerUserId,
    conversationId,
    kind,
    callGeneration: normalizeId(input?.callGeneration || input?.call_generation || "") || null,
    otherUserId: normalizeId(input?.otherUserId || input?.other_user_id || "") || null,
    serverId: normalizeId(input?.serverId || input?.server_id || "") || null,
    channelId: normalizeId(input?.channelId || input?.channel_id || "") || null,
    lastActiveAt,
    expiresAt,
    reason,
    resumeMode: normalizeResumeMode(input?.resumeMode || input?.resume_mode || "", reason),
  };
}

export function reconcilePrivateCallResumeAuthority(recordInput = {}, authorityInput = {}, {
  now = Date.now(),
  graceMs = CALL_RECONNECT_GRACE_MS,
} = {}) {
  const currentTime = Number(now);
  const record = normalizeLocalCallResumeRecord(recordInput, {
    now: currentTime,
    graceMs,
  });
  const authority = Array.isArray(authorityInput) ? authorityInput[0] : authorityInput;
  if (!record || record.kind !== "private" || !record.callGeneration || !authority || typeof authority !== "object") {
    return null;
  }
  if (authority.resumable !== true || authority.expired === true || authority.ok === false) return null;
  const authorityGeneration = normalizeId(
    authority.callGeneration || authority.call_generation || "",
  );
  if (authorityGeneration && authorityGeneration !== record.callGeneration) return null;
  const authorityExpiresAt = Date.parse(String(
    authority.expiresAt || authority.expires_at || "",
  ));
  if (!Number.isFinite(authorityExpiresAt) || authorityExpiresAt <= currentTime) return null;

  // The database deadline is authoritative, while the durable renderer marker
  // is the upper bound that proves this specific client actually entered grace.
  // Taking the earlier value prevents cold boot from extending either lease.
  const expiresAt = Math.min(record.expiresAt, authorityExpiresAt);
  if (expiresAt <= currentTime) return null;
  return {
    ...record,
    callGeneration: authorityGeneration || record.callGeneration,
    expiresAt,
    resumeMode: "explicit_join",
    existingLogicalCall: true,
    existingCallGeneration: authorityGeneration || record.callGeneration,
    joinableExistingCall: true,
    localParticipantPresent: false,
    participantTransientlyReconnecting: false,
    participantGraceEligible: true,
  };
}

export function readLocalCallResumeRecord(storage, options = {}) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    return normalizeLocalCallResumeRecord(
      JSON.parse(storage.getItem(CALL_RECONNECT_RESUME_STORAGE_KEY) || "null") || {},
      options,
    );
  } catch (_) {
    return null;
  }
}

export function writeLocalCallResumeRecord(storage, input = {}, {
  now = Date.now(),
  graceMs = CALL_RECONNECT_GRACE_MS,
  active = false,
} = {}) {
  if (!storage || typeof storage.setItem !== "function") return null;
  const currentTime = Number(now);
  const requestedExpiry = Number(input?.expiresAt || input?.expires_at || 0);
  const boundedExpiry = currentTime + Math.max(1_000, Number(graceMs) || CALL_RECONNECT_GRACE_MS);
  const raw = {
    ...input,
    lastActiveAt: currentTime,
    expiresAt: active
      ? 0
      : (requestedExpiry > currentTime ? Math.min(requestedExpiry, boundedExpiry) : boundedExpiry),
  };
  const record = normalizeLocalCallResumeRecord(raw, {
    now: currentTime - 1,
    graceMs,
  });
  if (!record) return null;
  try { storage.setItem(CALL_RECONNECT_RESUME_STORAGE_KEY, JSON.stringify(record)); } catch (_) { return null; }
  return record;
}

export function clearLocalCallResumeRecord(storage) {
  if (!storage || typeof storage.removeItem !== "function") return false;
  try {
    storage.removeItem(CALL_RECONNECT_RESUME_STORAGE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}
