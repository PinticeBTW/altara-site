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
import { ALTARA_SITE_LINUX_INSTALLERS_MARKER } from "../lib/altara-linux-release";

export const metadata: Metadata = {
  title: "Desktop downloads",
  description:
    "Choose ALTARA for Windows, Linux x64 as AppImage or DEB, a portable Linux fallback, or browser access. macOS and Linux ARM64 are not available yet.",
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
    "ALTARA for macOS is coming later. You can use ALTARA in the browser or choose another supported desktop platform.",
  mobile:
    "Desktop installers are not offered automatically on mobile. Try ALTARA in the browser or download for a supported computer.",
  unknown:
    "We could not safely identify this device, so no desktop installer was chosen automatically.",
};

const statusMessages: Record<string, string> = {
  "windows-unavailable":
    "The latest Windows installer could not be resolved right now. Try again shortly or use the GitHub releases fallback.",
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DownloadsPage({ searchParams }: DownloadsPageProps) {
  const params = await searchParams;
  const platform = firstValue(params.platform);
  const status = firstValue(params.status);
  const notice =
    (platform ? platformMessages[platform] : undefined) ||
    (status ? statusMessages[status] : undefined);

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
              ALTARA 0.1.127 is available for manual installation on Windows and Linux x64. Linux offers AppImage,
              DEB, and a portable fallback; browser access is open too, and macOS
              is planned next.
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
                <WindowsDownloadOption />
                <LinuxDownloadOption />
                <BrowserDownloadOption />
                <MacDownloadOption />
              </div>
              <LinuxPreviewNote />

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
