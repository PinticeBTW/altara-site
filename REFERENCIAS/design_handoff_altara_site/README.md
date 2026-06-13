# Handoff: Altara Marketing Site

## Overview
Marketing site for **Altara** — a chat/hangout app for friends and small communities ("Where friends stay together"). Three pages: Home, Features, About. Designed with a colorful-but-restrained aesthetic, dark default theme with light toggle, custom cursor, and smooth scroll reveals.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the target codebase's environment** (React, Next.js, Vue, Astro, etc.), using its established patterns, component library, and routing. If there is no codebase yet, choose the most appropriate framework — **Next.js + Tailwind** is recommended for a marketing site of this scope.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are intentional. Recreate pixel-perfectly using the target stack's primitives. Animations (cursor trail, scroll reveal, hover lifts) should be ported to the target's idioms (Framer Motion / View Transitions / CSS) rather than copied as raw JS.

## Pages

### 1. Home (`index.html`)
- **Sticky nav** (blur backdrop, logo + 3 links + theme toggle + Download CTA)
- **Hero** (centered): eyebrow pill, big H1 with one italic accent word, subhead, two CTAs (Download / Try in browser), 3 meta dots
- **Demo mockup**: full-width framed app screenshot — 4-column layout (server rail 72px / channels 240px / chat fluid / members 280px), titlebar with traffic-light dots and `altara.app · #general` URL. Shows realistic chat with avatars, encrypted composer, embedded Spotify widget and poll widget.
- **Highlights**: 3-card grid (Widgets / Encrypted DMs / Personalization)
- **Download CTA band**: rounded card with 4 platform buttons (macOS, Windows, Linux, Browser)
- **Footer**: 4-column grid + giant low-opacity "altara" wordmark + copyright

### 2. Features (`features.html`)
- **Page hero**: eyebrow + H1 + lead
- **3 feature blocks** (alternating left/right): numbered (`01 — Widgets`), title with one italic accent word, paragraph, checklist of 3 items, illustration panel on opposite side. Illustrations are CSS-built mockups (widgets grid, encrypted bubbles, theme cards).
- **Spec grid**: 4×2 grid of small feature cards (no ads, 28MB install, sync, voice, etc.)

### 3. About (`about.html`)
- **Hero**: 2-col asymmetric (big H1 left, lead paragraph right)
- **Story section**: 320px label column + body column, 3 paragraphs with italic accent words
- **Team grid**: 3 cards (real member: Tomás Nunes / @pintice; two dashed-border placeholder cards for "Hiring" and "Beta testers")
- **Principles**: 4 numbered rows (`/ 01`, `/ 02`...) with title + description
- **Join CTA**: rounded card with two buttons

## Design Tokens

### Colors (default — red/coral accent)
```
--accent-1: #fb7185   /* primary accent (red) */
--accent-2: #fb923c   /* orange */
--accent-3: #fbbf24   /* amber */

/* Dark theme (default) */
--bg:           #0b0a12
--bg-soft:      #14121f
--bg-card:      #1a1828
--border:       rgba(255,255,255,0.08)
--border-strong:rgba(255,255,255,0.14)
--fg:           #f5f3ff
--fg-muted:     rgba(245,243,255,0.62)
--fg-dim:       rgba(245,243,255,0.42)

/* Light theme */
--bg:           #fbf9f5
--bg-soft:      #f3efe7
--bg-card:      #ffffff
--border:       rgba(15,12,30,0.08)
--border-strong:rgba(15,12,30,0.14)
--fg:           #0f0c1e
--fg-muted:     rgba(15,12,30,0.62)
--fg-dim:       rgba(15,12,30,0.42)
```

User-switchable accent palettes (via Tweaks panel):
- `violet`: `#a78bfa, #f472b6, #fb923c`
- `blue`:   `#60a5fa, #22d3ee, #a78bfa`
- `green`:  `#34d399, #a3e635, #22d3ee`
- `red`:    `#fb7185, #fb923c, #fbbf24` (default)

### Typography
- **Display** (h1–h4, logo): `Bricolage Grotesque` — weights 400/600/700/800, opsz variable. From Google Fonts.
- **Body**: `Inter` — weights 400/500/600/700.
- **Mono** (URLs, numbered labels like `01 — Widgets`, code/key fingerprints): `JetBrains Mono` — 400/500.

