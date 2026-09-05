import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER,
  createPlatformAwareDownloadResponse,
  detectDownloadPlatform,
} from "../app/lib/altara-download-platform.ts";
import {
  createWindowsArtifactRedirectResponse,
  LinuxReleaseResolutionError,
  resolveLinuxRelease,
  resolveWindowsRelease,
} from "../app/lib/altara-linux-release.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const userAgents = {
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0",
  ubuntuFirefox:
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0",
  genericLinux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
  linuxAmd64: "Mozilla/5.0 (X11; Linux amd64) Gecko/20100101 Firefox/141.0",
  linuxAarch64: "Mozilla/5.0 (X11; Linux aarch64) Gecko/20100101 Firefox/141.0",
  linuxArm64: "Mozilla/5.0 (X11; Linux arm64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36",
  macos:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  ipad:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
};

function headers(userAgent = "", clientHint = "") {
  const result = new Headers();
  if (userAgent) result.set("User-Agent", userAgent);
  if (clientHint) result.set("Sec-CH-UA-Platform", clientHint);
  return result;
}

function releaseAsset(version, filename, overrides = {}) {
  const tagName = overrides.tagName ?? `v${version}`;
  return {
    name: filename,
    browser_download_url:
      overrides.browser_download_url ??
      `https://github.com/PinticeBTW/altara-updates/releases/download/${tagName}/${filename}`,
    size: overrides.size ?? 86_000_000,
    state: overrides.state ?? "uploaded",
  };
}

function releasePayload(version = "0.1.121", overrides = {}) {
  const tagName = overrides.tag_name ?? `v${version}`;
  return {
    tag_name: tagName,
    draft: false,
    prerelease: false,
    published_at: "2026-07-30T12:00:00Z",
    assets: [
      releaseAsset(version, `Altara.Setup.${version}.exe`, { tagName }),
      releaseAsset(version, `Altara.Setup.${version}.exe.blockmap`, { tagName }),
      releaseAsset(version, "latest.yml", { tagName, size: 512 }),
      releaseAsset(version, `Altara.${version}.tar.gz`, { tagName }),
      releaseAsset(version, `Altara.${version}.tar.gz.sha256`, { tagName, size: 96 }),
      releaseAsset(version, `README-LINUX-${version}.txt`, { tagName, size: 4_096 }),
    ],
    ...overrides,
  };
}

function expectResolutionError(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof LinuxReleaseResolutionError);
    assert.equal(error.code, code);
    return true;
  });
}

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolute)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function binaryRedirect(filename) {
  return new Response("binary", {
    status: 302,
    headers: {
      "Cache-Control": "public, s-maxage=9999",
      Location:
        `https://github.com/PinticeBTW/altara-updates/releases/download/v0.1.121/${filename}`,
    },
  });
}

async function smartResponse(requestHeaders) {
  return createPlatformAwareDownloadResponse(requestHeaders, {
    windows: async () => binaryRedirect("Altara.Setup.0.1.121.exe"),
    linuxDebian: async () => binaryRedirect("Altara-0.1.122-amd64.deb"),
    linuxGeneric: async () => binaryRedirect("Altara-0.1.122-x86_64.AppImage"),
  });
}

test("Windows 10/11 Chrome is classified as windows", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.windowsChrome)), "windows");
});

test("Windows Firefox is classified as windows", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.windowsFirefox)), "windows");
});

test("Ubuntu Firefox Linux x86_64 is classified as linux_deb_x64", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.ubuntuFirefox)), "linux_deb_x64");
});

test("generic X11 Linux x86_64 is classified as linux_x64", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.genericLinux)), "linux_x64");
});

test("Linux amd64 is classified as linux_x64", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.linuxAmd64)), "linux_x64");
});

test("Linux aarch64 is classified as linux_unsupported", () => {
  assert.equal(
    detectDownloadPlatform(headers(userAgents.linuxAarch64)),
    "linux_unsupported",
  );
});

test("Linux arm64 is classified as linux_unsupported", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.linuxArm64)), "linux_unsupported");
});

