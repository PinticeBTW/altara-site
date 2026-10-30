import { MAX_SNAPSHOT_BYTES } from './widgetSnapshot.js';

export const WIDGET_PUBLICATION_DRAFT_TTL = 24 * 60 * 60 * 1000;
export const MAX_PUBLICATION_DRAFT_BYTES = MAX_SNAPSHOT_BYTES + 8192;
const DATABASE = 'altara-widget-publication-drafts-v1', STORE = 'drafts';
const encoder = new TextEncoder();

// Only preparation fields enter this store. In particular, neither execution
// consent, payment readiness, manifests' permissions nor auth/session data do.
function fields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid publication draft.');
  if (input.priceKind != null && !['free', 'paid'].includes(input.priceKind)) throw Error('Invalid publication draft.');
  const text = (key, maximum) => {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > maximum) throw Error('Invalid publication draft.');
    return value;
  };
  const result = {
    manifestUrl: text('manifestUrl', 2048), title: text('title', 60), description: text('description', 240),
    priceKind: input.priceKind === 'paid' ? 'paid' : 'free', priceEUR: text('priceEUR', 12),
    sellerCountry: text('sellerCountry', 2), releaseHtml: text('releaseHtml', MAX_SNAPSHOT_BYTES),
    releaseName: text('releaseName', 128),
  };
  // A partially typed link may be retained, but never URL credentials or a
  // fragment (which the manifest loader also rejects).
  if (/^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i.test(result.manifestUrl)) throw Error('Invalid publication draft URL.');
  let url; try { url = result.manifestUrl ? new URL(result.manifestUrl) : null; } catch { /* Incomplete input is not loaded until the user restores it. */ }
  if (url && (url.username || url.password || url.hash || !['https:', 'http:'].includes(url.protocol))) throw Error('Invalid publication draft URL.');
  if (result.sellerCountry && !/^[A-Z]{2}$/.test(result.sellerCountry)) throw Error('Invalid publication draft.');
  const { releaseHtml, ...metadata } = result, htmlBytes = encoder.encode(releaseHtml).length;
  if (htmlBytes > MAX_SNAPSHOT_BYTES
    || htmlBytes + encoder.encode(JSON.stringify(metadata)).length > MAX_PUBLICATION_DRAFT_BYTES) throw Error('Publication draft is too large.');
  return result;
}

export function createWidgetPublicationDraft({ userId, origin, context, environment, indexedDB = globalThis.indexedDB, now = Date.now } = {}) {
  const scope = [userId, origin, context, environment];
  if (scope.some(value => typeof value !== 'string' || !value || value.length > 2048)
    || !['production', 'development', 'test'].includes(environment)) throw Error('Invalid publication draft scope.');
  const key = JSON.stringify(scope);
  let database, queue = Promise.resolve(), disposed = false;
  function open() {
    database ||= new Promise(resolve => {
      if (!indexedDB?.open) return resolve(null);
      let request, finished = false;
      const finish = value => { if (!finished) { finished = true; clearTimeout(timer); resolve(value); } else value?.close(); };
      const timer = setTimeout(() => finish(null), 3000);
      try {
        request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
        request.onsuccess = () => {
          const db = request.result; db.onversionchange = () => db.close(); finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch { finish(null); }
    });
    return database;
  }
  async function transaction(mode, action) {
    const db = await open(); if (!db) throw Error('Draft storage is unavailable.');
    return new Promise((resolve, reject) => {
      let value, finished = false, tx;
      const finish = (error) => {
        if (finished) return; finished = true; clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => { try { tx?.abort(); } catch {} finish(Error('Draft storage timed out.')); }, 3000);
      try {
        tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => finish();
        tx.onerror = tx.onabort = () => finish(Error('Draft storage is unavailable.'));
      } catch (error) { finish(error); }
    });
  }
  function enqueue(action) {
    if (disposed) return Promise.resolve(false);
    // Serialise writes and discard so an older debounced save cannot resurrect
    // a discarded or published draft. The captured key never follows account changes.
    const result = queue.then(action); queue = result.catch(() => {}); return result;
  }
  return {
    async read() {
      if (disposed) return { state: 'unavailable' };
      return enqueue(async () => {
        try {
          const record = await transaction('readonly', store => store.get(key));
          if (!record) return { state: 'empty' };
          const time = now();
          if (!Number.isSafeInteger(record.updatedAt) || !Number.isSafeInteger(record.expiresAt)
            || record.updatedAt > time + 60000 || record.expiresAt !== record.updatedAt + WIDGET_PUBLICATION_DRAFT_TTL
            || record.version !== 1 || record.key !== key) {
            await transaction('readwrite', store => store.delete(key)); return { state: 'invalid' };
          }
          if (record.expiresAt <= time) {
            await transaction('readwrite', store => store.delete(key)); return { state: 'expired' };
          }
          try { return { state: 'saved', draft: fields(record.fields), expiresAt: record.expiresAt }; }
          catch { await transaction('readwrite', store => store.delete(key)); return { state: 'invalid' }; }
        } catch { return { state: 'unavailable' }; }
      });
    },
    write(input) {
      let value; try { value = fields(input); } catch { return Promise.resolve(false); }
      return enqueue(async () => {
        try {
          const time = now();
          await transaction('readwrite', store => store.put({ key, version: 1, updatedAt: time, expiresAt: time + WIDGET_PUBLICATION_DRAFT_TTL, fields: value }, key));
          return true;
        } catch { return false; }
      });
    },
    remove() {
      return enqueue(async () => { try { await transaction('readwrite', store => store.delete(key)); return true; } catch { return false; } });
    },
    dispose() { disposed = true; void queue.finally(async () => { (await database)?.close(); }); },
  };
}
