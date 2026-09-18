// Opt-in, in-memory DEV evidence. No authority, timers, logging or I/O.
export const SERVER_VOICE_HEARTBEAT_DIAGNOSTIC_EVENTS = Object.freeze([
  'heartbeat_cycle', 'heartbeat_skipped', 'heartbeat_settled',
  'write_started', 'write_finished', 'write_discarded',
  'broadcast_started', 'broadcast_finished', 'broadcast_skipped',
  'share_broadcast_started', 'share_broadcast_finished', 'transport_received',
  'apply_received', 'apply_accepted', 'apply_rejected', 'snapshot_requested',
  'snapshot_returned', 'snapshot_row', 'snapshot_applied', 'snapshot_rejected',
  'lease_sample', 'prune_considered', 'subscription_status',
  'recovery_requested', 'recovery_started', 'recovery_skipped', 'recovery_failed',
]);

const events = new Set(SERVER_VOICE_HEARTBEAT_DIAGNOSTIC_EVENTS);
const reasons = new Set([
  'heartbeat', 'heartbeat_start', 'heartbeat_interval', 'heartbeat_missing',
  'local_audio_state', 'membership_audio_state', 'local_mute', 'local_deafen',
  'mic_toggle', 'deafen_toggle', 'broadcast', 'postgres', 'postgres_update',
  'postgres_insert', 'postgres_delete', 'postgres_changes', 'realtime',
  'snapshot', 'snapshot_refresh', 'snapshot_reconcile', 'snapshot_row',
  'initial_snapshot', 'post_subscribe_snapshot', 'post_subscribe', 'subscription',
  'SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED', 'reconnect', 'reconnected',
  'refresh', 'manual', 'manual_repair', 'repair', 'stable_join', 'timer',
  'stale_purge', 'lease_expired', 'recovery_lease_expired', 'session_changed',
  'session_replaced', 'session_mismatch', 'stale_session', 'stale_assignment',
  'context_stale', 'context_current', 'context_missing', 'assignment_changed',
  'current', 'missing', 'fresh', 'stale', 'accepted', 'rejected', 'newer',
  'older', 'duplicate', 'terminal_leave', 'explicit_leave', 'leave',
  'logical_move', 'channel_move', 'row_click', 'join', 'joining', 'connected',
  'membership', 'membership_update', 'membership_insert', 'membership_delete',
  'membership_write', 'local_write', 'write_result', 'fetch', 'fetch_result',
  'occupancy', 'occupancy_snapshot', 'active_call', 'foreground', 'visibility',
  'visibilitychange', 'focus', 'blur', 'observer_refresh', 'unknown_reason',
  'recovery_healthy', 'recovery_in_progress', 'recovery_auth_denied', 'recovery_retry_pending',
  'recovery_not_relevant', 'recovery_owner_changed', 'recovery_retry_exhausted', 'heartbeat_recovery',
]);
const outcomes = new Set([
  'ok', 'error', 'success', 'applied', 'failed', 'pending', 'skipped',
  'cancelled', 'timeout', 'timed out', 'stale', 'accepted', 'rejected',
  'missing', 'no_row', 'returned', 'superseded_before_apply',
  'superseded_after_apply', 'superseded_after_failure', 'unknown',
]);
const transports = new Set(['broadcast', 'postgres', 'postgres_changes', 'realtime', 'snapshot', 'rpc', 'rest', 'local', 'timer', 'unknown']);
const subscriptionStates = new Set(['SUBSCRIBED', 'CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT', 'JOINING', 'CONNECTING', 'UNSUBSCRIBED']);
const errorCodes = new Set(['42501', '42703', '23505', '57014', 'PGRST116', 'PGRST202', 'server_voice_membership_session_missing', 'AbortError', 'TimeoutError', 'NetworkError', 'unknown_error']);
const maxDate = 8_640_000_000_000_000;

