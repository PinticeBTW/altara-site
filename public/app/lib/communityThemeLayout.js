import { generate, ident, parse, walk } from './vendor/css-tree/csstree.esm.js';

export const COMMUNITY_THEME_LAYOUT_ATTRIBUTE = 'data-altara-shell-layout';
export const COMMUNITY_THEME_LAYOUT_VERSION = 'regions-v1';

const FIELDS = ['--altara-shell-layout', '--altara-shell-areas', '--altara-shell-columns', '--altara-shell-rows'];
const REGIONS = ['servers', 'search', 'navigation', 'main', 'context', 'profile', 'voice'];
const TARGETS = {
  servers: '.leftDockGroups', search: '.searchBox', navigation: '.leftDockDms',
  main: '.panel.mid', context: '.panel.right', profile: '#meProfileCard', voice: '#voiceMiniDockSlot',
};
const TRACKS = {
  rail: 'minmax(0,clamp(48px,var(--left-rail-column-width,82px),96px))',
  navigation: 'minmax(0,clamp(220px,min(var(--friends-sidebar-width,308px),28vw),460px))',
  content: 'minmax(0,1fr)', context: 'minmax(0,clamp(220px,min(var(--right-sidebar-width,282px),28vw),420px))',
  controls: 'minmax(220px,auto)', header: 'minmax(64px,auto)', voice: 'minmax(0,auto)', auto: 'minmax(0,auto)',
};
const COLUMN_BUDGET = { rail: 96, navigation: 220, context: 220, controls: 220, header: 64, voice: 0, auto: 0, content: 0 };
// Match the package compiler's whole-cascade pause. The extra host scope has
// higher specificity than the author compiler, without changing any ancestor.
const BODY = 'body[data-altara-community-theme]:is(body,#altaraCommunityThemeScope):not(:has(.altaraConfirmDialog:not(.hidden):not([hidden]),.modal:not(.hidden):not([hidden]),#profileOverlay:not(.hidden):not([hidden]),dialog[open],[data-theme-sensitive="true"]:not(.hidden):not([hidden])))[data-altara-shell-layout="regions-v1"]:not(.authPage):is(body,#altaraNativeShellScope)';
const APP = BODY + ' .app';
// Voice channel views close the native context both before joining and in-call.
const CONTEXT_CLOSED = ':is(.right-collapsed,.dm-focus,:has(:is(#dmMain,#botDmMain).is-server-voice-call-layout))';
const disabled = error => ({ enabled: false, css: '', plans: [], ...(error ? { error } : {}) });
const fail = message => { throw new Error(message); };
const name = value => ident.decode(String(value));
const children = node => (node?.children?.toArray?.() || []).filter(child => child.type !== 'WhiteSpace');
const important = declarations => Object.entries(declarations).map(([key, value]) => `${key}:${value}!important`).join(';');
const rule = (selector, declarations) => `${selector}{${important(declarations)}}`;
const scoped = (root, selectors, declarations) => rule(selectors.map(selector => root + ' ' + selector).join(','), declarations);

function rootSelector(prelude) {
  const selectors = children(prelude);
  if (selectors.length !== 1) return false;
  const nodes = children(selectors[0]);
  return nodes.length === 1 && nodes[0].type === 'PseudoClassSelector' && name(nodes[0].name) === 'root' && !nodes[0].children;
}

