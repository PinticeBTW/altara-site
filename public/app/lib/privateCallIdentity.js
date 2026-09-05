import {
  pickSafeCallVisibleName,
  sanitizeCallVisibleName,
} from "./callVisibleIdentity.js";

const GENERIC_PRIVATE_CALL_LABELS = new Set([
  "member",
  "membro",
  "a member",
  "um membro",
  "friend",
  "amigo",
  "participant",
  "participante",
  "someone",
  "alguem",
  "unknown",
  "user",
]);

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function comparableLabel(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isGenericPrivateCallLabel(value) {
  const normalized = comparableLabel(value);
  return !normalized || GENERIC_PRIVATE_CALL_LABELS.has(normalized);
}

function readProfileLabel(profile = null) {
  if (!profile || typeof profile !== "object") return "";
  return pickSafeCallVisibleName([
    profile.display_name,
    profile.displayName,
    profile.username,
    profile.label,
    profile.name,
  ], "");
}

function readProfileAvatar(profile = null) {
  if (!profile || typeof profile !== "object") return "";
  return cleanText(
    profile.avatar_url
    || profile.avatarUrl
    || profile.avatar
    || ""
  );
}

export function resolvePrivateCallIdentity({
  userId = "",
  localUserId = "",
  currentProfile = null,
  dmPeerProfile = null,
  conversationPeerProfile = null,
  friendProfile = null,
  cachedProfile = null,
  presenceProfile = null,
  hintProfile = null,
  fallbackLabel = "User",
} = {}) {
  const normalizedUserId = cleanText(userId);
  const normalizedLocalUserId = cleanText(localUserId);
  const isLocal = !!(
    normalizedUserId
    && normalizedLocalUserId
    && normalizedUserId === normalizedLocalUserId
  );
  const sources = isLocal
    ? [
        ["current_profile", currentProfile],
        ["profile_cache", cachedProfile],
      ]
    : [
        ["dm_peer", dmPeerProfile],
        ["conversation_peer", conversationPeerProfile],
        ["friend_profile", friendProfile],
        ["profile_cache", cachedProfile],
        ["presence_profile", presenceProfile],
        ["call_context_hint", hintProfile],
      ];

  let label = "";
  let labelSource = "fallback";
  let avatar = "";
  let avatarSource = "fallback";

  for (const [sourceName, profile] of sources) {
    if (!avatar) {
      const candidateAvatar = readProfileAvatar(profile);
      if (candidateAvatar) {
        avatar = candidateAvatar;
        avatarSource = sourceName;
      }
    }
    if (label) continue;
    const candidateLabel = readProfileLabel(profile);
    if (!candidateLabel || isGenericPrivateCallLabel(candidateLabel)) continue;
    label = candidateLabel;
    labelSource = sourceName;
  }

  const safeFallback = sanitizeCallVisibleName(fallbackLabel, "User") || "User";
  return {
    userId: normalizedUserId,
    isLocal,
    label: label || safeFallback,
    avatar: avatar || null,
    labelSource,
    avatarSource,
    fallbackUsed: !label,
  };
}
