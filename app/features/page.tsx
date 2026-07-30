import Image from "next/image";
import type { Metadata } from "next";

import {
  BrowserDownloadOption,
  LinuxDownloadOption,
  LinuxPreviewNote,
  MacDownloadOption,
  RELEASES_URL,
  SiteFooter,
  SiteNav,
  WindowsDownloadOption,
} from "../components/site-chrome";

const description =
  "Explore ALTARA features: widgets, private DMs, voice calls, browser access, friend groups, small communities, and Windows or Linux x64 downloads.";

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
        url: "/altara-home-page-clean.png",
        width: 1592,
        height: 988,
        alt: "ALTARA home page showing widgets, friends, calendar, notes, calls, unread DMs, and active friends",
      },
    ],
  },
  twitter: {
    title: "ALTARA Features",
    description,
    images: ["/altara-home-page-clean.png"],
  },
};

const specItems = [
  { title: "ALTARA+ supported", description: "ALTARA+ helps fund development while the core app stays focused." },
  { title: "76MB Windows download", description: "Latest Windows installer is about 76MB." },
  { title: "Browser access", description: "Jump into ALTARA from the web when you need it." },
  { title: "Linux x64 preview", description: "A portable tar.gz preview is available alongside Windows." },
  { title: "Voice rooms", description: "Voice calls, rooms, and screen sharing for hanging out." },
  { title: "Widget dashboard", description: "Calendar, checklist, notepad, calls, status, and unread DMs." },
  { title: "Small communities", description: "Spaces for gaming groups, friend groups, and communities that should stay human." },
  { title: "Drag-drop sharing", description: "Share files up to 35MB right from your desktop." },
];

