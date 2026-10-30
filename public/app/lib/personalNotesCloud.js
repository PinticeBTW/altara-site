const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = 'user_id,text,revision';
let subscriptionSequence = 0;
const own = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
export class PersonalNotesCloudError extends Error {
  constructor(code) { super('Could not confirm your personal notes.'); this.name = 'PersonalNotesCloudError'; this.code = code; }
}
export function validPersonalNotesCloudText(text) {
  if (typeof text !== 'string' || text.length > 4000 || text.includes('\0')) return false;
  for (let index = 0; index < text.length; index++) {
    const value = text.charCodeAt(index);
    if (value >= 0xd800 && value <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (value >= 0xdc00 && value <= 0xdfff) return false;
  }
  return true;
}
export function personalNotesCloudBase(value, ownerId) {
  try {
    if (!record(value) || Reflect.ownKeys(value).length !== 3 || !['ownerId', 'text', 'revision'].every(key => Object.hasOwn(value, key))) return null;
    const id = own(value, 'ownerId'), text = own(value, 'text'), revision = own(value, 'revision');
    if (id !== ownerId || !validPersonalNotesCloudText(text) || !Number.isSafeInteger(revision) || revision < 0 || revision === 0 && text !== '') return null;
    return Object.freeze({ ownerId, text, revision });
  } catch { return null; }
}

/** The table is private to its owner. Realtime is an invalidation hint only;
 * every value shown to the user comes from a separately authorized SELECT. */
export function createPersonalNotesCloud({ client, ownerId: input, assertOwner, lifetime }) {
  if (typeof input !== 'string' || input.length !== 36 || !uuid.test(input) || typeof assertOwner !== 'function') throw new PersonalNotesCloudError('invalid');
  const ownerId = input.toLowerCase();
  function scope(signal, bounded = true) {
    const controller = new AbortController(), sources = [lifetime, signal].filter(Boolean);
    const abort = () => controller.abort();
    for (const source of sources) { if (source.aborted) abort(); else source.addEventListener('abort', abort, { once: true }); }
    const timer = bounded ? setTimeout(abort, 15000) : null;
    timer?.unref?.();
    return { signal: controller.signal, dispose() { if (timer !== null) clearTimeout(timer); controller.abort(); for (const source of sources) source.removeEventListener('abort', abort); } };
  }
  function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(new PersonalNotesCloudError('cancelled'));
    return new Promise((resolve, reject) => {
      const abort = () => reject(new PersonalNotesCloudError('cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  async function owned(signal) {
    if (signal.aborted || lifetime?.aborted) throw new PersonalNotesCloudError('cancelled');
    try { await abortable(assertOwner(), signal); } catch { throw new PersonalNotesCloudError('cancelled'); }
    if (signal.aborted || lifetime?.aborted) throw new PersonalNotesCloudError('cancelled');
  }
  function fromRow(row) {
    if (!record(row) || Reflect.ownKeys(row).length !== 3 || own(row, 'user_id') !== ownerId || own(row, 'revision') < 1) throw new PersonalNotesCloudError('invalid');
    const result = personalNotesCloudBase({ ownerId, text: own(row, 'text'), revision: own(row, 'revision') }, ownerId);
    if (!result) throw new PersonalNotesCloudError('invalid'); return result;
  }
  async function read(signal) {
    const request = scope(signal);
    try {
      await owned(request.signal);
      const result = await abortable(client.from('user_personal_notes').select(columns).eq('user_id', ownerId).abortSignal(request.signal).retry(false).maybeSingle(), request.signal);
      await owned(request.signal);
      if (result.error) throw new PersonalNotesCloudError('read');
      return result.data === null ? Object.freeze({ ownerId, text: '', revision: 0 }) : fromRow(result.data);
    } catch (cause) { throw request.signal.aborted ? new PersonalNotesCloudError('cancelled') : cause instanceof PersonalNotesCloudError ? cause : new PersonalNotesCloudError('read'); }
    finally { request.dispose(); }
  }
  async function write(original, text, signal) {
    const base = personalNotesCloudBase(original, ownerId);
    if (!base || base.revision === Number.MAX_SAFE_INTEGER || !validPersonalNotesCloudText(text)) throw new PersonalNotesCloudError('invalid');
    const request = scope(signal);
    try {
      await owned(request.signal);
      const table = client.from('user_personal_notes');
      const query = base.revision === 0 ? table.insert({ user_id: ownerId, text }) : table.update({ text }).eq('user_id', ownerId).eq('revision', base.revision);
      const result = await abortable(query.select(columns).abortSignal(request.signal).retry(false).maybeSingle(), request.signal);
      await owned(request.signal);
      if (result.error) throw new PersonalNotesCloudError(base.revision === 0 && own(result.error, 'code') === '23505' ? 'conflict' : 'write');
      if (result.data === null) throw new PersonalNotesCloudError('conflict');
      const saved = fromRow(result.data);
      if (saved.revision !== base.revision + 1 || saved.text !== text) throw new PersonalNotesCloudError('invalid');
      return saved;
    } catch (cause) { throw request.signal.aborted ? new PersonalNotesCloudError('cancelled') : cause instanceof PersonalNotesCloudError ? cause : new PersonalNotesCloudError('write'); }
    finally { request.dispose(); }
  }
  function subscribe(onHint, signal) {
    if (typeof onHint !== 'function') throw new PersonalNotesCloudError('invalid');
    const request = scope(signal, false); let active = true, channel = null;
    const current = () => active && !request.signal.aborted && !lifetime?.aborted;
    const hint = () => {
      if (!current()) return;
      void owned(request.signal).then(() => {
        if (current()) { try { void Promise.resolve(onHint()).catch(() => {}); } catch {} }
      }).catch(() => off());
    };
    const off = () => {
      if (!active) return;
      active = false; request.signal.removeEventListener('abort', off);
      const original = channel; channel = null; request.dispose();
      if (original) { try { void Promise.resolve(client.removeChannel(original)).catch(() => {}); } catch {} }
    };
    request.signal.addEventListener('abort', off, { once: true });
    void owned(request.signal).then(() => {
      if (!current()) return;
      // Removal is asynchronous in the SDK. A replacement must not reuse a
      // still-closing channel object owned by an earlier screen or account API.
      channel = client.channel(`personal-notes:${ownerId}:${++subscriptionSequence}`);
      for (const event of ['INSERT', 'UPDATE']) channel.on('postgres_changes', { event, schema: 'public', table: 'user_personal_notes', filter: `user_id=eq.${ownerId}` }, hint);
      channel.subscribe(status => { if (status === 'SUBSCRIBED') hint(); });
      if (!current()) off();
    }).catch(off);
    return off;
  }
  return { read, write, subscribe };
}
