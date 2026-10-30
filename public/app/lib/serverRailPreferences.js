export const SERVER_RAIL_FIELD = "server_rail";
export const SERVER_RAIL_CAS_URL_LIMIT = 6000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLDER_ID = /^[A-Za-z0-9_-]{1,96}$/;
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
const failure = () => new Error("Não foi possível sincronizar a ordem dos servidores. Tenta novamente quando tiveres ligação.");
const uncertain = (error, status) => error?.code ? error.code === "connection_unavailable"
  : status === 408 || status === 429 || status >= 500 || error?.name === "AbortError"
    || /failed to fetch|fetch failed|network request failed|networkerror|load failed|timed out/i.test(error?.message || "");

/** Account preferences are presentation only. Membership must come from the
 * authorized server list, never from an ID found in this layout. */
export function normalizeServerRailPreferences(raw) {
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.order) || raw.order.length > 500
    || !Array.isArray(raw.folders) || raw.folders.length > 200
    || raw.revision !== undefined && (typeof raw.revision !== "string" || !UUID.test(raw.revision))) return null;
  const folders = [], folderIds = new Set(), grouped = new Set();
  for (const value of raw.folders) {
    if (!object(value) || typeof value.id !== "string" || !FOLDER_ID.test(value.id) || folderIds.has(value.id)
      || typeof value.name !== "string" || value.name.length > 51 || !Array.isArray(value.serverIds) || value.serverIds.length > 500) return null;
    folderIds.add(value.id); const serverIds = [];
    for (const entry of value.serverIds) {
      if (typeof entry !== "string" || !UUID.test(entry)) return null;
      const id = entry.toLowerCase(); if (grouped.has(id) || grouped.size >= 500) return null;
      grouped.add(id); serverIds.push(id);
    }
    folders.push({ id: value.id, name: value.name, serverIds });
  }
  const order = [], tokens = new Set();
  for (const entry of raw.order) {
    if (typeof entry !== "string") return null;
    const separator = entry.indexOf(":"), kind = entry.slice(0, separator), rawId = entry.slice(separator + 1);
    if (kind !== "server" && kind !== "folder") return null;
    const id = kind === "server" ? rawId.toLowerCase() : rawId;
    if (kind === "server" ? !UUID.test(id) || grouped.has(id) : !FOLDER_ID.test(id) || !folderIds.has(id)) return null;
    const token = `${kind}:${id}`; if (tokens.has(token)) return null;
    tokens.add(token); order.push(token);
  }
  if (folders.some(folder => !tokens.has(`folder:${folder.id}`))) return null;
  return { version: 1, ...(raw.revision !== undefined ? { revision: raw.revision.toLowerCase() } : {}), order, folders };
}

export function sameServerRailPreferences(left, right) {
  const semantic = value => {
    const layout = normalizeServerRailPreferences(value);
    if (!layout) return null;
    return { version: layout.version, order: layout.order, folders: layout.folders };
  };
  return JSON.stringify(semantic(left)) === JSON.stringify(semantic(right));
}

/** A small owner-scoped bridge for the existing local Desktop rail. Only manual
 * edits and an explicitly captured legacy layout can write; ordinary RPC/list
 * rendering must not turn a default list into a competing account preference. */
