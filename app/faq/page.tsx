import type { Metadata } from "next";
import Link from "next/link";

import { HomeNav } from "../components/home-nav";
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
        url: "/altara-appearance-real-2026.webp",
        width: 1100,
        height: 800,
        alt: "ALTARA appearance settings with built-in themes and custom colors",
      },
    ],
  },
  twitter: {
    title: "ALTARA FAQ",
    description,
    images: ["/altara-appearance-real-2026.webp"],
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
      "Yes. The core app includes messages, calls, Best Friends pins, Focus profiles, basic Spatial Audio in server voice channels and DM privacy locks. ALTARA+ increases saved capacity, server capacity and upload limits, and adds higher-quality screen sharing and supporter badges: Core is €4.99/mo and Nova is €7.99/mo, both cheaper billed yearly.",
  },
  {
    id: "why-altara-plus",
    category: "plus",
    question: "Why does ALTARA+ exist?",
    answer:
      "Running screen sharing, file storage and transfers costs money. Optional paid plans help cover that infrastructure and support the service as a whole, including free access, maintenance and development. Our aim is to keep features free whenever we can offer them without extra running costs for ALTARA. Core and Nova offer more capacity and higher-quality screen sharing while helping keep the app running.",
  },
  {
    id: "free-personal-tools",
    category: "plus",
    question: "Are Focus and Spatial Audio free, and how much can I save?",
    answer:
      "Focus profiles and basic Spatial Audio in server voice channels are included in Free. Free includes 3 saved Focus profiles. Core adds capacity for 10 Focus profiles and 5 Spatial Audio layouts; Nova adds capacity for 25 profiles and 15 layouts. Check the app for the controls and saved-layout capacity available with your version and plan.",
  },
  {
    id: "screen-sharing-plans",
    category: "plus",
    question: "Which screen sharing modes are included in each plan?",
    answer:
      "Free includes 720p at 30 or 60fps and 1080p at 30fps. Core and Nova both add 1080p60, 1440p and 4K at 30 or 60fps, plus native source resolution. Nova has the same extra sharing modes as Core; its higher limits are for servers, uploads and saved profiles and layouts. These are selectable modes, not a guarantee of delivered resolution or frame rate: available options and actual quality depend on your app version, device, browser, capture source and connection. System audio availability also depends on the platform, rather than your plan.",
  },
  {
    id: "upload-limits",
    category: "plus",
    question: "Do the upload limits apply to every kind of file?",
    answer:
      "The general per-file limits for chat attachments are 25MB on Free, 50MB on Core and 1GB on Nova. Vault attachments, avatars, server icons, banners and some other upload types have lower technical limits. Check the limit shown where you upload; the plan limit does not override a lower limit for that feature.",
  },
  {
    id: "marketplace-purchases",
    category: "plus",
    question: "Does ALTARA+ include paid Marketplace widgets and themes?",
    answer:
      "Paid Marketplace widgets and themes are separate one-time purchases from their creators. Core and Nova do not include those purchases. Free Marketplace items remain free, and you can review each item's price and permissions before installing it.",
  },
  {
    id: "saved-capacity-downgrade",
    category: "plus",
    question:
      "What happens to saved profiles and layouts when my plan returns to Free?",
    answer:
      "Existing saved Focus profiles and Spatial Audio layouts are kept. New saved items follow your current plan and version: if you are already at or above a limit, you cannot add another until you are below it or increase your plan. Server and upload limits also follow your current plan. Check the capacity shown inside the app.",
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
    <div className="hp editorial ed-support ed-faq">
      <HomeNav active="faq" skipToContent />

      <main id="main-content" tabIndex={-1}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
          }}
        />

        <section className="ed-page-hero">
          <div className="hp-container">
            <div className="hp-hero-copy">
              <p className="ed-eyebrow">Help / frequently asked questions</p>
              <h1 className="hp-h1 hp-h1--compact">Questions, answered.</h1>
              <p className="hp-hero-sub">
                Plain answers about pricing, platforms, and what ALTARA actually
                is — search or browse by category below.
              </p>
              <p className="hp-hero-sub">
                Considering a switch?{" "}
                <Link href="/discord-alternative">
                  Read the Discord alternative guide
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="ed-faq-content">
          <div className="hp-container">
            <div>
              <FaqBrowser faqs={faqs} categories={categories} />
            </div>
          </div>
        </section>

        <section className="hp-cta">
          <div className="hp-container">
            <div className="hp-cta-panel">
              <h2 className="hp-h2 hp-h2--section">Still need help?</h2>
              <p className="hp-lead">
                Can&apos;t find your answer here? Reach the team directly, or
                just jump in and try ALTARA.
              </p>
              <div className="hp-hero-cta">
                <a
                  href="mailto:support@altaraapp.com"
                  className="hp-btn hp-btn-primary"
                >
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
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
