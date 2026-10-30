import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { HomeNav } from "../components/home-nav";
import {
  DOWNLOADS_URL,
  SiteFooter,
  TRY_IN_BROWSER_URL,
} from "../components/site-chrome";

const description =
  "Explore ALTARA as a Discord alternative: servers, channels, roles, voice with Spatial Audio, DMs, screen sharing, and a personal dashboard. See the full feature list.";

export const metadata: Metadata = {
  title: "Discord Alternative for Gaming Groups and Communities",
  description,
  alternates: { canonical: "/discord-alternative" },
  openGraph: {
    type: "website",
    url: "/discord-alternative",
    title: "ALTARA: A Discord Alternative for Your Community",
    description,
    images: [
      {
        url: "/altara-dashboard-demo-20261020.webp",
        width: 1658,
        height: 949,
        alt: "Anonymised dashboard demonstration based on an ALTARA app capture",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTARA: A Discord Alternative for Your Community",
    description,
    images: ["/altara-dashboard-demo-20261020.webp"],
  },
};

const featureGroups = [
  {
    number: "01",
    title: "Your community",
    features: [
      "Servers for friend groups and communities",
      "Text and voice channels",
      "Channel categories",
      "Roles and permissions",
      "Tools to manage who can post or moderate",
    ],
  },
  {
    number: "02",
    title: "Conversations",
    features: [
      "One-to-one and group DMs",
      "Voice calls and server voice channels",
      "Spatial Audio in voice channels",
      "Screen sharing",
      "Message reactions and GIFs",
      "Image and file sharing, up to 25MB on the free tier",
    ],
  },
  {
    number: "03",
    title: "Your space",
    features: [
      "Personal widgets dashboard",
      "Friends and Best Friends in the sidebar",
      "Calendar, checklist and notepad",
      "Study Mode focus timer",
      "Online, idle, Focus and Do Not Disturb presence",
      "Active Now and unread DM widgets",
      "Themes, backgrounds and accent colors",
    ],
  },
  {
    number: "04",
    title: "Ways to join",
    features: [
      "Browser access",
      "Windows desktop app",
      "Linux x64 desktop packages",
      "macOS downloads for Apple Silicon and Intel",
      "Free core app with optional ALTARA+ server and upload capacity",
    ],
  },
];

export default function DiscordAlternativePage() {
  return (
    <div className="hp editorial ed-support da">
      <HomeNav active="discord-alternative" skipToContent />
      <main id="main-content" tabIndex={-1}>
        <section className="da-hero">
          <div className="hp-container da-hero-grid">
            <div className="da-hero-copy">
              <p className="ed-eyebrow">ALTARA / DISCORD ALTERNATIVE</p>
              <h1>A Discord alternative, with room for you.</h1>
              <p className="da-hero-lead">
                Keep familiar servers, voice channels and DMs. Add a personal
                dashboard, themes you can tune and Spatial Audio for server
                voice conversations.
              </p>
              <div className="da-hero-actions">
                <a href={TRY_IN_BROWSER_URL} className="hp-btn hp-btn-primary">
                  Try ALTARA in browser
                </a>
                <a href="#all-features" className="hp-btn hp-btn-secondary">
                  Explore every feature
                </a>
              </div>
              <p className="da-hero-footnote">
                Free core app · Open beta · Windows, Linux x64, macOS and web
              </p>
            </div>
            <div className="da-hero-visual">
              <div className="da-image-frame da-image-frame--hero">
                <Image
                  src="/altara-dashboard-demo-20261020.webp"
                  alt="Anonymised dashboard demonstration based on a real ALTARA app capture, with calendar, notes, checklist and Study Mode"
                  width={1658}
                  height={949}
                  sizes="(max-width: 900px) 100vw, 55vw"
                  preload
                />
              </div>
              <span className="da-visual-caption">
                DASHBOARD DEMO · PERSONAL DETAILS HIDDEN
              </span>
            </div>
          </div>
        </section>

        <section id="highlights" className="da-highlights">
          <div className="hp-container">
            <div className="da-section-heading">
              <p className="ed-eyebrow">THE FEATURES THAT MATTER</p>
              <h2>Start with what your group actually uses.</h2>
              <p>
                Set up a server, try a call and see how the everyday details
                fit.
              </p>
            </div>

            <div className="da-highlight-grid">
              <div className="da-highlight-card da-highlight-card--text">
                <div className="da-highlight-copy">
                  <span className="da-card-index">01 / COMMUNITY</span>
                  <h3>Give your group its own place.</h3>
                  <p>
                    Build a server with text and voice channels, categories,
                    roles and permissions. Keep the game plan, everyday chat and
                    the people who run it together.
                  </p>
                  <span className="da-card-tags">
                    SERVERS · CHANNELS · ROLES
                  </span>
                </div>
              </div>

              <div className="da-highlight-card da-highlight-card--text">
                <span className="da-card-index">02 / VOICE</span>
                <h3>Talk while you play.</h3>
                <p>
                  Jump into voice channels, use Spatial Audio and share your
                  screen when the group needs to see the same thing.
                </p>
                <span className="da-card-tags">
                  VOICE CHANNELS · SPATIAL AUDIO · SCREEN SHARING
                </span>
              </div>

              <div className="da-highlight-card da-highlight-card--text">
                <span className="da-card-index">03 / MESSAGES</span>
                <h3>Keep the smaller conversations close.</h3>
                <p>
                  Send one-to-one or group DMs, react to messages, share GIFs
                  and files. Your channels stay organized while side
                  conversations have room to breathe.
                </p>
                <span className="da-card-tags">
                  DIRECT MESSAGES · REACTIONS · FILES
                </span>
              </div>

              <div className="da-highlight-card da-highlight-card--text">
                <div className="da-highlight-copy">
                  <span className="da-card-index">04 / YOUR SPACE</span>
                  <h3>Make the space feel like yours.</h3>
                  <p>
                    Choose a theme and tune the look of ALTARA. Your home screen
                    brings friends, calls and unread DMs together with calendar,
                    checklist, notepad and Study Mode widgets.
                  </p>
                  <span className="da-card-tags">THEMES · WIDGETS · FOCUS</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="all-features" className="da-all-features">
          <div className="hp-container">
            <div className="da-section-heading">
              <p className="ed-eyebrow">AT A GLANCE</p>
              <h2>Everything ALTARA brings to the table.</h2>
              <p>
                Here is the current feature set, grouped by what you need to do.{" "}
                <Link href="/features">Explore features in more detail</Link>.
              </p>
            </div>
            <div className="da-feature-groups">
              {featureGroups.map((group) => (
                <div className="da-feature-group" key={group.title}>
                  <div className="da-group-head">
                    <span>{group.number}</span>
                    <h3>{group.title}</h3>
                  </div>
                  <ul>
                    {group.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="da-fit">
          <div className="hp-container da-fit-grid">
            <div>
              <p className="ed-eyebrow">BEFORE YOU MOVE</p>
              <h2>See if ALTARA fits your group.</h2>
            </div>
            <div className="da-fit-copy">
              <p>
                ALTARA is in open beta. Messages, calls, Best Friends pins,
                Focus profiles, basic Spatial Audio in server voice channels and
                DM privacy locks are included in Free. Core and Nova add
                saved-profile and saved-layout capacity, server capacity, bigger
                uploads, higher-quality screen sharing and supporter badges.
                These optional plans help cover infrastructure for screen
                sharing, file transfers and higher usage. Our aim is to keep
                features free whenever we can offer them without extra running
                costs for ALTARA.
              </p>
              <p>
                Want the details first? Check the{" "}
                <Link href="/faq">FAQ and platform answers</Link>, or read the{" "}
                <Link href="/privacy">privacy policy</Link> before bringing your
                group over.
              </p>
            </div>
          </div>
        </section>

        <section className="da-fit" aria-labelledby="da-moving-heading">
          <div className="hp-container da-fit-grid">
            <div>
              <p className="ed-eyebrow">MOVING YOUR GROUP</p>
              <h2 id="da-moving-heading">Try a smaller move first.</h2>
            </div>
            <div className="da-fit-copy">
              <p>
                Start with the friends who regularly talk together. Create a
                server, add a few text and voice channels, then invite everyone
                to test a real conversation or game night. That tells you more
                than a feature checklist.
              </p>
              <p>
                If your community relies on a particular bot, workflow or
                moderation setup, check those needs before moving everyone.
                ALTARA is still in open beta, and the{" "}
                <Link href="/features">current features</Link> and{" "}
                <Link href="/faq">platform answers</Link> are the best place to
                confirm what is ready.
              </p>
              <p>
                For a gaming group, test voice and screen sharing together. For
                a community, set up roles and permissions before inviting
                members. You can start in a browser and choose a desktop app
                later.
              </p>
            </div>
          </div>
        </section>

        <section className="da-final">
          <div className="hp-container">
            <div className="da-final-panel">
              <p className="ed-eyebrow">YOUR PEOPLE ARE THE POINT</p>
              <h2>Make room for your group on ALTARA.</h2>
              <p>
                Try the browser app now, or choose a desktop download for
                Windows, Linux x64 or macOS.
              </p>
              <div className="da-hero-actions">
                <a href={TRY_IN_BROWSER_URL} className="hp-btn hp-btn-primary">
                  Try in browser
                </a>
                <Link href={DOWNLOADS_URL} className="hp-btn hp-btn-secondary">
                  See downloads
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
