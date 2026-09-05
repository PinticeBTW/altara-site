const ALLOWED_PROTOCOLS = new Set(["ws:", "wss:", "http:", "https:"]);

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed.href : "";
  } catch (_) {
    return "";
  }
}

function freezeSnapshot(state = null) {
  if (!state) {
    return Object.freeze({
      available: false,
      status: "idle",
      startedAt: 0,
      finishedAt: 0,
      prepared: false,
      failed: false,
      claimed: false,
      stale: false,
      reason: "not_started",
    });
  }
  return Object.freeze({
    available: true,
    status: String(state.status || "idle"),
    startedAt: Number(state.startedAt || 0),
    finishedAt: Number(state.finishedAt || 0),
    prepared: state.prepared === true,
    failed: state.failed === true,
    claimed: state.claimed === true,
    stale: state.stale === true,
    reason: String(state.reason || "unknown").slice(0, 80),
  });
}

export function createLiveKitConnectionPrewarmCoordinator({
  createRoom = null,
  readCachedUrl = () => "",
  writeCachedUrl = () => false,
  scheduleAfterInteractive = (run) => setTimeout(run, 0),
  now = () => Date.now(),
  onTrace = () => {},
} = {}) {
  let slot = null;
  let interactiveScheduled = false;

  const trace = (event, state = null, details = {}) => {
    try {
      onTrace(Object.freeze({
        event: String(event || "event").slice(0, 80),
        ...freezeSnapshot(state),
        ...details,
      }));
    } catch (_) {}
  };

  function startUrlPrewarm(value, { reason = "manual" } = {}) {
    const url = normalizeUrl(value);
    if (!url || typeof createRoom !== "function") {
      trace("suppressed", null, { reason: url ? "room_factory_unavailable" : "url_unavailable" });
      return null;
    }
    if (slot && slot.url === url && slot.stale !== true && slot.claimed !== true) {
      trace("deduplicated", slot, { reason: "same_url_in_flight" });
      return slot.promise;
    }

    let room = null;
    try {
      room = createRoom();
    } catch (_) {
      trace("failed", null, { reason: "room_construction_failed" });
      return null;
    }
    const state = {
      url,
      room,
      status: "warming",
      startedAt: Math.max(0, Number(now()) || Date.now()),
      finishedAt: 0,
      prepared: false,
      failed: false,
      claimed: false,
      stale: false,
      reason: String(reason || "manual").slice(0, 80),
      promise: null,
    };
    slot = state;
    trace("started", state, { reason: state.reason });
    state.promise = Promise.resolve()
      .then(() => {
        if (typeof room?.prepareConnection !== "function") {
          throw Object.assign(new Error("prepareConnection unavailable"), {
            code: "prepare_connection_unavailable",
          });
        }
        return room.prepareConnection(url);
      })
      .then(() => {
        state.finishedAt = Math.max(state.startedAt, Number(now()) || Date.now());
        state.status = "prepared";
        state.prepared = true;
        state.reason = "url_warm";
        trace("prepared", state, { reason: state.reason });
        return freezeSnapshot(state);
      }, (error) => {
        state.finishedAt = Math.max(state.startedAt, Number(now()) || Date.now());
        state.status = "failed";
        state.failed = true;
        state.reason = String(error?.code || error?.name || "prepare_failed").slice(0, 80);
        trace("failed", state, { reason: state.reason });
        return freezeSnapshot(state);
      });
    return state.promise;
  }

  function scheduleInteractivePrewarm() {
    if (interactiveScheduled) return false;
    interactiveScheduled = true;
    scheduleAfterInteractive(() => {
      const cachedUrl = normalizeUrl(readCachedUrl());
      startUrlPrewarm(cachedUrl, { reason: "interactive_cached_url" });
    });
    return true;
  }

  function rememberUrl(value) {
    const url = normalizeUrl(value);
    if (!url) return false;
    try {
      writeCachedUrl(url);
      return true;
    } catch (_) {
      return false;
    }
  }

  function claim(value, { clickAt = 0 } = {}) {
    const url = normalizeUrl(value);
    const state = slot;
    if (!state || !url || state.url !== url || state.stale === true || state.claimed === true) {
      return null;
    }
    state.claimed = true;
    state.claimedAt = Math.max(0, Number(now()) || Date.now());
    slot = null;
    const getSnapshot = () => freezeSnapshot(state);
    trace("claimed", state, {
      startedBeforeClick: !!(Number(clickAt || 0) && state.startedAt < Number(clickAt)),
      warmBeforeClick: !!(
        Number(clickAt || 0)
        && state.prepared
        && state.finishedAt > 0
        && state.finishedAt <= Number(clickAt)
      ),
    });
    return Object.freeze({
      room: state.room,
      promise: state.promise,
      getSnapshot,
      startedBeforeClick: !!(Number(clickAt || 0) && state.startedAt < Number(clickAt)),
      warmBeforeClick: !!(
        Number(clickAt || 0)
        && state.prepared
        && state.finishedAt > 0
        && state.finishedAt <= Number(clickAt)
      ),
    });
  }

  function replenish(value, { reason = "post_audio_ready" } = {}) {
    return startUrlPrewarm(value, { reason });
  }

  function abandon(reason = "stale_generation") {
    if (!slot) return false;
    slot.stale = true;
    slot.status = "stale";
    slot.reason = String(reason || "stale_generation").slice(0, 80);
    trace("abandoned", slot, { reason: slot.reason });
    slot = null;
    return true;
  }

  return Object.freeze({
    abandon,
    claim,
    getSnapshot: () => freezeSnapshot(slot),
    rememberUrl,
    replenish,
    scheduleInteractivePrewarm,
    startUrlPrewarm,
  });
}

export { normalizeUrl as normalizeLiveKitPrewarmUrl };
