# ALTARA Community Themes — APIs 1 and 2

Community themes are CSS packages that change the app's appearance and layout. They are a local layer over the existing Appearance settings, not a replacement for your account, messages or built-in palette editor.

Themes are authored with code in an external editor. The app imports validated files and lists themes for activation; discovery and publication belong to the website. Follow the publishing workflow below and test the built package in the app version you support.

## Try a theme

Download a `.altara-theme.json` file from the website's **Themes** catalogue. Open **Settings → Appearance → Community themes → Import theme**, or copy the file into the account's theme folder shown in Appearance. Files are validated before use. Importing does not activate the package; choose **Activate** on its card. Existing API 1 and API 2 files remain supported.

On desktop, the folder is inside ALTARA's user data directory at `themes/<account UUID>`. Its actual path is shown in the app; it differs by operating system and account. Only theme JSON files are read. The web app uses a browser-local library and does not claim access to this desktop folder. Themes and selection remain separate from messages and widget records.

Website previews use fictional data in an isolated frame. They do not display your conversations or modify ALTARA. Native-layout packages use the actual Home presenter with fictional data; other packages preview a sample chat. The sample is not an exact copy of every server, bot, call and settings surface.

Use **Deactivate** on the active theme's card in Appearance to restore the base appearance. There is no floating deactivation button. **Ctrl+Alt+Shift+T** remains an independent keyboard escape, including when a theme has hidden the main layout. If storage is unavailable, recovery still removes styling for that session; the previous saved selection may return after restart. **Explore themes** beside **Import theme** opens the website catalogue; it does not open a catalogue inside the app.

Themes and the selected install are stored separately for each signed-in account on this device. Changing accounts removes the current styling and closes editors. Returning to the account restores its saved selection. Imports do not select an account or overwrite another install.

## Package format

Download the generic [programming starter](../theme/community-theme-starter.altara-theme.json), also available at `/theme-assets/theme/community-theme-starter.altara-theme.json` on the website. Edit the JSON's `css` string directly, or keep CSS in a separate source file and build a portable package with the local tool below. The starter leaves `layout` unset and preserves the native Home and personal widget organization.

Use a UTF-8 JSON file, preferably named `my-theme.altara-theme.json`:

```json
{
  "format": "altara-theme",
  "apiVersion": 1,
  "name": "Soft panels",
  "author": "Your name",
  "version": "1.0.0",
  "description": "Rounded panels and a softer accent.",
  "css": ":root { --my-accent: #a9ccff; } .panel { border-radius: 20px; } .app { --altara-accent: var(--my-accent); }"
}
```

- `name`: required, up to 60 characters.
- `author`: optional, up to 60 characters. This is a display label, not verified publisher identity.
- `description`: optional, up to 240 characters.
- `version`: required, `x.y.z`.
- `css`: required, up to 96 KiB in UTF-8.
- API 1 JSON: up to 128 KiB. API 2 JSON: up to 1.5 MiB. The library holds up to 20 installs and 4 MiB of serialized data.

Unknown identity, permission and account fields do not become install authority. ALTARA generates a fresh local install ID. Invalid imports leave the existing library and active selection unchanged.

## Write CSS

Use normal CSS declarations, variables, CSS Grid/Flexbox, gradients, borders, shadows, filters and `backdrop-filter`. `@media` and `@supports` allow responsive layouts and fallbacks. The generic starter demonstrates actual native surface selectors without depending on ALTARA Glass.

| Surface | Initial selectors |
| --- | --- |
| Main layout | `.app`, `.panel.left`, `.panel.mid`, `.panel.right` |
| Server navigation | `.leftDockGroups`, `#leftGroupsRail`, `.groupOrbFolderWrap`, `.groupOrbFolderStack` |
| Friends, DMs and channels | `.leftDockDms`, `#dmList`, `#serverChannelsPanel` |
| Own profile and quick controls | `#meProfileCard`, `.meAvatarWrap`, `.meText`, `.meControls` |
| Voice mini dock | `#voiceMiniDockSlot` (separate from `#meProfileCard`) |
| Human and bot conversations | `#dmMain`, `#botDmMain` |
| Conversation header and history | `.dmHeader`, `.dmMainBody`, `.dmThread`, `.dmMessages` |
| Message composer | `.dmComposer`, `#dmInputWrap`, `.dmInputWrap` |
| Side panels | `#dmProfilePanel`, `#serverMembersPanel` |
| Settings | `#profileOverlay.settingsOverlay .settingsCard`, `.settingsSidebar`, `.settingsMain`, `.settingsMainBody` |

