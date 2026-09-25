import Link from "next/link";

import { HomeNav } from "./components/home-nav";
import { SiteFooter } from "./components/site-chrome";

export default function NotFound() {
  return (
    <div className="hp">
      <HomeNav />
      <main>
        <section className="hp-hero hp-hero--compact">
          <div className="hp-container">
            <div className="hp-hero-copy">
              <p className="da-eyebrow">404 / PAGE NOT FOUND</p>
              <h1 className="hp-h1 hp-h1--compact">This page isn&apos;t here.</h1>
              <p className="hp-hero-sub">The link may have moved. Find your way back to ALTARA or explore the current pages.</p>
              <div className="hp-hero-cta">
                <Link href="/" className="hp-btn hp-btn-primary">Go to homepage</Link>
                <Link href="/features" className="hp-btn hp-btn-secondary">Explore features</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
