import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createLinuxArtifactRedirectResponse,
  fetchLatestLinuxRelease,
  fetchLatestWindowsRelease,
  LinuxReleaseResolutionError,
  resolveLinuxRelease,
} from "../app/lib/altara-linux-release.ts";
import {
  createPlatformAwareDownloadResponse,
  detectDownloadPlatform,
} from "../app/lib/altara-download-platform.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function asset(version, filename, overrides = {}) {
  const tagName = overrides.tagName ?? `v${version}`;
  return {
    name: filename,
    browser_download_url:
      overrides.browser_download_url ??
      `https://github.com/PinticeBTW/altara-updates/releases/download/${tagName}/${filename}`,
    size: overrides.size ?? 88_000_000,
    state: overrides.state ?? "uploaded",
  };
}

function installerRelease(version = "0.1.122", overrides = {}) {
  const tagName = overrides.tag_name ?? `v${version}`;
  return {
    tag_name: tagName,
    draft: false,
    prerelease: false,
    published_at: "2026-07-30T16:00:00Z",
    assets: [
      asset(version, `Altara-${version}-x86_64.AppImage`, { tagName }),
      asset(version, `Altara-${version}-amd64.deb`, { tagName }),
      asset(version, `Altara.${version}.tar.gz`, { tagName }),
      asset(version, "latest-linux.yml", { tagName, size: 1_024 }),
      asset(version, `SHA256SUMS-linux-${version}.txt`, { tagName, size: 512 }),
      asset(version, `README-LINUX-${version}.txt`, { tagName, size: 8_192 }),
      asset(version, `Altara.Setup.${version}.exe`, { tagName }),
      asset(version, `Altara.Setup.${version}.exe.blockmap`, { tagName }),
      asset(version, "latest.yml", { tagName, size: 512 }),
      asset(version, `Altara-${version}-arm64.AppImage`, { tagName }),
    ],
    ...overrides,
  };
}

function portableRelease(version = "0.1.121") {
  const tagName = `v${version}`;
  return {
    tag_name: tagName,
    draft: false,
    prerelease: false,
    published_at: "2026-07-30T12:00:00Z",
    assets: [
      asset(version, `Altara.${version}.tar.gz`, { tagName }),
      asset(version, `Altara.${version}.tar.gz.sha256`, { tagName, size: 96 }),
      asset(version, `README-LINUX-${version}.txt`, { tagName, size: 4_096 }),
    ],
  };
}

function headers(userAgent, clientHint = "") {
  const result = new Headers({ "User-Agent": userAgent });
  if (clientHint) result.set("Sec-CH-UA-Platform", clientHint);
  return result;
}

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

function expectResolutionError(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof LinuxReleaseResolutionError);
    assert.equal(error.code, code);
    return true;
  });
}

test("same-release Linux resolver selects AppImage, DEB, tar, metadata, README and checksums", () => {
  const result = resolveLinuxRelease(installerRelease());
  assert.equal(result.version, "0.1.122");
  assert.equal(result.application.filename, "Altara-0.1.122-x86_64.AppImage");
  assert.equal(result.appImage?.filename, "Altara-0.1.122-x86_64.AppImage");
  assert.equal(result.deb?.filename, "Altara-0.1.122-amd64.deb");
  assert.equal(result.portable?.filename, "Altara.0.1.122.tar.gz");
  assert.equal(result.updateMetadata?.filename, "latest-linux.yml");
  assert.equal(result.checksum?.filename, "SHA256SUMS-linux-0.1.122.txt");
  assert.equal(result.readme?.filename, "README-LINUX-0.1.122.txt");
});

test("a future v0.1.123 release is selected without source changes", () => {
  const result = resolveLinuxRelease(installerRelease("0.1.123"));
  assert.equal(result.application.filename, "Altara-0.1.123-x86_64.AppImage");
  assert.equal(result.deb?.filename, "Altara-0.1.123-amd64.deb");
  assert.equal(result.portable?.filename, "Altara.0.1.123.tar.gz");
});

test("current v0.1.121 remains a safe portable fallback before new assets exist", () => {
  const result = resolveLinuxRelease(portableRelease());
  assert.equal(result.application.filename, "Altara.0.1.121.tar.gz");
  assert.equal(result.appImage, null);
  assert.equal(result.deb, null);
  assert.equal(result.portable?.filename, "Altara.0.1.121.tar.gz");
  assert.equal(result.checksum?.filename, "Altara.0.1.121.tar.gz.sha256");
});

