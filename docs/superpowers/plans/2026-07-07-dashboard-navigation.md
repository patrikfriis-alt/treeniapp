# Koontisivu ja navigaation uudelleenjärjestely — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 4-tab bottom nav (Treeni/Seuranta/Ruoka/Valikko) with a 3-tab nav (Koonti/Ruoka/Valikko), where Koonti is a new dashboard whose cards open Sali, Aerobia, Keho and Uni as their own full pages (previously buried inside the "Seuranta" tab-bar), and where the exercise/run progress charts move out of the standalone "Historia" page into the Sali and Aerobia pages themselves.

**Architecture:** Single-file static app (`index.html`, vanilla JS + Supabase JS client, no build step, no test framework). All changes are additive HTML/CSS blocks plus surgical edits to the existing `showPage()` router and a few data-loading functions. No new Supabase tables or columns — every new piece of UI reads from tables that already exist (`workout_sessions`, `activity_data`, `body_metrics`, `sleep_data`, `food_log_entries`).

**Tech Stack:** HTML/CSS/vanilla JS, Supabase JS client v2, Chart.js. No test runner — verification is manual, in a browser, using a local static server.

**Reference:** Design spec at `docs/superpowers/specs/2026-07-07-dashboard-navigation-design.md`. This plan refines two details found while reading the real code (see Task 7 note) — the design's "streak/mittarit" section is implemented by reusing two functions that already compute exactly this data (`loadWeekSummary()`, `loadMotivationSummary()`), instead of writing new queries.

**How to manually test any task:** from the project root, run `python3 -m http.server 8080`, open `http://localhost:8080/index.html` in a browser, open the browser console (check for red errors after every interaction).

---

### Task 1: Koonti CSS foundations (additive, no visual change yet)

**Files:**
- Modify: `index.html` (inside the `<style>` block, right after the `.hero-metric-label` rule)

- [ ] **Step 1: Add the new CSS block**

In `index.html`, find this exact existing block (around line 214–224):

```css
/* ─── Hero metrics (streak/sali/uni) ────────────────────────── */
.hero-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin: 0 12px 10px;
}
.hero-metric { background:var(--surface); border-radius:14px; padding:12px; }
.hero-metric-icon  { font-size:20px; margin-bottom:4px; }
.hero-metric-val   { font-size:20px; font-weight:700; line-height:1; }
.hero-metric-label { font-size:10px; color:var(--text3); margin-top:2px; }
```

Insert this new block immediately after it (before the `/* ─── Sessiotyypin valitsin ... */` comment):

```css
/* ─── Koonti (dashboard) ─────────────────────────────────────── */
.page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 14px;
}
.back-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 26px;
  line-height: 1;
  padding: 0 4px 0 0;
  cursor: pointer;
}
.page-title { font-size: 20px; font-weight: 700; }

.koonti-greeting { font-size: 22px; font-weight: 700; margin: 4px 12px 2px; }
.koonti-date      { font-size: 13px; color: var(--text2); margin: 0 12px 14px; }
.koonti-section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text3);
  margin: 18px 12px 8px;
}
.koonti-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0 12px;
}
.koonti-cards--wide { grid-template-columns: 1fr; }
.koonti-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: transform var(--t);
}
.koonti-card:active { transform: scale(.98); }
.koonti-card-icon  { font-size: 24px; margin-bottom: 8px; display: block; }
.koonti-card-label { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.koonti-card-sub   { font-size: 12px; color: var(--text3); }
.koonti-card--done .koonti-card-sub { color: var(--green); }
.koonti-card--ruoka { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 2: Manual test**

Open the app locally. It should look and behave exactly as before (this step only adds unused CSS rules — nothing references these classes yet). Confirm no console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: lisää Koonti-sivun ja page-headerin CSS"
```

---

### Task 2: Bottom nav → 3 buttons + Koonti page skeleton (static content)

**Files:**
- Modify: `index.html:686-703` (nav block)
- Modify: `index.html:711-722` (insert new `page-koonti` div before `page-treeni`)

- [ ] **Step 1: Replace the nav block**

Find this exact block:

```html
<nav>
  <button class="active" onclick="showPage('treeni',this)">
    <span class="nav-icon">🏋️</span>
    <span>Treeni</span>
  </button>
  <button onclick="showPage('seuranta',this)">
    <span class="nav-icon">📊</span>
    <span>Seuranta</span>
  </button>
  <button onclick="showPage('ruoka',this)">
    <span class="nav-icon">🍽️</span>
    <span>Ruoka</span>
  </button>
  <button id="hamburger-btn" onclick="toggleSidebar()">
    <span class="nav-icon">≡</span>
    <span>Valikko</span>
  </button>
</nav>
```

Replace it with:

```html
<nav>
  <button id="nav-koonti" class="active" onclick="showPage('koonti',this)">
    <span class="nav-icon">🏠</span>
    <span>Koonti</span>
  </button>
  <button id="nav-ruoka" onclick="showPage('ruoka',this)">
    <span class="nav-icon">🍽️</span>
    <span>Ruoka</span>
  </button>
  <button id="hamburger-btn" onclick="toggleSidebar()">
    <span class="nav-icon">≡</span>
    <span>Valikko</span>
  </button>
</nav>
```

- [ ] **Step 2: Insert the Koonti page and remove `active` from Treeni**

Find:

```html
<!-- ── TREENI ─────────────────────────────────────────────────── -->
<div id="page-treeni" class="page active">
```

Replace with (Koonti page inserted before it, Treeni page loses `active`):

