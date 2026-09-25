import { buildCompactActivityArtworkHtml } from "./lib/activityArtwork.js";
import { selectPublishedActivity, spotifyActivityIcon } from "./lib/presenceActivity.js";
// presence-ui.js
// Renderiza Active Now + Offline + dots nas DMs

import {
  formatSpotifyProgressTime,
  getSpotifyInterpolatedProgress,
  getSpotifyProgressAnchor,
  scheduleSpotifyProgressTickerSync,
} from "./lib/spotifyProgress.js";


function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeStatus(s) {
  const raw = String(s || "").trim().toLowerCase();
  if (!raw) return "offline";
  if (raw === "online" || raw === "idle" || raw === "focus" || raw === "dnd") return raw;
  if (raw === "invisible" || raw === "offline") return "offline";
  return "offline";
}

function statusLabel(s) {
  s = normalizeStatus(s);
  if (s === "online") return "online";
  if (s === "idle") return "idle";
  if (s === "focus") return "focus";
  if (s === "dnd") return "dnd";
  return "offline";
}

function normalizeManualStatus(s) {
  const raw = String(s || "").trim().toLowerCase();
  if (raw === "online" || raw === "idle" || raw === "focus" || raw === "dnd" || raw === "invisible") return raw;
  return "";
}

function readPresenceLiveFlag(value) {
  if (value === true || value === 1) return true;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

function readPresenceStatusField(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "online"
    || raw === "idle"
    || raw === "focus"
    || raw === "dnd"
    || raw === "offline"
    || raw === "invisible"
    ? raw
    : "";
}

// This is the single boundary between Presence transport state and UI state.
// A status describes presentation; only a live session proves connectivity.
export function classifyPresenceState(entry = {}) {
  const row = entry && typeof entry === "object" ? entry : {};
  const liveSessionCount = Math.max(
    0,
    Number(row.live_session_count || row.liveSessionCount || 0) || 0,
    Array.isArray(row.live_sessions) ? row.live_sessions.length : 0,
    Array.isArray(row.liveSessions) ? row.liveSessions.length : 0,
  );
  const isPresenceLive = liveSessionCount > 0
    || readPresenceLiveFlag(row.has_live_session)
    || readPresenceLiveFlag(row.hasLiveSession)
    || readPresenceLiveFlag(row.is_live)
    || readPresenceLiveFlag(row.isLive);
  const rawStatus = readPresenceStatusField(row.status);
  const manualStatus = readPresenceStatusField(row.manual_status)
    || readPresenceStatusField(row.manualStatus);
  const effectiveStatus = readPresenceStatusField(row.effective_status)
    || readPresenceStatusField(row.effectiveStatus);
  const requestedStatus = manualStatus === "invisible"
    ? "invisible"
    : (effectiveStatus || manualStatus || rawStatus);

  let visibleStatus = "offline";
  if (isPresenceLive && requestedStatus !== "invisible" && requestedStatus !== "offline") {
    visibleStatus = requestedStatus || "online";
  }
  const countsAsOnlineNow = isPresenceLive && visibleStatus !== "offline";

  return {
    isPresenceLive,
    visibleStatus,
    countsAsOnlineNow,
    liveSessionCount,
    rawStatus,
    manualStatus,
    effectiveStatus,
  };
}

function normalizeId(value = "") {
  const raw = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ? raw.toLowerCase()
    : raw;
}

function pushFriendIdCandidate(list, source, value) {
  const id = normalizeId(value);
  if (!id) return;
  list.push({ source, id });
}

function getFriendIdCandidates(friend = {}) {
  const profile = friend?.profile && typeof friend.profile === "object" ? friend.profile : {};
  const profiles = friend?.profiles && typeof friend.profiles === "object" ? friend.profiles : {};
  const friendProfile = friend?.friend && typeof friend.friend === "object" ? friend.friend : {};
  const candidates = [];
  pushFriendIdCandidate(candidates, "other_user_id", friend.other_user_id);
  pushFriendIdCandidate(candidates, "friend_user_id", friend.friend_user_id);
  pushFriendIdCandidate(candidates, "friendUserId", friend.friendUserId);
  pushFriendIdCandidate(candidates, "friend_id", friend.friend_id);
  pushFriendIdCandidate(candidates, "friendId", friend.friendId);
  pushFriendIdCandidate(candidates, "peer_user_id", friend.peer_user_id);
  pushFriendIdCandidate(candidates, "peerUserId", friend.peerUserId);
  pushFriendIdCandidate(candidates, "target_user_id", friend.target_user_id);
  pushFriendIdCandidate(candidates, "targetUserId", friend.targetUserId);
  pushFriendIdCandidate(candidates, "profile.id", profile.id);
  pushFriendIdCandidate(candidates, "profiles.id", profiles.id);
  pushFriendIdCandidate(candidates, "friend.id", friendProfile.id);
  pushFriendIdCandidate(candidates, "profile_id", friend.profile_id);
  pushFriendIdCandidate(candidates, "profileId", friend.profileId);
  pushFriendIdCandidate(candidates, "user_id", friend.user_id);
  pushFriendIdCandidate(candidates, "userId", friend.userId);
  pushFriendIdCandidate(candidates, "id", friend.id);
  return candidates;
}

function getFriendRawIds(friend = {}) {
  return getFriendIdCandidates(friend).reduce((acc, item) => {
    if (!acc[item.source]) acc[item.source] = item.id;
    return acc;
  }, {});
}

function getFriendUserId(friend = {}, currentUserId = "") {
  const selfId = normalizeId(currentUserId);
  const candidates = getFriendIdCandidates(friend);
  const nonSelf = selfId ? candidates.find((item) => item.id && item.id !== selfId) : null;
  if (nonSelf) return nonSelf.id;
  return candidates[0]?.id || "";
}

function getFriendPresenceId(friend = {}, currentUserId = "") {
  return getFriendUserId(friend, currentUserId);
}

function resolveEffectivePresenceStatus({ liveStatus = "", manualStatus = "", hasLiveSession = null } = {}) {
  return classifyPresenceState({
    status: liveStatus,
    manual_status: manualStatus,
    has_live_session: typeof hasLiveSession === "boolean"
      ? hasLiveSession
      : normalizeStatus(liveStatus) !== "offline",
  }).visibleStatus;
}

function isPresenceDebugEnabled() {
  try {
    return localStorage.getItem("altara.debug.presence") === "1";
  } catch (_) {
    return false;
  }
}

function logActiveNowDebug(event = "", details = {}) {
  if (!isPresenceDebugEnabled()) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[Presence] active now " + String(event || "event"), details && typeof details === "object" ? details : {});
}

function logPresenceLiveDebug(event = "", details = {}) {
  if (!isPresenceDebugEnabled()) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[Presence] " + String(event || "event"), details && typeof details === "object" ? details : {});
}

function normalizeActivityAssetUrl(value = "") {
  const raw = String(value || "").trim().slice(0, 512);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, typeof location !== "undefined" ? location.href : "https://altara.invalid/");
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch (_) {
    return "";
  }
}

