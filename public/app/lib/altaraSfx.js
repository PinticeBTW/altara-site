const clean = (value) => String(value || "").trim();
const lower = (value) => clean(value).toLowerCase();

const cue = (asset, {
  volume,
  loop = false,
  preload = "normal",
  usage,
} = {}) => Object.freeze({
  asset,
  volume,
  loop,
  preload,
  usage,
});

export const ALTARA_SFX_CUE_REGISTRY = Object.freeze({
  message_received: cue("sfx/message_received.wav", { volume: 0.3, preload: "priority", usage: "Incoming message notification" }),
  message_sent: cue("sfx/message_sent.wav", { volume: 0.26, usage: "Successful local message send" }),
  server_voice_join: cue("sfx/server_voice_join.wav", { volume: 0.38, preload: "priority", usage: "Server Voice join and genuine remote join" }),
  server_voice_leave: cue("sfx/server_voice_leave.wav", { volume: 0.38, preload: "priority", usage: "Explicit Server Voice leave and genuine remote leave" }),
  private_call_incoming_loop: cue("sfx/private_call_incoming_loop.mp3", { volume: 0.48, loop: true, preload: "loop", usage: "Incoming Private Call ringtone" }),
  private_call_outgoing_loop: cue("sfx/private_call_outgoing_loop.mp3", { volume: 0.44, loop: true, preload: "loop", usage: "Outgoing Private Call ringtone" }),
  private_call_accept: cue("sfx/private_call_accept.wav", { volume: 0.42, preload: "priority", usage: "Accepted Private Call transition" }),
  private_call_decline: cue("sfx/private_call_decline.wav", { volume: 0.4, preload: "priority", usage: "Declined Private Call terminal result" }),
  private_call_end: cue("sfx/private_call_end.mp3", { volume: 0.4, preload: "priority", usage: "End of an established Private Call" }),
  mute: cue("sfx/mute.wav", { volume: 0.27, preload: "priority", usage: "Explicit successful local microphone mute" }),
  unmute: cue("sfx/unmute.wav", { volume: 0.27, preload: "priority", usage: "Explicit successful local microphone unmute" }),
  deafen: cue("sfx/deafen.wav", { volume: 0.29, preload: "priority", usage: "Explicit successful local deafen" }),
  undeafen: cue("sfx/undeafen.wav", { volume: 0.29, preload: "priority", usage: "Explicit successful local undeafen" }),
  camera_on: cue("sfx/camera_on.wav", { volume: 0.28, preload: "priority", usage: "Successful explicit local camera publication" }),
  camera_off: cue("sfx/camera_off.wav", { volume: 0.28, preload: "priority", usage: "Explicit or device-ended local camera stop" }),
  screen_share_start: cue("sfx/screen_share_start.wav", { volume: 0.32, usage: "Successful local screen-share publication" }),
  screen_share_stop: cue("sfx/screen_share_stop.wav", { volume: 0.32, usage: "Normal local screen-share stop" }),
  server_voice_move: cue("sfx/server_voice_move.wav", { volume: 0.34, preload: "priority", usage: "Authoritative move of the local participant between Server Voice channels" }),
  connection_interrupted: cue("sfx/connection_interrupted.wav", { volume: 0.26, preload: "priority", usage: "Established local call transport reconnecting" }),
  connection_restored: cue("sfx/connection_restored.wav", { volume: 0.26, preload: "priority", usage: "Established local call transport restored" }),
  ui_success: cue("sfx/ui_success.wav", { volume: 0.25, usage: "Explicit high-signal user action success" }),
  ui_warning: cue("sfx/ui_warning.wav", { volume: 0.25, usage: "Explicit recoverable user-facing warning" }),
  ui_error: cue("sfx/ui_error.wav", { volume: 0.27, usage: "Explicit important user-facing action failure" }),
});

export const ALTARA_SFX_PRIORITY_PRELOAD_CUES = Object.freeze([
  "message_received",
  "server_voice_join",
  "server_voice_leave",
  "private_call_accept",
  "private_call_decline",
  "private_call_end",
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "camera_on",
  "camera_off",
  "server_voice_move",
  "connection_interrupted",
  "connection_restored",
]);

export const ALTARA_SFX_LOOP_PRELOAD_CUES = Object.freeze([
  "private_call_incoming_loop",
  "private_call_outgoing_loop",
]);

export function getAltaraSfxCue(cueName = "") {
  return ALTARA_SFX_CUE_REGISTRY[lower(cueName)] || null;
}

