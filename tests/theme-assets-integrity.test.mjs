import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const assets = fileURLToPath(new URL('../public/theme-assets/', import.meta.url));
test('theme portal ships an intact shared validator, editor, preview and marketplace with their local imports', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'assets.json'), 'utf8'));
  assert.equal(manifest.format, 'altara-theme-site-assets');
  assert.equal(manifest.version, 1);
  const allowlist = new Set(manifest.files.map(item => item.path));
  // The website loads commerce and refunds as independent entry points too.
  for (const relative of ['lib/communityThemePackages.js', 'lib/communityThemesUi.js', 'lib/communityThemeMarketplace.js', 'lib/communityThemeEditor.js', 'lib/vendor/css-tree/csstree.esm.js', 'lib/themeCommerce.js', 'lib/widgetCommerce.js', 'lib/widgetRefunds.js']) assert.ok(allowlist.has(relative), `Missing website theme entry point: ${relative}`);
  for (const entry of manifest.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split('/').includes('..'));
    const file = path.join(assets, entry.path), bytes = fs.readFileSync(file);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    if (!file.endsWith('.js')) continue;
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) {
      const dependency = path.relative(assets, path.resolve(path.dirname(file), match[1])).replaceAll('\\', '/');
      assert.ok(allowlist.has(dependency), `${entry.path} needs bundled ${dependency}`);
    }
  }
});