function normalizeActivity(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").trim().toLowerCase();
  const name = String(raw.name || "").trim();
  const startedAt = Number(raw.startedAt || 0);
  if (type === "listening") {
    const provider = String(raw.provider || "").trim().toLowerCase();
    const title = String(raw.title || raw.name || "").trim();
    const artist = String(raw.artist || raw.details || "").trim();
    const isPlaying = raw.isPlaying !== false && raw.is_playing !== false;
    const fetchedAt = Number(raw.fetchedAt || raw.fetched_at || raw.updatedAt || raw.updated_at || 0);
    const nowMs = Date.now();
    if (
      provider !== "spotify"
      || !title
      || !isPlaying
      || !Number.isFinite(fetchedAt)
      || fetchedAt <= 0
      || fetchedAt > nowMs + 5 * 60 * 1000
    ) return null;
    return {
      type: "listening",
      provider: "spotify",
      trackId: String(raw.trackId || raw.track_id || raw.id || "").trim().slice(0, 120),
      name: title,
      title,
      details: artist,
      artist,
      album: String(raw.album || "").trim(),
      artworkUrl: normalizeActivityAssetUrl(raw.artworkUrl || raw.artwork_url || raw.cover || raw.icon),
      progressMs: Math.max(0, Math.round(Number(raw.progressMs || raw.progress_ms || 0) || 0)),
      durationMs: Math.max(0, Math.round(Number(raw.durationMs || raw.duration_ms || 0) || 0)),
      startedAt: (() => { const progressMs = Math.max(0, Math.round(Number(raw.progressMs || raw.progress_ms || 0) || 0)); return Math.max(1, Math.round(fetchedAt) - progressMs); })(),
      activityStartedAt: Number.isFinite(Number(raw.activityStartedAt)) && Number(raw.activityStartedAt) > 0 ? Number(raw.activityStartedAt) : Math.max(1, fetchedAt - Math.max(0, Number(raw.progressMs || 0) || 0)),
      fetchedAt,
      updatedAt: fetchedAt,
      isPlaying: true,
      externalUrl: normalizeActivityAssetUrl(raw.externalUrl || raw.external_url),
      showOnProfile: raw.showOnProfile !== false && raw.show_on_profile !== false,
      showProgress: raw.showProgress !== false && raw.show_progress !== false,
      activityVerb: "listening",
    };
  }
  if (type !== "playing" || !name || !Number.isFinite(startedAt) || startedAt <= 0) return null;
  const kind = String(raw.kind || "").trim().toLowerCase() === "app" ? "app" : "game";
  const activityVerb = String(raw.activityVerb || raw.activity_verb || "").trim().toLowerCase() === "using"
    ? "using"
    : (kind === "app" ? "using" : "playing");
  return {
    type: "playing",
    name,
    gameId: String(raw.gameId || "").trim(),
    kind,
    activityVerb,
    startedAt,
    icon: normalizeActivityAssetUrl(raw.icon),
    logo: normalizeActivityAssetUrl(raw.logo || raw.metadata?.logo || ""),
    executableIcon: normalizeActivityAssetUrl(raw.executableIcon || raw.metadata?.executableIcon || ""),
    squareArtwork: normalizeActivityAssetUrl(raw.squareArtwork || raw.metadata?.squareArtwork || ""),
    cover: normalizeActivityAssetUrl(raw.cover),
    background: normalizeActivityAssetUrl(raw.background),
    provider: String(raw.provider || "").trim(),
    providerId: String(raw.providerId || "").trim(),
    slug: String(raw.slug || "").trim(),
  };
}

