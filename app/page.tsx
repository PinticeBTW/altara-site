import Image from "next/image";
import type { Metadata } from "next";

import {
  DOWNLOAD_URL,
  SiteFooter,
  SiteNav,
  TRY_IN_BROWSER_URL,
} from "./components/site-chrome";

const description =
  "ALTARA is a clean hangout app for friends, with voice, private messages, widgets, and simple group spaces without the noise.";

export const metadata: Metadata = {
  title: {
    absolute: "ALTARA | Where friends stay close",
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "ALTARA | Where friends stay close",
    description,
    images: [
      {
        url: "/altara-app-preview-20260428.png",
        width: 1478,
        height: 885,
        alt: "ALTARA app preview showing widgets, friends, calendar, calls, notes, and DMs",
      },
    ],
  },
  twitter: {
    title: "ALTARA | Where friends stay close",
    description,
    images: ["/altara-app-preview-20260428.png"],
  },
};

const featureCards = [
  {
    title: "Personal widgets dashboard",
    description:
      "Your own home screen for notes, checklists, calendar reminders, calls, and custom widgets in one clean dashboard.",
  },
  {
    title: "Private DMs",
    description:
      "Private messages and calls built for one-to-one conversations, with privacy controls that stay out of public servers.",
  },
  {
    title: "Make it yours",
    description:
      "Themes, channel skins, and personal touches that make ALTARA feel like your own space.",
  },
];

export default function Home() {
  return (
    <div>
      <SiteNav active="home" />

      <main id="home">
        <section className="hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />

          <div className="container">
            <div className="hero-inner">
              <span className="eyebrow">
                <span className="dot" /> Open beta live - v1.0
              </span>

              <h1>
                Where friends
                <span className="line2 gradient-text">stay close.</span>
              </h1>

              <p className="hero-sub">
                A clean hangout for your crew. Voice, messages, and private spaces without the
                noise.
              </p>

              <div className="hero-cta">
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  Download ALTARA
                </a>
                <a href={TRY_IN_BROWSER_URL} className="btn btn-secondary">
                  Try in browser
                </a>
              </div>

              <div className="hero-meta">
                <span>
                  <span className="dot" /> Free forever
                </span>
                <span>
                  <span className="dot" /> macOS - Windows - Linux
                </span>
              </div>
            </div>

            <div className="demo" id="preview">
              <div className="demo-glow" />
              <div className="demo-frame demo-frame-screenshot" data-cursor="hover" data-tilt-preview>
                <div className="preview-screenshot-wrap">
                  <Image
                    src="/altara-app-preview-20260428.png"
                    alt="ALTARA app preview showing widgets, friends, calendar, calls, notes, and DMs"
                    className="preview-screenshot"
                    width={1478}
                    height={885}
                    sizes="(max-width: 1200px) 100vw, 1120px"
                    priority
                    unoptimized
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="highlights">
          <div className="container">
            <div className="section-head">
              <h2>
                Three things we got
                <br />
                <span className="gradient-text">obsessed</span> with.
              </h2>
              <p className="lead">
                Most chat apps try to do a hundred things badly. We picked what actually matters
                for hanging out and built it clean.
              </p>
            </div>

            <div className="cards">
              {featureCards.map((card) => (
                <article key={card.title} className="card" data-cursor="hover">
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                  <div className="card-decor" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="download">
          <div className="container">
            <div className="cta-band">
              <div className="blob blob-1" />
              <div className="blob blob-2" />
              <span className="eyebrow">
                <span className="dot" /> Free - 76MB - Windows, macOS, and Linux
              </span>
              <h2>Get the gang together. Download ALTARA.</h2>
              <p>
                Available on every platform you use. Sync across all of them and pick up where you
                left off.
              </p>

              <div className="cta-platforms">
                <button
                  type="button"
                  className="platform-btn platform-btn-disabled"
                  disabled
                  aria-disabled="true"
                >
                  <span className="platform-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Download for</small>
                    <span className="platform-name">macOS</span>
                    <span className="platform-soon">Em breve</span>
                  </div>
                </button>
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="platform-btn"
                >
                  <span className="platform-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 5.557 9.836 4.62v6.687H3zm0 12.886V12.69h6.836v6.687zM10.673 4.5 21 3v8.307H10.673zm0 15v-7.81H21v9.31z" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Download for</small>
                    <span className="platform-name">Windows</span>
                  </div>
                </a>
                <button
                  type="button"
                  className="platform-btn platform-btn-disabled"
                  disabled
                  aria-disabled="true"
                >
                  <span className="platform-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m7 10 3 2-3 2" />
                      <path d="M12 14h5" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Download for</small>
                    <span className="platform-name">Linux</span>
                    <span className="platform-soon">Em breve</span>
                  </div>
                </button>
                <a href={TRY_IN_BROWSER_URL} className="platform-btn">
                  <span className="platform-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                      <path d="M2 12h20" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Or just</small>
                    <span className="platform-name">Try in browser</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
