const NATIVE_HIGH_MOTION_WINDOW_PORT_EVENT = "altara:native-high-motion-capture:port";
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PORT_WAIT_TIMEOUT_MS = 2_500;

const transferredPorts = new Map();
const portWaiters = new Map();
let transferListenerInstalled = false;
let nativeStageSampleSequence = 0;

function installTransferListener() {
  if (transferListenerInstalled || typeof window === "undefined") return;
  transferListenerInstalled = true;
  window.addEventListener("message", (event) => {
    const payload = event?.data && typeof event.data === "object" ? event.data : {};
    if (event.source !== window || payload.type !== NATIVE_HIGH_MOTION_WINDOW_PORT_EVENT) return;
    const sessionId = String(payload.sessionId || "").trim().toLowerCase();
    const port = event.ports?.[0] || null;
    if (!SESSION_ID_PATTERN.test(sessionId) || !port) return;
    const previous = transferredPorts.get(sessionId) || null;
    try { previous?.close?.(); } catch (_) {}
    transferredPorts.set(sessionId, port);
    const waiter = portWaiters.get(sessionId) || null;
    if (waiter) {
      portWaiters.delete(sessionId);
      waiter(port);
    }
  });
}

installTransferListener();

function waitForTransferredPort(sessionId, timeoutMs = PORT_WAIT_TIMEOUT_MS) {
  const existing = transferredPorts.get(sessionId) || null;
  if (existing) {
    transferredPorts.delete(sessionId);
    return Promise.resolve(existing);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      portWaiters.delete(sessionId);
      resolve(null);
    }, Math.max(100, Number(timeoutMs) || PORT_WAIT_TIMEOUT_MS));
    portWaiters.set(sessionId, (port) => {
      clearTimeout(timer);
      transferredPorts.delete(sessionId);
      resolve(port);
    });
  });
}

function isNativeHighMotionGeneratorSupported(scope = globalThis) {
  return typeof scope?.MediaStreamTrackGenerator === "function"
    && typeof scope?.VideoFrame === "function"
    && typeof scope?.MediaStream === "function";
}

function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function createTimingSeries() {
  return { totalCount: 0, values: [] };
}

function appendTimingSample(series, value, maximumSamples = 600) {
  const sample = Number(value);
  if (!series || !Number.isFinite(sample) || sample < 0) return;
  series.totalCount += 1;
  series.values.push(sample);
  while (series.values.length > maximumSamples) series.values.shift();
}

function summarizeTimingValues(values = []) {
  const samples = values.filter(Number.isFinite);
  return {
    sampleCount: samples.length,
    averageMs: samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null,
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    maximumMs: samples.length ? Math.max(...samples) : null,
  };
}

function timingValuesAfter(series = null, previousTotalCount = 0) {
  const values = Array.isArray(series?.values) ? series.values : [];
  const firstIndex = Number(series?.firstSampleIndex || 0);
  if (!firstIndex || !values.length) return [];
  return values.filter((_, offset) => firstIndex + offset > Number(previousTotalCount || 0));
}

function localTimingValuesAfter(series = null, previousTotalCount = 0) {
  const values = Array.isArray(series?.values) ? series.values : [];
  const totalCount = Number(series?.totalCount || 0);
  const firstIndex = values.length ? totalCount - values.length + 1 : 0;
  return values.filter((_, offset) => firstIndex + offset > Number(previousTotalCount || 0));
}

function counterDelta(after, before, key) {
  const end = Number(after?.[key] || 0);
  const start = Number(before?.[key] || 0);
  return Math.max(0, end - start);
}

function counterArrayDelta(after, before, key, length = 5) {
  const ending = Array.isArray(after?.[key]) ? after[key] : [];
  const starting = Array.isArray(before?.[key]) ? before[key] : [];
  return Array.from({ length }, (_, index) => Math.max(
    0,
    Number(ending[index] || 0) - Number(starting[index] || 0),
  ));
}

function fpsFromDelta(delta, durationMs) {
  return Number(durationMs) > 0 ? Number(delta || 0) * 1000 / Number(durationMs) : null;
}

function startBoundedEventLoopDelaySampler(scope = globalThis, intervalMs = 100) {
  const schedule = typeof scope?.setTimeout === "function" ? scope.setTimeout.bind(scope) : setTimeout;
  const cancel = typeof scope?.clearTimeout === "function" ? scope.clearTimeout.bind(scope) : clearTimeout;
  const now = () => Number(scope?.performance?.now?.() || Date.now());
  const boundedIntervalMs = Math.min(250, Math.max(50, Number(intervalMs) || 100));
  const values = [];
  let active = true;
  let timer = null;
  let expectedAt = now() + boundedIntervalMs;
  const tick = () => {
    if (!active) return;
    const observedAt = now();
    values.push(Math.max(0, observedAt - expectedAt));
    expectedAt = observedAt + boundedIntervalMs;
    timer = schedule(tick, boundedIntervalMs);
  };
  timer = schedule(tick, boundedIntervalMs);
  return () => {
    active = false;
    if (timer !== null) cancel(timer);
    return summarizeTimingValues(values);
  };
}

function classifyNativeBridgeStages({
  wgcArrivalFps = null,
  ownedCopyOutputFps = null,
  gpuScaleOutputFps = null,
  readbackOutputFps = null,
  transportWrittenFps = null,
  rendererReceivedFps = null,
  generatedTrackFps = null,
  healthyFps = 55,
} = {}) {
  const measured = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const values = {
    wgc: measured(wgcArrivalFps),
    ownedCopy: measured(ownedCopyOutputFps),
    scale: measured(gpuScaleOutputFps),
    readback: measured(readbackOutputFps),
    transport: measured(transportWrittenFps),
    renderer: measured(rendererReceivedFps),
    generated: measured(generatedTrackFps),
  };
  if (Number.isFinite(values.wgc) && values.wgc > 0 && values.wgc < healthyFps) {
    return "INTEGRATED_WGC_CALLBACK_LIMIT";
  }
  if (values.wgc >= healthyFps && values.ownedCopy !== null && values.ownedCopy < healthyFps) {
    return "OWNED_GPU_COPY_LIMIT";
  }
  if (values.wgc >= healthyFps && values.ownedCopy >= healthyFps
    && values.scale !== null && values.scale < healthyFps) {
    return "FULL_BRIDGE_WORKER_BACKPRESSURE";
  }
  if (values.wgc >= healthyFps && (
    (values.scale !== null && values.scale < healthyFps)
    || (values.readback !== null && values.readback < healthyFps)
  )) {
    return "READBACK_OR_PROCESSING_LIMIT";
  }
  if (values.readback >= healthyFps && values.transport !== null && values.transport < healthyFps) return "IPC_TRANSPORT_LIMIT";
  if (values.transport >= healthyFps && values.renderer !== null && values.renderer < healthyFps) {
    return "MAIN_TO_RENDERER_DELIVERY_CONTENTION";
  }
  if (values.renderer >= healthyFps && values.generated !== null && values.generated < healthyFps) return "VIDEOFRAME_GENERATOR_LIMIT";
  const requiredValues = [values.wgc, values.scale, values.readback, values.transport, values.renderer, values.generated];
  if (requiredValues.every((value) => value !== null && value >= healthyFps)
    && (values.ownedCopy === null || values.ownedCopy >= healthyFps)) {
    return "INTEGRATED_BRIDGE_HEALTHY_60";
  }
  return "INSUFFICIENT_STAGE_MEASUREMENT";
}

