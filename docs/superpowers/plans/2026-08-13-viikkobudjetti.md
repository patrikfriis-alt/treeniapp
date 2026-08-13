# Viikkobudjetti (weekly calorie budget bar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Koonti's "Tällä viikolla" card's existing net-deficit-framed "Viikon kalorit" row with a "calories remaining to eat" framing, plus a new 7-day status strip showing which days stayed under a fixed daily fair-share.

**Architecture:** One function (`loadWeeklyReportCard`) gets its calorie-row block rewritten to compute a weekly budget and a fixed daily fair-share from data that's already fetched elsewhere in the app (`getDailyExerciseCalories`, `getDailyFoodCalories` — both already exist and return per-date maps). No new Supabase tables or columns. A few new CSS classes for the over-budget bar state and the new day-strip chips.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file. No build step, no test framework — verification is manual (grep for structural correctness per task, full browser walkthrough for the visual/behavioral task).

**Spec:** `docs/superpowers/specs/2026-08-13-viikkobudjetti-design.md`

---

### Task 1: Add the new CSS (over-budget bar state + day-strip chips)

**Files:**
- Modify: `index.html:370-372` (add an `.over` modifier for `.koonti-progress-fill`, add the new day-strip classes right after)

- [ ] **Step 1: Add the CSS**

Find this exact block (around line 370):

```css
.koonti-progress-track { height:5px; background:var(--surface2); border-radius:3px; margin-top:8px; overflow:hidden; }
.koonti-progress-fill { height:100%; border-radius:3px; background:var(--accent); transition:width .3s ease; }
.koonti-card--done .koonti-progress-fill { background:var(--green); }
```

Replace with:

```css
.koonti-progress-track { height:5px; background:var(--surface2); border-radius:3px; margin-top:8px; overflow:hidden; }
.koonti-progress-fill { height:100%; border-radius:3px; background:var(--accent); transition:width .3s ease; }
.koonti-card--done .koonti-progress-fill { background:var(--green); }
.koonti-progress-fill.over { background:var(--red); }
.kc-week-budget-sub { font-size:12px; color:var(--text3); margin-top:4px; }
.kc-week-daystrip { display:flex; gap:6px; margin-top:8px; }
.kc-week-day {
  width:28px; height:28px; border-radius:50%; background:var(--surface2);
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:600; color:var(--text3);
}
.kc-week-day.under { background:var(--green); color:#fff; }
.kc-week-day.over  { background:var(--red); color:#fff; }
```

- [ ] **Step 2: Verify the edits**

```bash
grep -n "koonti-progress-fill.over\|kc-week-day\b\|kc-week-daystrip\|kc-week-budget-sub" index.html
```

Expected: 6 matches total (the `.koonti-progress-fill.over` rule, `.kc-week-budget-sub`, `.kc-week-daystrip`, `.kc-week-day` base rule, `.kc-week-day.under`, `.kc-week-day.over`).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: viikkobudjetin ylitys- ja päivänauha-CSS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewrite the weekly calorie row's calculation and rendering

**Files:**
- Modify: `index.html:2100-2123` (inside `loadWeeklyReportCard`, the calorie-row block)

**Depends on:** Task 1 (references the new CSS classes, though the page still renders without erroring if Task 1 hasn't landed — the classes just wouldn't be styled).

