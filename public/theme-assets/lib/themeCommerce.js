import { createWidgetCommerce, WidgetCommerceError, parseWidgetEuroPrice, formatWidgetPrice } from './widgetCommerce.js';

export const THEME_REFUND_POLICY_VERSION = 'themes-refunds-2026-10-15-v1';
const messages = {
  sign_in_required:'Sign in to buy or sell themes.',
  account_changed:'Your account changed. Open the theme again.',
  purchase_required:'Buy this theme before previewing or installing it.',
  payments_unavailable:'Theme payments are not available yet. Free themes still work.',
  seller_not_ready:'The creator must finish payment setup before selling this theme.',
  seller_country_unavailable:'Paid theme sales are not available in your country yet.',
  unavailable:'This theme is not available for purchase.',
  offer_changed:'A newer release or price is available. Refresh this theme before buying.',
  network_error:'Could not complete the theme request. Check your connection and try again.',
  invalid_response:'Could not verify the theme response. Please try again.',
  refund_policy_required:'Read the theme refund information before continuing to checkout. Refresh this page if necessary.',
};
export class ThemeCommerceError extends WidgetCommerceError {
  constructor(code = 'network_error') {
    super(code); this.name='ThemeCommerceError';
    if (Object.hasOwn(messages, this.code)) this.message=messages[this.code];
  }
}
function rethrow(error) { throw new ThemeCommerceError(error instanceof WidgetCommerceError ? error.code : 'network_error'); }
export function parseThemeEuroPrice(value) { try { return parseWidgetEuroPrice(value); } catch(error) { rethrow(error); } }
export function formatThemePrice(...args) { try { return formatWidgetPrice(...args); } catch(error) { rethrow(error); } }

// The browser selects a fixed endpoint, never the authoritative kind of an
// order. Each endpoint independently derives its product and authenticated actor.
export function createThemeCommerce({ client, getUserId, getActor, clientEnvironment } = {}) {
  const commerce = createWidgetCommerce({ client, getUserId:getUserId || getActor, clientEnvironment, productKind:'theme' });
  const result = {};
  for (const name of ['status','onboard','checkout','purchase','purchases','refundList','refundCreate','refundReply',
    'refundExecute','refundEscalate','refundReceipt']) result[name] = async (...args) => {
      try { return await commerce[name](...args); } catch(error) { rethrow(error); }
    };
  return { ...result, dispose:commerce.dispose, prepareCheckout:result.checkout, readPurchase:result.purchase,
    refresh:result.purchase, library:result.purchases };
}
