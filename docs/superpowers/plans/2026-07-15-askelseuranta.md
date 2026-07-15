# Askelseuranta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic daily step-count tracking to Treeniapp — ingestion via a new Apple Shortcuts automation, a "Askeleet" card on the Koonti dashboard, an optional daily step goal, and step data wired into the AI coach's context.

**Architecture:** A new `step_data` table (one row per day, upserted by date) fed by a time-triggered Shortcuts automation, following the exact same Supabase REST + `on_conflict` upsert pattern already used for `activity_data`. Display is a lightweight `openMetricModal`-based modal off a new Koonti card (no new full page). A `daily_steps_goal` column on the existing `app_settings` singleton holds the optional goal. `coach-chat`'s `context.ts` gets one more parallel query to fold step averages into its existing weekly-summary lines.

**Tech Stack:** Supabase (Postgres + PostgREST + Edge Functions), vanilla JS in `index.html`, Apple Shortcuts (iOS), no build step, no test framework — verification is manual/curl-based throughout, matching this project's existing convention.

**No automated tests exist in this project.** Every task's verification step uses `node -e "new Function(...)"` for JS syntax checking and `curl` against the real production Supabase project (project ref `dodrzzgbdlucjbkmxbjn`) for data-layer checks. The anon key is `index.html`'s `SB_KEY` constant — read it directly from the file rather than hardcoding it in this plan, in case it's ever rotated.

---

### Task 1: `step_data` table + `daily_steps_goal` setting

**Files:**
- Create: `supabase/migrations/20260715_step_data.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Askelseuranta: step_data-taulu päivittäisille askelmäärille + tavoiteasetus

create table step_data (
  id          uuid primary key default gen_random_uuid(),
  step_date   date not null unique,
  steps       integer not null,
  source      text default 'watch',
  updated_at  timestamptz not null default now()
);

alter table step_data enable row level security;

create policy step_data_select on step_data
  for select to anon, authenticated using (true);
create policy step_data_insert on step_data
  for insert to anon, authenticated with check (true);
create policy step_data_update on step_data
  for update to anon, authenticated using (true) with check (true);

alter table app_settings add column daily_steps_goal integer;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db query --linked -f supabase/migrations/20260715_step_data.sql`

Expected: command completes without error. If it fails with `relation "step_data" already exists` (this has happened before in this environment for other tables), inspect what already exists with a `select` against the table and apply only the missing pieces (policies/column) manually via `supabase db query --linked`.

- [ ] **Step 3: Verify via curl**

Get the anon key first: `grep "const SB_KEY" index.html`

Then run (substitute `<ANON_KEY>`):

```bash
SB_URL='https://dodrzzgbdlucjbkmxbjn.supabase.co'
SB_KEY='<ANON_KEY>'

# Insert a test row for a harmless past date (won't collide with real usage)
curl -s -X POST "$SB_URL/rest/v1/step_data?on_conflict=step_date" \
  -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
  -H "content-type: application/json" -H "Prefer: return=representation,resolution=merge-duplicates" \
  -d '{"step_date":"2020-01-01","steps":5000,"source":"watch"}'

# Confirm it landed
curl -s "$SB_URL/rest/v1/step_data?step_date=eq.2020-01-01&select=*" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"

# Re-push the same date with a different count to prove upsert overwrites, not duplicates
curl -s -X POST "$SB_URL/rest/v1/step_data?on_conflict=step_date" \
  -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
  -H "content-type: application/json" -H "Prefer: return=representation,resolution=merge-duplicates" \
  -d '{"step_date":"2020-01-01","steps":8000,"source":"watch"}'

# Confirm exactly one row exists for that date, with steps=8000
curl -s "$SB_URL/rest/v1/step_data?step_date=eq.2020-01-01&select=*" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"

# Confirm the new app_settings column exists and is nullable
curl -s "$SB_URL/rest/v1/app_settings?select=daily_steps_goal" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"
```

Expected: the second select shows exactly one row for `2020-01-01` with `"steps":8000` (proving the upsert overwrote rather than duplicated), and the `app_settings` select returns a row (goal will be `null` until Task 4 sets one).

