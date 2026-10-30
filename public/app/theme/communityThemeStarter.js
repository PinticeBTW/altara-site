// A portable programming starter. Authors edit JSON/CSS outside ALTARA; no
// executable code or private data hooks are part of the package contract.
export const COMMUNITY_THEME_CODE_STARTER = Object.freeze({
  format: 'altara-theme',
  apiVersion: 2,
  name: 'My ALTARA theme',
  author: '',
  version: '1.0.0',
  description: 'A code-first starter using native ALTARA surfaces.',
  css: `:root {
  --ct-background: #101318;
  --ct-surface: #18212c;
  --ct-accent: #a9ccff;
  --ct-text: #edf4ff;
  --ct-muted: #afbfce;
  --ct-surface-alpha: .72;
  --ct-blur: 12px;
  --ct-radius: 18px;
  --ct-spacing: 16px;
}
.app {
  --altara-accent: var(--ct-accent);
  --altara-text: var(--ct-text);
  --altara-text-muted: var(--ct-muted);
  --ui-primary-bg: var(--ct-accent);
  --ui-primary-text: #101318;
  /* One contract for native and community widgets, including future installs. */
  --altara-widget-background: var(--ct-background);
  --altara-widget-surface: rgba(24, 33, 44, .72);
  --altara-widget-surface-raised: #25334b;
  --altara-widget-input: #141d29;
  --altara-widget-text: var(--ct-text);
  --altara-widget-muted: var(--ct-muted);
  --altara-widget-accent: var(--ct-accent);
  --altara-widget-accent-text: #101318;
  --altara-widget-border: rgba(210, 230, 255, .16);
  --altara-widget-success: #78d69a;
  --altara-widget-warning: #f2c572;
  --altara-widget-danger: #ff9b9b;
  --altara-widget-radius: var(--ct-radius);
  --altara-widget-spacing: var(--ct-spacing);
  --altara-widget-blur: var(--ct-blur);
  --altara-widget-font-family: "Segoe UI", system-ui, sans-serif;
  --altara-widget-font-size: 13px;
  --altara-widget-control-height: 34px;
  background-color: var(--ct-background);
  color: var(--ct-text);
  font-family: "Segoe UI", system-ui, sans-serif;
}
[data-theme-slot="widget-card"],
[data-theme-slot="home-servers"],
[data-theme-slot="home-activity"] {
  background-color: color-mix(in srgb, var(--ct-surface) calc(var(--ct-surface-alpha) * 100%), transparent);
  border: 1px solid rgba(210, 230, 255, .16);
  border-radius: var(--ct-radius);
  backdrop-filter: blur(var(--ct-blur));
  box-shadow: 0 8px 24px rgba(0, 0, 0, .16);
}
[data-theme-slot="widget-grid"] { gap: var(--ct-spacing); }
[data-theme-slot="widget-title"] { font-weight: 600; }
.dmHeader { background-color: rgba(24, 33, 44, .8); }
.dmComposer { border-top: 1px solid rgba(210, 230, 255, .16); }
@media (prefers-reduced-transparency: reduce) {
  [data-theme-slot="widget-card"],
  [data-theme-slot="home-servers"],
  [data-theme-slot="home-activity"] {
    background-color: var(--ct-surface);
    backdrop-filter: none;
  }
}`,
});

