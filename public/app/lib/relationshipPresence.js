// Relationship-scoped presence transport for the gated BR age/privacy rollout.
// The database row and its RLS policy are the delivery authority. The Realtime
// channel is only a low-latency invalidation signal; snapshots replace the cache.
const REFRESH_MS = 10000;
const PUBLISH_MS = 20000;

const normalizeId = (value) => String(value || "").trim().toLowerCase();
const safeObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function sessionIdOf(row) {
  return normalizeId(row.session_id || row.sessionId || row.presence_session_id || "");
}

function normalizeRows(rows) {
  const sessions = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = safeObject(raw);
    const userId = normalizeId(row.user_id || row.id);
    const sessionId = sessionIdOf(row);
    if (!userId || !sessionId) continue;
    if (!sessions.has(userId)) sessions.set(userId, []);
    sessions.get(userId).push({ ...row, id: userId, user_id: userId, session_id: sessionId });
  }
  return [...sessions.entries()].map(([userId, live]) => {
    live.sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")));
    const newest = live[0];
    return {
      ...newest,
      id: userId,
      user_id: userId,
      live_sessions: live,
      live_session_count: live.length,
      has_live_session: true,
    };
  });
}

export function createRelationshipPresenceSystem({
  supabase,
  getMe,
  getAuthenticatedUserId,
  onPresenceList,
  onError,
  onStatus,
  onTrace,
} = {}) {
  let channel = null;
  let refreshTimer = null;
  let publishTimer = null;
  let started = false;
  let generation = 0;
  let lastRows = [];
  let lastStatus = "IDLE";
  let refreshInFlight = null;
  let publishInFlight = null;
  let statusOverride = "";
  let snapshotEpoch = 0;
  let queuedSnapshotReason = "";
  const hasAuthLifecycle = typeof supabase?.auth?.onAuthStateChange === "function";
  let authSubject = "";
  let authResolved = !hasAuthLifecycle;
  let authEpoch = 0;
  let lifecycleEpoch = 0;
  let authSubscription = null;

  const owner = () => normalizeId(getAuthenticatedUserId?.());
  const authMatchesOwner = () => !hasAuthLifecycle || (authResolved && !!authSubject && authSubject === owner());
  const bindAuth = () => {
    if (!hasAuthLifecycle || authSubscription) return;
    authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
      const next = normalizeId(session?.user?.id);
      if (next !== authSubject) {
        authEpoch += 1;
        generation += 1;
        snapshotEpoch += 1;
        queuedSnapshotReason = "";
        if (started && next !== owner()) {
          started = false;
          lifecycleEpoch += 1;
          clearInterval(refreshTimer);
          clearInterval(publishTimer);
          refreshTimer = publishTimer = null;
          const staleChannel = channel;
          channel = null;
          if (staleChannel) void Promise.resolve(supabase.removeChannel(staleChannel)).catch(() => {});
        }
        emit([], "auth-subject-changed");
      }
      authSubject = next;
      authResolved = true;
    })?.data?.subscription || null;
  };
  async function confirmAuthSubject() {
    if (!hasAuthLifecycle) return true;
    if (!authResolved) {
      const operationEpoch = authEpoch;
      try {
        const result = await supabase.auth.getSession();
        if (operationEpoch !== authEpoch) return authMatchesOwner();
        if (result?.error) return false;
        authSubject = normalizeId(result?.data?.session?.user?.id);
        authResolved = true;
      } catch (_) { return false; }
    }
    return authMatchesOwner();
  }

  const trace = (stage, details = {}) => {
    try { onTrace?.(stage, { channelGeneration: generation, ...details }); } catch (_) {}
  };
  const emit = (rows, source) => {
    lastRows = normalizeRows(rows);
    try { onPresenceList?.(lastRows, { source, relationshipScoped: true }); } catch (_) {}
    trace("PRESENCE_NORMALIZED_STATE", { onlineIds: lastRows.map((row) => row.id), source });
  };
  const call = async (name, args = {}) => {
    const result = await supabase.rpc(name, args);
    if (result?.error) throw result.error;
    return safeObject(result?.data);
  };
  const payload = () => {
    const me = { ...safeObject(getMe?.()) };
    const userId = normalizeId(getAuthenticatedUserId?.());
    if (!userId || normalizeId(me.user_id || me.id) !== userId) throw new Error("relationship-presence: identity mismatch");
    me.id = userId;
    me.user_id = userId;
    if (statusOverride) {
      me.manual_status = statusOverride;
      me.status = statusOverride === "invisible" ? "offline" : statusOverride;
    }
    return me;
  };
  async function publish() {
    if (!started) return null;
    if (publishInFlight?.generation === generation) return publishInFlight.promise;
    const operationGeneration = generation;
    const operationOwner = owner();
    const promise = (async () => {
      const me = payload();
      const sessionId = sessionIdOf(me);
      if (!sessionId) throw new Error("relationship-presence: session missing");
      trace("TRACK_CALL", { currentGeneration: true, currentTrackEpoch: true });
      const result = await call("account_privacy_presence_publish_v1", {
        p_session_id: sessionId,
        p_payload: me,
      });
      if (!started || generation !== operationGeneration || owner() !== operationOwner || !authMatchesOwner()) return null;
      if (result.status !== "presence_recorded") throw new Error(result.status || "presence publish denied");
      trace("TRACK_RESULT", { rawResult: "ok", currentGeneration: true, currentTrackEpoch: true });
      return result;
    })().catch((error) => {
      if (!started || generation !== operationGeneration || owner() !== operationOwner || !authMatchesOwner()) return null;
      onError?.(error);
      trace("TRACK_RESULT", { rawResult: "error", error: String(error?.message || error) });
      return null;
    }).finally(() => { if (publishInFlight?.promise === promise) publishInFlight = null; });
    publishInFlight = { generation: operationGeneration, promise };
    return promise;
  }
  async function snapshot(reason = "snapshot") {
    if (!started) return [];
    if (refreshInFlight?.generation === generation) return refreshInFlight.promise;
    const operationGeneration = generation;
    const operationOwner = owner();
    const operationEpoch = snapshotEpoch;
    const promise = call("account_privacy_presence_snapshot_v1").then((result) => {
      if (!started || generation !== operationGeneration || operationEpoch !== snapshotEpoch
        || owner() !== operationOwner || !authMatchesOwner()) return [];
      if (result.status !== "presence_available") throw new Error(result.status || "presence snapshot denied");
      emit(result.rows, reason);
      trace("RAW_PRESENCE_STATE", { rawPresenceMetaCount: Array.isArray(result.rows) ? result.rows.length : 0, source: reason });
      return lastRows;
    }).catch((error) => {
      if (!started || generation !== operationGeneration || operationEpoch !== snapshotEpoch
        || owner() !== operationOwner || !authMatchesOwner()) return [];
      onError?.(error);
      emit([], "snapshot-error");
      return [];
    }).finally(() => { if (refreshInFlight?.promise === promise) refreshInFlight = null; });
    refreshInFlight = { generation: operationGeneration, promise };
    return promise;
  }
  function invalidateAndSnapshot(reason) {
    snapshotEpoch += 1;
    queuedSnapshotReason = String(reason || "relationship-change");
    const run = () => {
      if (!started || !queuedSnapshotReason) return;
      const nextReason = queuedSnapshotReason;
      queuedSnapshotReason = "";
      void snapshot(nextReason);
    };
    if (refreshInFlight?.promise) void refreshInFlight.promise.finally(run);
    else run();
  }
  function schedule() {
    clearInterval(refreshTimer);
    clearInterval(publishTimer);
    refreshTimer = setInterval(() => { void snapshot("periodic-authority"); }, REFRESH_MS);
    publishTimer = setInterval(() => { void publish(); }, PUBLISH_MS);
  }
  async function start() {
    if (started) return;
    bindAuth();
    const startupEpoch = lifecycleEpoch;
    const startupOwner = owner();
    if (!await confirmAuthSubject() || lifecycleEpoch !== startupEpoch || owner() !== startupOwner) {
      emit([], "auth-subject-mismatch"); onError?.(new Error("relationship-presence: auth mismatch")); return;
    }
    started = true;
    generation += 1;
    const userId = normalizeId(getAuthenticatedUserId?.());
    if (!userId) { started = false; onError?.(new Error("relationship-presence: auth missing")); return; }
    trace("CHANNEL_CREATE", { topic: `account-privacy-presence:${userId}`, private: true });
    channel = supabase.channel(`account-privacy-presence:${userId}`, { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" },
        () => { invalidateAndSnapshot("friend-relationship-change"); })
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members" },
        () => { invalidateAndSnapshot("server-relationship-change"); })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" },
        () => { invalidateAndSnapshot("dm-relationship-change"); });
    trace("SUBSCRIBE_START", { topic: `account-privacy-presence:${userId}` });
    channel.subscribe((status, error) => {
      lastStatus = String(status || "");
      trace("SUBSCRIBE_STATUS", { status: lastStatus, error: String(error?.message || "") });
      try { onStatus?.(lastStatus, { source: "relationship-presence", error }); } catch (_) {}
      if (lastStatus === "SUBSCRIBED") {
        void publish().then(() => snapshot("subscribed"));
      } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(lastStatus)) {
        emit([], "transport-unavailable");
      }
    });
    schedule();
  }
  async function stop() {
    const old = channel;
    channel = null;
    started = false;
    lifecycleEpoch += 1;
    generation += 1;
    snapshotEpoch += 1;
    queuedSnapshotReason = "";
    clearInterval(refreshTimer);
    clearInterval(publishTimer);
    refreshTimer = publishTimer = null;
    authSubscription?.unsubscribe?.();
    authSubscription = null;
    authResolved = !hasAuthLifecycle;
    authSubject = "";
    emit([], "stopped");
    try {
      const me = safeObject(getMe?.());
      const sid = sessionIdOf(me);
      if (sid) await call("account_privacy_presence_clear_v1", { p_session_id: sid });
    } catch (_) {}
    try { if (old) await supabase.removeChannel(old); } catch (_) {}
  }
  async function reconnect() {
    await stop();
    await start();
  }
  async function setStatus(status) {
    statusOverride = String(status || "").trim().toLowerCase();
    await publish();
    await snapshot("status-change");
  }
  async function refresh() {
    await publish();
    return snapshot("explicit-refresh");
  }
  const reconcile = (reason = "manual") => { void snapshot(reason); };
  const getDebugSnapshot = () => ({
    relationshipScoped: true,
    started,
    channelGeneration: generation,
    lastSubscribeStatus: lastStatus,
    rawPresenceMetaCount: lastRows.reduce((sum, row) => sum + Number(row.live_session_count || 0), 0),
    normalizedVisibleOnlineUserIds: lastRows.map((row) => row.id),
    canonicalSessionsByUserId: Object.fromEntries(lastRows.map((row) => [row.id, row.live_sessions || []])),
  });
  return { start, stop, reconnect, setStatus, refresh, reconcile, getDebugSnapshot };
}
