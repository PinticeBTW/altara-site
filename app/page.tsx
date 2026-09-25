import Image from "next/image";
import type { Metadata } from "next";
import type { SVGProps } from "react";

import { HomeNav } from "./components/home-nav";
import { Reveal } from "./components/reveal";
import {
  BrowserDownloadOption,
  DOWNLOAD_URL,
  LinuxDownloadOption,
  LinuxPreviewNote,
  MacDownloadOption,
  RELEASES_URL,
  SiteFooter,
  TRY_IN_BROWSER_URL,
  WindowsDownloadOption,
} from "./components/site-chrome";

const description =
  "ALTARA is a place for friends, gaming groups, and small communities to stay close with voice chat, private messages, shared servers, and a personal dashboard.";

const heroImage = {
  src: "/altara-dashboard-hero.webp",
  socialSrc: "/altara-dashboard-hero.png",
  width: 1917,
  height: 1020,
  alt: "ALTARA dashboard showing the friends sidebar, Online Now, Unread DMs, Calendar, Call widget, Notepad, Checklist, Study Mode focus timer, and Active Now",
};

const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.altaraapp.com/#organization",
      name: "ALTARA",
      url: "https://www.altaraapp.com/",
      logo: "https://www.altaraapp.com/logo.png",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@altaraapp.com",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://www.altaraapp.com/#website",
      name: "ALTARA",
      url: "https://www.altaraapp.com/",
      publisher: { "@id": "https://www.altaraapp.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      name: "ALTARA",
      url: "https://www.altaraapp.com/",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "Windows, Linux, macOS, Web",
      description,
      publisher: { "@id": "https://www.altaraapp.com/#organization" },
    },
  ],
};

export const metadata: Metadata = {
  title: {
    absolute: "ALTARA | Voice Chat and Community Spaces for Friends",
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "ALTARA | Voice Chat and Community Spaces for Friends",
    description,
    images: [
      {
        url: heroImage.socialSrc,
        width: heroImage.width,
        height: heroImage.height,
        alt: heroImage.alt,
      },
    ],
  },
  twitter: {
    title: "ALTARA | Voice Chat and Community Spaces for Friends",
    description,
    images: [heroImage.socialSrc],
  },
};

type IconProps = SVGProps<SVGSVGElement>;

function IconServers(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="5.5" rx="2" />
      <rect x="4" y="13.5" width="16" height="5.5" rx="2" />
      <circle cx="8" cy="7.75" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16.25" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCall(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9.2L5 17.5v-3.5H6.5A2.5 2.5 0 0 1 4 11.5v-6Z" />
    </svg>
  );
}

function IconGrid(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconMoon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 14.2A8 8 0 1 1 9.8 4a6.3 6.3 0 0 0 10.2 10.2Z" />
    </svg>
  );
}

const claims = [
  {
    icon: IconServers,
    title: "Servers, channels, and roles",
    body: "The full toolkit you already know, organized the way your group actually works.",
  },
  {
    icon: IconCall,
    title: "Private DMs and voice calls",
    body: "Calls and messages, with screen sharing, for conversations that don't belong in public.",
  },
  {
    icon: IconGrid,
    title: "A personal widgets dashboard",
    body: "Calendar, checklist, notepad, and status on your own home screen.",
  },
  {
    icon: IconMoon,
    title: "Themes and Focus",
    body: "Make the app feel like yours, and quiet notifications when you need to.",
  },
];

