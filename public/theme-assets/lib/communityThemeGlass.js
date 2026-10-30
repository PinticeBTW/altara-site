import { COMMUNITY_THEME_GLASS_FILTER_ID } from './communityThemePackages.js';
export const COMMUNITY_GLASS_FILTER_ID = COMMUNITY_THEME_GLASS_FILTER_ID;
export const COMMUNITY_GLASS_HOST_ID = 'altaraCommunityThemeGlass';
const SVG_NS = 'http://www.w3.org/2000/svg';
const mapCache = new WeakMap();

// A fixed optical field, generated from geometry rather than a screenshot or
// user content. The neutral center preserves the backdrop; the rounded rim
// bends it. Each document pays this bounded cost once, with no frame loop.
function normalMap(document) {
  if (mapCache.has(document)) return mapCache.get(document);
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const pixels = context.createImageData(canvas.width, canvas.height);
  const halfWidth = canvas.width / 2, halfHeight = canvas.height / 2;
  const radius = 22, rim = 22;
  const distance = (x, y) => {
    const qx = Math.abs(x) - halfWidth + radius;
    const qy = Math.abs(y) - halfHeight + radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  };
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const px = x + .5 - halfWidth, py = y + .5 - halfHeight;
      const d = distance(px, py);
      const edge = Math.max(0, 1 - Math.max(0, -d) / rim);
      const weight = d <= 0 ? edge * edge * (3 - 2 * edge) : 0;
      const gx = distance(px + .5, py) - distance(px - .5, py);
      const gy = distance(px, py + .5) - distance(px, py - .5);
      const length = Math.hypot(gx, gy) || 1;
      const offset = (y * canvas.width + x) * 4;
      pixels.data[offset] = Math.round(128 + 112 * gx / length * weight);
      pixels.data[offset + 1] = Math.round(128 + 112 * gy / length * weight);
      pixels.data[offset + 2] = 128;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const data = canvas.toDataURL('image/png');
  if (!data.startsWith('data:image/png;base64,')) return '';
  mapCache.set(document, data);
  return data;
}

export function usesCommunityGlassFilter(css) {
  return String(css).includes(`url(#${COMMUNITY_GLASS_FILTER_ID})`) ||
    String(css).includes(`url("#${COMMUNITY_GLASS_FILTER_ID}")`) ||
    String(css).includes(`url('#${COMMUNITY_GLASS_FILTER_ID}')`);
}

export function createCommunityGlassFilter(document) {
  let map;
  try { map = normalMap(document); } catch { return null; }
  if (!map) return null;
  const node = (name, attributes = {}) => {
    const result = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, String(value));
    return result;
  };
  const host = node('svg', { id: COMMUNITY_GLASS_HOST_ID, xmlns: SVG_NS, width: 0, height: 0,
    'aria-hidden': 'true', focusable: 'false', 'data-community-themes-trusted': 'true' });
  host.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;';
  const defs = node('defs');
  const filter = node('filter', { id: COMMUNITY_GLASS_FILTER_ID, x: 0, y: 0, width: 1, height: 1,
    filterUnits: 'objectBoundingBox', primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' });
  filter.append(
    node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: .0015, result: 'softened' }),
    node('feImage', { href: map, x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none', result: 'rim' }),
    node('feDisplacementMap', { in: 'softened', in2: 'rim', scale: .04, xChannelSelector: 'R', yChannelSelector: 'G' }),
  );
  defs.append(filter);
  host.append(defs);
  return host;
}

export function communityGlassCssForDocument(document, css, available = true) {
  const supports = document.defaultView?.CSS?.supports;
  if (available && (!supports || supports.call(document.defaultView.CSS, 'backdrop-filter', `url(#${COMMUNITY_GLASS_FILTER_ID})`))) return css;
  // Themes keep ordinary blur/saturation in the same declaration. Removing
  // only this app-owned reference gives engines without SVG support that path.
  return String(css).replace(/url\((?:["']?)#altaraThemeLiquidGlassFilter(?:["']?)\)/g, '');
}
