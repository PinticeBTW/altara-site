import { serverVoiceMoveDiagnostics } from "./serverVoiceMoveDiagnostics.js";
import { DisconnectReason, Room, RoomEvent, Track } from "../node_modules/livekit-client/dist/livekit-client.esm.mjs";
import {
  parseNativeScreenshareCompanionIdentity,
} from "./liveKitTechnicalParticipant.js";

function isNativeScreenshareCompanionIdentity(participant = null) {
  return !!parseNativeScreenshareCompanionIdentity(participant?.identity || "");
}

function normalizeId(value) {
  return String(value || "").trim();
}

function safeClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function safeParseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function nowIso() {
  return new Date().toISOString();
}

function monotonicNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function normalizeConnectionQuality(value) {
  const quality = String(value || "unknown").trim().toLowerCase();
  return ["excellent", "good", "poor", "lost"].includes(quality) ? quality : "unknown";
}

function dedupeStringList(values = []) {
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

function normalizeLiveKitTrackSourceName(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "camera") return Track.Source.Camera;
  if (raw === "2" || raw === "microphone") return Track.Source.Microphone;
  if (raw === "3" || raw === "screen_share") return Track.Source.ScreenShare;
  if (raw === "4" || raw === "screen_share_audio") return Track.Source.ScreenShareAudio;
  return raw || null;
}

function summarizeParticipantPermission(permission = null) {
  if (!permission || typeof permission !== "object") return null;
  const canPublishSources = dedupeStringList(
    (Array.isArray(permission.canPublishSources) ? permission.canPublishSources : [])
      .map(normalizeLiveKitTrackSourceName)
      .filter(Boolean),
  );
  const canPublish = permission.canPublish === true;
  return {
    canPublish,
    canSubscribe: permission.canSubscribe === true,
    canPublishData: permission.canPublishData === true,
    canPublishSources,
    sourceCount: canPublishSources.length,
    unrestrictedSources: canPublish && canPublishSources.length === 0,
    microphoneAllowed: canPublish && (
      canPublishSources.length === 0
      || canPublishSources.includes(Track.Source.Microphone)
    ),
  };
}

function buildTrackRuntimeKey({
  trackId = "",
  trackSid = "",
} = {}) {
  return normalizeId(trackSid || trackId || "");
}

function describeErrorDetails(error) {
  const message = String(error?.message || error || "unknown_error").trim() || "unknown_error";
  const name = String(error?.name || error?.code || "").trim() || null;
  const stack = typeof error?.stack === "string"
    ? error.stack
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" | ")
    : null;
  return {
    errorName: name,
    errorMessage: message,
    errorStack: stack,
  };
}

function baseParticipantState(userId, participant = null, { local = false } = {}) {
  return {
    userId,
    participantIdentity: userId,
    participantSid: String(participant?.sid || "").trim() || null,
    displayName: String(participant?.name || "").trim() || "",
    metadata: String(participant?.metadata || "").trim() || "",
    metadataJson: safeParseJsonObject(participant?.metadata || ""),
    attributes: participant?.attributes && typeof participant.attributes === "object" ? { ...participant.attributes } : {},
    isLocal: !!local,
    discovered: !!local,
    presentInRoom: !!local,
    participantSids: local ? dedupeStringList([participant?.sid || ""]) : [],
    participantSidCount: local ? 1 : 0,
    connectionState: "disconnected",
    connectionQuality: normalizeConnectionQuality(participant?.connectionQuality),
    audioSubscribed: false,
    audioAttached: false,
    audioLive: false,
    audioMuted: false,
    audioTrackId: null,
    audioTrackSid: null,
    audioTrackIds: [],
    audioTrackSids: [],
    audioSubscriptionCount: 0,
    audioAttachmentCount: 0,
    speaking: false,
    joinedAt: local ? nowIso() : null,
    discoveredAt: local ? nowIso() : null,
    lastUpdatedAt: nowIso(),
    lastError: null,
  };
}

function buildInitialSnapshot({
  conversationId = "",
  localUserId = "",
  roomName = "",
  url = "",
  mediaMode = "audio_only",
  controllerId = "",
  joinAttemptId = "",
} = {}) {
  return {
    transport: "livekit",
    conversationId: normalizeId(conversationId || ""),
    localUserId: normalizeId(localUserId || ""),
    controllerId: String(controllerId || "").trim() || "",
    joinAttemptId: String(joinAttemptId || "").trim() || "",
    roomName: String(roomName || "").trim() || "",
    roomUrl: String(url || "").trim() || "",
    mediaMode: String(mediaMode || "").trim() || "audio_only",
    connectionState: "disconnected",
    connectionQuality: "unknown",
    connectionStateChangedAt: nowIso(),
    roomConnectStartedAt: null,
    signalConnectedAt: null,
    roomConnectResolvedAt: null,
    connectedAt: null,
    reconnectedAt: null,
    disconnectedAt: null,
    joinPhase: "idle",
    connected: false,
    reconnecting: false,
    disconnectRequested: false,
    lastError: null,
    lastDisconnect: null,
    lastUpdatedAt: nowIso(),
    local: {
      userId: normalizeId(localUserId || ""),
      roomConnected: false,
      connectionQuality: "unknown",
      audioTrackCreated: false,
      audioTrackCreatedAt: null,
      audioTrackPublished: false,
      audioTrackPublishedAt: null,
      mediaReady: false,
      micMuted: false,
      deafened: false,
      inputDeviceId: "default",
      outputDeviceId: "default",
      audioTrackId: null,
      audioTrackSid: null,
      participantPermission: null,
      participantPermissionUpdatedAt: null,
      lastUpdatedAt: nowIso(),
    },
    participantsByUser: {},
  };
}

function safeInvoke(callback, payload = null) {
  try {
    return callback(payload);
  } catch (_) {
    return null;
  }
}

const SERVER_VOICE_LIVEKIT_ROOM_OPTIONS = Object.freeze({
  // ALTARA owns the video elements instead of using LiveKit's attach()
  // dimension observer, so automatic adaptive-stream sizing is intentionally
  // disabled. Screen publications request HIGH explicitly when watched.
  adaptiveStream: false,
  // Screen share uses simulcast; do not keep encoding unused layers when the
  // SFU has no subscriber for them.
  dynacast: true,
  disconnectOnPageLeave: false,
  stopLocalTrackOnUnpublish: true,
});

export function createServerVoiceLiveKitRoom() {
  return new Room({ ...SERVER_VOICE_LIVEKIT_ROOM_OPTIONS });
}

