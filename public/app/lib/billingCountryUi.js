import { normalizeAltaraLocale, localeIntlTag } from './locale.js';

const ISO = /^[A-Z]{2}$/;
const REVISION = /^[a-f0-9]{64}$/;
const COPY = {
  en: {
    title: 'Billing country', approved: 'Country confirmed by ALTARA', unknown: 'Country not confirmed', currency: 'Billing currency',
    declared: 'Country entered in Stripe', undeclared: 'No country entered in Stripe', unverified: 'Entering a country in Stripe does not by itself confirm a change in ALTARA.',
    travel: 'Travel, your connection and your app language do not change your billing country.',
    manage: 'Manage billing details in Stripe', refresh: 'Refresh details', preview: 'Review country entered in Stripe',
    hosted: 'Enter or update your billing address securely in Stripe. Opening this page does not create a subscription or charge.',
    incomplete: 'Complete your billing details in Stripe before reviewing the country.',
    loading: 'Loading billing details…', opening: 'Opening Stripe…', retry: 'Retry',
    unavailable: 'Billing details are not available yet.', failed: 'Could not complete this request. Please try again.',
    local_disabled: 'Billing management is not enabled in this local session.', local_server_disabled: 'The server does not allow billing management in this session.',
    timeout: 'This request took too long. Please try again.', auth: 'Sign in again to continue.',
    stale: 'The billing details changed. Review the current country again before confirming.',
    preview_title: 'Review billing country', confirm_country: 'Confirm billing country', request_review: 'Send for ALTARA review', cancel: 'Cancel',
    initial: 'Confirm the country entered in Stripe. Prices are selected by ALTARA.',
    review: 'ALTARA will review this request. Your current subscription and billing currency stay unchanged during review. No automatic renewal change is scheduled.',
    pricing: 'This request does not create a subscription or charge. Price and effective date will be confirmed before any change.',
    consent_initial: 'I confirm this billing country.', consent_review: 'I request ALTARA review of this billing country.',
    pending: 'Country change awaiting ALTARA review:', reconfirm: 'Your Stripe details changed after the request. Review them again and send a new confirmation.',
    legacy: 'An earlier country request needs a new review of your Stripe details:', saved: 'Billing country confirmed.', sent: 'Request sent for ALTARA review.',
    returned: 'Stripe closed. Refresh or review your details; your billing country has not changed automatically.',
    purchase_country_required: 'Confirm billing country first', monthly: 'monthly', yearly: 'yearly',
  },
  'pt-PT': {
    title: 'País de faturação', approved: 'País confirmado pelo ALTARA', unknown: 'País por confirmar', currency: 'Moeda de faturação',
    declared: 'País indicado no Stripe', undeclared: 'Ainda não indicaste um país no Stripe', unverified: 'Indicar um país no Stripe, por si só, não confirma uma alteração no ALTARA.',
    travel: 'Viajar, mudar de ligação ou de idioma não altera o teu país de faturação.',
    manage: 'Gerir dados de faturação no Stripe', refresh: 'Actualizar dados', preview: 'Rever país indicado no Stripe',
    hosted: 'Indica ou actualiza a morada de faturação em segurança no Stripe. Abrir esta página não cria uma subscrição nem uma cobrança.',
    incomplete: 'Completa os dados de faturação no Stripe antes de reveres o país.',
    loading: 'A carregar dados de faturação…', opening: 'A abrir o Stripe…', retry: 'Tentar novamente',
    unavailable: 'Os dados de faturação ainda não estão disponíveis.', failed: 'Não foi possível concluir este pedido. Tenta novamente.',
    local_disabled: 'A gestão de faturação não está ativada nesta sessão local.', local_server_disabled: 'O servidor não permite a gestão de faturação nesta sessão.',
    timeout: 'O pedido demorou demasiado. Tenta novamente.', auth: 'Inicia sessão novamente para continuar.',
    stale: 'Os dados de faturação mudaram. Revê o país actual antes de confirmares.',
    preview_title: 'Rever país de faturação', confirm_country: 'Confirmar país de faturação', request_review: 'Enviar para revisão pelo ALTARA', cancel: 'Cancelar',
    initial: 'Confirma o país indicado no Stripe. Os preços são definidos pelo ALTARA.',
    review: 'O ALTARA vai rever este pedido. A subscrição e a moeda actuais mantêm-se durante a revisão. Não fica agendada uma mudança automática na renovação.',
    pricing: 'Este pedido não cria uma subscrição nem uma cobrança. O preço e a data de aplicação serão confirmados antes de qualquer alteração.',
    consent_initial: 'Confirmo este país de faturação.', consent_review: 'Peço a revisão deste país de faturação pelo ALTARA.',
    pending: 'Alteração de país a aguardar revisão pelo ALTARA:', reconfirm: 'Os dados no Stripe mudaram depois do pedido. Revê-os novamente e envia uma nova confirmação.',
    legacy: 'Um pedido anterior de país precisa de uma nova revisão dos dados no Stripe:', saved: 'País de faturação confirmado.', sent: 'Pedido enviado para revisão pelo ALTARA.',
    returned: 'O Stripe fechou. Actualiza ou revê os dados; o país de faturação não mudou automaticamente.',
    purchase_country_required: 'Confirma primeiro o país de faturação', monthly: 'mensal', yearly: 'anual',
  },
  'pt-BR': {
    title: 'País de cobrança', approved: 'País confirmado pelo ALTARA', unknown: 'País não confirmado', currency: 'Moeda de cobrança',
    declared: 'País informado no Stripe', undeclared: 'Nenhum país informado no Stripe', unverified: 'Informar um país no Stripe, por si só, não confirma uma alteração no ALTARA.',
    travel: 'Viajar, mudar de conexão ou de idioma não altera seu país de cobrança.',
    manage: 'Gerenciar dados de cobrança no Stripe', refresh: 'Atualizar dados', preview: 'Revisar país informado no Stripe',
    hosted: 'Informe ou atualize seu endereço de cobrança com segurança no Stripe. Abrir esta página não cria uma assinatura nem uma cobrança.',
    incomplete: 'Complete os dados de cobrança no Stripe antes de revisar o país.',
    loading: 'Carregando dados de cobrança…', opening: 'Abrindo o Stripe…', retry: 'Tentar novamente',
    unavailable: 'Os dados de cobrança ainda não estão disponíveis.', failed: 'Não foi possível concluir este pedido. Tente novamente.',
    local_disabled: 'O gerenciamento de cobrança não está ativado nesta sessão local.', local_server_disabled: 'O servidor não permite o gerenciamento de cobrança nesta sessão.',
    timeout: 'O pedido demorou demais. Tente novamente.', auth: 'Entre na sua conta novamente para continuar.',
    stale: 'Os dados de cobrança mudaram. Revise o país atual antes de confirmar.',
    preview_title: 'Revisar país de cobrança', confirm_country: 'Confirmar país de cobrança', request_review: 'Enviar para análise pelo ALTARA', cancel: 'Cancelar',
    initial: 'Confirme o país informado no Stripe. Os preços são definidos pelo ALTARA.',
    review: 'O ALTARA vai analisar este pedido. A assinatura e a moeda atuais permanecem durante a análise. Nenhuma mudança automática na renovação será agendada.',
    pricing: 'Este pedido não cria uma assinatura nem uma cobrança. O preço e a data de aplicação serão confirmados antes de qualquer alteração.',
    consent_initial: 'Confirmo este país de cobrança.', consent_review: 'Solicito a análise deste país de cobrança pelo ALTARA.',
    pending: 'Alteração de país aguardando análise pelo ALTARA:', reconfirm: 'Os dados no Stripe mudaram após o pedido. Revise novamente e envie uma nova confirmação.',
    legacy: 'Um pedido anterior de país precisa de uma nova análise dos dados no Stripe:', saved: 'País de cobrança confirmado.', sent: 'Pedido enviado para análise pelo ALTARA.',
    returned: 'O Stripe foi fechado. Atualize ou revise os dados; o país de cobrança não mudou automaticamente.',
    purchase_country_required: 'Confirme primeiro o país de cobrança', monthly: 'mensal', yearly: 'anual',
  },
};
export const billingCountryText = (locale, key) => COPY[normalizeAltaraLocale(locale)][key] || COPY.en.failed;

