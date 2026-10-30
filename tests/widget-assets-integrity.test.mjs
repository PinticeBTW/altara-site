import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const siteRoot = path.resolve(import.meta.dirname, '..');
const assets = path.join(siteRoot, 'public', 'widget-assets');
const script = path.join(siteRoot, 'scripts', 'sync-widget-assets.cjs');

test('widget portal ships the shared appearance bridge, runtimes and dependency-free starter intact', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'assets.json'), 'utf8'));
  assert.equal(manifest.format, 'altara-widget-site-assets');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.files.length, 26);
  const allowlist = new Set(manifest.files.map(item => item.path));
  assert.equal(allowlist.size, manifest.files.length);
  for (const file of ['widgetAppearance.js', 'widgetHosted.js', 'widgetSnapshot.js', 'widgetRuntime.js', 'widgetMarketplace.js', 'widgetCommerce.js', 'widgetPublicationDraft.js', 'widgetRefunds.js', 'widget-starter.zip', 'widget-starter/altara-sdk.js', 'widget-starter/release.html']) assert.ok(allowlist.has(file));
  const refundEntry = manifest.files.find(entry => entry.path === 'widgetRefunds.js');
  assert.equal(refundEntry.source, 'lib/widgetRefunds.js');
  const refundBytes = fs.readFileSync(path.join(assets, refundEntry.path));
  assert.equal(refundEntry.bytes, refundBytes.length);
  assert.equal(refundEntry.sha256, createHash('sha256').update(refundBytes).digest('hex'));
  const marketplace = fs.readFileSync(path.join(assets, 'widgetMarketplace.js'), 'utf8');
  const refundImport = marketplace.match(/\bfrom\s*['"](\.\/widgetRefunds\.js)['"]/);
  assert.ok(refundImport, 'Marketplace imports the bundled refund module');
  const importedRefundFile = path.resolve(assets, refundImport[1]);
  assert.equal(importedRefundFile, path.join(assets, refundEntry.path));
  assert.ok(fs.statSync(importedRefundFile).isFile());
  for (const entry of manifest.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split('/').includes('..'));
    const file = path.join(assets, entry.path), bytes = fs.readFileSync(file);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    if (!/\.(?:js|mjs)$/.test(file)) continue;
    for (const match of bytes.toString('utf8').matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) {
      const dependency = path.relative(assets, path.resolve(path.dirname(file), match[1])).replaceAll('\\', '/');
      assert.ok(allowlist.has(dependency), `${entry.path} needs bundled ${dependency}`);
    }
  }
});

test('standalone deployment verifies bundled widget assets and rejects tampering or manifest traversal', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'altara-widget-site-assets-'));
  try {
    const deployed = path.join(directory, 'site');
    fs.mkdirSync(path.join(deployed, 'scripts'), { recursive: true });
    fs.copyFileSync(script, path.join(deployed, 'scripts', 'sync-widget-assets.cjs'));
    fs.cpSync(assets, path.join(deployed, 'public', 'widget-assets'), { recursive: true });
    const sentinel = path.join(deployed, 'public', 'widget-assets', 'unrelated-output.txt');
    fs.writeFileSync(sentinel, 'preserve unrelated output');
    const run = (...args) => spawnSync(process.execPath, ['scripts/sync-widget-assets.cjs', ...args], { cwd: deployed, encoding: 'utf8', env: { ...process.env, ALTARA_WIDGET_ASSET_SOURCE: '' } });
    assert.equal(run().status, 0, 'source-free deployment verifies the exported bundle');
    assert.equal(run('--check').status, 0);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve unrelated output');
    const appearanceFile = path.join(deployed, 'public', 'widget-assets', 'widgetAppearance.js');
    const original = fs.readFileSync(appearanceFile);
    fs.appendFileSync(appearanceFile, '\n// tampered\n');
    const corrupt = run();
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /integrity mismatch/);
    fs.writeFileSync(appearanceFile, original);
    const manifestPath = path.join(deployed, 'public', 'widget-assets', 'assets.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].path = '../unrelated-output.txt';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const traversal = run('--check');
    assert.notEqual(traversal.status, 0);
    assert.match(traversal.stderr, /Invalid widget asset manifest entry/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve unrelated output');
    assert.notEqual(run('--source', path.join(directory, 'missing-source')).status, 0, 'an explicitly missing source cannot silently fall back');
  } finally {
    // Only this newly-created disposable fixture is removed.
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('altara-widget-site-assets-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