**Leave the `2020-01-01` test row in place** — the anon key has no delete policy on `step_data` by design (matches `coach_notes`/`coach_messages` precedent from the previous plan), so it can't be cleaned up without service-role access. Report the exact test data inserted (date, table) so the plan owner can remove it via `supabase db query --linked` if desired. It's a harmless, clearly-fake historical date with no real-world meaning.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260715_step_data.sql
git commit -m "feat: step_data-taulu ja daily_steps_goal-asetus"
```

---

### Task 2: Apple Shortcuts guide — Step Count Sync

**Files:**
- Modify: `docs/apple-watch-shortcuts-guide-en.md`
- Modify: `docs/apple-watch-shortcuts-guide.md`

Both guides currently end after a "## 6. Troubleshooting" / "## 6. Vianetsintä" section. Add a new "## 7." section after it in each file, plus one new troubleshooting bullet.

- [ ] **Step 1: Append to `docs/apple-watch-shortcuts-guide-en.md`**

Add this content at the end of the file (after the existing "## 6. Troubleshooting" bullets):

```markdown

## 7. Step Count Sync

Steps aren't tied to a workout, so this needs a second, separate personal automation that runs on a schedule instead of a workout trigger.

### Create the automation

1. Open **Shortcuts** → **Automation** tab → **+** (Create Personal Automation)
2. Choose trigger: **Time of Day** → pick a time (e.g. 10:00) → set **Run Immediately**
3. Repeat this automation a few times through the day (e.g. 10:00, 14:00, 18:00, 22:00 — create one automation per time) — each run just overwrites today's total with the latest count, so running it more than once a day keeps the figure reasonably current without needing a continuous trigger.

### Read today's steps

1. Add the **Find Health Samples** action
2. Set: Sample Type **Steps**, Date **Today**, aggregate as **Sum**
3. Add a **Set Variable** action to store the result as `StepCount`
4. Add a **Format Date** action for **Current Date**, formatted as `yyyy-MM-dd`, stored as `Today`

### Push it to Supabase

**Get Contents of URL:**
- Method: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/step_data?on_conflict=step_date`
- Headers:
  - `apikey`: `<anon key from index.html>`
  - `Authorization`: `Bearer <same anon key>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Request body (JSON):
  ```json
  { "step_date": "[Today]", "steps": [StepCount], "source": "watch" }
  ```

### Test it

Tap **"Run"** on the automation manually — confirm a row for today appears in the `step_data` table via the Supabase dashboard (Table Editor), and that running it again updates the same row instead of creating a new one.
```

Then add one bullet to the existing "## 6. Troubleshooting" section (insert as the last bullet, after the `avg_heart_rate` one):

```markdown
- **Steps never appear:** check that the migration file `supabase/migrations/20260715_step_data.sql` has been run, and that Shortcuts has permission to read Steps in the Health app's privacy settings (Health app → profile icon → Apps → Shortcuts → Steps must be enabled).
```

- [ ] **Step 2: Append the matching Finnish section to `docs/apple-watch-shortcuts-guide.md`**

Add this content at the end of the file (after the existing "## 6. Vianetsintä" bullets):

```markdown

## 7. Askelmäärän synkkaus

Askeleet eivät liity yksittäiseen treeniin, joten tämä tarvitsee toisen, erillisen henkilökohtaisen automaation, joka toimii aikataulun eikä treenilaukaisimen mukaan.

### Luo automaatio

1. Avaa **Shortcuts** → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Kellonaika** (Time of Day) → valitse aika (esim. 10:00) → aseta **Suorita heti**
3. Toista tämä automaatio muutaman kerran päivässä (esim. 10:00, 14:00, 18:00, 22:00 — yksi automaatio per ajankohta) — jokainen ajo vain korvaa päivän summan tuoreimmalla luvulla, joten useampi ajo päivässä pitää luvun kohtuullisen ajantasaisena ilman jatkuvaa laukaisinta.

### Hae päivän askeleet

