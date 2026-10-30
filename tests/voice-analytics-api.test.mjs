import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const PROJECT = 'https://tbbgwjmmaiclkhssimhf.supabase.co';
const USER = 'a3a0db58-eb4d-4563-9efc-7d2171d12341';
const GENERATION = 'c5ae316f-235d-4c8f-ace5-502fdd06bd05';
const SERVER = '11111111-1111-4111-8111-111111111111';
const CHANNEL = '22222222-2222-4222-8222-222222222222';
const ROOM = `server-voice-v3:${SERVER}:voice:${CHANNEL}`;
const TOKEN = 'fixture-auth-token-000000000000000000000';
const SENSITIVE = 'fixture-sensitive-value-must-never-cross-boundary';
const files = {
  model: new URL('../app/lib/voice-analytics-model.ts', import.meta.url),
  server: new URL('../app/lib/server/voice-analytics.ts', import.meta.url),
  route: new URL('../app/api/admin/voice/route.ts', import.meta.url),
};

function load(file, imports, additions = {}) {
  const exports = {};
  const context = vm.createContext({
    exports, URL, URLSearchParams, Headers, Request, Response, AbortSignal,
    console, setTimeout, clearTimeout,
    require(name) {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    ...additions,
  });
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInContext(compiled, context, { filename: file.pathname });
  return exports;
}

function fixture(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const calls = [];
  const config = {
    user: { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false },
    authError: null, owner: true, rpcError: null,
    rooms: [{ sid: 'RM_fixture', name: ROOM, creationTime: BigInt(now - 120), numParticipants: 1, metadata: SENSITIVE }],
    participants: [{ sid: 'PA_fixture', identity: `sv2:${USER}:${GENERATION}`, state: 2, joinedAt: BigInt(now - 60), metadata: SENSITIVE, location: SENSITIVE }],
    tables: {
      profiles: [{ id: USER, username: 'fixture-user', display_name: 'Fixture User',
        avatar_url: `${PROJECT}/storage/v1/object/public/avatars/fixture.webp?v=2`,
        email: SENSITIVE, access_token: SENSITIVE, private_notes: SENSITIVE }],
      servers: [{ id: SERVER, name: 'Fixture server', private_notes: SENSITIVE }],
      server_channels: [{ id: CHANNEL, server_id: SERVER, conversation_id: GENERATION, name: 'Fixture voice', private_notes: SENSITIVE }],
    },
    cloudStatus: 200, cloudRoutes: {}, cloudDelay: 0,
    cloudBody: { sessions: [] },
    ...overrides,
  };
  const env = {
    SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'fixture-public-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-server-only',
    LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'fixture-livekit-key',
    LIVEKIT_API_SECRET: 'fixture-livekit-server-only', LIVEKIT_PROJECT_ID: 'p_fixtureproject',
  };
  const createClient = (url, key, options) => {
    const privileged = key === env.SUPABASE_SERVICE_ROLE_KEY;
    calls.push({ op: privileged ? 'create:service' : 'create:auth', url, key, options });
    if (!privileged) return {
      auth: { async getUser(token) { calls.push({ op: 'auth:getUser', token }); return { data: { user: config.user }, error: config.authError }; } },
      async rpc(name) { calls.push({ op: 'auth:rpc', name }); return { data: config.owner, error: config.rpcError }; },
    };
    return { from(table) {
      return { select(columns) { return { async in(column, ids) {
        calls.push({ op: 'db:select', table, columns, column, ids });
        return { data: (config.tables[table] || []).filter(row => ids.includes(row[column])), error: null };
      } }; } };
    } };
  };
  class RoomServiceClient {
    constructor(url, key, secret, options) { calls.push({ op: 'provider:create', url, key, secret, options }); }
    async listRooms() {
      calls.push({ op: 'provider:listRooms' });
      if (config.roomsError) throw new Error(config.roomsError);
      return config.rooms;
    }
    async listParticipants(room) {
      calls.push({ op: 'provider:listParticipants', room });
      if (config.participantsError) throw new Error(config.participantsError);
      return config.participants;
    }
  }
  class AccessToken {
    constructor(key, secret, options) { calls.push({ op: 'provider:token', key, secret, options }); }
    addGrant(grant) { calls.push({ op: 'provider:grant', grant }); }
    async toJwt() { return 'fixture-provider-jwt'; }
  }
  let activeCloudRequests = 0, maximumCloudRequests = 0;
  async function fetch(url, options) {
    const address = String(url);
    assert.ok(address.startsWith('https://cloud-api.livekit.io/api/project/p_fixtureproject/sessions'), 'fixture forbids all other network destinations');
    calls.push({ op: 'provider:fetch', url: address, options });
    if (config.cloudTransportFailures > 0) { config.cloudTransportFailures--; throw new TypeError('fixture transport failure'); }
    const path = new URL(address).pathname;
    const id = path.includes('/sessions/') ? path.split('/').at(-1) : 'list';
    const reply = config.cloudRoutes[id] || { body: config.cloudBody, status: config.cloudStatus };
    activeCloudRequests++;
    maximumCloudRequests = Math.max(maximumCloudRequests, activeCloudRequests);
    try {
      if (config.cloudDelay) await new Promise(resolve => setTimeout(resolve, config.cloudDelay));
      return Response.json(reply.body, { status: reply.status ?? 200 });
    } finally { activeCloudRequests--; }
  }
  const model = load(files.model, {});
  const server = load(files.server, {
    'server-only': {}, '@supabase/supabase-js': { createClient },
    'livekit-server-sdk': { RoomServiceClient, AccessToken }, '../voice-analytics-model': model,
  }, { process: { env }, fetch });
  const route = load(files.route, { '../../../lib/server/voice-analytics': server });
  return {
    calls, config, env, server, route,
    get maximumCloudRequests() { return maximumCloudRequests; },
    request(query = '', authorization = `Bearer ${TOKEN}`) {
      const headers = authorization === null ? {} : { authorization };
      return route.GET(new Request(`https://altara.example.invalid/api/admin/voice${query}`, { headers }));
    },
  };
}

const operations = f => f.calls.map(call => call.op);
function assertNoPrivilegedWork(f) {
  assert.equal(f.calls.some(call => call.op === 'create:service' || call.op.startsWith('provider:') || call.op.startsWith('db:')), false);
}
function privateHeaders(response) {
  assert.match(response.headers.get('cache-control'), /private/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('vary'), /authorization/i);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
}

test('voice route uses the server handler and an explicitly dynamic Node runtime', () => {
  const f = fixture();
  assert.equal(f.route.GET, f.server.handleVoiceAnalytics);
  assert.equal(f.route.runtime, 'nodejs');
  assert.equal(f.route.dynamic, 'force-dynamic');
});

test('missing or malformed bearer credentials fail before constructing any client', async () => {
  for (const authorization of [null, '', 'Basic fixture', 'Bearer tiny', 'Bearer fixture token with spaces']) {
    const f = fixture();
    const response = await f.request('', authorization);
    assert.equal(response.status, 401);
    privateHeaders(response);
    assert.equal(f.calls.length, 0);
  }
});

test('invalid authenticated user returns 401 without service or provider access', async () => {
  const f = fixture({ user: null, authError: { status: 401, message: SENSITIVE } });
  const response = await f.request();
  assert.equal(response.status, 401);
  assertNoPrivilegedWork(f);
  assert.equal(operations(f).includes('auth:rpc'), false);
  assert.equal((await response.text()).includes(SENSITIVE), false);
});

test('normal users cannot forge administrative authority using editable metadata', async () => {
  const f = fixture({ owner: false, user: {
    id: USER, email_confirmed_at: '2026-01-01T00:00:00Z',
    user_metadata: { is_admin: true, admin: true, role: 'admin', is_reports_owner: true },
  } });
  const response = await f.request();
  assert.equal(response.status, 403);
  assertNoPrivilegedWork(f);
  assert.deepEqual(f.calls.filter(call => call.op === 'auth:rpc').map(call => call.name), ['is_reports_owner']);
});

test('missing private configuration is explained only after real administrator authorization', async () => {
  const allowed = fixture();
  delete allowed.env.SUPABASE_SERVICE_ROLE_KEY;
  delete allowed.env.LIVEKIT_API_SECRET;
  const response = await allowed.request();
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, 'configuration_missing');
  assert.match(payload.message, /acesso de administrador está confirmado/);
  assert.match(payload.message, /Supabase e LiveKit/);
  assert.ok(operations(allowed).includes('auth:rpc'));
  assertNoPrivilegedWork(allowed);

  const denied = fixture({ owner: false });
  delete denied.env.SUPABASE_SERVICE_ROLE_KEY;
  delete denied.env.LIVEKIT_API_SECRET;
  const deniedResponse = await denied.request();
  assert.equal(deniedResponse.status, 403);
  assert.equal((await deniedResponse.text()).includes('configuração privada'), false);
  assertNoPrivilegedWork(denied);

  const currentOnly = fixture();
  delete currentOnly.env.LIVEKIT_PROJECT_ID;
  assert.equal((await currentOnly.request()).status, 200, 'current rooms do not need the analytics project ID');
  const historyResponse = await currentOnly.request('?view=history');
  assert.equal(historyResponse.status, 503);
  assert.match((await historyResponse.json()).message, /LiveKit/);
});

