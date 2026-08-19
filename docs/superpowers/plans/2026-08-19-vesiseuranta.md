# Vesiseuranta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Vesi" tile on Koonti's "Mittarit" row (alongside Keho/Uni/Askeleet), tapping it opens a quick-log modal (+250ml/+500ml/custom amount, undo-last), plus a daily goal setting mirroring the existing step-goal feature.

**Architecture:** New `water_log` table (event-based, multiple rows/day, like `food_log_entries` — not single-row-per-day like `step_data`). Goal stored as a new `app_settings.daily_water_goal_ml` column, same pattern as `daily_steps_goal`. No Apple Health/Shortcuts sync — manual entry only.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-19-vesiseuranta-design.md`

---

### Task 1: Database migration — `water_log` table + `app_settings.daily_water_goal_ml`

**Files:**
- Create: `supabase/migrations/20260819_water_log.sql`

**Depends on:** none.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260819_water_log.sql`:

```sql
-- Vesiseuranta: päivittäinen vedenjuonnin pikakirjaus

create table water_log (
  id         uuid primary key default gen_random_uuid(),
  logged_at  date not null default current_date,
  amount_ml  integer not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create index water_log_logged_at_idx on water_log (logged_at);

alter table water_log enable row level security;

create policy water_log_select on water_log
  for select to anon, authenticated using (true);
create policy water_log_insert on water_log
  for insert to anon, authenticated with check (true);
create policy water_log_delete on water_log
  for delete to anon, authenticated using (true);

alter table app_settings add column daily_water_goal_ml integer;
```

No `update` policy on `water_log` — entries are only ever inserted or deleted (via "Kumoa viimeisin"), never edited in place. `daily_water_goal_ml` follows the exact same pattern as the existing `daily_steps_goal` column (see `supabase/migrations/20260715_step_data.sql`) — nullable integer, no default, no separate migration needed for `app_settings`'s own RLS since it already has working policies for existing columns.

- [ ] **Step 2: Verify the file**

```bash
cat supabase/migrations/20260819_water_log.sql
```

Confirm: table present with correct column types (`amount_ml integer not null check (amount_ml > 0)`, `logged_at date`), RLS enabled with exactly select/insert/delete policies (no update), and the `app_settings` column addition at the end.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819_water_log.sql
git commit -m "$(cat <<'EOF'
feat: water_log-taulu ja daily_water_goal_ml-sarake vesiseurantaa varten

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: STOP — do not deploy this migration yourself**

Applying a migration touches the live, shared production Supabase project (ref `yznuzwbbyasgqeqllxic`), not just this worktree. `supabase db push`/`db query` are known to hang indefinitely from this environment (direct Postgres connections are blocked in this sandbox — confirmed root cause, not a flaky one-off). **Report DONE and stop here without running any deploy command.** The controller (main session) applies and verifies the migration against the live database directly, either by asking the user to run `supabase db push` from their own terminal, or via the Supabase dashboard SQL editor — before Tasks 2-4 begin.

## Context

This is Task 1 of a 6-task plan. Nothing in Tasks 2-4 works without this migration being live — the controller confirms deployment (via a REST API check, not by trusting a verbal "it's done") before dispatching Task 2.

Full spec: `docs/superpowers/specs/2026-08-19-vesiseuranta-design.md`.

## Before You Begin

If you have any doubt about matching the `daily_steps_goal` column pattern, re-read `supabase/migrations/20260715_step_data.sql` first.

## Your Job

1. Write the migration file exactly as specified
2. Verify by reading it back
3. Commit with the exact message
4. Self-review (see below)
5. Report back — **do NOT deploy**

## Before Reporting Back: Self-Review

- Confirm `amount_ml` has `check (amount_ml > 0)` — a zero or negative water log makes no sense and should be rejected at the database level, not just the UI.
- Confirm there is no `update` policy on `water_log` and no `update`/`delete` policy conflict with the "insert or delete only" design.
- Confirm the `app_settings` alter statement matches the exact column name `daily_water_goal_ml` (Tasks 2-4 will reference this exact name — a typo here breaks everything downstream).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Confirm the migration file content matches spec exactly
- Commit SHA
- Explicit confirmation you did NOT run any deploy command
- Any issues or concerns

