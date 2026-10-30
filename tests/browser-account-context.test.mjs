import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperPath = new URL('../app/lib/browser-account-context.ts', import.meta.url);
const clientPath = new URL('../app/lib/supabase-browser.ts', import.meta.url);
const bootstrapPath = new URL('../../ALTARA/lib/browserAccountContext.js', import.meta.url);
const sdkPath = require.resolve('@supabase/supabase-js').replace(/[\\/]dist[\\/].*$/, '/dist/umd/supabase.js');
const PROJECT_URL = 'https://account-fixture.supabase.co';
const LEGACY_KEY = 'sb-account-fixture-auth-token';
const REGISTRY = '__altara_accounts_v1', HINT = '__altara_account_active_v1';
const SLOT_A = 'a1111111-1111-4111-8111-111111111111';
const SLOT_B = 'b2222222-2222-4222-8222-222222222222';
const physicalKey = slot => slot === 'default' ? LEGACY_KEY : `__altara_account_data:${slot}:${LEGACY_KEY}`;
const registry = (activeId = SLOT_A) => ({ version: 1, activeId, accounts: [
  { id: 'default', userId: 'default-display-metadata', signedIn: true },
  { id: SLOT_A, userId: 'landix-display-metadata', signedIn: true },
  { id: SLOT_B, userId: 'another-display-metadata', signedIn: true },
] });