test('owner RPC errors and non-boolean authority values fail closed', async () => {
  for (const overrides of [{ rpcError: { message: SENSITIVE } }, { owner: 'true' }, { owner: 1 }, { owner: null }]) {
    const f = fixture(overrides);
    const response = await f.request();
    assert.equal(response.status, overrides.rpcError ? 503 : 403);
    assertNoPrivilegedWork(f);
    assert.equal((await response.text()).includes(SENSITIVE), false);
  }
});

test('unconfirmed and anonymous accounts cannot access admin analytics even with owner RPC success', async () => {
  for (const user of [
    { id: USER, email_confirmed_at: null },
    { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: true },
  ]) {
    const f = fixture({ user });
    assert.equal((await f.request()).status, 403);
    assertNoPrivilegedWork(f);
    assert.equal(operations(f).includes('auth:rpc'), false);
  }
});

test('authorization precedes all service/provider access, and revocation bypasses a warm data cache', async () => {
  const f = fixture();
  const first = await f.request();
  assert.equal(first.status, 200);
  privateHeaders(first);
  const ops = operations(f);
  assert.ok(ops.indexOf('auth:getUser') < ops.indexOf('auth:rpc'));
  assert.ok(ops.indexOf('auth:rpc') < ops.indexOf('create:service'));
  assert.ok(ops.indexOf('create:service') < ops.indexOf('provider:create'));
  const providerCalls = f.calls.filter(call => call.op.startsWith('provider:')).length;
  f.config.owner = false;
  const revoked = await f.request();
  assert.equal(revoked.status, 403);
  assert.equal(f.calls.filter(call => call.op.startsWith('provider:')).length, providerCalls);
  assert.equal(f.calls.filter(call => call.op === 'auth:getUser').length, 2);
  assert.equal(f.calls.filter(call => call.op === 'auth:rpc').length, 2);
  assert.equal(f.calls.filter(call => call.op === 'create:service').length, 1);
});

