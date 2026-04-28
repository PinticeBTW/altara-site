const GITHUB_RELEASE_API_URL =
  "https://api.github.com/repos/PinticeBTW/altara-updates/releases/latest";
const GITHUB_RELEASES_PAGE_URL = "https://github.com/PinticeBTW/altara-updates/releases";
const CACHE_SECONDS = 300;

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
  state?: string;
};

type GitHubRelease = {
  html_url?: string;
  assets: GitHubReleaseAsset[];
};

export const revalidate = 300;

export async function GET() {
  try {
    const release = await getLatestRelease();
    const installerAsset = pickWindowsInstaller(release.assets);

    return redirectTo(
      installerAsset?.browser_download_url ?? release.html_url ?? GITHUB_RELEASES_PAGE_URL,
    );
  } catch (error) {
    console.error("Failed to resolve latest Altara release asset", error);
    return redirectTo(GITHUB_RELEASES_PAGE_URL);
  }
}

async function getLatestRelease(): Promise<GitHubRelease> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const token = process.env.GITHUB_TOKEN?.trim();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(GITHUB_RELEASE_API_URL, {
    headers,
    next: {
      revalidate: CACHE_SECONDS,
      tags: ["altara-latest-release"],
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release API responded with ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!isGitHubRelease(payload)) {
    throw new Error("GitHub release API returned an unexpected payload");
  }

  return payload;
}

function pickWindowsInstaller(assets: GitHubReleaseAsset[]) {
  const uploadedAssets = assets.filter((asset) => asset.state === undefined || asset.state === "uploaded");

  return (
    uploadedAssets.find((asset) => /^Altara\.Setup\..*\.exe$/i.test(asset.name)) ??
    uploadedAssets.find((asset) => /\.(exe|msi)$/i.test(asset.name))
  );
}

function redirectTo(destination: string) {
  return new Response("Redirecting to the latest Altara installer.", {
    status: 302,
    headers: {
      "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`,
      "Content-Type": "text/plain; charset=utf-8",
      Location: destination,
    },
  });
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const release = value as { assets?: unknown; html_url?: unknown };

  return (
    Array.isArray(release.assets) &&
    release.assets.every(isGitHubReleaseAsset) &&
    (release.html_url === undefined || typeof release.html_url === "string")
  );
}

function isGitHubReleaseAsset(value: unknown): value is GitHubReleaseAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as {
    browser_download_url?: unknown;
    name?: unknown;
    state?: unknown;
  };

  return (
    typeof asset.name === "string" &&
    typeof asset.browser_download_url === "string" &&
    (asset.state === undefined || typeof asset.state === "string")
  );
}