function widthMedia(prelude) {
  const queryLists = children(prelude);
  if (queryLists.length !== 1 || queryLists[0].type !== 'MediaQueryList') fail('Shell layouts support width media queries only.');
  const boundedWidth = value => value?.type === 'Dimension' && name(value.unit).toLowerCase() === 'px'
    && Number.isFinite(Number(value.value)) && Number(value.value) >= 0 && Number(value.value) <= 16384;
  function condition(node) {
    if (node.type === 'Feature') return ['width', 'min-width', 'max-width'].includes(name(node.name).toLowerCase()) && boundedWidth(node.value);
    if (node.type === 'Identifier') return ['and', 'or', 'not'].includes(name(node.name).toLowerCase());
    if (node.type === 'Condition') return children(node).length > 0 && children(node).every(condition);
    if (node.type === 'FeatureRange') {
      const parts = [node.left, node.middle, node.right].filter(Boolean);
      return parts.filter(part => part.type === 'Identifier' && name(part.name).toLowerCase() === 'width').length === 1
        && parts.every(part => part.type === 'Identifier' ? name(part.name).toLowerCase() === 'width' : boundedWidth(part))
        && [node.leftComparison, node.rightComparison].filter(Boolean).every(operator => ['<', '>', '<=', '>=', '='].includes(operator));
    }
    return false;
  }
  const queries = children(queryLists[0]);
  if (!queries.length || queries.some(query => query.type !== 'MediaQuery'
      || query.modifier && name(query.modifier).toLowerCase() !== 'only'
      || query.mediaType && !['screen', 'all'].includes(name(query.mediaType).toLowerCase())
      || !query.condition || !condition(query.condition))) fail('Shell layouts support width media queries in px only.');
  return generate(prelude);
}

function tracks(value, count) {
  const nodes = children(value);
  if (nodes.length !== count) fail('Shell track counts must match the area matrix.');
  return nodes.map(node => {
    if (node.type === 'Identifier' && Object.hasOwn(TRACKS, name(node.name))) return name(node.name);
    if (node.type === 'Dimension') {
      const number = Number(node.value), unit = name(node.unit).toLowerCase();
      if (Number.isFinite(number) && (unit === 'px' && number >= 40 && number <= 640 || unit === 'fr' && number >= .25 && number <= 4)) return `${number}${unit}`;
    }
    fail('Shell tracks must use a supported semantic name, 40–640px or 0.25–4fr.');
  });
}

function matrix(value, required = true) {
  const nodes = children(value);
  if (!nodes.length || nodes.length > (required ? 6 : 8) || nodes.some(node => node.type !== 'String')) fail('Shell areas must be one to six quoted rows.');
  const areas = nodes.map(node => node.value.trim().split(/\s+/));
  const count = areas[0].length;
  if (!count || count > 6 || areas.some(row => row.length !== count)) fail('Shell area rows must have the same one to six columns.');
  const regions = {};
  for (let row = 0; row < areas.length; row++) for (let column = 0; column < count; column++) {
    const area = areas[row][column];
    if (area === '.') continue;
    if (!REGIONS.includes(area)) fail('The shell matrix contains an unknown region.');
    if (!regions[area]) regions[area] = { rowStart: row + 1, rowEnd: row + 2, columnStart: column + 1, columnEnd: column + 2 };
    else {
      const bounds = regions[area];
      bounds.rowEnd = Math.max(bounds.rowEnd, row + 2); bounds.columnStart = Math.min(bounds.columnStart, column + 1); bounds.columnEnd = Math.max(bounds.columnEnd, column + 2);
    }
  }
  for (const area of REGIONS) {
    const bounds = regions[area];
    if (!bounds) { if (required) fail(`The shell matrix is missing the ${area} region.`); continue; }
    for (let row = bounds.rowStart - 1; row < bounds.rowEnd - 1; row++) for (let column = bounds.columnStart - 1; column < bounds.columnEnd - 1; column++) {
      if (areas[row][column] !== area) fail('Each shell region must form one solid rectangle.');
    }
  }
  return { areas, regions };
}

