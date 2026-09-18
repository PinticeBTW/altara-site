export const CALL_STAGE_LAYOUT = Object.freeze({
  GRID: "grid",
  VOICE_TWO_UP: "voice-two-up",
  SHARE_PRIORITY: "share-priority",
  FOCUS_SHARE: "focus-share",
  FOCUS_CAMERA: "focus-camera",
});

export const PRIVATE_CALL_STAGE_LAYOUT = Object.freeze({
  VOICE_GRID: "voice-grid",
  SHARE_STAGE: "share-stage",
  MULTI_SHARE_STAGE: "multi-share-stage",
  MEDIA_FOCUS: "media-focus",
  // Compatibility alias for focused consumers from C1.15.1.
  SHARE_FOCUS: "media-focus",
});

export const PRIVATE_SHARE_AUDIO_VOLUME_STEP = 0.1;

export function shouldShowPrivateShareReceiverAudioControl({
  active = false,
  ownerUserId = "",
  localUserId = "",
  shareIsLocal = false,
} = {}) {
  const ownerId = String(ownerUserId || "").trim().toLowerCase();
  const meId = String(localUserId || "").trim().toLowerCase();
  return active === true && shareIsLocal !== true && !!ownerId && !!meId && ownerId !== meId;
}

export function fitScreenShareSourceWithinBounds({
  sourceWidth = 0,
  sourceHeight = 0,
  availableWidth = 0,
  availableHeight = 0,
} = {}) {
  const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const safeSourceWidth = toPositiveNumber(sourceWidth);
  const safeSourceHeight = toPositiveNumber(sourceHeight);
  const safeAvailableWidth = toPositiveNumber(availableWidth);
  const safeAvailableHeight = toPositiveNumber(availableHeight);
  const ready = !!(
    safeSourceWidth
    && safeSourceHeight
    && safeAvailableWidth
    && safeAvailableHeight
  );
  if (!ready) {
    return {
      ready: false,
      sourceVideoWidth: safeSourceWidth,
      sourceVideoHeight: safeSourceHeight,
      sourceAspectRatio: null,
      primaryAvailableWidth: safeAvailableWidth,
      primaryAvailableHeight: safeAvailableHeight,
      primaryAvailableAspectRatio: null,
      fittedMediaWidth: 0,
      fittedMediaHeight: 0,
      fittedMediaAspectRatio: null,
      letterbox: { horizontalPixels: 0, verticalPixels: 0 },
      fitMode: "contain_source_aspect",
    };
  }

  const sourceAspectRatio = safeSourceWidth / safeSourceHeight;
  const primaryAvailableAspectRatio = safeAvailableWidth / safeAvailableHeight;
  let fittedMediaWidth = safeAvailableWidth;
  let fittedMediaHeight = safeAvailableWidth / sourceAspectRatio;
  if (sourceAspectRatio < primaryAvailableAspectRatio) {
    fittedMediaHeight = safeAvailableHeight;
    fittedMediaWidth = safeAvailableHeight * sourceAspectRatio;
  }
  fittedMediaWidth = Math.min(safeAvailableWidth, fittedMediaWidth);
  fittedMediaHeight = Math.min(safeAvailableHeight, fittedMediaHeight);

  return {
    ready: true,
    sourceVideoWidth: safeSourceWidth,
    sourceVideoHeight: safeSourceHeight,
    sourceAspectRatio,
    primaryAvailableWidth: safeAvailableWidth,
    primaryAvailableHeight: safeAvailableHeight,
    primaryAvailableAspectRatio,
    fittedMediaWidth,
    fittedMediaHeight,
    fittedMediaAspectRatio: fittedMediaWidth / fittedMediaHeight,
    letterbox: {
      horizontalPixels: Math.max(0, safeAvailableWidth - fittedMediaWidth),
      verticalPixels: Math.max(0, safeAvailableHeight - fittedMediaHeight),
    },
    fitMode: "contain_source_aspect",
  };
}

