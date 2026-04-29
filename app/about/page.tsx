import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { DOWNLOAD_URL, SiteFooter, SiteNav } from "../components/site-chrome";

const description =
  "Learn why ALTARA started in February 2026 as a smaller, cleaner Discord alternative for friend groups, gaming groups, small communities, and everyday voice chat.";

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
        url: "/altara-app-preview-20260428.png",
        width: 1478,
        height: 885,
        alt: "ALTARA app preview showing widgets, friends, calendar, calls, notes, and DMs",
      },
    ],
  },
  twitter: {
    title: "About ALTARA",
    description,
    images: ["/altara-app-preview-20260428.png"],
  },
};

const principles = [
  {
    id: "01",
    title: "Friends first, communities included.",
    body: "ALTARA is built for friend groups and the communities that grow around them. No infinite feed, no algorithmic noise, just spaces that feel human.",
  },
  {
    id: "02",
    title: "Private spaces should feel private.",
    body: "We are building DMs and calls around privacy-first defaults, without pretending public servers and groups need the same rules.",
  },
  {
    id: "03",
    title: "ALTARA+ funds the work.",
    body: "ALTARA+ is how we plan to fund development while keeping the core app focused and useful.",
  },
  {
    id: "04",
    title: "Ship things that feel good.",
    body: "Soft motion, fast shortcuts, and careful details that make everyday chat better.",
  },
];

export default function AboutPage() {
  return (
    <div>
      <SiteNav active="about" />

      <main>
        <section className="about-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <div className="about-hero-grid">
              <div>
                <span className="eyebrow">
                  <span className="dot" /> About us
                </span>
                <h1 style={{ marginTop: "24px" }}>
                  A small group
                  <br />
                  making a <span className="gradient-text">smaller app.</span>
                </h1>
              </div>
              <p className="lead">
                ALTARA is not a startup with a rocket-ship deck. It is{" "}
                <strong>one person, mostly</strong>, with help from friends building the chat app
                we wanted for our own group, gaming nights, and the communities around them.
              </p>
            </div>
          </div>
        </section>

        <section className="story">
          <div className="container">
            <div className="story-grid">
              <h3>Why we built it</h3>
              <div className="story-body">
                <p>
                  Most of us had been living inside Discord for years. It worked, but it kept
                  getting <em>louder, busier, full of strangers</em> and slowly turned into a feed
                  instead of a hangout.
                </p>
                <p>
                  ALTARA started in February 2026 because there did not seem to be a real
                  alternative for the kind of space we wanted. Not a Discord clone, not another
                  giant social app, just something a little more personal for friends, gaming
                  groups, and small communities.
                </p>
                <p>
                  From that first prototype, it became a name, a logo, and an app friends could
                  actually use: voice, private messages, community spaces, widgets, and fewer
                  things fighting for attention. That is ALTARA.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="team-section">
          <div className="container">
            <div className="section-head">
              <h2>
                The team is small.
                <br />
                (Like, <span className="gradient-text">really</span> small.)
              </h2>
              <p className="lead">
                One human, plus a rotating cast of friends who help with art, beta tests, copy,
                and coffee.
              </p>
            </div>

            <div className="team-grid">
              <article className="member-card solo">
                <div className="member-portrait member-portrait-photo">
                  <Image
                    src="/tomas-nunes-card.jpg"
                    alt="Tomás Nunes, founder of ALTARA"
                    width={112}
                    height={112}
                    sizes="112px"
                    priority={false}
                    style={{
                      objectFit: "cover",
                    }}
                  />
                </div>
                <h3>Tomás Nunes</h3>
                <div className="role">@pintice · founder, designer, dev</div>
                <p className="bio">
                  I play games, run RPGs, and spend way too much time in calls. I wanted a chat app
                  that felt better for friends and gaming nights, so yeah... I built ALTARA.
                </p>
                <div className="links">
                  <a
                    href="https://www.instagram.com/pintice__/"
                    aria-label="Instagram"
                    title="Instagram"
                    target="_blank"
                    rel="me noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    <svg viewBox="0 0 24 24" fill="currentColor">
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
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12z" />
                    </svg>
                  </a>
                </div>
              </article>

              <article className="placeholder-card">
                <div className="ph-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 11l-3 3-2-2" />
                  </svg>
                </div>
                <h4>Built with friends</h4>
                <p>Art, feedback, testing, and a lot of calls from the people around the app.</p>
              </article>

              <article className="placeholder-card">
                <div className="ph-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                  </svg>
                </div>
                <h4>Friends and testers</h4>
                <p>The humans currently breaking things in beta. Love you all.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="principles">
          <div className="container">
            <div className="section-head">
              <h2>
                A few things we
                <br />
                <span className="gradient-text">will not compromise on.</span>
              </h2>
              <p className="lead">Promises to ourselves, in writing, before we forget.</p>
            </div>

            {principles.map((principle) => (
              <article key={principle.id} className="principle">
                <div className="pn">/ {principle.id}</div>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}

            <div className="join">
              <div className="blob blob-1" />
              <h2>Want in?</h2>
              <p>We are in open beta. Grab the app, bring three friends, and see how it feels.</p>
              <div className="join-actions">
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  Download ALTARA
                </a>
                <Link href="/features" className="btn btn-secondary">
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