```html
<!-- ── KOONTI ─────────────────────────────────────────────────── -->
<div id="page-koonti" class="page active">
  <div class="koonti-greeting">Hei! 👋</div>
  <div class="koonti-date" id="koonti-date"></div>

  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon">🔥</div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏋️</div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏃</div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>

  <div class="koonti-section-label">Tänään</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-sali" onclick="showPage('sali', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">🏋️</span>
      <div class="koonti-card-label">Sali</div>
      <div class="koonti-card-sub" id="kc-sali-sub">Ladataan…</div>
    </div>
    <div class="koonti-card" id="kc-aerobia" onclick="showPage('aerobia', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">🏃</span>
      <div class="koonti-card-label">Aerobinen</div>
      <div class="koonti-card-sub" id="kc-aerobia-sub">Ladataan…</div>
    </div>
  </div>

  <div class="koonti-section-label">Mittarit</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-keho" onclick="showPage('keho', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">⚖️</span>
      <div class="koonti-card-label">Keho</div>
      <div class="koonti-card-sub" id="kc-keho-sub">Ladataan…</div>
    </div>
    <div class="koonti-card" id="kc-uni" onclick="showPage('uni', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">😴</span>
      <div class="koonti-card-label">Uni</div>
      <div class="koonti-card-sub" id="kc-uni-sub">Ladataan…</div>
    </div>
  </div>

  <div class="koonti-cards koonti-cards--wide">
    <div class="koonti-card koonti-card--ruoka" id="kc-ruoka" onclick="showPage('ruoka', document.getElementById('nav-ruoka'))">
      <div>
        <div class="koonti-card-label">🍽️ Ruokailu</div>
        <div class="koonti-card-sub" id="kc-ruoka-sub">Ladataan…</div>
      </div>
      <div style="font-size:20px;color:var(--text3)">›</div>
    </div>
  </div>
</div>

<!-- ── TREENI ─────────────────────────────────────────────────── -->
<div id="page-treeni" class="page">
```

- [ ] **Step 3: Add a temporary stub `loadKoonti()` and wire it into `showPage`**

Find (`showPage`, around line 3054):

```js
function showPage(name, btn) {
  document.body.style.overflow = '';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'seuranta')  showSeuranta(seurantaPage);
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
  if (name === 'ohjelma')   renderOhjelma();
  if (name === 'ruoka')     renderRuoka();
}
```

Replace with:

```js
function showPage(name, btn) {
  document.body.style.overflow = '';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'koonti')    loadKoonti();
  if (name === 'seuranta')  showSeuranta(seurantaPage);
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
  if (name === 'ohjelma')   renderOhjelma();
  if (name === 'ruoka')     renderRuoka();
}

function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });
}
```

