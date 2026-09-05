const EMAIL_LIKE_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanVisibleName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function isUnsafeCallVisibleName(value) {
  const label = cleanVisibleName(value);
  return !label || EMAIL_LIKE_PATTERN.test(label) || UUID_PATTERN.test(label);
}

export function sanitizeCallVisibleName(value, fallback = "User") {
  const label = cleanVisibleName(value);
  if (label && !isUnsafeCallVisibleName(label)) return label;
  const safeFallback = cleanVisibleName(fallback);
  if (!safeFallback) return "";
  return isUnsafeCallVisibleName(safeFallback) ? "User" : safeFallback;
}

export function pickSafeCallVisibleName(candidates = [], fallback = "User") {
  for (const candidate of Array.isArray(candidates) ? candidates : [candidates]) {
    const label = cleanVisibleName(candidate);
    if (label && !isUnsafeCallVisibleName(label)) return label;
  }
  return sanitizeCallVisibleName("", fallback);
}

export function resolveCallVisibleName({
  serverNickname = "",
  displayNames = [],
  usernames = [],
  receivedLabels = [],
  fallback = "User",
} = {}) {
  return pickSafeCallVisibleName([
    serverNickname,
    ...(Array.isArray(displayNames) ? displayNames : [displayNames]),
    ...(Array.isArray(usernames) ? usernames : [usernames]),
    ...(Array.isArray(receivedLabels) ? receivedLabels : [receivedLabels]),
  ], fallback);
}

export function buildSafeCallShareTitle({
  isLocal = false,
  actorLabel = "",
  fallback = "User",
} = {}) {
  if (isLocal) return "You are sharing";
  const visibleActor = sanitizeCallVisibleName(actorLabel, fallback) || "User";
  return `${visibleActor} is sharing`;
}
