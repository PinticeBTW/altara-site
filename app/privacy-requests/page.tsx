import type { Metadata } from "next";
import Link from "next/link";

import { HomeNav } from "../components/home-nav";
import { SiteFooter } from "../components/site-chrome";

const description =
  "Request access to your ALTARA personal data or deletion of specific data while keeping your account, without signing in or reinstalling the app.";
const supportEmail = "support@altaraapp.com";
const accessSubject = "Request my ALTARA data";
const deletionSubject = "Delete specific ALTARA data";

function emailUrl(subject: string, body: string[]) {
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.join("\r\n"))}`;
}

const accessUrl = emailUrl(accessSubject, [
  "I request access to a copy of my ALTARA personal data.",
  "",
  "Scope of my request:",
  "",
  "Please confirm the account-ownership verification steps, available scope and expected response date.",
  "",
  "ALTARA username (optional):",
]);
const deletionUrl = emailUrl(deletionSubject, [
  "I request deletion of specific ALTARA personal data while keeping my account.",
  "",
  "Data I want deleted:",
  "",
  "Please keep my ALTARA account active. Please confirm the account-ownership verification steps, deletion scope, expected completion date and any data that must be retained, with the reasons and retention periods.",
  "",
  "ALTARA username (optional):",
]);

export const metadata: Metadata = {
  title: "Your data requests",
  description,
  alternates: { canonical: "/privacy-requests" },
  openGraph: {
    url: "/privacy-requests",
    title: "Your ALTARA data requests",
    description,
  },
  twitter: { title: "Your ALTARA data requests", description },
};

export default function PrivacyRequestsPage() {
  return (
    <div className="hp editorial ed-support ed-legal">
      <HomeNav active={null} skipToContent />

      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero legal-hero">
          <div className="hp-container">
            <span className="ed-eyebrow">
              <span className="dot" /> Your privacy
            </span>
            <h1>
              Your data. <span className="ed-warm-text">Your request.</span>
            </h1>
            <p>
              Send a request for access to your personal data, or ask for
              specific data to be deleted while keeping your ALTARA account.
              You do not need to sign in or reinstall the app to send a request.
            </p>
            <div className="hp-hero-cta">
              <a href={accessUrl} className="hp-btn hp-btn-primary">
                Request my data <span aria-hidden="true">↗</span>
              </a>
              <a href={deletionUrl} className="hp-btn hp-btn-secondary">
                Delete specific data <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>

        <section className="legal-content-section">
          <div className="hp-container">
            <article className="legal-content">
              <section>
                <h2>Choose what you want to request</h2>
                <p>
                  For access to a copy of your personal data, use the subject{" "}
                  <strong>{accessSubject}</strong>. Describe whether your request
                  concerns all your personal data or a particular part of it.
                </p>
                <p>
                  To request deletion of specific data without deleting your
                  account, use the subject <strong>{deletionSubject}</strong>.
                  Describe the data concerned and say that you want to keep your
                  account. Do not include unnecessary sensitive information or
                  copies of private conversations in the initial request.
                </p>
                <p>
                  To request deletion of the entire account instead, follow the{" "}
                  <Link href="/delete-account" className="legal-inline-link">
                    account deletion instructions
                  </Link>
                  .
                </p>
              </section>

              <section>
                <h2>Send your request by email</h2>
                <ol className="list-decimal">
                  <li>
                    Email{" "}
                    <a href={`mailto:${supportEmail}`} className="legal-inline-link">
                      {supportEmail}
                    </a>{" "}
                    using the relevant subject above. Use the email address
                    associated with your ALTARA account if you can access it.
                  </li>
                  <li>
                    Describe what you are requesting. Your ALTARA username is
                    optional and can help identify the account.
                  </li>
                  <li>
                    Ask for the verification steps, the scope that can be
                    handled and the expected response or completion date. For
                    deletion, ask about any retained data, reasons and periods.
                  </li>
                </ol>
                <p>
                  Each button opens a draft in your email app; it does not send
                  the request. If no draft opens, use your usual email service
                  with the address and subject shown here.
                </p>
              </section>

              <section>
                <h2>Protecting your data</h2>
                <p>
                  Account ownership must be verified before personal data can be
                  disclosed or deleted. Knowing an email address or username is
                  not proof of ownership. Never send passwords, sign-in codes or
                  recovery codes by email. Do not attach identity documents to
                  your initial request.
                </p>
                <p>
                  If you cannot access the email associated with your account,
                  explain this and provide an address for a reply. That reply
                  address alone cannot authorize access to or deletion of the
                  account&apos;s data.
                </p>
              </section>

              <section>
                <h2>Scope and timing</h2>
                <p>
                  Sending a request does not immediately export or delete data,
                  close your account or change a subscription. This page does
                  not provide an automatic export or deletion service. The scope,
                  verification steps and timing need to be confirmed for your
                  request; a fixed completion period has not yet been published.
                </p>
                <p>
                  Read the{" "}
                  <Link href="/privacy" className="legal-inline-link">
                    Privacy Policy
                  </Link>{" "}
                  for the categories of data ALTARA processes, your rights and
                  information about retention and service providers.
                </p>
              </section>
            </article>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
