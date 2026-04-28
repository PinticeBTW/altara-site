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
  if (source === Track.Source.ScreenShare) return false;
  if (source === Track.Source.Camera) return true;
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
  const remoteCameraRecordsByUser = new Map();

  function emit(event, details = {}) {
    safeInvoke(logger, {
      event: String(event || "").trim() || "camera.event",
      conversationId: convId || null,
      localUserId: meId || null,
      ...((details && typeof details === "object" && !Array.isArray(details)) ? details : { value: details ?? null }),
    });
  }

  function hasPublishedLocalTrack() {
    const track = localCaptureTrack || null;
    if (!isLiveVideoTrack(track, { allowMuted: true })) return false;
    if (!room?.localParticipant) return false;
    const expectedTrackSid = normalizeId(localCaptureTrackSid || "");
    const publications = Array.from(room.localParticipant.videoTrackPublications?.values?.() || []);
    return publications.some((publication) => {
      const publicationSid = normalizeId(publication?.trackSid || "");
      const publicationTrack = publication?.track || null;
      if (expectedTrackSid && publicationSid && expectedTrackSid === publicationSid) return true;
      return !!(publicationTrack && publicationTrack === track);
    });
  }

  function isLocalCameraActive() {
    return hasPublishedLocalTrack();
  }

  function getActiveCaptureDeviceId() {
    return normalizeId(localCaptureTrack?.getSettings?.()?.deviceId || "");
  }

  function buildState() {
    const remoteParticipantIds = dedupeIds(Array.from(remoteCameraRecordsByUser.keys()));
    const participants = remoteParticipantIds
      .map((userId) => {
        const record = remoteCameraRecordsByUser.get(userId) || null;
        if (!record) return null;
        return {
          userId,
          participantSid: normalizeId(record.participantSid || "") || null,
          displayName: String(record.displayName || "").trim() || "",
          trackId: normalizeId(record.trackId || "") || null,
          trackSid: normalizeId(record.trackSid || "") || null,
          receivedAt: record.receivedAt || null,
          updatedAt: record.updatedAt || null,
        };
      })
      .filter(Boolean);
    return {
      conversationId: convId || "",
      localUserId: meId || "",
      localCameraActive: !!isLocalCameraActive(),
      localTrackId: normalizeId(localCaptureTrack?.id || "") || null,
      localTrackSid: normalizeId(localCaptureTrackSid || "") || null,
      qualityPreset: normalizeCameraQualityPreset(qualityPreset || "auto"),
      preferredDeviceId: normalizeId(preferredDeviceId || "") || null,
      activeDeviceId: getActiveCaptureDeviceId() || null,
      remoteParticipantIds,
      participants,
      updatedAt: nowIso(),
    };
  }

  function emitStateChanged(triggerReason = "state_changed", callerFunction = "unknown") {
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
  } = {}) {
    const uid = normalizeId(participant?.identity || "");
    if (!uid || uid === meId) return null;
    const mediaTrack = track?.mediaStreamTrack || track || null;
    if (!isLiveVideoTrack(mediaTrack, { allowMuted: true })) return null;
    const nextRecord = {
      userId: uid,
      participantSid: normalizeId(participant?.sid || ""),
      displayName: String(participant?.name || "").trim() || "",
      trackId: normalizeId(mediaTrack?.id || track?.sid || ""),
      trackSid: normalizeId(publication?.trackSid || track?.sid || ""),
      track: mediaTrack,
      receivedAt: nowIso(),
      updatedAt: nowIso(),
      triggerReason: String(triggerReason || "").trim() || "remote_track_received",
      source: toTrackSource(publication, track) || "camera",
    };
    remoteCameraRecordsByUser.set(uid, nextRecord);
    emit("camera.remote_track_received", {
      triggerReason: nextRecord.triggerReason,
      callerFunction: String(callerFunction || "").trim() || "setRemoteCameraRecord",
      participantId: uid || null,
      participantSid: nextRecord.participantSid || null,
      trackId: nextRecord.trackId || null,
      trackSid: nextRecord.trackSid || null,
      source: nextRecord.source || null,
    });
    emitStateChanged(nextRecord.triggerReason, callerFunction);
    return nextRecord;
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
    const existing = remoteCameraRecordsByUser.get(uid) || null;
    if (!existing) return false;
    const normalizedTrackId = normalizeId(trackId || "");
    const normalizedTrackSid = normalizeId(trackSid || "");
    const existingTrackId = normalizeId(existing.trackId || "");
    const existingTrackSid = normalizeId(existing.trackSid || "");
    const shouldRemove = !!(
      force
      || (!normalizedTrackId && !normalizedTrackSid)
      || (normalizedTrackId && existingTrackId && normalizedTrackId === existingTrackId)
      || (normalizedTrackSid && existingTrackSid && normalizedTrackSid === existingTrackSid)
    );
    if (!shouldRemove) return false;
    remoteCameraRecordsByUser.delete(uid);
    emit("camera.remote_track_removed", {
      triggerReason: String(triggerReason || "").trim() || "remote_track_removed",
      callerFunction: String(callerFunction || "").trim() || "removeRemoteCameraRecord",
      participantId: uid || null,
      participantSid: existing.participantSid || null,
      trackId: existingTrackId || null,
      trackSid: existingTrackSid || null,
    });
    emitStateChanged(triggerReason, callerFunction);
    return true;
  }

  function clearRemoteCameraRecords({
    triggerReason = "remote_tracks_cleared",
    callerFunction = "clearRemoteCameraRecords",
  } = {}) {
    if (!remoteCameraRecordsByUser.size) return;
    Array.from(remoteCameraRecordsByUser.entries()).forEach(([userId, record]) => {
      emit("camera.remote_track_removed", {
        triggerReason: String(triggerReason || "").trim() || "remote_tracks_cleared",
        callerFunction: String(callerFunction || "").trim() || "clearRemoteCameraRecords",
        participantId: normalizeId(userId || "") || null,
        participantSid: normalizeId(record?.participantSid || "") || null,
        trackId: normalizeId(record?.trackId || "") || null,
        trackSid: normalizeId(record?.trackSid || "") || null,
      });
    });
    remoteCameraRecordsByUser.clear();
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
      emitStateChanged("local_camera_already_active", "startCamera");
      return {
        active: true,
        trackId: normalizeId(localCaptureTrack?.id || "") || null,
        trackSid: normalizeId(localCaptureTrackSid || "") || null,
      };
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
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

  function handleRemoteTrackSubscribed(track, publication, participant) {
    if (String(track?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, track)) return;
    setRemoteCameraRecord(participant, publication, track, {
      triggerReason: "remote_track_subscribed",
      callerFunction: "handleRemoteTrackSubscribed",
    });
  }

  function handleRemoteTrackUnsubscribed(track, publication, participant) {
    if (String(track?.kind || publication?.kind || "").trim().toLowerCase() !== "video") return;
    if (!isCameraPublication(publication, track)) return;
    const uid = normalizeId(participant?.identity || "");
    const mediaTrack = track?.mediaStreamTrack || track || null;
    const trackId = normalizeId(mediaTrack?.id || track?.sid || "");
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    removeRemoteCameraRecord(uid, {
      trackId,
      trackSid,
      triggerReason: "remote_track_unsubscribed",
      callerFunction: "handleRemoteTrackUnsubscribed",
    });
  }

  function handleParticipantDisconnected(participant) {
    const uid = normalizeId(participant?.identity || "");
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
    hydrateExistingRemoteCameraTracks();
    emitStateChanged("room_bound", "bindRoom");
  }

  function getRemoteVideoTracksByUser() {
    const byUser = new Map();
    remoteCameraRecordsByUser.forEach((record, userId) => {
      const mediaTrack = record?.track || null;
      if (!isLiveVideoTrack(mediaTrack, { allowMuted: true })) return;
      byUser.set(userId, {
        primary: mediaTrack,
        secondary: null,
        primaryKind: "camera",
        secondaryKind: "",
      });
    });
    return byUser;
  }

  function getLocalVideoTrack() {
    if (!isLiveVideoTrack(localCaptureTrack, { allowMuted: true })) return null;
    return localCaptureTrack;
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
      try { room.off(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed); } catch (_) {}
      try { room.off(RoomEvent.TrackUnsubscribed, handleRemoteTrackUnsubscribed); } catch (_) {}
      try { room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected); } catch (_) {}
      try { room.off(RoomEvent.Disconnected, handleRoomDisconnected); } catch (_) {}
    }
    room = null;
    roomBound = false;
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
      if (isLocalCameraActive()) {
        await stopCamera({
          triggerReason: String(triggerReason || "").trim() || "manual_toggle",
          callerFunction: "toggleCamera",
        });
        return false;
      }
      await startCamera({
        triggerReason: String(triggerReason || "").trim() || "manual_toggle",
      });
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
