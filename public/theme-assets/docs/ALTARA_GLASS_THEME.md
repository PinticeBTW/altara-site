# ALTARA Glass 0.4.0 — native Home composition

ALTARA Glass now requests the public API 2 layout `glass-home`. It is a distinct native Home, rather than the old widget cards with another surface colour. The package contains CSS and an allowlisted layout only. Account models, navigation, permission checks and callbacks remain native ALTARA code.

## Scope of this revision

The Home follows the supplied reference's composition: slim rail, full header and search, open greeting area, small Recent Activity/Today column, central server deck and Messages/Focus, and a right column for Active Now, Direct Messages and Quick Notes. At 1536px the primary columns are approximately 242px, 445px, 355px and 310px. The presentation caps at 1600px and its proportions/type scale fluidly in larger CSS viewports. Ordinary CSS Grid reorganizes them at smaller widths. Long names retain their full accessible text and use at most two visual lines.

The material uses charcoal, cream and warm highlights, thin borders, restrained shadows and the existing native static refraction filter with moderate blur. Surface opacity does not reduce text/icon opacity. All new Home cards consume the public surface/transparency tokens; their individual tint gradients no longer overwrite the dynamic fill.

The real Windows environment had transparency effects disabled (`EnableTransparency=0`), and a browser without emulated media confirmed `prefers-reduced-transparency:reduce`. The submitted screenshot matched the solid fallback. The desktop's default zoom is 0.9, which also explained the smaller text/columns; this revision does not change that preference. The default material remains **Follow system**.

The user explicitly requested glass only within ALTARA Glass. The native theme manager therefore offers **Theme material / Material do tema** with System, Glass and Solid. Choices are stored locally per account and installation, separately from theme packages, widgets and messages. Glass explicitly overrides the theme's reduced-transparency branch while preserving the OS preference; Solid remains available even when the OS permits glass. Failed writes preserve the previous choice. Suspend, logout, account retirement and recovery remove both native material markers.

**No wallpaper is bundled or forced in 0.4.0.** Background choice is independent of the Home composition. Existing image upload in the theme editor can add an embedded image; the ordinary `.app` background rule remains overridable by that managed block. No user background preference is written by activation.

## Native data and actions

- Servers come from known native server envelopes and use normal authorized navigation. Three featured cards leave the create action visible; the native “See all” directory retains the remaining servers and checks owner/current layout before every navigation.
- Contacts and message rows come from the canonical accepted sidebar model. Hidden contacts, pending message requests and unrelated rows are excluded.
- Message snippets only use permitted cached plaintext. Locked/private/E2EE conversations, ciphertext and unknown privacy state are guarded; no remote message prefetch is introduced to fill the dashboard.
- Trusted system/call events use the native human-readable text. Recognized event-like envelopes without authoritative markers use neutral “Message” copy, never raw event JSON or a false system announcement. Ordinary user-authored JSON remains ordinary content. Recency comes from actual message/cache/RPC timestamps rather than relationship or hydration dates.
- Focus, task checkboxes, task creation and Today use the existing timer/checklist/calendar models and handlers. The timer reuses the single native scheduler. Timer ticks update the dial/text without recreating unrelated cards or input controls.
- The Focus dial is the actual keyboard-accessible start/pause button. Reset and settings remain native header actions; the larger preset buttons retain their real timer configurations.
- Search uses known local servers and accepted contacts. Profile, Appearance, notifications and Activity use actual native actions. Unsupported video/music playback controls are not invented.
- The app does not currently keep a real application activity history. Recent Activity therefore has a deliberate empty state. Published current activity appears only when the existing privacy selector permits it.

The original widget grid and its data remain intact. **My widgets / Os meus widgets** switches to that native view without changing saved positions, sizes, enabled widgets or content. Home returns to the new composition. The older `dashboard` layout and API 1 packages remain supported.

All native actions capture the owner and re-check account, generation and current layout. Presence/message/task refreshes schedule one coalesced visible Home update rather than new observers or polling. Native task and timer sheets remain protected trust surfaces.

## Public customization contract

Creators select `layout: "glass-home"` in an API 2 package or in the Home presentation dropdown. The advanced CSS remains preserved. Stable slots include:

`home-brand-mark`, `rail-brand-mark`, `home-navigation`, `home-search`, `home-board`, `home-hero`, `home-activity`, `home-recent-activity`, `home-today`, `home-servers`, `home-server-card`, `home-server-directory`, `home-messages`, `home-focus`, `home-active-now`, `home-direct-messages`, `home-quick-notes`, `home-footer`.

The built-in theme uses these native surfaces and the same CSS/asset validator as community packages. Preview is a detached static rendering of the native layout with explicitly fictional data; it has no scripts, network or private account data.

The native `.app[data-altara-theme-transparency="system|glass|solid"]` marker is available to creators implementing those material modes. Default reduced-transparency CSS applies unless the native mode is explicitly Glass. This attribute is set by the host, not package content. Isolated previews of the active theme reuse its selected material while rendering only fictional content. Older packages without this contract keep following the OS and do not expose an ineffective material control.

## Validation and evidence

The new full-app browser test loads the actual complete `index.html` and `app.js` without stripping scripts or extracting rendering helpers. A source hash is checked. Auth, HTTP data and Phoenix WebSocket transport are synthetic and intercepted; no production request is passed through and no real session is read. It verifies the real boot path, Home/Chat navigation, native task persistence, Focus handlers, widget-view preservation, reload and keyboard recovery.

Separate presenter and bridge regressions cover account changes, stale controls, privacy, task/input node preservation and queued event ownership. Source and generated web mirrors are built using the existing process. These tests establish local behavior; they do not establish a hosted release or a real Electron session.

The revision also fixes a real image bug found by the complete-app capture: approved image URLs were previously truncated at 8192 characters, which could decode a partial PNG. Sources are now bounded and either retained intact or rejected to the fallback; they are never truncated.

Screenshots of the actual complete app with synthetic data are delivered with the task report at 1536, 900 and 500px, including reduced transparency and empty data. A chosen-background fixture, if shown, is explicitly separate from the wallpaper-free default package.

No commits, deploy, remote SQL or marketplace publication are performed by this Home revision. The community theme release/install infrastructure is unchanged apart from recognizing the new public layout in the shared validator and editor.