(This stub only sets the date for now — full data loading is Task 7. `showPage('treeni', ...)` still works exactly as before via the old Treeni nav button removal notwithstanding — it's simply unreachable from the nav until Task 3 turns cards into working links.)

- [ ] **Step 4: Change the INIT block to boot on Koonti instead of Treeni**

Find (around line 3160):

```js
migrateLD_v2();
migrateLD_v3();
renderTreeni();
```

Replace with:

```js
migrateLD_v2();
migrateLD_v3();
loadKoonti();
```

- [ ] **Step 5: Manual test**

Open the app. It should boot directly on the new Koonti page: greeting, date, streak row showing "—" placeholders, five cards showing "Ladataan…". Bottom nav shows 3 buttons (Koonti active/highlighted, Ruoka, Valikko). Clicking the Sali or Aerobia or Keho or Uni or Ruokailu card does nothing yet (pages `page-sali`/`page-aerobia`/`page-keho`/`page-uni` don't exist yet — expect a console error `Cannot read properties of null` when clicked; that's expected at this point, don't worry about it). Clicking "Ruoka" in the bottom nav still works and shows the food page. Confirm no console errors on initial load (only on clicking not-yet-built cards).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: lisää Koonti-etusivu, alapalkki supistuu kolmeen kohtaan"
```

---

### Task 3: Rename Treeni page to Sali page, add back-button header

**Files:**
- Modify: `index.html:711-721` (rename `page-treeni` → `page-sali`, add page-header)

- [ ] **Step 1: Rename the div and add the header**

Find:

```html
<!-- ── TREENI ─────────────────────────────────────────────────── -->
<div id="page-treeni" class="page">
  <div id="hero-section"></div>
  <div class="week-nav">
    <button class="week-btn" onclick="changeWeek(-1)">←</button>
    <span class="week-label" id="week-label"></span>
    <button class="week-btn" onclick="changeWeek(1)">→</button>
  </div>
  <div class="day-tabs" id="day-tabs"></div>
  <div id="session-content"></div>
</div>
```

Replace with:

```html
<!-- ── SALI ───────────────────────────────────────────────────── -->
<div id="page-sali" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Sali</span>
  </div>
  <div id="hero-section"></div>
  <div class="week-nav">
    <button class="week-btn" onclick="changeWeek(-1)">←</button>
    <span class="week-label" id="week-label"></span>
    <button class="week-btn" onclick="changeWeek(1)">→</button>
  </div>
  <div class="day-tabs" id="day-tabs"></div>
  <div id="session-content"></div>
</div>
```

- [ ] **Step 2: Wire the Sali card and add a `showPage` branch for it**

Find (in `showPage`, added in Task 2):

```js
  if (name === 'koonti')    loadKoonti();
  if (name === 'seuranta')  showSeuranta(seurantaPage);
```

Replace with:

```js
  if (name === 'koonti')    loadKoonti();
  if (name === 'sali')      renderTreeni();
  if (name === 'seuranta')  showSeuranta(seurantaPage);
```

(No change needed to the Koonti card's `onclick="showPage('sali', ...)"` — it was already written that way in Task 2.)

- [ ] **Step 3: Manual test**

Open the app. Click the "Sali" card on Koonti — it should open the familiar hero/week/day-tabs/session view (identical content to the old Treeni page), now with a "‹ Koonti" back button at the top. Click it — you should land back on Koonti. Try logging a set, marking a day done, changing week — all should work exactly as before. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor: page-treeni -> page-sali, lisää paluunuoli Koontiin"
```

---

### Task 4: Extract Aerobia page from `seuranta-aktiviteetti`

**Files:**
- Modify: `index.html:758-798` (move `seuranta-aktiviteetti` content out into new `page-aerobia`, insert after `page-sali`'s closing `</div>`)

- [ ] **Step 1: Insert the new `page-aerobia` div**

Find the closing of `page-sali` (the exact block from Task 3's Step 1 result — its final `</div>` right before the `<!-- ── SEURANTA ── -->` comment), i.e.:

```html
  <div id="session-content"></div>
</div>

<!-- ── SEURANTA ────────────────────────────────────────────────── -->
<div id="page-seuranta" class="page">
```

Replace with (new `page-aerobia` inserted between them; `page-seuranta` untouched for now):

```html
  <div id="session-content"></div>
</div>

<!-- ── AEROBIA ────────────────────────────────────────────────── -->
<div id="page-aerobia" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Aerobia</span>
  </div>

  <div class="stab-bar">
    <button id="aerobia-tab-treeni" class="stab active" onclick="showAerobiaTab('treeni',this)">Aktiviteetti</button>
    <button id="aerobia-tab-kehitys" class="stab" onclick="showAerobiaTab('kehitys',this)">Kehitys</button>
  </div>

  <div id="aerobia-treeni">
    <div class="seuranta-hero seuranta-hero--akt">
      <div class="seuranta-hero-glow" style="background:radial-gradient(circle,rgba(255,107,0,0.5) 0%,transparent 70%)"></div>
      <div class="seuranta-hero-label">VIIMEISIN · AKTIVITEETTI</div>
      <div class="seuranta-hero-main" id="hero-act-type">—</div>
      <div class="seuranta-hero-sub" id="hero-act-sub"></div>
      <div class="seuranta-hero-stats">
        <div><div class="seuranta-hero-stat-val" id="hero-act-dur">—</div><div class="seuranta-hero-stat-label">min</div></div>
        <div class="seuranta-hero-divider"></div>
        <div><div class="seuranta-hero-stat-val" id="hero-act-cal">—</div><div class="seuranta-hero-stat-label">kcal</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Kirjaa aktiviteetti</div>
      <div class="form-row"><label>Päivämäärä</label><input type="date" id="act-date"></div>
      <div class="form-row">
        <label>Laji</label>
        <select id="act-type" onchange="toggleKmField()">
          <option>Jääkiekko</option><option>Juoksu</option>
          <option>Kävely</option><option>Sali</option><option>Muu</option>
        </select>
      </div>
      <div class="form-row"><label>Kesto (min)</label><input type="text" inputmode="numeric" id="act-duration" placeholder="60" oninput="calcPace()"></div>
      <div class="form-row"><label>Kalorit</label><input type="text" inputmode="numeric" id="act-calories" placeholder="450"></div>
      <div class="form-row"><label>Syke (avg)</label><input type="text" inputmode="numeric" id="act-hr" placeholder="145"></div>
      <div class="form-row" id="km-row" style="display:none">
        <label>Matka (km)</label>
        <input type="text" inputmode="decimal" id="act-km" placeholder="5,2" oninput="calcPace()">
      </div>
      <div class="form-row" id="pace-row" style="display:none">
        <label>Vauhti</label>
        <div id="pace-display" style="flex:1; font-size:14px; color:var(--teal); padding: 8px 0;">—</div>
      </div>
      <button class="btn btn-primary" onclick="saveActivity()">Tallenna</button>
      <div class="status" id="act-status"></div>
    </div>
    <div class="card">
      <div class="card-title">Viimeiset</div>
      <div id="act-history"><div style="color:var(--text3);font-size:13px">Ladataan...</div></div>
    </div>
  </div>

  <div id="aerobia-kehitys" style="display:none">
    <div class="card">
      <div class="card-title">Juoksun kehitys</div>
      <div class="form-row">
        <label>Näytä</label>
        <select id="run-chart-type" onchange="loadRunChart()">
          <option value="distance">Matka (km)</option>
          <option value="pace">Vauhti (min/km)</option>
        </select>
      </div>
      <div class="chart-wrap" id="run-chart-wrap" style="margin-top:12px">
        <canvas id="run-chart"></canvas>
      </div>
      <div id="run-chart-status" style="color:var(--text3);font-size:13px;text-align:center;padding:6px"></div>
    </div>
  </div>
</div>

<!-- ── SEURANTA ────────────────────────────────────────────────── -->
<div id="page-seuranta" class="page">
```

**Note on duplicate ids:** the `page-historia` page (still present at this point, deleted in Task 6) has its own "Juoksun kehitys" card with the exact same ids (`run-chart-type`, `run-chart-wrap`, `run-chart`, `run-chart-status`). Between this task and Task 6, those ids exist twice in the DOM — `document.getElementById` resolves to whichever copy is first in document order, which is this new `page-aerobia` one (it comes before `page-historia` in the file), so Aerobia's chart works correctly. Historia's own copy of that same chart will silently stop working during this window — expected and harmless, since Task 6 deletes `page-historia` entirely. Don't spend time debugging Historia's run chart if you happen to check it between Task 4 and Task 6.

- [ ] **Step 2: Remove the now-duplicated `seuranta-aktiviteetti` block from `page-seuranta`**

Find (inside `page-seuranta`, the block that was just duplicated above):

```html
  <div id="seuranta-aktiviteetti" style="display:none">
    <div class="seuranta-hero seuranta-hero--akt">
      <div class="seuranta-hero-glow" style="background:radial-gradient(circle,rgba(255,107,0,0.5) 0%,transparent 70%)"></div>
      <div class="seuranta-hero-label">VIIMEISIN · AKTIVITEETTI</div>
      <div class="seuranta-hero-main" id="hero-act-type">—</div>
      <div class="seuranta-hero-sub" id="hero-act-sub"></div>
      <div class="seuranta-hero-stats">
        <div><div class="seuranta-hero-stat-val" id="hero-act-dur">—</div><div class="seuranta-hero-stat-label">min</div></div>
        <div class="seuranta-hero-divider"></div>
        <div><div class="seuranta-hero-stat-val" id="hero-act-cal">—</div><div class="seuranta-hero-stat-label">kcal</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Kirjaa aktiviteetti</div>
      <div class="form-row"><label>Päivämäärä</label><input type="date" id="act-date"></div>
      <div class="form-row">
        <label>Laji</label>
        <select id="act-type" onchange="toggleKmField()">
          <option>Jääkiekko</option><option>Juoksu</option>
          <option>Kävely</option><option>Sali</option><option>Muu</option>
        </select>
      </div>
      <div class="form-row"><label>Kesto (min)</label><input type="text" inputmode="numeric" id="act-duration" placeholder="60" oninput="calcPace()"></div>
      <div class="form-row"><label>Kalorit</label><input type="text" inputmode="numeric" id="act-calories" placeholder="450"></div>
      <div class="form-row"><label>Syke (avg)</label><input type="text" inputmode="numeric" id="act-hr" placeholder="145"></div>
      <div class="form-row" id="km-row" style="display:none">
        <label>Matka (km)</label>
        <input type="text" inputmode="decimal" id="act-km" placeholder="5,2" oninput="calcPace()">
      </div>
      <div class="form-row" id="pace-row" style="display:none">
        <label>Vauhti</label>
        <div id="pace-display" style="flex:1; font-size:14px; color:var(--teal); padding: 8px 0;">—</div>
      </div>
      <button class="btn btn-primary" onclick="saveActivity()">Tallenna</button>
      <div class="status" id="act-status"></div>
    </div>
    <div class="card">
      <div class="card-title">Viimeiset</div>
      <div id="act-history"><div style="color:var(--text3);font-size:13px">Ladataan...</div></div>
    </div>
  </div>
```

Delete it entirely (this leaves `page-seuranta` with only `seuranta-keho` and `seuranta-uni` remaining — that's expected, they're extracted in Task 5).

Also find, inside `page-seuranta`'s `stab-bar`:

```html
    <button id="stab-aktiviteetti" class="stab" onclick="showSeuranta('aktiviteetti')">Aktiviteetti</button>
```

Delete this line too (Aerobia is no longer reachable via the old Seuranta tab-bar).

- [ ] **Step 3: Add the `showAerobiaTab` function and wire `showPage`**

Find (added in Task 3):

```js
  if (name === 'sali')      renderTreeni();
```

Replace with:

```js
  if (name === 'sali')      renderTreeni();
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); }
```

Find `showHistTab` (still exists, untouched so far):

```js
function showHistTab(tab, btn) {
```

Insert this new function immediately **before** it:

```js
function showAerobiaTab(tab, btn) {
  document.getElementById('aerobia-treeni').style.display  = tab === 'treeni'  ? '' : 'none';
  document.getElementById('aerobia-kehitys').style.display = tab === 'kehitys' ? '' : 'none';
  ['aerobia-tab-treeni','aerobia-tab-kehitys'].forEach(id => document.getElementById(id).classList.remove('active'));
  btn.classList.add('active');
}

```

- [ ] **Step 4: Manual test**

Open the app. Click the "Aerobia" card on Koonti — it should open a page with "‹ Koonti" header, an "Aktiviteetti"/"Kehitys" stab-bar (Aktiviteetti active by default), the hero showing the latest logged activity, the log form, and "Viimeiset" list — all working exactly as the old Seuranta → Aktiviteetti tab did. Click "Kehitys" — should show the "Juoksun kehitys" chart card with working distance/pace toggle. Log a new activity and confirm it saves and the "Viimeiset" list updates. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: erota Aerobia omaksi sivukseen, juoksun kehitys mukana"
```

---

### Task 5: Extract Keho and Uni pages from `page-seuranta`

**Files:**
- Modify: `index.html` (move `seuranta-keho` and `seuranta-uni` out of `page-seuranta` into new `page-keho`/`page-uni`, then delete the now-empty `page-seuranta` and its supporting JS)

- [ ] **Step 1: Insert `page-keho` and `page-uni` after `page-aerobia`**

Find the closing of `page-aerobia` followed by the (now nearly-empty) `page-seuranta` opening:

```html
</div>

<!-- ── SEURANTA ────────────────────────────────────────────────── -->
<div id="page-seuranta" class="page">
  <div class="stab-bar">
    <button id="stab-keho" class="stab active" onclick="showSeuranta('keho')">Keho</button>
    <button id="stab-uni" class="stab" onclick="showSeuranta('uni')">Uni</button>
  </div>

  <div id="seuranta-keho">
```

Replace with (new `page-keho`/`page-uni` inserted, `page-seuranta`'s wrapper and stab-bar removed, `seuranta-keho`'s inner content stays where it is for now — just re-parented one level up):

```html
</div>

<!-- ── KEHO ───────────────────────────────────────────────────── -->
<div id="page-keho" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Keho</span>
  </div>
```

- [ ] **Step 2: Find and update the end of the (former) `seuranta-keho` block and the start of `seuranta-uni`**

Find:

```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
  </div>

  <div id="seuranta-aktiviteetti" style="display:none">
```

If Task 4 already ran, this exact `seuranta-aktiviteetti` block no longer exists at this location (it was deleted in Task 4, Step 2) — so what actually follows the Keho chart card is now `seuranta-uni`. Find:

```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
  </div>

  <div id="seuranta-uni">
```

Replace with (closes `page-keho`, opens `page-uni`):

```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
  </div>
</div>

<!-- ── UNI ────────────────────────────────────────────────────── -->
<div id="page-uni" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Uni</span>
  </div>
```

- [ ] **Step 3: Remove the now-orphaned closing tag that used to close `page-seuranta`**

Step 1 merged two opening tags (`page-seuranta` and `seuranta-keho`) into one (`page-keho`). That means one closing `</div>` further down — the one that used to close `page-seuranta` — no longer has a matching opener and must be deleted, or everything rendered after it (Historia/Ohjelma/Ruoka/sidebar) will end up nested inside the wrong element.

Find the end of the former `seuranta-uni` block (now the end of `page-uni`):

```html
    <div class="card">
      <div class="card-title">Historia</div>
      <div id="sleep-history"><div style="color:var(--text3);font-size:13px">Ladataan...</div></div>
    </div>
  </div>
</div>
```

These three closing tags are, in order: closes the "Historia" `.card`, closes `page-uni` (was `seuranta-uni`), closes `page-seuranta` (now nonexistent). Replace with only the first two:

```html
    <div class="card">
      <div class="card-title">Historia</div>
      <div id="sleep-history"><div style="color:var(--text3);font-size:13px">Ladataan...</div></div>
    </div>
  </div>
```

- [ ] **Step 4: Verify the tag balance**

Open the file in a browser after this task and check that everything below this point (Ohjelma page, Ruoka page, the sidebar) still renders and is clickable — if a closing tag was removed incorrectly, one of these will end up invisible or nested inside `page-uni` and never show up when its nav item is clicked.

- [ ] **Step 5: Delete the two now-dead sidebar/JS references**

Find (`page-seuranta`'s stab-bar was already removed in Step 1, but its `showSeuranta` JS function and the `seuranta` branch in `showPage` still exist and are now dead code since nothing links to `showPage('seuranta', ...)` anymore). Find:

```js
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); }
  if (name === 'seuranta')  showSeuranta(seurantaPage);
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
```

Replace with:

```js
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); }
  if (name === 'keho')      loadBodyMetrics();
  if (name === 'uni')       loadSleep();
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
```

Find and delete the now-unused `showSeuranta` function entirely:

```js
function showSeuranta(sub) {
  seurantaPage = sub;
  ['keho','aktiviteetti','uni'].forEach(s => {
    document.getElementById('seuranta-' + s).style.display = s === sub ? 'block' : 'none';
    document.getElementById('stab-' + s).classList.toggle('active', s === sub);
  });
  if (sub === 'keho')         loadBodyMetrics();
  if (sub === 'aktiviteetti') loadActivities();
  if (sub === 'uni')          loadSleep();
}
```

(If `seurantaPage` variable declaration exists elsewhere purely to support this function, leave it — removing unused top-level state is optional cleanup, not required for correctness.)

- [ ] **Step 6: Manual test**

Open the app. Click "Keho" card — opens Keho page with "‹ Koonti" header, mättaus-lomake, kehitys-kaavio, working save button. Click back. Click "Uni" card — same for Uni. Confirm the Ohjelma/Ruoka/sidebar sections below in the HTML still render correctly (proves div nesting wasn't broken). Confirm no console errors on any of these navigations.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "refactor: erota Keho ja Uni omiksi sivuikseen, poista page-seuranta"
```

