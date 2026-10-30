import { createWidgetSnapshot, MAX_SNAPSHOT_BYTES } from './widgetSnapshot.js';
import { createWidgetAccount } from './widgetAccount.js';
import { createWidgetCommerce, parseWidgetEuroPrice, formatWidgetPrice, WIDGET_REFUND_POLICY_VERSION } from './widgetCommerce.js';
import { mountWidgetRefunds } from './widgetRefunds.js';
import { createWidgetPublicationDraft } from './widgetPublicationDraft.js';
import { createWidgetLibrary, validateWidgetPackage } from './widgetPackages.js';
import { mountWidgetRuntime } from './widgetRuntime.js';
import { fetchWidgetRelease, fetchWidgetManifest, validateHostedWidget, mountHostedWidget } from './widgetHosted.js';
const needsFixedRelease = pkg => pkg.kind === 'hosted' && !pkg.snapshot_html && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(pkg.entry_url).hostname);
const sameFixedRelease = (a, b) => !!a?.snapshot_sha256 && a.snapshot_sha256 === b.snapshot_sha256
  && Array.isArray(a.permissions) && Array.isArray(b.permissions)
  && a.permissions.length === b.permissions.length && a.permissions.every(permission => b.permissions.includes(permission));
const mountPackage = (host, pkg, options = {}) => pkg.kind === 'hosted' ? mountHostedWidget(host, pkg, { ...options, development: true }) : mountWidgetRuntime(host, pkg, options);

