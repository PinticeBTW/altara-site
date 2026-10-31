import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { HomeNav } from "../components/home-nav";
import {
  DOWNLOAD_URL,
  RELEASES_URL,
  SiteFooter,
} from "../components/site-chrome";

const description =
  "Meet Tomás Nunes, the founder building ALTARA with AI assistance, art, testing and feedback from friends. An independent project looking to grow its team.";

export const metadata: Metadata = {
  title: "Our Story and Mission",
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
        url: "/altara-appearance-real-2026.webp",
        width: 1100,
        height: 800,
        alt: "ALTARA appearance settings with built-in themes and custom colors",
      },
    ],
  },
  twitter: {
    title: "About ALTARA",
    description,
    images: ["/altara-appearance-real-2026.webp"],
  },
};

const principles = [
  {
    num: "01",
    title: "Start with your people",
    body: "Servers for the group, DMs for the side conversation, and voice channels for time together. The people you bring give the space its purpose.",
  },
  {
    num: "02",
    title: "Make the space your own",
    body: "Choose a theme, arrange your dashboard widgets, and set up Focus for the moments when you need fewer interruptions.",
  },
  {
    num: "03",
    title: "Keep the everyday tools free",
    body: "Chat, calls, Focus profiles and basic Spatial Audio are available in the free app. Our aim is to keep features free whenever we can offer them without extra running costs. ALTARA+ helps cover infrastructure for screen sharing, file transfers and higher usage, alongside maintenance and development.",
  },
];

const timeline = [
  {
    label: "Feb 2026",
    body: "First ALTARA prototype.",
  },
  {
    label: "The product",
    body: "Servers, DMs, calls, the dashboard, Focus and community tools take shape.",
  },
  {
    label: "Now",
    body: "Open beta, with Windows, Linux, macOS and browser access. Public release notes track the changes.",
  },
];

export default function AboutPage() {
  return (
    <div className="hp editorial">
      <HomeNav active="about" skipToContent />

      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero hp-hero hp-hero--compact">
          <div className="hp-container">
            <div className="hp-hero-copy">
              <p className="ed-eyebrow">The people behind ALTARA</p>
              <h1 className="hp-h1 hp-h1--compact">
                Built by Tomás.
                <br />
                Shaped by friends.
              </h1>
              <p className="hp-hero-sub">
                ALTARA is an independent project by Tomás Nunes, currently built
                with the help of AI tools and with art, testing and feedback
                from friends. Now looking for people to help build the next
                chapter.
              </p>
              <p className="hp-hero-meta">
                Independent &middot; Open beta &middot; Since February 2026
              </p>
            </div>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <div className="hp-about-why">
              <h2 className="hp-pullquote">
                It started with the app we wanted to use.
              </h2>
              <div className="hp-about-prose">
                <p>
                  After years of using Discord, we wanted a space that felt more
                  personal. Tomás started building ALTARA in February 2026:
                  servers, DMs and calls, alongside a dashboard you can arrange
                  around your own day.
                </p>
                <p>
                  ALTARA is still in open beta. Features and releases are
                  evolving. The{" "}
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    public release notes
                  </a>{" "}
                  show what has changed, so you can decide whether it fits your
                  group.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <div className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">What shapes the product.</h2>
            </div>

            <div className="hp-principle-list">
              {principles.map((principle) => (
                <div key={principle.num} className="hp-principle">
                  <div className="hp-principle-num">{principle.num}</div>
                  <div className="hp-principle-body">
                    <h3>{principle.title}</h3>
                    <p>{principle.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <div className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">Meet the developer.</h2>
            </div>

            <div className="hp-glass hp-founder-panel">
              <div className="hp-founder-photo">
                <Image
                  src="/tomas-nunes-2026.png"
                  alt="Tomás Nunes, founder of ALTARA"
                  width={502}
                  height={665}
                  sizes="220px"
                />
              </div>
              <div className="hp-founder-body">
                <h3 className="hp-founder-name">Tomás Nunes</h3>
                <p className="hp-founder-role">@pintice &middot; founder</p>
                <p className="hp-founder-bio">
                  Games, RPGs and long calls are part of his everyday life.
                  ALTARA grew out of wanting an app for that time together, with
                  room for personal themes, useful widgets and the group&apos;s
                  own way of doing things.
                </p>
                <ul className="hp-founder-facts">
                  <li>Started building ALTARA in February 2026.</li>
                  <li>Friends help with art, testing, and feedback.</li>
                  <li>Developed with the help of AI tools.</li>
                  <li>Looking for collaborators to form a team.</li>
                  <li>
                    ALTARA+ helps fund infrastructure, maintenance and
                    development.
                  </li>
                </ul>
                <div className="hp-founder-links">
                  <a
                    href="https://www.instagram.com/pintice__/"
                    aria-label="Instagram"
                    title="Instagram"
                    target="_blank"
                    rel="me noopener noreferrer"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle
                        cx="17.5"
                        cy="6.5"
                        r="1.2"
                        fill="currentColor"
                        stroke="none"
                      />
                    </svg>
                  </a>
                  <a
                    href="https://www.youtube.com/@NID-boys"
                    aria-label="NID Boys on YouTube"
                    title="NID Boys on YouTube"
                    target="_blank"
                    rel="me noopener noreferrer"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
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
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <div className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">
                Built with AI assistance. Looking for a team.
              </h2>
              <div className="ed-team-copy">
                <p>
                  AI tools are part of how Tomás develops ALTARA today. Friends
                  contribute art, testing and feedback as the project takes
                  shape.
                </p>
                <p>
                  He is looking for people who want to help build ALTARA. If you
                  would like to contribute, get in touch and share what you work
                  on.
                </p>
                <a
                  className="ed-text-link"
                  href="mailto:support@altaraapp.com?subject=Building%20ALTARA%20together"
                >
                  Talk about joining the team <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="hp-about-block">
          <div className="hp-container">
            <div className="hp-section-head-left">
              <h2 className="hp-h2 hp-h2--section">The story so far.</h2>
            </div>

            <div className="hp-timeline">
              {timeline.map((item) => (
                <div key={item.label} className="hp-timeline-item">
                  <div className="hp-timeline-label">{item.label}</div>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hp-cta">
          <div className="hp-container">
            <div className="hp-cta-panel">
              <h2 className="hp-h2 hp-h2--section">Try it with your group.</h2>
              <p className="hp-lead">
                Take a look at the app, read the release notes, and tell us what
                gets in the way. You can reach us at{" "}
                <a href="mailto:support@altaraapp.com">support@altaraapp.com</a>
                .
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
                <Link href="/features" className="hp-btn hp-btn-secondary">
                  See features
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
