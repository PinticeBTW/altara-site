import Image from "next/image";
import Link from "next/link";

export const DOWNLOAD_URL = "/download";
export const DOWNLOADS_URL = "/downloads";
export const WINDOWS_DOWNLOAD_URL = "/api/download/windows";
export const TRY_IN_BROWSER_URL = "/try";
export const RELEASES_URL = "https://github.com/PinticeBTW/altara-updates/releases";
export const LINUX_DOWNLOAD_URL = "/api/download/linux";
export const LINUX_APPIMAGE_DOWNLOAD_URL = "/api/download/linux/appimage";
export const LINUX_DEB_DOWNLOAD_URL = "/api/download/linux/deb";
export const LINUX_PORTABLE_DOWNLOAD_URL = "/api/download/linux/portable";
export const LINUX_HELP_URL = "/download/linux";
export const LINUX_README_URL = "/api/download/linux/readme";
export const LINUX_CHECKSUM_URL = "/api/download/linux/checksum";

type NavPage = "home" | "features" | "faq" | "about" | "developers";
type FooterLink = {
  label: string;
  href: string;
};

function Brand() {
  return (
    <>
      <Image
        src="/logo.png"
        alt=""
        width={34}
        height={34}
        priority
        className="brand-icon"
      />
      <span>ALTARA</span>
    </>
  );
}

export function LinuxDownloadOption() {
  return (
    <a
      href={LINUX_DOWNLOAD_URL}
      className="platform-btn platform-btn-linux"
      aria-label="Download the recommended ALTARA package for Linux x64"
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
      <span className="platform-copy">
        <span className="platform-name">Download for Linux</span>
        <span className="platform-detail">0.1.127 · Linux x64 · Manual installation</span>
      </span>
    </a>
  );
}

export function WindowsDownloadOption() {
  return (
    <a
      href={WINDOWS_DOWNLOAD_URL}
      className="platform-btn"
      aria-label="Download ALTARA 0.1.127 for Windows — manual installation"
    >
      <span className="platform-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 5.557 9.836 4.62v6.687H3zm0 12.886V12.69h6.836v6.687zM10.673 4.5 21 3v8.307H10.673zm0 15v-7.81H21v9.31z" />
        </svg>
      </span>
      <span className="platform-copy">
        <span className="platform-name">Download for Windows</span>
        <span className="platform-detail">0.1.127 · Manual installation</span>
      </span>
    </a>
  );
}

export function MacDownloadOption() {
  return (
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
      <span className="platform-copy">
        <span className="platform-name">macOS</span>
        <span className="platform-soon">Coming soon</span>
      </span>
    </button>
  );
}

export function BrowserDownloadOption() {
  return (
    <Link href={TRY_IN_BROWSER_URL} className="platform-btn">
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
      <span className="platform-copy">
        <span className="platform-name">Try in browser</span>
        <span className="platform-detail">No desktop install required</span>
      </span>
    </Link>
  );
}

export function LinuxPreviewNote() {
  return (
    <p className="linux-preview-note">
      Linux x64 installers include AppImage and DEB, with a portable tar.gz fallback.{" "}
      <Link href={LINUX_HELP_URL}>Choose a format or read setup help.</Link>
    </p>
  );
}

export function SiteNav({ active }: { active?: NavPage }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="logo">
          <Brand />
        </Link>

        <div className="nav-links">
          <Link href="/" className={active === "home" ? "active" : undefined}>
            Home
          </Link>
          <Link href="/features" className={active === "features" ? "active" : undefined}>
            Features
          </Link>
          <Link href="/faq" className={active === "faq" ? "active" : undefined}>
            FAQ
          </Link>
          <Link href="/about" className={active === "about" ? "active" : undefined}>
            About
          </Link>
          <Link href="/developers" className={active === "developers" ? "active" : undefined}>
            Developers
          </Link>
        </div>
      </div>
    </nav>
  );
}

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "FAQ", href: "/faq" },
      { label: "Download options", href: DOWNLOADS_URL },
      { label: "Download for Windows", href: WINDOWS_DOWNLOAD_URL },
      { label: "Linux x64 installers", href: LINUX_HELP_URL },
      { label: "Try in browser", href: TRY_IN_BROWSER_URL },
      { label: "Release notes", href: RELEASES_URL },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "GitHub releases", href: RELEASES_URL },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "Instagram", href: "https://www.instagram.com/pintice__/" },
      { label: "NID Boys YouTube", href: "https://www.youtube.com/@NID-boys" },
      { label: "pintice YouTube", href: "https://www.youtube.com/@pintice" },
    ],
  },
];

function isExternalLink(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (isExternalLink(link.href)) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href}>
      {link.label}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="logo">
              <Brand />
            </Link>
            <p className="footer-tagline">
              Where friends, gaming groups, and small communities stay close.
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4>{column.title}</h4>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer-wordmark">ALTARA</div>
        <div className="footer-bottom">
          <span>&copy; 2026 ALTARA. Made by friends, for friends.</span>
          <span>v0.1.127 &middot; pintice</span>
        </div>
      </div>
    </footer>
  );
}
