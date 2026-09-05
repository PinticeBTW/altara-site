function clean(value) {
  return String(value || "").trim();
}

function safeDiagnosticId(value) {
  const normalized = clean(value).replace(/[^a-z0-9:_-]+/gi, "_");
  if (!normalized) return null;
  return normalized.length <= 10 ? normalized : normalized.slice(0, 8) + "…";
}

function normalizedScope(scope = {}) {
  return {
    callType: clean(scope.callType || "server_voice") || "server_voice",
    userId: clean(scope.userId),
    serverId: clean(scope.serverId),
    channelId: clean(scope.channelId),
    conversationId: clean(scope.conversationId),
    membershipSessionId: clean(scope.membershipSessionId || scope.sessionId),
    processSessionId: clean(scope.processSessionId),
    generation: clean(scope.generation),
    operationId: clean(scope.operationId),
  };
}

export function createServerVoiceLocalExitFence({
  now = () => Date.now(),
  retentionMs = 45_000,
  onTrace = () => {},
} = {}) {
  const retainForMs = Math.max(5_000, Number(retentionMs) || 45_000);
  let fence = null;
  const emitted = new Set();

  const currentTime = () => Math.max(0, Number(now()) || Date.now());

  function expireIfNeeded() {
    if (fence?.acceptedNewGeneration && fence.expiresAt <= currentTime()) {
      fence = null;
      emitted.clear();
    }
    return fence;
  }

  function emit(source, action, context = {}) {
    const active = expireIfNeeded();
    const signature = [
      action,
      clean(source),
      clean(context.mutationType),
      clean(context.attemptedProjection),
      clean(context.generation),
      clean(context.membershipSessionId),
    ].join(":");
    if (action === "blocked" && emitted.has(signature)) return false;
    if (action === "blocked") {
      emitted.add(signature);
      while (emitted.size > 80) emitted.delete(emitted.values().next().value);
    }
    try {
      onTrace(Object.freeze({
        source: clean(source || "unknown").slice(0, 80),
        action,
        oldGeneration: safeDiagnosticId(active?.generation),
        currentGeneration: safeDiagnosticId(context.currentGeneration || context.generation),
        membershipSessionMatch: !!(
          active?.membershipSessionId
          && clean(context.membershipSessionId) === active.membershipSessionId
        ),
        localTerminalState: !!(active && !active.acceptedNewGeneration),
        attemptedProjection: clean(context.attemptedProjection || context.mutationType || "unknown").slice(0, 80),
        elapsedSinceLeaveMs: active ? Math.max(0, currentTime() - active.leftAt) : null,
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function markTerminal(scope = {}) {
    const normalized = normalizedScope(scope);
    if (
      normalized.callType !== "server_voice"
      || !normalized.userId
      || !normalized.serverId
      || !normalized.channelId
      || !normalized.generation
      || !normalized.operationId
    ) return null;
    const leftAt = currentTime();
    fence = {
      ...normalized,
      leftAt,
      expiresAt: leftAt + retainForMs,
      acceptedNewGeneration: null,
    };
    emitted.clear();
    emit("explicit_local_leave", "blocked", {
      currentGeneration: normalized.generation,
      generation: normalized.generation,
      membershipSessionId: normalized.membershipSessionId,
      mutationType: "terminal_fence_committed",
      attemptedProjection: "terminal_fence_committed",
    });
    return getSnapshot();
  }

  function isLocallyTerminal(scope = {}) {
    const active = expireIfNeeded();
    if (!active || active.acceptedNewGeneration) return false;
    const normalized = normalizedScope(scope);
    if (normalized.userId && normalized.userId !== active.userId) return false;
    if (normalized.serverId && normalized.serverId !== active.serverId) return false;
    if (normalized.conversationId && active.conversationId && normalized.conversationId !== active.conversationId) return false;
    return true;
  }

  function shouldBlock(scope = {}) {
    const active = expireIfNeeded();
    if (!active || scope.ownerTerminalMutation === true) return false;
    const normalized = normalizedScope(scope);
    if (normalized.userId && normalized.userId !== active.userId) return false;
    if (normalized.serverId && normalized.serverId !== active.serverId) return false;
    if (normalized.conversationId && active.conversationId && normalized.conversationId !== active.conversationId) return false;

    let block = !active.acceptedNewGeneration;
    if (active.acceptedNewGeneration) {
      const oldGenerationMatch = !!(normalized.generation && normalized.generation === active.generation);
      const oldMembershipMatch = !!(
        normalized.membershipSessionId
        && active.membershipSessionId
        && normalized.membershipSessionId === active.membershipSessionId
      );
      const ambiguousOldDelete = !!(
        clean(scope.mutationType) === "delete"
        && !normalized.membershipSessionId
        && clean(scope.currentMembershipSessionId)
        && clean(scope.currentMembershipSessionId) !== active.membershipSessionId
      );
      block = oldGenerationMatch || oldMembershipMatch || ambiguousOldDelete;
    }
    if (block) {
      emit(scope.source, "blocked", {
        ...normalized,
        currentGeneration: scope.currentGeneration,
        mutationType: scope.mutationType,
        attemptedProjection: scope.attemptedProjection,
      });
    }
    return block;
  }

  function acceptNewGeneration(scope = {}) {
    const active = expireIfNeeded();
    const normalized = normalizedScope(scope);
    if (
      !active
      || scope.explicitJoin !== true
      || !normalized.generation
      || normalized.generation === active.generation
    ) return false;
    active.acceptedNewGeneration = {
      generation: normalized.generation,
      membershipSessionId: normalized.membershipSessionId,
      processSessionId: normalized.processSessionId,
      serverId: normalized.serverId,
      channelId: normalized.channelId,
      conversationId: normalized.conversationId,
      acceptedAt: currentTime(),
    };
    active.expiresAt = currentTime() + retainForMs;
    emitted.clear();
    emit(scope.source || "explicit_new_join", "accepted-new-generation", {
      currentGeneration: normalized.generation,
      generation: normalized.generation,
      membershipSessionId: normalized.membershipSessionId,
      mutationType: "new_generation",
      attemptedProjection: "new_generation",
    });
    return true;
  }

  function getSnapshot() {
    const active = expireIfNeeded();
    if (!active) return null;
    return Object.freeze({
      callType: active.callType,
      userId: active.userId,
      serverId: active.serverId,
      channelId: active.channelId,
      conversationId: active.conversationId,
      membershipSessionId: active.membershipSessionId,
      processSessionId: active.processSessionId,
      generation: active.generation,
      operationId: active.operationId,
      leftAt: active.leftAt,
      expiresAt: active.expiresAt,
      locallyTerminal: !active.acceptedNewGeneration,
      acceptedNewGeneration: active.acceptedNewGeneration
        ? Object.freeze({ ...active.acceptedNewGeneration })
        : null,
    });
  }

  return Object.freeze({
    acceptNewGeneration,
    getSnapshot,
    isLocallyTerminal,
    markTerminal,
    shouldBlock,
  });
}
