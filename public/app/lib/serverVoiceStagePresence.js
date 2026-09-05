function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}
function readAssignmentEntries(collection) {
  if (collection instanceof Map) return Array.from(collection.entries());
  if (collection && typeof collection === "object" && !Array.isArray(collection)) {
    return Object.entries(collection);
  }
  return [];
}

function normalizeAssignment(value) {
  if (!value || typeof value !== "object") return null;
  const serverId = normalizeId(value.serverId || value.server_id || "");
  const channelId = normalizeId(
    value.channelId
    || value.channel_id
    || value.voiceChannelId
    || value.voice_channel_id
    || "",
  );
  if (!serverId || !channelId) return null;
  return {
    ...value,
    serverId,
    channelId,
  };
}

function readTimestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readAssignmentHeartbeatMs(value) {
  if (!value || typeof value !== "object") return 0;
  return readTimestampMs(
    value.heartbeatAt
    || value.heartbeat_at
    || value.updatedAt
    || value.updated_at
    || "",
  );
}

function readAssignmentSessionId(value) {
  return String(value?.sessionId || value?.session_id || "").trim();
}

function readAssignmentUserId(value) {
  return normalizeId(value?.userId || value?.user_id || "");
}

const SERVER_VOICE_OBSERVER_MODES = new Set([
  "same-room-connected",
  "outside-room",
  "different-room",
  "local-self-recovery",
]);

function normalizeObserverMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return SERVER_VOICE_OBSERVER_MODES.has(mode) ? mode : "same-room-connected";
}

/**
 * A stale lease never remains authorization. When a same-room observer still
 * sees the exact participant transport, however, the last trusted assignment
 * is enough to preserve display/sound continuity while authority is refreshed.
 * Explicit leave always wins and observers without Room evidence cannot use
 * this presentation-only bridge.
 */
export function resolveServerVoiceLeaseContinuityDecision({
  authoritativeMembershipPresent = false,
  membershipFresh = false,
  retainedAssignmentPresent = false,
  liveKitPresent = false,
  observerMode = "same-room-connected",
  terminalExplicit = false,
  transportGraceActive = false,
} = {}) {
  if (terminalExplicit) {
    return Object.freeze({
      retainForPresentation: false,
      soundContinuous: false,
      presenceState: "absent",
      reason: "terminal_explicit_leave",
    });
  }
  if (authoritativeMembershipPresent && membershipFresh) {
    return Object.freeze({
      retainForPresentation: true,
      soundContinuous: true,
      presenceState: liveKitPresent ? "connected" : "authoritative",
      reason: "fresh_authoritative_membership",
    });
  }
  const canObserveTransport = normalizeObserverMode(observerMode) === "same-room-connected";
  if (retainedAssignmentPresent && canObserveTransport && liveKitPresent) {
    return Object.freeze({
      retainForPresentation: true,
      soundContinuous: true,
      presenceState: "connected",
      reason: "stale_lease_live_transport_continuity",
    });
  }
  if (retainedAssignmentPresent && canObserveTransport && transportGraceActive) {
    return Object.freeze({
      retainForPresentation: true,
      soundContinuous: true,
      presenceState: "reconnecting",
      reason: "transport_reconnect_grace_continuity",
    });
  }
  return Object.freeze({
    retainForPresentation: false,
    soundContinuous: false,
    presenceState: "absent",
    reason: canObserveTransport ? "lease_and_transport_absent" : "transport_unobservable",
  });
}

/**
 * Realtime subscriptions cannot use a snapshot started before SUBSCRIBED as
 * their baseline: a row written between those two moments is absent from both
 * inputs. This tiny epoch gate makes the mandatory post-subscribe baseline
 * explicit without owning application data or a second membership cache.
 */
