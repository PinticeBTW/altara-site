import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { HomeNav } from "./components/home-nav";
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
  "A Discord alternative with server voice, Spatial Audio, messages and a dashboard you can make your own. Independently built for friends and small communities.";
const image = "/altara-dashboard-demo-20261020.webp";
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
  title: { absolute: "ALTARA | Voice Chat and Community Spaces for Friends" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "ALTARA | A space that feels like you",
    description,
    images: [
      {
        url: image,
        width: 1658,
        height: 949,
        alt: "Anonymised dashboard demonstration based on an ALTARA app capture",
      },
    ],
  },
  twitter: {
    title: "ALTARA | A space that feels like you",
    description,
    images: [image],
  },
};

const reasons = [
  {
    number: "01",
    title: "A home screen of your own.",
    body: "Keep a calendar, notes, a checklist and a Study Mode timer beside your conversations. Choose the widgets you want to come back to.",
    href: "/features#dashboard",
    link: "Explore the dashboard",
  },
  {
    number: "02",
    title: "Give every voice a place.",
    body: "Switch on Spatial Audio in a server voice channel to hear voices with a sense of direction. Basic Spatial Audio is included in Free. Core and Nova add saved-layout capacity.",
    href: "/features#voice",
    link: "Meet Spatial Audio",
  },
  {
    number: "03",
    title: "Keep the group together.",
    body: "Text channels for the ongoing conversation. Voice channels for dropping in. Roles and permissions for the people looking after the server.",
    href: "/features#servers",
    link: "See community features",
  },
];

