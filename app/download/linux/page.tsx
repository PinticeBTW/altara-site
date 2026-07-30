import type { Metadata } from "next";

import {
  ALTARA_GITHUB_RELEASES_URL,
  ALTARA_SITE_LINUX_DOWNLOAD_MARKER,
  ALTARA_SITE_LINUX_INSTALLERS_MARKER,
} from "../../lib/altara-linux-release";
import {
  LINUX_APPIMAGE_DOWNLOAD_URL,
  LINUX_CHECKSUM_URL,
  LINUX_DEB_DOWNLOAD_URL,
  LINUX_PORTABLE_DOWNLOAD_URL,
  LINUX_README_URL,
  SiteFooter,
  SiteNav,
} from "../../components/site-chrome";

export const metadata: Metadata = {
  title: "Linux x64 Downloads",
  description:
    "Download ALTARA for Linux x64 as a DEB, AppImage, or portable tar.gz, with setup instructions and matching release verification files.",
  alternates: {
    canonical: "/download/linux",
  },
};

type LinuxHelpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusMessages: Record<string, string> = {
  unavailable:
    "The recommended Linux download could not be resolved right now. Choose an explicit format below or use the GitHub releases fallback.",
  "debian-unavailable":
    "The DEB and same-release portable fallback could not be resolved right now.",
  "appimage-unavailable":
    "The matching AppImage is not available in the latest release yet. The portable fallback remains available.",
  "deb-unavailable":
    "The matching DEB is not available in the latest release yet. The portable fallback remains available.",
  "portable-unavailable":
    "The matching portable archive could not be resolved right now.",
  "readme-unavailable":
    "The matching Linux README could not be resolved right now. The setup steps below remain available.",
  "checksum-unavailable":
    "The matching Linux checksum manifest could not be resolved right now. Inspect the GitHub release before installing.",
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LinuxHelpPage({ searchParams }: LinuxHelpPageProps) {
  const status = firstValue((await searchParams).status);
  const statusMessage = status ? statusMessages[status] : undefined;

  return (
    <div
      data-build-marker={`${ALTARA_SITE_LINUX_DOWNLOAD_MARKER} ${ALTARA_SITE_LINUX_INSTALLERS_MARKER}`}
    >
      <SiteNav />

      <main>
        <section className="page-hero linux-download-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <span className="eyebrow">
              <span className="dot" /> Linux x64 Preview
            </span>
            <h1>
              Choose the Linux package
              <br />
              <span className="gradient-text">that fits your system.</span>
            </h1>
            <p>
              Install with a DEB on Ubuntu, Debian, or Mint; use one AppImage on
              other x64 distributions; or keep the portable archive as a
              technical fallback.
            </p>
            <div className="linux-help-actions">
              <a
                href={LINUX_DEB_DOWNLOAD_URL}
                className="btn btn-primary"
                aria-label="Download the latest ALTARA DEB for Linux amd64"
              >
                Install for Ubuntu / Debian
              </a>
              <a
                href={LINUX_APPIMAGE_DOWNLOAD_URL}
                className="btn btn-secondary"
                aria-label="Download the latest ALTARA AppImage for Linux x64"
              >
                Download AppImage
              </a>
            </div>
            <p className="linux-preview-copy">
              Linux x64 only · No ARM64, Snap, Flatpak, or RPM package
            </p>
          </div>
        </section>

        <section className="linux-help-section">
          <div className="container">
            {statusMessage ? (
              <div className="linux-download-alert" role="status">
                <strong>Linux download temporarily unavailable.</strong>
                <span>{statusMessage}</span>
              </div>
            ) : null}

            <div className="linux-installer-grid">
              <article className="linux-help-card linux-help-card-primary">
                <span className="eyebrow">
                  <span className="dot" /> Recommended for Debian family
                </span>
                <h2>Install for Ubuntu / Debian</h2>
                <p>.deb package · Recommended for Ubuntu, Debian and Mint</p>
                <ol className="linux-help-steps">
                  <li>Download the DEB.</li>
                  <li>Double-click the <code>.deb</code> file.</li>
                  <li>Open it with the software installer or App Center.</li>
                  <li>Install, then launch ALTARA from the applications menu.</li>
                </ol>
                <p>Terminal fallback:</p>
                <pre>
                  <code>{"sudo apt install ./<filename>.deb"}</code>
                </pre>
                <p className="linux-help-note">
                  ALTARA can check and download a newer DEB. Installing it uses
                  the normal system authorization and package-manager flow; it
                  is not a silent update.
                </p>
                <a href={LINUX_DEB_DOWNLOAD_URL} className="btn btn-primary">
                  Download DEB
                </a>
              </article>

              <article className="linux-help-card">
                <span className="eyebrow">
                  <span className="dot" /> Generic Linux x64
                </span>
                <h2>Download AppImage</h2>
                <p>Linux x64 · Single portable application</p>
                <ol className="linux-help-steps">
                  <li>Download the AppImage.</li>
                  <li>Open a terminal in the download folder.</li>
                  <li>Mark it executable and run it:</li>
                </ol>
                <pre>
                  <code>{`chmod +x <filename>.AppImage
./<filename>.AppImage`}</code>
                </pre>
                <p className="linux-help-note">
                  The packaged AppImage supports ALTARA update checks. Desktop
                  menu integration is not claimed or installed automatically.
                </p>
                <a href={LINUX_APPIMAGE_DOWNLOAD_URL} className="btn btn-secondary">
                  Download AppImage
                </a>
              </article>

              <article className="linux-help-card linux-portable-fallback-card">
                <span className="eyebrow">
                  <span className="dot" /> Technical fallback
                </span>
                <h2>Portable tar.gz</h2>
                <p>Portable fallback · Manual setup · Advanced users</p>
                <ol className="linux-help-steps">
                  <li>Download and extract the Linux x64 tar.gz.</li>
                  <li>Open a terminal inside the extracted folder.</li>
                  <li>Make the launcher and sandbox executable, then run ALTARA:</li>
                </ol>
                <pre>
                  <code>{`chmod +x altara-desktop chrome-sandbox
./altara-desktop`}</code>
                </pre>
                <p className="linux-help-warning">
                  Manual updates are required for the portable tar.gz.
                </p>
                <a href={LINUX_PORTABLE_DOWNLOAD_URL} className="btn btn-secondary">
                  Download portable tar.gz
                </a>
              </article>
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
                <h2>Package limits</h2>
                <p>
                  These downloads are Linux x64/amd64 only. ALTARA does not
                  currently ship ARM64, Snap, Flatpak, RPM, or AppImage desktop
                  menu integration.
                </p>
                <p>
                  The DEB integrates with the applications menu. The AppImage
                  stays a single executable file. The tar.gz remains an
                  advanced, manually managed fallback.
                </p>
              </article>
            </div>

            <div className="linux-help-layout">
              <article className="linux-help-card">
                <span className="eyebrow">
                  <span className="dot" /> Release files
                </span>
                <h2>Verify the same release.</h2>
                <p>
                  Full instructions are included in{" "}
                  <code>{"README-LINUX-<version>.txt"}</code>. The README and
                  checksum links resolve from the same latest stable release as
                  the application packages.
                </p>
                <div className="linux-file-links">
                  <a href={LINUX_README_URL} className="btn btn-secondary">
                    Open matching README
                  </a>
                  <a href={LINUX_CHECKSUM_URL} className="btn btn-secondary">
                    Download checksum manifest
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
              </article>

              <article className="linux-help-card">
                <h2>Portable troubleshooting</h2>
                <p>Inspect missing shared libraries:</p>
                <pre>
                  <code>{`ldd ./altara-desktop | grep "not found"`}</code>
                </pre>
                <p>
                  Only if <code>chrome-sandbox</code> reports an ownership or
                  permission error:
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
