// presence.js
// Supabase Realtime Presence (Discord-like)

export function createPresenceSystem({
  supabase,
  getMe,
  onPresenceList,
  onError,
  onStatus,
  onTrace,
  manageReconnectExternally = false,
}) {
  const PRESENCE_CHANNEL_NAME = "altara-presence-global";
  const PRESENCE_HEARTBEAT_MS = 25000;
  const PRESENCE_TRACK_MIN_INTERVAL_MS = 8000;
  const PRESENCE_TRACK_SAME_STATE_REFRESH_MS = 20000;
  const REMOTE_PRESENCE_GRACE_MS = Math.max(60000, PRESENCE_HEARTBEAT_MS * 2);

  let channel = null;
  let started = false;
  let heartbeatTimer = null;
  let gracePruneTimer = null;
  let reconnectTimer = null;
  let currentStatus = "online";
  let lastEmittedSignature = "";
  let fallbackSessionId = "";
  const fallbackOnlineAt = new Date().toISOString();
  let channelStatus = "IDLE";
  let lastPresenceSyncAt = 0;
  let lastPresenceTrackAt = 0;
  let lastPresenceError = "";
  let lastTrackResult = "";
  let lastTrackPayload = null;
  let lastRawPresenceState = {};
  let lastLiveSessionsByUserId = new Map();
  let lastSeenLiveAtByUserId = new Map();
  let lastLiveSessionSnapshotByUserId = new Map();
  let lastRawSessionCountByUserId = new Map();
  let lastEmittedRawPayloadCount = 0;
  let lastMissingOwnRetrackAt = 0;
  let ownSessionVisibleCheckTimer = null;
  let ownSessionMissingRetryTimer = null;
  let ownSessionInitialRetrackDone = false;
  let trackGeneration = 0;
  let subscribedTrackEpoch = 0;
  let trackInFlight = null;
  let activeTrackSignature = "";
  let activeTrackEpoch = 0;
  let pendingTrackRequest = null;
  let pendingTrackTimer = null;
  let lastTrackSignature = "";
  let lastTrackSentAt = 0;

  function tracePresence(stage = "", details = {}) {
    try {
      onTrace?.(String(stage || "UNKNOWN"), details && typeof details === "object" ? details : {});
    } catch (_) {}
  }

  function isPresenceLiveDebugEnabled() {
    try {
      return globalThis.localStorage?.getItem?.("altara.debug.presence") === "1";
    } catch (_) {
      return false;
    }
  }

  function logPresenceLiveDebug(event = "", details = {}) {
    if (!isPresenceLiveDebugEnabled()) return;
    try {
      console.info("[Presence] " + String(event || "event"), details && typeof details === "object" ? details : {});
    } catch (_) {}
  }

  function logPresenceTrackLifecycle(event = "", details = {}, { error = false } = {}) {
    try {
      const logger = error ? console.warn : console.info;
      logger.call(console, "[presence] " + String(event || "event"), details && typeof details === "object" ? details : {});
    } catch (_) {}
  }

  function normalizeManualStatus(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "online" || s === "idle" || s === "focus" || s === "dnd" || s === "invisible") return s;
    return "online";
  }

  function normalizeEffectiveStatus(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "online" || s === "idle" || s === "focus" || s === "dnd") return s;
    return "offline";
  }

  function resolveEffectiveStatus(manualStatus, hasLiveSession) {
    const manual = normalizeManualStatus(manualStatus);
    if (!hasLiveSession) return "offline";
    if (manual === "invisible") return "offline";
    if (manual === "idle" || manual === "focus" || manual === "dnd" || manual === "online") return manual;
    return "online";
  }

  function getPresenceStatusPriority(status = "") {
    const s = normalizeManualStatus(status);
    if (s === "focus") return 4;
    if (s === "dnd") return 3;
    if (s === "idle") return 2;
    if (s === "online") return 1;
    return 0;
  }

  function resolveUserPresenceFromSessions(userId = "", sessions = []) {
    const liveSessions = (Array.isArray(sessions) ? sessions : [])
      .filter(Boolean)
      .map((session) => ({
        ...session,
        user_id: userId || session?.user_id || session?.id || "",
        id: userId || session?.id || session?.user_id || "",
        manual_status: normalizeManualStatus(session?.manual_status || session?.manualStatus || session?.status || "online"),
        status: normalizeEffectiveStatus(session?.status || "online"),
      }));

    if (!liveSessions.length) {
      return {
        userId,
        hasLiveSession: false,
        manualStatus: "online",
        effectiveStatus: "offline",
        session: null,
        publicSessions: [],
        liveSessions,
      };
    }

    const publicSessions = liveSessions.filter((session) => normalizeManualStatus(session?.manual_status) !== "invisible");
    if (!publicSessions.length) {
      const latestInvisible = liveSessions.reduce((best, session) => {
        const sessionMs = Number(session?.last_seen_ms || 0);
        const bestMs = Number(best?.last_seen_ms || 0);
        return sessionMs >= bestMs ? session : best;
      }, liveSessions[0] || null);
      return {
        userId,
        hasLiveSession: true,
        manualStatus: "invisible",
        effectiveStatus: "offline",
        session: latestInvisible,
        publicSessions: [],
        liveSessions,
      };
    }

    const bestPublicSession = publicSessions.reduce((best, session) => {
      if (!best) return session;
      const sessionPriority = getPresenceStatusPriority(session?.manual_status);
      const bestPriority = getPresenceStatusPriority(best?.manual_status);
      if (sessionPriority !== bestPriority) return sessionPriority > bestPriority ? session : best;
      const sessionMs = Number(session?.last_seen_ms || 0);
      const bestMs = Number(best?.last_seen_ms || 0);
      return sessionMs >= bestMs ? session : best;
    }, null);
    const manualStatus = normalizeManualStatus(bestPublicSession?.manual_status || "online");
    return {
      userId,
      hasLiveSession: true,
      manualStatus,
      effectiveStatus: resolveEffectiveStatus(manualStatus, true),
      session: bestPublicSession,
      publicSessions,
      liveSessions,
    };
  }

  function makeSessionId() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (_) {}
    return String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function getSessionId(payload = {}) {
    const provided = String(payload.session_id || payload.sessionId || "").trim();
    if (provided) return provided;
    if (!fallbackSessionId) fallbackSessionId = makeSessionId();
    return fallbackSessionId;
  }

  function normalizeDeviceType(value = "") {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "electron" || raw === "browser" || raw === "web") return raw;
    try {
      const ua = String(navigator?.userAgent || "").toLowerCase();
      if (ua.includes("electron")) return "electron";
    } catch (_) {}
    return "browser";
  }

  function toEpochMs(value) {
    if (!value) return 0;
    const ms = Date.parse(String(value));
    return Number.isFinite(ms) ? ms : 0;
  }

  const PRESENCE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function normalizePresenceUserId(value = "") {
    const raw = String(value || "").trim();
    return PRESENCE_UUID_RE.test(raw) ? raw.toLowerCase() : raw;
  }

  function getPayloadUserId(payload = {}, presenceKey = "") {
    const nested = payload?.payload && typeof payload.payload === "object" ? payload.payload : {};
    const explicitId = nested?.user_id
      || nested?.userId
      || nested?.id
      || payload?.user_id
      || payload?.userId
      || payload?.id
      || "";
    if (explicitId) return normalizePresenceUserId(explicitId);

    // Supabase documents presenceState() as a map keyed by a user-defined
    // presence key. Accept a UUID key as the final compatibility fallback, but
    // never reinterpret an arbitrary session/presence_ref string as a user.
    const fallbackId = normalizePresenceUserId(presenceKey);
    return PRESENCE_UUID_RE.test(fallbackId) ? fallbackId : "";
  }

  function normalizePresencePayloadList(value) {
    const out = [];
    const visit = (item, depth = 0, inherited = {}) => {
      if (depth > 4) return;
      if (Array.isArray(item)) {
        item.forEach((entry) => visit(entry, depth + 1, inherited));
        return;
      }
      if (!item || typeof item !== "object") return;
      const wrapper = { ...inherited, ...item };
      delete wrapper.metas;
      delete wrapper.presences;
      if (Array.isArray(item.metas)) {
        visit(item.metas, depth + 1, wrapper);
        return;
      }
      if (Array.isArray(item.presences)) {
        visit(item.presences, depth + 1, wrapper);
        return;
      }
      out.push(wrapper);
    };
    visit(value);
    return out;
  }

  function getRawPayloadCount(state = {}) {
    let payloadCount = 0;
    for (const value of Object.values(state || {})) payloadCount += normalizePresencePayloadList(value).length;
    return payloadCount;
  }

  function summarizeRawPresenceState(state = {}) {
    const keys = Object.keys(state || {});
    return { keys, payloadCount: getRawPayloadCount(state) };
  }

  function unwrapPresencePayload(payload = {}) {
    const raw = payload && typeof payload === "object" ? payload : {};
    const nested = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
    return nested && Object.keys(nested).length ? { ...raw, ...nested } : raw;
  }

  function compactPresencePayload(payload = {}) {
    const p = unwrapPresencePayload(payload || {});
    return {
      user_id: getPayloadUserId(p),
      session_id: String(p.session_id || p.sessionId || "").trim(),
      presence_ref: String(p.presence_ref || p.phx_ref || "").trim(),
      manual_status: normalizeManualStatus(p.manual_status || p.manualStatus || p.status || "online"),
      device_type: normalizeDeviceType(p.device_type || p.deviceType),
      online_at: String(p.online_at || p.onlineAt || "").trim(),
      last_seen_at: String(p.last_seen_at || p.lastSeenAt || p.last_seen || p.lastSeen || "").trim(),
    };
  }

  function compactRawPresencePayloads(state = {}) {
    const payloads = [];
    for (const value of Object.values(state || {})) {
      normalizePresencePayloadList(value).forEach((payload) => {
        payloads.push(compactPresencePayload(payload));
      });
    }
    return payloads;
  }

  function traceRawPresenceState(source = "state", targetChannel = channel) {
    let state = {};
    try {
      state = targetChannel?.presenceState ? (targetChannel.presenceState() || {}) : {};
    } catch (error) {
      tracePresence("PRESENCE_STATE_RAW", {
        source,
        error: String(error?.message || error || "presence_state_failed"),
      });
      return state;
    }
    const metas = [];
    for (const [stateKey, value] of Object.entries(state || {})) {
      normalizePresencePayloadList(value).forEach((item) => {
        const payload = unwrapPresencePayload(item || {});
        metas.push({
          stateKey: String(stateKey || ""),
          id: normalizePresenceUserId(payload?.id || ""),
          user_id: normalizePresenceUserId(payload?.user_id || ""),
          userId: normalizePresenceUserId(payload?.userId || ""),
          session_id: String(payload?.session_id || payload?.sessionId || ""),
          presence_ref: String(payload?.presence_ref || payload?.phx_ref || ""),
          manual_status: normalizeManualStatus(payload?.manual_status || payload?.manualStatus || payload?.status || "online"),
          status: normalizeEffectiveStatus(payload?.status || "online"),
          has_live_session: payload?.has_live_session === true || payload?.hasLiveSession === true,
        });
      });
    }
    tracePresence("PRESENCE_STATE_RAW", {
      source,
      stateKeys: Object.keys(state || {}),
      metaCount: metas.length,
      metas,
    });
    return state;
  }

  function getPresenceEventSenderIds(payload = null, targetChannel = channel) {
    const senderIds = new Set();
    const raw = payload && typeof payload === "object" ? payload : {};
    const presenceKey = String(raw?.key || raw?.presence_key || raw?.presenceKey || "").trim();
    const candidates = [
      raw,
      raw?.currentPresences,
      raw?.newPresences,
      raw?.leftPresences,
      raw?.metas,
      raw?.presences,
    ];
    candidates.forEach((candidate) => {
      normalizePresencePayloadList(candidate).forEach((item) => {
        const senderId = getPayloadUserId(unwrapPresencePayload(item || {}), presenceKey);
        if (senderId) senderIds.add(senderId);
      });
    });
    if (!senderIds.size) {
      let state = {};
      try { state = targetChannel?.presenceState ? (targetChannel.presenceState() || {}) : {}; } catch (_) {}
      for (const [stateKey, value] of Object.entries(state || {})) {
        normalizePresencePayloadList(value).forEach((item) => {
          const senderId = getPayloadUserId(unwrapPresencePayload(item || {}), stateKey);
          if (senderId) senderIds.add(senderId);
        });
      }
    }
    return Array.from(senderIds);
  }

  function tracePresenceEvent(eventType = "sync", payload = null, targetChannel = channel) {
    const senderIds = getPresenceEventSenderIds(payload, targetChannel);
    tracePresence("PRESENCE_EVENT", {
      channelGeneration: trackGeneration,
      topic: getChannelTopic(targetChannel),
      eventType: String(eventType || "sync"),
      timestamp: new Date().toISOString(),
      senderId: senderIds[0] || "",
      senderIds,
      rawPayload: payload ?? null,
    });
  }

  function getSupabaseUrl() {
    try {
      return String(supabase?.supabaseUrl || supabase?.rest?.url || "").trim();
    } catch (_) {
      return "";
    }
  }

  function getChannelTopic(targetChannel = channel) {
    return String(targetChannel?.topic || targetChannel?.subTopic || targetChannel?.channelName || "").trim();
  }

  function isRealtimeSocketConnected() {
    try {
      if (typeof supabase?.realtime?.isConnected === "function") return !!supabase.realtime.isConnected();
      const state = supabase?.realtime?.conn?.readyState ?? supabase?.realtime?.socket?.readyState;
      return state === 1 || state === "open" || state === "OPEN";
    } catch (_) {
      return false;
    }
  }

  function isGlobalPresenceChannel(targetChannel = null) {
    const topic = getChannelTopic(targetChannel);
    return topic === PRESENCE_CHANNEL_NAME || topic === `realtime:${PRESENCE_CHANNEL_NAME}`;
  }

  function isCurrentChannelActiveOrJoining() {
    return !!channel && started && (channelStatus === "JOINING" || channelStatus === "SUBSCRIBED");
  }

  async function discardFailedCurrentChannel(reason = "restart") {
    const failedChannel = channel;
    if (!failedChannel) return;
    // Invalidate the old callback/track epoch before releasing the channel so
    // a late status or track result cannot take ownership of the replacement.
    trackGeneration += 1;
    subscribedTrackEpoch += 1;
    trackInFlight = null;
    activeTrackSignature = "";
    activeTrackEpoch = 0;
    channel = null;
    started = false;
    channelStatus = "RESTARTING";
    logPresenceLiveDebug("discard failed channel", {
      reason,
      topic: getChannelTopic(failedChannel),
    });
    try {
      await Promise.resolve(supabase.removeChannel(failedChannel));
    } catch (error) {
      logPresenceLiveDebug("discard failed channel cleanup failed", {
        reason,
        topic: getChannelTopic(failedChannel),
        error: String(error?.message || error || "unknown"),
      });
    }
  }

  async function removeExistingGlobalPresenceChannels() {
    let channels = [];
    try {
      channels = typeof supabase?.getChannels === "function" ? (supabase.getChannels() || []) : [];
    } catch (_) {
      channels = [];
    }
    const stale = channels.filter((candidate) => candidate && candidate !== channel && isGlobalPresenceChannel(candidate));
    if (!stale.length) return;
    logPresenceLiveDebug("remove stale global presence channels", {
      count: stale.length,
      topics: stale.map((candidate) => getChannelTopic(candidate)).filter(Boolean),
    });
    for (const candidate of stale) {
      try {
        await Promise.resolve(supabase.removeChannel(candidate));
      } catch (error) {
        logPresenceLiveDebug("remove stale global presence channel failed", {
          topic: getChannelTopic(candidate),
          error: String(error?.message || error || "unknown"),
        });
      }
    }
  }

  function scheduleReconnect(reason = "channel_unstable") {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!started) return;
      void (async () => {
        const oldChannel = channel;
        try {
          if (oldChannel) await Promise.resolve(supabase.removeChannel(oldChannel));
        } catch (_) {}
        channel = null;
        channelStatus = "RECONNECTING";
        started = false;
        logPresenceLiveDebug("channel reconnecting", { reason });
        await start();
      })().catch((error) => {
        lastPresenceError = String(error?.message || error || "unknown");
        logPresenceLiveDebug("channel reconnect failed", {
          reason,
          error: lastPresenceError,
        });
      });
    }, 2000);
  }

  function isDocumentVisible() {
    try {
      if (typeof document === "undefined") return true;
      return document.visibilityState !== "hidden";
    } catch (_) {
      return true;
    }
  }

  function clearOwnSessionTimers() {
    if (ownSessionVisibleCheckTimer) {
      clearTimeout(ownSessionVisibleCheckTimer);
      ownSessionVisibleCheckTimer = null;
    }
    if (ownSessionMissingRetryTimer) {
      clearInterval(ownSessionMissingRetryTimer);
      ownSessionMissingRetryTimer = null;
    }
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearPendingTrackTimer() {
    if (!pendingTrackTimer) return;
    clearTimeout(pendingTrackTimer);
    pendingTrackTimer = null;
  }

  function beginSubscribedTrackEpoch() {
    subscribedTrackEpoch += 1;
    clearPendingTrackTimer();
    pendingTrackRequest = null;
    // A track promise owned by an earlier socket/channel subscription must not
    // occupy the new subscription's single-flight slot. Its eventual result is
    // epoch-rejected below and cannot overwrite this subscription's state.
    trackInFlight = null;
    activeTrackSignature = "";
    activeTrackEpoch = 0;
    lastTrackSentAt = 0;
    lastTrackSignature = "";
    return subscribedTrackEpoch;
  }

  function getTrackPayloadSignature(payload = {}) {
    const {
      last_seen_at: _lastSeenAt,
      last_seen: _lastSeen,
      ...stablePayload
    } = payload && typeof payload === "object" ? payload : {};
    return JSON.stringify(stablePayload);
  }

  function storePendingTrackRequest(statusOverride = "", force = false) {
    pendingTrackRequest = {
      statusOverride: String(statusOverride || currentStatus || "online"),
      force: force === true || pendingTrackRequest?.force === true,
    };
  }

  function schedulePendingTrackRequest() {
    if (!pendingTrackRequest || pendingTrackTimer || trackInFlight) return;
    const elapsed = Date.now() - Math.max(0, Number(lastTrackSentAt || 0));
    const delayMs = Math.max(0, PRESENCE_TRACK_MIN_INTERVAL_MS - elapsed);
    pendingTrackTimer = setTimeout(() => {
      pendingTrackTimer = null;
      const request = pendingTrackRequest;
      pendingTrackRequest = null;
      if (!request) return;
      void trackNow(request.statusOverride, { force: request.force }).catch((error) => {
        lastPresenceError = String(error?.message || error || "presence_track_flush_failed");
        onError?.(error);
      });
    }, delayMs);
  }

  function normalizeActivity(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || "").trim().toLowerCase();
    const name = String(raw.name || "").trim().slice(0, 96);
    const startedAt = Number(raw.startedAt || 0);
    if (type === "listening") {
      const provider = String(raw.provider || "").trim().toLowerCase();
      const title = String(raw.title || raw.name || "").trim().slice(0, 160);
      const artist = String(raw.artist || raw.details || "").trim().slice(0, 160);
      const durationMs = Number(raw.durationMs || raw.duration_ms || 0);
      const progressMs = Number(raw.progressMs || raw.progress_ms || 0);
      const fetchedAt = Number(raw.fetchedAt || raw.fetched_at || raw.updatedAt || raw.updated_at || Date.now());
      const isPlaying = raw.isPlaying !== false && raw.is_playing !== false;
      if (provider !== "spotify" || !title || !isPlaying) return null;
      return {
        type: "listening",
        provider: "spotify",
        trackId: String(raw.trackId || raw.track_id || raw.id || "").trim().slice(0, 120) || undefined,
        name: title,
        title,
        details: artist || undefined,
        artist: artist || undefined,
        album: String(raw.album || "").trim().slice(0, 160) || undefined,
        artworkUrl: String(raw.artworkUrl || raw.artwork_url || raw.cover || raw.icon || "").trim().slice(0, 512) || undefined,
        progressMs: Number.isFinite(progressMs) ? Math.max(0, Math.round(progressMs)) : 0,
        durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
        startedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? Math.max(1, Math.round(fetchedAt) - Math.max(0, Math.round(Number.isFinite(progressMs) ? progressMs : 0))) : (Number.isFinite(startedAt) && startedAt > 0 ? startedAt : Date.now()),
        fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? Math.round(fetchedAt) : Date.now(),
        updatedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? Math.round(fetchedAt) : Date.now(),
        externalUrl: String(raw.externalUrl || raw.external_url || "").trim().slice(0, 512) || undefined,
        showOnProfile: raw.showOnProfile !== false && raw.show_on_profile !== false,
        showProgress: raw.showProgress !== false && raw.show_progress !== false,
        activityVerb: "listening",
      };
    }
    if (type !== "playing" || !name || !Number.isFinite(startedAt) || startedAt <= 0) return null;
    const kind = String(raw.kind || "").trim().toLowerCase() === "app" ? "app" : "game";
    const activityVerb = String(raw.activityVerb || raw.activity_verb || "").trim().toLowerCase() === "using"
      ? "using"
      : (kind === "app" ? "using" : "playing");
    return {
      type: "playing",
      name,
      gameId: String(raw.gameId || "").trim().slice(0, 96) || undefined,
      kind,
      activityVerb,
      startedAt,
      icon: String(raw.icon || "").trim().slice(0, 512) || undefined,
      cover: String(raw.cover || "").trim().slice(0, 512) || undefined,
      background: String(raw.background || "").trim().slice(0, 512) || undefined,
      provider: String(raw.provider || "").trim().slice(0, 32) || undefined,
      providerId: String(raw.providerId || "").trim().slice(0, 80) || undefined,
      slug: String(raw.slug || "").trim().slice(0, 120) || undefined,
    };
  }

  function clearHeartbeat() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function clearGracePruneTimer() {
    if (!gracePruneTimer) return;
    clearInterval(gracePruneTimer);
    gracePruneTimer = null;
  }

  function buildTrackPayload(statusOverride = "") {
    const payload = getMe?.() || {};
    const nextManualStatus = normalizeManualStatus(statusOverride || payload.manual_status || payload.manualStatus || payload.status || currentStatus || "online");
    const activity = normalizeActivity(payload.activity || payload.spotify_activity || payload.spotifyActivity);
    const nowIso = new Date().toISOString();
    const sessionId = getSessionId(payload);
    const userId = getPayloadUserId(payload);
    if (!userId) {
      logPresenceLiveDebug("track fail", { reason: "missing_user_id" });
      return null;
    }
    currentStatus = nextManualStatus;
    const trackedPayload = {
      ...payload,
      id: userId,
      user_id: userId,
      session_id: sessionId,
      manual_status: nextManualStatus,
      status: resolveEffectiveStatus(nextManualStatus, true),
      has_live_session: true,
      online_at: payload.online_at || payload.onlineAt || fallbackOnlineAt,
      last_seen_at: nowIso,
      last_seen: nowIso,
      device_type: normalizeDeviceType(payload.device_type || payload.deviceType),
    };
    if (activity) trackedPayload.activity = activity;
    else trackedPayload.activity = null;
    trackedPayload.spotify_activity = activity?.type === "listening" && activity?.provider === "spotify" ? activity : null;
    return { userId, sessionId, manualStatus: nextManualStatus, trackedPayload };
  }

  async function trackNow(statusOverride = "", { force = false } = {}) {
    if (!started || !channel || channelStatus !== "SUBSCRIBED") return null;
    try {
      const built = buildTrackPayload(statusOverride);
      if (!built) return null;
      const { userId, sessionId, manualStatus, trackedPayload } = built;
      const signature = getTrackPayloadSignature(trackedPayload);
      const nowMs = Date.now();
      if (
        force !== true
        && signature === lastTrackSignature
        && nowMs - Math.max(0, Number(lastTrackSentAt || 0)) < PRESENCE_TRACK_SAME_STATE_REFRESH_MS
      ) {
        return "deduped";
      }
      if (trackInFlight) {
        if (force !== true && signature === activeTrackSignature) return trackInFlight;
        storePendingTrackRequest(statusOverride, force);
        return trackInFlight;
      }
      const elapsed = nowMs - Math.max(0, Number(lastTrackSentAt || 0));
      if (lastTrackSentAt && elapsed < PRESENCE_TRACK_MIN_INTERVAL_MS) {
        storePendingTrackRequest(statusOverride, force);
        schedulePendingTrackRequest();
        return "queued";
      }

      clearPendingTrackTimer();
      const targetChannel = channel;
      const targetGeneration = trackGeneration;
      const targetTrackEpoch = subscribedTrackEpoch;
      activeTrackSignature = signature;
      activeTrackEpoch = targetTrackEpoch;
      lastTrackPayload = { ...trackedPayload };
      logPresenceLiveDebug("track payload", { userId, sessionId, manualStatus });
      logPresenceTrackLifecycle("track payload", compactPresencePayload(trackedPayload));
      const trackTask = (async () => {
        tracePresence("TRACK_CALL", {
          channelGeneration: targetGeneration,
          trackEpoch: targetTrackEpoch,
          userId,
          manualStatus,
          effectiveStatus: trackedPayload.status,
          payloadKeys: Object.keys(trackedPayload).sort(),
          payload: compactPresencePayload(trackedPayload),
        });
        logPresenceTrackLifecycle("track call", {
          topic: getChannelTopic(targetChannel),
          userId,
          sessionId,
          trackEpoch: targetTrackEpoch,
        });
        const result = await targetChannel.track(trackedPayload);
        tracePresence("TRACK_RESULT", {
          channelGeneration: targetGeneration,
          trackEpoch: targetTrackEpoch,
          currentGeneration: targetGeneration === trackGeneration,
          currentTrackEpoch: targetTrackEpoch === subscribedTrackEpoch,
          rawResult: typeof result === "undefined" ? "undefined" : String(result),
        });
        traceRawPresenceState("after-track", targetChannel);
        logPresenceTrackLifecycle("track result", {
          topic: getChannelTopic(targetChannel),
          userId,
          sessionId,
          result: String(result || "ok"),
          currentGeneration: targetGeneration === trackGeneration,
          currentTrackEpoch: targetTrackEpoch === subscribedTrackEpoch,
        });
        if (
          targetGeneration === trackGeneration
          && targetTrackEpoch === subscribedTrackEpoch
          && targetChannel === channel
        ) {
          const normalizedResult = String(result || "ok").trim().toLowerCase();
          if (normalizedResult !== "ok") {
            lastPresenceError = String(result);
            lastTrackSentAt = 0;
            lastTrackSignature = "";
            logPresenceTrackLifecycle("track error", {
              topic: getChannelTopic(targetChannel),
              userId,
              sessionId,
              result: String(result || "unknown"),
            }, { error: true });
          } else {
            lastTrackSentAt = Date.now();
            lastPresenceTrackAt = lastTrackSentAt;
            lastTrackSignature = signature;
            lastPresenceError = "";
            logPresenceTrackLifecycle("track success", {
              topic: getChannelTopic(targetChannel),
              userId,
              sessionId,
              result: String(result || "ok"),
            });
          }
          lastTrackResult = typeof result === "undefined" ? "" : String(result);
          logPresenceLiveDebug("track result", {
            userId,
            sessionId,
            manualStatus,
            result: lastTrackResult,
          });
        }
        return result;
      })();
      trackInFlight = trackTask;
      try {
        return await trackTask;
      } finally {
        if (trackInFlight === trackTask) trackInFlight = null;
        if (activeTrackEpoch === targetTrackEpoch && activeTrackSignature === signature) {
          activeTrackSignature = "";
          activeTrackEpoch = 0;
        }
        schedulePendingTrackRequest();
      }
    } catch (e) {
      lastPresenceError = String(e?.message || e || "unknown");
      lastTrackResult = "error";
      logPresenceTrackLifecycle("track error", {
        topic: getChannelTopic(channel),
        error: lastPresenceError,
      }, { error: true });
      logPresenceLiveDebug("track fail", {
        error: lastPresenceError,
      });
      onError?.(e);
      return null;
    }
  }

  function startHeartbeat() {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      void trackNow();
    }, PRESENCE_HEARTBEAT_MS);
  }

  function startGracePruneTimer() {
    clearGracePruneTimer();
    gracePruneTimer = setInterval(() => {
      emitCurrentPresenceList("grace-prune");
    }, 1000);
  }

  function buildLiveSessionsByUserId(state) {
    // Supabase JS: { [presenceKey]: [{ presence_ref, ...trackedPayload }] }.
    // Older/raw protocol wrappers may still expose { metas: [...] }.
    const liveSessionsByUserId = new Map();
    for (const [key, value] of Object.entries(state || {})) {
      const arr = normalizePresencePayloadList(value);
      for (const item of arr) {
        const p = unwrapPresencePayload(item || {});
        const userId = getPayloadUserId(p, key);
        if (!userId) {
          logPresenceLiveDebug("payload missing user_id", { presenceKey: String(key || ""), payload: compactPresencePayload(p) });
          continue;
        }
        const lastSeen = p.last_seen_at || p.lastSeenAt || p.last_seen || p.lastSeen || null;
        const activity = normalizeActivity(p.activity || p.spotify_activity || p.spotifyActivity);
        const session = {
          id: userId,
          user_id: userId,
          session_id: p.session_id || p.sessionId || "",
          presence_ref: p.presence_ref || p.phx_ref || "",
          username: p.username || "",
          display_name: p.display_name || p.username || "User",
          avatar_url: p.avatar_url || null,
          name_color: p.name_color || null,
          call_tile_color: p.call_tile_color || null,
          manual_status: normalizeManualStatus(p.manual_status || p.manualStatus || p.status || "online"),
          status: normalizeEffectiveStatus(p.status || "online"),
          has_live_session: true,
          activity,
          spotify_activity: activity?.type === "listening" && activity?.provider === "spotify" ? activity : null,
          online_at: p.online_at || p.onlineAt || null,
          last_seen_at: lastSeen,
          last_seen: lastSeen,
          last_seen_ms: toEpochMs(lastSeen),
          device_type: normalizeDeviceType(p.device_type || p.deviceType),
        };
        const sessions = liveSessionsByUserId.get(userId) || [];
        const sessionIdentity = String(session.session_id || session.presence_ref || "").trim();
        const duplicateIndex = sessionIdentity
          ? sessions.findIndex((candidate) => String(candidate?.session_id || candidate?.presence_ref || "").trim() === sessionIdentity)
          : -1;
        if (duplicateIndex >= 0) sessions[duplicateIndex] = session;
        else sessions.push(session);
        liveSessionsByUserId.set(userId, sessions);
      }
    }
    return liveSessionsByUserId;
  }

  function cloneLiveSessionsMap(map = new Map()) {
    return new Map(Array.from((map || new Map()).entries()).map(([userId, sessions]) => [
      userId,
      (sessions || []).map((session) => ({ ...session })),
    ]));
  }

  function getMapUserIds(map = new Map()) {
    return Array.from((map || new Map()).keys()).sort();
  }

  function getSessionCounts(map = new Map()) {
    return Object.fromEntries(Array.from((map || new Map()).entries()).map(([userId, sessions]) => [
      userId,
      Number(sessions?.length || 0),
    ]));
  }

  function mapUserIdsSignature(map = new Map()) {
    return getMapUserIds(map).join("|");
  }

  function mapLastSeenToDebugObject(map = new Map()) {
    return Object.fromEntries(Array.from((map || new Map()).entries()).map(([userId, seenAt]) => [
      userId,
      Number(seenAt || 0),
    ]));
  }

  function applyPresenceGrace(rawLiveSessionsByUserId = new Map(), rawState = {}, source = "presence-sync") {
    const nowMs = Date.now();
    const viewerUserId = getOwnUserId();
    const rawPayloadCount = getRawPayloadCount(rawState);
    const rawPresenceKeys = Object.keys(rawState || {});
    const previousRawCounts = lastRawSessionCountByUserId || new Map();
    const nextRawCounts = new Map();

    for (const [userId, sessions] of rawLiveSessionsByUserId.entries()) {
      const count = Number(sessions?.length || 0);
      nextRawCounts.set(userId, count);
      if (count > 0) {
        lastSeenLiveAtByUserId.set(userId, nowMs);
        lastLiveSessionSnapshotByUserId.set(userId, (sessions || []).map((session) => ({ ...session })));
      }
    }

    const observedUserIds = new Set([
      ...Array.from(previousRawCounts.keys()),
      ...Array.from(nextRawCounts.keys()),
    ]);
    observedUserIds.forEach((userId) => {
      const previousSessionCount = Number(previousRawCounts.get(userId) || 0);
      const sessionCount = Number(nextRawCounts.get(userId) || 0);
      if (!userId || userId === viewerUserId) return;
      if (previousSessionCount <= 0 && sessionCount > 0) {
        logPresenceLiveDebug("remote user appeared", {
          viewerUserId,
          remoteUserId: userId,
          sessionCount,
          at: new Date(nowMs).toISOString(),
        });
      } else if (previousSessionCount > 0 && sessionCount <= 0) {
        logPresenceLiveDebug("remote user disappeared", {
          viewerUserId,
          remoteUserId: userId,
          previousSessionCount,
          rawPresenceKeys,
          rawPayloadCount,
          reason: "raw_presence_absent_grace_started",
          at: new Date(nowMs).toISOString(),
        });
      }
    });
    lastRawSessionCountByUserId = nextRawCounts;

    const effective = cloneLiveSessionsMap(rawLiveSessionsByUserId);
    for (const [userId, sessions] of lastLiveSessionSnapshotByUserId.entries()) {
      if (effective.has(userId)) continue;
      const lastSeenAt = Number(lastSeenLiveAtByUserId.get(userId) || 0);
      if (!lastSeenAt || nowMs - lastSeenAt > REMOTE_PRESENCE_GRACE_MS) continue;
      effective.set(userId, (sessions || []).map((session) => ({
        ...session,
        presence_grace: true,
      })));
    }

    return effective;
  }

  function flattenLiveSessionsByUserId(liveSessionsByUserId) {
    const out = [];
    for (const [userId, sessions] of liveSessionsByUserId.entries()) {
      const resolved = resolveUserPresenceFromSessions(userId, sessions);
      const freshest = resolved.session;
      if (!freshest) continue;
      out.push({
        ...freshest,
        id: userId,
        user_id: userId,
        manual_status: resolved.manualStatus,
        status: resolved.effectiveStatus,
        has_live_session: resolved.hasLiveSession,
        is_live: resolved.hasLiveSession,
        live_session_count: resolved.liveSessions.length,
        public_live_session_count: resolved.publicSessions.length,
        live_sessions: resolved.liveSessions.map((session) => ({
          session_id: session.session_id || "",
          manual_status: session.manual_status,
          status: resolveEffectiveStatus(session.manual_status, true),
          last_seen_at: session.last_seen_at || session.last_seen || null,
          device_type: session.device_type || "",
          presence_grace: session.presence_grace === true,
        })),
      });
    }
    return out;
  }

  function getOwnUserId() {
    return getPayloadUserId(getMe?.() || {});
  }

  function isOwnSessionVisible(userId = getOwnUserId()) {
    const uid = String(userId || "").trim();
    if (!uid || !channel?.presenceState) return false;
    const liveMap = buildLiveSessionsByUserId(channel.presenceState() || {});
    return Number(liveMap.get(uid)?.length || 0) > 0;
  }

  function stopOwnSessionRetryIfVisible(userId = getOwnUserId()) {
    const found = isOwnSessionVisible(userId);
    logPresenceLiveDebug("own session visible", { found });
    if (found && ownSessionMissingRetryTimer) {
      clearInterval(ownSessionMissingRetryTimer);
      ownSessionMissingRetryTimer = null;
    }
    return found;
  }

  async function retryOwnTrackIfNeeded({ initial = false } = {}) {
    const userId = getOwnUserId();
    if (!userId || channelStatus !== "SUBSCRIBED") return false;
    if (stopOwnSessionRetryIfVisible(userId)) return true;
    if (!isDocumentVisible()) return false;
    if (initial) {
      if (ownSessionInitialRetrackDone) return false;
      ownSessionInitialRetrackDone = true;
    }
    const nowMs = Date.now();
    if (!initial && nowMs - Number(lastMissingOwnRetrackAt || 0) < 10000) return false;
    lastMissingOwnRetrackAt = nowMs;
    logPresenceLiveDebug("own session missing, retracking", { userId, initial: !!initial });
    await trackNow(currentStatus, { force: true });
    return stopOwnSessionRetryIfVisible(userId);
  }

  function scheduleOwnSessionVisibilityCheck() {
    if (ownSessionVisibleCheckTimer) clearTimeout(ownSessionVisibleCheckTimer);
    if (ownSessionMissingRetryTimer) {
      clearInterval(ownSessionMissingRetryTimer);
      ownSessionMissingRetryTimer = null;
    }
    ownSessionInitialRetrackDone = false;
    ownSessionVisibleCheckTimer = setTimeout(() => {
      ownSessionVisibleCheckTimer = null;
      void retryOwnTrackIfNeeded({ initial: true }).finally(() => {
        if (stopOwnSessionRetryIfVisible()) return;
        if (ownSessionMissingRetryTimer) clearInterval(ownSessionMissingRetryTimer);
        ownSessionMissingRetryTimer = setInterval(() => {
          void retryOwnTrackIfNeeded({ initial: false });
        }, 10000);
      });
    }, 2000);
  }

  function emitCurrentPresenceList(source = "presence-store") {
    try {
      const nowMs = Date.now();
      const beforeUserIds = getMapUserIds(lastLiveSessionsByUserId);
      const nextMap = cloneLiveSessionsMap(lastLiveSessionsByUserId);
      let changedByGraceExpiry = false;
      for (const [userId, sessions] of Array.from(nextMap.entries())) {
        const sessionHasRawLive = Number(lastRawSessionCountByUserId.get(userId) || 0) > 0;
        if (sessionHasRawLive) continue;
        const lastSeenAt = Number(lastSeenLiveAtByUserId.get(userId) || 0);
        if (!lastSeenAt || nowMs - lastSeenAt <= REMOTE_PRESENCE_GRACE_MS) continue;
        nextMap.delete(userId);
        lastLiveSessionSnapshotByUserId.delete(userId);
        changedByGraceExpiry = true;
        if (userId !== getOwnUserId()) {
          logPresenceLiveDebug("remote user disappeared", {
            viewerUserId: getOwnUserId(),
            remoteUserId: userId,
            previousSessionCount: Number(sessions?.length || 0),
            rawPresenceKeys: Object.keys(lastRawPresenceState || {}),
            rawPayloadCount: getRawPayloadCount(lastRawPresenceState || {}),
            reason: "grace_expired",
            at: new Date(nowMs).toISOString(),
          });
        }
      }
      if (changedByGraceExpiry) {
        lastLiveSessionsByUserId = nextMap;
      }

      const list = flattenLiveSessionsByUserId(lastLiveSessionsByUserId).map((u) => {
        const hasLiveSession = Number(u.live_session_count || 0) > 0;
        const nextStatus = resolveEffectiveStatus(u.manual_status, hasLiveSession);
        return {
          ...u,
          has_live_session: hasLiveSession,
          is_live: hasLiveSession,
          status: nextStatus,
          activity: nextStatus === "offline" ? null : normalizeActivity(u.activity || u.spotify_activity),
          spotify_activity: nextStatus === "offline" ? null : normalizeActivity(u.spotify_activity || u.activity),
        };
      });

      // Sort: online/idle/focus/dnd first, offline last.
      const weight = (s) => {
        if (s === "online") return 0;
        if (s === "idle") return 1;
        if (s === "focus") return 2;
        if (s === "dnd") return 3;
        return 9;
      };
      list.sort((a, b) => weight(a.status) - weight(b.status));

      const normalizedTraceUsers = list.map((entry) => ({
        userId: normalizePresenceUserId(entry?.id || entry?.user_id || entry?.userId || ""),
        hasLiveSession: entry?.has_live_session === true,
        liveSessionCount: Number(entry?.live_session_count || 0),
        manualStatus: normalizeManualStatus(entry?.manual_status || entry?.manualStatus || entry?.status || "online"),
        visibleStatus: normalizeEffectiveStatus(entry?.status || "offline"),
        lastSeen: String(entry?.last_seen_at || entry?.lastSeenAt || entry?.last_seen || entry?.lastSeen || ""),
      }));
      tracePresence("PRESENCE_NORMALIZED_STATE", {
        source,
        onlineIds: normalizedTraceUsers
          .filter((entry) => entry.hasLiveSession && entry.visibleStatus !== "offline")
          .map((entry) => entry.userId)
          .filter(Boolean),
        users: normalizedTraceUsers,
      });
      tracePresence("NORMALIZED_SNAPSHOT", {
        source,
        users: normalizedTraceUsers,
      });

      const signature = list
        .map((u) => [
          String(u.id || "").trim(),
          normalizeEffectiveStatus(u.status),
          normalizeManualStatus(u.manual_status),
          u.has_live_session === true ? "1" : "0",
          String(Number(u.live_session_count || 0)),
          String(Number(u.public_live_session_count || 0)),
          String(u.username || "").trim(),
          String(u.display_name || "").trim(),
          String(u.avatar_url || "").trim(),
          String(u.name_color || "").trim(),
          String(u.call_tile_color || "").trim(),
          JSON.stringify(normalizeActivity(u.activity) || null),
        ].join("|"))
        .sort()
        .join("||");

      if (signature === lastEmittedSignature) return;
      lastEmittedSignature = signature;
      if (changedByGraceExpiry) {
        logPresenceLiveDebug("liveSessions replaced", {
          beforeUserIds,
          afterUserIds: getMapUserIds(lastLiveSessionsByUserId),
          rawPayloadCount: lastEmittedRawPayloadCount,
          source,
        });
      }
      onPresenceList?.(list);
    } catch (e) {
      lastPresenceError = String(e?.message || e || "unknown");
      onError?.(e);
    }
  }

  function emitList(source = "presence-sync") {
    try {
      const st = channel?.presenceState ? channel.presenceState() : {};
      traceRawPresenceState(source, channel);
      const rawSummary = summarizeRawPresenceState(st);
      const beforeUserIds = getMapUserIds(lastLiveSessionsByUserId);
      lastRawPresenceState = st || {};
      lastPresenceSyncAt = Date.now();
      lastEmittedRawPayloadCount = rawSummary.payloadCount;
      const rawLiveSessionsByUserId = buildLiveSessionsByUserId(st);
      const nextLiveSessionsByUserId = applyPresenceGrace(rawLiveSessionsByUserId, st, source);
      lastLiveSessionsByUserId = nextLiveSessionsByUserId;

      logPresenceLiveDebug("presence sync received", {
        source,
        userIds: getMapUserIds(nextLiveSessionsByUserId),
        rawUserIds: getMapUserIds(rawLiveSessionsByUserId),
        sessionCount: Array.from(nextLiveSessionsByUserId.values()).reduce((sum, sessions) => sum + Number(sessions?.length || 0), 0),
      });
      logPresenceLiveDebug("raw sync state", rawSummary);
      logPresenceLiveDebug("liveSessionsByUserId", {
        userIds: getMapUserIds(nextLiveSessionsByUserId),
        rawUserIds: getMapUserIds(rawLiveSessionsByUserId),
        sessionCounts: getSessionCounts(nextLiveSessionsByUserId),
      });
      logPresenceLiveDebug("liveSessions replaced", {
        beforeUserIds,
        afterUserIds: getMapUserIds(nextLiveSessionsByUserId),
        rawPayloadCount: rawSummary.payloadCount,
        source,
      });

      const ownUserId = getOwnUserId();
      const ownSessionsCount = ownUserId ? Number(rawLiveSessionsByUserId.get(ownUserId)?.length || 0) : 0;
      logPresenceLiveDebug("own session visible", { found: ownSessionsCount > 0 });
      if (ownSessionsCount > 0 && ownSessionMissingRetryTimer) {
        clearInterval(ownSessionMissingRetryTimer);
        ownSessionMissingRetryTimer = null;
      }
      if (started && ownUserId && channelStatus === "SUBSCRIBED" && ownSessionsCount <= 0) {
        void retryOwnTrackIfNeeded({ initial: false });
      }

      emitCurrentPresenceList(source);
    } catch (e) {
      lastPresenceError = String(e?.message || e || "unknown");
      onError?.(e);
    }
  }

  async function start() {
    if (isCurrentChannelActiveOrJoining()) return;
    if (channel) await discardFailedCurrentChannel("start-after-" + String(channelStatus || "unknown").toLowerCase());
    started = true;
    clearReconnectTimer();

    const me = getMe?.();
    const userId = getPayloadUserId(me || {});
    if (!userId) {
      onError?.(new Error("presence: getMe() missing id"));
      started = false;
      return;
    }

    await removeExistingGlobalPresenceChannels();

    trackGeneration += 1;
    const sessionId = getSessionId(me || {});
    const channelOptions = {
      config: { private: true, presence: { key: sessionId } },
    };
    channel = supabase.channel(PRESENCE_CHANNEL_NAME, channelOptions);
    tracePresence("CHANNEL_CREATE", {
      channelGeneration: trackGeneration,
      channelIdentity: getChannelTopic(channel),
      topic: PRESENCE_CHANNEL_NAME,
      presenceKey: sessionId,
      private: channelOptions.config.private === true,
      config: channelOptions.config,
    });
    logPresenceTrackLifecycle("channel created", {
      channelName: PRESENCE_CHANNEL_NAME,
      topic: getChannelTopic(channel),
      userId,
      sessionId,
      private: true,
    });
    logPresenceLiveDebug("channel identity", {
      userId,
      supabaseUrl: getSupabaseUrl(),
      channelName: PRESENCE_CHANNEL_NAME,
      topic: getChannelTopic(channel),
    });
    lastEmittedSignature = "";

    logPresenceTrackLifecycle("presence handlers registering", {
      topic: getChannelTopic(channel),
      events: ["sync", "join", "leave"],
    });
    channel
      .on("presence", { event: "sync" }, (payload) => {
        tracePresenceEvent("sync", payload, channel);
        logPresenceTrackLifecycle("presence sync", { topic: getChannelTopic(channel) });
        emitList("presence-sync");
      })
      .on("presence", { event: "join" }, (payload) => {
        tracePresenceEvent("join", payload, channel);
        logPresenceTrackLifecycle("presence join", { topic: getChannelTopic(channel) });
        logPresenceLiveDebug("presence join observed", { topic: getChannelTopic(channel) });
      })
      .on("presence", { event: "leave" }, (payload) => {
        tracePresenceEvent("leave", payload, channel);
        logPresenceTrackLifecycle("presence leave", { topic: getChannelTopic(channel) });
        logPresenceLiveDebug("presence leave observed", { topic: getChannelTopic(channel) });
      });
    logPresenceTrackLifecycle("presence handlers registered", {
      topic: getChannelTopic(channel),
      events: ["sync", "join", "leave"],
    });

    const subscribedChannel = channel;
    const subscribedGeneration = trackGeneration;
    channelStatus = "JOINING";
    tracePresence("SUBSCRIBE_START", {
      channelGeneration: subscribedGeneration,
      channelName: PRESENCE_CHANNEL_NAME,
      topic: getChannelTopic(subscribedChannel),
      userId,
      presenceKey: sessionId,
      private: channelOptions.config.private === true,
    });
    logPresenceTrackLifecycle("subscribe called", {
      topic: getChannelTopic(subscribedChannel),
      userId,
      generation: subscribedGeneration,
    });
    const handleSubscribeError = (error) => {
      if (!error) return;
      if (
        subscribedGeneration !== trackGeneration
        || subscribedChannel !== channel
        || !started
      ) {
        logPresenceLiveDebug("stale subscribe error ignored", {
          topic: getChannelTopic(subscribedChannel),
          error: String(error?.message || error || "unknown"),
        });
        return;
      }
      lastPresenceError = String(error?.message || error || "unknown");
      logPresenceTrackLifecycle("subscribe error", {
        topic: getChannelTopic(subscribedChannel),
        userId,
        error: lastPresenceError,
      }, { error: true });
      try { onStatus?.("CHANNEL_ERROR", { source: "presence", channelName: PRESENCE_CHANNEL_NAME, error }); } catch (_) {}
      onError?.(error);
    };
    let subscribeResult = null;
    try {
      subscribeResult = channel.subscribe(async (status) => {
        tracePresence("SUBSCRIBE_STATUS", {
          channelGeneration: subscribedGeneration,
          channelName: PRESENCE_CHANNEL_NAME,
          topic: getChannelTopic(subscribedChannel),
          userId,
          presenceKey: sessionId,
          status: String(status || ""),
          currentGeneration: subscribedGeneration === trackGeneration,
          currentChannel: subscribedChannel === channel,
          started,
        });
        logPresenceTrackLifecycle("subscribe callback", {
          topic: getChannelTopic(subscribedChannel),
          userId,
          status: String(status || ""),
          generation: subscribedGeneration,
          currentGeneration: subscribedGeneration === trackGeneration,
          currentChannel: subscribedChannel === channel,
          started,
        }, { error: ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(String(status || "")) });
        if (
          subscribedGeneration !== trackGeneration
          || subscribedChannel !== channel
          || !started
        ) {
          logPresenceLiveDebug("stale channel status ignored", { status: String(status || "") });
          return;
        }
        channelStatus = String(status || "");
        logPresenceLiveDebug("channel status", { status: channelStatus });
        try { onStatus?.(channelStatus, { source: "presence", channelName: PRESENCE_CHANNEL_NAME }); } catch (_) {}
        if (status === "SUBSCRIBED") {
          try {
            const trackEpoch = beginSubscribedTrackEpoch();
            traceRawPresenceState("after-subscribed", subscribedChannel);
            logPresenceTrackLifecycle("channel subscribed", {
              topic: getChannelTopic(subscribedChannel),
              userId,
              trackEpoch,
            });
            logPresenceTrackLifecycle("subscribed", {
              topic: getChannelTopic(subscribedChannel),
              userId,
              trackEpoch,
            });
            logPresenceLiveDebug("channel subscribed", {});
            const payload = getMe?.() || {};
            currentStatus = normalizeManualStatus(payload?.manual_status || payload?.manualStatus || payload?.status || currentStatus || "online");
            // A socket/channel rejoin starts with an empty server-side Presence
            // state. Never let the prior channel's same-payload rate-limit cache
            // suppress the first track for this subscribed channel.
            await trackNow(currentStatus, { force: true });
            if (
              trackEpoch !== subscribedTrackEpoch
              || subscribedGeneration !== trackGeneration
              || subscribedChannel !== channel
              || !started
            ) return;
            scheduleOwnSessionVisibilityCheck();
            startHeartbeat();
            startGracePruneTimer();
          } catch (e) {
            lastPresenceError = String(e?.message || e || "unknown");
            logPresenceLiveDebug("track fail", {
              error: lastPresenceError,
            });
            onError?.(e);
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          lastPresenceError = status;
          clearHeartbeat();
          clearOwnSessionTimers();
          emitCurrentPresenceList("channel-unstable");
          if (!manageReconnectExternally) scheduleReconnect(status);
        }
      });
    } catch (error) {
      handleSubscribeError(error);
      return;
    }

    // RealtimeChannel.subscribe() is synchronous in supabase-js. Some wrappers
    // return a promise, however; observe it without making Presence startup (or
    // every later auth refresh) wait forever on a dead subscription attempt.
    if (subscribeResult && typeof subscribeResult.then === "function") {
      void Promise.resolve(subscribeResult)
        .then((result) => handleSubscribeError(result?.error || null))
        .catch(handleSubscribeError);
    } else {
      handleSubscribeError(subscribeResult?.error || null);
    }
  }

  async function stop() {
    const oldStarted = started;
    started = false;
    clearReconnectTimer();
    clearHeartbeat();
    clearGracePruneTimer();
    clearOwnSessionTimers();
    clearPendingTrackTimer();
    pendingTrackRequest = null;
    trackGeneration += 1;
    trackInFlight = null;
    activeTrackSignature = "";
    activeTrackEpoch = 0;
    subscribedTrackEpoch += 1;
    lastTrackSignature = "";
    lastTrackSentAt = 0;
    if (!channel) {
      if (!oldStarted) lastTrackResult = "";
      lastLiveSessionsByUserId = new Map();
      lastLiveSessionSnapshotByUserId = new Map();
      lastRawSessionCountByUserId = new Map();
      lastSeenLiveAtByUserId = new Map();
      return;
    }
    try {
      await channel.untrack();
    } catch (_) {}
    try {
      supabase.removeChannel(channel);
    } catch (_) {}
    channel = null;
    channelStatus = "STOPPED";
    lastEmittedSignature = "";
    lastTrackResult = "";
    lastLiveSessionsByUserId = new Map();
    lastLiveSessionSnapshotByUserId = new Map();
    lastRawSessionCountByUserId = new Map();
    lastSeenLiveAtByUserId = new Map();
  }

  async function setStatus(status) {
    if (!channel) return;
    try {
      currentStatus = normalizeManualStatus(status || currentStatus || "online");
      await trackNow(currentStatus);
    } catch (e) {
      onError?.(e);
    }
  }

  async function refresh() {
    if (!channel) return;
    try {
      await trackNow(currentStatus);
    } catch (e) {
      onError?.(e);
    }
  }

  function mapToDebugObject(map) {
    return Object.fromEntries(Array.from((map || new Map()).entries()).map(([userId, sessions]) => [
      userId,
      (sessions || []).map((session) => ({
        user_id: session.user_id,
        session_id: session.session_id,
        manual_status: session.manual_status,
        status: session.status,
        online_at: session.online_at,
        last_seen_at: session.last_seen_at,
        device_type: session.device_type,
        has_live_session: session.has_live_session,
        presence_grace: session.presence_grace === true,
      })),
    ]));
  }

  function mapEffectivePresenceToDebugObject(map) {
    return Object.fromEntries(Array.from((map || new Map()).entries()).map(([userId, sessions]) => {
      const resolved = resolveUserPresenceFromSessions(userId, sessions);
      return [
        userId,
        {
          user_id: userId,
          manual_status: resolved.manualStatus,
          status: resolved.effectiveStatus,
          has_live_session: resolved.hasLiveSession,
          live_session_count: resolved.liveSessions.length,
          public_live_session_count: resolved.publicSessions.length,
          selected_session_id: resolved.session?.session_id || "",
          selected_device_type: resolved.session?.device_type || "",
          selected_last_seen_at: resolved.session?.last_seen_at || resolved.session?.last_seen || null,
        },
      ];
    }));
  }

  function getDebugSnapshot() {
    const raw = channel?.presenceState ? channel.presenceState() : lastRawPresenceState;
    const rawLiveMap = buildLiveSessionsByUserId(raw || {});
    const liveMap = lastLiveSessionsByUserId && lastLiveSessionsByUserId.size
      ? lastLiveSessionsByUserId
      : rawLiveMap;
    return {
      supabaseUrl: getSupabaseUrl(),
      presenceChannelName: PRESENCE_CHANNEL_NAME,
      presenceHeartbeatMs: PRESENCE_HEARTBEAT_MS,
      remotePresenceGraceMs: REMOTE_PRESENCE_GRACE_MS,
      channelTopic: getChannelTopic(channel),
      channelState: channelStatus,
      socketConnected: isRealtimeSocketConnected(),
      presenceChannelState: channelStatus,
      ownSessionId: getSessionId(lastTrackPayload || getMe?.() || {}),
      ownTrackPayload: lastTrackPayload ? compactPresencePayload(lastTrackPayload) : null,
      rawPresenceState: raw || {},
      rawPresenceStateKeys: Object.keys(raw || {}),
      rawPresencePayloadsCompact: compactRawPresencePayloads(raw || {}),
      liveSessionsByUserId: mapToDebugObject(liveMap),
      effectivePresenceByUserId: mapEffectivePresenceToDebugObject(liveMap),
      rawLiveSessionsByUserId: mapToDebugObject(rawLiveMap),
      lastSeenLiveAtByUserId: mapLastSeenToDebugObject(lastSeenLiveAtByUserId),
      lastPresenceSyncAt,
      lastPresenceTrackAt,
      lastTrackResult,
      lastPresenceError,
      started,
    };
  }

  return { start, stop, setStatus, refresh, getDebugSnapshot };
}
