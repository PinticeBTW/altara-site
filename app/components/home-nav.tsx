"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DOWNLOADS_URL } from "./site-chrome";

const NAV_LINKS = [
  { href: "/", label: "Home", key: "home" },
  { href: "/features", label: "Features", key: "features" },
  { href: "/faq", label: "FAQ", key: "faq" },
  { href: "/about", label: "About", key: "about" },
  { href: "/marketplace", label: "Marketplace", key: "marketplace" },
  { href: "/developers", label: "Developers", key: "developers" },
] as const;

type NavKey =
  | (typeof NAV_LINKS)[number]["key"]
  | "discord-alternative"
  | "downloads";

export function HomeNav({
  active = "home",
  skipToContent = false,
}: {
  active?: NavKey | null;
  skipToContent?: boolean;
}) {
  const [condensed, setCondensed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ticking = useRef(false);
  const lastY = useRef(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        setCondensed(y > 24);

        // A fixed nav physically sits above whatever content is
        // scrolling past it — no amount of section padding removes
        // that. Instead of overlapping headings mid-scroll, the nav
        // steps out of the way while the visitor is reading down the
        // page, and returns the moment they scroll back up or land
        // near the top. It never hides while the mobile menu is open.
        if (!menuOpen && !headerRef.current?.contains(document.activeElement)) {
          setHidden(y > lastY.current && y > 140);
        }

        lastY.current = y;
        ticking.current = false;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [menuOpen]);

  const navHidden = hidden && !menuOpen;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      {skipToContent && (
        <a className="ed-skip" href="#main-content">
          Skip to content
        </a>
      )}
      <header
        ref={headerRef}
        className={`hp-nav-wrap${condensed ? " is-condensed" : ""}${navHidden ? " is-hidden" : ""}`}
        inert={navHidden}
      >
        <div className={`hp-nav hp-glass${menuOpen ? " is-open" : ""}`}>
          <Link
            href="/"
            className="hp-nav-brand"
            onClick={() => setMenuOpen(false)}
          >
            <Image
              src="/logo.png"
              alt=""
              width={26}
              height={26}
              loading="eager"
              className="hp-nav-mark"
            />
            <span>ALTARA</span>
          </Link>

          <nav className="hp-nav-links" aria-label="Primary">
            {NAV_LINKS.map((link) =>
              link.key === "developers" || link.key === "marketplace" ? (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={link.key === active ? "page" : undefined}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.key === active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>

          <div className="hp-nav-actions">
            <Link
              href={DOWNLOADS_URL}
              className="hp-nav-cta"
              aria-current={active === "downloads" ? "page" : undefined}
            >
              Download
            </Link>
            <button
              type="button"
              ref={toggleRef}
              className="hp-nav-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="hp-nav-sheet"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>

        <div
          id="hp-nav-sheet"
          className={`hp-nav-sheet hp-glass${menuOpen ? " is-open" : ""}`}
          inert={!menuOpen}
        >
          <nav aria-label="Mobile">
            {NAV_LINKS.map((link) =>
              link.key === "developers" || link.key === "marketplace" ? (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={link.key === active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.key === active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <Link
            href={DOWNLOADS_URL}
            aria-current={active === "downloads" ? "page" : undefined}
            className="hp-nav-cta hp-nav-cta-sheet"
            onClick={() => setMenuOpen(false)}
          >
            Download ALTARA
          </Link>
        </div>
      </header>
    </>
  );
}