1. Lisää toiminto **Find Health Samples** (Etsi terveysnäytteet)
2. Aseta: Näytetyyppi **Steps** (Askeleet), Ajankohta **Tänään**, yhdistelmä **Summa** (Sum)
3. Lisää **Aseta muuttuja** -toiminto tuloksen tallentamiseksi muuttujaan `StepCount`
4. Lisää **Format Date** -toiminto **Nykyiselle päivämäärälle**, muodossa `yyyy-MM-dd`, tallenna muuttujaan `Today`

### Lähetä Supabaseen

**Get Contents of URL:**
- Metodi: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/step_data?on_conflict=step_date`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Runko (JSON):
  ```json
  { "step_date": "[Today]", "steps": [StepCount], "source": "watch" }
  ```

### Testaa

Paina automaation kohdalla **"Kokeile"** (Run) manuaalisesti — tarkista että tälle päivälle ilmestyy rivi `step_data`-tauluun Supabasen dashboardista (Table Editor), ja että uudelleenajo päivittää saman rivin sen sijaan että loisi uuden.
```

Then add one bullet to the existing "## 6. Vianetsintä" section (insert as the last bullet, after the `avg_heart_rate` one):

```markdown
- Jos askeleet eivät koskaan ilmesty: tarkista että migraatiotiedosto `supabase/migrations/20260715_step_data.sql` on ajettu, ja että Shortcutsilla on lupa lukea askeleita Health-sovelluksen tietosuoja-asetuksista (Health-sovellus → profiilikuvake → Sovellukset → Shortcuts → Askeleet-lupa päällä).
```

- [ ] **Step 3: Commit**

```bash
git add docs/apple-watch-shortcuts-guide-en.md docs/apple-watch-shortcuts-guide.md
git commit -m "docs: askelmäärän synkkausohje Shortcuts-oppaisiin"
```

---

### Task 3: Koonti dashboard card

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add a "steps" icon to the `ICONS` object**

Find (around line 1287):

```javascript
  chat:      '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
};
```

Replace with:

```javascript
  chat:      '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
};
```

- [ ] **Step 2: Add the card markup to the "Mittarit" section**

Find (around line 943-955):

```html
  <div class="koonti-section-label">Mittarit</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-keho" onclick="showPage('keho', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="scale" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Keho</div>
      <div class="koonti-card-sub skel-sub" id="kc-keho-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-uni" onclick="showPage('uni', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="moon" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Uni</div>
      <div class="koonti-card-sub skel-sub" id="kc-uni-sub">&nbsp;</div>
    </div>
  </div>
```

Replace with:

```html
  <div class="koonti-section-label">Mittarit</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-keho" onclick="showPage('keho', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="scale" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Keho</div>
      <div class="koonti-card-sub skel-sub" id="kc-keho-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-uni" onclick="showPage('uni', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="moon" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Uni</div>
      <div class="koonti-card-sub skel-sub" id="kc-uni-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-steps" onclick="openStepsModal()">
      <span class="koonti-card-icon" data-icon="steps" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Askeleet</div>
      <div class="koonti-card-sub skel-sub" id="kc-steps-sub">&nbsp;</div>
      <div class="koonti-card-goal" id="kc-steps-goal" style="display:none"></div>
    </div>
  </div>
```

- [ ] **Step 3: Populate the card inside `loadKoonti()`**

Find the end of the sleep block and the start of the food block inside `loadKoonti()` (around line 4893-4901):

```javascript
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
    const withDur = sleepRows.filter(r => r.duration_min !== null);
    const avg = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length : 0;
    kcUniSub.textContent = `${(sleepRows[0].duration_min / 60).toFixed(1)}h · ka ${(avg / 60).toFixed(1)}h`;
  } else {
    kcUniSub.textContent = 'Ei kirjauksia vielä';
  }

  const entries = await loadFoodDayEntries(todayIso);
```

Replace with:

```javascript
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
    const withDur = sleepRows.filter(r => r.duration_min !== null);
    const avg = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length : 0;
    kcUniSub.textContent = `${(sleepRows[0].duration_min / 60).toFixed(1)}h · ka ${(avg / 60).toFixed(1)}h`;
  } else {
    kcUniSub.textContent = 'Ei kirjauksia vielä';
  }

  const weekStartIso = wStart(0).iso;
  const { data: stepsWeekRows } = await sb.from('step_data')
    .select('step_date,steps')
    .gte('step_date', weekStartIso)
    .order('step_date', { ascending: false });
  const kcStepsCard = document.getElementById('kc-steps');
  const kcStepsSub = document.getElementById('kc-steps-sub');
  kcStepsSub.classList.remove('skel-sub');
  const todaySteps = (stepsWeekRows || []).find(r => r.step_date === todayIso);
  kcStepsCard.classList.toggle('koonti-card--done', !!todaySteps);
  if (stepsWeekRows && stepsWeekRows.length) {
    const avgSteps = stepsWeekRows.reduce((s, r) => s + r.steps, 0) / stepsWeekRows.length;
    kcStepsSub.textContent = todaySteps
      ? `${todaySteps.steps.toLocaleString('fi-FI')} · ka ${Math.round(avgSteps).toLocaleString('fi-FI')}`
      : `Ei tänään · ka ${Math.round(avgSteps).toLocaleString('fi-FI')}`;
  } else {
    kcStepsSub.textContent = 'Ei kirjauksia vielä';
  }
  if (!appSettings) appSettings = await loadAppSettings();
  const kcStepsGoal = document.getElementById('kc-steps-goal');
  const stepsGoal = appSettings && appSettings.daily_steps_goal;
  if (stepsGoal && todaySteps) {
    kcStepsGoal.textContent = `${todaySteps.steps.toLocaleString('fi-FI')}/${stepsGoal.toLocaleString('fi-FI')}`;
    kcStepsGoal.style.display = '';
  } else {
    kcStepsGoal.style.display = 'none';
  }

  const entries = await loadFoodDayEntries(todayIso);
```

`todayIso` and `appSettings` are already in scope here — `todayIso` is declared at the top of `loadKoonti()` (`const todayIso = localIso(new Date());`, line 4809), and `appSettings` is the existing module-level cache (declared at line 2519, already read/written by the calorie-correction code) so this follows the same lazy-load pattern as the deficit-card code elsewhere in the same function.

- [ ] **Step 4: Add `openStepsModal()`**

Find `openCalorieSettingsModal` (around line 4487) and insert this new function directly before it:

```javascript
async function openStepsModal() {
  const weekStartIso = wStart(0).iso;
  const todayIso = localIso(new Date());
  const { data, error } = await sb.from('step_data')
    .select('step_date,steps')
    .gte('step_date', weekStartIso)
    .order('step_date', { ascending: false });
  if (error) {
    console.error('openStepsModal failed:', error.message);
    openMetricModal('Askeleet', '<div class="status err">Virhe ladattaessa askeltietoja</div>');
    return;
  }
  const rows = data || [];
  const today = rows.find(r => r.step_date === todayIso);
  const avg = rows.length ? rows.reduce((s, r) => s + r.steps, 0) / rows.length : 0;

  if (!appSettings) appSettings = await loadAppSettings();
  const goal = appSettings && appSettings.daily_steps_goal;

  let body = `
    <div class="metric-modal-row"><span>Tänään</span><span class="val">${today ? today.steps.toLocaleString('fi-FI') : '—'}</span></div>
    <div class="metric-modal-row"><span>Viikon keskiarvo</span><span class="val">${rows.length ? Math.round(avg).toLocaleString('fi-FI') : '—'}</span></div>
  `;
  if (goal) {
    body += `<div class="metric-modal-row"><span>Tavoite</span><span class="val">${goal.toLocaleString('fi-FI')}</span></div>`;
  }
  if (!rows.length) {
    body += `<div class="status" style="margin-top:8px;">Ei kirjauksia vielä tällä viikolla</div>`;
  }
  openMetricModal('Askeleet', body);
}
```