test("Android containing Linux is mobile, never linux_x64", () => {
  assert.equal(
    detectDownloadPlatform(headers(userAgents.android, '"Linux"')),
    "mobile",
  );
});

test("macOS Safari is classified as macos", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.macos)), "macos");
});

test("iPhone is classified as mobile", () => {
  assert.equal(detectDownloadPlatform(headers(userAgents.iphone)), "mobile");
});

test("iPad desktop-style Safari is classified as mobile", () => {
  assert.equal(
    detectDownloadPlatform(headers(userAgents.ipad, '"macOS"')),
    "mobile",
  );
});

test("empty headers are unknown", () => {
  assert.equal(detectDownloadPlatform(headers()), "unknown");
});

test("quoted Sec-CH-UA-Platform Windows takes priority", () => {
  assert.equal(detectDownloadPlatform(headers("custom desktop", '"Windows"')), "windows");
});

test("quoted Sec-CH-UA-Platform Linux uses the x86_64 UA architecture", () => {
  assert.equal(
    detectDownloadPlatform(headers(userAgents.ubuntuFirefox, '"Linux"')),
    "linux_deb_x64",
  );
});

test("Sec-CH-UA-Platform Linux without a known x64 architecture is unsupported", () => {
  assert.equal(
    detectDownloadPlatform(headers("Mozilla/5.0 (X11; Linux)", '"Linux"')),
    "linux_unsupported",
  );
});

test("platform detection handles mixed casing", () => {
  assert.equal(
    detectDownloadPlatform(headers("mOzIlLa/5.0", '"wInDoWs"')),
    "windows",
  );
});

test("/download sends a Windows UA to the latest Windows resolver", async () => {
  const response = await smartResponse(headers(userAgents.windowsChrome));
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /Altara\.Setup\.0\.1\.121\.exe$/);
});

test("/download sends an Ubuntu x64 UA to the shared DEB resolver", async () => {
  const response = await smartResponse(headers(userAgents.ubuntuFirefox));
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /Altara-0\.1\.122-amd64\.deb$/);
  assert.doesNotMatch(response.headers.get("location"), /\.sha256$/);
  assert.doesNotMatch(response.headers.get("location"), /README/i);
});

test("/download sends a generic Linux x64 UA to the shared AppImage resolver", async () => {
  const response = await smartResponse(headers(userAgents.genericLinux));
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /Altara-0\.1\.122-x86_64\.AppImage$/);
});

test("Linux ARM is sent to the chooser instead of the x64 archive", async () => {
  const response = await smartResponse(headers(userAgents.linuxArm64));
  assert.equal(response.headers.get("location"), "/downloads?platform=linux_unsupported");
});

test("macOS is sent to the chooser instead of a desktop binary", async () => {
  const response = await smartResponse(headers(userAgents.macos));
  assert.equal(response.headers.get("location"), "/downloads?platform=macos");
});

test("mobile is sent to the chooser instead of a desktop binary", async () => {
  const response = await smartResponse(headers(userAgents.android));
  assert.equal(response.headers.get("location"), "/downloads?platform=mobile");
});

test("unknown clients do not default to Windows", async () => {
  const response = await smartResponse(headers());
  assert.equal(response.headers.get("location"), "/downloads?platform=unknown");
});

test("platform-dependent redirects cannot be publicly cached across users", async () => {
  const [windows, linux] = await Promise.all([
    smartResponse(headers(userAgents.windowsChrome)),
    smartResponse(headers(userAgents.ubuntuFirefox)),
  ]);
  for (const response of [windows, linux]) {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Sec-CH-UA-Platform, User-Agent");
  }
  assert.notEqual(windows.headers.get("location"), linux.headers.get("location"));
});

test("the explicit Windows resolver selects only the exact stable installer", async () => {
  let requestNext;
  const response = await createWindowsArtifactRedirectResponse(
    async (_input, init) => {
      requestNext = init?.next;
      return Response.json(releasePayload());
    },
    { error() {} },
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://github.com/PinticeBTW/altara-updates/releases/download/v0.1.121/Altara.Setup.0.1.121.exe",
  );
  assert.equal(requestNext.revalidate, 90);
  assert.deepEqual(requestNext.tags, ["altara-latest-stable-release"]);
});