test('live DTO resolves profiles selectively and never returns provider metadata or credentials', async () => {
  const f = fixture();
  const response = await f.request();
  assert.equal(response.status, 200);
  const body = await response.json();
  const session = body.sessions[0];
  assert.equal(session.serverName, 'Fixture server');
  assert.equal(session.channelName, 'Fixture voice');
  assert.equal(session.uniqueUsers, 1);
  assert.equal(session.participants[0].userId, USER);
  assert.equal(session.participants[0].username, 'fixture-user');
  assert.equal(session.participants[0].displayName, 'Fixture User');
  assert.equal(session.participants[0].avatarUrl, `${PROJECT}/storage/v1/object/public/avatars/fixture.webp?v=2`);
  const selections = f.calls.filter(call => call.op === 'db:select');
  assert.equal(selections.find(call => call.table === 'profiles').columns, 'id,username,display_name,avatar_url');
  const serialized = JSON.stringify(body);
  for (const forbidden of [SENSITIVE, ...Object.values(f.env).filter(value => /server-only|livekit-key/.test(value)), 'access_token', 'private_notes', 'metadata', 'location']) {
    assert.equal(serialized.includes(forbidden), false, `must not expose ${forbidden}`);
  }
});

test('provider SDK errors are redacted without exposing upstream details', async () => {
  const f = fixture({ roomsError: `provider failed ${SENSITIVE} https://private.example.invalid/path` });
  const response = await f.request();
  assert.equal(response.status, 502);
  privateHeaders(response);
  const body = await response.json();
  assert.equal(body.error, 'voice_unavailable');
  assert.equal(JSON.stringify(body).includes(SENSITIVE), false);
  assert.equal(JSON.stringify(body).includes('private.example.invalid'), false);
});

