import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { HomeNav } from "../components/home-nav";
import { Reveal } from "../components/reveal";
import {
  BrowserDownloadOption,
  DOWNLOAD_URL,
  LinuxDownloadOption,
  LinuxPreviewNote,
  MacDownloadOption,
  RELEASES_URL,
  SiteFooter,
  WindowsDownloadOption,
} from "../components/site-chrome";

const description =
  "What ALTARA can actually do: servers with channels, roles, and permissions, private and group DMs, voice channels with Spatial Audio, a personal dashboard, and real presence.";

export const metadata: Metadata = {
  title: "Features",
  description,
  alternates: {
    canonical: "/features",
  },
  openGraph: {
    url: "/features",
    title: "ALTARA Features",
    description,
    images: [
      {
        url: "/altara-server-channel.png",
        width: 1719,
        height: 765,
        alt: "An ALTARA server with channels, roles, and an active text conversation",
      },
    ],
  },
  twitter: {
    title: "ALTARA Features",
    description,
    images: ["/altara-server-channel.png"],
  },
};

const messagingSupport = [
  {
    title: "Reactions & GIFs",
    body: "React to a message or drop in a GIF without breaking the flow.",
  },
  {
    title: "File sharing",
    body: "Share images and files up to 25MB for free — ALTARA+ raises the ceiling.",
  },
];

const socialSupport = [
  {
    title: "Active Now",
    body: "See who's around and jump into a call or DM in one click.",
  },
  {
    title: "Themes & color",
    body: "Built-in themes, or set your own background and accent colors.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="hp">
      <HomeNav active="features" />

      <main>
        <section className="hp-hero hp-hero-plain">
          <div className="hp-container">
            <Reveal className="hp-hero-copy">
              <h1 className="hp-h1">Everything you need to stay connected.</h1>
              <p className="hp-hero-sub">
                Servers and DMs, voice and Spatial Audio, a personal dashboard, and the small
                details that make it feel like yours.
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
              </div>
            </Reveal>
          </div>
        </section>

        <section className="hp-stories hp-stories--tight">
          <div className="hp-container hp-container--wide">
            <div className="hp-story hp-story--wide-media-xl">
              <Reveal className="hp-story-media">
                <div className="hp-shot hp-shot-servermain hp-shot-servermain--lg">
                  <Image
                    src="/altara-server-channel.png"
                    alt="An ALTARA server with the channel sidebar, the active #general text channel with messages, and the member list showing owner, member, and bot roles"
                    width={1719}
                    height={765}
                    sizes="(max-width: 980px) 100vw, 920px"
                    unoptimized
                  />
                </div>
              </Reveal>
              <Reveal className="hp-story-text">
                <h2 className="hp-h2">Servers built around real conversation.</h2>
                <p>
                  Text and voice channels, organized with categories. Roles and permissions
                  decide who can post, moderate, or manage the server — the same structure
                  you already know, done cleanly.
                </p>
              </Reveal>
            </div>
          </div>

          <div className="hp-container">
            <div className="hp-story hp-story--reverse hp-story--wide-media-r hp-story--wide-media-r-lg">
              <Reveal className="hp-story-media">
                <div className="hp-shot hp-shot-callmain hp-shot-callmain--lg">
                  <Image
                    src="/altara-call-voice.png"
                    alt="A live ALTARA voice channel call with two participant tiles, the voice channel member list, and the full call control bar including Spatial Audio"
                    width={1719}
                    height={764}
                    sizes="(max-width: 980px) 100vw, 820px"
                    unoptimized
                  />
                </div>
              </Reveal>
              <Reveal className="hp-story-text">
                <h2 className="hp-h2">Calls that feel like a real room.</h2>
                <p>
                  Voice channels with participant tiles and Spatial Audio, plus screen
                  sharing when you need to show something — jump in from the sidebar without
                  leaving the server.
                </p>
              </Reveal>
            </div>

            <div className="hp-story">
              <Reveal className="hp-story-media">
                <div
                  className="hp-shot hp-shot-dashboard"
                  role="img"
                  aria-label="Detail of the ALTARA dashboard: the Checklist and Study Mode focus timer widgets"
                />
              </Reveal>
              <Reveal className="hp-story-text">
                <h2 className="hp-h2">More than chat — a dashboard for your day.</h2>
                <p>
                  Checklist, calendar, and notepad widgets on your own home screen, plus a
                  Study Mode focus timer for when you need to lock in.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="hp-editorial">
          <div className="hp-container">
            <Reveal className="hp-editorial-split">
              <div className="hp-editorial-primary">
                <h2>Private & group DMs</h2>
                <p>
                  One-to-one or small group conversations, kept separate from your servers
                  — for the conversations that don&apos;t belong in a channel.
                </p>
              </div>
              <div className="hp-editorial-support">
                {messagingSupport.map((point) => (
                  <div key={point.title} className="hp-editorial-support-item">
                    <h3>{point.title}</h3>
                    <p>{point.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="hp-editorial">
          <div className="hp-container">
            <Reveal>
              <h2 className="hp-editorial-statement">Presence that tells the truth.</h2>
              <p className="hp-editorial-sub">
                Online, idle, Focus, or Do Not Disturb — set once, and it stays accurate
                everywhere your friends see you.
              </p>
              <div className="hp-editorial-support hp-editorial-support-row">
                {socialSupport.map((point) => (
                  <div key={point.title} className="hp-editorial-support-item">
                    <h3>{point.title}</h3>
                    <p>{point.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="hp-plus-mini">
          <div className="hp-container">
            <Reveal className="hp-plus-mini-panel">
              <h2 className="hp-h2 hp-h2--section">ALTARA+ extends the room you have.</h2>
              <p className="hp-lead">
                Core and Nova raise your server, upload, and Focus limits, with HD Spatial
                Audio and automation on Nova. The free app stays fully usable without either
                one.
              </p>
              <p className="hp-plus-mini-tiers">
                <strong>Core</strong> &euro;4.99/mo &middot; <strong>Nova</strong> &euro;7.99/mo
              </p>
              <Link href="/#altara-plus" className="hp-btn hp-btn-secondary">
                See what&apos;s included
              </Link>
            </Reveal>
          </div>
        </section>

        <section className="hp-cta">
          <div className="hp-container">
            <Reveal className="hp-cta-panel">
              <h2 className="hp-h2 hp-h2--section">See it for yourself.</h2>
              <p className="hp-lead">
                Download ALTARA or try it in your browser — no account needed to look
                around.
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