test("mismatched, ARM, Windows and verification files are never selected as applications", () => {
  const version = "0.1.122";
  const tagName = `v${version}`;
  const result = resolveLinuxRelease(
    installerRelease(version, {
      assets: [
        asset(version, "Altara-0.1.121-x86_64.AppImage", { tagName }),
        asset(version, "Altara-0.1.122-arm64.AppImage", { tagName }),
        asset(version, "Altara.Setup.0.1.122.exe", { tagName }),
        asset(version, "SHA256SUMS-linux-0.1.122.txt", { tagName }),
        asset(version, "README-LINUX-0.1.122.txt", { tagName }),
        asset(version, "latest-linux.yml", { tagName }),
        asset(version, "Altara.0.1.122.tar.gz", { tagName }),
      ],
    }),
  );
  assert.equal(result.application.filename, "Altara.0.1.122.tar.gz");
  assert.equal(result.appImage, null);
});

test("duplicate exact application assets fail safely", () => {
  for (const [filename, code] of [
    ["Altara-0.1.122-x86_64.AppImage", "multiple_linux_appimage_assets"],
    ["Altara-0.1.122-amd64.deb", "multiple_linux_deb_assets"],
    ["Altara.0.1.122.tar.gz", "multiple_linux_portable_assets"],
  ]) {
    const duplicate = asset("0.1.122", filename);
    expectResolutionError(code, () =>
      resolveLinuxRelease(
        installerRelease("0.1.122", { assets: [duplicate, duplicate] }),
      ),
    );
  }
});

test("unsafe exact application URLs fail rather than falling through", () => {
  expectResolutionError("unsafe_linux_appimage_asset_url", () =>
    resolveLinuxRelease(
      installerRelease("0.1.122", {
        assets: [
          asset("0.1.122", "Altara-0.1.122-x86_64.AppImage", {
            browser_download_url:
              "https://example.com/PinticeBTW/altara-updates/releases/download/v0.1.122/Altara-0.1.122-x86_64.AppImage",
          }),
          asset("0.1.122", "Altara.0.1.122.tar.gz"),
        ],
      }),
    ),
  );
});

test("explicit AppImage, DEB and portable redirects select only their exact format", async () => {
  const fetchMock = async () => Response.json(installerRelease());
  const [appImage, deb, portable] = await Promise.all([
    createLinuxArtifactRedirectResponse("appimage", fetchMock, { error() {} }),
    createLinuxArtifactRedirectResponse("deb", fetchMock, { error() {} }),
    createLinuxArtifactRedirectResponse("portable", fetchMock, { error() {} }),
  ]);
  assert.match(appImage.headers.get("location"), /Altara-0\.1\.122-x86_64\.AppImage$/);
  assert.match(deb.headers.get("location"), /Altara-0\.1\.122-amd64\.deb$/);
  assert.match(portable.headers.get("location"), /Altara\.0\.1\.122\.tar\.gz$/);
});

test("generic and Debian-family routes fall back to the same-release tar", async () => {
  const fetchMock = async () => Response.json(portableRelease());
  const [generic, debian] = await Promise.all([
    createLinuxArtifactRedirectResponse("application", fetchMock, { error() {} }),
    createLinuxArtifactRedirectResponse("debian", fetchMock, { error() {} }),
  ]);
  assert.match(generic.headers.get("location"), /Altara\.0\.1\.121\.tar\.gz$/);
  assert.equal(generic.headers.get("location"), debian.headers.get("location"));
});

test("a newly resolved stable release replaces an older portable fallback", async () => {
  const oldRelease = await fetchLatestLinuxRelease(async () =>
    Response.json(portableRelease()),
  );
  const newRelease = await fetchLatestLinuxRelease(async () =>
    Response.json(installerRelease("0.1.123")),
  );

  assert.equal(oldRelease.application.filename, "Altara.0.1.121.tar.gz");
  assert.equal(
    newRelease.application.filename,
    "Altara-0.1.123-x86_64.AppImage",
  );
  assert.equal(newRelease.deb?.filename, "Altara-0.1.123-amd64.deb");
  assert.equal(newRelease.portable?.filename, "Altara.0.1.123.tar.gz");
});

test("Windows and Linux use one shared latest-release cache identity", async () => {
  const calls = [];
  const fetchMock = async (input, init) => {
    calls.push({
      input: String(input),
      headers: { ...init?.headers },
      next: { ...init?.next },
    });
    return Response.json(installerRelease());
  };

  await Promise.all([
    fetchLatestLinuxRelease(fetchMock),
    fetchLatestWindowsRelease(fetchMock),
  ]);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].next.revalidate, 90);
  assert.deepEqual(calls[0].next.tags, ["altara-latest-stable-release"]);
});