test("the Windows selector rejects blockmap and latest.yml as installers", () => {
  for (const filename of ["Altara.Setup.0.1.121.exe.blockmap", "latest.yml"]) {
    expectResolutionError("missing_windows_asset", () =>
      resolveWindowsRelease(
        releasePayload("0.1.121", {
          assets: [releaseAsset("0.1.121", filename)],
        }),
      ),
    );
  }
});

test("the Windows selector rejects wrong-version and duplicate installers", () => {
  expectResolutionError("missing_windows_asset", () =>
    resolveWindowsRelease(
      releasePayload("0.1.121", {
        assets: [releaseAsset("0.1.122", "Altara.Setup.0.1.122.exe")],
      }),
    ),
  );
  const matching = releaseAsset("0.1.121", "Altara.Setup.0.1.121.exe");
  expectResolutionError("multiple_windows_assets", () =>
    resolveWindowsRelease(
      releasePayload("0.1.121", { assets: [matching, matching] }),
    ),
  );
});

test("the Windows selector rejects unsafe redirect URLs", () => {
  expectResolutionError("unsafe_windows_asset_url", () =>
    resolveWindowsRelease(
      releasePayload("0.1.121", {
        assets: [
          releaseAsset("0.1.121", "Altara.Setup.0.1.121.exe", {
            browser_download_url:
              "https://example.com/PinticeBTW/altara-updates/releases/download/v0.1.121/Altara.Setup.0.1.121.exe",
          }),
        ],
      }),
    ),
  );
});

test("the Windows selector follows the stable published-release policy", () => {
  for (const overrides of [{ draft: true }, { prerelease: true }]) {
    assert.throws(
      () => resolveWindowsRelease(releasePayload("0.1.121", overrides)),
      LinuxReleaseResolutionError,
    );
  }
});