export function derivePrivateShareAudioControlState({
  volume = 1,
  muted = false,
  action = "",
  step = PRIVATE_SHARE_AUDIO_VOLUME_STEP,
} = {}) {
  const clamp = (value) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 1));
  const safeStep = Math.max(0.01, Math.min(1, Number.isFinite(Number(step)) ? Number(step) : PRIVATE_SHARE_AUDIO_VOLUME_STEP));
  const currentVolume = clamp(volume);
  const currentMuted = muted === true;
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (normalizedAction === "toggle-mute") {
    return { volume: currentVolume, muted: !currentMuted };
  }
  if (normalizedAction === "volume-down") {
    return { volume: clamp(currentVolume - safeStep), muted: currentMuted };
  }
  if (normalizedAction === "volume-up") {
    return { volume: clamp(currentVolume + safeStep), muted: currentMuted };
  }
  return { volume: currentVolume, muted: currentMuted };
}

export function derivePrivateSharePlaybackAudioState({
  volume = 1,
  muted = false,
  lastNonZeroVolume = 1,
  action = "",
  value = null,
  step = PRIVATE_SHARE_AUDIO_VOLUME_STEP,
} = {}) {
  const clamp = (input, fallback = 1) => {
    const number = Number(input);
    return Math.max(0, Math.min(1, Number.isFinite(number) ? number : fallback));
  };
  const safeStep = Math.max(
    0.01,
    Math.min(1, Number.isFinite(Number(step)) ? Number(step) : PRIVATE_SHARE_AUDIO_VOLUME_STEP),
  );
  const currentVolume = clamp(volume);
  const rememberedVolume = currentVolume > 0
    ? currentVolume
    : Math.max(0.01, clamp(lastNonZeroVolume));
  const currentMuted = muted === true;
  const normalizedAction = String(action || "").trim().toLowerCase();

  if (normalizedAction === "toggle-mute") {
    return currentMuted
      ? { volume: currentVolume > 0 ? currentVolume : rememberedVolume, muted: false, lastNonZeroVolume: rememberedVolume }
      : { volume: currentVolume, muted: true, lastNonZeroVolume: rememberedVolume };
  }

  let nextVolume = currentVolume;
  if (normalizedAction === "volume-down") nextVolume = clamp(currentVolume - safeStep);
  if (normalizedAction === "volume-up") nextVolume = clamp(currentVolume + safeStep);
  if (normalizedAction === "set-volume") nextVolume = clamp(value, currentVolume);
  return {
    volume: nextVolume,
    muted: currentMuted,
    lastNonZeroVolume: nextVolume > 0 ? nextVolume : rememberedVolume,
  };
}

export function resolvePrivateCallStageParticipantIds({
  conversationType = "direct",
  localUserId = "",
  peerUserId = "",
  callMemberIds = [],
  transportParticipantIds = [],
} = {}) {
  const normalizeId = (value) => String(value || "").trim().toLowerCase();
  if (String(conversationType || "").trim().toLowerCase() === "group") {
    // The group adapter supplies current session membership. A remembered
    // peer or a stale Room snapshot must not add a participant to this list.
    return Array.from(new Set((Array.isArray(callMemberIds) ? callMemberIds : [])
      .map(normalizeId).filter(Boolean)));
  }
  const localId = normalizeId(localUserId);
  const explicitPeerId = normalizeId(peerUserId);
  const candidates = [
    ...(Array.isArray(callMemberIds) ? callMemberIds : []),
    ...(Array.isArray(transportParticipantIds) ? transportParticipantIds : []),
  ].map(normalizeId).filter(Boolean);
  const resolvedPeerId = explicitPeerId
    || candidates.find((candidate) => candidate !== localId)
    || "";
  return Array.from(new Set([localId, resolvedPeerId].filter(Boolean)));
}

