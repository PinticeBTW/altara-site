const DEFAULT_STORAGE_KEY = "altara.private_call.pending_terminal.v1";
const DEFAULT_PENDING_LIMIT = 8;
const DEFAULT_PENDING_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function safeReason(value) {
  return String(value || "accepted_call_ended")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .slice(0, 100) || "accepted_call_ended";
}

function intentKey(conversationId, callGeneration) {
  return `${normalizeId(conversationId)}|${normalizeId(callGeneration)}`;
}

function getErrorText(error) {
  return [error?.code, error?.name, error?.message, error?.details, error?.hint]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function classifyTerminalError(error) {
  const text = getErrorText(error);
  if (text.includes("private_call_stale_generation")) return { category: "stale_generation", terminal: true };
  if (text.includes("private_call_cancel_rejected")) return { category: "cancel_rejected", terminal: true };
  if (text.includes("private_call_not_allowed")) return { category: "not_allowed", terminal: true };
  if (text.includes("jwt") || text.includes("auth") || text.includes("session")) {
    return { category: "auth_unavailable", terminal: false };
  }
  if (text.includes("network") || text.includes("fetch") || text.includes("timeout") || text.includes("offline")) {
    return { category: "network_unavailable", terminal: false };
  }
  return { category: "terminal_signal_failed", terminal: false };
}

function cloneIntent(intent) {
  return {
    actorUserId: intent.actorUserId,
    conversationId: intent.conversationId,
    callGeneration: intent.callGeneration,
    otherUserId: intent.otherUserId,
    reason: intent.reason,
    createdAt: intent.createdAt,
    lastAttemptAt: intent.lastAttemptAt,
    attemptCount: intent.attemptCount,
    lastFailureCategory: intent.lastFailureCategory,
  };
}

export function createPrivateCallTerminalLifecycle({
  sendTerminal,
  getCurrentUserId = () => "",
  storage = null,
  storageKey = DEFAULT_STORAGE_KEY,
  now = () => Date.now(),
  pendingLimit = DEFAULT_PENDING_LIMIT,
  pendingMaxAgeMs = DEFAULT_PENDING_MAX_AGE_MS,
  onDiagnostic = null,
} = {}) {
  if (typeof sendTerminal !== "function") throw new Error("private_call_terminal_sender_required");

  const acceptedByConversation = new Map();
  const pendingByKey = new Map();
  const inFlightByKey = new Map();
  const history = [];
  let retryInFlight = null;

  const record = (event, details = {}) => {
    const entry = {
      at: Number(now()),
      event: String(event || "event").slice(0, 80),
      reason: details?.reason ? safeReason(details.reason) : null,
      outcome: String(details?.outcome || "").slice(0, 60) || null,
      errorCategory: String(details?.errorCategory || "").slice(0, 80) || null,
    };
    history.push(entry);
    if (history.length > 40) history.splice(0, history.length - 40);
    try { onDiagnostic?.(entry); } catch (_) {}
  };

  const persist = () => {
    if (!storage || typeof storage.setItem !== "function") return;
    try {
      const items = Array.from(pendingByKey.values())
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, Math.max(1, Number(pendingLimit) || DEFAULT_PENDING_LIMIT))
        .map(cloneIntent);
      if (items.length) storage.setItem(storageKey, JSON.stringify(items));
      else storage.removeItem?.(storageKey);
    } catch (_) {}
  };

  const load = () => {
    if (!storage || typeof storage.getItem !== "function") return;
    let parsed = [];
    try {
      parsed = JSON.parse(storage.getItem(storageKey) || "[]");
    } catch (_) {
      parsed = [];
    }
    const currentTime = Number(now());
    (Array.isArray(parsed) ? parsed : []).slice(0, Math.max(1, Number(pendingLimit) || DEFAULT_PENDING_LIMIT)).forEach((raw) => {
      const intent = {
        actorUserId: normalizeId(raw?.actorUserId),
        conversationId: normalizeId(raw?.conversationId),
        callGeneration: normalizeId(raw?.callGeneration),
        otherUserId: normalizeId(raw?.otherUserId),
        reason: safeReason(raw?.reason),
        createdAt: Number(raw?.createdAt || 0),
        lastAttemptAt: Number(raw?.lastAttemptAt || 0) || null,
        attemptCount: Math.max(0, Number(raw?.attemptCount || 0)),
        lastFailureCategory: String(raw?.lastFailureCategory || "").slice(0, 80) || null,
      };
      if (!intent.actorUserId || !intent.conversationId || !intent.callGeneration || !intent.otherUserId) return;
      if (!intent.createdAt || currentTime - intent.createdAt > pendingMaxAgeMs) return;
      pendingByKey.set(intentKey(intent.conversationId, intent.callGeneration), intent);
    });
    persist();
  };

  const markAccepted = ({
    conversationId,
    callGeneration,
    otherUserId,
    confirmed = true,
  } = {}) => {
    const actorUserId = normalizeId(getCurrentUserId());
    const context = {
      actorUserId,
      conversationId: normalizeId(conversationId),
      callGeneration: normalizeId(callGeneration),
      otherUserId: normalizeId(otherUserId),
      confirmed: confirmed !== false,
      markedAt: Number(now()),
    };
    if (!context.actorUserId || !context.conversationId || !context.callGeneration || !context.otherUserId) return false;
    if (context.actorUserId === context.otherUserId) return false;
    acceptedByConversation.set(context.conversationId, context);
    record("accepted_generation_marked", { outcome: context.confirmed ? "confirmed" : "outcome_unknown" });
    return true;
  };

  const getAcceptedContext = (conversationId) => {
    const context = acceptedByConversation.get(normalizeId(conversationId)) || null;
    return context ? { ...context } : null;
  };

  const isAcceptedGeneration = ({ conversationId, callGeneration } = {}) => {
    const context = acceptedByConversation.get(normalizeId(conversationId)) || null;
    return !!(context && context.callGeneration === normalizeId(callGeneration));
  };

  const queueAcceptedTermination = ({
    conversationId,
    callGeneration,
    otherUserId,
    reason = "accepted_call_ended",
    allowUnconfirmed = false,
  } = {}) => {
    const actorUserId = normalizeId(getCurrentUserId());
    const convId = normalizeId(conversationId);
    const generation = normalizeId(callGeneration);
    let context = acceptedByConversation.get(convId) || null;
    if ((!context || context.callGeneration !== generation) && allowUnconfirmed) {
      markAccepted({ conversationId: convId, callGeneration: generation, otherUserId, confirmed: false });
      context = acceptedByConversation.get(convId) || null;
    }
    if (!actorUserId || !context || context.actorUserId !== actorUserId || context.callGeneration !== generation) {
      record("termination_ignored", { reason, outcome: "stale_or_unaccepted" });
      return null;
    }
    const peerUserId = normalizeId(otherUserId || context.otherUserId);
    if (!peerUserId || peerUserId === actorUserId || peerUserId !== context.otherUserId) {
      record("termination_ignored", { reason, outcome: "peer_mismatch" });
      return null;
    }
    const key = intentKey(convId, generation);
    const existing = pendingByKey.get(key);
    if (existing) return existing;
    const intent = {
      actorUserId,
      conversationId: convId,
      callGeneration: generation,
      otherUserId: peerUserId,
      reason: safeReason(reason),
      createdAt: Number(now()),
      lastAttemptAt: null,
      attemptCount: 0,
      lastFailureCategory: null,
    };
    pendingByKey.set(key, intent);
    persist();
    record("termination_queued", { reason: intent.reason, outcome: "pending" });
    return intent;
  };

  const attemptIntent = (intent, { retry = false } = {}) => {
    const key = intentKey(intent?.conversationId, intent?.callGeneration);
    if (!key || !pendingByKey.has(key)) return Promise.resolve({ ok: false, ignored: true });
    if (inFlightByKey.has(key)) return inFlightByKey.get(key);
    if (!retry && Number(intent.attemptCount || 0) > 0) {
      return Promise.resolve({ ok: false, pending: true, deduplicated: true });
    }
    intent.attemptCount = Number(intent.attemptCount || 0) + 1;
    intent.lastAttemptAt = Number(now());
    persist();
    record("termination_attempted", { reason: intent.reason, outcome: retry ? "retry" : "initial" });
    const task = Promise.resolve().then(() => sendTerminal(cloneIntent(intent))).then((result) => {
      if (result?.error) throw result.error;
      pendingByKey.delete(key);
      const accepted = acceptedByConversation.get(intent.conversationId);
      if (accepted?.callGeneration === intent.callGeneration) acceptedByConversation.delete(intent.conversationId);
      persist();
      record("termination_confirmed", { reason: intent.reason, outcome: "success" });
      return { ok: true, result };
    }).catch((error) => {
      const failure = classifyTerminalError(error);
      intent.lastFailureCategory = failure.category;
      if (failure.terminal) {
        pendingByKey.delete(key);
        const accepted = acceptedByConversation.get(intent.conversationId);
        if (accepted?.callGeneration === intent.callGeneration) acceptedByConversation.delete(intent.conversationId);
      }
      persist();
      record("termination_failed", {
        reason: intent.reason,
        outcome: failure.terminal ? "retired" : "retained",
        errorCategory: failure.category,
      });
      return { ok: false, pending: !failure.terminal, errorCategory: failure.category };
    }).finally(() => {
      if (inFlightByKey.get(key) === task) inFlightByKey.delete(key);
    });
    inFlightByKey.set(key, task);
    return task;
  };

  const terminateAcceptedPrivateCall = (params = {}) => {
    const intent = queueAcceptedTermination(params);
    if (!intent) return Promise.resolve({ ok: false, ignored: true });
    return attemptIntent(intent, { retry: false });
  };

  const retryPending = ({ reason = "authenticated_recovery" } = {}) => {
    if (retryInFlight) return retryInFlight;
    const actorUserId = normalizeId(getCurrentUserId());
    if (!actorUserId) return Promise.resolve({ attempted: 0, completed: 0 });
    const candidates = Array.from(pendingByKey.values())
      .filter((intent) => intent.actorUserId === actorUserId)
      .slice(0, Math.max(1, Number(pendingLimit) || DEFAULT_PENDING_LIMIT));
    const task = (async () => {
      let completed = 0;
      for (const intent of candidates) {
        const result = await attemptIntent(intent, { retry: true });
        if (result?.ok) completed += 1;
      }
      record("termination_recovery_completed", { reason, outcome: `${completed}/${candidates.length}` });
      return { attempted: candidates.length, completed };
    })().finally(() => {
      if (retryInFlight === task) retryInFlight = null;
    });
    retryInFlight = task;
    return task;
  };

  const confirmTerminal = ({ conversationId, callGeneration } = {}) => {
    const convId = normalizeId(conversationId);
    const generation = normalizeId(callGeneration);
    if (!convId || !generation) return false;
    const key = intentKey(convId, generation);
    const hadPending = pendingByKey.delete(key);
    const accepted = acceptedByConversation.get(convId);
    if (accepted?.callGeneration === generation) acceptedByConversation.delete(convId);
    persist();
    record("remote_terminal_confirmed", { outcome: hadPending ? "pending_cleared" : "accepted_cleared" });
    return !!(hadPending || accepted?.callGeneration === generation);
  };

  const getSnapshot = () => ({
    acceptedGenerationPresent: acceptedByConversation.size > 0,
    acceptedConversationCount: acceptedByConversation.size,
    pendingTerminalCount: pendingByKey.size,
    terminalInFlightCount: inFlightByKey.size,
    retryInFlight: !!retryInFlight,
    pending: Array.from(pendingByKey.values()).map((intent) => ({
      callGenerationPresent: !!intent.callGeneration,
      reason: intent.reason,
      createdAt: intent.createdAt,
      lastAttemptAt: intent.lastAttemptAt,
      attemptCount: intent.attemptCount,
      lastFailureCategory: intent.lastFailureCategory,
    })),
    recent: history.slice(-20).map((entry) => ({ ...entry })),
  });

  load();

  return {
    markAccepted,
    getAcceptedContext,
    isAcceptedGeneration,
    queueAcceptedTermination,
    terminateAcceptedPrivateCall,
    retryPending,
    confirmTerminal,
    getSnapshot,
  };
}

export const PRIVATE_CALL_TERMINAL_STORAGE_KEY = DEFAULT_STORAGE_KEY;
