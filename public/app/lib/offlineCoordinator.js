export const ALTARA_AUTH_STATE = Object.freeze({
  NO_LOCAL_SESSION: "no_local_session",
  VALID_SESSION: "valid_session",
  CONCLUSIVELY_INVALID_SESSION: "conclusively_invalid_session",
  NETWORK_INDETERMINATE: "network_indeterminate",
  BACKEND_TEMPORARILY_UNAVAILABLE: "backend_temporarily_unavailable",
  UNEXPECTED_BOOT_ERROR: "unexpected_boot_error",
});

const CONCLUSIVE_AUTH_CODES = new Set([
  "bad_jwt",
  "invalid_grant",
  "invalid_jwt",
  "invalid_refresh_token",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "refresh_token_revoked",
  "session_not_found",
  "user_not_found",
]);

const CONCLUSIVE_AUTH_MESSAGES = [
  /auth session missing/i,
  /invalid refresh token/i,
  /refresh token (?:has already been used|is revoked|not found)/i,
  /session (?:has been )?(?:revoked|expired permanently)/i,
  /user not found/i,
  /invalid jwt/i,
  /jwt (?:is )?(?:expired|invalid)/i,
];

const NETWORK_ERROR_MESSAGES = [
  /failed to fetch/i,
  /network(?: request)? (?:failed|error|unavailable)/i,
  /networkerror/i,
  /load failed/i,
  /\b(?:abort|aborted|timeout|timed out)\b/i,
  /\b(?:dns|enotfound|eai_again|econnreset|econnrefused|etimedout)\b/i,
  /\b(?:tls|certificate|socket hang up)\b/i,
  /backend_ping_failed/i,
  /network_offline/i,
];

function readErrorText(error) {
  return [
    error?.message,
    error?.error_description,
    error?.details,
    error?.hint,
    typeof error === "string" ? error : "",
  ].filter(Boolean).join(" ").trim();
}

function readErrorCode(error) {
  return String(
    error?.code
    || error?.error_code
    || error?.name
    || "",
  ).trim().toLowerCase();
}

function readErrorStatus(error) {
  const value = Number(error?.status ?? error?.statusCode ?? error?.httpStatus ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function isConnectivityError(error, { navigatorOnline = true } = {}) {
  if (navigatorOnline === false) return true;
  const code = readErrorCode(error);
  const text = readErrorText(error);
  if (code === "aborterror" || code === "timeouterror" || code === "networkerror") return true;
  return NETWORK_ERROR_MESSAGES.some((pattern) => pattern.test(text));
}

export function isTemporaryBackendError(error) {
  const status = readErrorStatus(error);
  if (status >= 500 && status <= 599) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  const code = readErrorCode(error);
  return code === "service_unavailable" || code === "temporarily_unavailable";
}

export function isConclusiveInvalidAuthError(error, { authOperation = false } = {}) {
  const code = readErrorCode(error);
  const text = readErrorText(error);
  if (CONCLUSIVE_AUTH_CODES.has(code)) return true;
  if (CONCLUSIVE_AUTH_MESSAGES.some((pattern) => pattern.test(text))) return true;

  const status = readErrorStatus(error);
  if (!authOperation || (status !== 401 && status !== 403)) return false;
  return /\b(?:refresh token|auth session|invalid jwt|jwt expired|user not found|session revoked)\b/i.test(text);
}

export function classifyAuthFailure(error, {
  navigatorOnline = true,
  authOperation = true,
} = {}) {
  if (isConnectivityError(error, { navigatorOnline })) {
    return ALTARA_AUTH_STATE.NETWORK_INDETERMINATE;
  }
  if (isTemporaryBackendError(error)) {
    return ALTARA_AUTH_STATE.BACKEND_TEMPORARILY_UNAVAILABLE;
  }
  if (isConclusiveInvalidAuthError(error, { authOperation })) {
    return ALTARA_AUTH_STATE.CONCLUSIVELY_INVALID_SESSION;
  }
  return ALTARA_AUTH_STATE.UNEXPECTED_BOOT_ERROR;
}

export function getSafeAuthErrorCode(error, category = "") {
  const explicitCode = readErrorCode(error).replace(/[^a-z0-9_-]+/g, "_").slice(0, 72);
  if (explicitCode) return explicitCode;
  const normalizedCategory = String(category || "").trim().toLowerCase();
  if (normalizedCategory === ALTARA_AUTH_STATE.NETWORK_INDETERMINATE) return "auth_network_unavailable";
  if (normalizedCategory === ALTARA_AUTH_STATE.BACKEND_TEMPORARILY_UNAVAILABLE) return "auth_backend_unavailable";
  if (normalizedCategory === ALTARA_AUTH_STATE.CONCLUSIVELY_INVALID_SESSION) return "auth_session_invalid";
  if (normalizedCategory === ALTARA_AUTH_STATE.NO_LOCAL_SESSION) return "auth_session_missing";
  return "auth_boot_unexpected";
}

export function getReconnectDelayMs(attemptInput, {
  randomValue = 0.5,
  baseMs = 1000,
  capMs = 30000,
  jitterRatio = 0.2,
} = {}) {
  const attempt = Math.max(1, Math.floor(Number(attemptInput) || 1));
  const base = Math.max(100, Number(baseMs) || 1000);
  const cap = Math.max(base, Number(capMs) || 30000);
  const raw = Math.min(cap, base * (2 ** Math.min(20, attempt - 1)));
  const boundedRandom = Math.max(0, Math.min(1, Number(randomValue) || 0));
  const jitter = raw * Math.max(0, Math.min(0.5, Number(jitterRatio) || 0));
  return Math.max(100, Math.min(cap, Math.round(raw - jitter + (2 * jitter * boundedRandom))));
}

export function createSingleFlightRunner(task) {
  if (typeof task !== "function") throw new TypeError("single-flight task must be a function");
  let inFlight = null;
  return Object.freeze({
    run(...args) {
      if (inFlight) return inFlight;
      inFlight = Promise.resolve()
        .then(() => task(...args))
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    isRunning() {
      return !!inFlight;
    },
  });
}

const PROFILE_FIELDS = [
  "id",
  "username",
  "display_name",
  "avatar_url",
  "banner_url",
  "name_color",
  "call_tile_color",
  "status",
  "pronouns",
];

const PERSON_FIELDS = [
  "id",
  "other_user_id",
  "otherUserId",
  "kind",
  "username",
  "display_name",
  "displayName",
  "nickname",
  "avatar_url",
  "avatarUrl",
  "name_color",
  "status",
  "is_best_friend",
  "best_friend",
  "isBestFriend",
  "unread_count",
  "unreadCount",
  "conversation_id",
  "conversationId",
  "last_message_at",
  "lastMessageAt",
  "updated_at",
  "created_at",
];

const GROUP_FIELDS = [
  "conversationId",
  "conversation_id",
  "name",
  "displayName",
  "avatarUrl",
  "avatar_url",
  "ownerUserId",
  "owner_user_id",
  "memberCount",
  "member_count",
  "unreadCount",
  "unread_count",
  "lastMessageAt",
  "last_message_at",
  "kind",
];

const SERVER_FIELDS = [
  "serverId",
  "server_id",
  "name",
  "serverName",
  "iconUrl",
  "icon_url",
  "bannerUrl",
  "banner_url",
  "defaultConversationId",
  "default_conversation_id",
  "welcomeConversationId",
  "welcome_conversation_id",
  "ownerUserId",
  "owner_id",
  "memberCount",
  "member_count",
  "kind",
];

const CHANNEL_FIELDS = [
  "id",
  "channelId",
  "channel_id",
  "serverId",
  "server_id",
  "conversationId",
  "conversation_id",
  "name",
  "displayName",
  "channelType",
  "channel_type",
  "categoryId",
  "category_id",
  "position",
  "isPrivate",
  "is_private",
  "userLimit",
  "user_limit",
  "mediaMode",
  "media_mode",
];

function pickFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    const fieldValue = value[field];
    if (fieldValue == null || ["string", "number", "boolean"].includes(typeof fieldValue)) {
      result[field] = typeof fieldValue === "string" ? fieldValue.slice(0, 1024) : fieldValue;
    }
  }
  return Object.keys(result).length ? result : null;
}

function sanitizeRows(rows, fields, limit) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((row) => pickFields(row, fields))
    .filter(Boolean);
}

