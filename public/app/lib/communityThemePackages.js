import { generate, ident, List, parse, walk } from './vendor/css-tree/csstree.esm.js';

export const COMMUNITY_THEME_LIMITS = Object.freeze({
  cssBytes: 96 * 1024,
  compiledCssBytes: 2 * 1024 * 1024,
  packageBytes: 128 * 1024,
  packageV2Bytes: 1536 * 1024,
  assetBytes: 512 * 1024,
  assetsBytes: 1024 * 1024,
  assetDimension: 4096,
  assetPixels: 12_000_000,
  libraryBytes: 4 * 1024 * 1024,
  installs: 20,
  rules: 512,
  declarations: 4096,
  nodes: 24000,
  depth: 32,
  transitionSeconds: 2
});
export const COMMUNITY_THEME_STORAGE_PREFIX = 'altara:community-themes:v1:';

const encoder = new TextEncoder();
// Pause the entire author cascade, including inherited tokens and ancestor
// opacity/transforms, while native trust decisions are open. Excluding only the
// decision element cannot protect it from styling applied to its ancestors.
const scopedBody = 'body[data-altara-community-theme]:is(body,#altaraCommunityThemeScope):not(:has(.altaraConfirmDialog:not(.hidden):not([hidden]),.modal:not(.hidden):not([hidden]),#profileOverlay:not(.hidden):not([hidden]),dialog[open],[data-theme-sensitive="true"]:not(.hidden):not([hidden])))';
const scope = scopedBody + ' ';
const compiledCssCache = new Map();
const recoveryId = 'altaraThemeRecovery';
export const COMMUNITY_THEME_GLASS_FILTER_ID = 'altaraThemeLiquidGlassFilter';
const visualProperties = new Set(`
  accent-color align-content align-items align-self appearance -webkit-appearance
  aspect-ratio backdrop-filter -webkit-backdrop-filter backface-visibility
  background background-attachment background-blend-mode background-clip background-color
  background-image background-origin background-position background-position-x background-position-y
  background-repeat background-size block-size border border-block border-block-color border-block-end
  border-block-end-color border-block-end-style border-block-end-width border-block-start
  border-block-start-color border-block-start-style border-block-start-width border-block-style border-block-width
  border-bottom border-bottom-color border-bottom-left-radius border-bottom-right-radius border-bottom-style
  border-bottom-width border-collapse border-color border-end-end-radius border-end-start-radius border-image
  border-image-outset border-image-repeat border-image-slice border-image-source border-image-width
  border-inline border-inline-color border-inline-end border-inline-end-color border-inline-end-style
  border-inline-end-width border-inline-start border-inline-start-color border-inline-start-style
  border-inline-start-width border-inline-style border-inline-width border-left border-left-color
  border-left-style border-left-width border-radius border-right border-right-color border-right-style
  border-right-width border-spacing border-start-end-radius border-start-start-radius border-style border-top
  border-top-color border-top-left-radius border-top-right-radius border-top-style border-top-width border-width
  bottom box-decoration-break box-shadow box-sizing break-after break-before break-inside
  caret-color clear clip clip-path color color-scheme column-count column-fill column-gap column-rule
  column-rule-color column-rule-style column-rule-width column-span column-width columns contain
  contain-intrinsic-block-size contain-intrinsic-height contain-intrinsic-inline-size contain-intrinsic-size
  contain-intrinsic-width container-name container-type content content-visibility cursor direction display
  empty-cells fill fill-opacity fill-rule filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink
  flex-wrap float font font-family font-feature-settings font-kerning font-optical-sizing font-size
  font-size-adjust font-stretch font-style font-synthesis font-variant font-variant-caps font-variant-ligatures
  font-variant-numeric font-weight gap grid grid-area grid-auto-columns grid-auto-flow grid-auto-rows
  grid-column grid-column-end grid-column-start grid-gap grid-row grid-row-end grid-row-start
  grid-template grid-template-areas grid-template-columns grid-template-rows height hyphens inline-size
  inset inset-block inset-block-end inset-block-start inset-inline inset-inline-end inset-inline-start
  isolation justify-content justify-items justify-self left letter-spacing line-height list-style
  list-style-image list-style-position list-style-type margin margin-block margin-block-end margin-block-start
  margin-bottom margin-inline margin-inline-end margin-inline-start margin-left margin-right margin-top
  mask mask-clip mask-composite mask-image mask-mode mask-origin mask-position mask-repeat mask-size
  max-block-size max-height max-inline-size max-width min-block-size min-height min-inline-size min-width
  mix-blend-mode object-fit object-position opacity order outline outline-color outline-offset outline-style
  outline-width overflow overflow-anchor overflow-block overflow-inline overflow-wrap overflow-x overflow-y
  overscroll-behavior overscroll-behavior-block overscroll-behavior-inline overscroll-behavior-x
  overscroll-behavior-y padding padding-block padding-block-end padding-block-start padding-bottom
  padding-inline padding-inline-end padding-inline-start padding-left padding-right padding-top
  perspective perspective-origin place-content place-items place-self pointer-events position resize right
  rotate row-gap scale scroll-behavior scroll-margin scroll-margin-block scroll-margin-block-end
  scroll-margin-block-start scroll-margin-bottom scroll-margin-inline scroll-margin-inline-end
  scroll-margin-inline-start scroll-margin-left scroll-margin-right scroll-margin-top scroll-padding
  scroll-padding-block scroll-padding-block-end scroll-padding-block-start scroll-padding-bottom
  scroll-padding-inline scroll-padding-inline-end scroll-padding-inline-start scroll-padding-left
  scroll-padding-right scroll-padding-top scroll-snap-align scroll-snap-stop scroll-snap-type scrollbar-color
  scrollbar-gutter scrollbar-width shape-outside stroke stroke-dasharray stroke-dashoffset stroke-linecap
  stroke-linejoin stroke-opacity stroke-width tab-size table-layout text-align text-align-last text-decoration
  text-decoration-color text-decoration-line text-decoration-style text-decoration-thickness text-indent
  text-overflow text-rendering text-shadow text-transform text-underline-offset text-wrap text-wrap-mode
  text-wrap-style top touch-action transform transform-origin transform-style transition transition-behavior
  transition-delay transition-duration transition-property transition-timing-function translate unicode-bidi
  user-select -webkit-user-select vertical-align visibility white-space width word-break word-spacing
  word-wrap writing-mode z-index -webkit-text-fill-color -webkit-text-stroke -webkit-text-stroke-color
  -webkit-text-stroke-width -webkit-font-smoothing -moz-osx-font-smoothing
`.trim().split(/\s+/));

