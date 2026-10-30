import { createPersonalNotesSync } from './personalNotesSync.js';
import { createPersonalNotesCloud } from './personalNotesCloud.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => new Error('personal_notes_local_unavailable');
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (prototype !== Object.prototype && prototype !== null || Reflect.ownKeys(value).length !== names.length
    || names.some(name => !Object.hasOwn(descriptors, name) || !Object.hasOwn(descriptors[name], 'value'))) throw invalid();
  return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
function recovery(value, ownerId) {
  const row = fields(value, ['version', 'ownerId', 'base', 'text']), base = fields(row.base, ['ownerId', 'text', 'revision']);
  if (row.version !== 1 || row.ownerId !== ownerId || base.ownerId !== ownerId || typeof row.text !== 'string' || row.text.length > 4000
    || typeof base.text !== 'string' || base.text.length > 4000 || !Number.isSafeInteger(base.revision) || base.revision < 0 || base.revision === 0 && base.text !== '') throw invalid();
  return { version: 1, ownerId, base: { ownerId, text: base.text, revision: base.revision }, text: row.text };
}

export function personalNotesDesktopCopy(locale) {
  const en = { inactive: 'Sign in to sync your notes.', loading: 'Loading synced notes…', ready: 'Synced across your devices', saving: 'Saving and syncing…',
    read: 'Could not load synced notes. Your local draft is kept.', write: 'Could not confirm syncing. Your draft is kept.', local: 'Could not save the local recovery copy. Your draft is kept.',
    conflict: 'Another version exists. Compare both notes before choosing.', remoteVersion: 'Synced version', empty: 'Empty note', remote: 'Use synced note', keep: 'Keep this note', retry: 'Retry syncing' };
  const pt = { inactive: 'Inicia sessão para sincronizar as notas.', loading: 'A carregar as notas sincronizadas…', ready: 'Sincronizado entre os teus dispositivos', saving: 'A guardar e sincronizar…',
    read: 'Não foi possível carregar as notas sincronizadas. O teu rascunho foi conservado.', write: 'Não foi possível confirmar a sincronização. O teu rascunho foi conservado.', local: 'Não foi possível guardar a cópia local de recuperação. O teu rascunho foi conservado.',
    conflict: 'Existe outra versão. Compara as duas notas antes de escolher.', remoteVersion: 'Versão sincronizada', empty: 'Nota vazia', remote: 'Usar nota sincronizada', keep: 'Manter esta nota', retry: 'Tentar sincronizar novamente' };
  if (locale === 'pt-BR') return { ...pt, inactive: 'Entre na conta para sincronizar as notas.', loading: 'Carregando notas sincronizadas…', ready: 'Sincronizado entre seus dispositivos', saving: 'Salvando e sincronizando…',
    read: 'Não foi possível carregar as notas sincronizadas. Seu rascunho foi mantido.', write: 'Não foi possível confirmar a sincronização. Seu rascunho foi mantido.', local: 'Não foi possível salvar a cópia local de recuperação. Seu rascunho foi mantido.',
    conflict: 'Existe outra versão. Compare as duas notas antes de escolher.', keep: 'Manter esta nota' };
  return String(locale || '').startsWith('pt') ? pt : en;
}

/** Personal notes only. The legacy local key is an immutable migration backup;
 * server-scoped widget storage never enters this adapter. */
