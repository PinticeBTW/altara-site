const DEFAULT_LIMIT = 30;

export const VOICE_TOKEN_SERVER_TIMING_FIELDS = Object.freeze([
  "authMs",
  "channelLookupMs",
  "channelVisibilityMs",
  "serverMembershipMs",
  "restrictionChecksMs",
  "voicePermissionMs",
  "roomNameResolutionMs",
  "tokenConstructionMs",
  "capacitySessionChecksMs",
  "responseSerializationMs",
  "totalMs",
]);

const STRING_FIELDS = Object.freeze([
  'attemptId', 'reusedAttemptId', 'stage', 'outcomeReason', 'readinessBlocker',
  'longestSynchronousCallbackName',
  'perceivedReadyBasis', 'paintObservationKind',
  'documentVisibilityAtConnectedCommit', 'documentVisibilityAtFrameObservation',
  'publicationResult',
  "callType", "event", "result", "source", "inputMethod", "generation",
  "firstOutboundRtpUnavailableReason", "preparationReason", "preparationPath", "tokenBlockedBy",
  "tokenRequestId",
]);

const NUMBER_FIELDS = Object.freeze([
  'diagnosticVersion',
  'intentAcceptedAt', 'intentSettledAt', 'finishedAt', 'clickToOutcomeMs',
  'contextResolveStartAt', 'contextResolveEndAt', 'readinessStartAt', 'readinessEndAt',
  'resumeContextStartAt', 'resumeContextEndAt', 'pipelineStartedAt',
  'startupShellCommittedAt', 'startupAuthStartAt', 'startupAuthEndAt',
  'startupAuthAttemptCount', 'startupAuthRefreshCount', 'startupAuthRestoreCount',
  'permissionStartAt', 'tokenWrapperStartAt', 'tokenWrapperEndAt',
  'tokenAuthStartAt', 'tokenAuthEndAt', 'tokenResponseObservedAt',
  'tokenResponseBodyHandledAt', 'tokenValidationEndAt',
  'clickToTokenWrapperMs', 'tokenWrapperToRequestMs', 'tokenResponseToContinuationMs',
  'tokenInvokeCount', 'tokenRetryCount', 'publicationRetryCount',
  'firstConnectedPaintAt', 'stablePaintAt', 'connectedCommitToFirstPaintMs',
  'snapshotEventCountBeforePaint', 'snapshotReconciliationCountBeforePaint',
  'participantNodesCreated', 'participantNodesReused', 'participantNodesRemoved',
  'forcedLayoutReadCount', 'forcedLayoutTotalMs', 'longestSynchronousCallbackMs',
  'mainThreadBlockedBeforeAudioReadyMs', 'mainThreadBlockedAfterAudioReadyMs',
  'mainThreadBlockedBeforeAudioReadyFullDurationMs', 'mainThreadBlockedBeforeAudioReadyExcessOver50Ms',
  'joinCueRequestMs', 'joinCueStartMs',
  "localRunNumber", "tokenRequestStartedUtcMs", "tokenRequestFinishedUtcMs",
  "physicalInputAt", "pointerDownAt", "clickAt", "canonicalIntentAt", "shellCommittedAt",
  "tokenRequestStartAt", "tokenResponseAt", "permissionCompletedAt",
  "microphoneStartAt", "microphoneEndAt", "prepareConnectionStartAt", "prepareConnectionEndAt",
  "urlPrewarmStartAt", "urlPrewarmEndAt", "roomConnectStartAt", "roomConnectEndAt",
  "publicationStartAt", "publicationEndAt", "firstOutboundRtpAt", "audioReadyAt",
  "connectedCommitAt", "joinCueRequestAt", "joinCueStartAt", "controlsEnabledAt", "pillClearedAt", "stableStagePaintAt",
  "clickToShellMs", "clickToTokenStartMs", "clickToPrepareStartMs", "prepareBlockedConnectMs",
  "tokenMs", "tokenNetworkMs",
  "permissionMs", "microphoneMs", "prepareConnectionMs", "liveKitConnectMs", "publicationMs",
  "publicationWrapperMs", "publicationPreSdkMs", "publicationSdkMs", "publicationEventOffsetMs",
  "publicationEventHandlerMs", "publicationPostSdkMs", "publicationMuteStateSyncMs",
  "publicationApplicationContinuationMs",
  "clickToAudioReadyMs", "clickToFirstOutboundRtpMs", "clickToConnectedUiMs",
  "perceivedReadyAt", "audioReadyToPerceivedReadyMs",
  "audioReadyToConnectedCommitMs", "connectedCommitToControlsMs", "connectedCommitToPillClearMs",
  "connectedCommitToStablePaintMs", "clickToPerceivedReadyMs", "unattributedCriticalGapMs",
  "mainThreadBlockedMs", "preparationStartOffsetMs", "preparationMs", "urlPrewarmMs",
  "tokenRequestCount", "prepareConnectionCount", "roomConnectAttemptCount", "publicationCount",
  "tokenServerTotalMs", "tokenServerAuthMs", "tokenServerChannelMs",
  "tokenServerChannelVisibilityMs",
  "tokenServerMembershipMs", "tokenServerPermissionMs", "tokenServerRestrictionMs",
  "tokenServerCapacityMs", "tokenServerRoomResolutionMs", "tokenServerConstructionMs",
  "tokenServerSerializationMs",
]);

const BOOLEAN_FIELDS = Object.freeze([
  'pipelineBound', 'tokenAuthRefreshAttempted', 'tokenAuthRestoreAttempted',
  'tokenPreparationStartedAfterResponse',
  'publicationInputTrackReused', 'publicationExistingPublicationReused',
  "backgroundWorkBlockedCriticalPath", "preparationSupported", "urlWarm", "tokenWarm",
  "reusedPreparedConnection", "stalePreparationDiscarded", "firstOutboundRtpObserved",
  "authSessionRefreshed", "preparationAlreadyWarmBeforeClick", "preparationStartedBeforeClick",
  "tokenPreparationStartedAfterToken", "preparationAwaitedSerially", "preparationFailed",
]);

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(1)) : null;
}