// Every accepted function is evaluated locally. Resource-producing and future unknown functions stay closed.
const valueFunctions = new Set(`
  var calc min max clamp env rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark
  linear-gradient radial-gradient conic-gradient repeating-linear-gradient repeating-radial-gradient
  repeating-conic-gradient blur brightness contrast drop-shadow grayscale hue-rotate invert opacity
  saturate sepia matrix matrix3d perspective rotate rotatex rotatey rotatez rotate3d scale scalex scaley
  scalez scale3d skew skewx skewy translate translatex translatey translatez translate3d cubic-bezier steps
  linear circle ellipse inset polygon rect xywh round mod rem abs sign pow sqrt hypot log exp sin cos tan
  asin acos atan atan2 repeat minmax fit-content
`.trim().split(/\s+/));

const supportedNodes = new Set(`
  StyleSheet Rule SelectorList Selector ClassSelector IdSelector TypeSelector AttributeSelector
  PseudoClassSelector PseudoElementSelector Combinator Declaration Value Function Identifier Number
  Percentage Dimension Hash String Operator Parentheses Brackets Atrule AtrulePrelude Block Condition
  MediaQueryList MediaQuery Feature FeatureRange Comparison SupportsDeclaration Nth AnPlusB WhiteSpace
`.trim().split(/\s+/));
const pseudoClasses = new Set(`
  active any-link checked default disabled empty enabled first-child first-of-type focus focus-visible
  focus-within fullscreen has hover indeterminate is last-child last-of-type link not nth-child
  nth-last-child nth-last-of-type nth-of-type only-child only-of-type optional placeholder-shown read-only
  read-write required root target valid invalid user-valid user-invalid visited where
`.trim().split(/\s+/));
const pseudoElements = new Set(`
  after before first-letter first-line marker placeholder selection backdrop file-selector-button
  -webkit-scrollbar -webkit-scrollbar-thumb -webkit-scrollbar-track -webkit-scrollbar-corner
  -webkit-scrollbar-button -webkit-scrollbar-track-piece -webkit-resizer
`.trim().split(/\s+/));

function failure(message, code = 'INVALID_COMMUNITY_THEME') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function bytes(value) {
  return encoder.encode(value).byteLength;
}

function parseCss(css, context = 'stylesheet') {
  try {
    return parse(css, { context, parseCustomProperty: true, onParseError() { throw failure('Invalid CSS syntax.'); } });
  } catch {
    throw failure('Theme CSS contains invalid syntax.');
  }
}

function decodedName(value) {
  return ident.decode(String(value));
}