Type scale:
- `h1`: clamp(48px, 8vw, 112px) · weight 700 · letter-spacing −0.025em · line-height 1.02
- `h2`: clamp(36px, 5vw, 68px) · letter-spacing −0.03em
- `h3`: clamp(22px, 2.4vw, 30px) · letter-spacing −0.015em
- body: 16px / 1.55
- eyebrow: 13px · 500
- spec/footer labels: 13px · uppercase · letter-spacing 0.1em · color `--fg-dim`

### Radii
- `--radius-sm`: 10px (small chips, channel rows)
- `--radius`:    18px (panels)
- `--radius-lg`: 28px (cards, demo frame)
- `--radius-xl`: 40px (CTA bands)

### Spacing
- Container max width: 1240px
- Container padding: `clamp(20px, 4vw, 56px)`
- Section vertical rhythm: 80–140px between major sections

### Easing
- Standard: `cubic-bezier(0.22, 1, 0.36, 1)` — used for hover lifts, reveals, theme transition (0.45s)

## Interactions & Behavior

### Custom cursor (desktop only)
- 8px gradient dot follows mouse exactly
- 38px circular ring lerps toward dot at 0.18 per frame
- Ring grows to 64px and shifts color when hovering interactive elements (`a, button, .btn, .feature-card, .swatch, .theme-toggle`)
- Hidden on `(pointer: coarse)` / mobile

### Scroll reveal
- `.reveal` elements fade up (28px translate, 0.8s) when entering viewport (IntersectionObserver, threshold 0.12)
- Optional `data-delay="1..5"` adds 0.08s × n delay for staggers

### Theme toggle
- Persisted to `localStorage` key `altara-theme`
- Sun/moon icon swaps based on current theme
- 0.45s ease transition on `background` and `color`

### Tweaks panel (optional dev feature; can be removed for production)
- Floats bottom-right; lets user swap accent palette and theme
- Persisted to `localStorage` keys `altara-accent`, `altara-theme`
- In production you'd likely remove this — it's a holdover from the design tool.

### Hover states
- Buttons: `translateY(-2px)`, slight color shift
- Cards: `translateY(-4px)`, border brightens to `--border-strong`
- Server icons: `translateX(3px)`, radius tightens
- Platform buttons: `translateY(-3px)`, border becomes accent

## State Management
- `theme`: 'dark' | 'light' (default 'dark') — persisted
- `accent`: 'red' | 'violet' | 'blue' | 'green' (default 'red') — persisted
- No app-level state beyond UI; this is a marketing site.

## Responsive
- ≤980px: demo collapses to 3 columns (members panel hidden), feature blocks stack
- ≤800px: nav links hide (need a hamburger in production), spec grid → 2 cols, footer → 2 cols
- ≤720px: demo collapses to single chat column, CTA paddings shrink

## Components to Extract (suggested)
For a real implementation, build these shared components:
- `<Nav>` (sticky, theme toggle, CTA)
- `<Footer>` (4-col + wordmark)
- `<Eyebrow>` (pill with dot)
- `<Button variant="primary | secondary | ghost">`
- `<Card>` (used for highlights, specs, team)
- `<FeatureBlock orientation="left | right">` (numbered feature row)
- `<Reveal>` wrapper (IntersectionObserver-based fade-up; in React, use Framer Motion's `whileInView`)
- `<CustomCursor>` (desktop only)
- `<DemoMockup>` (the chat app illustration on home)

## Assets
- `assets/altara-logo.png` — uploaded by user (white logo on transparent)
- All other visuals are pure CSS/SVG — no images required for the chrome.
- Fonts loaded via Google Fonts CDN (no self-hosted files).

## Files in this bundle
- `index.html` — Home page
- `features.html` — Features page
- `about.html` — About page
- `styles.css` — shared design tokens + component styles
- `shared.js` — cursor, theme, accent, reveal, tweaks panel
- `assets/altara-logo.png` — logo asset

## Notes for the developer
- The HTML uses inline `<style>` blocks per page for page-specific styles. Move these into per-page CSS modules or component-scoped styles in your stack.
- The Tweaks panel and its `postMessage` protocol are design-tool plumbing — strip them for production.
- The "Try in browser" CTA currently links to the in-page demo via `#try`. Wire it to the real web app entrypoint.
- Platform download buttons currently link to `#`. Wire them to real artifact URLs.
- Speaker-notes / analytics / SEO / OG meta — none are present, add per your stack's conventions.
