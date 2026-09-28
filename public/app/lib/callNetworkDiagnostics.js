// On-demand DEV diagnostics. Reads the existing connections; never creates,
// reconnects, configures or publishes media. No addresses, SDP or tokens escape.
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const delta = (next, before, key) => {
  const a = numeric(next?.[key]), b = numeric(before?.[key]);
  return a === null || b === null || a < b ? null : a - b;
};
const scale = (value, factor) => value === null ? null : value * factor;
const ratio = (value, count, factor = 1) => value === null || count === null || count <= 0 ? null : value / count * factor;

export function summarizeRtcInterval(before, after) {
  const previous = new Map(Array.from(before.values()).map(row => [row.id, row]));
  const rows = Array.from(after.values());
  const byId = new Map(rows.map(row => [row.id, row]));
  const selected = new Set(rows.filter(row => row.type === 'transport').map(row => row.selectedCandidatePairId).filter(Boolean));
  const pairs = rows.filter(row => row.type === 'candidate-pair' && (selected.size ? selected.has(row.id) : row.nominated && row.state === 'succeeded'));
  return {
    pairs: pairs.map(row => {
      const prev = previous.get(row.id), seconds = prev ? (row.timestamp - prev.timestamp) / 1000 : 0;
      const local = byId.get(row.localCandidateId), remote = byId.get(row.remoteCandidateId);
      return {
        state: row.state, protocol: local?.protocol || remote?.protocol || null,
        localType: local?.candidateType || null, remoteType: remote?.candidateType || null,
        relayed: local?.candidateType === 'relay' || remote?.candidateType === 'relay',
        rttMs: scale(numeric(row.currentRoundTripTime), 1000),
        availableOutgoingBps: numeric(row.availableOutgoingBitrate), availableIncomingBps: numeric(row.availableIncomingBitrate),
        outgoingBps: ratio(delta(row, prev, 'bytesSent'), seconds, 8), incomingBps: ratio(delta(row, prev, 'bytesReceived'), seconds, 8),
      };
    }),
    streams: rows.filter(row => ['inbound-rtp', 'outbound-rtp'].includes(row.type)).map((row, streamIndex) => {
      const prev = previous.get(row.id), seconds = prev ? (row.timestamp - prev.timestamp) / 1000 : 0;
      const outgoing = row.type === 'outbound-rtp';
      const receiver = outgoing ? byId.get(row.remoteId) : row;
      const previousReceiver = receiver ? previous.get(receiver.id) : null;
      const lost = delta(receiver, previousReceiver, 'packetsLost');
      const packets = outgoing ? delta(row, prev, 'packetsSent') : delta(row, prev, 'packetsReceived');
      const encoded = delta(row, prev, 'framesEncoded'), decoded = delta(row, prev, 'framesDecoded');
      const emitted = delta(row, prev, 'jitterBufferEmittedCount');
      return {
        // The index and codec identify streams for this sample without exposing identities.
        streamIndex, active: typeof row.active === 'boolean' ? row.active : null,
        direction: outgoing ? 'outgoing' : 'incoming', kind: row.kind || row.mediaType,
        codec: byId.get(row.codecId)?.mimeType || null, seconds,
        width: numeric(row.frameWidth), height: numeric(row.frameHeight),
        bps: ratio(delta(row, prev, outgoing ? 'bytesSent' : 'bytesReceived'), seconds, 8),
        rttMs: scale(numeric(receiver?.roundTripTime), 1000), jitterMs: scale(numeric(receiver?.jitter), 1000),
        packets, lost, lossPercent: outgoing ? ratio(lost, packets, 100) : ratio(lost, packets === null || lost === null ? null : packets + lost, 100),
        remoteFractionLost: numeric(receiver?.fractionLost),
        nack: delta(row, prev, 'nackCount'), pli: delta(row, prev, 'pliCount'), fir: delta(row, prev, 'firCount'),
        retransmittedPackets: delta(row, prev, 'retransmittedPacketsSent'),
        retransmittedBytes: delta(row, prev, 'retransmittedBytesSent'),
        sourceFps: numeric(byId.get(row.mediaSourceId)?.framesPerSecond),
        encoderFps: ratio(encoded, seconds), receivedFps: ratio(delta(row, prev, 'framesReceived'), seconds),
        decodedFps: ratio(decoded, seconds), reportedFps: numeric(row.framesPerSecond),
        encodeMsPerFrame: ratio(delta(row, prev, 'totalEncodeTime'), encoded, 1000),
        decodeMsPerFrame: ratio(delta(row, prev, 'totalDecodeTime'), decoded, 1000),
        jitterBufferMs: ratio(delta(row, prev, 'jitterBufferDelay'), emitted, 1000),
        qualityLimitation: row.qualityLimitationReason || null,
        freezes: delta(row, prev, 'freezeCount'), freezeSeconds: delta(row, prev, 'totalFreezesDuration'),
        packetsDiscarded: delta(row, prev, 'packetsDiscarded'),
      };
    }),
  };
}