These selectors refer to the current app surfaces. Test against the app version you support. Avoid relying on private data attributes, exact child counts or unrelated implementation details.

### Compose the whole shell with native regions

**Requires ALTARA 0.1.157 or later.** A theme can compose the whole app shell: a Discord-inspired side rail, a Root-inspired horizontal server header, or a custom arrangement with navigation and context on opposite sides. You choose the regions' placement, spans and tracks; colors, typography, spacing and surface treatments remain ordinary validated CSS. These are presentation choices for ALTARA's existing features, not another app's client or a promise of identical behavior. New examples use API 2; the CSS-only placement contract also works in supported API 1 packages within their existing size limits.

Declare a complete `regions-v1` plan with four custom properties in a single `:root` rule. ALTARA validates the plan and its own layout bridge places the existing regions without replacing or reparenting their DOM nodes. Do not position shell regions yourself with fixed/absolute overlays, `display: contents`, DOM changes or author JavaScript. The optional JSON `layout` field still selects only the native Home presenter (`dashboard` or `glass-home`); it is separate from shell placement.

```css
:root {
  --altara-shell-layout: regions-v1;
  --altara-shell-areas:
    "search servers profile"
    "navigation main context"
    "voice main context";
  --altara-shell-columns: navigation content context;
  --altara-shell-rows: header content voice;
}

/* A complete smaller-desktop variant, not a partial CSS override. */
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

/* Optional decoration: only apply structural refinements when supported. */
.app[data-altara-shell-layout="regions-v1"] #leftGroupsRail {
  gap: 8px;
}
```

All seven native regions are required. Repeat a name to span adjoining cells; each region must form one rectangle. Use `.` for an empty cell, never to omit a required region.

| Region name | Existing native contents | Starting selector for decoration |
| --- | --- | --- |
| `servers` | Server rail, folders, creation and navigation controls | `.leftDockGroups`, `#leftGroupsRail` |
| `search` | Native search control | `.searchBox` |
| `navigation` | Friends, direct messages or server channels | `.leftDockDms` |
| `main` | Home, human/bot conversation or selected native main view | `.panel.mid` |
| `context` | Native context panel, such as active friends or members | `.panel.right` |
| `profile` | Own profile, status, microphone/audio and settings controls | `#meProfileCard` |
| `voice` | Native voice mini dock when a call is active | `#voiceMiniDockSlot` |

The plan is a placement contract. It does not enable hidden product features or force an inactive view, an empty voice dock or a closed context panel to become visible. The host preserves native collapse/drawer decisions, sidebar preferences, resizing, voice state, keyboard actions and drag/drop. Do not hide functional regions or move their children into another region to make a screenshot fit.

#### Plan grammar and responsive behavior

- Put all four declarations together in `:root`; API 2 is recommended for new packages. Include an unconditional base plan; a theme may have at most 16 complete plans including responsive variants. Each plan has 1–6 columns and 1–6 rows. Every quoted row has the same number of cells; the column and row track counts must match the matrix.
- Track values are space-separated tokens: `rail`, `navigation`, `content`, `context`, `controls`, `header`, `voice` or `auto`; bounded pixel values from `40px` to `640px`; or fractions from `0.25fr` to `4fr`. Semantic tracks let the host resolve native dimensions and preferences. A pixel value is a size request, not permission to cover controls or exceed the available viewport.
- ALTARA enforces usable region minima, including during native resizing: at least 240 × 240px for `main`, 220 × 64px for `profile` and 72 × 72px for `servers`. A small pixel or fraction request cannot shrink those regions below their host minimum. The host can enlarge constrained tracks, use its compact arrangement or scroll when the available space cannot fit the requested composition.
- Each responsive override must provide another complete four-property plan in `:root` inside a width `@media` rule. Width conditions support `min-width`, `max-width`, `width` or comparison syntax with pixel values from 0 to 16384, for example `(min-width: 1280px)` or `(width >= 1280px)`. Do not spread a plan across selectors or rely on partial overrides. The layout fields do not accept `var()`, `calc()`, arbitrary CSS functions or internal host geometry variables.
- At widths of 760px or less, the host uses a compact arrangement rather than your desktop matrix. Collapse state and context visibility use host-owned arrangements and drawers; protected settings/authentication/confirmation surfaces and other sensitive decisions can suspend the composition entirely. The theme cannot override those decisions. Its usual visual CSS remains subject to the existing protected-surface boundary.
- The host can also choose its compact arrangement when a desktop plan and the current native sidebar preferences leave insufficient usable space. An explicit, tested smaller-desktop plan can request bounded tracks instead; the examples use 220px side regions between 800px and 1199px. A valid matrix alone does not guarantee that every size or content combination fits.
- A missing, malformed or unsupported plan does not produce a partially rearranged shell. The official builder rejects invalid plans before writing a package; if a plan cannot be used at runtime, the host keeps or restores its own composition. Older app versions do not implement this placement contract. Keep their fallback to ordinary colors and surfaces; do not emulate it with unconditional shell-positioning CSS.

