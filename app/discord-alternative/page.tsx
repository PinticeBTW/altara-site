import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { HomeNav } from "../components/home-nav";
import { Reveal } from "../components/reveal";
import { DOWNLOADS_URL, SiteFooter, TRY_IN_BROWSER_URL } from "../components/site-chrome";

const description =
  "Explore ALTARA as a Discord alternative: servers, channels, roles, voice with Spatial Audio, DMs, screen sharing, and a personal dashboard. See the full feature list.";

export const metadata: Metadata = {
  title: "Discord Alternative with Voice, Chat and Community Features",
  description,
  alternates: { canonical: "/discord-alternative" },
  openGraph: {
    type: "website",
    url: "/discord-alternative",
    title: "ALTARA: A Discord Alternative for Your Community",
    description,
    images: [{
      url: "/altara-appearance-real-2026.webp",
      width: 1100,
      height: 800,
      alt: "Real ALTARA appearance screen showing available themes",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTARA: A Discord Alternative for Your Community",
    description,
    images: ["/altara-appearance-real-2026.webp"],
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.altaraapp.com/" },
    { "@type": "ListItem", position: 2, name: "Discord alternative", item: "https://www.altaraapp.com/discord-alternative" },
  ],
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
      "Free core app with optional ALTARA+ limits and extras",
    ],
  },
];

