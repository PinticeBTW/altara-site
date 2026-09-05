const clean = (value) => String(value || "").trim();

export const SERVER_VOICE_STARTUP_READINESS_STATE = Object.freeze({
  BOOTING: "booting",
  MINIMUM_READY: "minimum-ready",
  LOADING: "voice-dependencies-loading",
  READY: "voice-ready",
  FAILED: "failed",
});

function safeSource(value) {
  return (clean(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, "-") || "unknown").slice(0, 80);
}

function normalizeTarget(input = {}) {
  return Object.freeze({
    serverId: clean(input.serverId || input.server_id),
    channelId: clean(input.channelId || input.channel_id || input.serverChannelId),
    conversationId: clean(input.conversationId || input.conversation_id),
  });
}

function targetKey(target = {}, expectedUserId = "") {
  return [
    clean(expectedUserId),
    clean(target.serverId),
    clean(target.channelId),
    clean(target.conversationId),
  ].join(":");
}

export function classifyServerVoiceStartupReadiness(snapshot = {}) {
  const expectedUserId = clean(snapshot.expectedUserId);
  const authenticatedUserId = clean(snapshot.authenticatedUserId);
  if (!expectedUserId) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.FAILED,
      blocker: "not-authenticated",
      retryable: false,
    });
  }
  if (authenticatedUserId && authenticatedUserId !== expectedUserId) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.FAILED,
      blocker: "auth-user-changed",
      retryable: false,
    });
  }
  if (!snapshot.serverContextReady) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.LOADING,
      blocker: "server-context-loading",
      retryable: true,
    });
  }
  if (!snapshot.authSessionReady || !authenticatedUserId) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.LOADING,
      blocker: "auth-restoring",
      retryable: true,
    });
  }
  if (!snapshot.permissionSourceReady) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.LOADING,
      blocker: "permission-source-loading",
      retryable: true,
    });
  }
  if (!snapshot.voiceCoordinatorReady) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.LOADING,
      blocker: "voice-coordinator-loading",
      retryable: true,
    });
  }
  if (!snapshot.tokenClientReady) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.LOADING,
      blocker: "token-client-loading",
      retryable: true,
    });
  }
  if (!snapshot.liveKitModuleReady) {
    return Object.freeze({
      state: SERVER_VOICE_STARTUP_READINESS_STATE.LOADING,
      blocker: "livekit-module-loading",
      retryable: true,
    });
  }
  return Object.freeze({
    state: SERVER_VOICE_STARTUP_READINESS_STATE.READY,
    blocker: "none",
    retryable: false,
  });
}