function validateDeclaration(node, rootOnly = false) {
  const decoded = decodedName(node.property);
  const custom = decoded.startsWith('--');
  const property = custom ? decoded : decoded.toLowerCase();
  if (rootOnly && !custom) throw failure('Root theme rules may only set CSS variables.');
  if (!custom && !visualProperties.has(property)) throw failure('This CSS property is not supported by community themes.');
  if (custom && (property.length < 3 || property.length > 128)) throw failure('Invalid CSS variable name.');
  node.property = custom ? ident.encode(property) : property;
  if (property === 'content') {
    const values = node.value.children.toArray();
    if (values.length !== 1 || !(values[0].type === 'String' && values[0].value === '' ||
        values[0].type === 'Identifier' && ['normal', 'none'].includes(decodedName(values[0].name).toLowerCase()))) {
      throw failure('Themes cannot insert text with CSS content.');
    }
  }
  if (property === 'transition' || property === 'transition-duration' || property === 'transition-delay') {
    walk(node.value, child => {
      if (child.type === 'Function' && !['cubic-bezier', 'steps', 'linear'].includes(decodedName(child.name).toLowerCase())) {
        throw failure('Transition durations must be explicit and no longer than 2 seconds.');
      }
      if (child.type === 'Dimension' && ['ms', 's'].includes(decodedName(child.unit).toLowerCase())) {
        const seconds = Number(child.value) / (decodedName(child.unit).toLowerCase() === 'ms' ? 1000 : 1);
        if (!Number.isFinite(seconds) || Math.abs(seconds) > COMMUNITY_THEME_LIMITS.transitionSeconds) {
          throw failure('Transition durations must be no longer than 2 seconds.');
        }
      }
    });
  }
}