---

### Task 2: Koonti water tile — icon, HTML card, `loadKoonti()` wiring

**Files:**
- Modify: `index.html` — `ICONS` object (new `droplet` key), Koonti "Mittarit" HTML (new card), `loadKoonti()` (new tile population block)

**Depends on:** Task 1's migration must be live (this task reads from `water_log`/`app_settings.daily_water_goal_ml`, though it doesn't write to `water_log` — that's Task 3).

- [ ] **Step 1: Add the `droplet` icon**

Find this exact block (the last two entries of the `ICONS` object):

```js
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
  timer:     '<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/>',
};
```

Replace with:

```js
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
  timer:     '<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/>',
  droplet:   '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',
};
```

- [ ] **Step 2: Add the Koonti card**

Find this exact block:

```html
    <div class="koonti-card" id="kc-steps" onclick="openStepsModal()">
      <span class="koonti-card-icon" data-icon="steps" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Askeleet</div>
      <div class="koonti-card-sub skel-sub" id="kc-steps-sub">&nbsp;</div>
      <div class="koonti-card-goal" id="kc-steps-goal" style="display:none"></div>
      <div class="koonti-progress-track" id="kc-steps-bar-track" style="display:none"><div class="koonti-progress-fill" id="kc-steps-bar-fill" style="width:0%"></div></div>
    </div>
  </div>
```

Replace with:

```html
    <div class="koonti-card" id="kc-steps" onclick="openStepsModal()">
      <span class="koonti-card-icon" data-icon="steps" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Askeleet</div>
      <div class="koonti-card-sub skel-sub" id="kc-steps-sub">&nbsp;</div>
      <div class="koonti-card-goal" id="kc-steps-goal" style="display:none"></div>
      <div class="koonti-progress-track" id="kc-steps-bar-track" style="display:none"><div class="koonti-progress-fill" id="kc-steps-bar-fill" style="width:0%"></div></div>
    </div>
    <div class="koonti-card" id="kc-water" onclick="openWaterModal()">
      <span class="koonti-card-icon" data-icon="droplet" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Vesi</div>
      <div class="koonti-card-sub skel-sub" id="kc-water-sub">&nbsp;</div>
      <div class="koonti-card-goal" id="kc-water-goal" style="display:none"></div>
      <div class="koonti-progress-track" id="kc-water-bar-track" style="display:none"><div class="koonti-progress-fill" id="kc-water-bar-fill" style="width:0%"></div></div>
    </div>
  </div>
```

`openWaterModal()` doesn't exist yet — it's added in Task 3. This is fine; the button just won't do anything until Task 3 lands (same incremental-build pattern as every other multi-task plan in this project).

- [ ] **Step 3: Populate the tile in `loadKoonti()`**

Find this exact block (the end of the steps-tile population, right before the food/Ruoka tile block):

```js
    kcStepsBarFill.style.width = Math.min(100, Math.round(todaySteps.steps / stepsGoal * 100)) + '%';
    kcStepsBarTrack.style.display = '';
  } else {
    kcStepsGoal.style.display = 'none';
    kcStepsBarTrack.style.display = 'none';
  }

  const entries = await loadFoodDayEntries(todayIso);
```

Replace with:

```js
    kcStepsBarFill.style.width = Math.min(100, Math.round(todaySteps.steps / stepsGoal * 100)) + '%';
    kcStepsBarTrack.style.display = '';
  } else {
    kcStepsGoal.style.display = 'none';
    kcStepsBarTrack.style.display = 'none';
  }

  const { data: waterRows, error: waterErr } = await sb.from('water_log')
    .select('amount_ml')
    .eq('logged_at', todayIso);
  if (waterErr) console.error('loadKoonti (water_log) failed:', waterErr.message);
  const kcWaterCard = document.getElementById('kc-water');
  const kcWaterSub = document.getElementById('kc-water-sub');
  kcWaterSub.classList.remove('skel-sub');
  const waterTotal = (waterRows || []).reduce((s, r) => s + (r.amount_ml || 0), 0);
  kcWaterCard.classList.toggle('koonti-card--done', waterTotal > 0);
  kcWaterSub.textContent = waterTotal > 0 ? `${waterTotal} ml` : 'Ei kirjauksia vielä';
  const kcWaterGoal = document.getElementById('kc-water-goal');
  const kcWaterBarTrack = document.getElementById('kc-water-bar-track');
  const kcWaterBarFill = document.getElementById('kc-water-bar-fill');
  const waterGoal = appSettings && appSettings.daily_water_goal_ml != null ? appSettings.daily_water_goal_ml : null;
  if (waterGoal != null) {
    kcWaterGoal.textContent = `${waterTotal}/${waterGoal} ml`;
    kcWaterGoal.style.display = '';
    kcWaterBarFill.style.width = Math.min(100, Math.round(waterTotal / waterGoal * 100)) + '%';
    kcWaterBarTrack.style.display = '';
  } else {
    kcWaterGoal.style.display = 'none';
    kcWaterBarTrack.style.display = 'none';
  }

  const entries = await loadFoodDayEntries(todayIso);
```

