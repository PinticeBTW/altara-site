const DEFAULT_SAFETY_EXPIRY_MS = 15_000;
const DEFAULT_PAINT_OBSERVATION_TIMEOUT_MS = 1_000;

function finiteMs(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function safeLabel(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_");
  return (normalized || fallback).slice(0, 100);
}

function createDeferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function resolveServerVoiceReadyTimeline(timing = {}) {
  const connectedCommitAt = finiteTimestamp(timing?.connectedCommitAt);
  const presentationReadyAt = Math.max(
    connectedCommitAt,
    finiteTimestamp(timing?.controlsEnabledAt),
    finiteTimestamp(timing?.pillClearedAt),
    finiteTimestamp(timing?.timerStartedAt),
    finiteTimestamp(timing?.joinCueRequestAt),
  ) || 0;
  return Object.freeze({
    perceivedReadyAt: presentationReadyAt || null,
    perceivedReadyBasis: 'logical_connected_presentation',
    frameObservationAt: finiteTimestamp(timing?.stableStagePaintAt) || null,
    frameObservationKind: safeLabel(timing?.paintObservationKind, 'pending'),
  });
}

export function createServerVoiceCriticalLane({
  now = () => Date.now(),
  scheduleTask = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelTask = (handle) => clearTimeout(handle),
  safetyExpiryMs = DEFAULT_SAFETY_EXPIRY_MS,
  onTrace = null,
} = {}) {
  let active = null;
  let lastSummary = null;
  const deferredByName = new Map();

  function emit(event, details = {}) {
    try {
      onTrace?.({
        event: safeLabel(event, "event"),
        at: finiteMs(now()),
        ...(details && typeof details === "object" ? details : {}),
      });
    } catch (_) {}
  }

  function snapshotLane(lane = active) {
    if (!lane) return null;
    return {
      generation: lane.generation,
      source: lane.source,
      startedAt: lane.startedAt,
      durationMs: Math.max(0, finiteMs(now()) - lane.startedAt),
      safetyExpired: lane.safetyExpired === true,
      deferredTaskNames: [...lane.deferredTaskNames],
      resumedTaskNames: [...lane.resumedTaskNames],
      diagnosticOverheadMs: Number(lane.diagnosticOverheadMs.toFixed(2)),
      diagnosticEventCount: lane.diagnosticEventCount,
      largeDiagnosticPayloadCount: lane.largeDiagnosticPayloadCount,
    };
  }

  function resumeDeferredTasks(summary) {
    const entries = Array.from(deferredByName.values());
    deferredByName.clear();
    entries.forEach((entry) => {
      summary?.resumedTaskNames?.push?.(entry.name);
      scheduleTask(() => {
        if (active) {
          emit("task_redeferred", {
            generation: active.generation,
            previousGeneration: entry.generation,
            name: entry.name,
          });
          defer(entry.name, entry.run).then(entry.deferred.resolve, entry.deferred.reject);
          return;
        }
        emit("task_resumed", {
          generation: entry.generation,
          name: entry.name,
        });
        Promise.resolve()
          .then(entry.run)
          .then(entry.deferred.resolve, entry.deferred.reject);
      }, 0);
    });
  }

  function exit({ generation = "", result = "completed", safetyExpired = false } = {}) {
    const expectedGeneration = String(generation || "").trim();
    if (!active) {
      return !expectedGeneration || lastSummary?.generation === expectedGeneration ? lastSummary : null;
    }
    if (expectedGeneration && expectedGeneration !== active.generation) return null;
    const lane = active;
    active = null;
    if (lane.safetyTimer != null) cancelTask(lane.safetyTimer);
    lane.safetyExpired = safetyExpired === true;
    const finishedAt = finiteMs(now());
    const summary = {
      ...snapshotLane(lane),
      result: safeLabel(result, "completed"),
      finishedAt,
      durationMs: Math.max(0, finishedAt - lane.startedAt),
      resumedTaskNames: [],
    };
    lastSummary = summary;
    emit("exited", {
      generation: lane.generation,
      result: summary.result,
      durationMs: summary.durationMs,
      deferredTaskNames: [...summary.deferredTaskNames],
      safetyExpired: summary.safetyExpired,
    });
    resumeDeferredTasks(summary);
    return summary;
  }

  function enter({ generation = "", source = "unknown" } = {}) {
    const normalizedGeneration = String(generation || "").trim();
    if (!normalizedGeneration) return null;
    if (active?.generation === normalizedGeneration) return snapshotLane(active);
    if (active) exit({ generation: active.generation, result: "replaced" });
    const startedAt = finiteMs(now());
    active = {
      generation: normalizedGeneration,
      source: safeLabel(source, "unknown"),
      startedAt,
      safetyTimer: null,
      safetyExpired: false,
      deferredTaskNames: [],
      resumedTaskNames: [],
      diagnosticOverheadMs: 0,
      diagnosticEventCount: 0,
      largeDiagnosticPayloadCount: 0,
    };
    const lane = active;
    lane.safetyTimer = scheduleTask(() => {
      if (active !== lane) return;
      exit({ generation: lane.generation, result: "safety_expired", safetyExpired: true });
    }, Math.max(1_000, finiteMs(safetyExpiryMs, DEFAULT_SAFETY_EXPIRY_MS)));
    emit("entered", {
      generation: lane.generation,
      source: lane.source,
      safetyExpiryMs: Math.max(1_000, finiteMs(safetyExpiryMs, DEFAULT_SAFETY_EXPIRY_MS)),
    });
    return snapshotLane(lane);
  }

  function defer(name, run, {
    essential = false,
    userInitiated = false,
  } = {}) {
    if (typeof run !== "function") throw new TypeError("deferred Server Voice work must be a function");
    const taskName = safeLabel(name, "background_task");
    if (!active || essential === true || userInitiated === true) {
      return Promise.resolve().then(run);
    }
    const existing = deferredByName.get(taskName);
    if (existing) return existing.deferred.promise;
    const deferred = createDeferredPromise();
    const entry = {
      name: taskName,
      generation: active.generation,
      run,
      deferred,
    };
    deferredByName.set(taskName, entry);
    active.deferredTaskNames.push(taskName);
    emit("task_deferred", {
      generation: active.generation,
      name: taskName,
    });
    return deferred.promise;
  }

  function recordDiagnostic({ durationMs = 0, largePayload = false } = {}) {
    if (!active) return false;
    active.diagnosticEventCount += 1;
    active.diagnosticOverheadMs += finiteMs(durationMs);
    if (largePayload === true) active.largeDiagnosticPayloadCount += 1;
    return true;
  }

  function isActive(generation = "") {
    if (!active) return false;
    const expectedGeneration = String(generation || "").trim();
    return !expectedGeneration || active.generation === expectedGeneration;
  }

  function getSnapshot() {
    return {
      active: snapshotLane(active),
      deferredTaskNames: Array.from(deferredByName.keys()),
      lastSummary: lastSummary ? {
        ...lastSummary,
        deferredTaskNames: [...lastSummary.deferredTaskNames],
        resumedTaskNames: [...lastSummary.resumedTaskNames],
      } : null,
    };
  }

  return {
    defer,
    enter,
    exit,
    getSnapshot,
    isActive,
    recordDiagnostic,
  };
}

export function createServerVoiceConnectedPaintCoordinator({
  now = () => Date.now(),
  scheduleFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
  scheduleTask = (callback) => setTimeout(callback, 0),
  scheduleFallbackTask = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelFallbackTask = (handle) => clearTimeout(handle),
  readDocumentVisibility = () => typeof document === 'undefined'
    ? 'unknown'
    : String(document.visibilityState || 'unknown'),
  paintObservationTimeoutMs = DEFAULT_PAINT_OBSERVATION_TIMEOUT_MS,
  onTrace = null,
} = {}) {
  let active = null;

  function getDocumentVisibility() {
    try {
      return safeLabel(readDocumentVisibility?.(), 'unknown');
    } catch (_) {
      return 'unknown';
    }
  }

  function emit(event, details = {}) {
    try {
      onTrace?.({
        event: safeLabel(event, 'event'),
        at: finiteMs(now()),
        ...(details && typeof details === 'object' ? details : {}),
      });
    } catch (_) {}
  }

  function snapshot() {
    if (!active) return null;
    return Object.freeze({
      generation: active.generation,
      connectedCommitAt: active.connectedCommitAt,
      firstConnectedPaintAt: active.firstConnectedPaintAt || null,
      stablePaintAt: active.stablePaintAt || null,
      paintObservationKind: active.paintObservationKind || 'pending',
      documentVisibilityAtBegin: active.documentVisibilityAtBegin,
      documentVisibilityAtCompletion: active.documentVisibilityAtCompletion || null,
      pending: active.pending === true,
      snapshotEventCountBeforePaint: active.snapshotEventCountBeforePaint,
      snapshotReconciliationCountBeforePaint: active.snapshotReconciliationCountBeforePaint,
      participantNodesCreated: active.participantNodesCreated,
      participantNodesReused: active.participantNodesReused,
      participantNodesRemoved: active.participantNodesRemoved,
      forcedLayoutReadCount: active.forcedLayoutReadCount,
      forcedLayoutTotalMs: Number(active.forcedLayoutTotalMs.toFixed(2)),
      longestSynchronousCallbackMs: Number(active.longestSynchronousCallbackMs.toFixed(2)),
      longestSynchronousCallbackName: active.longestSynchronousCallbackName || null,
      joinCueRequestMs: active.joinCueRequestAt
        ? Math.max(0, active.joinCueRequestAt - active.connectedCommitAt)
        : null,
      joinCueStartMs: active.joinCueStartAt
        ? Math.max(0, active.joinCueStartAt - active.connectedCommitAt)
        : null,
    });
  }

  function cancelFrames(state = active) {
    if (!state) return;
    if (state.firstFrame != null) cancelFrame(state.firstFrame);
    if (state.stableFrame != null) cancelFrame(state.stableFrame);
    state.firstFrame = null;
    state.stableFrame = null;
  }

  function cancelObservationFallback(state = active) {
    if (!state || state.observationFallback == null) return;
    cancelFallbackTask(state.observationFallback);
    state.observationFallback = null;
  }

  function begin({ generation = '', connectedCommitAt = now() } = {}) {
    const normalizedGeneration = String(generation || '').trim();
    if (!normalizedGeneration) return null;
    if (active?.generation === normalizedGeneration && active.pending) return snapshot();
    cancelFrames();
    cancelObservationFallback();
    active = {
      generation: normalizedGeneration,
      connectedCommitAt: finiteMs(connectedCommitAt, finiteMs(now())),
      firstConnectedPaintAt: 0,
      stablePaintAt: 0,
      pending: true,
      firstFrame: null,
      stableFrame: null,
      observationFallback: null,
      paintObservationKind: 'pending',
      documentVisibilityAtBegin: getDocumentVisibility(),
      documentVisibilityAtCompletion: '',
      deferredVisual: null,
      deferredGeometry: null,
      snapshotEventCountBeforePaint: 0,
      snapshotReconciliationCountBeforePaint: 0,
      participantNodesCreated: 0,
      participantNodesReused: 0,
      participantNodesRemoved: 0,
      forcedLayoutReadCount: 0,
      forcedLayoutTotalMs: 0,
      longestSynchronousCallbackMs: 0,
      longestSynchronousCallbackName: '',
      joinCueRequestAt: 0,
      joinCueStartAt: 0,
    };
    emit('begin', { generation: normalizedGeneration });
    return snapshot();
  }

  function isPending(generation = '') {
    if (!active?.pending) return false;
    const expected = String(generation || '').trim();
    return !expected || expected === active.generation;
  }

  function recordSnapshotEvent(generation = '') {
    if (!isPending(generation)) return false;
    active.snapshotEventCountBeforePaint += 1;
    return true;
  }

  function recordSnapshotReconciliation(generation = '') {
    if (!isPending(generation)) return false;
    active.snapshotReconciliationCountBeforePaint += 1;
    return true;
  }

  function deferVisual({ generation = '', signature = '', reason = 'snapshot', run = null } = {}) {
    if (!isPending(generation) || typeof run !== 'function') return false;
    recordSnapshotEvent(generation);
    const previous = active.deferredVisual;
    active.deferredVisual = {
      signature: String(signature || ''),
      reasons: Array.from(new Set([...(previous?.reasons || []), safeLabel(reason, 'snapshot')])),
      run,
    };
    emit('visual_deferred', {
      generation: active.generation,
      reason: safeLabel(reason, 'snapshot'),
    });
    return true;
  }

  function deferGeometry({ generation = '', run = null } = {}) {
    if (!isPending(generation) || typeof run !== 'function') return false;
    active.deferredGeometry = run;
    emit('geometry_deferred', { generation: active.generation });
    return true;
  }

  function recordParticipantNodes({ generation = '', created = 0, reused = 0, removed = 0 } = {}) {
    if (!active || (generation && String(generation) !== active.generation)) return false;
    active.participantNodesCreated += Math.max(0, Number(created) || 0);
    active.participantNodesReused += Math.max(0, Number(reused) || 0);
    active.participantNodesRemoved += Math.max(0, Number(removed) || 0);
    return true;
  }

  function recordSynchronousCallback({ generation = '', name = 'callback', durationMs = 0 } = {}) {
    if (!active || (generation && String(generation) !== active.generation)) return false;
    const duration = finiteMs(durationMs);
    if (duration > active.longestSynchronousCallbackMs) {
      active.longestSynchronousCallbackMs = duration;
      active.longestSynchronousCallbackName = safeLabel(name, 'callback');
    }
    return true;
  }

  function recordForcedLayout({ generation = '', durationMs = 0, readCount = 1 } = {}) {
    if (!active || (generation && String(generation) !== active.generation)) return false;
    if (!active.pending) return false;
    active.forcedLayoutReadCount += Math.max(0, Number(readCount) || 0);
    active.forcedLayoutTotalMs += finiteMs(durationMs);
    return true;
  }

  function recordJoinCue({ generation = '', phase = 'request', at = now() } = {}) {
    if (!active || (generation && String(generation) !== active.generation)) return false;
    if (phase === 'start') active.joinCueStartAt = finiteMs(at);
    else active.joinCueRequestAt = finiteMs(at);
    return true;
  }

  function flushDeferred(state) {
    const visual = state.deferredVisual;
    const geometry = state.deferredGeometry;
    state.deferredVisual = null;
    state.deferredGeometry = null;
    if (visual?.run) {
      scheduleTask(() => {
        if (active !== state) return;
        visual.run({ reasons: visual.reasons, signature: visual.signature });
      });
    }
    if (geometry) {
      scheduleFrame(() => {
        if (active !== state || state.pending) return;
        geometry();
      });
    }
  }

  function finishObservation(state, {
    kind = 'double_animation_frame',
    stablePaintAt = 0,
    onStablePaint = null,
  } = {}) {
    if (active !== state || !state.pending) return false;
    cancelFrames(state);
    cancelObservationFallback(state);
    state.stablePaintAt = finiteTimestamp(stablePaintAt);
    state.paintObservationKind = safeLabel(kind, 'unknown');
    state.documentVisibilityAtCompletion = getDocumentVisibility();
    state.pending = false;
    const result = snapshot();
    emit('stable_paint', {
      generation: state.generation,
      observationKind: state.paintObservationKind,
      frameObserved: state.stablePaintAt > 0,
      connectedCommitToStablePaintMs: state.stablePaintAt
        ? Math.max(0, state.stablePaintAt - state.connectedCommitAt)
        : null,
      snapshotEventCountBeforePaint: state.snapshotEventCountBeforePaint,
      snapshotReconciliationCountBeforePaint: state.snapshotReconciliationCountBeforePaint,
      participantNodesCreated: state.participantNodesCreated,
      participantNodesReused: state.participantNodesReused,
      participantNodesRemoved: state.participantNodesRemoved,
      forcedLayoutReadCount: state.forcedLayoutReadCount,
      forcedLayoutTotalMs: Number(state.forcedLayoutTotalMs.toFixed(2)),
      longestSynchronousCallbackMs: Number(state.longestSynchronousCallbackMs.toFixed(2)),
      longestSynchronousCallbackName: state.longestSynchronousCallbackName || null,
    });
    try { onStablePaint?.(result); } catch (_) {}
    flushDeferred(state);
    return true;
  }

  function schedulePaint({
    generation = '',
    onFirstPaint = null,
    onStablePaint = null,
  } = {}) {
    if (!isPending(generation)) return false;
    const state = active;
    if (state.firstFrame != null || state.firstConnectedPaintAt) return true;
    const initialVisibility = getDocumentVisibility();
    if (initialVisibility === 'hidden') {
      state.observationFallback = scheduleFallbackTask(() => {
        finishObservation(state, {
          kind: 'hidden_no_frame',
          onStablePaint,
        });
      }, 0);
      return true;
    }
    state.observationFallback = scheduleFallbackTask(() => {
      finishObservation(state, {
        kind: getDocumentVisibility() === 'hidden'
          ? 'hidden_before_frame'
          : 'frame_observation_timeout',
        onStablePaint,
      });
    }, Math.max(50, finiteMs(paintObservationTimeoutMs, DEFAULT_PAINT_OBSERVATION_TIMEOUT_MS)));
    state.firstFrame = scheduleFrame(() => {
      state.firstFrame = null;
      if (active !== state || !state.pending) return;
      state.firstConnectedPaintAt = finiteMs(now());
      try { onFirstPaint?.(snapshot()); } catch (_) {}
      state.stableFrame = scheduleFrame(() => {
        state.stableFrame = null;
        if (active !== state || !state.pending) return;
        finishObservation(state, {
          kind: 'double_animation_frame',
          stablePaintAt: finiteMs(now()),
          onStablePaint,
        });
      });
    });
    return true;
  }

  function cancel({ generation = '' } = {}) {
    const expected = String(generation || '').trim();
    if (!active || (expected && expected !== active.generation)) return false;
    cancelFrames(active);
    cancelObservationFallback(active);
    active = null;
    return true;
  }

  return Object.freeze({
    begin,
    cancel,
    deferGeometry,
    deferVisual,
    isPending,
    recordForcedLayout,
    recordJoinCue,
    recordParticipantNodes,
    recordSnapshotEvent,
    recordSnapshotReconciliation,
    recordSynchronousCallback,
    schedulePaint,
    snapshot,
  });
}

export function createFrameReconciler({
  scheduleFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
  reconcile = () => {},
  isGenerationCurrent = () => true,
} = {}) {
  let frame = null;
  let pending = null;
  let lastSignature = null;

  function request({ generation = "", signature = null, scope = "full", reason = "event" } = {}) {
    const normalizedGeneration = String(generation || "").trim();
    if (!isGenerationCurrent(normalizedGeneration)) return false;
    const normalizedSignature = signature == null ? null : String(signature);
    if (!pending && normalizedSignature != null && normalizedSignature === lastSignature) return false;
    pending = {
      generation: normalizedGeneration,
      signature: normalizedSignature,
      scope: safeLabel(scope, "full"),
      reasons: Array.from(new Set([...(pending?.reasons || []), safeLabel(reason, "event")])),
    };
    if (frame != null) return true;
    frame = scheduleFrame(() => {
      frame = null;
      const next = pending;
      pending = null;
      if (!next || !isGenerationCurrent(next.generation)) return;
      if (next.signature != null && next.signature === lastSignature) return;
      reconcile(next);
      if (next.signature != null) lastSignature = next.signature;
    });
    return true;
  }

  function cancel({ generation = "" } = {}) {
    const expectedGeneration = String(generation || "").trim();
    if (expectedGeneration && pending?.generation !== expectedGeneration) return false;
    if (frame != null) cancelFrame(frame);
    frame = null;
    pending = null;
    return true;
  }

  function resetSignature() {
    lastSignature = null;
  }

  return { cancel, request, resetSignature };
}