---

### Task 6: Move "Liikkeen kehitys" + Salilokit into Sali's Kehitys-tab, delete Historia page

**Files:**
- Modify: `index.html` (add Kehitys tab to `page-sali`, move content from `page-historia`, delete `page-historia`, delete `showHistTab`, remove sidebar Historia link)

- [ ] **Step 1: Add a stab-bar and two sub-divs to `page-sali`**

Find (end of `page-sali`, from Task 3):

```html
  <div class="day-tabs" id="day-tabs"></div>
  <div id="session-content"></div>
</div>

<!-- ── AEROBIA ────────────────────────────────────────────────── -->
```

Replace with:

```html
  <div class="day-tabs" id="day-tabs"></div>

  <div class="stab-bar">
    <button id="sali-tab-treeni" class="stab active" onclick="showSaliTab('treeni',this)">Treeni</button>
    <button id="sali-tab-kehitys" class="stab" onclick="showSaliTab('kehitys',this)">Kehitys</button>
  </div>

  <div id="sali-treeni">
    <div id="session-content"></div>
  </div>

  <div id="sali-kehitys" style="display:none">
    <div class="card">
      <div class="card-title">Liikkeen kehitys</div>
      <div class="form-row">
        <label>Liike</label>
        <select id="ex-select" onchange="loadExerciseChart(this.value)">
          <option value="">— Valitse liike —</option>
        </select>
      </div>
      <div style="text-align:right;margin-top:6px">
        <button class="btn btn-primary" style="width:auto;padding:6px 14px;font-size:13px"
          onclick="const v=document.getElementById('ex-select').value;if(v)openExerciseModal(v)">Graffi ↗</button>
      </div>
      <div class="stab-bar" style="margin-top:10px;margin-bottom:0">
        <button id="hist-range-1" class="stab active" onclick="setHistRange(1,this)">1 kk</button>
        <button id="hist-range-3" class="stab"        onclick="setHistRange(3,this)">3 kk</button>
        <button id="hist-range-0" class="stab"        onclick="setHistRange(0,this)">Kaikki</button>
      </div>
      <div id="ex-stats" style="display:none;gap:8px;margin-top:10px">
        <div class="stat-mini-card">
          <div class="stat-mini-label">Paras 1RM</div>
          <div id="stat-1rm" class="stat-mini-val">—</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-label">Volyymi (ed. sessio)</div>
          <div id="stat-vol" class="stat-mini-val">—</div>
          <div id="stat-vol-delta" style="font-size:11px;color:var(--text3);margin-top:2px"></div>
        </div>
      </div>
      <div class="chart-wrap" id="ex-chart-wrap" style="display:none;margin-top:12px">
        <canvas id="ex-chart"></canvas>
      </div>
      <div id="ex-chart-status" style="color:var(--text3);font-size:13px;text-align:center;padding:6px"></div>
    </div>
    <div class="card">
      <div class="card-title">Salilokit</div>
      <div class="form-row">
        <label>Liike</label>
        <select id="lokit-ex-select" onchange="loadWorkoutHistory()">
          <option value="">— Kaikki liikkeet —</option>
        </select>
      </div>
      <div id="workout-history"><div style="color:var(--text3);font-size:13px">Ladataan...</div></div>
    </div>
  </div>
</div>

<!-- ── AEROBIA ────────────────────────────────────────────────── -->
```

