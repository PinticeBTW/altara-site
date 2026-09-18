// DEV-only manual infrastructure helper. Importing/constructing never connects.
// The existing authenticated Supabase client supplies Authorization internally.
// No direct storage reads, media APIs, publications or automatic invocation.
const PINTICE = '42388a54-410c-45c3-9d69-c96876ec2cab';
let running = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (predicate, milliseconds, sleep, now) => {
  const deadline = now() + milliseconds;
  while (now() < deadline) { if (await predicate()) return true; await sleep(350); }
  return false;
};

export function createGroupDmProviderCanary({ supabase, Room, RoomEvent, DisconnectReason,
  ConnectionErrorReason, setLogLevel, isDev, isBusy, now = Date.now, sleep = delay }) {
  const invoke = async (operation, canaryId) => {
    try {
      const { data, error } = await supabase.functions.invoke('group-dm-livekit-cutoff/provider-canary', {
        body: { operation, ...(canaryId ? { canaryId } : {}) }, signal: AbortSignal.timeout(12000),
      });
      if (error) {
        const status = Number(error.context?.status) || 0;
        let canaryId;
        try {
          const safe = await error.context?.json();
          if (/^[0-9a-f-]{36}$/i.test(safe?.canaryId || '')) canaryId = safe.canaryId;
        } catch {}
        return { ok: false, status, ...(canaryId ? { canaryId } : {}) }; // No raw context/token body.
      }
      return data?.ok === true ? { ok: true, data } : { ok: false, status: 0 };
    } catch { return { ok: false, status: 0 }; }
  };
  return Object.freeze({ async run() {
    const result = { pass: false, connected: false, forcedDisconnect: false,
      oldTokenRejectedBeforeExpiry: false, newTokenDeniedAfterRemoval: false,
      revocationJobTerminal: false, removalToDisconnectMs: null, cleanupComplete: false };
    if (running) return { ...result, failureStage: 'canary_already_running' };
    if (!isDev()) return { ...result, failureStage: 'development_runtime_required' };
    if (isBusy()) return { ...result, failureStage: 'leave_real_call_first' };
    running = true;
    let canaryId, room, replayRoom, oldToken, tokenExpiresAt, startState, statusState;
    let disconnectedAt = null, removedByProvider = false, clockOffset = 0, phase = 'authenticate';
    const loggerName = 'altara-group-provider-canary';
    // Silence ONLY this Room's named logger; normal calls retain their settings.
    const makeRoom = () => { setLogLevel('silent', loggerName); return new Room({
      loggerName, reconnectPolicy: { nextRetryDelayInMs: () => null },
      adaptiveStream: false, dynacast: false, webAudioMix: false,
    }); };
    const connectOptions = { autoSubscribe: false, maxRetries: 0, websocketTimeout: 8000, peerConnectionTimeout: 10000 };
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || auth.data?.user?.id !== PINTICE) throw new Error('verified_caller_required');
      phase = 'start';
      const beforeStart = now();
      const start = await invoke('start');
      const afterStart = now();
      if (!start.ok) { canaryId = start.canaryId; throw new Error('start_failed'); }
      startState = start.data; canaryId = startState.canaryId; oldToken = startState.token;
      if (typeof oldToken !== 'string' || startState.identity !== PINTICE
        || !Number.isInteger(startState.tokenTtlSeconds) || startState.tokenTtlSeconds < 1 || startState.tokenTtlSeconds > 60
        || startState.roomName !== `groupdm_${startState.conversationId}_${startState.callId}`) throw new Error('invalid_canary_contract');
      // The issued expiry is independently checked below. Never return JWT data.
      const tokenPayload = JSON.parse(atob(oldToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      tokenExpiresAt = tokenPayload.exp * 1000;
      const grant = tokenPayload.video;
      if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt > Date.parse(startState.serverTime) + 61000
        || tokenPayload.sub !== PINTICE || tokenPayload.exp - tokenPayload.nbf > 60 || grant?.room !== startState.roomName
        || grant.roomJoin !== true || grant.canPublish !== false || grant.canSubscribe !== false
        || grant.canPublishData !== false || grant.canUpdateOwnMetadata !== false
        || Object.keys(grant).some(key => !['room','roomJoin','canPublish','canSubscribe','canPublishData','canUpdateOwnMetadata'].includes(key))) throw new Error('unsafe_signal_grant');
      // Decoding here only checks minimum permissions/expiry of the provider
      // token; it is NEVER used as authentication or backend authorization.
      clockOffset = (beforeStart + afterStart) / 2 - Date.parse(startState.serverTime);
      result.clockUncertaintyMs = (afterStart - beforeStart) / 2;
      phase = 'connect'; room = makeRoom();
      room.on(RoomEvent.Disconnected, reason => {
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) { removedByProvider = true; disconnectedAt = now(); }
      });
      await room.connect(startState.livekitUrl, oldToken, connectOptions);
      result.connected = room.state === 'connected' && room.name === startState.roomName
        && room.localParticipant.identity === PINTICE && room.localParticipant.trackPublications.size === 0;
      if (!result.connected) throw new Error('not_connected');
      const connectedStatus = await invoke('status', canaryId);
      if (!connectedStatus.ok || connectedStatus.data.providerParticipantPresent !== true
        || connectedStatus.data.providerParticipantCount !== 1) throw new Error('provider_connection_not_confirmed');
      phase = 'revoke';
      const revokeRequestedAt = now();
      const revoke = await invoke('revoke', canaryId);
      if (!revoke.ok || revoke.data.memberPresent !== false || !revoke.data.removedAt) throw new Error('membership_not_removed');
      phase = 'forced_disconnect';
      const remaining = Math.min(35000, tokenExpiresAt + clockOffset - now() - result.clockUncertaintyMs - 6000);
      if (remaining <= 0 || !await until(() => removedByProvider, remaining, sleep, now)) throw new Error('provider_disconnect_not_observed');
      result.forcedDisconnect = true;
      result.requestToDisconnectMs = disconnectedAt - revokeRequestedAt;
      result.removalToDisconnectMs = Math.round(disconnectedAt - clockOffset - Date.parse(revoke.data.removedAt));
      phase = 'old_token_replay';
      if (now() - clockOffset + result.clockUncertaintyMs >= tokenExpiresAt - 1000) throw new Error('original_token_too_close_to_expiry');
      replayRoom = makeRoom();
      try {
        await replayRoom.connect(startState.livekitUrl, oldToken, connectOptions);
        // A successful replay is an explicit test failure, even if later removed.
      } catch (error) {
        // Include the full clock-estimate uncertainty: natural expiry must
        // never be mistaken for provider cutoff, even on a slow start request.
        result.oldTokenRejectedBeforeExpiry = now() - clockOffset + result.clockUncertaintyMs < tokenExpiresAt
          && error?.reason === ConnectionErrorReason.NotAllowed && [401, 403].includes(Number(error?.status));
      }
      if (!result.oldTokenRejectedBeforeExpiry) throw new Error('old_token_cutoff_not_proved');
      phase = 'new_token';
      const newToken = await invoke('token', canaryId);
      result.newTokenDeniedAfterRemoval = !newToken.ok && newToken.status === 403;
      if (!result.newTokenDeniedAfterRemoval) throw new Error('new_token_denial_not_proved');
      phase = 'terminal_job';
      const terminal = await until(async () => {
        const status = await invoke('status', canaryId);
        if (!status.ok) return false;
        statusState = status.data;
        return statusState.providerParticipantPresent === false && statusState.jobs?.length > 0
          && statusState.jobs.every(job => job.status === 'completed')
          && statusState.jobs.some(job => job.sessionScoped && job.providerCompletedAt && job.cutoffAt);
      }, 40000, sleep, now);
      result.revocationJobTerminal = terminal;
      if (!terminal) throw new Error('terminal_provider_receipt_missing');
      const job = statusState.jobs.find(job => job.sessionScoped);
      result.timings = { membershipRemovedAt: statusState.removedAt, enqueuedAt: job.enqueuedAt,
        dispatchAt: job.dispatchAt, claimedAt: job.claimedAt,
        providerRequestedAt: statusState.providerRequestedAt, providerReturnedAt: statusState.providerReturnedAt,
        providerCompletedAt: job.providerCompletedAt, terminalAt: job.terminalAt };
      if (Object.values(result.timings).some(value => !value)) throw new Error('timing_evidence_missing');
      phase = 'complete';
    } catch { result.failureStage = phase; }
    finally {
      // All connections belong exclusively to this helper. No app Room is used.
      for (const connection of [replayRoom, room]) { try { if (connection) await connection.disconnect(); } catch {} }
      oldToken = null; startState = null;
      if (canaryId) {
        try { result.cleanupComplete = await until(async () => {
          const cleanup = await invoke('cleanup', canaryId);
          if (!cleanup.ok || !cleanup.data.cleanupComplete) return false;
          const status = await invoke('status', canaryId);
          return status.ok && status.data.providerParticipantPresent === false
            && status.data.memberPresent === false && status.data.jobs.every(job => job.status === 'completed');
        }, 45000, sleep, now); } catch {}
      }
      running = false;
    }
    result.pass = phase === 'complete' && result.connected && result.forcedDisconnect
      && result.oldTokenRejectedBeforeExpiry && result.newTokenDeniedAfterRemoval
      && result.revocationJobTerminal && result.cleanupComplete;
    return result;
  } });
}
