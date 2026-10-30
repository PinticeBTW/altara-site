export const SERVER_CATEGORY_FIELD = "server_categories";
export const SERVER_CATEGORY_CAS_URL_LIMIT = 6000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 128 * 1024, MAX_PENDING_BYTES = 512 * 1024;
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
const failure = () => new Error("Não foi possível confirmar a sincronização das categorias. Tenta novamente com ligação.");
const large = () => new Error("As definições desta conta são demasiado grandes para sincronizar as categorias em segurança. Tenta novamente após atualizar as definições.");
const uncertain = (error, status) => error?.code ? error.code === "connection_unavailable"
  : status === 408 || status === 429 || status >= 500 || error?.name === "AbortError"
    || /failed to fetch|fetch failed|network request failed|networkerror|load failed|timed out/i.test(error?.message || "");

/** Preferences only: a stored ID never grants server or channel access. */
export function normalizeServerCategoryPreferences(raw) {
  try {
    if (!object(raw) || raw.version !== 1 || !object(raw.collapsed)
      || Object.keys(raw).some(key => key !== "version" && key !== "collapsed") || JSON.stringify(raw).length > MAX_BYTES) return null;
    const entries = Object.entries(raw.collapsed), merged = new Map(); let count = 0;
    if (entries.length > 500) return null;
    for (const [serverId, categories] of entries) {
      if (!UUID.test(serverId) || !Array.isArray(categories) || (count += categories.length) > 5000) return null;
      const id = serverId.toLowerCase(), values = merged.get(id) ?? new Set();
      for (const category of categories) { if (typeof category !== "string" || !UUID.test(category)) return null; values.add(category.toLowerCase()); }
      merged.set(id, values);
    }
    const collapsed = {};
    for (const id of [...merged.keys()].sort()) if (merged.get(id).size) collapsed[id] = Object.freeze([...merged.get(id)].sort());
    return Object.freeze({ version: 1, collapsed: Object.freeze(collapsed) });
  } catch { return null; }
}