export function createServerVoiceRealtimeBaselineGate() {
  let epoch = 0;
  let startedAt = 0;
  let subscribedAt = 0;
  let lastSnapshotStartedAt = 0;
  let lastSnapshotSettledAt = 0;
  let lastSnapshotOk = false;
  let baselineReady = false;

  const owns = (expectedEpoch) => Number(expectedEpoch || 0) === epoch && epoch > 0;
  return Object.freeze({
    begin({ startedAt: nextStartedAt = Date.now() } = {}) {
      epoch += 1;
      startedAt = Number(nextStartedAt || 0) || Date.now();
      subscribedAt = 0;
      lastSnapshotStartedAt = 0;
      lastSnapshotSettledAt = 0;
      lastSnapshotOk = false;
      baselineReady = false;
      return epoch;
    },
    markSubscribed(expectedEpoch, at = Date.now()) {
      if (!owns(expectedEpoch)) return false;
      subscribedAt = Number(at || 0) || Date.now();
      baselineReady = !!(
        lastSnapshotOk
        && lastSnapshotStartedAt >= subscribedAt
        && lastSnapshotSettledAt >= lastSnapshotStartedAt
      );
      return true;
    },
    noteSnapshotStarted(expectedEpoch, at = Date.now()) {
      if (!owns(expectedEpoch)) return false;
      lastSnapshotStartedAt = Number(at || 0) || Date.now();
      lastSnapshotSettledAt = 0;
      lastSnapshotOk = false;
      return true;
    },
    noteSnapshotSettled(expectedEpoch, { settledAt = Date.now(), ok = true } = {}) {
      if (!owns(expectedEpoch)) return false;
      lastSnapshotSettledAt = Number(settledAt || 0) || Date.now();
      lastSnapshotOk = ok === true;
      baselineReady = !!(
        subscribedAt
        && lastSnapshotOk
        && lastSnapshotStartedAt >= subscribedAt
        && lastSnapshotSettledAt >= lastSnapshotStartedAt
      );
      return true;
    },
    needsPostSubscribeBaseline(expectedEpoch) {
      return owns(expectedEpoch) && subscribedAt > 0 && baselineReady !== true;
    },
    getSnapshot() {
      return Object.freeze({
        epoch,
        startedAt,
        subscribedAt,
        lastSnapshotStartedAt,
        lastSnapshotSettledAt,
        lastSnapshotOk,
        baselineReady,
        firstSubscriptionReadyMs: subscribedAt && startedAt
          ? Math.max(0, subscribedAt - startedAt)
          : null,
        initialHydrationMs: baselineReady && startedAt
          ? Math.max(0, lastSnapshotSettledAt - startedAt)
          : null,
      });
    },
  });
}

/**
 * Terminal leave must fence the coordinator/LiveKit session that is actually
 * active. The independently captured stable-presence context can lag the
 * admission session and is therefore only the final fallback.
 */
export function resolveServerVoiceV2TerminalLeaveSessionId({
  activeTransportSessionId = "",
  cachedMembershipSessionId = "",
  stablePresenceSessionId = "",
} = {}) {
  return String(
    activeTransportSessionId
    || cachedMembershipSessionId
    || stablePresenceSessionId
    || "",
  ).trim();
}

/**
 * An explicit leave is terminal only for the transport session that issued it.
 * A delayed Session A leave must never remove an already-active Session B.
 */
export function resolveServerVoiceV2TerminalLeave({
  userId = "",
  serverId = "",
  sessionId = "",
  currentAssignment = null,
  retainedAssignment = null,
} = {}) {
  const leaveUserId = normalizeId(userId);
  const leaveServerId = normalizeId(serverId);
  const leaveSessionId = String(sessionId || "").trim();
  const activeAssignment = currentAssignment || retainedAssignment || null;
  const activeUserId = normalizeId(activeAssignment?.userId || activeAssignment?.user_id || leaveUserId);
  const activeServerId = normalizeId(activeAssignment?.serverId || activeAssignment?.server_id || leaveServerId);
  const activeSessionId = readAssignmentSessionId(activeAssignment);
  if (!leaveUserId || (activeUserId && activeUserId !== leaveUserId)) {
    return { apply: false, reason: "different_user" };
  }
  if (leaveServerId && activeServerId && activeServerId !== leaveServerId) {
    return { apply: false, reason: "different_server" };
  }
  if (leaveSessionId && activeSessionId && activeSessionId !== leaveSessionId) {
    return { apply: false, reason: "replacement_session_active" };
  }
  return {
    apply: true,
    reason: "terminal_explicit_leave",
    userId: leaveUserId,
    serverId: leaveServerId || activeServerId,
    sessionId: leaveSessionId || activeSessionId,
  };
}