export function createServerVoiceLiveKitController({
  conversationId = "",
  localUserId = "",
  participantUserId = (identity) => identity,
  roomName = "",
  url = "",
  token = "",
  mediaMode = "audio_only",
  autoSubscribe = true,
  controllerId = "",
  joinAttemptId = "",
  logger = () => {},
  onSnapshot = () => {},
  onConversationChanged = () => {},
  onError = () => {},
  onRemoteAudioTrackSubscribed = () => {},
  shouldReceiveScreenShareAudio = () => false,
  onRemoteAudioTrackUnsubscribed = () => {},
  onAudioTrackMuteStateChanged = () => {},
  onDataReceived = () => {},
  onMoved = () => {},
  onParticipantConnected = () => {},
  onParticipantDisconnected = () => {},
  onParticipantMetadataChanged = () => {},
  onParticipantAttributesChanged = () => {},
  onReconnected = () => {},
  onLocalTrackPublished = () => {},
  onLocalTrackUnpublished = () => {},
  onPublicationTiming = () => {},
  onHandlerTiming = () => {},
  onConnectionQualityChanged = () => {},
  roomInstance = null,
} = {}) {
  let convId = normalizeId(conversationId || "");
  const meId = normalizeId(localUserId || "");
  const room = roomInstance || createServerVoiceLiveKitRoom();
  const snapshot = buildInitialSnapshot({
    conversationId: convId,
    localUserId: meId,
    roomName,
    url,
    mediaMode,
    controllerId,
    joinAttemptId,
  });
  snapshot.participantsByUser[meId] = baseParticipantState(meId, room.localParticipant, { local: true });

  let bindingsActive = false;
  let disconnectRequested = false;
  // The SDK always starts unsubscribed. Preserve the call's ordinary media
  // policy while the screenshare layer owns each screen publication's intent.
  let remoteSubscriptionPolicy = () => autoSubscribe !== false;
  let publishedAudioTrack = null;
  let publishedAudioPublication = null;
  let currentMicrophoneMutePolicy = null;
  let activeMicrophonePublicationTiming = null;
  // The SDK's setAttributes also sends the current metadata. Share one lane
  // with setMetadata so an attribute update cannot send an older mirror back.
  let participantSignalWriteRunning = false;
  let participantSignalClosed = false;
  let participantSignalEpoch = 0;
  let pendingParticipantMetadata = null;
  let latestParticipantMetadata = null;
  const pendingParticipantAttributes = new Map();
  const latestParticipantAttributes = new Map();
  const activeParticipantSignalRequests = new Set();
  let deferredSnapshotTimer = null;
  let snapshotEmitCount = 0;
  const boundRoomEventHandlers = [];

  const participantPresenceRuntimeByUser = new Map();
  const remoteAudioRuntimeByUser = new Map();
  const participantRuntimeHistoryByUser = new Map();
  const PARTICIPANT_RUNTIME_FLICKER_WINDOW_MS = 8000;
  const PARTICIPANT_RUNTIME_FLICKER_EVENT_THRESHOLD = 4;

  function log(event, details = {}) {
    safeInvoke(logger, {
      event: String(event || "").trim() || "event",
      conversationId: convId,
      controllerId: snapshot.controllerId || null,
      joinAttemptId: snapshot.joinAttemptId || null,
      roomName: snapshot.roomName || null,
      connectionState: snapshot.connectionState || null,
      ...((details && typeof details === "object" && !Array.isArray(details)) ? details : { value: details ?? null }),
    });
  }

  function emitSnapshot() {
    snapshotEmitCount += 1;
    snapshot.lastUpdatedAt = nowIso();
    snapshot.local.lastUpdatedAt = nowIso();
    safeInvoke(onSnapshot, safeClone(snapshot));
  }

  function scheduleSnapshotEmit() {
    if (deferredSnapshotTimer != null) return false;
    deferredSnapshotTimer = setTimeout(() => {
      deferredSnapshotTimer = null;
      if (disconnectRequested) return;
      emitSnapshot();
    }, 0);
    return true;
  }

  function bindRoomEvent(event, handler) {
    const wrapped = (...args) => {
      const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
      const snapshotCountBefore = snapshotEmitCount;
      try {
        return handler(...args);
      } finally {
        const finishedAt = typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
        const timingEntry = {
          event: String(event || "unknown"),
          callback: "serverVoiceLiveKitController",
          durationMs: Math.max(0, finishedAt - startedAt),
          snapshotRequested: snapshotEmitCount !== snapshotCountBefore,
        };
        if (String(event) === String(RoomEvent.LocalTrackPublished)) {
          if (activeMicrophonePublicationTiming) {
            activeMicrophonePublicationTiming.localTrackPublishedHandlerMs = timingEntry.durationMs;
          }
          setTimeout(() => safeInvoke(onHandlerTiming, timingEntry), 0);
        } else {
          safeInvoke(onHandlerTiming, timingEntry);
        }
      }
    };
    boundRoomEventHandlers.push({ event, wrapped });
    room.on(event, wrapped);
  }

  function unbindRoomEvents() {
    if (deferredSnapshotTimer != null) clearTimeout(deferredSnapshotTimer);
    deferredSnapshotTimer = null;
    boundRoomEventHandlers.splice(0).forEach(({ event, wrapped }) => {
      try { room.off?.(event, wrapped); } catch (_) {}
    });
    bindingsActive = false;
  }

  function getParticipantPresenceRuntime(userId, { create = false } = {}) {
    const uid = normalizeId(userId);
    if (!uid) return null;
    let runtime = participantPresenceRuntimeByUser.get(uid) || null;
    if (!runtime && create) {
      runtime = {
        activeSids: [],
        lastSid: null,
      };
      participantPresenceRuntimeByUser.set(uid, runtime);
    }
    return runtime;
  }

  function getRemoteAudioRuntime(userId, { create = false } = {}) {
    const uid = normalizeId(userId);
    if (!uid) return null;
    let runtime = remoteAudioRuntimeByUser.get(uid) || null;
    if (!runtime && create) {
      runtime = new Map();
      remoteAudioRuntimeByUser.set(uid, runtime);
    }
    return runtime;
  }

  function getParticipantRuntimeHistory(userId, { create = false } = {}) {
    const uid = normalizeId(userId);
    if (!uid) return null;
    let history = participantRuntimeHistoryByUser.get(uid) || null;
    if (!history && create) {
      history = [];
      participantRuntimeHistoryByUser.set(uid, history);
    }
    return history;
  }

  function recordParticipantRuntimeEvent(userId, type, details = {}) {
    const uid = normalizeId(userId);
    const eventType = String(type || "").trim().toLowerCase();
    if (!uid || !eventType || uid === meId) return;
    const history = getParticipantRuntimeHistory(uid, { create: true });
    if (!history) return;
    const now = Date.now();
    const nextHistory = history
      .filter((entry) => entry && (now - Number(entry.at || 0)) <= PARTICIPANT_RUNTIME_FLICKER_WINDOW_MS)
      .concat([{
        at: now,
        type: eventType,
        ...((details && typeof details === "object" && !Array.isArray(details)) ? details : {}),
      }]);
    participantRuntimeHistoryByUser.set(uid, nextHistory);
    const recent = nextHistory.slice(-PARTICIPANT_RUNTIME_FLICKER_EVENT_THRESHOLD);
    if (recent.length < PARTICIPANT_RUNTIME_FLICKER_EVENT_THRESHOLD) return;
    const candidatePairs = [
      ["connected", "disconnected"],
      ["subscribed", "unsubscribed"],
      ["attached", "detached"],
    ];
    const matchingPair = candidatePairs.find(([left, right]) => {
      return recent.every((entry) => entry.type === left || entry.type === right);
    });
    if (!matchingPair) return;
    const alternating = recent.every((entry, index) => index === 0 || entry.type !== recent[index - 1].type);
    const uniqueTypes = new Set(recent.map((entry) => entry.type));
    if (!alternating || uniqueTypes.size < 2) return;
    log("participant.runtime_flicker_detected", {
      peerUserId: uid,
      eventPair: matchingPair,
      eventCount: nextHistory.length,
      recentEvents: recent.map((entry) => ({
        at: new Date(Number(entry.at || now)).toISOString(),
        type: entry.type,
        participantSid: entry.participantSid || null,
        trackId: entry.trackId || null,
        trackSid: entry.trackSid || null,
      })),
    });
  }

  function updateParticipantPresenceRuntime(userId, participant = null, {
    connected = null,
  } = {}) {
    const uid = normalizeId(participantUserId(userId || participant?.identity || ""));
    if (!uid) return null;
    const runtime = getParticipantPresenceRuntime(uid, { create: connected !== false });
    if (!runtime) return null;
    const participantSid = normalizeId(participant?.sid || "");
    if (participantSid) runtime.lastSid = participantSid;
    if (connected === true && participantSid) {
      runtime.activeSids = dedupeStringList([...(runtime.activeSids || []), participantSid]);
    } else if (connected === false) {
      if (participantSid) {
        runtime.activeSids = dedupeStringList((runtime.activeSids || []).filter((sid) => sid !== participantSid));
      } else {
        runtime.activeSids = [];
      }
      if (runtime.activeSids.length) {
        runtime.lastSid = runtime.activeSids[runtime.activeSids.length - 1] || runtime.lastSid;
      } else if (!participantSid) {
        runtime.lastSid = null;
      }
    } else {
      runtime.activeSids = dedupeStringList(runtime.activeSids || []);
      if (runtime.activeSids.length && !normalizeId(runtime.lastSid || "")) {
        runtime.lastSid = runtime.activeSids[runtime.activeSids.length - 1] || null;
      }
    }
    if (!runtime.activeSids.length && !runtime.lastSid && uid !== meId) {
      participantPresenceRuntimeByUser.delete(uid);
      return {
        activeSids: [],
        lastSid: null,
      };
    }
    participantPresenceRuntimeByUser.set(uid, runtime);
    return {
      activeSids: dedupeStringList(runtime.activeSids || []),
      lastSid: normalizeId(runtime.lastSid || ""),
    };
  }

  function clearRemoteParticipantPresenceRuntime() {
    Array.from(participantPresenceRuntimeByUser.keys()).forEach((uid) => {
      if (uid === meId) return;
      participantPresenceRuntimeByUser.delete(uid);
    });
  }

  function findRemoteAudioRuntimeKeys(runtime, {
    trackId = "",
    trackSid = "",
  } = {}) {
    if (!(runtime instanceof Map) || runtime.size === 0) return [];
    const normalizedTrackId = normalizeId(trackId);
    const normalizedTrackSid = normalizeId(trackSid);
    const exactKey = buildTrackRuntimeKey({
      trackId: normalizedTrackId,
      trackSid: normalizedTrackSid,
    });
    const matches = [];
    if (exactKey && runtime.has(exactKey)) matches.push(exactKey);
    runtime.forEach((record, key) => {
      if (matches.includes(key)) return;
      if (normalizedTrackSid && normalizeId(record?.trackSid || "") === normalizedTrackSid) {
        matches.push(key);
        return;
      }
      if (normalizedTrackId && normalizeId(record?.trackId || "") === normalizedTrackId) {
        matches.push(key);
      }
    });
    return matches;
  }

  function syncParticipantRemoteAudioState(userId) {
    const uid = normalizeId(userId);
    if (!uid) return null;
    const participantState = snapshot.participantsByUser[uid] || baseParticipantState(uid, null, { local: uid === meId });
    snapshot.participantsByUser[uid] = participantState;
    if (!participantState) return null;
    const runtime = getRemoteAudioRuntime(uid, { create: false });
    const records = runtime
      ? Array.from(runtime.values()).filter((record) => !!(record?.subscribed || record?.attached))
      : [];
    const attachedRecords = records.filter((record) => !!record?.attached);
    const subscribedRecords = records.filter((record) => !!record?.subscribed);
    const preferredRecord = attachedRecords[attachedRecords.length - 1]
      || subscribedRecords[subscribedRecords.length - 1]
      || records[records.length - 1]
      || null;
    participantState.audioTrackIds = dedupeStringList(records.map((record) => record?.trackId || ""));
    participantState.audioTrackSids = dedupeStringList(records.map((record) => record?.trackSid || ""));
    participantState.audioSubscriptionCount = subscribedRecords.length;
    participantState.audioAttachmentCount = attachedRecords.length;
    participantState.audioSubscribed = participantState.audioSubscriptionCount > 0;
    participantState.audioAttached = participantState.audioAttachmentCount > 0;
    participantState.audioLive = participantState.audioAttachmentCount > 0;
    participantState.audioTrackId = normalizeId(preferredRecord?.trackId || "") || null;
    participantState.audioTrackSid = normalizeId(preferredRecord?.trackSid || "") || null;
    participantState.audioMuted = preferredRecord ? !!preferredRecord.muted : false;
    participantState.lastUpdatedAt = nowIso();
    return participantState;
  }

  function upsertRemoteAudioRuntime(userId, {
    trackId = "",
    trackSid = "",
    subscribed = null,
    attached = null,
    muted = null,
  } = {}) {
    const uid = normalizeId(userId);
    if (!uid) return null;
    const runtime = getRemoteAudioRuntime(uid, { create: true });
    if (!runtime) return null;
    const matches = findRemoteAudioRuntimeKeys(runtime, { trackId, trackSid });
    const runtimeKey = matches[0] || buildTrackRuntimeKey({ trackId, trackSid });
    if (!runtimeKey) return syncParticipantRemoteAudioState(uid);
    const existing = runtime.get(runtimeKey) || {
      key: runtimeKey,
      trackId: normalizeId(trackId),
      trackSid: normalizeId(trackSid),
      subscribed: false,
      attached: false,
      muted: false,
      firstSeenAt: nowIso(),
    };
    const duplicateSameSubscription = subscribed === true && !!existing.subscribed;
    const duplicateAttachedSubscription = duplicateSameSubscription && !!existing.attached
      && (!trackId || normalizeId(existing.trackId) === normalizeId(trackId));
    const duplicateSameAttachment = attached === true && !!existing.attached;
    if (trackId) existing.trackId = normalizeId(trackId) || existing.trackId;
    if (trackSid) existing.trackSid = normalizeId(trackSid) || existing.trackSid;
    if (subscribed != null) existing.subscribed = !!subscribed;
    if (attached != null) existing.attached = !!attached;
    if (muted != null) existing.muted = !!muted;
    existing.lastUpdatedAt = nowIso();
    if (!existing.subscribed && !existing.attached) {
      runtime.delete(runtimeKey);
    } else {
      runtime.set(runtimeKey, existing);
    }
    const participantState = syncParticipantRemoteAudioState(uid);
    return {
      participantState,
      runtimeKey,
      duplicateSameSubscription,
      duplicateAttachedSubscription,
      duplicateSameAttachment,
      subscriptionCount: participantState?.audioSubscriptionCount || 0,
      attachmentCount: participantState?.audioAttachmentCount || 0,
    };
  }

  function clearRemoteAudioRuntime(userId = null) {
    const uid = normalizeId(userId);
    if (!uid) {
      Array.from(remoteAudioRuntimeByUser.keys()).forEach((remoteUid) => {
        remoteAudioRuntimeByUser.delete(remoteUid);
        syncParticipantRemoteAudioState(remoteUid);
      });
      return;
    }
    remoteAudioRuntimeByUser.delete(uid);
    syncParticipantRemoteAudioState(uid);
  }

  function removeRemoteAudioRuntime(userId, {
    trackId = "",
    trackSid = "",
    clearAll = false,
    subscribed = null,
    attached = null,
  } = {}) {
    const uid = normalizeId(userId);
    if (!uid) return null;
    const runtime = getRemoteAudioRuntime(uid, { create: false });
    if (!(runtime instanceof Map)) return syncParticipantRemoteAudioState(uid);
    if (clearAll || (!trackId && !trackSid && subscribed == null && attached == null)) {
      remoteAudioRuntimeByUser.delete(uid);
      return syncParticipantRemoteAudioState(uid);
    }
    const matches = findRemoteAudioRuntimeKeys(runtime, { trackId, trackSid });
    matches.forEach((key) => {
      const record = runtime.get(key);
      if (!record) return;
      if (subscribed != null) record.subscribed = !!subscribed;
      if (attached != null) record.attached = !!attached;
      if (!record.subscribed && !record.attached) {
        runtime.delete(key);
        return;
      }
      record.lastUpdatedAt = nowIso();
      runtime.set(key, record);
    });
    if (!runtime.size) remoteAudioRuntimeByUser.delete(uid);
    return syncParticipantRemoteAudioState(uid);
  }

  function syncParticipantPresenceState(userId, participant = null, { local = false } = {}) {
    if (!local && isNativeScreenshareCompanionIdentity(participant)) return null;
    const uid = normalizeId(participantUserId(userId || participant?.identity || ""));
    if (!uid) return null;
    const participantState = snapshot.participantsByUser[uid] || baseParticipantState(uid, participant, { local });
    const isLocalParticipant = !!(participantState.isLocal || local || uid === meId);
    const runtime = isLocalParticipant
      ? { activeSids: dedupeStringList([participant?.sid || participantState.participantSid || ""]), lastSid: normalizeId(participant?.sid || participantState.participantSid || "") }
      : (updateParticipantPresenceRuntime(uid, participant, { connected: null }) || { activeSids: [], lastSid: "" });
    const activeSids = dedupeStringList(runtime.activeSids || []);
    const nextParticipantSid = normalizeId(runtime.lastSid || participant?.sid || participantState.participantSid || "");
    participantState.participantIdentity = uid;
    participantState.participantSid = nextParticipantSid || null;
    participantState.participantSids = activeSids;
    participantState.participantSidCount = isLocalParticipant ? 1 : activeSids.length;
    participantState.presentInRoom = isLocalParticipant ? !!snapshot.connected : activeSids.length > 0;
    if (participantState.presentInRoom && !participantState.joinedAt) participantState.joinedAt = nowIso();
    participantState.lastUpdatedAt = nowIso();
    snapshot.participantsByUser[uid] = participantState;
    return participantState;
  }

  function getParticipantState(userId, participant = null, { local = false } = {}) {
    if (!local && isNativeScreenshareCompanionIdentity(participant)) return null;
    const uid = normalizeId(participantUserId(userId || participant?.identity || ""));
    if (!uid) return null;
    const existing = snapshot.participantsByUser[uid] || baseParticipantState(uid, participant, { local });
    existing.participantIdentity = uid;
    existing.displayName = String(participant?.name || existing.displayName || "").trim() || "";
    existing.metadata = String(participant?.metadata || existing.metadata || "").trim() || "";
    existing.metadataJson = safeParseJsonObject(existing.metadata);
    existing.attributes = participant?.attributes && typeof participant.attributes === "object" ? { ...participant.attributes } : (existing.attributes || {});
    existing.isLocal = !!(existing.isLocal || local);
    existing.connectionState = snapshot.connectionState || "disconnected";
    if (!existing.discoveredAt) existing.discoveredAt = nowIso();
    existing.discovered = true;
    existing.lastUpdatedAt = nowIso();
    snapshot.participantsByUser[uid] = existing;
    const participantState = syncParticipantPresenceState(uid, participant, { local: existing.isLocal });
    return syncParticipantRemoteAudioState(uid) || participantState;
  }

  function syncConnectionState(nextState) {
    const normalized = String(nextState || "").trim().toLowerCase() || "disconnected";
    snapshot.connectionState = normalized;
    snapshot.connectionStateChangedAt = nowIso();
    snapshot.connected = normalized === "connected";
    if (snapshot.connected && !snapshot.connectedAt) snapshot.connectedAt = nowIso();
    snapshot.reconnecting = normalized === "reconnecting" || normalized === "signalreconnecting";
    snapshot.local.roomConnected = snapshot.connected;
    Object.values(snapshot.participantsByUser).forEach((participantState) => {
      participantState.connectionState = normalized;
      if (participantState.isLocal) {
        participantState.presentInRoom = !!snapshot.connected;
        if (snapshot.connected && !participantState.joinedAt) participantState.joinedAt = nowIso();
      }
      if (!participantState.isLocal) {
        syncParticipantPresenceState(participantState.userId, null, { local: false });
        syncParticipantRemoteAudioState(participantState.userId);
      }
      participantState.lastUpdatedAt = nowIso();
    });
  }

  function clearRemoteAudioState() {
    clearRemoteAudioRuntime();
    clearRemoteParticipantPresenceRuntime();
    Object.values(snapshot.participantsByUser).forEach((participantState) => {
      if (participantState.isLocal) return;
      participantState.presentInRoom = false;
      participantState.participantSids = [];
      participantState.participantSidCount = 0;
      participantState.audioSubscribed = false;
      participantState.audioAttached = false;
      participantState.audioLive = false;
      participantState.audioMuted = false;
      participantState.audioTrackId = null;
      participantState.audioTrackSid = null;
      participantState.audioTrackIds = [];
      participantState.audioTrackSids = [];
      participantState.audioSubscriptionCount = 0;
      participantState.audioAttachmentCount = 0;
      participantState.speaking = false;
      participantState.lastUpdatedAt = nowIso();
    });
  }

  function setUnexpectedFailure(stage, error) {
    const details = describeErrorDetails(error);
    snapshot.lastError = {
      stage: String(stage || "unknown").trim() || "unknown",
      at: nowIso(),
      ...details,
    };
    return details;
  }

  function syncLocalParticipantPermission(reason = "sync") {
    const summary = summarizeParticipantPermission(room.localParticipant?.permissions || null);
    snapshot.local.participantPermission = summary;
    snapshot.local.participantPermissionUpdatedAt = nowIso();
    log("participant.local_permission", {
      reason: String(reason || "sync"),
      permission: summary,
    });
    return summary;
  }

  function bindRoomEvents() {
    if (bindingsActive) return;
    bindingsActive = true;

    bindRoomEvent(RoomEvent.ConnectionStateChanged, (state) => {
      syncConnectionState(state);
      log("room.connection_state", { state: snapshot.connectionState || null });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const normalizedQuality = normalizeConnectionQuality(quality);
      if (!uid) return;
      const participantState = getParticipantState(uid, participant);
      if (!participantState) return;
      participantState.connectionQuality = normalizedQuality;
      participantState.lastUpdatedAt = nowIso();
      if (participant === room.localParticipant || uid === meId) {
        snapshot.connectionQuality = normalizedQuality;
        snapshot.local.connectionQuality = normalizedQuality;
      }
      safeInvoke(onConnectionQualityChanged, {
        userId: uid,
        local: participant === room.localParticipant || uid === meId,
        quality: normalizedQuality,
      });
    });

    bindRoomEvent(RoomEvent.SignalConnected, () => {
      snapshot.signalConnectedAt = snapshot.signalConnectedAt || nowIso();
      log("room.signal_connected", {});
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.Reconnecting, () => {
      snapshot.joinPhase = "reconnecting";
      syncConnectionState("reconnecting");
      log("room.reconnecting", {});
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.Reconnected, () => {
      snapshot.joinPhase = snapshot.local.audioTrackPublished ? "media_ready" : "room_connected";
      snapshot.reconnectedAt = nowIso();
      snapshot.lastError = null;
      syncConnectionState("connected");
      syncLocalParticipantPermission("room_reconnected");
      reconcileRemoteSubscriptions(undefined, { reason: "room_reconnected" });
      log("room.reconnected", {});
      safeInvoke(onReconnected, {
        conversationId: convId,
        roomName: String(snapshot.roomName || roomName || "").trim(),
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.ParticipantPermissionsChanged, (_previousPermissions, participant) => {
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      if (participant !== room.localParticipant && uid !== meId) return;
      syncLocalParticipantPermission("permissions_changed");
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.ParticipantConnected, (participant) => {
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const participantSid = normalizeId(participant?.sid || "");
      const previousState = uid ? (snapshot.participantsByUser[uid] || null) : null;
      const previousSids = dedupeStringList(previousState?.participantSids || []);
      const presenceRuntime = updateParticipantPresenceRuntime(uid, participant, { connected: true });
      const participantState = getParticipantState(uid, participant);
      if (!participantState) return;
      participantState.lastError = null;
      const duplicateParticipantIdentity = !!(
        participantSid
        && previousSids.length
        && !previousSids.includes(participantSid)
      );
      log("participant.connected", {
        peerUserId: participantState.userId || null,
        participantSid: participantSid || null,
        participantSidCount: participantState.participantSidCount || 0,
        duplicateParticipantIdentity,
      });
      log("remote_track.expected", {
        peerUserId: participantState.userId || null,
        participantSid: participantSid || null,
        audioSubscribed: !!participantState.audioSubscribed,
      });
      recordParticipantRuntimeEvent(uid, "connected", {
        participantSid: participantSid || null,
      });
      for (const publication of participant?.trackPublications?.values?.() || []) {
        applyOrdinaryRemoteSubscription(publication, participant, { reason: "participant_connected" });
      }
      safeInvoke(onParticipantConnected, {
        conversationId: convId,
        participant,
        userId: uid,
        participantSid: participantSid || null,
      });
      if (duplicateParticipantIdentity || (presenceRuntime?.activeSids || []).length > 1) {
        log("participant.duplicate_identity_detected", {
          peerUserId: participantState.userId || null,
          participantSid: participantSid || null,
          activeParticipantSids: presenceRuntime?.activeSids || [],
          previousParticipantSids: previousSids,
        });
      }
      emitSnapshot();
    });

    // LiveKit supplies the previous metadata as the first event argument.
    bindRoomEvent(RoomEvent.ParticipantMetadataChanged, (_previousMetadata, participant) => {
      if (participantSignalClosed) return;
      if (isNativeScreenshareCompanionIdentity(participant)) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const participantState = getParticipantState(uid, participant, { local: uid === meId });
      if (participantState) {
        participantState.metadata = String(participant?.metadata || "").trim();
        participantState.metadataJson = safeParseJsonObject(participantState.metadata);
        participantState.lastUpdatedAt = nowIso();
      }
      log("participant.metadata_changed", { peerUserId: uid || null });
      safeInvoke(onParticipantMetadataChanged, {
        conversationId: convId,
        participant,
        userId: uid,
        metadata: String(participant?.metadata || "").trim(),
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.ParticipantAttributesChanged, (changedAttributes, participant) => {
      if (participantSignalClosed) return;
      if (isNativeScreenshareCompanionIdentity(participant)) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const participantState = getParticipantState(uid, participant, { local: uid === meId });
      const attributes = participant?.attributes && typeof participant.attributes === "object" ? { ...participant.attributes } : {};
      if (participantState) {
        participantState.attributes = attributes;
        participantState.lastUpdatedAt = nowIso();
      }
      log("participant.attributes_changed", {
        peerUserId: uid || null,
        changedKeys: Object.keys(changedAttributes || {}),
      });
      safeInvoke(onParticipantAttributesChanged, {
        conversationId: convId,
        participant,
        userId: uid,
        attributes,
        changedAttributes: changedAttributes || {},
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.ParticipantDisconnected, (participant) => {
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const participantSid = normalizeId(participant?.sid || "");
      const presenceRuntime = updateParticipantPresenceRuntime(uid, participant, { connected: false });
      const participantState = getParticipantState(uid, participant);
      if (!participantState) return;
      if (!participantState.presentInRoom) {
        clearRemoteAudioRuntime(uid);
      }
      participantState.lastUpdatedAt = nowIso();
      log("participant.disconnected", {
        peerUserId: participantState.userId || null,
        participantSid: participantSid || null,
        participantSidCount: participantState.participantSidCount || 0,
        remainingParticipantSids: presenceRuntime?.activeSids || [],
      });
      recordParticipantRuntimeEvent(uid, "disconnected", {
        participantSid: participantSid || null,
      });
      safeInvoke(onParticipantDisconnected, {
        conversationId: convId,
        participant,
        userId: uid,
        participantSid: participantSid || null,
        presentInRoom: !!participantState.presentInRoom,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.TrackSubscribed, handleRemoteTrackSubscribed);

    bindRoomEvent(RoomEvent.TrackPublished, (publication, participant) => {
      applyOrdinaryRemoteSubscription(publication, participant, { reason: "track_published" });
      if (isNativeScreenshareCompanionIdentity(participant)) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      getParticipantState(uid, participant);
      log("track.remote.published", {
        peerUserId: uid || null,
        trackSid: String(publication?.trackSid || "").trim() || null,
        kind: String(publication?.kind || "").trim() || null,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track?.kind !== "audio") return;
      if (isNativeScreenshareCompanionIdentity(participant)) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const mediaTrack = track?.mediaStreamTrack || null;
      const trackId = normalizeId(mediaTrack?.id || track?.sid || "");
      const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
      removeRemoteAudioRuntime(uid, {
        trackId,
        trackSid,
        subscribed: false,
        attached: false,
      });
      const participantState = getParticipantState(uid, participant);
      if (!participantState) return;
      log("track.remote.unsubscribed", {
        peerUserId: participantState.userId || null,
        trackId: trackId || null,
        trackSid: trackSid || null,
        subscriptionCount: participantState.audioSubscriptionCount || 0,
        attachmentCount: participantState.audioAttachmentCount || 0,
      });
      recordParticipantRuntimeEvent(uid, "unsubscribed", {
        trackId: trackId || null,
        trackSid: trackSid || null,
      });
      safeInvoke(onRemoteAudioTrackUnsubscribed, {
        participant,
        publication,
        track,
        mediaTrack,
        conversationId: convId,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
      const participantState = getParticipantState(participant?.identity || "", participant);
      if (participantState) {
        participantState.lastError = {
          stage: "track_remote_subscription",
          at: nowIso(),
          errorName: null,
          errorMessage: String(reason?.message || reason || "track_subscription_failed").trim() || "track_subscription_failed",
          errorStack: null,
        };
        participantState.lastUpdatedAt = nowIso();
      }
      log("track.remote.subscription_failed", {
        peerUserId: normalizeId(participantUserId(participant?.identity || "")) || null,
        trackSid: String(trackSid || "").trim() || null,
        reason: String(reason?.message || reason || "").trim() || null,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.TrackMuted, (publication, participant) => {
      if (publication?.kind !== "audio") return;
      // ScreenShareAudio has its own publication and controls. Voice state and
      // microphone ownership must never adopt its mute/publication events.
      if (normalizeLiveKitTrackSourceName(publication?.source ?? publication?.track?.source) === Track.Source.ScreenShareAudio) return;
      if (isNativeScreenshareCompanionIdentity(participant)) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      if (uid && uid !== meId) {
        upsertRemoteAudioRuntime(uid, {
          trackSid: publication?.trackSid || "",
          muted: true,
        });
      }
      const participantState = getParticipantState(uid, participant, {
        local: uid === meId,
      });
      if (!participantState) return;
      if (uid === meId) {
        snapshot.local.micMuted = true;
        snapshot.local.lastUpdatedAt = nowIso();
      }
      participantState.audioMuted = true;
      participantState.lastUpdatedAt = nowIso();
      safeInvoke(onAudioTrackMuteStateChanged, {
        conversationId: convId,
        participant,
        publication,
        userId: uid,
        muted: true,
        local: uid === meId,
        trackSid: String(publication?.trackSid || "").trim() || null,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (publication?.kind !== "audio") return;
      // ScreenShareAudio has its own publication and controls. Voice state and
      // microphone ownership must never adopt its mute/publication events.
      if (normalizeLiveKitTrackSourceName(publication?.source ?? publication?.track?.source) === Track.Source.ScreenShareAudio) return;
      if (isNativeScreenshareCompanionIdentity(participant)) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      // LiveKit emits this synchronously when it enables the media track.
      // Reassert the canonical restriction before an old SDK completion escapes.
      if (uid === meId && (disconnectRequested || currentMicrophoneMutePolicy?.())) {
        for (const track of [publishedAudioTrack, publication?.track?.mediaStreamTrack, publication?.track?.sender?.track]) {
          if (track && "enabled" in track) track.enabled = false;
        }
        return;
      }
      if (uid && uid !== meId) {
        upsertRemoteAudioRuntime(uid, {
          trackSid: publication?.trackSid || "",
          muted: false,
        });
      }
      const participantState = getParticipantState(uid, participant, {
        local: uid === meId,
      });
      if (!participantState) return;
      if (uid === meId) {
        snapshot.local.micMuted = false;
        snapshot.local.lastUpdatedAt = nowIso();
      }
      participantState.audioMuted = false;
      participantState.lastUpdatedAt = nowIso();
      safeInvoke(onAudioTrackMuteStateChanged, {
        conversationId: convId,
        participant,
        publication,
        userId: uid,
        muted: false,
        local: uid === meId,
        trackSid: String(publication?.trackSid || "").trim() || null,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.LocalTrackPublished, (publication, participant) => {
      if (publication?.kind !== "audio") return;
      // ScreenShareAudio has its own publication and controls. Voice state and
      // microphone ownership must never adopt its mute/publication events.
      if (normalizeLiveKitTrackSourceName(publication?.source ?? publication?.track?.source) === Track.Source.ScreenShareAudio) return;
      if (activeMicrophonePublicationTiming && !activeMicrophonePublicationTiming.localTrackPublishedEventAt) {
        activeMicrophonePublicationTiming.localTrackPublishedEventAt = monotonicNow();
      }
      publishedAudioPublication = publication || publishedAudioPublication;
      const participantState = getParticipantState(meId, participant, { local: true });
      if (!participantState) return;
      snapshot.local.audioTrackPublished = true;
      snapshot.local.audioTrackPublishedAt = nowIso();
      snapshot.local.mediaReady = true;
      snapshot.local.audioTrackSid = String(publication?.trackSid || snapshot.local.audioTrackSid || "").trim() || null;
      snapshot.joinPhase = "media_ready";
      participantState.audioSubscribed = true;
      participantState.audioAttached = true;
      participantState.audioLive = true;
      participantState.audioTrackSid = snapshot.local.audioTrackSid;
      participantState.audioMuted = !!snapshot.local.micMuted;
      participantState.lastUpdatedAt = nowIso();
      log("track.local.published", {
        trackId: snapshot.local.audioTrackId || null,
        trackSid: snapshot.local.audioTrackSid || null,
        micMuted: !!snapshot.local.micMuted,
        deafened: !!snapshot.local.deafened,
        inputDeviceId: snapshot.local.inputDeviceId || "default",
        outputDeviceId: snapshot.local.outputDeviceId || "default",
      });
      safeInvoke(onLocalTrackPublished, {
        conversationId: convId,
        participant,
        publication,
        trackSid: snapshot.local.audioTrackSid,
      });
      scheduleSnapshotEmit();
    });

    bindRoomEvent(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
      if (normalizeLiveKitTrackSourceName(publication?.source ?? publication?.track?.source) !== Track.Source.Microphone) return;
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      if (participant !== room.localParticipant && uid !== meId) return;
      const trackSid = String(publication?.trackSid || "").trim();
      const currentSid = String(snapshot.local.audioTrackSid || publishedAudioPublication?.trackSid || "").trim();
      // A delayed unpublish for an older microphone must not erase its replacement.
      if (currentSid && trackSid && currentSid !== trackSid) return;
      if (publishedAudioPublication !== publication && (!trackSid || trackSid !== currentSid)) return;
      if (!publishedAudioPublication && !snapshot.local.audioTrackPublished) return;
      clearLocalMicrophonePublication();
      // Permission restoration does not republish in the SDK. The app owns any
      // authorized reacquisition; this controller only invalidates stale media.
      log("track.local.unpublished", { reason: "sdk_local_track_unpublished", trackSid: trackSid || null });
      safeInvoke(onLocalTrackUnpublished, { conversationId: convId, participant, publication, trackSid: trackSid || null });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.ActiveSpeakersChanged, (participants) => {
      const activeSpeakerIds = new Set(
        (Array.isArray(participants) ? participants : [])
          .map((participant) => normalizeId(participantUserId(participant?.identity || "")))
          .filter(Boolean),
      );
      Object.values(snapshot.participantsByUser).forEach((participantState) => {
        const nextSpeaking = activeSpeakerIds.has(participantState.userId);
        if (participantState.speaking === nextSpeaking) return;
        participantState.speaking = nextSpeaking;
        participantState.lastUpdatedAt = nowIso();
        log("participant.speaking", {
          peerUserId: participantState.userId || null,
          local: !!participantState.isLocal,
          speaking: nextSpeaking,
        });
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
      safeInvoke(onDataReceived, {
        payload,
        participant,
        kind,
        topic,
        conversationId: convId,
      });
    });

    bindRoomEvent(RoomEvent.Moved, (roomName, token) => {
      const nextRoomName = String(roomName || "").trim();
      if (nextRoomName) snapshot.roomName = nextRoomName;
      snapshot.joinPhase = "room_moved";
      snapshot.lastError = null;
      log("room.moved", {
        roomName: nextRoomName || null,
      });
      safeInvoke(onMoved, {
        conversationId: convId,
        roomName: nextRoomName,
        token: String(token || "").trim() || null,
      });
      emitSnapshot();
    });

    bindRoomEvent(RoomEvent.Disconnected, (reason) => {
      cancelParticipantSignalWrites();
      const disconnectReasonCode = Number.isFinite(Number(reason)) ? Number(reason) : null;
      const disconnectReasonName = disconnectReasonCode == null
        ? String(reason || "room_disconnected").trim() || "room_disconnected"
        : (
          Object.entries(DisconnectReason)
            .find(([, value]) => Number(value) === disconnectReasonCode)?.[0]
          || String(disconnectReasonCode)
        );
      syncConnectionState("disconnected");
      snapshot.disconnectedAt = nowIso();
      snapshot.joinPhase = disconnectRequested ? "disconnected" : "disconnected_unexpected";
      snapshot.connected = false;
      snapshot.reconnecting = false;
      snapshot.disconnectRequested = !!disconnectRequested;
      snapshot.local.roomConnected = false;
      snapshot.local.audioTrackPublished = false;
      snapshot.local.mediaReady = false;
      snapshot.lastDisconnect = {
        at: nowIso(),
        reason: disconnectReasonName,
        reasonCode: disconnectReasonCode,
        requested: !!disconnectRequested,
      };
      clearRemoteAudioState();
      if (!disconnectRequested) {
        setUnexpectedFailure("room_disconnected", new Error(disconnectReasonName));
      }
      log("room.disconnected", {
        reason: snapshot.lastDisconnect?.reason || null,
        requested: !!disconnectRequested,
        joinPhase: snapshot.joinPhase || null,
        roomConnected: !!snapshot.local.roomConnected,
        localTrackPublished: !!snapshot.local.audioTrackPublished,
      });
      emitSnapshot();
      if (!disconnectRequested) {
        safeInvoke(onError, Object.assign(new Error(snapshot.lastDisconnect?.reason || "room_disconnected"), {
          stage: "room_disconnected",
          requested: false,
          reason: snapshot.lastDisconnect?.reason || "room_disconnected",
          disconnectReasonCode,
          disconnectReasonName,
        }));
      }
    });
  }

  async function prepareConnection() {
    if (typeof room.prepareConnection !== "function") {
      return { supported: false, prepared: false, reason: "sdk_prepare_connection_unavailable" };
    }
    const startedAt = Date.now();
    try {
      await room.prepareConnection(url, token);
      return { supported: true, prepared: true, startedAt, finishedAt: Date.now(), reason: "prepared" };
    } catch (_) {
      return { supported: true, prepared: false, startedAt, finishedAt: Date.now(), reason: "prepare_failed" };
    }
  }

  async function connect() {
    if (!convId || !meId || !url || !token) {
      throw new Error("Missing LiveKit connection parameters.");
    }
    bindRoomEvents();
    participantSignalClosed = false;
    disconnectRequested = false;
    snapshot.disconnectRequested = false;
    snapshot.lastError = null;
    snapshot.joinPhase = "room_connecting";
    snapshot.roomConnectStartedAt = nowIso();
    snapshot.lastDisconnect = null;
    syncConnectionState("connecting");
    log("room.connect_started", {});
    emitSnapshot();
    try {
      serverVoiceMoveDiagnostics.count("connect");
      await room.connect(url, token, {
        autoSubscribe: false,
        maxRetries: 3,
      });
      snapshot.roomConnectResolvedAt = nowIso();
    } catch (error) {
      const details = setUnexpectedFailure("room_connect", error);
      snapshot.joinPhase = "room_connect_failed";
      syncConnectionState("disconnected");
      log("room.connect_failed", details);
      emitSnapshot();
      throw error;
    }
    snapshot.lastError = null;
    snapshot.joinPhase = "room_connected";
    syncConnectionState(room.state || "connected");
    snapshot.local.roomConnected = true;
    syncLocalParticipantPermission("room_connected");
    getParticipantState(meId, room.localParticipant, { local: true });
    room.remoteParticipants.forEach((participant) => {
      updateParticipantPresenceRuntime(participant?.identity || "", participant, { connected: true });
      getParticipantState(participant?.identity || "", participant);
    });
    reconcileRemoteSubscriptions(undefined, { reason: "room_connected" });
    log("room.connected", {
      remoteParticipantCount: room.remoteParticipants.size,
    });
    emitSnapshot();
    return room;
  }

  function clearLocalMicrophonePublication() {
    publishedAudioTrack = null;
    publishedAudioPublication = null;
    snapshot.local.audioTrackPublished = false;
    snapshot.local.audioTrackSid = null;
    snapshot.local.audioTrackId = null;
    snapshot.local.mediaReady = false;
    snapshot.joinPhase = snapshot.connected ? "listen_only" : snapshot.joinPhase;
    const participantState = getParticipantState(meId, room.localParticipant, { local: true });
    if (participantState) {
      participantState.audioTrackId = null;
      participantState.audioTrackSid = null;
      participantState.audioSubscribed = false;
      participantState.audioLive = false;
      participantState.audioAttached = false;
      participantState.lastUpdatedAt = nowIso();
    }
  }

  function getLiveMicrophonePublication() {
    if (disconnectRequested) return null;
    const publication = room.localParticipant?.getTrackPublication?.(Track.Source.Microphone) || null;
    const mediaTrack = publication?.track?.mediaStreamTrack;
    return mediaTrack?.kind === "audio" && mediaTrack.readyState === "live" ? publication : null;
  }

  function hasLiveMicrophonePublication() {
    const publication = getLiveMicrophonePublication();
    // A permission update cannot recreate a publication removed by the SFU.
    // Inspect the SDK track instead of trusting a flag left by an older event.
    if (!publication) {
      if (snapshot.local.audioTrackPublished || publishedAudioPublication) clearLocalMicrophonePublication();
      return false;
    }
    publishedAudioPublication = publication;
    publishedAudioTrack = publication.track.mediaStreamTrack;
    snapshot.local.audioTrackPublished = true;
    snapshot.local.audioTrackSid = String(publication.trackSid || "").trim() || null;
    snapshot.local.audioTrackId = String(publishedAudioTrack.id || "").trim() || null;
    snapshot.local.mediaReady = true;
    return true;
  }

  async function publishMicrophone(track, {
    micMuted = false,
    deafened = false,
    inputDeviceId = "default",
    outputDeviceId = "default",
  } = {}) {
    if (!track) throw new Error("Missing microphone track.");
    if (disconnectRequested || track.readyState === "ended") throw new Error("Microphone track is no longer available.");
    const publicationTiming = {
      wrapperStartedAt: monotonicNow(),
      sdkInvocationAt: 0,
      sdkPromiseDoneAt: 0,
      wrapperDoneAt: 0,
      localTrackPublishedEventAt: 0,
      localTrackPublishedHandlerMs: null,
      muteStateSyncStartedAt: 0,
      muteStateSyncDoneAt: 0,
      inputTrackReused: true,
      existingPublicationReused: false,
      result: "pending",
    };
    const reportPublicationTiming = () => {
      publicationTiming.wrapperDoneAt = publicationTiming.wrapperDoneAt || monotonicNow();
      safeInvoke(onPublicationTiming, {
        wrapperMs: Math.max(0, publicationTiming.wrapperDoneAt - publicationTiming.wrapperStartedAt),
        preSdkMs: publicationTiming.sdkInvocationAt
          ? Math.max(0, publicationTiming.sdkInvocationAt - publicationTiming.wrapperStartedAt)
          : null,
        sdkPublishMs: publicationTiming.sdkPromiseDoneAt && publicationTiming.sdkInvocationAt
          ? Math.max(0, publicationTiming.sdkPromiseDoneAt - publicationTiming.sdkInvocationAt)
          : null,
        localTrackPublishedEventOffsetMs: publicationTiming.localTrackPublishedEventAt && publicationTiming.sdkInvocationAt
          ? Math.max(0, publicationTiming.localTrackPublishedEventAt - publicationTiming.sdkInvocationAt)
          : null,
        localTrackPublishedHandlerMs: publicationTiming.localTrackPublishedHandlerMs,
        postSdkMs: publicationTiming.sdkPromiseDoneAt
          ? Math.max(0, publicationTiming.wrapperDoneAt - publicationTiming.sdkPromiseDoneAt)
          : null,
        muteStateSyncMs: publicationTiming.muteStateSyncDoneAt && publicationTiming.muteStateSyncStartedAt
          ? Math.max(0, publicationTiming.muteStateSyncDoneAt - publicationTiming.muteStateSyncStartedAt)
          : null,
        inputTrackReused: publicationTiming.inputTrackReused === true,
        existingPublicationReused: publicationTiming.existingPublicationReused === true,
        result: publicationTiming.result,
      });
    };
    const previousPublication = room.localParticipant?.getTrackPublication?.(Track.Source.Microphone) || null;
    const previousTrack = previousPublication?.track?.mediaStreamTrack || publishedAudioTrack;
    const existingPublicationLive = hasLiveMicrophonePublication();
    snapshot.local.audioTrackCreated = true;
    snapshot.local.audioTrackCreatedAt = snapshot.local.audioTrackCreatedAt || nowIso();
    snapshot.local.audioTrackId = String(track.id || "").trim() || null;
    snapshot.local.micMuted = !!micMuted;
    snapshot.local.deafened = !!deafened;
    snapshot.local.inputDeviceId = String(inputDeviceId || "default").trim() || "default";
    snapshot.local.outputDeviceId = String(outputDeviceId || "default").trim() || "default";
    snapshot.joinPhase = snapshot.connected ? "publishing_audio" : snapshot.joinPhase;
    const participantState = getParticipantState(meId, room.localParticipant, { local: true });
    if (participantState) {
      participantState.audioTrackId = snapshot.local.audioTrackId;
      participantState.audioMuted = !!micMuted;
      participantState.lastUpdatedAt = nowIso();
    }
    if (
      previousTrack
      && previousTrack === track
      && existingPublicationLive
    ) {
      publicationTiming.existingPublicationReused = true;
      publicationTiming.result = "reused";
      reportPublicationTiming();
      return null;
    }

    if (previousTrack && previousTrack !== track) {
      try {
        await room.localParticipant.unpublishTrack(previousTrack, false);
      } catch (error) {
        log("track.local.unpublish_failed", {
          ...describeErrorDetails(error),
          trackId: String(previousTrack?.id || "").trim() || null,
        });
      }
    }

    let publication = null;
    publishedAudioTrack = track;
    snapshot.lastError = null;
    publicationTiming.sdkInvocationAt = monotonicNow();
    activeMicrophonePublicationTiming = publicationTiming;
    try {
      serverVoiceMoveDiagnostics.count("micPublish");
      publication = await room.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
        stopOnMute: false,
        dtx: false,
      });
      publicationTiming.sdkPromiseDoneAt = monotonicNow();
    } catch (error) {
      publicationTiming.sdkPromiseDoneAt = monotonicNow();
      publicationTiming.result = "failed";
      const details = setUnexpectedFailure("track_local_publish", error);
      snapshot.joinPhase = "publish_audio_failed";
      log("track.local.publish_failed", {
        ...details,
        trackId: snapshot.local.audioTrackId || null,
      });
      emitSnapshot();
      activeMicrophonePublicationTiming = null;
      reportPublicationTiming();
      throw error;
    }
    activeMicrophonePublicationTiming = null;
    if (disconnectRequested) {
      // A completion from a retired controller must never revive its media.
      track.enabled = false;
      try { await room.localParticipant.unpublishTrack(track, true); }
      finally { try { track.stop?.(); } catch (_) {} }
      clearLocalMicrophonePublication();
      publicationTiming.result = "superseded";
      reportPublicationTiming();
      return null;
    }
    if (getLiveMicrophonePublication() !== publication) {
      track.enabled = false;
      hasLiveMicrophonePublication();
      publicationTiming.result = "unpublished";
      reportPublicationTiming();
      throw Object.assign(new Error("Microphone publication is no longer available."), { code: "server_voice_microphone_publication_lost" });
    }
    publishedAudioPublication = publication || null;

    snapshot.local.audioTrackPublished = true;
    snapshot.local.audioTrackPublishedAt = nowIso();
    snapshot.local.mediaReady = true;
    snapshot.local.audioTrackSid = String(publication?.trackSid || "").trim() || null;
    snapshot.lastError = null;
    snapshot.joinPhase = "media_ready";
    if (participantState) {
      participantState.audioSubscribed = true;
      participantState.audioAttached = true;
      participantState.audioLive = true;
      participantState.audioTrackSid = snapshot.local.audioTrackSid;
      participantState.audioMuted = !!micMuted;
      participantState.lastUpdatedAt = nowIso();
    }
    publicationTiming.muteStateSyncStartedAt = monotonicNow();
    try {
      await setMicrophoneMuted(typeof currentMicrophoneMutePolicy === "function" ? !!currentMicrophoneMutePolicy() : !!micMuted, {
        reason: "publish_microphone",
        snapshotMode: "deferred",
        getEffectiveMuted: currentMicrophoneMutePolicy,
      });
      publicationTiming.muteStateSyncDoneAt = monotonicNow();
    } catch (error) {
      publicationTiming.muteStateSyncDoneAt = monotonicNow();
      publicationTiming.result = "mute_state_failed";
      reportPublicationTiming();
      throw error;
    }
    if (!hasLiveMicrophonePublication() || publishedAudioPublication !== publication) {
      track.enabled = false;
      publicationTiming.result = "unpublished";
      reportPublicationTiming();
      throw Object.assign(new Error("Microphone publication is no longer available."), { code: "server_voice_microphone_publication_lost" });
    }
    publicationTiming.result = "published";
    reportPublicationTiming();
    return publication;
  }

  async function unpublishMicrophone({
    stopTrack = true,
    reason = "permission_revoked",
    clearRecoverableError = false,
  } = {}) {
    const track = publishedAudioTrack;
    if (track) {
      try {
        await room.localParticipant.unpublishTrack(track, !!stopTrack);
      } catch (error) {
        log("track.local.unpublish_failed", {
          ...describeErrorDetails(error),
          trackId: String(track?.id || "").trim() || null,
          reason: String(reason || "permission_revoked"),
        });
        throw error;
      }
      if (stopTrack) {
        try { track.stop?.(); } catch (_) {}
      }
    }
    publishedAudioTrack = null;
    publishedAudioPublication = null;
    snapshot.local.audioTrackPublished = false;
    snapshot.local.audioTrackSid = null;
    snapshot.local.audioTrackId = null;
    snapshot.local.mediaReady = false;
    snapshot.joinPhase = snapshot.connected ? "listen_only" : snapshot.joinPhase;
    if (clearRecoverableError && snapshot.connected) snapshot.lastError = null;
    const participantState = getParticipantState(meId, room.localParticipant, { local: true });
    if (participantState) {
      participantState.audioTrackId = null;
      participantState.audioTrackSid = null;
      participantState.audioLive = false;
      participantState.audioAttached = false;
      participantState.lastUpdatedAt = nowIso();
    }
    log("track.local.unpublished", {
      reason: String(reason || "permission_revoked"),
      stopTrack: !!stopTrack,
      clearRecoverableError: !!clearRecoverableError,
    });
    emitSnapshot();
    return true;
  }

  function settleParticipantSignalRequest(request, result, error = null) {
    if (request.settled) return;
    request.settled = true;
    if (error) request.reject(error);
    else request.resolve(result);
  }

  function ownsParticipantSignalRequest(request) {
    return !disconnectRequested && !participantSignalClosed && request.epoch === participantSignalEpoch && !!safeInvoke(request.isCurrent);
  }

  function isLatestParticipantSignalEntry(entry) {
    return ownsParticipantSignalRequest(entry.request) && (entry.key == null
      ? latestParticipantMetadata === entry
      : latestParticipantAttributes.get(entry.key) === entry);
  }

  async function drainParticipantSignalWrites() {
    if (participantSignalWriteRunning) return;
    participantSignalWriteRunning = true;
    try {
      while (!disconnectRequested && (pendingParticipantMetadata || pendingParticipantAttributes.size)) {
        const metadataEntry = pendingParticipantMetadata;
        const entries = metadataEntry ? [metadataEntry] : [...pendingParticipantAttributes.values()];
        if (metadataEntry) pendingParticipantMetadata = null;
        else pendingParticipantAttributes.clear();
        const currentEntries = entries.filter(isLatestParticipantSignalEntry);
        const requests = new Set(entries.map((entry) => entry.request));
        requests.forEach((request) => activeParticipantSignalRequests.add(request));
        let failure = null;
        try {
          if (currentEntries.length) {
            if (metadataEntry) {
              if (room.localParticipant.metadata !== metadataEntry.value) {
                await room.localParticipant.setMetadata(metadataEntry.value);
              }
            } else {
              const attributes = Object.fromEntries(currentEntries.map((entry) => [entry.key, entry.value]));
              const needsUpdate = currentEntries.some(({ key, value }) => value === ""
                ? !!room.localParticipant.attributes?.[key]
                : room.localParticipant.attributes?.[key] !== value);
              if (needsUpdate) await room.localParticipant.setAttributes(attributes);
            }
            // A newer request or leave may have superseded this SDK promise.
            // Do not project a stale completion over the current snapshot.
            if (currentEntries.every(isLatestParticipantSignalEntry)) {
              const participantState = getParticipantState(meId, room.localParticipant, { local: true });
              if (participantState) {
                if (metadataEntry) {
                  participantState.metadata = metadataEntry.value;
                  participantState.metadataJson = safeParseJsonObject(metadataEntry.value);
                } else {
                  const attributes = { ...(participantState.attributes || {}) };
                  currentEntries.forEach(({ key, value }) => {
                    if (value === "") delete attributes[key];
                    else attributes[key] = value;
                  });
                  participantState.attributes = attributes;
                }
                participantState.lastUpdatedAt = nowIso();
              }
              emitSnapshot();
            }
          }
        } catch (error) {
          failure = error;
        }
        requests.forEach((request) => {
          const owned = entries.filter((entry) => entry.request === request).every(isLatestParticipantSignalEntry);
          settleParticipantSignalRequest(request, owned && currentEntries.length > 0, owned ? failure : null);
          activeParticipantSignalRequests.delete(request);
        });
        entries.forEach((entry) => {
          if (entry.key == null && latestParticipantMetadata === entry) latestParticipantMetadata = null;
          else if (entry.key != null && latestParticipantAttributes.get(entry.key) === entry) latestParticipantAttributes.delete(entry.key);
        });
      }
    } finally {
      participantSignalWriteRunning = false;
    }
  }

  function enqueueParticipantSignalWrite(values, { isCurrent, metadata = false }) {
    if (disconnectRequested || participantSignalClosed || !safeInvoke(isCurrent)) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const request = { isCurrent, epoch: participantSignalEpoch, resolve, reject, settled: false };
      if (metadata) {
        if (latestParticipantMetadata) settleParticipantSignalRequest(latestParticipantMetadata.request, false);
        const entry = { key: null, value: values, request };
        pendingParticipantMetadata = entry;
        latestParticipantMetadata = entry;
      } else {
        const pairs = Object.entries(values || {});
        if (!pairs.length) { settleParticipantSignalRequest(request, true); return; }
        pairs.forEach(([key, value]) => {
          const previous = latestParticipantAttributes.get(key);
          if (previous) settleParticipantSignalRequest(previous.request, false);
          const entry = { key, value: String(value ?? ""), request };
          pendingParticipantAttributes.set(key, entry);
          latestParticipantAttributes.set(key, entry);
        });
      }
      // Pending storage is one metadata value and one entry per attribute key,
      // never a request queue. Media-track mute runs independently of this lane.
      void drainParticipantSignalWrites();
    });
  }

  function cancelParticipantSignalWrites() {
    participantSignalClosed = true;
    participantSignalEpoch += 1;
    if (latestParticipantMetadata) settleParticipantSignalRequest(latestParticipantMetadata.request, false);
    latestParticipantAttributes.forEach(({ request }) => settleParticipantSignalRequest(request, false));
    activeParticipantSignalRequests.forEach((request) => settleParticipantSignalRequest(request, false));
    pendingParticipantMetadata = null;
    latestParticipantMetadata = null;
    pendingParticipantAttributes.clear();
    latestParticipantAttributes.clear();
  }

  async function updateLocalParticipantMetadata(metadata = {}, { isCurrent = () => true } = {}) {
    if (typeof room.localParticipant?.setMetadata !== "function") return false;
    const raw = typeof metadata === "string" ? metadata : JSON.stringify(metadata || {});
    return enqueueParticipantSignalWrite(raw, { isCurrent, metadata: true });
  }

  async function updateLocalParticipantAttributes(attributes = {}, { isCurrent = () => true } = {}) {
    if (typeof room.localParticipant?.setAttributes !== "function") return false;
    return enqueueParticipantSignalWrite(attributes, { isCurrent });
  }

  async function setMicrophoneMuted(muted = false, {
    reason = "local_control",
    snapshotMode = "immediate",
    isCurrent = () => true,
    getEffectiveMuted = null,
  } = {}) {
    if (typeof getEffectiveMuted === "function") currentMicrophoneMutePolicy = getEffectiveMuted;
    if (disconnectRequested || !isCurrent()) return false;
    const nextMuted = !!muted;
    const publication = hasLiveMicrophonePublication() ? publishedAudioPublication : null;
    const publicationTrack = publication?.track || null;
    const enforceCurrentMute = () => {
      const restricted = disconnectRequested || (typeof getEffectiveMuted === "function" && getEffectiveMuted());
      if (nextMuted || restricted) {
        for (const track of [publishedAudioTrack, publicationTrack?.mediaStreamTrack, publicationTrack?.sender?.track]) {
          if (track && "enabled" in track) track.enabled = false;
        }
      }
      return !!restricted;
    };
    if (!nextMuted && enforceCurrentMute()) return false;
    enforceCurrentMute();
    let usedLiveKitMute = false;
    try {
      if (publication) {
        const method = nextMuted ? "mute" : "unmute";
        const currentMuted = typeof publication?.isMuted === "boolean"
          ? publication.isMuted
          : (typeof publicationTrack?.isMuted === "boolean" ? publicationTrack.isMuted : null);
        if (currentMuted === nextMuted) {
          usedLiveKitMute = true;
        } else if (typeof publication[method] === "function") {
          await publication[method]();
          usedLiveKitMute = true;
        } else if (typeof publicationTrack?.[method] === "function") {
          await publicationTrack[method]();
          usedLiveKitMute = true;
        }
      }
      if (!usedLiveKitMute && publishedAudioTrack && "enabled" in publishedAudioTrack) {
        publishedAudioTrack.enabled = !nextMuted;
      }
    } finally {
      enforceCurrentMute();
    }
    if (disconnectRequested || !isCurrent()
      || (typeof getEffectiveMuted === "function" && !!getEffectiveMuted() !== nextMuted)) return false;
    snapshot.local.micMuted = nextMuted;
    snapshot.local.lastUpdatedAt = nowIso();
    const participantState = getParticipantState(meId, room.localParticipant, { local: true });
    if (participantState) {
      participantState.audioMuted = nextMuted;
      participantState.lastUpdatedAt = nowIso();
    }
    log("track.local.mute_state_applied", {
      muted: nextMuted,
      reason: String(reason || "local_control").trim() || "local_control",
      publicationAvailable: !!publication,
      usedLiveKitMute,
    });
    if (snapshotMode === "deferred") scheduleSnapshotEmit();
    else emitSnapshot();
    return true;
  }

  function handleRemoteTrackSubscribed(track, publication, participant) {
    const source = normalizeLiveKitTrackSourceName(publication?.source ?? track?.source);
    if (source === Track.Source.ScreenShare) return;
    const ordinaryAllowed = !isNativeScreenshareCompanionIdentity(participant)
      && !!safeInvoke(remoteSubscriptionPolicy, { participant, userId: normalizeId(participantUserId(participant?.identity || "")) });
    const allowed = !disconnectRequested && (source === Track.Source.ScreenShareAudio
      ? ordinaryAllowed && safeInvoke(shouldReceiveScreenShareAudio, { publication, participant }) === true
      : ordinaryAllowed);
    if (!allowed) {
      rejectRemoteTrackSubscription(track, publication, participant);
      return;
    }
    if (track?.kind !== "audio") return;
    const uid = normalizeId(participantUserId(participant?.identity || ""));
    updateParticipantPresenceRuntime(uid, participant, { connected: true });
    const mediaTrack = track?.mediaStreamTrack || null;
    const trackId = normalizeId(mediaTrack?.id || track?.sid || "");
    const trackSid = normalizeId(publication?.trackSid || track?.sid || "");
    const runtimeState = upsertRemoteAudioRuntime(uid, {
      trackId,
      trackSid,
      subscribed: true,
      muted: !!publication?.isMuted,
    });
    const participantState = getParticipantState(uid, participant);
    if (!participantState) return;
    participantState.lastError = null;
    log("track.remote.subscribed", {
      peerUserId: participantState.userId || null,
      trackId: participantState.audioTrackId || null,
      trackSid: participantState.audioTrackSid || null,
      muted: !!participantState.audioMuted,
      subscriptionCount: participantState.audioSubscriptionCount || 0,
      duplicateSameTrack: !!runtimeState?.duplicateSameSubscription,
      duplicateActiveSubscriptions: (participantState.audioSubscriptionCount || 0) > 1,
    });
    recordParticipantRuntimeEvent(uid, "subscribed", {
      trackId: trackId || null,
      trackSid: trackSid || null,
    });
    if (runtimeState?.duplicateSameSubscription
        && (source !== Track.Source.ScreenShareAudio || runtimeState?.duplicateAttachedSubscription)) {
      emitSnapshot();
      return;
    }
    if ((participantState.audioSubscriptionCount || 0) > 1) {
      log("track.remote.duplicate_subscription_detected", {
        peerUserId: participantState.userId || null,
        trackId: trackId || null,
        trackSid: trackSid || null,
        subscriptionCount: participantState.audioSubscriptionCount || 0,
        activeTrackIds: participantState.audioTrackIds || [],
        activeTrackSids: participantState.audioTrackSids || [],
      });
    }
    safeInvoke(onRemoteAudioTrackSubscribed, {
      participant,
      publication,
      track,
      mediaTrack,
      conversationId: convId,
    });
    emitSnapshot();
  return true;
  }

  function isScreenPublication(publication) {
    const source = normalizeLiveKitTrackSourceName(publication?.source ?? publication?.track?.source);
    return source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio;
  }

  function reconcileRemoteScreenShareAudio({ reason = "viewer_watch" } = {}) {
    if (disconnectRequested) return 0;
    let replayed = 0;
    room.remoteParticipants.forEach((participant) => {
      if (room.remoteParticipants.get(participant?.identity) !== participant) return;
      for (const publication of participant?.trackPublications?.values?.() || []) {
        if (participant.trackPublications.get(publication?.trackSid) !== publication
          || normalizeLiveKitTrackSourceName(publication?.source) !== Track.Source.ScreenShareAudio
          || publication.isDesired === false) continue;
        const track = publication.track;
        if (track?.kind !== "audio" || track.mediaStreamTrack?.readyState === "ended") continue;
        if (handleRemoteTrackSubscribed(track, publication, participant) === true) replayed += 1;
      }
    });
    if (replayed) log("track.screen_audio.retained_reconciled", { reason, replayed });
    return replayed;
  }

  function rejectRemoteTrackSubscription(track, publication, participant) {
    try { publication?.setSubscribed?.(false); } catch (_) {}
    try { track?.detach?.(); } catch (_) {}
    if (track?.kind !== "audio") return;
    const mediaTrack = track?.mediaStreamTrack || null;
    removeRemoteAudioRuntime(participant?.identity || "", {
      trackId: normalizeId(mediaTrack?.id || track?.sid || ""),
      trackSid: normalizeId(publication?.trackSid || track?.sid || ""),
      subscribed: false,
      attached: false,
    });
    safeInvoke(onRemoteAudioTrackUnsubscribed, { participant, publication, track, mediaTrack, conversationId: convId });
  }

  function applyOrdinaryRemoteSubscription(publication, participant, { reason = "" } = {}) {
    // Never override the screenshare layer's current per-publication decision.
    if (isScreenPublication(publication)) return { skipped: true };
    if (!publication || typeof publication.setSubscribed !== "function") return { unsupported: true };
    const uid = normalizeId(participantUserId(participant?.identity || ""));
    const subscribe = !disconnectRequested && !isNativeScreenshareCompanionIdentity(participant)
      && !!safeInvoke(remoteSubscriptionPolicy, { participant, userId: uid });
    try {
      publication.setSubscribed(subscribe);
      if (!subscribe && publication.track) rejectRemoteTrackSubscription(publication.track, publication, participant);
      return { changed: true, subscribe };
    } catch (error) {
      log("track.subscription_update_failed", {
        peerUserId: uid || null,
        subscribe,
        reason,
        errorMessage: String(error?.message || error || "unknown"),
      });
      return { changed: false, subscribe };
    }
  }

  function reconcileRemoteSubscriptions(shouldSubscribe, { reason = "" } = {}) {
    if (typeof shouldSubscribe === "function") remoteSubscriptionPolicy = shouldSubscribe;
    const result = { subscribedUserIds: [], unsubscribedUserIds: [], changed: 0, unsupported: 0 };
    room.remoteParticipants.forEach((participant) => {
      const uid = normalizeId(participantUserId(participant?.identity || ""));
      const subscribe = !disconnectRequested && !isNativeScreenshareCompanionIdentity(participant)
        && !!safeInvoke(remoteSubscriptionPolicy, { participant, userId: uid });
      const publications = participant?.trackPublications instanceof Map
        ? Array.from(participant.trackPublications.values())
        : Array.from(participant?.trackPublications || []);
      publications.forEach((publication) => {
        const update = applyOrdinaryRemoteSubscription(publication, participant, { reason });
        if (update.unsupported) result.unsupported += 1;
        if (update.changed) result.changed += 1;
      });
      if (subscribe) result.subscribedUserIds.push(uid);
      else result.unsubscribedUserIds.push(uid);
    });
    log("subscriptions.reconciled", { reason, ...result });
    return result;
  }

  function markRemoteTrackAttached(userId, {
    trackId = null,
    trackSid = null,
  } = {}) {
    const uid = normalizeId(userId);
    const normalizedTrackId = normalizeId(trackId || "");
    const normalizedTrackSid = normalizeId(trackSid || "");
    const runtimeState = upsertRemoteAudioRuntime(uid, {
      trackId: normalizedTrackId,
      trackSid: normalizedTrackSid,
      attached: true,
    });
    const participantState = getParticipantState(uid);
    if (!participantState) return;
    participantState.lastError = null;
    participantState.lastUpdatedAt = nowIso();
    log("track.remote.attached_state", {
      peerUserId: participantState.userId || null,
      trackId: normalizedTrackId || participantState.audioTrackId || null,
      trackSid: normalizedTrackSid || participantState.audioTrackSid || null,
      attachmentCount: participantState.audioAttachmentCount || 0,
      duplicateSameTrack: !!runtimeState?.duplicateSameAttachment,
      duplicateActiveAttachments: (participantState.audioAttachmentCount || 0) > 1,
    });
    recordParticipantRuntimeEvent(uid, "attached", {
      trackId: normalizedTrackId || participantState.audioTrackId || null,
      trackSid: normalizedTrackSid || participantState.audioTrackSid || null,
    });
    if ((participantState.audioAttachmentCount || 0) > 1) {
      log("track.remote.duplicate_attachment_detected", {
        peerUserId: participantState.userId || null,
        attachmentCount: participantState.audioAttachmentCount || 0,
        activeTrackIds: participantState.audioTrackIds || [],
        activeTrackSids: participantState.audioTrackSids || [],
      });
    }
    emitSnapshot();
  }

  function markRemoteTrackDetached(userId, {
    trackId = null,
    trackSid = null,
  } = {}) {
    const uid = normalizeId(userId);
    const normalizedTrackId = normalizeId(trackId || "");
    const normalizedTrackSid = normalizeId(trackSid || "");
    removeRemoteAudioRuntime(uid, {
      trackId: normalizedTrackId,
      trackSid: normalizedTrackSid,
      clearAll: !normalizedTrackId && !normalizedTrackSid,
      attached: false,
    });
    const participantState = getParticipantState(uid);
    if (!participantState) return;
    participantState.lastUpdatedAt = nowIso();
    log("track.remote.detached_state", {
      peerUserId: participantState.userId || null,
      trackId: normalizedTrackId || null,
      trackSid: normalizedTrackSid || null,
      attachmentCount: participantState.audioAttachmentCount || 0,
      subscriptionCount: participantState.audioSubscriptionCount || 0,
    });
    recordParticipantRuntimeEvent(uid, "detached", {
      trackId: normalizedTrackId || null,
      trackSid: normalizedTrackSid || null,
    });
    emitSnapshot();
  }

  function updateLocalControls({
    micMuted = snapshot.local.micMuted,
    deafened = snapshot.local.deafened,
    inputDeviceId = snapshot.local.inputDeviceId,
    outputDeviceId = snapshot.local.outputDeviceId,
  } = {}) {
    snapshot.local.micMuted = !!micMuted;
    snapshot.local.deafened = !!deafened;
    snapshot.local.inputDeviceId = String(inputDeviceId || "default").trim() || "default";
    snapshot.local.outputDeviceId = String(outputDeviceId || "default").trim() || "default";
    const participantState = getParticipantState(meId, room.localParticipant, { local: true });
    if (participantState) {
      participantState.audioMuted = !!micMuted;
      participantState.lastUpdatedAt = nowIso();
    }
    emitSnapshot();
  }

  async function publishData(payload, {
    reliable = true,
    topic = "",
  } = {}) {
    const data = payload instanceof Uint8Array
      ? payload
      : new TextEncoder().encode(String(payload ?? ""));
    const options = {
      reliable: reliable !== false,
      topic: String(topic || "").trim() || undefined,
    };
    return room.localParticipant.publishData(data, options);
  }

  async function observeMicrophoneOutboundRtp({
    timeoutMs = 1500,
    pollIntervalMs = 120,
    isCurrent = () => true,
  } = {}) {
    const localTrack = publishedAudioPublication?.track || null;
    if (!localTrack || typeof localTrack.getRTCStatsReport !== "function") {
      return { observed: false, reason: "public_track_stats_unavailable", observedAt: 0 };
    }
    const startedAt = Date.now();
    const deadlineAt = startedAt + Math.max(100, Math.min(3000, Number(timeoutMs || 1500)));
    const delayMs = Math.max(50, Math.min(500, Number(pollIntervalMs || 120)));
    while (Date.now() <= deadlineAt) {
      if (!safeInvoke(isCurrent)) {
        return { observed: false, reason: "stale_generation", observedAt: 0 };
      }
      let report = null;
      try {
        report = await localTrack.getRTCStatsReport();
      } catch (_) {
        return { observed: false, reason: "stats_read_failed", observedAt: 0 };
      }
      let outboundAudioSeen = false;
      report?.forEach?.((stat) => {
        if (
          stat?.type === "outbound-rtp"
          && stat?.isRemote !== true
          && (stat?.kind === "audio" || stat?.mediaType === "audio")
          && (Number(stat?.bytesSent || 0) > 0 || Number(stat?.packetsSent || 0) > 0)
        ) outboundAudioSeen = true;
      });
      if (outboundAudioSeen) {
        return { observed: true, reason: "outbound_rtp", observedAt: Date.now() };
      }
      if (Date.now() >= deadlineAt) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return { observed: false, reason: "outbound_rtp_timeout", observedAt: 0 };
  }

  async function disconnect({ reason = "manual" } = {}) {
    disconnectRequested = true;
    cancelParticipantSignalWrites();
    snapshot.disconnectRequested = true;
    snapshot.joinPhase = "disconnecting";
    snapshot.lastDisconnect = {
      at: nowIso(),
      reason: String(reason || "manual").trim() || "manual",
      requested: true,
    };
    log("room.disconnect_requested", {
      reason: snapshot.lastDisconnect.reason || null,
      roomConnected: !!snapshot.local.roomConnected,
      localTrackPublished: !!snapshot.local.audioTrackPublished,
    });
    emitSnapshot();
    try {
      await room.disconnect(false);
    } catch (error) {
      const details = setUnexpectedFailure("room_disconnect", error);
      log("room.disconnect_failed", {
        reason: snapshot.lastDisconnect?.reason || null,
        ...details,
      });
      emitSnapshot();
      throw error;
    } finally {
      unbindRoomEvents();
    }
  }

  function getSnapshot() {
    return safeClone(snapshot);
  }

  function getLocalParticipantPermission() {
    return safeClone(syncLocalParticipantPermission("explicit_read"));
  }

  async function waitForLocalParticipantPermission({
    source = "",
    timeoutMs = 3000,
  } = {}) {
    const sourceName = normalizeLiveKitTrackSourceName(source);
    const startedAt = Date.now();
    while (Date.now() - startedAt <= Math.max(0, Number(timeoutMs || 0))) {
      const permission = summarizeParticipantPermission(room.localParticipant?.permissions || null);
      const sourceAllowed = !!(
        permission?.canPublish
        && (
          !sourceName
          || permission.canPublishSources.length === 0
          || permission.canPublishSources.includes(sourceName)
        )
      );
      if (sourceAllowed) {
        syncLocalParticipantPermission("permission_wait_satisfied");
        emitSnapshot();
        return { ok: true, permission, source: sourceName || null };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const permission = syncLocalParticipantPermission("permission_wait_timeout");
    emitSnapshot();
    return { ok: false, permission, source: sourceName || null };
  }

  // The app calls this only for an accepted same-Room logical move.
  // Keep publications, bindings and media state; the caller commits UI once.
  function retargetConversation(conversationId = "") {
    const nextId = normalizeId(conversationId || "");
    if (!nextId || disconnectRequested) return false;
    if (nextId === convId) return true;
    convId = nextId;
    snapshot.conversationId = nextId;
    safeInvoke(onConversationChanged, nextId);
    return true;
  }

  return {
    controllerId: snapshot.controllerId || null,
    joinAttemptId: snapshot.joinAttemptId || null,
    get conversationId() { return convId; },
    retargetConversation,
    room,
    prepareConnection,
    connect,
    disconnect,
    publishMicrophone,
    unpublishMicrophone,
    setMicrophoneMuted,
    publishData,
    observeMicrophoneOutboundRtp,
    updateLocalParticipantMetadata,
    updateLocalParticipantAttributes,
    getLocalParticipantPermission,
    hasLiveMicrophonePublication,
    waitForLocalParticipantPermission,
    reconcileRemoteSubscriptions,
    reconcileRemoteScreenShareAudio,
    markRemoteTrackAttached,
    markRemoteTrackDetached,
    updateLocalControls,
    getSnapshot,
  };
}
