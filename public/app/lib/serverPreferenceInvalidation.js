const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dataObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== "string")
    || Object.values(fields).some(field => !("value" in field))) return null;
  return fields;
};

/** Broadcast carries an invalidation only. The authenticated profile read,
 * never these flags, remains the source of the account preferences. */
export function parseServerPreferenceInvalidation(event) {
  try {
    const wrapper = dataObject(event), payload = wrapper?.payload?.value;
    const fields = dataObject(payload);
    if (!fields || Object.keys(fields).some(key => !["version", "categories", "rail", "id"].includes(key))
      || fields.version?.value !== 1
      || typeof fields.categories?.value !== "boolean" || typeof fields.rail?.value !== "boolean") return null;
    // Some realtime.send versions add the message UUID inside the payload.
    // Accept that transport metadata, but expose only the invalidation flags.
    if (fields.id && (typeof fields.id.value !== "string" || !UUID.test(fields.id.value))) return null;
    const categories = fields.categories.value, rail = fields.rail.value;
    if (!categories && !rail) return null;
    return Object.freeze({ categories, rail });
  } catch { return null; }
}

/** Keep the first event's deadline and serialize reads, retaining a union of
 * hints received while a previous authoritative read was still in flight. */
export function createServerPreferenceInvalidationQueue({ onInvalidate, isCurrent = () => true, delay = 40 }) {
  let disposed = false, busy = false, timer, categories = false, rail = false;
  const wait = Math.max(0, Math.min(1000, Number(delay) || 0));
  const current = () => {
    if (disposed) return false;
    try { return isCurrent() === true; } catch { return false; }
  };
  const clear = () => { categories = false; rail = false; clearTimeout(timer); timer = undefined; };
  function schedule() {
    if (timer !== undefined || busy || (!categories && !rail)) return;
    if (!current()) { clear(); return; }
    timer = setTimeout(() => { timer = undefined; void flush(); }, wait);
  }
  async function flush() {
    if (!current()) { clear(); return; }
    if (busy || (!categories && !rail)) return;
    const fields = Object.freeze({ categories, rail }); categories = false; rail = false; busy = true;
    try { await onInvalidate(fields); }
    catch { /* The existing foreground reconciliation remains the fallback. */ }
    finally { busy = false; if (!current()) clear(); else schedule(); }
  }
  return {
    push(fields) {
      if (!current()) { clear(); return; }
      // Callers normally pass a parsed event or the explicit reconnect flags.
      // Copy booleans now so later mutation cannot widen a queued invalidation.
      try {
        const values = dataObject(fields);
        if (!values || typeof values.categories?.value !== "boolean" || typeof values.rail?.value !== "boolean") return;
        categories ||= values.categories.value; rail ||= values.rail.value; schedule();
      } catch { /* An invalid hint never schedules account work. */ }
    },
    dispose() { disposed = true; clear(); },
  };
}
