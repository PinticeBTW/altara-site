import { createWidgetSnapshot, MAX_SNAPSHOT_BYTES } from './widgetSnapshot.js';
import { createWidgetAccount } from './widgetAccount.js';
import { createWidgetLibrary, validateWidgetPackage } from './widgetPackages.js';
import { mountWidgetRuntime } from './widgetRuntime.js';
import { fetchWidgetRelease, fetchWidgetManifest, validateHostedWidget, mountHostedWidget } from './widgetHosted.js';
const needsFixedRelease = pkg => pkg.kind === 'hosted' && !pkg.snapshot_html && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(pkg.entry_url).hostname);
const sameFixedRelease = (a, b) => !!a?.snapshot_sha256 && a.snapshot_sha256 === b.snapshot_sha256
  && Array.isArray(a.permissions) && Array.isArray(b.permissions)
  && a.permissions.length === b.permissions.length && a.permissions.every(permission => b.permissions.includes(permission));
const mountPackage = (host, pkg, options = {}) => pkg.kind === 'hosted' ? mountHostedWidget(host, pkg, { ...options, development: true }) : mountWidgetRuntime(host, pkg, options);

export function createWidgetMarketplace({ getUserId, client, onChange = () => {}, website = false, surface = '', container = null, requestSignIn = () => {}, openWebsite = path => window.open(`https://altaraapp.com${path}`, '_blank', 'noopener,noreferrer') }) {
  let account, refreshInstalledView, routeListener;
  let actor = '', library, dialog, preview, channel, epoch = 0, pageEpoch = 0, installs = [], refreshTimer, catalogTimer, catalogWake, manifestRequest;
  const runtimes = new Map(), availableUpdates = new Map();
  let updateTimer, updateDialog, reportDialog, updateScan = null, lastUpdateScan = 0;
  const tr = (en, pt) => /^pt\b/i.test(document.documentElement.lang) ? pt : en;
  function element(tag, text, className) {
    const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
  }
  function button(text, action, className = 'btn ghost') {
    const el = element('button', text, className); el.type = 'button'; el.onclick = action; return el;
  }
  function widgetIcon(pkg, className = 'widgetMarketIcon') {
    const icon = element('span', '</>', className);
    icon.setAttribute('aria-hidden', 'true'); icon.dataset.iconUrl = pkg.icon_url || '';
    if (pkg.icon_url) {
      try {
        const safe = validateHostedWidget({ ...pkg, snapshot_html: undefined, snapshot_sha256: undefined }, { development: true });
        const img = element('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.crossOrigin = 'anonymous';
        img.onload = () => icon.classList.add('hasImage');
        img.onerror = () => { img.remove(); icon.classList.remove('hasImage'); };
        img.src = safe.icon_url; icon.append(img);
      } catch { /* Invalid or unavailable icons retain the generic symbol. */ }
    }
    return icon;
  }
  function networkNotice(pkg, previous) {
    if (!pkg.snapshot_html) return tr('Live preview: the creator’s website can use the Internet.', 'Preview online: o site do criador pode usar a Internet.');
    if (!pkg.permissions.includes('network')) return tr('Internet APIs: blocked. External icons and catalog metadata may still contact their host.', 'APIs de Internet: bloqueadas. Os ícones externos e os dados do catálogo ainda podem contactar o alojamento.');
    return (previous && !previous.permissions.includes('network') ? tr('New permission — ', 'Nova permissão — ') : '') + tr('Internet APIs: allowed over HTTPS. External services can receive your IP address and data entered in this widget.', 'APIs de Internet: permitidas por HTTPS. Os serviços externos podem receber o teu IP e dados introduzidos neste widget.');
  }
  function safetyNotice(pkg, onAccept) {
    const box = element('section', '', 'widgetSafety');
    box.append(element('p', pkg.snapshot_html ? tr('Fixed version. Updates need your approval. ', 'Versão fixa. As atualizações precisam da tua aprovação. ') + (pkg.permissions.includes('network') ? tr('Internet APIs allowed.', 'APIs de Internet permitidas.') : tr('Internet APIs blocked.', 'APIs de Internet bloqueadas.')) : tr(`Runs on ${new URL(pkg.entry_url).hostname}. The creator controls its content and can receive what you enter.`, `Funciona em ${new URL(pkg.entry_url).hostname}. O criador controla o conteúdo e pode receber o que introduzires.`), 'widgetSafetySummary'));
    const details = element('dialog', '', 'widgetSafetyDialog');
    const detailsTitle = tr('About this widget’s access', 'Sobre o acesso deste widget');
    details.setAttribute('aria-label', detailsTitle);
    const header = element('header');
    const dismiss = button('×', () => details.close());
    dismiss.setAttribute('aria-label', tr('Close details', 'Fechar detalhes'));
    header.append(element('h3', detailsTitle), dismiss); details.append(header, element('p', networkNotice(pkg)));
    details.addEventListener('click', event => { if (event.target === details) {
      const rect = details.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) details.close();
    } });
    details.append(element('p', pkg.snapshot_html ? tr('This code is saved by ALTARA and checked before opening. New releases only replace it when you choose to update. API responses can change, and services contacted by the widget can receive your IP address and what you enter or upload. A catalog listing is not a security review.', 'Este código é guardado pelo ALTARA e verificado antes de abrir. Só é substituído quando escolhes atualizar. As respostas de APIs podem mudar e os serviços contactados podem receber o teu IP e o que escreveres ou enviares. Estar no catálogo não significa que foi verificado.') : tr('A catalog listing is not a security review. The creator can change this widget after you install it. Opening it contacts an external website, which can receive your IP address and anything you enter or upload.', 'Estar no catálogo não significa que foi verificado. O criador pode alterar este widget depois de o instalares. Ao abri-lo, contactas um site externo que pode receber o teu IP e tudo o que escreveres ou enviares.')));
    details.append(element('p', tr('Never enter your ALTARA password, login codes or payment details inside a widget.', 'Nunca introduzas a password do ALTARA, códigos de acesso ou dados de pagamento dentro de um widget.')));
    details.append(element('p', pkg.permissions.includes('storage')
      ? tr('ALTARA access: only this widget’s saved data on this device. No chat messages or account credentials are provided.', 'Acesso ao ALTARA: apenas os dados deste widget guardados neste dispositivo. Não recebe mensagens nem credenciais da conta.')
      : tr('ALTARA access: none. This does not prevent the external site from collecting what you enter.', 'Acesso ao ALTARA: nenhum. Isto não impede o site externo de recolher o que introduzires.')));
    details.append(element('p', tr('Widgets can contact other websites and use CPU, memory and battery. A name, logo or rating does not prove the creator’s identity. Uninstall a widget if you do not trust it.', 'Os widgets podem contactar outros sites e consumir processador, memória e bateria. O nome, logótipo ou avaliação não prova a identidade do criador. Desinstala um widget se não confiares nele.')));
    details.append(button(tr('Widget privacy and security', 'Privacidade e segurança dos widgets'), () => website ? window.open('/privacy#community-widgets', '_blank', 'noopener,noreferrer') : openWebsite('/privacy#community-widgets'), 'widgetSafetyMore'));
    box.append(button(detailsTitle, () => details.showModal(), 'widgetSafetyMore'), details);
    const label = element('label'), check = element('input'); check.type = 'checkbox';
    label.append(check, document.createTextNode(tr('I understand and want to use this external widget.', 'Compreendo e quero usar este widget externo.'))); box.append(label);
    check.onchange = () => onAccept(check.checked);
    return box;
  }
  function installedPackage(pkg, sourceId) {
    return library?.read().installs.some(item => item.package.kind === pkg.kind
      && (sourceId === undefined || item.sourceId === sourceId)
      && item.package.manifest_url === pkg.manifest_url && item.package.entry_url === pkg.entry_url
      && (item.package.snapshot_sha256 || '') === (pkg.snapshot_sha256 || '') && item.package.version === pkg.version && item.package.sdkVersion === pkg.sdkVersion
      && JSON.stringify(item.package.permissions) === JSON.stringify(pkg.permissions));
  }
  // Account installation is the approval to run on every device. Browsing a new
  // package still needs an explicit acknowledgement before preview or install.
  function installNotice(pkg, onAccept) {
    let installed;
    const notice = safetyNotice(pkg, onAccept);
    const refresh = () => {
      const next = !!installedPackage(pkg);
      if (next === installed && !next) return;
      installed = next; notice.hidden = next;
      if (next) notice.querySelector('dialog[open]')?.close();
      notice.querySelector('input').checked = next;
      onAccept(next);
    };
    return { notice, refresh };
  }
  function stop() { for (const entry of runtimes.values()) entry.runtime.dispose(); runtimes.clear(); }
  function close() {
    refreshInstalledView = null;
    epoch++; pageEpoch++; manifestRequest?.abort(); preview?.dispose(); preview = null; clearTimeout(refreshTimer);
    clearInterval(catalogTimer); if (catalogWake) globalThis.removeEventListener?.('focus', catalogWake); catalogWake = null;
    if (routeListener) globalThis.removeEventListener?.('popstate', routeListener); routeListener = null;
    if (channel) { client?.removeChannel(channel); channel = null; }
    dialog?.close?.(); dialog?.remove(); dialog = null;
  }
  function sync() {
    const next = String(getUserId() || '');
    if (next !== actor) {
      close(); stop(); clearInterval(updateTimer); globalThis.removeEventListener?.('focus', scanUpdates); availableUpdates.clear(); lastUpdateScan = 0; updateDialog?.remove(); updateDialog = null; reportDialog?.remove(); reportDialog = null; account?.dispose(); account = null; actor = next; library = actor ? createWidgetLibrary(localStorage, actor) : null;
      installs = library?.read().installs || [];
      if (actor) { updateTimer = setInterval(scanUpdates, 30000); updateTimer.unref?.(); globalThis.addEventListener?.('focus', scanUpdates); }
      if (actor && client?.rpc && client?.channel) {
        account = createWidgetAccount({ client, userId: actor, library, onChange: id => {
          if (actor !== next || String(getUserId() || '') !== next) return;
          const before = new Set(installs.map(item => item.id));
          installs = library.read().installs;
          onChange(id || installs.filter(item => !before.has(item.id)).map(item => item.id));
          refreshInstalledView?.();
        } });
        account.start();
      }
    }
    return installs;
  }
  function changed(id) { installs = library.read().installs; onChange(id); }
  async function uninstall(id) {
    sync();
    const item = installs.find(row => row.id === id); if (!item || !library) return;
    if (item.accountId && account) await account.remove(item);
    else { library.remove(item.id); changed(); }
  }
  async function install(pkg, sourceId) {
    if (!actor || actor !== String(getUserId() || '')) { sync(); throw Error(tr('Sign in again to install this widget.', 'Inicia sessão novamente para instalar este widget.')); }
    if (needsFixedRelease(pkg)) throw Error(tr('Install a fixed release. Live websites cannot be added to your home.', 'Instala uma versão fixa. Sites que mudam sozinhos não podem ser adicionados à home.'));
    let publicPackage; try { publicPackage = validateHostedWidget(pkg); } catch {}
    const store = library, owner = actor;
    const item = publicPackage && account && (!publicPackage.snapshot_html || sourceId) ? await account.add(publicPackage, sourceId) : store.install(pkg, sourceId);
    if (owner !== String(getUserId() || '') || store !== library) return item;
    // A previous account install can have different pinned metadata. Do not consent to that silently.
    if (JSON.stringify(validateWidgetPackage(pkg)) === JSON.stringify(item.package)) store.setConsent(item, true);
    changed(item.id); return item;
  }
  function download(pkg) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(validateWidgetPackage(pkg), null, 2)], { type: 'application/json' }));
    const a = element('a'); a.href = url; a.download = `${pkg.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 50)}.altara-widget.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reportWidget(releaseId, name) {
    if (!actor) { requestSignIn(releaseId); return; }
    reportDialog?.remove();
    const owner = actor, modal = element('dialog', '', 'widgetMarket widgetUpdateDialog'); reportDialog = modal;
    modal.id = 'widgetReportDialog'; modal.setAttribute('aria-label', tr('Report widget', 'Denunciar widget'));
    const dismiss = () => { modal.close(); modal.remove(); if (reportDialog === modal) reportDialog = null; };
    const alive = () => modal.isConnected && actor === owner && String(getUserId() || '') === owner;
    const header = element('header', '', 'widgetMarketHeader');
    header.append(element('h2', tr('Report widget', 'Denunciar widget')), button(tr('Cancel', 'Cancelar'), dismiss));
    const form = element('form', '', 'widgetMarketBody widgetPublishForm');
    form.append(element('h3', name), element('p', tr('Tell ALTARA moderation what happened. Include only information you want to share with the moderation team.', 'Explica à moderação do ALTARA o que aconteceu. Inclui apenas informações que queres partilhar com a equipa.')));
    const reasonLabel = element('label', tr('Reason', 'Motivo')), reason = element('select'); reason.name = 'reportReason'; reason.setAttribute('aria-label', tr('Reason', 'Motivo'));
    for (const [value, en, pt] of [['privacy', 'Privacy or suspicious access', 'Privacidade ou acesso suspeito'], ['harmful', 'Harmful or misleading content', 'Conteúdo perigoso ou enganador'], ['broken', 'Broken widget', 'Widget com problemas'], ['other', 'Other', 'Outro']]) {
      const option = element('option', tr(en, pt)); option.value = value; reason.append(option);
    }
    reasonLabel.append(reason);
    const detailLabel = element('label', tr('What happened?', 'O que aconteceu?')), details = element('textarea');
    details.name = 'reportDetails'; details.required = true; details.minLength = 10; details.maxLength = 2000; details.rows = 4; detailLabel.append(details);
    const status = element('p', '', 'widgetMarketNotice'); status.setAttribute('role', 'status');
    const send = button(tr('Send report', 'Enviar denúncia'), () => {}, 'btn primary'); send.type = 'submit'; send.disabled = true;
    let busy = false;
    details.oninput = () => { send.disabled = busy || details.value.trim().length < 10; };
    form.append(reasonLabel, detailLabel, status, send); modal.append(header, form); document.body.append(modal); modal.showModal();
    modal.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    form.onsubmit = async event => {
      event.preventDefault(); if (!alive() || busy || details.value.trim().length < 10) return;
      busy = true; send.disabled = reason.disabled = details.disabled = true;
      try {
        const { data, error } = await client.rpc('report_home_widget', { p_release_id: releaseId, p_reason: reason.value, p_details: details.value.trim() });
        if (!alive()) return;
        if (error || !data?.ok) {
          status.textContent = data?.error === 'rate_limited' ? tr('You have reached the daily report limit. Try again tomorrow.', 'Atingiste o limite diário de denúncias. Tenta amanhã.') : data?.error === 'cannot_report_self' ? tr('You cannot report your own widget.', 'Não podes denunciar o teu próprio widget.') : tr('Could not send the report. Your text is kept; try again.', 'Não foi possível enviar. O teu texto mantém-se; tenta novamente.');
          busy = false; send.disabled = reason.disabled = details.disabled = false; return;
        }
        form.replaceChildren(element('p', tr('Report sent to ALTARA moderation. Thank you.', 'Denúncia enviada à moderação do ALTARA. Obrigado.')), button(tr('Done', 'Concluído'), dismiss));
      } catch { if (alive()) { status.textContent = tr('Could not send the report. Try again.', 'Não foi possível enviar. Tenta novamente.'); busy = false; send.disabled = reason.disabled = details.disabled = false; } }
    };
  }
  function open(initialTab = website ? 'explore' : 'add') {
    sync(); if (!actor && !website) return; close();
    const owner = actor, generation = epoch;
    dialog = element(container ? 'section' : 'dialog', '', 'widgetMarket' + (container ? ' widgetMarketPage' : ''));
    dialog.id = 'widgetMarketplaceDialog';
    dialog.setAttribute('aria-labelledby', 'widgetMarketplaceTitle');
    const heading = element('header', '', 'widgetMarketHeader');
    const title = element('div'); title.append(element('h2', surface === 'developers' ? tr('My widgets', 'Os meus widgets') : surface === 'marketplace' ? 'Marketplace' : website ? tr('Widget marketplace', 'Marketplace de widgets') : tr('Add widget', 'Adicionar widget')), element('p', surface === 'developers' ? tr('Create here. Share on the Marketplace.', 'Cria aqui. Partilha no Marketplace.') : tr('Make your home your own.', 'Uma homescreen à tua medida.')));
    title.firstElementChild.id = 'widgetMarketplaceTitle';
    const closeButton = button('×', close); closeButton.setAttribute('aria-label', tr('Close', 'Fechar')); heading.append(title); if (!container) heading.append(closeButton);
    const tabs = element('nav', '', 'widgetMarketTabs'), body = element('div', '', 'widgetMarketBody');
    const footer = element('p', tr('Public widgets sync with your account. Local test links and widget data stay on this device.', 'Os widgets públicos sincronizam com a tua conta. Links de teste locais e dados dos widgets ficam neste dispositivo.'), 'widgetMarketFootnote');
    dialog.append(heading, tabs, body, footer); (container || document.body).append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.showModal?.();
    const current = () => dialog?.isConnected && generation === epoch && owner === String(getUserId() || '');
    let catalogSignature = '', catalogRefreshing = false;
    const routeScope = website ? location.pathname : '';
    function rememberScroll() {
      if (!website) return;
      history.replaceState({ ...history.state, widgetNavigation: { ...history.state?.widgetNavigation, scope: routeScope, scroll: window.scrollY } }, '', location.href);
    }
    function goBack(label, build) {
      if (website && history.state?.widgetNavigation?.scope === routeScope && history.state.widgetNavigation.depth > 0) history.back();
      else showTab(label, build, { replace: true });
    }
    function showTab(label, build, options = {}) {
      if (!current()) return;
      if (website && options.history !== 'none') {
        rememberScroll();
        const url = new URL(location.href);
        const view = label === publishedLabel ? 'published' : label === mineLabel ? 'installed' : label === createLabel ? 'create' : label === tr('Themes · Coming soon', 'Temas · Em breve') ? 'themes' : '';
        if (view) url.searchParams.set('view', view); else url.searchParams.delete('view');
        if (options.widget) url.searchParams.set('widget', options.widget); else url.searchParams.delete('widget');
        if (options.edit) url.searchParams.set('edit', '1'); else url.searchParams.delete('edit');
        if (url.href !== location.href) {
          const depth = history.state?.widgetNavigation?.scope === routeScope ? history.state.widgetNavigation.depth || 0 : 0;
          history[options.replace ? 'replaceState' : 'pushState']({ ...history.state, widgetNavigation: { scope: routeScope, depth: options.replace ? depth : depth + 1, scroll: 0 } }, '', url);
        }
      }
      refreshInstalledView = null;
      pageEpoch++; manifestRequest?.abort(); preview?.dispose(); preview = null; body.replaceChildren();
      dialog.dataset.view = options.widget ? (options.edit ? 'update' : 'detail') : label === mineLabel ? 'installed' : 'catalog';
      if (!website) title.firstElementChild.textContent = label === tr('Manage widgets', 'Gerir widgets') ? label : tr('Add widget', 'Adicionar widget');
      for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.textContent === label));
      const built = build();
      if (website && options.history !== 'none') window.scrollTo({ top: Math.max(0, dialog.getBoundingClientRect().top + window.scrollY - 100), behavior: 'instant' });
      return built;
    }
    const unchangedText = () => tr('No changes to the widget code or permissions. Upload a changed release or change its permissions.', 'O código e as permissões são iguais aos da última versão. Envia uma versão alterada ou muda as permissões.');
    const errorText = error => error?.code === '23514' && error.message === 'Widget update has no code or permission changes'
      ? unchangedText()
      : error?.code === '23514' && /Describe what changed|widget_release_notes_length/.test(error.message || '')
      ? tr('Updates need 10–2,000 characters explaining what changed. Open Published widgets → Publish update to add them.', 'As atualizações precisam de 10–2 000 caracteres a explicar o que mudou. Abre Widgets publicados → Publicar atualização para os escrever.')
      : error?.code === '42P01' || error?.code === 'PGRST205'
      ? tr('Community publishing is temporarily unavailable. You can still test links in Developers.', 'A publicação está temporariamente indisponível. Podes testar links em Programadores.')
      : tr('Could not complete this action. Check your connection and try again.', 'Não foi possível concluir. Verifica a ligação e tenta novamente.');
    function notice(text) { const el = element('p', text, 'widgetMarketNotice'); el.setAttribute('role', 'status'); return el; }
    function card(pkg, actions, byline = '') {
      const el = element('article', '', 'widgetMarketCard');
      const summary = element('div', '', 'widgetCardSummary');
      summary.append(element('h3', pkg.name), element('p', pkg.description), element('small', byline || `v${pkg.version}`));
      el.append(widgetIcon(pkg), summary);
      const row = element('div', '', 'widgetMarketActions'); row.append(...actions); el.append(row); return el;
    }
    const addLabel = tr('Add by link', 'Adicionar por link');
    const exploreLabel = surface === 'marketplace' ? 'Widgets' : tr('Explore', 'Explorar'), mineLabel = tr('Manage widgets', 'Gerir widgets'), createLabel = surface === 'developers' ? tr('Create & publish', 'Criar e publicar') : tr('Developers', 'Programadores');
    const publishedLabel = tr('Published widgets', 'Widgets publicados');
    async function socialDetails(rows) {
      if (!client?.rpc || !rows.length) return new Map();
      try {
        const { data, error } = await client.rpc('widget_marketplace_details', { p_ids: rows.map(row => row.id) });
        return new Map(!error && Array.isArray(data) ? data.map(row => [row.id, row]) : []);
      } catch { return new Map(); }
    }
    function creatorCard(row, info, profile = false) {
      const link = element(profile ? 'div' : 'a', '', 'widgetCreator');
      if (!profile) link.href = `/marketplace?creator=${encodeURIComponent(row.author_id)}`;
      const avatar = element('span', (info?.creator_name || 'A').slice(0, 1).toUpperCase(), 'widgetCreatorAvatar');
      try {
        const url = new URL(info?.creator_avatar);
        if (url.protocol === 'https:') {
          const img = element('img'); img.src = url.href; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); avatar.append(img);
        }
      } catch { /* A creator can have no avatar. */ }
      const text = element('span'); text.append(element('strong', info?.creator_name || tr('ALTARA creator', 'Criador ALTARA')));
      if (info?.creator_username) text.append(element('small', `@${info.creator_username}`));
      link.append(avatar, text); return link;
    }
    function stats(info) {
      const el = element('p', '', 'widgetMarketStats');
      el.textContent = info ? `${Number(info.downloads).toLocaleString()} ${tr('installs', 'instalações')} · ${info.rating_count ? `★ ${Number(info.rating_average).toFixed(1)} (${Number(info.rating_count)})` : tr('No ratings yet', 'Ainda sem avaliações')}` : tr('Statistics unavailable', 'Estatísticas indisponíveis');
      el.title = tr('Installs count unique accounts, including past installs. Other devices and reinstalls do not add to the total.', 'As instalações contam contas únicas, incluindo instalações anteriores. Outros dispositivos e reinstalações não aumentam o total.');
      return el;
    }
    async function ratingPanel(host, row, pkg, alive, updateStats, onRating = () => {}) {
      host.replaceChildren(element('h3', tr('Your rating', 'A tua avaliação')));
      if (!owner) { host.append(button(tr('Sign in to rate', 'Inicia sessão para avaliar'), () => requestSignIn(row.id))); return; }
      if (row.author_id === owner) { host.append(notice(tr('Creators cannot rate their own widgets.', 'Os criadores não podem avaliar os seus próprios widgets.'))); return; }
      if (!library?.read().installs.some(item => item.accountId && item.package.manifest_url === pkg.manifest_url && item.package.entry_url === pkg.entry_url)) {
        host.append(notice(tr('Install this widget with your account to rate it.', 'Instala este widget na tua conta para o avaliares.'))); return;
      }
      let existing;
      try {
        const result = await client.rpc('widget_project_rating', { p_release_id: row.id });
        if (!alive()) return; if (result.error) throw result.error; existing = result.data;
      } catch { if (alive()) host.append(notice(tr('Ratings are temporarily unavailable.', 'As avaliações estão temporariamente indisponíveis.'))); return; }
      const showSaved = (focus = false) => {
        if (!alive()) return;
        onRating(true);
        const edit = button(tr('Edit rating', 'Editar avaliação'), () => { if (alive()) showEditor(true); });
        host.replaceChildren(element('h3', tr('Your rating', 'A tua avaliação')), notice(`${existing.stars} ★`), edit);
        if (focus) edit.focus({ preventScroll: true });
      };
      const showEditor = (focus = false) => {
        host.replaceChildren(element('h3', tr('Your rating', 'A tua avaliação')));
        const form = element('form', '', 'widgetRatingForm'), choices = element('fieldset'), legend = element('legend', tr('Rate from 1 to 5 stars', 'Avalia de 1 a 5 estrelas'));
        choices.append(legend);
        for (let stars = 1; stars <= 5; stars++) {
          const label = element('label'), input = element('input'); input.type = 'radio'; input.name = 'rating'; input.value = String(stars); input.required = true; input.checked = existing?.stars === stars;
          label.append(input, document.createTextNode(`${stars} ★`)); choices.append(label);
        }
        const save = button(tr('Save rating', 'Guardar avaliação'), () => {}, 'btn primary'); save.type = 'submit';
        const message = notice('');
        let busy = false;
        const setBusy = value => { busy = value; save.disabled = remove.disabled = choices.disabled = cancel.disabled = value; };
        const remove = button(tr('Remove rating', 'Remover avaliação'), async () => {
          if (!alive() || busy) return; setBusy(true);
          try {
            const { error } = await client.rpc('widget_project_rating', { p_release_id: row.id, p_remove: true });
            if (!alive()) return; if (error) throw error;
            await updateStats(); if (alive()) await ratingPanel(host, row, pkg, alive, updateStats, onRating);
          } catch { if (alive()) { message.textContent = errorText({}); setBusy(false); } }
        }); remove.hidden = !existing;
        const cancel = button(tr('Cancel', 'Cancelar'), () => showSaved(true)); cancel.hidden = !existing;
        form.append(choices, save, remove, cancel, message); host.append(form);
        if (focus) (choices.querySelector('input:checked') || choices.querySelector('input')).focus({ preventScroll: true });
        form.onsubmit = async event => {
          event.preventDefault(); if (!alive() || busy) return;
          const stars = Number(new FormData(form).get('rating')); if (!(stars >= 1 && stars <= 5)) return;
          setBusy(true);
          try {
            const result = await client.rpc('widget_project_rating', { p_release_id: row.id, p_stars: stars });
            if (!alive()) return; if (result.error) throw result.error;
            existing = { stars }; showSaved(true);
            await updateStats();
          } catch { if (alive()) message.textContent = tr('Could not save your rating. Check that the widget is still installed and try again.', 'Não foi possível guardar. Confirma que o widget continua instalado e tenta novamente.'); }
          finally { if (alive()) setBusy(false); }
        };
      };
      onRating(!!existing);
      if (existing) showSaved(); else showEditor();
    }
    async function explore(own = false, background = false) {
      const page = pageEpoch, alive = () => current() && page === pageEpoch;
      if (own && !owner) { body.append(button(tr('Sign in to manage your widgets', 'Inicia sessão para gerir os teus widgets'), () => requestSignIn())); return; }
      const listTitle = element('h3', own ? publishedLabel : tr('Community widgets', 'Widgets da comunidade'));
      const status = notice(tr('Loading community widgets…', 'A carregar widgets da comunidade…'));
      const community = element('div', '', 'widgetMarketGrid');
      if (!background) body.append(listTitle, status, community);
      let result;
      const requestedCreator = website && !own ? new URLSearchParams(location.search).get('creator') : '';
      const creator = /^[0-9a-f-]{36}$/i.test(requestedCreator || '') ? requestedCreator : '';
      const requestedWidget = website && !own ? new URLSearchParams(location.search).get('widget') : '';
      try {
        let query = client.from('home_widget_releases').select('id,author_id,name,description,version,created_at,kind,sdkVersion,manifest_url,entry_url,permissions,status,icon_url,snapshot_sha256').eq('kind', 'hosted');
        if (!own && !requestedWidget) query = query.eq('status', 'published');
        if (own || creator) query = query.eq('author_id', own ? owner : creator);
        if (requestedWidget) query = query.eq('id', requestedWidget);
        result = await query.order('created_at', { ascending: false }).limit(50);
      }
      catch { result = { error: {} }; }
      if (!alive()) return;
      if (result.error) { if (background) return; status.textContent = errorText(result.error); status.append(button(tr('Try again', 'Tentar novamente'), () => showTab(exploreLabel, explore))); return; }
      const social = await socialDetails(result.data); if (!alive()) return;
      const signature = JSON.stringify([own, creator, result.data, [...social]]);
      if (background && signature === catalogSignature) return;
      catalogSignature = signature;
      status.textContent = result.data.length ? tr('Free widgets · Latest releases', 'Widgets gratuitos · Últimas versões') : tr('No published widgets here yet.', 'Ainda não existem widgets publicados aqui.');
      if (creator && !background) {
        const back = element('a', tr('← All widgets', '← Todos os widgets'), 'btn ghost'); back.href = '/marketplace'; body.insertBefore(back, status);
        if (result.data[0]) body.insertBefore(creatorCard(result.data[0], social.get(result.data[0].id), true), status);
      }
      const projectCards = new Map();
      for (const row of result.data) {
        let hostLabel = tr('Local', 'Local');
        if (row.kind === 'hosted') {
          try { hostLabel = new URL(row.entry_url).hostname; } catch { continue; }
        }
        const add = button(own ? tr('Manage publication', 'Gerir publicação') : tr('Preview & install', 'Ver e instalar'), async () => {
          add.disabled = true;
          try {
            const { data, error } = await client.from('home_widget_releases').select('id,author_id,name,description,version,kind,sdkVersion,manifest_url,entry_url,permissions,icon_url,snapshot_html,snapshot_sha256,release_notes').eq('id', row.id).single();
            if (!alive()) return; if (error) throw error;
            const pkg = validateWidgetPackage(data);
            showTab(own ? publishedLabel : exploreLabel, () => {
              const detailPage = pageEpoch, detailAlive = () => current() && detailPage === pageEpoch;
              body.append(widgetIcon(pkg), element('h3', pkg.name), element('p', pkg.description), notice(pkg.kind === 'hosted' ? hostedNotice(pkg) : tr('Legacy local widget.', 'Widget local da versão anterior.')));
              if (data.release_notes || pkg.snapshot_html) {
                const changes = element('section', '', 'widgetReleaseNotes');
                changes.append(element('h3', tr(`What’s new in v${pkg.version}`, `Novidades da versão ${pkg.version}`)),
                  element('p', data.release_notes || tr('The creator did not provide notes for this older release.', 'O criador não forneceu notas para esta versão antiga.')));
                body.append(changes);
              }
              const statistics = element('div'), ratings = element('section', '', 'widgetRatings');
              ratings.tabIndex = -1;
              const refreshStats = async () => { const next = await socialDetails([row]); if (detailAlive()) statistics.replaceChildren(stats(next.get(row.id))); };
              let ratingVersion = 0;
              const rate = button(tr('Rate widget', 'Avaliar widget'), () => { ratings.scrollIntoView({ behavior: 'smooth', block: 'center' }); ratings.focus({ preventScroll: true }); });
              const refreshRatings = () => { const ticket = ++ratingVersion; return ratingPanel(ratings, row, pkg, () => detailAlive() && ticket === ratingVersion, refreshStats, rated => { rate.textContent = rated ? tr('Your rating', 'A tua avaliação') : tr('Rate widget', 'Avaliar widget'); }); };
              if (surface) { body.append(creatorCard(row, social.get(row.id)), statistics); if (row.author_id !== owner) body.append(rate); statistics.append(stats(social.get(row.id))); }
              const liveRelease = needsFixedRelease(pkg);
              const unavailable = row.status && row.status !== 'published';
              if (liveRelease) body.append(notice(tr('This older listing opens a live website. The creator must publish a fixed release before it can be installed. Live previews are for testing only.', 'Esta publicação antiga abre um site que pode mudar. O criador precisa de publicar uma versão fixa para ser instalada. O preview online serve apenas para testes.')));
              if (unavailable) body.append(notice(row.status === 'disabled' ? tr('Disabled by the creator.', 'Desativado pelo criador.') : tr('No longer listed. Existing installations can still run.', 'Retirado da loja. As instalações existentes continuam a funcionar.')));
              const host = element('div', '', 'widgetMarketPreview'); host.hidden = true;
              let accepted = false;
              const openPreview = button(tr('Open preview', 'Abrir preview'), () => {
                if (!detailAlive() || !accepted || row.status === 'disabled') return;
                host.hidden = false; preview?.dispose(); preview = mountPackage(host, pkg);
              }); openPreview.disabled = true;
              const installButton = button(tr('Add to ALTARA', 'Adicionar ao ALTARA'), async () => {
                if (!accepted || unavailable || liveRelease) return;
                if (!actor) { requestSignIn(row.id); return; }
                installButton.disabled = true;
                try { await install(pkg, row.id); if (detailAlive()) { consent.refresh(); if (surface) { await refreshStats(); if (detailAlive()) await refreshRatings(); } } }
                catch (error) { if (detailAlive()) { installButton.disabled = false; body.append(notice(error.message)); } }
              }, 'btn primary');
              installButton.disabled = true;
              const copy = button(tr('Copy widget link', 'Copiar link do widget'), async () => {
                if (!detailAlive() || !accepted || copy.disabled) return;
                try { await navigator.clipboard.writeText(new URL(`/marketplace?widget=${encodeURIComponent(row.id)}`, website ? location.origin : 'https://altaraapp.com').href); if (detailAlive() && accepted) copy.textContent = tr('Copied', 'Copiado'); }
                catch { if (detailAlive() && accepted) body.append(notice(pkg.manifest_url)); }
              });
              const consent = installNotice(pkg, value => {
                accepted = value; openPreview.disabled = !value || row.status === 'disabled'; installButton.disabled = !value || unavailable || liveRelease || !!installedPackage(pkg, row.id);
                copy.disabled = !value;
                installButton.textContent = liveRelease ? tr('Fixed release required', 'Precisa de versão fixa') : installedPackage(pkg, row.id) ? tr('Added to your account', 'Adicionado à tua conta') : library?.read().installs.some(item => item.package.manifest_url === pkg.manifest_url) && pkg.snapshot_html ? tr(`Update to v${pkg.version}`, `Atualizar para v${pkg.version}`) : tr('Add to ALTARA', 'Adicionar ao ALTARA');
                if (!value) { preview?.dispose(); preview = null; host.hidden = true; copy.textContent = tr('Copy widget link', 'Copiar link do widget'); }
              });
              consent.refresh();
              refreshInstalledView = () => { if (detailAlive()) { consent.refresh(); if (surface) void refreshRatings(); } };
              body.append(consent.notice, openPreview, host);
              body.append(copy, installButton);
              if (row.author_id !== owner) body.append(button(tr('Report widget', 'Denunciar widget'), () => reportWidget(row.id, pkg.name)));
              const back = button(tr('Back', 'Voltar'), () => goBack(own ? publishedLabel : exploreLabel, () => explore(own)), 'btn ghost widgetBack');
              body.prepend(back);
              if (surface) { body.append(ratings); void refreshRatings(); }
              if (row.author_id === owner && surface !== 'marketplace') {
                body.insertBefore(button(tr('Publish update', 'Publicar atualização'), () => showTab(publishedLabel, () => updateProject(row), { widget: row.id, edit: true }), 'btn primary'), back.nextSibling);
                const lifecycle = element('section', '', 'widgetRatings'); lifecycle.append(element('h3', tr('Publication settings', 'Gerir publicação')));
                const changeStatus = async (status, target) => {
                  target.disabled = true;
                  try {
                    const { error } = await client.from('home_widget_releases').update({ status }).eq('id', row.id).eq('author_id', owner);
                    if (!detailAlive()) return; if (error) throw error;
                    showTab(publishedLabel, () => explore(true));
                  } catch { if (detailAlive()) { target.disabled = false; lifecycle.append(notice(errorText({}))); } }
                };
                lifecycle.append(notice(tr('Remove from store: stops new catalog installs; existing widgets keep working.', 'Retirar da loja: impede novas instalações pelo catálogo; quem já tem continua a usar.')));
                lifecycle.append(button(row.status === 'published' || !row.status ? tr('Remove from store', 'Retirar da loja') : tr('Publish again', 'Voltar a publicar'), event => changeStatus(row.status === 'published' || !row.status ? 'unlisted' : 'published', event.currentTarget)));
                lifecycle.append(notice(tr('Disable this version: stops its Marketplace installations on connected ALTARA apps, without deleting saved data. Direct-link copies are not affected.', 'Desativar esta versão: para as suas instalações do Marketplace nas apps ALTARA ligadas, sem apagar dados guardados. Cópias instaladas por link não são afetadas.')));
                if (row.status !== 'disabled') {
                  const confirm = element('label', '', 'widgetDisableConfirm'), check = element('input'); check.type = 'checkbox';
                  const disable = button(tr('Disable for installed users', 'Desativar para quem instalou'), event => changeStatus('disabled', event.currentTarget)); disable.disabled = true;
                  check.onchange = () => { disable.disabled = !check.checked; }; confirm.append(check, document.createTextNode(tr('I understand this stops existing installations.', 'Compreendo que isto para as instalações existentes.'))); lifecycle.append(confirm, disable);
                }
                body.append(lifecycle);
              }
              if (container) {
                const layout = element('div', '', 'widgetDetailLayout'), main = element('div', '', 'widgetDetailMain'), aside = element('aside', '', 'widgetDetailAside');
                for (const child of [...body.children]) if (child !== back) main.append(child);
                const actions = element('div', '', 'widgetMarketActions'); actions.append(installButton, openPreview, copy);
                aside.append(consent.notice, actions); if (surface) aside.append(ratings);
                layout.append(main, aside); body.append(layout);
              }
            }, { widget: row.id, history: requestedWidget === row.id ? 'none' : undefined });
          } catch (error) { if (alive()) { status.textContent = errorText(error); add.disabled = false; } }
        });
        const projectKey = `${row.author_id}:${row.manifest_url}`;
        const project = projectCards.get(projectKey);
        if (!own && project) continue;
        const actions = [add];
        if (own && row.author_id === owner && !project) actions.push(button(tr('Publish update', 'Publicar atualização'), () => showTab(publishedLabel, () => updateProject(row), { widget: row.id, edit: true }), 'btn primary'));
        const tile = card(row, actions, `${row.snapshot_sha256 ? tr('Fixed release', 'Versão fixa') : tr('External website', 'Site externo')} · v${row.version} · ${hostLabel} · ${tr('Free', 'Grátis')}`);
        if (own) tile.append(notice(row.status === 'disabled' ? tr('Disabled', 'Desativado') : row.status === 'unlisted' ? tr('Unlisted · Existing installs still work', 'Fora da loja · As instalações continuam a funcionar') : tr('Published', 'Publicado')));
        if (surface) { tile.insertBefore(creatorCard(row, social.get(row.id)), tile.lastElementChild); tile.insertBefore(stats(social.get(row.id)), tile.lastElementChild); }
        if (own && project) {
          if (!project.history) {
            project.history = element('details', '', 'widgetVersionHistory');
            project.history.append(element('summary', tr('Earlier versions', 'Versões anteriores'))); project.tile.append(project.history);
          }
          project.history.append(tile);
        } else { community.append(tile); projectCards.set(projectKey, { tile }); }
        if (website && new URLSearchParams(location.search).get('widget') === row.id) {
          if (own && new URLSearchParams(location.search).get('edit') === '1') showTab(publishedLabel, () => updateProject(row), { widget: row.id, edit: true, history: 'none' });
          else await add.onclick();
        }
      }
      if (background && alive()) {
        // Commit a changed list together, keeping the previous list visible during reads.
        const scroll = window.scrollY;
        const oldGrid = body.querySelector('.widgetMarketGrid');
        if (oldGrid) oldGrid.replaceWith(community);
        const oldStatus = body.querySelector('.widgetMarketNotice'); if (oldStatus) oldStatus.replaceWith(status);
        window.scrollTo({ top: scroll, behavior: 'instant' });
      }
    }
    function mine() {
      if (!actor) { body.append(button(tr('Sign in to see your widgets', 'Inicia sessão para ver os teus widgets'), () => requestSignIn())); return; }
      refreshInstalledView = () => { if (current()) showTab(mineLabel, mine); };
      const data = library.read(); body.append(element('h3', tr('Installed', 'Instalados')));
      const grid = element('div', '', 'widgetMarketGrid');
      for (const item of data.installs) {
        const share = item.package.kind === 'hosted' ? button(tr('Copy manifest link', 'Copiar link do manifesto'), async event => {
          const target = event.currentTarget;
          try { await navigator.clipboard.writeText(item.package.manifest_url); target.textContent = tr('Copied', 'Copiado'); }
          catch { body.append(notice(item.package.manifest_url)); }
        }) : button(tr('Export', 'Exportar'), () => download(item.package));
        const actions = [];
        if (item.package.kind === 'hosted') actions.push(button(tr('Rate widget', 'Avaliar widget'), async event => {
          const target = event.currentTarget; target.disabled = true;
          try {
            const { data, error } = await client.from('home_widget_releases').select('id,status').eq('manifest_url', item.package.manifest_url).eq('entry_url', item.package.entry_url).order('created_at', { ascending: false }).limit(20);
            if (!current() || !target.isConnected) return; if (error) throw error;
            const release = data?.find(row => row.id === item.sourceId) || data?.find(row => row.status === 'published');
            if (!release) { tile.append(notice(tr('This widget has no Marketplace listing to rate.', 'Este widget não tem uma publicação no Marketplace para avaliar.'))); target.disabled = false; return; }
            const path = `/marketplace?widget=${encodeURIComponent(release.id)}`;
            if (website) showTab(exploreLabel, explore, { widget: release.id }); else openWebsite(path);
          } catch { if (current() && target.isConnected) tile.append(notice(errorText({}))); }
          finally { if (target.isConnected) target.disabled = false; }
        }));
        if (item.sourceId) actions.push(button(tr('Report widget', 'Denunciar widget'), () => reportWidget(item.sourceId, item.package.name)));
        actions.push(share, button(tr('Uninstall', 'Desinstalar'), async event => { const target = event.currentTarget; target.disabled = true; try { await uninstall(item.id); if (current()) showTab(mineLabel, mine); } catch (error) { if (current()) { target.disabled = false; body.append(notice(error.message)); } } }));
        if (item.package.kind === 'hosted') actions.push(button(tr('Check for updates', 'Procurar atualizações'), async event => {
          const target = event.currentTarget; target.disabled = true;
          try {
            const latest = await findUpdate(item);
            if (!current() || !target.isConnected) return;
            if (!latest) { target.textContent = tr('No updates available', 'Sem atualizações disponíveis'); target.disabled = false; return; }
            await reviewUpdate(item, latest);
            target.disabled = false;
          } catch { if (target.isConnected) { target.disabled = false; tile.append(notice(errorText({}))); } }
        }));
        const tile = card(item.package, actions, item.package.kind === 'hosted' ? hostedNotice(item.package) : '');
        if (needsFixedRelease(item.package)) tile.append(notice(tr('Paused: this installation opens a live website and can change without approval. Install a fixed release through Check for updates. Your saved data is kept.', 'Em pausa: esta instalação abre um site que pode mudar sem aprovação. Instala uma versão fixa em Procurar atualizações. Os teus dados guardados mantêm-se.')));
        if (item.disabled) tile.append(notice(tr('Disabled by the creator. Your saved data is kept until you uninstall.', 'Desativado pelo criador. Os dados ficam guardados até desinstalares.')));
        grid.append(tile);
      }
      if (!data.installs.length) grid.append(notice(tr('No community widgets installed yet.', 'Ainda não tens widgets da comunidade instalados.')));
      body.append(grid);
      if (!data.drafts.length) return;
      body.append(element('h3', tr('Saved drafts from the previous editor', 'Rascunhos guardados no editor anterior')));
      const drafts = element('div', '', 'widgetMarketGrid');
      for (const item of data.drafts) drafts.append(card(item.package, [button(tr('Export source', 'Exportar código'), () => download(item.package)), button(tr('Delete draft', 'Apagar rascunho'), () => { library.removeDraft(item.id); showTab(mineLabel, mine); })]));
      if (!data.drafts.length) drafts.append(notice(tr('No legacy drafts saved.', 'Sem rascunhos antigos guardados.')));
      body.append(drafts);
    }
    function hostedNotice(pkg) {
      const origin = new URL(pkg.entry_url).origin;
      return pkg.snapshot_html ? tr(`Fixed release v${pkg.version} · Updates are your choice`, `Versão fixa v${pkg.version} · Tu escolhes quando atualizar`) : tr(`External website · Hosted by ${origin}`, `Site externo · Alojado em ${origin}`);
    }
    function updateProject(row) {
      if (!owner || row.author_id !== owner) return;
      const page = pageEpoch, alive = () => current() && page === pageEpoch;
      const newer = value => {
        if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value)) return false;
        const a = value.split('.').map(Number), b = row.version.split('.').map(Number);
        for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
        return false;
      };
      let base = validateHostedWidget({ ...row, snapshot_html: undefined, snapshot_sha256: undefined });
      let fixed, unchanged = false, accepted = false, revision = 0, busy = false;
      const latestRelease = async () => {
        const { data, error } = await client.from('home_widget_releases').select('snapshot_sha256,permissions')
          .eq('author_id', owner).eq('manifest_url', row.manifest_url).eq('kind', 'hosted')
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
        if (error || !data?.length) throw Error(tr('Could not check the latest release. Try again before publishing.', 'Não foi possível verificar a última versão. Tenta novamente antes de publicar.'));
        return data[0];
      };
      body.append(button(tr('Back', 'Voltar'), () => goBack(publishedLabel, () => explore(true)), 'btn ghost widgetBack'),
        element('h3', tr(`Update ${row.name}`, `Atualizar ${row.name}`)),
        notice(tr(`Published version: ${row.version}. Publish a new version here; existing users choose when to install it.`, `Versão publicada: ${row.version}. Publica aqui uma versão nova; quem já tem escolhe quando a instala.`)));
      const form = element('form', '', 'widgetPublishForm widgetUpdateForm');
      const field = (text, name, value, tag = 'input') => {
        const label = element('label', text), input = element(tag); input.name = name; input.value = value; input.required = true;
        label.append(input); form.append(label); return input;
      };
      const titleInput = field(tr('Title', 'Título'), 'title', row.name); titleInput.maxLength = 60;
      const description = field(tr('Description', 'Descrição'), 'description', row.description, 'textarea'); description.maxLength = 240; description.rows = 2;
      const parts = row.version.split('.').map(Number); parts[2]++;
      const version = field(tr('New version', 'Nova versão'), 'version', parts.join('.')); version.maxLength = 32;
      const notes = field(tr('What’s new', 'O que mudou'), 'releaseNotes', '', 'textarea'); notes.rows = 4; notes.minLength = 10; notes.maxLength = 2000;
      notes.placeholder = tr('Describe the changes, fixes and any changes to data use.', 'Descreve as novidades, correções e alterações ao uso de dados.');
      form.append(notice(tr('Required: 10–2,000 characters. People will read this before deciding to update.', 'Obrigatório: 10–2 000 caracteres. As pessoas vão ler este texto antes de decidir atualizar.')));
      const validNotes = () => notes.value.trim().length >= 10 && notes.value.trim().length <= 2000;
      const networkLabel = element('label', tr('Internet APIs', 'APIs de Internet')), network = element('select'); network.name = 'network'; network.setAttribute('aria-label', tr('Internet APIs', 'APIs de Internet'));
      for (const [value, label] of [['blocked', tr('Blocked (default)', 'Bloqueadas (predefinição)')], ['allowed', tr('Allow HTTPS requests', 'Permitir pedidos HTTPS')]]) { const option = element('option', label); option.value = value; network.append(option); }
      network.value = base.permissions.includes('network') ? 'allowed' : 'blocked'; networkLabel.append(network); form.append(networkLabel);
      form.append(notice(tr('Enable only if this release needs external APIs. Users see this permission before installing the update.', 'Ativa apenas se esta versão precisa de APIs externas. Os utilizadores veem esta permissão antes de instalar a atualização.')));
      const versionStatus = notice(''); form.append(versionStatus);
      const link = field(tr('Release link (.html)', 'Link da versão (.html)'), 'releaseLink', new URL('release.html', row.manifest_url).href); link.type = 'url'; link.required = false;
      const load = button(tr('Load release', 'Carregar versão'), () => prepare(async () => fetchWidgetRelease(link.value.trim(), { signal: manifestRequest.signal })));
      form.append(load, notice(tr('Use the new release.html link, or choose its file below. ALTARA saves a fixed copy of this update.', 'Usa o novo link do release.html ou escolhe o ficheiro abaixo. O ALTARA guarda uma cópia fixa desta atualização.')));
      const file = field(tr('Or choose an HTML file', 'Ou escolhe um ficheiro HTML'), 'release', ''); file.type = 'file'; file.accept = '.html,text/html'; file.required = false;
      const status = notice(''), safety = element('div'), host = element('div', '', 'widgetMarketPreview'); host.hidden = true;
      const actions = element('div', '', 'widgetMarketActions');
      const previewButton = button(tr('Preview update', 'Testar atualização'), () => {
        if (!alive() || !fixed || !accepted || !newer(version.value.trim())) return;
        host.hidden = false; preview?.dispose(); preview = mountPackage(host, { ...fixed, version: version.value.trim() });
      });
      const publish = button(tr('Publish update', 'Publicar atualização'), () => {}, 'btn primary'); publish.type = 'submit';
      actions.append(previewButton, publish); form.append(status, safety, actions, host); body.append(form);
      function refresh() {
        const valid = newer(version.value.trim());
        versionStatus.textContent = valid ? '' : tr(`Use a version higher than ${row.version}, such as ${parts.join('.')}.`, `Usa uma versão superior a ${row.version}, como ${parts.join('.')}.`);
        publish.disabled = busy || !fixed || unchanged || !valid || !validNotes(); previewButton.disabled = busy || !fixed || unchanged || !accepted || !valid;
      }
      version.oninput = refresh;
      notes.oninput = refresh;
      function invalidate() {
        revision++; manifestRequest?.abort(); fixed = null; unchanged = false; accepted = false; busy = false;
        preview?.dispose(); preview = null; host.hidden = true; safety.replaceChildren(); status.textContent = ''; load.disabled = false; refresh();
      }
      link.oninput = invalidate;
      network.onchange = () => { base = { ...base, permissions: [...base.permissions.filter(p => p !== 'network'), ...(network.value === 'allowed' ? ['network'] : [])] }; invalidate(); status.textContent = tr('Permission changed. Load the release again before publishing.', 'Permissão alterada. Carrega a versão novamente antes de publicar.'); };
      async function prepare(read) {
        invalidate(); const ticket = revision; manifestRequest = new AbortController(); load.disabled = true;
        status.textContent = tr('Loading fixed release…', 'A carregar versão fixa…');
        try {
          const [result, latest] = await Promise.all([read().then(html => createWidgetSnapshot(base, html)), latestRelease()]);
          if (!alive() || ticket !== revision) return;
          fixed = result; unchanged = sameFixedRelease(latest, result);
          status.textContent = unchanged ? unchangedText() : tr('Update ready. Publishing keeps the previous release available to installed users.', 'Atualização pronta. A versão anterior mantém-se disponível para quem a instalou.');
          if (unchanged) return;
          safety.append(safetyNotice(fixed, value => { accepted = value; if (!value) { preview?.dispose(); preview = null; host.hidden = true; } refresh(); }));
        } catch (error) { if (alive() && ticket === revision) status.textContent = error.message; }
        finally { if (alive() && ticket === revision) { load.disabled = false; refresh(); } }
      }
      file.onchange = () => prepare(async () => {
        const selected = file.files[0];
        if (!selected) throw Error(tr('Choose an HTML file.', 'Escolhe um ficheiro HTML.'));
        if (selected.size > MAX_SNAPSHOT_BYTES) throw Error(tr('The release must be at most 512 KB.', 'A versão pode ter no máximo 512 KB.'));
        return selected.text();
      });
      form.onsubmit = async event => {
        event.preventDefault(); if (!alive() || busy || !fixed || unchanged || !newer(version.value.trim()) || !validNotes()) return;
        busy = true; refresh(); load.disabled = file.disabled = link.disabled = network.disabled = true;
        try {
          const listing = validateHostedWidget({ ...fixed, version: version.value.trim(), name: titleInput.value.trim(), description: description.value.trim() });
          const latest = await latestRelease();
          if (!alive()) return;
          if (sameFixedRelease(latest, listing)) { unchanged = true; throw { code: '23514', message: 'Widget update has no code or permission changes' }; }
          // Retaining manifest/entry identity connects this release to existing
          // installs even when the uploaded HTML came from another host.
          const { error } = await client.from('home_widget_releases').insert({ author_id: owner, ...listing, release_notes: notes.value.trim() });
          if (!alive()) return; if (error) throw error;
          preview?.dispose(); preview = null;
          showTab(publishedLabel, () => { body.append(notice(tr(`Version ${listing.version} published. Users can find it in Check for updates.`, `Versão ${listing.version} publicada. Os utilizadores encontram-na em Procurar atualizações.`))); void explore(true); });
        } catch (error) {
          if (!alive()) return;
          status.textContent = error?.code === '23505' ? tr('This version is already published. Choose a higher version number.', 'Esta versão já foi publicada. Escolhe um número de versão superior.') : errorText(error);
          busy = false; load.disabled = file.disabled = link.disabled = network.disabled = false; refresh();
        }
      };
      refresh();
      // Prefill a newer version and icon from the project's manifest without
      // overwriting a field the creator has already edited, or opening its page.
      const initialVersion = version.value; let versionEdited = false;
      version.addEventListener('input', () => { versionEdited = true; });
      manifestRequest = new AbortController();
      fetchWidgetManifest(row.manifest_url, { signal: manifestRequest.signal }).then(pkg => {
        if (!alive() || revision || busy) return;
        base = { ...base, ...(pkg.icon_url ? { icon_url: pkg.icon_url } : {}) };
        if (!versionEdited && version.value === initialVersion && newer(pkg.version)) version.value = pkg.version;
        refresh();
      }).catch(() => { /* A file upload works even if the old host is unavailable. */ });
    }
    function developers(simple = false) {
      const page = pageEpoch, alive = () => current() && page === pageEpoch;
      if (!simple) {
      body.append(element('h3', tr('Build it your way', 'Cria à tua maneira')), element('p', tr('Build and test on your computer. Load your public manifest and upload a fixed release for the community.', 'Cria e testa no teu computador. Carrega o manifesto público e envia uma versão fixa para a comunidade.')));
      const links = element('div', '', 'widgetMarketActions');
      const starter = element('a', tr('Download starter project', 'Descarregar projeto inicial'), 'btn primary');
      starter.href = new URL('./widget-starter.zip', import.meta.url).href; starter.download = 'altara-widget-starter.zip';
      const guide = element('a', tr('Developer guide', 'Guia do programador'), 'btn ghost');
      guide.href = new URL('./widget-starter/README.md', import.meta.url).href; guide.download = 'ALTARA-Widgets-Guide.md';
      links.append(starter, guide); body.append(links);
      const steps = element('ol', '', 'widgetDeveloperSteps');
      for (const label of [tr('Open the starter in your editor and run npm run dev.', 'Abre o projeto no teu editor e executa npm run dev.'), tr('Paste the manifest link below. Your preview reloads when you save a file.', 'Cola o link do manifesto abaixo. O preview atualiza quando guardas um ficheiro.'), tr('To publish, load your public manifest, run npm run build and upload release.html below.', 'Para publicar, carrega o manifesto público, executa npm run build e envia o release.html abaixo.')]) steps.append(element('li', label));
      body.append(steps);
      } else {
        body.append(element('h3', tr('Have a widget link?', 'Tens um link de widget?')), element('p', tr('Paste its manifest link to preview it and add it to your home.', 'Cola o link do manifesto para veres o widget e o adicionares à tua home.')), button(tr('Explore on the website', 'Explorar no site'), () => openWebsite('/marketplace')));
      }
      body.append(notice(tr('Loading a manifest contacts the creator’s host for its description. The widget itself stays stopped until you choose to open it.', 'Carregar um manifesto contacta o alojamento do criador para obter a descrição. O widget fica parado até escolheres abri-lo.')));
      const form = element('form', '', 'widgetLinkForm'), label = element('label', tr('Manifest link', 'Link do manifesto')), input = element('input');
      input.type = 'url'; input.name = 'manifest'; input.placeholder = simple ? 'https://example.com/manifest.json' : 'http://localhost:5173/manifest.json'; input.required = true;
      label.append(input); const submit = button(tr('Load widget', 'Carregar widget'), () => {}); submit.type = 'submit';
      form.append(label, submit); const status = notice(''), details = element('div'); body.append(form, status, details);
      let requestVersion = 0;
      input.oninput = () => { requestVersion++; manifestRequest?.abort(); preview?.dispose(); preview = null; details.replaceChildren(); status.textContent = ''; submit.disabled = false; };
      form.onsubmit = async event => {
        event.preventDefault(); const request = ++requestVersion;
        manifestRequest?.abort(); manifestRequest = new AbortController();
        preview?.dispose(); preview = null; details.replaceChildren(); submit.disabled = true;
        status.textContent = tr('Loading manifest…', 'A carregar manifesto…');
        const fresh = () => alive() && request === requestVersion;
        try {
          const pkg = await fetchWidgetManifest(input.value.trim(), { development: true, signal: manifestRequest.signal });
          if (!fresh()) return;
          status.textContent = '';
          details.append(widgetIcon(pkg), element('h3', pkg.name), element('p', pkg.description), notice(hostedNotice(pkg)));
          const host = element('div', '', 'widgetMarketPreview'); host.hidden = true;
          const actions = element('div', '', 'widgetMarketActions');
          let accepted = false, testPackage = pkg;
          if (needsFixedRelease(pkg)) details.append(notice(tr('Adding saves a fixed test copy from release.html on this device. The live preview can change; published releases and account updates are managed in the Marketplace.', 'Adicionar guarda uma cópia de teste fixa de release.html neste dispositivo. O preview online pode mudar; as versões publicadas e atualizações da conta são geridas no Marketplace.')));
          const openPreview = button(tr('Open preview', 'Abrir preview'), () => { if (!fresh() || !accepted) return; host.hidden = false; preview?.dispose(); preview = mountPackage(host, pkg); });
          const addWidget = button(tr('Add widget', 'Adicionar widget'), async event => {
            if (!fresh() || !accepted) return;
            if (!actor) { requestSignIn(); return; }
            const target = event.currentTarget; target.disabled = true;
            try {
              if (needsFixedRelease(testPackage)) {
                const html = await fetchWidgetRelease(new URL('./release.html', pkg.manifest_url).href, { signal: manifestRequest.signal });
                if (!fresh()) return;
                testPackage = await createWidgetSnapshot(pkg, html);
              }
              if (!fresh() || !accepted) return;
              await install(testPackage);
              if (fresh()) { consent.refresh(); addWidget.textContent = tr('Added to home', 'Adicionado à home'); addWidget.disabled = true; }
            } catch (error) { if (fresh()) { target.disabled = false; status.textContent = error.message; } }
          });
          openPreview.disabled = true; addWidget.disabled = true;
          const consent = installNotice(pkg, value => {
            accepted = value; const fixedButton = details.querySelector('[data-fixed-preview]'); if (fixedButton) fixedButton.disabled = !value || !fixedButton.dataset.ready; openPreview.disabled = !value; addWidget.disabled = !value || !!installedPackage(testPackage);
            addWidget.textContent = installedPackage(testPackage) ? tr('Added to home', 'Adicionado à home') : tr('Add widget', 'Adicionar widget');
            if (!value) { preview?.dispose(); preview = null; host.hidden = true; }
          });
          consent.refresh(); details.append(consent.notice);
          refreshInstalledView = () => { if (fresh()) consent.refresh(); };
          actions.append(openPreview, addWidget);
          let publicPackage; try { publicPackage = validateHostedWidget(pkg); } catch { /* Localhost remains private. */ }
          let publication;
          if (publicPackage && website && !simple) {
          publication = element('form', '', 'widgetPublishForm');
          const titleLabel = element('label', tr('Title', 'Título')), titleInput = element('input'); titleInput.name = 'title'; titleInput.required = true; titleInput.maxLength = 60; titleInput.value = pkg.name; titleLabel.append(titleInput);
          const descriptionLabel = element('label', tr('Description', 'Descrição')), descriptionInput = element('textarea'); descriptionInput.name = 'description'; descriptionInput.required = true; descriptionInput.maxLength = 240; descriptionInput.rows = 3; descriptionInput.value = pkg.description; descriptionLabel.append(descriptionInput);
          publication.append(element('h3', tr('Prepare your Marketplace listing', 'Prepara a publicação no Marketplace')), titleLabel, descriptionLabel, notice(tr('Published under your ALTARA profile. ALTARA stores this fixed release; a listing is not a security endorsement.', 'Publicado com o teu perfil ALTARA. O ALTARA guarda esta versão fixa; estar no catálogo não significa que foi verificado.')));
          publication.append(notice(pkg.permissions.includes('network') ? tr('Internet APIs: HTTPS requests allowed by this manifest. Remove "network" from permissions to block them.', 'APIs de Internet: pedidos HTTPS permitidos por este manifesto. Remove "network" das permissões para os bloquear.') : tr('Internet APIs: blocked by default in the fixed release. Add "network" to manifest permissions only if needed.', 'APIs de Internet: bloqueadas por predefinição na versão fixa. Adiciona "network" às permissões do manifesto apenas se necessário.')));
          let fixedPackage;
          const fileLabel = element('label', tr('Fixed release (.html, up to 512 KB)', 'Versão fixa (.html, até 512 KB)')), fileInput = element('input');
          fileInput.type = 'file'; fileInput.name = 'release'; fileInput.accept = '.html,text/html'; fileLabel.append(fileInput);
          const releaseStatus = notice(tr('Upload one HTML file containing its scripts, styles and images. Existing installs only update when their users choose.', 'Envia um ficheiro HTML com scripts, estilos e imagens incluídos. Quem já instalou escolhe quando atualizar.'));
          const fixedPreview = button(tr('Preview fixed release', 'Testar versão fixa'), () => { if (!fresh() || !accepted || !fixedPackage) return; host.hidden = false; preview?.dispose(); preview = mountPackage(host, fixedPackage); }); fixedPreview.disabled = true; fixedPreview.dataset.fixedPreview = '';
          const publish = button(tr('Publish free', 'Publicar grátis'), () => {}, 'btn primary'); publish.type = 'submit'; publish.disabled = true;
          const releaseActions = element('div', '', 'widgetMarketActions'); releaseActions.append(fixedPreview, publish);
          publication.append(fileLabel, releaseStatus, releaseActions);
          let fileVersion = 0;
          fileInput.onchange = async () => {
            const ticket = ++fileVersion; fixedPackage = null; delete fixedPreview.dataset.ready; publish.disabled = fixedPreview.disabled = true;
            preview?.dispose(); preview = null; host.hidden = true;
            try {
              const file = fileInput.files[0]; if (!file) return;
              if (file.size > MAX_SNAPSHOT_BYTES) throw Error(tr('The release must be at most 512 KB.', 'A versão pode ter no máximo 512 KB.'));
              const result = await createWidgetSnapshot(publicPackage, await file.text());
              if (!fresh() || ticket !== fileVersion) return;
              fixedPackage = result; publish.disabled = false; fixedPreview.dataset.ready = 'true'; fixedPreview.disabled = !accepted;
              releaseStatus.textContent = tr('Fixed release ready. Test it before publishing. Remote scripts, frames, eval and WebAssembly are not supported.', 'Versão fixa pronta. Testa antes de publicar. Scripts remotos, frames, eval e WebAssembly não são suportados.');
            } catch (error) { if (fresh() && ticket === fileVersion) releaseStatus.textContent = error.message; }
          };
          publication.onsubmit = async event => {
            event.preventDefault();
            if (!fresh() || !fixedPackage) return;
            if (!actor) { requestSignIn(); return; }
            const target = publish; target.disabled = true;
            try {
              const listing = validateHostedWidget({ ...fixedPackage, name: titleInput.value.trim(), description: descriptionInput.value.trim() });
              const { error } = await client.from('home_widget_releases').insert({ author_id: owner, ...listing });
              if (!fresh()) return;
              if (error && error.code !== '23505') { status.textContent = errorText(error); target.disabled = false; }
              else {
                target.textContent = tr('Published', 'Publicado');
                status.textContent = error
                  ? tr('This version is already in the catalog. Open it to install; no need to publish again.', 'Esta versão já está no catálogo. Abre-a para instalar; não precisas de publicar novamente.')
                  : tr('Published to the catalog. Installing it on your home is a separate step; existing local widgets stay unchanged.', 'Publicado no catálogo. Instalar na tua home é um passo separado; os widgets locais existentes mantêm-se.');
                titleInput.disabled = descriptionInput.disabled = fileInput.disabled = true;
                if (surface === 'developers') { const link = element('a', tr('View in Marketplace', 'Ver no Marketplace'), 'btn ghost'); link.href = `/marketplace?creator=${encodeURIComponent(owner)}`; status.append(link); }
                else status.append(button(tr('View in catalog', 'Ver no catálogo'), () => showTab(exploreLabel, explore)));
              }
            } catch (error) { if (fresh()) { status.textContent = error.message || errorText({}); target.disabled = false; } }
          };
          }
          else if (!publicPackage) details.append(notice(tr('Local development link: you can test and use it privately. Host it online to publish.', 'Link de desenvolvimento local: podes testar e usar em privado. Coloca-o online para publicar.')));
          details.append(actions, host);
          if (publication) details.append(publication);
          if (!simple) details.append(notice(tr('Fixed releases use a self-contained HTML file. Live previews need a host that allows embedding and CORS. The SDK is optional. Sales are not enabled yet.', 'As versões fixas usam um HTML com tudo incluído. Previews online precisam de incorporação e CORS no alojamento. O SDK é opcional. As vendas ainda não estão ativas.')));
        } catch (error) { if (fresh()) status.textContent = error.message; }
        finally { if (fresh()) submit.disabled = false; }
      };
    }
    if (surface === 'developers') {
      tabs.append(button(createLabel, () => showTab(createLabel, developers)), button(publishedLabel, () => showTab(publishedLabel, () => explore(true))));
    } else if (surface === 'marketplace') {
      const themesLabel = tr('Themes · Coming soon', 'Temas · Em breve');
      tabs.append(button(exploreLabel, () => showTab(exploreLabel, explore)), button(themesLabel, () => showTab(themesLabel, () => {
        body.append(element('h3', tr('A new look is on its way.', 'Um novo visual está a chegar.')), notice(tr('Themes are not available to install yet. Explore community widgets while we build this space.', 'Ainda não é possível instalar temas. Explora os widgets da comunidade enquanto preparamos este espaço.')));
      })), button(mineLabel, () => showTab(mineLabel, mine)));
    } else if (website) {
      tabs.append(button(exploreLabel, () => showTab(exploreLabel, explore)), button(mineLabel, () => showTab(mineLabel, mine)), button(createLabel, () => showTab(createLabel, developers)));
    } else {
      tabs.append(button(addLabel, () => showTab(addLabel, () => developers(true))), button(mineLabel, () => showTab(mineLabel, mine)));
      showTab(initialTab === 'mine' ? mineLabel : addLabel, initialTab === 'mine' ? mine : () => developers(true));
    }
    if (website) {
      const restoreRoute = async (restoreScroll = false) => {
        if (!current() || location.pathname !== routeScope) return;
        const routeUrl = location.href;
        const savedScroll = history.state?.widgetNavigation?.scroll || 0;
        const view = new URLSearchParams(location.search).get('view');
        const options = { history: 'none' };
        if (surface === 'developers') {
          if (view === 'published' || new URLSearchParams(location.search).has('widget')) await showTab(publishedLabel, () => explore(true), options);
          else await showTab(createLabel, developers, options);
        } else if (view === 'installed') await showTab(mineLabel, mine, options);
        else if (view === 'themes') await showTab(tr('Themes · Coming soon', 'Temas · Em breve'), () => body.append(element('h3', tr('A new look is on its way.', 'Um novo visual está a chegar.')), notice(tr('Themes are not available to install yet.', 'Ainda não é possível instalar temas.'))), options);
        else if (initialTab === 'developers' && !surface) await showTab(createLabel, developers, options);
        else await showTab(exploreLabel, explore, options);
        if (restoreScroll && current() && location.href === routeUrl) requestAnimationFrame(() => { if (current() && location.href === routeUrl) window.scrollTo({ top: savedScroll, behavior: 'instant' }); });
      };
      if (history.state?.widgetNavigation?.scope !== routeScope) history.replaceState({ ...history.state, widgetNavigation: { scope: routeScope, depth: 0, scroll: window.scrollY } }, '', location.href);
      routeListener = () => { void restoreRoute(true); };
      globalThis.addEventListener?.('popstate', routeListener);
      void restoreRoute();
    }
    if (website && client?.channel) {
      catalogWake = () => {
        clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => {
          if (!current() || !body.querySelector('.widgetMarketGrid') || catalogRefreshing) return;
          const active = tabs.querySelector('[aria-pressed="true"]')?.textContent;
          catalogRefreshing = true;
          try {
            if (active === exploreLabel && surface !== 'developers') await explore(false, true);
            else if (active === publishedLabel) await explore(true, true);
          } finally { catalogRefreshing = false; }
        }, 100);
      };
      channel = client.channel(`home-widget-market:${owner}`).on('postgres_changes', { event: '*', schema: 'public', table: 'home_widget_releases' }, catalogWake).subscribe();
      globalThis.addEventListener?.('focus', catalogWake); catalogTimer = setInterval(catalogWake, 10000);
    }
  }
  async function findUpdate(item) {
    if (item.package.kind !== 'hosted' || item.disabled || !client?.from) return null;
    let author;
    if (item.sourceId) {
      const source = await client.from('home_widget_releases').select('author_id').eq('id', item.sourceId).single();
      if (source.error || !source.data?.author_id) throw Error('Publication unavailable');
      author = source.data.author_id;
    }
    let query = client.from('home_widget_releases').select('id,author_id,version,snapshot_sha256,permissions,manifest_url,entry_url,status')
      .eq('manifest_url', item.package.manifest_url).eq('entry_url', item.package.entry_url).eq('status', 'published');
    if (author) query = query.eq('author_id', author);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    // Legacy links have no publisher ID: never guess between different publishers.
    const rows = (data || []).filter(row => row.status === 'published' && row.manifest_url === item.package.manifest_url && row.entry_url === item.package.entry_url && (!author || row.author_id === author));
    if (!author && new Set(rows.map(row => row.author_id)).size !== 1) return null;
    const latest = rows[0];
    if (!latest?.snapshot_sha256 || sameFixedRelease(latest, item.package) || latest.id === item.sourceId) return null;
    if (item.package.snapshot_sha256) {
      const a = latest.version.split('.').map(Number), b = item.package.version.split('.').map(Number);
      const first = a.findIndex((part, i) => part !== b[i]);
      if (first < 0 || a[first] < b[first]) return null;
    }
    return latest;
  }
  function paintUpdate(host, item) {
    const latest = availableUpdates.get(item.id);
    const previous = host.querySelector(':scope > .widgetUpdateBanner');
    if (!latest) { previous?.remove(); return; }
    if (previous?.dataset.release === latest.id) return;
    previous?.remove();
    const banner = element('div', '', 'widgetUpdateBanner'); banner.dataset.release = latest.id;
    banner.append(element('span', tr(`Update available · v${latest.version}`, `Atualização disponível · v${latest.version}`)),
      button(tr('Review update', 'Ver atualização'), () => reviewUpdate(item, latest)));
    host.prepend(banner);
  }
  async function scanUpdates() {
    if (!actor || !library || !client?.from) return;
    const owner = actor, store = library;
    if (updateScan?.owner === owner) return updateScan.promise;
    if (Date.now() - lastUpdateScan < 15000) return;
    lastUpdateScan = Date.now();
    const scan = { owner };
    updateScan = scan;
    scan.promise = (async () => {
      for (const item of store.read().installs) {
        try {
          const latest = await findUpdate(item);
          if (actor !== owner || String(getUserId() || '') !== owner || library !== store) return;
          const installed = store.read().installs.find(row => row.id === item.id);
          if (!installed || installed.sourceId !== item.sourceId || installed.package.snapshot_sha256 !== item.package.snapshot_sha256) continue;
          if (latest) availableUpdates.set(item.id, latest); else availableUpdates.delete(item.id);
          for (const host of runtimes.keys()) if (host.isConnected && host.dataset.communityWidget === item.id) paintUpdate(host, installed);
        } catch { /* Keep the installed version and retry on focus or the next poll. */ }
      }
    })().finally(() => { if (updateScan === scan) updateScan = null; });
    return scan.promise;
  }
  async function reviewUpdate(item, latest) {
    updateDialog?.remove();
    const owner = actor, store = library;
    const modal = element('dialog', '', 'widgetMarket widgetUpdateDialog'); updateDialog = modal;
    modal.id = 'widgetUpdateDialog';
    modal.setAttribute('aria-label', tr('Update widget', 'Atualizar widget'));
    const header = element('header', '', 'widgetMarketHeader');
    const dismiss = () => { modal.close(); modal.remove(); if (updateDialog === modal) updateDialog = null; };
    const cancel = button(tr('Later', 'Mais tarde'), dismiss);
    header.append(element('h2', tr('Update widget', 'Atualizar widget')), cancel);
    const body = element('div', '', 'widgetMarketBody'), message = element('p', tr('Loading update…', 'A carregar atualização…'));
    message.setAttribute('role', 'status'); body.append(message); modal.append(header, body); document.body.append(modal); modal.showModal();
    modal.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    const alive = () => modal.isConnected && actor === owner && String(getUserId() || '') === owner && library === store;
    try {
      const { data, error } = await client.from('home_widget_releases').select('id,author_id,name,description,version,kind,sdkVersion,manifest_url,entry_url,permissions,icon_url,snapshot_html,snapshot_sha256,release_notes,status').eq('id', latest.id).single();
      if (!alive()) return;
      if (error || data?.status !== 'published' || data.author_id !== latest.author_id || data.manifest_url !== item.package.manifest_url || data.entry_url !== item.package.entry_url || !sameFixedRelease(data, latest)) throw Error('Update unavailable');
      const pkg = validateWidgetPackage(data);
      if (!pkg.snapshot_html) throw Error('Fixed release required');
      body.replaceChildren(element('h3', pkg.name), element('p', `v${item.package.version} → v${pkg.version}`));
      const notes = element('section', '', 'widgetReleaseNotes');
      notes.append(element('h3', tr('What’s new', 'Novidades')), element('p', data.release_notes || tr('No notes were provided for this older release.', 'Não foram fornecidas notas para esta versão antiga.')));
      body.append(notes, element('p', networkNotice(pkg, item.package), 'widgetNetworkNotice'), element('p', tr('Read the changes before updating. A new version can change how the widget behaves. Never enter passwords or payment details. The widget does not receive your ALTARA messages or account credentials.', 'Lê as novidades antes de atualizar. Uma versão nova pode mudar o comportamento do widget. Nunca introduzas passwords nem dados de pagamento. O widget não recebe as tuas mensagens nem credenciais do ALTARA.')));
      let accepted = false;
      const apply = button(tr('Install update', 'Instalar atualização'), async () => {
        if (!alive() || !accepted) return;
        apply.disabled = true; check.disabled = true;
        try {
          const current = store.read().installs.find(row => row.id === item.id);
          if (!current || current.disabled || current.sourceId !== item.sourceId || current.package.snapshot_sha256 !== item.package.snapshot_sha256) throw Error('Installation changed');
          await install(pkg, data.id);
          if (!alive()) return;
          availableUpdates.delete(item.id);
          for (const host of runtimes.keys()) if (host.dataset.communityWidget === item.id) paintUpdate(host, item);
          dismiss();
        } catch { if (alive()) { message.textContent = tr('Could not install the update. Your previous version is kept. Try again.', 'Não foi possível instalar a atualização. A versão anterior mantém-se. Tenta novamente.'); apply.disabled = false; check.disabled = false; } }
      }, 'btn primary');
      apply.disabled = true;
      const label = element('label', '', 'widgetUpdateConsent'), check = element('input'); check.type = 'checkbox';
      label.append(check, document.createTextNode(tr('I have read the changes and want to update.', 'Li as novidades e quero atualizar.')));
      check.onchange = () => { accepted = check.checked; apply.disabled = !accepted; };
      message.textContent = '';
      body.append(label, apply, message);
    } catch { if (alive()) message.textContent = tr('Could not load this update. Try again shortly.', 'Não foi possível carregar esta atualização. Tenta novamente daqui a pouco.'); }
  }
  function mount(grid) {
    sync(); const hosts = new Set(grid.querySelectorAll('[data-community-widget]'));
    for (const [host, entry] of runtimes) if (!hosts.has(host) || !host.isConnected) { entry.runtime.dispose(); runtimes.delete(host); }
    for (const host of hosts) {
      const item = installs.find(row => row.id === host.dataset.communityWidget); if (!item) continue;
      const label = host.closest('.widgetCard')?.querySelector('.widgetCard__label');
      if (label) {
        const previousIcon = label.querySelector('.widgetHeaderIcon');
        if (!previousIcon || previousIcon.dataset.iconUrl !== (item.package.icon_url || '')) {
          const icon = widgetIcon(item.package, 'widgetHeaderIcon');
          if (previousIcon) previousIcon.replaceWith(icon); else label.prepend(icon);
        }
      }
      const signature = JSON.stringify([item.package, item.disabled]);
      const previous = runtimes.get(host);
      if (previous?.signature === signature) { paintUpdate(host, item); continue; }
      previous?.runtime.dispose(); runtimes.delete(host);
      const owner = actor, store = library;
      try {
        const options = { state: store.readState(item.id), onState: value => { if (String(getUserId() || '') === owner) store.writeState(item.id, value); } };
        let runtime;
        if (item.package.kind === 'hosted') {
          const content = element('div', '', 'widgetHostedContent');
          host.replaceChildren(content);
          let running;
          runtime = { dispose() { running?.dispose(); host.replaceChildren(); } };
          if (item.disabled) host.textContent = tr('This widget has been disabled by its creator. You can uninstall it in Manage widgets.', 'Este widget foi desativado pelo criador. Podes desinstalá-lo em Gerir widgets.');
          else if (needsFixedRelease(item.package)) {
            const paused = element('div', '', 'widgetLoadStatus');
            paused.append(element('strong', tr('Fixed release required', 'Precisa de uma versão fixa')), element('p', tr('This old widget opens a live website that can change without approval. It is paused until you install a fixed release. Your saved data is kept.', 'Este widget antigo abre um site que pode mudar sem aprovação. Está em pausa até instalares uma versão fixa. Os teus dados guardados mantêm-se.')), button(tr('Manage widgets', 'Gerir widgets'), () => open('mine')));
            content.append(paused);
          } else running = mountPackage(content, item.package, options);
        } else runtime = mountPackage(host, item.package, options);
        runtimes.set(host, { runtime, signature });
        paintUpdate(host, item);
      } catch (error) { host.textContent = error.message; }
    }
    void scanUpdates();
  }
  return { sync, open, close, stop, mount, uninstall, dispose: () => { close(); stop(); clearInterval(updateTimer); globalThis.removeEventListener?.('focus', scanUpdates); updateDialog?.remove(); reportDialog?.remove(); account?.dispose(); actor = ''; library = null; }, get: id => sync().find(item => item.id === id), ids: () => sync().map(item => item.id) };
}