export default function Home() {
  return (
    <div className="hp editorial">
      <HomeNav skipToContent />
      <main id="main-content" tabIndex={-1}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(homeJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <section className="ed-hero">
          <div className="hp-container ed-hero-grid">
            <div className="ed-hero-copy">
              <p className="ed-eyebrow">
                <span className="ed-status-dot" /> Independent. Open beta. Yours
                to shape.
              </p>
              <h1>
                Your people. <br />
                Your kind <br />
                of <em>place.</em>
              </h1>
              <p className="ed-hero-lead">
                The call that runs late. The next game. The group that makes it
                worth logging on.
              </p>
              <p className="ed-hero-description">
                Bring them to ALTARA: voice, messages and community spaces, with
                a dashboard and a look you can make your own.
              </p>
              <div className="ed-actions">
                <a href={DOWNLOAD_URL} className="hp-btn hp-btn-primary">
                  Download ALTARA <span aria-hidden="true">↗</span>
                </a>
                <a href={TRY_IN_BROWSER_URL} className="ed-text-link">
                  Open in browser <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="ed-small">
                Free core app · Windows, Linux x64, macOS &amp; web
              </p>
            </div>
            <figure className="ed-product">
              <div className="ed-product-top">
                <span>ALTARA / Your dashboard</span>
                <span>01 — Home</span>
              </div>
              <a
                href={image}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View full-size anonymised ALTARA dashboard demonstration"
                className="ed-product-image"
              >
                <Image
                  src={image}
                  alt="Anonymised dashboard demo based on an ALTARA app capture, showing calendar, notes, checklist and Study Mode"
                  width={1658}
                  height={949}
                  sizes="(max-width: 900px) 100vw, 58vw"
                  loading="eager"
                  fetchPriority="high"
                />
              </a>
              <figcaption>
                <span>Dashboard demo · personal details hidden.</span>
                <span aria-hidden="true">↗</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <div className="hp-container">
          <div className="ed-proof-rail">
            <p>A personal take on the community app.</p>
            <Link href="/discord-alternative">
              Considering a move from Discord? <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <section className="ed-section" aria-labelledby="space-heading">
          <div className="hp-container">
            <div className="ed-section-intro">
              <p className="ed-eyebrow">
                Room for your own way of doing things
              </p>
              <h2 id="space-heading">
                Same friends.
                <br />
                <span>A different starting point.</span>
              </h2>
              <p>
                Familiar ways to talk, with more of your personality in the
                space around them.
              </p>
            </div>
            <div className="ed-reasons">
              {reasons.map((reason) => (
                <article className="ed-reason" key={reason.number}>
                  <span className="ed-index">{reason.number}</span>
                  <h3>{reason.title}</h3>
                  <div>
                    <p>{reason.body}</p>
                    <Link href={reason.href} className="ed-text-link">
                      {reason.link} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            <div className="ed-personal-note">
              <span aria-hidden="true">✳</span>
              <p>
                <strong>Make the app feel familiar to you.</strong> Pick a
                built-in theme or set your own colours. Add community themes and
                widgets from the <a href="/marketplace">Marketplace</a>.
              </p>
              <Link href="/features#appearance" className="ed-text-link">
                See personalisation <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="ed-maker-section" aria-labelledby="maker-heading">
          <div className="hp-container ed-maker">
            <div>
              <p className="ed-eyebrow">A person behind the product</p>
              <h2 id="maker-heading">
                Built by someone
                <br />
                who stays for one more game.
              </h2>
              <p>
                Tomás Nunes is building ALTARA with the help of AI tools and
                friends contributing art, testing and feedback. The project is
                in open beta and looking for people to help form a team.
              </p>
              <Link href="/about" className="ed-text-link">
                Meet the person building ALTARA{" "}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="ed-maker-card">
              <Image
                src="/tomas-nunes-2026.png"
                alt="Tomás Nunes, founder of ALTARA"
                width={502}
                height={665}
                sizes="(max-width: 600px) 130px, 180px"
              />
              <p>
                <strong>Tomás Nunes</strong>
                <span>@pintice · founder</span>
              </p>
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ed-text-link"
              >
                Follow the releases <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>

        <section
          id="altara-plus"
          className="ed-section ed-pricing"
          aria-labelledby="plus-heading"
        >
          <div className="hp-container">
            <div className="ed-section-intro">
              <p className="ed-eyebrow">Free wherever we can.</p>
              <h2 id="plus-heading">The essentials are included.</h2>
              <p>
                Servers, messages, calls, Focus profiles and basic Spatial Audio
                are part of the free app. Our aim is to keep features free
                whenever we can offer them without adding running costs for
                ALTARA.
              </p>
            </div>
            <div className="ed-plus-reason">
              <h3>Why ALTARA+ exists</h3>
              <p>
                Screen sharing, storing and transferring files, and higher usage
                need infrastructure we pay to run. ALTARA+ helps cover those
                bills, keep free access available, and fund maintenance and
                continued development.
              </p>
            </div>
            <div className="ed-plans">
              <article className="ed-plan ed-plan-free">
                <p className="ed-eyebrow">Start here</p>
                <h3>Free</h3>
                <p className="ed-price">€0</p>
                <p>Get your group together.</p>
                <ul>
                  <li>Up to 100 servers and 25MB uploads</li>
                  <li>3 saved Focus profiles</li>
                  <li>Basic Spatial Audio in server calls</li>
                  <li>Built-in themes and Best Friends pins</li>
                  <li>Screen sharing at 720p60 or 1080p30*</li>
                </ul>
                <a href={TRY_IN_BROWSER_URL} className="ed-text-link">
                  Open ALTARA <span aria-hidden="true">↗</span>
                </a>
              </article>
              <article className="ed-plan">
                <p className="ed-eyebrow">ALTARA+</p>
                <h3>Core</h3>
                <p className="ed-price">
                  €4.99<span>/month</span>
                </p>
                <p>or €44.99 billed yearly</p>
                <ul>
                  <li>Up to 150 servers and 50MB uploads</li>
                  <li>10 saved Focus profiles</li>
                  <li>5 saved Spatial Audio layouts</li>
                  <li>Extra screen sharing modes, up to 4K60*</li>
                  <li>Core supporter profile badge</li>
                </ul>
              </article>
              <article className="ed-plan">
                <p className="ed-eyebrow">ALTARA+</p>
                <h3>Nova</h3>
                <p className="ed-price">
                  €7.99<span>/month</span>
                </p>
                <p>or €74.99 billed yearly</p>
                <ul>
                  <li>Up to 200 servers and 1GB uploads</li>
                  <li>25 saved Focus profiles</li>
                  <li>15 saved Spatial Audio layouts</li>
                  <li>Extra screen sharing modes, up to 4K60*</li>
                  <li>Nova supporter profile badge</li>
                </ul>
              </article>
            </div>
            <p className="ed-small ed-plan-note">
              *Screen sharing modes are selectable options. Actual resolution
              and frame rate depend on your device, browser, capture source and
              connection. Core and Nova include the same extra sharing modes.
            </p>
            <p className="ed-small ed-plan-note">
              Upload limits are per chat attachment; Vault attachments, avatars,
              banners and some other upload types have lower caps.
              Manage Core or Nova inside the app and review the current offer
              before subscribing. <Link href="/faq">Read the FAQ</Link> for
              plan details and Marketplace purchases.
            </p>
          </div>
        </section>

        <section className="ed-final" aria-labelledby="download-heading">
          <div className="hp-container">
            <div className="ed-final-heading">
              <div>
                <p className="ed-eyebrow">The next hangout starts here</p>
                <h2 id="download-heading">Make yourself at home.</h2>
              </div>
              <Link href="/downloads" className="ed-text-link">
                All download options <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="ed-final-copy">
              Available for Windows, Linux x64, and macOS. Prefer a tab? Open
              the browser app and sign in or create an account.
            </p>
            <div className="hp-cta-platforms">
              <WindowsDownloadOption />
              <MacDownloadOption />
              <LinuxDownloadOption />
              <BrowserDownloadOption />
            </div>
            <LinuxPreviewNote />
            <p className="ed-small">
              Open beta: expect changes as development continues.{" "}
              <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
                Read the release notes
              </a>{" "}
              or <a href="mailto:support@altaraapp.com">get in touch</a>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