export function isServerVoiceV2AssignmentBlockedByTerminalLeave({
  assignment = null,
  terminalLeave = null,
} = {}) {
  if (!assignment || !terminalLeave) return false;
  const assignmentUserId = normalizeId(assignment?.userId || assignment?.user_id || "");
  const leaveUserId = normalizeId(terminalLeave?.userId || terminalLeave?.user_id || "");
  const assignmentServerId = normalizeId(assignment?.serverId || assignment?.server_id || "");
  const leaveServerId = normalizeId(terminalLeave?.serverId || terminalLeave?.server_id || "");
  const assignmentSessionId = readAssignmentSessionId(assignment);
  const leaveSessionId = readAssignmentSessionId(terminalLeave);
  if (!assignmentUserId || !leaveUserId || assignmentUserId !== leaveUserId) return false;
  if (assignmentServerId && leaveServerId && assignmentServerId !== leaveServerId) return false;
  if (leaveSessionId && assignmentSessionId && assignmentSessionId !== leaveSessionId) return false;
  return true;
}

/**
 * A transport publication can outlive its owner's terminal membership event.
 * Presence owns Server Voice media projection, so terminally-left owners must
 * not be reintroduced by a stale camera/share publication.
 */
export function shouldSuppressServerVoiceV2OwnedMedia({
  ownerUserId = "",
  terminalLeave = null,
} = {}) {
  const ownerId = normalizeId(ownerUserId);
  const leaveUserId = normalizeId(terminalLeave?.userId || terminalLeave?.user_id || "");
  return !!(ownerId && leaveUserId && ownerId === leaveUserId);
}

/**
 * A complete snapshot may race a heartbeat or Realtime delivery. Preserve a
 * previously fresh row that is absent from one snapshot; an explicit DELETE
 * bypasses this merge, while a truly abandoned row ages out naturally.
 */
export function mergeFreshServerVoiceV2MembershipSnapshot({
  previousAssignmentsByUser = new Map(),
  nextAssignmentsByUser = new Map(),
  now = Date.now(),
  staleAfterMs = 35_000,
} = {}) {
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const freshnessWindowMs = Math.max(0, Number(staleAfterMs) || 0);
  const assignmentsByUser = new Map();
  readAssignmentEntries(nextAssignmentsByUser).forEach(([rawUserId, assignment]) => {
    const userId = normalizeId(rawUserId || assignment?.userId || assignment?.user_id || "");
    if (userId && assignment && typeof assignment === "object") assignmentsByUser.set(userId, assignment);
  });
  const retainedMissingUserIds = [];
  readAssignmentEntries(previousAssignmentsByUser).forEach(([rawUserId, assignment]) => {
    const userId = normalizeId(rawUserId || assignment?.userId || assignment?.user_id || "");
    if (!userId || assignmentsByUser.has(userId) || !assignment || typeof assignment !== "object") return;
    const heartbeatMs = readAssignmentHeartbeatMs(assignment);
    if (!heartbeatMs || currentTime - heartbeatMs > freshnessWindowMs) return;
    assignmentsByUser.set(userId, assignment);
    retainedMissingUserIds.push(userId);
  });
  return {
    assignmentsByUser,
    retainedMissingUserIds,
  };
}

/**
 * A fresh local membership owned by another renderer process is recoverable,
 * but it is not an active transport for this process. Pick at most one
 * deterministic candidate without reviving media or mutating membership.
 */