export function deriveSharedCallStagePresentationLayout({
  mode = "grid",
  focusedSource = "",
  hasScreenShare = false,
  activeShareCount = 0,
  participantCount = 0,
} = {}) {
  const normalizedMode = String(mode || "grid").trim().toLowerCase();
  const normalizedSource = String(focusedSource || "").trim().toLowerCase();
  const screenShareActive = hasScreenShare === true;
  if (
    normalizedMode === "focus"
    && (normalizedSource === "camera" || normalizedSource === "avatar")
  ) {
    return PRIVATE_CALL_STAGE_LAYOUT.MEDIA_FOCUS;
  }
  if (normalizedMode === "focus" && normalizedSource === "screen_share" && screenShareActive) {
    return PRIVATE_CALL_STAGE_LAYOUT.MEDIA_FOCUS;
  }
  if (screenShareActive && Number(activeShareCount || 0) >= 2) {
    return PRIVATE_CALL_STAGE_LAYOUT.MULTI_SHARE_STAGE;
  }
  if (screenShareActive) return PRIVATE_CALL_STAGE_LAYOUT.SHARE_STAGE;
  void participantCount;
  return PRIVATE_CALL_STAGE_LAYOUT.VOICE_GRID;
}

function resolveResponsiveGrid({ participantCount = 0, availableWidth = 0, availableHeight = 0 } = {}) {
  const count = Math.max(0, Number(participantCount || 0));
  if (count <= 1) return { columns: 1, rows: 1, pattern: "single" };
  if (count === 2) return { columns: 2, rows: 1, pattern: "two-up" };
  if (count === 3) return { columns: 2, rows: 2, pattern: "balanced-three" };
  if (count === 4) return { columns: 2, rows: 2, pattern: "two-by-two" };
  const width = Math.max(1, Number(availableWidth || 0));
  const height = Math.max(1, Number(availableHeight || 0));
  let best = null;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const cellArea = (width / columns) * (height / rows);
    const balancePenalty = Math.abs((width / columns) / (height / rows) - (16 / 9));
    const score = cellArea / (1 + balancePenalty * 0.08);
    if (!best || score > best.score) best = { columns, rows, score };
  }
  return { columns: best.columns, rows: best.rows, pattern: "responsive" };
}

export function resolveCallStageLayout({
  availableWidth = 0,
  availableHeight = 0,
  participantCount = 0,
  activeCameraTracks = 0,
  screenShareCount = 0,
  focusedTrack = null,
  compact = false,
  narrow = false,
  participantOrdering = [],
} = {}) {
  const shareCount = Math.max(0, Number(screenShareCount || 0));
  const count = Math.max(0, Number(participantCount || 0));
  const focusedSource = String(focusedTrack?.source || focusedTrack || "").trim().toLowerCase();
  const focused = !!focusedSource;
  const mainTrack = shareCount > 0 ? "screen_share" : (focused ? focusedSource : "");
  const presentation = deriveSharedCallStagePresentationLayout({
    mode: focused ? "focus" : "grid",
    focusedSource,
    hasScreenShare: shareCount > 0,
    activeShareCount: shareCount,
    participantCount: count,
  });
  return Object.freeze({
    mode: presentation,
    mainTrack,
    participantOrdering: Object.freeze(Array.from(participantOrdering || [])),
    grid: Object.freeze(resolveResponsiveGrid({ participantCount: count, availableWidth, availableHeight })),
    secondary: shareCount > 0
      ? Object.freeze({ placement: narrow || compact ? "bottom" : "right", ratio: narrow || compact ? null : 0.165 })
      : null,
    activeCameraTracks: Math.max(0, Number(activeCameraTracks || 0)),
    availableWidth: Math.max(0, Number(availableWidth || 0)),
    availableHeight: Math.max(0, Number(availableHeight || 0)),
  });
}

