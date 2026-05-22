import { RoomEvent, Track } from "../node_modules/livekit-client/dist/livekit-client.esm.mjs";

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

function nowIso() {
  return new Date().toISOString();
}

function looksLikeUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function safeInvoke(callback, payload = null) {
  try {
    return callback(payload);
  } catch (_) {
    return null;
  }
}

function isLiveVideoTrack(track = null, { allowMuted = true } = {}) {
  const mediaTrack = track?.mediaStreamTrack || track || null;
  if (!mediaTrack) return false;
  if (String(mediaTrack.kind || "").trim().toLowerCase() !== "video") return false;
  if (String(mediaTrack.readyState || "").trim().toLowerCase() === "ended") return false;
  if (!allowMuted && mediaTrack.enabled === false) return false;
  return true;
}

function toTrackSource(publication = null, track = null) {
  const publicationSource = String(publication?.source || "").trim().toLowerCase();
  if (publicationSource) return publicationSource;
  const trackSource = String(track?.source || "").trim().toLowerCase();
  return trackSource || "";
}

function isCameraPublication(publication = null, track = null) {
  const source = toTrackSource(publication, track);
  if (source === Track.Source.ScreenShare || source === "screen_share" || source === "screenshare" || source === "screen-share") return false;
  if (source === Track.Source.Camera || source === "camera") return true;
  return String(track?.kind || publication?.kind || "").trim().toLowerCase() === "video";
}

const CAMERA_QUALITY_PRESET_OPTIONS = ["auto", "720p", "1080p"];

function normalizeCameraQualityPreset(value = "auto") {
  const preset = String(value || "").trim().toLowerCase();
  if (preset === "720p") return "720p";
  if (preset === "1080p") return "1080p";
  return "auto";
}

function buildVideoConstraintsForQualityPreset(value = "auto") {
  const preset = normalizeCameraQualityPreset(value);
  if (preset === "720p") {
    return {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 60 },
    };
  }
  if (preset === "1080p") {
    return {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
    };
  }
  return {
    width: { ideal: 3840, max: 3840 },
    height: { ideal: 2160, max: 2160 },
    frameRate: { ideal: 30, max: 60 },
  };
}

function isDesktopRuntime() {
  try {
    return !!(typeof window !== "undefined" && window?.altaraDesktop?.isDesktopApp === true);
  } catch (_) {
    return false;
  }
}

function describeErrorDetails(error = null) {
  return {
    errorName: String(error?.name || error?.code || "").trim() || null,
    errorMessage: String(error?.message || error || "").trim() || "unknown_error",
  };
}

async function readDesktopPermissionsState() {
  const out = {
    permissionsApiSupported: !!(navigator?.permissions && typeof navigator.permissions.query === "function"),
    cameraPermissionState: null,
    microphonePermissionState: null,
    cameraPermissionError: null,
    microphonePermissionError: null,
  };
  if (!out.permissionsApiSupported) return out;
  try {
    const cameraResult = await navigator.permissions.query({ name: "camera" });
    out.cameraPermissionState = String(cameraResult?.state || "").trim() || null;
  } catch (error) {
    out.cameraPermissionError = String(error?.message || error || "camera_permission_query_failed").trim() || "camera_permission_query_failed";
  }
  try {
    const microphoneResult = await navigator.permissions.query({ name: "microphone" });
    out.microphonePermissionState = String(microphoneResult?.state || "").trim() || null;
  } catch (error) {
    out.microphonePermissionError = String(error?.message || error || "microphone_permission_query_failed").trim() || "microphone_permission_query_failed";
  }
  return out;
}

async function enumerateDesktopVideoInputs() {
  const result = {
    supported: !!(navigator?.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === "function"),
    devices: [],
    deviceIds: [],
    errorMessage: null,
  };
  if (!result.supported) return result;
  try {
    const rawDevices = await navigator.mediaDevices.enumerateDevices();
    const list = Array.isArray(rawDevices) ? rawDevices : [];
    result.devices = list
      .filter((device) => String(device?.kind || "").trim().toLowerCase() === "videoinput")
      .map((device, index) => ({
        deviceId: normalizeId(device?.deviceId || ""),
        groupId: normalizeId(device?.groupId || ""),
        label: String(device?.label || "").trim() || "",
        index,
      }));
    result.deviceIds = dedupeIds(result.devices.map((device) => device?.deviceId || ""));
    return result;
  } catch (error) {
    result.errorMessage = String(error?.message || error || "enumerate_devices_failed").trim() || "enumerate_devices_failed";
    return result;
  }
}

