#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const siteRoot = path.resolve(__dirname, "..");
const appRoot = path.join(siteRoot, "public", "app");

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

function patchAppShell(html) {
  let out = stripBaseTag(html);
  out = out.replace(/href=(["'])(?:\.\/)?style\.css\1/g, 'href="/app/style.css"');
  out = out.replace(/src=(["'])(?:\.\/)?app\.js\1/g, 'src="/app/app.js"');
  out = out.replace(/src=(["'])(?:\.\/)?build\/icon\.jpg\1/g, 'src="/app/build/icon.jpg"');
  out = out.replace(/href=(["'])(?:\.\/)?build\/icon\.png\1/g, 'href="/app/build/icon.png"');
  return out;
}

function patchAuthPage(html) {
  let out = stripBaseTag(html);
  out = out.replace(/href=(["'])(?:\.\/)?style\.css\1/g, 'href="/app/style.css"');
  out = out.replace(/href=(["'])(?:\.\/)?build\/icon\.png\1/g, 'href="/app/build/icon.png"');
  out = out.replace(/src=(["'])(?:\.\/)?build\/icon\.jpg\1/g, 'src="/app/build/icon.jpg"');
  out = out.replace(/src=(["'])(?:\.\/)?(login|register|profile)\.js\1/g, 'src="/app/$2.js"');
  out = out.replace(/href=(["'])\.\/(login|register|profile|index)\.html\1/g, 'href="/app/$2.html"');
  return out;
}

let changed = 0;
for (const file of shellFiles) {
  if (patchFile(file, patchAppShell)) changed += 1;
}
for (const file of authFiles) {
  if (patchFile(file, patchAuthPage)) changed += 1;
}

console.log(`[patch-altara-app-shell] Patched ${changed} app shell file(s).`);