// Only own data properties: diagnostics must not call an arbitrary getter or
// serialize a supplied error, token, metadata object or SDK instance.
function read(value, key) {
  try { return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined; }
  catch (_) { return undefined; }
}
function first(value, keys) {
  for (const key of keys) {
    const candidate = read(value, key);
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return undefined;
}
function number(value, { signed = false, integer = false } = {}) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maxDate
    && (signed || value >= 0) && (!integer || Number.isSafeInteger(value)) ? value : null;
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,255}$/.test(value)) return null;
  if (/(?:bearer|sb_secret|sb_publishable|altara_bot|service_role|password|api[_-]?key|access[_-]?token|refresh[_-]?token)/i.test(value)
    || /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  return value;
}
function timestamp(value) {
  if (typeof value === 'number') return number(value);
  // Preserve microseconds instead of silently rounding an ordering diagnostic.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}
function clock(value) {
  if (typeof value === 'bigint') return value >= 0n && value.toString().length <= 40 ? value.toString() : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,39})$/.test(value) ? value : null;
}
function rowSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    serverId: identifier(first(value, ['serverId', 'server_id'])),
    userId: identifier(first(value, ['userId', 'user_id'])),
    channelId: identifier(first(value, ['channelId', 'channel_id', 'voiceChannelId', 'canonicalChannelId'])),
    conversationId: identifier(first(value, ['conversationId', 'conversation_id'])),
    sessionId: identifier(first(value, ['sessionId', 'session_id'])),
    assignmentNonce: identifier(first(value, ['assignmentNonce', 'assignment_nonce'])),
    stateClock: clock(first(value, ['stateClock', 'state_clock'])),
    heartbeatAt: timestamp(first(value, ['heartbeatAt', 'heartbeat_at'])),
    updatedAt: timestamp(first(value, ['updatedAt', 'updated_at'])),
    assignmentAt: timestamp(first(value, ['assignmentAt', 'assignmentUpdatedAt', 'assignment_updated_at'])),
  });
}
function reason(value) {
  if (typeof value !== 'string' || value.length > 100) return 'unknown_reason';
  return value.split(':').every(part => reasons.has(part)) ? value : 'unknown_reason';
}
function sessionKey(row) {
  return row?.serverId && row.userId && row.sessionId ? JSON.stringify([row.serverId, row.userId, row.sessionId]) : null;
}

export function createServerVoiceHeartbeatDiagnostics({
  enabled = false, now = Date.now, limit = 2400, environment = () => ({}),
} = {}) {
  const capacity = Number.isSafeInteger(limit) ? Math.max(1, Math.min(2400, limit)) : 2400;
  const history = [];
  const sequences = new Map();
  let cursor = 0;
  let dropped = 0;
  const active = () => { try { return (typeof enabled === 'function' ? enabled() : enabled) === true; } catch (_) { return false; } };
  const currentTime = () => { try { return number(now()); } catch (_) { return null; } };
  const context = () => {
    let value; try { value = environment(); } catch (_) { value = {}; }
    const visibilityState = read(value, 'visibilityState');
    return {
      visibilityState: ['visible', 'hidden', 'prerender', 'unloaded'].includes(visibilityState) ? visibilityState : null,
      visible: typeof read(value, 'visible') === 'boolean' ? read(value, 'visible') : null,
      focused: typeof read(value, 'focused') === 'boolean' ? read(value, 'focused') : null,
    };
  };

  function record(event, details = {}) {
    if (!active()) return null;
    const row = rowSummary(read(details, 'row'));
    const previous = rowSummary(read(details, 'previous'));
    const key = sessionKey(row);
    const entry = { event: events.has(event) ? event : 'unknown_event', at: currentTime(), ...context(), row, previous,
      correlationKey: key && row.heartbeatAt !== null ? JSON.stringify([row.serverId, row.userId, row.sessionId, row.heartbeatAt]) : null };
    if (read(details, 'reason') !== undefined) entry.reason = reason(read(details, 'reason'));
    for (const name of ['sequence', 'scheduledAt', 'actualRunAt', 'writeStartedAt', 'writeFinishedAt', 'receivedAt', 'schedulerDelayMs', 'durationMs', 'ageMs', 'thresholdMs', 'rowCount', 'affectedRows']) {
      const value = read(details, name);
      if (value !== undefined) entry[name] = number(value, { signed: name === 'ageMs', integer: ['sequence', 'rowCount', 'affectedRows'].includes(name) });
    }
    for (const name of ['previousHeartbeatAt', 'resultingHeartbeatAt']) if (read(details, name) !== undefined) entry[name] = timestamp(read(details, name));
    for (const name of ['accepted', 'writeSucceeded', 'current', 'membershipFresh', 'shareActive', 'shareAllowed', 'removed', 'matched', 'queued', 'terminalLeave']) {
      if (read(details, name) !== undefined) entry[name] = typeof read(details, name) === 'boolean' ? read(details, name) : null;
    }
    for (const name of ['cycleId', 'requestId']) if (read(details, name) !== undefined) entry[name] = identifier(read(details, name));
    for (const name of ['result', 'outcome']) {
      const value = read(details, name);
      if (value !== undefined) entry[name] = typeof value === 'boolean' ? value : outcomes.has(value) ? value : 'unknown';
    }
    for (const [name, allowed, fallback] of [['transport', transports, 'unknown'], ['subscriptionStatus', subscriptionStates, 'UNKNOWN'], ['errorCode', errorCodes, 'unknown_error']]) {
      const value = read(details, name);
      if (value !== undefined) entry[name] = allowed.has(value) ? value : fallback;
    }
    Object.freeze(entry);
    if (history.length < capacity) history.push(entry);
    else { history[cursor] = entry; cursor = (cursor + 1) % capacity; dropped += 1; }
    return entry;
  }

  function beginCycle(input, timing = {}) {
    if (!active()) return null;
    const row = rowSummary(input);
    const key = sessionKey(row);
    if (!key) return null;
    const sequence = (sequences.get(key) || 0) + 1;
    sequences.delete(key); sequences.set(key, sequence);
    if (sequences.size > Math.min(capacity, 256)) sequences.delete(sequences.keys().next().value);
    const scheduledAt = number(read(timing, 'scheduledAt'));
    const actualRunAt = number(read(timing, 'actualRunAt')) ?? currentTime();
    const cycle = Object.freeze({ sequence, scheduledAt, actualRunAt,
      schedulerDelayMs: scheduledAt !== null && actualRunAt !== null ? Math.max(0, actualRunAt - scheduledAt) : null });
    record('heartbeat_cycle', { row: input, ...cycle });
    return cycle;
  }

  return Object.freeze({
    record, beginCycle,
    snapshot() {
      if (!active()) return { enabled: false, limit: capacity, dropped: 0, sessionCount: 0, entries: [] };
      return { enabled: true, limit: capacity, dropped, sessionCount: sequences.size,
        entries: [...history.slice(cursor), ...history.slice(0, cursor)] };
    },
    clear() { history.length = 0; sequences.clear(); cursor = 0; dropped = 0; },
  });
}

// Explicit samples share an outstanding SDK read. A timed-out report cannot
// create another probe for the same track on the next external sample tick.
const pendingTrackReports = new WeakMap();
const mediaSources = new Set(['microphone', 'screen_share', 'screen_share_audio']);
function mediaSource(value) { return mediaSources.has(value) ? value : null; }
function readyState(track) {
  const value = track?.mediaStreamTrack?.readyState;
  return value === 'live' || value === 'ended' ? value : null;
}
function statsSummary(report) {
  const result = [];
  if (!report || typeof report.values !== 'function') return result;
  let examined = 0;
  for (const row of report.values()) {
    if (++examined > 256 || result.length >= 8) break;
    if (row?.type !== 'inbound-rtp') continue;
    const output = {};
    for (const key of ['bytesReceived', 'packetsReceived', 'packetsLost', 'framesDecoded', 'framesDropped', 'totalAudioEnergy', 'audioLevel', 'jitter']) {
      const value = number(row[key], { signed: key === 'packetsLost' });
      if (value !== null) output[key] = value;
    }
    result.push(output);
  }
  return result;
}
function trackReport(track) {
  if (!track || typeof track.getRTCStatsReport !== 'function') return Promise.resolve({ status: 'unavailable', stats: [] });
  if (pendingTrackReports.has(track)) return pendingTrackReports.get(track);
  const promise = Promise.resolve().then(() => track.getRTCStatsReport())
    .then(report => ({ status: 'ok', stats: statsSummary(report) }))
    .catch(() => ({ status: 'failed', stats: [] }))
    .finally(() => pendingTrackReports.delete(track));
  pendingTrackReports.set(track, promise);
  return promise;
}
function boundedArray(values, maximum) {
  const result = [];
  if (!values || typeof values[Symbol.iterator] !== 'function') return result;
  for (const value of values) { if (result.length >= maximum) break; result.push(value); }
  return result;
}

/** Read-only sample of the current Room and media DOM; never captures or changes media. */
export async function sampleServerVoiceHeartbeatMedia({
  controller = null, move = null, memberships = [], audioElements = [], videoElements = [],
  timeoutMs = 800, now = Date.now,
} = {}) {
  const room = controller?.room || null;
  const localPublications = [];
  const remotePublications = [];
  const probes = [];
  let totalPublications = 0;
  let publicationsTruncated = room?.localParticipant?.trackPublications?.size > 32 || room?.remoteParticipants?.size > 64;
  const add = (publication, peerId, local) => {
    const source = mediaSource(publication?.source);
    if (!source) return;
    if (totalPublications >= 32) { publicationsTruncated = true; return; }
    totalPublications += 1;
    const track = publication.track;
    const item = { peerId: identifier(peerId), trackSid: identifier(publication.trackSid), source,
      muted: typeof publication.isMuted === 'boolean' ? publication.isMuted : null,
      subscribed: local ? null : publication.isSubscribed === true,
      hasTrack: !!track, readyState: readyState(track) };
    if (local) localPublications.push(item);
    else { remotePublications.push(item); probes.push({ item, promise: trackReport(track) }); }
  };
  for (const publication of boundedArray(room?.localParticipant?.trackPublications?.values?.(), 32)) {
    add(publication, room?.localParticipant?.identity, true);
  }
  for (const peer of boundedArray(room?.remoteParticipants?.values?.(), 64)) {
    if (peer?.trackPublications?.size > 32) publicationsTruncated = true;
    for (const publication of boundedArray(peer?.trackPublications?.values?.(), 32)) add(publication, peer?.identity, false);
  }
  const resultByProbe = new Map();
  let accepting = true;
  let timedOut = false;
  let timer = null;
  try {
    if (probes.length) await Promise.race([
      Promise.all(probes.map(async (probe, index) => {
        const result = await probe.promise;
        if (accepting) resultByProbe.set(index, result);
      })),
      new Promise(resolve => { timer = setTimeout(() => { timedOut = true; resolve(); }, Math.max(1, Math.min(800, number(timeoutMs) ?? 800))); }),
    ]);
  } finally {
    accepting = false;
    if (timer !== null) clearTimeout(timer);
  }
  probes.forEach((probe, index) => Object.assign(probe.item, resultByProbe.get(index) || { status: 'timeout', stats: [] }));
  let elementCount = 0;
  const elements = (input, video) => boundedArray(input, Math.max(0, 64 - elementCount)).map(element => {
    elementCount += 1;
    const output = {
      muted: typeof element?.muted === 'boolean' ? element.muted : null,
      paused: typeof element?.paused === 'boolean' ? element.paused : null,
      connected: typeof element?.isConnected === 'boolean' ? element.isConnected : null,
      volume: number(element?.volume), readyState: number(element?.readyState), currentTime: number(element?.currentTime),
    };
    if (video) { output.videoWidth = number(element?.videoWidth); output.videoHeight = number(element?.videoHeight); }
    return output;
  });
  const audio = elements(audioElements, false);
  const video = elements(videoElements, true);
  const moveSummary = {};
  for (const key of ['authoritativeChannelAfter', 'sessionChannel', 'uiChannel', 'roomSid', 'membershipSessionId', 'assignmentNonce']) moveSummary[key] = identifier(read(move, key));
  moveSummary.counts = {};
  for (const key of ['tokenRequests', 'connect', 'micPublish', 'moveSoundPlays']) moveSummary.counts[key] = number(read(read(move, 'counts'), key), { integer: true });
  let at = null; try { at = number(now()); } catch (_) { /* Missing sample clock remains unknown. */ }
  return {
    at, room: { state: ['connected', 'disconnected', 'connecting', 'reconnecting', 'signalReconnecting'].includes(room?.state) ? room.state : null,
      localParticipantId: identifier(room?.localParticipant?.identity), remoteParticipantCount: number(room?.remoteParticipants?.size, { integer: true }) },
    move: moveSummary, memberships: boundedArray(memberships, 256).map(rowSummary),
    localPublications, remotePublications, audioElements: audio, videoElements: video,
    statsTimedOut: timedOut, roomStillCurrent: (controller?.room || null) === room, publicationsTruncated,
    limits: { publications: 32, inboundStats: 256, elements: 64, memberships: 256, deadlineMs: Math.max(1, Math.min(800, number(timeoutMs) ?? 800)) },
  };
}
