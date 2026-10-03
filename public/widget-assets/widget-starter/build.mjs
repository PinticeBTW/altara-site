import fs from 'node:fs';
// This starter exports one fixed HTML file. Framework projects should use their
// own bundler to inline JavaScript/CSS and embed assets as data URLs.
const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const sdk = fs.readFileSync(new URL('./altara-sdk.js', import.meta.url), 'utf8').replace('export const altara', 'const altara');
const js = fs.readFileSync(new URL('./widget.js', import.meta.url), 'utf8').replace(/import \{ altara \} from '\.\/altara-sdk\.js';/, '');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  .replace('<link rel="stylesheet" href="./style.css">', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
  .replace('<script type="module" src="./widget.js"></script>', `<script type="module">${(sdk + '\n' + js).replace(/<\/script/gi, '<\\/script')}</script>`);
fs.writeFileSync(new URL('./release.html', import.meta.url), html);
// Keep the Marketplace upload at the root and also produce a complete static
// website for hosts configured to publish dist (including Netlify).
const dist = new URL('./dist/', import.meta.url);
fs.mkdirSync(dist, { recursive: true });
for (const name of ['index.html', 'style.css', 'widget.js', 'altara-sdk.js', 'manifest.json', 'icon.svg', 'release.html', '_headers']) {
  fs.copyFileSync(new URL(name, import.meta.url), new URL(name, dist));
}
console.log('Created dist/ for hosting and release.html for the ALTARA Marketplace.');
