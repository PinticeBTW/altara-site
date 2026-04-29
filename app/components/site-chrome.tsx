import Image from "next/image";
import Link from "next/link";

export const DOWNLOAD_URL =
  "/download";
export const TRY_IN_BROWSER_URL = "/try";
export const RELEASES_URL = "https://github.com/PinticeBTW/altara-updates/releases";

type NavPage = "home" | "features" | "faq" | "about";
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

export function SiteNav({ active }: { active: NavPage }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="logo" data-cursor="hover">
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
      { label: "Download for Windows", href: "/#download" },
      { label: "Try in browser", href: TRY_IN_BROWSER_URL },
      { label: "Release notes", href: RELEASES_URL },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
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
      <a href={link.href} target="_blank" rel="noopener noreferrer" data-cursor="hover">
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} data-cursor="hover">
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
            <Link href="/" className="logo" data-cursor="hover">
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
          <span>v1.0 &middot; pintice</span>
        </div>
      </div>
    </footer>
  );
}
