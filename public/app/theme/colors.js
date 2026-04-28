export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function clampNum(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function clampInt(value, min, max, fallback = min) {
  return Math.round(clampNum(value, min, max, fallback));
}

export function normalizeHex(value, fallback = "", { allowEmpty = false } = {}) {
  let raw = String(value || "").trim();
  if (!raw) return allowEmpty ? "" : fallback;
  if (!raw.startsWith("#")) raw = `#${raw}`;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    raw = `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return allowEmpty ? "" : fallback;
  return raw.toLowerCase();
}

export function hexToRgb(hexInput) {
  const hex = normalizeHex(hexInput, "#000000");
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex(rgb) {
  const r = Math.round(clampNum(rgb?.r, 0, 255, 0));
  const g = Math.round(clampNum(rgb?.g, 0, 255, 0));
  const b = Math.round(clampNum(rgb?.b, 0, 255, 0));
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mix(hexA, hexB, amount = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = clamp01(amount);
  return rgbToHex({
    r: a.r + ((b.r - a.r) * t),
    g: a.g + ((b.g - a.g) * t),
    b: a.b + ((b.b - a.b) * t),
  });
}

export function alpha(hexInput, alphaInput) {
  const { r, g, b } = hexToRgb(hexInput);
  const a = clamp01(alphaInput);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function lighten(hexInput, amount = 0.1) {
  return mix(hexInput, "#ffffff", clamp01(amount));
}

export function darken(hexInput, amount = 0.1) {
  return mix(hexInput, "#000000", clamp01(amount));
}

export function relativeLuminance(hexInput) {
  const { r, g, b } = hexToRgb(hexInput);
  const toLinear = (value) => {
    const s = value / 255;
    return s <= 0.03928 ? (s / 12.92) : (((s + 0.055) / 1.055) ** 2.4);
  };
  const rr = toLinear(r);
  const gg = toLinear(g);
  const bb = toLinear(b);
  return (0.2126 * rr) + (0.7152 * gg) + (0.0722 * bb);
}

export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(normalizeHex(hexA, "#000000"));
  const lumB = relativeLuminance(normalizeHex(hexB, "#ffffff"));
  const light = Math.max(lumA, lumB);
  const dark = Math.min(lumA, lumB);
  return (light + 0.05) / (dark + 0.05);
}

export function getContrastText(
  backgroundInput,
  {
    light = "#f8fafc",
    dark = "#111318",
    minContrast = 4.5,
    preferred = "",
  } = {}
) {
  const background = normalizeHex(backgroundInput, "#131417");
  const safeLight = normalizeHex(light, "#f8fafc");
  const safeDark = normalizeHex(dark, "#111318");
  const safePreferred = normalizeHex(preferred, "", { allowEmpty: true });

  if (safePreferred && contrastRatio(safePreferred, background) >= minContrast) {
    return safePreferred;
  }

  const lightRatio = contrastRatio(safeLight, background);
  const darkRatio = contrastRatio(safeDark, background);

  if (lightRatio >= minContrast && lightRatio >= darkRatio) return safeLight;
  if (darkRatio >= minContrast && darkRatio >= lightRatio) return safeDark;
  return lightRatio >= darkRatio ? safeLight : safeDark;
}

export function ensureContrast(
  foregroundInput,
  backgroundInput,
  {
    minContrast = 4.5,
    light = "#f8fafc",
    dark = "#111318",
    maxSteps = 28,
  } = {}
) {
  const foreground = normalizeHex(foregroundInput, "#f8fafc");
  const background = normalizeHex(backgroundInput, "#131417");
  const safeLight = normalizeHex(light, "#f8fafc");
  const safeDark = normalizeHex(dark, "#111318");

  const initialRatio = contrastRatio(foreground, background);
  if (initialRatio >= minContrast) {
    return {
      color: foreground,
      ratio: initialRatio,
      adjusted: false,
    };
  }

  let best = {
    color: foreground,
    ratio: initialRatio,
  };

  const candidateTargets = [safeLight, safeDark];
  candidateTargets.forEach((target) => {
    const targetRatio = contrastRatio(target, background);
    if (targetRatio > best.ratio) best = { color: target, ratio: targetRatio };
  });

  for (let step = 1; step <= maxSteps; step += 1) {
    const t = step / maxSteps;
    candidateTargets.forEach((target) => {
      const mixed = mix(foreground, target, t);
      const ratio = contrastRatio(mixed, background);
      if (ratio > best.ratio) best = { color: mixed, ratio };
      if (ratio >= minContrast) {
        best = { color: mixed, ratio };
      }
    });
    if (best.ratio >= minContrast) break;
  }

  return {
    color: best.color,
    ratio: best.ratio,
    adjusted: best.color !== foreground,
  };
}

export function generateSemanticScale(baseInput, { alphaSoft = 0.16 } = {}) {
  const base = normalizeHex(baseInput, "#8ea0ff");
  const luminance = relativeLuminance(base);
  const darkSurface = luminance > 0.56;
  const hover = darkSurface ? darken(base, 0.08) : lighten(base, 0.08);
  const pressed = darkSurface ? darken(base, 0.16) : lighten(base, 0.16);
  const active = darkSurface ? darken(base, 0.23) : lighten(base, 0.23);
  const border = darkSurface ? darken(base, 0.28) : lighten(base, 0.28);
  const subtle = alpha(base, clamp01(alphaSoft));
  const focusRing = alpha(base, 0.46);
  const gradientDeep = darkSurface ? darken(base, 0.3) : lighten(base, 0.3);
  const glow = alpha(base, 0.35);

  return {
    base,
    hover,
    pressed,
    active,
    subtle,
    border,
    focusRing,
    gradient: {
      base,
      deep: gradientDeep,
      angle: 165,
    },
    glow,
  };
}