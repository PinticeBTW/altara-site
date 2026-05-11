import { RoomEvent, Track } from "../node_modules/livekit-client/dist/livekit-client.esm.mjs";

const SERVER_VOICE_SCREENSHARE_QUALITY_STORAGE_KEY = "altara_server_voice_screenshare_quality_v1";
const SERVER_VOICE_SCREENSHARE_FPS_STORAGE_KEY = "altara_server_voice_screenshare_fps_v1";
const SERVER_VOICE_SCREENSHARE_STREAM_PRESET_STORAGE_KEY = "altara_server_voice_screenshare_stream_preset_v1";
const SERVER_VOICE_SCREENSHARE_AUDIO_STORAGE_KEY = "altara_server_voice_screenshare_audio_v1";
const SERVER_VOICE_SCREENSHARE_DEFAULT_QUALITY_PRESET = "720p";
const SERVER_VOICE_SCREENSHARE_DEFAULT_FPS_PRESET = "30";
const SERVER_VOICE_SCREENSHARE_DEFAULT_STREAM_PRESET = "720p30";
const SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS = Object.freeze(["auto", "720p", "1080p", "2160p", "source"]);
const SERVER_VOICE_SCREENSHARE_FPS_PRESETS = Object.freeze(["30", "60"]);
const SERVER_VOICE_SCREENSHARE_STREAM_PRESETS = Object.freeze([
  "720p30",
  "720p60",
  "1080p30",
  "1080p60",
  "2160p30",
  "2160p60",
  "source",
]);

function normalizeId(value) {
  return String(value || "").trim();
}

function dedupeIds(values = []) {
  const out = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeId(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
}

function safeInvoke(callback, payload = null) {
  try {
    return callback(payload);
  } catch (_) {
    return null;
  }
}

function isScreenSharePublication(publication = null, track = null) {
  const publicationSource = String(publication?.source || "").trim().toLowerCase();
  const trackSource = String(track?.source || "").trim().toLowerCase();
  return publicationSource === Track.Source.ScreenShare || trackSource === Track.Source.ScreenShare;
}

function createVideoStreamFromTrack(track = null) {
  const mediaTrack = track?.mediaStreamTrack || track || null;
  if (!mediaTrack || String(mediaTrack.kind || "").trim().toLowerCase() !== "video") return null;
  if (String(mediaTrack.readyState || "").trim().toLowerCase() === "ended") return null;
  const stream = new MediaStream();
  try { stream.addTrack(mediaTrack); } catch (_) {}
  return {
    mediaTrack,
    stream,
  };
}

function normalizeScreenshareQualityPreset(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "auto"
    || normalized === "720p"
    || normalized === "1080p"
    || normalized === "2160p"
    || normalized === "source"
  ) return normalized;
  return "auto";
}

function normalizeScreenshareFpsPreset(value = "") {
  const normalized = String(value || "").trim();
  if (normalized === "30" || normalized === "60") return normalized;
  return "30";
}

function normalizeScreenshareStreamPreset(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (SERVER_VOICE_SCREENSHARE_STREAM_PRESETS.includes(normalized)) return normalized;
  return SERVER_VOICE_SCREENSHARE_DEFAULT_STREAM_PRESET;
}

function normalizeScreenshareAudioPreference(value = null) {
  if (value === true || value === false) return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function deriveStreamPresetFromQualityAndFps(qualityPreset = "auto", fpsPreset = "30") {
  const quality = normalizeScreenshareQualityPreset(qualityPreset);
  const fps = normalizeScreenshareFpsPreset(fpsPreset);
  if (quality === "source") return "source";
  if (quality === "auto") return fps === "60" ? "720p60" : "720p30";
  if (quality === "720p" && fps === "30") return "720p30";
  if (quality === "720p" && fps === "60") return "720p60";
  if (quality === "1080p" && fps === "30") return "1080p30";
  if (quality === "1080p" && fps === "60") return "1080p60";
  if (quality === "2160p" && fps === "30") return "2160p30";
  if (quality === "2160p" && fps === "60") return "2160p60";
  return SERVER_VOICE_SCREENSHARE_DEFAULT_STREAM_PRESET;
}

function deriveQualityAndFpsFromStreamPreset(
  streamPreset = SERVER_VOICE_SCREENSHARE_DEFAULT_STREAM_PRESET,
  fallbackFpsPreset = SERVER_VOICE_SCREENSHARE_DEFAULT_FPS_PRESET,
) {
  const preset = normalizeScreenshareStreamPreset(streamPreset);
  if (preset === "720p30") return { qualityPreset: "720p", fpsPreset: "30" };
  if (preset === "720p60") return { qualityPreset: "720p", fpsPreset: "60" };
  if (preset === "1080p30") return { qualityPreset: "1080p", fpsPreset: "30" };
  if (preset === "1080p60") return { qualityPreset: "1080p", fpsPreset: "60" };
  if (preset === "2160p30") return { qualityPreset: "2160p", fpsPreset: "30" };
  if (preset === "2160p60") return { qualityPreset: "2160p", fpsPreset: "60" };
  return {
    qualityPreset: "source",
    fpsPreset: normalizeScreenshareFpsPreset(fallbackFpsPreset),
  };
}

function readStoredValue(key = "", fallback = "") {
  const storageKey = String(key || "").trim();
  if (!storageKey) return fallback;
  try {
    const value = localStorage.getItem(storageKey);
    if (value == null) return fallback;
    return String(value || "").trim() || fallback;
  } catch (_) {
    return fallback;
  }
}

function writeStoredValue(key = "", value = "") {
  const storageKey = String(key || "").trim();
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, String(value || "").trim());
  } catch (_) {}
}

function buildCaptureVideoConstraints({
  qualityPreset = "auto",
  fpsPreset = "30",
} = {}) {
  const quality = normalizeScreenshareQualityPreset(qualityPreset);
  const fps = normalizeScreenshareFpsPreset(fpsPreset);
  const video = {};
  const fpsValue = Number.parseInt(fps, 10) || 0;
  if (fpsValue > 0) {
    video.frameRate = {
      ideal: fpsValue,
      max: fpsValue,
      ...(fpsValue >= 50 ? { min: fpsValue } : {}),
    };
  }
  if (quality === "720p") {
    video.width = { ideal: 1280, max: 1280 };
    video.height = { ideal: 720, max: 720 };
  } else if (quality === "1080p") {
    video.width = { ideal: 1920, max: 1920 };
    video.height = { ideal: 1080, max: 1080 };
  } else if (quality === "2160p") {
    video.width = { ideal: 3840, max: 3840 };
    video.height = { ideal: 2160, max: 2160 };
  }
  return video;
}

function readTrackCaptureSettings(track = null) {
  if (!track || typeof track.getSettings !== "function") return null;
  try {
    const settings = track.getSettings() || {};
    return {
      width: Number(settings.width || 0) || null,
      height: Number(settings.height || 0) || null,
      frameRate: Number(settings.frameRate || 0) || null,
      displaySurface: String(settings.displaySurface || "").trim() || null,
    };
  } catch (_) {
    return null;
  }
}

function readCaptureRequestMetrics(captureRequest = null) {
  const request = captureRequest && typeof captureRequest === "object" ? captureRequest : {};
  const directRequestedQuality = normalizeScreenshareQualityPreset(request?.qualityPreset || "");
  const derivedFromStream = deriveQualityAndFpsFromStreamPreset(
    String(request?.streamPreset || "").trim().toLowerCase(),
    String(request?.fpsPreset || "30").trim(),
  );
  const requestedQuality = normalizeScreenshareQualityPreset(
    directRequestedQuality === "auto"
      ? (derivedFromStream?.qualityPreset || directRequestedQuality)
      : directRequestedQuality,
  );
  const requestedFps = Number(
    request?.applyConstraints?.frameRate?.max
    || request?.applyConstraints?.frameRate?.ideal
    || request?.getDisplayMediaVideoConstraints?.frameRate?.max
    || request?.getDisplayMediaVideoConstraints?.frameRate?.ideal
    || Number.parseInt(String(request?.fpsPreset || "0").trim(), 10)
    || Number.parseInt(String(derivedFromStream?.fpsPreset || "0").trim(), 10)
    || 0,
  );
  const requestedWidth = Number(
    request?.applyConstraints?.width?.max
    || request?.applyConstraints?.width?.ideal
    || request?.getDisplayMediaVideoConstraints?.width?.max
    || request?.getDisplayMediaVideoConstraints?.width?.ideal
    || 0,
  );
  const requestedHeight = Number(
    request?.applyConstraints?.height?.max
    || request?.applyConstraints?.height?.ideal
    || request?.getDisplayMediaVideoConstraints?.height?.max
    || request?.getDisplayMediaVideoConstraints?.height?.ideal
    || 0,
  );
  return {
    requestedQuality: requestedQuality || null,
    requestedFps: Number.isFinite(requestedFps) && requestedFps > 0
      ? Math.round(requestedFps)
      : null,
    requestedWidth: Number.isFinite(requestedWidth) && requestedWidth > 0
      ? Math.round(requestedWidth)
      : null,
    requestedHeight: Number.isFinite(requestedHeight) && requestedHeight > 0
      ? Math.round(requestedHeight)
      : null,
  };
}

function readTrackOutputMetrics(track = null) {
  const settings = readTrackCaptureSettings(track);
  return {
    actualWidth: Number(settings?.width || 0) || null,
    actualHeight: Number(settings?.height || 0) || null,
    actualFps: Number(settings?.frameRate || 0) || null,
  };
}

function shouldWarnScreenshareFpsClamp(requestedFps = null, actualFps = null) {
  const wanted = Number(requestedFps || 0);
  const actual = Number(actualFps || 0);
  if (!Number.isFinite(wanted) || wanted <= 0) return false;
  if (!Number.isFinite(actual) || actual <= 0) return false;
  if (wanted < 50) return false;
  return actual <= Math.max(35, wanted - 12);
}

function deriveScreensharePublishMaxBitrate({
  requestedQuality = "",
  requestedWidth = 0,
  requestedHeight = 0,
  requestedFps = 30,
} = {}) {
  const fps = Number(requestedFps || 0) >= 50 ? 60 : 30;
  const quality = normalizeScreenshareQualityPreset(requestedQuality || "");
  if (quality === "2160p" || requestedWidth >= 3200 || requestedHeight >= 1800) {
    return fps >= 60 ? 20_000_000 : 12_000_000;
  }
  if (quality === "720p" || (requestedWidth > 0 && requestedWidth <= 1280 && requestedHeight <= 720)) {
    return fps >= 60 ? 4_000_000 : 2_500_000;
  }
  if (quality === "source") {
    return fps >= 60 ? 16_000_000 : 8_000_000;
  }
  return fps >= 60 ? 8_000_000 : 4_000_000;
}