export function createPersonalNotesDesktop({ client, getOwner, storage, document, enabled = () => true, getCopy = () => personalNotesDesktopCopy('en'), onChange = () => {},
  syncFactory = createPersonalNotesSync, cloudFactory = createPersonalNotesCloud }) {
  let entry = null, generation = 0, activating = null;
  const composing = new WeakSet(), bound = new WeakMap(), compositions = new WeakMap();
  const owner = () => {
    const value = getOwner();
    return typeof value === 'string' && value.length === 36 && uuid.test(value) ? value.toLowerCase() : '';
  };
  const current = original => entry === original && owner() === original.ownerId && !original.lifetime.signal.aborted;
  function snapshot() { return entry && current(entry) ? entry.core.snapshot() : null; }
  function paint() {
    if (!document || !enabled()) return;
    const original = entry, state = snapshot(), copy = getCopy();
    for (const input of document.querySelectorAll('[data-widget-notes-input][data-widget-notes-owner]')) {
      const ownsInput = !!original && current(original) && input.dataset.widgetNotesOwner === original.ownerId;
      const visible = ownsInput ? state : null;
      const editable = !!visible && visible.text !== null && !['inactive', 'loading'].includes(visible.status);
      if (!ownsInput) input.value = '';
      if (ownsInput && bound.get(input) !== original) {
        compositions.get(input)?.(); compositions.delete(input); composing.delete(input);
        bound.set(input, original);
        input.addEventListener('compositionstart', () => {
          if (bound.get(input) !== original || !current(original) || !enabled() || compositions.has(input)) return;
          composing.add(input); compositions.set(input, original.core.holdRemote());
        });
        const finishComposition = () => {
          if (bound.get(input) !== original) return;
          const release = compositions.get(input); compositions.delete(input);
          // compositionend may precede the final input event. Capture the
          // composed value before releasing a deferred remote reconciliation.
          if (release && current(original) && enabled()) original.core.edit(original.core.snapshot(), input.value.slice(0, 4000));
          release?.(); composing.delete(input); if (current(original)) paint();
        };
        input.addEventListener('compositionend', finishComposition);
        input.addEventListener('blur', finishComposition);
      }
      const clean = visible?.status === 'ready' && visible.text === visible.savedText;
      if (visible?.text !== null && typeof visible?.text === 'string' && input.value !== visible.text && !composing.has(input)
        && (document.activeElement !== input || clean || input.readOnly)) {
        const start = input.selectionStart, end = input.selectionEnd, direction = input.selectionDirection, scroll = input.scrollTop;
        input.value = visible.text;
        if (document.activeElement === input && Number.isInteger(start) && Number.isInteger(end)) {
          try { input.setSelectionRange(Math.min(start, input.value.length), Math.min(end, input.value.length), direction); } catch {}
        }
        input.scrollTop = scroll;
      }
      input.readOnly = !editable;
      const card = input.closest('[data-widget-id="notes"]');
      if (!card) continue;
      const status = card.querySelector('[data-widget-notes-sync]'), actions = card.querySelector('[data-widget-notes-sync-actions]'), count = card.querySelector('[data-widget-notes-count]');
      if (count) count.textContent = `${input.value.length}/4000`;
      if (status) status.textContent = copy[visible?.status === 'error' ? visible.error : visible?.status || 'inactive'] || copy.read;
      const remoteNote = card.querySelector('[data-widget-notes-remote]');
      if (remoteNote) {
        remoteNote.hidden = visible?.status !== 'conflict';
        remoteNote.textContent = visible?.status === 'conflict' ? `${copy.remoteVersion}\n${visible.remoteText || copy.empty}` : '';
      }
      const act = (name, selected = visible) => {
        if (!original || !selected || !current(original) || !enabled() || !input.isConnected || input.dataset.widgetNotesOwner !== original.ownerId || original.core.snapshot() !== selected) return;
        const method = name === 'remote' ? 'useRemote' : name === 'keep' ? 'keepLocal' : name;
        try { void Promise.resolve(original.core[method](selected)).catch(() => {}); } catch {}
      };
      const clear = card.querySelector('[data-widget-note-clear]');
      if (clear) { clear.disabled = !editable || !visible?.text; clear.onclick = () => act('clear'); }
      if (actions) {
        actions.replaceChildren();
        for (const name of visible?.status === 'conflict' ? ['remote', 'keep'] : visible?.status === 'error' ? ['retry'] : []) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost widgetCard__miniBtn';
          button.textContent = copy[name]; button.dataset.widgetNotesSyncAction = name; button.onclick = () => act(name); actions.append(button);
        }
      }
    }
  }
  function notify(original) {
    if (!current(original)) return;
    paint();
    try { onChange(original.core.snapshot()); } catch {}
  }
  function retire() {
    generation++; activating = null;
    const original = entry; entry = null;
    if (original) { original.lifetime.abort(); original.off(); original.core.deactivate(); }
    paint();
  }
  async function activate({ refresh = false } = {}) {
    const ownerId = owner();
    if (!ownerId) { retire(); return; }
    if (activating?.ownerId === ownerId) return activating.promise;
    const ticket = ++generation;
    const promise = (async () => {
      try {
        // Stay outside Auth callbacks. A cached state.user is not authority for
        // creating another account's local recovery journal or cloud requests.
        const session = await client.auth.getSession();
        if (ticket !== generation || owner() !== ownerId) return;
        if (session.error || session.data?.session?.user.id?.toLowerCase() !== ownerId) { retire(); return; }
        if (entry && current(entry)) {
          if (!refresh) return;
          // The composition release performs its own fresh owned read. A focus
          // notification must not replace its base while the IME is active.
          if (document && [...document.querySelectorAll('[data-widget-notes-input][data-widget-notes-owner]')]
            .some(input => bound.get(input) === entry && composing.has(input))) return;
          entry.core.deactivate(); await entry.core.activate(); return;
        }
        const previous = entry;
        if (previous) { entry = null; previous.lifetime.abort(); previous.off(); previous.core.deactivate(); }
        const lifetime = new AbortController(), key = `altara.personalNotesSync.v1.${ownerId}`;
        const original = { ownerId, lifetime, core: null, off: () => {} };
        const assertOwner = async () => {
          if (!current(original)) throw invalid();
          const latest = await client.auth.getSession();
          if (!current(original) || latest.error || latest.data?.session?.user.id?.toLowerCase() !== ownerId) throw invalid();
        };
        const remote = cloudFactory({ client, ownerId, assertOwner, lifetime: lifetime.signal });
        const local = {
          async read() {
            if (!current(original)) throw invalid();
            const raw = await storage.getItem(key);
            if (raw === null) return null;
            if (typeof raw !== 'string' || raw.length > 50000) throw invalid();
            try { return recovery(JSON.parse(raw), ownerId); } catch { throw invalid(); }
          },
          async write(value) {
            if (!current(original)) throw invalid();
            // Capture the original account key. A native acknowledgement can
            // finish after retirement, but can never be redirected to a new one.
            const raw = JSON.stringify(recovery(value, ownerId));
            await storage.setItem(key, raw);
          },
        };
        const legacy = { async read() {
          if (!current(original)) throw invalid();
          const raw = await storage.getItem(`altara_widgets_notes_${ownerId}`);
          if (raw === null) return null;
          if (typeof raw !== 'string') throw invalid();
          return raw.slice(0, 4000);
        } };
        original.core = syncFactory({ ownerId, remote, local, legacy }); entry = original;
        original.off = original.core.subscribe(() => notify(original));
        await original.core.activate();
      } catch { if (ticket === generation) retire(); }
    })();
    activating = { ownerId, promise };
    try { await promise; } finally { if (activating?.promise === promise) activating = null; }
  }
  return {
    activate, deactivate: retire, snapshot, paint,
    edit(text, expectedOwner) {
      const original = entry;
      if (typeof text !== 'string' || !original || !current(original) || expectedOwner !== original.ownerId || !enabled()) return snapshot()?.text ?? null;
      original.core.edit(original.core.snapshot(), text.slice(0, 4000));
      return original.core.snapshot().text;
    },
    flush: () => entry && current(entry) ? entry.core.flush() : Promise.resolve(false),
  };
}
