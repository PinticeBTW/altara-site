const DEFAULT_STEP_LIMIT = 40;

function safeStepName(value) {
  return String(value || "step").trim().slice(0, 80) || "step";
}

function safeOutcome(value) {
  return String(value || "unknown").trim().slice(0, 40) || "unknown";
}

function cloneStep(step) {
  return {
    name: step.name,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    durationMs: step.durationMs,
    outcome: step.outcome,
    timeoutMs: step.timeoutMs,
    retryCount: step.retryCount,
    sequential: step.sequential,
    cancellationState: step.cancellationState,
  };
}

export function createPrivateCallAcceptPipelineTracker({
  now = () => Date.now(),
  stepLimit = DEFAULT_STEP_LIMIT,
  onSettled = null,
} = {}) {
  const maxSteps = Math.max(8, Number(stepLimit) || DEFAULT_STEP_LIMIT);
  let generation = 0;
  let active = null;
  let latest = null;

  const timestamp = () => Math.max(0, Number(now()) || 0);
  const isCurrent = (pipeline) => !!(
    pipeline
    && active === pipeline
    && pipeline.cancelled !== true
    && pipeline.settled !== true
  );

  function begin({ clickedAt = null, handlerEnteredAt = null } = {}) {
    if (active && active.cancelled !== true && active.settled !== true) {
      return { pipeline: active, started: false };
    }
    generation += 1;
    const enteredAt = handlerEnteredAt != null && Number.isFinite(Number(handlerEnteredAt))
      ? Number(handlerEnteredAt)
      : timestamp();
    const pipeline = {
      generation,
      acceptClickedAt: clickedAt != null && Number.isFinite(Number(clickedAt)) ? Number(clickedAt) : enteredAt,
      acceptHandlerEnteredAt: enteredAt,
      connectingStateAt: null,
      totalAcceptToConnectingMs: null,
      steps: [],
      cancelled: false,
      cancellationReason: null,
      settled: false,
      outcome: "running",
      settlementNotified: false,
    };
    active = pipeline;
    latest = pipeline;
    return { pipeline, started: true };
  }

  function recordStep(pipeline, name, {
    startedAt = null,
    finishedAt = null,
    outcome = "success",
    timeoutMs = null,
    retryCount = 0,
    sequential = true,
    cancellationState = null,
  } = {}) {
    if (!pipeline || pipeline !== latest) return null;
    const start = startedAt != null && Number.isFinite(Number(startedAt)) ? Number(startedAt) : timestamp();
    const finish = finishedAt != null && Number.isFinite(Number(finishedAt)) ? Number(finishedAt) : timestamp();
    const step = {
      name: safeStepName(name),
      startedAt: start,
      finishedAt: finish,
      durationMs: Math.max(0, Math.round(finish - start)),
      outcome: safeOutcome(outcome),
      timeoutMs: timeoutMs != null && Number.isFinite(Number(timeoutMs))
        ? Math.max(0, Number(timeoutMs))
        : null,
      retryCount: Math.max(0, Number(retryCount) || 0),
      sequential: sequential !== false,
      cancellationState: cancellationState == null
        ? (pipeline.cancelled === true ? "cancelled" : "active")
        : safeOutcome(cancellationState),
    };
    pipeline.steps.push(step);
    while (pipeline.steps.length > maxSteps) pipeline.steps.shift();
    return cloneStep(step);
  }

  async function runStep(pipeline, name, operation, metadata = {}) {
    const startedAt = timestamp();
    if (!isCurrent(pipeline)) {
      recordStep(pipeline, name, {
        ...metadata,
        startedAt,
        finishedAt: timestamp(),
        outcome: "cancelled",
        cancellationState: "cancelled",
      });
      return { cancelled: true };
    }
    try {
      const value = await operation();
      recordStep(pipeline, name, {
        ...metadata,
        startedAt,
        finishedAt: timestamp(),
        outcome: pipeline.cancelled === true ? "cancelled" : "success",
      });
      return value;
    } catch (error) {
      recordStep(pipeline, name, {
        ...metadata,
        startedAt,
        finishedAt: timestamp(),
        outcome: pipeline.cancelled === true ? "cancelled" : "failed",
      });
      throw error;
    }
  }

  function markConnecting(pipeline, at = null) {
    if (!isCurrent(pipeline) || pipeline.connectingStateAt != null) return false;
    const connectingAt = at != null && Number.isFinite(Number(at)) ? Number(at) : timestamp();
    pipeline.connectingStateAt = connectingAt;
    pipeline.totalAcceptToConnectingMs = Math.max(
      0,
      Math.round(connectingAt - Number(pipeline.acceptHandlerEnteredAt || connectingAt)),
    );
    return true;
  }

  function cancel(pipeline = active, reason = "cancelled") {
    if (!pipeline || pipeline.settled === true || pipeline.cancelled === true) return false;
    pipeline.cancelled = true;
    pipeline.cancellationReason = safeOutcome(reason);
    pipeline.outcome = "cancelled";
    if (active === pipeline) active = null;
    notifySettled(pipeline);
    return true;
  }

  function finish(pipeline, outcome = "completed") {
    if (!pipeline || pipeline.settled === true) return false;
    pipeline.settled = true;
    pipeline.outcome = pipeline.cancelled === true ? "cancelled" : safeOutcome(outcome);
    if (active === pipeline) active = null;
    notifySettled(pipeline);
    return true;
  }

  function notifySettled(pipeline) {
    if (!pipeline || pipeline.settlementNotified === true || typeof onSettled !== "function") return false;
    pipeline.settlementNotified = true;
    try { onSettled(getSnapshot()); } catch (_) {}
    return true;
  }

  function getSnapshot() {
    const pipeline = latest;
    if (!pipeline) return null;
    let slowestStep = null;
    for (const step of pipeline.steps) {
      if (!slowestStep || step.durationMs > slowestStep.durationMs) slowestStep = step;
    }
    return {
      acceptClickedAt: pipeline.acceptClickedAt,
      acceptHandlerEnteredAt: pipeline.acceptHandlerEnteredAt,
      steps: pipeline.steps.map(cloneStep),
      connectingStateAt: pipeline.connectingStateAt,
      totalAcceptToConnectingMs: pipeline.totalAcceptToConnectingMs,
      slowestStep: slowestStep?.name || null,
      slowestStepMs: slowestStep?.durationMs ?? null,
      cancellationState: pipeline.cancelled === true
        ? "cancelled"
        : (pipeline.settled === true ? "settled" : "active"),
      cancellationReason: pipeline.cancellationReason,
      outcome: pipeline.outcome,
      generation: pipeline.generation,
    };
  }

  return {
    begin,
    cancel,
    finish,
    getActive: () => active,
    getSnapshot,
    isCurrent,
    markConnecting,
    recordStep,
    runStep,
  };
}
