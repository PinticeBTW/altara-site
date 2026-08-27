const DEFAULT_ACTIVE_INTERVAL_MS = 12000;
const DEFAULT_INACTIVE_INTERVAL_MS = 45000;
const DEFAULT_BACKGROUND_ACTIVE_INTERVAL_MS = 30000;
const DEFAULT_BACKGROUND_INACTIVE_INTERVAL_MS = 60000;
const DEFAULT_FOCUS_STALE_MS = 10000;
const DEFAULT_ACTIVITY_LEASE_MS = 75000;
const DEFAULT_TRANSIENT_RETRY_BASE_MS = 5000;
const DEFAULT_TRANSIENT_RETRY_MAX_MS = 30000;

function clampInterval(value, fallback, minimum = 1000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.round(parsed)) : fallback;
}

function normalizeResult(input = null) {
  const result = input && typeof input === "object" ? input : {};
  const kind = String(result.kind || "transient-error").trim().toLowerCase();
  if (kind === "playing" && result.activity && typeof result.activity === "object") {
    return { ...result, kind: "playing" };
  }
  if (kind === "inactive" || kind === "auth-invalid" || kind === "transient-error") {
    return { ...result, kind };
  }
  return {
    ...result,
    kind: "transient-error",
    reason: String(result.reason || "spotify_invalid_controller_result"),
  };
}

function safeReason(value = "", fallback = "spotify_activity") {
  return String(value || fallback).trim().slice(0, 120) || fallback;
}

export function getSpotifyPublicActivitySignature(activity = null) {
  if (!activity || typeof activity !== "object") return "";
  return [
    "listening",
    "spotify",
    String(activity.trackId || activity.track_id || "").trim(),
    String(activity.title || activity.name || "").trim(),
    String(activity.artist || activity.details || "").trim(),
    String(activity.album || "").trim(),
    String(activity.artworkUrl || activity.artwork_url || "").trim(),
    String(Math.max(0, Number(activity.durationMs ?? activity.duration_ms ?? 0) || 0)),
    String(activity.externalUrl || activity.external_url || "").trim(),
    activity.showOnProfile === false || activity.show_on_profile === false ? "hidden" : "shown",
    activity.showProgress === false || activity.show_progress === false ? "progress-hidden" : "progress-shown",
  ].join("|");
}

