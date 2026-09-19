// Public provider previews only. Private upload grants remain in the attachment
// path; neither this cache nor a provider ID confers access to a private upload.
export class DmMediaCache {
  constructor({ maxEntries = 48, maxBytes = 24 * 1024 * 1024, ttl = 300000, now = Date.now, revoke = url => URL.revokeObjectURL(url) } = {}) {
    Object.assign(this, { maxEntries, maxBytes, ttl, now, revoke });
    this.items = new Map(); this.bytes = 0;
  }
  get(key) {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.expires <= this.now()) { this.delete(key); return null; }
    this.items.delete(key); this.items.set(key, item);
    return item;
  }
  set(key, value) {
    const previous = this.get(key);
    if (previous?.blobUrl && value.blobUrl && previous.blobUrl !== value.blobUrl) this.revoke(previous.blobUrl);
    this.bytes -= previous?.bytes || 0;
    const item = { ...previous, ...value, expires: this.now() + this.ttl };
    this.items.delete(key); this.items.set(key, item); this.bytes += item.bytes || 0;
    while (this.items.size > this.maxEntries || this.bytes > this.maxBytes) this.delete(this.items.keys().next().value);
    return item;
  }
  delete(key) {
    const item = this.items.get(key); if (!item) return;
    this.bytes -= item.bytes || 0; if (item.blobUrl) this.revoke(item.blobUrl); this.items.delete(key);
  }
}

const mediaCache = new DmMediaCache();
const dimensions = new Map();
export function canonicalMediaContent(content) {
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
  try { return JSON.stringify(sort(JSON.parse(content))); } catch { return String(content || ''); }
}

// Compare generated markup, not the live DOM modified by image/profile loaders.
// Reuse message/date nodes; an unrelated snapshot must not restart media decoding.
const renderedMarkup = new WeakMap();
export function retainAuthorizedDmMedia(existing, fresh) {
  fresh.querySelectorAll('[data-dm-progressive]').forEach(next => {
    const current = [...existing.querySelectorAll('[data-dm-progressive]')]
      .find(frame => frame.dataset.dmMediaKey === next.dataset.dmMediaKey
        || (frame.dataset.dmProviderId && frame.dataset.dmProviderId === next.dataset.dmProviderId));
    if (!current) return;
    current.dataset.dmDelivery = next.dataset.dmDelivery;
    current.dataset.dmMediaKey = next.dataset.dmMediaKey;
    // Keep the decoded preview, but adopt the confirmed original's dimensions.
    // An optimistic picker thumbnail must not fix the sent GIF at thumbnail size.
    for (const property of ['--chat-media-width', '--chat-media-ratio']) {
      current.style.setProperty(property, next.style.getPropertyValue(property));
    }
    current.dataset.dmWidth = next.dataset.dmWidth;
    current.dataset.dmHeight = next.dataset.dmHeight;
    next.replaceWith(current);
  });
}
export function reconcileDmTimeline(box, html) {
  const template = box.ownerDocument.createElement('template'); template.innerHTML = html;
  const old = new Map([...box.children].map(node => [node.dataset.msgId || `other:${node.outerHTML}`, node]));
  let cursor = box.firstElementChild, changed = false;
  const keep = new Set();
  for (const fresh of [...template.content.children]) {
    const markup = fresh.outerHTML, key = fresh.dataset.msgId || `other:${markup}`;
    const existing = old.get(key);
    let node = fresh;
    if (existing && renderedMarkup.get(existing) === markup) node = existing;
    else if (existing) {
      // Retain public provider presentation while its message remains renderable.
      // Rotating/expired private upload grants must not blank that public preview.
      retainAuthorizedDmMedia(existing, fresh);
    }
    renderedMarkup.set(node, markup); keep.add(node);
    if (node !== cursor) { box.insertBefore(node, cursor); changed = true; }
    cursor = node.nextElementSibling;
  }
  for (const node of [...box.children]) if (!keep.has(node)) { node.remove(); changed = true; }
  return changed;
}
export function dmMediaKey(att = {}) {
  return String(att.uploadId || att.referenceUrl || att.gifProvider?.id || att.url || '');
}
export function dmMediaDimensions(att = {}) {
  const stored = dimensions.get(dmMediaKey(att));
  const w = Number(att.width || att.gifProvider?.width || stored?.width);
  const h = Number(att.height || att.gifProvider?.height || stored?.height);
  return w > 0 && h > 0 ? { width: Math.min(8192, w), height: Math.min(8192, h) } : { width: 320, height: 200 };
}
export function rememberDmMediaDimensions(key, width, height) {
  if (!(width > 0 && height > 0)) return;
  dimensions.delete(key); dimensions.set(key, { width, height });
  while (dimensions.size > 240) dimensions.delete(dimensions.keys().next().value);
}

