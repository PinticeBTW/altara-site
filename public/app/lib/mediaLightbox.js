// Presentation only: callers supply authorized media from the current conversation.
// This controller never fetches messages, resolves storage grants, or mutates the timeline.
import { callIconSvg } from './callIcons.js';

const shapes = {
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/>',
};
const icon = name => shapes[name]
  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`
  : callIconSvg(name);
export const fitMediaScale = (width, height, availableWidth, availableHeight) =>
  Math.min(1, Math.max(1, availableWidth) / Math.max(1, width), Math.max(1, availableHeight) / Math.max(1, height));

export function createMediaLightbox({ labels, getContext, getItems, bindVideo, isFavorite,
  toggleFavorite, download, prefetch, onOpen, onClose, onRestore, getScrollElement } = {}) {
  let overlay = null, lifetime, itemLife, observer, context, currentKey, item, items = [];
  let stage, surface, preview, full, video, topTitle, info, star, downloadButton, previous, next, zoomBar, zoomLabel, retry, status;
  let width = 1, height = 1, scale = 1, fit = 1, x = 0, y = 0, dragging = null, suppressClick = false;
  let savedFocus, scrollElement, scrollTop, scrollLeft, inert = [], currentLabels;
  const listen = (el, name, callback, options = {}, signal = lifetime.signal) => el.addEventListener(name, callback, { ...options, signal });
  const button = (action, label, glyph, parent) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.lightboxAction = action;
    b.className = 'mediaLightbox__button'; b.title = label; b.setAttribute('aria-label', label);
    b.innerHTML = icon(glyph); parent.append(b); return b;
  };
  const validContext = () => context === getContext();
  function refreshFavorite() {
    const favorite = item?.favorite || item?.provider;
    if (!overlay || !star || !favorite) return;
    const active = !!isFavorite(favorite);
    star.classList.toggle('is-active', active); star.setAttribute('aria-pressed', String(active));
    star.title = active ? currentLabels.unfavorite : currentLabels.favorite;
    star.setAttribute('aria-label', star.title);
  }
  function cleanupItem() {
    itemLife?.abort(); observer?.disconnect(); observer = null;
    if (dragging && stage?.hasPointerCapture(dragging.id)) stage.releasePointerCapture(dragging.id);
    dragging = null; suppressClick = false;
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; }
    for (const image of [full, preview]) if (image) image.removeAttribute('src');
    full = preview = null; stage?.replaceChildren();
  }
  function close() {
    if (!overlay) return;
    const sameContext = validContext();
    if (document.fullscreenElement && overlay.contains(document.fullscreenElement)) void document.exitFullscreen().catch(() => {});
    cleanupItem(); lifetime.abort(); overlay.remove(); overlay = null;
    for (const [el, wasInert] of inert) if (el.isConnected) el.inert = wasInert;
    inert = []; onClose?.();
    if (sameContext && scrollElement?.isConnected) { scrollElement.scrollTop = scrollTop; scrollElement.scrollLeft = scrollLeft; }
    if (sameContext) onRestore?.();
    if (sameContext && savedFocus?.isConnected) savedFocus.focus({ preventScroll: true });
    items = []; item = null; savedFocus = scrollElement = null;
  }
  function transform() {
    const bounds = stage.getBoundingClientRect();
    const maxX = Math.max(0, (width * scale - bounds.width) / 2);
    const maxY = Math.max(0, (height * scale - bounds.height) / 2);
    x = Math.max(-maxX, Math.min(maxX, x)); y = Math.max(-maxY, Math.min(maxY, y));
    surface.style.width = `${width}px`; surface.style.height = `${height}px`;
    surface.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle('is-zoomed', item?.zoomable && scale > fit + .001);
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }
  function resize(keepZoom = true) {
    if (!stage || !surface) return;
    const bounds = stage.getBoundingClientRect(), wasFit = Math.abs(scale - fit) < .002;
    fit = fitMediaScale(width, height, bounds.width, bounds.height - (item.kind === 'video' ? 74 : 0));
    if (!keepZoom || wasFit || !item.zoomable) { scale = fit; x = y = 0; }
    else scale = Math.max(fit, Math.min(1, scale));
    transform();
  }
  function zoom(value, clientX, clientY) {
    if (!item?.zoomable) return;
    const bounds = stage.getBoundingClientRect(), nextScale = Math.max(fit, Math.min(1, value));
    const anchorX = (clientX ?? bounds.left + bounds.width / 2) - bounds.left - bounds.width / 2;
    const anchorY = (clientY ?? bounds.top + bounds.height / 2) - bounds.top - bounds.height / 2;
    x = anchorX - (anchorX - x) * nextScale / scale;
    y = anchorY - (anchorY - y) * nextScale / scale;
    scale = nextScale; transform();
  }
  function failure() {
    status.textContent = currentLabels.unavailable; retry.hidden = false;
    overlay.dataset.mediaState = (preview?.naturalWidth || (preview?.tagName === 'CANVAS' && preview.width)) ? 'preview' : 'error';
  }
  function loadImage() {
    const signal = itemLife.signal, image = new Image(); full = image;
    image.className = 'mediaLightbox__asset'; image.alt = item.title || ''; image.decoding = 'async';
    image.referrerPolicy = 'no-referrer'; image.draggable = false;
    image.onload = async () => {
      try { await image.decode(); } catch {}
      if (signal.aborted) return;
      width = image.naturalWidth; height = image.naturalHeight; resize(false);
      image.classList.add('is-ready'); overlay.dataset.mediaState = 'ready';
      status.textContent = ''; retry.hidden = true;
      // Keep the tiny poster beneath the animation, including on an upgrade failure.
    };
    image.onerror = () => { if (!signal.aborted) failure(); };
    signal.addEventListener('abort', () => { image.onload = image.onerror = null; image.removeAttribute('src'); }, { once: true });
    surface.append(image); if (item.url) image.src = item.url; else failure();
  }
  function loadVideo() {
    const signal = itemLife.signal;
    const player = document.createElement('div'); player.className = 'mediaLightbox__videoPlayer'; player.dataset.videoPlayer = '';
    video = document.createElement('video'); video.className = 'msg__attachmentVideo mediaLightbox__video';
    video.playsInline = true; video.preload = 'metadata'; video.dataset.mediaSrc = item.url || '';
    if (preview) video.style.opacity = '0';
    if (item.preview) video.poster = item.preview;
    player.append(video);
    const controls = document.createElement('div'); controls.className = 'mediaLightbox__videoControls';
    controls.innerHTML = `<button type="button" data-video-play></button><span data-video-current>0:00</span>
      <input type="range" min="0" max="1000" step="1" value="0" data-video-seek>
      <span data-video-duration>0:00</span><span data-video-remain hidden></span>
      <div class="msgVideoVolWrap"><button type="button" data-video-mute></button>
      <input type="range" min="0" max="100" step="1" value="100" data-video-volume></div>
      <select data-video-speed><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
      <button type="button" data-video-fullscreen></button>`;
    for (const [selector, text] of [['[data-video-seek]', currentLabels.seek], ['[data-video-volume]', currentLabels.volume], ['[data-video-speed]', currentLabels.speed]]) {
      const el = controls.querySelector(selector); el.setAttribute('aria-label', text); el.title = text;
    }
    player.append(controls); surface.append(player);
    bindVideo(surface, { signal, lightboxLabels: currentLabels });
    const activeVideo = video;
    listen(activeVideo, 'loadedmetadata', () => {
      width = activeVideo.videoWidth || width; height = activeVideo.videoHeight || height; resize(false);
      const seconds = Number(activeVideo.duration);
      const duration = Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '';
      info.textContent = [item.meta, !item.dimensionsKnown && `${width} × ${height}`, duration].filter(Boolean).join(' · ');
    }, {}, signal);
    listen(activeVideo, 'loadeddata', () => { activeVideo.style.opacity = '1'; status.textContent = ''; retry.hidden = true; overlay.dataset.mediaState = 'ready'; }, {}, signal);
    listen(activeVideo, 'error', failure, {}, signal);
    listen(controls.querySelector('[data-video-speed]'), 'change', e => { activeVideo.playbackRate = Number(e.target.value); }, {}, signal);
    // The controls float in CSS pixels, independent of the video's native scaling.
    stage.append(player); surface.append(activeVideo); player.prepend(surface);
    activeVideo.preload = 'metadata'; if (item.url) activeVideo.src = item.url; else failure();
  }
  async function loadCurrent({ retrying = false } = {}) {
    const signal = itemLife.signal;
    if ((!item.url || retrying) && item.resolve && !item.provider) {
      let resolved;
      try { resolved = await item.resolve(signal); } catch {}
      if (signal.aborted) return;
      if (!resolved?.url) { failure(); return; }
      item = resolved; downloadButton.hidden = !item.download;
    }
    if (signal.aborted) return;
    if (item.kind === 'video') loadVideo(); else {
      if (full) { full.removeAttribute('src'); full.remove(); }
      loadImage();
    }
  }
  function show(key) {
    if (!validContext()) { close(); return false; }
    items = getItems(); item = items.find(entry => entry.key === key);
    if (!item) { close(); return false; }
    currentKey = key; cleanupItem(); itemLife = new AbortController();
    overlay.dataset.kind = item.kind; overlay.dataset.mediaState = 'pending';
    topTitle.textContent = item.title || currentLabels.media; info.textContent = item.meta || '';
    star.hidden = !(item.favorite || item.provider); downloadButton.hidden = !!(item.favorite || item.provider) || !item.download;
    zoomBar.hidden = !item.zoomable; refreshFavorite();
    status.textContent = ''; retry.hidden = true;
    const index = items.findIndex(entry => entry.key === key);
    previous.hidden = next.hidden = items.length < 2;
    previous.disabled = index <= 0; next.disabled = index >= items.length - 1;
    overlay.querySelector('[data-lightbox-counter]').textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
    width = item.width || 640; height = item.height || 400; x = y = 0;
    surface = document.createElement('div'); surface.className = 'mediaLightbox__surface'; stage.append(surface);
    preview = item.makePreview?.() || null;
    if (preview) { preview.className = 'mediaLightbox__preview'; surface.append(preview); }
    else if (item.preview) {
      preview = new Image(); preview.className = 'mediaLightbox__preview'; preview.alt = ''; preview.draggable = false;
      preview.decoding = 'async'; preview.referrerPolicy = 'no-referrer'; surface.append(preview); preview.src = item.preview;
    }
    resize(false); void loadCurrent();
    observer = new ResizeObserver(() => resize()); observer.observe(stage);
    // Only bounded, lightweight previews of immediate neighbours. Never their full media.
    for (const neighbour of [items[index - 1], items[index + 1]]) if (neighbour?.preview) prefetch?.(neighbour, itemLife.signal);
    return true;
  }
  function move(delta) {
    if (!validContext()) { close(); return; }
    const fresh = getItems(), index = fresh.findIndex(entry => entry.key === currentKey);
    if (index < 0) { close(); return; }
    if (fresh[index + delta]) show(fresh[index + delta].key);
  }
  function open(key) {
    close(); currentLabels = labels(); context = getContext();
    if (!context || !getItems().some(entry => entry.key === key)) return false;
    lifetime = new AbortController(); savedFocus = document.activeElement;
    scrollElement = getScrollElement?.(); scrollTop = scrollElement?.scrollTop; scrollLeft = scrollElement?.scrollLeft;
    overlay = document.createElement('div'); overlay.className = 'mediaLightbox'; overlay.id = 'dmMediaLightbox';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', currentLabels.media);
    overlay.innerHTML = `<header class="mediaLightbox__top"><div class="mediaLightbox__heading"><div data-lightbox-title></div><div data-lightbox-info></div></div><div class="mediaLightbox__actions"></div></header>
      <div class="mediaLightbox__stage"></div><footer class="mediaLightbox__bottom"><span data-lightbox-counter></span><div class="mediaLightbox__zoom"></div><div class="mediaLightbox__status"><span role="status"></span></div></footer>`;
    stage = overlay.querySelector('.mediaLightbox__stage'); topTitle = overlay.querySelector('[data-lightbox-title]'); info = overlay.querySelector('[data-lightbox-info]');
    const actions = overlay.querySelector('.mediaLightbox__actions');
    star = button('favorite', currentLabels.favorite, 'star', actions); downloadButton = button('download', currentLabels.download, 'download', actions);
    const closeButton = button('close', currentLabels.close, 'close', actions);
    previous = button('previous', currentLabels.previous, 'chevronRight', overlay); previous.classList.add('mediaLightbox__previous');
    next = button('next', currentLabels.next, 'chevronRight', overlay); next.classList.add('mediaLightbox__next');
    zoomBar = overlay.querySelector('.mediaLightbox__zoom');
    button('minus', currentLabels.zoomOut, 'minus', zoomBar);
    zoomLabel = document.createElement('button'); zoomLabel.type = 'button'; zoomLabel.dataset.lightboxAction = 'native'; zoomLabel.title = currentLabels.native; zoomLabel.setAttribute('aria-label', currentLabels.native); zoomBar.append(zoomLabel);
    button('plus', currentLabels.zoomIn, 'plus', zoomBar);
    const fitButton = document.createElement('button'); fitButton.type = 'button'; fitButton.dataset.lightboxAction = 'fit'; fitButton.textContent = currentLabels.fit; zoomBar.append(fitButton);
    status = overlay.querySelector('[role=status]'); retry = button('retry', currentLabels.retry, 'refresh', status.parentElement); retry.hidden = true;
    inert = [...document.body.children].filter(el => el instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(el.tagName)
      && !el.matches('.desktopWindowControls, .desktopTitlebarDragRegion')).map(el => [el, el.inert]);
    for (const [el] of inert) el.inert = true;
    document.body.append(overlay); onOpen?.();
    listen(overlay, 'click', async e => {
      if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
      const action = e.target.closest('[data-lightbox-action]')?.dataset.lightboxAction;
      if (action === 'close') close();
      else if (action === 'previous') move(-1);
      else if (action === 'next') move(1);
      else if (action === 'favorite' && validContext()) { toggleFavorite(item.favorite || item.provider); refreshFavorite(); }
      else if (action === 'download' && validContext()) {
        const signal = itemLife.signal;
        let live = getItems().find(entry => entry.key === currentKey);
        if (!live?.download && live?.resolve) {
          try { live = await live.resolve(signal); } catch { live = null; }
        }
        if (signal.aborted || !validContext()) return;
        if (live?.download) download(live.download); else failure();
      }
      else if (action === 'plus') zoom(scale * 1.25);
      else if (action === 'minus') zoom(scale / 1.25);
      else if (action === 'native') zoom(1);
      else if (action === 'fit') { scale = fit; x = y = 0; transform(); }
      else if (action === 'retry') {
        retry.hidden = true; status.textContent = '';
        if (item.kind === 'video') show(currentKey); else void loadCurrent({ retrying: true });
      }
      else if (e.target === overlay || e.target === stage) close();
    });
    listen(stage, 'wheel', e => { if (item?.zoomable) { e.preventDefault(); zoom(scale * Math.exp(-e.deltaY * .002), e.clientX, e.clientY); } }, { passive: false });
    listen(stage, 'pointerdown', e => {
      suppressClick = false;
      if (e.button !== 0 || !item?.zoomable || scale <= fit + .001 || !surface.contains(e.target)) return;
      dragging = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x, y }; stage.setPointerCapture(e.pointerId); e.preventDefault();
    });
    listen(stage, 'pointermove', e => {
      if (!dragging || e.pointerId !== dragging.id) return;
      const dx = e.clientX - dragging.startX, dy = e.clientY - dragging.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) suppressClick = true;
      x = dragging.x + dx; y = dragging.y + dy; transform();
    });
    for (const event of ['pointerup', 'pointercancel']) listen(stage, event, e => {
      if (dragging?.id === e.pointerId) { if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId); dragging = null; }
      if (e.type === 'pointercancel') suppressClick = false;
    });
    listen(document, 'keydown', e => {
      if (!overlay) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.key === 'Tab') {
        const focusable = [...overlay.querySelectorAll('button, input, select')].filter(el => !el.disabled && el.getClientRects().length && !el.hidden);
        const index = focusable.indexOf(document.activeElement), nextIndex = (index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        e.preventDefault(); focusable[nextIndex]?.focus(); return;
      }
      if (e.target.matches('input, select')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
      else if (['+', '='].includes(e.key)) { e.preventDefault(); zoom(scale * 1.25); }
      else if (e.key === '-') { e.preventDefault(); zoom(scale / 1.25); }
      else if (e.key === '0') { e.preventDefault(); zoom(1); }
      else if (video && e.code === 'Space' && !e.target.closest('.mediaLightbox__videoControls')) { e.preventDefault(); overlay.querySelector('[data-video-play]').click(); }
      else if (video && e.key.toLowerCase() === 'm') overlay.querySelector('[data-video-mute]').click();
      else if (video && e.key.toLowerCase() === 'f') overlay.querySelector('[data-video-fullscreen]').click();
    }, { capture: true });
    const opened = show(key); if (opened) closeButton.focus({ preventScroll: true }); return opened;
  }
  return { open, close, refreshFavorite, get isOpen() { return !!overlay; } };
}
