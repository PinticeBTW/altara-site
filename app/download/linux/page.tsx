import type { Metadata } from "next";

import {
  ALTARA_GITHUB_RELEASES_URL,
  ALTARA_SITE_LINUX_DOWNLOAD_MARKER,
} from "../../lib/altara-linux-release";
import {
  LINUX_CHECKSUM_URL,
  LINUX_DOWNLOAD_URL,
  LINUX_README_URL,
  SiteFooter,
  SiteNav,
} from "../../components/site-chrome";

export const metadata: Metadata = {
  title: "Linux x64 Preview",
  description:
    "Download and run the portable ALTARA Linux x64 preview, with setup steps, Ubuntu dependencies, README, and SHA-256 checksum links.",
  alternates: {
    canonical: "/download/linux",
  },
};

type LinuxHelpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusMessages: Record<string, string> = {
  unavailable:
    "The latest Linux download could not be resolved right now. Try again shortly or use the GitHub releases fallback.",
  "readme-unavailable":
    "The matching Linux README could not be resolved right now. The setup steps below remain available.",
  "checksum-unavailable":
    "The matching SHA-256 file could not be resolved right now. Try again shortly or inspect the GitHub release.",
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LinuxHelpPage({ searchParams }: LinuxHelpPageProps) {
  const status = firstValue((await searchParams).status);
  const statusMessage = status ? statusMessages[status] : undefined;

  return (
    <div data-build-marker={ALTARA_SITE_LINUX_DOWNLOAD_MARKER}>
      <SiteNav />

      <main>
        <section className="page-hero linux-download-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <span className="eyebrow">
              <span className="dot" /> First Linux preview
            </span>
            <h1>
              Run ALTARA on
              <br />
              <span className="gradient-text">Linux x64.</span>
            </h1>
            <p>
              Portable preview for 64-bit Linux. Manual updates are currently required.
            </p>
            <div className="linux-help-actions">
              <a
                href={LINUX_DOWNLOAD_URL}
                className="btn btn-primary"
                aria-label="Download ALTARA for Linux x64 as a portable tar.gz"
              >
                Download for Linux
              </a>
              <a
                href={ALTARA_GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                GitHub releases (external)
              </a>
            </div>
            <p className="linux-preview-copy">Linux x64 Preview · Portable .tar.gz</p>
          </div>
        </section>

        <section className="linux-help-section">
          <div className="container">
            {statusMessage ? (
              <div className="linux-download-alert" role="status">
                <strong>Download temporarily unavailable.</strong>
                <span>{statusMessage}</span>
              </div>
            ) : null}

            <div className="linux-help-layout">
              <article className="linux-help-card linux-help-card-primary">
                <span className="eyebrow">
                  <span className="dot" /> Install
                </span>
                <h2>Extract and launch.</h2>
                <ol className="linux-help-steps">
                  <li>Download the Linux x64 tar.gz.</li>
                  <li>Extract the archive.</li>
                  <li>Open a terminal inside the extracted folder.</li>
                  <li>
                    Make the launcher and sandbox executable, then start ALTARA:
                    <pre>
                      <code>{`chmod +x Altara chrome-sandbox
./Altara`}</code>
                    </pre>
                  </li>
                </ol>
                <p className="linux-help-note">
                  If the extracted preview uses the launcher name <code>altara-desktop</code>,
                  substitute that exact filename for <code>Altara</code>. The README supplied with
                  each release is authoritative for that archive.
                </p>
              </article>

              <aside className="linux-help-card linux-release-files">
                <span className="eyebrow">
                  <span className="dot" /> Release files
                </span>
                <h2>Verify the same release.</h2>
                <p>
                  Full instructions are included in{" "}
                  <code>{"README-LINUX-<version>.txt"}</code>. Both links resolve from the same
                  latest valid GitHub release as the application download.
                </p>
                <div className="linux-file-links">
                  <a href={LINUX_README_URL} className="btn btn-secondary">
                    Open matching README
                  </a>
                  <a href={LINUX_CHECKSUM_URL} className="btn btn-secondary">
                    Download SHA-256
                  </a>
                </div>
              </aside>
            </div>

            <div className="linux-dependency-grid">
              <article className="linux-help-card">
                <h2>Ubuntu dependencies</h2>
                <h3>Ubuntu 24.04 or newer</h3>
                <pre>
                  <code>{`sudo apt update
sudo apt install -y libnss3 libnspr4 libasound2t64`}</code>
                </pre>
                <h3>Ubuntu 22.04</h3>
                <pre>
                  <code>{`sudo apt update
sudo apt install -y libnss3 libnspr4 libasound2`}</code>
                </pre>
              </article>

              <article className="linux-help-card">
                <h2>Troubleshooting</h2>
                <p>Inspect any missing shared libraries:</p>
                <pre>
                  <code>{`ldd ./Altara | grep "not found"`}</code>
                </pre>
                <p>
                  Only if <code>chrome-sandbox</code> reports an ownership or permission error:
                </p>
                <pre>
                  <code>{`sudo chown root:root chrome-sandbox
sudo chmod 4755 chrome-sandbox`}</code>
                </pre>
                <p className="linux-help-warning">
                  Do not use <code>--no-sandbox</code> as the normal workaround.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
