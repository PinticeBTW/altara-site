const PRIVATE_CALL_INBOX_EVENT = "private_call_signal";
const PRIVATE_CALL_INBOX_CONTRACT_VERSION = 1;
const PRIVATE_CALL_TERMINAL_EVENTS = new Set([
  "private_call_cancel",
  "private_call_decline",
  "private_call_missed",
]);
const PRIVATE_CALL_EVENTS = new Set([
  "private_call_invite",
  "private_call_accept",
  "private_call_reconnecting",
  "private_call_reconnect_restored",
  ...PRIVATE_CALL_TERMINAL_EVENTS,
]);
const TERMINAL_CHANNEL_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

function normalizeId(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeTimestamp(value = "") {
  const text = String(value || "").trim();
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? { text: new Date(timestamp).toISOString(), timestamp } : null;
}

export function getPrivateCallInboxTopic(userId = "") {
  const uid = normalizeId(userId);
  return uid ? `altara:user:${uid}:call-events` : "";
}

export function normalizePrivateCallInboxEvent(input = {}, {
  currentUserId = "",
  now = Date.now(),
} = {}) {
  const source = input?.payload && typeof input.payload === "object" ? input.payload : input;
  const contractVersion = Number(source?.contractVersion || source?.contract_version || 0);
  const eventType = String(source?.eventType || source?.event_type || "").trim().toLowerCase();
  const conversationId = normalizeId(source?.conversationId || source?.conversation_id || "");
  const callGeneration = normalizeId(source?.callGeneration || source?.call_generation || "");
  const callerUserId = normalizeId(source?.callerUserId || source?.caller_user_id || "");
  const recipientUserId = normalizeId(source?.recipientUserId || source?.recipient_user_id || "");
  const senderUserId = normalizeId(source?.senderUserId || source?.sender_user_id || "");
  const targetUserId = normalizeId(source?.targetUserId || source?.target_user_id || "");
  const currentUid = normalizeId(currentUserId);
  const created = normalizeTimestamp(source?.createdAt || source?.created_at || "");
  const expires = normalizeTimestamp(source?.expiresAt || source?.expires_at || "");
  const disconnectedUserId = normalizeId(source?.disconnectedUserId || source?.disconnected_user_id || "");
  const restoredUserId = normalizeId(source?.restoredUserId || source?.restored_user_id || "");

  if (contractVersion !== PRIVATE_CALL_INBOX_CONTRACT_VERSION) return null;
  if (!PRIVATE_CALL_EVENTS.has(eventType)) return null;
  if (!conversationId || !callGeneration || !callerUserId || !recipientUserId || !senderUserId || !targetUserId) return null;
  if (!currentUid || targetUserId !== currentUid || senderUserId === currentUid) return null;
  if (!created || !expires) return null;
  if (eventType === "private_call_invite" && expires.timestamp <= Number(now || Date.now())) return null;
  if (eventType === "private_call_reconnecting" && !disconnectedUserId) return null;
  if (eventType === "private_call_reconnect_restored" && !restoredUserId) return null;

  return Object.freeze({
    contractVersion,
    eventType,
    conversationId,
    callGeneration,
    callerUserId,
    recipientUserId,
    senderUserId,
    targetUserId,
    createdAt: created.text,
    createdAtMs: created.timestamp,
    expiresAt: expires.text,
    expiresAtMs: expires.timestamp,
    disconnectedUserId: disconnectedUserId || null,
    restoredUserId: restoredUserId || null,
    callerDisplayName: String(source?.callerDisplayName || source?.caller_display_name || "").trim().slice(0, 160),
    callerAvatarUrl: String(source?.callerAvatarUrl || source?.caller_avatar_url || "").trim().slice(0, 2048),
    senderDisplayName: String(source?.senderDisplayName || source?.sender_display_name || "").trim().slice(0, 160),
    senderAvatarUrl: String(source?.senderAvatarUrl || source?.sender_avatar_url || "").trim().slice(0, 2048),
    trustedOrigin: "database_private_call_rpc_v1",
  });
}

export function createPrivateCallInboxEventLedger({
  now = () => Date.now(),
  retentionMs = 10 * 60_000,
} = {}) {
  const activeByConversation = new Map();
  const terminalByGeneration = new Map();

  function prune() {
    const cutoff = Number(now()) - Math.max(60_000, Number(retentionMs || 0));
    for (const [generation, terminalAt] of terminalByGeneration.entries()) {
      if (Number(terminalAt || 0) < cutoff) terminalByGeneration.delete(generation);
    }
    for (const [conversationId, entry] of activeByConversation.entries()) {
      if (Number(entry?.expiresAtMs || 0) < cutoff) activeByConversation.delete(conversationId);
    }
  }

  function apply(event) {
    prune();
    if (!event?.conversationId || !event?.callGeneration || !PRIVATE_CALL_EVENTS.has(event.eventType)) {
      return { accepted: false, reason: "invalid_event" };
    }
    if (terminalByGeneration.has(event.callGeneration)) {
      return { accepted: false, reason: "terminal_generation" };
    }

    const current = activeByConversation.get(event.conversationId) || null;
    if (event.eventType === "private_call_invite") {
      if (current?.callGeneration === event.callGeneration) {
        return { accepted: false, reason: "duplicate_event" };
      }
      if (current && Number(event.createdAtMs || 0) <= Number(current.createdAtMs || 0)) {
        return { accepted: false, reason: "stale_generation" };
      }
      activeByConversation.set(event.conversationId, {
        callGeneration: event.callGeneration,
        createdAtMs: Number(event.createdAtMs || now()),
        expiresAtMs: Number(event.expiresAtMs || 0),
        state: "ringing",
      });
      return { accepted: true, reason: "invite" };
    }

    if (current && current.callGeneration !== event.callGeneration) {
      return { accepted: false, reason: "stale_generation" };
    }
    if (event.eventType === "private_call_accept") {
      activeByConversation.set(event.conversationId, {
        callGeneration: event.callGeneration,
        createdAtMs: Number(current?.createdAtMs || event.createdAtMs || now()),
        expiresAtMs: Number(event.expiresAtMs || current?.expiresAtMs || 0),
        state: "accepted",
      });
      return { accepted: true, reason: "accepted" };
    }

    if (event.eventType === "private_call_reconnecting") {
      activeByConversation.set(event.conversationId, {
        callGeneration: event.callGeneration,
        createdAtMs: Number(current?.createdAtMs || event.createdAtMs || now()),
        expiresAtMs: Number(event.expiresAtMs || current?.expiresAtMs || 0),
        state: "reconnecting",
      });
      return { accepted: true, reason: "reconnecting" };
    }

    if (event.eventType === "private_call_reconnect_restored") {
      activeByConversation.set(event.conversationId, {
        callGeneration: event.callGeneration,
        createdAtMs: Number(current?.createdAtMs || event.createdAtMs || now()),
        expiresAtMs: Number(event.expiresAtMs || current?.expiresAtMs || 0),
        state: "accepted",
      });
      return { accepted: true, reason: "reconnect_restored" };
    }

    terminalByGeneration.set(event.callGeneration, Number(now()));
    if (current?.callGeneration === event.callGeneration) activeByConversation.delete(event.conversationId);
    return { accepted: true, reason: "terminal" };
  }

  function rememberLocalGeneration(conversationId, callGeneration, details = {}) {
    const convId = normalizeId(conversationId);
    const generation = normalizeId(callGeneration);
    if (!convId || !generation) return false;
    activeByConversation.set(convId, {
      callGeneration: generation,
      createdAtMs: Number(details.createdAtMs || now()),
      expiresAtMs: Number(details.expiresAtMs || (Number(now()) + 6 * 60 * 60_000)),
      state: String(details.state || "local").trim().toLowerCase() || "local",
    });
    return true;
  }

  function clear({ terminal = false } = {}) {
    activeByConversation.clear();
    if (terminal) terminalByGeneration.clear();
  }

  return {
    apply,
    clear,
    rememberLocalGeneration,
    getSnapshot() {
      prune();
      return {
        activeConversationCount: activeByConversation.size,
        terminalGenerationCount: terminalByGeneration.size,
      };
    },
  };
}

export function createPrivateCallInboxController({
  supabaseClient,
  getCurrentUserId,
  getSession,
  applyRealtimeAuth,
  reconcilePendingInvites,
  onTrustedEvent,
  onStatus,
  additionalBroadcastHandlers = {},
  reconcileAdditionalEvents = null,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (timer) => clearTimeout(timer),
  retryDelayMs = 1200,
  now = () => Date.now(),
} = {}) {
  if (!supabaseClient || typeof supabaseClient.channel !== "function") {
    throw new Error("privateCallInbox: supabase client is required");
  }

  const ledger = createPrivateCallInboxEventLedger({ now });
  let channel = null;
  let userId = "";
  let status = "IDLE";
  let generation = 0;
  let startPromise = null;
  let retryTimer = null;
  let stopped = false;
  let desired = false;
  let authenticated = false;
  let desiredReason = null;
  let suppressedReason = "not_started";
  let lastStartReason = null;
  let lastStartRequestedAt = null;
  let lastStartFailureCategory = null;
  let subscribeAttempt = 0;
  let lastSubscribedAt = null;
  let lastEventReceivedAt = null;
  let lastEventUiDispatchedAt = null;
  let lastRejectedReason = null;
  let lastReconcileStartedAt = null;
  let lastReconcileCompletedAt = null;
  let lastReconcileCount = 0;

  function emitStatus(nextStatus, details = {}) {
    status = String(nextStatus || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    if (typeof onStatus === "function") onStatus(status, { ...details, generation });
  }

  function dispatch(rawEvent, source = "live") {
    const receivedAt = Number(now());
    lastEventReceivedAt = receivedAt;
    const event = normalizePrivateCallInboxEvent(rawEvent, {
      currentUserId: userId || getCurrentUserId?.(),
      now: receivedAt,
    });
    if (!event) {
      lastRejectedReason = "invalid_or_expired_event";
      return false;
    }
    const decision = ledger.apply(event);
    if (!decision.accepted) {
      lastRejectedReason = decision.reason;
      return false;
    }
    lastRejectedReason = null;
    if (typeof onTrustedEvent === "function") {
      onTrustedEvent(event, { source, receivedAt, dispatchedAt: Number(now()) });
    }
    lastEventUiDispatchedAt = Number(now());
    return true;
  }

  async function reconcile(expectedGeneration) {
    if (typeof reconcilePendingInvites !== "function") return;
    lastReconcileStartedAt = Number(now());
    try {
      const events = await reconcilePendingInvites();
      if (expectedGeneration !== generation || stopped) return;
      const rows = Array.isArray(events) ? events : [];
      lastReconcileCount = rows.length;
      rows.forEach((event) => dispatch(event, "reconcile"));
    } finally {
      if (expectedGeneration === generation) lastReconcileCompletedAt = Number(now());
    }
  }

  function scheduleRetry(reason = "terminal") {
    if (retryTimer || stopped || !desired || !normalizeId(getCurrentUserId?.())) return;
    retryTimer = schedule(() => {
      retryTimer = null;
      void start({ force: true, reason: `retry:${reason}` }).catch(() => {});
    }, Math.max(750, Number(retryDelayMs || 1200)));
  }

  async function retireCurrent({ reason = "retire", preserveLedger = true } = {}) {
    const oldChannel = channel;
    channel = null;
    userId = "";
    generation += 1;
    if (!preserveLedger) ledger.clear({ terminal: true });
    if (oldChannel) {
      try { await Promise.resolve(supabaseClient.removeChannel(oldChannel)); } catch (_) {}
    }
    emitStatus("IDLE", { reason });
  }

  async function start({ force = false, reason = "start" } = {}) {
    const normalizedReason = String(reason || "start").trim() || "start";
    lastStartReason = normalizedReason;
    lastStartRequestedAt = Number(now());
    if (startPromise) return startPromise;
    const task = (async () => {
      stopped = false;
      const currentUserId = normalizeId(getCurrentUserId?.());
      if (!currentUserId) {
        desired = false;
        authenticated = false;
        desiredReason = null;
        suppressedReason = "missing_current_user";
        await retireCurrent({ reason: `${normalizedReason}:no-user`, preserveLedger: false });
        return null;
      }
      desired = true;
      desiredReason = normalizedReason;
      suppressedReason = null;
      const session = typeof getSession === "function" ? await getSession() : null;
      const sessionUserId = normalizeId(session?.user?.id || currentUserId);
      const accessToken = String(session?.access_token || "").trim();
      if (sessionUserId !== currentUserId || !accessToken) {
        desired = false;
        authenticated = false;
        desiredReason = null;
        suppressedReason = "missing_or_mismatched_authenticated_session";
        await retireCurrent({ reason: `${normalizedReason}:no-auth`, preserveLedger: false });
        return null;
      }
      authenticated = true;
      lastStartFailureCategory = null;
      if (typeof applyRealtimeAuth === "function") await applyRealtimeAuth(accessToken);

      const topic = getPrivateCallInboxTopic(currentUserId);
      if (!force && channel && userId === currentUserId && ["JOINING", "SUBSCRIBED"].includes(status)) {
        return channel;
      }
      await retireCurrent({ reason: `${normalizedReason}:replace`, preserveLedger: true });
      const expectedGeneration = generation;
      userId = currentUserId;
      subscribeAttempt += 1;
      emitStatus("JOINING", { reason: normalizedReason });
      const nextChannel = supabaseClient
        .channel(topic, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: PRIVATE_CALL_INBOX_EVENT }, (message = {}) => {
          if (channel !== nextChannel || generation !== expectedGeneration || stopped) return;
          dispatch(message?.payload || message, "live");
        });
      channel = nextChannel;
      // Group conversations share the authenticated call inbox, not a second
      // ringtone/subscription stack. The direct-call ledger remains unchanged.
      for (const [event, handler] of Object.entries(additionalBroadcastHandlers)) {
        if (typeof handler !== "function" || event === PRIVATE_CALL_INBOX_EVENT) continue;
        nextChannel.on("broadcast", { event }, (message = {}) => {
          const isCurrent = () => channel === nextChannel && generation === expectedGeneration && !stopped
            && normalizeId(getCurrentUserId?.()) === currentUserId;
          if (!isCurrent()) return;
          try {
            void Promise.resolve(handler(message?.payload || message, { isCurrent, userId: currentUserId })).catch(() => {});
          } catch (_) {}
        });
      }
      nextChannel.subscribe((nextStatus, error = null) => {
        if (channel !== nextChannel || generation !== expectedGeneration || stopped) return;
        const normalizedStatus = String(nextStatus || "UNKNOWN").trim().toUpperCase();
        emitStatus(normalizedStatus, {
          reason: normalizedReason,
          errorCategory: String(error?.code || error?.name || "").slice(0, 80) || null,
        });
        if (normalizedStatus === "SUBSCRIBED") {
          lastSubscribedAt = Number(now());
          if (retryTimer) {
            cancelSchedule(retryTimer);
            retryTimer = null;
          }
          void reconcile(expectedGeneration).catch(() => {});
          if (typeof reconcileAdditionalEvents === "function") {
            const isCurrent = () => channel === nextChannel && generation === expectedGeneration && !stopped
              && normalizeId(getCurrentUserId?.()) === currentUserId;
            if (isCurrent()) {
              try {
                void Promise.resolve(reconcileAdditionalEvents({ isCurrent, userId: currentUserId })).catch(() => {});
              } catch (_) {}
            }
          }
          return;
        }
        if (!TERMINAL_CHANNEL_STATUSES.has(normalizedStatus)) return;
        channel = null;
        void Promise.resolve(supabaseClient.removeChannel(nextChannel)).catch(() => {});
        scheduleRetry(normalizedStatus);
      });
      return nextChannel;
    })();
    startPromise = task;
    try {
      return await task;
    } catch (error) {
      lastStartFailureCategory = String(error?.code || error?.name || "start_failed").slice(0, 80);
      scheduleRetry("start-error");
      throw error;
    } finally {
      if (startPromise === task) startPromise = null;
    }
  }

  async function stop({ reason = "stop", clearLedger = true } = {}) {
    stopped = true;
    desired = false;
    authenticated = false;
    desiredReason = null;
    suppressedReason = String(reason || "stop").trim() || "stop";
    if (retryTimer) {
      cancelSchedule(retryTimer);
      retryTimer = null;
    }
    startPromise = null;
    await retireCurrent({ reason, preserveLedger: !clearLedger });
  }

  return {
    start,
    stop,
    dispatch,
    ledger,
    getDiagnostics() {
      const barrierRecord = channel?.__altaraStartupBarrierRecord || null;
      return {
        topicFamily: "user_private_call_inbox",
        authenticated,
        currentUserIdPresent: !!normalizeId(getCurrentUserId?.()),
        backendCapabilityGateUsed: false,
        desiredReason,
        suppressedReason,
        desiredSubscription: desired && !stopped,
        nativeChannelExists: !!channel,
        nativeSubscriptionState: String(
          barrierRecord?.subscribeStatus || channel?.state || status || "IDLE"
        ).trim().toUpperCase(),
        subscribeAttempt,
        subscriptionGeneration: generation,
        lastStartReason,
        lastStartRequestedAt,
        lastStartFailureCategory,
        lastSubscribedAt,
        retryScheduled: !!retryTimer,
        lastEventReceivedAt,
        lastEventUiDispatchedAt,
        lastEventToUiMs: lastEventReceivedAt && lastEventUiDispatchedAt
          ? Math.max(0, lastEventUiDispatchedAt - lastEventReceivedAt)
          : null,
        lastRejectedReason,
        lastReconcileStartedAt,
        lastReconcileCompletedAt,
        lastReconcileCount,
        ...ledger.getSnapshot(),
      };
    },
  };
}

export {
  PRIVATE_CALL_INBOX_CONTRACT_VERSION,
  PRIVATE_CALL_INBOX_EVENT,
  PRIVATE_CALL_EVENTS,
};