function validateAst(ast, { apiVersion, assets }) {
  const resources = [];
  const assetUrls = new Map();
  let resourceBytes = 0;
  let count = 0;
  let depth = 0;
  let declarations = 0;
  walk(ast, {
    enter(node) {
      if (++count > COMMUNITY_THEME_LIMITS.nodes || ++depth > COMMUNITY_THEME_LIMITS.depth) {
        throw failure('Theme CSS is too complex.');
      }
      if (!supportedNodes.has(node.type)) throw failure('Theme CSS contains unsupported syntax.');
      if (node.type === 'Function') {
        const name = decodedName(node.name).toLowerCase();
        if (name === 'theme-asset' || name === 'theme-filter') {
          if (apiVersion !== 2 || !this.declaration || !this.rule) throw failure('Theme resources require API version 2 and a style declaration.');
          const args = node.children.toArray();
          if (args.length !== 1 || args[0].type !== 'Identifier') throw failure('A theme resource requires one named identifier.');
          const key = decodedName(args[0].name);
          let url;
          if (name === 'theme-asset') {
            if (!Object.hasOwn(assets, key)) throw failure('The named theme asset is not included in this package.');
            const asset = assets[key];
            if (!assetUrls.has(key)) assetUrls.set(key, 'data:' + asset.mime + ';base64,' + asset.base64);
            url = assetUrls.get(key);
          } else {
            const property = decodedName(this.declaration.property).toLowerCase();
            if (key !== 'liquid-glass' || !['filter', 'backdrop-filter', '-webkit-backdrop-filter'].includes(property) ||
                !this.declaration.value.children.toArray().includes(node)) throw failure('The Liquid Glass filter must be used directly in a filter declaration.');
            url = '#' + COMMUNITY_THEME_GLASS_FILTER_ID;
          }
          if ((resourceBytes += url.length) > COMMUNITY_THEME_LIMITS.compiledCssBytes) throw failure('Expanded theme CSS exceeds the 2 MiB limit.');
          resources.push({ node, url });
        } else if (!valueFunctions.has(name)) {
          throw failure('Theme CSS cannot load resources or use unsupported functions.');
        }
      }
      if (node.type === 'String' && /(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(node.value)) {
        throw failure('Theme CSS cannot contain resource addresses.');
      }
      if (node.type === 'Atrule' && !['media', 'supports'].includes(decodedName(node.name).toLowerCase())) {
        throw failure('Only media and supports rules are supported by community themes.');
      }
      if (node.type === 'Declaration') {
        if (++declarations > COMMUNITY_THEME_LIMITS.declarations) throw failure('Theme CSS has too many declarations.');
        validateDeclaration(node);
      }
    },
    leave() { depth--; }
  });
  // Author URLs are rejected above. Only these validated, app-generated values
  // become URL nodes; a resource token never accepts an address from a package.
  for (const { node, url } of resources) {
    node.type = 'Url'; node.value = url;
    delete node.name; delete node.children;
  }
}

function isRootSelector(selector) {
  const children = selector.children.toArray();
  return children.length === 1 && (children[0].type === 'TypeSelector' && decodedName(children[0].name).toLowerCase() === 'body' ||
    children[0].type === 'PseudoClassSelector' && decodedName(children[0].name).toLowerCase() === 'root' && children[0].children === null);
}

function validateSelector(selector, rootOnly) {
  if (generate(selector).length > 2048) throw failure('A theme selector is too long.');
  walk(selector, node => {
    if (node.type === 'IdSelector' && decodedName(node.name).toLowerCase() === recoveryId.toLowerCase() ||
        node.type === 'String' && node.value.toLowerCase().includes(recoveryId.toLowerCase()) ||
        node.type === 'Identifier' && decodedName(node.name).toLowerCase().includes(recoveryId.toLowerCase())) {
      throw failure('The theme recovery control is reserved.');
    }
    if (node.type === 'TypeSelector' && ['html', 'body'].includes(decodedName(node.name).toLowerCase().split('|').at(-1)) && !rootOnly) {
      throw failure('Use local selectors; body and :root may only set CSS variables.');
    }
    if (node.type === 'PseudoClassSelector') {
      const name = decodedName(node.name).toLowerCase();
      if (!pseudoClasses.has(name) || name === 'root' && !rootOnly) throw failure('Unsupported theme selector.');
    }
    if (node.type === 'PseudoElementSelector' && (!pseudoElements.has(decodedName(node.name).toLowerCase()) || node.children !== null)) {
      throw failure('Unsupported theme pseudo-element.');
    }
  });
}

function scopeSelector(selector) {
  const children = selector.children.toArray();
  const pseudoIndex = children.findIndex(child => child.type === 'PseudoElementSelector');
  const insert = pseudoIndex < 0 ? children.length : pseudoIndex;
  const guard = parseCss(`:not(:where([data-community-themes-trusted="true"],[data-community-themes-trusted="true"] *,.modal,.modal *,dialog,dialog *,[data-theme-sensitive="true"],[data-theme-sensitive="true"] *)):not(#${recoveryId} *):not(#${recoveryId})`, 'selector').children.toArray();
  children.splice(insert, 0, ...guard);
  const scoped = { ...selector, children: new List() };
  children.forEach(child => scoped.children.appendData(child));
  return scope + generate(scoped);
}

export function compileCommunityThemeCss(css, { apiVersion = 1, assets = {} } = {}) {
  if (typeof css !== 'string' || !css.trim()) throw failure('A theme must contain CSS.');
  if (bytes(css) > COMMUNITY_THEME_LIMITS.cssBytes) throw failure('Theme CSS exceeds the 96 KiB limit.');
  if (![1, 2].includes(apiVersion)) throw failure('Unsupported theme API version.');
  const cleanAssets = validateAssets(assets);
  if (apiVersion === 1 && Object.keys(cleanAssets).length) throw failure('Theme assets require API version 2.');
  const cacheable = apiVersion === 1;
  if (cacheable && compiledCssCache.has(css)) return compiledCssCache.get(css);
  const ast = parseCss(css);
  validateAst(ast, { apiVersion, assets: cleanAssets });
  let rules = 0;
  let selectors = 0;
  function compileChildren(children, nesting = 0) {
    if (nesting > 8) throw failure('Theme conditional rules are nested too deeply.');
    for (const node of children) {
      if (node.type === 'Atrule') {
        if (!node.block || !node.prelude) throw failure('A conditional theme rule requires a condition and a block.');
        node.name = decodedName(node.name).toLowerCase();
        compileChildren(node.block.children, nesting + 1);
        continue;
      }
      if (node.type !== 'Rule' || node.prelude?.type !== 'SelectorList') throw failure('Unsupported top-level theme syntax.');
      if (++rules > COMMUNITY_THEME_LIMITS.rules) throw failure('Theme CSS has too many rules.');
      const sourceSelectors = node.prelude.children.toArray();
      if (!sourceSelectors.length || (selectors += sourceSelectors.length) > 2048) throw failure('Theme CSS has too many selectors.');
      const rootOnly = sourceSelectors.length === 1 && isRootSelector(sourceSelectors[0]);
      sourceSelectors.forEach(selector => validateSelector(selector, rootOnly));
      for (const declaration of node.block.children) {
        if (declaration.type !== 'Declaration') throw failure('Nested CSS style rules are not supported.');
        validateDeclaration(declaration, rootOnly);
        declaration.important = true;
      }
      node.prelude = parseCss(rootOnly ? scopedBody : sourceSelectors.map(scopeSelector).join(','), 'selectorList');
    }
  }
  compileChildren(ast.children);
  if (!rules) throw failure('A theme must contain at least one style rule.');
  const compiled = generate(ast);
  if (apiVersion === 2 && bytes(compiled) > COMMUNITY_THEME_LIMITS.compiledCssBytes) throw failure('Expanded theme CSS exceeds the 2 MiB limit.');
  if (cacheable) {
    if (compiledCssCache.size >= 8) compiledCssCache.delete(compiledCssCache.keys().next().value);
    compiledCssCache.set(css, compiled);
  }
  return compiled;
}

function metadata(value, key, max, required = false) {
  const text = value[key] ?? '';
  if (typeof text !== 'string' || text.length > max || /[\u0000-\u001f\u007f]/.test(text) || required && !text.trim()) {
    throw failure(`Invalid theme ${key}.`);
  }
  return text.trim();
}

function serializePackageData(value) {
  const ancestors = new Set();
  let nodes = 0;
  function inspect(data, depth = 0) {
    if (++nodes > 24000 || depth > 32) throw failure('Theme package is too complex.');
    if (data === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof data)) return;
    if (typeof data !== 'object' || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(data)) || ancestors.has(data)) {
      throw failure('Theme packages may only contain JSON data.');
    }
    ancestors.add(data);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(data))) {
      if (!Object.hasOwn(descriptor, 'value')) throw failure('Theme packages may only contain JSON data.');
      inspect(descriptor.value, depth + 1);
    }
    ancestors.delete(data);
  }
  inspect(value);
  return JSON.stringify(value);
}


