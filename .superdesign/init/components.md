# Components — Treeniapp

No component library, no framework — these are CSS classes + small HTML/JS snippets, hand-rolled and reused by convention across the single `index.html`. "Full source" here means the CSS rule(s) plus a representative HTML usage.

## Icon system

Not SVG files or an icon font — a JS object of raw path data, rendered on demand.

```js
const ICONS = {
  home:      '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>',
  utensils:  '<path d="M18 8V6a2 2 0 00-2-2H8a2 2 0 00-2 2v2"/><path d="M20 8H4a1 1 0 00-1 1v2a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1z"/><path d="M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7"/>',
  dumbbell:  '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/><rect x="1" y="9" width="4" height="6" rx="1"/><rect x="19" y="9" width="4" height="6" rx="1"/><rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/>',
  flame:     '<path d="M12 2c-2 4-6 5-6 10a6 6 0 0012 0c0-2-1-3-2-4 0 2-1 3-2 2 1-3-1-5-2-8z"/>',
  running:   '<circle cx="14" cy="4" r="2"/><path d="M10 22l2-6 3-2-1-5-4 1-2 4M13 8l3 3 4-1M8 13l-3 2 1 5"/>',
  scale:     '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v4l3 2"/>',
  moon:      '<path d="M21 12.5A8.5 8.5 0 1111.5 3 7 7 0 0021 12.5z"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  target:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  watch:     '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M9 3h6l-1 3H10z"/>',
  upload:    '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
  bell:      '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  chat:      '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
  timer:     '<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/>',
  droplet:   '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',
  trending:  '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  table:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
};
function svgIcon(name, color, size) {
  const path = ICONS[name];
  if (!path) return '';
  const c = color || 'currentColor';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
function renderIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    if (!ICONS[name]) return;
    const color = el.dataset.iconColor || 'currentColor';
    el.innerHTML = svgIcon(name, color);
    if (el.dataset.iconBg) {
      el.style.cssText += `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:${el.dataset.iconBg};`;
    }
  });
}
```
Usage pattern: `<span data-icon="dumbbell" data-icon-color="var(--accent)" data-icon-bg="var(--accent-bg)"></span>`, hydrated by `renderIcons()` after any innerHTML write. 18 icons total, all Feather-icons-style outline strokes at `stroke-width:1.5`.

## Card (`.card`)
```css
.card { background: var(--surface); border-radius: var(--radius-lg); padding: 18px; margin-bottom: 16px; }
.card-title { font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
```
```html
<div class="card"><div class="card-title">Tällä viikolla</div>...</div>
```

## Button (`.btn`, `.btn-primary`)
```css
.btn { padding: 10px 20px; border-radius: var(--radius-md); border: none; font-size: 14px; font-weight: 500; cursor: pointer; transition: all var(--t); }
.btn-primary { background: var(--accent); color: #fff; width: 100%; margin-top: 6px; border: none; border-radius: var(--radius-md); }
.btn-primary:hover  { opacity: 0.85; }
.btn-primary:active { transform: scale(.98); }
```

## Tab bar (`.stab-bar` / `.stab`) — generic segmented-control pattern, used for Sali's Treeni/Kehitys toggle, Tilastot's Kortit/Taulukko toggle, and others
```css
.stab-bar { display: flex; gap: 6px; margin-bottom: 14px; }
.stab {
  flex: 1; padding: 8px; background: var(--surface2); border: none; border-radius: var(--radius-sm);
  color: var(--text2); font-size: 13px; font-weight: 500; cursor: pointer; transition: all var(--t);
}
.stab.active { background: var(--accent-bg); color: var(--accent); }
```
```html
<div class="stab-bar">
  <button class="stab active" onclick="showSaliTab('treeni',this)">Treeni</button>
  <button class="stab" onclick="showSaliTab('kehitys',this)">Kehitys</button>
</div>
```

## State pill (`.state-pill`) — small status badge (done/active), used inline in hero/session cards
```css
.state-pill { display:inline-block; font-size:11px; font-weight:600; padding:3px 10px; border-radius:20px; margin-top:6px; }
.state-pill.active { background:var(--accent-bg); color:var(--accent); }
.state-pill.done   { background:var(--green-bg);  color:var(--green); }
```

## Stat tile (`.hero-metric`) — small 1/3-width tile with icon+value+label, used on Koonti (5 rows of these) and used to appear on Sali (removed 2026-09-09 as a density fix — Koonti is now the only consumer)
```css
.hero-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 0 12px 10px; } /* exact grid rule at index.html:202, columns inferred from 3-per-row usage */
.hero-metric { background: var(--surface); border-radius: var(--radius-md); padding: 14px; }
.hero-metric-icon  { font-size: 20px; margin-bottom: 4px; }
.hero-metric-val   { font-size: 20px; font-weight: 700; line-height: 1; }
.hero-metric-label { font-size: 10px; color: var(--text3); margin-top: 2px; }
.hero-metric-bar-track { height: 4px; background: var(--surface2); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.hero-metric-bar-fill  { height: 100%; border-radius: 2px; background: var(--accent); transition: width .3s ease; }
.hero-metric--clickable { cursor: pointer; }
```
```html
<div class="hero-metric hero-metric--clickable" onclick="openStreakModal()">
  <div class="hero-metric-icon" data-icon="flame" data-icon-color="var(--amber)" data-icon-bg="var(--amber-bg)"></div>
  <div class="hero-metric-val" id="koonti-ms-streak">—</div>
  <div class="hero-metric-label">streak</div>
</div>
```