test('invalid history dates, pages, session IDs and views never reach a privileged client or provider', async () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const query of [
    '?view=history&start=2000-01-01', '?view=history&start=2026-02-30',
    '?view=history&start=not-a-date', '?view=history&end=2999-01-01',
    `?view=history&start=${today}&end=2000-01-01`,
    '?view=history&page=-1', '?view=history&page=1.5', '?view=history&page=1000',
    '?view=usage&start=2000-01-01', '?view=usage&page=1000',
    '?view=session', '?view=session&id=..%2Fadmin', '?view=session&id=a%3Fb', '?view=unknown',
  ]) {
    const f = fixture();
    const response = await f.request(query);
    assert.equal(response.status, 400, query);
    privateHeaders(response);
    assertNoPrivilegedWork(f);
    assert.equal(operations(f).includes('auth:rpc'), true, 'authorization must still protect invalid queries');
  }
});

test('unavailable Scale history explains the limitation while current rooms remain usable', async () => {
  const f = fixture({ cloudStatus: 403, cloudBody: { error: SENSITIVE } });
  const response = await f.request('?view=history');
  assert.equal(response.status, 503);
  privateHeaders(response);
  const body = await response.json();
  assert.equal(body.error, 'history_unavailable');
  assert.match(body.message, /Scale/);
  assert.equal(JSON.stringify(body).includes(SENSITIVE), false);
  const grant = f.calls.find(call => call.op === 'provider:grant').grant;
  assert.equal(grant.roomList, true);
  assert.deepEqual(Object.keys(grant), ['roomList']);
  assert.equal((await f.request('?view=live')).status, 200);
});

test('historical detail strips device/location fields and enriches only the operational DTO', async () => {
  const f = fixture({ cloudBody: {
    roomId: 'RM_fixture', roomName: ROOM, startTime: '2026-10-28T12:00:00Z', endTime: '2026-10-28T12:10:00Z',
    connectionMinutes: 11, numParticipants: 1, apiKey: SENSITIVE, metadata: SENSITIVE,
    participants: [{ participantIdentity: `sv2:${USER}:${GENERATION}`, participantName: SENSITIVE,
      joinedAt: '2026-10-28T12:00:00Z', leftAt: '2026-10-28T12:10:00Z',
      deviceModel: SENSITIVE, os: SENSITIVE, browser: SENSITIVE, location: SENSITIVE, region: SENSITIVE,
      sessions: [{ participantId: 'PA_fixture', joinedAt: '2026-10-28T12:00:00Z', leftAt: '2026-10-28T12:10:00Z' }],
    }],
  } });
  const response = await f.request('?view=session&id=RM_fixture');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session.participants[0].username, 'fixture-user');
  assert.equal(body.session.billableMinutes, 11);
  assert.equal(JSON.stringify(body).includes(SENSITIVE), false);
  for (const key of ['deviceModel', 'os', 'browser', 'location', 'region', 'sessions']) {
    assert.equal(Object.hasOwn(body.session.participants[0], key), false);
  }
});

