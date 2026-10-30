const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuid = new RegExp(`^${UUID}$`, 'i');
const custom = new RegExp(`^<:([a-zA-Z0-9_]{2,32}):(${UUID})>$`, 'i');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// A reaction identifies the resource, not its mutable display name.
export function normalizeServerReactionEmoji(value) {
  if (typeof value !== 'string') return null;
  const emoji = value.trim(), match = custom.exec(emoji);
  if (match) return `<:emoji:${match[2].toLowerCase()}>`;
  if (/^<(?:[:]|sticker)/i.test(emoji) || !emoji || [...emoji].length > 16) return null;
  return emoji;
}

export function isServerCustomReaction(value) {
  return typeof value === 'string' && custom.test(value.trim());
}

// Rows must come from the current, authorized serverExpressionView.list().
// This presentation helper carries no URL or permission capability.
export function serverReactionPickerRows(rows, query = '') {
  const search = typeof query === 'string' ? query.trim().toLowerCase().slice(0, 100) : '';
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (row?.kind !== 'emoji' || typeof row.name !== 'string' || !/^[a-zA-Z0-9_]{2,32}$/.test(row.name)
        || typeof row.id !== 'string' || !uuid.test(row.id) || seen.has(row.id.toLowerCase())
        || (search && !row.name.toLowerCase().includes(search))) return false;
    seen.add(row.id.toLowerCase()); return true;
  }).slice(0, 100).map(row => ({id:row.id.toLowerCase(), name:row.name, kind:'emoji',
    emoji:`<:emoji:${row.id.toLowerCase()}>`}));
}

export function renderServerReactionEmoji(value) {
  const emoji = normalizeServerReactionEmoji(value);
  if (!emoji || !isServerCustomReaction(emoji)) return esc(value);
  const match = custom.exec(emoji);
  // Only the existing, scoped expression view may add a broker-authorized image.
  return `<span class="serverExpression serverExpression--emoji" data-server-expression="${match[2]}" data-expression-kind="emoji"><span>Emoji do servidor</span></span>`;
}