function buildScreensharePublishOptions(captureRequest = null) {
  const metrics = readCaptureRequestMetrics(captureRequest);
  const maxFramerate = Number(metrics.requestedFps || 30) > 0
    ? Math.max(15, Math.round(Number(metrics.requestedFps || 30)))
    : 30;
  const maxBitrate = deriveScreensharePublishMaxBitrate({
    requestedQuality: metrics.requestedQuality || "",
    requestedWidth: Number(metrics.requestedWidth || 0) || 0,
    requestedHeight: Number(metrics.requestedHeight || 0) || 0,
    requestedFps: maxFramerate,
  });
  const simulcast = maxFramerate < 60;
  return {
    publishOptions: {
      source: Track.Source.ScreenShare,
      stopOnMute: false,
      simulcast,
      videoEncoding: {
        maxFramerate,
        maxBitrate,
      },
    },
    diagnostics: {
      ...metrics,
      maxFramerate,
      maxBitrate,
      simulcast,
    },
  };
}

function readPublishedSenderEncoding(publication = null) {
  const sender = publication?.track?.sender || null;
  let params = null;
  try {
    params = sender?.getParameters?.() || null;
  } catch (_) {
    params = null;
  }
  const encoding = Array.isArray(params?.encodings) && params.encodings.length
    ? (params.encodings[0] || null)
    : null;
  return {
    maxFramerate: Number(encoding?.maxFramerate || 0) || null,
    maxBitrate: Number(encoding?.maxBitrate || 0) || null,
    scaleResolutionDownBy: Number(encoding?.scaleResolutionDownBy || 0) || null,
    degradationPreference: String(params?.degradationPreference || "").trim() || null,
  };
}

async function applyScreensharePublishEncodingToSender(publication = null, publishOptions = null) {
  const sender = publication?.track?.sender || null;
  if (!sender || typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") {
    return {
      applied: false,
      reason: "sender_unavailable",
    };
  }
  const targetMaxFramerate = Number(publishOptions?.videoEncoding?.maxFramerate || 0) || null;
  const targetMaxBitrate = Number(publishOptions?.videoEncoding?.maxBitrate || 0) || null;
  if (!targetMaxFramerate && !targetMaxBitrate) {
    return {
      applied: false,
      reason: "no_target_encoding",
    };
  }
  const params = sender.getParameters?.() || {};
  if (!params.encodings || !params.encodings.length) params.encodings = [{}];
  params.encodings = params.encodings.map((encoding = {}) => {
    const next = {
      ...encoding,
    };
    if (targetMaxFramerate) next.maxFramerate = targetMaxFramerate;
    if (targetMaxBitrate) next.maxBitrate = targetMaxBitrate;
    if (
      targetMaxFramerate >= 60
      && Number.isFinite(Number(next.scaleResolutionDownBy))
      && Number(next.scaleResolutionDownBy) > 1
    ) {
      delete next.scaleResolutionDownBy;
    }
    return next;
  });
  try {
    await sender.setParameters(params);
    return {
      applied: true,
      reason: null,
    };
  } catch (error) {
    return {
      applied: false,
      reason: String(error?.message || error || "set_parameters_failed").trim() || "set_parameters_failed",
    };
  }
}

function normalizeScreenshareSourceKind(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "screen" || normalized === "window" || normalized === "tab" || normalized === "browser") {
    return normalized;
  }
  return "";
}

function isScreenshareCaptureCancelledError(error = null) {
  if (!error) return false;
  if (error?.__sharePickerCancelled) return true;
  const name = String(error?.name || "").trim().toLowerCase();
  if (name === "aborterror" || name === "notallowederror") return true;
  const message = String(error?.message || error || "").trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes("cancel")
    || message.includes("dismiss")
    || message.includes("aborted")
    || message.includes("not allowed")
    || message.includes("permission denied")
  );
}

