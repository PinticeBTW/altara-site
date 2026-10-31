import Link from 'next/link';
import type { ReactNode } from 'react';
import { HomeNav } from '../../components/home-nav';
import { SiteFooter } from '../../components/site-chrome';
import './developer-space.css';

export function DeveloperSpace({ active, children }: { active?: string; children: ReactNode }) {
  return <div className="hp editorial ed-developers developerSpace">
    <HomeNav active="developers" skipToContent />
    <div className="developerSpaceHeader"><Link href="/developers" className="developerSpaceBrand"><b>Developer Portal</b></Link><nav aria-label="Developer navigation"><a href="/marketplace">Marketplace ↗</a><a href="/app">Open ALTARA</a></nav></div>
    <nav className="developerSpaceTabs" aria-label="Creation type">
      <Link href="/developers/applications" aria-current={active === 'bots' ? 'page' : undefined}>Bots</Link>
      <Link href="/developers/widgets" aria-current={active === 'widgets' ? 'page' : undefined}>Widgets</Link>
      <Link href="/developers/themes" aria-current={active === 'themes' ? 'page' : undefined}>Themes</Link>
    </nav><main id="main-content" tabIndex={-1} className="developerSpaceContent">{children}</main>
    <SiteFooter analytics={false} />
  </div>;
}

export function DeveloperHub() {
  return <DeveloperSpace><p className="developerSpaceEyebrow">MADE BY YOU</p><h1>What will you create?</h1><p>One place for your creations. Build, test and share them with the ALTARA community.</p><div className="developerSpaceGrid">
    <Link href="/developers/applications"><span>01 / BOTS</span><h2>Bring your community to life.</h2><p>Create and manage your bots, commands and integrations.</p><strong>Manage bots →</strong></Link>
    <Link href="/developers/widgets"><span>02 / WIDGETS</span><h2>Make home more useful.</h2><p>Test your widget, prepare its title and description, then publish to the Marketplace.</p><strong>Manage widgets →</strong></Link>
    <Link href="/developers/themes"><span>03 / THEMES</span><h2>A look of your own.</h2><p>Create, preview and publish free themes. Share your colours, materials and layout with the community.</p><strong>Manage themes →</strong></Link>
  </div></DeveloperSpace>;
}
