const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LONG_WINDOW_MS = 5 * 60_000;
const DEFAULT_SAMPLE_MS = 100;
const DEFAULT_RESOURCE_SAMPLE_MS = 5_000;
const MAX_SAMPLES = 3_600;
const MAX_INPUTS = 120;
const MAX_SAFE_EVENTS = 200;
const MAX_FREEZE_CAPTURES = 8;
const MAX_RUNTIME_ERRORS = 120;
const MAX_DM_CHANNEL_EVENTS = 160;

const CONSOLE_CATEGORY_MATCHERS = Object.freeze([
  ["presence", /^(?:\[ALTARA-PRESENCE-TRACE\]|\[Presence\]|\[presence\])/i],
  ["server_voice", /^(?:\[ALTARA\]\[server-voice|\[server-voice|\[server-voice presence|\[voice-|\[voice-v2|\[voice-state|\[voice-move|\[voice-drag|\[bot-voice-ui)/i],
  ["dm_privacy", /^(?:\[ALTARA\]\[dm-|\[dm-events|\[dm-privacy|\[dm-request|\[MessageRequests)/i],
  ["typing", /^(?:\[typing|\[typing-status)/i],
  ["profiles", /^(?:\[profiles|\[PROFILE-INVALIDATION|\[user-popout)/i],
  ["message_render", /^(?:\[render|\[render-chat|\[message-load|\[message-send|\[timeline-append|\[bot-hydration|\[bot-live|\[bot-thinking)/i],
  ["call_render", /^(?:\[call-render|\[private-call|\[group-call|\[stage layout|\[ALTARA_(?:FOCUS|CAMERA|PARTICIPANT))/i],
  ["navigation", /^(?:\[sidebar-state|\[channel-select|\[channels-realtime)/i],
  ["realtime", /^(?:\[GDM-RT|\[friends-rt|\[friends-poll|\[connection)/i],
]);

export function classifyRuntimeConsoleCategory(args = []) {
  const first = String(Array.isArray(args) ? (args[0] ?? "") : (args ?? "")).trim();
  for (const [category, matcher] of CONSOLE_CATEGORY_MATCHERS) {
    if (matcher.test(first)) return category;
  }
  return "other";
}

export function isAlwaysVisibleRuntimeConsoleEntry(args = []) {
  const first = String(Array.isArray(args) ? (args[0] ?? "") : (args ?? "")).trim();
  return /^\[server-voice-(?:timing|sound|critical-lane|handler-timing|publication)\](?:\s|$)/i.test(first);
}

export function isVerboseRuntimeConsoleEntry(args = []) {
  return !isAlwaysVisibleRuntimeConsoleEntry(args)
    && classifyRuntimeConsoleCategory(args) !== "other";
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(1)) : null;
}

function toEpochMs(eventTimestamp, performanceImpl, dateNow) {
  const value = finiteNumber(eventTimestamp, 0);
  if (!value) return dateNow();
  const origin = finiteNumber(performanceImpl?.timeOrigin, 0);
  if (origin && value < origin) return origin + value;
  return value;
}

function classifySafeRuntimeError(value = null) {
  const error = value?.reason || value?.error || value || null;
  const name = String(error?.name || "").trim().toLowerCase();
  const message = String(error?.message || error || "").trim().toLowerCase();
  if (name === "referenceerror" || message.includes("referenceerror")) return "reference_error";
  if (name === "typeerror" || message.includes("typeerror")) return "type_error";
  if (name === "syntaxerror" || message.includes("syntaxerror")) return "syntax_error";
  if (name === "aborterror" || message.includes("aborterror")) return "abort_error";
  if (name === "notallowederror") return "permission_denied";
  if (message.includes("network") || message.includes("fetch")) return "network_error";
  return "runtime_error";
}

function sanitizeRuntimeSourceLabel(value = null, explicitLabel = "") {
  const explicit = String(explicitLabel || "").trim();
  if (explicit) return explicit.replace(/[^a-z0-9_$.-]+/gi, "_").slice(0, 80) || "runtime";
  const error = value?.reason || value?.error || value || null;
  const stack = String(error?.stack || "");
  const frame = stack.match(/\bat\s+(?:async\s+)?([a-z_$][\w$]*(?:\.[a-z_$][\w$]*)?)/i);
  if (frame?.[1]) return frame[1].slice(0, 80);
  const filename = String(value?.filename || error?.fileName || "").split(/[?#]/, 1)[0];
  const basename = filename.split(/[\\/]/).filter(Boolean).pop() || "";
  return basename.replace(/[^a-z0-9_$.-]+/gi, "_").slice(0, 80) || "runtime";
}

function trimByAge(entries, now, windowMs, maxEntries) {
  while (entries.length && now - finiteNumber(entries[0]?.at, now) > windowMs) entries.shift();
  if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
}

function summarizeDurations(entries = [], { since = 0 } = {}) {
  const durations = entries
    .filter((entry) => !since || finiteNumber(entry?.at, 0) >= since)
    .map((entry) => finiteNumber(entry?.durationMs, 0))
    .filter((duration) => duration > 0);
  return {
    count: durations.length,
    over50ms: durations.filter((duration) => duration > 50).length,
    over100ms: durations.filter((duration) => duration > 100).length,
    over250ms: durations.filter((duration) => duration > 250).length,
    over500ms: durations.filter((duration) => duration > 500).length,
    over1000ms: durations.filter((duration) => duration > 1000).length,
    over5000ms: durations.filter((duration) => duration > 5000).length,
    longestMs: roundMs(durations.length ? Math.max(...durations) : 0),
  };
}

function clippedIntervalMs(startedAt, endedAt, sinceAt, untilAt) {
  const start = Math.max(finiteNumber(startedAt, 0), finiteNumber(sinceAt, 0));
  const end = Math.min(finiteNumber(endedAt, 0), finiteNumber(untilAt, 0));
  return Math.max(0, end - start);
}

export function summarizeRuntimeLongTaskWindow(entries = [], {
  sinceAt = 0,
  untilAt = Date.now(),
} = {}) {
  const since = Math.max(0, finiteNumber(sinceAt, 0));
  const until = Math.max(since, finiteNumber(untilAt, Date.now()));
  const overlapping = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const durationMs = Math.max(0, finiteNumber(entry?.durationMs, 0));
    const startedAt = finiteNumber(entry?.startedAt, finiteNumber(entry?.at, 0) - durationMs);
    const endedAt = finiteNumber(entry?.endedAt, startedAt + durationMs);
    const key = `${startedAt}:${endedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const clippedMs = clippedIntervalMs(startedAt, endedAt, since, until);
    if (clippedMs <= 0) continue;
    overlapping.push({ startedAt, endedAt, durationMs, clippedMs });
  }
  return Object.freeze({
    count: overlapping.length,
    clippedTotalMs: roundMs(overlapping.reduce((total, entry) => total + entry.clippedMs, 0)),
    overlappingFullDurationMs: roundMs(overlapping.reduce((total, entry) => total + entry.durationMs, 0)),
    excessOver50Ms: roundMs(overlapping.reduce((total, entry) => (
      total + clippedIntervalMs(entry.startedAt + 50, entry.endedAt, since, until)
    ), 0)),
    maxClippedMs: roundMs(Math.max(0, ...overlapping.map((entry) => entry.clippedMs))),
  });
}

export function createRuntimePerfDiagnostics({
  windowImpl = globalThis.window,
  documentImpl = globalThis.document,
  performanceImpl = globalThis.performance,
  PerformanceObserverImpl = globalThis.PerformanceObserver,
  consoleImpl = globalThis.console,
  dateNow = () => Date.now(),
  sampleIntervalMs = DEFAULT_SAMPLE_MS,
  rollingWindowMs = DEFAULT_WINDOW_MS,
  longRollingWindowMs = DEFAULT_LONG_WINDOW_MS,
  resourceSampleIntervalMs = DEFAULT_RESOURCE_SAMPLE_MS,
  getRuntimeSnapshot = () => ({}),
  trackTimers = true,
  trackConsole = true,
  suppressVerboseConsole = true,
  isVerboseTraceEnabled = () => false,
} = {}) {
  const eventLoopSamples = [];
  const longTasks = [];
  const longTaskKeys = new Set();
  const animationFrameGaps = [];
  const taskQueueSamples = [];
  const microtaskQueueSamples = [];
  const resourceSamples = [];
  const inputEvents = [];
  const consoleBuckets = new Map();
  const activityBuckets = new Map();
  const safeEventRing = [];
  const freezeCaptures = [];
  const runtimeErrors = [];
  const dmChannelEvents = [];
  let consoleLastPrunedSecond = 0;
  let activityLastPrunedSecond = 0;
  const timerState = {
    trackingStartedAt: dateNow(),
    timeouts: new Set(),
    intervals: new Set(),
    animationFrames: new Set(),
    created: { timeout: 0, interval: 0, animationFrame: 0 },
    cleared: { timeout: 0, interval: 0, animationFrame: 0 },
    fired: { timeout: 0, interval: 0, animationFrame: 0 },
  };
  let eventLoopTimer = null;
  let animationFrameProbe = null;
  let longTaskObserver = null;
  let eventTimingObserver = null;
  let installed = false;
  let destroyed = false;
  let expectedSampleAt = 0;
  let sampleCount = 0;
  let lastAnimationFrameAt = 0;
  let lastPointerDownAt = null;
  let restoreTimers = null;
  let restoreConsole = null;
  let nativeSetTimeoutForProbe = null;
  let nativeRequestAnimationFrameForProbe = null;
  let nativeCancelAnimationFrameForProbe = null;
  let windowErrorHandler = null;
  let unhandledRejectionHandler = null;

  function perfNow() {
    return finiteNumber(performanceImpl?.now?.(), dateNow());
  }

  function recordInput(entry = {}) {
    const now = dateNow();
    const record = {
      at: now,
      type: String(entry.type || "click").slice(0, 32),
      source: String(entry.source || "capture").slice(0, 32),
      clickTimestamp: roundMs(entry.clickTimestamp),
      handlerStartTimestamp: roundMs(entry.handlerStartTimestamp),
      clickToHandlerMs: roundMs(entry.clickToHandlerMs),
      durationMs: roundMs(entry.durationMs),
      label: String(entry.label || "").slice(0, 80) || null,
      pointerDownTimestamp: roundMs(entry.pointerDownTimestamp),
      pointerDownToHandlerMs: roundMs(entry.pointerDownToHandlerMs),
    };
    inputEvents.push(record);
    trimByAge(inputEvents, now, rollingWindowMs, MAX_INPUTS);
    return record;
  }

  function recordSafeEvent(category = "runtime", event = "event", { durationMs = null, at = dateNow() } = {}) {
    safeEventRing.push({
      at: Number(at) || dateNow(),
      category: String(category || "runtime").trim().slice(0, 48) || "runtime",
      event: String(event || "event").trim().slice(0, 80) || "event",
      durationMs: roundMs(durationMs),
    });
    if (safeEventRing.length > MAX_SAFE_EVENTS) safeEventRing.splice(0, safeEventRing.length - MAX_SAFE_EVENTS);
  }

  function recordError(value = null, {
    kind = "handled_error",
    sourceLabel = "",
    at = dateNow(),
  } = {}) {
    const safeKind = ["uncaught_error", "unhandled_rejection", "handled_error"].includes(String(kind || ""))
      ? String(kind)
      : "handled_error";
    const entry = {
      at: Number(at) || dateNow(),
      kind: safeKind,
      category: classifySafeRuntimeError(value),
      sourceLabel: sanitizeRuntimeSourceLabel(value, sourceLabel),
    };
    runtimeErrors.push(entry);
    trimByAge(runtimeErrors, entry.at, longRollingWindowMs, MAX_RUNTIME_ERRORS);
    recordSafeEvent("runtime_error", `${entry.kind}:${entry.category}:${entry.sourceLabel}`, { at: entry.at });
    return { ...entry };
  }

  function installErrorTracking() {
    if (!windowImpl || windowErrorHandler || unhandledRejectionHandler) return;
    windowErrorHandler = (event) => recordError(event, { kind: "uncaught_error" });
    unhandledRejectionHandler = (event) => recordError(event, { kind: "unhandled_rejection" });
    windowImpl.addEventListener?.("error", windowErrorHandler);
    windowImpl.addEventListener?.("unhandledrejection", unhandledRejectionHandler);
  }

  function recordActivity(category = "runtime", event = "event", details = {}) {
    const now = Number(details?.at) || dateNow();
    const second = Math.floor(now / 1000);
    const safeCategory = String(category || "runtime").trim().toLowerCase().slice(0, 48) || "runtime";
    const bucket = activityBuckets.get(second) || Object.create(null);
    const current = bucket[safeCategory] || { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
    const durationMs = Math.max(0, finiteNumber(details?.durationMs, 0));
    current.count += 1;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    bucket[safeCategory] = current;
    activityBuckets.set(second, bucket);
    if (activityLastPrunedSecond !== second) {
      activityLastPrunedSecond = second;
      const oldestSecond = second - Math.ceil(longRollingWindowMs / 1000);
      for (const candidateSecond of activityBuckets.keys()) {
        if (candidateSecond < oldestSecond) activityBuckets.delete(candidateSecond);
      }
    }
    recordSafeEvent(safeCategory, event, { durationMs, at: now });
  }

  function recordDmChannelLifecycle(entry = {}) {
    const now = Number(entry?.timestamp || entry?.at) || dateNow();
    const family = ["messages", "reactions"].includes(String(entry?.family || "").toLowerCase())
      ? String(entry.family).toLowerCase()
      : "messages";
    const action = String(entry?.action || "status").trim().toLowerCase().slice(0, 32) || "status";
    const reason = String(entry?.reason || "unspecified").trim().toLowerCase().slice(0, 96) || "unspecified";
    dmChannelEvents.push({
      timestamp: now,
      conversationId: String(entry?.conversationId || "").trim().slice(0, 80) || null,
      family,
      action,
      reason,
      ownerGeneration: Math.max(0, Math.trunc(finiteNumber(entry?.ownerGeneration, 0))),
      activeConversationMatch: entry?.activeConversationMatch === true,
    });
    if (dmChannelEvents.length > MAX_DM_CHANNEL_EVENTS) {
      dmChannelEvents.splice(0, dmChannelEvents.length - MAX_DM_CHANNEL_EVENTS);
    }
    recordSafeEvent("dm_realtime_channel", `${family}:${action}:${reason}`, { at: now });
  }

  function captureFreeze(durationMs, source = "event_loop") {
    const now = dateNow();
    freezeCaptures.push({
      at: now,
      source: String(source || "event_loop").slice(0, 48),
      durationMs: roundMs(durationMs),
      eventsBefore: safeEventRing.slice(-60).map((entry) => ({ ...entry })),
    });
    if (freezeCaptures.length > MAX_FREEZE_CAPTURES) {
      freezeCaptures.splice(0, freezeCaptures.length - MAX_FREEZE_CAPTURES);
    }
    recordSafeEvent("freeze", source, { durationMs, at: now });
  }

  function capturePointerDown(event) {
    if (!event || String(event.type || "").toLowerCase() !== "pointerdown") return;
    lastPointerDownAt = toEpochMs(event.timeStamp, performanceImpl, dateNow);
  }

  function captureInput(event) {
    if (!event || String(event.type || "").toLowerCase() !== "click") return;
    const handlerStartEpoch = dateNow();
    const clickEpoch = toEpochMs(event.timeStamp, performanceImpl, dateNow);
    recordInput({
      type: "click",
      source: "capture",
      clickTimestamp: clickEpoch,
      handlerStartTimestamp: handlerStartEpoch,
      clickToHandlerMs: Math.max(0, handlerStartEpoch - clickEpoch),
      pointerDownTimestamp: lastPointerDownAt,
      pointerDownToHandlerMs: lastPointerDownAt == null ? null : Math.max(0, handlerStartEpoch - lastPointerDownAt),
    });
  }

  function handleVisibilityChange() {
    // Background rAF suspension is platform behavior, not a renderer freeze.
    lastAnimationFrameAt = dateNow();
  }

  function markInputHandlerStart(label = "application_handler", event = null) {
    const handlerStartEpoch = dateNow();
    const clickEpoch = event
      ? toEpochMs(event.timeStamp, performanceImpl, dateNow)
      : finiteNumber(inputEvents[inputEvents.length - 1]?.clickTimestamp, handlerStartEpoch);
    return recordInput({
      type: String(event?.type || "click"),
      source: "application_handler",
      clickTimestamp: clickEpoch,
      handlerStartTimestamp: handlerStartEpoch,
      clickToHandlerMs: Math.max(0, handlerStartEpoch - clickEpoch),
      label,
      pointerDownTimestamp: lastPointerDownAt,
      pointerDownToHandlerMs: lastPointerDownAt == null ? null : Math.max(0, handlerStartEpoch - lastPointerDownAt),
    });
  }

  function installObservers() {
    if (typeof PerformanceObserverImpl !== "function") return;
    try {
      longTaskObserver = new PerformanceObserverImpl((list) => {
        const now = dateNow();
        for (const entry of list.getEntries()) {
          const durationMs = Math.max(0, finiteNumber(entry.duration, 0));
          const startedAt = toEpochMs(entry.startTime, performanceImpl, dateNow);
          const endedAt = startedAt + durationMs;
          const key = `${roundMs(startedAt)}:${roundMs(endedAt)}`;
          if (longTaskKeys.has(key)) continue;
          longTaskKeys.add(key);
          longTasks.push({
            at: endedAt || now,
            observedAt: now,
            startedAt: roundMs(startedAt),
            endedAt: roundMs(endedAt),
            durationMs: roundMs(durationMs),
            name: String(entry.name || "longtask").slice(0, 48),
            key,
          });
        }
        trimByAge(longTasks, now, longRollingWindowMs, MAX_SAMPLES);
        const retainedKeys = new Set(longTasks.map((entry) => entry.key).filter(Boolean));
        for (const key of longTaskKeys) {
          if (!retainedKeys.has(key)) longTaskKeys.delete(key);
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch (_) {
      longTaskObserver = null;
    }
    try {
      eventTimingObserver = new PerformanceObserverImpl((list) => {
        for (const entry of list.getEntries()) {
          if (String(entry.name || "").toLowerCase() !== "click") continue;
          const origin = finiteNumber(performanceImpl?.timeOrigin, 0);
          const clickEpoch = origin + finiteNumber(entry.startTime, 0);
          const handlerEpoch = origin + finiteNumber(entry.processingStart, entry.startTime);
          recordInput({
            type: "click",
            source: "event_timing",
            clickTimestamp: clickEpoch,
            handlerStartTimestamp: handlerEpoch,
            clickToHandlerMs: Math.max(0, handlerEpoch - clickEpoch),
            durationMs: entry.duration,
          });
        }
      });
      eventTimingObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch (_) {
      eventTimingObserver = null;
    }
  }

  function installTimerTracking() {
    if (!trackTimers || !windowImpl || restoreTimers) return;
    const nativeSetTimeout = windowImpl.setTimeout?.bind(windowImpl);
    const nativeClearTimeout = windowImpl.clearTimeout?.bind(windowImpl);
    const nativeSetInterval = windowImpl.setInterval?.bind(windowImpl);
    const nativeClearInterval = windowImpl.clearInterval?.bind(windowImpl);
    const nativeRequestAnimationFrame = windowImpl.requestAnimationFrame?.bind(windowImpl);
    const nativeCancelAnimationFrame = windowImpl.cancelAnimationFrame?.bind(windowImpl);
    if (!nativeSetTimeout || !nativeClearTimeout || !nativeSetInterval || !nativeClearInterval) return;

    nativeSetTimeoutForProbe = nativeSetTimeout;
    nativeRequestAnimationFrameForProbe = nativeRequestAnimationFrame || null;
    nativeCancelAnimationFrameForProbe = nativeCancelAnimationFrame || null;
    windowImpl.setTimeout = (callback, delay, ...args) => {
      let handle = null;
      const wrapped = (...callbackArgs) => {
        timerState.timeouts.delete(handle);
        timerState.fired.timeout += 1;
        if (typeof callback === "function") return callback(...callbackArgs);
        return undefined;
      };
      handle = nativeSetTimeout(wrapped, delay, ...args);
      timerState.timeouts.add(handle);
      timerState.created.timeout += 1;
      return handle;
    };
    windowImpl.clearTimeout = (handle) => {
      timerState.timeouts.delete(handle);
      timerState.cleared.timeout += 1;
      return nativeClearTimeout(handle);
    };
    windowImpl.setInterval = (callback, delay, ...args) => {
      const handle = nativeSetInterval((...callbackArgs) => {
        timerState.fired.interval += 1;
        if (typeof callback === "function") return callback(...callbackArgs);
        return undefined;
      }, delay, ...args);
      timerState.intervals.add(handle);
      timerState.created.interval += 1;
      return handle;
    };
    windowImpl.clearInterval = (handle) => {
      timerState.intervals.delete(handle);
      timerState.cleared.interval += 1;
      return nativeClearInterval(handle);
    };
    if (nativeRequestAnimationFrame && nativeCancelAnimationFrame) {
      windowImpl.requestAnimationFrame = (callback) => {
        let handle = null;
        handle = nativeRequestAnimationFrame((timestamp) => {
          timerState.animationFrames.delete(handle);
          timerState.fired.animationFrame += 1;
          callback(timestamp);
        });
        timerState.animationFrames.add(handle);
        timerState.created.animationFrame += 1;
        return handle;
      };
      windowImpl.cancelAnimationFrame = (handle) => {
        timerState.animationFrames.delete(handle);
        timerState.cleared.animationFrame += 1;
        return nativeCancelAnimationFrame(handle);
      };
    }
    restoreTimers = () => {
      windowImpl.setTimeout = nativeSetTimeout;
      windowImpl.clearTimeout = nativeClearTimeout;
      windowImpl.setInterval = nativeSetInterval;
      windowImpl.clearInterval = nativeClearInterval;
      if (nativeRequestAnimationFrame && nativeCancelAnimationFrame) {
        windowImpl.requestAnimationFrame = nativeRequestAnimationFrame;
        windowImpl.cancelAnimationFrame = nativeCancelAnimationFrame;
      }
    };
  }

  function installConsoleTracking() {
    if (!trackConsole || !consoleImpl || restoreConsole) return;
    const originals = new Map();
    for (const level of ["log", "info", "debug", "warn", "error"]) {
      const original = consoleImpl[level];
      if (typeof original !== "function") continue;
      const wrapped = (...args) => {
        const now = dateNow();
        const second = Math.floor(now / 1000);
        const category = classifyRuntimeConsoleCategory(args);
        const verbose = isVerboseRuntimeConsoleEntry(args);
        const verboseEnabled = (() => {
          try { return isVerboseTraceEnabled?.() === true; } catch (_) { return false; }
        })();
        const suppressed = level !== "warn" && level !== "error" && suppressVerboseConsole && verbose && !verboseEnabled;
        const bucket = consoleBuckets.get(second) || {
          log: 0, info: 0, debug: 0, warn: 0, error: 0,
          emitted: 0, suppressed: 0, byCategory: Object.create(null),
        };
        bucket[level] += 1;
        bucket[suppressed ? "suppressed" : "emitted"] += 1;
        const categoryCounts = bucket.byCategory[category] || { attempted: 0, emitted: 0, suppressed: 0 };
        categoryCounts.attempted += 1;
        categoryCounts[suppressed ? "suppressed" : "emitted"] += 1;
        bucket.byCategory[category] = categoryCounts;
        consoleBuckets.set(second, bucket);
        if (consoleLastPrunedSecond !== second) {
          consoleLastPrunedSecond = second;
          const oldestSecond = second - Math.max(1, Math.ceil(longRollingWindowMs / 1000) - 1);
          for (const candidateSecond of consoleBuckets.keys()) {
            if (candidateSecond < oldestSecond) consoleBuckets.delete(candidateSecond);
          }
        }
        recordActivity(`log_${category}`, suppressed ? "suppressed" : "emitted");
        if (suppressed) return undefined;
        return original.apply(consoleImpl, args);
      };
      try {
        consoleImpl[level] = wrapped;
        if (consoleImpl[level] === wrapped) originals.set(level, original);
      } catch (_) {}
    }
    restoreConsole = () => {
      for (const [level, original] of originals) {
        try { consoleImpl[level] = original; } catch (_) {}
      }
    };
  }

  function sampleEventLoop() {
    const nowPerf = perfNow();
    const lagMs = Math.max(0, nowPerf - expectedSampleAt);
    const now = dateNow();
    eventLoopSamples.push({ at: now, durationMs: roundMs(lagMs) });
    trimByAge(eventLoopSamples, now, longRollingWindowMs, MAX_SAMPLES);
    if (lagMs > 250) captureFreeze(lagMs, "event_loop_gap");
    expectedSampleAt = nowPerf + sampleIntervalMs;
    sampleCount += 1;
    if (sampleCount % Math.max(1, Math.round(1000 / sampleIntervalMs)) === 0) {
      const probeStartedAt = perfNow();
      const queueMicrotaskImpl = globalThis.queueMicrotask;
      if (typeof queueMicrotaskImpl === "function") {
        queueMicrotaskImpl(() => {
          const completedAt = dateNow();
          microtaskQueueSamples.push({ at: completedAt, durationMs: roundMs(Math.max(0, perfNow() - probeStartedAt)) });
          trimByAge(microtaskQueueSamples, completedAt, longRollingWindowMs, MAX_SAMPLES);
        });
      }
      nativeSetTimeoutForProbe?.(() => {
        const completedAt = dateNow();
        taskQueueSamples.push({ at: completedAt, durationMs: roundMs(Math.max(0, perfNow() - probeStartedAt)) });
        trimByAge(taskQueueSamples, completedAt, longRollingWindowMs, MAX_SAMPLES);
      }, 0);
    }
    if (sampleCount % Math.max(1, Math.round(resourceSampleIntervalMs / sampleIntervalMs)) === 0) sampleResources();
  }

  function sampleResources() {
    const now = dateNow();
    const heap = performanceImpl?.memory || null;
    resourceSamples.push({
      at: now,
      domNodeCount: documentImpl?.getElementsByTagName?.("*")?.length ?? null,
      usedHeapBytes: heap ? (finiteNumber(heap.usedJSHeapSize, 0) || null) : null,
    });
    trimByAge(resourceSamples, now, longRollingWindowMs, 120);
  }

  function onAnimationFrame() {
    if (destroyed) return;
    const now = dateNow();
    const hidden = String(documentImpl?.visibilityState || "visible").toLowerCase() === "hidden";
    if (lastAnimationFrameAt && !hidden) {
      const gapMs = Math.max(0, now - lastAnimationFrameAt);
      animationFrameGaps.push({ at: now, durationMs: roundMs(gapMs) });
      trimByAge(animationFrameGaps, now, longRollingWindowMs, MAX_SAMPLES);
      if (gapMs > 250) captureFreeze(gapMs, "animation_frame_gap");
    }
    lastAnimationFrameAt = now;
    animationFrameProbe = nativeRequestAnimationFrameForProbe?.(onAnimationFrame) ?? null;
  }

  function start() {
    if (installed || destroyed) return api;
    installed = true;
    installTimerTracking();
    installConsoleTracking();
    windowImpl?.addEventListener?.("pointerdown", capturePointerDown, true);
    windowImpl?.addEventListener?.("click", captureInput, true);
    documentImpl?.addEventListener?.("visibilitychange", handleVisibilityChange);
    installErrorTracking();
    installObservers();
    expectedSampleAt = perfNow() + sampleIntervalMs;
    eventLoopTimer = windowImpl?.setInterval?.(sampleEventLoop, sampleIntervalMs) || null;
    sampleResources();
    animationFrameProbe = nativeRequestAnimationFrameForProbe?.(onAnimationFrame) ?? null;
    return api;
  }

  function getSnapshot() {
    const now = dateNow();
    trimByAge(eventLoopSamples, now, longRollingWindowMs, MAX_SAMPLES);
    trimByAge(longTasks, now, longRollingWindowMs, MAX_SAMPLES);
    trimByAge(animationFrameGaps, now, longRollingWindowMs, MAX_SAMPLES);
    trimByAge(taskQueueSamples, now, longRollingWindowMs, MAX_SAMPLES);
    trimByAge(microtaskQueueSamples, now, longRollingWindowMs, MAX_SAMPLES);
    trimByAge(resourceSamples, now, longRollingWindowMs, 120);
    trimByAge(inputEvents, now, rollingWindowMs, MAX_INPUTS);
    trimByAge(runtimeErrors, now, longRollingWindowMs, MAX_RUNTIME_ERRORS);
    const heap = performanceImpl?.memory || null;
    const summarizeConsole = (windowMs) => {
      const oldestSecond = Math.floor(now / 1000) - Math.max(1, Math.ceil(windowMs / 1000) - 1);
      const byLevel = { log: 0, info: 0, debug: 0, warn: 0, error: 0 };
      const byCategory = Object.create(null);
      let emitted = 0;
      let suppressed = 0;
      for (const [second, bucket] of consoleBuckets.entries()) {
        if (second < oldestSecond) continue;
        for (const level of Object.keys(byLevel)) byLevel[level] += Number(bucket?.[level] || 0);
        emitted += Number(bucket?.emitted || 0);
        suppressed += Number(bucket?.suppressed || 0);
        for (const [category, counts] of Object.entries(bucket?.byCategory || {})) {
          const target = byCategory[category] || { attempted: 0, emitted: 0, suppressed: 0 };
          target.attempted += Number(counts?.attempted || 0);
          target.emitted += Number(counts?.emitted || 0);
          target.suppressed += Number(counts?.suppressed || 0);
          byCategory[category] = target;
        }
      }
      return { attempted: emitted + suppressed, emitted, suppressed, byLevel, byCategory };
    };
    const summarizeActivity = (windowMs) => {
      const oldestSecond = Math.floor(now / 1000) - Math.max(1, Math.ceil(windowMs / 1000) - 1);
      const result = Object.create(null);
      for (const [second, bucket] of activityBuckets.entries()) {
        if (second < oldestSecond) continue;
        for (const [category, counts] of Object.entries(bucket || {})) {
          const target = result[category] || { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
          target.count += Number(counts?.count || 0);
          target.totalDurationMs += Number(counts?.totalDurationMs || 0);
          target.maxDurationMs = Math.max(target.maxDurationMs, Number(counts?.maxDurationMs || 0));
          result[category] = target;
        }
      }
      return result;
    };
    const console60s = summarizeConsole(rollingWindowMs);
    const console5m = summarizeConsole(longRollingWindowMs);
    const firstResource = resourceSamples[0] || null;
    const lastResource = resourceSamples[resourceSamples.length - 1] || null;
    const runtimeErrors60s = runtimeErrors.filter((entry) => entry.at >= now - rollingWindowMs);
    const lastUnhandled = [...runtimeErrors]
      .reverse()
      .find((entry) => entry.kind === "uncaught_error" || entry.kind === "unhandled_rejection") || null;
    let runtime = {};
    try {
      const value = getRuntimeSnapshot?.();
      runtime = value && typeof value === "object" ? value : {};
    } catch (_) {}
    return {
      capturedAt: new Date(now).toISOString(),
      rollingWindowMs,
      longRollingWindowMs,
      eventLoop: summarizeDurations(eventLoopSamples, { since: now - rollingWindowMs }),
      eventLoop5m: summarizeDurations(eventLoopSamples, { since: now - longRollingWindowMs }),
      longTasks: summarizeDurations(longTasks, { since: now - rollingWindowMs }),
      longTasks5m: summarizeDurations(longTasks, { since: now - longRollingWindowMs }),
      animationFrames: {
        lastSuccessfulAt: lastAnimationFrameAt ? new Date(lastAnimationFrameAt).toISOString() : null,
        last60s: summarizeDurations(animationFrameGaps, { since: now - rollingWindowMs }),
        last5m: summarizeDurations(animationFrameGaps, { since: now - longRollingWindowMs }),
      },
      queueDelay: {
        taskLast60s: summarizeDurations(taskQueueSamples, { since: now - rollingWindowMs }),
        taskLast5m: summarizeDurations(taskQueueSamples, { since: now - longRollingWindowMs }),
        microtaskLast60s: summarizeDurations(microtaskQueueSamples, { since: now - rollingWindowMs }),
        microtaskLast5m: summarizeDurations(microtaskQueueSamples, { since: now - longRollingWindowMs }),
      },
      input: {
        last: inputEvents[inputEvents.length - 1] || null,
        maxClickToHandlerMs: roundMs(Math.max(0, ...inputEvents.map((entry) => finiteNumber(entry?.clickToHandlerMs, 0)))),
        samples: inputEvents.slice(-20).map((entry) => ({ ...entry })),
      },
      errors: {
        uncaughtErrorsLast60s: runtimeErrors60s.filter((entry) => entry.kind === "uncaught_error").length,
        unhandledRejectionsLast60s: runtimeErrors60s.filter((entry) => entry.kind === "unhandled_rejection").length,
        handledErrorsLast60s: runtimeErrors60s.filter((entry) => entry.kind === "handled_error").length,
        lastUnhandledErrorCategory: lastUnhandled?.category || null,
        lastUnhandledSourceLabel: lastUnhandled?.sourceLabel || null,
        lastUnhandledAt: lastUnhandled?.at ? new Date(lastUnhandled.at).toISOString() : null,
        recent: runtimeErrors.slice(-20).map((entry) => ({
          ...entry,
          at: new Date(entry.at).toISOString(),
        })),
      },
      jsHeap: heap ? {
        usedBytes: finiteNumber(heap.usedJSHeapSize, 0) || null,
        totalBytes: finiteNumber(heap.totalJSHeapSize, 0) || null,
        limitBytes: finiteNumber(heap.jsHeapSizeLimit, 0) || null,
      } : null,
      domNodeCount: documentImpl?.getElementsByTagName?.("*")?.length ?? null,
      activeTimers: {
        trackingStartedAt: new Date(timerState.trackingStartedAt).toISOString(),
        timeouts: timerState.timeouts.size,
        intervals: timerState.intervals.size,
        animationFrames: timerState.animationFrames.size,
        total: timerState.timeouts.size + timerState.intervals.size + timerState.animationFrames.size,
        created: { ...timerState.created },
        cleared: { ...timerState.cleared },
        fired: { ...timerState.fired },
      },
      consoleActivity: {
        totalLast60s: console60s.emitted,
        totalLast5m: console5m.emitted,
        ...console60s,
        last5m: console5m,
      },
      activity: {
        last60s: summarizeActivity(rollingWindowMs),
        last5m: summarizeActivity(longRollingWindowMs),
      },
      resourceTrend: {
        samples: resourceSamples.length,
        domNodeDelta: firstResource && lastResource && firstResource.domNodeCount != null && lastResource.domNodeCount != null
          ? Number(lastResource.domNodeCount) - Number(firstResource.domNodeCount)
          : null,
        heapGrowthBytes: firstResource && lastResource && firstResource.usedHeapBytes != null && lastResource.usedHeapBytes != null
          ? Number(lastResource.usedHeapBytes) - Number(firstResource.usedHeapBytes)
          : null,
        first: firstResource ? { ...firstResource } : null,
        last: lastResource ? { ...lastResource } : null,
      },
      dmRealtimeChannels: {
        recent: dmChannelEvents.map((entry) => ({
          ...entry,
          timestamp: new Date(entry.timestamp).toISOString(),
        })),
      },
      freezeRing: safeEventRing.slice(-MAX_SAFE_EVENTS).map((entry) => ({ ...entry })),
      freezeCaptures: freezeCaptures.map((entry) => ({
        ...entry,
        eventsBefore: entry.eventsBefore.map((event) => ({ ...event })),
      })),
      ...runtime,
    };
  }

  function getWindowMetrics({ sinceAt = 0, untilAt = dateNow() } = {}) {
    const since = Math.max(0, finiteNumber(sinceAt, 0));
    const until = Math.max(since, finiteNumber(untilAt, dateNow()));
    const eventLoopWindow = eventLoopSamples.filter((entry) => entry.at >= since && entry.at <= until);
    const longTaskWindow = summarizeRuntimeLongTaskWindow(longTasks, { sinceAt: since, untilAt: until });
    return {
      eventLoopMaxLagMs: roundMs(Math.max(0, ...eventLoopWindow.map((entry) => finiteNumber(entry.durationMs, 0)))),
      eventLoopSampleCount: eventLoopWindow.length,
      longTaskCount: longTaskWindow.count,
      longTaskTotalMs: longTaskWindow.clippedTotalMs,
      longTaskOverlappingFullDurationMs: longTaskWindow.overlappingFullDurationMs,
      longTaskExcessOver50Ms: longTaskWindow.excessOver50Ms,
      longTaskMaxMs: longTaskWindow.maxClippedMs,
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    windowImpl?.removeEventListener?.("pointerdown", capturePointerDown, true);
    windowImpl?.removeEventListener?.("click", captureInput, true);
    documentImpl?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    if (windowErrorHandler) windowImpl?.removeEventListener?.("error", windowErrorHandler);
    if (unhandledRejectionHandler) windowImpl?.removeEventListener?.("unhandledrejection", unhandledRejectionHandler);
    windowErrorHandler = null;
    unhandledRejectionHandler = null;
    if (eventLoopTimer != null) windowImpl?.clearInterval?.(eventLoopTimer);
    if (animationFrameProbe != null) nativeCancelAnimationFrameForProbe?.(animationFrameProbe);
    longTaskObserver?.disconnect?.();
    eventTimingObserver?.disconnect?.();
    restoreTimers?.();
    restoreConsole?.();
  }

  const api = Object.freeze({
    start,
    destroy,
    getSnapshot,
    getWindowMetrics,
    markInputHandlerStart,
    recordActivity,
    recordDmChannelLifecycle,
    recordError,
  });
  return api;
}
