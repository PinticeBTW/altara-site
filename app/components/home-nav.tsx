"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DOWNLOAD_URL } from "./site-chrome";

const NAV_LINKS = [
  { href: "/", label: "Home", key: "home" },
  { href: "/features", label: "Features", key: "features" },
  { href: "/faq", label: "FAQ", key: "faq" },
  { href: "/about", label: "About", key: "about" },
  { href: "/developers", label: "Developers", key: "developers" },
] as const;

type NavKey = (typeof NAV_LINKS)[number]["key"] | "discord-alternative";

export function HomeNav({ active = "home" }: { active?: NavKey }) {
  const [condensed, setCondensed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ticking = useRef(false);
  const lastY = useRef(0);

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
        if (!menuOpen) {
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
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className={`hp-nav-wrap${condensed ? " is-condensed" : ""}${navHidden ? " is-hidden" : ""}`}
      inert={navHidden}
    >
      <div className={`hp-nav hp-glass${menuOpen ? " is-open" : ""}`}>
        <Link href="/" className="hp-nav-brand" onClick={() => setMenuOpen(false)}>
          <Image src="/logo.png" alt="" width={26} height={26} loading="eager" className="hp-nav-mark" />
          <span>ALTARA</span>
        </Link>

        <nav className="hp-nav-links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.key === active ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hp-nav-actions">
          <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="hp-nav-cta">
            Download
          </a>
          <button
            type="button"
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
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <a
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hp-nav-cta hp-nav-cta-sheet"
          onClick={() => setMenuOpen(false)}
        >
          Download ALTARA
        </a>
      </div>
    </header>
  );
}