test('avatars allow local defaults and public ALTARA storage without tracking or signed/private links', () => {
  const { safeAvatar } = fixture().server;
  assert.equal(safeAvatar('assets/default-avatars/avatar-1.webp'), '/app/assets/default-avatars/avatar-1.webp');
  assert.equal(safeAvatar(`${PROJECT}/storage/v1/object/public/avatars/fixture.webp?v=2`), `${PROJECT}/storage/v1/object/public/avatars/fixture.webp?v=2`);
  for (const value of [
    'https://tracker.example.invalid/avatar.png', 'http://127.0.0.1/avatar.png',
    `${PROJECT}/storage/v1/object/sign/avatars/fixture.webp?token=private`,
    `${PROJECT}/storage/v1/object/authenticated/avatars/fixture.webp`,
    `${PROJECT}/storage/v1/object/public/avatars/fixture.webp?token=private`,
    `${PROJECT}/storage/v1/object/public/avatars/fixture.webp#private`,
    'javascript:alert(1)', 'data:image/png;base64,AAAA', '//tracker.example.invalid/avatar.png',
    '../assets/default-avatars/fixture.png', `${PROJECT}/storage\\v1/avatar.png`,
  ]) assert.equal(safeAvatar(value), null, String(value));
});

function historyFixtures(count) {
  const ended = Math.floor(Date.now() / 1000) * 1000 - 60_000;
  const start = new Date(ended - 600_000).toISOString(), end = new Date(ended).toISOString();
  const sessions = Array.from({ length: count }, (_, index) => ({
    sessionId: `RM_usage_${index}`, roomName: ROOM, createdAt: start, endedAt: end, numParticipants: 1,
  }));
  const cloudRoutes = Object.fromEntries(sessions.map(row => [row.sessionId, { status: 200, body: {
    roomId: row.sessionId, roomName: ROOM, startTime: start, endTime: end,
    connectionMinutes: 12, numParticipants: 1,
    participants: [{ participantIdentity: `sv2:${USER}:${GENERATION}`, joinedAt: start, leftAt: end,
      sessions: [{ participantId: `PA_${row.sessionId}`, joinedAt: start, leftAt: end }],
      metadata: SENSITIVE, location: SENSITIVE,
    }],
  } }]));
  return { cloudBody: { sessions }, cloudRoutes };
}

test('normal history listing never fetches details or presents uncomputed connection totals', async () => {
  const f = fixture(historyFixtures(3));
  const response = await f.request('?view=history');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions.length, 3);
  assert.equal(body.partial, false);
  assert.equal(body.sessions.every(session => session.connectedSeconds === null && session.uniqueUsers === null), true);
  const providerFetches = f.calls.filter(call => call.op === 'provider:fetch');
  assert.equal(providerFetches.length, 1);
  const upstream = new URL(providerFetches[0].url);
  assert.equal(upstream.pathname.endsWith('/sessions'), true);
  assert.equal(upstream.searchParams.get('limit'), '25');
  assert.equal(upstream.searchParams.get('page'), '0');
});

test('explicit usage computes page metrics with bounded concurrency and reuses normalized detail cache', async () => {
  const f = fixture({ ...historyFixtures(8), cloudDelay: 2 });
  const response = await f.request('?view=usage');
  assert.equal(response.status, 200);
  privateHeaders(response);
  const body = await response.json();
  assert.equal(body.partial, false);
  assert.equal(body.sessions.length, 8);
  assert.equal(body.sessions.reduce((total, session) => total + session.connectedSeconds, 0), 4_800);
  assert.equal(body.sessions.reduce((total, session) => total + session.billableMinutes, 0), 96);
  assert.equal(body.sessions.every(session => session.uniqueUsers === 1), true);
  assert.equal(body.sessions.every(session => session.participants[0].username === 'fixture-user'), true);
  assert.equal(JSON.stringify(body).includes(SENSITIVE), false);
  assert.ok(f.maximumCloudRequests > 1, 'details may run concurrently');
  assert.ok(f.maximumCloudRequests <= 5, 'provider concurrency is limited to five');
  assert.equal(f.calls.filter(call => call.op === 'provider:fetch').length, 9);
  assert.equal(f.calls.filter(call => call.op === 'db:select' && call.table === 'profiles').length, 1, 'profiles are enriched once in a final batch');

  const detailResponse = await f.request('?view=session&id=RM_usage_0');
  assert.equal(detailResponse.status, 200);
  assert.equal((await detailResponse.json()).session.connectedSeconds, 600);
  assert.equal(f.calls.filter(call => call.op === 'provider:fetch').length, 9, 'opening a calculated session must reuse its normalized detail');
  assert.equal(f.calls.filter(call => call.op === 'auth:rpc').length, 2, 'cache hits still require fresh authorization');
});