This task replaces the "net deficit vs. goal" framing with a "remaining budget" framing, adds a fixed daily fair-share value, and adds the new 7-day status strip. It reuses `getDailyExerciseCalories()`/`getDailyFoodCalories()` (already defined elsewhere in this file, both return `{ 'YYYY-MM-DD': totalKcal }` maps) instead of the aggregate-only `getExerciseCalories()`/`getFoodCalories()` the old code used, since the per-day breakdown is needed for the day strip (and the weekly totals can be derived by summing the map's values — no extra query needed).

- [ ] **Step 1: Replace the block**

Find this exact block (around line 2100-2123):

```js
  bmrInfo = await (bmrInfo || getBmrInfo());
  if (bmrInfo.bmr != null) {
    const mon = wStart(offset);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const [exerciseKcal, foodKcal] = await Promise.all([
      getExerciseCalories(mon.iso, localIso(sun)),
      getFoodCalories(mon.iso, localIso(sun)),
    ]);
    const elapsedDays = offset === 0 ? (todayIdx() + 1) : 7;
    const weeklyNet = Math.round(foodKcal - bmrInfo.bmr * elapsedDays - exerciseKcal);
    const weeklySign = weeklyNet >= 0 ? '+' : '';
    let weeklyValStr = `${weeklySign}${weeklyNet} kcal`;
    let barHtml = '';
    if (bmrInfo.weightKg != null) {
      const goalWeeklyDeficit = Math.round(bmrInfo.weightKg * 0.01 * 7700);
      weeklyValStr = `${weeklySign}${weeklyNet} / -${Math.abs(goalWeeklyDeficit)} kcal`;
      const deficitPct = weeklyNet <= 0 && goalWeeklyDeficit > 0
        ? Math.min(100, Math.round(Math.abs(weeklyNet) / goalWeeklyDeficit * 100))
        : 0;
      barHtml = `<div class="koonti-progress-track"><div class="koonti-progress-fill" style="width:${deficitPct}%"></div></div>`;
    }
    rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml));
  }
```

Replace with:

```js
  bmrInfo = await (bmrInfo || getBmrInfo());
  if (bmrInfo.bmr != null && bmrInfo.weightKg != null) {
    const mon = wStart(offset);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const sunIso = localIso(sun);
    const [exByDate, foodByDate] = await Promise.all([
      getDailyExerciseCalories(mon.iso, sunIso),
      getDailyFoodCalories(mon.iso, sunIso),
    ]);
    const exerciseKcal = Object.values(exByDate).reduce((s, v) => s + v, 0);
    const foodKcal = Object.values(foodByDate).reduce((s, v) => s + v, 0);

    const goalWeeklyDeficit = Math.round(bmrInfo.weightKg * 0.01 * 7700);
    const weeklyBudget = Math.round(bmrInfo.bmr * 7 + exerciseKcal - goalWeeklyDeficit);
    const remaining = Math.round(weeklyBudget - foodKcal);
    const fairShareDaily = bmrInfo.bmr - goalWeeklyDeficit / 7;
    const todayIso = localIso(new Date());

    const weeklyValStr = `${Math.round(foodKcal)} / ${weeklyBudget} kcal`;

    const pct = weeklyBudget > 0 ? Math.min(100, Math.round(foodKcal / weeklyBudget * 100)) : 100;
    const overClass = foodKcal > weeklyBudget ? ' over' : '';
    const barHtml = `<div class="koonti-progress-track"><div class="koonti-progress-fill${overClass}" style="width:${pct}%"></div></div>`;

    const subText = remaining >= 0
      ? `Voit vielä syödä ${remaining} kcal tällä viikolla`
      : `Ylitit budjetin ${Math.abs(remaining)} kcal:lla`;
    const subHtml = `<div class="kc-week-budget-sub">${subText}</div>`;

    const dayCells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon.date);
      d.setDate(mon.date.getDate() + i);
      const iso = localIso(d);
      let cls = '';
      if (iso <= todayIso) {
        const eaten = foodByDate[iso] || 0;
        cls = eaten <= fairShareDaily ? ' under' : ' over';
      }
      dayCells.push(`<div class="kc-week-day${cls}">${DAYS[i][0]}</div>`);
    }
    const daystripHtml = `<div class="kc-week-daystrip">${dayCells.join('')}</div>`;

    rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml + subHtml + daystripHtml));
  }
```

**Note for the implementer:** the old code had a nested `if (bmrInfo.weightKg != null)` inside `if (bmrInfo.bmr != null)`, rendering a plain net-calories row with no goal/bar when weight was missing. Reading `getBmrInfo()` (`index.html:2898-2911`) shows `bmr` is only ever non-null when `weightKg` is also non-null (both come from the same `body_metrics` row fetch, and the function returns early with `bmr: null` if that row or its `weight_kg` is missing) — so that inner branch was unreachable in practice. This rewrite merges both checks into one `if` and removes the now-dead weight-missing fallback string. This is an intentional simplification, not an oversight — if you're re-reading this plan later and wondering where the old fallback went, that's why.

- [ ] **Step 2: Verify the edits**

```bash
grep -n "weeklyBudget\|fairShareDaily\|kc-week-daystrip" index.html
```

Expected: several matches, all inside `loadWeeklyReportCard` (no matches for `weeklyBudget`/`fairShareDaily` should exist anywhere else in the file — these are new, uniquely-named variables local to this function).

```bash
grep -n "getExerciseCalories(mon.iso\|getFoodCalories(mon.iso" index.html
```

Expected: 0 matches — confirms the old aggregate-only calls were fully replaced, not left dangling alongside the new per-date calls.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: viikkobudjetti korvaa nettovaje-kehyksen ja lisää päivänauhan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Full manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — it needs the `claude-in-chrome` browser tools and live Supabase data. Follows the same pattern used for prior features in this project (serve `index.html` locally with `python3 -m http.server`, drive it via Chrome MCP tools). If the Chrome extension isn't connecting, don't retry endlessly — ask the user how they want to proceed (same fallback used previously in this project).

- [ ] **Step 1: Serve the app locally**

Run in the background (do not block on it):

```bash
python3 -m http.server 8939
```

- [ ] **Step 2: Open it in Chrome, resize to phone viewport (430x932)**

- [ ] **Step 3: Verify the row renders correctly**

Open Koonti, scroll to "Tällä viikolla" → "Viikon kalorit" row. Confirm:
- Value shows as `"{eaten} / {budget} kcal"`.
- A subline below the bar reads either "Voit vielä syödä X kcal tällä viikolla" or "Ylitit budjetin X kcal:lla".
- A row of 7 small circles appears below that, labeled M T K T P L S.

- [ ] **Step 4: Verify day-strip logic**

For days before today this week: confirm each circle is green or red (not gray). For days after today (if any, i.e. if today isn't Sunday): confirm those are gray/neutral. Cross-check one or two colored days by hand against actual logged food that day (via the food diary / Supabase) vs. the fair-share value, to confirm the color matches.

- [ ] **Step 5: Verify the over-budget bar state**

If currently under budget, this step can be a code-reading sanity check instead of a live repro (going over budget for real isn't something to fake by logging junk data) — re-read `index.html`'s `overClass`/`.koonti-progress-fill.over` wiring and confirm by inspection that it would turn the bar red past 100%. If the account happens to already be over budget this week, confirm directly that the bar and subline show the red/over state.

- [ ] **Step 6: Check the browser console for errors**

Use `read_console_messages` — expected: no new JS errors introduced by this change.

- [ ] **Step 7: Clean up**

Stop the local server, close the browser tab.

- [ ] **Step 8: Report result**

Summarize what was verified (or any issue found and how it was fixed). No commit needed — verification only.

---

### Task 4: Final code review

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent, as in prior features on this project).

- [ ] **Step 1: Dispatch a final code reviewer for the entire diff** (Tasks 1-2 — the CSS and the rewritten calorie-row block) covering: spec/design-doc fidelity, that no other code path still references the removed `weeklyNet`/old-style `goalWeeklyDeficit` bar percentage logic, and that the "fixed fair-share, no retroactive re-coloring" design intent from the spec is actually what the code does (trace it by hand, similar to how the rest-timer plan's final review hand-traced its two key scenarios when live browser testing wasn't available).

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** Calculation (§1 of the spec) is Task 2. Bar + subline + day-strip visuals (§2.1-2.4) are Tasks 1 (CSS) and 2 (markup). The spec's explicit exclusions (§3 — no new tables, no tap interaction on day cells, no retroactive re-coloring, no `target_loss_pct` UI control) are respected: nothing in this plan adds a table, a click handler on `.kc-week-day`, or a settings control for the 1% constant.
- **Type/name consistency:** `weeklyBudget`, `remaining`, `fairShareDaily`, `foodByDate`, `exByDate` are used identically within the single block they're introduced in (Task 2) — no cross-task naming to keep in sync since this is a one-task code change (Task 1 is CSS-only).
- **No placeholders:** every step shows exact before/after code, exact commands, and exact expected output.
