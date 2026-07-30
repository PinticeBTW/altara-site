export const ALTARA_SITE_LINUX_DOWNLOAD_MARKER = "altara-site-linux-download-v1";
export const ALTARA_SITE_LINUX_INSTALLERS_MARKER =
  "altara-site-linux-installers-v2";
export const ALTARA_LINUX_BRANDING_ROUTING_MARKER =
  "altara-linux-branding-routing-v3";
export const ALTARA_GITHUB_RELEASES_URL =
  "https://github.com/PinticeBTW/altara-updates/releases";
export const ALTARA_RELEASE_CACHE_SECONDS = 90;
export const LINUX_RELEASE_CACHE_SECONDS = ALTARA_RELEASE_CACHE_SECONDS;
export const WINDOWS_RELEASE_CACHE_SECONDS = ALTARA_RELEASE_CACHE_SECONDS;

const ALTARA_GITHUB_RELEASE_API_URL =
  "https://api.github.com/repos/PinticeBTW/altara-updates/releases/latest";
const ALTARA_GITHUB_OWNER = "PinticeBTW";
const ALTARA_GITHUB_REPOSITORY = "altara-updates";
const ALTARA_GITHUB_DOWNLOAD_HOST = "github.com";

type NextFetchRequestInit = RequestInit & {
  next?: {
    revalidate: number;
    tags: string[];
  };
};

export type LinuxReleaseFetch = (
  input: RequestInfo | URL,
  init?: NextFetchRequestInit,
) => Promise<Response>;

type GitHubReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
  size: number;
  state: string;
};

type ResolvedReleaseAsset = {
  filename: string;
  size: number;
  url: string;
};

export type LinuxReleaseArtifacts = {
  version: string;
  tagName: string;
  publishedAt: string;
  application: ResolvedReleaseAsset;
  appImage: ResolvedReleaseAsset | null;
  deb: ResolvedReleaseAsset | null;
  portable: ResolvedReleaseAsset | null;
  updateMetadata: ResolvedReleaseAsset | null;
  readme: ResolvedReleaseAsset | null;
  checksum: ResolvedReleaseAsset | null;
};

export type LinuxArtifactKind =
  | "application"
  | "debian"
  | "appimage"
  | "deb"
  | "portable"
  | "readme"
  | "checksum";

export type WindowsReleaseArtifacts = {
  version: string;
  tagName: string;
  publishedAt: string;
  application: ResolvedReleaseAsset;
};

export class LinuxReleaseResolutionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "LinuxReleaseResolutionError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new LinuxReleaseResolutionError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeReleaseVersion(tagName: unknown): string | null {
  if (typeof tagName !== "string") {
    return null;
  }

  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tagName);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function parseReleaseAsset(value: unknown): GitHubReleaseAsset | null {
  if (!isRecord(value)) {
    return null;
  }

  const { browser_download_url: browserDownloadUrl, name, size, state } = value;

  if (
    typeof name !== "string" ||
    typeof browserDownloadUrl !== "string" ||
    typeof state !== "string" ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    return null;
  }

  return {
    name,
    browserDownloadUrl,
    size,
    state,
  };
}

function parseStableRelease(payload: unknown) {
  if (!isRecord(payload)) {
    fail("malformed_release");
  }

  if (payload.draft === true) {
    fail("draft_release");
  }
  if (payload.draft !== false) {
    fail("malformed_release");
  }

  if (payload.prerelease === true) {
    fail("prerelease_release");
  }
  if (payload.prerelease !== false) {
    fail("malformed_release");
  }

  const version = normalizeReleaseVersion(payload.tag_name);
  if (!version || typeof payload.tag_name !== "string") {
    fail("invalid_release_tag");
  }

  if (
    typeof payload.published_at !== "string" ||
    payload.published_at.length === 0 ||
    Number.isNaN(Date.parse(payload.published_at))
  ) {
    fail("unpublished_release");
  }

  if (!Array.isArray(payload.assets)) {
    fail("malformed_release");
  }

  const assets = payload.assets.map(parseReleaseAsset);
  if (assets.some((asset) => asset === null)) {
    fail("malformed_release");
  }

  return {
    version,
    tagName: payload.tag_name,
    publishedAt: new Date(payload.published_at).toISOString(),
    assets: assets as GitHubReleaseAsset[],
  };
}

