// Real Chromium + the website auth scripts; all hosted auth calls are stubbed in this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public');
const hash = value => createHash('sha256').update(value).digest('hex');
const key = 'altara.foundingCreator.v1';
const source = name => fs.readFileSync(path.join(out, 'app', name), 'utf8');
const require = createRequire(import.meta.url);
if (!path.isAbsolute(process.env.ALTARA_FOUNDING_PLAYWRIGHT || '')) throw Error('Set ALTARA_FOUNDING_PLAYWRIGHT to an existing Playwright package.');
const { chromium } = require(process.env.ALTARA_FOUNDING_PLAYWRIGHT);

test('website auth assets match the reviewed three-file overlay', () => {
  const hashes = {
    'register.js': 'a694ce051a0a9659f94f8453ede90757dc6a941b51b5739c558bab49120ce0dc',
    'login.js': 'bb014bd0b5548425afa595e9d95d56830b052eecc298f18912326ddb321f7a3c',
    'lib/foundingCreatorReferral.js': '571531a435e19644903f310775f01874c0ab8224af493bb45c73d74fdd344c5e',
  };
  for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(source(file)), expected);
});

const html = page => `<!doctype html><body class="authPage"><main class="authCard">
  ${page === 'register' ? '<input id="username" aria-label="Username">' : ''}
  <input id="email" aria-label="Email"><input id="password" type="password" aria-label="Password">
  <button id="${page === 'register' ? 'btnRegister' : 'btnLogin'}">${page === 'register' ? 'Create account' : 'Login'}</button>
  <div id="authFeedback" hidden></div><pre id="debug"></pre>
  <a href="/app/${page === 'register' ? 'login' : 'register'}.html">Other auth page</a>
  </main><script type="module" src="/app/${page}.js"></script></body>`;

async function fixture({ blockedStorage = false, origin = 'http://public-referral.test', desktop = false } = {}) {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const errors = [], calls = [], unexpected = [];
  let failure = null, existing = false;
  if (desktop) await page.addInitScript(() => { window.altaraDesktop = { isDesktopApp: true }; });
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordSignup', async args => {
    calls.push(args);
    return failure ? { error: { message: failure } } : { data: { user: { id: 'fixture-user', identities: existing ? [] : [{ id: 'email' }] }, session: null } };
  });
  if (blockedStorage) await page.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = Storage.prototype.removeItem = () => { throw Error('Storage disabled'); };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
    if (url.pathname.endsWith('register.html')) return route.fulfill({ contentType: 'text/html', body: html('register') });
    if (url.pathname.endsWith('login.html')) return route.fulfill({ contentType: 'text/html', body: html('login') });
    if (url.pathname.endsWith('index.html')) return route.fulfill({ contentType: 'text/html', body: '<h1>Authenticated checkpoint</h1>' });
    const name = url.pathname.replace(/^\/app\//, '');
    const stubs = {
      'supabaseClient.js': `const user={id:'fixture-user',email:'fixture@example.com',user_metadata:{}};
        export const supabase={auth:{signUp:args=>window.recordSignup(args),signInWithPassword:async()=>({data:{user,session:{user}}}),verifyOtp:async()=>({}),setSession:async()=>({}),getSession:async()=>({data:{session:{user}}})}};`,
      'ui.js': 'export const $=id=>document.getElementById(id);export const setDebug=()=>{};export const enhancePasswordVisibilityToggles=()=>{};',
      'authI18n.js': 'export const initAuthLanguage=()=>{};export const onAuthLanguageChange=()=>{};export const tAuth=(key,fallback)=>fallback;',
      'authOnboarding.js': 'export const initAuthInstallWelcome=async()=>{};',
      'defaultAvatarPool.js': 'export const pickRandomDefaultAvatarUrl=async()=>"";',
      'desktopWindowControls.js': 'export const initDesktopWindowControls=()=>{};',
    };
    if (stubs[name]) return route.fulfill({ contentType: 'text/javascript', body: stubs[name] });
    if (['register.js', 'login.js', 'lib/foundingCreatorReferral.js'].includes(name)) return route.fulfill({ contentType: 'text/javascript', body: source(name) });
    unexpected.push(url.pathname); return route.abort();
  });
  const go = async url => { await page.goto(origin + url); await page.waitForFunction(() => document.getElementById('btnRegister') || document.getElementById('btnLogin')); };
  const submit = async () => {
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill('fixtureuser');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.com');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Fixture-password-123!');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('authFeedback').hidden);
  };
  return { page, calls, go, submit,
    setFailure: value => { failure = value; }, setExisting: value => { existing = value; },
    async close() { await browser.close(); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); } };
}

