import Image from "next/image";
import Link from "next/link";

export const DOWNLOAD_URL =
  "/download";
export const TRY_IN_BROWSER_URL = "/try";

type NavPage = "home" | "features" | "about";

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
      { label: "Download", href: "/#download" },
      { label: "Try in browser", href: TRY_IN_BROWSER_URL },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/" },
      { label: "Careers", href: "/" },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "Twitter", href: "/" },
      { label: "Instagram", href: "/" },
      { label: "GitHub", href: "/" },
    ],
  },
];

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
              Where friends stay close. Built with love by a small team that just wanted a better
              hangout.
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4>{column.title}</h4>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} data-cursor="hover">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer-wordmark">altara</div>
        <div className="footer-bottom">
          <span>© 2026 Altara. Made by friends, for friends.</span>
          <span>v1.0 · pintice</span>
        </div>
      </div>
    </footer>
  );
}