function activityLabel(activity) {
  const normalized = normalizeActivity(activity);
  if (!normalized) return "";
  if (normalized.type === "listening" && normalized.provider === "spotify") return "";
  return `${normalized.activityVerb === "using" ? "Using" : "Playing"} ${normalized.name}`;
}

function buildSpotifyActivityHtml(activity, userId = "") {
  const normalized = normalizeActivity(activity);
  if (!normalized || normalized.type !== "listening" || normalized.provider !== "spotify") return "";
  const artwork = String(normalized.artworkUrl || "").trim();
  const progress = getSpotifyInterpolatedProgress(normalized);
  const anchor = getSpotifyProgressAnchor(normalized);
  const progressHtml = normalized.showProgress !== false && progress.durationMs > 0
    ? `<div class="spotifyActivityProgress presenceActivityProgress" data-spotify-activity-progress="1" data-spotify-track-id="${esc(normalized.trackId || "")}" data-spotify-anchor-progress-ms="${esc(anchor.anchorProgressMs)}" data-spotify-anchor-timestamp="${esc(anchor.anchorTimestamp)}" data-spotify-started-at="${esc(normalized.startedAt || 0)}" data-spotify-progress-ms="${esc(normalized.progressMs || 0)}" data-spotify-duration-ms="${esc(normalized.durationMs || 0)}" data-spotify-is-playing="${normalized.isPlaying !== false ? "1" : "0"}">
        <div class="presenceActivityProgress__time" data-spotify-progress-label="1">${esc(formatSpotifyProgressTime(progress.progressMs) + " / " + formatSpotifyProgressTime(progress.durationMs))}</div>
        <div class="spotifyActivityProgress__bar" aria-hidden="true"><span style="--spotify-progress:${esc(progress.percent.toFixed(2))}%"></span></div>
      </div>`
    : "";
  if (progressHtml) scheduleSpotifyProgressTickerSync();
  logActiveNowDebug("spotify activity rendered", {
    userId: String(userId || ""),
    trackTitle: normalized.title || normalized.name || "",
    hasArtwork: !!artwork,
  });
  return `
    <div class="presenceActivity presenceActivity--spotify" title="${esc(normalized.title || normalized.name || "Spotify")}">
      <div class="presenceActivityText">
        <div class="presenceActivityLabel">${spotifyActivityIcon}Listening to Spotify</div>
        <div class="presenceActivityTitle">${esc(normalized.title || normalized.name || "Spotify")}</div>
        <div class="presenceActivityMeta">${esc(normalized.artist || normalized.details || "Spotify")}</div>
        ${progressHtml}
      </div>
    </div>
  `;
}

function normalizeNameColor(value) {
  const s = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  return "";
}

function matchSearch(u, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return (
    (u.username || "").toLowerCase().includes(q) ||
    (u.display_name || "").toLowerCase().includes(q)
  );
}

