import Link from 'next/link';
import type { ReactNode } from 'react';
import './developer-space.css';

export function DeveloperSpace({ active, children }: { active?: string; children: ReactNode }) {
  return <div className="developerSpace">
    <header className="developerSpaceHeader"><Link href="/developers" className="developerSpaceBrand"><i aria-hidden="true">ALT</i><b>ALTARA <span>Developer Portal</span></b></Link><nav aria-label="Developer navigation"><Link href="/marketplace">Marketplace ↗</Link><Link href="/app">Open ALTARA</Link></nav></header>
    <nav className="developerSpaceTabs" aria-label="Creation type">
      <Link href="/developers/applications" aria-current={active === 'bots' ? 'page' : undefined}>Bots</Link>
      <Link href="/developers/widgets" aria-current={active === 'widgets' ? 'page' : undefined}>Widgets</Link>
      <Link href="/developers/themes" aria-current={active === 'themes' ? 'page' : undefined}>Themes <small>Coming soon</small></Link>
    </nav><main className="developerSpaceContent">{children}</main>
  </div>;
}

export function DeveloperHub() {
  return <DeveloperSpace><p className="developerSpaceEyebrow">MADE BY YOU</p><h1>What will you create?</h1><p>One place for your creations. Build, test and share them with the ALTARA community.</p><div className="developerSpaceGrid">
    <Link href="/developers/applications"><span>01 / BOTS</span><h2>Bring your community to life.</h2><p>Create and manage your bots, commands and integrations.</p><strong>Manage bots →</strong></Link>
    <Link href="/developers/widgets"><span>02 / WIDGETS</span><h2>Make home more useful.</h2><p>Test your widget, prepare its title and description, then publish to the Marketplace.</p><strong>Manage widgets →</strong></Link>
    <Link href="/developers/themes"><span>03 / THEMES</span><h2>A look of your own.</h2><p>Themes are coming later. Creating and installing themes is not available yet.</p><strong>Coming soon</strong></Link>
  </div></DeveloperSpace>;
}