function planFromRule(node, media, id) {
  if (!rootSelector(node.prelude)) fail('Shell layout declarations must be in a standalone :root block.');
  const declarations = new Map();
  for (const declaration of children(node.block)) {
    if (declaration.type !== 'Declaration') continue;
    const property = name(declaration.property);
    if (!property.startsWith('--altara-shell-')) continue;
    if (!FIELDS.includes(property)) fail('The shell layout contains an unknown reserved property.');
    if (declarations.has(property)) fail('A shell layout block cannot repeat a layout property.');
    declarations.set(property, declaration.value);
  }
  if (FIELDS.some(field => !declarations.has(field))) fail('Every shell layout block must declare layout, areas, columns and rows together.');
  const version = children(declarations.get(FIELDS[0]));
  if (version.length !== 1 || version[0].type !== 'Identifier' || name(version[0].name) !== COMMUNITY_THEME_LAYOUT_VERSION) fail('Unsupported shell layout version.');
  const grid = matrix(declarations.get(FIELDS[1]));
  return { id, media, ...grid, columns: tracks(declarations.get(FIELDS[2]), grid.areas[0].length), rows: tracks(declarations.get(FIELDS[3]), grid.areas.length) };
}

function trackMinimum(track, axis, minimum = 0) {
  if (axis === 'row') {
    if (track.endsWith('px')) return Math.max(Number(track.slice(0, -2)), minimum);
    if (['rail', 'controls', 'header'].includes(track)) return Math.max(64, minimum);
    if (['navigation', 'context', 'content'].includes(track) || track.endsWith('fr')) return Math.max(160, minimum);
  } else {
    if (track === 'controls') return Math.max(220, minimum);
    if (track === 'header') return Math.max(64, minimum);
  }
  return minimum;
}

function trackCss(track, axis, minimum = 0) {
  const floor = trackMinimum(track, axis, minimum);
  if (axis === 'row') {
    if (track === 'rail') return `${floor}px`;
    if (['controls', 'header', 'context', 'auto', 'voice'].includes(track)) return `minmax(${floor}px,auto)`;
    if (track === 'navigation' || track === 'content') return `minmax(${floor}px,1fr)`;
  } else {
    if (track === 'rail') return `minmax(${floor}px,max(${floor}px,clamp(48px,var(--left-rail-column-width,82px),96px)))`;
    if (track === 'navigation') return `minmax(${floor}px,clamp(220px,min(var(--friends-sidebar-width,308px),28vw),460px))`;
    if (track === 'context') return `minmax(${floor}px,clamp(220px,min(var(--right-sidebar-width,282px),28vw),420px))`;
    if (track === 'content') return `minmax(${floor}px,1fr)`;
    if (['controls', 'header', 'auto', 'voice'].includes(track)) return `minmax(${floor}px,auto)`;
  }
  if (track.endsWith('fr')) return `minmax(${floor}px,${track})`;
  return `minmax(${floor}px,${Math.max(floor, Number(track.slice(0, -2)))}px)`;
}

function regionMinimums(plan, axis) {
  const column = axis === 'column', tracks = column ? plan.columns : plan.rows;
  const minimums = tracks.map(track => trackMinimum(track, axis));
  const rowBudget = { rail: 64, navigation: 160, context: 160, controls: 64, header: 64, voice: 0, auto: 0, content: 160 };
  const semantic = column ? COLUMN_BUDGET : rowBudget;
  const budget = track => Object.hasOwn(semantic, track) ? semantic[track] : track.endsWith('px') ? Number(track.slice(0, -2)) : 0;
  for (const [region, minimum] of [['profile', column ? 220 : 64], ['main', 240], ['servers', 72]]) {
    const bounds = plan.regions[region];
    if (!bounds) continue;
    const indexes = tracks.map((_, index) => index).filter(index => index >= bounds[axis + 'Start'] - 1 && index < bounds[axis + 'End'] - 1);
    const available = indexes.reduce((sum, index) => sum + minimums[index], 0);
    if (available >= minimum) continue;
    const flexible = indexes.find(index => tracks[index] === 'content' || tracks[index].endsWith('fr') || !column && tracks[index] === 'navigation');
    const nonVoice = column ? indexes : indexes.filter(index => tracks[index] !== 'voice');
    const candidates = nonVoice.length ? nonVoice : indexes;
    const preferred = flexible ?? candidates.reduce((best, index) => budget(tracks[index]) > budget(tracks[best]) ? index : best);
    minimums[preferred] += minimum - available;
  }
  return minimums;
}