export function createServerVoiceStartupReadinessController({
  now = () => Date.now(),
  scheduleTimeout = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelTimeout = (handle) => clearTimeout(handle),
  timeoutMs = 12_000,
  onTrace = null,
} = {}) {
  let current = null;
  let serial = 0;

  function emit(event, intent = null, details = {}) {
    try {
      onTrace?.({
        event: safeSource(event),
        intentId: clean(intent?.id),
        generation: clean(intent?.generation || intent?.id),
        interactionSource: safeSource(intent?.source),
        readinessBlocker: clean(intent?.readinessBlocker || details.readinessBlocker || "none"),
        at: Number(now()) || 0,
        ...details,
      });
    } catch (_) {}
  }

  function publicIntent(intent = null) {
    if (!intent) return null;
    return Object.freeze({
      id: intent.id,
      generation: intent.generation,
      key: intent.key,
      source: intent.source,
      state: intent.state,
      readinessBlocker: intent.readinessBlocker,
      expectedUserId: intent.expectedUserId,
      target: intent.target,
      activationTiming: intent.activationTiming,
      queuedAt: intent.queuedAt,
    });
  }

  function settle(intent, value, state = "settled") {
    if (intent.settled) return false;
    intent.settled = true;
    intent.state = state;
    if (intent.timeoutHandle != null) cancelTimeout(intent.timeoutHandle);
    if (current === intent) current = null;
    intent.resolve(value);
    return true;
  }

  function fail(intent, error, reason = "readiness-failed") {
    if (!intent || intent.settled || current !== intent) return false;
    intent.readinessBlocker = clean(error?.readinessBlocker || error?.code || reason) || reason;
    emit("readiness-failed", intent, {
      readinessBlocker: intent.readinessBlocker,
      retryable: error?.retryable !== false,
    });
    try { intent.onFailed?.(error, publicIntent(intent)); } catch (_) {}
    return settle(intent, false, "failed");
  }

  function cancel(reason = "cancelled", { intentId = "" } = {}) {
    const intent = current;
    if (!intent) return false;
    if (clean(intentId) && clean(intentId) !== intent.id) return false;
    intent.readinessBlocker = safeSource(reason);
    emit("intent-cancelled", intent, { reason: safeSource(reason) });
    try { intent.onCancelled?.(safeSource(reason), publicIntent(intent)); } catch (_) {}
    return settle(intent, false, "cancelled");
  }

  function request(input = {}, {
    ensureReady,
    onQueued = null,
    onReady = null,
    onFailed = null,
    onCancelled = null,
  } = {}) {
    if (typeof ensureReady !== "function" || typeof onReady !== "function") {
      return Promise.resolve(false);
    }
    const target = normalizeTarget(input.target || input);
    const expectedUserId = clean(input.expectedUserId);
    const key = targetKey(target, expectedUserId);
    if (!target.serverId || !target.channelId || !target.conversationId || !expectedUserId) {
      return Promise.resolve(false);
    }
    if (current && !current.settled && current.key === key) {
      emit("intent-deduplicated", current, { state: current.state });
      return current.promise;
    }
    if (current && !current.settled) cancel("replaced");

    serial += 1;
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    const queuedAt = Number(now()) || Date.now();
    const intent = {
      id: `voice-startup:${queuedAt}:${serial}`,
      generation: `voice-startup:${queuedAt}:${serial}`,
      key,
      target,
      expectedUserId,
      source: safeSource(input.source),
      activationTiming: Object.freeze({ ...(input.activationTiming || {}) }),
      queuedAt,
      state: "queued",
      readinessBlocker: safeSource(input.readinessBlocker || "startup"),
      settled: false,
      timeoutHandle: null,
      promise,
      resolve: resolvePromise,
      onFailed,
      onCancelled,
    };
    current = intent;
    emit("intent-queued", intent, {
      clickToIntentQueuedMs: Math.max(0, queuedAt - Number(intent.activationTiming?.clickAt || queuedAt)),
    });
    try { onQueued?.(publicIntent(intent)); } catch (error) {
      return Promise.resolve(fail(intent, error, "queue-presentation-failed"));
    }

    intent.timeoutHandle = scheduleTimeout(() => {
      const error = Object.assign(new Error("Server Voice readiness timed out."), {
        code: "voice_startup_readiness_timeout",
        readinessBlocker: intent.readinessBlocker || "readiness-timeout",
        retryable: true,
      });
      fail(intent, error, "readiness-timeout");
    }, Math.max(1_000, Number(timeoutMs) || 12_000));

    Promise.resolve()
      .then(() => ensureReady(publicIntent(intent)))
      .then(async (result) => {
        if (current !== intent || intent.settled) return;
        if (result?.ok !== true) {
          const error = result?.error || Object.assign(new Error("Server Voice is not ready."), {
            code: clean(result?.blocker || "voice_startup_not_ready"),
            readinessBlocker: clean(result?.blocker || "voice_startup_not_ready"),
            retryable: result?.retryable !== false,
          });
          fail(intent, error, "readiness-failed");
          return;
        }
        intent.state = "resuming";
        intent.readinessBlocker = "none";
        const readyAt = Number(now()) || Date.now();
        emit("intent-automatically-resumed", intent, {
          pendingIntentWaitMs: Math.max(0, readyAt - intent.queuedAt),
        });
        let joined = false;
        try {
          joined = await onReady(publicIntent(intent), result);
        } catch (error) {
          fail(intent, error, "canonical-join-rejected");
          return;
        }
        if (current !== intent || intent.settled) return;
        settle(intent, joined === true, joined === true ? "joined" : "join-failed");
      })
      .catch((error) => fail(intent, error, "readiness-rejected"));

    return promise;
  }

  function getSnapshot() {
    return { current: publicIntent(current) };
  }

  return Object.freeze({ cancel, getSnapshot, request });
}
