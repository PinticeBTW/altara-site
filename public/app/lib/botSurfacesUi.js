// The database owns identity, consent and parent-channel authority. This dialog
// never accepts a recipient user ID or carries state into another account.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeText = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const key = context => [context?.userId, context?.serverId, context?.channelId].join(':');
const errors = [
  [/PGRST202|42883|not.*function|schema cache|does not exist/i, 'Esta funcionalidade ainda não está disponível neste servidor.'],
  [/consent_required/i, 'Permite as mensagens privadas para falar com este bot.'],
  [/not_authenticated|JWT|token.*expired/i, 'A tua sessão terminou. Volta a iniciar sessão.'],
  [/surface_access_denied|permission|bot_not_installed/i, 'Já não tens acesso a esta conversa.'],
  [/thread_archived/i, 'Esta conversa está arquivada.'],
  [/rate_limited|quota_exceeded/i, 'Chegaste ao limite de mensagens. Espera um pouco e tenta novamente.'],
  [/request_conflict/i, 'Não foi possível confirmar esta ação. Fecha a janela e volta a abrir.'],
];
const messageFor = error => {
  const description = `${error?.code || ''} ${error?.message || ''}`;
  return errors.find(([pattern]) => pattern.test(description))?.[1]
    || 'Não foi possível confirmar a ação. Tenta novamente.';
};

