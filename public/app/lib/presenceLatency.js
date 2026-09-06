export const PRESENCE_LATENCY_MILESTONES = Object.freeze([
  "authReadyAt",
  "presenceSubscribeStartAt",
  "presenceSubscribedAt",
  "trackStartAt",
  "trackOkAt",
  "firstSyncAt",
  "firstRemotePresenceAt",
  "onlineUiAppliedAt",
]);

const PRESENCE_LATENCY_SEGMENTS = Object.freeze([
  ["authReadyToSubscribeStartMs", "authReadyAt", "presenceSubscribeStartAt"],
  ["subscribeStartToSubscribedMs", "presenceSubscribeStartAt", "presenceSubscribedAt"],
  ["subscribedToTrackStartMs", "presenceSubscribedAt", "trackStartAt"],
  ["trackStartToTrackOkMs", "trackStartAt", "trackOkAt"],
  ["trackOkToFirstSyncMs", "trackOkAt", "firstSyncAt"],
  ["firstSyncToFirstRemotePresenceMs", "firstSyncAt", "firstRemotePresenceAt"],
  ["firstRemotePresenceToOnlineUiAppliedMs", "firstRemotePresenceAt", "onlineUiAppliedAt"],
  ["authReadyToTrackOkMs", "authReadyAt", "trackOkAt"],
  ["authReadyToOnlineUiAppliedMs", "authReadyAt", "onlineUiAppliedAt"],
]);

