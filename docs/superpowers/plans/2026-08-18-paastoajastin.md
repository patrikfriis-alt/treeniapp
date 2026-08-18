# Paastoajastin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live "time since last real meal" indicator on the Ruoka page, plus a weekly fasting-time summary on Koonti (clickable, opens a day-by-day breakdown) — modeled directly on the already-shipped weekly-budget and day-popup patterns.

**Architecture:** No new database tables/columns — everything derives from the existing `food_log_entries.created_at`/`kcal` columns, treating entries under 10 kcal as non-fast-breaking. A live-ticking element on Ruoka (own `setInterval`, minute granularity), and a new clickable row on Koonti's weekly card reusing the `weekRow(..., rowOnclick)` mechanism and `openMetricModal()` helper already in place.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-18-paastoajastin-design.md`

---

### Task 1: Live fasting timer — HTML row + data helper

**Files:**
- Modify: `index.html:1364-1366` (Ruoka hero, add new row)
- Modify: `index.html` — insert `getLastRealFoodEntryAt()` after `loadFoodWeekKcal()`

- [ ] **Step 1: Add the Ruoka hero row**

Find this exact block:

```html
  <div class="food-week-row" id="food-week-row" style="display:none">
    <span>Viikko</span><span class="food-week-val"></span>
  </div>

  <div id="food-meals"></div>
```

Replace with:

```html
  <div class="food-week-row" id="food-week-row" style="display:none">
    <span>Viikko</span><span class="food-week-val"></span>
  </div>

  <div class="food-week-row">
    <span>Paasto</span><span class="food-week-val" id="food-fasting-val">—</span>
  </div>

  <div id="food-meals"></div>
```

(Reuses the existing `.food-week-row` class as-is — no new CSS. Unlike the "Viikko" row, this one has no `style="display:none"` toggle — it's always shown.)

- [ ] **Step 2: Add `getLastRealFoodEntryAt()`**

Find this exact block:

```js
async function loadFoodWeekKcal(mondayIso, sundayIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select('kcal')
    .gte('logged_at', mondayIso)
    .lte('logged_at', sundayIso);
  if (error) { console.error('loadFoodWeekKcal failed:', error.message); return 0; }
  return (data || []).reduce((sum, r) => sum + (r.kcal || 0), 0);
}

function changeFoodDay(dir) { foodDayOffset += dir; renderRuoka(); }
```

Replace with:

```js
async function loadFoodWeekKcal(mondayIso, sundayIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select('kcal')
    .gte('logged_at', mondayIso)
    .lte('logged_at', sundayIso);
  if (error) { console.error('loadFoodWeekKcal failed:', error.message); return 0; }
  return (data || []).reduce((sum, r) => sum + (r.kcal || 0), 0);
}

async function getLastRealFoodEntryAt() {
  const { data, error } = await sb.from('food_log_entries')
    .select('created_at')
    .gte('kcal', 10)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) { console.error('getLastRealFoodEntryAt failed:', error.message); return null; }
  return data && data[0] ? new Date(data[0].created_at) : null;
}

function formatFastingDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}min`;
}

