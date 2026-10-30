import type { Metadata } from "next";
import Link from "next/link";

import { HomeNav } from "../components/home-nav";
import { SiteFooter } from "../components/site-chrome";

const description =
  "How to request deletion of your ALTARA account and associated personal data without signing in or reinstalling the app.";
const supportEmail = "support@altaraapp.com";
const emailSubject = "Delete my ALTARA account";
const emailBody = [
  "I request permanent deletion of my ALTARA account and associated personal data.",
  "",
  "Please confirm the identity-verification steps, deletion scope, expected completion date, and any retained data, reasons and retention periods.",
  "",
  "ALTARA username (optional):",
].join("\r\n");
const requestUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

export const metadata: Metadata = {
  title: "Delete your account",
  description,
  alternates: { canonical: "/delete-account" },
  openGraph: {
    url: "/delete-account",
    title: "Delete your ALTARA account",
    description,
  },
  twitter: { title: "Delete your ALTARA account", description },
};

export default function DeleteAccountPage() {
  return (
    <div className="hp editorial ed-support ed-legal">
      <HomeNav active={null} skipToContent />

      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero legal-hero">
          <div className="hp-container">
            <span className="ed-eyebrow">
              <span className="dot" /> Your account
            </span>
            <h1>
              Delete your <span className="ed-warm-text">ALTARA account.</span>
            </h1>
            <p>
              Request permanent deletion of your account and associated personal
              data by email. You do not need to sign in or reinstall ALTARA to
              send a request.
            </p>
            <div className="hp-hero-cta">
              <a href={requestUrl} className="hp-btn hp-btn-primary">
                Request deletion by email <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>

        <section className="legal-content-section">
          <div className="hp-container">
            <article className="legal-content">
              <section>
                <h2>How to send your request</h2>
                <ol className="list-decimal">
                  <li>
                    Email{" "}
                    <a href={`mailto:${supportEmail}`} className="legal-inline-link">
                      {supportEmail}
                    </a>{" "}
                    with the subject <strong>{emailSubject}</strong>. Use the
                    email address associated with your ALTARA account if you
                    still have access to it.
                  </li>
                  <li>
                    Say that you want your account and associated personal data
                    permanently deleted. You can include your ALTARA username to
                    help identify the account.
                  </li>
                  <li>
                    Ask for the verification steps, what will be deleted or
                    retained, and the expected completion date.
                  </li>
                </ol>
                <p>
                  The button opens a draft in your email app; you still need to
                  send it. If it does not open, use your usual email service and
                  the address and subject above.
                </p>
              </section>

              <section>
                <h2>Protecting your account</h2>
                <p>
                  Sending a request does not immediately delete an account.
                  Account ownership must be verified before any deletion; knowing
                  someone&apos;s email address or username is not proof of ownership.
                  Never send your password, sign-in codes or recovery codes by email.
                </p>
                <p>
                  If you cannot access the email associated with your account,
                  explain this in your request and provide an address where you
                  can receive a reply. That reply address alone cannot authorize
                  deletion of the account.
                </p>
              </section>

              <section>
                <h2>Your account and associated data</h2>
                <p>
                  Want a copy of your data, or to delete specific data while
                  keeping your account? Use the{" "}
                  <Link href="/privacy-requests" className="legal-inline-link">
                    personal data request instructions
                  </Link>{" "}
                  instead.
                </p>
                <p>
                  Request deletion of the account itself and its associated
                  personal data, including sign-in and profile information,
                  preferences, messages and uploaded content. Ask for confirmation
                  of the scope, including content shared with other people and
                  data held by service providers.
                </p>
                <p>
                  The{" "}
                  <Link href="/privacy" className="legal-inline-link">
                    Privacy Policy
                  </Link>{" "}
                  describes the categories of data ALTARA processes and retention
                  for billing, legal compliance, safety and technical purposes.
                  Any data retained after deletion, its purpose and its retention
                  period need to be confirmed for your request.
                </p>
              </section>

              <section>
                <h2>Timing and recovery</h2>
                <p>
                  A fixed deletion deadline and backup-retention period have not
                  yet been published. Ask for these details before your request
                  is processed. This page does not offer automatic deletion or a
                  guaranteed recovery period. Do not assume that a permanently
                  deleted account can be restored.
                </p>
              </section>

              <section>
                <h2>Subscriptions and payments</h2>
                <p>
                  If you have ALTARA+ or other purchases, mention them in your
                  request and ask how future charges and billing records will be
                  handled. Sending a deletion request does not itself cancel a
                  subscription or request a refund.
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