// Backwards-compatible name for the accepted private-call implementation.
// Private, group and server adapters now call the shared resolver above.
export function derivePrivateCallStagePresentationLayout(options = {}) {
  return deriveSharedCallStagePresentationLayout(options);
}

export function createCallStageModel({
  callKind = "private",
  localConnected = false,
  participants = [],
  screenShares = [],
  focusedShare = "",
  focusedSource = "",
  mode = "grid",
  controls = {},
  tracks = [],
  availableWidth = 0,
  availableHeight = 0,
  compact = false,
  narrow = false,
} = {}) {
  const normalizeId = (value) => String(value || "").trim().toLowerCase();
  const normalizedParticipants = (Array.isArray(participants) ? participants : [])
    .filter((participant) => participant && typeof participant === "object")
    .map((participant) => ({
      ...participant,
      userId: normalizeId(participant.userId || participant.participantId || ""),
    }))
    .filter((participant) => !!participant.userId);
  const normalizedScreenShares = (Array.isArray(screenShares) ? screenShares : [])
    .filter((share) => share && typeof share === "object")
    .map((share) => ({
      ...share,
      key: normalizeId(share.key || share.trackSid || share.trackId || ""),
      ownerUserId: normalizeId(share.ownerUserId || share.participantId || ""),
    }))
    .filter((share) => !!share.key && !!share.ownerUserId);
  const focusedShareKey = normalizeId(focusedShare);
  const selectedFocusedShare = focusedShareKey
    && normalizedScreenShares.some((share) => share.key === focusedShareKey)
    ? focusedShareKey
    : "";
  const effectiveFocusedSource = selectedFocusedShare ? "screen_share" : String(focusedSource || "").trim().toLowerCase();
  const layout = deriveSharedCallStagePresentationLayout({
    mode,
    focusedSource: effectiveFocusedSource,
    hasScreenShare: normalizedScreenShares.length > 0,
    activeShareCount: normalizedScreenShares.length,
    participantCount: normalizedParticipants.length,
  });
  const normalizedTracks = Array.isArray(tracks) ? tracks.slice() : [];
  const geometry = resolveCallStageLayout({
    availableWidth,
    availableHeight,
    participantCount: normalizedParticipants.length,
    activeCameraTracks: normalizedTracks.filter((track) => String(track?.source || "").toLowerCase() === "camera").length,
    screenShareCount: normalizedScreenShares.length,
    focusedTrack: effectiveFocusedSource,
    compact,
    narrow,
    participantOrdering: normalizedParticipants.map((participant) => participant.userId),
  });
  return {
    callKind: String(callKind || "private").trim().toLowerCase() || "private",
    localConnected: localConnected === true,
    participants: normalizedParticipants,
    screenShares: normalizedScreenShares,
    focusedShare: selectedFocusedShare,
    controls: controls && typeof controls === "object" ? { ...controls } : {},
    tracks: normalizedTracks,
    layout,
    geometry,
  };
}

export function deriveCallStagePresentationLayout({
  mode = "grid",
  focusedSource = "",
  shareCount = 0,
  hasActiveScreenShareTrack = false,
  participantCount = 0,
} = {}) {
  const normalizedMode = String(mode || "grid").trim().toLowerCase();
  const normalizedSource = String(focusedSource || "").trim().toLowerCase();
  if (normalizedMode === "focus" && normalizedSource === "screen_share") return CALL_STAGE_LAYOUT.FOCUS_SHARE;
  if (normalizedMode === "focus" && normalizedSource === "camera") return CALL_STAGE_LAYOUT.FOCUS_CAMERA;
  if (hasActiveScreenShareTrack === true || Number(shareCount || 0) > 0) return CALL_STAGE_LAYOUT.SHARE_PRIORITY;
  if (Number(participantCount || 0) === 2) return CALL_STAGE_LAYOUT.VOICE_TWO_UP;
  return CALL_STAGE_LAYOUT.GRID;
}