`openMetricModal`, `wStart`, `localIso`, `sb`, `appSettings`, and `loadAppSettings` are all existing, already-defined helpers used identically by neighboring modal functions (see `openWeeklyGymModal`/`openCalorieSettingsModal` immediately around this code for the same patterns).

- [ ] **Step 5: Syntax-check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success). If it throws, fix the reported syntax error before continuing.

- [ ] **Step 6: Verify data flow via curl**

Using the same `SB_URL`/`SB_KEY` as Task 1, push a real-looking row for **today** (use today's actual date so the card's "today" logic can be verified against it later in Task 6's manual QA — do NOT use a fake date here, since this is meant to be looked at in the live UI):

```bash
TODAY=$(date -u +%Y-%m-%d)
curl -s -X POST "$SB_URL/rest/v1/step_data?on_conflict=step_date" \
  -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
  -H "content-type: application/json" -H "Prefer: return=representation,resolution=merge-duplicates" \
  -d "{\"step_date\":\"$TODAY\",\"steps\":6432,\"source\":\"watch\"}"
```

This row is real-shaped test data for today (not the throwaway `2020-01-01` row from Task 1) — leave it in place; it'll be used for the manual QA pass in Task 6 and reflects a plausible real value, not garbage data that needs cleanup.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: Askeleet-kortti Koonti-sivulle"
```

---

### Task 4: Daily step goal setting

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the sidebar row**

Find (around line 1250-1252):

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
```

Replace with:

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
  <button onclick="openStepsGoalModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="steps" style="display:inline-flex"></span> Askeltavoite
  </button>
```

(The `steps` icon was already added to the `ICONS` object in Task 3, Step 1 — this reuses it.)

- [ ] **Step 2: Add `openStepsGoalModal()` and `saveStepsGoal()`**

Find `openCalorieSettingsModal`'s closing brace (around line 4533, immediately before the `UTILITIES` comment block):

```javascript
  document.getElementById('calorie-settings-cancel-btn').onclick = () => overlay.remove();
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

Replace with:

```javascript
  document.getElementById('calorie-settings-cancel-btn').onclick = () => overlay.remove();
}

async function openStepsGoalModal() {
  closeSidebar();
  const settings = (await loadAppSettings()) || {};
  const currentGoal = settings.daily_steps_goal || '';

  const existing = document.getElementById('steps-goal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'steps-goal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;';

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Askeltavoite</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">Päivittäinen askeltavoite. Jätä tyhjäksi jos et halua seurata tavoitetta.</div>
    <div class="form-row"><label>Tavoite (askelta/pv)</label><input type="text" inputmode="numeric" id="steps-goal-input" value="${currentGoal}"></div>
    <button class="btn btn-primary" id="steps-goal-save-btn">Tallenna</button>
    <button class="btn" id="steps-goal-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="steps-goal-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('steps-goal-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('steps-goal-save-btn');
    const raw = document.getElementById('steps-goal-input').value.trim();
    const goal = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && (goal === null || isNaN(goal) || goal <= 0)) {
      showStatus('steps-goal-status', 'Syötä positiivinen kokonaisluku tai jätä tyhjäksi', true);
      return;
    }
    saveBtn.disabled = true;
    try {
      await saveStepsGoal(goal);
      appSettings = null;
      overlay.remove();
      if (document.getElementById('page-koonti').classList.contains('active')) loadKoonti();
    } catch (err) {
      showStatus('steps-goal-status', 'Tallennus epäonnistui', true);
      saveBtn.disabled = false;
    }
  };
  document.getElementById('steps-goal-cancel-btn').onclick = () => overlay.remove();
}

async function saveStepsGoal(goal) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, daily_steps_goal: goal, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveStepsGoal failed:', error.message); throw error; }
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

- [ ] **Step 3: Syntax-check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 4: Verify the setting round-trips via curl**

```bash
SB_URL='https://dodrzzgbdlucjbkmxbjn.supabase.co'
SB_KEY='<ANON_KEY, same as Task 1>'

# Set a goal (mirrors exactly what saveStepsGoal's sbWrite upsert sends)
curl -s -X POST "$SB_URL/rest/v1/app_settings?on_conflict=id" \
  -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
  -H "content-type: application/json" -H "Prefer: return=representation,resolution=merge-duplicates" \
  -d '{"id":1,"daily_steps_goal":10000,"updated_at":"2026-07-15T12:00:00.000Z"}'

# Confirm it's set
curl -s "$SB_URL/rest/v1/app_settings?select=daily_steps_goal" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"
```

Expected: second call returns `[{"daily_steps_goal":10000}]`. **Leave this value in place** — it's needed for Task 6's manual QA of the goal-progress display, and a 10,000-step goal is a reasonable real default the user can keep or change afterward.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: askeltavoite-asetus"
```

---

### Task 5: Coach context — step trends

**Files:**
- Modify: `supabase/functions/coach-chat/context.ts`

- [ ] **Step 1: Add the `step_data` query to the `Promise.all`**

Find (the destructuring + `Promise.all` call, near the top of `buildDataContext`):

```typescript
  const [
    { data: profile },
    { data: weightRows },
    { data: gymSetsAll },
    { data: activitiesAll },
    { data: sleepAll },
    { data: foodAll },
    { data: recentSets },
    { data: activeDaysAct },
    { data: activeDaysGym },
    { data: todaySessions },
    { data: appSettings },
    { data: notesRow },
  ] = await Promise.all([
    sb.from('user_profile').select('*').eq('id', 1).maybeSingle(),
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
    sb.from('workout_sets').select('workout_date').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
    sb.from('activity_data').select('activity_type,activity_date,duration_min,distance_km,calories').gte('activity_date', twelveWeeksAgoIso).lte('activity_date', todayIso),
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
    sb.from('food_log_entries').select('logged_at,kcal').gte('logged_at', twelveWeeksAgoIso).lte('logged_at', todayIso),
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', threeWeeksAgoIso).lte('workout_date', todayIso).order('workout_date', { ascending: true }),
    sb.from('activity_data').select('activity_date').gte('activity_date', ninetyDaysAgoIso).lte('activity_date', todayIso),
    sb.from('workout_sets').select('workout_date').gte('workout_date', ninetyDaysAgoIso).lte('workout_date', todayIso),
    sb.from('workout_sessions').select('calories').eq('workout_date', todayIso),
    sb.from('app_settings').select('calorie_correction').eq('id', 1).maybeSingle(),
    sb.from('coach_notes').select('notes').eq('id', 1).maybeSingle(),
  ]);
```

Replace with:

```typescript
  const [
    { data: profile },
    { data: weightRows },
    { data: gymSetsAll },
    { data: activitiesAll },
    { data: sleepAll },
    { data: foodAll },
    { data: recentSets },
    { data: activeDaysAct },
    { data: activeDaysGym },
    { data: todaySessions },
    { data: appSettings },
    { data: notesRow },
    { data: stepsAll },
  ] = await Promise.all([
    sb.from('user_profile').select('*').eq('id', 1).maybeSingle(),
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
    sb.from('workout_sets').select('workout_date').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
    sb.from('activity_data').select('activity_type,activity_date,duration_min,distance_km,calories').gte('activity_date', twelveWeeksAgoIso).lte('activity_date', todayIso),
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
    sb.from('food_log_entries').select('logged_at,kcal').gte('logged_at', twelveWeeksAgoIso).lte('logged_at', todayIso),
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', threeWeeksAgoIso).lte('workout_date', todayIso).order('workout_date', { ascending: true }),
    sb.from('activity_data').select('activity_date').gte('activity_date', ninetyDaysAgoIso).lte('activity_date', todayIso),
    sb.from('workout_sets').select('workout_date').gte('workout_date', ninetyDaysAgoIso).lte('workout_date', todayIso),
    sb.from('workout_sessions').select('calories').eq('workout_date', todayIso),
    sb.from('app_settings').select('calorie_correction').eq('id', 1).maybeSingle(),
    sb.from('coach_notes').select('notes').eq('id', 1).maybeSingle(),
    sb.from('step_data').select('step_date,steps').gte('step_date', twelveWeeksAgoIso).lte('step_date', todayIso),
  ]);
```

- [ ] **Step 2: Fold step averages into the weekly-summary line**

Find the weekly-summary loop:

```typescript
    const weekWeights = (weightRows || []).filter((r: any) => r.measured_at >= from && r.measured_at <= to);
    const weekWeight = weekWeights.length ? weekWeights[weekWeights.length - 1].weight_kg : null;

    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}.`,
    );