function changeFoodDay(dir) { foodDayOffset += dir; renderRuoka(); }
```

`>= 10` matches the spec's "doesn't break the fast" threshold — entries under 10 kcal (coffee, tea, water) are invisible to this query.

- [ ] **Step 3: Verify**

```bash
grep -n 'id="food-fasting-val"' index.html
grep -n "async function getLastRealFoodEntryAt" index.html
grep -n "function formatFastingDuration" index.html
```

Expected: 1 match each.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: paaston perusdata — Ruoka-hero-rivi ja getLastRealFoodEntryAt()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 6-task plan. This task only adds the static row and the two data helpers — nothing calls them yet (that's Task 2). `sb`, `console.error` conventions match every other query function in this file.

Full spec: `docs/superpowers/specs/2026-08-18-paastoajastin-design.md`.

## Before You Begin

If either exact block doesn't match what you find, ask now.

## Your Job

1. Make both edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `getLastRealFoodEntryAt()` filters `kcal >= 10`, not `> 10` or some other threshold (spec says "under 10 kcal doesn't count," i.e. 10 itself DOES count as breaking the fast — the boundary matters).
- Confirm the new HTML row does NOT have `style="display:none"` (unlike the sibling "Viikko" row) — it should always render, since "time since last meal" is always a real answer (even if "—" for a brand-new account with zero food entries ever).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 2: Live fasting timer — render + wire into Ruoka

**Files:**
- Modify: `index.html` — insert `loadFastingTimer()`/`renderFastingTimer()` near `loadFoodDay()`, wire into `renderRuoka()`

**Depends on:** Task 1 (`getLastRealFoodEntryAt()`, `formatFastingDuration()`, and the `#food-fasting-val` element must exist).

- [ ] **Step 1: Add the ticking functions and wire `renderRuoka()`**

Find this exact block:

```js
async function renderRuoka() {
  document.getElementById('food-day-label').textContent = formatFoodDayLabel(foodDayOffset);
  await loadFoodDay();
}
```

Replace with:

```js
let _fastingInterval = null;
let _lastRealFoodAt = null;

async function loadFastingTimer() {
  _lastRealFoodAt = await getLastRealFoodEntryAt();
  renderFastingTimer();
  if (_fastingInterval) clearInterval(_fastingInterval);
  _fastingInterval = setInterval(renderFastingTimer, 60000);
}

function renderFastingTimer() {
  const el = document.getElementById('food-fasting-val');
  if (!el) return;
  if (!_lastRealFoodAt) { el.textContent = '—'; return; }
  el.textContent = formatFastingDuration(Date.now() - _lastRealFoodAt.getTime());
}

async function renderRuoka() {
  document.getElementById('food-day-label').textContent = formatFoodDayLabel(foodDayOffset);
  await loadFoodDay();
  loadFastingTimer();
}
```

`loadFastingTimer()` is intentionally not awaited at its `renderRuoka()` call site — it's independent of the day-scoped food data `renderRuoka()` is otherwise waiting on, so there's no reason to delay the rest of the page for it. `_fastingInterval`/`_lastRealFoodAt` are new module-level globals, following the same pattern as `_restInterval`/other single-instance timer state elsewhere in this file — the `clearInterval` guard prevents stacking multiple intervals if `renderRuoka()` is called repeatedly (e.g. via day navigation).

- [ ] **Step 2: Verify**

```bash
grep -n "async function loadFastingTimer" index.html
grep -n "function renderFastingTimer" index.html
grep -n "loadFastingTimer();" index.html
```

Expected: 1 match each.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: live paastoajastin Ruoka-sivulle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of a 6-task plan — the final piece that makes the Task 1 row actually live and ticking. `renderRuoka()` is called both on normal Ruoka page entry and on day navigation (`changeFoodDay()`) — the fasting timer is intentionally re-fetched on every call (cheap single-row query) rather than only on first page entry, since re-fetching redundantly on day-nav is harmless and avoids introducing a separate page-lifecycle hook.

Full spec: `docs/superpowers/specs/2026-08-18-paastoajastin-design.md`.

## Before You Begin

If the exact block doesn't match, or `getLastRealFoodEntryAt`/`formatFastingDuration` from Task 1 aren't present, ask now.

## Your Job

1. Make the edit exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the `clearInterval` guard is present and correctly prevents interval-stacking across repeated `renderRuoka()` calls (trace: call `loadFastingTimer()` twice in a row mentally — does the first interval get cleared before the second starts?).
- Confirm `loadFastingTimer()` is called without `await` at its `renderRuoka()` call site.
- Confirm `renderFastingTimer()` has a null-guard on `el` (the `#food-fasting-val` element) in case it's called when the Ruoka page/element isn't in the DOM for some reason — it should silently no-op, not throw.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 3: Weekly fasting computation

