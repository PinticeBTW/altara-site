// presence-ui.js
// Renderiza Active Now + Offline + dots nas DMs

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

function normalizeId(value = "") {
  return String(value || "").trim();
}

function getFriendUserId(friend = {}) {
  const profile = friend?.profile && typeof friend.profile === "object" ? friend.profile : {};
  const profiles = friend?.profiles && typeof friend.profiles === "object" ? friend.profiles : {};
  const friendProfile = friend?.friend && typeof friend.friend === "object" ? friend.friend : {};
  return normalizeId(
    friend.other_user_id
    || friend.friend_user_id
    || friend.friendUserId
    || friend.user_id
    || friend.userId
    || friend.id
    || profile.id
    || profiles.id
    || friendProfile.id
    || friend.peer_user_id
    || friend.peerUserId
    || friend.target_user_id
    || friend.targetUserId
    || friend.profile_id
    || friend.profileId
    || ""
  );
}

function getFriendPresenceId(friend = {}) {
  return getFriendUserId(friend);
}

function resolveEffectivePresenceStatus({ liveStatus = "", manualStatus = "", hasLiveSession = null } = {}) {
  const live = normalizeStatus(liveStatus);
  const manual = normalizeManualStatus(manualStatus);
  const hasLive = typeof hasLiveSession === "boolean" ? hasLiveSession : live !== "offline";
  if (!hasLive) return "offline";
  if (manual === "invisible") return "offline";
  if (manual === "online") return "online";
  if (manual === "idle" || manual === "focus" || manual === "dnd") return manual;
  return live;
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
  console.info("[active-now] " + String(event || "event"), details && typeof details === "object" ? details : {});
}

