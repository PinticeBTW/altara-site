# Build your ALTARA widget

Your widget is a website. You control its HTML, CSS, JavaScript, assets and layout. You can use React, Vue or another framework. ALTARA runs fixed HTML releases in a home-screen card. You can still test a live website by its manifest link. ALTARA stores published HTML; it does not run your backend server.

## Quick route: free or paid

1. **Build locally.** Start with this project, customise the name, description, version and icon, then test the interface. The SDK is optional; use its scoped storage only when the widget needs saved data.
2. **Choose what is public.** For a free widget, its working page may be public. For a paid widget, keep the complete source and build on your computer or in a private repository. Public hosting needs only `manifest.json`, an icon and a simple informational entry page on the same HTTPS origin. **A paid widget needs no free version or working demo.** See [Keep the paid build private](#keep-the-paid-build-private).
3. **Load the public manifest.** Sign in to the ALTARA account that will publish the widget. Open **Developer Portal → Widgets → Create & publish**, paste the manifest URL and choose **Load widget**. Loading describes the widget; it does not run it.
4. **Upload and test the fixed release.** Run `npm run build`, then choose the generated `release.html` from your computer in **Upload and test**. The file must be one self-contained HTML document, at most **512 KB**. Accept the access notice and choose **Preview fixed release** to test this exact uploaded file, including its controls, layout and permissions.
5. **Choose the price and publish.** Select **Free → Publish free**, or **One-time purchase**, a EUR price and **Publish paid** after Stripe setup is ready. Read the seller status: a live checkout takes real money. Uploading or publishing does not install or run the widget for users.
6. **Use and share the published widget.** Open its Marketplace page, review access and choose **Add to ALTARA** to install it. The publishing account can use its own paid widget without buying it. Share the Marketplace link; each other account needs its own purchase for paid access.

For a later version, use [Update the same widget project](#update-the-same-widget-project), not a new listing. Buyers keep access to future versions of that same project and choose each update themselves.

## 1. Start locally

Install Node.js 20 or later, unzip this project and open its folder in your editor. Run:

```sh
npm run dev
```

This starter has **no dependencies**, so there is no `npm install` step. In ALTARA, open **Home → Edit widgets → Add widget**. Paste:

```text
http://localhost:5173/manifest.json
```

Choose **Load widget**, read and accept the external-widget notice, then **Open preview**. Edit `index.html`, `style.css` or `widget.js` in your editor. Saving reloads the preview. **Add widget** lets you use it without publishing; keep the local server running while using a localhost widget.

## 2. Make it yours

`manifest.json` tells ALTARA what to open:

```json
{
  "manifest_version": 1,
  "name": "My widget",
  "description": "What it does",
  "version": "1.0.0",
  "entry": "./index.html",
  "icon": "./icon.svg",
  "permissions": ["storage"]
}
```

The optional `icon` is a relative or absolute image URL on the same origin as the manifest. Use a square PNG, WebP or SVG (128 × 128 is a good starting size). ALTARA shows it beside the title and in the Marketplace. Serve icons with `Access-Control-Allow-Origin: *`; they load without cross-origin cookies or a referrer. Missing or broken images use a generic symbol. An icon is decoration, not a verified badge.

Names can have 60 characters and descriptions 240. Use a version such as `1.0.0`. The entry page must be on the same origin (scheme, hostname and port) as the manifest. The manifest is limited to 64 KB. Use `permissions: []` if you do not need ALTARA storage. Unknown permissions are rejected.

Your page can draw any interface, use images, animations and make normal web requests. Adapt it to the card's available width and height with responsive CSS. No ALTARA rendering components are required.

## 3. Optional SDK

The supplied `altara-sdk.js` lets your page save **its own** data, independently for each installation and ALTARA account on this device:

```js
import { altara } from './altara-sdk.js';
await altara.ready;
const value = await altara.storage.get('count'); // null when absent
await altara.storage.set('count', 10);
await altara.storage.delete('count');
```

Declare `storage` in the manifest. Values must be JSON-compatible, within 16 KB per installation. Keys use letters, digits, underscores and hyphens, up to 64 characters. Preview storage is temporary and separate from installed data. These calls are asynchronous and can fail, so handle errors. The bridge accepts up to 60 requests/second. The SDK is optional: a purely visual widget needs no SDK at all.

### Automatic theme appearance

ALTARA supplies one bounded appearance contract to every fixed HTML widget. Standard text, surfaces, controls, typography, borders and focus styling follow the active community theme automatically, including releases created before the appearance SDK existed. A theme author styles the shared contract once instead of writing selectors for every widget. Existing widget HTML and its SHA-256 digest stay immutable; the trusted host applies its own adapter when mounting the verified release.

Appearance changes update styles in place. They do not restart widget code, change its data, fire controls or replace focused inputs. Images, artwork and canvas pixels remain under the widget creator's control. For custom HTML, use `--altara-widget-*` variables with standalone fallbacks. Optional `data-altara-widget-role` values are `surface`, `muted`, `accent`, `success`, `warning` and `danger`. A primary button can use `data-altara-widget-role="accent"`; errors keep `danger` styling instead of inheriting a generic accent.

```css
.summary {
  background: var(--altara-widget-surface, #202020);
  color: var(--altara-widget-text, #f0f0f0);
  border: var(--altara-widget-border-width, 1px) solid var(--altara-widget-border, #444);
  border-radius: var(--altara-widget-radius, 12px);
  padding: var(--altara-widget-spacing, 12px);
}
```

The optional current SDK exposes `altara.appearance.get()` (a synchronous immutable snapshot, initially `null`) and `altara.appearance.subscribe(callback)` (returns an unsubscribe function). Custom canvas/chart code can redraw its palette on those updates without modifying its model or maintaining theme-specific code. When `appearance.active` is false, restore the widget's own defaults. Fixed old SDKs continue to work; normal HTML appearance is supplied separately, but the new optional subscription API requires a creator-approved new release with the current SDK. Localhost/live previews need the current SDK to apply this contract.

Version 1 carries only `active`, `colorScheme`, `colors`, `fontFamily`, `fontSize`, `lineHeight`, `radius`, `spacing`, `controlHeight`, `borderWidth`, `blur`, `shadow`, `reducedMotion` and `reducedTransparency`. The `colors` keys are `background`, `surface`, `surfaceRaised`, `input`, `text`, `muted`, `accent`, `accentText`, `border`, `success`, `warning`, `danger`. CSS variables use kebab case, for example `--altara-widget-accent-text`. Numerical size tokens use pixels and `lineHeight` is unitless. Colors, fonts and ranges are validated by the trusted client; the channel contains no theme CSS, remote URLs, scripts, theme or account identity, messages or credentials. It grants no permissions and is independent of the storage port. Reduced motion and transparency choices remain respected.

The downloadable starter's README includes the complete token contract and an example chart subscription. Keep its updated `altara-sdk.js` when developing. No extra manifest permission, per-theme widget mapping or per-widget CSS from theme creators is needed.

Maintainers: `lib/widgetAppearance.js` owns the trusted validator and adapter. Run `node scripts/sync-widget-appearance.cjs` after changing it; `--check` verifies both standalone SDK copies without writing. Rebuild the starter's `release.html` and `dist` through its existing `node build.mjs` before rebuilding the downloaded ZIP. Appearance source is generated into the SDK; do not hand-edit that marked block or modify previously published releases.

The frame has an isolated origin. App sessions, messages, direct filesystem access, Electron APIs and parent DOM are unavailable through the widget bridge. Cookies and localStorage should not be used for persistence; use the scoped SDK. Camera, microphone, clipboard, popup windows, downloads, top-level navigation and form submissions are not enabled. Fixed releases can fetch HTTPS APIs only with the `network` permission and subject to the browser's CORS rules. Put secret API keys on **your backend**, never in client-side widget files.

The sandbox does not make arbitrary websites trustworthy. A widget can imitate a login, collect anything a user types or explicitly uploads, make network requests and consume resources. Live external websites can change after installation; fixed releases only change when the user chooses an update. Never ask for ALTARA passwords, login codes or payment details. Catalog listings are not security reviews. The installation notice also covers resource usage and impersonation: widgets can consume CPU, memory and battery, and names, logos and ratings are not proof of identity. Icon and manifest requests expose the requesting IP address to their host before the widget runs. Loading a manifest contacts its host; previews only execute after the user accepts the notice and opens them. Installing approves the widget for your account, including other devices. Installed widgets run when their home view is open without another prompt. **Manage widgets → Uninstall** removes the installation from your account. A creator can disable a free release; removing a paid listing from the store preserves authorised buyers' access. Administrative restrictions can pause access, and deleting the creator account can remove hosted access. Supporting browsers additionally use a credentialless iframe; do not rely on that feature being supported everywhere. Content review and complete network isolation are not provided. Fixed releases restrict executable code; external websites do not have that guarantee.

Widgets stop when their home view is closed. Store timestamps rather than relying on a timer running in the background. Because your website code executes in a frame, test its performance and avoid blocking loops.

## 4. Host and publish

For a free widget or an optional public demo, run `npm run build` and upload that project's generated `dist/` directory to your website host. The build also keeps `release.html` at the project root for uploading to ALTARA. For Netlify builds, the included `netlify.toml` sets the command to `npm run build` and publish directory to `dist`; the included `_headers` enables credential-free CORS. For a manual static upload, deploy the contents of `dist/` without another build step. For a paid widget, follow **Keep the paid build private** below before deploying anything.

For a free widget or an optional public demo, you can also upload the static files directly to another host. For this example, upload `index.html`, `style.css`, `widget.js`, `altara-sdk.js`, `icon.svg` and `manifest.json`. The development server is not needed in production. A framework project should upload its built output instead. Any backend, database or paid external API remains your responsibility.

### Keep the paid build private

**A public host exposes the files you deploy.** A complete paid `release.html`, `index.html`, JavaScript bundle, source map or source repository published through GitHub Pages, Netlify or another public host can be downloaded without an ALTARA purchase. Uploading the same file to ALTARA does not remove or protect those public copies. A hard-to-guess URL, disabled directory listing or CORS setting is not purchase protection.

**A private repository does not automatically make its deployed website private.** GitHub Pages can serve a public site from a private repository. Keep paid builds out of any public publishing folder or workflow; a separate public metadata-only folder or repository makes this separation easier to review. Check the deployed URLs while signed out, not just the repository visibility. See [GitHub's publishing warning](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Use this publishing layout for paid widgets:

1. Develop and build the complete paid widget on your computer or in a private repository. Keep the generated paid `release.html` and other complete source/build files out of public repositories and deployments. Do not deploy the entire paid `dist/` directory; the starter's normal build includes complete widget code.
2. Host a public `manifest.json`, icon and simple informational HTML entry page over HTTPS on the same origin. The entry page needs only a description and purchase information, with no working widget or paid scripts; the manifest's `entry` points to it. **No free version is required.** A separate limited working demo is optional. If you choose to offer a public demo `release.html`, build it from the demo only.
3. Load that public manifest in **Developer Portal → Widgets**, then choose the complete paid `release.html` from your computer in **Upload and test**. Use **Preview fixed release** to test the complete private uploaded HTML, choose **One-time purchase** and publish. The public live preview may show only the informational entry page, or your optional demo. ALTARA checks the signed-in account's access before delivering the saved paid HTML.
4. For paid updates, keep the same published manifest and entry identity and upload the new paid HTML file from your computer in **Publish update**. Use **Load release** from a public URL only for code you intend to make public; it is not a private upload channel.
5. Before deploying the public files, inspect their output and repository for complete paid HTML, source files, bundles and source maps. Check public URLs while signed out. If paid code was already public, review the hosting deployment, repository history and caches: removing today's file does not recall downloaded copies or guarantee removal from public Git history or caches. ALTARA does not clean up external hosting or repositories automatically.

The Marketplace sharing link opens a listing; it does not transfer a buyer's licence. Each account still needs its own purchase or authorised creator access to receive the paid release from ALTARA. This protects distribution through ALTARA, not copying after delivery: a licensed buyer receives browser-side HTML and can technically copy it. Keep secrets and private API authorisation on your backend; do not promise copy-proof code or DRM.

The host must:

- Serve the manifest and page over public **HTTPS**, on the same origin.
- Return `Access-Control-Allow-Origin: *` for the manifest and JavaScript modules. The sandbox has an opaque origin, so API endpoints used by the widget must also support appropriate credential-free CORS requests.
- Allow embedding: do not send `X-Frame-Options: DENY` / `SAMEORIGIN`. If using CSP `frame-ancestors`, explicitly allow the ALTARA origins you support. Test both the web app and desktop app.
- Serve the manifest directly, without redirects. No authentication cookies or passwords in URLs.

Paste the public manifest link at **Developer Portal → Widgets**. Then run:

```sh
npm run build
```

Upload the generated `release.html`, test **Preview fixed release**, then choose **Publish free**. To sell a one-time purchase, choose **One-time purchase**, enter a EUR price and complete the payment setup described below. Uploading a file alone never executes it. ALTARA stores the HTML and its SHA-256 digest. New catalog publications require a fixed release; old external installations stay paused until the user accepts a fixed release.

A fixed release is one UTF-8 HTML file, maximum **512 KB**, with inline scripts and styles. Embed images, fonts and media as data URLs. Use `addEventListener` rather than HTML `onclick` attributes. Framework projects need a self-contained bundle with no runtime imports. Remote scripts, frames, workers, eval, WebAssembly and navigation to external pages are blocked. Not every existing website or game can run in this format. The starter build script is for this vanilla example, not a universal bundler.

Fixed releases block HTTP API requests by default. Declare `"network"` alongside `"storage"` in the manifest only if needed, or choose **Internet APIs → Allow HTTPS requests** when publishing an update. This permission permits HTTPS requests subject to CORS and is shown before installation/update; changing it requires a new release and user approval. It gates CSP `connect-src` (fetch, XHR, WebSocket, EventSource and beacons); it is not IP anonymization or a complete firewall for every browser transport, such as WebRTC. Live development previews are not restricted by this permission. Their responses can change; frozen code does not freeze remote data or make the creator trustworthy. API secrets belong on your backend. Icons and manifests are still external metadata and may be requested before installation. Test desktop and web: the fixed document inherits the containing app's content restrictions.

### Update the same widget project

Free and paid widgets use the same update form. **Sign in with the ALTARA account that published the widget**, then:

1. Open **Developer Portal → Widgets → Published widgets → Publish update** on its card (also available inside **Manage publication**). Start from this existing publication; do not create a separate listing for an update.
2. Change and build your widget locally. Keep its saved-data format compatible with the previous version, and test a copy of existing data as well as an empty installation.
3. Enter a version higher than the latest published version, for example **1.0.0 → 1.1.0**. Write **What's new** (10–2,000 characters), including features, fixes and changes to data use. These notes stay attached to this release and are shown before users choose it.
4. Choose the new HTML file from your computer. **For a paid widget, upload the private `release.html`; do not publish that file on GitHub or paste a public download link.** The prefilled release link is optional. Use **Load release** only for free or intentionally public code; that HTTPS link must serve `text/html`, with credential-free CORS and no redirects. A file upload works even when the old host is unavailable.
5. Review the price and **Internet APIs** permission. Enable HTTPS requests only when needed. If you change this permission after loading the file, load the file again before publishing. Permissions belong to the new release and users review them before accepting it.
6. Accept the access notice and choose **Preview update** to test the fixed file, then choose **Publish update**. Confirm the published version in **Published widgets**. Keep your public manifest version and informational page up to date, with the same manifest and entry URLs.

**Changing GitHub, the public page or the manifest alone does not publish an ALTARA update or replace an installed version.** The form keeps the original project's manifest and entry identity automatically, even if the uploaded HTML came from another file or host. Earlier releases remain available under **Earlier versions**; published content cannot be edited in place.

For example, add a **+10** button, build the private file and publish **1.1.0** on the existing widget. Existing buyers do not pay again, even if the new listing price changes. A different publishing account or canonical manifest URL identifies a different project and does not automatically inherit earlier purchases or installations.

### Install an update and keep saved data

Users choose **Manage widgets → Check for updates**, read the notes and permissions, then choose **Update to v…**. Until they accept, they keep the previous version. Publishing never installs or upgrades the widget automatically. The user's chosen version syncs to their other signed-in devices; the widget's SDK data stays on each device.

Updating the same project keeps the installation identity and its local SDK data. **The creator's new code must still read existing data correctly:** keep storage keys compatible, migrate old formats carefully, and do not overwrite existing values with defaults at startup. Preview storage is temporary and separate; previewing alone does not test a user's real saved data. Uninstalling, clearing app/browser data or moving to another device can remove local widget state; purchase access in the account is separate from that state.

Old external installations remain paused until the user chooses a fixed release. Removing a listing keeps existing authorised installations running and paid purchases available for reinstallation. A creator can disable a free release; paid access can be paused by administrative or payment restrictions. Deleting a creator account can remove hosted access. Paused installations retain their local SDK data.

An update must change the saved HTML, permission set or price compared with the project's latest release. A new version number, title or release notes alone do not count. Permission order does not matter. A price change also needs a new version and release notes; published prices cannot be edited in place. The publisher form and database reject unchanged updates. Changes only to permissions still require review before the installed runtime gains or loses access. Reverting to an older implementation is allowed when it differs from the latest release.

Public installations sync with the account. SDK data, layout and localhost installs stay on each device. Fixed release code loads from the saved account copy, without fetching the creator's page or manifest at startup; online API features still need a connection. Public direct links save a fixed test copy; old external installs stay paused until a fixed release is accepted. Additional ALTARA permissions are not available.

## Ratings

Sign in and install the published widget with your account. A localhost preview or direct test copy does not qualify; a paid widget also needs valid purchase access on that account. Open its Marketplace page or **Manage widgets → Rate widget**, choose **1–5 stars** and **Save rating**. You can **Edit rating** or **Remove rating** later. Creators cannot rate their own widgets. Each account has one rating per widget project across its versions.

## One-time purchases

Free publication does not need Stripe. Paid publication requires enabled ALTARA payments and a connected Stripe account whose verification is complete. The portal shows the server-confirmed seller status, commission and whether payments are test or live. Prices are **EUR 0.50–1,000**, with at most two decimal places. Selling does not require ALTARA+.

Choose your actual country from the supported list, then **Connect Stripe account** and finish Stripe's setup on its own website. The seller country is independent of ALTARA+ billing and cannot be changed here after setup begins. Stripe collects verification and bank details; never put these details, passwords or secret API keys inside a widget.

For live sales, ALTARA's commission is **5% of the purchase price**. The creator also pays Stripe processing fees, which vary by payment method, country and account contract. Check the payment breakdown in the creator's Stripe Dashboard; a small purchase can lose a substantial share to a fixed processing fee.

**Observed example, not a universal Stripe tariff:** one €1.00 purchase left **€0.68 for the creator**, **€0.05 for ALTARA**, and **€0.27 in Stripe processing fees**. The €0.32 total fees displayed for that payment already included ALTARA's €0.05; do not deduct it twice. Check each payment's breakdown rather than assuming every €1 sale has the same processing cost. See [Stripe's direct-charge fee explanation](https://docs.stripe.com/connect/direct-charges#collect-fees).

The publishing account can preview and install its own paid widget without a purchase. To test the purchase flow, use a **dedicated ALTARA test environment connected to a Stripe Sandbox**, distinct creator and buyer accounts, and Stripe's test payment details. Test and live purchases are separate. **Do not use a real card in live mode to test the integration.** If the portal only offers live payments, ask ALTARA for the test environment; changing a page or account does not switch the checkout to Sandbox. See [Stripe's testing guide](https://docs.stripe.com/testing).

For a real purchase, sign in to the buying account, choose **Buy** on the website and complete Stripe Checkout. The desktop app opens the trusted ALTARA Marketplace page. If confirmation is pending, choose **Refresh purchase**; do not submit another payment just because the widget is still locked. A successful redirect is not proof of payment: server-confirmed purchase access unlocks the saved release. Review the notice and choose **Add to ALTARA**; buying does not install or run it automatically. **Manage widgets → Purchased · Not installed** shows purchases awaiting installation.

**Buy once for this widget project:** future published versions are included, even after a price change, and the buyer chooses when to install each one. Sharing the Marketplace link does not share the purchase. ALTARA checks each receiving account before serving paid code or accepting an installation. Publicly hosted copies remain outside that check, and a licensed buyer can technically copy the HTML after receiving it; this is access control, not DRM.

Removing a paid listing from the store preserves authorised purchases and reinstallation. A confirmed partial refund keeps access. A confirmed full refund revokes paid access if no other valid purchase grants it; a payment dispute or moderation can pause access separately. Deleting the creator's account can remove hosted access. Connected apps pause restricted installations without deleting their SDK data, while offline cached code cannot be recalled instantly. External API services can also stop working. Keep an editable source backup and do not promise permanent offline access.

### Withdrawals, refunds and purchase problems

Read the [widget withdrawal and refund policy](https://www.altaraapp.com/widget-refunds) before selling or buying. ALTARA offers a **worldwide commercial 14-day withdrawal-request policy**, starting when ALTARA first confirms payment. It does not replace mandatory consumer rights, shorten any statutory period or remove remedies for faulty, misdescribed or undelivered digital content. ALTARA does **not** ask buyers to waive digital-content withdrawal rights. Installing or using a widget alone is not grounds for rejecting a request, and refund review does not use widget activity monitoring.

**For buyers:**

1. Sign in to the buying account and open **Help & refunds** in the Marketplace or the app's widget manager. On the website, you can [open Help & refunds directly](https://www.altaraapp.com/marketplace?view=refunds). Select the purchase and the withdrawal option. Check the purchase, your name and confirmation contact, then confirm the withdrawal. No reason is required for a withdrawal request.
2. Wait for confirmation that the request was recorded, then **download and keep the receipt**. Its original submission time is retained while the request is reviewed. A later decision, escalation or receipt revision does not replace that time. A valid exercise of a statutory withdrawal right does not depend on discretionary approval.
3. Use the same purchase area to report faulty, misdescribed or undelivered content **after the commercial 14-day period as well**. Explain the problem for investigation. This is separate from **Report widget**, which sends a moderation report and does not itself request money back.
4. A decision against your request must include an explanation. Ask ALTARA to review it from the request record, or email **support@altaraapp.com** with the purchase/request reference. If you cannot sign in or submit, you can also send an unambiguous withdrawal statement to that address. Other legally valid ways of exercising statutory rights remain available. Never include card numbers, passwords, login codes or bank credentials.

A recorded or approved request is **not proof that money has been returned**. Request review and Stripe payment status are separate. Where automatic processing is available, the creator reviews the new amount to return and explicitly confirms **Approve and refund** in ALTARA. ALTARA queues that operation with Stripe and verifies its status. An ordinary reply or legacy approval alone moves no funds. Pending, failed or uncertain operations need follow-up, not a second refund in the Dashboard. Refunds return to the original payment method; bank/payment-method processing varies and no instant credit is promised. No punitive refund fee or deduction of processing costs is imposed on a buyer's entitled refund.

Receipts preserve the recorded content of each revision. A request receipt acknowledges the communication; it is not a tax invoice or proof of bank credit. Email confirmation depends on the configured delivery service. Always keep the downloadable receipt and request history. A queued or provider-accepted notification does not prove delivery to your inbox.

**For creators and ALTARA's authorised refund operator:**

1. Open **Buyer requests**; on the website, you can [open Buyer requests directly](https://www.altaraapp.com/developers/widgets?view=seller-requests). Review the purchase and its payment state, then record a decision and any refund amount. Explain a decision against the request and retain the ALTARA escalation route. Do not reject solely because the widget was installed/used, or automatically reject a statutory or fault complaint because the commercial 14 days have elapsed.
2. When automatic processing is available, choose the full or permitted partial refund in **Buyer requests**, review the actual new amount being returned, then explicitly confirm **Approve and refund**. A partial approval is a cumulative target for the purchase: ALTARA shows the increment after earlier confirmed refunds. This final confirmation authorises a financial operation in the correct **TEST/Sandbox or LIVE** environment. An older approval is not automatically executed. Never issue another Dashboard refund while the recorded operation is pending or needs verification.
3. **Automatic refunds also ask Stripe to return ALTARA's proportional application fee.** A full refund returns the original fee collected; partial refunds return the corresponding proportion, rounded to cents and verified against the provider record. This returns money from ALTARA to the creator, not a second refund to the buyer. The buyer refund and fee return have separate statuses. If the fee needs verification, ALTARA follows it up without refunding the buyer again. When automatic processing is unavailable or a legacy approval needs manual execution, an authorised operator must reconcile the original payment, all existing refunds and the fee before using the Dashboard.
4. Follow the recorded operation until Stripe confirms its outcome. A queued or pending refund does not prove success. Confirmed partial refunds keep access; a confirmed full refund revokes paid access if no other valid purchase grants it. If a bank later rejects a previously successful refund, ALTARA must reconcile the payment and any access restriction rather than create another refund blindly. Stripe's processing fees are separate and may remain payable by the creator. Do not claim funds have reached the buyer merely because a request was approved or an email was queued.

Seller, product and support information must be accurate before checkout. A creator username or completed Stripe onboarding alone does not establish the required legal seller disclosures or professional status. Mandatory consumer rights and any applicable legal refund deadline still apply; this commercial policy is not a guarantee of compliance with every country's law.

### If publishing or updating is unavailable

| What you see | What to check |
| --- | --- |
| No fixed release ready | Build and select the complete HTML file again; a manifest alone is not the release. Check the 512 KB limit and supported code restrictions above. |
| Paid publication locked | Check the price, server-confirmed seller status and whether ALTARA payments are enabled. Stripe verification alone does not enable platform payments. |
| Update button unavailable | Use a higher version, add 10–2,000 characters of release notes, and load the HTML after changing permissions. An update must change code, permissions or price. |
| Purchase still pending | Check the signed-in buyer account and choose **Refresh purchase**. A shared link, successful-looking redirect or preview does not grant a purchase. |

## Prompt for your AI coding assistant

> Create an ALTARA hosted widget as an ordinary responsive website. Use the supplied project and manifest.json format (manifest_version 1, name, description, version, entry, permissions). The page and manifest must use the same origin. You may use HTML/CSS/JavaScript or a framework. ALTARA embeds the page in a sandboxed frame; do not access the parent DOM, cookies or localStorage. For optional per-installation persistence, use `import { altara } from './altara-sdk.js'`, await altara.ready, and use async altara.storage.get/set/delete with the storage permission and a 16 KB limit. Produce a self-contained release.html (maximum 512 KB): inline all scripts/styles, embed assets, and use no remote imports, eval, frames, workers or WebAssembly. HTTPS API requests need the network permission and CORS; they must not expose secret keys. npm run dev runs the starter locally with automatic reload. For paid distribution, no free version is required: keep the complete source/build private, upload the paid release.html locally to ALTARA, and publish only the manifest, icon and a simple informational entry page without a working widget or paid scripts. A limited demo is optional; never deploy the entire paid dist directory. Build this widget: [your idea].

## Reporting a widget

Use **Report widget** on its Marketplace detail page or in **Manage widgets**. Choose a reason and explain the issue (10–2,000 characters). ALTARA attaches the exact release/version and creator on the server, then sends it to the existing **Settings → Reports** owner moderation queue. Reports are visible only to their reporter and ALTARA moderation. The existing daily report limit applies. Reporting does not uninstall the widget or automatically punish its creator.
