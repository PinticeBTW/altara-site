// presence.js
// Supabase Realtime Presence (Discord-like)

export function createPresenceSystem({ supabase, getMe, onPresenceList, onError }) {
  const PRESENCE_HEARTBEAT_MS = 25000;
  const PRESENCE_STALE_AFTER_MS = 95000;
  const PRESENCE_REFRESH_MS = 12000;

  let channel = null;
  let started = false;
  let heartbeatTimer = null;
  let refreshTimer = null;
  let currentStatus = "online";
  let lastEmittedSignature = "";

  function normalizeStatus(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "online" || s === "idle" || s === "dnd") return s;
    if (s === "invisible" || s === "offline") return "offline";
    return "online";
  }

  function toEpochMs(value) {
    if (!value) return 0;
    const ms = Date.parse(String(value));
    return Number.isFinite(ms) ? ms : 0;
  }

  function clearHeartbeat() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function clearRefreshTimer() {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  async function trackNow(statusOverride = "") {
    if (!channel) return;
    try {
      const payload = getMe?.() || {};
      const nextStatus = normalizeStatus(statusOverride || payload.status || currentStatus || "online");
      currentStatus = nextStatus;
      await channel.track({
        ...payload,
        status: nextStatus,
        last_seen: new Date().toISOString(),
      });
    } catch (e) {
      onError?.(e);
    }
  }

  function startHeartbeat() {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      void trackNow();
    }, PRESENCE_HEARTBEAT_MS);
  }

  function startRefreshTimer() {
    clearRefreshTimer();
    refreshTimer = setInterval(() => {
      emitList();
    }, PRESENCE_REFRESH_MS);
  }

  function flattenPresenceState(state) {
    // state: { [key]: [{...payload}] }
    const out = [];
    for (const key of Object.keys(state || {})) {
      const arr = state[key] || [];
      for (const item of arr) {
        const p = item || {};
        out.push({
          id: p.id || key,
          username: p.username || "",
          display_name: p.display_name || p.username || "User",
          avatar_url: p.avatar_url || null,
          name_color: p.name_color || null,
          call_tile_color: p.call_tile_color || null,
          status: normalizeStatus(p.status || "online"),
          last_seen: p.last_seen || null,
          last_seen_ms: toEpochMs(p.last_seen),
        });
      }
    }

    // Dedupe by id and keep the freshest entry.
    const map = new Map();
    for (const u of out) {
      const prev = map.get(u.id);
      if (!prev || Number(u.last_seen_ms || 0) >= Number(prev.last_seen_ms || 0)) {
        map.set(u.id, u);
      }
    }
    return Array.from(map.values());
  }

  function emitList() {
    try {
      const st = channel?.presenceState ? channel.presenceState() : {};
      const now = Date.now();
      const list = flattenPresenceState(st).map((u) => {
        const age = Math.max(0, now - Number(u.last_seen_ms || 0));
        const stale = !u.last_seen_ms || age > PRESENCE_STALE_AFTER_MS;
        return {
          ...u,
          status: stale ? "offline" : normalizeStatus(u.status),
        };
      });

      // Sort: online/idle/dnd first, offline last.
      const weight = (s) => {
        if (s === "online") return 0;
        if (s === "idle") return 1;
        if (s === "dnd") return 2;
        return 9;
      };
      list.sort((a, b) => weight(a.status) - weight(b.status));

      const signature = list
        .map((u) => [
          String(u.id || "").trim(),
          normalizeStatus(u.status),
          String(u.username || "").trim(),
          String(u.display_name || "").trim(),
          String(u.avatar_url || "").trim(),
          String(u.name_color || "").trim(),
          String(u.call_tile_color || "").trim(),
        ].join("|"))
        .sort()
        .join("||");

      if (signature === lastEmittedSignature) return;
      lastEmittedSignature = signature;
      onPresenceList?.(list);
    } catch (e) {
      onError?.(e);
    }
  }

  async function start() {
    if (started) return;
    started = true;

    const me = getMe?.();
    if (!me?.id) {
      onError?.(new Error("presence: getMe() missing id"));
      return;
    }

    channel = supabase.channel("presence:global", {
      config: { presence: { key: me.id } },
    });
    lastEmittedSignature = "";

    channel
      .on("presence", { event: "sync" }, () => emitList())
      .on("presence", { event: "join" }, () => emitList())
      .on("presence", { event: "leave" }, () => emitList());

    const { error } = await channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          const payload = getMe?.() || {};
          currentStatus = normalizeStatus(payload?.status || currentStatus || "online");
          await channel.track({
            ...payload,
            status: currentStatus,
            last_seen: new Date().toISOString(),
          });
          startHeartbeat();
          startRefreshTimer();
          emitList();
        } catch (e) {
          onError?.(e);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearHeartbeat();
        clearRefreshTimer();
      }
    });

    if (error) onError?.(error);
  }

  async function stop() {
    clearHeartbeat();
    clearRefreshTimer();
    if (!channel) return;
    try {
      await channel.untrack();
    } catch (_) {}
    try {
      supabase.removeChannel(channel);
    } catch (_) {}
    channel = null;
    lastEmittedSignature = "";
    started = false;
  }

  async function setStatus(status) {
    if (!channel) return;
    try {
      currentStatus = normalizeStatus(status || currentStatus || "online");
      await trackNow(currentStatus);
      emitList();
    } catch (e) {
      onError?.(e);
    }
  }

  return { start, stop, setStatus };
}
