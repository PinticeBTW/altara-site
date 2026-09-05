const TERMINAL_REASONS = new Set([
  "declined",
  "missed",
  "cancelled",
  "failed",
  "ended",
]);

function normalizeId(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeReason(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function buildKey(conversationId = "", callGeneration = "") {
  const conversation = normalizeId(conversationId);
  const generation = normalizeId(callGeneration);
  return conversation && generation ? `${conversation}:${generation}` : "";
}

export function shouldApplyPrivateCallTerminalTransition({
  conversationId = "",
  callGeneration = "",
  currentConversationId = "",
  currentCallGeneration = "",
  currentTerminalReason = "",
  incomingTerminalReason = "",
} = {}) {
  const incomingKey = buildKey(conversationId, callGeneration);
  const currentKey = buildKey(currentConversationId, currentCallGeneration);
  const incomingReason = normalizeReason(incomingTerminalReason);
  const currentReason = normalizeReason(currentTerminalReason);
  if (!incomingKey || incomingKey !== currentKey) return { apply: false, reason: "stale_session" };
  if (!TERMINAL_REASONS.has(incomingReason)) return { apply: false, reason: "invalid_terminal" };
  if (currentReason) {
    return {
      apply: false,
      reason: currentReason === incomingReason ? "duplicate_terminal" : "terminal_already_chosen",
    };
  }
  return { apply: true, reason: incomingReason };
}

export function createPrivateCallDeclineLifecycle({
  now = () => Date.now(),
  onDiagnostic = null,
  maxTerminalEntries = 64,
} = {}) {
  let serial = 0;
  const activeByKey = new Map();
  const terminalByKey = new Map();

  function emit(event, operation = null, details = {}) {
    if (typeof onDiagnostic !== "function") return;
    onDiagnostic({
      event: String(event || "decline_event"),
      operationId: operation?.id || null,
      conversationId: operation?.conversationId || normalizeId(details.conversationId || "") || null,
      callGeneration: operation?.callGeneration || normalizeId(details.callGeneration || "") || null,
      source: operation?.source || String(details.source || "").trim() || null,
      terminalReason: "declined",
      ...details,
    });
  }

  function rememberTerminal(key, completedAt) {
    terminalByKey.set(key, Number(completedAt || now()));
    while (terminalByKey.size > Math.max(8, Number(maxTerminalEntries || 64))) {
      terminalByKey.delete(terminalByKey.keys().next().value);
    }
  }

  function request(context = {}, {
    dismissLocal = null,
    submitAuthoritative = null,
    onSettled = null,
  } = {}) {
    const conversationId = normalizeId(context.conversationId || "");
    const callGeneration = normalizeId(context.callGeneration || "");
    const callerUserId = normalizeId(context.callerUserId || "");
    const calleeUserId = normalizeId(context.calleeUserId || "");
    const key = buildKey(conversationId, callGeneration);
    if (!key || !callerUserId || !calleeUserId || callerUserId === calleeUserId) {
      emit("decline_rejected", null, {
        conversationId,
        callGeneration,
        source: context.source,
        reason: "invalid_context",
      });
      return { started: false, operation: null, promise: Promise.resolve(false), reason: "invalid_context" };
    }
    const existing = activeByKey.get(key);
    if (existing) {
      emit("decline_deduplicated", existing, { reason: "single_flight" });
      return { started: false, operation: existing, promise: existing.promise, reason: "single_flight" };
    }
    if (terminalByKey.has(key)) {
      emit("decline_deduplicated", null, {
        conversationId,
        callGeneration,
        source: context.source,
        reason: "terminal_generation",
      });
      return { started: false, operation: null, promise: Promise.resolve(false), reason: "terminal_generation" };
    }

    const operation = {
      id: ++serial,
      key,
      conversationId,
      callGeneration,
      callerUserId,
      calleeUserId,
      source: String(context.source || "incoming-decline").trim() || "incoming-decline",
      runtime: String(context.runtime || "unknown").trim().toLowerCase() || "unknown",
      clickedAt: Number(context.clickedAt || now()),
      startedAt: Number(now()),
      localDismissedAt: null,
      submittedAt: null,
      settledAt: null,
      result: "pending",
      promise: null,
    };
    activeByKey.set(key, operation);
    emit("click_received", operation);

    try {
      dismissLocal?.(operation);
      operation.localDismissedAt = Number(now());
      emit("local_ui_dismissed", operation, {
        clickToLocalDismissMs: Math.max(0, operation.localDismissedAt - operation.clickedAt),
      });
    } catch (error) {
      emit("local_ui_dismiss_failed", operation, {
        errorName: String(error?.name || "Error").slice(0, 80),
      });
    }

    let submission;
    try {
      submission = submitAuthoritative?.(operation);
      operation.submittedAt = Number(now());
      emit("authoritative_decline_submitted", operation, {
        clickToSubmitMs: Math.max(0, operation.submittedAt - operation.clickedAt),
      });
    } catch (error) {
      submission = Promise.reject(error);
    }

    const task = Promise.resolve(submission).then((result) => {
      if (result?.error) throw result.error;
      operation.result = result?.cancelled ? "cancelled" : "declined";
      return result?.cancelled ? false : true;
    }).catch((error) => {
      operation.result = "failed";
      emit("authoritative_decline_failed", operation, {
        errorName: String(error?.name || "Error").slice(0, 80),
        errorCode: String(error?.code || "").slice(0, 80) || null,
      });
      return false;
    }).finally(() => {
      operation.settledAt = Number(now());
      rememberTerminal(key, operation.settledAt);
      if (activeByKey.get(key) === operation) activeByKey.delete(key);
      emit("authoritative_decline_settled", operation, {
        clickToSettledMs: Math.max(0, operation.settledAt - operation.clickedAt),
        result: operation.result,
      });
      try { onSettled?.(operation); } catch (_) {}
    });
    operation.promise = task;
    return { started: true, operation, promise: task, reason: "started" };
  }

  function acceptRemoteDecline(event = {}, current = {}) {
    const decision = shouldApplyPrivateCallTerminalTransition({
      conversationId: event.conversationId,
      callGeneration: event.callGeneration,
      currentConversationId: current.conversationId,
      currentCallGeneration: current.callGeneration,
      currentTerminalReason: current.terminalReason,
      incomingTerminalReason: "declined",
    });
    const key = buildKey(event.conversationId, event.callGeneration);
    if (!decision.apply) {
      emit("stale_event_ignored", null, {
        conversationId: event.conversationId,
        callGeneration: event.callGeneration,
        source: event.source || "trusted-inbox",
        reason: decision.reason,
      });
      return decision;
    }
    if (terminalByKey.has(key)) {
      emit("stale_event_ignored", null, {
        conversationId: event.conversationId,
        callGeneration: event.callGeneration,
        source: event.source || "trusted-inbox",
        reason: "duplicate_terminal",
      });
      return { apply: false, reason: "duplicate_terminal" };
    }
    rememberTerminal(key, Number(now()));
    emit("caller_event_admitted", null, {
      conversationId: event.conversationId,
      callGeneration: event.callGeneration,
      source: event.source || "trusted-inbox",
      reason: "declined",
    });
    return { apply: true, reason: "declined" };
  }

  return {
    request,
    acceptRemoteDecline,
    getSnapshot() {
      return {
        activeCount: activeByKey.size,
        terminalCount: terminalByKey.size,
        active: Array.from(activeByKey.values(), (operation) => ({
          id: operation.id,
          conversationId: operation.conversationId,
          callGeneration: operation.callGeneration,
          result: operation.result,
        })),
      };
    },
  };
}
