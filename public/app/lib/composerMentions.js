import { botMentionTokenPositions } from './botEmbeds.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /<@!?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})>/gi;
const PROBE = '<@00000000-0000-4000-8000-000000000001>';
let menuSequence = 0;

// Test the real Markdown/code grammar using the existing mention scanner.
export function getComposerMentionQuery(text, start, end = start) {
  const value = String(text ?? '');
  if (!Number.isInteger(start) || start < 0 || start !== end || start > value.length) return null;
  const match = /(^|[\s([{\u201c\u2018'"'])@([\p{L}\p{N}_.-]{0,64})$/u.exec(value.slice(0, start));
  if (!match) return null;
  const tokenStart = start - match[2].length - 1;
  const probe = value.slice(0, tokenStart) + PROBE + value.slice(start);
  if (!botMentionTokenPositions(probe).has(tokenStart)) return null;
  return { query: match[2], start: tokenStart, end: start };
}

export function reconcileComposerMentionRanges(previous, next, ranges = []) {
  previous = String(previous ?? ''); next = String(next ?? '');
  let prefix = 0, suffix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  while (suffix < previous.length - prefix && suffix < next.length - prefix
    && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const removedEnd = previous.length - suffix, delta = next.length - previous.length;
  return ranges.flatMap(range => {
    let start = range.start, end = range.end;
    if (previous !== next) {
      if (removedEnd <= start) { start += delta; end += delta; }
      else if (prefix < end) return [];
    }
    return next.slice(start, end) === range.label ? [{ ...range, start, end }] : [];
  });
}

function replaceSpans(value, replacements) {
  let text = '', cursor = 0;
  const mappings = [];
  for (const replacement of replacements.slice().sort((a, b) => a.start - b.start)) {
    if (replacement.start < cursor || replacement.end > value.length) continue;
    text += value.slice(cursor, replacement.start);
    const targetStart = text.length;
    text += replacement.text;
    mappings.push({ ...replacement, targetStart, targetEnd: text.length });
    cursor = replacement.end;
  }
  text += value.slice(cursor);
  const mapOffset = (offset, endBoundary) => {
    let delta = 0;
    for (const span of mappings) {
      if (offset <= span.start) return offset + delta;
      if (offset < span.end) return endBoundary ? span.targetEnd : span.targetStart;
      delta += span.text.length - (span.end - span.start);
    }
    return offset + delta;
  };
  const remapRanges = ranges => (Array.isArray(ranges) ? ranges : []).map(range => ({
    ...range, start: mapOffset(range.start, false), end: mapOffset(range.end, true),
  })).filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
  return { text, mappings, remapRanges, mapOffset };
}

export function prepareComposerMentionText(text, ranges = []) {
  const value = String(text ?? '');
  const candidates = ranges.filter(range => UUID.test(range.id || '') && value.slice(range.start, range.end) === range.label)
    .map(range => ({ ...range, text: `<@${range.id.toLowerCase()}>` }));
  // Wrapping an already selected name in code/links must make it inert too.
  const all = replaceSpans(value, candidates), allowed = botMentionTokenPositions(all.text);
  const replacements = all.mappings.filter(range => allowed.has(range.targetStart));
  const prepared = replaceSpans(value, replacements);
  const positions = botMentionTokenPositions(prepared.text);
  const mentionUserIds = [...new Set([...prepared.text.matchAll(TOKEN)]
    .filter(match => positions.has(match.index)).map(match => match[1].toLowerCase()))];
  return { text: prepared.text, mentionUserIds, remapRanges: prepared.remapRanges };
}

function normalizeMembers(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const id = String(row?.id || row?.userId || row?.user_id || row?.botId || '').trim().toLowerCase();
    const label = String(row?.label || row?.displayName || row?.display_name || row?.name || row?.username || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!UUID.test(id) || !label || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label, username: String(row?.username || '').trim().slice(0, 100),
      avatarUrl: String(row?.avatarUrl || row?.avatar_url || ''), isBot: row?.isBot === true || row?.type === 'bot' }];
  });
}

const searchKey = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function createComposerMentionController({ getContext, loadMembers, onDraftChange = () => {},
  getIdentityKey = (_input, context) => context?.identityKey || context?.key || '',
} = {}) {
  if (typeof getContext !== 'function' || typeof loadMembers !== 'function') throw new TypeError('Mention context and member loader are required.');
  if (typeof getIdentityKey !== 'function') throw new TypeError('Mention draft identity hook must be a function.');
  const states = new WeakMap(), bound = new WeakSet();
  let menu = null, active = null, sequence = 0, composing = null;
  const menuId = `composerMentionMenu-${++menuSequence}`;
  const contextFor = input => {
    if (!input || input.disabled || input.readOnly || !input.isConnected) return null;
    const context = getContext(input);
    return context?.key ? context : null;
  };
  const stateFor = (input, context = contextFor(input)) => {
    const value = String(input?.value || '');
    const identityKey = getIdentityKey(input, context) || '';
    let state = states.get(input);
    // Roster authority revisions invalidate requests, but not a selected draft
    // owned by the same account, conversation and navigation/session.
    if (!state || state.key !== identityKey) state = { key: identityKey, value, ranges: [] };
    else if (state.value !== value) {
      state.ranges = reconcileComposerMentionRanges(state.value, value, state.ranges);
      state.value = value;
    }
    states.set(input, state); return state;
  };
  const ensureMenu = input => {
    if (menu) return menu;
    const document = input.ownerDocument;
    menu = document.createElement('div'); menu.id = menuId; menu.className = 'composerMentionMenu';
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', 'Mencionar membro');
    menu.hidden = true; document.body.append(menu);
    menu.addEventListener('pointerdown', event => event.preventDefault());
    menu.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-composer-mention-index]');
      if (button && menu.contains(button)) select(Number(button.dataset.composerMentionIndex));
    });
    document.addEventListener('pointerdown', event => {
      if (active && event.target !== active.input && !menu.contains(event.target)) close();
    });
    const reposition = () => { if (active) position(); };
    document.defaultView?.addEventListener('resize', reposition);
    document.defaultView?.addEventListener('scroll', reposition, true);
    return menu;
  };
  function close() {
    sequence++;
    if (active) {
      active.input.setAttribute('aria-expanded', 'false');
      active.input.removeAttribute('aria-activedescendant');
      active.input.removeAttribute('aria-controls');
      active.input.removeAttribute('aria-autocomplete');
    }
    active = null;
    if (menu) { menu.hidden = true; menu.replaceChildren(); }
  }
  function position() {
    if (!active || !menu) return;
    if (!contextFor(active.input) || contextFor(active.input).key !== active.key) { close(); return; }
    const rect = (active.input.closest('.dmInputWrap') || active.input).getBoundingClientRect();
    const window = active.input.ownerDocument.defaultView;
    const width = Math.max(0, Math.min(440, rect.width, window.innerWidth - 16));
    menu.style.width = `${width}px`;
    const height = menu.getBoundingClientRect().height;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, rect.top - height - 8)}px`;
    menu.style.maxHeight = `${Math.max(80, rect.top - 16)}px`;
  }
  function render() {
    if (!active) return;
    const input = active.input, document = input.ownerDocument, panel = ensureMenu(input);
    panel.replaceChildren();
    const title = document.createElement('div'); title.className = 'composerMentionMenu__title'; title.textContent = 'Membros'; panel.append(title);
    const list = document.createElement('div'); list.className = 'composerMentionMenu__list'; panel.append(list);
    active.items.forEach((item, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'composerMentionMenu__item';
      button.id = `${menuId}-option-${index}`; button.dataset.composerMentionIndex = String(index);
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(index === active.selected));
      button.classList.toggle('is-active', index === active.selected); button.tabIndex = -1;
      const avatar = document.createElement('span'); avatar.className = 'composerMentionMenu__avatar'; avatar.textContent = item.label[0];
      try {
        const url = new URL(item.avatarUrl, document.baseURI);
        if (item.avatarUrl && ['https:', 'http:'].includes(url.protocol)) {
          const image = document.createElement('img'); image.src = url.href; image.alt = ''; image.referrerPolicy = 'no-referrer'; avatar.replaceChildren(image);
        }
      } catch (_) { /* Invalid avatars keep the text fallback. */ }
      const body = document.createElement('span'); body.className = 'composerMentionMenu__body';
      const name = document.createElement('span'); name.className = 'composerMentionMenu__name'; name.textContent = item.label;
      const meta = document.createElement('span'); meta.className = 'composerMentionMenu__meta'; meta.textContent = item.isBot ? 'BOT' : (item.username ? `@${item.username}` : 'Membro');
      body.append(name, meta); button.append(avatar, body); list.append(button);
    });
    panel.hidden = false;
    input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', menuId);
    input.setAttribute('aria-activedescendant', `${menuId}-option-${active.selected}`);
    position();
  }
  function notify(input, mapping, reason) {
    onDraftChange(input, { remapRanges: mapping.remapRanges, reason });
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  }
  function select(index) {
    if (!active || !Number.isInteger(index)) return false;
    const snapshot = active, input = snapshot.input, context = contextFor(input), item = snapshot.items[index];
    if (!item || input.ownerDocument.activeElement !== input || context?.key !== snapshot.key || String(input.value) !== snapshot.value
      || input.selectionStart !== snapshot.caret || input.selectionEnd !== snapshot.caret || composing === input) { close(); return false; }
    const query = getComposerMentionQuery(input.value, input.selectionStart, input.selectionEnd);
    if (!query || query.start !== snapshot.query.start || query.end !== snapshot.query.end) { close(); return false; }
    const state = stateFor(input, context), label = `@${item.label}`;
    const inserted = label + (/\s/.test(input.value.charAt(query.end)) ? '' : ' ');
    const mapping = replaceSpans(input.value, [{ start: query.start, end: query.end, text: inserted }]);
    const ranges = reconcileComposerMentionRanges(state.value, mapping.text, state.ranges);
    input.value = mapping.text; input.setSelectionRange(query.start + inserted.length, query.start + inserted.length);
    state.value = mapping.text; state.ranges = [...ranges, { id: item.id, label, start: query.start, end: query.start + label.length }].sort((a, b) => a.start - b.start);
    states.set(input, state); close(); notify(input, mapping, 'selection'); input.focus({ preventScroll: true }); return true;
  }
  async function refresh(input, { retryAuthorityChange = true } = {}) {
    const context = contextFor(input);
    if (!context || composing === input) { close(); if (input) stateFor(input, context); return false; }
    const state = stateFor(input, context), value = String(input.value), start = input.selectionStart, end = input.selectionEnd;
    const query = getComposerMentionQuery(value, start, end), positions = botMentionTokenPositions(value);
    const canonical = [...value.matchAll(TOKEN)].filter(match => positions.has(match.index));
    if (!query && !canonical.length) { close(); return false; }
    close(); const request = sequence;
    let members;
    try { members = normalizeMembers(await loadMembers(context)); } catch (_) { return false; }
    if (request !== sequence || !input.isConnected || composing === input
      || String(input.value) !== value || input.selectionStart !== start || input.selectionEnd !== end) return false;
    const currentContext = contextFor(input);
    if (currentContext?.key !== context.key) {
      // The first roster load may advance its authority revision. Fetch again
      // once under that revision; never display the previous request's rows.
      if (retryAuthorityChange && currentContext && input.ownerDocument?.activeElement === input) {
        return refresh(input, { retryAuthorityChange: false });
      }
      return false;
    }
    if (canonical.length) {
      const byId = new Map(members.map(member => [member.id, member]));
      const hydration = replaceSpans(value, canonical.flatMap(match => {
        const member = byId.get(match[1].toLowerCase());
        return member ? [{ id: member.id, start: match.index, end: match.index + match[0].length, text: `@${member.label}` }] : [];
      }));
      if (hydration.text !== value) {
        state.ranges = [...hydration.remapRanges(state.ranges), ...hydration.mappings.map(span => ({
          id: span.id, label: span.text, start: span.targetStart, end: span.targetEnd,
        }))].sort((a, b) => a.start - b.start);
        state.value = hydration.text; input.value = hydration.text;
        const targetStart = hydration.mapOffset(start, start === end);
        input.setSelectionRange(targetStart, start === end ? targetStart : hydration.mapOffset(end, true));
        states.set(input, state); notify(input, hydration, 'hydrate'); return false;
      }
    }
    if (!query || input.ownerDocument?.activeElement !== input) return false;
    const needle = searchKey(query.query), items = members.map(member => ({ ...member,
      score: Math.max(...[member.label, member.username].map(name => {
        const key = searchKey(name); return !needle ? 1 : key === needle ? 4 : key.startsWith(needle) ? 3 : key.includes(needle) ? 2 : 0;
      })),
    })).filter(member => member.score > 0).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 10);
    if (!items.length) return false;
    active = { input, key: context.key, query, caret: start, value, items, selected: 0 }; render(); return true;
  }
  function bind(input) {
    if (!input || bound.has(input)) return;
    bound.add(input); stateFor(input); ensureMenu(input);
    for (const event of ['input', 'focus', 'click']) input.addEventListener(event, () => { void refresh(input); });
    input.addEventListener('keyup', event => {
      if (!event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) void refresh(input);
    });
    input.addEventListener('blur', () => { close(); });
    input.addEventListener('compositionstart', () => { composing = input; close(); });
    input.addEventListener('compositionend', () => { if (composing === input) composing = null; void refresh(input); });
  }
  function handleKeydown(event, input) {
    if (!active || active.input !== input || event.defaultPrevented || event.isComposing || event.keyCode === 229
      || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || composing === input) return false;
    if (input.ownerDocument.activeElement !== input || contextFor(input)?.key !== active.key || input.value !== active.value
      || input.selectionStart !== active.caret || input.selectionEnd !== active.caret) { close(); return false; }
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return false;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') close();
    else if (event.key === 'Enter' || event.key === 'Tab') select(active.selected);
    else {
      active.selected = (active.selected + (event.key === 'ArrowDown' ? 1 : -1) + active.items.length) % active.items.length;
      render(); menu.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }
  function prepare(input, text = input?.value || '') {
    const context = contextFor(input);
    const state = input ? stateFor(input, context) : { value: '', ranges: [] };
    const ranges = state.value === String(text) ? state.ranges : reconcileComposerMentionRanges(state.value, String(text), state.ranges);
    return prepareComposerMentionText(text, context ? ranges : []);
  }
  function canonicalText(input) {
    if (!input) return '';
    const state = stateFor(input);
    // Draft storage may retain an already selected ID during a permission
    // refresh, only when the caller independently proves the same owner.
    // Sending still uses prepare(), which requires an authorized context.
    return prepareComposerMentionText(input.value, state.key ? state.ranges : []).text;
  }
  return { bind, refresh, close, handleKeydown, prepare, canonicalText };
}