const pngCrcTable = Uint32Array.from({length:256}, (_, index) => {
  let value=index;
  for(let bit=0;bit<8;bit++)value=value>>>1^(value&1?0xedb88320:0);
  return value>>>0;
});
function assetDimensions(data, mime) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ascii = (offset, length) => String.fromCharCode(...data.subarray(offset, offset + length));
  const be32 = offset => view.getUint32(offset);
  const le32 = offset => view.getUint32(offset, true);
  const le24 = offset => data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16;
  let width = 0, height = 0;
  if (mime === 'image/png') {
    if (data.length < 45 || ![137,80,78,71,13,10,26,10].every((byte, index) => data[index] === byte)) throw failure('Invalid PNG theme asset.');
    let offset = 8, header = false, pixels = false, ended = false;
    while (offset + 12 <= data.length) {
      const size = be32(offset), kind = ascii(offset + 4, 4), next = offset + size + 12;
      if (next > data.length) throw failure('Invalid PNG theme asset.');
      if(!/^[A-Za-z]{4}$/.test(kind) || kind[2]!==kind[2].toUpperCase())throw failure('Invalid PNG chunk type.');
      let checksum=0xffffffff;
      for(let index=offset+4;index<next-4;index++)checksum=checksum>>>8^pngCrcTable[(checksum^data[index])&255];
      if(((checksum^0xffffffff)>>>0)!==be32(next-4))throw failure('Invalid PNG chunk checksum.');
      if(kind[0]===kind[0].toUpperCase()&&!['IHDR','PLTE','IDAT','IEND'].includes(kind))throw failure('Unsupported PNG critical chunk.');
      if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT') throw failure('Animated theme assets are not supported.');
      if (!header) {
        if (kind !== 'IHDR' || size !== 13) throw failure('Invalid PNG theme asset.');
        width = be32(offset + 8); height = be32(offset + 12); header = true;
        const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
        if(!depths[data[offset+17]]?.includes(data[offset+16])||data[offset+18]!==0||data[offset+19]!==0||data[offset+20]>1)throw failure('Invalid PNG image header.');
      } else if (kind === 'IHDR') throw failure('Invalid PNG theme asset.');
      if (kind === 'IDAT') pixels = true;
      if (kind === 'IEND') {
        if (size || next !== data.length) throw failure('Invalid PNG theme asset.');
        ended = true; break;
      }
      offset = next;
    }
    if (!header || !pixels || !ended) throw failure('Invalid PNG theme asset.');
  } else if (mime === 'image/jpeg') {
    if (data.length < 20 || data[0] !== 255 || data[1] !== 216 || data.at(-2) !== 255 || data.at(-1) !== 217) throw failure('Invalid JPEG theme asset.');
    let offset = 2, scan = false;
    while (offset + 3 < data.length) {
      if (data[offset++] !== 255) throw failure('Invalid JPEG theme asset.');
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (!marker || marker === 216 || marker === 217 || marker >= 208 && marker <= 215) throw failure('Invalid JPEG theme asset.');
      if (offset + 2 > data.length) throw failure('Invalid JPEG theme asset.');
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > data.length) throw failure('Invalid JPEG theme asset.');
      if ([192,193,194].includes(marker)) {
        if (size < 8 || width || height) throw failure('Invalid JPEG theme asset.');
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
      }
      if (marker === 218) { scan = true; break; }
      offset += size;
    }
    if (!scan || !width || !height) throw failure('Invalid JPEG theme asset.');
  } else if (mime === 'image/webp') {
    if (data.length < 26 || ascii(0,4) !== 'RIFF' || ascii(8,4) !== 'WEBP' || le32(4) + 8 !== data.length) throw failure('Invalid WebP theme asset.');
    let offset = 12, image = false, extended = false;
    while (offset + 8 <= data.length) {
      const kind = ascii(offset,4), size = le32(offset + 4), start = offset + 8, next = start + size + (size % 2);
      if (next > data.length) throw failure('Invalid WebP theme asset.');
      if (kind === 'ANIM' || kind === 'ANMF') throw failure('Animated theme assets are not supported.');
      if (kind === 'VP8X') {
        if (offset !== 12 || size !== 10 || extended || data[start] & 193) throw failure('Invalid WebP theme asset.');
        if (data[start] & 2) throw failure('Animated theme assets are not supported.');
        width = le24(start + 4) + 1; height = le24(start + 7) + 1; extended = true;
      }
      if (kind === 'VP8 ' || kind === 'VP8L') {
        if (image) throw failure('Invalid WebP theme asset.');
        let imageWidth, imageHeight;
        if (kind === 'VP8 ') {
          if (size < 10 || data[start] & 1 || ascii(start + 3,3) !== '\x9d\x01\x2a') throw failure('Invalid WebP theme asset.');
          imageWidth = view.getUint16(start + 6, true) & 16383;
          imageHeight = view.getUint16(start + 8, true) & 16383;
        } else {
          if (size < 5 || data[start] !== 47 || data[start + 4] & 224) throw failure('Invalid WebP theme asset.');
          const dimensions = le32(start + 1);
          imageWidth = (dimensions & 16383) + 1; imageHeight = (dimensions >>> 14 & 16383) + 1;
        }
        if (extended && (width !== imageWidth || height !== imageHeight)) throw failure('Inconsistent WebP theme asset dimensions.');
        width = imageWidth; height = imageHeight; image = true;
      }
      offset = next;
    }
    if (!image || offset !== data.length) throw failure('Invalid WebP theme asset.');
  } else throw failure('Theme assets must be static PNG, JPEG or WebP images.');
  if (!width || !height || width > COMMUNITY_THEME_LIMITS.assetDimension || height > COMMUNITY_THEME_LIMITS.assetDimension || width * height > COMMUNITY_THEME_LIMITS.assetPixels) {
    throw failure('Theme asset dimensions exceed the 4096 pixel or 12 megapixel limit.');
  }
  return {width,height};
}

