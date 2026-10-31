import { normalizeAltaraLocale, localeIntlTag } from './locale.js';

// Billing UI only. These labels never choose a market or grant an entitlement.
const COPY = {
  en: { loading: 'Loading prices…', unavailable: 'Prices are unavailable. Please try again.', brl_offer_unavailable: 'Brazil pricing is not available yet.', catalog_stale: 'Prices changed. Review the current offer and try again.', auth: 'Sign in again to continue.', failed: 'Could not open checkout. Please try again.', portal: 'Could not open subscription management. Please try again.', retry: 'Reload prices', monthly: 'Billed monthly', yearly: 'Billed yearly', saving: 'Save {percent} vs monthly', success: 'Checkout completed. Your subscription is being confirmed.', cancelled: 'Checkout cancelled.', updated: 'Refreshing your subscription status…', market: 'Billing currency', subscription_exists_use_portal: 'You already have a subscription. Manage it in the billing portal.' },
  'pt-PT': { loading: 'A carregar preços…', unavailable: 'Os preços estão indisponíveis. Tenta novamente.', brl_offer_unavailable: 'Os preços para o Brasil ainda não estão disponíveis.', catalog_stale: 'Os preços mudaram. Revê a oferta atual e tenta novamente.', auth: 'Inicia sessão novamente para continuar.', failed: 'Não foi possível abrir o pagamento. Tenta novamente.', portal: 'Não foi possível abrir a gestão da subscrição. Tenta novamente.', retry: 'Recarregar preços', monthly: 'Cobrado mensalmente', yearly: 'Cobrado anualmente', saving: 'Poupa {percent} face ao mensal', success: 'Pagamento concluído. A tua subscrição está a ser confirmada.', cancelled: 'Pagamento cancelado.', updated: 'A atualizar o estado da tua subscrição…', market: 'Moeda de faturação', subscription_exists_use_portal: 'Já tens uma subscrição. Gere-a no portal de faturação.' },
  'pt-BR': { loading: 'Carregando preços…', unavailable: 'Os preços estão indisponíveis. Tente novamente.', brl_offer_unavailable: 'Os preços para o Brasil ainda não estão disponíveis.', catalog_stale: 'Os preços mudaram. Confira a oferta atual e tente novamente.', auth: 'Entre na sua conta novamente para continuar.', failed: 'Não foi possível abrir o pagamento. Tente novamente.', portal: 'Não foi possível abrir o gerenciamento da assinatura. Tente novamente.', retry: 'Recarregar preços', monthly: 'Cobrança mensal', yearly: 'Cobrança anual', saving: 'Economize {percent} em relação ao mensal', success: 'Checkout concluído. Sua assinatura está sendo confirmada.', cancelled: 'Checkout cancelado.', updated: 'Atualizando o status da sua assinatura…', market: 'Moeda de cobrança', subscription_exists_use_portal: 'Você já tem uma assinatura. Gerencie pelo portal de cobrança.' },
};

export function billingText(locale, key) { const copy = COPY[normalizeAltaraLocale(locale)]; return Object.hasOwn(copy, key) ? copy[key] : copy.unavailable; }

export function validatePublicBillingCatalog(value) {
  if (!value || value.schema !== 1 || !['BR', 'DEFAULT'].includes(value.market)
    || !/^[a-f0-9]{64}$/.test(value.revision) || !Array.isArray(value.offers) || value.offers.length !== 4) throw new Error('catalog_unavailable');
  const seen = new Set();
  for (const e of value.offers) {
    const key = `${e.plan}:${e.interval}`;
    if (!['core', 'nova'].includes(e.plan) || !['monthly', 'yearly'].includes(e.interval) || seen.has(key)
      || e.currency !== (value.market === 'BR' ? 'brl' : 'eur') || !Number.isSafeInteger(e.unit_amount)
      || e.unit_amount <= 0 || e.status !== 'active') throw new Error('catalog_unavailable');
    seen.add(key);
  }
  return value;
}

export function billingPriceLabel(offer, locale) {
  return new Intl.NumberFormat(localeIntlTag(locale), { style: 'currency', currency: offer.currency.toUpperCase() }).format(offer.unit_amount / 100);
}

export function annualSavings(monthly, yearly) {
  if (!monthly || !yearly || monthly.currency !== yearly.currency || monthly.plan !== yearly.plan) return 0;
  return Math.max(0, 1 - yearly.unit_amount / (monthly.unit_amount * 12));
}

export function renderBillingPrices(root, catalog, locale, errorCode = '') {
  root.querySelectorAll('[data-billing-price]').forEach(el => {
    const [plan, interval] = el.dataset.billingPrice.split(':');
    const offer = catalog?.offers.find(e => e.plan === plan && e.interval === interval);
    el.textContent = offer ? billingPriceLabel(offer, locale) : billingText(locale, errorCode || 'loading');
  });
  root.querySelectorAll('[data-billing-period]').forEach(el => { el.textContent = billingText(locale, el.dataset.billingPeriod); });
  root.querySelectorAll('[data-billing-saving]').forEach(el => {
    const plan = el.dataset.billingSaving;
    const monthly = catalog?.offers.find(e => e.plan === plan && e.interval === 'monthly');
    const yearly = catalog?.offers.find(e => e.plan === plan && e.interval === 'yearly');
    const savings = annualSavings(monthly, yearly);
    el.textContent = savings > 0 ? billingText(locale, 'saving').replace('{percent}', new Intl.NumberFormat(localeIntlTag(locale), { style: 'percent', maximumFractionDigits: 1 }).format(savings)) : '';
    el.hidden = !savings;
  });
}

// Account-bound, short-lived in-memory display snapshot. A checkout always revalidates server-side.
export function createBillingCatalogState({ now = Date.now } = {}) {
  let owner = '', value = null, error = '', loading = null, generation = 0, fetchedAt = 0;
  function bind(userId) {
    if (owner !== userId) { owner = userId; value = null; error = ''; loading = null; fetchedAt = 0; generation++; }
  }
  return {
    read(userId) { bind(userId); return { catalog: now() - fetchedAt < 60000 ? value : null, error, loading: !!loading }; },
    async load(userId, fetchCatalog, force = false) {
      bind(userId);
      if (loading) return loading;
      if (!force && (error || (value && now() - fetchedAt < 60000))) return value;
      const token = ++generation;
      value = null; error = '';
      const work = Promise.resolve().then(fetchCatalog).then(v => {
        const checked = validatePublicBillingCatalog(v);
        if (generation === token) { value = checked; fetchedAt = now(); }
        return generation === token ? value : null;
      }).catch(e => { if (generation === token) error = e?.message || 'catalog_unavailable'; return null; })
        .finally(() => { if (generation === token) loading = null; });
      loading = work;
      return work;
    },
  };
}
