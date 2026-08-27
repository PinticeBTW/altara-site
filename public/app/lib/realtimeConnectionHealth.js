const HEARTBEAT_FAILURE_STATES = new Set(["timeout", "disconnected", "error"]);
const DEFAULT_RECOVERY_STALE_MS = 45000;
const RECOVERY_HISTORY_WINDOW_MS = 5 * 60_000;

function normalizeHeartbeatStatus(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function createRealtimeConnectionHealth({
  now = () => Date.now(),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (timer) => clearTimeout(timer),
  workerEnabled = true,
  recoveryStaleMs = DEFAULT_RECOVERY_STALE_MS,
} = {}) {
  let realtimeClient = null;
  let recoveryHandler = null;
  let reconnectInFlight = false;
  let reconnectCommand = null;
  let reconnectGeneration = 0;
  let recoveryExpiryTimer = null;
  let pendingRecoveryReason = "";
  let subscribedAt = 0;
  let trackOkAt = 0;
  let syncAfterTrackOkAt = 0;
  const recoveryHistory = [];

  const state = {
    heartbeatLastStatus: "",
    heartbeatLastAt: 0,
    heartbeatLastOkAt: 0,
    heartbeatLastLatencyMs: null,
    heartbeatTimeoutCount: 0,
    disconnectedCount: 0,
    reconnectCount: 0,
    workerEnabled: workerEnabled === true,
    socketHealthy: false,
    lastReconnectStartedAt: 0,
    lastReconnectCompletedAt: 0,
    lastReconnectReason: "",
    lastReconnectError: "",
    presenceRecoveryReady: false,
  };

  function nowMs() {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  }

  function isTransportConnected() {
    try {
      if (typeof realtimeClient?.isConnected === "function") return realtimeClient.isConnected() === true;
    } catch (_) {}
    return null;
  }

  function clearRecoveryExpiry() {
    if (!recoveryExpiryTimer) return;
    cancelSchedule(recoveryExpiryTimer);
    recoveryExpiryTimer = null;
  }

  function resetPresenceRecoverySequence() {
    subscribedAt = 0;
    trackOkAt = 0;
    syncAfterTrackOkAt = 0;
    state.presenceRecoveryReady = false;
  }

  function completeRecoveryIfReady() {
    if (!subscribedAt || !trackOkAt || !syncAfterTrackOkAt) return false;
    if (trackOkAt < subscribedAt || syncAfterTrackOkAt < trackOkAt) return false;
    if (isTransportConnected() === false) return false;
    state.presenceRecoveryReady = true;
    state.socketHealthy = true;
    state.lastReconnectError = "";
    if (reconnectInFlight) {
      state.lastReconnectCompletedAt = nowMs();
      reconnectInFlight = false;
      reconnectCommand = null;
      pendingRecoveryReason = "";
      clearRecoveryExpiry();
    }
    return true;
  }

  function failRecovery(error = null) {
    state.socketHealthy = false;
    state.presenceRecoveryReady = false;
    state.lastReconnectError = String(error?.message || error || "reconnect_failed").slice(0, 180);
    reconnectInFlight = false;
    reconnectCommand = null;
    clearRecoveryExpiry();
  }

  function requestReconnect(reason = "realtime-unhealthy") {
    const requestedAt = nowMs();
    if (reconnectInFlight) {
      const age = requestedAt - Math.max(0, Number(state.lastReconnectStartedAt || 0));
      if (age < Math.max(1000, Number(recoveryStaleMs || DEFAULT_RECOVERY_STALE_MS))) {
        return reconnectCommand || Promise.resolve(false);
      }
      failRecovery("reconnect_stale");
    }
    if (typeof recoveryHandler !== "function") {
      pendingRecoveryReason = String(reason || "realtime-unhealthy").slice(0, 120);
      return Promise.resolve(false);
    }

    reconnectInFlight = true;
    reconnectGeneration += 1;
    const generation = reconnectGeneration;
    state.reconnectCount += 1;
    state.socketHealthy = false;
    state.lastReconnectStartedAt = requestedAt;
    state.lastReconnectReason = String(reason || "realtime-unhealthy").slice(0, 120);
    state.lastReconnectError = "";
    recoveryHistory.push({
      at: requestedAt,
      generation,
      reason: state.lastReconnectReason,
      origin: /^heartbeat:(?:timeout|disconnected|error)$/i.test(state.lastReconnectReason)
        ? "socket-driven"
        : "client-driven",
    });
    while (recoveryHistory.length > 80) recoveryHistory.shift();
    while (recoveryHistory.length && requestedAt - recoveryHistory[0].at > 30 * 60_000) recoveryHistory.shift();
    resetPresenceRecoverySequence();
    clearRecoveryExpiry();
    recoveryExpiryTimer = schedule(() => {
      if (!reconnectInFlight || generation !== reconnectGeneration) return;
      failRecovery("reconnect_sequence_timeout");
    }, Math.max(1000, Number(recoveryStaleMs || DEFAULT_RECOVERY_STALE_MS)));
    try { recoveryExpiryTimer?.unref?.(); } catch (_) {}

    const command = Promise.resolve()
      .then(() => recoveryHandler({ reason: state.lastReconnectReason, generation }))
      .then((started) => {
        if (generation !== reconnectGeneration) return false;
        if (started === false) failRecovery("reconnect_not_started");
        return started !== false;
      })
      .catch((error) => {
        if (generation === reconnectGeneration) failRecovery(error);
        return false;
      });
    reconnectCommand = command;
    return command;
  }

  function handleHeartbeat(statusInput = "", latencyMs = null) {
    const status = normalizeHeartbeatStatus(statusInput);
    if (!status) return getSnapshot();
    const at = nowMs();
    state.heartbeatLastStatus = status;
    state.heartbeatLastAt = at;
    const latency = Number(latencyMs);
    state.heartbeatLastLatencyMs = Number.isFinite(latency) && latency >= 0 ? latency : null;
    if (status === "ok") {
      state.heartbeatLastOkAt = at;
      if (state.presenceRecoveryReady && !reconnectInFlight && isTransportConnected() !== false) {
        state.socketHealthy = true;
      }
    } else if (status === "timeout") {
      state.heartbeatTimeoutCount += 1;
    } else if (status === "disconnected") {
      state.disconnectedCount += 1;
    }
    if (HEARTBEAT_FAILURE_STATES.has(status)) {
      state.socketHealthy = false;
      state.presenceRecoveryReady = false;
      void requestReconnect(`heartbeat:${status}`);
    }
    return getSnapshot();
  }

  function notePresenceStage(stageInput = "", { at = nowMs() } = {}) {
    const stage = String(stageInput || "").trim().toUpperCase();
    const timestamp = Math.max(0, Number(at || 0)) || nowMs();
    if (stage === "SUBSCRIBED") {
      subscribedAt = timestamp;
      trackOkAt = 0;
      syncAfterTrackOkAt = 0;
      state.presenceRecoveryReady = false;
    } else if (stage === "TRACK_OK" && subscribedAt) {
      trackOkAt = timestamp;
      syncAfterTrackOkAt = 0;
    } else if (stage === "SYNC" && trackOkAt && timestamp >= trackOkAt) {
      syncAfterTrackOkAt = timestamp;
    } else if (stage === "UNHEALTHY") {
      resetPresenceRecoverySequence();
      state.socketHealthy = false;
      return false;
    }
    return completeRecoveryIfReady();
  }

  function checkConnection(reason = "connection-check") {
    const connected = isTransportConnected();
    if (connected === false) {
      handleHeartbeat("disconnected");
      return false;
    }
    if (state.socketHealthy && state.presenceRecoveryReady) return true;
    // A visible/focused client with an open transport is not evidence of a
    // broken socket. Only an actual heartbeat failure (or isConnected=false)
    // may initiate global Presence recovery. This prevents optional channel
    // authorization failures and incomplete feature state from manufacturing
    // new Presence generations.
    if (connected === true && !HEARTBEAT_FAILURE_STATES.has(state.heartbeatLastStatus)) return true;
    if (reconnectInFlight) return false;
    if (HEARTBEAT_FAILURE_STATES.has(state.heartbeatLastStatus)) {
      void requestReconnect(`heartbeat:${state.heartbeatLastStatus}`);
    }
    return false;
  }

  function setRecoveryHandler(handler) {
    recoveryHandler = typeof handler === "function" ? handler : null;
    if (recoveryHandler && pendingRecoveryReason) {
      const reason = pendingRecoveryReason;
      pendingRecoveryReason = "";
      void requestReconnect(reason);
    }
  }

  function attachClient(client) {
    realtimeClient = client || null;
    return realtimeClient;
  }

  function getSnapshot() {
    const currentAt = nowMs();
    const recentRecoveries = recoveryHistory.filter((entry) => currentAt - entry.at <= RECOVERY_HISTORY_WINDOW_MS);
    return {
      ...state,
      reconnectInFlight,
      transportConnected: isTransportConnected(),
      socketRecoveriesLast5m: recentRecoveries.filter((entry) => entry.origin === "socket-driven").length,
      clientRecoveriesLast5m: recentRecoveries.filter((entry) => entry.origin === "client-driven").length,
      recoveryReasons: recentRecoveries.map((entry) => ({ ...entry })),
      recoverySequence: {
        subscribedAt,
        trackOkAt,
        syncAfterTrackOkAt,
      },
    };
  }

  return {
    attachClient,
    checkConnection,
    getSnapshot,
    handleHeartbeat,
    notePresenceStage,
    requestReconnect,
    setRecoveryHandler,
  };
}
