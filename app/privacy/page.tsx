import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../components/site-chrome";

const description =
  "Read ALTARA's Privacy Policy, including what data is collected, why it is used, your GDPR rights, and how to contact support.";

const lastUpdated = "September 29, 2026";
const publicPath = "/privacy";
const productionUrl = "https://www.altaraapp.com/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy",
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

              <section id="community-widgets" style={{ scrollMarginTop: "100px" }}>
                <h2>Community widgets: privacy and security</h2>
                <p>
                  Widgets are made by independent creators. ALTARA stores publication metadata,
                  fixed release files, account installation records and ratings. Public installations
                  sync across your devices. Data saved through the widget SDK stays on that device,
                  scoped to your account and that installation; it is not synced as chat data.
                </p>
                <p>
                  Widgets run in isolated frames. The widget SDK does not provide your messages,
                  contacts, account credentials, filesystem or desktop app APIs. Camera, microphone,
                  location, clipboard access, popups and downloads are not enabled for widgets.
                  Isolation is not a review of a creator or a guarantee that a widget is trustworthy.
                </p>
                <p>
                  A fixed release stores its HTML and scripts with ALTARA and verifies them before
                  opening. Published code cannot be edited in place: you choose when to install a
                  replacement release. Remote scripts and dynamic code execution are blocked in this
                  format. HTTP API requests are blocked by default. A fixed release needs the
                  network permission to make HTTPS API requests; the installation or update notice
                  shows this access before you approve. Online API responses can still change. Older live website installations are
                  paused until you choose a fixed release, with saved data retained. Public manifest
                  links added for testing save a fixed copy of release.html on this device. Only
                  explicit live previews and localhost development follow changes on their hosts.
                </p>
                <p>
                  Fetching manifests or icons contacts the creator’s host even before a widget runs.
                  External widgets and online services called by a fixed release can receive your IP
                  address, browser request information and anything you enter or choose to upload.
                  Those services apply their own privacy policies. Installing a widget does not give
                  it access to your ALTARA conversations, but it can imitate a login or payment form.
                  Never enter ALTARA passwords, login codes or payment details inside widgets.
                </p>
                <p>
                  Widgets can use CPU, memory, network bandwidth and battery. A name, icon or rating
                  does not verify a creator’s identity. Before previewing or installing a new release,
                  ALTARA shows an access notice. Installation approves running that release on your
                  account’s devices without repeating the notice each time you open Home.
                </p>
                <p>
                  Use Manage widgets to check for updates or uninstall. Uninstalling deactivates the
                  account installation and removes its SDK data on devices when they synchronize;
                  historical installation records can remain for reinstalling and aggregate counts.
                  A creator can remove a listing while keeping existing installations running, or
                  disable that release on connected apps. Uninstalling cannot delete information
                  already sent to another service; contact that service to request deletion.
                </p>
                <p>
                  Use Report widget in its Marketplace page or Manage widgets to send the release,
                  reason and description to ALTARA moderation. Reports are visible to you and ALTARA
                  moderation, not to the widget creator. You can also ask about your data at{' '}
                  <a href="mailto:support@altaraapp.com" className="legal-inline-link">support@altaraapp.com</a>.
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
