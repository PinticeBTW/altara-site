// Bounded, local DEV evidence. Never stores tokens, URLs, metadata or media.
export function createServerVoiceMoveDiagnostics({ enabled = () => false, emit = () => {} } = {}) {
  const counts = { tokenRequests: 0, connect: 0, micPublish: 0, moveSoundPlays: 0, moveSoundFailures: 0 };
  const history = [];
  const roomSids = new WeakMap();
  const observeRoom = room => {
    if (room && !roomSids.has(room)) {
      roomSids.set(room, null);
      Promise.resolve(room.getSid?.()).then(sid => { if (sid) roomSids.set(room, String(sid)); }).catch(() => {});
    }
  };
  const snapshot = ({ room, member, session, uiChannel, uiPeerIds = [], rosterPeerIds = [] } = {}) => {
    if (!enabled()) return null;
    observeRoom(room);
    const sets = { subscribedVoicePeerIds: new Set(), subscribedCameraPeerIds: new Set(), subscribedSharePeerIds: new Set(), receivedVoicePeerIds: new Set(), receivedCameraPeerIds: new Set(), receivedSharePeerIds: new Set() };
    const publications = [];
    for (const peer of room?.remoteParticipants?.values?.() || []) {
      for (const pub of peer.trackPublications?.values?.() || []) {
        const kind = pub.source === 'microphone' ? 'Voice' : pub.source === 'camera' ? 'Camera' : ['screen_share', 'screen_share_audio'].includes(pub.source) ? 'Share' : null;
        if (!kind) continue;
        const desired = pub.isDesired === true;
        const received = pub.isSubscribed === true;
        if (desired) sets[`subscribed${kind}PeerIds`].add(peer.identity);
        if (received) sets[`received${kind}PeerIds`].add(peer.identity);
        publications.push({ peerId: peer.identity, sid: pub.trackSid, source: pub.source, desired, received });
      }
    }
    return {
      authoritativeChannelAfter: member?.channelId || null,
      assignmentNonce: member?.assignmentNonce || null,
      membershipSessionId: member?.sessionId || null,
      sessionChannel: session?.voiceChannelId || null,
      uiChannel: uiChannel || null,
      roomSid: roomSids.get(room) || null,
      roomName: room?.name || session?.roomName || null,
      roomState: room?.state || null,
      counts: { ...counts },
      ...Object.fromEntries(Object.entries(sets).map(([key, value]) => [key, [...value].sort()])),
      rosterPeerIds: [...new Set(rosterPeerIds)].sort(),
      uiPeerIds: [...new Set(uiPeerIds)].sort(),
      publications,
    };
  };
  return Object.freeze({
    count(kind) { if (enabled() && Object.hasOwn(counts, kind)) counts[kind]++; },
    begin(context) {
      const before = snapshot(context);
      return before ? { before, room: context.room } : null;
    },
    finish(start, context, { toChannel, outcome = 'applied', confirmation = 'membership_write_returned_row' } = {}) {
      if (!start || !enabled()) return null;
      const after = snapshot(context);
      const row = {
        event: 'server_voice.logical_move', at: new Date().toISOString(), outcome, confirmation,
        fromChannel: start.before.authoritativeChannelAfter, toChannel, ...after,
        sameRoom: start.room === context.room && start.before.roomName === after.roomName,
        tokenRequestsDelta: counts.tokenRequests - start.before.counts.tokenRequests,
        connectDelta: counts.connect - start.before.counts.connect,
        micPublishDelta: counts.micPublish - start.before.counts.micPublish,
      };
      history.push(row);
      if (history.length > 40) history.shift();
      emit(JSON.stringify(row));
      return row;
    },
    snapshot,
    history: () => history.map(row => JSON.parse(JSON.stringify(row))),
  });
}

export const serverVoiceMoveDiagnostics = createServerVoiceMoveDiagnostics({
  enabled: () => ['localhost', '127.0.0.1', '::1'].includes(globalThis.location?.hostname)
    || globalThis.altaraDesktop?.isDev === true || globalThis.altaraElectron?.isDev === true,
  emit: line => console.info('[voice-v2-move]', line),
});

// Explicit QA surface for browsers without an attached console. Caller gates
// this behind the DEV runtime and ?voice-move-check=1; it has no network writes.
export function showServerVoiceMoveProof({ snapshot, history, getRoom, document: doc = globalThis.document }) {
  const existing = doc.getElementById('voiceMoveProof');
  if (existing) return existing;
  const panel = doc.createElement('details');
  panel.id = 'voiceMoveProof';
  panel.open = true;
  panel.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;max-width:520px;max-height:65vh;overflow:auto;background:#181818;color:#eee;border:1px solid #666;padding:12px;font:11px/1.5 monospace;user-select:text';
  const title = doc.createElement('summary');title.textContent = 'DEV · Logical move proof';panel.append(title);
  const body = doc.createElement('div');panel.append(body);
  const sample = doc.createElement('button');sample.textContent = 'Sample received RTP';panel.append(sample);
  let stats = [];
  sample.onclick = async () => {
    stats = [];
    for (const peer of getRoom()?.remoteParticipants?.values?.() || []) {
      for (const pub of peer.trackPublications?.values?.() || []) {
        const report = await pub.track?.getRTCStatsReport?.().catch(() => null);
        for (const row of report?.values?.() || []) {
          if (row.type === 'inbound-rtp') stats.push({ peer: peer.identity, source: pub.source, bytes: row.bytesReceived, packets: row.packetsReceived, frames: row.framesDecoded, energy: row.totalAudioEnergy });
        }
      }
    }
    render();
  };
  const render = () => {
    if (!panel.isConnected || !panel.open) return;
    const current = snapshot();
    const last = history().at(-1);
    const values = { ...current, lastMove: last ? { from: last.fromChannel, to: last.toChannel, outcome: last.outcome, sameRoom: last.sameRoom, token: last.tokenRequestsDelta, connect: last.connectDelta, mic: last.micPublishDelta } : null };
    delete values.publications;
    delete values.assignmentNonce;
    delete values.membershipSessionId;
    body.replaceChildren();
    for (const [key, value] of Object.entries(values)) {
      const line = doc.createElement('div');line.textContent = `${key}: ${JSON.stringify(value)}`;body.append(line);
    }
    for (const value of stats) { const line = doc.createElement('div');line.textContent = `RTP: ${JSON.stringify(value)}`;body.append(line); }
  };
  doc.body.append(panel);
  render();
  const timer = doc.defaultView.setInterval(() => { if (!panel.isConnected) doc.defaultView.clearInterval(timer); else render(); }, 1000);
  return panel;
}
