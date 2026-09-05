import {
  buildSafeCallShareTitle,
  isUnsafeCallVisibleName,
} from "./callVisibleIdentity.js";

const URL_PATTERN = /(?:https?:\/\/|file:\/\/|www\.)/i;
const FILE_PATH_PATTERN = /(?:^[a-z]:[\\/]|\\\\[^\\]+\\|\/(?:users|home|var|tmp)\/)/i;
const CAPTURE_SOURCE_ID_PATTERN = /^(?:screen|window|tab|desktop):[a-z0-9:_-]+$/i;

function cleanPresentationText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function isUnsafePrivateCallPresentationLabel(value) {
  const label = cleanPresentationText(value);
  if (!label) return true;
  return isUnsafeCallVisibleName(label)
    || URL_PATTERN.test(label)
    || FILE_PATH_PATTERN.test(label)
    || CAPTURE_SOURCE_ID_PATTERN.test(label);
}

export function buildPrivateCallShareTitle({
  isLocal = false,
  canonicalActorLabel = "",
} = {}) {
  const safeActorLabel = cleanPresentationText(canonicalActorLabel);
  return buildSafeCallShareTitle({
    isLocal,
    actorLabel: isUnsafePrivateCallPresentationLabel(safeActorLabel) ? "" : safeActorLabel,
    fallback: "User",
  });
}

function normalizePresentationId(value) {
  return String(value || "").trim().toLowerCase();
}

export const PRIVATE_CALL_PRESENTATION_STATES = Object.freeze({
  LOCAL_CONNECTED: "LOCAL_CONNECTED",
  LOCAL_JOINING: "LOCAL_JOINING",
  EXISTING_CALL_PREVIEW: "EXISTING_CALL_PREVIEW",
  INCOMING_CALL: "INCOMING_CALL",
  IDLE: "IDLE",
});

export const PRIVATE_CALL_SURFACES = Object.freeze({
  FULL_CALL_STAGE: "FULL_CALL_STAGE",
  CALL_STAGE_JOINING: "CALL_STAGE_JOINING",
  CALL_STAGE_PREVIEW: "CALL_STAGE_PREVIEW",
  MINI_CALL: "MINI_CALL",
  NORMAL_DM: "NORMAL_DM",
});

export function derivePrivateCallControlPresentation({
  surface = PRIVATE_CALL_SURFACES.NORMAL_DM,
  presentationShowJoin = false,
  remotePresentCount = 0,
  resumeAttemptInFlight = false,
  localParticipantPresent = false,
  localMediaConnected = false,
  controllerActive = false,
  roomConnected = false,
  cameraAvailable = false,
  screenShareAvailable = false,
} = {}) {
  const previewActive = surface === PRIVATE_CALL_SURFACES.CALL_STAGE_PREVIEW;
  const connectedSurface = surface === PRIVATE_CALL_SURFACES.FULL_CALL_STAGE
    || surface === PRIVATE_CALL_SURFACES.MINI_CALL;
  const connectedMediaSession = !!(
    connectedSurface
    && localParticipantPresent === true
    && localMediaConnected === true
    && controllerActive === true
    && roomConnected === true
  );
  const joinVisible = !!(
    previewActive
    && presentationShowJoin === true
    && Number(remotePresentCount || 0) > 0
    && localParticipantPresent !== true
    && localMediaConnected !== true
    && resumeAttemptInFlight !== true
  );
  const disabledReason = (available, capabilityName) => {
    if (previewActive) return "private_call_preview";
    if (surface === PRIVATE_CALL_SURFACES.CALL_STAGE_JOINING) return "private_call_joining";
    if (!connectedMediaSession) return "local_private_media_not_connected";
    if (available !== true) return `${capabilityName}_unavailable`;
    return "";
  };

  return Object.freeze({
    joinVisible,
    connectedMediaSession,
    mediaControlsInteractive: connectedMediaSession,
    screenShareDisabled: !(connectedMediaSession && screenShareAvailable === true),
    screenShareDisabledReason: disabledReason(screenShareAvailable, "screen_share"),
    cameraDisabled: !(connectedMediaSession && cameraAvailable === true),
    cameraDisabledReason: disabledReason(cameraAvailable, "camera"),
  });
}

