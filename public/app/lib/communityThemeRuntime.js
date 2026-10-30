import {
  compileCommunityThemeCss,
  createCommunityThemeLibrary,
} from './communityThemePackages.js';
import { createCommunityGlassFilter, usesCommunityGlassFilter, communityGlassCssForDocument, COMMUNITY_GLASS_HOST_ID } from './communityThemeGlass.js';
import { subscribeWidgetAppearance, refreshWidgetAppearance } from './widgetAppearance.js';
import { compileCommunityThemeLayout } from './communityThemeLayout.js';
import { createCommunityThemeLayoutBridge } from './communityThemeLayoutBridge.js';

const STYLE_ID = 'altaraCommunityThemeStyle';
const RECOVERY_ID = 'altaraThemeRecovery';
const MAX_COMPILED_THEMES = 32;
const MAX_COMPILED_BYTES = 4 * 1024 * 1024;
export const COMMUNITY_THEME_MATERIAL_PREFIX = 'altara:community-theme-material:v1:';
const MATERIALS = ['system', 'glass', 'solid'];

// Community styling is local to this renderer and owner. It never updates the
// profile, sends code to a backend, or grants a package a DOM/script capability.
export function createCommunityThemeRuntime(document, {
  storage = document.defaultView?.localStorage,
  getActor = () => '',
  getLanguage = () => 'en',
  onChange = () => {},
  authorizeSource,
} = {}) {
  const window = document.defaultView;
  const compiled = new Map();
  const libraries = new Map();
  let current = null, style = null, headObserver = null, glass = null, unsubscribeWidgets = null;
  let layoutBridge = null;
  let compiledBytes = 0;
  let keyboardBound = false;
  let activationGeneration = 0;
  const actor = () => String(getActor() || '').trim();
  const accessError = () => Object.assign(new Error('Connect to ALTARA to verify access to this paid theme. The base appearance is used; your saved theme is kept.'), {code:'COMMUNITY_THEME_ACCESS'});
  const snapshot = () => current ? { id: current.id, package: { ...current.package }, material: current.material } : null;
  const notify = () => {
    if (current && !unsubscribeWidgets) unsubscribeWidgets = subscribeWidgetAppearance(document, () => {});
    refreshWidgetAppearance(document);
    onChange(snapshot());
  };

  function libraryFor(owner) {
    if (libraries.has(owner)) return libraries.get(owner);
    const assertOwner = () => {
      if (!owner || actor() !== owner) throw new Error('The theme account changed.');
    };
    const library = createCommunityThemeLibrary({
      getItem: key => { assertOwner(); return storage.getItem(key); },
      setItem: (key, value) => { assertOwner(); return storage.setItem(key, value); },
      removeItem: key => { assertOwner(); return storage.removeItem(key); },
    }, owner);
    libraries.set(owner, library);
    if (libraries.size > 5) libraries.delete(libraries.keys().next().value);
    return library;
  }

  function stopPresentation() {
    layoutBridge?.stop();
    layoutBridge = null;
    headObserver?.disconnect();
    headObserver = null;
    style?.remove();
    style = null;
    document.getElementById(STYLE_ID)?.remove();
    glass?.remove();
    glass = null;
    document.getElementById(COMMUNITY_GLASS_HOST_ID)?.remove();
    // Remove any recovery host left by a previous runtime; deactivation is now
    // in Appearance, with the independent keyboard escape available everywhere.
    document.getElementById(RECOVERY_ID)?.remove();
    if (document.body) {
      delete document.body.dataset.altaraCommunityTheme;
      delete document.body.dataset.altaraThemeTransparency;
      delete document.body.dataset.altaraShellLayout;
    }
    document.querySelector('.app')?.removeAttribute('data-altara-theme-transparency');
    document.querySelector('.app')?.removeAttribute('data-altara-shell-layout');
    if (keyboardBound) document.removeEventListener('keydown', recoverByKeyboard, true);
    keyboardBound = false;
    current = null;
    refreshWidgetAppearance(document);
    unsubscribeWidgets?.();
    unsubscribeWidgets = null;
  }

  function suspend() {
    activationGeneration++;
    const wasActive = !!current;
    stopPresentation();
    if (wasActive) notify();
  }

  function owns(expected) {
    if (expected && actor() === expected) return true;
    suspend();
    return false;
  }

  function recoverByKeyboard(event) {
    if (!current || event.isComposing || event.repeat || event.metaKey ||
        !event.ctrlKey || !event.altKey || !event.shiftKey ||
        (event.code !== 'KeyT' && String(event.key || '').toLowerCase() !== 't')) return;
    if (!owns(current.actor)) return;
    event.preventDefault();
    event.stopPropagation();
    disableForRecovery();
  }

  function keepStyleLast() {
    if (!current || !owns(current.actor) || !style || !document.head) return;
    if (document.head.lastElementChild !== style) document.head.append(style);
  }

  function disableForRecovery() {
    try { disable(); }
    catch { window?.console?.warn('The theme was disabled for this session, but the local preference could not be saved.'); }
  }

  function compile(id, pkg) {
    const key = `${id}\0${pkg.apiVersion}\0${pkg.css}\0${JSON.stringify(pkg.assets || {})}`;
    if (compiled.has(key)) return compiled.get(key).css;
    const result = compileCommunityThemeCss(pkg.css, { apiVersion: pkg.apiVersion, assets: pkg.assets || {} });
    const cost = new TextEncoder().encode(key).byteLength + new TextEncoder().encode(result).byteLength;
    compiled.set(key, { css: result, cost });
    compiledBytes += cost;
    while (compiled.size > MAX_COMPILED_THEMES || compiledBytes > MAX_COMPILED_BYTES) {
      const oldest = compiled.keys().next().value;
      compiledBytes -= compiled.get(oldest).cost;
      compiled.delete(oldest);
    }
    return result;
  }

  function materialKey(owner, id) {
    return COMMUNITY_THEME_MATERIAL_PREFIX + encodeURIComponent(owner) + ':' + encodeURIComponent(id);
  }

  function readMaterial(owner, id) {
    const value = storage.getItem(materialKey(owner, id));
    return MATERIALS.includes(value) ? value : 'system';
  }

  function presentMaterial(value) {
    document.body.dataset.altaraThemeTransparency = value;
    const app = document.querySelector('.app');
    if (app) app.dataset.altaraThemeTransparency = value;
  }

  function setMaterial(value) {
    if (!MATERIALS.includes(value)) throw new Error('Invalid theme material.');
    const expected = current;
    if (!expected || !owns(expected.actor)) return false;
    // A choice belongs to this installation and account, never to the package
    // author or the OS. Commit first so storage failure keeps the prior material.
    storage.setItem(materialKey(expected.actor, expected.id), value);
    if (!owns(expected.actor) || current !== expected) return false;
    expected.material = value;
    presentMaterial(value);
    layoutBridge?.sync();
    notify();
    return true;
  }

  function present(owner, item, css, material) {
    if (!owns(owner)) return false;
    const existing = document.getElementById(STYLE_ID);
    if (existing && existing.tagName !== 'STYLE') throw new Error('Community theme style is unavailable.');
    const shell = compileCommunityThemeLayout(item.package.css);
    layoutBridge?.stop();
    layoutBridge = null;
    delete document.body.dataset.altaraShellLayout;
    document.querySelector('.app')?.removeAttribute('data-altara-shell-layout');
    css = communityGlassCssForDocument(document, css);
    if (usesCommunityGlassFilter(css)) {
      if (!glass?.isConnected) {
        glass = createCommunityGlassFilter(document);
        if (glass) document.body.append(glass);
      }
      css = communityGlassCssForDocument(document, css, !!glass);
    } else {
      glass?.remove();
      glass = null;
    }
    style = existing || document.createElement('style');
    style.id = STYLE_ID;
    const presentationCss = css + (shell.enabled ? '\n' + shell.css : '');
    if (style.textContent !== presentationCss) style.textContent = presentationCss;
    document.body.dataset.altaraCommunityTheme = item.id;
    if (shell.enabled) {
      document.body.dataset.altaraShellLayout = 'regions-v1';
      document.querySelector('.app')?.setAttribute('data-altara-shell-layout', 'regions-v1');
    }
    presentMaterial(material);
    current = { actor: owner, id: item.id, package: item.package, material };
    keepStyleLast();
    if (shell.enabled) layoutBridge = createCommunityThemeLayoutBridge(document);
    if (!headObserver && window?.MutationObserver) {
      headObserver = new window.MutationObserver(keepStyleLast);
      headObserver.observe(document.head, { childList: true });
    }
    if (!keyboardBound) document.addEventListener('keydown', recoverByKeyboard, true);
    keyboardBound = true;
    notify();
    return snapshot();
  }

  function applySelection(id, { persist = true, verified = null } = {}) {
    const owner = actor();
    if (!owner || !document.head || !document.body) { suspend(); return false; }
    if (current && current.actor !== owner) suspend();
    const library = libraryFor(owner);
    const data = library.read();
    if (!owns(owner)) return false;
    const item = data.installs.find(install => install.id === String(id || ''));
    if (!item) throw new Error('This community theme is not installed.');
    if (item.source?.disabled) { disable(); throw new Error('This theme release is unavailable. The base appearance is restored.'); }
    if (item.source?.paid && verified !== item.source.sha256) {
      const generation = ++activationGeneration;
      // Paid CSS remains hidden until the signed-in account is checked afresh.
      // Cached packages are retained for recovery, never treated as authority.
      if (current?.id === item.id) stopPresentation();
      if (typeof authorizeSource !== 'function') throw accessError();
      return Promise.resolve().then(() => authorizeSource({ ...item.source }, item.id)).then(allowed => {
        if (generation !== activationGeneration || !owns(owner)) return false;
        const fresh = library.read().installs.find(next => next.id === item.id);
        if (allowed !== true || !fresh || fresh.source?.disabled || fresh.source?.sha256 !== item.source.sha256
          || fresh.source?.releaseId !== item.source.releaseId || fresh.source?.accountId !== item.source.accountId) {
          throw accessError();
        }
        return applySelection(id, { persist, verified: item.source.sha256 });
      }).catch(error => {
        if (generation === activationGeneration && owns(owner) && current?.id === item.id) stopPresentation();
        throw error?.code === 'COMMUNITY_THEME_ACCESS' ? error : accessError();
      });
    }
    if (!verified) activationGeneration++;
    // Library reads revalidate changed persisted data and return detached,
    // allowlisted packages. Reuse that validation rather than parsing CSS again.
    const pkg = item.package;
    const css = compile(item.id, pkg);
    const material = readMaterial(owner, item.id);
    if (!owns(owner)) return false;
    const existing = document.getElementById(STYLE_ID);
    if (existing && existing.tagName !== 'STYLE') throw new Error('Community theme style is unavailable.');
    // Nothing visual changes if validation, compilation or persistence fails.
    if (persist) library.activate(item.id);
    if (!owns(owner)) return false;
    return present(owner, { id: item.id, package: pkg }, css, material);
  }

  function restore() {
    const owner = actor();
    if (!owner || !document.head || !document.body) { suspend(); return null; }
    if (current && current.actor !== owner) suspend();
    try {
      const data = libraryFor(owner).read();
      if (!owns(owner)) return null;
      if (!data.activeId || !data.installs.some(item => item.id === data.activeId)) {
        suspend();
        return null;
      }
      return applySelection(data.activeId, { persist: false }) || null;
    } catch (error) {
      // Persisted packages are untrusted too. Do not leave a previous account's
      // styling on screen or partially apply an invalid saved package.
      suspend();
      throw error;
    }
  }

  function disable() {
    activationGeneration++;
    const owner = actor();
    if (!owner) { suspend(); return false; }
    if (current && current.actor !== owner) suspend();
    const library = libraryFor(owner);
    if (!owns(owner)) return false;
    try {
      library.activate(null);
      if (!owns(owner)) return false;
    } finally {
      // Recovery must still work when browser storage is unavailable. Report a
      // persistence error to callers, but remove the dangerous styling now.
      if (!current || current.actor === owner) {
        stopPresentation();
        notify();
      }
    }
    return true;
  }

  function active() {
    if (current && !owns(current.actor)) return null;
    return snapshot();
  }

  function refreshLanguage() {
    if (!current || !owns(current.actor)) return false;
    return true;
  }

  return { restore, apply: id => applySelection(id), disable, suspend, active, setMaterial, refreshLanguage };
}
