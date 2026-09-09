# Layouts — Treeniapp

No framework layout system — everything below is inline HTML in the single `index.html`, always present in the DOM (pages are `display:none`/`.active`-toggled `<div>`s, not separately mounted routes). These are the elements that appear on every page.

## Bottom nav (`<nav>`) — index.html lines 1064-1077, CSS lines 67-106

3 items: Koonti (home), Ruoka (utensils), and a "Valikko" button that opens the sidebar (not a page — `toggleSidebar()`).

```html
<nav>
  <button id="nav-koonti" class="active" onclick="showPage('koonti',this)">
    <span class="nav-icon" data-icon="home"></span>
    <span>Koonti</span>
  </button>
  <button id="nav-ruoka" onclick="showPage('ruoka',this)">
    <span class="nav-icon" data-icon="utensils"></span>
    <span>Ruoka</span>
  </button>
  <button onclick="toggleSidebar()">
    <span class="nav-icon">≡</span>
    <span>Valikko</span>
  </button>
</nav>
```
```css
nav {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
  background: rgba(20,20,22,0.78);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid rgba(255,255,255,0.08);
  display: flex; padding: 6px 8px 10px; gap: 4px;
}
nav button {
  flex: 1; padding: 7px 4px 6px; background: none; border: none; border-top: none;
  border-radius: 20px; color: var(--text2); font-size: 11px; font-weight: 500;
  letter-spacing: .02em; cursor: pointer; white-space: nowrap; transition: all var(--t);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.nav-icon { font-size: 22px; line-height: 1; }
nav button.active { color: #fff; background: var(--accent); }
nav button:not(.active):hover { color: var(--text); background: var(--surface2); }
```

## Sidebar (`#sidebar` + `#sidebar-overlay`) — index.html lines 1530-1586

Slide-out drawer, opened by the nav's "Valikko" button. Redesigned 2026-09-09 into four labeled sections (`Navigointi` / `Tavoitteet` / `Muu` / `Vie data`) — see `.hero-metric`-style section-label divs (`font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em`). Not directly relevant to the Koonti/Sali mockup targets but shares the same button-row pattern (icon + label, full-width, no border) used throughout.

## Sub-page header (`.page-header`) — used on most non-Koonti pages

Every page except Koonti/Ruoka/Sali (which have their own bespoke headers) uses:
```html
<div class="page-header">
  <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
  <span class="page-title">Sali</span>
</div>
```
Sali specifically uses this pattern (index.html:1202-1205). Koonti has its own scroll-triggered sticky navbar instead (`.koonti-navbar`, opacity-faded in on scroll, not a static header).

## Page-switching mechanism (no router)

`showPage(name, navBtn)` toggles `.active` on `#page-<name>` divs and updates the bottom-nav active state. There is no URL-based routing — all "pages" are DOM siblings, always present, shown/hidden via CSS class. See `routes.md` for the full page list.