**Files:**
- Modify: `index.html` — insert `computeWeeklyFastingByDay()` near `getLastRealFoodEntryAt()`/`formatFastingDuration()`

**Depends on:** none directly (pure data function), but logically follows Task 1.

- [ ] **Step 1: Insert the function**

Find this exact block:

```js
function formatFastingDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}min`;
}

function changeFoodDay(dir) { foodDayOffset += dir; renderRuoka(); }
```

Replace with:

```js
function formatFastingDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}min`;
}

async function computeWeeklyFastingByDay(mondayIso, sundayIso) {
  const lookbackFrom = localIso(addDays(new Date(mondayIso), -14));
  const { data, error } = await sb.from('food_log_entries')
    .select('created_at')
    .gte('logged_at', lookbackFrom)
    .lte('logged_at', sundayIso)
    .gte('kcal', 10)
    .order('created_at', { ascending: true });
  if (error) { console.error('computeWeeklyFastingByDay failed:', error.message); return {}; }
  const entries = data || [];

  const byDay = {};
  for (let i = 0; i < 7; i++) {
    byDay[localIso(addDays(new Date(mondayIso), i))] = 0;
  }
  for (let i = 1; i < entries.length; i++) {
    const prev = new Date(entries[i - 1].created_at);
    const curr = new Date(entries[i].created_at);
    const endDayIso = localIso(curr);
    if (byDay[endDayIso] !== undefined) {
      byDay[endDayIso] += (curr - prev);
    }
  }
  return byDay;
}

function changeFoodDay(dir) { foodDayOffset += dir; renderRuoka(); }
```

**Key detail:** the 14-day lookback (`lookbackFrom`) exists so that if the week's Monday's first real entry isn't the user's first-ever entry, the gap between the last entry *before* the week and the week's first entry still gets correctly attributed to the day it ends on (per the spec's rule: "a gap counts toward the day it ends on"). Without this lookback, that opening gap would be silently missed since the query wouldn't even see the preceding entry.

- [ ] **Step 2: Verify**

```bash
grep -n "async function computeWeeklyFastingByDay" index.html
```

Expected: 1 match.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: computeWeeklyFastingByDay() — paaston aukkolaskenta viikolta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of a 6-task plan. This is a pure data function — nothing calls it yet (Task 4 wires it into the Koonti weekly card). `addDays`/`localIso` are pre-existing helpers already used throughout this file.

Full spec: `docs/superpowers/specs/2026-08-18-paastoajastin-design.md`.

## Before You Begin

If the exact block doesn't match, ask now.

## Your Job

1. Insert exactly the function specified
2. Verify with the exact grep command
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