**Note:** `#session-content` is now nested one level deeper (inside `#sali-treeni`) — this is a plain container div with no CSS positioning dependency on being a direct child of `#page-sali`, so this is safe. Verify in Step 5 that session content still renders correctly.

- [ ] **Step 2: Delete `page-historia` entirely**

Find the full block (from `<!-- ── HISTORIA ── -->` through its closing `</div>`, right before `<!-- ── OHJELMA ── -->`):

```html
<!-- ── HISTORIA ───────────────────────────────────────────────── -->
<div id="page-historia" class="page">
  <div class="stab-bar">
    <button id="hist-tab-kaaviot" class="stab active" onclick="showHistTab('kaaviot',this)">Kaaviot</button>
    <button id="hist-tab-lokit"   class="stab"        onclick="showHistTab('lokit',this)">Lokit</button>
  </div>

  <div id="hist-kaaviot">
    <div class="card">
      <div class="card-title">Liikkeen kehitys</div>
      <div class="form-row">
        <label>Liike</label>
        <select id="ex-select" onchange="loadExerciseChart(this.value)">
          <option value="">— Valitse liike —</option>
        </select>
      </div>
      <div style="text-align:right;margin-top:6px">
        <button class="btn btn-primary" style="width:auto;padding:6px 14px;font-size:13px"
          onclick="const v=document.getElementById('ex-select').value;if(v)openExerciseModal(v)">Graffi ↗</button>
      </div>
      <div class="stab-bar" style="margin-top:10px;margin-bottom:0">
        <button id="hist-range-1" class="stab active" onclick="setHistRange(1,this)">1 kk</button>
        <button id="hist-range-3" class="stab"        onclick="setHistRange(3,this)">3 kk</button>
        <button id="hist-range-0" class="stab"        onclick="setHistRange(0,this)">Kaikki</button>
      </div>
      <div id="ex-stats" style="display:none;gap:8px;margin-top:10px">
        <div class="stat-mini-card">
          <div class="stat-mini-label">Paras 1RM</div>
          <div id="stat-1rm" class="stat-mini-val">—</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-label">Volyymi (ed. sessio)</div>
          <div id="stat-vol" class="stat-mini-val">—</div>
          <div id="stat-vol-delta" style="font-size:11px;color:var(--text3);margin-top:2px"></div>
        </div>
      </div>
      <div class="chart-wrap" id="ex-chart-wrap" style="display:none;margin-top:12px">
        <canvas id="ex-chart"></canvas>
      </div>
      <div id="ex-chart-status" style="color:var(--text3);font-size:13px;text-align:center;padding:6px"></div>
    </div>
    <div class="card">
      <div class="card-title">Juoksun kehitys</div>
      <div class="form-row">
        <label>Näytä</label>
        <select id="run-chart-type" onchange="loadRunChart()">
          <option value="distance">Matka (km)</option>
          <option value="pace">Vauhti (min/km)</option>
        </select>
      </div>
      <div class="chart-wrap" id="run-chart-wrap" style="margin-top:12px">
        <canvas id="run-chart"></canvas>
      </div>
      <div id="run-chart-status" style="color:var(--text3);font-size:13px;text-align:center;padding:6px"></div>
    </div>
  </div>

  <div id="hist-lokit" style="display:none">
    <div class="card">
      <div class="card-title">Salilokit</div>
      <div class="form-row">
        <label>Liike</label>
        <select id="lokit-ex-select" onchange="loadWorkoutHistory()">
          <option value="">— Kaikki liikkeet —</option>
        </select>
      </div>
      <div id="workout-history"><div style="color:var(--text3);font-size:13px">Ladataan...</div></div>
    </div>
  </div>
</div>

```

