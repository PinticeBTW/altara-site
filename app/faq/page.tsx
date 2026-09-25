import type { Metadata } from "next";
import Link from "next/link";

import { HomeNav } from "../components/home-nav";
import { Reveal } from "../components/reveal";
import {
  LINUX_DOWNLOAD_URL,
  SiteFooter,
  TRY_IN_BROWSER_URL,
  WINDOWS_DOWNLOAD_URL,
} from "../components/site-chrome";
import { FaqBrowser, type Faq, type FaqCategory } from "./faq-browser";

const description =
  "Answers about ALTARA: pricing and ALTARA+, browser access, Windows, Linux x64 and macOS downloads, open beta status, and who it's built for.";

export const metadata: Metadata = {
  title: "FAQ: Pricing, Downloads and Platforms",
  description,
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    url: "/faq",
    title: "ALTARA FAQ",
    description,
    images: [
      {
        url: "/altara-dashboard-hero.png",
        width: 1917,
        height: 1020,
        alt: "The ALTARA dashboard",
      },
    ],
  },
  twitter: {
    title: "ALTARA FAQ",
    description,
    images: ["/altara-dashboard-hero.png"],
  },
};

const categories: FaqCategory[] = [
  { key: "general", label: "General" },
  { key: "downloads", label: "Downloads & platforms" },
  { key: "plus", label: "ALTARA+" },
];

const faqs: Faq[] = [
  {
    id: "free",
    category: "plus",
    question: "Is ALTARA free?",
    answer:
      "Yes — the core app is free to use. ALTARA+ is an optional upgrade with higher limits and extras: Core is €4.99/mo and Nova is €7.99/mo, both cheaper billed yearly.",
  },
  {
    id: "discord-alternative",
    category: "general",
    question: "Is ALTARA a Discord alternative?",
    answer:
      "Yes, but it is not trying to be a giant clone. ALTARA is focused on friends, gaming groups, small communities, voice, DMs, and useful widgets.",
  },
  {
    id: "browser",
    category: "downloads",
    question: "Can I use ALTARA in the browser?",
    answer:
      "Yes. You can try ALTARA in the browser, and Windows, Linux x64 and macOS downloads are available now.",
  },
  {
    id: "platforms",
    category: "downloads",
    question: "What platforms are supported?",
    answer:
      "Windows is available now. Linux x64 is available as AppImage or DEB, with a manually updated portable tar.gz fallback; macOS is available for Apple Silicon and Intel, and browser access remains open.",
  },
  {
    id: "mac-version",
    category: "downloads",
    question: "Why does the macOS download have a different version number?",
    answer:
      "Desktop releases can arrive on different schedules. The macOS DMG available on the downloads page may have an earlier version number than the latest Windows or Linux release. Choose Apple Silicon or Intel to get the matching Mac installer.",
  },
  {
    id: "beta",
    category: "general",
    question: "Is ALTARA still in beta?",
    answer:
      "Yes. ALTARA is in open beta, so the app is usable while still getting fixes, polish, and new community features.",
  },
  {
    id: "who-for",
    category: "general",
    question: "Who is ALTARA for?",
    answer:
      "ALTARA is built for friend groups, gaming groups, and small communities that want voice, chat, and simple tools without the noisy feed feeling.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function FAQPage() {
  return (
    <div className="hp">
      <HomeNav active="faq" />

      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
          }}
        />

        <section className="hp-hero hp-hero--compact">
          <div className="hp-container">
            <Reveal className="hp-hero-copy">
              <h1 className="hp-h1 hp-h1--compact">Questions, answered.</h1>
              <p className="hp-hero-sub">
                Plain answers about pricing, platforms, and what ALTARA actually is — search or
                browse by category below.
              </p>
              <p className="hp-hero-sub">
                Considering a switch? <Link href="/discord-alternative">Read the Discord alternative guide</Link>.
              </p>
            </Reveal>
          </div>
        </section>

        <section>
          <div className="hp-container">
            <Reveal>
              <FaqBrowser faqs={faqs} categories={categories} />
            </Reveal>
          </div>
        </section>

        <section className="hp-cta">
          <div className="hp-container">
            <Reveal className="hp-cta-panel">
              <h2 className="hp-h2 hp-h2--section">Still need help?</h2>
              <p className="hp-lead">
                Can&apos;t find your answer here? Reach the team directly, or just jump in and try
                ALTARA.
              </p>
              <div className="hp-hero-cta">
                <a href="mailto:support@altaraapp.com" className="hp-btn hp-btn-primary">
                  Email support
                </a>
                <a
                  href={WINDOWS_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hp-btn hp-btn-secondary"
                >
                  Download for Windows
                </a>
                <a
                  href={LINUX_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hp-btn hp-btn-secondary"
                >
                  Download for Linux
                </a>
              </div>
              <a href={TRY_IN_BROWSER_URL} className="hp-cta-link">
                Try in browser
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