export function resolveServerVoiceV2RecoveryCandidate({
  assignmentsByUser = new Map(),
  localUserId = "",
  currentProcessSessionId = "",
  liveParticipantIds = [],
  now = Date.now(),
  staleAfterMs = 35_000,
  preferredServerId = "",
} = {}) {
  const userId = normalizeId(localUserId);
  const processSessionId = String(currentProcessSessionId || "").trim();
  const preferredServer = normalizeId(preferredServerId);
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const freshnessWindowMs = Math.max(0, Number(staleAfterMs) || 0);
  const liveSet = new Set((Array.isArray(liveParticipantIds) ? liveParticipantIds : [])
    .map(normalizeId)
    .filter(Boolean));
  if (!userId || !processSessionId || liveSet.has(userId)) return null;

  const candidates = readAssignmentEntries(assignmentsByUser)
    .map(([rawUserId, assignment]) => {
      const normalizedUserId = normalizeId(readAssignmentUserId(assignment) || rawUserId);
      const normalized = normalizeAssignment(assignment);
      if (!normalized || normalizedUserId !== userId) return null;
      const sessionId = readAssignmentSessionId(assignment);
      const heartbeatAt = readAssignmentHeartbeatMs(assignment);
      if (
        !sessionId
        || sessionId === processSessionId
        || !heartbeatAt
        || currentTime - heartbeatAt > freshnessWindowMs
      ) {
        return null;
      }
      return {
        ...assignment,
        userId,
        serverId: normalized.serverId,
        channelId: normalized.channelId,
        sessionId,
        heartbeatAt,
        recoveryKey: [
          normalized.serverId,
          normalized.channelId,
          userId,
          sessionId,
        ].join(":"),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftPreferred = preferredServer && left.serverId === preferredServer ? 1 : 0;
      const rightPreferred = preferredServer && right.serverId === preferredServer ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      if (left.heartbeatAt !== right.heartbeatAt) return right.heartbeatAt - left.heartbeatAt;
      return left.recoveryKey.localeCompare(right.recoveryKey);
    });
  return candidates[0] || null;
}

/**
 * V2 uses one physical LiveKit room for a server. Fresh coordinator membership
 * is the durable channel authority; LiveKit describes the current transport
 * instance. A transient SID/snapshot loss must not erase an authoritative
 * member, and a retained assignment is allowed only for a bounded reconnect
 * grace after both sources disappear.
 */
export function resolveServerVoiceV2StagePresence({
  liveParticipantIds = [],
  currentServerId = "",
  currentChannelId = "",
  canonicalAssignmentsByUser = new Map(),
  retainedAssignmentsByUser = new Map(),
  localUserId = "",
  currentProcessSessionId = "",
  observerMode = "same-room-connected",
  now = Date.now(),
  reconnectGraceMs = 5_000,
} = {}) {
  const serverId = normalizeId(currentServerId);
  const channelId = normalizeId(currentChannelId);
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const graceDurationMs = Math.max(0, Number(reconnectGraceMs) || 0);
  const normalizedLocalUserId = normalizeId(localUserId);
  const processSessionId = String(currentProcessSessionId || "").trim();
  const normalizedObserverMode = normalizeObserverMode(observerMode);
  const retained = new Map();
  readAssignmentEntries(retainedAssignmentsByUser).forEach(([rawUserId, assignment]) => {
    const userId = normalizeId(rawUserId);
    const normalized = normalizeAssignment(assignment);
    if (userId && normalized) retained.set(userId, normalized);
  });

  const liveIds = Array.from(new Set((Array.isArray(liveParticipantIds) ? liveParticipantIds : [])
    .map(normalizeId)
    .filter(Boolean)));
  const liveSet = new Set(liveIds);
  const canonical = new Map();
  readAssignmentEntries(canonicalAssignmentsByUser).forEach(([rawUserId, assignment]) => {
    const userId = normalizeId(rawUserId);
    const normalized = normalizeAssignment(assignment);
    if (userId && normalized) canonical.set(userId, normalized);
  });

  const candidateIds = Array.from(new Set([
    ...liveIds,
    ...canonical.keys(),
    ...retained.keys(),
  ]));
  const visibleParticipantIds = [];
  const decisions = [];
  let nextExpiryAt = null;

  candidateIds.forEach((userId) => {
    const liveKitPresent = liveSet.has(userId);
    const canonicalAssignment = canonical.get(userId) || null;
    const retainedAssignment = retained.get(userId) || null;
    let effective = canonicalAssignment || retainedAssignment || null;
    let assignmentSource = "missing";
    let presenceState = "absent";
    let reconnectGraceStartedAt = null;
    let reconnectGraceUntil = null;

    if (canonicalAssignment) {
      assignmentSource = "canonical";
      const canonicalSessionId = readAssignmentSessionId(canonicalAssignment);
      const detachedFromCurrentProcess = !!(
        !liveKitPresent
        && normalizedLocalUserId
        && userId === normalizedLocalUserId
        && processSessionId
        && canonicalSessionId
        && canonicalSessionId !== processSessionId
      );
      const transportKnown = !!(
        liveKitPresent
        || detachedFromCurrentProcess
        || normalizedObserverMode === "same-room-connected"
        || normalizedObserverMode === "local-self-recovery"
      );
      reconnectGraceStartedAt = liveKitPresent || !transportKnown || detachedFromCurrentProcess
        ? null
        : (Number(
            retainedAssignment?.reconnectGraceStartedAt
            || retainedAssignment?.transportAbsentSince
            || 0
          ) || currentTime);
      reconnectGraceUntil = reconnectGraceStartedAt == null
        ? null
        : reconnectGraceStartedAt + graceDurationMs;
      const insideReconnectGrace = !!(
        !detachedFromCurrentProcess
        && !liveKitPresent
        && graceDurationMs > 0
        && currentTime < reconnectGraceUntil
      );
      presenceState = liveKitPresent
        ? "connected"
        : detachedFromCurrentProcess
          ? "detached"
          : !transportKnown
            ? "authoritative_unknown_transport"
            : (insideReconnectGrace ? "reconnecting" : "detached");
      if (insideReconnectGrace) {
        nextExpiryAt = nextExpiryAt == null
          ? reconnectGraceUntil
          : Math.min(nextExpiryAt, reconnectGraceUntil);
      }
      retained.set(userId, {
        ...canonicalAssignment,
        lastAuthoritativeSeenAt: currentTime,
        lastTransportSeenAt: liveKitPresent
          ? currentTime
          : (Number(retainedAssignment?.lastTransportSeenAt || 0) || null),
        transportAbsentSince: liveKitPresent || !transportKnown ? null : reconnectGraceStartedAt,
        reconnectGraceStartedAt: liveKitPresent || !transportKnown ? null : reconnectGraceStartedAt,
      });
      effective = retained.get(userId);
    } else if (liveKitPresent && retainedAssignment) {
      assignmentSource = "retained_active_transport";
      presenceState = "connected";
      retained.set(userId, {
        ...retainedAssignment,
        lastTransportSeenAt: currentTime,
        reconnectGraceStartedAt: null,
      });
      effective = retained.get(userId);
    } else if (retainedAssignment) {
      reconnectGraceStartedAt = Number(retainedAssignment.reconnectGraceStartedAt || 0) || currentTime;
      reconnectGraceUntil = reconnectGraceStartedAt + graceDurationMs;
      const insideReconnectGrace = graceDurationMs > 0 && currentTime < reconnectGraceUntil;
      assignmentSource = insideReconnectGrace ? "bounded_reconnect_grace" : "reconnect_grace_expired";
      presenceState = insideReconnectGrace ? "reconnecting" : "absent";
      if (insideReconnectGrace) {
        retained.set(userId, {
          ...retainedAssignment,
          reconnectGraceStartedAt,
        });
        effective = retained.get(userId);
        nextExpiryAt = nextExpiryAt == null
          ? reconnectGraceUntil
          : Math.min(nextExpiryAt, reconnectGraceUntil);
      } else {
        retained.delete(userId);
        effective = retainedAssignment;
      }
    }

    const visible = !!(
      effective
      && serverId
      && channelId
      && effective.serverId === serverId
      && effective.channelId === channelId
      && presenceState !== "absent"
    );
    if (visible) visibleParticipantIds.push(userId);
    decisions.push({
      userId,
      observerMode: normalizedObserverMode,
      liveKitPresent,
      transportKnown: !!(
        liveKitPresent
        || presenceState === "detached"
        || presenceState === "reconnecting"
        || normalizedObserverMode === "same-room-connected"
        || normalizedObserverMode === "local-self-recovery"
      ),
      transportPresent: liveKitPresent,
      authoritativeMembershipPresent: !!canonicalAssignment,
      assignmentSource,
      presenceState,
      assignedServerId: effective?.serverId || "",
      assignedChannelId: effective?.channelId || "",
      reconnectGraceStartedAt,
      reconnectGraceUntil,
      graceActive: presenceState === "reconnecting",
      visible,
    });
  });

  return {
    visibleParticipantIds,
    retainedAssignmentsByUser: retained,
    decisions,
    nextExpiryAt,
  };
}