Delete it entirely (the "Juoksun kehitys" card in this block is a duplicate — the real one now lives in `page-aerobia` from Task 4; this one is being deleted, not moved).

- [ ] **Step 3: Remove the Historia link from the sidebar**

Find:

```html
  <button onclick="showPage('historia',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">📈</span> Historia
  </button>
  <button onclick="showPage('ohjelma',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
```

Replace with:

```html
  <button onclick="showPage('ohjelma',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
```

- [ ] **Step 4: Replace `showHistTab`/the `historia` showPage branch with `showSaliTab`**

Find:

```js
function showHistTab(tab, btn) {
  document.getElementById('hist-kaaviot').style.display = tab === 'kaaviot' ? '' : 'none';
  document.getElementById('hist-lokit').style.display   = tab === 'lokit'   ? '' : 'none';
  ['hist-tab-kaaviot','hist-tab-lokit'].forEach(id => document.getElementById(id).classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'lokit') loadWorkoutHistory();
}
```

Replace with:

```js
function showSaliTab(tab, btn) {
  document.getElementById('sali-treeni').style.display  = tab === 'treeni'  ? '' : 'none';
  document.getElementById('sali-kehitys').style.display = tab === 'kehitys' ? '' : 'none';
  ['sali-tab-treeni','sali-tab-kehitys'].forEach(id => document.getElementById(id).classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'kehitys') loadWorkoutHistory();
}
```

