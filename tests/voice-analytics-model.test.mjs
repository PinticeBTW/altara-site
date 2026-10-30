import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), ts = require('typescript');
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/lib/voice-analytics-model.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { parseIdentity, parseRoomName, normalizeLiveSession, normalizeHistorySession, normalizeSessionDetail } = exports;
const USER = 'a3a0db58-eb4d-4563-9efc-7d2171d12341';
const USER2 = '11111111-1111-4111-8111-111111111111';
const GENERATION = 'c5ae316f-235d-4c8f-ace5-502fdd06bd05';
const SERVER = '22222222-2222-4222-8222-222222222222';
const CHANNEL = '33333333-3333-4333-8333-333333333333';
const START = Date.parse('2026-10-28T10:00:00Z'), NOW = START + 600_000;
const iso = ms => new Date(ms).toISOString();
const detail = overrides => ({ roomId: 'RM_fixture', roomName: `server-voice-v2:${SERVER}:${CHANNEL}`, startTime: iso(START), endTime: iso(NOW), ...overrides });

test('identity mapping uses strict authoritative formats and excludes technical participants from people', () => {
  for (const identity of [USER, USER.toUpperCase(), `sv2:${USER}:${GENERATION}`]) {
    assert.equal(parseIdentity(identity).userId, USER); assert.equal(parseIdentity(identity).kind, 'user');
  }
  assert.equal(parseIdentity(`${USER}:native-screen:1234567890abcdef12345678`).kind, 'companion');
  assert.equal(parseIdentity(`capture-user:${USER}:${GENERATION}`).kind, 'companion');
  assert.equal(parseIdentity(`altara_bot:${USER}:voice:${GENERATION}`).kind, 'bot');
  assert.equal(parseIdentity(`capture-bot:${USER}:${GENERATION}`).kind, 'bot');
  for (const identity of [`x${USER}`, `sv2:${USER}:broken`, `sv2:broken:${GENERATION}`, `bot:${USER}`, `<script>${USER}</script>`, { userId: USER }, null]) {
    assert.equal(parseIdentity(identity).userId, null); assert.equal(parseIdentity(identity).kind, 'unknown');
  }
});

test('rooms distinguish current and legacy server formats and private scopes without trusting metadata', () => {
  for (const name of [`server-voice-v2:${SERVER}:${CHANNEL}`, `server-voice-v3:${SERVER}:voice:${CHANNEL}`]) {
    const result = parseRoomName(name); assert.equal(result.serverId, SERVER); assert.equal(result.channelId, CHANNEL); assert.equal(result.scope, 'server');
  }
  assert.equal(parseRoomName(`server-voice-v2:${SERVER}`).channelId, null);
  assert.equal(parseRoomName(`server-voice:${CHANNEL}`).conversationId, CHANNEL);
  assert.equal(parseRoomName(`private_${CHANNEL}`).scope, 'private');
  assert.equal(parseRoomName(`groupdm_${CHANNEL}`).scope, 'group');
  assert.equal(parseRoomName(`private_${CHANNEL}:extra`).scope, 'unknown');
});

test('live SDK bigint timestamps and states produce JSON-safe results, profile data stays untrusted', () => {
  const result = normalizeLiveSession({ sid: 'RM_live', name: `server-voice-v2:${SERVER}:${CHANNEL}`, creationTime: BigInt(START / 1000) }, [
    { identity: `sv2:${USER}:${GENERATION}`, joinedAt: BigInt((START + 60_000) / 1000), state: 2, metadata: JSON.stringify({ username: 'forged', avatarUrl: 'javascript:evil()' }) },
    { identity: `${USER}:native-screen:1234567890abcdef12345678`, joinedAt: BigInt(START / 1000), state: 2 },
    { identity: `altara_bot:${USER2}:voice:${GENERATION}`, joinedAt: BigInt(START / 1000), state: 2 },
  ], NOW);
  assert.equal(result.status, 'active'); assert.equal(result.uniqueUsers, 1); assert.equal(result.participantCount, 3);
  assert.equal(result.connectedSeconds, 540); assert.equal(result.participants[0].state, 'active');
  assert.equal(result.participants[0].username, null); assert.equal(result.participants[0].avatarUrl, null);
  assert.equal(result.billableMinutes, null); assert.doesNotThrow(() => JSON.stringify(result));
});

test('history lists do not invent unique people, human minutes or a live state', () => {
  const open = normalizeHistorySession({ sessionId: 'RM_open', roomName: 'fixture', createdAt: { seconds: String(START / 1000), nanos: 0 }, numParticipants: 8, numActiveParticipants: 2 }, NOW);
  assert.equal(open.status, 'unknown'); assert.equal(open.endedAt, null); assert.equal(open.uniqueUsers, null); assert.equal(open.connectedSeconds, null);
  assert.equal(open.participantCount, 8); assert.equal(open.startedAt, iso(START));
  const ended = normalizeHistorySession({ sessionId: 'RM_ended', createdAt: iso(START), endedAt: iso(NOW) }, NOW);
  assert.equal(ended.status, 'ended');
  assert.equal(normalizeHistorySession({ createdAt: iso(NOW), endedAt: iso(START) }, NOW).status, 'unknown');
});