class MemoryStorage {
  constructor(entries = []) { this.data = new Map(entries); this.reads = []; this.writes = []; this.removals = []; }
  getItem(key) { this.reads.push(String(key)); return this.data.get(String(key)) ?? null; }
  setItem(key, value) { this.writes.push([String(key), String(value)]); this.data.set(String(key), String(value)); }
  removeItem(key) { this.removals.push(String(key)); this.data.delete(String(key)); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  clear() { this.data.clear(); }
}

function loadTs(file, additions = {}) {
  const exports = {}, scope = { exports, URL, console, ...additions };
  const context = vm.createContext(scope);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInContext(compiled, context, { filename: file.pathname });
  return { exports, context };
}

function resolve(local, session, url = PROJECT_URL) {
  return loadTs(helperPath).exports.resolveBrowserAccountContext(url, local, session);
}

function stores({ data = registry(), hint, absent = false } = {}) {
  const local = new MemoryStorage(absent ? [] : [[REGISTRY, typeof data === 'string' ? data : JSON.stringify(data)]]);
  const session = new MemoryStorage(hint === undefined ? [] : [[HINT, hint]]);
  return { local, session };
}

function siteClient(window) {
  const clients = [], helper = loadTs(helperPath).exports;
  const loaded = loadTs(clientPath, {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-public-anon' } },
    ...(window === undefined ? {} : { window }),
    require(id) {
      if (id === '@supabase/supabase-js') return { createClient(url, key, options) {
        const client = { fixtureId: clients.length, url, key, options }; clients.push(client); return client;
      } };
      if (id.endsWith('/browser-account-context') || id === './browser-account-context') return helper;
      throw new Error('Unexpected client dependency');
    },
  });
  return { getClient: loaded.exports.getSupabaseBrowserClient, clients };
}

test('legacy browsers retain the exact default SDK storage key without reading or migrating sessions', () => {
  for (const hint of [undefined, 'default']) {
    const { local, session } = stores({ absent: true, hint });
    local.data.set(LEGACY_KEY, 'fixture-default-session');
    const before = [...local.data];
    const result = resolve(local, session);
    assert.equal(result.accountId, 'default'); assert.equal(result.storageKey, LEGACY_KEY);
    assert.deepEqual([...local.data], before); assert.deepEqual(local.reads, [REGISTRY]); assert.deepEqual(local.writes, []);
    assert.equal(session.data.get(HINT), 'default');
  }
});

test('registered tab selection wins over another tabs active account and is never repinned', () => {
  for (const slot of ['default', SLOT_A, SLOT_B]) {
    const { local, session } = stores({ data: registry(SLOT_B), hint: slot });
    const result = resolve(local, session);
    assert.equal(result.accountId, slot); assert.equal(result.storageKey, physicalKey(slot)); assert.deepEqual(session.writes, []);
  }
});

test('a new tab pins the registered active slot; later active changes do not switch that tab', () => {
  const { local, session } = stores();
  const first = resolve(local, session);
  assert.equal(first.accountId, SLOT_A); assert.deepEqual(session.writes, [[HINT, SLOT_A]]);
  local.data.set(REGISTRY, JSON.stringify(registry(SLOT_B)));
  const second = resolve(local, session);
  assert.equal(second.accountId, SLOT_A); assert.equal(second.storageKey, first.storageKey); assert.equal(session.writes.length, 1);
});

test('two independent browser slots select different physical SDK keys without token migration', () => {
  const { local } = stores({ data: registry() });
  for (const slot of ['default', SLOT_A, SLOT_B]) local.data.set(physicalKey(slot), `fixture-${slot}-session`);
  const before = [...local.data];
  const a = resolve(local, new MemoryStorage([[HINT, SLOT_A]]));
  const b = resolve(local, new MemoryStorage([[HINT, SLOT_B]]));
  assert.notEqual(a.storageKey, b.storageKey); assert.equal(local.data.get(a.storageKey), `fixture-${SLOT_A}-session`);
  assert.equal(local.data.get(b.storageKey), `fixture-${SLOT_B}-session`); assert.deepEqual([...local.data], before);
  assert(local.reads.every(key => key === REGISTRY)); assert.deepEqual(local.writes, []); assert.deepEqual(local.removals, []);
});

test('malformed, oversized, duplicate, unregistered or unsupported registries fail closed', () => {
  const invalid = ['{', 'null', '', 'x'.repeat(65537), { ...registry(), version: 2 }, { ...registry(), version: '1' },
    { ...registry(), accounts: [] }, { ...registry(), accounts: {} }, { ...registry(), accounts: [null] },
    { ...registry(), accounts: [{ id: 'default' }, { id: 'default' }] },
    { ...registry(), accounts: [{ id: SLOT_A.toUpperCase() }] },
    { ...registry(), accounts: [{ id: '../default' }] },
    { ...registry(), accounts: [{ id: '11111111-1111-1111-8111-111111111111' }] },
    { ...registry(), activeId: '33333333-3333-4333-8333-333333333333' },
    { ...registry(), accounts: ['default', SLOT_A, SLOT_B, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'].map(id => ({ id })) },
  ];
  for (const data of invalid) {
    const { local, session } = stores({ data, hint: 'default' });
    assert.equal(resolve(local, session), null, 'untrusted registry must not fall back to default');
    assert.deepEqual(session.writes, []); assert.deepEqual(local.writes, []);
  }
});

test('the registry size boundary rejects otherwise valid JSON without changing the selected tab', () => {
  const data = JSON.stringify(registry());
  const allowed = stores({ data: data.padEnd(65536, ' '), hint: SLOT_A });
  assert.equal(resolve(allowed.local, allowed.session).accountId, SLOT_A);
  const oversized = stores({ data: data.padEnd(65537, ' '), hint: SLOT_A });
  assert.equal(resolve(oversized.local, oversized.session), null); assert.deepEqual(oversized.session.writes, []);
});

test('invalid and stale tab hints fail closed even when another valid active account exists', () => {
  for (const hint of ['', '../default', SLOT_A.toUpperCase(), '33333333-3333-4333-8333-333333333333']) {
    const { local, session } = stores({ hint });
    assert.equal(resolve(local, session), null); assert.deepEqual(session.writes, []);
  }
  const absent = stores({ absent: true, hint: SLOT_A });
  assert.equal(resolve(absent.local, absent.session), null);
});

test('unreadable registry, unreadable pin and failed pin writes never expose the default session', () => {
  const throwing = { getItem() { throw new Error('fixture-storage-blocked'); }, setItem() { throw new Error('fixture-storage-blocked'); } };
  const normal = stores();
  assert.equal(resolve(throwing, normal.session), null);
  assert.equal(resolve(normal.local, throwing), null);
  assert.equal(resolve(normal.local, { getItem: () => null, setItem() { throw new Error('fixture-quota'); } }), null);
});

test('the project namespace follows the SDK hostname derivation, not paths or query parameters', () => {
  const { local, session } = stores({ hint: SLOT_A });
  assert.equal(resolve(local, session, 'https://other-project.supabase.co/custom?account=default').storageKey, `__altara_account_data:${SLOT_A}:sb-other-project-auth-token`);
});

test('SSR creates independent anonymous clients with persistence, refresh and URL session detection disabled', () => {
  const fixture = siteClient();
  const first = fixture.getClient(), second = fixture.getClient();
  assert.notEqual(first, second, 'SSR must not cache an account client between requests');
  for (const client of fixture.clients) {
    assert.equal(client.options.auth.persistSession, false); assert.equal(client.options.auth.autoRefreshToken, false); assert.equal(client.options.auth.detectSessionInUrl, false);
  }
});

test('the portal passes the physical storage key to the SDK and preserves browser storage and channel objects', () => {
  const { local, session } = stores({ hint: SLOT_A });
  class BroadcastChannel {}
  const window = { localStorage: local, sessionStorage: session, BroadcastChannel, location: { search: '?account=default' } };
  const fixture = siteClient(window), first = fixture.getClient();
  assert.equal(first.options.auth.storageKey, physicalKey(SLOT_A)); assert.equal(first.options.auth.persistSession, true);
  assert.equal(first.options.auth.autoRefreshToken, true); assert.equal(first.options.auth.detectSessionInUrl, true);
  local.data.set(REGISTRY, JSON.stringify(registry(SLOT_B)));
  assert.equal(fixture.getClient(), first); assert.equal(window.localStorage, local); assert.equal(window.sessionStorage, session); assert.equal(window.BroadcastChannel, BroadcastChannel);
  assert.equal(first.options.auth.storageKey, physicalKey(SLOT_A), 'another tab changing the active registry cannot switch an existing portal');
  assert.equal(local.data.has(LEGACY_KEY), false); assert.deepEqual(local.writes, []);
});

test('invalid browser context and inaccessible Storage getters create anonymous clients without URL token detection', () => {
  const badRegistry = stores({ data: '{', hint: 'default' });
  const inaccessible = {};
  Object.defineProperty(inaccessible, 'localStorage', { get() { throw new Error('fixture-browser-denied'); } });
  for (const window of [{ localStorage: badRegistry.local, sessionStorage: badRegistry.session }, inaccessible]) {
    const fixture = siteClient(window), client = fixture.getClient();
    assert.equal(client.options.auth.persistSession, false); assert.equal(client.options.auth.autoRefreshToken, false); assert.equal(client.options.auth.detectSessionInUrl, false);
    assert.notEqual(client.options.auth.storageKey, LEGACY_KEY, 'anonymous fallback must not bind the legacy account');
  }
});

function sdkRealm({ local, session, appBootstrap = false }) {
  const channelNames = [], fetchCalls = [], channels = [], lockCalls = [];
  class BroadcastChannel {
    constructor(name) { this.name = name; channelNames.push(name); channels.push(this); }
    addEventListener() {}
    postMessage() {}
    close() { this.closed = true; }
  }
  const scope = { URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, crypto: webcrypto,
    setTimeout, clearTimeout, setInterval, clearInterval, atob, btoa,
    console: { ...console, warn() {}, debug() {} },
    localStorage: local, sessionStorage: session, BroadcastChannel,
    WebSocket: class { constructor() { throw new Error('Real WebSockets are forbidden in this fixture'); } },
    navigator: { locks: { request(name, options, callback) {
      lockCalls.push(name); return Promise.resolve((typeof options === 'function' ? options : callback)({ name }));
    } } }, document: { baseURI: 'https://portal.example.invalid/app/index.html', visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    location: { href: 'https://portal.example.invalid/app/index.html', hash: '', search: '', replace() { throw new Error('Unexpected browser navigation'); } },
    addEventListener() {}, removeEventListener() {},
    fetch(...args) { fetchCalls.push(args); throw new Error('Real network is forbidden in this fixture'); },
  };
  scope.window = scope; scope.self = scope;
  const context = vm.createContext(scope);
  if (appBootstrap) vm.runInContext(fs.readFileSync(bootstrapPath, 'utf8'), context, { filename: 'actual-browserAccountContext.js' });
  vm.runInContext(fs.readFileSync(sdkPath, 'utf8'), context, { filename: 'actual-supabase-sdk-umd.js' });
  return { scope, fetchCalls, channelNames, channels, lockCalls, makeClient(storageKey) {
    return scope.supabase.createClient(PROJECT_URL, 'fixture-public-anon', { auth: {
      ...(storageKey === undefined ? {} : { storageKey }), persistSession: true, autoRefreshToken: false,
      detectSessionInUrl: false, skipAutoInitialize: true, flowType: 'pkce',
    } });
  } };
}

test('actual SDK BroadcastChannel and PKCE keys match the actual app bootstrap for default and two isolated slots', async () => {
  for (const slot of ['default', SLOT_A, SLOT_B]) {
    const { local, session } = stores({ data: registry(SLOT_B), hint: slot });
    local.data.set(LEGACY_KEY, 'fixture-default-session-must-stay');
    const app = sdkRealm({ local, session, appBootstrap: true });
    const appClient = app.makeClient();
    const portalSession = new MemoryStorage([[HINT, slot]]);
    const selected = resolve(local, portalSession);
    const portal = sdkRealm({ local, session: portalSession });
    const portalClient = portal.makeClient(selected.storageKey);
    try {
      assert.deepEqual(app.channelNames, [physicalKey(slot)]); assert.deepEqual(portal.channelNames, app.channelNames);
      const oauth = { provider: 'github', options: { skipBrowserRedirect: true, redirectTo: 'https://portal.example.invalid/callback' } };
      const appResult = await appClient.auth.signInWithOAuth(oauth);
      assert.equal(appResult.error, null); assert.equal(typeof local.data.get(physicalKey(slot) + '-code-verifier'), 'string');
      const verifierFromApp = local.data.get(physicalKey(slot) + '-code-verifier');
      const portalResult = await portalClient.auth.signInWithOAuth(oauth);
      assert.equal(portalResult.error, null); assert.equal(typeof local.data.get(physicalKey(slot) + '-code-verifier'), 'string');
      assert.notEqual(local.data.get(physicalKey(slot) + '-code-verifier'), verifierFromApp, 'both SDK instances must address the same physical verifier key');
      if (slot !== 'default') assert.equal(local.data.has(LEGACY_KEY + '-code-verifier'), false);
      assert.equal(local.data.get(LEGACY_KEY), 'fixture-default-session-must-stay');
      assert.equal(app.fetchCalls.length, 0); assert.equal(portal.fetchCalls.length, 0);
      assert.deepEqual(app.lockCalls, []); assert.deepEqual(portal.lockCalls, []);
    } finally { await appClient.auth.dispose(); await portalClient.auth.dispose(); }
  }
});

test('the installed SDK does not implicitly acquire Web Locks for default or isolated account reads', async () => {
  for (const slot of ['default', SLOT_A, SLOT_B]) {
    for (const appBootstrap of [false, true]) {
      const { local, session } = stores({ hint: slot });
      const realm = sdkRealm({ local, session, appBootstrap });
      const client = realm.makeClient(appBootstrap ? undefined : physicalKey(slot));
      try {
        const result = await client.auth.getSession();
        assert.equal(result.error, null); assert.equal(result.data.session, null);
        assert.deepEqual(realm.lockCalls, [], 'the SDK uses its default lockless coordination; no custom lock is introduced');
        assert.equal(realm.fetchCalls.length, 0);
      } finally { await client.auth.dispose(); }
    }
  }
});
