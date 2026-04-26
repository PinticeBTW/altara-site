import Link from "next/link";
import { DOWNLOAD_URL, SiteFooter, SiteNav } from "../components/site-chrome";

const principles = [
  {
    id: "01",
    title: "Friends first, not communities.",
    body: "Altara is sized for groups you actually know. We will not add a discover feed, algorithm, or trending servers.",
  },
  {
    id: "02",
    title: "Privacy is not a feature toggle.",
    body: "End-to-end encryption is the default and the floor. Not a paid add-on and not hidden behind settings.",
  },
  {
    id: "03",
    title: "No ads. No tracking pixels.",
    body: "We make money from optional upgrades. Your hangout is not the product and your data is not sold.",
  },
  {
    id: "04",
    title: "Ship things that feel good.",
    body: "Soft motion, fast shortcuts, clean sound design, and careful details that make everyday chat better.",
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
                Altara is not a startup with a rocket-ship deck. It is <strong>one person, mostly</strong>, with help from friends building the chat app we wanted for our own group and now sharing it.
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
                  Our group has been on the same chat app for years. It got <em>louder, busier, full of strangers</em> and slowly turned into a feed instead of a hangout.
                </p>
                <p>
                  So one weekend in 2025, between exams, we started prototyping something simpler.
                  A chat app that <strong>only does the things friends actually do</strong>: talk,
                  share music, watch stuff together, make polls, and jump in quick calls.
                </p>
                <p>
                  Six months later it had a name, a logo, and enough friends using it that we
                  opened it to other groups. That is Altara.
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
                <div className="member-portrait">T</div>
                <h3>Tomas Nunes</h3>
                <div className="role">@pintice · founder, designer, dev</div>
                <p className="bio">
                  Builds Altara on weekends and weeknights. Cares too much about cursor feel,
                  typography, and motion curves.
                </p>
                <div className="links">
                  <a href="#" aria-label="Twitter">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a href="#" aria-label="GitHub">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                  </a>
                  <a href="#" aria-label="Site">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a14.5 14.5 0 0 1 0 20 14.5 14.5 0 0 1 0-20" />
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
                <h4>Hiring soon-ish</h4>
                <p>Frontend engineer who likes weird animation. Drop us a line.</p>
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
                  Download Altara
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
