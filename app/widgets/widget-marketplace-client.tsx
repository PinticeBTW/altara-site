'use client';

import { useEffect, useRef, useState } from 'react';
import { HomeNav } from '../components/home-nav';
import { SiteFooter } from '../components/site-chrome';
import { DeveloperSpace } from '../developers/components/developer-space';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import './widgets.css';

type Market = { open: (tab: string) => void; dispose: () => void };
type WidgetModule = { createWidgetMarketplace: (options: Record<string, unknown>) => Market };

export function WidgetMarketplaceClient({ developers = false }: { developers?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false, failed = false, market: Market | undefined, actor = '', initialized = false;
    let client: ReturnType<typeof getSupabaseBrowserClient>, unsubscribe: (() => void) | undefined;
    let widgetModule: WidgetModule | undefined;
    let authVersion = 0, marketGeneration = 0, renderTimer: ReturnType<typeof setTimeout> | undefined;
    const alive = () => !disposed && !failed;
    const retire = () => {
      const previous = market; market = undefined; marketGeneration++;
      let released = true;
      try { previous?.dispose(); } catch { released = false; }
      finally { host.current?.replaceChildren(); }
      return released;
    };
    const fail = (message: string) => {
      if (!alive()) return;
      failed = true; clearTimeout(deadline); clearTimeout(renderTimer);
      retire(); setError(message); setLoading(false);
    };
    // A stalled session or module must leave a recoverable screen, never a blank studio.
    const deadline = setTimeout(() => fail('Widgets are taking too long to load. Try again.'), 15000);
    const login = (widgetId?: string) => {
      const returnTo = new URL(window.location.href);
      if (widgetId) returnTo.searchParams.set('widget', widgetId);
      // The login page is the standalone app shell and requires a document navigation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login.html?return_to=${encodeURIComponent(returnTo.pathname + returnTo.search)}`;
    };
    function render() {
      if (!alive() || !widgetModule || !initialized || !host.current) return;
      clearTimeout(renderTimer);
      try {
        if (!retire()) { fail('Could not reset widgets. Try again.'); return; }
        const generation = marketGeneration;
        market = widgetModule.createWidgetMarketplace({ getUserId: () => alive() && generation === marketGeneration ? actor : '', client, website: true, surface: developers ? 'developers' : 'marketplace', container: host.current, requestSignIn: login,
          openThemes: () => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = '/themes';
          },
        });
        market.open(developers ? 'developers' : 'explore');
        host.current.inert = false;
        clearTimeout(deadline); setError(''); setLoading(false);
      } catch { fail('Could not open widgets. Try again.'); }
    }
    const scheduleRender = () => {
      clearTimeout(renderTimer);
      // Auth listeners run while Supabase holds its auth lock. Open the runtime afterwards.
      renderTimer = setTimeout(render, 0);
    };
    // Load the exact same validated widget runtime used by the desktop app.
    // An explicit retry also bypasses a cached rejected top-level module import.
    const moduleUrl = '/widget-assets/widgetMarketplace.js' + (attempt ? `?retry=${attempt}` : '');
    import(/* webpackIgnore: true */ moduleUrl).then((loaded: WidgetModule) => {
      if (!alive()) return;
      widgetModule = loaded; render();
    }).catch(() => fail('Could not load widgets. Try again.'));
    try {
      client = getSupabaseBrowserClient();
      const version = authVersion;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!alive()) return;
        authVersion++;
        const next = session?.user.id || '';
        if (!initialized || actor !== next) {
          actor = next; initialized = true;
          if (host.current) host.current.inert = true;
          setLoading(true); scheduleRender();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      client.auth.getSession().then(({ data, error: authError }) => {
        if (!alive() || version !== authVersion) return;
        if (authError) { fail('Could not check your account. Try again.'); return; }
        actor = data.session?.user.id || ''; initialized = true; render();
      }).catch(() => {
        if (version === authVersion) fail('Could not check your account. Try again.');
      });
    } catch { fail('Could not check your account. Try again.'); }
    return () => {
      disposed = true; clearTimeout(deadline); clearTimeout(renderTimer);
      retire();
      // This effect is already invalidated; cleanup failures must not break the next route.
      try { unsubscribe?.(); } catch { /* Obsolete auth callbacks are guarded by alive(). */ }
    };
  }, [developers, attempt]);
  const feedback = <>
    {loading && <p role="status">Loading {developers ? 'your widget studio' : 'widgets'}…</p>}
    {error && <section className="widgetSafety" aria-label="Widgets could not load">
      <p role="alert">{error}</p>
      <button type="button" className="btn primary" onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1); }}>Try again</button>
    </section>}
  </>;
  if (developers) return <DeveloperSpace active="widgets">
    <div className="developerSpaceIntro"><p className="developerSpaceEyebrow">MADE BY YOU</p><h1>Widget studio</h1>
    <p>Build with HTML, CSS and JavaScript. Test a fixed release, then publish it free or choose a one-time price when selling is enabled.</p>
    <p>Paid publishing needs a verified Stripe account. Buyers get a licence to use the widget and later published versions. Removing a paid widget from the store keeps its fixed version available to buyers; installation and updates stay their choice. Stripe processing fees are paid by the creator.</p></div>
    {feedback}<div ref={host} aria-label="Widget studio" aria-busy={loading} />
  </DeveloperSpace>;
  return <div className="hp editorial ed-marketplace">
    <HomeNav active="marketplace" skipToContent />
    <main id="main-content" tabIndex={-1} className="widgetWebsite">
      <div className="widgetWebsiteIntro">
        <div><span className="widgetWebsiteEyebrow ed-eyebrow">MADE FOR YOUR HOME SCREEN</span>
        <h1>Marketplace</h1>
        <p>Small tools. Your own space. Discover free widgets and one-time purchases for your ALTARA home.</p>
        <p>A purchase gives you a licence to use the widget. ALTARA keeps the fixed version you install when it leaves the store. External services can stop working, and security or payment restrictions can pause access. Review permissions before installation; updates need your approval.</p></div>
        <div className="widgetWebsiteLinks">
          {/* Keep navigation into account tools independent of the marketing document. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/developers/widgets">Create a widget ↗</a>
          <a href="/app">Open ALTARA →</a>
        </div>
      </div>
      {feedback}
      <div ref={host} aria-label="Widget marketplace" aria-busy={loading} />
    </main>
    <SiteFooter analytics={false} />
  </div>;
}