function normalizeFramePayload(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function classifyNativeHighMotionBoundary({
  nativeCaptureFps = null,
  bridgeProducedFps = null,
  outboundFps = null,
  receiverFps = null,
  healthyFps = 55,
} = {}) {
  const native = Number(nativeCaptureFps);
  const bridge = Number(bridgeProducedFps);
  const outbound = Number(outboundFps);
  const receiver = Number(receiverFps);
  if (Number.isFinite(native) && native > 0 && native < healthyFps) return "NATIVE_CAPTURE_LIMIT";
  if (Number.isFinite(bridge) && bridge > 0 && bridge < healthyFps) return "BRIDGE_LIMIT";
  if (Number.isFinite(outbound) && outbound > 0 && outbound < healthyFps) return "WEBRTC_PUBLISH_LIMIT";
  if (Number.isFinite(receiver) && receiver > 0 && receiver < healthyFps) return "DOWNSTREAM_LIMIT";
  if ([native, bridge, outbound, receiver].every((value) => Number.isFinite(value) && value >= healthyFps)) {
    return "HEALTHY_NATIVE_720P60";
  }
  if ([native, bridge, outbound].every((value) => Number.isFinite(value) && value >= healthyFps)) {
    return "PUBLISHER_CHAIN_HEALTHY_AWAITING_RECEIVER";
  }
  if (Number.isFinite(native) && native >= healthyFps && Number.isFinite(bridge) && bridge >= healthyFps) {
    return "LOCAL_BRIDGE_HEALTHY_AWAITING_WEBRTC";
  }
  return "INSUFFICIENT_MEASUREMENT";
}

export function createNativeHighMotionCaptureBridge({
  desktopBridge = typeof window !== "undefined" ? window.altaraDesktop : null,
  scope = globalThis,
} = {}) {
  let active = null;
  let lastDiagnostics = {
    prototypeOnly: true,
    capturePath: "chromium_compatibility",
    generatorSupported: isNativeHighMotionGeneratorSupported(scope),
    generatorType: typeof scope?.MediaStreamTrackGenerator,
    videoTrackGeneratorType: typeof scope?.VideoTrackGenerator,
    videoFrameType: typeof scope?.VideoFrame,
    sharedArrayBufferType: typeof scope?.SharedArrayBuffer,
    active: false,
    lastFailureCategory: null,
  };

  const readActiveDiagnostics = () => {
    if (!active) return { ...lastDiagnostics };
    const timestampSpan = active.lastTimestampUs > active.firstTimestampUs
      ? active.lastTimestampUs - active.firstTimestampUs
      : 0;
    const producedFps = timestampSpan > 0 && active.generatedFrames > 1
      ? (active.generatedFrames - 1) * 1_000_000 / timestampSpan
      : null;
    const captureFps = timestampSpan > 0 && active.lastCapturedFrames > active.firstCapturedFrames
      ? (active.lastCapturedFrames - active.firstCapturedFrames) * 1_000_000 / timestampSpan
      : null;
    return {
      ...lastDiagnostics,
      active: !active.stopped,
      sessionIdPresent: true,
      capturePath: "native_high_motion",
      handoffMode: active.handoffMode || null,
      readbackMode: active.readbackMode || null,
      readbackCompletionStrategy: active.readbackCompletionStrategy || null,
      pixelFormat: "NV12",
      nativeCaptureWidth: active.nativeCaptureWidth || null,
      nativeCaptureHeight: active.nativeCaptureHeight || null,
      bridgeOutputWidth: active.width || null,
      bridgeOutputHeight: active.height || null,
      nativeTargetFps: active.nativeTargetFps || null,
      rowPitch: active.rowPitch || null,
      payloadBytesPerFrame: active.payloadBytes || null,
      payloadMiBPerFrame: active.payloadBytes ? active.payloadBytes / (1024 * 1024) : null,
      nativeCaptureFps: captureFps,
      bridgeProducedFps: producedFps,
      boundaryClassification: classifyNativeHighMotionBoundary({
        nativeCaptureFps: captureFps,
        bridgeProducedFps: producedFps,
      }),
      receivedFrames: active.receivedFrames,
      rendererHandlerEnteredFrames: active.rendererHandlerEnteredFrames,
      rendererAcceptedFrames: active.rendererAcceptedFrames,
      acknowledgementsSent: active.acknowledgementsSent,
      generatedFrames: active.generatedFrames,
      invalidFrames: active.invalidFrames,
      nonMonotonicFrames: active.nonMonotonicFrames,
      writeFailures: active.writeFailures,
      videoFramesCreated: active.videoFramesCreated,
      videoFramesClosed: active.videoFramesClosed,
      videoFrameOutstanding: active.videoFrameOutstanding,
      generatorWriter: {
        writeCalls: active.writerWriteCalls,
        writeCompletions: active.writerWriteCompletions,
        readyWaitStarted: active.writerReadyWaitStarted,
        readyWaitCompleted: active.writerReadyWaitCompleted,
        readyWaitPending: active.writerReadyObservationPending === true,
        desiredSizeLatest: active.writerDesiredSizeLatest,
        desiredSizeMinimum: active.writerDesiredSizeMinimum,
        desiredSizeMaximum: active.writerDesiredSizeMaximum,
        readyWait: summarizeTimingValues(active.stageTimingSamples.generatorReadyWait.values),
      },
      bridgeDroppedStaleFrames: active.bridgeDroppedStaleFrames,
      nativeDroppedStaleFrames: active.nativeDroppedStaleFrames,
      queueDepth: (active.writePending ? 1 : 0) + (active.pendingFrameMessage ? 1 : 0),
      maximumQueueDepth: active.maximumQueueDepth,
      averageBridgePreparationMs: active.preparationMs.length
        ? active.preparationMs.reduce((sum, value) => sum + value, 0) / active.preparationMs.length
        : null,
      p95BridgePreparationMs: percentile(active.preparationMs, 0.95),
      averageBridgeLatencyMs: active.bridgeLatencyMs.length
        ? active.bridgeLatencyMs.reduce((sum, value) => sum + value, 0) / active.bridgeLatencyMs.length
        : null,
      p95BridgeLatencyMs: percentile(active.bridgeLatencyMs, 0.95),
      rendererStageTimings: {
        mainToRendererTransit: summarizeTimingValues(active.stageTimingSamples.mainToRendererTransit.values),
        handlerInterArrival: summarizeTimingValues(active.stageTimingSamples.rendererHandlerInterArrival.values),
        acceptedInterArrival: summarizeTimingValues(active.stageTimingSamples.rendererAcceptedInterArrival.values),
        packetAssembly: summarizeTimingValues(active.stageTimingSamples.rendererPacketAssembly.values),
        videoFrameConstruction: summarizeTimingValues(active.stageTimingSamples.videoFrameConstruction.values),
        generatorWriteInterArrival: summarizeTimingValues(active.stageTimingSamples.generatorWriteInterArrival.values),
        generatorWrite: summarizeTimingValues(active.stageTimingSamples.generatorWrite.values),
      },
      lastStageMeasurement: active.lastStageMeasurement
        ? { ...active.lastStageMeasurement }
        : null,
      copiesPerFrame: {
        wgcPoolTextureToAltaraOwnedGpuTexture: active.handoffMode === "owned_gpu_copy_ring" ? 1 : 0,
        altaraSharedTextureToConverterInputGpuTexture: active.handoffMode === "owned_gpu_copy_ring" ? 1 : 0,
        gpuOutputToCpuReadableStagingReadback: 1,
        nativeMappedToOwnedPayload: 1,
        namedPipeUserToKernel: 1,
        namedPipeKernelToMain: 1,
        mainPacketAssembly: 1,
        mainToRendererStructuredClone: 1,
        videoFrameConstructionMayCopy: true,
      },
      copyAccounting: active.payloadBytes ? {
        ownedGpuCopyBytesPerFrame: active.handoffMode === "owned_gpu_copy_ring"
          && active.nativeCaptureWidth && active.nativeCaptureHeight
          ? active.nativeCaptureWidth * active.nativeCaptureHeight * 4
          : null,
        ownedGpuCopyMebibytesPerSecondAt60: active.handoffMode === "owned_gpu_copy_ring"
          && active.nativeCaptureWidth && active.nativeCaptureHeight
          ? active.nativeCaptureWidth * active.nativeCaptureHeight * 4 * 60 / (1024 * 1024)
          : null,
        bytesPerFrame: active.payloadBytes,
        mebibytesPerFrame: active.payloadBytes / (1024 * 1024),
        payloadMebibytesPerSecondAt60: active.payloadBytes * 60 / (1024 * 1024),
        explicitCpuIpcCopiesPerFrame: 5,
        explicitCpuIpcCopyMebibytesPerSecondAt60: active.payloadBytes * 60 * 5 / (1024 * 1024),
        videoFrameConstructionAdditionalCopyPossible: true,
      } : null,
      noFrameDuplication: true,
      timestampsFromNativeCapture: true,
    };
  };

  const readMainSessionDiagnostics = async () => {
    if (typeof desktopBridge?.getNativeHighMotionCaptureDiagnostics !== "function") return null;
    try {
      const diagnostics = await desktopBridge.getNativeHighMotionCaptureDiagnostics();
      const sessions = Array.isArray(diagnostics?.sessions) ? diagnostics.sessions : [];
      return sessions.find((entry) => entry?.active === true) || sessions[0] || null;
    } catch (_) {
      return null;
    }
  };

  const snapshotRendererStageState = (session) => ({
    receivedFrames: Number(session?.receivedFrames || 0),
    rendererHandlerEnteredFrames: Number(session?.rendererHandlerEnteredFrames || 0),
    rendererAcceptedFrames: Number(session?.rendererAcceptedFrames || 0),
    acknowledgementsSent: Number(session?.acknowledgementsSent || 0),
    generatedFrames: Number(session?.generatedFrames || 0),
    bridgeDroppedStaleFrames: Number(session?.bridgeDroppedStaleFrames || 0),
    invalidFrames: Number(session?.invalidFrames || 0),
    writeFailures: Number(session?.writeFailures || 0),
    videoFramesCreated: Number(session?.videoFramesCreated || 0),
    videoFramesClosed: Number(session?.videoFramesClosed || 0),
    videoFrameOutstanding: Number(session?.videoFrameOutstanding || 0),
    writerWriteCalls: Number(session?.writerWriteCalls || 0),
    writerWriteCompletions: Number(session?.writerWriteCompletions || 0),
    writerReadyWaitStarted: Number(session?.writerReadyWaitStarted || 0),
    writerReadyWaitCompleted: Number(session?.writerReadyWaitCompleted || 0),
    writerDesiredSizeLatest: Number.isFinite(Number(session?.writerDesiredSizeLatest))
      ? Number(session.writerDesiredSizeLatest)
      : null,
    timingCounts: {
      rendererPacketAssembly: Number(session?.stageTimingSamples?.rendererPacketAssembly?.totalCount || 0),
      mainToRendererTransit: Number(session?.stageTimingSamples?.mainToRendererTransit?.totalCount || 0),
      rendererHandlerInterArrival: Number(session?.stageTimingSamples?.rendererHandlerInterArrival?.totalCount || 0),
      rendererAcceptedInterArrival: Number(session?.stageTimingSamples?.rendererAcceptedInterArrival?.totalCount || 0),
      videoFrameConstruction: Number(session?.stageTimingSamples?.videoFrameConstruction?.totalCount || 0),
      generatorWriteInterArrival: Number(session?.stageTimingSamples?.generatorWriteInterArrival?.totalCount || 0),
      generatorWrite: Number(session?.stageTimingSamples?.generatorWrite?.totalCount || 0),
      generatorReadyWait: Number(session?.stageTimingSamples?.generatorReadyWait?.totalCount || 0),
    },
  });

  async function measureNativeBridgeStages({ durationMs = 5000, warmupMs = 0 } = {}) {
    const session = active;
    if (!session || session.stopped) return { status: "unavailable", reason: "native_bridge_not_active" };
    if (session.stageMeasurementPromise) return { status: "unavailable", reason: "measurement_already_in_progress" };
    const boundedDurationMs = Math.min(20_000, Math.max(1_000, Math.round(Number(durationMs) || 5000)));
    const boundedWarmupMs = Math.min(10_000, Math.max(0, Math.round(Number(warmupMs) || 0)));
    const sampleId = `native-stage-${Date.now()}-${++nativeStageSampleSequence}`;
    session.stageMeasurementPromise = (async () => {
      if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
      const mainBefore = await readMainSessionDiagnostics();
      const rendererBefore = snapshotRendererStageState(session);
      const startedAt = Date.now();
      const startedPerformance = Number(scope?.performance?.now?.() || 0);
      const stopEventLoopDelaySampler = startBoundedEventLoopDelaySampler(scope, 100);
      await new Promise((resolve) => setTimeout(resolve, boundedDurationMs));
      const rendererEventLoopDelay = stopEventLoopDelaySampler();
      const endedPerformance = Number(scope?.performance?.now?.() || 0);
      const endedAt = Date.now();
      const mainAfter = await readMainSessionDiagnostics();
      const rendererAfter = snapshotRendererStageState(session);
      const actualDurationMs = Math.max(1, endedPerformance - startedPerformance);
      const beforeCounters = mainBefore?.helperStageCounters || {};
      const afterCounters = mainAfter?.helperStageCounters || {};
      const deltas = {
        wgcFramesDelta: counterDelta(afterCounters, beforeCounters, "wgcCallbackArrivals"),
        wgcAcceptedFramesDelta: counterDelta(afterCounters, beforeCounters, "wgcAcceptedFrames"),
        gpuScaleInputFramesDelta: counterDelta(afterCounters, beforeCounters, "gpuScaleInputFrames"),
        gpuScaleOutputFramesDelta: counterDelta(afterCounters, beforeCounters, "gpuScaleOutputFrames"),
        readbackInputFramesDelta: counterDelta(afterCounters, beforeCounters, "readbackInputFrames"),
        readbackFramesDelta: counterDelta(afterCounters, beforeCounters, "readbackOutputFrames"),
        nv12PreparedFramesDelta: counterDelta(afterCounters, beforeCounters, "nv12PreparedFrames"),
        transportOfferFramesDelta: counterDelta(afterCounters, beforeCounters, "transportOfferedFrames"),
        transportFramesDelta: counterDelta(afterCounters, beforeCounters, "transportWrittenFrames"),
        nativeStaleDropsDelta: counterDelta(afterCounters, beforeCounters, "nativeStaleDrops"),
        pipeBackpressureDropsDelta: counterDelta(afterCounters, beforeCounters, "pipeBackpressureDrops"),
        transportWriteFailuresDelta: counterDelta(afterCounters, beforeCounters, "transportWriteFailures"),
        transportWriteTimeoutsDelta: counterDelta(afterCounters, beforeCounters, "transportWriteTimeouts"),
        wgcFrameClosedFramesDelta: counterDelta(afterCounters, beforeCounters, "wgcFrameClosedFrames"),
        wgcTextureReleasedFramesDelta: counterDelta(afterCounters, beforeCounters, "wgcTextureReleasedFrames"),
        ownedCopyInputFramesDelta: counterDelta(afterCounters, beforeCounters, "ownedCopyInputFrames"),
        ownedCopyOutputFramesDelta: counterDelta(afterCounters, beforeCounters, "ownedCopyOutputFrames"),
        ownedTextureProcessedFramesDelta: counterDelta(afterCounters, beforeCounters, "ownedTextureProcessedFrames"),
        ownedTextureStaleDropsDelta: counterDelta(afterCounters, beforeCounters, "ownedTextureStaleDrops"),
        ownedTextureNoSlotDropsDelta: counterDelta(afterCounters, beforeCounters, "ownedTextureNoSlotDrops"),
        handoffAcceptedFramesDelta: counterDelta(afterCounters, beforeCounters, "handoffAcceptedFrames"),
        readbackSubmittedFramesDelta: counterDelta(afterCounters, beforeCounters, "readbackSubmittedFrames"),
        readbackReadyFramesDelta: counterDelta(afterCounters, beforeCounters, "readbackReadyFrames"),
        readbackStaleDropsDelta: counterDelta(afterCounters, beforeCounters, "readbackStaleDrops"),
        readbackNotReadyCountDelta: counterDelta(afterCounters, beforeCounters, "readbackNotReadyCount"),
        readbackQueryReadyCompletionsDelta: counterDelta(afterCounters, beforeCounters, "readbackQueryReadyCompletions"),
        readbackRingFullDropsDelta: counterDelta(afterCounters, beforeCounters, "readbackRingFullDrops"),
        readbackCompletedSupersededDropsDelta: counterDelta(afterCounters, beforeCounters, "readbackCompletedSupersededDrops"),
        readbackShutdownDropsDelta: counterDelta(afterCounters, beforeCounters, "readbackShutdownDrops"),
        readbackSlotReuseBeforeReadyCountDelta: counterDelta(afterCounters, beforeCounters, "readbackSlotReuseBeforeReadyCount"),
        readbackNoReadyFrameChecksDelta: counterDelta(afterCounters, beforeCounters, "readbackNoReadyFrameChecks"),
        readbackSuccessfulMapsDelta: counterDelta(afterCounters, beforeCounters, "readbackSuccessfulMaps"),
        readbackMapFailuresDelta: counterDelta(afterCounters, beforeCounters, "readbackMapFailures"),
        readbackMapStillDrawingDelta: counterDelta(afterCounters, beforeCounters, "readbackMapStillDrawing"),
        readbackStaleAgeTotalUsDelta: counterDelta(afterCounters, beforeCounters, "readbackStaleAgeTotalUs"),
        readbackSubmitToNv12TotalUsDelta: counterDelta(afterCounters, beforeCounters, "readbackSubmitToNv12TotalUs"),
        readbackPostSubmitChecksDelta: counterDelta(afterCounters, beforeCounters, "readbackPostSubmitChecks"),
        readbackPostSubmitReadyFramesDelta: counterDelta(afterCounters, beforeCounters, "readbackPostSubmitReadyFrames"),
        readbackCompletedFramesPreservedDelta: counterDelta(afterCounters, beforeCounters, "readbackCompletedFramesPreserved"),
        readbackOldestCompletedMappedDelta: counterDelta(afterCounters, beforeCounters, "readbackOldestCompletedMapped"),
        readbackHeadOfLineBlockedChecksDelta: counterDelta(afterCounters, beforeCounters, "readbackHeadOfLineBlockedChecks"),
        readbackIncomingDropsWhilePreservingDelta: counterDelta(afterCounters, beforeCounters, "readbackIncomingDropsWhilePreserving"),
        readbackNonMonotonicMapAttemptsDelta: counterDelta(afterCounters, beforeCounters, "readbackNonMonotonicMapAttempts"),
        explicitFlushCountDelta: counterDelta(afterCounters, beforeCounters, "explicitFlushCount"),
        queryDoNotFlushChecksDelta: counterDelta(afterCounters, beforeCounters, "queryDoNotFlushChecks"),
        queryAllowFlushChecksDelta: counterDelta(afterCounters, beforeCounters, "queryAllowFlushChecks"),
        fenceCompletionChecksDelta: counterDelta(afterCounters, beforeCounters, "fenceCompletionChecks"),
        pipeDataEventsDelta: counterDelta(mainAfter, mainBefore, "pipeDataEvents"),
        pipeBytesReceivedDelta: counterDelta(mainAfter, mainBefore, "pipeBytesReceived"),
        mainPacketsAssembledDelta: counterDelta(mainAfter, mainBefore, "pipePacketsAssembled"),
        mainPostAttemptsDelta: counterDelta(mainAfter, mainBefore, "mainToRendererPostAttempts"),
        mainPostReturnedDelta: counterDelta(mainAfter, mainBefore, "mainToRendererPostReturned"),
        mainAcknowledgedFramesDelta: counterDelta(mainAfter, mainBefore, "acknowledgedFrames"),
        mainDroppedStaleFramesDelta: counterDelta(mainAfter, mainBefore, "mainDroppedStaleFrames"),
        rendererReceivedFramesDelta: counterDelta(rendererAfter, rendererBefore, "receivedFrames"),
        rendererHandlerEnteredFramesDelta: counterDelta(rendererAfter, rendererBefore, "rendererHandlerEnteredFrames"),
        rendererAcceptedFramesDelta: counterDelta(rendererAfter, rendererBefore, "rendererAcceptedFrames"),
        rendererAcknowledgementsSentDelta: counterDelta(rendererAfter, rendererBefore, "acknowledgementsSent"),
        generatedFramesDelta: counterDelta(rendererAfter, rendererBefore, "generatedFrames"),
        rendererDropsDelta: counterDelta(rendererAfter, rendererBefore, "bridgeDroppedStaleFrames"),
        invalidFramesDelta: counterDelta(rendererAfter, rendererBefore, "invalidFrames"),
        generatorWriteFailuresDelta: counterDelta(rendererAfter, rendererBefore, "writeFailures"),
        videoFramesCreatedDelta: counterDelta(rendererAfter, rendererBefore, "videoFramesCreated"),
        videoFramesClosedDelta: counterDelta(rendererAfter, rendererBefore, "videoFramesClosed"),
        generatorWriteCallsDelta: counterDelta(rendererAfter, rendererBefore, "writerWriteCalls"),
        generatorWriteCompletionsDelta: counterDelta(rendererAfter, rendererBefore, "writerWriteCompletions"),
        generatorReadyWaitStartedDelta: counterDelta(rendererAfter, rendererBefore, "writerReadyWaitStarted"),
        generatorReadyWaitCompletedDelta: counterDelta(rendererAfter, rendererBefore, "writerReadyWaitCompleted"),
      };
      const cadence = {
        wgcArrivalFps: fpsFromDelta(deltas.wgcFramesDelta, actualDurationMs),
        wgcAcceptedFps: fpsFromDelta(deltas.wgcAcceptedFramesDelta, actualDurationMs),
        ownedCopyInputFps: fpsFromDelta(deltas.ownedCopyInputFramesDelta, actualDurationMs),
        ownedCopyOutputFps: fpsFromDelta(deltas.ownedCopyOutputFramesDelta, actualDurationMs),
        ownedTextureProcessedFps: fpsFromDelta(deltas.ownedTextureProcessedFramesDelta, actualDurationMs),
        handoffAcceptanceFps: fpsFromDelta(deltas.handoffAcceptedFramesDelta, actualDurationMs),
        gpuScaleInputFps: fpsFromDelta(deltas.gpuScaleInputFramesDelta, actualDurationMs),
        gpuScaleOutputFps: fpsFromDelta(deltas.gpuScaleOutputFramesDelta, actualDurationMs),
        readbackInputFps: fpsFromDelta(deltas.readbackInputFramesDelta, actualDurationMs),
        readbackOutputFps: fpsFromDelta(deltas.readbackFramesDelta, actualDurationMs),
        readbackSubmittedFps: fpsFromDelta(deltas.readbackSubmittedFramesDelta, actualDurationMs),
        readbackReadyFps: fpsFromDelta(deltas.readbackReadyFramesDelta, actualDurationMs),
        nv12PreparedFps: fpsFromDelta(deltas.nv12PreparedFramesDelta, actualDurationMs),
        transportOfferFps: fpsFromDelta(deltas.transportOfferFramesDelta, actualDurationMs),
        transportWrittenFps: fpsFromDelta(deltas.transportFramesDelta, actualDurationMs),
        rendererReceivedFps: fpsFromDelta(deltas.rendererReceivedFramesDelta, actualDurationMs),
        generatedTrackFps: fpsFromDelta(deltas.generatedFramesDelta, actualDurationMs),
      };
      const beforeMainTiming = mainBefore?.stageTimingSamples || {};
      const afterMainTiming = mainAfter?.stageTimingSamples || {};
      const timings = {
        wgcFrameLifetime: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.wgcFrameLifetime,
          beforeMainTiming.wgcFrameLifetime?.totalCount,
        )),
        wgcTextureLifetime: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.wgcTextureLifetime,
          beforeMainTiming.wgcTextureLifetime?.totalCount,
        )),
        ownedTextureLifetime: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.ownedTextureLifetime,
          beforeMainTiming.ownedTextureLifetime?.totalCount,
        )),
        captureCallback: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.captureCallback,
          beforeMainTiming.captureCallback?.totalCount,
        )),
        readbackMapCpuWait: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.readbackMapCpuWait,
          beforeMainTiming.readbackMapCpuWait?.totalCount,
        )),
        readbackSubmission: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.readbackSubmission,
          beforeMainTiming.readbackSubmission?.totalCount,
        )),
        readbackReadyLatency: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.readbackReadyLatency,
          beforeMainTiming.readbackReadyLatency?.totalCount,
        )),
        readbackReadyToMap: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.readbackReadyToMap,
          beforeMainTiming.readbackReadyToMap?.totalCount,
        )),
        readbackSubmitToNv12: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.readbackSubmitToNv12,
          beforeMainTiming.readbackSubmitToNv12?.totalCount,
        )),
        explicitFlush: summarizeTimingValues(timingValuesAfter(
          afterMainTiming.explicitFlush,
          beforeMainTiming.explicitFlush?.totalCount,
        )),
        gpuScale: summarizeTimingValues(timingValuesAfter(afterMainTiming.gpuScale, beforeMainTiming.gpuScale?.totalCount)),
        gpuReadback: summarizeTimingValues(timingValuesAfter(afterMainTiming.gpuReadback, beforeMainTiming.gpuReadback?.totalCount)),
        nv12Preparation: summarizeTimingValues(timingValuesAfter(afterMainTiming.nv12Preparation, beforeMainTiming.nv12Preparation?.totalCount)),
        transportWrite: summarizeTimingValues(timingValuesAfter(afterMainTiming.transportWrite, beforeMainTiming.transportWrite?.totalCount)),
        mainPacketAssembly: summarizeTimingValues(timingValuesAfter(afterMainTiming.mainPacketAssembly, beforeMainTiming.mainPacketAssembly?.totalCount)),
        mainToRendererPost: summarizeTimingValues(timingValuesAfter(afterMainTiming.mainToRendererPost, beforeMainTiming.mainToRendererPost?.totalCount)),
        mainToRendererAck: summarizeTimingValues(timingValuesAfter(afterMainTiming.mainToRendererAck, beforeMainTiming.mainToRendererAck?.totalCount)),
        mainToRendererTransit: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.mainToRendererTransit,
          rendererBefore.timingCounts.mainToRendererTransit,
        )),
        rendererHandlerInterArrival: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.rendererHandlerInterArrival,
          rendererBefore.timingCounts.rendererHandlerInterArrival,
        )),
        rendererAcceptedInterArrival: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.rendererAcceptedInterArrival,
          rendererBefore.timingCounts.rendererAcceptedInterArrival,
        )),
        rendererPacketAssembly: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.rendererPacketAssembly,
          rendererBefore.timingCounts.rendererPacketAssembly,
        )),
        videoFrameConstruction: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.videoFrameConstruction,
          rendererBefore.timingCounts.videoFrameConstruction,
        )),
        generatorWriteInterArrival: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.generatorWriteInterArrival,
          rendererBefore.timingCounts.generatorWriteInterArrival,
        )),
        generatorWrite: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.generatorWrite,
          rendererBefore.timingCounts.generatorWrite,
        )),
        generatorReadyWait: summarizeTimingValues(localTimingValuesAfter(
          session.stageTimingSamples.generatorReadyWait,
          rendererBefore.timingCounts.generatorReadyWait,
        )),
        rendererEventLoopDelay,
      };
      const result = {
        status: "sampled",
        sampleId,
        startedAt,
        endedAt,
        requestedDurationMs: boundedDurationMs,
        warmupMs: boundedWarmupMs,
        durationMs: actualDurationMs,
        capturePath: "native_high_motion",
        handoffMode: afterCounters.handoffMode || mainAfter?.handoffMode || null,
        readbackMode: afterCounters.readbackMode || mainAfter?.readbackMode || null,
        readbackCompletionStrategy: afterCounters.readbackCompletionStrategy
          || mainAfter?.readbackCompletionStrategy
          || null,
        readbackDrainPolicy: afterCounters.readbackDrainPolicy
          || mainAfter?.readbackDrainPolicy
          || null,
        published: session.published === true,
        cadence,
        deltas,
        timings,
        wgcSessionConfig: mainAfter?.wgcSessionConfig || mainBefore?.wgcSessionConfig || null,
        wgcRuntime: {
          framePoolRecreateCountStart: Number(beforeCounters.framePoolRecreateCount || 0),
          framePoolRecreateCountEnd: Number(afterCounters.framePoolRecreateCount || 0),
          framePoolRecreateCountDelta: counterDelta(afterCounters, beforeCounters, "framePoolRecreateCount"),
          nativeContentWidth: Number(afterCounters.nativeContentWidth || 0) || null,
          nativeContentHeight: Number(afterCounters.nativeContentHeight || 0) || null,
          nativeTextureWidth: Number(afterCounters.nativeTextureWidth || 0) || null,
          nativeTextureHeight: Number(afterCounters.nativeTextureHeight || 0) || null,
          callbackThreadIdPresent: afterCounters.callbackThreadIdPresent === true,
          wgcTextureRefsCurrent: Number(afterCounters.wgcTextureRefsCurrent || 0),
          wgcTextureRefsMaximum: Number(afterCounters.wgcTextureRefsMaximum || 0),
          wgcFrameLifetimeMaximumMs: Number(afterCounters.wgcFrameLifetimeMaximumUs || 0) / 1000,
          wgcTextureLifetimeMaximumMs: Number(afterCounters.wgcTextureLifetimeMaximumUs || 0) / 1000,
          gpuContextThreadIdPresent: afterCounters.gpuContextThreadIdPresent === true,
          gpuContextCrossThreadUse: afterCounters.gpuContextCrossThreadUse === true,
          captureGpuThreadIdPresent: afterCounters.captureGpuThreadIdPresent === true,
          ownedTextureSlotCount: Number(afterCounters.ownedTextureSlotCount || 0),
          ownedTextureCurrentDepth: Number(afterCounters.ownedTextureCurrentDepth || 0),
          ownedTextureMaximumDepth: Number(afterCounters.ownedTextureMaximumDepth || 0),
          ownedTextureLifetimeMaximumMs: Number(afterCounters.ownedTextureLifetimeMaximumUs || 0) / 1000,
          captureCallbackMaximumMs: Number(afterCounters.captureCallbackMaximumUs || 0) / 1000,
          captureProcessingSameAdapter: afterCounters.captureProcessingSameAdapter === true,
          captureProcessingSeparateDevice: afterCounters.captureProcessingSeparateDevice === true,
        },
        queue: {
          currentDepth: (session.writePending ? 1 : 0) + (session.pendingFrameMessage ? 1 : 0),
          maximumDepth: session.maximumQueueDepth,
          newestFrameWins: true,
          ownedTextureSlotCount: Number(afterCounters.ownedTextureSlotCount || 0),
          ownedTextureCurrentDepth: Number(afterCounters.ownedTextureCurrentDepth || 0),
          ownedTextureMaximumDepth: Number(afterCounters.ownedTextureMaximumDepth || 0),
          ownedTextureStaleDropsDelta: deltas.ownedTextureStaleDropsDelta,
          ownedTextureNoSlotDropsDelta: deltas.ownedTextureNoSlotDropsDelta,
          readbackSlotCount: Number(afterCounters.readbackSlotCount || 0),
          readbackCurrentDepth: Number(afterCounters.readbackCurrentDepth || 0),
          readbackMaximumDepth: Number(afterCounters.readbackMaximumDepth || 0),
          readbackStaleDropsDelta: deltas.readbackStaleDropsDelta,
          readbackNotReadyCountDelta: deltas.readbackNotReadyCountDelta,
          readbackDropReasons: {
            ringFullDelta: deltas.readbackRingFullDropsDelta,
            completedSupersededDelta: deltas.readbackCompletedSupersededDropsDelta,
            shutdownDelta: deltas.readbackShutdownDropsDelta,
            slotReuseBeforeReadyDelta: deltas.readbackSlotReuseBeforeReadyCountDelta,
          },
          readbackNoReadyFrameChecksDelta: deltas.readbackNoReadyFrameChecksDelta,
          readbackSuccessfulMapsDelta: deltas.readbackSuccessfulMapsDelta,
          readbackMapFailuresDelta: deltas.readbackMapFailuresDelta,
          readbackMapStillDrawingDelta: deltas.readbackMapStillDrawingDelta,
          readbackQueryReadyCompletionsDelta: deltas.readbackQueryReadyCompletionsDelta,
          readbackPostSubmitChecksDelta: deltas.readbackPostSubmitChecksDelta,
          readbackPostSubmitReadyFramesDelta: deltas.readbackPostSubmitReadyFramesDelta,
          readbackDrainPolicy: afterCounters.readbackDrainPolicy || null,
          completedFramesPreservedDelta: deltas.readbackCompletedFramesPreservedDelta,
          oldestCompletedMappedDelta: deltas.readbackOldestCompletedMappedDelta,
          headOfLineBlockedChecksDelta: deltas.readbackHeadOfLineBlockedChecksDelta,
          incomingDropsWhilePreservingDelta: deltas.readbackIncomingDropsWhilePreservingDelta,
          nonMonotonicMapAttemptsDelta: deltas.readbackNonMonotonicMapAttemptsDelta,
          lastMappedSequence: Number(afterCounters.readbackLastMappedSequence || 0),
          lastMappedTimestampUs: Number(afterCounters.readbackLastMappedTimestampUs || 0),
          completedBacklogCurrent: Number(afterCounters.readbackCompletedBacklogCurrent || 0),
          maximumCompletedBacklog: Number(afterCounters.readbackMaximumCompletedBacklog || 0),
          readbackStagingMemoryBytes: Number(afterCounters.readbackSlotCount || 0)
            * Number(active?.payloadBytes || 0),
          readbackLatencyHistogram: {
            labels: ["lt_16_7_ms", "16_7_to_25_ms", "25_to_33_4_ms", "33_4_to_50_ms", "gte_50_ms"],
            submitToQueryReady: counterArrayDelta(
              afterCounters, beforeCounters, "readbackReadyLatencyHistogram",
            ),
            staleAgeAtDiscard: counterArrayDelta(
              afterCounters, beforeCounters, "readbackStaleAgeHistogram",
            ),
            submitToNv12Ready: counterArrayDelta(
              afterCounters, beforeCounters, "readbackSubmitToNv12Histogram",
            ),
          },
          readbackStaleAge: {
            averageMs: (deltas.readbackCompletedSupersededDropsDelta + deltas.readbackShutdownDropsDelta)
              ? deltas.readbackStaleAgeTotalUsDelta
                / (deltas.readbackCompletedSupersededDropsDelta + deltas.readbackShutdownDropsDelta)
                / 1000
              : null,
            sessionMaximumMs: Number(afterCounters.readbackStaleAgeMaximumUs || 0) / 1000,
          },
          explicitFlushCountDelta: deltas.explicitFlushCountDelta,
          queryDoNotFlushChecksDelta: deltas.queryDoNotFlushChecksDelta,
          queryAllowFlushChecksDelta: deltas.queryAllowFlushChecksDelta,
          fenceCompletionChecksDelta: deltas.fenceCompletionChecksDelta,
          fenceSupported: afterCounters.fenceSupported === true,
        },
        videoFrameOwnership: {
          createdDelta: deltas.videoFramesCreatedDelta,
          closedDelta: deltas.videoFramesClosedDelta,
          outstandingAtEnd: Number(rendererAfter.videoFrameOutstanding || 0),
          balancedInWindow: deltas.videoFramesCreatedDelta === deltas.videoFramesClosedDelta,
        },
        generatorBackpressure: {
          writeCallsDelta: deltas.generatorWriteCallsDelta,
          writeCompletionsDelta: deltas.generatorWriteCompletionsDelta,
          readyWaitStartedDelta: deltas.generatorReadyWaitStartedDelta,
          readyWaitCompletedDelta: deltas.generatorReadyWaitCompletedDelta,
          desiredSizeStart: rendererBefore.writerDesiredSizeLatest,
          desiredSizeEnd: rendererAfter.writerDesiredSizeLatest,
          readyWait: timings.generatorReadyWait,
          passiveObservationOnly: true,
        },
        deliveryAccounting: {
          semantics: {
            transportWrittenFrames: "native_helper_cumulative_count_observed_on_the_last_frame_header_in_each_window",
            pipePacketsAssembled: "complete_native_frame_packets_assembled_in_main",
            mainPostReturned: "MessagePort.postMessage_returned_synchronously_not_renderer_delivery_completion",
            mainAcknowledgedFrames: "ack_received_after_renderer_message_handler_entry",
            rendererHandlerEnteredFrames: "renderer_MessagePort_handler_entries",
            rendererAcceptedFrames: "renderer_frames_passing_protocol_and_timestamp_validation",
          },
          transportWrittenFramesDelta: deltas.transportFramesDelta,
          pipeDataEventsDelta: deltas.pipeDataEventsDelta,
          pipeBytesReceivedDelta: deltas.pipeBytesReceivedDelta,
          mainPacketsAssembledDelta: deltas.mainPacketsAssembledDelta,
          mainPostAttemptsDelta: deltas.mainPostAttemptsDelta,
          mainPostReturnedDelta: deltas.mainPostReturnedDelta,
          mainAcknowledgedFramesDelta: deltas.mainAcknowledgedFramesDelta,
          mainDroppedStaleFramesDelta: deltas.mainDroppedStaleFramesDelta,
          rendererHandlerEnteredFramesDelta: deltas.rendererHandlerEnteredFramesDelta,
          rendererAcknowledgementsSentDelta: deltas.rendererAcknowledgementsSentDelta,
          rendererAcceptedFramesDelta: deltas.rendererAcceptedFramesDelta,
          videoFramesConstructedDelta: deltas.videoFramesCreatedDelta,
          generatorWriteCallsDelta: deltas.generatorWriteCallsDelta,
          windowBoundarySkewPossible: true,
          inferredDrops: false,
        },
        classification: classifyNativeBridgeStages(cadence),
        cachedDiagnosticsUsed: false,
      };
      session.lastStageMeasurement = result;
      return result;
    })().finally(() => {
      if (active === session) session.stageMeasurementPromise = null;
    });
    return session.stageMeasurementPromise;
  }

  async function stop({ reason = "renderer_stop" } = {}) {
    const session = active;
    if (!session) return { stopped: false, diagnostics: readActiveDiagnostics() };
    if (session.stopPromise) return session.stopPromise;
    session.stopPromise = (async () => {
      session.stopped = true;
      try { session.port?.close?.(); } catch (_) {}
      try { await session.writer?.close?.(); } catch (_) {}
      try { session.track?.stop?.(); } catch (_) {}
      let result = null;
      try {
        result = await desktopBridge?.stopNativeHighMotionCapture?.({ sessionId: session.sessionId });
      } catch (_) {
        result = null;
      }
      lastDiagnostics = {
        ...readActiveDiagnostics(),
        active: false,
        cleanupComplete: true,
        cleanupReason: String(reason || "renderer_stop").slice(0, 80),
      };
      active = null;
      return result || { stopped: true, diagnostics: { ...lastDiagnostics } };
    })();
    return session.stopPromise;
  }

  async function start({ sourceId = "", preset = "720p60" } = {}) {
    if (active && !active.stopped) return { ok: false, category: "native_high_motion_capture_already_active" };
    if (!isNativeHighMotionGeneratorSupported(scope)) {
      lastDiagnostics = { ...lastDiagnostics, lastFailureCategory: "media_stream_track_generator_unavailable" };
      return { ok: false, category: "media_stream_track_generator_unavailable", diagnostics: readActiveDiagnostics() };
    }
    if (!desktopBridge || typeof desktopBridge.startNativeHighMotionCapture !== "function") {
      return { ok: false, category: "native_high_motion_desktop_bridge_unavailable", diagnostics: readActiveDiagnostics() };
    }
    const result = await desktopBridge.startNativeHighMotionCapture({ sourceId, preset });
    const sessionId = String(result?.sessionId || "").trim().toLowerCase();
    if (result?.ok !== true || !SESSION_ID_PATTERN.test(sessionId)) {
      lastDiagnostics = {
        ...lastDiagnostics,
        active: false,
        capturePath: "chromium_compatibility",
        lastFailureCategory: String(result?.category || "native_high_motion_start_failed").slice(0, 120),
      };
      return { ...(result || {}), ok: false, diagnostics: readActiveDiagnostics() };
    }
    const port = await waitForTransferredPort(sessionId);
    if (!port) {
      try { await desktopBridge.stopNativeHighMotionCapture({ sessionId }); } catch (_) {}
      lastDiagnostics = { ...lastDiagnostics, lastFailureCategory: "native_high_motion_port_transfer_timeout" };
      return { ok: false, category: "native_high_motion_port_transfer_timeout", diagnostics: readActiveDiagnostics() };
    }
    const generator = new scope.MediaStreamTrackGenerator({ kind: "video" });
    const writer = generator.writable.getWriter();
    const stream = new scope.MediaStream([generator]);
    try { generator.contentHint = "motion"; } catch (_) {}
    const session = {
      sessionId,
      port,
      writer,
      track: generator,
      stream,
      stopped: false,
      stopPromise: null,
      writePending: false,
      pendingFrameMessage: null,
      maximumQueueDepth: 0,
      receivedFrames: 0,
      rendererHandlerEnteredFrames: 0,
      rendererAcceptedFrames: 0,
      acknowledgementsSent: 0,
      lastRendererHandlerAt: null,
      lastRendererAcceptedAt: null,
      lastGeneratorWriteAt: null,
      generatedFrames: 0,
      invalidFrames: 0,
      nonMonotonicFrames: 0,
      writeFailures: 0,
      videoFramesCreated: 0,
      videoFramesClosed: 0,
      videoFrameOutstanding: 0,
      writerWriteCalls: 0,
      writerWriteCompletions: 0,
      writerReadyWaitStarted: 0,
      writerReadyWaitCompleted: 0,
      writerReadyObservationPending: false,
      writerDesiredSizeLatest: null,
      writerDesiredSizeMinimum: null,
      writerDesiredSizeMaximum: null,
      bridgeDroppedStaleFrames: 0,
      firstTimestampUs: 0,
      lastTimestampUs: 0,
      firstCapturedFrames: 0,
      lastCapturedFrames: 0,
      nativeDroppedStaleFrames: 0,
      preparationMs: [],
      bridgeLatencyMs: [],
      stageTimingSamples: {
        mainToRendererTransit: createTimingSeries(),
        rendererHandlerInterArrival: createTimingSeries(),
        rendererAcceptedInterArrival: createTimingSeries(),
        rendererPacketAssembly: createTimingSeries(),
        videoFrameConstruction: createTimingSeries(),
        generatorWriteInterArrival: createTimingSeries(),
        generatorWrite: createTimingSeries(),
        generatorReadyWait: createTimingSeries(),
      },
      stageMeasurementPromise: null,
      lastStageMeasurement: null,
      published: false,
      width: 0,
      height: 0,
      nativeCaptureWidth: 0,
      nativeCaptureHeight: 0,
      nativeTargetFps: Number(result?.output?.fps || 0) || null,
      handoffMode: String(result?.handoffMode || "") || null,
      readbackMode: String(result?.readbackMode || "") || null,
      readbackCompletionStrategy: String(result?.readbackCompletionStrategy || "") || null,
      rowPitch: 0,
      payloadBytes: 0,
    };
    active = session;
    session.nativeCaptureWidth = Number(result?.nativeCapture?.width || 0);
    session.nativeCaptureHeight = Number(result?.nativeCapture?.height || 0);
    lastDiagnostics = {
      ...lastDiagnostics,
      active: true,
      capturePath: "native_high_motion",
      cleanupComplete: false,
      lastFailureCategory: null,
    };
    const acknowledge = (sequence) => {
      try {
        port.postMessage({ type: "ack", sequence });
        session.acknowledgementsSent += 1;
      } catch (_) {}
    };
    const processFrameMessage = (message) => {
      if (message.type === "ended") {
        if (!session.stopped) void stop({ reason: String(message.reason || "native_helper_ended") });
        return;
      }
      if (message.type !== "nv12_frame" || session.stopped) return;
      const packetAssemblyStartedAt = Number(scope?.performance?.now?.() || 0);
      const sequence = Number(message.sequence);
      const frameData = normalizeFramePayload(message.frame);
      const width = Number(message.width);
      const height = Number(message.height);
      const rowPitch = Number(message.rowPitch);
      const timestampUs = Number(message.timestampUs);
      const captureEpochUs = Number(message.captureEpochUs);
      const valid = frameData
        && Number.isInteger(width) && width >= 320 && width <= 1920
        && Number.isInteger(height) && height >= 180 && height <= 1080
        && Number.isInteger(rowPitch) && rowPitch >= width
        && Number.isSafeInteger(timestampUs) && timestampUs > 0
        && Number.isSafeInteger(captureEpochUs) && captureEpochUs > 0
        && frameData.byteLength === rowPitch * height * 3 / 2;
      if (!valid) {
        session.invalidFrames += 1;
        return;
      }
      if (session.lastTimestampUs && timestampUs <= session.lastTimestampUs) {
        session.nonMonotonicFrames += 1;
        return;
      }
      const acceptedAt = Number(scope?.performance?.now?.() || 0);
      if (session.lastRendererAcceptedAt !== null) {
        appendTimingSample(
          session.stageTimingSamples.rendererAcceptedInterArrival,
          acceptedAt - session.lastRendererAcceptedAt,
        );
      }
      session.lastRendererAcceptedAt = acceptedAt;
      session.rendererAcceptedFrames += 1;
      session.writePending = true;
      session.width = width;
      session.height = height;
      session.rowPitch = rowPitch;
      session.payloadBytes = frameData.byteLength;
      session.firstTimestampUs ||= timestampUs;
      session.lastTimestampUs = timestampUs;
      const capturedFrames = Number(message.capturedFrames || 0);
      session.firstCapturedFrames ||= capturedFrames;
      session.lastCapturedFrames = capturedFrames;
      session.nativeDroppedStaleFrames = Number(message.nativeDroppedStaleFrames || 0);
      const preparationMs = Number(message.nativePreparationUs || 0) / 1000;
      if (Number.isFinite(preparationMs) && preparationMs >= 0) {
        session.preparationMs.push(preparationMs);
        while (session.preparationMs.length > 240) session.preparationMs.shift();
      }
      appendTimingSample(
        session.stageTimingSamples.rendererPacketAssembly,
        Number(scope?.performance?.now?.() || 0) - packetAssemblyStartedAt,
      );
      let frame = null;
      const videoFrameStartedAt = Number(scope?.performance?.now?.() || 0);
      try {
        frame = new scope.VideoFrame(frameData, {
          format: "NV12",
          codedWidth: width,
          codedHeight: height,
          displayWidth: width,
          displayHeight: height,
          timestamp: timestampUs,
          layout: [
            { offset: 0, stride: rowPitch },
            { offset: rowPitch * height, stride: rowPitch },
          ],
        });
      } catch (_) {
        session.invalidFrames += 1;
        session.writePending = false;
        return;
      }
      session.videoFramesCreated += 1;
      session.videoFrameOutstanding += 1;
      let frameClosed = false;
      const closeFrame = () => {
        if (frameClosed) return;
        frameClosed = true;
        try { frame?.close?.(); } catch (_) {}
        session.videoFramesClosed += 1;
        session.videoFrameOutstanding = Math.max(0, session.videoFrameOutstanding - 1);
      };
      appendTimingSample(
        session.stageTimingSamples.videoFrameConstruction,
        Number(scope?.performance?.now?.() || 0) - videoFrameStartedAt,
      );
      const generatorWriteStartedAt = Number(scope?.performance?.now?.() || 0);
      const desiredSizeBeforeWrite = Number(writer.desiredSize);
      if (Number.isFinite(desiredSizeBeforeWrite)) {
        session.writerDesiredSizeLatest = desiredSizeBeforeWrite;
        session.writerDesiredSizeMinimum = session.writerDesiredSizeMinimum === null
          ? desiredSizeBeforeWrite
          : Math.min(session.writerDesiredSizeMinimum, desiredSizeBeforeWrite);
        session.writerDesiredSizeMaximum = session.writerDesiredSizeMaximum === null
          ? desiredSizeBeforeWrite
          : Math.max(session.writerDesiredSizeMaximum, desiredSizeBeforeWrite);
      }
      if (desiredSizeBeforeWrite <= 0 && session.writerReadyObservationPending !== true) {
        session.writerReadyObservationPending = true;
        session.writerReadyWaitStarted += 1;
        const readyWaitStartedAt = generatorWriteStartedAt;
        Promise.resolve(writer.ready)
          .then(() => {
            session.writerReadyWaitCompleted += 1;
            appendTimingSample(
              session.stageTimingSamples.generatorReadyWait,
              Number(scope?.performance?.now?.() || 0) - readyWaitStartedAt,
            );
          })
          .catch(() => {})
          .finally(() => { session.writerReadyObservationPending = false; });
      }
      let writeResult = null;
      try {
        const writeCalledAt = Number(scope?.performance?.now?.() || 0);
        if (session.lastGeneratorWriteAt !== null) {
          appendTimingSample(
            session.stageTimingSamples.generatorWriteInterArrival,
            writeCalledAt - session.lastGeneratorWriteAt,
          );
        }
        session.lastGeneratorWriteAt = writeCalledAt;
        session.writerWriteCalls += 1;
        writeResult = writer.write(frame);
      } catch (_) {
        session.writeFailures += 1;
        closeFrame();
        session.writePending = false;
        const pending = session.pendingFrameMessage;
        session.pendingFrameMessage = null;
        if (pending && !session.stopped) processFrameMessage(pending);
        return;
      }
      Promise.resolve(writeResult)
        .then(() => {
          session.writerWriteCompletions += 1;
          session.generatedFrames += 1;
          appendTimingSample(
            session.stageTimingSamples.generatorWrite,
            Number(scope?.performance?.now?.() || 0) - generatorWriteStartedAt,
          );
          const deliveredAtEpochMs = Number(scope?.performance?.timeOrigin || 0)
            + Number(scope?.performance?.now?.() || 0);
          const latencyMs = deliveredAtEpochMs - captureEpochUs / 1000;
          if (Number.isFinite(latencyMs) && latencyMs >= 0 && latencyMs < 10_000) {
            session.bridgeLatencyMs.push(latencyMs);
            while (session.bridgeLatencyMs.length > 240) session.bridgeLatencyMs.shift();
          }
        })
        .catch(() => { session.writeFailures += 1; })
        .finally(() => {
          closeFrame();
          session.writePending = false;
          const pending = session.pendingFrameMessage;
          session.pendingFrameMessage = null;
          if (pending && !session.stopped) processFrameMessage(pending);
        });
    };
    port.onmessage = (event) => {
      const message = event?.data && typeof event.data === "object" ? event.data : {};
      if (message.type === "ended") {
        processFrameMessage(message);
        return;
      }
      if (message.type !== "nv12_frame" || session.stopped) return;
      const handlerEnteredAt = Number(scope?.performance?.now?.() || 0);
      session.rendererHandlerEnteredFrames += 1;
      if (session.lastRendererHandlerAt !== null) {
        appendTimingSample(
          session.stageTimingSamples.rendererHandlerInterArrival,
          handlerEnteredAt - session.lastRendererHandlerAt,
        );
      }
      session.lastRendererHandlerAt = handlerEnteredAt;
      const mainPostedAtEpochMs = Number(message.mainPostedAtEpochMs || 0);
      if (mainPostedAtEpochMs > 0) {
        const rendererEnteredAtEpochMs = Number(scope?.performance?.timeOrigin || 0) + handlerEnteredAt;
        appendTimingSample(
          session.stageTimingSamples.mainToRendererTransit,
          Math.max(0, rendererEnteredAtEpochMs - mainPostedAtEpochMs),
        );
      }
      session.receivedFrames += 1;
      acknowledge(Number(message.sequence));
      if (session.writePending) {
        if (session.pendingFrameMessage) session.bridgeDroppedStaleFrames += 1;
        session.pendingFrameMessage = message;
        session.maximumQueueDepth = Math.max(session.maximumQueueDepth, 2);
        return;
      }
      session.maximumQueueDepth = Math.max(session.maximumQueueDepth, 1);
      processFrameMessage(message);
    };
    try { port.start?.(); } catch (_) {}
    Object.defineProperties(stream, {
      __altaraNativeHighMotionCapture: { value: true, configurable: true },
      __altaraNativeHighMotionController: {
        value: Object.freeze({
          stop,
          getDiagnostics: readActiveDiagnostics,
          measureStages: measureNativeBridgeStages,
          markPublished: (published = true) => {
            if (active === session && !session.stopped) session.published = published === true;
          },
        }),
        configurable: true,
      },
      __altaraCapturePath: { value: "native_high_motion", configurable: true },
    });
    return {
      ok: true,
      prototypeOnly: true,
      stream,
      track: generator,
      sessionId,
      capturePath: "native_high_motion",
      diagnostics: readActiveDiagnostics(),
    };
  }

  return Object.freeze({
    start,
    stop,
    getDiagnostics: readActiveDiagnostics,
    measureStages: measureNativeBridgeStages,
    isSupported: () => isNativeHighMotionGeneratorSupported(scope),
  });
}

export {
  NATIVE_HIGH_MOTION_WINDOW_PORT_EVENT,
  classifyNativeHighMotionBoundary,
  classifyNativeBridgeStages,
  isNativeHighMotionGeneratorSupported,
  normalizeFramePayload,
  waitForTransferredPort,
};