test('usage marks failed session details partial and preserves unavailable totals as null', async () => {
  const data = historyFixtures(3);
  data.cloudRoutes.RM_usage_1 = { status: 500, body: { error: SENSITIVE } };
  const f = fixture(data);
  const response = await f.request('?view=usage');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.partial, true);
  assert.equal(typeof body.warning, 'string');
  assert.equal(body.sessions[0].connectedSeconds, 600);
  assert.equal(body.sessions[1].connectedSeconds, null);
  assert.equal(body.sessions[1].uniqueUsers, null);
  assert.equal(body.sessions[2].connectedSeconds, 600);
  assert.equal(JSON.stringify(body).includes(SENSITIVE), false);
});

test('a disappearing room or participant lookup failure remains explicitly partial instead of a false empty result', async () => {
  const f = fixture({ participantsError: `room disappeared ${SENSITIVE}` });
  const response = await f.request();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.partial, true);
  assert.equal(body.sessions.length, 1);
  assert.equal(body.sessions[0].status, 'unknown');
  assert.equal(body.sessions[0].uniqueUsers, null);
  assert.equal(body.sessions[0].connectedSeconds, null);
  assert.equal(body.sessions[0].participantCount, f.config.rooms[0].numParticipants, 'a failed lookup preserves the provider-reported connection count');
  assert.equal(f.calls.find(call => call.op === 'provider:create').options.failover, true, 'use the SDK native bounded region recovery');
  assert.equal(JSON.stringify(body).includes(SENSITIVE), false);
});

test('transient read failures retry once without replaying POST, cancellation or HTTP authorization errors', async () => {
  const f = fixture({ cloudTransportFailures: 1 });
  assert.equal((await f.request('?view=history')).status, 200);
  assert.equal(f.calls.filter(call => call.op === 'provider:fetch').length, 2);
  const fetcher = f.calls.find(call => call.op === 'create:auth').options.global.fetch;
  const address = 'https://cloud-api.livekit.io/api/project/p_fixtureproject/sessions';

  f.config.cloudTransportFailures = 2;
  let previous = f.calls.filter(call => call.op === 'provider:fetch').length;
  await assert.rejects(fetcher(address, { method: 'POST' }), /fixture transport failure/);
  assert.equal(f.calls.filter(call => call.op === 'provider:fetch').length - previous, 1);

  f.config.cloudTransportFailures = 2;
  previous = f.calls.filter(call => call.op === 'provider:fetch').length;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetcher(address, { signal: controller.signal }), /fixture transport failure/);
  assert.equal(f.calls.filter(call => call.op === 'provider:fetch').length - previous, 1);

  f.config.cloudTransportFailures = 0;
  f.config.cloudStatus = 401;
  previous = f.calls.filter(call => call.op === 'provider:fetch').length;
  assert.equal((await fetcher(address)).status, 401);
  assert.equal(f.calls.filter(call => call.op === 'provider:fetch').length - previous, 1);
});

test('LiveKit URL configuration rejects private hosts, credentials and redirects before provider access', async () => {
  for (const url of [
    'http://127.0.0.1', 'https://127.0.0.1', 'wss://localhost',
    'https://fixture.livekit.cloud.evil.invalid',
    'https://username:password@fixture.livekit.cloud', 'https://fixture.livekit.cloud:8443',
    'https://fixture.livekit.cloud/path', 'https://fixture.livekit.cloud?redirect=http://127.0.0.1',
  ]) {
    const f = fixture();
    f.env.LIVEKIT_URL = url;
    const response = await f.request();
    assert.equal(response.status, 503, url);
    const body = await response.json();
    assert.equal(body.error, 'configuration_invalid');
    assert.equal(f.calls.some(call => call.op.startsWith('provider:')), false, url);
    assert.equal(JSON.stringify(body).includes(url), false);
  }
});