The host owns `.app[data-altara-shell-layout="regions-v1"]` and the effective `--altara-native-shell-active` state on `.app`. Do not set these yourself or use internal per-track overrides. Scope any structural decoration to the app capability attribute; keep base colors independent so unsupported clients retain a usable native layout. Visual CSS cannot grant layout capability. This capability marker is a presentation signal, not an authentication or purchase check.

Source examples are in [`examples/community-themes/shell-regions`](../examples/community-themes/shell-regions/README.md): lateral navigation, a horizontal header and a mirrored custom plan. They contain original CSS and fictional metadata, not paid theme files. Use the official builder with each example's `metadata.json` and `theme.css`; validate against the same app version you intend to support.

Native panel entry animations are suspended while a community theme is active so they cannot silently create a positioning container. This does not permit author overlays or remove the need to test normal and reduced motion. Native desktop caption controls retain reserved space and must remain reachable.

For styling changes, prefer the native widget columns. If you change the grid's column count, set `--widgets-cols` to the same whole number (1–12) as `grid-template-columns`, including at each responsive breakpoint. ALTARA uses that count when placing and resizing cards. Preserve the user's saved order, sizes and widget data; do not clear them to make a theme fit.

```css
.widgetsGrid { --widgets-cols: 2;
  grid-template-columns: repeat(2, minmax(0, 1fr)); }
```

Before publishing a layout change, test the built package in ALTARA:

- Use a fresh app load with normal motion and again with reduced motion. Check the initial and settled layout. Keep the real bootstrap and resulting body classes; a fixture forced into a motion-off state does not cover normal startup.
- Reopen the app and Appearance, deactivate and reactivate the theme, resize the window, and collapse or expand both sidebars. Check the native compact fallback at 760px and below, every authored breakpoint, long names, keyboard focus, menus, desktop window controls and the complete message composer. Test actual sidebar resizing and persistence rather than just reading its ARIA value.
- Test the server rail with no memberships, while loading, and when memberships arrive after startup. Keep native navigation and creation controls reachable. Exercise real drag/drop, folders, reordering, reverse/RTL flows and viewport-bounded tooltips.
- Check Home, human and bot chats, server channels and an active voice mini dock. Opening a protected native dialog pauses author styling. Deactivation and Ctrl+Alt+Shift+T must restore the native composition without changing messages, widget order, sizes or data.

The isolated preview contains fictional server navigation, a profile card, conversations and the message composer under the same essential wrappers. It is a preview of the package, not proof that every app feature or supported window size works. Before publishing a layout change, test the built package in the app version you intend to support. Publish an immutable new version of the same project; installed versions change only when their user approves an update.

`:root` and a standalone `body` rule may define custom properties only. ALTARA maps them to the authenticated theme scope. Other rules are scoped below that body and exclude the theme manager and recovery controls. The compiler gives theme declarations priority over the existing palette rules without changing the underlying saved palette.

Existing visual variables such as `--altara-accent`, `--altara-text`, `--altara-text-muted` and `--ui-primary-bg` can be overridden on `.app` or a specific surface. Add your own named variables for reusable colors and spacing. Some native components set their own variables, so a root variable alone may not change every descendant.

## One appearance for all widgets

Define the following variables once on `.app`. ALTARA resolves and validates them, then shares only this presentation record with each isolated widget. Native widgets, v1 worker widgets and installed HTML snapshots use the same contract. Adding another supported widget requires no new theme selectors. Existing theme APIs 1 and 2 remain compatible; missing variables use the app palette and bounded defaults.