async function captureDesktopSourceStream({
  sourceId = "",
  sourceKind = "",
  sourceName = "",
  captureRequest = null,
  withAudio = false,
  useFallbackConstraints = false,
} = {}) {
  const normalizedSourceId = normalizeId(sourceId || "");
  if (!normalizedSourceId) {
    throw new Error("screenshare_source_id_missing");
  }
  const normalizedSourceKind = normalizeScreenshareSourceKind(sourceKind || "");
  const request = captureRequest && typeof captureRequest === "object"
    ? captureRequest
    : {};
  const desiredWidth = Number(
    request?.applyConstraints?.width?.max
    || request?.applyConstraints?.width?.ideal
    || 0,
  );
  const desiredHeight = Number(
    request?.applyConstraints?.height?.max
    || request?.applyConstraints?.height?.ideal
    || 0,
  );
  const desiredFps = Number(
    request?.applyConstraints?.frameRate?.max
    || request?.applyConstraints?.frameRate?.ideal
    || 0,
  );
  const mandatoryVideo = {
    chromeMediaSource: "desktop",
    chromeMediaSourceId: normalizedSourceId,
  };
  if (!useFallbackConstraints) {
    if (Number.isFinite(desiredWidth) && desiredWidth > 0) mandatoryVideo.maxWidth = Math.round(desiredWidth);
    if (Number.isFinite(desiredHeight) && desiredHeight > 0) mandatoryVideo.maxHeight = Math.round(desiredHeight);
    if (Number.isFinite(desiredFps) && desiredFps > 0) mandatoryVideo.maxFrameRate = Math.round(desiredFps);
    if (Number.isFinite(desiredFps) && desiredFps >= 50) mandatoryVideo.minFrameRate = Math.round(desiredFps);
  }
  const cursorMode = normalizedSourceKind === "window" ? "motion" : "always";
  const constraints = {
    video: {
      mandatory: mandatoryVideo,
      optional: cursorMode ? [{ cursor: cursorMode }] : [],
      ...(Number.isFinite(desiredWidth) && desiredWidth > 0
        ? { width: { ideal: Math.round(desiredWidth), max: Math.round(desiredWidth) } }
        : {}),
      ...(Number.isFinite(desiredHeight) && desiredHeight > 0
        ? { height: { ideal: Math.round(desiredHeight), max: Math.round(desiredHeight) } }
        : {}),
      ...(Number.isFinite(desiredFps) && desiredFps > 0
        ? {
          frameRate: {
            ideal: Math.round(desiredFps),
            max: Math.round(desiredFps),
            ...(desiredFps >= 50 ? { min: Math.round(desiredFps) } : {}),
          },
        }
        : {}),
    },
    audio: false,
  };
  if (withAudio) {
    constraints.audio = {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: normalizedSourceId,
      },
    };
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream?.getVideoTracks?.()?.[0] || null;
  if (!track) {
    try {
      stream?.getTracks?.()?.forEach?.((mediaTrack) => mediaTrack.stop?.());
    } catch (_) {}
    throw new Error("screenshare_capture_track_missing");
  }
  if (!useFallbackConstraints && typeof track.applyConstraints === "function") {
    try {
      await track.applyConstraints({
        ...(request?.applyConstraints || {}),
        cursor: cursorMode,
      });
    } catch (_) {}
  }
  const sourceMeta = {
    sourceId: normalizedSourceId,
    sourceKind: normalizedSourceKind || null,
    sourceName: String(sourceName || "").trim() || null,
    sourceType: "desktop_source",
  };
  const desktopConstraintMeta = {
    useFallbackConstraints: !!useFallbackConstraints,
    mandatoryMaxWidth: Number(mandatoryVideo.maxWidth || 0) || null,
    mandatoryMaxHeight: Number(mandatoryVideo.maxHeight || 0) || null,
    mandatoryMaxFrameRate: Number(mandatoryVideo.maxFrameRate || 0) || null,
    mandatoryMinFrameRate: Number(mandatoryVideo.minFrameRate || 0) || null,
    requestedWidth: Number.isFinite(desiredWidth) && desiredWidth > 0 ? Math.round(desiredWidth) : null,
    requestedHeight: Number.isFinite(desiredHeight) && desiredHeight > 0 ? Math.round(desiredHeight) : null,
    requestedFps: Number.isFinite(desiredFps) && desiredFps > 0 ? Math.round(desiredFps) : null,
  };
  try {
    Object.defineProperty(stream, "__serverVoiceScreenshareSource", {
      value: sourceMeta,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch (_) {
    try { stream.__serverVoiceScreenshareSource = sourceMeta; } catch (_) {}
  }
  try {
    Object.defineProperty(stream, "__serverVoiceDesktopCaptureConstraints", {
      value: desktopConstraintMeta,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch (_) {
    try { stream.__serverVoiceDesktopCaptureConstraints = desktopConstraintMeta; } catch (_) {}
  }
  return stream;
}

export function createServerVoiceScreenshareLayer({
  conversationId = "",
  localUserId = "",
  logger = () => {},
  onStateChanged = () => {},
  openSourcePicker = null,
} = {}) {
  const convId = normalizeId(conversationId || "");
  const meId = normalizeId(localUserId || "");

  let room = null;
  let roomBound = false;
  const shareRecordsByKey = new Map();
  let localShareKey = "";
  let activeShareKey = "";
  let lastRenderSignature = "";
  let localCaptureStream = null;
  let localCaptureTrack = null;
  let localCaptureAudioTrack = null;
  let localCaptureAudioTrackSid = "";
  let localTrackEndedHandler = null;
  let qualityPreset = normalizeScreenshareQualityPreset(
    readStoredValue(SERVER_VOICE_SCREENSHARE_QUALITY_STORAGE_KEY, SERVER_VOICE_SCREENSHARE_DEFAULT_QUALITY_PRESET),
  );
  let fpsPreset = normalizeScreenshareFpsPreset(
    readStoredValue(SERVER_VOICE_SCREENSHARE_FPS_STORAGE_KEY, SERVER_VOICE_SCREENSHARE_DEFAULT_FPS_PRESET),
  );
  let streamPreset = normalizeScreenshareStreamPreset(
    readStoredValue(
      SERVER_VOICE_SCREENSHARE_STREAM_PRESET_STORAGE_KEY,
      deriveStreamPresetFromQualityAndFps(qualityPreset, fpsPreset),
    ),
  );
  let shareAudioEnabled = normalizeScreenshareAudioPreference(
    readStoredValue(SERVER_VOICE_SCREENSHARE_AUDIO_STORAGE_KEY, "0"),
  );
  let preferredSourceSelection = null;
  {
    const derived = deriveQualityAndFpsFromStreamPreset(streamPreset, fpsPreset);
    qualityPreset = normalizeScreenshareQualityPreset(derived.qualityPreset || qualityPreset);
    fpsPreset = normalizeScreenshareFpsPreset(derived.fpsPreset || fpsPreset);
  }
  let uiRefs = null;

  function emit(event, details = {}) {
    safeInvoke(logger, {
      event: String(event || "").trim() || "screenshare.event",
      conversationId: convId || null,
      localUserId: meId || null,
      ...((details && typeof details === "object" && !Array.isArray(details)) ? details : { value: details ?? null }),
    });
  }

  emit("screenshare.preset_loaded", {
    quality: qualityPreset || null,
    fps: fpsPreset || null,
    streamPreset: streamPreset || null,
    source: "storage",
    reason: "layer_init",
    callerFunction: "createServerVoiceScreenshareLayer",
    shareAudioEnabled: !!shareAudioEnabled,
  });

  function getCapturePreferences() {
    return {
      streamPreset,
      streamPresetOptions: [...SERVER_VOICE_SCREENSHARE_STREAM_PRESETS],
      qualityPreset,
      fpsPreset,
      qualityPresetOptions: [...SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS],
      fpsPresetOptions: [...SERVER_VOICE_SCREENSHARE_FPS_PRESETS],
      shareAudioEnabled: !!shareAudioEnabled,
      preferredSourceId: normalizeId(preferredSourceSelection?.sourceId || "") || null,
      preferredSourceKind: normalizeScreenshareSourceKind(preferredSourceSelection?.sourceKind || "") || null,
      preferredSourceName: String(preferredSourceSelection?.sourceName || "").trim() || null,
    };
  }

  function buildCurrentCaptureRequest() {
    const normalizedStreamPreset = normalizeScreenshareStreamPreset(streamPreset);
    const derived = deriveQualityAndFpsFromStreamPreset(normalizedStreamPreset, fpsPreset);
    const normalizedQuality = normalizeScreenshareQualityPreset(derived.qualityPreset || qualityPreset);
    const normalizedFps = normalizeScreenshareFpsPreset(derived.fpsPreset || fpsPreset);
    const videoConstraints = buildCaptureVideoConstraints({
      qualityPreset: normalizedQuality,
      fpsPreset: normalizedFps,
    });
    return {
      streamPreset: normalizedStreamPreset,
      qualityPreset: normalizedQuality,
      fpsPreset: normalizedFps,
      withAudio: !!shareAudioEnabled,
      getDisplayMediaVideoConstraints: {
        ...videoConstraints,
      },
      applyConstraints: {
        ...videoConstraints,
      },
    };
  }

  async function applyLocalCaptureConstraintsLive({
    triggerReason = "preset_updated",
    callerFunction = "applyLocalCaptureConstraintsLive",
  } = {}) {
    const track = localCaptureTrack || null;
    if (!track || String(track.readyState || "").trim().toLowerCase() === "ended") {
      return {
        applied: false,
        reason: "no_local_capture_track",
      };
    }
    const request = buildCurrentCaptureRequest();
    const requestMetrics = readCaptureRequestMetrics(request);
    let applyError = null;
    try {
      if (typeof track.applyConstraints === "function") {
        await track.applyConstraints(request.applyConstraints || {});
      }
    } catch (error) {
      applyError = error;
    }
    const settings = readTrackCaptureSettings(track);
    const outputMetrics = readTrackOutputMetrics(track);
    const localRecord = localShareKey ? (shareRecordsByKey.get(localShareKey) || null) : null;
    if (localRecord) {
      localRecord.captureRequest = request;
      localRecord.captureSettings = settings;
      localRecord.updatedAt = Date.now();
      shareRecordsByKey.set(localRecord.key, localRecord);
    }
    emit("screenshare.capture_constraints_applied", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "applyLocalCaptureConstraintsLive",
      applied: !applyError,
      streamPreset: request.streamPreset || null,
      qualityPreset: request.qualityPreset || null,
      fpsPreset: request.fpsPreset || null,
      requestedQuality: requestMetrics.requestedQuality || null,
      requestedFps: requestMetrics.requestedFps,
      withAudio: !!request.withAudio,
      requestedWidth: requestMetrics.requestedWidth,
      requestedHeight: requestMetrics.requestedHeight,
      actualWidth: outputMetrics.actualWidth,
      actualHeight: outputMetrics.actualHeight,
      actualFps: outputMetrics.actualFps,
      fallbackReason: applyError ? String(applyError?.message || applyError || "apply_constraints_failed") : null,
    });
    if (shouldWarnScreenshareFpsClamp(requestMetrics.requestedFps, outputMetrics.actualFps)) {
      emit("screenshare.fps_clamped", {
        triggerReason: String(triggerReason || "").trim() || "preset_updated",
        callerFunction: String(callerFunction || "").trim() || "applyLocalCaptureConstraintsLive",
        stage: "apply_constraints_live",
        requestedQuality: requestMetrics.requestedQuality || null,
        requestedFps: requestMetrics.requestedFps,
        actualFps: outputMetrics.actualFps,
        streamPreset: request.streamPreset || null,
        qualityPreset: request.qualityPreset || null,
        fpsPreset: request.fpsPreset || null,
      });
    }
    emitStateChanged(triggerReason, callerFunction);
    return {
      applied: !applyError,
      error: applyError,
      request,
      settings,
    };
  }

  function commitCapturePreference({
    nextQualityPreset = qualityPreset,
    nextFpsPreset = fpsPreset,
    nextStreamPreset = streamPreset,
    triggerReason = "preset_updated",
    callerFunction = "commitCapturePreference",
  } = {}) {
    const normalizedStreamPreset = normalizeScreenshareStreamPreset(
      nextStreamPreset || deriveStreamPresetFromQualityAndFps(nextQualityPreset, nextFpsPreset),
    );
    const derived = deriveQualityAndFpsFromStreamPreset(
      normalizedStreamPreset,
      nextFpsPreset || fpsPreset,
    );
    const normalizedQuality = normalizeScreenshareQualityPreset(derived.qualityPreset || nextQualityPreset);
    const normalizedFps = normalizeScreenshareFpsPreset(derived.fpsPreset || nextFpsPreset);
    streamPreset = normalizedStreamPreset;
    qualityPreset = normalizedQuality;
    fpsPreset = normalizedFps;
    writeStoredValue(SERVER_VOICE_SCREENSHARE_STREAM_PRESET_STORAGE_KEY, normalizedStreamPreset);
    writeStoredValue(SERVER_VOICE_SCREENSHARE_QUALITY_STORAGE_KEY, normalizedQuality);
    writeStoredValue(SERVER_VOICE_SCREENSHARE_FPS_STORAGE_KEY, normalizedFps);
    emit("screenshare.preset_selected", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "commitCapturePreference",
      streamPreset: normalizedStreamPreset,
      qualityPreset: normalizedQuality,
      fpsPreset: normalizedFps,
    });
    emit("screenshare.preset_saved", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "commitCapturePreference",
      streamPreset: normalizedStreamPreset,
      quality: normalizedQuality,
      fps: normalizedFps,
      source: "screenshare_layer",
      reason: String(triggerReason || "").trim() || "preset_updated",
      shareAudioEnabled: !!shareAudioEnabled,
    });
    emit("screenshare.capture_preset_updated", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "commitCapturePreference",
      streamPreset: normalizedStreamPreset,
      qualityPreset: normalizedQuality,
      fpsPreset: normalizedFps,
    });
    emitStateChanged(triggerReason, callerFunction);
    return {
      streamPreset: normalizedStreamPreset,
      qualityPreset: normalizedQuality,
      fpsPreset: normalizedFps,
    };
  }

  function commitShareAudioPreference(nextShareAudioEnabled, {
    triggerReason = "share_audio_updated",
    callerFunction = "commitShareAudioPreference",
  } = {}) {
    const nextEnabled = normalizeScreenshareAudioPreference(nextShareAudioEnabled);
    shareAudioEnabled = !!nextEnabled;
    writeStoredValue(SERVER_VOICE_SCREENSHARE_AUDIO_STORAGE_KEY, shareAudioEnabled ? "1" : "0");
    emit("screenshare.capture_preset_updated", {
      triggerReason: String(triggerReason || "").trim() || "share_audio_updated",
      callerFunction: String(callerFunction || "").trim() || "commitShareAudioPreference",
      streamPreset: streamPreset || null,
      qualityPreset: qualityPreset || null,
      fpsPreset: fpsPreset || null,
      shareAudioEnabled: !!shareAudioEnabled,
    });
    emitStateChanged(triggerReason, callerFunction);
    return {
      streamPreset,
      qualityPreset,
      fpsPreset,
      shareAudioEnabled: !!shareAudioEnabled,
    };
  }

  function readActiveShareRecord() {
    if (!activeShareKey) return null;
    return shareRecordsByKey.get(activeShareKey) || null;
  }

  function buildState() {
    const records = Array.from(shareRecordsByKey.values());
    const shareStates = records
      .map((record) => (record
        ? {
          key: record.key,
          ownerUserId: record.ownerUserId || "",
          ownerDisplayName: record.ownerDisplayName || "",
          isLocal: !!record.isLocal,
          track: record.track || null,
          trackId: record.trackId || "",
          trackSid: record.trackSid || "",
          stream: record.stream || null,
          captureRequest: record.captureRequest || null,
          captureSettings: record.captureSettings || null,
          updatedAt: Number(record.updatedAt || 0),
        }
        : null))
      .filter((record) => !!(record && record.ownerUserId));
    const active = readActiveShareRecord();
    const activeState = active
      ? (shareStates.find((record) => record.key === active.key) || {
        key: active.key,
        ownerUserId: active.ownerUserId || "",
        ownerDisplayName: active.ownerDisplayName || "",
        isLocal: !!active.isLocal,
        track: active.track || null,
        trackId: active.trackId || "",
        trackSid: active.trackSid || "",
        stream: active.stream || null,
        captureRequest: active.captureRequest || null,
        captureSettings: active.captureSettings || null,
        updatedAt: Number(active.updatedAt || 0),
      })
      : null;
    const remoteParticipantIds = dedupeIds(
      shareStates
        .filter((record) => !record?.isLocal)
        .map((record) => record?.ownerUserId || ""),
    );
    return {
      conversationId: convId || "",
      localUserId: meId || "",
      localShareActive: !!(localShareKey && shareRecordsByKey.has(localShareKey)),
      capturePreferences: getCapturePreferences(),
      remoteShareParticipantIds: remoteParticipantIds,
      shareParticipantIds: dedupeIds(shareStates.map((record) => record?.ownerUserId || "")),
      shares: shareStates,
      activeShare: activeState,
    };
  }

  function emitStateChanged(triggerReason = "state_changed", callerFunction = "screenshare_layer") {
    safeInvoke(onStateChanged, {
      ...buildState(),
      triggerReason: String(triggerReason || "").trim() || "state_changed",
      callerFunction: String(callerFunction || "").trim() || "screenshare_layer",
    });
  }

  function selectActiveShare(key = "", {
    triggerReason = "active_share_updated",
    callerFunction = "selectActiveShare",
    force = false,
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey || !shareRecordsByKey.has(normalizedKey)) {
      if (activeShareKey) {
        activeShareKey = "";
        emitStateChanged(triggerReason, callerFunction);
      }
      return;
    }
    if (!force && activeShareKey === normalizedKey) return;
    activeShareKey = normalizedKey;
    emitStateChanged(triggerReason, callerFunction);
  }

  function pickFallbackActiveShareKey() {
    const records = Array.from(shareRecordsByKey.values());
    if (!records.length) return "";
    const ordered = records
      .slice()
      .sort((left, right) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0));
    return normalizeId(ordered[0]?.key || "");
  }

  function upsertShareRecord({
    key = "",
    ownerUserId = "",
    ownerDisplayName = "",
    isLocal = false,
    track = null,
    trackSid = "",
    stream = null,
    captureRequest = null,
    captureSettings = null,
  } = {}) {
    const normalizedKey = normalizeId(key);
    const uid = normalizeId(ownerUserId);
    const mediaTrack = track?.mediaStreamTrack || track || null;
    const trackId = normalizeId(mediaTrack?.id || "");
    if (!normalizedKey || !uid || !mediaTrack || !trackId) return null;
    const now = Date.now();
    const record = {
      key: normalizedKey,
      ownerUserId: uid,
      ownerDisplayName: String(ownerDisplayName || "").trim(),
      isLocal: !!isLocal,
      track: mediaTrack,
      trackSid: normalizeId(trackSid || ""),
      trackId,
      stream: stream || createVideoStreamFromTrack(mediaTrack)?.stream || null,
      captureRequest: captureRequest || null,
      captureSettings: captureSettings || null,
      updatedAt: now,
    };
    shareRecordsByKey.set(normalizedKey, record);
    if (record.isLocal) localShareKey = normalizedKey;
    selectActiveShare(normalizedKey, {
      triggerReason: "active_share_added",
      callerFunction: "upsertShareRecord",
      force: true,
    });
    return record;
  }

  function removeShareRecordByKey(key = "", {
    triggerReason = "share_removed",
    callerFunction = "removeShareRecordByKey",
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey) return false;
    const existing = shareRecordsByKey.get(normalizedKey) || null;
    if (!existing) return false;
    shareRecordsByKey.delete(normalizedKey);
    if (localShareKey === normalizedKey) localShareKey = "";
    if (activeShareKey === normalizedKey) {
      const fallbackKey = pickFallbackActiveShareKey();
      activeShareKey = "";
      if (fallbackKey) {
        selectActiveShare(fallbackKey, {
          triggerReason,
          callerFunction,
          force: true,
        });
        return true;
      }
    }
    emitStateChanged(triggerReason, callerFunction);
    return true;
  }

  function removeRemoteShareRecordByTrack({
    participantIdentity = "",
    track = null,
    publication = null,
    triggerReason = "remote_track_removed",
  } = {}) {
    const uid = normalizeId(participantIdentity || "");
    const mediaTrack = track?.mediaStreamTrack || track || null;
    const trackId = normalizeId(mediaTrack?.id || "");
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    const candidateKeys = Array.from(shareRecordsByKey.values())
      .filter((record) => {
        if (!record || record.isLocal) return false;
        if (uid && normalizeId(record.ownerUserId || "") !== uid) return false;
        if (trackSid && normalizeId(record.trackSid || "") === trackSid) return true;
        if (trackId && normalizeId(record.trackId || "") === trackId) return true;
        return false;
      })
      .map((record) => record.key);
    if (!candidateKeys.length) return false;
    candidateKeys.forEach((key) => {
      removeShareRecordByKey(key, {
        triggerReason,
        callerFunction: "removeRemoteShareRecordByTrack",
      });
    });
    return true;
  }

  function removeRemoteShareRecordsByParticipant(participantIdentity = "", {
    triggerReason = "participant_disconnected",
  } = {}) {
    const uid = normalizeId(participantIdentity || "");
    if (!uid) return false;
    const candidateKeys = Array.from(shareRecordsByKey.values())
      .filter((record) => !record?.isLocal && normalizeId(record?.ownerUserId || "") === uid)
      .map((record) => record.key);
    if (!candidateKeys.length) return false;
    candidateKeys.forEach((key) => {
      const record = shareRecordsByKey.get(key) || null;
      emit("screenshare.remote_track_removed", {
        triggerReason,
        participantId: uid || null,
        trackId: record?.trackId || null,
        trackSid: record?.trackSid || null,
      });
      removeShareRecordByKey(key, {
        triggerReason,
        callerFunction: "removeRemoteShareRecordsByParticipant",
      });
    });
    return true;
  }

  function clearRemoteShareRecords({
    triggerReason = "remote_snapshot_cleared",
    callerFunction = "clearRemoteShareRecords",
  } = {}) {
    const candidateKeys = Array.from(shareRecordsByKey.values())
      .filter((record) => !record?.isLocal)
      .map((record) => record.key);
    if (!candidateKeys.length) return;
    candidateKeys.forEach((key) => {
      removeShareRecordByKey(key, {
        triggerReason,
        callerFunction,
      });
    });
  }

  function normalizeSourceSelection(selection = null) {
    if (!selection || typeof selection !== "object") return null;
    const sourceId = normalizeId(selection?.sourceId || "");
    if (!sourceId) return null;
    return {
      sourceId,
      sourceKind: normalizeScreenshareSourceKind(selection?.sourceKind || ""),
      sourceName: String(selection?.sourceName || "").trim() || "",
      sourceType: normalizeId(selection?.sourceType || "") || "desktop_source",
      selectedAt: Date.now(),
    };
  }

  function setPreferredSourceSelection(selection = null, {
    triggerReason = "source_selected",
    callerFunction = "setPreferredSourceSelection",
  } = {}) {
    const normalizedSelection = normalizeSourceSelection(selection);
    preferredSourceSelection = normalizedSelection;
    emitStateChanged(triggerReason, callerFunction);
    return preferredSourceSelection;
  }

  async function selectSource({
    triggerReason = "source_select",
    callerFunction = "selectSource",
  } = {}) {
    const captureRequest = buildCurrentCaptureRequest();
    if (typeof openSourcePicker !== "function") return null;
    emit("screenshare.source_picker_opened", {
      triggerReason: String(triggerReason || "").trim() || "source_select",
      callerFunction: String(callerFunction || "").trim() || "selectSource",
      streamPreset: captureRequest?.streamPreset || null,
      qualityPreset: captureRequest?.qualityPreset || null,
      fpsPreset: captureRequest?.fpsPreset || null,
      withAudio: !!captureRequest?.withAudio,
    });
    let selection = null;
    try {
      selection = await openSourcePicker({
        triggerReason: String(triggerReason || "").trim() || "source_select",
        callerFunction: String(callerFunction || "").trim() || "selectSource",
        captureRequest,
        capturePreferences: getCapturePreferences(),
        conversationId: convId || "",
        localUserId: meId || "",
        sourceOnly: true,
      });
    } catch (error) {
      if (isScreenshareCaptureCancelledError(error)) {
        emit("screenshare.source_selection_cancelled", {
          triggerReason: String(triggerReason || "").trim() || "source_select",
          callerFunction: String(callerFunction || "").trim() || "selectSource",
          stage: "source_picker",
          sourceType: "desktop_source",
          sourceId: null,
          sourceKind: null,
          sourceName: null,
        });
        return null;
      }
      emit("screenshare.capture_start_failed", {
        triggerReason: String(triggerReason || "").trim() || "source_select",
        callerFunction: String(callerFunction || "").trim() || "selectSource",
        stage: "source_picker",
        sourceType: "desktop_source",
        sourceId: null,
        sourceKind: null,
        sourceName: null,
        errorName: String(error?.name || "").trim() || null,
        errorMessage: String(error?.message || error || "source_picker_failed").trim() || "source_picker_failed",
      });
      throw error;
    }
    const normalizedSelection = normalizeSourceSelection(selection);
    if (!normalizedSelection) {
      emit("screenshare.source_selection_cancelled", {
        triggerReason: String(triggerReason || "").trim() || "source_select",
        callerFunction: String(callerFunction || "").trim() || "selectSource",
        stage: "source_picker",
        sourceType: "desktop_source",
        sourceId: null,
        sourceKind: null,
        sourceName: null,
      });
      return null;
    }
    preferredSourceSelection = normalizedSelection;
    emit("screenshare.source_selected", {
      triggerReason: String(triggerReason || "").trim() || "source_select",
      callerFunction: String(callerFunction || "").trim() || "selectSource",
      sourceType: normalizedSelection.sourceType || "desktop_source",
      sourceId: normalizedSelection.sourceId || null,
      sourceKind: normalizedSelection.sourceKind || null,
      sourceName: normalizedSelection.sourceName || null,
    });
    emitStateChanged(triggerReason, callerFunction);
    return {
      ...normalizedSelection,
    };
  }

  function releaseLocalCaptureResources() {
    if (localCaptureTrack && localTrackEndedHandler) {
      try { localCaptureTrack.removeEventListener("ended", localTrackEndedHandler); } catch (_) {}
    }
    localTrackEndedHandler = null;
    if (localCaptureStream) {
      try {
        localCaptureStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (_) {}
        });
      } catch (_) {}
    } else if (localCaptureTrack) {
      try { localCaptureTrack.stop(); } catch (_) {}
    }
    localCaptureStream = null;
    localCaptureTrack = null;
    localCaptureAudioTrack = null;
    localCaptureAudioTrackSid = "";
  }

  async function startShare({
    triggerReason = "manual_toggle",
  } = {}) {
    const normalizedTriggerReason = String(triggerReason || "").trim() || "manual_toggle";
    emit("screenshare.start_requested", {
      triggerReason: normalizedTriggerReason,
      hasRoom: !!room,
      roomConnected: !!(room && String(room.state || "").trim().toLowerCase() === "connected"),
      localShareActive: !!(localShareKey && shareRecordsByKey.has(localShareKey)),
    });
    if (!room || !room.localParticipant) {
      emit("screenshare.capture_start_failed", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        stage: "room_unavailable",
        sourceType: null,
        sourceId: null,
        sourceKind: null,
        sourceName: null,
        errorName: "screenshare_room_unavailable",
        errorMessage: "screenshare_room_unavailable",
      });
      throw new Error("screenshare_room_unavailable");
    }
    if (localShareKey && shareRecordsByKey.has(localShareKey)) {
      selectActiveShare(localShareKey, {
        triggerReason: "local_share_already_active",
        callerFunction: "startShare",
        force: true,
      });
      return readActiveShareRecord();
    }

    const captureRequest = buildCurrentCaptureRequest();
    emit("screenshare.preset_used_for_capture", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      quality: captureRequest?.qualityPreset || null,
      fps: captureRequest?.fpsPreset || null,
      streamPreset: captureRequest?.streamPreset || null,
      source: "capture_request",
      reason: normalizedTriggerReason,
      withAudio: !!captureRequest?.withAudio,
    });
    let sourceSelection = null;
    let selectedSourceId = "";
    let selectedSourceKind = "";
    let selectedSourceName = "";
    let selectedSourceType = "display_media";
    const preferredSelection = normalizeSourceSelection(preferredSourceSelection);
    if (preferredSelection?.sourceId) {
      sourceSelection = {
        ...preferredSelection,
      };
      selectedSourceId = preferredSelection.sourceId;
      selectedSourceKind = preferredSelection.sourceKind || "";
      selectedSourceName = preferredSelection.sourceName || "";
      selectedSourceType = preferredSelection.sourceType || "desktop_source";
      emit("screenshare.source_selected", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        sourceType: selectedSourceType || null,
        sourceId: selectedSourceId || null,
        sourceKind: selectedSourceKind || null,
        sourceName: selectedSourceName || null,
        sourceSelectionMode: "preferred_cached",
      });
    }

    if (!sourceSelection && typeof openSourcePicker === "function") {
      emit("screenshare.source_picker_opened", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        streamPreset: captureRequest?.streamPreset || null,
        qualityPreset: captureRequest?.qualityPreset || null,
        fpsPreset: captureRequest?.fpsPreset || null,
        withAudio: !!captureRequest?.withAudio,
      });
      try {
        sourceSelection = await openSourcePicker({
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          captureRequest,
          capturePreferences: getCapturePreferences(),
          conversationId: convId || "",
          localUserId: meId || "",
        });
      } catch (error) {
        if (isScreenshareCaptureCancelledError(error)) {
          emit("screenshare.source_selection_cancelled", {
            triggerReason: normalizedTriggerReason,
            callerFunction: "startShare",
            stage: "source_picker",
            sourceType: selectedSourceType || "display_media",
            sourceId: selectedSourceId || null,
            sourceKind: selectedSourceKind || null,
            sourceName: selectedSourceName || null,
          });
          return null;
        }
        emit("screenshare.capture_start_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          stage: "source_picker",
          sourceType: selectedSourceType || "display_media",
          sourceId: selectedSourceId || null,
          sourceKind: selectedSourceKind || null,
          sourceName: selectedSourceName || null,
          errorName: String(error?.name || "").trim() || null,
          errorMessage: String(error?.message || error || "source_picker_failed").trim() || "source_picker_failed",
        });
        throw error;
      }
      const selectionCancelled = !!(
        sourceSelection == null
        || sourceSelection === false
        || sourceSelection?.cancelled === true
      );
      if (selectionCancelled) {
        emit("screenshare.source_selection_cancelled", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          stage: "source_picker",
          sourceType: selectedSourceType || "display_media",
          sourceId: selectedSourceId || null,
          sourceKind: selectedSourceKind || null,
          sourceName: selectedSourceName || null,
        });
        return null;
      }
      selectedSourceId = normalizeId(sourceSelection?.sourceId || "");
      selectedSourceKind = normalizeScreenshareSourceKind(sourceSelection?.sourceKind || "");
      selectedSourceName = String(sourceSelection?.sourceName || "").trim();
      selectedSourceType = normalizeId(sourceSelection?.sourceType || "")
        || (selectedSourceId ? "desktop_source" : "display_media");
      emit("screenshare.source_selected", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        sourceType: selectedSourceType || null,
        sourceId: selectedSourceId || null,
        sourceKind: selectedSourceKind || null,
        sourceName: selectedSourceName || null,
        sourceSelectionMode: "picker",
      });
      if (selectedSourceId) {
        preferredSourceSelection = normalizeSourceSelection({
          sourceId: selectedSourceId,
          sourceKind: selectedSourceKind,
          sourceName: selectedSourceName,
          sourceType: selectedSourceType,
        });
      }
    }

    let captureFallbackReason = null;
    let captureStream = null;
    const selectedStream = sourceSelection?.stream instanceof MediaStream
      ? sourceSelection.stream
      : null;
    try {
      if (selectedStream) {
        captureStream = selectedStream;
      } else if (selectedSourceId) {
        selectedSourceType = "desktop_source";
        captureStream = await captureDesktopSourceStream({
          sourceId: selectedSourceId,
          sourceKind: selectedSourceKind,
          sourceName: selectedSourceName,
          captureRequest,
          withAudio: !!captureRequest?.withAudio,
          useFallbackConstraints: false,
        });
      } else {
        captureStream = await navigator.mediaDevices.getDisplayMedia({
          video: captureRequest.getDisplayMediaVideoConstraints || true,
          audio: !!captureRequest?.withAudio,
        });
      }
    } catch (error) {
      if (isScreenshareCaptureCancelledError(error)) {
        emit("screenshare.source_selection_cancelled", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          stage: selectedSourceId ? "desktop_capture_prompt" : "display_media_prompt",
          sourceType: selectedSourceType || (selectedSourceId ? "desktop_source" : "display_media"),
          sourceId: selectedSourceId || null,
          sourceKind: selectedSourceKind || null,
          sourceName: selectedSourceName || null,
        });
        return null;
      }
      if (selectedSourceId && !selectedStream) {
        captureFallbackReason = String(error?.message || error || "desktop_capture_constraints_rejected").trim() || "desktop_capture_constraints_rejected";
        try {
          captureStream = await captureDesktopSourceStream({
            sourceId: selectedSourceId,
            sourceKind: selectedSourceKind,
            sourceName: selectedSourceName,
            captureRequest: null,
            withAudio: !!captureRequest?.withAudio,
            useFallbackConstraints: true,
          });
        } catch (fallbackError) {
          emit("screenshare.capture_start_failed", {
            triggerReason: normalizedTriggerReason,
            callerFunction: "startShare",
            stage: "capture_stream",
            sourceType: selectedSourceType || "desktop_source",
            sourceId: selectedSourceId || null,
            sourceKind: selectedSourceKind || null,
            sourceName: selectedSourceName || null,
            errorName: String(fallbackError?.name || "").trim() || null,
            errorMessage: String(fallbackError?.message || fallbackError || "desktop_capture_failed").trim() || "desktop_capture_failed",
          });
          throw fallbackError;
        }
      } else {
        const errorName = String(error?.name || "").trim().toLowerCase();
        const canFallback = !!(
          errorName
          && errorName !== "notallowederror"
          && errorName !== "aborterror"
          && errorName !== "notfounderror"
        );
        if (!canFallback) {
          emit("screenshare.capture_start_failed", {
            triggerReason: normalizedTriggerReason,
            callerFunction: "startShare",
            stage: "capture_stream",
            sourceType: selectedSourceType || "display_media",
            sourceId: selectedSourceId || null,
            sourceKind: selectedSourceKind || null,
            sourceName: selectedSourceName || null,
            errorName: String(error?.name || "").trim() || null,
            errorMessage: String(error?.message || error || "capture_stream_failed").trim() || "capture_stream_failed",
          });
          throw error;
        }
        captureFallbackReason = String(error?.message || error || "capture_constraints_rejected").trim() || "capture_constraints_rejected";
        try {
          captureStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: !!captureRequest?.withAudio,
          });
        } catch (fallbackError) {
          if (isScreenshareCaptureCancelledError(fallbackError)) {
            emit("screenshare.source_selection_cancelled", {
              triggerReason: normalizedTriggerReason,
              callerFunction: "startShare",
              stage: "display_media_prompt",
              sourceType: selectedSourceType || "display_media",
              sourceId: selectedSourceId || null,
              sourceKind: selectedSourceKind || null,
              sourceName: selectedSourceName || null,
            });
            return null;
          }
          emit("screenshare.capture_start_failed", {
            triggerReason: normalizedTriggerReason,
            callerFunction: "startShare",
            stage: "capture_stream_fallback",
            sourceType: selectedSourceType || "display_media",
            sourceId: selectedSourceId || null,
            sourceKind: selectedSourceKind || null,
            sourceName: selectedSourceName || null,
            errorName: String(fallbackError?.name || "").trim() || null,
            errorMessage: String(fallbackError?.message || fallbackError || "capture_stream_fallback_failed").trim() || "capture_stream_fallback_failed",
          });
          throw fallbackError;
        }
      }
    }
    const captureTrack = captureStream?.getVideoTracks?.()?.[0] || null;
    if (!captureTrack) {
      try {
        captureStream?.getTracks?.()?.forEach?.((track) => track.stop?.());
      } catch (_) {}
      const missingTrackError = new Error("screenshare_capture_track_missing");
      emit("screenshare.capture_start_failed", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        stage: "capture_track_missing",
        sourceType: selectedSourceType || (selectedSourceId ? "desktop_source" : "display_media"),
        sourceId: selectedSourceId || null,
        sourceKind: selectedSourceKind || null,
        sourceName: selectedSourceName || null,
        errorName: "screenshare_capture_track_missing",
        errorMessage: "screenshare_capture_track_missing",
      });
      throw missingTrackError;
    }
    const captureAudioTrack = captureStream?.getAudioTracks?.()?.[0] || null;
    if (!selectedSourceKind) {
      selectedSourceKind = normalizeScreenshareSourceKind(captureTrack?.getSettings?.()?.displaySurface || "");
    }
    if (!selectedSourceType) {
      selectedSourceType = selectedSourceId ? "desktop_source" : "display_media";
    }
    const desktopCaptureConstraints = captureStream?.__serverVoiceDesktopCaptureConstraints || null;
    const captureRequestMetrics = readCaptureRequestMetrics(captureRequest);
    const captureMetricsBeforeApply = readTrackOutputMetrics(captureTrack);
    emit("screenshare.capture_track_acquired", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      stage: "post_capture_pre_apply_constraints",
      captureApi: selectedSourceId ? "getUserMedia" : "getDisplayMedia",
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      requestedQuality: captureRequestMetrics.requestedQuality || null,
      requestedFps: captureRequestMetrics.requestedFps,
      requestedWidth: captureRequestMetrics.requestedWidth,
      requestedHeight: captureRequestMetrics.requestedHeight,
      actualWidth: captureMetricsBeforeApply.actualWidth,
      actualHeight: captureMetricsBeforeApply.actualHeight,
      actualFps: captureMetricsBeforeApply.actualFps,
      streamPreset: captureRequest.streamPreset || null,
      qualityPreset: captureRequest.qualityPreset || null,
      fpsPreset: captureRequest.fpsPreset || null,
      withAudio: !!captureRequest?.withAudio,
      desktopCaptureUseFallbackConstraints: !!desktopCaptureConstraints?.useFallbackConstraints,
      desktopCaptureMandatoryMaxFrameRate: Number(desktopCaptureConstraints?.mandatoryMaxFrameRate || 0) || null,
      desktopCaptureMandatoryMinFrameRate: Number(desktopCaptureConstraints?.mandatoryMinFrameRate || 0) || null,
      desktopCaptureMandatoryMaxWidth: Number(desktopCaptureConstraints?.mandatoryMaxWidth || 0) || null,
      desktopCaptureMandatoryMaxHeight: Number(desktopCaptureConstraints?.mandatoryMaxHeight || 0) || null,
    });
    if (shouldWarnScreenshareFpsClamp(captureRequestMetrics.requestedFps, captureMetricsBeforeApply.actualFps)) {
      emit("screenshare.fps_clamped", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        stage: "post_capture_pre_apply_constraints",
        captureApi: selectedSourceId ? "getUserMedia" : "getDisplayMedia",
        requestedQuality: captureRequestMetrics.requestedQuality || null,
        requestedFps: captureRequestMetrics.requestedFps,
        actualFps: captureMetricsBeforeApply.actualFps,
        sourceType: selectedSourceType || null,
        sourceKind: selectedSourceKind || null,
      });
    }
    try { captureTrack.contentHint = "detail"; } catch (_) {}
    let constraintApplyError = null;
    try {
      if (typeof captureTrack.applyConstraints === "function") {
        await captureTrack.applyConstraints(captureRequest.applyConstraints || {});
      }
    } catch (error) {
      constraintApplyError = error;
    }
    const captureSettings = readTrackCaptureSettings(captureTrack);
    const captureMetricsAfterApply = readTrackOutputMetrics(captureTrack);
    emit("screenshare.capture_track_constraints_resolved", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      stage: "post_apply_constraints",
      captureApi: selectedSourceId ? "getUserMedia" : "getDisplayMedia",
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      requestedQuality: captureRequestMetrics.requestedQuality || null,
      requestedFps: captureRequestMetrics.requestedFps,
      requestedWidth: captureRequestMetrics.requestedWidth,
      requestedHeight: captureRequestMetrics.requestedHeight,
      actualWidth: captureMetricsAfterApply.actualWidth,
      actualHeight: captureMetricsAfterApply.actualHeight,
      actualFps: captureMetricsAfterApply.actualFps,
      streamPreset: captureRequest.streamPreset || null,
      qualityPreset: captureRequest.qualityPreset || null,
      fpsPreset: captureRequest.fpsPreset || null,
      desktopCaptureUseFallbackConstraints: !!desktopCaptureConstraints?.useFallbackConstraints,
      desktopCaptureMandatoryMaxFrameRate: Number(desktopCaptureConstraints?.mandatoryMaxFrameRate || 0) || null,
      desktopCaptureMandatoryMinFrameRate: Number(desktopCaptureConstraints?.mandatoryMinFrameRate || 0) || null,
      desktopCaptureMandatoryMaxWidth: Number(desktopCaptureConstraints?.mandatoryMaxWidth || 0) || null,
      desktopCaptureMandatoryMaxHeight: Number(desktopCaptureConstraints?.mandatoryMaxHeight || 0) || null,
      fallbackReason: constraintApplyError ? String(constraintApplyError?.message || constraintApplyError || "apply_constraints_failed") : null,
    });
    if (shouldWarnScreenshareFpsClamp(captureRequestMetrics.requestedFps, captureMetricsAfterApply.actualFps)) {
      emit("screenshare.fps_clamped", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        stage: "post_apply_constraints",
        captureApi: selectedSourceId ? "getUserMedia" : "getDisplayMedia",
        requestedQuality: captureRequestMetrics.requestedQuality || null,
        requestedFps: captureRequestMetrics.requestedFps,
        actualFps: captureMetricsAfterApply.actualFps,
        sourceType: selectedSourceType || null,
        sourceKind: selectedSourceKind || null,
        sourceName: selectedSourceName || null,
        fallbackReason: constraintApplyError ? String(constraintApplyError?.message || constraintApplyError || "apply_constraints_failed") : null,
      });
    }
    emit("screenshare.capture_started", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      trackId: normalizeId(captureTrack.id || "") || null,
      requestedQuality: captureRequestMetrics.requestedQuality || null,
      qualityPreset: captureRequest.qualityPreset || null,
      requestedFps: captureRequestMetrics.requestedFps,
      fpsPreset: captureRequest.fpsPreset || null,
      streamPreset: captureRequest.streamPreset || null,
      withAudio: !!captureRequest?.withAudio,
      hasCapturedAudioTrack: !!captureAudioTrack,
      requestedWidth: captureRequestMetrics.requestedWidth,
      requestedHeight: captureRequestMetrics.requestedHeight,
      actualWidth: captureMetricsAfterApply.actualWidth,
      actualHeight: captureMetricsAfterApply.actualHeight,
      actualFps: captureMetricsAfterApply.actualFps,
      fallbackReason: captureFallbackReason || (constraintApplyError ? String(constraintApplyError?.message || constraintApplyError || "apply_constraints_failed") : null),
    });
    localCaptureStream = captureStream;
    localCaptureTrack = captureTrack;
    localCaptureAudioTrack = captureAudioTrack;
    localCaptureAudioTrackSid = "";
    emit("screenshare.local_capture_started", {
      triggerReason: normalizedTriggerReason,
      trackId: normalizeId(captureTrack.id || "") || null,
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      requestedQuality: captureRequestMetrics.requestedQuality || null,
      qualityPreset: captureRequest.qualityPreset || null,
      requestedFps: captureRequestMetrics.requestedFps,
      fpsPreset: captureRequest.fpsPreset || null,
      streamPreset: captureRequest.streamPreset || null,
      withAudio: !!captureRequest?.withAudio,
      hasCapturedAudioTrack: !!captureAudioTrack,
      requestedWidth: captureRequestMetrics.requestedWidth,
      requestedHeight: captureRequestMetrics.requestedHeight,
      actualWidth: captureMetricsAfterApply.actualWidth,
      actualHeight: captureMetricsAfterApply.actualHeight,
      actualFps: captureMetricsAfterApply.actualFps,
      fallbackReason: captureFallbackReason || (constraintApplyError ? String(constraintApplyError?.message || constraintApplyError || "apply_constraints_failed") : null),
    });

    localTrackEndedHandler = () => {
      void stopShare({
        triggerReason: "local_capture_track_ended",
      });
    };
    try { captureTrack.addEventListener("ended", localTrackEndedHandler, { once: true }); } catch (_) {}

    let publication = null;
    let audioPublication = null;
    let audioPublishError = null;
    const publishBuild = buildScreensharePublishOptions(captureRequest);
    const publishOptions = publishBuild.publishOptions || {
      source: Track.Source.ScreenShare,
      stopOnMute: false,
      simulcast: true,
    };
    const publishDiagnostics = publishBuild.diagnostics || {};
    emit("screenshare.publish_settings_requested", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      source: String(publishOptions?.source || Track.Source.ScreenShare || "").trim() || Track.Source.ScreenShare,
      requestedQuality: publishDiagnostics.requestedQuality || captureRequest?.qualityPreset || null,
      requestedFps: publishDiagnostics.requestedFps,
      configuredWidth: publishDiagnostics.requestedWidth,
      configuredHeight: publishDiagnostics.requestedHeight,
      configuredMaxFramerate: Number(publishOptions?.videoEncoding?.maxFramerate || 0) || null,
      configuredBitrate: Number(publishOptions?.videoEncoding?.maxBitrate || 0) || null,
      simulcast: typeof publishOptions?.simulcast === "boolean" ? publishOptions.simulcast : null,
      streamPreset: captureRequest?.streamPreset || null,
      qualityPreset: captureRequest?.qualityPreset || null,
      fpsPreset: captureRequest?.fpsPreset || null,
    });
    try {
      publication = await room.localParticipant.publishTrack(captureTrack, publishOptions);
    } catch (error) {
      emit("screenshare.capture_start_failed", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        stage: "publish_track",
        sourceType: selectedSourceType || null,
        sourceId: selectedSourceId || null,
        sourceKind: selectedSourceKind || null,
        sourceName: selectedSourceName || null,
        errorName: String(error?.name || "").trim() || null,
        errorMessage: String(error?.message || error || "publish_track_failed").trim() || "publish_track_failed",
      });
      releaseLocalCaptureResources();
      throw error;
    }
    const senderEncodingApplyResult = await applyScreensharePublishEncodingToSender(publication, publishOptions);
    const publishSenderEncoding = readPublishedSenderEncoding(publication);
    const publishTrackMetrics = readTrackOutputMetrics(publication?.track?.mediaStreamTrack || captureTrack);
    emit("screenshare.publish_settings_applied", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      source: String(publishOptions?.source || Track.Source.ScreenShare || "").trim() || Track.Source.ScreenShare,
      requestedQuality: publishDiagnostics.requestedQuality || captureRequest?.qualityPreset || null,
      requestedFps: publishDiagnostics.requestedFps,
      configuredWidth: publishDiagnostics.requestedWidth,
      configuredHeight: publishDiagnostics.requestedHeight,
      configuredMaxFramerate: Number(publishOptions?.videoEncoding?.maxFramerate || 0) || null,
      configuredBitrate: Number(publishOptions?.videoEncoding?.maxBitrate || 0) || null,
      senderMaxFramerate: publishSenderEncoding.maxFramerate,
      senderBitrate: publishSenderEncoding.maxBitrate,
      senderScaleResolutionDownBy: publishSenderEncoding.scaleResolutionDownBy,
      senderDegradationPreference: publishSenderEncoding.degradationPreference,
      senderEncodingApplyApplied: !!senderEncodingApplyResult?.applied,
      senderEncodingApplyReason: senderEncodingApplyResult?.reason || null,
      actualWidth: publishTrackMetrics.actualWidth,
      actualHeight: publishTrackMetrics.actualHeight,
      actualFps: publishTrackMetrics.actualFps,
      simulcast: typeof publishOptions?.simulcast === "boolean" ? publishOptions.simulcast : null,
      streamPreset: captureRequest?.streamPreset || null,
      qualityPreset: captureRequest?.qualityPreset || null,
      fpsPreset: captureRequest?.fpsPreset || null,
    });
    const fpsForClampCheck = Number(
      publishTrackMetrics.actualFps
      || publishSenderEncoding.maxFramerate
      || 0,
    ) || null;
    if (shouldWarnScreenshareFpsClamp(publishDiagnostics.requestedFps, fpsForClampCheck)) {
      emit("screenshare.fps_clamped", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        stage: "publish_sender",
        sourceType: selectedSourceType || null,
        sourceKind: selectedSourceKind || null,
        requestedQuality: publishDiagnostics.requestedQuality || captureRequest?.qualityPreset || null,
        requestedFps: publishDiagnostics.requestedFps,
        actualFps: fpsForClampCheck,
        configuredMaxFramerate: Number(publishOptions?.videoEncoding?.maxFramerate || 0) || null,
        senderMaxFramerate: publishSenderEncoding.maxFramerate,
      });
    }
    if (captureAudioTrack) {
      try {
        audioPublication = await room.localParticipant.publishTrack(captureAudioTrack, {
          source: Track.Source.ScreenShareAudio,
          stopOnMute: false,
          simulcast: false,
        });
      } catch (error) {
        audioPublishError = error;
      }
    }
    localCaptureAudioTrack = captureAudioTrack || null;
    localCaptureAudioTrackSid = normalizeId(audioPublication?.trackSid || "");
    const recordKey = `local:${normalizeId(publication?.trackSid || captureTrack?.id || "")}`;
    const record = upsertShareRecord({
      key: recordKey,
      ownerUserId: meId,
      ownerDisplayName: "You",
      isLocal: true,
      track: captureTrack,
      trackSid: normalizeId(publication?.trackSid || ""),
      stream: captureStream,
      captureRequest,
      captureSettings,
    });
    emit("screenshare.track_published", {
      triggerReason: normalizedTriggerReason,
      participantId: meId || null,
      trackId: record?.trackId || normalizeId(captureTrack.id || "") || null,
      trackSid: record?.trackSid || normalizeId(publication?.trackSid || "") || null,
      sourceType: selectedSourceType || null,
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceName: selectedSourceName || null,
      requestedQuality: publishDiagnostics.requestedQuality || captureRequest?.qualityPreset || null,
      qualityPreset: captureRequest.qualityPreset || null,
      requestedFps: publishDiagnostics.requestedFps || null,
      fpsPreset: captureRequest.fpsPreset || null,
      streamPreset: captureRequest.streamPreset || null,
      withAudio: !!captureRequest?.withAudio,
      hasCapturedAudioTrack: !!captureAudioTrack,
      shareAudioPublished: !!audioPublication,
      shareAudioTrackSid: localCaptureAudioTrackSid || null,
      shareAudioPublishError: audioPublishError ? String(audioPublishError?.message || audioPublishError || "share_audio_publish_failed") : null,
      actualWidth: Number(captureSettings?.width || 0) || null,
      actualHeight: Number(captureSettings?.height || 0) || null,
      actualFps: Number(captureSettings?.frameRate || 0) || null,
      publishConfiguredWidth: publishDiagnostics.requestedWidth || null,
      publishConfiguredHeight: publishDiagnostics.requestedHeight || null,
      publishConfiguredMaxFramerate: Number(publishOptions?.videoEncoding?.maxFramerate || 0) || null,
      publishConfiguredBitrate: Number(publishOptions?.videoEncoding?.maxBitrate || 0) || null,
      publishSenderMaxFramerate: publishSenderEncoding.maxFramerate,
      publishSenderBitrate: publishSenderEncoding.maxBitrate,
      fallbackReason: captureFallbackReason || (constraintApplyError ? String(constraintApplyError?.message || constraintApplyError || "apply_constraints_failed") : null),
    });
    emitStateChanged("local_track_published", "startShare");
    return record;
  }

  async function stopShare({
    triggerReason = "manual_toggle",
  } = {}) {
    emit("screenshare.stop_requested", {
      triggerReason: String(triggerReason || "").trim() || "manual_toggle",
      localShareActive: !!(localShareKey && shareRecordsByKey.has(localShareKey)),
    });
    const localRecord = localShareKey ? (shareRecordsByKey.get(localShareKey) || null) : null;
    const localTrack = localCaptureTrack || localRecord?.track || null;
    const localAudioTrack = localCaptureAudioTrack || null;
    let unpublished = false;
    let audioUnpublished = false;

    if (room?.localParticipant && localTrack) {
      try {
        await room.localParticipant.unpublishTrack(localTrack, false);
        unpublished = true;
      } catch (_) {}
    }
    if (room?.localParticipant && localAudioTrack) {
      try {
        await room.localParticipant.unpublishTrack(localAudioTrack, false);
        audioUnpublished = true;
      } catch (_) {}
    }

    if (localShareKey) {
      removeShareRecordByKey(localShareKey, {
        triggerReason: "local_share_removed",
        callerFunction: "stopShare",
      });
    }
    releaseLocalCaptureResources();

    emit("screenshare.track_unpublished", {
      triggerReason: String(triggerReason || "").trim() || "manual_toggle",
      participantId: meId || null,
      trackId: normalizeId(localRecord?.trackId || localTrack?.id || "") || null,
      trackSid: normalizeId(localRecord?.trackSid || "") || null,
      unpublished,
      shareAudioEnabled: !!shareAudioEnabled,
      shareAudioTrackSid: localCaptureAudioTrackSid || null,
      shareAudioUnpublished: audioUnpublished,
    });
    emitStateChanged("local_track_unpublished", "stopShare");
    return true;
  }

  function handleRemoteTrackSubscribed(track, publication, participant) {
    if (String(track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isScreenSharePublication(publication, track)) return;
    const uid = normalizeId(participant?.identity || "");
    if (!uid) return;
    const streamBundle = createVideoStreamFromTrack(track);
    if (!streamBundle?.mediaTrack || !streamBundle?.stream) return;
    const trackId = normalizeId(streamBundle.mediaTrack.id || "");
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    const recordKey = `remote:${uid}:${trackSid || trackId}`;
    upsertShareRecord({
      key: recordKey,
      ownerUserId: uid,
      ownerDisplayName: String(participant?.name || "").trim(),
      isLocal: false,
      track: streamBundle.mediaTrack,
      trackSid,
      stream: streamBundle.stream,
    });
    const remoteMetrics = readTrackOutputMetrics(streamBundle.mediaTrack);
    emit("screenshare.remote_track_received", {
      triggerReason: "room_track_subscribed",
      participantId: uid || null,
      trackId: trackId || null,
      trackSid: trackSid || null,
      actualWidth: remoteMetrics.actualWidth,
      actualHeight: remoteMetrics.actualHeight,
      actualFps: remoteMetrics.actualFps,
    });
    emitStateChanged("remote_track_subscribed", "handleRemoteTrackSubscribed");
  }

  function handleRemoteTrackUnsubscribed(track, publication, participant) {
    if (String(track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isScreenSharePublication(publication, track)) return;
    const uid = normalizeId(participant?.identity || "");
    const mediaTrack = track?.mediaStreamTrack || track || null;
    const trackId = normalizeId(mediaTrack?.id || "");
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    const removed = removeRemoteShareRecordByTrack({
      participantIdentity: uid,
      track,
      publication,
      triggerReason: "room_track_unsubscribed",
    });
    if (!removed) return;
    emit("screenshare.remote_track_removed", {
      triggerReason: "room_track_unsubscribed",
      participantId: uid || null,
      trackId: trackId || null,
      trackSid: trackSid || null,
    });
    emitStateChanged("remote_track_unsubscribed", "handleRemoteTrackUnsubscribed");
  }

  function handleParticipantDisconnected(participant) {
    const uid = normalizeId(participant?.identity || "");
    if (!uid) return;
    removeRemoteShareRecordsByParticipant(uid, {
      triggerReason: "participant_disconnected",
    });
    emitStateChanged("participant_disconnected", "handleParticipantDisconnected");
  }

  function handleRoomDisconnected() {
    clearRemoteShareRecords({
      triggerReason: "room_disconnected",
      callerFunction: "handleRoomDisconnected",
    });
    emitStateChanged("room_disconnected", "handleRoomDisconnected");
  }

  function hydrateExistingRemoteShares() {
    if (!room?.remoteParticipants) return;
    room.remoteParticipants.forEach((participant) => {
      const uid = normalizeId(participant?.identity || "");
      if (!uid) return;
      participant?.trackPublications?.forEach?.((publication) => {
        if (!publication) return;
        if (!isScreenSharePublication(publication, publication.track || null)) return;
        const subscribedTrack = publication.track || null;
        if (!subscribedTrack) return;
        handleRemoteTrackSubscribed(subscribedTrack, publication, participant);
      });
    });
  }

  function bindRoom(nextRoom = null) {
    if (!nextRoom || room === nextRoom) return;
    if (room && roomBound) {
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
      roomBound = false;
    }
    room = nextRoom;
    room.on(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    roomBound = true;
    hydrateExistingRemoteShares();
    emitStateChanged("room_bound", "bindRoom");
  }

  function ensureUi(stageViewport = null) {
    if (!stageViewport || typeof document === "undefined") return null;
    if (uiRefs?.panel && uiRefs.panel.isConnected && uiRefs.panel.parentElement === stageViewport) {
      return uiRefs;
    }
    if (uiRefs?.panel && uiRefs.panel.isConnected) {
      try { uiRefs.panel.remove(); } catch (_) {}
    }
    const panel = document.createElement("section");
    panel.className = "serverVoiceScreensharePanel";
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    panel.setAttribute("data-server-voice-screenshare-panel", "1");

    const header = document.createElement("div");
    header.className = "serverVoiceScreensharePanel__header";

    const badge = document.createElement("span");
    badge.className = "serverVoiceScreensharePanel__badge";
    badge.textContent = "Live share";

    const title = document.createElement("span");
    title.className = "serverVoiceScreensharePanel__title";
    title.textContent = "Screen share";

    header.appendChild(badge);
    header.appendChild(title);

    const video = document.createElement("video");
    video.className = "serverVoiceScreensharePanel__video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    panel.appendChild(header);
    panel.appendChild(video);
    stageViewport.appendChild(panel);

    uiRefs = {
      panel,
      header,
      badge,
      title,
      video,
      stageViewport,
    };
    return uiRefs;
  }

  function clearUi() {
    if (!uiRefs) return;
    try {
      if (uiRefs.video) {
        uiRefs.video.pause?.();
        uiRefs.video.srcObject = null;
      }
    } catch (_) {}
    try { uiRefs.panel?.remove?.(); } catch (_) {}
    uiRefs = null;
    lastRenderSignature = "";
  }

  function render({
    stageViewport = null,
    enabled = false,
    triggerReason = "refresh_call_ui",
    callerFunction = "render",
  } = {}) {
    const refs = ensureUi(stageViewport);
    if (!refs) return;
    const state = buildState();
    const active = enabled ? state.activeShare : null;
    const shouldShow = !!(enabled && active?.stream);

    if (!shouldShow) {
      refs.panel.hidden = true;
      refs.panel.setAttribute("aria-hidden", "true");
      if (refs.video.srcObject) {
        try {
          refs.video.pause?.();
          refs.video.srcObject = null;
        } catch (_) {
          refs.video.srcObject = null;
        }
      }
    } else {
      refs.panel.hidden = false;
      refs.panel.setAttribute("aria-hidden", "false");
      refs.title.textContent = active.isLocal
        ? "You are sharing"
        : `${String(active.ownerDisplayName || active.ownerUserId || "Participant")} is sharing`;
      if (refs.video.srcObject !== active.stream) {
        refs.video.srcObject = active.stream;
      }
      try { refs.video.play?.().catch?.(() => {}); } catch (_) {}
    }

    const signature = [
      enabled ? "1" : "0",
      shouldShow ? "1" : "0",
      String(active?.key || "none"),
      String(state.localShareActive ? "1" : "0"),
    ].join("|");
    if (signature !== lastRenderSignature) {
      lastRenderSignature = signature;
      emit("screenshare.render_updated", {
        triggerReason: String(triggerReason || "").trim() || "refresh_call_ui",
        callerFunction: String(callerFunction || "").trim() || "render",
        visible: shouldShow,
        localShareActive: !!state.localShareActive,
        streamPreset: state?.capturePreferences?.streamPreset || null,
        qualityPreset: state?.capturePreferences?.qualityPreset || null,
        fpsPreset: state?.capturePreferences?.fpsPreset || null,
        shareAudioEnabled: !!state?.capturePreferences?.shareAudioEnabled,
        activeParticipantId: active?.ownerUserId || null,
        activeTrackId: active?.trackId || null,
        participantIds: state.shareParticipantIds || [],
      });
    }
  }

  async function detach({
    stopLocalShare = true,
    clearUiState = true,
    triggerReason = "detach",
  } = {}) {
    if (stopLocalShare) {
      try {
        await stopShare({ triggerReason });
      } catch (_) {
        releaseLocalCaptureResources();
      }
    } else {
      releaseLocalCaptureResources();
    }
    if (room && roomBound) {
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
    }
    roomBound = false;
    room = null;
    clearRemoteShareRecords({
      triggerReason: "detach_remote_clear",
      callerFunction: "detach",
    });
    if (clearUiState) clearUi();
    emitStateChanged("detached", "detach");
  }

  async function setQualityPreset(nextQualityPreset, {
    triggerReason = "quality_preset_set",
    applyLive = true,
  } = {}) {
    const nextStreamPreset = deriveStreamPresetFromQualityAndFps(nextQualityPreset, fpsPreset);
    const committed = commitCapturePreference({
      nextQualityPreset,
      nextFpsPreset: fpsPreset,
      nextStreamPreset,
      triggerReason,
      callerFunction: "setQualityPreset",
    });
    if (applyLive) {
      await applyLocalCaptureConstraintsLive({
        triggerReason,
        callerFunction: "setQualityPreset",
      });
    }
    return committed;
  }

  async function setFpsPreset(nextFpsPreset, {
    triggerReason = "fps_preset_set",
    applyLive = true,
  } = {}) {
    const nextStreamPreset = deriveStreamPresetFromQualityAndFps(qualityPreset, nextFpsPreset);
    const committed = commitCapturePreference({
      nextQualityPreset: qualityPreset,
      nextFpsPreset,
      nextStreamPreset,
      triggerReason,
      callerFunction: "setFpsPreset",
    });
    if (applyLive) {
      await applyLocalCaptureConstraintsLive({
        triggerReason,
        callerFunction: "setFpsPreset",
      });
    }
    return committed;
  }

  async function setStreamPreset(nextStreamPreset, {
    triggerReason = "stream_preset_set",
    applyLive = true,
  } = {}) {
    const normalizedStreamPreset = normalizeScreenshareStreamPreset(nextStreamPreset);
    const derived = deriveQualityAndFpsFromStreamPreset(normalizedStreamPreset, fpsPreset);
    const committed = commitCapturePreference({
      nextQualityPreset: derived.qualityPreset,
      nextFpsPreset: derived.fpsPreset,
      nextStreamPreset: normalizedStreamPreset,
      triggerReason,
      callerFunction: "setStreamPreset",
    });
    if (applyLive) {
      await applyLocalCaptureConstraintsLive({
        triggerReason,
        callerFunction: "setStreamPreset",
      });
    }
    return committed;
  }

  async function setShareAudioEnabled(nextShareAudioEnabled, {
    triggerReason = "share_audio_set",
    applyLive = false,
  } = {}) {
    const committed = commitShareAudioPreference(nextShareAudioEnabled, {
      triggerReason,
      callerFunction: "setShareAudioEnabled",
    });
    if (applyLive && localShareKey && shareRecordsByKey.has(localShareKey)) {
      emit("screenshare.capture_constraints_applied", {
        triggerReason: String(triggerReason || "").trim() || "share_audio_set",
        callerFunction: "setShareAudioEnabled",
        applied: false,
        reason: "share_audio_requires_restart",
        shareAudioEnabled: !!committed?.shareAudioEnabled,
      });
    }
    return committed;
  }

  async function toggleShareAudioEnabled({
    triggerReason = "share_audio_toggle",
    applyLive = false,
  } = {}) {
    return setShareAudioEnabled(!shareAudioEnabled, {
      triggerReason,
      applyLive,
    });
  }

  async function cycleQualityPreset({
    triggerReason = "quality_preset_cycle",
    applyLive = true,
  } = {}) {
    const currentIndex = SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS.indexOf(normalizeScreenshareQualityPreset(qualityPreset));
    const nextIndex = currentIndex < 0
      ? 0
      : ((currentIndex + 1) % SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS.length);
    const nextPreset = SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS[nextIndex] || "auto";
    return setQualityPreset(nextPreset, {
      triggerReason,
      applyLive,
    });
  }

  async function cycleFpsPreset({
    triggerReason = "fps_preset_cycle",
    applyLive = true,
  } = {}) {
    const currentIndex = SERVER_VOICE_SCREENSHARE_FPS_PRESETS.indexOf(normalizeScreenshareFpsPreset(fpsPreset));
    const nextIndex = currentIndex < 0
      ? 0
      : ((currentIndex + 1) % SERVER_VOICE_SCREENSHARE_FPS_PRESETS.length);
    const nextPreset = SERVER_VOICE_SCREENSHARE_FPS_PRESETS[nextIndex] || "30";
    return setFpsPreset(nextPreset, {
      triggerReason,
      applyLive,
    });
  }

  async function cycleStreamPreset({
    triggerReason = "stream_preset_cycle",
    applyLive = true,
  } = {}) {
    const currentIndex = SERVER_VOICE_SCREENSHARE_STREAM_PRESETS.indexOf(normalizeScreenshareStreamPreset(streamPreset));
    const nextIndex = currentIndex < 0
      ? 0
      : ((currentIndex + 1) % SERVER_VOICE_SCREENSHARE_STREAM_PRESETS.length);
    const nextPreset = SERVER_VOICE_SCREENSHARE_STREAM_PRESETS[nextIndex] || SERVER_VOICE_SCREENSHARE_DEFAULT_STREAM_PRESET;
    return setStreamPreset(nextPreset, {
      triggerReason,
      applyLive,
    });
  }

  return {
    conversationId: convId,
    localUserId: meId,
    bindRoom,
    startShare,
    stopShare,
    async toggleShare({ triggerReason = "manual_toggle" } = {}) {
      if (localShareKey && shareRecordsByKey.has(localShareKey)) {
        await stopShare({ triggerReason });
        return false;
      }
      const record = await startShare({ triggerReason });
      return !!record;
    },
    isLocalShareActive() {
      return !!(localShareKey && shareRecordsByKey.has(localShareKey));
    },
    getPreferences() {
      return getCapturePreferences();
    },
    getStreamPreset() {
      return normalizeScreenshareStreamPreset(streamPreset);
    },
    setStreamPreset,
    cycleStreamPreset,
    setQualityPreset,
    setFpsPreset,
    cycleQualityPreset,
    cycleFpsPreset,
    setShareAudioEnabled,
    toggleShareAudioEnabled,
    isShareAudioEnabled() {
      return !!shareAudioEnabled;
    },
    async selectSource({ triggerReason = "source_select" } = {}) {
      return selectSource({
        triggerReason: String(triggerReason || "").trim() || "source_select",
        callerFunction: "selectSource",
      });
    },
    setPreferredSourceSelection(selection = null, {
      triggerReason = "source_selected",
    } = {}) {
      return setPreferredSourceSelection(selection, {
        triggerReason: String(triggerReason || "").trim() || "source_selected",
        callerFunction: "setPreferredSourceSelection",
      });
    },
    clearPreferredSourceSelection({
      triggerReason = "source_cleared",
    } = {}) {
      preferredSourceSelection = null;
      emitStateChanged(
        String(triggerReason || "").trim() || "source_cleared",
        "clearPreferredSourceSelection",
      );
      return null;
    },
    getState() {
      return buildState();
    },
    render,
    clearUi,
    detach,
  };
}