export function isSafeGitHubReleaseAssetUrl(
  destination: string,
  tagName: string,
  assetFilename: string,
): boolean {
  try {
    const url = new URL(destination);
    const expectedPath =
      `/${ALTARA_GITHUB_OWNER}/${ALTARA_GITHUB_REPOSITORY}/releases/download/` +
      `${encodeURIComponent(tagName)}/${encodeURIComponent(assetFilename)}`;

    return (
      url.protocol === "https:" &&
      url.hostname === ALTARA_GITHUB_DOWNLOAD_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === expectedPath &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function selectReleaseAsset(
  assets: GitHubReleaseAsset[],
  expectedFilename: string,
  tagName: string,
  artifactCode: string,
): ResolvedReleaseAsset | null {
  const matches = assets.filter(
    (asset) => asset.state === "uploaded" && asset.name === expectedFilename,
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length !== 1) {
    fail(`multiple_${artifactCode}_assets`);
  }

  const [asset] = matches;
  if (!isSafeGitHubReleaseAssetUrl(asset.browserDownloadUrl, tagName, expectedFilename)) {
    fail(`unsafe_${artifactCode}_asset_url`);
  }

  return {
    filename: asset.name,
    size: asset.size,
    url: asset.browserDownloadUrl,
  };
}

export function resolveLinuxRelease(payload: unknown): LinuxReleaseArtifacts {
  const release = parseStableRelease(payload);
  const { assets: validAssets, publishedAt, tagName, version } = release;
  const appImage = selectReleaseAsset(
    validAssets,
    `Altara-${version}-x86_64.AppImage`,
    tagName,
    "linux_appimage",
  );
  const deb = selectReleaseAsset(
    validAssets,
    `Altara-${version}-amd64.deb`,
    tagName,
    "linux_deb",
  );
  const portable = selectReleaseAsset(
    validAssets,
    `Altara.${version}.tar.gz`,
    tagName,
    "linux_portable",
  );
  const application = appImage ?? portable;
  if (!application) {
    fail("missing_linux_asset");
  }
  const updateMetadata = selectReleaseAsset(
    validAssets,
    "latest-linux.yml",
    tagName,
    "linux_update_metadata",
  );
  const readme = selectReleaseAsset(
    validAssets,
    `README-LINUX-${version}.txt`,
    tagName,
    "linux_readme",
  );
  const checksumManifest = selectReleaseAsset(
    validAssets,
    `SHA256SUMS-linux-${version}.txt`,
    tagName,
    "linux_checksum",
  );
  const legacyChecksum = portable
    ? selectReleaseAsset(
        validAssets,
        `${portable.filename}.sha256`,
        tagName,
        "linux_legacy_checksum",
      )
    : null;

  return {
    version,
    tagName,
    publishedAt,
    application,
    appImage,
    deb,
    portable,
    updateMetadata,
    readme,
    checksum: checksumManifest ?? legacyChecksum,
  };
}

export function resolveWindowsRelease(payload: unknown): WindowsReleaseArtifacts {
  const release = parseStableRelease(payload);
  const { assets, publishedAt, tagName, version } = release;
  const applicationFilename = `Altara.Setup.${version}.exe`;
  const matches = assets.filter(
    (asset) => asset.state === "uploaded" && asset.name === applicationFilename,
  );

  if (matches.length === 0) {
    fail("missing_windows_asset");
  }
  if (matches.length !== 1) {
    fail("multiple_windows_assets");
  }

  const [applicationAsset] = matches;
  if (
    !isSafeGitHubReleaseAssetUrl(
      applicationAsset.browserDownloadUrl,
      tagName,
      applicationFilename,
    )
  ) {
    fail("unsafe_windows_asset_url");
  }

  return {
    version,
    tagName,
    publishedAt,
    application: {
      filename: applicationAsset.name,
      size: applicationAsset.size,
      url: applicationAsset.browserDownloadUrl,
    },
  };
}

export async function fetchLatestLinuxRelease(
  fetchImplementation: LinuxReleaseFetch = fetch as LinuxReleaseFetch,
): Promise<LinuxReleaseArtifacts> {
  return resolveLinuxRelease(
    await fetchLatestStableReleasePayload(fetchImplementation),
  );
}

export async function fetchLatestWindowsRelease(
  fetchImplementation: LinuxReleaseFetch = fetch as LinuxReleaseFetch,
): Promise<WindowsReleaseArtifacts> {
  return resolveWindowsRelease(
    await fetchLatestStableReleasePayload(fetchImplementation),
  );
}

async function fetchLatestStableReleasePayload(
  fetchImplementation: LinuxReleaseFetch,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent":
      `ALTARA-Website-Downloads/3.0 (${ALTARA_LINUX_BRANDING_ROUTING_MARKER})`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetchImplementation(ALTARA_GITHUB_RELEASE_API_URL, {
      headers,
      next: {
        revalidate: ALTARA_RELEASE_CACHE_SECONDS,
        tags: ["altara-latest-stable-release"],
      },
    });
  } catch {
    fail("github_api_unavailable");
  }

  if (!response.ok) {
    fail("github_api_unavailable");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    fail("malformed_github_response");
  }

  return payload;
}

function getErrorCode(error: unknown): string {
  return error instanceof LinuxReleaseResolutionError ? error.code : "unexpected_error";
}

function temporaryRedirect(destination: string, body: string) {
  return new Response(body, {
    status: 302,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      Location: destination,
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function createLinuxArtifactRedirectResponse(
  artifactKind: LinuxArtifactKind,
  fetchImplementation: LinuxReleaseFetch = fetch as LinuxReleaseFetch,
  logger: Pick<Console, "error"> = console,
): Promise<Response> {
  try {
    const release = await fetchLatestLinuxRelease(fetchImplementation);
    const artifact = {
      application: release.application,
      debian: release.deb ?? release.portable,
      appimage: release.appImage,
      deb: release.deb,
      portable: release.portable,
      readme: release.readme,
      checksum: release.checksum,
    }[artifactKind];

    if (!artifact) {
      fail(`missing_${artifactKind}_asset`);
    }

    return temporaryRedirect(
      artifact.url,
      `Redirecting to the latest ALTARA Linux ${artifactKind} asset.`,
    );
  } catch (error) {
    const code = getErrorCode(error);
    logger.error(`[linux-download] release resolution failed (${code})`);

    const status =
      artifactKind === "application" ? "unavailable" : `${artifactKind}-unavailable`;
    return temporaryRedirect(
      `/download/linux?status=${status}`,
      "The ALTARA Linux download is temporarily unavailable.",
    );
  }
}

export async function createWindowsArtifactRedirectResponse(
  fetchImplementation: LinuxReleaseFetch = fetch as LinuxReleaseFetch,
  logger: Pick<Console, "error"> = console,
): Promise<Response> {
  try {
    const release = await fetchLatestWindowsRelease(fetchImplementation);
    return temporaryRedirect(
      release.application.url,
      "Redirecting to the latest ALTARA Windows installer.",
    );
  } catch (error) {
    const code = getErrorCode(error);
    logger.error(`[windows-download] release resolution failed (${code})`);
    return temporaryRedirect(
      "/downloads?status=windows-unavailable",
      "The ALTARA Windows download is temporarily unavailable.",
    );
  }
}
