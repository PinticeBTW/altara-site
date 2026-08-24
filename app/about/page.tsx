import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { HomeNav } from "../components/home-nav";
import { Reveal } from "../components/reveal";
import { DOWNLOAD_URL, SiteFooter } from "../components/site-chrome";

const description =
  "Why ALTARA exists: a calmer, more personal home for friend groups, gaming groups, and small communities, started in February 2026 and independently built by Tomás Nunes.";

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: "/about",
    title: "About ALTARA",
    description,
    images: [
      {
        url: "/altara-dashboard-hero.png",
        width: 1917,
        height: 1020,
        alt: "The ALTARA dashboard",
      },
    ],
  },
  twitter: {
    title: "About ALTARA",
    description,
    images: ["/altara-dashboard-hero.png"],
  },
};

const principles = [
  {
    num: "01",
    title: "Friends first",
    body: "Built for friend groups and the communities around them — no infinite feed, no algorithmic noise.",
  },
  {
    num: "02",
    title: "Useful, not noisy",
    body: "Voice, DMs, and a personal dashboard, without visual overload. Private conversations follow privacy-first defaults.",
  },
  {
    num: "03",
    title: "Free at the core",
    body: "The core app is fully usable without paying. ALTARA+ funds the work — it doesn't gate it.",
  },
];

const timeline = [
  {
    label: "Feb 2026",
    body: "First ALTARA prototype.",
  },
  {
    label: "2026",
    body: "Servers, DMs, calls, dashboard, Focus, and community tools take shape.",
  },
  {
    label: "Now",
    body: "Open beta. Windows and Linux live. Browser access open. ALTARA+ live.",
  },
  {
    label: "Next",
    body: "macOS planned, alongside continued product and community improvements.",
  },
];

export default function AboutPage() {
  return (
    <div className="hp">
      <HomeNav active="about" />

      <main>
        <section className="hp-hero hp-hero--compact">
          <div className="hp-container">
            <Reveal className="hp-hero-copy">
              <h1 className="hp-h1 hp-h1--compact">
                Built for the people you actually talk to.
              </h1>
              <p className="hp-hero-sub">
                A calmer home for friend groups, gaming groups, and small communities — not
                another giant social app.
              </p>
              <p className="hp-hero-meta">Independent &middot; Open beta &middot; Since February 2026</p>
            </Reveal>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <Reveal className="hp-about-why">
              <h2 className="hp-pullquote">
                The group chat was never supposed to feel like a feed.
              </h2>
              <div className="hp-about-prose">
                <p>
                  Most of us had lived inside Discord for years. It worked, but it kept
                  getting louder and busier — full of strangers, shaped more like a feed
                  than a place to talk. ALTARA started in February 2026 because we wanted
                  that feeling back.
                </p>
                <p>
                  Not a Discord clone, not another giant social app — just voice, private
                  messages, community spaces, and a personal dashboard, built for friends,
                  gaming groups, and small communities.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <Reveal className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">What ALTARA won&apos;t compromise on.</h2>
            </Reveal>

            <Reveal className="hp-principle-list">
              {principles.map((principle) => (
                <div key={principle.num} className="hp-principle">
                  <div className="hp-principle-num">{principle.num}</div>
                  <div className="hp-principle-body">
                    <h3>{principle.title}</h3>
                    <p>{principle.body}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <Reveal className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">Independently built.</h2>
            </Reveal>

            <Reveal className="hp-glass hp-founder-panel">
              <div className="hp-founder-photo">
                <Image
                  src="/tomas-nunes-card.jpg"
                  alt="Tomás Nunes, founder of ALTARA"
                  width={220}
                  height={220}
                  sizes="220px"
                  unoptimized
                />
              </div>
              <div className="hp-founder-body">
                <h3 className="hp-founder-name">Tomás Nunes</h3>
                <p className="hp-founder-role">@pintice &middot; founder, designer, developer</p>
                <p className="hp-founder-bio">
                  Plays games, runs RPGs, and spends a lot of time in calls — built ALTARA
                  to be the app he wanted for exactly that. Decisions stay close to the
                  product and the people using it.
                </p>
                <ul className="hp-founder-facts">
                  <li>Started building ALTARA in February 2026.</li>
                  <li>Friends help with art, testing, and feedback.</li>
                  <li>ALTARA+ funds continued development.</li>
                </ul>
                <div className="hp-founder-links">
                  <a
                    href="https://www.instagram.com/pintice__/"
                    aria-label="Instagram"
                    title="Instagram"
                    target="_blank"
                    rel="me noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                  <a
                    href="https://www.youtube.com/@NID-boys"
                    aria-label="NID Boys on YouTube"
                    title="NID Boys on YouTube"
                    target="_blank"
                    rel="me noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12z" />
                    </svg>
                  </a>
                  <a
                    href="https://www.youtube.com/@pintice"
                    aria-label="pintice on YouTube"
                    title="pintice on YouTube"
                    target="_blank"
                    rel="me noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12z" />
                    </svg>
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <Reveal className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">The story so far.</h2>
            </Reveal>

            <Reveal className="hp-timeline">
              {timeline.map((item) => (
                <div key={item.label} className="hp-timeline-item">
                  <div className="hp-timeline-label">{item.label}</div>
                  <p>{item.body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="hp-cta">
          <div className="hp-container">
            <Reveal className="hp-cta-panel">
              <h2 className="hp-h2 hp-h2--section">Still building. Still listening.</h2>
              <p className="hp-lead">ALTARA keeps shipping based on how people actually use it.</p>
              <div className="hp-hero-cta">
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hp-btn hp-btn-primary"
                >
                  Download ALTARA
                </a>
                <Link href="/features" className="hp-btn hp-btn-secondary">
                  See features
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
