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
  let chain = Promise.resolve();
  let lastResult = null;

  function enqueue(stateInput = {}, context = {}) {
    const state = normalizeLocalVoiceState(stateInput);
    const operationGeneration = ++generation;
    const run = async () => {
      if (operationGeneration !== generation) {
        lastResult = { operationGeneration, state, outcome: "superseded_before_apply" };
        return lastResult;
      }
      try {
        await apply(state, {
          ...(context && typeof context === "object" ? context : {}),
          operationGeneration,
          isCurrent: () => operationGeneration === generation,
        });
        lastResult = {
          operationGeneration,
          state,
          outcome: operationGeneration === generation ? "applied" : "superseded_after_apply",
        };
      } catch (error) {
        lastResult = {
          operationGeneration,
          state,
          outcome: operationGeneration === generation ? "failed" : "superseded_after_failure",
          error,
        };
      }
      return lastResult;
    };
    const completion = chain.catch(() => null).then(run);
    chain = completion.then(() => null, () => null);
    return Object.freeze({ operationGeneration, state, completion });
  }

  return Object.freeze({
    enqueue,
    getGeneration: () => generation,
    getLastResult: () => lastResult,
    whenIdle: () => chain,
  });
}
