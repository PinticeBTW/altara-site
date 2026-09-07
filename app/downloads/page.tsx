import type { Metadata } from "next";
import Link from "next/link";

import {
  BrowserDownloadOption,
  LINUX_HELP_URL,
  LinuxDownloadOption,
  LinuxPreviewNote,
  MacDownloadOption,
  RELEASES_URL,
  SiteFooter,
  SiteNav,
  WindowsDownloadOption,
} from "../components/site-chrome";
import { ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER } from "../lib/altara-download-platform";
import { ALTARA_SITE_LINUX_INSTALLERS_MARKER, fetchLatestLinuxRelease, fetchLatestWindowsRelease } from "../lib/altara-linux-release";

export const metadata: Metadata = {
  title: "Desktop downloads",
  description:
    "Download ALTARA for Windows, Linux x64 and macOS on Apple Silicon or Intel, or open ALTARA in your browser.",
  alternates: {
    canonical: "/downloads",
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

export default async function DownloadsPage({ searchParams }: DownloadsPageProps) {
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
      data-build-marker={`${ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER} ${ALTARA_SITE_LINUX_INSTALLERS_MARKER}`}
    >
      <SiteNav />

      <main>
        <section className="page-hero download-chooser-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <span className="eyebrow">
              <span className="dot" /> Desktop downloads
            </span>
            <h1>
              Choose where you
              <br />
              <span className="gradient-text">want to hang out.</span>
            </h1>
            <p>
              Download the latest stable ALTARA release for Windows, Linux x64,
              or macOS. You can also open ALTARA directly in your browser.
            </p>
          </div>
        </section>

        <section className="download-chooser-section">
          <div className="container">
            {notice ? (
              <div className="linux-download-alert" role="status">
                <strong>Choose a compatible option.</strong>
                <span>{notice}</span>
              </div>
            ) : null}

            <article className="linux-help-card download-chooser-panel">
              <div className="cta-platforms download-chooser-platforms">
                <WindowsDownloadOption version={windowsRelease?.version} />
                <LinuxDownloadOption version={linuxRelease?.version} />
                <BrowserDownloadOption />
                <MacDownloadOption />
              </div>
              <LinuxPreviewNote />

              <div id="macos" className="download-chooser-notes" style={{ scrollMarginTop: 100 }}>
                <h2>ALTARA for macOS</h2>
                <p>macOS 12 or later. Open the DMG, then drag Altara into Applications.</p>
                <div className="cta-platforms download-chooser-platforms">
                  <a href="/api/download/macos/arm64" className="platform-btn">
                    <span className="platform-copy"><span className="platform-name">Apple Silicon</span><span className="platform-detail">M-series Macs · arm64 DMG</span></span>
                  </a>
                  <a href="/api/download/macos/x64" className="platform-btn">
                    <span className="platform-copy"><span className="platform-name">Intel Mac</span><span className="platform-detail">Intel processors · x64 DMG</span></span>
                  </a>
                </div>
                <p>This release is ad-hoc signed and is not notarized by Apple. macOS may block the first launch. Updates are installed manually from this page.</p>
              </div>

              <div className="download-chooser-notes">
                <p>
                  <strong>Linux compatibility:</strong> AppImage is the generic x64
                  option; DEB is recommended for Ubuntu, Debian and Mint. Linux
                  ARM64 is not currently available.
                </p>
                <p>
                  Need setup commands? <Link href={LINUX_HELP_URL}>Open Linux help</Link>. If a
                  resolver is temporarily unavailable,{" "}
                  <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
                    inspect GitHub releases (external)
                  </a>
                  .
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