function planCss(plan, selector = APP) {
  const columnMinimum = regionMinimums(plan, 'column'), rowMinimum = regionMinimums(plan, 'row');
  const declarations = {
    '--altara-native-shell-active': '1', '--altara-shell-plan-id': String(plan.id),
    '--altara-shell-column-count': String(plan.columns.length), '--altara-shell-row-count': String(plan.rows.length),
    'grid-template-areas': plan.areas.map(row => `"${row.join(' ')}"`).join(' '),
    'grid-template-columns': plan.columns.map((track, index) => `var(--altara-shell-column-${index + 1},${trackCss(track, 'column', columnMinimum[index])})`).join(' '),
    'grid-template-rows': plan.rows.map((track, index) => `var(--altara-shell-row-${index + 1},${trackCss(track, 'row', rowMinimum[index])})`).join(' '),
  };
  for (const [axis, tracks, minimums] of [['column', plan.columns, columnMinimum], ['row', plan.rows, rowMinimum]]) {
    tracks.forEach((track, index) => { declarations[`--altara-shell-${axis}-${index + 1}-min`] = String(trackMinimum(track, axis, minimums[index])); });
  }
  for (const area of REGIONS) {
    const bounds = plan.regions[area];
    for (const [dimension, property] of [['row', 'rowStart'], ['row', 'rowEnd'], ['column', 'columnStart'], ['column', 'columnEnd']]) {
      declarations[`--altara-shell-${area}-${dimension}-${property.endsWith('Start') ? 'start' : 'end'}`] = String(bounds?.[property] || 0);
    }
  }
  let css = rule(selector, declarations);
  const horizontal = horizontalServers(plan);
  css += scoped(selector, ['#leftGroupsRail', '.groupOrbFolderWrap', '.groupOrbFolderStack'], { 'flex-direction': horizontal ? 'row' : 'column' });
  css += scoped(selector, ['#leftGroupsRail'], { 'overflow-x': horizontal ? 'auto' : 'hidden', 'overflow-y': horizontal ? 'hidden' : 'auto' });
  return css;
}

function horizontalServers(plan) {
  if (typeof plan.serverHorizontal === 'boolean') return plan.serverHorizontal;
  const rail = plan.regions.servers;
  return !!rail && (rail.columnEnd - rail.columnStart > 1 || rail.rowEnd - rail.rowStart === 1 && ['header', 'rail'].includes(plan.rows[rail.rowStart - 1]));
}

function collapsedPlan(plan, leftCollapsed, rightCollapsed) {
  const removed = new Set([...(leftCollapsed ? ['search', 'navigation'] : []), ...(rightCollapsed ? ['context'] : [])]);
  const areas = plan.areas.map(row => row.map(area => removed.has(area) ? '.' : area));
  const main = plan.regions.main, height = areas.length, width = areas[0].length;
  let best = { top: main.rowStart - 1, bottom: main.rowEnd - 1, left: main.columnStart - 1, right: main.columnEnd - 1 };
  let score = (best.bottom - best.top) * (best.right - best.left);
  // At most 6x6 cells: choose a rectangle containing main, consuming only its
  // old cells and newly hidden regions. Never cover another live region or an
  // intentional author gap, and never create an L-shaped named CSS area.
  for (let top = 0; top < main.rowStart; top++) for (let bottom = main.rowEnd - 1; bottom <= height; bottom++) {
    for (let left = 0; left < main.columnStart; left++) for (let right = main.columnEnd - 1; right <= width; right++) {
      let free = true;
      for (let row = top; free && row < bottom; row++) for (let column = left; column < right; column++) {
        const area = plan.areas[row][column];
        if (area !== 'main' && !removed.has(area)) { free = false; break; }
      }
      const nextScore = (bottom - top) * (right - left);
      if (free && (nextScore > score || nextScore === score && right - left > best.right - best.left)) {
        best = { top, bottom, left, right }; score = nextScore;
      }
    }
  }
  for (let row = best.top; row < best.bottom; row++) for (let column = best.left; column < best.right; column++) areas[row][column] = 'main';
  // Preserve deliberate empty tracks; remove only tracks emptied by collapse.
  const rows = areas.map((row, index) => index).filter(index => areas[index].some(area => area !== '.') || !plan.areas[index].some(area => removed.has(area)));
  const columns = areas[0].map((_, index) => index).filter(index => areas.some(row => row[index] !== '.') || !plan.areas.some(row => removed.has(row[index])));
  const values = { children: { toArray: () => rows.map(row => ({ type: 'String', value: columns.map(column => areas[row][column]).join(' ') })) } };
  return { id: 3000 + plan.id * 4 + Number(leftCollapsed) + Number(rightCollapsed) * 2, media: null,
    ...matrix(values, false), columns: columns.map(index => plan.columns[index]), rows: rows.map(index => plan.rows[index]), serverHorizontal: horizontalServers(plan) };
}