export default function Home() {
  return (
    <div className="hp">
      <HomeNav />

      <main id="home">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd).replace(/</g, "\\u003c") }}
        />
        <section className="hp-hero">
          <div className="hp-container">
            <Reveal className="hp-hero-copy">
              <h1 className="hp-h1">
                Where friends
                <br />
                stay close.
              </h1>
              <p className="hp-hero-sub">
                ALTARA is a Discord alternative for friends, gaming groups, and small communities. Servers,
                voice, messages, and a personal dashboard — the toolkit you know, built with
                more care.
              </p>
              <p className="hp-hero-sub">
                <a href="/discord-alternative">See how ALTARA works as a Discord alternative</a>
              </p>
              <div className="hp-hero-cta">
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hp-btn hp-btn-primary"
                >
                  Download ALTARA
                </a>
                <a href={TRY_IN_BROWSER_URL} className="hp-btn hp-btn-secondary">
                  Try in browser
                </a>
              </div>
              <p className="hp-hero-meta">Free core app &middot; Windows, Linux x64, macOS and browser access</p>
            </Reveal>

            <div className="hp-hero-frame">
              <div className="hp-glass hp-hero-glass">
                <Image
                  src={heroImage.src}
                  alt={heroImage.alt}
                  width={heroImage.width}
                  height={heroImage.height}
                  sizes="(max-width: 1100px) 100vw, 1080px"
                  fetchPriority="high"
                  loading="eager"
                  unoptimized
                  className="hp-hero-img"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="hp-stories">
          <div className="hp-container">
            <div className="hp-story">
              <Reveal className="hp-story-media">
                <div
                  className="hp-shot hp-shot-dashboard"
                  role="img"
                  aria-label="Detail of the ALTARA dashboard: the Checklist and Study Mode focus timer widgets"
                />
              </Reveal>
              <Reveal className="hp-story-text">
                <h2 className="hp-h2">Your day, at a glance.</h2>
                <p>
                  A checklist for what&apos;s next and a Study Mode focus timer, sitting
                  right on your home screen — useful personal tools before you even open a
                  server.
                </p>
              </Reveal>
            </div>

            <div className="hp-story hp-story--reverse hp-story--wide-media-r">
              <Reveal className="hp-story-media">
                <div className="hp-shot hp-shot-servermain">
                  <Image
                    src="/altara-server-channel.png"
                    alt="An ALTARA server with the channel sidebar, the active #general text channel with messages, and the member list showing owner, member, and bot roles"
                    width={1719}
                    height={765}
                    sizes="(max-width: 980px) 100vw, 760px"
                    unoptimized
                  />
                </div>
              </Reveal>
              <Reveal className="hp-story-text">
                <h2 className="hp-h2">Servers, channels, and roles — where the group lives.</h2>
                <p>
                  The full toolkit you already know: text and voice channels, roles and
                  permissions, organized the way your group actually works.
                </p>
              </Reveal>
            </div>

            <div className="hp-story hp-story--wide-media">
              <Reveal className="hp-story-media">
                <div className="hp-shot hp-shot-callmain">
                  <Image
                    src="/altara-call-voice.png"
                    alt="A live ALTARA voice channel call with two participant tiles, the voice channel member list, and the full call control bar including Spatial Audio"
                    width={1719}
                    height={764}
                    sizes="(max-width: 980px) 100vw, 760px"
                    unoptimized
                  />
                </div>
              </Reveal>
              <Reveal className="hp-story-text">
                <h2 className="hp-h2">Calls stay quick, and they feel like a real room.</h2>
                <p>
                  Voice channels with participant tiles, Spatial Audio, and full call
                  controls — jump in from the sidebar without leaving the server.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="hp-claims">
          <div className="hp-container">
            <Reveal className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">Everything a hangout should have.</h2>
            </Reveal>

            <Reveal className="hp-claims-row">
              {claims.map((claim) => {
                const Icon = claim.icon;
                return (
                  <div key={claim.title} className="hp-claim">
                    <Icon className="hp-claim-icon" aria-hidden="true" />
                    <h3>{claim.title}</h3>
                    <p>{claim.body}</p>
                  </div>
                );
              })}
            </Reveal>
          </div>
        </section>

        <section id="altara-plus" className="hp-plus">
          <div className="hp-container">
            <Reveal className="hp-plus-intro">
              <h2 className="hp-h2 hp-h2--section">ALTARA+ is a premium layer, not a paywall.</h2>
              <p>
                Core and Nova unlock more room and finer control. The free app stays fully
                usable without either one.
              </p>
            </Reveal>

            <div className="hp-plus-grid">
              <Reveal className="hp-glass hp-plus-card">
                <div className="hp-plus-head">
                  <span className="hp-plus-name">Core</span>
                  <span className="hp-plus-price">
                    &euro;4.99<span>/mo</span>
                  </span>
                </div>
                <p className="hp-plus-billed">or &euro;44.99 billed yearly</p>
                <p className="hp-plus-for">Best for servers that are starting to grow.</p>
                <ul className="hp-plus-benefits">
                  <li>More room to grow — 150 servers, 15 Best Friends, 10 Focus profiles.</li>
                  <li>50MB uploads for sharing bigger files.</li>
                  <li>Personal Spatial Audio tuning, with up to 5 saved layouts.</li>
                </ul>
              </Reveal>

              <Reveal className="hp-glass hp-plus-card hp-plus-card-nova">
                <div className="hp-plus-head">
                  <span className="hp-plus-name">Nova</span>
                  <span className="hp-plus-price">
                    &euro;7.99<span>/mo</span>
                  </span>
                </div>
                <p className="hp-plus-billed">or &euro;74.99 billed yearly</p>
                <p className="hp-plus-for">Best for power users who want the highest limits.</p>
                <ul className="hp-plus-benefits">
                  <li>The highest limits — 200 servers, 25 Best Friends, 25 Focus profiles.</li>
                  <li>1GB uploads, room for almost anything.</li>
                  <li>
                    HD Spatial Audio with auto-arrange, up to 15 saved layouts, plus Focus
                    automation and analytics.
                  </li>
                </ul>
              </Reveal>
            </div>

            <p className="hp-plus-note">
              Manage ALTARA+ from inside the app — <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">download ALTARA</a> or{" "}
              <a href={TRY_IN_BROWSER_URL}>try it in your browser</a> to get started.
            </p>
          </div>
        </section>

        <section className="hp-cta">
          <div className="hp-container">
            <Reveal className="hp-cta-panel">
              <h2 className="hp-h2 hp-h2--section">Bring your people to ALTARA.</h2>
              <p className="hp-lead">
                Available for Windows, Linux x64, and macOS on Apple Silicon or Intel.
                Browser access is open too.
              </p>

              <div className="hp-cta-platforms">
                <MacDownloadOption />
                <WindowsDownloadOption />
                <LinuxDownloadOption />
                <BrowserDownloadOption />
              </div>
              <LinuxPreviewNote />
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hp-cta-link"
              >
                View release notes
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