export function validateBillingCountryProfile(response) {
  const value = response?.profile;
  if (!value || value.schema !== 2 || typeof value.enabled !== 'boolean') throw Error('invalid_billing_profile');
  if (!value.enabled) return { profile: { schema: 2, enabled: false }, countries: [] };
  const countries = response.countries;
  if (!Array.isArray(countries) || !countries.length || countries.length > 250
    || countries.some(country => typeof country !== 'string' || !ISO.test(country)) || new Set(countries).size !== countries.length
    || typeof value.revision !== 'string' || !REVISION.test(value.revision) || !['eur', 'brl'].includes(value.currency)
    || !['unconfirmed', 'confirmed'].includes(value.status)
    || (value.country !== null && !countries.includes(value.country))
    || (value.status === 'confirmed') !== (value.country !== null)
    || (value.declared_country !== null && !countries.includes(value.declared_country))
    || typeof value.address_ready !== 'boolean' || (value.address_ready && value.declared_country === null)) throw Error('invalid_billing_profile');
  const cleanPending = (pending, legacy = false) => {
    if (pending === null) return null;
    if (!pending || !countries.includes(pending.country) || pending.status !== 'pending_review'
      || typeof pending.needs_reconfirmation !== 'boolean' || (legacy && !pending.needs_reconfirmation)
      || typeof pending.requested_at !== 'string' || pending.requested_at.length > 40
      || !Number.isFinite(Date.parse(pending.requested_at))) throw Error('invalid_billing_profile');
    return { country: pending.country, status: pending.status, requested_at: pending.requested_at,
      needs_reconfirmation: pending.needs_reconfirmation };
  };
  return { profile: { schema: 2, enabled: true, country: value.country, currency: value.currency, status: value.status,
    revision: value.revision, declared_country: value.declared_country, address_ready: value.address_ready,
    legacy_pending: cleanPending(value.legacy_pending, true), pending: cleanPending(value.pending) }, countries: [...countries] };
}