export function createSpotifyActivityController(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const scheduleTimeout = typeof options.setTimeoutFn === "function" ? options.setTimeoutFn : setTimeout;
  const cancelTimeout = typeof options.clearTimeoutFn === "function" ? options.clearTimeoutFn : clearTimeout;
  const fetchPlayback = typeof options.fetchPlayback === "function"
    ? options.fetchPlayback
    : async () => ({ kind: "transient-error", reason: "spotify_fetch_not_configured" });
  const isEnabled = typeof options.isEnabled === "function" ? options.isEnabled : () => true;
  const isVisible = typeof options.isVisible === "function" ? options.isVisible : () => true;
  const getConnected = typeof options.getConnected === "function" ? options.getConnected : () => false;
  const getSharingEnabled = typeof options.getSharingEnabled === "function" ? options.getSharingEnabled : () => false;
  const onActivity = typeof options.onActivity === "function" ? options.onActivity : () => {};
  const onClear = typeof options.onClear === "function" ? options.onClear : () => {};
  const onInactive = typeof options.onInactive === "function" ? options.onInactive : () => {};
  const onTransientFailure = typeof options.onTransientFailure === "function" ? options.onTransientFailure : () => {};
  const onAuthInvalid = typeof options.onAuthInvalid === "function" ? options.onAuthInvalid : () => {};

  const activeIntervalMs = clampInterval(options.activeIntervalMs, DEFAULT_ACTIVE_INTERVAL_MS);
  const inactiveIntervalMs = clampInterval(options.inactiveIntervalMs, DEFAULT_INACTIVE_INTERVAL_MS);
  const backgroundActiveIntervalMs = clampInterval(options.backgroundActiveIntervalMs, DEFAULT_BACKGROUND_ACTIVE_INTERVAL_MS);
  const backgroundInactiveIntervalMs = clampInterval(options.backgroundInactiveIntervalMs, DEFAULT_BACKGROUND_INACTIVE_INTERVAL_MS);
  const focusStaleMs = clampInterval(options.focusStaleMs, DEFAULT_FOCUS_STALE_MS);
  const activityLeaseMs = clampInterval(options.activityLeaseMs, DEFAULT_ACTIVITY_LEASE_MS);
  const transientRetryBaseMs = clampInterval(options.transientRetryBaseMs, DEFAULT_TRANSIENT_RETRY_BASE_MS);
  const transientRetryMaxMs = clampInterval(options.transientRetryMaxMs, DEFAULT_TRANSIENT_RETRY_MAX_MS);

  let controllerRunning = false;
  let pollTimer = null;
  let fetchInFlight = null;
  let controllerEpoch = 0;
  let currentActivity = null;
  let currentActivityFreshUntil = 0;
  let nextRefreshAt = 0;
  let pollIntervalMs = 0;
  let lastFetchStartedAt = 0;
  let lastFetchFinishedAt = 0;
  let lastFetchResult = "never";
  let lastSuccessfulPlaybackCheckAt = 0;
  let lastPlaybackState = "unknown";
  let consecutiveTransientFailures = 0;
  let lastClearReason = "";
  let lastPresenceActivityPublishAt = 0;
  let lastPresenceActivityPublishReason = "";
  let startupFetchPerformed = false;

  function clearTimer() {
    if (pollTimer !== null) cancelTimeout(pollTimer);
    pollTimer = null;
    nextRefreshAt = 0;
    pollIntervalMs = 0;
  }

  function hasFreshActivity(at = now()) {
    return !!currentActivity && currentActivityFreshUntil > 0 && at <= currentActivityFreshUntil;
  }

  function getNormalPollInterval(at = now()) {
    const active = hasFreshActivity(at);
    if (!isVisible()) return active ? backgroundActiveIntervalMs : backgroundInactiveIntervalMs;
    return active ? activeIntervalMs : inactiveIntervalMs;
  }

  function getTransientRetryInterval() {
    const exponent = Math.max(0, consecutiveTransientFailures - 1);
    return Math.min(transientRetryMaxMs, transientRetryBaseMs * (2 ** Math.min(exponent, 6)));
  }

  function clearCurrentActivity(reason = "spotify_cleared", context = {}) {
    const clearReason = safeReason(reason, "spotify_cleared");
    const previousActivity = currentActivity;
    currentActivity = null;
    currentActivityFreshUntil = 0;
    lastClearReason = clearReason;
    if (previousActivity) {
      onClear({
        ...context,
        reason: clearReason,
        previousActivity,
      });
    }
    return previousActivity;
  }

  function scheduleNextRefresh(delayOverride = null) {
    clearTimer();
    if (!controllerRunning || !isEnabled()) return 0;
    const at = now();
    let delay = delayOverride == null
      ? (lastFetchResult === "transient-error" ? getTransientRetryInterval() : getNormalPollInterval(at))
      : clampInterval(delayOverride, getNormalPollInterval(at), 0);
    if (currentActivity && currentActivityFreshUntil > at) {
      delay = Math.min(delay, Math.max(1, currentActivityFreshUntil - at));
    }
    pollIntervalMs = delay;
    nextRefreshAt = at + delay;
    pollTimer = scheduleTimeout(() => {
      pollTimer = null;
      nextRefreshAt = 0;
      pollIntervalMs = 0;
      void refresh({ reason: "scheduled-poll" });
    }, delay);
    return delay;
  }

  async function refresh({ reason = "manual-refresh", force = false, manual = false } = {}) {
    const refreshReason = safeReason(reason, "manual-refresh");
    if (!controllerRunning && force === true) controllerRunning = true;
    if (!controllerRunning || !isEnabled()) {
      if (controllerRunning || currentActivity) stop({ clearActivity: true, reason: "controller-disabled" });
      return null;
    }
    if (fetchInFlight) return fetchInFlight;

    clearTimer();
    const refreshEpoch = controllerEpoch;
    lastFetchStartedAt = now();
    if (refreshReason.includes("startup")) startupFetchPerformed = true;

    const task = (async () => {
      let result;
      try {
        result = normalizeResult(await fetchPlayback({ reason: refreshReason, manual }));
      } catch (error) {
        result = {
          kind: "transient-error",
          reason: safeReason(error?.code || error?.message || "spotify_fetch_failed"),
        };
      }

      const finishedAt = now();
      lastFetchFinishedAt = finishedAt;
      if (refreshEpoch !== controllerEpoch || !controllerRunning || !isEnabled()) return null;

      if (result.kind === "playing") {
        const previousActivity = currentActivity;
        const activity = {
          ...result.activity,
          fetchedAt: finishedAt,
          updatedAt: finishedAt,
        };
        currentActivity = activity;
        currentActivityFreshUntil = finishedAt + activityLeaseMs;
        lastSuccessfulPlaybackCheckAt = finishedAt;
        lastPlaybackState = "playing";
        lastFetchResult = "playing";
        consecutiveTransientFailures = 0;
        onActivity(activity, {
          reason: refreshReason,
          manual,
          freshUntil: currentActivityFreshUntil,
          tokenRefreshed: result.tokenRefreshed === true,
          previousActivity,
        });
        return activity;
      }

      if (result.kind === "inactive") {
        lastSuccessfulPlaybackCheckAt = finishedAt;
        lastPlaybackState = "inactive";
        lastFetchResult = "inactive";
        consecutiveTransientFailures = 0;
        clearCurrentActivity(result.reason || "spotify_nothing_playing", { manual, explicit: true });
        onInactive({ ...result, reason: safeReason(result.reason, "spotify_nothing_playing"), manual });
        return null;
      }

      if (result.kind === "auth-invalid") {
        lastPlaybackState = "auth-invalid";
        lastFetchResult = "auth-invalid";
        consecutiveTransientFailures = 0;
        clearCurrentActivity(result.reason || "spotify_auth_invalid", { manual, explicit: true });
        onAuthInvalid({ ...result, reason: safeReason(result.reason, "spotify_auth_invalid"), manual });
        controllerRunning = false;
        clearTimer();
        return null;
      }

      lastFetchResult = "transient-error";
      consecutiveTransientFailures += 1;
      const expired = !!currentActivity && currentActivityFreshUntil > 0 && finishedAt >= currentActivityFreshUntil;
      if (expired) {
        lastPlaybackState = "stale-expired";
        clearCurrentActivity("spotify_transient_stale_expired", { manual, explicit: false });
      } else if (currentActivity) {
        lastPlaybackState = "playing-grace";
      } else {
        lastPlaybackState = "unknown";
      }
      onTransientFailure({
        ...result,
        reason: safeReason(result.reason, "spotify_transient_error"),
        manual,
        preservedActivity: !!currentActivity,
        freshUntil: currentActivityFreshUntil,
        consecutiveTransientFailures,
      });
      return currentActivity;
    })();

    fetchInFlight = task;
    try {
      return await task;
    } finally {
      if (fetchInFlight === task) fetchInFlight = null;
      if (controllerRunning && isEnabled()) {
        scheduleNextRefresh(refreshEpoch === controllerEpoch ? null : 0);
      } else {
        clearTimer();
      }
    }
  }

  function start({ immediate = false, reason = "controller-start" } = {}) {
    if (!isEnabled()) {
      stop({ clearActivity: true, reason: "controller-disabled" });
      return Promise.resolve(null);
    }
    controllerRunning = true;
    if (immediate) return refresh({ reason, force: true });
    if (pollTimer === null && !fetchInFlight) scheduleNextRefresh();
    return fetchInFlight || Promise.resolve(currentActivity);
  }

  function stop({ clearActivity = true, reason = "controller-stop" } = {}) {
    controllerRunning = false;
    controllerEpoch += 1;
    clearTimer();
    if (clearActivity) clearCurrentActivity(reason, { explicit: true });
    return currentActivity;
  }

  function refreshIfStale({ reason = "focus-visible", staleAfterMs = focusStaleMs } = {}) {
    const staleThreshold = clampInterval(staleAfterMs, focusStaleMs, 0);
    const referenceAt = Math.max(lastFetchFinishedAt, lastFetchStartedAt);
    const stale = referenceAt <= 0 || now() - referenceAt >= staleThreshold;
    if (!stale) {
      if (controllerRunning && !fetchInFlight) scheduleNextRefresh(getNormalPollInterval(now()));
      return fetchInFlight || Promise.resolve(currentActivity);
    }
    return start({ immediate: true, reason });
  }

  function notePresenceActivityPublish(reason = "activity-changed") {
    lastPresenceActivityPublishAt = now();
    lastPresenceActivityPublishReason = safeReason(reason, "activity-changed");
  }

  function getCurrentActivity() {
    return hasFreshActivity(now()) ? currentActivity : null;
  }

  function isActivityFresh(activity = null) {
    if (!activity || !currentActivity || !hasFreshActivity(now())) return false;
    const activityFetchedAt = Number(activity.fetchedAt || activity.updatedAt || 0);
    const currentFetchedAt = Number(currentActivity.fetchedAt || currentActivity.updatedAt || 0);
    return activityFetchedAt > 0 && activityFetchedAt === currentFetchedAt;
  }

  function getDebugSnapshot() {
    const connected = getConnected() === true;
    const sharingEnabled = getSharingEnabled() === true;
    return {
      connected,
      sharingEnabled,
      controllerRunning,
      fetchInFlight: !!fetchInFlight,
      lastFetchStartedAt,
      lastFetchFinishedAt,
      lastFetchResult,
      lastSuccessfulPlaybackCheckAt,
      lastPlaybackState,
      currentTrackId: String(currentActivity?.trackId || "").slice(0, 120) || null,
      currentActivityFreshUntil,
      nextRefreshAt,
      consecutiveTransientFailures,
      lastClearReason,
      lastPresenceActivityPublishAt,
      lastPresenceActivityPublishReason,
      pollIntervalMs,
      startupFetchPerformed,
    };
  }

  return {
    start,
    stop,
    refresh,
    refreshIfStale,
    getCurrentActivity,
    isActivityFresh,
    getDebugSnapshot,
    notePresenceActivityPublish,
  };
}