export function createServerRailPreferenceSync({ client, getOwner, applyRemote, onTheme = () => {}, onError = () => {}, pendingStorage, delay = 150 }) {
  let disposed = false, version = 0, timer, readWork, saveWork, pending, lastApplied, reported = -1, refreshWork;
  const requests = new Set(), restored = new Map();
  const owner = () => {
    const id = getOwner(); if (disposed || typeof id !== "string" || !UUID.test(id)) throw failure(); return id.toLowerCase();
  };
  function restorePending(ownerId) {
    if (!pendingStorage) return true;
    if (restored.has(ownerId)) return restored.get(ownerId);
    restored.set(ownerId, true);
    try {
      const record = pendingStorage.read(ownerId);
      if (record === null || record === undefined) return true;
      const layout = normalizeServerRailPreferences(record.layout);
      if (!object(record) || record.version !== 1 || record.ownerId !== ownerId || typeof record.id !== "string" || !UUID.test(record.id) || !layout) throw failure();
      pending = { ownerId, id: record.id, layout, ticket: ++version, persisted: true };
      return true;
    } catch { restored.set(ownerId, false); onError(failure()); return false; }
  }
  async function scope(ownerId, work) {
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    const owned = async () => {
      if (controller.signal.aborted || owner() !== ownerId) throw failure();
      const { data, error } = await client.auth.getSession();
      if (error || controller.signal.aborted || owner() !== ownerId || data.session?.user.id?.toLowerCase() !== ownerId) throw failure();
    };
    try { await owned(); const value = await work(owned, controller.signal); await owned(); return value; }
    finally { clearTimeout(timeout); controller.abort(); requests.delete(controller); }
  }
  async function read(ownerId, owned, signal) {
    await owned();
    const { data, error } = await client.from("profiles").select("id,theme_settings").eq("id", ownerId).abortSignal(signal).maybeSingle();
    await owned();
    if (error || !data || typeof data.id !== "string" || data.id.toLowerCase() !== ownerId
      || data.theme_settings !== null && !object(data.theme_settings)) throw failure();
    const theme = data.theme_settings === null ? {} : data.theme_settings;
    const present = Object.prototype.hasOwnProperty.call(theme, SERVER_RAIL_FIELD) && theme[SERVER_RAIL_FIELD] !== null;
    const layout = present ? normalizeServerRailPreferences(theme[SERVER_RAIL_FIELD]) : null;
    if (present && !layout) throw failure();
    return { theme, layout, column: data.theme_settings };
  }
  function publish(ownerId, result, ticket) {
    if (owner() !== ownerId || ticket !== version) return;
    onTheme(result.theme, ownerId);
    if (result.layout && !sameServerRailPreferences(lastApplied, result.layout)) {
      lastApplied = result.layout; applyRemote(result.layout, ownerId);
    }
  }
  async function write(ownerId, desired, ticket, seed = false) {
    desired = { ...desired, revision: crypto.randomUUID() };
    return scope(ownerId, async (owned, signal) => {
      // Only a failed conditional match is retried. Lost acknowledgements are
      // inspected once and never cause a second PATCH.
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = await read(ownerId, owned, signal);
        if (seed && before.layout || sameServerRailPreferences(before.layout, desired)) { publish(ownerId, before, ticket); return before.layout; }
        const previous = JSON.stringify(before.column);
        if (before.column !== null && new URLSearchParams({ theme_settings: `eq.${previous}` }).toString().length > SERVER_RAIL_CAS_URL_LIMIT)
          throw new Error("Não foi possível sincronizar a ordem em segurança porque as definições desta conta são demasiado grandes. A ordem foi conservada neste dispositivo.");
        const next = { ...before.theme, [SERVER_RAIL_FIELD]: desired };
        await owned();
        let result;
        try {
          let query = client.from("profiles").update({ theme_settings: next }).eq("id", ownerId);
          query = before.column === null ? query.is("theme_settings", null) : query.eq("theme_settings", previous);
          result = await query.select("id,theme_settings").abortSignal(signal).maybeSingle();
          await owned();
        } catch (cause) {
          await owned();
          if (!uncertain(cause)) throw failure();
          const confirmed = await read(ownerId, owned, signal);
          if (!sameServerRailPreferences(confirmed.layout, desired)) throw failure();
          publish(ownerId, confirmed, ticket); return confirmed.layout;
        }
        if (result.error) {
          await owned();
          if (!uncertain(result.error, result.status)) throw failure();
          const confirmed = await read(ownerId, owned, signal);
          if (!sameServerRailPreferences(confirmed.layout, desired)) throw failure();
          publish(ownerId, confirmed, ticket); return confirmed.layout;
        }
        if (!result.data) continue;
        if (result.data.id?.toLowerCase() !== ownerId || !sameServerRailPreferences(result.data.theme_settings?.[SERVER_RAIL_FIELD], desired)) throw failure();
        const confirmed = await read(ownerId, owned, signal);
        if (!sameServerRailPreferences(confirmed.layout, desired)) throw failure();
        publish(ownerId, confirmed, ticket); return confirmed.layout;
      }
      throw failure();
    });
  }
  function flush() {
    clearTimeout(timer); timer = undefined;
    if (saveWork) return saveWork;
    saveWork = (async () => {
      while (pending) {
        const intent = pending; pending = undefined;
        try {
          if (!intent.persisted) {
            // A failed atomic replacement can leave an older intent on disk.
            // Do not confirm a newer cloud layout until its own recovery marker
            // is durable, or a reload could replay that older saved intent.
            if (owner() !== intent.ownerId) throw failure();
            pendingStorage.write(intent.ownerId, { version: 1, ownerId: intent.ownerId, id: intent.id, layout: intent.layout });
            intent.persisted = true;
          }
          await write(intent.ownerId, intent.layout, intent.ticket);
          if (version === intent.ticket && !pending) pendingStorage?.clear(intent.ownerId, intent.id);
        }
        catch (cause) {
          const currentOwner = getOwner();
          if (!disposed && typeof currentOwner === "string" && currentOwner.toLowerCase() === intent.ownerId) {
            // Keep the user's unconfirmed local intent. A later refresh starts
            // from a new owned read/CAS; it never blindly repeats this PATCH.
            pending ??= intent;
            if (reported !== intent.ticket) { reported = intent.ticket; onError(cause); }
          }
          break;
        }
      }
    })().finally(() => { saveWork = undefined; });
    return saveWork;
  }
  function localChanged(input) {
    const ownerId = owner(), layout = normalizeServerRailPreferences(input);
    if (!layout) { onError(failure()); return; }
    restorePending(ownerId);
    restored.set(ownerId, true);
    const record = { version: 1, ownerId, id: crypto.randomUUID(), layout };
    pending = { ownerId, id: record.id, layout, ticket: ++version, persisted: !pendingStorage };
    try { pendingStorage?.write(ownerId, record); pending.persisted = true; } catch { if (reported !== version) { reported = version; onError(failure()); } }
    clearTimeout(timer); timer = setTimeout(() => { void flush(); }, delay);
  }
  function refreshAfter(previous, ownerId, legacySeed) {
    if (refreshWork) return refreshWork;
    const queued = previous.catch(() => {}).then(() => {
      if (refreshWork === queued) refreshWork = undefined;
      if (owner() !== ownerId) throw failure();
      return refresh({ legacySeed });
    });
    refreshWork = queued;
    return queued;
  }
  /** @param {{ legacySeed?: unknown, invalidate?: boolean }} [options] */
  async function refresh({ legacySeed, invalidate = false } = {}) {
    const ownerId = owner(); if (!restorePending(ownerId)) throw failure();
    if (refreshWork) return refreshWork;
    if (pending || saveWork) {
      const saving = saveWork ?? flush();
      return invalidate ? refreshAfter(saving, ownerId, legacySeed) : saving;
    }
    if (readWork) return invalidate ? refreshAfter(readWork, ownerId, legacySeed) : readWork;
    const ticket = version, seed = normalizeServerRailPreferences(legacySeed);
    readWork = scope(ownerId, async (owned, signal) => {
      const value = await read(ownerId, owned, signal);
      if (ticket !== version) return;
      if (!value.layout && seed?.order.length) return write(ownerId, seed, ticket, true);
      publish(ownerId, value, ticket); return value.layout;
    }).catch(cause => {
      if (seed?.order.length && ticket === version && !disposed && reported !== ticket) { reported = ticket; onError(cause); }
      throw cause;
    }).finally(() => { readWork = undefined; });
    return readWork;
  }
  return { refresh, localChanged, flush,
    dispose() { disposed = true; ++version; pending = undefined; clearTimeout(timer); for (const request of requests) request.abort(); },
  };
}
