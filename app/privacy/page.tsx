import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "../components/site-chrome";
import { HomeNav } from "../components/home-nav";

const description =
  "Read ALTARA's Privacy Policy, including what data is collected, why it is used, your GDPR rights, and how to contact support.";

const lastUpdated = "October 30, 2026";
const publicPath = "/privacy";

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
        url: "/altara-appearance-real-2026.webp",
        width: 1100,
        height: 800,
        alt: "ALTARA appearance settings with built-in themes and custom colors",
      },
    ],
  },
  twitter: {
    title: "ALTARA Privacy Policy",
    description,
    images: ["/altara-appearance-real-2026.webp"],
  },
};

export default function PrivacyPage() {
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
              Privacy <span className="ed-warm-text">Policy</span>
            </h1>
            <p>
              This policy explains what information ALTARA processes, why we
              process it, and the choices and rights you have.
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
                <h2>Who operates ALTARA</h2>
                <p className="legal-note">
                  ALTARA is operated by Tomás Nunes, trading as ALTARA.
                </p>
              </section>

              <section>
                <h2>Contact</h2>
                <p>
                  If you have privacy questions or requests, email{" "}
                  <a
                    href="mailto:support@altaraapp.com"
                    className="legal-inline-link"
                  >
                    support@altaraapp.com
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2>What data we collect</h2>
                <p>Depending on how you use ALTARA, we may collect:</p>
                <ul>
                  <li>
                    account information (such as email address and login data)
                  </li>
                  <li>
                    profile information (such as display name, avatar, and
                    preferences)
                  </li>
                  <li>
                    messages and usage data needed to run core app features
                  </li>
                  <li>
                    billing metadata related to subscription status and
                    transactions
                  </li>
                  <li>support communications you send to us by email</li>
                  <li>
                    device and log data for security, diagnostics, and
                    reliability
                  </li>
                </ul>
              </section>

              <section>
                <h2>Payments</h2>
                <p>
                  Payment details are handled by Stripe. ALTARA does not store
                  full card numbers.
                </p>
              </section>

              <section>
                <h2>Service providers</h2>
                <p>We use trusted providers to operate ALTARA, including:</p>
                <ul>
                  <li>Supabase (backend and authentication services)</li>
                  <li>Stripe (payments and billing operations)</li>
                  <li>
                    Resend or another email provider (transactional/support
                    email delivery)
                  </li>
                  <li>hosting and analytics providers, where applicable</li>
                </ul>
              </section>

              <section>
                <h2>Public website analytics</h2>
                <p>
                  If you allow analytics on our public marketing website, we use
                  Microsoft Clarity to understand visits, clicks, scrolling and
                  usability problems through heatmaps and session recordings.
                  Clarity loads only after your choice. We do not use it in the
                  ALTARA app or authenticated developer areas. We do not grant
                  advertising storage permission to Clarity.
                </p>

                <p>
                  After you accept, Clarity may set analytics cookies such as{" "}
                  <code>_clck</code>
                  (to recognize a visitor) and <code>_clsk</code> (to connect
                  page views in one session). Microsoft may also set cookies on
                  its own domains; see its{" "}
                  <a
                    href="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies"
                    className="legal-inline-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Clarity cookies list
                  </a>
                  . Clarity is not loaded when you reject analytics.
                </p>
                <p>
                  Your choice is saved in your browser. You can reject analytics
                  or withdraw consent at any time using{" "}
                  <strong>Analytics preferences</strong> in the website footer.
                  Clarity may process website usage data outside the EEA; see
                  the{" "}
                  <a
                    href="https://privacy.microsoft.com/privacystatement"
                    className="legal-inline-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Microsoft Privacy Statement
                  </a>
                  .
                </p>
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
                  For users in the EEA, UK, or similar jurisdictions, we rely on
                  one or more of these legal bases:
                </p>
                <ul>
                  <li>contract (to provide the service you request)</li>
                  <li>legitimate interests (to secure and improve ALTARA)</li>
                  <li>
                    legal obligations (to meet applicable laws and regulations)
                  </li>
                  <li>consent, where specifically requested and applicable</li>
                </ul>
              </section>

              <section>
                <h2>Data retention</h2>
                <p>
                  We retain personal data only as long as needed for account
                  operation, billing and legal compliance, safety, and technical
                  purposes.
                </p>
              </section>

              <section>
                <h2>Account deletion requests</h2>
                <p>
                  You can request deletion of your ALTARA account and associated
                  personal data without signing in or reinstalling the app. See{" "}
                  <Link href="/delete-account" className="legal-inline-link">
                    how to request account deletion
                  </Link>{" "}
                  for the email instructions. Account ownership must be verified
                  before deletion. A request does not immediately delete the
                  account or cancel a subscription.
                </p>
                <p>
                  A fixed deletion deadline and backup-retention period have not
                  yet been published. Ask for the completion date and any retained
                  data, purposes and retention periods when making your request.
                  No recovery period is guaranteed by this process.
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
                  To request access to your data or deletion of specific data
                  while keeping your account, see the{" "}
                  <Link href="/privacy-requests" className="legal-inline-link">
                    personal data request instructions
                  </Link>
                  . To exercise your other rights, contact{" "}
                  <a
                    href="mailto:support@altaraapp.com"
                    className="legal-inline-link"
                  >
                    support@altaraapp.com
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2>EU and Portugal complaints</h2>
                <p>
                  You may complain to your local data protection authority. In
                  Portugal, this is the Comiss&atilde;o Nacional de
                  Prote&ccedil;&atilde;o de Dados (CNPD).
                </p>
              </section>

              <section>
                <h2>International transfers</h2>
                <p>
                  Some providers may process data outside Portugal or the
                  European Union. When this happens, we use appropriate
                  safeguards required by applicable law.
                </p>
              </section>

              <section
                id="community-widgets"
                style={{ scrollMarginTop: "100px" }}
              >
                <h2>Community widgets: privacy and security</h2>
                <p>
                  Widgets are made by independent creators. ALTARA stores
                  publication metadata, fixed release files, account
                  installation records and ratings. Public installations sync
                  across your devices. Data saved through the widget SDK stays
                  on that device, scoped to your account and that installation;
                  it is not synced as chat data.
                </p>
                <p>
                  Widgets run in isolated frames. The widget SDK does not
                  provide your messages, contacts, account credentials,
                  filesystem or desktop app APIs. Camera, microphone, location,
                  clipboard access, popups and downloads are not enabled for
                  widgets. Isolation is not a review of a creator or a guarantee
                  that a widget is trustworthy.
                </p>
                <p>
                  A fixed release stores its HTML and scripts with ALTARA and
                  verifies them before opening. Published code cannot be edited
                  in place: you choose when to install a replacement release.
                  Remote scripts and dynamic code execution are blocked in this
                  format. HTTP API requests are blocked by default. A fixed
                  release needs the network permission to make HTTPS API
                  requests; the installation or update notice shows this access
                  before you approve. Online API responses can still change.
                  Older live website installations are paused until you choose a
                  fixed release, with saved data retained. Public manifest links
                  added for testing save a fixed copy of release.html on this
                  device. Only explicit live previews and localhost development
                  follow changes on their hosts.
                </p>
                <p>
                  Fetching manifests or icons contacts the creator’s host even
                  before a widget runs. External widgets and online services
                  called by a fixed release can receive your IP address, browser
                  request information and anything you enter or choose to
                  upload. Those services apply their own privacy policies.
                  Installing a widget does not give it access to your ALTARA
                  conversations, but it can imitate a login or payment form.
                  Never enter ALTARA passwords, login codes or payment details
                  inside widgets.
                </p>
                <p>
                  Widgets can use CPU, memory, network bandwidth and battery. A
                  name, icon or rating does not verify a creator’s identity.
                  Before previewing or installing a new release, ALTARA shows an
                  access notice. Installation approves running that release on
                  your account’s devices without repeating the notice each time
                  you open Home.
                </p>
                <p>
                  Use Manage widgets to check for updates or uninstall.
                  Uninstalling deactivates the account installation and removes
                  its SDK data on devices when they synchronize; historical
                  installation records can remain for reinstalling and aggregate
                  counts. A creator can remove a listing while keeping existing
                  installations running, or disable that release on connected
                  apps. Uninstalling cannot delete information already sent to
                  another service; contact that service to request deletion.
                </p>
                <p>
                  Use Report widget in its Marketplace page or Manage widgets to
                  send the release, reason and description to ALTARA moderation.
                  Reports are visible to you and ALTARA moderation, not to the
                  widget creator. You can also ask about your data at{" "}
                  <a
                    href="mailto:support@altaraapp.com"
                    className="legal-inline-link"
                  >
                    support@altaraapp.com
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2>Security</h2>
                <p>
                  We use reasonable technical and organizational safeguards
                  designed to protect your information. No system is perfectly
                  secure, but we continuously work to improve protection.
                </p>
              </section>

              <section>
                <h2>Children and minimum age</h2>
                <p className="legal-note">
                  ALTARA is intended for users aged 13 and over. If you are
                  under 18, you should use ALTARA with permission from a parent
                  or legal guardian. If local law requires parental consent for
                  the processing of your personal data, that consent must be
                  provided or authorised by your parent or legal guardian. If we
                  learn that we have collected personal data from a child in a
                  way that is not allowed by law, we will take steps to delete
                  it.
                </p>
              </section>

              <section>
                <h2>Changes to this policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. If we
                  make material changes, we will update the date on this page
                  and may provide additional notice where appropriate.
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
