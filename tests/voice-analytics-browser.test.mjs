import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const enabled = !!process.env.ALTARA_VOICE_SITE_URL && !!process.env.ALTARA_VOICE_PLAYWRIGHT;
const key = 'sb-tbbgwjmmaiclkhssimhf-auth-token';
const userId = 'a1111111-1111-4111-8111-111111111111';
const storageUrl = 'https://tbbgwjmmaiclkhssimhf.supabase.co';
const now = new Date().toISOString();
const start = new Date(Date.now() - 120_000).toISOString();
function session(version = 'one') {
  const payload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.${version}`, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', email_confirmed_at: now, app_metadata: {}, user_metadata: {}, created_at: now } };
}
const participant = { identity: `sv2:${userId}:c1111111-1111-4111-8111-111111111111`, userId, kind: 'user', username: 'Utilizador de teste', displayName: '<img src=x onerror=alert(1)>', avatarUrl: null, state: 'active', joinedAt: start, leftAt: null, connectedSeconds: 120, connectionCount: 1 };
const auxiliary = { ...participant, identity: `${userId}:native-screen:111111111111111111111111`, kind: 'companion', username: '<img src=x onerror=alert(1)>' };
const room = { id: 'RM_fixture', roomName: 'server-voice-v2:b1111111-1111-4111-8111-111111111111:c1111111-1111-4111-8111-111111111111', scope: 'server', serverId: 'b1111111-1111-4111-8111-111111111111', channelId: 'c1111111-1111-4111-8111-111111111111', conversationId: null, serverName: 'Servidor de teste', channelName: 'Conversa de teste', startedAt: start, endedAt: null, status: 'active', participantCount: 2, uniqueUsers: 1, connectedSeconds: 120, billableMinutes: null, participants: [participant, auxiliary] };
const historyRoom = { ...room, id: 'RM_history_fixture', status: 'ended', endedAt: now, connectedSeconds: null, uniqueUsers: null, participants: [] };
const usageRoom = { ...historyRoom, connectedSeconds: 120, uniqueUsers: 1, billableMinutes: 5, participants: [{ ...participant, state: 'disconnected', leftAt: now }] };

async function setup(browser, signedIn = true, mockClock = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (signedIn) await context.addInitScript(({ key, initial }) => localStorage.setItem(key, JSON.stringify(initial)), { key, initial: session() });
  // All Auth and analytics data in these browser tests is synthetic. Never contact the live backend.
  await context.route(`${storageUrl}/**`, route => route.abort());
  const control = { requests: [], status: 200, partial: false, stall: false, stalled: null };
  await context.route('**/api/admin/voice?**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view');
    control.requests.push({ view, auth: route.request().headers().authorization, url: url.href });
    if (control.stall && view === 'live') { control.stall = false; control.stalled = route; return; }
    if (control.status !== 200) return route.fulfill({ status: control.status, contentType: 'text/html', body: 'Denied' });
    let body;
    if (view === 'live') body = { sessions: [control.partial ? { ...room, status: 'unknown', uniqueUsers: null, connectedSeconds: null, participants: [] } : room], updatedAt: now, partial: control.partial, warning: control.partial ? 'Consulta parcial de teste' : undefined };
    else if (view === 'session') body = { session: usageRoom, updatedAt: now };
    else body = { sessions: [view === 'usage' ? usageRoom : historyRoom], updatedAt: now, hasMore: url.searchParams.get('page') !== '1', page: Number(url.searchParams.get('page') || 0) };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  if (mockClock) await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.ALTARA_VOICE_SITE_URL}/admin/voice`);
  return { context, page, control, errors };
}
async function broadcast(page, event, version = 'two') {
  const next = event === 'SIGNED_OUT' ? null : session(version);
  await page.evaluate(({ key, next, event }) => {
    if (next) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key);
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event, session: next });
    setTimeout(() => channel.close(), 100);
  }, { key, next, event });
  return next;
}

test('voice browser: session gate, current/history/usage, responsive detail and 403 cleanup', { skip: !enabled, timeout: 90000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.ALTARA_VOICE_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ALTARA_VOICE_CHROME || undefined });
  try {
    const anonymous = await setup(browser, false);
    await anonymous.page.getByRole('heading', { name: 'Entra com a tua conta de administrador' }).waitFor();
    assert.equal(anonymous.control.requests.length, 0);
    assert.equal(await anonymous.page.locator('.voiceMetrics').count(), 0);
    await anonymous.context.close();

    const { context, page, control, errors } = await setup(browser);
    await page.getByText('Servidor de teste', { exact: true }).waitFor();
    assert.equal(await page.locator('script[src*="clarity"]').count(), 0);
    await page.getByRole('button', { name: 'Ver sessão', exact: true }).click();
    await page.getByText('Utilizador de teste', { exact: true }).waitFor();
    await page.getByText('<img src=x onerror=alert(1)>', { exact: true }).waitFor();
    assert.equal(await page.locator('img[onerror]').count(), 0);
    assert.match(await page.locator('.voiceDetailMeta').innerText(), /2 min/);

    const screenshotDir = path.resolve('output/playwright/voice-analytics');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'desktop-fixture.png'), fullPage: true });
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular utilização desta página', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Sessões iniciadas por dia' }).waitFor();
    await page.getByRole('button', { name: 'Calcular utilização desta página', exact: true }).click();
    await page.getByRole('heading', { name: /Minutos/ }).waitFor();
    assert.match(await page.locator('.voiceMetrics').innerText(), /5/);
    const detailRequests = control.requests.filter(request => request.view === 'session').length;
    await page.getByRole('button', { name: 'Ver sessão', exact: true }).click();
    await page.getByText('Utilizador de teste', { exact: true }).waitFor();
    assert.equal(control.requests.filter(request => request.view === 'session').length, detailRequests, 'usage details are reused');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotDir, 'mobile-fixture.png'), fullPage: true });
    const overflow = await page.evaluate(() => ({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('*')].map(el => ({ tag: el.tagName, name: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, overflow: getComputedStyle(el).overflowX, position: getComputedStyle(el).position })).filter(el => el.right > window.innerWidth + 1).slice(0, 30) }));
    assert.ok(overflow.documentWidth <= overflow.width + 1, `mobile page does not overflow: ${JSON.stringify(overflow)}`);
    await page.getByRole('button', { name: 'Seguinte →', exact: true }).click();
    await page.locator('.voicePagination').getByText('Página 2', { exact: true }).waitFor();
    assert.equal(await page.locator('.voiceDetail').count(), 0, 'paging clears selected private detail');

    control.partial = true;
    await page.getByRole('button', { name: 'Agora', exact: true }).click();
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByText('Consulta parcial de teste', { exact: true }).waitFor();
    assert.match(await page.locator('.voiceMetrics').innerText(), /≥\s*0/, 'a failed participant lookup never asserts zero people');
    control.status = 403;
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByRole('heading', { name: 'Acesso indisponível' }).waitFor();
    assert.equal(await page.getByText('Utilizador de teste', { exact: true }).count(), 0);
    assert.equal(await page.locator('.voiceMetrics').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

test('voice browser: token renewal and logout discard late requests', { skip: !enabled, timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.ALTARA_VOICE_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ALTARA_VOICE_CHROME || undefined });
  try {
    const { context, page, control, errors } = await setup(browser);
    await page.getByText('Servidor de teste', { exact: true }).waitFor();
    control.stall = true;
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.voiceToolbar .voiceActions button:last-child')?.textContent.includes('A atualizar'));
    assert.ok(control.stalled);
    const stale = control.stalled;
    const renewed = await broadcast(page, 'TOKEN_REFRESHED');
    await page.waitForFunction(() => document.querySelector('.voiceToolbar .voiceActions button:last-child')?.textContent === 'Atualizar');
    await stale.fulfill({ status: 401, body: 'Old token' }).catch(() => {});
    assert.equal(await page.getByRole('heading', { name: 'Acesso indisponível' }).count(), 0);
    assert.equal(control.requests.at(-1).auth, `Bearer ${renewed.access_token}`);

    control.stall = true;
    control.stalled = null;
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.voiceToolbar .voiceActions button:last-child')?.textContent.includes('A atualizar'));
    assert.ok(control.stalled);
    const loggedOut = control.stalled;
    await broadcast(page, 'SIGNED_OUT');
    await page.getByRole('heading', { name: 'Entra com a tua conta de administrador' }).waitFor();
    await loggedOut.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [room], updatedAt: now }) }).catch(() => {});
    assert.equal(await page.locator('.voiceMetrics').count(), 0);
    assert.equal(await page.getByText('Servidor de teste', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

test('voice browser: polling is bounded, pauses while hidden and respects manual pause', { skip: !enabled, timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.ALTARA_VOICE_PLAYWRIGHT);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ALTARA_VOICE_CHROME || undefined });
  try {
    const { context, page, control } = await setup(browser, true, true);
    await page.getByText('Servidor de teste', { exact: true }).waitFor();
    const initial = control.requests.length;
    control.stall = true;
    await page.clock.fastForward(20_001);
    await page.waitForFunction(() => document.querySelector('.voiceToolbar .voiceActions button:last-child')?.textContent.includes('A atualizar'));
    assert.equal(control.requests.length, initial + 1);
    await page.clock.fastForward(60_000);
    assert.equal(control.requests.length, initial + 1, 'polls do not overlap an in-flight request');
    await control.stalled.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [room], updatedAt: now }) });
    await page.waitForFunction(() => document.querySelector('.voiceToolbar .voiceActions button:last-child')?.textContent === 'Atualizar');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.fastForward(60_000);
    assert.equal(control.requests.length, initial + 1, 'hidden page makes no polling requests');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('.voiceToolbar .voiceActions button:last-child')?.textContent === 'Atualizar');
    assert.equal(control.requests.length, initial + 2, 'returning to the page refreshes its observation');
    await page.getByRole('button', { name: 'Atualização automática · 20 s', exact: true }).click();
    await page.clock.fastForward(60_000);
    assert.equal(control.requests.length, initial + 2, 'manual pause is respected');
    await context.close();
  } finally { await browser.close(); }
});