function buildPresenceAvatarHtml(u) {
  const resolver = typeof window !== "undefined" ? window.__altaraResolveUserAvatarUrl : null;
  const url = typeof resolver === "function"
    ? String(resolver(u?.id || "", u?.avatar_url || "", u) || "").trim()
    : String(u?.avatar_url || "").trim();
  const helper = typeof window !== "undefined" ? window.__altaraBuildAvatarMediaHtml : null;
  if (typeof helper === "function") {
    return helper(url, {
      userId: u?.id || "",
      alt: "avatar",
    });
  }
  if (!url) return "";
  return `<img src="${esc(url)}" alt="avatar" />`;
}

function presenceInitial(u) {
  const raw = String(u?.display_name || u?.username || "U").trim();
  return (raw.charAt(0) || "U").toUpperCase();
}

function queuePresenceGifPlaybackSync(root) {
  const helper = typeof window !== "undefined" ? window.__altaraQueueManagedGifPlaybackSync : null;
  if (typeof helper === "function") helper(root);
}

function buildPresenceListSignature(kind, rows, query = "") {
  return [
    kind,
    String(query || ""),
    ...(rows || []).map((u) => [
      String(u.id || ""),
      normalizeStatus(u.status),
      normalizeManualStatus(u.manual_status),
      String(u.display_name || ""),
      String(u.username || ""),
      String(u.avatar_url || ""),
      String(u.name_color || ""),
      JSON.stringify(normalizeActivity(u.activity) || null),
      u.activity?.type === "playing" ? Math.max(0, Math.floor((Date.now() - u.activity.startedAt) / 60000)) : "",
    ].join(":")),
  ].join("|");
}

function cardUser(u, right = "") {
  const st = statusLabel(u.status);
  const nameColor = normalizeNameColor(u.name_color);
  const nameClass = nameColor ? " userNameCustom" : "";
  const nameStyle = nameColor ? ` style="--user-name-color:${esc(nameColor)}"` : "";
  const avatarHtml = buildPresenceAvatarHtml(u) || `<span class="presenceAvatarFallback">${esc(presenceInitial(u))}</span>`;
  const activityText = activityLabel(u.activity);
  const spotifyActivityHtml = buildSpotifyActivityHtml(u.activity, u.id);
  const activity = normalizeActivity(u.activity);
  const artworkHtml = activity ? buildCompactActivityArtworkHtml(activity) : "";
  const elapsed = activity?.type === "playing"
    ? Math.max(0, Math.floor((Date.now() - activity.startedAt) / 60000)) : 0;
  const elapsedLabel = elapsed >= 60 ? `${Math.floor(elapsed / 60)}h` : `${elapsed}m`;
  logActiveNowDebug("render card", {
    userId: String(u.id || ""),
    status: st,
    hasSpotifyActivity: !!spotifyActivityHtml,
  });
  return `
    <div class="presenceRow presenceRow--${esc(st)}" data-presence-user="${esc(u.id)}">
      <div class="presenceLeft">
        <div class="avatar presenceAvatar">
          ${avatarHtml}
          <span class="statusDot" data-status="${esc(st)}"></span>
        </div>
        <div class="presenceText">
          <div class="presenceName${nameClass}"${nameStyle}>${esc(u.display_name || u.username || "User")}</div>
          <div class="presenceHandle" title="${esc(activityText || ("@" + (u.username || "")))}">${activityText ? `${esc(activityText)} &middot; ${elapsedLabel}` : `@${esc(u.username || "")}`}</div>
          ${spotifyActivityHtml}
        </div>
      </div>
      ${artworkHtml}
      ${right ? `<div class="presenceRight">${right}</div>` : ""}
    </div>
  `;
}

// Sidebar/call owners must invalidate the cached paint when relinquishing its DOM.
// A matching data signature is only reusable while that paint still exists.
export function clearPresenceList(element) {
  if (!element) return;
  element.removeAttribute("data-presence-signature");
  element.innerHTML = "";
}