export function sanitizeOfflineNavigationSnapshot(snapshotInput, expectedUserId = "") {
  const source = snapshotInput && typeof snapshotInput === "object" ? snapshotInput : {};
  const userId = String(source.userId || expectedUserId || "").trim();
  const expected = String(expectedUserId || "").trim();
  if (!userId || (expected && userId !== expected)) return null;
  const channelGroups = (Array.isArray(source.serverChannels) ? source.serverChannels : [])
    .slice(0, 100)
    .map((entry) => {
      const serverId = String(entry?.serverId || "").trim();
      if (!serverId) return null;
      return {
        serverId,
        channels: sanitizeRows(entry?.channels, CHANNEL_FIELDS, 200),
      };
    })
    .filter(Boolean);
  const conversationMeta = (Array.isArray(source.conversationMeta) ? source.conversationMeta : [])
    .slice(0, 300)
    .map((entry) => {
      const conversationId = String(entry?.conversationId || "").trim();
      const meta = pickFields(entry?.meta, [...GROUP_FIELDS, ...CHANNEL_FIELDS, ...PERSON_FIELDS]);
      return conversationId && meta ? { conversationId, meta } : null;
    })
    .filter(Boolean);
  return {
    schema: 1,
    userId,
    savedAt: Math.max(0, Number(source.savedAt || Date.now()) || Date.now()),
    profile: pickFields(source.profile, PROFILE_FIELDS),
    friends: sanitizeRows(source.friends, PERSON_FIELDS, 500),
    dmContacts: sanitizeRows(source.dmContacts, PERSON_FIELDS, 500),
    groupDms: sanitizeRows(source.groupDms, GROUP_FIELDS, 200),
    servers: sanitizeRows(source.servers, SERVER_FIELDS, 200),
    activeConversation: pickFields(source.activeConversation, [...GROUP_FIELDS, ...CHANNEL_FIELDS, ...PERSON_FIELDS]),
    selectedServerId: String(source.selectedServerId || "").trim(),
    selectedChannelId: String(source.selectedChannelId || "").trim(),
    serverChannels: channelGroups,
    conversationMeta,
  };
}

export function sanitizeComposerDraft(value, maxLength = 4000) {
  return String(value || "").slice(0, Math.max(1, Number(maxLength) || 4000));
}
