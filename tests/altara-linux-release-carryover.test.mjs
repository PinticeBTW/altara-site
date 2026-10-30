import assert from "node:assert/strict";
import test from "node:test";
import {
  createLinuxArtifactRedirectResponse,
  LinuxReleaseResolutionError,
  resolveLinuxRelease,
} from "../app/lib/altara-linux-release.ts";

function asset(name, tag = "v0.1.162", overrides = {}) {
  return {
    name, size: 1024, state: "uploaded",
    browser_download_url: `https://github.com/PinticeBTW/altara-updates/releases/download/${tag}/${name}`,
    ...overrides,
  };
}

function release(version = "0.1.161", tag = "v0.1.162") {
  return {
    tag_name: tag, draft: false, prerelease: false, published_at: "2026-10-18T22:00:00Z",
    assets: [
      `Altara-${version}-x86_64.AppImage`, `Altara-${version}-amd64.deb`,
      `Altara.${version}.tar.gz`, `SHA256SUMS-linux-${version}.txt`,
      `README-LINUX-${version}.txt`, "latest-linux.yml", "Altara.Setup.0.1.162.exe",
    ].map(name => asset(name, tag)),
  };
}

test("Windows-only releases retain one coherent Linux version in the current release", async () => {
  const payload = release();
  const result = resolveLinuxRelease(payload);
  assert.equal(result.version, "0.1.161");
  assert.equal(result.tagName, "v0.1.162");
  assert.equal(result.appImage.filename, "Altara-0.1.161-x86_64.AppImage");
  assert.equal(result.deb.filename, "Altara-0.1.161-amd64.deb");
  assert.equal(result.portable.filename, "Altara.0.1.161.tar.gz");
  assert.equal(result.checksum.filename, "SHA256SUMS-linux-0.1.161.txt");
  assert.equal(result.readme.filename, "README-LINUX-0.1.161.txt");
  for (const [kind, selected] of [["application", result.application], ["deb", result.deb], ["portable", result.portable], ["checksum", result.checksum]]) {
    const response = await createLinuxArtifactRedirectResponse(kind, async () => Response.json(payload));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), selected.url);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(selected.url, /\/download\/v0\.1\.162\//);
  }
});

test("newer Linux portable releases take precedence over older AppImages without mixing formats", () => {
  const payload = release();
  payload.assets.push(asset("Altara.0.1.162.tar.gz"), asset("SHA256SUMS-linux-0.1.162.txt"));
  const result = resolveLinuxRelease(payload);
  assert.equal(result.version, "0.1.162");
  assert.equal(result.application.filename, "Altara.0.1.162.tar.gz");
  assert.equal(result.appImage, null);
  assert.equal(result.deb, null);
  assert.equal(result.readme, null);
  assert.equal(result.checksum.filename, "SHA256SUMS-linux-0.1.162.txt");
});

test("retained Linux versions are ordered numerically and never select future or noncanonical builds", () => {
  const payload = release("0.1.9", "v0.1.100");
  payload.assets.push(...[
    "Altara.0.1.10.tar.gz", "Altara-0.1.101-x86_64.AppImage",
    "Altara.00.1.99.tar.gz", "Altara-0.1.99-arm64.AppImage",
  ].map(name => asset(name, "v0.1.100")));
  const result = resolveLinuxRelease(payload);
  assert.equal(result.version, "0.1.10");
  assert.equal(result.application.filename, "Altara.0.1.10.tar.gz");
  assert.equal(result.appImage, null);
  assert.equal(result.deb, null);
  assert.equal(result.checksum, null);
  assert.equal(result.readme, null);
});

test("retained Linux selection preserves URL and duplicate defenses", () => {
  for (const [change, code] of [
    [payload => { payload.assets[0].browser_download_url = payload.assets[0].browser_download_url.replace("PinticeBTW", "Other"); }, "unsafe_linux_appimage_asset_url"],
    [payload => { payload.assets[0].browser_download_url = payload.assets[0].browser_download_url.replace("v0.1.162/", "v0.1.161/"); }, "unsafe_linux_appimage_asset_url"],
    [payload => { payload.assets.push(payload.assets[0]); }, "multiple_linux_appimage_assets"],
  ]) {
    const payload = release(); change(payload);
    assert.throws(() => resolveLinuxRelease(payload), error => error instanceof LinuxReleaseResolutionError && error.code === code);
  }
});
