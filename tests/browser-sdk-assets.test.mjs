import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const appRoot = path.resolve(import.meta.dirname, '../public/app');
test('browser call SDK survives deployment node_modules exclusion', () => {
  const sdk = path.join(appRoot, 'vendor/livekit-client/livekit-client.esm.mjs');
  assert.ok(fs.statSync(sdk).size > 100000);
  for (const relative of ['app.js','lib/callErrorStatus.js','lib/serverVoiceCamera.js','lib/serverVoiceLiveKit.js','lib/serverVoiceScreenshare.js','lib/cameraMirror.js']) {
    const source = fs.readFileSync(path.join(appRoot, relative), 'utf8');
    assert.ok(!source.includes('node_modules/livekit-client/'), relative);
    assert.match(source, /vendor\/livekit-client\/livekit-client\.esm\.mjs/);
  }
});

test('published app favicons resolve to existing absolute assets and retain the release query', () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(appRoot, 'release.json'), 'utf8'));
  for (const relative of ['index.html', '404.html', 'oauth2/authorize/index.html', 'login.html', 'register.html']) {
    const html = fs.readFileSync(path.join(appRoot, relative), 'utf8');
    const iconLinks = (html.match(/<link\b[^>]*>/gi) || [])
      .filter(tag => /\brel=["']icon["']/i.test(tag))
      .map(tag => /\bhref=(["'])(.*?)\1/i.exec(tag)?.[2]);
    const png = iconLinks.find(href => href && new URL(href, `https://example.invalid/app/${relative}`).pathname.endsWith('.png'));
    assert.ok(png, `${relative}: PNG favicon`);
    assert.ok(png.startsWith('/'), `${relative}: absolute favicon path`);
    const url = new URL(png, `https://example.invalid/app/${relative}`);
    assert.equal(url.pathname, '/app/build/icon.png', relative);
    assert.ok(fs.statSync(path.join(appRoot, 'build', 'icon.png')).size > 0);
    if (!['login.html', 'register.html'].includes(relative)) assert.equal(url.searchParams.get('v'), version, relative);
  }
});