test('public link survives register/login navigation and reload; signup sends normalized metadata once then clears', async () => {
  const f = await fixture();
  try {
    await f.go('/register.html?creator_ref=fc_test');
    await f.page.getByRole('link').click();
    await f.page.getByRole('link').click();
    await f.page.reload();
    await f.submit();
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].options.data, { founding_creator_code: 'FC_TEST', username: 'fixtureuser' });
    assert.equal(f.calls[0].options.emailRedirectTo, 'http://public-referral.test/app/login.html');
    assert.equal(await f.page.evaluate(key => localStorage.getItem(key), key), null);
    await f.page.waitForURL('**/login.html?awaiting_confirm=1*');
  } finally { await f.close(); }
});

test('web signup callbacks reach the same-origin login consumer and ignore URL-supplied destinations', async () => {
  for (const origin of ['https://altaraapp.com', 'https://www.altaraapp.com']) {
    for (const prefix of ['', '/app']) {
      const f = await fixture({ origin });
      try {
        await f.go(`${prefix}/register.html?creator_ref=FC_TEST&redirect_to=https://untrusted.invalid`);
        await f.submit();
        assert.equal(f.calls[0].options.emailRedirectTo, `${origin}/app/login.html`);
        await f.go('/app/login.html#type=signup&access_token=fixture-access&refresh_token=fixture-refresh');
        await f.page.waitForURL('**/index.html');
        assert.equal(f.page.url(), `${origin}/app/index.html`);
        assert.equal(new URL(f.page.url()).hash, '');
        assert.equal(f.calls.length, 1);
      } finally { await f.close(); }
    }
  }
});

test('desktop bridge retains the dedicated signup confirmation deep link', async () => {
  const f = await fixture({ desktop: true });
  try {
    await f.go('/register.html?creator_ref=FC_TEST');
    await f.submit();
    assert.equal(f.calls[0].options.emailRedirectTo, 'altara://auth/confirm');
  } finally { await f.close(); }
});

test('missing and malformed codes keep ordinary signup working without creator metadata', async () => {
  for (const query of ['', '?creator_ref=%3Cscript%3E', '?creator_ref=' + 'A'.repeat(49)]) {
    const f = await fixture();
    try { await f.go('/register.html' + query); await f.submit(); assert.equal(f.calls[0].options.data.founding_creator_code, undefined); }
    finally { await f.close(); }
  }
});

test('unknown and paused-looking codes are submitted without blocking signup; backend owns eligibility', async () => {
  for (const code of ['MISSING_CREATOR', 'CREATOR_B']) {
    const f = await fixture();
    try { await f.go('/register.html?creator_ref=' + code); await f.submit(); assert.equal(f.calls[0].options.data.founding_creator_code, code); }
    finally { await f.close(); }
  }
});

test('failed signup and duplicate email preserve referral for retry; a later success consumes it', async () => {
  const f = await fixture();
  try {
    await f.go('/register.html?creator_ref=FC_TEST'); f.setFailure('Network failure'); await f.submit();
    assert.equal(await f.page.evaluate(key => JSON.parse(localStorage.getItem(key)).code, key), 'FC_TEST');
    f.setFailure(null); f.setExisting(true); await f.submit();
    assert.match(await f.page.locator('#authFeedback').innerText(), /already has an account/);
    assert.equal(await f.page.evaluate(key => JSON.parse(localStorage.getItem(key)).code, key), 'FC_TEST');
    f.setExisting(false); await f.submit();
    assert.equal(f.calls.length, 3); assert.ok(f.calls.every(call => call.options.data.founding_creator_code === 'FC_TEST'));
    assert.equal(await f.page.evaluate(key => localStorage.getItem(key), key), null);
  } finally { await f.close(); }
});

test('storage restrictions do not break direct referral signup', async () => {
  const f = await fixture({ blockedStorage: true });
  try { await f.go('/register.html?creator_ref=FC_TEST'); await f.submit(); assert.equal(f.calls[0].options.data.founding_creator_code, 'FC_TEST'); }
  finally { await f.close(); }
});

test('password login and confirmation callback clear pending referral without another signup', async () => {
  for (const confirmation of [false, true]) {
    const f = await fixture();
    try {
      await f.go('/login.html?creator_ref=FC_TEST');
      if (confirmation) await f.go('/app/login.html?type=signup&token_hash=fixture-confirmation');
      else {
        await f.page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.com');
        await f.page.getByRole('textbox', { name: 'Password', exact: true }).fill('Fixture-password-123!');
        await f.page.getByRole('button', { name: 'Login', exact: true }).click();
      }
      await f.page.waitForURL('**/index.html');
      assert.equal(await f.page.evaluate(key => localStorage.getItem(key), key), null);
      assert.equal(f.calls.length, 0);
    } finally { await f.close(); }
  }
});
