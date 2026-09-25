// ALTARA's existing inline SVG family: 24-unit canvas, rounded 2-unit strokes.
// These app-owned shapes reuse the call controls already shipped by ALTARA.
// No icon font, OS glyph, external asset, or package is required.
const mic = '<path d="M12 4a3 3 0 0 1 3 3v4a3 3 0 1 1-6 0V7a3 3 0 0 1 3-3z"/><path d="M5 10a7 7 0 0 0 14 0M12 17v3M9 20h6"/>';
const headphones = '<path d="M4 12a8 8 0 0 1 16 0"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>';
const volume = '<path d="M4 9v6h4l5 4V5L8 9H4Zm13 0a5 5 0 0 1 0 6"/>';
const slash = '<path d="M4 4l16 16"/>';

export const CALL_ICON_SHAPES = Object.freeze({
  mic,
  micOff: mic + slash,
  headphones,
  headphonesOff: headphones + slash,
  share: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 7v6m-2.5-3.5L12 7l2.5 2.5"/>',
  camera: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 11 6-3v8l-6-3z"/>',
  spatial: '<path d="M4 9v6M8 6v12M12 4v16M16 7v10M20 10v4"/>',
  phone: '<path d="M6 4h4l2 5-3 2a14 14 0 0 0 4 4l2-3 5 2v4c0 1.1-.9 2-2 2C10.3 20 4 13.7 4 6c0-1.1.9-2 2-2z"/>',
  hangup: '<path d="M3 13c5-4 13-4 18 0v4h-5v-4a14 14 0 0 0-8 0v4H3z"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  fullscreen: '<g class="callIcon__expand"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></g><g class="callIcon__collapse"><path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"/></g>',
  popout: '<path d="M14 3h7v7m0-7-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  openCall: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 11h8M12 7v8"/>',
  volume,
  volumeOff: volume + slash,
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  shield: '<path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3z"/>',
  shieldOff: '<path d="m12 3 8 3v5a11 11 0 0 1-2 6M14 20l-2 1c-4-2-8-5-8-10V6l2-.75"/>' + slash,
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.2 6.2a8 8 0 0 1 13 2.8M4.8 15a8 8 0 0 0 13 2.8"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  arrowLeft: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
});

export function callIconSvg(name) {
  if (!Object.hasOwn(CALL_ICON_SHAPES, name)) throw new TypeError(`Unknown call icon: ${name}`);
  return `<svg class="altaraIcon callIcon" data-call-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${CALL_ICON_SHAPES[name]}</svg>`;
}
