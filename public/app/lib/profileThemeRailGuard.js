const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const presenceStatuses = new Set(['online', 'idle', 'dnd', 'focus', 'invisible', 'offline']);
const denied = () => new Error('Não foi possível confirmar a conta e a ordem dos servidores. Tenta novamente.');

// Existing profile editors may hold an older theme snapshot. Preserve the fresh
// private server preferences and notification/manual status without putting the much larger
// appearance document into every editor's request URL. Only the explicit legacy
// status writer may opt in to changing presence_status; the DND switch has its
// own opt-in rather than reusing a possibly stale appearance snapshot. The
// animation preference has a separate opt-in for its explicit performance switch.
export async function saveProfileThemePreservingServerRail({ client, ownerId, patch, assertOwner, signal = undefined, allowPresenceStatusChange = false, allowDndNotificationMuteChange = false, allowReduceMotionChange = false }) {
  let theme, timeout;
  const controller = new AbortController(), cancel = () => controller.abort();
  try {
    if (!uuid.test(ownerId) || !object(patch) || !object(patch.theme_settings) || typeof assertOwner !== 'function'
      || Object.keys(patch).some(key => !['theme_settings', 'avatar_url', 'banner_url'].includes(key))) throw denied();
    const intended = JSON.parse(JSON.stringify(patch));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(cancel, 15000);
    const owned = async () => { if (controller.signal.aborted) throw denied(); await assertOwner(); if (controller.signal.aborted) throw denied(); };
    for (let attempt = 0; attempt < 2; ++attempt) {
      await owned();
      let read = client.from('profiles').select('id,server_rail:theme_settings->server_rail,server_categories:theme_settings->server_categories,presence_status:theme_settings->presence_status,dnd_mute_notifications:theme_settings->dnd_mute_notifications,reduce_motion:theme_settings->reduce_motion').eq('id', ownerId);
      read = read.abortSignal(controller.signal);
      const current = await read.maybeSingle(); await owned();
      if (current.error) return { error: current.error, theme };
      if (!object(current.data) || current.data.id !== ownerId || !Object.hasOwn(current.data, 'server_rail')
        || !Object.hasOwn(current.data, 'server_categories') || !Object.hasOwn(current.data, 'presence_status')
        || !Object.hasOwn(current.data, 'dnd_mute_notifications') || !Object.hasOwn(current.data, 'reduce_motion')) throw denied();
      const rail = current.data.server_rail, categories = current.data.server_categories, presenceStatus = current.data.presence_status, dndNotificationMute = current.data.dnd_mute_notifications, reduceMotion = current.data.reduce_motion;
      if (rail !== null && !object(rail) || categories !== null && !object(categories)
        || presenceStatus !== null && (typeof presenceStatus !== 'string'
          || !presenceStatuses.has(presenceStatus.trim().toLowerCase()))) throw denied();
      theme = { ...intended.theme_settings };
      if (rail === null) delete theme.server_rail;
      else theme.server_rail = rail;
      if (categories === null) delete theme.server_categories;
      else theme.server_categories = categories;
      if (allowPresenceStatusChange !== true) {
        if (presenceStatus === null) delete theme.presence_status;
        else theme.presence_status = presenceStatus;
      }
      if (allowDndNotificationMuteChange !== true) {
        if (dndNotificationMute === null) delete theme.dnd_mute_notifications;
        else theme.dnd_mute_notifications = dndNotificationMute;
      }
      if (allowReduceMotionChange !== true) {
        if (reduceMotion === null) delete theme.reduce_motion;
        else theme.reduce_motion = reduceMotion;
      }
      let update = client.from('profiles').update({ ...intended, theme_settings: theme }).eq('id', ownerId);
      const absent = [], exact = {};
      if (rail === null) absent.push('theme_settings->server_rail');
      else if (typeof rail.revision === 'string' && uuid.test(rail.revision)) update = update.eq('theme_settings->server_rail->>revision', rail.revision);
      else {
        // Legacy v1 documents have no revision. Never silently overwrite a
        // changed rail or fall back to an unconditional update for large data.
        const previous = JSON.stringify(rail);
        exact.rail = previous;
        update = update.eq('theme_settings->server_rail', previous);
      }
      if (categories === null) absent.push('theme_settings->server_categories');
      else {
        exact.categories = JSON.stringify(categories);
        update = update.eq('theme_settings->server_categories', exact.categories);
      }
      if (presenceStatus === null) absent.push('theme_settings->presence_status');
      else {
        exact.presence_status = presenceStatus;
        update = update.eq('theme_settings->>presence_status', presenceStatus);
      }
      if (dndNotificationMute === null) absent.push('theme_settings->dnd_mute_notifications');
      else {
        // Guard the raw JSON type too: false and the legacy string "false"
        // must not be treated as the same concurrent account value.
        exact.dnd_mute_notifications = JSON.stringify(dndNotificationMute);
        update = update.eq('theme_settings->dnd_mute_notifications', exact.dnd_mute_notifications);
      }
      if (reduceMotion === null) absent.push('theme_settings->reduce_motion');
      else {
        exact.reduce_motion = JSON.stringify(reduceMotion);
        update = update.eq('theme_settings->reduce_motion', exact.reduce_motion);
      }
      if (new URLSearchParams(exact).toString().length > 6000) throw denied();
      // Missing JSON keys and explicit JSON null are both absent. Keep their
      // alternatives in one AND group instead of appending duplicate or keys.
      if (absent.length === 1) update = update.or(`${absent[0]}.is.null,${absent[0]}.eq.null`);
      else if (absent.length > 1) update = update.or(`and(${absent.map((field) => `or(${field}.is.null,${field}.eq.null)`).join(',')})`);
      update = update.abortSignal(controller.signal);
      await owned();
      const saved = await update.select('id').maybeSingle(); await owned();
      // Only an explicit zero-row conflict may be retried. A lost response may
      // already have committed the editor's change and must never be replayed.
      if (saved.error) return { error: saved.error, theme };
      if (saved.data) {
        if (!object(saved.data) || saved.data.id !== ownerId) throw denied();
        return { error: null, theme };
      }
    }
    throw new Error('A ordem dos servidores mudou entretanto. Tenta guardar novamente.');
  } catch (error) { return { error, theme }; }
  finally { clearTimeout(timeout); controller.abort(); signal?.removeEventListener('abort', cancel); }
}
