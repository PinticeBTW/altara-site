// Authority is a database revision, never a participant/media or wall clock.
export function normalizeModerationClock(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return '';
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return '';
  const clock = BigInt(text);
  return clock >= 0n ? clock.toString() : '';
}

export function normalizeServerModerationRow(row = {}) {
  const serverId = String(row.server_id ?? row.serverId ?? '').trim();
  const userId = String(row.user_id ?? row.userId ?? row.targetUserId ?? '').trim();
  const stateClock = normalizeModerationClock(row.moderation_clock ?? row.stateClock ?? row.state_clock);
  const mic = row.mic_server_muted ?? row.micServerMuted;
  const deaf = row.deaf_server_muted ?? row.deafServerMuted;
  if (!serverId || !userId || !stateClock || typeof mic !== 'boolean' || typeof deaf !== 'boolean') return null;
  return Object.freeze({
    serverId, userId, stateClock,
    channelId: String(row.channel_id ?? row.channelId ?? '').trim(),
    conversationId: String(row.conversation_id ?? row.conversationId ?? '').trim(),
    micServerMuted: mic, deafServerMuted: deaf,
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  });
}

export function createServerVoiceModerationStore() {
  let accountId = '';
  const servers = new Map();
  const get = (serverId, userId) => servers.get(String(serverId))?.get(String(userId)) || null;
  return {
    setAccount(next) {
      next = String(next || '');
      if (next === accountId) return false;
      accountId = next;
      servers.clear();
      return true;
    },
    get,
    apply(input) {
      const row = normalizeServerModerationRow(input);
      if (!accountId || !row) return { accepted: false, reason: 'invalid_authority', row: null };
      const previous = get(row.serverId, row.userId);
      if (previous && BigInt(row.stateClock) <= BigInt(previous.stateClock)) {
        return { accepted: false, reason: row.stateClock === previous.stateClock ? 'duplicate' : 'stale', row: previous };
      }
      let users = servers.get(row.serverId);
      if (!users) servers.set(row.serverId, users = new Map());
      // Keep false/false tombstones: neither snapshots nor voice cleanup erase order.
      users.set(row.userId, row);
      return { accepted: true, reason: 'newer', row, previous };
    },
  };
}
