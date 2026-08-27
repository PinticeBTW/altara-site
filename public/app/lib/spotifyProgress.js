const DEFAULT_SPOTIFY_PROGRESS_TICK_MS = 1000;

function finiteNonNegative(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function clamp(value, minimum, maximum) {
  const safeValue = finiteNonNegative(value, minimum);
  if (!Number.isFinite(maximum)) return Math.max(minimum, safeValue);
  return Math.max(minimum, Math.min(maximum, safeValue));
}

export function getSpotifyProgressAnchor(activity = null, nowMs = Date.now()) {
  const source = activity && typeof activity === "object" ? activity : {};
  const durationMs = finiteNonNegative(source.durationMs ?? source.duration_ms, 0);
  const maximum = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  const anchorProgressMs = clamp(source.progressMs ?? source.progress_ms, 0, maximum);
  const explicitTimestamp = Number(
    source.progressUpdatedAt
    ?? source.progress_updated_at
    ?? source.confirmedAt
    ?? source.confirmed_at
    ?? source.fetchedAt
    ?? source.fetched_at
    ?? source.updatedAt
    ?? source.updated_at
    ?? 0
  );
  const startedAt = Number(source.startedAt ?? source.started_at ?? 0);
  const derivedTimestamp = Number.isFinite(startedAt) && startedAt > 0
    ? startedAt + anchorProgressMs
    : Number(nowMs);
  const anchorTimestamp = Number.isFinite(explicitTimestamp) && explicitTimestamp > 0
    ? explicitTimestamp
    : (Number.isFinite(derivedTimestamp) && derivedTimestamp > 0 ? derivedTimestamp : 0);
  return {
    anchorProgressMs,
    durationMs,
    anchorTimestamp,
    isPlaying: source.isPlaying !== false && source.is_playing !== false,
  };
}

export function getSpotifyInterpolatedProgress(activityOrAnchor = null, nowMs = Date.now()) {
  const anchor = activityOrAnchor && Object.prototype.hasOwnProperty.call(activityOrAnchor, "anchorProgressMs")
    ? activityOrAnchor
    : getSpotifyProgressAnchor(activityOrAnchor, nowMs);
  const durationMs = finiteNonNegative(anchor.durationMs, 0);
  const maximum = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  const anchorProgressMs = clamp(anchor.anchorProgressMs, 0, maximum);
  const anchorTimestamp = finiteNonNegative(anchor.anchorTimestamp, 0);
  const elapsedSinceAnchor = anchor.isPlaying !== false && anchorTimestamp > 0
    ? Math.max(0, Number(nowMs) - anchorTimestamp)
    : 0;
  const progressMs = clamp(anchorProgressMs + elapsedSinceAnchor, 0, maximum);
  const percent = durationMs > 0
    ? clamp((progressMs / durationMs) * 100, 0, 100)
    : 0;
  return {
    progressMs,
    durationMs,
    percent,
    anchorProgressMs,
    anchorTimestamp,
    isPlaying: anchor.isPlaying !== false,
  };
}

export function formatSpotifyProgressTime(msInput = 0) {
  const totalSeconds = Math.floor(finiteNonNegative(msInput, 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes) + ":" + String(seconds).padStart(2, "0");
}

function readNumberAttribute(element, name, fallback = 0) {
  const raw = element?.getAttribute?.(name);
  if (raw == null || String(raw).trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readSpotifyProgressElementAnchor(element, nowMs = Date.now()) {
  const anchorProgressMs = readNumberAttribute(
    element,
    "data-spotify-anchor-progress-ms",
    readNumberAttribute(element, "data-spotify-progress-ms", 0),
  );
  const durationMs = readNumberAttribute(element, "data-spotify-duration-ms", 0);
  let anchorTimestamp = readNumberAttribute(element, "data-spotify-anchor-timestamp", 0);
  if (!(anchorTimestamp > 0)) {
    const startedAt = readNumberAttribute(element, "data-spotify-started-at", 0);
    anchorTimestamp = startedAt > 0 ? startedAt + anchorProgressMs : Number(nowMs);
  }
  return getSpotifyProgressAnchor({
    progressMs: anchorProgressMs,
    durationMs,
    fetchedAt: anchorTimestamp,
    isPlaying: element?.getAttribute?.("data-spotify-is-playing") !== "0",
  }, nowMs);
}

export function updateSpotifyProgressElement(element, nowMs = Date.now()) {
  if (!element) return { updatedCount: 0, tickable: false, progressMs: 0, durationMs: 0 };
  const progress = getSpotifyInterpolatedProgress(readSpotifyProgressElementAnchor(element, nowMs), nowMs);
  const label = element.querySelector?.("[data-spotify-progress-label]") || null;
  const nextLabel = progress.durationMs > 0
    ? formatSpotifyProgressTime(progress.progressMs) + " / " + formatSpotifyProgressTime(progress.durationMs)
    : "";
  let updatedCount = 0;
  if (label && label.textContent !== nextLabel) {
    label.textContent = nextLabel;
    updatedCount += 1;
  }
  const bar = element.querySelector?.(".spotifyActivityProgress__bar span") || null;
  const nextPercent = progress.percent.toFixed(2) + "%";
  if (bar?.style && String(bar.style.getPropertyValue?.("--spotify-progress") || "") !== nextPercent) {
    bar.style.setProperty?.("--spotify-progress", nextPercent);
    updatedCount += 1;
  }
  const tickable = progress.isPlaying && progress.durationMs > 0 && progress.progressMs < progress.durationMs;
  return { ...progress, updatedCount, tickable };
}

export function rebaseSpotifyProgressElements(activity = null, options = {}) {
  const source = activity && typeof activity === "object" ? activity : null;
  if (!source) return 0;
  const root = options.root || (typeof document !== "undefined" ? document : null);
  if (!root || typeof root.querySelectorAll !== "function") return 0;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const nextAnchor = getSpotifyProgressAnchor(source, nowMs);
  const previousAnchor = options.previousActivity
    ? getSpotifyProgressAnchor(options.previousActivity, nowMs)
    : null;
  const trackId = String(source.trackId || source.track_id || source.id || "").trim();
  let rebasedCount = 0;
  for (const element of root.querySelectorAll("[data-spotify-activity-progress]")) {
    const elementTrackId = String(element.getAttribute?.("data-spotify-track-id") || "").trim();
    if (trackId && elementTrackId && elementTrackId !== trackId) continue;
    const elementTimestamp = readNumberAttribute(element, "data-spotify-anchor-timestamp", 0);
    if (previousAnchor?.anchorTimestamp > 0 && elementTimestamp > 0 && elementTimestamp !== previousAnchor.anchorTimestamp) continue;
    element.setAttribute?.("data-spotify-track-id", trackId);
    element.setAttribute?.("data-spotify-anchor-progress-ms", String(nextAnchor.anchorProgressMs));
    element.setAttribute?.("data-spotify-anchor-timestamp", String(nextAnchor.anchorTimestamp));
    element.setAttribute?.("data-spotify-progress-ms", String(nextAnchor.anchorProgressMs));
    element.setAttribute?.("data-spotify-duration-ms", String(nextAnchor.durationMs));
    element.setAttribute?.("data-spotify-is-playing", nextAnchor.isPlaying ? "1" : "0");
    element.setAttribute?.("data-spotify-started-at", String(Math.max(1, nextAnchor.anchorTimestamp - nextAnchor.anchorProgressMs)));
    updateSpotifyProgressElement(element, nowMs);
    rebasedCount += 1;
  }
  return rebasedCount;
}

function isProgressElementVisible(element) {
  if (!element || element.isConnected === false || element.hidden === true) return false;
  if (typeof element.closest === "function" && element.closest('[hidden], [aria-hidden="true"], .hidden')) return false;
  return true;
}

export function createSpotifyProgressTicker(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const getElements = typeof options.getElements === "function"
    ? options.getElements
    : () => (typeof document === "undefined" ? [] : Array.from(document.querySelectorAll("[data-spotify-activity-progress]")));
  const isDocumentVisible = typeof options.isDocumentVisible === "function"
    ? options.isDocumentVisible
    : () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const scheduleInterval = typeof options.setIntervalFn === "function" ? options.setIntervalFn : setInterval;
  const cancelInterval = typeof options.clearIntervalFn === "function" ? options.clearIntervalFn : clearInterval;
  const tickMs = Math.max(250, Math.round(Number(options.tickMs) || DEFAULT_SPOTIFY_PROGRESS_TICK_MS));
  const updateElement = typeof options.updateElement === "function" ? options.updateElement : updateSpotifyProgressElement;
  let timer = null;

  function stop() {
    if (timer !== null) cancelInterval(timer);
    timer = null;
  }

  function tick() {
    const at = now();
    const elements = Array.from(getElements() || []);
    let updatedCount = 0;
    let hasTickableElement = false;
    for (const element of elements) {
      const visible = isProgressElementVisible(element);
      const result = updateElement(element, at) || {};
      updatedCount += Math.max(0, Number(result.updatedCount || 0));
      if (visible && result.tickable === true) hasTickableElement = true;
    }
    if (!isDocumentVisible() || !hasTickableElement) stop();
    return { updatedCount, hasTickableElement, elementCount: elements.length, now: at };
  }

  function sync() {
    const result = tick();
    if (isDocumentVisible() && result.hasTickableElement && timer === null) {
      timer = scheduleInterval(tick, tickMs);
    }
    return result;
  }

  return {
    sync,
    tick,
    stop,
    isRunning: () => timer !== null,
    getTickMs: () => tickMs,
  };
}

const sharedSpotifyProgressTicker = createSpotifyProgressTicker();
let sharedSyncQueued = false;
let visibilityListenerBound = false;

function bindSpotifyProgressVisibilityListener() {
  if (visibilityListenerBound || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  visibilityListenerBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sharedSpotifyProgressTicker.stop();
    else sharedSpotifyProgressTicker.sync();
  });
}

export function syncSpotifyProgressTicker() {
  bindSpotifyProgressVisibilityListener();
  return sharedSpotifyProgressTicker.sync();
}

export function scheduleSpotifyProgressTickerSync() {
  bindSpotifyProgressVisibilityListener();
  if (sharedSyncQueued) return;
  sharedSyncQueued = true;
  const run = () => {
    sharedSyncQueued = false;
    sharedSpotifyProgressTicker.sync();
  };
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else Promise.resolve().then(run);
}

export function updateSpotifyProgressElements() {
  bindSpotifyProgressVisibilityListener();
  return sharedSpotifyProgressTicker.tick();
}