export function createBotSurfacesUi({supabase, getContext, renderEmbeds} = {}) {
  if (!supabase?.rpc || typeof getContext !== 'function') throw new TypeError('invalid_surface_client');
  let current = null;
  const doc = globalThis.document;
  const el = (tag, text, styles) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (styles) Object.assign(node.style, styles);
    return node;
  };
  const button = (text, action) => {
    const node = el('button', text, {padding:'8px 12px', borderRadius:'8px', border:'1px solid #444', background:'#292825', color:'inherit', cursor:'pointer'});
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };
  const valid = session => {
    if (current !== session) return false;
    if (key(getContext()) !== session.contextKey) { close(); return false; }
    return true;
  };
  function close() {
    const session = current;
    if (!session) return;
    current = null;
    clearInterval(session.monitor);
    session.subscription?.unsubscribe?.();
    for (const controller of session.controllers) controller.abort();
    for (const cleanup of session.embedCleanups) cleanup();
    session.dialog.close?.();
    session.dialog.remove();
    // Never put keyboard focus back into the previous account's UI.
    if (key(getContext()) === session.contextKey && session.focus?.isConnected) session.focus.focus();
  }
  function open(kind, seed) {
    close();
    const context = {...getContext()};
    if (!doc?.body || !context.userId || !UUID.test(seed.serverId || '')
      || context.serverId !== seed.serverId
      || (kind === 'dm' ? !UUID.test(seed.botId || '') : !UUID.test(seed.channelId || '') || context.channelId !== seed.channelId)) {
      throw new Error('invalid_surface_context');
    }
    const session = {kind, seed, context, contextKey:key(context), focus:doc.activeElement, controllers:new Set(), embedCleanups:[], pending:null, busy:false, enabled:false, unavailable:false, thread:null, readGeneration:0};
    const dialog = el('dialog', undefined, {width:'min(620px, calc(100vw - 32px))', maxHeight:'calc(100dvh - 32px)', padding:'0', border:'1px solid #45433e', borderRadius:'14px', background:'#191a18', color:'#eee', font:'14px system-ui, sans-serif', boxSizing:'border-box', boxShadow:'0 20px 70px #0009'});
    dialog.setAttribute('aria-label', kind === 'dm' ? `Mensagens privadas · ${safeText(seed.name, 80) || 'Bot'}` : 'Conversas do canal');
    dialog.setAttribute('aria-modal', 'true');
    const layout = el('div', undefined, {display:'flex', flexDirection:'column', maxHeight:'calc(100dvh - 36px)', overflow:'auto'});
    const header = el('header', undefined, {display:'flex', gap:'12px', alignItems:'center', padding:'16px', borderBottom:'1px solid #35352f'});
    const title = el('h2', kind === 'dm' ? safeText(seed.name, 80) || 'Bot' : 'Conversas do canal', {fontSize:'18px', margin:'0', flex:'1', overflowWrap:'anywhere'});
    const dismiss = button('Fechar', close);
    header.append(title, dismiss);
    const body = el('div', undefined, {padding:'16px', display:'grid', gap:'12px', flexShrink:'0'});
    const status = el('p', '', {margin:'0', color:'#ead2ac', overflowWrap:'anywhere'});
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const refresh = button('Atualizar', () => { if (valid(session) && !session.busy && !session.pending) void load(session); });
    const retry = button('Tentar novamente', () => { if (valid(session) && session.pending && !session.busy) void mutate(session, session.pending); });
    retry.hidden = true;
    const actions = el('div', undefined, {display:'flex', gap:'8px', flexWrap:'wrap'});
    actions.append(refresh, retry);
    body.append(actions, status);
    layout.append(header, body); dialog.append(layout);
    Object.assign(session, {dialog, body, title, status, refresh, retry});
    current = session;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      if (!valid(session)) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button,input,textarea,[tabindex]')].filter(node => !node.disabled && !node.hidden && node.tabIndex !== -1);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    doc.body.append(dialog);
    dialog.showModal();
    dismiss.focus();
    // Only a local identity guard runs while open; history has no network poll.
    session.monitor = setInterval(() => { valid(session); }, 250);
    session.subscription = supabase.auth?.onAuthStateChange?.(() => { valid(session); })?.data?.subscription;
    return session;
  }
  async function invoke(session, name, args) {
    if (!valid(session)) return null;
    const controller = new AbortController(); session.controllers.add(controller);
    try {
      let query = supabase.rpc(name, args);
      if (query?.abortSignal) query = query.abortSignal(controller.signal);
      const {data, error} = await query;
      if (!valid(session) || controller.signal.aborted) return null;
      if (error) throw error;
      if (data?.ok !== true) throw new Error('surface_request_failed');
      return data;
    } finally { session.controllers.delete(controller); }
  }
  const argsFor = (session, action, extra = {}) => session.kind === 'dm'
    ? {p_action:action, p_bot_id:session.seed.botId, p_server_id:session.seed.serverId, ...extra}
    : {p_action:action, p_server_id:session.seed.serverId, p_channel_id:session.seed.channelId, p_thread_id:session.thread?.id || null, ...extra};
  const rpcFor = session => session.kind === 'dm' ? 'bots_dm_actor_v1' : 'bots_thread_actor_v1';
  const status = (session, text) => { if (valid(session)) session.status.textContent = text; };
  function updateControls(session) {
    if (!valid(session)) return;
    const locked = session.busy || !!session.pending;
    session.refresh.disabled = locked;
    session.retry.hidden = !session.pending || session.busy;
    session.retry.disabled = session.busy;
    if (session.composer) {
      const blocked = locked || session.unavailable || (session.kind === 'dm' ? !session.enabled : !session.thread || session.thread.archived);
      session.composer.disabled = blocked;
      session.send.disabled = blocked;
    }
    for (const control of session.navigation || []) control.disabled = locked;
    if (session.consent) { session.consent.disabled = locked; session.consentSave.disabled = locked; }
    if (session.createTitle) { session.createTitle.disabled = locked || session.unavailable; session.create.disabled = locked || session.unavailable; }
    if (session.archive) session.archive.disabled = locked || !session.thread || session.thread.archived;
  }
  function makeComposer(session) {
    const form = el('form', undefined, {display:'flex', gap:'8px', alignItems:'end'});
    const input = el('textarea', undefined, {flex:'1', minWidth:'0', resize:'vertical', padding:'10px', border:'1px solid #484740', borderRadius:'8px', background:'#11120f', color:'inherit', font:'inherit'});
    input.rows = 2; input.maxLength = 2000; input.setAttribute('aria-label', 'Mensagem');
    const send = button('Enviar', () => {}); send.type = 'submit';
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!valid(session) || session.busy || session.pending || input.disabled) return;
      const content = input.value.trim();
      if (!content) { input.focus(); return; }
      const requestId = globalThis.crypto.randomUUID();
      void mutate(session, {name:rpcFor(session), args:argsFor(session, 'send', {p_content:content, p_request_id:requestId}), action:'send'});
    });
    form.append(input, send);
    Object.assign(session, {composer:input, send});
    return form;
  }
  function makeHistory(session) {
    const history = el('div', undefined, {maxHeight:'min(42dvh, 380px)', minHeight:'100px', overflow:'auto', display:'grid', alignContent:'start', gap:'10px'});
    history.setAttribute('role', 'log'); history.setAttribute('aria-label', 'Histórico de mensagens');
    session.history = history;
    return history;
  }
  function renderHistory(session, rows) {
    for (const cleanup of session.embedCleanups.splice(0)) cleanup();
    session.history.replaceChildren();
    const messages = Array.isArray(rows) ? rows.slice(-50) : [];
    if (!messages.length) session.history.append(el('p', 'Ainda não há mensagens.', {color:'#aaa', margin:'12px 0'}));
    for (const row of messages) {
      if (!row || typeof row !== 'object') continue;
      const fromBot = row.sender === 'bot' || !!row.bot_id && !row.user_id;
      const author = session.kind === 'dm' ? (fromBot ? safeText(session.seed.name, 80) || 'Bot' : 'Tu')
        : fromBot ? 'Bot' : row.user_id === session.context.userId ? 'Tu' : 'Membro';
      const article = el('article', undefined, {padding:'10px 12px', background:fromBot ? '#24231f' : '#202420', borderRadius:'9px', overflowWrap:'anywhere'});
      const heading = el('div', undefined, {display:'flex', gap:'8px', alignItems:'baseline', flexWrap:'wrap'});
      heading.append(el('strong', author));
      const date = new Date(row.created_at);
      if (Number.isFinite(date.getTime())) { const time = el('time', date.toLocaleString('pt-PT'), {fontSize:'11px', color:'#aaa'}); time.dateTime = date.toISOString(); heading.append(time); }
      article.append(heading, el('p', safeText(row.content), {margin:'5px 0 0', whiteSpace:'pre-wrap'}));
      if (fromBot && Array.isArray(row.embeds) && row.embeds.length) {
        const cards = el('div');
        if (renderEmbeds) {
          const result = renderEmbeds({...row, source:'bot_channel_messages', metadata:{embeds:row.embeds}}, cards);
          if (typeof result === 'function') session.embedCleanups.push(result);
          else if (result?.nodeType) cards.append(result);
        } else {
          // A safe readable fallback; no unsolicited requests for bot images.
          for (const embed of row.embeds.slice(0, 10)) {
            const card = el('div', undefined, {borderLeft:'3px solid #dfc298', padding:'8px', marginTop:'8px'});
            card.append(el('strong', safeText(embed?.title, 256)), el('p', safeText(embed?.description, 4096), {whiteSpace:'pre-wrap', margin:'5px 0'}));
            for (const field of (Array.isArray(embed?.fields) ? embed.fields : []).slice(0, 25)) card.append(el('strong', safeText(field?.name, 256)), el('p', safeText(field?.value, 1024), {whiteSpace:'pre-wrap', margin:'5px 0'}));
            cards.append(card);
          }
        }
        article.append(cards);
      }
      session.history.append(article);
    }
    session.history.scrollTop = session.history.scrollHeight;
  }
  function buildDm(session) {
    session.body.append(el('p', 'Só tu e este bot podem ler esta conversa. Podes retirar a autorização quando quiseres.', {margin:'0', color:'#bbb'}));
    const label = el('label', undefined, {display:'flex', gap:'8px', alignItems:'start'});
    const consent = el('input'); consent.type = 'checkbox';
    label.append(consent, el('span', 'Permitir mensagens privadas deste bot'));
    const save = button('Guardar escolha', () => {
      if (!valid(session) || session.busy || session.pending) return;
      void mutate(session, {name:rpcFor(session), args:argsFor(session, 'consent', {p_enabled:consent.checked}), action:'consent'});
    });
    Object.assign(session, {consent, consentSave:save});
    session.body.append(label, save, makeHistory(session), makeComposer(session));
  }
  function buildThreads(session) {
    const form = el('form', undefined, {display:'flex', gap:'8px'});
    const input = el('input', undefined, {flex:'1', minWidth:'0', padding:'10px', background:'#11120f', color:'inherit', border:'1px solid #484740', borderRadius:'8px', font:'inherit'});
    input.type = 'text'; input.maxLength = 100; input.setAttribute('aria-label', 'Título da nova conversa'); input.placeholder = 'Nova conversa';
    const create = button('Criar', () => {}); create.type = 'submit';
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!valid(session) || session.busy || session.pending || input.disabled) return;
      const title = input.value.trim(); if (!title) { input.focus(); return; }
      void mutate(session, {name:rpcFor(session), args:argsFor(session, 'create', {p_title:title, p_request_id:globalThis.crypto.randomUUID()}), action:'create'});
    });
    form.append(input, create);
    const list = el('div', undefined, {display:'grid', gap:'6px', maxHeight:'180px', overflow:'auto'}); list.setAttribute('aria-label', 'Conversas');
    const heading = el('h3', 'Escolhe uma conversa', {fontSize:'15px', margin:'5px 0', overflowWrap:'anywhere'});
    const archive = button('Arquivar conversa', () => { if (valid(session) && session.thread && !session.thread.archived && !session.busy && !session.pending) void mutate(session, {name:rpcFor(session), args:argsFor(session, 'archive'), action:'archive'}); });
    Object.assign(session, {createTitle:input, create, list, threadHeading:heading, archive, navigation:[]});
    session.body.append(el('p', 'As conversas usam as permissões deste canal.', {margin:'0', color:'#bbb'}), form, list, heading, archive, makeHistory(session), makeComposer(session));
    updateControls(session);
  }
  function renderThreads(session, rows) {
    session.list.replaceChildren(); session.navigation = [];
    const threads = Array.isArray(rows) ? rows.slice(0, 50) : [];
    if (!threads.length) session.list.append(el('p', 'Ainda não há conversas.', {margin:'8px 0', color:'#aaa'}));
    for (const thread of threads) {
      if (!UUID.test(thread?.id || '')) continue;
      const pick = button(`${safeText(thread.title, 100)}${thread.archived ? ' · Arquivada' : ''}${thread.bot_id ? ' · Bot' : ''}`, () => {
        if (!valid(session) || session.busy || session.pending) return;
        session.thread = thread; session.history.replaceChildren(); updateControls(session); void load(session);
      });
      pick.setAttribute('aria-pressed', String(session.thread?.id === thread.id));
      Object.assign(pick.style, {textAlign:'left', overflowWrap:'anywhere'});
      session.navigation.push(pick); session.list.append(pick);
    }
  }
  async function load(session) {
    if (!valid(session) || session.busy || session.pending) return;
    const generation = ++session.readGeneration;
    session.busy = true; updateControls(session); status(session, 'A carregar…');
    try {
      if (session.kind === 'threads') {
        const list = await invoke(session, rpcFor(session), argsFor(session, 'list'));
        if (!list || generation !== session.readGeneration) return;
        renderThreads(session, list.threads);
      }
      if (session.kind === 'dm' || session.thread) {
        const data = await invoke(session, rpcFor(session), argsFor(session, 'history'));
        if (!data || generation !== session.readGeneration) return;
        if (session.kind === 'dm') { session.enabled = data.enabled === true; session.consent.checked = session.enabled; }
        else { session.thread = data.thread; session.threadHeading.textContent = `${safeText(data.thread?.title, 100)}${data.thread?.archived ? ' · Arquivada' : ''}`; }
        renderHistory(session, data.messages);
      }
      session.unavailable = false; status(session, '');
    } catch (error) {
      if (!valid(session)) return;
      session.unavailable = true; status(session, messageFor(error));
      if (session.kind === 'threads' && /surface_access_denied|thread_not_found/i.test(error?.message || '')) { session.thread = null; session.history.replaceChildren(); session.list.replaceChildren(); }
    } finally { if (valid(session)) { session.busy = false; updateControls(session); } }
  }
  async function mutate(session, operation) {
    if (!valid(session) || session.busy) return;
    // Keep the exact payload and UUID until an authoritative success. A lost
    // response can be retried without adding a second message or thread.
    session.pending = operation; session.busy = true; updateControls(session); status(session, 'A guardar…');
    try {
      const data = await invoke(session, operation.name, operation.args);
      if (!data) return;
      session.pending = null; session.unavailable = false;
      if (operation.action === 'send') session.composer.value = '';
      if (operation.action === 'consent') { session.enabled = data.enabled === true; session.consent.checked = session.enabled; }
      if (operation.action === 'create') { session.thread = data.thread; session.createTitle.value = ''; }
      if (operation.action === 'archive') session.thread = {...session.thread, archived:true};
      status(session, operation.action === 'consent' ? session.enabled ? 'Autorização guardada.' : 'Autorização retirada.' : 'Guardado.');
    } catch (error) {
      if (!valid(session)) return;
      status(session, messageFor(error));
      // Definitive refusals cannot be repaired by replaying the same operation.
      if (/consent_required|thread_archived|surface_access_denied|not_installed|request_conflict|PGRST202|42883/i.test(`${error?.code || ''} ${error?.message || ''}`)) {
        session.pending = null; session.unavailable = true;
        if (/consent_required/.test(error?.message || '')) { session.enabled = false; session.consent.checked = false; }
        if (/thread_archived/.test(error?.message || '')) session.thread = {...session.thread, archived:true};
      }
    } finally {
      if (valid(session)) { session.busy = false; updateControls(session); }
    }
    if (valid(session) && !session.pending && !session.unavailable && operation.action !== 'consent') await load(session);
  }
  return {
    async openDirectMessage(seed) { const session = open('dm', seed); buildDm(session); await load(session); },
    async openThreads(seed) { const session = open('threads', seed); buildThreads(session); await load(session); },
    close,
  };
}
