import { validateCommunityThemePackage } from './communityThemePackages.js';
import { canonicalThemeJson } from './themeCanonical.js';
export { canonicalThemeJson } from './themeCanonical.js';
export async function verifyPublishedThemeRelease(release, crypto = globalThis.crypto) {
    if (!release || typeof release.package_text !== 'string' || release.package_text.length > 1536 * 1024 || !/^[a-f0-9]{64}$/.test(release.sha256 || ''))
        throw new Error('Invalid theme release.');
    const safe = validateCommunityThemePackage(release.package_text);
    if (canonicalThemeJson(safe) !== release.package_text)
        throw new Error('The theme release is not canonical.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(release.package_text)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== release.sha256 || release.version !== safe.version || Number(release.api_version) !== safe.apiVersion)
        throw new Error('Theme integrity verification failed.');
    return safe;
}
// This adapter never sends user IDs or publisher labels as authority. The Edge
// Function derives the actor from its authenticated session on every request.
export function createCommunityThemeAccount({ client, getActor, library, runtime, onChange = () => { } }) {
    const owner = String(getActor?.() || '');
    let disposed = false, refreshPending = null, started = false, channel = null, lastWake = 0;
    let mutationRevision=0, queuedMutations=0, mutationQueue=Promise.resolve();
    const requests = new Set();
    const owns = () => !disposed && owner && String(getActor?.() || '') === owner;
    function assertOwner() { if (!owns())
        throw new Error('The theme account changed. Reopen themes.'); }
    async function request(op, fields = {}, { publicRead = false } = {}) {
        if (disposed || (!publicRead && !owns()))
            throw new Error('Sign in to manage themes.');
        const actorBefore = String(getActor?.() || '');
        // Capture the actual session before sending. The SDK's default async
        // token resolver can otherwise pick a different account mid-request.
        const sessionResult=await client.auth.getSession();
        if(disposed || String(getActor?.()||'')!==actorBefore || sessionResult.error)throw new Error('The theme account changed. Reopen themes.');
        const session=sessionResult.data?.session;
        if(actorBefore && (session?.user?.id!==actorBefore || !session.access_token))throw new Error('Sign in again to use themes.');
        if(!actorBefore && session)throw new Error('The theme account changed. Reopen themes.');
        const authorization=actorBefore?`Bearer ${session.access_token}`:'';
        const controller = new AbortController(); requests.add(controller);
        let result;
        try { result = await client.functions.invoke('theme-api', { body: { ...fields, op }, headers:{Authorization:authorization}, signal: controller.signal }); }
        finally { requests.delete(controller); }
        const { data, error } = result;
        if (disposed || String(getActor?.() || '') !== actorBefore || (!publicRead && !owns()))
            throw new Error('The theme account changed. Reopen themes.');
        if (error || data?.ok !== true) {
            let backendCode = data?.error || data?.code || '';
            // Supabase keeps a non-2xx Function response on the error context. Only
            // bounded, known codes enter the UI; raw diagnostics never do.
            if (!backendCode && error?.context?.clone) {
                try {
                    const raw = await error.context.clone().text();
                    if (raw.length <= 4096)
                        backendCode = JSON.parse(raw)?.error || '';
                }
                catch { }
            }
            if (disposed || String(getActor?.() || '') !== actorBefore)
                throw new Error('The theme account changed. Reopen themes.');
            const code = String(backendCode);
            const commerceMessages = { purchase_required: 'Buy this theme before previewing or installing it.', rating_not_installed: 'Install this theme with your account before rating it.', rating_creator_denied: 'Creators cannot rate their own themes.', invalid_price: 'Use EUR 0.50–1,000, with at most two decimal places.', seller_not_ready: 'Finish Stripe seller setup before publishing a paid theme.', commerce_disabled: 'Theme sales are not available yet. Free publication still works.' };
            if (Object.hasOwn(commerceMessages, code)) throw new Error(commerceMessages[code]);
            const messages = { revision_conflict: 'The draft changed in another tab. Reload before saving.', version_conflict: 'That version has already been published. Choose a new version.', release_unavailable: 'This theme release is unavailable.', project_unavailable: 'This theme project is unavailable.', incompatible_release: 'This theme requires another ALTARA theme API.', invalid_package: 'The theme package failed validation.', not_authenticated: 'Sign in again to use themes.', rate_limited: 'Too many requests. Try again shortly.', moderation_unavailable: 'The report service is unavailable. Try again later.' };
            throw new Error(messages[code] || 'Could not complete the theme request. Check your connection and try again.');
        }
        return data;
    }
    function sourceFor(row) {
        return { projectId: row.project_id, releaseId: row.release_id, accountId: row.id, sha256: row.sha256, creatorId: row.project?.creator_id, creatorName: row.project?.creator_name || '', ...(row.price_cents > 0 ? { paid: true, priceCents: row.price_cents, currency: row.currency } : {}), disabled: row.disabled === true, unavailableReason: String(row.unavailable_reason || ''), latestReleaseId: row.latest_release_id || null, latestVersion: String(row.latest_version || '') };
    }
    async function prepareInstall(row) {
        if (row?.disabled || row?.unavailable_reason) {
            // Retain server-owned identity on a fresh device without parsing or
            // applying a revoked package. This placeholder is never exportable.
            const metadata = validateCommunityThemePackage({format:'altara-theme',apiVersion:1,name:String(row.project?.name || 'Unavailable theme').slice(0,60),version:row.version,description:'This installed release is unavailable. Review an update or uninstall it.',css:'.app{color:inherit}'});
            return {projectId:row.project_id,disabled:true,source:{...sourceFor(row),disabled:true,missingPackage:true},package:metadata,latestReleaseId:row.latest_release_id||null,latestVersion:String(row.latest_version||'')};
        }
        const packageData = await verifyPublishedThemeRelease(row);
        assertOwner();
        return { source: sourceFor(row), package: packageData };
    }
    async function refresh(initialSnapshot = null) {
        assertOwner();
        if (refreshPending)
            return refreshPending;
        const revision=mutationRevision;
        refreshPending = (async () => {
            const data = initialSnapshot || await request('installs');
            assertOwner();
            if(revision!==mutationRevision || queuedMutations)return {stale:true};
            if (!Array.isArray(data.installs) || data.installs.length > 20)
                throw new Error('Invalid theme library response.');
            const activeBefore = library.read().installs.find(item => item.id === library.read().activeId);
            if (activeBefore?.source) {
                const authoritative = data.installs.find(row => row.id === activeBefore.source.accountId);
                if (!authoritative || authoritative.disabled || authoritative.unavailable_reason) {
                    // A known revocation wins even when another package or local storage
                    // later fails. Runtime recovery removes CSS in its finally block.
                    runtime?.disable();
                }
            }
            // Validate every package before writing. A failed row leaves the complete
            // previous library intact rather than partially replacing the account.
            const rows = await Promise.all(data.installs.map(prepareInstall));
            assertOwner();
            if(revision!==mutationRevision || queuedMutations)return {stale:true};
            const old = library.read(), active = old.installs.find(item => item.id === old.activeId);
            library.reconcileAccount(rows);
            const next = library.read(), changed = active?.source && next.installs.find(item => item.id === active.id)?.source?.releaseId !== active.source.releaseId;
            if (active?.source && (!next.activeId || changed || next.installs.find(item => item.id === active.id)?.source?.disabled))
                runtime?.disable();
            onChange();
            return data.installs;
        })().finally(() => { refreshPending = null; });
        return refreshPending;
    }
    function mutate(action){
        assertOwner();mutationRevision++;queuedMutations++;
        const operation=mutationQueue.catch(()=>{}).then(async()=>{try{assertOwner();return await action();}finally{queuedMutations--;mutationRevision++;}});
        mutationQueue=operation;return operation;
    }
    async function refreshFresh(snapshot=null){
        for(let attempt=0;attempt<3;attempt++){
            const result=await refresh(snapshot);snapshot=null;
            if(!result?.stale){subscribe();return result;}
            await mutationQueue.catch(()=>{});assertOwner();
        }
        throw new Error('The library changed while loading. Reopen themes.');
    }
    async function install(releaseId, { update = false } = {}) {
        assertOwner();
        // Validation precedes the account mutation. The server independently checks
        // the stored immutable release again in its installation transaction.
        const response = await request('release', { release_id: releaseId });
        await verifyPublishedThemeRelease(response.release);
        assertOwner();
        const state = library.read(), existing = state.installs.find(item => item.source?.projectId === response.release.project_id);
        if (!existing && state.installs.length >= 20)
            throw new Error('The local theme library is full. Export and remove a local copy first.');
        const candidates = state.installs.filter(item => item.id !== existing?.id).map(item => ({ id: item.id, package: item.package, source: item.source }));
        candidates.push({ id: existing?.id || '00000000-0000-0000-0000-000000000000', package: JSON.parse(response.release.package_text) });
        if (new TextEncoder().encode(JSON.stringify({ version: 1, installs: candidates, activeId: state.activeId })).byteLength > 4 * 1024 * 1024 - 2048)
            throw new Error('The local theme library exceeds its size limit. Export and remove a local copy first.');
        const previous = update ? library.read().installs.find(item => item.source?.projectId === response.release.project_id) : null;
        if (update && !previous?.source?.accountId)
            throw new Error('This theme is not installed in your account.');
        const data = await request(update ? 'accept_update' : 'install', { release_id: releaseId, ...(update ? { install_id: previous.source.accountId } : {}) });
        const prepared = await prepareInstall(data.install);
        assertOwner();
        if (prepared.disabled)
            throw new Error('This theme release is unavailable.');
        let item;
        try {
            item = library.applyAccount(prepared);
        }
        catch {
            throw new Error('The version was saved to your account, but this device could not store it. Your previous appearance is kept. Free storage and retry from the library.');
        }
        onChange();
        return item;
    }
    async function uninstall(item) { assertOwner(); if (!item.source?.accountId)
        throw new Error('This is a local theme.'); await request('uninstall', { install_id: item.source.accountId }); assertOwner(); if (library.read().activeId === item.id)
        runtime?.disable(); library.remove(item.id); onChange(); }
    function wake() {
        if (!owns() || Date.now() - lastWake < 15000)
            return;
        let remote = false;
        try {
            remote = library.read().installs.some(item => item.source);
        }
        catch {
            return;
        }
        if (!remote)
            return;
        lastWake = Date.now();
        void refreshFresh().catch(() => { });
    }
    function subscribe() {
        if (!started || channel || !owns() || !client.channel)
            return;
        if (!library.read().installs.some(item => item.source))
            return;
        channel = client.channel(`altara-theme-installs:${owner}`).on('postgres_changes', { event: '*', schema: 'public', table: 'altara_theme_installs', filter: `user_id=eq.${owner}` }, () => { if (owns())
            void refreshFresh().catch(() => { }); }).subscribe(status => { if (status === 'SUBSCRIBED' && owns())
            void refreshFresh().catch(() => { }); });
    }
    function start() { if (started || !owns())
        return; started = true; globalThis.addEventListener?.('focus', wake); globalThis.addEventListener?.('online', wake); subscribe(); }
    return { request, refresh: refreshFresh, install: async (...args) => { const item = await mutate(()=>install(...args)); subscribe(); return item; }, uninstall:item=>mutate(()=>uninstall(item)), start,
        dispose() { disposed = true; for (const request of requests) request.abort(); requests.clear(); globalThis.removeEventListener?.('focus', wake); globalThis.removeEventListener?.('online', wake); if (channel)
            client.removeChannel?.(channel); channel = null; }, owns };
}