export default function FeaturesPage() {
  return (
    <div>
      <SiteNav active="features" />

      <main>
        <section className="page-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <span className="eyebrow">
              <span className="dot" /> Features
            </span>
            <h1>
              Everything a hangout
              <br />
              <span className="gradient-text">should have.</span>
            </h1>
            <p>
              No bloat. Just the things friends, gaming groups, and small communities actually
              use, made well.
            </p>
          </div>
        </section>

        <div className="container">
          <section className="feature">
            <div className="feature-text">
              <div className="num">01 - Widgets</div>
              <h2>
                Your dashboard, <span className="gradient-text">your widgets.</span>
              </h2>
              <p>
                Keep notes, checklists, calendar reminders, calls, and message status on your own
                ALTARA home screen.
              </p>
              <ul className="feature-list">
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Personal widgets dashboard</strong> for quick tools you use every day.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Built-in widgets today</strong> - calendar, checklist, notepad, calls,
                    online status, and unread DMs.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Clean home screen</strong> before you jump into friends, communities,
                    or calls.
                  </span>
                </li>
              </ul>
            </div>

            <div className="feature-visual">
              <div className="widgets-grid">
                <div className="w-card">
                  <div className="w-head">Calendar</div>
                  <div className="w-calendar-simple">
                    <span>TUE</span>
                    <strong>
                      28 <em>Apr</em>
                    </strong>
                    <p>2 overdue</p>
                  </div>
                </div>

                <div className="w-card">
                  <div className="w-head">Checklist</div>
                  <div className="w-counter">
                    4/7 <span>tasks done</span>
                  </div>
                </div>

                <div className="w-card span">
                  <div className="w-head">Notepad</div>
                  <div className="w-music">
                    <div className="album note" />
                    <div className="info">
                      <div className="t">Quick notes</div>
                      <div className="a">Write reminders, ideas, or plans.</div>
                    </div>
                    <div className="play">+</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="feature flip">
            <div className="feature-text">
              <div className="num">02 - Personalization</div>
              <h2>
                Make ALTARA feel like <span className="gradient-text">your space.</span>
              </h2>
              <p>
                Set up your profile, keep your people close, and jump back into the widgets,
                chats, and calls you use most.
              </p>
              <ul className="feature-list">
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Profile card</strong> with your avatar, display name, and username.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Friends and group DMs</strong> kept close in the sidebar.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Personal workspace</strong> focused on widgets, calls, and chats.
                  </span>
                </li>
              </ul>
            </div>

            <div className="feature-visual">
              <div className="themes">
                <div className="theme-card t1">
                  <div className="badge-active">✓</div>
                  <div className="tname">ALTARA Dark</div>
                  <div className="swatches">
                    <div className="sw" style={{ background: "#0a0a0a" }} />
                    <div className="sw" style={{ background: "#1c1b1a" }} />
                    <div className="sw" style={{ background: "#e8cdb0" }} />
                  </div>
                  <div className="preview">
                    <div className="pl m" />
                    <div className="pl s" />
                    <div className="pl" />
                  </div>
                </div>

                <div className="theme-card t2">
                  <div className="tname">Honey</div>
                  <div className="swatches">
                    <div className="sw" style={{ background: "#f59e0b" }} />
                    <div className="sw" style={{ background: "#dc2626" }} />
                    <div className="sw" style={{ background: "#0f766e" }} />
                  </div>
                  <div className="preview">
                    <div className="pl m" />
                    <div className="pl s" />
                    <div className="pl" />
                  </div>
                </div>

                <div className="theme-card t3">
                  <div className="tname">Forest</div>
                  <div className="swatches">
                    <div className="sw" style={{ background: "#34d399" }} />
                    <div className="sw" style={{ background: "#a3e635" }} />
                    <div className="sw" style={{ background: "#22d3ee" }} />
                  </div>
                  <div className="preview">
                    <div className="pl m" />
                    <div className="pl s" />
                    <div className="pl" />
                  </div>
                </div>

                <div className="theme-card t4">
                  <div className="tname">Graphite</div>
                  <div className="swatches">
                    <div className="sw" style={{ background: "#111111" }} />
                    <div className="sw" style={{ background: "#38322b" }} />
                    <div className="sw" style={{ background: "#c9aa8c" }} />
                  </div>
                  <div className="preview">
                    <div className="pl m" />
                    <div className="pl s" />
                    <div className="pl" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="feature">
            <div className="feature-text">
              <div className="num">03 - Real product</div>
              <h2>
                Built around the dashboard you <span className="gradient-text">actually use.</span>
              </h2>
              <p>
                ALTARA keeps the important stuff visible: your people, your widgets, your calls,
                and the small spaces your group keeps coming back to.
              </p>
              <ul className="feature-list">
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Friends and communities</strong> stay close without an endless feed.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Widgets are part of the app</strong>, not a random extra screen.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Voice and DMs</strong> are quick to reach when the group is active.
                  </span>
                </li>
              </ul>
            </div>

            <div className="feature-visual feature-visual-live">
              <div className="feature-screenshot-card">
                <Image
                  src="/altara-home-page-clean.png"
                  alt="ALTARA dashboard showing friends, widgets, calendar, notes, calls, and active friends"
                  width={1592}
                  height={988}
                  sizes="(max-width: 980px) 100vw, 560px"
                  unoptimized
                />
              </div>
            </div>
          </section>
        </div>

        <section className="spec-section">
          <div className="container">
            <div className="section-head">
              <h2>
                And a bunch of <span className="gradient-text">smaller things</span> we cared
                about.
              </h2>
              <p className="lead">The kind of details you only notice when they are missing.</p>
            </div>

            <div className="spec-grid">
              {specItems.map((item) => (
                <article key={item.title} className="spec">
                  <div className="icon">•</div>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="download" style={{ marginTop: 0 }}>
          <div className="container">
            <div className="cta-band">
              <div className="blob blob-1" />
              <div className="blob blob-2" />
              <span className="eyebrow" style={{ marginBottom: "18px" }}>
                <span className="dot" /> Windows and Linux x64 available
              </span>
              <h2>
                Get the gang together.
                <br />
                Download ALTARA for desktop.
              </h2>
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
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="release-inline-link"
              >
                View release notes
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