test("Debian-family detection is explicit and generic Linux stays AppImage-oriented", () => {
  const ubuntu =
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0";
  const debian =
    "Mozilla/5.0 (X11; Debian; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0";
  const mint =
    "Mozilla/5.0 (X11; Linux Mint; Linux x86_64) AppleWebKit/537.36 Chrome/138";
  const generic =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138";

  assert.equal(detectDownloadPlatform(headers(ubuntu, '"Linux"')), "linux_deb_x64");
  assert.equal(detectDownloadPlatform(headers(debian)), "linux_deb_x64");
  assert.equal(detectDownloadPlatform(headers(mint)), "linux_deb_x64");
  assert.equal(detectDownloadPlatform(headers(generic)), "linux_x64");
});

test("smart Linux routing chooses DEB for Ubuntu and AppImage for generic x64", async () => {
  const destinations = [];
  const resolvers = {
    windows: async () => new Response(null, { status: 204 }),
    linuxDebian: async () => {
      destinations.push("deb");
      return new Response(null, { status: 302, headers: { Location: "/deb" } });
    },
    linuxGeneric: async () => {
      destinations.push("appimage");
      return new Response(null, { status: 302, headers: { Location: "/appimage" } });
    },
  };
  const ubuntu =
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0";
  const generic = "Mozilla/5.0 (X11; Linux amd64) Gecko/20100101 Firefox/141.0";
  const [debResponse, appImageResponse] = await Promise.all([
    createPlatformAwareDownloadResponse(headers(ubuntu), resolvers),
    createPlatformAwareDownloadResponse(headers(generic), resolvers),
  ]);
  assert.equal(debResponse.headers.get("location"), "/deb");
  assert.equal(appImageResponse.headers.get("location"), "/appimage");
  assert.deepEqual(destinations.sort(), ["appimage", "deb"]);
  for (const response of [debResponse, appImageResponse]) {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Sec-CH-UA-Platform, User-Agent");
  }
});

test("explicit route sources cannot loop through the smart /download route", async () => {
  const routeSources = await Promise.all(
    [
      "app/api/download/linux/route.ts",
      "app/api/download/linux/appimage/route.ts",
      "app/api/download/linux/deb/route.ts",
      "app/api/download/linux/portable/route.ts",
    ].map(source),
  );
  assert.match(routeSources[0], /createManualLinuxArtifactRedirectResponse\("application"\)/);
  assert.match(routeSources[1], /createManualLinuxArtifactRedirectResponse\("appimage"\)/);
  assert.match(routeSources[2], /createManualLinuxArtifactRedirectResponse\("deb"\)/);
  assert.match(routeSources[3], /createManualLinuxArtifactRedirectResponse\("portable"\)/);
  for (const route of routeSources) {
    assert.doesNotMatch(route, /["']\/download["']/);
    assert.match(route, /export const revalidate = 0/);
  }
});

test("Linux UI exposes all formats with honest update and compatibility copy", async () => {
  const [chrome, help, chooser] = await Promise.all([
    source("app/components/site-chrome.tsx"),
    source("app/download/linux/page.tsx"),
    source("app/downloads/page.tsx"),
  ]);
  const combined = `${chrome}\n${help}\n${chooser}`;
  assert.match(chrome, /LINUX_APPIMAGE_DOWNLOAD_URL = "\/api\/download\/linux\/appimage"/);
  assert.match(chrome, /LINUX_DEB_DOWNLOAD_URL = "\/api\/download\/linux\/deb"/);
  assert.match(chrome, /LINUX_PORTABLE_DOWNLOAD_URL = "\/api\/download\/linux\/portable"/);
  assert.match(combined, /Install for Ubuntu \/ Debian/);
  assert.match(combined, /\.deb package · Recommended for Ubuntu, Debian and Mint/);
  assert.match(combined, /Linux x64 · Single portable application/);
  assert.match(combined, /Portable fallback · Manual setup · Advanced users/);
  assert.match(combined, /Manual updates are required for the portable tar\.gz/);
  assert.match(combined, /not a silent update/);
  assert.match(combined, /Desktop\s+menu integration is not claimed/);
  assert.match(combined, /Linux\s+ARM64 is not currently available/);
  assert.doesNotMatch(combined, /0\.1\.122/);
});

test("all three download markers are preserved in production metadata", async () => {
  const [layout, releaseHelper, platformHelper] = await Promise.all([
    source("app/layout.tsx"),
    source("app/lib/altara-linux-release.ts"),
    source("app/lib/altara-download-platform.ts"),
  ]);
  assert.match(releaseHelper, /altara-site-linux-download-v1/);
  assert.match(platformHelper, /altara-site-platform-aware-download-v1/);
  assert.match(releaseHelper, /altara-site-linux-installers-v2/);
  assert.match(releaseHelper, /altara-linux-branding-routing-v3/);
  assert.match(layout, /ALTARA_SITE_LINUX_INSTALLERS_MARKER/);
  assert.match(layout, /ALTARA_LINUX_BRANDING_ROUTING_MARKER/);
});
