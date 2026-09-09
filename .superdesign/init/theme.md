# Theme — Treeniapp

**Updated 2026-09-09**: this reflects the "Energetic" design direction implemented app-wide after the Koonti/Sali mockup pass (superdesign project `bb8720df-b273-4613-bd6d-26440b81e9e4`) — cyan accent, Tanker+Satoshi fonts, tighter radii. The original iOS-blue palette this file described pre-implementation is gone from the codebase; noted inline below only where historically relevant.

## Part 1 — Compact token summary

**Stack**: no framework. A single `index.html` file with inline `<style>` and inline `<script>`. Vanilla CSS custom properties (no Tailwind, no CSS-in-JS, no component library). Dark-mode only — no light theme, no `prefers-color-scheme` branching.

**Color roles** (`:root`):
| Token | Value | Role |
|---|---|---|
| `--bg` | `#000000` | page background |
| `--surface` | `#121214` | card/tile background (level 1) |
| `--surface2` | `#1c1c21` | level 2 surface (inputs, pills, nested elements) |
| `--surface3` | `#2a2a32` | level 3 surface (hover states, disabled inputs) |
| `--border` | `#2d2d35` | hairline dividers |
| `--text` | `#ffffff` | primary text |
| `--text2` | `rgba(255,255,255,0.7)` | secondary text |
| `--text3` | `rgba(255,255,255,0.4)` | tertiary/label text |
| `--accent` | `#00f2ff` (electric cyan) | interactive/active state (buttons, active tabs, active day/session, links) |
| `--accent-bg` | `rgba(0,242,255,0.12)` | accent tint background (active pills, badges) |
| `--green` | `#2fff7e` | success/done/positive/"better than last time" |
| `--green-bg` | `rgba(47,255,126,0.12)` | green tint background |
| `--red` | `#ff3e3e` | error/negative/"not done yet" |
| `--red-bg` | `rgba(255,62,62,0.12)` | red tint background |
| `--amber` (alias) | `#ffbb00` | warning/PR badge/nudge banner/"worse than last time" |
| `--amber-bg` | `rgba(255,187,0,0.12)` | amber tint background |
| `--blue` (alias) | `#378ADD` | unchanged — rarely used secondary blue for one body-composition chart series (Rasva%), kept distinct from `--accent` on purpose (chart series color, not a UI role) |

**Color-role clarity** (this was the "current-refined" mockup direction's flagged issue — resolved as a side effect of the energetic palette, not by adding a new token): `--accent` (cyan) is now used consistently for interactive/active state; `--green` for positive/better; `--red` for negative/undone; `--amber` for warning/worse. No separate "positive delta" token was needed — the 4-way accent/green/red/amber split already gives each role a distinct color.

**Radii**: `--radius-sm: 8px` (buttons, pills, small inputs) · `--radius-md: 14px` (medium cards, hero-metric tiles) · `--radius-lg: 20px` (`.card`, `.koonti-card`). `.hero-card`/`.food-hero`/`.ex-modal-header` use a hardcoded `20px` (matches `--radius-lg`, consistent).

**Typography**: `'Satoshi', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif` for body text (system font stays as fallback). A separate display font, `'Tanker'` (bold, condensed, uppercase-styled), is applied via a dedicated rule to headline/big-number elements: `.koonti-greeting, .hero-metric-val, .hero-name, .hero-stat-val, .ex-block-title, .set-tnum, .set-tinput`. Both fonts load from Fontshare via a `<link>` tag in `<head>` (`api.fontshare.com`, `tanker@400` + `satoshi@400,500,700,900`). Base body `font-size: 17px`, `letter-spacing: -0.2px`. Still no formal type-scale variable set beyond the Tanker/Satoshi split — every heading/label size remains a one-off inline value per component (unchanged from before; the "tighten the typography scale" refinement was not part of what got implemented — the energetic direction was picked over the current-refined one).

**Icons**: unchanged — a hand-maintained JS object `ICONS` (~18 entries) of raw SVG path strings, rendered via `svgIcon(name, color, size)`, `stroke-width="1.5"`. Icons pick up the new `--accent`/`--green`/etc. automatically wherever they're colored via `data-icon-color="var(--accent)"` etc.

**Transitions**: `--t: .2s cubic-bezier(0.4,0,0.2,1)` (was `.15s ease`).

**Breakpoints**: none — still phone-width only, unchanged, out of scope for this pass.

**Signature gradient**: replaced the old vivid blue 3-stop gradient (`#0d1b4b → #0a2a6e → #0a84ff`) everywhere it appeared (`.hero-card`, `.food-hero`, `.ex-modal-header`) with a quieter dark-navy card (`linear-gradient(165deg, #0a0a0a 0%, #001a2e 100%)`) plus a soft radial cyan glow (`rgba(0,242,255,0.25)`) and a thin cyan border — reads as "dark card with a neon accent" rather than "loud blue gradient fill."

## Part 2 — Raw source

### `:root` (index.html, in `<style>` near the top)
```css
:root {
  --bg:        #000000;
  --surface:   #121214;
  --surface2:  #1c1c21;
  --surface3:  #2a2a32;
  --border:    #2d2d35;

  --text:      #ffffff;
  --text2:     rgba(255,255,255,0.7);
  --text3:     rgba(255,255,255,0.4);

  --accent:    #00f2ff;
  --accent-bg: rgba(0,242,255,0.12);
  --green:     #2fff7e;
  --green-bg:  rgba(47,255,126,0.12);
  --red:       #ff3e3e;
  --red-bg:    rgba(255,62,62,0.12);

  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;

  /* Aliases used in JS-rendered HTML */
  --teal:      var(--accent);
  --blue:      #378ADD;
  --amber:     #ffbb00;
  --amber-bg:  rgba(255,187,0,0.12);
  --border2:   var(--surface3);
  --rs:        var(--radius-sm);
  --t:         .2s cubic-bezier(0.4,0,0.2,1);
}
```

### Base body + display font
```css
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  font-size: 17px;
  letter-spacing: -0.2px;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.koonti-greeting, .hero-metric-val, .hero-name, .hero-stat-val, .ex-block-title, .set-tnum, .set-tinput {
  font-family: 'Tanker', sans-serif;
}
```

### Shared card primitive (unchanged structurally, colors now cascade from new tokens)
```css
.card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 18px;
  margin-bottom: 16px;
}
.card-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 10px;
}
```

### Buttons (unchanged structurally)
```css
.btn {
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--t);
}
.btn-primary { background: var(--accent); color: #fff; width: 100%; margin-top: 6px; border: none; border-radius: var(--radius-md); }
.btn-primary:hover  { opacity: 0.85; }
.btn-primary:active { transform: scale(.98); }
```
