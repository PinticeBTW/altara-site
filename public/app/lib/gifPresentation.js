import { normalizeTrustedMessageGifUrl } from "./messageMediaPolicy.js";

export function isKlipyMediaUrl(value) {
  try { return new URL(value).hostname === "static.klipy.com"; } catch { return false; }
}

// Stored alongside the private upload, never instead of its authorization descriptor.
export function normalizeGifPickerMetadata(value) {
  if (value?.source !== "gif-picker") return null;
  const url = normalizeTrustedMessageGifUrl(value.url);
  const idOnly = !value.url && /^klipy:\d{1,128}$/.test(String(value.id || ''));
  if (!url && !idOnly) return null;
  const host = url ? new URL(url).hostname : '';
  const provider = idOnly || isKlipyMediaUrl(url) ? "klipy" : host.includes("giphy.com") ? "giphy" : "tenor";
  return {
    source: "gif-picker", provider,
    id: String(value.id || url).trim().slice(0, 512) || url,
    url,
    preview: normalizeTrustedMessageGifUrl(value.preview) || url,
    animatedPreview: normalizeTrustedMessageGifUrl(value.animatedPreview)
      || (value.previewKind !== "static" ? normalizeTrustedMessageGifUrl(value.preview) : ""),
    title: String(value.title || "").trim().slice(0, 180),
    width: Math.max(0, Math.min(4096, Number(value.width) || 0)),
    height: Math.max(0, Math.min(4096, Number(value.height) || 0)),
    dimensionsKind: value.dimensionsKind === 'original' ? 'original' : '',
    previewKind: value.previewKind === "static" ? "static" : "animated",
  };
}

// Renditions and original dimensions have independent provenance. A legacy
// favorite with a good poster must not overwrite dimensions recovered elsewhere.
export function mergeGifPickerMetadata(item, cached) {
  if (!cached || !item || cached.id !== item.id) return item;
  const completeSize = value => value?.dimensionsKind === 'original' && value.width > 0 && value.height > 0;
  const size = completeSize(item) ? item : completeSize(cached) ? cached
    : item.width > 0 && item.height > 0 ? item : cached;
  const preview = item.previewKind === 'static' && item.preview && item.preview !== item.url ? item
    : cached.preview && cached.preview !== cached.url ? cached : item;
  return { ...item, ...cached, source: item.source || cached.source,
    url: item.url || cached.url, preview: preview.preview,
    previewKind: preview.previewKind, animatedPreview: item.animatedPreview || cached.animatedPreview,
    width: size.width || 0, height: size.height || 0, dimensionsKind: size.dimensionsKind || '' };
}

// Exact fingerprint of KLIPY's HTTP-200 unavailable card, not a colour heuristic:
// legitimate purple GIFs must remain visible. Sample nearest-neighbour at 64 x 36.
const UNAVAILABLE_PIXELS = "5e1c78d8625d55be58f115845d76308370ca38b7b91d547d1f8a21a38b8b18a1";
export async function isUnavailableGifImage(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width !== 640 || height !== 360) return false;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, 64, 36);
  const hash = await crypto.subtle.digest("SHA-256", context.getImageData(0, 0, 64, 36).data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("") === UNAVAILABLE_PIXELS;
}

export function isUnavailableGifItem(item) {
  return !item || item.available === false || item.unavailable === true
    || /^(unavailable|deleted|removed|blocked)$/i.test(String(item.status || ""));
}

// Small, expiring cache: reopening the picker does not download every preview again.
const previews = new Map();
export async function prepareGifPreview(item, { signal } = {}) {
  if (isUnavailableGifItem(item)) return null;
  const url = normalizeTrustedMessageGifUrl(item.preview || item.url);
  if (!url) return null;
  // Old URL-only KLIPY favorites need metadata hydration, not an original download.
  if (isKlipyMediaUrl(url) && url === item.url && item.previewKind !== "static") return null;
  signal?.throwIfAborted();
  let cached = previews.get(url);
  if (!cached || cached.expires < Date.now() || cached.signal?.aborted) {
    const run = (async () => {
      const saved = await readGifPoster(url);
      signal?.throwIfAborted();
      if (saved) return saved;
      const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
      if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) return null;
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 12 * 1024 * 1024) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bitmap = await createImageBitmap(new Blob(chunks, { type: response.headers.get("content-type") }));
      try {
        if (!bitmap.width || !bitmap.height || await isUnavailableGifImage(bitmap)) return null;
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL("image/png");
        void storeGifPoster(url, poster);
        return poster;
      } finally { bitmap.close(); }
    })().catch(() => null);
    cached = { run, signal, expires: Date.now() + 600000 };
    previews.delete(url);
    previews.set(url, cached);
    while (previews.size > 120) previews.delete(previews.keys().next().value);
  }
  const poster = await cached.run;
  if (!poster && previews.get(url) === cached) previews.delete(url);
  return poster ? { ...item, poster } : null;
}

export async function prepareGifResults(items, { isCurrent = () => true } = {}) {
  const input = Array.isArray(items) ? items : [];
  const results = new Array(input.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, input.length) }, async () => {
    while (next < input.length && isCurrent()) {
      const index = next++;
      results[index] = await prepareGifPreview(input[index]);
    }
  }));
  return isCurrent() ? results.filter(Boolean) : [];
}

// Decoded static posters survive app restarts without synchronous localStorage
// images. Public CDN URLs only; bounded to 120 x <= 160 KB, expired after 7 days.
let posterDb;
function openPosterDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return posterDb ||= new Promise(resolve => {
    const request = indexedDB.open("altara-gif-posters-v1", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("posters", { keyPath: "url" });
      store.createIndex("created", "created");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}
async function readGifPoster(url) {
  try {
    const db = await openPosterDb(); if (!db) return null;
    return await new Promise(resolve => {
      const request = db.transaction("posters").objectStore("posters").get(url);
      request.onsuccess = () => resolve(request.result?.created > Date.now() - 604800000 ? request.result.poster : null);
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}
async function storeGifPoster(url, poster) {
  if (poster.length > 160000) return;
  try {
    const db = await openPosterDb(); if (!db) return;
    const store = db.transaction("posters", "readwrite").objectStore("posters");
    store.put({ url, poster, created: Date.now() });
    const count = store.count();
    count.onsuccess = () => {
      let excess = count.result - 120;
      const cursor = store.index("created").openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row || (excess <= 0 && row.value.created > Date.now() - 604800000)) return;
        row.delete(); excess--; row.continue();
      };
    };
  } catch { /* Cache unavailability never blocks the picker. */ }
}
