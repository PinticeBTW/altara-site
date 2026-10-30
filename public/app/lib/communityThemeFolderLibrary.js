import { createCommunityThemeLibrary, validateCommunityThemePackage, COMMUNITY_THEME_LIMITS, COMMUNITY_THEME_STORAGE_PREFIX } from './communityThemePackages.js';
import { canonicalThemeJson } from './communityThemeAccount.js';

// The folder supplies packages only. Account preferences and the active, already
// validated snapshot remain in the existing library; editing a file never
// replaces a running theme without a new activation.
export function createCommunityThemeFolderLibrary({ folder, storage, ownerId, getActor, window: hostWindow } = {}) {
  const owner = String(ownerId || '');
  let disposed = false, queue = Promise.resolve(), refreshPending = null, migrated = false;
  let state = { folderPath: '', errors: [], files: [], activeFileMissing: false };
  const listeners = new Set();
  const owns = () => !disposed && owner && String(getActor?.() || '') === owner;
  const fence = () => { if (!owns()) throw new Error('The theme account changed.'); };
  const safeStorage = { getItem: key => { fence(); return storage.getItem(key); }, setItem: (key, value) => { fence(); return storage.setItem(key, value); } };
  const migrationKey = 'altara:community-theme-folder-exported:v1:' + owner;
  migrated = safeStorage.getItem(migrationKey) === '1';
  const library = createCommunityThemeLibrary(safeStorage, owner);
  const notify = () => { if (owns()) for (const listener of listeners) listener(); };
  const enqueue = action => {
    const next = queue.then(() => { fence(); return action(); });
    queue = next.catch(() => {});
    return next;
  };

  function reconcile(snapshot) {
    fence();
    const before = library.read();
    const prior = new Map([...before.installs.filter(item => !item.source && item.id !== before.activeId), ...before.installs.filter(item => !item.source && item.id === before.activeId)].map(item => [canonicalThemeJson(item.package), item]));
    // Account releases keep their server-owned identity; a matching local file
    // never replaces their accepted version or entitlement state.
    const installs = before.installs.filter(item => item.source), files = [], seen = new Set();
    for (const entry of snapshot.entries) {
      const pkg = validateCommunityThemePackage(entry.package);
      const key = canonicalThemeJson(pkg);
      if (seen.has(key)) continue;
      seen.add(key);
      const old = prior.get(key);
      const item = old || { id: 'folder-' + entry.sha256, package: pkg };
      if (before.activeId === item.id && !old) throw new Error('The theme folder contains a conflicting version identifier. The previous theme is kept.');
      installs.push(item); files.push({ id: item.id, fileName: entry.fileName, sha256: entry.sha256 });
    }
    // Keep a cached active version if its file changes, disappears or becomes
    // invalid. It stays recoverable and is clearly marked in the native list.
    const oldActive = before.installs.find(item => item.id === before.activeId);
    const activeFileMissing = !!oldActive && !oldActive.source && !installs.some(item => item.id === oldActive.id);
    if (activeFileMissing) installs.unshift(oldActive);
    for (const item of before.installs) {
      if (item.source?.missingPackage && !installs.some(next => next.id === item.id)) installs.push(item);
    }
    if (installs.length > COMMUNITY_THEME_LIMITS.installs) throw new Error('The theme folder has too many versions. Keep fewer files before importing another theme.');
    const next = { version: 1, installs, activeId: oldActive ? oldActive.id : null };
    const serialized = JSON.stringify(next);
    if (new TextEncoder().encode(serialized).byteLength > COMMUNITY_THEME_LIMITS.libraryBytes) throw new Error('The theme folder exceeds the local storage limit. The previous theme is kept.');
    const key = COMMUNITY_THEME_STORAGE_PREFIX + owner;
    if (safeStorage.getItem(key) !== serialized) safeStorage.setItem(key, serialized);
    fence();
    state = { folderPath: snapshot.folderPath, errors: snapshot.errors, files, activeFileMissing };
    notify();
    return library.read();
  }

  async function readFolder() {
    let snapshot = await folder.list(); fence();
    if (!migrated) {
      const prior = library.read();
      const known = new Set(snapshot.entries.map(entry => canonicalThemeJson(entry.package)));
      // Migrate existing installations without clearing their original cache,
      // IDs, published provenance, saved material choice or active preference.
      for (const item of prior.installs) {
        if (item.source) continue;
        const key = canonicalThemeJson(item.package);
        if (!known.has(key)) {
          await folder.importPackage(item.package); fence(); known.add(key);
        }
      }
      snapshot = await folder.list(); fence();
      // This marker records successful native exports, not an activated theme.
      // Commit it before changing the cache: a quota/write failure leaves the
      // prior cache intact, while every old package is already safely on disk.
      safeStorage.setItem(migrationKey, '1');
      migrated = true;
    }
    const result = reconcile(snapshot);
    migrated = true;
    return result;
  }

  function refresh() {
    if (refreshPending) return refreshPending;
    const request = enqueue(readFolder).catch(error => {
      if (owns()) { state = { ...state, errors: [{ code: 'THEME_FOLDER_READ_FAILED', fileName: '' }] }; notify(); }
      throw error;
    });
    refreshPending = request;
    request.finally(() => { if (refreshPending === request) refreshPending = null; }).catch(() => {});
    return request;
  }
  let lastWake = 0;
  const wake = () => {
    if (!owns() || Date.now() - lastWake < 1000) return;
    lastWake = Date.now();
    // refresh already exposes the failure; focusing the window must not emit it twice.
    refresh().catch(() => {});
  };
  hostWindow?.addEventListener('focus', wake);
  return Object.freeze({
    refresh,
    getState: () => owns() ? JSON.parse(JSON.stringify(state)) : { folderPath: '', errors: [], files: [], activeFileMissing: false },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    install(input) {
      const pkg = validateCommunityThemePackage(input);
      return enqueue(async () => {
        await readFolder(); fence();
        await folder.importPackage(pkg); fence();
        const data = await readFolder(); fence();
        return data.installs.find(item => canonicalThemeJson(item.package) === canonicalThemeJson(pkg));
      });
    },
    openFolder: () => { fence(); return folder.openFolder(); },
    suspend() { disposed = true; hostWindow?.removeEventListener('focus', wake); listeners.clear(); folder.dispose(); },
  });
}
