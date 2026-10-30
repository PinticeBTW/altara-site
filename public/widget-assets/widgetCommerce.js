const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const WIDGET_REFUND_POLICY_VERSION = 'widgets-refunds-2026-10-15-v1';
const missingRpc = error => ['PGRST202', '42883'].includes(error?.code);
const legacyMetadata = 'id,author_id,name,description,version,created_at,kind,sdkVersion,manifest_url,entry_url,permissions,status,icon_url,snapshot_sha256';
const legacyPackage = 'id,author_id,name,description,version,kind,sdkVersion,manifest_url,entry_url,permissions,status,icon_url,snapshot_html,snapshot_sha256,release_notes';
const messages = {
  sign_in_required: 'Sign in to buy or sell widgets.',
  account_changed: 'Your account changed. Open the widget again.',
  purchase_required: 'Buy this widget before previewing or installing it.',
  payments_unavailable: 'Widget payments are not available yet. Free widgets still work.',
  seller_not_ready: 'The creator must finish payment setup before selling this widget.',
  checkout_pending: 'Your payment is still being confirmed. Refresh the purchase status shortly.',
  checkout_expired: 'This checkout expired. Start again to confirm the current price.',
  checkout_closed: 'This checkout is no longer active. Start again to confirm the current price.',
  checkout_reconciliation_required: 'The previous checkout needs verification. Refresh the purchase status or contact ALTARA support before trying again.',
  seller_reconciliation_required: 'Your previous Stripe setup needs verification. Contact ALTARA support before starting another setup.',
  seller_country_unavailable: 'Paid widget sales are not available in your country yet.',
  seller_country_conflict: 'The country of this connected account cannot be changed here. Contact support if it is incorrect.',
  invalid_price: 'Enter a price from €0.50 to €1,000, with at most two decimal places.',
  unavailable: 'This widget is not available for purchase.',
  offer_changed: 'A newer release or price is available. Refresh this widget before buying.',
  network_error: 'Could not complete the widget request. Check your connection and try again.',
  invalid_response: 'Could not verify the widget response. Please try again.',
  refund_policy_required: 'Read the widget refund information before continuing to checkout. Refresh this page if necessary.',
  refunds_invalid_request: 'Check the request fields and try again.',
  refunds_name_required: 'Enter your name to submit the withdrawal declaration.',
  refunds_denied: 'This account cannot perform that action. Refresh the requests.',
  refunds_order_not_found: 'This purchase is not available to this account.',
  refunds_request_not_found: 'This request is not available to this account.',
  refunds_revision_conflict: 'This request changed. Refresh it before replying.',
  refunds_idempotency_conflict: 'This submission needs verification. Refresh the requests before trying again.',
  refunds_request_exists: 'A request already exists for this purchase. Refresh to open it.',
  refunds_email_required: 'Your account needs a verified contact email for the request confirmation.',
  refunds_timely_withdrawal: 'An in-period withdrawal cannot be refused through this action.',
  refunds_rate_limited: 'Too many requests. Try again later; your text is kept.',
  refunds_too_many_replies: 'The reply limit was reached. Contact ALTARA support.',
  refunds_unavailable: 'Help and refund requests are temporarily unavailable. Contact support@altaraapp.com.',
  refunds_execution_disabled: 'Automatic refunds are unavailable. Refresh the request or contact ALTARA support before refunding manually.',
  refunds_execution_conflict: 'A refund operation already exists or the payment changed. Refresh its status before trying again.',
  refunds_confirmation_mismatch: 'The refundable amount changed. Refresh the purchase and confirm the current amount.',
  refunds_execution_reconciliation_required: 'The refund needs verification. Do not issue another refund; contact ALTARA support.',
};

export class WidgetCommerceError extends Error {
  constructor(code = 'network_error') {
    const safe = Object.hasOwn(messages, code) ? code : 'network_error';
    super(messages[safe]); this.name = 'WidgetCommerceError'; this.code = safe;
  }
}

export function parseWidgetEuroPrice(value) {
  const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(String(value ?? '').trim());
  if (!match) throw new WidgetCommerceError('invalid_price');
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 50 || cents > 100000) throw new WidgetCommerceError('invalid_price');
  return cents;
}