## Koonti dashboard card (`.koonti-card`) — 2-column grid tile linking to a page/modal
```css
.koonti-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 12px 10px; }
.koonti-cards--wide { grid-template-columns: 1fr; }
.koonti-card {
  background: var(--surface); border-radius: var(--radius-lg); padding: 18px;
  cursor: pointer; transition: transform var(--t); position: relative;
}
.koonti-card:active { transform: scale(.98); }
.koonti-card-icon  { font-size: 24px; margin-bottom: 8px; display: block; }
.koonti-card-label { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.koonti-card-sub   { font-size: 12px; color: var(--text3); }
.koonti-card--done { background: var(--green-bg); border: 1px solid rgba(48,209,88,0.3); }
.koonti-card--done .koonti-card-sub { color: var(--green); }
.koonti-card--done::after { content: "✓"; position: absolute; top: 12px; right: 14px; color: var(--green); font-weight: 700; font-size: 13px; }
.koonti-card--inprogress { background: var(--accent-bg); border: 1px solid rgba(10,132,255,0.35); }
.koonti-card--inprogress .koonti-card-sub { color: var(--accent); }
.koonti-card--inprogress::after { content: "●"; position: absolute; top: 16px; right: 16px; color: var(--accent); font-size: 8px; }
.koonti-card-goal  { font-size: 11px; color: var(--accent); margin-top: 2px; }
.koonti-progress-track { height:5px; background:var(--surface2); border-radius:3px; margin-top:8px; overflow:hidden; }
.koonti-progress-fill { height:100%; border-radius:3px; background:var(--accent); transition:width .3s ease; }
.koonti-card--done .koonti-progress-fill { background:var(--green); }
.koonti-progress-fill.over { background:var(--red); }
.koonti-progress-fill.good { background:var(--green); }
.koonti-progress-fill.low  { background:var(--amber); }
```

## Set-logging row (`.set-table-row`) — the core input widget of Sali's exercise cards: set number, kg input, reps input, previous-value readout
```css
.ex-set-table { background: var(--surface); border-radius: 0 0 16px 16px; overflow: hidden; }
.set-table-hdr {
  display: grid; grid-template-columns: 34px 1fr 1fr 60px; padding: 7px 14px;
  border-bottom: 1px solid var(--border); background: var(--surface2);
}
.set-table-hdr span { font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .06em; }
.set-table-hdr span:last-child { text-align: right; }
.set-table-row {
  display: grid; grid-template-columns: 34px 1fr 1fr 60px; padding: 10px 14px;
  border-bottom: 1px solid var(--border); align-items: center; transition: background .2s;
}
.set-table-row:last-child { border-bottom: none; }
.set-table-row.s-undone { background: rgba(255,69,58,0.06); }
.set-table-row.s-worse  { background: rgba(255,159,10,0.08); }
.set-table-row.s-same   { background: rgba(10,132,255,0.08); }
.set-table-row.s-better { background: rgba(48,209,88,0.06); }
.set-tnum { font-size:13px; font-weight:700; white-space:nowrap; }
.set-table-row.s-undone .set-tnum { color: var(--red); }
.set-table-row.s-worse  .set-tnum { color: #ff9f0a; }
.set-table-row.s-same   .set-tnum { color: var(--accent); }
.set-table-row.s-better .set-tnum { color: var(--green); }
.set-check { color: var(--green); font-size: 11px; margin-left: 2px; }
.set-tinput {
  width: 58px; height: 36px; padding: 0 6px; font-size: 17px; font-weight: 600;
  background: var(--surface3); border: 1.5px solid transparent; border-radius: 8px;
  color: var(--text); text-align: center; outline: none; transition: border-color var(--t);
}
.set-tinput:focus    { border-color: var(--accent); }
.set-tinput:disabled { opacity: 0.35; }
.set-tprev { font-size: 11px; color: var(--text3); text-align: right; letter-spacing: -0.1px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.set-1rm { font-size: 10px; color: var(--amber); font-weight: 600; display: none; }
.set-1rm.visible { display: block; }
```
```html
<div class="ex-set-table">
  <div class="set-table-hdr"><span>S</span><span>KG</span><span>TOISTOT</span><span>EDELL.</span></div>
  <div class="set-table-row s-same" id="set-0-1-2-0">
    <span class="set-tnum">1<span class="set-check">✓</span></span>
    <input class="set-tinput" type="text" inputmode="decimal" placeholder="kg" value="80">
    <input class="set-tinput" type="text" inputmode="numeric" placeholder="tr" value="8">
    <span class="set-tprev"><span>● 80×8</span><span class="set-1rm visible">1RM ~100kg</span></span>
  </div>
</div>
```

## Session-type pill row (`.sess-picker` / `.sess-btn`) — horizontal choice buttons for Sali's "Päivän tyyppi"
```css
.sess-picker { display:flex; gap:5px; flex-wrap:wrap; }
.sess-btn { font-size:11px; font-weight:400; padding:7px 3px; flex:1; min-width:64px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text2); cursor:pointer; white-space:normal; }
.sess-btn.active { background:var(--accent-bg); border-color:var(--accent); color:var(--accent); font-weight:600; }
```
