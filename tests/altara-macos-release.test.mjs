import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolveMacRelease, createMacArtifactRedirectResponse } from "../app/lib/altara-linux-release.ts";

const version = "0.1.130";
function release() {
  return { tag_name: `v${version}`, draft: false, prerelease: false, published_at: "2026-09-07T22:00:00Z",
    assets: ["arm64", "x64"].map(arch => {
      const name = `Altara.${version}.mac-${arch}.dmg`;
      return { name, size: 1024, state: "uploaded", browser_download_url: `https://github.com/PinticeBTW/altara-updates/releases/download/v${version}/${name}` };
    }) };
}

test("macOS downloads resolve an explicit architecture from the stable official release", async () => {
  for (const arch of ["arm64", "x64"]) {
    const payload = release();
    const expected = payload.assets.find(a => a.name.includes(`mac-${arch}`)).browser_download_url;
    assert.equal(resolveMacRelease(payload, arch).application.url, expected);
    const response = await createMacArtifactRedirectResponse(arch, async () => Response.json(payload));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), expected);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("macOS resolver refuses missing, duplicate, cross-repository, draft and prerelease assets", async () => {
  const changes = [
    p => { p.assets = p.assets.filter(a => !a.name.includes("arm64")); },
    p => { p.assets.push(p.assets[0]); },
    p => { p.assets[0].browser_download_url = p.assets[0].browser_download_url.replace("PinticeBTW", "Other"); },
    p => { p.draft = true; }, p => { p.prerelease = true; },
  ];
  for (const change of changes) {
    const payload = release(); change(payload);
    assert.throws(() => resolveMacRelease(payload, "arm64"));
    const r = await createMacArtifactRedirectResponse("arm64", async () => Response.json(payload), { error() {} });
    assert.equal(r.headers.get("location"), "/downloads?platform=macos&status=macos-unavailable");
  }
  assert.throws(() => resolveMacRelease(release(), "universal"));
});

test("published browser manifest identifies the exact release and runtime bytes", () => {
  const read = p => readFileSync(new URL(`../public/app/${p}`, import.meta.url));
  const manifest = JSON.parse(read("release.json"));
  assert.equal(manifest.version, "0.1.135");
  assert.equal(manifest.appJsSha256, createHash("sha256").update(read("app.js")).digest("hex"));
  assert.equal(manifest.sfxJsSha256, createHash("sha256").update(read("lib/altaraSfx.js")).digest("hex"));
  assert.match(read("index.html").toString(), /release=0\.1\.135/);
});


test("new Windows/Linux release preserves the actual older Mac version and official release URL", async () => {
  const payload = release();
  payload.tag_name = "v0.1.135";
  for (const asset of payload.assets) asset.browser_download_url = asset.browser_download_url.replace("/v0.1.130/", "/v0.1.135/");
  for (const arch of ["arm64", "x64"]) {
    const resolved = resolveMacRelease(payload, arch);
    assert.equal(resolved.version, "0.1.130");
    assert.equal(resolved.tagName, "v0.1.135");
    const response = await createMacArtifactRedirectResponse(arch, async () => Response.json(payload));
    assert.match(response.headers.get("location"), new RegExp("/v0\\.1\\.135/Altara\\.0\\.1\\.130\\.mac-" + arch));
  }
  payload.assets[0].browser_download_url = payload.assets[0].browser_download_url.replace("PinticeBTW", "Other");
  assert.throws(() => resolveMacRelease(payload, "arm64"));
});

test("macOS never selects a future version or silently accepts duplicate preserved assets", () => {
  const future = release(); future.tag_name = "v0.1.129";
  assert.throws(() => resolveMacRelease(future, "arm64"));
  const duplicate = release(); duplicate.tag_name = "v0.1.135";
  for (const asset of duplicate.assets) asset.browser_download_url = asset.browser_download_url.replace("/v0.1.130/", "/v0.1.135/");
  duplicate.assets.push(duplicate.assets[0]);
  assert.throws(() => resolveMacRelease(duplicate, "arm64"));
});