export function createServerVoiceCameraLayer({
  conversationId = "",
  localUserId = "",
  logger = () => {},
  onStateChanged = () => {},
} = {}) {
  const convId = normalizeId(conversationId || "");
  const meId = normalizeId(localUserId || "");

  let room = null;
  let roomBound = false;
  let localCaptureStream = null;
  let localCaptureTrack = null;
  let localCaptureTrackSid = "";
  let localTrackEndedHandler = null;
  let lastRenderSignature = "";
  let qualityPreset = "auto";
  let preferredDeviceId = "";
  const remoteCameraRecordsByKey = new Map();
  let lastToggleBlockedReason = "";
  let focusStateObserver = null;
  let lastFocusedTileId = "";

  function emit(event, details = {}) {
    safeInvoke(logger, {
      event: String(event || "").trim() || "camera.event",
      conversationId: convId || null,
      localUserId: meId || null,
      ...((details && typeof details === "object" && !Array.isArray(details)) ? details : { value: details ?? null }),
    });
  }

  function emitCameraStageRefreshRequested(
    stageRefreshReason = "camera_event",
    {
      participant = null,
      publication = null,
      track = null,
      callerFunction = "unknown",
      triggerReason = "camera_event",
    } = {}
  ) {
    const normalizedReason = String(stageRefreshReason || "").trim() || "camera_event";
    const normalizedTrigger = String(triggerReason || "").trim() || normalizedReason;
    const candidateTrack = track || publication?.track || null;
    const kind = String(publication?.kind || candidateTrack?.kind || "").trim().toLowerCase() || "video";
    if (kind && kind !== "video") return;
    const source = toTrackSource(publication, candidateTrack);
    if (
      source === Track.Source.ScreenShare
      || source === "screen_share"
      || source === "screenshare"
      || source === "screen-share"
    ) {
      return;
    }
    emit("camera.stage_refresh_requested", {
      triggerReason: normalizedTrigger,
      callerFunction: String(callerFunction || "").trim() || "unknown",
      stageRefreshReason: normalizedReason,
      participantId: resolveParticipantUserId(participant) || meId || null,
      participantIdentity: normalizeId(participant?.identity || "") || null,
      participantSid: normalizeId(participant?.sid || "") || null,
      trackId: normalizeId(candidateTrack?.id || "") || null,
      trackSid: normalizeId(publication?.trackSid || candidateTrack?.sid || "") || null,
      source: source || "camera",
      kind: kind || "video",
    });
  }

  function logCameraDebug(tag = "", payload = null) {
    const label = String(tag || "").trim();
    if (!label) return;
    try {
      console.debug(label, payload && typeof payload === "object" ? payload : { value: payload ?? null });
    } catch (_) {}
  }

  function resolveParticipantUserId(participant = null) {
    const identity = normalizeId(participant?.identity || "");
    if (looksLikeUuid(identity)) return identity;
    const metadataRaw = String(participant?.metadata || "").trim();
    if (metadataRaw) {
      try {
        const parsed = JSON.parse(metadataRaw);
        const metadataUserId = normalizeId(
          parsed?.userId
          || parsed?.user_id
          || parsed?.id
          || ""
        );
        if (looksLikeUuid(metadataUserId)) return metadataUserId;
      } catch (_) {}
    }
    return identity;
  }

  function toRenderableVideoTrack(track = null) {
    const direct = track?.mediaStreamTrack || track || null;
    if (isLiveVideoTrack(direct, { allowMuted: true })) return direct;
    if (!track || typeof track.attach !== "function") return null;
    let attached = null;
    try {
      attached = track.attach();
      const extracted = attached?.srcObject?.getVideoTracks?.()?.find((candidate) => (
        isLiveVideoTrack(candidate, { allowMuted: true })
      )) || null;
      return extracted || null;
    } catch (_) {
      return null;
    } finally {
      if (attached) {
        try { track.detach?.(attached); } catch (_) {}
        try { attached.remove?.(); } catch (_) {}
      }
    }
  }

  function resolveRemoteCameraRecordKey(participant = null, publication = null, track = null) {
    const uid = resolveParticipantUserId(participant);
    if (!uid || uid === meId) return "";
    const mediaTrack = toRenderableVideoTrack(track || publication?.track || null);
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    const trackId = normalizeId(mediaTrack?.id || track?.id || "");
    const identity = normalizeId(trackSid || trackId || publication?.name || "");
    if (!identity) return "";
    return `remote_camera:${uid}:${identity}`;
  }

  function listRemoteCameraRecords() {
    return Array.from(remoteCameraRecordsByKey.values())
      .filter((record) => !!record && !!normalizeId(record.userId || ""))
      .sort((left, right) => {
        const leftTs = Date.parse(left?.updatedAt || "") || 0;
        const rightTs = Date.parse(right?.updatedAt || "") || 0;
        return rightTs - leftTs;
      });
  }

  function getLocalCameraPublication() {
    if (!room?.localParticipant) return null;
    const publications = Array.from(room.localParticipant.videoTrackPublications?.values?.() || []);
    const cameraPublications = publications.filter((publication) => (
      isCameraPublication(publication, publication?.track || null)
    ));
    if (!cameraPublications.length) return null;
    return cameraPublications.find((publication) => (
      isLiveVideoTrack(publication?.track || null, { allowMuted: true })
    )) || cameraPublications[0] || null;
  }

  function hasPublishedLocalTrack() {
    const publication = getLocalCameraPublication();
    const publicationTrack = publication?.track || null;
    const publicationTrackSid = normalizeId(publication?.trackSid || "");
    const trackedLocal = localCaptureTrack || null;
    if (isLiveVideoTrack(trackedLocal, { allowMuted: true })) {
      if (!publication) return false;
      const expectedTrackSid = normalizeId(localCaptureTrackSid || "");
      if (expectedTrackSid && publicationTrackSid && expectedTrackSid === publicationTrackSid) return true;
      if (publicationTrack && publicationTrack === trackedLocal) return true;
    }
    if (!publication) return false;
    if (publication?.isMuted === true) return false;
    return !!isLiveVideoTrack(publicationTrack, { allowMuted: true });
  }

  function isLocalCameraActive() {
    return hasPublishedLocalTrack();
  }

  function getActiveCaptureDeviceId() {
    const localDeviceId = normalizeId(localCaptureTrack?.getSettings?.()?.deviceId || "");
    if (localDeviceId) return localDeviceId;
    return normalizeId(getLocalCameraPublication()?.track?.getSettings?.()?.deviceId || "");
  }

  function buildState() {
    const cameraStates = listRemoteCameraRecords().map((record) => ({
      key: normalizeId(record.key || ""),
      userId: normalizeId(record.userId || ""),
      participantIdentity: normalizeId(record.participantIdentity || record.userId || ""),
      participantSid: normalizeId(record.participantSid || "") || null,
      displayName: String(record.displayName || "").trim() || "",
      trackId: normalizeId(record.trackId || "") || null,
      trackSid: normalizeId(record.trackSid || "") || null,
      source: normalizeId(record.source || "") || null,
      kind: String(record.kind || "").trim().toLowerCase() || "video",
      hasPublication: !!record.publication,
      hasTrack: !!isLiveVideoTrack(record.track, { allowMuted: true }),
      isSubscribed: !!record.isSubscribed,
      muted: !!record.muted,
      receivedAt: record.receivedAt || null,
      updatedAt: record.updatedAt || null,
    }));
    const remoteParticipantIds = dedupeIds(cameraStates.map((entry) => entry?.userId || ""));
    const participants = remoteParticipantIds
      .map((userId) => {
        const byUser = cameraStates.filter((entry) => normalizeId(entry?.userId || "") === userId);
        const preferred = byUser.find((entry) => !!entry?.hasTrack)
          || byUser.find((entry) => !!entry?.hasPublication)
          || byUser[0]
          || null;
        if (!preferred) return null;
        return {
          userId,
          participantIdentity: preferred.participantIdentity || userId,
          participantSid: preferred.participantSid || null,
          displayName: preferred.displayName || "",
          trackId: preferred.trackId || null,
          trackSid: preferred.trackSid || null,
          source: preferred.source || "camera",
          kind: preferred.kind || "video",
          hasPublication: !!preferred.hasPublication,
          hasTrack: !!preferred.hasTrack,
          isSubscribed: !!preferred.isSubscribed,
          muted: !!preferred.muted,
          receivedAt: preferred.receivedAt || null,
          updatedAt: preferred.updatedAt || null,
        };
      })
      .filter(Boolean);
    return {
      conversationId: convId || "",
      localUserId: meId || "",
      localCameraActive: !!isLocalCameraActive(),
      localTrackId: normalizeId((localCaptureTrack?.id || getLocalCameraPublication()?.track?.id || "")) || null,
      localTrackSid: normalizeId(localCaptureTrackSid || getLocalCameraPublication()?.trackSid || "") || null,
      qualityPreset: normalizeCameraQualityPreset(qualityPreset || "auto"),
      preferredDeviceId: normalizeId(preferredDeviceId || "") || null,
      activeDeviceId: getActiveCaptureDeviceId() || null,
      lastToggleBlockedReason: lastToggleBlockedReason || null,
      remoteParticipantIds,
      cameraStates,
      participants,
      updatedAt: nowIso(),
    };
  }

  function emitStateChanged(triggerReason = "state_changed", callerFunction = "unknown") {
    ensureCameraDebugSnapshotHook();
    ensureFocusStateObserver();
    const state = buildState();
    safeInvoke(onStateChanged, state);
    const signature = [
      state.localCameraActive ? "1" : "0",
      String(state.localTrackId || ""),
      String(state.localTrackSid || ""),
      state.remoteParticipantIds.join(","),
      state.participants.map((participant) => `${participant.userId}:${participant.trackId || ""}:${participant.trackSid || ""}`).join(","),
    ].join("|");
    if (signature !== lastRenderSignature) {
      lastRenderSignature = signature;
      state.participants.forEach((participant) => {
        logCameraDebug("[ALTARA_CAMERA_RENDER]", {
          participantKey: normalizeId(participant?.userId || "") || null,
          hasCamera: !!participant?.hasTrack,
          trackExists: !!participant?.trackId,
          publicationKey: normalizeId(participant?.trackSid || participant?.trackId || "") || null,
          reason: participant?.hasTrack
            ? "camera_track_available"
            : (participant?.hasPublication ? "camera_publication_without_track" : "camera_unavailable"),
        });
      });
      emit("camera.render_updated", {
        triggerReason: String(triggerReason || "").trim() || "state_changed",
        callerFunction: String(callerFunction || "").trim() || "unknown",
        localCameraActive: !!state.localCameraActive,
        localTrackId: state.localTrackId || null,
        localTrackSid: state.localTrackSid || null,
        qualityPreset: state.qualityPreset || "auto",
        preferredDeviceId: state.preferredDeviceId || null,
        activeDeviceId: state.activeDeviceId || null,
        remoteParticipantIds: state.remoteParticipantIds || [],
        remoteParticipantCount: state.remoteParticipantIds?.length || 0,
      });
      if (isDesktopRuntime()) {
        emit("camera.desktop_render_updated", {
          triggerReason: String(triggerReason || "").trim() || "state_changed",
          callerFunction: String(callerFunction || "").trim() || "unknown",
          pickerOpen: false,
          localCameraActive: !!state.localCameraActive,
          localTrackId: state.localTrackId || null,
          localTrackSid: state.localTrackSid || null,
          qualityPreset: state.qualityPreset || "auto",
          preferredDeviceId: state.preferredDeviceId || null,
          activeDeviceId: state.activeDeviceId || null,
          remoteParticipantIds: state.remoteParticipantIds || [],
          remoteParticipantCount: state.remoteParticipantIds?.length || 0,
        });
      }
    }
    return state;
  }

  function collectParticipantTileRenderSnapshot() {
    if (typeof document === "undefined") return [];
    const tiles = Array.from(
      document.querySelectorAll(".stageGridTile[data-call-grid-entry='1'], .participantTile[data-call-grid-entry='1']")
    );
    return tiles.map((tile) => {
      const participantKey = normalizeId(tile.getAttribute("data-call-user-id") || "");
      const tileId = String(tile.getAttribute("data-call-tile-id") || "").trim();
      const tileModelKey = String(tile.getAttribute("data-call-tile-model-key") || "").trim() || null;
      const tileType = String(tile.getAttribute("data-call-tile-type") || "").trim().toLowerCase() || "primary";
      const mediaType = String(tile.getAttribute("data-call-media-type") || "").trim().toLowerCase();
      const cameraPublicationKey = normalizeId(tile.getAttribute("data-call-camera-publication-key") || "") || null;
      const cameraTrackSid = normalizeId(tile.getAttribute("data-call-camera-track-sid") || "") || null;
      const cameraResolverReason = String(tile.getAttribute("data-call-camera-resolver-reason") || "").trim() || null;
      const cameraIsLocal = tile.getAttribute("data-call-camera-is-local") === "1";
      const videoEl = tile.querySelector(".stageGridVideo, .participantVideo");
      const attachedTrack = videoEl?.srcObject?.getVideoTracks?.()?.[0] || null;
      const hasCamera = mediaType !== "share" && tile.classList.contains("has-video");
      const source = tileType === "screenshare"
        ? "screen_share"
        : (hasCamera ? "camera" : "avatar");
      return {
        participantKey: participantKey || null,
        participantIdentity: participantKey || null,
        tileId: tileId || null,
        tileKey: tileModelKey || tileId || null,
        tileModelKey,
        tileType: tileType || null,
        mediaType: mediaType || null,
        gridHasCamera: !!hasCamera,
        hasCamera: !!hasCamera,
        source,
        videoElementExists: !!videoEl,
        videoElementAttached: !!attachedTrack,
        trackId: normalizeId(attachedTrack?.id || "") || null,
        cameraPublicationKey,
        cameraTrackSid,
        cameraResolverReason,
        cameraIsLocal,
        isLocal: cameraIsLocal,
        trackSid: cameraTrackSid || normalizeId(attachedTrack?.id || "") || null,
      };
    });
  }

  function buildLiveKitParticipantCameraSnapshot(participant = null, { local = false } = {}) {
    const publications = Array.from(participant?.videoTrackPublications?.values?.() || []);
    const cameraPublications = publications
      .filter((publication) => isCameraPublication(publication, publication?.track || null))
      .map((publication) => {
        const mediaTrack = toRenderableVideoTrack(publication?.track || null);
        return {
          trackSid: normalizeId(publication?.trackSid || "") || null,
          source: String(publication?.source || "").trim() || null,
          kind: String(publication?.kind || "").trim() || null,
          muted: !!publication?.isMuted,
          isSubscribed: typeof publication?.isSubscribed === "boolean" ? !!publication.isSubscribed : null,
          trackExists: !!isLiveVideoTrack(mediaTrack, { allowMuted: true }),
          trackId: normalizeId(mediaTrack?.id || "") || null,
        };
      });
    const screenSharePublications = publications
      .filter((publication) => !isCameraPublication(publication, publication?.track || null))
      .map((publication) => ({
        trackSid: normalizeId(publication?.trackSid || "") || null,
        source: String(publication?.source || "").trim() || null,
        kind: String(publication?.kind || "").trim() || null,
        muted: !!publication?.isMuted,
        isSubscribed: typeof publication?.isSubscribed === "boolean" ? !!publication.isSubscribed : null,
      }));
    return {
      userId: resolveParticipantUserId(participant) || null,
      identity: normalizeId(participant?.identity || "") || null,
      sid: normalizeId(participant?.sid || "") || null,
      isLocal: !!local,
      cameraPublications,
      screenSharePublications,
    };
  }

  function ensureCameraDebugSnapshotHook() {
    if (typeof window === "undefined") return;
    window.__ALTARA_CAMERA_SNAPSHOT__ = () => {
      const state = buildState();
      const stage = typeof document !== "undefined" ? document.getElementById("callStage") : null;
      const localParticipant = room?.localParticipant || null;
      const remoteParticipants = Array.from(room?.remoteParticipants?.values?.() || []);
      const remoteParticipantSnapshots = remoteParticipants.map((participant) => buildLiveKitParticipantCameraSnapshot(participant, { local: false }));
      const localParticipantSnapshot = buildLiveKitParticipantCameraSnapshot(localParticipant, { local: true });
      const localCameraPublication = Array.isArray(localParticipantSnapshot?.cameraPublications)
        ? (localParticipantSnapshot.cameraPublications.find((publication) => (
          String(publication?.source || "").trim().toLowerCase() === "camera"
        )) || localParticipantSnapshot.cameraPublications[0] || null)
        : null;
      const participantTiles = collectParticipantTileRenderSnapshot();
      const localParticipantKey = normalizeId(
        localParticipantSnapshot?.userId
        || localParticipantSnapshot?.identity
        || meId
        || ""
      );
      const localParticipantTiles = participantTiles.filter((tile) => (
        normalizeId(tile?.participantKey || "") === localParticipantKey
      ));
      const renderedParticipantKeys = new Set(
        participantTiles
          .filter((tile) => !!tile?.participantKey && !!tile?.gridHasCamera)
          .map((tile) => normalizeId(tile?.participantKey || ""))
          .filter(Boolean)
      );
      const cameraButtonCandidates = [
        typeof document !== "undefined" ? document.getElementById("btnCameraStage") : null,
        typeof document !== "undefined" ? document.getElementById("btnCameraSmall") : null,
        typeof document !== "undefined" ? document.getElementById("btnCamera") : null,
      ].filter(Boolean);
      const buttonTooltip = cameraButtonCandidates
        .map((button) => String(button?.getAttribute?.("aria-label") || button?.title || "").trim())
        .find((value) => !!value) || null;
      const lastRemoteCameraEventRaw = window.__ALTARA_REMOTE_CAMERA_LAST_EVENT__
        && typeof window.__ALTARA_REMOTE_CAMERA_LAST_EVENT__ === "object"
        ? window.__ALTARA_REMOTE_CAMERA_LAST_EVENT__
        : null;
      const lastRemoteCameraRefreshRaw = window.__ALTARA_REMOTE_CAMERA_LAST_REFRESH__
        && typeof window.__ALTARA_REMOTE_CAMERA_LAST_REFRESH__ === "object"
        ? window.__ALTARA_REMOTE_CAMERA_LAST_REFRESH__
        : null;
      const lastRemoteCameraAttachRaw = window.__ALTARA_REMOTE_CAMERA_LAST_ATTACH_RESULT__
        && typeof window.__ALTARA_REMOTE_CAMERA_LAST_ATTACH_RESULT__ === "object"
        ? window.__ALTARA_REMOTE_CAMERA_LAST_ATTACH_RESULT__
        : null;
      const appBuildMarker = String(window.__ALTARA_APP_BUILD_MARKER__ || "").trim() || null;
      const focusedTileId = String(stage?.getAttribute?.("data-focused-tile-id") || "").trim() || null;
      const focusedTileType = String(stage?.getAttribute?.("data-focused-tile-type") || "").trim() || null;
      const focusedTileModelKey = String(stage?.getAttribute?.("data-focused-tile-model-key") || "").trim() || null;
      const focusedTypeAttr = String(stage?.getAttribute?.("data-focused-type") || "").trim() || null;
      const focusedSourceAttr = String(stage?.getAttribute?.("data-focused-source") || "").trim() || null;
      const focusedMediaTypeAttr = String(stage?.getAttribute?.("data-focused-media-type") || "").trim() || null;
      const focusedTrackSidAttr = normalizeId(stage?.getAttribute?.("data-focused-track-id") || "") || null;
      const localResolverReason = localParticipantTiles
        .map((tile) => String(tile?.cameraResolverReason || "").trim())
        .find((value) => !!value) || null;
      const focusRenderSnapshotRaw = window.__ALTARA_FOCUS_RENDER_LAST__
        && typeof window.__ALTARA_FOCUS_RENDER_LAST__ === "object"
        ? window.__ALTARA_FOCUS_RENDER_LAST__
        : null;
      const matchesRemoteDiagnosticParticipant = (participantSnapshot, candidateIdentity = "") => {
        const candidate = normalizeId(candidateIdentity || "");
        if (!candidate) return false;
        const identity = normalizeId(participantSnapshot?.identity || "");
        const userId = normalizeId(participantSnapshot?.userId || "");
        return candidate === identity || candidate === userId;
      };
      const remotes = remoteParticipantSnapshots.map((participantSnapshot) => {
        const cameraPublication = Array.isArray(participantSnapshot?.cameraPublications)
          ? (participantSnapshot.cameraPublications.find((publication) => (
            String(publication?.source || "").trim().toLowerCase() === "camera"
          )) || participantSnapshot.cameraPublications[0] || null)
          : null;
        const participantKey = normalizeId(participantSnapshot?.userId || participantSnapshot?.identity || "");
        const remoteTiles = participantTiles.filter((tile) => normalizeId(tile?.participantKey || "") === participantKey);
        const remoteResolverReason = remoteTiles
          .map((tile) => String(tile?.cameraResolverReason || "").trim())
          .find((value) => !!value) || null;
        const lastRemoteCameraEvent = matchesRemoteDiagnosticParticipant(
          participantSnapshot,
          lastRemoteCameraEventRaw?.participantIdentity || ""
        )
          ? {
            event: String(lastRemoteCameraEventRaw?.event || "").trim() || null,
            source: String(lastRemoteCameraEventRaw?.source || "").trim() || null,
            kind: String(lastRemoteCameraEventRaw?.kind || "").trim() || null,
            trackSid: normalizeId(lastRemoteCameraEventRaw?.trackSid || "") || null,
            at: Number(lastRemoteCameraEventRaw?.at || 0) || null,
          }
          : null;
        const lastRemoteCameraRefresh = matchesRemoteDiagnosticParticipant(
          participantSnapshot,
          lastRemoteCameraRefreshRaw?.participantIdentity || ""
        )
          ? {
            reason: String(lastRemoteCameraRefreshRaw?.reason || "").trim() || null,
            trackSid: normalizeId(lastRemoteCameraRefreshRaw?.trackSid || "") || null,
            at: Number(lastRemoteCameraRefreshRaw?.at || 0) || null,
          }
          : null;
        const lastRemoteCameraAttachResult = matchesRemoteDiagnosticParticipant(
          participantSnapshot,
          lastRemoteCameraAttachRaw?.participantIdentity || ""
        )
          ? {
            trackSid: normalizeId(lastRemoteCameraAttachRaw?.trackSid || "") || null,
            tileExists: typeof lastRemoteCameraAttachRaw?.tileExists === "boolean"
              ? !!lastRemoteCameraAttachRaw.tileExists
              : null,
            videoElementExists: typeof lastRemoteCameraAttachRaw?.videoElementExists === "boolean"
              ? !!lastRemoteCameraAttachRaw.videoElementExists
              : null,
            attached: typeof lastRemoteCameraAttachRaw?.attached === "boolean"
              ? !!lastRemoteCameraAttachRaw.attached
              : null,
            reason: String(lastRemoteCameraAttachRaw?.reason || "").trim() || null,
            at: Number(lastRemoteCameraAttachRaw?.at || 0) || null,
          }
          : null;
        return {
          identity: participantSnapshot?.identity || null,
          cameraPublicationExists: !!cameraPublication,
          trackSid: cameraPublication?.trackSid || null,
          source: cameraPublication?.source || null,
          kind: cameraPublication?.kind || null,
          isSubscribed: cameraPublication?.isSubscribed ?? null,
          muted: cameraPublication?.muted ?? null,
          trackExists: !!cameraPublication?.trackExists,
          rendered: !!(participantKey && renderedParticipantKeys.has(participantKey)),
          remoteTileExists: remoteTiles.length > 0,
          remoteVideoElementExists: remoteTiles.some((tile) => !!tile?.videoElementExists),
          remoteVideoAttached: remoteTiles.some((tile) => !!tile?.videoElementAttached),
          resolverReason: remoteResolverReason,
          remoteResolverReason,
          lastRemoteCameraEvent,
          lastRefreshReason: lastRemoteCameraRefresh?.reason || null,
          lastAttachResult: lastRemoteCameraAttachResult,
          focusHasCamera: !!(
            normalizeId(focusRenderSnapshotRaw?.participantIdentity || "") === participantKey
            && focusRenderSnapshotRaw?.hasCamera === true
          ),
        };
      });
      const focusedTileSnapshot = focusedTileId
        ? (participantTiles.find((tile) => String(tile?.tileId || "").trim() === focusedTileId) || null)
        : null;
      const focusedParticipantFromSnapshot = normalizeId(focusRenderSnapshotRaw?.participantIdentity || "") || null;
      const focusedParticipantFromTile = normalizeId(focusedTileSnapshot?.participantKey || "") || null;
      const focusedParticipantIdentity = focusedParticipantFromSnapshot || focusedParticipantFromTile || null;
      const focusedTrackSid = normalizeId(
        focusRenderSnapshotRaw?.trackSid
        || focusedTrackSidAttr
        || focusedTileSnapshot?.cameraTrackSid
        || ""
      ) || null;
      const focusedType = String(
        focusRenderSnapshotRaw?.type
        || focusedTypeAttr
        || (
          focusedTileType === "screenshare"
            ? "screenshare"
            : (focusedTileSnapshot?.gridHasCamera ? "participant_camera" : "participant_avatar")
        )
      ).trim() || null;
      const focusedSource = String(
        focusRenderSnapshotRaw?.source
        || focusedSourceAttr
        || (
          focusedType === "screenshare"
            ? "screen_share"
            : (focusedTileSnapshot?.gridHasCamera ? "camera" : "avatar")
        )
      ).trim() || null;
      const focusedHasCamera = typeof focusRenderSnapshotRaw?.hasCamera === "boolean"
        ? !!focusRenderSnapshotRaw.hasCamera
        : !!focusedTileSnapshot?.gridHasCamera;
      const focusedIsLocal = typeof focusRenderSnapshotRaw?.isLocal === "boolean"
        ? !!focusRenderSnapshotRaw.isLocal
        : (
          focusedTileSnapshot
            ? !!(
              normalizeId(focusedTileSnapshot?.participantKey || "") === localParticipantKey
              || focusedTileSnapshot?.cameraIsLocal
            )
            : null
        );
      const focusedVideoElementExists = typeof focusRenderSnapshotRaw?.videoElementExists === "boolean"
        ? !!focusRenderSnapshotRaw.videoElementExists
        : !!focusedTileSnapshot?.videoElementExists;
      const focusedVideoAttached = typeof focusRenderSnapshotRaw?.videoAttached === "boolean"
        ? !!focusRenderSnapshotRaw.videoAttached
        : !!focusedTileSnapshot?.videoElementAttached;
      const focusedFallbackReason = String(
        focusRenderSnapshotRaw?.fallbackReason
        || focusedTileSnapshot?.cameraResolverReason
        || ""
      ).trim() || null;
      const focusedActiveCameraCheckRaw = focusRenderSnapshotRaw?.activeCameraCheck
        && typeof focusRenderSnapshotRaw.activeCameraCheck === "object"
        ? focusRenderSnapshotRaw.activeCameraCheck
        : null;
      const focusedRendered = String(
        focusRenderSnapshotRaw?.rendered
        || (focusedType === "screenshare" ? "screen_share" : (focusedHasCamera ? "camera" : "avatar"))
      ).trim().toLowerCase() || (focusedType === "screenshare" ? "screen_share" : (focusedHasCamera ? "camera" : "avatar"));
      const focused = {
        type: focusedType,
        currentFocusedTileType: focusedTileType,
        currentFocusedTileId: focusedTileId,
        tileType: focusedTileType || null,
        focusedParticipantIdentity: focusedParticipantIdentity,
        participantIdentity: focusedParticipantIdentity,
        tileKey: focusedTileModelKey || focusedTileSnapshot?.tileKey || focusedTileSnapshot?.tileId || null,
        mediaType: focusedMediaTypeAttr
          || (focusedType === "screenshare" ? "share" : (focusedHasCamera ? "camera" : "base"))
          || null,
        source: focusedSource,
        trackSid: focusedTrackSid,
        hasCamera: focusedHasCamera,
        isLocal: focusedIsLocal,
        activeCameraCheck: {
          hasCamera: typeof focusedActiveCameraCheckRaw?.hasCamera === "boolean"
            ? !!focusedActiveCameraCheckRaw.hasCamera
            : !!focusedHasCamera,
          isLocal: typeof focusedActiveCameraCheckRaw?.isLocal === "boolean"
            ? !!focusedActiveCameraCheckRaw.isLocal
            : !!focusedIsLocal,
          trackSid: normalizeId(
            focusedActiveCameraCheckRaw?.trackSid
            || focusedTrackSid
            || ""
          ) || null,
          reason: String(
            focusedActiveCameraCheckRaw?.reason
            || focusedFallbackReason
            || (focusedHasCamera ? "camera_track_available" : "camera_unavailable")
          ).trim() || null,
        },
        rendered: focusedRendered,
        videoElementExists: focusedVideoElementExists,
        videoAttached: focusedVideoAttached,
        fallbackReason: focusedFallbackReason,
        reason: focusedFallbackReason,
      };
      const focusedTile = {
        tileKey: focused.tileKey,
        mediaType: focused.mediaType,
        participantIdentity: focused.participantIdentity,
        source: focused.source,
        trackSid: focused.trackSid,
        hasCamera: focused.hasCamera,
        isLocal: focused.isLocal,
        rendered: focused.rendered,
        renderPath: focused.rendered === "camera"
          ? "focused_camera_video"
          : (focused.rendered === "screen_share" ? "focused_screenshare_video" : "focused_avatar_fallback"),
        videoElementExists: focused.videoElementExists,
        videoAttached: focused.videoAttached,
        fallbackReason: focused.fallbackReason,
      };
      const lastToggleError = window.__ALTARA_CAMERA_LAST_TOGGLE_ERROR__
        && typeof window.__ALTARA_CAMERA_LAST_TOGGLE_ERROR__ === "object"
        ? {
          name: String(window.__ALTARA_CAMERA_LAST_TOGGLE_ERROR__?.name || "").trim() || null,
          message: String(window.__ALTARA_CAMERA_LAST_TOGGLE_ERROR__?.message || "").trim() || null,
        }
        : null;
      const lastToggleEarlyReturnReason = String(window.__ALTARA_CAMERA_LAST_TOGGLE_EARLY_RETURN_REASON__ || "").trim() || null;
      const pendingCameraRefresh = !!window.__ALTARA_CAMERA_STAGE_REFRESH_PENDING__;
      const lastCameraRefreshReason = String(window.__ALTARA_CAMERA_LAST_REFRESH_REASON__ || "").trim() || null;
      const lastCameraAttachResult = window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__
        && typeof window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__ === "object"
        ? {
          participantKey: normalizeId(window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.participantKey || "") || null,
          isLocal: typeof window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.isLocal === "boolean"
            ? !!window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__.isLocal
            : null,
          trackSid: normalizeId(window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.trackSid || "") || null,
          videoElementFound: typeof window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.videoElementFound === "boolean"
            ? !!window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__.videoElementFound
            : null,
          attached: typeof window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.attached === "boolean"
            ? !!window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__.attached
            : null,
          reason: String(window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.reason || "").trim() || null,
          at: Number(window.__ALTARA_CAMERA_LAST_ATTACH_RESULT__?.at || 0) || null,
        }
        : null;
      const participantTilesWithFocus = participantTiles.map((tile) => ({
        ...tile,
        focusHasCamera: !!(
          focusedParticipantIdentity
          && normalizeId(tile?.participantKey || "") === focusedParticipantIdentity
          && focusedHasCamera
        ),
      }));
      const payload = {
        conversationId: convId || null,
        localIdentity: normalizeId(localParticipant?.identity || meId || "") || null,
        roomConnected: !!room && room.state === "connected",
        room: {
          connected: !!room && room.state === "connected",
          state: String(room?.state || "").trim() || null,
          name: String(room?.name || "").trim() || null,
        },
        local: {
          identity: normalizeId(localParticipant?.identity || meId || "") || null,
          isCameraEnabled: !!isLocalCameraActive(),
          cameraPublicationExists: !!localCameraPublication,
          trackSid: localCameraPublication?.trackSid || null,
          source: localCameraPublication?.source || null,
          kind: localCameraPublication?.kind || null,
          muted: localCameraPublication?.muted ?? null,
          trackExists: !!localCameraPublication?.trackExists,
          buttonTooltip,
          localTileExists: localParticipantTiles.length > 0,
          localVideoElementExists: localParticipantTiles.some((tile) => !!tile?.videoElementExists),
          localVideoAttached: localParticipantTiles.some((tile) => !!tile?.videoElementAttached),
          localRendered: localParticipantTiles.some((tile) => !!tile?.gridHasCamera),
          resolverReason: localResolverReason,
          localResolverReason,
          cameraPublications: localParticipantSnapshot?.cameraPublications || [],
        },
        remotes,
        focused,
        focusedTile,
        gridTiles: participantTilesWithFocus.map((tile) => ({
          tileKey: tile?.tileKey || tile?.tileModelKey || tile?.tileId || null,
          mediaType: tile?.mediaType || null,
          participantIdentity: tile?.participantIdentity || tile?.participantKey || null,
          hasCamera: !!tile?.gridHasCamera,
          source: tile?.source || null,
          trackSid: tile?.trackSid || tile?.cameraTrackSid || null,
          isLocal: !!tile?.isLocal,
        })),
        remoteParticipants: remoteParticipantSnapshots,
        screenSharePublications: remoteParticipantSnapshots
          .flatMap((entry) => (Array.isArray(entry?.screenSharePublications) ? entry.screenSharePublications.map((pub) => ({
            participantIdentity: entry.identity || null,
            participantSid: entry.sid || null,
            ...pub,
          })) : [])),
        cameraLayerState: state,
        renderTiles: participantTilesWithFocus,
        renderState: {
          focusedTileId,
          focusedTileType,
          participantTiles: participantTilesWithFocus,
        },
        appBuildMarker,
        pendingCameraRefresh,
        lastCameraRefreshReason,
        lastCameraAttachResult,
        lastToggleError,
        lastToggleEarlyReturnReason,
        lastToggleBlockedReason: lastToggleBlockedReason || null,
      };
      logCameraDebug("[ALTARA_CAMERA_SNAPSHOT]", payload);
      return payload;
    };
  }

  function ensureFocusStateObserver() {
    if (focusStateObserver || typeof window === "undefined" || typeof document === "undefined") return;
    const stage = document.getElementById("callStage");
    if (!stage || typeof MutationObserver !== "function") return;
    lastFocusedTileId = String(stage.getAttribute("data-focused-tile-id") || "").trim();
    focusStateObserver = new MutationObserver(() => {
      const nextFocusedTileId = String(stage.getAttribute("data-focused-tile-id") || "").trim();
      if (nextFocusedTileId === lastFocusedTileId) return;
      logCameraDebug("[ALTARA_CAMERA_FOCUS_STATE]", {
        oldFocusedKey: lastFocusedTileId || null,
        newFocusedKey: nextFocusedTileId || null,
      });
      lastFocusedTileId = nextFocusedTileId;
    });
    try {
      focusStateObserver.observe(stage, {
        attributes: true,
        attributeFilter: ["data-focused-tile-id", "data-focused-tile-type"],
      });
    } catch (_) {
      focusStateObserver = null;
    }
  }

  function disconnectFocusStateObserver() {
    if (!focusStateObserver) return;
    try { focusStateObserver.disconnect(); } catch (_) {}
    focusStateObserver = null;
    lastFocusedTileId = "";
  }

  function clearLocalCaptureResources() {
    if (localCaptureTrack && localTrackEndedHandler) {
      try {
        localCaptureTrack.removeEventListener?.("ended", localTrackEndedHandler);
      } catch (_) {}
      try {
        if (localCaptureTrack.onended === localTrackEndedHandler) {
          localCaptureTrack.onended = null;
        }
      } catch (_) {}
    }
    localTrackEndedHandler = null;
    if (localCaptureStream) {
      try {
        localCaptureStream.getTracks().forEach((track) => {
          try { track.onended = null; } catch (_) {}
          try { track.stop(); } catch (_) {}
        });
      } catch (_) {}
    } else if (localCaptureTrack) {
      try { localCaptureTrack.onended = null; } catch (_) {}
      try { localCaptureTrack.stop(); } catch (_) {}
    }
    localCaptureStream = null;
    localCaptureTrack = null;
    localCaptureTrackSid = "";
  }

  function setRemoteCameraRecord(participant, publication, track, {
    triggerReason = "remote_track_received",
    callerFunction = "setRemoteCameraRecord",
    trackSubscribed = null,
    keepTrack = true,
  } = {}) {
    const uid = resolveParticipantUserId(participant);
    if (!uid || uid === meId) return null;
    const recordKey = resolveRemoteCameraRecordKey(participant, publication, track);
    if (!recordKey) return null;
    const existing = remoteCameraRecordsByKey.get(recordKey) || null;
    const mediaTrack = toRenderableVideoTrack(track || publication?.track || null);
    const nextTrack = isLiveVideoTrack(mediaTrack, { allowMuted: true })
      ? mediaTrack
      : (keepTrack ? (existing?.track || null) : null);
    const nextTrackId = normalizeId(
      (isLiveVideoTrack(mediaTrack, { allowMuted: true }) ? mediaTrack?.id : "")
      || existing?.trackId
      || track?.sid
      || ""
    );
    const nextTrackSid = normalizeId(publication?.trackSid || track?.sid || existing?.trackSid || "");
    const nextSubscribed = typeof trackSubscribed === "boolean"
      ? !!trackSubscribed
      : !!(publication?.isSubscribed ?? existing?.isSubscribed);
    const nextRecord = {
      ...(existing || {}),
      key: recordKey,
      userId: uid,
      participantIdentity: uid,
      participantSid: normalizeId(participant?.sid || ""),
      displayName: String(participant?.name || "").trim() || "",
      trackId: nextTrackId,
      trackSid: nextTrackSid,
      track: nextTrack,
      publication: publication || existing?.publication || null,
      kind: String(track?.kind || publication?.kind || existing?.kind || "video").trim().toLowerCase() || "video",
      muted: !!(publication?.isMuted ?? existing?.muted),
      isSubscribed: nextSubscribed,
      receivedAt: existing?.receivedAt || nowIso(),
      updatedAt: nowIso(),
      triggerReason: String(triggerReason || "").trim() || "remote_track_received",
      source: toTrackSource(publication, track) || existing?.source || "camera",
    };
    remoteCameraRecordsByKey.set(recordKey, nextRecord);
    const hasLiveTrack = !!isLiveVideoTrack(nextRecord.track, { allowMuted: true });
    emit(hasLiveTrack ? "camera.remote_track_received" : "camera.remote_track_available", {
      triggerReason: nextRecord.triggerReason,
      callerFunction: String(callerFunction || "").trim() || "setRemoteCameraRecord",
      participantId: uid || null,
      participantSid: nextRecord.participantSid || null,
      trackId: nextRecord.trackId || null,
      trackSid: nextRecord.trackSid || null,
      subscribed: !!nextRecord.isSubscribed,
      trackExists: hasLiveTrack,
      source: nextRecord.source || null,
    });
    emitStateChanged(nextRecord.triggerReason, callerFunction);
    return nextRecord;
  }

  function removeRemoteCameraRecordByKey(key, {
    triggerReason = "remote_track_removed",
    callerFunction = "removeRemoteCameraRecordByKey",
  } = {}) {
    const normalizedKey = normalizeId(key || "");
    if (!normalizedKey) return false;
    const existing = remoteCameraRecordsByKey.get(normalizedKey) || null;
    if (!existing) return false;
    remoteCameraRecordsByKey.delete(normalizedKey);
    emit("camera.remote_track_removed", {
      triggerReason: String(triggerReason || "").trim() || "remote_track_removed",
      callerFunction: String(callerFunction || "").trim() || "removeRemoteCameraRecordByKey",
      participantId: normalizeId(existing?.userId || "") || null,
      participantSid: normalizeId(existing?.participantSid || "") || null,
      trackId: normalizeId(existing?.trackId || "") || null,
      trackSid: normalizeId(existing?.trackSid || "") || null,
    });
    return true;
  }

  function removeRemoteCameraRecord(userId, {
    trackId = "",
    trackSid = "",
    force = false,
    triggerReason = "remote_track_removed",
    callerFunction = "removeRemoteCameraRecord",
  } = {}) {
    const uid = normalizeId(userId || "");
    if (!uid) return false;
    const normalizedTrackId = normalizeId(trackId || "");
    const normalizedTrackSid = normalizeId(trackSid || "");
    const candidateKeys = listRemoteCameraRecords()
      .filter((record) => normalizeId(record?.userId || "") === uid)
      .filter((record) => {
        if (force) return true;
        const existingTrackId = normalizeId(record?.trackId || "");
        const existingTrackSid = normalizeId(record?.trackSid || "");
        if (!normalizedTrackId && !normalizedTrackSid) return true;
        if (normalizedTrackId && existingTrackId && normalizedTrackId === existingTrackId) return true;
        if (normalizedTrackSid && existingTrackSid && normalizedTrackSid === existingTrackSid) return true;
        return false;
      })
      .map((record) => normalizeId(record?.key || ""))
      .filter(Boolean);
    if (!candidateKeys.length) return false;
    let removedAny = false;
    candidateKeys.forEach((key) => {
      removedAny = removeRemoteCameraRecordByKey(key, {
        triggerReason,
        callerFunction,
      }) || removedAny;
    });
    if (removedAny) emitStateChanged(triggerReason, callerFunction);
    return removedAny;
  }

  function clearRemoteCameraRecords({
    triggerReason = "remote_tracks_cleared",
    callerFunction = "clearRemoteCameraRecords",
  } = {}) {
    if (!remoteCameraRecordsByKey.size) return;
    Array.from(remoteCameraRecordsByKey.keys()).forEach((key) => {
      removeRemoteCameraRecordByKey(key, {
        triggerReason,
        callerFunction,
      });
    });
    emitStateChanged(triggerReason, callerFunction);
  }

  async function startCamera({
    triggerReason = "manual_toggle",
    videoConstraints = null,
    qualityPresetOverride = "",
    preferredDeviceIdOverride = "",
  } = {}) {
    const normalizedTriggerReason = String(triggerReason || "").trim() || "manual_toggle";
    const desktopRuntime = isDesktopRuntime();
    lastToggleBlockedReason = "";
    emit("camera.start_requested", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startCamera",
      alreadyActive: !!isLocalCameraActive(),
      roomBound: !!roomBound,
    });
    if (desktopRuntime) {
      emit("camera.desktop_start_requested", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startCamera",
        roomBound: !!roomBound,
        alreadyActive: !!isLocalCameraActive(),
      });
    }
    if (!room || !room.localParticipant) {
      lastToggleBlockedReason = "server_voice_camera_room_not_bound";
      logCameraDebug("[ALTARA_CAMERA_TOGGLE_BLOCKED]", {
        reason: lastToggleBlockedReason,
      });
      const roomBoundError = new Error("server_voice_camera_room_not_bound");
      if (desktopRuntime) {
        emit("camera.desktop_capture_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startCamera",
          stage: "room_not_bound",
          ...describeErrorDetails(roomBoundError),
        });
      }
      throw roomBoundError;
    }
    if (isLocalCameraActive()) {
      const existingPublication = getLocalCameraPublication();
      const existingTrack = existingPublication?.track || null;
      if (!localCaptureTrack && isLiveVideoTrack(existingTrack, { allowMuted: true })) {
        localCaptureTrack = existingTrack;
      }
      if (!localCaptureTrackSid) {
        localCaptureTrackSid = normalizeId(existingPublication?.trackSid || localCaptureTrackSid || "");
      }
      emitStateChanged("local_camera_already_active", "startCamera");
      return {
        active: true,
        trackId: normalizeId(localCaptureTrack?.id || existingTrack?.id || "") || null,
        trackSid: normalizeId(localCaptureTrackSid || existingPublication?.trackSid || "") || null,
      };
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      lastToggleBlockedReason = "server_voice_camera_getusermedia_unavailable";
      logCameraDebug("[ALTARA_CAMERA_TOGGLE_BLOCKED]", {
        reason: lastToggleBlockedReason,
      });
      const mediaApiError = new Error("server_voice_camera_getusermedia_unavailable");
      if (desktopRuntime) {
        emit("camera.desktop_capture_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startCamera",
          stage: "media_devices_unavailable",
          ...describeErrorDetails(mediaApiError),
        });
      }
      throw mediaApiError;
    }

    let desktopPermissions = null;
    let desktopVideoInputs = null;
    if (desktopRuntime) {
      desktopPermissions = await readDesktopPermissionsState();
      emit("camera.desktop_permissions_state", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startCamera",
        permissionsApiSupported: !!desktopPermissions?.permissionsApiSupported,
        cameraPermissionState: desktopPermissions?.cameraPermissionState || null,
        microphonePermissionState: desktopPermissions?.microphonePermissionState || null,
        cameraPermissionError: desktopPermissions?.cameraPermissionError || null,
        microphonePermissionError: desktopPermissions?.microphonePermissionError || null,
      });
      desktopVideoInputs = await enumerateDesktopVideoInputs();
      emit("camera.desktop_devices_enumerated", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startCamera",
        enumerateSupported: !!desktopVideoInputs?.supported,
        videoInputCount: Array.isArray(desktopVideoInputs?.devices) ? desktopVideoInputs.devices.length : 0,
        videoInputIds: desktopVideoInputs?.deviceIds || [],
        enumerateError: desktopVideoInputs?.errorMessage || null,
      });
    }

    clearLocalCaptureResources();
    const resolvedQualityPreset = normalizeCameraQualityPreset(
      qualityPresetOverride || qualityPreset || "auto",
    );
    const resolvedPreferredDeviceId = normalizeId(
      preferredDeviceIdOverride || preferredDeviceId || "",
    );
    const preferredVideoConstraints = (videoConstraints && typeof videoConstraints === "object")
      ? videoConstraints
      : buildVideoConstraintsForQualityPreset(resolvedQualityPreset);
    const firstVideoDeviceId = normalizeId(desktopVideoInputs?.deviceIds?.[0] || "");
    const captureAttempts = [
      ...(resolvedPreferredDeviceId ? [{
        label: "preferred_device_exact",
        constraints: {
          video: {
            ...(preferredVideoConstraints || {}),
            deviceId: { exact: resolvedPreferredDeviceId },
          },
          audio: false,
        },
      }] : []),
      {
        label: "preferred_constraints",
        constraints: {
          video: preferredVideoConstraints,
          audio: false,
        },
      },
      {
        label: "generic_video_true",
        constraints: {
          video: true,
          audio: false,
        },
      },
    ];
    if (firstVideoDeviceId && firstVideoDeviceId !== resolvedPreferredDeviceId) {
      captureAttempts.push({
        label: "first_device_exact",
        constraints: {
          video: { deviceId: { exact: firstVideoDeviceId } },
          audio: false,
        },
      });
    }
    let stream = null;
    let captureError = null;
    let captureAttemptLabel = "";
    for (const attempt of captureAttempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
        captureAttemptLabel = String(attempt.label || "").trim() || "unknown_attempt";
        break;
      } catch (error) {
        captureError = error;
        if (desktopRuntime) {
          emit("camera.desktop_capture_failed", {
            triggerReason: normalizedTriggerReason,
            callerFunction: "startCamera",
            stage: "get_user_media_attempt_failed",
            attempt: String(attempt.label || "").trim() || "unknown_attempt",
            requestedConstraints: attempt.constraints || null,
            ...describeErrorDetails(error),
          });
        }
      }
    }
    if (!stream) {
      const resolvedCaptureError = captureError || new Error("server_voice_camera_capture_failed");
      lastToggleBlockedReason = String(resolvedCaptureError?.message || "server_voice_camera_capture_failed").trim() || "server_voice_camera_capture_failed";
      logCameraDebug("[ALTARA_CAMERA_TOGGLE_BLOCKED]", {
        reason: lastToggleBlockedReason,
      });
      if (desktopRuntime) {
        emit("camera.desktop_capture_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startCamera",
          stage: "capture_exhausted",
          attempt: captureAttemptLabel || null,
          ...describeErrorDetails(resolvedCaptureError),
        });
      }
      throw resolvedCaptureError;
    }
    const track = stream?.getVideoTracks?.()?.find((candidate) => isLiveVideoTrack(candidate, { allowMuted: true })) || null;
    if (!track) {
      try { stream?.getTracks?.()?.forEach((candidate) => candidate?.stop?.()); } catch (_) {}
      lastToggleBlockedReason = "server_voice_camera_track_unavailable";
      logCameraDebug("[ALTARA_CAMERA_TOGGLE_BLOCKED]", {
        reason: lastToggleBlockedReason,
      });
      const noTrackError = new Error("server_voice_camera_track_unavailable");
      if (desktopRuntime) {
        emit("camera.desktop_capture_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startCamera",
          stage: "captured_stream_missing_video_track",
          attempt: captureAttemptLabel || null,
          ...describeErrorDetails(noTrackError),
        });
      }
      throw noTrackError;
    }
    localCaptureStream = stream;
    localCaptureTrack = track;
    localCaptureTrackSid = "";
    emit("camera.local_capture_started", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startCamera",
      trackId: normalizeId(track.id || "") || null,
      width: Number(track.getSettings?.()?.width || 0) || null,
      height: Number(track.getSettings?.()?.height || 0) || null,
      frameRate: Number(track.getSettings?.()?.frameRate || 0) || null,
    });
    if (desktopRuntime) {
      emit("camera.desktop_capture_started", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startCamera",
        attempt: captureAttemptLabel || null,
        trackId: normalizeId(track.id || "") || null,
        width: Number(track.getSettings?.()?.width || 0) || null,
        height: Number(track.getSettings?.()?.height || 0) || null,
        frameRate: Number(track.getSettings?.()?.frameRate || 0) || null,
        deviceId: normalizeId(track.getSettings?.()?.deviceId || "") || null,
      });
    }

    localTrackEndedHandler = () => {
      void stopCamera({
        triggerReason: "local_track_ended",
        callerFunction: "localTrackEndedHandler",
      }).catch(() => {});
    };
    try {
      localCaptureTrack.addEventListener("ended", localTrackEndedHandler, { once: true });
    } catch (_) {
      try { localCaptureTrack.onended = localTrackEndedHandler; } catch (_) {}
    }

    let publication = null;
    try {
      publication = await room.localParticipant.publishTrack(localCaptureTrack, {
        source: Track.Source.Camera,
        stopOnMute: true,
      });
    } catch (error) {
      lastToggleBlockedReason = String(error?.message || "publish_track_failed").trim() || "publish_track_failed";
      logCameraDebug("[ALTARA_CAMERA_TOGGLE_BLOCKED]", {
        reason: lastToggleBlockedReason,
      });
      logCameraDebug("[ALTARA_CAMERA_LOCAL_PUBLISH_FAILED]", {
        errorName: String(error?.name || "").trim() || null,
        errorMessage: String(error?.message || error || "publish_track_failed").trim() || "publish_track_failed",
        stack: String(error?.stack || "").trim() || null,
      });
      logCameraDebug("[ALTARA_CAMERA_PUBLISH_RESULT]", {
        success: false,
        trackSid: null,
        source: "camera",
        kind: "video",
        muted: null,
        reason: lastToggleBlockedReason,
      });
      if (desktopRuntime) {
        emit("camera.desktop_capture_failed", {
          triggerReason: normalizedTriggerReason,
          callerFunction: "startCamera",
          stage: "publish_track_failed",
          attempt: captureAttemptLabel || null,
          trackId: normalizeId(localCaptureTrack?.id || "") || null,
          ...describeErrorDetails(error),
        });
      }
      clearLocalCaptureResources();
      throw error;
    }
    localCaptureTrackSid = normalizeId(publication?.trackSid || "");
    logCameraDebug("[ALTARA_CAMERA_PUBLISH_RESULT]", {
      success: true,
      trackSid: localCaptureTrackSid || null,
      source: String(publication?.source || Track.Source.Camera || "").trim() || "camera",
      kind: String(publication?.kind || localCaptureTrack?.kind || "").trim().toLowerCase() || "video",
      muted: !!publication?.isMuted,
    });
    logCameraDebug("[ALTARA_CAMERA_LOCAL_PUBLISHED]", {
      localIdentity: meId || null,
      trackSid: localCaptureTrackSid || null,
      source: String(publication?.source || Track.Source.Camera || "").trim() || "camera",
      kind: String(publication?.kind || localCaptureTrack?.kind || "").trim().toLowerCase() || "video",
      muted: !!publication?.isMuted,
      trackExists: !!isLiveVideoTrack(localCaptureTrack, { allowMuted: true }),
    });
    emit("camera.track_published", {
      triggerReason: normalizedTriggerReason,
      callerFunction: "startCamera",
      trackId: normalizeId(localCaptureTrack?.id || "") || null,
      trackSid: normalizeId(localCaptureTrackSid || "") || null,
    });
    if (desktopRuntime) {
      emit("camera.desktop_track_published", {
        triggerReason: normalizedTriggerReason,
        callerFunction: "startCamera",
        attempt: captureAttemptLabel || null,
        trackId: normalizeId(localCaptureTrack?.id || "") || null,
        trackSid: normalizeId(localCaptureTrackSid || "") || null,
      });
    }
    emitStateChanged("local_track_published", "startCamera");
    return {
      active: true,
      trackId: normalizeId(localCaptureTrack?.id || "") || null,
      trackSid: normalizeId(localCaptureTrackSid || "") || null,
      publication,
    };
  }

  async function stopCamera({
    triggerReason = "manual_toggle",
    callerFunction = "stopCamera",
  } = {}) {
    const normalizedTriggerReason = String(triggerReason || "").trim() || "manual_toggle";
    const normalizedCaller = String(callerFunction || "").trim() || "stopCamera";
    emit("camera.stop_requested", {
      triggerReason: normalizedTriggerReason,
      callerFunction: normalizedCaller,
      wasActive: !!isLocalCameraActive(),
      roomBound: !!roomBound,
    });
    const track = localCaptureTrack || null;
    const trackId = normalizeId(track?.id || "");
    const trackSid = normalizeId(localCaptureTrackSid || "");
    if (room?.localParticipant && track) {
      try {
        await room.localParticipant.unpublishTrack(track, false);
      } catch (_) {}
    } else if (room?.localParticipant && trackSid) {
      const publication = Array.from(room.localParticipant.videoTrackPublications?.values?.() || [])
        .find((candidate) => normalizeId(candidate?.trackSid || "") === trackSid) || null;
      if (publication?.track) {
        try {
          await room.localParticipant.unpublishTrack(publication.track, false);
        } catch (_) {}
      }
    }
    clearLocalCaptureResources();
    emit("camera.track_unpublished", {
      triggerReason: normalizedTriggerReason,
      callerFunction: normalizedCaller,
      trackId: trackId || null,
      trackSid: trackSid || null,
    });
    emitStateChanged("local_track_unpublished", normalizedCaller);
    return true;
  }

  function handleLocalTrackPublished(publication, participant) {
    if (!isCameraPublication(publication, publication?.track || null)) return;
    if (String(publication?.kind || publication?.track?.kind || "").trim().toLowerCase() !== "video") return;
    const publicationTrack = publication?.track || null;
    if (isLiveVideoTrack(publicationTrack, { allowMuted: true })) {
      localCaptureTrack = publicationTrack;
    }
    localCaptureTrackSid = normalizeId(publication?.trackSid || publicationTrack?.sid || localCaptureTrackSid || "");
    logCameraDebug("[ALTARA_CAMERA_LOCAL_PUBLISHED]", {
      localIdentity: normalizeId(participant?.identity || meId || "") || null,
      trackSid: localCaptureTrackSid || null,
      source: String(publication?.source || publicationTrack?.source || Track.Source.Camera || "").trim() || "camera",
      kind: String(publication?.kind || publicationTrack?.kind || "video").trim().toLowerCase() || "video",
      muted: !!publication?.isMuted,
      trackExists: !!isLiveVideoTrack(publicationTrack, { allowMuted: true }),
    });
    emitCameraStageRefreshRequested("LocalTrackPublished", {
      participant,
      publication,
      track: publicationTrack,
      callerFunction: "handleLocalTrackPublished",
      triggerReason: "local_track_published_event",
    });
    emitStateChanged("local_track_published_event", "handleLocalTrackPublished");
  }

  function handleLocalTrackUnpublished(publication, participant) {
    if (!isCameraPublication(publication, publication?.track || null)) return;
    if (String(publication?.kind || publication?.track?.kind || "").trim().toLowerCase() !== "video") return;
    const unpublishedSid = normalizeId(publication?.trackSid || "");
    if (unpublishedSid && unpublishedSid === normalizeId(localCaptureTrackSid || "")) {
      localCaptureTrackSid = "";
    }
    if (!hasPublishedLocalTrack()) {
      localCaptureTrack = null;
      localCaptureTrackSid = "";
    }
    emitCameraStageRefreshRequested("LocalTrackUnpublished", {
      participant,
      publication,
      track: publication?.track || null,
      callerFunction: "handleLocalTrackUnpublished",
      triggerReason: "local_track_unpublished_event",
    });
    emitStateChanged("local_track_unpublished_event", "handleLocalTrackUnpublished");
    void participant;
  }

  function handleLocalTrackMuted(publication, participant) {
    if (!isCameraPublication(publication, publication?.track || null)) return;
    if (String(publication?.kind || publication?.track?.kind || "").trim().toLowerCase() !== "video") return;
    emitCameraStageRefreshRequested("TrackMuted", {
      participant,
      publication,
      track: publication?.track || null,
      callerFunction: "handleLocalTrackMuted",
      triggerReason: "local_track_muted_event",
    });
    emitStateChanged("local_track_muted_event", "handleLocalTrackMuted");
    void participant;
  }

  function handleLocalTrackUnmuted(publication, participant) {
    if (!isCameraPublication(publication, publication?.track || null)) return;
    if (String(publication?.kind || publication?.track?.kind || "").trim().toLowerCase() !== "video") return;
    emitCameraStageRefreshRequested("TrackUnmuted", {
      participant,
      publication,
      track: publication?.track || null,
      callerFunction: "handleLocalTrackUnmuted",
      triggerReason: "local_track_unmuted_event",
    });
    emitStateChanged("local_track_unmuted_event", "handleLocalTrackUnmuted");
    void participant;
  }

  function handleRemoteTrackPublished(publication, participant) {
    if (String(publication?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, publication?.track || null)) return;
    emitCameraStageRefreshRequested("TrackPublished", {
      participant,
      publication,
      track: publication?.track || null,
      callerFunction: "handleRemoteTrackPublished",
      triggerReason: "remote_track_published",
    });
    setRemoteCameraRecord(participant, publication, publication?.track || null, {
      triggerReason: "remote_track_published",
      callerFunction: "handleRemoteTrackPublished",
      trackSubscribed: typeof publication?.isSubscribed === "boolean" ? !!publication.isSubscribed : false,
      keepTrack: false,
    });
  }

  function handleRemoteTrackSubscribed(track, publication, participant) {
    if (String(track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, track)) return;
    emitCameraStageRefreshRequested("TrackSubscribed", {
      participant,
      publication,
      track,
      callerFunction: "handleRemoteTrackSubscribed",
      triggerReason: "remote_track_subscribed",
    });
    const record = setRemoteCameraRecord(participant, publication, track, {
      triggerReason: "remote_track_subscribed",
      callerFunction: "handleRemoteTrackSubscribed",
      trackSubscribed: true,
      keepTrack: true,
    });
    logCameraDebug("[ALTARA_CAMERA_REMOTE_SUBSCRIBED]", {
      participantIdentity: normalizeId(participant?.identity || "") || null,
      trackSid: normalizeId(publication?.trackSid || track?.sid || "") || null,
      source: String(publication?.source || track?.source || "").trim() || null,
      kind: String(publication?.kind || track?.kind || "").trim().toLowerCase() || "video",
      trackExists: !!isLiveVideoTrack(record?.track || null, { allowMuted: true }),
    });
  }

  function handleRemoteTrackUnsubscribed(track, publication, participant) {
    if (String(track?.kind || publication?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, track)) return;
    emitCameraStageRefreshRequested("TrackUnsubscribed", {
      participant,
      publication,
      track,
      callerFunction: "handleRemoteTrackUnsubscribed",
      triggerReason: "remote_track_unsubscribed",
    });
    setRemoteCameraRecord(participant, publication, null, {
      triggerReason: "remote_track_unsubscribed",
      callerFunction: "handleRemoteTrackUnsubscribed",
      trackSubscribed: false,
      keepTrack: true,
    });
  }

  function handleRemoteTrackUnpublished(publication, participant) {
    if (String(publication?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, publication?.track || null)) return;
    emitCameraStageRefreshRequested("TrackUnpublished", {
      participant,
      publication,
      track: publication?.track || null,
      callerFunction: "handleRemoteTrackUnpublished",
      triggerReason: "remote_track_unpublished",
    });
    const key = resolveRemoteCameraRecordKey(participant, publication, publication?.track || null);
    if (!key) return;
    const removed = removeRemoteCameraRecordByKey(key, {
      triggerReason: "remote_track_unpublished",
      callerFunction: "handleRemoteTrackUnpublished",
    });
    if (removed) emitStateChanged("remote_track_unpublished", "handleRemoteTrackUnpublished");
  }

  function handleTrackSubscriptionStatusChanged(publication, status, participant) {
    if (String(publication?.kind || publication?.track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, publication?.track || null)) return;
    const normalizedStatus = String(status || publication?.subscriptionStatus || "").trim().toLowerCase();
    const nextSubscribed = normalizedStatus
      ? normalizedStatus === "subscribed"
      : (typeof publication?.isSubscribed === "boolean" ? !!publication.isSubscribed : null);
    emitCameraStageRefreshRequested("TrackSubscriptionStatusChanged", {
      participant,
      publication,
      track: publication?.track || null,
      callerFunction: "handleTrackSubscriptionStatusChanged",
      triggerReason: "remote_track_subscription_status_changed",
    });
    setRemoteCameraRecord(participant, publication, publication?.track || null, {
      triggerReason: "remote_track_subscription_status_changed",
      callerFunction: "handleTrackSubscriptionStatusChanged",
      trackSubscribed: typeof nextSubscribed === "boolean" ? nextSubscribed : null,
      keepTrack: nextSubscribed !== false,
    });
    emit("camera.remote_track_subscription_status_changed", {
      triggerReason: "remote_track_subscription_status_changed",
      callerFunction: "handleTrackSubscriptionStatusChanged",
      participantId: resolveParticipantUserId(participant) || null,
      participantIdentity: normalizeId(participant?.identity || "") || null,
      trackSid: normalizeId(publication?.trackSid || publication?.track?.sid || "") || null,
      status: normalizedStatus || null,
      isSubscribed: typeof nextSubscribed === "boolean" ? nextSubscribed : null,
      trackExists: !!isLiveVideoTrack(publication?.track || null, { allowMuted: true }),
    });
  }

  function handleTrackSubscriptionFailed(trackSid, participant, reason) {
    const uid = resolveParticipantUserId(participant);
    emit("camera.remote_track_subscription_failed", {
      triggerReason: "remote_track_subscription_failed",
      callerFunction: "handleTrackSubscriptionFailed",
      participantId: uid || null,
      trackSid: normalizeId(trackSid || "") || null,
      reason: String(reason?.message || reason || "").trim() || null,
    });
  }

  function handleParticipantDisconnected(participant) {
    const uid = resolveParticipantUserId(participant);
    if (!uid) return;
    removeRemoteCameraRecord(uid, {
      force: true,
      triggerReason: "participant_disconnected",
      callerFunction: "handleParticipantDisconnected",
    });
  }

  function handleRoomDisconnected() {
    if (localCaptureTrack || localCaptureStream || localCaptureTrackSid) {
      const trackId = normalizeId(localCaptureTrack?.id || "");
      const trackSid = normalizeId(localCaptureTrackSid || "");
      clearLocalCaptureResources();
      emit("camera.track_unpublished", {
        triggerReason: "room_disconnected",
        callerFunction: "handleRoomDisconnected",
        trackId: trackId || null,
        trackSid: trackSid || null,
      });
    }
    clearRemoteCameraRecords({
      triggerReason: "room_disconnected",
      callerFunction: "handleRoomDisconnected",
    });
    emitStateChanged("room_disconnected", "handleRoomDisconnected");
  }

  function hydrateExistingRemoteCameraTracks() {
    if (!room?.remoteParticipants) return;
    room.remoteParticipants.forEach((participant) => {
      participant?.trackPublications?.forEach?.((publication) => {
        if (!publication) return;
        if (!isCameraPublication(publication, publication.track || null)) return;
        handleRemoteTrackPublished(publication, participant);
        const subscribedTrack = publication.track || null;
        if (subscribedTrack) {
          handleRemoteTrackSubscribed(subscribedTrack, publication, participant);
          return;
        }
        setRemoteCameraRecord(participant, publication, null, {
          triggerReason: "remote_track_publication_seen",
          callerFunction: "hydrateExistingRemoteCameraTracks",
          trackSubscribed: false,
          keepTrack: false,
        });
      });
    });
  }

  function bindRoom(nextRoom = null) {
    if (!nextRoom) return;
    ensureCameraDebugSnapshotHook();
    ensureFocusStateObserver();
    if (room === nextRoom) {
      emitStateChanged("room_rebind_noop", "bindRoom");
      return;
    }
    if (room && roomBound) {
      try { room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished); } catch (_) {}
      try { room.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished); } catch (_) {}
      try { room.off(RoomEvent.TrackMuted, handleLocalTrackMuted); } catch (_) {}
      try { room.off(RoomEvent.TrackUnmuted, handleLocalTrackUnmuted); } catch (_) {}
      try { room.off(RoomEvent.TrackPublished, handleRemoteTrackPublished); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnpublished, handleRemoteTrackUnpublished); } catch (_) {}
      if (RoomEvent.TrackSubscriptionStatusChanged) {
        try { room.off(RoomEvent.TrackSubscriptionStatusChanged, handleTrackSubscriptionStatusChanged); } catch (_) {}
      }
      try { room.off(RoomEvent.TrackSubscriptionFailed, handleTrackSubscriptionFailed); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
      roomBound = false;
    }
    room = nextRoom;
    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
    room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
    room.on(RoomEvent.TrackMuted, handleLocalTrackMuted);
    room.on(RoomEvent.TrackUnmuted, handleLocalTrackUnmuted);
    room.on(RoomEvent.TrackPublished, handleRemoteTrackPublished);
    room.on(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed);
    room.on(RoomEvent.TrackUnpublished, handleRemoteTrackUnpublished);
    if (RoomEvent.TrackSubscriptionStatusChanged) {
      room.on(RoomEvent.TrackSubscriptionStatusChanged, handleTrackSubscriptionStatusChanged);
    }
    room.on(RoomEvent.TrackSubscriptionFailed, handleTrackSubscriptionFailed);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    roomBound = true;
    hydrateExistingRemoteCameraTracks();
    ensureCameraDebugSnapshotHook();
    ensureFocusStateObserver();
    emitStateChanged("room_bound", "bindRoom");
  }

  function getRemoteVideoTracksByUser() {
    const byUser = new Map();
    const recordsByUser = new Map();
    listRemoteCameraRecords().forEach((record) => {
      const userId = normalizeId(record?.userId || "");
      if (!userId) return;
      if (!recordsByUser.has(userId)) recordsByUser.set(userId, []);
      recordsByUser.get(userId).push(record);
    });
    recordsByUser.forEach((records, userId) => {
      const candidates = Array.isArray(records) ? records : [];
      const preferredRecord = candidates.find((record) => (
        !!record?.isSubscribed && isLiveVideoTrack(record?.track || null, { allowMuted: true })
      )) || candidates.find((record) => (
        isLiveVideoTrack(record?.track || null, { allowMuted: true })
      )) || null;
      if (!preferredRecord) return;
      const mediaTrack = preferredRecord.track || null;
      if (!isLiveVideoTrack(mediaTrack, { allowMuted: true })) return;
      byUser.set(userId, {
        primary: mediaTrack || null,
        secondary: null,
        primaryKind: "camera",
        secondaryKind: "",
      });
    });
    return byUser;
  }

  function getLocalVideoTrack() {
    if (isLiveVideoTrack(localCaptureTrack, { allowMuted: true })) return localCaptureTrack;
    const publicationTrack = getLocalCameraPublication()?.track || null;
    if (isLiveVideoTrack(publicationTrack, { allowMuted: true })) return publicationTrack;
    return null;
  }

  async function listVideoInputDevices() {
    const enumerated = await enumerateDesktopVideoInputs();
    const rows = Array.isArray(enumerated?.devices) ? enumerated.devices : [];
    return rows
      .map((row, index) => ({
        deviceId: normalizeId(row?.deviceId || ""),
        label: String(row?.label || "").trim() || `Camera ${index + 1}`,
        groupId: normalizeId(row?.groupId || ""),
        kind: "videoinput",
        index,
      }))
      .filter((row) => !!row.deviceId);
  }

  function getPreferences() {
    return {
      qualityPreset: normalizeCameraQualityPreset(qualityPreset || "auto"),
      qualityPresetOptions: [...CAMERA_QUALITY_PRESET_OPTIONS],
      preferredDeviceId: normalizeId(preferredDeviceId || "") || "",
      activeDeviceId: getActiveCaptureDeviceId() || "",
    };
  }

  async function setQualityPreset(nextPreset = "auto", {
    triggerReason = "camera_quality_selected",
    applyLive = true,
  } = {}) {
    qualityPreset = normalizeCameraQualityPreset(nextPreset || "auto");
    if (applyLive && isLocalCameraActive()) {
      await stopCamera({
        triggerReason: `${String(triggerReason || "").trim() || "camera_quality_selected"}_restart_stop`,
        callerFunction: "setQualityPreset",
      });
      await startCamera({
        triggerReason: `${String(triggerReason || "").trim() || "camera_quality_selected"}_restart_start`,
      });
    }
    emitStateChanged("camera_quality_updated", "setQualityPreset");
    return getPreferences();
  }

  async function setPreferredDevice(nextDeviceId = "", {
    triggerReason = "camera_device_selected",
    applyLive = true,
  } = {}) {
    preferredDeviceId = normalizeId(nextDeviceId || "");
    if (applyLive && isLocalCameraActive()) {
      await stopCamera({
        triggerReason: `${String(triggerReason || "").trim() || "camera_device_selected"}_restart_stop`,
        callerFunction: "setPreferredDevice",
      });
      await startCamera({
        triggerReason: `${String(triggerReason || "").trim() || "camera_device_selected"}_restart_start`,
      });
    }
    emitStateChanged("camera_device_updated", "setPreferredDevice");
    return getPreferences();
  }

  async function detach({
    stopLocalCamera = true,
    triggerReason = "detach",
  } = {}) {
    if (stopLocalCamera) {
      try {
        await stopCamera({
          triggerReason: String(triggerReason || "").trim() || "detach",
          callerFunction: "detach",
        });
      } catch (_) {
        clearLocalCaptureResources();
      }
    } else {
      clearLocalCaptureResources();
    }
    if (room && roomBound) {
      try { room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished); } catch (_) {}
      try { room.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished); } catch (_) {}
      try { room.off(RoomEvent.TrackMuted, handleLocalTrackMuted); } catch (_) {}
      try { room.off(RoomEvent.TrackUnmuted, handleLocalTrackUnmuted); } catch (_) {}
      try { room.off(RoomEvent.TrackPublished, handleRemoteTrackPublished); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnpublished, handleRemoteTrackUnpublished); } catch (_) {}
      try { room.off(RoomEvent.TrackSubscriptionFailed, handleTrackSubscriptionFailed); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
    }
    room = null;
    roomBound = false;
    disconnectFocusStateObserver();
    clearRemoteCameraRecords({
      triggerReason: "detach_remote_clear",
      callerFunction: "detach",
    });
    emitStateChanged("detached", "detach");
  }

  return {
    conversationId: convId,
    localUserId: meId,
    bindRoom,
    startCamera,
    stopCamera,
    async toggleCamera({ triggerReason = "manual_toggle" } = {}) {
      const enabling = !isLocalCameraActive();
      logCameraDebug("[ALTARA_CAMERA_TOGGLE]", {
        enabled: enabling,
        localIdentity: meId || null,
        localCameraPublicationExists: !!normalizeId(localCaptureTrackSid || ""),
        remoteCameraCount: dedupeIds(listRemoteCameraRecords().map((record) => normalizeId(record?.userId || ""))).length,
      });
      if (isLocalCameraActive()) {
        await stopCamera({
          triggerReason: String(triggerReason || "").trim() || "manual_toggle",
          callerFunction: "toggleCamera",
        });
        lastToggleBlockedReason = "";
        return false;
      }
      try {
        await startCamera({
          triggerReason: String(triggerReason || "").trim() || "manual_toggle",
        });
      } catch (error) {
        lastToggleBlockedReason = String(error?.message || error || "camera_toggle_failed").trim() || "camera_toggle_failed";
        logCameraDebug("[ALTARA_CAMERA_TOGGLE_BLOCKED]", {
          reason: lastToggleBlockedReason,
        });
        throw error;
      }
      lastToggleBlockedReason = "";
      return true;
    },
    isLocalCameraActive,
    getLocalVideoTrack,
    getRemoteVideoTracksByUser,
    listVideoInputDevices,
    getPreferences,
    setQualityPreset,
    setPreferredDevice,
    getState() {
      return buildState();
    },
    detach,
  };
}