export function inspectCommunityThemeAsset(input) {
  const asset=validateAssets({image:input}).image;
  const binary=atob(asset.base64),data=Uint8Array.from(binary,character=>character.charCodeAt(0));
  return {...asset,...assetDimensions(data,asset.mime),bytes:data.length};
}

function validateAssets(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw failure('Invalid theme assets.');
  // Do not read an asset getter, inherited field or custom serialization hook.
  try { serializePackageData(input); } catch { throw failure('Invalid theme asset data.'); }
  const assets = {}, descriptors = Object.getOwnPropertyDescriptors(input);
  let total = 0;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key) || ['constructor','prototype'].includes(key)) throw failure('Invalid theme asset name.');
    const value = descriptor.value;
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw failure('Invalid theme asset.');
    const fields = Object.getOwnPropertyDescriptors(value);
    if (!Object.hasOwn(fields, 'mime') || !Object.hasOwn(fields, 'base64') || Object.keys(fields).some(name => !['mime','base64'].includes(name))) throw failure('Invalid theme asset fields.');
    const mime = fields.mime.value, base64 = fields.base64.value;
    if (!['image/png','image/jpeg','image/webp'].includes(mime) || typeof base64 !== 'string' || !base64 || base64.length % 4 ||
        base64.length > Math.ceil(COMMUNITY_THEME_LIMITS.assetBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw failure('Invalid or oversized theme asset encoding.');
    let binary;
    try { binary = atob(base64); } catch { throw failure('Invalid theme asset encoding.'); }
    if (btoa(binary) !== base64) throw failure('Theme asset encoding must use canonical base64.');
    if (binary.length > COMMUNITY_THEME_LIMITS.assetBytes) throw failure('A theme asset exceeds the 512 KiB limit.');
    if ((total += binary.length) > COMMUNITY_THEME_LIMITS.assetsBytes) throw failure('Theme assets exceed the 1 MiB total limit.');
    const data = Uint8Array.from(binary, character => character.charCodeAt(0));
    assetDimensions(data, mime);
    assets[key] = { mime, base64 };
  }
  return assets;
}

