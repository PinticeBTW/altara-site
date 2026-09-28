const clean = (value) => String(value || "").trim().toLowerCase();
const timestamp = (value) => {
  const ms = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
};

// A residence changes on a logical move, even when the Room/session does not.
function residence(row) {
  const serverId = clean(row.serverId || row.server_id);
  const channelId = clean(row.channelId || row.channel_id);
  const userId = clean(row.userId || row.user_id);
  const sessionId = clean(row.sessionId || row.session_id);
  const enteredAt = Math.max(timestamp(row.joinedAt || row.joined_at), timestamp(row.assignmentUpdatedAt || row.assignment_updated_at));
  if (!serverId || !channelId || !userId || !sessionId || !enteredAt) return null;
  return { serverId, channelId, enteredAt, key: JSON.stringify([userId, sessionId, channelId, enteredAt]) };
}

/**
 * Public presentation derived exclusively from accepted membership snapshots.
 * Existing occupants witness continuity and relay it over the existing server
 * broadcast. This is not persisted backend occupancy history. A cold baseline
 * without a witness reports an estimate, never an invented exact call start.
 */
export function createServerVoiceCallEpochProjection({ now = Date.now } = {}) {
  const servers = new Map();
  const pending = new Map();
  const pendingTtlMs = 35_000;
  const copy = (record) => record ? { ...record, witnesses: [...record.witnesses] } : null;

  function applyPacket(packet) {
    const record = servers.get(packet.serverId)?.channels.get(packet.channelId);
    if (!record || !packet.witnesses.some((key) => record.witnesses.includes(key))) return false;
    if (packet.startedAt > record.oldestResidenceAt || packet.startedAt > record.startedAt) return false;
    const estimated = packet.startedAt < record.startedAt ? packet.estimated : record.estimated && packet.estimated;
    const changed = record.startedAt !== packet.startedAt || record.estimated !== estimated;
    record.startedAt = packet.startedAt;
    record.estimated = estimated;
    return changed;
  }

  return {
    sync(serverId, rows, { complete = false } = {}) {
      const sid = clean(serverId);
      if (!sid) return false;
      const previous = servers.get(sid) || { known: false, channels: new Map() };
      const groups = new Map();
      for (const row of rows || []) {
        const member = residence(row);
        if (!member || member.serverId !== sid) continue;
        if (!groups.has(member.channelId)) groups.set(member.channelId, []);
        groups.get(member.channelId).push(member);
      }
      const channels = new Map();
      for (const [channelId, members] of groups) {
        const witnesses = [...new Set(members.map((member) => member.key))].sort();
        const oldestResidenceAt = Math.min(...members.map((member) => member.enteredAt));
        const old = previous.channels.get(channelId);
        const continuous = old && witnesses.some((key) => old.witnesses.includes(key));
        channels.set(channelId, {
          serverId: sid, channelId, witnesses, oldestResidenceAt,
          startedAt: continuous ? Math.min(old.startedAt, oldestResidenceAt) : oldestResidenceAt,
          estimated: continuous ? old.estimated : !(previous.known && !old),
        });
      }
      const fingerprint = (map) => JSON.stringify([...map].sort(([a], [b]) => a.localeCompare(b)));
      let changed = fingerprint(previous.channels) !== fingerprint(channels);
      servers.set(sid, { known: previous.known || complete, channels });
      for (const [key, entry] of pending) {
        if (entry.expiresAt <= now()) { pending.delete(key); continue; }
        if (entry.packet.serverId === sid) changed = applyPacket(entry.packet) || changed;
      }
      return changed;
    },
    receive(payload, serverId) {
      const sid = clean(serverId);
      if (!sid || clean(payload?.serverId) !== sid || !Array.isArray(payload?.epochs)) return false;
      let changed = false;
      for (const input of payload.epochs.slice(0, 200)) {
        const startedAt = timestamp(input?.startedAt);
        const channelId = clean(input?.channelId);
        if (!channelId || !startedAt || startedAt > now() + 1000 || !Array.isArray(input?.witnesses)
          || typeof input.estimated !== "boolean") continue;
        const witnesses = input.witnesses.filter((key) => typeof key === "string" && key.length < 500).slice(0, 200);
        if (!witnesses.length) continue;
        const packet = { serverId: sid, channelId, startedAt, estimated: input.estimated, witnesses };
        const key = JSON.stringify([sid, channelId, startedAt, witnesses]);
        pending.set(key, { packet, expiresAt: now() + pendingTtlMs });
        while (pending.size > 400) pending.delete(pending.keys().next().value);
        changed = applyPacket(packet) || changed;
      }
      return changed;
    },
    get(serverId, channelId) { return copy(servers.get(clean(serverId))?.channels.get(clean(channelId))); },
    snapshot(serverId) { return [...(servers.get(clean(serverId))?.channels.values() || [])].map(copy); },
    clearServer(serverId) {
      const sid = clean(serverId);
      servers.delete(sid);
      for (const [key, entry] of pending) if (entry.packet.serverId === sid) pending.delete(key);
    },
    clear() { servers.clear(); pending.clear(); },
  };
}
