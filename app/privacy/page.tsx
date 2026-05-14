import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../components/site-chrome";

const description =
  "Read ALTARA's Privacy Policy, including what data is collected, why it is used, your GDPR rights, and how to contact support.";

const lastUpdated = "May 14, 2026";
const publicPath = "/privacy";
const productionUrl = "https://www.altaraapp.com/privacy";

export const metadata: Metadata = {
  title: "Privacy",
  description,
  alternates: {
    canonical: publicPath,
  },
  openGraph: {
    url: "/privacy",
    title: "ALTARA Privacy Policy",
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
    title: "ALTARA Privacy Policy",
    description,
    images: ["/altara-home-page-clean.png"],
  },
};

export default function PrivacyPage() {
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
              Privacy <span className="gradient-text">Policy</span>
            </h1>
            <p>
              This policy explains what information ALTARA processes, why we process it, and the
              choices and rights you have.
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
                <h2>Who operates ALTARA</h2>
                <p className="legal-note">
                  ALTARA is operated by Tomás Nunes, trading as ALTARA.
                </p>
              </section>

              <section>
                <h2>Contact</h2>
                <p>
                  If you have privacy questions or requests, email{" "}
                  <a href="mailto:support@altaraapp.com" className="legal-inline-link">
                    support@altaraapp.com
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2>What data we collect</h2>
                <p>Depending on how you use ALTARA, we may collect:</p>
                <ul>
                  <li>account information (such as email address and login data)</li>
                  <li>profile information (such as display name, avatar, and preferences)</li>
                  <li>messages and usage data needed to run core app features</li>
                  <li>billing metadata related to subscription status and transactions</li>
                  <li>support communications you send to us by email</li>
                  <li>device and log data for security, diagnostics, and reliability</li>
                </ul>
              </section>

              <section>
                <h2>Payments</h2>
                <p>
                  Payment details are handled by Stripe. ALTARA does not store full card numbers.
                </p>
              </section>

              <section>
                <h2>Service providers</h2>
                <p>We use trusted providers to operate ALTARA, including:</p>
                <ul>
                  <li>Supabase (backend and authentication services)</li>
                  <li>Stripe (payments and billing operations)</li>
                  <li>Resend or another email provider (transactional/support email delivery)</li>
                  <li>hosting and analytics providers, where applicable</li>
                </ul>
              </section>

              <section>
                <h2>Why we use data</h2>
                <p>We process data to:</p>
                <ul>
                  <li>provide and operate the app</li>
                  <li>authenticate accounts and maintain access security</li>
                  <li>process subscriptions and billing events</li>
                  <li>prevent abuse and support platform safety</li>
                  <li>respond to support requests</li>
                  <li>improve features, performance, and reliability</li>
                  <li>comply with legal obligations</li>
                </ul>
              </section>

              <section>
                <h2>Legal bases under GDPR</h2>
                <p>
                  For users in the EEA, UK, or similar jurisdictions, we rely on one or more of
                  these legal bases:
                </p>
                <ul>
                  <li>contract (to provide the service you request)</li>
                  <li>legitimate interests (to secure and improve ALTARA)</li>
                  <li>legal obligations (to meet applicable laws and regulations)</li>
                  <li>consent, where specifically requested and applicable</li>
                </ul>
              </section>

              <section>
                <h2>Data retention</h2>
                <p>
                  We retain personal data only as long as needed for account operation, billing and
                  legal compliance, safety, and technical purposes.
                </p>
              </section>

              <section>
                <h2>Your rights</h2>
                <p>You may have rights to:</p>
                <ul>
                  <li>access your personal data</li>
                  <li>correct inaccurate personal data</li>
                  <li>request deletion of personal data</li>
                  <li>request restriction of processing</li>
                  <li>data portability</li>
                  <li>object to certain processing</li>
                  <li>withdraw consent where processing relies on consent</li>
                </ul>
                <p>
                  To exercise these rights, contact{" "}
                  <a href="mailto:support@altaraapp.com" className="legal-inline-link">
                    support@altaraapp.com
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2>EU and Portugal complaints</h2>
                <p>
                  You may complain to your local data protection authority. In Portugal, this is
                  the Comiss&atilde;o Nacional de Prote&ccedil;&atilde;o de Dados (CNPD).
                </p>
              </section>

              <section>
                <h2>International transfers</h2>
                <p>
                  Some providers may process data outside Portugal or the European Union. When this
                  happens, we use appropriate safeguards required by applicable law.
                </p>
              </section>

              <section>
                <h2>Security</h2>
                <p>
                  We use reasonable technical and organizational safeguards designed to protect your
                  information. No system is perfectly secure, but we continuously work to improve
                  protection.
                </p>
              </section>

              <section>
                <h2>Children and minimum age</h2>
                <p className="legal-note">
                  ALTARA is intended for users aged 13 and over. If you are under 18, you should
                  use ALTARA with permission from a parent or legal guardian. If local law requires
                  parental consent for the processing of your personal data, that consent must be
                  provided or authorised by your parent or legal guardian. If we learn that we have
                  collected personal data from a child in a way that is not allowed by law, we will
                  take steps to delete it.
                </p>
              </section>

              <section>
                <h2>Changes to this policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. If we make material changes,
                  we will update the date on this page and may provide additional notice where
                  appropriate.
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