function minimumWidth(plan) {
  // Native width preferences are capped by the viewport in TRACKS. Budget their
  // usable minimum, rather than forcing ordinary laptops into a stacked plan.
  const minimums = regionMinimums(plan, 'column');
  const widths = plan.columns.map((track, index) => Math.max(minimums[index], Object.hasOwn(COLUMN_BUDGET, track) ? COLUMN_BUDGET[track] : track.endsWith('px') ? Number(track.slice(0, -2)) : 0));
  return Math.ceil(widths.reduce((sum, width) => sum + width, 0) + 24 * (widths.length - 1) + 32);
}

function compactPlan(id, leftCollapsed, rightCollapsed, mobile = false) {
  const rows = mobile
    ? ['servers profile', 'main main', ...(leftCollapsed ? [] : ['search search', 'navigation navigation']), 'voice voice', ...(rightCollapsed ? [] : ['context context'])]
    : leftCollapsed ? rightCollapsed ? ['servers profile', 'main main', 'voice voice'] : ['servers profile context', 'main main context', 'voice voice context']
      : ['servers search profile', 'servers navigation main', 'servers voice main'];
  const value = { children: { toArray: () => rows.map(row => ({ type: 'String', value: row })) } };
  return { id, media: null, ...matrix(value, false), columns: mobile ? ['rail', 'content'] : leftCollapsed ? rightCollapsed ? ['content', 'controls'] : ['content', 'controls', 'context'] : ['rail', 'navigation', 'content'],
    rows: mobile ? ['rail', 'content', ...(leftCollapsed ? [] : ['header', '160px']), 'voice', ...(rightCollapsed ? [] : ['160px'])] : ['header', 'content', 'voice'] };
}

