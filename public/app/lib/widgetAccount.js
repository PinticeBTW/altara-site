import { validateHostedWidget } from './widgetHosted.js';

// Public installs are account records; localhost and old inline widgets stay local.
export function createWidgetAccount({ client, userId, library, onChange = () => {} }) {
  let disposed = false, channel, bus, timer, pending = false, running = false, generation = 0;
  let snapshot = JSON.stringify(library.read().installs);
  const fields = 'id,name,description,version,kind,sdkVersion,manifest_url,entry_url,permissions,source_id,active,disabled,icon_url,snapshot_sha256';
  function emit(id) {
    const next = JSON.stringify(library.read().installs);
    if (next !== snapshot || id) { snapshot = next; onChange(id); }
  }
  async function refresh() {
    if (disposed) return;
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending && !disposed) {
        pending = false;
        const ticket = generation;
        let { data, error } = await client.from('home_widget_installs').select(fields).eq('user_id', userId);
        // Keep account sync available while the optional icon column is deployed.
        if (error && ['42703', 'PGRST204'].includes(error.code) && /icon_url/.test(error.message || '')) {
          ({ data, error } = await client.from('home_widget_installs').select(fields.replace(',icon_url', '')).eq('user_id', userId));
        }
        if (disposed) return;
        if (ticket !== generation) { pending = true; continue; }
        if (error) throw error;
        const cached = library.read().installs;
        const rows = await Promise.all((data || []).map(async row => {
          let html;
          if (row.active && row.snapshot_sha256) {
            const previous = cached.find(item => item.accountId === row.id && item.package.snapshot_sha256 === row.snapshot_sha256);
            html = previous?.package.snapshot_html;
            if (!html) {
              const result = await client.from('home_widget_installs').select('snapshot_html,snapshot_sha256').eq('id', row.id).eq('user_id', userId).single();
              if (result.error) throw result.error;
              // An update may arrive between the metadata and code reads.
              if (result.data?.snapshot_sha256 !== row.snapshot_sha256) { pending = true; throw Error('Widget changed while loading.'); }
              html = result.data.snapshot_html;
            }
          }
          return { ...row, package: validateHostedWidget({ ...row, snapshot_html: html, snapshot_sha256: row.active ? row.snapshot_sha256 : undefined }) };
        }));
        if (disposed) return;
        if (ticket !== generation) { pending = true; continue; }
        library.reconcileAccount(rows);
        // Another tab may already have written shared localStorage. Compare to
        // this controller's last notification, not to the shared storage value.
        emit();
        // Migrate public links already installed on this device, retaining their state.
        for (const item of library.read().installs) {
          if (item.accountId || disposed || (item.package.snapshot_html && !item.sourceId)) continue;
          let pkg; try { pkg = validateHostedWidget(item.package); } catch { continue; }
          await add(pkg, item.sourceId);
        }
      }
    } catch { /* Keep the last good cache; reconnect/focus retries the authoritative read. */ }
    finally { running = false; }
  }
  async function add(pkg, sourceId = null) {
    if (disposed) throw Error('Sign in again to add this widget.');
    const safe = validateHostedWidget(pkg);
    generation++;
    const { data, error } = await client.rpc('install_home_widget', { p_package: safe, p_source_id: sourceId || null });
    if (disposed) throw Error('Your account changed. Open your widgets again.');
    if (error) throw Error('Could not save the widget to your account. Check your connection and try again.');
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) throw Error('Could not save the widget to your account.');
    generation++;
    const item = library.applyAccount({ ...row, package: validateHostedWidget(row) });
    emit(item?.id); bus?.postMessage('changed'); void refresh(); return item;
  }
  async function remove(item) {
    generation++;
    const { error } = await client.from('home_widget_installs').update({ active: false }).eq('id', item.accountId).eq('user_id', userId);
    if (disposed) return;
    if (error) throw Error('Could not remove the widget from your account. Try again.');
    generation++; library.remove(item.id); emit(); bus?.postMessage('changed'); void refresh();
  }
  function wake() { generation++; void refresh(); }
  function storageChanged(event) { if (event.key === `altara:widget-library:v1:${userId}`) { emit(); wake(); } }
  function start() {
    channel = client.channel(`home-widget-installs:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'home_widget_installs', filter: `user_id=eq.${userId}` }, wake).subscribe(status => { if (status === 'SUBSCRIBED') wake(); });
    globalThis.addEventListener?.('focus', wake); globalThis.addEventListener?.('online', wake);
    globalThis.addEventListener?.('storage', storageChanged);
    if (typeof window !== 'undefined' && typeof BroadcastChannel === 'function') { bus = new BroadcastChannel(`altara-widget-account:${userId}`); bus.onmessage = wake; }
    // Reconcile missed events after a dropped websocket without needing reload.
    timer = setInterval(wake, 10000); timer.unref?.();
    wake();
  }
  function dispose() {
    disposed = true; generation++;
    if (channel) client.removeChannel(channel);
    clearInterval(timer); bus?.close();
    globalThis.removeEventListener?.('focus', wake); globalThis.removeEventListener?.('online', wake);
    globalThis.removeEventListener?.('storage', storageChanged);
  }
  return { start, refresh, add, remove, dispose };
}