function logPresenceLiveDebug(event = "", details = {}) {
  if (!isPresenceDebugEnabled()) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[presence-live] " + String(event || "event"), details && typeof details === "object" ? details : {});
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
    if (provider !== "spotify" || !title || !isPlaying) return null;
    return {
      type: "listening",
      provider: "spotify",
      name: title,
      title,
      details: artist,
      artist,
      album: String(raw.album || "").trim(),
      artworkUrl: String(raw.artworkUrl || raw.artwork_url || raw.cover || raw.icon || "").trim(),
      progressMs: Math.max(0, Math.round(Number(raw.progressMs || raw.progress_ms || 0) || 0)),
      durationMs: Math.max(0, Math.round(Number(raw.durationMs || raw.duration_ms || 0) || 0)),
      startedAt: (() => { const fetchedAt = Number(raw.fetchedAt || raw.fetched_at || raw.updatedAt || raw.updated_at || Date.now()) || Date.now(); const progressMs = Math.max(0, Math.round(Number(raw.progressMs || raw.progress_ms || 0) || 0)); return Math.max(1, Math.round(fetchedAt) - progressMs); })(),
      fetchedAt: Number(raw.fetchedAt || raw.fetched_at || raw.updatedAt || raw.updated_at || Date.now()) || Date.now(),
      updatedAt: Number(raw.fetchedAt || raw.fetched_at || raw.updatedAt || raw.updated_at || Date.now()) || Date.now(),
      externalUrl: String(raw.externalUrl || raw.external_url || "").trim(),
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
    icon: String(raw.icon || "").trim(),
    cover: String(raw.cover || "").trim(),
    background: String(raw.background || "").trim(),
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
  logActiveNowDebug("spotify activity rendered", {
    userId: String(userId || ""),
    trackTitle: normalized.title || normalized.name || "",
    hasArtwork: !!artwork,
  });
  return `
    <div class="presenceActivity presenceActivity--spotify" title="${esc(normalized.title || normalized.name || "Spotify")}">
      <div class="presenceActivityArt">
        ${artwork ? `<img src="${esc(artwork)}" alt="" loading="lazy" onerror="this.hidden=true;this.closest('.presenceActivityArt')?.classList.add('is-fallback')" />` : `<span>S</span>`}
      </div>
      <div class="presenceActivityText">
        <div class="presenceActivityLabel">Listening to Spotify</div>
        <div class="presenceActivityTitle">${esc(normalized.title || normalized.name || "Spotify")}</div>
        <div class="presenceActivityMeta">${esc(normalized.artist || normalized.details || "Spotify")}</div>
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
  if (!url) return "";
  const helper = typeof window !== "undefined" ? window.__altaraBuildAvatarMediaHtml : null;
  if (typeof helper === "function") {
    return helper(url, {
      userId: u?.id || "",
      alt: "avatar",
    });
  }
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
          <div class="presenceHandle">@${esc(u.username || "")}${activityText ? ` <span>&middot; ${esc(activityText)}</span>` : ""}</div>
          ${spotifyActivityHtml}
        </div>
      </div>
      <div class="presenceRight">
        ${right}
      </div>
    </div>
  `;
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
  onStatusDot
}) {
  const q = (searchValue || "").trim();
  const meId = me?.id;

  // map: id -> presence data
  const presenceMap = new Map();
  for (const u of (list || [])) {
    const id = normalizeId(u?.id || u?.user_id || u?.userId || "");
    if (!id) continue;
    const liveSessionCount = Number(u.live_session_count || u.liveSessionCount || 0);
    presenceMap.set(id, {
      id,
      username: u.username || "",
      display_name: u.display_name || u.username || "User",
      avatar_url: u.avatar_url || null,
      name_color: normalizeNameColor(u.name_color),
      status: normalizeStatus(u.status),
      manual_status: normalizeManualStatus(u.manual_status || u.status),
      has_live_session: liveSessionCount > 0 || u.has_live_session === true || u.hasLiveSession === true || u.is_live === true || u.isLive === true,
      live_session_count: liveSessionCount,
      activity: normalizeActivity(u.activity || u.spotify_activity || u.spotifyActivity),
      spotify_activity: normalizeActivity(u.spotify_activity || u.spotifyActivity || u.activity),
    });
  }

  // construir lista de users baseada nos amigos para não meter randoms
  const friendUsers = (friends || []).map(f => {
    const id = getFriendUserId(f);
    const profile = f?.profile && typeof f.profile === "object" ? f.profile : {};
    const profiles = f?.profiles && typeof f.profiles === "object" ? f.profiles : {};
    const friendProfile = f?.friend && typeof f.friend === "object" ? f.friend : {};
    if (!id) {
      logPresenceLiveDebug("friend sessions missing id", {
        displayName: String(f?.display_name || f?.displayName || f?.username || profile.display_name || profiles.display_name || friendProfile.display_name || "").slice(0, 120),
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
      manualStatus: p.manual_status || u.manual_status,
      hasLiveSession: p.has_live_session,
    });
    // Presence deve mandar estado em tempo real; dados de perfil (avatar/nome/cor)
    // ficam sempre os mais recentes vindos de profiles/friends.
    return {
      ...u,
      status,
      activity: status === "offline" ? null : normalizeActivity(p.activity || p.spotify_activity),
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
      activity: normalizeActivity(me.activity || me.spotify_activity || me.spotifyActivity),
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

  const online = filtered.filter(u => normalizeStatus(u.status) !== "offline");
  const offline = filtered.filter(u => normalizeStatus(u.status) === "offline");

  logPresenceLiveDebug("activeNow render source", {
    source,
    liveUserIds: Array.from(presenceMap.values()).filter((u) => u.has_live_session).map((u) => String(u.id || "")).filter(Boolean),
    activeNowUserIds: online.map((u) => String(u.id || "")).filter(Boolean),
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
      includedInActiveNow: effectiveStatus === "online" || effectiveStatus === "idle" || effectiveStatus === "focus" || effectiveStatus === "dnd",
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
    count: online.length,
    userIds: online.map((u) => String(u.id || "")).filter(Boolean),
  });

  // atualizar contador
  if (onlineCountEl) onlineCountEl.textContent = String(online.length);

  // render Active Now
  if (activeNowEl) {
    const signature = buildPresenceListSignature("active", online, q);
    if (activeNowEl.getAttribute("data-presence-signature") === signature) {
      if (onlineCountEl) onlineCountEl.textContent = String(online.length);
    } else {
    const html = online.length
      ? online.map(u => cardUser(u)).join("")
      : `<div class="hint">Ninguém online agora.</div>`;
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
    const signature = buildPresenceListSignature("offline", offline, q);
    if (offlineListEl.getAttribute("data-presence-signature") !== signature) {
    const html = offline.length
      ? offline.map(u => cardUser(u, `<div class="presenceState">offline</div>`)).join("")
      : `<div class="hint">Sem offline.</div>`;
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

