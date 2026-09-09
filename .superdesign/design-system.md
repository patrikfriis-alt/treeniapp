# Treeniapp — Design System

## Product context
Treeniapp ("Valkku") is a phone-first Finnish PWA for personal fitness tracking: gym workout logging with per-set progression tracking, cardio/activity logging, body-metrics + weight-loss forecasting, sleep, food/nutrition logging with a Fineli-backed database, and an AI coach chat. Single user (not multi-tenant), real production data. Built as one `index.html` file — no framework, no build step, vanilla CSS custom properties.

Key pages/architecture: bottom-nav (Koonti dashboard / Ruoka / Valikko-sidebar) is the primary navigation; most other pages (Sali, Aerobia, Keho, Uni, Ohjelma, Valmentaja, Näkemykset, Tilastot) are reached via Koonti's dashboard cards or the sidebar. See `.superdesign/init/routes.md` for the full page list.

JTBD: the user opens the app almost daily to (a) log a gym workout set-by-set while at the gym, and (b) glance at a dashboard of today's/this-week's activity, sleep, and nutrition status. Both flows need to be fast and thumb-friendly — this is not a leisurely-browsing app.

## Branding & styling
Full compact token summary + raw source in `.superdesign/init/theme.md` — the canonical reference, always pass alongside this file. Summary (**updated 2026-09-09** — reflects the implemented "Energetic" direction, not the original iOS-blue look):

- **Style**: bold, athletic dark aesthetic — near-black surfaces, electric cyan accent, condensed display font for headlines/numbers. Evolved from a pure-black iOS-native look (still dark-only, no light mode) into a more "dedicated fitness brand" identity via a superdesign mockup pass (project `bb8720df-b273-4613-bd6d-26440b81e9e4`, drafts reviewed on canvas, user picked "Energetic").
- **Fonts**: `'Satoshi'` (body) + `'Tanker'` (display — headlines, big numbers, exercise titles, set inputs), loaded from Fontshare. System font stack remains the fallback.
- **Color roles**: `--bg` #000000 (page bg) · `--surface`/`--surface2`/`--surface3` (3-level dark-gray card/input backgrounds, #121214/#1c1c21/#2a2a32) · `--text`/`--text2`/`--text3` (white/70%-white/40%-white text hierarchy) · `--accent` #00f2ff (electric cyan, interactive/active state only) · `--green` #2fff7e (success/positive/better) · `--red` #ff3e3e (error/negative/undone) · `--amber` #ffbb00 (warning/PR/worse).
- **Radii**: 8px (sm) / 14px (md) / 20px (lg).
- **Signature visual motif**: one recurring treatment — a dark navy-to-black card (`linear-gradient(165deg, #0a0a0a 0%, #001a2e 100%)`) with a soft radial cyan glow and a thin cyan border — used on the app's "hero" elements (Sali's session hero, Ruoka's food hero, the exercise-history modal header). Exercise-block headers simplified to a flat surface + border (dropped their own gradient).
- **Icons**: unchanged — hand-drawn inline SVG outline icons (Feather-style, stroke-width 1.5), ~18 total, see `components.md`. Not from an icon library/font; automatically pick up the new accent color via `data-icon-color="var(--accent)"`.
- **Spacing/density**: cards use 12-18px padding, ~10-16px gaps/margins between stacked elements. Sali and Tilastot were trimmed for density (2026-09-09) — duplicate/redundant blocks removed. The app is generally information-dense by nature (fitness data), not sparse.

## Motion/animation patterns
Minimal — a single shared transition token `--t: .15s ease` used for hover/active states (button press scale, background color fades). No page-transition animations, no skeleton-loading shimmer beyond plain gray placeholder blocks (`.skel-sub`). Nothing elaborate; keep any redesign's motion equally restrained unless a direction explicitly wants more "energy."

## Specific project requirements for this mockup pass
- **Dark mode only** — do not introduce a light theme.
- **Phone-width only** — no responsive/tablet breakpoints exist or are in scope for this pass.
- **Finnish UI text** — all labels/copy in the app are Finnish (e.g. "Viikko", "Treeni", "Askeleet"). Mockups should keep Finnish labels to stay realistic, not translate to English.
- **The set-logging color-tint system is functional, not decorative** — row background tints (red/amber/blue/green) on Sali's set-input rows encode a real comparison-to-last-time signal. Any redesign must preserve 4 visually distinct, legible states here, not flatten them into one style.
