const DEFAULT_SAMPLE_RATE = 48_000;
const DEFAULT_CHANNELS = 2;

function normalizeBridgeFailure(result = null) {
  return String(result?.category || result?.diagnostics?.lastFailureCategory || "process_loopback_unavailable").slice(0, 120);
}

export function createElectronScreenShareAudioRouter({
  bridge = null,
  AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext,
  workletModuleUrl = new URL("./windowsProcessLoopbackWorklet.js", import.meta.url).href,
} = {}) {
  const activeCaptures = new Map();
  let lastDiagnostics = {
    platform: bridge ? "win32_electron" : "browser",
    supported: !!bridge,
    requested: false,
    mode: "NO_AUDIO",
    targetResolved: false,
    excludeAltara: false,
    active: false,
    channels: null,
    sampleRate: null,
    bytesCaptured: 0,
    publicationActive: false,
    lastFailureCategory: null,
    cleanupComplete: true,
  };

  const updateDiagnostics = (patch = {}) => {
    lastDiagnostics = { ...lastDiagnostics, ...patch };
  };

  async function acquire({ sourceId = "" } = {}) {
    updateDiagnostics({ requested: true, lastFailureCategory: null, cleanupComplete: false });
    if (
      !bridge
      || typeof bridge.startScreenShareAudioCapture !== "function"
      || typeof bridge.onScreenShareAudioData !== "function"
      || typeof bridge.stopScreenShareAudioCapture !== "function"
      || typeof AudioContextCtor !== "function"
    ) {
      updateDiagnostics({ supported: false, active: false, cleanupComplete: true, lastFailureCategory: "process_loopback_bridge_unavailable" });
      return { ok: false, category: "process_loopback_bridge_unavailable" };
    }

    let startResult = null;
    try {
      startResult = await bridge.startScreenShareAudioCapture({ sourceId: String(sourceId || "").trim() });
    } catch (_) {
      startResult = { ok: false, category: "process_loopback_start_failed" };
    }
    if (startResult?.ok !== true || !startResult?.sessionId) {
      const category = normalizeBridgeFailure(startResult);
      updateDiagnostics({
        ...(startResult?.diagnostics || {}),
        requested: true,
        active: false,
        cleanupComplete: true,
        lastFailureCategory: category,
      });
      return { ok: false, category, diagnostics: { ...lastDiagnostics } };
    }

    const sessionId = String(startResult.sessionId || "").trim().toLowerCase();
    let context = null;
    let node = null;
    let destination = null;
    let unsubscribe = () => {};
    let track = null;
    let stopped = false;
    let bytesCaptured = 0;

    const stop = async ({ stopTrack = true } = {}) => {
      if (stopped) return true;
      stopped = true;
      activeCaptures.delete(sessionId);
      try { unsubscribe(); } catch (_) {}
      try { node?.port?.postMessage?.({ type: "reset" }); } catch (_) {}
      try { node?.disconnect?.(); } catch (_) {}
      try { destination?.disconnect?.(); } catch (_) {}
      if (stopTrack) {
        try { track?.__altaraOriginalStop?.(); } catch (_) {}
      }
      try { await context?.close?.(); } catch (_) {}
      try { await bridge.stopScreenShareAudioCapture({ sessionId }); } catch (_) {}
      updateDiagnostics({
        active: activeCaptures.size > 0,
        bytesCaptured,
        cleanupComplete: true,
      });
      return true;
    };

    try {
      const sampleRate = Number(startResult.sampleRate || DEFAULT_SAMPLE_RATE) || DEFAULT_SAMPLE_RATE;
      const channels = Number(startResult.channels || DEFAULT_CHANNELS) || DEFAULT_CHANNELS;
      context = new AudioContextCtor({ sampleRate, latencyHint: "interactive" });
      await context.audioWorklet.addModule(workletModuleUrl);
      node = new AudioWorkletNode(context, "altara-process-loopback-pcm", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [channels],
        channelCount: channels,
        channelCountMode: "explicit",
      });
      destination = context.createMediaStreamDestination();
      node.connect(destination);
      track = destination.stream?.getAudioTracks?.()?.[0] || null;
      if (!track) throw new Error("process_loopback_track_missing");
      try { track.contentHint = "music"; } catch (_) {}

      unsubscribe = bridge.onScreenShareAudioData(sessionId, (message = {}) => {
        if (stopped) return;
        if (message?.type === "ended") {
          void stop();
          return;
        }
        const input = message?.pcm;
        const bytes = input instanceof Uint8Array
          ? input
          : (input instanceof ArrayBuffer ? new Uint8Array(input) : null);
        if (!bytes?.byteLength) return;
        bytesCaptured += bytes.byteLength;
        const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        try { node.port.postMessage({ type: "pcm_s16le", pcm: copy }, [copy]); } catch (_) {}
      });
      const originalStop = track.stop.bind(track);
      Object.defineProperty(track, "__altaraOriginalStop", {
        value: originalStop,
        configurable: true,
        enumerable: false,
      });
      Object.defineProperty(track, "stop", {
        value: () => {
          if (stopped) return;
          originalStop();
          void stop({ stopTrack: false });
        },
        configurable: true,
        enumerable: false,
      });
      try { await context.resume?.(); } catch (_) {}

      const capture = Object.freeze({
        ok: true,
        sessionId,
        track,
        mode: startResult.mode,
        targetResolved: startResult.targetResolved === true,
        excludeAltara: startResult.excludeAltara === true,
        channels,
        sampleRate,
        stop,
      });
      activeCaptures.set(sessionId, capture);
      updateDiagnostics({
        ...(startResult?.diagnostics || {}),
        platform: "win32_electron",
        supported: true,
        requested: true,
        mode: startResult.mode || "NO_AUDIO",
        targetResolved: startResult.targetResolved === true,
        excludeAltara: startResult.excludeAltara === true,
        active: true,
        channels,
        sampleRate,
        bytesCaptured: 0,
        publicationActive: false,
        lastFailureCategory: null,
        cleanupComplete: false,
      });
      return capture;
    } catch (error) {
      await stop();
      const category = String(error?.message || "process_loopback_renderer_bridge_failed").slice(0, 120);
      updateDiagnostics({ active: false, lastFailureCategory: category, cleanupComplete: true });
      return { ok: false, category, diagnostics: { ...lastDiagnostics } };
    }
  }

  function markPublicationActive(active) {
    updateDiagnostics({ publicationActive: active === true });
  }

  async function stopAll() {
    await Promise.all(Array.from(activeCaptures.values()).map((capture) => capture.stop()));
    updateDiagnostics({ active: false, publicationActive: false, cleanupComplete: true });
  }

  return Object.freeze({
    acquire,
    stopAll,
    markPublicationActive,
    getDiagnostics: () => ({ ...lastDiagnostics, activeSessionCount: activeCaptures.size }),
  });
}

export { DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE };
