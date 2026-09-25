// Conversation authority adapter for the existing Private Call media stack.
// It owns no rooms, devices, signaling channels, or media publications.
const id = value => String(value || '').trim().toLowerCase();
const ids = values => [...new Set((Array.isArray(values) ? values : []).map(id).filter(Boolean))];
export const GROUP_DM_CALL_CONTRACT_VERSION = 2;

export function normalizeGroupDmCallState(value, conversationId, userId) {
  const row = Array.isArray(value) ? value[0] : value;
  const conv = id(conversationId), me = id(userId);
  if (!row || Number(row.contractVersion) !== GROUP_DM_CALL_CONTRACT_VERSION
    || id(row.conversationId) !== conv) return null;
  const callId = id(row.callId), roomName = String(row.roomName || '').trim();
  const active = row.enabled === true && row.active === true && row.status === 'active'
    && !!callId && roomName === `groupdm_${conv}_${callId}`;
  const connectedUserIds = active ? ids(row.connectedUserIds) : [];
  const localMemberGeneration = id(row.localMemberGeneration);
  const remaining = Date.parse(row.localPresentUntil) - Date.parse(row.serverTime);
  const localLeaseRemainingMs = Number.isFinite(remaining) ? Math.max(0, Math.min(45000, remaining)) : 0;
  return Object.freeze({ ...row, conversationId: conv, callId, roomName,
    enabled: row.enabled === true, active, status: active ? 'active' : 'ended',
    connectedUserIds, connectedCount: connectedUserIds.length,
    ringingUserIds: active ? ids(row.ringingUserIds).filter(uid => uid !== id(row.createdBy)) : [],
    declinedUserIds: ids(row.declinedUserIds), ignoredUserIds: ids(row.ignoredUserIds), leftUserIds: ids(row.leftUserIds),
    localMemberGeneration,
    localLeaseRemainingMs,
    localPresent: active && row.localPresent === true && !!localMemberGeneration
      && localLeaseRemainingMs > 0 && connectedUserIds.includes(me),
  });
}

export function createGroupDmCallSessionClient({ rpc, getUserId, onState = () => {}, onInvalidated = () => {},
  now = () => globalThis.performance?.now?.() ?? Date.now(), schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = timer => clearTimeout(timer),
} = {}) {
  const records = new Map(), owners = new Map(), epochs = new Map(), pending = new Map(), observations = new Map();
  const leaseTimers = new Map();
  let accountId = id(getUserId());
  const readUser = () => {
    const user = id(getUserId());
    if (user !== accountId) {
      accountId = user;
      for (const conv of new Set([...owners.keys(), ...records.keys(), ...pending.keys()])) retire(conv, 'account_changed');
      records.clear();
    }
    return user;
  };
  const nextObservation = conv => { const next = (observations.get(conv) || 0) + 1; observations.set(conv, next); return next; };
  const epoch = conv => epochs.get(conv) || 0;
  const bump = conv => { const next = epoch(conv) + 1; epochs.set(conv, next); return next; };
  const sameOwner = (left, right) => !!left && !!right && left.callId === right.callId
    && left.memberGeneration === right.memberGeneration && left.userId === right.userId;
  const ownerOf = row => ({ callId: row.callId, memberGeneration: row.localMemberGeneration,
    roomName: row.roomName, userId: row.authenticatedUserId,
    leaseExpiresAt: Number(row.receivedAt) + Number(row.localLeaseRemainingMs) });
  function cancelLease(conv) {
    const timer = leaseTimers.get(conv);
    leaseTimers.delete(conv);
    if (timer) cancelSchedule(timer.handle);
  }
  function expired(conv) {
    const owner = owners.get(conv);
    if (!owner || owner.leaseExpiresAt > Number(now())) return false;
    retire(conv, 'authoritative_membership_expired');
    return true;
  }
  function armLease(conv, owner) {
    cancelLease(conv);
    if (expired(conv)) return;
    const timer = { owner, handle: null };
    leaseTimers.set(conv, timer);
    timer.handle = schedule(() => {
      readUser();
      if (leaseTimers.get(conv) !== timer || owners.get(conv) !== owner) return;
      if (!expired(conv)) armLease(conv, owner);
    }, Math.max(0, owner.leaseExpiresAt - Number(now())));
  }
  function current(conversationId, expected = owners.get(id(conversationId))) {
    const user = readUser();
    expired(id(conversationId));
    const conv = id(conversationId), owner = owners.get(conv), row = records.get(conv);
    return !!expected && owner?.userId === user && sameOwner(owner, expected) && row?.localPresent === true
      && sameOwner(owner, ownerOf(row));
  }
  function retire(conv, reason = 'local_leave') {
    bump(conv);
    cancelLease(conv);
    const owner = owners.get(conv) || null;
    owners.delete(conv);
    if (owner) onInvalidated(conv, reason);
    return owner;
  }
  async function request(conv, action, owner = null) {
    const user = readUser();
    if (!conv || !user) throw new Error('group_call_identity_missing');
    if (owner?.userId && owner.userId !== user) throw new Error('group_call_user_changed');
    const { data, error } = await rpc('group_dm_call_action_v2', {
      p_conversation_id: conv, p_action: action,
      p_call_id: owner?.callId || null, p_member_generation: owner?.memberGeneration || null,
    });
    if (user !== readUser()) throw new Error('group_call_user_changed');
    if (error) throw error;
    const row = normalizeGroupDmCallState(data, conv, user);
    if (!row) throw new Error('group_call_backend_upgrade_required');
    return Object.freeze({ ...row, authenticatedUserId: user, receivedAt: Number(now()) });
  }
  function project(conv, row, { renewLease = false } = {}) {
    if (row.authenticatedUserId !== readUser()) throw new Error('group_call_user_changed');
    records.set(conv, row);
    expired(conv);
    const owner = owners.get(conv);
    if (owner && (!row.localPresent || !sameOwner(owner, ownerOf(row)))) retire(conv, 'authoritative_membership_ended');
    else if (owner) {
      const updated = { ...owner, leaseExpiresAt: renewLease ? ownerOf(row).leaseExpiresAt
        : Math.min(owner.leaseExpiresAt, ownerOf(row).leaseExpiresAt) };
      owners.set(conv, updated);
      armLease(conv, updated);
    }
    onState(conv, row);
    return row;
  }
  async function discover(conversationId) {
    readUser();
    const conv = id(conversationId), expectedEpoch = epoch(conv);
    const observation = nextObservation(conv);
    const row = await request(conv, 'discover');
    if (epoch(conv) !== expectedEpoch || observations.get(conv) !== observation) return records.get(conv) || null;
    return project(conv, row);
  }
  function enter(conversationId, { existingOnly = false, callId = '' } = {}) {
    readUser();
    const conv = id(conversationId);
    if (pending.has(conv)) return pending.get(conv);
    const expectedEpoch = bump(conv);
    const task = (async () => {
      const row = await request(conv, existingOnly ? 'join' : 'start', callId ? { callId: id(callId) } : null);
      if (epoch(conv) !== expectedEpoch) {
        // A delayed successful join must not survive an explicit local leave.
        if (row.localPresent) await request(conv, 'leave', ownerOf(row)).catch(() => {});
        throw new Error('group_call_join_cancelled');
      }
      if (!row.enabled) throw new Error('group_call_backend_upgrade_required');
      if (!row.localPresent) throw new Error('group_call_membership_denied');
      // An observation issued while admission was pending may describe the
      // pre-join state even if its response arrives after successful admission.
      nextObservation(conv);
      owners.set(conv, ownerOf(row));
      return project(conv, row, { renewLease: true });
    })().finally(() => { if (pending.get(conv) === task) pending.delete(conv); });
    pending.set(conv, task);
    return task;
  }
  async function touch(conversationId) {
    const conv = id(conversationId), owner = owners.get(conv);
    if (!current(conv, owner)) return null;
    const expectedEpoch = epoch(conv);
    const observation = nextObservation(conv);
    try {
      const row = await request(conv, 'touch', owner);
      if (expectedEpoch !== epoch(conv) || observations.get(conv) !== observation) return records.get(conv) || null;
      return project(conv, row, { renewLease: true });
    } catch (error) {
      if (expectedEpoch === epoch(conv) && /membership|forbidden|not.member|generation|ended|denied|42501/i.test(`${error?.code || ''} ${error?.message || error}`)) {
        retire(conv, 'authoritative_membership_denied');
      }
      throw error;
    }
  }
  function leave(conversationId) {
    readUser();
    const conv = id(conversationId), owner = retire(conv);
    if (!owner) return Promise.resolve(null);
    const expectedEpoch = epoch(conv);
    return request(conv, 'leave', owner).then(row => {
      if (epoch(conv) === expectedEpoch) return project(conv, row);
      return row;
    });
  }
  async function decline(conversationId, { ignored = false, callId = '' } = {}) {
    readUser();
    const conv = id(conversationId), expectedEpoch = epoch(conv);
    const row = await request(conv, ignored ? 'ignore' : 'decline', { callId: id(callId || records.get(conv)?.callId) });
    if (expectedEpoch === epoch(conv)) project(conv, row);
    return row;
  }
  return {
    discover, enter, touch, leave, decline,
    isCurrent: current,
    getState: conversationId => { readUser(); expired(id(conversationId)); return records.get(id(conversationId)) || null; },
    getOwner: conversationId => {
      const conv = id(conversationId);
      return current(conv) ? { ...owners.get(conv) } : null;
    },
    invalidate(conversationId, reason = 'membership_revoked') {
      const conv = id(conversationId); retire(conv, reason); records.delete(conv);
    },
  };
}
