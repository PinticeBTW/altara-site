export const WIDGET_SDK_VERSION = 1;
export const MAX_WIDGET_CODE = 65536;
export function validateWidgetPackage(input) {
  if (input?.kind === 'hosted') return validateHostedWidget(input, { development: true });
  if (!input || typeof input !== 'object' || input.sdkVersion !== 1) throw new Error('This widget needs SDK version 1.');
  const text = (value, max, label) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is missing or too long.`);
    return value.trim();
  };
  const name = text(input.name, 60, 'Name');
  const description = text(input.description, 240, 'Description');
  const version = text(input.version, 32, 'Version');
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error('Use a version such as 1.0.0.');
  const code = text(input.code, MAX_WIDGET_CODE, 'Code');
  return { sdkVersion: 1, name, description, version, code };
}

export const STARTER_WIDGET = Object.freeze({
  sdkVersion: 1, name: 'Daily counter', version: '1.0.0',
  description: 'A small counter for your daily progress.',
  code: `// ALTARA Widget SDK v1 — JavaScript, no dependencies.
let count = Number(altara.storage.get('count')) || 0;
function draw() {
  altara.render({type: 'column', children: [
    {type: 'text', text: 'Make a little progress today', tone: 'muted'},
    {type: 'stat', text: String(count)},
    {type: 'row', children: [
      {type: 'button', text: '+1', action: 'increment'},
      {type: 'button', text: 'Reset', action: 'reset'}
    ]}
  ]});
}
altara.onAction(action => {
  count = action === 'increment' ? count + 1 : 0;
  altara.storage.set('count', count);
  draw();
});
draw();`
});

// Account-scoped local drafts and pinned installs. Imported metadata never selects
// storage identities, publisher identities or an existing install to overwrite.
export function createWidgetLibrary(storage, userId) {
  const key = `altara:widget-library:v1:${userId}`;
  function read() {
    try {
      const value = JSON.parse(storage.getItem(key) || '{}');
      return { drafts: Array.isArray(value.drafts) ? value.drafts.slice(0, 40) : [], installs: Array.isArray(value.installs) ? value.installs.slice(0, 60) : [] };
    } catch { return { drafts: [], installs: [] }; }
  }
  function save(data) { storage.setItem(key, JSON.stringify(data)); }
  function consentSignature(pkg) { const safe = validateWidgetPackage(pkg); return JSON.stringify(safe.snapshot_html ? { ...safe, snapshot_html: undefined } : safe); }
  return {
    read,
    applyAccount(row) {
      const data = read();
      const index = data.installs.findIndex(item => item.accountId === row.id || (!item.accountId && item.package?.manifest_url === row.package.manifest_url));
      const previous = data.installs[index];
      if (!row.active) {
        if (previous) { data.installs.splice(index, 1); save(data); storage.removeItem(`${key}:state:${previous.id}`); storage.removeItem(`${key}:consent:${previous.id}`); }
        return null;
      }
      const item = { id: previous?.id || `custom-${row.id}`, accountId: row.id, sourceId: row.source_id || '', disabled: row.disabled === true, package: validateWidgetPackage(row.package) };
      if (index >= 0) data.installs[index] = item; else data.installs.push(item);
      save(data); return item;
    },
    reconcileAccount(rows) {
      const before = JSON.stringify(read().installs);
      for (const row of rows) this.applyAccount(row);
      const ids = new Set(rows.filter(row => row.active).map(row => row.id));
      for (const item of read().installs) if (item.accountId && !ids.has(item.accountId)) this.remove(item.id);
      return before !== JSON.stringify(read().installs);
    },
    saveDraft(pkg, id) {
      const data = read(), item = { id: id || crypto.randomUUID(), package: validateWidgetPackage(pkg) };
      const index = data.drafts.findIndex(row => row.id === item.id);
      if (index >= 0) data.drafts[index] = item;
      else { if (data.drafts.length >= 40) throw new Error('You can keep up to 40 local drafts.'); data.drafts.push(item); }
      save(data); return item;
    },
    install(pkg, sourceId = '') {
      const data = read();
      if (data.installs.length >= 30) throw new Error('You can install up to 30 community widgets.');
      const item = { id: `custom-${crypto.randomUUID()}`, package: validateWidgetPackage(pkg), sourceId };
      data.installs.push(item); save(data); return item;
    },
    remove(id) { const data = read(); data.installs = data.installs.filter(row => row.id !== id); save(data); storage.removeItem(`${key}:state:${id}`); storage.removeItem(`${key}:consent:${id}`); },
    hasConsent(item) { return storage.getItem(`${key}:consent:${item.id}`) === consentSignature(item.package); },
    setConsent(item, allowed) {
      if (allowed) storage.setItem(`${key}:consent:${item.id}`, consentSignature(item.package));
      else storage.removeItem(`${key}:consent:${item.id}`);
    },
    removeDraft(id) { const data = read(); data.drafts = data.drafts.filter(row => row.id !== id); save(data); },
    readState(id) { try { return JSON.parse(storage.getItem(`${key}:state:${id}`) || '{}'); } catch { return {}; } },
    writeState(id, state) {
      const value = JSON.stringify(state);
      if (value.length > 16384) throw new Error('Widget storage is full (16 KB).');
      storage.setItem(`${key}:state:${id}`, value);
    }
  };
}
import { validateHostedWidget } from './widgetHosted.js';