```css
.app {
  --altara-widget-surface: rgba(24, 33, 44, .72);
  --altara-widget-surface-raised: #25334b;
  --altara-widget-input: #141d29;
  --altara-widget-text: #edf4ff;
  --altara-widget-muted: #afbfce;
  --altara-widget-accent: #a9ccff;
  --altara-widget-accent-text: #101318;
  --altara-widget-border: rgba(210, 230, 255, .16);
  --altara-widget-radius: 18px;
  --altara-widget-spacing: 16px;
  --altara-widget-blur: 12px;
}
```

| Shared token suffix | Meaning / accepted range |
| --- | --- |
| `background`, `surface`, `surface-raised`, `input` | CSS color; surfaces may be translucent |
| `text`, `muted`, `accent`, `accent-text`, `border` | CSS color; text is never made translucent as a group |
| `success`, `warning`, `danger` | Separate semantic colors; keep states distinguishable |
| `font-family` | Exactly one local stack below; no remote fonts |
| `font-size`, `line-height` | 10–24 px; unitless 1–2 |
| `radius`, `spacing`, `control-height` | 0–32 px; 4–32 px; 24–64 px |
| `border-width`, `blur`, `shadow` | 0–3 px; 0–24 px; 0–48 px shadow blur |
| `color-scheme` | `dark` or `light` |

Font stacks: `"Segoe UI", system-ui, sans-serif`; `Arial, Helvetica, sans-serif`; `Georgia, "Times New Roman", serif`; `Consolas, "SFMono-Regular", monospace`. Every token starts with `--altara-widget-`. Invalid values fall back safely; no author CSS, URLs, account IDs or messages cross the iframe boundary. Blur belongs to the native card, avoiding nested filters inside each widget.

Standard HTML controls, text, common surfaces, links and progress indicators adapt automatically. Widget creators can mark an unusual component once with `data-altara-widget-role="surface|muted|accent|success|warning|danger"`; all themes then understand it. For canvas charts or closed Shadow DOM, creators integrate `altara.appearance.get()` / `subscribe()` from the hosted SDK once and redraw with the supplied visual values. An arbitrary image, canvas or custom component cannot be recolored safely by a parent stylesheet. Existing live external development pages need the updated SDK; installed fixed HTML releases receive the trusted appearance bridge even when their original SDK predates themes.

Switching the theme changes the style layer in place, without restarting the worker, replacing widget content or writing widget data. Disabling/recovering the theme removes the layer and restores creator styling. Account changes dispose mounts under the existing ownership rules. Appearance pauses alongside theme CSS on sensitive native dialogs. The system's reduced-transparency and reduced-motion settings are propagated; an explicit per-theme Glass/solid choice is respected. No animations or polling loop are added.

The original installed HTML bytes and release hash remain unchanged. ALTARA verifies them before adding its own trusted bootstrap with a separate CSP script hash. Sandbox, network permissions and the dedicated storage port remain unchanged. A theme's appearance record cannot grant behavior or permissions.

## Boundaries and compatibility

The package is parsed using pinned **CSS-tree 3.2.1**, then validated and scoped from its syntax tree. It is not loaded as arbitrary HTML or JavaScript. The MIT license and upstream notice are in `lib/vendor/css-tree`.

The v1 policy rejects resource addresses, `url()`, `@import`, `@font-face`, unsupported at-rules/functions, CSS-generated text, executable properties and malformed syntax. A package cannot declare new external image/font requests or run script. Native app assets and values already defined by the app remain under the app's normal behavior; this policy does not disable the app's network traffic.

Animations, nested style rules and custom keyframes are not supported in v1. Transitions must have explicit durations no longer than two seconds. Rule, selector, declaration and nesting limits bound the work accepted by the compiler. Use reduced-motion rules and avoid large blur surfaces when a simpler effect is sufficient.

Themes can change the shell's visual structure through the supported native-region plan; they do not supply or replace DOM, data or product behavior. They cannot add buttons with new actions, receive messages through an SDK or grant access to an API. Native regions keep their existing nodes, landmarks, actions and permissions. Widgets keep their existing isolated runtime. Theme packages and CSS are not written to `profiles.theme_settings`. Public releases are uploaded only through an explicit creator publication flow, independently of messages and widget data.

## API 2: portable images and native Home layout

