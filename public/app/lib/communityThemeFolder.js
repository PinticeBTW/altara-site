import { validateCommunityThemePackage, COMMUNITY_THEME_LIMITS } from './communityThemePackages.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
function failure(code) { const error = new Error(code); error.code = code; return error; }

export function getCommunityThemeFolderBridge() {
  const bridge = globalThis.window?.altaraDesktop?.themes;
  return bridge && ['list', 'importPackage', 'openFolder'].every(key => typeof bridge[key] === 'function') ? bridge : null;
}

export function createCommunityThemeFolder({ bridge = getCommunityThemeFolderBridge(), ownerId, getActor } = {}) {
  const owner = typeof ownerId === 'string' ? ownerId.toLowerCase() : '';
  if (!UUID.test(owner) || !bridge || ['list', 'importPackage', 'openFolder'].some(key => typeof bridge[key] !== 'function'))
    throw failure('THEME_FOLDER_UNAVAILABLE');
  let disposed = false;
  const owns = () => !disposed && String(getActor?.() || '').toLowerCase() === owner;
  const fence = () => { if (!owns()) throw failure('THEME_ACCOUNT_CHANGED'); };

  async function entry(value) {
    if (!value || typeof value.fileName !== 'string' || value.fileName.length > 180
      || !value.fileName.endsWith('.altara-theme.json') || /[\u0000-\u001f\u007f/\\]/.test(value.fileName)
      || !/^[a-f0-9]{64}$/.test(value.sha256 || '') || typeof value.packageText !== 'string'
      || encoder.encode(value.packageText).byteLength > COMMUNITY_THEME_LIMITS.packageV2Bytes) throw failure('THEME_FOLDER_INVALID_RESPONSE');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value.packageText));
    fence();
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (sha256 !== value.sha256) throw failure('THEME_FOLDER_INVALID_RESPONSE');
    const packageData = validateCommunityThemePackage(value.packageText);
    fence();
    return { fileName: value.fileName, sha256, packageText: value.packageText, package: packageData };
  }
  const folderPath = value => {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw failure('THEME_FOLDER_INVALID_RESPONSE');
    return value;
  };
  return Object.freeze({
    owns,
    async list() {
      fence();
      const response = await bridge.list({ ownerId: owner });
      fence();
      if (!response || !Array.isArray(response.entries) || response.entries.length > COMMUNITY_THEME_LIMITS.installs
        || !Array.isArray(response.errors) || response.errors.length > COMMUNITY_THEME_LIMITS.installs
        || response.entries.reduce((sum, value) => sum + (typeof value?.packageText === 'string' ? encoder.encode(value.packageText).byteLength : COMMUNITY_THEME_LIMITS.libraryBytes), 0) > COMMUNITY_THEME_LIMITS.libraryBytes)
        throw failure('THEME_FOLDER_INVALID_RESPONSE');
      const entries = [];
      const names = new Set();
      for (const value of response.entries) {
        if (names.has(value?.fileName)) throw failure('THEME_FOLDER_INVALID_RESPONSE');
        names.add(value?.fileName);
        entries.push(await entry(value));
      }
      fence();
      return { folderPath: folderPath(response.folderPath), entries, errors: response.errors.map(value => ({
        fileName: typeof value?.fileName === 'string' ? value.fileName.slice(0, 180) : '',
        code: /^THEME_[A-Z_]+$/.test(value?.code || '') ? value.code : 'THEME_FILE_UNAVAILABLE',
      })) };
    },
    async importPackage(input) {
      fence();
      const packageData = validateCommunityThemePackage(input);
      const packageText = JSON.stringify(packageData);
      const response = await bridge.importPackage({ ownerId: owner, packageText });
      fence();
      if (!response || typeof response.unchanged !== 'boolean') throw failure('THEME_FOLDER_INVALID_RESPONSE');
      const imported = await entry(response.entry);
      if (imported.packageText !== packageText) throw failure('THEME_FOLDER_INVALID_RESPONSE');
      fence();
      return { folderPath: folderPath(response.folderPath), entry: imported, unchanged: response.unchanged };
    },
    async openFolder() {
      fence();
      const response = await bridge.openFolder({ ownerId: owner });
      fence();
      if (response?.ok !== true) throw failure('THEME_FOLDER_OPEN_FAILED');
      return { ok: true, folderPath: folderPath(response.folderPath) };
    },
    dispose() { disposed = true; },
  });
}