const empty = normalizeServerCategoryPreferences({ version: 1, collapsed: {} });
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
// Account keys share a queue across controller lifetimes. A slow acknowledgement
// must finish before a replacement controller writes a newer pending record.
const storageQueues = new Map();
function storageTask(key, task) {
  const next = (storageQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
  storageQueues.set(key, next);
  void next.finally(() => { if (storageQueues.get(key) === next) storageQueues.delete(key); }).catch(() => {});
  return next;
}

export function createServerCategoryPreferenceSync({ client, getOwner, storage, onChange = () => {}, onTheme = () => {}, onError = () => {}, delay = 150 }) {
  let disposed = false, retired = false, ownerId, remote = empty, visible = empty, message = "", sequence = 0, timer, work, hydration;
  let readSequence = 0, workReadSequence = 0, workMustRead = false, refreshWork;
  const pending = new Map(), requests = new Set();
  const owner = () => {
    let value; try { value = getOwner(); } catch { throw failure(); }
    if (disposed || retired || typeof value !== "string" || !UUID.test(value)) throw failure();
    value = value.toLowerCase(); if (ownerId && ownerId !== value) { retired = true; throw failure(); } return ownerId ??= value;
  };
  const current = () => { try { return !disposed && ownerId && owner() === ownerId; } catch { return false; } };
  const key = suffix => `altara_server_categories_${suffix}_v1_${ownerId}`;
  const overlay = (doc, intents = pending) => {
    const collapsed = Object.fromEntries(Object.entries(doc.collapsed).map(([id, ids]) => [id, [...ids]]));
    for (const intent of intents.values()) {
      const values = new Set(collapsed[intent.serverId] ?? []);
      if (intent.collapsed) values.add(intent.categoryId); else values.delete(intent.categoryId);
      if (values.size) collapsed[intent.serverId] = [...values]; else delete collapsed[intent.serverId];
    }
    const result = normalizeServerCategoryPreferences({ version: 1, collapsed }); if (!result) throw failure(); return result;
  };
  function publish(force = false) {
    if (!current()) return;
    const next = overlay(remote);
    if (!equal(visible, next)) { visible = next; onChange(visible); } else if (force) onChange(visible);
  }
  function report(cause) {
    if (!current()) return;
    const safe = cause?.message === large().message ? large() : failure();
    if (message !== safe.message) { message = safe.message; publish(true); onError(safe); }
  }
  function clearError() { if (message && current()) { message = ""; publish(true); } }
  async function hydrate() {
    owner();
    if (!hydration) {
      const attempt = (async () => {
        if (!storage) return;
        const pendingKey = key("pending"), cacheKey = key("cache");
        const [saved, cached] = await Promise.all([
          storageTask(pendingKey, () => storage.getItem(pendingKey)), storageTask(cacheKey, () => storage.getItem(cacheKey)),
        ]);
        owner();
        if (cached !== null && cached !== undefined) {
          if (typeof cached !== "string" || cached.length > MAX_BYTES + 200) throw failure();
          let record; try { record = JSON.parse(cached); } catch { throw failure(); }
          const doc = normalizeServerCategoryPreferences(record?.doc);
          if (!object(record) || record.version !== 1 || record.ownerId !== ownerId || !doc) throw failure();
          remote = doc;
        }
        if (saved !== null && saved !== undefined) {
          if (typeof saved !== "string" || saved.length > MAX_PENDING_BYTES) throw failure();
          let record; try { record = JSON.parse(saved); } catch { throw failure(); }
          if (!object(record) || record.version !== 1 || record.ownerId !== ownerId || !Array.isArray(record.intents) || record.intents.length > 5000) throw failure();
          const restored = new Map();
          for (const entry of record.intents) {
            if (!object(entry) || typeof entry.serverId !== "string" || !UUID.test(entry.serverId) || typeof entry.categoryId !== "string" || !UUID.test(entry.categoryId) || typeof entry.collapsed !== "boolean") throw failure();
            const serverId = entry.serverId.toLowerCase(), categoryId = entry.categoryId.toLowerCase(), id = `${serverId}:${categoryId}`;
            if (restored.has(id)) throw failure(); restored.set(id, { serverId, categoryId, collapsed: entry.collapsed, sequence: ++sequence });
          }
          // A gesture made while AsyncStorage was reading is newer than disk.
          for (const [id, intent] of pending) restored.set(id, intent);
          overlay(remote, restored);
          pending.clear(); for (const [id, intent] of restored) pending.set(id, intent);
        }
        publish();
      })();
      hydration = attempt;
      void attempt.catch(() => { if (hydration === attempt) hydration = undefined; });
    }
    return hydration;
  }
  async function persistPending() {
    await hydrate(); if (!storage) return;
    const pendingKey = key("pending");
    await storageTask(pendingKey, async () => {
      owner();
      const intents = [...pending.values()].sort((a, b) => `${a.serverId}:${a.categoryId}`.localeCompare(`${b.serverId}:${b.categoryId}`))
        .map(({ serverId, categoryId, collapsed }) => ({ serverId, categoryId, collapsed }));
      // An empty durable record acknowledges completion without a bulk native
      // Keychain deletion that would block unrelated session/preference reads.
      const serialized = JSON.stringify({ version: 1, ownerId, intents }); if (serialized.length > MAX_PENDING_BYTES) throw failure();
      await storage.setItem(pendingKey, serialized);
      owner();
    });
  }
  async function cache(doc) {
    if (!storage) return;
    const cacheKey = key("cache");
    await storageTask(cacheKey, async () => {
      owner();
      // A missing cloud field is an authoritative empty snapshot, not an
      // upload intent. Persist that value instead of deleting all native slots.
      await storage.setItem(cacheKey, JSON.stringify({ version: 1, ownerId, doc }));
      owner();
    });
  }
  async function scope(action) {
    const id = owner(), controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    const owned = async () => {
      if (controller.signal.aborted || owner() !== id) throw failure();
      const { data, error } = await client.auth.getSession();
      if (error || data.session?.user.id?.toLowerCase() !== id) { retired = true; for (const request of requests) request.abort(); throw failure(); }
      if (controller.signal.aborted || owner() !== id) throw failure();
    };
    try { await owned(); const result = await action(owned, controller.signal); await owned(); return result; }
    finally { clearTimeout(timeout); controller.abort(); requests.delete(controller); }
  }
  async function read(owned, signal) {
    await owned();
    ++readSequence;
    const { data, error } = await client.from("profiles").select("id,theme_settings").eq("id", ownerId).abortSignal(signal).retry(false).maybeSingle();
    await owned();
    if (error || !data || typeof data.id !== "string" || data.id.toLowerCase() !== ownerId || data.theme_settings !== null && !object(data.theme_settings)) throw failure();
    const theme = data.theme_settings ?? {}, present = Object.hasOwn(theme, SERVER_CATEGORY_FIELD) && theme[SERVER_CATEGORY_FIELD] !== null;
    const doc = present ? normalizeServerCategoryPreferences(theme[SERVER_CATEGORY_FIELD]) : empty;
    if (!doc) throw failure(); return { theme, column: data.theme_settings, doc, present };
  }
  async function accept(value, owned) {
    await owned(); remote = value.doc; publish(); onTheme(value.theme, ownerId);
    await cache(value.doc); await owned();
  }
  const satisfied = (doc, batch) => [...batch.values()].every(intent => (doc.collapsed[intent.serverId]?.includes(intent.categoryId) ?? false) === intent.collapsed);
  async function acknowledge(batch, value, owned) {
    await accept(value, owned);
    const removed = [];
    for (const [id, intent] of batch) if (pending.get(id)?.sequence === intent.sequence) { removed.push([id, intent]); pending.delete(id); }
    try { await persistPending(); await owned(); }
    catch (cause) { for (const [id, intent] of removed) if (!pending.has(id)) pending.set(id, intent); publish(); throw cause; }
    publish(); clearError();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { timer = undefined; void flush().catch(() => {}); }, Math.max(0, Math.min(60000, Number(delay) || 0))); }
  function start(forceRead) {
    clearTimeout(timer); timer = undefined;
    if (work) return work;
    workReadSequence = readSequence;
    workMustRead = forceRead || pending.size > 0;
    let started = sequence, successful = false;
    work = (async () => {
      owner(); await hydrate();
      if (!forceRead && !pending.size) return visible;
      return scope(async (owned, signal) => {
        if (pending.size) await persistPending(); await owned();
        let before = await read(owned, signal);
        if (!pending.size) { await accept(before, owned); clearError(); successful = true; return visible; }
        // One batch per work item. New gestures retain their own sequence and
        // recovery record; a confirmation cannot clear a newer same-key intent.
        const batch = new Map(pending); started = sequence;
        await persistPending(); await owned();
        for (let attempt = 0; attempt < 3; ++attempt) {
          if (satisfied(before.doc, batch)) { await acknowledge(batch, before, owned); successful = true; return visible; }
          const desired = overlay(before.doc, batch), previous = JSON.stringify(before.column);
          if (before.column !== null && new URLSearchParams({ theme_settings: `eq.${previous}` }).toString().length > SERVER_CATEGORY_CAS_URL_LIMIT) throw large();
          await owned(); let result;
          try {
            let query = client.from("profiles").update({ theme_settings: { ...before.theme, [SERVER_CATEGORY_FIELD]: desired } }).eq("id", ownerId);
            query = before.column === null ? query.is("theme_settings", null) : query.eq("theme_settings", previous);
            result = await query.select("id,theme_settings").abortSignal(signal).retry(false).maybeSingle();
            await owned();
          } catch (cause) {
            await owned(); if (!uncertain(cause)) throw failure();
            const confirmed = await read(owned, signal); if (!satisfied(confirmed.doc, batch)) throw failure();
            await acknowledge(batch, confirmed, owned); successful = true; return visible;
          }
          if (result.error) {
            if (!uncertain(result.error, result.status)) throw failure();
            const confirmed = await read(owned, signal); if (!satisfied(confirmed.doc, batch)) throw failure();
            await acknowledge(batch, confirmed, owned); successful = true; return visible;
          }
          if (!result.data) { before = await read(owned, signal); continue; }
          if (result.data.id?.toLowerCase() !== ownerId || !equal(normalizeServerCategoryPreferences(result.data.theme_settings?.[SERVER_CATEGORY_FIELD]), desired)) throw failure();
          const confirmed = await read(owned, signal); if (!satisfied(confirmed.doc, batch)) throw failure();
          await acknowledge(batch, confirmed, owned); successful = true; return visible;
        }
        throw failure();
      });
    })().catch(cause => { report(cause); throw cause?.message === large().message ? large() : failure(); }).finally(() => {
      work = undefined;
      if (successful && current() && pending.size && sequence > started) schedule();
    });
    return work;
  }
  function flush() { return start(false); }
  function refresh() {
    if (refreshWork) return refreshWork;
    // Calls made before the first request share its future fresh read. Once a
    // request has left, a later invalidation needs a read after it completes.
    if (!work || workMustRead && workReadSequence === readSequence) return start(true);
    const previous = work;
    const queued = previous.catch(() => {}).then(() => {
      if (refreshWork === queued) refreshWork = undefined;
      owner(); return start(true);
    });
    refreshWork = queued;
    return queued;
  }
  function set(serverId, categoryId, collapsed) {
    owner();
    if (typeof serverId !== "string" || !UUID.test(serverId) || typeof categoryId !== "string" || !UUID.test(categoryId) || typeof collapsed !== "boolean") throw failure();
    serverId = serverId.toLowerCase(); categoryId = categoryId.toLowerCase();
    const id = `${serverId}:${categoryId}`, proposed = new Map(pending), intent = { serverId, categoryId, collapsed, sequence: sequence + 1 };
    proposed.set(id, intent); if (proposed.size > 5000) throw failure(); overlay(remote, proposed);
    ++sequence; pending.set(id, intent); publish(true);
    void persistPending().catch(report); schedule();
  }
  return { refresh, flush, set, snapshot: () => disposed || retired ? empty : visible, error: () => message,
    dispose() { disposed = true; clearTimeout(timer); for (const controller of requests) controller.abort(); requests.clear(); },
  };
}
