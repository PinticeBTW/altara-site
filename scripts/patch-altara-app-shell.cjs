#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const siteRoot = path.resolve(__dirname, "..");
const appRoot = path.join(siteRoot, "public", "app");
// Deployment clients exclude node_modules, even inside public. Keep the browser
// SDK at a normal static-asset path while desktop retains its package layout.
const sdkSource = path.join(appRoot, "node_modules/livekit-client/dist/livekit-client.esm.mjs");
const sdkTarget = path.join(appRoot, "vendor/livekit-client/livekit-client.esm.mjs");
if (fs.existsSync(sdkSource)) {
  fs.mkdirSync(path.dirname(sdkTarget), { recursive: true });
  fs.copyFileSync(sdkSource, sdkTarget);
}
if (!fs.existsSync(sdkTarget)) throw new Error("Missing browser LiveKit SDK");
for (const relative of ["app.js", "lib/callErrorStatus.js", "lib/serverVoiceCamera.js", "lib/serverVoiceLiveKit.js", "lib/serverVoiceScreenshare.js", "lib/cameraMirror.js"]) {
  const file = path.join(appRoot, relative);
  const source = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, source.replaceAll("node_modules/livekit-client/dist/livekit-client.esm.mjs", "vendor/livekit-client/livekit-client.esm.mjs"));
}
const manifestFile = path.join(appRoot, "release.json");
if (fs.existsSync(manifestFile)) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.appJsSha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(appRoot, "app.js"))).digest("hex");
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}
const appJsPath = path.join(appRoot, "app.js");
const appJsSource = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, "utf8") : "";
const assetVersion = appJsSource.match(/const assetVersion = "([^"]+)"/)?.[1] || "";
const offlineReconnectMarker =
  appJsSource.match(/const offlineReconnectMarker = "([^"]+)"/)?.[1] || "";
const releaseManifestPath = path.join(appRoot, "release.json");
const releaseVersion = fs.existsSync(releaseManifestPath)
  ? JSON.parse(fs.readFileSync(releaseManifestPath, "utf8")).version : "";
const releasePatch = fs.existsSync(releaseManifestPath)
  ? JSON.parse(fs.readFileSync(releaseManifestPath, "utf8")).patch : "";
const appJsQuery = [
  releaseVersion ? `release=${encodeURIComponent(releaseVersion)}` : "",
  releasePatch ? `patch=${encodeURIComponent(releasePatch)}` : "",
  assetVersion ? `v=${encodeURIComponent(assetVersion)}` : "",
  offlineReconnectMarker
    ? `hotfix=${encodeURIComponent(offlineReconnectMarker)}`
    : "",
].filter(Boolean).join("&amp;");

const shellFiles = [
  "index.html",
  "404.html",
  path.join("oauth2", "authorize", "index.html"),
  path.join("developers", "index.html"),
  path.join("developers", "applications", "index.html"),
];

const authFiles = [
  "login.html",
  "register.html",
  "profile.html",
];

function patchFile(relativePath, patcher) {
  const filePath = path.join(appRoot, relativePath);
  if (!fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, "utf8");
  const after = patcher(before);
  if (after !== before) fs.writeFileSync(filePath, after, "utf8");
  return after !== before;
}

function stripBaseTag(html) {
  return html.replace(/\s*<base\s+[^>]*>\s*/i, "\n");
}

// Nested authorization/developer routes need the same static asset root.
// Preserve cache queries, and leave external URLs and app navigation unchanged.
function patchStaticAssets(html) {
  return html.replace(/((?:src|href)=["'])(?:\.\/)?((?:lib|assets|build)\/[^"']+|(?:style\.css|runtimeChrome\.css|ui\.js|supabaseClient\.js)(?:\?[^"']*)?)(["'])/g, '$1/app/$2$3');
}

function patchAppShell(html) {
  let out = stripBaseTag(html);
  out = out.replace(/href=(["'])(?:\.\/)?style\.css\1/g, 'href="/app/style.css"');
  out = out.replace(
    /src=(["'])(?:(?:\.\/)|(?:\/app\/))?app\.js(?:\?[^"']*)?\1/g,
    `src="/app/app.js${appJsQuery ? `?${appJsQuery}` : ""}"`,
  );
  out = out.replace(/src=(["'])(?:\.\/)?build\/icon\.jpg\1/g, 'src="/app/build/icon.jpg"');
  out = out.replace(/href=(["'])(?:\.\/)?build\/icon\.png\1/g, 'href="/app/build/icon.png"');
  out = out.replace(/(src|href)=(["'])(?:\.\/)?assets\/brand\/([^"']+)\2/g, '$1="/app/assets/brand/$3"');
  out = out.replace(/href=(["'])(?:\.\/)?build\/icon\.ico\1/g, 'href="/app/build/icon.ico"');
  return patchStaticAssets(out);
}

function patchAuthPage(html) {
  let out = stripBaseTag(html);
  out = out.replace(/href=(["'])(?:\.\/)?style\.css\1/g, 'href="/app/style.css"');
  out = out.replace(/href=(["'])(?:\.\/)?build\/icon\.png\1/g, 'href="/app/build/icon.png"');
  out = out.replace(/src=(["'])(?:\.\/)?build\/icon\.jpg\1/g, 'src="/app/build/icon.jpg"');
  out = out.replace(/src=(["'])(?:\.\/)?(login|register|profile)\.js\1/g, 'src="/app/$2.js"');
  out = out.replace(/href=(["'])\.\/(login|register|profile|index)\.html\1/g, 'href="/app/$2.html"');
  out = out.replace(/(src|href)=(["'])(?:\.\/)?assets\/brand\/([^"']+)\2/g, '$1="/app/assets/brand/$3"');
  out = out.replace(/href=(["'])(?:\.\/)?build\/icon\.ico\1/g, 'href="/app/build/icon.ico"');
  return patchStaticAssets(out);
}

let changed = 0;
for (const file of shellFiles) {
  if (patchFile(file, patchAppShell)) changed += 1;
}
for (const file of authFiles) {
  if (patchFile(file, patchAuthPage)) changed += 1;
}

console.log(`[patch-altara-app-shell] Patched ${changed} app shell file(s).`);