function commonCss() {
  let css = rule(APP, { display: 'grid', 'grid-auto-columns': '0px', 'grid-auto-rows': '0px', 'grid-auto-flow': 'row', 'min-width': '0', 'min-height': '0', 'max-width': '100%', gap: 'clamp(0px,var(--ct-spacing,8px),24px)', 'align-items': 'stretch', 'align-content': 'stretch', position: 'relative', isolation: 'isolate', 'margin-top': '0', 'padding-top': 'max(40px,var(--desktop-titlebar-overlay-height,0px))', 'box-sizing': 'border-box', overflow: 'auto' });
  // The shell reserves the native window/history band once. Old pane/header
  // offsets otherwise reserve it again when a real conversation is opened.
  css += scoped(APP, ['.midTop', '.rightTop'], { 'min-height': '64px', padding: '14px' });
  css += scoped(APP, ['.panel.mid.is-dm-conversation-open :is(#dmMain,#botDmMain)'], { 'padding-top': '0' });
  css += scoped(APP, ['.panel.left', '.leftTop', '.leftList.leftDock', '.leftBottomVoiceStack'], { display: 'contents', transform: 'none', filter: 'none', opacity: '1', visibility: 'visible', 'pointer-events': 'auto' });
  css += scoped(APP, ['.leftTabsSingle', '.sidebarBrand'], { display: 'none' });
  for (const area of REGIONS) css += scoped(APP, [TARGETS[area]], {
    'grid-area': area, position: 'relative', inset: 'auto', transform: 'none', float: 'none',
    margin: '0', width: 'auto', height: 'auto', 'min-width': '0', 'min-height': '0', 'max-width': '100%', 'max-height': '100%',
    opacity: '1', visibility: 'visible', 'pointer-events': 'auto', 'box-sizing': 'border-box', 'z-index': 'auto',
  });
  css += scoped(APP, ['.leftDockGroups', '.searchBox', '#meProfileCard', '#voiceMiniDockSlot'], { display: 'flex' });
  css += scoped(APP, ['.leftDockGroups'], { overflow: 'hidden', padding: '0' });
  css += scoped(APP, ['#leftGroupsRail'], { display: 'flex', width: '100%', height: '100%', 'min-height': '0', 'min-width': '0', 'max-height': '100%', 'max-width': '100%', gap: '8px', padding: '8px', 'box-sizing': 'border-box', 'align-items': 'center', 'justify-content': 'flex-start' });
  css += scoped(APP, ['#leftGroupsRail .groupOrb', '#leftGroupsRail .groupOrbFolderWrap', '#leftGroupsRail .groupOrbFolderStack'], { 'flex-shrink': '0' });
  css += scoped(APP, ['.searchBox'], { 'align-items': 'center', overflow: 'hidden' });
  css += scoped(APP, ['.searchBox input'], { 'min-width': '0', width: '100%', 'box-sizing': 'border-box' });
  css += scoped(APP, ['.leftDockDms', '.panel.right'], { display: 'flex', 'flex-direction': 'column', overflow: 'hidden' });
  css += scoped(APP, ['.leftDockDms > #dmList', '.leftDockDms > #serverChannelsPanel'], { 'min-width': '0', 'max-width': '100%', width: '100%', 'min-height': '0', 'overflow-x': 'hidden' });
  css += scoped(APP, ['#meProfileCard'], { 'align-items': 'center', gap: '8px', padding: '8px', 'min-height': '64px', overflow: 'hidden' });
  css += scoped(APP, ['#meProfileCard .meText'], { 'min-width': '0', flex: '1 1 auto' });
  css += scoped(APP, ['#meProfileCard .meControls'], { display: 'flex', 'flex-shrink': '0' });
  css += scoped(APP, ['#voiceMiniDockSlot'], { 'flex-direction': 'column', overflow: 'auto', 'max-height': 'min(35vh,240px)' });
  css += scoped(APP, ['.panel.mid'], { overflow: 'hidden', 'min-height': '240px' });
  // Preserve the real controls and focus. A narrow main region wraps the native
  // composer instead of squeezing its field or pushing Send outside the panel.
  css += scoped(APP, ['.dmComposer'], { 'flex-wrap': 'wrap' });
  css += scoped(APP, ['.dmComposer .dmInputWrap'], { flex: '1 1 80px', 'min-width': '80px', 'max-width': '100%' });
  return css;
}

