# ALTARA Home Widget SDK v1 — legacy inline reference

> Legacy inline format, retained for existing installations. **The creation and publication workflow below is historical; the in-app code editor has been retired.** For new free or paid widgets, use [Build your ALTARA widget](./WIDGET_HOSTED_GUIDE.md): build the hosted project, upload a fixed `release.html` in **Developer Portal → Widgets**, then choose **Free** or **One-time purchase**. Existing legacy drafts can still be exported.

The original preview used JavaScript-only packages and immutable free releases. Its **Home → Widgets → Marketplace → Create** path is historical. Keep the package and SDK reference below for an existing inline widget; use the hosted guide for new creation and publication.

## Historical preview workflow (retired UI)

1. Start from the counter template, or import a `.altara-widget.json` package.
2. Edit the name, description, semantic version and JavaScript code.
3. Choose **Run code** to restart the preview. Preview data is temporary.
4. **Save draft** saves a private editable copy on this device, scoped to your ALTARA account.
5. **Add to home** installs a separate snapshot. Existing home controls resize, move and remove it from the grid. Hiding it from the grid preserves its data. Uninstalling it in **Your widgets** deletes that instance and its data.
6. **Export package** makes a backup or a file you can share manually.
7. **Publish free** makes that version and its source available to signed-in community members once the marketplace database patch has been activated. Publishing does not install the widget for anyone automatically.

Private drafts, installs, layouts and widget state are local in this preview; they do not sync between devices. Export your source before clearing application data. Multiple installs are independent. Installed releases stay pinned, even if the creator publishes another version or unpublishes the original.

## Package

```json
{
  "sdkVersion": 1,
  "name": "Hello home",
  "description": "A tiny greeting for your home screen.",
  "version": "1.0.0",
  "code": "altara.render({type: 'text', text: 'Hello, ALTARA!'});"
}
```

Name: 1–60 characters. Description: 1–240. Version: three numeric segments, e.g. `1.0.0`. Code: at most 65,536 JavaScript characters. The importer ignores identity, permissions and pricing fields. Publisher identity always comes from the signed-in account and is checked in the database.

## SDK

Creator code runs as ordinary JavaScript in a worker. `altara` is a global object; imports, npm packages, HTML and CSS are not part of v1. Standard JavaScript utilities and timers are available. Use these methods to draw a view and respond to actions:

```js
let count = Number(altara.storage.get('count')) || 0;

function draw() {
  altara.render({ type: 'column', children: [
    { type: 'text', text: 'Your progress', tone: 'muted' },
    { type: 'stat', text: String(count) },
    { type: 'button', text: '+1', action: 'increment' }
  ] });
}

altara.onAction((action, value) => {
  if (action === 'increment') {
    count += 1;
    altara.storage.set('count', count);
    draw();
  }
});
draw();
```

| Component | Properties |
| --- | --- |
| `column`, `row` | `children`: array of components |
| `text`, `stat` | `text`: string; optional `tone: 'muted'` |
| `button` | `text`, `action`; optional `disabled: true` |
| `input` | `value`, `label`, `placeholder`, `action`. Sends `(action, value)` when a change is committed. |
| `progress` | `value`: 0–100; `label`: accessible description |

`altara.render(view)` replaces the previous view. Keep transient input changes in your own state and avoid redrawing focused inputs on a timer. Views accept up to 100 nodes, eight nested levels, and 2,000 characters per text field. Unknown components and oversized messages stop the widget.

### Automatic appearance

The trusted renderer styles the supported components with ALTARA's current appearance. A community theme changes the colors, typography, surfaces, borders and control styling of every v1 widget through the same shared appearance contract. Creators do not need to detect theme names, publish a version for each theme or change their worker code.

Appearance updates change presentation in place. They do not restart the worker, replace its view, fire actions or change storage. The worker receives no theme CSS, account identity, credentials or extra permissions. Semantic controls, focus, disabled states and progress values keep their existing behavior.

`altara.storage.get(key)` synchronously reads saved state. Missing keys return `undefined`. `altara.storage.set(key, value)` updates JSON-compatible state; storage is limited to 16 KB per installed instance. Keys use letters, digits, `_` and `-`, up to 64 characters. Each preview starts empty. Do not store passwords or credentials in widget state.

The worker has no app DOM, session, account data, Electron bridge or network access. Creator code cannot create nested workers. Trusted UI code renders text and a fixed set of components inside a separate sandboxed frame. Updates are rate limited, and a watchdog terminates nonresponsive code. Browser resource limits still apply: this is a developer preview, not a promise of unlimited or crash-proof computation.

Widgets stop when leaving the Widgets view and restart from saved state when returning. Use timestamps to calculate elapsed time; do not depend on a timer continuing in the background.

## Historical publishing and versions

The original preview catalog showed the latest 50 free releases and refreshed while open when releases changed. Publishing required authentication and only the author could unpublish a release. Published content could not be edited in place: a changed version created a new row. Previewing did not install a release. **Add to home** created a pinned local copy with empty state. This describes the retired preview, not the current hosted Marketplace workflow.

In that historical preview, public source was downloadable through package export. Paid licensing, reviews, moderation tooling, automatic updates, cloud state and external API permissions were not implemented; no creator payments or commission were charged by that preview. These limitations do not describe current hosted widgets. Follow the [current free or paid workflow](./WIDGET_HOSTED_GUIDE.md), including account access, user-chosen updates, ratings and refunds.

Historical database reference: `supabase/manual_patches/2026-09-28_home_widget_marketplace_v1.sql` created the preview table and ownership policies and added it to realtime publication. It did not modify subscription billing or existing tables. This is not a setup step for current hosted widgets; do not apply it from this guide. Any database change requires review under this repository's SQL rules.

## Historical prompt for an existing inline widget

> Write an ALTARA SDK v1 widget as a JSON package containing sdkVersion: 1, name, description, version and code. Code is plain JavaScript in a worker, with no DOM, imports, network or account access. Render a tree with altara.render(view). Supported components are column/row with children, text/stat with text, button with text/action, input with value/label/action, and progress with value 0–100/label. Handle interactions with altara.onAction((action, value) => {}). Store only JSON values with altara.storage.get(key) and altara.storage.set(key, value), within 16 KB. Timers stop when the widget is not displayed. Use the provided counter example as the package format. Build: [describe your widget here].
