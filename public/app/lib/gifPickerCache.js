// Public provider metadata only. No sessions, messages or credentials enter this cache.
export class GifPickerCache {
  constructor({ limit = 40, ttl = 300000, now = Date.now } = {}) {
    this.entries = new Map(); this.limit = limit; this.ttl = ttl; this.now = now;
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= this.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttl });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    return value;
  }
}

// Each mounted picker owns its observer and queue. Leaving it cancels work and
// releases DOM references; completed posters remain in the bounded preview cache.
export function createGifThumbnailViewport(root, prepare) {
  const controller = new AbortController();
  const playback = new Map();
  const syncImage = (img, entry) => {
    const active = !controller.signal.aborted && img.isConnected
      && entry.visible && !document.hidden && entry.canPlay();
    const src = active ? entry.url : entry.poster;
    if (img.getAttribute("src") !== src) img.src = src;
  };
  const syncPlayback = () => playback.forEach((entry, img) => syncImage(img, entry));
  const animationObserver = new IntersectionObserver(entries => {
    for (const observed of entries) {
      const entry = playback.get(observed.target);
      if (!entry) continue;
      entry.visible = observed.isIntersecting;
      syncImage(observed.target, entry);
    }
  }, { root });
  for (const event of ["pointerover", "pointerout", "focusin", "focusout"]) {
    root.addEventListener(event, syncPlayback, { signal: controller.signal });
  }
  document.addEventListener("visibilitychange", syncPlayback, { signal: controller.signal });
  window.addEventListener("focus", syncPlayback, { signal: controller.signal });
  window.addEventListener("blur", syncPlayback, { signal: controller.signal });
  const pending = new Map(); const queue = []; let running = 0;
  const pump = () => {
    while (!controller.signal.aborted && running < 4 && queue.length) {
      const el = queue.shift(); const task = pending.get(el); pending.delete(el);
      if (!task || !el.isConnected) continue;
      running++;
      Promise.resolve(prepare(task.item, { signal: controller.signal }))
        .then(result => { if (!controller.signal.aborted && el.isConnected) task.ready(result); })
        .catch(() => { if (!controller.signal.aborted && el.isConnected) task.ready(null); })
        .finally(() => { running--; pump(); });
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !pending.has(entry.target)) continue;
      observer.unobserve(entry.target); queue.push(entry.target);
    }
    pump();
  }, { root, rootMargin: "100px" });
  return {
    observe(el, item, ready) { pending.set(el, { item, ready }); observer.observe(el); },
    play(img, { poster, url, canPlay = () => true }) {
      img.src = poster;
      if (!url) return;
      playback.set(img, { poster, url, canPlay, visible: false });
      animationObserver.observe(img);
    },
    syncPlayback,
    dispose() {
      controller.abort(); observer.disconnect(); animationObserver.disconnect();
      syncPlayback(); playback.clear(); pending.clear(); queue.length = 0;
    },
  };
}
