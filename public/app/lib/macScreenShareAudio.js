// Chromium's display audio on Electron uses CoreAudio Tap on macOS 14.2+.
// This is system-wide audio, not application-only audio. Never route through WASAPI.
export function macSystemAudioConstraints() {
  return { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    channelCount: { ideal: 2 }, restrictOwnAudio: true };
}

export function createMacScreenShareAudioRouter({ bridge, mediaDevices = globalThis.navigator?.mediaDevices } = {}) {
  const captures = new Set();
  let diagnostics = { platform: "darwin_electron", supported: false, mode: "mac_core_audio_tap", scope: "system",
    active: false, publicationActive: false, cleanupComplete: true, lastFailureCategory: null };
  async function acquire({ sourceId = "" } = {}) {
    let prepared;
    let stream;
    try {
      const capability = (await bridge.getMeta()).screenShareAudioCapability;
      diagnostics = { ...diagnostics, supported: capability?.supported === true, lastFailureCategory: null };
      if (!diagnostics.supported) return { ok: false, category: capability?.reason || "mac_system_audio_unavailable" };
      if (!sourceId) return { ok: false, category: "mac_system_audio_source_required" };
      // Display capture requires video:true. Reuse the exact selected source,
      // discard this temporary video, and publish only the returned audio track.
      // The ongoing visual track/publication is never replaced.
      prepared = await bridge.prepareDisplayCapture({ sourceId, withAudio: true });
      if (prepared?.ok !== true || prepared.sourceIdMatched !== true) throw new Error("mac_audio_source_prepare_failed");
      stream = await mediaDevices.getDisplayMedia({ video: true, audio: macSystemAudioConstraints() });
      stream.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track); });
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === "ended") throw new Error("mac_system_audio_track_missing");
      // Never connect this capture to speakers: that would feed it back into itself.
      let stopped = false;
      const stop = async () => {
        if (stopped) return;
        stopped = true;
        stream.getTracks().forEach(value => value.stop());
        captures.delete(capture);
        diagnostics.active = captures.size > 0;
        diagnostics.cleanupComplete = captures.size === 0;
      };
      const capture = { ok: true, track, stop, mode: "mac_core_audio_tap", scope: "system" };
      captures.add(capture);
      track.addEventListener?.("ended", () => { void stop(); }, { once: true });
      diagnostics = { ...diagnostics, active: true, cleanupComplete: false,
        sampleRate: track.getSettings?.().sampleRate || null, channels: track.getSettings?.().channelCount || null };
      return capture;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      diagnostics.lastFailureCategory = String(error?.name || "mac_system_audio_capture_failed");
      return { ok: false, category: diagnostics.lastFailureCategory };
    } finally {
      if (prepared?.handoffId) {
        try { await bridge.clearDisplayCapture?.({ handoffId: prepared.handoffId }); } catch (_) {}
      }
    }
  }
  return {
    acquire,
    getDiagnostics: () => ({ ...diagnostics, activeSessionCount: captures.size }),
    markPublicationActive: active => { diagnostics.publicationActive = active === true; },
    async stopAll() { await Promise.all([...captures].map(capture => capture.stop())); diagnostics.publicationActive = false; },
  };
}