export function validateCommunityThemePackage(input) {
  let value = input;
  if (typeof value === 'string') {
    if (bytes(value) > COMMUNITY_THEME_LIMITS.packageV2Bytes) throw failure('Theme package exceeds the 1.5 MiB limit.');
    try { value = JSON.parse(value); } catch { throw failure('Theme package is not valid JSON.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure('Invalid theme package.');
  for (const key of ['format', 'apiVersion', 'name', 'author', 'description', 'version', 'css', 'assets', 'layout']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && !Object.hasOwn(descriptor, 'value')) throw failure('Invalid theme package fields.');
  }
  let serialized;
  try { serialized = serializePackageData(value); } catch { throw failure('Invalid theme package data.'); }
  if (value.format !== 'altara-theme' || ![1, 2].includes(value.apiVersion)) throw failure('Unsupported theme format or API version.');
  const packageLimit = value.apiVersion === 2 ? COMMUNITY_THEME_LIMITS.packageV2Bytes : COMMUNITY_THEME_LIMITS.packageBytes;
  if (bytes(serialized) > packageLimit) throw failure(value.apiVersion === 2 ? 'Theme package exceeds the 1.5 MiB limit.' : 'Theme package exceeds the 128 KiB limit.');
  const assets = validateAssets(Object.hasOwn(value, 'assets') ? value.assets : {});
  if (value.apiVersion === 1 && Object.keys(assets).length) throw failure('Theme assets require API version 2.');
  const hasLayout = Object.hasOwn(value, 'layout');
  if (hasLayout && (value.apiVersion !== 2 || !['dashboard', 'glass-home'].includes(value.layout))) throw failure('Unsupported theme layout.');
  const result = {
    format: 'altara-theme',
    apiVersion: value.apiVersion,
    name: metadata(value, 'name', 60, true),
    author: metadata(value, 'author', 60),
    description: metadata(value, 'description', 240),
    version: metadata(value, 'version', 32, true),
    css: value.css
  };
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(result.version)) throw failure('Theme version must use x.y.z.');
  if (result.apiVersion === 2) result.assets = assets;
  if (hasLayout) result.layout = value.layout;
  compileCommunityThemeCss(result.css, { apiVersion: result.apiVersion, assets });
  return result;
}

function localId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value);
}

function publishedSource(source) {
  if (!source) return null;
  const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
  if (!uuid(source.projectId) || !uuid(source.releaseId) || !uuid(source.accountId) || !uuid(source.creatorId) || !/^[a-f0-9]{64}$/.test(source.sha256 || '')) throw failure('Invalid published theme identity.');
  if (source.latestReleaseId != null && !uuid(source.latestReleaseId)) throw failure('Invalid theme update identity.');
  if (source.priceCents !== undefined && (!Number.isSafeInteger(source.priceCents) || source.priceCents < 0 || source.priceCents > 100000)) throw failure('Invalid published theme price.');
  if (source.currency !== undefined && source.currency !== 'eur') throw failure('Invalid published theme currency.');
  return { projectId: source.projectId, releaseId: source.releaseId, accountId: source.accountId, creatorId: source.creatorId, sha256: source.sha256,
    ...(source.paid === true || source.priceCents > 0 ? { paid: true, priceCents: source.priceCents || 0, currency: 'eur' } : {}),
    creatorName: String(source.creatorName || '').slice(0,60), ...(source.missingPackage===true?{missingPackage:true}:{}), disabled: source.disabled === true, unavailableReason: String(source.unavailableReason || '').slice(0,80),
    latestReleaseId: source.latestReleaseId || null, latestVersion: String(source.latestVersion || '').slice(0,32) };
}

