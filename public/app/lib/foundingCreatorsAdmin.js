import { summarizeCreators } from './foundingCreatorsModel.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const funnels = { prospect: 'Prospecção', contacted: 'Contactado', approved: 'Aprovado', active: 'Ativo', paused: 'Pausado' };
const statuses = { online: 'Online', idle: 'Ausente', focus: 'Foco', dnd: 'Não perturbar', offline: 'Offline', unknown: 'Indisponível' };
const plans = { nova: 'Nova ativo', core: 'Core ativo', free: 'Sem ALTARA+', unlinked: 'Conta não vinculada', unavailable: 'Plano indisponível' };
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const rate = value => value.percent === null ? '—' : `${value.percent}%`;
const rateCell = value => `<span title="${value.returned} retornos / ${value.eligible} contas com janela completa">${rate(value)} <small>(${value.returned}/${value.eligible})</small></span>`;

export function createFoundingCreatorsAdmin({ supabase, getUserId, doc = globalThis.document, now = Date.now } = {}) {
  let owner = '', generation = 0, button, dialog, timer, expiryTimer, subscription;
  let snapshot = null, presence = [], ready = false, selected = '', page = 0, search = '', filter = '';
  let lastInput = now(), lastRecorded = 0, activityPending = false, attributed = true, loading = false;
  let snapshotLoadedAt = 0, requestId = 0, abortController;
  let renderPending = false;
  function scheduleRender() {
    if (!dialog?.open || renderPending) return;
    renderPending = true;
    // Keep dashboard rendering outside the product's critical Presence callback.
    queueMicrotask(() => {
      renderPending = false;
      try { render(); } catch (_) {
        if (dialog) dialog.querySelector('[data-fc-message]').textContent = 'Não foi possível atualizar a visualização. Tente atualizar novamente.';
      }
    });
  }
  const rpc = async (name, args = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      let query = supabase.rpc(name, args);
      if (query.abortSignal) query = query.abortSignal(controller.signal);
      const result = await query;
      if (result.error) throw result.error;
      return result.data;
    } finally { clearTimeout(timeout); }
  };
  function invalidate() {
    generation++; requestId++; snapshot = null; owner = ''; ready = false; presence = [];
    loading = false; selected = ''; page = 0; activityPending = false;
    clearInterval(timer); clearInterval(expiryTimer); timer = expiryTimer = null;
    abortController?.abort(); button?.remove(); button = null; dialog?.remove(); dialog = null;
  }
  async function recordActivity() {
    if (!owner || owner !== getUserId() || !attributed || activityPending || doc.defaultView?.navigator?.onLine === false || doc.visibilityState === 'hidden' || now() - lastInput > 300000 || now() - lastRecorded < 60000) return;
    const epoch = generation;
    activityPending = true;
    try {
      const result = await rpc('founding_creator_activity_v1');
      if (epoch !== generation) return;
      lastRecorded = now();
      if (result?.status === 'not_attributed') attributed = false;
    } catch (error) {
      if (epoch === generation) {
        lastRecorded = now();
        if (['PGRST202', '42883'].includes(error?.code)) attributed = false;
      }
    }
    finally { if (epoch === generation) activityPending = false; }
  }
  function render() {
    if (!dialog?.open || owner !== getUserId()) return;
    dialog.querySelector('[data-fc-live]').textContent = ready ? 'Presença em tempo real' : 'Presença indisponível · aguardando conexão';
    if (!snapshot) return;
    // An expired metrics snapshot is never presented as a current connection state.
    const view = summarizeCreators(snapshot, presence, ready, now());
    const root = dialog.querySelector('[data-fc-content]');
    const cards = [['Creators ativos', `${view.total.creators} / 25`], ['Usuários BR atribuídos', view.total.br],
      ['Online agora', view.total.online ?? '—'], ['Ativos em 24h', view.total.active24h], ['Retenção D1', rate(view.total.d1)], ['Retenção D7', rate(view.total.d7)]];
    const filtered = view.creators.filter(c => (!filter || c.funnel === filter) && `${c.name} ${c.niche} ${c.referral_code}`.toLowerCase().includes(search.toLowerCase()));
    const creator = view.creators.find(c => c.id === selected);
    root.innerHTML = `<div class="fc-cards">${cards.map(([label, value]) => `<article><small>${label}</small><strong>${escape(value)}</strong></article>`).join('')}</div>
      <p class="fc-note">${view.total.signups} contas atribuídas · ${view.total.unknownRegion} sem país conhecido. Ativos 24h e retenção abrangem todas as contas atribuídas.
      D1: retorno entre 24–48h; D7: 168–192h após signup. Janelas incompletas ficam fora do denominador.</p>
      <div class="fc-table"><table><caption>Founding Creators — aquisição e comunidade</caption><thead><tr><th>Creator / nicho</th><th>Convidados atribuídos</th><th>Signups confirmados</th><th>Online</th><th>Ativos 24h</th><th>D1</th><th>D7</th><th>Comunidade</th><th>Funil</th><th>Nova / milestone</th></tr></thead><tbody>${filtered.map(c => `<tr>
      <td><button type="button" data-fc-select="${escape(c.id)}">${escape(c.name)}</button><small>${escape(c.niche)} · ${escape(c.referral_code)}</small></td>
      <td>${c.metrics.signups}</td><td>${c.users.filter(u => u.confirmed).length}</td><td>${c.metrics.online ?? '—'}</td><td>${c.metrics.active24h}</td><td>${rateCell(c.metrics.d1)}</td><td>${rateCell(c.metrics.d7)}</td>
      <td>${escape(c.server_name || '—')}</td><td>${escape(funnels[c.funnel])}</td><td>${escape(plans[c.current_plan] || 'Plano indisponível')}<small>${c.nova_months}m registrados · ${escape(c.milestone)}</small></td></tr>`).join('') || '<tr><td colspan="10">Nenhum creator encontrado. Cadastre o primeiro creator para começar.</td></tr>'}</tbody></table></div>
      ${creator ? `<section class="fc-detail"><div class="fc-detail-head"><h3>${escape(creator.name)} · ${creator.users.length} usuários</h3><button type="button" data-fc-edit="${escape(creator.id)}">Editar creator</button></div>
      <label>Link de signup<input readonly aria-label="Link de signup" value="${escape(`https://www.altaraapp.com/app/register.html?creator_ref=${encodeURIComponent(creator.referral_code)}`)}"></label>
      <p class="fc-note">A atividade usa a presença compartilhada no ALTARA. Chamadas exibem a projeção existente de servidor/canal; chamadas privadas e navegação de texto não são inferidas.</p>
      <div class="fc-table"><table><thead><tr><th>Usuário</th><th>Estado</th><th>Atividade atual</th><th>Call / servidor / canal</th><th>Signup / ativação</th><th>Última atividade</th><th>D1 / D7</th></tr></thead><tbody>${creator.users.slice(page * 50, (page + 1) * 50).map(u => `<tr><td>${escape(u.display_name)}<small>${escape(u.username)} · ${escape(u.region || 'País desconhecido')}</small></td><td><span class="fc-status fc-${u.live.status}">${statuses[u.live.status]}</span></td><td>${escape(u.live.activity || '—')}</td><td>${escape(u.live.call ? `Em call · ${u.live.call.server_name} / ${u.live.call.channel_name}` : '—')}</td><td>${escape(date(u.signup_at))}<small>${u.activated_at ? `Ativado: ${escape(date(u.activated_at))}` : 'Ainda não ativado'}</small></td><td>${escape(date(u.last_active_at))}</td><td>${[1, 7].map(d => u[`d${d}_eligible`] ? (u[`d${d}_returned`] ? 'Sim' : 'Não') : 'Pendente').join(' / ')}</td></tr>`).join('') || '<tr><td colspan="7">Ainda não há usuários atribuídos.</td></tr>'}</tbody></table></div>
      <div class="fc-pager"><button type="button" data-fc-page="-1" ${page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${page + 1}</span><button type="button" data-fc-page="1" ${(page + 1) * 50 >= creator.users.length ? 'disabled' : ''}>Próxima</button></div></section>` : ''}
      <p class="fc-note">Convidados atribuídos = contas criadas pelo código, incluindo email pendente; não mede links enviados ou cliques anônimos. Ativação = primeira sessão autenticada em primeiro plano. Nova é um registro do programa; benefícios e extensões exigem revisão e concessão separada.</p>`;
    dialog.querySelector('[data-fc-live]').textContent = ready ? 'Presença em tempo real' : 'Presença indisponível · aguardando conexão';
  }
  async function refresh() {
    if (!dialog?.open || loading || !owner) return;
    if (owner !== getUserId()) { invalidate(); return; }
    const epoch = generation, request = ++requestId;
    loading = true;
    try {
      const data = await rpc('founding_creators_snapshot_v1');
      if (epoch !== generation || request !== requestId || owner !== getUserId()) return;
      snapshot = data; snapshotLoadedAt = now(); render();
      dialog.querySelector('[data-fc-message]').textContent = `Dados atualizados: ${date(data.generated_at)}`;
    } catch (error) {
      if (epoch !== generation || request !== requestId) return;
      snapshot = null;
      dialog.querySelector('[data-fc-content]').replaceChildren();
      dialog.querySelector('[data-fc-message]').textContent = error?.code === '42501'
        ? 'Acesso admin necessário. Os dados foram limpos.' : 'Não foi possível carregar os dados. Tente atualizar novamente.';
    } finally { if (epoch === generation) loading = false; }
  }
  function editCreator(id) {
    const c = snapshot?.creators.find(c => c.id === id) || {};
    const form = dialog.querySelector('form');
    form.hidden = false;
    for (const key of ['id', 'name', 'niche', 'referral_code', 'user_id', 'server_id', 'funnel', 'nova_months']) form.elements[key].value = c[key] ?? ({ niche: 'comunidades', funnel: 'prospect', nova_months: 0 }[key] ?? '');
    form.elements.referral_code.readOnly = !!c.id;
    form.elements.name.focus();
  }
  async function open() {
    if (owner !== getUserId()) { invalidate(); return; }
    if (!dialog) {
      dialog = doc.createElement('dialog'); dialog.className = 'fc-admin'; dialog.setAttribute('aria-label', 'Admin Founding Creators Brasil');
      dialog.innerHTML = `<header><div><small>ALTARA · INTERNO / ADMIN</small><h2>Founding 25 — Brasil</h2><span data-fc-live></span></div><button type="button" data-fc-close aria-label="Fechar dashboard">Fechar</button></header>
        <div class="fc-toolbar"><label>Buscar creator<input type="search" data-fc-search placeholder="Nome, nicho ou código"></label><label>Estado<select data-fc-filter aria-label="Estado"><option value="">Todos</option>${Object.entries(funnels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><button type="button" data-fc-refresh>Atualizar</button><button type="button" data-fc-new>Novo creator</button></div>
        <p role="status" data-fc-message>Carregando…</p>
        <form hidden><input name="id" type="hidden"><h3>Cadastro do creator</h3><div class="fc-form-grid">
        <label>Nome<input name="name" required maxlength="100"></label><label>Nicho<input name="niche" required maxlength="40"></label><label>Código estável<input name="referral_code" required pattern="[A-Za-z0-9_-]{6,48}" maxlength="48"></label><label>ID da conta do creator<input name="user_id" placeholder="UUID · opcional"></label><label>ID da comunidade<input name="server_id" placeholder="UUID · opcional"></label><label>Funil<select name="funnel" aria-label="Funil">${Object.entries(funnels).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label>Nova registrado (meses)<select name="nova_months" aria-label="Nova registrado (meses)">${[0,3,6,9,12].map(n => `<option>${n}</option>`).join('')}</select></label></div>
        <p class="fc-note">Somente creators no estado Ativo recebem novas atribuições. Este cadastro não concede assinatura, badge ou rewards.</p><button type="submit">Salvar creator</button> <button type="button" data-fc-cancel>Cancelar</button></form>
        <main data-fc-content></main>`;
      doc.body.append(dialog);
      dialog.addEventListener('click', event => {
        const el = event.target.closest('button'); if (!el) return;
        if (el.hasAttribute('data-fc-close')) dialog.close();
        if (el.hasAttribute('data-fc-refresh')) void refresh();
        if (el.hasAttribute('data-fc-new')) editCreator();
        if (el.hasAttribute('data-fc-edit')) editCreator(el.dataset.fcEdit);
        if (el.hasAttribute('data-fc-cancel')) dialog.querySelector('form').hidden = true;
        if (el.hasAttribute('data-fc-select')) { selected = el.dataset.fcSelect; page = 0; render(); }
        if (el.hasAttribute('data-fc-page')) { page = Math.max(0, page + Number(el.dataset.fcPage)); render(); }
      });
      dialog.querySelector('[data-fc-search]').addEventListener('input', e => { search = e.target.value; render(); });
      dialog.querySelector('[data-fc-filter]').addEventListener('change', e => { filter = e.target.value; render(); });
      dialog.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target, submit = form.querySelector('[type=submit]'), epoch = generation;
        if (submit.disabled) return;
        submit.disabled = true;
        try {
          await rpc('founding_creator_save_v1', { p_creator: Object.fromEntries(new FormData(form)) });
          if (epoch !== generation) return;
          form.hidden = true; await refresh();
        } catch (_) {
          if (epoch === generation) dialog.querySelector('[data-fc-message]').textContent = 'Não foi possível salvar. Verifique os IDs, o código único e a permissão admin.';
        } finally { submit.disabled = false; }
      });
      dialog.addEventListener('close', () => { clearInterval(timer); clearInterval(expiryTimer); snapshot = null; dialog.querySelector('[data-fc-content]').replaceChildren(); });
    }
    if (dialog.open) return;
    dialog.showModal();
    await refresh();
    if (!dialog?.open) return;
    timer = setInterval(() => { void refresh(); }, 15000);
    expiryTimer = setInterval(() => {
      if (owner !== getUserId()) { invalidate(); return; }
      if (snapshot && now() - snapshotLoadedAt > 45000) {
        snapshot = null; dialog.querySelector('[data-fc-content]').replaceChildren();
        dialog.querySelector('[data-fc-message]').textContent = 'Dados desatualizados. Aguardando reconexão.';
      } else render();
    }, 5000);
  }
  async function start() {
    if (!getUserId() || owner === getUserId()) return;
    invalidate(); owner = getUserId(); attributed = true; lastRecorded = 0; lastInput = now();
    const epoch = generation;
    if (!doc.querySelector('link[data-founding-creators]')) {
      const style = doc.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('./foundingCreatorsAdmin.css', import.meta.url).href; style.dataset.foundingCreators = ''; doc.head.append(style);
    }
    abortController = new AbortController();
    doc.defaultView?.addEventListener('offline', () => {
      ready = false;
      scheduleRender();
    }, { signal: abortController.signal });
    for (const type of ['pointerdown', 'keydown']) doc.addEventListener(type, () => {
      lastInput = now();
      if (ready) void recordActivity();
    }, { passive: true, signal: abortController.signal });
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState !== 'hidden') {
        lastInput = now();
        if (ready) void recordActivity();
      }
    }, { signal: abortController.signal });
    if (!subscription) subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (owner && session?.user?.id !== owner)) invalidate();
    }).data.subscription;
    try {
      const allowed = await rpc('founding_creators_access_v1');
      if (!allowed || epoch !== generation || owner !== getUserId()) return;
      const nav = doc.querySelector('#settingsNavReportsButton')?.parentElement || doc.querySelector('.settingsNav');
      if (!nav) return;
      button = doc.createElement('button'); button.className = 'settingsNavItem'; button.type = 'button'; button.textContent = 'Founding Creators BR'; button.addEventListener('click', () => { void open(); }); nav.append(button);
    } catch (_) { /* Uninstalled backend leaves the ordinary product journey unchanged. */ }
  }
  return { start, open, recordActivity, invalidate,
    setPresence(list, meta = {}) {
      presence = list || [];
      if (['presence-sync', 'raw-presence-state'].includes(meta.source)) ready = doc.defaultView?.navigator?.onLine !== false;
      if (['subscribe-error', 'channel-unstable'].includes(meta.source)) ready = false;
      scheduleRender();
    },
    setConnection(status) { if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) { ready = false; scheduleRender(); } },
    destroy() { invalidate(); subscription?.unsubscribe(); subscription = null; }
  };
}
