'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HomeNav } from '../components/home-nav';
import { SiteFooter } from '../components/site-chrome';
import { DeveloperSpace } from '../developers/components/developer-space';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { ThemeSafetyNotice } from './theme-safety-notice';
import './themes.css';

type ThemeUi = { suspend: () => void; preview: (theme: unknown, anchor?: HTMLElement) => void };
type ThemeMarket = { open: (view?: string) => void; suspend: () => void; close: () => void; refresh: () => void; showProject: (id: string) => void };
type ThemeModule = { createCommunityThemeMarketplace: (document: Document, options: Record<string, unknown>) => ThemeMarket };
type ThemeUiModule = { createCommunityThemesUi: (document: Document, options: Record<string, unknown>) => ThemeUi };
type ThemeCommerce = { dispose: () => void };
type ThemeCommerceModule = { createThemeCommerce: (options: Record<string, unknown>) => ThemeCommerce };
type ThemeRefundsModule = { mountThemeRefunds: (host: HTMLElement, options: Record<string, unknown>) => { dispose: () => void } };

export function ThemeMarketplaceClient({ developers = false }: { developers?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const refundsHost = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false, initialized = false, actor = '', authEvent = false;
    let market: ThemeMarket | undefined, ui: ThemeUi | undefined;
    let refundPanel: { dispose: () => void } | undefined, refundApi: ThemeCommerce | undefined;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    let loaded: [ThemeModule, ThemeUiModule, ThemeCommerceModule, ThemeRefundsModule] | undefined;
    const client = getSupabaseBrowserClient();
    const projectId = () => {
      const id = new URL(window.location.href).searchParams.get('theme') || '';
      return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ? id : '';
    };
    const onProjectChange = (id: string | null) => {
      if (disposed || developers) return;
      const destination = new URL(window.location.href);
      if (id && /^[a-f0-9-]{36}$/i.test(id)) destination.searchParams.set('theme', id);
      else destination.searchParams.delete('theme');
      window.history.replaceState(window.history.state, '', destination.pathname + destination.search + destination.hash);
    };

    const requestSignIn = () => {
      // The existing login shell performs a document navigation and retains the
      // selected listing/studio route. Author identity comes from its session.
      const returnTo = window.location.pathname + window.location.search;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login.html?return_to=${encodeURIComponent(returnTo)}`;
    };
    const requestOpenApp = () => {
      // Downloading is separate from importing and activating in ALTARA.
      // Never apply community CSS to the portal, its auth or publication controls.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/app/?themes=library';
    };
    const retireRefunds = () => { refundPanel?.dispose(); refundApi?.dispose(); refundPanel = undefined; refundApi = undefined; refundsHost.current?.replaceChildren(); };
    const retire = () => { retireRefunds(); market?.suspend(); market?.close(); ui?.suspend(); market = undefined; ui = undefined; };
    const openRefunds = (view: 'buyer' | 'seller') => {
      if (disposed || !loaded || !refundsHost.current) return;
      if (!actor) { requestSignIn(); return; }
      market?.close(); retireRefunds();
      const owner = actor;
      const [, , commerceModule, refundsModule] = loaded;
      refundApi = commerceModule.createThemeCommerce({ client, getUserId: () => !disposed && actor === owner ? owner : '' });
      const destination = new URL(window.location.href);
      destination.searchParams.set('view', view === 'seller' ? 'seller-requests' : 'refunds');
      window.history.replaceState(window.history.state, '', destination.pathname + destination.search + destination.hash);
      const back = document.createElement('button'); back.type = 'button'; back.className = 'btn ghost';
      back.textContent = developers ? 'Back to my projects' : 'Back to themes';
      back.onclick = () => { if (disposed || actor !== owner) return; retireRefunds(); const next = new URL(window.location.href); next.searchParams.delete('view'); window.history.replaceState(window.history.state, '', next.pathname + next.search + next.hash); market?.open(developers ? 'projects' : 'catalogue'); };
      refundsHost.current.append(back);
      refundPanel = refundsModule.mountThemeRefunds(refundsHost.current, { api: refundApi, getUserId: () => actor, view, alive: () => !disposed && actor === owner });
    };
    const render = () => {
      if (disposed || !initialized || !loaded || !host.current || !editorHost.current) return;
      retire();
      const [marketModule, uiModule] = loaded;
      const initialProject = projectId();
      try {
        // The portal uses the same parser, isolated preview and lifecycle
        // as the app. The runtime is intentionally absent on this trusted surface.
        ui = uiModule.createCommunityThemesUi(document, { getActor: () => actor,
          getLanguage: () => document.documentElement.lang, storage: window.localStorage });
        market = marketModule.createCommunityThemeMarketplace(document, {
          client, getActor: () => actor, getLanguage: () => document.documentElement.lang,
          storage: window.localStorage, ui,
          mount: host.current, website: true, requestSignIn, requestOpenApp, onProjectChange,
          onRefunds: () => openRefunds('buyer'), onSellerRequests: () => openRefunds('seller'),
        });
        market.open(developers ? 'projects' : 'catalogue');
        if (!developers && initialProject) market.showProject(initialProject);
        const requestedView = new URL(window.location.href).searchParams.get('view');
        if (requestedView === 'refunds' || requestedView === 'seller-requests') openRefunds(requestedView === 'refunds' ? 'buyer' : 'seller');
        setError(''); setLoading(false);
      } catch { setError('Could not open themes. Refresh to try again.'); setLoading(false); }
    };

    const moduleUrls = ['/theme-assets/lib/communityThemeMarketplace.js', '/theme-assets/lib/communityThemesUi.js', '/theme-assets/lib/themeCommerce.js', '/theme-assets/lib/widgetRefunds.js'];
    Promise.all(moduleUrls.map(url => import(/* webpackIgnore: true */ url))).then(modules => {
      if (disposed) return;
      loaded = modules as [ThemeModule, ThemeUiModule, ThemeCommerceModule, ThemeRefundsModule]; render();
    }).catch(() => { if (!disposed) { setError('Could not load themes. Please refresh this page.'); setLoading(false); } });

    client.auth.getSession().then(({ data, error: authError }) => {
      if (disposed || authEvent) return;
      if (authError) { setError('Could not check your account. Refresh to try again.'); setLoading(false); return; }
      actor = data.session?.user.id || ''; initialized = true; render();
    }).catch(() => { if (!disposed) { setError('Could not check your account. Refresh to try again.'); setLoading(false); } });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      authEvent = true;
      const next = session?.user.id || '';
      if (!initialized || actor !== next) { retire(); actor = next; initialized = true; clearTimeout(renderTimer); renderTimer = setTimeout(render, 0); }
    });
    const onPopState = () => {
      if (disposed || developers || window.location.pathname !== '/themes' || !market) return;
      const requestedView = new URL(window.location.href).searchParams.get('view');
      if (requestedView === 'refunds' || requestedView === 'seller-requests') { openRefunds(requestedView === 'refunds' ? 'buyer' : 'seller'); return; }
      retireRefunds();
      const id = projectId();
      if (id) market.showProject(id); else market.open('catalogue');
    };
    window.addEventListener('popstate', onPopState);
    return () => { disposed = true; clearTimeout(renderTimer); retire(); data.subscription.unsubscribe(); window.removeEventListener('popstate', onPopState); };
  }, [developers]);

  const content = <>
    {loading && !error && <p className="themeWebsiteStatus" role="status">Opening themes…</p>}
    {error && <p className="themeWebsiteError" role="alert">{error}</p>}
    <div ref={host} aria-label={developers ? 'Theme projects' : 'Community theme catalogue'} data-community-themes-trusted="true" />
    <div ref={refundsHost} className="themeRefundsHost" aria-label="Theme help and refunds" data-community-themes-trusted="true" />
    <div id="appearanceCommunityThemes" ref={editorHost} hidden data-community-themes-trusted="true" />
  </>;
  if (developers) return <DeveloperSpace active="themes">
    <div className="developerSpaceIntro"><p className="developerSpaceEyebrow">BUILT WITH CODE</p><h1>Theme projects</h1>
      <p>Make ALTARA your own. Write CSS in your editor, test it in the app and publish a free or paid version from your account.</p></div>
    <div className="themeWebsiteLinks"><a className="themePrimaryLink" href="/theme-assets/theme/community-theme-starter-kit.zip" download>Download source kit ↓</a><Link href="/developers/themes/guide">How to build and publish →</Link><Link href="/themes">Explore themes ↗</Link></div>
    <section className="themeCodeGuide" aria-label="Theme programming workflow">
      <div><span>01 / YOUR EDITOR</span><h2>Style real app surfaces</h2><p>The source kit has separate CSS and metadata files, a ready-made example and the same validator as ALTARA. Edit colors, materials, spacing and native layout slots.</p></div>
      <div><span>02 / YOUR PROJECT</span><h2>Upload, preview, publish</h2><p>Build a JSON package and upload it below. Validation and an isolated preview come before your private draft. Review and confirm each public version.</p></div>
      <div><span>03 / THE COMMUNITY</span><h2>Their library. Their choice.</h2><p>Your listing belongs in Themes. Free packages can be downloaded; paid themes are delivered to accounts with access. People install a version and choose when to activate it in Appearance. No ALTARA+ required.</p></div>
    </section>
    <details className="themeCodeExample"><summary>Package example and supported customization</summary>
      <p>A theme is a UTF-8 <code>.altara-theme.json</code> file. Use native slots and CSS Grid/Flexbox to style existing surfaces. Layouts are declarative native options; your package cannot create new app actions or arbitrary markup.</p>
      <pre><code>{`{
  "format": "altara-theme",
  "apiVersion": 2,
  "name": "My theme",
  "version": "1.0.0",
  "description": "My own native ALTARA surfaces.",
  "css": ":root{--accent:#a9ccff} .app{--altara-accent:var(--accent)} [data-theme-slot=\\"widget-card\\"]{border-radius:18px}"
}`}</code></pre>
      <p>Supported: colors, spacing, local font stacks, transparency, blur, borders, shadows, responsive CSS and validated PNG/JPEG/WebP assets. API 2 layouts: <code>dashboard</code> and <code>glass-home</code>. Omit <code>layout</code> to keep the native Home and personal widgets.</p>
      <p>Follow the <Link href="/developers/themes/guide">step-by-step programming guide</Link> for source files, local validation and publication. The <a href="/theme-assets/docs/COMMUNITY_THEMES_V1.md">complete package contract</a> lists all supported slots and limits. Authentication, permissions, sensitive dialogs and recovery remain controlled by ALTARA.</p>
    </details>
    <ThemeSafetyNotice />
    {content}
  </DeveloperSpace>;
  return <div className="hp editorial ed-marketplace">
    <HomeNav active="marketplace" skipToContent />
    <main id="main-content" tabIndex={-1} className="themeWebsite">
      <div className="themeWebsiteIntro"><div><span className="themeWebsiteEyebrow ed-eyebrow">MADE FOR YOUR SPACE</span>
        <h1>Themes</h1><p>Discover free and paid themes made with code. Install your selected version in ALTARA and choose when to activate it.</p></div>
        <div className="themeWebsiteLinks">
          <a href="/marketplace">Widgets</a>
          {/* Keep navigation into account tools independent of the marketing document. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/developers/themes/guide">Make a theme ↗</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/developers/themes">My projects</a>
          <a href="/app">Open ALTARA →</a>
        </div>
      </div>
      <section className="themeDownloadSteps" aria-label="How to use a community theme"><div><span>01</span><p><strong>Find your style.</strong> Review the creator, screenshots and price. Free or owned themes can be previewed.</p></div><div><span>02</span><p><strong>Add your version.</strong> Install from your account; free files can also be downloaded and imported.</p></div><div><span>03</span><p><strong>Choose Activate.</strong> Buying or installing does not change your appearance automatically.</p></div></section>
      <ThemeSafetyNotice />
      {content}
    </main>
    <SiteFooter analytics={false} />
  </div>;
}
