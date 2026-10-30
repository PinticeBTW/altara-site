import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { HomeNav } from "../components/home-nav";
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
} from "../components/site-chrome";

const description =
  "Explore ALTARA: server voice with Spatial Audio, custom themes, dashboard widgets, channels, roles, DMs and Focus. See what is free and what ALTARA+ adds.";
const image = "/altara-appearance-real-2026.webp";
export const metadata: Metadata = {
  title: "Voice, Chat and Community Features",
  description,
  alternates: { canonical: "/features" },
  openGraph: {
    url: "/features",
    title: "ALTARA Features",
    description,
    images: [
      {
        url: image,
        width: 1100,
        height: 800,
        alt: "ALTARA appearance settings with themes and custom colours",
      },
    ],
  },
  twitter: { title: "ALTARA Features", description, images: [image] },
};

const features = [
  {
    id: "dashboard",
    number: "02",
    title: "A home screen with a job to do.",
    intro: "Your conversations have a place. So do the things around them.",
    body: "Keep a checklist, calendar and notepad on your dashboard. Add a Study Mode timer for a focused session, or explore widgets from the community.",
    details: [
      "Calendar, checklist and notes",
      "Study Mode focus timer",
      "Community widgets via the Marketplace",
    ],
    link: { href: "/widgets", label: "Explore widgets" },
  },
  {
    id: "voice",
    number: "03",
    title: "Put a little space between voices.",
    intro: "Spatial Audio gives voices a sense of direction in a server call.",
    body: "Join a server voice channel and switch Spatial Audio on when you want to use it. Basic Spatial Audio is free. Core and Nova add saved-layout capacity for the next time you meet.",
    details: [
      "Spatial Audio in server voice channels",
      "Participant tiles and individual volume controls",
      "Screen sharing for showing what you are working on",
    ],
    note: "Spatial Audio is available in connected server voice channels, rather than private or group calls.",
  },
  {
    id: "servers",
    number: "04",
    title: "A place for the whole group.",
    intro:
      "The channel structure you already understand, ready for your community.",
    body: "Give each conversation a text channel, gather voice channels into categories, and use roles and permissions to manage who can post, moderate or change the server.",
    details: [
      "Text and voice channels with categories",
      "Roles and permissions",
      "Reactions, GIFs and file sharing",
    ],
  },
  {
    id: "messages",
    number: "05",
    title: "Take the conversation aside.",
    intro: "Direct messages for a friend. Group DMs for a few of you.",
    body: "Keep those conversations separate from your servers, with voice calls and screen sharing when typing is not enough. Share images and files up to 25MB on Free; paid plans increase the upload limit.",
    details: [
      "One-to-one and group DMs",
      "Voice calls and screen sharing",
      "Privacy locks for DMs",
    ],
    link: { href: "/faq", label: "Read the messaging FAQ" },
  },
  {
    id: "focus",
    number: "06",
    title: "Decide when you are available.",
    intro:
      "Some evenings are for a call. Some are for getting something finished.",
    body: "Use Focus profiles to control interruptions. Set your presence to online, idle or Do Not Disturb, and keep the people you talk to most in Best Friends.",
    details: [
      "Focus and Do Not Disturb",
      "3 saved Focus profiles on Free",
      "Best Friends pins included on every plan",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="hp editorial">
      <HomeNav active="features" skipToContent />
      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero">
          <div className="hp-container">
            <p className="ed-eyebrow">Inside ALTARA</p>
            <h1>
              The familiar parts.
              <br />
              <em>Your own way.</em>
            </h1>
            <p className="ed-page-lead">
              Servers and calls get the group together. Personalisation, Spatial
              Audio and a useful home screen make the space yours.
            </p>
            <div className="ed-actions">
              <a href={DOWNLOAD_URL} className="hp-btn hp-btn-primary">
                Download ALTARA <span aria-hidden="true">↗</span>
              </a>
              <a href={TRY_IN_BROWSER_URL} className="ed-text-link">
                Open in browser <span aria-hidden="true">↗</span>
              </a>
            </div>
            <nav className="ed-feature-index" aria-label="Explore features">
              <a href="#appearance">Appearance</a>
              <a href="#dashboard">Dashboard</a>
              <a href="#voice">Voice</a>
              <a href="#servers">Servers</a>
              <a href="#messages">Messages</a>
              <a href="#focus">Focus</a>
            </nav>
          </div>
        </section>
        <section id="appearance" className="ed-feature ed-feature-appearance">
          <div className="hp-container">
            <div className="ed-feature-heading">
              <span className="ed-index">01 / Appearance</span>
              <h2>
                A little more you.
                <br />A lot less default.
              </h2>
              <p>
                Pick a built-in theme, set your own colours, or explore
                community themes. The space you spend time in should feel like
                one you chose.
              </p>
            </div>
            <figure className="ed-feature-capture">
              <Image
                src={image}
                alt="Actual ALTARA Appearance panel with six theme choices, custom colour controls and a live preview"
                width={1100}
                height={800}
                sizes="(max-width: 800px) 100vw, 900px"
              />
              <figcaption>
                Actual ALTARA settings. Built-in themes and custom colour
                controls.
              </figcaption>
            </figure>
            <a href="/themes" className="ed-text-link">
              Explore community themes <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
        <div className="hp-container">
          {features.map((feature) => (
            <section
              id={feature.id}
              key={feature.id}
              className="ed-feature-row"
            >
              <span className="ed-index">
                {feature.number} / {feature.id}
              </span>
              <div>
                <h2>{feature.title}</h2>
                <p className="ed-feature-intro">{feature.intro}</p>
              </div>
              <div>
                <p>{feature.body}</p>
                <ul>
                  {feature.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                {feature.note && <p className="ed-small">{feature.note}</p>}
                {feature.link && (
                  <a href={feature.link.href} className="ed-text-link">
                    {feature.link.label} <span aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </section>
          ))}
        </div>
        <section className="ed-section ed-feature-plus">
          <div className="hp-container ed-two-column">
            <div>
              <p className="ed-eyebrow">A clear line between free and paid</p>
              <h2>
                Find your fit.
                <br />
                Leave room to grow.
              </h2>
            </div>
            <div>
              <p>
                Focus profiles, basic Spatial Audio and Best Friends pins are
                included on Free. Core and Nova add saved profiles and layouts,
                server capacity, bigger uploads, extra screen sharing modes
                and a supporter profile badge.
              </p>
              <p className="ed-plus-explanation">
                Screen sharing, file transfers and higher usage have ongoing
                infrastructure costs. ALTARA+ helps cover those costs and keep
                the service running. Our aim is to keep features free whenever
                we can offer them without extra running costs for ALTARA.
              </p>
              <p className="ed-plus-explanation">
                Free includes screen sharing at 720p60 or 1080p30. Core and
                Nova both add modes up to 4K60 and native source resolution.
                Actual quality depends on your device, browser, capture source
                and connection. Both paid plans have the same sharing modes;
                Nova adds more server, upload and saved-profile capacity.
              </p>
              <dl className="ed-capacity">
                <div>
                  <dt>Free</dt>
                  <dd>3 Focus profiles · Basic Spatial Audio</dd>
                </div>
                <div>
                  <dt>Core · €4.99/mo</dt>
                  <dd>10 Focus profiles · 5 Spatial layouts</dd>
                </div>
                <div>
                  <dt>Nova · €7.99/mo</dt>
                  <dd>25 Focus profiles · 15 Spatial layouts</dd>
                </div>
              </dl>
              <Link href="/#altara-plus" className="ed-text-link">
                Compare plans <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
        <section className="ed-final">
          <div className="hp-container">
            <p className="ed-eyebrow">Give the group somewhere to meet</p>
            <h2>Find your next hangout.</h2>
            <p className="ed-final-copy">
              ALTARA is in open beta. Download the desktop app or open it in
              your browser, then sign in or create an account.
            </p>
            <div className="hp-cta-platforms">
              <WindowsDownloadOption />
              <MacDownloadOption />
              <LinuxDownloadOption />
              <BrowserDownloadOption />
            </div>
            <LinuxPreviewNote />
            <p className="ed-small">
              <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
                Read the release notes
              </a>{" "}
              ·{" "}
              <Link href="/discord-alternative">
                Considering ALTARA as a Discord alternative?
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
