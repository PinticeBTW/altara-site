import { formatWidgetPrice } from './widgetCommerce.js';

// Requests are account records. Only reconciled payment data can say that money
// was returned; a seller's approval is deliberately displayed separately.
export function mountWidgetRefunds(host, { api, getUserId, view = 'buyer', productKind = 'widget', alive: parentAlive = () => true, tr = (en, _pt) => en } = {}) {
  if (!['widget', 'theme'].includes(productKind)) throw new TypeError('Unsupported refund product.');
  const themes = productKind === 'theme';
  const productName = order => order?.product_name || order?.widget_name || (themes ? tr('Theme purchase', 'Compra de tema') : tr('Widget purchase', 'Compra de widget'));
  const owner = String(getUserId?.() || '');
  let disposed = false, loading = false, editing = false, busy = false, revision = 0, offset = 0, orders = [], requests = [], confirmationEmail = null, automaticRefunds = false;
  const replyDrafts = new Map();
  const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action, className = 'btn ghost') => { const node = el('button', text, className); node.type = 'button'; node.onclick = action; return node; };
  const current = () => !disposed && host.isConnected && parentAlive() && !!owner && String(getUserId?.() || '') === owner;
  const panel = el('section', '', 'widgetRefunds widgetPublishForm'); panel.dataset.refundView = view;
  const status = el('p', '', 'widgetMarketNotice'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const list = el('div', '', 'widgetMarketGrid');
  const refreshButton = button(tr('Refresh requests', 'Atualizar pedidos'), () => refresh());
  const more = button(tr('Load more', 'Carregar mais'), () => refresh('', true)); more.hidden = true;
  panel.append(el('h3', view === 'seller' ? tr('Buyer requests', 'Pedidos dos compradores') : tr('Help & refunds', 'Ajuda e reembolsos')),
    el('p', themes
      ? tr('You can request withdrawal within 14 days of payment under the ALTARA theme policy. Installing or applying a theme does not by itself refuse a request. Problems, non-conformity and other applicable rights can be raised later.', 'Podes pedir a livre resolução nos 14 dias após o pagamento segundo a política de temas ALTARA. Instalar ou aplicar um tema não é, por si só, motivo de recusa. Problemas, falta de conformidade e outros direitos aplicáveis podem ser comunicados depois.')
      : tr('You can request withdrawal within 14 days of payment under the ALTARA widget policy. Installing or using a widget does not by itself refuse a request. Problems, non-conformity and other applicable rights can be raised later.', 'Podes pedir a livre resolução nos 14 dias após o pagamento segundo a política de widgets ALTARA. Instalar ou usar o widget não é, por si só, motivo de recusa. Problemas, falta de conformidade e outros direitos aplicáveis podem ser comunicados depois.')),
    el('p', themes
      ? tr('Sending a request records your declaration and its time. It does not automatically move money. Save the server confirmation and follow the reply here. Never include card details, passwords or private theme files.', 'Enviar um pedido regista a tua declaração e a hora. Não movimenta dinheiro automaticamente. Guarda a confirmação do servidor e acompanha a resposta aqui. Nunca incluas dados de cartão, passwords ou ficheiros privados do tema.')
      : tr('Sending a request records your declaration and its time. It does not automatically move money. You can save the server confirmation and follow the reply here. Do not include card details, passwords or widget data.', 'Enviar um pedido regista a tua declaração e a hora. Não movimenta dinheiro automaticamente. Podes guardar a confirmação do servidor e acompanhar a resposta aqui. Não incluas dados de cartão, passwords ou dados guardados no widget.')));
  panel.append(el('p', themes
    ? tr('Your name, verified account contact and request messages are shared with the seller and ALTARA support to handle the case. Never send card details, passwords or private files.', 'O teu nome, o contacto verificado da conta e as mensagens do pedido são partilhados com o vendedor e o apoio ALTARA para tratar o caso. Nunca envies dados de cartão, passwords ou ficheiros privados.')
    : tr('Your name, verified account contact and request messages are shared with the seller and ALTARA support to handle the case. Never send card details, passwords or local widget data.', 'O teu nome, o contacto verificado da conta e as mensagens do pedido são partilhados com o vendedor e o apoio ALTARA para tratar o caso. Nunca envies dados de cartão, passwords ou dados locais do widget.')));
  const sellerNotice = el('p');
  if (view === 'seller') panel.append(sellerNotice);
  const support = el('a', tr('Contact ALTARA support', 'Contactar o apoio ALTARA'), 'btn ghost'); support.href = 'mailto:support@altaraapp.com';
  const policyLink = el('a', tr('Read the full refund policy', 'Ler a política completa de reembolsos'), 'btn ghost'); policyLink.href = themes ? 'https://www.altaraapp.com/theme-refunds' : 'https://www.altaraapp.com/widget-refunds'; policyLink.target = '_blank'; policyLink.rel = 'noopener noreferrer';
  panel.append(policyLink, support, refreshButton, status, list, more); host.append(panel);
  const controls = () => { refreshButton.disabled = loading || busy; more.disabled = loading || busy; };
  function errorMessage(error) {
    return error?.code === 'refunds_revision_conflict' ? tr('This request changed. Refresh it before replying. Your text is kept.', 'Este pedido mudou. Atualiza antes de responder. O teu texto mantém-se.')
      : error?.code === 'refunds_request_exists' ? tr('A request already exists. Refresh requests to open it.', 'Já existe um pedido. Atualiza os pedidos para o abrir.')
      : error?.code === 'refunds_name_required' ? tr('Enter your name for the withdrawal declaration.', 'Indica o teu nome para a declaração de livre resolução.')
      : error?.code === 'refunds_timely_withdrawal' ? tr('An in-period withdrawal cannot be refused. Refresh the request.', 'Uma livre resolução dentro do prazo não pode ser recusada. Atualiza o pedido.')
      : error?.code === 'refunds_email_required' ? tr('A verified account email is needed for the confirmation. Contact support.', 'É necessário um email verificado na conta para a confirmação. Contacta o apoio.')
      : error?.code === 'refunds_execution_disabled' ? tr('Automatic refunds are not available. Refresh requests or contact support. No new payment action has been confirmed.', 'Os reembolsos automáticos não estão disponíveis. Atualiza os pedidos ou contacta o apoio. Não foi confirmada uma nova operação financeira.')
      : ['refunds_idempotency_conflict', 'refunds_execution_conflict', 'refunds_execution_reconciliation_required'].includes(error?.code) ? tr('A refund instruction already exists or needs checking. Refresh its status; do not start another refund.', 'Já existe uma instrução de reembolso ou é necessário verificá-la. Atualiza o estado; não inicies outro reembolso.')
      : error?.code === 'refunds_confirmation_mismatch' ? tr('The refundable amount changed. Refresh and review the amount again. Your message is kept.', 'O montante reembolsável mudou. Atualiza e revê novamente o valor. A tua mensagem mantém-se.')
      : ['account_changed', 'sign_in_required'].includes(error?.code) ? tr('Sign in again and reopen your requests.', 'Inicia sessão novamente e reabre os teus pedidos.')
      : error?.code === 'refunds_denied' ? tr('This action is not available to this account. Refresh the requests.', 'Esta ação não está disponível para esta conta. Atualiza os pedidos.')
      : tr('Could not complete the request. Your text is kept; try again or contact support@altaraapp.com.', 'Não foi possível concluir o pedido. O teu texto mantém-se; tenta novamente ou contacta support@altaraapp.com.');
  }
  const money = cents => { const locale = /^pt\b/i.test(document.documentElement.lang) ? 'pt-PT' : 'en'; return cents === 0 ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(0) : formatWidgetPrice(cents, 'eur', locale); };
  const date = value => { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? tr('Unavailable', 'Indisponível') : parsed.toLocaleString(/^pt\b/i.test(document.documentElement.lang) ? 'pt-PT' : 'en'); };
  function requestStatus(row) {
    return ({ pending: tr('Request received · Awaiting review', 'Pedido recebido · Aguarda análise'), needs_info: tr('More information requested', 'Foi pedida mais informação'), approved_full: tr('Full refund approved · Payment confirmation separate', 'Reembolso total aprovado · Confirmação do pagamento em separado'), approved_partial: tr('Partial refund approved · Payment confirmation separate', 'Reembolso parcial aprovado · Confirmação do pagamento em separado'), refused: tr('Request refused · You can seek further help', 'Pedido recusado · Podes pedir mais ajuda'), escalated: tr('Sent to ALTARA support', 'Encaminhado para o apoio ALTARA') })[row.status];
  }
  function paymentStatus(order, execution) {
    if (order.state === 'refunded' && ['failed', 'reconciliation_required'].includes(execution?.status)) return themes
      ? tr('An access restriction from an earlier refund remains; the current result needs support review. The theme must not be reactivated until access is verified.', 'Existe uma restrição de acesso de um reembolso anterior; o resultado atual exige revisão do apoio. O tema não deve ser reativado até o acesso ser verificado.')
      : tr('An access restriction from an earlier refund remains; the current result needs support review. Saved widget data is kept.', 'Existe uma restrição de acesso de um reembolso anterior; o resultado atual exige revisão do apoio. Os dados guardados são conservados.');
    if (order.state === 'refunded') return themes
      ? tr('Payment confirms a full refund. Without another valid purchase, this paid theme is no longer available to apply. Your library record is kept.', 'O pagamento confirma o reembolso total. Sem outra compra válida, este tema pago deixa de estar disponível para aplicar. O registo da biblioteca é conservado.')
      : tr('Payment confirms a full refund. Paid access is paused; saved widget data is kept.', 'O pagamento confirma o reembolso total. O acesso pago fica em pausa; os dados guardados do widget são conservados.');
    if (Number.isSafeInteger(order.refunded_amount_cents) && order.refunded_amount_cents > 0) return tr(`Payment confirms ${money(order.refunded_amount_cents)} returned. This is separate from the request decision.`, `O pagamento confirma ${money(order.refunded_amount_cents)} devolvidos. Este valor é independente da decisão sobre o pedido.`);
    return tr('This history does not yet show a confirmed refund amount. Contact support if Stripe has already processed a refund.', 'Este histórico ainda não mostra um montante de reembolso confirmado. Contacta o apoio se o Stripe já processou um reembolso.');
  }
  function executionStatus(execution) {
    const states = {
      queued: tr('Refund instruction recorded · Waiting to be sent to Stripe. This is not confirmation that money was returned.', 'Instrução de reembolso registada · Aguarda envio para o Stripe. Isto não confirma dinheiro devolvido.'),
      processing: tr('Refund being processed · Do not repeat the payment action.', 'Reembolso em processamento · Não repitas a operação financeira.'),
      pending: tr('Stripe refund pending · Money returned is not yet confirmed.', 'Reembolso pendente no Stripe · A devolução do dinheiro ainda não está confirmada.'),
      requires_action: tr('Stripe requires attention for this refund. Contact ALTARA support; do not start another refund.', 'O Stripe precisa de uma ação neste reembolso. Contacta o apoio ALTARA; não inicies outro reembolso.'),
      succeeded: tr(`Stripe confirms this refund of ${money(execution.amount_cents)} succeeded. The original payment method may take time to display it.`, `O Stripe confirma que este reembolso de ${money(execution.amount_cents)} foi concluído. O método de pagamento original pode demorar a apresentá-lo.`),
      failed: tr('Stripe refund failed · A completed refund is not confirmed for this instruction. Contact support before retrying.', 'O reembolso falhou no Stripe · Esta instrução não confirma um reembolso concluído. Contacta o apoio antes de voltar a tentar.'),
      reconciliation_required: tr('Refund result needs verification · Do not repeat the payment action. Contact ALTARA support.', 'O resultado do reembolso precisa de verificação · Não repitas a operação financeira. Contacta o apoio ALTARA.'),
    };
    return states[execution.status] || tr('Refund status unavailable. Refresh requests or contact support before taking another payment action.', 'Estado do reembolso indisponível. Atualiza os pedidos ou contacta o apoio antes de outra operação financeira.');
  }
  const canExecute = (row, order) => view === 'seller' && automaticRefunds && typeof api.refundExecute === 'function' && row.can_execute === true && !row.execution && !!order && order.state === 'paid' && Number.isSafeInteger(order.refunded_amount_cents) && order.refunded_amount_cents >= 0 && order.refunded_amount_cents < order.price_cents;
  function label(text, input) { const node = el('label', text); node.append(input); return node; }
  async function run(form, operation, message, completed = () => {}) {
    if (!current() || busy || loading) return;
    busy = true; controls();
    const fields = [...form.querySelectorAll('input'), ...form.querySelectorAll('select'), ...form.querySelectorAll('textarea'), ...form.querySelectorAll('button')];
    const prior = fields.map(node => node.disabled); fields.forEach(node => { node.disabled = true; });
    const ticket = revision;
    try {
      await operation(); if (!current() || ticket !== revision) return; completed();
      editing = false; busy = false; await refresh(message);
    } catch (error) { if (current() && ticket === revision) {
      status.textContent = errorMessage(error); fields.forEach((node, index) => { node.disabled = prior[index]; });
      if (['refunds_revision_conflict', 'refunds_confirmation_mismatch'].includes(error?.code)) { busy = false; await refresh(errorMessage(error)); }
    } }
    finally { if (current() && ticket === revision) { busy = false; controls(); } }
  }
  function createForm(order, target) {
    if (!current() || busy || loading || editing) return;
    editing = true;
    const form = el('form', '', 'widgetPublishForm'); form.dataset.refundForm = 'create';
    const basis = el('select'); basis.name = 'basis';
    const choices = [['withdrawal', tr('Withdrawal declaration', 'Declaração de livre resolução')], ['fault', tr('Problem or non-conformity', 'Problema ou falta de conformidade')], ['other', tr('Other help', 'Outra ajuda')]].filter(([value]) => !requests.some(row => row.order_id === order.order_id && row.basis === value));
    for (const [value, text] of choices) { const option = el('option', text); option.value = value; basis.append(option); }
    basis.value = choices[0]?.[0] || 'other';
    const name = el('input'); name.name = 'customer_name'; name.autocomplete = 'name'; name.maxLength = 120; name.required = true;
    const contact = el('p', confirmationEmail ? tr(`Confirmation will be sent to: ${confirmationEmail}`, `A confirmação será enviada para: ${confirmationEmail}`) : tr('No verified confirmation email is available. Verify your account email and refresh requests, or send your declaration to support@altaraapp.com.', 'Não existe um email verificado para a confirmação. Verifica o email da conta e atualiza os pedidos, ou envia a tua declaração para support@altaraapp.com.'));
    const reason = el('textarea'); reason.name = 'reason'; reason.maxLength = 2000; reason.rows = 4;
    const explanation = el('p', tr('I declare that I wish to withdraw from this widget purchase. A reason is optional. The declaration is recorded when you submit it.', 'Declaro que pretendo resolver esta compra de widget. O motivo é opcional. A declaração é registada quando a enviares.'));
    const send = button(tr('Confirm withdrawal', 'Confirmar livre resolução'), () => {}, 'btn primary'); send.type = 'submit'; send.disabled = !confirmationEmail;
    basis.onchange = () => { name.required = basis.value === 'withdrawal'; explanation.hidden = basis.value !== 'withdrawal'; send.textContent = basis.value === 'withdrawal' ? tr('Confirm withdrawal', 'Confirmar livre resolução') : tr('Send request', 'Enviar pedido'); };
    basis.onchange();
    form.append(label(tr('Type of request', 'Tipo de pedido'), basis), label(tr('Your name', 'O teu nome'), name), contact, label(tr('Details (optional)', 'Detalhes (opcional)'), reason), explanation, send,
      button(tr('Cancel', 'Cancelar'), () => { if (!busy) { form.remove(); target.hidden = false; editing = false; } }));
    form.onsubmit = event => { event.preventDefault(); if (!confirmationEmail) { status.textContent = errorMessage({ code: 'refunds_email_required' }); return; } if (basis.value === 'withdrawal' && !name.value.trim()) { status.textContent = errorMessage({ code: 'refunds_name_required' }); name.focus(); return; }
      return run(form, () => api.refundCreate({ order_id: order.order_id, basis: basis.value, reason: reason.value, customer_name: name.value }), tr('Request recorded. Your confirmation is available below. No money was moved by this submission.', 'Pedido registado. A confirmação está disponível abaixo. Este envio não movimentou dinheiro.')); };
    target.hidden = true; target.parentNode.append(form); name.focus();
  }
  function replyForm(row, card, order) {
    const form = el('form', '', 'widgetPublishForm'); form.dataset.refundForm = 'reply';
    const financial = canExecute(row, order), financialHistory = !!row.execution, manualApproval = view === 'seller' && !automaticRefunds && !financialHistory;
    const refunded = order?.refunded_amount_cents || 0;
    const decision = el('select'); decision.name = 'decision';
    const choices = row.can_reply ? [['message', tr('Message', 'Mensagem')]] : [];
    if (view === 'seller') {
      const protectedWithdrawal = row.basis === 'withdrawal' && row.withdrawal_in_period;
      if (financial || manualApproval) { choices.push(['approve_full', financial ? tr('Refund the remaining purchase amount', 'Reembolsar o valor restante da compra') : tr('Record full approval (manual payment)', 'Registar aprovação total (pagamento manual)')]); if (!protectedWithdrawal) choices.push(['approve_partial', financial ? tr('Refund part of the purchase', 'Reembolsar parte da compra') : tr('Record partial approval (manual payment)', 'Registar aprovação parcial (pagamento manual)')]); }
      if (row.can_reply && !financialHistory) { choices.push(['needs_info', tr('Ask for information', 'Pedir informação')]); if (row.can_refuse && !protectedWithdrawal) choices.push(['refuse', tr('Refuse request', 'Recusar pedido')]); }
    }
    for (const [value, text] of choices) { const option = el('option', text); option.value = value; decision.append(option); } decision.value = choices[0]?.[0] || 'message';
    const amount = el('input'); amount.name = 'approved_amount_cents'; amount.type = 'number'; amount.min = String(financial ? refunded + 1 : 1); amount.max = String(order ? order.price_cents - 1 : 100000); amount.step = '1';
    const amountLabel = label(financial ? tr('Total to refund for this purchase, in cents (including any amount already returned)', 'Total a reembolsar nesta compra, em cêntimos (inclui o valor já devolvido)') : tr('Approved amount in cents (e.g. 50 = €0.50)', 'Montante aprovado em cêntimos (ex.: 50 = 0,50 €)'), amount); amountLabel.hidden = true;
    const message = el('textarea'); message.name = 'message'; message.maxLength = 2000; message.rows = 3;
    const messageLabel = label(tr('Message', 'Mensagem'), message);
    form.append(label(tr('Reply', 'Resposta'), decision), amountLabel, messageLabel);
    const send = button(tr('Send reply', 'Enviar resposta'), () => {}, 'btn primary'); send.type = 'submit'; form.append(send);
    let confirmation = null;
    const saveDraft = () => replyDrafts.set(row.request_id, { decision: decision.value, amount: amount.value, message: message.value });
    const changed = () => { editing = true; saveDraft(); confirmation?.remove(); confirmation = null; send.hidden = false; amountLabel.hidden = decision.value !== 'approve_partial'; amount.required = !amountLabel.hidden; message.required = ['message', 'refuse', 'needs_info'].includes(decision.value); send.textContent = financial && ['approve_full', 'approve_partial'].includes(decision.value) ? tr('Review refund', 'Rever reembolso') : tr('Send reply', 'Enviar resposta'); };
    decision.onchange = changed; amount.oninput = changed; message.oninput = changed;
    const draft = replyDrafts.get(row.request_id);
    if (draft) { decision.value = choices.some(([value]) => value === draft.decision) ? draft.decision : choices[0]?.[0] || 'message'; amount.value = draft.amount; message.value = draft.message; editing = true; }
    amountLabel.hidden = decision.value !== 'approve_partial'; amount.required = !amountLabel.hidden; message.required = ['message', 'refuse', 'needs_info'].includes(decision.value); send.textContent = financial && ['approve_full', 'approve_partial'].includes(decision.value) ? tr('Review refund', 'Rever reembolso') : tr('Send reply', 'Enviar resposta');
    if (view === 'seller') form.append(el('p', financial ? tr('You will review the exact amount before sending a refund instruction. The original payment method is used and ALTARA returns its proportional commission to you automatically. Original Stripe processing fees may remain payable by you. An in-period withdrawal must be refunded in full.', 'Vais rever o valor exato antes de enviar uma instrução de reembolso. É usado o método de pagamento original e a ALTARA devolve-te automaticamente a comissão proporcional. As taxas originais de processamento Stripe podem continuar a teu cargo. Uma livre resolução dentro do prazo deve ser reembolsada integralmente.') : manualApproval ? tr('Approval records a decision only; it does not issue a Stripe refund. Complete and reconcile the payment action separately in Stripe. Do not refuse an in-period withdrawal because the widget was used.', 'Aprovar regista apenas uma decisão; não executa um reembolso no Stripe. Faz e reconcilia a operação financeira em separado no Stripe. Não recuses uma livre resolução dentro do prazo por o widget ter sido usado.') : tr('No new automatic refund is available for this request. Follow the recorded refund status or contact ALTARA support before taking another payment action.', 'Não está disponível um novo reembolso automático neste pedido. Acompanha o estado registado ou contacta o apoio ALTARA antes de outra operação financeira.')));
    form.onsubmit = event => { event.preventDefault(); const value = decision.value === 'approve_partial' ? Number(amount.value) : null;
      if (!current() || busy || loading || confirmation) return;
      saveDraft();
      if (message.required && !message.value.trim()) { status.textContent = tr('Write a message for this reply. Withdrawal declarations do not require a reason.', 'Escreve uma mensagem para esta resposta. As declarações de livre resolução não exigem motivo.'); message.focus(); return; }
      if (decision.value === 'approve_partial' && (!Number.isSafeInteger(value) || value < Number(amount.min) || value > Number(amount.max))) { status.textContent = financial ? tr('Enter a whole number of cents above the amount already returned and below the purchase amount.', 'Indica um número inteiro de cêntimos superior ao valor já devolvido e inferior ao valor da compra.') : tr('Enter a whole number of cents below the purchase amount.', 'Indica um número inteiro de cêntimos inferior ao valor da compra.'); return; }
      if (financial && ['approve_full', 'approve_partial'].includes(decision.value)) {
        const target = decision.value === 'approve_full' ? order.price_cents : value, increment = target - refunded;
        if (!Number.isSafeInteger(increment) || increment <= 0) { status.textContent = errorMessage({ code: 'refunds_confirmation_mismatch' }); return; }
        const payload = { request_id: row.request_id, expected_revision: row.revision, decision: decision.value, approved_amount_cents: value, confirmed_amount_cents: increment, message: message.value };
        const review = el('section', '', 'widgetMarketNotice'); review.setAttribute('role', 'group'); review.setAttribute('aria-label', tr('Confirm financial refund', 'Confirmar reembolso financeiro'));
        review.append(el('h5', tr('Review the refund', 'Revê o reembolso')), el('p', `${tr('Return now to the original payment method', 'Devolver agora para o método de pagamento original')}: ${money(increment)}`), el('p', `${tr('Total returned after this refund', 'Total devolvido após este reembolso')}: ${money(target)} · ${tr('Already recorded as returned', 'Já registado como devolvido')}: ${money(refunded)}`), el('p', tr('This confirmation sends a real refund instruction. ALTARA also returns its proportional commission to the creator. Stripe checks the current payment before execution; a changed amount needs review and is not silently adjusted. The refund may be pending or fail; wait for the payment confirmation. Original Stripe processing fees may remain payable by the creator.', 'Esta confirmação envia uma instrução real de reembolso. A ALTARA devolve também a comissão proporcional ao criador. O Stripe verifica o pagamento atual antes da execução; um valor diferente exige análise e não é ajustado em silêncio. O reembolso pode ficar pendente ou falhar; aguarda a confirmação financeira. As taxas originais de processamento Stripe podem continuar a cargo do criador.')));
        const confirm = button(tr(`Approve and refund ${money(increment)}`, `Aprovar e reembolsar ${money(increment)}`), () => {
          if (!review.isConnected || confirmation !== review) return;
          return run(form, () => api.refundExecute(payload), tr('Refund instruction recorded. Check its status below; this does not yet confirm money returned.', 'Instrução de reembolso registada. Consulta o estado abaixo; isto ainda não confirma dinheiro devolvido.'), () => replyDrafts.delete(row.request_id));
        }, 'btn primary');
        review.append(confirm, button(tr('Back to reply', 'Voltar à resposta'), () => { if (!busy) { review.remove(); confirmation = null; send.hidden = false; send.focus(); } })); form.append(review); confirmation = review; send.hidden = true; confirm.focus(); return;
      }
      return run(form, () => api.refundReply({ request_id: row.request_id, expected_revision: row.revision, decision: decision.value, message: message.value, approved_amount_cents: value }), tr('Reply recorded. Payment confirmation remains separate.', 'Resposta registada. A confirmação do pagamento continua em separado.'), () => replyDrafts.delete(row.request_id)); };
    card.append(form);
  }
  function requestCard(row, order) {
    const card = el('article', '', 'widgetMarketCard'); card.dataset.refundRequest = row.request_id;
    card.append(el('h4', productName(order)), el('strong', requestStatus(row)), el('p', `${tr('Request', 'Pedido')}: ${row.request_id} · ${tr('Revision', 'Revisão')} ${row.revision}`), el('p', `${date(row.created_at)} · ${row.basis === 'withdrawal' ? tr('Withdrawal declaration', 'Declaração de livre resolução') : row.basis === 'fault' ? tr('Problem or non-conformity', 'Problema ou falta de conformidade') : tr('Other help', 'Outra ajuda')}`));
    if (row.customer_name) card.append(el('p', row.customer_name)); if (row.reason) card.append(el('p', row.reason));
    if (row.approved_amount_cents != null) card.append(el('p', `${tr('Amount approved (not payment confirmation)', 'Montante aprovado (não confirma o pagamento)')}: ${money(row.approved_amount_cents)}`));
    if (order) card.append(el('p', paymentStatus(order, row.execution)));
    if (row.execution) {
      card.append(el('p', executionStatus(row.execution)));
      card.append(el('p', row.execution.fee_refund_status === 'succeeded' ? tr('The proportional ALTARA commission return to the creator is confirmed.', 'Está confirmada a devolução da comissão proporcional ALTARA ao criador.') : row.execution.fee_refund_status === 'reconciliation_required' ? tr('The ALTARA commission return needs verification. Contact support; do not repeat the customer refund.', 'A devolução da comissão ALTARA precisa de verificação. Contacta o apoio; não repitas o reembolso ao cliente.') : row.execution.fee_refund_status === 'not_applicable' ? tr('No ALTARA commission return applies to this payment.', 'Não se aplica uma devolução de comissão ALTARA a este pagamento.') : tr('The proportional ALTARA commission return to the creator is awaiting confirmation.', 'A devolução da comissão proporcional ALTARA ao criador aguarda confirmação.')));
    }
    if (row.basis === 'withdrawal') card.append(el('p', row.withdrawal_in_period ? tr('The server recorded this withdrawal within the 14-day policy period.', 'O servidor registou esta livre resolução dentro dos 14 dias da política.') : tr('The recorded declaration is outside the policy period. The request can still be reviewed; applicable rights for problems remain separate.', 'A declaração registada está fora do prazo da política. O pedido pode ser analisado; os direitos aplicáveis em caso de problemas são independentes.')));
    let receiptBusy = false;
    const receiptButton = button(tr('View confirmation & messages', 'Ver confirmação e mensagens'), async () => {
      if (!current() || busy || loading || receiptBusy) return; receiptBusy = true; receiptButton.disabled = true;
      try {
        const data = await api.refundReceipt(row.request_id); if (!current()) return;
        const old = card.querySelector('.widgetRefundReceipt'); old?.remove();
        const receipt = el('section', '', 'widgetRefundReceipt');
        receipt.append(el('h5', tr('Server confirmation', 'Confirmação do servidor')), el('p', `${date(data.receipt.created_at)} · ${tr('Revision', 'Revisão')} ${data.receipt.revision}`));
        receipt.append(el('p', data.email_status === 'accepted' ? tr('The email service accepted the confirmation. This does not prove delivery to your inbox.', 'O serviço de email aceitou a confirmação. Isto não prova a entrega na tua caixa de entrada.') : data.email_status === 'queued' ? tr('Email confirmation queued. You can save it here now.', 'Confirmação por email em fila. Podes guardá-la aqui já.') : tr('Email delivery is not confirmed. Save the confirmation here or contact support.', 'A entrega por email não está confirmada. Guarda a confirmação aqui ou contacta o apoio.')));
        for (const event of data.events) receipt.append(el('p', `${date(event.created_at)} · ${event.actor_role}: ${event.message || event.kind}`));
        receipt.append(button(tr('Save confirmation (.txt)', 'Guardar confirmação (.txt)'), () => {
          if (!current()) return;
          const url = URL.createObjectURL(new Blob([data.receipt.body], { type: data.receipt.content_type }));
          const link = el('a'); link.href = url; link.download = `altara-request-${row.request_id}-r${data.receipt.revision}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        })); card.append(receipt);
      } catch (error) { if (current()) status.textContent = errorMessage(error); }
      finally { if (current()) { receiptBusy = false; receiptButton.disabled = false; } }
    }); card.append(receiptButton);
    if (row.can_reply || canExecute(row, order)) replyForm(row, card, order);
    if (row.can_escalate) {
      const form = el('form', '', 'widgetPublishForm'); form.dataset.refundForm = 'escalate';
      const message = el('textarea'); message.name = 'message'; message.maxLength = 2000; message.rows = 2; message.oninput = () => { editing = true; };
      const send = button(tr('Ask ALTARA support to review', 'Pedir análise ao apoio ALTARA'), () => {}); send.type = 'submit';
      form.append(label(tr('Additional information (optional)', 'Informação adicional (opcional)'), message), send);
      form.onsubmit = event => { event.preventDefault(); return run(form, () => api.refundEscalate({ request_id: row.request_id, expected_revision: row.revision, message: message.value }), tr('Review request recorded for ALTARA support.', 'Pedido de análise registado para o apoio ALTARA.')); }; card.append(form);
    }
    return card;
  }
  function paint() {
    sellerNotice.textContent = automaticRefunds ? tr('Refunds can be approved and sent to Stripe here after reviewing the exact amount. ALTARA returns its proportional commission to the creator automatically. Stripe processing fees may remain payable by the creator. A request, approval or queued instruction is not confirmation that money was returned.', 'Podes aprovar e enviar reembolsos ao Stripe aqui, depois de rever o valor exato. A ALTARA devolve automaticamente a comissão proporcional ao criador. As taxas Stripe podem continuar a cargo do criador. Um pedido, uma aprovação ou uma instrução em fila não confirma dinheiro devolvido.') : tr('Automatic refunds are not available in this environment. Approval records a decision only. The seller returns the agreed amount in Stripe, and ALTARA handles its proportional commission separately. Reconcile any existing refund before another payment action.', 'Os reembolsos automáticos não estão disponíveis neste ambiente. Aprovar regista apenas uma decisão. O vendedor devolve o valor acordado no Stripe e a ALTARA trata da comissão proporcional em separado. Reconcilia um reembolso existente antes de outra operação financeira.');
    list.replaceChildren();
    for (const order of orders) {
      const card = el('article', '', 'widgetMarketCard'); card.dataset.refundOrder = order.order_id;
      const paymentReview = requests.filter(row => row.order_id === order.order_id).map(row => row.execution).find(execution => ['failed', 'reconciliation_required'].includes(execution?.status));
      card.append(el('h4', productName(order)), el('p', `${money(order.price_cents)} · ${date(order.paid_at || order.created_at)}`), el('p', paymentStatus(order, paymentReview)));
      if (order.withdrawal_deadline_at) card.append(el('p', `${tr('14-day policy deadline', 'Fim dos 14 dias da política')}: ${date(order.withdrawal_deadline_at)}`));
      if (view === 'buyer' && order.paid_at && ['withdrawal', 'fault', 'other'].some(basis => !requests.some(row => row.order_id === order.order_id && row.basis === basis))) { const request = button(tr('Request withdrawal or help', 'Pedir livre resolução ou ajuda'), () => createForm(order, request)); card.append(request); }
      list.append(card);
    }
    for (const row of requests) list.append(requestCard(row, orders.find(order => order.order_id === row.order_id)));
    if (!orders.length && !requests.length) list.append(el('p', view === 'seller' ? tr('No buyer requests for this account.', 'Sem pedidos de compradores nesta conta.') : themes
      ? tr('No theme purchase records for this account. Refunded and uninstalled purchases remain in this history when available.', 'Sem registos de compras de temas nesta conta. As compras reembolsadas ou desinstaladas mantêm-se neste histórico quando disponíveis.')
      : tr('No widget purchase records for this account. Refunded and uninstalled purchases remain in this history when available.', 'Sem registos de compras de widgets nesta conta. As compras reembolsadas ou desinstaladas mantêm-se neste histórico quando disponíveis.')));
  }
  async function refresh(message = '', append = false) {
    if (!current() || loading || busy) return; loading = true; controls(); const ticket = ++revision;
    const fields = [...list.querySelectorAll('input'), ...list.querySelectorAll('select'), ...list.querySelectorAll('textarea'), ...list.querySelectorAll('button')], prior = fields.map(node => node.disabled);
    fields.forEach(node => { node.disabled = true; });
    status.textContent = tr('Checking requests…', 'A verificar pedidos…');
    try {
      const data = await api.refundList({ view, limit: 50, offset: append ? offset : 0 }); if (!current() || ticket !== revision) return;
      // Surface identity is fixed by its endpoint. Never render financial controls
      // for a different product, including during a stale module/backend rollout.
      if (!Array.isArray(data.orders) || data.orders.some(row => (row.product_kind || 'widget') !== productKind)) throw new Error('Refund product mismatch.');
      orders = append ? [...new Map([...orders, ...data.orders].map(row => [row.order_id, row])).values()] : data.orders;
      requests = append ? [...new Map([...requests, ...data.requests].map(row => [row.request_id, row])).values()] : data.requests;
      confirmationEmail = data.confirmation_email;
      automaticRefunds = data.automatic_refunds_enabled === true && typeof api.refundExecute === 'function';
      offset = (append ? offset : 0) + 50; more.hidden = !data.has_more; editing = false; paint();
      status.textContent = message || tr('Requests updated. Decisions and payment confirmations are shown separately.', 'Pedidos atualizados. As decisões e as confirmações de pagamento são apresentadas em separado.');
    } catch (error) { if (current() && ticket === revision) status.textContent = message ? `${message} ${tr('The list could not be refreshed. Use Refresh requests to check it; do not repeat the accepted submission.', 'Não foi possível atualizar a lista. Usa Atualizar pedidos para a consultar; não repitas o envio já aceite.')}` : errorMessage(error); }
    finally { if (current() && ticket === revision) { fields.forEach((node, index) => { if (node.isConnected) node.disabled = prior[index]; }); loading = false; controls(); } }
  }
  const focus = () => { if (!current()) { dispose(); return; } if (!editing) void refresh(); };
  globalThis.addEventListener?.('focus', focus);
  function dispose() { if (disposed) return; disposed = true; revision++; globalThis.removeEventListener?.('focus', focus); panel.remove(); orders = []; requests = []; confirmationEmail = null; replyDrafts.clear(); }
  void refresh();
  return { refresh, dispose };
}

export function mountThemeRefunds(host, options = {}) {
  return mountWidgetRefunds(host, { ...options, productKind: 'theme' });
}