API 2 retains the fields above and optionally adds:

```json
{
  "apiVersion": 2,
  "assets": { "room": { "mime": "image/webp", "base64": "CANONICAL_BASE64_BYTES" } },
  "layout": "dashboard"
}
```

This snippet describes the extra fields, not a complete installable package. Asset keys are lowercase identifiers of up to 32 characters. Static PNG, JPEG and WebP are accepted only after canonical base64, matching file signatures, dimensions and animation checks. Each image is limited to 512 KiB; all images together to 1 MiB; dimensions to 4096 pixels per side and 12 megapixels. SVG, GIF, APNG and animated WebP are rejected. Authors embed assets in the package; validated assets survive preview and download.

Use `theme-asset(room)` in a declaration to refer to an embedded image. Define a reusable variable once, for example `:root { --room: theme-asset(room); }`, then use `var(--room)` in backgrounds. ALTARA generates the internal data URL after validating the package. Raw author URLs remain forbidden. Expanded CSS is capped at 2 MiB before generation to bound repeated image expansion.

`backdrop-filter: theme-filter(liquid-glass) blur(16px) saturate(1.2)` uses ALTARA's fixed, native SVG displacement filter followed by ordinary CSS blur. It bends the background at a rounded rim, without capturing messages or running an animation loop. Packages cannot provide SVG, shader programs or arbitrary filter URLs. Browsers that reject SVG backdrop syntax, or documents unable to create its Canvas map, retain the ordinary blur/saturation path. Visual behavior is verified in Chrome; other engines require their own visual checks.

`layout: "dashboard"` requests a native Home presentation: greeting, status actions, known servers and current public activity. The account and navigation remain under ALTARA's normal permissions. No author HTML or executable theme code is accepted. The native presenter and the existing widget grid join one visual composition through CSS Grid. Native widget nodes, records, custom widget iframes and message DOM keep their existing ownership. The optional Glass widget disposition is a separate, explicit, reversible choice; activating a package does not apply it. Removing or disabling the theme clears that section. The native Home presenter supplies `data-theme-slot` values such as `home-hero`, `home-servers`, `home-activity` and `home-status-actions` for styling.

The original API 1 behavior and limits are retained. Files with assets or a native layout must declare API 2. Supported layouts are `dashboard` (the original integrated widget view) and `glass-home` (the native modular Home). Activation never overwrites saved widget organization; Glass Home exposes the unchanged grid through My widgets.

## Programming tokens and stable slots

The app is a file importer and theme selector, not a theme builder. Write ordinary CSS in your own editor. The `--ct-*` names below are conventions used by the starter: your CSS must actually consume each variable. Defining a token alone does not automatically restyle unrelated native components. Existing files containing an `ALTARA visual tokens` block still work; it is ordinary CSS and is not removed when a package is imported.

| Public token | Value |
| --- | --- |
| `--ct-background`, `--ct-surface` | background/surface colors |
| `--ct-accent`, `--ct-text`, `--ct-muted` | accent and readable text colors |
| `--ct-surface-alpha` | recommended .30–1; apply to backgrounds, not text opacity |
| `--ct-blur` | recommended 0–24px; avoid nested full-window blur |
| `--ct-radius` | recommended 0–28px |
| `--ct-spacing` | recommended 8–24px |
| `--ct-border`, `--ct-shadow` | recommended 0–2px border, 0–30px shadow size |
| `--ct-font` | supported local/native font stack |

Preferred stable selectors include `[data-theme-slot="widget-grid"]`, `widget-card`, `widget-title`, `home-presentation`, `home-navigation`, `home-hero`, `home-servers`, `home-server-card`, `home-activity` and `home-status-actions`. The ALTARA Glass example uses the same API2 layout, token fallbacks and fixed native material available to other creators. Author styling is paused completely, including inherited variables and ancestor styles, while native confirmation, settings or dialog decisions are open. Keyboard recovery remains independent of the theme's layout and cascade. Recording/microphone-sharing indicators are also sensitive: the base appearance is shown for the duration of the indicator so author overlays cannot hide ongoing consent. This deliberate safety tradeoff may visibly pause a theme during capture.