export function validateBillingCountryPreview(response, country, currentCurrency) {
  const value = response?.preview;
  if (!value || value.schema !== 2 || typeof value.revision !== 'string' || !REVISION.test(value.revision) || !ISO.test(country) || value.country !== country
    || !['eur', 'brl'].includes(value.currency) || value.current_currency !== currentCurrency
    || !['confirm_country', 'request_review'].includes(value.kind) || value.effective_at !== null
    || value.requires_review !== (value.kind === 'request_review')
    || (value.kind === 'confirm_country' && value.currency !== currentCurrency)
    || !Array.isArray(value.offers) || ![0, 4].includes(value.offers.length)) throw Error('invalid_billing_preview');
  const keys = new Set();
  const offers = value.offers.map(offer => {
    const key = `${offer?.plan}:${offer?.interval}`;
    if (!['core', 'nova'].includes(offer?.plan) || !['monthly', 'yearly'].includes(offer?.interval)
      || keys.has(key) || offer.currency !== value.currency || !Number.isSafeInteger(offer.unit_amount)
      || offer.unit_amount <= 0 || offer.status !== 'active') throw Error('invalid_billing_preview');
    keys.add(key);
    return { plan: offer.plan, interval: offer.interval, currency: offer.currency, unit_amount: offer.unit_amount };
  });
  return { schema: 2, revision: value.revision, kind: value.kind, country: value.country, currency: value.currency,
    current_currency: value.current_currency, offers, effective_at: null, requires_review: value.requires_review };
}

export function validateBillingDetailsPortalUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) throw Error('invalid_billing_portal');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.username || url.password
    || (url.port && url.port !== '443')) throw Error('invalid_billing_portal');
  return url.toString();
}

