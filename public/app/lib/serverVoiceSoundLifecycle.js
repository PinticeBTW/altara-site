const clean = (value) => String(value || "").trim();
const lower = (value) => clean(value).toLowerCase();

const INTERNAL_SILENT_REASON = /(?:cleanup|shutdown|stale|session[_-]?rotation|session[_-]?replacement|tombstone|initial[_-]?hydration|snapshot[_-]?hydration|dispose|abandoned|old[_-]?room|detached|reconnect|process[_-]?replacement)/i;

export function resolveServerVoiceSoundDecision({
  cue = "",
  localOrRemote = "local",
  reason = "",
  normalizedVoiceState = "idle",
  generation = "",
  currentGeneration = "",
  explicitUserAction = false,
  initialHydration = false,
  sameUserSessionReplacement = false,
  staleOwner = false,
  selfEvent = false,
  transient = false,
} = {}) {
  const normalizedCue = lower(cue);
  const scope = lower(localOrRemote) === "remote" ? "remote" : "local";
  const state = lower(normalizedVoiceState) || "idle";
  const owner = clean(generation);
  const current = clean(currentGeneration);
  const why = clean(reason);

  if (!owner || !current || owner !== current || staleOwner) {
    return Object.freeze({ action: "cancelled", reason: "stale_owner" });
  }
  if (initialHydration) {
    return Object.freeze({ action: "suppressed", reason: "initial_hydration" });
  }
  if (sameUserSessionReplacement) {
    return Object.freeze({ action: "suppressed", reason: "same_user_session_replacement" });
  }
  if (scope === "remote" && selfEvent) {
    return Object.freeze({ action: "suppressed", reason: "self_event" });
  }
  if (transient || /(?:reconnect|detached|transport[_-]?interrupt)/i.test(why)) {
    return Object.freeze({ action: "suppressed", reason: "transient_transport" });
  }
  if (INTERNAL_SILENT_REASON.test(why)) {
    return Object.freeze({ action: "suppressed", reason: "internal_cleanup" });
  }

  if (scope === "local") {
    if (normalizedCue === "server_voice_join") {
      return state === "connected"
        ? Object.freeze({ action: "play", reason: "local_connected" })
        : Object.freeze({ action: "suppressed", reason: "local_not_connected" });
    }
    if (normalizedCue === "server_voice_leave") {
      return explicitUserAction === true && state === "leaving"
        ? Object.freeze({ action: "play", reason: "explicit_local_leave" })
        : Object.freeze({ action: "suppressed", reason: "not_explicit_local_leave" });
    }
    return Object.freeze({ action: "suppressed", reason: "unsupported_local_cue" });
  }

  if (state !== "connected") {
    return Object.freeze({ action: "suppressed", reason: "remote_call_not_connected" });
  }
  if (normalizedCue === "server_voice_join") {
    return Object.freeze({ action: "play", reason: "remote_participant_join" });
  }
  if (normalizedCue === "server_voice_leave") {
    return Object.freeze({ action: "play", reason: "remote_participant_leave" });
  }
  return Object.freeze({ action: "suppressed", reason: "unsupported_remote_cue" });
}

export function deriveEffectiveServerVoiceParticipantTransitions({
  previousParticipants = [],
  nextParticipants = [],
  serverId = "",
  channelId = "",
  selfUserId = "",
  initialHydration = false,
} = {}) {
  const sid = clean(serverId);
  const cid = clean(channelId);
  const selfId = clean(selfUserId);
  const toMap = (rows) => {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const userId = clean(row?.userId || row?.user_id);
      const rowServerId = clean(row?.serverId || row?.server_id);
      const rowChannelId = clean(row?.channelId || row?.channel_id);
      if (!userId || userId === selfId || rowServerId !== sid || rowChannelId !== cid) continue;
      map.set(userId, {
        userId,
        serverId: rowServerId,
        channelId: rowChannelId,
        sessionId: clean(row?.sessionId || row?.session_id),
      });
    }
    return map;
  };
  const previous = toMap(previousParticipants);
  const next = toMap(nextParticipants);
  if (initialHydration) {
    return Object.freeze({ joined: [], left: [], continuous: Array.from(next.values()) });
  }
  const joined = Array.from(next.values()).filter((row) => !previous.has(row.userId));
  const left = Array.from(previous.values()).filter((row) => !next.has(row.userId));
  const continuous = Array.from(next.values()).filter((row) => previous.has(row.userId));
  return Object.freeze({ joined, left, continuous });
}

