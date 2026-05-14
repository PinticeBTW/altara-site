import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../components/site-chrome";

const description =
  "Read ALTARA's Terms of Service, including account rules, acceptable use, ALTARA+ subscriptions, Stripe billing, and support contact details.";

const lastUpdated = "May 14, 2026";
const publicPath = "/terms";
const productionUrl = "https://www.altaraapp.com/terms";

export const metadata: Metadata = {
  title: "Terms",
  description,
  alternates: {
    canonical: publicPath,
  },
  openGraph: {
    url: "/terms",
    title: "ALTARA Terms of Service",
    description,
    images: [
      {
        url: "/altara-home-page-clean.png",
        width: 1592,
        height: 988,
        alt: "ALTARA home page showing widgets, friends, calendar, notes, calls, unread DMs, and active friends",
      },
    ],
  },
  twitter: {
    title: "ALTARA Terms of Service",
    description,
    images: ["/altara-home-page-clean.png"],
  },
};

export default function TermsPage() {
  return (
    <div>
      <SiteNav />

      <main>
        <section className="page-hero legal-hero">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="container">
            <span className="eyebrow">
              <span className="dot" /> Legal
            </span>
            <h1>
              Terms of <span className="gradient-text">Service</span>
            </h1>
            <p>
              These terms explain how ALTARA works, what you can expect from us, and what we
              expect from you when using the app.
            </p>
            <div className="legal-meta">
              <span>Last updated: {lastUpdated}</span>
              <span aria-hidden="true">|</span>
              <span>
                Public route:{" "}
                <a href={publicPath} className="legal-inline-link">
                  {publicPath}
                </a>
              </span>
              <span aria-hidden="true">|</span>
              <span>Production URL: {productionUrl}</span>
            </div>
          </div>
        </section>

        <section className="legal-content-section">
          <div className="container">
            <article className="legal-content">
              <section>
                <h2>Introduction</h2>
                <p>
                  Welcome to ALTARA. By creating an account, accessing, or using ALTARA, you agree
                  to these Terms of Service and our Privacy Policy.
                </p>
                <p className="legal-note">
                  ALTARA is operated by Tomás Nunes, trading as ALTARA.
                </p>
              </section>

              <section>
                <h2>Account eligibility</h2>
                <p>
                  ALTARA is intended for users aged 13 and over. If you are under 18, you may use
                  ALTARA only with permission from a parent or legal guardian. You may not purchase
                  ALTARA+ or any paid feature unless you are 18 or older, or you have permission
                  from a parent or legal guardian and are authorised to use the payment method.
                </p>
              </section>

              <section>
                <h2>User accounts and security</h2>
                <p>
                  You are responsible for the account you create, the information you provide, and
                  keeping your login credentials secure. Please notify us at support@altaraapp.com
                  if you believe your account has been compromised.
                </p>
              </section>

              <section>
                <h2>Acceptable use</h2>
                <p>You agree not to misuse ALTARA. This includes not doing things like:</p>
                <ul>
                  <li>breaking laws or encouraging illegal activity</li>
                  <li>harassing, threatening, or abusing others</li>
                  <li>attempting to gain unauthorized access to systems or data</li>
                  <li>interfering with the service or other users</li>
                  <li>using ALTARA to distribute malware, spam, or scams</li>
                </ul>
              </section>

              <section>
                <h2>ALTARA+ subscriptions</h2>
                <p>
                  ALTARA+ is an optional paid subscription that supports ALTARA development.
                </p>
                <p>
                  ALTARA+ subscriptions are paid features. Users under 18 may not purchase ALTARA+
                  without permission from a parent or legal guardian. By purchasing ALTARA+, you
                  confirm that you are allowed to use the payment method and to enter into the
                  subscription.
                </p>
                <p>
                  The current guaranteed ALTARA+ perk is the profile badge.
                </p>
              </section>

              <section>
                <h2>Payments handled by Stripe</h2>
                <p>
                  Payments for ALTARA+ are processed by Stripe. By subscribing, you also agree to
                  Stripe&apos;s terms and policies as applicable to payment processing.
                </p>
              </section>

              <section>
                <h2>Cancellation and billing portal</h2>
                <p>
                  You can manage or cancel your ALTARA+ subscription through the billing portal
                  provided in the app. Unless required by law, changes take effect at the end of
                  the current billing period.
                </p>
              </section>

              <section>
                <h2>Supporter perks disclaimer</h2>
                <p>
                  More ALTARA+ perks are being planned and may change over time. We may add,
                  remove, or adjust perks as we learn what is most useful to the community.
                </p>
              </section>

              <section>
                <h2>No guarantee of uninterrupted service</h2>
                <p>
                  We work to keep ALTARA reliable, but we cannot guarantee that the service will
                  always be available, error-free, or uninterrupted.
                </p>
              </section>

              <section>
                <h2>Termination and suspension</h2>
                <p>
                  We may suspend or terminate access to ALTARA if these terms are violated, if it
                  is needed for security or legal reasons, or if continued access could harm the
                  platform or other users.
                </p>
              </section>

              <section>
                <h2>Limitation of liability</h2>
                <p>
                  To the maximum extent permitted by law, ALTARA is provided on an &quot;as is&quot;
                  and &quot;as available&quot; basis. ALTARA is not liable for indirect, incidental,
                  special, consequential, or punitive damages related to use of the service.
                </p>
              </section>

              <section>
                <h2>Changes to these terms</h2>
                <p>
                  We may update these terms from time to time. If we make material changes, we will
                  update the date on this page and may provide additional notice in the app or by
                  email.
                </p>
              </section>

              <section>
                <h2>Contact</h2>
                <p>
                  Questions about these terms can be sent to{" "}
                  <a href="mailto:support@altaraapp.com" className="legal-inline-link">
                    support@altaraapp.com
                  </a>
                  .
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