Find (in `showPage`):

```js
  if (name === 'sali')      renderTreeni();
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); }
  if (name === 'keho')      loadBodyMetrics();
  if (name === 'uni')       loadSleep();
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
```

Replace with:

```js
  if (name === 'sali')      { renderTreeni(); populateExerciseDropdown(); loadWorkoutHistory(); }
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); }
  if (name === 'keho')      loadBodyMetrics();
  if (name === 'uni')       loadSleep();
```

- [ ] **Step 5: Manual test**

Open the app. Open Sali — "Treeni"/"Kehitys" stab-bar visible, Treeni sub-tab active by default showing the usual session content. Click "Kehitys" — shows "Liikkeen kehitys" (pick an exercise, chart renders, "Graffi ↗" opens the modal, 1kk/3kk/Kaikki range buttons work) and "Salilokit" (dropdown + history list). Open the sidebar (Valikko) — "Historia" link is gone, "Ohjelma" and the settings buttons still work. Confirm no console errors anywhere in this flow.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor: siirrä liikkeen kehitys ja salilokit Sali-sivulle, poista Historia"
```

---

### Task 7: Implement real `loadKoonti()` data (cards + streak row)

**Files:**
- Modify: `index.html` (replace the stub `loadKoonti()` from Task 2 with the full version; extend `loadWeekSummary()` and `loadMotivationSummary()` with two extra DOM targets each)

**Design note:** the spec originally called for a brand-new streak/weekly-count query. Reading the code showed `loadWeekSummary()` (index.html, `ws-gym`/`ws-act`/`ws-sleep`) and `loadMotivationSummary()` (`ms-streak`/`ms-week`/`ms-month`, via the existing `fetchActiveDays()` helper) already compute exactly the numbers the design wants — they're just never rendered anywhere but the Sali hero card. Reusing them means zero new Supabase queries for the streak row.

- [ ] **Step 1: Extend `loadWeekSummary()` to also populate the Koonti chips**

Find:

```js
  const gymDays = new Set((gymData || []).map(r => r.workout_date));
  const gymEl = document.getElementById('ws-gym');
  if (gymEl) gymEl.textContent = gymDays.size;

  if (actErr) { console.error('loadWeekSummary (act) failed:', actErr.message); }
  const actEl = document.getElementById('ws-act');
  if (actEl) actEl.textContent = actData ? actData.length : '—';
```

Replace with:

```js
  const gymDays = new Set((gymData || []).map(r => r.workout_date));
  const gymEl = document.getElementById('ws-gym');
  if (gymEl) gymEl.textContent = gymDays.size;
  const kGymEl = document.getElementById('koonti-ws-gym');
  if (kGymEl) kGymEl.textContent = gymDays.size;

  if (actErr) { console.error('loadWeekSummary (act) failed:', actErr.message); }
  const actEl = document.getElementById('ws-act');
  if (actEl) actEl.textContent = actData ? actData.length : '—';
  const kActEl = document.getElementById('koonti-ws-act');
  if (kActEl) kActEl.textContent = actData ? actData.length : '—';
```

- [ ] **Step 2: Extend `loadMotivationSummary()` to also populate the Koonti streak chip**

Find:

```js
  const msStreakEl = document.getElementById('ms-streak');
  if (msStreakEl) msStreakEl.textContent = streak + ' pv';
```

Replace with:

```js
  const msStreakEl = document.getElementById('ms-streak');
  if (msStreakEl) msStreakEl.textContent = streak + ' pv';
  const kStreakEl = document.getElementById('koonti-ms-streak');
  if (kStreakEl) kStreakEl.textContent = streak + ' pv';