export function resolveAltaraSfxAsset(cueName = "", moduleUrl = import.meta.url) {
  const entry = getAltaraSfxCue(cueName);
  if (!entry) return "";
  try {
    return new URL(`../${entry.asset}`, moduleUrl).href;
  } catch (_) {
    return "";
  }
}

export function resolveAltaraSfxAssetFromDocument(cueName = "", documentUrl = "") {
  const entry = getAltaraSfxCue(cueName);
  if (!entry || !clean(documentUrl)) return "";
  try {
    return new URL(`./${entry.asset}`, documentUrl).href;
  } catch (_) {
    return "";
  }
}

export function getAltaraSfxRuntime(href = "") {
  const protocol = (() => {
    try { return new URL(clean(href) || "http://127.0.0.1/").protocol; } catch (_) { return ""; }
  })();
  return protocol === "file:" ? "electron" : "web";
}

function sanitizeGeneration(value = "") {
  const text = clean(value);
  if (!text) return null;
  if (text.length <= 10) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function buildAltaraSfxOwnerKey({
  ownerType = "ui",
  callType = "",
  conversationId = "",
  serverId = "",
  channelId = "",
  generation = "",
  operation = "",
} = {}) {
  return [ownerType, callType, conversationId, serverId, channelId, generation, operation]
    .map((value) => clean(value).toLowerCase())
    .join(":");
}

export function createAltaraSfxPlayer({
  AudioCtor = globalThis.Audio,
  moduleUrl = import.meta.url,
  runtimeHref = () => globalThis.location?.href || "",
  diagnosticsEnabled = () => false,
  logger = (...args) => globalThis.console?.info?.(...args),
} = {}) {
  const templates = new Map();
  const activePlays = new Set();
  let activeLoop = null;

  const diagnosticsOn = () => {
    try { return diagnosticsEnabled() === true; } catch (_) { return false; }
  };

  const trace = (cueName, action, details = {}) => {
    if (!diagnosticsOn()) return false;
    const entry = getAltaraSfxCue(cueName);
    const payload = Object.freeze({
      cue: lower(cueName) || null,
      action: clean(action) || "suppressed",
      reason: clean(details?.reason) || "unspecified",
      ownerType: clean(details?.ownerType) || "ui",
      generation: sanitizeGeneration(details?.generation),
      runtime: getAltaraSfxRuntime(typeof runtimeHref === "function" ? runtimeHref() : runtimeHref),
      assetPath: entry?.asset || null,
      temperature: details?.warm === true ? "warm" : "cold",
      failureCategory: clean(details?.failureCategory) || null,
    });
    try { logger("[altara-sfx]", payload); return true; } catch (_) { return false; }
  };

  const markFailure = (cueName, audio, failureCategory = "asset_unavailable", details = {}) => {
    if (audio) audio.__altaraSfxFailed = true;
    trace(cueName, "failed", { ...details, reason: details?.reason || "playback_failed", failureCategory });
  };

  const configureAudio = (audio, cueName, { loop = null } = {}) => {
    const entry = getAltaraSfxCue(cueName);
    if (!audio || !entry) return null;
    audio.preload = "none";
    audio.loop = typeof loop === "boolean" ? loop : entry.loop === true;
    audio.volume = Math.max(0, Math.min(1, Number(entry.volume) || 0));
    audio.__altaraSfxCue = lower(cueName);
    audio.__altaraSfxAsset = entry.asset;
    audio.__altaraSfxFailed = false;
    audio.__altaraSfxWarm = Number(audio.readyState || 0) >= 2;
    const markWarm = () => { audio.__altaraSfxWarm = true; };
    try {
      audio.addEventListener?.("loadeddata", markWarm);
      audio.addEventListener?.("canplaythrough", markWarm);
      audio.addEventListener?.("error", () => {
        if (audio.__altaraSfxFailed) return;
        markFailure(cueName, audio, "asset_unavailable", { reason: "media_error" });
      });
    } catch (_) {}
    return audio;
  };

  const createAudio = (cueName, { template = false, loop = null } = {}) => {
    const entry = getAltaraSfxCue(cueName);
    const src = resolveAltaraSfxAsset(cueName, moduleUrl);
    if (!entry || !src || typeof AudioCtor !== "function") return null;
    try {
      const audio = configureAudio(new AudioCtor(src), cueName, { loop });
      if (audio && template) templates.set(lower(cueName), audio);
      return audio;
    } catch (_) {
      return null;
    }
  };

  const getTemplate = (cueName) => {
    const normalizedCue = lower(cueName);
    return templates.get(normalizedCue) || createAudio(normalizedCue, { template: true });
  };

  const isWarm = (cueName) => {
    const audio = templates.get(lower(cueName));
    return !!(audio && audio.__altaraSfxFailed !== true && (audio.__altaraSfxWarm === true || Number(audio.readyState || 0) >= 2));
  };

  const preload = (cueNames = Object.keys(ALTARA_SFX_CUE_REGISTRY), { reason = "interactive_preload" } = {}) => {
    let requested = 0;
    for (const rawCue of Array.isArray(cueNames) ? cueNames : [cueNames]) {
      const cueName = lower(rawCue);
      const audio = getTemplate(cueName);
      if (!audio || audio.__altaraSfxFailed || audio.__altaraSfxPreloadRequested) continue;
      audio.__altaraSfxPreloadRequested = true;
      audio.preload = "auto";
      try {
        audio.load?.();
        requested += 1;
        trace(cueName, "preload", { reason, warm: isWarm(cueName), ownerType: "preload" });
      } catch (_) {
        markFailure(cueName, audio, "preload_failed", { reason, ownerType: "preload" });
      }
    }
    return requested;
  };

  const cancelPlay = (record, reason = "cancelled") => {
    if (!record || record.cancelled) return false;
    record.cancelled = true;
    activePlays.delete(record);
    try { record.audio.pause?.(); } catch (_) {}
    try { record.audio.currentTime = 0; } catch (_) {}
    try { record.unregister?.(); } catch (_) {}
    record.resolveCancellation?.();
    record.resolveCancellation = null;
    trace(record.cue, "cancelled", {
      ...record.details,
      reason,
      warm: record.warm,
      failureCategory: "stale_owner",
    });
    return true;
  };

  const play = async (cueName = "", options = {}) => {
    const normalizedCue = lower(cueName);
    const entry = getAltaraSfxCue(normalizedCue);
    const isCurrent = typeof options?.isPlaybackCurrent === "function" ? options.isPlaybackCurrent : () => true;
    const details = {
      reason: clean(options?.reason) || "semantic_play",
      ownerType: clean(options?.ownerType) || "ui",
      generation: clean(options?.generation),
    };
    if (!entry) {
      trace(normalizedCue, "suppressed", { ...details, reason: "unknown_cue", failureCategory: "unknown_cue" });
      return { played: false, method: "none", failureCategory: "unknown_cue" };
    }
    if (!isCurrent()) {
      trace(normalizedCue, "cancelled", { ...details, reason: "stale_owner", failureCategory: "stale_owner" });
      return { played: false, cancelled: true, method: "none", failureCategory: "stale_owner" };
    }
    const template = getTemplate(normalizedCue);
    if (!template || template.__altaraSfxFailed) {
      trace(normalizedCue, "failed", { ...details, reason: "asset_unavailable", failureCategory: "asset_unavailable" });
      return { played: false, method: "none", failureCategory: "asset_unavailable" };
    }
    // Chrome can defer a new media element's first load in a hidden tab. Use
    // the DM cue prepared during the user's foreground interaction when idle.
    const reuseDmTemplate = normalizedCue === "message_received"
      && !Array.from(activePlays).some((record) => record.audio === template);
    const audio = reuseDmTemplate ? template : createAudio(normalizedCue, { loop: false });
    if (!audio) {
      trace(normalizedCue, "failed", { ...details, reason: "audio_unavailable", failureCategory: "audio_unavailable" });
      return { played: false, method: "none", failureCategory: "audio_unavailable" };
    }
    const warm = isWarm(normalizedCue);
    const record = {
      audio,
      cue: normalizedCue,
      ownerKey: clean(options?.ownerKey),
      details,
      warm,
      cancelled: false,
      unregister: null,
      resolveCancellation: null,
    };
    const cancelled = new Promise((resolve) => { record.resolveCancellation = resolve; });
    if (options?.replaceOwner === true && record.ownerKey) {
      for (const previous of Array.from(activePlays)) {
        if (previous.ownerKey === record.ownerKey) cancelPlay(previous, "owner_replaced");
      }
    }
    const cancel = () => cancelPlay(record, "owner_cancelled");
    if (typeof options?.registerCancellation === "function") {
      try { record.unregister = options.registerCancellation(cancel); } catch (_) {}
    }
    if (record.cancelled) {
      try { record.unregister?.(); } catch (_) {}
      return { played: false, cancelled: true, method: "none", failureCategory: "stale_owner" };
    }
    try {
      audio.currentTime = 0;
      activePlays.add(record);
      audio.addEventListener?.("ended", () => {
        activePlays.delete(record);
        try { record.unregister?.(); } catch (_) {}
      }, { once: true });
      const pending = audio.play?.();
      // A pending play() must not keep its caller waiting after cancellation.
      if (pending?.then) await Promise.race([pending, cancelled]);
      if (record.cancelled || !isCurrent()) {
        cancelPlay(record, "stale_owner");
        return { played: false, cancelled: true, method: "html_audio", failureCategory: "stale_owner" };
      }
      trace(normalizedCue, "play", { ...details, warm });
      return {
        played: true,
        method: "html_audio",
        failureCategory: "",
        assetPath: entry.asset,
        assetWasWarm: warm,
        playbackStartedAt: Date.now(),
      };
    } catch (error) {
      if (record.cancelled || !isCurrent()) {
        cancelPlay(record, "stale_owner");
        return { played: false, cancelled: true, method: "html_audio", failureCategory: "stale_owner" };
      }
      activePlays.delete(record);
      try { record.unregister?.(); } catch (_) {}
      const raw = lower(error?.name || error?.message);
      const failureCategory = /notallowed|autoplay/.test(raw)
        ? "autoplay_blocked"
        : (/notsupported|decode|notfound/.test(raw) ? "asset_unavailable" : "audio_play_failed");
      if (failureCategory === "asset_unavailable") template.__altaraSfxFailed = true;
      trace(normalizedCue, "failed", { ...details, reason: "play_rejected", warm, failureCategory });
      return { played: false, method: "html_audio", failureCategory };
    }
  };

  const stopLoop = ({ ownerKey = "", reason = "loop_stop", force = false } = {}) => {
    if (!activeLoop) return false;
    const expectedOwner = clean(ownerKey);
    if (!force && expectedOwner && expectedOwner !== activeLoop.ownerKey) return false;
    const current = activeLoop;
    activeLoop = null;
    current.cancelled = true;
    try { current.audio.pause?.(); } catch (_) {}
    try { current.audio.currentTime = 0; } catch (_) {}
    trace(current.cue, "loop-stop", { ...current.details, reason, warm: current.warm });
    return true;
  };

  const startLoop = async (cueName = "", options = {}) => {
    const normalizedCue = lower(cueName);
    const entry = getAltaraSfxCue(normalizedCue);
    const ownerKey = clean(options?.ownerKey);
    const isCurrent = typeof options?.isPlaybackCurrent === "function" ? options.isPlaybackCurrent : () => true;
    const details = {
      reason: clean(options?.reason) || "ringing",
      ownerType: clean(options?.ownerType) || "private_call",
      generation: clean(options?.generation),
    };
    if (!entry?.loop || !ownerKey) {
      trace(normalizedCue, "suppressed", { ...details, reason: !entry?.loop ? "not_loop_cue" : "missing_owner", failureCategory: "invalid_loop" });
      return { played: false, failureCategory: "invalid_loop" };
    }
    if (!isCurrent()) {
      trace(normalizedCue, "cancelled", { ...details, reason: "stale_owner", failureCategory: "stale_owner" });
      return { played: false, cancelled: true, failureCategory: "stale_owner" };
    }
    if (activeLoop?.cue === normalizedCue && activeLoop?.ownerKey === ownerKey && !activeLoop.cancelled) {
      trace(normalizedCue, "suppressed", { ...details, reason: "duplicate_loop", warm: activeLoop.warm });
      return { played: false, duplicate: true, failureCategory: "duplicate_loop" };
    }
    if (activeLoop) stopLoop({ reason: "loop_replaced", force: true });
    const template = getTemplate(normalizedCue);
    const audio = template?.__altaraSfxFailed ? null : createAudio(normalizedCue, { loop: true });
    if (!audio) {
      trace(normalizedCue, "failed", { ...details, reason: "asset_unavailable", failureCategory: "asset_unavailable" });
      return { played: false, failureCategory: "asset_unavailable" };
    }
    const record = { cue: normalizedCue, ownerKey, audio, details, warm: isWarm(normalizedCue), cancelled: false };
    activeLoop = record;
    try {
      audio.currentTime = 0;
      const pending = audio.play?.();
      if (pending?.then) await pending;
      if (activeLoop !== record || record.cancelled || !isCurrent()) {
        if (activeLoop === record) activeLoop = null;
        try { audio.pause?.(); } catch (_) {}
        trace(normalizedCue, "cancelled", { ...details, reason: "stale_owner", warm: record.warm, failureCategory: "stale_owner" });
        return { played: false, cancelled: true, failureCategory: "stale_owner" };
      }
      trace(normalizedCue, "loop-start", { ...details, warm: record.warm });
      return { played: true, method: "html_audio", assetPath: entry.asset, assetWasWarm: record.warm };
    } catch (error) {
      if (activeLoop === record) activeLoop = null;
      const raw = lower(error?.name || error?.message);
      const failureCategory = /notallowed|autoplay/.test(raw) ? "autoplay_blocked" : "audio_play_failed";
      trace(normalizedCue, "failed", { ...details, reason: "loop_play_rejected", warm: record.warm, failureCategory });
      return { played: false, method: "html_audio", failureCategory };
    }
  };

  const cancelOwner = (ownerKey = "", reason = "owner_cancelled") => {
    const key = clean(ownerKey);
    if (!key) return 0;
    let cancelled = 0;
    if (activeLoop?.ownerKey === key && stopLoop({ ownerKey: key, reason })) cancelled += 1;
    for (const record of Array.from(activePlays)) {
      if (record.ownerKey !== key) continue;
      if (cancelPlay(record, reason)) cancelled += 1;
    }
    return cancelled;
  };

  return Object.freeze({
    preload,
    play,
    startLoop,
    stopLoop,
    cancelOwner,
    isWarm,
    getActiveLoop: () => activeLoop ? { cue: activeLoop.cue, ownerKey: activeLoop.ownerKey } : null,
    getActivePlayCount: () => activePlays.size,
  });
}

const PRIVATE_RINGING_STATES = new Set(["incoming_ringing", "outgoing_ringing"]);
const INTERNAL_TERMINAL_REASON = /(?:cleanup|shutdown|failed|failure|timeout|missed|cancelled|stale|replace|reconnect|disconnect|dispose|join_failed)/i;

export function createPrivateCallSoundLifecycle({ player } = {}) {
  let owner = null;
  const played = new Set();

  const ownerFrom = (input = {}) => {
    const conversationId = clean(input?.conversationId);
    const generation = clean(input?.generation);
    if (!conversationId || !generation) return null;
    const ownerKey = buildAltaraSfxOwnerKey({
      ownerType: "private_call",
      callType: "private_call",
      conversationId,
      generation,
    });
    return { conversationId, generation, ownerKey };
  };

  const begin = (input = {}) => {
    const next = ownerFrom(input);
    if (!next) return null;
    if (!owner || owner.ownerKey !== next.ownerKey) {
      if (owner) player?.cancelOwner?.(owner.ownerKey, "private_call_generation_replaced");
      owner = next;
      played.clear();
    }
    return owner;
  };

  const playOnce = (cueName, reason) => {
    if (!owner) return false;
    const key = `${owner.ownerKey}:${cueName}`;
    if (played.has(key)) return false;
    played.add(key);
    void player?.play?.(cueName, {
      ownerKey: owner.ownerKey,
      ownerType: "private_call",
      generation: owner.generation,
      reason,
      isPlaybackCurrent: () => owner?.ownerKey === key.slice(0, key.length - cueName.length - 1),
    });
    return true;
  };

  const transition = ({
    conversationId = "",
    generation = "",
    previousState = "idle",
    nextState = "idle",
    reason = "state_transition",
  } = {}) => {
    const previous = lower(previousState) || "idle";
    const next = lower(nextState) || "idle";
    const currentOwner = begin({ conversationId, generation });
    if (!currentOwner) return { action: "suppressed", reason: "missing_owner" };
    if (next === "incoming_ringing" || next === "outgoing_ringing") {
      const loopCue = next === "incoming_ringing"
        ? "private_call_incoming_loop"
        : "private_call_outgoing_loop";
      void player?.startLoop?.(loopCue, {
        ownerKey: currentOwner.ownerKey,
        ownerType: "private_call",
        generation: currentOwner.generation,
        reason,
        isPlaybackCurrent: () => owner?.ownerKey === currentOwner.ownerKey,
      });
      return { action: "loop-start", cue: loopCue };
    }

    if (PRIVATE_RINGING_STATES.has(previous)) {
      player?.stopLoop?.({ ownerKey: currentOwner.ownerKey, reason: `${next}:${reason}` });
    }
    if ((next === "connecting" || next === "active") && PRIVATE_RINGING_STATES.has(previous)) {
      return { action: playOnce("private_call_accept", reason) ? "play" : "suppressed", cue: "private_call_accept" };
    }
    if (next === "declined" && (PRIVATE_RINGING_STATES.has(previous) || previous === "connecting")) {
      return { action: playOnce("private_call_decline", reason) ? "play" : "suppressed", cue: "private_call_decline" };
    }
    if ((next === "ended" || next === "idle") && previous === "active" && !INTERNAL_TERMINAL_REASON.test(reason)) {
      return { action: playOnce("private_call_end", reason) ? "play" : "suppressed", cue: "private_call_end" };
    }
    if (["declined", "missed", "ended", "idle"].includes(next)) {
      player?.stopLoop?.({ ownerKey: currentOwner.ownerKey, reason: `${next}:${reason}` });
    }
    return { action: "suppressed", reason: "silent_transition" };
  };

  const stopRingtone = (reason = "ringtone_stop") => owner
    ? player?.stopLoop?.({ ownerKey: owner.ownerKey, reason }) === true
    : false;

  const cancel = (reason = "private_call_cancelled") => {
    if (!owner) return false;
    player?.cancelOwner?.(owner.ownerKey, reason);
    owner = null;
    played.clear();
    return true;
  };

  return Object.freeze({ transition, stopRingtone, cancel, getOwner: () => owner ? { ...owner } : null });
}

export function createConnectionSoundLifecycle({ player } = {}) {
  const cycles = new Map();

  const ownerFrom = (input = {}) => {
    const callType = lower(input?.callType);
    const conversationId = clean(input?.conversationId);
    const generation = clean(input?.generation);
    if (!callType || !conversationId || !generation) return null;
    const ownerKey = buildAltaraSfxOwnerKey({ ownerType: callType, callType, conversationId, generation, operation: "reconnect" });
    return { callType, conversationId, generation, ownerKey };
  };

  const handleState = (input = {}) => {
    const nextOwner = ownerFrom(input);
    const state = lower(input?.connectionState);
    if (!nextOwner || input?.localActive === false) return { action: "suppressed", reason: "inactive_owner" };
    let cycle = cycles.get(nextOwner.callType) || null;
    if (!cycle || cycle.ownerKey !== nextOwner.ownerKey) {
      if (cycle) player?.cancelOwner?.(cycle.ownerKey, "reconnect_owner_replaced");
      cycle = { ...nextOwner, seenConnected: state === "connected", interrupted: false };
      cycles.set(nextOwner.callType, cycle);
    }
    if (state === "connected") {
      if (cycle.interrupted) {
        cycle.interrupted = false;
        cycle.seenConnected = true;
        void player?.play?.("connection_restored", {
          ownerKey: cycle.ownerKey,
          ownerType: cycle.callType,
          generation: cycle.generation,
          reason: clean(input?.reason) || "transport_reconnected",
          isPlaybackCurrent: () => cycles.get(cycle.callType)?.ownerKey === cycle.ownerKey,
        });
        return { action: "play", cue: "connection_restored" };
      }
      cycle.seenConnected = true;
      return { action: "suppressed", reason: "connected_baseline" };
    }
    if (state === "reconnecting" && cycle.seenConnected && !cycle.interrupted) {
      cycle.interrupted = true;
      void player?.play?.("connection_interrupted", {
        ownerKey: cycle.ownerKey,
        ownerType: cycle.callType,
        generation: cycle.generation,
        reason: clean(input?.reason) || "transport_reconnecting",
        isPlaybackCurrent: () => cycles.get(cycle.callType)?.ownerKey === cycle.ownerKey,
      });
      return { action: "play", cue: "connection_interrupted" };
    }
    return { action: "suppressed", reason: cycle.seenConnected ? "duplicate_or_non_reconnect" : "initial_join" };
  };

  const cancel = ({ callType = "", generation = "", reason = "connection_owner_cancelled" } = {}) => {
    const type = lower(callType);
    const cycle = cycles.get(type) || null;
    if (!cycle || (clean(generation) && cycle.generation !== clean(generation))) return false;
    cycles.delete(type);
    player?.cancelOwner?.(cycle.ownerKey, reason);
    return true;
  };

  return Object.freeze({ handleState, cancel, getCycle: (callType) => cycles.get(lower(callType)) || null });
}

const SCREEN_SHARE_TRANSIENT_REASON = /(?:restart|replace|source_switch|change_source|quality|audio_change)/i;
const SCREEN_SHARE_SILENT_STOP_REASON = /(?:disconnect|detach|leave|cleanup|reset|generation|shutdown|call_end)/i;

export function createScreenShareSoundLifecycle({ player } = {}) {
  const sessions = new Map();

  const ownerFrom = (input = {}) => {
    const callType = lower(input?.callType);
    const conversationId = clean(input?.conversationId);
    const generation = clean(input?.generation);
    if (!callType || !conversationId || !generation) return null;
    return {
      callType,
      conversationId,
      generation,
      ownerKey: buildAltaraSfxOwnerKey({ ownerType: callType, callType, conversationId, generation, operation: "screen_share" }),
    };
  };

  const ensureSession = (input = {}) => {
    const next = ownerFrom(input);
    if (!next) return null;
    let session = sessions.get(next.callType) || null;
    if (!session || session.ownerKey !== next.ownerKey) {
      if (session) player?.cancelOwner?.(session.ownerKey, "screen_share_owner_replaced");
      session = { ...next, active: false };
      sessions.set(next.callType, session);
    }
    return session;
  };

  const published = (input = {}) => {
    const session = ensureSession(input);
    const reason = clean(input?.reason) || "track_published";
    if (!session) return { action: "suppressed", reason: "missing_owner" };
    if (session.active) return { action: "suppressed", reason: "duplicate_publication" };
    session.active = true;
    void player?.play?.("screen_share_start", {
      ownerKey: session.ownerKey,
      ownerType: session.callType,
      generation: session.generation,
      reason,
      isPlaybackCurrent: () => sessions.get(session.callType)?.ownerKey === session.ownerKey,
    });
    return { action: "play", cue: "screen_share_start" };
  };

  const unpublished = (input = {}) => {
    const session = ensureSession(input);
    const reason = clean(input?.reason) || "track_unpublished";
    if (!session?.active) return { action: "suppressed", reason: "duplicate_or_inactive" };
    if (SCREEN_SHARE_TRANSIENT_REASON.test(reason)) {
      return { action: "suppressed", reason: "transient_replacement" };
    }
    session.active = false;
    if (SCREEN_SHARE_SILENT_STOP_REASON.test(reason)) {
      return { action: "suppressed", reason: "internal_cleanup" };
    }
    void player?.play?.("screen_share_stop", {
      ownerKey: session.ownerKey,
      ownerType: session.callType,
      generation: session.generation,
      reason,
      isPlaybackCurrent: () => sessions.get(session.callType)?.ownerKey === session.ownerKey,
    });
    return { action: "play", cue: "screen_share_stop" };
  };

  const cancel = ({ callType = "", reason = "screen_share_cancelled" } = {}) => {
    const type = lower(callType);
    const session = sessions.get(type) || null;
    if (!session) return false;
    sessions.delete(type);
    player?.cancelOwner?.(session.ownerKey, reason);
    return true;
  };

  return Object.freeze({ published, unpublished, cancel, getSession: (callType) => sessions.get(lower(callType)) || null });
}

const CAMERA_EXPLICIT_REASON = /(?:manual_toggle|camera_main_button_left_click|explicit_camera_toggle)/i;
const CAMERA_DEVICE_ENDED_REASON = /(?:local_track_ended|device_ended|capture_ended)/i;
const CAMERA_TRANSIENT_REASON = /(?:restart|replace|replacement|source_switch|change_source|quality|device_change)/i;
const CAMERA_SILENT_STOP_REASON = /(?:disconnect|detach|leave|cleanup|reset|generation|shutdown|call_end|dispose|stale|reconnect|switch_call|switch_channel)/i;

export function createCameraSoundLifecycle({ player } = {}) {
  const sessions = new Map();

  const ownerFrom = (input = {}) => {
    const callType = lower(input?.callType);
    const conversationId = clean(input?.conversationId);
    const generation = clean(input?.generation);
    if (!callType || !conversationId || !generation) return null;
    return {
      callType,
      conversationId,
      generation,
      ownerKey: buildAltaraSfxOwnerKey({ ownerType: callType, callType, conversationId, generation, operation: "camera" }),
    };
  };

  const ensureSession = (input = {}) => {
    const next = ownerFrom(input);
    if (!next) return null;
    let session = sessions.get(next.callType) || null;
    if (!session || session.ownerKey !== next.ownerKey) {
      if (session) player?.cancelOwner?.(session.ownerKey, "camera_owner_replaced");
      session = { ...next, active: false };
      sessions.set(next.callType, session);
    }
    return session;
  };

  const published = (input = {}) => {
    if (typeof input?.isGenerationCurrent === "function" && input.isGenerationCurrent() !== true) {
      return { action: "cancelled", reason: "stale_generation" };
    }
    const session = ensureSession(input);
    const reason = clean(input?.reason) || "track_published";
    if (!session) return { action: "suppressed", reason: "missing_owner" };
    if (session.active) return { action: "suppressed", reason: "duplicate_publication" };
    session.active = true;
    const explicitUserAction = input?.explicitUserAction === true || CAMERA_EXPLICIT_REASON.test(reason);
    if (!explicitUserAction) return { action: "suppressed", reason: "non_explicit_publication" };
    void player?.play?.("camera_on", {
      ownerKey: session.ownerKey,
      ownerType: session.callType,
      generation: session.generation,
      reason,
      isPlaybackCurrent: () => (
        sessions.get(session.callType)?.ownerKey === session.ownerKey
        && (typeof input?.isGenerationCurrent !== "function" || input.isGenerationCurrent() === true)
      ),
    });
    return { action: "play", cue: "camera_on" };
  };

  const unpublished = (input = {}) => {
    if (typeof input?.isGenerationCurrent === "function" && input.isGenerationCurrent() !== true) {
      return { action: "cancelled", reason: "stale_generation" };
    }
    const session = ensureSession(input);
    const reason = clean(input?.reason) || "track_unpublished";
    if (!session?.active) return { action: "suppressed", reason: "duplicate_or_inactive" };
    session.active = false;
    if (CAMERA_TRANSIENT_REASON.test(reason)) return { action: "suppressed", reason: "transient_replacement" };
    if (CAMERA_SILENT_STOP_REASON.test(reason)) return { action: "suppressed", reason: "internal_cleanup" };
    const audibleStop = input?.explicitUserAction === true
      || input?.deviceEnded === true
      || CAMERA_EXPLICIT_REASON.test(reason)
      || CAMERA_DEVICE_ENDED_REASON.test(reason);
    if (!audibleStop) return { action: "suppressed", reason: "non_user_camera_stop" };
    void player?.play?.("camera_off", {
      ownerKey: session.ownerKey,
      ownerType: session.callType,
      generation: session.generation,
      reason,
      isPlaybackCurrent: () => (
        sessions.get(session.callType)?.ownerKey === session.ownerKey
        && (typeof input?.isGenerationCurrent !== "function" || input.isGenerationCurrent() === true)
      ),
    });
    return { action: "play", cue: "camera_off" };
  };

  const cancel = ({ callType = "", reason = "camera_cancelled" } = {}) => {
    const type = lower(callType);
    const session = sessions.get(type) || null;
    if (!session) return false;
    sessions.delete(type);
    player?.cancelOwner?.(session.ownerKey, reason);
    return true;
  };

  return Object.freeze({ published, unpublished, cancel, getSession: (callType) => sessions.get(lower(callType)) || null });
}

export function createServerVoiceMoveSoundLifecycle({ player } = {}) {
  let owner = null;
  const playedOperations = new Set();

  const play = (input = {}) => {
    const conversationId = clean(input?.conversationId);
    const generation = clean(input?.generation);
    const operation = clean(input?.operation);
    if (!conversationId || !generation || !operation) return { action: "suppressed", reason: "missing_owner" };
    if (input?.targetIsLocal !== true) return { action: "suppressed", reason: "not_moved_participant" };
    if (typeof input?.isGenerationCurrent === "function" && input.isGenerationCurrent() !== true) {
      return { action: "cancelled", reason: "stale_generation" };
    }
    if (input?.authoritative !== true || input?.transitionSucceeded !== true) {
      return { action: "suppressed", reason: "move_not_authoritative" };
    }
    const nextOwner = {
      conversationId,
      generation,
      ownerKey: buildAltaraSfxOwnerKey({
        ownerType: "server_voice",
        callType: "server_voice",
        conversationId,
        generation,
        operation: "server_voice_move",
      }),
    };
    if (!owner || owner.ownerKey !== nextOwner.ownerKey) {
      if (owner) player?.cancelOwner?.(owner.ownerKey, "server_voice_move_owner_replaced");
      owner = nextOwner;
      playedOperations.clear();
    }
    const operationKey = `${owner.ownerKey}:${operation.toLowerCase()}`;
    if (playedOperations.has(operationKey)) return { action: "suppressed", reason: "duplicate_move" };
    playedOperations.add(operationKey);
    void player?.play?.("server_voice_move", {
      ownerKey: owner.ownerKey,
      ownerType: "server_voice",
      generation: owner.generation,
      reason: clean(input?.reason) || "authoritative_move_applied",
      isPlaybackCurrent: () => (
        owner?.ownerKey === nextOwner.ownerKey
        && (typeof input?.isGenerationCurrent !== "function" || input.isGenerationCurrent() === true)
      ),
    });
    return { action: "play", cue: "server_voice_move" };
  };

  const cancel = (reason = "server_voice_move_cancelled") => {
    if (!owner) return false;
    player?.cancelOwner?.(owner.ownerKey, reason);
    owner = null;
    playedOperations.clear();
    return true;
  };

  return Object.freeze({ play, cancel, getOwner: () => owner ? { ...owner } : null });
}
