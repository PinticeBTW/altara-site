export const YOUTUBE_CALLBACK_MESSAGE_TYPE = "altara:youtube-callback";

export type YouTubeCallbackReason =
  | "youtube_callback_failed"
  | "youtube_login_cancelled"
  | "youtube_session_mismatch"
  | "youtube_not_configured"
  | "youtube_channel_not_found"
  | "youtube_api_unavailable";

type ReturnToOptions = {
  allowLocalhost?: boolean;
  expectedState?: string;
  expectedStatus?: "connected" | "error";
};

const PRODUCTION_WEB_ORIGINS = new Set([
  "https://altaraapp.com",
  "https://www.altaraapp.com",
]);
const WEB_APP_PATHS = new Set(["/app/", "/app/index.html"]);
const ELECTRON_RETURN_KEYS = new Set([
  "connection",
  "reason",
  "status",
]);

const REASON_ALIASES: Readonly<Record<string, YouTubeCallbackReason>> = {
  access_denied: "youtube_login_cancelled",
  cancelled: "youtube_login_cancelled",
  canceled: "youtube_login_cancelled",
  youtube_login_cancelled: "youtube_login_cancelled",
  expired_state: "youtube_session_mismatch",
  invalid_state: "youtube_session_mismatch",
  missing_code_or_state: "youtube_session_mismatch",
  missing_state: "youtube_session_mismatch",
  state_expired: "youtube_session_mismatch",
  state_not_found: "youtube_session_mismatch",
  youtube_session_mismatch: "youtube_session_mismatch",
  missing_google_oauth_env: "youtube_not_configured",
  missing_supabase_env: "youtube_not_configured",
  youtube_not_configured: "youtube_not_configured",
  youtube_channel_not_found: "youtube_channel_not_found",
  youtube_api_unavailable: "youtube_api_unavailable",
  youtube_callback_failed: "youtube_callback_failed",
};

export function normalizeReason(value: string): YouTubeCallbackReason {
  const reason = String(value || "").trim().toLowerCase();
  return REASON_ALIASES[reason] || "youtube_callback_failed";
}

export function isValidOAuthState(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value || ""));
}

export function serializeForInlineScript(value: unknown): string {
  const serialized = JSON.stringify(value);
  return (serialized === undefined ? "null" : serialized)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function normalizeReturnTo(value: string, options: ReturnToOptions = {}): string {
  const raw = String(value || "");
  if (!raw || raw !== raw.trim() || raw.length > 2_000 || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    return "";
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }

  if (url.username || url.password) return "";

  if (url.protocol === "altara:") {
    return normalizeElectronReturnTo(url, options);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (!WEB_APP_PATHS.has(url.pathname)) return "";

  const isProductionOrigin = PRODUCTION_WEB_ORIGINS.has(url.origin);
  const isApprovedLocalhost = options.allowLocalhost === true && isLocalhostUrl(url);
  if (!isProductionOrigin && !isApprovedLocalhost) return "";

  if (options.expectedState || options.expectedStatus) {
    if (!hasExpectedResultParameters(url, options)) return "";
  }

  return url.toString();
}

export function getPostMessageTargetOrigin(returnTo: string): string {
  try {
    const url = new URL(returnTo);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function normalizeElectronReturnTo(url: URL, options: ReturnToOptions): string {
  if (
    url.hostname !== "connections"
    || url.pathname !== ""
    || url.port
    || url.hash
  ) {
    return "";
  }

  const keys = Array.from(url.searchParams.keys());
  if (keys.some((key) => !ELECTRON_RETURN_KEYS.has(key))) return "";
  if (!hasSingleValue(url, "connection", "youtube")) return "";

  if (options.expectedState || options.expectedStatus) {
    const expectedState = String(options.expectedState || "");
    const expectedStatus = options.expectedStatus;
    if (!isValidOAuthState(expectedState) || !expectedStatus) return "";
    if (!hasSingleValue(url, "status", `youtube-${expectedStatus}.${expectedState}`)) return "";
    const expectedKeyCount = expectedStatus === "error" ? 3 : 2;
    if (keys.length !== expectedKeyCount) return "";
    const reasons = url.searchParams.getAll("reason");
    if (expectedStatus === "connected" && reasons.length !== 0) return "";
    if (expectedStatus === "error" && (reasons.length !== 1 || normalizeReason(reasons[0]) !== reasons[0])) {
      return "";
    }
  } else if (keys.length !== 1) {
    return "";
  }

  return url.toString();
}

function hasExpectedResultParameters(url: URL, options: ReturnToOptions): boolean {
  const expectedState = String(options.expectedState || "");
  const expectedStatus = options.expectedStatus;
  if (!isValidOAuthState(expectedState) || !expectedStatus) return false;
  if (!hasSingleValue(url, "connection", "youtube")) return false;
  if (!hasSingleValue(url, "oauth_state", expectedState)) return false;
  if (!hasSingleValue(url, "status", expectedStatus)) return false;
  if (!hasSingleValue(url, "youtubeConnection", expectedStatus)) return false;

  const reasons = url.searchParams.getAll("reason");
  if (expectedStatus === "connected") return reasons.length === 0;
  if (reasons.length !== 1) return false;
  return normalizeReason(reasons[0]) === reasons[0];
}

function hasSingleValue(url: URL, key: string, expected: string): boolean {
  const values = url.searchParams.getAll(key);
  return values.length === 1 && values[0] === expected;
}

function isLocalhostUrl(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}