```

- [ ] **Step 3: Replace the stub `loadKoonti()` with the full version**

Find (added in Task 2):

```js
function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });
}
```

Replace with:

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();

  const todayIso = localIso(new Date());

  const { data: wsRows } = await sb.from('workout_sessions')
    .select('is_done,session_type,calories')
    .eq('workout_date', todayIso).limit(1);
  const kcSaliCard = document.getElementById('kc-sali');
  const kcSaliSub  = document.getElementById('kc-sali-sub');
  if (wsRows && wsRows[0] && wsRows[0].is_done) {
    const cal = wsRows[0].calories ? ` · ${wsRows[0].calories} kcal` : '';
    kcSaliSub.textContent = `Tehty ✓${cal}`;
    kcSaliCard.classList.add('koonti-card--done');
  } else {
    kcSaliCard.classList.remove('koonti-card--done');
    const st = SCHED[(new Date().getDay() + 6) % 7];
    const isSaliDay = ['t1','t2','t3','t4'].includes(st);
    kcSaliSub.textContent = isSaliDay
      ? `Ei vielä · ${SESS[st].name}`
      : 'Ei salipäivä tänään';
  }

  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min')
    .order('activity_date', { ascending: false }).limit(1);
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  kcAerobiaSub.textContent = (actRows && actRows[0])
    ? `${actRows[0].activity_type} · ${actRows[0].duration_min ?? '—'} min (${actRows[0].activity_date})`
    : 'Ei aktiviteetteja vielä';

  const { data: bodyRows } = await sb.from('body_metrics')
    .select('weight_kg,measured_at')
    .order('measured_at', { ascending: false }).limit(2);
  const kcKehoSub = document.getElementById('kc-keho-sub');
  if (bodyRows && bodyRows[0] && bodyRows[0].weight_kg) {
    let deltaStr = '';
    if (bodyRows[1] && bodyRows[1].weight_kg) {
      const d = Math.round((bodyRows[0].weight_kg - bodyRows[1].weight_kg) * 10) / 10;
      deltaStr = ` · ${d >= 0 ? '+' : ''}${d} kg`;
    }
    kcKehoSub.textContent = `${bodyRows[0].weight_kg} kg${deltaStr}`;
  } else {
    kcKehoSub.textContent = 'Ei mittauksia vielä';
  }

  const { data: sleepRows } = await sb.from('sleep_data')
    .select('duration_min,sleep_date')
    .order('sleep_date', { ascending: false }).limit(7);
  const kcUniSub = document.getElementById('kc-uni-sub');
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
    const withDur = sleepRows.filter(r => r.duration_min !== null);
    const avg = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length : 0;
    kcUniSub.textContent = `${(sleepRows[0].duration_min / 60).toFixed(1)}h · ka ${(avg / 60).toFixed(1)}h`;
  } else {
    kcUniSub.textContent = 'Ei kirjauksia vielä';
  }

  const entries = await loadFoodDayEntries(todayIso);
  const kcRuokaSub = document.getElementById('kc-ruoka-sub');
  const totalKcal = entries.reduce((s, e) => s + (e.kcal || 0), 0);
  kcRuokaSub.textContent = entries.length ? `${Math.round(totalKcal)} kcal tänään` : 'Ei kirjauksia tänään';
}
```

- [ ] **Step 4: Manual test**

Open the app. All five Koonti cards should switch from "Ladataan…" to real values within roughly a second:
- Sali: "Tehty ✓ · N kcal" if you've completed today's session, otherwise "Ei vielä · <session name>" or "Ei salipäivä tänään".
- Aerobia: latest logged activity with type/duration/date, or "Ei aktiviteetteja vielä" if the table is empty.
- Keho: latest weight + delta, or "Ei mittauksia vielä".
- Uni: last night's duration + 7-day average, or "Ei kirjauksia vielä".
- Ruoka: today's total kcal, or "Ei kirjauksia tänään".

The streak row (🔥/🏋️/🏃) should show real numbers matching what you'd see on the Sali page's own hero-metrics row (open Sali and compare — `ms-streak`/`ws-gym`/`ws-act` there should match `koonti-ms-streak`/`koonti-ws-gym`/`koonti-ws-act` on Koonti). Mark today's session done on the Sali page, go back to Koonti — the Sali card should now show "Tehty ✓". Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: toteuta Koonti-korttien ja streak-rivin oikea data"
```

---

### Task 8: Version bump + full manual QA pass

**Files:**
- Modify: `index.html:937` (version chip)

- [ ] **Step 1: Bump the version chip**

Find:

```html
    <div class="version-chip" style="margin:0">v1.4.1</div>
```

Replace with:

```html
    <div class="version-chip" style="margin:0">v1.5.0</div>
```

- [ ] **Step 2: Full manual QA pass**

Run through every item from the design spec's testing checklist (`docs/superpowers/specs/2026-07-07-dashboard-navigation-design.md`, section 8):

1. App opens directly on Koonti, not Sali. Koonti nav button is highlighted.
2. Each of the five cards (Sali, Aerobia, Keho, Uni, Ruoka) opens the correct page with correct live data.
3. Every sub-page's back arrow returns to Koonti, and the Koonti nav button stays highlighted while viewing any of Sali/Aerobia/Keho/Uni (since they're opened by passing the Koonti nav button to `showPage`).
4. Sali's "Kehitys" tab and Aerobia's "Kehitys" tab show the same charts/logs that used to live under Valikko → Historia.
5. Ruoka works identically whether opened from the bottom nav or from the Koonti card.
6. Valikko no longer shows "Historia"; "Ohjelma" and the two settings buttons (Ravintotavoitteet, Kalorikerroin) still work.
7. Streak chips on Koonti show sensible numbers (cross-check against Sali's own hero-metrics row).
8. No leftover references to `page-treeni`, `page-seuranta`, `page-historia`, `showSeuranta`, or `showHistTab` anywhere (quick check: `grep -n "page-treeni\|page-seuranta\|page-historia\|showSeuranta\|showHistTab" index.html` should return nothing).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "v1.5.0: koontisivu, Sali/Aerobia/Keho/Uni omiksi sivuiksi"
```

---

## Self-Review Notes

- **Spec coverage:** Task 2 covers spec §1/§2 (nav + Koonti skeleton), Task 3 covers §3's top half (Sali page = old Treeni), Task 4 covers §4 (Aerobia), Task 5 covers §5 (Keho/Uni), Task 6 covers §3's Kehitys-tab + §6's Historia removal, Task 7 covers §2's data table, Task 8 covers §6's version bump (implied by repo convention) and the spec's §8 testing checklist verbatim.
- **Placeholder scan:** no TBD/TODO; every step has literal before/after code.
- **Type/id consistency:** verified `koonti-ms-streak`/`koonti-ws-gym`/`koonti-ws-act` are used identically in Task 2 (HTML), Task 7 (JS reads/writes); `sali-treeni`/`sali-kehitys`/`sali-tab-*` consistent between Task 6's HTML and its `showSaliTab` function; `aerobia-treeni`/`aerobia-kehitys`/`aerobia-tab-*` consistent between Task 4's HTML and `showAerobiaTab`; `nav-koonti`/`nav-ruoka` ids introduced in Task 2 and referenced by every back-button and card `onclick` in Tasks 2–5.
