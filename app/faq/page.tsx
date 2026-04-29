import Link from "next/link";
import type { Metadata } from "next";

import {
  DOWNLOAD_URL,
  RELEASES_URL,
  SiteFooter,
  SiteNav,
  TRY_IN_BROWSER_URL,
} from "../components/site-chrome";

const description =
  "Answers about ALTARA pricing, browser access, Windows download, beta status, Discord alternative features, gaming groups, and small communities.";

export const metadata: Metadata = {
  title: "FAQ",
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
        url: "/altara-app-preview-20260428.png",
        width: 1478,
        height: 885,
        alt: "ALTARA app preview showing widgets, friends, calendar, calls, notes, and DMs",
      },
    ],
  },
  twitter: {
    title: "ALTARA FAQ",
    description,
    images: ["/altara-app-preview-20260428.png"],
  },
};

const faqs = [
  {
    question: "Is ALTARA free?",
    answer:
      "Yes. ALTARA is free to use, and ALTARA+ is planned as the way to support development without bloating the core app.",
  },
  {
    question: "Is ALTARA a Discord alternative?",
    answer:
      "Yes, but it is not trying to be a giant clone. ALTARA is focused on friends, gaming groups, small communities, voice, DMs, and useful widgets.",
  },
  {
    question: "Can I use ALTARA in the browser?",
    answer:
      "Yes. You can try ALTARA in the browser, and the Windows download is available now.",
  },
  {
    question: "What platforms are supported?",
    answer:
      "Windows is available now. macOS and Linux are planned next, and browser access is available through the site.",
  },
  {
    question: "Is ALTARA still in beta?",
    answer:
      "Yes. ALTARA is in open beta, so the app is usable while still getting fixes, polish, and new community features.",
  },
  {
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
    <div>
      <SiteNav active="faq" />

      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
          }}
        />

        <section className="page-hero faq-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <span className="eyebrow">
              <span className="dot" /> FAQ
            </span>
            <h1>
              Quick answers before
              <br />
              you <span className="gradient-text">download.</span>
            </h1>
            <p>
              Plain answers about ALTARA, the Windows beta, browser access, and what kind of
              groups it is being built for.
            </p>
          </div>
        </section>

        <section className="faq-page-section">
          <div className="container">
            <div className="faq-page-layout">
              <div className="faq-list">
                {faqs.map((faq) => (
                  <details key={faq.question} className="faq-item">
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>

              <aside className="faq-aside-card">
                <span className="eyebrow">
                  <span className="dot" /> Still curious?
                </span>
                <h2>Try ALTARA now.</h2>
                <p>
                  Download the Windows beta, open it in your browser, or check what changed in the
                  latest release.
                </p>
                <div className="faq-aside-actions">
                  <a
                    href={DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Download Windows
                  </a>
                  <Link href={TRY_IN_BROWSER_URL} className="btn btn-secondary">
                    Try in browser
                  </Link>
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="release-inline-link"
                  >
                    Read release notes
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
