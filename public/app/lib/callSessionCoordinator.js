const normalize = (value) => String(value || "").trim();

function normalizeSession(value = null) {
  if (!value || typeof value !== "object") return null;
  const kind = normalize(value.kind).toLowerCase();
  const id = normalize(value.id || value.sessionId);
  if (!kind || !id) return null;
  return Object.freeze({
    ...value,
    kind,
    id,
    sessionId: normalize(value.sessionId || id),
    conversationId: normalize(value.conversationId),
    serverId: normalize(value.serverId),
    channelId: normalize(value.channelId),
    generation: normalize(value.generation),
    state: normalize(value.state || "connected").toLowerCase(),
  });
}

function sameSession(left, right) {
  const a = normalizeSession(left);
  const b = normalizeSession(right);
  return !!(a && b && a.kind === b.kind && a.id === b.id);
}

export function createCallSessionCoordinator({
  readActiveSession = () => null,
  leaveActiveSession = async () => true,
  now = () => Date.now(),
  onChange = () => {},
} = {}) {
  let switching = false;
  let pendingTarget = null;
  let pendingPromise = null;
  let pendingTargetKey = "";
  let pendingRequest = null;
  let lastTransition = null;
  let duplicateAttemptsSuppressed = 0;
  const history = [];

  const push = (phase, details = {}) => {
    const entry = Object.freeze({ at: now(), phase, ...details });
    history.push(entry);
    while (history.length > 120) history.shift();
    try { onChange(entry); } catch (_) {}
    return entry;
  };

  const snapshot = () => ({
    activeSession: normalizeSession(readActiveSession()),
    switching,
    transitionState: switching ? "SWITCHING_CALL" : null,
    pendingTarget: pendingTarget ? { ...pendingTarget } : null,
    lastTransition: lastTransition ? { ...lastTransition } : null,
    duplicateAttemptsSuppressed,
    history: history.slice(),
  });

  const requestTransition = ({
    target,
    reason = "user_action",
    preflight = async () => ({ ok: true }),
    enterTarget,
    bringToFront = null,
  } = {}) => {
    const requestedTarget = normalizeSession(target);
    if (!requestedTarget || typeof enterTarget !== "function") return Promise.resolve(false);
    const targetKey = `${requestedTarget.kind}:${requestedTarget.id}`;
    if (pendingPromise) {
      duplicateAttemptsSuppressed += 1;
      push("duplicate_attempt_suppressed", { target: targetKey, pendingTarget: pendingTargetKey });
      return pendingTargetKey === targetKey ? pendingPromise : Promise.resolve(false);
    }

    const activeAtRequest = normalizeSession(readActiveSession());
    if (sameSession(activeAtRequest, requestedTarget)) {
      push("already_active", { target: targetKey, reason });
      return Promise.resolve(typeof bringToFront === "function" ? bringToFront(activeAtRequest) : true)
        .then((result) => result !== false);
    }

    const startedAt = now();
    const requestState = {
      targetKey,
      cancelled: false,
      cancelReason: "",
      promise: null,
    };
    switching = true;
    pendingTarget = requestedTarget;
    pendingTargetKey = targetKey;
    pendingRequest = requestState;
    push("switch_requested", { from: activeAtRequest?.id || null, to: requestedTarget.id, reason });

    let operation = null;
    // Start the transition in a microtask so pendingPromise is installed before
    // user-supplied preflight/enter callbacks can throw or re-enter synchronously.
    operation = Promise.resolve().then(async () => {
      let resolvedTarget = requestedTarget;
      let preflightResult = null;
      const throwIfCancelled = () => {
        if (!requestState.cancelled) return;
        throw Object.assign(new Error("call_session_transition_cancelled"), {
          code: "call_session_transition_cancelled",
          reason: requestState.cancelReason || "cancelled",
        });
      };
      try {
        throwIfCancelled();
        push("target_preflight_started", { target: targetKey });
        preflightResult = await preflight({ activeSession: activeAtRequest, target: requestedTarget });
        throwIfCancelled();
        if (preflightResult === false || preflightResult?.ok === false) {
          push("target_preflight_failed", {
            target: targetKey,
            reason: normalize(preflightResult?.reason || "invalid_target"),
          });
          lastTransition = {
            from: activeAtRequest?.id || null,
            to: requestedTarget.id,
            reason,
            outcome: "preflight_failed",
            durationMs: Math.max(0, now() - startedAt),
          };
          return false;
        }
        resolvedTarget = normalizeSession(preflightResult?.target) || requestedTarget;
        pendingTarget = resolvedTarget;
        push("target_preflight_succeeded", { target: resolvedTarget.id });

        const activeBeforeLeave = normalizeSession(readActiveSession()) || activeAtRequest;
        if (activeBeforeLeave && !sameSession(activeBeforeLeave, resolvedTarget)) {
          push("current_leave_started", { from: activeBeforeLeave.id, to: resolvedTarget.id });
          const left = await leaveActiveSession(activeBeforeLeave, resolvedTarget, { reason });
          throwIfCancelled();
          if (left === false) throw Object.assign(new Error("active_call_leave_failed"), { code: "active_call_leave_failed" });
          push("current_leave_finished", { from: activeBeforeLeave.id, to: resolvedTarget.id });
        }

        throwIfCancelled();
        push("target_enter_started", { target: resolvedTarget.id });
        const result = await enterTarget({
          activeSession: activeBeforeLeave,
          target: resolvedTarget,
          preflight: preflightResult,
        });
        throwIfCancelled();
        if (result === false) throw Object.assign(new Error("target_call_enter_failed"), { code: "target_call_enter_failed" });
        push("target_enter_finished", { target: resolvedTarget.id });
        lastTransition = {
          from: activeAtRequest?.id || null,
          to: resolvedTarget.id,
          reason,
          outcome: "success",
          durationMs: Math.max(0, now() - startedAt),
        };
        return result === undefined ? true : result;
      } catch (error) {
        const cancelled = normalize(error?.code) === "call_session_transition_cancelled";
        lastTransition = {
          from: activeAtRequest?.id || null,
          to: resolvedTarget?.id || requestedTarget.id,
          reason,
          outcome: cancelled ? "cancelled" : "failed",
          error: normalize(error?.code || error?.message || "switch_failed"),
          durationMs: Math.max(0, now() - startedAt),
        };
        push(cancelled ? "switch_cancelled" : "switch_failed", { ...lastTransition });
        return false;
      } finally {
        if (pendingPromise === operation && pendingRequest === requestState) {
          switching = false;
          pendingTarget = null;
          pendingTargetKey = "";
          pendingPromise = null;
          pendingRequest = null;
          push("switch_settled", {
            outcome: lastTransition?.outcome || "unknown",
            durationMs: Math.max(0, now() - startedAt),
          });
        }
      }
    });
    requestState.promise = operation;
    pendingPromise = operation;
    return operation;
  };

  const cancelPending = ({ kind = "", id = "", reason = "cancelled" } = {}) => {
    if (!pendingPromise || !pendingRequest) return false;
    const requestedKind = normalize(kind).toLowerCase();
    const requestedId = normalize(id);
    const target = normalizeSession(pendingTarget);
    if (requestedKind && target?.kind !== requestedKind) return false;
    if (requestedId && target?.id !== requestedId) return false;
    const request = pendingRequest;
    const operation = pendingPromise;
    request.cancelled = true;
    request.cancelReason = normalize(reason) || "cancelled";
    if (pendingRequest === request && pendingPromise === operation) {
      switching = false;
      pendingTarget = null;
      pendingTargetKey = "";
      pendingPromise = null;
      pendingRequest = null;
      push("pending_transition_cancelled", {
        target: request.targetKey,
        reason: request.cancelReason,
      });
    }
    return true;
  };

  return Object.freeze({
    requestTransition,
    cancelPending,
    getSnapshot: snapshot,
    isSwitching: () => switching,
    isSameSession: sameSession,
  });
}
