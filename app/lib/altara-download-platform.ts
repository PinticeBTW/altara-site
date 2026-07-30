export const ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER =
  "altara-site-platform-aware-download-v1";

export type AltaraDownloadPlatform =
  | "windows"
  | "linux_x64"
  | "linux_unsupported"
  | "macos"
  | "mobile"
  | "unknown";

type DownloadResolvers = {
  windows: () => Promise<Response>;
  linux: () => Promise<Response>;
};

const MOBILE_USER_AGENT =
  /\b(?:android|iphone|ipad|ipod|windows phone|mobile)\b/i;
const LINUX_ARM_ARCHITECTURE =
  /\b(?:aarch64|arm64|armv[5-9](?:l)?|armhf|armel)\b/i;
const LINUX_X64_ARCHITECTURE =
  /\b(?:x86_64|x86-64|amd64|x64)\b/i;

function normalizeClientHint(value: string | null): string {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim()
    .toLowerCase();
}

function classifyLinuxArchitecture(userAgent: string): AltaraDownloadPlatform {
  if (LINUX_ARM_ARCHITECTURE.test(userAgent)) {
    return "linux_unsupported";
  }
  if (LINUX_X64_ARCHITECTURE.test(userAgent)) {
    return "linux_x64";
  }
  return "linux_unsupported";
}

export function detectDownloadPlatform(
  requestHeaders: Pick<Headers, "get">,
): AltaraDownloadPlatform {
  const userAgent = String(requestHeaders.get("user-agent") || "").trim();

  // Mobile UAs can contain "Linux" or "Macintosh", so this must be resolved
  // before interpreting their desktop-looking client hint.
  if (MOBILE_USER_AGENT.test(userAgent)) {
    return "mobile";
  }

  const hintedPlatform = normalizeClientHint(
    requestHeaders.get("sec-ch-ua-platform"),
  );

  if (hintedPlatform) {
    if (hintedPlatform === "android" || hintedPlatform === "ios") {
      return "mobile";
    }
    if (hintedPlatform === "windows") {
      return "windows";
    }
    if (hintedPlatform === "macos" || hintedPlatform === "mac os") {
      return "macos";
    }
    if (hintedPlatform === "linux") {
      return classifyLinuxArchitecture(userAgent);
    }
  }

  if (!userAgent) {
    return "unknown";
  }
  if (/\bwindows nt\b/i.test(userAgent)) {
    return "windows";
  }
  if (/\b(?:macintosh|mac os x)\b/i.test(userAgent)) {
    return "macos";
  }
  if (/\blinux\b/i.test(userAgent)) {
    return classifyLinuxArchitecture(userAgent);
  }

  return "unknown";
}

function enforcePrivateNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Sec-CH-UA-Platform, User-Agent");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function chooserRedirect(platform: AltaraDownloadPlatform): Response {
  const destination = `/downloads?platform=${encodeURIComponent(platform)}`;
  return enforcePrivateNoStore(
    new Response("Choose a supported ALTARA platform.", {
      status: 302,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Location: destination,
      },
    }),
  );
}

export async function createPlatformAwareDownloadResponse(
  requestHeaders: Pick<Headers, "get">,
  resolvers: DownloadResolvers,
): Promise<Response> {
  const platform = detectDownloadPlatform(requestHeaders);

  if (platform === "windows") {
    return enforcePrivateNoStore(await resolvers.windows());
  }
  if (platform === "linux_x64") {
    return enforcePrivateNoStore(await resolvers.linux());
  }

  return chooserRedirect(platform);
}