For `glass-home`, additional slots are `home-board`, `home-brand-mark`, `home-search`, `home-native-actions`, `home-server-directory`, `home-recent-activity`, `home-today`, `home-messages`, `home-active-now`, `home-direct-messages`, `home-quick-notes`, `home-focus` and `home-footer`. Select them with the full attribute selector, for example `[data-theme-slot="home-focus"]`. A slot is present only when the corresponding native presentation/component is active. The layout names select host-owned presenters; they do not load author templates. CSS may rearrange these native slots responsively, but cannot generate new actions, data bindings, widgets or HTML. Preserve native buttons, focus and readable states.

```css
/* Keep layout responsive and leave the native widget records untouched. */
[data-theme-slot="widget-grid"] { gap: 16px; }
[data-theme-slot="widget-card"] {
  background: rgba(24, 33, 44, .72);
  border: 1px solid rgba(210, 230, 255, .16);
  border-radius: 18px;
  backdrop-filter: blur(12px);
}
@media (prefers-reduced-transparency: reduce) {
  [data-theme-slot="widget-card"] {
    background: #18212c;
    backdrop-filter: none;
  }
}
```

## Separate CSS source and local validation

Download the **starter kit ZIP** from `/developers/themes/guide`. It contains separate `metadata.json` and `theme.css` files, an example package and the same validator/builder used by ALTARA. Extract it, use Node.js 22 or newer and run the commands below from that folder. No npm installation or app checkout is required for the downloaded kit. The readable website guide covers each step from editing to publishing; its offline Markdown copy is included in the kit.

In the ALTARA source checkout, use the supplied Node tool. It never evaluates theme JavaScript and uses the same parser, image validation and canonical package format as the client/backend. Create `metadata.json` with the package fields above, omitting `css`; keep CSS in `theme.css`:

```sh
node scripts/theme-package.mjs --build metadata.json theme.css my-theme-1.0.0.altara-theme.json
node scripts/theme-package.mjs --check my-theme-1.0.0.altara-theme.json
```

`--build` validates before creating the output and refuses to overwrite an existing file. Choose a new output filename after edits. The result prints API compatibility, byte size and the SHA-256 of canonical bytes. Assets must be embedded in `metadata.json` using the API 2 contract above. This is optional: uploading your JSON in the website developer area also validates it and offers an isolated preview before saving a private draft. Do not upload compiled scoped CSS; write source CSS and let ALTARA scope it.

Maintainers regenerate the downloadable kit with `node scripts/build-theme-starter-kit.cjs` using JSZip from their development tools (`ALTARA_THEME_ZIP_MODULE` can select its installed module path). `--check` verifies the archive and every source fingerprint without ZIP tooling. The kit contains only an explicit file allowlist, with CSS-tree's licence and notice. Changes to its validator, CLI, starter or offline guide require regenerating the archive before distribution.

## Free and paid publication, installation and updates

