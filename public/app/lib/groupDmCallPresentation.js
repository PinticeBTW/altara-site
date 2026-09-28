// Group-only presentation. Membership, media ownership and admission stay with
// the existing private-call session and viewer controllers.
const id = value => String(value || '').trim().toLowerCase();

// Presentation only: neither this lifecycle nor its sound adapter owns admission
// or media. Once answered/finished, an old snapshot cannot ring this call again.
export function createGroupDmCallerPresentation({ player, canRing = () => true } = {}) {
  const started = new Set(), finished = new Set();
  let ringingKey = '';
  const remember = (set, key) => {
    set.add(key);
    while (set.size > 128) set.delete(set.values().next().value);
  };
  function stop(reason = 'group_dm_calling_ended') {
    if (!ringingKey) return;
    const ownerKey = ringingKey;
    ringingKey = '';
    player?.stopLoop?.({ ownerKey, reason });
  }
  function reconcile({ snapshot, userId, localConnected = false, remoteParticipantIds = [] } = {}) {
    const me = id(userId), callId = id(snapshot?.callId), conversationId = id(snapshot?.conversationId);
    const key = me && callId && conversationId ? `group-calling:${me}:${conversationId}:${callId}` : '';
    const remoteIds = [...new Set([...(snapshot?.connectedUserIds || []), ...remoteParticipantIds].map(id).filter(uid => uid && uid !== me))];
    const inviteeIds = [...new Set((snapshot?.ringingUserIds || []).map(id).filter(uid => uid && uid !== me))];
    const eligible = !!(key && snapshot?.enabled === true && snapshot?.active === true
      && snapshot?.localPresent === true && id(snapshot?.createdBy) === me);
    if (key && (remoteIds.length || (started.has(key) && (!eligible || !inviteeIds.length)))) remember(finished, key);
    const calling = eligible && localConnected && !remoteIds.length && inviteeIds.length > 0 && !finished.has(key);
    if (!calling || ringingKey !== key) stop();
    if (calling && !started.has(key)) {
      remember(started, key);
      if (canRing()) {
        ringingKey = key;
        void Promise.resolve(player?.startLoop?.('private_call_outgoing_loop', {
          ownerKey: key, ownerType: 'private_call', generation: callId,
          reason: 'group_dm_caller_waiting', isPlaybackCurrent: () => ringingKey === key,
        })).catch(() => {});
      }
    }
    return { calling, inviteeIds: calling ? inviteeIds : [], label: calling ? 'A chamar o grupo…' : '' };
  }
  return { reconcile, stop };
}

export function deriveGroupDmJoinPresentation({ snapshot, joined = false, incoming = false } = {}) {
  const participantIds = [...new Set((snapshot?.connectedUserIds || []).map(id).filter(Boolean))];
  const active = snapshot?.enabled === true && snapshot?.active === true && participantIds.length > 0;
  const canJoin = active && !joined;
  const visible = canJoin && !incoming;
  return { active, canJoin, visible, participantIds, count: participantIds.length,
    state: incoming ? 'incoming' : visible ? 'join' : joined ? 'joined' : 'idle' };
}

export function deriveGroupDmMediaPresentation({ shares = [], mode = 'grid', focusedSource = '',
  focusedShare = '', selectedShare = '' } = {}) {
  const offered = shares.filter(share => share && id(share.key) && id(share.ownerUserId));
  const viewable = offered.filter(share => share.isLocal || share.isWatched === true);
  const explicitParticipant = mode === 'focus' && ['camera', 'avatar'].includes(focusedSource);
  const requested = id(mode === 'focus' && focusedSource === 'screen_share' ? focusedShare : selectedShare);
  // A new publication never replaces the viewer's chosen publication. If that
  // exact share ends, return to the grid until another explicit selection.
  const primary = requested ? viewable.find(share => id(share.key) === requested)
    : viewable.find(share => !share.isLocal) || viewable.find(share => share.isLocal);
  return { layout: explicitParticipant ? 'media-focus'
    : primary ? (mode === 'focus' && focusedSource === 'screen_share' ? 'media-focus' : 'share-stage') : 'voice-grid',
    primaryShareKey: primary ? id(primary.key) : '',
    participantFocus: explicitParticipant, offeredShareKeys: offered.map(share => id(share.key)) };
}

