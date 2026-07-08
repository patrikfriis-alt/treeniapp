# Kestävyystavoitteet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add settable weekly endurance goals (kilometers, session count, target pace) modeled directly on the existing nutrition-goals feature, with progress shown on the Aerobia page and the Koonti dashboard card.

**Architecture:** Single-file static app (`index.html`, vanilla JS + Supabase JS client, no build step, no test framework). One new single-row Supabase table (`activity_goals`), a settings modal mirroring the existing `openGoalsModal()`/`saveNutritionGoals()` pair, and a new `loadActivityGoalProgress()` function that computes this week's totals from `activity_data` and is called independently from both the Aerobia page and `loadKoonti()`.

**Tech Stack:** HTML/CSS/vanilla JS, Supabase JS client v2. No test runner — verification is manual, in a browser, using a local static server.

**Reference:** Design spec at `docs/superpowers/specs/2026-07-08-kestavyystavoitteet-design.md`.

**How to manually test any task:** from the project root, run `python3 -m http.server 8080`, open `http://localhost:8080/index.html`, open the browser console (check for red errors after every interaction). Tasks 2-4 require the Task 1 migration to have been applied to the live Supabase project first — this is a manual step performed via the Supabase SQL editor.

---

### Task 1: Supabase migration for `activity_goals`

**Files:**
- Create: `supabase/migrations/20260708_kestavyystavoitteet.sql`

- [ ] **Step 1: Write the migration file**

```sql
create table activity_goals (
  id                       bigint primary key default 1 check (id = 1),
  weekly_km                numeric,
  weekly_sessions          integer,
  target_pace_min_per_km   numeric,
  updated_at               timestamptz not null default now()
);

alter table activity_goals enable row level security;

create policy activity_goals_select on activity_goals
  for select to anon, authenticated using (true);
create policy activity_goals_insert on activity_goals
  for insert to anon, authenticated with check (true);
create policy activity_goals_update on activity_goals
  for update to anon, authenticated using (true) with check (true);
```

- [ ] **Step 2: Note for the human operator**

This migration must be applied manually via the Supabase SQL editor — there is no automated way to run it from a sandboxed environment. Report this clearly; do not attempt `supabase db push` or similar.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260708_kestavyystavoitteet.sql
git commit -m "feat: lisää activity_goals-taulu kestävyystavoitteille"
```

---

### Task 2: Settings modal — sidebar entry, `openActivityGoalsModal()`, `saveActivityGoals()`

**Files:**
- Modify: `index.html:1129` (sidebar, insert new button before the existing "Ravintotavoitteet" button)
- Modify: `index.html` (add new functions near `saveNutritionGoals`/`openGoalsModal`)

- [ ] **Step 1: Add the sidebar button**

Find:

```html
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🎯</span> Ravintotavoitteet
  </button>
```

Replace with:

```html
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🎯</span> Ravintotavoitteet
  </button>
  <button onclick="openActivityGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🏃</span> Kestävyystavoitteet
  </button>
```

- [ ] **Step 2: Add the module-level cache variable, loader, saver, and modal functions**

Find:

```js
async function saveNutritionGoals(goals) {
  const { error } = await sb.from('nutrition_goals')
    .upsert({ id: 1, ...goals, updated_at: new Date().toISOString() });
  if (error) { console.error('saveNutritionGoals failed:', error.message); throw error; }
}
```

Insert immediately **before** it:

```js
let activityGoals = null;

async function loadActivityGoals() {
  const { data, error } = await sb.from('activity_goals').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('loadActivityGoals failed:', error.message); return null; }
  return data;
}

async function saveActivityGoals(goals) {
  const { error } = await sb.from('activity_goals')
    .upsert({ id: 1, ...goals, updated_at: new Date().toISOString() });
  if (error) { console.error('saveActivityGoals failed:', error.message); throw error; }
}