export function formatWidgetPrice(cents = 0, currency = 'eur', locale = 'en') {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000 || currency?.toLowerCase() !== 'eur') {
    throw new WidgetCommerceError('invalid_response');
  }
  if (!cents) return /^pt\b/i.test(locale) ? 'Grátis' : 'Free';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function paymentUrl(value, onboarding = false) {
  let url; try { url = new URL(value); } catch { throw new WidgetCommerceError('invalid_response'); }
  const hosts = onboarding ? ['connect.stripe.com'] : ['checkout.stripe.com'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) {
    throw new WidgetCommerceError('invalid_response');
  }
  return url.href;
}

function responseError(error, data) {
  let code = data?.error || data?.code || error?.code;
  if (typeof code === 'string') code = code.replace(/^(?:widget|theme)_/, '');
  if (['refunds_unauthorized', 'refunds_session_invalid'].includes(code)) code = 'sign_in_required';
  if (['refunds_origin_denied', 'refunds_environment_mismatch'].includes(code)) code = 'refunds_denied';
  if (['refunds_execution_unavailable', 'refunds_execution_not_ready'].includes(code)) code = 'refunds_execution_disabled';
  if (code === 'refunds_execution_exists') code = 'refunds_execution_conflict';
  if (code === 'refunds_execution_amount_conflict') code = 'refunds_confirmation_mismatch';
  if (['commerce_disabled', 'client_environment_mismatch', 'client_environment_invalid'].includes(code)) code = 'payments_unavailable';
  if (['auth_required', 'session_invalid', 'unauthorized'].includes(code)) code = 'sign_in_required';
  if (code === 'payment_processing') code = 'checkout_pending';
  if (code === 'release_unavailable') code = 'unavailable';
  if (code === '42501' && /purchase_required/.test(error?.message || '')) return new WidgetCommerceError('purchase_required');
  return new WidgetCommerceError(code);
}

function metadataRows(data) {
  if (!Array.isArray(data)) throw new WidgetCommerceError('invalid_response');
  return data.map(row => {
    if (!row || !Number.isSafeInteger(row.price_cents) || row.price_cents < 0 || row.price_cents > 100000
      || row.currency !== 'eur' || typeof row.purchased !== 'boolean' || row.snapshot_html != null || row.code != null) {
      throw new WidgetCommerceError('invalid_response');
    }
    return row;
  });
}

