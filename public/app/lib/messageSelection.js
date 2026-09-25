export function messageSelectionLabels(locale) {
  const pt = {
    select: 'Selecionar mensagens', selected: n => `${n} selecionada${n === 1 ? '' : 's'}`,
    remove: 'Apagar', cancel: 'Cancelar', busy: 'A apagar…', retry: 'Algumas mensagens não foram apagadas. Tenta novamente.',
    confirm: n => `Apagar definitivamente ${n === 1 ? 'esta mensagem' : `estas ${n} mensagens`}? Esta ação não pode ser desfeita.`,
    title: 'Apagar mensagens', checkbox: 'Selecionar mensagem', limit: 'Podes selecionar até 100 mensagens de cada vez.',
  };
  if (locale === 'pt-BR') return { ...pt, remove: 'Excluir', busy: 'Excluindo…',
    retry: 'Algumas mensagens não foram excluídas. Tente novamente.', title: 'Excluir mensagens',
    limit: 'Você pode selecionar até 100 mensagens por vez.',
    confirm: n => `Excluir permanentemente ${n === 1 ? 'esta mensagem' : `estas ${n} mensagens`}? Esta ação não pode ser desfeita.` };
  if (locale === 'pt-PT') return pt;
  return {
    select: 'Select messages', selected: n => `${n} selected`, remove: 'Delete', cancel: 'Cancel', busy: 'Deleting…',
    retry: 'Some messages could not be deleted. Try again.', title: 'Delete messages', checkbox: 'Select message',
    limit: 'You can select up to 100 messages at a time.',
    confirm: n => `Permanently delete ${n === 1 ? 'this message' : `these ${n} messages`}? This cannot be undone.`,
  };
}

// One controller for the shared DM/group/channel timeline. The server RPC remains
// authoritative for each item; selection never grants permission to delete.
export function createMessageSelection({ root, composer, getScope, getRows, canDelete, labels,
  confirm, deleteOne, onDeleted }) {
  const doc = root.ownerDocument, selected = new Set();
  let scope = '', generation = 0, busy = false, notice = '';
  const bar = doc.createElement('div');
  bar.className = 'messageSelectionBar'; bar.hidden = true;
  bar.setAttribute('role', 'region');
  const count = doc.createElement('strong'), status = doc.createElement('span');
  status.className = 'messageSelectionBar__status'; status.setAttribute('role', 'status');
  const remove = doc.createElement('button'), cancel = doc.createElement('button');
  remove.type = cancel.type = 'button';
  remove.className = 'btn messageSelectionBar__delete'; cancel.className = 'btn ghost';
  bar.append(count, status, remove, cancel); composer.before(bar);
  const current = () => !!scope && scope === getScope();
  const rows = () => new Map(getRows().map(row => [String(row.id), row]));
  const placeBar = () => {
    // The timeline's transformed/contained ancestors clip fixed descendants.
    // Compact actions belong to the window; desktop keeps its composer slot.
    if (current() && doc.defaultView.innerWidth <= 640) {
      if (bar.parentElement !== doc.body) doc.body.append(bar);
    } else if (bar.parentElement !== composer.parentElement) composer.before(bar);
  };
  function reset() {
    scope = ''; generation++; busy = false; notice = ''; selected.clear(); sync();
  }
  function sync() {
    if (scope && !current()) return reset();
    const active = current(), text = labels(), messages = rows();
    for (const id of selected) if (!messages.has(id) || !canDelete(messages.get(id))) selected.delete(id);
    root.classList.toggle('is-selecting-messages', active);
    placeBar();
    bar.hidden = !active; bar.setAttribute('aria-label', text.select);
    count.textContent = text.selected(selected.size); status.textContent = notice;
    remove.textContent = busy ? text.busy : text.remove;
    cancel.textContent = text.cancel; remove.disabled = busy || !selected.size;
    for (const node of root.querySelectorAll('.msg[data-msg-id]')) {
      const id = node.dataset.msgId, eligible = active && canDelete(messages.get(id));
      node.classList.toggle('msg--selected', eligible && selected.has(id));
      node.classList.toggle('msg--selectable', !!eligible);
      let checkbox = node.querySelector(':scope > .messageSelectCheck');
      if (!eligible) { checkbox?.remove(); continue; }
      if (!checkbox) {
        checkbox = doc.createElement('button'); checkbox.type = 'button';
        checkbox.className = 'messageSelectCheck'; checkbox.setAttribute('role', 'checkbox');
        checkbox.textContent = '✓'; node.prepend(checkbox);
      }
      checkbox.setAttribute('aria-label', text.checkbox);
      checkbox.setAttribute('aria-checked', String(selected.has(id))); checkbox.disabled = busy;
    }
  }
  function toggle(id) {
    if (!current() || busy || !canDelete(rows().get(id))) return;
    if (selected.has(id)) selected.delete(id);
    else if (selected.size < 100) selected.add(id);
    else notice = labels().limit;
    sync();
  }
  function start(id) {
    if (!canDelete(rows().get(String(id)))) return false;
    reset(); scope = getScope(); if (!scope) return false;
    selected.add(String(id)); sync();
    root.querySelector('.messageSelectCheck[aria-checked="true"]')?.focus({ preventScroll: true });
    return true;
  }
  async function submit() {
    if (!current() || busy || !selected.size) return;
    const token = generation, owner = scope, targets = [...selected], text = labels();
    busy = true; notice = ''; sync();
    try {
      if (!await confirm(text.confirm(targets.length), text)) return;
      if (generation !== token || !current()) return;
      const deleted = [], failed = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < targets.length && generation === token && current()) {
          const id = targets[cursor++], row = rows().get(id);
          if (!row) { deleted.push(id); continue; }
          if (!canDelete(row)) { failed.push(id); continue; }
          try {
            const result = await deleteOne(row, owner);
            if (result?.error) throw result.error;
            deleted.push(id);
          } catch { failed.push(id); }
        }
      };
      await Promise.all([worker(), worker()]);
      // Navigation/account changes may cancel queued work. Never mutate the new view.
      if (generation !== token || !current()) return;
      for (const id of deleted) selected.delete(id);
      onDeleted(deleted);
      if (!failed.length && !selected.size) reset();
      else notice = text.retry;
    } catch {
      if (generation === token && current()) notice = text.retry;
    } finally {
      if (generation === token) { busy = false; sync(); }
    }
  }
  const captureClick = e => {
    if (!current()) { if (scope) reset(); return; }
    const row = e.target.closest?.('.msg[data-msg-id]'); if (!row) return;
    e.preventDefault(); e.stopImmediatePropagation(); toggle(row.dataset.msgId);
  };
  const keydown = e => {
    if (current() && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reset(); }
  };
  root.addEventListener('click', captureClick, true);
  doc.addEventListener('keydown', keydown);
  doc.defaultView.addEventListener('resize', placeBar);
  remove.addEventListener('click', () => { void submit(); }); cancel.addEventListener('click', reset);
  return { start, sync, reset, submit,
    destroy() { reset(); bar.remove(); root.removeEventListener('click', captureClick, true); doc.removeEventListener('keydown', keydown); doc.defaultView.removeEventListener('resize', placeBar); } };
}
