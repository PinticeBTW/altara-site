import { ParticipantEvent, RoomEvent, Track, VideoQuality, supportsVP9 } from "../node_modules/livekit-client/dist/livekit-client.esm.mjs";
import { createPrivateScreenShareQualityController } from "./privateScreenShareQualityController.js";
import { classifyNativeHighMotionBoundary } from "./nativeHighMotionCaptureBridge.js";
import {
  parseNativeScreenshareCompanionIdentity,
  resolveNativeScreenshareCompanion,
} from "./liveKitTechnicalParticipant.js";
import {
  buildSafeCallShareTitle,
  sanitizeCallVisibleName,
} from "./callVisibleIdentity.js";

const SERVER_VOICE_SCREENSHARE_QUALITY_STORAGE_KEY = "altara_server_voice_screenshare_quality_v1";
const SERVER_VOICE_SCREENSHARE_FPS_STORAGE_KEY = "altara_server_voice_screenshare_fps_v1";
const SERVER_VOICE_SCREENSHARE_STREAM_PRESET_STORAGE_KEY = "altara_server_voice_screenshare_stream_preset_v1";
const SERVER_VOICE_SCREENSHARE_AUDIO_STORAGE_KEY = "altara_server_voice_screenshare_audio_v1";
const SERVER_VOICE_SCREENSHARE_DEFAULT_QUALITY_PRESET = "720p";
const SERVER_VOICE_SCREENSHARE_DEFAULT_FPS_PRESET = "30";
const SERVER_VOICE_SCREENSHARE_DEFAULT_STREAM_PRESET = "720p30";
const SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS = Object.freeze(["auto", "720p", "1080p", "1440p", "2160p", "source"]);
const SERVER_VOICE_SCREENSHARE_FPS_PRESETS = Object.freeze(["30", "60"]);
const SERVER_VOICE_SCREENSHARE_STREAM_PRESETS = Object.freeze([
  "720p30",
  "720p60",
  "1080p30",
  "1080p60",
  "1440p30",
  "1440p60",
  "2160p30",
  "2160p60",
  "source",
]);
const SCREENSHARE_PHASE_BY_LOWER_NAME = Object.freeze({
  picker_opened: "picker_opened",
  source_selected: "source_selected",
  ipc_sent: "ipc_sent",
  session_handler_ready: "session_handler_ready",
  session_handler_rejected: "session_handler_rejected",
  getdisplaymedia_called: "getDisplayMedia_called",
  getdisplaymedia_resolved: "getDisplayMedia_resolved",
  getdisplaymedia_failed: "getDisplayMedia_failed",
  source_id_fallback_started: "source_id_fallback_started",
  source_id_fallback_resolved: "source_id_fallback_resolved",
  source_id_fallback_failed: "source_id_fallback_failed",
  track_received: "track_received",
  publish_started: "publish_started",
  publish_succeeded: "publish_succeeded",
  publish_failed: "publish_failed",
  cleanup_started: "cleanup_started",
  cleanup_finished: "cleanup_finished",
});
const SCREENSHARE_RTC_STATS_SAMPLE_COUNT = 6;
const SCREENSHARE_RTC_STATS_SAMPLE_INTERVAL_MS = 1000;
export const SCREENSHARE_REMOTE_PRESENTATION_TIMEOUT_MS = 5000;
export const SCREENSHARE_REMOTE_PRESENTATION_RETRY_LIMIT = 1;
const SCREENSHARE_PERFORMANCE_TRACK_PREFIX = "altara-screen-perf-v1";
const SCREENSHARE_PRESET_TRACK_PREFIX = "altara-screen-preset-v1";
const NATIVE_SCREENSHARE_TRACK_NAME = "altara-native-screenshare";
const PRIVATE_ONE_TO_ONE_SCREENSHARE_DEFAULT_PROFILE = "single_maintain_framerate";
const PRIVATE_ONE_TO_ONE_SCREENSHARE_PROFILES = Object.freeze([
  "simulcast_balanced",
  "single_balanced",
  "single_maintain_framerate",
  "single_720p60_maintain_framerate",
  "single_720p60_h264_maintain_framerate",
]);
const PRIVATE_720P60_MAX_BITRATE = 6_000_000;
const PRIVATE_NATIVE_HIGH_MOTION_720P60_MAX_BITRATE = 12_000_000;
const PRIVATE_720P60_EXPERIMENTAL_VIDEO_CODEC = "h264";
const PRIVATE_NATIVE_H264_HARDWARE_PROFILE_LEVEL_ID = "42001f";
const PRIVATE_NATIVE_H264_SOFTWARE_PROFILE_LEVEL_ID = "42e01f";
export const NATIVE_WEBRTC_CONTENTION_MODE = Object.freeze({
  NO_WEBRTC: "NO_WEBRTC",
  WEBRTC_ATTACHED_NO_ACTIVE_ENCODING: "WEBRTC_ATTACHED_NO_ACTIVE_ENCODING",
  LOCAL_WEBRTC_NVIDIA: "LOCAL_WEBRTC_NVIDIA",
  LOCAL_WEBRTC_OPENH264: "LOCAL_WEBRTC_OPENH264",
  AUTHENTICATED_LIVEKIT_NVIDIA: "AUTHENTICATED_LIVEKIT_NVIDIA",
});
export const NATIVE_WEBRTC_ATTACHMENT_STRATEGY = Object.freeze({
  DEFAULT_ADDTRACK: "DEFAULT_ADDTRACK",
  SENDONLY_TRANSCEIVER_60: "SENDONLY_TRANSCEIVER_60",
  PRE_NEGOTIATION_SENDER_PARAMETERS_60: "PRE_NEGOTIATION_SENDER_PARAMETERS_60",
  CONSTRAINT_CONTROL: "CONSTRAINT_CONTROL",
});
const NATIVE_WEBRTC_LOCAL_MODES = new Set([
  NATIVE_WEBRTC_CONTENTION_MODE.NO_WEBRTC,
  NATIVE_WEBRTC_CONTENTION_MODE.WEBRTC_ATTACHED_NO_ACTIVE_ENCODING,
  NATIVE_WEBRTC_CONTENTION_MODE.LOCAL_WEBRTC_NVIDIA,
  NATIVE_WEBRTC_CONTENTION_MODE.LOCAL_WEBRTC_OPENH264,
]);

function normalizePrivateOneToOneScreenshareProfile(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return PRIVATE_ONE_TO_ONE_SCREENSHARE_PROFILES.includes(normalized)
    ? normalized
    : PRIVATE_ONE_TO_ONE_SCREENSHARE_DEFAULT_PROFILE;
}

function normalizeScreensharePhaseName(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return SCREENSHARE_PHASE_BY_LOWER_NAME[raw.toLowerCase()] || raw.toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function resolveRemoteShareParticipant(participant = null) {
  const publisherIdentity = normalizeId(participant?.identity || "");
  if (!publisherIdentity) return null;
  const technicalIdentity = parseNativeScreenshareCompanionIdentity(publisherIdentity);
  const companion = resolveNativeScreenshareCompanion(participant);
  // A technical-shaped identity without matching signed metadata/attributes must
  // never be promoted to a human owner or shown as a third call participant.
  if (technicalIdentity && !companion) return null;
  return {
    publisherIdentity,
    ownerUserId: normalizeId(companion?.ownerUserId || publisherIdentity),
    ownerDisplayName: companion ? "" : sanitizeCallVisibleName(participant?.name, "User"),
    technicalCompanion: !!companion,
  };
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
    || normalized === "1440p"
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
  if (quality === "1440p" && fps === "30") return "1440p30";
  if (quality === "1440p" && fps === "60") return "1440p60";
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
  if (preset === "1440p30") return { qualityPreset: "1440p", fpsPreset: "30" };
  if (preset === "1440p60") return { qualityPreset: "1440p", fpsPreset: "60" };
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

export function buildCaptureVideoConstraints({
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
    };
  }
  if (quality === "720p") {
    video.width = { ideal: 1280, max: 1280 };
    video.height = { ideal: 720, max: 720 };
  } else if (quality === "1080p") {
    video.width = { ideal: 1920, max: 1920 };
    video.height = { ideal: 1080, max: 1080 };
  } else if (quality === "1440p") {
    video.width = { ideal: 2560, max: 2560 };
    video.height = { ideal: 1440, max: 1440 };
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
  if (quality === "1440p" || requestedWidth >= 2300 || requestedHeight >= 1300) {
    return fps >= 60 ? 16_000_000 : 8_000_000;
  }
  if (quality === "720p" || (requestedWidth > 0 && requestedWidth <= 1280 && requestedHeight <= 720)) {
    return fps >= 60 ? PRIVATE_720P60_MAX_BITRATE : 2_500_000;
  }
  if (quality === "source") {
    return fps >= 60 ? 16_000_000 : 8_000_000;
  }
  return fps >= 60 ? 10_000_000 : 5_000_000;
}

export function deriveScreensharePreferredVideoCodec({
  requestedQuality = "",
  requestedWidth = 0,
  requestedHeight = 0,
  supportsVp9 = false,
} = {}) {
  const quality = normalizeScreenshareQualityPreset(requestedQuality || "");
  const requests4k = quality === "2160p"
    || Number(requestedWidth || 0) >= 3200
    || Number(requestedHeight || 0) >= 1800;
  return requests4k && supportsVp9 ? "vp9" : null;
}

function canPublishVp9() {
  if (typeof globalThis.RTCRtpSender === "undefined") return false;
  try {
    return supportsVP9();
  } catch (_) {
    return false;
  }
}

export function buildScreensharePublishOptions(captureRequest = null, {
  privateOneToOne = false,
  privateTransportProfile = PRIVATE_ONE_TO_ONE_SCREENSHARE_DEFAULT_PROFILE,
  capturePath = "chromium_compatibility",
  nativeHighMotionExperimentEnabled = false,
  hardwareH264Available = null,
} = {}) {
  const metrics = readCaptureRequestMetrics(captureRequest);
  const maxFramerate = Number(metrics.requestedFps || 30) > 0
    ? Math.max(15, Math.round(Number(metrics.requestedFps || 30)))
    : 30;
  const compatibilityMaxBitrate = deriveScreensharePublishMaxBitrate({
    requestedQuality: metrics.requestedQuality || "",
    requestedWidth: Number(metrics.requestedWidth || 0) || 0,
    requestedHeight: Number(metrics.requestedHeight || 0) || 0,
    requestedFps: maxFramerate,
  });
  const normalizedPrivateProfile = normalizePrivateOneToOneScreenshareProfile(privateTransportProfile);
  const requestedQuality = normalizeScreenshareQualityPreset(metrics.requestedQuality || "");
  const privateHighMotion720 = privateOneToOne === true
    && maxFramerate >= 50
    && requestedQuality === "720p"
    && Number(metrics.requestedHeight || 0) > 0
    && Number(metrics.requestedHeight || 0) <= 720;
  const normalizedCapturePath = String(capturePath || "").trim().toLowerCase() || "chromium_compatibility";
  const nativeHighMotionBitrateExperiment = privateHighMotion720
    && nativeHighMotionExperimentEnabled === true
    && normalizedCapturePath === "native_high_motion";
  const maxBitrate = nativeHighMotionBitrateExperiment
    ? PRIVATE_NATIVE_HIGH_MOTION_720P60_MAX_BITRATE
    : compatibilityMaxBitrate;
  const fixedHighQualityMode = requestedQuality === "1440p"
    || requestedQuality === "2160p"
    || requestedQuality === "source"
    || (requestedQuality === "1080p" && maxFramerate >= 50);
  const effectivePrivateProfile = fixedHighQualityMode && privateOneToOne === true
    ? "single_fixed_quality_maintain_resolution"
    : (privateHighMotion720
      ? "single_720p60_h264_maintain_framerate"
      : normalizedPrivateProfile);
  const privateSingleLayer = privateOneToOne === true && normalizedPrivateProfile !== "simulcast_balanced";
  const privateAdaptive1080 = privateSingleLayer
    && maxFramerate === 30
    && requestedQuality === "1080p"
    && Number(metrics.requestedHeight || 0) > 720
    && Number(metrics.requestedHeight || 0) <= 1080;
  const simulcast = privateSingleLayer ? false : maxFramerate < 60;
  const degradationPreference = fixedHighQualityMode
    ? "maintain-resolution"
    : (privateOneToOne === true
      ? ([
      "single_maintain_framerate",
      "single_720p60_maintain_framerate",
      "single_720p60_h264_maintain_framerate",
    ].includes(effectivePrivateProfile)
      ? "maintain-framerate"
      : "balanced")
      : "balanced");
  const preferredHighResolutionCodec = deriveScreensharePreferredVideoCodec({
    requestedQuality,
    requestedWidth: Number(metrics.requestedWidth || 0) || 0,
    requestedHeight: Number(metrics.requestedHeight || 0) || 0,
    supportsVp9: canPublishVp9(),
  });
  const hardwareAccelerated1440p60 = privateOneToOne !== true
    && requestedQuality === "1440p"
    && maxFramerate >= 50
    && (hardwareH264Available == null
      ? !!selectH264CodecCapability(globalThis.RTCRtpSender?.getCapabilities?.("video")?.codecs || [])
      : hardwareH264Available === true);
  const videoCodec = hardwareAccelerated1440p60
    ? "h264"
    : (privateHighMotion720
      ? PRIVATE_720P60_EXPERIMENTAL_VIDEO_CODEC
      : preferredHighResolutionCodec);
  return {
    publishOptions: {
      source: Track.Source.ScreenShare,
      stopOnMute: false,
      simulcast,
      ...(videoCodec ? { videoCodec } : {}),
      ...(preferredHighResolutionCodec ? { backupCodec: true } : {}),
      // livekit-client deliberately ignores videoEncoding for a ScreenShare
      // source. screenShareEncoding is the supported screen publication
      // contract; omitting it silently falls back to h1080fps15.
      screenShareEncoding: {
        maxFramerate,
        maxBitrate: privateAdaptive1080 ? 2_500_000 : maxBitrate,
        priority: privateHighMotion720 ? "high" : "medium",
        ...(privateAdaptive1080 ? { scaleResolutionDownBy: 1.5 } : {}),
      },
      degradationPreference,
    },
    diagnostics: {
      ...metrics,
      maxFramerate,
      maxBitrate,
      initialMaxBitrate: privateAdaptive1080 ? 2_500_000 : maxBitrate,
      initialScaleResolutionDownBy: privateAdaptive1080 ? 1.5 : 1,
      adaptiveStartup: privateAdaptive1080,
      simulcast,
      privateOneToOne: privateOneToOne === true,
      privateTransportProfile: privateOneToOne === true ? effectivePrivateProfile : null,
      degradationPreference,
      requestedVideoCodec: videoCodec || null,
      backupCodec: preferredHighResolutionCodec ? "vp8" : null,
      hardwareAccelerated1440p60,
      capturePath: normalizedCapturePath,
      nativeHighMotionBitrateExperiment,
    },
  };
}

export function readH264ProfileLevelId(codecOrFmtp = null) {
  const fmtp = typeof codecOrFmtp === "string"
    ? codecOrFmtp
    : String(codecOrFmtp?.sdpFmtpLine || codecOrFmtp?.fmtp || "");
  return /(?:^|;)\s*profile-level-id=([0-9a-f]{6})(?:;|$)/i.exec(fmtp)?.[1]?.toLowerCase() || null;
}

export function selectH264CodecCapability(capabilities = [], {
  profileLevelId = PRIVATE_NATIVE_H264_HARDWARE_PROFILE_LEVEL_ID,
} = {}) {
  const requestedProfile = String(profileLevelId || "").trim().toLowerCase();
  return (Array.isArray(capabilities) ? capabilities : []).find((codec) => (
    String(codec?.mimeType || "").trim().toLowerCase() === "video/h264"
    && String(codec?.sdpFmtpLine || "").toLowerCase().includes("packetization-mode=1")
    && readH264ProfileLevelId(codec) === requestedProfile
  )) || null;
}

export function installPrivateNativeH264CodecPreference({
  room = null,
  captureTrack = null,
  enabled = false,
  privateOneToOne = false,
  capturePath = "",
  streamPreset = "",
  requestedVideoCodec = "",
  hardwareAccelerated1440p60 = false,
  scope = globalThis,
} = {}) {
  const serverVoice1440p60 = hardwareAccelerated1440p60 === true
    && privateOneToOne !== true
    && String(streamPreset || "").trim().toLowerCase() === "1440p60";
  let diagnostics = {
    prototypeOnly: !serverVoice1440p60,
    enabled: enabled === true,
    policyScope: serverVoice1440p60 ? "server_voice_1440p60" : "private_native_720p60",
    profileLevelId: PRIVATE_NATIVE_H264_HARDWARE_PROFILE_LEVEL_ID,
    preferenceMethod: "RTCRtpTransceiver.setCodecPreferences",
    liveKitHook: "ParticipantEvent.LocalSenderCreated",
    liveKitTransceiverLookup: "internal_dev_only_exact_sender_match",
    capabilityPresent: false,
    listenerInstalled: false,
    senderEventReached: false,
    captureTrackMatched: false,
    transceiverFound: false,
    applied: false,
    rejectionReason: null,
  };
  let handler = null;
  const participant = room?.localParticipant || null;
  const snapshot = () => ({ ...diagnostics });
  const setRejection = (rejectionReason) => {
    diagnostics = { ...diagnostics, applied: false, rejectionReason };
    return { getDiagnostics: snapshot, cleanup: () => {} };
  };

  if (enabled !== true) return setRejection("dev_experiment_disabled");
  if (!serverVoice1440p60) {
    if (privateOneToOne !== true) return setRejection("private_one_to_one_required");
    if (String(capturePath || "").trim().toLowerCase() !== "native_high_motion") {
      return setRejection("native_high_motion_capture_required");
    }
    if (String(streamPreset || "").trim().toLowerCase() !== "720p60") {
      return setRejection("native_720p60_required");
    }
  }
  if (String(requestedVideoCodec || "").trim().toLowerCase() !== "h264") {
    return setRejection("h264_required");
  }
  if (!captureTrack || !participant || typeof participant.on !== "function" || typeof participant.off !== "function") {
    return setRejection("livekit_sender_hook_unavailable");
  }
  const capabilities = scope?.RTCRtpSender?.getCapabilities?.("video")?.codecs || [];
  const capability = selectH264CodecCapability(capabilities);
  if (!capability) return setRejection("h264_42001f_capability_unavailable");
  diagnostics = {
    ...diagnostics,
    capabilityPresent: true,
    capabilityFmtp: String(capability.sdpFmtpLine || "").slice(0, 200) || null,
  };

  const cleanup = () => {
    if (!handler) return;
    try { participant.off(ParticipantEvent.LocalSenderCreated, handler); } catch (_) {}
    handler = null;
  };
  handler = (sender, localTrack) => {
    diagnostics = { ...diagnostics, senderEventReached: true };
    const mediaTrack = localTrack?.mediaStreamTrack || localTrack || null;
    if (mediaTrack !== captureTrack) return;
    diagnostics = { ...diagnostics, captureTrackMatched: true };
    const publisher = room?.engine?.pcManager?.publisher || null;
    const transceiver = (publisher?.getTransceivers?.() || [])
      .find((candidate) => candidate?.sender === sender) || null;
    diagnostics = { ...diagnostics, transceiverFound: !!transceiver };
    if (!transceiver || typeof transceiver.setCodecPreferences !== "function") {
      diagnostics = { ...diagnostics, rejectionReason: "publisher_transceiver_unavailable" };
      cleanup();
      return;
    }
    try {
      transceiver.setCodecPreferences([capability]);
      diagnostics = {
        ...diagnostics,
        applied: true,
        rejectionReason: null,
      };
    } catch (error) {
      diagnostics = {
        ...diagnostics,
        applied: false,
        rejectionReason: String(error?.name || "set_codec_preferences_failed").slice(0, 100),
      };
    }
    cleanup();
  };
  participant.on(ParticipantEvent.LocalSenderCreated, handler);
  diagnostics = { ...diagnostics, listenerInstalled: true };
  return { getDiagnostics: snapshot, cleanup };
}

export function normalizeNativeWebrtcContentionMode(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(NATIVE_WEBRTC_CONTENTION_MODE).includes(normalized) ? normalized : "";
}

export function normalizeNativeWebrtcAttachmentStrategy(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(NATIVE_WEBRTC_ATTACHMENT_STRATEGY).includes(normalized) ? normalized : "";
}

function readSafeVideoTrackState(track = null) {
  const read = (method) => {
    try {
      const value = track?.[method]?.();
      return value && typeof value === "object" ? value : {};
    } catch (_) {
      return {};
    }
  };
  const settings = read("getSettings");
  const constraints = read("getConstraints");
  const capabilities = read("getCapabilities");
  const numericOrNull = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const safeConstraint = (value) => {
    if (value != null && Number.isFinite(Number(value))) return Number(value);
    if (!value || typeof value !== "object") return null;
    const entries = ["exact", "ideal", "min", "max"]
      .filter((key) => value[key] != null && Number.isFinite(Number(value[key])))
      .map((key) => [key, Number(value[key])]);
    return entries.length ? Object.fromEntries(entries) : null;
  };
  const safeCapability = (value) => {
    if (!value || typeof value !== "object") return null;
    const out = {};
    if (Number.isFinite(Number(value.min))) out.min = Number(value.min);
    if (Number.isFinite(Number(value.max))) out.max = Number(value.max);
    return Object.keys(out).length ? out : null;
  };
  return {
    readyState: String(track?.readyState || "").trim() || null,
    contentHint: String(track?.contentHint || "").trim() || null,
    settings: {
      width: numericOrNull(settings.width),
      height: numericOrNull(settings.height),
      frameRate: numericOrNull(settings.frameRate),
      aspectRatio: numericOrNull(settings.aspectRatio),
      resizeMode: String(settings.resizeMode || "").trim() || null,
    },
    constraints: {
      width: safeConstraint(constraints.width),
      height: safeConstraint(constraints.height),
      frameRate: safeConstraint(constraints.frameRate),
      aspectRatio: safeConstraint(constraints.aspectRatio),
    },
    capabilities: {
      width: safeCapability(capabilities.width),
      height: safeCapability(capabilities.height),
      frameRate: safeCapability(capabilities.frameRate),
      aspectRatio: safeCapability(capabilities.aspectRatio),
    },
  };
}

function readUnnegotiatedSenderState(sender = null, transceiver = null) {
  return {
    ...readScreenshareSenderParameters(sender),
    trackAttached: !!sender?.track,
    transceiver: transceiver ? {
      direction: String(transceiver.direction || "").trim() || null,
      currentDirection: String(transceiver.currentDirection || "").trim() || null,
      mid: String(transceiver.mid || "").trim() || null,
    } : null,
  };
}

function summarizeLocalH264Sdp(description = null) {
  const lines = String(description?.sdp || "").split(/\r?\n/);
  const codecs = new Map();
  lines.forEach((line) => {
    const match = /^a=rtpmap:(\d+)\s+h264\/90000$/i.exec(line);
    if (!match) return;
    codecs.set(Number(match[1]), { payloadType: Number(match[1]), fmtp: null, profileLevelId: null });
  });
  lines.forEach((line) => {
    const match = /^a=fmtp:(\d+)\s+(.+)$/i.exec(line);
    const codec = match ? codecs.get(Number(match[1])) : null;
    if (!codec) return;
    codec.fmtp = String(match[2] || "").slice(0, 300) || null;
    codec.profileLevelId = readH264ProfileLevelId(codec.fmtp);
  });
  return [...codecs.values()];
}

function countLocalVideoOutboundStats(report = null) {
  let count = 0;
  try {
    report?.forEach?.((entry) => {
      if (
        entry?.type === "outbound-rtp"
        && entry?.isRemote !== true
        && String(entry?.kind || entry?.mediaType || "").toLowerCase() === "video"
      ) count += 1;
    });
  } catch (_) {}
  return count;
}

function waitForPeerConnectionState(peer = null, {
  expected = "connected",
  timeoutMs = 8_000,
} = {}) {
  if (peer?.connectionState === expected) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("local_peer_connection_timeout"));
    }, Math.max(1_000, Number(timeoutMs) || 8_000));
    const onStateChanged = () => {
      if (peer?.connectionState !== expected) return;
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      try { peer?.removeEventListener?.("connectionstatechange", onStateChanged); } catch (_) {}
    };
    try { peer?.addEventListener?.("connectionstatechange", onStateChanged); } catch (_) {}
  });
}

async function waitForIceGatheringComplete(peer = null, timeoutMs = 4_000) {
  if (!peer || peer.iceGatheringState === "complete") return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, Math.max(1_000, Number(timeoutMs) || 4_000));
    const onStateChanged = () => {
      if (peer.iceGatheringState !== "complete") return;
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      try { peer.removeEventListener?.("icegatheringstatechange", onStateChanged); } catch (_) {}
    };
    try { peer.addEventListener?.("icegatheringstatechange", onStateChanged); } catch (_) {}
  });
}

async function negotiateBoundedLocalPeerLoopback(senderPeer, receiverPeer) {
  const offer = await senderPeer.createOffer();
  await senderPeer.setLocalDescription(offer);
  await waitForIceGatheringComplete(senderPeer);
  await receiverPeer.setRemoteDescription(senderPeer.localDescription);
  const answer = await receiverPeer.createAnswer();
  await receiverPeer.setLocalDescription(answer);
  await waitForIceGatheringComplete(receiverPeer);
  await senderPeer.setRemoteDescription(receiverPeer.localDescription);
  await waitForPeerConnectionState(senderPeer);
}

export async function runNativeWebrtcContentionProbe({
  mode = "",
  track = null,
  measureNativeStages = null,
  durationMs = 5000,
  warmupMs = 1000,
  scope = globalThis,
} = {}) {
  const normalizedMode = normalizeNativeWebrtcContentionMode(mode);
  if (!NATIVE_WEBRTC_LOCAL_MODES.has(normalizedMode)) {
    return { status: "unavailable", reason: "local_contention_mode_required", mode: normalizedMode || null };
  }
  if (!track || String(track?.kind || "").toLowerCase() !== "video") {
    return { status: "unavailable", reason: "active_native_video_track_required", mode: normalizedMode };
  }
  if (typeof measureNativeStages !== "function") {
    return { status: "unavailable", reason: "native_stage_measurement_required", mode: normalizedMode };
  }
  const boundedDurationMs = Math.min(20_000, Math.max(1_000, Math.round(Number(durationMs) || 5000)));
  const boundedWarmupMs = Math.min(10_000, Math.max(0, Math.round(Number(warmupMs) || 0)));
  const startedAt = new Date().toISOString();
  const trackReadyStateBefore = String(track.readyState || "").trim() || null;
  let senderPeer = null;
  let receiverPeer = null;
  let transceiver = null;
  let receivedTrack = null;
  let result = null;
  const cleanup = {
    senderTrackDetached: false,
    transceiverStopped: false,
    senderPeerClosed: false,
    receiverPeerClosed: false,
    publishingTrackStopped: false,
  };

  try {
    if (normalizedMode === NATIVE_WEBRTC_CONTENTION_MODE.NO_WEBRTC) {
      if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
      const [nativeStages, rawGeneratedTrack] = await Promise.all([
        measureNativeStages({ durationMs: boundedDurationMs, warmupMs: 0 }),
        measureRawVideoTrackCadence(track, { durationMs: boundedDurationMs }),
      ]);
      result = {
        status: nativeStages?.status === "sampled" ? "sampled" : "unavailable",
        mode: normalizedMode,
        prototypeOnly: true,
        nativeStages,
        rawGeneratedTrack,
        rtc: null,
        attachment: {
          peerConnectionCount: 0,
          trackAttached: false,
          offerCreated: false,
          negotiated: false,
          activeEncoding: false,
        },
      };
    } else {
      const PeerConnection = scope?.RTCPeerConnection;
      if (typeof PeerConnection !== "function") {
        throw new Error("rtc_peer_connection_unavailable");
      }
      senderPeer = new PeerConnection();
      const sendEncodings = [{
        maxBitrate: PRIVATE_NATIVE_HIGH_MOTION_720P60_MAX_BITRATE,
        maxFramerate: 60,
        priority: "high",
      }];
      transceiver = senderPeer.addTransceiver(track, {
        direction: "sendonly",
        streams: [new scope.MediaStream([track])],
        sendEncodings,
      });

      if (normalizedMode === NATIVE_WEBRTC_CONTENTION_MODE.WEBRTC_ATTACHED_NO_ACTIVE_ENCODING) {
        if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
        const [nativeStages, rawGeneratedTrack] = await Promise.all([
          measureNativeStages({ durationMs: boundedDurationMs, warmupMs: 0 }),
          measureRawVideoTrackCadence(track, { durationMs: boundedDurationMs }),
        ]);
        const report = await transceiver.sender.getStats();
        result = {
          status: nativeStages?.status === "sampled" ? "sampled" : "unavailable",
          mode: normalizedMode,
          prototypeOnly: true,
          nativeStages,
          rawGeneratedTrack,
          rtc: null,
          attachment: {
            peerConnectionCount: 1,
            trackAttached: transceiver.sender.track === track,
            offerCreated: false,
            negotiated: false,
            activeEncoding: false,
            outboundVideoStatsCount: countLocalVideoOutboundStats(report),
          },
        };
      } else {
        const profileLevelId = normalizedMode === NATIVE_WEBRTC_CONTENTION_MODE.LOCAL_WEBRTC_NVIDIA
          ? PRIVATE_NATIVE_H264_HARDWARE_PROFILE_LEVEL_ID
          : PRIVATE_NATIVE_H264_SOFTWARE_PROFILE_LEVEL_ID;
        const capabilities = scope?.RTCRtpSender?.getCapabilities?.("video")?.codecs || [];
        const capability = selectH264CodecCapability(capabilities, { profileLevelId });
        if (!capability || typeof transceiver.setCodecPreferences !== "function") {
          throw new Error(capability ? "set_codec_preferences_unavailable" : `h264_${profileLevelId}_capability_unavailable`);
        }
        transceiver.setCodecPreferences([capability]);
        const parameters = transceiver.sender.getParameters();
        parameters.degradationPreference = "maintain-framerate";
        await transceiver.sender.setParameters(parameters);
        receiverPeer = new PeerConnection();
        receiverPeer.ontrack = (event) => { receivedTrack = event?.track || null; };
        await negotiateBoundedLocalPeerLoopback(senderPeer, receiverPeer);
        if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
        const [nativeStages, rawGeneratedTrack, rtc] = await Promise.all([
          measureNativeStages({ durationMs: boundedDurationMs, warmupMs: 0 }),
          measureRawVideoTrackCadence(track, { durationMs: boundedDurationMs }),
          measureFreshRtcStatsCadence(() => transceiver.sender.getStats(), {
            direction: "sender",
            durationMs: boundedDurationMs,
          }),
        ]);
        result = {
          status: nativeStages?.status === "sampled" ? "sampled" : "unavailable",
          mode: normalizedMode,
          prototypeOnly: true,
          requested: {
            codec: "video/H264",
            profileLevelId,
            maxBitrate: PRIVATE_NATIVE_HIGH_MOTION_720P60_MAX_BITRATE,
            maxFramerate: 60,
            simulcast: false,
            degradationPreference: "maintain-framerate",
          },
          nativeStages,
          rawGeneratedTrack,
          rtc,
          sdp: {
            offeredH264: summarizeLocalH264Sdp(senderPeer.localDescription),
            answeredH264: summarizeLocalH264Sdp(senderPeer.remoteDescription),
          },
          attachment: {
            peerConnectionCount: 2,
            trackAttached: transceiver.sender.track === track,
            offerCreated: true,
            negotiated: true,
            activeEncoding: true,
            remoteTrackPresent: !!receivedTrack,
          },
        };
      }
    }
  } catch (error) {
    result = {
      status: "unavailable",
      reason: String(error?.message || error?.name || "local_webrtc_contention_probe_failed").slice(0, 160),
      mode: normalizedMode,
      prototypeOnly: true,
    };
  } finally {
    if (transceiver?.sender) {
      try {
        await transceiver.sender.replaceTrack(null);
        cleanup.senderTrackDetached = true;
      } catch (_) {}
    }
    try {
      transceiver?.stop?.();
      cleanup.transceiverStopped = !!transceiver;
    } catch (_) {}
    try { receivedTrack?.stop?.(); } catch (_) {}
    try {
      senderPeer?.close?.();
      cleanup.senderPeerClosed = !!senderPeer;
    } catch (_) {}
    try {
      receiverPeer?.close?.();
      cleanup.receiverPeerClosed = !!receiverPeer;
    } catch (_) {}
    cleanup.complete = (!senderPeer || cleanup.senderPeerClosed)
      && (!receiverPeer || cleanup.receiverPeerClosed)
      && (!transceiver || (cleanup.senderTrackDetached && cleanup.transceiverStopped));
    cleanup.sourceTrackPreserved = String(track.readyState || "").toLowerCase() !== "ended";
  }
  return {
    ...(result || { status: "unavailable", reason: "probe_result_unavailable", mode: normalizedMode }),
    sampleId: result?.sampleId || result?.nativeStages?.sampleId || null,
    startedAt,
    endedAt: new Date().toISOString(),
    requestedDurationMs: boundedDurationMs,
    warmupMs: boundedWarmupMs,
    sameFreshWindow: true,
    publishingTrackReadyStateBefore: trackReadyStateBefore,
    publishingTrackReadyStateAfter: String(track.readyState || "").trim() || null,
    cleanup,
  };
}

function classifyNativeAttachmentCadenceSteps(before = null, attached = null, detached = null, healthyFps = 55) {
  const fps = (sample) => Number(sample?.nativeStages?.cadence?.readbackReadyFps
    || sample?.nativeStages?.cadence?.readbackOutputFps
    || 0);
  const beforeFps = fps(before);
  const attachedFps = fps(attached);
  const detachedFps = fps(detached);
  if (beforeFps >= healthyFps && attachedFps > 0 && attachedFps < healthyFps && detachedFps >= healthyFps) {
    return "WEBRTC_ATTACHMENT_DEMAND_CONFIRMED_REVERSIBLE";
  }
  if (beforeFps >= healthyFps && attachedFps > 0 && attachedFps < healthyFps) {
    return "WEBRTC_ATTACHMENT_DEMAND_CONFIRMED_RECOVERY_PENDING";
  }
  if ([beforeFps, attachedFps, detachedFps].every((value) => value >= healthyFps)) {
    return "ATTACHMENT_PATH_HEALTHY_60";
  }
  if (beforeFps > 0 && beforeFps < healthyFps) return "BASELINE_NATIVE_CADENCE_LIMIT";
  return "INSUFFICIENT_ATTACHMENT_CADENCE_MEASUREMENT";
}

async function sampleNativeTrackWithoutCachedStats(track, measureNativeStages, durationMs) {
  const [nativeStages, rawGeneratedTrack] = await Promise.all([
    measureNativeStages({ durationMs, warmupMs: 0 }),
    measureRawVideoTrackCadence(track, { durationMs }),
  ]);
  return {
    nativeStages,
    rawGeneratedTrack,
    sampledAt: new Date().toISOString(),
    cachedDiagnosticsUsed: false,
  };
}

export async function runNativeWebrtcAttachmentCadenceSteps({
  strategy = NATIVE_WEBRTC_ATTACHMENT_STRATEGY.SENDONLY_TRANSCEIVER_60,
  track = null,
  measureNativeStages = null,
  durationMs = 5000,
  transitionWarmupMs = 1000,
  nativeTargetFps = 60,
  measureBaseline = true,
  scope = globalThis,
} = {}) {
  const normalizedStrategy = normalizeNativeWebrtcAttachmentStrategy(strategy);
  if (!normalizedStrategy) return { status: "unavailable", reason: "invalid_attachment_strategy" };
  if (!track || String(track?.kind || "").toLowerCase() !== "video") {
    return { status: "unavailable", reason: "active_native_video_track_required", strategy: normalizedStrategy };
  }
  if (typeof measureNativeStages !== "function") {
    return { status: "unavailable", reason: "native_stage_measurement_required", strategy: normalizedStrategy };
  }
  const PeerConnection = scope?.RTCPeerConnection;
  if (typeof PeerConnection !== "function" || typeof scope?.MediaStream !== "function") {
    return { status: "unavailable", reason: "rtc_attachment_runtime_unavailable", strategy: normalizedStrategy };
  }
  const boundedDurationMs = Math.min(20_000, Math.max(1_000, Math.round(Number(durationMs) || 5000)));
  const boundedWarmupMs = Math.min(10_000, Math.max(0, Math.round(Number(transitionWarmupMs) || 0)));
  const originalConstraints = (() => {
    try { return track.getConstraints?.() || {}; } catch (_) { return {}; }
  })();
  const startedAt = new Date().toISOString();
  let peer = null;
  let sender = null;
  let transceiver = null;
  let setParametersAttemptCount = 0;
  let constraintAttemptCount = 0;
  const cleanup = {
    senderTrackDetached: false,
    senderTrackNullVerified: false,
    transceiverStopped: false,
    transceiverDirectionAfterStop: null,
    transceiverCurrentDirectionAfterStop: null,
    peerClosed: false,
    peerConnectionStateAfterClose: null,
    peerSignalingStateAfterClose: null,
    peerClosedStateVerified: false,
    fullyDestroyed: false,
    constraintsRestored: false,
    sourceTrackPreserved: false,
  };
  let result = null;

  try {
    const before = measureBaseline === true
      ? await sampleNativeTrackWithoutCachedStats(track, measureNativeStages, boundedDurationMs)
      : null;
    const trackStateBeforeAttachment = readSafeVideoTrackState(track);
    let constraintControl = {
      attempted: false,
      applied: false,
      rejectionReason: null,
    };
    if (normalizedStrategy === NATIVE_WEBRTC_ATTACHMENT_STRATEGY.CONSTRAINT_CONTROL) {
      constraintControl = { ...constraintControl, attempted: true };
      constraintAttemptCount += 1;
      try {
        await track.applyConstraints({ frameRate: { ideal: 60, max: 60 } });
        constraintControl = { ...constraintControl, applied: true };
      } catch (error) {
        constraintControl = {
          ...constraintControl,
          rejectionReason: String(error?.name || error?.message || "apply_constraints_rejected").slice(0, 120),
        };
      }
    }

    peer = new PeerConnection();
    if (normalizedStrategy === NATIVE_WEBRTC_ATTACHMENT_STRATEGY.SENDONLY_TRANSCEIVER_60) {
      transceiver = peer.addTransceiver(track, {
        direction: "sendonly",
        streams: [new scope.MediaStream([track])],
        sendEncodings: [{ maxFramerate: 60 }],
      });
      sender = transceiver.sender;
    } else {
      sender = peer.addTrack(track, new scope.MediaStream([track]));
      transceiver = (peer.getTransceivers?.() || []).find((candidate) => candidate?.sender === sender) || null;
    }
    const attachedAt = new Date().toISOString();
    const trackStateImmediatelyAfterAttachment = readSafeVideoTrackState(track);
    const senderStateImmediatelyAfterAttachment = readUnnegotiatedSenderState(sender, transceiver);
    let preNegotiationSenderPolicy = {
      attempted: false,
      applied: false,
      rejectionReason: null,
      attemptedAt: null,
      completedAt: null,
    };
    if (normalizedStrategy === NATIVE_WEBRTC_ATTACHMENT_STRATEGY.PRE_NEGOTIATION_SENDER_PARAMETERS_60) {
      preNegotiationSenderPolicy = {
        ...preNegotiationSenderPolicy,
        attempted: true,
        attemptedAt: new Date().toISOString(),
      };
      setParametersAttemptCount += 1;
      try {
        const parameters = sender.getParameters();
        const encodings = Array.isArray(parameters?.encodings) ? parameters.encodings : [];
        if (!encodings.length) throw new Error("pre_negotiation_encoding_parameters_unavailable");
        encodings[0].maxFramerate = 60;
        parameters.degradationPreference = "maintain-framerate";
        await sender.setParameters(parameters);
        preNegotiationSenderPolicy = {
          ...preNegotiationSenderPolicy,
          applied: true,
          completedAt: new Date().toISOString(),
        };
      } catch (error) {
        preNegotiationSenderPolicy = {
          ...preNegotiationSenderPolicy,
          rejectionReason: String(error?.message || error?.name || "set_parameters_rejected").slice(0, 120),
          completedAt: new Date().toISOString(),
        };
      }
    }
    const senderStateBeforeMeasurement = readUnnegotiatedSenderState(sender, transceiver);
    if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
    const attached = await sampleNativeTrackWithoutCachedStats(track, measureNativeStages, boundedDurationMs);
    const outboundVideoStatsCount = countLocalVideoOutboundStats(await sender.getStats());
    const senderStateAfterMeasurement = readUnnegotiatedSenderState(sender, transceiver);

    try {
      await sender.replaceTrack(null);
      cleanup.senderTrackDetached = true;
      cleanup.senderTrackNullVerified = sender.track == null;
    } catch (_) {}
    try {
      transceiver?.stop?.();
      cleanup.transceiverStopped = !!transceiver;
      cleanup.transceiverDirectionAfterStop = String(transceiver?.direction || "").trim() || null;
      cleanup.transceiverCurrentDirectionAfterStop = String(transceiver?.currentDirection || "").trim() || null;
    } catch (_) {}
    try {
      peer.close();
      cleanup.peerClosed = true;
      cleanup.peerConnectionStateAfterClose = String(peer.connectionState || "").trim() || null;
      cleanup.peerSignalingStateAfterClose = String(peer.signalingState || "").trim() || null;
      cleanup.peerClosedStateVerified = cleanup.peerConnectionStateAfterClose === "closed"
        && cleanup.peerSignalingStateAfterClose === "closed";
    } catch (_) {}
    cleanup.fullyDestroyed = cleanup.senderTrackDetached
      && cleanup.senderTrackNullVerified
      && cleanup.transceiverStopped
      && cleanup.peerClosed
      && cleanup.peerClosedStateVerified;
    if (constraintControl.applied && typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints(originalConstraints);
        cleanup.constraintsRestored = true;
      } catch (_) {}
    } else {
      cleanup.constraintsRestored = true;
    }
    const detachedAt = new Date().toISOString();
    if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
    const detached = await sampleNativeTrackWithoutCachedStats(track, measureNativeStages, boundedDurationMs);
    const trackStateAfterDetach = readSafeVideoTrackState(track);
    const maxFramerateValues = [
      ...(senderStateImmediatelyAfterAttachment.encodings || []).map((entry) => entry.maxFramerate),
      ...(senderStateBeforeMeasurement.encodings || []).map((entry) => entry.maxFramerate),
      ...(senderStateAfterMeasurement.encodings || []).map((entry) => entry.maxFramerate),
    ].filter((value) => Number.isFinite(Number(value)));
    result = {
      status: "sampled",
      strategy: normalizedStrategy,
      prototypeOnly: true,
      startedAt,
      endedAt: new Date().toISOString(),
      requestedDurationMs: boundedDurationMs,
      transitionWarmupMs: boundedWarmupMs,
      steps: { before, attached, detached },
      state: {
        trackBeforeAttachment: trackStateBeforeAttachment,
        trackImmediatelyAfterAttachment: trackStateImmediatelyAfterAttachment,
        trackAfterDetach: trackStateAfterDetach,
        senderImmediatelyAfterAttachment: senderStateImmediatelyAfterAttachment,
        senderBeforeMeasurement: senderStateBeforeMeasurement,
        senderAfterMeasurement: senderStateAfterMeasurement,
      },
      ordering: {
        attachedAt,
        senderParametersAttemptedAt: preNegotiationSenderPolicy.attemptedAt,
        senderParametersCompletedAt: preNegotiationSenderPolicy.completedAt,
        attachedMeasurementStartedAt: attached.nativeStages?.startedAt || null,
        detachedAt,
      },
      attachment: {
        peerConnectionCount: 1,
        offerCreated: false,
        negotiated: false,
        activeEncoding: false,
        outboundVideoStatsCount,
      },
      preNegotiationSenderPolicy,
      constraintControl,
      attachmentCadenceControl: {
        nativeTargetFpsBefore: Number(nativeTargetFps || 0) || null,
        nativeTargetFpsAfter: Number(nativeTargetFps || 0) || null,
        nativeTargetFpsAttribution: "capture_request_and_fixed_native_helper_output",
        altaraReverseControlApplied: constraintControl.applied === true,
        reason: constraintControl.applied === true
          ? "dev_constraint_control_only"
          : "no_altara_native_reverse_control_path",
      },
      maxFramerate30Visible: maxFramerateValues.some((value) => Number(value) === 30),
      setParametersAttemptCount,
      constraintAttemptCount,
      classification: classifyNativeAttachmentCadenceSteps(before, attached, detached),
      sameCaptureSession: true,
      sameGeneratedTrack: true,
      cachedDiagnosticsUsed: false,
    };
  } catch (error) {
    result = {
      status: "unavailable",
      strategy: normalizedStrategy,
      prototypeOnly: true,
      startedAt,
      endedAt: new Date().toISOString(),
      reason: String(error?.message || error?.name || "attachment_cadence_probe_failed").slice(0, 160),
      setParametersAttemptCount,
      constraintAttemptCount,
    };
  } finally {
    if (sender && cleanup.senderTrackDetached !== true) {
      try {
        await sender.replaceTrack(null);
        cleanup.senderTrackDetached = true;
        cleanup.senderTrackNullVerified = sender.track == null;
      } catch (_) {}
    }
    if (transceiver && cleanup.transceiverStopped !== true) {
      try {
        transceiver.stop?.();
        cleanup.transceiverStopped = true;
        cleanup.transceiverDirectionAfterStop = String(transceiver.direction || "").trim() || null;
        cleanup.transceiverCurrentDirectionAfterStop = String(transceiver.currentDirection || "").trim() || null;
      } catch (_) {}
    }
    if (peer && cleanup.peerClosed !== true) {
      try {
        peer.close?.();
        cleanup.peerClosed = true;
        cleanup.peerConnectionStateAfterClose = String(peer.connectionState || "").trim() || null;
        cleanup.peerSignalingStateAfterClose = String(peer.signalingState || "").trim() || null;
        cleanup.peerClosedStateVerified = cleanup.peerConnectionStateAfterClose === "closed"
          && cleanup.peerSignalingStateAfterClose === "closed";
      } catch (_) {}
    }
    cleanup.fullyDestroyed = cleanup.senderTrackDetached
      && cleanup.senderTrackNullVerified
      && cleanup.transceiverStopped
      && cleanup.peerClosed
      && cleanup.peerClosedStateVerified;
    cleanup.sourceTrackPreserved = String(track.readyState || "").toLowerCase() !== "ended";
  }
  return { ...result, cleanup };
}

function readAttachmentPhaseFps(sample = null, key = "rendererReceivedFps") {
  const value = Number(sample?.nativeStages?.cadence?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function classifyNativeWebrtcAttachmentLifecycle(phases = {}, { healthyFps = 55 } = {}) {
  const read = (name, key = "rendererReceivedFps") => readAttachmentPhaseFps(phases?.[name], key);
  const a = read("A");
  const b = read("B");
  const c = read("C");
  const b2 = read("B2");
  const c2 = read("C2");
  const empty = read("EMPTY_PEER");
  const bTransport = read("B", "transportWrittenFps");
  const b2Transport = read("B2", "transportWrittenFps");
  const attachmentDegradedTwice = b !== null && b < healthyFps && b2 !== null && b2 < healthyFps;
  const cleanupRecoveredTwice = c !== null && c >= healthyFps && c2 !== null && c2 >= healthyFps;
  const emptyPeerHealthy = empty === null || empty >= healthyFps;
  const deliveryLossRepeated = bTransport >= healthyFps && b < healthyFps
    && b2Transport >= healthyFps && b2 < healthyFps;
  if (a >= healthyFps && attachmentDegradedTwice && cleanupRecoveredTwice && emptyPeerHealthy) {
    return deliveryLossRepeated
      ? "MAIN_TO_RENDERER_DELIVERY_CONTENTION"
      : "WEBRTC_TRACK_CONSUMER_CONTENTION";
  }
  if (a >= healthyFps && b !== null && b < healthyFps && c !== null && c < healthyFps) {
    return "PERSISTENT_RUNTIME_CONTENTION_AFTER_ATTACHMENT";
  }
  if ([a, b, c, b2, c2].every((value) => value !== null && value >= healthyFps)) {
    return "ATTACHMENT_LIFECYCLE_HEALTHY_60";
  }
  if ([a, b, c].filter((value) => value !== null).length === 3) {
    return "TRANSIENT_RUNTIME_VARIABILITY";
  }
  return "INSUFFICIENT_ATTACHMENT_LIFECYCLE_MEASUREMENT";
}

async function runEmptyPeerCadenceControl({
  track,
  measureNativeStages,
  durationMs,
  warmupMs,
  scope,
} = {}) {
  const peer = new scope.RTCPeerConnection();
  let result = null;
  let peerClosed = false;
  try {
    if (warmupMs > 0) await new Promise((resolve) => setTimeout(resolve, warmupMs));
    const sample = await sampleNativeTrackWithoutCachedStats(track, measureNativeStages, durationMs);
    result = {
      ...sample,
      control: "EMPTY_PEER",
      peerConnectionCount: 1,
      trackAttached: false,
      transceiverCount: Number(peer.getTransceivers?.()?.length || 0),
      offerCreated: false,
      negotiated: false,
      activeEncoding: false,
    };
  } finally {
    try {
      peer.close();
      peerClosed = true;
    } catch (_) {}
  }
  return {
    ...result,
    cleanup: {
      peerClosed,
      connectionStateAfterClose: String(peer.connectionState || "").trim() || null,
      signalingStateAfterClose: String(peer.signalingState || "").trim() || null,
    },
  };
}

export async function runNativeWebrtcAttachmentLifecycleProbe({
  strategy = NATIVE_WEBRTC_ATTACHMENT_STRATEGY.SENDONLY_TRANSCEIVER_60,
  track = null,
  measureNativeStages = null,
  durationMs = 5000,
  transitionWarmupMs = 4000,
  nativeTargetFps = 60,
  includeControls = true,
  scope = globalThis,
} = {}) {
  const startedAt = new Date().toISOString();
  const first = await runNativeWebrtcAttachmentCadenceSteps({
    strategy,
    track,
    measureNativeStages,
    durationMs,
    transitionWarmupMs,
    nativeTargetFps,
    measureBaseline: true,
    scope,
  });
  if (first?.status !== "sampled" || first?.cleanup?.fullyDestroyed !== true) {
    return {
      status: "unavailable",
      reason: first?.status !== "sampled" ? first?.reason || "first_attachment_cycle_failed" : "first_peer_not_fully_destroyed",
      first,
      startedAt,
      endedAt: new Date().toISOString(),
    };
  }
  const second = await runNativeWebrtcAttachmentCadenceSteps({
    strategy,
    track,
    measureNativeStages,
    durationMs,
    transitionWarmupMs,
    nativeTargetFps,
    measureBaseline: false,
    scope,
  });
  if (second?.status !== "sampled" || second?.cleanup?.fullyDestroyed !== true) {
    return {
      status: "unavailable",
      reason: second?.status !== "sampled" ? second?.reason || "second_attachment_cycle_failed" : "second_peer_not_fully_destroyed",
      first,
      second,
      startedAt,
      endedAt: new Date().toISOString(),
    };
  }
  const phases = {
    A: first.steps.before,
    B: first.steps.attached,
    C: first.steps.detached,
    B2: second.steps.attached,
    C2: second.steps.detached,
  };
  let emptyPeer = null;
  let cloneAttachment = null;
  let cloneCleanup = null;
  if (includeControls === true) {
    emptyPeer = await runEmptyPeerCadenceControl({
      track,
      measureNativeStages,
      durationMs,
      warmupMs: transitionWarmupMs,
      scope,
    });
    phases.EMPTY_PEER = emptyPeer;
    if (typeof track?.clone === "function") {
      const clone = track.clone();
      try {
        cloneAttachment = await runNativeWebrtcAttachmentCadenceSteps({
          strategy,
          track: clone,
          measureNativeStages,
          durationMs,
          transitionWarmupMs,
          nativeTargetFps,
          measureBaseline: false,
          scope,
        });
        phases.TRACK_CLONE_ATTACHMENT = cloneAttachment?.steps?.attached || null;
      } finally {
        try { clone.stop?.(); } catch (_) {}
        cloneCleanup = {
          cloneStopped: String(clone.readyState || "").toLowerCase() === "ended",
          originalTrackPreserved: String(track.readyState || "").toLowerCase() !== "ended",
        };
      }
    } else {
      cloneAttachment = { status: "unavailable", reason: "track_clone_unavailable" };
    }
  }
  const classification = classifyNativeWebrtcAttachmentLifecycle(phases);
  const bFps = readAttachmentPhaseFps(phases.B);
  const b2Fps = readAttachmentPhaseFps(phases.B2);
  const cFps = readAttachmentPhaseFps(phases.C);
  const c2Fps = readAttachmentPhaseFps(phases.C2);
  const emptyFps = readAttachmentPhaseFps(emptyPeer);
  const createdCount = 2 + (includeControls === true ? 1 : 0)
    + (cloneAttachment?.status === "sampled" ? 1 : 0);
  return {
    status: "sampled",
    prototypeOnly: true,
    strategy: normalizeNativeWebrtcAttachmentStrategy(strategy),
    startedAt,
    endedAt: new Date().toISOString(),
    requestedDurationMs: Number(durationMs),
    transitionWarmupMs: Number(transitionWarmupMs),
    sameCaptureSession: true,
    sameGeneratedTrack: true,
    sequence: ["A", "B", "C", "B2", "C2"],
    phases,
    cycles: { first, second },
    controls: { emptyPeer, cloneAttachment, cloneCleanup },
    controlSummaries: {
      emptyPeer: emptyPeer ? {
        generatedTrackFps: readAttachmentPhaseFps(emptyPeer, "generatedTrackFps"),
        rawOriginalTrackFps: Number(emptyPeer?.rawGeneratedTrack?.fps || 0) || null,
        trackAttached: false,
        cleanup: emptyPeer.cleanup ? { ...emptyPeer.cleanup } : null,
      } : null,
      trackCloneAttachment: cloneAttachment ? {
        originalGeneratedTrackFps: readAttachmentPhaseFps(cloneAttachment?.steps?.attached, "generatedTrackFps"),
        attachedCloneRawFps: Number(cloneAttachment?.steps?.attached?.rawGeneratedTrack?.fps || 0) || null,
        originalTrackPreserved: cloneCleanup?.originalTrackPreserved === true,
        cloneStopped: cloneCleanup?.cloneStopped === true,
      } : null,
    },
    repeatability: {
      attachmentDegradedTwice: bFps !== null && bFps < 55 && b2Fps !== null && b2Fps < 55,
      cleanupRecoveredTwice: cFps !== null && cFps >= 55 && c2Fps !== null && c2Fps >= 55,
      emptyPeerHealthy: !emptyPeer || (emptyFps !== null && emptyFps >= 55),
    },
    peerLifecycle: {
      createdCount,
      persistentPeerCount: 0,
      firstCleanup: { ...first.cleanup },
      secondCleanup: { ...second.cleanup },
      cloneCleanup: cloneAttachment?.cleanup ? { ...cloneAttachment.cleanup } : null,
    },
    sourceTrackPreserved: String(track?.readyState || "").toLowerCase() !== "ended",
    classification,
    cachedDiagnosticsUsed: false,
  };
}

function readNativeContentionSampleFps(sample = null, key = "") {
  const number = Number(sample?.[key]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function classifyNativeWebrtcContentionMatrix(samples = {}, { healthyFps = 55 } = {}) {
  const read = (mode) => samples?.[mode] || samples?.[String(mode || "").toLowerCase()] || null;
  const nativeReady = (mode) => readNativeContentionSampleFps(read(mode), "nativeReadyFps");
  const noWebrtc = nativeReady(NATIVE_WEBRTC_CONTENTION_MODE.NO_WEBRTC);
  const attached = nativeReady(NATIVE_WEBRTC_CONTENTION_MODE.WEBRTC_ATTACHED_NO_ACTIVE_ENCODING);
  const nvidia = nativeReady(NATIVE_WEBRTC_CONTENTION_MODE.LOCAL_WEBRTC_NVIDIA);
  const openH264 = nativeReady(NATIVE_WEBRTC_CONTENTION_MODE.LOCAL_WEBRTC_OPENH264);
  const liveKit = nativeReady(NATIVE_WEBRTC_CONTENTION_MODE.AUTHENTICATED_LIVEKIT_NVIDIA);
  if (noWebrtc !== null && noWebrtc < healthyFps) return "NATIVE_PIPELINE_BASELINE_LIMIT";
  if (noWebrtc >= healthyFps && attached !== null && attached < healthyFps) {
    return "WEBRTC_TRACK_ATTACHMENT_CONTENTION";
  }
  if (attached >= healthyFps && nvidia !== null && nvidia < healthyFps && openH264 >= healthyFps) {
    return "NVIDIA_WEBRTC_GPU_CONTENTION";
  }
  if (nvidia !== null && nvidia < healthyFps && openH264 !== null && openH264 < healthyFps) {
    return "GENERIC_WEBRTC_ENCODING_CONTENTION";
  }
  if (nvidia >= healthyFps && openH264 >= healthyFps && liveKit !== null && liveKit < healthyFps) {
    return "LIVEKIT_OR_NETWORK_FEEDBACK_INTERACTION";
  }
  if ([noWebrtc, attached, nvidia, openH264, liveKit].every((fps) => fps !== null && fps >= healthyFps)) {
    return "TRANSIENT_RUNTIME_CONTENTION";
  }
  return "INSUFFICIENT_REAL_SOURCE_MATRIX";
}

function resolveScreenshareSender(publicationOrSender = null) {
  if (publicationOrSender && typeof publicationOrSender.getParameters === "function") {
    return publicationOrSender;
  }
  return publicationOrSender?.track?.sender || null;
}

export function readScreenshareSenderParameters(publicationOrSender = null) {
  const sender = resolveScreenshareSender(publicationOrSender);
  let params = null;
  try {
    params = sender?.getParameters?.() || null;
  } catch (_) {
    params = null;
  }
  const encodings = Array.isArray(params?.encodings) ? params.encodings.filter(Boolean) : [];
  const encoding = encodings
    .slice()
    .sort((left, right) => Number(right?.maxBitrate || 0) - Number(left?.maxBitrate || 0))[0] || null;
  return {
    encodingCount: encodings.length,
    encodings: encodings.map((item) => ({
      rid: String(item?.rid || "").trim() || null,
      active: typeof item?.active === "boolean" ? item.active : null,
      maxFramerate: Number(item?.maxFramerate || 0) || null,
      maxBitrate: Number(item?.maxBitrate || 0) || null,
      scaleResolutionDownBy: Number(item?.scaleResolutionDownBy || 0) || null,
      scalabilityMode: String(item?.scalabilityMode || "").trim() || null,
      priority: String(item?.priority || "").trim() || null,
      networkPriority: String(item?.networkPriority || "").trim() || null,
    })),
    maxFramerate: Number(encoding?.maxFramerate || 0) || null,
    maxBitrate: Number(encoding?.maxBitrate || 0) || null,
    scaleResolutionDownBy: Number(encoding?.scaleResolutionDownBy || 0) || null,
    degradationPreference: String(params?.degradationPreference || "").trim() || null,
  };
}

export function summarizeScreensharePublisherSdp(description = null, {
  mid = null,
} = {}) {
  const sdp = String(description?.sdp || description || "");
  if (!sdp.trim()) {
    return Object.freeze({
      available: false,
      type: String(description?.type || "").trim() || null,
      mid: String(mid ?? "").trim() || null,
      direction: null,
      bandwidthLines: [],
      framerateLines: [],
      ridLines: [],
      simulcastLines: [],
      codecs: [],
    });
  }
  const sections = sdp.split(/(?=^m=)/m);
  const videoSections = sections.filter((section) => /^m=video\s/m.test(section));
  const normalizedMid = String(mid ?? "").trim();
  const section = videoSections.find((candidate) => (
    normalizedMid && new RegExp(`^a=mid:${normalizedMid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(candidate)
  )) || videoSections[0] || "";
  const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const direction = ["sendonly", "sendrecv", "recvonly", "inactive"]
    .find((value) => lines.includes(`a=${value}`)) || null;
  const rtpMapByPayload = new Map();
  lines.forEach((line) => {
    const match = /^a=rtpmap:(\d+)\s+([^/\s]+)\/(\d+)(?:\/(\d+))?$/i.exec(line);
    if (!match) return;
    rtpMapByPayload.set(match[1], {
      payloadType: Number(match[1]),
      name: String(match[2] || "").toUpperCase(),
      clockRate: Number(match[3]) || null,
      channels: Number(match[4]) || null,
      fmtp: null,
    });
  });
  lines.forEach((line) => {
    const match = /^a=fmtp:(\d+)\s+(.+)$/i.exec(line);
    const codec = match ? rtpMapByPayload.get(match[1]) : null;
    if (codec) codec.fmtp = String(match[2] || "").slice(0, 300) || null;
  });
  return Object.freeze({
    available: !!section,
    type: String(description?.type || "").trim() || null,
    mid: normalizedMid || (lines.find((line) => line.startsWith("a=mid:"))?.slice(6) || null),
    direction,
    bandwidthLines: lines.filter((line) => /^b=(?:AS|TIAS):/i.test(line)).slice(0, 4),
    framerateLines: lines.filter((line) => /^a=(?:framerate|imageattr):/i.test(line)).slice(0, 8),
    ridLines: lines.filter((line) => /^a=rid:/i.test(line)).slice(0, 6),
    simulcastLines: lines.filter((line) => /^a=simulcast:/i.test(line)).slice(0, 4),
    codecs: Array.from(rtpMapByPayload.values())
      .filter((codec) => !["RED", "ULPFEC", "FLEXFEC-03"].includes(codec.name))
      .slice(0, 16),
  });
}

function readScreensharePublisherSdp(room = null, publicationOrSender = null) {
  const sender = resolveScreenshareSender(publicationOrSender);
  try {
    const publisher = room?.engine?.pcManager?.publisher || null;
    const transceivers = publisher?.getTransceivers?.() || [];
    const transceiver = transceivers.find((candidate) => candidate?.sender === sender) || null;
    const description = publisher?.getLocalDescription?.() || null;
    const remoteDescription = publisher?.getRemoteDescription?.() || null;
    return {
      ...summarizeScreensharePublisherSdp(description, { mid: transceiver?.mid ?? null }),
      transceiverFound: !!transceiver,
      transceiverDirection: String(transceiver?.direction || "").trim() || null,
      transceiverCurrentDirection: String(transceiver?.currentDirection || "").trim() || null,
      remoteAnswer: summarizeScreensharePublisherSdp(remoteDescription, { mid: transceiver?.mid ?? null }),
    };
  } catch (_) {
    return {
      ...summarizeScreensharePublisherSdp(null),
      transceiverFound: false,
      transceiverDirection: null,
      transceiverCurrentDirection: null,
      remoteAnswer: summarizeScreensharePublisherSdp(null),
    };
  }
}

function readPublishedSenderEncoding(publication = null) {
  return readScreenshareSenderParameters(publication);
}

export async function applyPrivate720p60SenderPolicy(publicationOrSender = null, {
  reason = "post_publish",
  expectedMaxBitrate = PRIVATE_720P60_MAX_BITRATE,
} = {}) {
  const sender = resolveScreenshareSender(publicationOrSender);
  const before = readScreenshareSenderParameters(sender);
  if (!sender || typeof sender.getParameters !== "function") {
    return Object.freeze({
      applied: false,
      verified: false,
      mutationAttempted: false,
      reason: "sender_parameters_unavailable",
      triggerReason: String(reason || "post_publish").slice(0, 100),
      before,
      after: before,
    });
  }
  if (before.encodingCount !== 1) {
    return Object.freeze({
      applied: false,
      verified: false,
      mutationAttempted: false,
      reason: "single_encoding_required",
      triggerReason: String(reason || "post_publish").slice(0, 100),
      before,
      after: before,
    });
  }

  // This is deliberately an initial-encoding experiment. LiveKit receives the
  // selected cap in screenShareEncoding before creating the transceiver;
  // this post-publication path only verifies what the real sender retained.
  const after = before;
  const activeEncoding = after.encodings[0] || null;
  const expectedBitrate = Number(expectedMaxBitrate || 0) || PRIVATE_720P60_MAX_BITRATE;
  const retained = Number(activeEncoding?.maxFramerate || 0) >= 59
    && Number(activeEncoding?.maxBitrate || 0) === expectedBitrate
    && after.degradationPreference === "maintain-framerate";
  return Object.freeze({
    applied: false,
    verified: retained,
    mutationAttempted: false,
    reason: retained ? "sender_parameters_verified" : "sender_parameters_not_retained",
    triggerReason: String(reason || "post_publish").slice(0, 100),
    priorityWriteAttempted: false,
    networkPriorityWriteAttempted: false,
    requestedScaleResolutionDownBy: null,
    expectedMaxBitrate: expectedBitrate,
    before,
    after,
  });
}

function timestampToEpochMs(value = null) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function durationBetween(start = null, end = null) {
  const startMs = timestampToEpochMs(start);
  const endMs = timestampToEpochMs(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round(endMs - startMs);
}

function createScreensharePerformanceAttemptId(sequence = 0) {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch (_) {}
  return `${Date.now().toString(36)}-${Math.max(0, Number(sequence || 0)).toString(36)}`;
}

function normalizePublishedScreensharePreset(value = "", fallbackFpsPreset = "30") {
  const preset = normalizeScreenshareStreamPreset(value);
  if (preset === "source") return `source${normalizeScreenshareFpsPreset(fallbackFpsPreset)}`;
  return preset;
}

function buildScreensharePresetTrackName(streamPreset = "", fpsPreset = "30") {
  return `${SCREENSHARE_PRESET_TRACK_PREFIX}:${normalizePublishedScreensharePreset(streamPreset, fpsPreset)}`;
}

function parseScreensharePresetTrackName(value = "") {
  const raw = String(value || "").trim();
  const supportedPresets = "720p30|720p60|1080p30|1080p60|1440p30|1440p60|2160p30|2160p60|source30|source60";
  const standalone = new RegExp(`^${SCREENSHARE_PRESET_TRACK_PREFIX}:(${supportedPresets})$`, "i").exec(raw);
  if (standalone) return standalone[1].toLowerCase();
  const performance = new RegExp(`^${SCREENSHARE_PERFORMANCE_TRACK_PREFIX}:[a-z0-9-]{3,80}:\\d{13}:\\d{13}:(${supportedPresets})$`, "i")
    .exec(raw);
  return performance ? performance[1].toLowerCase() : null;
}

function buildScreensharePerformanceTrackName({
  attemptId = "",
  startClickedAt = null,
  publishStartedAt = null,
  streamPreset = "",
  fpsPreset = "30",
} = {}) {
  const id = String(attemptId || "").trim();
  const t0 = timestampToEpochMs(startClickedAt);
  const t4 = timestampToEpochMs(publishStartedAt);
  if (!id || !Number.isFinite(t0) || !Number.isFinite(t4)) return "";
  return `${SCREENSHARE_PERFORMANCE_TRACK_PREFIX}:${id}:${Math.round(t0)}:${Math.round(t4)}:${normalizePublishedScreensharePreset(streamPreset, fpsPreset)}`;
}

function parseScreensharePerformanceTrackName(value = "") {
  const match = new RegExp(`^${SCREENSHARE_PERFORMANCE_TRACK_PREFIX}:([a-z0-9-]{3,80}):(\\d{13}):(\\d{13})(?::(?:720p30|720p60|1080p30|1080p60|1440p30|1440p60|2160p30|2160p60|source30|source60))?$`, "i")
    .exec(String(value || "").trim());
  if (!match) return null;
  return {
    attemptId: match[1],
    startStreamingClickedAt: new Date(Number(match[2])).toISOString(),
    publishStartedAt: new Date(Number(match[3])).toISOString(),
  };
}

function statsReportValues(report = null) {
  const values = [];
  try {
    report?.forEach?.((entry) => values.push(entry));
  } catch (_) {}
  if (!values.length && report && typeof report === "object") {
    Object.values(report).forEach((entry) => {
      if (entry && typeof entry === "object") values.push(entry);
    });
  }
  return values;
}

export function readVideoRtcStatsSample(report = null, direction = "sender") {
  const values = statsReportValues(report);
  const primaryType = direction === "receiver" ? "inbound-rtp" : "outbound-rtp";
  const videoStreams = values
    .filter((entry) => (
      String(entry?.type || "") === primaryType
      && !entry?.isRemote
      && String(entry?.kind || entry?.mediaType || "").toLowerCase() === "video"
    ));
  const primary = videoStreams
    .slice()
    .sort((left, right) => {
      const leftArea = Number(left?.frameWidth || 0) * Number(left?.frameHeight || 0);
      const rightArea = Number(right?.frameWidth || 0) * Number(right?.frameHeight || 0);
      if (rightArea !== leftArea) return rightArea - leftArea;
      const leftFps = Number(left?.framesPerSecond || 0);
      const rightFps = Number(right?.framesPerSecond || 0);
      if (rightFps !== leftFps) return rightFps - leftFps;
      return Number(right?.bytesSent || right?.bytesReceived || 0) - Number(left?.bytesSent || left?.bytesReceived || 0);
    })[0] || null;
  if (!primary) return null;
  const remoteInboundStreams = direction === "sender"
    ? values.filter((entry) => (
      String(entry?.type || "") === "remote-inbound-rtp"
      && String(entry?.kind || entry?.mediaType || "").toLowerCase() === "video"
    ))
    : [];
  const transports = values.filter((entry) => String(entry?.type || "") === "transport");
  const transport = transports.find((entry) => !!entry?.selectedCandidatePairId) || transports[0] || null;
  const selectedCandidatePair = values.find((entry) => (
    String(entry?.type || "") === "candidate-pair"
    && (
      String(entry?.id || "") === String(transport?.selectedCandidatePairId || "")
      || (entry?.nominated === true && String(entry?.state || "") === "succeeded")
    )
  )) || null;
  const resolveCodec = (entry) => values.find((candidate) => (
    String(candidate?.type || "") === "codec"
    && String(candidate?.id || "") === String(entry?.codecId || "")
  )) || null;
  const codec = resolveCodec(primary);
  const mediaSource = direction === "sender"
    ? values.find((entry) => (
      String(entry?.type || "") === "media-source"
      && String(entry?.id || "") === String(primary?.mediaSourceId || "")
      && String(entry?.kind || entry?.mediaType || "").toLowerCase() === "video"
    )) || null
    : null;
  const selectedStream = (entry) => {
    const streamCodec = resolveCodec(entry);
    const relatedRemoteInbound = remoteInboundStreams.find((candidate) => (
      String(candidate?.id || "") === String(entry?.remoteId || "")
      || String(candidate?.localId || "") === String(entry?.id || "")
    )) || null;
    return {
      id: String(entry?.id || "").trim() || null,
      ssrc: String(entry?.ssrc || "").trim() || null,
      rid: String(entry?.rid || "").trim() || null,
      mid: String(entry?.mid || "").trim() || null,
      active: typeof entry?.active === "boolean" ? entry.active : null,
      width: Number(entry?.frameWidth || 0) || null,
      height: Number(entry?.frameHeight || 0) || null,
      framesPerSecond: Number(entry?.framesPerSecond || 0) || null,
      framesEncoded: Number.isFinite(Number(entry?.framesEncoded)) ? Number(entry.framesEncoded) : null,
      framesSent: Number.isFinite(Number(entry?.framesSent)) ? Number(entry.framesSent) : null,
      framesReceived: Number.isFinite(Number(entry?.framesReceived)) ? Number(entry.framesReceived) : null,
      framesDecoded: Number.isFinite(Number(entry?.framesDecoded)) ? Number(entry.framesDecoded) : null,
      framesDropped: Number(entry?.framesDropped || 0) || 0,
      bytes: Number(direction === "receiver" ? entry?.bytesReceived : entry?.bytesSent || 0) || 0,
      packets: Number(direction === "receiver" ? entry?.packetsReceived : entry?.packetsSent || 0) || 0,
      targetBitrate: Number(entry?.targetBitrate || 0) || null,
      encoderTargetBitrate: Number(entry?.targetBitrate || 0) || null,
      totalEncodeTime: Number(entry?.totalEncodeTime || 0) || 0,
      totalPacketSendDelay: Number(entry?.totalPacketSendDelay || 0) || 0,
      mediaSourceId: String(entry?.mediaSourceId || "").trim() || null,
      nackCount: Number(entry?.nackCount ?? relatedRemoteInbound?.nackCount ?? 0) || 0,
      pliCount: Number(entry?.pliCount ?? relatedRemoteInbound?.pliCount ?? 0) || 0,
      firCount: Number(entry?.firCount ?? relatedRemoteInbound?.firCount ?? 0) || 0,
      retransmittedPackets: Number(entry?.retransmittedPacketsSent || 0) || 0,
      remotePacketsLost: Number(relatedRemoteInbound?.packetsLost || 0) || 0,
      remoteRoundTripTimeSeconds: Number(relatedRemoteInbound?.roundTripTime || 0) || null,
      remoteJitterSeconds: Number(relatedRemoteInbound?.jitter || 0) || 0,
      scalabilityMode: String(entry?.scalabilityMode || "").trim() || null,
      codec: String(streamCodec?.mimeType || streamCodec?.name || "").trim() || null,
      codecPayloadType: Number.isFinite(Number(streamCodec?.payloadType))
        ? Number(streamCodec.payloadType)
        : null,
      codecFmtp: String(streamCodec?.sdpFmtpLine || "").trim().slice(0, 300) || null,
      encoderImplementation: String(entry?.encoderImplementation || "").trim() || null,
      decoderImplementation: String(entry?.decoderImplementation || "").trim() || null,
      qualityLimitationReason: String(entry?.qualityLimitationReason || "").trim() || null,
      qualityLimitationDurations: entry?.qualityLimitationDurations && typeof entry.qualityLimitationDurations === "object"
        ? {
          bandwidth: Number(entry.qualityLimitationDurations.bandwidth || 0) || 0,
          cpu: Number(entry.qualityLimitationDurations.cpu || 0) || 0,
          none: Number(entry.qualityLimitationDurations.none || 0) || 0,
          other: Number(entry.qualityLimitationDurations.other || 0) || 0,
        }
        : null,
      spatialLayerId: entry?.spatialLayerId != null && Number.isFinite(Number(entry.spatialLayerId))
        ? Number(entry.spatialLayerId)
        : null,
      temporalLayerId: entry?.temporalLayerId != null && Number.isFinite(Number(entry.temporalLayerId))
        ? Number(entry.temporalLayerId)
        : null,
    };
  };
  const primaryRemoteInbound = remoteInboundStreams.find((candidate) => (
    String(candidate?.id || "") === String(primary?.remoteId || "")
    || String(candidate?.localId || "") === String(primary?.id || "")
  )) || remoteInboundStreams[0] || null;
  return {
    sampledAt: new Date().toISOString(),
    statsTimestampMs: Number(primary?.timestamp || 0) || null,
    width: Number(primary?.frameWidth || 0) || null,
    height: Number(primary?.frameHeight || 0) || null,
    framesPerSecond: Number(primary?.framesPerSecond || 0) || null,
    framesEncoded: Number.isFinite(Number(primary?.framesEncoded)) ? Number(primary.framesEncoded) : null,
    framesSent: Number.isFinite(Number(primary?.framesSent)) ? Number(primary.framesSent) : null,
    framesReceived: Number.isFinite(Number(primary?.framesReceived)) ? Number(primary.framesReceived) : null,
    framesDecoded: Number.isFinite(Number(primary?.framesDecoded)) ? Number(primary.framesDecoded) : null,
    framesDropped: Number(primary?.framesDropped || 0) || 0,
    bytes: Number(direction === "receiver" ? primary?.bytesReceived : primary?.bytesSent || 0) || 0,
    packetsLost: Number(primary?.packetsLost ?? primaryRemoteInbound?.packetsLost ?? 0) || 0,
    jitterSeconds: Number(primary?.jitter ?? primaryRemoteInbound?.jitter ?? 0) || 0,
    roundTripTimeSeconds: Number(primaryRemoteInbound?.roundTripTime || 0) || null,
    qualityLimitationReason: String(primary?.qualityLimitationReason || "").trim() || null,
    codec: String(codec?.mimeType || codec?.name || "").trim() || null,
    codecPayloadType: Number.isFinite(Number(codec?.payloadType)) ? Number(codec.payloadType) : null,
    codecFmtp: String(codec?.sdpFmtpLine || "").trim().slice(0, 300) || null,
    decoderImplementation: String(primary?.decoderImplementation || "").trim() || null,
    encoderImplementation: String(primary?.encoderImplementation || "").trim() || null,
    mediaSource: mediaSource ? {
      id: String(mediaSource?.id || "").trim() || null,
      statsTimestampMs: Number(mediaSource?.timestamp || 0) || null,
      width: Number(mediaSource?.width || 0) || null,
      height: Number(mediaSource?.height || 0) || null,
      framesPerSecond: Number(mediaSource?.framesPerSecond || 0) || null,
      frames: Number.isFinite(Number(mediaSource?.frames))
        ? Number(mediaSource.frames)
        : (Number.isFinite(Number(mediaSource?.framesCaptured)) ? Number(mediaSource.framesCaptured) : null),
      framesCounterSource: Number.isFinite(Number(mediaSource?.frames))
        ? "media-source.frames"
        : (Number.isFinite(Number(mediaSource?.framesCaptured)) ? "media-source.framesCaptured" : null),
    } : null,
    selectedStream: selectedStream(primary),
    streamCount: videoStreams.length,
    streams: videoStreams.slice(0, 6).map(selectedStream),
    transport: transport ? {
      id: String(transport?.id || "").trim() || null,
      selectedCandidatePairId: String(transport?.selectedCandidatePairId || "").trim() || null,
      bytesSent: Number(transport?.bytesSent || 0) || 0,
      bytesReceived: Number(transport?.bytesReceived || 0) || 0,
      packetsSent: Number(transport?.packetsSent || 0) || 0,
      packetsReceived: Number(transport?.packetsReceived || 0) || 0,
      dtlsState: String(transport?.dtlsState || "").trim() || null,
    } : null,
    candidatePair: selectedCandidatePair ? {
      id: String(selectedCandidatePair?.id || "").trim() || null,
      state: String(selectedCandidatePair?.state || "").trim() || null,
      nominated: selectedCandidatePair?.nominated === true,
      availableOutgoingBitrate: Number(selectedCandidatePair?.availableOutgoingBitrate || 0) || null,
      currentRoundTripTimeSeconds: Number(selectedCandidatePair?.currentRoundTripTime || 0) || null,
      totalRoundTripTimeSeconds: Number(selectedCandidatePair?.totalRoundTripTime || 0) || null,
      bytesSent: Number(selectedCandidatePair?.bytesSent || 0) || 0,
      bytesReceived: Number(selectedCandidatePair?.bytesReceived || 0) || 0,
      packetsSent: Number(selectedCandidatePair?.packetsSent || 0) || 0,
      packetsReceived: Number(selectedCandidatePair?.packetsReceived || 0) || 0,
    } : null,
  };
}

export function summarizeBoundedVideoStats(samples = [], direction = "sender") {
  const safeSamples = (Array.isArray(samples) ? samples : []).filter(Boolean).slice(-SCREENSHARE_RTC_STATS_SAMPLE_COUNT);
  const first = safeSamples[0] || null;
  const last = safeSamples[safeSamples.length - 1] || null;
  const statsElapsedMs = durationBetween(first?.sampledAt, last?.sampledAt);
  const statsElapsedSeconds = Number(statsElapsedMs || 0) / 1000;
  const frameCounter = direction === "receiver" ? "framesDecoded" : "framesEncoded";
  const firstStreamKey = String(first?.selectedStream?.ssrc || first?.selectedStream?.rid || first?.selectedStream?.id || "");
  const lastStreamKey = String(last?.selectedStream?.ssrc || last?.selectedStream?.rid || last?.selectedStream?.id || "");
  const sameSelectedStream = (!firstStreamKey && !lastStreamKey) || firstStreamKey === lastStreamKey;
  const frameDelta = sameSelectedStream
    ? Math.max(0, Number(last?.[frameCounter] || 0) - Number(first?.[frameCounter] || 0))
    : 0;
  const bytesDelta = sameSelectedStream
    ? Math.max(0, Number(last?.bytes || 0) - Number(first?.bytes || 0))
    : 0;
  const firstMediaSourceKey = String(first?.mediaSource?.id || "");
  const lastMediaSourceKey = String(last?.mediaSource?.id || "");
  const sameMediaSource = direction === "sender"
    && !!firstMediaSourceKey
    && firstMediaSourceKey === lastMediaSourceKey;
  const firstMediaSourceFrames = Number(first?.mediaSource?.frames);
  const lastMediaSourceFrames = Number(last?.mediaSource?.frames);
  const hasMediaSourceFrameCounters = sameMediaSource
    && first?.mediaSource?.frames != null
    && last?.mediaSource?.frames != null
    && Number.isFinite(firstMediaSourceFrames)
    && Number.isFinite(lastMediaSourceFrames);
  const mediaSourceFrameDelta = hasMediaSourceFrameCounters
    ? Math.max(0, lastMediaSourceFrames - firstMediaSourceFrames)
    : null;
  const framesSentDelta = direction === "sender" && sameSelectedStream
    && first?.framesSent != null
    && last?.framesSent != null
    && Number.isFinite(Number(first?.framesSent))
    && Number.isFinite(Number(last?.framesSent))
    ? Math.max(0, Number(last.framesSent) - Number(first.framesSent))
    : null;
  const framesReceivedDelta = direction === "receiver" && sameSelectedStream
    && first?.framesReceived != null
    && last?.framesReceived != null
    && Number.isFinite(Number(first?.framesReceived))
    && Number.isFinite(Number(last?.framesReceived))
    ? Math.max(0, Number(last.framesReceived) - Number(first.framesReceived))
    : null;
  const streamKey = (stream = null) => String(stream?.ssrc || stream?.rid || stream?.id || "");
  const firstStreamsByKey = new Map(
    (Array.isArray(first?.streams) ? first.streams : [])
      .map((stream) => [streamKey(stream), stream])
      .filter(([key]) => !!key),
  );
  const encodings = (Array.isArray(last?.streams) ? last.streams : []).map((stream) => {
    const key = streamKey(stream);
    const before = key ? firstStreamsByKey.get(key) || null : null;
    const perEncodingFrameCounter = direction === "receiver" ? "framesDecoded" : "framesEncoded";
    const streamFrameDelta = before
      ? Math.max(0, Number(stream?.[perEncodingFrameCounter] || 0) - Number(before?.[perEncodingFrameCounter] || 0))
      : 0;
    const streamBytesDelta = before
      ? Math.max(0, Number(stream?.bytes || 0) - Number(before?.bytes || 0))
      : 0;
    const streamPacketsDelta = before
      ? Math.max(0, Number(stream?.packets || 0) - Number(before?.packets || 0))
      : 0;
    const encodeTimeDelta = before
      ? Math.max(0, Number(stream?.totalEncodeTime || 0) - Number(before?.totalEncodeTime || 0))
      : 0;
    const remotePacketsLostDelta = before
      ? Math.max(0, Number(stream?.remotePacketsLost || 0) - Number(before?.remotePacketsLost || 0))
      : null;
    return {
      ...stream,
      measuredFps: before && statsElapsedSeconds > 0
        ? Number((streamFrameDelta / statsElapsedSeconds).toFixed(1))
        : (Number(stream?.framesPerSecond || 0) || null),
      bitrateBps: before && statsElapsedSeconds > 0
        ? Math.round((streamBytesDelta * 8) / statsElapsedSeconds)
        : null,
      packetsPerSecond: before && statsElapsedSeconds > 0
        ? Number((streamPacketsDelta / statsElapsedSeconds).toFixed(1))
        : null,
      averageEncodeMsPerFrame: streamFrameDelta > 0
        ? Number(((encodeTimeDelta * 1000) / streamFrameDelta).toFixed(2))
        : null,
      remotePacketsLostDelta,
    };
  });
  const firstTransport = first?.transport || null;
  const lastTransport = last?.transport || null;
  const firstCandidatePair = first?.candidatePair || null;
  const lastCandidatePair = last?.candidatePair || null;
  return {
    status: safeSamples.length ? "sampled" : "unavailable",
    direction,
    bounded: true,
    sampleCount: safeSamples.length,
    sampleWindowMs: Number.isFinite(statsElapsedMs) ? statsElapsedMs : null,
    width: Number(last?.width || 0) || null,
    height: Number(last?.height || 0) || null,
    fps: statsElapsedSeconds > 0 && sameSelectedStream
      ? Number((frameDelta / statsElapsedSeconds).toFixed(1))
      : (Number(last?.framesPerSecond || 0) || null),
    mediaSource: last?.mediaSource ? { ...last.mediaSource } : null,
    mediaSourceFpsDelta: direction === "sender" && statsElapsedSeconds > 0 && mediaSourceFrameDelta != null
      ? Number((mediaSourceFrameDelta / statsElapsedSeconds).toFixed(1))
      : (direction === "sender" ? (Number(last?.mediaSource?.framesPerSecond || 0) || null) : null),
    mediaSourceCadenceSource: direction === "sender"
      ? (mediaSourceFrameDelta != null ? "media_source_frame_counter_delta" : "media_source_framesPerSecond")
      : null,
    outboundFramesEncodedPerSecond: direction === "sender" && statsElapsedSeconds > 0 && sameSelectedStream
      ? Number((frameDelta / statsElapsedSeconds).toFixed(1))
      : (direction === "sender" ? (Number(last?.framesPerSecond || 0) || null) : null),
    outboundFramesSentPerSecond: direction === "sender" && statsElapsedSeconds > 0 && framesSentDelta != null
      ? Number((framesSentDelta / statsElapsedSeconds).toFixed(1))
      : null,
    receiverFramesReceivedPerSecond: direction === "receiver" && statsElapsedSeconds > 0 && framesReceivedDelta != null
      ? Number((framesReceivedDelta / statsElapsedSeconds).toFixed(1))
      : null,
    receiverFramesDecodedPerSecond: direction === "receiver" && statsElapsedSeconds > 0 && sameSelectedStream
      ? Number((frameDelta / statsElapsedSeconds).toFixed(1))
      : (direction === "receiver" ? (Number(last?.framesPerSecond || 0) || null) : null),
    cadenceClassification: direction === "sender"
      ? classifyScreenshareCadence({
        mediaSourceFps: mediaSourceFrameDelta != null && statsElapsedSeconds > 0
          ? mediaSourceFrameDelta / statsElapsedSeconds
          : last?.mediaSource?.framesPerSecond,
        outboundFps: statsElapsedSeconds > 0 && sameSelectedStream
          ? frameDelta / statsElapsedSeconds
          : last?.framesPerSecond,
      })
      : null,
    bitrateBps: statsElapsedSeconds > 0 && sameSelectedStream
      ? Math.round((bytesDelta * 8) / statsElapsedSeconds)
      : null,
    framesEncoded: Number(last?.framesEncoded || 0) || null,
    framesSent: Number.isFinite(Number(last?.framesSent)) ? Number(last.framesSent) : null,
    framesReceived: Number.isFinite(Number(last?.framesReceived)) ? Number(last.framesReceived) : null,
    framesDecoded: Number(last?.framesDecoded || 0) || null,
    framesDropped: Number(last?.framesDropped || 0) || 0,
    packetsLost: Number(last?.packetsLost || 0) || 0,
    jitterMs: Number.isFinite(Number(last?.jitterSeconds)) ? Math.round(Number(last.jitterSeconds) * 1000) : null,
    roundTripTimeMs: Number.isFinite(Number(last?.roundTripTimeSeconds)) && Number(last.roundTripTimeSeconds) > 0
      ? Math.round(Number(last.roundTripTimeSeconds) * 1000)
      : null,
    qualityLimitationReason: last?.qualityLimitationReason || null,
    codec: last?.codec || null,
    codecPayloadType: Number.isFinite(Number(last?.codecPayloadType)) ? Number(last.codecPayloadType) : null,
    codecFmtp: String(last?.codecFmtp || "").trim() || null,
    decoderImplementation: last?.decoderImplementation || null,
    encoderImplementation: last?.encoderImplementation || null,
    electronRuntime: last?.electronRuntime ? { ...last.electronRuntime } : null,
    selectedStream: last?.selectedStream ? { ...last.selectedStream } : null,
    streamCount: Number(last?.streamCount || 0) || 0,
    selectedStreamChanged: !sameSelectedStream,
    streams: Array.isArray(last?.streams) ? last.streams.map((stream) => ({ ...stream })) : [],
    encodings,
    transport: lastTransport ? {
      ...lastTransport,
      bytesSentDelta: firstTransport
        ? Math.max(0, Number(lastTransport.bytesSent || 0) - Number(firstTransport.bytesSent || 0))
        : null,
      packetsSentDelta: firstTransport
        ? Math.max(0, Number(lastTransport.packetsSent || 0) - Number(firstTransport.packetsSent || 0))
        : null,
    } : null,
    candidatePair: lastCandidatePair ? {
      ...lastCandidatePair,
      currentRoundTripTimeMs: Number.isFinite(Number(lastCandidatePair.currentRoundTripTimeSeconds))
        ? Math.round(Number(lastCandidatePair.currentRoundTripTimeSeconds) * 1000)
        : null,
      totalRoundTripTimeMs: Number.isFinite(Number(lastCandidatePair.totalRoundTripTimeSeconds))
        ? Math.round(Number(lastCandidatePair.totalRoundTripTimeSeconds) * 1000)
        : null,
      bytesSentDelta: firstCandidatePair
        ? Math.max(0, Number(lastCandidatePair.bytesSent || 0) - Number(firstCandidatePair.bytesSent || 0))
        : null,
      packetsSentDelta: firstCandidatePair
        ? Math.max(0, Number(lastCandidatePair.packetsSent || 0) - Number(firstCandidatePair.packetsSent || 0))
        : null,
    } : null,
    samples: safeSamples.map((sample) => ({ ...sample })),
  };
}

export function classifyScreenshareCadence({
  mediaSourceFps = null,
  outboundFps = null,
  receiverFps = null,
  targetFps = 60,
} = {}) {
  const source = mediaSourceFps == null ? Number.NaN : Number(mediaSourceFps);
  const outbound = outboundFps == null ? Number.NaN : Number(outboundFps);
  const receiver = receiverFps == null ? Number.NaN : Number(receiverFps);
  const target = Math.max(1, Number(targetFps) || 60);
  const nearTarget = target * 0.84;
  const materiallyReduced = target * 0.76;
  if (
    Number.isFinite(source) && source >= nearTarget
    && Number.isFinite(outbound) && outbound >= nearTarget
    && Number.isFinite(receiver) && receiver < materiallyReduced
  ) {
    return "CASE_C_DOWNSTREAM_AFTER_OUTBOUND";
  }
  if (
    Number.isFinite(source) && source >= nearTarget
    && Number.isFinite(outbound) && outbound < materiallyReduced
  ) {
    return "CASE_A_AFTER_MEDIA_SOURCE_BEFORE_OUTBOUND";
  }
  if (
    Number.isFinite(source) && source < materiallyReduced
    && Number.isFinite(outbound) && outbound < materiallyReduced
  ) {
    return "CASE_B_CAPTURE_OR_MEDIA_SOURCE_CADENCE";
  }
  return "INCONCLUSIVE_OR_HEALTHY";
}

function normalizeTrueCadenceDurationMs(value = 2000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2000;
  return Math.max(500, Math.min(5000, Math.round(parsed)));
}

function positiveCounterDelta(afterValue, beforeValue) {
  if (afterValue == null || beforeValue == null) return null;
  const after = Number(afterValue);
  const before = Number(beforeValue);
  if (!Number.isFinite(after) || !Number.isFinite(before) || after < before) return null;
  return after - before;
}

function measuredRate(delta, durationMs) {
  if (delta == null || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) return null;
  return Number(((Number(delta) * 1000) / Number(durationMs)).toFixed(1));
}

function measuredBitrate(deltaBytes, durationMs) {
  if (deltaBytes == null || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) return null;
  return Math.round((Number(deltaBytes) * 8 * 1000) / Number(durationMs));
}

export function deriveScreenshareBitrateHeadroom({
  actualBitrate = null,
  encodedFps = null,
  targetFps = 60,
} = {}) {
  const bitrate = Number(actualBitrate);
  const fps = Number(encodedFps);
  const target = Number(targetFps);
  if (!Number.isFinite(bitrate) || bitrate <= 0 || !Number.isFinite(fps) || fps <= 0) {
    return Object.freeze({
      bitsPerEncodedFrame: null,
      estimatedBitrateFor60AtCurrentBitsPerFrame: null,
    });
  }
  const bitsPerEncodedFrame = bitrate / fps;
  return Object.freeze({
    bitsPerEncodedFrame: Math.round(bitsPerEncodedFrame),
    estimatedBitrateFor60AtCurrentBitsPerFrame: Number.isFinite(target) && target > 0
      ? Math.round(bitsPerEncodedFrame * target)
      : null,
  });
}

export function summarizeFreshRtcCadence(before = null, after = null, {
  direction = "sender",
  startedAt = null,
  endedAt = null,
} = {}) {
  const outboundElapsedMs = Number(after?.statsTimestampMs || 0) > Number(before?.statsTimestampMs || 0)
    ? Number(after.statsTimestampMs) - Number(before.statsTimestampMs)
    : durationBetween(startedAt, endedAt);
  const mediaSourceElapsedMs = Number(after?.mediaSource?.statsTimestampMs || 0) > Number(before?.mediaSource?.statsTimestampMs || 0)
    ? Number(after.mediaSource.statsTimestampMs) - Number(before.mediaSource.statsTimestampMs)
    : outboundElapsedMs;
  const sameStream = String(before?.selectedStream?.id || "")
    && String(before?.selectedStream?.id || "") === String(after?.selectedStream?.id || "");
  const sameMediaSource = String(before?.mediaSource?.id || "")
    && String(before?.mediaSource?.id || "") === String(after?.mediaSource?.id || "");
  const mediaSourceFramesDelta = sameMediaSource
    ? positiveCounterDelta(after?.mediaSource?.frames, before?.mediaSource?.frames)
    : null;
  const framesEncodedDelta = direction === "sender" && sameStream
    ? positiveCounterDelta(after?.framesEncoded, before?.framesEncoded)
    : null;
  const framesSentDelta = direction === "sender" && sameStream
    ? positiveCounterDelta(after?.framesSent, before?.framesSent)
    : null;
  const framesReceivedDelta = direction === "receiver" && sameStream
    ? positiveCounterDelta(after?.framesReceived, before?.framesReceived)
    : null;
  const framesDecodedDelta = direction === "receiver" && sameStream
    ? positiveCounterDelta(after?.framesDecoded, before?.framesDecoded)
    : null;
  const bytesDelta = sameStream ? positiveCounterDelta(after?.bytes, before?.bytes) : null;
  const totalEncodeTimeDelta = direction === "sender" && sameStream
    ? positiveCounterDelta(after?.selectedStream?.totalEncodeTime, before?.selectedStream?.totalEncodeTime)
    : null;
  const selected = after?.selectedStream || null;
  const outboundEncodedFps = measuredRate(framesEncodedDelta, outboundElapsedMs);
  const actualOutboundBitrate = measuredBitrate(bytesDelta, outboundElapsedMs);
  const outboundHeadroom = deriveScreenshareBitrateHeadroom({
    actualBitrate: actualOutboundBitrate,
    encodedFps: outboundEncodedFps,
    targetFps: 60,
  });
  return {
    direction,
    fresh: true,
    startedAt,
    endedAt,
    durationMs: durationBetween(startedAt, endedAt),
    outboundCounterDurationMs: Number.isFinite(Number(outboundElapsedMs)) ? Math.round(Number(outboundElapsedMs)) : null,
    mediaSourceCounterDurationMs: Number.isFinite(Number(mediaSourceElapsedMs)) ? Math.round(Number(mediaSourceElapsedMs)) : null,
    rtcMediaSource: direction === "sender" ? {
      present: !!after?.mediaSource,
      width: Number(after?.mediaSource?.width || 0) || null,
      height: Number(after?.mediaSource?.height || 0) || null,
      framesStart: before?.mediaSource?.frames ?? null,
      framesEnd: after?.mediaSource?.frames ?? null,
      framesDelta: mediaSourceFramesDelta,
      mediaSourceFramesDelta,
      framesPerSecondDelta: measuredRate(mediaSourceFramesDelta, mediaSourceElapsedMs),
      mediaSourceFramesPerSecondDelta: measuredRate(mediaSourceFramesDelta, mediaSourceElapsedMs),
      browserFramesPerSecond: Number(after?.mediaSource?.framesPerSecond || 0) || null,
      counterDurationMs: Number.isFinite(Number(mediaSourceElapsedMs)) ? Math.round(Number(mediaSourceElapsedMs)) : null,
    } : null,
    outbound: direction === "sender" ? {
      width: Number(after?.width || selected?.width || 0) || null,
      height: Number(after?.height || selected?.height || 0) || null,
      framesEncodedStart: before?.framesEncoded ?? null,
      framesEncodedEnd: after?.framesEncoded ?? null,
      framesEncodedDelta,
      framesEncodedPerSecondDelta: outboundEncodedFps,
      framesSentStart: before?.framesSent ?? null,
      framesSentEnd: after?.framesSent ?? null,
      framesSentDelta,
      framesSentPerSecondDelta: measuredRate(framesSentDelta, outboundElapsedMs),
      browserFramesPerSecond: Number(after?.framesPerSecond || selected?.framesPerSecond || 0) || null,
      bytesSentDelta: bytesDelta,
      bytesSentStart: before?.bytes ?? null,
      bytesSentEnd: after?.bytes ?? null,
      actualBitrateBps: actualOutboundBitrate,
      ...outboundHeadroom,
      totalEncodeTimeDelta,
      averageEncodeMsPerFrame: Number(framesEncodedDelta || 0) > 0 && totalEncodeTimeDelta !== null
        ? Number(((Number(totalEncodeTimeDelta) * 1000) / Number(framesEncodedDelta)).toFixed(3))
        : null,
      counterDurationMs: Number.isFinite(Number(outboundElapsedMs)) ? Math.round(Number(outboundElapsedMs)) : null,
      codec: after?.codec || selected?.codec || null,
      codecPayloadType: Number.isFinite(Number(after?.codecPayloadType)) ? Number(after.codecPayloadType) : null,
      codecFmtp: String(after?.codecFmtp || "").trim() || null,
      encoderImplementation: after?.encoderImplementation || selected?.encoderImplementation || null,
      qualityLimitationReason: after?.qualityLimitationReason || selected?.qualityLimitationReason || null,
      qualityLimitationDurations: selected?.qualityLimitationDurations
        ? { ...selected.qualityLimitationDurations }
        : null,
      framesDropped: Number(after?.framesDropped || selected?.framesDropped || 0) || 0,
      totalPacketSendDelay: Number(selected?.totalPacketSendDelay || 0) || 0,
    } : null,
    receiver: direction === "receiver" ? {
      width: Number(after?.width || selected?.width || 0) || null,
      height: Number(after?.height || selected?.height || 0) || null,
      framesReceivedStart: before?.framesReceived ?? null,
      framesReceivedEnd: after?.framesReceived ?? null,
      framesReceivedDelta,
      framesReceivedPerSecondDelta: measuredRate(framesReceivedDelta, outboundElapsedMs),
      framesDecodedStart: before?.framesDecoded ?? null,
      framesDecodedEnd: after?.framesDecoded ?? null,
      framesDecodedDelta,
      framesDecodedPerSecondDelta: measuredRate(framesDecodedDelta, outboundElapsedMs),
      browserFramesPerSecond: Number(after?.framesPerSecond || selected?.framesPerSecond || 0) || null,
      bytesReceivedDelta: bytesDelta,
      bytesReceivedStart: before?.bytes ?? null,
      bytesReceivedEnd: after?.bytes ?? null,
      actualBitrateBps: measuredBitrate(bytesDelta, outboundElapsedMs),
      counterDurationMs: Number.isFinite(Number(outboundElapsedMs)) ? Math.round(Number(outboundElapsedMs)) : null,
      codec: after?.codec || selected?.codec || null,
      codecPayloadType: Number.isFinite(Number(after?.codecPayloadType)) ? Number(after.codecPayloadType) : null,
      decoderImplementation: after?.decoderImplementation || selected?.decoderImplementation || null,
      framesDropped: Number(after?.framesDropped || selected?.framesDropped || 0) || 0,
      packetsLost: Number(after?.packetsLost || 0) || 0,
      jitterMs: Number.isFinite(Number(after?.jitterSeconds)) ? Math.round(Number(after.jitterSeconds) * 1000) : null,
    } : null,
    transport: {
      availableOutgoingBitrate: Number(after?.candidatePair?.availableOutgoingBitrate || 0) || null,
      qualityLimitationReason: after?.qualityLimitationReason || selected?.qualityLimitationReason || null,
      packetsLost: Number(after?.packetsLost || selected?.remotePacketsLost || 0) || 0,
      rttMs: Number(after?.roundTripTimeSeconds || selected?.remoteRoundTripTimeSeconds || 0) > 0
        ? Math.round(Number(after?.roundTripTimeSeconds || selected?.remoteRoundTripTimeSeconds) * 1000)
        : (Number(after?.candidatePair?.currentRoundTripTimeMs || 0) || null),
      nackCount: Number(selected?.nackCount || 0) || 0,
      pliCount: Number(selected?.pliCount || 0) || 0,
      firCount: Number(selected?.firCount || 0) || 0,
      retransmittedPacketsSent: Number(selected?.retransmittedPackets || 0) || 0,
    },
  };
}

export async function measureFreshRtcStatsCadence(getStats, {
  direction = "sender",
  durationMs = 2000,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof getStats !== "function") throw new Error("rtc_stats_getter_unavailable");
  const boundedDurationMs = normalizeTrueCadenceDurationMs(durationMs);
  const sampleId = createScreensharePerformanceAttemptId();
  const firstReport = await getStats();
  const first = readVideoRtcStatsSample(firstReport, direction);
  const startedAt = now();
  await wait(boundedDurationMs);
  const secondReport = await getStats();
  const endedAt = now();
  const second = readVideoRtcStatsSample(secondReport, direction);
  if (!first || !second) throw new Error("rtc_video_stats_unavailable");
  return {
    sampleId,
    ...summarizeFreshRtcCadence(first, second, { direction, startedAt, endedAt }),
  };
}

export async function measureRawVideoTrackCadence(track = null, {
  durationMs = 2000,
  MediaStreamTrackProcessorClass = globalThis.MediaStreamTrackProcessor,
  documentRef = globalThis.document,
  nowMonotonic = () => performance.now(),
  nowWall = () => new Date().toISOString(),
  scheduleTimeout = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelScheduledTimeout = (handle) => clearTimeout(handle),
} = {}) {
  const boundedDurationMs = normalizeTrueCadenceDurationMs(durationMs);
  const sampleId = createScreensharePerformanceAttemptId();
  const sourceReadyStateBefore = String(track?.readyState || "").trim() || null;
  if (!track || String(track?.kind || "").toLowerCase() !== "video" || typeof track.clone !== "function") {
    return {
      sampleId,
      status: "unavailable",
      method: "unavailable",
      reason: "cloneable_video_track_required",
      frames: null,
      fps: null,
      durationMs: null,
      rawTrackMeasuredFrames: null,
      rawTrackMeasuredFps: null,
      rawTrackMeasurementMethod: "unavailable",
      rawTrackMeasurementDurationMs: null,
      publishingTrackReadyStateBefore: sourceReadyStateBefore,
      publishingTrackReadyStateAfter: String(track?.readyState || "").trim() || null,
      cloneStopped: null,
    };
  }
  const clone = track.clone();
  if (typeof MediaStreamTrackProcessorClass === "function") {
    let reader = null;
    let stopTimer = null;
    let stoppedByDeadline = false;
    let frames = 0;
    let closedFrames = 0;
    const startedAt = nowWall();
    const startedMonotonic = nowMonotonic();
    try {
      const processor = new MediaStreamTrackProcessorClass({ track: clone });
      reader = processor.readable.getReader();
      stopTimer = scheduleTimeout(() => {
        stoppedByDeadline = true;
        try { clone.stop(); } catch (_) {}
      }, boundedDurationMs);
      while (nowMonotonic() - startedMonotonic < boundedDurationMs) {
        let result = null;
        try {
          result = await reader.read();
        } catch (error) {
          if (!stoppedByDeadline && String(clone?.readyState || "").toLowerCase() !== "ended") throw error;
          break;
        }
        if (result?.done) break;
        const frame = result?.value || null;
        if (frame) {
          frames += 1;
          try { frame.close?.(); closedFrames += 1; } catch (_) {}
        }
      }
    } finally {
      if (stopTimer) cancelScheduledTimeout(stopTimer);
      try { await reader?.cancel?.(); } catch (_) {}
      try { reader?.releaseLock?.(); } catch (_) {}
      try { clone.stop(); } catch (_) {}
    }
    const endedAt = nowWall();
    const measuredDurationMs = Math.max(1, Math.round(nowMonotonic() - startedMonotonic));
    return {
      sampleId,
      status: "sampled",
      method: "raw_clone_media_stream_track_processor",
      isRawTrackMeasurement: true,
      startedAt,
      endedAt,
      durationMs: measuredDurationMs,
      frames,
      fps: Number(((frames * 1000) / measuredDurationMs).toFixed(1)),
      rawTrackMeasuredFrames: frames,
      rawTrackMeasuredFps: Number(((frames * 1000) / measuredDurationMs).toFixed(1)),
      rawTrackMeasurementMethod: "raw_clone_media_stream_track_processor",
      rawTrackMeasurementDurationMs: measuredDurationMs,
      framesClosed: closedFrames,
      readerReleased: true,
      cloneStopped: String(clone.readyState || "").toLowerCase() === "ended",
      publishingTrackReadyStateBefore: sourceReadyStateBefore,
      publishingTrackReadyStateAfter: String(track?.readyState || "").trim() || null,
    };
  }

  if (!documentRef?.createElement || typeof MediaStream !== "function") {
    try { clone.stop(); } catch (_) {}
    return {
      sampleId,
      status: "unavailable",
      method: "unavailable",
      reason: "media_stream_track_processor_and_rvfc_unavailable",
      frames: null,
      fps: null,
      durationMs: null,
      rawTrackMeasuredFrames: null,
      rawTrackMeasuredFps: null,
      rawTrackMeasurementMethod: "unavailable",
      rawTrackMeasurementDurationMs: null,
      publishingTrackReadyStateBefore: sourceReadyStateBefore,
      publishingTrackReadyStateAfter: String(track?.readyState || "").trim() || null,
      cloneStopped: String(clone.readyState || "").toLowerCase() === "ended",
    };
  }

  const video = documentRef.createElement("video");
  let callbackHandle = 0;
  let frames = 0;
  const startedAt = nowWall();
  const startedMonotonic = nowMonotonic();
  try {
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:-8px;top:-8px;width:1px;height:1px;opacity:0;pointer-events:none";
    documentRef.body?.appendChild(video);
    video.srcObject = new MediaStream([clone]);
    await video.play?.().catch?.(() => {});
    if (typeof video.requestVideoFrameCallback !== "function") throw new Error("rvfc_unavailable");
    const onFrame = () => {
      frames += 1;
      callbackHandle = video.requestVideoFrameCallback(onFrame);
    };
    callbackHandle = video.requestVideoFrameCallback(onFrame);
    await new Promise((resolve) => scheduleTimeout(resolve, boundedDurationMs));
  } finally {
    try { video.cancelVideoFrameCallback?.(callbackHandle); } catch (_) {}
    try { video.pause?.(); } catch (_) {}
    try { video.srcObject = null; } catch (_) {}
    try { video.remove?.(); } catch (_) {}
    try { clone.stop(); } catch (_) {}
  }
  const endedAt = nowWall();
  const measuredDurationMs = Math.max(1, Math.round(nowMonotonic() - startedMonotonic));
  return {
    sampleId,
    status: "sampled",
    method: "rendered_clone_video_rvfc",
    isRawTrackMeasurement: false,
    startedAt,
    endedAt,
    durationMs: measuredDurationMs,
    frames,
    fps: Number(((frames * 1000) / measuredDurationMs).toFixed(1)),
    rawTrackMeasuredFrames: frames,
    rawTrackMeasuredFps: Number(((frames * 1000) / measuredDurationMs).toFixed(1)),
    rawTrackMeasurementMethod: "rendered_clone_video_rvfc",
    rawTrackMeasurementDurationMs: measuredDurationMs,
    renderedCloneVideoFps: Number(((frames * 1000) / measuredDurationMs).toFixed(1)),
    videoElementRemoved: !video.isConnected,
    cloneStopped: String(clone.readyState || "").toLowerCase() === "ended",
    publishingTrackReadyStateBefore: sourceReadyStateBefore,
    publishingTrackReadyStateAfter: String(track?.readyState || "").trim() || null,
  };
}

export function classifyTrueScreenshareCadence({
  rawTrackFps = null,
  mediaSourceFps = null,
  outboundEncodedFps = null,
  outboundSentFps = null,
  receiverDecodedFps = null,
  receiverRenderedFps = null,
  targetFps = 60,
} = {}) {
  const value = (input) => input == null ? Number.NaN : Number(input);
  const raw = value(rawTrackFps);
  const source = value(mediaSourceFps);
  const encoded = value(outboundEncodedFps);
  const sent = value(outboundSentFps);
  const decoded = value(receiverDecodedFps);
  const rendered = value(receiverRenderedFps);
  const target = Math.max(1, Number(targetFps) || 60);
  const healthy = target * 0.9;
  const materiallyLow = target * 0.82;
  if (Number.isFinite(raw) && raw < materiallyLow) return "RAW_CAPTURE_LIMIT";
  if (Number.isFinite(raw) && raw >= healthy && Number.isFinite(source) && source < materiallyLow) {
    return "RTC_SOURCE_BOUNDARY_LIMIT";
  }
  if (
    Number.isFinite(raw) && raw >= healthy
    && Number.isFinite(source) && source >= healthy
    && ((Number.isFinite(encoded) && encoded < materiallyLow) || (Number.isFinite(sent) && sent < materiallyLow))
  ) return "ENCODER_OR_RTP_TEMPORAL_LIMIT";
  const publisherHealthy = [raw, source, encoded, sent].every((fps) => Number.isFinite(fps) && fps >= healthy);
  if (
    publisherHealthy
    && ((Number.isFinite(decoded) && decoded < materiallyLow) || (Number.isFinite(rendered) && rendered < materiallyLow))
  ) return "DOWNSTREAM_ONLY_LIMIT";
  if (publisherHealthy && Number.isFinite(decoded) && decoded >= healthy && Number.isFinite(rendered) && rendered >= healthy) {
    return "HEALTHY_60";
  }
  if (publisherHealthy) return "PUBLISHER_HEALTHY_60_RECEIVER_PROBE_REQUIRED";
  return "INCONCLUSIVE";
}

function resolveRemoteScreenshareReceiveTarget(publication = null, {
  verifiedNativeCompanion = false,
} = {}) {
  const trackName = String(publication?.trackName || publication?.track?.name || "").trim().toLowerCase();
  const publishedPreset = parseScreensharePresetTrackName(
    trackName,
  );
  const width = Number(publication?.dimensions?.width || publication?.track?.dimensions?.width || 0) || 0;
  const height = Number(publication?.dimensions?.height || publication?.track?.dimensions?.height || 0) || 0;
  const is720 = publishedPreset?.startsWith("720p")
    || (width > 0 && height > 0 && width <= 1280 && height <= 720);
  // The native publisher's fixed track name is not an authorization signal.
  // It upgrades to 720p60 only when the participant has already passed signed
  // companion claim validation and the publication exposes 720p-compatible
  // dimensions. Unknown/future native formats therefore remain at the safe
  // 30 FPS receiver fallback.
  const verifiedNative720p60 = verifiedNativeCompanion === true
    && trackName === NATIVE_SCREENSHARE_TRACK_NAME
    && width > 0
    && height > 0
    && width <= 1280
    && height <= 720;
  const publishedDimensions = publishedPreset?.startsWith("2160p")
    ? { width: 3840, height: 2160 }
    : (publishedPreset?.startsWith("1440p")
      ? { width: 2560, height: 1440 }
      : (publishedPreset?.startsWith("1080p")
        ? { width: 1920, height: 1080 }
        : (publishedPreset?.startsWith("source") && width > 0 && height > 0
          ? { width, height }
          : null)));
  const target = Object.freeze({
    width: verifiedNative720p60
      ? 1280
      : (publishedDimensions?.width || (is720 ? 1280 : 1920)),
    height: verifiedNative720p60
      ? 720
      : (publishedDimensions?.height || (is720 ? 720 : 1080)),
    fps: (verifiedNative720p60 || publishedPreset?.endsWith("60")) ? 60 : 30,
    quality: "high",
  });
  return Object.freeze({
    target,
    attribution: verifiedNative720p60
      ? "verified_native_companion_720p60"
      : (publishedPreset ? `published_preset_${publishedPreset}` : "safe_unknown_screenshare_fallback"),
    verifiedNative720p60,
  });
}

export function deriveRemoteScreenshareReceiveTarget(publication = null, options = {}) {
  return resolveRemoteScreenshareReceiveTarget(publication, options).target;
}

export function applyRemoteScreenshareReceiveContract(publication = null, {
  previousSignature = "",
  verifiedNativeCompanion = false,
} = {}) {
  if (!publication) return { applied: false, signature: "", target: null, apiCalls: [] };
  const resolvedTarget = resolveRemoteScreenshareReceiveTarget(publication, { verifiedNativeCompanion });
  const { target } = resolvedTarget;
  const signature = `${target.width}x${target.height}@${target.fps}:${target.quality}`;
  const hasRemoteVideoTrack = !!publication?.track;
  if (hasRemoteVideoTrack && String(previousSignature || "") === signature) {
    return {
      applied: false,
      deduplicated: true,
      signature,
      target,
      targetAttribution: resolvedTarget.attribution,
      verifiedNativeCompanion720p60: resolvedTarget.verifiedNative720p60,
      apiCalls: [],
    };
  }
  const apiCalls = [];
  const callPublicationApi = (method, args = []) => {
    const available = typeof publication?.[method] === "function";
    const result = { method, available, executed: false, succeeded: false, errorName: null };
    if (!available) {
      apiCalls.push(result);
      return result;
    }
    result.executed = true;
    try {
      publication[method](...args);
      result.succeeded = true;
    } catch (error) {
      result.errorName = String(error?.name || "Error").slice(0, 120);
    }
    apiCalls.push(result);
    return result;
  };
  // livekit-client 2.15.1 treats an explicit dimension request as the
  // authoritative HIGH-layer request and clears requestedMaxQuality. Apply
  // HIGH first for older servers, then dimensions/FPS as the final contract.
  callPublicationApi("setVideoQuality", [VideoQuality.HIGH]);
  if (hasRemoteVideoTrack) {
    callPublicationApi("setVideoDimensions", [{ width: target.width, height: target.height }]);
    callPublicationApi("setVideoFPS", [target.fps]);
  }
  return {
    applied: true,
    deduplicated: false,
    signature: hasRemoteVideoTrack ? signature : "",
    target,
    targetAttribution: resolvedTarget.attribution,
    verifiedNativeCompanion720p60: resolvedTarget.verifiedNative720p60,
    apiCalls,
  };
}

export function attachRemoteScreenshareTrack(track = null, videoElement = null) {
  if (!track || typeof track.attach !== "function" || !videoElement) return null;
  const attached = track.attach(videoElement);
  return attached || videoElement;
}

function normalizeScreenshareSourceKind(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "screen" || normalized === "window" || normalized === "tab" || normalized === "browser") {
    return normalized;
  }
  return "";
}

function isScreenshareCaptureCancelledError(error = null, { nativePicker = false } = {}) {
  if (!error) return false;
  if (error?.__sharePickerCancelled) return true;
  const name = String(error?.name || "").trim().toLowerCase();
  if (name === "aborterror") return true;
  const marker = String(error?.category || error?.kind || error?.code || "").trim().toLowerCase();
  if (["user_cancelled", "picker_cancelled", "selection_cancelled"].includes(marker)) return true;
  const message = String(error?.message || error || "").trim().toLowerCase();
  const explicitlyDenied = [
    "permission_denied",
    "screen_recording_denied",
    "security_denied",
    "system_denied",
  ].includes(marker)
    || marker.endsWith("_permission_denied")
    || marker.endsWith("_policy_denied")
    || /(?:blocked|denied) by (?:administrator|policy|system)|screen.?recording permission|system settings|security settings/.test(message);
  if (explicitlyDenied) return false;
  if (
    message.includes("cancel")
    || message.includes("dismiss")
    || message.includes("aborted")
  ) return true;
  if (name === "notallowederror") return nativePicker === true;
  return false;
}

export function classifyScreenshareCaptureError(error = null, stage = "") {
  const name = String(error?.name || "").trim().toLowerCase();
  const message = String(error?.message || error || "").trim().toLowerCase();
  const normalizedStage = String(stage || "").trim().toLowerCase();
  if (message.includes("too many") && message.includes("captur")) return "capture_resource_limit";
  if (
    message.includes("resource")
    && (message.includes("limit") || message.includes("maximum"))
  ) return "capture_resource_limit";
  if (
    message.includes("invalid") && (
      message.includes("source")
      || message.includes("chromeMediaSourceId")
    )
  ) return "invalid_source_id";
  if (message.includes("wgc") || message.includes("windows graphics capture")) return "capture_graphics_init_failed";
  if (message.includes("initialize") && message.includes("capture")) return "capture_graphics_init_failed";
  if (isScreenshareCaptureCancelledError(error, {
    nativePicker: /(?:picker|prompt|chooser|selection)/.test(normalizedStage),
  })) return "user_cancelled";
  if (name === "notallowederror" || name === "securityerror") return "permission_denied";
  if (name === "notfounderror") return "source_unavailable";
  if (name === "notreadableerror") return "source_start_failed";
  if (name === "overconstrainederror" || name === "constraintnotsatisfiederror") return "constraints_rejected";
  if (message.includes("track") && message.includes("ended")) return "track_ended";
  if (normalizedStage.includes("publish") || message.includes("publish")) return "livekit_publish_failed";
  if (message.includes("source") || message.includes("capture")) return "capture_failed";
  return "unknown";
}

function getSafeCaptureErrorCode(error = null) {
  const raw = String(error?.code || "").trim();
  return raw && raw.length <= 100 ? raw : null;
}

export async function captureDesktopSourceStream({
  sourceId = "",
  sourceKind = "",
  sourceName = "",
  captureRequest = null,
  withAudio = false,
  useFallbackConstraints = false,
  prepareDesktopCapture = null,
  clearPreparedDesktopCapture = null,
  acquireDesktopAudioCapture = null,
  acquireNativeHighMotionCapture = null,
  onCaptureStreamAcquired = null,
  releaseCapturedStream = null,
  onCapturePhase = null,
  isCaptureAttemptCurrent = null,
} = {}) {
  const normalizedSourceId = normalizeId(sourceId || "");
  if (!normalizedSourceId) {
    throw new Error("screenshare_source_id_missing");
  }
  const normalizedSourceKind = normalizeScreenshareSourceKind(sourceKind || "");
  const notifyCapturePhase = (phase, details = {}) => {
    if (typeof onCapturePhase !== "function") return;
    try { onCapturePhase(phase, details); } catch (_) {}
  };
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
  const cursorMode = normalizedSourceKind === "window" ? "motion" : "always";
  let stream = null;
  let routedAudioCapturePromise = null;
  const usesTrustedRoutedAudio = !!(
    withAudio
    && typeof prepareDesktopCapture === "function"
    && typeof acquireDesktopAudioCapture === "function"
  );
  if (usesTrustedRoutedAudio) {
    routedAudioCapturePromise = Promise.resolve().then(() => acquireDesktopAudioCapture({
      sourceId: normalizedSourceId,
      sourceKind: normalizedSourceKind || null,
    }));
  }
  const stopPendingRoutedAudio = () => {
    if (!routedAudioCapturePromise) return;
    void Promise.resolve(routedAudioCapturePromise)
      .then((capture) => capture?.stop?.())
      .catch(() => {});
  };
  let captureModel = "legacy_direct_source_id";
  let preparedSelection = null;
  let captureFallbackReason = null;
  let fallbackPreparedSelection = null;
  const nativeHighMotionCandidate = normalizedSourceKind === "screen"
    && String(request?.streamPreset || "").trim().toLowerCase() === "720p60";
  if (typeof acquireNativeHighMotionCapture === "function") {
    const nativeResult = await acquireNativeHighMotionCapture({
      sourceId: normalizedSourceId,
      sourceKind: normalizedSourceKind,
      captureRequest: request,
    });
    notifyCapturePhase("native_high_motion_eligibility", {
      selectedSourceId: normalizedSourceId,
      selectedSourceType: normalizedSourceKind || null,
      audioRequested: !!withAudio,
      captureAttempt: "native_high_motion",
      reason: nativeResult?.eligibility?.rejectionReason || nativeResult?.category || null,
      nativeHighMotionEligibility: nativeResult?.eligibility || null,
    });
    if (nativeResult?.ok === true && nativeResult?.stream instanceof MediaStream) {
      stream = nativeResult.stream;
      captureModel = "native_high_motion_monitor_bridge";
      notifyCapturePhase("native_high_motion_bridge_ready", {
        selectedSourceId: normalizedSourceId,
        selectedSourceType: "screen",
        audioRequested: !!withAudio,
        captureAttempt: "native_high_motion",
      });
    } else if (nativeHighMotionCandidate && (nativeResult?.attempted === true || nativeResult?.category)) {
      captureFallbackReason = String(nativeResult?.category || "native_high_motion_bridge_unavailable").slice(0, 120);
      notifyCapturePhase("native_high_motion_bridge_fallback", {
        selectedSourceId: normalizedSourceId,
        selectedSourceType: "screen",
        audioRequested: !!withAudio,
        captureAttempt: "native_high_motion",
        reason: captureFallbackReason,
      });
    }
  }
  if (!stream && typeof prepareDesktopCapture === "function") {
    notifyCapturePhase("ipc_sent", {
      selectedSourceId: normalizedSourceId,
      selectedSourceType: normalizedSourceKind || "screen",
      audioRequested: !!withAudio,
    });
    try {
      preparedSelection = await prepareDesktopCapture({
        sourceId: normalizedSourceId,
        withAudio: false,
        captureAttempt: "display_media",
      });
    } catch (error) {
      stopPendingRoutedAudio();
      throw error;
    }
    if (preparedSelection?.ok !== true || preparedSelection?.sourceIdMatched !== true) {
      stopPendingRoutedAudio();
      throw new Error("screenshare_source_prepare_failed");
    }
    captureModel = "electron_session_display_media";
    notifyCapturePhase("getDisplayMedia_called", {
      handoffId: String(preparedSelection?.handoffId || "").trim() || null,
      selectedSourceId: normalizedSourceId,
      selectedSourceType: normalizedSourceKind || preparedSelection?.sourceType || "screen",
      audioRequested: !!withAudio,
      captureAttempt: "display_media",
    });
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (error) {
      if (typeof clearPreparedDesktopCapture === "function" && preparedSelection?.handoffId) {
        try { await clearPreparedDesktopCapture({ handoffId: preparedSelection.handoffId }); } catch (_) {}
      }
      notifyCapturePhase("getDisplayMedia_failed", {
        handoffId: String(preparedSelection?.handoffId || "").trim() || null,
        selectedSourceId: normalizedSourceId,
        selectedSourceType: normalizedSourceKind || preparedSelection?.sourceType || "screen",
        audioRequested: !!withAudio,
        captureAttempt: "display_media",
        error,
      });
      const errorName = String(error?.name || "").trim().toLowerCase();
      const attemptStillCurrent = typeof isCaptureAttemptCurrent !== "function" || isCaptureAttemptCurrent() === true;
      if (errorName !== "notreadableerror" || !attemptStillCurrent) {
        stopPendingRoutedAudio();
        throw error;
      }

      captureFallbackReason = "display_media_not_readable";
      notifyCapturePhase("source_id_fallback_started", {
        selectedSourceId: normalizedSourceId,
        selectedSourceType: normalizedSourceKind || preparedSelection?.sourceType || "screen",
        audioRequested: !!withAudio,
        captureAttempt: "source_id_video",
        reason: captureFallbackReason,
      });
      try {
        const fallbackPreparedSelection = await prepareDesktopCapture({
          sourceId: normalizedSourceId,
          withAudio: false,
          captureAttempt: "source_id_video",
        });
        if (fallbackPreparedSelection?.ok !== true || fallbackPreparedSelection?.sourceIdMatched !== true) {
          throw new Error("screenshare_source_prepare_failed");
        }
        if (typeof isCaptureAttemptCurrent === "function" && isCaptureAttemptCurrent() !== true) {
          const staleError = new DOMException("screenshare_capture_attempt_stale", "AbortError");
          staleError.__screenshareCaptureStale = true;
          throw staleError;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: normalizedSourceId,
            },
          },
          audio: false,
        });
        captureModel = "electron_source_id_video";
        notifyCapturePhase("source_id_fallback_resolved", {
          selectedSourceId: normalizedSourceId,
          selectedSourceType: normalizedSourceKind || fallbackPreparedSelection?.sourceType || "screen",
          audioRequested: !!withAudio,
          captureAttempt: "source_id_video",
          reason: captureFallbackReason,
          videoTrackCount: stream?.getVideoTracks?.()?.length || 0,
          audioTrackCount: stream?.getAudioTracks?.()?.length || 0,
        });
      } catch (fallbackError) {
        if (typeof clearPreparedDesktopCapture === "function" && fallbackPreparedSelection?.handoffId) {
          try { await clearPreparedDesktopCapture({ handoffId: fallbackPreparedSelection.handoffId }); } catch (_) {}
          fallbackPreparedSelection = null;
        }
        notifyCapturePhase("source_id_fallback_failed", {
          selectedSourceId: normalizedSourceId,
          selectedSourceType: normalizedSourceKind || preparedSelection?.sourceType || "screen",
          audioRequested: !!withAudio,
          captureAttempt: "source_id_video",
          reason: captureFallbackReason,
          error: fallbackError,
        });
        stopPendingRoutedAudio();
        throw fallbackError;
      }
      if (typeof clearPreparedDesktopCapture === "function" && fallbackPreparedSelection?.handoffId) {
        try { await clearPreparedDesktopCapture({ handoffId: fallbackPreparedSelection.handoffId }); } catch (_) {}
        fallbackPreparedSelection = null;
      }
    }
    if (typeof clearPreparedDesktopCapture === "function" && preparedSelection?.handoffId) {
      try { await clearPreparedDesktopCapture({ handoffId: preparedSelection.handoffId }); } catch (_) {}
    }
    if (captureModel === "electron_session_display_media") {
      notifyCapturePhase("getDisplayMedia_resolved", {
        handoffId: String(preparedSelection?.handoffId || "").trim() || null,
        selectedSourceId: normalizedSourceId,
        selectedSourceType: normalizedSourceKind || preparedSelection?.sourceType || "screen",
        audioRequested: !!withAudio,
        captureAttempt: "display_media",
        videoTrackCount: stream?.getVideoTracks?.()?.length || 0,
        audioTrackCount: stream?.getAudioTracks?.()?.length || 0,
      });
    }
  } else if (!stream) {
    const constraints = {
      video: {
        mandatory: mandatoryVideo,
        optional: cursorMode ? [{ cursor: cursorMode }] : [],
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
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  }
  try { onCaptureStreamAcquired?.(stream); } catch (_) {}
  const track = stream?.getVideoTracks?.()?.[0] || null;
  if (!track) {
    stopPendingRoutedAudio();
    try {
      if (typeof releaseCapturedStream === "function") releaseCapturedStream(stream);
      else stream?.getTracks?.()?.forEach?.((mediaTrack) => mediaTrack.stop?.());
    } catch (_) {}
    throw new Error("screenshare_capture_track_missing");
  }
  notifyCapturePhase("track_received", {
    handoffId: String(preparedSelection?.handoffId || "").trim() || null,
    selectedSourceId: normalizedSourceId,
    selectedSourceType: normalizedSourceKind || preparedSelection?.sourceType || "screen",
    audioRequested: !!withAudio,
    captureAttempt: captureModel === "native_high_motion_monitor_bridge"
      ? "native_high_motion"
      : (captureModel === "electron_session_display_media" ? "display_media" : "source_id_video"),
    reason: captureFallbackReason,
    videoTrackCount: stream?.getVideoTracks?.()?.length || 0,
    audioTrackCount: stream?.getAudioTracks?.()?.length || 0,
    videoReadyState: String(track.readyState || "").trim().toLowerCase() || null,
  });
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
    captureModel,
    pickerToCaptureSourceIdMatch: preparedSelection?.sourceIdMatched === true || captureModel === "legacy_direct_source_id",
    sourceIdLength: normalizedSourceId.length,
    useFallbackConstraints: !!useFallbackConstraints,
    mandatoryMaxWidth: Number(mandatoryVideo.maxWidth || 0) || null,
    mandatoryMaxHeight: Number(mandatoryVideo.maxHeight || 0) || null,
    mandatoryMaxFrameRate: Number(mandatoryVideo.maxFrameRate || 0) || null,
    mandatoryMinFrameRate: Number(mandatoryVideo.minFrameRate || 0) || null,
    requestedWidth: Number.isFinite(desiredWidth) && desiredWidth > 0 ? Math.round(desiredWidth) : null,
    requestedHeight: Number.isFinite(desiredHeight) && desiredHeight > 0 ? Math.round(desiredHeight) : null,
    requestedFps: Number.isFinite(desiredFps) && desiredFps > 0 ? Math.round(desiredFps) : null,
    captureFallbackReason,
    capturePath: captureModel === "native_high_motion_monitor_bridge" ? "native_high_motion" : "chromium_compatibility",
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
  if (routedAudioCapturePromise) {
    try {
      Object.defineProperty(stream, "__altaraRoutedAudioCapturePromise", {
        value: routedAudioCapturePromise,
        configurable: true,
        enumerable: false,
        writable: false,
      });
    } catch (_) {
      try { stream.__altaraRoutedAudioCapturePromise = routedAudioCapturePromise; } catch (_) {}
    }
  }
  return stream;
}

export function createServerVoiceScreenshareLayer({
  conversationId = "",
  localUserId = "",
  logger = () => {},
  onStateChanged = () => {},
  openSourcePicker = null,
  prepareDesktopCapture = null,
  clearPreparedDesktopCapture = null,
  acquireDesktopAudioCapture = null,
  acquireNativeHighMotionCapture = null,
  onDesktopAudioPublicationChanged = null,
  getDesktopAudioCaptureDiagnostics = null,
  subscribeDesktopCapturePhases = null,
  acquireElectronBackgroundThrottlingLease = null,
  releaseElectronBackgroundThrottlingLease = null,
  getElectronBackgroundThrottlingDiagnostics = null,
  normalizeCapturePreferencesForEntitlement = null,
  resolveStageViewport = null,
  onRemoteTrackReady = null,
  autoWatchRemoteShares = false,
  performanceDiagnosticsEnabled = false,
  serverStartTraceEnabled = false,
  privateOneToOne = false,
  resolveShareTitle = null,
  remotePresentationTimeoutMs = SCREENSHARE_REMOTE_PRESENTATION_TIMEOUT_MS,
  remotePresentationRetryLimit = SCREENSHARE_REMOTE_PRESENTATION_RETRY_LIMIT,
} = {}) {
  const convId = normalizeId(conversationId || "");
  const meId = normalizeId(localUserId || "");
  const isPrivateOneToOne = privateOneToOne === true;
  const readPresentationTitle = (record = null) => {
    if (typeof resolveShareTitle === "function") {
      try {
        const resolved = String(resolveShareTitle({
          ownerUserId: record?.ownerUserId || "",
          isLocal: !!record?.isLocal,
        }) || "").trim();
        if (resolved) return resolved;
      } catch (_) {}
    }
    return buildSafeCallShareTitle({
      isLocal: !!record?.isLocal,
      actorLabel: record?.ownerDisplayName || "",
      fallback: "User",
    });
  };

  let room = null;
  let roomBound = false;
  const shareRecordsByKey = new Map();
  const remoteWatchedShareKeys = new Set();
  let localShareKey = "";
  let activeShareKey = "";
  let lastRenderSignature = "";
  let localCaptureStream = null;
  let localCaptureTrack = null;
  let localCaptureAudioTrack = null;
  let localCaptureAudioTrackSid = "";
  let localScreenSharePublication = null;
  let localRoutedAudioCapture = null;
  let localRoutedAudioCapturePromise = null;
  let localTrackEndedHandler = null;
  let localShareLifecycleState = "idle";
  let localShareStartPromise = null;
  let localShareStopPromise = null;
  let localShareReplacePromise = null;
  let localShareReplaceAttempt = 0;
  let currentLocalSourceSelection = null;
  let localShareAttempt = 0;
  let localScreenAudioPublishPromise = null;
  let electronBackgroundThrottlingLeaseId = "";
  let trueCadenceMeasurementPromise = null;
  let captureOnlyCadenceMeasurementPromise = null;
  let nativeWebrtcContentionMeasurementPromise = null;
  const nativeWebrtcContentionSamples = new Map();
  let localFirstFrameProbe = null;
  let remoteRenderStatsTimer = null;
  let remoteStageRefreshTimer = null;
  let remoteRenderComparisonPromise = null;
  let privateOneToOneTransportProfile = PRIVATE_ONE_TO_ONE_SCREENSHARE_DEFAULT_PROFILE;
  let privateQualityController = null;
  let privateQualityPreviousRtcSample = null;
  const remoteStageActivity = [];
  let serverStartTrace = null;
  const mediaDiagnostics = {
    sourcePickerType: null,
    sourceAcquisitionPath: null,
    pickerOutcome: null,
    getDisplayMediaRequestedAt: null,
    mediaAcquiredAt: null,
    acquiredVideoTrackCount: 0,
    acquiredAudioTrackCount: 0,
    acquiredVideoTrackReadyState: null,
    publishStartedAt: null,
    publishSucceededAt: null,
    lastShareErrorName: null,
    lastShareErrorCode: null,
    lastShareErrorStage: null,
    lastShareErrorCategory: null,
    firstCaptureErrorName: null,
    firstCaptureErrorCode: null,
    firstCaptureErrorCategory: null,
    fallbackCaptureErrorName: null,
    fallbackCaptureErrorCode: null,
    fallbackCaptureErrorCategory: null,
    sourceExistedAtSelection: null,
    sourceEnumerationAgeMs: null,
    sourceSelectedAt: null,
    startStreamingClickedAt: null,
    captureRequestedAt: null,
    localVideoTrackCreatedAt: null,
    screenAudioUnavailable: false,
    remoteTrackSubscribedAt: null,
    remoteVideoAttachedAt: null,
    remoteFirstFrameAt: null,
    captureModel: null,
    pickerToCaptureSourceIdMatch: null,
    selectedSourceIdLength: null,
    captureSourceIdLength: null,
    roomStateAtPublish: null,
    publishOutcome: null,
    localPublicationVisible: false,
    cleanupCompletedAt: null,
    captureAttempts: [],
    acquiredVideoTrackSettings: null,
    localTrackWrapperMode: null,
    phase: null,
    phases: [],
    selectedSourceId: null,
    selectedSourceType: null,
    audioRequested: false,
    audioFallbackAttempted: false,
    audioFallbackResult: null,
    captureHandoffId: null,
    exceptionName: null,
    exceptionMessage: null,
    exceptionStack: null,
    publishErrorName: null,
    publishErrorMessage: null,
    publishErrorStack: null,
    failurePhase: null,
    captureAttempt: null,
    captureFallbackReason: null,
    displayMediaFailure: null,
    sourceIdFallbackStartedAt: null,
    sourceIdFallbackResolvedAt: null,
    sourceIdFallbackFailure: null,
    winningCapturePath: null,
    videoTrackCount: 0,
    sourceSwitchAttemptCount: 0,
    sourceSwitchLastOutcome: null,
    sourceSwitchInFlight: false,
    displayCaptureRequests: 0,
    displayCaptureStreamsCreated: 0,
    displayCaptureVideoTracksCreated: 0,
    displayCaptureTracksStopped: 0,
    pendingDisplayCaptureHandlers: 0,
    localPerformanceAttemptId: null,
    remotePerformanceAttemptId: null,
    localFirstFrameAt: null,
    senderStats: null,
    receiverStats: null,
    remoteRenderStats: null,
    remotePerformanceStartStreamingClickedAt: null,
    remotePerformancePublishStartedAt: null,
    requestedRemoteVideoQuality: null,
    requestedRemoteVideoDimensions: null,
    requestedRemoteVideoFps: null,
    requestedRemoteVideoFpsAttribution: null,
    remotePublication: null,
    remoteAttachMethod: null,
    remoteAttachAttemptedAt: null,
    remoteAttachFailureReason: null,
    remoteAttachFunctionPath: [],
    remoteRenderComparison: null,
    remoteLayerEvents: [],
    publishSettings: null,
    publisherSdp: null,
    senderParametersBeforeMotionPolicy: null,
    senderParametersAfterMotionPolicy: null,
    senderMotionPolicyApplyCount: 0,
    senderMotionPolicyLastReason: null,
    senderMotionPolicyLastOutcome: null,
    senderMotionPolicyVerified: null,
    senderMotionPolicyMutationAttempted: false,
    privateOneToOne: isPrivateOneToOne,
    privateTransportProfile: isPrivateOneToOne ? privateOneToOneTransportProfile : null,
    privateQualityController: null,
    electronBackgroundThrottling: null,
    lastTrueCadenceMeasurement: null,
    lastCaptureOnlyCadenceMeasurement: null,
    nativeHighMotionBridge: null,
    nativeHighMotionEligibility: null,
    h264HardwareEncoderPreference: null,
  };
  const registeredDisplayCaptureStreams = new WeakSet();
  const stoppedDisplayCaptureTracks = new WeakSet();
  const activeDisplayCaptureTracks = new Set();
  let unsubscribeDesktopCapturePhases = null;
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
  // Presentation ownership is per ScreenShare publication. The transport
  // registry above has always retained more than one share, but the former
  // singleton `uiRefs` forced every record through the same panel/video.
  const uiRefsByShareKey = new Map();
  const remotePresentationTimersByShareKey = new Map();
  const boundedRemotePresentationTimeoutMs = Math.max(100, Number(remotePresentationTimeoutMs) || SCREENSHARE_REMOTE_PRESENTATION_TIMEOUT_MS);
  const boundedRemotePresentationRetryLimit = Math.max(0, Math.min(2, Number(remotePresentationRetryLimit) || 0));

  function emit(event, details = {}) {
    const rawDetails = (details && typeof details === "object" && !Array.isArray(details))
      ? details
      : { value: details ?? null };
    const safeDetails = { ...rawDetails };
    if (Object.prototype.hasOwnProperty.call(safeDetails, "sourceId")) {
      const sourceIdLength = String(safeDetails.sourceId || "").length;
      if (sourceIdLength > 0) safeDetails.sourceIdLength = sourceIdLength;
      delete safeDetails.sourceId;
    }
    if (Object.prototype.hasOwnProperty.call(safeDetails, "sourceName")) {
      safeDetails.sourceNamePresent = !!String(safeDetails.sourceName || "").trim();
      delete safeDetails.sourceName;
    }
    safeInvoke(logger, {
      event: String(event || "").trim() || "screenshare.event",
      conversationId: convId || null,
      localUserId: meId || null,
      ...safeDetails,
    });
  }

  function timestampNow() {
    return new Date().toISOString();
  }

  function clearRemotePresentationTimer(key = "") {
    const shareKey = normalizeId(key);
    const timer = shareKey ? remotePresentationTimersByShareKey.get(shareKey) : null;
    if (timer) clearTimeout(timer);
    if (shareKey) remotePresentationTimersByShareKey.delete(shareKey);
  }

  function markRemotePresentationBoundary(recordInput = null, boundary = "", details = {}) {
    const shareKey = normalizeId(recordInput?.key || "");
    const record = shareKey ? (shareRecordsByKey.get(shareKey) || recordInput) : null;
    if (!isRemoteShareRecord(record) || !shareKey) return null;
    const at = timestampNow();
    const entry = {
      boundary: String(boundary || "unknown").trim() || "unknown",
      at,
      ...(details && typeof details === "object" ? details : {}),
    };
    record.presentationState = entry.boundary;
    record.presentationUpdatedAt = Date.now();
    record.presentationTimeline = [
      ...(Array.isArray(record.presentationTimeline) ? record.presentationTimeline.slice(-15) : []),
      entry,
    ];
    shareRecordsByKey.set(shareKey, record);
    emit("screenshare.remote_presentation_boundary", {
      participantId: record.ownerUserId || null,
      trackSid: record.trackSid || null,
      shareKey,
      ...entry,
    });
    return record;
  }

  function scheduleRemotePresentationTimeout(recordInput = null) {
    const shareKey = normalizeId(recordInput?.key || "");
    if (!shareKey) return;
    clearRemotePresentationTimer(shareKey);
    const timer = setTimeout(() => {
      remotePresentationTimersByShareKey.delete(shareKey);
      const record = shareRecordsByKey.get(shareKey) || null;
      if (!isRemoteShareRecord(record)) return;
      if (record.presentationState === "first_frame") return;
      const attempt = Math.max(0, Number(record.presentationRetryAttempt || 0));
      if (attempt < boundedRemotePresentationRetryLimit && record.publication) {
        record.presentationRetryAttempt = attempt + 1;
        markRemotePresentationBoundary(record, "reconcile_retry", {
          retryAttempt: record.presentationRetryAttempt,
          timeoutMs: boundedRemotePresentationTimeoutMs,
        });
        detachRemoteVideoElement(record);
        try { record.publication.setSubscribed?.(false); } catch (_) {}
        Promise.resolve().then(() => {
          const current = shareRecordsByKey.get(shareKey) || null;
          if (!current || current !== record) return;
          applyRemotePublicationSubscription(current, true, {
            triggerReason: "remote_presentation_timeout_retry",
            callerFunction: "scheduleRemotePresentationTimeout",
          });
          if (current.liveKitTrack) attachRemoteVideoElementImmediately(current);
          scheduleRemotePresentationTimeout(current);
        });
        return;
      }
      markRemotePresentationBoundary(record, "presentation_timeout", {
        retryAttempt: attempt,
        timeoutMs: boundedRemotePresentationTimeoutMs,
      });
      emit("screenshare.remote_presentation_timeout", {
        participantId: record.ownerUserId || null,
        trackSid: record.trackSid || null,
        retryAttempt: attempt,
        timeoutMs: boundedRemotePresentationTimeoutMs,
      });
      removeShareRecordByKey(shareKey, {
        triggerReason: "remote_presentation_timeout",
        callerFunction: "scheduleRemotePresentationTimeout",
      });
    }, boundedRemotePresentationTimeoutMs);
    remotePresentationTimersByShareKey.set(shareKey, timer);
  }

  function clearLocalFirstFrameProbe() {
    const probe = localFirstFrameProbe;
    localFirstFrameProbe = null;
    if (!probe) return;
    if (probe.timeoutId) clearTimeout(probe.timeoutId);
    try { probe.video?.pause?.(); } catch (_) {}
    try { probe.video.srcObject = null; } catch (_) {}
  }

  function startLocalFirstFrameProbe(stream = null, attemptId = "") {
    clearLocalFirstFrameProbe();
    if (!performanceDiagnosticsEnabled || typeof document === "undefined" || !stream) return;
    const videoTrack = stream?.getVideoTracks?.()?.[0] || null;
    if (!videoTrack || String(videoTrack.readyState || "").toLowerCase() === "ended") return;
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    const expectedAttemptId = String(attemptId || "").trim();
    let settled = false;
    const settle = (rendered = false) => {
      if (settled) return;
      settled = true;
      const stillCurrent = expectedAttemptId && expectedAttemptId === mediaDiagnostics.localPerformanceAttemptId;
      if (rendered && stillCurrent && !mediaDiagnostics.localFirstFrameAt) {
        mediaDiagnostics.localFirstFrameAt = timestampNow();
      }
      clearLocalFirstFrameProbe();
    };
    const timeoutId = setTimeout(() => settle(false), 3000);
    localFirstFrameProbe = { video, timeoutId };
    try {
      video.srcObject = new MediaStream([videoTrack]);
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(() => settle(true));
      } else {
        video.addEventListener("loadeddata", () => settle(true), { once: true });
      }
      video.play?.().catch?.(() => {});
    } catch (_) {
      settle(false);
    }
  }

  async function collectBoundedRtcStats(track = null, direction = "sender", attemptId = "") {
    const expectedAttemptId = String(attemptId || "").trim();
    if (!performanceDiagnosticsEnabled || !track || typeof track.getRTCStatsReport !== "function") {
      return {
        status: "unavailable",
        direction,
        bounded: true,
        sampleCount: 0,
        sampleWindowMs: null,
        samples: [],
      };
    }
    const samples = [];
    for (let index = 0; index < SCREENSHARE_RTC_STATS_SAMPLE_COUNT; index += 1) {
      const activeAttemptId = direction === "receiver"
        ? mediaDiagnostics.remotePerformanceAttemptId
        : mediaDiagnostics.localPerformanceAttemptId;
      if (expectedAttemptId && expectedAttemptId !== activeAttemptId) break;
      try {
        const report = await track.getRTCStatsReport();
        const sample = readVideoRtcStatsSample(report, direction);
        if (sample && direction === "sender" && typeof getElectronBackgroundThrottlingDiagnostics === "function") {
          try {
            const throttling = await getElectronBackgroundThrottlingDiagnostics();
            sample.electronRuntime = throttling && typeof throttling === "object" ? { ...throttling } : null;
            mediaDiagnostics.electronBackgroundThrottling = sample.electronRuntime;
          } catch (_) {}
        }
        if (sample) samples.push(sample);
      } catch (_) {}
      if (index + 1 < SCREENSHARE_RTC_STATS_SAMPLE_COUNT) {
        await new Promise((resolve) => setTimeout(resolve, SCREENSHARE_RTC_STATS_SAMPLE_INTERVAL_MS));
      }
    }
    return summarizeBoundedVideoStats(samples, direction);
  }

  async function acquire720p60BackgroundThrottlingLease(captureRequest = null) {
    if (
      !isPrivateOneToOne
      || String(captureRequest?.streamPreset || "").trim().toLowerCase() !== "720p60"
      || electronBackgroundThrottlingLeaseId
      || typeof acquireElectronBackgroundThrottlingLease !== "function"
    ) return false;
    try {
      const result = await acquireElectronBackgroundThrottlingLease();
      mediaDiagnostics.electronBackgroundThrottling = result?.diagnostics && typeof result.diagnostics === "object"
        ? { ...result.diagnostics }
        : null;
      if (result?.acquired === true && String(result?.leaseId || "").trim()) {
        electronBackgroundThrottlingLeaseId = String(result.leaseId).trim().toLowerCase();
        return true;
      }
    } catch (error) {
      mediaDiagnostics.electronBackgroundThrottling = {
        supported: false,
        active: false,
        lastFailure: String(error?.name || "background_throttling_acquire_failed").slice(0, 120),
      };
    }
    return false;
  }

  function release720p60BackgroundThrottlingLease(reason = "cleanup") {
    const leaseId = electronBackgroundThrottlingLeaseId;
    electronBackgroundThrottlingLeaseId = "";
    if (!leaseId || typeof releaseElectronBackgroundThrottlingLease !== "function") return false;
    void Promise.resolve(releaseElectronBackgroundThrottlingLease({ leaseId, reason }))
      .then((result) => {
        if (result?.diagnostics && typeof result.diagnostics === "object") {
          mediaDiagnostics.electronBackgroundThrottling = { ...result.diagnostics };
        }
      })
      .catch(() => {});
    return true;
  }

  async function measureTrueCadence({ durationMs = 2000 } = {}) {
    if (!performanceDiagnosticsEnabled) return { status: "unavailable", reason: "development_only" };
    if (trueCadenceMeasurementPromise) return { status: "unavailable", reason: "measurement_already_in_progress" };
    const boundedDurationMs = normalizeTrueCadenceDurationMs(durationMs);
    const sampleId = createScreensharePerformanceAttemptId();
    trueCadenceMeasurementPromise = (async () => {
      const startedAt = timestampNow();
      const localTrack = localScreenSharePublication?.track?.mediaStreamTrack || localCaptureTrack || null;
      const sender = resolveScreenshareSender(localScreenSharePublication);
      if (localTrack && sender && typeof sender.getStats === "function") {
        const [rawTrack, rtc] = await Promise.all([
          measureRawVideoTrackCadence(localTrack, { durationMs: boundedDurationMs }),
          measureFreshRtcStatsCadence(() => sender.getStats(), {
            direction: "sender",
            durationMs: boundedDurationMs,
          }),
        ]);
        const endedAt = timestampNow();
        const classification = classifyTrueScreenshareCadence({
          rawTrackFps: rawTrack?.isRawTrackMeasurement === true ? rawTrack?.fps : null,
          mediaSourceFps: rtc?.rtcMediaSource?.framesPerSecondDelta,
          outboundEncodedFps: rtc?.outbound?.framesEncodedPerSecondDelta,
          outboundSentFps: rtc?.outbound?.framesSentPerSecondDelta,
          targetFps: 60,
        });
        const result = {
          status: "sampled",
          role: "publisher",
          sampleId,
          startedAt,
          endedAt,
          durationMs: durationBetween(startedAt, endedAt),
          requestedDurationMs: boundedDurationMs,
          rawTrack,
          rtcMediaSource: rtc.rtcMediaSource,
          outbound: rtc.outbound,
          receiver: null,
          transport: rtc.transport,
          classification,
          rtcSampleId: rtc.sampleId,
          freshStatsCalls: 2,
          cachedDiagnosticsUsed: false,
        };
        mediaDiagnostics.lastTrueCadenceMeasurement = result;
        return result;
      }

      const remoteRecords = Array.from(shareRecordsByKey.values()).filter((record) => isRemoteShareRecord(record));
      const activeRemote = remoteRecords.find((record) => normalizeId(record?.key || "") === normalizeId(activeShareKey || ""))
        || remoteRecords[0]
        || null;
      const remoteTrack = activeRemote?.liveKitTrack || activeRemote?.track || null;
      if (!remoteTrack || typeof remoteTrack.getRTCStatsReport !== "function") {
        return { status: "unavailable", reason: "active_local_or_remote_screenshare_required", sampleId };
      }
      const [rtc, rendered] = await Promise.all([
        measureFreshRtcStatsCadence(() => remoteTrack.getRTCStatsReport(), {
          direction: "receiver",
          durationMs: boundedDurationMs,
        }),
        sampleVideoPresentation(activeRemote?.attachedVideoElement || null, boundedDurationMs),
      ]);
      const endedAt = timestampNow();
      const decodedFps = rtc?.receiver?.framesDecodedPerSecondDelta;
      const renderedFps = rendered?.renderedFps;
      const receiverHealthyThreshold = 54;
      const result = {
        status: "sampled",
        role: "receiver",
        sampleId,
        startedAt,
        endedAt,
        durationMs: durationBetween(startedAt, endedAt),
        requestedDurationMs: boundedDurationMs,
        rawTrack: null,
        rtcMediaSource: null,
        outbound: null,
        receiver: {
          ...rtc.receiver,
          renderedFps: Number(renderedFps || 0) || null,
          renderedFrames: Number(rendered?.presentedFrames || 0) || 0,
          renderedDroppedFrames: Number(rendered?.droppedFrames || 0) || 0,
          renderedMeasurementDurationMs: Number(rendered?.sampleWindowMs || 0) || null,
        },
        transport: rtc.transport,
        classification: Number(decodedFps || 0) >= receiverHealthyThreshold && Number(renderedFps || 0) >= receiverHealthyThreshold
          ? "RECEIVER_CHAIN_HEALTHY_60"
          : "RECEIVER_CHAIN_BELOW_60_PUBLISHER_PROBE_REQUIRED",
        rtcSampleId: rtc.sampleId,
        freshStatsCalls: 2,
        cachedDiagnosticsUsed: false,
      };
      mediaDiagnostics.lastTrueCadenceMeasurement = result;
      return result;
    })().finally(() => {
      trueCadenceMeasurementPromise = null;
    });
    return trueCadenceMeasurementPromise;
  }

  async function measureCaptureOnlyCadence({
    durationMs = 2000,
    nativeBridge = false,
    warmupMs = 0,
    webrtcContentionMode = "",
    attachmentCadenceStrategy = "",
  } = {}) {
    if (!performanceDiagnosticsEnabled || typeof prepareDesktopCapture !== "function") {
      return { status: "unavailable", reason: "electron_development_only" };
    }
    if (localShareKey || localShareStartPromise) {
      return { status: "unavailable", reason: "stop_local_share_before_capture_only_probe" };
    }
    if (captureOnlyCadenceMeasurementPromise) {
      return { status: "unavailable", reason: "measurement_already_in_progress" };
    }
    const captureRequest = {
      ...buildCurrentCaptureRequest(),
      withAudio: false,
    };
    if (String(captureRequest.streamPreset || "").trim().toLowerCase() !== "720p60") {
      return { status: "unavailable", reason: "select_private_720p60_first" };
    }
    const boundedDurationMs = normalizeTrueCadenceDurationMs(durationMs);
    const normalizedContentionMode = normalizeNativeWebrtcContentionMode(webrtcContentionMode);
    const normalizedAttachmentStrategy = normalizeNativeWebrtcAttachmentStrategy(attachmentCadenceStrategy);
    if (webrtcContentionMode && !NATIVE_WEBRTC_LOCAL_MODES.has(normalizedContentionMode)) {
      return { status: "unavailable", reason: "invalid_local_webrtc_contention_mode" };
    }
    if (attachmentCadenceStrategy && !normalizedAttachmentStrategy) {
      return { status: "unavailable", reason: "invalid_attachment_cadence_strategy" };
    }
    if (normalizedContentionMode && normalizedAttachmentStrategy) {
      return { status: "unavailable", reason: "select_one_diagnostic_mode" };
    }
    if ((normalizedContentionMode || normalizedAttachmentStrategy) && nativeBridge !== true) {
      return { status: "unavailable", reason: "native_bridge_required_for_webrtc_contention_probe" };
    }
    const sampleId = createScreensharePerformanceAttemptId();
    captureOnlyCadenceMeasurementPromise = (async () => {
      let stream = null;
      let acquiredLease = false;
      const startedAt = timestampNow();
      try {
        const selection = await openSourcePicker?.({
          triggerReason: "true_cadence_capture_only_probe",
          callerFunction: "measureCaptureOnlyCadence",
          captureRequest,
          capturePreferences: { ...getCapturePreferences(), withAudio: false },
          conversationId: convId || "",
          localUserId: meId || "",
          sourceOnly: true,
        });
        const normalizedSelection = normalizeSourceSelection(selection);
        if (!normalizedSelection) return { status: "cancelled", sampleId };
        stream = await captureDesktopSourceStream({
          sourceId: normalizedSelection.sourceId,
          sourceKind: normalizedSelection.sourceKind,
          sourceName: "",
          captureRequest,
          withAudio: false,
          useFallbackConstraints: false,
          prepareDesktopCapture,
          clearPreparedDesktopCapture,
          acquireNativeHighMotionCapture: nativeBridge === true ? acquireNativeHighMotionCapture : null,
          releaseCapturedStream: stopDisplayCaptureStream,
          isCaptureAttemptCurrent: () => true,
        });
        const track = stream?.getVideoTracks?.()?.[0] || null;
        if (!track) throw new Error("capture_only_video_track_missing");
        const nativeController = stream?.__altaraNativeHighMotionController || null;
        if (nativeBridge === true && typeof nativeController?.measureStages !== "function") {
          return {
            status: "unavailable",
            reason: "native_high_motion_capture_not_selected",
            sampleId,
            published: false,
          };
        }
        try { track.contentHint = "motion"; } catch (_) {}
        try { await track.applyConstraints?.(captureRequest.applyConstraints || {}); } catch (_) {}
        acquiredLease = await acquire720p60BackgroundThrottlingLease(captureRequest);
        const boundedWarmupMs = Math.min(10_000, Math.max(0, Math.round(Number(warmupMs) || 0)));
        if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
        const webrtcContention = normalizedContentionMode
          ? await runNativeWebrtcContentionProbe({
              mode: normalizedContentionMode,
              track,
              measureNativeStages: (options) => nativeController.measureStages(options),
              durationMs: boundedDurationMs,
              warmupMs: 0,
            })
          : null;
        const attachmentCadence = normalizedAttachmentStrategy
          ? await runNativeWebrtcAttachmentLifecycleProbe({
              strategy: normalizedAttachmentStrategy,
              track,
              measureNativeStages: (options) => nativeController.measureStages(options),
              durationMs: boundedDurationMs,
              transitionWarmupMs: Math.min(5_000, Math.max(500, boundedWarmupMs || 1000)),
              nativeTargetFps: readCaptureRequestMetrics(captureRequest).requestedFps,
              includeControls: true,
            })
          : null;
        const [rawTrack, nativeBridgeStages] = webrtcContention
          ? [null, webrtcContention.nativeStages || null]
          : attachmentCadence
            ? [null, attachmentCadence.phases?.C2?.nativeStages || null]
          : await Promise.all([
              measureRawVideoTrackCadence(track, { durationMs: boundedDurationMs }),
              typeof nativeController?.measureStages === "function"
                ? nativeController.measureStages({ durationMs: boundedDurationMs })
                : Promise.resolve(null),
            ]);
        const endedAt = timestampNow();
        const settings = readTrackCaptureSettings(track);
        const result = {
          status: "sampled",
          role: "capture_only",
          sampleId,
          startedAt,
          endedAt,
          durationMs: durationBetween(startedAt, endedAt),
          requestedDurationMs: boundedDurationMs,
          sourceKind: normalizedSelection.sourceKind || null,
          requested: {
            width: readCaptureRequestMetrics(captureRequest).requestedWidth,
            height: readCaptureRequestMetrics(captureRequest).requestedHeight,
            fps: readCaptureRequestMetrics(captureRequest).requestedFps,
          },
          trackSettings: settings ? {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            frameRateAttribution: "media_stream_track_getSettings_setting_not_measured_cadence",
          } : null,
          rawTrack,
          nativeBridgeStages,
          webrtcContention,
          attachmentCadence,
          capturePath: stream?.__altaraCapturePath || "chromium_compatibility",
          published: false,
          audioCaptured: false,
          backgroundThrottlingExperimentLeaseAcquired: acquiredLease,
          warmupMs: boundedWarmupMs,
        };
        mediaDiagnostics.lastCaptureOnlyCadenceMeasurement = result;
        return result;
      } finally {
        if (stream) stopDisplayCaptureStream(stream);
        if (acquiredLease) release720p60BackgroundThrottlingLease("capture_only_probe_finished");
      }
    })().finally(() => {
      captureOnlyCadenceMeasurementPromise = null;
    });
    return captureOnlyCadenceMeasurementPromise;
  }

  async function measureNativeBridgeStages({ durationMs = 5000, warmupMs = 0 } = {}) {
    const nativeController = localCaptureStream?.__altaraNativeHighMotionController || null;
    if (!performanceDiagnosticsEnabled || typeof nativeController?.measureStages !== "function") {
      return { status: "unavailable", reason: "active_native_bridge_required" };
    }
    return nativeController.measureStages({ durationMs, warmupMs });
  }

  async function measureNativePipelineMatrixSample({ durationMs = 5000, warmupMs = 0 } = {}) {
    if (!performanceDiagnosticsEnabled) {
      return { status: "unavailable", reason: "development_diagnostics_required" };
    }
    const boundedDurationMs = Math.min(20_000, Math.max(1_000, Math.round(Number(durationMs) || 5000)));
    const boundedWarmupMs = Math.min(10_000, Math.max(0, Math.round(Number(warmupMs) || 0)));
    if (boundedWarmupMs > 0) await new Promise((resolve) => setTimeout(resolve, boundedWarmupMs));
    const [nativeBridgeStages, rtcCadence] = await Promise.all([
      measureNativeBridgeStages({ durationMs: boundedDurationMs, warmupMs: 0 }),
      measureTrueCadence({ durationMs: boundedDurationMs }),
    ]);
    return {
      status: nativeBridgeStages?.status === "sampled" ? "sampled" : "unavailable",
      sampleId: `native-matrix-${Date.now()}`,
      requestedDurationMs: boundedDurationMs,
      warmupMs: boundedWarmupMs,
      handoffMode: nativeBridgeStages?.handoffMode || null,
      readbackMode: nativeBridgeStages?.readbackMode || null,
      nativeBridgeStages,
      rtcCadence,
      simultaneousWindow: true,
      cachedDiagnosticsUsed: false,
    };
  }

  function summarizeNativeWebrtcContentionSample(mode, measurement = null) {
    const localMeasurement = measurement?.webrtcContention || measurement || null;
    const nativeStages = localMeasurement?.nativeStages
      || localMeasurement?.nativeBridgeStages
      || measurement?.nativeBridgeStages
      || null;
    const rtc = localMeasurement?.rtc || localMeasurement?.rtcCadence || measurement?.rtcCadence || null;
    const cadence = nativeStages?.cadence || {};
    const outbound = rtc?.outbound || {};
    const mediaSource = rtc?.rtcMediaSource || {};
    return {
      mode,
      status: String(localMeasurement?.status || measurement?.status || "unavailable"),
      sampleId: String(localMeasurement?.sampleId || measurement?.sampleId || "") || null,
      measuredAt: timestampNow(),
      nativeReadyFps: Number(cadence.readbackReadyFps || cadence.readbackOutputFps || 0) || null,
      generatedTrackFps: Number(cadence.generatedTrackFps || 0) || null,
      rawGeneratedTrackFps: Number(localMeasurement?.rawGeneratedTrack?.fps || rtc?.rawTrack?.fps || 0) || null,
      rtcMediaSourceFps: Number(mediaSource.framesPerSecondDelta || 0) || null,
      encodedFps: Number(outbound.framesEncodedPerSecondDelta || 0) || null,
      sentFps: Number(outbound.framesSentPerSecondDelta || 0) || null,
      codec: String(outbound.codec || "").trim() || null,
      codecPayloadType: Number(outbound.codecPayloadType || 0) || null,
      codecFmtp: String(outbound.codecFmtp || "").slice(0, 300) || null,
      codecProfileLevelId: readH264ProfileLevelId(outbound.codecFmtp || ""),
      encoderImplementation: String(outbound.encoderImplementation || "").trim() || null,
      averageEncodeMsPerFrame: Number(outbound.averageEncodeMsPerFrame || 0) || null,
      width: Number(outbound.width || 0) || null,
      height: Number(outbound.height || 0) || null,
      qualityLimitationReason: String(rtc?.transport?.qualityLimitationReason || "").trim() || null,
      actualBitrate: Number(outbound.actualBitrateBps || 0) || null,
      availableOutgoingBitrate: Number(rtc?.transport?.availableOutgoingBitrate || 0) || null,
      cleanupComplete: typeof localMeasurement?.cleanup?.complete === "boolean"
        ? localMeasurement.cleanup.complete
        : null,
    };
  }

  async function measureNativeWebrtcContention({
    mode = "",
    durationMs = 5000,
    warmupMs = 1000,
    resetMatrix = false,
  } = {}) {
    if (!performanceDiagnosticsEnabled) {
      return { status: "unavailable", reason: "development_diagnostics_required" };
    }
    if (nativeWebrtcContentionMeasurementPromise) {
      return { status: "unavailable", reason: "measurement_already_in_progress" };
    }
    const normalizedMode = normalizeNativeWebrtcContentionMode(mode);
    if (!normalizedMode) return { status: "unavailable", reason: "invalid_webrtc_contention_mode" };
    if (resetMatrix === true || normalizedMode === NATIVE_WEBRTC_CONTENTION_MODE.NO_WEBRTC) {
      nativeWebrtcContentionSamples.clear();
    }
    nativeWebrtcContentionMeasurementPromise = (async () => {
      let measurement = null;
      if (normalizedMode === NATIVE_WEBRTC_CONTENTION_MODE.AUTHENTICATED_LIVEKIT_NVIDIA) {
        measurement = await measureNativePipelineMatrixSample({ durationMs, warmupMs });
        measurement = {
          ...measurement,
          mode: normalizedMode,
          prototypeOnly: true,
          nativeStages: measurement?.nativeBridgeStages || null,
          rtc: measurement?.rtcCadence || null,
          authenticatedLiveKit: true,
        };
      } else {
        measurement = await measureCaptureOnlyCadence({
          durationMs,
          nativeBridge: true,
          warmupMs,
          webrtcContentionMode: normalizedMode,
        });
        measurement = {
          ...(measurement?.webrtcContention || measurement || {}),
          captureOnly: true,
          capturePath: measurement?.capturePath || null,
          sourceKind: measurement?.sourceKind || null,
          published: false,
        };
      }
      const summary = summarizeNativeWebrtcContentionSample(normalizedMode, measurement);
      if (summary.status === "sampled") nativeWebrtcContentionSamples.set(normalizedMode, summary);
      const samples = Object.fromEntries(nativeWebrtcContentionSamples.entries());
      return {
        ...measurement,
        mode: normalizedMode,
        matrix: {
          samples,
          collectedModes: [...nativeWebrtcContentionSamples.keys()],
          missingModes: Object.values(NATIVE_WEBRTC_CONTENTION_MODE)
            .filter((candidate) => !nativeWebrtcContentionSamples.has(candidate)),
          classification: classifyNativeWebrtcContentionMatrix(samples),
          thresholdFps: 55,
        },
      };
    })().finally(() => {
      nativeWebrtcContentionMeasurementPromise = null;
    });
    return nativeWebrtcContentionMeasurementPromise;
  }

  async function measureNativeWebrtcAttachmentCadence({
    strategy = NATIVE_WEBRTC_ATTACHMENT_STRATEGY.SENDONLY_TRANSCEIVER_60,
    durationMs = 5000,
    warmupMs = 4000,
  } = {}) {
    if (!performanceDiagnosticsEnabled) {
      return { status: "unavailable", reason: "development_diagnostics_required" };
    }
    const captureResult = await measureCaptureOnlyCadence({
      durationMs,
      nativeBridge: true,
      warmupMs,
      attachmentCadenceStrategy: strategy,
    });
    return {
      ...(captureResult?.attachmentCadence || captureResult || {}),
      capturePath: captureResult?.capturePath || null,
      sourceKind: captureResult?.sourceKind || null,
      published: false,
      peerCleanupPreservedSourceTrack: captureResult?.attachmentCadence?.sourceTrackPreserved === true,
    };
  }

  function measureNativeBridgeCaptureOnly(options = {}) {
    return measureCaptureOnlyCadence({ ...options, nativeBridge: true });
  }

  function startBoundedRtcStats(track = null, direction = "sender", attemptId = "") {
    if (!performanceDiagnosticsEnabled) return;
    void collectBoundedRtcStats(track, direction, attemptId).then((summary) => {
      const expectedAttemptId = String(attemptId || "").trim();
      const activeAttemptId = direction === "receiver"
        ? mediaDiagnostics.remotePerformanceAttemptId
        : mediaDiagnostics.localPerformanceAttemptId;
      if (expectedAttemptId && expectedAttemptId !== activeAttemptId) return;
      if (direction === "receiver") mediaDiagnostics.receiverStats = summary;
      else mediaDiagnostics.senderStats = summary;
    });
  }

  function stopPrivateQualityController(reason = "share_stopped") {
    if (!privateQualityController) return false;
    try { privateQualityController.stop(); } catch (_) {}
    mediaDiagnostics.privateQualityController = {
      ...privateQualityController.getSnapshot(),
      stopReason: String(reason || "share_stopped").slice(0, 100),
    };
    privateQualityController = null;
    privateQualityPreviousRtcSample = null;
    return true;
  }

  async function readPrivateQualityControllerSample(track = null) {
    if (!track || typeof track.getRTCStatsReport !== "function") return null;
    const report = await track.getRTCStatsReport();
    const current = readVideoRtcStatsSample(report, "sender");
    if (!current) return null;
    const previous = privateQualityPreviousRtcSample;
    privateQualityPreviousRtcSample = current;
    const summary = previous ? summarizeBoundedVideoStats([previous, current], "sender") : null;
    const encoding = summary?.encodings?.[0] || current?.streams?.[0] || null;
    return {
      sampledAt: current.sampledAt,
      availableOutgoingBitrate: Number(current?.candidatePair?.availableOutgoingBitrate || 0) || null,
      targetBitrate: Number(encoding?.targetBitrate || 0) || null,
      encoderTargetBitrate: Number(encoding?.targetBitrate || 0) || null,
      actualBitrate: Number(summary?.encodings?.[0]?.bitrateBps || 0) || null,
      fps: Number(summary?.encodings?.[0]?.measuredFps || encoding?.framesPerSecond || 0) || 0,
      width: Number(encoding?.width || 0) || null,
      height: Number(encoding?.height || 0) || null,
      qualityLimitationReason: String(encoding?.qualityLimitationReason || "").trim() || null,
      qualityLimitationDurations: encoding?.qualityLimitationDurations
        ? { ...encoding.qualityLimitationDurations }
        : null,
      codec: String(encoding?.codec || "").trim() || null,
      encoderImplementation: String(encoding?.encoderImplementation || "").trim() || null,
      averageEncodeMsPerFrame: Number(encoding?.averageEncodeMsPerFrame || 0) || null,
      framesDropped: Number(encoding?.framesDropped || 0) || 0,
      packetsLost: summary
        ? (Number(encoding?.remotePacketsLostDelta || 0) || 0)
        : 0,
      roundTripTimeMs: Number.isFinite(Number(encoding?.remoteRoundTripTimeSeconds))
        ? Math.round(Number(encoding.remoteRoundTripTimeSeconds) * 1000)
        : (Number(current?.candidatePair?.currentRoundTripTimeSeconds || 0) > 0
          ? Math.round(Number(current.candidatePair.currentRoundTripTimeSeconds) * 1000)
          : null),
    };
  }

  function isPrivate720p60Request(captureRequest = null, publishDiagnostics = null) {
    const metrics = publishDiagnostics && typeof publishDiagnostics === "object"
      ? publishDiagnostics
      : readCaptureRequestMetrics(captureRequest);
    return isPrivateOneToOne
      && Number(metrics?.requestedFps || 0) >= 50
      && Number(metrics?.requestedHeight || 0) > 0
      && Number(metrics?.requestedHeight || 0) <= 720;
  }

  async function applyAndRecordPrivate720p60SenderPolicy(publication = null, {
    reason = "post_publish",
    expectedMaxBitrate = null,
  } = {}) {
    const result = await applyPrivate720p60SenderPolicy(publication, {
      reason,
      expectedMaxBitrate: Number(expectedMaxBitrate || mediaDiagnostics.publishSettings?.maxBitrate || 0)
        || PRIVATE_720P60_MAX_BITRATE,
    });
    mediaDiagnostics.senderParametersBeforeMotionPolicy = result?.before
      ? { ...result.before, encodings: result.before.encodings?.map((entry) => ({ ...entry })) || [] }
      : null;
    mediaDiagnostics.senderParametersAfterMotionPolicy = result?.after
      ? { ...result.after, encodings: result.after.encodings?.map((entry) => ({ ...entry })) || [] }
      : null;
    mediaDiagnostics.senderMotionPolicyApplyCount = Number(mediaDiagnostics.senderMotionPolicyApplyCount || 0) + 1;
    mediaDiagnostics.senderMotionPolicyLastReason = String(reason || "post_publish").slice(0, 100);
    mediaDiagnostics.senderMotionPolicyLastOutcome = String(result?.reason || "unknown").slice(0, 100);
    mediaDiagnostics.senderMotionPolicyVerified = result?.verified === true;
    mediaDiagnostics.senderMotionPolicyMutationAttempted = result?.mutationAttempted === true;
    return result;
  }

  async function applyPrivateQualityTier(publication = null, captureRequest = null, tier = "720") {
    const sender = publication?.track?.sender || null;
    if (!sender || typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") {
      return { applied: false, reason: "sender_parameters_unavailable" };
    }
    const params = sender.getParameters();
    const encodings = Array.isArray(params?.encodings) ? params.encodings : [];
    if (encodings.length !== 1) return { applied: false, reason: "single_encoding_required" };
    const targetTier = String(tier || "720") === "1080" ? "1080" : "720";
    const trackSettings = publication?.track?.mediaStreamTrack?.getSettings?.() || {};
    const captureMetrics = readCaptureRequestMetrics(captureRequest);
    const sourceHeight = Number(trackSettings?.height || captureMetrics.requestedHeight || 1080) || 1080;
    const targetHeight = targetTier === "1080" ? 1080 : 720;
    const scaleResolutionDownBy = Number(Math.max(1, sourceHeight / targetHeight).toFixed(3));
    encodings[0].scaleResolutionDownBy = scaleResolutionDownBy;
    encodings[0].maxFramerate = 30;
    encodings[0].maxBitrate = targetTier === "1080" ? 5_000_000 : 2_500_000;
    params.degradationPreference = "maintain-framerate";
    await sender.setParameters(params);
    return {
      applied: true,
      tier: targetTier,
      scaleResolutionDownBy,
      maxFramerate: 30,
      maxBitrate: encodings[0].maxBitrate,
      trackRecreated: false,
      roomRecreated: false,
      publicationRecreated: false,
    };
  }

  function startPrivateQualityController(publication = null, captureRequest = null, publishDiagnostics = {}) {
    stopPrivateQualityController("new_share");
    const transportProfile = String(publishDiagnostics.privateTransportProfile || "").trim();
    const supportedProfile = transportProfile === "single_maintain_framerate"
      || transportProfile === "single_720p60_maintain_framerate"
      || transportProfile === "single_720p60_h264_maintain_framerate";
    if (!isPrivateOneToOne || !supportedProfile) {
      mediaDiagnostics.privateQualityController = {
        enabled: false,
        reason: isPrivateOneToOne ? "diagnostic_transport_profile" : "not_private_one_to_one",
      };
      return false;
    }
    const requestedHeight = Number(publishDiagnostics.requestedHeight || 0) || 720;
    const requestedFps = Math.max(1, Number(publishDiagnostics.requestedFps || 30) || 30);
    const preferredTier = requestedHeight > 720 ? "1080" : "720";
    const localTrack = publication?.track || null;
    privateQualityPreviousRtcSample = null;
    privateQualityController = createPrivateScreenShareQualityController({
      preferredTier,
      targetFps: requestedFps,
      preferredBitrate: Number(publishDiagnostics.maxBitrate || 0)
        || (preferredTier === "1080" ? 5_000_000 : 2_500_000),
      getSample: () => readPrivateQualityControllerSample(localTrack),
      applyTier: (tier) => applyPrivateQualityTier(publication, captureRequest, tier),
      onStateChange: (entry) => {
        mediaDiagnostics.privateQualityController = privateQualityController?.getSnapshot?.() || {
          enabled: true,
          state: entry?.state || null,
        };
        emit("screenshare.private_quality_state_changed", {
          state: entry?.state || null,
          reason: entry?.reason || null,
        });
      },
    });
    privateQualityController.start();
    mediaDiagnostics.privateQualityController = privateQualityController.getSnapshot();
    return true;
  }

  function startBoundedRemoteRenderStats(video = null, attemptId = "") {
    if (remoteRenderStatsTimer) clearTimeout(remoteRenderStatsTimer);
    remoteRenderStatsTimer = null;
    if (!performanceDiagnosticsEnabled || !video || typeof video.getVideoPlaybackQuality !== "function") return;
    const expectedAttemptId = String(attemptId || "").trim();
    let first = null;
    try { first = video.getVideoPlaybackQuality(); } catch (_) { first = null; }
    const startedAt = Date.now();
    remoteRenderStatsTimer = setTimeout(() => {
      remoteRenderStatsTimer = null;
      if (expectedAttemptId && expectedAttemptId !== mediaDiagnostics.remotePerformanceAttemptId) return;
      let last = null;
      try { last = video.getVideoPlaybackQuality(); } catch (_) { last = null; }
      if (!first || !last) return;
      const elapsedMs = Math.max(1, Date.now() - startedAt);
      const totalDelta = Math.max(0, Number(last.totalVideoFrames || 0) - Number(first.totalVideoFrames || 0));
      const droppedDelta = Math.max(0, Number(last.droppedVideoFrames || 0) - Number(first.droppedVideoFrames || 0));
      mediaDiagnostics.remoteRenderStats = {
        bounded: true,
        sampleWindowMs: elapsedMs,
        renderedFps: Number(((totalDelta - droppedDelta) * 1000 / elapsedMs).toFixed(1)),
        totalFrames: totalDelta,
        droppedFrames: droppedDelta,
      };
    }, 2000);
  }

  function recordStageActivity(action = "stage_activity") {
    if (!performanceDiagnosticsEnabled) return false;
    const atMs = Date.now();
    remoteStageActivity.push({ atMs, action: String(action || "stage_activity").slice(0, 80) });
    const cutoff = atMs - 10_000;
    while (remoteStageActivity.length > 200 || (remoteStageActivity[0]?.atMs || 0) < cutoff) {
      remoteStageActivity.shift();
    }
    return true;
  }

  function buildStageActivitySnapshot() {
    const nowMs = Date.now();
    const recent = remoteStageActivity.filter((entry) => entry.atMs >= nowMs - 10_000);
    const counts = {};
    recent.forEach((entry) => {
      counts[entry.action] = Number(counts[entry.action] || 0) + 1;
    });
    return {
      windowMs: 10_000,
      total: recent.length,
      eventsPerSecond: Number((recent.length / 10).toFixed(1)),
      counts,
    };
  }

  function readVideoPlaybackQuality(video = null) {
    if (!video || typeof video.getVideoPlaybackQuality !== "function") return null;
    try {
      const quality = video.getVideoPlaybackQuality();
      return {
        totalVideoFrames: Number(quality?.totalVideoFrames || 0) || 0,
        droppedVideoFrames: Number(quality?.droppedVideoFrames || 0) || 0,
      };
    } catch (_) {
      return null;
    }
  }

  function waitForVideoPresentation(video = null, timeoutMs = 800) {
    if (!video) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (presented) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(!!presented);
      };
      const timer = setTimeout(() => finish(false), Math.max(100, Number(timeoutMs) || 800));
      if (typeof video.requestVideoFrameCallback === "function") {
        try {
          video.requestVideoFrameCallback(() => finish(true));
          return;
        } catch (_) {}
      }
      video.addEventListener?.("loadeddata", () => finish(true), { once: true });
    });
  }

  function sampleVideoPresentation(video = null, durationMs = 2000) {
    const sampleMs = Math.max(500, Math.min(5000, Number(durationMs) || 2000));
    if (!video) return Promise.resolve({ status: "unavailable", sampleWindowMs: 0 });
    const qualityBefore = readVideoPlaybackQuality(video);
    const startedAt = Date.now();
    let callbackCount = 0;
    let firstPresentedFrames = null;
    let lastPresentedFrames = null;
    let callbackHandle = 0;
    let sampling = true;
    const onFrame = (_now, metadata = {}) => {
      if (!sampling) return;
      callbackCount += 1;
      const presentedFrames = Number(metadata?.presentedFrames || 0);
      if (Number.isFinite(presentedFrames) && presentedFrames > 0) {
        if (firstPresentedFrames == null) firstPresentedFrames = presentedFrames;
        lastPresentedFrames = presentedFrames;
      }
      try { callbackHandle = video.requestVideoFrameCallback(onFrame); } catch (_) { callbackHandle = 0; }
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      try { callbackHandle = video.requestVideoFrameCallback(onFrame); } catch (_) { callbackHandle = 0; }
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        sampling = false;
        if (callbackHandle && typeof video.cancelVideoFrameCallback === "function") {
          try { video.cancelVideoFrameCallback(callbackHandle); } catch (_) {}
        }
        const elapsedMs = Math.max(1, Date.now() - startedAt);
        const qualityAfter = readVideoPlaybackQuality(video);
        const totalDelta = qualityBefore && qualityAfter
          ? Math.max(0, qualityAfter.totalVideoFrames - qualityBefore.totalVideoFrames)
          : null;
        const droppedDelta = qualityBefore && qualityAfter
          ? Math.max(0, qualityAfter.droppedVideoFrames - qualityBefore.droppedVideoFrames)
          : null;
        const presentedDelta = firstPresentedFrames != null && lastPresentedFrames != null
          ? Math.max(0, lastPresentedFrames - firstPresentedFrames + 1)
          : callbackCount;
        resolve({
          status: "sampled",
          bounded: true,
          sampleWindowMs: elapsedMs,
          callbackFrames: callbackCount,
          presentedFrames: presentedDelta,
          renderedFps: Number((presentedDelta * 1000 / elapsedMs).toFixed(1)),
          playbackTotalFrames: totalDelta,
          droppedFrames: droppedDelta,
          connected: video.isConnected === true,
          readyState: Number(video.readyState || 0),
          width: Number(video.videoWidth || 0) || null,
          height: Number(video.videoHeight || 0) || null,
        });
      }, sampleMs);
    });
  }

  async function runRemoteRenderComparison({ durationMs = 2000 } = {}) {
    if (!performanceDiagnosticsEnabled) return { status: "unavailable", reason: "development_only" };
    if (remoteRenderComparisonPromise) return remoteRenderComparisonPromise;
    const remoteRecord = readActiveShareRecord();
    const liveKitTrack = remoteRecord?.liveKitTrack || null;
    const stageVideo = remoteRecord?.attachedVideoElement || null;
    if (!isRemoteShareRecord(remoteRecord) || !liveKitTrack || !stageVideo?.isConnected) {
      return { status: "unavailable", reason: "active_sdk_attached_remote_share_required" };
    }
    remoteRenderComparisonPromise = (async () => {
      const startedAt = timestampNow();
      const cleanHost = document.createElement("div");
      cleanHost.setAttribute("data-altara-screenshare-render-probe", "1");
      cleanHost.style.cssText = "position:fixed;right:12px;top:12px;width:480px;max-width:40vw;aspect-ratio:16/9;z-index:2147483000;background:#000;overflow:hidden;contain:strict;pointer-events:none";
      const cleanVideo = document.createElement("video");
      cleanVideo.autoplay = true;
      cleanVideo.playsInline = true;
      cleanVideo.muted = true;
      cleanVideo.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;background:#000;transform:none;filter:none;transition:none;animation:none;opacity:1";
      cleanHost.appendChild(cleanVideo);
      document.body.appendChild(cleanHost);
      let sdkAttached = false;
      try {
        const attached = attachRemoteScreenshareTrack(liveKitTrack, cleanVideo);
        sdkAttached = !!attached;
        if (!sdkAttached) throw new Error("clean_video_sdk_attach_failed");
        try { await cleanVideo.play?.(); } catch (_) {}
        await waitForVideoPresentation(cleanVideo, 1000);
        const [stage, clean] = await Promise.all([
          sampleVideoPresentation(stageVideo, durationMs),
          sampleVideoPresentation(cleanVideo, durationMs),
        ]);
        const result = {
          status: "sampled",
          bounded: true,
          startedAt,
          finishedAt: timestampNow(),
          sameRemoteTrack: true,
          noSecondSubscription: true,
          sdkAttachedCleanVideo: true,
          stage,
          clean,
        };
        mediaDiagnostics.remoteRenderComparison = result;
        return result;
      } catch (error) {
        const result = {
          status: "failed",
          bounded: true,
          startedAt,
          finishedAt: timestampNow(),
          sameRemoteTrack: true,
          noSecondSubscription: true,
          sdkAttachedCleanVideo: sdkAttached,
          errorName: String(error?.name || "Error").slice(0, 120),
          errorMessage: String(error?.message || error || "").slice(0, 280),
        };
        mediaDiagnostics.remoteRenderComparison = result;
        return result;
      } finally {
        try { liveKitTrack.detach?.(cleanVideo); } catch (_) {
          try { cleanVideo.srcObject = null; } catch (_) {}
        }
        try { cleanVideo.pause?.(); } catch (_) {}
        cleanHost.remove?.();
      }
    })().finally(() => {
      remoteRenderComparisonPromise = null;
    });
    return remoteRenderComparisonPromise;
  }

  function buildPerformanceSnapshot() {
    const local = {
      attemptId: mediaDiagnostics.localPerformanceAttemptId,
      t0StartStreamingClickAt: mediaDiagnostics.startStreamingClickedAt,
      t1CaptureRequestAt: mediaDiagnostics.captureRequestedAt,
      t2TrackAcquiredAt: mediaDiagnostics.mediaAcquiredAt,
      t3FirstLocalFrameAt: mediaDiagnostics.localFirstFrameAt,
      t4PublishStartedAt: mediaDiagnostics.publishStartedAt,
      t5PublishSucceededAt: mediaDiagnostics.publishSucceededAt,
      clickToCaptureRequestMs: durationBetween(mediaDiagnostics.startStreamingClickedAt, mediaDiagnostics.captureRequestedAt),
      clickToTrackAcquiredMs: durationBetween(mediaDiagnostics.startStreamingClickedAt, mediaDiagnostics.mediaAcquiredAt),
      captureRequestToTrackMs: durationBetween(mediaDiagnostics.captureRequestedAt, mediaDiagnostics.mediaAcquiredAt),
      trackToFirstLocalFrameMs: durationBetween(mediaDiagnostics.mediaAcquiredAt, mediaDiagnostics.localFirstFrameAt),
      trackToPublishStartMs: durationBetween(mediaDiagnostics.mediaAcquiredAt, mediaDiagnostics.publishStartedAt),
      publishStartToSucceededMs: durationBetween(mediaDiagnostics.publishStartedAt, mediaDiagnostics.publishSucceededAt),
      captureToPublishMs: durationBetween(mediaDiagnostics.mediaAcquiredAt, mediaDiagnostics.publishSucceededAt),
      clickToPublishSucceededMs: durationBetween(mediaDiagnostics.startStreamingClickedAt, mediaDiagnostics.publishSucceededAt),
      senderStats: mediaDiagnostics.senderStats ? { ...mediaDiagnostics.senderStats } : null,
    };
    const remote = {
      attemptId: mediaDiagnostics.remotePerformanceAttemptId,
      t0StartStreamingClickAt: mediaDiagnostics.remotePerformanceStartStreamingClickedAt,
      t4PublishStartedAt: mediaDiagnostics.remotePerformancePublishStartedAt,
      t6RemoteTrackSubscribedAt: mediaDiagnostics.remoteTrackSubscribedAt,
      t7RemoteVideoAttachedAt: mediaDiagnostics.remoteVideoAttachedAt,
      t8FirstRemoteRenderedFrameAt: mediaDiagnostics.remoteFirstFrameAt,
      publishStartToRemoteSubscribeMs: durationBetween(mediaDiagnostics.remotePerformancePublishStartedAt, mediaDiagnostics.remoteTrackSubscribedAt),
      remoteSubscribeToAttachMs: durationBetween(mediaDiagnostics.remoteTrackSubscribedAt, mediaDiagnostics.remoteVideoAttachedAt),
      remoteAttachToFirstFrameMs: durationBetween(mediaDiagnostics.remoteVideoAttachedAt, mediaDiagnostics.remoteFirstFrameAt),
      remoteSubscribeToFirstFrameMs: durationBetween(mediaDiagnostics.remoteTrackSubscribedAt, mediaDiagnostics.remoteFirstFrameAt),
      clickToRemoteFirstFrameMs: durationBetween(mediaDiagnostics.remotePerformanceStartStreamingClickedAt, mediaDiagnostics.remoteFirstFrameAt),
      wallClockCorrelation: mediaDiagnostics.remotePerformanceAttemptId ? "sender_track_marker_dev_only" : null,
      receiverStats: mediaDiagnostics.receiverStats ? { ...mediaDiagnostics.receiverStats } : null,
      renderStats: mediaDiagnostics.remoteRenderStats ? { ...mediaDiagnostics.remoteRenderStats } : null,
    };
    return {
      enabled: !!performanceDiagnosticsEnabled,
      samplePolicy: "six_samples_over_five_seconds_per_track",
      local,
      remote,
    };
  }

  function recordRemoteRenderMilestone({
    trackId = "",
    attachedAt = null,
    firstFrameAt = null,
    videoElement = null,
  } = {}) {
    const normalizedTrackId = normalizeId(trackId || "");
    if (!normalizedTrackId) return false;
    const remoteRecord = Array.from(shareRecordsByKey.values()).find((record) => (
      isRemoteShareRecord(record)
      && [record?.trackSid, record?.trackId, record?.track?.sid, record?.track?.mediaStreamTrack?.id, record?.track?.id]
        .some((candidate) => normalizeId(candidate || "") === normalizedTrackId)
    )) || null;
    if (!remoteRecord) return false;
    if (attachedAt && !mediaDiagnostics.remoteVideoAttachedAt) {
      mediaDiagnostics.remoteVideoAttachedAt = String(attachedAt || "").trim() || timestampNow();
      startBoundedRemoteRenderStats(videoElement, mediaDiagnostics.remotePerformanceAttemptId || "");
    }
    if (firstFrameAt && !mediaDiagnostics.remoteFirstFrameAt) {
      mediaDiagnostics.remoteFirstFrameAt = String(firstFrameAt || "").trim() || timestampNow();
    }
    return true;
  }

  function registerDisplayCaptureStream(stream = null) {
    if (!stream || typeof stream.getTracks !== "function" || registeredDisplayCaptureStreams.has(stream)) return;
    registeredDisplayCaptureStreams.add(stream);
    mediaDiagnostics.displayCaptureStreamsCreated += 1;
    const nativeController = stream.__altaraNativeHighMotionController || null;
    const tracks = stream.getTracks();
    mediaDiagnostics.displayCaptureVideoTracksCreated += stream.getVideoTracks?.().length || 0;
    tracks.forEach((track) => {
      if (!track || String(track.readyState || "").trim().toLowerCase() === "ended") return;
      activeDisplayCaptureTracks.add(track);
      try {
        track.addEventListener("ended", () => {
          activeDisplayCaptureTracks.delete(track);
          if (String(track.kind || "").toLowerCase() === "video"
            && nativeController && typeof nativeController.stop === "function") {
            try { void nativeController.stop({ reason: "native_track_ended" }); } catch (_) {}
          }
        }, { once: true });
      } catch (_) {}
    });
  }

  function stopDisplayCaptureStream(stream = null) {
    if (!stream || typeof stream.getTracks !== "function") return;
    const nativeController = stream.__altaraNativeHighMotionController || null;
    if (nativeController && typeof nativeController.stop === "function") {
      try { void nativeController.stop({ reason: "screenshare_stream_cleanup" }); } catch (_) {}
    }
    stream.getTracks().forEach((track) => {
      if (!track) return;
      if (!stoppedDisplayCaptureTracks.has(track)) {
        stoppedDisplayCaptureTracks.add(track);
        mediaDiagnostics.displayCaptureTracksStopped += 1;
        try { track.stop?.(); } catch (_) {}
      }
      activeDisplayCaptureTracks.delete(track);
    });
  }

  function sanitizeDiagnosticText(value = "", maxLength = 1200) {
    const max = Math.max(80, Math.min(8000, Number(maxLength || 0) || 1200));
    return String(value || "")
      .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, "$1[redacted]")
      .replace(/([?&](?:access_token|token|apikey|api_key|key)=)[^&\s]+/gi, "$1[redacted]")
      .slice(0, max) || null;
  }

  function readDiagnosticError(error = null) {
    if (!error) return { name: null, message: null, stack: null };
    return {
      name: sanitizeDiagnosticText(error?.name || "Error", 160),
      message: sanitizeDiagnosticText(error?.message || error || "", 1600),
      stack: sanitizeDiagnosticText(error?.stack || "", 7000),
    };
  }

  function cloneServerStartTrace(trace = serverStartTrace) {
    if (!trace) return null;
    return {
      ...trace,
      lastError: trace.lastError ? { ...trace.lastError } : null,
      stages: Object.fromEntries(Object.entries(trace.stages || {}).map(([name, stage]) => [
        name,
        {
          ...stage,
          error: stage?.error ? { ...stage.error } : null,
          details: stage?.details ? { ...stage.details } : null,
        },
      ])),
    };
  }

  function refreshServerStartTraceCurrentStage() {
    if (!serverStartTrace) return;
    const pending = Object.entries(serverStartTrace.stages || {})
      .filter(([, stage]) => stage?.status === "pending")
      .sort(([, left], [, right]) => Number(right?.startedAtMs || 0) - Number(left?.startedAtMs || 0));
    serverStartTrace.currentStage = pending[0]?.[0]
      || (serverStartTrace.starting ? serverStartTrace.currentStage : null);
  }

  function beginServerStartTrace({ triggerReason = "manual_toggle", shareAttempt = 0 } = {}) {
    if (!serverStartTraceEnabled) return null;
    const startedAtMs = Date.now();
    serverStartTrace = {
      attemptId: Number(shareAttempt || 0) || null,
      triggerReason: String(triggerReason || "").trim() || "manual_toggle",
      starting: true,
      currentStage: null,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      finishedAt: null,
      durationMs: null,
      lastError: null,
      stages: {},
    };
    return serverStartTrace;
  }

  function beginServerStartTraceStage(name = "", details = null) {
    if (!serverStartTraceEnabled || !serverStartTrace) return null;
    const stageName = String(name || "").trim();
    if (!stageName) return null;
    const startedAtMs = Date.now();
    serverStartTrace.stages[stageName] = {
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      finishedAt: null,
      durationMs: null,
      status: "pending",
      error: null,
      details: details && typeof details === "object" ? { ...details } : null,
    };
    serverStartTrace.currentStage = stageName;
    return serverStartTrace.stages[stageName];
  }

  function finishServerStartTraceStage(name = "", status = "resolved", error = null, details = null) {
    if (!serverStartTraceEnabled || !serverStartTrace) return null;
    const stageName = String(name || "").trim();
    if (!stageName) return null;
    const existing = serverStartTrace.stages[stageName]
      || beginServerStartTraceStage(stageName, details);
    if (!existing) return null;
    const finishedAtMs = Date.now();
    existing.finishedAt = new Date(finishedAtMs).toISOString();
    existing.finishedAtMs = finishedAtMs;
    existing.durationMs = Math.max(0, finishedAtMs - Number(existing.startedAtMs || finishedAtMs));
    existing.status = status === "rejected" ? "rejected" : "resolved";
    existing.error = error ? readDiagnosticError(error) : null;
    if (details && typeof details === "object") {
      existing.details = { ...(existing.details || {}), ...details };
    }
    if (existing.status === "rejected") {
      serverStartTrace.lastError = existing.error;
    }
    refreshServerStartTraceCurrentStage();
    return existing;
  }

  function markServerStartTraceStage(name = "", details = null) {
    if (!beginServerStartTraceStage(name, details)) return null;
    return finishServerStartTraceStage(name, "resolved", null, details);
  }

  function traceServerStartAwait(name = "", operation = null, details = null) {
    if (!serverStartTraceEnabled) return operation();
    beginServerStartTraceStage(name, details);
    let operationResult;
    try {
      operationResult = operation();
    } catch (error) {
      finishServerStartTraceStage(name, "rejected", error, details);
      throw error;
    }
    return Promise.resolve(operationResult).then(
      (result) => {
        finishServerStartTraceStage(name, "resolved", null, details);
        return result;
      },
      (error) => {
        finishServerStartTraceStage(name, "rejected", error, details);
        throw error;
      },
    );
  }

  function rejectPendingServerStartTrace(error = null) {
    if (!serverStartTraceEnabled || !serverStartTrace) return;
    Object.entries(serverStartTrace.stages || {}).forEach(([name, stage]) => {
      if (stage?.status === "pending") finishServerStartTraceStage(name, "rejected", error);
    });
    serverStartTrace.lastError = readDiagnosticError(error);
  }

  function finishServerStartTrace(error = null) {
    if (!serverStartTraceEnabled || !serverStartTrace) return;
    const finishedAtMs = Date.now();
    serverStartTrace.starting = false;
    serverStartTrace.finishedAt = new Date(finishedAtMs).toISOString();
    serverStartTrace.durationMs = Math.max(0, finishedAtMs - Number(serverStartTrace.startedAtMs || finishedAtMs));
    if (error) serverStartTrace.lastError = readDiagnosticError(error);
    refreshServerStartTraceCurrentStage();
  }

  function recordCapturePhase(phase = "", details = {}) {
    const normalizedPhase = normalizeScreensharePhaseName(phase);
    if (!normalizedPhase) return null;
    const payload = details && typeof details === "object" && !Array.isArray(details) ? details : {};
    const errorDetails = readDiagnosticError(payload.error || null);
    const at = String(payload.at || "").trim() || timestampNow();
    const entry = {
      phase: normalizedPhase,
      at,
      handoffId: String(payload.handoffId || "").trim() || null,
      selectedSourceType: String(payload.selectedSourceType || "").trim() || null,
      audioRequested: typeof payload.audioRequested === "boolean" ? payload.audioRequested : null,
      captureAttempt: String(payload.captureAttempt || "").trim() || null,
      reason: sanitizeDiagnosticText(payload.reason || "", 240),
      requestUserGesture: typeof payload.requestUserGesture === "boolean" ? payload.requestUserGesture : null,
      videoTrackCount: Number.isFinite(Number(payload.videoTrackCount)) ? Number(payload.videoTrackCount) : null,
      audioTrackCount: Number.isFinite(Number(payload.audioTrackCount)) ? Number(payload.audioTrackCount) : null,
      videoReadyState: String(payload.videoReadyState || "").trim().toLowerCase() || null,
      errorName: errorDetails.name,
      errorMessage: errorDetails.message,
      nativeHighMotionEligibility: payload?.nativeHighMotionEligibility && typeof payload.nativeHighMotionEligibility === "object"
        ? {
          experimentEnabled: payload.nativeHighMotionEligibility.experimentEnabled === true,
          parentLauncherFlagSeen: payload.nativeHighMotionEligibility.parentLauncherFlagSeen === true,
          environmentFlagSeenAtMain: payload.nativeHighMotionEligibility.environmentFlagSeenAtMain === true,
          mainProcessExperimentEnabled: payload.nativeHighMotionEligibility.mainProcessExperimentEnabled === true,
          trustedPreloadExperimentEnabled: payload.nativeHighMotionEligibility.trustedPreloadExperimentEnabled === true,
          developmentRuntime: payload.nativeHighMotionEligibility.developmentRuntime === true,
          electronRuntime: payload.nativeHighMotionEligibility.electronRuntime === true,
          privateOneToOne: payload.nativeHighMotionEligibility.privateOneToOne === true,
          selectedSourceType: String(payload.nativeHighMotionEligibility.selectedSourceType || "").trim() || null,
          selectedSourceIdPresent: payload.nativeHighMotionEligibility.selectedSourceIdPresent === true,
          presetEligible: payload.nativeHighMotionEligibility.presetEligible === true,
          nativeApiAvailable: payload.nativeHighMotionEligibility.nativeApiAvailable === true,
          monitorMappingAvailable: payload.nativeHighMotionEligibility.monitorMappingAvailable === true,
          mappedMonitorIndex: Number.isInteger(payload.nativeHighMotionEligibility.mappedMonitorIndex)
            ? payload.nativeHighMotionEligibility.mappedMonitorIndex
            : null,
          mappedMonitorHandle: payload.nativeHighMotionEligibility.mappedMonitorHandle === true,
          mappingMethod: String(payload.nativeHighMotionEligibility.mappingMethod || "").trim() || null,
          eligible: payload.nativeHighMotionEligibility.eligible === true,
          rejectionReason: sanitizeDiagnosticText(payload.nativeHighMotionEligibility.rejectionReason || "", 160),
        }
        : null,
    };
    mediaDiagnostics.phase = normalizedPhase;
    mediaDiagnostics.phases = [...mediaDiagnostics.phases.slice(-79), entry];
    if (normalizedPhase === "getDisplayMedia_called" || normalizedPhase === "source_id_fallback_started") {
      mediaDiagnostics.displayCaptureRequests += 1;
    }
    if (payload?.session && typeof payload.session === "object") {
      mediaDiagnostics.pendingDisplayCaptureHandlers = Math.max(
        0,
        Number(payload.session.pendingDisplayCaptureHandlers || 0) || 0,
      );
    }
    if (payload.selectedSourceId !== undefined) {
      mediaDiagnostics.selectedSourceId = String(payload.selectedSourceId || "").trim() || null;
    }
    if (entry.selectedSourceType) mediaDiagnostics.selectedSourceType = entry.selectedSourceType;
    if (entry.handoffId) mediaDiagnostics.captureHandoffId = entry.handoffId;
    if (typeof entry.audioRequested === "boolean") {
      mediaDiagnostics.audioRequested = mediaDiagnostics.audioRequested || entry.audioRequested;
    }
    if (entry.captureAttempt) mediaDiagnostics.captureAttempt = entry.captureAttempt;
    if (entry.nativeHighMotionEligibility) {
      mediaDiagnostics.nativeHighMotionEligibility = { ...entry.nativeHighMotionEligibility };
    }
    if (normalizedPhase === "getDisplayMedia_failed") {
      mediaDiagnostics.displayMediaFailure = { ...errorDetails, at };
    }
    if (normalizedPhase === "getDisplayMedia_resolved") {
      mediaDiagnostics.winningCapturePath = "display_media";
      mediaDiagnostics.videoTrackCount = Math.max(0, Number(entry.videoTrackCount || 0));
    }
    if (normalizedPhase === "source_id_fallback_started") {
      mediaDiagnostics.captureFallbackReason = entry.reason || "display_media_not_readable";
      mediaDiagnostics.sourceIdFallbackStartedAt = at;
      mediaDiagnostics.audioFallbackAttempted = mediaDiagnostics.audioRequested;
      mediaDiagnostics.audioFallbackResult = mediaDiagnostics.audioRequested ? "pending" : mediaDiagnostics.audioFallbackResult;
    }
    if (normalizedPhase === "source_id_fallback_resolved") {
      mediaDiagnostics.sourceIdFallbackResolvedAt = at;
      mediaDiagnostics.winningCapturePath = "source_id_video";
      mediaDiagnostics.videoTrackCount = Math.max(0, Number(entry.videoTrackCount || 0));
      mediaDiagnostics.screenAudioUnavailable = mediaDiagnostics.audioRequested;
      if (mediaDiagnostics.audioRequested) mediaDiagnostics.audioFallbackResult = "succeeded_video_only";
    }
    if (normalizedPhase === "source_id_fallback_failed") {
      mediaDiagnostics.sourceIdFallbackFailure = { ...errorDetails, at };
      if (mediaDiagnostics.audioRequested) mediaDiagnostics.audioFallbackResult = "failed";
    }
    return entry;
  }

  function persistTerminalShareError(error = null, stage = "start") {
    const details = readDiagnosticError(error);
    mediaDiagnostics.exceptionName = details.name;
    mediaDiagnostics.exceptionMessage = details.message;
    mediaDiagnostics.exceptionStack = details.stack;
    mediaDiagnostics.failurePhase = mediaDiagnostics.phase || String(stage || "start");
    mediaDiagnostics.lastShareErrorName = mediaDiagnostics.lastShareErrorName || details.name;
    mediaDiagnostics.lastShareErrorCode = mediaDiagnostics.lastShareErrorCode || getSafeCaptureErrorCode(error);
    mediaDiagnostics.lastShareErrorStage = mediaDiagnostics.lastShareErrorStage || String(stage || "start");
    mediaDiagnostics.lastShareErrorCategory = mediaDiagnostics.lastShareErrorCategory || classifyShareError(error, stage);
  }

  function persistPublishError(error = null) {
    const details = readDiagnosticError(error);
    mediaDiagnostics.publishErrorName = details.name;
    mediaDiagnostics.publishErrorMessage = details.message;
    mediaDiagnostics.publishErrorStack = details.stack;
  }

  if (typeof subscribeDesktopCapturePhases === "function") {
    try {
      unsubscribeDesktopCapturePhases = subscribeDesktopCapturePhases((payload = {}) => {
        const phase = String(payload?.phase || "").trim().toLowerCase();
        if (phase !== "session_handler_ready" && phase !== "session_handler_rejected") return;
        const incomingHandoffId = String(payload?.handoffId || "").trim();
        const activeHandoffId = String(mediaDiagnostics.captureHandoffId || "").trim();
        if (incomingHandoffId && activeHandoffId && incomingHandoffId !== activeHandoffId) return;
        recordCapturePhase(phase, payload);
      });
    } catch (_) {
      unsubscribeDesktopCapturePhases = null;
    }
  }

  function classifyShareError(error = null, stage = "") {
    return classifyScreenshareCaptureError(error, stage);
  }

  function setShareLifecycleState(nextState, {
    triggerReason = "state_changed",
    callerFunction = "setShareLifecycleState",
    notifyUi = true,
  } = {}) {
    const normalized = String(nextState || "").trim().toLowerCase();
    if (!normalized || normalized === localShareLifecycleState) return;
    localShareLifecycleState = normalized;
    emit("screenshare.lifecycle_changed", {
      triggerReason: String(triggerReason || "").trim() || "state_changed",
      callerFunction: String(callerFunction || "").trim() || "setShareLifecycleState",
      shareState: localShareLifecycleState,
    });
    if (notifyUi) emitStateChanged(triggerReason, callerFunction);
  }

  function normalizeCapturePreferenceForEntitlement({
    nextQualityPreset = qualityPreset,
    nextFpsPreset = fpsPreset,
    nextStreamPreset = streamPreset,
  } = {}) {
    const normalizedStreamPreset = normalizeScreenshareStreamPreset(
      nextStreamPreset || deriveStreamPresetFromQualityAndFps(nextQualityPreset, nextFpsPreset),
    );
    const derived = deriveQualityAndFpsFromStreamPreset(
      normalizedStreamPreset,
      nextFpsPreset || fpsPreset,
    );
    let normalizedQuality = normalizeScreenshareQualityPreset(derived.qualityPreset || nextQualityPreset);
    let normalizedFps = normalizeScreenshareFpsPreset(derived.fpsPreset || nextFpsPreset);
    let normalizedStream = deriveStreamPresetFromQualityAndFps(normalizedQuality, normalizedFps);
    let clampedByEntitlement = false;
    let planAccess = null;
    if (typeof normalizeCapturePreferencesForEntitlement === "function") {
      const callbackResult = safeInvoke(normalizeCapturePreferencesForEntitlement, {
        qualityPreset: normalizedQuality,
        fpsPreset: normalizedFps,
        streamPreset: normalizedStream,
      });
      if (callbackResult && typeof callbackResult === "object") {
        const callbackQuality = normalizeScreenshareQualityPreset(
          callbackResult?.qualityPreset || normalizedQuality,
        );
        const callbackFps = normalizeScreenshareFpsPreset(callbackResult?.fpsPreset || normalizedFps);
        const callbackStream = normalizeScreenshareStreamPreset(
          callbackResult?.streamPreset || deriveStreamPresetFromQualityAndFps(callbackQuality, callbackFps),
        );
        const callbackDerived = deriveQualityAndFpsFromStreamPreset(callbackStream, callbackFps);
        const resolvedQuality = normalizeScreenshareQualityPreset(
          callbackDerived.qualityPreset || callbackQuality,
        );
        const resolvedFps = normalizeScreenshareFpsPreset(
          callbackDerived.fpsPreset || callbackFps,
        );
        const resolvedStream = deriveStreamPresetFromQualityAndFps(resolvedQuality, resolvedFps);
        normalizedQuality = resolvedQuality;
        normalizedFps = resolvedFps;
        normalizedStream = resolvedStream;
        clampedByEntitlement = !!(
          callbackResult?.clampedByEntitlement
          || resolvedQuality !== normalizeScreenshareQualityPreset(derived.qualityPreset || nextQualityPreset)
          || resolvedFps !== normalizeScreenshareFpsPreset(derived.fpsPreset || nextFpsPreset)
          || resolvedStream !== normalizedStreamPreset
        );
        planAccess = String(callbackResult?.planAccess || "").trim().toLowerCase() || null;
      }
    }
    return {
      streamPreset: normalizedStream,
      qualityPreset: normalizedQuality,
      fpsPreset: normalizedFps,
      clampedByEntitlement,
      planAccess,
    };
  }

  {
    const normalizedInitialPreset = normalizeCapturePreferenceForEntitlement({
      nextQualityPreset: qualityPreset,
      nextFpsPreset: fpsPreset,
      nextStreamPreset: streamPreset,
    });
    qualityPreset = normalizedInitialPreset.qualityPreset;
    fpsPreset = normalizedInitialPreset.fpsPreset;
    streamPreset = normalizedInitialPreset.streamPreset;
    if (normalizedInitialPreset.clampedByEntitlement) {
      writeStoredValue(SERVER_VOICE_SCREENSHARE_STREAM_PRESET_STORAGE_KEY, normalizedInitialPreset.streamPreset);
      writeStoredValue(SERVER_VOICE_SCREENSHARE_QUALITY_STORAGE_KEY, normalizedInitialPreset.qualityPreset);
      writeStoredValue(SERVER_VOICE_SCREENSHARE_FPS_STORAGE_KEY, normalizedInitialPreset.fpsPreset);
    }
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
    const normalized = normalizeCapturePreferenceForEntitlement({
      nextQualityPreset: qualityPreset,
      nextFpsPreset: fpsPreset,
      nextStreamPreset: streamPreset,
    });
    qualityPreset = normalized.qualityPreset;
    fpsPreset = normalized.fpsPreset;
    streamPreset = normalized.streamPreset;
    return {
      streamPreset: normalized.streamPreset,
      streamPresetOptions: [...SERVER_VOICE_SCREENSHARE_STREAM_PRESETS],
      qualityPreset: normalized.qualityPreset,
      fpsPreset: normalized.fpsPreset,
      qualityPresetOptions: [...SERVER_VOICE_SCREENSHARE_QUALITY_PRESETS],
      fpsPresetOptions: [...SERVER_VOICE_SCREENSHARE_FPS_PRESETS],
      shareAudioEnabled: !!shareAudioEnabled,
      preferredSourceId: normalizeId(preferredSourceSelection?.sourceId || "") || null,
      preferredSourceKind: normalizeScreenshareSourceKind(preferredSourceSelection?.sourceKind || "") || null,
      preferredSourceName: String(preferredSourceSelection?.sourceName || "").trim() || null,
    };
  }

  function buildCurrentCaptureRequest() {
    const normalized = normalizeCapturePreferenceForEntitlement({
      nextQualityPreset: qualityPreset,
      nextFpsPreset: fpsPreset,
      nextStreamPreset: streamPreset,
    });
    const normalizedStreamPreset = normalized.streamPreset;
    const normalizedQuality = normalized.qualityPreset;
    const normalizedFps = normalized.fpsPreset;
    qualityPreset = normalizedQuality;
    fpsPreset = normalizedFps;
    streamPreset = normalizedStreamPreset;
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
    notifyUi = true,
  } = {}) {
    const normalized = normalizeCapturePreferenceForEntitlement({
      nextQualityPreset,
      nextFpsPreset,
      nextStreamPreset,
    });
    streamPreset = normalized.streamPreset;
    qualityPreset = normalized.qualityPreset;
    fpsPreset = normalized.fpsPreset;
    writeStoredValue(SERVER_VOICE_SCREENSHARE_STREAM_PRESET_STORAGE_KEY, normalized.streamPreset);
    writeStoredValue(SERVER_VOICE_SCREENSHARE_QUALITY_STORAGE_KEY, normalized.qualityPreset);
    writeStoredValue(SERVER_VOICE_SCREENSHARE_FPS_STORAGE_KEY, normalized.fpsPreset);
    emit("screenshare.preset_selected", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "commitCapturePreference",
      streamPreset: normalized.streamPreset,
      qualityPreset: normalized.qualityPreset,
      fpsPreset: normalized.fpsPreset,
      clampedByEntitlement: !!normalized.clampedByEntitlement,
      planAccess: normalized.planAccess || null,
    });
    emit("screenshare.preset_saved", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "commitCapturePreference",
      streamPreset: normalized.streamPreset,
      quality: normalized.qualityPreset,
      fps: normalized.fpsPreset,
      source: "screenshare_layer",
      reason: String(triggerReason || "").trim() || "preset_updated",
      shareAudioEnabled: !!shareAudioEnabled,
      clampedByEntitlement: !!normalized.clampedByEntitlement,
      planAccess: normalized.planAccess || null,
    });
    emit("screenshare.capture_preset_updated", {
      triggerReason: String(triggerReason || "").trim() || "preset_updated",
      callerFunction: String(callerFunction || "").trim() || "commitCapturePreference",
      streamPreset: normalized.streamPreset,
      qualityPreset: normalized.qualityPreset,
      fpsPreset: normalized.fpsPreset,
      clampedByEntitlement: !!normalized.clampedByEntitlement,
      planAccess: normalized.planAccess || null,
    });
    if (notifyUi) emitStateChanged(triggerReason, callerFunction);
    return {
      streamPreset: normalized.streamPreset,
      qualityPreset: normalized.qualityPreset,
      fpsPreset: normalized.fpsPreset,
      clampedByEntitlement: !!normalized.clampedByEntitlement,
      planAccess: normalized.planAccess || null,
    };
  }

  function commitShareAudioPreference(nextShareAudioEnabled, {
    triggerReason = "share_audio_updated",
    callerFunction = "commitShareAudioPreference",
    notifyUi = true,
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
    if (notifyUi) emitStateChanged(triggerReason, callerFunction);
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

  function isRemoteShareRecord(record = null) {
    return !!(record && !record.isLocal);
  }

  function isRemoteShareRecordWatched(record = null) {
    if (!isRemoteShareRecord(record)) return true;
    return remoteWatchedShareKeys.has(normalizeId(record?.key || ""));
  }

  function buildShareStateFromRecord(record = null) {
    if (!record || !record.ownerUserId) return null;
    const remote = isRemoteShareRecord(record);
    const subscribed = remote
      ? !!(record?.publication?.isSubscribed ?? record?.subscribed)
      : true;
    const watched = remote ? isRemoteShareRecordWatched(record) : true;
    return {
      key: record.key,
      ownerUserId: record.ownerUserId || "",
      ownerDisplayName: record.ownerDisplayName || "",
      isLocal: !!record.isLocal,
      isRemote: remote,
      isWatched: watched,
      isSubscribed: subscribed,
      hasPublication: !!record.publication,
      track: record.track || null,
      trackId: record.trackId || "",
      trackSid: record.trackSid || "",
      stream: record.stream || null,
      captureRequest: record.captureRequest || null,
      captureSettings: record.captureSettings || null,
      presentationState: String(record.presentationState || "").trim() || null,
      presentationUpdatedAt: Number(record.presentationUpdatedAt || 0) || null,
      presentationRetryAttempt: Number(record.presentationRetryAttempt || 0),
      presentationTimeline: Array.isArray(record.presentationTimeline)
        ? record.presentationTimeline.map((entry) => ({ ...entry }))
        : [],
      updatedAt: Number(record.updatedAt || 0),
    };
  }

  function buildState() {
    const records = Array.from(shareRecordsByKey.values());
    const shareStates = records
      .map((record) => buildShareStateFromRecord(record))
      .filter((record) => !!record);
    const active = readActiveShareRecord();
    const activeState = active
      ? (shareStates.find((record) => record.key === active.key) || buildShareStateFromRecord(active))
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
      shareState: localShareLifecycleState,
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
    notifyStateChange = true,
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey || !shareRecordsByKey.has(normalizedKey)) {
      if (activeShareKey) {
        activeShareKey = "";
        if (notifyStateChange) emitStateChanged(triggerReason, callerFunction);
      }
      return;
    }
    if (!force && activeShareKey === normalizedKey) return;
    activeShareKey = normalizedKey;
    if (notifyStateChange) emitStateChanged(triggerReason, callerFunction);
  }

  function pickFallbackActiveShareKey() {
    const records = Array.from(shareRecordsByKey.values());
    if (!records.length) return "";
    const rankRecord = (record) => {
      if (!record) return 0;
      const hasStream = !!record.stream;
      const watched = isRemoteShareRecord(record) ? isRemoteShareRecordWatched(record) : true;
      if (record.isLocal && hasStream) return 8;
      if (watched && hasStream) return 7;
      if (watched) return 6;
      if (hasStream) return 5;
      return 4;
    };
    const ordered = records
      .slice()
      .sort((left, right) => {
        const rankDiff = rankRecord(right) - rankRecord(left);
        if (rankDiff) return rankDiff;
        return Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0);
      });
    return normalizeId(ordered[0]?.key || "");
  }

  function applyRemotePublicationSubscription(record = null, subscribed = false, {
    triggerReason = "remote_subscription_update",
    callerFunction = "applyRemotePublicationSubscription",
  } = {}) {
    const remoteRecord = record && typeof record === "object" ? record : null;
    if (!isRemoteShareRecord(remoteRecord)) return;
    const publication = remoteRecord?.publication || null;
    if (!publication) return;
    const wantSubscribed = !!subscribed;
    try {
      if (typeof publication.setSubscribed === "function") {
        publication.setSubscribed(wantSubscribed);
      }
    } catch (_) {}
    try {
      if (typeof publication.setEnabled === "function") {
        publication.setEnabled(wantSubscribed);
      }
    } catch (_) {}
    if (wantSubscribed) {
      const receiveContract = applyRemoteScreenshareReceiveContract(publication, {
        previousSignature: remoteRecord.receiveContractSignature || "",
        verifiedNativeCompanion: remoteRecord.technicalCompanion === true,
      });
      remoteRecord.receiveContractSignature = receiveContract.signature || "";
      mediaDiagnostics.requestedRemoteVideoQuality = receiveContract.target?.quality || "high";
      mediaDiagnostics.requestedRemoteVideoDimensions = receiveContract.target
        ? { width: receiveContract.target.width, height: receiveContract.target.height }
        : null;
      mediaDiagnostics.requestedRemoteVideoFps = receiveContract.target?.fps || null;
      mediaDiagnostics.requestedRemoteVideoFpsAttribution = receiveContract.targetAttribution || null;
      mediaDiagnostics.remotePublication = {
        activePublicationMatched: remoteRecord.publication === publication,
        simulcasted: publication?.simulcasted === true,
        subscribed: publication?.isSubscribed === true,
        desired: publication?.isDesired === true,
        enabled: publication?.isEnabled !== false,
        videoTrackPresent: !!publication?.videoTrack || !!publication?.track,
        trackSidPresent: !!String(publication?.trackSid || "").trim(),
        videoQuality: publication?.videoQuality === VideoQuality.HIGH
          ? "high"
          : (String(publication?.videoQuality ?? "").trim().toLowerCase() || "high"),
        dimensions: publication?.dimensions
          ? {
            width: Number(publication.dimensions.width || 0) || null,
            height: Number(publication.dimensions.height || 0) || null,
          }
          : null,
        requestedDimensionsApplied: publication?.requestedVideoDimensions
          ? {
            width: Number(publication.requestedVideoDimensions.width || 0) || null,
            height: Number(publication.requestedVideoDimensions.height || 0) || null,
          }
          : null,
        requestedFpsApplied: Number(publication?.fps || 0) || null,
        requestedQualityApplied: publication?.videoQuality === VideoQuality.HIGH
          ? "high"
          : (String(publication?.videoQuality ?? "").trim().toLowerCase() || null),
        technicalCompanionVerified: remoteRecord.technicalCompanion === true,
        verifiedNativeCompanion720p60: receiveContract.verifiedNativeCompanion720p60 === true,
        receiveTargetAttribution: receiveContract.targetAttribution || null,
        requestDeduplicated: receiveContract.deduplicated === true,
        requestMode: "dimensions_and_fps_high_equivalent",
        publishedPreset: parseScreensharePresetTrackName(
          publication?.trackName || publication?.track?.name || "",
        ),
        receiveContractAppliedAt: timestampNow(),
        apiCalls: Array.isArray(receiveContract.apiCalls)
          ? receiveContract.apiCalls.map((entry) => ({ ...entry }))
          : [],
      };
    }
    remoteRecord.subscribed = wantSubscribed;
    emit("screenshare.remote_subscription_updated", {
      triggerReason: String(triggerReason || "").trim() || "remote_subscription_update",
      callerFunction: String(callerFunction || "").trim() || "applyRemotePublicationSubscription",
      participantId: remoteRecord?.ownerUserId || null,
      trackSid: remoteRecord?.trackSid || null,
      subscribed: wantSubscribed,
      requestedVideoQuality: wantSubscribed ? mediaDiagnostics.requestedRemoteVideoQuality : null,
      requestedVideoDimensions: wantSubscribed ? mediaDiagnostics.requestedRemoteVideoDimensions : null,
      requestedVideoFps: wantSubscribed ? mediaDiagnostics.requestedRemoteVideoFps : null,
      requestedVideoFpsAttribution: wantSubscribed ? mediaDiagnostics.requestedRemoteVideoFpsAttribution : null,
    });
  }

  function upsertShareRecord({
    key = "",
    ownerUserId = "",
    ownerDisplayName = "",
    publisherIdentity = "",
    technicalCompanion = false,
    isLocal = false,
    track = null,
    liveKitTrack = null,
    trackSid = "",
    stream = null,
    captureRequest = null,
    captureSettings = null,
    publication = null,
    watched = null,
    keepTrackOnNull = true,
    notifyStateChange = true,
  } = {}) {
    const normalizedKey = normalizeId(key);
    const uid = normalizeId(ownerUserId);
    if (!normalizedKey || !uid) return null;
    const existing = shareRecordsByKey.get(normalizedKey) || null;
    const directMediaTrack = track?.mediaStreamTrack || track || null;
    const directKind = String(directMediaTrack?.kind || "").trim().toLowerCase();
    const directVideoTrack = directKind === "video" ? directMediaTrack : null;
    const bundleFromTrack = createVideoStreamFromTrack(directVideoTrack);
    const nextTrack = bundleFromTrack?.mediaTrack || directVideoTrack || null;
    const shouldKeepExistingTrack = !!(keepTrackOnNull && !nextTrack);
    const resolvedTrack = nextTrack || (shouldKeepExistingTrack ? (existing?.track || null) : null);
    const resolvedTrackId = normalizeId(resolvedTrack?.id || "");
    if (isLocal && (!resolvedTrack || !resolvedTrackId)) return null;
    const nextPublication = !isLocal
      ? (publication || existing?.publication || null)
      : null;
    const nextLiveKitTrack = !isLocal
      ? (
        liveKitTrack
        || (track && typeof track.attach === "function" ? track : null)
        || existing?.liveKitTrack
        || null
      )
      : null;
    const resolvedTrackSid = normalizeId(
      trackSid
      || nextPublication?.trackSid
      || resolvedTrack?.sid
      || existing?.trackSid
      || "",
    );
    if (!isLocal && !nextPublication && !resolvedTrackSid && !resolvedTrackId) return null;
    const resolvedStream = stream
      || (nextTrack ? (bundleFromTrack?.stream || createVideoStreamFromTrack(nextTrack)?.stream || null) : null)
      || (shouldKeepExistingTrack ? (existing?.stream || null) : null);
    const watchedExplicit = typeof watched === "boolean" ? watched : null;
    if (!isLocal && watchedExplicit === true) remoteWatchedShareKeys.add(normalizedKey);
    if (!isLocal && watchedExplicit === false) remoteWatchedShareKeys.delete(normalizedKey);
    const now = Date.now();
    const record = {
      ...(existing || {}),
      key: normalizedKey,
      ownerUserId: uid,
      ownerDisplayName: sanitizeCallVisibleName(ownerDisplayName, isLocal ? "You" : "User"),
      publisherIdentity: normalizeId(publisherIdentity || existing?.publisherIdentity || uid),
      technicalCompanion: technicalCompanion === true || existing?.technicalCompanion === true,
      isLocal: !!isLocal,
      publication: nextPublication,
      liveKitTrack: nextLiveKitTrack,
      track: resolvedTrack,
      trackSid: resolvedTrackSid,
      trackId: resolvedTrackId,
      stream: resolvedStream,
      captureRequest: captureRequest || null,
      captureSettings: captureSettings || null,
      subscribed: isLocal
        ? true
        : !!(nextPublication?.isSubscribed ?? existing?.subscribed),
      presentationState: isLocal
        ? "playing"
        : (String(existing?.presentationState || "").trim() || "publication_discovered"),
      presentationUpdatedAt: Number(existing?.presentationUpdatedAt || now),
      presentationRetryAttempt: Number(existing?.presentationRetryAttempt || 0),
      presentationTimeline: Array.isArray(existing?.presentationTimeline)
        ? existing.presentationTimeline
        : [],
      updatedAt: now,
    };
    shareRecordsByKey.set(normalizedKey, record);
    if (!isLocal && watchedExplicit == null && !remoteWatchedShareKeys.has(normalizedKey)) {
      // Remote shares are opt-in by default: placeholder first, subscribe on explicit watch.
      record.watched = false;
    }
    if (!isLocal && watchedExplicit === true) record.watched = true;
    if (isLocal) record.watched = true;
    if (record.isLocal) localShareKey = normalizedKey;
    selectActiveShare(normalizedKey, {
      triggerReason: "active_share_added",
      callerFunction: "upsertShareRecord",
      force: true,
      notifyStateChange,
    });
    return record;
  }

  function detachRemoteVideoElement(record = null) {
    const remoteRecord = record && typeof record === "object" ? record : null;
    const liveKitTrack = remoteRecord?.liveKitTrack || null;
    const videoElement = remoteRecord?.attachedVideoElement || null;
    if (!liveKitTrack || !videoElement) return false;
    remoteRecord.attachedVideoElement = null;
    try { liveKitTrack.detach?.(videoElement); } catch (_) {
      try { videoElement.srcObject = null; } catch (_) {}
    }
    try { videoElement.pause?.(); } catch (_) {}
    videoElement.removeAttribute?.("data-livekit-screenshare-track-id");
    return true;
  }

  function scheduleRemoteStageRefresh(record = null, delayMs = 140) {
    if (remoteStageRefreshTimer) clearTimeout(remoteStageRefreshTimer);
    const expectedKey = normalizeId(record?.key || "");
    remoteStageRefreshTimer = setTimeout(() => {
      remoteStageRefreshTimer = null;
      if (expectedKey && !shareRecordsByKey.has(expectedKey)) return;
      emitStateChanged("remote_track_first_frame_ready", "scheduleRemoteStageRefresh");
    }, Math.max(0, Number(delayMs) || 0));
  }

  function attachRemoteVideoElementImmediately(record = null) {
    const remoteRecord = record && typeof record === "object" ? record : null;
    const liveKitTrack = remoteRecord?.liveKitTrack || null;
    if (!isRemoteShareRecord(remoteRecord) || !liveKitTrack) return null;
    mediaDiagnostics.remoteAttachAttemptedAt = timestampNow();
    mediaDiagnostics.remoteAttachFailureReason = null;
    mediaDiagnostics.remoteAttachFunctionPath = [
      "RoomEvent.TrackSubscribed",
      "handleRemoteTrackSubscribed",
      "attachRemoteVideoElementImmediately",
    ];
    const stageViewport = safeInvoke(resolveStageViewport, {
      conversationId: convId || null,
      participantId: remoteRecord.ownerUserId || null,
      trackSid: remoteRecord.trackSid || null,
    });
    if (!stageViewport) {
      mediaDiagnostics.remoteAttachFailureReason = "stage_viewport_not_found";
      return null;
    }
    const refs = ensureUiForShare(stageViewport, remoteRecord);
    const video = refs?.video || null;
    if (!video) {
      mediaDiagnostics.remoteAttachFailureReason = "canonical_video_not_available";
      return null;
    }

    if (remoteRecord.attachedVideoElement !== video) {
      let attached = null;
      try { attached = attachRemoteScreenshareTrack(liveKitTrack, video); } catch (_) { attached = null; }
      if (!attached) {
        mediaDiagnostics.remoteAttachFailureReason = "livekit_remote_track_attach_failed";
        return null;
      }
      remoteRecord.attachedVideoElement = video;
      mediaDiagnostics.remoteAttachMethod = "livekit_remote_track_attach";
    }
    markRemotePresentationBoundary(remoteRecord, "track_attached", {
      attachMethod: mediaDiagnostics.remoteAttachMethod || "livekit_remote_track_attach",
    });
    mediaDiagnostics.remoteAttachFailureReason = null;

    const trackId = normalizeId(remoteRecord.trackId || liveKitTrack?.mediaStreamTrack?.id || liveKitTrack?.sid || "");
    video.setAttribute("data-livekit-screenshare-track-id", trackId);
    video.classList.add("serverVoiceScreensharePanel__video");
    refs.panel.hidden = false;
    refs.panel.setAttribute("aria-hidden", "false");
    refs.panel.setAttribute("data-immediate-remote-screenshare", "1");
    refs.title.textContent = readPresentationTitle(remoteRecord);

    if (!mediaDiagnostics.remoteVideoAttachedAt) {
      mediaDiagnostics.remoteVideoAttachedAt = timestampNow();
      startBoundedRemoteRenderStats(video, mediaDiagnostics.remotePerformanceAttemptId || "");
      emit("screenshare.remote_video_attached", {
        triggerReason: "track_subscribed_immediate",
        callerFunction: "attachRemoteVideoElementImmediately",
        participantId: remoteRecord.ownerUserId || null,
        trackSid: remoteRecord.trackSid || null,
        attachMethod: mediaDiagnostics.remoteAttachMethod,
      });
    }

    const markFirstFrame = () => {
      if (remoteRecord.attachedVideoElement !== video || remoteRecord.presentationState === "first_frame") return;
      mediaDiagnostics.remoteFirstFrameAt = timestampNow();
      markRemotePresentationBoundary(remoteRecord, "first_frame");
      clearRemotePresentationTimer(remoteRecord.key);
      emit("screenshare.remote_first_frame", {
        triggerReason: "remote_video_frame",
        callerFunction: "attachRemoteVideoElementImmediately",
        participantId: remoteRecord.ownerUserId || null,
        trackSid: remoteRecord.trackSid || null,
      });
      scheduleRemoteStageRefresh(remoteRecord, 0);
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      try { video.requestVideoFrameCallback(markFirstFrame); } catch (_) {}
    } else {
      video.addEventListener?.("loadeddata", markFirstFrame, { once: true });
    }
    video.addEventListener?.("loadedmetadata", () => {
      if (remoteRecord.presentationState !== "first_frame") {
        markRemotePresentationBoundary(remoteRecord, "loadedmetadata");
      }
    }, { once: true });
    video.addEventListener?.("playing", () => {
      if (remoteRecord.presentationState !== "first_frame") {
        markRemotePresentationBoundary(remoteRecord, "playing");
      }
    }, { once: true });
    try {
      video.play?.().then?.(() => {
        if (remoteRecord.presentationState !== "first_frame") {
          markRemotePresentationBoundary(remoteRecord, "playing");
        }
      }).catch?.(() => {});
    } catch (_) {}
    scheduleRemoteStageRefresh(remoteRecord, 140);
    safeInvoke(onRemoteTrackReady, {
      conversationId: convId || null,
      participantId: remoteRecord.ownerUserId || null,
      trackSid: remoteRecord.trackSid || null,
      trackId: remoteRecord.trackId || null,
      videoElement: video,
    });
    return video;
  }

  function removeShareRecordByKey(key = "", {
    triggerReason = "share_removed",
    callerFunction = "removeShareRecordByKey",
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey) return false;
    const existing = shareRecordsByKey.get(normalizedKey) || null;
    if (!existing) return false;
    clearRemotePresentationTimer(normalizedKey);
    if (isRemoteShareRecord(existing)) {
      remoteWatchedShareKeys.delete(normalizedKey);
      detachRemoteVideoElement(existing);
    }
    shareRecordsByKey.delete(normalizedKey);
    clearShareUiByKey(normalizedKey);
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

  function clearShareTrackByKey(key = "", {
    preserveUpdatedAt = false,
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey) return null;
    const existing = shareRecordsByKey.get(normalizedKey) || null;
    if (!existing) return null;
    if (isRemoteShareRecord(existing)) detachRemoteVideoElement(existing);
    const nextRecord = {
      ...existing,
      track: null,
      liveKitTrack: null,
      attachedVideoElement: null,
      trackId: "",
      stream: null,
      updatedAt: preserveUpdatedAt ? existing.updatedAt : Date.now(),
    };
    shareRecordsByKey.set(normalizedKey, nextRecord);
    return nextRecord;
  }

  function watchRemoteShareByKey(key = "", {
    triggerReason = "watch_share",
    callerFunction = "watchRemoteShareByKey",
    focusActive = true,
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey) return false;
    const record = shareRecordsByKey.get(normalizedKey) || null;
    if (!isRemoteShareRecord(record)) return false;
    remoteWatchedShareKeys.add(normalizedKey);
    applyRemotePublicationSubscription(record, true, {
      triggerReason,
      callerFunction,
    });
    const track = record?.publication?.track || null;
    const streamBundle = createVideoStreamFromTrack(track);
    const nextRecord = {
      ...record,
      track: streamBundle?.mediaTrack || record.track || null,
      trackId: normalizeId(streamBundle?.mediaTrack?.id || record.track?.id || record.trackId || ""),
      stream: streamBundle?.stream || record.stream || null,
      watched: true,
      subscribed: true,
      updatedAt: Date.now(),
    };
    shareRecordsByKey.set(normalizedKey, nextRecord);
    if (focusActive) {
      selectActiveShare(normalizedKey, {
        triggerReason,
        callerFunction,
        force: true,
      });
      return true;
    }
    emitStateChanged(triggerReason, callerFunction);
    return true;
  }

  function stopWatchingRemoteShareByKey(key = "", {
    triggerReason = "stop_watching_share",
    callerFunction = "stopWatchingRemoteShareByKey",
  } = {}) {
    const normalizedKey = normalizeId(key);
    if (!normalizedKey) return false;
    const record = shareRecordsByKey.get(normalizedKey) || null;
    if (!isRemoteShareRecord(record)) return false;
    remoteWatchedShareKeys.delete(normalizedKey);
    applyRemotePublicationSubscription(record, false, {
      triggerReason,
      callerFunction,
    });
    const nextRecord = clearShareTrackByKey(normalizedKey, {
      preserveUpdatedAt: false,
    });
    if (!nextRecord) return false;
    shareRecordsByKey.set(normalizedKey, {
      ...nextRecord,
      watched: false,
      subscribed: false,
      updatedAt: Date.now(),
    });
    emitStateChanged(triggerReason, callerFunction);
    return true;
  }

  function resolveRemoteShareRecordKey({
    participantIdentity = "",
    publication = null,
    track = null,
  } = {}) {
    const uid = normalizeId(participantIdentity || "");
    const mediaTrack = track?.mediaStreamTrack || track || null;
    const trackId = normalizeId(mediaTrack?.id || track?.sid || "");
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    if (!uid) return "";
    return `remote:${uid}:${trackSid || trackId}`;
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
        if (uid && normalizeId(record.publisherIdentity || record.ownerUserId || "") !== uid) return false;
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
      .filter((record) => !record?.isLocal && normalizeId(record?.publisherIdentity || record?.ownerUserId || "") === uid)
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
      sourceExistedAtSelection: typeof selection?.sourceExistedAtSelection === "boolean"
        ? selection.sourceExistedAtSelection
        : null,
      sourceEnumerationAgeMs: Number.isFinite(Number(selection?.sourceEnumerationAgeMs))
        ? Math.max(0, Number(selection.sourceEnumerationAgeMs))
        : null,
      selectedAt: Number.isFinite(Number(selection?.selectedAt))
        ? Number(selection.selectedAt)
        : Date.now(),
      startStreamingClickedAt: String(selection?.startStreamingClickedAt || "").trim() || null,
      pickerOpenedAt: String(selection?.pickerOpenedAt || "").trim() || null,
    };
  }

  function setPreferredSourceSelection(selection = null, {
    triggerReason = "source_selected",
    callerFunction = "setPreferredSourceSelection",
    notifyUi = true,
  } = {}) {
    const normalizedSelection = normalizeSourceSelection(selection);
    preferredSourceSelection = normalizedSelection;
    mediaDiagnostics.sourceSelectedAt = normalizedSelection?.selectedAt
      ? new Date(normalizedSelection.selectedAt).toISOString()
      : null;
    mediaDiagnostics.startStreamingClickedAt = normalizedSelection?.startStreamingClickedAt || null;
    if (notifyUi) emitStateChanged(triggerReason, callerFunction);
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
      if (isScreenshareCaptureCancelledError(error, { nativePicker: true })) {
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

  async function replaceLocalShareSource({
    triggerReason = "source_switch",
  } = {}) {
    if (localShareReplacePromise) return localShareReplacePromise;
    const localRecord = localShareKey ? (shareRecordsByKey.get(localShareKey) || null) : null;
    const nextSelection = normalizeSourceSelection(preferredSourceSelection);
    if (!room?.localParticipant || !localRecord || !localCaptureTrack) {
      throw new Error("screenshare_source_switch_active_share_required");
    }
    if (!nextSelection?.sourceId) {
      throw new Error("screenshare_source_switch_selection_required");
    }

    const replaceAttempt = ++localShareReplaceAttempt;
    const normalizedTriggerReason = String(triggerReason || "").trim() || "source_switch";
    const captureRequest = buildCurrentCaptureRequest();
    const oldStream = localCaptureStream;
    const oldTrack = localCaptureTrack;
    const oldAudioTrack = localCaptureAudioTrack;
    const oldRoutedAudioCapture = localRoutedAudioCapture;
    const oldEndedHandler = localTrackEndedHandler;
    const oldSelection = currentLocalSourceSelection;
    const oldDiagnostics = {
      selectedSourceId: mediaDiagnostics.selectedSourceId,
      selectedSourceType: mediaDiagnostics.selectedSourceType,
      selectedSourceIdLength: mediaDiagnostics.selectedSourceIdLength,
    };
    mediaDiagnostics.sourceSwitchAttemptCount = Number(mediaDiagnostics.sourceSwitchAttemptCount || 0) + 1;
    mediaDiagnostics.sourceSwitchLastOutcome = "pending";
    mediaDiagnostics.sourceSwitchInFlight = true;

    localShareReplacePromise = (async () => {
      let nextStream = null;
      let videoCommitted = false;
      try {
        const acquire = async (withAudio) => captureDesktopSourceStream({
          sourceId: nextSelection.sourceId,
          sourceKind: nextSelection.sourceKind,
          sourceName: nextSelection.sourceName,
          captureRequest,
          withAudio: !!withAudio,
          useFallbackConstraints: false,
          prepareDesktopCapture,
          clearPreparedDesktopCapture,
          acquireDesktopAudioCapture,
          acquireNativeHighMotionCapture,
          onCaptureStreamAcquired: registerDisplayCaptureStream,
          releaseCapturedStream: stopDisplayCaptureStream,
          onCapturePhase: recordCapturePhase,
          isCaptureAttemptCurrent: () => replaceAttempt === localShareReplaceAttempt,
        });
        try {
          nextStream = await acquire(!!captureRequest?.withAudio);
        } catch (error) {
          if (!captureRequest?.withAudio || isScreenshareCaptureCancelledError(error, { nativePicker: false })) throw error;
          nextStream = await acquire(false);
          mediaDiagnostics.screenAudioUnavailable = true;
        }
        const nextTrack = nextStream?.getVideoTracks?.()?.[0] || null;
        let nextAudioTrack = nextStream?.getAudioTracks?.()?.[0] || null;
        let nextRoutedAudioCapture = null;
        const nextRoutedAudioPromise = nextStream?.__altaraRoutedAudioCapturePromise || null;
        if (!nextAudioTrack && nextRoutedAudioPromise) {
          const routedResult = await Promise.resolve(nextRoutedAudioPromise).catch((error) => ({
            ok: false,
            category: String(error?.message || "process_loopback_capture_failed"),
          }));
          if (routedResult?.ok === true && routedResult?.track) {
            nextRoutedAudioCapture = routedResult;
            nextAudioTrack = routedResult.track;
            try { nextStream.addTrack(nextAudioTrack); } catch (_) {}
          } else {
            mediaDiagnostics.screenAudioUnavailable = !!captureRequest?.withAudio;
          }
        }
        if (!nextTrack || String(nextTrack.readyState || "").toLowerCase() !== "live") {
          throw new Error("screenshare_source_switch_track_missing");
        }
        try { nextTrack.contentHint = "motion"; } catch (_) {}
        try {
          await nextTrack.applyConstraints?.(captureRequest.applyConstraints || {});
        } catch (_) {
          // The acquired source remains usable when the OS declines optional
          // post-capture constraints.
        }
        if (replaceAttempt !== localShareReplaceAttempt || !shareRecordsByKey.has(localShareKey)) {
          throw new Error("screenshare_source_switch_stale_attempt");
        }

        const publication = room.localParticipant.getTrackPublication?.(Track.Source.ScreenShare)
          || localScreenSharePublication
          || null;
        const publishedTrack = publication?.track || null;
        if (!publishedTrack || typeof publishedTrack.replaceTrack !== "function") {
          throw new Error("screenshare_source_switch_publication_unavailable");
        }
        await publishedTrack.replaceTrack(nextTrack, { userProvidedTrack: true });
        videoCommitted = true;

        if (oldTrack && oldEndedHandler) {
          try { oldTrack.removeEventListener("ended", oldEndedHandler); } catch (_) {}
        }
        localCaptureStream = nextStream;
        localCaptureTrack = nextTrack;
        localCaptureAudioTrack = nextAudioTrack;
        localRoutedAudioCapture = nextRoutedAudioCapture;
        localRoutedAudioCapturePromise = nextRoutedAudioPromise;
        localScreenSharePublication = publication;
        localTrackEndedHandler = () => {
          void stopShareGuarded({ triggerReason: "local_capture_track_ended" });
        };
        try { nextTrack.addEventListener("ended", localTrackEndedHandler, { once: true }); } catch (_) {}

        const replacementPublishBuild = buildScreensharePublishOptions(captureRequest, {
          privateOneToOne: isPrivateOneToOne,
          privateTransportProfile: privateOneToOneTransportProfile,
          capturePath: String(nextStream?.__altaraCapturePath || "chromium_compatibility"),
          nativeHighMotionExperimentEnabled: performanceDiagnosticsEnabled,
        });
        if (isPrivate720p60Request(captureRequest, replacementPublishBuild.diagnostics)) {
          await applyAndRecordPrivate720p60SenderPolicy(publication, {
            reason: "source_replace",
            expectedMaxBitrate: mediaDiagnostics.publishSettings?.maxBitrate,
          });
        }
        startPrivateQualityController(publication, captureRequest, replacementPublishBuild.diagnostics || {});

        const audioPublication = room.localParticipant.getTrackPublication?.(Track.Source.ScreenShareAudio) || null;
        if (nextAudioTrack) {
          try {
            if (audioPublication?.track && typeof audioPublication.track.replaceTrack === "function") {
              await audioPublication.track.replaceTrack(nextAudioTrack, { userProvidedTrack: true });
              localCaptureAudioTrackSid = normalizeId(audioPublication.trackSid || "");
              try { onDesktopAudioPublicationChanged?.(true); } catch (_) {}
            } else {
              const nextAudioPublication = await room.localParticipant.publishTrack(nextAudioTrack, {
                source: Track.Source.ScreenShareAudio,
                stopOnMute: false,
                simulcast: false,
              });
              localCaptureAudioTrackSid = normalizeId(nextAudioPublication?.trackSid || "");
              try { onDesktopAudioPublicationChanged?.(true); } catch (_) {}
            }
          } catch (_) {
            mediaDiagnostics.screenAudioUnavailable = true;
            try { nextAudioTrack.stop(); } catch (_) {}
            localCaptureAudioTrack = null;
            localRoutedAudioCapture = null;
            localCaptureAudioTrackSid = "";
            try { onDesktopAudioPublicationChanged?.(false); } catch (_) {}
          }
        } else if (audioPublication?.track) {
          try {
            await room.localParticipant.unpublishTrack(audioPublication.track, false);
          } catch (_) {}
          localCaptureAudioTrackSid = "";
          try { onDesktopAudioPublicationChanged?.(false); } catch (_) {}
        }

        const captureSettings = readTrackCaptureSettings(nextTrack);
        const nextDesktopCaptureConstraints = nextStream?.__serverVoiceDesktopCaptureConstraints || null;
        currentLocalSourceSelection = { ...nextSelection };
        mediaDiagnostics.selectedSourceId = nextSelection.sourceId;
        mediaDiagnostics.selectedSourceIdLength = nextSelection.sourceId.length;
        mediaDiagnostics.selectedSourceType = nextSelection.sourceKind || nextSelection.sourceType;
        mediaDiagnostics.captureModel = String(nextDesktopCaptureConstraints?.captureModel || mediaDiagnostics.captureModel || "");
        mediaDiagnostics.winningCapturePath = String(
          nextDesktopCaptureConstraints?.capturePath
          || nextStream?.__altaraCapturePath
          || "chromium_compatibility",
        ).trim() || "chromium_compatibility";
        const nextNativeController = nextStream?.__altaraNativeHighMotionController || null;
        try { nextNativeController?.markPublished?.(true); } catch (_) {}
        mediaDiagnostics.nativeHighMotionBridge = typeof nextNativeController?.getDiagnostics === "function"
          ? nextNativeController.getDiagnostics()
          : null;
        mediaDiagnostics.acquiredVideoTrackSettings = {
          width: Number(captureSettings?.width || 0) || null,
          height: Number(captureSettings?.height || 0) || null,
          frameRate: Number(captureSettings?.frameRate || 0) || null,
          displaySurface: String(nextTrack?.getSettings?.()?.displaySurface || "").trim() || null,
        };
        upsertShareRecord({
          key: localShareKey,
          ownerUserId: meId,
          ownerDisplayName: "You",
          isLocal: true,
          track: nextTrack,
          trackSid: normalizeId(publication?.trackSid || localRecord?.trackSid || ""),
          stream: nextStream,
          captureRequest,
          captureSettings,
        });
        if (oldStream && oldStream !== nextStream) stopDisplayCaptureStream(oldStream);
        else {
          try { oldTrack?.stop?.(); } catch (_) {}
          if (oldAudioTrack && oldAudioTrack !== oldTrack) {
            try { oldAudioTrack.stop?.(); } catch (_) {}
          }
          if (oldRoutedAudioCapture && oldRoutedAudioCapture !== nextRoutedAudioCapture) {
            void oldRoutedAudioCapture.stop?.();
          }
        }
        mediaDiagnostics.sourceSwitchLastOutcome = "succeeded";
        emit("screenshare.source_switch_succeeded", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "replaceShareSource",
          participantId: meId || null,
          trackSid: normalizeId(publication?.trackSid || localRecord?.trackSid || "") || null,
          sourceType: nextSelection.sourceType || null,
          sourceId: nextSelection.sourceId || null,
          sourceKind: nextSelection.sourceKind || null,
        });
        emitStateChanged(normalizedTriggerReason, "replaceShareSource");
        return readActiveShareRecord();
      } catch (error) {
        if (!videoCommitted && nextStream) stopDisplayCaptureStream(nextStream);
        currentLocalSourceSelection = oldSelection;
        mediaDiagnostics.selectedSourceId = oldDiagnostics.selectedSourceId;
        mediaDiagnostics.selectedSourceType = oldDiagnostics.selectedSourceType;
        mediaDiagnostics.selectedSourceIdLength = oldDiagnostics.selectedSourceIdLength;
        mediaDiagnostics.sourceSwitchLastOutcome = "failed";
        emit("screenshare.source_switch_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "replaceShareSource",
          stage: videoCommitted ? "post_video_replace" : "pre_video_replace",
          errorName: String(error?.name || "").trim() || null,
          errorMessage: String(error?.message || error || "source_switch_failed").trim(),
        });
        throw error;
      } finally {
        mediaDiagnostics.sourceSwitchInFlight = false;
        localShareReplacePromise = null;
      }
    })();
    return localShareReplacePromise;
  }

  function releaseLocalCaptureResources({ reason = "cleanup" } = {}) {
    stopPrivateQualityController(reason);
    release720p60BackgroundThrottlingLease(reason);
    recordCapturePhase("cleanup_started", {
      selectedSourceId: mediaDiagnostics.selectedSourceId,
      selectedSourceType: mediaDiagnostics.selectedSourceType,
      audioRequested: mediaDiagnostics.audioRequested,
      reason,
    });
    if (localCaptureTrack && localTrackEndedHandler) {
      try { localCaptureTrack.removeEventListener("ended", localTrackEndedHandler); } catch (_) {}
    }
    localTrackEndedHandler = null;
    clearLocalFirstFrameProbe();
    if (localCaptureStream) {
      stopDisplayCaptureStream(localCaptureStream);
    } else if (localCaptureTrack) {
      if (!stoppedDisplayCaptureTracks.has(localCaptureTrack)) {
        stoppedDisplayCaptureTracks.add(localCaptureTrack);
        mediaDiagnostics.displayCaptureTracksStopped += 1;
        try { localCaptureTrack.stop(); } catch (_) {}
      }
      activeDisplayCaptureTracks.delete(localCaptureTrack);
    }
    if (localRoutedAudioCapture) {
      void localRoutedAudioCapture.stop?.();
    } else if (localRoutedAudioCapturePromise) {
      void Promise.resolve(localRoutedAudioCapturePromise)
        .then((capture) => capture?.stop?.())
        .catch(() => {});
    }
    if (!localCaptureTrack && localCaptureAudioTrack) {
      if (!stoppedDisplayCaptureTracks.has(localCaptureAudioTrack)) {
        stoppedDisplayCaptureTracks.add(localCaptureAudioTrack);
        mediaDiagnostics.displayCaptureTracksStopped += 1;
        try { localCaptureAudioTrack.stop(); } catch (_) {}
      }
      activeDisplayCaptureTracks.delete(localCaptureAudioTrack);
    }
    localCaptureStream = null;
    localCaptureTrack = null;
    localCaptureAudioTrack = null;
    localRoutedAudioCapture = null;
    localRoutedAudioCapturePromise = null;
    localScreenSharePublication = null;
    currentLocalSourceSelection = null;
    localCaptureAudioTrackSid = "";
    try { onDesktopAudioPublicationChanged?.(false); } catch (_) {}
    mediaDiagnostics.cleanupCompletedAt = timestampNow();
    recordCapturePhase("cleanup_finished", {
      selectedSourceId: mediaDiagnostics.selectedSourceId,
      selectedSourceType: mediaDiagnostics.selectedSourceType,
      audioRequested: mediaDiagnostics.audioRequested,
      reason,
    });
  }

  async function startShare({
    triggerReason = "manual_toggle",
    browserCapturePromise = null,
    shareAttempt = localShareAttempt,
  } = {}) {
    const normalizedTriggerReason = String(triggerReason || "").trim() || "manual_toggle";
    markServerStartTraceStage("start_share_entered", {
      triggerReason: normalizedTriggerReason,
      roomState: String(room?.state || room?.connectionState || "").trim() || null,
    });
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
    const captureRequestTraceMetrics = readCaptureRequestMetrics(captureRequest);
    markServerStartTraceStage("preset_resolved", {
      streamPreset: captureRequest?.streamPreset || null,
      qualityPreset: captureRequest?.qualityPreset || null,
      fpsPreset: captureRequest?.fpsPreset || null,
      requestedWidth: captureRequestTraceMetrics.requestedWidth,
      requestedHeight: captureRequestTraceMetrics.requestedHeight,
      requestedFps: captureRequestTraceMetrics.requestedFps,
      audioRequested: !!captureRequest?.withAudio,
    });
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
    const preferredSelection = browserCapturePromise
      ? null
      : normalizeSourceSelection(preferredSourceSelection);
    if (preferredSelection?.sourceId) {
      sourceSelection = {
        ...preferredSelection,
      };
      selectedSourceId = preferredSelection.sourceId;
      selectedSourceKind = preferredSelection.sourceKind || "";
      selectedSourceName = preferredSelection.sourceName || "";
      selectedSourceType = preferredSelection.sourceType || "desktop_source";
      mediaDiagnostics.sourceSelectedAt = preferredSelection.selectedAt
        ? new Date(preferredSelection.selectedAt).toISOString()
        : timestampNow();
      mediaDiagnostics.startStreamingClickedAt = preferredSelection.startStreamingClickedAt || null;
      recordCapturePhase("picker_opened", {
        at: preferredSelection.pickerOpenedAt || mediaDiagnostics.sourceSelectedAt,
        audioRequested: !!captureRequest?.withAudio,
        reason: "external_picker",
      });
      mediaDiagnostics.selectedSourceId = selectedSourceId;
      mediaDiagnostics.selectedSourceType = selectedSourceKind || selectedSourceType;
      recordCapturePhase("source_selected", {
        selectedSourceId,
        selectedSourceType: selectedSourceKind || selectedSourceType,
        audioRequested: !!captureRequest?.withAudio,
        reason: "preferred_cached",
      });
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

    if (!browserCapturePromise && !sourceSelection && typeof openSourcePicker === "function") {
      recordCapturePhase("picker_opened", {
        audioRequested: !!captureRequest?.withAudio,
      });
      emit("screenshare.source_picker_opened", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startShare",
        streamPreset: captureRequest?.streamPreset || null,
        qualityPreset: captureRequest?.qualityPreset || null,
        fpsPreset: captureRequest?.fpsPreset || null,
        withAudio: !!captureRequest?.withAudio,
      });
      try {
        sourceSelection = await traceServerStartAwait("source_picker", () => openSourcePicker({
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          captureRequest,
          capturePreferences: getCapturePreferences(),
          conversationId: convId || "",
          localUserId: meId || "",
        }), {
          audioRequested: !!captureRequest?.withAudio,
        });
      } catch (error) {
        if (isScreenshareCaptureCancelledError(error, { nativePicker: true })) {
          mediaDiagnostics.pickerOutcome = "cancelled";
          mediaDiagnostics.lastShareErrorCategory = "user_cancelled";
          mediaDiagnostics.lastShareErrorName = String(error?.name || "").trim() || null;
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
        mediaDiagnostics.pickerOutcome = "cancelled";
        mediaDiagnostics.lastShareErrorCategory = "user_cancelled";
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
      mediaDiagnostics.sourceSelectedAt = timestampNow();
      mediaDiagnostics.startStreamingClickedAt = String(sourceSelection?.startStreamingClickedAt || "").trim() || null;
      mediaDiagnostics.selectedSourceIdLength = selectedSourceId ? selectedSourceId.length : null;
      mediaDiagnostics.selectedSourceId = selectedSourceId || null;
      mediaDiagnostics.selectedSourceType = selectedSourceKind || selectedSourceType || null;
      recordCapturePhase("source_selected", {
        selectedSourceId,
        selectedSourceType: selectedSourceKind || selectedSourceType,
        audioRequested: !!captureRequest?.withAudio,
        reason: "picker",
      });
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
          sourceExistedAtSelection: sourceSelection?.sourceExistedAtSelection,
          sourceEnumerationAgeMs: sourceSelection?.sourceEnumerationAgeMs,
          startStreamingClickedAt: sourceSelection?.startStreamingClickedAt,
        });
      }
    }

    mediaDiagnostics.sourceExistedAtSelection = typeof sourceSelection?.sourceExistedAtSelection === "boolean"
      ? sourceSelection.sourceExistedAtSelection
      : null;
    mediaDiagnostics.sourceEnumerationAgeMs = Number.isFinite(Number(sourceSelection?.sourceEnumerationAgeMs))
      ? Math.max(0, Number(sourceSelection.sourceEnumerationAgeMs))
      : null;
    markServerStartTraceStage("selected_source_resolved", {
      sourceId: selectedSourceId || null,
      sourceKind: selectedSourceKind || null,
      sourceType: selectedSourceType || null,
      sourceName: selectedSourceName || null,
    });

    let captureFallbackReason = null;
    let captureStream = null;
    const runDesktopCaptureAttempt = async ({
      name = "desktop_capture",
      withAudio = false,
      request = captureRequest,
      useFallbackConstraints = false,
    } = {}) => {
      const attempt = {
        name: String(name || "desktop_capture"),
        withAudio: !!withAudio,
        startedAt: timestampNow(),
        finishedAt: null,
        durationMs: null,
        outcome: "pending",
        errorName: null,
        errorCode: null,
        errorCategory: null,
      };
      const startedAtMs = Date.now();
      mediaDiagnostics.captureAttempts = [...mediaDiagnostics.captureAttempts.slice(-3), attempt];
      if (typeof prepareDesktopCapture === "function") mediaDiagnostics.getDisplayMediaRequestedAt ||= attempt.startedAt;
      let attemptStream = null;
      try {
        attemptStream = await traceServerStartAwait(`capture_request_${String(name || "desktop_capture")}`, () => captureDesktopSourceStream({
          sourceId: selectedSourceId,
          sourceKind: selectedSourceKind,
          sourceName: selectedSourceName,
          captureRequest: request,
          withAudio: !!withAudio,
          useFallbackConstraints: !!useFallbackConstraints,
          prepareDesktopCapture,
          clearPreparedDesktopCapture,
          acquireDesktopAudioCapture,
          acquireNativeHighMotionCapture,
          onCaptureStreamAcquired: registerDisplayCaptureStream,
          releaseCapturedStream: stopDisplayCaptureStream,
          onCapturePhase: recordCapturePhase,
          isCaptureAttemptCurrent: () => shareAttempt === localShareAttempt,
        }), {
          sourceId: selectedSourceId || null,
          sourceKind: selectedSourceKind || null,
          audioRequested: !!withAudio,
        });
        attempt.outcome = "succeeded";
        attempt.finishedAt = timestampNow();
        attempt.durationMs = Math.max(0, Date.now() - startedAtMs);
        return attemptStream;
      } catch (error) {
        if (attemptStream) {
          try { stopDisplayCaptureStream(attemptStream); } catch (_) {}
        }
        attempt.outcome = "failed";
        attempt.finishedAt = timestampNow();
        attempt.durationMs = Math.max(0, Date.now() - startedAtMs);
        attempt.errorName = String(error?.name || "").trim() || null;
        attempt.errorCode = getSafeCaptureErrorCode(error);
        attempt.errorCategory = classifyShareError(error, "capture_stream");
        throw error;
      }
    };
    const selectedStream = sourceSelection?.stream instanceof MediaStream
      ? sourceSelection.stream
      : null;
    mediaDiagnostics.captureRequestedAt ||= timestampNow();
    beginServerStartTraceStage("capture_request", {
      sourceId: selectedSourceId || null,
      sourceType: selectedSourceType || null,
      audioRequested: !!captureRequest?.withAudio,
    });
    try {
      if (browserCapturePromise) {
        captureStream = await traceServerStartAwait("capture_request_browser", () => browserCapturePromise, {
          audioRequested: !!captureRequest?.withAudio,
        });
        selectedSourceType = "browser_display_media";
        recordCapturePhase("getDisplayMedia_resolved", {
          selectedSourceType,
          audioRequested: !!captureRequest?.withAudio,
          videoTrackCount: captureStream?.getVideoTracks?.()?.length || 0,
          audioTrackCount: captureStream?.getAudioTracks?.()?.length || 0,
        });
      } else if (selectedStream) {
        captureStream = selectedStream;
      } else if (selectedSourceId) {
        selectedSourceType = "desktop_source";
        captureStream = await traceServerStartAwait("capture_attempt_selected_source", () => runDesktopCaptureAttempt({
          name: captureRequest?.withAudio ? "selected_source_with_audio" : "selected_source_video",
          request: captureRequest,
          withAudio: !!captureRequest?.withAudio,
          useFallbackConstraints: false,
        }), {
          sourceId: selectedSourceId || null,
          audioRequested: !!captureRequest?.withAudio,
        });
      } else {
        captureStream = await traceServerStartAwait("capture_request_display_media", () => navigator.mediaDevices.getDisplayMedia({
          video: captureRequest.getDisplayMediaVideoConstraints || true,
          audio: !!captureRequest?.withAudio,
        }), {
          audioRequested: !!captureRequest?.withAudio,
        });
      }
    } catch (error) {
      if (browserCapturePromise) {
        recordCapturePhase("getDisplayMedia_failed", {
          selectedSourceType: "browser_display_media",
          audioRequested: !!captureRequest?.withAudio,
          error,
        });
      }
      if (isScreenshareCaptureCancelledError(error, { nativePicker: !selectedSourceId })) {
        emit("screenshare.source_selection_cancelled", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          stage: selectedSourceId ? "desktop_capture_prompt" : "display_media_prompt",
          sourceType: selectedSourceType || (selectedSourceId ? "desktop_source" : "display_media"),
          sourceId: selectedSourceId || null,
          sourceKind: selectedSourceKind || null,
          sourceName: selectedSourceName || null,
        });
        mediaDiagnostics.lastShareErrorCategory = "user_cancelled";
        mediaDiagnostics.lastShareErrorName = String(error?.name || "").trim() || null;
        mediaDiagnostics.pickerOutcome = "cancelled";
        return null;
      }
      mediaDiagnostics.firstCaptureErrorName = String(error?.name || "").trim() || null;
      mediaDiagnostics.firstCaptureErrorCode = getSafeCaptureErrorCode(error);
      mediaDiagnostics.firstCaptureErrorCategory = classifyShareError(error, "capture_stream");
      mediaDiagnostics.lastShareErrorName = mediaDiagnostics.firstCaptureErrorName;
      mediaDiagnostics.lastShareErrorCode = mediaDiagnostics.firstCaptureErrorCode;
      mediaDiagnostics.lastShareErrorStage = "capture_stream";
      mediaDiagnostics.lastShareErrorCategory = mediaDiagnostics.firstCaptureErrorCategory;
      if (browserCapturePromise) {
        emit("screenshare.capture_start_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startShare",
          stage: "capture_stream",
          sourceType: "browser_display_media",
          sourceId: null,
          sourceKind: null,
          sourceName: null,
          errorName: String(error?.name || "").trim() || null,
          errorCategory: mediaDiagnostics.lastShareErrorCategory,
        });
        throw error;
      }
      if (selectedSourceId && !selectedStream) {
        captureFallbackReason = String(error?.message || error || "desktop_capture_constraints_rejected").trim() || "desktop_capture_constraints_rejected";
        if (captureRequest?.withAudio && typeof prepareDesktopCapture !== "function") {
          mediaDiagnostics.audioFallbackAttempted = true;
          mediaDiagnostics.audioFallbackResult = "pending";
          try {
            captureStream = await traceServerStartAwait("capture_attempt_selected_source_video_only", () => runDesktopCaptureAttempt({
              name: "selected_source_video_only",
              request: captureRequest,
              withAudio: false,
              useFallbackConstraints: false,
            }), {
              sourceId: selectedSourceId || null,
              audioRequested: false,
            });
            mediaDiagnostics.screenAudioUnavailable = true;
            mediaDiagnostics.audioFallbackResult = "succeeded_video_only";
            captureFallbackReason = "desktop_screen_audio_unavailable";
          } catch (videoOnlyError) {
            mediaDiagnostics.audioFallbackResult = "failed";
            captureFallbackReason = String(
              videoOnlyError?.message || videoOnlyError || "desktop_video_constraints_rejected",
            ).trim() || "desktop_video_constraints_rejected";
            mediaDiagnostics.fallbackCaptureErrorName = String(videoOnlyError?.name || "").trim() || null;
            mediaDiagnostics.fallbackCaptureErrorCode = getSafeCaptureErrorCode(videoOnlyError);
            mediaDiagnostics.fallbackCaptureErrorCategory = classifyShareError(videoOnlyError, "capture_stream_video_only");
            mediaDiagnostics.lastShareErrorName = mediaDiagnostics.fallbackCaptureErrorName;
            mediaDiagnostics.lastShareErrorCode = mediaDiagnostics.fallbackCaptureErrorCode;
            mediaDiagnostics.lastShareErrorStage = "capture_stream_video_only";
            mediaDiagnostics.lastShareErrorCategory = mediaDiagnostics.fallbackCaptureErrorCategory;
            throw videoOnlyError;
          }
        } else {
          throw error;
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
          captureStream = await traceServerStartAwait("capture_request_fallback_display_media", () => navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: !!captureRequest?.withAudio,
          }), {
            audioRequested: !!captureRequest?.withAudio,
          });
        } catch (fallbackError) {
          if (isScreenshareCaptureCancelledError(fallbackError, { nativePicker: true })) {
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
          mediaDiagnostics.fallbackCaptureErrorName = String(fallbackError?.name || "").trim() || null;
          mediaDiagnostics.fallbackCaptureErrorCode = getSafeCaptureErrorCode(fallbackError);
          mediaDiagnostics.fallbackCaptureErrorCategory = classifyShareError(fallbackError, "capture_stream_fallback");
          mediaDiagnostics.lastShareErrorName = mediaDiagnostics.fallbackCaptureErrorName;
          mediaDiagnostics.lastShareErrorCode = mediaDiagnostics.fallbackCaptureErrorCode;
          mediaDiagnostics.lastShareErrorStage = "capture_stream_fallback";
          mediaDiagnostics.lastShareErrorCategory = mediaDiagnostics.fallbackCaptureErrorCategory;
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
    finishServerStartTraceStage("capture_request", "resolved", null, {
      streamPresent: !!captureStream,
    });
    registerDisplayCaptureStream(captureStream);
    markServerStartTraceStage("captured_stream_exists", {
      exists: !!captureStream,
      videoTrackCount: captureStream?.getVideoTracks?.()?.length || 0,
      audioTrackCount: captureStream?.getAudioTracks?.()?.length || 0,
    });
    const captureTrack = captureStream?.getVideoTracks?.()?.[0] || null;
    const captureAudioTrack = captureStream?.getAudioTracks?.()?.[0] || null;
    markServerStartTraceStage("captured_video_track_exists", {
      exists: !!captureTrack,
      readyState: String(captureTrack?.readyState || "").trim().toLowerCase() || null,
    });
    markServerStartTraceStage(captureAudioTrack ? "captured_audio_track_exists" : "captured_audio_track_absent", {
      exists: !!captureAudioTrack,
      audioRequested: !!captureRequest?.withAudio,
      readyState: String(captureAudioTrack?.readyState || "").trim().toLowerCase() || null,
    });
    const routedAudioCapturePromise = captureStream?.__altaraRoutedAudioCapturePromise || null;
    if (!captureTrack) {
      stopDisplayCaptureStream(captureStream);
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
    await traceServerStartAwait("background_throttling_lease", () => acquire720p60BackgroundThrottlingLease(captureRequest));
    localCaptureStream = captureStream;
    localCaptureTrack = captureTrack;
    localCaptureAudioTrack = captureAudioTrack;
    localRoutedAudioCapture = null;
    localRoutedAudioCapturePromise = routedAudioCapturePromise;
    localCaptureAudioTrackSid = "";
    if (!selectedSourceId) {
      recordCapturePhase("track_received", {
        selectedSourceType: selectedSourceType || "browser_display_media",
        audioRequested: !!captureRequest?.withAudio,
        videoTrackCount: captureStream?.getVideoTracks?.()?.length || 0,
        audioTrackCount: captureStream?.getAudioTracks?.()?.length || 0,
        videoReadyState: String(captureTrack.readyState || "").trim().toLowerCase() || null,
      });
    }
    if (shareAttempt !== localShareAttempt) {
      releaseLocalCaptureResources({ reason: "capture_attempt_mismatch" });
      return null;
    }
    mediaDiagnostics.mediaAcquiredAt = timestampNow();
    mediaDiagnostics.localVideoTrackCreatedAt = mediaDiagnostics.mediaAcquiredAt;
    mediaDiagnostics.pickerOutcome = "accepted";
    mediaDiagnostics.acquiredVideoTrackCount = captureStream?.getVideoTracks?.()?.length || 0;
    mediaDiagnostics.acquiredAudioTrackCount = captureStream?.getAudioTracks?.()?.length || 0;
    mediaDiagnostics.acquiredVideoTrackReadyState = String(captureTrack.readyState || "").trim().toLowerCase() || null;
    mediaDiagnostics.selectedSourceId = selectedSourceId || mediaDiagnostics.selectedSourceId;
    mediaDiagnostics.selectedSourceType = selectedSourceKind || selectedSourceType || mediaDiagnostics.selectedSourceType;
    setShareLifecycleState("acquired", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      notifyUi: false,
    });
    startLocalFirstFrameProbe(captureStream, mediaDiagnostics.localPerformanceAttemptId);
    if (!selectedSourceKind) {
      selectedSourceKind = normalizeScreenshareSourceKind(captureTrack?.getSettings?.()?.displaySurface || "");
    }
    if (!selectedSourceType) {
      selectedSourceType = selectedSourceId ? "desktop_source" : "display_media";
    }
    const desktopCaptureConstraints = captureStream?.__serverVoiceDesktopCaptureConstraints || null;
    mediaDiagnostics.captureModel = String(desktopCaptureConstraints?.captureModel || (selectedSourceId ? "legacy_direct_source_id" : "browser_native_display_media"));
    mediaDiagnostics.winningCapturePath = String(
      desktopCaptureConstraints?.capturePath
      || captureStream?.__altaraCapturePath
      || "chromium_compatibility",
    ).trim() || "chromium_compatibility";
    const nativeHighMotionController = captureStream?.__altaraNativeHighMotionController || null;
    mediaDiagnostics.nativeHighMotionBridge = typeof nativeHighMotionController?.getDiagnostics === "function"
      ? nativeHighMotionController.getDiagnostics()
      : null;
    mediaDiagnostics.captureFallbackReason = desktopCaptureConstraints?.captureFallbackReason
      || mediaDiagnostics.captureFallbackReason
      || null;
    mediaDiagnostics.pickerToCaptureSourceIdMatch = typeof desktopCaptureConstraints?.pickerToCaptureSourceIdMatch === "boolean"
      ? desktopCaptureConstraints.pickerToCaptureSourceIdMatch
      : (selectedSourceId ? null : true);
    mediaDiagnostics.captureSourceIdLength = Number(desktopCaptureConstraints?.sourceIdLength || 0) || null;
    const captureApi = mediaDiagnostics.winningCapturePath === "native_high_motion"
      ? "native_wgc_generated_track"
      : (String(desktopCaptureConstraints?.captureModel || "") === "electron_session_display_media"
        ? "getDisplayMedia"
        : (selectedSourceId ? "getUserMedia" : "getDisplayMedia"));
    const captureRequestMetrics = readCaptureRequestMetrics(captureRequest);
    const captureMetricsBeforeApply = readTrackOutputMetrics(captureTrack);
    emit("screenshare.capture_track_acquired", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      stage: "post_capture_pre_apply_constraints",
      captureApi,
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
        captureApi,
        requestedQuality: captureRequestMetrics.requestedQuality || null,
        requestedFps: captureRequestMetrics.requestedFps,
        actualFps: captureMetricsBeforeApply.actualFps,
        sourceType: selectedSourceType || null,
        sourceKind: selectedSourceKind || null,
      });
    }
    // A 30 FPS preset is an explicit smooth-motion contract. The previous
    // "detail" hint encouraged Chromium to preserve static detail by dropping
    // temporal quality, which made cursor/window motion visibly choppy.
    try { captureTrack.contentHint = "motion"; } catch (_) {}
    let constraintApplyError = null;
    try {
      if (typeof captureTrack.applyConstraints === "function") {
        await traceServerStartAwait("capture_constraints", () => captureTrack.applyConstraints(captureRequest.applyConstraints || {}));
      }
    } catch (error) {
      constraintApplyError = error;
    }
    const captureSettings = readTrackCaptureSettings(captureTrack);
    mediaDiagnostics.acquiredVideoTrackSettings = {
      width: Number(captureSettings?.width || 0) || null,
      height: Number(captureSettings?.height || 0) || null,
      frameRate: Number(captureSettings?.frameRate || 0) || null,
      displaySurface: String(captureTrack?.getSettings?.()?.displaySurface || "").trim() || null,
    };
    mediaDiagnostics.localTrackWrapperMode = "livekit_publish_wraps_media_stream_track";
    markServerStartTraceStage("livekit_video_track_conversion", {
      mode: mediaDiagnostics.localTrackWrapperMode,
      trackPresent: !!captureTrack,
      readyState: String(captureTrack?.readyState || "").trim().toLowerCase() || null,
    });
    const captureMetricsAfterApply = readTrackOutputMetrics(captureTrack);
    emit("screenshare.capture_track_constraints_resolved", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      stage: "post_apply_constraints",
      captureApi,
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
        captureApi,
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
      void stopShareGuarded({
        triggerReason: "local_capture_track_ended",
      });
    };
    try { captureTrack.addEventListener("ended", localTrackEndedHandler, { once: true }); } catch (_) {}

    let publication = null;
    let audioPublication = null;
    let audioPublishError = null;
    const publishBuild = buildScreensharePublishOptions(captureRequest, {
      privateOneToOne: isPrivateOneToOne,
      privateTransportProfile: privateOneToOneTransportProfile,
      capturePath: mediaDiagnostics.winningCapturePath,
      nativeHighMotionExperimentEnabled: performanceDiagnosticsEnabled,
    });
    const publishOptions = publishBuild.publishOptions || {
      source: Track.Source.ScreenShare,
      stopOnMute: false,
      simulcast: true,
    };
    const publishDiagnostics = publishBuild.diagnostics || {};
    mediaDiagnostics.privateTransportProfile = publishDiagnostics.privateTransportProfile
      || (isPrivateOneToOne ? privateOneToOneTransportProfile : null);
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
      configuredMaxFramerate: Number(publishOptions?.screenShareEncoding?.maxFramerate || 0) || null,
      configuredBitrate: Number(publishOptions?.screenShareEncoding?.maxBitrate || 0) || null,
      requestedVideoCodec: String(publishOptions?.videoCodec || "").trim() || null,
      simulcast: typeof publishOptions?.simulcast === "boolean" ? publishOptions.simulcast : null,
      privateOneToOne: publishDiagnostics.privateOneToOne === true,
      privateTransportProfile: publishDiagnostics.privateTransportProfile || null,
      degradationPreference: publishDiagnostics.degradationPreference || null,
      streamPreset: captureRequest?.streamPreset || null,
      qualityPreset: captureRequest?.qualityPreset || null,
      fpsPreset: captureRequest?.fpsPreset || null,
    });
    if (String(captureTrack.readyState || "").trim().toLowerCase() === "ended") {
      const endedError = new Error("screenshare_capture_track_ended_before_publish");
      mediaDiagnostics.lastShareErrorCategory = "track_ended";
      releaseLocalCaptureResources({ reason: "track_ended_before_publish" });
      throw endedError;
    }
    mediaDiagnostics.publishStartedAt = timestampNow();
    if (performanceDiagnosticsEnabled) {
      publishOptions.name = buildScreensharePerformanceTrackName({
        attemptId: mediaDiagnostics.localPerformanceAttemptId,
        startClickedAt: mediaDiagnostics.startStreamingClickedAt,
        publishStartedAt: mediaDiagnostics.publishStartedAt,
        streamPreset: captureRequest?.streamPreset || "",
        fpsPreset: captureRequest?.fpsPreset || "30",
      }) || buildScreensharePresetTrackName(captureRequest?.streamPreset || "", captureRequest?.fpsPreset || "30");
    } else {
      // Safe, non-private transport metadata lets the receiver request 720p60
      // before its first stats sample. It contains no source or user identity.
      publishOptions.name = buildScreensharePresetTrackName(
        captureRequest?.streamPreset || "",
        captureRequest?.fpsPreset || "30",
      );
    }
    mediaDiagnostics.publishSettings = {
      livekitClientVersion: "2.15.1",
      contentHint: String(captureTrack.contentHint || "").trim() || null,
      source: String(publishOptions?.source || "").trim() || null,
      maxFramerate: Number(publishOptions?.screenShareEncoding?.maxFramerate || 0) || null,
      maxBitrate: Number(publishOptions?.screenShareEncoding?.maxBitrate || 0) || null,
      screenShareEncoding: publishOptions?.screenShareEncoding
        ? { ...publishOptions.screenShareEncoding }
        : null,
      videoEncoding: publishOptions?.videoEncoding ? { ...publishOptions.videoEncoding } : null,
      videoCodec: String(publishOptions?.videoCodec || "").trim() || null,
      scalabilityMode: String(publishOptions?.scalabilityMode || "").trim() || null,
      backupCodec: publishOptions?.backupCodec === true
        ? "enabled_default"
        : (publishOptions?.backupCodec === false ? "disabled" : (publishOptions?.backupCodec ? "configured" : null)),
      simulcast: publishOptions?.simulcast === true,
      degradationPreference: String(publishOptions?.degradationPreference || "").trim() || null,
      priorityRequested: String(publishOptions?.screenShareEncoding?.priority || "").trim() || null,
      networkPriorityRequested: null,
      sourceEncodingPath: publishOptions?.simulcast === false
        ? "screenShareEncoding_direct_single_encoding"
        : "screenShareEncoding_simulcast",
      officialScreenSharePresetMaxFps: 30,
      customScreenShareEncoding: !!publishOptions?.screenShareEncoding,
      signalingLayerMetadataIncludesFps: false,
      privateOneToOne: publishDiagnostics.privateOneToOne === true,
      privateTransportProfile: publishDiagnostics.privateTransportProfile || null,
      capturePath: publishDiagnostics.capturePath || mediaDiagnostics.winningCapturePath || null,
      nativeHighMotionBitrateExperiment: publishDiagnostics.nativeHighMotionBitrateExperiment === true,
    };
    mediaDiagnostics.roomStateAtPublish = String(room?.state || room?.connectionState || "").trim() || null;
    mediaDiagnostics.publishOutcome = "pending";
    const h264CodecPreference = installPrivateNativeH264CodecPreference({
      room,
      captureTrack,
      enabled: performanceDiagnosticsEnabled || publishDiagnostics.hardwareAccelerated1440p60 === true,
      privateOneToOne: isPrivateOneToOne,
      capturePath: mediaDiagnostics.winningCapturePath,
      streamPreset: captureRequest?.streamPreset,
      requestedVideoCodec: publishOptions?.videoCodec,
      hardwareAccelerated1440p60: publishDiagnostics.hardwareAccelerated1440p60 === true,
    });
    mediaDiagnostics.h264HardwareEncoderPreference = h264CodecPreference.getDiagnostics();
    recordCapturePhase("publish_started", {
      selectedSourceId,
      selectedSourceType: selectedSourceKind || selectedSourceType,
      audioRequested: !!captureRequest?.withAudio,
    });
    setShareLifecycleState("publishing", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startShare",
      notifyUi: false,
    });
    try {
      publication = await traceServerStartAwait("video_publication_request", () => (
        room.localParticipant.publishTrack(captureTrack, publishOptions)
      ), {
        roomState: String(room?.state || room?.connectionState || "").trim() || null,
        source: String(publishOptions?.source || "").trim() || null,
      });
    } catch (error) {
      h264CodecPreference.cleanup();
      mediaDiagnostics.h264HardwareEncoderPreference = h264CodecPreference.getDiagnostics();
      mediaDiagnostics.lastShareErrorName = String(error?.name || "").trim() || null;
      mediaDiagnostics.lastShareErrorCode = getSafeCaptureErrorCode(error);
      mediaDiagnostics.lastShareErrorStage = "publish_track";
      mediaDiagnostics.lastShareErrorCategory = classifyShareError(error, "publish_track");
      mediaDiagnostics.publishOutcome = "failed";
      persistPublishError(error);
      recordCapturePhase("publish_failed", {
        selectedSourceId,
        selectedSourceType: selectedSourceKind || selectedSourceType,
        audioRequested: !!captureRequest?.withAudio,
        error,
      });
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
      throw error;
    }
    h264CodecPreference.cleanup();
    mediaDiagnostics.h264HardwareEncoderPreference = h264CodecPreference.getDiagnostics();
    if (shareAttempt !== localShareAttempt || String(captureTrack.readyState || "").trim().toLowerCase() === "ended") {
      try {
        await traceServerStartAwait("stale_video_publication_cleanup", () => (
          room.localParticipant.unpublishTrack(captureTrack, false)
        ));
      } catch (_) {}
      releaseLocalCaptureResources();
      return null;
    }
    mediaDiagnostics.publishSucceededAt = timestampNow();
    try { nativeHighMotionController?.markPublished?.(true); } catch (_) {}
    mediaDiagnostics.publishOutcome = "succeeded";
    mediaDiagnostics.localPublicationVisible = true;
    mediaDiagnostics.lastShareErrorName = null;
    mediaDiagnostics.lastShareErrorCode = null;
    mediaDiagnostics.lastShareErrorStage = null;
    mediaDiagnostics.lastShareErrorCategory = null;
    mediaDiagnostics.exceptionName = null;
    mediaDiagnostics.exceptionMessage = null;
    mediaDiagnostics.exceptionStack = null;
    recordCapturePhase("publish_succeeded", {
      selectedSourceId,
      selectedSourceType: selectedSourceKind || selectedSourceType,
      audioRequested: !!captureRequest?.withAudio,
    });
    localScreenSharePublication = publication;
    if (isPrivate720p60Request(captureRequest, publishDiagnostics)) {
      await traceServerStartAwait("private_sender_policy_application", () => applyAndRecordPrivate720p60SenderPolicy(publication, {
        reason: "post_publish",
        expectedMaxBitrate: publishDiagnostics.initialMaxBitrate,
      }));
    }
    mediaDiagnostics.publisherSdp = readScreensharePublisherSdp(room, publication);
    const publishSenderEncoding = readPublishedSenderEncoding(publication);
    if (mediaDiagnostics.publishSettings) {
      mediaDiagnostics.publishSettings.senderEncodingCount = publishSenderEncoding.encodingCount;
      mediaDiagnostics.publishSettings.senderEncodings = publishSenderEncoding.encodings.map((encoding) => ({ ...encoding }));
      mediaDiagnostics.publishSettings.senderDegradationPreference = publishSenderEncoding.degradationPreference;
    }
    const publishTrackMetrics = readTrackOutputMetrics(publication?.track?.mediaStreamTrack || captureTrack);
    startBoundedRtcStats(publication?.track || null, "sender", mediaDiagnostics.localPerformanceAttemptId);
    startPrivateQualityController(publication, captureRequest, publishDiagnostics);
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
      configuredMaxFramerate: Number(publishOptions?.screenShareEncoding?.maxFramerate || 0) || null,
      configuredBitrate: Number(publishOptions?.screenShareEncoding?.maxBitrate || 0) || null,
      senderEncodingCount: publishSenderEncoding.encodingCount,
      senderMaxFramerate: publishSenderEncoding.maxFramerate,
      senderBitrate: publishSenderEncoding.maxBitrate,
      senderScaleResolutionDownBy: publishSenderEncoding.scaleResolutionDownBy,
      senderDegradationPreference: publishSenderEncoding.degradationPreference,
      senderEncodings: publishSenderEncoding.encodings,
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
        configuredMaxFramerate: Number(publishOptions?.screenShareEncoding?.maxFramerate || 0) || null,
        senderMaxFramerate: publishSenderEncoding.maxFramerate,
      });
    }
    localCaptureAudioTrack = captureAudioTrack || null;
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
    markServerStartTraceStage("local_screenshare_state_commit", {
      recordKey: recordKey || null,
      trackSid: normalizeId(publication?.trackSid || "") || null,
      localShareActive: !!record,
    });
    currentLocalSourceSelection = normalizeSourceSelection({
      sourceId: selectedSourceId,
      sourceKind: selectedSourceKind,
      sourceName: selectedSourceName,
      sourceType: selectedSourceType,
      sourceExistedAtSelection: sourceSelection?.sourceExistedAtSelection,
      sourceEnumerationAgeMs: sourceSelection?.sourceEnumerationAgeMs,
      startStreamingClickedAt: sourceSelection?.startStreamingClickedAt,
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
      publishConfiguredMaxFramerate: Number(publishOptions?.screenShareEncoding?.maxFramerate || 0) || null,
      publishConfiguredBitrate: Number(publishOptions?.screenShareEncoding?.maxBitrate || 0) || null,
      publishSenderMaxFramerate: publishSenderEncoding.maxFramerate,
      publishSenderBitrate: publishSenderEncoding.maxBitrate,
      shareAudioPublishPending: !!(captureAudioTrack || routedAudioCapturePromise),
      fallbackReason: captureFallbackReason || (constraintApplyError ? String(constraintApplyError?.message || constraintApplyError || "apply_constraints_failed") : null),
    });
    if (captureAudioTrack || routedAudioCapturePromise) {
      const audioAttempt = shareAttempt;
      const audioTask = (async () => {
        let publishAudioTrack = captureAudioTrack;
        let routedAudioCapture = null;
        try {
          if (!publishAudioTrack && routedAudioCapturePromise) {
            routedAudioCapture = await traceServerStartAwait("screen_share_audio_track_resolution", () => (
              Promise.resolve(routedAudioCapturePromise)
            ), {
              audioRequested: !!captureRequest?.withAudio,
              source: "routed_audio_capture",
            });
            if (routedAudioCapture?.ok === true && routedAudioCapture?.track) {
              publishAudioTrack = routedAudioCapture.track;
            }
          }
          if (!publishAudioTrack) {
            markServerStartTraceStage("livekit_audio_track_conversion", {
              status: "absent",
              audioRequested: !!captureRequest?.withAudio,
            });
            mediaDiagnostics.screenAudioUnavailable = !!captureRequest?.withAudio;
            emit("screenshare.audio_capture_unavailable", {
              triggerReason: normalizedTriggerReason,
              category: String(routedAudioCapture?.category || "safe_routed_audio_unavailable").slice(0, 120),
              sourceKind: selectedSourceKind || null,
            });
            return;
          }
          if (
            audioAttempt !== localShareAttempt
            || localCaptureTrack !== captureTrack
            || !localShareKey
            || String(publishAudioTrack.readyState || "").toLowerCase() === "ended"
          ) {
            try {
              await traceServerStartAwait("stale_audio_capture_cleanup", () => routedAudioCapture?.stop?.());
            } catch (_) {}
            try { publishAudioTrack.stop?.(); } catch (_) {}
            return;
          }
          localRoutedAudioCapture = routedAudioCapture;
          localCaptureAudioTrack = publishAudioTrack;
          try {
            if (!captureStream.getAudioTracks?.().includes(publishAudioTrack)) captureStream.addTrack(publishAudioTrack);
          } catch (_) {}
          mediaDiagnostics.acquiredAudioTrackCount = 1;
          markServerStartTraceStage("livekit_audio_track_conversion", {
            status: "ready",
            mode: "livekit_publish_wraps_media_stream_track",
            readyState: String(publishAudioTrack?.readyState || "").trim().toLowerCase() || null,
          });
          audioPublication = await traceServerStartAwait("audio_publication_request", () => room.localParticipant.publishTrack(publishAudioTrack, {
            source: Track.Source.ScreenShareAudio,
            stopOnMute: false,
            simulcast: false,
          }), {
            roomState: String(room?.state || room?.connectionState || "").trim() || null,
          });
          if (
            audioAttempt !== localShareAttempt
            || localCaptureTrack !== captureTrack
            || !localShareKey
            || String(publishAudioTrack.readyState || "").toLowerCase() === "ended"
          ) {
            try {
              await traceServerStartAwait("stale_audio_publication_cleanup", () => (
                room.localParticipant.unpublishTrack(publishAudioTrack, false)
              ));
            } catch (_) {}
            try {
              await traceServerStartAwait("post_publish_audio_capture_cleanup", () => routedAudioCapture?.stop?.());
            } catch (_) {}
            return;
          }
          localCaptureAudioTrackSid = normalizeId(audioPublication?.trackSid || "");
          try { onDesktopAudioPublicationChanged?.(true); } catch (_) {}
          emit("screenshare.audio_track_published", {
            triggerReason: normalizedTriggerReason,
            participantId: meId || null,
            trackSid: localCaptureAudioTrackSid || null,
          });
        } catch (error) {
          audioPublishError = error;
          if (audioAttempt !== localShareAttempt) return;
          mediaDiagnostics.screenAudioUnavailable = true;
          try { onDesktopAudioPublicationChanged?.(false); } catch (_) {}
          try {
            await traceServerStartAwait("failed_audio_capture_cleanup", () => routedAudioCapture?.stop?.());
          } catch (_) {}
          emit("screenshare.audio_track_publish_failed", {
            triggerReason: normalizedTriggerReason,
            errorName: String(error?.name || "").trim() || null,
          });
        }
      })();
      localScreenAudioPublishPromise = audioTask;
      void audioTask.finally(() => {
        if (localScreenAudioPublishPromise === audioTask) localScreenAudioPublishPromise = null;
      });
    }
    return record;
  }

  function startShareGuarded({
    triggerReason = "manual_toggle",
    browserCapturePromise = null,
    sourcePickerType = null,
    startStreamingClickedAt = null,
    captureRequestedAt = null,
  } = {}) {
    if (localShareKey && shareRecordsByKey.has(localShareKey)) {
      return Promise.resolve(readActiveShareRecord());
    }
    if (localShareStartPromise) return localShareStartPromise;
    const shareAttempt = ++localShareAttempt;
    beginServerStartTrace({ triggerReason, shareAttempt });
    mediaDiagnostics.localPerformanceAttemptId = createScreensharePerformanceAttemptId(shareAttempt);
    mediaDiagnostics.sourcePickerType = String(sourcePickerType || "").trim() || (browserCapturePromise ? "browser_native" : "electron_custom");
    mediaDiagnostics.sourceAcquisitionPath = browserCapturePromise
      ? "getDisplayMedia"
      : (typeof prepareDesktopCapture === "function" ? "electron_session_display_media" : "desktopCapturer");
    if (!browserCapturePromise) mediaDiagnostics.getDisplayMediaRequestedAt = null;
    mediaDiagnostics.pickerOutcome = null;
    mediaDiagnostics.lastShareErrorCategory = null;
    mediaDiagnostics.lastShareErrorName = null;
    mediaDiagnostics.lastShareErrorCode = null;
    mediaDiagnostics.lastShareErrorStage = null;
    mediaDiagnostics.firstCaptureErrorName = null;
    mediaDiagnostics.firstCaptureErrorCode = null;
    mediaDiagnostics.firstCaptureErrorCategory = null;
    mediaDiagnostics.fallbackCaptureErrorName = null;
    mediaDiagnostics.fallbackCaptureErrorCode = null;
    mediaDiagnostics.fallbackCaptureErrorCategory = null;
    mediaDiagnostics.sourceExistedAtSelection = null;
    mediaDiagnostics.sourceEnumerationAgeMs = null;
    mediaDiagnostics.sourceSelectedAt = null;
    mediaDiagnostics.startStreamingClickedAt = null;
    mediaDiagnostics.captureRequestedAt = null;
    mediaDiagnostics.localVideoTrackCreatedAt = null;
    mediaDiagnostics.screenAudioUnavailable = false;
    mediaDiagnostics.mediaAcquiredAt = null;
    mediaDiagnostics.acquiredVideoTrackCount = 0;
    mediaDiagnostics.acquiredAudioTrackCount = 0;
    mediaDiagnostics.acquiredVideoTrackReadyState = null;
    mediaDiagnostics.publishStartedAt = null;
    mediaDiagnostics.publishSucceededAt = null;
    mediaDiagnostics.captureModel = null;
    mediaDiagnostics.pickerToCaptureSourceIdMatch = null;
    mediaDiagnostics.selectedSourceIdLength = null;
    mediaDiagnostics.captureSourceIdLength = null;
    mediaDiagnostics.roomStateAtPublish = null;
    mediaDiagnostics.publishOutcome = null;
    mediaDiagnostics.localPublicationVisible = false;
    mediaDiagnostics.cleanupCompletedAt = null;
    mediaDiagnostics.captureAttempts = [];
    mediaDiagnostics.acquiredVideoTrackSettings = null;
    mediaDiagnostics.localTrackWrapperMode = null;
    mediaDiagnostics.phase = null;
    mediaDiagnostics.phases = [];
    mediaDiagnostics.selectedSourceId = null;
    mediaDiagnostics.selectedSourceType = null;
    mediaDiagnostics.audioRequested = false;
    mediaDiagnostics.audioFallbackAttempted = false;
    mediaDiagnostics.audioFallbackResult = null;
    mediaDiagnostics.captureHandoffId = null;
    mediaDiagnostics.exceptionName = null;
    mediaDiagnostics.exceptionMessage = null;
    mediaDiagnostics.exceptionStack = null;
    mediaDiagnostics.publishErrorName = null;
    mediaDiagnostics.publishErrorMessage = null;
    mediaDiagnostics.publishErrorStack = null;
    mediaDiagnostics.failurePhase = null;
    mediaDiagnostics.captureAttempt = null;
    mediaDiagnostics.captureFallbackReason = null;
    mediaDiagnostics.displayMediaFailure = null;
    mediaDiagnostics.sourceIdFallbackStartedAt = null;
    mediaDiagnostics.sourceIdFallbackResolvedAt = null;
    mediaDiagnostics.sourceIdFallbackFailure = null;
    mediaDiagnostics.winningCapturePath = null;
    mediaDiagnostics.nativeHighMotionBridge = null;
    mediaDiagnostics.h264HardwareEncoderPreference = null;
    mediaDiagnostics.videoTrackCount = 0;
    mediaDiagnostics.localFirstFrameAt = null;
    mediaDiagnostics.senderStats = null;
    mediaDiagnostics.publishSettings = null;
    mediaDiagnostics.senderParametersBeforeMotionPolicy = null;
    mediaDiagnostics.senderParametersAfterMotionPolicy = null;
    mediaDiagnostics.senderMotionPolicyApplyCount = 0;
    mediaDiagnostics.senderMotionPolicyLastReason = null;
    mediaDiagnostics.senderMotionPolicyLastOutcome = null;
    mediaDiagnostics.senderMotionPolicyVerified = null;
    mediaDiagnostics.senderMotionPolicyMutationAttempted = false;
    mediaDiagnostics.publisherSdp = null;
    mediaDiagnostics.startStreamingClickedAt = String(startStreamingClickedAt || "").trim() || null;
    mediaDiagnostics.captureRequestedAt = String(captureRequestedAt || "").trim() || null;
    if (browserCapturePromise) {
      recordCapturePhase("getDisplayMedia_called", {
        selectedSourceType: "browser_display_media",
        audioRequested: !!shareAudioEnabled,
      });
    }
    setShareLifecycleState("requesting", { triggerReason, callerFunction: "startShare", notifyUi: false });
    localShareStartPromise = startShare({ triggerReason, browserCapturePromise, shareAttempt })
      .then((record) => {
        markServerStartTraceStage("start_share_returned", {
          recordPresent: !!record,
          localShareActive: !!(localShareKey && shareRecordsByKey.has(localShareKey)),
        });
        finishServerStartTrace();
        setShareLifecycleState(record ? "live" : "idle", { triggerReason, callerFunction: "startShare" });
        return record;
      })
      .catch((error) => {
        rejectPendingServerStartTrace(error);
        finishServerStartTrace(error);
        persistTerminalShareError(error, "start");
        releaseLocalCaptureResources({ reason: "failed_start" });
        setShareLifecycleState("idle", { triggerReason, callerFunction: "startShare" });
        throw error;
      })
      .finally(() => {
        localShareStartPromise = null;
      });
    return localShareStartPromise;
  }

  function startBrowserShareFromUserGesture({
    triggerReason = "browser_share_button",
  } = {}) {
    if (localShareKey && shareRecordsByKey.has(localShareKey)) {
      return Promise.resolve(readActiveShareRecord());
    }
    if (localShareStartPromise) return localShareStartPromise;
    if (!room || !room.localParticipant) {
      return startShareGuarded({ triggerReason, sourcePickerType: "browser_native" });
    }
    const captureRequest = buildCurrentCaptureRequest();
    const startStreamingClickedAt = timestampNow();
    const captureRequestedAt = timestampNow();
    mediaDiagnostics.sourcePickerType = "browser_native";
    mediaDiagnostics.getDisplayMediaRequestedAt = timestampNow();
    emit("screenshare.get_display_media_requested", {
      triggerReason: String(triggerReason || "").trim() || "browser_share_button",
      callerFunction: "startBrowserShareFromUserGesture",
      sourceType: "browser_display_media",
      withAudio: !!captureRequest?.withAudio,
    });
    let browserCapturePromise;
    try {
      browserCapturePromise = navigator.mediaDevices.getDisplayMedia({
        video: captureRequest.getDisplayMediaVideoConstraints || true,
        audio: !!captureRequest?.withAudio,
      });
    } catch (error) {
      browserCapturePromise = Promise.reject(error);
    }
    return startShareGuarded({
      triggerReason,
      browserCapturePromise,
      sourcePickerType: "browser_native",
      startStreamingClickedAt,
      captureRequestedAt,
    });
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
    mediaDiagnostics.localPublicationVisible = false;

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

  function stopShareGuarded({ triggerReason = "manual_toggle" } = {}) {
    if (localShareStopPromise) return localShareStopPromise;
    localShareAttempt += 1;
    localShareReplaceAttempt += 1;
    setShareLifecycleState("stopping", { triggerReason, callerFunction: "stopShare" });
    localShareStopPromise = stopShare({ triggerReason })
      .finally(() => {
        preferredSourceSelection = null;
        setShareLifecycleState("idle", { triggerReason, callerFunction: "stopShare" });
        localShareStopPromise = null;
      });
    return localShareStopPromise;
  }

  function handleRemoteTrackPublished(publication, participant, {
    triggerReason = "room_track_published",
    callerFunction = "handleRemoteTrackPublished",
  } = {}) {
    if (String(publication?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isScreenSharePublication(publication, publication?.track || null)) return;
    const remoteParticipant = resolveRemoteShareParticipant(participant);
    const uid = remoteParticipant?.ownerUserId || "";
    const publisherIdentity = remoteParticipant?.publisherIdentity || "";
    if (!uid || !publisherIdentity || publisherIdentity === meId) return;
    const recordKey = resolveRemoteShareRecordKey({
      participantIdentity: publisherIdentity,
      publication,
      track: publication?.track || null,
    });
    if (!recordKey) return;
    const trackSid = normalizeId(publication?.trackSid || publication?.track?.sid || "");
    const existing = shareRecordsByKey.get(recordKey) || null;
    const shouldWatch = !!autoWatchRemoteShares || !!(existing && isRemoteShareRecordWatched(existing));
    const streamBundle = shouldWatch ? createVideoStreamFromTrack(publication?.track || null) : null;
    const record = upsertShareRecord({
      key: recordKey,
      ownerUserId: uid,
      ownerDisplayName: remoteParticipant.ownerDisplayName,
      publisherIdentity,
      technicalCompanion: remoteParticipant.technicalCompanion,
      isLocal: false,
      track: streamBundle?.mediaTrack || null,
      trackSid,
      stream: streamBundle?.stream || null,
      publication,
      keepTrackOnNull: !!shouldWatch,
      watched: shouldWatch,
      notifyStateChange: !shouldWatch,
    });
    if (!record) return;
    markRemotePresentationBoundary(record, "publication_discovered", {
      trackSid: trackSid || null,
    });
    if (!isRemoteShareRecordWatched(record)) {
      applyRemotePublicationSubscription(record, false, {
        triggerReason,
        callerFunction,
      });
      clearShareTrackByKey(record.key, {
        preserveUpdatedAt: false,
      });
      emit("screenshare.remote_track_available", {
        triggerReason,
        participantId: uid || null,
        trackSid: trackSid || null,
        watched: false,
      });
      emitStateChanged(triggerReason, callerFunction);
      return;
    }
    applyRemotePublicationSubscription(record, true, {
      triggerReason,
      callerFunction,
    });
    markRemotePresentationBoundary(record, "subscription_requested", {
      trackSid: trackSid || null,
    });
    scheduleRemotePresentationTimeout(record);
    if (streamBundle?.mediaTrack) {
      const remoteMetrics = readTrackOutputMetrics(streamBundle.mediaTrack);
      emit("screenshare.remote_track_received", {
        triggerReason,
        participantId: uid || null,
        trackId: normalizeId(streamBundle.mediaTrack.id || "") || null,
        trackSid: trackSid || null,
        actualWidth: remoteMetrics.actualWidth,
        actualHeight: remoteMetrics.actualHeight,
        actualFps: remoteMetrics.actualFps,
      });
    }
  }

  function handleRemoteTrackSubscribed(track, publication, participant, {
    triggerReason = "room_track_subscribed",
    callerFunction = "handleRemoteTrackSubscribed",
  } = {}) {
    if (String(track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isScreenSharePublication(publication, track)) return;
    const remoteParticipant = resolveRemoteShareParticipant(participant);
    const uid = remoteParticipant?.ownerUserId || "";
    const publisherIdentity = remoteParticipant?.publisherIdentity || "";
    if (!uid || !publisherIdentity || publisherIdentity === meId) return;
    const remotePerformanceMarker = performanceDiagnosticsEnabled
      ? parseScreensharePerformanceTrackName(publication?.trackName || "")
      : null;
    if (remotePerformanceMarker?.attemptId !== mediaDiagnostics.remotePerformanceAttemptId) {
      mediaDiagnostics.remotePerformanceAttemptId = remotePerformanceMarker?.attemptId || null;
      mediaDiagnostics.remotePerformanceStartStreamingClickedAt = remotePerformanceMarker?.startStreamingClickedAt || null;
      mediaDiagnostics.remotePerformancePublishStartedAt = remotePerformanceMarker?.publishStartedAt || null;
      mediaDiagnostics.remoteTrackSubscribedAt = null;
      mediaDiagnostics.remoteVideoAttachedAt = null;
      mediaDiagnostics.remoteFirstFrameAt = null;
      mediaDiagnostics.receiverStats = null;
      mediaDiagnostics.remoteRenderStats = null;
    }
    const recordKey = resolveRemoteShareRecordKey({
      participantIdentity: publisherIdentity,
      publication,
      track,
    });
    if (!recordKey) return;
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    let record = upsertShareRecord({
      key: recordKey,
      ownerUserId: uid,
      ownerDisplayName: remoteParticipant.ownerDisplayName,
      publisherIdentity,
      technicalCompanion: remoteParticipant.technicalCompanion,
      isLocal: false,
      trackSid,
      publication,
      watched: autoWatchRemoteShares ? true : null,
      keepTrackOnNull: true,
      notifyStateChange: false,
    });
    if (!record) return;
    if (!isRemoteShareRecordWatched(record)) {
      applyRemotePublicationSubscription(record, false, {
        triggerReason,
        callerFunction,
      });
      clearShareTrackByKey(recordKey, {
        preserveUpdatedAt: false,
      });
      emitStateChanged(triggerReason, callerFunction);
      return;
    }
    const streamBundle = createVideoStreamFromTrack(track);
    if (!streamBundle?.mediaTrack || !streamBundle?.stream) return;
    mediaDiagnostics.remoteTrackSubscribedAt = timestampNow();
    mediaDiagnostics.remoteAttachMethod = null;
    mediaDiagnostics.remoteAttachFailureReason = null;
    mediaDiagnostics.remoteAttachFunctionPath = [
      "RoomEvent.TrackSubscribed",
      "handleRemoteTrackSubscribed",
    ];
    startBoundedRtcStats(track, "receiver", mediaDiagnostics.remotePerformanceAttemptId || "");
    record = upsertShareRecord({
      key: recordKey,
      ownerUserId: uid,
      ownerDisplayName: remoteParticipant.ownerDisplayName,
      publisherIdentity,
      technicalCompanion: remoteParticipant.technicalCompanion,
      isLocal: false,
      track: streamBundle.mediaTrack,
      liveKitTrack: track,
      trackSid,
      stream: streamBundle.stream,
      publication,
      keepTrackOnNull: true,
      watched: true,
      notifyStateChange: false,
    });
    if (!record) return;
    markRemotePresentationBoundary(record, "track_subscribed", {
      trackSid: trackSid || null,
    });
    scheduleRemotePresentationTimeout(record);
    applyRemotePublicationSubscription(record, true, {
      triggerReason,
      callerFunction,
    });
    const attachedVideo = attachRemoteVideoElementImmediately(record);
    const remoteMetrics = readTrackOutputMetrics(streamBundle.mediaTrack);
    emit("screenshare.remote_track_received", {
      triggerReason,
      participantId: uid || null,
      trackId: normalizeId(streamBundle.mediaTrack.id || "") || null,
      trackSid: trackSid || null,
      actualWidth: remoteMetrics.actualWidth,
      actualHeight: remoteMetrics.actualHeight,
      actualFps: remoteMetrics.actualFps,
    });
    if (!attachedVideo) emitStateChanged(triggerReason, callerFunction);
  }

  function recordRemotePublicationLayerEvent(event = "", publication = null, value = null, participant = null) {
    if (!performanceDiagnosticsEnabled || !isScreenSharePublication(publication, publication?.track || null)) return;
    const activeRecord = readActiveShareRecord();
    mediaDiagnostics.remoteLayerEvents = [
      ...mediaDiagnostics.remoteLayerEvents.slice(-19),
      {
        event: String(event || "").trim() || "remote_publication_update",
        at: timestampNow(),
        value: String(value ?? "").trim() || null,
        participantMatched: normalizeId(participant?.identity || "") === normalizeId(
          activeRecord?.publisherIdentity || activeRecord?.ownerUserId || "",
        ),
        activePublicationMatched: activeRecord?.publication === publication,
        subscribed: publication?.isSubscribed === true,
        desired: publication?.isDesired === true,
        dimensions: publication?.dimensions
          ? {
            width: Number(publication.dimensions.width || 0) || null,
            height: Number(publication.dimensions.height || 0) || null,
          }
          : null,
      },
    ];
  }

  function handleRemoteTrackStreamStateChanged(publication, streamState, participant) {
    recordRemotePublicationLayerEvent("track_stream_state_changed", publication, streamState, participant);
  }

  function handleRemoteTrackSubscriptionStatusChanged(publication, subscriptionStatus, participant) {
    recordRemotePublicationLayerEvent("track_subscription_status_changed", publication, subscriptionStatus, participant);
  }

  function handleRemoteTrackUnsubscribed(track, publication, participant, {
    triggerReason = "room_track_unsubscribed",
    callerFunction = "handleRemoteTrackUnsubscribed",
  } = {}) {
    if (String(track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isScreenSharePublication(publication, track)) return;
    const remoteParticipant = resolveRemoteShareParticipant(participant);
    const uid = remoteParticipant?.ownerUserId || "";
    const publisherIdentity = remoteParticipant?.publisherIdentity || "";
    if (!uid || !publisherIdentity || publisherIdentity === meId) return;
    const recordKey = resolveRemoteShareRecordKey({
      participantIdentity: publisherIdentity,
      publication,
      track,
    });
    if (!recordKey) return;
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    const existing = shareRecordsByKey.get(recordKey) || null;
    const placeholderRecord = existing || upsertShareRecord({
      key: recordKey,
      ownerUserId: uid,
      ownerDisplayName: remoteParticipant.ownerDisplayName,
      publisherIdentity,
      technicalCompanion: remoteParticipant.technicalCompanion,
      isLocal: false,
      trackSid,
      publication,
      keepTrackOnNull: false,
      watched: false,
    });
    if (!placeholderRecord) return;
    const cleared = clearShareTrackByKey(recordKey, {
      preserveUpdatedAt: false,
    });
    if (cleared) {
      shareRecordsByKey.set(recordKey, {
        ...cleared,
        subscribed: false,
        updatedAt: Date.now(),
      });
    }
    emit("screenshare.remote_track_detached", {
      triggerReason,
      participantId: uid || null,
      trackSid: trackSid || null,
    });
    emitStateChanged(triggerReason, callerFunction);
  }

  function handleRemoteTrackUnpublished(publication, participant, {
    triggerReason = "room_track_unpublished",
    callerFunction = "handleRemoteTrackUnpublished",
  } = {}) {
    if (String(publication?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isScreenSharePublication(publication, publication?.track || null)) return;
    const remoteParticipant = resolveRemoteShareParticipant(participant);
    const uid = remoteParticipant?.ownerUserId || "";
    const publisherIdentity = remoteParticipant?.publisherIdentity || "";
    if (!uid || !publisherIdentity || publisherIdentity === meId) return;
    const recordKey = resolveRemoteShareRecordKey({
      participantIdentity: publisherIdentity,
      publication,
      track: publication?.track || null,
    });
    if (!recordKey) return;
    const existing = shareRecordsByKey.get(recordKey) || null;
    const removed = removeShareRecordByKey(recordKey, {
      triggerReason,
      callerFunction,
    });
    if (!removed) return;
    emit("screenshare.remote_track_removed", {
      triggerReason,
      callerFunction,
      participantId: uid || null,
      trackId: existing?.trackId || null,
      trackSid: normalizeId(publication?.trackSid || existing?.trackSid || "") || null,
    });
    emitStateChanged(triggerReason, callerFunction);
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
        handleRemoteTrackPublished(publication, participant, {
          triggerReason: "room_remote_hydrate_publication",
          callerFunction: "hydrateExistingRemoteShares",
        });
        const subscribedTrack = publication?.track || null;
        if (!subscribedTrack) return;
        handleRemoteTrackSubscribed(subscribedTrack, publication, participant, {
          triggerReason: "room_remote_hydrate_subscribed",
          callerFunction: "hydrateExistingRemoteShares",
        });
      });
    });
  }

  function bindRoom(nextRoom = null) {
    if (!nextRoom || room === nextRoom) return;
    if (room && roomBound) {
      try { room.off(RoomEvent.TrackPublished, handleRemoteTrackPublished); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackStreamStateChanged, handleRemoteTrackStreamStateChanged); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscriptionStatusChanged, handleRemoteTrackSubscriptionStatusChanged); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnpublished, handleRemoteTrackUnpublished); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
      roomBound = false;
    }
    room = nextRoom;
    room.on(RoomEvent.TrackPublished, handleRemoteTrackPublished);
    room.on(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed);
    room.on(RoomEvent.TrackStreamStateChanged, handleRemoteTrackStreamStateChanged);
    room.on(RoomEvent.TrackSubscriptionStatusChanged, handleRemoteTrackSubscriptionStatusChanged);
    room.on(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed);
    room.on(RoomEvent.TrackUnpublished, handleRemoteTrackUnpublished);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    roomBound = true;
    hydrateExistingRemoteShares();
    emitStateChanged("room_bound", "bindRoom");
  }

  function ensureUiForShare(stageViewport = null, recordInput = null) {
    if (!stageViewport || typeof document === "undefined") return null;
    const record = recordInput && typeof recordInput === "object" ? recordInput : null;
    const shareKey = normalizeId(record?.key || "");
    if (!shareKey) return null;
    let refs = uiRefsByShareKey.get(shareKey) || null;
    if (refs?.panel) {
      if (refs.panel.parentElement == null) {
        try { stageViewport.appendChild(refs.panel); } catch (_) {}
      }
      if (refs.video && !refs.video.isConnected) {
        try { refs.panel.appendChild(refs.video); } catch (_) {}
      }
      refs.stageViewport = stageViewport;
      refs.ownerUserId = normalizeId(record?.ownerUserId || refs.ownerUserId || "");
      refs.isLocal = record?.isLocal === true;
      refs.panel.__altaraShareKey = shareKey;
      refs.panel.__altaraShareOwnerUserId = refs.ownerUserId;
      refs.panel.__altaraShareIsLocal = refs.isLocal;
      return refs;
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

    refs = {
      shareKey,
      ownerUserId: normalizeId(record?.ownerUserId || ""),
      isLocal: record?.isLocal === true,
      panel,
      header,
      badge,
      title,
      video,
      stageViewport,
    };
    panel.__altaraShareKey = shareKey;
    panel.__altaraShareOwnerUserId = refs.ownerUserId;
    panel.__altaraShareIsLocal = refs.isLocal;
    uiRefsByShareKey.set(shareKey, refs);
    return refs;
  }

  function clearShareUiByKey(key = "") {
    const shareKey = normalizeId(key);
    const refs = shareKey ? (uiRefsByShareKey.get(shareKey) || null) : null;
    if (!refs) return false;
    try {
      if (refs.video) {
        refs.video.pause?.();
        refs.video.srcObject = null;
        refs.video.remove?.();
      }
    } catch (_) {}
    try { refs.panel?.remove?.(); } catch (_) {}
    uiRefsByShareKey.delete(shareKey);
    return true;
  }

  function clearUi() {
    if (remoteRenderStatsTimer) clearTimeout(remoteRenderStatsTimer);
    remoteRenderStatsTimer = null;
    if (remoteStageRefreshTimer) clearTimeout(remoteStageRefreshTimer);
    remoteStageRefreshTimer = null;
    for (const key of remotePresentationTimersByShareKey.keys()) {
      clearRemotePresentationTimer(key);
    }
    Array.from(uiRefsByShareKey.keys()).forEach((key) => clearShareUiByKey(key));
    lastRenderSignature = "";
  }

  function renderShareRecord(record = null, stageViewport = null, enabled = false) {
    const shareRecord = record && typeof record === "object" ? record : null;
    if (!shareRecord?.key) return null;
    const refs = ensureUiForShare(stageViewport, shareRecord);
    if (!refs) return null;
    const shouldShow = !!(enabled && shareRecord.stream);
    const liveKitRemoteAttached = !!refs.video.getAttribute("data-livekit-screenshare-track-id");
    const videoAdoptedByStageTile = !!refs.video.closest?.(".stageGridTile, .participantTile");

    refs.panel.hidden = !shouldShow;
    refs.panel.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    const active = shareRecord;
    refs.title.textContent = readPresentationTitle(active);
    if (!shouldShow) {
      refs.panel.removeAttribute("data-immediate-remote-screenshare");
      if (refs.video.srcObject && !liveKitRemoteAttached && !videoAdoptedByStageTile) {
        try {
          refs.video.pause?.();
          refs.video.srcObject = null;
        } catch (_) {
          refs.video.srcObject = null;
        }
      }
      return { refs, visible: false };
    }

    if (!shareRecord.isLocal && shareRecord.liveKitTrack && shareRecord.attachedVideoElement !== refs.video) {
      attachRemoteVideoElementImmediately(shareRecord);
    }
    const usesImmediateRemoteVideo = !!(
      !shareRecord.isLocal
      && shareRecord.attachedVideoElement === refs.video
      && shareRecord.liveKitTrack
    );
    if (usesImmediateRemoteVideo) {
      refs.panel.setAttribute("data-immediate-remote-screenshare", "1");
    } else if (!shareRecord.isLocal && shareRecord.liveKitTrack) {
      // Remote ScreenShare media remains owned exclusively by LiveKit attach().
    } else if (refs.video.srcObject !== shareRecord.stream) {
      refs.video.srcObject = shareRecord.stream;
    }
    try { refs.video.play?.().catch?.(() => {}); } catch (_) {}
    return { refs, visible: true };
  }

  function render({
    stageViewport = null,
    enabled = false,
    triggerReason = "refresh_call_ui",
    callerFunction = "render",
  } = {}) {
    if (!stageViewport || typeof document === "undefined") return;
    // Remote ScreenShare media is owned exclusively by the LiveKit attach()
    // path inside renderShareRecord; render() only reconciles presentation.
    const state = buildState();
    const records = Array.from(shareRecordsByKey.values());
    const activeKeys = new Set(records.map((record) => normalizeId(record?.key || "")).filter(Boolean));
    const rendered = records.map((record) => renderShareRecord(record, stageViewport, enabled)).filter(Boolean);
    for (const [key, refs] of uiRefsByShareKey.entries()) {
      if (activeKeys.has(key)) continue;
      if (refs?.panel) {
        refs.panel.hidden = true;
        refs.panel.setAttribute("aria-hidden", "true");
      }
      clearShareUiByKey(key);
    }

    const visibleRecords = rendered.filter((entry) => entry.visible === true);
    const liveKitRemoteAttached = visibleRecords.some((entry) => (
      !!entry?.refs?.video?.getAttribute?.("data-livekit-screenshare-track-id")
    ));
    const videoAdoptedByStageTile = visibleRecords.some((entry) => (
      !!entry?.refs?.video?.closest?.(".stageGridTile, .participantTile")
    ));
    const active = state.activeShare || null;
    const signature = [
      enabled ? "1" : "0",
      visibleRecords.map((entry) => entry.refs.shareKey).join(","),
      String(active?.key || "none"),
      String(state.localShareActive ? "1" : "0"),
    ].join("|");
    if (signature !== lastRenderSignature) {
      lastRenderSignature = signature;
      emit("screenshare.render_updated", {
        triggerReason: String(triggerReason || "").trim() || "refresh_call_ui",
        callerFunction: String(callerFunction || "").trim() || "render",
        visible: visibleRecords.length > 0,
        visibleShareCount: visibleRecords.length,
        liveKitRemoteAttached,
        videoAdoptedByStageTile,
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
        await stopShareGuarded({ triggerReason });
      } catch (_) {
        releaseLocalCaptureResources({ reason: "detach_stop_failed" });
      }
    } else {
      releaseLocalCaptureResources({ reason: "detach_without_stop" });
    }
    if (room && roomBound) {
      try { room.off(RoomEvent.TrackPublished, handleRemoteTrackPublished); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackStreamStateChanged, handleRemoteTrackStreamStateChanged); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscriptionStatusChanged, handleRemoteTrackSubscriptionStatusChanged); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnpublished, handleRemoteTrackUnpublished); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
    }
    roomBound = false;
    room = null;
    if (typeof unsubscribeDesktopCapturePhases === "function") {
      try { unsubscribeDesktopCapturePhases(); } catch (_) {}
      unsubscribeDesktopCapturePhases = null;
    }
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
    notifyUi = true,
  } = {}) {
    const nextStreamPreset = deriveStreamPresetFromQualityAndFps(nextQualityPreset, fpsPreset);
    const committed = commitCapturePreference({
      nextQualityPreset,
      nextFpsPreset: fpsPreset,
      nextStreamPreset,
      triggerReason,
      callerFunction: "setQualityPreset",
      notifyUi,
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
    notifyUi = true,
  } = {}) {
    const nextStreamPreset = deriveStreamPresetFromQualityAndFps(qualityPreset, nextFpsPreset);
    const committed = commitCapturePreference({
      nextQualityPreset: qualityPreset,
      nextFpsPreset,
      nextStreamPreset,
      triggerReason,
      callerFunction: "setFpsPreset",
      notifyUi,
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
    notifyUi = true,
  } = {}) {
    const normalizedStreamPreset = normalizeScreenshareStreamPreset(nextStreamPreset);
    const derived = deriveQualityAndFpsFromStreamPreset(normalizedStreamPreset, fpsPreset);
    const committed = commitCapturePreference({
      nextQualityPreset: derived.qualityPreset,
      nextFpsPreset: derived.fpsPreset,
      nextStreamPreset: normalizedStreamPreset,
      triggerReason,
      callerFunction: "setStreamPreset",
      notifyUi,
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
    notifyUi = true,
  } = {}) {
    const committed = commitShareAudioPreference(nextShareAudioEnabled, {
      triggerReason,
      callerFunction: "setShareAudioEnabled",
      notifyUi,
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
    startShare: startShareGuarded,
    startBrowserShareFromUserGesture,
    stopShare: stopShareGuarded,
    async toggleShare({ triggerReason = "manual_toggle" } = {}) {
      if (localShareKey && shareRecordsByKey.has(localShareKey)) {
        await stopShareGuarded({ triggerReason });
        return false;
      }
      const record = await startShareGuarded({ triggerReason });
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
      notifyUi = true,
    } = {}) {
      return setPreferredSourceSelection(selection, {
        triggerReason: String(triggerReason || "").trim() || "source_selected",
        callerFunction: "setPreferredSourceSelection",
        notifyUi,
      });
    },
    replaceShareSource({ triggerReason = "source_switch" } = {}) {
      return replaceLocalShareSource({
        triggerReason: String(triggerReason || "").trim() || "source_switch",
      });
    },
    getCurrentSourceSelection() {
      return currentLocalSourceSelection ? { ...currentLocalSourceSelection } : null;
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
    watchShare(key = "", {
      triggerReason = "watch_share",
      focusActive = true,
    } = {}) {
      return watchRemoteShareByKey(key, {
        triggerReason: String(triggerReason || "").trim() || "watch_share",
        callerFunction: "watchShare",
        focusActive: !!focusActive,
      });
    },
    stopWatchingShare(key = "", {
      triggerReason = "stop_watching_share",
    } = {}) {
      return stopWatchingRemoteShareByKey(key, {
        triggerReason: String(triggerReason || "").trim() || "stop_watching_share",
        callerFunction: "stopWatchingShare",
      });
    },
    isShareWatched(key = "") {
      const normalizedKey = normalizeId(key);
      if (!normalizedKey) return false;
      const record = shareRecordsByKey.get(normalizedKey) || null;
      if (!record) return false;
      return isRemoteShareRecord(record) ? isRemoteShareRecordWatched(record) : true;
    },
    getState() {
      return buildState();
    },
    getPresentations() {
      return Array.from(shareRecordsByKey.values()).map((record) => {
        const refs = uiRefsByShareKey.get(normalizeId(record?.key || "")) || null;
        return {
          key: record?.key || "",
          ownerUserId: record?.ownerUserId || "",
          isLocal: record?.isLocal === true,
          panel: refs?.panel || null,
          video: refs?.video || null,
          visible: !!(refs?.panel && !refs.panel.hidden),
        };
      });
    },
    getRemoteVideoElement({ trackId = "", trackSid = "" } = {}) {
      const expectedTrackId = normalizeId(trackId || "");
      const expectedTrackSid = normalizeId(trackSid || "");
      const record = Array.from(shareRecordsByKey.values()).find((candidate) => (
        isRemoteShareRecord(candidate)
        && (
          (!expectedTrackId && !expectedTrackSid)
          || (expectedTrackId && [candidate.trackId, candidate.track?.id, candidate.liveKitTrack?.mediaStreamTrack?.id]
            .some((value) => normalizeId(value || "") === expectedTrackId))
          || (expectedTrackSid && normalizeId(candidate.trackSid || "") === expectedTrackSid)
        )
      )) || null;
      if (!record) return null;
      if (!record.attachedVideoElement?.isConnected) {
        attachRemoteVideoElementImmediately(record);
      }
      applyRemotePublicationSubscription(record, true, {
        triggerReason: "stage_video_adopted",
        callerFunction: "getRemoteVideoElement",
      });
      return record.attachedVideoElement || null;
    },
    getDiagnostics() {
      const localRecord = shareRecordsByKey.get(normalizeId(localShareKey || "")) || null;
      const requestedConstraints = buildCaptureVideoConstraints({ qualityPreset, fpsPreset });
      const requestedMetrics = readCaptureRequestMetrics(localRecord?.captureRequest || {
        streamPreset,
        qualityPreset,
        fpsPreset,
        applyConstraints: requestedConstraints,
      });
      const senderStats = mediaDiagnostics.senderStats || null;
      const senderEncoding = Array.isArray(senderStats?.encodings) ? senderStats.encodings[0] || null : null;
      const receiverStats = mediaDiagnostics.receiverStats || null;
      const effectiveTransportProfile = mediaDiagnostics.publishSettings?.privateTransportProfile
        || (isPrivateOneToOne && requestedMetrics.requestedFps >= 50 && requestedMetrics.requestedHeight <= 720
          ? "single_720p60_h264_maintain_framerate"
          : (isPrivateOneToOne ? privateOneToOneTransportProfile : null));
      const currentCaptureSettings = readTrackCaptureSettings(localCaptureTrack)
        || mediaDiagnostics.acquiredVideoTrackSettings
        || null;
      const currentSenderParameters = readScreenshareSenderParameters(localScreenSharePublication);
      const currentPrivateQualitySnapshot = privateQualityController?.getSnapshot?.()
        || (mediaDiagnostics.privateQualityController ? { ...mediaDiagnostics.privateQualityController } : null);
      const currentSenderSample = currentPrivateQualitySnapshot?.lastSample || null;
      const senderOutputWidth = Number(currentSenderSample?.width || senderStats?.width || senderEncoding?.width || 0) || null;
      const senderOutputHeight = Number(currentSenderSample?.height || senderStats?.height || senderEncoding?.height || 0) || null;
      const captureWidth = Number(currentCaptureSettings?.width || 0) || null;
      const captureHeight = Number(currentCaptureSettings?.height || 0) || null;
      const observedSpatialScale = captureWidth && captureHeight && senderOutputWidth && senderOutputHeight
        ? Number(Math.max(captureWidth / senderOutputWidth, captureHeight / senderOutputHeight).toFixed(3))
        : null;
      const configuredSpatialScale = Number(currentSenderParameters?.scaleResolutionDownBy || 0) || null;
      const captureTrackSettingFps = Number(currentCaptureSettings?.frameRate || 0) || null;
      const captureMeasuredSourceFps = Number(senderStats?.mediaSourceFpsDelta || 0) || null;
      const outboundMeasuredFps = Number(senderStats?.outboundFramesEncodedPerSecond || senderStats?.fps || 0) || null;
      const senderActualBitrate = Number(currentSenderSample?.actualBitrate || senderStats?.bitrateBps || 0) || null;
      const senderBitrateHeadroom = deriveScreenshareBitrateHeadroom({
        actualBitrate: senderActualBitrate,
        encodedFps: outboundMeasuredFps,
        targetFps: 60,
      });
      const receiverMeasuredFps = Number(receiverStats?.receiverFramesDecodedPerSecond || receiverStats?.fps || 0) || null;
      const cadenceClassification = classifyScreenshareCadence({
        mediaSourceFps: captureMeasuredSourceFps,
        outboundFps: outboundMeasuredFps,
        targetFps: requestedMetrics.requestedFps,
      });
      const activeNativeController = localCaptureStream?.__altaraNativeHighMotionController || null;
      const nativeHighMotionBridgeDiagnostics = typeof activeNativeController?.getDiagnostics === "function"
        ? activeNativeController.getDiagnostics()
        : mediaDiagnostics.nativeHighMotionBridge;
      const nativeHighMotionBoundaryClassification = nativeHighMotionBridgeDiagnostics
        ? classifyNativeHighMotionBoundary({
          nativeCaptureFps: nativeHighMotionBridgeDiagnostics.nativeCaptureFps,
          bridgeProducedFps: nativeHighMotionBridgeDiagnostics.bridgeProducedFps,
          outboundFps: outboundMeasuredFps,
        })
        : null;
      return {
        serverStartTrace: cloneServerStartTrace(),
        shareState: localShareLifecycleState,
        sourcePickerType: mediaDiagnostics.sourcePickerType,
        sourceAcquisitionPath: mediaDiagnostics.sourceAcquisitionPath,
        pickerOutcome: mediaDiagnostics.pickerOutcome,
        getDisplayMediaRequestedAt: mediaDiagnostics.getDisplayMediaRequestedAt,
        mediaAcquiredAt: mediaDiagnostics.mediaAcquiredAt,
        acquiredVideoTrackCount: mediaDiagnostics.acquiredVideoTrackCount,
        acquiredAudioTrackCount: mediaDiagnostics.acquiredAudioTrackCount,
        acquiredVideoTrackReadyState: mediaDiagnostics.acquiredVideoTrackReadyState,
        publishStartedAt: mediaDiagnostics.publishStartedAt,
        publishSucceededAt: mediaDiagnostics.publishSucceededAt,
        lastShareErrorName: mediaDiagnostics.lastShareErrorName,
        lastShareErrorCode: mediaDiagnostics.lastShareErrorCode,
        lastShareErrorStage: mediaDiagnostics.lastShareErrorStage,
        lastShareErrorCategory: mediaDiagnostics.lastShareErrorCategory,
        firstCaptureErrorName: mediaDiagnostics.firstCaptureErrorName,
        firstCaptureErrorCode: mediaDiagnostics.firstCaptureErrorCode,
        firstCaptureErrorCategory: mediaDiagnostics.firstCaptureErrorCategory,
        fallbackCaptureErrorName: mediaDiagnostics.fallbackCaptureErrorName,
        fallbackCaptureErrorCode: mediaDiagnostics.fallbackCaptureErrorCode,
        fallbackCaptureErrorCategory: mediaDiagnostics.fallbackCaptureErrorCategory,
        sourceExistedAtSelection: mediaDiagnostics.sourceExistedAtSelection,
        sourceEnumerationAgeMs: mediaDiagnostics.sourceEnumerationAgeMs,
        sourceSelectedAt: mediaDiagnostics.sourceSelectedAt,
        startStreamingClickedAt: mediaDiagnostics.startStreamingClickedAt,
        captureRequestedAt: mediaDiagnostics.captureRequestedAt,
        localVideoTrackCreatedAt: mediaDiagnostics.localVideoTrackCreatedAt,
        screenAudioUnavailable: mediaDiagnostics.screenAudioUnavailable,
        remoteTrackSubscribedAt: mediaDiagnostics.remoteTrackSubscribedAt,
        remoteVideoAttachedAt: mediaDiagnostics.remoteVideoAttachedAt,
        remoteFirstFrameAt: mediaDiagnostics.remoteFirstFrameAt,
        captureModel: mediaDiagnostics.captureModel,
        pickerToCaptureSourceIdMatch: mediaDiagnostics.pickerToCaptureSourceIdMatch,
        selectedSourceIdLength: mediaDiagnostics.selectedSourceIdLength,
        captureSourceIdLength: mediaDiagnostics.captureSourceIdLength,
        roomStateAtPublish: mediaDiagnostics.roomStateAtPublish,
        publishOutcome: mediaDiagnostics.publishOutcome,
        localPublicationVisible: mediaDiagnostics.localPublicationVisible,
        cleanupCompletedAt: mediaDiagnostics.cleanupCompletedAt,
        captureAttempts: mediaDiagnostics.captureAttempts.map((attempt) => ({ ...attempt })),
        acquiredVideoTrackSettings: mediaDiagnostics.acquiredVideoTrackSettings
          ? { ...mediaDiagnostics.acquiredVideoTrackSettings }
          : null,
        localTrackWrapperMode: mediaDiagnostics.localTrackWrapperMode,
        phase: mediaDiagnostics.phase,
        phases: mediaDiagnostics.phases.map((entry) => ({ ...entry })),
        selectedSourceId: mediaDiagnostics.selectedSourceId,
        selectedSourceType: mediaDiagnostics.selectedSourceType,
        audioRequested: mediaDiagnostics.audioRequested,
        audioFallbackAttempted: mediaDiagnostics.audioFallbackAttempted,
        audioFallbackResult: mediaDiagnostics.audioFallbackResult,
        captureHandoffId: mediaDiagnostics.captureHandoffId,
        exceptionName: mediaDiagnostics.exceptionName,
        exceptionMessage: mediaDiagnostics.exceptionMessage,
        exceptionStack: mediaDiagnostics.exceptionStack,
        publishErrorName: mediaDiagnostics.publishErrorName,
        publishErrorMessage: mediaDiagnostics.publishErrorMessage,
        publishErrorStack: mediaDiagnostics.publishErrorStack,
        failurePhase: mediaDiagnostics.failurePhase,
        captureAttempt: mediaDiagnostics.captureAttempt,
        captureFallbackReason: mediaDiagnostics.captureFallbackReason,
        displayMediaFailure: mediaDiagnostics.displayMediaFailure ? { ...mediaDiagnostics.displayMediaFailure } : null,
        sourceIdFallbackStartedAt: mediaDiagnostics.sourceIdFallbackStartedAt,
        sourceIdFallbackResolvedAt: mediaDiagnostics.sourceIdFallbackResolvedAt,
        sourceIdFallbackFailure: mediaDiagnostics.sourceIdFallbackFailure ? { ...mediaDiagnostics.sourceIdFallbackFailure } : null,
        winningCapturePath: mediaDiagnostics.winningCapturePath,
        nativeHighMotionEligibility: mediaDiagnostics.nativeHighMotionEligibility
          ? { ...mediaDiagnostics.nativeHighMotionEligibility }
          : null,
        nativeHighMotionBridge: nativeHighMotionBridgeDiagnostics
          ? {
            ...nativeHighMotionBridgeDiagnostics,
            boundaryClassification: nativeHighMotionBoundaryClassification,
          }
          : null,
        videoTrackCount: mediaDiagnostics.videoTrackCount,
        displayCaptureRequests: mediaDiagnostics.displayCaptureRequests,
        displayCaptureStreamsCreated: mediaDiagnostics.displayCaptureStreamsCreated,
        displayCaptureVideoTracksCreated: mediaDiagnostics.displayCaptureVideoTracksCreated,
        displayCaptureTracksStopped: mediaDiagnostics.displayCaptureTracksStopped,
        pendingDisplayCaptureHandlers: mediaDiagnostics.pendingDisplayCaptureHandlers,
        activeDisplayCaptureTracks: activeDisplayCaptureTracks.size,
        requestedRemoteVideoQuality: mediaDiagnostics.requestedRemoteVideoQuality,
        requestedRemoteVideoDimensions: mediaDiagnostics.requestedRemoteVideoDimensions
          ? { ...mediaDiagnostics.requestedRemoteVideoDimensions }
          : null,
        requestedRemoteVideoFps: mediaDiagnostics.requestedRemoteVideoFps,
        requestedRemoteVideoFpsAttribution: mediaDiagnostics.requestedRemoteVideoFpsAttribution,
        remotePublication: mediaDiagnostics.remotePublication ? { ...mediaDiagnostics.remotePublication } : null,
        remoteAttachMethod: mediaDiagnostics.remoteAttachMethod,
        remoteAttachAttemptedAt: mediaDiagnostics.remoteAttachAttemptedAt,
        remoteAttachFailureReason: mediaDiagnostics.remoteAttachFailureReason,
        remoteAttachFunctionPath: mediaDiagnostics.remoteAttachFunctionPath.slice(),
        remoteRenderComparison: mediaDiagnostics.remoteRenderComparison
          ? {
            ...mediaDiagnostics.remoteRenderComparison,
            stage: mediaDiagnostics.remoteRenderComparison.stage
              ? { ...mediaDiagnostics.remoteRenderComparison.stage }
              : null,
            clean: mediaDiagnostics.remoteRenderComparison.clean
              ? { ...mediaDiagnostics.remoteRenderComparison.clean }
              : null,
          }
          : null,
        remoteLayerEvents: mediaDiagnostics.remoteLayerEvents.map((entry) => ({
          ...entry,
          dimensions: entry?.dimensions ? { ...entry.dimensions } : null,
        })),
        stageActivity: buildStageActivitySnapshot(),
        publishSettings: mediaDiagnostics.publishSettings ? { ...mediaDiagnostics.publishSettings } : null,
        requestedPreset: {
          width: requestedMetrics.requestedWidth,
          height: requestedMetrics.requestedHeight,
          fps: requestedMetrics.requestedFps,
        },
        liveKitPath: {
          installedClientVersion: mediaDiagnostics.publishSettings?.livekitClientVersion || "2.15.1",
          trackSource: String(
            localScreenSharePublication?.source
            || localScreenSharePublication?.track?.source
            || mediaDiagnostics.publishSettings?.source
            || "",
          ).trim() || null,
          mediaStreamTrackContentHint: String(
            localScreenSharePublication?.track?.mediaStreamTrack?.contentHint
            || localCaptureTrack?.contentHint
            || mediaDiagnostics.publishSettings?.contentHint
            || "",
          ).trim() || null,
          requestedVideoCodec: String(mediaDiagnostics.publishSettings?.videoCodec || "").trim() || null,
          negotiatedVideoCodec: String(
            senderStats?.codec
            || senderEncoding?.codec
            || localScreenSharePublication?.track?.codec
            || "",
          ).trim() || null,
          videoCodec: String(
            senderStats?.codec
            || senderEncoding?.codec
            || localScreenSharePublication?.track?.codec
            || mediaDiagnostics.publishSettings?.videoCodec
            || "",
          ).trim() || null,
          officialScreenSharePresetMaxFps: 30,
          customScreenShareEncoding: mediaDiagnostics.publishSettings?.customScreenShareEncoding === true,
          sourceEncodingPath: mediaDiagnostics.publishSettings?.sourceEncodingPath || null,
          signalingLayerMetadataIncludesFps: false,
          subscriberRequestedFps: Number(mediaDiagnostics.requestedRemoteVideoFps || 0) || null,
        },
        effectiveCapture: {
          width: Number(currentCaptureSettings?.width || 0) || null,
          height: Number(currentCaptureSettings?.height || 0) || null,
          fps: captureTrackSettingFps,
          fpsAttribution: "media_stream_track_getSettings_setting_not_measured_cadence",
        },
        captureRequestedFps: requestedMetrics.requestedFps,
        captureTrackSettingFps,
        captureMeasuredSourceFps,
        captureMeasuredSourceFpsAttribution: senderStats?.mediaSourceCadenceSource || null,
        requestedFps: requestedMetrics.requestedFps,
        actualCaptureFps: captureTrackSettingFps,
        actualCaptureFpsAttribution: "legacy_media_stream_track_getSettings_setting_not_measured_cadence",
        cadenceBoundary: {
          classification: cadenceClassification,
          targetFps: requestedMetrics.requestedFps,
          mediaSourceFps: captureMeasuredSourceFps,
          outboundFramesEncodedPerSecond: outboundMeasuredFps,
          outboundFramesSentPerSecond: Number(senderStats?.outboundFramesSentPerSecond || 0) || null,
          receiverFramesReceivedPerSecond: Number(receiverStats?.receiverFramesReceivedPerSecond || 0) || null,
          receiverFramesDecodedPerSecond: receiverMeasuredFps,
          receiverComparableToLocalSender: false,
          downstreamClassificationRequiresSenderReceiverSnapshotCorrelation: true,
          sampleWindowMs: Number(senderStats?.sampleWindowMs || receiverStats?.sampleWindowMs || 0) || null,
        },
        rendererRuntime: {
          visibilityState: typeof document !== "undefined" ? String(document.visibilityState || "") || null : null,
          hidden: typeof document !== "undefined" ? !!document.hidden : null,
          documentFocused: typeof document !== "undefined" && typeof document.hasFocus === "function"
            ? !!document.hasFocus()
            : null,
        },
        electronBackgroundThrottling: mediaDiagnostics.electronBackgroundThrottling
          ? { ...mediaDiagnostics.electronBackgroundThrottling }
          : null,
        trueCadenceProbe: {
          available: performanceDiagnosticsEnabled,
          inFlight: !!trueCadenceMeasurementPromise,
          captureOnlyInFlight: !!captureOnlyCadenceMeasurementPromise,
          lastMeasurement: mediaDiagnostics.lastTrueCadenceMeasurement
            ? { ...mediaDiagnostics.lastTrueCadenceMeasurement }
            : null,
          lastCaptureOnlyMeasurement: mediaDiagnostics.lastCaptureOnlyCadenceMeasurement
            ? { ...mediaDiagnostics.lastCaptureOnlyCadenceMeasurement }
            : null,
        },
        configuredMaxBitrate: Number(mediaDiagnostics.publishSettings?.maxBitrate || 0) || null,
        transportProfile: effectiveTransportProfile,
        publication: {
          simulcast: mediaDiagnostics.publishSettings?.simulcast ?? null,
          requestedVideoCodec: String(mediaDiagnostics.publishSettings?.videoCodec || "").trim() || null,
          maxFramerate: Number(currentSenderParameters?.maxFramerate || mediaDiagnostics.publishSettings?.maxFramerate || 0) || null,
          maxBitrate: Number(currentSenderParameters?.maxBitrate || mediaDiagnostics.publishSettings?.maxBitrate || 0) || null,
          degradationPreference: currentSenderParameters?.degradationPreference
            || mediaDiagnostics.publishSettings?.senderDegradationPreference
            || mediaDiagnostics.publishSettings?.degradationPreference
            || null,
        },
        effectiveSenderParameters: {
          encodingCount: Number(currentSenderParameters?.encodingCount || 0),
          encodings: Array.isArray(currentSenderParameters?.encodings)
            ? currentSenderParameters.encodings.map((entry) => ({ ...entry }))
            : [],
          degradationPreference: currentSenderParameters?.degradationPreference || null,
          beforeMotionPolicy: mediaDiagnostics.senderParametersBeforeMotionPolicy
            ? {
              ...mediaDiagnostics.senderParametersBeforeMotionPolicy,
              encodings: mediaDiagnostics.senderParametersBeforeMotionPolicy.encodings?.map((entry) => ({ ...entry })) || [],
            }
            : null,
          afterMotionPolicy: mediaDiagnostics.senderParametersAfterMotionPolicy
            ? {
              ...mediaDiagnostics.senderParametersAfterMotionPolicy,
              encodings: mediaDiagnostics.senderParametersAfterMotionPolicy.encodings?.map((entry) => ({ ...entry })) || [],
            }
            : null,
          policyApplyCount: Number(mediaDiagnostics.senderMotionPolicyApplyCount || 0),
          lastPolicyReason: mediaDiagnostics.senderMotionPolicyLastReason || null,
          lastPolicyOutcome: mediaDiagnostics.senderMotionPolicyLastOutcome || null,
          policyVerified: mediaDiagnostics.senderMotionPolicyVerified === true,
          policyMutationAttempted: mediaDiagnostics.senderMotionPolicyMutationAttempted === true,
          altaraManualSpatialAdaptation: false,
          configuredSpatialScaleResolutionDownBy: configuredSpatialScale,
          observedOutputSpatialScale: observedSpatialScale,
          adaptationAttribution: observedSpatialScale && configuredSpatialScale
            && observedSpatialScale > configuredSpatialScale + 0.1
            ? "chromium_webrtc_internal_not_altara_manual_scale"
            : "no_internal_spatial_delta_observed",
          h264HardwareEncoderPreference: mediaDiagnostics.h264HardwareEncoderPreference
            ? { ...mediaDiagnostics.h264HardwareEncoderPreference }
            : null,
          publisherSdp: mediaDiagnostics.publisherSdp
            ? {
              ...mediaDiagnostics.publisherSdp,
              bandwidthLines: [...(mediaDiagnostics.publisherSdp.bandwidthLines || [])],
              framerateLines: [...(mediaDiagnostics.publisherSdp.framerateLines || [])],
              ridLines: [...(mediaDiagnostics.publisherSdp.ridLines || [])],
              simulcastLines: [...(mediaDiagnostics.publisherSdp.simulcastLines || [])],
              codecs: (mediaDiagnostics.publisherSdp.codecs || []).map((entry) => ({ ...entry })),
              remoteAnswer: mediaDiagnostics.publisherSdp.remoteAnswer
                ? {
                  ...mediaDiagnostics.publisherSdp.remoteAnswer,
                  bandwidthLines: [...(mediaDiagnostics.publisherSdp.remoteAnswer.bandwidthLines || [])],
                  framerateLines: [...(mediaDiagnostics.publisherSdp.remoteAnswer.framerateLines || [])],
                  ridLines: [...(mediaDiagnostics.publisherSdp.remoteAnswer.ridLines || [])],
                  simulcastLines: [...(mediaDiagnostics.publisherSdp.remoteAnswer.simulcastLines || [])],
                  codecs: (mediaDiagnostics.publisherSdp.remoteAnswer.codecs || []).map((entry) => ({ ...entry })),
                }
                : null,
            }
            : null,
        },
        sender: {
          width: senderOutputWidth,
          height: senderOutputHeight,
          measuredFps: Number(currentSenderSample?.fps || senderStats?.fps || 0) || null,
          bitrate: senderActualBitrate,
          bitsPerEncodedFrame: senderBitrateHeadroom.bitsPerEncodedFrame,
          estimatedBitrateFor60AtCurrentBitsPerFrame: senderBitrateHeadroom.estimatedBitrateFor60AtCurrentBitsPerFrame,
          encoderTargetBitrate: Number(
            currentSenderSample?.encoderTargetBitrate
            || currentSenderSample?.targetBitrate
            || senderEncoding?.encoderTargetBitrate
            || senderEncoding?.targetBitrate
            || 0,
          ) || null,
          encoderTargetBitrateSource: Number(
            currentSenderSample?.encoderTargetBitrate
            || currentSenderSample?.targetBitrate
            || senderEncoding?.encoderTargetBitrate
            || senderEncoding?.targetBitrate
            || 0,
          ) > 0 ? "outbound_rtp.targetBitrate" : null,
          availableOutgoingBitrate: Number(currentSenderSample?.availableOutgoingBitrate || senderStats?.candidatePair?.availableOutgoingBitrate || 0) || null,
          qualityLimitationReason: currentSenderSample?.qualityLimitationReason
            || senderStats?.qualityLimitationReason
            || senderEncoding?.qualityLimitationReason
            || null,
          qualityLimitationDurations: currentSenderSample?.qualityLimitationDurations
            ? { ...currentSenderSample.qualityLimitationDurations }
            : (senderEncoding?.qualityLimitationDurations
              ? { ...senderEncoding.qualityLimitationDurations }
              : null),
          packetsLost: Number(currentSenderSample?.packetsLost || senderStats?.packetsLost || senderEncoding?.remotePacketsLostDelta || 0) || 0,
          roundTripTimeMs: Number(currentSenderSample?.roundTripTimeMs || senderStats?.roundTripTimeMs || 0)
            || (Number(senderStats?.candidatePair?.currentRoundTripTimeMs || 0) || null),
          codec: currentSenderSample?.codec || senderStats?.codec || senderEncoding?.codec || null,
          codecPayloadType: Number.isFinite(Number(senderStats?.codecPayloadType ?? senderEncoding?.codecPayloadType))
            ? Number(senderStats?.codecPayloadType ?? senderEncoding?.codecPayloadType)
            : null,
          codecFmtp: String(senderStats?.codecFmtp || senderEncoding?.codecFmtp || "").trim() || null,
          framesEncoded: Number(senderStats?.framesEncoded || senderEncoding?.framesEncoded || 0) || null,
          framesDropped: Number(currentSenderSample?.framesDropped || senderStats?.framesDropped || 0) || 0,
          encoderImplementation: currentSenderSample?.encoderImplementation
            || senderStats?.encoderImplementation
            || senderEncoding?.encoderImplementation
            || null,
          averageEncodeMsPerFrame: Number(currentSenderSample?.averageEncodeMsPerFrame || senderEncoding?.averageEncodeMsPerFrame || 0) || null,
          mediaSource: senderStats?.mediaSource ? { ...senderStats.mediaSource } : null,
          mediaSourceFps: captureMeasuredSourceFps,
          outboundFramesEncodedPerSecond: outboundMeasuredFps,
          outboundFramesSentPerSecond: Number(senderStats?.outboundFramesSentPerSecond || 0) || null,
        },
        receiver: {
          requestedVideoQuality: mediaDiagnostics.requestedRemoteVideoQuality,
          requestedFps: mediaDiagnostics.requestedRemoteVideoFps,
          requestedDimensions: mediaDiagnostics.requestedRemoteVideoDimensions
            ? { ...mediaDiagnostics.requestedRemoteVideoDimensions }
            : null,
          width: Number(receiverStats?.width || 0) || null,
          height: Number(receiverStats?.height || 0) || null,
          receivedResolution: Number(receiverStats?.width || 0) > 0 && Number(receiverStats?.height || 0) > 0
            ? { width: Number(receiverStats.width), height: Number(receiverStats.height) }
            : null,
          decodedFps: Number(receiverStats?.fps || 0) || null,
          renderedFps: Number(mediaDiagnostics.remoteRenderStats?.renderedFps || 0) || null,
          droppedFrames: Number(mediaDiagnostics.remoteRenderStats?.droppedFrames ?? receiverStats?.framesDropped ?? 0) || 0,
          packetsLost: Number(receiverStats?.packetsLost || 0) || 0,
          jitter: Number(receiverStats?.jitterMs || 0) || 0,
          codec: receiverStats?.codec || null,
          framesReceived: Number(receiverStats?.framesReceived || 0) || null,
          framesDecoded: Number(receiverStats?.framesDecoded || 0) || null,
          receiverFramesReceivedPerSecond: Number(receiverStats?.receiverFramesReceivedPerSecond || 0) || null,
          receiverFramesDecodedPerSecond: receiverMeasuredFps,
          decoderImplementation: receiverStats?.decoderImplementation || null,
        },
        privateOneToOne: isPrivateOneToOne,
        privateTransportProfile: isPrivateOneToOne
          ? (mediaDiagnostics.privateTransportProfile || privateOneToOneTransportProfile)
          : null,
        privateQualityController: currentPrivateQualitySnapshot,
        sourceSwitchAttemptCount: Number(mediaDiagnostics.sourceSwitchAttemptCount || 0),
        sourceSwitchLastOutcome: mediaDiagnostics.sourceSwitchLastOutcome || null,
        sourceSwitchInFlight: !!mediaDiagnostics.sourceSwitchInFlight,
        screenShareAudioCapture: typeof getDesktopAudioCaptureDiagnostics === "function"
          ? { ...getDesktopAudioCaptureDiagnostics() }
          : null,
        performance: buildPerformanceSnapshot(),
      };
    },
    getServerStartTrace() {
      return cloneServerStartTrace();
    },
    setPrivateOneToOneTransportProfile(profile = "") {
      if (!performanceDiagnosticsEnabled || !isPrivateOneToOne) {
        return { applied: false, reason: "private_dev_diagnostic_only" };
      }
      if (localShareStartPromise || localShareKey) {
        return { applied: false, reason: "stop_current_share_first", profile: privateOneToOneTransportProfile };
      }
      privateOneToOneTransportProfile = normalizePrivateOneToOneScreenshareProfile(profile);
      mediaDiagnostics.privateTransportProfile = privateOneToOneTransportProfile;
      return { applied: true, profile: privateOneToOneTransportProfile };
    },
    measureTrueCadence,
    measureCaptureOnlyCadence,
    measureNativeBridgeStages,
    measureNativePipelineMatrixSample,
    measureNativeWebrtcContention,
    measureNativeWebrtcAttachmentCadence,
    measureNativeBridgeCaptureOnly,
    runRemoteRenderComparison,
    recordStageActivity,
    recordRemoteRenderMilestone,
    render,
    clearUi,
    detach,
  };
}
