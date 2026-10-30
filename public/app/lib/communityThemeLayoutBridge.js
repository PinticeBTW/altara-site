const VERSION = 'regions-v1';
const regions = Object.freeze({ navigation: '.leftDockDms', context: '.panel.right' });
const handles = Object.freeze({ navigation: 'leftSidebarResizer', context: 'rightSidebarResizer' });
const bridges = new WeakMap();

const styleOf = (document, node) => node && document.defaultView?.getComputedStyle?.(node);
const rectOf = node => {
  const rect = node?.getBoundingClientRect?.();
  return rect && ['left', 'top', 'right', 'bottom', 'width', 'height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0 ? rect : null;
};
const integer = value => /^[1-9]\d?$/.test(String(value).trim()) ? Number(value) : null;

export function isCommunityThemeLayoutActive(document) {
  if (!document?.body || document.body.classList.contains('authPage') || document.body.getAttribute('data-altara-shell-layout') !== VERSION) return false;
  return styleOf(document, document.querySelector('.app'))?.getPropertyValue('--altara-native-shell-active').trim() === '1';
}

function trackSizes(style, axis) {
  const raw = axis === 'x' ? style.gridTemplateColumns : style.gridTemplateRows;
  const tokens = String(raw || '').trim().split(/\s+/);
  if (!tokens.length || tokens.length > 8 || tokens.some(value => !/^\d+(?:\.\d+)?px$/.test(value))) return null;
  const values = tokens.map(Number.parseFloat);
  return values.every(value => Number.isFinite(value) && value >= 0 && value <= 20000) ? values : null;
}

export function getCommunityThemeResizeGeometry(document, region) {
  if (!Object.hasOwn(regions, region) || !isCommunityThemeLayoutActive(document)) return null;
  const app = document.querySelector('.app');
  if (app.classList.contains(region === 'navigation' ? 'left-collapsed' : 'right-collapsed')) return null;
  const node = document.querySelector(regions[region]), main = document.querySelector('.panel.mid');
  const nodeStyle = styleOf(document, node), mainStyle = styleOf(document, main), appStyle = styleOf(document, app);
  if (!nodeStyle || !mainStyle || !appStyle || [nodeStyle, mainStyle].some(style => style.display === 'none' || style.visibility === 'hidden')) return null;
  const rect = rectOf(node), mainRect = rectOf(main);
  if (!rect || !mainRect) return null;
  const overlapX = Math.min(rect.right, mainRect.right) - Math.max(rect.left, mainRect.left);
  const overlapY = Math.min(rect.bottom, mainRect.bottom) - Math.max(rect.top, mainRect.top);
  const candidates = [];
  if (overlapY >= 16 && rect.right <= mainRect.left + 1) candidates.push({ axis: 'x', sign: 1, edge: rect.right, near: mainRect.left });
  if (overlapY >= 16 && rect.left >= mainRect.right - 1) candidates.push({ axis: 'x', sign: -1, edge: rect.left, near: mainRect.right });
  if (overlapX >= 16 && rect.bottom <= mainRect.top + 1) candidates.push({ axis: 'y', sign: 1, edge: rect.bottom, near: mainRect.top });
  if (overlapX >= 16 && rect.top >= mainRect.bottom - 1) candidates.push({ axis: 'y', sign: -1, edge: rect.top, near: mainRect.bottom });
  const boundary = candidates.sort((a, b) => Math.abs(a.edge - a.near) - Math.abs(b.edge - b.near))[0];
  if (!boundary) return null;
  const dimension = boundary.axis === 'x' ? 'column' : 'row';
  const start = integer(appStyle.getPropertyValue(`--altara-shell-${region}-${dimension}-start`));
  const end = integer(appStyle.getPropertyValue(`--altara-shell-${region}-${dimension}-end`));
  const tracks = trackSizes(appStyle, boundary.axis);
  if (!tracks || !start || !end || start >= end || end > tracks.length + 1) return null;
  const trackIndex = boundary.sign === 1 ? end - 1 : start;
  if (!(tracks[trackIndex - 1] > 0)) return null;
  const rawMinimum = appStyle.getPropertyValue(`--altara-shell-${dimension}-${trackIndex}-min`).trim();
  if (rawMinimum && (!/^\d+(?:\.\d+)?$/.test(rawMinimum) || Number(rawMinimum) > 640)) return null;
  const trackMinimum = rawMinimum ? Number(rawMinimum) : 0;
  const currentSize = boundary.axis === 'x' ? rect.width : rect.height;
  const mainSize = boundary.axis === 'x' ? mainRect.width : mainRect.height;
  const minimum = Math.max(Math.min(currentSize, boundary.axis === 'x' ? 180 : 72), currentSize - tracks[trackIndex - 1] + trackMinimum);
  if (minimum > currentSize + 1) return null;
  // Keep a usable main region; an invalid or diagonal plan never gets a handle.
  const maximum = Math.max(minimum, Math.min(640, currentSize + mainSize - 240));
  const point = Math.abs(boundary.edge - boundary.near) < 80 ? (boundary.edge + boundary.near) / 2 : boundary.edge;
  const box = boundary.axis === 'x'
    ? { left: point - 3, top: Math.max(rect.top, mainRect.top), width: 6, height: overlapY }
    : { left: Math.max(rect.left, mainRect.left), top: point - 3, width: overlapX, height: 6 };
  return { region, axis: boundary.axis, sign: boundary.sign, currentSize, minimum, maximum, trackIndex,
    trackSize: tracks[trackIndex - 1], trackMinimum, property: `--altara-shell-${dimension}-${trackIndex}`, box };
}

export function setCommunityThemeRegionSize(document, region, size) {
  const bridge = bridges.get(document), geometry = getCommunityThemeResizeGeometry(document, region);
  if (!bridge || !geometry || !Number.isFinite(size)) return null;
  const next = Math.max(geometry.minimum, Math.min(geometry.maximum, size));
  const trackSize = geometry.trackSize + next - geometry.currentSize;
  if (!(trackSize >= Math.max(16, geometry.trackMinimum) && trackSize <= 20000)) return null;
  bridge.setTrack(geometry.property, trackSize + 'px', Math.max(16, geometry.trackMinimum, geometry.trackSize + geometry.minimum - geometry.currentSize));
  bridge.schedule();
  return next;
}

export function resetCommunityThemeRegionSize(document, region) {
  const bridge = bridges.get(document), geometry = getCommunityThemeResizeGeometry(document, region);
  if (!bridge || !geometry) return false;
  bridge.restoreTrack(geometry.property);
  bridge.schedule();
  return true;
}

export function getCommunityThemeLeftInset(document, viewportWidth) {
  if (!isCommunityThemeLayoutActive(document)) return null;
  const boxes = [], main = rectOf(document.querySelector('.panel.mid'));
  for (const selector of ['.leftDockDms', '.leftDockGroups', '#meProfileCard', '#voiceMiniDockSlot']) {
    const node = document.querySelector(selector), style = styleOf(document, node), rect = rectOf(node);
    if (!rect || style?.display === 'none' || style?.visibility === 'hidden') continue;
    if (!main || Math.min(rect.bottom, main.bottom) - Math.max(rect.top, main.top) < 16) continue;
    if (rect.right > 0 && rect.right < viewportWidth - 48) boxes.push(rect);
  }
  // Include a navigation block beside the left rail, but never interpret a
  // full-width header or an isolated right dock as the left sidebar.
  let right = 0;
  for (const rect of boxes.sort((a, b) => a.left - b.left)) if (rect.left <= right + 24) right = Math.max(right, rect.right);
  return right;
}

export function getCommunityThemeVoiceInset(document, bar) {
  if (!isCommunityThemeLayoutActive(document)) return null;
  if (!bar?.classList?.contains('is-open') || bar.hidden || bar.closest?.('#voiceMiniDockSlot')) return 0;
  const voice = rectOf(bar), navigation = rectOf(document.querySelector('.leftDockDms'));
  if (!voice || !navigation || Math.min(voice.right, navigation.right) <= Math.max(voice.left, navigation.left) ||
    voice.top >= navigation.bottom || voice.bottom < navigation.bottom - 2) return 0;
  return Math.max(0, Math.ceil(navigation.bottom - Math.max(navigation.top, voice.top)) + 14);
}

export function createCommunityThemeLayoutBridge(document, { onGeometryChange = () => {} } = {}) {
  bridges.get(document)?.stop();
  const window = document.defaultView, app = document.querySelector('.app');
  if (!window || !app) return { sync() {}, stop() {} };
  const saved = new Map(), tracks = new Map();
  let stopped = false, frame = null, plan = null, signature = '';
  const remember = node => {
    if (!node || saved.has(node)) return;
    saved.set(node, { hadStyle: node.getAttribute('style') !== null, attributes: new Map(), styles: new Map() });
  };
  const attribute = (node, name, value) => {
    if (node.getAttribute(name) === value) return;
    remember(node); const values = saved.get(node).attributes;
    if (!values.has(name)) values.set(name, { original: node.getAttribute(name), last: value }); else values.get(name).last = value;
    node.setAttribute(name, value);
  };
  const style = (node, name, value) => {
    if (node.style.getPropertyValue(name) === value && node.style.getPropertyPriority(name) === 'important') return;
    remember(node); const values = saved.get(node).styles;
    if (!values.has(name)) values.set(name, { original: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name), last: value }); else values.get(name).last = value;
    node.style.setProperty(name, value, 'important');
  };
  const restoreNodes = () => {
    for (const [node, original] of saved) {
      for (const [name, value] of original.styles) if (node.style.getPropertyValue(name) === value.last && node.style.getPropertyPriority(name) === 'important') {
        if (value.original) node.style.setProperty(name, value.original, value.priority); else node.style.removeProperty(name);
      }
      for (const [name, value] of original.attributes) if (node.getAttribute(name) === value.last) {
        if (value.original === null) node.removeAttribute(name); else node.setAttribute(name, value.original);
      }
      if (!original.hadStyle && !String(node.style.cssText || '').trim()) node.removeAttribute('style');
    }
    saved.clear();
    // Native width preferences may change during a themed drag. Their current
    // inline value, rather than the pre-activation ARIA snapshot, remains true.
    for (const [region, property] of [['navigation', '--friends-sidebar-width'], ['context', '--right-sidebar-width']]) {
      const handle = document.getElementById(handles[region]), raw = app.style.getPropertyValue(property);
      if (!handle || !/^\d+(?:\.\d+)?px$/.test(raw)) continue;
      const minimum = Number(handle.getAttribute('aria-valuemin')), maximum = Number(handle.getAttribute('aria-valuemax'));
      if (maximum > minimum) handle.setAttribute('aria-valuenow', String(Math.round(Math.max(minimum, Math.min(maximum, Number.parseFloat(raw))))));
    }
  };
  function restoreTrack(property, retain = false) {
    const original = tracks.get(property);
    if (!original) return;
    if (app.style.getPropertyValue(property) === original.last && app.style.getPropertyPriority(property) === 'important') {
      if (original.value) app.style.setProperty(property, original.value, original.priority); else app.style.removeProperty(property);
    }
    if (retain) original.last = null; else tracks.delete(property);
  }
  const clearTracks = () => { for (const property of [...tracks.keys()]) restoreTrack(property); };
  const ownsTrack = (property, value) => value.last === null
    ? app.style.getPropertyValue(property) === value.value && app.style.getPropertyPriority(property) === value.priority
    : app.style.getPropertyValue(property) === value.last && app.style.getPropertyPriority(property) === 'important';
  function fitTracks() {
    // Retain the requested size, but apply only what the current content box can
    // hold alongside native track floors. Never revive a concurrent override.
    for (const [property, value] of tracks) {
      if (!ownsTrack(property, value)) tracks.delete(property);
    }
    const pixels = value => /^\d+(?:\.\d+)?px$/.test(String(value)) ? Number.parseFloat(value) : 0;
    for (const [axis, dimension, client, startPadding, endPadding, gap] of [['x', 'column', 'clientWidth', 'paddingLeft', 'paddingRight', 'columnGap'], ['y', 'row', 'clientHeight', 'paddingTop', 'paddingBottom', 'rowGap']]) {
      const appStyle = styleOf(document, app), sizes = trackSizes(appStyle, axis);
      if (!sizes || !(app[client] > 0)) continue;
      const owned = [...tracks].filter(([property]) => property.startsWith('--altara-shell-' + dimension + '-'));
      if (!owned.length) continue;
      const minimums = sizes.map((_, index) => Number(appStyle.getPropertyValue('--altara-shell-' + dimension + '-' + (index + 1) + '-min')) || 0);
      const mainStart = integer(appStyle.getPropertyValue('--altara-shell-main-' + dimension + '-start'));
      const mainEnd = integer(appStyle.getPropertyValue('--altara-shell-main-' + dimension + '-end'));
      const indexes = new Set(owned.map(([property]) => Number(property.slice(property.lastIndexOf('-') + 1)) - 1));
      const reserve = sizes.reduce((sum, size, index) => sum + (indexes.has(index) ? 0 : mainStart && index >= mainStart - 1 && index < mainEnd - 1 ? minimums[index] : size), 0);
      const capacity = app[client] - pixels(appStyle[startPadding]) - pixels(appStyle[endPadding]) - pixels(appStyle[gap]) * (sizes.length - 1) - reserve;
      const requests = owned.map(([property, value]) => ({ property, value, minimum: Math.max(value.minimum, minimums[Number(property.slice(property.lastIndexOf('-') + 1)) - 1]) }));
      const floor = requests.reduce((sum, request) => sum + request.minimum, 0);
      if (capacity < floor) { for (const { property } of requests) restoreTrack(property, true); continue; }
      const extra = requests.reduce((sum, request) => sum + Math.max(0, Number.parseFloat(request.value.requested) - request.minimum), 0);
      const ratio = extra > 0 ? Math.min(1, (capacity - floor) / extra) : 1;
      for (const { property, value, minimum } of requests) {
        const applied = minimum + Math.max(0, Number.parseFloat(value.requested) - minimum) * ratio;
        value.last = Math.max(minimum, Math.floor(applied * 100) / 100) + 'px';
        style(app, property, value.last);
      }
    }
  }
  function setTrack(property, value, minimum) {
    if (tracks.has(property) && !ownsTrack(property, tracks.get(property))) { tracks.delete(property); saved.get(app)?.styles.delete(property); }
    if (!tracks.has(property)) tracks.set(property, { value: app.style.getPropertyValue(property), priority: app.style.getPropertyPriority(property), minimum, last: null });
    const track = tracks.get(property); track.requested = value; track.minimum = Math.max(track.minimum, minimum);
    fitTracks();
  }
  function sync() {
    if (stopped) return;
    if (!isCommunityThemeLayoutActive(document)) {
      for (const [property, value] of tracks) if (!ownsTrack(property, value)) tracks.delete(property);
      restoreNodes(); for (const value of tracks.values()) value.last = null;
      signature = ''; return;
    }
    const appStyle = styleOf(document, app);
    const nextPlan = ['--altara-shell-plan-id', ...Object.keys(regions).flatMap(region => ['column', 'row'].flatMap(axis => ['start', 'end'].map(edge => `--altara-shell-${region}-${axis}-${edge}`)))].map(name => appStyle.getPropertyValue(name).trim()).join('|');
    if (plan !== null && plan !== nextPlan) clearTracks();
    plan = nextPlan;
    fitTracks();
    const current = [];
    for (const region of Object.keys(regions)) {
      const handle = document.getElementById(handles[region]);
      if (!handle) continue;
      remember(handle);
      const geometry = getCommunityThemeResizeGeometry(document, region);
      if (!geometry) {
        style(handle, 'display', 'none'); attribute(handle, 'aria-hidden', 'true'); attribute(handle, 'tabindex', '-1');
        current.push(region + ':hidden'); continue;
      }
      const appRect = app.getBoundingClientRect(), box = geometry.box;
      style(handle, 'position', 'absolute'); style(handle, 'display', 'block');
      style(handle, 'left', (box.left - appRect.left - (app.clientLeft || 0) + (app.scrollLeft || 0)) + 'px');
      style(handle, 'top', (box.top - appRect.top - (app.clientTop || 0) + (app.scrollTop || 0)) + 'px');
      style(handle, 'right', 'auto'); style(handle, 'bottom', 'auto');
      style(handle, 'width', box.width + 'px'); style(handle, 'height', box.height + 'px');
      style(handle, 'transform', 'none'); style(handle, 'cursor', geometry.axis === 'x' ? 'col-resize' : 'row-resize');
      attribute(handle, 'aria-hidden', 'false'); attribute(handle, 'tabindex', '0');
      attribute(handle, 'aria-orientation', geometry.axis === 'x' ? 'vertical' : 'horizontal');
      attribute(handle, 'aria-valuemin', String(Math.round(geometry.minimum))); attribute(handle, 'aria-valuemax', String(Math.round(geometry.maximum)));
      attribute(handle, 'aria-valuenow', String(Math.round(geometry.currentSize)));
      current.push([region, geometry.axis, geometry.sign, ...Object.values(box)].join(':'));
    }
    for (const selector of ['.leftDockDms', '.panel.mid', '.panel.right']) {
      const node = document.querySelector(selector); if (!node) continue; remember(node); attribute(node, 'tabindex', '-1');
      if (selector === '.leftDockDms') { attribute(node, 'role', 'navigation'); if (!node.getAttribute('aria-label')) attribute(node, 'aria-label', 'Navigation'); }
    }
    const nextSignature = current.join('|');
    if (signature !== nextSignature) { signature = nextSignature; onGeometryChange(); }
  }
  function schedule() { if (!stopped && frame === null) frame = window.requestAnimationFrame(() => { frame = null; sync(); }); }
  const protectedSelector = '.altaraConfirmDialog,.modal,#profileOverlay,dialog,[data-theme-sensitive="true"]';
  const mutation = window.MutationObserver && new window.MutationObserver(records => {
    if (records.some(record => record.target === document.body || record.target === app || record.target?.matches?.(protectedSelector) ||
      record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.(protectedSelector) || node.querySelector?.(protectedSelector)))) schedule();
  });
  mutation?.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'data-theme-sensitive', 'data-altara-shell-layout'] });
  const resize = window.ResizeObserver && new window.ResizeObserver(schedule);
  for (const node of [app, document.querySelector('.leftDockDms'), document.querySelector('.panel.right'), document.querySelector('.panel.mid')]) if (node) resize?.observe(node);
  window.addEventListener('resize', schedule);
  function stop() {
    if (stopped) return; stopped = true;
    mutation?.disconnect(); resize?.disconnect(); window.removeEventListener('resize', schedule);
    if (frame !== null) window.cancelAnimationFrame(frame);
    clearTracks(); restoreNodes();
    if (bridges.get(document) === controller) bridges.delete(document);
  }
  const controller = { sync, stop, schedule, setTrack, restoreTrack };
  bridges.set(document, controller); sync();
  return { sync, stop };
}
