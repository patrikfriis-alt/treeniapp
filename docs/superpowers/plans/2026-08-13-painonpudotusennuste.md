# Painonpudotusennuste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-calibrating, two-compartment (fat/muscle) weight-loss forecast to the Keho page's existing "Kehitys" chart — predicts weeks-to-target-weight at your actual recent eating pace, and automatically recalibrates its internal coefficients as real measurement data accumulates.

**Architecture:** A pure calculation module (constants + 3 functions, no DOM/DB dependencies — testable standalone via `node`), a calibration function that reads `body_metrics`/`food_log_entries` and writes `model_calibration` rows (triggered after each body-metrics save), a new `target_weight_kg` field on the existing `user_profile` table, and an extension of the existing `loadBodyMetrics()` function to compute + display the forecast (text + a dashed overlay line on the existing Chart.js chart).

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST backend, Chart.js (already a dependency). No build step. The calculation module IS unit-testable via plain `node -e` since it has zero external dependencies — this plan uses that for real verification, unlike most of this app's UI-only code.

**Spec:** `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`

---

### Task 1: Migration file (target weight + calibration table)

**Files:**
- Create: `supabase/migrations/20260813_painonpudotusennuste.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260813_painonpudotusennuste.sql` with exactly this content:

```sql
-- Painonpudotusennuste: tavoitepaino profiiliin + kalibrointihistoria kaksiosastomallille.

alter table user_profile add column if not exists target_weight_kg numeric;

create table model_calibration (
  id uuid primary key default gen_random_uuid(),
  calibrated_at timestamptz not null default now(),
  other_tissue_kcal_per_kg numeric not null,
  activity_multiplier numeric not null,
  sample_weeks numeric not null
);

alter table model_calibration enable row level security;

create policy model_calibration_select on model_calibration
  for select to anon, authenticated using (true);
create policy model_calibration_insert on model_calibration
  for insert to anon, authenticated with check (true);
```

- [ ] **Step 2: Verify the file**

```bash
cat supabase/migrations/20260813_painonpudotusennuste.sql
```

Expected: exactly the content above, no differences.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813_painonpudotusennuste.sql
git commit -m "$(cat <<'EOF'
feat: target_weight_kg-sarake ja model_calibration-taulu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of an 8-task plan adding a self-calibrating weight-loss forecast to the Keho page. This task ONLY creates the migration file — it does NOT apply it to the live database (Task 2, run by someone with direct DB access) and does NOT touch `index.html` (later tasks). No `update`/`delete` policy on `model_calibration` — calibration history is append-only, never edited or removed, per the design doc.

Full spec: `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`. Full plan: `docs/superpowers/plans/2026-08-13-painonpudotusennuste.md`.

## Before You Begin

If anything is unclear, ask now before making changes.

## Your Job

