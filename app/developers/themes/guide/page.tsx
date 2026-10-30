import type { Metadata } from 'next';
import Link from 'next/link';
import { DeveloperSpace } from '../../components/developer-space';
import '../../../themes/themes.css';

export const metadata: Metadata = {
  title: 'Build an ALTARA theme',
  description: 'Create an ALTARA theme with CSS, test it locally and publish a free or paid version with account access and optional updates.',
  alternates: { canonical: '/developers/themes/guide' },
};

const metadataExample = `{
  "format": "altara-theme",
  "apiVersion": 2,
  "name": "My ALTARA theme",
  "author": "Your display name",
  "version": "1.0.0",
  "description": "Soft surfaces and my own accent."
}`;
const cssExample = `:root {
  --my-accent: #a9ccff;
  --my-surface: rgba(24, 33, 44, .72);
}
.app {
  --altara-accent: var(--my-accent);
  --ui-primary-bg: var(--my-accent);
  --altara-widget-accent: var(--my-accent);
  --altara-widget-surface: var(--my-surface);
  --altara-widget-input: #141d29;
  --altara-widget-text: #edf4ff;
  --altara-widget-muted: #afbfce;
  --altara-widget-radius: 18px;
  --altara-widget-spacing: 16px;
  --altara-widget-blur: 12px;
}
[data-theme-slot="widget-card"] {
  background-color: var(--my-surface);
  border: 1px solid rgba(210, 230, 255, .16);
  border-radius: 18px;
  backdrop-filter: blur(12px);
}
@media (prefers-reduced-transparency: reduce) {
  [data-theme-slot="widget-card"] {
    background-color: #18212c;
    backdrop-filter: none;
  }
}`;
const shellLayoutExample = `:root {
  --altara-shell-layout: regions-v1;
  --altara-shell-areas:
    "search servers profile"
    "navigation main context"
    "voice main context";
  --altara-shell-columns: navigation content context;
  --altara-shell-rows: header content voice;
}

@media (min-width: 800px) and (max-width: 1199px) {
  :root {
    --altara-shell-layout: regions-v1;
    --altara-shell-areas:
      "search servers profile"
      "navigation main context"
      "voice main context";
    --altara-shell-columns: 220px content 220px;
    --altara-shell-rows: header content voice;
  }
}

/* Keep base colors usable on clients without this capability. */
.app[data-altara-shell-layout="regions-v1"] #leftGroupsRail {
  gap: 8px;
}`;