```

Replace with:

```typescript
    const weekWeights = (weightRows || []).filter((r: any) => r.measured_at >= from && r.measured_at <= to);
    const weekWeight = weekWeights.length ? weekWeights[weekWeights.length - 1].weight_kg : null;
    const weekSteps = (stepsAll || []).filter((r: any) => r.step_date >= from && r.step_date <= to);
    const avgSteps = weekSteps.length
      ? Math.round(weekSteps.reduce((s: number, r: any) => s + r.steps, 0) / weekSteps.length)
      : null;

    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}.`,
    );
```

- [ ] **Step 3: Deploy the Edge Function**

Run: `supabase functions deploy coach-chat --project-ref dodrzzgbdlucjbkmxbjn`

Expected: deploy succeeds (no `--no-verify-jwt` flag — this function needs standard Supabase anon-key auth + CORS, matching how it was already deployed for the previous two coach features).

- [ ] **Step 4: Verify via curl**

This requires the `COACH_SECRET` value and an existing `conversation_id` with at least one message — if you don't have these, report DONE_WITH_CONCERNS with static verification only (do not guess or fabricate the secret) and let the plan owner complete live verification.

If you do have the secret:

```bash
SB_URL='https://dodrzzgbdlucjbkmxbjn.supabase.co'
SB_KEY='<ANON_KEY>'
COACH_SECRET='<COACH_SECRET>'
CONV_ID='<a real or newly-created conversation_id>'

# Insert a user message asking about steps into coach_messages first, then:
curl -s -X POST "$SB_URL/functions/v1/coach-chat" \
  -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
  -H "x-coach-secret: $COACH_SECRET" -H "content-type: application/json" \
  -d "{\"conversation_id\":\"$CONV_ID\"}"
```