1. Create exactly the one file specified, with exactly the content specified
2. Verify with the exact command shown
3. Commit your work with the exact commit message shown
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Is the file content byte-for-byte what was specified?
- Did you touch any other file? (You shouldn't have.)

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 2: Apply the migration to the live Supabase database

**Files:** none (database operation only)

**Run this task in the main session, not a subagent** — it needs live Supabase CLI/API access. This project's Supabase project ref is `yznuzwbbyasgqeqllxic`. Known quirk from prior sessions: `supabase db query --linked` sometimes hangs at "Initialising login role..." — if so, don't wait it out; fall back to asking the user to run the SQL via the Supabase dashboard SQL editor.

- [ ] **Step 1: Confirm the CLI is linked**

```bash
supabase link --project-ref yznuzwbbyasgqeqllxic
```

- [ ] **Step 2: Apply the migration, backgrounded**

```bash
supabase db query --linked -f supabase/migrations/20260813_painonpudotusennuste.sql
```

If it hangs, kill it and fall back to the dashboard (`https://supabase.com/dashboard/project/yznuzwbbyasgqeqllxic/sql/new`), pasting the migration's contents.

- [ ] **Step 3: Verify both changes are live**

```bash
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/user_profile?select=id,target_weight_kg" \
  -H "apikey: <SB_KEY from index.html>" -H "Authorization: Bearer <SB_KEY from index.html>"
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/model_calibration?select=*" \
  -H "apikey: <SB_KEY from index.html>" -H "Authorization: Bearer <SB_KEY from index.html>"
```

Expected: first call returns the existing `user_profile` row including a `target_weight_kg` key (value `null` is correct). Second call returns `[]` (empty array — table exists, no rows yet). If either errors with "column/relation does not exist," the migration didn't apply — retry Step 2 or use the dashboard before proceeding to later tasks.

- [ ] **Step 4: Report result**

No commit needed. State clearly whether both changes are live, and whether the dashboard fallback was needed.

---

### Task 3: Calculation module (pure functions)

**Files:**
- Modify: `index.html` — insert after `getBmrInfo()` (currently ends around line 2943, right before `getExerciseCalories`)

**Depends on:** none — pure functions, no DB/DOM access.

- [ ] **Step 1: Insert the module**

Find this exact block:

```js
  return { bmr: calcBmr(profile, weightRow), weightKg: weightRow.weight_kg, missingProfile: false, missingWeight: false };
}

async function getExerciseCalories(fromIso, toIso) {
```

Replace with:

```js
  return { bmr: calcBmr(profile, weightRow), weightKg: weightRow.weight_kg, missingProfile: false, missingWeight: false };
}

/* ═══════════════════════════════════════════════════════════════
   PAINONPUDOTUSENNUSTE — kaksiosastomalli
═══════════════════════════════════════════════════════════════ */
const KCAL_PER_KG_FAT_RESTING = 4.5;
const KCAL_PER_KG_MUSCLE_RESTING = 13.0;
const KCAL_PER_KG_FAT_LOSS = 7700;
const DEFAULT_OTHER_TISSUE_COEFF = 30;
const DEFAULT_ACTIVITY_MULT = 1.5;

function getBodyComposition(weightKg, fatPct, musclePct) {
  const fatKg = weightKg * fatPct / 100;
  const muscleKg = weightKg * musclePct / 100;
  const otherKg = weightKg - fatKg - muscleKg;
  return { fatKg, muscleKg, otherKg };
}

function calculateMaintenance(fatKg, muscleKg, otherKg, otherTissueCoeff, activityMult) {
  const bmr = fatKg * KCAL_PER_KG_FAT_RESTING + muscleKg * KCAL_PER_KG_MUSCLE_RESTING + otherKg * otherTissueCoeff;
  return bmr * activityMult;
}

function simulateToTarget({ fatKg, muscleKg, otherKg, targetWeightKg, weeklyIntakeKcal, otherTissueCoeff, activityMult, muscleChangeKgPerWeek = 0, maxWeeks = 150 }) {
  const rows = [];
  let week = 0;
  let fat = fatKg, muscle = muscleKg;
  while ((fat + muscle + otherKg) > targetWeightKg && week < maxWeeks) {
    week++;
    const maintenanceDaily = calculateMaintenance(fat, muscle, otherKg, otherTissueCoeff, activityMult);
    const maintenanceWeekly = maintenanceDaily * 7;
    const deficit = maintenanceWeekly - weeklyIntakeKcal;
    muscle += muscleChangeKgPerWeek;
    const fatLoss = deficit / KCAL_PER_KG_FAT_LOSS;
    fat -= fatLoss;
    rows.push({ week, totalWeight: +(fat + muscle + otherKg).toFixed(1), fatKg: +fat.toFixed(1), muscleKg: +muscle.toFixed(1), weeklyDeficit: Math.round(deficit) });
  }
  return { weeksToTarget: week, rows };
}

async function getExerciseCalories(fromIso, toIso) {
```

- [ ] **Step 2: Verify the functions are syntactically correct and numerically match known-good output**

The three functions have zero external dependencies (no `sb`, no DOM), so they can be verified directly with `node`. Create a scratch test file — copy the exact same five constants and three functions from Step 1 into it (byte-identical to what you just inserted into `index.html`, so this genuinely tests your inserted logic, not a hand-retyped variant):

```bash
cat > /tmp/verify_forecast_model.js << 'SCRIPT_EOF'
const KCAL_PER_KG_FAT_RESTING = 4.5;
const KCAL_PER_KG_MUSCLE_RESTING = 13.0;
const KCAL_PER_KG_FAT_LOSS = 7700;
const DEFAULT_OTHER_TISSUE_COEFF = 30;
const DEFAULT_ACTIVITY_MULT = 1.5;

function getBodyComposition(weightKg, fatPct, musclePct) {
  const fatKg = weightKg * fatPct / 100;
  const muscleKg = weightKg * musclePct / 100;
  const otherKg = weightKg - fatKg - muscleKg;
  return { fatKg, muscleKg, otherKg };
}

function calculateMaintenance(fatKg, muscleKg, otherKg, otherTissueCoeff, activityMult) {
  const bmr = fatKg * KCAL_PER_KG_FAT_RESTING + muscleKg * KCAL_PER_KG_MUSCLE_RESTING + otherKg * otherTissueCoeff;
  return bmr * activityMult;
}

function simulateToTarget({ fatKg, muscleKg, otherKg, targetWeightKg, weeklyIntakeKcal, otherTissueCoeff, activityMult, muscleChangeKgPerWeek = 0, maxWeeks = 150 }) {
  const rows = [];
  let week = 0;
  let fat = fatKg, muscle = muscleKg;
  while ((fat + muscle + otherKg) > targetWeightKg && week < maxWeeks) {
    week++;
    const maintenanceDaily = calculateMaintenance(fat, muscle, otherKg, otherTissueCoeff, activityMult);
    const maintenanceWeekly = maintenanceDaily * 7;
    const deficit = maintenanceWeekly - weeklyIntakeKcal;
    muscle += muscleChangeKgPerWeek;
    const fatLoss = deficit / KCAL_PER_KG_FAT_LOSS;
    fat -= fatLoss;
    rows.push({ week, totalWeight: +(fat + muscle + otherKg).toFixed(1), fatKg: +fat.toFixed(1), muscleKg: +muscle.toFixed(1), weeklyDeficit: Math.round(deficit) });
  }
  return { weeksToTarget: week, rows };
}

const comp = getBodyComposition(100, 30, 30);
console.assert(JSON.stringify(comp) === JSON.stringify({fatKg:30,muscleKg:30,otherKg:40}), 'FAIL comp: ' + JSON.stringify(comp));

const maint = calculateMaintenance(comp.fatKg, comp.muscleKg, comp.otherKg, 30, 1.5);
console.assert(maint === 2587.5, 'FAIL maint: ' + maint);

const sim = simulateToTarget({ fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg, targetWeightKg: 95, weeklyIntakeKcal: 15000, otherTissueCoeff: 30, activityMult: 1.5 });
console.assert(sim.weeksToTarget === 13, 'FAIL weeksToTarget: ' + sim.weeksToTarget);
console.assert(JSON.stringify(sim.rows[0]) === JSON.stringify({week:1,totalWeight:99.6,fatKg:29.6,muscleKg:30,weeklyDeficit:3113}), 'FAIL row1: ' + JSON.stringify(sim.rows[0]));

const sim2 = simulateToTarget({ fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg, targetWeightKg: 95, weeklyIntakeKcal: 25000, otherTissueCoeff: 30, activityMult: 1.5, maxWeeks: 10 });
console.assert(sim2.weeksToTarget === 10, 'FAIL non-convergence: ' + sim2.weeksToTarget);

console.log('ALL PASS');
SCRIPT_EOF
node /tmp/verify_forecast_model.js
```

Expected output: `ALL PASS` with no `FAIL` lines. (These exact expected values — `2587.5`, `13`, the row1 object, `10` — were independently computed and verified before writing this plan; if your output differs, the code has a bug, not the test.)

After running it, **diff the scratch file's five constants and three function bodies against what you actually inserted into `index.html` in Step 1** (e.g. `grep -A2 "^const KCAL_PER_KG_FAT_RESTING" index.html` and eyeball it against the scratch file) to confirm they're truly identical — this test only proves the logic is correct in isolation, not that it was transcribed correctly into the real file. Delete `/tmp/verify_forecast_model.js` once done; it's scratch, not part of the codebase.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: painonpudotusennusteen laskentamoduuli (kaksiosastomalli)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of an 8-task plan. These three pure functions (plus five constants) implement the two-compartment fat/muscle metabolic model from the design spec — fat and muscle tissue have different resting metabolic costs per kg, plus an "other tissue" catch-all coefficient and an activity multiplier, both of which get calibrated from real data in a later task (Task 4). This task only adds the math — nothing calls these functions yet.

Full spec: `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`.

## Before You Begin

If the exact insertion block doesn't match what you find, or anything is unclear, ask now.

## Your Job

1. Insert exactly the module specified
2. Run the verification test script and confirm `ALL PASS`
3. Commit with the exact message shown
4. Self-review (see below)
5. Report back

**If the test script shows any FAIL line:** do not proceed to commit. Re-read your inserted code against the exact spec above, character by character — a `FAIL` means a typo was introduced during insertion, not that the expected values are wrong (they were independently verified via `node` before this plan was written).

## Before Reporting Back: Self-Review

- Did the exact test script produce `ALL PASS`?
- Did you insert only this module, touching nothing else in the file?
- Do all five new top-level names (`KCAL_PER_KG_FAT_RESTING`, `KCAL_PER_KG_MUSCLE_RESTING`, `KCAL_PER_KG_FAT_LOSS`, `DEFAULT_OTHER_TISSUE_COEFF`, `DEFAULT_ACTIVITY_MULT`, plus the three function names) not collide with any existing identifier in the file? (Grep for each one — should be exactly 1 match, the new declaration itself, before your insertion; confirm no pre-existing conflicting declaration.)

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output (paste the full node test output, must show ALL PASS)
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 4: Calibration + recent-intake helper, wired into save

**Files:**
- Modify: `index.html` — add two new functions, then wire one into `saveBodyMetrics()`

**Depends on:** Task 3 (uses `getBodyComposition`, `KCAL_PER_KG_FAT_LOSS`, `DEFAULT_ACTIVITY_MULT`, `KCAL_PER_KG_FAT_RESTING`, `KCAL_PER_KG_MUSCLE_RESTING`). Execution against a live database additionally needs Task 2, but the code itself can be written and committed independently.

- [ ] **Step 1: Add `getRecentAvgWeeklyIntake()` and `calibrateModelIfDue()`**

Find this exact block (the end of `simulateToTarget()`, right before `getExerciseCalories`):

```js
  return { weeksToTarget: week, rows };
}

async function getExerciseCalories(fromIso, toIso) {
```

Replace with:

```js
  return { weeksToTarget: week, rows };
}

async function getRecentAvgWeeklyIntake() {
  const to = localIso(new Date());
  const from = localIso(addDays(new Date(), -20));
  const totalKcal = await getFoodCalories(from, to);
  return totalKcal / 3;
}

async function calibrateModelIfDue() {
  const { data: measurements } = await sb.from('body_metrics').select('*')
    .order('measured_at', { ascending: true });
  if (!measurements || measurements.length < 3) return;

  const { data: lastCal } = await sb.from('model_calibration').select('calibrated_at')
    .order('calibrated_at', { ascending: false }).limit(1).maybeSingle();
  if (lastCal) {
    const daysSince = (Date.now() - new Date(lastCal.calibrated_at)) / 86400000;
    if (daysSince < 14) return;
  }

  const m1 = measurements[measurements.length - 2];
  const m2 = measurements[measurements.length - 1];
  if (m1.fat_pct == null || m1.muscle_pct == null || m2.fat_pct == null || m2.muscle_pct == null) return;

  const comp1 = getBodyComposition(m1.weight_kg, m1.fat_pct, m1.muscle_pct);
  const comp2 = getBodyComposition(m2.weight_kg, m2.fat_pct, m2.muscle_pct);
  const actualFatLossKg = comp1.fatKg - comp2.fatKg;
  const actualFatLossKcal = actualFatLossKg * KCAL_PER_KG_FAT_LOSS;

  const weeksBetween = (new Date(m2.measured_at) - new Date(m1.measured_at)) / 86400000 / 7;
  if (weeksBetween <= 0) return;
  const totalIntakeKcal = await getFoodCalories(m1.measured_at, m2.measured_at);

  const actualDailyExpenditure = (totalIntakeKcal + actualFatLossKcal) / (weeksBetween * 7);
  const avgFat = (comp1.fatKg + comp2.fatKg) / 2;
  const avgMuscle = (comp1.muscleKg + comp2.muscleKg) / 2;
  const avgOther = (comp1.otherKg + comp2.otherKg) / 2;
  const bmrImplied = actualDailyExpenditure / DEFAULT_ACTIVITY_MULT;
  const otherContribution = bmrImplied - (avgFat * KCAL_PER_KG_FAT_RESTING) - (avgMuscle * KCAL_PER_KG_MUSCLE_RESTING);
  const newCoeff = otherContribution / avgOther;
  if (!isFinite(newCoeff) || newCoeff <= 0) return;

  await sbWrite({
    table: 'model_calibration',
    op: 'insert',
    payload: { other_tissue_kcal_per_kg: newCoeff, activity_multiplier: DEFAULT_ACTIVITY_MULT, sample_weeks: weeksBetween },
  });
}

async function getExerciseCalories(fromIso, toIso) {
```

**Note for the implementer — guards beyond the spec's pseudocode:** the spec's calibration formula (§2.1) doesn't show null-checks or a sanity check on the result, but `body_metrics.fat_pct`/`muscle_pct` are genuinely nullable in this app (confirmed by reading `saveBodyMetrics()` — weight/fat/muscle are each independently optional), so a real pair of "the two most recent measurements" could be missing one. The `if (m1.fat_pct == null || ...) return;` guard and the final `if (!isFinite(newCoeff) || newCoeff <= 0) return;` guard are intentional additions to prevent writing garbage (`NaN`, negative, or infinite) calibration data — not scope creep, just defending the one real external-data boundary this function touches. Keep both.

- [ ] **Step 2: Wire calibration into the save flow**

Find this exact block inside `saveBodyMetrics()`:

```js
    if (error) { showStatus('body-status','Virhe: '+error.message,true); return; }
    showStatus('body-status','Tallennettu!',false);
    loadBodyMetrics();
```

Replace with:

```js
    if (error) { showStatus('body-status','Virhe: '+error.message,true); return; }
    showStatus('body-status','Tallennettu!',false);
    calibrateModelIfDue();
    loadBodyMetrics();
```

`calibrateModelIfDue()` is intentionally NOT awaited here — it's a fire-and-forget background update (same pattern as other non-blocking follow-up calls elsewhere in this file), so a slow/failed calibration attempt never delays the UI feedback the user is waiting for.

- [ ] **Step 3: Verify the edits**

```bash
grep -n "async function getRecentAvgWeeklyIntake\|async function calibrateModelIfDue" index.html
grep -n "calibrateModelIfDue();" index.html
```

Expected: first grep shows 2 matches (the two function definitions). Second grep shows exactly 1 match (the call site inside `saveBodyMetrics()`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: mallin automaattikalibrointi mittauksen tallennuksen yhteydessä

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of an 8-task plan. `getFoodCalories(fromIso, toIso)` and `sbWrite(...)` already exist elsewhere in this file (used throughout the app for aggregate calorie sums and Supabase writes respectively) — don't redefine them. `addDays(date, n)` also already exists (used elsewhere for chart date ranges). Calibration only runs once ≥3 total measurements exist (per the design doc's stated trigger, even though the actual math only uses the 2 most recent) and at most once every 14 days.

Full spec: `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`.

## Before You Begin

If any referenced helper (`getFoodCalories`, `sbWrite`, `addDays`) doesn't actually exist in the file with the assumed signature, or the exact insertion blocks don't match, ask now rather than guessing.

## Your Job

1. Insert both functions and wire the one call site, exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Are `getFoodCalories`, `sbWrite`, `addDays` all confirmed to already exist in this file (grep, don't assume)?
- Is `calibrateModelIfDue()` called without `await` at its one call site, as specified (fire-and-forget)?
- Do the two null/sanity guards noted above survive in your inserted code exactly as shown?

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output (paste the grep results)
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 5: Target weight field in the Profiili modal

**Files:**
- Modify: `index.html` — `openProfileModal()` (currently around line 5076-5129)

**Depends on:** none functionally (writes a column that exists once Tasks 1-2 land; safe to implement independently).

- [ ] **Step 1: Add the field to the modal markup**

Find this exact line:

```js
    <div class="form-row"><label>Syntymäaika</label><input type="date" id="profile-birthdate" value="${profile.birth_date ?? ''}"></div>
    <button class="btn btn-primary" id="profile-settings-save-btn">Tallenna</button>
```

Replace with:

```js
    <div class="form-row"><label>Syntymäaika</label><input type="date" id="profile-birthdate" value="${profile.birth_date ?? ''}"></div>
    <div class="form-row"><label>Tavoitepaino (kg)</label><input type="text" inputmode="decimal" id="profile-target-weight" value="${profile.target_weight_kg ?? ''}"></div>
    <button class="btn btn-primary" id="profile-settings-save-btn">Tallenna</button>
```

- [ ] **Step 2: Include it in the save payload**

Find this exact block:

```js
    const sex = document.getElementById('profile-sex').value;
    const height = parseNum('profile-height');
    const birthDate = document.getElementById('profile-birthdate').value;
```

Replace with:

```js
    const sex = document.getElementById('profile-sex').value;
    const height = parseNum('profile-height');
    const birthDate = document.getElementById('profile-birthdate').value;
    const targetWeight = parseNum('profile-target-weight');
```

Then find this exact line:

```js
      payload: { id: 1, sex, height_cm: height, birth_date: birthDate, updated_at: new Date().toISOString() },
```

Replace with:

```js
      payload: { id: 1, sex, height_cm: height, birth_date: birthDate, target_weight_kg: targetWeight, updated_at: new Date().toISOString() },
```

**Note:** unlike sex/height/birthdate, `target_weight_kg` is optional — no validation is added for it (blank is allowed and saves as `null` via `parseNum`, which already returns `null` for an empty input; confirm this by reading `parseNum`'s definition elsewhere in the file, don't assume).

- [ ] **Step 3: Verify the edits**

```bash
grep -n "profile-target-weight\|target_weight_kg" index.html
```

Expected: 3 matches — the input field, the `parseNum(...)` read, and the payload key.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: tavoitepaino profiiliasetuksiin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 5 of an 8-task plan. `openProfileModal()` already exists and already saves sex/height/birthdate to the `user_profile` singleton table the same way — this task adds one more optional field to that same form and payload, following the exact existing pattern.

Full spec: `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`.

## Before You Begin

If the exact blocks don't match what you find, or `parseNum` doesn't behave as described, ask now.

## Your Job

1. Make exactly the two edits specified
2. Verify with the exact grep command
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `parseNum(id)` (grep its definition) returns `null` for an empty/blank input, not `NaN` or `0` — this determines whether a blank target-weight field correctly saves as `null`.
- Did you leave the sex/height/birthdate validation logic completely untouched?

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 6: Forecast text + chart overlay on the Keho "Kehitys" card

**Files:**
- Modify: `index.html` — the "Kehitys" card markup (add a text element) and `loadBodyMetrics()` (compute + render the forecast)

**Depends on:** Task 3 (calculation functions), Task 5 (`target_weight_kg` field exists to read). Full end-to-end behavior additionally needs Tasks 1-2, 4 live, but this task's own code can be written independently.

- [ ] **Step 1: Add a forecast text element to the Kehitys card**

Find this exact block:

```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
```

Replace with:

```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
      <div id="m-forecast" class="kc-week-budget-sub" style="margin-top:10px;"></div>
    </div>
```

(`.kc-week-budget-sub` already exists — added earlier for the weekly calorie budget feature — and is exactly the muted small-text style wanted here; reused, not redefined.)

- [ ] **Step 2: Replace `loadBodyMetrics()` in full**

Find this exact function:

```js
async function loadBodyMetrics() {
  const { data: hist, error: histErr } = await sb.from('body_metrics').select('*')
    .order('measured_at', { ascending: false }).limit(20);
  if (histErr) { console.error('loadBodyMetrics failed:', histErr.message); }
  const latest = hist && hist[0];

  const deltaEl = document.getElementById('m-weight-delta');
  if (deltaEl) deltaEl.textContent = '';
  if (latest) {
    document.getElementById('m-weight').textContent = latest.weight_kg  ? `${latest.weight_kg} kg` : '—';
    document.getElementById('m-fat')   .textContent = latest.fat_pct    ? `${latest.fat_pct}%`     : '—';
    document.getElementById('m-muscle').textContent = latest.muscle_pct ? `${latest.muscle_pct}%`  : '—';
  }

  if (hist && hist.length > 1) {
    if (charts.body) charts.body.destroy();
    charts.body = new Chart(document.getElementById('body-chart'), {
      type: 'line',
      data: {
        labels: [...hist].reverse().map(d => d.measured_at.slice(5)),
        datasets: [
          { label:'Paino',  data:[...hist].reverse().map(d=>d.weight_kg),  borderColor:'#1D9E75', borderWidth:2, pointRadius:3, pointBackgroundColor:'#1D9E75', tension:.3, fill:false, yAxisID:'y1' },
          { label:'Rasva%', data:[...hist].reverse().map(d=>d.fat_pct),    borderColor:'#378ADD', borderWidth:2, pointRadius:3, pointBackgroundColor:'#378ADD', tension:.3, fill:false, yAxisID:'y2' },
          { label:'Lihas%', data:[...hist].reverse().map(d=>d.muscle_pct), borderColor:'#EF9F27', borderWidth:2, pointRadius:3, pointBackgroundColor:'#EF9F27', tension:.3, fill:false, yAxisID:'y2' },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          y1:{ position:'left',  ticks:{ color:'#555', font:{size:10} }, grid:{ color:'#222' } },
          y2:{ position:'right', ticks:{ color:'#555', font:{size:10}, callback:v=>v+'%' }, grid:{ display:false } },
          x: { ticks:{ color:'#555', font:{size:10} }, grid:{ display:false } },
        },
      },
    });
    if (deltaEl && hist.length >= 2 && latest && latest.weight_kg && hist[1] && hist[1].weight_kg) {
      const d = Math.round((latest.weight_kg - hist[1].weight_kg) * 10) / 10;
      deltaEl.textContent = (d >= 0 ? '+' : '') + d + ' kg ed. mittauksesta';
    }
  }
}
```

Replace with:

```js
async function loadBodyMetrics() {
  const { data: hist, error: histErr } = await sb.from('body_metrics').select('*')
    .order('measured_at', { ascending: false }).limit(20);
  if (histErr) { console.error('loadBodyMetrics failed:', histErr.message); }
  const latest = hist && hist[0];

  const deltaEl = document.getElementById('m-weight-delta');
  if (deltaEl) deltaEl.textContent = '';
  if (latest) {
    document.getElementById('m-weight').textContent = latest.weight_kg  ? `${latest.weight_kg} kg` : '—';
    document.getElementById('m-fat')   .textContent = latest.fat_pct    ? `${latest.fat_pct}%`     : '—';
    document.getElementById('m-muscle').textContent = latest.muscle_pct ? `${latest.muscle_pct}%`  : '—';
  }

  const forecastEl = document.getElementById('m-forecast');
  let forecast = null;
  if (forecastEl) {
    const profile = await loadUserProfile();
    if (!profile || profile.target_weight_kg == null) {
      forecastEl.innerHTML = `Aseta tavoitepaino <a href="#" onclick="openProfileModal();return false;" style="color:var(--accent)">profiilissa</a> nähdäksesi ennusteen`;
    } else if (!latest || latest.fat_pct == null || latest.muscle_pct == null) {
      forecastEl.textContent = 'Kirjaa paino, rasva% ja lihas% nähdäksesi ennusteen';
    } else {
      const comp = getBodyComposition(latest.weight_kg, latest.fat_pct, latest.muscle_pct);
      const { data: calRows } = await sb.from('model_calibration').select('*')
        .order('calibrated_at', { ascending: false }).limit(1);
      const cal = calRows && calRows[0];
      const otherTissueCoeff = cal ? cal.other_tissue_kcal_per_kg : DEFAULT_OTHER_TISSUE_COEFF;
      const activityMult = cal ? cal.activity_multiplier : DEFAULT_ACTIVITY_MULT;
      const weeklyIntakeKcal = await getRecentAvgWeeklyIntake();

      forecast = simulateToTarget({
        fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg,
        targetWeightKg: profile.target_weight_kg,
        weeklyIntakeKcal, otherTissueCoeff, activityMult,
      });

      const calStr = cal
        ? `Malli kalibroitu ${new Date(cal.calibrated_at).toLocaleDateString('fi-FI')}`
        : 'Ei vielä kalibroitu — käytetään oletusarvoja';

      if (forecast.weeksToTarget >= 150) {
        forecastEl.textContent = `Nykyisellä syömistahdilla tavoitetta ei saavuteta ennustejaksolla · ${calStr}`;
      } else {
        const etaDate = new Date();
        etaDate.setDate(etaDate.getDate() + forecast.weeksToTarget * 7);
        const etaStr = etaDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
        forecastEl.textContent = `Ennuste: ${forecast.weeksToTarget} viikkoa (${etaStr}) · ${calStr}`;
      }
    }
  }

  if (hist && hist.length > 1) {
    if (charts.body) charts.body.destroy();
    const histLabels = [...hist].reverse().map(d => d.measured_at.slice(5));
    const histWeights = [...hist].reverse().map(d => d.weight_kg);
    const histFat = [...hist].reverse().map(d => d.fat_pct);
    const histMuscle = [...hist].reverse().map(d => d.muscle_pct);

    let labels = histLabels, weightData = histWeights, fatData = histFat, muscleData = histMuscle, forecastData = null;
    if (forecast && forecast.rows.length) {
      const lastDate = new Date(latest.measured_at);
      const forecastLabels = forecast.rows.map(r => {
        const d = new Date(lastDate);
        d.setDate(lastDate.getDate() + r.week * 7);
        return localIso(d).slice(5);
      });
      labels = [...histLabels, ...forecastLabels];
      weightData = [...histWeights, ...forecastLabels.map(() => null)];
      fatData = [...histFat, ...forecastLabels.map(() => null)];
      muscleData = [...histMuscle, ...forecastLabels.map(() => null)];
      forecastData = [
        ...histWeights.slice(0, -1).map(() => null),
        histWeights[histWeights.length - 1],
        ...forecast.rows.map(r => r.totalWeight),
      ];
    }

    const datasets = [
      { label:'Paino',  data: weightData, borderColor:'#1D9E75', borderWidth:2, pointRadius:3, pointBackgroundColor:'#1D9E75', tension:.3, fill:false, yAxisID:'y1' },
      { label:'Rasva%', data: fatData,    borderColor:'#378ADD', borderWidth:2, pointRadius:3, pointBackgroundColor:'#378ADD', tension:.3, fill:false, yAxisID:'y2' },
      { label:'Lihas%', data: muscleData, borderColor:'#EF9F27', borderWidth:2, pointRadius:3, pointBackgroundColor:'#EF9F27', tension:.3, fill:false, yAxisID:'y2' },
    ];
    if (forecastData) {
      datasets.push({ label:'Ennuste', data: forecastData, borderColor:'#1D9E75', borderDash:[5,5], borderWidth:2, pointRadius:0, tension:.3, fill:false, yAxisID:'y1' });
    }

    charts.body = new Chart(document.getElementById('body-chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          y1:{ position:'left',  ticks:{ color:'#555', font:{size:10} }, grid:{ color:'#222' } },
          y2:{ position:'right', ticks:{ color:'#555', font:{size:10}, callback:v=>v+'%' }, grid:{ display:false } },
          x: { ticks:{ color:'#555', font:{size:10} }, grid:{ display:false } },
        },
      },
    });
    if (deltaEl && hist.length >= 2 && latest && latest.weight_kg && hist[1] && hist[1].weight_kg) {
      const d = Math.round((latest.weight_kg - hist[1].weight_kg) * 10) / 10;
      deltaEl.textContent = (d >= 0 ? '+' : '') + d + ' kg ed. mittauksesta';
    }
  }
}
```

**Key details for the implementer:**
- `forecastData`'s first non-null entry is deliberately the LAST historical weight value (`histWeights[histWeights.length - 1]`), at the same array index as the last historical label — this makes the dashed forecast line visually start exactly where the solid weight line ends, rather than leaving a gap. Get this index alignment right: `forecastData` must be the same total length as `labels` (`histLabels.length + forecastLabels.length`), with the "connecting" value at index `histLabels.length - 1`.
- The `Rasva%`/`Lihas%`/`Paino` datasets get `null`-padded for the forecast date range (via `forecastLabels.map(() => null)`) so those lines simply stop at the last real data point instead of projecting anything — only the new `Ennuste` dataset extends into the future.
- If `hist.length <= 1` (0 or 1 measurements total), the whole chart block is skipped exactly as before this change — the forecast text above it still renders independently (it only needs 1 measurement with fat%/muscle%, not 2).

- [ ] **Step 3: Verify the edits**

```bash
grep -n 'id="m-forecast"' index.html
grep -n "forecastData\|getRecentAvgWeeklyIntake()" index.html
```

Expected: first grep shows 1 match. Second grep shows several matches, all inside `loadBodyMetrics()`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: painonpudotusennuste Kehitys-kaavioon ja -tekstiin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 6 of an 8-task plan — the UI integration task that ties together the calculation module (Task 3), the calibration data (Task 4), and the target weight (Task 5) into the actual visible feature. `loadUserProfile()`, `localIso()`, `charts` (the global chart-instance cache object), and `Chart` (Chart.js, already a script dependency of this page) all already exist — don't redefine them.

Full spec: `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`.

## Before You Begin

If the exact function body you find doesn't match what's shown above (e.g. it's drifted since this plan was written), stop and report NEEDS_CONTEXT with a diff of what you actually found — do not attempt to merge your changes into an unexpected version by guessing.

## Your Job

1. Make both edits (HTML element + full function replacement) exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Walk through the `forecastData` array construction by hand for a concrete example (e.g. 3 historical points + a 2-week forecast) and confirm the array lengths and the "connecting point" index actually line up with `labels`'s length — an off-by-one here would either crash Chart.js or draw a broken/disconnected forecast line.
- Confirm the three "no forecast" states (`target_weight_kg == null`, missing fat%/muscle% on the latest measurement, `weeksToTarget >= 150`) each produce sensible, non-crashing text — trace through each branch by hand.
- Confirm `Rasva%`/`Lihas%` datasets are correctly null-padded to the same combined length as `Paino`/`Ennuste` when a forecast exists (Chart.js requires all datasets in one chart to align against the same `labels` array by index).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — especially the array-length hand-trace
- Any issues or concerns

---

### Task 7: Full manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data (Tasks 1-2 must be complete). If the Chrome extension isn't connecting, don't retry endlessly — ask the user how to proceed (same fallback used for prior features in this project).

- [ ] **Step 1: Serve the app locally**

Run in the background:

```bash
python3 -m http.server 8941
```

- [ ] **Step 2: Open it in Chrome, resize to phone viewport (430x932)**

- [ ] **Step 3: Verify the "no target set" state**

Go to Keho. Confirm the forecast text shows the "Aseta tavoitepaino profiilissa" prompt, and that its embedded link opens the Profiili modal.

- [ ] **Step 4: Set a target weight and verify the forecast**

In Profiili, set a target weight below the current logged weight, save. Return to Keho — confirm the forecast text now shows either a "Ennuste: N viikkoa (date)" line or, if the latest measurement is missing fat%/muscle%, the "Kirjaa paino, rasva% ja lihas%" prompt instead. If a forecast renders, sanity-check the number isn't obviously wrong (not negative, not absurdly small like 0 weeks unless already at target).

- [ ] **Step 5: Verify the chart overlay**

If there are ≥2 historical measurements and a forecast rendered, confirm a dashed line appears on the chart continuing from the last solid data point toward the future. Zoom in on the transition point and confirm there's no visible gap or overlap glitch.

- [ ] **Step 6: Verify calibration wiring (best-effort)**

Check via `curl` (same pattern as Task 2) whether `model_calibration` has any rows if there happen to already be ≥3 real measurements in the account. If there are, and it's been ≥14 days conceptually (can't easily fake this live), this is a soft check — don't force-create fake calibration data just to test this path. If real calibration data appears after a natural save during this session, confirm the forecast text's "Malli kalibroitu {date}" line updates to reflect it (vs. the "Ei vielä kalibroitu" default text) after a subsequent Keho page reload.

- [ ] **Step 7: Check the browser console for errors**

Use `read_console_messages` — expected: no new JS errors.

- [ ] **Step 8: Clean up**

Stop the local server, close the browser tab.

- [ ] **Step 9: Report result**

Summarize what was verified (or any issue found and how it was fixed). No commit needed.

---

### Task 8: Final code review

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer for the entire diff** (Tasks 1, 3, 4, 5, 6) covering: spec/design-doc fidelity, that the calculation module's `node`-verified numbers still hold at the final commit (re-run Task 3's test script against the final state), that the calibration guards are present, and that the chart-overlay array-length logic is correct (re-verify Task 6's self-review hand-trace independently).

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** Data model (§1) → Tasks 1-2. Calculation module (§2) → Task 3. Calibration (§2.1) → Task 4. Forecast input data (§3, recent-avg intake) → Task 4 (`getRecentAvgWeeklyIntake`). UI (§4, chart + text + Profiili field) → Tasks 5-6. All of §5's exclusions (no confidence range, no manual intake input, no muscle-change calibration, no multi-point regression, no calibration-history browser, no change to `calcBmr`/`getBmrInfo`) are respected — no task adds any of them.
- **Type/name consistency:** `getBodyComposition`, `calculateMaintenance`, `simulateToTarget`, and all five constants (Task 3) are referenced identically in Task 4 (calibration) and Task 6 (forecast rendering) — same names, same signatures, no drift.
- **No placeholders:** every step shows exact before/after code, exact commands, and — for Task 3 specifically — exact, independently-precomputed numeric expected values (not vague assertions).
