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
