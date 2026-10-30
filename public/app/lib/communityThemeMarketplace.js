import { createCommunityThemeLibrary, validateCommunityThemePackage } from './communityThemePackages.js';
import { createCommunityThemeAccount, verifyPublishedThemeRelease, canonicalThemeJson } from './communityThemeAccount.js';
import { COMMUNITY_THEME_VISUAL_STARTER } from './communityThemeEditor.js';
import { createThemeCommerce, parseThemeEuroPrice, formatThemePrice, THEME_REFUND_POLICY_VERSION } from './themeCommerce.js';
export function createCommunityThemeMarketplace(document, { client, getActor, getLanguage = () => document.documentElement.lang, storage = document.defaultView.localStorage, runtime, ui, onChange = () => { }, starterPackage, mount = null, website = false, requestSignIn = () => { }, requestOpenApp = () => { }, requestOpenWebsite = path => document.defaultView.open(`https://www.altaraapp.com${path}`, '_blank', 'noopener,noreferrer'), onProjectChange = () => { }, onRefunds, onSellerRequests } = {}) {
    let dialog = null, body = null, account = null, commerce = null, actor = null, library = null, generation = 0, viewGeneration = 0, view = 'catalogue', opener = null;
    const pt = () => /^pt/i.test(String(getLanguage()));
    const tr = (en, ptText) => pt() ? ptText : en;
    const el = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = String(text || ''); if (className)
        n.className = className; return n; };
    function syncActor() { const next = String(getActor?.() || ''); if (actor !== next) {
        generation++;
        viewGeneration++;
        account?.dispose();
        commerce?.dispose();
        actor = next;
        library = createCommunityThemeLibrary(storage, actor);
        account = createCommunityThemeAccount({ client, getActor, library, runtime, onChange: () => { if (actor === String(getActor?.() || '')) {
                onChange();
                ui?.refresh();
            } } });
        commerce = createThemeCommerce({ client, getUserId: getActor });
    } return !!actor; }
    function close({ restoreUi = true } = {}) { generation++; viewGeneration++; ui?.suspend(); if (dialog) {
        dialog.close?.();
        dialog.remove();
        dialog = null;
    } if (mount)
        mount.replaceChildren(); body = null; opener?.isConnected && opener.focus?.(); opener = null; if (restoreUi && !website)
        ui?.refresh(); }
    function ticket() { syncActor(); const g = generation, v = ++viewGeneration, a = actor; return () => g === generation && v === viewGeneration && a === String(getActor?.() || '') && body?.isConnected; }
    function button(text, action, { primary = false } = {}) { const n = el('button', text, primary ? 'btn primary' : 'btn ghost'); n.type = 'button'; const g = generation, a = actor; n.addEventListener('click', () => { if (g === generation && a === String(getActor?.() || '') && n.isConnected)
        action(n); }); return n; }
    function notice(message, error = false) { const n = el('p', message, error ? 'communityThemesStatus is-error' : 'communityThemesHint'); n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); return n; }
    function showError(host, error) {
        host.replaceChildren(notice(error?.message || tr('Could not load themes. Try again.', 'Não foi possível carregar os temas. Tenta novamente.'), true), button(tr('Retry', 'Tentar novamente'), () => render(view)));
        if (website) {
            const fallback = el('div', '', 'communityThemeWebsiteFallback');
            fallback.append(notice(tr('You can keep building locally with the starter kit and programming guide while the theme service is unavailable.', 'Podes continuar a programar localmente com o kit inicial e o guia enquanto o serviço de temas estiver indisponível.')));
            const guide = el('a', tr('Read the programming guide', 'Abrir o guia de programação'));
            guide.href = '/developers/themes/guide';
            const kit = el('a', tr('Download starter kit', 'Descarregar kit inicial'));
            kit.href = '/theme-assets/theme/community-theme-starter-kit.zip'; kit.download = 'ALTARA-theme-starter-kit.zip';
            fallback.append(guide, kit); host.append(fallback);
        }
    }
    function signIn() { body.replaceChildren(el('h3', tr('Themes for everyone', 'Temas para todos')), notice(tr('Sign in with your ALTARA account to buy, publish, install or rate themes. Free public themes can also be downloaded without signing in.', 'Inicia sessão com a tua conta ALTARA para comprar, publicar, instalar ou avaliar temas. Também podes descarregar temas públicos gratuitos sem iniciar sessão.')), button(tr('Sign in', 'Iniciar sessão'), requestSignIn, { primary: true })); }
    const price = row => formatThemePrice(Number(row.price_cents || 0), row.currency || 'eur', getLanguage() || 'en');
    function listingStats(project) {
        const count = Number(project.rating_count || 0), average = Number(project.rating_average || 0);
        return notice(`${price(project)} · ${count > 0 ? `★ ${average.toFixed(1)} (${count})` : tr('No ratings yet', 'Sem avaliações')}`);
    }
    function downloadPackage(pkg, sourceText = canonicalThemeJson(pkg)) {
        const safe = validateCommunityThemePackage(pkg);
        const blob = new document.defaultView.Blob([sourceText], { type: 'application/json' });
        const href = document.defaultView.URL.createObjectURL(blob), link = el('a');
        link.href = href;
        link.download = `${safe.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'theme'}-${safe.version}.altara-theme.json`;
        link.hidden = true;
        document.body.append(link); link.click(); link.remove();
        document.defaultView.setTimeout(() => document.defaultView.URL.revokeObjectURL(href), 1000);
    }
    function image(asset, loading = 'lazy') { try {
        const pkg = validateCommunityThemePackage({ format: 'altara-theme', apiVersion: 2, name: 'Image', version: '1.0.0', css: '.app{color:inherit}', assets: { image: asset } });
        const img = el('img');
        img.alt = tr('Theme presentation', 'Apresentação do tema');
        img.loading = loading;
        img.src = `data:${pkg.assets.image.mime};base64,${pkg.assets.image.base64}`;
        return img;
    }
    catch {
        return null;
    } }
    function summary(project, withCover = true) { const box = el('div', '', 'communityThemesCard__summary'); box.append(el('h3', project.name), notice(project.description), el('small', `${project.creator_name || project.creator_username || tr('Creator', 'Criador')} · v${project.latest_version || project.draft_package?.version || '—'} · API ${project.api_version || project.draft_package?.apiVersion || '—'}`)); const pic = image(project.screenshots?.[0]); if (pic && withCover) {
        pic.className = 'communityThemeMarketCover';
        box.prepend(pic);
    } return box; }
    function draftView(project) {
        return {...project,name:project.draft_package?.name || project.name,description:project.draft_package?.description || '',latest_version:project.draft_package?.version,api_version:project.draft_package?.apiVersion,screenshots:project.draft_screenshots || []};
    }
    function pricingControls(project, alive, changed = () => {}) {
        const section = el('section', '', 'communityThemePricing'), kindLabel = el('label', tr('Free or paid', 'Grátis ou pago'), 'communityThemesField'), kind = el('select');
        const paidFields = el('div', '', 'communityThemePricingPaid'), freeHint = notice(tr('Free publishing does not need Stripe. The published theme package can be downloaded publicly.', 'A publicação gratuita não precisa da Stripe. O pacote do tema publicado pode ser descarregado publicamente.'));
        for (const [value, label] of [['free', tr('Free', 'Grátis')], ['paid', tr('One-time purchase', 'Compra única')]]) { const option = el('option', label); option.value = value; kind.append(option); }
        kind.setAttribute('aria-label', tr('Free or paid', 'Grátis ou pago'));
        kind.value = Number(project.draft_price_cents ?? project.price_cents ?? 0) > 0 ? 'paid' : 'free'; kindLabel.append(kind);
        const amountLabel = el('label', tr('Price in EUR', 'Preço em EUR'), 'communityThemesField'), amount = el('input'); amount.type = 'text'; amount.inputMode = 'decimal'; amount.maxLength = 7;
        amount.value = ((Number(project.draft_price_cents ?? project.price_cents) || 100) / 100).toFixed(2); amountLabel.append(amount);
        const status = notice(''), countryLabel = el('label', tr('Actual country of residence', 'País de residência real'), 'communityThemesField'), country = el('select'); countryLabel.append(country); countryLabel.hidden = true;
        country.setAttribute('aria-label', tr('Actual country of residence', 'País de residência real'));
        const chooseCountry = el('option', tr('Choose your country', 'Escolhe o teu país')); chooseCountry.value = ''; country.append(chooseCountry);
        let verified = null, checking = false, busy = false, locked = false;
        const connect = button(tr('Set up Stripe seller account', 'Configurar conta de vendedor Stripe'), async n => {
            if (!alive() || !verified?.onboarding_available || busy || (website && !country.value)) return;
            if (!website) { requestOpenWebsite('/developers/themes'); return; }
            busy = true; n.disabled = true;
            try { const result = await commerce.onboard(verified.seller.country ? undefined : country.value); if (alive()) document.defaultView.location.assign(result.url); }
            catch (error) { if (alive()) status.textContent = error.message; }
            finally { if (alive()) { busy = false; paint(); } }
        }); connect.hidden = true;
        const cents = () => kind.value === 'free' ? 0 : parseThemeEuroPrice(amount.value);
        function paint() { paidFields.hidden = kind.value !== 'paid'; freeHint.hidden = kind.value === 'paid'; amountLabel.hidden = kind.value !== 'paid'; const needsSetup = kind.value === 'paid' && verified?.onboarding_available && !verified.seller.ready; countryLabel.hidden = !needsSetup || !website; connect.hidden = !needsSetup; connect.disabled = locked || busy || (website && !country.value); changed(); }
        async function check() {
            if (checking || verified || kind.value !== 'paid') { paint(); return; }
            checking = true; status.textContent = tr('Checking payment setup…', 'A verificar a configuração de pagamentos…');
            try {
                const result = await commerce.status(); if (!alive()) return; verified = result;
                for (const code of result.supported_countries) { let name = code; try { name = new Intl.DisplayNames([getLanguage() || 'en'], {type:'region'}).of(code) || code; } catch { } const option = el('option', `${name} (${code})`); option.value = code; country.append(option); }
                if (result.seller.country) { country.value = result.seller.country; country.disabled = true; }
                status.textContent = result.seller.ready && result.enabled
                    ? tr(`Ready to sell · ALTARA commission ${result.commission_bps / 100}% · Stripe fees paid by you.`, `Pronto para vender · Comissão ALTARA ${result.commission_bps / 100}% · Taxas Stripe a teu cargo.`)
                    : tr('Paid publication needs enabled theme sales and verified Stripe seller setup. Free themes do not need Stripe.', 'A publicação paga precisa de vendas de temas ativas e de verificação Stripe. Os temas grátis não precisam da Stripe.');
            } catch (error) { if (alive()) status.textContent = error.message; }
            finally { checking = false; if (alive()) paint(); }
        }
        kind.onchange = () => { paint(); void check(); }; amount.oninput = changed; country.onchange = paint;
        paidFields.append(amountLabel, notice(tr('EUR 0.50–1,000. The price belongs to this fixed release. Existing buyers keep access to later versions of this same project.', 'EUR 0,50–1 000. O preço pertence a esta versão fixa. Quem já comprou mantém acesso às versões futuras deste mesmo projeto.')), countryLabel, connect, status,
            notice(tr('Use your actual residence. Stripe collects identity and bank details on its own website. Keep paid package files and source repositories private.', 'Usa a tua residência real. A Stripe recolhe a identificação e os dados bancários no seu site. Mantém os pacotes pagos e os repositórios com o código privados.')));
        section.append(kindLabel, freeHint, paidFields);
        paint(); void check();
        return { section, fields: () => ({ price_cents: cents(), currency: 'eur' }), disable(value) { locked = value; kind.disabled = amount.disabled = value; country.disabled = value || !!verified?.seller.country; paint(); }, valid: () => { try { return cents() === 0 || verified?.enabled === true && verified.seller.ready === true && verified.commission_bps === 500; } catch { return false; } } };
    }
    async function ratingPanel(host, project, alive) {
        const section = el('section', '', 'communityThemeRating'), issue = notice(''); section.append(el('h4', tr('Your rating', 'A tua avaliação')), issue); host.append(section);
        if (!actor) { issue.textContent = tr('Sign in and install this theme to rate it.', 'Inicia sessão e instala este tema para o avaliar.'); return; }
        try {
            const result = await account.request('rating_get', {project_id: project.id}); if (!alive()) return;
            const rating = result.rating || {};
            if (rating.can_rate !== true) { issue.textContent = rating.reason === 'creator' || project.creator_id === actor ? tr('Creators cannot rate their own themes.', 'Os criadores não podem avaliar os seus próprios temas.') : tr('Install this theme with your account before rating it.', 'Instala este tema com a tua conta antes de o avaliar.'); return; }
            const label = el('label', tr('Stars', 'Estrelas'), 'communityThemesField'), select = el('select');
            select.setAttribute('aria-label', tr('Stars', 'Estrelas'));
            for (let stars = 1; stars <= 5; stars++) { const option = el('option', '★'.repeat(stars)); option.value = String(stars); select.append(option); }
            select.value = String(rating.stars || 5); label.append(select);
            const save = button(tr('Save rating', 'Guardar avaliação'), async n => { n.disabled = true; try { await account.request('rating_save', {project_id: project.id, stars: Number(select.value)}); if (alive()) void details(project.id); } catch (error) { if (alive()) { issue.textContent = error.message; n.disabled = false; } } });
            section.append(label, save);
            if (rating.stars) section.append(button(tr('Remove rating', 'Remover avaliação'), async n => { n.disabled = true; try { await account.request('rating_remove', {project_id:project.id}); if (alive()) void details(project.id); } catch (error) { if (alive()) { issue.textContent = error.message; n.disabled = false; } } }));
        } catch (error) { if (alive()) issue.textContent = error.message; }
    }
    async function catalogue(query = '', offset = 0) {
        onProjectChange(null);
        const alive = ticket();
        const form = el('form', '', 'communityThemesSearch'), input = el('input');
        input.type = 'search';
        input.maxLength = 100;
        input.value = query;
        input.placeholder = tr('Search themes…', 'Pesquisar temas…');
        input.setAttribute('aria-label', tr('Search themes', 'Pesquisar temas'));
        const submit = button(tr('Search', 'Pesquisar'), () => { });
        submit.type = 'submit';
        form.append(input, submit);
        form.onsubmit = e => { e.preventDefault(); if (alive())
            void catalogue(input.value.trim()); };
        const list = el('div', '', 'communityThemesCards');
        body.replaceChildren(form, list);
        list.append(notice(tr('Loading themes…', 'A carregar temas…')));
        try {
            const data = await account.request('catalogue', { query, limit: 40, offset }, { publicRead: true });
            if (!alive())
                return;
            list.replaceChildren();
            for (const project of data.themes || []) {
                const card = el('article', '', 'communityThemesCard');
                card.append(summary(project), listingStats(project), button(tr('View theme', 'Ver tema'), () => details(project.id)));
                list.append(card);
            }
            if (!list.children.length)
                list.append(notice(tr('No themes found. Publish the first one.', 'Não foram encontrados temas. Publica o primeiro.')));
            if(offset>0 || Number(data.total)>offset+40){
                const pages=el('div','','communityThemesActions');
                if(offset>0)pages.append(button(tr('Previous page','Página anterior'),()=>catalogue(query,Math.max(0,offset-40))));
                if(Number(data.total)>offset+40 && offset<2000)pages.append(button(tr('Next page','Página seguinte'),()=>catalogue(query,offset+40)));
                body.append(pages);
            }
        }
        catch (error) {
            if (alive())
                showError(list, error);
        }
    }
    async function details(id) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(id)))
            throw Error('Invalid theme project.');
        onProjectChange(id);
        const alive = ticket(), content = el('div', '', 'communityThemeMarketDetails');
        body.replaceChildren(button(tr('Back to themes', 'Voltar aos temas'), () => render('catalogue')), content);
        content.append(notice(tr('Loading…', 'A carregar…')));
        try {
            const data = await account.request('detail', { project_id: id }, { publicRead: true });
            if (!alive())
                return;
            const project = data.project;
            content.replaceChildren(summary(project, false));
            const gallery = el('div', '', 'communityThemeMarketGallery');
            for (const asset of (project.screenshots || [])) {
                const img = image(asset);
                if (img)
                    gallery.append(img);
            }
            if (gallery.children.length)
                content.append(gallery);
            const releases = (data.releases || []).filter(r => r.status === 'published' || r.status === 'active');
            if (!releases.length) {
                content.append(notice(tr('This theme has no compatible public release.', 'Este tema não tem uma versão pública compatível.')));
                return;
            }
            const latest = releases.find(r => r.id === project.latest_release_id) || releases[0];
            const paid = Number(latest.price_cents ?? project.price_cents ?? 0) > 0;
            const owned = latest.purchased === true || project.purchased === true || latest.creator_owned === true || project.creator_owned === true || project.creator_id === actor;
            content.append(listingStats({...project, price_cents: latest.price_cents ?? project.price_cents}), notice(paid
                ? owned ? tr('Access belongs to your account. Installation and activation are separate choices. Existing buyers do not pay again for updates to this project.', 'O acesso pertence à tua conta. Instalar e ativar são escolhas separadas. Quem já comprou não volta a pagar pelas atualizações deste projeto.')
                    : tr('One payment gives access to this theme project and its later versions. Buying does not apply the theme. Paid code is only delivered to an entitled account.', 'Um pagamento dá acesso a este projeto de tema e às suas versões futuras. Comprar não aplica o tema. O código pago só é entregue a uma conta com acesso.')
                : website ? tr('Free. Download the file or install it with your account. Activate it separately in ALTARA.', 'Grátis. Descarrega o ficheiro ou instala-o com a tua conta. Ativa-o separadamente no ALTARA.') : tr('Free. Installation keeps the current appearance. Activation is a separate choice.', 'Grátis. A instalação mantém a aparência atual. A ativação é uma escolha separada.')));
            const issue = notice(''), row = el('div', '', 'communityThemesActions');
            content.append(row, issue);
            if (paid && !owned) {
                const policy = el('a', tr('Refunds and help: 14 days for withdrawal requests; legal rights remain protected.', 'Reembolsos e ajuda: 14 dias para pedidos por desistência; os direitos legais mantêm-se.'));
                policy.href = '/theme-refunds'; policy.target = '_blank'; policy.rel = 'noopener noreferrer'; content.append(policy);
                const label = el('label', '', 'communityThemesAccept'), check = el('input'); check.type = 'checkbox'; label.append(check, document.createTextNode(tr('I have read the price, access and refund information.', 'Li a informação sobre o preço, acesso e reembolsos.'))); content.append(label);
                const buy = button(`${tr('Buy', 'Comprar')} · ${price(latest)}`, async n => {
                    if (!syncActor()) { requestSignIn(); return; }
                    if (!website) { requestOpenWebsite(`/themes?theme=${project.id}`); return; }
                    if (!check.checked) return; n.disabled = true; issue.textContent = tr('Preparing secure checkout…', 'A preparar pagamento seguro…');
                    try { const result = await commerce.checkout(latest.id, {refundPolicyVersion: THEME_REFUND_POLICY_VERSION}); if (!alive()) return; if (result.purchased) void details(project.id); else document.defaultView.location.assign(result.url); }
                    catch (error) { if (alive()) { issue.textContent = error.message; n.disabled = false; } }
                }, {primary:true}); buy.disabled = website && !check.checked; check.onchange = () => { buy.disabled = !check.checked; }; row.append(buy);
                if (actor) row.append(button(tr('Refresh purchase', 'Atualizar compra'), async n => { n.disabled = true; try { const result = await commerce.purchase(latest.id); if (!alive()) return; if (result.purchased) void details(project.id); else issue.textContent = tr('No confirmed purchase yet. Check the payment before trying again.', 'Ainda não há uma compra confirmada. Verifica o pagamento antes de tentar novamente.'); } catch (error) { if (alive()) issue.textContent = error.message; } finally { if (alive()) n.disabled = false; } }));
                row.append(button(tr('Report', 'Denunciar'), () => report(project.id, latest.id)));
                void ratingPanel(content, project, alive);
                return;
            }
            const preview = button(tr('Preview', 'Pré-visualizar'), async (n) => { n.disabled = true; try {
                const loaded = await account.request('release', { release_id: latest.id }, { publicRead: true });
                const pkg = await verifyPublishedThemeRelease(loaded.release);
                if (alive())
                    ui.preview(pkg, n);
            }
            catch (error) {
                if (alive())
                    issue.textContent = error.message;
            }
            finally {
                if (alive())
                    n.disabled = false;
            } });
            const install = button(tr('Install', 'Instalar'), async (n) => { if (!syncActor()) {
                requestSignIn();
                return;
            } n.disabled = true; try {
                await account.install(latest.id);
                if (!alive())
                    return;
                issue.textContent = tr('Installed. Activate it from your theme library.', 'Instalado. Ativa-o na tua biblioteca de temas.');
                n.textContent = tr('Installed', 'Instalado');
                if (website)
                    row.append(button(tr('Open ALTARA', 'Abrir ALTARA'), requestOpenApp));
            }
            catch (error) {
                if (alive()) {
                    issue.textContent = error.message;
                    n.disabled = false;
                }
            } }, { primary: true });
            if (![1, 2].includes(Number(latest.api_version)))
                install.disabled = true;
            if (website && !paid) {
                const download = button(tr('Download theme', 'Descarregar tema'), async (n) => { n.disabled = true; try {
                    const loaded = await account.request('release', { release_id: latest.id }, { publicRead: true });
                    const pkg = await verifyPublishedThemeRelease(loaded.release);
                    if (!alive()) return;
                    downloadPackage(pkg, loaded.release.package_text);
                    issue.textContent = tr('Package integrity checked. Import the downloaded file in ALTARA; downloading does not change your active theme.', 'Integridade do pacote verificada. Importa o ficheiro descarregado no ALTARA; a descarga não altera o tema ativo.');
                } catch (error) { if (alive()) issue.textContent = error.message; }
                finally { if (alive()) n.disabled = false; } }, { primary: true });
                download.disabled = ![1, 2].includes(Number(latest.api_version));
                row.append(preview, download);
                if (actor) row.append(install);
            } else row.append(preview, install);
            const installedItem = actor && library.read().installs.find(item => item.source?.projectId === project.id);
            if (installedItem && installedItem.source.releaseId !== latest.id) row.append(button(tr(`Review update v${latest.version}`, `Ver atualização v${latest.version}`), () => reviewUpdate({...installedItem,source:{...installedItem.source,latestReleaseId:latest.id,latestVersion:latest.version}})));
            if (paid && onRefunds && project.creator_id !== actor) row.append(button(tr('Purchases, help & refunds', 'Compras, ajuda e reembolsos'), onRefunds));
            row.append(button(tr('Report', 'Denunciar'), () => report(project.id, latest.id)));
            if (latest.release_notes)
                content.append(el('h4', tr('Release notes', 'Notas da versão')), notice(latest.release_notes));
            void ratingPanel(content, project, alive);
        }
        catch (error) {
            if (alive())
                showError(content, error);
        }
    }
    async function installed() {
        if (!syncActor()) {
            signIn();
            return;
        }
        const alive = ticket(), list = el('div', '', 'communityThemesCards');
        body.replaceChildren(notice(tr('Installed versions belong to your account. Updates require your approval.', 'As versões instaladas pertencem à tua conta. As atualizações precisam da tua aprovação.')), list);
        list.append(notice(tr('Loading your library…', 'A carregar a tua biblioteca…')));
        try {
            await account.refresh();
            if (!alive())
                return;
            list.replaceChildren();
            const state = library.read();
            for (const item of state.installs) {
                const card = el('article', '', 'communityThemesCard');
                card.append(el('h3', item.package.name), notice(`${item.source?.creatorName || item.package.author || ''} · v${item.package.version}`));
                if (state.activeId === item.id)
                    card.append(el('span', tr('Active', 'Ativo'), 'communityThemesBadge'));
                const actions = el('div', '', 'communityThemesActions');
                const preview=button(tr('Preview', 'Pré-visualizar'), n => ui.preview(item.package, n));preview.disabled=item.source?.missingPackage===true;actions.append(preview);
                if (website)
                    actions.append(button(tr('Activate in ALTARA', 'Ativar no ALTARA'), requestOpenApp, { primary: true }));
                else {
                    const activate = button(tr('Activate', 'Ativar'), async (n) => { n.disabled = true; try {
                        if (item.source) {
                            await account.refresh();
                            if (!alive())
                                return;
                        }
                        await runtime.apply(item.id);
                        if (alive())
                            void installed();
                    }
                    catch (error) {
                        if (alive()) {
                            card.append(notice(error.message, true));
                            n.disabled = false;
                        }
                    } }, { primary: true });
                    activate.disabled = state.activeId === item.id || item.source?.disabled === true;
                    actions.append(activate);
                }
                if (item.source?.disabled)
                    card.append(notice(tr('This release is unavailable. ALTARA uses its base appearance.', 'Esta versão está indisponível. O ALTARA usa a aparência base.')));
                if (item.source?.latestReleaseId && item.source.latestReleaseId !== item.source.releaseId)
                    actions.append(button(tr(`Review v${item.source.latestVersion}`, `Ver v${item.source.latestVersion}`), () => reviewUpdate(item)));
                const remove = button(tr('Uninstall', 'Desinstalar'), async (n) => { n.disabled = true; try {
                    if (item.source)
                        await account.uninstall(item);
                    else {
                        if (state.activeId === item.id)
                            runtime?.disable();
                        library.remove(item.id);
                    }
                    if (alive())
                        void installed();
                }
                catch (error) {
                    if (alive()) {
                        card.append(notice(error.message, true));
                        n.disabled = false;
                    }
                } });
                actions.append(remove);
                card.append(actions);
                list.append(card);
            }
            if (!list.children.length)
                list.append(notice(tr('No themes installed.', 'Ainda não tens temas instalados.')));
            const shelf = el('section', '', 'communityThemePurchased'), shelfStatus = notice(tr('Checking your purchases…', 'A verificar as tuas compras…')), shelfCards = el('div', '', 'communityThemesCards');
            shelf.append(el('h3', tr('Purchased · Not installed', 'Comprados · Por instalar')), shelfStatus, shelfCards); body.append(shelf);
            let offset = 0, busy = false; const seen = new Set();
            const more = button(tr('Load more purchases', 'Carregar mais compras'), load); more.hidden = true; shelf.append(more);
            async function load() {
                if (!alive() || busy) return; busy = true; more.disabled = true;
                try {
                    const data = await commerce.purchases({limit:50,offset}); if (!alive()) return;
                    const rows = Array.isArray(data) ? data : data.items;
                    if (!Array.isArray(rows)) throw Error(tr('Could not verify theme purchases.', 'Não foi possível verificar as compras de temas.'));
                    offset += rows.length;
                    for (const item of rows) { if (item.installed || seen.has(item.id)) continue; seen.add(item.id); const card = el('article', '', 'communityThemesCard'); card.append(summary(item), notice(tr('Purchased', 'Comprado')), button(tr('Review & install', 'Ver e instalar'), () => details(item.id))); shelfCards.append(card); }
                    more.hidden = Array.isArray(data) ? rows.length < 50 : data.has_more !== true;
                    shelfStatus.textContent = shelfCards.children.length ? tr('Purchases belong to your account. Choose each installation and update.', 'As compras pertencem à tua conta. Escolhe cada instalação e atualização.') : tr('No purchased themes waiting to be installed.', 'Não tens temas comprados por instalar.');
                } catch (error) { if (alive()) { shelfStatus.textContent = error.message; more.hidden = false; } }
                finally { if (alive()) { busy = false; more.disabled = false; } }
            }
            void load();
        }
        catch (error) {
            if (alive())
                showError(list, error);
        }
    }
    async function reviewUpdate(item) {
        const alive = ticket(), content = el('div');
        body.replaceChildren(content);
        try {
            const result = await account.request('release', { release_id: item.source.latestReleaseId });
            const pkg = await verifyPublishedThemeRelease(result.release);
            if (!alive())
                return;
            content.append(el('h3', `${pkg.name} · v${pkg.version}`), notice(result.release.release_notes || tr('No release notes.', 'Sem notas de versão.')), notice(tr('Your current version stays installed unless you accept this update.', 'A tua versão atual mantém-se instalada até aceitares esta atualização.')), button(tr('Preview update', 'Pré-visualizar atualização'), n => ui.preview(pkg, n)));
            const label = el('label', '', 'communityThemesAccept'), check = el('input');
            check.type = 'checkbox';
            label.append(check, document.createTextNode(tr('I reviewed the changes and want this update.', 'Vi as alterações e quero esta atualização.')));
            const issue = notice('');
            const accept = button(tr('Accept update', 'Aceitar atualização'), async (n) => { if (!check.checked)
                return; n.disabled = true; try {
                const wasActive = library.read().activeId === item.id;
                await account.install(item.source.latestReleaseId, { update: true });
                if (!alive())
                    return;
                if (wasActive && runtime)
                    await runtime.apply(item.id);
                if (alive())
                    void installed();
            }
            catch (error) {
                if (alive()) {
                    issue.textContent = error.message;
                    n.disabled = false;
                }
            } }, { primary: true });
            accept.disabled = true;
            check.onchange = () => { if (alive())
                accept.disabled = !check.checked; };
            content.append(label, accept, button(tr('Keep current version', 'Manter versão atual'), () => render('library')), issue);
        }
        catch (error) {
            if (alive())
                showError(content, error);
        }
    }
    async function projects() {
        if (!syncActor()) {
            signIn();
            return;
        }
        const alive = ticket(), list = el('div', '', 'communityThemesCards');
        const importLabel = el('label', tr('Import theme package', 'Importar pacote de tema'), 'communityThemesField'), importFile = el('input');
        importFile.type = 'file';
        importFile.accept = '.altara-theme.json,.json,application/json';
        importLabel.append(importFile);
        importFile.onchange = async () => { const file = importFile.files?.[0]; if (!file || !alive())
            return; importFile.disabled = true; try {
            if (file.size > 1536 * 1024)
                throw Error(tr('Theme exceeds 1.5 MiB.', 'O tema excede 1,5 MiB.'));
            const pkg = validateCommunityThemePackage(await file.text());
            if (alive())
                editProject(null, pkg);
        }
        catch (error) {
            if (alive())
                list.prepend(notice(error.message, true));
        }
        finally {
            if (alive())
                importFile.disabled = false;
        } };
        if (website) body.replaceChildren(notice(tr('Write your CSS and package in your own code editor. Upload the .altara-theme.json file here to validate it, preview it and save a private draft.', 'Escreve o CSS e o pacote no teu editor de código. Carrega aqui o ficheiro .altara-theme.json para o validar, pré-visualizar e guardar um rascunho privado.')), importLabel, list);
        else body.replaceChildren(button(tr('Create theme', 'Criar tema'), () => editProject(null), { primary: true }), importLabel, list);
        list.append(notice(tr('Loading drafts…', 'A carregar rascunhos…')));
        try {
            const data = await account.request('projects');
            if (!alive())
                return;
            list.replaceChildren();
            for (const project of data.projects || []) {
                const card = el('article', '', 'communityThemesCard');
                card.append(summary(draftView(project)), notice(tr('Private draft. Publishing creates a fixed new version.', 'Rascunho privado. Publicar cria uma nova versão fixa.')));
                const actions = el('div', '', 'communityThemesActions');
                actions.append(button(website ? tr('Replace draft package', 'Substituir pacote do rascunho') : tr('Edit draft', 'Editar rascunho'), () => editProject(project)), button(tr('Preview draft', 'Pré-visualizar rascunho'), n => ui.preview(project.draft_package, n)));
                if (website) actions.append(button(tr('Download draft', 'Descarregar rascunho'), () => downloadPackage(project.draft_package)));
                actions.append(button(tr('Publish version…', 'Publicar versão…'), () => publish(project), { primary: true }));
                if (project.latest_release_id)
                    actions.append(button(project.visibility==='unlisted'?tr('Return to catalogue','Voltar ao catálogo'):tr('Withdraw from catalogue', 'Retirar do catálogo'), async (n) => { n.disabled = true; try {
                        await account.request('set_visibility', { project_id: project.id, visibility: project.visibility==='unlisted'?'public':'unlisted' });
                        if (alive())
                            void projects();
                    }
                    catch (error) {
                        if (alive()) {
                            card.append(notice(error.message, true));
                            n.disabled = false;
                        }
                    } }));
                card.append(actions);
                list.append(card);
            }
            if (!list.children.length)
                list.append(notice(website ? tr('No projects yet. Upload a theme package written in your code editor.', 'Ainda não tens projetos. Carrega um pacote de tema escrito no teu editor de código.') : tr('No projects yet. Create a theme or import your existing package.', 'Ainda não tens projetos. Cria um tema ou importa o teu pacote.')));
        }
        catch (error) {
            if (alive())
                showError(list, error);
        }
    }
    function editProject(project, pkg) { if (!syncActor()) {
        signIn();
        return;
    } if (website) return codeDraft(project, pkg);
    const alive = ticket(); ui.edit(pkg || project?.draft_package || starterPackage || COMMUNITY_THEME_VISUAL_STARTER, document.activeElement, { saveLabel: tr('Save private draft', 'Guardar rascunho privado'), onSave: async (clean) => { if (!alive())
            throw Error(tr('Reopen your theme project.', 'Volta a abrir o projeto.')); await account.request('save_draft', { ...(project ? { project_id: project.id, expected_revision: project.revision } : {}), package: clean, screenshots: project?.draft_screenshots || [], release_notes: project?.draft_release_notes || '' }); if (alive())
            void render('projects'); } }); }
    function codeDraft(project, imported) {
        const alive = ticket(), issue = notice(''), info = el('div');
        let pkg = imported ? validateCommunityThemePackage(imported) : null, reading = false, saving = false, revision = 0;
        const fileLabel = el('label', tr('Draft package file', 'Ficheiro do pacote do rascunho'), 'communityThemesField'), file = el('input');
        file.type = 'file'; file.accept = '.altara-theme.json,.json,application/json'; fileLabel.append(file);
        const preview = button(tr('Preview package', 'Pré-visualizar pacote'), n => pkg && ui.preview(pkg, n));
        const save = button(tr('Save private draft', 'Guardar rascunho privado'), async n => {
            if (!pkg || reading || saving || !alive()) return;
            saving = true; file.disabled = true; showPackage();
            try {
                await account.request('save_draft', { ...(project ? { project_id: project.id, expected_revision: project.revision } : {}), package: pkg, screenshots: project?.draft_screenshots || [], release_notes: project?.draft_release_notes || '' });
                if (alive()) void render('projects');
            } catch (error) { if (alive()) issue.textContent = error.message; }
            finally { if (alive()) { saving = false; file.disabled = false; showPackage(); } }
        }, { primary: true });
        function showPackage() {
            info.replaceChildren();
            if (pkg) info.append(el('h4', `${pkg.name} · v${pkg.version}`), notice(pkg.description), notice(tr(`Validated package · API ${pkg.apiVersion}`, `Pacote validado · API ${pkg.apiVersion}`)));
            preview.disabled = save.disabled = !pkg || reading || saving;
        }
        file.onchange = async () => {
            const selected = file.files?.[0], r = ++revision;
            if (!selected || !alive()) return;
            reading = true; pkg = null; showPackage(); issue.textContent = '';
            try {
                if (selected.size > 1536 * 1024) throw Error(tr('Theme exceeds 1.5 MiB.', 'O tema excede 1,5 MiB.'));
                const candidate = validateCommunityThemePackage(await selected.text());
                if (!alive() || r !== revision) return;
                pkg = candidate;
            } catch (error) { if (alive() && r === revision) issue.textContent = error.message; }
            finally { if (alive() && r === revision) { reading = false; showPackage(); } }
        };
        body.replaceChildren(el('h3', project ? tr('Replace private draft package', 'Substituir pacote do rascunho privado') : tr('Upload a theme package', 'Carregar um pacote de tema')),
            notice(tr('Edit files locally, then upload the complete package. This only saves a private draft. A published version remains unchanged until you explicitly publish a new version.', 'Edita os ficheiros localmente e carrega o pacote completo. Só é guardado um rascunho privado. Uma versão publicada mantém-se intacta até publicares explicitamente uma nova versão.')),
            fileLabel, info, preview, save, button(tr('Cancel', 'Cancelar'), () => render('projects')), issue);
        showPackage();
    }
    function publish(project) {
        const alive = ticket();
        body.replaceChildren(el('h3', tr('Publish a theme version', 'Publicar uma versão de tema')), summary(draftView(project)), notice(tr('The published version and price are immutable. Review its preview, name and version before publishing. The publisher is your signed-in profile.', 'A versão publicada e o preço são imutáveis. Revê o preview, nome e versão antes de publicar. A autoria fica associada ao teu perfil autenticado.')));
        const notesLabel = el('label', tr('Release notes', 'Notas da versão'), 'communityThemesField'), notes = el('textarea');
        notes.maxLength = 2000;
        notes.value = project.draft_release_notes || '';
        notesLabel.append(notes);
        const screenshotLabel = el('label', tr('Presentation image (up to 512 KiB; optimized to 640px / 96 KiB)', 'Imagem de apresentação (até 512 KiB; otimizada para 640px / 96 KiB)'), 'communityThemesField'), file = el('input');
        file.type = 'file';
        file.accept = 'image/png,image/jpeg,image/webp';
        screenshotLabel.append(file);
        const issue = notice('');
        let images = project.draft_screenshots || [], reading = false, revision = 0, draftRevision = project.revision;
        file.onchange = async () => { const selected = file.files?.[0], r = ++revision; if (!selected)
            return; reading = true; try {
            if (selected.size > 512 * 1024)
                throw Error(tr('Image exceeds 512 KiB.', 'A imagem excede 512 KiB.'));
            const buffer = new Uint8Array(await selected.arrayBuffer());
            if (!alive() || r !== revision)
                return;
            let binary = '';
            for (let i = 0; i < buffer.length; i += 16384)
                binary += String.fromCharCode(...buffer.subarray(i, i + 16384));
            let asset = { mime: selected.type, base64: document.defaultView.btoa(binary) };
            const decoded=image(asset, 'eager');
            if (!decoded)
                throw Error(tr('Invalid presentation image.', 'Imagem de apresentação inválida.'));
            // Decode with the native codec too. Catalogue images have smaller
            // bounds than wallpapers and are never fetched from author URLs.
            await decoded.decode();
            if(!alive()||r!==revision)return;
            const scale=Math.min(1,640/Math.max(decoded.naturalWidth,decoded.naturalHeight));
            const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(decoded.naturalWidth*scale));canvas.height=Math.max(1,Math.round(decoded.naturalHeight*scale));
            const context=canvas.getContext('2d');if(!context)throw Error(tr('Image conversion is unavailable.','A conversão de imagens está indisponível.'));context.drawImage(decoded,0,0,canvas.width,canvas.height);
            let optimized=null;
            for(const quality of [.86,.70,.50]){optimized=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(optimized&&optimized.size<=96*1024)break;}
            if(!optimized||optimized.size>96*1024)throw Error(tr('Choose a smaller presentation image.','Escolhe uma imagem de apresentação mais pequena.'));
            const encoded=new Uint8Array(await optimized.arrayBuffer());if(!alive()||r!==revision)return;
            binary='';for(let index=0;index<encoded.length;index+=16384)binary+=String.fromCharCode(...encoded.subarray(index,index+16384));
            asset={mime:optimized.type,base64:document.defaultView.btoa(binary)};
            if(!image(asset))throw Error(tr('Invalid optimized image.','A imagem otimizada é inválida.'));
            images = [asset];
            issue.textContent = tr('Image ready.', 'Imagem pronta.');
        }
        catch (error) {
            if (alive())
                issue.textContent = error.message;
        }
        finally {
            if (alive() && r === revision)
                reading = false;
        } };
        const label = el('label', '', 'communityThemesAccept'), check = el('input');
        check.type = 'checkbox';
        label.append(check, document.createTextNode(tr('I reviewed this version, its price and my rights to publish it.', 'Revi esta versão, o preço e os meus direitos para a publicar.')));
        let pricing, publishing = false;
        const send = button(tr('Publish version', 'Publicar versão'), async (n) => { if (!check.checked || reading || publishing)
            return; if (!pricing.valid()) return; publishing = true; n.disabled = true; pricing.disable(true); notes.disabled = file.disabled = check.disabled = true; try {
            const saved = await account.request('save_draft', { project_id: project.id, expected_revision: draftRevision, package: project.draft_package, screenshots: images, release_notes: notes.value, ...pricing.fields() });
            if (!alive())
                return;
            draftRevision = saved.project?.revision ?? saved.revision;
            await account.request('publish', { project_id: project.id, expected_revision: draftRevision });
            if (alive())
                void render('projects');
        }
        catch (error) {
            if (alive()) {
                issue.textContent = error.message;
                n.disabled = false;
            }
        } finally { if (alive()) { publishing = false; pricing.disable(false); notes.disabled = file.disabled = check.disabled = false; paint(); } } }, { primary: true });
        const paint = () => { if (alive()) send.disabled = publishing || !check.checked || reading || !pricing?.valid(); };
        pricing = pricingControls(project, alive, paint); send.disabled = true;
        check.onchange = paint;
        body.append(notesLabel, screenshotLabel, pricing.section, label, button(tr('Preview this version', 'Pré-visualizar esta versão'), n => ui.preview(project.draft_package, n)), send, button(tr('Cancel', 'Cancelar'), () => render('projects')), issue);
    }
    function report(projectId, releaseId) { if (!syncActor()) {
        signIn();
        return;
    } const alive = ticket(), form = el('form', '', 'communityThemesForm'), label = el('label', tr('Reason for report', 'Motivo da denúncia'), 'communityThemesField'), reason = el('textarea'); reason.required = true; reason.minLength = 10; reason.maxLength = 1000; label.append(reason); const issue = notice(''); const submit = button(tr('Submit report', 'Enviar denúncia'), () => { }, { primary: true }); submit.type = 'submit'; form.append(label, submit, button(tr('Cancel', 'Cancelar'), () => details(projectId)), issue); form.onsubmit = async (e) => { e.preventDefault(); if (!alive())
        return; submit.disabled = true; try {
        await account.request('report', { release_id: releaseId, category: 'other', details: reason.value });
        if (alive()) {
            issue.textContent = tr('Report submitted for review.', 'Denúncia enviada para revisão.');
        }
    }
    catch (error) {
        if (alive()) {
            issue.textContent = error.message;
            submit.disabled = false;
        }
    } }; body.replaceChildren(el('h3', tr('Report theme', 'Denunciar tema')), form); }
    function render(next, pkg) { syncActor(); view = next; for (const tab of (dialog || mount)?.querySelectorAll('[data-theme-market-tab]') || [])
        tab.setAttribute('aria-pressed', String(tab.dataset.themeMarketTab === next)); if (next === 'library')
        return installed(); if (next === 'projects')
        return projects(); if (next === 'create') {
        body.replaceChildren();
        return editProject(null, pkg);
    } return catalogue(); }
    function open(next = 'catalogue', pkg) { close({ restoreUi: false }); syncActor(); opener = document.activeElement; const shell = el(website ? 'section' : 'dialog', '', 'communityThemesDialog communityThemeMarket'); shell.dataset.communityThemesTrusted = 'true'; shell.setAttribute('aria-label', tr('Community themes', 'Temas da comunidade')); const head = el('header', '', 'communityThemesDialog__header'); head.append(el('h2', tr('Community themes', 'Temas da comunidade'))); if (!website)
        head.append(button('×', close)); const tabs = el('nav', '', 'communityThemesActions communityThemeMarketTabs'); for (const [name, label] of [['catalogue', tr('Discover', 'Descobrir')], ['library', tr('Library', 'Biblioteca')], ['projects', tr('My projects', 'Os meus projetos')]]) {
        const tab = button(label, () => render(name));
        tab.dataset.themeMarketTab = name;
        tabs.append(tab);
    } if (onRefunds) tabs.append(button(tr('Purchases, help & refunds', 'Compras, ajuda e reembolsos'), onRefunds)); if (onSellerRequests) tabs.append(button(tr('Customer requests', 'Pedidos de clientes'), onSellerRequests)); body = el('div', '', 'communityThemesDialog__body'); shell.append(head, tabs, body); if (website) {
        mount.append(shell);
    }
    else {
        dialog = shell;
        document.body.append(shell);
        shell.addEventListener('cancel', e => { e.preventDefault(); close(); });
        shell.showModal();
    } void render(next, pkg); return shell; }
    function suspend() { close({ restoreUi: false }); account?.dispose(); commerce?.dispose(); account = null; commerce = null; actor = null; library = null; }
    return { open, close, suspend, refresh: () => body ? render(view) : Promise.resolve(), showProject: details, getAccount: () => { syncActor(); return account; } };
}