function safeLabel(value, limit = 80) {
  return String(value || "").trim().replace(/[^a-z0-9:_-]+/gi, "_").slice(0, limit) || null;
}

function safeGeneration(value) {
  const normalized = safeLabel(value, 80);
  if (!normalized) return null;
  return normalized.length <= 10 ? normalized : `${normalized.slice(0, 8)}…`;
}

export function captureVoiceTokenServerDiagnostics(operationTiming = null, response = null, {
  requestStartedUtcMs = null,
  requestFinishedUtcMs = null,
} = {}) {
  if (!operationTiming || typeof operationTiming !== "object") return null;
  const payload = response && typeof response === "object" && !Array.isArray(response) ? response : {};
  const sourceTiming = payload.serverTiming && typeof payload.serverTiming === "object" && !Array.isArray(payload.serverTiming)
    ? payload.serverTiming
    : {};
  const tokenServerTiming = {};
  VOICE_TOKEN_SERVER_TIMING_FIELDS.forEach((field) => {
    tokenServerTiming[field] = finiteOrNull(sourceTiming[field]);
  });
  const diagnostics = Object.freeze({
    tokenRequestId: safeLabel(payload.requestId, 80),
    tokenRequestStartedUtcMs: finiteOrNull(requestStartedUtcMs),
    tokenRequestFinishedUtcMs: finiteOrNull(requestFinishedUtcMs),
    tokenServerTiming: Object.freeze(tokenServerTiming),
  });
  operationTiming.tokenRequestId = diagnostics.tokenRequestId;
  operationTiming.tokenRequestStartedUtcMs = diagnostics.tokenRequestStartedUtcMs;
  operationTiming.tokenRequestFinishedUtcMs = diagnostics.tokenRequestFinishedUtcMs;
  operationTiming.tokenServerTiming = diagnostics.tokenServerTiming;
  return diagnostics;
}

export function normalizeVoicePerfEntry(payload = {}, at = Date.now()) {
  const entry = {};
  STRING_FIELDS.forEach((field) => {
    if (payload?.[field] == null) return;
    entry[field] = field === "generation"
      ? safeGeneration(payload[field])
      : safeLabel(payload[field], 80);
  });
  NUMBER_FIELDS.forEach((field) => {
    entry[field] = finiteOrNull(payload?.[field]);
  });
  BOOLEAN_FIELDS.forEach((field) => {
    entry[field] = ['tokenAuthRefreshAttempted', 'tokenAuthRestoreAttempted'].includes(field)
      ? (typeof payload?.[field] === 'boolean' ? payload[field] : null)
      : payload?.[field] === true;
  });
  entry.at = Math.max(0, Number(at) || Date.now());
  return Object.freeze(entry);
}

export function createVoicePerfHistory({
  root = globalThis,
  now = () => Date.now(),
  limit = DEFAULT_LIMIT,
} = {}) {
  const maxEntries = Math.max(5, Math.min(100, Number(limit) || DEFAULT_LIMIT));
  const keyToEntry = new Map();
  // Local diagnostic identity, independent of user/session/room generations.
  const attemptPrefix = `${Number(now()).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let attemptSerial = 0;

  function publish(entries) {
    const bounded = Object.freeze(entries.slice(-maxEntries));
    if (root && typeof root === "object") root.__ALTARA_VOICE_PERF_HISTORY__ = bounded;
    return bounded;
  }

  function append(payload = {}, { operationKey = "" } = {}) {
    const entry = normalizeVoicePerfEntry(payload, now());
    const current = Array.isArray(root?.__ALTARA_VOICE_PERF_HISTORY__)
      ? root.__ALTARA_VOICE_PERF_HISTORY__
      : [];
    publish([...current, entry]);
    const key = String(operationKey || "").trim();
    if (key) keyToEntry.set(key, entry);
    while (keyToEntry.size > maxEntries * 2) keyToEntry.delete(keyToEntry.keys().next().value);
    return entry;
  }

  function get(operationKey = "") {
    const key = String(operationKey || "").trim();
    const entry = key ? keyToEntry.get(key) : null;
    return entry && root?.__ALTARA_VOICE_PERF_HISTORY__?.includes(entry) ? entry : null;
  }

  function beginAttempt(payload = {}) {
    const attemptId = `sv-${attemptPrefix}-${++attemptSerial}`;
    return append({ ...payload, attemptId }, { operationKey: `attempt:${attemptId}` });
  }

  function patch(operationKey = "", updates = {}) {
    const key = String(operationKey || "").trim();
    const previousEntry = get(key);
    if (!previousEntry) return null;
    const nextEntry = normalizeVoicePerfEntry({ ...previousEntry, ...updates }, previousEntry.at || now());
    const current = Array.isArray(root?.__ALTARA_VOICE_PERF_HISTORY__)
      ? root.__ALTARA_VOICE_PERF_HISTORY__
      : [];
    publish(current.map((entry) => entry === previousEntry ? nextEntry : entry));
    keyToEntry.set(key, nextEntry);
    return nextEntry;
  }

  function clear() {
    keyToEntry.clear();
    return publish([]);
  }

  if (!Array.isArray(root?.__ALTARA_VOICE_PERF_HISTORY__)) publish([]);
  return Object.freeze({ append, beginAttempt, clear, get, patch, snapshot: () => root.__ALTARA_VOICE_PERF_HISTORY__ });
}
