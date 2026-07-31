export const REACTION_EVENT_STREAM_MARKER = "server-reaction-events-realtime-v1";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REACTION_EVENT_OPERATIONS = new Set(["added", "removed"]);

const normalizeId = (value) => String(value || "").trim().toLowerCase();

export function normalizeReactionEventRow(row, expectedConversationId) {
  if (!row || typeof row !== "object") return null;

  const id = normalizeId(row.id);
  const conversationId = normalizeId(row.conversation_id);
  const messageId = normalizeId(row.message_id);
  const operation = String(row.operation || "").trim().toLowerCase();
  const expected = normalizeId(expectedConversationId);

  if (!UUID_RE.test(id) || !UUID_RE.test(conversationId) || !UUID_RE.test(messageId)) {
    return null;
  }
  if (!expected || conversationId !== expected) return null;
  if (!REACTION_EVENT_OPERATIONS.has(operation)) return null;

  return { id, conversationId, messageId, operation };
}

export function createReactionEventRefreshQueue({
  onRefresh,
  onError = () => {},
  debounceMs = 90,
  maxSeenEvents = 512,
  seenEventTtlMs = 5 * 60 * 1000,
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
} = {}) {
  if (typeof onRefresh !== "function") {
    throw new TypeError("onRefresh must be a function");
  }

  const seenEvents = new Map();
  const pendingMessageIds = new Set();
  let activeConversationId = "";
  let flushTimer = null;
  let refreshInFlight = null;
  let generation = 0;

  const pruneSeenEvents = () => {
    const cutoff = Number(now()) - Math.max(1, Number(seenEventTtlMs) || 1);
    for (const [eventId, seenAt] of seenEvents) {
      if (Number(seenAt) >= cutoff) break;
      seenEvents.delete(eventId);
    }
    const limit = Math.max(1, Number(maxSeenEvents) || 1);
    while (seenEvents.size > limit) {
      const oldest = seenEvents.keys().next().value;
      if (!oldest) break;
      seenEvents.delete(oldest);
    }
  };

  const cancelScheduledFlush = () => {
    if (flushTimer == null) return;
    clearTimer(flushTimer);
    flushTimer = null;
  };

  const scheduleFlush = () => {
    if (flushTimer != null || refreshInFlight || !pendingMessageIds.size) return;
    flushTimer = setTimer(() => {
      flushTimer = null;
      void flush().catch((error) => onError(error));
    }, Math.max(0, Number(debounceMs) || 0));
  };

  const flush = async () => {
    if (refreshInFlight) return refreshInFlight;
    if (!activeConversationId || !pendingMessageIds.size) return false;

    const conversationId = activeConversationId;
    const messageIds = Array.from(pendingMessageIds);
    const runGeneration = generation;
    pendingMessageIds.clear();

    const run = Promise.resolve()
      .then(() => onRefresh(conversationId, messageIds))
      .then((result) => result !== false)
      .catch((error) => {
        onError(error);
        return false;
      })
      .finally(() => {
        if (refreshInFlight === run) refreshInFlight = null;
        if (generation === runGeneration && pendingMessageIds.size) scheduleFlush();
      });

    refreshInFlight = run;
    return run;
  };

  const reset = (nextConversationId = "") => {
    generation += 1;
    cancelScheduledFlush();
    activeConversationId = normalizeId(nextConversationId);
    seenEvents.clear();
    pendingMessageIds.clear();
  };

  return {
    setConversation(conversationId) {
      const next = normalizeId(conversationId);
      if (next === activeConversationId) return false;
      reset(next);
      return true;
    },

    enqueue(row) {
      const event = normalizeReactionEventRow(row, activeConversationId);
      if (!event) return false;

      pruneSeenEvents();
      if (seenEvents.has(event.id)) return false;
      seenEvents.set(event.id, Number(now()));
      pruneSeenEvents();
      pendingMessageIds.add(event.messageId);
      scheduleFlush();
      return true;
    },

    flushNow() {
      cancelScheduledFlush();
      return flush();
    },

    reset() {
      reset("");
    },

    snapshot() {
      pruneSeenEvents();
      return {
        marker: REACTION_EVENT_STREAM_MARKER,
        activeConversationId,
        seenEventCount: seenEvents.size,
        pendingMessageCount: pendingMessageIds.size,
        refreshInFlight: !!refreshInFlight,
      };
    },
  };
}
