# Build your ALTARA widget

Your widget is a website. You control its HTML, CSS, JavaScript, assets and layout. You can use React, Vue or another framework. ALTARA runs fixed HTML releases in a home-screen card. You can still test a live website by its manifest link. ALTARA stores published HTML; it does not run your backend server.

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

The frame has an isolated origin. App sessions, messages, direct filesystem access, Electron APIs and parent DOM are unavailable through the widget bridge. Cookies and localStorage should not be used for persistence; use the scoped SDK. Camera, microphone, clipboard, popup windows, downloads, top-level navigation and form submissions are not enabled. Fixed releases can fetch HTTPS APIs only with the `network` permission and subject to the browser's CORS rules. Put secret API keys on **your backend**, never in client-side widget files.

The sandbox does not make arbitrary websites trustworthy. A widget can imitate a login, collect anything a user types or explicitly uploads, make network requests and consume resources. Live external websites can change after installation; fixed releases only change when the user chooses an update. Never ask for ALTARA passwords, login codes or payment details. Catalog listings are not security reviews. The installation notice also covers resource usage and impersonation: widgets can consume CPU, memory and battery, and names, logos and ratings are not proof of identity. Icon and manifest requests expose the requesting IP address to their host before the widget runs. Loading a manifest contacts its host; previews only execute after the user accepts the notice and opens them. Installing approves the widget for your account, including other devices. Installed widgets run when their home view is open without another prompt. **Manage widgets → Uninstall** removes the installation from your account. The creator can also disable Marketplace installations of a release. Supporting browsers additionally use a credentialless iframe; do not rely on that feature being supported everywhere. Content review and complete network isolation are not provided. Fixed releases restrict executable code; external websites do not have that guarantee.

Widgets stop when their home view is closed. Store timestamps rather than relying on a timer running in the background. Because your website code executes in a frame, test its performance and avoid blocking loops.

## 4. Host and publish

Run `npm run build` and upload the generated `dist/` directory to your website host. The build also keeps `release.html` at the project root for uploading to ALTARA. For Netlify builds, the included `netlify.toml` sets the command to `npm run build` and publish directory to `dist`; the included `_headers` enables credential-free CORS. For a manual static upload, deploy the contents of `dist/` without another build step.

You can also upload the static files directly to another host. For this example, upload `index.html`, `style.css`, `widget.js`, `altara-sdk.js`, `icon.svg` and `manifest.json`. The development server is not needed in production. A framework project should upload its built output instead. Any backend, database or paid external API remains your responsibility.

The host must:

- Serve the manifest and page over public **HTTPS**, on the same origin.
- Return `Access-Control-Allow-Origin: *` for the manifest and JavaScript modules. The sandbox has an opaque origin, so API endpoints used by the widget must also support appropriate credential-free CORS requests.
- Allow embedding: do not send `X-Frame-Options: DENY` / `SAMEORIGIN`. If using CSP `frame-ancestors`, explicitly allow the ALTARA origins you support. Test both the web app and desktop app.
- Serve the manifest directly, without redirects. No authentication cookies or passwords in URLs.

Paste the public manifest link at **Developer Portal → Widgets**. Then run:

```sh
npm run build
```

Upload the generated `release.html`, test **Preview fixed release**, then choose **Publish free**. Uploading a file alone never executes it. ALTARA stores the HTML and its SHA-256 digest. New catalog publications require a fixed release; old external listings cannot be installed until the creator publishes a fixed release.

A fixed release is one UTF-8 HTML file, maximum **512 KB**, with inline scripts and styles. Embed images, fonts and media as data URLs. Use `addEventListener` rather than HTML `onclick` attributes. Framework projects need a self-contained bundle with no runtime imports. Remote scripts, frames, workers, eval, WebAssembly and navigation to external pages are blocked. Not every existing website or game can run in this format. The starter build script is for this vanilla example, not a universal bundler.

Fixed releases block HTTP API requests by default. Declare `"network"` alongside `"storage"` in the manifest only if needed, or choose **Internet APIs → Allow HTTPS requests** when publishing an update. This permission permits HTTPS requests subject to CORS and is shown before installation/update; changing it requires a new release and user approval. It gates CSP `connect-src` (fetch, XHR, WebSocket, EventSource and beacons); it is not IP anonymization or a complete firewall for every browser transport, such as WebRTC. Live development previews are not restricted by this permission. Their responses can change; frozen code does not freeze remote data or make the creator trustworthy. API secrets belong on your backend. Icons and manifests are still external metadata and may be requested before installation. Test desktop and web: the fixed document inherits the containing app's content restrictions.

To update an existing project, open **Developer Portal → Widgets → Published widgets → Publish update** on its card (also available inside **Manage publication**). The form keeps the title and description, suggests a newer version, and fills in the project’s `release.html` link. Build your changed widget, then choose **Load release** to fetch the HTML from that link, paste a new HTTPS release link, or choose the HTML file from your computer. Links must serve `text/html` with credential-free CORS and without redirects; file upload works when the host is unavailable. Loading a release validates it without executing it. Write **What’s new** for every update (10–2,000 characters): describe the features, fixes and any changes to data use. These notes are required by the server, stay attached to that release, and are shown before users decide to install it. You can accept the notice and preview it before choosing **Publish update**.

ALTARA saves a new fixed release under the same project, even when the HTML came from a different link. The original manifest and entry identity is retained automatically so existing installations can find the update; you do not need to create another listing. Earlier releases remain accessible under **Earlier versions**. Published content cannot be edited in place. Users choose **Manage widgets → Check for updates → Update to v…**. Their installation identity and SDK data are retained. Other devices receive that user’s chosen version; publishing alone never upgrades them. Old external installations are paused until the user chooses a fixed release; their saved data is retained. Removing a listing keeps its installations running; disabling a release stops them on connected apps without deleting their data.

Public installations sync with the account. SDK data, layout and localhost installs stay on each device. Fixed release code loads from the saved account copy, without fetching the creator's page or manifest at startup; online API features still need a connection. Adding a public manifest link for testing fetches a self-contained release.html from the same directory and saves a fixed device-local copy. Missing or invalid releases are rejected; there is no live fallback. Explicit previews and localhost development can still follow hosted changes. Sales and additional ALTARA permissions are not available.

## Prompt for your AI coding assistant

> Create an ALTARA hosted widget as an ordinary responsive website. Use the supplied project and manifest.json format (manifest_version 1, name, description, version, entry, permissions). The page and manifest must use the same origin. You may use HTML/CSS/JavaScript or a framework. ALTARA embeds the page in a sandboxed frame; do not access the parent DOM, cookies or localStorage. For optional per-installation persistence, import altara from altara-sdk.js, await altara.ready, and use async altara.storage.get/set/delete with the storage permission and a 16 KB limit. Produce a self-contained release.html (maximum 512 KB): inline all scripts/styles, embed assets, and use no remote imports, eval, frames, workers or WebAssembly. HTTPS API requests need the network permission and CORS; they must not expose secret keys. npm run dev runs the starter locally with automatic reload. Build this widget: [your idea].

## Reporting a widget

Use **Report widget** on its Marketplace detail page or in **Manage widgets**. Choose a reason and explain the issue (10–2,000 characters). ALTARA attaches the exact release/version and creator on the server, then sends it to the existing **Settings → Reports** owner moderation queue. Reports are visible only to their reporter and ALTARA moderation. The existing daily report limit applies. Reporting does not uninstall the widget or automatically punish its creator.