export function computeGroupDmGridLayout({ containerWidth = 0, containerHeight = 0, tileCount = 1, gap = 12, mediaTileCount = 0 } = {}) {
  const count = Math.max(1, Math.floor(Number(tileCount) || 1));
  const width = Math.max(1, Number(containerWidth) || 1), height = Math.max(1, Number(containerHeight) || 1);
  const spacing = Math.max(0, Number(gap) || 0), ratio = 16 / 9;
  // A useful media card takes precedence over squeezing everyone into one row.
  // Shares occupy the same slots; no transport or viewer state enters geometry.
  const capacity = Math.max(1, Math.floor((width + spacing) / (220 + spacing)));
  const preferred = count === 1 ? 1 : count <= 4
    ? (count === 3 && width >= 3 * 280 + spacing * 2 ? 3 : 2)
    : count <= 6 ? 3 : Math.min(5, Math.ceil(Math.sqrt(count)));
  const columns = [Math.min(preferred, capacity)];
  let best;
  for (const cols of columns) {
    const rows = Math.ceil(count / cols);
    const cellWidth = Math.max(1, (width - spacing * (cols - 1)) / cols);
    const cellHeight = Math.max(1, (height - spacing * (rows - 1)) / rows);
    const fittedWidth = Math.min(cellWidth, cellHeight * ratio, count === 1 ? 720 : 520);
    // Crowded/short stages scroll within the media area, never over the toolbar.
    const tileWidth = Math.max(1, Math.floor(Math.max(Math.min(220, cellWidth), fittedWidth)));
    const tileHeight = tileWidth / ratio;
    const score = tileWidth * tileHeight * count;
    if (!best || score > best.score) best = { columns: cols, rows, tileWidth, tileHeight,
      layoutWidth: tileWidth * cols + spacing * (cols - 1), layoutHeight: tileHeight * rows + spacing * (rows - 1),
      layoutVariant: 'group-equal-tiles', score };
  }
  return best;
}

export function computeGroupDmPrimaryLayout({ containerWidth = 0, containerHeight = 0, hasRail = true } = {}) {
  const ratio = 16 / 9, padding = 12, gap = 12;
  const width = Math.max(1, containerWidth - padding * 2);
  const height = Math.max(1, containerHeight - padding * 2);
  const below = hasRail && containerWidth <= 820;
  const railWidth = hasRail && !below ? Math.min(224, Math.max(180, width * .2)) : 0;
  const railHeight = below ? Math.min(112, height * .26) : 0;
  const primaryWidth = Math.max(1, Math.min(1040, width - railWidth - (railWidth ? gap : 0),
    (height - railHeight - (below ? gap : 0)) * ratio));
  const primaryHeight = primaryWidth / ratio;
  return { primaryWidth, primaryHeight, railWidth, railHeight,
    layoutWidth: primaryWidth + railWidth + (railWidth ? gap : 0),
    layoutHeight: primaryHeight + railHeight + (below ? gap : 0),
    railPlacement: hasRail ? (below ? 'below' : 'right') : 'none', gap };
}

// Shared by the main stage and its existing Pop Out mirror. Only writes layout
// properties; never reads room state or changes focus/watch selection.
export function syncGroupDmStageGeometry(stage) {
  if (stage?.getAttribute('data-call-stage-kind') !== 'group') return false;
  const viewport = stage.querySelector('.callStageViewport');
  const rect = viewport?.getBoundingClientRect();
  if (!(rect?.width > 0 && rect?.height > 0)) return false;
  const rail = stage.querySelector('#callShareRail');
  const layout = computeGroupDmPrimaryLayout({ containerWidth: rect.width, containerHeight: rect.height,
    hasRail: Array.from(rail?.children || []).some(child => !child.hidden && child.style?.display !== 'none') });
  for (const [key, value] of Object.entries({
    '--group-primary-width': layout.primaryWidth, '--group-primary-height': layout.primaryHeight,
    '--group-composition-width': layout.layoutWidth, '--group-composition-height': layout.layoutHeight,
    '--group-rail-width': layout.railWidth, '--group-rail-height': layout.railHeight,
  })) {
    const next = `${value}px`;
    if (viewport.style.getPropertyValue(key) !== next) viewport.style.setProperty(key, next);
  }
  if (stage.getAttribute('data-group-rail-placement') !== layout.railPlacement)
    stage.setAttribute('data-group-rail-placement', layout.railPlacement);
  const toolbarOffset = `${layout.railPlacement === 'right' ? -(layout.railWidth + layout.gap) / 2 : 0}px`;
  if (stage.style?.getPropertyValue('--group-toolbar-offset') !== toolbarOffset)
    stage.style?.setProperty('--group-toolbar-offset', toolbarOffset);
  return true;
}
