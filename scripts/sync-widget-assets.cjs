#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const siteRoot = path.resolve(__dirname, '..');
const target = path.join(siteRoot, 'public', 'widget-assets');
const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
if (sourceIndex >= 0 && !args[sourceIndex + 1]) throw Error('--source requires an app source directory');
const source = path.resolve(sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.ALTARA_WIDGET_ASSET_SOURCE || path.join(siteRoot, '..', 'ALTARA'));
const checkOnly = args.includes('--check');
// Browser modules remain flat so their existing relative imports keep working.
// The starter is an explicit allowlist: never copy an author's project or .env.
const files = [
  ...['altaraWidgetSdk.js', 'widgetAppearance.js', 'widgetRuntime.js', 'widgetHosted.js', 'widgetSnapshot.js', 'widgetPackages.js', 'widgetAccount.js', 'widgetCommerce.js', 'widgetRefunds.js', 'widgetPublicationDraft.js', 'widgetMarketplace.js', 'widgetMarketplace.css', 'widget-starter.zip'].map(name => ({ source: 'lib/' + name, path: name })),
  ...['_headers', 'altara-sdk.js', 'build.mjs', 'dev.mjs', 'icon.svg', 'index.html', 'manifest.json', 'netlify.toml', 'package.json', 'README.md', 'release.html', 'style.css', 'widget.js'].map(name => ({ source: 'lib/widget-starter/' + name, path: 'widget-starter/' + name })),
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.join(target, 'assets.json');

function readBundled() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'altara-widget-site-assets' || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== files.length) throw Error('Invalid widget asset manifest');
  const expected = new Map(files.map(file => [file.path, file.source]));
  const seen = new Set();
  for (const item of manifest.files) {
    // Only trusted allowlist paths select files; manifest paths cannot escape.
    if (!expected.has(item.path) || seen.has(item.path) || item.source !== expected.get(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !Number.isSafeInteger(item.bytes) || item.bytes < 0) throw Error('Invalid widget asset manifest entry');
    seen.add(item.path);
    const bytes = fs.readFileSync(path.join(target, item.path));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw Error('Widget asset integrity mismatch: ' + item.path);
  }
  return manifest;
}

if (!fs.existsSync(path.join(source, 'lib', 'widgetMarketplace.js'))) {
  // Vercel receives this standalone site checkout, without the desktop sibling.
  // Verify the exported bundle instead of silently using older source copies.
  if (sourceIndex >= 0 || process.env.ALTARA_WIDGET_ASSET_SOURCE) throw Error('The selected widget source is not an ALTARA app source directory');
  readBundled(); console.log('[widget-assets] Verified bundled widget modules and starter.');
} else {
  const entries = files.map(file => {
    const content = fs.readFileSync(path.join(source, file.source));
    return { ...file, sha256: hash(content), bytes: content.length, content };
  });
  if (checkOnly) {
    const bundled = readBundled();
    for (const entry of entries) if (bundled.files.find(item => item.path === entry.path)?.sha256 !== entry.sha256) throw Error('Widget asset source parity mismatch: ' + entry.path);
    console.log('[widget-assets] Verified source parity for ' + entries.length + ' assets.');
  } else {
    for (const entry of entries) {
      const destination = path.join(target, entry.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (!fs.existsSync(destination) || hash(fs.readFileSync(destination)) !== entry.sha256) fs.writeFileSync(destination, entry.content);
    }
    fs.writeFileSync(manifestPath, JSON.stringify({ format: 'altara-widget-site-assets', version: 1, files: entries.map(({ source, path, sha256, bytes }) => ({ source, path, sha256, bytes })) }, null, 2) + '\n');
    console.log('[widget-assets] Exported ' + entries.length + ' app-owned assets. No files removed.');
  }
}