test("a GitHub API failure reaches the friendly Windows chooser fallback", async () => {
  const response = await createWindowsArtifactRedirectResponse(
    async () => new Response("unavailable", { status: 503 }),
    { error() {} },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/downloads?status=windows-unavailable");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("future v0.1.122 Windows and Linux assets are selected automatically", () => {
  const payload = releasePayload("0.1.122");
  assert.equal(
    resolveWindowsRelease(payload).application.filename,
    "Altara.Setup.0.1.122.exe",
  );
  assert.equal(resolveLinuxRelease(payload).application.filename, "Altara.0.1.122.tar.gz");
});

test("smart and explicit routes share resolvers without redirect loops", async () => {
  const [smartRoute, windowsRoute, linuxRoute] = await Promise.all([
    source("app/download/route.ts"),
    source("app/api/download/windows/route.ts"),
    source("app/api/download/linux/route.ts"),
  ]);
  assert.match(smartRoute, /createWindowsArtifactRedirectResponse/);
  assert.match(smartRoute, /createLinuxArtifactRedirectResponse\("debian"\)/);
  assert.match(smartRoute, /createLinuxArtifactRedirectResponse\("application"\)/);
  assert.match(smartRoute, /request\.headers/);
  assert.doesNotMatch(smartRoute, /searchParams|request\.url/);
  assert.doesNotMatch(windowsRoute, /["']\/download["']/);
  assert.doesNotMatch(linuxRoute, /["']\/download["']/);
});

test("UI uses smart generic CTA and explicit Windows/Linux platform routes", async () => {
  const [chrome, home, features, faq, chooser] = await Promise.all([
    source("app/components/site-chrome.tsx"),
    source("app/page.tsx"),
    source("app/features/page.tsx"),
    source("app/faq/page.tsx"),
    source("app/downloads/page.tsx"),
  ]);
  assert.match(chrome, /DOWNLOAD_URL\s*=\s*"\/download"/);
  assert.match(chrome, /WINDOWS_DOWNLOAD_URL\s*=\s*"\/api\/download\/windows"/);
  assert.match(chrome, /LINUX_DOWNLOAD_URL\s*=\s*"\/api\/download\/linux"/);
  assert.match(home, /href=\{DOWNLOAD_URL\}/);
  assert.match(`${home}\n${features}\n${chooser}`, /<WindowsDownloadOption \/>/);
  assert.match(`${home}\n${features}\n${chooser}`, /<LinuxDownloadOption \/>/);
  assert.match(faq, /href=\{WINDOWS_DOWNLOAD_URL\}/);
});

test("Linux is active and its truthful preview copy remains visible", async () => {
  const [chrome, home, chooser] = await Promise.all([
    source("app/components/site-chrome.tsx"),
    source("app/page.tsx"),
    source("app/downloads/page.tsx"),
  ]);
  const combined = `${chrome}\n${home}\n${chooser}`;
  const linuxOption = chrome.match(
    /export function LinuxDownloadOption\([^]*?\) \{[\s\S]*?(?=export function WindowsDownloadOption)/,
  )?.[0];
  assert.ok(linuxOption);
  assert.match(combined, /Download for Linux/);
  assert.match(combined, /Latest stable · /);
  assert.match(combined, /portable tar\.gz fallback/i);
  assert.doesNotMatch(linuxOption, /platform-btn-disabled/);
});

test("platform-neutral copy replaces stale Linux coming-soon wording", async () => {
  const files = await collectSourceFiles(path.join(repositoryRoot, "app"));
  const combined = (
    await Promise.all(files.map((filename) => readFile(filename, "utf8")))
  ).join("\n");
  assert.doesNotMatch(combined, /macOS\/Linux soon/i);
  assert.doesNotMatch(combined, /Linux\s+COMING SOON/i);
  assert.doesNotMatch(combined, /macOS and Linux are planned next/i);
  assert.doesNotMatch(combined, /Download ALTARA for Windows/i);
  assert.match(combined, /Available for Windows and Linux x64/);
  assert.match(combined, /macOS[^]*Coming soon/i);
});

test("chooser states Linux ARM64 unavailable and keeps browser access visible", async () => {
  const chooser = await source("app/downloads/page.tsx");
  assert.match(chooser, /Linux\s+ARM64 is not currently available/);
  assert.match(chooser, /<BrowserDownloadOption \/>/);
  assert.match(chooser, /<MacDownloadOption \/>/);
  assert.match(chooser, /Open Linux help/);
});

test("all download build markers are emitted through the site metadata", async () => {
  const [layout, platformHelper, linuxHelper] = await Promise.all([
    source("app/layout.tsx"),
    source("app/lib/altara-download-platform.ts"),
    source("app/lib/altara-linux-release.ts"),
  ]);
  assert.equal(
    ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER,
    "altara-site-platform-aware-download-v1",
  );
  assert.match(platformHelper, /altara-site-platform-aware-download-v1/);
  assert.match(linuxHelper, /altara-site-linux-download-v1/);
  assert.match(linuxHelper, /altara-site-linux-installers-v2/);
  assert.match(linuxHelper, /altara-linux-branding-routing-v3/);
  assert.match(layout, /ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER/);
  assert.match(layout, /ALTARA_SITE_LINUX_DOWNLOAD_MARKER/);
  assert.match(layout, /ALTARA_SITE_LINUX_INSTALLERS_MARKER/);
  assert.match(layout, /ALTARA_LINUX_BRANDING_ROUTING_MARKER/);
});

test("the website implementation does not hard-code release 0.1.121", async () => {
  const implementationFiles = [
    "app/lib/altara-linux-release.ts",
    "app/lib/altara-download-platform.ts",
    "app/download/route.ts",
    "app/api/download/windows/route.ts",
    "app/api/download/linux/route.ts",
    "app/downloads/page.tsx",
    "app/download/linux/page.tsx",
  ];
  const combined = (
    await Promise.all(implementationFiles.map((filename) => source(filename)))
  ).join("\n");
  assert.doesNotMatch(combined, /0\.1\.121/);
});
