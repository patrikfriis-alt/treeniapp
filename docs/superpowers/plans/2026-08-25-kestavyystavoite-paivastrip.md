# Kestävyystavoitteen viikon päivä-strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7-day activity indicator strip to the "Kestävyystavoitteet" card on the Aerobia page, with a click-through modal listing that day's logged activities — the final item of the Sulamo comparison backlog.

**Architecture:** No database changes — `activity_data` already has everything needed (`activity_date`, `activity_type`, `distance_km`, `duration_min`). `loadActivityGoalProgress()` is extended to keep the raw per-day rows it currently discards after reducing to weekly totals, and to return the week's Monday date so the render function can build the day loop without recomputing it. `renderAerobiaGoalCard()` builds one shared day-strip (not one per goal type) below the existing goal rows, reusing the `.kc-week-daystrip`/`.kc-week-day` CSS already built for the weekly-kcal-budget feature. A day cell with logged activity is clickable and opens a detail modal via the existing generic `openMetricModal()` helper, following the exact title/row patterns already established by `openDayBudgetModal()` and `openWeeklyActivityModal()`.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-25-kestavyystavoite-paivastrip-design.md`

---

### Task 1: Extend `loadActivityGoalProgress()` to keep per-day data

**Files:**
- Modify: `index.html` — `loadActivityGoalProgress()` (line ~3675), global state near `activityGoals` (line ~6287)

**Depends on:** none.

- [ ] **Step 1: Add a global to hold the current week's raw activity rows**

Find this exact block:

```js
let activityGoals = null;

async function loadActivityGoals() {
```

Replace with:

```js
let activityGoals = null;
let activityGoalWeekRows = [];

async function loadActivityGoals() {
```

- [ ] **Step 2: Extend the query and return shape**

Find this exact block:

```js
async function loadActivityGoalProgress(offset = wOff) {
  if (!activityGoals) activityGoals = await loadActivityGoals();
  const mon = wStart(offset);
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
```

Replace with:

```js
async function loadActivityGoalProgress(offset = wOff) {
  if (!activityGoals) activityGoals = await loadActivityGoals();
  const mon = wStart(offset);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const from = mon.iso, to = localIso(sun);

  const { data, error } = await sb.from('activity_data')
    .select('id,activity_date,activity_type,distance_km,duration_min')
    .gte('activity_date', from).lte('activity_date', to);
  if (error) { console.error('loadActivityGoalProgress failed:', error.message); return null; }

  const rows = data || [];
  const totalKm = rows.reduce((s, r) => s + (r.distance_km || 0), 0);
  const sessionCount = rows.length;
  const paced = rows.filter(r => r.distance_km && r.duration_min);
  const totalPaceKm = paced.reduce((s, r) => s + r.distance_km, 0);
  const totalPaceMin = paced.reduce((s, r) => s + r.duration_min, 0);
  const avgPace = totalPaceKm > 0 ? totalPaceMin / totalPaceKm : null;

  return { goals: activityGoals, totalKm, sessionCount, avgPace, rows, monDate: mon.date };
}
```

Note: `rows` here is now the raw per-day `activity_data` rows (renamed from being an intermediate-only variable to a returned field) — the existing `totalKm`/`sessionCount`/`avgPace` reductions are completely unchanged, this is purely additive to the return value. `monDate` is the `Date` object for the Monday of the queried week — Task 2 needs this to build the 7-day loop without calling `wStart()` a second time.

- [ ] **Step 3: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_aerobia_check1.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_aerobia_check1.js
grep -n "let activityGoalWeekRows = \[\];" index.html
grep -n "select('id,activity_date,activity_type,distance_km,duration_min')" index.html
grep -n "return { goals: activityGoals, totalKm, sessionCount, avgPace, rows, monDate: mon.date };" index.html
```

Expected: `node --check` produces no output; 1 match each for the three greps.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: säilytä liikuntatavoitteen viikon raakadata päivittäistä käyttöä varten

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of 3. `wStart()`, `localIso()`, `sb`, `wOff` are all pre-existing. Nothing calling `loadActivityGoalProgress()` needs to change in this task — the two existing call sites (`renderAerobiaGoalCard()` and the Koonti dashboard's aerobia tile, index.html:7268) both destructure only the fields they already used (`goals`/`totalKm`/`sessionCount`/`avgPace`), so adding two more fields to the return object doesn't affect them. Task 2 is the one that actually starts using `rows`/`monDate`.

Full spec: `docs/superpowers/specs/2026-08-25-kestavyystavoite-paivastrip-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the Koonti dashboard's aerobia tile (index.html:7268, `const activityProgress = await loadActivityGoalProgress(0);`) still works unchanged — it destructures `activityProgress.goals`/`.totalKm`/`.sessionCount` only, never `.rows`/`.monDate`, so it's unaffected by this change. Just confirm you didn't accidentally touch that call site.
- Confirm the existing `totalKm`/`sessionCount`/`avgPace` calculations are byte-for-byte unchanged — only the `.select()` column list and the final `return` statement should differ from the original.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 2: Day-strip rendering and click-through modal

