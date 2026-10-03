const TABLE = 'user_voice_volume_preferences';
const PENDING_KEY = 'altara_pending_voice_volumes_v1';
const validId = value => /^(altara_bot:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const validFactor = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2;
const clean = entries => new Map([...entries].filter(([id, factor]) => validId(id) && validFactor(factor)));

// Each participant has its own cloud row. A change on one device cannot overwrite
// another device's choices for other people. Unsaved changes survive offline use.
export function createParticipantVolumePreferences({ client, getUserId, getLocal, apply, storage,
  onError = () => {}, delayMs = 500, now = Date.now } = {}) {
  let state = null;
  const current = s => s === state && s.owner === String(getUserId() || '').toLowerCase();
  const key = owner => `${PENDING_KEY}:${owner}`;
  const persist = s => {
    try { storage?.setItem(key(s.owner), JSON.stringify(Object.fromEntries(s.pending))); } catch (_) {}
  };
  const report = (s, error) => {
    if (!current(s) || s.reported) return;
    s.reported = true;
    onError(error);
  };
  function ownerState() {
    const owner = String(getUserId() || '').toLowerCase();
    if (state?.owner === owner) return state;
    if (state?.timer) clearTimeout(state.timer);
    let pending = new Map();
    try { pending = clean(Object.entries(JSON.parse(storage?.getItem(key(owner)) || '{}'))); } catch (_) {}
    state = { owner, pending, loaded: false, loading: null, writing: null, timer: null, refreshedAt: 0, reported: false };
    return state;
  }
  function schedule(s) {
    if (!current(s) || !s.loaded || !s.pending.size) return;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.timer = null; void flush(); }, delayMs);
  }
  async function load({ force = false } = {}) {
    const s = ownerState();
    if (!validId(s.owner) || s.owner.startsWith('altara_bot:')) return false;
    if (s.loading) return s.loading;
    if (s.loaded && (!force || now() - s.refreshedAt < 10000)) { schedule(s); return true; }
    s.loading = (async () => {
      try {
        // Explicit owner filtering also prevents a future overly broad policy
        // from making this client consume another listener's preferences.
        const rows = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await client.from(TABLE).select('participant_id,volume_factor')
            .eq('user_id', s.owner).order('participant_id').range(offset, offset + 999);
          if (result.error) throw result.error;
          if (!current(s)) return false;
          rows.push(...(result.data || []));
          if ((result.data || []).length < 1000) break;
        }
        const cloud = clean(rows.map(row => [row.participant_id, row.volume_factor]));
        // Migrate device-only choices once; cloud choices and pending edits win.
        const migrate = clean(getLocal());
        for (const [id, factor] of migrate) if (!cloud.has(id) && !s.pending.has(id)) s.pending.set(id, factor);
        for (const [id, factor] of s.pending) cloud.set(id, factor);
        persist(s);
        apply(cloud);
        s.loaded = true;
        s.refreshedAt = now();
        s.reported = false;
        schedule(s);
        return true;
      } catch (error) { report(s, error); return false; }
      finally { s.loading = null; }
    })();
    return s.loading;
  }
  function set(id, factor) {
    const s = ownerState();
    if (!s.owner || !validId(id) || !validFactor(factor)) return;
    s.pending.set(id, factor);
    persist(s);
    if (s.loaded) schedule(s);
    else void load();
  }
  async function flush() {
    const s = ownerState();
    clearTimeout(s.timer); s.timer = null;
    if (s.writing) return s.writing;
    if (!s.loaded && !await load()) return false;
    if (!current(s) || !s.pending.size) return true;
    const saved = new Map(s.pending);
    s.writing = (async () => {
      try {
        const result = await client.from(TABLE).upsert([...saved].map(([participant_id, volume_factor]) => ({
          user_id: s.owner, participant_id, volume_factor,
        })), { onConflict: 'user_id,participant_id' });
        if (result.error) throw result.error;
        // A later slider change must remain queued even if an earlier save ends.
        for (const [id, factor] of saved) if (s.pending.get(id) === factor) s.pending.delete(id);
        // An old account session must not overwrite the pending cache after
        // switching away and back while its request was still in flight.
        if (current(s)) { persist(s); s.reported = false; schedule(s); }
        return true;
      } catch (error) { report(s, error); return false; }
      finally { s.writing = null; }
    })();
    return s.writing;
  }
  function activate() {
    const s = ownerState();
    if (s.pending.size) {
      const local = new Map(getLocal());
      for (const [id, factor] of s.pending) local.set(id, factor);
      apply(local);
    }
    return load();
  }
  return { activate, load, set, flush };
}