function normalizeTimestamp(value) {
  const timestamp = Math.floor(Number(value || 0));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function toIso(timestamp) {
  if (!timestamp) return "";
  try { return new Date(timestamp).toISOString(); } catch (_) { return ""; }
}

export function createPresenceLatencyTracker({ now = () => Date.now() } = {}) {
  let generation = 0;
  let reason = "";
  let milestones = Object.fromEntries(PRESENCE_LATENCY_MILESTONES.map((name) => [name, 0]));

  function reset(nextReason = "auth-ready") {
    generation += 1;
    reason = String(nextReason || "auth-ready").slice(0, 120);
    milestones = Object.fromEntries(PRESENCE_LATENCY_MILESTONES.map((name) => [name, 0]));
    return generation;
  }

  function mark(name, timestamp = now()) {
    if (!PRESENCE_LATENCY_MILESTONES.includes(name)) return false;
    if (milestones[name]) return false;
    const normalized = normalizeTimestamp(timestamp);
    if (!normalized) return false;
    milestones[name] = normalized;
    return true;
  }

  function clear() {
    reason = "";
    milestones = Object.fromEntries(PRESENCE_LATENCY_MILESTONES.map((name) => [name, 0]));
  }

  function getSnapshot() {
    const durations = {};
    for (const [label, startName, endName] of PRESENCE_LATENCY_SEGMENTS) {
      const start = milestones[startName];
      const end = milestones[endName];
      durations[label] = start && end && end >= start ? end - start : null;
    }
    return {
      generation,
      reason,
      ...milestones,
      timestampsIso: Object.fromEntries(PRESENCE_LATENCY_MILESTONES.map((name) => [name, toIso(milestones[name])])),
      durations,
    };
  }

  return Object.freeze({ reset, mark, clear, getSnapshot });
}

const TRANSITION_LAYERS = new Set(["canonical", "resolved", "paint", "count"]);
const TRANSITION_STATUSES = new Set(["online", "idle", "focus", "dnd", "invisible", "offline", "unknown"]);
const TRANSITION_DEVICE_TYPES = new Set(["electron", "browser", "web"]);
const TRANSITION_SUBSCRIPTIONS = new Set(["SUBSCRIBED", "JOINING", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED", "STOPPED", "RESTARTING", "RECONNECTING", "NOT_STARTED", "UNKNOWN"]);
const TRANSITION_WRITERS = new Set([
  "onPresenceList", "resolveEffectivePresence", "setStatusDotsForUser", "applyPresenceStatusDots",
  "clearTypingStatusOnUserCards", "updatePresenceRender", "clearPresenceForSignedOutSession", "startPresenceOnce",
  "applyCanonicalPresenceState", "emitCurrentPresenceList", "getPresenceEntry", "getUserPresenceSnapshot",
  "refreshMePresenceUI", "renderTypingStatusOnUserCards", "setMyPresenceStatusEverywhere",
]);
const TRANSITION_REASON_TOKENS = new Set([
  "unknown", "presence", "health", "local", "raw-presence-state", "raw-presence-diff", "raw-diff-join", "raw-diff-leave",
  "presence-sync", "presence-join", "presence-leave", "presence-event", "presence-render", "presence-store",
  "presence-grace-prune", "grace-prune", "grace-expired", "canonical-presence", "onPresenceList",
  "official-sdk", "official-join", "official-leave", "raw-mirror", "grace-cache", "subscribe-error", "channel-unstable",
  "manual-health-check", "manual-status", "status-change", "snapshot", "snapshot-applied", "snapshot-cleared",
  "typing", "typing-start", "typing-stop", "typing-expired", "typing-clear", "typing-restore", "render", "resolve",
  "signed-out", "account-switch", "auth-ready", "start", "stop", "reconnect", "network-online", "network-offline",
  "visibility-visible", "boot_friend_ids_ready", "friends-loaded", "online-count", "count",
]);

function transitionEnum(value, allowed, fallback = "unknown") {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function transitionReason(value) {
  if (typeof value !== "string" || value.length > 120 || !/^[A-Za-z][A-Za-z0-9_-]*(?:[+:][A-Za-z][A-Za-z0-9_-]*){0,3}$/.test(value)) return "unknown";
  return value.split(/[+:]/).every(token => TRANSITION_REASON_TOKENS.has(token)) ? value : "unknown";
}

function transitionNumber(value, maximum = 1_000_000) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : null;
}

function transitionId(value) {
  return typeof value === "string" && value.length <= 200 ? value.trim() : "";
}

export function createPresenceTransitionRecorder({ maxEntries = 80, maxPeers = 256, now = () => Date.now() } = {}) {
  const entryLimit = Math.max(1, Math.min(200, Math.floor(Number(maxEntries)) || 80));
  const peerLimit = Math.max(1, Math.min(1024, Math.floor(Number(maxPeers)) || 256));
  const sessionLimit = 8;
  const peers = new Map();
  const entries = [];
  let countState = null;
  let peerSequence = 0;
  let sessionSequence = 0;
  let sequence = 0;
  let startedAt = null;
  let lastElapsed = 0;

  function peerFor(id) {
    let peer = peers.get(id);
    if (peer) peers.delete(id);
    else peer = { alias: `p${++peerSequence}`, sessions: new Map(), layers: new Map() };
    peers.set(id, peer);
    while (peers.size > peerLimit) peers.delete(peers.keys().next().value);
    return peer;
  }

  function normalizeDetails(details, peer, ownerAlias, isCount) {
    const sessions = [];
    const seen = new Set();
    const inputSessions = !isCount && Array.isArray(details.sessions) ? details.sessions : [];
    for (const session of inputSessions.slice(0, sessionLimit)) {
      if (!session || typeof session !== "object") continue;
      const id = transitionId(session.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      let alias = peer.sessions.get(id);
      if (alias) peer.sessions.delete(id);
      else alias = `s${++sessionSequence}`;
      peer.sessions.set(id, alias);
      while (peer.sessions.size > sessionLimit) peer.sessions.delete(peer.sessions.keys().next().value);
      sessions.push({ alias, status: transitionEnum(session.status, TRANSITION_STATUSES), grace: session.grace === true,
        deviceType: transitionEnum(session.deviceType, TRANSITION_DEVICE_TYPES) });
    }
    sessions.sort((left, right) => left.alias.localeCompare(right.alias));
    return {
      writer: transitionEnum(details.writer, TRANSITION_WRITERS),
      reason: transitionReason(details.reason),
      ownerAlias,
      ownerGeneration: transitionNumber(details.ownerGeneration),
      controllerGeneration: transitionNumber(details.controllerGeneration),
      channelGeneration: transitionNumber(details.channelGeneration),
      rawSessionCount: transitionNumber(details.rawSessionCount),
      liveSessionCount: transitionNumber(details.liveSessionCount),
      publicSessionCount: transitionNumber(details.publicSessionCount),
      onlineCount: transitionNumber(details.onlineCount),
      manualStatus: transitionEnum(details.manualStatus, TRANSITION_STATUSES),
      visibleStatus: transitionEnum(details.visibleStatus, TRANSITION_STATUSES),
      paintStatus: transitionEnum(details.paintStatus, TRANSITION_STATUSES),
      grace: details.grace === true,
      ageMs: transitionNumber(details.ageMs, 2_147_483_647),
      remainingMs: transitionNumber(details.remainingMs, 2_147_483_647),
      subscriptionStatus: transitionEnum(details.subscriptionStatus, TRANSITION_SUBSCRIPTIONS, "UNKNOWN"),
      transportConnected: typeof details.transportConnected === "boolean" ? details.transportConnected : null,
      sessions,
      omittedSessionCount: Math.max(0, inputSessions.length - sessionLimit),
    };
  }

  function record(userId, layer, details = {}) {
    const id = transitionId(userId);
    if (!id || !TRANSITION_LAYERS.has(layer) || !details || typeof details !== "object") return false;
    const isCount = layer === "count";
    if (isCount !== (id === "__online_count__")) return false;
    try {
      // Resolve the owner first so the observed peer remains the most recent
      // entry when an intentionally tiny peer limit is used in diagnostics.
      const ownerId = transitionId(details.ownerUserId);
      const ownerAlias = ownerId ? peerFor(ownerId).alias : "";
      const peer = isCount ? { alias: "count", sessions: new Map(), layers: new Map() } : peerFor(id);
      const after = normalizeDetails(details, peer, ownerAlias, isCount);
      const { writer: _writer, reason: _reason, ageMs: _age, remainingMs: _remaining, ...meaningfulState } = after;
      const signature = JSON.stringify(meaningfulState);
      const previous = isCount ? countState : peer.layers.get(layer);
      if (previous?.signature === signature) {
        // Keep the most recently observed ages/cause for the next transition's
        // "before" state without adding a row or mutating previous exports.
        previous.details = after;
        return false;
      }
      const timestamp = Number(now());
      if (startedAt === null) startedAt = Number.isFinite(timestamp) ? timestamp : 0;
      const atMs = Number.isFinite(timestamp) ? Math.max(lastElapsed, timestamp - startedAt, 0) : lastElapsed;
      lastElapsed = atMs;
      entries.push({ sequence: ++sequence, atMs, peerAlias: peer.alias, layer, before: previous?.details || null, after });
      const next = { signature, details: after };
      if (isCount) countState = next;
      else peer.layers.set(layer, next);
      if (entries.length > entryLimit) entries.splice(0, entries.length - entryLimit);
      return true;
    } catch (_) {
      return false;
    }
  }

  function snapshot(activeUserId = "") {
    return {
      version: "presence-transitions-v1",
      activeAlias: peers.get(transitionId(activeUserId))?.alias || "",
      peerCount: peers.size,
      limits: { maxEntries: entryLimit, maxPeers: peerLimit, maxSessionsPerPeer: sessionLimit },
      entries: JSON.parse(JSON.stringify(entries)),
    };
  }

  function reset() {
    peers.clear();
    entries.length = 0;
    countState = null;
    peerSequence = 0;
    sessionSequence = 0;
    sequence = 0;
    startedAt = null;
    lastElapsed = 0;
  }

  return Object.freeze({ record, snapshot, reset });
}
