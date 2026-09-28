import { normalizeModerationClock } from './serverVoiceModerationState.js';

export const SERVER_VOICE_MODERATION_V2 = 'server_voice_moderation_v2';
export const SERVER_VOICE_MODERATION_LEGACY = 'legacy';
export const SERVER_VOICE_MODERATION_V2_TABLE = 'server_voice_moderation_states_v2';
export const SERVER_VOICE_MODERATION_LEGACY_TABLE = 'server_voice_moderation_states';

export function normalizeServerVoiceModerationCapability(input, serverId = '') {
  const row = input && typeof input === 'object' ? input : {};
  const id = String(row.server_id ?? row.serverId ?? '').trim();
  const generation = normalizeModerationClock(row.generation ?? row.moderationCapabilityGeneration);
  const enabled = row.server_voice_moderation_v2;
  if (!id || (serverId && id !== String(serverId)) || !generation || typeof enabled !== 'boolean') return null;
  if (typeof row.backendFeatureEnabled === 'boolean' && row.backendFeatureEnabled !== enabled) return null;
  const protocol = enabled ? SERVER_VOICE_MODERATION_V2 : SERVER_VOICE_MODERATION_LEGACY;
  if (row.moderationProtocol != null && row.moderationProtocol !== protocol) return null;
  const actionsEnabled = typeof row.backendActionsEnabled === 'boolean' ? enabled && row.backendActionsEnabled : enabled;
  return Object.freeze({ serverId: id, generation, enabled, actionsEnabled, protocol });
}

// Capability generations order backend feature decisions. They are unrelated to
// moderation clocks or local control intent, and never come from a wall clock.
export function createServerVoiceModerationProtocolStore({ clientSupportsV2 = true } = {}) {
  let accountId = '', revision = 0;
  const servers = new Map();
  const initial = serverId => Object.freeze({ serverId: String(serverId), generation: '', enabled: false, actionsEnabled: false,
    negotiatedProtocol: SERVER_VOICE_MODERATION_LEGACY, authorityProtocol: SERVER_VOICE_MODERATION_LEGACY,
    status: 'unknown', revision: 0, pendingLegacyGeneration: '', knownV2: false });
  const get = serverId => servers.get(String(serverId)) || initial(serverId);
  const commit = row => { const value = Object.freeze({ ...row, revision: ++revision }); servers.set(value.serverId, value); return value; };
  return {
    setAccount(next) { next = String(next || ''); if (next === accountId) return false; accountId = next; servers.clear(); revision++; return true; },
    get,
    hasV2Authority() { return [...servers.values()].some(row => row.authorityProtocol === SERVER_VOICE_MODERATION_V2); },
    accept(input, expectedServerId = '') {
      const normalized = normalizeServerVoiceModerationCapability(input, expectedServerId);
      if (!accountId || !normalized) return { accepted: false, reason: 'invalid_capability', state: get(expectedServerId) };
      const previous = get(normalized.serverId);
      if (previous.generation && BigInt(normalized.generation) < BigInt(previous.generation)) return { accepted: false, reason: 'stale_capability', state: previous };
      if (previous.generation === normalized.generation && previous.backendEnabled != null && (previous.backendEnabled !== normalized.enabled || previous.backendActionsEnabled !== normalized.actionsEnabled)) return { accepted: false, reason: 'conflicting_capability', state: previous };
      const supportsV2 = clientSupportsV2 && normalized.enabled;
      const enabled = supportsV2 && normalized.actionsEnabled;
      const pendingOff = !supportsV2 && previous.authorityProtocol === SERVER_VOICE_MODERATION_V2;
      const next = { ...previous, generation: normalized.generation, backendEnabled: normalized.enabled, backendActionsEnabled: normalized.actionsEnabled, enabled, actionsEnabled: enabled,
        status: 'confirmed', negotiatedProtocol: supportsV2 ? SERVER_VOICE_MODERATION_V2 : SERVER_VOICE_MODERATION_LEGACY,
        authorityProtocol: supportsV2 || pendingOff ? SERVER_VOICE_MODERATION_V2 : SERVER_VOICE_MODERATION_LEGACY,
        pendingLegacyGeneration: pendingOff ? normalized.generation : '', knownV2: previous.knownV2 || supportsV2 };
      const unchanged = Object.keys(next).every(key => next[key] === previous[key]);
      return { accepted: true, reason: unchanged ? 'duplicate_capability' : 'capability_applied', state: unchanged ? previous : commit(next) };
    },
    unavailable(serverId) {
      if (!accountId || !serverId) return get(serverId);
      const previous = get(serverId);
      if (previous.status === 'unavailable' && !previous.enabled) return previous;
      // Network failure selects legacy operations, but never revokes already
      // accepted V2 locks. Only an explicit generation + legacy snapshot can.
      return commit({ ...previous, enabled: false, actionsEnabled: false, negotiatedProtocol: SERVER_VOICE_MODERATION_LEGACY, status: 'unavailable' });
    },
    commitLegacyHydration(serverId, expectedRevision) {
      const previous = get(serverId);
      if (!accountId || previous.revision !== expectedRevision || previous.status !== 'confirmed'
        || previous.enabled || !previous.pendingLegacyGeneration
        || previous.pendingLegacyGeneration !== previous.generation) return false;
      commit({ ...previous, authorityProtocol: SERVER_VOICE_MODERATION_LEGACY, pendingLegacyGeneration: '' });
      return true;
    },
  };
}

export function normalizeLegacyServerVoiceModerationRow(row = {}, { conversationId = '', revision = 0 } = {}) {
  const serverId = String(row.server_id ?? row.serverId ?? '').trim();
  const channelId = String(row.channel_id ?? row.channelId ?? '').trim();
  const userId = String(row.user_id ?? row.userId ?? '').trim();
  if (!serverId || !channelId || !userId || !conversationId || typeof row.mic_server_muted !== 'boolean' || typeof row.deaf_server_muted !== 'boolean') return null;
  return { serverId, channelId, userId, conversationId,
    micServerMuted: row.mic_server_muted, deafServerMuted: row.deaf_server_muted,
    // A local ownership revision for capture cancellation, never DB authority.
    stateClock: `legacy:${revision}`, source: 'legacy_snapshot', updatedAt: String(row.updated_at || '') };
}
