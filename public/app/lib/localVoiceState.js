export const LOCAL_VOICE_STATE_MODE = Object.freeze({
  NORMAL: "normal",
  MUTE_ONLY: "mute_only",
  DEAFENED: "deafened",
});

export function normalizeLocalVoiceState(input = {}) {
  const deafened = !!input?.deafened;
  const muted = !!(input?.muted || deafened);
  return Object.freeze({
    muted,
    deafened,
    mode: deafened
      ? LOCAL_VOICE_STATE_MODE.DEAFENED
      : (muted ? LOCAL_VOICE_STATE_MODE.MUTE_ONLY : LOCAL_VOICE_STATE_MODE.NORMAL),
  });
}

export function getNextLocalVoiceState(currentInput = {}, control = "mute") {
  const current = normalizeLocalVoiceState(currentInput);
  const normalizedControl = String(control || "mute").trim().toLowerCase();
  if (normalizedControl === "deafen") {
    return current.deafened
      ? normalizeLocalVoiceState({ muted: false, deafened: false })
      : normalizeLocalVoiceState({ muted: true, deafened: true });
  }
  if (normalizedControl !== "mute") {
    throw new TypeError(`Unknown local voice control: ${normalizedControl || "empty"}`);
  }
  return (current.muted || current.deafened)
    ? normalizeLocalVoiceState({ muted: false, deafened: false })
    : normalizeLocalVoiceState({ muted: true, deafened: false });
}

/**
 * Server Voice deafen is a temporary output lock which also forces the
 * microphone quiet. Keep the user's explicit microphone choice separate so
 * undeafen restores it instead of always unmuting.
 */
export function getNextLocalVoiceDeafenState(currentInput = {}, {
  mutedBeforeDeafen = null,
} = {}) {
  const current = normalizeLocalVoiceState(currentInput);
  if (!current.deafened) {
    return Object.freeze({
      state: normalizeLocalVoiceState({ muted: true, deafened: true }),
      mutedBeforeDeafen: current.muted,
    });
  }
  return Object.freeze({
    state: normalizeLocalVoiceState({
      muted: mutedBeforeDeafen == null ? false : !!mutedBeforeDeafen,
      deafened: false,
    }),
    mutedBeforeDeafen: null,
  });
}

export function createLatestLocalVoiceMediaQueue({ apply } = {}) {
  if (typeof apply !== "function") throw new TypeError("apply is required");
  let generation = 0;
  let lastResult = null;
  let pending = null;
  let draining = false;
  let idle = Promise.resolve();
  let resolveIdle = null;

  function settle(operation, outcome, error) {
    lastResult = {
      operationGeneration: operation.operationGeneration,
      state: operation.state,
      outcome,
      ...(outcome === "failed" || outcome === "superseded_after_failure" ? { error } : {}),
    };
    operation.resolve(lastResult);
  }

  // Keep at most the current apply and one replacement. A promise chain held
  // every superseded request (and its callers) until slow media work finished.
  async function drain() {
    while (pending) {
      const operation = pending;
      pending = null;
      const { operationGeneration, state, context } = operation;
      try {
        await apply(state, {
          ...context,
          operationGeneration,
          isCurrent: () => operationGeneration === generation,
        });
        settle(operation, operationGeneration === generation ? "applied" : "superseded_after_apply");
      } catch (error) {
        settle(operation, operationGeneration === generation ? "failed" : "superseded_after_failure", error);
      }
    }
    draining = false;
    const completeIdle = resolveIdle;
    resolveIdle = null;
    completeIdle?.(null);
  }

  function enqueue(stateInput = {}, context = {}) {
    const state = normalizeLocalVoiceState(stateInput);
    const operationGeneration = ++generation;
    let resolve;
    const completion = new Promise((complete) => { resolve = complete; });
    if (pending) settle(pending, "superseded_before_apply");
    pending = {
      state,
      operationGeneration,
      context: context && typeof context === "object" ? context : {},
      resolve,
    };
    if (!draining) {
      draining = true;
      idle = new Promise((complete) => { resolveIdle = complete; });
      Promise.resolve().then(drain);
    }
    return Object.freeze({ operationGeneration, state, completion });
  }

  function cancel() {
    // An in-flight media promise cannot be aborted here. Revoke its ownership
    // immediately and discard queued work; apply must check isCurrent after I/O.
    generation += 1;
    if (pending) {
      settle(pending, "superseded_before_apply");
      pending = null;
    }
    return generation;
  }

  return Object.freeze({
    enqueue,
    cancel,
    getGeneration: () => generation,
    getLastResult: () => lastResult,
    whenIdle: () => idle,
  });
}
