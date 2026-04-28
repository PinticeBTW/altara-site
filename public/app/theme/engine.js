import {
  alpha,
  clamp01,
  clampInt,
  clampNum,
  contrastRatio,
  darken,
  ensureContrast,
  generateSemanticScale,
  getContrastText,
  lighten,
  mix,
  normalizeHex,
} from "./colors.js";

export const THEME_ENGINE_VERSION = 2;
export const THEME_DEFAULT_PRESET_ID = "default-altara";

const THEME_PRESET_ALIASES = Object.freeze({
  graphite: "default-altara",
  black: "amoled",
  white: "clean-light",
  ocean: "midnight",
  forest: "zen-dark",
  rose: "purple-dream",
  sunset: "discord-ish",
});

export const THEME_PRESET_LIBRARY = Object.freeze({
  "default-altara": Object.freeze({
    label: "Default ALTARA",
    mode: "dark",
    style: "soft",
    density: "normal",
    layout_mood: "calm",
    background: "#131417",
    background_secondary: "#1b1f27",
    surface: "#181b22",
    surface_secondary: "#1f2430",
    accent: "#8ea0ff",
    accent_secondary: "#62d1ff",
    row: "#121318",
    text: "#f1f2f5",
    message_sent: "#3f5076",
    message_received: "#202635",
    link: "#9ec3ff",
    success: "#49d17f",
    warning: "#f5c354",
    danger: "#f26f6f",
    info: "#62d1ff",
  }),
  midnight: Object.freeze({
    label: "Midnight",
    mode: "dark",
    style: "soft",
    density: "normal",
    layout_mood: "calm",
    background: "#0c1018",
    background_secondary: "#141b29",
    surface: "#121928",
    surface_secondary: "#182335",
    accent: "#70a2ff",
    accent_secondary: "#6ee7f3",
    row: "#12192a",
    text: "#edf3ff",
    message_sent: "#2e4366",
    message_received: "#1a2538",
    link: "#8fc0ff",
    success: "#57ce96",
    warning: "#f4c85b",
    danger: "#ef7474",
    info: "#60d7ff",
  }),
  neon: Object.freeze({
    label: "Neon",
    mode: "dark",
    style: "gaming",
    density: "normal",
    layout_mood: "gaming",
    background: "#0a0f13",
    background_secondary: "#101820",
    surface: "#111923",
    surface_secondary: "#182432",
    accent: "#00e6ff",
    accent_secondary: "#ff5be1",
    row: "#10212a",
    text: "#ecfbff",
    message_sent: "#17475f",
    message_received: "#182836",
    link: "#55f0ff",
    success: "#2be7a0",
    warning: "#ffd760",
    danger: "#ff6f93",
    info: "#54dcff",
  }),
  "clean-light": Object.freeze({
    label: "Clean Light",
    mode: "light",
    style: "minimal",
    density: "comfortable",
    layout_mood: "calm",
    background: "#f5f7fc",
    background_secondary: "#eef2fb",
    surface: "#ffffff",
    surface_secondary: "#f3f6fd",
    accent: "#4f69ff",
    accent_secondary: "#35a6ff",
    row: "#eef2fb",
    text: "#1a2233",
    message_sent: "#dce7ff",
    message_received: "#edf2fc",
    link: "#2e58e6",
    success: "#1ea463",
    warning: "#b6801c",
    danger: "#c74646",
    info: "#2b8fd3",
  }),
  "purple-dream": Object.freeze({
    label: "Purple Dream",
    mode: "dark",
    style: "soft",
    density: "normal",
    layout_mood: "calm",
    background: "#151226",
    background_secondary: "#20193a",
    surface: "#201a36",
    surface_secondary: "#2a2144",
    accent: "#be7bff",
    accent_secondary: "#8d9dff",
    row: "#251d3c",
    text: "#f2eaff",
    message_sent: "#443366",
    message_received: "#2a2141",
    link: "#d4a9ff",
    success: "#57cf9f",
    warning: "#f2c66b",
    danger: "#ef7ca9",
    info: "#94b8ff",
  }),
  "zen-dark": Object.freeze({
    label: "Zen Dark",
    mode: "dark",
    style: "minimal",
    density: "comfortable",
    layout_mood: "calm",
    background: "#101513",
    background_secondary: "#171f1b",
    surface: "#151d1a",
    surface_secondary: "#1b2621",
    accent: "#6ac792",
    accent_secondary: "#5ab9b2",
    row: "#18221d",
    text: "#edf7f0",
    message_sent: "#2a4f3c",
    message_received: "#1d2b24",
    link: "#8fd9b2",
    success: "#6ad3a1",
    warning: "#d2bf6a",
    danger: "#de7e7e",
    info: "#70cfd2",
  }),
  "frost-glass": Object.freeze({
    label: "Frost Glass",
    mode: "dark",
    style: "glass",
    density: "normal",
    layout_mood: "calm",
    background: "#0f1520",
    background_secondary: "#172436",
    surface: "#1a2638",
    surface_secondary: "#213149",
    accent: "#8ac2ff",
    accent_secondary: "#a4f0ff",
    row: "#1d2d43",
    text: "#eef6ff",
    message_sent: "#315078",
    message_received: "#20324b",
    link: "#9ed7ff",
    success: "#64d7b0",
    warning: "#f3cc72",
    danger: "#f08a8a",
    info: "#85dcff",
  }),
  "discord-ish": Object.freeze({
    label: "Discord-ish",
    mode: "dark",
    style: "solid",
    density: "normal",
    layout_mood: "gaming",
    background: "#1e1f22",
    background_secondary: "#23262b",
    surface: "#2b2d31",
    surface_secondary: "#313338",
    accent: "#5865f2",
    accent_secondary: "#4ea0ff",
    row: "#2f3136",
    text: "#f2f3f5",
    message_sent: "#38417b",
    message_received: "#32353b",
    link: "#7ba0ff",
    success: "#3ba55d",
    warning: "#f0b232",
    danger: "#ed4245",
    info: "#58b1ff",
  }),
  amoled: Object.freeze({
    label: "AMOLED",
    mode: "dark",
    style: "solid",
    density: "compact",
    layout_mood: "gaming",
    background: "#050506",
    background_secondary: "#0b0c0e",
    surface: "#111214",
    surface_secondary: "#15171a",
    accent: "#7e92ff",
    accent_secondary: "#61d7ff",
    row: "#101214",
    text: "#f6f7fa",
    message_sent: "#2f3e63",
    message_received: "#171a1f",
    link: "#95afff",
    success: "#4fd28c",
    warning: "#f4c65e",
    danger: "#f47070",
    info: "#66d4ff",
  }),
  "high-contrast": Object.freeze({
    label: "High Contrast",
    mode: "dark",
    style: "solid",
    density: "normal",
    layout_mood: "calm",
    background: "#0a0a0a",
    background_secondary: "#101010",
    surface: "#171717",
    surface_secondary: "#1f1f1f",
    accent: "#ffd300",
    accent_secondary: "#00c9ff",
    row: "#161616",
    text: "#ffffff",
    message_sent: "#5f531c",
    message_received: "#1f1f1f",
    link: "#7fd8ff",
    success: "#55ff9a",
    warning: "#ffd65f",
    danger: "#ff7a7a",
    info: "#8ae6ff",
  }),
});

