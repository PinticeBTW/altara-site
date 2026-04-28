import {
  DOWNLOAD_URL,
  SiteFooter,
  SiteNav,
  TRY_IN_BROWSER_URL,
} from "../components/site-chrome";

const specItems = [
  { title: "No ads, ever", description: "We make money from Pro. Not from you." },
  { title: "28MB install", description: "Native everywhere. Boots in under a second." },
  { title: "Cross-platform sync", description: "Mac, Windows, Linux, web, mobile. Same gang." },
  { title: "Voice rooms", description: "HD audio, screen share, low latency." },
  { title: "Self-destructing messages", description: "From 5 seconds to 30 days. Or never." },
  { title: "Vault folders", description: "Hide channels behind a passcode." },
  { title: "Drag-drop sharing", description: "Files up to 2GB. Right from your desktop." },
  { title: "Keyboard-first", description: "Cmd/Ctrl + K to do anything." },
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
              No bloat. No corporate enterprise tier. Just the things you actually use, made well.
            </p>
          </div>
        </section>

        <div className="container">
          <section className="feature">
            <div className="feature-text">
              <div className="num">01 - Widgets</div>
              <h2>
                Channels you can <span className="gradient-text">actually shape.</span>
              </h2>
              <p>
                Drop a poll into a channel. Pin a music player to your voice room. Make a
                watch-along widget so everyone hits play together.
              </p>
              <ul className="feature-list">
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>40+ built-in widgets</strong> - polls, music, notes, watch-along,
                    counters, leaderboards.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Marketplace</strong> with community-built widgets, free to install.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Build your own</strong> in plain HTML/JS.
                  </span>
                </li>
              </ul>
            </div>

            <div className="feature-visual">
              <div className="widgets-grid">
                <div className="w-card">
                  <div className="w-head">Poll</div>
                  <h4>Pizza tonight?</h4>
                  <div className="w-poll-row">
                    <span className="label">Yes</span>
                    <div className="bar">
                      <div style={{ width: "74%" }} />
                    </div>
                    <span className="pct">74%</span>
                  </div>
                  <div className="w-poll-row">
                    <span className="label">Sushi</span>
                    <div className="bar">
                      <div style={{ width: "26%" }} />
                    </div>
                    <span className="pct">26%</span>
                  </div>
                </div>

                <div className="w-card">
                  <div className="w-head">Counter</div>
                  <div className="w-counter">
                    142 <span>days streak</span>
                  </div>
                </div>

                <div className="w-card span">
                  <div className="w-head">Now playing</div>
                  <div className="w-music">
                    <div className="album" />
                    <div className="info">
                      <div className="t">brat - bumpin that</div>
                      <div className="a">Charli XCX - 4 listening</div>
                    </div>
                    <div className="play">▶</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="feature flip">
            <div className="feature-text">
              <div className="num">02 - Privacy</div>
              <h2>
                DMs that are <span className="gradient-text">actually private.</span>
              </h2>
              <p>
                Every direct message and private call is end-to-end encrypted by default. Not as a
                setting you have to find, as the only way it works.
              </p>
              <ul className="feature-list">
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Signal-grade protocols</strong> for messages and voice.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Self-destructing messages</strong> from 5 seconds to 30 days.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Zero-knowledge backups</strong> so only your devices can decrypt.
                  </span>
                </li>
              </ul>
            </div>

            <div className="feature-visual">
              <div className="encrypted">
                <div className="enc-msg">
                  <div className="avatar av-1">M</div>
                  <div className="enc-bubble">
                    only us can read this, right?
                    <span className="lock">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="14" height="9" x="5" y="11" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="enc-msg right">
                  <div className="avatar av-2">T</div>
                  <div className="enc-bubble">
                    yep. server cannot read it.
                    <span className="lock">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="14" height="9" x="5" y="11" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="enc-msg">
                  <div className="avatar av-1">M</div>
                  <div className="enc-bubble">
                    okay now tell me everything.
                    <span className="lock">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="14" height="9" x="5" y="11" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="enc-banner">
                  <div className="shield">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    End-to-end encrypted - key fingerprint
                    <div className="key">9f3a - b27e - c4d1 - 8a55</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="feature">
            <div className="feature-text">
              <div className="num">03 - Personalization</div>
              <h2>
                Make it look like <span className="gradient-text">your gang.</span>
              </h2>
              <p>
                Every group has a vibe. Pick a theme, build one, swap fonts, change emoji, layer
                custom sounds. Express something.
              </p>
              <ul className="feature-list">
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Theme builder</strong> - colors, fonts, radius, density.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Per-server skins</strong> so each community feels unique.
                  </span>
                </li>
                <li>
                  <span className="check">✓</span>
                  <span>
                    <strong>Custom emoji and sound packs</strong> with no forced Pro wall.
                  </span>
                </li>
              </ul>
            </div>

            <div className="feature-visual">
              <div className="themes">
                <div className="theme-card t1">
                  <div className="badge-active">✓</div>
                  <div className="tname">Midnight</div>
                  <div className="swatches">
                    <div className="sw" style={{ background: "#a78bfa" }} />
                    <div className="sw" style={{ background: "#f472b6" }} />
                    <div className="sw" style={{ background: "#fb923c" }} />
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
                  <div className="tname">Cosmic</div>
                  <div className="swatches">
                    <div className="sw" style={{ background: "#818cf8" }} />
                    <div className="sw" style={{ background: "#c084fc" }} />
                    <div className="sw" style={{ background: "#f0abfc" }} />
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
                <span className="dot" /> Free - 28MB - No account needed to try
              </span>
              <h2>
                Get the gang together.
                <br />
                Download Altara.
              </h2>
              <p>
                Available on every platform you use. Sync across all of them and pick up where you
                left off.
              </p>
              <div className="cta-platforms">
                <button
                  type="button"
                  className="platform-btn platform-btn-disabled"
                  disabled
                  aria-disabled="true"
                >
                  <span className="platform-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Download for</small>
                    <span className="platform-name">macOS</span>
                    <span className="platform-soon">Em breve</span>
                  </div>
                </button>
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="platform-btn"
                >
                  <span className="platform-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 5.557 9.836 4.62v6.687H3zm0 12.886V12.69h6.836v6.687zM10.673 4.5 21 3v8.307H10.673zm0 15v-7.81H21v9.31z" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Download for</small>
                    <span className="platform-name">Windows</span>
                  </div>
                </a>
                <button
                  type="button"
                  className="platform-btn platform-btn-disabled"
                  disabled
                  aria-disabled="true"
                >
                  <span className="platform-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m7 10 3 2-3 2" />
                      <path d="M12 14h5" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Download for</small>
                    <span className="platform-name">Linux</span>
                    <span className="platform-soon">Em breve</span>
                  </div>
                </button>
                <a href={TRY_IN_BROWSER_URL} className="platform-btn">
                  <span className="platform-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                      <path d="M2 12h20" />
                    </svg>
                  </span>
                  <div className="platform-copy">
                    <small>Or just</small>
                    <span className="platform-name">Try in browser</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
