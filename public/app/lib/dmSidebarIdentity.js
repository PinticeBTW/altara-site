import { isGenericPrivateCallLabel } from "./privateCallIdentity.js";

const SOURCE_QUALITY = Object.freeze({
  fallback: 0,
  call_context_hint: 10,
  last_known: 20,
  stored_dm_peer: 30,
  friend_profile: 40,
  profile_cache: 50,
  local_nickname: 60,
  authoritative_profile: 70,
});

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function readIdentityLabel(profile = null) {
  if (!profile || typeof profile !== "object") return "";
  const values = [
    profile.display_name,
    profile.displayName,
    profile.username,
    profile.label,
    profile.name,
  ];
  for (const value of values) {
    const label = cleanText(value);
    if (label && !isGenericPrivateCallLabel(label)) return label;
  }
  return "";
}

function readIdentityUsername(profile = null) {
  if (!profile || typeof profile !== "object") return "";
  return cleanText(profile.username || "");
}

function readIdentityAvatar(profile = null) {
  if (!profile || typeof profile !== "object") return "";
  return cleanText(profile.avatar_url || profile.avatarUrl || profile.avatar || "");
}

function readIdentityNameColor(profile = null) {
  if (!profile || typeof profile !== "object") return "";
  return cleanText(profile.name_color || profile.nameColor || "");
}

function getSourceQuality(source = "fallback") {
  return Number(SOURCE_QUALITY[String(source || "fallback")] || 0);
}

export function resolveDmSidebarIdentity({
  userId = "",
  localNickname = "",
  cachedProfile = null,
  friendProfile = null,
  storedDmPeerProfile = null,
  lastKnownProfile = null,
  callContextHint = null,
  fallbackLabel = "User",
} = {}) {
  const nicknameProfile = cleanText(localNickname)
    ? { display_name: cleanText(localNickname) }
    : null;
  const sources = [
    ["local_nickname", nicknameProfile],
    ["profile_cache", cachedProfile],
    ["friend_profile", friendProfile],
    ["stored_dm_peer", storedDmPeerProfile],
    ["last_known", lastKnownProfile],
    ["call_context_hint", callContextHint],
  ];
  let label = "";
  let labelSource = "fallback";
  let username = "";
  let avatar = "";
  let nameColor = "";

  for (const [source, profile] of sources) {
    if (!label) {
      const candidateLabel = readIdentityLabel(profile);
      if (candidateLabel) {
        label = candidateLabel;
        labelSource = source;
      }
    }
    if (!username) username = readIdentityUsername(profile);
    if (!avatar) avatar = readIdentityAvatar(profile);
    if (!nameColor) nameColor = readIdentityNameColor(profile);
  }

  const safeFallback = cleanText(fallbackLabel) || "User";
  return Object.freeze({
    userId: cleanText(userId),
    label: label || safeFallback,
    username,
    avatar: avatar || null,
    nameColor: nameColor || null,
    labelSource,
    quality: getSourceQuality(labelSource),
    fallbackUsed: !label,
  });
}

export function reconcileDmSidebarIdentity(current = null, incoming = null, {
  authoritative = false,
} = {}) {
  const previous = current && typeof current === "object" ? current : {};
  const candidate = incoming && typeof incoming === "object" ? incoming : {};
  const previousLabel = cleanText(previous.label || previous.display_name || previous.displayName || "");
  const candidateLabel = cleanText(candidate.label || candidate.display_name || candidate.displayName || "");
  const previousRich = !!previousLabel && !isGenericPrivateCallLabel(previousLabel);
  const candidateRich = !!candidateLabel && !isGenericPrivateCallLabel(candidateLabel);
  const previousQuality = Number(previous.quality ?? getSourceQuality(previous.labelSource));
  const candidateQuality = Number(candidate.quality ?? getSourceQuality(candidate.labelSource));
  const canReplaceLabel = !!(
    candidateRich
    && (
      authoritative
      || !previousRich
      || candidateQuality >= previousQuality
    )
  );

  return Object.freeze({
    ...previous,
    ...candidate,
    label: canReplaceLabel ? candidateLabel : (previousLabel || candidateLabel || "User"),
    labelSource: canReplaceLabel
      ? (candidate.labelSource || (authoritative ? "authoritative_profile" : "fallback"))
      : (previous.labelSource || candidate.labelSource || "fallback"),
    quality: canReplaceLabel
      ? (authoritative ? SOURCE_QUALITY.authoritative_profile : candidateQuality)
      : Math.max(0, previousQuality),
    username: cleanText(candidate.username || previous.username || ""),
    avatar: candidate.avatar || previous.avatar || null,
    nameColor: candidate.nameColor || previous.nameColor || null,
    fallbackUsed: !(canReplaceLabel ? candidateRich : previousRich || candidateRich),
  });
}

export { SOURCE_QUALITY as DM_SIDEBAR_IDENTITY_SOURCE_QUALITY };
