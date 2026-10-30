#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const siteRoot = path.resolve(__dirname, '..');
const target = path.join(siteRoot, 'public', 'theme-assets');
const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
if (sourceIndex >= 0 && !args[sourceIndex + 1]) throw Error('--source requires an app source directory');
const source = path.resolve(sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.ALTARA_THEME_SOURCE || path.join(siteRoot, '..', 'ALTARA'));
const checkOnly = args.includes('--check');
const files = [
  'lib/communityThemePackages.js', 'lib/communityThemeRuntime.js', 'lib/communityThemesUi.js',
  'lib/communityThemeLayout.js', 'lib/communityThemeLayoutBridge.js',
  'lib/communityThemeGlass.js', 'lib/communityThemeEditor.js', 'lib/communityThemeMarketplace.js',
  'lib/communityThemeAccount.js', 'lib/themeCanonical.js', 'lib/themeCommerce.js',
  'lib/widgetCommerce.js', 'lib/widgetRefunds.js',
  'lib/widgetAppearance.js',
  'lib/themeHomePresenter.js', 'lib/communityThemes.css',
  'lib/vendor/css-tree/csstree.esm.js', 'lib/vendor/css-tree/LICENSE', 'lib/vendor/css-tree/NOTICE.txt',
  'theme/communityThemeStarter.js', 'theme/altaraGlassTheme.js', 'theme/altaraGlassAssets.js',
  'theme/community-theme-starter.altara-theme.json',
  'theme/community-theme-starter-kit.zip',
  'theme/assets/altara-glass-room.webp',
  'docs/COMMUNITY_THEMES_V1.md', 'docs/ALTARA_GLASS_THEME.md',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.join(target, 'assets.json');
const widgetMarketplaceTarget = path.join(siteRoot, 'public', 'widget-assets', 'widgetMarketplace.js');

function readBundled() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'altara-theme-site-assets' || manifest.version !== 1 || !Array.isArray(manifest.files)) throw Error('Invalid theme asset manifest');
  if (manifest.files.length !== files.length) throw Error('Incomplete theme asset manifest');
  for (const relative of files) {
    const item = manifest.files.find(row => row.path === relative);
    if (!item || !/^[a-f0-9]{64}$/.test(item.sha256) || hash(fs.readFileSync(path.join(target, relative))) !== item.sha256) throw Error('Theme asset integrity mismatch: ' + relative);
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.widgetMarketplaceSha256 || '') || hash(fs.readFileSync(widgetMarketplaceTarget)) !== manifest.widgetMarketplaceSha256) throw Error('Marketplace theme navigation integrity mismatch');
  return manifest;
}

if (!fs.existsSync(path.join(source, 'lib', 'communityThemePackages.js'))) {
  // Site deployments contain the exported browser assets, not the desktop app
  // repository. Verify their manifest instead of falling back to stale copies.
  if (sourceIndex >= 0 || process.env.ALTARA_THEME_SOURCE) throw Error('The selected theme source is not an ALTARA app source directory');
  readBundled(); console.log('[theme-assets] Verified bundled theme modules.');
} else {
  const entries = files.map(relative => {
    const bytes = fs.readFileSync(path.join(source, relative));
    return { path: relative, sha256: hash(bytes), bytes: bytes.length, content: bytes };
  });
  const widgetMarketplace = fs.readFileSync(path.join(source, 'lib', 'widgetMarketplace.js'));
  const widgetMarketplaceSha256 = hash(widgetMarketplace);
  if (checkOnly) {
    const bundled = readBundled();
    for (const item of entries) if (bundled.files.find(row => row.path === item.path)?.sha256 !== item.sha256) throw Error('Theme asset source parity mismatch: ' + item.path);
    if (bundled.widgetMarketplaceSha256 !== widgetMarketplaceSha256) throw Error('Marketplace theme navigation source parity mismatch');
    console.log('[theme-assets] Verified source parity for ' + entries.length + ' assets.');
  } else {
    for (const item of entries) {
      const destination = path.join(target, item.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (!fs.existsSync(destination) || hash(fs.readFileSync(destination)) !== item.sha256) fs.writeFileSync(destination, item.content);
    }
    fs.mkdirSync(path.dirname(widgetMarketplaceTarget), { recursive: true });
    if (!fs.existsSync(widgetMarketplaceTarget) || hash(fs.readFileSync(widgetMarketplaceTarget)) !== widgetMarketplaceSha256) fs.writeFileSync(widgetMarketplaceTarget, widgetMarketplace);
    fs.writeFileSync(manifestPath, JSON.stringify({ format: 'altara-theme-site-assets', version: 1, widgetMarketplaceSha256, files: entries.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })) }, null, 2) + '\n');
    console.log('[theme-assets] Exported ' + entries.length + ' validated app-owned assets. No files removed.');
  }
}
