import { normalizeGifPickerMetadata, mergeGifPickerMetadata } from './gifPresentation.js';

// Public provider descriptors only, never private delivery URLs or message data.
// A missing rendition is recovered once per ID, independently of upload grants.
export function createDmGifMetadata({ lookup, limit = 120, now = Date.now } = {}) {
  const memory = new Map(), pending = new Map();
  const ttl = 7 * 86400000;
  let database;
  const open = () => database ||= new Promise(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const request = indexedDB.open('altara-gif-metadata-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('metadata', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  const read = async id => {
    const db = await open(); if (!db) return null;
    return new Promise(resolve => {
      const request = db.transaction('metadata').objectStore('metadata').get(id);
      request.onsuccess = () => resolve(request.result?.expires > now() ? request.result : null);
      request.onerror = () => resolve(null);
    });
  };
  const remember = (item, attempted = false) => {
    const previous = memory.get(item?.id);
    attempted ||= previous?.expires > now() && previous.attempted === true;
    const normalized = normalizeGifPickerMetadata(mergeGifPickerMetadata(item, previous?.expires > now() ? previous.item : null)); if (!normalized) return null;
    if (previous?.expires > now() && previous.attempted === attempted
      && JSON.stringify(previous.item) === JSON.stringify(normalized)) return previous;
    const entry = { id: normalized.id, item: normalized, attempted,
      expires: now() + (attempted && !usablePreview(normalized) ? 900000 : ttl) };
    memory.delete(entry.id); memory.set(entry.id, entry);
    while (memory.size > limit) memory.delete(memory.keys().next().value);
    return entry;
  };
  const write = async entry => {
    try {
      const db = await open(); if (!db) return;
      const store = db.transaction('metadata', 'readwrite').objectStore('metadata');
      store.put(entry);
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = all.result.sort((a, b) => b.expires - a.expires);
        rows.forEach((row, index) => { if (index >= limit || row.expires <= now()) store.delete(row.id); });
      };
    } catch { /* Cache failure cannot hide a message. */ }
  };
  const usablePreview = item => !!item?.preview && (item.preview !== item.url || item.previewKind === 'static');
  const merge = mergeGifPickerMetadata;
  const complete = item => usablePreview(item) && item.dimensionsKind === 'original' && item.width > 0 && item.height > 0;
  return {
    peek(item) {
      const saved = memory.get(item?.id);
      if (!saved || saved.expires <= now()) return item;
      memory.delete(saved.id); memory.set(saved.id, saved);
      return merge(item, saved.item);
    },
    remember(item) {
      const before = memory.get(item?.id), entry = remember(item);
      if (entry && entry !== before) void write(entry);
      return entry?.item;
    },
    async resolve(raw, { retry = false } = {}) {
      const item = normalizeGifPickerMetadata(raw); if (!item) return null;
      if (complete(item)) return this.remember(item);
      if (pending.has(item.id)) return pending.get(item.id);
      const run = (async () => {
        const saved = memory.get(item.id);
        const cached = retry ? null : saved?.expires > now() ? saved : await read(item.id).catch(() => null);
        let result = merge(item, cached?.item);
        if (!complete(result) && !cached?.attempted && /^klipy:\d+$/.test(item.id)) {
          try {
            const fresh = normalizeGifPickerMetadata({ ...await lookup?.(item), source: 'gif-picker' });
            if (fresh?.id === item.id) result = merge(result, fresh);
          } catch { /* Keep the stored provider URL and never discard the message. */ }
        }
        const entry = remember(result, true); if (entry) void write(entry);
        return result;
      })().finally(() => pending.delete(item.id));
      pending.set(item.id, run); return run;
    },
  };
}