export function derivePrivateCallSurfaceRoute({
  presentationState = PRIVATE_CALL_PRESENTATION_STATES.IDLE,
  dmOpen = false,
  viewedConversationId = "",
  callConversationId = "",
  transportConversationId = "",
  previewConversationId = "",
  localMediaConnected = false,
  previewVisible = false,
} = {}) {
  const viewedId = normalizePresentationId(viewedConversationId);
  const activeCallId = normalizePresentationId(
    transportConversationId
    || callConversationId
    || previewConversationId,
  );
  const sameConversation = !!(
    dmOpen === true
    && viewedId
    && activeCallId
    && viewedId === activeCallId
  );
  const localConnected = !!(
    presentationState === PRIVATE_CALL_PRESENTATION_STATES.LOCAL_CONNECTED
    || localMediaConnected === true
  );
  const localJoining = presentationState === PRIVATE_CALL_PRESENTATION_STATES.LOCAL_JOINING;
  const preview = !!(
    previewVisible === true
    || presentationState === PRIVATE_CALL_PRESENTATION_STATES.EXISTING_CALL_PREVIEW
  );
  const ownsPrivateCallSurface = !!(activeCallId && (localConnected || localJoining || preview));
  const surface = sameConversation && localConnected
    ? PRIVATE_CALL_SURFACES.FULL_CALL_STAGE
    : sameConversation && localJoining
      ? PRIVATE_CALL_SURFACES.CALL_STAGE_JOINING
      : sameConversation && preview
        ? PRIVATE_CALL_SURFACES.CALL_STAGE_PREVIEW
        : localConnected
          ? PRIVATE_CALL_SURFACES.MINI_CALL
          : PRIVATE_CALL_SURFACES.NORMAL_DM;
  const mountFullStage = !!([
    PRIVATE_CALL_SURFACES.FULL_CALL_STAGE,
    PRIVATE_CALL_SURFACES.CALL_STAGE_JOINING,
    PRIVATE_CALL_SURFACES.CALL_STAGE_PREVIEW,
  ].includes(surface));

  return Object.freeze({
    activeCallId,
    viewedId,
    sameConversation,
    ownsPrivateCallSurface,
    localConnected,
    localJoining,
    preview,
    surface,
    mountFullStage,
    mountControls: surface === PRIVATE_CALL_SURFACES.FULL_CALL_STAGE,
    dockStageInDm: mountFullStage,
    showMiniCall: surface === PRIVATE_CALL_SURFACES.MINI_CALL,
  });
}

function collectGenerationBoundRemoteParticipants({
  presenceMembers = [],
  currentUserId = "",
  expectedRemoteUserId = "",
  callGeneration = "",
} = {}) {
  const localUserId = normalizePresentationId(currentUserId);
  const expectedRemote = normalizePresentationId(expectedRemoteUserId);
  const generation = normalizePresentationId(callGeneration);
  const seen = new Set();
  const remoteParticipantIds = [];

  (Array.isArray(presenceMembers) ? presenceMembers : []).forEach((member) => {
    const userId = normalizePresentationId(member?.userId);
    const meta = member?.meta && typeof member.meta === "object" && !Array.isArray(member.meta)
      ? member.meta
      : {};
    const memberGeneration = normalizePresentationId(meta.callGeneration);
    if (
      !userId
      || userId === localUserId
      || userId !== expectedRemote
      || seen.has(userId)
      || meta.privateLiveKit !== true
      || meta.participantPresentInRoom !== true
      || meta.mediaConnected !== true
      || memberGeneration !== generation
    ) {
      return;
    }
    seen.add(userId);
    remoteParticipantIds.push(userId);
  });

  return remoteParticipantIds;
}