test('live human totals require an active media connection, not signaling or stale disconnected rows', () => {
  const result = normalizeLiveSession({ creationTime: BigInt(START / 1000) }, [
    { identity: USER, joinedAt: BigInt(START / 1000), state: 2 },
    { identity: USER2, joinedAt: BigInt(START / 1000), state: 1 },
    { identity: `sv2:${USER2}:${GENERATION}`, joinedAt: BigInt(START / 1000), state: 0 },
    { identity: GENERATION, joinedAt: BigInt(START / 1000), state: 3 },
  ], NOW);
  assert.equal(result.uniqueUsers, 1); assert.equal(result.connectedSeconds, 600);
  assert.equal(result.participantCount, 4); assert.equal(result.participants[1].state, 'joined');
  assert.equal(result.participants[1].connectedSeconds, null); assert.equal(result.participants[2].connectedSeconds, null);
  assert.equal(result.participants[3].connectedSeconds, null);
});

test('reconnections use individual intervals, not envelope duration, bounded to the room', () => {
  const result = normalizeSessionDetail(detail({ participants: [{ participantIdentity: USER, joinedAt: iso(START - 60_000), leftAt: iso(NOW + 60_000), sessions: [
    { participantId: 'PA_1', joinedAt: iso(START - 60_000), leftAt: iso(START + 60_000) },
    { participantId: 'PA_2', joinedAt: iso(START + 300_000), leftAt: iso(NOW + 60_000) },
  ] }] }), 'RM_fixture', NOW);
  assert.equal(result.participants[0].connectionCount, 2); assert.equal(result.participants[0].connectedSeconds, 360);
  assert.equal(result.connectedSeconds, 360); assert.equal(result.uniqueUsers, 1);
});

test('overlapping generations and reconnects are merged per human while billing remains separate', () => {
  const result = normalizeSessionDetail(detail({ connectionMinutes: 25, participants: [
    { participantIdentity: USER, joinedAt: iso(START), leftAt: iso(START + 300_000) },
    { participantIdentity: `sv2:${USER}:${GENERATION}`, joinedAt: iso(START + 240_000), leftAt: iso(NOW) },
    { participantIdentity: USER2, joinedAt: iso(START), leftAt: iso(NOW) },
    { participantIdentity: `altara_bot:${USER2}:voice:${GENERATION}`, joinedAt: iso(START), leftAt: iso(NOW) },
  ] }), 'RM_fixture', NOW);
  assert.equal(result.uniqueUsers, 2); assert.equal(result.connectedSeconds, 1200); assert.equal(result.billableMinutes, 25);
  assert.equal(result.participantCount, 4); assert.equal(result.participants[0].state, 'disconnected');
});

test('missing or impossible historic connection ends remain unknown and never run until now', () => {
  for (const participant of [
    { participantIdentity: USER, joinedAt: iso(START) },
    { participantIdentity: USER, joinedAt: iso(START), leftAt: iso(START - 1) },
    { participantIdentity: USER, joinedAt: iso(START), leftAt: iso(NOW), sessions: [{ participantId: 'PA_incomplete', joinedAt: iso(START) }] },
    { participantIdentity: USER, joinedAt: { seconds: '0', nanos: 0 }, leftAt: iso(NOW) },
  ]) {
    const result = normalizeSessionDetail(detail({ participants: [participant] }), 'RM_fixture', NOW);
    assert.equal(result.participants[0].connectedSeconds, null); assert.equal(result.connectedSeconds, null);
  }
  const open = normalizeSessionDetail(detail({ endTime: null, participants: [{ participantIdentity: USER, joinedAt: iso(START), leftAt: iso(NOW) }] }), 'RM_open', NOW);
  assert.equal(open.status, 'unknown'); assert.equal(open.connectedSeconds, null);
});

test('protobuf nanos and SDK milliseconds work; malformed input fails predictably', () => {
  const result = normalizeLiveSession({ sid: 'RM_ms', name: 'fixture', creationTimeMs: BigInt(START) }, [
    { identity: USER, joinedAt: { seconds: String(START / 1000), nanos: 500_000_000 }, state: 'ACTIVE' },
  ], NOW);
  assert.equal(result.participants[0].joinedAt, iso(START + 500)); assert.equal(result.connectedSeconds, 599.5);
  assert.equal(normalizeLiveSession({}, [{ identity: USER, joinedAt: 'bad', state: 2 }], NOW).connectedSeconds, null);
  assert.equal(normalizeLiveSession({}, [{ identity: USER, joinedAt: iso(NOW + 1000), state: 2 }], NOW).connectedSeconds, null);
  assert.equal(normalizeSessionDetail(null, 'RM_missing', NOW).id, 'RM_missing');
  assert.equal(normalizeSessionDetail({}, 'RM_missing', NOW).uniqueUsers, null);
  assert.equal(normalizeLiveSession({ numParticipants: 3 }, null, NOW).uniqueUsers, null);
  assert.equal(normalizeLiveSession({ numParticipants: 3 }, null, NOW).connectedSeconds, null);
  assert.equal(normalizeLiveSession({ numParticipants: 3 }, null, NOW).participantCount, 3);
  assert.doesNotThrow(() => JSON.stringify(normalizeSessionDetail({ participants: [null, 5, 'bad', {}] }, 'RM_empty', NOW)));
});

test('duplicate connection records do not multiply time', () => {
  const connection = { participantId: 'PA_duplicate', joinedAt: iso(START), leftAt: iso(NOW) };
  const result = normalizeSessionDetail(detail({ participants: [{ participantIdentity: USER, sessions: [connection, connection] }] }), 'RM_fixture', NOW);
  assert.equal(result.participants[0].connectionCount, 1); assert.equal(result.connectedSeconds, 600);
  const duplicate = { participantIdentity: USER, sessions: [connection] };
  const acrossRows = normalizeSessionDetail(detail({ participants: [duplicate, duplicate] }), 'RM_fixture', NOW);
  assert.equal(acrossRows.participants.length, 1); assert.equal(acrossRows.participants[0].connectionCount, 1);
  assert.equal(acrossRows.connectedSeconds, 600);
});
