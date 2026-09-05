const clean = (value) => String(value || "").trim();

function normalizeScope(input = {}) {
  return {
    serverId: clean(input.serverId),
    channelId: clean(input.channelId),
    conversationId: clean(input.conversationId),
    userId: clean(input.userId),
    membershipSessionId: clean(input.membershipSessionId || input.sessionId),
    processSessionId: clean(input.processSessionId),
  };
}

function sameScope(left = {}, right = {}) {
  const a = normalizeScope(left);
  const b = normalizeScope(right);
  return !!(
    a.serverId
    && a.channelId
    && a.userId
    && a.serverId === b.serverId
    && a.channelId === b.channelId
    && a.userId === b.userId
    && (!a.conversationId || !b.conversationId || a.conversationId === b.conversationId)
    && (!a.processSessionId || !b.processSessionId || a.processSessionId === b.processSessionId)
  );
}

export function isServerVoiceLeaveFeedbackCurrent({
  activeOperation = null,
  activePresentation = null,
  generation = "",
} = {}) {
  const expectedGeneration = clean(generation);
  return !!(
    expectedGeneration
    && clean(activeOperation?.generation) === expectedGeneration
    && clean(activeOperation?.phase) === "leaving"
    && clean(activePresentation?.generation) === expectedGeneration
  );
}

export function createServerVoiceOperationLifecycle({ now = () => Date.now() } = {}) {
  let counter = 0;
  let current = null;
  const history = [];

  const record = (event, operation = current, details = {}) => {
    const entry = Object.freeze({
      at: now(),
      event: clean(event) || "unknown",
      generation: clean(operation?.generation),
      phase: clean(operation?.phase),
      ...details,
    });
    history.push(entry);
    while (history.length > 100) history.shift();
    return entry;
  };

  const createOperation = (scope, phase) => {
    counter += 1;
    const operation = {
      ...normalizeScope(scope),
      generation: `server-voice-${now()}-${counter}`,
      phase,
      createdAt: now(),
      connectedAt: 0,
      settledAt: 0,
      result: "",
      joinPromise: null,
      leavePromise: null,
      joinPipelineEntered: false,
      cancelled: false,
    };
    current = operation;
    record(`${phase}_started`, operation);
    return operation;
  };

  const beginJoin = (scope = {}) => {
    const normalized = normalizeScope(scope);
    if (current?.phase === "leaving") {
      record("join_blocked_while_leaving", current, { requestedChannelId: normalized.channelId });
      return { accepted: false, reused: false, reason: "leave_in_flight", operation: current };
    }
    if (current?.phase === "joining" && sameScope(current, normalized)) {
      record("join_reused", current);
      return { accepted: false, reused: true, reason: "join_in_flight", operation: current };
    }
    return { accepted: true, reused: false, reason: "", operation: createOperation(normalized, "joining") };
  };

  const beginLeave = (scope = {}) => {
    const normalized = normalizeScope(scope);
    if (current?.phase === "leaving" && sameScope(current, normalized)) {
      record("leave_reused", current);
      return { accepted: false, reused: true, operation: current };
    }
    const operation = current && sameScope(current, normalized)
      ? current
      : createOperation(normalized, "leaving");
    operation.phase = "leaving";
    operation.cancelled = true;
    operation.connectedAt = 0;
    operation.membershipSessionId = normalized.membershipSessionId || operation.membershipSessionId;
    operation.processSessionId = normalized.processSessionId || operation.processSessionId;
    record("leave_started", operation);
    return { accepted: true, reused: false, operation };
  };

  const attachPromise = (operation, kind, promise) => {
    if (!operation || (kind !== "join" && kind !== "leave")) return promise;
    const field = kind === "join" ? "joinPromise" : "leavePromise";
    operation[field] = promise;
    Promise.resolve(promise).then(
      () => {
        if (current === operation && operation[field] === promise) operation[field] = null;
      },
      () => {
        if (current === operation && operation[field] === promise) operation[field] = null;
      },
    );
    return promise;
  };

  const isCurrent = (operation, phases = []) => {
    if (!operation || current !== operation) return false;
    const allowed = Array.isArray(phases) ? phases.map(clean).filter(Boolean) : [];
    return allowed.length === 0 || allowed.includes(clean(operation.phase));
  };

  const getByGeneration = (generation = "") => {
    const id = clean(generation);
    return id && clean(current?.generation) === id ? current : null;
  };

  const updateMembershipSession = (operation, membershipSessionId = "") => {
    if (!isCurrent(operation)) return false;
    operation.membershipSessionId = clean(membershipSessionId) || operation.membershipSessionId;
    return true;
  };

  const retarget = (operation, scope = {}) => {
    if (!isCurrent(operation, ["joining", "connected", "reconnecting"])) return false;
    const next = normalizeScope(scope);
    if (next.serverId && operation.serverId && next.serverId !== operation.serverId) return false;
    const previousChannelId = operation.channelId;
    const previousConversationId = operation.conversationId;
    operation.serverId = next.serverId || operation.serverId;
    operation.channelId = next.channelId || operation.channelId;
    operation.conversationId = next.conversationId || operation.conversationId;
    operation.membershipSessionId = next.membershipSessionId || operation.membershipSessionId;
    operation.processSessionId = next.processSessionId || operation.processSessionId;
    record("retargeted", operation, {
      previousChannelId,
      previousConversationId,
      channelId: operation.channelId,
      conversationId: operation.conversationId,
    });
    return true;
  };

  const markJoinPipelineEntered = (operation) => {
    if (!isCurrent(operation, ["joining"])) return false;
    if (operation.joinPipelineEntered === true) return true;
    operation.joinPipelineEntered = true;
    record("join_pipeline_entered", operation);
    return true;
  };

  const markConnected = (operation, connectedAt = now()) => {
    if (!isCurrent(operation, ["joining"])) return false;
    operation.phase = "connected";
    operation.joinPipelineEntered = true;
    operation.connectedAt = Number(connectedAt || 0) || now();
    operation.cancelled = false;
    record("connected", operation);
    return true;
  };

  const settleJoin = (operation, result = "failed") => {
    if (!isCurrent(operation, ["joining"])) return false;
    operation.phase = result === "connected" ? "connected" : "idle";
    operation.result = clean(result) || "failed";
    operation.settledAt = now();
    operation.joinPromise = null;
    if (operation.phase === "idle") operation.joinPipelineEntered = false;
    if (operation.phase === "idle") operation.connectedAt = 0;
    record("join_settled", operation, { result: operation.result });
    return true;
  };

  const settleLeave = (operation, result = "left") => {
    if (!isCurrent(operation, ["leaving"])) return false;
    operation.phase = "idle";
    operation.result = clean(result) || "left";
    operation.settledAt = now();
    operation.connectedAt = 0;
    operation.joinPromise = null;
    operation.leavePromise = null;
    operation.joinPipelineEntered = false;
    record("leave_settled", operation, { result: operation.result });
    return true;
  };

  const snapshot = () => ({
    current: current ? {
      ...current,
      joinPromise: current.joinPromise ? "pending" : null,
      leavePromise: current.leavePromise ? "pending" : null,
    } : null,
    history: history.slice(),
  });

  return Object.freeze({
    beginJoin,
    beginLeave,
    attachPromise,
    isCurrent,
    getByGeneration,
    updateMembershipSession,
    retarget,
    markJoinPipelineEntered,
    markConnected,
    settleJoin,
    settleLeave,
    getCurrent: () => current,
    getSnapshot: snapshot,
  });
}