async function openActivityGoalsModal() {
  closeSidebar();
  const goals = (await loadActivityGoals()) || {};

  const existing = document.getElementById('activity-goals-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'activity-goals-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:400px;width:100%;max-height:85vh;overflow-y:auto;';

  const field = (id, label, val) =>
    `<div class="form-row"><label>${label}</label><input type="text" inputmode="decimal" id="${id}" value="${val == null ? '' : val}"></div>`;

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Kestävyystavoitteet</div>
    ${field('activity-goal-km', 'Viikko-km', goals.weekly_km)}
    ${field('activity-goal-sessions', 'Viikkokerrat', goals.weekly_sessions)}
    ${field('activity-goal-pace', 'Tavoitevauhti (min/km, esim. 5.5 = 5:30)', goals.target_pace_min_per_km)}
    <button class="btn btn-primary" id="activity-goals-save-btn">Tallenna</button>
    <button class="btn" id="activity-goals-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="activity-goals-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('activity-goals-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('activity-goals-save-btn');
    saveBtn.disabled = true;
    try {
      await saveActivityGoals({
        weekly_km: parseNum('activity-goal-km'),
        weekly_sessions: parseNum('activity-goal-sessions'),
        target_pace_min_per_km: parseNum('activity-goal-pace'),
      });
      activityGoals = null;
      overlay.remove();
    } catch (err) {
      showStatus('activity-goals-status', 'Tallennus epäonnistui', true);
      saveBtn.disabled = false;
    }
  };
  document.getElementById('activity-goals-cancel-btn').onclick = () => overlay.remove();
}

```

(`parseNum()` and `showStatus()` already exist in the file and are reused as-is — same helpers `openGoalsModal()` already uses.)

- [ ] **Step 3: Manual test**

Open the app, open Valikko — "Kestävyystavoitteet" appears above "Ravintotavoitteet". Click it — modal opens with three empty fields. Type `20` / `3` / `5.5`, click Tallenna — modal closes without error. Reopen the modal — the three values are pre-filled from what was just saved (confirms round-trip through Supabase). Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: lisää kestävyystavoitteiden asetusmodaali"
```

---

### Task 3: Progress calculation + Aerobia page display

**Files:**
- Modify: `index.html:960-971` (insert new goal card into `aerobia-treeni`)
- Modify: `index.html` (add `loadActivityGoalProgress()`, `renderAerobiaGoalCard()`)
- Modify: `index.html` (`showPage()`'s `aerobia` branch)

- [ ] **Step 1: Insert the "Viikkotavoite" card into the Aerobia page**

Find:

```html
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
```

Replace with:

```html
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
    <div class="card" id="aerobia-goal-card" style="display:none">
      <div class="card-title">Viikkotavoite</div>
      <div id="aerobia-goal-content"></div>
    </div>
    <div class="card">
      <div class="card-title">Kirjaa aktiviteetti</div>
```

- [ ] **Step 2: Add `loadActivityGoalProgress()` and `renderAerobiaGoalCard()`**

Find `async function loadActivities() {` and insert this new block immediately **before** it:

```js
async function loadActivityGoalProgress() {
  if (!activityGoals) activityGoals = await loadActivityGoals();
  const mon = wStart(wOff);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const from = mon.iso, to = localIso(sun);

  const { data, error } = await sb.from('activity_data')
    .select('distance_km,duration_min')
    .gte('activity_date', from).lte('activity_date', to);
  if (error) { console.error('loadActivityGoalProgress failed:', error.message); return null; }

  const rows = data || [];
  const totalKm = rows.reduce((s, r) => s + (r.distance_km || 0), 0);
  const sessionCount = rows.length;
  const paced = rows.filter(r => r.distance_km && r.duration_min);
  const totalPaceKm = paced.reduce((s, r) => s + r.distance_km, 0);
  const totalPaceMin = paced.reduce((s, r) => s + r.duration_min, 0);
  const avgPace = totalPaceKm > 0 ? totalPaceMin / totalPaceKm : null;

  return { goals: activityGoals, totalKm, sessionCount, avgPace };
}

function formatPaceMinPerKm(pace) {
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

async function renderAerobiaGoalCard() {
  const progress = await loadActivityGoalProgress();
  const card = document.getElementById('aerobia-goal-card');
  const content = document.getElementById('aerobia-goal-content');
  if (!progress || !progress.goals) { card.style.display = 'none'; return; }
  const { goals, totalKm, sessionCount, avgPace } = progress;
  const rows = [];
  if (goals.weekly_km != null) {
    rows.push(`<div class="hist-item"><div class="hist-label">Kilometrit</div><div class="hist-val">${totalKm.toFixed(1)} / ${goals.weekly_km} km</div></div>`);
  }
  if (goals.weekly_sessions != null) {
    rows.push(`<div class="hist-item"><div class="hist-label">Kerrat</div><div class="hist-val">${sessionCount} / ${goals.weekly_sessions}</div></div>`);
  }
  if (goals.target_pace_min_per_km != null) {
    const targetStr = formatPaceMinPerKm(goals.target_pace_min_per_km);
    const avgStr = avgPace != null ? formatPaceMinPerKm(avgPace) : '—';
    rows.push(`<div class="hist-item"><div class="hist-label">Keskivauhti</div><div class="hist-val">${avgStr} / ${targetStr} min/km</div></div>`);
  }
  if (!rows.length) { card.style.display = 'none'; return; }
  content.innerHTML = rows.join('');
  card.style.display = '';
}

```

(`.hist-item`/`.hist-label`/`.hist-val` are existing CSS classes already used by `loadActivities()`'s "Viimeiset" list — no new CSS needed.)

- [ ] **Step 3: Wire into `showPage()`**

Find:

```js
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); }
```

Replace with:

```js
  if (name === 'aerobia')   { loadActivities(); loadRunChart(); renderAerobiaGoalCard(); }
```

- [ ] **Step 4: Manual test**

With goals already set from Task 2's test (20 km / 3 kertaa / 5.5 min/km target): open Aerobia — "Viikkotavoite" card appears showing all three rows with current-week totals against those targets (0/20 km, 0/3, — / 5:30 min/km if no activities logged this week yet, or real numbers if some exist). Open the goals modal, clear the km field only, save — reopen Aerobia (or navigate away and back) — the km row disappears from the card, the other two rows remain. Clear all three fields, save — the whole card disappears. Confirm no console errors throughout.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: näytä kestävyystavoitteiden edistymä Aerobia-sivulla"
```

---

### Task 4: Koonti card integration

**Files:**
- Modify: `index.html:846-850` (Koonti's Aerobia card HTML)
- Modify: `index.html` (`loadKoonti()`'s Aerobia section)

- [ ] **Step 1: Add the goal-progress line to the Koonti Aerobia card HTML**

Find:

```html
    <div class="koonti-card" id="kc-aerobia" onclick="showPage('aerobia', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">🏃</span>
      <div class="koonti-card-label">Aerobinen</div>
      <div class="koonti-card-sub" id="kc-aerobia-sub">Ladataan…</div>
    </div>
```

Replace with:

```html
    <div class="koonti-card" id="kc-aerobia" onclick="showPage('aerobia', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">🏃</span>
      <div class="koonti-card-label">Aerobinen</div>
      <div class="koonti-card-sub" id="kc-aerobia-sub">Ladataan…</div>
      <div class="koonti-card-goal" id="kc-aerobia-goal" style="display:none"></div>
    </div>
```

- [ ] **Step 2: Add the CSS for `.koonti-card-goal`**

Find:

```css
.koonti-card-sub   { font-size: 12px; color: var(--text3); }
.koonti-card--done .koonti-card-sub { color: var(--green); }
```

Replace with:

```css
.koonti-card-sub   { font-size: 12px; color: var(--text3); }
.koonti-card--done .koonti-card-sub { color: var(--green); }
.koonti-card-goal  { font-size: 11px; color: var(--accent); margin-top: 2px; }
```

- [ ] **Step 3: Extend `loadKoonti()`'s Aerobia section**

Find:

```js
  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min')
    .order('activity_date', { ascending: false }).limit(1);
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  kcAerobiaSub.textContent = (actRows && actRows[0])
    ? `${actRows[0].activity_type} · ${actRows[0].duration_min ?? '—'} min (${actRows[0].activity_date})`
    : 'Ei aktiviteetteja vielä';
```

Replace with:

```js
  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min')
    .order('activity_date', { ascending: false }).limit(1);
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  kcAerobiaSub.textContent = (actRows && actRows[0])
    ? `${actRows[0].activity_type} · ${actRows[0].duration_min ?? '—'} min (${actRows[0].activity_date})`
    : 'Ei aktiviteetteja vielä';

  const activityProgress = await loadActivityGoalProgress();
  const kcAerobiaGoal = document.getElementById('kc-aerobia-goal');
  if (activityProgress && activityProgress.goals &&
      (activityProgress.goals.weekly_km != null || activityProgress.goals.weekly_sessions != null)) {
    const parts = [];
    if (activityProgress.goals.weekly_km != null) {
      parts.push(`${activityProgress.totalKm.toFixed(1)}/${activityProgress.goals.weekly_km} km`);
    }
    if (activityProgress.goals.weekly_sessions != null) {
      parts.push(`${activityProgress.sessionCount}/${activityProgress.goals.weekly_sessions} krt`);
    }
    kcAerobiaGoal.textContent = parts.join(' · ');
    kcAerobiaGoal.style.display = '';
  } else {
    kcAerobiaGoal.style.display = 'none';
  }
```

(Only `weekly_km`/`weekly_sessions` are shown on the compact Koonti card — `target_pace_min_per_km` is intentionally omitted here for brevity; it's already shown on the full Aerobia page card from Task 3.)

- [ ] **Step 4: Manual test**

With the km/sessions goals still set from earlier tasks: open Koonti — the Aerobia card shows the existing "latest activity" line plus a new line below it like "0.0/20 km · 0/3 krt" in the accent color. Clear both fields in the goals modal, save, reload Koonti — the second line disappears, only the latest-activity line remains. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: näytä kestävyystavoitteiden edistymä Koonti-kortissa"
```

---

### Task 5: Full manual QA pass + version bump

**Files:**
- Modify: `index.html` (version chip)

- [ ] **Step 1: Bump the version chip**

Find the current version chip value in `index.html` (search for `class="version-chip"`) and replace it with `v1.8.0`.

- [ ] **Step 2: Run through the design spec's testing checklist**

(`docs/superpowers/specs/2026-07-08-kestavyystavoitteet-design.md`, section 4)

1. Set all three goals from the modal, save — Aerobia page's "Viikkotavoite" card appears with correct numbers.
2. Clear one goal, save — corresponding row disappears from the card, others remain.
3. Clear all three — card disappears entirely.
4. Koonti's Aerobia card shows the compact progress line when km/sessions goals are set.
5. Log a new activity from Aerobia, confirm the progress numbers update on next load (both Aerobia card and Koonti card).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "v1.8.0: kestävyystavoitteet"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec §1 (datamalli), Task 2 covers spec §2 (asetusmodaali), Task 3 covers spec §3's Aerobia-sivu half, Task 4 covers spec §3's Koonti-kortti half, Task 5 covers spec §4 (testaus) plus the version-bump convention established in prior sprint work.
- **Placeholder scan:** no TBD/TODO; every step has literal before/after code.
- **Type/id consistency:** `activityGoals`/`loadActivityGoals`/`saveActivityGoals` mirror `foodGoals`/`loadNutritionGoals`/`saveNutritionGoals` exactly. `loadActivityGoalProgress()` (Task 3) is called identically from both `renderAerobiaGoalCard()` (Task 3) and `loadKoonti()` (Task 4) — same return shape (`{goals, totalKm, sessionCount, avgPace}`) consumed both places. `formatPaceMinPerKm()` (Task 3) is defined once and available globally for any future reuse.
- **Deliberate deviation from the design doc's wording:** the design spec suggested reusing `ws-act`'s already-computed session count from `loadWeekSummary()` to avoid "calculating twice." In practice `loadWeekSummary()` only selects `id` from `activity_data` (no `distance_km`/`duration_min`), so it can't supply the km/pace figures this feature also needs — `loadActivityGoalProgress()` therefore runs its own independent query selecting `distance_km,duration_min` and derives the count from that same result set. This issues one additional Supabase query beyond what the design doc implied, but keeps the function self-contained and avoids awkward cross-function data-sharing; consistent with how `loadKoonti()` already does five independent per-card queries rather than sharing state between them.
- **Consistency with existing (imperfect) pattern:** `loadActivityGoalProgress()` uses `wOff` for its week boundary, same as `loadWeekSummary()`. Both share the same pre-existing characteristic that if a user navigates the Sali page to a different week and then returns to Koonti without resetting `wOff`, the "this week" figures would reflect that other week instead. This is not introduced by this plan — it already exists for `loadWeekSummary()`'s Koonti figures (`ws-gym`/`ws-act`/`ws-sleep`) — and fixing it is out of scope here.