export function createWidgetMarketplace({ getUserId, client, onChange = () => {}, website = false, surface = '', container = null, requestSignIn = () => {}, openThemes, openWebsite = path => window.open(`https://altaraapp.com${path}`, '_blank', 'noopener,noreferrer') }) {
  let account, commerce, refreshInstalledView, refreshDetailView, routeListener, purchaseWake, publicationDraftCleanup, refundPanel;
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
  function installedPackage(pkg, sourceId = null) {
    return library?.read().installs.some(item => item.package.kind === pkg.kind
      && (item.sourceId || null) === sourceId
      && item.package.manifest_url === pkg.manifest_url && item.package.entry_url === pkg.entry_url
      && (item.package.snapshot_sha256 || '') === (pkg.snapshot_sha256 || '') && item.package.version === pkg.version && item.package.sdkVersion === pkg.sdkVersion
      && JSON.stringify(item.package.permissions) === JSON.stringify(pkg.permissions));
  }
  // Account installation is the approval to run on every device. Browsing a new
  // package still needs an explicit acknowledgement before preview or install.
  function installNotice(pkg, sourceId, onAccept) {
    let installed;
    const notice = safetyNotice(pkg, onAccept);
    const refresh = () => {
      const next = !!installedPackage(pkg, sourceId);
      if (next === installed && !next) { onAccept(notice.querySelector('input').checked); return; }
      installed = next; notice.hidden = next;
      if (next) notice.querySelector('dialog[open]')?.close();
      notice.querySelector('input').checked = next;
      onAccept(next);
    };
    return { notice, refresh };
  }
  function stop() { for (const entry of runtimes.values()) entry.runtime.dispose(); runtimes.clear(); }
  function close() {
    refundPanel?.dispose(); refundPanel = null;
    publicationDraftCleanup?.(); publicationDraftCleanup = null;
    refreshInstalledView = refreshDetailView = null;
    epoch++; pageEpoch++; manifestRequest?.abort(); preview?.dispose(); preview = null; clearTimeout(refreshTimer);
    clearInterval(catalogTimer); if (catalogWake) globalThis.removeEventListener?.('focus', catalogWake); catalogWake = null;
    if (routeListener) globalThis.removeEventListener?.('popstate', routeListener); routeListener = null;
    if (purchaseWake) globalThis.removeEventListener?.('focus', purchaseWake); purchaseWake = null;
    commerce?.dispose(); commerce = null;
    if (channel) { client?.removeChannel(channel); channel = null; }
    dialog?.close?.(); dialog?.remove(); dialog = null;
  }
  function sync() {
    const next = String(getUserId() || '');
    if (next !== actor) {
      close(); stop(); clearInterval(updateTimer); globalThis.removeEventListener?.('focus', scanUpdates); availableUpdates.clear(); lastUpdateScan = 0; updateDialog?.remove(); updateDialog = null; reportDialog?.remove(); reportDialog = null; account?.dispose(); account = null; actor = next; library = actor ? createWidgetLibrary(localStorage, actor) : null;
      installs = library?.read().installs || [];
      commerce = createWidgetCommerce({ client, getUserId });
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
    if (!commerce) commerce = createWidgetCommerce({ client, getUserId });
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
      refundPanel?.dispose(); refundPanel = null;
      publicationDraftCleanup?.(); publicationDraftCleanup = null;
      if (website && options.history !== 'none') {
        rememberScroll();
        const url = new URL(location.href);
        const view = label === refundLabel ? 'refunds' : label === sellerRefundLabel ? 'seller-requests' : label === publishedLabel ? 'published' : label === mineLabel ? 'installed' : label === createLabel ? 'create' : label === tr('Themes', 'Temas') ? 'themes' : '';
        if (view) url.searchParams.set('view', view); else url.searchParams.delete('view');
        if (options.widget) url.searchParams.set('widget', options.widget); else url.searchParams.delete('widget');
        if (options.edit) url.searchParams.set('edit', '1'); else url.searchParams.delete('edit');
        if (url.href !== location.href) {
          const depth = history.state?.widgetNavigation?.scope === routeScope ? history.state.widgetNavigation.depth || 0 : 0;
          history[options.replace ? 'replaceState' : 'pushState']({ ...history.state, widgetNavigation: { scope: routeScope, depth: options.replace ? depth : depth + 1, scroll: 0 } }, '', url);
        }
      }
      refreshInstalledView = refreshDetailView = null;
      if (purchaseWake) globalThis.removeEventListener?.('focus', purchaseWake); purchaseWake = null;
      commerce?.dispose(); commerce = createWidgetCommerce({ client, getUserId });
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
      : error?.code === 'purchase_required'
      ? tr('Buy this widget before opening its code or installing it.', 'Compra este widget antes de abrir o código ou o instalar.')
      : ['commerce_disabled', 'seller_not_ready', 'payments_unavailable'].includes(error?.code)
      ? tr('Paid publishing is not ready. Free publishing remains available.', 'A publicação paga ainda não está pronta. Podes continuar a publicar grátis.')
      : error?.code === 'checkout_reconciliation_required'
      ? tr('A previous checkout needs verification. Refresh the purchase status or contact support before trying another payment.', 'Uma compra anterior precisa de verificação. Atualiza o estado da compra ou contacta o apoio antes de tentares outro pagamento.')
      : error?.code === 'seller_reconciliation_required'
      ? tr('A previous Stripe setup needs verification. Contact support before starting another seller connection.', 'Uma configuração anterior do Stripe precisa de verificação. Contacta o apoio antes de iniciares outra ligação de vendedor.')
      : error?.code === 'checkout_pending'
      ? tr('Your payment is still being confirmed. Refresh the purchase status before starting another payment.', 'O teu pagamento ainda está a ser confirmado. Atualiza o estado da compra antes de iniciares outro pagamento.')
      : ['checkout_expired', 'checkout_closed'].includes(error?.code)
      ? tr('This checkout expired or is no longer active. Refresh this widget to confirm the price before starting another payment.', 'Este pagamento expirou ou já não está ativo. Atualiza o widget para confirmar o preço antes de iniciares outro pagamento.')
      : error?.code === 'offer_changed'
      ? tr('A newer release or price is available. Refresh this widget before buying.', 'Existe uma versão ou um preço mais recente. Atualiza este widget antes de comprar.')
      : error?.code === 'unavailable'
      ? tr('This widget is not available for purchase. Refresh its details to check its status.', 'Este widget não está disponível para compra. Atualiza os detalhes para verificar o estado.')
      : error?.code === 'seller_country_conflict'
      ? tr('The country of this seller account cannot be changed here. Contact support if it is incorrect.', 'O país desta conta de vendedor não pode ser alterado aqui. Contacta o apoio se estiver incorreto.')
      : error?.code === 'seller_country_unavailable'
      ? tr('Paid widget sales are not available in your country yet. Free publishing remains available.', 'As vendas de widgets ainda não estão disponíveis no teu país. Podes continuar a publicar grátis.')
      : error?.code === 'invalid_price'
      ? tr('Use a EUR price from 0.50 to 1,000, with up to two decimal places.', 'Usa um preço em EUR de 0,50 a 1 000, com até duas casas decimais.')
      : tr('Could not complete this action. Check your connection and try again.', 'Não foi possível concluir. Verifica a ligação e tenta novamente.');
    function notice(text) { const el = element('p', text, 'widgetMarketNotice'); el.setAttribute('role', 'status'); return el; }
    function purchaseRights() {
      const section = element('section', '', 'widgetPurchaseRights');
      section.append(notice(tr('You buy a licence to use this widget, not its copyright. ALTARA saves the fixed version you install. Removing it from the store keeps that version available to buyers; later published versions are optional updates.', 'Compras uma licença para usar este widget, não os seus direitos de autor. O ALTARA guarda a versão fixa que instalas. Retirá-lo da loja mantém essa versão disponível para os compradores; versões publicadas depois são atualizações opcionais.')));
      section.append(notice(tr('Access can be paused for security, refunds or payment disputes. External services can stop working. Deleting a creator account can remove hosted access. Access still depends on ALTARA; this is not a guarantee of permanent offline ownership.', 'O acesso pode ser suspenso por segurança, reembolsos ou disputas de pagamento. Serviços externos podem deixar de funcionar. Apagar a conta do criador pode remover o acesso alojado. O acesso continua a depender do ALTARA; isto não garante uma cópia tua para sempre e sem Internet.')));
      return section;
    }
    const priceLabel = row => formatWidgetPrice(Number(row.price_cents || 0), row.currency || 'eur', document.documentElement.lang || 'en');
    const isPaid = row => Number(row.price_cents || 0) > 0;
    const marketplaceUrl = releaseId => new URL(`/marketplace?widget=${encodeURIComponent(releaseId)}`, website ? location.origin : 'https://altaraapp.com').href;
    function paidHostingNotice() {
      const section = element('section', '', 'widgetPaidHostingNotice'); section.dataset.widgetPaidHostingWarning = '';
      section.append(element('strong', tr('Protect your paid files', 'Protege os ficheiros pagos')),
        element('p', tr('Files on GitHub Pages or other public hosts can be opened or copied without buying. Uploading to ALTARA protects its account delivery; it does not make your website or repository private.', 'Os ficheiros no GitHub Pages ou noutros alojamentos públicos podem ser abertos ou copiados sem comprar. O ALTARA protege a entrega à conta; enviar o ficheiro não torna o teu site nem o repositório privados.')),
        element('p', tr('No free version or demo is required. Publish only a manifest, icon and informational page; upload the complete paid widget privately to ALTARA.', 'Não precisas de uma versão gratuita nem de uma demo. Publica apenas o manifesto, o ícone e uma página informativa; envia o widget pago completo em privado para o ALTARA.')));
      const details = element('details'), steps = element('ol');
      details.append(element('summary', tr('How to publish a paid widget safely', 'Como publicar um widget pago com cuidado')));
      for (const text of [
        tr('Keep the full paid HTML, JavaScript and source repository on your computer or in private storage.', 'Mantém o HTML, o JavaScript e o repositório completos da versão paga no teu computador ou num armazenamento privado.'),
        tr('Host the public manifest, icon and an informational entry page with the description and purchase information, without the paid widget code. A separate limited demo is optional.', 'Aloja o manifesto público, o ícone e uma página de entrada informativa com a descrição e informação de compra, sem o código do widget pago. Uma demo limitada separada é opcional.'),
        tr('Build locally and upload release.html directly using the file picker in ALTARA. Do not publish the full paid dist folder, index.html, release.html or JavaScript bundles on GitHub Pages, Netlify or another public host.', 'Cria a versão no teu computador e envia o release.html diretamente pelo seletor de ficheiros do ALTARA. Não publiques a pasta dist paga completa, o index.html, o release.html nem os bundles JavaScript no GitHub Pages, Netlify ou noutro alojamento público.'),
        tr('If you already made the paid code public, review your host and repository and replace it with the informational page. Public history, caches or copies may still retain it; ALTARA does not remove those files for you.', 'Se já tornaste o código pago público, revê o alojamento e o repositório e substitui-o pela página informativa. O histórico público, caches ou cópias podem conservá-lo; o ALTARA não remove esses ficheiros por ti.')
      ]) steps.append(element('li', text));
      details.append(steps, element('p', tr('Share the Marketplace link: each account needs its own purchase or creator access. Buyers receive HTML in their browser and can copy it; this is access control, not copy protection.', 'Partilha o link do Marketplace: cada conta precisa da sua compra ou do acesso de criador. Os compradores recebem HTML no navegador e podem copiá-lo; o controlo de acesso não impede essa cópia.')));
      section.append(details); return section;
    }
    function pricingControls(form, row, alive, changed, draftOptions = {}) {
      const api = commerce, section = element('section', '', 'widgetCommercePanel');
      const label = element('label', tr('Price', 'Preço'), 'widgetPublishField'), kind = element('select'); kind.name = 'priceKind';
      kind.setAttribute('aria-label', tr('Price', 'Preço'));
      for (const [value, text] of [['free', tr('Free', 'Grátis')], ['paid', tr('One-time purchase', 'Compra única')]]) { const option = element('option', text); option.value = value; kind.append(option); }
      kind.value = isPaid(row) ? 'paid' : 'free'; label.append(kind);
      const amountLabel = element('label', tr('Price in EUR', 'Preço em EUR'), 'widgetPublishField'), amount = element('input');
      amount.name = 'priceEUR'; amount.type = 'text'; amount.inputMode = 'decimal'; amount.maxLength = 12;
      amount.setAttribute('aria-label', tr('Price in EUR', 'Preço em EUR'));
      amount.placeholder = '2.00';
      amount.value = isPaid(row) ? (Number(row.price_cents) / 100).toFixed(2) : '2.00'; amountLabel.append(amount);
      const countryLabel = element('label', tr('Country of your seller account', 'País da tua conta de vendedor'), 'widgetSellerCountry'), country = element('select'); country.name = 'sellerCountry'; country.setAttribute('aria-label', tr('Country of your seller account', 'País da tua conta de vendedor')); countryLabel.append(country); countryLabel.hidden = true;
      const status = notice(tr('Checking payment availability…', 'A verificar disponibilidade dos pagamentos…'));
      status.classList.add('widgetSellerStatus');
      const priceHelp = notice(tr('You can prepare your price now. Selling requires verified Stripe setup and enabled ALTARA payments.', 'Podes preparar o preço agora. Vender exige a verificação Stripe e os pagamentos ALTARA ativos.'));
      const hostingNotice = paidHostingNotice();
      priceHelp.classList.add('widgetPriceHelp');
      priceHelp.id = `widget-price-help-${generation}-${pageEpoch}`; amount.setAttribute('aria-describedby', priceHelp.id);
      const countriesHelp = notice(''); countriesHelp.classList.add('widgetSellerAvailability');
      const connect = button(tr('Connect Stripe account', 'Ligar conta Stripe'), async () => {
        if (!alive() || verified?.onboarding_available !== true || busy || !(verified.seller?.country || verified.supported_countries?.includes(country.value))) return;
        if (!website) { openWebsite('/developers/widgets'); return; }
        busy = true; connect.disabled = true;
        draftOptions.onboardingBusy?.(true);
        try {
          if (draftOptions.beforeOnboard && !skipDraftOnce && await draftOptions.beforeOnboard() === false) {
            if (!alive()) return;
            busy = false; draftOptions.onboardingBusy?.(false); paint();
            status.textContent = tr('The draft could not be saved on this device. Stay here to keep your work, or continue without saving.', 'Não foi possível guardar o rascunho neste dispositivo. Fica aqui para manter o trabalho, ou continua sem o guardar.');
            status.append(button(tr('Continue to Stripe without saving', 'Continuar para o Stripe sem guardar'), () => { skipDraftOnce = true; connect.click(); }));
            return;
          }
          skipDraftOnce = false;
          if (!alive()) return;
          const result = await api.onboard(verified.seller?.country ? undefined : country.value); if (alive()) location.assign(result.url);
        }
        catch (error) { if (alive()) { status.textContent = errorText(error); busy = false; draftOptions.onboardingBusy?.(false); paint(); } }
      });
      const feeDetails = element('details', '', 'widgetPricingDetails');
      feeDetails.append(element('summary', tr('Purchases, updates and fees', 'Compras, atualizações e taxas')),
        notice(tr('A purchase covers this widget project and future versions. Installation and each update still need the buyer’s choice. Stripe processing fees are paid by the creator.', 'A compra cobre este projeto e versões futuras. A instalação e cada atualização continuam a ser escolha de quem compra. As taxas de processamento Stripe ficam a cargo do criador.')));
      section.append(element('h4', tr('Free or paid', 'Grátis ou pago')), label, amountLabel,
        notice(tr('EUR 0.50–1,000 · up to two decimal places. The price belongs to this immutable release.', 'EUR 0,50–1 000 · até duas casas decimais. O preço pertence a esta versão imutável.')),
        priceHelp, hostingNotice, countryLabel, countriesHelp, status, connect,
        notice(tr('Use your actual country of residence. It cannot be changed here after Stripe setup starts. Stripe collects identity and bank details on its own website. ALTARA+ is not required.', 'Usa o teu país de residência real. Não pode ser alterado aqui depois de iniciares a configuração Stripe. O Stripe recolhe a identidade e os dados bancários no seu site. Não precisas de ALTARA+.')), feeDetails);
      form.append(section);
      let verified = null, busy = false, locked = false, proposedCountry = '', skipDraftOnce = false;
      const price = () => kind.value === 'paid' ? parseWidgetEuroPrice(amount.value) : 0;
      function paint(notify = true) {
        amountLabel.hidden = kind.value !== 'paid'; kind.disabled = locked; amount.disabled = locked;
        priceHelp.hidden = kind.value !== 'paid';
        hostingNotice.hidden = kind.value !== 'paid';
        let invalid = false; try { price(); } catch { invalid = true; }
        amount.setAttribute('aria-invalid', String(kind.value === 'paid' && invalid));
        priceHelp.textContent = invalid
          ? tr('Enter EUR 0.50–1,000 with no more than two decimal places, for example 0.50.', 'Introduz EUR 0,50–1 000, com no máximo duas casas decimais, por exemplo 0,50.')
          : tr('You can prepare your price now. Selling requires verified Stripe setup and enabled ALTARA payments.', 'Podes preparar o preço agora. Vender exige a verificação Stripe e os pagamentos ALTARA ativos.');
        priceHelp.classList.toggle('isInvalid', invalid);
        countryLabel.hidden = verified?.onboarding_available !== true || verified.seller?.ready === true;
        country.disabled = locked || busy || !!verified?.seller?.country;
        connect.hidden = verified?.onboarding_available !== true || verified?.seller?.ready === true;
        // App button display rules can override the hidden attribute.
        connect.style.display = connect.hidden ? 'none' : '';
        connect.disabled = locked || busy || verified?.onboarding_available !== true || verified?.seller?.ready === true || !(verified?.seller?.country || verified?.supported_countries?.includes(country.value));
        if (notify) changed();
      }
      kind.onchange = amount.oninput = () => { paint(); draftOptions.onChange?.(); };
      country.onchange = () => { proposedCountry = country.value; paint(); draftOptions.onChange?.(); };
      async function check() {
        try {
          const result = await api.status(); if (!alive()) return;
          verified = result;
          country.replaceChildren();
          const choose = element('option', tr('Choose your country', 'Escolhe o teu país')); choose.value = ''; country.append(choose);
          for (const code of result.supported_countries || []) { let name = code; try { name = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }).of(code) || code; } catch { /* Region codes remain readable without Intl.DisplayNames. */ } const option = element('option', `${name} (${code})`); option.value = code; country.append(option); }
          const supported = [...country.options].filter(option => option.value);
          countriesHelp.textContent = supported.length > 3
            ? tr(`Seller setup is currently available in ${supported.length} countries. Choose your country from the list. Free publishing does not require a seller account.`, `A configuração de vendedor está disponível em ${supported.length} países. Escolhe o teu país na lista. Publicar grátis não exige uma conta de vendedor.`)
            : supported.length
            ? tr(`Seller setup is currently available in: ${supported.map(option => option.textContent).join(', ')}. Other countries are not enabled on ALTARA yet. Free publishing does not require a seller account.`, `A configuração de vendedor está disponível em: ${supported.map(option => option.textContent).join(', ')}. Os outros países ainda não estão ativos no ALTARA. Publicar grátis não exige uma conta de vendedor.`)
            : tr('No seller countries are available right now. You can still prepare a price or publish free.', 'Não há países de vendedor disponíveis neste momento. Podes preparar um preço ou publicar grátis.');
          if (result.seller?.country) { if (!country.querySelector(`option[value="${result.seller.country}"]`)) { const reserved = element('option', result.seller.country); reserved.value = result.seller.country; country.append(reserved); } country.value = result.seller.country; }
          else if (result.supported_countries?.includes(proposedCountry)) country.value = proposedCountry;
          status.textContent = !result.enabled
            ? result.onboarding_available
              ? result.seller?.ready
                ? tr('Stripe verification is complete. Payments are not enabled yet; paid publishing stays unavailable.', 'A verificação Stripe está concluída. Os pagamentos ainda não estão ativos; a publicação paga continua indisponível.')
                : tr('Payments are not enabled yet. You can connect Stripe and complete its verification; paid publishing stays unavailable.', 'Os pagamentos ainda não estão ativos. Podes ligar o Stripe e concluir a verificação; a publicação paga continua indisponível.')
              : tr('Payments are not enabled yet. Publish free, or return when selling is available.', 'Os pagamentos ainda não estão ativos. Publica grátis ou volta quando as vendas estiverem disponíveis.')
            : result.seller?.ready
            ? tr(`Ready to sell · ${result.environment === 'test' ? 'Test payments' : 'Live payments'} · ALTARA commission ${result.commission_bps / 100}% · Stripe fees paid by you.`, `Pronto para vender · ${result.environment === 'test' ? 'Pagamentos de teste' : 'Pagamentos reais'} · Comissão ALTARA ${result.commission_bps / 100}% · Taxas Stripe a teu cargo.`)
            : tr('Connect Stripe and complete its verification before publishing a paid widget.', 'Liga a conta Stripe e conclui a verificação antes de publicar um widget pago.');
        } catch { if (alive()) status.textContent = tr('Payment availability could not be checked. Free publishing still works.', 'Não foi possível verificar os pagamentos. A publicação gratuita continua disponível.'); }
        if (alive()) paint();
      }
      paint(false); if (owner) void check(); else { status.textContent = tr('Sign in to publish. Free publication does not need Stripe.', 'Inicia sessão para publicar. Publicar grátis não precisa de Stripe.'); connect.hidden = true; }
      return { section, valid() { if (kind.value !== 'paid') return true; try { return !!verified?.enabled && [100, 500].includes(verified.commission_bps) && verified.seller?.ready === true && Number.isInteger(price()); } catch { return false; } },
        fields() { if (kind.value !== 'paid') return {}; if (!this.valid()) throw Error(tr('Complete Stripe verification and choose a valid EUR price before publishing.', 'Conclui a verificação Stripe e escolhe um preço válido em EUR antes de publicar.')); return { price_cents: price(), currency: 'eur' }; },
        paid() { return kind.value === 'paid'; }, cents() { try { return price(); } catch { return -1; } }, disable(value) { locked = value; paint(); },
        draft() { return { priceKind: kind.value, priceEUR: amount.value, sellerCountry: verified?.seller?.country || proposedCountry || country.value }; },
        restore(value) {
          kind.value = value.priceKind === 'paid' ? 'paid' : 'free'; amount.value = value.priceEUR;
          proposedCountry = value.sellerCountry || '';
          if (!verified?.seller?.country && verified?.supported_countries?.includes(proposedCountry)) country.value = proposedCountry;
          paint(false);
        } };
    }
    function unpaidDetail(row, social, own) {
      const page = pageEpoch, api = commerce, alive = () => current() && page === pageEpoch;
      const back = button(tr('Back', 'Voltar'), () => goBack(own ? publishedLabel : exploreLabel, () => explore(own)), 'btn ghost widgetBack');
      const status = notice(tr('The widget code stays locked until your purchase is confirmed.', 'O código do widget fica bloqueado até a compra ser confirmada.'));
      body.append(back, widgetIcon(row), element('h3', row.name), element('p', row.description), creatorCard(row, social.get(row.id)),
        element('p', `${priceLabel(row)} · ${tr('One-time purchase', 'Compra única')}`, 'widgetCommercePrice'),
        notice(tr('One payment gives access to this widget project and later published versions. Buying does not install or run it. You choose installation and each update separately.', 'Um pagamento dá acesso a este projeto e às versões publicadas depois. Comprar não instala nem executa o widget. Tu escolhes a instalação e cada atualização.')), purchaseRights(), status);
      const policy = element('section', '', 'widgetSafetyNotice widgetRefundPolicy');
      policy.append(element('h4', tr('Before you buy', 'Antes de comprar')), notice(tr('Widget policy: request withdrawal within 14 days of payment, without a mandatory reason. Installation or use does not by itself refuse the request. Problems, non-conformity and other applicable rights can be raised later. Sending a request records your declaration; it does not automatically issue a refund. Save your confirmation in Help & refunds.', 'Política dos widgets: pede a livre resolução nos 14 dias após o pagamento, sem motivo obrigatório. Instalar ou usar não é, por si só, motivo de recusa. Problemas, falta de conformidade e outros direitos aplicáveis podem ser comunicados depois. Enviar um pedido regista a declaração; não executa automaticamente um reembolso. Guarda a confirmação em Ajuda e reembolsos.')));
      policy.append(button(tr('Read the full refund policy', 'Ler a política completa de reembolsos'), () => openWebsite('/widget-refunds')));
      const policyLabel = element('label'), policyRead = element('input'); policyRead.type = 'checkbox'; policyRead.name = 'refundPolicyRead';
      policyLabel.append(policyRead, document.createTextNode(tr('I have read the purchase and refund information. This does not waive my rights.', 'Li a informação sobre a compra e os reembolsos. Isto não retira os meus direitos.'))); policy.append(policyLabel); body.append(policy);
      let busy = false, refreshing = false, checkoutRevision = 0, keepCheckoutMessage = false;
      const paintPurchaseControls = () => { buy.disabled = busy || (website && !policyRead.checked); policyRead.disabled = busy; retry.disabled = busy || refreshing; };
      policyRead.onchange = paintPurchaseControls;
      const refresh = async (options = {}) => {
        if (!alive() || busy || refreshing || !actor) return;
        const automatic = options.automatic === true, revision = checkoutRevision;
        refreshing = true;
        if (!automatic) { busy = true; keepCheckoutMessage = false; }
        paintPurchaseControls();
        if (!automatic || !keepCheckoutMessage) status.textContent = tr('Checking your purchase…', 'A verificar a tua compra…');
        try {
          const result = await api.purchase(row.id);
          // Focus checks remain in the background. An explicit checkout owns
          // the current feedback and must not be overwritten by an older read.
          if (!alive() || revision !== checkoutRevision) return;
          if (result.purchased) { showTab(exploreLabel, explore, { widget: row.id, history: 'none' }); return; }
          if (automatic && keepCheckoutMessage) return;
          status.textContent = result.order?.status === 'pending'
            ? tr('Payment confirmation is pending. Refresh after Stripe finishes processing; nothing is installed.', 'A confirmação do pagamento está pendente. Atualiza quando o Stripe terminar; nada foi instalado.')
            : result.order?.status === 'disputed'
              ? tr('This payment is disputed. Access to this widget is paused. Refresh its status or contact support before starting another payment.', 'Este pagamento está em disputa. O acesso a este widget está em pausa. Atualiza o estado ou contacta o apoio antes de iniciares outro pagamento.')
              : result.order?.status === 'failed'
                ? tr('This payment does not give access to this widget. Refresh its status or contact support.', 'Este pagamento não dá acesso a este widget. Atualiza o estado ou contacta o apoio.')
                : tr('No confirmed purchase yet. You can buy it or refresh the purchase status.', 'Ainda não existe uma compra confirmada. Podes comprar ou atualizar o estado.');
        } catch (error) { if (alive() && revision === checkoutRevision && (!automatic || !keepCheckoutMessage)) status.textContent = errorText(error); }
        finally { if (alive()) { refreshing = false; if (!automatic) busy = false; paintPurchaseControls(); } }
      };
      const buy = button(`${tr('Buy', 'Comprar')} · ${priceLabel(row)}`, async () => {
        if (!alive() || busy || (website && !policyRead.checked)) return;
        if (!actor) { requestSignIn(row.id); return; }
        if (!website) { openWebsite(`/marketplace?widget=${encodeURIComponent(row.id)}&buy=1`); return; }
        busy = true; checkoutRevision++; keepCheckoutMessage = true; paintPurchaseControls();
        status.textContent = tr('Preparing secure checkout…', 'A preparar pagamento seguro…');
        try {
          const result = await api.checkout(row.id, { refundPolicyVersion: WIDGET_REFUND_POLICY_VERSION }); if (!alive()) return;
          if (result.purchased) { showTab(exploreLabel, explore, { widget: row.id, history: 'none' }); return; }
          status.textContent = tr('Confirm your purchase on Stripe. Return here to check its status.', 'Confirma a compra no Stripe. Volta aqui para verificar o estado.');
          location.assign(result.url);
        } catch (error) { if (alive()) status.textContent = errorText(error); }
        finally { if (alive()) { busy = false; paintPurchaseControls(); } }
      }, 'btn primary');
      const retry = button(tr('Refresh purchase', 'Atualizar compra'), refresh);
      retry.hidden = !actor;
      body.append(buy, retry, button(refundLabel, () => showTab(refundLabel, () => refunds('buyer'))), button(tr('Report widget', 'Denunciar widget'), () => reportWidget(row.id, row.name))); paintPurchaseControls();
      purchaseWake = () => { if (alive()) void refresh({ automatic: true }); }; globalThis.addEventListener?.('focus', purchaseWake);
      const returnQuery = new URLSearchParams(location.search);
      if (website && actor && (returnQuery.has('payment') || (returnQuery.get('widget') === row.id && ['returned', 'cancelled'].includes(returnQuery.get('widget_checkout'))))) void refresh();
    }
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
      if (!library?.read().installs.some(item => item.accountId && item.package.manifest_url === pkg.manifest_url
        && (item.sourceAuthorId === row.author_id || (item.sourceId === row.id && item.package.kind === pkg.kind && item.package.entry_url === pkg.entry_url)))) {
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
        const data = await commerce.catalog({ own, creatorId: creator || undefined, releaseId: requestedWidget || undefined });
        result = { data };
      }
      catch (error) { result = { error }; }
      if (!alive()) return;
      if (result.error) { if (background) return; status.textContent = errorText(result.error); status.append(button(tr('Try again', 'Tentar novamente'), () => showTab(exploreLabel, explore))); return; }
      const social = await socialDetails(result.data); if (!alive()) return;
      const signature = JSON.stringify([own, creator, result.data, [...social]]);
      if (background && signature === catalogSignature) return;
      catalogSignature = signature;
      status.textContent = result.data.length ? tr('Free and one-time purchases · Latest releases', 'Grátis e compras únicas · Últimas versões') : tr('No published widgets here yet.', 'Ainda não existem widgets publicados aqui.');
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
        const add = button(own ? tr('Manage publication', 'Gerir publicação') : isPaid(row) && !row.purchased && row.author_id !== owner ? tr('Details & purchase', 'Detalhes e compra') : tr('Preview & install', 'Ver e instalar'), async () => {
          add.disabled = true;
          try {
            if (isPaid(row) && !row.purchased && row.author_id !== owner) {
              showTab(exploreLabel, () => unpaidDetail(row, social, own), { widget: row.id, history: requestedWidget === row.id ? 'none' : undefined });
              return;
            }
            const data = await commerce.release(row.id);
            if (!alive()) return;
            const pkg = validateWidgetPackage(data);
            showTab(own ? publishedLabel : exploreLabel, () => {
              const detailPage = pageEpoch, detailAlive = () => current() && detailPage === pageEpoch;
              body.append(widgetIcon(pkg), element('h3', pkg.name), element('p', pkg.description), notice(pkg.kind === 'hosted' ? hostedNotice(pkg) : tr('Legacy local widget.', 'Widget local da versão anterior.')));
              const ownership = element('p', '', 'widgetCommercePrice');
              const refreshOwnership = () => { ownership.textContent = `${priceLabel(row)} · ${row.author_id === owner ? tr('Your paid widget', 'O teu widget pago') : row.purchased ? tr('Purchased · Installation is your choice', 'Comprado · Tu escolhes a instalação') : tr('Access paused or purchase required', 'Acesso suspenso ou compra necessária')}`; };
              if (isPaid(row)) { refreshOwnership(); body.append(ownership, purchaseRights()); }
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
              let unavailable = row.status && row.status !== 'published' && !(row.status === 'unlisted' && row.purchased === true);
              if (liveRelease) body.append(notice(tr('This older listing opens a live website. The creator must publish a fixed release before it can be installed. Live previews are for testing only.', 'Esta publicação antiga abre um site que pode mudar. O criador precisa de publicar uma versão fixa para ser instalada. O preview online serve apenas para testes.')));
              if (unavailable) body.append(notice(row.status === 'disabled' ? isPaid(row) ? tr('Access to this paid version is paused.', 'O acesso a esta versão paga está suspenso.') : tr('Disabled by the creator.', 'Desativado pelo criador.') : tr('No longer listed. Existing installations can still run.', 'Retirado da loja. As instalações existentes continuam a funcionar.')));
              const host = element('div', '', 'widgetMarketPreview'); host.hidden = true;
              host.setAttribute('role', 'region'); host.setAttribute('aria-label', tr('Widget preview', 'Preview do widget')); host.tabIndex = -1;
              let accepted = false, openingPreview = false, previewRevision = 0, detailBlocked = row.status === 'disabled', detailChecking = false, reviewRequired = false;
              const accessStatus = notice(''); accessStatus.hidden = true;
              const reviewedPackage = JSON.stringify({ ...pkg, snapshot_html: undefined });
              const openPreview = button(tr('Open preview', 'Abrir preview'), async () => {
                if (!detailAlive() || !accepted || detailBlocked || openingPreview) return;
                const revision = ++previewRevision, api = commerce;
                openingPreview = true; openPreview.disabled = true;
                try {
                  // A previously delivered package is not current authorization.
                  const freshData = await api.release(row.id);
                  if (!detailAlive() || !accepted || revision !== previewRevision) return;
                  const fresh = validateWidgetPackage(freshData);
                  if (freshData.author_id !== row.author_id || freshData.status === 'disabled') {
                    invalidatePreview(tr('This widget is unavailable or your access is paused.', 'Este widget está indisponível ou o teu acesso está suspenso.'), true); return;
                  }
                  if (JSON.stringify({ ...fresh, snapshot_html: undefined }) !== reviewedPackage) {
                    invalidatePreview(tr('This release changed. Open its details again and review it before continuing.', 'Esta versão mudou. Abre os detalhes novamente e revê-a antes de continuar.'), true, false); return;
                  }
                  host.hidden = false; preview?.dispose(); preview = mountPackage(host, fresh, { onRetry: () => openPreview.onclick() });
                  // The preview is in the main column, away from the action sidebar.
                  host.scrollIntoView({ block: 'nearest', inline: 'nearest' }); host.focus({ preventScroll: true });
                  accessStatus.hidden = true;
                } catch (error) {
                  if (detailAlive() && revision === previewRevision) invalidatePreview(errorText(error), ['purchase_required', 'unavailable', 'sign_in_required'].includes(error?.code));
                } finally {
                  if (detailAlive() && revision === previewRevision) { openingPreview = false; consent.refresh(); }
                }
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
                const link = marketplaceUrl(row.id);
                try { await navigator.clipboard.writeText(link); if (detailAlive() && accepted) copy.textContent = tr('Copied', 'Copiado'); }
                catch { if (detailAlive() && accepted) body.append(notice(link)); }
              });
              const consent = installNotice(pkg, row.id, value => {
                if (accepted !== value) { previewRevision++; openingPreview = false; }
                accepted = value; openPreview.disabled = !value || detailBlocked || openingPreview; installButton.disabled = !value || detailBlocked || unavailable || liveRelease || !!installedPackage(pkg, row.id);
                copy.disabled = !value;
                installButton.textContent = liveRelease ? tr('Fixed release required', 'Precisa de versão fixa') : installedPackage(pkg, row.id) ? tr('Added to your account', 'Adicionado à tua conta') : library?.read().installs.some(item => item.sourceAuthorId && item.sourceAuthorId === row.author_id && item.package.manifest_url === pkg.manifest_url) && pkg.snapshot_html ? tr(`Update to v${pkg.version}`, `Atualizar para v${pkg.version}`) : tr('Add to ALTARA', 'Adicionar ao ALTARA');
                if (!value) { preview?.dispose(); preview = null; host.hidden = true; copy.textContent = tr('Copy widget link', 'Copiar link do widget'); }
              });
              function invalidatePreview(message, blocked = false, accessLost = blocked) {
                if (!detailAlive()) return;
                previewRevision++; openingPreview = false; detailBlocked = blocked;
                if (blocked && !accessLost) reviewRequired = true;
                preview?.dispose(); preview = null; host.hidden = true;
                if (accessLost && row.author_id !== owner) { row.purchased = false; refreshOwnership(); }
                accessStatus.textContent = message; accessStatus.hidden = !message;
                consent.refresh();
              }
              refreshDetailView = async () => {
                if (!detailAlive() || detailChecking) return;
                detailChecking = true;
                const revision = previewRevision;
                try {
                  const rows = await commerce.catalog({ releaseId: row.id });
                  if (!detailAlive()) return;
                  const next = rows.find(item => item.id === row.id && item.author_id === row.author_id);
                  if (!next || next.status === 'disabled' || (isPaid(next) && next.author_id !== owner && !next.purchased)) {
                    invalidatePreview(tr('This widget is unavailable or your access is paused.', 'Este widget está indisponível ou o teu acesso está suspenso.'), true); return;
                  }
                  if (revision !== previewRevision) return;
                  row.status = next.status; row.purchased = next.purchased;
                  detailBlocked = reviewRequired;
                  if (!reviewRequired) accessStatus.hidden = true;
                  unavailable = row.status && row.status !== 'published' && !(row.status === 'unlisted' && row.purchased === true);
                  if (isPaid(row)) refreshOwnership();
                  consent.refresh();
                } catch { /* Keep the last known state; starting a preview still requires a fresh authorized release. */ }
                finally { detailChecking = false; }
              };
              consent.refresh();
              refreshInstalledView = () => {
                if (!detailAlive()) return;
                previewRevision++; openingPreview = false;
                if (library?.read().installs.some(item => item.sourceId === row.id && item.sourceAuthorId === row.author_id && item.package.manifest_url === pkg.manifest_url && item.disabled)) invalidatePreview(tr('This widget is unavailable or your access is paused.', 'Este widget está indisponível ou o teu acesso está suspenso.'), true);
                consent.refresh(); void refreshDetailView?.(); if (surface) void refreshRatings();
              };
              body.append(consent.notice, openPreview, host, accessStatus);
              body.append(copy, installButton);
              if (isPaid(row)) body.append(button(row.author_id === owner ? sellerRefundLabel : refundLabel, () => showTab(row.author_id === owner ? sellerRefundLabel : refundLabel, () => refunds(row.author_id === owner ? 'seller' : 'buyer'))));
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
                const paid = isPaid(row);
                if (paid && row.status === 'disabled') {
                  lifecycle.append(notice(tr('This paid version is paused. Only ALTARA administrators can review and restore access; publishing again cannot bypass the pause.', 'Esta versão paga está suspensa. Só a administração do ALTARA pode rever e repor o acesso; voltar a publicar não permite contornar a suspensão.')));
                } else {
                  lifecycle.append(notice(paid
                    ? tr('Remove from store: stops new catalog sales. Buyers keep access to the fixed version for installation and reinstallation. Security and payment restrictions still apply.', 'Retirar da loja: impede novas vendas pelo catálogo. Os compradores mantêm acesso à versão fixa para instalar e reinstalar. Continuam a aplicar-se as restrições de segurança e pagamento.')
                    : tr('Remove from store: stops new catalog installs; existing widgets keep working.', 'Retirar da loja: impede novas instalações pelo catálogo; quem já tem continua a usar.')));
                  lifecycle.append(button(row.status === 'published' || !row.status ? tr('Remove from store', 'Retirar da loja') : tr('Publish again', 'Voltar a publicar'), event => changeStatus(row.status === 'published' || !row.status ? 'unlisted' : 'published', event.currentTarget)));
                }
                if (!paid) lifecycle.append(notice(tr('Disable this version: stops its Marketplace installations on connected ALTARA apps, without deleting saved data. Direct-link copies are not affected.', 'Desativar esta versão: para as suas instalações do Marketplace nas apps ALTARA ligadas, sem apagar dados guardados. Cópias instaladas por link não são afetadas.')));
                if (!paid && row.status !== 'disabled') {
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
        const tile = card(row, actions, `${row.snapshot_sha256 ? tr('Fixed release', 'Versão fixa') : tr('External website', 'Site externo')} · v${row.version} · ${hostLabel} · ${priceLabel(row)}${row.purchased ? ` · ${tr('Purchased', 'Comprado')}` : ''}`);
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
      const data = library.read(); body.append(button(refundLabel, () => showTab(refundLabel, () => refunds('buyer'))), button(sellerRefundLabel, () => showTab(sellerRefundLabel, () => refunds('seller'))), element('h3', tr('Installed', 'Instalados')));
      const grid = element('div', '', 'widgetMarketGrid');
      for (const item of data.installs) {
        const shareLink = item.sourceId ? marketplaceUrl(item.sourceId) : item.package.manifest_url;
        const share = item.package.kind === 'hosted' ? button(item.sourceId ? tr('Copy Marketplace link', 'Copiar link do Marketplace') : tr('Copy manifest link', 'Copiar link do manifesto'), async event => {
          const target = event.currentTarget;
          try { await navigator.clipboard.writeText(shareLink); if (current() && target.isConnected) target.textContent = tr('Copied', 'Copiado'); }
          catch { if (current() && target.isConnected) body.append(notice(shareLink)); }
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
        const byline = item.package.kind === 'hosted' ? item.disabled
          ? tr(`Unavailable or access paused · v${item.package.version}`, `Indisponível ou acesso em pausa · v${item.package.version}`)
          : hostedNotice(item.package) : '';
        const tile = card(item.package, actions, byline);
        if (!item.disabled && needsFixedRelease(item.package)) tile.append(notice(tr('Paused: this installation opens a live website and can change without approval. Install a fixed release through Check for updates. Your saved data is kept.', 'Em pausa: esta instalação abre um site que pode mudar sem aprovação. Instala uma versão fixa em Procurar atualizações. Os teus dados guardados mantêm-se.')));
        if (item.disabled) tile.append(notice(tr('This widget is unavailable or your access is paused. Your saved data is kept. Manage widgets to check its status.', 'Este widget está indisponível ou o teu acesso está em pausa. Os teus dados guardados são conservados. Consulta o estado em Gerir widgets.')));
        grid.append(tile);
      }
      if (!data.installs.length) grid.append(notice(tr('No community widgets installed yet.', 'Ainda não tens widgets da comunidade instalados.')));
      body.append(grid);
      const purchased = element('section', '', 'widgetPurchasedLibrary'), purchasedGrid = element('div', '', 'widgetMarketGrid');
      const purchaseStatus = notice(tr('Checking your purchases…', 'A verificar as tuas compras…'));
      purchased.append(element('h3', tr('Purchased · Not installed', 'Comprados · Por instalar')), purchaseStatus, purchasedGrid); body.append(purchased);
      const page = pageEpoch, api = commerce, alive = () => current() && pageEpoch === page;
      const projects = new Set(); let purchaseOffset = 0, loadingPurchases = false;
      const morePurchases = button(tr('Load more purchases', 'Carregar mais compras'), loadPurchases); morePurchases.hidden = true; purchased.append(morePurchases);
      async function loadPurchases() {
        if (!alive() || loadingPurchases) return;
        loadingPurchases = true; morePurchases.disabled = true;
        try {
          const rows = await api.purchases({ limit: 50, offset: purchaseOffset }); if (!alive()) return;
          purchaseOffset += rows.length;
          for (const row of rows) {
            const project = `${row.author_id}|${row.manifest_url}`;
            if (!row.purchased || projects.has(project)) continue; projects.add(project);
            if (row.installed) continue;
            const review = button(row.status === 'disabled' ? tr('Not available', 'Indisponível') : tr('Review & install', 'Ver e instalar'), () => showTab(exploreLabel, explore, { widget: row.id })); review.disabled = row.status === 'disabled';
            const tile = card(row, [review, button(refundLabel, () => showTab(refundLabel, () => refunds('buyer'))), button(tr('Report widget', 'Denunciar widget'), () => reportWidget(row.id, row.name))], `${tr('Purchased', 'Comprado')} · v${row.version} · ${priceLabel(row)}`);
            if (row.status === 'unlisted') tile.append(notice(tr('Unlisted · Your purchase still gives access.', 'Fora da loja · A tua compra continua a dar acesso.')));
            if (row.status === 'disabled') tile.append(notice(tr('This widget is unavailable. Your purchase record is kept; it cannot be installed or opened.', 'Este widget está indisponível. O registo da compra é conservado; não pode ser instalado nem aberto.')));
            purchasedGrid.append(tile);
          }
          morePurchases.hidden = rows.length < 50;
          purchaseStatus.textContent = purchasedGrid.childElementCount
            ? tr('Your purchases are kept with your account. Available widgets still need your approval before installation.', 'As tuas compras são conservadas na conta. Os widgets disponíveis continuam a precisar da tua aprovação antes de instalar.')
            : !morePurchases.hidden
            ? tr('These purchases are installed. Load more to check the next page.', 'Estas compras estão instaladas. Carrega mais para ver a página seguinte.')
            : tr('No purchased widgets waiting to be installed.', 'Não tens widgets comprados por instalar.');
        } catch (error) { if (alive()) { purchaseStatus.textContent = errorText(error); morePurchases.hidden = false; } }
        finally { if (alive()) { loadingPurchases = false; morePurchases.disabled = false; } }
      }
      void loadPurchases();
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
      let fixed, unchanged = false, accepted = false, revision = 0, busy = false, latestPrice = Number(row.price_cents || 0);
      const latestRelease = async () => {
        const rows = await commerce.catalog({ own: true });
        const latest = rows.find(item => item.manifest_url === row.manifest_url && item.author_id === owner);
        if (!latest) throw Error(tr('Could not check the latest release. Try again before publishing.', 'Não foi possível verificar a última versão. Tenta novamente antes de publicar.'));
        return latest;
      };
      body.append(button(tr('Back', 'Voltar'), () => goBack(publishedLabel, () => explore(true)), 'btn ghost widgetBack'),
        element('h3', tr(`Update ${row.name}`, `Atualizar ${row.name}`)),
        notice(tr(`Published version: ${row.version}. Publish a new version here; existing users choose when to install it.`, `Versão publicada: ${row.version}. Publica aqui uma versão nova; quem já tem escolhe quando a instala.`)));
      const updateGuide = element('a', tr('Publishing and updates guide', 'Guia de publicação e atualizações'), 'btn ghost');
      updateGuide.href = new URL('./widget-starter/README.md', import.meta.url).href; updateGuide.download = 'ALTARA-Widgets-Guide.md';
      body.append(updateGuide);
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
      form.append(notice(tr('Build the updated widget locally and choose its HTML file below. For paid widgets, keep the complete file private; use a release link only for code you intend to make public.', 'Cria a versão atualizada no teu computador e escolhe o ficheiro HTML abaixo. Para widgets pagos, mantém o ficheiro completo privado; usa um link de versão apenas para código que queres tornar público.')));
      const link = field(tr('Release link (.html)', 'Link da versão (.html)'), 'releaseLink', new URL('release.html', row.manifest_url).href); link.type = 'url'; link.required = false;
      const load = button(tr('Load release', 'Carregar versão'), () => prepare(async () => fetchWidgetRelease(link.value.trim(), { signal: manifestRequest.signal })));
      form.append(load, notice(tr('ALTARA saves a fixed copy under this same project. Changing GitHub or your website alone does not publish an ALTARA update. Existing buyers do not pay again for future versions.', 'O ALTARA guarda uma cópia fixa neste mesmo projeto. Alterar apenas o GitHub ou o teu site não publica uma atualização no ALTARA. Quem já comprou não paga novamente pelas versões futuras.')));
      const file = field(tr('Or choose an HTML file', 'Ou escolhe um ficheiro HTML'), 'release', ''); file.type = 'file'; file.accept = '.html,text/html'; file.required = false;
      const status = notice(''), safety = element('div'), host = element('div', '', 'widgetMarketPreview'); host.hidden = true;
      const actions = element('div', '', 'widgetMarketActions');
      const previewButton = button(tr('Preview update', 'Testar atualização'), () => {
        if (!alive() || !fixed || !accepted || !newer(version.value.trim())) return;
        host.hidden = false; preview?.dispose(); preview = mountPackage(host, { ...fixed, version: version.value.trim() });
      });
      const publish = button(tr('Publish update', 'Publicar atualização'), () => {}, 'btn primary'); publish.type = 'submit';
      actions.append(previewButton, publish); form.append(status, safety, actions, host); body.append(form);
      const pricing = pricingControls(form, row, alive, refresh); form.insertBefore(pricing.section, status);
      function refresh() {
        const valid = newer(version.value.trim());
        const priceChanged = pricing.cents() >= 0 && pricing.cents() !== latestPrice;
        versionStatus.textContent = valid ? '' : tr(`Use a version higher than ${row.version}, such as ${parts.join('.')}.`, `Usa uma versão superior a ${row.version}, como ${parts.join('.')}.`);
        publish.disabled = busy || !fixed || (unchanged && !priceChanged) || !valid || !validNotes() || !pricing.valid(); previewButton.disabled = busy || !fixed || (unchanged && !priceChanged) || !accepted || !valid;
        if (fixed && unchanged && !busy) status.textContent = priceChanged
          ? tr('Price change ready. Publish a new version; existing buyers keep access to future versions.', 'Alteração de preço pronta. Publica uma nova versão; quem já comprou mantém acesso a versões futuras.')
          : unchangedText();
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
          fixed = result; unchanged = sameFixedRelease(latest, result); latestPrice = Number(latest.price_cents || 0);
          status.textContent = unchanged ? unchangedText() : tr('Update ready. Publishing keeps the previous release available to installed users.', 'Atualização pronta. A versão anterior mantém-se disponível para quem a instalou.');
          if (unchanged && pricing.cents() === latestPrice) return;
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
        event.preventDefault(); if (!alive() || busy || !fixed || (unchanged && pricing.cents() === latestPrice) || !newer(version.value.trim()) || !validNotes() || !pricing.valid()) return;
        busy = true; refresh(); load.disabled = file.disabled = link.disabled = network.disabled = true;
        pricing.disable(true);
        try {
          const listing = validateHostedWidget({ ...fixed, version: version.value.trim(), name: titleInput.value.trim(), description: description.value.trim() });
          const latest = await latestRelease();
          if (!alive()) return;
          const priceFields = pricing.fields();
          if (sameFixedRelease(latest, listing) && Number(latest.price_cents || 0) === Number(priceFields.price_cents || 0)) { unchanged = true; throw { code: '23514', message: 'Widget update has no code or permission changes' }; }
          // Retaining manifest/entry identity connects this release to existing
          // installs even when the uploaded HTML came from another host.
          const { error } = await client.from('home_widget_releases').insert({ author_id: owner, ...listing, ...priceFields, release_notes: notes.value.trim() });
          if (!alive()) return; if (error) throw error;
          preview?.dispose(); preview = null;
          showTab(publishedLabel, () => { body.append(notice(tr(`Version ${listing.version} published. Users can find it in Check for updates.`, `Versão ${listing.version} publicada. Os utilizadores encontram-na em Procurar atualizações.`))); void explore(true); });
        } catch (error) {
          if (!alive()) return;
          status.textContent = error?.code === '23505' ? tr('This version is already published. Choose a higher version number.', 'Esta versão já foi publicada. Escolhe um número de versão superior.') : errorText(error);
          busy = false; pricing.disable(false); load.disabled = file.disabled = link.disabled = network.disabled = false; refresh();
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
      let requestVersion = 0, draftStore, draftFields, draftTimer, draftRevision = 0, draftDirty = false, draftFinished = false, restoreCandidate, restoringDraft;
      const draftBox = element('section', '', 'widgetSafety'), draftMessage = notice(''), draftActions = element('div', '', 'widgetMarketActions');
      draftBox.dataset.widgetPublicationDraft = ''; draftBox.setAttribute('aria-label', tr('Publication draft', 'Rascunho da publicação'));
      draftMessage.setAttribute('role', 'status'); draftMessage.setAttribute('aria-live', 'polite'); draftMessage.setAttribute('aria-atomic', 'true');
      const restoreDraft = button(tr('Restore draft', 'Restaurar rascunho'), async () => {
        if (!alive() || !restoreCandidate) return;
        const saved = restoreCandidate; restoreCandidate = null; restoringDraft = saved;
        restoreDraft.hidden = true; input.value = saved.manifestUrl;
        await form.onsubmit({ preventDefault() {} });
      }); restoreDraft.hidden = true;
      const discardDraft = button(tr('Discard draft', 'Descartar rascunho'), async () => {
        if (!alive() || !draftStore) return;
        clearTimeout(draftTimer); draftRevision++; draftDirty = false; restoreCandidate = restoringDraft = null; draftFields = null;
        requestVersion++; manifestRequest?.abort(); preview?.dispose(); preview = null;
        details.replaceChildren(); input.value = ''; status.textContent = ''; submit.disabled = false; restoreDraft.hidden = true;
        const removed = await draftStore.remove(); if (!alive()) return;
        draftBox.dataset.widgetDraftState = removed ? 'empty' : 'unavailable';
        draftMessage.textContent = removed ? tr('Draft discarded from this device.', 'Rascunho descartado deste dispositivo.') : tr('The draft could not be removed from this device. Try again before leaving.', 'Não foi possível remover o rascunho deste dispositivo. Tenta novamente antes de sair.');
        discardDraft.hidden = removed; input.focus();
      }); discardDraft.hidden = true;
      draftActions.append(restoreDraft, discardDraft); draftBox.append(draftMessage, draftActions);
      const hasDraft = website && !simple && !!owner;
      if (hasDraft) {
        form.before(draftBox);
        draftMessage.textContent = tr('Your draft and uploaded code are saved only on this device for 24 hours. Previews always need your approval.', 'O rascunho e o código enviado ficam guardados só neste dispositivo durante 24 horas. Os previews precisam sempre da tua aprovação.');
        try {
          const environment = location.protocol === 'https:' && ['altaraapp.com', 'www.altaraapp.com', 'app.altaraapp.com'].includes(location.hostname) ? 'production' : 'development';
          draftStore = createWidgetPublicationDraft({ userId: owner, origin: location.origin, context: `${surface || 'widgets'}:${location.pathname}`, environment });
          void draftStore.read().then(result => {
            if (!alive() || draftRevision || draftFinished) return;
            draftBox.dataset.widgetDraftState = result.state === 'saved' ? 'restorable' : result.state;
            if (result.state === 'saved') {
              restoreCandidate = result.draft; restoreDraft.hidden = discardDraft.hidden = false;
              draftMessage.textContent = tr('A draft is saved on this device for up to 24 hours. Restore it to continue; previews remain stopped and access approval is requested again.', 'Há um rascunho guardado neste dispositivo durante até 24 horas. Restaura-o para continuar; os previews ficam parados e o acesso precisa novamente da tua aprovação.');
            } else if (result.state === 'expired') draftMessage.textContent = tr('The previous draft expired after 24 hours and was removed from this device.', 'O rascunho anterior expirou ao fim de 24 horas e foi removido deste dispositivo.');
            else if (result.state === 'invalid') draftMessage.textContent = tr('The saved draft was invalid and was removed. Prepare a new draft below.', 'O rascunho guardado era inválido e foi removido. Prepara um novo rascunho abaixo.');
            else if (result.state === 'unavailable') draftMessage.textContent = tr('Draft saving is unavailable on this device. Keep this page open to preserve your work.', 'Não é possível guardar rascunhos neste dispositivo. Mantém esta página aberta para preservar o trabalho.');
          });
        } catch {
          draftMessage.textContent = tr('Draft saving is unavailable on this device. Keep this page open to preserve your work.', 'Não é possível guardar rascunhos neste dispositivo. Mantém esta página aberta para preservar o trabalho.'); draftBox.dataset.widgetDraftState = 'unavailable';
        }
        const leaving = () => { void flushDraft(); };
        globalThis.addEventListener?.('pagehide', leaving); globalThis.addEventListener?.('beforeunload', leaving);
        publicationDraftCleanup = () => {
          clearTimeout(draftTimer); void flushDraft();
          globalThis.removeEventListener?.('pagehide', leaving); globalThis.removeEventListener?.('beforeunload', leaving);
          draftStore?.dispose();
        };
      }
      function queueDraft() {
        if (!draftStore || !alive() || draftFinished) return;
        draftDirty = true; draftRevision++; restoreCandidate = null; restoreDraft.hidden = true; discardDraft.hidden = false;
        clearTimeout(draftTimer); draftTimer = setTimeout(() => { void flushDraft(); }, 250);
      }
      async function flushDraft() {
        clearTimeout(draftTimer);
        if (!draftStore) return !hasDraft;
        if (!alive() || draftFinished || !draftDirty) return true;
        const revision = draftRevision, value = restoringDraft || { manifestUrl: input.value, title: '', description: '', priceKind: 'free', priceEUR: '2.00', sellerCountry: '', releaseHtml: '', releaseName: '', ...draftFields?.() };
        const saved = await draftStore.write(value);
        if (!alive() || revision !== draftRevision || draftFinished) return saved;
        if (saved) draftDirty = false;
        draftBox.dataset.widgetDraftState = saved ? 'saved' : 'unavailable';
        draftMessage.textContent = saved
          ? tr('Draft saved on this device for 24 hours, including your uploaded code. It is not published; previews need approval again after restoring.', 'Rascunho guardado neste dispositivo durante 24 horas, incluindo o código enviado. Não foi publicado; os previews precisam novamente de aprovação depois de restaurar.')
          : tr('The draft could not be saved on this device. Keep this page open to preserve your work.', 'Não foi possível guardar o rascunho neste dispositivo. Mantém esta página aberta para preservar o trabalho.');
        return saved;
      }
      function onboardingBusy(value) {
        // The first durable save and the account-link request form one handoff.
        // Keep the displayed preparation stable until navigation or an error.
        form.inert = details.inert = draftBox.inert = value;
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        status.textContent = value ? tr('Saving your draft and opening Stripe…', 'A guardar o rascunho e a abrir o Stripe…') : '';
      }
      input.oninput = () => { requestVersion++; manifestRequest?.abort(); preview?.dispose(); preview = null; details.replaceChildren(); draftFields = null; status.textContent = ''; submit.disabled = false; queueDraft(); };
      form.onsubmit = async event => {
        event.preventDefault(); const request = ++requestVersion;
        const restored = restoringDraft; draftFields = null;
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
          let fixedHost;
          const actions = element('div', '', 'widgetMarketActions');
          let accepted = false, testPackage = pkg;
          if (needsFixedRelease(pkg)) details.append(notice(tr('Adding saves a fixed test copy from release.html on this device. The live preview can change; published releases and account updates are managed in the Marketplace.', 'Adicionar guarda uma cópia de teste fixa de release.html neste dispositivo. O preview online pode mudar; as versões publicadas e atualizações da conta são geridas no Marketplace.')));
          const openPreview = button(tr('Open preview', 'Abrir preview'), () => { if (!fresh() || !accepted) return; host.hidden = false; if (fixedHost) fixedHost.hidden = true; preview?.dispose(); preview = mountPackage(host, pkg); });
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
          const acceptAccess = value => {
            accepted = value; const fixedButton = details.querySelector('[data-fixed-preview]'); if (fixedButton) fixedButton.disabled = !value || !fixedButton.dataset.ready; openPreview.disabled = !value; addWidget.disabled = !value || !!installedPackage(testPackage);
            addWidget.textContent = installedPackage(testPackage) ? tr('Added to home', 'Adicionado à home') : tr('Add widget', 'Adicionar widget');
            if (!value) { preview?.dispose(); preview = null; host.hidden = true; if (fixedHost) fixedHost.hidden = true; }
          };
          let consent;
          if (restored) {
            const notice = safetyNotice(pkg, acceptAccess);
            consent = { notice, refresh: () => acceptAccess(notice.querySelector('input').checked) };
          } else consent = installNotice(pkg, null, acceptAccess);
          consent.refresh(); details.append(consent.notice);
          refreshInstalledView = () => { if (fresh()) consent.refresh(); };
          actions.append(openPreview, addWidget);
          let publicPackage; try { publicPackage = validateHostedWidget(pkg); } catch { /* Localhost remains private. */ }
          let publication;
          if (publicPackage && website && !simple) {
          publication = element('form', '', 'widgetPublishForm widgetPublicationStudio');
          const publicationHeader = element('header', '', 'widgetPublicationHeader');
          publicationHeader.append(element('span', tr('READY FOR THE COMMUNITY', 'PRONTO PARA A COMUNIDADE'), 'widgetPublishEyebrow'), element('h3', tr('Prepare your Marketplace listing', 'Prepara a publicação no Marketplace')), element('p', tr('Prepare the details, test the fixed release, then choose how to share it.', 'Prepara os detalhes, testa a versão fixa e escolhe como a partilhar.')));
          publication.append(publicationHeader);
          const publicationStep = (number, title, description) => {
            const step = element('section', '', 'widgetPublicationStep'), header = element('header', '', 'widgetPublicationStepHeader'), copy = element('div');
            copy.append(element('h4', title), element('p', description));
            header.append(element('span', number, 'widgetPublicationStepNumber'), copy); step.append(header); publication.append(step); return step;
          };
          const listingStep = publicationStep('01', tr('Your listing', 'A tua publicação'), tr('These details appear on your Marketplace page.', 'Estes detalhes aparecem na tua página do Marketplace.'));
          const titleLabel = element('label', tr('Title', 'Título')), titleInput = element('input'); titleInput.name = 'title'; titleInput.required = true; titleInput.maxLength = 60; titleInput.value = pkg.name; titleLabel.append(titleInput);
          const descriptionLabel = element('label', tr('Description', 'Descrição')), descriptionInput = element('textarea'); descriptionInput.name = 'description'; descriptionInput.required = true; descriptionInput.maxLength = 240; descriptionInput.rows = 3; descriptionInput.value = pkg.description; descriptionLabel.append(descriptionInput);
          if (restored) { titleInput.value = restored.title; descriptionInput.value = restored.description; }
          titleInput.oninput = descriptionInput.oninput = queueDraft;
          listingStep.append(titleLabel, descriptionLabel, notice(tr('Published under your ALTARA profile. ALTARA stores this fixed release; a listing is not a security endorsement.', 'Publicado com o teu perfil ALTARA. O ALTARA guarda esta versão fixa; estar no catálogo não significa que foi verificado.')));
          const releaseStep = publicationStep('02', tr('Upload and test', 'Enviar e testar'), tr('Use release.html from your build. This is the fixed version buyers will receive, separate from the live preview above.', 'Usa o release.html do teu projeto. Esta é a versão fixa que os compradores vão receber, separada do preview online acima.'));
          let fixedPackage, releaseName = '', releaseRead;
          const fileLabel = element('label', tr('Fixed release (.html, up to 512 KB)', 'Versão fixa (.html, até 512 KB)'), 'widgetReleaseUpload'), fileInput = element('input');
          fileInput.type = 'file'; fileInput.name = 'release'; fileInput.accept = '.html,text/html'; fileLabel.append(fileInput);
          const releaseStatus = notice(tr('Upload one HTML file containing its scripts, styles and images. Existing installs only update when their users choose.', 'Envia um ficheiro HTML com scripts, estilos e imagens incluídos. Quem já instalou escolhe quando atualizar.'));
          releaseStatus.classList.add('widgetReleaseStatus');
          const previewHelp = notice(tr('Accept the access notice above to open the preview. Uploading does not run or publish your code.', 'Aceita o aviso de acesso acima para abrir o preview. Enviar o ficheiro não executa nem publica o código.'));
          fixedHost = element('div', '', 'widgetMarketPreview widgetFixedReleasePreview'); fixedHost.hidden = true;
          const fixedPreview = button(tr('Preview fixed release', 'Testar versão fixa'), () => { if (!fresh() || !accepted || !fixedPackage) return; host.hidden = true; fixedHost.hidden = false; preview?.dispose(); preview = mountPackage(fixedHost, fixedPackage); }); fixedPreview.disabled = true; fixedPreview.dataset.fixedPreview = '';
          const publish = button(tr('Publish free', 'Publicar grátis'), () => {}, 'btn primary'); publish.type = 'submit'; publish.disabled = true;
          const releaseActions = element('div', '', 'widgetMarketActions'); releaseActions.append(fixedPreview);
          releaseStep.append(fileLabel, releaseStatus, releaseActions, fixedHost, previewHelp,
            notice(pkg.permissions.includes('network') ? tr('Internet APIs: HTTPS requests allowed by this manifest. Remove "network" from permissions to block them.', 'APIs de Internet: pedidos HTTPS permitidos por este manifesto. Remove "network" das permissões para os bloquear.') : tr('Internet APIs: blocked by default in the fixed release. Add "network" to manifest permissions only if needed.', 'APIs de Internet: bloqueadas por predefinição na versão fixa. Adiciona "network" às permissões do manifesto apenas se necessário.')));
          let publishing = false;
          const pricingStep = publicationStep('03', tr('Price and seller', 'Preço e vendedor'), tr('Free widgets do not need Stripe. For paid widgets, you can prepare a price while seller verification is in progress.', 'Os widgets grátis não precisam de Stripe. Para widgets pagos, podes preparar o preço enquanto a verificação do vendedor está em curso.'));
          const pricing = pricingControls(pricingStep, {}, fresh, refreshPublication, { onChange: queueDraft, onboardingBusy, beforeOnboard: async () => { while (releaseRead) await releaseRead; return flushDraft(); } });
          if (restored) pricing.restore(restored);
          draftFields = () => ({ title: titleInput.value, description: descriptionInput.value, ...pricing.draft(), releaseHtml: fixedPackage?.snapshot_html || '', releaseName });
          const publishFooter = element('footer', '', 'widgetPublicationFooter'), publishSummary = notice('');
          publishFooter.append(publishSummary, publish); publication.append(publishFooter);
          function refreshPublication() {
            publish.disabled = publishing || !fixedPackage || !pricing.valid();
            if (!publishing) publish.textContent = pricing.paid() ? tr('Publish paid', 'Publicar pago') : tr('Publish free', 'Publicar grátis');
            if (publishing) publishSummary.textContent = tr('Publishing this fixed release…', 'A publicar esta versão fixa…');
            else if (!fixedPackage) publishSummary.textContent = tr('Choose release.html in step 02 before publishing.', 'Escolhe o release.html no passo 02 antes de publicar.');
            else if (pricing.paid() && !pricing.valid()) publishSummary.textContent = tr('Paid publication is locked. Check the price and seller status in step 03; your uploaded release stays here.', 'A publicação paga está bloqueada. Verifica o preço e o estado do vendedor no passo 03; a versão enviada mantém-se aqui.');
            else publishSummary.textContent = pricing.paid()
              ? tr(`Ready to publish · ${formatWidgetPrice(pricing.cents(), 'eur', document.documentElement.lang || 'en')} · one-time purchase`, `Pronto para publicar · ${formatWidgetPrice(pricing.cents(), 'eur', document.documentElement.lang || 'pt')} · compra única`)
              : tr('Ready to publish free. Publishing does not install the widget on your home.', 'Pronto para publicar grátis. Publicar não instala o widget na tua home.');
          }
          refreshPublication();
          let fileVersion = 0;
          fileInput.onchange = async () => {
            let finishRead; const completion = new Promise(resolve => { finishRead = resolve; }); releaseRead = completion;
            const ticket = ++fileVersion; fixedPackage = null; releaseName = ''; delete fixedPreview.dataset.ready; publish.disabled = fixedPreview.disabled = true;
            preview?.dispose(); preview = null; host.hidden = fixedHost.hidden = true; releaseStep.classList.remove('isReady'); refreshPublication();
            queueDraft();
            try {
              const file = fileInput.files[0]; if (!file) return;
              if (file.size > MAX_SNAPSHOT_BYTES) throw Error(tr('The release must be at most 512 KB.', 'A versão pode ter no máximo 512 KB.'));
              const result = await createWidgetSnapshot(publicPackage, await file.text());
              if (!fresh() || ticket !== fileVersion) return;
              fixedPackage = result; releaseName = file.name.slice(0, 128); refreshPublication(); fixedPreview.dataset.ready = 'true'; fixedPreview.disabled = !accepted;
              releaseStep.classList.add('isReady');
              releaseStatus.textContent = tr('Fixed release ready. Test it before publishing. Remote scripts, frames, eval and WebAssembly are not supported.', 'Versão fixa pronta. Testa antes de publicar. Scripts remotos, frames, eval e WebAssembly não são suportados.');
              queueDraft();
            } catch (error) { if (fresh() && ticket === fileVersion) releaseStatus.textContent = error.message; }
            finally { finishRead(); if (releaseRead === completion) releaseRead = null; }
          };
          if (restored?.releaseHtml) {
            try {
              const result = await createWidgetSnapshot(publicPackage, restored.releaseHtml);
              if (!fresh()) return;
              fixedPackage = result; releaseName = restored.releaseName || 'release.html';
              fixedPreview.dataset.ready = 'true'; fixedPreview.disabled = true; releaseStep.classList.add('isReady');
              releaseStatus.textContent = tr(`Restored ${releaseName} from this device. Test it again before publishing. The file picker stays empty; choose a file only to replace this code.`, `${releaseName} restaurado deste dispositivo. Testa novamente antes de publicar. O seletor fica vazio; escolhe um ficheiro apenas para substituir este código.`);
              refreshPublication();
            } catch (error) {
              if (fresh()) releaseStatus.textContent = tr('The saved HTML failed validation. Choose release.html again. ', 'O HTML guardado não passou a validação. Escolhe novamente o release.html. ') + error.message;
            }
          }
          publication.onsubmit = async event => {
            event.preventDefault();
            if (!fresh() || !fixedPackage || publishing || !pricing.valid()) return;
            if (!actor) { requestSignIn(); return; }
            const target = publish; publishing = true; target.disabled = true; pricing.disable(true);
            try {
              const listing = validateHostedWidget({ ...fixedPackage, name: titleInput.value.trim(), description: descriptionInput.value.trim() });
              const priceFields = pricing.fields();
              const { error } = await client.from('home_widget_releases').insert({ author_id: owner, ...listing, ...priceFields });
              if (!fresh()) return;
              if (error && error.code !== '23505') { status.textContent = errorText(error); publishing = false; pricing.disable(false); refreshPublication(); }
              else {
                draftFinished = true; draftDirty = false; clearTimeout(draftTimer); restoreCandidate = null;
                restoreDraft.hidden = discardDraft.hidden = true;
                if (draftStore) void draftStore.remove().then(removed => {
                  if (!fresh()) return;
                  draftBox.dataset.widgetDraftState = removed ? 'empty' : 'unavailable';
                  draftMessage.textContent = removed ? tr('Published. The local preparation draft was removed.', 'Publicado. O rascunho local de preparação foi removido.') : tr('Published, but the local draft could not be removed. Discard it from this device.', 'Publicado, mas não foi possível remover o rascunho local. Descarta-o deste dispositivo.');
                  discardDraft.hidden = removed;
                });
                target.textContent = tr('Published', 'Publicado');
                publishSummary.textContent = tr('Your fixed release is published.', 'A tua versão fixa está publicada.');
                status.textContent = error
                  ? tr('This version is already in the catalog. Open it to install; no need to publish again.', 'Esta versão já está no catálogo. Abre-a para instalar; não precisas de publicar novamente.')
                  : tr('Published to the catalog. Installing it on your home is a separate step; existing local widgets stay unchanged.', 'Publicado no catálogo. Instalar na tua home é um passo separado; os widgets locais existentes mantêm-se.');
                titleInput.disabled = descriptionInput.disabled = fileInput.disabled = true;
                if (surface === 'developers') { const link = element('a', tr('View in Marketplace', 'Ver no Marketplace'), 'btn ghost'); link.href = `/marketplace?creator=${encodeURIComponent(owner)}`; status.append(link); }
                else status.append(button(tr('View in catalog', 'Ver no catálogo'), () => showTab(exploreLabel, explore)));
              }
            } catch (error) { if (fresh()) { status.textContent = errorText(error); publishing = false; pricing.disable(false); refreshPublication(); } }
          };
          }
          else if (!publicPackage) details.append(notice(tr('Local development link: you can test and use it privately. Host it online to publish.', 'Link de desenvolvimento local: podes testar e usar em privado. Coloca-o online para publicar.')));
          details.append(actions, host);
          if (publication) details.append(publication);
          if (!simple) details.append(notice(tr('Fixed releases use a self-contained HTML file. Live previews need a host that allows embedding and CORS. The SDK is optional. Paid publishing requires verified Stripe setup and enabled marketplace payments.', 'As versões fixas usam um HTML com tudo incluído. Previews online precisam de incorporação e CORS no alojamento. O SDK é opcional. Publicar pago exige Stripe verificado e pagamentos do Marketplace ativos.')));
          if (restored && fresh()) {
            restoringDraft = null; draftBox.dataset.widgetDraftState = 'restored';
            draftMessage.textContent = tr('Draft restored. Your preview is stopped; review access and approve it again before testing. Payment and seller readiness are checked separately.', 'Rascunho restaurado. O preview está parado; revê o acesso e aprova-o novamente antes de testar. Os pagamentos e o estado do vendedor são verificados em separado.');
          }
          queueDraft();
        } catch (error) { if (fresh()) status.textContent = error.message; }
        finally {
          if (fresh()) {
            submit.disabled = false;
            if (restoringDraft === restored && restored) { restoringDraft = null; restoreCandidate = restored; restoreDraft.hidden = false; }
          }
        }
      };
    }
    const refundLabel = tr('Help & refunds', 'Ajuda e reembolsos'), sellerRefundLabel = tr('Buyer requests', 'Pedidos dos compradores');
    function refunds(view) {
      if (!owner) { body.append(button(tr('Sign in to see your requests', 'Inicia sessão para ver os teus pedidos'), () => requestSignIn())); return; }
      const page = pageEpoch;
      refundPanel = mountWidgetRefunds(body, { api: commerce, getUserId, view, tr, alive: () => current() && page === pageEpoch });
    }
    if (surface === 'developers') {
      tabs.append(button(createLabel, () => showTab(createLabel, developers)), button(publishedLabel, () => showTab(publishedLabel, () => explore(true))));
    } else if (surface === 'marketplace') {
      const themesLabel = tr('Themes', 'Temas');
      tabs.append(button(exploreLabel, () => showTab(exploreLabel, explore)), button(themesLabel, () => { if (openThemes) { close(); openThemes(); return; } return showTab(themesLabel, () => {
        body.append(button(tr('Explore community themes', 'Explorar temas da comunidade'), () => openWebsite('/themes')));
      }); }), button(mineLabel, () => showTab(mineLabel, mine)));

    } else if (website) {
      tabs.append(button(exploreLabel, () => showTab(exploreLabel, explore)), button(mineLabel, () => showTab(mineLabel, mine)), button(createLabel, () => showTab(createLabel, developers)));
    } else {
      tabs.append(button(addLabel, () => showTab(addLabel, () => developers(true))), button(mineLabel, () => showTab(mineLabel, mine)));
      showTab(initialTab === 'mine' ? mineLabel : addLabel, initialTab === 'mine' ? mine : () => developers(true));
    }
    tabs.append(button(refundLabel, () => showTab(refundLabel, () => refunds('buyer'))), button(sellerRefundLabel, () => showTab(sellerRefundLabel, () => refunds('seller'))));
    if (website) {
      const restoreRoute = async (restoreScroll = false) => {
        if (!current() || location.pathname !== routeScope) return;
        const routeUrl = location.href;
        const savedScroll = history.state?.widgetNavigation?.scroll || 0;
        const view = new URLSearchParams(location.search).get('view');
        const options = { history: 'none' };
        if (view === 'refunds') await showTab(refundLabel, () => refunds('buyer'), options);
        else if (view === 'seller-requests') await showTab(sellerRefundLabel, () => refunds('seller'), options);
        else if (surface === 'developers') {
          if (view === 'published' || new URLSearchParams(location.search).has('widget')) await showTab(publishedLabel, () => explore(true), options);
          else await showTab(createLabel, developers, options);
        } else if (view === 'installed') await showTab(mineLabel, mine, options);
        else if (view === 'themes') { if (openThemes) openThemes(); else await showTab(tr('Themes', 'Temas'), () => body.append(button(tr('Explore community themes', 'Explorar temas da comunidade'), () => openWebsite('/themes'))), options); }
        else if (initialTab === 'developers' && !surface) await showTab(createLabel, developers, options);
        else await showTab(exploreLabel, explore, options);
        if (restoreScroll && current() && location.href === routeUrl) requestAnimationFrame(() => { if (current() && location.href === routeUrl) window.scrollTo({ top: savedScroll, behavior: 'instant' }); });
      };
      if (history.state?.widgetNavigation?.scope !== routeScope) history.replaceState({ ...history.state, widgetNavigation: { scope: routeScope, depth: 0, scroll: window.scrollY } }, '', location.href);
      routeListener = () => { void restoreRoute(true); };
      globalThis.addEventListener?.('popstate', routeListener);
      void restoreRoute();
    }
    if (client?.channel) {
      catalogWake = () => {
        clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => {
          if (!current() || catalogRefreshing) return;
          if (refreshDetailView) { await refreshDetailView(); return; }
          if (!website || !body.querySelector('.widgetMarketGrid')) return;
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
    const api = commerce || (commerce = createWidgetCommerce({ client, getUserId }));
    let author = item.sourceAuthorId;
    if (item.sourceId) {
      const rows = await api.catalog({ releaseId: item.sourceId });
      if (!rows[0]?.author_id || (author && author !== rows[0].author_id)) throw Error('Publication unavailable');
      author = rows[0].author_id;
    }
    if (!author) return null;
    const data = await api.catalog({ creatorId: author || undefined });
    // Updates stay within a server-identified creator project, including links
    // whose host and fixed code are identical to another creator's publication.
    const rows = (data || []).filter(row => row.status === 'published' && row.manifest_url === item.package.manifest_url && row.entry_url === item.package.entry_url && (!author || row.author_id === author));
    const latest = rows[0];
    if (Number(latest?.price_cents || 0) > 0 && !latest.purchased && latest.author_id !== actor) return null;
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
    const api = commerce || (commerce = createWidgetCommerce({ client, getUserId }));
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
      const data = await api.release(latest.id);
      if (!alive()) return;
      if (data?.status !== 'published' || data.author_id !== latest.author_id || data.manifest_url !== item.package.manifest_url || data.entry_url !== item.package.entry_url || !sameFixedRelease(data, latest)) throw Error('Update unavailable');
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
          if (item.disabled) host.textContent = tr('This widget is unavailable or your access is paused. Your saved data is kept. Manage widgets to check its status.', 'Este widget está indisponível ou o teu acesso está em pausa. Os teus dados guardados são conservados. Consulta o estado em Gerir widgets.');
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
