#!/usr/bin/env node
// Author tooling only. The downloadable kit has no npm dependencies; ZIP
// generation uses JSZip from the development tools, never a theme's code.
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const kitPath = path.join(root, 'theme/community-theme-starter-kit.zip');
const manifestPath = path.join(root, 'theme/community-theme-starter-kit.manifest.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const readme = `# Your ALTARA theme

1. Install Node.js 22 or newer, then extract this folder.
2. Edit theme.css in your code editor. Edit the name, version and description in metadata.json.
3. Open a terminal in this folder and build your package:

   node scripts/theme-package.mjs --build metadata.json theme.css my-theme-1.0.0.altara-theme.json
   node scripts/theme-package.mjs --check my-theme-1.0.0.altara-theme.json

The output is the .altara-theme.json file you import in ALTARA. Importing does not activate it: select Activate in Appearance. A browser stores imports locally; the desktop app also lets you put files in the account folder shown in Appearance.

For another build, choose a new output filename. The builder refuses to overwrite existing files. For a published update, increase the version in metadata.json and publish a new release.

Publish at https://altaraapp.com/developers/themes using your normal ALTARA account: upload the package, validate it, use Preview package, then Save private draft. Open Publish version… and select Free or One-time purchase; for a paid theme, enter the EUR price and complete Set up Stripe seller account if shown. Then add a presentation image and release notes, review the version, price and your publishing rights, then choose Publish version. ALTARA+ is not required. Paid publication depends on enabled theme sales and verified Stripe seller setup in a supported country. The published price belongs to that fixed version.

For a paid theme, keep the complete CSS, images, JSON package and source repository on your computer or in private storage. Upload the finished .altara-theme.json directly to ALTARA. Do not put the paid package in a public repository, release, website or preview. Screenshots and listing details can be public; a free version or demo is not required. Previously public files can remain in repository history, caches or copies. ALTARA checks account access before delivering a paid package, but a buyer can copy content after delivery; there is no promise of copy-proof browser DRM.

For a free or purchased theme, sign in and choose Install on its listing, then Open ALTARA and Settings → Appearance → Community themes → Activate on the installed theme. Free listings also offer Download theme: use Import theme in ALTARA for a local copy. A local import alone does not create the account installation used for ratings and account updates. Buying does not install or apply CSS. Creators can use their own paid themes without buying them. Standard library export/edit and automatic theme-folder export do not detach paid account themes into local files.

For an update, keep the same ALTARA theme project, increase the package version, provide release notes and upload the complete new JSON package. Publish a new immutable version from that project's draft. Changing a GitHub file does not publish an ALTARA update. Existing buyers keep access to future versions of the same project without paying again. In ALTARA, open Settings → Appearance → Community themes → My account themes, then Review v… on the installed card. Read the notes, use Preview update, tick the update confirmation and choose Accept update, or Keep current version. An update accepted in ALTARA keeps an active theme active and an inactive theme inactive. For a local file, import the newer package and activate it separately.

ALTARA's commission is 5%; Stripe processing fees are separate and paid by the creator. A payment reaching Stripe is not an instant bank payout. Buyers can request withdrawal within 14 days worldwide, including after installation or use; applicable rights for problems can be raised later. The creator reviews and explicitly confirms the exact refund amount in ALTARA. Stripe returns it to the original payment method and returns ALTARA's proportional commission to the creator. Original Stripe processing fees may remain payable. Pending or uncertain refunds need status checking, not another refund. Confirmed partial refunds preserve access; confirmed full refunds end paid access when no other valid purchase grants it. See https://altaraapp.com/theme-refunds.

Ratings use an eligible installed account theme, from 1 to 5 stars. Open Details, rating & updates on its Appearance card, choose stars under Your rating and Save rating; you can edit or remove your own rating later. Creators cannot rate their own projects. A rating is not a security endorsement.

Guide: https://altaraapp.com/developers/themes/guide and the included docs/COMMUNITY_THEMES_V1.md.

## What you can program

Use ordinary CSS, native theme slots, colors, fonts already available on the device, spacing, responsive Grid/Flexbox, borders, shadows, transparency and blur. Supported native layouts are dashboard and glass-home; omit layout to preserve the native Home and personal widgets. Embedded raster assets use the API 2 contract in the guide.

To compose the whole shell, use API 2's regions-v1 plan in ALTARA 0.1.157 or later: four complete :root properties --altara-shell-layout, --altara-shell-areas, --altara-shell-columns and --altara-shell-rows. Place all seven native regions (servers, search, navigation, main, context, profile and voice) in a rectangular matrix. ALTARA's trusted bridge keeps their original nodes, controls, data and permissions. The JSON layout field remains a separate native Home choice. See examples/community-themes/shell-regions for lateral, header and mirrored compositions and the complete grammar in the included guide.

Use semantic tracks for native sizing, preserve collapse/drawer and context visibility, and leave desktop window controls clear. At 760px and below the host uses its own compact arrangement instead of your desktop matrix. Protected authentication, settings and sensitive decisions can suspend the composition. Older clients keep native placement and ordinary colors/surfaces; do not add fixed-position fallbacks or set host capability/internal geometry variables. Structural decoration is gated by the host's .app[data-altara-shell-layout="regions-v1"] marker. Test normal/reduced motion, real folders and drag/drop, calls, keyboard navigation, long names, resizing and collapse. Deactivate or press Ctrl+Alt+Shift+T to restore the native appearance without changing messages or widget data.

The --altara-widget-* variables in theme.css define a shared appearance once for native and isolated community widgets. New installs inherit the same validated palette and controls. You do not need selectors for each widget. Custom charts and closed components use the widget appearance SDK once; see docs/COMMUNITY_THEMES_V1.md for the contract and compatibility limits.

A theme cannot run JavaScript, arbitrary HTML, remote fonts, imports or tracking requests. Data, actions, navigation, privacy and sensitive controls belong to ALTARA. Preview uses fictional data and never activates the theme. Keep focus visible and respect reduced motion/transparency.

The builder uses the same ALTARA package/CSS validator. You do not need npm install or a copy of the ALTARA app. Validation tools are separate from the theme package; do not upload this ZIP to the theme importer.

CSS-tree's MIT licence and notice are included under lib/vendor/css-tree. The example file is a starter, not a published community release or verified author identity.
`;

async function getThemeStarterKitSources() {
  const { COMMUNITY_THEME_CODE_STARTER } = await import(pathToFileURL(path.join(root, 'theme/communityThemeStarter.js')).href);
  const { validateCommunityThemePackage } = await import(pathToFileURL(path.join(root, 'lib/communityThemePackages.js')).href);
  const { canonicalThemeJson } = await import(pathToFileURL(path.join(root, 'lib/themeCanonical.js')).href);
  const safe = validateCommunityThemePackage(COMMUNITY_THEME_CODE_STARTER);
  const { css, ...metadata } = safe;
  const files = {
    'README.md': Buffer.from(readme),
    'metadata.json': Buffer.from(JSON.stringify(metadata, null, 2) + '\n'),
    'theme.css': Buffer.from(css + '\n'),
    'example.altara-theme.json': Buffer.from(canonicalThemeJson(safe)),
    'package.json': Buffer.from(JSON.stringify({ private: true, type: 'module', engines: { node: '>=22' } }, null, 2) + '\n'),
  };
  for (const name of ['scripts/theme-package.mjs', 'lib/communityThemePackages.js', 'lib/themeCanonical.js',
    'lib/vendor/css-tree/csstree.esm.js', 'lib/vendor/css-tree/LICENSE', 'lib/vendor/css-tree/NOTICE.txt', 'docs/COMMUNITY_THEMES_V1.md']) {
    files[name] = await fs.readFile(path.join(root, name));
  }
  return files;
}

async function buildThemeStarterKit({ check = false, zipModule = process.env.ALTARA_THEME_ZIP_MODULE || 'jszip' } = {}) {
  const files = await getThemeStarterKitSources();
  const entries = Object.keys(files).sort().map(name => ({ path: name, bytes: files[name].length, sha256: hash(files[name]) }));
  if (check) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const bytes = await fs.readFile(kitPath);
    if (manifest.format !== 'altara-theme-starter-kit' || manifest.version !== 1 || manifest.sha256 !== hash(bytes)
      || manifest.bytes !== bytes.length || JSON.stringify(manifest.files) !== JSON.stringify(entries)) throw Error('Theme starter kit is stale or damaged. Rebuild it from the trusted source.');
    return { bytes: bytes.length, sha256: manifest.sha256, files: entries.length };
  }
  const JSZip = require(zipModule), zip = new JSZip();
  const date = new Date('1980-01-01T00:00:00Z');
  for (const entry of entries) zip.file(entry.path, files[entry.path], { date, createFolders: false });
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' });
  await fs.writeFile(kitPath, bytes);
  await fs.writeFile(manifestPath, JSON.stringify({ format: 'altara-theme-starter-kit', version: 1, sha256: hash(bytes), bytes: bytes.length, files: entries }, null, 2) + '\n');
  return { bytes: bytes.length, sha256: hash(bytes), files: entries.length };
}
module.exports = { buildThemeStarterKit, getThemeStarterKitSources };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) { process.stderr.write('Usage: node scripts/build-theme-starter-kit.cjs [--check]\n'); process.exitCode = 1; }
  else buildThemeStarterKit({ check: args.includes('--check') }).then(result => console.log(JSON.stringify(result))).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
