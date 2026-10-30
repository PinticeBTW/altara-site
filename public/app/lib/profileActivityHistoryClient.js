const HEARTBEAT_MS = 60_000;
const RETRY_MS = 5_000;
const GAME_ID = /^[a-z0-9_-]{1,80}$/;
const ARTWORK_HOSTS = new Set([
  'media.steampowered.com',
  'cdn.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'images.igdb.com',
  'media.rawg.io',
  'cdn2.steamgriddb.com',
]);

function gameId(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return GAME_ID.test(id) ? id : '';
}

function artwork(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ARTWORK_HOSTS.has(url.hostname) ? url.href : '';
  } catch { return ''; }
}

function publicGame(value, hiddenIds, sharingEnabled) {
  if (!sharingEnabled || value?.type !== 'playing' || value?.kind !== 'game'
    || value.privateOnly === true || value.confirmed === false) return null;
  const id = gameId(value.gameId);
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || hiddenIds.has(id) || !name || name.length > 96 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  const activity = { type: 'playing', kind: 'game', gameId: id, name };
  for (const key of ['icon', 'logo', 'squareArtwork']) {
    const url = artwork(value[key]);
    if (url) activity[key] = url;
  }
  return activity;
}

// Only already-public game projections belong here; the desktop registry contains private paths.
export function createProfileActivityHistoryClient({ supabase, getUserId, onRecorded = () => {}, now = Date.now } = {}) {
  let identity = '';
  let generation = 0;
  let pending = null;
  let draining = null;
  let unavailable = false;
  let lastSuccess = null;
  let lastFailure = null;
  let observedActivity = '';
  let activityVersion = 0;
  let privacyIntent = null;
  let privacyVersion = 0;

  function clock() {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  }

  function authenticatedUserId() {
    try {
      const id = getUserId?.();
      return typeof id === 'string' ? id.trim() : '';
    } catch { return ''; }
  }

  function adoptIdentity(id) {
    identity = id;
    generation += 1;
    pending = null;
    unavailable = false;
    lastSuccess = null;
    lastFailure = null;
    observedActivity = '';
    activityVersion = 0;
    privacyIntent = null;
    privacyVersion = 0;
  }

  function isCurrent(task) {
    const id = authenticatedUserId();
    if (id !== identity) adoptIdentity(id);
    return !!id && task.identity === id && task.generation === generation;
  }

  async function drain() {
    let outcome = { status: 'idle' };
    while (pending) {
      const signal = pending;
      pending = null;
      if (!isCurrent(signal) || unavailable) continue;
      const intent = privacyIntent;
      const task = intent ? {
        ...signal,
        sharingEnabled: intent.sharingEnabled,
        hiddenGameIds: intent.hiddenGameIds,
        privacy: intent.privacy,
        activity: publicGame(signal.activity, new Set(intent.hiddenGameIds), intent.sharingEnabled),
      } : signal;
      task.activitySignature = JSON.stringify(task.activity);
      task.retryKey = JSON.stringify([task.privacy, task.activitySignature, task.activityVersion, intent?.version || 0]);
      const time = clock();
      const samePrivacy = lastSuccess?.privacy === task.privacy;
      // Stopping a game needs no write: the last real heartbeat is its last-played time.
      if (!intent && samePrivacy && !task.activity) continue;
      if (!intent && samePrivacy && lastSuccess.activity === task.activitySignature
        && lastSuccess.activityVersion === task.activityVersion && time - lastSuccess.at < HEARTBEAT_MS) continue;
      if (lastFailure?.key === task.retryKey && time - lastFailure.at < RETRY_MS) continue;

      let result;
      try {
        result = await supabase.rpc('sync_profile_game_activity_v1', {
          p_expected_user_id: task.identity,
          p_sharing_enabled: task.sharingEnabled,
          p_hidden_game_ids: task.hiddenGameIds,
          p_activity: task.activity,
          p_update_privacy: !!intent,
        });
      } catch (error) {
        result = { error };
      }
      // An in-flight request cannot be cancelled reliably; its expected user also gates it server-side.
      if (!isCurrent(task)) continue;
      if (result?.error) {
        const code = typeof result.error.code === 'string' ? result.error.code : '';
        unavailable = code === 'PGRST202' || code === '42883';
        lastFailure = { key: task.retryKey, at: clock() };
        outcome = { status: unavailable ? 'unavailable' : 'error', code };
        continue;
      }
      lastSuccess = {
        privacy: task.privacy,
        activity: task.activitySignature,
        activityVersion: task.activityVersion,
        at: clock(),
      };
      lastFailure = null;
      if (privacyIntent === intent) privacyIntent = null;
      outcome = { status: 'synced' };
      if (!pending || pending.privacy === task.privacy) {
        // UI refresh failures must not turn a successful write into duplicate history writes.
        try {
          const callback = onRecorded({ userId: task.identity, data: result?.data });
          callback?.catch?.(() => {});
        } catch { /* The persisted result remains successful. */ }
      }
    }
    return outcome;
  }

  function sync({ sharingEnabled = false, hiddenGameIds = [], activity = null, updatePrivacy = false } = {}) {
    const id = authenticatedUserId();
    if (id !== identity) adoptIdentity(id);
    if (!id) return Promise.resolve({ status: 'idle' });
    if (unavailable) return Promise.resolve({ status: 'unavailable' });
    const hiddenIds = new Set((Array.isArray(hiddenGameIds) ? hiddenGameIds : []).map(gameId).filter(Boolean));
    // A malformed oversized privacy list must not silently reveal games omitted by truncation.
    const enabled = sharingEnabled === true && Array.isArray(hiddenGameIds) && hiddenIds.size <= 250;
    const hidden = [...hiddenIds].sort().slice(0, 250);
    const projected = publicGame(activity, hiddenIds, enabled);
    const activitySignature = JSON.stringify(projected);
    if (activitySignature !== observedActivity) {
      observedActivity = activitySignature;
      activityVersion += 1;
    }
    const privacy = JSON.stringify([enabled, hidden]);
    // Device heartbeats cannot replace a pending explicit opt-out or hidden-game choice.
    // Keep the intent until the server confirms it, including across transient failures.
    if (updatePrivacy === true) {
      privacyIntent = { sharingEnabled: enabled, hiddenGameIds: hidden, privacy, version: ++privacyVersion };
    }
    pending = {
      identity: id, generation, sharingEnabled: enabled, hiddenGameIds: hidden,
      activity: projected, activitySignature, activityVersion, privacy,
    };
    return flush();
  }

  function flush() {
    if (!draining) {
      draining = Promise.resolve().then(drain).finally(() => {
        draining = null;
        // A new signal may arrive between the drain finishing and this promise settling.
        if (pending) return flush();
      });
    }
    return draining;
  }

  return { sync, reset: () => adoptIdentity('') };
}
