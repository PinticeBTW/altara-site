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