export function createCommunityThemeLibrary(storage, userId, { makeId } = {}) {
  const actor = typeof userId === 'string' ? userId.trim() : '';
  if (actor.length > 160 || /[\u0000-\u001f\u007f]/.test(actor)) throw failure('Invalid theme library account.');
  const key = COMMUNITY_THEME_STORAGE_PREFIX + actor;
  let cachedRaw;
  let cachedState;
  const clone = value => JSON.parse(JSON.stringify(value));
  const requireActor = () => { if (!actor) throw failure('Sign in before saving community themes.', 'COMMUNITY_THEME_ACCOUNT_REQUIRED'); };
  function read() {
    if (!actor) return { installs: [], activeId: null };
    let raw;
    try { raw = storage.getItem(key); } catch { throw failure('The local theme library could not be read.', 'COMMUNITY_THEME_STORAGE_READ'); }
    if (raw === null || raw === undefined || raw === '') return { installs: [], activeId: null };
    if (typeof raw !== 'string' || bytes(raw) > COMMUNITY_THEME_LIMITS.libraryBytes) {
      throw failure('The local theme library is invalid.');
    }
    if (raw === cachedRaw && cachedState) return clone(cachedState);
    let stored;
    try { stored = JSON.parse(raw); } catch { throw failure('The local theme library is invalid.'); }
    if (!stored || stored.version !== 1 || !Array.isArray(stored.installs) || stored.installs.length > COMMUNITY_THEME_LIMITS.installs) {
      throw failure('The local theme library is invalid.');
    }
    const ids = new Set();
    const installs = stored.installs.map(install => {
      if (!install || !localId(install.id) || ids.has(install.id)) throw failure('The local theme library contains invalid identifiers.');
      ids.add(install.id);
      return { id: install.id, package: validateCommunityThemePackage(install.package), ...(install.source ? { source: publishedSource(install.source) } : {}) };
    });
    if (stored.activeId !== null && (typeof stored.activeId !== 'string' || !ids.has(stored.activeId))) throw failure('The active community theme is invalid.');
    cachedRaw = raw;
    cachedState = { installs, activeId: stored.activeId };
    return clone(cachedState);
  }
  function save(state) {
    requireActor();
    const serialized = JSON.stringify({ version: 1, installs: state.installs, activeId: state.activeId });
    if (bytes(serialized) > COMMUNITY_THEME_LIMITS.libraryBytes) throw failure('The local theme library exceeds the 4 MiB limit.', 'COMMUNITY_THEME_STORAGE_FULL');
    try { storage.setItem(key, serialized); } catch { throw failure('The local theme library could not be saved.', 'COMMUNITY_THEME_STORAGE_WRITE'); }
    cachedRaw = serialized;
    cachedState = clone(state);
    return clone(state);
  }
  return Object.freeze({
    read,
    install(input, { source = null } = {}) {
      requireActor();
      const theme = validateCommunityThemePackage(input);
      const state = read();
      if (state.installs.length >= COMMUNITY_THEME_LIMITS.installs) throw failure('The local theme library is full.');
      let id;
      try { id = makeId ? makeId() : globalThis.crypto.randomUUID(); } catch { throw failure('A local theme identifier could not be created.'); }
      if (!localId(id) || state.installs.some(install => install.id === id)) throw failure('Invalid or duplicate local theme identifier.');
      const install = { id, package: theme, ...(source ? { source: publishedSource(source) } : {}) };
      save({ ...state, installs: [...state.installs, install] });
      return clone(install);
    },
    applyAccount(row) {
      requireActor();
      const source = publishedSource(row.source), theme = validateCommunityThemePackage(row.package), state = read();
      if (!source) throw failure('Invalid account theme.');
      const prior = state.installs.find(item => item.source?.projectId === source.projectId);
      let id = prior?.id;
      if (!id) { try { id = makeId ? makeId() : globalThis.crypto.randomUUID(); } catch { throw failure('A theme identifier could not be created.'); } }
      if (!localId(id) || (!prior && state.installs.some(item => item.id === id))) throw failure('Invalid account theme identifier.');
      if (!prior && state.installs.length >= COMMUNITY_THEME_LIMITS.installs) throw failure('The local theme library is full.');
      const item = { id, package: theme, source };
      save({ ...state, installs: prior ? state.installs.map(old => old.id === id ? item : old) : [...state.installs,item] });
      return clone(item);
    },
    reconcileAccount(rows) {
      requireActor(); const state = read(), remote = new Map();
      for (const row of rows) {
        if (row.disabled) { if (!row.projectId || remote.has(row.projectId)) throw failure('Invalid account theme response.'); remote.set(row.projectId,{...row,source:publishedSource(row.source),package:validateCommunityThemePackage(row.package)}); }
        else { const source=publishedSource(row.source); if (!source || remote.has(source.projectId)) throw failure('Duplicate account themes.'); remote.set(source.projectId,{source,package:validateCommunityThemePackage(row.package)}); }
      }
      const installs = state.installs.filter(item => !item.source).map(item => clone(item));
      for (const [projectId,row] of remote) {
        const previous=state.installs.find(item=>item.source?.projectId===projectId);
        if(row.disabled && previous) { installs.push({...previous,source:publishedSource({...row.source,missingPackage:previous.source.missingPackage===true})}); continue; }
        let id=previous?.id; if(!id) {try{id=makeId?makeId():globalThis.crypto.randomUUID();}catch{throw failure('A theme identifier could not be created.');}}
        if(!localId(id)||installs.some(item=>item.id===id))throw failure('Invalid account theme identifier.');
        installs.push({id,package:row.package,source:row.source});
      }
      if(installs.length>COMMUNITY_THEME_LIMITS.installs)throw failure('The local theme library is full.');
      const activeId=installs.some(item=>item.id===state.activeId&&!item.source?.disabled)?state.activeId:null;
      return save({installs,activeId});
    },
    activate(id) {
      requireActor();
      const state = read();
      if (id !== null && (!localId(id) || !state.installs.some(install => install.id === id))) throw failure('Community theme is not installed.');
      if (id !== null && state.installs.find(item => item.id === id)?.source?.disabled) throw failure('This theme release is unavailable.');
      return save({ ...state, activeId: id });
    },
    remove(id) {
      requireActor();
      const state = read();
      if (!localId(id) || !state.installs.some(install => install.id === id)) throw failure('Community theme is not installed.');
      return save({ installs: state.installs.filter(install => install.id !== id), activeId: state.activeId === id ? null : state.activeId });
    },
    export(id) {
      const install = read().installs.find(theme => theme.id === id);
      if (!install) throw failure('Community theme is not installed.');
      if(install.source?.missingPackage)throw failure('This unavailable release has no local package to export.');
      if(install.source?.paid)throw failure('Paid account themes cannot be exported as local theme files.');
      return validateCommunityThemePackage(install.package);
    }
  });
}