**Important, deliberate difference from the steps block:** the steps goal display is gated on `stepsGoal != null && todaySteps` (only shows progress once a synced steps row exists for today). The water block's goal display is gated on `waterGoal != null` ALONE, with no equivalent `&& waterTotal > 0` check — water starts every day at a real, legitimate value of 0 (manually logged, no "hasn't synced yet" ambiguity the way steps has), so a goal of e.g. 2000ml should show "0/2000 ml" and an empty progress bar immediately, not hide until the first glass is logged. Do not "fix" this to match the steps pattern — it's intentional. `appSettings` is already guaranteed loaded by this point (the steps block above unconditionally does `if (!appSettings) appSettings = await loadAppSettings();` earlier in this same function).

- [ ] **Step 4: Verify**

```bash
grep -n "droplet:" index.html
grep -n 'id="kc-water"' index.html
grep -n "loadKoonti (water_log)" index.html
grep -n "const waterGoal = appSettings" index.html
```

Expected: 1 match each.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Vesi-kortti Koontiin (ikoni, kortti, edistymispalkki)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of a 6-task plan. `koonti-card`/`koonti-card-goal`/`koonti-progress-track`/`koonti-progress-fill` CSS classes already exist (used by the steps tile) — reused as-is, no new CSS. `appSettings`, `loadAppSettings()`, `localIso` are pre-existing.

Full spec: `docs/superpowers/specs/2026-08-19-vesiseuranta-design.md`.

## Before You Begin

If any exact block doesn't match, ask now. If querying `water_log` fails with a schema/table-not-found error, that means Task 1's migration wasn't actually deployed yet — report BLOCKED, don't guess at a workaround.

## Your Job