export function derivePrivateCallPresentationState({
  resumeRecord = null,
  currentConversationId = "",
  currentUserId = "",
  presenceMembers = [],
  terminalCallGeneration = "",
  localParticipantPresent = false,
  localMediaConnected = false,
  localJoining = false,
  incomingCall = false,
  now = Date.now(),
} = {}) {
  const conversationId = normalizePresentationId(resumeRecord?.conversationId);
  const currentConversation = normalizePresentationId(currentConversationId);
  const callGeneration = normalizePresentationId(resumeRecord?.callGeneration);
  const terminalGeneration = normalizePresentationId(terminalCallGeneration);
  const expectedRemoteUserId = normalizePresentationId(resumeRecord?.otherUserId);
  const expiresAt = Number(resumeRecord?.expiresAt || 0);
  const sessionStatus = cleanPresentationText(
    resumeRecord?.sessionStatus
    || resumeRecord?.session_status
    || resumeRecord?.status
    || "accepted",
  ).toLowerCase();
  const sessionNonTerminal = ["accepted", "active", "ongoing"].includes(sessionStatus);
  const generationTerminal = !!(
    callGeneration
    && terminalGeneration
    && callGeneration === terminalGeneration
  );
  const logicalCallExists = !!(
    resumeRecord?.kind === "private"
    && resumeRecord?.existingLogicalCall === true
    && sessionNonTerminal
    && !generationTerminal
    && conversationId
    && conversationId === currentConversation
    && callGeneration
    && expectedRemoteUserId
  );
  const generationValid = !!(
    logicalCallExists
    && Number.isFinite(expiresAt)
    && expiresAt > Number(now || 0)
  );
  const remoteParticipantIds = generationValid
    ? collectGenerationBoundRemoteParticipants({
        presenceMembers,
        currentUserId,
        expectedRemoteUserId,
        callGeneration,
      })
    : [];
  const remotePresentCount = remoteParticipantIds.length;
  const localConnected = localParticipantPresent === true || localMediaConnected === true;

  let state = PRIVATE_CALL_PRESENTATION_STATES.IDLE;
  if (localConnected) {
    state = PRIVATE_CALL_PRESENTATION_STATES.LOCAL_CONNECTED;
  } else if (localJoining === true) {
    state = PRIVATE_CALL_PRESENTATION_STATES.LOCAL_JOINING;
  } else if (
    logicalCallExists
    && generationValid
    && resumeRecord?.joinableExistingCall === true
    && remotePresentCount > 0
  ) {
    state = PRIVATE_CALL_PRESENTATION_STATES.EXISTING_CALL_PREVIEW;
  } else if (incomingCall === true) {
    state = PRIVATE_CALL_PRESENTATION_STATES.INCOMING_CALL;
  }

  const showJoin = !!(
    state === PRIVATE_CALL_PRESENTATION_STATES.EXISTING_CALL_PREVIEW
    && logicalCallExists
    && generationValid
    && localParticipantPresent !== true
    && localMediaConnected !== true
    && remotePresentCount > 0
    && resumeRecord?.joinableExistingCall === true
  );

  return {
    state,
    showJoin,
    previewActive: state === PRIVATE_CALL_PRESENTATION_STATES.EXISTING_CALL_PREVIEW,
    logicalCallExists,
    generationValid,
    generationTerminal,
    sessionStatus,
    sessionNonTerminal,
    joinableExistingCall: resumeRecord?.joinableExistingCall === true,
    conversationId,
    callGeneration,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    localParticipantPresent: localParticipantPresent === true,
    localMediaConnected: localMediaConnected === true,
    localJoining: localJoining === true,
    remoteParticipantIds,
    remotePresentCount,
    participantCount: remotePresentCount,
  };
}

export function derivePrivateCallOngoingStagePreview({
  resumeRecord = null,
  currentConversationId = "",
  currentUserId = "",
  presenceMembers = [],
  terminalCallGeneration = "",
  localCallActive = false,
  now = Date.now(),
} = {}) {
  const decision = derivePrivateCallPresentationState({
    resumeRecord,
    currentConversationId,
    currentUserId,
    presenceMembers,
    terminalCallGeneration,
    localParticipantPresent: localCallActive === true || resumeRecord?.localParticipantPresent === true,
    localMediaConnected: localCallActive === true,
    now,
  });

  return {
    ...decision,
    visible: decision.previewActive,
    joinable: decision.showJoin,
  };
}
