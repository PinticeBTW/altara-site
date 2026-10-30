// This is the same validated package contract available to every creator.
// Native slots own the data/actions; these rules only select their materials.
export const ALTARA_GLASS_THEME = Object.freeze({
  format: 'altara-theme', apiVersion: 2, name: 'ALTARA Glass', author: 'ALTARA',
  version: '0.4.0', layout: 'glass-home', assets: Object.freeze({}),
  description: 'An architectural Home with warm light, translucent glass and a carefully composed native dashboard.',
  css: `
:root {
 --glass-wallpaper: none;
 --glass-text: var(--ct-text,#f7f0e9); --glass-muted: var(--ct-muted,#beb6b1); --glass-accent: var(--ct-accent,#ecc7a6);
 --glass-line: rgba(255,230,209,.16); --glass-fill: color-mix(in srgb,var(--ct-surface,#161414) calc(var(--ct-surface-alpha,.38) * 100%),transparent);
}
.app {
 --altara-text: var(--glass-text); --altara-text-soft: #ded3cb; --altara-text-muted: var(--glass-muted);
 --text: var(--glass-text); --text-soft: #ded3cb; --muted: var(--glass-muted);
 --accent: var(--glass-accent); --altara-accent: var(--glass-accent); --altara-accent-text: #251c16;
 --altara-surface: #211e1d; --altara-surface-elevated: #2b2725; --altara-input: #191716;
 --border: var(--glass-line); --altara-border: var(--glass-line); --border-strong: rgba(255,230,209,.3);
 --ui-primary-bg: var(--glass-accent); --ui-primary-text: #251c16;
 font-family: var(--ct-font,'Segoe UI'), system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
 color: var(--glass-text); gap: 14px; padding: 16px;
 background: linear-gradient(90deg,rgba(7,8,9,.67),rgba(10,9,9,.32) 64%,rgba(10,9,9,.28)),var(--glass-wallpaper) center / cover;
 border-radius: 22px; background-color: var(--ct-background,#101010);
}
.panel.left, .panel.mid, .panel.right {
 border: var(--ct-border,1px) solid var(--glass-line); border-radius: 22px; background: var(--glass-fill);
 box-shadow: inset 0 1px 0 rgba(255,244,232,.09),0 12px 32px rgba(0,0,0,.16);
}
.panel.left, .panel.right { backdrop-filter: blur(14px) saturate(1.15); }
.panel.mid { background: rgba(16,16,17,.3); }
.app #leftGroupsRail, .app .leftDockDms, .app .leftDockDms__list, .app .leftTop,
.app .leftList, .app #dmList, .app #dmMain, .app #botDmMain, .app .botDmMain,
.app .dmMainBody, .app .dmThread, .app .dmMessages, .app #dmProfilePanel, .app #serverMembersPanel {
 background: transparent; background-image: none;
}
.dmHeader, .midTop, .dmComposer { background: rgba(26,25,25,.34); border-color: var(--glass-line); }
.dmComposer { backdrop-filter: blur(12px); border-radius: 0 0 22px 22px; }
#dmInputWrap, .dmInputWrap, .dmComposer textarea, .dmComposer input, .app .input {
 background: rgba(13,13,14,.42); color: var(--glass-text); border-color: var(--glass-line); border-radius: 12px;
}
.dm-item, .dmItem, .serverChannelRow { border-radius: 12px; }
.dm-item:hover, .dmItem:hover, .serverChannelRow:hover { background: rgba(243,211,181,.08); }
.dm-item.is-active, .dm-item.active, .dmItem.is-active, .serverChannelRow.is-active {
 background: rgba(243,211,181,.14); border-color: rgba(243,211,181,.3);
}
.groupOrb { border-radius: 50%; background: rgba(35,31,29,.46); border-color: var(--glass-line); }
.groupOrb--app-home { border-radius: 20px; }
.btn.primary { background: linear-gradient(135deg,#f1d6b8,#dcb28e); color: #241b15; border-color: rgba(255,230,209,.3); }
.app .btn.ghost, .app .chip { background: rgba(52,45,41,.3); border-color: var(--glass-line); color: var(--glass-text); }
.chip.active { background: rgba(224,180,142,.2); border-color: rgba(239,204,172,.4); }
.app button:focus-visible, .app input:focus-visible, .app textarea:focus-visible, .app select:focus-visible {
 outline: 2px solid var(--glass-accent); outline-offset: 3px;
}
.app #widgetsGrid .widgetCard, [data-theme-slot="home-activity"], [data-theme-slot="home-servers"], [data-theme-slot="home-status-actions"] button {
 background: linear-gradient(140deg,rgba(255,239,224,.06),rgba(255,239,224,.01) 50%,rgba(255,213,175,.035)),color-mix(in srgb,var(--ct-surface,#161414) calc(var(--ct-surface-alpha,.35) * 100%),transparent);
 border: 1px solid var(--glass-line); border-radius: var(--ct-radius,22px);
 backdrop-filter: theme-filter(liquid-glass) blur(var(--ct-blur,12px)) saturate(1.16);
 box-shadow: inset 0 1px 0 rgba(255,244,232,.09),inset 0 -1px 0 rgba(255,218,184,.03),0 var(--ct-shadow,10px) calc(var(--ct-shadow,10px) * 2.8) rgba(0,0,0,.14);
 color: var(--glass-text);
}
.app #widgetsGrid .widgetCard { padding: 18px; }
.app #widgetsGrid .widgetCard__label, [data-theme-slot="home-servers"] h2 {
 color: var(--glass-text); font-size: 15px; font-weight: 500; letter-spacing: -.15px; text-transform: none;
}
.app #widgetsGrid .widgetCard__label svg { width: 16px; height: 16px; }
.app #widgetsGrid .widgetCard__meta, .app #widgetsGrid .hint { color: var(--glass-muted); font-weight: 400; }
.app #widgetsGrid .widgetCard__value { font-size: 32px; font-weight: 500; letter-spacing: -.8px; }
.app #widgetsGrid textarea, .app #widgetsGrid input[type="text"] { background: rgba(13,13,14,.26); color: var(--glass-text); border-color: var(--glass-line); }
.profileTimerWidget, .profileChecklistWidget, .profileNotepadWidget { --profile-widget-accent: var(--glass-accent); }
.profileTimerWidget {
 --timer-accent: var(--glass-accent); --timer-accent-strong: #f4d7bc;
 --timer-surface: rgba(27,24,22,.54); --timer-surface-elevated: #302923; --timer-border: rgba(246,220,195,.16);
 --timer-text: var(--glass-text); --timer-text-soft: #e5d4c6; --timer-text-muted: var(--glass-muted);
}
.profileTimerWidget[data-profile-timer-phase="break"] { --timer-accent: #aab99d; --timer-accent-strong: #ccd8bd; }
.profileTimerKicker, .profileChecklistTitle { font-weight: 500; }
.profileTimerWidget--large .profileTimerTime { font-size: 38px; font-weight: 500; }
.profileTimerPhase, .profileTimerSubline, .profileTimerNext { font-weight: 400; }
.profileChecklistProgressBar > span, .profileChecklistProgressFill { background: var(--glass-accent); }
.profileNotepadTextarea { border-radius: 10px; }

.app[data-theme-window-frame="caption-overlay"] { padding-top: calc(16px + var(--desktop-titlebar-overlay-height,40px)); }

/* The host marker follows the real native tab and account lifecycle. */
.app[data-theme-home-layout="dashboard"] {
 --left-sidebar-width: 76px; --left-rail-column-width: 76px; --friends-sidebar-width: 0px;
 --right-sidebar-width: 300px; --app-grid-gap: var(--ct-spacing,20px);
 grid-template-columns: 76px minmax(0,1fr) 300px; gap: var(--ct-spacing,20px); padding: 18px 20px;
}
.app[data-theme-home-layout="dashboard"][data-theme-window-frame="caption-overlay"] { padding-top: calc(18px + var(--desktop-titlebar-overlay-height,40px)); }
.app[data-theme-home-layout="dashboard"].right-collapsed { grid-template-columns: 76px minmax(0,1fr); }
.app[data-theme-home-layout="dashboard"] .panel.left {
 display: flex; flex-direction: column; width: 76px; min-width: 76px; max-width: 76px;
 background: rgba(10,11,12,.2); background-image: none; border-color: rgba(255,230,209,.09); border-radius: 24px;
 backdrop-filter: blur(10px);
}
.app[data-theme-home-layout="dashboard"] .leftTabsSingle,
.app[data-theme-home-layout="dashboard"] .searchBox,
.app[data-theme-home-layout="dashboard"] .leftDockDms,
.app[data-theme-home-layout="dashboard"] #leftSidebarResizer { display: none; }
.app[data-theme-home-layout="dashboard"] .leftTop { display: contents; }
.app[data-theme-home-layout="dashboard"] .leftList {
 display: flex; width: 100%; min-width: 0; padding: 0; order: 0; flex: 1 1 auto; min-height: 0;
}
.app[data-theme-home-layout="dashboard"] .leftDockGroups {
 display: flex; flex: 1 1 auto; width: 100%; min-width: 0; max-width: 100%; border: 0; padding: 12px 0; background: transparent;
}
.app[data-theme-home-layout="dashboard"] #leftGroupsRail { width: 100%; align-items: center; gap: 12px; }
.app[data-theme-home-layout="dashboard"] #leftBottomVoiceStack {
 order: 2; position: static; align-self: stretch; width: 100%; box-sizing: border-box; grid-column: auto; grid-row: auto;
 padding: 8px; margin: auto 0 0; transform: none; overflow: visible;
}
.app[data-theme-home-layout="dashboard"] #meProfileCard {
 display: flex; flex-direction: column; gap: 8px; padding: 8px 0; min-height: 0; background: transparent; border: 0;
}
.app[data-theme-home-layout="dashboard"] #meProfileCard .meText { display: none; }
.app[data-theme-home-layout="dashboard"] #meProfileCard .meControls {
 display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-width: 0; margin: 0; gap: 6px;
}
.app[data-theme-home-layout="dashboard"] .panel.mid {
 border: 0; background: transparent; background-image: none; border-radius: 0; box-shadow: none;
 position: relative; display: flex; flex-direction: column; min-height: 0;
}
.app[data-theme-home-layout="dashboard"] .midTop { display: none; }
.app[data-theme-home-layout="dashboard"] #tabWidgets {
 background: transparent; background-image: none; padding: 0 0 24px; gap: 18px;
 display: grid; grid-template-columns: minmax(0,1fr) 244px; grid-auto-rows: max-content; align-content: start; flex: 1 1 auto;
 overflow-y: auto; overflow-x: hidden; height: 100%; min-height: 0;
}
[data-theme-slot="home-presentation"] { display: contents; }
[data-theme-slot="home-presentation"][hidden] { display: none; }
[data-theme-slot="home-navigation"] {
 grid-column: 1 / -1; display: flex; align-items: center; gap: 22px; min-height: 56px; padding: 0 2px; min-width: 0;
}
.themeHomeBrand { font-size: 14px; letter-spacing: 5px; font-weight: 600; color: #f5dfca; }
.themeHomeNavigationLinks {
 display: flex; padding: 4px; gap: 2px; border-radius: 30px; border: 1px solid var(--glass-line);
 background: rgba(30,27,26,.26); backdrop-filter: blur(10px);
}
.themeHomeNavButton { color: var(--glass-text); background: transparent; border: 0; border-radius: 26px; padding: 10px 19px; font: inherit; font-size: 13px; font-weight: 400; cursor: pointer; }
.themeHomeNavButton.is-current { background: linear-gradient(145deg,rgba(234,181,134,.3),rgba(234,181,134,.09)); box-shadow: inset 0 1px 0 rgba(255,239,218,.16),0 4px 14px rgba(220,166,116,.1); }
.themeHomeNativeActions { min-width: 0; margin-left: auto; }
.app[data-theme-home-layout="dashboard"] .themeHomeNativeActions .widgetsHeaderActions { margin: 0; gap: 6px; min-height: 0; }
.app[data-theme-home-layout="dashboard"] .themeHomeNativeActions .widgetsHeaderActions .btn { font-size: 11px; min-height: 32px; padding: 6px 9px; border-radius: 12px; font-weight: 400; }
[data-theme-slot="home-hero"] { grid-column: 1; padding: 16px 14px 16px; min-height: 274px; height: max-content; min-width: 0; }
[data-theme-slot="home-date"] { font-size: 13px; color: var(--glass-muted); margin: 0 0 12px; }
.themeHomeHeading {
 margin: 0; font-family: var(--ct-font,'Segoe UI'),system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
 font-size: clamp(42px,4.3vw,68px); font-weight: 300; line-height: 1.06; letter-spacing: -2.4px;
}
[data-theme-slot="home-greeting"], [data-theme-slot="home-name"] { display: block; }
[data-theme-slot="home-name"] { color: var(--glass-accent); font-weight: 650; padding-top: 2px; overflow-wrap: anywhere; font-size: clamp(36px,4vw,64px); }
.themeHomeWelcome { font-size: 17px; color: var(--glass-muted); margin: 14px 0 20px; font-weight: 400; }
[data-theme-slot="home-status-actions"] { display: flex; flex-wrap: wrap; gap: 10px; }
[data-theme-slot="home-status-actions"] button { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 20px; font: inherit; cursor: pointer; }
.themeHomeStatusButton svg { width: 21px; height: 21px; color: var(--glass-accent); }
.themeHomeStatusCopy { display: grid; text-align: left; gap: 3px; font-size: 12px; }
.themeHomeStatusCopy strong { font-weight: 500; }
.themeHomeStatusCopy span { font-size: 11px; color: var(--glass-muted); }
.themeHomeStatusButton.is-active { border-color: rgba(239,204,172,.4); background: rgba(220,169,124,.12); }
[data-theme-slot="home-activity"] { grid-column: 2; align-self: center; display: grid; grid-template-columns: 62px minmax(0,1fr); gap: 14px; padding: 20px; min-height: 148px; min-width: 0; }
.themeHomeCardEyebrow { grid-column: 1 / -1; color: var(--glass-muted); font-size: 11px; margin: 0; }
.themeHomeActivityArtwork { display: flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 15px; overflow: hidden; background: rgba(255,226,198,.07); font-size: 25px; color: var(--glass-accent); }
.themeHomeActivityArtwork img { width: 100%; height: 100%; object-fit: cover; }
.themeHomeActivityCopy { align-self: center; min-width: 0; }
.themeHomeActivityCopy h2 { font-size: 14px; font-weight: 500; margin: 0 0 6px; overflow-wrap: anywhere; }
.themeHomeActivityCopy p { font-size: 12px; color: var(--glass-muted); margin: 0; overflow-wrap: anywhere; }
.themeHomeActivity[data-state="empty"] { grid-template-columns: 1fr; min-height: 112px; }
.themeHomeEmpty { color: var(--glass-muted); font-size: 12px; line-height: 1.6; margin: 0; }
[data-theme-slot="home-servers"] { grid-column: 1 / -1; padding: 16px; min-width: 0; }
.themeHomeSectionTitle { margin: 0 0 13px; }
.themeHomeServerList {
 display: grid; grid-auto-flow: column; grid-auto-columns: minmax(170px,1fr); grid-template-columns: none;
 gap: 12px; overflow-x: auto; overscroll-behavior-inline: contain; padding-bottom: 3px;
}
[data-theme-slot="home-server-card"] {
 position: relative; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end;
 min-width: 0; min-height: 132px; overflow: hidden; border: 1px solid rgba(255,230,209,.2); border-radius: 19px; padding: 16px;
 background: linear-gradient(150deg,rgba(125,109,95,.1),rgba(13,14,17,.46)); color: var(--glass-text); text-align: left; font: inherit; cursor: pointer;
}
.themeHomeServerBanner { position: absolute; inset: 0; opacity: .64; pointer-events: none; }
.themeHomeServerBanner img { width: 100%; height: 100%; object-fit: cover; }
.themeHomeServerIcon { position: relative; display: flex; justify-content: center; align-items: center; width: 32px; height: 32px; margin-bottom: 12px; border-radius: 10px; background: rgba(14,14,15,.52); font-weight: 600; }
.themeHomeServerIcon img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.themeHomeServerCopy { position: relative; display: grid; gap: 5px; }
.themeHomeServerCopy strong { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.themeHomeServerMeta { font-size: 11px; color: #d5c8c0; }
.themeHomeServerCard > svg { position: absolute; top: 13px; right: 13px; width: 17px; height: 17px; color: var(--glass-muted); }
.app[data-theme-home-layout="dashboard"] #widgetsGrid { grid-column: 1 / -1; --widgets-gap: 16px; }
.app #activeNow, .app #offlineList, .app .rightBody, .app .rightTop { background: transparent; background-image: none; }
.app .rightTop { padding: 21px 20px 13px; }
.app .rightTop .hTitle, .app .rightTop .rightHead, .app .rightTop h2, .app .rightTop .sectionTitle { background: transparent; font-size: 15px; font-weight: 500; text-transform: none; letter-spacing: 0; }
.app .rightBody { padding: 0 18px 18px; }
.app #activeNow { gap: 0; }
.app #activeNow .presenceRow { background: transparent; border: 0; border-bottom: 1px solid rgba(255,230,209,.09); border-radius: 0; padding: 12px 0; box-shadow: none; gap: 0; }
.app #activeNow .presenceRow:last-child { border-bottom: 0; }
.app #activeNow .presenceName { font-weight: 500; font-size: 13px; }
.app #activeNow .presenceListening { padding-left: 48px; margin-top: -10px; gap: 8px; }
.app #activeNow .presenceRow:has(.presenceListening) { gap: 0; }
.app #activeNow .presenceActivityText { display: flex; flex-wrap: wrap; gap: 4px; }
.app #activeNow .presenceActivityLabel, .app #activeNow .presenceActivityTitle { font-size: 11px; color: var(--glass-muted); font-weight: 400; }
.app #activeNow .presenceActivityMeta { margin-left: auto; font-size: 10px; color: var(--glass-muted); }
.app #activeNow .presenceHandle { display: none; }
.app #activeNow .presenceLeft { gap: 12px; align-items: center; }
.app #activeNow .presenceAvatar { width: 36px; height: 36px; }
.app[data-theme-home-layout="dashboard"] .panel.right { align-self: start; margin-top: 76px; height: auto; max-height: calc(100% - 76px); background: rgba(22,20,20,.34); }
.app[data-theme-home-layout="dashboard"] .rightBody { flex: 0 1 auto; }
.app #meProfileCard { background: rgba(21,20,19,.3); background-image: none; border-color: var(--glass-line); }
.app[data-theme-home-layout="dashboard"]:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { --left-sidebar-width: 248px; grid-template-columns: 248px minmax(0,1fr) 300px; }
.app[data-theme-home-layout="dashboard"].right-collapsed:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { grid-template-columns: 248px minmax(0,1fr); }
.app[data-theme-home-layout="dashboard"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { width: 248px; min-width: 248px; max-width: 248px; }
.app[data-theme-home-layout="dashboard"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) #meProfileCard { flex-direction: row; justify-content: space-around; }
.app[data-theme-home-layout="dashboard"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) #meProfileCard .meControls { flex-direction: row; }
/* This native arrangement is an explicit user choice, never activation side effects.
   The actual grid remains measurable, with equal cells for native drag/resize. */
@media (min-width: 1181px) {
 .app[data-theme-home-layout="dashboard"][data-theme-widget-preset="glass-dashboard"] .panel.left { grid-column: 1; grid-row: 1; }
 .app[data-theme-home-layout="dashboard"][data-theme-widget-preset="glass-dashboard"] .panel.mid { grid-column: 2 / -1; grid-row: 1; }
 .app[data-theme-home-layout="dashboard"][data-theme-widget-preset="glass-dashboard"] .panel.right { grid-column: 3; grid-row: 1; max-height: 380px; }
 .app[data-theme-home-layout="dashboard"][data-theme-widget-preset="glass-dashboard"] #tabWidgets { grid-template-columns: minmax(0,1fr) 244px 300px; }
 .app[data-theme-home-layout="dashboard"][data-theme-widget-preset="glass-dashboard"] [data-theme-slot="home-servers"] { grid-column: 1 / 3; }
 .app[data-theme-home-layout="dashboard"][data-theme-widget-preset="glass-dashboard"] #widgetsGrid { --widgets-cols: 6; grid-template-columns: repeat(6,minmax(0,1fr)); }
}
@media (max-width: 1180px) {
 .app[data-theme-home-layout="dashboard"] { grid-template-columns: 70px minmax(0,1fr); gap: 14px; padding: 14px; --left-rail-column-width: 70px; --left-sidebar-width: 70px; }
 .app[data-theme-home-layout="dashboard"][data-theme-window-frame="caption-overlay"] { padding-top: calc(14px + var(--desktop-titlebar-overlay-height,40px)); }
 .app[data-theme-home-layout="dashboard"].right-collapsed { grid-template-columns: 70px minmax(0,1fr); }
 .app[data-theme-home-layout="dashboard"] .panel.left { width: 70px; min-width: 70px; max-width: 70px; }
 .app[data-theme-home-layout="dashboard"] .panel.right { display: none; }
 .app[data-theme-home-layout="dashboard"] #tabWidgets { grid-template-columns: minmax(0,1fr) 216px; }
 .themeHomeBrand { letter-spacing: 3px; }
 [data-theme-slot="home-navigation"] { gap: 14px; flex-wrap: wrap; }
 .themeHomeNavButton { padding: 9px 15px; }
 [data-theme-slot="home-hero"] { padding: 26px 8px 16px; }
 [data-theme-slot="home-activity"] { padding: 16px; grid-template-columns: 52px minmax(0,1fr); }
 .themeHomeActivityArtwork { width: 52px; height: 52px; }
 .app[data-theme-home-layout="dashboard"]:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { grid-template-columns: 224px minmax(0,1fr); --left-sidebar-width: 224px; }
 .app[data-theme-home-layout="dashboard"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { width: 224px; min-width: 224px; max-width: 224px; }
}
@media (max-width: 640px) {
 .app[data-theme-home-layout="dashboard"] { grid-template-columns: 56px minmax(0,1fr); gap: 10px; padding: 8px; --left-rail-column-width: 56px; --left-sidebar-width: 56px; }
 .app[data-theme-home-layout="dashboard"][data-theme-window-frame="caption-overlay"] { padding-top: calc(8px + var(--desktop-titlebar-overlay-height,40px)); }
 .app[data-theme-home-layout="dashboard"].right-collapsed { grid-template-columns: 56px minmax(0,1fr); }
 .app[data-theme-home-layout="dashboard"] .panel.left { width: 56px; min-width: 56px; max-width: 56px; }
 .app[data-theme-home-layout="dashboard"] #tabWidgets { grid-template-columns: 1fr; gap: 14px; }
 [data-theme-slot="home-navigation"] { gap: 10px; }
 .themeHomeBrand { width: 100%; font-size: 12px; }
 .themeHomeNativeActions { width: 100%; margin-left: 0; }
 .themeHomeNavButton { padding: 9px 17px; }
 [data-theme-slot="home-hero"] { padding: 20px 4px 8px; min-height: 230px; }
 .themeHomeHeading { font-size: 42px; letter-spacing: -1.7px; }
 [data-theme-slot="home-name"] { font-size: 40px; }
 [data-theme-slot="home-activity"] { grid-column: 1; min-height: 104px; }
 .themeHomeServerList { grid-auto-columns: minmax(156px,1fr); }
 .app[data-theme-home-layout="dashboard"]:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) #tabWidgets { grid-template-columns: 1fr; }
}
@media (prefers-reduced-transparency: reduce) {
 .app .panel.left, .app .panel.mid, .app .panel.right, .app #widgetsGrid .widgetCard,
 [data-theme-slot="home-activity"], [data-theme-slot="home-servers"], [data-theme-slot="home-status-actions"] button,
 .themeHomeStatusButton.is-active, .app .dmComposer, .themeHomeNavigationLinks {
 background: #242222; background-color: #242222; background-image: none; backdrop-filter: none;
 }
 .app[data-theme-home-layout="dashboard"] .panel.mid, .app[data-theme-home-layout="dashboard"] #tabWidgets { background: transparent; background-image: none; }
 .app[data-theme-home-layout="dashboard"] .panel.left { background: #151516; }
 .app[data-theme-home-layout="dashboard"] .panel.right { background: #242222; background-image: none; backdrop-filter: none; }
 .app #widgetsGrid textarea, .app #widgetsGrid input[type="text"] { background: #171718; }
 .app [data-theme-slot="home-server-card"] { background: #1c1c1e; }
}

/* glass-home is a public native layout, independent from personal widget placement. */
.app[data-theme-home-layout="glass-home"], .app[data-theme-home-layout="glass-home"].right-collapsed {
 --left-sidebar-width: 64px; --left-rail-column-width: 64px; --friends-sidebar-width: 0px;
 --glass-home-fill: color-mix(in srgb,var(--ct-surface,#171619) calc(var(--ct-surface-alpha,.34) * 100%),transparent);
 --glass-home-body: clamp(12.5px,.85vw,15px); --glass-home-title: clamp(14px,1vw,17px); --glass-home-meta: clamp(11px,.78vw,13.5px);
 grid-template-columns: 64px minmax(0,1fr); gap: 32px; padding: 20px 20px 14px 16px; font-size: var(--glass-home-body); line-height: 1.45;
}
.app[data-theme-home-layout="glass-home"][data-theme-window-frame="caption-overlay"] { padding-top: var(--desktop-titlebar-overlay-height,40px); }
.app[data-theme-home-layout="glass-home"] .panel.left {
 grid-column: 1; grid-row: 1; display: flex; flex-direction: column; align-self: stretch;
 width: 64px; min-width: 64px; max-width: 64px; margin-top: 70px; border-radius: 23px;
 background: rgba(14,14,16,.32); border: 1px solid rgba(255,238,218,.12); box-shadow: inset 0 1px 0 rgba(255,247,228,.045);
 backdrop-filter: blur(10px) saturate(1.08);
}
.app[data-theme-home-layout="glass-home"] .leftTabsSingle,
.app[data-theme-home-layout="glass-home"] .searchBox,
.app[data-theme-home-layout="glass-home"] .leftDockDms,
.app[data-theme-home-layout="glass-home"] #leftSidebarResizer { display: none; }
.app[data-theme-home-layout="glass-home"] .leftTop { display: contents; }
.app[data-theme-home-layout="glass-home"] .leftList { display: flex; width: 100%; min-width: 0; padding: 0; flex: 1 1 auto; min-height: 0; order: 0; }
.app[data-theme-home-layout="glass-home"] .leftDockGroups { display: flex; flex: 1 1 auto; width: 100%; max-width: 100%; min-width: 0; padding: 10px 0; border: 0; background: transparent; }
.app[data-theme-home-layout="glass-home"] #leftGroupsRail { width: 100%; height: 100%; align-items: center; gap: 12px; padding: 0 0 8px; scroll-padding-top: 0; }
.app[data-theme-home-layout="glass-home"] .leftDockGroups::before { display: none; }
.app[data-theme-home-layout="glass-home"] .groupOrb { width: 46px; height: 46px; border-radius: 50%; border-color: rgba(240,217,195,.17); background: rgba(36,32,31,.28); box-shadow: 0 2px 12px rgba(0,0,0,.14); }
.app[data-theme-home-layout="glass-home"] .groupOrb--app-home { width: 58px; height: 70px; border-radius: 22px; background: linear-gradient(155deg,rgba(58,50,45,.23),rgba(15,15,18,.55)); border: 1px solid rgba(234,209,185,.18); }
.app[data-theme-home-layout="glass-home"] .groupOrb--app-home .groupOrbAppLogo,
.app[data-theme-home-layout="glass-home"] .groupOrb--app-home .groupOrbFallback { display: none; }
.app[data-theme-home-layout="glass-home"] .groupOrb--app-home .glassHomeRailBrand { display: block; width: 32px; height: 36px; color: #edc8a8; filter: drop-shadow(0 2px 8px rgba(230,176,128,.13)); }
.app[data-theme-home-layout="glass-home"] .groupOrb.active { border-color: rgba(238,200,165,.5); box-shadow: inset 0 -2px 0 #d7ad87,0 8px 16px rgba(205,162,128,.08); }
.app[data-theme-home-layout="glass-home"] #leftBottomVoiceStack { position: static; order: 2; align-self: stretch; margin: auto 0 0; padding: 6px; transform: none; width: 100%; grid-column: auto; grid-row: auto; }
.app[data-theme-home-layout="glass-home"] #meProfileCard { display: flex; flex-direction: column; gap: 6px; padding: 7px 0; border: 0; background: transparent; }
.app[data-theme-home-layout="glass-home"] #meProfileCard .meText { display: none; }
.app[data-theme-home-layout="glass-home"] #meProfileCard .meControls { display: flex; flex-direction: column; align-items: center; width: 100%; min-width: 0; margin: 0; gap: 5px; }
.app[data-theme-home-layout="glass-home"] .panel.right { display: none; }
.app[data-theme-home-layout="glass-home"] .panel.mid {
 grid-column: 2; grid-row: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0;
 border: 0; border-radius: 0; background: transparent; background-image: none; box-shadow: none;
}
.app[data-theme-home-layout="glass-home"] .midTop { display: none; }
.app[data-theme-home-layout="glass-home"] #tabWidgets { display: block; min-height: 0; height: 100%; padding: 0; background: transparent; background-image: none; overflow-y: auto; overflow-x: hidden; }
.app[data-theme-home-layout="glass-home"] #widgetsGrid,
.app[data-theme-home-layout="glass-home"] .widgetsHeader { display: none; }
.app[data-theme-home-layout="glass-home"] [data-theme-slot="home-presentation"] { display: flex; flex-direction: column; width: 100%; max-width: 1600px; min-width: 0; margin-inline: auto; gap: 16px; padding-bottom: 4px; }
.app[data-theme-home-layout="glass-home"] [data-theme-slot="home-presentation"][hidden] { display: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeNavigation {
 display: flex; align-items: center; gap: clamp(26px,3.32vw,51px); min-height: 54px; min-width: 0; padding: 0 4px;
}
.app[data-theme-home-layout="glass-home"] .glassHomeBrand { display: flex; align-items: center; gap: 13px; flex: 0 0 auto; color: #f4dfcc; font-size: var(--glass-home-title); font-weight: 600; letter-spacing: 5px; }
.app[data-theme-home-layout="glass-home"] .glassHomeBrandMark { width: 25px; height: 29px; flex: 0 0 auto; color: #f0c8a6; }
.app[data-theme-home-layout="glass-home"] .glassHomeNavigationLinks { display: flex; padding: 4px; flex: 0 0 auto; gap: 2px; border-radius: 30px; border: 1px solid rgba(249,226,206,.16); background: rgba(66,55,48,.18); backdrop-filter: blur(10px); }
.app[data-theme-home-layout="glass-home"] .glassHomeNavButton { display: inline-flex; align-items: center; min-height: 35px; padding: 8px clamp(19px,1.36vw,23px); border: 0; border-radius: 26px; font: inherit; font-size: clamp(13px,.95vw,16px); font-weight: 400; color: #f5eee9; background: transparent; text-decoration: none; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeNavButton.is-current { border: 1px solid rgba(239,206,174,.3); background: linear-gradient(160deg,rgba(216,168,125,.34),rgba(214,170,132,.12)); box-shadow: 0 5px 20px rgba(229,174,123,.1),inset 0 1px 1px rgba(255,243,225,.13); }
.app[data-theme-home-layout="glass-home"] .glassHomeSearch { display: flex; align-items: center; gap: 11px; position: relative; flex: 1 1 330px; min-width: 150px; max-width: clamp(330px,22.3vw,380px); min-height: 45px; padding: 0 16px; border: 1px solid rgba(245,220,200,.2); border-radius: 26px; background: rgba(71,58,49,.17); backdrop-filter: blur(12px); }
.app[data-theme-home-layout="glass-home"] .glassHomeSearch > svg { width: 19px; height: 19px; flex: 0 0 auto; color: #c5bbb5; }
.app[data-theme-home-layout="glass-home"] .glassHomeSearch input { min-width: 0; width: 100%; padding: 0; border: 0; background: transparent; color: var(--glass-text); font: inherit; font-size: var(--glass-home-body); box-shadow: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeSearch input::placeholder { color: #bdb4ad; }
.app[data-theme-home-layout="glass-home"] .glassHomeSearchResults { position: absolute; top: 53px; right: 0; left: 0; padding: 8px; border: 1px solid rgba(245,221,200,.2); border-radius: 17px; z-index: 4; background: #24201e; box-shadow: 0 12px 30px rgba(0,0,0,.3); }
.app[data-theme-home-layout="glass-home"] .glassHomeSearchResults[hidden] { display: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeSearchResult { display: block; width: 100%; border: 0; padding: 9px 10px; border-radius: 10px; color: var(--glass-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeSearchResult:hover { background: rgba(243,207,176,.12); }
.app[data-theme-home-layout="glass-home"] .glassHomeSearchResults p { font-size: var(--glass-home-meta); color: var(--glass-muted); margin: 8px; }
.app[data-theme-home-layout="glass-home"] .glassHomeHeaderActions { display: flex; align-items: center; gap: 10px; margin-left: auto; flex: 0 0 auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeNativeActions { display: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeIconButton { display: inline-flex; align-items: center; justify-content: center; width: clamp(38px,2.73vw,46px); height: clamp(38px,2.73vw,46px); padding: 0; border: 1px solid rgba(242,221,202,.09); border-radius: 50%; color: #f6eadd; background: rgba(65,53,46,.24); backdrop-filter: blur(10px); cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeIconButton svg { width: 19px; height: 19px; }
.app[data-theme-home-layout="glass-home"] .glassHomeProfileButton { display: flex; align-items: center; gap: 10px; min-width: 140px; max-width: 210px; padding: 6px 12px 6px 6px; border: 1px solid rgba(233,206,183,.15); border-radius: 28px; background: rgba(26,23,23,.25); color: var(--glass-text); font: inherit; text-align: left; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeProfileButton > svg { width: 16px; height: 16px; margin-left: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeProfileCopy { display: grid; gap: 3px; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeProfileCopy strong { font-size: var(--glass-home-body); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeProfileCopy span { font-size: var(--glass-home-meta); color: #c5beb9; }
.app[data-theme-home-layout="glass-home"] .glassHomeBoard { display: grid; grid-template-columns: minmax(210px,242fr) minmax(0,445fr) minmax(0,355fr) minmax(280px,310fr); grid-template-rows: minmax(332px,max-content) 212px minmax(288px,max-content); gap: 16px; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeCard {
 min-width: 0; border: var(--ct-border,1px) solid rgba(242,220,201,.18); border-radius: var(--ct-radius,23px); padding: 18px 20px; color: var(--glass-text);
 background: linear-gradient(145deg,rgba(245,234,224,.06),rgba(243,231,219,.01) 44%,rgba(237,197,161,.035)),var(--glass-home-fill);
 backdrop-filter: theme-filter(liquid-glass) blur(var(--ct-blur,12px)) saturate(1.12);
 box-shadow: inset 0 1px 0 rgba(255,246,234,.12),inset 0 -1px 0 rgba(235,208,180,.035),0 9px 27px rgba(3,3,5,.13);
}
.app[data-theme-home-layout="glass-home"] .glassHomeCardHeader { display: flex; align-items: center; gap: 9px; min-height: 21px; margin-bottom: 12px; }
.app[data-theme-home-layout="glass-home"] .glassHomeCardHeader h2 { min-width: 0; margin: 0; color: var(--glass-text); font-size: var(--glass-home-title); font-weight: 450; letter-spacing: -.15px; }
.app[data-theme-home-layout="glass-home"] .glassHomeQuietAction { margin-left: auto; padding: 3px 0; border: 0; color: #b9b0ad; background: transparent; font: inherit; font-size: var(--glass-home-meta); font-weight: 400; cursor: pointer; white-space: nowrap; }
.app[data-theme-home-layout="glass-home"] .glassHomeQuietAction:hover { color: #f4d6b9; }
.app[data-theme-home-layout="glass-home"] .glassHomeQuietIcon { display: inline-flex; align-items: center; justify-content: center; width: 29px; height: 29px; padding: 0; border: 1px solid rgba(247,226,207,.09); border-radius: 50%; color: #c9bcb3; background: rgba(230,215,200,.035); cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeQuietIcon svg { width: 17px; height: 17px; }
.app[data-theme-home-layout="glass-home"] .glassHomeCardHeader h2 + .glassHomeQuietIcon { margin-left: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero { grid-column: 1 / 4; grid-row: 1; padding: 30px 68px 14px; min-height: 0; width: min(760px,100%); height: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeDate { margin-bottom: 9px; font-size: clamp(13px,.95vw,16px); color: #ada8a8; font-weight: 350; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeHeading { font-family: 'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,sans-serif; font-size: clamp(64px,4.45vw,78px); line-height: 1.05; letter-spacing: -2.5px; font-weight: 300; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeGreeting { font-weight: 300; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeName { display: flex; align-items: center; gap: 17px; font-size: clamp(54px,4.25vw,74px); line-height: 1.13; font-weight: 650; letter-spacing: -2px; padding-top: 0; color: #edc8a8; }
.app[data-theme-home-layout="glass-home"] .glassHomeSparkle { font-size: 32px; font-weight: 400; letter-spacing: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeNameText { min-width: 0; flex: 0 1 auto; overflow-wrap: anywhere; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero[data-home-name-density="long"] .themeHomeName { font-size: clamp(28px,3vw,46px); letter-spacing: -1.2px; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero[data-home-name-density="long"] .glassHomeNameText { display: block; max-height: 2.26em; overflow: hidden; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeWelcome { margin: 5px 0 37px; font-size: 19px; color: #a5a0a1; font-weight: 350; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusActions { gap: 11px; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusButton { min-width: clamp(139px,9.6vw,165px); padding: 13px 16px; border-radius: 23px; gap: 12px; background: rgba(32,28,28,.34); backdrop-filter: blur(12px); border: 1px solid rgba(237,212,191,.14); box-shadow: inset 0 1px 0 rgba(253,240,225,.045),0 6px 20px rgba(0,0,0,.12); }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusCopy { font-size: var(--glass-home-body); gap: 2px; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusCopy strong { font-weight: 400; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusCopy span { font-size: var(--glass-home-meta); color: #aca3a0; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusButton svg { width: 23px; height: 23px; color: #beb8c3; }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusButton.is-active { background: rgba(44,41,35,.36); border-color: rgba(206,208,169,.19); }
.app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusButton.is-active svg { color: #55c66b; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivity { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; width: clamp(240px,16.93vw,292px); height: clamp(230px,16vw,274px); padding: 22px 20px; display: grid; grid-template-columns: 84px minmax(0,1fr); grid-template-rows: 95px 1fr; gap: 16px 14px; background: linear-gradient(155deg,rgba(242,222,203,.075),rgba(143,95,68,.055) 65%,rgba(12,11,15,.04)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityArtwork { width: 84px; height: 96px; overflow: hidden; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 32px; color: #d8bca5; background: rgba(7,7,10,.3); }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityArtwork img { width: 100%; height: 100%; object-fit: cover; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityCopy { align-self: center; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityCopy h2 { margin: 14px 0 4px; font-size: clamp(13px,.95vw,16px); font-weight: 450; line-height: 1.4; overflow-wrap: anywhere; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityCopy > p { margin: 0; font-size: var(--glass-home-meta); line-height: 1.5; color: #c6bbb6; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityCopy .glassHomeOverline { color: #b3a29a; font-size: clamp(10.5px,.72vw,13px); }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityLink { grid-column: 1 / -1; align-self: end; display: flex; align-items: center; justify-content: space-between; width: 100%; border: 1px solid rgba(236,211,189,.09); border-radius: 18px; padding: 9px 12px; color: #dbd0c5; background: rgba(218,189,166,.045); font: inherit; font-size: var(--glass-home-meta); cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityLink svg { width: 19px; height: 19px; }
.app[data-theme-home-layout="glass-home"] .glassHomeRecent { grid-column: 1; grid-row: 2; height: 299px; padding: 17px 18px; background: linear-gradient(145deg,rgba(234,230,235,.035),rgba(7,8,12,.07)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeToday { grid-column: 1; grid-row: 3; align-self: end; height: 176px; padding: 17px 18px; background: linear-gradient(135deg,rgba(176,117,78,.055),rgba(237,220,205,.025)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeServers { grid-column: 2 / 4; grid-row: 2; padding: 15px 14px 14px; background: linear-gradient(150deg,rgba(244,231,219,.045),rgba(6,8,12,.075)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeServers .glassHomeCardHeader { margin: 0 5px 11px; }
.app[data-theme-home-layout="glass-home"] .glassHomeServers .glassHomeCardHeader h2 { font-size: 16px; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerList { display: grid; grid-auto-flow: column; grid-auto-columns: 171px; grid-template-columns: clamp(240px,17.32vw,300px) repeat(2,minmax(0,1fr)) clamp(115px,8.35vw,144px); gap: 11px; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; overscroll-behavior-inline: contain; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerList > :first-child { width: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerList > :first-child { grid-column: span 1; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerCard { position: relative; min-width: 0; height: 151px; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; border: 1px solid rgba(246,219,197,.25); border-radius: 22px; padding: 16px 18px; color: var(--glass-text); background: linear-gradient(150deg,rgba(40,38,41,.45),rgba(18,17,20,.38)); font: inherit; text-align: left; overflow: hidden; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerBanner { position: absolute; inset: 0; opacity: .81; pointer-events: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerBanner img { width: 100%; height: 100%; object-fit: cover; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerIcon { display: flex; align-items: center; justify-content: center; position: relative; width: 45px; height: 45px; margin-bottom: 16px; border-radius: 13px; color: #edc6a4; font-size: 30px; font-weight: 400; background: rgba(8,8,11,.17); }
.app[data-theme-home-layout="glass-home"] .glassHomeServerIcon img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerIcon[data-image-fallback="true"] { width: 56px; height: 56px; margin-inline: auto; margin-bottom: 12px; border-radius: 0; background: transparent; font-size: 43px; color: #e6be9e; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerCard[data-has-banner="true"] .glassHomeServerIcon { display: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerCopy { display: grid; gap: 5px; position: relative; text-shadow: 0 1px 5px rgba(0,0,0,.45); width: 100%; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerCopy strong { font-size: var(--glass-home-title); font-weight: 500; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerList > :first-child .glassHomeServerCopy strong { font-size: clamp(17px,1.2vw,21px); font-weight: 550; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerCopy span { color: #c7c1c0; font-size: var(--glass-home-meta); font-weight: 350; }
.app[data-theme-home-layout="glass-home"] .glassHomeJoinCard { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 23px; width: auto; height: 151px; border: 1px dashed rgba(247,221,197,.17); border-radius: 22px; color: #c9bdb6; background: rgba(25,23,25,.11); font: inherit; font-size: var(--glass-home-meta); cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeJoinCard svg { width: 25px; height: 25px; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerDirectory { position: fixed; inset: auto; margin: 0; padding: 17px; border: 1px solid rgba(239,213,190,.28); border-radius: 22px; background: linear-gradient(145deg,rgba(246,229,211,.055),rgba(6,7,12,.05)),rgba(28,24,24,.88); color: var(--glass-text); font: inherit; backdrop-filter: blur(16px) saturate(1.12); box-shadow: inset 0 1px 0 rgba(253,235,215,.08),0 16px 50px rgba(0,0,0,.32); overflow-y: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeServerDirectory[hidden] { display: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryHeader { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryHeader h2 { font-size: var(--glass-home-title); font-weight: 500; margin: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryHeader small { color: var(--glass-muted); font-size: var(--glass-home-meta); }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryHeader .glassHomeQuietIcon { margin-left: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryList { display: grid; gap: 5px; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryRow { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 8px; border: 1px solid transparent; border-radius: 13px; color: var(--glass-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryRow:hover { border-color: rgba(233,203,176,.15); background: rgba(244,222,201,.06); }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryIcon { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 39px; height: 39px; border-radius: 12px; overflow: hidden; color: var(--glass-accent); background: rgba(201,174,148,.05); font-size: 21px; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryIcon img { width: 100%; height: 100%; object-fit: cover; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryCopy { display: grid; gap: 4px; flex: 1 1 auto; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryCopy strong { font-size: var(--glass-home-body); font-weight: 450; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryCopy small { color: var(--glass-muted); font-size: var(--glass-home-meta); }
.app[data-theme-home-layout="glass-home"] .glassHomeDirectoryRow > svg { width: 16px; height: 16px; color: var(--glass-muted); flex: 0 0 auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessages { grid-column: 2; grid-row: 3; padding: 14px 20px; background: linear-gradient(140deg,rgba(226,227,238,.035),rgba(6,7,12,.055)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeFocus { grid-column: 3; grid-row: 3; padding: 15px 20px; background: linear-gradient(140deg,rgba(239,213,184,.055),rgba(155,101,63,.045) 65%,rgba(12,9,10,.03)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeActive { grid-column: 4; grid-row: 1; height: 335px; padding: 17px 20px; background: linear-gradient(140deg,rgba(242,223,207,.065),rgba(24,17,20,.035)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeDirects { grid-column: 4; grid-row: 2; height: 272px; padding: 12px 20px; background: linear-gradient(140deg,rgba(235,219,203,.04),rgba(9,11,15,.055)),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeNotes { grid-column: 4; grid-row: 3; align-self: end; height: 236px; padding: 16px 20px; background: linear-gradient(145deg,rgba(189,117,68,.085),rgba(217,166,119,.025) 75%),var(--glass-home-fill); }
.app[data-theme-home-layout="glass-home"] .glassHomeMessagesList { display: grid; gap: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageRow { display: flex; align-items: center; gap: 13px; width: 100%; min-height: 44px; padding: 3px 0; border: 0; border-bottom: 1px solid rgba(255,236,219,.06); color: #f8f3ee; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageRow:last-child { border-bottom: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageCopy { display: grid; gap: 3px; flex: 1 1 auto; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageCopy strong { font-size: var(--glass-home-body); line-height: 1.2; font-weight: 450; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageCopy > span { color: #b4afb3; font-size: var(--glass-home-body); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageMeta { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeMessageMeta small { color: #a49b9e; font-size: var(--glass-home-meta); }
.app[data-theme-home-layout="glass-home"] .glassHomeUnread { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 17px; padding: 0 4px; border-radius: 6px; background: #e6c5a7; color: #34271f; font-size: clamp(10.5px,.72vw,13px); font-weight: 600; }
.app[data-theme-home-layout="glass-home"] .glassHomeAvatar { display: flex; align-items: center; justify-content: center; position: relative; flex: 0 0 auto; width: clamp(38px,2.75vw,48px); height: clamp(38px,2.75vw,48px); border: 1px solid rgba(234,215,199,.2); border-radius: 50%; color: #e9c8ac; background: #242326; font-size: 16px; }
.app[data-theme-home-layout="glass-home"] .glassHomeAvatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.app[data-theme-home-layout="glass-home"] .glassHomePresenceDot { position: absolute; right: -1px; bottom: 1px; width: 8px; height: 8px; border-radius: 50%; background: #969097; border: 2px solid #282323; }
.app[data-theme-home-layout="glass-home"] .glassHomeAvatar[data-presence="online"] .glassHomePresenceDot { background: #57bc70; }
.app[data-theme-home-layout="glass-home"] .glassHomeAvatar[data-presence="idle"] .glassHomePresenceDot { background: #e6b167; }
.app[data-theme-home-layout="glass-home"] .glassHomeAvatar[data-presence="dnd"] .glassHomePresenceDot { background: #d27678; }
.app[data-theme-home-layout="glass-home"] .glassHomeAvatar[data-presence="focus"] .glassHomePresenceDot { background: #74bc82; }
.app[data-theme-home-layout="glass-home"] .glassHomeContactRow { display: flex; align-items: center; gap: 9px; min-height: 56px; padding: 6px 0; border-bottom: 1px solid rgba(255,226,203,.075); }
.app[data-theme-home-layout="glass-home"] .glassHomeContactRow:last-child { border-bottom: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirects .glassHomeCardHeader { margin-bottom: 8px; }
.app[data-theme-home-layout="glass-home"] .glassHomeDirects .glassHomeContactRow { min-height: 48px; padding-top: 2px; padding-bottom: 2px; }
.app[data-theme-home-layout="glass-home"] .glassHomeActive .glassHomeContactRow { min-height: 64px; }
.app[data-theme-home-layout="glass-home"] .glassHomeContactMain { display: flex; align-items: center; gap: 12px; flex: 1 1 auto; min-width: 0; padding: 0; border: 0; color: #f8f1ec; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeContactCopy { display: grid; gap: 6px; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeContactCopy strong { font-size: var(--glass-home-body); font-weight: 450; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeContactCopy span { font-size: var(--glass-home-meta); line-height: 1.35; color: #b5aaa6; overflow: hidden; text-overflow: ellipsis; display: block; white-space: nowrap; }
.app[data-theme-home-layout="glass-home"] .glassHomeContactWhen { color: #aea19a; font-size: clamp(10.5px,.72vw,13px); white-space: nowrap; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityIcon { display: flex; width: 20px; height: 20px; overflow: hidden; border-radius: 6px; flex: 0 0 auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeActivityIcon img { width: 100%; height: 100%; object-fit: cover; }
.app[data-theme-home-layout="glass-home"] .glassHomeCallButton { display: flex; align-items: center; justify-content: center; width: 33px; height: 33px; flex: 0 0 auto; padding: 0; border: 1px solid rgba(248,231,215,.08); border-radius: 50%; color: #e5dcd5; background: rgba(189,169,153,.12); cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeCallButton svg { width: 16px; height: 16px; }
.app[data-theme-home-layout="glass-home"] .glassHomeNotesCount { color: #c3b5af; font-size: var(--glass-home-meta); font-weight: 350; margin-left: auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeNotesList { max-height: 167px; overflow-y: auto; overflow-x: hidden; }
.app[data-theme-home-layout="glass-home"] .glassHomeNoteRow { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; min-height: 33px; border-bottom: 1px solid rgba(247,216,188,.07); color: #eee5dc; font-size: var(--glass-home-body); line-height: 1.4; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeNoteRow:last-child { border-bottom: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeNoteRow input { width: 16px; height: 16px; margin: 0; flex: 0 0 auto; accent-color: #e8c3a2; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeNoteRow span { min-width: 0; overflow-wrap: anywhere; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocus .glassHomeCardHeader { margin-bottom: 1px; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusDial { display: block; width: clamp(184px,12.5vw,216px); height: clamp(184px,12.5vw,216px); padding: 0; margin: 1px auto 0; position: relative; border: 1px solid rgba(239,216,189,.09); border-radius: 50%; background: radial-gradient(circle,rgba(13,13,17,.18) 48%,rgba(243,214,183,.03) 71%,rgba(191,153,118,.025)); box-shadow: inset 0 0 0 8px rgba(217,186,151,.025),0 2px 18px rgba(0,0,0,.08); color: inherit; font: inherit; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusToggle { cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusDial > svg { width: 100%; height: 100%; overflow: visible; transform: rotate(-90deg); }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusTrack { fill: none; stroke: rgba(193,166,144,.085); stroke-width: 8px; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusProgress { fill: none; stroke: #e4bf9c; stroke-width: 8px; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(241,195,151,.22)); }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusProgress[stroke-dasharray^="0 "] { stroke-linecap: butt; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusCopy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 5px; pointer-events: none; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusCopy strong { color: #eee0cf; font-size: clamp(17px,1.2vw,20px); font-weight: 500; max-width: 150px; text-align: center; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusCopy span { color: #b2a69e; font-size: var(--glass-home-meta); font-weight: 350; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusControls { display: flex; align-items: center; justify-content: center; gap: 9px; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusControl { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 7px 12px; height: 35px; border-radius: 15px; border: 1px solid rgba(243,213,185,.13); background: rgba(46,36,31,.26); color: #ddcec2; font: inherit; font-size: clamp(10.5px,.72vw,13px); cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusControl.is-primary { border-color: rgba(235,192,151,.5); background: rgba(201,147,104,.13); }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusControl svg { width: 15px; height: 15px; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusPresets { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); align-items: stretch; gap: 8px; margin-top: 12px; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusPreset { min-height: 37px; padding: 7px 9px; border-radius: 17px; border: 1px solid rgba(235,211,186,.13); background: rgba(101,81,66,.06); color: #c7b7aa; font: inherit; font-size: var(--glass-home-meta); line-height: 1.2; cursor: pointer; }
.app[data-theme-home-layout="glass-home"] .glassHomeFocusPreset.is-current { color: #f1d5bb; border-color: rgba(235,191,151,.6); background: linear-gradient(140deg,rgba(216,171,129,.17),rgba(190,139,96,.055)); box-shadow: inset 0 1px 0 rgba(255,232,205,.09); }
.app[data-theme-home-layout="glass-home"] .glassHomeRecentList { display: grid; }
.app[data-theme-home-layout="glass-home"] .glassHomeRecentRow { display: flex; align-items: center; gap: 13px; min-height: 49px; border-bottom: 1px solid rgba(245,226,208,.06); font-size: var(--glass-home-body); }
.app[data-theme-home-layout="glass-home"] .glassHomeRecentRow:last-child { border-bottom: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeApplicationIcon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; overflow: hidden; border-radius: 10px; background: rgba(11,11,15,.3); color: #e5b892; font-size: 19px; }
.app[data-theme-home-layout="glass-home"] .glassHomeApplicationIcon img { width: 100%; height: 100%; object-fit: cover; }
.app[data-theme-home-layout="glass-home"] .glassHomeRecentRow small { margin-left: auto; color: #aca1a6; font-size: var(--glass-home-meta); }
.app[data-theme-home-layout="glass-home"] .glassHomeTodayList { display: grid; gap: 6px; }
.app[data-theme-home-layout="glass-home"] .glassHomeTodayRow { display: flex; align-items: center; gap: 11px; min-height: 52px; padding: 6px 4px; border-radius: 16px; background: rgba(196,179,161,.025); }
.app[data-theme-home-layout="glass-home"] .glassHomeTodayRow > svg { width: 35px; height: 35px; padding: 10px; box-sizing: border-box; color: #d7bc9f; background: rgba(170,145,122,.065); border-radius: 50%; flex: 0 0 auto; }
.app[data-theme-home-layout="glass-home"] .glassHomeTodayRow > span { display: grid; gap: 4px; min-width: 0; }
.app[data-theme-home-layout="glass-home"] .glassHomeTodayRow strong { font-size: var(--glass-home-body); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app[data-theme-home-layout="glass-home"] .glassHomeTodayRow small { color: #b7a8a0; font-size: var(--glass-home-meta); }
.app[data-theme-home-layout="glass-home"] .glassHomeEmpty { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 20px; height: calc(100% - 40px); min-height: 80px; color: #a99d96; }
.app[data-theme-home-layout="glass-home"] .glassHomeEmpty > svg { width: 36px; height: 36px; color: rgba(230,196,166,.42); padding: 10px; box-sizing: content-box; border: 1px solid rgba(230,204,181,.06); border-radius: 18px; background: rgba(35,30,27,.16); }
.app[data-theme-home-layout="glass-home"] .glassHomeEmpty p { max-width: 230px; margin: 0; font-size: var(--glass-home-body); line-height: 1.65; font-weight: 350; }
.app[data-theme-home-layout="glass-home"] .glassHomeFooter { margin: 0; height: 13px; color: #e6bf9b; text-align: center; font-size: 8px; font-weight: 450; letter-spacing: 5px; }
.app[data-theme-home-layout="glass-home"]:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { grid-template-columns: 248px minmax(0,1fr); --left-sidebar-width: 248px; }
.app[data-theme-home-layout="glass-home"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { width: 248px; min-width: 248px; max-width: 248px; }
.app[data-theme-home-layout="glass-home"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) #meProfileCard { flex-direction: row; justify-content: space-around; }
.app[data-theme-home-layout="glass-home"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) #meProfileCard .meControls { flex-direction: row; width: auto; }
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] .glassHomeBoard,
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] .glassHomeFooter { display: none; }
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] #widgetsGrid { display: grid; margin-top: 16px; }
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] .widgetsHeader { display: flex; margin-top: 12px; }
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] .glassHomeNavigation { flex-wrap: wrap; }
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] .glassHomeNativeActions { display: flex; flex: 1 0 100%; justify-content: flex-end; }
.app[data-theme-home-layout="glass-home"][data-theme-native-widgets="true"] .glassHomeNativeActions .widgetsHeaderActions { display: flex; margin: 0; }

@media (min-width: 1181px) and (max-height: 1200px) {
 .app[data-theme-home-layout="glass-home"] [data-theme-slot="home-presentation"] { gap: 12px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNavigation { min-height: 48px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBoard { grid-template-rows: minmax(300px,max-content) 212px minmax(288px,max-content); }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero { padding-top: 14px; padding-bottom: 8px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeWelcome { margin-bottom: 22px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusButton { padding-top: 10px; padding-bottom: 10px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeActive { height: 310px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeActive .glassHomeContactRow { min-height: 60px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeFocus { padding-top: 12px; padding-bottom: 12px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeFocusDial { width: 180px; height: 180px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeFocusPresets { margin-top: 8px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNoteRow { padding-top: 6px; padding-bottom: 6px; }
}
@media (max-width: 1420px) {
 .app[data-theme-home-layout="glass-home"] .glassHomeNavigation { gap: 17px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBrand { font-size: var(--glass-home-body); letter-spacing: 4px; gap: 9px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNavButton { padding-right: 15px; padding-left: 15px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBoard { grid-template-columns: 210px minmax(0,1.25fr) minmax(0,1fr) 280px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero { padding-left: 46px; width: min(640px,100%); }
 .app[data-theme-home-layout="glass-home"] .glassHomeActivity { width: 236px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeSearch { min-width: 120px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHeaderActions { gap: 7px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeProfileButton { min-width: 110px; max-width: 160px; }
}
@media (max-width: 1180px) {
 .app[data-theme-home-layout="glass-home"], .app[data-theme-home-layout="glass-home"].right-collapsed { grid-template-columns: 64px minmax(0,1fr); gap: 14px; padding: 14px; --left-sidebar-width: 64px; --left-rail-column-width: 64px; }
 .app[data-theme-home-layout="glass-home"][data-theme-window-frame="caption-overlay"] { padding-top: var(--desktop-titlebar-overlay-height,40px); }
 .app[data-theme-home-layout="glass-home"] .panel.left { width: 64px; min-width: 64px; max-width: 64px; }
 .app[data-theme-home-layout="glass-home"] .groupOrb--app-home { width: 50px; height: 58px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNavigation { flex-wrap: wrap; gap: 12px; padding-bottom: 6px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBrand { margin-right: 7px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeSearch { order: 4; max-width: none; flex-basis: 100%; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHeaderActions { margin-left: auto; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBoard { grid-template-columns: minmax(0,1.15fr) minmax(0,1fr); grid-template-rows: minmax(310px,max-content) 212px minmax(288px,max-content) auto auto; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero { grid-column: 1; grid-row: 1; padding: 24px 12px 14px; width: 100%; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeHeading { font-size: 48px; letter-spacing: -2px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeName { font-size: 44px; letter-spacing: -1.6px; gap: 11px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeWelcome { font-size: 16px; margin-bottom: 27px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeStatusButton { min-width: 0; padding: 11px 12px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeActivity { grid-column: 2; grid-row: 1; width: min(100%,260px); }
 .app[data-theme-home-layout="glass-home"] .glassHomeServers { grid-column: 1 / 3; grid-row: 2; }
 .app[data-theme-home-layout="glass-home"] .glassHomeServerList { grid-template-columns: 220px repeat(2,minmax(155px,1fr)) 115px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeMessages { grid-column: 1; grid-row: 3; }
 .app[data-theme-home-layout="glass-home"] .glassHomeFocus { grid-column: 2; grid-row: 3; }
 .app[data-theme-home-layout="glass-home"] .glassHomeActive { grid-column: 1; grid-row: 4; height: 310px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeDirects { grid-column: 2; grid-row: 4; height: 310px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeRecent { grid-column: 1; grid-row: 5; height: 235px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeToday { grid-column: 2; grid-row: 5; align-self: stretch; height: 235px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNotes { grid-column: 1 / 3; grid-row: 6; height: 230px; }
 .app[data-theme-home-layout="glass-home"]:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { grid-template-columns: 224px minmax(0,1fr); --left-sidebar-width: 224px; }
 .app[data-theme-home-layout="glass-home"] .panel.left:has(#voiceMiniDockSlot .callBar:not(.hidden):not([hidden])[aria-hidden="false"]) { width: 224px; min-width: 224px; max-width: 224px; }
}
@media (max-width: 720px) {
 .app[data-theme-home-layout="glass-home"], .app[data-theme-home-layout="glass-home"].right-collapsed { grid-template-columns: 54px minmax(0,1fr); gap: 10px; padding: 8px; --left-sidebar-width: 54px; --left-rail-column-width: 54px; }
 .app[data-theme-home-layout="glass-home"] .panel.left { width: 54px; min-width: 54px; max-width: 54px; margin-top: 58px; }
 .app[data-theme-home-layout="glass-home"] .groupOrb { width: 38px; height: 38px; }
 .app[data-theme-home-layout="glass-home"] .groupOrb--app-home { width: 44px; height: 52px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNavigation { gap: 10px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBrand { width: 100%; font-size: clamp(10.5px,.72vw,13px); }
 .app[data-theme-home-layout="glass-home"] .glassHomeNavigationLinks { max-width: 100%; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNavButton { padding: 8px 11px; min-height: 32px; font-size: clamp(10.5px,.72vw,13px); }
 .app[data-theme-home-layout="glass-home"] .glassHomeHeaderActions { margin-left: 0; }
 .app[data-theme-home-layout="glass-home"] .glassHomeIconButton { width: 31px; height: 31px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeProfileButton { max-width: 160px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeBoard { display: flex; flex-direction: column; gap: 14px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero { padding: 22px 5px 16px; min-height: 285px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeHeading { font-size: 42px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeName { font-size: 39px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeHero .themeHomeWelcome { margin-bottom: 24px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeActivity { align-self: stretch; width: 100%; height: 208px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeServers { height: 212px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeMessages { height: 288px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeFocus { height: 300px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeActive { height: 335px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeDirects { height: 272px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeNotes { width: 100%; height: 236px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeRecent { height: 220px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeToday { width: 100%; height: 176px; }
 .app[data-theme-home-layout="glass-home"] .glassHomeCard { padding-right: 15px; padding-left: 15px; border-radius: 21px; }
}
@media (prefers-reduced-transparency: reduce) {
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .panel.left { background: #171719; backdrop-filter: none; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeCard { background: #222024; background-image: none; backdrop-filter: none; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeRecent,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeMessages { background: #201e22; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeActivity,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeFocus,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeToday { background: #282321; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeNotes { background: #2c2420; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeHero .themeHomeStatusButton,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeNavigationLinks,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeSearch,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeIconButton,
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeProfileButton { background: #292426; background-image: none; backdrop-filter: none; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeServerCard { background: #242126; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeNavButton.is-current { background: #4d3d33; }
 .app[data-theme-home-layout="glass-home"]:not([data-altara-theme-transparency="glass"]) .glassHomeServerDirectory { background: #272225; backdrop-filter: none; }
}
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .panel.left { background: #171719; backdrop-filter: none; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeCard { background: #222024; background-image: none; backdrop-filter: none; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeRecent,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeMessages { background: #201e22; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeActivity,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeFocus,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeToday { background: #282321; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeNotes { background: #2c2420; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeHero .themeHomeStatusButton,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeNavigationLinks,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeSearch,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeIconButton,
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeProfileButton { background: #292426; background-image: none; backdrop-filter: none; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeServerCard { background: #242126; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeNavButton.is-current { background: #4d3d33; }
.app[data-theme-home-layout="glass-home"][data-altara-theme-transparency="solid"] .glassHomeServerDirectory { background: #272225; backdrop-filter: none; }
`
});
