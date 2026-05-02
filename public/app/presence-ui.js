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
  if (raw === "online" || raw === "idle" || raw === "dnd") return raw;
  if (raw === "invisible" || raw === "offline") return "offline";
  return "offline";
}

function statusLabel(s) {
  s = normalizeStatus(s);
  if (s === "online") return "online";
  if (s === "idle") return "idle";
  if (s === "dnd") return "dnd";
  return "offline";
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

function cardUser(u, right = "") {
  const st = statusLabel(u.status);
  const nameColor = normalizeNameColor(u.name_color);
  const nameClass = nameColor ? " userNameCustom" : "";
  const nameStyle = nameColor ? ` style="--user-name-color:${esc(nameColor)}"` : "";
  const avatarHtml = buildPresenceAvatarHtml(u) || `<span class="presenceAvatarFallback">${esc(presenceInitial(u))}</span>`;
  return `
    <div class="presenceRow presenceRow--${esc(st)}" data-presence-user="${esc(u.id)}">
      <div class="presenceLeft">
        <div class="avatar presenceAvatar">
          ${avatarHtml}
          <span class="statusDot" data-status="${esc(st)}"></span>
        </div>
        <div class="presenceText">
          <div class="presenceName${nameClass}"${nameStyle}>${esc(u.display_name || u.username || "User")}</div>
          <div class="presenceHandle">@${esc(u.username || "")}</div>
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
  onUserClick,
  onStatusDot
}) {
  const q = (searchValue || "").trim();
  const meId = me?.id;

  // map: id -> presence data
  const presenceMap = new Map();
  for (const u of (list || [])) {
    if (!u?.id) continue;
    presenceMap.set(u.id, {
      id: u.id,
      username: u.username || "",
      display_name: u.display_name || u.username || "User",
      avatar_url: u.avatar_url || null,
      name_color: normalizeNameColor(u.name_color),
      status: normalizeStatus(u.status),
    });
  }

  // construir lista de users baseada nos amigos para não meter randoms
  const friendUsers = (friends || []).map(f => {
    const id = f.other_user_id || f.id || null;
    return {
      id,
      username: f.username || "",
      display_name: f.display_name || f.username || "User",
      avatar_url: f.avatar_url || null,
      name_color: normalizeNameColor(f.name_color),
      status: "offline"
    };
  }).filter(x => x.id);

  // mete status real se estiver no presenceMap
  const merged = friendUsers.map(u => {
    const p = presenceMap.get(u.id);
    if (!p) return u;
    // Presence deve mandar estado em tempo real; dados de perfil (avatar/nome/cor)
    // ficam sempre os mais recentes vindos de profiles/friends.
    return {
      ...u,
      status: normalizeStatus(p.status),
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
      status: normalizeStatus(me.status || "online"),
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

  // atualizar contador
  if (onlineCountEl) onlineCountEl.textContent = String(online.length);

  // render Active Now
  if (activeNowEl) {
    const html = online.length
      ? online.map(u => cardUser(u, `<div class="presenceState">${esc(statusLabel(u.status))}</div>`)).join("")
      : `<div class="hint">Ninguém online agora.</div>`;
    activeNowEl.innerHTML = html;
    queuePresenceGifPlaybackSync(activeNowEl);

    activeNowEl.querySelectorAll("[data-presence-user]").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-presence-user");
        const u = filtered.find(x => x.id === id);
        if (u) onUserClick?.(u);
      });
    });
  }

  // render Offline
  if (offlineListEl) {
    const html = offline.length
      ? offline.map(u => cardUser(u, `<div class="presenceState">offline</div>`)).join("")
      : `<div class="hint">Sem offline.</div>`;
    offlineListEl.innerHTML = html;
    queuePresenceGifPlaybackSync(offlineListEl);

    offlineListEl.querySelectorAll("[data-presence-user]").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-presence-user");
        const u = filtered.find(x => x.id === id);
        if (u) onUserClick?.(u);
      });
    });
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