export const LIQUID_GLASS_THEME = Object.freeze({
  format: 'altara-theme',
  apiVersion: 1,
  name: 'Liquid Glass',
  author: 'ALTARA',
  version: '1.0.0',
  description: 'Translucent panels, soft light and rounded surfaces. A starting point for your own CSS theme.',
  css: `/* ALTARA Community Themes v1. Edit, preview and export this package. */
:root {
  --glass-accent: #a9ccff;
  --glass-text: #edf4ff;
  --glass-muted: #bdcadd;
  --glass-line: rgba(223, 237, 255, 0.16);
  --glass-panel: rgba(21, 31, 50, 0.66);
  --glass-radius: 22px;
}

.app {
  --altara-text: var(--glass-text);
  --altara-text-soft: #d2deef;
  --altara-text-muted: var(--glass-muted);
  --text: var(--glass-text);
  --muted: var(--glass-muted);
  --accent: var(--glass-accent);
  --altara-accent: var(--glass-accent);
  --altara-accent-text: #0b172b;
  --altara-surface: #172238;
  --altara-surface-elevated: #25334b;
  --altara-input: #172238;
  --border: var(--glass-line);
  --border-strong: rgba(223, 237, 255, 0.28);
  --ui-primary-bg: #a9ccff;
  --ui-primary-text: #0b172b;
  background:
    radial-gradient(ellipse at 12% 12%, rgba(61, 139, 232, 0.38), transparent 54%),
    radial-gradient(ellipse at 88% 76%, rgba(119, 87, 212, 0.30), transparent 52%),
    linear-gradient(135deg, #0b1424, #17263b 58%, #10182b);
  color: var(--glass-text);
  gap: 10px;
  padding: 10px;
}

.panel.left, .panel.mid, .panel.right {
  background: var(--glass-panel);
  border: 1px solid var(--glass-line);
  border-radius: var(--glass-radius);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 12px 32px rgba(0, 0, 0, 0.16);
}

.panel.left, .panel.right {
  backdrop-filter: blur(18px) saturate(145%);
}

#leftGroupsRail, .leftDockDms, .leftDockDms__list, .leftTop, .leftList, #dmList,
#dmMain, #botDmMain, .botDmMain,
.dmMainBody, .dmThread, .dmMessages,
#dmProfilePanel, #serverMembersPanel {
  background: transparent;
}

.dmHeader, .midTop {
  background: rgba(28, 42, 65, 0.42);
  border-bottom: 1px solid var(--glass-line);
}

.dmComposer, .leftBottom {
  background: rgba(19, 29, 47, 0.56);
  border-top: 1px solid var(--glass-line);
}

#dmInputWrap, .dmInputWrap, .dmComposer textarea, .dmComposer input {
  background: rgba(8, 18, 32, 0.48);
  color: var(--glass-text);
  border-color: var(--glass-line);
  border-radius: 15px;
}

.dmItem, .dm-item, .serverChannelRow {
  border-radius: 12px;
  transition: background-color 180ms ease, border-color 180ms ease;
}

.dmItem:hover, .dm-item:hover, .serverChannelRow:hover {
  background: rgba(198, 223, 255, 0.09);
}

.dmItem.is-active, .dm-item.is-active, .dm-item.active, .serverChannelRow.is-active {
  background: rgba(169, 204, 255, 0.13);
  border-color: rgba(169, 204, 255, 0.34);
}

#profileOverlay.settingsOverlay .settingsCard {
  --altara-text: var(--glass-text);
  --altara-text-muted: var(--glass-muted);
  --text: var(--glass-text);
  --muted: var(--glass-muted);
  --settings-accent: var(--glass-accent);
  --altara-accent-text: #0b172b;
  --settings-input-bg: rgba(8, 18, 32, 0.66);
  --settings-input-border: var(--glass-line);
  color: var(--glass-text);
  background: rgba(18, 29, 47, 0.94);
  border: 1px solid var(--glass-line);
  border-radius: var(--glass-radius);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
}

.settingsSidebar, .settingsMain, .settingsMainBody {
  background: transparent;
}

.settingsCardSection {
  background: rgba(139, 176, 231, 0.04);
  border-color: var(--glass-line);
}

@supports not (backdrop-filter: blur(1px)) {
  .panel.left, .panel.right { background: #172238; }
}

@media (max-width: 900px) {
  .app { padding: 6px; gap: 6px; }
  .panel.left, .panel.mid, .panel.right { border-radius: 14px; }
  .panel.left, .panel.right { backdrop-filter: blur(10px); }
}

@media (prefers-reduced-motion: reduce) {
  .dmItem, .dm-item, .serverChannelRow { transition: none; }
}

@media (prefers-reduced-transparency: reduce) {
  .panel.left, .panel.mid, .panel.right { background: #172238; backdrop-filter: none; }
}`,
});