Hand-trace this exact scenario (from the spec's own test plan) to confirm the "attribute to the day it ends on" rule works:
- Suppose `entries` (after the query) contains, in order: `[..., {created_at: 'YYYY-MM-DD(Sun, prior week) T20:00'}, {created_at: 'YYYY-MM-DD(Mon, this week) T08:00'}, ...]` — i.e. last meal Sunday 20:00, first meal Monday 08:00 (a 12-hour overnight gap crossing into the target week).
- Confirm: `endDayIso` for this pair is Monday's date (since `curr` = the Monday entry) → `byDay[Monday] !== undefined` (Monday IS one of the 7 keys) → the full 12-hour gap is added to `byDay[Monday]`. Confirm this matches by re-reading the loop, not just asserting it.
- Also confirm a day with 0 or 1 real entries correctly stays at `0` (no pair exists to iterate for it) unless a later day's entry's gap ends on it from the prior side.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced overnight-gap scenario
- Any issues or concerns

---

### Task 4: "Paastoaika" row + breakdown popup

**Files:**
- Modify: `index.html` — `loadWeeklyReportCard()` (add the new row)
- Modify: `index.html` — insert `openFastingBreakdownModal()` after `openWeeklyCaloriesModal()`

**Depends on:** Task 3 (`computeWeeklyFastingByDay()`).

- [ ] **Step 1: Add the "Paastoaika" row**

Find this exact block:

```js
    rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml + subHtml + daystripHtml,
      `openWeeklyCaloriesModal(${Math.round(foodKcal)}, ${Math.round(bmrInfo.bmr * 7)}, ${Math.round(exerciseKcal)})`));
  }

  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
```

Replace with:

```js
    rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml + subHtml + daystripHtml,
      `openWeeklyCaloriesModal(${Math.round(foodKcal)}, ${Math.round(bmrInfo.bmr * 7)}, ${Math.round(exerciseKcal)})`));

    const fastingByDay = await computeWeeklyFastingByDay(mon.iso, sunIso);
    const weeklyFastingMs = Object.values(fastingByDay).reduce((s, v) => s + v, 0);
    const dayMinutes = [];
    for (let i = 0; i < 7; i++) {
      dayMinutes.push(Math.round((fastingByDay[localIso(addDays(mon.date, i))] || 0) / 60000));
    }
    rows.push(weekRow('timer', 'var(--accent)', 'Paastoaika', formatFastingDuration(weeklyFastingMs), '',
      `openFastingBreakdownModal('${mon.iso}', ${dayMinutes.join(', ')})`));
  }

  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
```

This is placed inside the same `if (bmrInfo.bmr != null && bmrInfo.weightKg != null)` block as the "Viikon kalorit" row, right after it — `mon`, `sunIso` are already in scope from that block.

- [ ] **Step 2: Add `openFastingBreakdownModal()`**

Find this exact block (the end of `openWeeklyCaloriesModal()`):

```js
  const body = `
    <div class="metric-modal-row"><span>BMR (viikko)</span><span class="val">${bmrWeekly} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${exerciseKcal} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${foodKcal} kcal</span></div>
    <div class="metric-modal-total"><span>Viikko (${label})</span><span>${sign}${net} kcal</span></div>
  `;
  openMetricModal('Viikon kalorit', body);
}
```

Replace with:

```js
  const body = `
    <div class="metric-modal-row"><span>BMR (viikko)</span><span class="val">${bmrWeekly} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${exerciseKcal} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${foodKcal} kcal</span></div>
    <div class="metric-modal-total"><span>Viikko (${label})</span><span>${sign}${net} kcal</span></div>
  `;
  openMetricModal('Viikon kalorit', body);
}

function openFastingBreakdownModal(mondayIso, m0, m1, m2, m3, m4, m5, m6) {
  const minutes = [m0, m1, m2, m3, m4, m5, m6];
  const rowsHtml = minutes.map((min, i) => {
    const d = addDays(new Date(mondayIso), i);
    const label = `${DAYS[i]} ${d.getDate()}.${d.getMonth() + 1}.`;
    const h = Math.floor(min / 60), m = min % 60;
    return `<div class="metric-modal-row"><span>${label}</span><span class="val">${h}h ${m}min</span></div>`;
  }).join('');
  openMetricModal('Paastoaika', rowsHtml);
}
```

- [ ] **Step 3: Verify**

```bash
grep -n "function openFastingBreakdownModal" index.html
grep -n "openFastingBreakdownModal(" index.html
grep -n "computeWeeklyFastingByDay(mon.iso" index.html
```

Expected: first grep 1 match, second grep 2 matches (definition + call site), third grep 1 match.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Paastoaika-rivi Koontiin ja viikkoerittelypopup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of a 6-task plan — the UI integration that makes Task 3's computation visible. `weekRow(..., rowOnclick)`'s 6th parameter and the `.kc-weekly-row-top`-only click scoping already exist (from an earlier shipped feature) — this task is just another caller of that same mechanism, exactly like the "Viikon kalorit" row already is. `timer` icon already exists in `ICONS` (added for the rest-timer feature). No new Supabase reads beyond the one `computeWeeklyFastingByDay()` call — `mon`/`sunIso`/`mon.date` are already in scope from the surrounding block.

Full spec: `docs/superpowers/specs/2026-08-18-paastoajastin-design.md`.

## Before You Begin

If any exact block doesn't match, or `computeWeeklyFastingByDay`/`formatFastingDuration`/`weekRow`'s 6th-param mechanism/`timer` icon don't exist as expected, ask now.

## Your Job

1. Make both edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the new row is pushed to `rows` BEFORE `document.getElementById('kc-weekly-rows').innerHTML = rows.join('')` runs (i.e., inside the same `if` block, not after it closes).
- Confirm `dayMinutes` is built using `mon.date` (the actual Date object for the week's Monday, already in scope) via `addDays(mon.date, i)`, matching the same date range `computeWeeklyFastingByDay` was called with (`mon.iso`, `sunIso`) — no off-by-one between the two.
- Hand-trace `openFastingBreakdownModal('2026-08-17', 0, 690, 45, 0, 812, 300, 0)` — confirm each day's label (Ma 17.8., Ti 18.8., ...) and h/m conversion come out correct, no `NaN`/`undefined`.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced example
- Any issues or concerns

---

### Task 5: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data. If the Chrome extension isn't connecting, ask the user how to proceed rather than retrying endlessly.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Open Ruoka** — confirm the "Paasto" row shows a sensible "Xh Ym" value (or "—" if the account genuinely has no real food history — check via curl against the live DB first if unsure which to expect).

- [ ] **Step 3: Log a new food entry with ≥10 kcal** (via the search flow) — return to Ruoka, confirm the Paasto row resets to roughly "0h 0min" (or 0h Nmin if a few minutes passed during the test).

- [ ] **Step 4: Open Koonti, scroll to "Tällä viikolla"** — confirm a "Paastoaika" row appears (timer icon) with a plausible weekly total.

- [ ] **Step 5: Click the Paastoaika row** — confirm a popup opens with 7 day rows (Ma-Su with dates), each showing a plausible fasting duration, and that they sum to roughly the row's own weekly value (allow for rounding-to-minute drift).

- [ ] **Step 6: Click a day-strip chip and the "Viikon kalorit" row too** — confirm all three click targets in that card (day chips, Viikon kalorit, Paastoaika) still work independently with no interference between any pair.

- [ ] **Step 7: Check the browser console for errors** — expected: none. Also wait at least 60+ seconds on the Ruoka page and confirm the Paasto value visibly ticks upward without a page reload (proving the `setInterval` is actually running).

- [ ] **Step 8: Clean up** — stop the local server, close the tab.

- [ ] **Step 9: Report result.** No commit needed.

---

### Task 6: Final code review

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the entire diff (Tasks 1-4) covering: spec fidelity, the overnight-gap attribution rule (re-verify Task 3's hand-trace independently), that `_fastingInterval` never stacks across repeated `renderRuoka()` calls, that the three click handlers in the Koonti weekly card remain mutually independent, and that no new Supabase tables/columns were introduced anywhere (this feature is explicitly derive-only).

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (10 kcal threshold) → Tasks 1 & 3 (both queries use `gte('kcal', 10)`). §2 (live timer) → Tasks 1-2. §3 (weekly gap computation) → Task 3. §4 (Koonti UI + popup) → Task 4. §5 exclusions (no new tables, no food-name-based coffee detection, no notifications, no 16:8-style goal setting) are respected — no task does any of them.
- **Type/name consistency:** `getLastRealFoodEntryAt`, `formatFastingDuration`, `computeWeeklyFastingByDay`, `openFastingBreakdownModal` are used with identical names/signatures across every task that references them (Task 1 defines the first two, Task 2 consumes them, Task 3 defines the third, Task 4 consumes it and defines the fourth).
- **No placeholders:** every step shows exact before/after code, exact commands, exact expected output, and Task 3/4 include concrete hand-trace scenarios rather than vague "verify it works" instructions.