const DENSITY_FACTORS = Object.freeze({
  compact: 0.9,
  normal: 1,
  comfortable: 1.12,
});

const THEME_DEFAULT_OPTIONS = Object.freeze({
  mode: "dark",
  visual_style: "soft",
  density: "normal",
  layout_mood: "calm",
  background_unified: true,
  roundness: 58,
  left_sidebar_width: 340,
  color_intensity: 100,
  blur_strength: 12,
  panel_alpha: 94,
  border_thickness: 1,
  shadow_strength: 55,
  spacing_scale: 100,
  font_scale: 100,
  ui_scale: 100,
  density_scale: 100,
  glow: 0,
  compact_mode: false,
  show_grid: true,
  background_angle: 180,
  surface_angle: 180,
  accent_angle: 180,
  shell_angle: 180,
  left_sidebar_angle: 180,
  topbar_angle: 180,
  row_angle: 180,
  text_angle: 180,
  time_format: "24h",
  dnd_mute_notifications: true,
  profile_card_banner: true,
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value || "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return fallback;
}

function normalizeEnum(value, allowed, fallback) {
  const v = String(value || "").trim().toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

function normalizeOptionalHex(value) {
  return normalizeHex(value, "", { allowEmpty: true });
}

function resolvePresetId(rawId) {
  const requested = String(rawId || "").trim().toLowerCase();
  if (!requested) return THEME_DEFAULT_PRESET_ID;
  if (Object.prototype.hasOwnProperty.call(THEME_PRESET_LIBRARY, requested)) return requested;
  if (Object.prototype.hasOwnProperty.call(THEME_PRESET_ALIASES, requested)) {
    return THEME_PRESET_ALIASES[requested] || THEME_DEFAULT_PRESET_ID;
  }
  if (requested === "custom") return "custom";
  return THEME_DEFAULT_PRESET_ID;
}

function resolveThemeMode(modeInput, systemDark = true) {
  const mode = normalizeEnum(modeInput, ["dark", "light", "auto"], THEME_DEFAULT_OPTIONS.mode);
  if (mode !== "auto") return mode;
  return systemDark ? "dark" : "light";
}

function makeGradientPaint(baseColor, deepColorInput = "", angleInput = 180) {
  const base = normalizeHex(baseColor, "#1c1e23");
  const deep = normalizeOptionalHex(deepColorInput);
  const angle = clampInt(angleInput, 0, 360, 180);
  return deep ? `linear-gradient(${angle}deg, ${base}, ${deep})` : base;
}

function mixGradientPaint(baseColor, deepColorInput = "", angleInput = 180, mixWith = "#ffffff", mixAmount = 0.5) {
  const base = normalizeHex(baseColor, "#1c1e23");
  const deep = normalizeOptionalHex(deepColorInput);
  const angle = clampInt(angleInput, 0, 360, 180);
  if (!deep) return mix(base, mixWith, mixAmount);
  return `linear-gradient(${angle}deg, ${mix(base, mixWith, mixAmount)}, ${mix(deep, mixWith, mixAmount)})`;
}

function blendGradientColor(baseColor, deepColorInput = "", mixWith = "#ffffff", mixAmount = 0.5) {
  const base = normalizeHex(baseColor, "#1c1e23");
  const deep = normalizeOptionalHex(deepColorInput);
  if (!deep) return mix(base, mixWith, mixAmount);
  return mix(mix(base, deep, 0.5), mixWith, mixAmount);
}

function sanitizeWarningMessage(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

export function getThemePresetList() {
  return Object.entries(THEME_PRESET_LIBRARY).map(([id, preset]) => ({
    id,
    label: String(preset.label || id),
  }));
}

export function normalizeThemeSettings(themeInput, { systemDark = true, sidebarMin = 300, sidebarMax = 420 } = {}) {
  let source = themeInput;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (_) {
      source = {};
    }
  }
  if (!isPlainObject(source)) source = {};

  const requestedPreset = resolvePresetId(source.preset || source.preset_id || THEME_DEFAULT_PRESET_ID);
  const basePresetId = requestedPreset === "custom" ? THEME_DEFAULT_PRESET_ID : requestedPreset;
  const preset = THEME_PRESET_LIBRARY[basePresetId] || THEME_PRESET_LIBRARY[THEME_DEFAULT_PRESET_ID];
  const mode = normalizeEnum(source.mode, ["dark", "light", "auto"], normalizeEnum(preset.mode, ["dark", "light", "auto"], THEME_DEFAULT_OPTIONS.mode));
  const effectiveMode = resolveThemeMode(mode, systemDark);

  const background = normalizeHex(source.background, normalizeHex(preset.background, "#131417"));
  const backgroundSecondary = normalizeHex(
    source.background_secondary || source.bg_secondary,
    normalizeHex(preset.background_secondary, mix(background, effectiveMode === "light" ? "#c9d3e4" : "#000000", effectiveMode === "light" ? 0.26 : 0.22))
  );
  const backgroundUnified = normalizeBool(source.background_unified, THEME_DEFAULT_OPTIONS.background_unified);

  const surfaceDefault = backgroundUnified
    ? background
    : normalizeHex(preset.surface, mix(background, effectiveMode === "light" ? "#ffffff" : "#101218", effectiveMode === "light" ? 0.72 : 0.36));
  const surface = normalizeHex(source.surface, surfaceDefault);
  const surfaceSecondary = normalizeHex(
    source.surface_secondary,
    normalizeHex(preset.surface_secondary, mix(surface, effectiveMode === "light" ? "#cfd8ea" : "#000000", effectiveMode === "light" ? 0.2 : 0.14))
  );

  const accent = normalizeHex(source.accent, normalizeHex(preset.accent, "#8ea0ff"));
  const accentSecondary = normalizeHex(
    source.accent_secondary || source.secondary || source.secondary_accent,
    normalizeHex(preset.accent_secondary, mix(accent, effectiveMode === "light" ? "#3ca2ff" : "#7ad6ff", 0.26))
  );

  const textFallback = normalizeHex(preset.text, getContrastText(background, { minContrast: 4.5 }));
  const textColor = normalizeHex(source.text_color || source.text, textFallback);
  const rowColor = normalizeHex(source.row_color || source.row, normalizeHex(preset.row, mix(surface, effectiveMode === "light" ? "#bdc8de" : "#000000", effectiveMode === "light" ? 0.22 : 0.2)));

  const successColor = normalizeHex(source.success_color || source.success, normalizeHex(preset.success, "#49d17f"));
  const warningColor = normalizeHex(source.warning_color || source.warning, normalizeHex(preset.warning, "#f5c354"));
  const dangerColor = normalizeHex(source.danger_color || source.danger, normalizeHex(preset.danger, "#f26f6f"));
  const infoColor = normalizeHex(source.info_color || source.info, normalizeHex(preset.info, "#62d1ff"));
  const linkColor = normalizeHex(source.link_color || source.link, normalizeHex(preset.link, accent));

  const shellColor = normalizeHex(
    source.shell_color,
    backgroundUnified ? background : mix(background, "#000000", effectiveMode === "light" ? 0.08 : 0.18)
  );
  const leftSidebarColor = normalizeHex(
    source.left_sidebar_color,
    backgroundUnified ? background : surface
  );
  const topbarColor = normalizeHex(
    source.topbar_color,
    backgroundUnified ? background : mix(surface, "#ffffff", effectiveMode === "light" ? 0.45 : 0.08)
  );

  const buttonPrimary = normalizeHex(source.button_primary, accent);
  const buttonSecondary = normalizeHex(
    source.button_secondary,
    mix(surface, effectiveMode === "light" ? "#ffffff" : "#000000", effectiveMode === "light" ? 0.34 : 0.22)
  );
  const inputColor = normalizeHex(
    source.input_color,
    mix(surface, effectiveMode === "light" ? "#ffffff" : "#000000", effectiveMode === "light" ? 0.56 : 0.34)
  );
  const borderColor = normalizeHex(
    source.border_color,
    mix(surface, effectiveMode === "light" ? "#6a7487" : "#d1dbef", effectiveMode === "light" ? 0.66 : 0.62)
  );
  const hoverColor = normalizeHex(
    source.hover_color,
    mix(rowColor, accent, 0.22)
  );
  const activeColor = normalizeHex(
    source.active_color,
    mix(rowColor, accent, 0.35)
  );

  const messageSent = normalizeHex(source.message_sent, normalizeHex(preset.message_sent, mix(accent, surface, 0.58)));
  const messageReceived = normalizeHex(source.message_received, normalizeHex(preset.message_received, mix(surface, rowColor, 0.65)));

  const normalized = {
    version: THEME_ENGINE_VERSION,
    preset: requestedPreset,
    preset_id: requestedPreset,
    mode,
    effective_mode: effectiveMode,
    visual_style: normalizeEnum(source.visual_style || source.style || preset.style, ["minimal", "soft", "glass", "solid", "gaming"], THEME_DEFAULT_OPTIONS.visual_style),
    density: normalizeEnum(source.density || preset.density, ["compact", "normal", "comfortable"], THEME_DEFAULT_OPTIONS.density),
    layout_mood: normalizeEnum(source.layout_mood || source.layout || preset.layout_mood, ["calm", "gaming"], THEME_DEFAULT_OPTIONS.layout_mood),
    background_unified: backgroundUnified,

    background,
    background_secondary: backgroundSecondary,
    surface,
    surface_secondary: surfaceSecondary,
    accent,
    accent_secondary: accentSecondary,

    shell_color: shellColor,
    left_sidebar_color: leftSidebarColor,
    topbar_color: topbarColor,
    row_color: rowColor,
    text_color: textColor,

    button_primary: buttonPrimary,
    button_secondary: buttonSecondary,
    input_color: inputColor,
    border_color: borderColor,
    hover_color: hoverColor,
    active_color: activeColor,
    message_sent: messageSent,
    message_received: messageReceived,
    link_color: linkColor,
    success_color: successColor,
    warning_color: warningColor,
    danger_color: dangerColor,
    info_color: infoColor,

    roundness: clampInt(source.roundness, 0, 100, THEME_DEFAULT_OPTIONS.roundness),
    glow: clampInt(source.glow, 0, 100, THEME_DEFAULT_OPTIONS.glow),
    compact_mode: normalizeBool(source.compact_mode, THEME_DEFAULT_OPTIONS.compact_mode),
    show_grid: normalizeBool(source.show_grid, THEME_DEFAULT_OPTIONS.show_grid),
    left_sidebar_width: clampInt(source.left_sidebar_width, sidebarMin, sidebarMax, THEME_DEFAULT_OPTIONS.left_sidebar_width),
    color_intensity: clampInt(source.color_intensity, 0, 100, THEME_DEFAULT_OPTIONS.color_intensity),
    blur_strength: clampInt(source.blur_strength || source.blur, 0, 40, THEME_DEFAULT_OPTIONS.blur_strength),
    panel_alpha: clampInt(source.panel_alpha || source.panel_transparency, 45, 100, THEME_DEFAULT_OPTIONS.panel_alpha),
    border_thickness: clampInt(source.border_thickness || source.border_width, 0, 4, THEME_DEFAULT_OPTIONS.border_thickness),
    shadow_strength: clampInt(source.shadow_strength || source.shadow, 0, 100, THEME_DEFAULT_OPTIONS.shadow_strength),
    spacing_scale: clampInt(source.spacing_scale || source.spacing, 70, 140, THEME_DEFAULT_OPTIONS.spacing_scale),
    font_scale: clampInt(source.font_scale || source.font_size_scale, 85, 135, THEME_DEFAULT_OPTIONS.font_scale),
    ui_scale: clampInt(source.ui_scale, 70, 150, THEME_DEFAULT_OPTIONS.ui_scale),
    density_scale: clampInt(source.density_scale, 80, 130, THEME_DEFAULT_OPTIONS.density_scale),

    transparency: clampInt(source.transparency, 0, 80, 0),

    background_deep: normalizeOptionalHex(source.background_deep),
    background_angle: clampInt(source.background_angle, 0, 360, THEME_DEFAULT_OPTIONS.background_angle),
    surface_deep: normalizeOptionalHex(source.surface_deep),
    surface_angle: clampInt(source.surface_angle, 0, 360, THEME_DEFAULT_OPTIONS.surface_angle),
    accent_deep: normalizeOptionalHex(source.accent_deep),
    accent_angle: clampInt(source.accent_angle, 0, 360, THEME_DEFAULT_OPTIONS.accent_angle),
    shell_deep: normalizeOptionalHex(source.shell_deep),
    shell_angle: clampInt(source.shell_angle, 0, 360, THEME_DEFAULT_OPTIONS.shell_angle),
    left_sidebar_deep: normalizeOptionalHex(source.left_sidebar_deep),
    left_sidebar_angle: clampInt(source.left_sidebar_angle, 0, 360, THEME_DEFAULT_OPTIONS.left_sidebar_angle),
    topbar_deep: normalizeOptionalHex(source.topbar_deep),
    topbar_angle: clampInt(source.topbar_angle, 0, 360, THEME_DEFAULT_OPTIONS.topbar_angle),
    row_deep: normalizeOptionalHex(source.row_deep),
    row_angle: clampInt(source.row_angle, 0, 360, THEME_DEFAULT_OPTIONS.row_angle),
    text_deep: normalizeOptionalHex(source.text_deep),
    text_angle: clampInt(source.text_angle, 0, 360, THEME_DEFAULT_OPTIONS.text_angle),

    banner_url: String(source.banner_url || "").trim(),
    app_language: String(source.app_language || "").trim().toLowerCase(),
    time_format: String(source.time_format || THEME_DEFAULT_OPTIONS.time_format).trim().toLowerCase() === "12h" ? "12h" : "24h",
    dnd_mute_notifications: normalizeBool(source.dnd_mute_notifications, THEME_DEFAULT_OPTIONS.dnd_mute_notifications),
    profile_card_banner: normalizeBool(source.profile_card_banner, THEME_DEFAULT_OPTIONS.profile_card_banner),
    presence_status: String(source.presence_status || "").trim().toLowerCase(),
  };

  if (normalized.background_unified) {
    normalized.surface = normalized.background;
    normalized.shell_color = normalized.background;
    normalized.left_sidebar_color = normalized.background;
    normalized.topbar_color = normalized.background;
    if (!normalized.surface_deep && normalized.background_deep) normalized.surface_deep = normalized.background_deep;
    if (!normalized.shell_deep && normalized.background_deep) normalized.shell_deep = normalized.background_deep;
    if (!normalized.left_sidebar_deep && normalized.background_deep) normalized.left_sidebar_deep = normalized.background_deep;
    if (!normalized.topbar_deep && normalized.background_deep) normalized.topbar_deep = normalized.background_deep;
    normalized.surface_angle = normalized.background_angle;
    normalized.shell_angle = normalized.background_angle;
    normalized.left_sidebar_angle = normalized.background_angle;
    normalized.topbar_angle = normalized.background_angle;
  }

  return normalized;
}

export function resolveTheme(themeInput, options = {}) {
  const {
    systemDark = true,
    sidebarMin = 300,
    sidebarMax = 420,
  } = options;

  const warnings = [];
  const theme = normalizeThemeSettings(themeInput, { systemDark, sidebarMin, sidebarMax });
  const mode = theme.effective_mode;

  const bg = theme.background;
  const bgDeep = normalizeHex(
    theme.background_deep,
    darken(bg, mode === "light" ? 0.12 : 0.34)
  );
  const bgAngle = clampInt(theme.background_angle, 0, 360, 180);

  const surface = theme.surface;
  const surfaceDeep = normalizeOptionalHex(theme.surface_deep);
  const surfaceAngle = clampInt(theme.surface_angle, 0, 360, 180);

  const accentRaw = theme.accent;
  const accentDeep = normalizeOptionalHex(theme.accent_deep);
  const accentAngle = clampInt(theme.accent_angle, 0, 360, 180);

  const shellBase = theme.shell_color;
  const shellDeep = normalizeOptionalHex(theme.shell_deep);
  const shellAngle = clampInt(theme.shell_angle, 0, 360, 180);

  const sidebarBase = theme.left_sidebar_color;
  const sidebarDeep = normalizeOptionalHex(theme.left_sidebar_deep);
  const sidebarAngle = clampInt(theme.left_sidebar_angle, 0, 360, 180);

  const topbarBase = theme.topbar_color;
  const topbarDeep = normalizeOptionalHex(theme.topbar_deep);
  const topbarAngle = clampInt(theme.topbar_angle, 0, 360, 180);

  const rowBase = theme.row_color;
  const rowDeep = normalizeOptionalHex(theme.row_deep);
  const rowAngle = clampInt(theme.row_angle, 0, 360, 180);

  const colorIntensityFactor = clamp01(theme.color_intensity / 100);

  const bgRef = mix(bg, bgDeep, 0.5);
  const surfaceRef = surfaceDeep ? mix(surface, surfaceDeep, 0.5) : surface;
  const accentRawRef = accentDeep ? mix(accentRaw, accentDeep, 0.5) : accentRaw;

  const accentNeutral = mix(
    surfaceRef,
    mode === "light" ? "#5f6f8a" : "#a7b1c6",
    mode === "light" ? 0.2 : 0.24
  );
  const accentBase = mix(accentNeutral, accentRawRef, colorIntensityFactor);

  const accentSafe = ensureContrast(accentBase, bgRef, {
    minContrast: 2.3,
    light: "#ffffff",
    dark: "#0f1116",
  });
  const accent = accentSafe.color;
  if (accentSafe.adjusted) {
    warnings.push(sanitizeWarningMessage("Accent was auto-adjusted to keep contrast against the background."));
  }

  const textSeed = theme.text_deep ? mix(theme.text_color, theme.text_deep, 0.5) : theme.text_color;
  const textMainSafe = ensureContrast(textSeed, bgRef, {
    minContrast: 4.5,
    light: "#f8fafc",
    dark: "#111318",
  });
  const textMain = textMainSafe.color;
  if (textMainSafe.adjusted) {
    warnings.push(sanitizeWarningMessage("Text color was auto-corrected for WCAG readability on the background."));
  }

  const textSoftSafe = ensureContrast(mix(textMain, bgRef, mode === "light" ? 0.46 : 0.32), bgRef, {
    minContrast: 3,
    light: "#f8fafc",
    dark: "#111318",
  });
  const textSoft = textSoftSafe.color;

  const textMutedSafe = ensureContrast(mix(textMain, bgRef, mode === "light" ? 0.62 : 0.52), bgRef, {
    minContrast: 2.1,
    light: "#f8fafc",
    dark: "#111318",
  });
  const textMuted = textMutedSafe.color;

  const borderSeed = theme.border_color;
  const borderSafe = ensureContrast(borderSeed, surfaceRef, {
    minContrast: 1.6,
    light: "#ffffff",
    dark: "#111318",
  });
  const borderColor = borderSafe.color;

  const hoverSeed = theme.hover_color;
  const hoverSafe = ensureContrast(hoverSeed, surfaceRef, {
    minContrast: 1.35,
    light: lighten(surfaceRef, 0.22),
    dark: darken(surfaceRef, 0.22),
  });
  const hoverColor = hoverSafe.color;

  const activeSeed = theme.active_color;
  const activeSafe = ensureContrast(activeSeed, surfaceRef, {
    minContrast: 1.55,
    light: lighten(surfaceRef, 0.34),
    dark: darken(surfaceRef, 0.34),
  });
  const activeColor = activeSafe.color;

  const linkSafe = ensureContrast(theme.link_color, bgRef, {
    minContrast: 3,
    light: lighten(accent, 0.18),
    dark: darken(accent, 0.22),
  });

  const buttonPrimarySafe = ensureContrast(theme.button_primary, surfaceRef, {
    minContrast: 2,
    light: lighten(accent, 0.12),
    dark: darken(accent, 0.12),
  });
  const buttonSecondarySafe = ensureContrast(theme.button_secondary, surfaceRef, {
    minContrast: 1.4,
    light: lighten(surfaceRef, 0.2),
    dark: darken(surfaceRef, 0.2),
  });

  const buttonPrimary = buttonPrimarySafe.color;
  const buttonSecondary = buttonSecondarySafe.color;
  const buttonPrimaryFg = getContrastText(buttonPrimary, {
    minContrast: 4.5,
    preferred: textMain,
  });
  const buttonSecondaryFg = getContrastText(buttonSecondary, {
    minContrast: 3.6,
    preferred: textMain,
  });

  const inputSeed = theme.input_color;
  const inputSafe = ensureContrast(inputSeed, surfaceRef, {
    minContrast: 1.25,
    light: lighten(surfaceRef, 0.16),
    dark: darken(surfaceRef, 0.2),
  });
  const inputColor = inputSafe.color;

  const surface0 = blendGradientColor(surface, surfaceDeep, "#ffffff", mode === "light" ? 0.45 : 0.06);
  const surface2 = blendGradientColor(surface, surfaceDeep, "#000000", mode === "light" ? 0.04 : 0.12);

  const accentScale = generateSemanticScale(accent, { alphaSoft: 0.06 + (0.14 * colorIntensityFactor) });
  const successScale = generateSemanticScale(theme.success_color, { alphaSoft: 0.15 });
  const warningScale = generateSemanticScale(theme.warning_color, { alphaSoft: 0.14 });
  const dangerScale = generateSemanticScale(theme.danger_color, { alphaSoft: 0.14 });
  const infoScale = generateSemanticScale(theme.info_color, { alphaSoft: 0.14 });

  const radiusMd = Math.round(6 + (theme.roundness * 0.12));
  const radiusLg = radiusMd + 4;
  const radiusXl = radiusMd + 10;

  const blurPx = clampNum(theme.blur_strength, 0, 40, 12);
  const panelAlpha = clampNum(theme.panel_alpha / 100, 0.45, 1, 0.94);
  const borderWidth = clampNum(theme.border_thickness, 0, 4, 1);
  const shadowFactor = clamp01(theme.shadow_strength / 100);
  const spacingScale = clampNum(theme.spacing_scale / 100, 0.7, 1.4, 1);
  const fontScale = clampNum(theme.font_scale / 100, 0.85, 1.35, 1);
  const uiScale = clampNum(theme.ui_scale / 100, 0.7, 1.5, 1);
  const densityScale = clampNum(theme.density_scale / 100, 0.8, 1.3, 1);
  const densityFactor = DENSITY_FACTORS[theme.density] || DENSITY_FACTORS.normal;
  const spacingFactor = clampNum(spacingScale * densityScale * densityFactor, 0.66, 1.55, 1);

  const shellBg = makeGradientPaint(shellBase, shellDeep, shellAngle);
  const sidebarBg = makeGradientPaint(sidebarBase, sidebarDeep, sidebarAngle);
  const topbarBg = makeGradientPaint(topbarBase, topbarDeep, topbarAngle);
  const rowStrongBg = makeGradientPaint(rowBase, rowDeep, rowAngle);
  const rowSoftBg = mixGradientPaint(rowBase, rowDeep, rowAngle, "#ffffff", mode === "light" ? 0.35 : 0.11);

  const accentGradientBase = mix(accentNeutral, accentRaw, colorIntensityFactor);
  const accentGradientDeep = mix(accentNeutral, accentDeep || accentRaw, colorIntensityFactor);
  const surfaceRowHover = (accentDeep && colorIntensityFactor > 0.02)
    ? `linear-gradient(${accentAngle}deg, ${alpha(accentGradientBase, 0.22)}, ${alpha(accentGradientDeep, 0.22)})`
    : alpha(accent, 0.2);

  const linkColor = linkSafe.color;
  const infoColor = infoScale.base;
  const messageSent = ensureContrast(theme.message_sent, surfaceRef, {
    minContrast: 1.15,
    light: lighten(surfaceRef, 0.36),
    dark: darken(surfaceRef, 0.26),
  }).color;
  const messageReceived = ensureContrast(theme.message_received, surfaceRef, {
    minContrast: 1.05,
    light: lighten(surfaceRef, 0.2),
    dark: darken(surfaceRef, 0.2),
  }).color;

  const bgGlow = alpha(accent, clamp01((theme.glow / 100) * 0.55));
  const stroke = alpha(borderColor, mode === "light" ? 0.34 : 0.28);
  const strokeStrong = alpha(borderColor, mode === "light" ? 0.48 : 0.38);

  const panelAlphaSuffix = Math.round(panelAlpha * 255)
    .toString(16)
    .padStart(2, "0");

  const vars = {
    "--color-bg-primary": bg,
    "--color-bg-secondary": theme.background_secondary,
    "--color-surface": surface,
    "--color-surface-secondary": theme.surface_secondary,
    "--color-shell": shellBase,
    "--color-sidebar": sidebarBase,
    "--color-topbar": topbarBase,
    "--color-text-primary": textMain,
    "--color-text-secondary": textSoft,
    "--color-text-muted": textMuted,
    "--color-accent": accent,
    "--color-accent-secondary": theme.accent_secondary,
    "--color-accent-foreground": getContrastText(accent, { preferred: textMain }),
    "--color-border": borderColor,
    "--color-hover": hoverColor,
    "--color-active": activeColor,
    "--color-input": inputColor,
    "--color-button-primary": buttonPrimary,
    "--color-button-primary-foreground": buttonPrimaryFg,
    "--color-button-secondary": buttonSecondary,
    "--color-button-secondary-foreground": buttonSecondaryFg,
    "--color-message-sent": messageSent,
    "--color-message-received": messageReceived,
    "--color-link": linkColor,
    "--color-success": successScale.base,
    "--color-warning": warningScale.base,
    "--color-danger": dangerScale.base,
    "--color-info": infoColor,

    "--gradient-bg": makeGradientPaint(bg, bgDeep, bgAngle),
    "--gradient-accent": makeGradientPaint(accent, accentScale.gradient.deep, accentAngle),
    "--gradient-surface": makeGradientPaint(surface, surfaceDeep, surfaceAngle),

    "--theme-blur": `${blurPx}px`,
    "--theme-panel-alpha": panelAlpha.toFixed(3),
    "--theme-border-width": `${borderWidth}px`,
    "--theme-spacing-scale": spacingFactor.toFixed(3),
    "--theme-font-scale": fontScale.toFixed(3),
    "--theme-ui-scale": uiScale.toFixed(3),
    "--theme-shadow-strength": shadowFactor.toFixed(3),
    "--theme-density-scale": densityFactor.toFixed(3),

    "--radius-xl": `${radiusXl}px`,
    "--radius-lg": `${radiusLg}px`,
    "--radius-md": `${radiusMd}px`,
    "--left-sidebar-width": `${theme.left_sidebar_width}px`,

    "--bg-main": bg,
    "--bg-deep": bgDeep,
    "--bg-angle": `${bgAngle}deg`,
    "--surface-0": surface0,
    "--surface-1": `${surface}${panelAlphaSuffix}`,
    "--surface-2": surface2,
    "--surface-row": rowSoftBg,
    "--surface-row-hover": surfaceRowHover,

    "--stroke": stroke,
    "--stroke-strong": strokeStrong,

    "--text-main": textMain,
    "--text-soft": textSoft,
    "--text-muted": textMuted,

    "--accent": accent,
    "--accent-strong": accentScale.hover,
    "--accent-soft": accentScale.subtle,

    "--ok": successScale.base,
    "--warn": warningScale.base,
    "--bad": dangerScale.base,

    "--bg-glow": bgGlow,
    "--ui-shell-bg": shellBg,
    "--ui-top-bg": topbarBg,
    "--ui-card-bg": mixGradientPaint(surface, surfaceDeep, surfaceAngle, "#ffffff", mode === "light" ? 0.53 : 0.13),
    "--ui-panel-soft-bg": mixGradientPaint(surface, surfaceDeep, surfaceAngle, "#000000", mode === "light" ? 0.02 : 0.07),
    "--ui-row-bg": mixGradientPaint(rowBase, rowDeep, rowAngle, "#ffffff", mode === "light" ? 0.43 : 0.14),
    "--ui-row-strong-bg": rowStrongBg,
    "--ui-input-bg": mixGradientPaint(inputColor, "", 180, mode === "light" ? "#ffffff" : "#000000", mode === "light" ? 0.42 : 0.16),
    "--ui-input-focus-bg": mixGradientPaint(inputColor, "", 180, accent, mode === "light" ? 0.16 : 0.12),

    "--ui-btn-bg": buttonSecondary,
    "--ui-btn-border": mix(borderColor, accent, mode === "light" ? 0.14 : 0.22),
    "--ui-btn-hover-bg": mix(buttonSecondary, hoverColor, 0.35),
    "--ui-btn-hover-border": mix(borderColor, accent, mode === "light" ? 0.32 : 0.4),

    "--ui-primary-bg": buttonPrimary,
    "--ui-primary-border": mix(buttonPrimary, borderColor, mode === "light" ? 0.36 : 0.26),
    "--ui-primary-hover-bg": accentScale.hover,
    "--ui-primary-hover-border": mix(accentScale.active, borderColor, mode === "light" ? 0.34 : 0.22),

    "--ui-danger-bg": dangerScale.subtle,
    "--ui-danger-border": dangerScale.border,
    "--ui-danger-hover-bg": dangerScale.pressed,
    "--ui-danger-hover-border": dangerScale.active,
    "--ui-debug-bg": mixGradientPaint(surface, surfaceDeep, surfaceAngle, "#000000", mode === "light" ? 0.06 : 0.24),

    "--left-sidebar-bg": sidebarBg,
    "--left-sidebar-top-bg": mixGradientPaint(sidebarBase, sidebarDeep, sidebarAngle, "#ffffff", mode === "light" ? 0.28 : 0.08),

    "--me-ctrl-icon-color": getContrastText(blendGradientColor(surface, surfaceDeep, "#ffffff", mode === "light" ? 0.22 : 0.11), {
      minContrast: 3,
      light: "#dfe6f8",
      dark: "#2d3545",
    }),
    "--me-ctrl-border": mode === "light"
      ? "rgba(38, 45, 60, 0.22)"
      : "rgba(200, 232, 255, 0.22)",
    "--me-ctrl-bg": mode === "light"
      ? "rgba(18, 22, 30, 0.07)"
      : "rgba(255, 255, 255, 0.03)",

    "--theme-space-1": `${(4 * spacingFactor).toFixed(2)}px`,
    "--theme-space-2": `${(8 * spacingFactor).toFixed(2)}px`,
    "--theme-space-3": `${(12 * spacingFactor).toFixed(2)}px`,
    "--theme-space-4": `${(16 * spacingFactor).toFixed(2)}px`,
    "--theme-space-5": `${(20 * spacingFactor).toFixed(2)}px`,

    "--theme-font-size-base": `${(16 * fontScale).toFixed(2)}px`,
    "--theme-font-size-sm": `${(13 * fontScale).toFixed(2)}px`,
    "--theme-font-size-lg": `${(18 * fontScale).toFixed(2)}px`,

    "--shadow-main": `0 ${Math.round(14 + (20 * shadowFactor))}px ${Math.round(30 + (48 * shadowFactor))}px rgba(0, 0, 0, ${(0.24 + (0.36 * shadowFactor)).toFixed(3)})`,
    "--shadow-soft": `0 ${Math.round(6 + (8 * shadowFactor))}px ${Math.round(16 + (24 * shadowFactor))}px rgba(0, 0, 0, ${(0.16 + (0.2 * shadowFactor)).toFixed(3)})`,

    "--focus-ring": accentScale.focusRing,
    "--selection-bg": alpha(accent, mode === "light" ? 0.42 : 0.58),

    "--color-success-subtle": successScale.subtle,
    "--color-warning-subtle": warningScale.subtle,
    "--color-danger-subtle": dangerScale.subtle,
    "--color-info-subtle": infoScale.subtle,
  };

  if (contrastRatio(textMain, bgRef) < 4.5) {
    warnings.push(sanitizeWarningMessage("Some text contrast is still limited on this combination."));
  }

  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));

  return {
    theme,
    vars,
    warnings: uniqueWarnings,
    classes: {
      mode: `theme-mode-${mode}`,
      style: `theme-style-${theme.visual_style}`,
      density: `theme-density-${theme.density}`,
      layout: `theme-layout-${theme.layout_mood}`,
    },
  };
}

export function serializeThemeExport(themeInput, metadata = {}) {
  const payload = {
    schema: "altara-theme",
    version: THEME_ENGINE_VERSION,
    exported_at: new Date().toISOString(),
    source: "ALTARA",
    metadata: isPlainObject(metadata) ? metadata : {},
    theme: normalizeThemeSettings(themeInput),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseThemeImport(rawInput) {
  const raw = typeof rawInput === "string" ? rawInput : String(rawInput || "");
  const parsed = JSON.parse(raw);
  if (!isPlainObject(parsed)) throw new Error("Invalid theme JSON.");

  if (isPlainObject(parsed.theme)) {
    return normalizeThemeSettings(parsed.theme);
  }

  return normalizeThemeSettings(parsed);
}

export function getThemeStoragePresetPayload(themeInput) {
  return normalizeThemeSettings(themeInput);
}