export function getExistingLiveKitConnections(room) {
  const manager = room?.engine?.pcManager;
  // SDK 2.15.1's `pc` accessor can CREATE a PC. Read only the backing slot.
  return ['publisher', 'subscriber'].flatMap(role => {
    const pc = manager?.[role]?._pc;
    return pc && pc.connectionState !== 'closed' ? [{ role, pc }] : [];
  });
}

export function summarizeShareTimings(diagnostics = {}) {
  const duration = (a, b) => {
    const start = Date.parse(diagnostics[a]), end = Date.parse(diagnostics[b]);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  };
  return {
    captureMs: duration('captureRequestedAt', 'mediaAcquiredAt'),
    publishMs: duration('publishStartedAt', 'publishSucceededAt'),
    subscribeToAttachMs: duration('remoteTrackSubscribedAt', 'remoteVideoAttachedAt'),
    attachToFirstFrameMs: duration('remoteVideoAttachedAt', 'remoteFirstFrameAt'),
    subscribeToFirstFrameMs: duration('remoteTrackSubscribedAt', 'remoteFirstFrameAt'),
  };
}

export async function measureCallNetwork({ room, connections = getExistingLiveKitConnections(room), videos = [], getDiagnostics = () => ({}), durationMs = 15000, intervalMs = 1000 } = {}) {
  const duration = Math.max(1000, Math.min(60000, Number(durationMs) || 15000));
  const interval = Math.max(500, Math.min(5000, Number(intervalMs) || 1000));
  if (!connections.length) return { status: 'unavailable', reason: 'no_active_peer_connection', samples: [] };
  const unique = connections.filter((entry, i) => connections.findIndex(other => other.pc === entry.pc) === i);
  const read = async () => Promise.all(unique.map(async ({ pc }) => {
    try { return { report: await pc.getStats(), error: null }; }
    catch (error) { return { report: new Map(), error: error?.name || 'getStats_failed' }; }
  }));
  const frameState = new Map(videos.map(video => {
    const state = { start: video.getVideoPlaybackQuality?.(), stream: video.srcObject, track: video.srcObject?.getVideoTracks?.()[0], time: performance.now(), presented: 0, callbacks: 0, resets: 0, lastPresented: null, callbackId: null };
    if (typeof video.requestVideoFrameCallback === 'function') {
      const frame = (_now, metadata) => {
        const count = numeric(metadata.presentedFrames);
        if (count !== null) {
          if (state.lastPresented !== null && count < state.lastPresented) state.resets++;
          state.presented += state.lastPresented === null || count < state.lastPresented ? 1 : count - state.lastPresented;
          state.lastPresented = count;
        }
        state.callbacks++;
        state.callbackId = video.requestVideoFrameCallback(frame);
      };
      state.callbackId = video.requestVideoFrameCallback(frame);
    }
    return [video, state];
  }));
  let previous = await read();
  const samples = [], start = performance.now();
  while (performance.now() - start < duration) {
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(1, duration - (performance.now() - start)))));
    const current = await read();
    samples.push({ elapsedMs: performance.now() - start, connections: current.map((value, i) => ({
      role: unique[i].role, connectionState: unique[i].pc.connectionState, error: value.error,
      ...summarizeRtcInterval(previous[i].report, value.report),
    })) });
    previous = current;
  }
  for (const [video, state] of frameState) if (state.callbackId !== null) video.cancelVideoFrameCallback?.(state.callbackId);
  return {
    status: 'measured', durationMs: performance.now() - start, roomState: room?.state || null,
    connectionCount: unique.length, samples,
    videoPlayback: videos.map(video => {
      const initial = frameState.get(video), final = video.getVideoPlaybackQuality?.();
      const attachmentChanged = video.srcObject !== initial.stream || video.srcObject?.getVideoTracks?.()[0] !== initial.track;
      const total = attachmentChanged ? null : delta(final, initial.start, 'totalVideoFrames'), dropped = attachmentChanged ? null : delta(final, initial.start, 'droppedVideoFrames');
      const seconds = (performance.now() - initial.time) / 1000;
      return {
        visible: !!video.getClientRects().length, paused: video.paused, readyState: video.readyState, attachmentChanged,
        totalFrames: total, droppedFrames: dropped, presentationCounterResets: initial.resets,
        presentedFrames: initial.callbackId === null ? null : initial.presented, frameCallbacks: initial.callbackId === null ? null : initial.callbacks,
        renderedFps: initial.callbackId === null
          ? ratio(total === null || dropped === null ? null : total - dropped, seconds)
          : ratio(initial.presented, seconds),
      };
    }),
    timings: summarizeShareTimings(getDiagnostics()),
    limits: 'RTT is per client-to-SFU leg, not glass-to-glass delay. Missing counters remain null. Remote RTCP feedback can arrive less often than samples. Loopback cannot establish mobile or remote receiver quality.',
  };
}
