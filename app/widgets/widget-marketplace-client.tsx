'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HomeNav } from '../components/home-nav';
import { DeveloperSpace } from '../developers/components/developer-space';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import './widgets.css';

type Market = { open: (tab: string) => void; dispose: () => void };
type WidgetModule = { createWidgetMarketplace: (options: Record<string, unknown>) => Market };

export function WidgetMarketplaceClient({ developers = false }: { developers?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, market: Market | undefined, actor = '', initialized = false;
    const client = getSupabaseBrowserClient();
    let widgetModule: WidgetModule | undefined;
    const login = (widgetId?: string) => {
      const returnTo = new URL(window.location.href);
      if (widgetId) returnTo.searchParams.set('widget', widgetId);
      // The login page is the standalone app shell and requires a document navigation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login.html?return_to=${encodeURIComponent(returnTo.pathname + returnTo.search)}`;
    };
    function render() {
      if (disposed || !widgetModule || !initialized || !host.current) return;
      market?.dispose();
      market = widgetModule.createWidgetMarketplace({ getUserId: () => actor, client, website: true, surface: developers ? 'developers' : 'marketplace', container: host.current, requestSignIn: login });
      market.open(developers ? 'developers' : 'explore');
    }
    // Load the exact same validated widget runtime used by the desktop app.
    const moduleUrl = '/widget-assets/widgetMarketplace.js';
    import(/* webpackIgnore: true */ moduleUrl).then((loaded: WidgetModule) => { widgetModule = loaded; render(); }).catch(() => { if (!disposed) setError('Could not load widgets. Please refresh this page.'); });
    let authEvent = false;
    client.auth.getSession().then(({ data, error: authError }) => {
      if (disposed || authEvent) return;
      if (authError) { setError('Could not check your account. Refresh to try again.'); return; }
      actor = data.session?.user.id || ''; initialized = true; render();
    }).catch(() => { if (!disposed) setError('Could not check your account. Refresh to try again.'); });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      authEvent = true;
      const next = session?.user.id || '';
      if (!initialized || actor !== next) { actor = next; initialized = true; render(); }
    });
    return () => { disposed = true; market?.dispose(); data.subscription.unsubscribe(); };
  }, [developers]);
  if (developers) return <DeveloperSpace active="widgets">
    <div className="developerSpaceIntro"><p className="developerSpaceEyebrow">MADE BY YOU</p><h1>Widget studio</h1>
    <p>Build, test and publish. Manage your widgets and updates in one place.</p></div>
    {error && <p role="alert">{error}</p>}<div ref={host} aria-label="Widget studio" />
  </DeveloperSpace>;
  return <>
    <HomeNav active="marketplace" />
    <main className="widgetWebsite">
      <div className="widgetWebsiteIntro">
        <div><span className="widgetWebsiteEyebrow">MAKE ROOM FOR WHAT MATTERS</span>
        <h1>Marketplace</h1>
        <p>Small tools. Your own space. Find a widget for your ALTARA home.</p></div>
        <div className="widgetWebsiteLinks"><Link href="/developers/widgets">Create a widget ↗</Link><Link href="/app">Open ALTARA →</Link></div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div ref={host} aria-label="Widget marketplace" />
    </main>
  </>;
}