Use `/themes` to discover themes and `/developers/themes` to publish. Write files locally → upload a package → validate/**Preview package** → **Save private draft** → **Publish version…**. In that publication form, select **Free** or **One-time purchase**; for a paid theme, enter the EUR price and complete **Set up Stripe seller account** if shown. Add a presentation image and release notes, review the version, price and your publishing rights, then choose **Publish version** to create an immutable release. No ALTARA+ subscription is required. Paid publication additionally requires enabled theme sales and a verified Stripe seller in a supported country. An existing eligible ALTARA seller account is reused. Price and currency belong to the fixed release, not to editable theme metadata.

To edit a project, edit the original source externally and choose **Replace draft package** in the same project. The existing project owner and expected draft revision are checked by the server; the uploaded package cannot select a creator account. Public creator identity comes from the verified session/project owner, never the textual `author` field. Screenshots are decoded by the browser and resized to at most 640px/96KiB before publication, then structurally revalidated by the server. The server also checks PNG chunk CRC/header integrity; it does not run a full raster pixel decoder.

Anyone can search public listings and view their details and screenshots. Free packages retain their public preview/download flow. Signed-in users can choose **Install** on the listing to link a free theme installation to their account. **Download theme** followed by **Import theme** creates a local copy instead; that import alone does not create the account installation used for ratings and account updates. A paid package is delivered only to its creator or a signed-in account with access; an unpurchased paid listing does not deliver CSS through its preview. The release's canonical bytes, API and SHA-256 are verified before import or installation. Downloading a free file does not create an account installation, activate a theme or modify the app. Import the free file or copy it into the desktop account folder, then explicitly activate it. The portal never applies author CSS to its own authentication, publication or payment controls. API 1 local packages retain their existing behavior.

A confirmed paid purchase is attached to the buyer's account and theme project. Buying does not install or activate CSS: choose **Install** on the listing, then **Open ALTARA** and **Settings → Appearance → Community themes → Activate** on the installed theme. Creators can use their own paid themes without paying. ALTARA verifies access before applying a paid account theme, including on restoration. If access cannot be verified, the paid theme stays unapplied while the record is kept. The standard library export/edit flow and automatic theme-folder export do not detach paid account sources into local files.

For a paid theme, keep all complete CSS, embedded images, built JSON and source code local or private. Upload the finished `.altara-theme.json` directly to ALTARA; do not publish that file in a public GitHub repository, release, Pages site or preview. No free version or demo is required. Deleting an earlier public file does not erase history, deployments, caches or copies. A shared ALTARA listing is not a purchase entitlement. Authorised buyers can still copy CSS/assets after delivery; there is no promise of copy-proof browser DRM.

Published releases are pinned by version and SHA-256 canonical bytes. A new release never rewrites an older downloaded file. Download a newer version deliberately and activate it after import; local folder packages are not automatically updated or remotely revoked. Removing a theme from the public catalogue prevents future website downloads after an authoritative refresh, but cannot erase copies already downloaded to offline devices. Local packages still pass the client validator before application. A downloaded `author` label is not verified identity; the website listing provides the server-owned creator identity. Account changes fence pending website operations.

Existing account-installation records and free-file behavior are preserved. For an account update, increase the package version, upload the complete replacement into the same project's private draft and publish a new release with useful notes. Existing buyers keep access to later versions of that same project without another payment. Users review and accept an update explicitly; an installed version is not silently replaced. A new project or another creator does not inherit earlier purchases. A newer paid release does not retroactively charge someone for an already installed free version. In ALTARA, open **Settings → Appearance → Community themes → My account themes**, then **Review v…** on the installed card. Read the notes, use **Preview update**, tick the update confirmation and choose **Accept update**, or **Keep current version** to leave the current installation in place. An update accepted in ALTARA keeps an active theme active and an inactive theme inactive; local-file updates are imported and activated separately.

Ratings are one editable 1–5-star rating per eligible installed account/project. Open **Details, rating & updates** on the Appearance card, select stars under **Your rating** and choose **Save rating**. Users may edit or remove their own rating; creators cannot rate their own projects. A rating is not a security certification.

The local library remains bounded to 20 entries/4MiB, and published account packages to 3MiB total. Capacity is checked before an install mutation. A rare device-write failure after a successful server save is reported explicitly: the account accepted that version, but the previous local appearance stays in place until a successful refresh. This is not a claim of a cross-device storage transaction.

## Theme sales, fees and refunds

ALTARA's commission is 5%; Stripe processing fees are separate and paid by the creator. Supported countries and current seller readiness appear in the portal. A confirmed sale is not an instant bank payout. Account or bank verification and payout availability remain subject to Stripe.

Buyers can submit withdrawal within 14 days worldwide, including after installing or applying the theme. They can raise problems and applicable mandatory rights later. ALTARA does not monitor theme usage to refuse a request. Keep the downloadable request receipt and history; recording a request is not a bank refund.

The creator handles **Buyer requests**, reviews the exact new amount and explicitly confirms **Approve and refund**. Stripe processes the refund to the original payment method and returns the corresponding ALTARA commission to the creator. Original Stripe fees can remain payable. Payment state and commission-return state are tracked separately. Pending or uncertain outcomes require status checking/support, not a second refund; historical approvals never initiate refunds automatically.

A confirmed partial refund keeps theme access. A confirmed full refund removes paid access if no other valid purchase grants it and deactivates the theme when the account verifies that restriction. Installation identity and library records are preserved. A payment dispute can pause access separately. Delivered offline copies cannot be recalled instantly. See `/theme-refunds` for the complete policy and [backend contract and rollout](COMMUNITY_THEMES_BACKEND.md) for deployment and verification boundaries. Local source or tests alone do not enable hosted theme sales.

## Reference

The [Zen Mods documentation](https://docs.zen-browser.app/user-manual/extensions) describes CSS mods for the browser interface. ALTARA uses a separate, app-specific package and validation policy. The [CSS-tree project](https://github.com/csstree/csstree) supplies the parser used here.
