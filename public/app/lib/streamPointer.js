import { RoomEvent, Track } from "../vendor/livekit-client/livekit-client.esm.mjs";
import { sanitizeCallVisibleName } from "./callVisibleIdentity.js";
import { parseNativeScreenshareCompanionIdentity } from "./liveKitTechnicalParticipant.js";

export const STREAM_POINTER_TOPIC = "altara.stream-pointer.v1";
const MAX_PACKET_BYTES = 8192;
const MAX_ACL = 64;
const TTL = Object.freeze({ move: 1500, ping: 2000, highlight: 4000 });
const COLORS = ["#b6a4da", "#91b9cb", "#b6c59a", "#d1ad92", "#cb9ead", "#a1b9b2"];
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 256;
const coordinate = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const defaultPolicy = () => ({ enabled: true, mode: "all", allowed: [], muted: [] });
const safeName = value => [...sanitizeCallVisibleName(String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/g, ""), "User")].slice(0, 40).join("");
const eventKey = (identity, type) => `${identity}:${type === "end" ? "move" : type}`;
const EVENT_FIELDS = new Set(["v", "context", "room", "op", "stream", "epoch", "revision", "actorSid", "sequence", "type", "x", "y", "x2", "y2", "color"]);
const customColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function parsePolicy(value) {
  if (!value || typeof value !== "object" || typeof value.enabled !== "boolean"
    || !["all", "selected"].includes(value.mode)) return null;
  if (![value.allowed, value.muted].every(list => Array.isArray(list) && list.length <= MAX_ACL && list.every(validId))) return null;
  return { enabled: value.enabled, mode: value.mode, allowed: [...new Set(value.allowed)], muted: [...new Set(value.muted)] };
}