export function createWidgetCommerce({ client, getUserId, clientEnvironment, productKind = 'widget' } = {}) {
  if (!['widget','theme'].includes(productKind)) throw new WidgetCommerceError('invalid_response');
  const isTheme = productKind === 'theme', commerceEndpoint = isTheme ? 'theme-commerce' : 'widget-commerce';
  const refundsEndpoint = isTheme ? 'theme-refunds' : 'widget-refunds';
  const policyVersion = isTheme ? 'themes-refunds-2026-10-15-v1' : WIDGET_REFUND_POLICY_VERSION;
  let disposed = false, owner = String(getUserId?.() || ''), generation = 0;
  let desktopEnvironment;
  const requestKeys = new Map();
  const controllers = new Set();
  function abortRequests() { for (const controller of controllers) controller.abort(); controllers.clear(); }
  async function transport(build) {
    const controller = new AbortController(); controllers.add(controller);
    try { return await build(controller.signal); }
    finally { controllers.delete(controller); }
  }
  const withSignal = (request, signal) => typeof request?.abortSignal === 'function' ? request.abortSignal(signal) : request;
  function ticket(requireUser = false) {
    const next = String(getUserId?.() || '');
    if (next !== owner) { abortRequests(); owner = next; generation++; requestKeys.clear(); }
    if (disposed) throw new WidgetCommerceError('account_changed');
    if (requireUser && !owner) throw new WidgetCommerceError('sign_in_required');
    return { owner, generation };
  }
  function current(start) {
    if (disposed || start.generation !== generation || start.owner !== String(getUserId?.() || '')) {
      throw new WidgetCommerceError('account_changed');
    }
  }
  function releaseId(value) {
    if (!UUID.test(String(value || ''))) throw new WidgetCommerceError('unavailable');
    return value;
  }
  async function environment() {
    if (clientEnvironment) return clientEnvironment;
    const host = globalThis.location?.hostname || '';
    if (globalThis.location?.protocol === 'https:' && ['altaraapp.com', 'www.altaraapp.com', 'app.altaraapp.com'].includes(host)) return 'production';
    if (globalThis.location?.protocol === 'file:' && typeof globalThis.altaraDesktop?.getMeta === 'function') {
      // Packaged Electron uses file URLs. Its read-only payment status must use
      // live mode; the server still forbids native checkout and onboarding.
      desktopEnvironment ??= Promise.resolve().then(() => globalThis.altaraDesktop.getMeta())
        .then(meta => meta?.isPackaged === true ? 'production' : 'development', () => 'development');
      return desktopEnvironment;
    }
    return 'development';
  }
  async function invoke(action, body = {}, endpoint = commerceEndpoint) {
    const start = ticket(true);
    if (!client?.functions?.invoke || !client?.auth?.getSession) throw new WidgetCommerceError('payments_unavailable');
    let session;
    try { session = await client.auth.getSession(); } catch { current(start); throw new WidgetCommerceError('sign_in_required'); }
    current(start);
    if (session.error || session.data?.session?.user?.id !== start.owner || !session.data.session.access_token) {
      throw new WidgetCommerceError('sign_in_required');
    }
    const clientMode = await environment();
    current(start);
    let response;
    try {
      response = await transport(signal => client.functions.invoke(endpoint, {
        body: { action, client_environment: clientMode, ...body },
        headers: { Authorization: `Bearer ${session.data.session.access_token}` },
        signal,
      }));
    } catch { current(start); throw new WidgetCommerceError('network_error'); }
    current(start);
    if (response.error || response.data?.ok !== true) {
      let data = response.data;
      // Supabase returns a FunctionsHttpError for non-2xx responses. Read only
      // its safe error code, never show Stripe/database exception messages.
      if (!data && response.error?.context?.clone) {
        try {
          const body = await response.error.context.clone().text();
          if (body.length <= 16384) data = JSON.parse(body);
        } catch { /* A network response may have no JSON error body. */ }
        current(start);
      }
      throw responseError(response.error, data);
    }
    return response.data;
  }
  function requestKey(action, id = '') {
    ticket(true);
    const key = action + ':' + id;
    if (!requestKeys.has(key)) requestKeys.set(key, crypto.randomUUID());
    return requestKeys.get(key);
  }
  async function status() {
    const data = await invoke('status');
    const onboardingAvailable = data.onboarding_available === undefined ? false : data.onboarding_available;
    if (typeof onboardingAvailable !== 'boolean' || typeof data.enabled !== 'boolean' || (data.commission_bps !== null && ![100, 500].includes(data.commission_bps))
      || ![null, 'test', 'live'].includes(data.environment) || data.currency !== 'eur'
      || data.minimum_price_cents !== 50 || data.maximum_price_cents !== 100000
      || !Array.isArray(data.supported_countries) || data.supported_countries.length > 250
      || data.supported_countries.some(country => typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))
      || new Set(data.supported_countries).size !== data.supported_countries.length
      || !data.seller || typeof data.seller.connected !== 'boolean' || typeof data.seller.ready !== 'boolean'
      || (data.seller.country !== null && (typeof data.seller.country !== 'string' || !/^[A-Z]{2}$/.test(data.seller.country)))
      || ((data.enabled || onboardingAvailable) && (data.environment === null || data.commission_bps === null || !data.supported_countries.length))) {
      throw new WidgetCommerceError('invalid_response');
    }
    return { ...data, onboarding_available: onboardingAvailable };
  }
  async function onboard(country) {
    if (country != null && (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))) {
      throw new WidgetCommerceError('seller_country_unavailable');
    }
    const data = await invoke('onboard', { request_key: requestKey('onboard'), ...(country == null ? {} : { country }) });
    return { ...data, url: paymentUrl(data.url, true) };
  }
  async function checkout(id, { refundPolicyVersion } = {}) {
    id = releaseId(id);
    if (refundPolicyVersion !== undefined && refundPolicyVersion !== policyVersion) throw new WidgetCommerceError('refund_policy_required');
    let data;
    try { data = await invoke('checkout', { release_id: id, request_key: requestKey('checkout', id), ...(refundPolicyVersion ? { refund_policy_version: refundPolicyVersion } : {}) }); }
    catch (error) {
      if (['checkout_expired','checkout_closed','offer_changed'].includes(error.code)) requestKeys.delete('checkout:' + id);
      throw error;
    }
    if (data.purchased === true) {
      if (data.release_id !== id) throw new WidgetCommerceError('invalid_response');
      return data;
    }
    if (!UUID.test(data.order_id || '')) throw new WidgetCommerceError('invalid_response');
    return { ...data, url: paymentUrl(data.url) };
  }
  async function purchase(id) {
    const data = await invoke('purchase', { release_id: releaseId(id) });
    if (typeof data.purchased !== 'boolean') throw new WidgetCommerceError('invalid_response');
    if (isTheme && data.order != null && (data.order.product_kind !== 'theme'
      || !UUID.test(data.order.order_id || '') || !UUID.test(data.order.theme_project_id || '')
      || data.order.theme_release_id !== data.order.release_id)) throw new WidgetCommerceError('invalid_response');
    return data;
  }
  async function catalog({ own = false, creatorId = null, releaseId: id = null } = {}) {
    const start = ticket(own);
    if (creatorId) releaseId(creatorId);
    if (id) releaseId(id);
    let response;
    try {
      response = await transport(signal => withSignal(client.rpc('widget_commerce_catalog_v1', {
        p_own: !!own, p_creator_id: creatorId || null, p_release_id: id || null,
      }), signal));
      current(start);
      if (response.error && missingRpc(response.error)) {
        // Only an absent RPC enables the legacy free catalogue. Network/auth
        // failures must never be interpreted as a free payment entitlement.
        let query = client.from('home_widget_releases').select(legacyMetadata).eq('kind', 'hosted');
        if (!own && !id) query = query.eq('status', 'published');
        if (own || creatorId) query = query.eq('author_id', own ? start.owner : creatorId);
        if (id) query = query.eq('id', id);
        response = await transport(signal => withSignal(query.order('created_at', { ascending: false }).limit(50), signal));
        current(start);
        if (!response.error && Array.isArray(response.data)) {
          response.data = response.data.map(row => ({ ...row, price_cents: 0, currency: 'eur', purchased: false }));
        }
      }
    } catch (error) { current(start); if (error instanceof WidgetCommerceError) throw error; throw new WidgetCommerceError('network_error'); }
    if (response.error) throw responseError(response.error);
    return metadataRows(response.data);
  }
  async function purchases({ limit = 50, offset = 0 } = {}) {
    const start = ticket(true);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
      throw new WidgetCommerceError('invalid_response');
    }
    let response;
    try {
      response = await transport(signal => withSignal(client.rpc(isTheme ? 'theme_commerce_library_v1' : 'widget_commerce_library_v1', {
        p_limit: limit, p_offset: offset,
      }), signal));
      current(start);
    } catch (error) { current(start); if (error instanceof WidgetCommerceError) throw error; throw new WidgetCommerceError('network_error'); }
    // A legacy free-only backend has no paid ownership records. Never substitute
    // a public catalogue for this account-scoped library on any other failure.
    if (!isTheme && response.error && missingRpc(response.error)) return [];
    if (response.error) throw responseError(response.error);
    const payload = isTheme ? response.data : null;
    if (isTheme && (!payload || !Array.isArray(payload.items) || typeof payload.has_more !== 'boolean')) throw new WidgetCommerceError('invalid_response');
    const rows = metadataRows(isTheme ? payload.items : response.data);
    if (isTheme && rows.some(row => ['package_text','package','css','assets','draft_package'].some(key => row[key] != null)
      || !UUID.test(row.id || '') || (row.product_kind != null && row.product_kind !== 'theme'))) throw new WidgetCommerceError('invalid_response');
    if (rows.length > limit || rows.some(row => row.purchased !== true || typeof row.installed !== 'boolean')) throw new WidgetCommerceError('invalid_response');
    return isTheme ? { items:rows, has_more:payload.has_more, limit, offset } : rows;
  }
  async function release(id) {
    const start = ticket(), safeId = releaseId(id);
    let response;
    try {
      response = await transport(signal => withSignal(client.rpc('widget_commerce_release_v1', { p_release_id: safeId }), signal));
      current(start);
      if (response.error && missingRpc(response.error)) {
        response = await transport(signal => withSignal(client.from('home_widget_releases').select(legacyPackage).eq('id', safeId).single(), signal));
        current(start);
      }
    } catch (error) { current(start); if (error instanceof WidgetCommerceError) throw error; throw new WidgetCommerceError('network_error'); }
    if (response.error) throw responseError(response.error);
    if (!response.data || response.data.id !== safeId) throw new WidgetCommerceError('invalid_response');
    return response.data;
  }
  function refundId(value) { if (!UUID.test(String(value || ''))) throw new WidgetCommerceError('refunds_invalid_request'); return value; }
  function refundText(value, maximum = 2000) { if (typeof value !== 'string' || value.length > maximum) throw new WidgetCommerceError('refunds_invalid_request'); return value.trim(); }
  function refundRequest(row) {
    if (!row || !UUID.test(row.request_id || '') || !UUID.test(row.order_id || '')
      || !['withdrawal', 'fault', 'other'].includes(row.basis)
      || !['pending', 'needs_info', 'approved_full', 'approved_partial', 'refused', 'escalated'].includes(row.status)
      || !Number.isSafeInteger(row.revision) || row.revision < 1
      || typeof row.reason !== 'string' || row.reason.length > 2000 || typeof row.customer_name !== 'string' || row.customer_name.length > 120
      || ![null, undefined].includes(row.approved_amount_cents) && (!Number.isSafeInteger(row.approved_amount_cents) || row.approved_amount_cents < 1 || row.approved_amount_cents > 100000)
      || ['can_reply', 'can_escalate', 'can_refuse', 'withdrawal_in_period'].some(key => typeof row[key] !== 'boolean')
      || !Number.isSafeInteger(row.receipt_revision) || row.receipt_revision < 1 || row.receipt_revision > row.revision
      || !refundStamp(row.created_at) || !refundStamp(row.updated_at)) throw new WidgetCommerceError('invalid_response');
    if ((row.product_kind ?? 'widget') !== productKind || (row.can_execute !== undefined && typeof row.can_execute !== 'boolean')) throw new WidgetCommerceError('invalid_response');
    const execution = row.execution ?? null;
    if (execution !== null) {
      const statuses = ['queued', 'processing', 'pending', 'requires_action', 'succeeded', 'failed', 'reconciliation_required'];
      const fees = ['pending', 'succeeded', 'reconciliation_required', 'not_applicable'];
      if (!execution || !UUID.test(execution.execution_id || '') || !statuses.includes(execution.status)
        || !fees.includes(execution.fee_refund_status) || execution.currency !== 'eur'
        || !Number.isSafeInteger(execution.amount_cents) || execution.amount_cents < 1 || execution.amount_cents > 100000
        || !Number.isSafeInteger(execution.baseline_refunded_amount_cents) || execution.baseline_refunded_amount_cents < 0
        || !Number.isSafeInteger(execution.target_amount_cents) || execution.target_amount_cents > 100000
        || execution.target_amount_cents !== execution.baseline_refunded_amount_cents + execution.amount_cents
        || !refundStamp(execution.created_at) || !refundStamp(execution.updated_at)
        || Object.keys(execution).some(key => !['execution_id', 'status', 'amount_cents', 'target_amount_cents',
          'baseline_refunded_amount_cents', 'currency', 'fee_refund_status', 'created_at', 'updated_at'].includes(key))) {
        throw new WidgetCommerceError('invalid_response');
      }
    }
    return { ...row, can_execute: row.can_execute === true, execution };
  }
  function refundOrder(row) {
    if (!row || !UUID.test(row.order_id || '') || !UUID.test(row.release_id || '') || typeof row.widget_name !== 'string' || !row.widget_name.length || row.widget_name.length > 120
      || !Number.isSafeInteger(row.price_cents) || row.price_cents < 50 || row.price_cents > 100000 || row.currency !== 'eur'
      || !['pending', 'paid', 'refunded', 'disputed', 'resumed', 'failed', 'expired', 'cancelled'].includes(row.state)
      || !refundStamp(row.created_at) || !refundStamp(row.paid_at) || !refundStamp(row.withdrawal_deadline_at)
      || (row.policy_version != null && row.policy_version !== policyVersion)
      || (row.refunded_amount_cents != null && (!Number.isSafeInteger(row.refunded_amount_cents) || row.refunded_amount_cents < 0 || row.refunded_amount_cents > row.price_cents))) throw new WidgetCommerceError('invalid_response');
    if ((row.product_kind ?? 'widget') !== productKind || (isTheme && (!UUID.test(row.theme_project_id || '')
      || row.theme_release_id !== row.release_id || typeof row.product_name !== 'string' || row.product_name.length > 120))) throw new WidgetCommerceError('invalid_response');
    return row;
  }
  function refundStamp(value) { return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value)); }
  async function refundList({ view = 'buyer', limit = 50, offset = 0 } = {}) {
    if (!['buyer', 'seller'].includes(view) || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new WidgetCommerceError('refunds_invalid_request');
    const data = await invoke('list', { view, limit, offset }, refundsEndpoint);
    if (data.view !== view || data.policy_version !== policyVersion || typeof data.has_more !== 'boolean'
      || !Array.isArray(data.orders) || !Array.isArray(data.requests) || data.orders.length > limit || data.requests.length > limit * 3) throw new WidgetCommerceError('invalid_response');
    if (data.automatic_refunds_enabled !== undefined && typeof data.automatic_refunds_enabled !== 'boolean') throw new WidgetCommerceError('invalid_response');
    const confirmationEmail = data.confirmation_email ?? null;
    if (confirmationEmail !== null && (typeof confirmationEmail !== 'string' || confirmationEmail.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(confirmationEmail))) throw new WidgetCommerceError('invalid_response');
    return { ...data, automatic_refunds_enabled: data.automatic_refunds_enabled === true,
      confirmation_email: confirmationEmail, orders: data.orders.map(refundOrder), requests: data.requests.map(refundRequest) };
  }
  async function refundCreate({ order_id, basis, reason = '', customer_name = '' } = {}) {
    const body = { order_id: refundId(order_id), basis, reason: refundText(reason), customer_name: refundText(customer_name, 120) };
    if (!['withdrawal', 'fault', 'other'].includes(basis)) throw new WidgetCommerceError('refunds_invalid_request');
    if (basis === 'withdrawal' && !body.customer_name) throw new WidgetCommerceError('refunds_name_required');
    const data = await invoke('create', { ...body, request_key: requestKey('refund-create', JSON.stringify(body)) }, refundsEndpoint);
    const row = refundRequest(data.request); if (row.order_id !== order_id || row.basis !== basis) throw new WidgetCommerceError('invalid_response'); return row;
  }
  async function refundReply({ request_id, expected_revision, decision, message = '', approved_amount_cents = null } = {}) {
    const body = { request_id: refundId(request_id), expected_revision, decision, message: refundText(message), approved_amount_cents };
    if (!Number.isSafeInteger(expected_revision) || expected_revision < 1 || !['message', 'approve_full', 'approve_partial', 'refuse', 'needs_info'].includes(decision)
      || (['message', 'refuse', 'needs_info'].includes(decision) && !body.message)
      || (decision === 'approve_partial' ? !Number.isSafeInteger(approved_amount_cents) || approved_amount_cents < 1 || approved_amount_cents > 100000 : approved_amount_cents !== null)) throw new WidgetCommerceError('refunds_invalid_request');
    const data = await invoke('reply', { ...body, request_key: requestKey('refund-reply', JSON.stringify(body)) }, refundsEndpoint);
    const row = refundRequest(data.request); if (row.request_id !== request_id) throw new WidgetCommerceError('invalid_response'); return row;
  }
  async function refundEscalate({ request_id, expected_revision, message = '' } = {}) {
    const body = { request_id: refundId(request_id), expected_revision, message: refundText(message) };
    if (!Number.isSafeInteger(expected_revision) || expected_revision < 1) throw new WidgetCommerceError('refunds_invalid_request');
    const data = await invoke('escalate', { ...body, request_key: requestKey('refund-escalate', JSON.stringify(body)) }, refundsEndpoint);
    const row = refundRequest(data.request); if (row.request_id !== request_id) throw new WidgetCommerceError('invalid_response'); return row;
  }
  async function refundExecute({ request_id, expected_revision, decision, message = '', approved_amount_cents = null, confirmed_amount_cents } = {}) {
    const body = { request_id: refundId(request_id), expected_revision, decision, message: refundText(message),
      approved_amount_cents, confirmed_amount_cents };
    if (!Number.isSafeInteger(expected_revision) || expected_revision < 1 || !['approve_full', 'approve_partial'].includes(decision)
      || !Number.isSafeInteger(confirmed_amount_cents) || confirmed_amount_cents < 1 || confirmed_amount_cents > 100000
      || (decision === 'approve_partial'
        ? !Number.isSafeInteger(approved_amount_cents) || approved_amount_cents < confirmed_amount_cents || approved_amount_cents > 100000
        : approved_amount_cents !== null)) throw new WidgetCommerceError('refunds_invalid_request');
    // An uncertain financial submission must keep its identity. Changing the
    // displayed account clears the map; retries of the same confirmation do not.
    const data = await invoke('execute', { ...body, request_key: requestKey('refund-execute', JSON.stringify(body)) }, refundsEndpoint);
    const row = refundRequest(data.request);
    if (row.request_id !== request_id || !row.execution || row.execution.amount_cents !== confirmed_amount_cents) throw new WidgetCommerceError('invalid_response');
    return row;
  }
  async function refundReceipt(id, revision) {
    const start = ticket(true);
    const body = { request_id: refundId(id) };
    if (revision !== undefined) { if (!Number.isSafeInteger(revision) || revision < 1) throw new WidgetCommerceError('refunds_invalid_request'); body.revision = revision; }
    const data = await invoke('receipt', body, refundsEndpoint), row = refundRequest(data.request), receipt = data.receipt;
    if (row.request_id !== id || !receipt || !UUID.test(receipt.receipt_id || '') || receipt.request_id !== id
      || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || (revision !== undefined && receipt.revision !== revision)
      || typeof receipt.body !== 'string' || receipt.body.length > 262144 || !receipt.body.length || receipt.revision > row.revision
      || !refundStamp(receipt.created_at) || receipt.content_type !== 'text/plain;charset=utf-8' || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '')
      || !['queued', 'accepted', 'failed', 'unconfigured', 'reconciliation_required'].includes(data.email_status)
      || !Array.isArray(data.events) || data.events.length > 101
      || data.events.some(event => !UUID.test(event.event_id || '') || event.request_id !== id || !Number.isSafeInteger(event.revision) || event.revision < 1
        || event.revision > row.revision || !/^[a-z][a-z0-9_]{0,63}$/.test(event.kind || '') || !['buyer', 'seller', 'system'].includes(event.actor_role)
        || typeof event.message !== 'string' || event.message.length > 2000 || !refundStamp(event.created_at))) throw new WidgetCommerceError('invalid_response');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(receipt.body)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== receipt.sha256) throw new WidgetCommerceError('invalid_response');
    current(start); return { ...data, request: row };
  }
  return { status, onboard, checkout, purchase, purchases, catalog, release, refundList, refundCreate, refundReply, refundExecute, refundEscalate, refundReceipt,
    dispose() { disposed = true; generation++; abortRequests(); requestKeys.clear(); } };
}