1. Make all three edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the water goal-display condition is `waterGoal != null` only (NOT `waterGoal != null && waterTotal > 0`) — re-read the note above and confirm your implementation matches the deliberate deviation from the steps pattern.
- Confirm `kc-water` card's `onclick="openWaterModal()"` is present even though that function doesn't exist until Task 3 — this is expected, not a bug to fix now.
- Confirm the new water block reads `todayIso` from the same variable already in scope in `loadKoonti()` (don't redeclare it).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 3: Water logging modal — quick-add, custom amount, undo

**Files:**
- Modify: `index.html` — new `openWaterModal()`, `refreshWaterModal()`, `addWater()`, `addWaterCustom()`, `undoLastWater()` functions

**Depends on:** Task 1 (live `water_log` table), Task 2 (the `kc-water` card that triggers this modal).

- [ ] **Step 1: Add the modal and its supporting functions**

Find this exact block (immediately after `openStepsModal()`'s closing brace, before `openCalorieSettingsModal()` — re-locate by content):

```js
async function openCalorieSettingsModal() {
```

Replace with:

```js
async function openWaterModal() {
  const { modal } = createModalOverlay('metric-info-overlay');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);padding:24px;width:100%;max-height:80vh;overflow-y:auto;';
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:600;color:var(--text)">Vesi</div>
      <button onclick="document.getElementById('metric-info-overlay').remove()" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div id="water-modal-total" style="font-size:13px;color:var(--text2);margin-bottom:14px;"></div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <button class="btn" style="flex:1;" onclick="addWater(250)">+250ml</button>
      <button class="btn" style="flex:1;" onclick="addWater(500)">+500ml</button>
    </div>
    <div class="form-row"><label>Muu määrä (ml)</label><input type="text" inputmode="numeric" id="water-amount-input"></div>
    <button class="btn" style="width:100%;margin-bottom:10px;" onclick="addWaterCustom()">Lisää</button>
    <button class="btn" id="water-undo-btn" style="width:100%;background:none;color:var(--text2);display:none;" onclick="undoLastWater()">Kumoa viimeisin</button>
    <div class="status" id="water-modal-status"></div>
  `;
  await refreshWaterModal();
}

async function refreshWaterModal() {
  const todayIso = localIso(new Date());
  const { data, error } = await sb.from('water_log')
    .select('id,amount_ml,created_at')
    .eq('logged_at', todayIso)
    .order('created_at', { ascending: true });
  if (error) { console.error('refreshWaterModal failed:', error.message); return; }
  const rows = data || [];
  const total = rows.reduce((s, r) => s + r.amount_ml, 0);
  if (!appSettings) appSettings = await loadAppSettings();
  const goal = appSettings && appSettings.daily_water_goal_ml != null ? appSettings.daily_water_goal_ml : null;
  const totalEl = document.getElementById('water-modal-total');
  if (totalEl) totalEl.textContent = goal != null ? `${total} / ${goal} ml` : `${total} ml`;
  const undoBtn = document.getElementById('water-undo-btn');
  if (undoBtn) undoBtn.style.display = rows.length ? '' : 'none';
}

async function addWater(ml) {
  const todayIso = localIso(new Date());
  const { error } = await sbWrite({
    table: 'water_log',
    op: 'insert',
    payload: { logged_at: todayIso, amount_ml: ml },
  });
  if (error) { console.error('addWater failed:', error.message); return; }
  await refreshWaterModal();
}

async function addWaterCustom() {
  const ml = parseNum('water-amount-input');
  if (ml == null || ml <= 0) { showStatus('water-modal-status', 'Syötä positiivinen määrä', true); return; }
  document.getElementById('water-amount-input').value = '';
  await addWater(Math.round(ml));
}

async function undoLastWater() {
  const todayIso = localIso(new Date());
  const { data, error } = await sb.from('water_log')
    .select('id')
    .eq('logged_at', todayIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) { console.error('undoLastWater failed:', error.message); return; }
  if (!data || !data.length) return;
  const { error: delErr } = await sbWrite({ table: 'water_log', op: 'delete', eq: { column: 'id', value: data[0].id } });
  if (delErr) { console.error('undoLastWater delete failed:', delErr.message); return; }
  await refreshWaterModal();
}

async function openCalorieSettingsModal() {
```

Note the modal does **not** close itself after `addWater`/`addWaterCustom`/`undoLastWater` — only `refreshWaterModal()` runs, updating the total text and the undo button's visibility in place. This is intentional (per spec §4): the user can tap +250ml several times in a row without the modal closing between taps. It only closes via the ✕ button.

- [ ] **Step 2: Verify**

```bash
grep -n "async function openWaterModal" index.html
grep -n "async function refreshWaterModal" index.html
grep -n "async function addWater\b" index.html
grep -n "async function addWaterCustom" index.html
grep -n "async function undoLastWater" index.html
```

Expected: 1 match each.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: vesimodaali — pikakirjaus, vapaa määrä, kumoa viimeisin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of a 6-task plan — makes the Task 2 card's `onclick="openWaterModal()"` actually work. `createModalOverlay`, `parseNum`, `showStatus`, `sbWrite`, `loadAppSettings`, `appSettings`, `localIso` are all pre-existing helpers/globals used identically elsewhere in this file (e.g. `openCalorieSettingsModal`, `openStepsGoalModal`).

Full spec: `docs/superpowers/specs/2026-08-19-vesiseuranta-design.md`.

## Before You Begin

If the exact insertion block doesn't match, ask now.

## Your Job

1. Add all five functions exactly as specified, in the exact insertion point
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm none of `addWater`/`addWaterCustom`/`undoLastWater` call `overlay.remove()` or otherwise close the modal — only `refreshWaterModal()` should run after each action.
- Confirm `undoLastWater` scopes its query to `.eq('logged_at', todayIso)` before ordering/limiting — without this, "undo last" could delete an entry from a previous day if today has zero entries (hand-trace: today has 0 entries — does `data.length` correctly come back 0, causing `undoLastWater` to no-op via the `if (!data || !data.length) return;` guard, rather than accidentally reaching into yesterday?).
- Confirm `addWaterCustom` clears the input field after a successful add (so the next custom entry doesn't require manually deleting the old value first).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced "undo with zero entries today" scenario
- Any issues or concerns

---

### Task 4: Water goal setting

**Files:**
- Modify: `index.html` — new `openWaterGoalModal()`/`saveWaterGoal()` functions, sidebar menu button

**Depends on:** Task 1 (live `app_settings.daily_water_goal_ml` column).

- [ ] **Step 1: Add `openWaterGoalModal()` and `saveWaterGoal()`**

Find this exact block (immediately after `saveStepsGoal()`'s closing brace, before `openRestTimerModal()` — re-locate by content):

```js
async function saveStepsGoal(goal) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, daily_steps_goal: goal, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveStepsGoal failed:', error.message); throw error; }
}

async function openRestTimerModal() {
```

Replace with:

```js
async function saveStepsGoal(goal) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, daily_steps_goal: goal, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveStepsGoal failed:', error.message); throw error; }
}

async function openWaterGoalModal() {
  closeSidebar();
  const settings = (await loadAppSettings()) || {};
  const currentGoal = settings.daily_water_goal_ml != null ? settings.daily_water_goal_ml : '';

  const { overlay, modal } = createModalOverlay('water-goal-overlay');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);padding:24px;width:100%;';

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Vesitavoite</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">Päivittäinen vesitavoite millilitroina. Jätä tyhjäksi jos et halua seurata tavoitetta.</div>
    <div class="form-row"><label>Tavoite (ml/pv)</label><input type="text" inputmode="numeric" id="water-goal-input" value="${currentGoal}"></div>
    <button class="btn btn-primary" id="water-goal-save-btn">Tallenna</button>
    <button class="btn" id="water-goal-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="water-goal-status"></div>
  `;

  document.getElementById('water-goal-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('water-goal-save-btn');
    const raw = document.getElementById('water-goal-input').value.trim();
    const goal = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && (goal === null || isNaN(goal) || goal <= 0)) {
      showStatus('water-goal-status', 'Syötä positiivinen kokonaisluku tai jätä tyhjäksi', true);
      return;
    }
    saveBtn.disabled = true;
    try {
      await saveWaterGoal(goal);
      appSettings = null;
      overlay.remove();
      if (document.getElementById('page-koonti').classList.contains('active')) loadKoonti();
    } catch (err) {
      showStatus('water-goal-status', 'Tallennus epäonnistui', true);
      saveBtn.disabled = false;
    }
  };
  document.getElementById('water-goal-cancel-btn').onclick = () => overlay.remove();
}

async function saveWaterGoal(goal) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, daily_water_goal_ml: goal, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveWaterGoal failed:', error.message); throw error; }
}

async function openRestTimerModal() {
```

This is a line-for-line mirror of `openStepsGoalModal()`/`saveStepsGoal()` with `steps`→`water`/`daily_steps_goal`→`daily_water_goal_ml` substitutions — same validation (positive integer or empty-to-clear), same `appSettings = null` cache-invalidation before closing, same conditional `loadKoonti()` refresh if currently on the Koonti page.

- [ ] **Step 2: Add the sidebar menu button**

Find this exact block:

```html
  <button onclick="openStepsGoalModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="steps" style="display:inline-flex"></span> Askeltavoite
  </button>
  <button onclick="openRestTimerModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
```

Replace with:

```html
  <button onclick="openStepsGoalModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="steps" style="display:inline-flex"></span> Askeltavoite
  </button>
  <button onclick="openWaterGoalModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="droplet" style="display:inline-flex"></span> Vesitavoite
  </button>
  <button onclick="openRestTimerModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
```

- [ ] **Step 3: Verify**

```bash
grep -n "async function openWaterGoalModal" index.html
grep -n "async function saveWaterGoal" index.html
grep -n "openWaterGoalModal()" index.html
```

Expected: 1, 1, 2 (definition + sidebar `onclick` call site).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: vesitavoitteen asetus (sivuvalikko + tallennus)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of a 6-task plan, the final code-writing task. Mirrors `openStepsGoalModal()`/`saveStepsGoal()` exactly — `closeSidebar`, `loadAppSettings`, `createModalOverlay`, `showStatus`, `sbWrite`, `appSettings` are all pre-existing.

Full spec: `docs/superpowers/specs/2026-08-19-vesiseuranta-design.md`.

## Before You Begin

If either exact block doesn't match, ask now.

## Your Job

1. Make both edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `saveWaterGoal` writes to `daily_water_goal_ml` (not `daily_steps_goal` — easy copy-paste mistake given this is a near-exact mirror of the steps version).
- Confirm empty input correctly saves `null` (clearing the goal) rather than `0` or `NaN` — trace: `raw === ''` → `goal = null` → passes the `raw !== '' && (...)` validation check (short-circuits false since `raw === ''`) → `saveWaterGoal(null)` called.
- Confirm the sidebar button's icon is `data-icon="droplet"` (the icon added in Task 2), not a copy-pasted `"steps"` leftover from the block it was inserted next to.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 5: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Koonti tile** — confirm the "Vesi" card appears on the Mittarit row (Keho/Uni/Askeleet/Vesi), initially "Ei kirjauksia vielä", no progress bar (no goal set yet).

- [ ] **Step 3: Set a goal** — via the sidebar "Vesitavoite" (e.g. 2000), confirm it saves and the Koonti tile immediately shows "0/2000 ml" with an empty (0%) progress bar — this is the deliberate behavior difference from the steps tile called out in Task 2, confirm it actually shows even at 0ml, doesn't stay hidden.

- [ ] **Step 4: Quick-add** — open the water modal, tap +250ml twice in a row. Confirm the modal's own total updates after each tap WITHOUT the modal closing (450ml → 500ml → wait, confirm math: 250+250=500ml shown), and the "Kumoa viimeisin" button appears after the first tap (it should be hidden before any taps today).

- [ ] **Step 5: Custom amount** — enter e.g. 330 in the custom field, tap "Lisää", confirm it adds and the input field clears itself afterward.

- [ ] **Step 6: Undo** — tap "Kumoa viimeisin", confirm only the 330ml entry is removed (total drops from 830 back to 500), not the whole day.

- [ ] **Step 7: Close and re-check Koonti** — close the modal, confirm the Koonti tile reflects the final total and updated progress bar (reload/renavigate if it doesn't auto-refresh while the modal was open — per spec this is expected, not a bug).

- [ ] **Step 8: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 9: Clean up** — stop the local server, close the tab.

- [ ] **Step 10: Report result.** No commit needed.

---

### Task 6: Final code review + finish branch

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the entire diff (Tasks 1-4) covering: migration correctness (types, check constraint, RLS policies — no update policy, delete only where intended), the deliberate `waterGoal != null` (not `&& waterTotal > 0`) gating difference from the steps tile, that the water modal never self-closes after logging/undo actions, that `undoLastWater` is correctly scoped to today only, and that no unrelated code was touched.

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (event-based data model, no update policy) → Task 1. §2 (new icon) → Task 2. §3 (Koonti tile, deliberate goal-display difference from steps) → Task 2. §4 (modal: quick-add, custom amount, undo, no self-close) → Task 3. §5 (goal setting mirroring steps exactly) → Task 4. §6 exclusions (no HealthKit sync, no trend chart, no in-place editing) — respected, no task does any of them.
- **Type/name consistency:** `openWaterModal`, `refreshWaterModal`, `addWater`, `addWaterCustom`, `undoLastWater`, `openWaterGoalModal`, `saveWaterGoal` used identically across every task that references them. `daily_water_goal_ml` spelled identically in the migration (Task 1), `loadKoonti()` (Task 2), `refreshWaterModal()` (Task 3), and `saveWaterGoal()`/`openWaterGoalModal()` (Task 4).
- **No placeholders:** every step shows exact before/after code, exact commands, exact expected output; Tasks 2-4 include concrete hand-trace/self-review scenarios rather than vague "verify it works" instructions.
- **Deploy safety:** Task 1 explicitly stops before deployment, matching the established pattern from the previous feature on this project.
