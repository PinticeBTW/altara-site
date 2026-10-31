import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "../components/site-chrome";
import { HomeNav } from "../components/home-nav";

const description =
  "Read ALTARA's Terms of Service, including account rules, community widget purchases, withdrawals and refunds, ALTARA+ subscriptions, and support contacts.";

const lastUpdated = "October 20, 2026";
const publicPath = "/terms";

export const metadata: Metadata = {
  title: "Terms of Service",
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
        url: "/altara-appearance-real-2026.webp",
        width: 1100,
        height: 800,
        alt: "ALTARA appearance settings with built-in themes and custom colors",
      },
    ],
  },
  twitter: {
    title: "ALTARA Terms of Service",
    description,
    images: ["/altara-appearance-real-2026.webp"],
  },
};

export default function TermsPage() {
  return (
    <div className="hp editorial ed-support ed-legal">
      <HomeNav active={null} skipToContent />

      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero legal-hero">
          <div className="hp-container">
            <span className="ed-eyebrow">
              <span className="dot" /> Legal
            </span>
            <h1>
              Terms of <span className="ed-warm-text">Service</span>
            </h1>
            <p>
              These terms explain how ALTARA works, what you can expect from us,
              and what we expect from you when using the app.
            </p>
            <div className="legal-meta">
              <span>Last updated: {lastUpdated}</span>
            </div>
          </div>
        </section>

        <section className="legal-content-section">
          <div className="hp-container">
            <article className="legal-content">
              <section>
                <h2>Introduction</h2>
                <p>
                  Welcome to ALTARA. By creating an account, accessing, or using
                  ALTARA, you agree to these Terms of Service and our Privacy
                  Policy.
                </p>
                <p className="legal-note">
                  ALTARA is operated by Tomás Nunes, trading as ALTARA.
                </p>
              </section>

              <section>
                <h2>Account eligibility</h2>
                <p>
                  ALTARA is intended for users aged 13 and over. If you are
                  under 18, you may use ALTARA only with permission from a
                  parent or legal guardian. You may not purchase ALTARA+ or any
                  paid feature unless you are 18 or older, or you have
                  permission from a parent or legal guardian and are authorised
                  to use the payment method.
                </p>
              </section>

              <section>
                <h2>User accounts and security</h2>
                <p>
                  You are responsible for the account you create, the
                  information you provide, and keeping your login credentials
                  secure. Please notify us at support@altaraapp.com if you
                  believe your account has been compromised.
                </p>
              </section>

              <section>
                <h2>Acceptable use</h2>
                <p>
                  You agree not to misuse ALTARA. This includes not doing things
                  like:
                </p>
                <ul>
                  <li>breaking laws or encouraging illegal activity</li>
                  <li>harassing, threatening, or abusing others</li>
                  <li>
                    attempting to gain unauthorized access to systems or data
                  </li>
                  <li>interfering with the service or other users</li>
                  <li>using ALTARA to distribute malware, spam, or scams</li>
                </ul>
              </section>

              <section>
                <h2>Paid community widgets</h2>
                <p>
                  Community widgets are published by their creators. A one-time
                  purchase gives the signed-in buying account a licence to use
                  that creator&apos;s widget project and its later published
                  versions; it does not transfer copyright or permission to
                  redistribute the code. Buying does not install or run a
                  widget. Installation and each update remain your choice.
                </p>
                <p>
                  Widget payments are processed by Stripe on the creator&apos;s
                  connected account. ALTARA collects a 5% commission, rounded to
                  the currency&apos;s smallest unit. Stripe processing fees are
                  separate and are borne by the creator. Review the seller
                  information, total price, compatibility and permissions before
                  paying. A profile name or completed Stripe setup alone does
                  not establish whether a creator is acting as a professional
                  seller.
                </p>
                <p>
                  Removing a paid listing from the store preserves authorised
                  purchases and reinstallation. External services may stop
                  working, and security or payment restrictions may pause hosted
                  access. These limits do not exclude any mandatory rights you
                  have if digital content is not supplied or does not conform to
                  the contract.
                </p>
              </section>

              <section>
                <h2>Widget withdrawals, refunds and complaints</h2>
                <p>
                  ALTARA offers a worldwide commercial policy allowing
                  withdrawal requests within 14 days after ALTARA first confirms
                  payment for a widget purchase. No reason is required for that
                  request. Installing or using the widget alone is not grounds
                  for rejection. ALTARA does not require a digital-content
                  withdrawal waiver for these purchases.
                </p>
                <p>
                  Open <strong>Help &amp; refunds</strong> in the Marketplace or
                  the app&apos;s widget manager to select the purchase, submit
                  your request and keep its downloadable receipt. The original
                  submission time is retained while it is reviewed. A decision
                  against a request must include an explanation, and you can ask
                  ALTARA to review it. This commercial policy does not shorten
                  statutory withdrawal periods or remove rights concerning
                  faulty, misdescribed or undelivered content. You can report
                  those problems after the commercial 14-day period.
                </p>
                <p>
                  Recording or approving a request does not itself return money.
                  Refunds are processed separately in Stripe and their payment
                  status is checked against Stripe. A confirmed partial refund
                  retains access. A confirmed full refund removes paid access if
                  no other valid purchase grants it; local widget data is
                  retained unless you uninstall or clear it. No punitive refund
                  fee is charged to the buyer. ALTARA returns the corresponding
                  proportion of its 5% commission on an approved refund; that
                  platform-fee return is a separate step from returning money to
                  the buyer.
                </p>
                <p>
                  Read the{" "}
                  <Link href="/widget-refunds" className="legal-inline-link">
                    widget withdrawal and refund policy
                  </Link>{" "}
                  for the process, receipts, creator responsibilities and
                  support route. That policy concerns widgets, not cancellation
                  of an ALTARA+ subscription.
                </p>
              </section>

              <section>
                <h2>ALTARA+ subscriptions</h2>
                <p>
                  ALTARA+ is an optional paid subscription that supports ALTARA
                  development.
                </p>
                <p>
                  ALTARA+ subscriptions are paid features. Users under 18 may
                  not purchase ALTARA+ without permission from a parent or legal
                  guardian. By purchasing ALTARA+, you confirm that you are
                  allowed to use the payment method and to enter into the
                  subscription.
                </p>
                <p>
                  Core and Nova include a supporter profile badge, increased
                  server, upload and saved-profile capacity, and additional
                  screen sharing modes. See the{" "}
                  <Link href="/#altara-plus" className="legal-inline-link">
                    plan comparison
                  </Link>{" "}
                  and review the current offer shown in the app before
                  subscribing. Some features and upload types have their own
                  technical limits.
                </p>
              </section>

              <section>
                <h2>Payments handled by Stripe</h2>
                <p>
                  Payments for ALTARA+ are processed by Stripe. By subscribing,
                  you also agree to Stripe&apos;s terms and policies as
                  applicable to payment processing.
                </p>
              </section>

              <section>
                <h2>Cancellation and billing portal</h2>
                <p>
                  You can manage or cancel your ALTARA+ subscription through the
                  billing portal provided in the app. Unless required by law,
                  changes take effect at the end of the current billing period.
                </p>
              </section>

              <section>
                <h2>Supporter perks disclaimer</h2>
                <p>
                  ALTARA+ perks may change over time.
                  We may add, remove, or adjust perks as we learn what is most
                  useful to the community.
                </p>
              </section>

              <section>
                <h2>No guarantee of uninterrupted service</h2>
                <p>
                  We work to keep ALTARA reliable, but we cannot guarantee that
                  the service will always be available, error-free, or
                  uninterrupted.
                </p>
              </section>

              <section>
                <h2>Termination and suspension</h2>
                <p>
                  We may suspend or terminate access to ALTARA if these terms
                  are violated, if it is needed for security or legal reasons,
                  or if continued access could harm the platform or other users.
                </p>
              </section>

              <section>
                <h2>Limitation of liability</h2>
                <p>
                  To the maximum extent permitted by law, ALTARA is provided on
                  an &quot;as is&quot; and &quot;as available&quot; basis.
                  ALTARA is not liable for indirect, incidental, special,
                  consequential, or punitive damages related to use of the
                  service.
                </p>
              </section>

              <section>
                <h2>Changes to these terms</h2>
                <p>
                  We may update these terms from time to time. If we make
                  material changes, we will update the date on this page and may
                  provide additional notice in the app or by email.
                </p>
              </section>

              <section>
                <h2>Contact</h2>
                <p>
                  Questions about these terms can be sent to{" "}
                  <a
                    href="mailto:support@altaraapp.com"
                    className="legal-inline-link"
                  >
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
