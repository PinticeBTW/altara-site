import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createLinuxArtifactRedirectResponse,
  fetchLatestLinuxRelease,
  isSafeGitHubReleaseAssetUrl,
  LinuxReleaseResolutionError,
  normalizeReleaseVersion,
  resolveLinuxRelease,
} from "../app/lib/altara-linux-release.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function releaseAsset(version, filename = `Altara.${version}.tar.gz`, overrides = {}) {
  const tagName = overrides.tagName ?? `v${version}`;
  return {
    name: filename,
    browser_download_url:
      overrides.browser_download_url ??
      `https://github.com/PinticeBTW/altara-updates/releases/download/${tagName}/${filename}`,
    size: overrides.size ?? 87_000_000,
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

async function sha256(relativePath) {
  const contents = (await readFile(path.join(repositoryRoot, relativePath), "utf8")).replace(
    /\r\n/g,
    "\n",
  );
  return createHash("sha256").update(contents).digest("hex");
}

test("selects Altara.0.1.121.tar.gz from release tag v0.1.121", () => {
  const result = resolveLinuxRelease(releasePayload());
  assert.equal(result.version, "0.1.121");
  assert.equal(result.application.filename, "Altara.0.1.121.tar.gz");
});

test("supports a future v0.1.122 release without source changes", () => {
  const result = resolveLinuxRelease(releasePayload("0.1.122"));
  assert.equal(result.version, "0.1.122");
  assert.equal(result.application.filename, "Altara.0.1.122.tar.gz");
  assert.equal(result.readme?.filename, "README-LINUX-0.1.122.txt");
  assert.equal(result.checksum?.filename, "Altara.0.1.122.tar.gz.sha256");
});

test("rejects source-code tar.gz archives", () => {
  const payload = releasePayload("0.1.121", {
    assets: [
      releaseAsset("0.1.121", "Source code (tar.gz)", {
        browser_download_url:
          "https://github.com/PinticeBTW/altara-updates/archive/refs/tags/v0.1.121.tar.gz",
      }),
    ],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects checksum assets as the Linux application", () => {
  const payload = releasePayload("0.1.121", {
    assets: [releaseAsset("0.1.121", "Altara.0.1.121.tar.gz.sha256")],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects README assets as the Linux application", () => {
  const payload = releasePayload("0.1.121", {
    assets: [releaseAsset("0.1.121", "README-LINUX-0.1.121.txt")],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects Windows exe assets", () => {
  const payload = releasePayload("0.1.121", {
    assets: [releaseAsset("0.1.121", "Altara.Setup.0.1.121.exe")],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects blockmap assets", () => {
  const payload = releasePayload("0.1.121", {
    assets: [releaseAsset("0.1.121", "Altara.Setup.0.1.121.exe.blockmap")],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects latest.yml", () => {
  const payload = releasePayload("0.1.121", {
    assets: [releaseAsset("0.1.121", "latest.yml")],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects malformed AppImage names, ARM64, and failed artifacts", () => {
  for (const asset of [
    releaseAsset("0.1.121", "Altara.0.1.121.AppImage"),
    releaseAsset("0.1.121", "Altara.0.1.121-arm64.tar.gz"),
    releaseAsset("0.1.121", "Altara.0.1.121.tar.gz", { state: "failed" }),
  ]) {
    expectResolutionError("missing_linux_asset", () =>
      resolveLinuxRelease(releasePayload("0.1.121", { assets: [asset] })),
    );
  }
});

test("rejects a Linux asset whose version differs from the release tag", () => {
  const payload = releasePayload("0.1.121", {
    assets: [releaseAsset("0.1.122")],
  });
  expectResolutionError("missing_linux_asset", () => resolveLinuxRelease(payload));
});

test("rejects malformed and missing release tags", () => {
  for (const tag_name of ["", "latest", "v0.1", "v0.1.121-beta", undefined]) {
    expectResolutionError("invalid_release_tag", () =>
      resolveLinuxRelease(releasePayload("0.1.121", { tag_name })),
    );
  }
  assert.equal(normalizeReleaseVersion("v0.1.122"), "0.1.122");
});

test("rejects draft releases", () => {
  expectResolutionError("draft_release", () =>
    resolveLinuxRelease(releasePayload("0.1.121", { draft: true })),
  );
});

test("rejects releases that have not been published", () => {
  for (const published_at of [null, "", "not-a-date"]) {
    expectResolutionError("unpublished_release", () =>
      resolveLinuxRelease(releasePayload("0.1.121", { published_at })),
    );
  }
});

test("rejects prereleases under the existing stable latest-release policy", () => {
  expectResolutionError("prerelease_release", () =>
    resolveLinuxRelease(releasePayload("0.1.121", { prerelease: true })),
  );
});

test("handles a release with no matching Linux asset", () => {
  expectResolutionError("missing_linux_asset", () =>
    resolveLinuxRelease(releasePayload("0.1.121", { assets: [] })),
  );
});

test("rejects multiple matching Linux assets safely", () => {
  const matching = releaseAsset("0.1.121");
  expectResolutionError("multiple_linux_portable_assets", () =>
    resolveLinuxRelease(releasePayload("0.1.121", { assets: [matching, matching] })),
  );
});

test("handles GitHub API failure without exposing a broken binary", async () => {
  const response = await createLinuxArtifactRedirectResponse(
    "application",
    async () => new Response("unavailable", { status: 503 }),
    { error() {} },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/download/linux?status=unavailable");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("handles malformed GitHub JSON", async () => {
  await assert.rejects(
    fetchLatestLinuxRelease(async () => {
      return {
        ok: true,
        status: 200,
        async json() {
          throw new SyntaxError("invalid JSON");
        },
      };
    }),
    (error) =>
      error instanceof LinuxReleaseResolutionError &&
      error.code === "malformed_github_response",
  );
});

test("rejects unsafe redirect hosts and non-HTTPS URLs", () => {
  const filename = "Altara.0.1.121.tar.gz";
  assert.equal(
    isSafeGitHubReleaseAssetUrl(
      `http://github.com/PinticeBTW/altara-updates/releases/download/v0.1.121/${filename}`,
      "v0.1.121",
      filename,
    ),
    false,
  );
  assert.equal(
    isSafeGitHubReleaseAssetUrl(
      `https://example.com/PinticeBTW/altara-updates/releases/download/v0.1.121/${filename}`,
      "v0.1.121",
      filename,
    ),
    false,
  );
  assert.equal(
    isSafeGitHubReleaseAssetUrl(
      `https://github.com/SomebodyElse/altara-updates/releases/download/v0.1.121/${filename}`,
      "v0.1.121",
      filename,
    ),
    false,
  );
});

test("produces a temporary safe redirect for the valid Linux asset", async () => {
  let requestHeaders;
  let requestNext;
  const response = await createLinuxArtifactRedirectResponse(
    "application",
    async (_input, init) => {
      requestHeaders = init?.headers;
      requestNext = init?.next;
      return Response.json(releasePayload());
    },
    { error() {} },
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://github.com/PinticeBTW/altara-updates/releases/download/v0.1.121/Altara.0.1.121.tar.gz",
  );
  assert.equal(requestHeaders.Accept, "application/vnd.github+json");
  assert.equal(
    requestHeaders["User-Agent"],
    "ALTARA-Website-Downloads/3.0 (altara-linux-branding-routing-v3)",
  );
  assert.equal(requestNext.revalidate, 90);
  assert.deepEqual(requestNext.tags, ["altara-latest-stable-release"]);

  const route = await source("app/api/download/linux/route.ts");
  assert.match(route, /export const revalidate = 0/);
  assert.match(route, /createLinuxArtifactRedirectResponse\("application"\)/);
});

test("Linux website buttons target the server-side resolver", async () => {
  const [home, features, faq, chrome] = await Promise.all([
    source("app/page.tsx"),
    source("app/features/page.tsx"),
    source("app/faq/page.tsx"),
    source("app/components/site-chrome.tsx"),
  ]);
  assert.match(chrome, /LINUX_DOWNLOAD_URL\s*=\s*"\/api\/download\/linux"/);
  assert.match(home, /<LinuxDownloadOption \/>/);
  assert.match(features, /<LinuxDownloadOption \/>/);
  assert.match(faq, /href=\{LINUX_DOWNLOAD_URL\}/);
});

test("Linux copy presents AppImage and DEB while keeping tar manual-only", async () => {
  const [chrome, help] = await Promise.all([
    source("app/components/site-chrome.tsx"),
    source("app/download/linux/page.tsx"),
  ]);
  const combined = `${chrome}\n${help}`;
  assert.match(combined, /Download for Linux/);
  assert.match(combined, /Latest stable · /);
  assert.match(combined, /Install for Ubuntu \/ Debian/);
  assert.match(combined, /Portable fallback · Manual setup · Advanced users/);
  assert.match(combined, /Manual updates are required for the portable tar\.gz/);
  assert.doesNotMatch(combined, /README-LINUX-0\.1\.121/);
});

test("the generic CTA stays on /download while Windows has an explicit resolver", async () => {
  const [chrome, smartRoute, windowsRoute] = await Promise.all([
    source("app/components/site-chrome.tsx"),
    source("app/download/route.ts"),
    source("app/api/download/windows/route.ts"),
  ]);
  assert.match(chrome, /DOWNLOAD_URL\s*=\s*"\/download"/);
  assert.match(chrome, /WINDOWS_DOWNLOAD_URL\s*=\s*"\/api\/download\/windows"/);
  assert.match(smartRoute, /createPlatformAwareDownloadResponse/);
  assert.match(windowsRoute, /createWindowsArtifactRedirectResponse/);
});

test("/try source behavior remains unchanged across platform line endings", async () => {
  assert.equal(
    await sha256("app/try/route.ts"),
    "0b668e2321bfd719ce56e24fd1b5f143ef5c30364c355c39097d2f8a6855dbf6",
  );
});

test("embedded web app route behavior remains unchanged across platform line endings", async () => {
  assert.equal(
    await sha256("app/app/route.ts"),
    "758c6cb7427526c47a517521921ab0603a50b43ae1e8c71a0964fe5d6d324947",
  );
});

test("embedded app shell preserves the offline hotfix cache-buster", async () => {
  const [patcher, appShell] = await Promise.all([
    source("scripts/patch-altara-app-shell.cjs"),
    source("public/app/index.html"),
  ]);
  assert.match(patcher, /const offlineReconnectMarker/);
  assert.match(patcher, /hotfix=\$\{encodeURIComponent\(offlineReconnectMarker\)\}/);
  assert.match(patcher, /appJsQuery/);
  assert.match(
    appShell,
    /src="\/app\/app\.js\?release=0\.1\.140&amp;v=server-read-message-history-ux-v3&amp;hotfix=offline-auth-reconnect-v1"/,
  );
});
