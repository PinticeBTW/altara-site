const FALLBACK_URL = "/app/index.html";
const WEB_APP_URL_ENV_KEYS = ["ALTARA_WEB_URL", "NEXT_PUBLIC_TRY_IN_BROWSER_URL"];

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return new Response("Opening ALTARA in your browser.", {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      Location: getTryInBrowserUrl(request),
    },
  });
}

function getTryInBrowserUrl(request: Request) {
  const configuredUrl = getConfiguredWebAppUrl();

  if (!configuredUrl) {
    return new URL(FALLBACK_URL, request.url).toString();
  }

  if (configuredUrl.startsWith("/")) {
    return new URL(configuredUrl, request.url).toString();
  }

  return configuredUrl;
}

function getConfiguredWebAppUrl() {
  for (const envKey of WEB_APP_URL_ENV_KEYS) {
    const value = process.env[envKey]?.trim();

    if (value && value !== FALLBACK_URL && value !== "/try") {
      return normalizeWebAppUrl(value);
    }
  }
}

function normalizeWebAppUrl(value: string) {
  if (value.startsWith("/")) {
    if (value === "/app" || value === "/app/") {
      return FALLBACK_URL;
    }

    return value;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return undefined;
  }
}
