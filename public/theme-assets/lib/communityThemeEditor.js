// The visual editor owns one explicit CSS block. Everything outside it is kept
// byte-for-byte, including advanced rules it does not understand.
export const THEME_EDITOR_START = '/* ALTARA visual tokens: start */';
export const THEME_EDITOR_END = '/* ALTARA visual tokens: end */';
export const COMMUNITY_THEME_TOKENS = Object.freeze({
    background: { type: 'color', default: '#101010', token: '--ct-background' },
    surface: { type: 'color', default: '#211d1b', token: '--ct-surface' },
    accent: { type: 'color', default: '#edc8a4', token: '--ct-accent' },
    text: { type: 'color', default: '#f4eee8', token: '--ct-text' },
    muted: { type: 'color', default: '#b9aea6', token: '--ct-muted' },
    transparency: { type: 'number', min: 0, max: 70, default: 45, token: '--ct-surface-alpha' },
    blur: { type: 'number', min: 0, max: 24, default: 14, token: '--ct-blur' },
    radius: { type: 'number', min: 0, max: 28, default: 20, token: '--ct-radius' },
    spacing: { type: 'number', min: 8, max: 24, default: 16, token: '--ct-spacing' },
    border: { type: 'number', min: 0, max: 2, default: 1, token: '--ct-border' },
    shadow: { type: 'number', min: 0, max: 30, default: 18, token: '--ct-shadow' },
    typography: { type: 'enum', values: ['system', 'rounded', 'mono'], default: 'system', token: '--ct-font' },
});
const FONT_STACKS = Object.freeze({ system: '"Segoe UI",system-ui,-apple-system,sans-serif', rounded: '"Manrope","Segoe UI",system-ui,sans-serif', mono: '"Cascadia Code","Consolas",ui-monospace,monospace' });
export function validateVisualThemeOptions(options = {}) {
    const clean = {};
    for (const [key, field] of Object.entries(COMMUNITY_THEME_TOKENS)) {
        const value = options[key] ?? field.default;
        if (field.type === 'color') {
            if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value))
                throw new Error(`Invalid theme ${key}.`);
            clean[key] = value.toLowerCase();
        }
        else if (field.type === 'number') {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max)
                throw new Error(`Invalid theme ${key}.`);
            clean[key] = Math.round(value * 100) / 100;
        }
        else {
            if (!field.values.includes(value))
                throw new Error(`Invalid theme ${key}.`);
            clean[key] = value;
        }
    }
    return clean;
}
function managedRange(css) {
    const start = css.indexOf(THEME_EDITOR_START), end = css.indexOf(THEME_EDITOR_END);
    if (start < 0 && end < 0)
        return null;
    if (start < 0 || end < start || css.indexOf(THEME_EDITOR_START, start + 1) >= 0 || css.indexOf(THEME_EDITOR_END, end + 1) >= 0)
        throw new Error('The visual token block is ambiguous. Repair its markers in the CSS editor first.');
    return [start, end + THEME_EDITOR_END.length];
}
export function readVisualThemeOptions(css) {
    const source = String(css || ''), range = managedRange(source);
    if (!range)
        return { managed: false, options: validateVisualThemeOptions() };
    const marker = /\/\* ALTARA options: (\{[^\r\n]*\}) \*\//.exec(source.slice(...range));
    if (!marker)
        throw new Error('The visual token block has no valid options. Repair it in the CSS editor first.');
    let options;
    try {
        options = JSON.parse(marker[1]);
    }
    catch {
        throw new Error('Invalid visual theme options.');
    }
    return { managed: true, options: validateVisualThemeOptions(options) };
}
export function updateVisualThemeCss(css, options, { backgroundAsset = false } = {}) {
    const source = String(css || ''), range = managedRange(source), clean = validateVisualThemeOptions(options);
    const declarations = Object.entries(COMMUNITY_THEME_TOKENS).map(([key, field]) => {
        let value = clean[key];
        if (key === 'typography')
            value = FONT_STACKS[value];
        else if (key === 'transparency')
            value = (1 - value / 100).toFixed(2);
        else if (['blur', 'radius', 'spacing', 'border', 'shadow'].includes(key))
            value += 'px';
        return `${field.token}:${value};`;
    }).join('');
    const block = `${THEME_EDITOR_START}\n/* ALTARA options: ${JSON.stringify(clean)} */\n:root{${declarations}}\n.app{background-color:var(--ct-background);color:var(--ct-text);font-family:var(--ct-font);--altara-accent:var(--ct-accent);--altara-text:var(--ct-text);--altara-text-muted:var(--ct-muted);}\n${backgroundAsset ? '.app{background-image:linear-gradient(90deg,rgba(0,0,0,.60),rgba(0,0,0,.22)),theme-asset(room);background-size:cover;background-position:center;}\n' : ''}[data-theme-slot="widget-card"],.themeHomeServers,.themeHomeActivity,.activeNowCard{background-color:color-mix(in srgb,var(--ct-surface) calc(var(--ct-surface-alpha)*100%),transparent);border:var(--ct-border) solid rgba(255,237,214,.18);border-radius:var(--ct-radius);backdrop-filter:blur(var(--ct-blur)) saturate(1.12);box-shadow:0 8px var(--ct-shadow) rgba(0,0,0,.15);}\n[data-theme-slot="widget-grid"]{gap:var(--ct-spacing);}\n[data-theme-slot="widget-title"]{font-size:14px;font-weight:600;text-transform:none;}\n.app :is(input,textarea,select){accent-color:var(--ct-accent);}\n@media(prefers-reduced-transparency:reduce){[data-theme-slot="widget-card"],.themeHomeServers,.themeHomeActivity,.activeNowCard{background-color:var(--ct-surface);backdrop-filter:none;}}\n@media(prefers-reduced-motion:reduce){.app *{transition:none;scroll-behavior:auto;}}\n${THEME_EDITOR_END}`;
    return range ? source.slice(0, range[0]) + block + source.slice(range[1]) : source + (source.endsWith('\n') ? '' : '\n') + block;
}
export const COMMUNITY_THEME_VISUAL_STARTER = Object.freeze({ format: 'altara-theme', apiVersion: 2, name: 'My theme', author: '', description: 'A warm theme with editable visual tokens.', version: '1.0.0', assets: {}, layout: 'dashboard', css: updateVisualThemeCss('', {}) });
export function mountVisualThemeEditor(document, host, { css, getLanguage = () => 'en', onChange = () => { }, onError = () => { }, alive = () => true, hasBackground = () => false } = {}) {
    const pt = /^pt/i.test(String(getLanguage())), labels = pt ? { background: 'Fundo', surface: 'Superfície', accent: 'Destaque', text: 'Texto', muted: 'Texto secundário', transparency: 'Transparência (%)', blur: 'Blur (px)', radius: 'Raio (px)', spacing: 'Espaçamento (px)', border: 'Borda (px)', shadow: 'Sombra (px)', typography: 'Tipografia' } : { background: 'Background', surface: 'Surface', accent: 'Accent', text: 'Text', muted: 'Secondary text', transparency: 'Transparency (%)', blur: 'Blur (px)', radius: 'Radius (px)', spacing: 'Spacing (px)', border: 'Border (px)', shadow: 'Shadow (px)', typography: 'Typography' };
    const parsed = readVisualThemeOptions(css.value), options = { ...parsed.options };
    const heading = document.createElement('p');
    heading.className = 'communityThemesHint';
    heading.textContent = pt ? 'O editor visual gere apenas o bloco ALTARA visual tokens. As restantes regras CSS mantêm-se. As escolhas só são aplicadas quando alteras um controlo.' : 'The visual editor manages only the ALTARA visual tokens block. Other CSS rules are preserved. Options are applied when you change a control.';
    host.append(heading);
    const grid = document.createElement('div');
    grid.className = 'communityThemesVisualGrid';
    host.append(grid);
    for (const [key, field] of Object.entries(COMMUNITY_THEME_TOKENS)) {
        const label = document.createElement('label');
        label.className = 'communityThemesField';
        const name = document.createElement('span');
        name.textContent = labels[key];
        label.append(name);
        const control = document.createElement(field.type === 'enum' ? 'select' : 'input');
        control.dataset.themeToken = key;
        if (field.type === 'enum')
            for (const value of field.values) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value === 'system' ? (pt ? 'Sistema' : 'System') : value === 'rounded' ? (pt ? 'Arredondada' : 'Rounded') : 'Mono';
                control.append(option);
            }
        else {
            control.type = field.type === 'color' ? 'color' : 'number';
            if (field.type === 'number') {
                control.min = field.min;
                control.max = field.max;
                control.step = 1;
            }
        }
        control.value = options[key];
        label.append(control);
        grid.append(label);
        control.addEventListener('change', () => { if (!alive())
            return; try {
            const current = readVisualThemeOptions(css.value);
            const next = { ...(current.managed ? current.options : options), [key]: field.type === 'number' ? Number(control.value) : control.value };
            css.value = updateVisualThemeCss(css.value, next, { backgroundAsset: hasBackground() });
            Object.assign(options, next);
            onChange();
        }
        catch (error) {
            onError(error);
        } });
    }
    return { refresh() { const current = readVisualThemeOptions(css.value); if (current.managed)
            for (const control of grid.querySelectorAll('[data-theme-token]'))
                control.value = current.options[control.dataset.themeToken]; } };
}