function fallbackCss(plan) {
  let css = '';
  const left = APP + '.left-collapsed', right = APP + CONTEXT_CLOSED + ':not(.left-collapsed)', both = APP + '.left-collapsed' + CONTEXT_CLOSED;
  const states = [[APP, false, false, plan], [left, true, false, collapsedPlan(plan, true, false)],
    [right, false, true, collapsedPlan(plan, false, true)], [both, true, true, collapsedPlan(plan, true, true)]];
  for (const [selector, , , state] of states.slice(1)) css += planCss(state, selector);
  css += scoped(APP + CONTEXT_CLOSED, ['.panel.right'], { display: 'none' });
  css += scoped(left, ['.searchBox', '.leftDockDms'], { display: 'none' });
  const drawer = left + '.left-overlay-open';
  css += scoped(drawer, ['.searchBox', '.leftDockDms'], { display: 'flex', position: 'absolute', 'grid-area': 'main', left: '8px', width: 'min(340px,calc(100% - 16px))', 'max-width': 'calc(100% - 16px)', 'z-index': '40', 'box-shadow': '0 8px 28px #0008', 'background-color': 'var(--altara-bg,#16161c)' });
  css += scoped(drawer, ['.searchBox'], { top: '8px', height: '48px' });
  css += scoped(drawer, ['.leftDockDms'], { top: '56px', bottom: '8px', height: 'auto' });
  // One-column native fallback keeps the profile and the main surface readable.
  // The existing collapse/overlay actions continue to control navigation.
  for (const [index, [selector, leftCollapsed, rightCollapsed, state]] of states.entries()) {
    css += `@media(max-width:${Math.max(760, minimumWidth(state) - 1)}px){`;
    css += planCss(compactPlan(2000 + index, leftCollapsed, rightCollapsed, true), selector);
    css += scoped(selector, ['#leftGroupsRail', '.groupOrbFolderWrap', '.groupOrbFolderStack'], { 'flex-direction': 'row' });
    css += scoped(selector, ['#leftGroupsRail'], { 'overflow-x': 'auto', 'overflow-y': 'hidden' });
    css += scoped(selector, ['#meProfileCard'], { width: '100%', 'min-height': '64px' });
    css += '}';
  }
  return css;
}

/** Compile an optional, bounded shell request. Package CSS is never rewritten. */
export function compileCommunityThemeLayout(css) {
  if (typeof css !== 'string' || !css.includes('--altara-shell-') && !css.includes('\\')) return disabled();
  try {
    if (new TextEncoder().encode(css).byteLength > 96 * 1024) fail('Theme CSS exceeds the shell layout input limit.');
    const ast = parse(css, { parseCustomProperty: true, onParseError: () => fail('Invalid shell CSS syntax.') });
    let nodes = 0, depth = 0;
    walk(ast, { enter(node) {
      if (++nodes > 24000 || ++depth > 32) fail('Shell CSS is too complex.');
      if (node.type === 'Declaration' && name(node.property).startsWith('--altara-native-shell-')) fail('Native shell capability properties belong to ALTARA.');
    }, leave() { depth--; } });
    const plans = [];
    function inspect(list, media = [], allowed = true) {
      for (const node of children(list)) {
        if (node.type === 'Rule') {
          const reserved = children(node.block).some(declaration => declaration.type === 'Declaration' && name(declaration.property).startsWith('--altara-shell-'));
          if (reserved) {
            if (!allowed) fail('Shell layout blocks support only width media conditions.');
            if (plans.length >= 16) fail('A theme may contain at most sixteen complete shell plans.');
            plans.push(planFromRule(node, media, plans.length + 1));
          }
        } else if (node.type === 'Atrule' && node.block) {
          const hasLayout = (() => { let found = false; walk(node.block, candidate => { if (candidate.type === 'Declaration' && name(candidate.property).startsWith('--altara-shell-')) found = true; }); return found; })();
          if (!hasLayout) continue;
          if (name(node.name).toLowerCase() !== 'media') inspect(node.block, media, false);
          else inspect(node.block, [...media, widthMedia(node.prelude)], allowed);
        }
      }
    }
    inspect(ast);
    if (!plans.length) return disabled();
    if (!plans.some(plan => !plan.media.length)) fail('A shell layout requires a complete unconditional :root plan.');
    let result = commonCss();
    for (const plan of plans) {
      plan.minimumWidth = minimumWidth(plan);
      let content = planCss(plan) + fallbackCss(plan);
      for (const media of [...plan.media].reverse()) content = `@media ${media}{${content}}`;
      result += content;
    }
    // Keep native visibility authoritative even in the more specific collapsed
    // drawer states. Only direct region nodes are affected, never their data.
    result += scoped(APP + ':is(.app):is(.app):is(.app)', Object.values(TARGETS).flatMap(target => [target + '[hidden]', target + '.hidden']), { display: 'none' });
    return { enabled: true, css: result, plans };
  } catch (error) { return disabled(error instanceof Error ? error.message : 'Invalid shell layout.'); }
}
