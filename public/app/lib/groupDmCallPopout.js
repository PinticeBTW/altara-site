// A view of the existing private-call stage. The owner window keeps every media
// connection and audio output. Opening this view requires an explicit UI action.
let nextWindowName = 8_000_000_000;
const SAFE_TAGS = new Set(['div', 'span', 'aside', 'main', 'section', 'header', 'footer',
  'button', 'input', 'select', 'option', 'label', 'p', 'small', 'strong', 'b', 'em',
  'h1', 'h2', 'h3', 'ul', 'li', 'img', 'video', 'svg', 'g', 'path', 'rect', 'circle',
  'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clippath', 'use', 'title']);
const HIDDEN_IDS = new Set(['btnGroupDmCallPopout', 'dmStageResizeGrip', 'serverVoiceDebugOverlay']);
const safe = callback => { try { return callback(); } catch (_) { return undefined; } };
const identity = session => session?.active === true && session.conversationId && session.sessionId
  ? `${String(session.conversationId)}:${String(session.sessionId)}` : '';

export function createGroupDmCallPopoutController({
  hostWindow = globalThis.window,
  getSession = () => null,
  getStage = () => null,
  computeGridLayout = null,
  syncStageGeometry = null,
  onReturn = () => {},
  onError = () => {},
  onChange = () => {},
  pollMs = 500,
} = {}) {
  let entry = null;
  let disposed = false;

  function clearVideo(video) {
    safe(() => video.pause?.());
    safe(() => { video.srcObject = null; });
  }

  function close({ fromWindow = false } = {}) {
    if (!entry) return false;
    const previous = entry;
    entry = null;
    for (const cleanup of previous.cleanup) safe(cleanup);
    for (const video of previous.videos.values()) clearVideo(video);
    if (!fromWindow) safe(() => previous.popup.close());
    safe(onChange);
    return true;
  }

  function copyAttributes(source, mirror) {
    const wanted = new Map();
    for (const attribute of Array.from(source.attributes || [])) {
      const name = String(attribute.name).toLowerCase();
      if (name.startsWith('on') || ['srcdoc', 'autofocus', 'formaction'].includes(name)) continue;
      if ((name === 'href' || name === 'xlink:href') && !String(attribute.value).startsWith('#')) continue;
      if (String(source.localName).toLowerCase() === 'video' && ['src', 'controls'].includes(name)) continue;
      wanted.set(attribute.name, attribute.value);
    }
    for (const attribute of Array.from(mirror.attributes || [])) {
      if (!wanted.has(attribute.name)) mirror.removeAttribute(attribute.name);
    }
    for (const [name, value] of wanted) {
      if (mirror.getAttribute(name) !== value) mirror.setAttribute(name, value);
    }
    if ('disabled' in source) mirror.disabled = !!source.disabled;
    if ('checked' in source) mirror.checked = !!source.checked;
    if ('value' in source && mirror.value !== source.value) mirror.value = source.value;
    if (HIDDEN_IDS.has(String(source.id || ''))) mirror.hidden = true;
  }

  function mirrorNode(source, current, seenVideos) {
    if (source.nodeType === 3) {
      let mirror = current.nodes.get(source);
      if (!mirror) { mirror = current.popup.document.createTextNode(source.nodeValue || ''); current.nodes.set(source, mirror); }
      if (mirror.nodeValue !== source.nodeValue) mirror.nodeValue = source.nodeValue;
      return mirror;
    }
    const tag = String(source.localName || '').toLowerCase();
    if (source.nodeType !== 1 || !SAFE_TAGS.has(tag)) return null;
    let mirror = current.nodes.get(source);
    if (!mirror) {
      mirror = source.namespaceURI
        ? current.popup.document.createElementNS(source.namespaceURI, source.localName)
        : current.popup.document.createElement(source.localName);
      current.nodes.set(source, mirror);
      current.originals.set(mirror, source);
    }
    copyAttributes(source, mirror);
    if (tag === 'video') {
      // Never clone/capture/read a frame or create another audio output.
      const stream = source.srcObject || null;
      mirror.autoplay = true;
      mirror.playsInline = true;
      mirror.muted = true;
      mirror.volume = 0;
      if (mirror.srcObject !== stream) {
        mirror.srcObject = stream;
        if (stream) safe(() => mirror.play()?.catch?.(() => {}));
      }
      current.videos.set(source, mirror);
      seenVideos.add(source);
      return mirror;
    }
    const children = Array.from(source.childNodes || [])
      .map(child => mirrorNode(child, current, seenVideos)).filter(Boolean);
    children.forEach((child, index) => {
      if (mirror.childNodes[index] !== child) mirror.insertBefore(child, mirror.childNodes[index] || null);
    });
    while (mirror.childNodes.length > children.length) mirror.removeChild(mirror.lastChild);
    return mirror;
  }

  function resizeGrid(current) {
    if (typeof computeGridLayout !== 'function') return;
    const stage = current.mirror;
    if (stage.getAttribute('data-private-call-layout') !== 'voice-grid') return;
    const grid = stage.querySelector('#callStageGrid');
    if (!grid) return;
    const tiles = Array.from(grid.querySelectorAll('[data-call-grid-entry="1"], .groupCallShareTile')).filter(tile => !tile.hidden);
    const mediaTileCount = tiles.filter(tile => tile.classList.contains('groupCallShareTile')).length;
    if (!tiles.length) return;
    const rect = grid.getBoundingClientRect();
    const style = current.popup.getComputedStyle?.(grid);
    const padding = key => Number.parseFloat(style?.[key]) || 0;
    const gap = 12;
    const layout = computeGridLayout({ containerWidth: rect.width - padding('paddingLeft') - padding('paddingRight'),
      containerHeight: rect.height - padding('paddingTop') - padding('paddingBottom'), tileCount: tiles.length, gap, mediaTileCount });
    if (!(layout?.tileWidth > 0 && layout?.tileHeight > 0)) return;
    for (const [key, value] of Object.entries({
      '--call-grid-cols': layout.columns, '--call-grid-rows': layout.rows,
      '--call-grid-tile-width': `${layout.tileWidth}px`, '--call-grid-tile-height': `${layout.tileHeight}px`,
    })) grid.style.setProperty(key, String(value));
    // The popup can cross a container breakpoint independently of its source.
    // Do not retain a 2+1 final-row span after resizing to three equal columns.
    const remainder = tiles.length % layout.columns;
    const lastFill = layout.columns === 2 && tiles.length > 2 && remainder === 1 ? '1'
      : layout.columns === 3 && tiles.length > 3 && remainder === 2 ? '2' : '0';
    grid.setAttribute('data-grid-cols', String(layout.columns));
    grid.setAttribute('data-grid-rows', String(layout.rows));
    grid.setAttribute('data-last-fill', lastFill);
    grid.setAttribute('data-odd-last', lastFill === '1' ? '1' : '0');
  }

  function reconcile() {
    if (!entry) return false;
    const current = entry;
    const session = safe(getSession);
    const stage = safe(getStage);
    if (current.popup.closed || identity(session) !== current.key || !stage) {
      close();
      return false;
    }
    const seenVideos = new Set();
    const mirror = mirrorNode(stage, current, seenVideos);
    if (!mirror) { close(); return false; }
    if (current.mirror !== mirror) {
      current.mount.replaceChildren(mirror);
      current.mirror = mirror;
    }
    mirror.hidden = false;
    mirror.setAttribute('aria-hidden', 'false');
    for (const [source, video] of current.videos) {
      if (!seenVideos.has(source)) { clearVideo(video); current.videos.delete(source); }
    }
    current.popup.document.title = `${String(session.title || 'Group call').slice(0, 100)} · ALTARA`;
    safe(() => resizeGrid(current));
    safe(() => syncStageGeometry?.(mirror));
    return true;
  }

  function dispatchAction(event) {
    const current = entry;
    if (!current || identity(safe(getSession)) !== current.key) { close(); return; }
    let mirror = event.target;
    let source = null;
    while (mirror && mirror !== current.mount) {
      const candidate = current.originals.get(mirror);
      if (candidate && (['button', 'input', 'select'].includes(String(candidate.localName))
        || candidate.getAttribute('role') === 'button' || candidate.hasAttribute('data-call-focus-target'))) {
        source = candidate;
        break;
      }
      mirror = mirror.parentNode;
    }
    const stage = safe(getStage);
    if (!source || !stage?.contains(source) || source.disabled || source.hidden || HIDDEN_IDS.has(String(source.id || ''))) return;
    event.preventDefault?.();
    if (event.type === 'click' && source.id === 'btnFullscreenStage') {
      const doc = current.popup.document;
      const request = doc.fullscreenElement ? doc.exitFullscreen?.()
        : current.mirror.querySelector('.callStageViewport')?.requestFullscreen?.();
      request?.catch?.(() => {});
    } else if (event.type === 'click') {
      // This runs only in response to a human action in the product popout.
      source.click?.();
    } else {
      if ('value' in mirror) source.value = mirror.value;
      if ('checked' in mirror) source.checked = mirror.checked;
      source.dispatchEvent?.(new hostWindow.Event(event.type, { bubbles: true }));
    }
    reconcile();
  }

  function open() {
    if (disposed || !hostWindow?.open) return { ok: false, reason: 'unavailable' };
    const session = safe(getSession);
    const stage = safe(getStage);
    const key = identity(session);
    if (!key || !stage) return { ok: false, reason: 'inactive' };
    if (entry?.key === key && !entry.popup.closed) {
      if (!reconcile()) return { ok: false, reason: 'inactive' };
      safe(() => entry.popup.focus());
      return { ok: true, reused: true, window: entry.popup };
    }
    close();
    // The existing main-process stream-window policy admits this exact namespace
    // and keeps sandbox/nodeIntegration/navigation restrictions unchanged.
    const popup = safe(() => hostWindow.open('about:blank', `altara-stream-popout-${++nextWindowName}`,
      'popup=yes,width=960,height=600,resizable=yes,scrollbars=no'));
    if (!popup || popup.closed) { safe(() => onError('blocked')); return { ok: false, reason: 'blocked' }; }
    const current = { key, popup, mount: null, mirror: null, nodes: new WeakMap(), originals: new WeakMap(), videos: new Map(), cleanup: [] };
    entry = current;
    try {
      const doc = popup.document;
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
      doc.close();
      const ownerDoc = hostWindow.document;
      const base = doc.createElement('base'); base.href = ownerDoc.baseURI; doc.head.append(base);
      for (const name of ['class', 'style', 'data-theme']) {
        const value = ownerDoc.documentElement?.getAttribute(name);
        if (value) doc.documentElement.setAttribute(name, value);
      }
      doc.body.className = `${ownerDoc.body?.className || ''} group-call-popout`;
      for (const sheet of Array.from(ownerDoc.styleSheets || [])) {
        const text = safe(() => Array.from(sheet.cssRules || []).map(rule => rule.cssText).join('\n'));
        if (!text) continue;
        const style = doc.createElement('style'); style.textContent = text; doc.head.append(style);
      }
      const style = doc.createElement('style');
      style.textContent = `
        html,body.group-call-popout{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important}
        body.group-call-popout{display:flex!important;flex-direction:column!important;background:#171612;color:#eee7dc}
        .groupCallPopoutActions{display:flex;justify-content:flex-end;gap:8px;padding:8px;flex:none}
        body.group-call-popout #dmMain{display:block!important;position:relative!important;flex:1!important;width:100%!important;min-height:0!important;overflow:hidden!important}
        body.group-call-popout #dmMain #callStage.callStage.is-private-call-ui{position:relative!important;inset:auto!important;display:block!important;width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important}
        body.group-call-popout #dmMain #callStage.callStage.is-private-call-ui .callStageCard{width:100%!important;height:100%!important;min-height:0!important;max-height:100%!important;margin:0!important}
        body.group-call-popout #dmMain #callStage .callStageViewport{min-height:0!important}
        body.group-call-popout #btnGroupDmCallPopout,body.group-call-popout #dmStageResizeGrip{display:none!important}
      `;
      doc.head.append(style);
      const actions = doc.createElement('div'); actions.className = 'groupCallPopoutActions';
      const button = (label, callback) => {
        const element = doc.createElement('button'); element.type = 'button'; element.className = 'btn ghost';
        element.textContent = label; element.addEventListener('click', callback); actions.append(element);
        current.cleanup.push(() => element.removeEventListener('click', callback));
      };
      button('Back to call', () => { safe(onReturn); safe(() => hostWindow.focus()); });
      button('Close', () => close());
      const mount = doc.createElement('main'); mount.id = 'dmMain';
      mount.className = ownerDoc.getElementById('dmMain')?.className || '';
      current.mount = mount;
      doc.body.append(actions, mount);
      for (const type of ['click', 'input', 'change']) {
        mount.addEventListener(type, dispatchAction);
        current.cleanup.push(() => mount.removeEventListener(type, dispatchAction));
      }
      const onClose = () => close({ fromWindow: true });
      popup.addEventListener('pagehide', onClose);
      popup.addEventListener('resize', reconcile);
      current.cleanup.push(() => popup.removeEventListener('pagehide', onClose), () => popup.removeEventListener('resize', reconcile));
      if (hostWindow.MutationObserver) {
        const observer = new hostWindow.MutationObserver(reconcile);
        observer.observe(stage, { childList: true, subtree: true, attributes: true, characterData: true });
        current.cleanup.push(() => observer.disconnect());
      }
      const timer = hostWindow.setInterval(reconcile, Math.max(250, Number(pollMs) || 500));
      current.cleanup.push(() => hostWindow.clearInterval(timer));
      if (!reconcile()) return { ok: false, reason: 'inactive' };
      safe(() => popup.focus());
      safe(onChange);
      return { ok: true, reused: false, window: popup };
    } catch (_) {
      close();
      safe(() => onError('unavailable'));
      return { ok: false, reason: 'unavailable' };
    }
  }
  const onHostClose = () => close();
  hostWindow?.addEventListener?.('pagehide', onHostClose);
  return { open, close, reconcile, isOpen: () => !!entry && !entry.popup.closed,
    dispose() { if (disposed) return; disposed = true; close(); hostWindow?.removeEventListener?.('pagehide', onHostClose); } };
}
