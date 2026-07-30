import Image from "next/image";
import type { Metadata } from "next";

import {
  BrowserDownloadOption,
  DOWNLOAD_URL,
  LINUX_DOWNLOAD_URL,
  LinuxDownloadOption,
  LinuxPreviewNote,
  MacDownloadOption,
  RELEASES_URL,
  SiteFooter,
  SiteNav,
  TRY_IN_BROWSER_URL,
  WINDOWS_DOWNLOAD_URL,
  WindowsDownloadOption,
} from "./components/site-chrome";

const description =
  "ALTARA is a clean Discord alternative for friends, gaming groups, and small communities, with voice, private messages, widgets, and simple group spaces without the noise.";

const heroImage = {
  src: "/altara-home-page-clean.png",
  width: 1592,
  height: 988,
  alt: "ALTARA home page showing widgets, friends, calendar, notes, calls, unread DMs, and active friends",
};

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
        url: heroImage.src,
        width: heroImage.width,
        height: heroImage.height,
        alt: heroImage.alt,
      },
    ],
  },
  twitter: {
    title: "ALTARA | Where friends stay close",
    description,
    images: [heroImage.src],
  },
};

const featureCards = [
  {
    title: "Personal widgets dashboard",
    description:
      "Your own home screen for notes, checklists, calendar reminders, calls, and custom widgets in one clean dashboard.",
  },
  {
    title: "Private DMs and calls",
    description:
      "One-to-one messages and voice calls for the conversations that should stay away from public channels.",
  },
  {
    title: "Friends and communities",
    description:
      "Small groups, gaming nights, and community spaces without the feed energy that makes everything feel loud.",
  },
];

const productProof = [
  {
    title: "Widgets first",
    description: "Checklist, calendar, notepad, calls, status, and unread DMs live on the same clean home screen.",
    className: "proof-widgets",
    image: "/proof-widgets-clean.png",
    imageWidth: 930,
    imageHeight: 760,
    alt: "ALTARA widgets dashboard with checklist, calendar, notepad, call panel, online status, and unread DMs",
  },
  {
    title: "People stay close",
    description: "Friends, best friends, and group spaces stay visible without turning the app into a giant public feed.",
    className: "proof-people",
    image: "/proof-people-clean.png",
    imageWidth: 270,
    imageHeight: 740,
    alt: "ALTARA friends list with best friends and online people",
  },
  {
    title: "Calls stay quick",
    description: "Jump into voice, open pending requests, or start a DM without digging through layers of UI.",
    className: "proof-calls",
    image: "/proof-calls-clean.png",
    imageWidth: 462,
    imageHeight: 300,
    alt: "ALTARA call widget with quick actions for friends, pending requests, and adding friends",
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
                A cleaner chat app for friends, gaming groups, and small communities. Voice,
                messages, widgets, and private spaces without the noise.
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
                  <span className="dot" /> Windows and Linux x64 available
                </span>
              </div>
            </div>

            <div className="demo" id="preview">
              <div className="demo-glow" />
              <div className="demo-frame demo-frame-screenshot" data-cursor="hover" data-tilt-preview>
                <div className="preview-screenshot-wrap">
                  <Image
                    src={heroImage.src}
                    alt={heroImage.alt}
                    className="preview-screenshot"
                    width={heroImage.width}
                    height={heroImage.height}
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

        <section className="product-proof">
          <div className="container">
            <div className="section-head">
              <h2>
                Actual app, <span className="gradient-text">actual screens.</span>
              </h2>
              <p className="lead">
                The site should show the thing itself, so here is the current ALTARA dashboard doing
                real product work.
              </p>
            </div>

            <div className="proof-grid">
              {productProof.map((item) => (
                <article key={item.title} className="proof-card" data-cursor="hover">
                  <div className={`proof-shot ${item.className}`}>
                    <Image
                      src={item.image}
                      alt={item.alt}
                      width={item.imageWidth}
                      height={item.imageHeight}
                      sizes="(max-width: 800px) 100vw, 360px"
                      unoptimized
                    />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="release-strip">
          <div className="container">
            <div className="release-card">
              <span className="eyebrow">
                <span className="dot" /> Latest version
              </span>
              <div className="release-copy">
                <h2>v1.0 is the public beta.</h2>
                <p>
                  Windows and the portable Linux x64 preview are live now. Browser access is open
                  too; macOS is planned next.
                </p>
              </div>
              <div className="release-actions">
                <a
                  href={WINDOWS_DOWNLOAD_URL}
                  className="btn btn-primary"
                >
                  Download for Windows
                </a>
                <a href={LINUX_DOWNLOAD_URL} className="btn btn-secondary">
                  Download Linux
                </a>
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  Release notes
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="download">
          <div className="container">
            <div className="cta-band">
              <div className="blob blob-1" />
              <div className="blob blob-2" />
              <span className="eyebrow">
                <span className="dot" /> Windows and Linux x64 available
              </span>
              <h2>Get the gang together. Download ALTARA for desktop.</h2>
              <p>
                Available for Windows and Linux x64. Browser access is open too; macOS is planned
                next.
              </p>

              <div className="cta-platforms">
                <MacDownloadOption />
                <WindowsDownloadOption />
                <LinuxDownloadOption />
                <BrowserDownloadOption />
              </div>
              <LinuxPreviewNote />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