export function renderPresenceUI({
  list,
  me,
  friends,
  dmListEl,
  offlineListEl,
  activeNowEl,
  onlineCountEl,
  searchValue,
  source = "renderPresenceUI",
  onUserClick,
  onStatusDot,
  readiness = "ready",
  translate = (key, fallback) => fallback
}) {
  if (readiness !== "ready") {
    const failed = readiness === "error";
    if (activeNowEl) {
      activeNowEl.removeAttribute("data-presence-signature");
      activeNowEl.innerHTML = `<div class="hint" role="status" data-cold-phase="${failed ? "error" : "loading"}" aria-busy="${!failed}">${esc(translate(failed ? "hydrate.presence_failed" : "hydrate.loading_activity", failed ? "Activity couldn't load. Try again." : "Loading activity…"))}${failed ? ` <button class="btn ghost" type="button" data-cold-retry="presence">${esc(translate("hydrate.retry", "Try again"))}</button>` : ""}</div>`;
    }
    clearPresenceList(offlineListEl);
    if (onlineCountEl) onlineCountEl.textContent = "—";
    return;
  }
  const q = (searchValue || "").trim();
  const meId = normalizeId(me?.id || me?.user_id || me?.userId || "");

  // map: id -> presence data
  const presenceMap = new Map();
  for (const u of (list || [])) {
    const id = normalizeId(u?.id || u?.user_id || u?.userId || "");
    if (!id) continue;
    const classification = classifyPresenceState(u);
    presenceMap.set(id, {
      id,
      username: u.username || "",
      display_name: u.display_name || u.username || "User",
      avatar_url: u.avatar_url || null,
      name_color: normalizeNameColor(u.name_color),
      status: classification.visibleStatus,
      manual_status: normalizeManualStatus(classification.manualStatus || classification.effectiveStatus || classification.rawStatus),
      has_live_session: classification.isPresenceLive,
      live_session_count: classification.liveSessionCount,
      counts_as_online_now: classification.countsAsOnlineNow,
      activity: selectPublishedActivity(u, normalizeActivity),
      spotify_activity: selectPublishedActivity(u, normalizeActivity),
    });
  }

  // construir lista de users baseada nos amigos para não meter randoms
  const friendUsers = (friends || []).map(f => {
    const id = getFriendUserId(f, meId);
    const profile = f?.profile && typeof f.profile === "object" ? f.profile : {};
    const profiles = f?.profiles && typeof f.profiles === "object" ? f.profiles : {};
    const friendProfile = f?.friend && typeof f.friend === "object" ? f.friend : {};
    if (!id) {
      logPresenceLiveDebug("friend sessions missing id", {
        displayName: String(f?.display_name || f?.displayName || f?.username || profile.display_name || profiles.display_name || friendProfile.display_name || "").slice(0, 120),
        rawIds: getFriendRawIds(f),
      });
    }
    return {
      id,
      username: f.username || profile.username || profiles.username || friendProfile.username || "",
      display_name: f.display_name || f.displayName || profile.display_name || profiles.display_name || friendProfile.display_name || f.username || profile.username || profiles.username || friendProfile.username || "User",
      avatar_url: f.avatar_url || f.avatarUrl || profile.avatar_url || profiles.avatar_url || friendProfile.avatar_url || null,
      name_color: normalizeNameColor(f.name_color || profile.name_color || profiles.name_color || friendProfile.name_color),
      manual_status: normalizeManualStatus(f.status || f.presence_status || f.theme_settings?.presence_status || profile.status || profiles.status || friendProfile.status),
      activity: null,
      status: "offline"
    };
  }).filter(x => x.id);

  // mete status real se estiver no presenceMap
  const merged = friendUsers.map(u => {
    const p = presenceMap.get(u.id);
    if (!p) return u;
    const status = resolveEffectivePresenceStatus({
      liveStatus: p.status,
      manualStatus: p.has_live_session ? (p.manual_status || "online") : (p.manual_status || u.manual_status),
      hasLiveSession: p.has_live_session,
    });
    // Presence deve mandar estado em tempo real; dados de perfil (avatar/nome/cor)
    // ficam sempre os mais recentes vindos de profiles/friends.
    return {
      ...u,
      status,
      has_live_session: p.has_live_session,
      counts_as_online_now: p.counts_as_online_now,
      activity: status === "offline" ? null : selectPublishedActivity(p, normalizeActivity),
    };
  });

  // inclui o próprio user (para aparecer no Active Now)
  if (meId) {
    const my = {
      id: meId,
      username: me.username || "",
      display_name: me.display_name || me.username || "Me",
      avatar_url: me.avatar_url || null,
      name_color: normalizeNameColor(me.name_color),
      activity: selectPublishedActivity(me, normalizeActivity),
      manual_status: normalizeManualStatus(me.status),
      status: resolveEffectivePresenceStatus({
        liveStatus: presenceMap.get(meId)?.status || me.status || "online",
        manualStatus: me.status,
        hasLiveSession: true,
      }),
    };
    // garante que aparece
    if (!merged.some(x => x.id === meId)) merged.unshift(my);
    else {
      // update
      const idx = merged.findIndex(x => x.id === meId);
      merged[idx] = { ...merged[idx], ...my };
    }
  }

  // mostrar apenas amigos no Active Now / Offline
  const friendOnly = merged.filter(u => !meId || u.id !== meId);

  // filter por search
  const filtered = friendOnly.filter(u => matchSearch(u, q));

  const online = filtered.filter(u => u.counts_as_online_now === true);
  const active = online.filter(u => !!selectPublishedActivity(u, normalizeActivity));
  const offline = filtered.filter(u => u.counts_as_online_now !== true);

  logPresenceLiveDebug("activeNow render source", {
    source,
    liveUserIds: Array.from(presenceMap.values()).filter((u) => u.has_live_session).map((u) => String(u.id || "")).filter(Boolean),
    onlineNowUserIds: online.map((u) => String(u.id || "")).filter(Boolean),
    activeNowUserIds: active.map((u) => String(u.id || "")).filter(Boolean),
    friendCount: friendUsers.length,
  });

  filtered.forEach((u) => {
    const p = presenceMap.get(u.id);
    const effectiveStatus = normalizeStatus(u.status);
    logPresenceLiveDebug("friend match", {
      currentUserId: normalizeId(meId || ""),
      friendName: String(u.display_name || u.username || "").slice(0, 120),
      friendUserId: u.id,
      hasLiveSession: !!p?.has_live_session,
      manualStatusFromPresence: p?.manual_status || "",
      effectiveStatus,
      includedInOnlineNow: u.counts_as_online_now === true,
      includedInActiveNow: u.counts_as_online_now === true && !!selectPublishedActivity(u, normalizeActivity),
    });
  });

  logPresenceLiveDebug("friend sessions", {
    friends: filtered.map((u) => {
      const p = presenceMap.get(u.id);
      return {
        friendUserId: u.id,
        sessionCount: Number(p?.live_session_count || 0),
        manualStatus: p?.manual_status || u.manual_status || "",
        effectiveStatus: normalizeStatus(u.status),
      };
    }),
  });
  logPresenceLiveDebug("activeNowUsers", {
    count: active.length,
    userIds: active.map((u) => String(u.id || "")).filter(Boolean),
  });

  // atualizar contador
  if (onlineCountEl) onlineCountEl.textContent = String(online.length);

  // render Active Now
  if (activeNowEl) {
    const signature = buildPresenceListSignature("active", active, q) + translate("hydrate.active_empty", "No one active right now.");
    if (activeNowEl.getAttribute("data-presence-signature") === signature) {
      if (onlineCountEl) onlineCountEl.textContent = String(online.length);
    } else {
    const html = active.length
      ? active.map(u => cardUser(u)).join("")
      : `<div class="hint">${esc(translate("hydrate.active_empty", "No one active right now."))}</div>`;
    activeNowEl.innerHTML = html;
    activeNowEl.setAttribute("data-presence-signature", signature);
    queuePresenceGifPlaybackSync(activeNowEl);

    activeNowEl.querySelectorAll("[data-presence-user]").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-presence-user");
        const u = filtered.find(x => x.id === id);
        if (u) onUserClick?.(u);
      });
    });
    }
  }

  // render Offline
  if (offlineListEl) {
    const signature = buildPresenceListSignature("offline", offline, q) + translate("hydrate.offline_empty", "No offline friends.");
    if (offlineListEl.getAttribute("data-presence-signature") !== signature) {
    const html = offline.length
      ? offline.map(u => cardUser(u, `<div class="presenceState">offline</div>`)).join("")
      : `<div class="hint">${esc(translate("hydrate.offline_empty", "No offline friends."))}</div>`;
    offlineListEl.innerHTML = html;
    offlineListEl.setAttribute("data-presence-signature", signature);
    queuePresenceGifPlaybackSync(offlineListEl);

    offlineListEl.querySelectorAll("[data-presence-user]").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-presence-user");
        const u = filtered.find(x => x.id === id);
        if (u) onUserClick?.(u);
      });
    });
    }
  }

  // pintar dots na DM list (se existir)
  if (typeof onStatusDot === "function") {
    for (const u of merged) {
      onStatusDot(u.id, u.status || "offline");
    }
  }

  // também pinta em qualquer .statusDot que tenha data-status-dot-me, se já existe
  // (isso é feito no app.js, mas não custa)
}