export default function DiscordAlternativePage() {
  return (
    <div className="hp da">
      <HomeNav active="discord-alternative" />
      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
        />

        <section className="da-hero">
          <div className="hp-container da-hero-grid">
            <Reveal className="da-hero-copy">
              <p className="da-eyebrow">ALTARA / DISCORD ALTERNATIVE</p>
              <h1>A Discord alternative with the essentials your group uses.</h1>
              <p className="da-hero-lead">
                Servers, channels, voice, DMs and a dashboard built around your people.
                ALTARA brings the conversations and everyday tools your group uses into one place.
              </p>
              <div className="da-hero-actions">
                <a href={TRY_IN_BROWSER_URL} className="hp-btn hp-btn-primary">Try ALTARA in browser</a>
                <a href="#all-features" className="hp-btn hp-btn-secondary">Explore every feature</a>
              </div>
              <p className="da-hero-footnote">Free core app · Open beta · Windows, Linux x64, macOS and web</p>
            </Reveal>
            <Reveal className="da-hero-visual">
              <div className="da-image-frame da-image-frame--hero">
                <Image
                  src="/altara-dashboard-hero.png"
                  alt="ALTARA dashboard with friends, unread messages, calendar, notes, checklist and Study Mode widgets"
                  width={1917}
                  height={1020}
                  sizes="(max-width: 900px) 100vw, 55vw"
                  priority
                />
              </div>
              <span className="da-visual-caption">THE ALTARA HOME SCREEN</span>
            </Reveal>
          </div>
        </section>

        <section id="highlights" className="da-highlights">
          <div className="hp-container">
            <Reveal className="da-section-heading">
              <p className="da-eyebrow">THE FEATURES THAT MATTER</p>
              <h2>Made for conversations that last.</h2>
              <p>Four reasons to bring your friends, gaming group or small community to ALTARA.</p>
            </Reveal>

            <div className="da-highlight-grid">
              <Reveal className="da-highlight-card da-highlight-card--wide">
                <div className="da-highlight-copy">
                  <span className="da-card-index">01 / COMMUNITY</span>
                  <h3>Give your group its own place.</h3>
                  <p>Build a server with text and voice channels, categories, roles and permissions. Keep the game plan, everyday chat and the people who run it together.</p>
                  <span className="da-card-tags">SERVERS · CHANNELS · ROLES</span>
                </div>
                <div className="da-card-visual da-card-visual--channels">
                  <Image
                    src="/altara-channels-live-2026.webp"
                    alt="Real ALTARA server sidebar showing text and voice channels"
                    width={298}
                    height={462}
                    sizes="(max-width: 700px) 80vw, 300px"
                  />
                </div>
              </Reveal>

              <Reveal className="da-highlight-card">
                <span className="da-card-index">02 / VOICE</span>
                <h3>Talk while you play.</h3>
                <p>Jump into voice channels, use Spatial Audio and share your screen when the group needs to see the same thing.</p>
                <div className="da-card-visual da-card-visual--small">
                  <Image
                    src="/altara-voice-real-2026.webp"
                    alt="ALTARA voice room with two participant tiles and call controls"
                    width={1210}
                    height={535}
                    sizes="(max-width: 700px) 100vw, 40vw"
                  />
                </div>
              </Reveal>

              <Reveal className="da-highlight-card">
                <span className="da-card-index">03 / MESSAGES</span>
                <h3>Keep the smaller conversations close.</h3>
                <p>Send one-to-one or group DMs, react to messages, share GIFs and files. Your channels stay organized while side conversations have room to breathe.</p>
                <div className="da-type-visual" aria-hidden="true">
                  <span>DIRECT MESSAGES</span>
                  <strong>1:1 + GROUP</strong>
                  <span>REACTIONS / GIFS / FILES</span>
                </div>
              </Reveal>

              <Reveal className="da-highlight-card da-highlight-card--wide da-highlight-card--dashboard">
                <div className="da-highlight-copy">
                  <span className="da-card-index">04 / YOUR SPACE</span>
                  <h3>Make the space feel like yours.</h3>
                  <p>Choose a theme and tune the look of ALTARA. Your home screen brings friends, calls and unread DMs together with calendar, checklist, notepad and Study Mode widgets.</p>
                  <span className="da-card-tags">THEMES · WIDGETS · FOCUS</span>
                </div>
                <div className="da-card-visual">
                  <Image
                    src="/altara-appearance-real-2026.webp"
                    alt="Real ALTARA appearance settings with theme choices and custom color preview"
                    width={1100}
                    height={800}
                    sizes="(max-width: 700px) 100vw, 50vw"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="all-features" className="da-all-features">
          <div className="hp-container">
            <Reveal className="da-section-heading">
              <p className="da-eyebrow">AT A GLANCE</p>
              <h2>Everything ALTARA brings to the table.</h2>
              <p>Here is the current feature set, grouped by what you need to do. <Link href="/features">Explore features in more detail</Link>.</p>
            </Reveal>
            <div className="da-feature-groups">
              {featureGroups.map((group) => (
                <Reveal className="da-feature-group" key={group.title}>
                  <div className="da-group-head"><span>{group.number}</span><h3>{group.title}</h3></div>
                  <ul>
                    {group.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="da-fit">
          <div className="hp-container da-fit-grid">
            <Reveal>
              <p className="da-eyebrow">BEFORE YOU MOVE</p>
              <h2>See if ALTARA fits your group.</h2>
            </Reveal>
            <Reveal className="da-fit-copy">
              <p>ALTARA is in open beta. The core app is free to use; ALTARA+ adds higher limits and optional extras. Start in your browser, or choose a desktop download for a supported computer.</p>
              <p>Want the details first? Check the <Link href="/faq">FAQ and platform answers</Link>, or read the <Link href="/privacy">privacy policy</Link> before bringing your group over.</p>
            </Reveal>
          </div>
        </section>

        <section className="da-final">
          <div className="hp-container">
            <Reveal className="da-final-panel">
              <p className="da-eyebrow">YOUR PEOPLE ARE THE POINT</p>
              <h2>Make room for your group on ALTARA.</h2>
              <p>Try the browser app now, or choose a desktop download for Windows, Linux x64 or macOS.</p>
              <div className="da-hero-actions">
                <a href={TRY_IN_BROWSER_URL} className="hp-btn hp-btn-primary">Try in browser</a>
                <Link href={DOWNLOADS_URL} className="hp-btn hp-btn-secondary">See downloads</Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