export function createServerVoiceSoundLifecycle({
  playCue = async () => ({ played: false, failureCategory: "playback_unavailable" }),
  onTrace = () => {},
  scheduleTimeout = (callback, delayMs) => setTimeout(callback, delayMs),
  clearScheduledTimeout = (handle) => clearTimeout(handle),
  terminalReleaseMs = 5_000,
} = {}) {
  let owner = null;
  let participantBaseline = null;
  let terminalReleaseHandle = null;
  const playedKeys = new Set();
  const activeAttempts = new Set();

  const clearTerminalRelease = () => {
    if (terminalReleaseHandle == null) return;
    try { clearScheduledTimeout(terminalReleaseHandle); } catch (_) {}
    terminalReleaseHandle = null;
  };

  const trace = (input, action, reason, extra = {}) => {
    try {
      onTrace(Object.freeze({
        cue: lower(input?.cue),
        action,
        reason: clean(reason) || "unknown",
        source: clean(input?.source) || "unknown",
        localOrRemote: lower(input?.localOrRemote) === "remote" ? "remote" : "local",
        generation: clean(input?.generation),
        serverId: clean(input?.serverId),
        channelId: clean(input?.channelId),
        sessionId: clean(input?.sessionId),
        normalizedVoiceState: lower(input?.normalizedVoiceState) || "idle",
        initialHydration: input?.initialHydration === true,
        sameUserSessionReplacement: input?.sameUserSessionReplacement === true,
        staleOwner: action === "cancelled" || input?.staleOwner === true,
        ...extra,
      }));
    } catch (_) {}
  };

  const isCurrent = (generation = "") => !!(
    owner
    && clean(generation)
    && clean(owner.generation) === clean(generation)
  );

  const cancelActiveAttempts = (reason = "owner_replaced") => {
    for (const attempt of Array.from(activeAttempts)) {
      activeAttempts.delete(attempt);
      attempt.cancelled = true;
      for (const cancel of Array.from(attempt.cancellations)) {
        try { cancel(); } catch (_) {}
      }
      attempt.cancellations.clear();
      if (!attempt.traced) {
        attempt.traced = true;
        trace(attempt.input, "cancelled", reason, { staleOwner: true });
      }
    }
  };

  const beginGeneration = (nextOwner = {}) => {
    const generation = clean(nextOwner?.generation);
    if (!generation) return false;
    if (!owner || clean(owner.generation) !== generation) {
      clearTerminalRelease();
      cancelActiveAttempts("new_generation");
      playedKeys.clear();
      participantBaseline = null;
    } else if (
      lower(nextOwner?.normalizedVoiceState)
      && lower(nextOwner.normalizedVoiceState) !== owner.normalizedVoiceState
      && ["leaving", "idle", "failed", "cancelled"].includes(lower(nextOwner.normalizedVoiceState))
    ) {
      cancelActiveAttempts("state_transition");
    }
    owner = Object.freeze({
      generation,
      serverId: clean(nextOwner?.serverId),
      channelId: clean(nextOwner?.channelId),
      sessionId: clean(nextOwner?.sessionId),
      normalizedVoiceState: lower(nextOwner?.normalizedVoiceState) || "joining",
    });
    return true;
  };

  const updateState = (generation = "", normalizedVoiceState = "") => {
    if (!isCurrent(generation)) return false;
    owner = Object.freeze({
      ...owner,
      normalizedVoiceState: lower(normalizedVoiceState) || owner.normalizedVoiceState,
    });
    return true;
  };

  const cancelGeneration = (generation = "", reason = "generation_cancelled") => {
    if (!isCurrent(generation)) return false;
    clearTerminalRelease();
    cancelActiveAttempts(reason);
    owner = null;
    participantBaseline = null;
    playedKeys.clear();
    return true;
  };

  const settleGeneration = (generation = "", reason = "generation_settled", {
    preserveActiveAttempts = false,
    releaseAfterMs = terminalReleaseMs,
  } = {}) => {
    if (!isCurrent(generation)) return false;
    if (!preserveActiveAttempts) return cancelGeneration(generation, reason);
    clearTerminalRelease();
    owner = Object.freeze({
      ...owner,
      terminal: true,
      terminalReason: clean(reason) || "generation_settled",
    });
    const boundedReleaseMs = Math.max(250, Math.min(10_000, Number(releaseAfterMs) || terminalReleaseMs));
    terminalReleaseHandle = scheduleTimeout(() => {
      terminalReleaseHandle = null;
      if (!isCurrent(generation)) return;
      cancelActiveAttempts(`${clean(reason) || "generation_settled"}_release`);
      owner = null;
      participantBaseline = null;
      playedKeys.clear();
    }, boundedReleaseMs);
    terminalReleaseHandle?.unref?.();
    return true;
  };

  const attempt = (rawInput = {}) => {
    const input = {
      ...rawInput,
      generation: clean(rawInput?.generation || owner?.generation),
      currentGeneration: clean(owner?.generation),
      serverId: clean(rawInput?.serverId || owner?.serverId),
      channelId: clean(rawInput?.channelId || owner?.channelId),
      sessionId: clean(rawInput?.sessionId || owner?.sessionId),
      normalizedVoiceState: lower(rawInput?.normalizedVoiceState || owner?.normalizedVoiceState || "idle"),
    };
    const decision = resolveServerVoiceSoundDecision(input);
    if (decision.action !== "play") {
      trace(input, decision.action, decision.reason);
      return Object.freeze({ ...decision, promise: Promise.resolve(false) });
    }

    const participantId = clean(input?.participantId);
    const dedupeKey = [
      input.generation,
      lower(input.cue),
      lower(input.localOrRemote),
      participantId || "self",
      decision.reason,
    ].join(":");
    if (playedKeys.has(dedupeKey)) {
      trace(input, "suppressed", "duplicate");
      return Object.freeze({ action: "suppressed", reason: "duplicate", promise: Promise.resolve(false) });
    }
    playedKeys.add(dedupeKey);

    const attemptRecord = {
      input,
      cancellations: new Set(),
      cancelled: false,
      traced: false,
      keepAlive: false,
    };
    activeAttempts.add(attemptRecord);
    const playbackOptions = {
      ownerType: "server_voice",
      callType: "server_voice",
      ownerKey: ["server_voice", input.serverId, input.channelId, input.generation].join(":"),
      generation: input.generation,
      reason: input.reason || decision.reason,
      isPlaybackCurrent: () => !attemptRecord.cancelled && isCurrent(input.generation),
      registerCancellation: (cancel) => {
        if (typeof cancel !== "function") return () => {};
        if (attemptRecord.cancelled || !isCurrent(input.generation)) {
          try { cancel(); } catch (_) {}
          return () => {};
        }
        attemptRecord.cancellations.add(cancel);
        return () => attemptRecord.cancellations.delete(cancel);
      },
    };
    const promise = Promise.resolve()
      .then(() => playCue(lower(input.cue), playbackOptions))
      .then((result) => {
        const stillCurrent = !attemptRecord.cancelled && isCurrent(input.generation);
        if (!attemptRecord.traced) {
          attemptRecord.traced = true;
          if (!stillCurrent || result?.cancelled === true) {
            trace(input, "cancelled", "stale_owner", { staleOwner: true });
          } else if (result?.played === true) {
            attemptRecord.keepAlive = attemptRecord.cancellations.size > 0;
            trace(input, "play", decision.reason, {
              method: clean(result?.method) || null,
              assetPath: clean(result?.assetPath) || null,
              assetWasWarm: result?.assetWasWarm === true,
              playbackStartedAt: Number(result?.playbackStartedAt || 0) || null,
            });
          } else {
            trace(input, "suppressed", clean(result?.failureCategory) || "playback_failed");
          }
        }
        return stillCurrent && result?.played === true;
      }, (error) => {
        if (!attemptRecord.traced) {
          attemptRecord.traced = true;
          trace(input, attemptRecord.cancelled ? "cancelled" : "suppressed", attemptRecord.cancelled ? "stale_owner" : "playback_failed", {
            errorName: clean(error?.name).slice(0, 60) || null,
          });
        }
        return false;
      })
      .finally(() => {
        if (!attemptRecord.keepAlive || attemptRecord.cancelled) {
          activeAttempts.delete(attemptRecord);
          attemptRecord.cancellations.clear();
        }
      });
    return Object.freeze({ action: "play", reason: decision.reason, promise });
  };

  const setParticipantBaseline = (participants = []) => {
    participantBaseline = Array.isArray(participants) ? participants.map((row) => ({ ...row })) : [];
    return participantBaseline.length;
  };

  const reconcileParticipants = (participants = [], meta = {}) => {
    if (!owner) return Object.freeze({ joined: [], left: [], continuous: [] });
    const next = Array.isArray(participants) ? participants.map((row) => ({ ...row })) : [];
    const previousRows = Array.isArray(participantBaseline) ? participantBaseline : [];
    const initialHydration = participantBaseline == null || meta?.initialHydration === true;
    const transitions = deriveEffectiveServerVoiceParticipantTransitions({
      previousParticipants: participantBaseline || [],
      nextParticipants: next,
      serverId: owner.serverId,
      channelId: owner.channelId,
      selfUserId: meta?.selfUserId,
      initialHydration,
    });
    participantBaseline = next;
    if (initialHydration || owner.normalizedVoiceState !== "connected") return transitions;
    transitions.continuous.forEach((participant) => {
      const previous = previousRows.find((row) => clean(row?.userId || row?.user_id) === participant.userId) || null;
      const previousSessionId = clean(previous?.sessionId || previous?.session_id);
      if (!previousSessionId || !participant.sessionId || previousSessionId === participant.sessionId) return;
      attempt({
        cue: "server_voice_leave",
        localOrRemote: "remote",
        reason: "same_user_session_replacement",
        source: clean(meta?.source) || "membership",
        participantId: participant.userId,
        sessionId: participant.sessionId,
        sameUserSessionReplacement: true,
      });
    });
    transitions.joined.forEach((participant) => {
      attempt({
        cue: "server_voice_join",
        localOrRemote: "remote",
        reason: "remote_participant_join",
        source: clean(meta?.source) || "membership",
        participantId: participant.userId,
        sessionId: participant.sessionId,
      });
    });
    transitions.left.forEach((participant) => {
      attempt({
        cue: "server_voice_leave",
        localOrRemote: "remote",
        reason: "remote_participant_leave",
        source: clean(meta?.source) || "membership",
        participantId: participant.userId,
        sessionId: participant.sessionId,
      });
    });
    return transitions;
  };

  return Object.freeze({
    beginGeneration,
    updateState,
    cancelGeneration,
    settleGeneration,
    attempt,
    setParticipantBaseline,
    reconcileParticipants,
    isCurrent,
    getOwner: () => owner ? { ...owner } : null,
    getActiveAttemptCount: () => activeAttempts.size,
  });
}