**Files:**
- Modify: `index.html` — `renderAerobiaGoalCard()` (line ~3704), new `openActivityDayModal()` function (near `openDayBudgetModal()`, line ~6515)

**Depends on:** Task 1 (needs `rows`/`monDate` on the `loadActivityGoalProgress()` return value, and the `activityGoalWeekRows` global).

- [ ] **Step 1: Rewrite `renderAerobiaGoalCard()`**

Find this exact block:

```js
async function renderAerobiaGoalCard() {
  const progress = await loadActivityGoalProgress(0);
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

Replace with:

```js
async function renderAerobiaGoalCard() {
  const progress = await loadActivityGoalProgress(0);
  const card = document.getElementById('aerobia-goal-card');
  const content = document.getElementById('aerobia-goal-content');
  if (!progress || !progress.goals) { card.style.display = 'none'; return; }
  const { goals, totalKm, sessionCount, avgPace, rows, monDate } = progress;
  const goalRows = [];
  if (goals.weekly_km != null) {
    goalRows.push(`<div class="hist-item"><div class="hist-label">Kilometrit</div><div class="hist-val">${totalKm.toFixed(1)} / ${goals.weekly_km} km</div></div>`);
  }
  if (goals.weekly_sessions != null) {
    goalRows.push(`<div class="hist-item"><div class="hist-label">Kerrat</div><div class="hist-val">${sessionCount} / ${goals.weekly_sessions}</div></div>`);
  }
  if (goals.target_pace_min_per_km != null) {
    const targetStr = formatPaceMinPerKm(goals.target_pace_min_per_km);
    const avgStr = avgPace != null ? formatPaceMinPerKm(avgPace) : '—';
    goalRows.push(`<div class="hist-item"><div class="hist-label">Keskivauhti</div><div class="hist-val">${avgStr} / ${targetStr} min/km</div></div>`);
  }
  if (!goalRows.length) { card.style.display = 'none'; return; }

  activityGoalWeekRows = rows;
  const todayIso = localIso(new Date());
  const activeDates = new Set(rows.map(r => r.activity_date));
  const dayCells = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate);
    d.setDate(monDate.getDate() + i);
    const iso = localIso(d);
    let cls = '';
    let onclickAttr = '';
    if (iso <= todayIso && activeDates.has(iso)) {
      cls = ' under';
      onclickAttr = ` onclick="openActivityDayModal('${iso}')"`;
    }
    dayCells.push(`<div class="kc-week-day${cls}"${onclickAttr}>${DAYS[i][0]}</div>`);
  }
  const daystripHtml = `<div class="kc-week-daystrip">${dayCells.join('')}</div>`;

  content.innerHTML = goalRows.join('') + daystripHtml;
  card.style.display = '';
}
```

Note the local variable holding the goal-summary row strings was renamed from `rows` to `goalRows`, since `rows` is now the destructured raw activity-data array from `progress`. The `.under` class is reused purely for its green color here — this feature has no "over budget" concept, so `.over` is never used.

- [ ] **Step 2: Add `openActivityDayModal()`**

Find this exact block:

```js
function openDayBudgetModal(iso, eaten, fairShare, exKcal) {
```

Replace with:

```js
function openActivityDayModal(iso) {
  const dayRows = activityGoalWeekRows.filter(r => r.activity_date === iso);
  if (!dayRows.length) return;
  const dateObj = new Date(iso + 'T00:00:00');
  const title = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const body = dayRows.map(r => {
    const distStr = r.distance_km ? ` · ${r.distance_km} km` : '';
    return `<div class="metric-modal-row"><span>${escapeHtml(r.activity_type)}</span><span class="val">${r.duration_min ?? '—'} min${distStr}</span></div>`;
  }).join('');
  openMetricModal(title, body);
}

function openDayBudgetModal(iso, eaten, fairShare, exKcal) {
```

- [ ] **Step 3: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_aerobia_check2.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_aerobia_check2.js
grep -n "function openActivityDayModal" index.html
grep -n "activityGoalWeekRows = rows;" index.html
grep -n "onclick=\"openActivityDayModal" index.html
grep -n "const daystripHtml = \`<div class=\"kc-week-daystrip\">" index.html
```

Expected: `node --check` produces no output; 1 match each for the four greps.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: kestävyystavoitteen viikon päivä-strip ja päiväkohtainen modaali

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of 3, depends on Task 1. `escapeHtml()`, `openMetricModal()`, `DAYS` (`['Ma','Ti','Ke','To','Pe','La','Su']`), `.kc-week-daystrip`/`.kc-week-day`/`.kc-week-day.under`/`.metric-modal-row`/`.metric-modal-row .val` CSS are all pre-existing — don't redefine them.

Full spec: `docs/superpowers/specs/2026-08-25-kestavyystavoite-paivastrip-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace the day loop for a week where today is Wednesday and activity was logged Monday and Wednesday but not Tuesday: Monday cell → `iso <= todayIso` true, `activeDates.has(iso)` true → `.under` + clickable. Tuesday → `iso <= todayIso` true, `activeDates.has(iso)` false → no class, not clickable. Wednesday (today) → same as Monday, `.under` + clickable. Thursday through Sunday → `iso <= todayIso` false → no class, not clickable, regardless of `activeDates`.
- Confirm `openActivityDayModal(iso)` early-returns (no modal, no error) when called for a date with zero matching rows in `activityGoalWeekRows` — this shouldn't be reachable via the UI (only dates with an `onclick` attribute call it, and those are only assigned when `activeDates.has(iso)` is true), but confirm the guard exists as a defensive measure.
- Confirm `escapeHtml()` is applied to `r.activity_type` in the modal body — this field is free-text editable by the user (per `openEditActivityDialog()`'s custom-activity-type support), so it must be escaped, unlike the day labels/numbers elsewhere in this feature which don't need it.
- Confirm the Koonti dashboard's separate aerobia tile (index.html:7268-7291) was not touched by this task — it renders its own single-line summary + progress bar from the same `loadActivityGoalProgress()` call but has no day-strip per the spec's explicit scope (Aerobia page card only).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced week scenario
- Any issues or concerns

---

### Task 3: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Ensure at least one endurance goal is set** (open Valikko → Kestävyystavoitteet, set a weekly-km or weekly-sessions goal if none exists) — navigate to the Aerobia page, confirm the "Kestävyystavoitteet" card shows the day-strip below the existing goal rows.

- [ ] **Step 3: Log an activity for today** (if none already logged) via the Aerobia page's log form — confirm today's day cell turns green immediately after the card re-renders.

- [ ] **Step 4: Click today's green day cell** — confirm a modal opens with today's weekday name as the title and lists the activity (type, duration, distance if present).

- [ ] **Step 5: Click a gray (no-activity) day cell within the current week** — confirm nothing happens (no modal, no console error).

- [ ] **Step 6: If today isn't Sunday, confirm the remaining days of the week (tomorrow through Sunday) show no color and are not clickable.**

- [ ] **Step 7: Remove all endurance goals** (Kestävyystavoitteet settings, clear all three fields) — confirm the entire "Kestävyystavoitteet" card (goal rows + strip) disappears from the Aerobia page, matching its pre-existing behavior.

- [ ] **Step 8: Re-set a goal and log a second activity for the same day as an existing one** — click that day's cell, confirm the modal lists both activities, not just one.

- [ ] **Step 9: Check the Koonti dashboard's "Aktiivinen" tile** — confirm it's unchanged (single-line summary + one progress bar, no day-strip), per the spec's explicit scope.

- [ ] **Step 10: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 11: Clean up test data** — delete any test `activity_data` rows created during testing directly via the Supabase client in the browser console (query first to get exact ids, delete only those, being careful not to touch the user's real pre-existing data). Verify with a follow-up select that nothing test-related remains.

- [ ] **Step 12: Clean up** — stop the local server, close the tab.

- [ ] **Step 13: Dispatch a final code reviewer** for the combined diff across Tasks 1-2, covering: the `iso <= todayIso` future-day guard, the `activeDates.has(iso)` no-activity guard, the `escapeHtml()` usage on `activity_type`, and that the Koonti dashboard's aerobia tile genuinely wasn't touched.

- [ ] **Step 14: If issues are found, fix them and re-review until approved.**

- [ ] **Step 15: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (scope: Aerobia page card only, no Koonti change, no week nav) → respected throughout, Task 2's self-review explicitly checks the Koonti tile is untouched. §2 (shared single strip, color/click rules) → Task 2's `renderAerobiaGoalCard()` rewrite. §3 (data: extend the select, keep raw rows) → Task 1. §4 (click behavior: modal title/body format) → Task 2's `openActivityDayModal()`. §5 exclusions (no new CSS component, no per-goal-type strips, no week nav, no Koonti change) — respected, no new CSS added anywhere in this plan.
- **Type/name consistency:** `activityGoalWeekRows` (Task 1's global) is set and read with the identical name in Task 2. `progress.rows`/`progress.monDate` (Task 1's return fields) are destructured with the identical names in Task 2's `renderAerobiaGoalCard()`. `openActivityDayModal(iso)` is defined in Task 2 and its only call site (the `onclick` attribute built in the same task) passes a single ISO-string argument, matching the signature.
- **No placeholders:** exact before/after code throughout, exact commands, exact expected output; self-review sections include a concrete hand-traced weekly scenario rather than "verify it works."