export function createDmMediaPresenter({ preparePreview, resolveMetadata = async item => item,
  canAnimate = () => true, account = () => '', onReady = () => {}, onMetadata = () => {} } = {}) {
  let root, observer, cleanupObserver;
  const mounted = new Map(), queue = [];
  let active = 0;
  const alive = entry => entry.frame.isConnected && mounted.get(entry.frame) === entry;
  const cachedKey = entry => `${account()}:${entry.frame.dataset.dmProviderId || entry.frame.dataset.dmMediaKey}`;
  const show = async (entry, url, state) => {
    if (!alive(entry) || !url) return;
    const image = new Image(); image.decoding = 'async';
    image.src = url;
    try { await image.decode(); } catch { return false; }
    if (!alive(entry)) return false;
    entry.img.src = url; entry.img.dataset.mediaPreview = state === 'preview' ? '1' : '0';
    entry.frame.dataset.mediaState = state;
    entry.frame.querySelector('[data-dm-media-retry]')?.setAttribute('hidden', '');
    // 'ready' may be a tiny animated preview, not the original GIF dimensions.
    onReady(entry.frame); return true;
  };
  const load = async entry => {
    const signal = entry.abort.signal, key = cachedKey(entry);
    if (entry.frame.dataset.mediaState === 'ready' && canAnimate(entry.frame)) return;
    let cached = mediaCache.get(key);
    try {
      if (cached?.poster) await show(entry, cached.poster, 'preview');
      else {
        const data = entry.frame.dataset;
        const metadata = await resolveMetadata({ source: 'gif-picker', id: data.dmProviderId,
          url: data.dmProviderUrl, preview: data.dmPreview, animatedPreview: data.dmAnimation,
          previewKind: data.dmPreviewKind, dimensionsKind: data.dmDimensionsKind,
          title: entry.img.alt, width: Number(data.dmWidth), height: Number(data.dmHeight) }, { retry: entry.retry });
        entry.retry = false;
        if (!alive(entry) || signal.aborted) return;
        if (metadata) {
          data.dmPreview = metadata.preview || data.dmPreview;
          data.dmProviderUrl = metadata.url || data.dmProviderUrl;
          data.dmAnimation = metadata.animatedPreview || (metadata.previewKind !== 'static' ? metadata.preview : '');
          data.dmPreviewKind = metadata.previewKind;
          const host = entry.frame.closest('[data-msg-gif-wrap]');
          if (host) {
            host.dataset.gifPreview = data.dmPreview; host.dataset.gifUrl = data.dmProviderUrl;
            host.dataset.gifAnimationPreview = data.dmAnimation;
            host.dataset.gifPreviewKind = data.dmPreviewKind;
            host.dataset.gifWidth = metadata.width || 0; host.dataset.gifHeight = metadata.height || 0;
            host.dataset.gifDimensionsKind = metadata.dimensionsKind || '';
          }
          onMetadata(entry.frame);
        }
        const preview = await preparePreview({ url: data.dmProviderUrl, preview: data.dmPreview, previewKind: data.dmPreviewKind }, { signal });
        if (!alive(entry) || signal.aborted) return;
        if (preview?.poster) { mediaCache.set(key, { poster: preview.poster }); await show(entry, preview.poster, 'preview'); }
        else if (data.dmPreview && data.dmPreview !== data.dmProviderUrl) throw new Error('preview_unavailable');
      }
      if (!alive(entry) || signal.aborted || !entry.visible || !canAnimate(entry.frame)) return;
      cached = mediaCache.get(key);
      if (cached?.blobUrl && await show(entry, cached.blobUrl, 'ready')) return;
      const data = entry.frame.dataset;
      // Prefer the small animated rendition. The original is only a last resort
      // for legacy URL-only GIFs whose provider cannot recover a preview.
      const animationUrl = data.dmAnimation || (data.dmPreviewKind !== 'static' ? data.dmPreview : '');
      if (!animationUrl) { if (!cached?.poster) throw new Error('preview_unavailable'); return; }
      const response = await fetch(animationUrl, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) throw new Error('media_unavailable');
      // Very large originals may play, but do not retain them in the blob cache.
      if (Number(response.headers.get('content-length')) > 8 * 1024 * 1024) {
        await response.body?.cancel();
        if (entry.visible && !await show(entry, animationUrl, 'ready')) throw new Error('media_decode_failed');
        return;
      }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          if (entry.visible && !await show(entry, animationUrl, 'ready')) throw new Error('media_decode_failed');
          return;
        }
        chunks.push(value);
      }
      const blob = new Blob(chunks, { type: response.headers.get('content-type') }); signal.throwIfAborted();
      if (!alive(entry)) return;
      const url = URL.createObjectURL(blob);
      if (blob.size <= 8 * 1024 * 1024) mediaCache.set(key, { blobUrl: url, bytes: blob.size });
      else entry.ownUrl = url;
      if (entry.visible && canAnimate(entry.frame) && !await show(entry, url, 'ready')) throw new Error('media_decode_failed');
    } catch (error) {
      if (!alive(entry) || signal.aborted) return;
      entry.frame.dataset.mediaState = entry.img.getAttribute('src') ? 'preview-error' : 'error';
      const status = entry.frame.querySelector('.dmMediaStatus');
      if (status) status.textContent = entry.frame.dataset.errorLabel || '';
      entry.frame.querySelector('[data-dm-media-retry]')?.removeAttribute('hidden');
    }
  };
  const pump = () => {
    while (active < 3 && queue.length) {
      const entry = queue.shift(); entry.queued = false;
      if (!alive(entry) || !entry.visible || entry.busy) continue;
      entry.busy = true; active++;
      void load(entry).finally(() => { entry.busy = false; active--; pump(); });
    }
  };
  const enqueue = (entry, retry = false) => {
    if (!retry && entry.frame.dataset.mediaState.includes('error')) return;
    if (!entry.queued && !entry.busy) { entry.retry = retry; entry.queued = true; queue.push(entry); pump(); }
  };
  const dispose = entry => { entry.abort.abort(); observer?.unobserve(entry.frame); mounted.delete(entry.frame); if(entry.ownUrl)URL.revokeObjectURL(entry.ownUrl); };
  return {
    seedPoster(provider, poster) {
      // Only the bounded, validated PNG poster generated by the picker, in memory.
      if (provider?.id && typeof poster === 'string' && poster.length <= 220000
        && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(poster)) {
        mediaCache.set(`${account()}:${provider.id}`, { poster });
      }
    },
    peekPoster(provider) {
      return mediaCache.get(`${account()}:${provider?.id}`)?.poster || '';
    },
    bind(container) {
      if (root !== container) {
        for (const entry of mounted.values()) dispose(entry);
        observer?.disconnect(); cleanupObserver?.disconnect(); root = container;
        cleanupObserver = new MutationObserver(() => {
          for (const entry of mounted.values()) if (!entry.frame.isConnected) dispose(entry);
        });
        cleanupObserver.observe(container, { childList: true, subtree: true });
        observer = new IntersectionObserver(entries => {
          for (const observed of entries) {
            const entry = mounted.get(observed.target); if (!entry) continue;
            entry.visible = observed.isIntersecting;
            if (entry.visible) enqueue(entry);
            else {
              const poster = mediaCache.get(cachedKey(entry))?.poster;
              if (poster && entry.img.src !== poster) void show(entry, poster, 'preview');
            }
          }
        }, { root: container, rootMargin: '120px', threshold: 0.01 });
      }
      for (const entry of mounted.values()) if (!entry.frame.isConnected) dispose(entry);
      container.querySelectorAll('[data-dm-progressive]').forEach(frame => {
        if (mounted.has(frame)) return;
        const img = frame.querySelector('img');
        if (!img || (!frame.dataset.dmProviderUrl && !/^klipy:\d+$/.test(frame.dataset.dmProviderId || ''))) return;
        const entry = { frame, img, abort: new AbortController(), visible: false, busy: false };
        mounted.set(frame, entry);
        const poster = mediaCache.get(cachedKey(entry))?.poster;
        if (poster) { img.src = poster; img.dataset.mediaPreview = '1'; frame.dataset.mediaState = 'preview'; }
        frame.querySelector('[data-dm-media-retry]')?.addEventListener('click', event => { event.stopPropagation(); enqueue(entry, true); });
        frame.addEventListener('pointerenter', () => { if (entry.frame.dataset.mediaState === 'preview') enqueue(entry); });
        frame.addEventListener('focusin', () => { if (entry.frame.dataset.mediaState === 'preview') enqueue(entry); });
        const pauseAfterInteraction = () => {
          if (canAnimate(frame)) return;
          const poster = mediaCache.get(cachedKey(entry))?.poster;
          if (poster) void show(entry, poster, 'preview');
        };
        frame.addEventListener('pointerleave', pauseAfterInteraction);
        frame.addEventListener('focusout', () => queueMicrotask(pauseAfterInteraction));
        observer.observe(frame);
      });
    },
    sync() {
      for (const entry of mounted.values()) {
        if (!alive(entry)) { dispose(entry); continue; }
        const animate = entry.visible && canAnimate(entry.frame);
        const state = entry.frame.dataset.mediaState;
        if (animate && state === 'preview') enqueue(entry);
        else if (!animate && state === 'ready') {
          const poster = mediaCache.get(cachedKey(entry))?.poster;
          if (poster) void show(entry, poster, 'preview');
        }
      }
    },
    clear() { for (const entry of mounted.values()) dispose(entry); observer?.disconnect(); cleanupObserver?.disconnect(); root = null; },
  };
}
