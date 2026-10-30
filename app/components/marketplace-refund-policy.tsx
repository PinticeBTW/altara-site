import Link from "next/link";
import { SiteFooter } from "./site-chrome";
import { HomeNav } from "./home-nav";

export function MarketplaceRefundPolicy() {
  return (
    <div className="hp editorial ed-support ed-legal">
      <HomeNav active={null} skipToContent />
      <main id="main-content" tabIndex={-1}>
        <section className="ed-page-hero legal-hero">
          <div className="hp-container">
            <span className="ed-eyebrow">
              <span className="dot" /> Widget and theme purchases
            </span>
            <h1>
              Withdrawals and <span className="ed-warm-text">refunds</span>
            </h1>
            <p>
              Find your purchase, send a request and keep a record of what
              happens next.
            </p>
            <div className="legal-meta">
              <span>Last updated: October 15, 2026</span>
            </div>
          </div>
        </section>
        <section className="legal-content-section">
          <div className="hp-container">
            <article className="legal-content">
              <section>
                <h2>Our 14-day commercial withdrawal policy</h2>
                <p>
                  For paid widget and theme purchases, ALTARA offers a worldwide
                  commercial policy allowing you to submit a withdrawal request
                  within 14 days after ALTARA first confirms the payment. You do
                  not need to give a reason. Installing or using the product
                  alone is not grounds for rejecting the request, and ALTARA
                  does not monitor product usage to decide it.
                </p>
                <p>
                  This is an additional commercial policy, not a statement that
                  every country has the same law. Mandatory rights may provide
                  different or longer periods or other remedies. You are not
                  asked to waive digital-content withdrawal rights when buying a
                  widget or theme.
                </p>
              </section>

              <section>
                <h2>Send your request</h2>
                <ol>
                  <li>Sign in to the account that bought the product.</li>
                  <li>
                    Open <strong>Help &amp; refunds</strong> in the Marketplace
                    or the app&apos;s widget or theme manager and select the
                    purchase.
                  </li>
                  <li>
                    Choose the withdrawal option, check the purchase, your name
                    and confirmation contact, then confirm that you want to
                    withdraw. A reason is optional.
                  </li>
                  <li>
                    Wait for confirmation that the request was recorded, then
                    download and keep the receipt.
                  </li>
                </ol>
                <p>
                  The record preserves the original submission and its date and
                  time. A review taking place later does not change when you
                  submitted it. A valid exercise of a statutory withdrawal right
                  does not depend on a discretionary approval. Recording a
                  request does not itself confirm that money has been returned.
                </p>
                <p>
                  If you cannot sign in or submit the form, email{" "}
                  <a
                    href="mailto:support@altaraapp.com"
                    className="legal-inline-link"
                  >
                    support@altaraapp.com
                  </a>{" "}
                  with your purchase reference and an unambiguous statement of
                  what you want to do. You may use another legally valid way of
                  exercising a statutory right. Do not send card numbers,
                  passwords, login codes or bank credentials.
                </p>
                <p>
                  <Link
                    href="/marketplace?view=refunds"
                    className="legal-inline-link"
                  >
                    Widget Help &amp; refunds
                  </Link>
                  {" · "}
                  <Link
                    href="/themes?view=refunds"
                    className="legal-inline-link"
                  >
                    Theme Help &amp; refunds
                  </Link>
                </p>
              </section>

              <section>
                <h2>Faulty, misdescribed or undelivered purchases</h2>
                <p>
                  You can report a purchase problem through{" "}
                  <strong>Help &amp; refunds</strong> after the commercial
                  14-day period as well. Explain what was promised and what went
                  wrong so it can be investigated. A purchase problem is
                  separate from reporting unsafe content for moderation.
                </p>
                <p>
                  Depending on the law that applies, mandatory remedies may
                  include making the content conform, a price reduction or
                  ending the contract and receiving a refund. This policy does
                  not exclude those remedies, turn them into goodwill requests
                  or automatically reject them because the product was used.
                </p>
              </section>

              <section>
                <h2>Review and ask ALTARA for help</h2>
                <p>
                  The creator can review the request in{" "}
                  <strong>Buyer requests</strong>. Review checks the purchase
                  and payment record; it does not automatically approve every
                  request or execute a payment. A decision against a request
                  must include an explanation. You can ask ALTARA to review that
                  explanation through the request record or at{" "}
                  <a
                    href="mailto:support@altaraapp.com"
                    className="legal-inline-link"
                  >
                    support@altaraapp.com
                  </a>
                  .
                </p>
                <p>
                  Keep the original request reference when escalating. A later
                  decision, escalation or receipt revision does not replace the
                  original submission time. There is no penalty for asking for a
                  refund or asserting mandatory consumer rights.
                </p>
              </section>

              <section>
                <h2>When money is returned</h2>
                <p>
                  A request status and a payment status are separate. When
                  automatic refunds are available, the creator reviews the
                  amount and explicitly confirms &quot;Approve and refund&quot;
                  in ALTARA. ALTARA then asks Stripe to process the refund and
                  follows its status. An approval or a processing message is not
                  proof of a completed refund. If an operation is pending or
                  needs verification, do not issue another refund in the Stripe
                  Dashboard; ask ALTARA for help. Older approvals and
                  unavailable automatic processing still need an authorised
                  operator to reconcile the payment before taking any manual
                  action.
                </p>
                <p>
                  Refunds go to the original payment method. Processing depends
                  on the payment method and financial institutions; this policy
                  does not promise an instant credit or replace any applicable
                  legal deadline. The buyer is not charged a punitive fee or
                  made to absorb Stripe processing costs as a deduction from an
                  amount they are entitled to receive.
                </p>
                <p>
                  ALTARA returns the corresponding proportion of its 5%
                  commission on an approved refund, rounded to the
                  currency&apos;s smallest unit. An automatic refund also asks
                  Stripe to return that application fee to the creator. The
                  fee&apos;s confirmed status is tracked separately; if it needs
                  verification, ALTARA follows it up without refunding the buyer
                  again. It is not a second refund to the buyer. Stripe&apos;s
                  own processing fees are separate and may remain payable by the
                  creator.
                </p>
              </section>

              <section>
                <h2>Your access and saved data</h2>
                <p>
                  A confirmed partial refund keeps access to the product. A
                  confirmed full refund revokes paid access if no other valid
                  purchase grants it. An open payment dispute can pause access
                  separately. Moderation or security restrictions can still
                  apply.
                </p>
                <p>
                  A payment restriction retains the installation identity and
                  its local product data. Uninstalling, clearing app or browser
                  data, or moving to another device can remove that local data.
                  Already downloaded offline code cannot be recalled instantly;
                  a refund is not permission to redistribute it or continue
                  using content when your licence has ended.
                </p>
              </section>

              <section>
                <h2>Paid theme access</h2>
                <p>
                  A paid theme is checked against account access before
                  application. When a confirmed restriction removes that access,
                  ALTARA deactivates its styling when the account is verified
                  and keeps the library record. Standard export, editing and
                  automatic theme-folder migration do not detach a paid account
                  theme into an unbound local file. A browser must receive CSS
                  and images to render them; an authorised buyer can still copy
                  delivered content.
                </p>
              </section>

              <section>
                <h2>Receipts and email confirmations</h2>
                <p>
                  Keep the downloadable receipt for your submission and any
                  later decision. Each receipt revision preserves its own
                  recorded content. A request receipt acknowledges the
                  communication; it is not a tax invoice or evidence that the
                  bank has credited a refund.
                </p>
                <p>
                  Email confirmation depends on the configured delivery service.
                  Always keep the downloadable receipt and request history. A
                  queued or provider-accepted notification does not prove
                  delivery to your inbox.
                </p>
              </section>

              <section>
                <h2>For widget and theme creators</h2>
                <p>
                  Check <strong>Buyer requests</strong> and review the purchase
                  and any earlier refunds. If automatic processing is available,
                  review the new amount being returned and confirm{" "}
                  <strong>Approve and refund</strong>. That confirmation
                  authorises a financial operation, including the proportional
                  application-fee return. Follow the recorded payment and fee
                  statuses. A normal reply or a legacy approval alone does not
                  move funds. If processing needs verification, contact ALTARA
                  instead of starting another refund. A bank can report a later
                  failure; ALTARA must reconcile that exception, including any
                  access restriction, before it is resolved.
                </p>
                <p>
                  Provide accurate seller, product, compatibility and support
                  information before purchase. A Stripe account or public
                  profile alone is not a substitute for required seller
                  disclosures. Keep your obligations to the buyer separate from
                  your internal commission or processing costs.
                </p>
                <p>
                  <Link
                    href="/developers/widgets?view=seller-requests"
                    className="legal-inline-link"
                  >
                    Widget Buyer requests
                  </Link>
                  {" · "}
                  <Link
                    href="/developers/themes?view=seller-requests"
                    className="legal-inline-link"
                  >
                    Theme Buyer requests
                  </Link>
                </p>
              </section>

              <section>
                <h2>Other purchases and contact</h2>
                <p>
                  This page concerns one-time widget and theme purchases. Manage
                  an ALTARA+ subscription through its billing portal; see the{" "}
                  <Link href="/terms" className="legal-inline-link">
                    Terms of Service
                  </Link>
                  . For help with a widget or theme purchase, contact{" "}
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