export default function ThemeProgrammingGuide() {
  return <DeveloperSpace active="themes">
    <div className="developerSpaceIntro themeGuideIntro">
      <p className="developerSpaceEyebrow">YOUR EDITOR. YOUR STYLE.</p>
      <h1>Build an ALTARA theme.</h1>
      <p>Write CSS for the real app surfaces. Keep your source files on your computer, test your package in ALTARA, then share a version with the community.</p>
    </div>
    <div className="themeWebsiteLinks">
      <a className="themePrimaryLink" href="/theme-assets/theme/community-theme-starter-kit.zip" download>Download source kit ↓</a>
      <Link href="/developers/themes">My theme projects →</Link>
      <Link href="/themes">Explore themes ↗</Link>
    </div>
    <div className="themeGuideLayout">
      <nav className="themeGuideContents" aria-label="Guide contents">
        <span>IN THIS GUIDE</span>
        <a href="#start">01 · Start with files</a><a href="#style">02 · Style native surfaces</a>
        <a href="#build">03 · Build and validate</a><a href="#test">04 · Test in ALTARA</a>
        <a href="#publish">05 · Publish a version</a><a href="#selling">Sell and protect paid files</a><a href="#updates">Updates and ratings</a><a href="#refunds">Refunds and fees</a><a href="#limits">06 · Know the boundaries</a><a href="#safety">07 · Install with care</a>
      </nav>
      <article className="themeGuideArticle">
        <section id="start">
          <span className="themeGuideStep">01 / SOURCE</span><h2>Two files to make your theme.</h2>
          <p>Extract the source kit and open it in your code editor. Change <code>metadata.json</code> for the name, version and description; change <code>theme.css</code> for the appearance. The kit includes the same local validator ALTARA uses, its license notices and a ready-to-import example. No package installation is needed; the command tool needs Node.js 22 or later.</p>
          <div className="themeGuideFilePair"><div><h3>metadata.json</h3><pre><code>{metadataExample}</code></pre></div><div><h3>theme.css</h3><pre><code>{cssExample}</code></pre></div></div>
          <p>The <code>author</code> field is a display label. When you publish, the website uses the owner of your signed-in project as the verified creator.</p>
        </section>
        <section id="style">
          <span className="themeGuideStep">02 / APPEARANCE</span><h2>Style what the app actually supports.</h2>
          <p>Use ordinary CSS, custom properties, local font stacks, spacing, sizes, borders and materials for the appearance. API 2 also supports a native-region plan for the whole app shell: choose a side rail, horizontal server header, profile placement or a mirrored arrangement. Apply transparency to backgrounds so text and icons stay readable. A design inspired by another app changes ALTARA&apos;s presentation; it does not create that app&apos;s features or promise identical behavior.</p>
          <div className="themeGuideTableWrap"><table><thead><tr><th>What you want to change</th><th>Start here</th></tr></thead><tbody>
            <tr><td>Colors and typography</td><td><code>.app</code>, <code>--altara-accent</code>, <code>--altara-text</code>, <code>--altara-text-muted</code></td></tr>
            <tr><td>App panels and structure</td><td><code>.app</code>, <code>.panel.left</code>, <code>.panel.mid</code>, <code>.panel.right</code></td></tr>
            <tr><td>Server navigation and folders</td><td><code>.leftDockGroups</code>, <code>#leftGroupsRail</code>, <code>.groupOrbFolderStack</code></td></tr>
            <tr><td>Your profile and audio controls</td><td><code>#meProfileCard</code>, <code>.meControls</code>; keep <code>#voiceMiniDockSlot</code> reachable</td></tr>
            <tr><td>Widget cards and spacing</td><td><code>[data-theme-slot=&#34;widget-card&#34;]</code>, <code>widget-title</code>, <code>widget-grid</code></td></tr>
            <tr><td>Conversation surfaces</td><td><code>.dmHeader</code>, <code>.dmComposer</code>, <code>#dmMain</code>, <code>#botDmMain</code></td></tr>
            <tr><td>Native Home composition</td><td><code>home-hero</code>, <code>home-servers</code>, <code>home-messages</code>, <code>home-focus</code></td></tr>
          </tbody></table></div>
          <p>Use the full attribute selector for each slot, for example <code>[data-theme-slot=&#34;home-focus&#34;]</code>. Home slots appear when the corresponding native presentation is active.</p>
          <h3 id="shell-layout">Arrange seven native regions.</h3>
          <p><strong>Requires ALTARA 0.1.157 or later.</strong> Put these four custom properties together in one <code>:root</code> rule. New examples use API 2; the same CSS-only contract works in supported API 1 packages within their size limits. ALTARA validates the complete plan and its own bridge places the existing regions. You choose their positions, rectangular spans and tracks; the app keeps the original nodes, actions, data, keyboard controls, server folders, drag/drop and voice state.</p>
          <pre><code>{shellLayoutExample}</code></pre>
          <div className="themeGuideTableWrap"><table><thead><tr><th>Region</th><th>What stays native</th></tr></thead><tbody>
            <tr><td><code>servers</code></td><td>Server rail, folders, creation and navigation</td></tr>
            <tr><td><code>search</code></td><td>Search control</td></tr>
            <tr><td><code>navigation</code></td><td>Friends, DMs or server channels</td></tr>
            <tr><td><code>main</code></td><td>Home, conversation or selected main view</td></tr>
            <tr><td><code>context</code></td><td>Active friends, members or the current side panel</td></tr>
            <tr><td><code>profile</code></td><td>Your profile, status, audio and settings controls</td></tr>
            <tr><td><code>voice</code></td><td>Voice mini dock when a call is active</td></tr>
          </tbody></table></div>
          <p>Every plan must contain all seven names, with each forming a rectangle. Include an unconditional base plan and at most 16 complete plans in total. Use 1–6 rows and columns, matching the track counts to the quoted matrix; <code>.</code> may mark an empty cell. Tracks accept the semantic tokens <code>rail navigation content context controls header voice auto</code>, pixels from <code>40px</code> to <code>640px</code>, or fractions from <code>0.25fr</code> to <code>4fr</code>. Prefer semantic tracks where native sidebar preferences and resizing should determine the size. No <code>var()</code>, <code>calc()</code> or internal host variables in these four fields.</p>
          <p>ALTARA enforces usable region minima, including during native resizing: at least 240 × 240px for <code>main</code>, 220 × 64px for <code>profile</code> and 72 × 72px for <code>servers</code>. A small pixel or fraction request cannot shrink them below those limits. The host can enlarge constrained tracks, use its compact arrangement or scroll when the available space cannot fit the requested composition.</p>
          <p>A width <code>@media</code> override must contain another complete four-property <code>:root</code> plan, for example inside <code>@media (min-width: 1280px)</code>. Width conditions accept pixel values from 0 to 16384. At 760px and below, ALTARA uses a host-owned compact arrangement instead of the desktop matrix. Native collapse, drawer and context visibility remain authoritative; a plan cannot force an inactive panel or call to appear. Authentication, protected settings and sensitive decisions can temporarily return to the native composition. Window controls retain their reserved space.</p>
          <p>The host can also choose its compact arrangement if a desktop plan and the current sidebar preferences leave too little usable room. The complete 800–1199px variant above requests 220px side regions instead. Test such variants with real content; a valid matrix is not proof that every size fits.</p>
          <p>Use <code>.app[data-altara-shell-layout=&#34;regions-v1&#34;]</code> to gate structural decoration; the host owns that marker and the effective <code>--altara-native-shell-active</code> state. Do not set them yourself, reparent nodes, use <code>display: contents</code>, or recreate the shell with fixed/absolute overlays. Older clients keep the normal layout and your ordinary color/surface styling. The official builder rejects invalid plans before writing; if a plan cannot be used at runtime, the host keeps or restores its own composition.</p>
          <p>The source kit contains three original examples under <code>examples/community-themes/shell-regions</code>: a Discord-inspired lateral rail, a Root-inspired horizontal header and a mirrored custom plan. They illustrate composition, not copied assets or replacement product features. The JSON <code>layout</code> field described below remains a separate choice of native Home presenter.</p>
          <p>Themes cannot supply arbitrary HTML, run JavaScript, add product features or replace native actions. Isolated widget contents and protected native decisions keep their own boundaries. Test the built package with normal and reduced motion; the host suspends native panel entry animations while a community theme is active, but author-created transforms and filters still need care.</p>
          <p>For styling changes, prefer the native widget columns. If you change their count, set <code>--widgets-cols</code> to the same whole number (1–12) as <code>grid-template-columns</code>, including at each responsive breakpoint. ALTARA uses that count when placing and resizing cards. Preserve the user&apos;s saved order, sizes and widget data; do not clear them to make a theme fit.</p>
          <pre><code>{`.widgetsGrid { --widgets-cols: 2;
  grid-template-columns: repeat(2, minmax(0, 1fr)); }`}</code></pre>
          <p>Define <code>--altara-widget-*</code> values once on <code>.app</code> to give native and community widgets a common palette, controls, typography and material. New supported widgets inherit that appearance; you do not write a rule for every widget. Changing the theme updates styling in place and preserves widget actions and data.</p>
          <p>Standard HTML adapts automatically, including installed fixed HTML releases with older SDKs. Widget creators mark custom surfaces with <code>data-altara-widget-role</code> or use the shared <code>altara.appearance</code> API once for canvas charts and custom components. Images and arbitrary graphics keep their content. Live external development widgets need the current SDK.</p>
          <p>Leave <code>layout</code> out to keep the normal Home. API 2 can request <code>&#34;layout&#34;: &#34;dashboard&#34;</code> or <code>&#34;layout&#34;: &#34;glass-home&#34;</code> in the metadata. This field selects only existing native Home presentations with real app data and actions; it is not a general shell-placement API. CSS can arrange existing regions and Home slots responsively while preserving the user&apos;s saved widget records.</p>
          <p>For glass, start with translucent backgrounds and <code>backdrop-filter: blur(12px)</code>. API 2 also supports <code>theme-filter(liquid-glass)</code>, ALTARA&apos;s fixed native material. Include reduced transparency and motion alternatives; appearance varies with the background and browser.</p>
          <p>API 2 accepts validated embedded PNG, JPEG or WebP images. Reference an asset with <code>theme-asset(asset-name)</code>; external image and font URLs are blocked. Use local font stacks such as <code>&#34;Segoe UI&#34;, system-ui, sans-serif</code>.</p>
        </section>
        <section id="build">
          <span className="themeGuideStep">03 / PACKAGE</span><h2>Build a portable theme file.</h2>
          <p>From the extracted kit folder, run these commands. The tool validates before writing and prints the package version, size and SHA-256. It refuses to overwrite an existing output: use a new filename after edits.</p>
          <pre><code>{`node scripts/theme-package.mjs --build metadata.json theme.css my-theme-1.0.0.altara-theme.json
node scripts/theme-package.mjs --check my-theme-1.0.0.altara-theme.json`}</code></pre>
          <p>The result is a single UTF-8 <code>.altara-theme.json</code> file containing your metadata, CSS and optional embedded assets. Do not upload the source ZIP. You can also edit the <a href="/theme-assets/theme/community-theme-starter.altara-theme.json" download>ready-made JSON starter</a> directly; uploading a JSON package to My theme projects validates it without needing the command tool.</p>
        </section>
        <section id="test">
          <span className="themeGuideStep">04 / TEST</span><h2>Import first. Activate when ready.</h2>
          <ol><li>In ALTARA, open <strong>Settings → Appearance → Community themes → Import theme</strong>.</li><li>Select the built <code>.altara-theme.json</code>. It is validated and added to your local library; importing does not activate it.</li><li>Choose <strong>Activate</strong> on its card. On desktop you can also copy packages into the account&apos;s theme folder shown in Appearance.</li><li>Check Home, human and bot chats, menus, long names, narrow windows, keyboard focus and accessibility preferences.</li></ol>
          <p>Deactivate from Appearance to return to the base appearance. If your CSS makes navigation unusable, <strong>Ctrl+Alt+Shift+T</strong> removes the active styling independently of the layout. Keep an editable source copy outside the theme folder.</p>
          <p>The browser app keeps a browser-local library; it does not read your desktop folder. Imported copies stay on your device and do not change when a creator publishes a newer release.</p>
          <p>The isolated preview uses fictional navigation, profile and conversation data. It does not exercise your account or prove that startup animations, calls, folders and every window size work. Before publishing, test the built package in ALTARA:</p>
          <ul>
            <li>Start the app with normal motion and again with reduced motion; check both the initial and settled layout. Keep the real bootstrap and its body classes. A fixture forced into a motion-off state does not cover normal startup.</li>
            <li>Reopen the app and Appearance, deactivate and reactivate, resize the window and collapse or expand both sidebars. Check every authored breakpoint and the native compact fallback at 760px and below. Exercise actual sidebar resizing and saved preferences, long names, menus, keyboard focus, desktop window controls and the complete composer.</li>
            <li>Check the server rail with no memberships, during loading and when memberships arrive after startup. Keep native navigation and creation controls reachable; exercise drag/drop, folders, reverse/RTL flows and tooltips.</li>
            <li>Check Home, human and bot chats, server channels and an active voice mini dock. Verify that deactivation and <strong>Ctrl+Alt+Shift+T</strong> restore the base composition without changing messages or widget records.</li>
          </ul>
          <p>Protected native dialogs temporarily restore the native appearance so theme styling cannot change the decision you are making. Test those decisions in the app as well.</p>
        </section>
        <section id="publish">
          <span className="themeGuideStep">05 / COMMUNITY</span><h2>A private draft becomes a public release.</h2>
          <ol><li>Open <Link href="/developers/themes">My theme projects</Link> and sign in with your normal ALTARA account. No ALTARA+ is required.</li><li>Upload the built JSON package. Check its validation result and use <strong>Preview package</strong>; the preview uses fictional data in an isolated frame.</li><li>Choose <strong>Save private draft</strong>; only your account can edit it.</li><li>Choose <strong>Publish version…</strong>. Select <strong>Free</strong> or <strong>One-time purchase</strong>; for a paid theme, enter the EUR price and complete <strong>Set up Stripe seller account</strong> if shown. Add a presentation image and release notes, review the version, price and your publishing rights, then choose <strong>Publish version</strong>.</li><li>The listing appears in <Link href="/themes">Themes</Link>. Free packages can be downloaded. A paid package is delivered only to its creator or an account with access; other visitors see the listing and screenshots.</li></ol>
          <p>For an update, edit the source, increase <code>version</code>, build a new file and use <strong>Replace draft package</strong> in the same project. Publishing creates a new immutable release; an earlier version&apos;s bytes do not change. Downloads and activation remain separate choices.</p>
          <p>If publication or the catalogue is unavailable, keep your local files and retry later. A failed upload or publication must not be treated as a successful release.</p>
        </section>
        <section id="selling">
          <h2>Publish a paid theme without a public copy.</h2>
          <p>Keep your complete CSS, images, JSON package and source repository on your computer or in private storage. Upload the finished <code>.altara-theme.json</code> directly to ALTARA. A free version or working demo is not required. Public screenshots and listing details explain what buyers receive.</p>
          <p>Do not upload the paid package to a public GitHub repository, Pages site, release or preview. Deleting a public file later does not remove repository history, old deployments, caches or copies. Sharing your ALTARA listing does not transfer a purchase to another account.</p>
          <p>Paid theme sales require enabled ALTARA payments and a verified Stripe seller account in a supported country. Use your real country in the seller setup. An existing eligible ALTARA seller account is reused. Review the supported-country list and status in the portal; free publication does not require Stripe.</p>
          <p>The buyer signs in, checks the price and purchase notices, and completes Stripe Checkout. A confirmed purchase gives that account access to the same theme project and its later published versions. Buying does not install or apply CSS. On the listing, choose <strong>Install</strong>, then <strong>Open ALTARA</strong>. In <strong>Settings → Appearance → Community themes</strong>, choose <strong>Activate</strong> on the installed theme. The creator can install their own paid theme without buying it.</p>
          <p>Paid account themes retain their project and purchase binding. They are not automatically exported to the editable theme folder, and the normal library export and edit controls do not detach them into local files. The browser must receive CSS and images to render a theme, so an authorised buyer can still copy delivered content. ALTARA does not promise copy-proof browser DRM.</p>
        </section>
        <section id="updates">
          <h2>Keep the project. Publish a new version.</h2>
          <p>For an update, edit the source, increase <code>version</code>, build a new complete JSON file and replace the private draft in the existing project. Include useful release notes and review the price before publishing. Each release keeps its own immutable bytes and price. Updating a GitHub file alone does not publish an ALTARA release.</p>
          <p>Existing buyers do not pay again for later versions of the same project. A separate project or another creator does not inherit the purchase. Account-library users review the new version and explicitly accept the update; their current version remains selected until they choose otherwise. A free local file copy does not update automatically.</p>
          <p>For an account theme, open <strong>Settings → Appearance → Community themes → My account themes</strong> and choose <strong>Review v…</strong> on its card. Read the notes, use <strong>Preview update</strong>, tick the update confirmation and choose <strong>Accept update</strong>. <strong>Keep current version</strong> leaves your installed version in place. When accepted in ALTARA, an active theme stays active; an inactive theme remains inactive. For a local file, import the newer package and activate it separately.</p>
          <p>Free themes also offer <strong>Install</strong> when signed in, for an installation linked to your account. <strong>Download theme</strong> followed by <strong>Import theme</strong> creates a local copy instead; importing alone does not create the account installation used for ratings and account updates.</p>
          <p>People with an eligible account installation can rate the project from 1 to 5 stars. Open <strong>Details, rating &amp; updates</strong> on its Appearance card, choose stars under <strong>Your rating</strong> and choose <strong>Save rating</strong>. They can later edit or remove their own rating. Creators cannot rate their own themes. Ratings are not a safety certification or a substitute for checking compatibility.</p>
        </section>
        <section id="refunds">
          <h2>Know the fees and refund process before selling.</h2>
          <p>ALTARA takes a 5% commission. Stripe processing fees are separate and paid by the creator; a confirmed sale does not mean an instant payout to a bank. See the verified account&apos;s Stripe balance and payout schedule for availability.</p>
          <p>Buyers can submit withdrawal within 14 days worldwide, including after installing or applying a theme. Applicable rights for faults, non-conformity or other remedies can be raised later. ALTARA does not monitor how long someone uses a theme to automatically reject a request.</p>
          <p>In <strong>Buyer requests</strong>, the creator reviews the case and explicitly confirms the exact new amount with <strong>Approve and refund</strong>. ALTARA asks Stripe to return it to the original payment method and return the proportional ALTARA commission. Stripe&apos;s original processing fees may remain payable by the creator. A queued instruction or approval is not a completed refund; follow the recorded status and contact support if it needs verification instead of creating another refund.</p>
          <p>A confirmed partial refund keeps theme access. A confirmed full refund ends paid access when no other valid purchase grants it, and the app deactivates the paid theme when it verifies that restriction. The library record is kept. Offline copies cannot be recalled instantly.</p>
          <p><Link href="/theme-refunds">Read the complete theme withdrawal and refund policy →</Link></p>
        </section>
        <section id="limits">
          <span className="themeGuideStep">06 / BOUNDARIES</span><h2>Presentation belongs to the theme. Behavior belongs to ALTARA.</h2>
          <p>Themes cannot execute JavaScript, supply arbitrary HTML, add product actions, read messages or credentials, access Electron or grant permissions. Authentication, settings, confirmations, recording indicators and recovery stay under ALTARA&apos;s control. Styling may pause while sensitive native surfaces are open.</p>
          <ul><li>API 1 and 2 are supported. CSS is limited to 96 KiB. API 1 packages are limited to 128 KiB; API 2 to 1.5 MiB.</li><li>Images: static PNG/JPEG/WebP only; up to 512 KiB each, 1 MiB combined, 4096 px per side and 12 megapixels. SVG, GIF and animated images are rejected.</li><li><code>@import</code>, <code>@font-face</code>, external URLs, generated text, arbitrary keyframes and animations are blocked. Transitions must have explicit durations up to two seconds.</li><li>Use <code>:root</code> only for custom properties. ALTARA parses and scopes accepted CSS; do not package already-compiled scoped CSS.</li></ul>
          <p><a href="/theme-assets/docs/COMMUNITY_THEMES_V1.md">Read the complete package contract ↗</a> for all stable slots, native tokens, image rules, compatibility and examples.</p>
        </section>
        <section id="safety">
          <span className="themeGuideStep">07 / INSTALL WITH CARE</span><h2>Validation reduces risk. It does not guarantee safety.</h2>
          <p>ALTARA themes are presentation packages: CSS, supported native layout options and validated embedded images. The importer rejects JavaScript, arbitrary HTML, external resource URLs and remote font imports. The preview is isolated and cannot run theme scripts. These protections limit what a package can do; they are not an antivirus scan or proof that a creator is trustworthy.</p>
          <p>A theme can still make ordinary screens misleading or unreadable, hide controls or slow the app with costly visual effects. Bugs in the validator, ALTARA or the browser&apos;s image and rendering code also remain possible. Native authentication, settings, confirmations and recovery are protected from community styling, but no community package should be described as risk-free. Appearing in the catalogue is not a security certification.</p>
          <ul>
            <li>Install a free or paid theme with your account, or download and import a free <code>.altara-theme.json</code> version. A theme does not require an <code>.exe</code>, shell script, browser extension or separate installer.</li>
            <li>Do not provide passwords or account tokens, grant administrator access, disable antivirus or run terminal commands to activate a downloaded theme. Creators building their own source kit use the documented build tool; installing a finished theme does not need it.</li>
            <li>Check the creator, description and screenshots, and preview before activating. Keep ALTARA and your browser updated. Review a new version before choosing to install it.</li>
            <li>If the interface becomes suspicious or unusable, deactivate the theme in <strong>Settings → Appearance</strong>, or press <strong>Ctrl+Alt+Shift+T</strong>. If local storage fails, this shortcut removes styling for the current session; the saved selection may return on restart.</li>
            <li>Report suspicious listings through <strong>Report</strong> on the theme&apos;s detail page. Reporting is separate from deactivating your local copy.</li>
          </ul>
          <p>Widgets have a separate execution and permission model. A theme changing a widget&apos;s appearance does not grant new permissions; do not assume an executable community widget has the same restrictions as a CSS-only theme.</p>
        </section>
      </article>
    </div>
  </DeveloperSpace>;
}
