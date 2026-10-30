import { createCommunityThemeMarketplace } from './communityThemeMarketplace.js';
import { createCommunityThemeLibrary } from './communityThemePackages.js';
import { createThemeCommerce } from './themeCommerce.js';
import { mountThemeRefunds } from './widgetRefunds.js';

// Loaded only when account themes are opened or a cached account release needs
// verification. Local file themes keep their offline, request-free workflow.
export function createCommunityThemeApp(document, { client, getActor, storage, runtime, ui,
  getLanguage = () => document.documentElement.lang, onChange = () => {}, requestSignIn = () => {},
  requestOpenWebsite = () => {} } = {}) {
  const owner = String(getActor?.() || '');
  let disposed = false, panel = null, refundDialog = null;
  const owns = () => !disposed && owner && String(getActor?.() || '') === owner;
  const library = createCommunityThemeLibrary(storage, owner);
  const commerce = createThemeCommerce({client, getUserId:getActor});
  const tr = (en, pt) => /^pt/i.test(String(getLanguage())) ? pt : en;
  function closeRefunds() { panel?.dispose(); panel = null; refundDialog?.close(); refundDialog?.remove(); refundDialog = null; }
  function refunds(view) {
    if (!owns()) return; closeRefunds();
    const dialog = document.createElement('dialog'); refundDialog = dialog;
    dialog.className = 'communityThemesDialog'; dialog.dataset.communityThemesTrusted = 'true';
    dialog.setAttribute('aria-label', tr('Theme purchases, help & refunds', 'Compras de temas, ajuda e reembolsos'));
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn ghost'; close.textContent = tr('Close', 'Fechar'); close.onclick = closeRefunds;
    const host = document.createElement('div'); host.className = 'communityThemesDialog__body'; dialog.append(close, host); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeRefunds(); });
    panel = mountThemeRefunds(host, {api:commerce,getUserId:getActor,view,alive:owns,tr}); dialog.showModal();
  }
  const market = createCommunityThemeMarketplace(document, {client,getActor,storage,runtime,ui,getLanguage,
    onChange,requestSignIn,requestOpenWebsite,onRefunds:()=>refunds('buyer'),onSellerRequests:()=>refunds('seller')});
  const account = market.getAccount(); account.start();
  return {
    account,
    async authorize(source, id) {
      if (!owns()) return false;
      await account.refresh();
      if (!owns()) return false;
      const item = library.read().installs.find(row => row.id === id);
      return !!item && !item.source?.disabled && !item.source?.missingPackage
        && item.source?.accountId === source.accountId && item.source?.releaseId === source.releaseId
        && item.source?.projectId === source.projectId && item.source?.sha256 === source.sha256;
    },
    async open(view = 'library', projectId = null) {
      if (!owns()) return;
      market.open(view); if (projectId) void market.showProject(projectId);
    },
    refresh: () => account.refresh(),
    beforeActivate: async id => {
      const item = library.read().installs.find(row => row.id === id);
      // The runtime performs the paid check at its final presentation boundary.
      // Free account releases still refresh revocation/update metadata here.
      if (!item?.source?.paid) await account.refresh();
    },
    uninstall: item => account.uninstall(item),
    dispose() { if (disposed) return; disposed = true; closeRefunds(); market.suspend(); commerce.dispose(); },
  };
}
