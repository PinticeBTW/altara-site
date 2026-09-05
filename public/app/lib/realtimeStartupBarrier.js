const PRESENCE_TOPIC = "altara-presence-global";
const STARTUP_RECORD_LIMIT = 400;
const BYPASS_RECORD_LIMIT = 100;
const RETRY_WINDOW_MS = 60_000;
const RECOVERY_WINDOW_MS = 5 * 60_000;
const TERMINAL_SUBSCRIBE_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);
const SESSION_COOLDOWN_AT = Number.MAX_SAFE_INTEGER;

export const PRESENCE_BOOTSTRAP_STATES = Object.freeze({
  IDLE: "idle",
  SUBSCRIBING: "subscribing",
  SUBSCRIBED: "subscribed",
  TRACKING: "tracking",
  READY: "ready",
  DEGRADED: "degraded",
  RECONNECTING: "reconnecting",
  STOPPED: "stopped",
});

function normalizeTopic(value = "") {
  return String(value || "").trim().replace(/^realtime:/i, "");
}

function isPrivateChannelOptions(options = {}) {
  return options?.config?.private === true;
}

function sanitizeCallsite(stack = "") {
  return String(stack || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line
      .replace(/([?#]).*?(?=:\d+:\d+|\s|$)/g, "")
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
      .trim())
    .filter((line) => line && !line.includes("realtimeStartupBarrier.js"))
    .slice(0, 4)
    .join(" <- ")
    .slice(0, 900);
}

export function classifyRealtimeStartupTopic(topic = "", { privateChannel = true } = {}) {
  const normalizedTopic = normalizeTopic(topic);
  if (!privateChannel) return "public";
  if (normalizedTopic === PRESENCE_TOPIC) return "presence";
  if (
    /^altara:user:[^:]+:(?:gdm-events|server-role-invalidation|call-events)$/i.test(normalizedTopic)
    || /^server-membership-events:/i.test(normalizedTopic)
    || /^user-membership:/i.test(normalizedTopic)
    || /^global-dm-privacy-events:/i.test(normalizedTopic)
    || /^dm-privacy:/i.test(normalizedTopic)
    || /^server-voice-moderation-states:/i.test(normalizedTopic)
    || /^server_voice_v2:/i.test(normalizedTopic)
    || /^call:dm_/i.test(normalizedTopic)
  ) return "critical";
  return "optional";
}

export function classifyRealtimeTopicFamily(topic = "") {
  const value = normalizeTopic(topic);
  if (value === PRESENCE_TOPIC) return "presence";
  if (/^call:/i.test(value)) return "call";
  if (/^typing:/i.test(value)) return "typing";
  if (/^server-members:/i.test(value)) return "serverMembers";
  if (/^server-profile:/i.test(value)) return "serverProfile";
  if (
    /^(?:user-membership|server-membership-events):/i.test(value)
    || /^altara:user:[^:]+:(?:gdm-events|server-role-invalidation|call-events)$/i.test(value)
  ) return "security";
  if (/^(?:dm:|dm-reaction-events:|dm-privacy:)/i.test(value)) return "conversation";
  if (/^(?:active-server-|server-invites-settings:|server-voice-|server_voice_)/i.test(value)) return "serverContext";
  if (/^(?:global-|public-profile-events:|roles-realtime:)/i.test(value)) return "global";
  return "other";
}

export function classifyRealtimeSubscriptionNecessity(topic = "") {
  const value = normalizeTopic(topic);
  const family = classifyRealtimeTopicFamily(value);
  if (family === "presence") return "ALWAYS_REQUIRED";
  if (family === "security" || family === "global") return "ALWAYS_REQUIRED";
  if (/^typing:inbox:/i.test(value)) return "ALWAYS_REQUIRED";
  if (/^call:dm_/i.test(value)) return "ALWAYS_REQUIRED";
  if (family === "call") return "ACTIVE_ENTITY_ONLY";
  if (["typing", "serverMembers", "serverProfile", "conversation", "serverContext"].includes(family)) {
    return "CURRENT_CONTEXT_ONLY";
  }
  return "CURRENT_CONTEXT_ONLY";
}

export function createRealtimeStartupBarrier({
  now = () => Date.now(),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (timer) => clearTimeout(timer),
  postTrackSettleMs = 250,
  authorizationConcurrency = 1,
  optionalCooldownAfterFailures = 2,
  optionalCooldownMs = 5 * 60_000,
  criticalRetryCapMs = 30_000,
  captureCallsite = () => sanitizeCallsite(new Error().stack || ""),
} = {}) {
  // Fail closed from construction. install() happens before the singleton is
  // reachable by any importing module, so there is no pre-activate window in
  // which private channels may reach the native SDK.
  let active = true;
  let installedClient = null;
  let originalChannelFactory = null;
  let originalRealtimeChannelFactory = null;
  let barrierInstalledAt = 0;
  let singletonClientId = "";
  let singletonClientCreatedAt = 0;
  let getClientRegistrySnapshot = null;
  let state = PRESENCE_BOOTSTRAP_STATES.IDLE;
  let currentPresenceGeneration = 0;
  let readyPresenceGeneration = null;
  let reason = "";
  let gateReleased = false;
  let gateReleasedAt = 0;
  let releaseCount = 0;
  let drainTimer = null;
  let nextRecordId = 0;
  let nextChannelId = 0;
  let totalNativeSubscribeCalls = 0;
  let interceptedSubscribeCalls = 0;
  let bypassedSubscribeCalls = 0;
  let duplicateRetryCount = 0;
  let automaticRejoinPreventedCount = 0;
  let maximumAuthorizationConcurrencyObserved = 0;
  const criticalQueue = [];
  const optionalQueue = [];
  const readyWaiters = new Set();
  const records = [];
  const bypasses = [];
  const wrappedChannels = new WeakMap();
  const desiredSubscriptions = new Map();
  const topicRetryState = new Map();
  const retryTimestamps = [];
  const nativeSubscribeTimestamps = [];
  const authorizationInFlight = new Set();
  const failedTopics = new Map();
  const recoveryEvents = [];

  function nowMs() {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  }

  function toIso(timestamp) {
    if (!timestamp) return "";
    try { return new Date(timestamp).toISOString(); } catch (_) { return ""; }
  }

  function isCurrentGeneration(candidateGeneration) {
    return Number(candidateGeneration || 0) === currentPresenceGeneration && currentPresenceGeneration > 0;
  }

  function gateValidForCurrentGeneration() {
    return state === PRESENCE_BOOTSTRAP_STATES.READY
      && readyPresenceGeneration !== null
      && readyPresenceGeneration === currentPresenceGeneration;
  }

  function sanitizeErrorMessage(error = null) {
    return String(error?.message || error || "")
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
      .slice(0, 240);
  }

  function classifyRecoveryOrigin(nextReason = "") {
    const value = String(nextReason || "").toLowerCase();
    if (/heartbeat:(?:timeout|disconnected|error)/.test(value)) return "socket-driven";
    if (value.includes("connection-disconnected") || value.includes("network-offline")) return "socket-driven";
    return "client-driven";
  }

  function recordRecoveryGeneration(nextReason = "") {
    const at = nowMs();
    recoveryEvents.push({
      generation: currentPresenceGeneration,
      at,
      reason: String(nextReason || "presence-start").slice(0, 160),
      origin: classifyRecoveryOrigin(nextReason),
    });
    while (recoveryEvents.length > 80) recoveryEvents.shift();
    while (recoveryEvents.length && at - recoveryEvents[0].at > 30 * 60_000) recoveryEvents.shift();
  }

  function classifyTerminalReason(record, status, error = null) {
    const message = sanitizeErrorMessage(error || record?.firstFailureError || "");
    const normalized = String(status || "").trim().toUpperCase();
    if (/unauthori[sz]ed|do not have permissions|permission denied|row.level security|\brls\b/i.test(message)) {
      return "RLS_UNAUTHORIZED";
    }
    if (normalized === "TIMED_OUT" || /timed?\s*out|timeout/i.test(message)) {
      return "AUTHORIZATION_TIMEOUT";
    }
    if (record?.cancelled || record?.intentionalClose) return "CLIENT_CLOSED";
    if (normalized === "CHANNEL_ERROR") return "CHANNEL_ERROR";
    if (normalized === "CLOSED") return "REMOTE_OR_SDK_CLOSED";
    return normalized || "UNKNOWN";
  }

  function revokeReadiness(nextState = PRESENCE_BOOTSTRAP_STATES.DEGRADED, nextReason = "presence-unhealthy") {
    readyPresenceGeneration = null;
    gateReleased = false;
    gateReleasedAt = 0;
    state = nextState;
    reason = String(nextReason || "presence-unhealthy").slice(0, 120);
    if (drainTimer) {
      cancelSchedule(drainTimer);
      drainTimer = null;
    }
    return currentPresenceGeneration;
  }

  function compactRecords() {
    while (records.length > STARTUP_RECORD_LIMIT) records.shift();
    while (bypasses.length > BYPASS_RECORD_LIMIT) bypasses.shift();
  }

  function recordNativeSubscribe(record) {
    const nativeAt = nowMs();
    totalNativeSubscribeCalls += 1;
    nativeSubscribeTimestamps.push(nativeAt);
    while (nativeSubscribeTimestamps.length && nativeAt - nativeSubscribeTimestamps[0] > 5 * 60_000) {
      nativeSubscribeTimestamps.shift();
    }
    record.nativeSubscribeAt = nativeAt;
    record.nativeSubscribeCallsite = captureCallsite();
    const bypassedClosedGate = record.private === true
      && record.classification !== "presence"
      && !gateValidForCurrentGeneration();
    if (!bypassedClosedGate) return;
    record.startedBeforeCurrentGenerationTrackOk = true;
    record.bypassReason = !active
      ? "barrier_inactive"
      : "non_presence_private_native_subscribe_while_gate_closed";
    bypassedSubscribeCalls += 1;
    bypasses.push(record);
    compactRecords();
  }

  function removeQueuedRecord(record) {
    for (const queue of [criticalQueue, optionalQueue]) {
      const index = queue.indexOf(record);
      if (index >= 0) queue.splice(index, 1);
    }
  }

  function getWaitingRecords() {
    return [...criticalQueue, ...optionalQueue].filter((record) => (
      record && !record.cancelled && !record.startedAt
    ));
  }

  function hasAuthorizationCapacity() {
    const limit = Math.max(1, Number(authorizationConcurrency || 1));
    return authorizationInFlight.size < limit;
  }

  function holdAuthorizationSlot(record) {
    if (!record || record.authorizationSlotHeld || record.private !== true || record.classification === "presence") return;
    record.authorizationSlotHeld = true;
    authorizationInFlight.add(record.id);
    maximumAuthorizationConcurrencyObserved = Math.max(
      maximumAuthorizationConcurrencyObserved,
      authorizationInFlight.size,
    );
  }

  function releaseAuthorizationSlot(record) {
    if (!record?.authorizationSlotHeld) return false;
    record.authorizationSlotHeld = false;
    authorizationInFlight.delete(record.id);
    if (gateValidForCurrentGeneration()) scheduleDrain(0);
    return true;
  }

  function invokeSubscription(record) {
    if (!record || record.cancelled || record.startedAt || typeof record.start !== "function") return false;
    record.waiting = false;
    record.startedAt = nowMs();
    record.subscribedAt = record.startedAt;
    record.presenceBootstrapStateAtStart = state;
    record.presenceGenerationAtNativeSubscribe = currentPresenceGeneration;
    record.subscribeStatus = "JOINING";
    if (record.descriptor) {
      record.descriptor.state = "joining";
      record.descriptor.generation = currentPresenceGeneration;
      record.descriptor.lastSubscribeAt = record.startedAt;
    }
    const retryState = topicRetryState.get(record.topic);
    record.nativeRetryAttempt = Math.max(0, Number(retryState?.attempt || 0));
    if (record.nativeRetryAttempt > 0) {
      retryTimestamps.push(record.startedAt);
      while (retryTimestamps.length && record.startedAt - retryTimestamps[0] > RETRY_WINDOW_MS) retryTimestamps.shift();
    }
    holdAuthorizationSlot(record);
    recordNativeSubscribe(record);
    try {
      record.start();
      return true;
    } catch (error) {
      record.subscribeStatus = "START_ERROR";
      record.errorCode = String(error?.code || error?.message || "channel_subscribe_failed").slice(0, 120);
      releaseAuthorizationSlot(record);
      return false;
    }
  }

  function nextQueuedRecord() {
    const currentAt = nowMs();
    for (const queue of [criticalQueue, optionalQueue]) {
      for (let index = 0; index < queue.length; index += 1) {
        const record = queue[index];
        if (!record || record.cancelled || record.startedAt) {
          queue.splice(index, 1);
          index -= 1;
          continue;
        }
        if (Number(record.notBeforeAt || 0) > currentAt) continue;
        queue.splice(index, 1);
        return record;
      }
    }
    return null;
  }

  function getNextQueuedDelayMs() {
    const currentAt = nowMs();
    let earliest = Infinity;
    for (const record of getWaitingRecords()) {
      const notBeforeAt = Number(record.notBeforeAt || 0);
      if (notBeforeAt > currentAt) earliest = Math.min(earliest, notBeforeAt);
    }
    return Number.isFinite(earliest) ? Math.max(1, earliest - currentAt) : 0;
  }

  function scheduleDrain(delayMs = 0) {
    if (!active || !gateValidForCurrentGeneration() || drainTimer) return;
    drainTimer = schedule(() => {
      drainTimer = null;
      if (!active || !gateValidForCurrentGeneration()) return;
      if (!hasAuthorizationCapacity()) return;
      const record = nextQueuedRecord();
      if (!record) {
        const retryDelay = getNextQueuedDelayMs();
        if (retryDelay > 0) scheduleDrain(retryDelay);
        return;
      }
      invokeSubscription(record);
      // The next authorization request starts only after this one receives a
      // SUBSCRIBED or terminal acknowledgement and releases its slot.
      if (hasAuthorizationCapacity()) scheduleDrain(0);
    }, Math.max(0, Number(delayMs || 0)));
  }

  function enqueueSubscription(record) {
    if (!record || record.cancelled || record.startedAt || record.waiting) return;
    record.waiting = true;
    const retryState = topicRetryState.get(record.topic);
    if (retryState?.sessionCooldown === true) {
      record.waiting = false;
      record.subscribeStatus = "COOLDOWN";
      if (record.descriptor) {
        record.descriptor.state = "cooldown";
        record.descriptor.lastStatus = "COOLDOWN";
      }
      return;
    }
    record.subscribeStatus = gateValidForCurrentGeneration()
      ? "WAITING_FOR_AUTHORIZATION_SLOT"
      : "WAITING_FOR_PRESENCE";
    if (record.classification === "critical") criticalQueue.push(record);
    else optionalQueue.push(record);
    if (gateValidForCurrentGeneration()) scheduleDrain(0);
  }

  function unregisterDesiredRecord(record, { preserveDescriptor = false } = {}) {
    if (!record?.topic) return;
    const descriptor = desiredSubscriptions.get(record.topic);
    if (!descriptor || descriptor.record !== record) return;
    descriptor.desired = preserveDescriptor === true;
    descriptor.channel = preserveDescriptor ? null : descriptor.channel;
    descriptor.state = preserveDescriptor ? "suspended" : "cancelled";
    descriptor.lastStatus = record.subscribeStatus;
    if (!preserveDescriptor) desiredSubscriptions.delete(record.topic);
  }

  function registerDesiredRecord(record, channel) {
    const existing = desiredSubscriptions.get(record.topic);
    if (existing?.record && existing.record !== record && !existing.record.cancelled) {
      if (!["CHANNEL_ERROR", "TIMED_OUT", "CLOSED", "SUSPENDED_FOR_PRESENCE_RECOVERY"].includes(existing.record.subscribeStatus)) {
        duplicateRetryCount += 1;
      }
      existing.record.cancelled = true;
      existing.record.waiting = false;
      existing.record.subscribeStatus = "SUPERSEDED";
      removeQueuedRecord(existing.record);
      try {
        if (existing.channel && installedClient && typeof installedClient.removeChannel === "function") {
          void Promise.resolve(installedClient.removeChannel(existing.channel)).catch(() => {});
        } else if (typeof existing.record.cancel === "function") {
          existing.record.cancel();
        }
      } catch (_) {}
    }
    const descriptor = existing || {
      topic: record.topic,
      classification: record.classification,
      necessity: record.necessity,
      family: record.family,
      owner: record.creationCallsite,
      desired: true,
      channel: null,
      state: "created",
      generation: currentPresenceGeneration,
      retryAttempt: 0,
      retryTimer: null,
      lastSubscribeAt: 0,
      lastStatus: "CREATED",
      terminalReason: "",
      terminalError: "",
      cooldownUntil: 0,
      record: null,
    };
    descriptor.classification = record.classification;
    descriptor.necessity = record.necessity;
    descriptor.family = record.family;
    descriptor.owner = record.creationCallsite;
    descriptor.desired = true;
    descriptor.channel = channel;
    descriptor.state = record.waiting ? "waiting" : "created";
    descriptor.generation = currentPresenceGeneration;
    descriptor.record = record;
    desiredSubscriptions.set(record.topic, descriptor);
    record.descriptor = descriptor;
    const retryState = topicRetryState.get(record.topic);
    if (retryState && Number(retryState.nextAllowedAt || 0) > nowMs()) {
      record.notBeforeAt = Number(retryState.nextAllowedAt || 0);
    }
    return descriptor;
  }

  function noteTopicSubscribeResult(record, status) {
    const normalizedStatus = String(status || "").trim().toUpperCase();
    if (!record?.topic) return;
    if (normalizedStatus === "SUBSCRIBED") {
      topicRetryState.delete(record.topic);
      failedTopics.delete(record.topic);
      record.retryFailureNoted = false;
      record.terminalRecorded = false;
      if (record.descriptor) {
        record.descriptor.terminalReason = "";
        record.descriptor.terminalError = "";
        record.descriptor.cooldownUntil = 0;
      }
      return;
    }
    if (!TERMINAL_SUBSCRIBE_STATUSES.has(normalizedStatus)) return;
    if (record.cancelled === true || record.intentionalClose === true) {
      // An application/context teardown is not a failed authorization attempt.
      // Keeping it in the retry ledger can delay a same-topic reopen and can
      // push an optional active-DM topic into the session cooldown.
      if (record.preserveDesiredOnCancel !== true) {
        topicRetryState.delete(record.topic);
        failedTopics.delete(record.topic);
      }
      return;
    }
    if (record.retryFailureNoted === true) return;
    record.retryFailureNoted = true;
    const previous = topicRetryState.get(record.topic) || { attempt: 0, nextAllowedAt: 0 };
    const attempt = Math.min(8, Number(previous.attempt || 0) + 1);
    const terminalReason = classifyTerminalReason(record, normalizedStatus, record.firstFailureError);
    const terminalError = sanitizeErrorMessage(record.firstFailureError);
    const baseDelay = Math.min(
      Math.max(1_000, Number(criticalRetryCapMs || 30_000)),
      1_000 * (2 ** Math.max(0, attempt - 1)),
    );
    const jitter = Math.round(baseDelay * 0.15 * ((record.id % 5) - 2) / 2);
    const sessionCooldown = terminalReason === "RLS_UNAUTHORIZED";
    const optionalCooldown = record.classification === "optional"
      && attempt >= Math.max(1, Number(optionalCooldownAfterFailures || 2));
    const cooldownUntil = sessionCooldown
      ? SESSION_COOLDOWN_AT
      : (optionalCooldown ? nowMs() + Math.max(30_000, Number(optionalCooldownMs || 300_000)) : 0);
    const nextAllowedAt = cooldownUntil || (nowMs() + Math.max(750, baseDelay + jitter));
    topicRetryState.set(record.topic, {
      attempt,
      nextAllowedAt,
      lastStatus: normalizedStatus,
      lastFailureAt: nowMs(),
      terminalReason,
      terminalError,
      sessionCooldown,
      cooldownUntil,
    });
    failedTopics.set(record.topic, {
      topic: record.topic,
      classification: record.classification,
      family: record.family,
      status: normalizedStatus,
      terminalReason,
      terminalError,
      attempt,
      failedAt: nowMs(),
      cooldownUntil,
      sessionCooldown,
    });
    if (record.descriptor) {
      record.descriptor.terminalReason = terminalReason;
      record.descriptor.terminalError = terminalError;
      record.descriptor.cooldownUntil = cooldownUntil;
    }
    if (normalizedStatus !== "CLOSED") {
      const expectedDescriptor = desiredSubscriptions.get(record.topic);
      // Mark this before the feature callback runs. Some controllers retire
      // their channel synchronously from CHANNEL_ERROR/TIMED_OUT; that removal
      // must preserve the failure/backoff just recorded here.
      record.preserveDesiredOnCancel = true;
      const detach = () => {
        if (desiredSubscriptions.get(record.topic) !== expectedDescriptor || expectedDescriptor?.record !== record) return;
        try {
          if (installedClient && typeof installedClient.removeChannel === "function") {
            void Promise.resolve(installedClient.removeChannel(expectedDescriptor.channel)).catch(() => {});
          }
        } catch (_) {}
      };
      if (typeof queueMicrotask === "function") queueMicrotask(detach);
      else Promise.resolve().then(detach);
    }
  }

  function wrapChannel(channel, topic, options, {
    factory = "supabase.channel",
    existedBeforeBarrierInstallation = false,
  } = {}) {
    if (!channel || typeof channel.subscribe !== "function") return channel;
    if (wrappedChannels.has(channel) || channel.__altaraStartupBarrierWrapped === true) return channel;
    const privateChannel = isPrivateChannelOptions(options);
    const classification = classifyRealtimeStartupTopic(topic, { privateChannel });
    const createdAt = nowMs();
    const record = {
      id: ++nextRecordId,
      clientId: singletonClientId,
      channelId: `altara-realtime-channel-${++nextChannelId}`,
      topic: normalizeTopic(topic),
      private: privateChannel,
      classification,
      family: classifyRealtimeTopicFamily(topic),
      necessity: classifyRealtimeSubscriptionNecessity(topic),
      createdAt,
      requestedAt: createdAt,
      subscribeRequestedAt: 0,
      subscribedAt: 0,
      nativeSubscribeAt: 0,
      startedAt: 0,
      subscribeStatus: "CREATED",
      presenceBootstrapStateAtStart: "",
      bootstrapGenerationAtRequest: currentPresenceGeneration,
      presenceGenerationAtNativeSubscribe: 0,
      startedBeforeCurrentGenerationTrackOk: false,
      barrierWrapperIntercepted: true,
      factory: String(factory || "supabase.channel").slice(0, 80),
      creationCallsite: captureCallsite(),
      subscribeCallsite: "",
      nativeSubscribeCallsite: "",
      channelExistedBeforeBarrierInstallation: existedBeforeBarrierInstallation === true,
      subscribeMethodCapturedBeforeWrapping: existedBeforeBarrierInstallation === true,
      bypassReason: "",
      waiting: false,
      cancelled: false,
      errorCode: "",
      start: null,
      cancel: null,
      preserveDesiredOnCancel: false,
      notBeforeAt: 0,
      retryFailureNoted: false,
      terminalRecorded: false,
      firstFailureStatus: "",
      firstFailureError: "",
      authorizationSlotHeld: false,
      nativeRetryAttempt: 0,
      intentionalClose: false,
    };
    records.push(record);
    compactRecords();

    const originalSubscribe = channel.subscribe.bind(channel);
    const originalUnsubscribe = typeof channel.unsubscribe === "function"
      ? channel.unsubscribe.bind(channel)
      : null;
    Object.defineProperty(channel, "__altaraStartupBarrierWrapped", {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
    Object.defineProperty(channel, "__altaraStartupBarrierRecord", {
      configurable: false,
      enumerable: false,
      value: record,
      writable: false,
    });
    wrappedChannels.set(channel, record);

    const guardedRealtimeSubscribe = function guardedRealtimeSubscribe(callback, ...subscribeArgs) {
      if (record.startedAt || record.waiting) return channel;
      interceptedSubscribeCalls += 1;
      record.subscribeRequestedAt = nowMs();
      record.subscribeCallsite = captureCallsite();
      const descriptor = registerDesiredRecord(record, channel);
      const wrappedCallback = (nextStatus, error = null) => {
        record.subscribeStatus = String(nextStatus || "UNKNOWN").trim().toUpperCase();
        if (error && !record.firstFailureError) record.firstFailureError = sanitizeErrorMessage(error);
        if (TERMINAL_SUBSCRIBE_STATUSES.has(record.subscribeStatus) && !record.firstFailureStatus) {
          record.firstFailureStatus = record.subscribeStatus;
        }
        if (error) {
          record.errorCode = String(error?.code || error?.message || error || "channel_error").slice(0, 120);
        }
        const currentDescriptor = desiredSubscriptions.get(record.topic);
        const ownsCurrentDescriptor = currentDescriptor === descriptor && descriptor.record === record;
        if (!ownsCurrentDescriptor) {
          // A late status from a retired/superseded channel may be useful to
          // its feature callback, but it must never mutate the replacement's
          // desired state, generation, or retry/cooldown ledger.
          releaseAuthorizationSlot(record);
          if (typeof callback === "function") callback(nextStatus, error);
          return;
        }
        descriptor.state = record.subscribeStatus.toLowerCase();
        descriptor.lastStatus = record.subscribeStatus;
        descriptor.lastSubscribeAt = Number(record.nativeSubscribeAt || 0);
        descriptor.generation = Number(record.presenceGenerationAtNativeSubscribe || currentPresenceGeneration);
        if (TERMINAL_SUBSCRIBE_STATUSES.has(record.subscribeStatus) && !record.terminalRecorded) {
          record.terminalRecorded = true;
          descriptor.retryAttempt += 1;
          releaseAuthorizationSlot(record);
        } else if (record.subscribeStatus === "SUBSCRIBED") {
          descriptor.retryAttempt = 0;
          releaseAuthorizationSlot(record);
        }
        noteTopicSubscribeResult(record, record.subscribeStatus);
        if (typeof callback === "function") callback(nextStatus, error);
      };
      record.start = () => originalSubscribe(wrappedCallback, ...subscribeArgs);

      if (!privateChannel || classification === "presence") {
        invokeSubscription(record);
      } else {
        enqueueSubscription(record);
      }
      return channel;
    };
    Object.defineProperty(channel, "subscribe", {
      configurable: false,
      enumerable: false,
      value: guardedRealtimeSubscribe,
      writable: false,
    });

    if (originalUnsubscribe) {
      record.cancel = () => {
        if (record.cancelled) return;
        record.intentionalClose = true;
        record.cancelled = true;
        record.waiting = false;
        if (!record.startedAt) record.subscribeStatus = "CANCELLED";
        removeQueuedRecord(record);
        unregisterDesiredRecord(record, { preserveDescriptor: record.preserveDesiredOnCancel === true });
        releaseAuthorizationSlot(record);
        try { void Promise.resolve(originalUnsubscribe()).catch(() => {}); } catch (_) {}
      };
      const guardedRealtimeUnsubscribe = function guardedRealtimeUnsubscribe(...unsubscribeArgs) {
        record.intentionalClose = true;
        record.cancelled = true;
        record.waiting = false;
        if (!record.startedAt) record.subscribeStatus = "CANCELLED";
        removeQueuedRecord(record);
        unregisterDesiredRecord(record, { preserveDescriptor: record.preserveDesiredOnCancel === true });
        releaseAuthorizationSlot(record);
        return originalUnsubscribe(...unsubscribeArgs);
      };
      Object.defineProperty(channel, "unsubscribe", {
        configurable: false,
        enumerable: false,
        value: guardedRealtimeUnsubscribe,
        writable: false,
      });
    }
    return channel;
  }

  function install(supabaseClient, {
    clientId = "",
    clientCreatedAt = 0,
    getClientRegistrySnapshot: clientRegistryReader = null,
  } = {}) {
    if (!supabaseClient || typeof supabaseClient.channel !== "function") {
      throw new TypeError("realtime startup barrier requires a Supabase client");
    }
    if (installedClient === supabaseClient) return supabaseClient;
    if (installedClient) throw new Error("realtime startup barrier already owns a different client");
    const existingChannels = typeof supabaseClient.getChannels === "function"
      ? supabaseClient.getChannels()
      : (typeof supabaseClient?.realtime?.getChannels === "function" ? supabaseClient.realtime.getChannels() : []);
    if (Array.isArray(existingChannels) && existingChannels.length > 0) {
      throw new Error("realtime startup barrier must be installed before any application channel is created");
    }
    installedClient = supabaseClient;
    active = true;
    barrierInstalledAt = nowMs();
    singletonClientId = String(clientId || "altara-supabase-client-1").slice(0, 120);
    singletonClientCreatedAt = Number(clientCreatedAt || barrierInstalledAt) || barrierInstalledAt;
    getClientRegistrySnapshot = typeof clientRegistryReader === "function" ? clientRegistryReader : null;

    if (supabaseClient.realtime && typeof supabaseClient.realtime.channel === "function") {
      originalRealtimeChannelFactory = supabaseClient.realtime.channel.bind(supabaseClient.realtime);
      supabaseClient.realtime.channel = function guardedRealtimeClientChannel(topic, options = {}) {
        return wrapChannel(originalRealtimeChannelFactory(topic, options), topic, options, {
          factory: "supabase.realtime.channel",
        });
      };
    }
    originalChannelFactory = supabaseClient.channel.bind(supabaseClient);
    supabaseClient.channel = function guardedSupabaseChannel(topic, options = {}) {
      return wrapChannel(originalChannelFactory(topic, options), topic, options, {
        factory: "supabase.channel",
      });
    };
    return supabaseClient;
  }

  function activate() {
    // Compatibility no-op. The gate is fail-closed at construction/install;
    // activation is never allowed to introduce a permissive startup window.
    active = true;
    if (state === PRESENCE_BOOTSTRAP_STATES.READY && !gateReleased) {
      state = PRESENCE_BOOTSTRAP_STATES.IDLE;
    }
    return getBootstrapSnapshot();
  }

  function beginBootstrap(nextReason = "presence-start") {
    active = true;
    currentPresenceGeneration += 1;
    readyPresenceGeneration = null;
    reason = String(nextReason || "presence-start").slice(0, 120);
    state = PRESENCE_BOOTSTRAP_STATES.SUBSCRIBING;
    gateReleased = false;
    gateReleasedAt = 0;
    if (drainTimer) {
      cancelSchedule(drainTimer);
      drainTimer = null;
    }
    recordRecoveryGeneration(nextReason);
    return currentPresenceGeneration;
  }

  function markSubscribing(candidateGeneration) {
    if (!isCurrentGeneration(candidateGeneration)) return false;
    revokeReadiness(PRESENCE_BOOTSTRAP_STATES.SUBSCRIBING, reason || "presence-subscribing");
    return true;
  }

  function markSubscribed(candidateGeneration) {
    if (!isCurrentGeneration(candidateGeneration)) return false;
    state = PRESENCE_BOOTSTRAP_STATES.SUBSCRIBED;
    return true;
  }

  function markTracking(candidateGeneration) {
    if (!isCurrentGeneration(candidateGeneration)) return false;
    state = PRESENCE_BOOTSTRAP_STATES.TRACKING;
    return true;
  }

  function markDegraded(candidateGeneration) {
    if (!isCurrentGeneration(candidateGeneration)) return false;
    revokeReadiness(PRESENCE_BOOTSTRAP_STATES.DEGRADED, reason || "presence-degraded");
    return true;
  }

  function markReady(candidateGeneration) {
    if (!isCurrentGeneration(candidateGeneration)) return false;
    state = PRESENCE_BOOTSTRAP_STATES.READY;
    if (readyPresenceGeneration === currentPresenceGeneration && gateReleased) return false;
    readyPresenceGeneration = currentPresenceGeneration;
    gateReleased = true;
    gateReleasedAt = nowMs();
    releaseCount += 1;
    for (const resolve of Array.from(readyWaiters)) {
      try { resolve(true); } catch (_) {}
    }
    readyWaiters.clear();
    // Let the just-tracked Presence channel receive and render its first sync
    // before starting new private-channel authorization work.
    scheduleDrain(Math.max(0, Number(postTrackSettleMs || 0)));
    return true;
  }

  function waitForPresenceBootstrap() {
    if (gateValidForCurrentGeneration()) return Promise.resolve(true);
    return new Promise((resolve) => readyWaiters.add(resolve));
  }

  function reset({ resolveWaiters = true, cancelWaiting = false } = {}) {
    state = PRESENCE_BOOTSTRAP_STATES.IDLE;
    readyPresenceGeneration = null;
    gateReleased = false;
    gateReleasedAt = 0;
    reason = "";
    if (drainTimer) {
      cancelSchedule(drainTimer);
      drainTimer = null;
    }
    if (cancelWaiting) {
      for (const record of getWaitingRecords()) {
        if (typeof record.cancel === "function") record.cancel();
        else {
          record.cancelled = true;
          record.waiting = false;
          record.subscribeStatus = "CANCELLED";
          removeQueuedRecord(record);
        }
      }
    }
    if (resolveWaiters) {
      for (const resolve of Array.from(readyWaiters)) {
        try { resolve(false); } catch (_) {}
      }
      readyWaiters.clear();
    }
  }

  function getBootstrapSnapshot() {
    const startedBeforeReady = records.filter((record) => record.startedBeforeCurrentGenerationTrackOk === true);
    const presenceNativeBeforeCurrentGenerationTrackOk = records.filter((record) => (
      record.classification === "presence"
      && record.private === true
      && record.nativeSubscribeAt > 0
      && (!gateReleasedAt || record.nativeSubscribeAt <= gateReleasedAt)
    ));
    return {
      state,
      generation: currentPresenceGeneration,
      currentPresenceGeneration,
      readyPresenceGeneration,
      gateValidForCurrentGeneration: gateValidForCurrentGeneration(),
      reason,
      gateReleased,
      gateReleasedAt,
      gateReleasedAtIso: toIso(gateReleasedAt),
      releaseCount,
      waitingSubscriberCount: getWaitingRecords().length,
      subscriptionsStartedBeforeCurrentGenerationTrackOk: startedBeforeReady.length,
      startedBeforeCurrentGenerationTrackOkTopics: startedBeforeReady.map((record) => record.topic),
      subscriptionsStartedBeforeCurrentGenerationTrackOkTopics: startedBeforeReady.map((record) => record.topic),
      criticalEarlySubscriptionCount: startedBeforeReady.filter((record) => record.classification === "critical").length,
      optionalEarlySubscriptionCount: startedBeforeReady.filter((record) => record.classification === "optional").length,
      nativePresenceSubscribeBeforeCurrentGenerationTrackOk: presenceNativeBeforeCurrentGenerationTrackOk.length,
      nonPresenceNativeSubscribeBeforeCurrentGenerationTrackOk: startedBeforeReady.length,
      nativeSubscribeBeforeCurrentGenerationTrackOk: startedBeforeReady.length,
    };
  }

  function getStartupDebugSnapshot() {
    return records.map((record) => ({
      topic: record.topic,
      private: record.private,
      createdAt: record.createdAt,
      subscribedAt: record.subscribedAt,
      startTimestamp: toIso(record.startedAt),
      subscribeStatus: record.subscribeStatus,
      classification: record.classification,
      family: record.family,
      necessity: record.necessity,
      presenceBootstrapStateAtStart: record.presenceBootstrapStateAtStart,
      barrierState: record.presenceBootstrapStateAtStart,
      clientId: record.clientId,
      channelId: record.channelId,
      factory: record.factory,
      barrierWrapperIntercepted: record.barrierWrapperIntercepted === true,
      creationCallsite: record.creationCallsite,
      subscribeCallsite: record.subscribeCallsite,
      channelExistedBeforeBarrierInstallation: record.channelExistedBeforeBarrierInstallation === true,
      subscribeMethodCapturedBeforeWrapping: record.subscribeMethodCapturedBeforeWrapping === true,
      nativeSubscribeAt: record.nativeSubscribeAt,
      presenceGenerationAtNativeSubscribe: record.presenceGenerationAtNativeSubscribe,
      startedBeforeCurrentGenerationTrackOk: record.startedBeforeCurrentGenerationTrackOk === true,
      reason: record.bypassReason,
    }));
  }

  function toBypassDebugRecord(record = {}) {
    return {
      topic: String(record.topic || ""),
      createdAt: Number(record.createdAt || 0),
      subscribedAt: Number(record.subscribedAt || 0),
      clientId: String(record.clientId || ""),
      channelId: String(record.channelId || ""),
      barrierState: String(record.presenceBootstrapStateAtStart || ""),
      creationCallsite: String(record.creationCallsite || ""),
      subscribeCallsite: String(record.subscribeCallsite || ""),
      reason: String(record.bypassReason || ""),
    };
  }

  function getBarrierDebugSnapshot() {
    const clientRegistry = getClientRegistrySnapshot ? getClientRegistrySnapshot() : {
      applicationClientCount: installedClient ? 1 : 0,
      clientIds: installedClient ? [singletonClientId] : [],
      createdAt: installedClient ? [singletonClientCreatedAt] : [],
    };
    const currentDesired = Array.from(desiredSubscriptions.values()).filter((descriptor) => descriptor.desired);
    const activeRecords = records.filter((record) => !record.cancelled && record.nativeSubscribeAt > 0 && ![
      "CHANNEL_ERROR",
      "TIMED_OUT",
      "CLOSED",
      "CANCELLED",
      "SUPERSEDED",
      "SUSPENDED_FOR_PRESENCE_RECOVERY",
    ].includes(record.subscribeStatus));
    const topicFamilies = {};
    for (const descriptor of currentDesired) {
      topicFamilies[descriptor.family] = Number(topicFamilies[descriptor.family] || 0) + 1;
    }
    const duplicateTopicCount = Math.max(0, currentDesired.length - new Set(currentDesired.map((entry) => entry.topic)).size);
    while (retryTimestamps.length && nowMs() - retryTimestamps[0] > RETRY_WINDOW_MS) retryTimestamps.shift();
    const currentAt = nowMs();
    const recentRecoveryEvents = recoveryEvents.filter((entry) => currentAt - entry.at <= RECOVERY_WINDOW_MS);
    const cooldownEntries = Array.from(topicRetryState.entries())
      .filter(([, entry]) => entry?.sessionCooldown === true || Number(entry?.cooldownUntil || 0) > currentAt)
      .map(([topic, entry]) => ({
        topic,
        reason: String(entry?.terminalReason || entry?.lastStatus || ""),
        attempt: Math.max(0, Number(entry?.attempt || 0)),
        cooldownUntil: entry?.sessionCooldown === true ? "session" : Number(entry?.cooldownUntil || 0),
      }));
    return {
      barrierInstalledAt,
      singletonClientId,
      applicationClientCount: Number(clientRegistry?.applicationClientCount || 0),
      applicationClientIds: Array.isArray(clientRegistry?.clientIds) ? [...clientRegistry.clientIds] : [],
      totalNativeSubscribeCalls,
      joinAttemptsLast60s: nativeSubscribeTimestamps.filter((at) => currentAt - at <= 60_000).length,
      joinAttemptsLast5m: nativeSubscribeTimestamps.filter((at) => currentAt - at <= 5 * 60_000).length,
      interceptedSubscribeCalls,
      bypassedSubscribeCalls,
      currentPresenceGeneration,
      readyPresenceGeneration,
      gateValidForCurrentGeneration: gateValidForCurrentGeneration(),
      nativeSubscribeBeforeCurrentGenerationTrackOk: records.filter((record) => record.startedBeforeCurrentGenerationTrackOk === true).length,
      nonPresenceNativeSubscribeBeforeCurrentGenerationTrackOk: records.filter((record) => record.startedBeforeCurrentGenerationTrackOk === true).length,
      channelsActive: activeRecords.length,
      channelsDesired: currentDesired.length,
      uniqueDesiredTopics: new Set(currentDesired.map((entry) => entry.topic)).size,
      duplicateTopicCount,
      automaticRejoinPreventedCount,
      authorizationInFlightCount: authorizationInFlight.size,
      authorizationConcurrencyLimit: Math.max(1, Number(authorizationConcurrency || 1)),
      maximumAuthorizationConcurrencyObserved,
      socketRecoveriesLast5m: recentRecoveryEvents.filter((entry) => entry.origin === "socket-driven").length,
      clientRecoveriesLast5m: recentRecoveryEvents.filter((entry) => entry.origin === "client-driven").length,
      recoveryReasons: recentRecoveryEvents.map((entry) => ({ ...entry, atIso: toIso(entry.at) })),
      topicFamilies,
      retry: {
        channelsWithPendingRetry: Array.from(topicRetryState.values()).filter((entry) => (
          entry?.sessionCooldown !== true
          && !(Number(entry?.cooldownUntil || 0) > currentAt)
          && Number(entry?.nextAllowedAt || 0) > currentAt
        )).length,
        duplicateRetryCount,
        retriesLast60s: retryTimestamps.length,
      },
      failedTopics: Array.from(failedTopics.values()).map((entry) => ({
        ...entry,
        failedAtIso: toIso(entry.failedAt),
        cooldownUntil: entry.sessionCooldown ? "session" : entry.cooldownUntil,
      })),
      cooldownTopics: cooldownEntries,
      desiredSubscriptions: currentDesired.map((descriptor) => ({
        topic: descriptor.topic,
        classification: descriptor.classification,
        necessity: descriptor.necessity,
        family: descriptor.family,
        owner: descriptor.owner,
        desired: descriptor.desired === true,
        state: descriptor.state,
        generation: descriptor.generation,
        retryAttempt: descriptor.retryAttempt,
        lastSubscribeAt: descriptor.lastSubscribeAt,
        lastStatus: descriptor.lastStatus,
        terminalReason: descriptor.terminalReason,
        terminalError: descriptor.terminalError,
        cooldownUntil: descriptor.cooldownUntil === SESSION_COOLDOWN_AT ? "session" : descriptor.cooldownUntil,
      })),
      bypasses: bypasses.map(toBypassDebugRecord),
      channels: getStartupDebugSnapshot(),
    };
  }

  function suspendNonPresenceChannels(nextReason = "presence-recovery") {
    revokeReadiness(PRESENCE_BOOTSTRAP_STATES.RECONNECTING, nextReason);
    if (!installedClient) return Promise.resolve([]);
    let channels = [];
    try {
      channels = typeof installedClient.getChannels === "function"
        ? (installedClient.getChannels() || [])
        : (installedClient?.realtime?.getChannels?.() || []);
    } catch (_) {
      channels = [];
    }
    const removals = [];
    for (const channel of channels) {
      const record = wrappedChannels.get(channel) || channel?.__altaraStartupBarrierRecord || null;
      const topic = normalizeTopic(record?.topic || channel?.topic || "");
      if (!topic || topic === PRESENCE_TOPIC) continue;
      automaticRejoinPreventedCount += 1;
      if (record) {
        record.preserveDesiredOnCancel = true;
        record.cancelled = true;
        record.waiting = false;
        record.subscribeStatus = "SUSPENDED_FOR_PRESENCE_RECOVERY";
        removeQueuedRecord(record);
        unregisterDesiredRecord(record, { preserveDescriptor: true });
        releaseAuthorizationSlot(record);
      }
      try {
        if (typeof installedClient.removeChannel === "function") {
          removals.push(Promise.resolve(installedClient.removeChannel(channel)).catch(() => "error"));
        } else if (typeof channel?.unsubscribe === "function") {
          removals.push(Promise.resolve(channel.unsubscribe()).catch(() => "error"));
        }
      } catch (_) {}
    }
    return Promise.allSettled(removals);
  }

  function pruneSuspendedDesiredSubscriptions() {
    let removed = 0;
    for (const [topic, descriptor] of Array.from(desiredSubscriptions.entries())) {
      if (descriptor?.state !== "suspended" || descriptor?.channel) continue;
      desiredSubscriptions.delete(topic);
      removed += 1;
    }
    return removed;
  }

  function retireDesiredTopic(topicInput = "") {
    const topic = normalizeTopic(topicInput);
    if (!topic || topic === PRESENCE_TOPIC) return false;
    const descriptor = desiredSubscriptions.get(topic) || null;
    const record = descriptor?.record || null;
    if (record) {
      record.preserveDesiredOnCancel = false;
      record.intentionalClose = true;
      record.cancelled = true;
      record.waiting = false;
      if (!record.startedAt) record.subscribeStatus = "CANCELLED";
      removeQueuedRecord(record);
      releaseAuthorizationSlot(record);
    }
    if (descriptor) {
      descriptor.desired = false;
      descriptor.state = "cancelled";
      desiredSubscriptions.delete(topic);
    }
    topicRetryState.delete(topic);
    failedTopics.delete(topic);
    return !!(descriptor || record);
  }

  return Object.freeze({
    install,
    activate,
    beginBootstrap,
    invalidateCurrentGeneration: (nextReason = "presence-unhealthy") => revokeReadiness(PRESENCE_BOOTSTRAP_STATES.DEGRADED, nextReason),
    suspendNonPresenceChannels,
    pruneSuspendedDesiredSubscriptions,
    retireDesiredTopic,
    markSubscribing,
    markSubscribed,
    markTracking,
    markDegraded,
    markReady,
    waitForPresenceBootstrap,
    reset,
    getBootstrapSnapshot,
    getStartupDebugSnapshot,
    getBarrierDebugSnapshot,
  });
}