function presentationColor(identity) {
  let hash = 0;
  for (const char of identity) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

// Events travel directly between authenticated room participants. Every
// receiver derives the author from LiveKit's actual DataReceived participant,
// and checks the real publication owner's authenticated moderation policy.
// No client (including the broadcaster) can claim another participant's name.
export function createStreamPointerController({
  room,
  contextId,
  getParticipantPresentation = () => null,
  isParticipantAuthorized = () => true,
  onError = () => {},
  now = () => Date.now(),
} = {}) {
  if (!room || !validId(contextId)) throw new Error("stream_pointer_context_required");
  const listeners = new Set();
  const bindings = [];
  const streams = new Map();
  const buckets = new Map();
  const ingress = new Map();
  const sent = new Map();
  const pendingMoves = new Map();
  const retainedPolicies = new Map();
  const retiredEpochs = new Map();
  let disposed = false;
  let suspended = room.state !== "connected";
  let timer = null;
  let sequence = 0;
  let error = null;
  let generation = 0;
  let lastRequestAt = -Infinity;

  const local = () => room.localParticipant;
  const participant = identity => identity === local()?.identity ? local() : room.remoteParticipants?.get(identity);
  const connected = () => !disposed && !suspended && room.state === "connected";
  function authorized(actor, { data = false } = {}) {
    if (!actor || !validId(actor.identity) || participant(actor.identity) !== actor
      || actor.identity.startsWith("altara_bot:") || actor.isAgent === true
      || parseNativeScreenshareCompanionIdentity(actor.identity)
      || actor.permissions?.canSubscribe === false || (data && actor.permissions?.canPublishData !== true)) return false;
    try { return isParticipantAuthorized(actor) === true; } catch (_) { return false; }
  }
  function emit(id = null, detail = null) {
    for (const listener of listeners) { try { listener(id, detail); } catch (_) { /* A view cannot interrupt transport cleanup. */ } }
  }
  function fail() {
    if (disposed) return;
    error = "send_failed";
    try { onError(new Error("stream_pointer_send_failed")); } catch (_) { /* Error reporting is optional. */ }
    emit();
  }
  const packetBytes = packet => encoder.encode(JSON.stringify({ v: 1, context: contextId, room: room.name, ...packet }));
  function publish(packet, destinations, reliable) {
    if (!connected() || !authorized(local(), { data: true }) || !destinations.length) return false;
    const bytes = packetBytes(packet);
    if (bytes.byteLength > MAX_PACKET_BYTES) return false;
    const current = generation;
    try {
      Promise.resolve(local().publishData(bytes, { topic: STREAM_POINTER_TOPIC, reliable, destinationIdentities: destinations }))
        .catch(() => { if (!disposed && current === generation) fail(); });
      return true;
    } catch (_) { fail(); return false; }
  }
  const recipients = () => [...(room.remoteParticipants?.values() || [])].filter(actor => authorized(actor)).map(actor => actor.identity);
  function rememberEpoch(record) {
    const values = new Set([...(retiredEpochs.get(record.streamId) || []), ...record.retiredEpochs]);
    if (record.epoch) values.add(record.epoch);
    retiredEpochs.set(record.streamId, [...values].slice(-4));
    if (retiredEpochs.size > 128) retiredEpochs.delete(retiredEpochs.keys().next().value);
  }
  function discover() {
    if (!connected() || !authorized(local())) return [];
    const result = [];
    for (const actor of [local(), ...(room.remoteParticipants?.values() || [])]) {
      if (!mayShare(actor)) continue;
      for (const publication of actor.videoTrackPublications?.values() || []) {
        if (!screenPublication(publication)) continue;
        result.push({ streamId: publication.trackSid, ownerIdentity: actor.identity, local: actor === local(), owner: actor, publication });
      }
    }
    return result;
  }
  function mayShare(actor) {
    if (!authorized(actor, { data: true }) || actor.permissions?.canPublish !== true) return false;
    const sources = actor.permissions?.canPublishSources;
    return !Array.isArray(sources) || !sources.length || sources.includes(3) || sources.includes(Track.Source.ScreenShare);
  }
  function screenPublication(publication) {
    return publication?.source === Track.Source.ScreenShare && validId(publication.trackSid)
      && publication.kind === Track.Kind.Video && publication.isMuted !== true;
  }
  function currentRecord(record) {
    return !!record && connected() && authorized(local()) && mayShare(record.owner)
      && record.owner.videoTrackPublications?.get(record.streamId) === record.publication && screenPublication(record.publication);
  }
  function cancelMove(streamId) {
    const pending = pendingMoves.get(streamId);
    if (!pending) return;
    clearTimeout(pending.timer); pendingMoves.delete(streamId);
  }
  function announce(record, destinations = recipients(), requestId = null) {
    if (!record.local || !record.epoch) return false;
    return publish({ op: "policy", stream: record.streamId, epoch: record.epoch, revision: record.revision, policy: record.policy, requestId }, destinations, true);
  }
  function allowed(record, identity) {
    const actor = participant(identity);
    return record.policy.enabled && authorized(actor, { data: true })
      && !record.policy.muted.includes(identity)
      && (record.policy.mode === "all" || record.policy.allowed.includes(identity));
  }
  function prune(record) {
    for (const [key, indicator] of record.indicators) {
      if (indicator.expiresAt <= now() || !allowed(record, indicator.identity)) record.indicators.delete(key);
    }
    for (const key of record.received.keys()) if (!authorized(participant(key.slice(0, key.lastIndexOf(":"))), { data: true })) record.received.delete(key);
  }
  function scheduleExpiry() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    let deadline = Infinity;
    for (const record of streams.values()) for (const item of record.indicators.values()) deadline = Math.min(deadline, item.expiresAt);
    if (deadline !== Infinity) {
      timer = setTimeout(() => {
        timer = null;
        for (const record of streams.values()) prune(record);
        emit(); scheduleExpiry();
      }, Math.max(1, deadline - now()));
      timer.unref?.();
    }
  }
  function reconcile({ request = true } = {}) {
    if (disposed) return;
    const found = discover();
    const ids = new Set(found.map(entry => entry.streamId));
    let changed = false;
    for (const [id, record] of streams) {
      if (!ids.has(id) || !found.some(entry => entry.streamId === id && entry.owner === record.owner)) {
        rememberEpoch(record); cancelMove(id); streams.delete(id); sent.delete(id); changed = true;
      }
    }
    for (const entry of found) {
      let record = streams.get(entry.streamId);
      if (!record) {
        const retained = retainedPolicies.get(entry.streamId);
        const policy = entry.local && retained?.publication === entry.publication && retained?.owner === entry.owner ? retained.policy : defaultPolicy();
        record = { ...entry, epoch: entry.local ? crypto.randomUUID() : null, requestId: crypto.randomUUID(), retiredEpochs: new Set(retiredEpochs.get(entry.streamId) || []), revision: 0, policy, indicators: new Map(), received: new Map() };
        streams.set(entry.streamId, record); changed = true;
        if (entry.local) announce(record);
      }
      const count = record.indicators.size;
      prune(record);
      if (!allowed(record, local()?.identity)) cancelMove(record.streamId);
      if (record.indicators.size !== count) changed = true;
    }
    for (const [identity, bucket] of buckets) {
      if (!authorized(participant(identity))) buckets.delete(identity);
      else for (const id of bucket.streams.keys()) if (!ids.has(id)) bucket.streams.delete(id);
    }
    for (const identity of ingress.keys()) if (!authorized(participant(identity))) ingress.delete(identity);
    if (connected()) for (const [id, retained] of retainedPolicies) {
      // Muting a share or temporarily losing media/data permission must never
      // silently reset the broadcaster's privacy settings to the default.
      if (local() !== retained.owner || local()?.videoTrackPublications?.get(id) !== retained.publication) retainedPolicies.delete(id);
    }
    if (request && connected() && now() - lastRequestAt >= 500) {
      lastRequestAt = now();
      for (const record of streams.values()) if (!record.local && !record.epoch) publish({ op: "request", stream: record.streamId, requestId: record.requestId }, [record.ownerIdentity], true);
    }
    scheduleExpiry();
    if (changed) emit();
  }
  function normalizedEvent(type, value) {
    if (!["move", "end", "ping", "highlight"].includes(type)) return null;
    if (value?.color !== undefined && (type !== "move" || !customColor(value.color))) return null;
    if (type === "end") return { type };
    if (!coordinate(value?.x) || !coordinate(value?.y)) return null;
    const result = { type, x: value.x, y: value.y };
    if (value.color !== undefined) {
      result.color = value.color.toLowerCase();
    }
    if (type === "highlight") {
      if (!coordinate(value.x2) || !coordinate(value.y2) || Math.abs(value.x - value.x2) < .002 || Math.abs(value.y - value.y2) < .002) return null;
      Object.assign(result, { x: Math.min(value.x, value.x2), y: Math.min(value.y, value.y2), x2: Math.max(value.x, value.x2), y2: Math.max(value.y, value.y2) });
    }
    return result;
  }
  function rateAllowed(identity, streamId, type) {
    let state = buckets.get(identity);
    const time = now();
    if (!state) { state = { tokens: 35, time, streams: new Map() }; buckets.set(identity, state); }
    state.tokens = Math.min(35, state.tokens + Math.max(0, time - state.time) * .03);
    state.time = time;
    if (type !== "end") {
      if (state.tokens < 1) return false;
      state.tokens -= 1;
    }
    let perStream = state.streams.get(streamId);
    if (!perStream) { perStream = {}; state.streams.set(streamId, perStream); }
    // Movement spacing belongs to the sender. Network jitter may legitimately
    // deliver several ordered samples together; byte/token budgets still bound
    // ingress work while sequence numbers retain only the newest position.
    const gap = type === "ping" ? 800 : type === "highlight" ? 1600 : type === "request" ? 500 : 0;
    if (time - (perStream[type] ?? -Infinity) < gap) return false;
    perStream[type] = time;
    return true;
  }
  function applyEvent(record, identity, event, eventSequence) {
    const key = eventKey(identity, event.type);
    const previous = record.received.get(key) ?? -1;
    if (eventSequence <= previous) return false;
    record.received.set(key, eventSequence);
    if (event.type === "end") record.indicators.delete(`${identity}:move`);
    else {
      let label;
      try { label = getParticipantPresentation(participant(identity)); } catch (_) { label = null; }
      const safeColor = customColor(event.color) ? event.color
        : typeof label?.color === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(label.color) ? label.color : presentationColor(identity);
      record.indicators.set(`${identity}:${event.type}`, {
        ...event, identity, name: safeName(label?.name || participant(identity)?.name), color: safeColor,
        updatedAt: now(), expiresAt: now() + TTL[event.type], sequence: eventSequence, id: `${record.epoch}:${identity}:${eventSequence}`,
      });
    }
    error = null;
    emit(record.streamId, { kind: "event", identity, type: event.type }); scheduleExpiry();
    return true;
  }
  function acceptEvent(record, actor, packet) {
    if (!validId(record.epoch) || packet.epoch !== record.epoch || packet.revision !== record.revision
      || !allowed(record, actor.identity) || !integer(packet.sequence) || !validId(actor.sid) || packet.actorSid !== actor.sid) return false;
    if (Object.keys(packet).some(field => !EVENT_FIELDS.has(field))) return false;
    const event = normalizedEvent(packet.type, packet);
    if (!event || packet.sequence <= (record.received.get(eventKey(actor.identity, event.type)) ?? -1)
      || !rateAllowed(actor.identity, record.streamId, event.type)) return false;
    if (!applyEvent(record, actor.identity, event, packet.sequence)) return false;
    return true;
  }
  function receive(bytes, actor, _kind, topic) {
    if (topic !== STREAM_POINTER_TOPIC || !connected() || !authorized(local()) || !authorized(actor, { data: true })
      || !(bytes instanceof Uint8Array) || bytes.byteLength > MAX_PACKET_BYTES) return;
    // Bound UTF-8/JSON work before decoding untrusted input, independently for
    // each authenticated author. Direct events need no amplified relay budget.
    const time = now();
    let budget = ingress.get(actor.identity);
    if (!budget) { budget = { tokens: 40, bytes: 32768, time }; ingress.set(actor.identity, budget); }
    budget.tokens = Math.min(40, budget.tokens + Math.max(0, time - budget.time) * .035);
    budget.bytes = Math.min(32768, budget.bytes + Math.max(0, time - budget.time) * 32.768);
    budget.time = time;
    if (budget.tokens < 1 || budget.bytes < bytes.byteLength) return;
    budget.tokens -= 1; budget.bytes -= bytes.byteLength;
    let packet;
    try { packet = JSON.parse(decoder.decode(bytes)); } catch (_) { return; }
    if (!packet || packet.v !== 1 || packet.context !== contextId || packet.room !== room.name || !validId(packet.stream)) return;
    reconcile({ request: false });
    const record = streams.get(packet.stream);
    if (!record) return;
    if (packet.op === "request") {
      if (record.local && validId(packet.requestId) && rateAllowed(actor.identity, record.streamId, "request")) announce(record, [actor.identity], packet.requestId);
      return;
    }
    if (packet.op === "event") { acceptEvent(record, actor, packet); return; }
    // Membership, source and owner were just derived from the live SDK objects.
    if (actor !== record.owner || record.local || !validId(packet.epoch) || !integer(packet.revision)) return;
    if (packet.op === "policy") {
      const policy = parsePolicy(packet.policy);
      if (!policy || (record.retiredEpochs.has(packet.epoch) && packet.requestId !== record.requestId)
        || (record.epoch === packet.epoch && packet.revision < record.revision)) return;
      // A newly joined/reconnected receiver only accepts a response to its own
      // nonce. Delayed reliable packets cannot resurrect a previous session.
      if (record.epoch !== packet.epoch && packet.requestId !== record.requestId) {
        publish({ op: "request", stream: record.streamId, requestId: record.requestId }, [record.ownerIdentity], true);
        return;
      }
      if (record.epoch !== packet.epoch || packet.revision !== record.revision) {
        cancelMove(record.streamId);
        if (record.epoch !== packet.epoch && record.epoch) {
          record.retiredEpochs.add(record.epoch);
          if (record.retiredEpochs.size > 4) record.retiredEpochs.delete(record.retiredEpochs.values().next().value);
        }
        record.indicators.clear(); record.received.clear();
      }
      record.epoch = packet.epoch; record.revision = packet.revision; record.policy = policy;
      record.retiredEpochs.delete(packet.epoch);
      prune(record); emit(record.streamId); scheduleExpiry(); return;
    }
  }
  function dispatch(record, event) {
    if (!currentRecord(record) || !record.epoch || !allowed(record, local()?.identity)) return false;
    const streamId = record.streamId, type = event.type;
    const time = now();
    const previous = sent.get(streamId) || {};
    const gap = type === "ping" ? 800 : type === "highlight" ? 1600 : 0;
    if (time - (previous[type] ?? -Infinity) < gap) return false;
    previous[type] = time; sent.set(streamId, previous);
    const packet = { op: "event", stream: streamId, epoch: record.epoch, revision: record.revision, actorSid: local()?.sid, sequence: ++sequence, ...event };
    if (!acceptEvent(record, local(), packet)) return false;
    const destinations = recipients();
    return !destinations.length || publish(packet, destinations, type !== "move");
  }
  function send(streamId, type, value = {}) {
    if (type === "end") cancelMove(streamId);
    const event = normalizedEvent(type, value);
    if (!event || !connected()) return false;
    let record = streams.get(streamId);
    if (!record) { reconcile({ request: false }); record = streams.get(streamId); }
    if (!currentRecord(record) || !record.epoch || !allowed(record, local()?.identity)) {
      cancelMove(streamId); return false;
    }
    const remaining = 40 - (now() - (sent.get(streamId)?.move ?? -Infinity));
    if (type === "move" && remaining > 0) {
      const existing = pendingMoves.get(streamId);
      if (existing) { existing.event = event; return true; }
      // Keep the latest sample without queuing work at mouse polling frequency.
      // The publication, membership, policy and session are checked again when
      // this one bounded trailing packet is about to leave the client.
      const pending = { event, epoch: record.epoch, revision: record.revision, generation, actorSid: local()?.sid, timer: null };
      const flush = () => {
        if (pendingMoves.get(streamId) !== pending) return;
        const current = streams.get(streamId);
        if (current !== record || generation !== pending.generation || current?.epoch !== pending.epoch
          || current?.revision !== pending.revision || local()?.sid !== pending.actorSid || !currentRecord(current)
          || !allowed(current, local()?.identity)) { cancelMove(streamId); return; }
        const wait = 40 - (now() - (sent.get(streamId)?.move ?? -Infinity));
        if (wait > 0) {
          pending.timer = setTimeout(flush, Math.ceil(wait)); pending.timer.unref?.(); return;
        }
        pendingMoves.delete(streamId);
        dispatch(current, pending.event);
      };
      pending.timer = setTimeout(flush, Math.ceil(remaining));
      pending.timer.unref?.();
      pendingMoves.set(streamId, pending);
      return true;
    }
    if (type === "move") cancelMove(streamId);
    return dispatch(record, event);
  }
  function setPolicy(streamId, patch = {}) {
    reconcile({ request: false });
    const record = streams.get(streamId);
    if (!record?.local || !connected()) return false;
    const current = { ...record.policy,
      allowed: record.policy.allowed.filter(identity => authorized(participant(identity), { data: true })),
      muted: record.policy.muted.filter(identity => authorized(participant(identity), { data: true })),
    };
    const policy = parsePolicy({ ...current, ...patch });
    if (!policy) return false;
    // Keep ACLs bounded and tied to real current participants, never arbitrary IDs.
    if (![...policy.allowed, ...policy.muted].every(identity => authorized(participant(identity), { data: true }))) return false;
    if (packetBytes({ op: "policy", stream: streamId, epoch: record.epoch, revision: record.revision + 1, policy, requestId: null }).byteLength > MAX_PACKET_BYTES) return false;
    cancelMove(streamId);
    record.policy = policy; record.revision += 1; record.indicators.clear(); record.received.clear();
    retainedPolicies.set(streamId, { publication: record.publication, owner: record.owner, policy });
    announce(record); emit(streamId); scheduleExpiry(); return true;
  }
  function clear(streamId) {
    const record = streams.get(streamId);
    if (!record?.local) return false;
    return setPolicy(streamId, {});
  }
  function publicStream(record) {
    return { streamId: record.streamId, ownerIdentity: record.ownerIdentity, local: record.local };
  }
  function participants() {
    return [local(), ...(room.remoteParticipants?.values() || [])].filter(actor => authorized(actor, { data: true })).map(actor => {
      let label;
      try { label = getParticipantPresentation(actor); } catch (_) { label = null; }
      const color = typeof label?.color === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(label.color) ? label.color : presentationColor(actor.identity);
      return { identity: actor.identity, name: safeName(label?.name || actor.name), color };
    });
  }
  function snapshot(streamId) {
    let record = streams.get(streamId);
    if (!record) { reconcile({ request: false }); record = streams.get(streamId); }
    if (record && !currentRecord(record)) {
      rememberEpoch(record); cancelMove(streamId); streams.delete(streamId); sent.delete(streamId); record = null;
    }
    if (record) {
      prune(record);
      if (!allowed(record, local()?.identity)) cancelMove(streamId);
    }
    if (!record) return { streamId, ownerIdentity: "", localIdentity: local()?.identity || "", epoch: null, revision: null, local: false, available: false, connected: connected(), canSend: false, policy: defaultPolicy(), participants: [], indicators: [], error };
    return { ...publicStream(record), localIdentity: local()?.identity || "", epoch: record.epoch, revision: record.revision, available: true, connected: connected(), canSend: !!record.epoch && allowed(record, local()?.identity),
      policy: { ...record.policy, allowed: [...record.policy.allowed], muted: [...record.policy.muted] }, participants: participants(),
      indicators: [...record.indicators.values()].map(item => ({ ...item })), error };
  }
  function suspend() {
    suspended = true; generation += 1;
    for (const streamId of pendingMoves.keys()) cancelMove(streamId);
    for (const record of streams.values()) {
      rememberEpoch(record);
      if (record.local) retainedPolicies.set(record.streamId, { publication: record.publication, owner: record.owner, policy: record.policy });
    }
    streams.clear(); buckets.clear(); ingress.clear(); sent.clear();
    if (timer !== null) clearTimeout(timer);
    timer = null; emit();
  }
  function resume() {
    suspended = room.state !== "connected"; generation += 1; lastRequestAt = -Infinity;
    reconcile();
    for (const record of streams.values()) if (record.local) announce(record);
    emit();
  }
  function membershipChanged() {
    reconcile();
    for (const record of streams.values()) if (record.local) announce(record);
    emit();
  }
  function bind(event, handler) { if (event) { room.on(event, handler); bindings.push([event, handler]); } }
  bind(RoomEvent.DataReceived, receive);
  bind(RoomEvent.Reconnecting, suspend);
  bind(RoomEvent.Disconnected, suspend);
  bind(RoomEvent.Connected, resume);
  bind(RoomEvent.Reconnected, resume);
  bind(RoomEvent.ConnectionStateChanged, state => { if (state !== "connected") suspend(); else if (suspended) resume(); });
  for (const event of [RoomEvent.TrackPublished, RoomEvent.LocalTrackPublished, RoomEvent.TrackUnpublished, RoomEvent.LocalTrackUnpublished,
    RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantPermissionsChanged]) bind(event, membershipChanged);
  // Let the caller attach views before the initial owner announcement/request.
  queueMicrotask(() => { if (!disposed) reconcile(); });
  return {
    subscribe(listener) { if (typeof listener !== "function" || disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    getStreams() { reconcile({ request: false }); return [...streams.values()].map(publicStream); },
    snapshot, send, setPolicy, clear, reconcile,
    dispose() {
      if (disposed) return;
      suspend(); disposed = true; generation += 1;
      retainedPolicies.clear(); retiredEpochs.clear();
      for (const [event, handler] of bindings) room.off(event, handler);
      bindings.length = 0; listeners.clear();
    },
  };
}