export function createBillingCountryUi({ root, getUserId, getLocale, request, openPortal, onOwnerChanged = () => {}, onPortalCancelled = () => {}, onConfirmed = () => {},
  makeRequestKey = () => globalThis.crypto.randomUUID(), timeoutMs = 12000 }) {
  const doc = root.ownerDocument;
  let owner = '', active = false, generation = 0, locale = '', profile = null, busy = false,
    error = '', message = '', preview = null, requestKey = '', portalOwner = '', retryAction = 'profile', refs = {};
  const text = key => billingCountryText(locale, key);
  const node = (tag, content, name) => {
    const result = doc.createElement(tag);
    if (content !== undefined) result.textContent = content;
    if (name) result.dataset.billingCountry = name;
    return result;
  };
  const button = (label, name, handler) => {
    const result = node('button', label, name); result.type = 'button'; result.className = 'btn ghost';
    result.addEventListener('click', handler); return result;
  };
  const countryName = country => {
    try { return new Intl.DisplayNames([localeIntlTag(locale)], { type: 'region' }).of(country) || country; }
    catch { return country; }
  };
  function clearPreview() {
    preview = null; requestKey = '';
    if (refs.agree) refs.agree.checked = false;
    renderPreview();
  }
  function reset({ keepPortal = false } = {}) {
    generation++; busy = false; profile = null; error = ''; message = ''; if (!keepPortal) portalOwner = ''; retryAction = 'profile'; clearPreview();
  }
  function current(token, uid) {
    if (String(getUserId() || '') !== uid) {
      if (owner === uid) { reset(); owner = String(getUserId() || ''); onOwnerChanged(uid, owner); build(); render(); root.hidden = !owner; }
      return false;
    }
    return active && generation === token && owner === uid;
  }
  async function bounded(operation) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('billing_country_timeout')), timeoutMs);
    })]); } finally { clearTimeout(timer); }
  }
  const call = body => { const userId = owner; return bounded(() => request(body, { userId })); };
  function errorText(cause) {
    if (cause?.message === 'altara_plus_billing_disabled_outside_production') return text('local_disabled');
    if (cause?.message === 'stripe_client_environment_mismatch') return text('local_server_disabled');
    if (cause?.message === 'billing_country_timeout') return text('timeout');
    if (cause?.message === 'auth' || /auth_missing|unauthorized/.test(cause?.message || '')) return text('auth');
    if (/^billing_(country|details)_stale$/.test(cause?.message || '')) return text('stale');
    if (cause?.message === 'billing_details_address_required') return text('incomplete');
    return text('failed');
  }
  function showError(cause, action) {
    error = errorText(cause); retryAction = action;
    if (error === text('auth')) { clearPreview(); profile = null; portalOwner = ''; retryAction = 'profile'; }
  }
  function canReview() {
    return profile?.enabled && profile.address_ready && !!profile.declared_country
      && (!profile.pending || profile.pending.needs_reconfirmation);
  }
  function build() {
    root.replaceChildren(); root.className = 'settingsAltaraPlusStatusCard billingCountryCard'; root.setAttribute('aria-label', text('title'));
    refs = {};
    refs.summary = node('div', '', 'summary'); refs.summary.className = 'billingCountrySummary';
    refs.declared = node('p', '', 'declared'); refs.pending = node('p', '', 'pending'); refs.legacy = node('p', '', 'legacy');
    refs.notice = node('p', '', 'notice'); refs.notice.setAttribute('role', 'status'); refs.notice.setAttribute('aria-live', 'polite');
    refs.manage = button(text('manage'), 'manage', () => void manage());
    refs.refresh = button(text('refresh'), 'refresh', () => void load());
    refs.review = button(text('preview'), 'review', () => void review());
    refs.retry = button(text('retry'), 'retry', () => {
      if (retryAction === 'confirm') void confirm(); else if (retryAction === 'portal') void manage();
      else if (retryAction === 'preview') void review(); else void load();
    });
    const actions = node('div'); actions.className = 'billingCountryActions'; actions.append(refs.manage, refs.refresh, refs.review, refs.retry);
    const hosted = node('p', text('hosted')); hosted.className = 'settingsHint';
    const travel = node('p', text('travel')); travel.className = 'settingsHint';
    refs.preview = node('section', undefined, 'preview'); refs.preview.className = 'billingCountryPreview';
    root.append(node('h3', text('title')), refs.summary, refs.declared, refs.pending, refs.legacy, hosted, travel, refs.notice, actions, refs.preview);
    renderPreview();
  }
  function renderPreview() {
    if (!refs.preview) return;
    refs.preview.replaceChildren(); refs.agree = null; refs.confirm = null;
    if (!preview) return;
    refs.preview.append(node('h4', text('preview_title')), node('p', `${countryName(preview.country)} · ${preview.currency.toUpperCase()}`),
      node('p', text(preview.requires_review ? 'review' : 'initial')));
    const offers = node('ul');
    for (const offer of preview.offers) {
      const amount = new Intl.NumberFormat(localeIntlTag(locale), { style: 'currency', currency: offer.currency.toUpperCase() }).format(offer.unit_amount / 100);
      offers.append(node('li', `ALTARA+ ${offer.plan === 'core' ? 'Core' : 'Nova'} · ${text(offer.interval)} · ${amount}`));
    }
    const consent = node('label'); consent.className = 'billingCountryConsent'; refs.agree = node('input', undefined, 'consent'); refs.agree.type = 'checkbox';
    consent.append(refs.agree, node('span', text(preview.requires_review ? 'consent_review' : 'consent_initial')));
    refs.agree.addEventListener('change', render);
    refs.confirm = button(text(preview.kind), 'confirm', () => void confirm()); refs.confirm.className = 'btn primary';
    const cancel = button(text('cancel'), 'cancel', () => { if (!busy) { clearPreview(); error = ''; render(); } });
    refs.preview.append(offers, node('p', text('pricing')), consent, refs.confirm, cancel);
  }
  function render() {
    if (!refs.notice) return;
    const enabled = profile?.enabled === true;
    refs.summary.textContent = enabled ? `${profile.country ? `${text('approved')}: ${countryName(profile.country)}` : text('unknown')} · ${text('currency')}: ${profile.currency.toUpperCase()}` : '';
    refs.declared.hidden = !enabled;
    refs.declared.textContent = enabled ? (profile.declared_country
      ? `${text('declared')}: ${countryName(profile.declared_country)}. ${text('unverified')}` : text('undeclared')) : '';
    refs.pending.hidden = !profile?.pending;
    refs.pending.textContent = profile?.pending ? `${text('pending')} ${countryName(profile.pending.country)}. ${text(profile.pending.needs_reconfirmation ? 'reconfirm' : 'review')}` : '';
    refs.legacy.hidden = !profile?.legacy_pending; refs.legacy.textContent = profile?.legacy_pending ? `${text('legacy')} ${countryName(profile.legacy_pending.country)}.` : '';
    refs.notice.textContent = busy ? text(retryAction === 'portal' ? 'opening' : 'loading') : error || message
      || (profile?.enabled === false ? text('unavailable') : enabled && !profile.address_ready ? text('incomplete') : '');
    refs.manage.hidden = !enabled; refs.manage.disabled = busy || !!portalOwner;
    refs.refresh.hidden = !enabled; refs.refresh.disabled = busy;
    refs.review.hidden = !enabled; refs.review.disabled = busy || !!portalOwner || !canReview();
    refs.retry.hidden = !error || busy; refs.retry.disabled = busy;
    refs.preview.hidden = !preview;
    if (refs.agree) refs.agree.disabled = busy;
    if (refs.confirm) refs.confirm.disabled = busy || !refs.agree.checked;
  }
  async function load({ notice = '' } = {}) {
    if (!active || busy || !owner || owner !== String(getUserId() || '')) return;
    const uid = owner, token = ++generation; busy = true; error = ''; message = ''; retryAction = 'profile'; clearPreview(); render();
    try {
      const response = await call({ action: 'profile' });
      if (!current(token, uid)) return;
      ({ profile } = validateBillingCountryProfile(response)); message = notice;
    } catch (cause) { if (current(token, uid)) showError(cause, 'profile'); }
    finally { if (current(token, uid)) { busy = false; render(); } }
  }
  async function manage() {
    if (busy || portalOwner || !active || !profile?.enabled || owner !== String(getUserId() || '') || typeof openPortal !== 'function') return;
    const uid = owner, token = ++generation; busy = true; error = ''; message = ''; retryAction = 'portal'; clearPreview(); render();
    try {
      const response = await call({ action: 'portal' });
      if (!current(token, uid)) return;
      const url = validateBillingDetailsPortalUrl(response?.url); portalOwner = uid;
      await bounded(() => { if (!current(token, uid)) throw Error('auth'); return openPortal(url, { userId: uid,
        isCurrent: () => current(token, uid), isPortalCurrent: () => owner === uid && portalOwner === uid && String(getUserId() || '') === uid }); });
    } catch (cause) { if (current(token, uid)) { portalOwner = ''; onPortalCancelled(uid); showError(cause, 'portal'); generation++; busy = false; render(); } }
    finally { if (current(token, uid)) { busy = false; render(); } }
  }
  async function review() {
    if (busy || portalOwner || !active || owner !== String(getUserId() || '') || !canReview()) return;
    const uid = owner, token = ++generation, expectedCountry = profile.declared_country, currency = profile.currency;
    busy = true; error = ''; message = ''; retryAction = 'preview'; clearPreview(); render();
    try {
      const response = await call({ action: 'preview' });
      if (!current(token, uid)) return;
      if (response?.preview?.schema === 2 && ISO.test(response.preview.country) && response.preview.country !== expectedCountry) throw Error('billing_details_stale');
      preview = validateBillingCountryPreview(response, expectedCountry, currency); renderPreview();
    } catch (cause) {
      if (current(token, uid)) {
        if (/^billing_details_(stale|review_pending)$/.test(cause?.message || '')) { busy = false; await load({ notice: text('stale') }); }
        else showError(cause, 'preview');
      }
    }
    finally { if (current(token, uid)) { busy = false; render(); } }
  }
  async function confirm() {
    if (busy || !active || !preview || !refs.agree?.checked || owner !== String(getUserId() || '')) return;
    const uid = owner, token = ++generation, expected = preview;
    try { if (!requestKey) requestKey = makeRequestKey(); } catch { error = text('failed'); render(); return; }
    busy = true; error = ''; message = ''; retryAction = 'confirm'; render();
    try {
      const response = await call({ action: 'confirm', preview_revision: expected.revision, confirmed: true, request_key: requestKey });
      if (!current(token, uid)) return;
      const checked = validateBillingCountryProfile(response);
      if (!checked.profile.enabled || (expected.requires_review
        ? checked.profile.pending?.country !== expected.country || checked.profile.pending.needs_reconfirmation
        : checked.profile.country !== expected.country || checked.profile.currency !== expected.currency || checked.profile.status !== 'confirmed')) throw Error('invalid_billing_confirmation');
      profile = checked.profile; message = text(expected.requires_review ? 'sent' : 'saved'); clearPreview();
      // Country confirmation has already succeeded; a separate catalog refresh cannot undo it.
      try { await onConfirmed(); } catch (_) {}
    } catch (cause) {
      if (current(token, uid)) {
        if (/^billing_(country|details)_(stale|review_pending)$/.test(cause?.message || '')) {
          clearPreview(); busy = false; await load({ notice: text('stale') });
        } else showError(cause, 'confirm');
      }
    } finally { if (current(token, uid)) { busy = false; render(); } }
  }
  function sync({ active: nextActive = true } = {}) {
    const uid = String(getUserId() || ''), nextLocale = normalizeAltaraLocale(getLocale());
    const changedOwner = uid !== owner, changedLocale = nextLocale !== locale;
    if (changedOwner) { const previous = owner; reset(); owner = uid; onOwnerChanged(previous, owner); }
    if (active && !nextActive) reset({ keepPortal: true });
    active = nextActive && !!owner;
    if (changedLocale) { reset({ keepPortal: true }); locale = nextLocale; }
    if (changedOwner || changedLocale || !refs.notice) build();
    root.hidden = !uid; render();
    if (active && !profile && !error && !busy) void load();
  }
  return { sync, refresh: load,
    portalReturned({ userId } = {}) {
      if (!portalOwner || portalOwner !== userId || owner !== userId || String(getUserId() || '') !== userId) return false;
      portalOwner = ''; generation++; busy = false; clearPreview();
      if (active) void load({ notice: text('returned') });
      return true;
    },
    suspend() { const previous = owner; active = false; reset(); owner = ''; onOwnerChanged(previous, ''); root.hidden = true; render(); },
    dispose() { const previous = owner; active = false; reset(); owner = ''; onOwnerChanged(previous, ''); root.replaceChildren(); refs = {}; },
  };
}
