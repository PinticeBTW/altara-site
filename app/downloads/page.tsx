import type { Metadata } from "next";
import Link from "next/link";
import { HomeNav } from "../components/home-nav";

import {
  BrowserDownloadOption,
  LINUX_HELP_URL,
  LinuxDownloadOption,
  LinuxPreviewNote,
  MacDownloadOption,
  RELEASES_URL,
  SiteFooter,
  WindowsDownloadOption,
} from "../components/site-chrome";
import { ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER } from "../lib/altara-download-platform";
import {
  ALTARA_SITE_LINUX_INSTALLERS_MARKER,
  fetchLatestLinuxRelease,
  fetchLatestWindowsRelease,
} from "../lib/altara-linux-release";

export const metadata: Metadata = {
  title: "Download ALTARA for Windows, Linux or macOS",
  description:
    "Download ALTARA for Windows, Linux x64 and macOS on Apple Silicon or Intel, or open ALTARA in your browser.",
  alternates: {
    canonical: "/downloads",
  },
  openGraph: {
    type: "website",
    url: "/downloads",
    title: "Download ALTARA for Windows, Linux or macOS",
    description:
      "Choose a Windows installer, Linux x64 package, macOS DMG or the browser app.",
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
    card: "summary_large_image",
    title: "Download ALTARA",
    description: "Windows, Linux x64, macOS and browser options.",
    images: ["/altara-appearance-real-2026.webp"],
  },
};

type DownloadsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const platformMessages: Record<string, string> = {
  linux_unsupported:
    "ALTARA for Linux is currently available only for x64/amd64 computers. Linux ARM64 is not supported yet.",
  macos:
    "Choose Apple Silicon for M1, M2, M3, M4 and later M-series Macs, or Intel for Intel-based Macs. About This Mac shows which chip you have.",
  mobile:
    "Desktop installers are not offered automatically on mobile. Try ALTARA in the browser or download for a supported computer.",
  unknown:
    "We could not safely identify this device, so no desktop installer was chosen automatically.",
};

const statusMessages: Record<string, string> = {
  "macos-unavailable":
    "The macOS installer could not be resolved right now. Try again shortly or use the GitHub releases fallback.",
  "windows-unavailable":
    "The latest Windows installer could not be resolved right now. Try again shortly or use the GitHub releases fallback.",
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DownloadsPage({
  searchParams,
}: DownloadsPageProps) {
  const [params, windowsRelease, linuxRelease] = await Promise.all([
    searchParams,
    fetchLatestWindowsRelease().catch(() => null),
    fetchLatestLinuxRelease().catch(() => null),
  ]);
  const platform = firstValue(params.platform);
  const status = firstValue(params.status);
  const notice =
    (status ? statusMessages[status] : undefined) ||
    (platform ? platformMessages[platform] : undefined);

  return (
    <div
      className="hp editorial ed-downloads"
      data-build-marker={`${ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER} ${ALTARA_SITE_LINUX_INSTALLERS_MARKER}`}
    >
      <HomeNav active="downloads" skipToContent />

      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero hp-hero hp-hero--compact">
          <div className="hp-container">
            <p className="ed-eyebrow">Download ALTARA · Open beta</p>
            <h1 className="hp-h1 hp-h1--compact">
              Download ALTARA.
              <br />
              Choose your platform.
            </h1>
            <p className="hp-hero-sub">
              Choose your desktop app or open ALTARA in your browser. The core
              app is free; optional ALTARA+ plans help cover infrastructure and
              keep the service running.
            </p>
            <p className="hp-hero-meta">
              Windows · Linux x64 · macOS Apple Silicon &amp; Intel · Web
            </p>
          </div>
        </section>

        <section className="download-chooser-section">
          <div className="hp-container">
            {notice ? (
              <div className="linux-download-alert" role="status">
                <strong>Choose a compatible option.</strong>
                <span>{notice}</span>
              </div>
            ) : null}

            <article
              className="linux-help-card download-chooser-panel ed-download-panel"
              aria-label="Desktop and browser options"
            >
              <div className="ed-download-heading">
                <h2>Choose where to use ALTARA.</h2>
                <p>
                  Windows installer, Linux x64 packages, macOS DMGs or the
                  browser app.
                </p>
              </div>
              <div className="cta-platforms download-chooser-platforms">
                <WindowsDownloadOption version={windowsRelease?.version} />
                <LinuxDownloadOption version={linuxRelease?.version} />
                <MacDownloadOption />
                <BrowserDownloadOption />
              </div>
              <LinuxPreviewNote />

              <div
                id="macos"
                className="download-chooser-notes"
                style={{ scrollMarginTop: 100 }}
              >
                <h2>ALTARA for macOS</h2>
                <p>
                  macOS 12 or later. Open the DMG, then drag ALTARA into
                  Applications. macOS builds may have a different version number
                  from the latest Windows and Linux release.
                </p>
                <div className="cta-platforms download-chooser-platforms">
                  <a href="/api/download/macos/arm64" className="platform-btn">
                    <span className="platform-copy">
                      <span className="platform-name">Apple Silicon</span>
                      <span className="platform-detail">
                        M-series Macs · arm64 DMG
                      </span>
                    </span>
                  </a>
                  <a href="/api/download/macos/x64" className="platform-btn">
                    <span className="platform-copy">
                      <span className="platform-name">Intel Mac</span>
                      <span className="platform-detail">
                        Intel processors · x64 DMG
                      </span>
                    </span>
                  </a>
                </div>
                <p>
                  This release is ad-hoc signed and is not notarized by Apple.
                  macOS may block the first launch. Updates are installed
                  manually from this page.
                </p>
              </div>

              <div className="download-chooser-notes">
                <p>
                  <strong>Linux compatibility:</strong> AppImage is the generic
                  x64 option; DEB is recommended for Ubuntu, Debian and Mint.
                  Linux ARM64 is not currently available.
                </p>
                <p>
                  Need setup commands?{" "}
                  <Link href={LINUX_HELP_URL}>Open Linux help</Link>. If a
                  resolver is temporarily unavailable,{" "}
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    inspect GitHub releases (external)
                  </a>
                  .
                </p>
                <p>
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read the release notes
                  </a>{" "}
                  for recent changes. Need a hand?{" "}
                  <a href="mailto:support@altaraapp.com">Contact support</a>.
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