Expected: the reply references real step data (the `2020-01-01` test row from Task 1 and/or today's row from Task 3 will show up in the 12-week window and should be reflected in the weekly summary the coach sees). Clean up any test conversation you create the same way established in the previous plan (`supabase db query --linked`, being careful not to touch any pre-existing real conversations).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/coach-chat/context.ts
git commit -m "feat: liitä askeltrendit valmentajan kontekstiin"
```

---

### Task 6: Manual QA and version bump

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Manual QA checklist**

Using the browser (or curl where noted), verify:

1. Koonti page shows the new "Askeleet" card under "Mittarit" (third card, after Keho and Uni), with today's step count from the row inserted in Task 3 Step 6, plus the weekly average.
2. Clicking the card opens a modal titled "Askeleet" showing today's count, weekly average, and (since Task 4 set a goal of 10,000) a "Tavoite: 10 000" row.
3. Sidebar → Asetukset → "Askeltavoite" opens the goal modal, pre-filled with `10000` (set in Task 4). Change it, save, reopen the "Askeleet" modal, confirm the new goal shows.
4. Ask the coach a question referencing steps (e.g. "Miten askelmääräni ovat kehittyneet?") — confirm the reply references real data, not a generic non-answer.
5. Confirm the coach's persistent notes (via the existing "Mitä valmentaja tietää sinusta" modal) pick up any durable step-related observation if one naturally arises from the conversation — this is opportunistic, not a hard requirement, since the notes mechanism only writes when something notable comes up.

- [ ] **Step 2: Bump the version chip**

Find (in the sidebar):

```html
    <div class="version-chip" style="margin:0">v1.21.0</div>
```

Replace with:

```html
    <div class="version-chip" style="margin:0">v1.22.0</div>
```

- [ ] **Step 3: Final syntax check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "v1.22.0: Askelseuranta"
```
