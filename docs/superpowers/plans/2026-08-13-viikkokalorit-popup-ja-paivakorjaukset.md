# Viikon kalorit -popup + päiväpopupin korjaukset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the day-budget popup's total to actually include exercise (matching what its "+" prefix visually implies), rename/reorder its rows, and make the "Viikon kalorit" row itself clickable to open a weekly BMR/exercise/food breakdown popup (mirroring the existing daily "Päivän kalorit" popup).

**Architecture:** Two independent edits in `index.html`: (1) rewrite `openDayBudgetModal()`'s body/formula, (2) add an optional 6th parameter to the shared `weekRow()` builder, wire it for the "Viikon kalorit" row only, and add a new `openWeeklyCaloriesModal()` function modeled directly on the existing `openDeficitBreakdownModal()`.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-13-viikkokalorit-popup-ja-paivakorjaukset-design.md`

---

### Task 1: Fix `openDayBudgetModal()` — include exercise, reorder, rename

**Files:**
- Modify: `index.html:5307-5322`

- [ ] **Step 1: Replace the function**

Find this exact block:

```js
function openDayBudgetModal(iso, eaten, fairShare, exKcal) {
  const dateObj = new Date(iso);
  const title = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const diff = eaten - fairShare;
  const sign = diff >= 0 ? '+' : '';
  const exRow = exKcal > 0
    ? `<div class="metric-modal-row"><span>Liikunta</span><span class="val">+${exKcal} kcal</span></div>`
    : '';
  const body = `
    <div class="metric-modal-row"><span>Syöty</span><span class="val">${eaten} kcal</span></div>
    <div class="metric-modal-row"><span>Oma osuus</span><span class="val">${fairShare} kcal</span></div>
    ${exRow}
    <div class="metric-modal-total"><span>Erotus</span><span>${sign}${diff} kcal</span></div>
  `;
  openMetricModal(title, body);
}
```

Replace with:

```js
function openDayBudgetModal(iso, eaten, fairShare, exKcal) {
  const dateObj = new Date(iso);
  const title = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const diff = eaten - fairShare - exKcal;
  const sign = diff >= 0 ? '+' : '';
  const exRow = exKcal > 0
    ? `<div class="metric-modal-row"><span>Liikunta</span><span class="val">+${exKcal} kcal</span></div>`
    : '';
  const body = `
    <div class="metric-modal-row"><span>Tavoite</span><span class="val">${fairShare} kcal</span></div>
    <div class="metric-modal-row"><span>Syöty</span><span class="val">${eaten} kcal</span></div>
    ${exRow}
    <div class="metric-modal-total"><span>Erotus</span><span>${sign}${diff} kcal</span></div>
  `;
  openMetricModal(title, body);
}
```

Three changes: `diff` now subtracts `exKcal`; row order is Tavoite → Syöty (was Syöty → Oma osuus); "Oma osuus" label is now "Tavoite".

- [ ] **Step 2: Verify**

```bash
grep -n "eaten - fairShare - exKcal" index.html
grep -n "Oma osuus" index.html
```

Expected: first grep 1 match. Second grep 0 matches (label fully renamed, no leftover).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
fix: päiväpopupin Erotus huomioi liikunnan, Tavoite ensin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 4-task plan. `openDayBudgetModal()` already exists (shipped earlier today) — this task only changes its formula/labels/order, not its signature or call site (the caller in `loadWeeklyReportCard()` already passes `iso, eaten, fairShare, exKcal` unchanged, nothing there needs to change). Full rationale in the spec: the old formula ignored `exKcal` in the total despite visually implying it counted (a "+" prefix suggesting it summed into the total below), and "Oma osuus" was a misleading name (it's not resting metabolism — it's `BMR − dailyShareOfWeeklyDeficitGoal`, a daily calorie *allowance*, correctly named "Tavoite").

Full spec: `docs/superpowers/specs/2026-08-13-viikkokalorit-popup-ja-paivakorjaukset-design.md`.

## Before You Begin

If the exact block doesn't match, ask now.

## Your Job

1. Replace exactly the function specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Trace one example by hand: `openDayBudgetModal('2026-08-11', 1092, 688, 369)` — confirm `diff = 1092-688-369 = 35`, sign `+`, row order Tavoite/Syöty/Liikunta/Erotus.
- Confirm the function signature (`iso, eaten, fairShare, exKcal`) is unchanged — only the body changed.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced example
- Any issues or concerns

---

### Task 2: Clickable "Viikon kalorit" row + `openWeeklyCaloriesModal()`

**Files:**
- Modify: `index.html` — `weekRow()` builder and its "Viikon kalorit" call site (both inside `loadWeeklyReportCard`)
- Modify: `index.html` — insert `openWeeklyCaloriesModal()` after `openDeficitBreakdownModal()`

**Depends on:** none (independent of Task 1 — different function).

- [ ] **Step 1: Add an optional 6th parameter to `weekRow()`**

Find this exact block:

```js
  const weekRow = (icon, iconColor, label, valHtml, barHtml) => `
    <div class="kc-weekly-row">
      <div class="kc-weekly-row-top">
        <div class="kc-weekly-row-label"><span class="kc-weekly-row-icon" data-icon="${icon}" data-icon-color="${iconColor}"></span>${label}</div>
        <div class="kc-weekly-row-val">${valHtml}</div>
      </div>
      ${barHtml || ''}
    </div>`;
```

Replace with:

```js
  const weekRow = (icon, iconColor, label, valHtml, barHtml, rowOnclick) => `
    <div class="kc-weekly-row">
      <div class="kc-weekly-row-top"${rowOnclick ? ` onclick="${rowOnclick}" style="cursor:pointer;"` : ''}>
        <div class="kc-weekly-row-label"><span class="kc-weekly-row-icon" data-icon="${icon}" data-icon-color="${iconColor}"></span>${label}</div>
        <div class="kc-weekly-row-val">${valHtml}</div>
      </div>
      ${barHtml || ''}
    </div>`;
```

This is backward-compatible — the 5 other existing `weekRow(...)` calls (Salikertoja, Aktiviteettikertoja, Kilometrit, Unen keskiarvo, Painon muutos) pass no 6th argument, so `rowOnclick` is `undefined` for them and the ternary adds nothing, leaving their rendered HTML byte-identical to before.

- [ ] **Step 2: Wire the "Viikon kalorit" call site**

Find this exact line:

```js
    rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml + subHtml + daystripHtml));
```

Replace with:

```js
    rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml + subHtml + daystripHtml,
      `openWeeklyCaloriesModal(${Math.round(foodKcal)}, ${Math.round(bmrInfo.bmr * 7)}, ${Math.round(exerciseKcal)})`));
```

`foodKcal`, `bmrInfo.bmr`, and `exerciseKcal` are all already computed above this line in the same function scope — no new queries.

- [ ] **Step 3: Add `openWeeklyCaloriesModal()`**

Find this exact block (the end of `openDeficitBreakdownModal()`):

```js
  const body = `
    <div class="metric-modal-row"><span>BMR</span><span class="val">${Math.round(bmrInfo.bmr)} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${Math.round(exerciseKcalToday)} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${Math.round(foodKcalToday)} kcal</span></div>
    <div class="metric-modal-total"><span>Tänään (${label})</span><span>${sign}${netToday} kcal</span></div>
    <div class="metric-modal-sub">Viimeiset 7 päivää (miinus=vaje, plus=ylijäämä)</div>
    <div class="metric-modal-bars">${barsHtml}</div>
  `;
  openMetricModal('Päivän kalorit', body);
}
```

Replace with:

```js
  const body = `
    <div class="metric-modal-row"><span>BMR</span><span class="val">${Math.round(bmrInfo.bmr)} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${Math.round(exerciseKcalToday)} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${Math.round(foodKcalToday)} kcal</span></div>
    <div class="metric-modal-total"><span>Tänään (${label})</span><span>${sign}${netToday} kcal</span></div>
    <div class="metric-modal-sub">Viimeiset 7 päivää (miinus=vaje, plus=ylijäämä)</div>
    <div class="metric-modal-bars">${barsHtml}</div>
  `;
  openMetricModal('Päivän kalorit', body);
}

function openWeeklyCaloriesModal(foodKcal, bmrWeekly, exerciseKcal) {
  const net = foodKcal - bmrWeekly - exerciseKcal;
  const sign = net >= 0 ? '+' : '';
  const label = net < 0 ? 'nettovaje' : (net > 0 ? 'nettoylijäämä' : 'tasan');
  const body = `
    <div class="metric-modal-row"><span>BMR (viikko)</span><span class="val">${bmrWeekly} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${exerciseKcal} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${foodKcal} kcal</span></div>
    <div class="metric-modal-total"><span>Viikko (${label})</span><span>${sign}${net} kcal</span></div>
  `;
  openMetricModal('Viikon kalorit', body);
}
```

- [ ] **Step 4: Verify**

```bash
grep -n "function openWeeklyCaloriesModal" index.html
grep -n "openWeeklyCaloriesModal(" index.html
grep -n "rowOnclick" index.html
```

Expected: first grep 1 match (definition). Second grep 2 matches (definition's internal reference doesn't count — actually just the one call site inside the template string, plus the function name itself appears once more in `function openWeeklyCaloriesModal(...)` — so expect exactly 2 total occurrences of the substring). Third grep 2 matches (the `weekRow` parameter name and its one usage inside the ternary).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Viikon kalorit -rivi avaa viikon erittelypopupin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of a 4-task plan. `openDeficitBreakdownModal()` already exists and is the direct model for the new function — same row shape, same Finnish labels/wording (`nettovaje`/`nettoylijäämä`/`tasan`), just scoped to the whole week's numbers instead of today's. The click target is deliberately just `.kc-weekly-row-top` (label+value), not the whole `.kc-weekly-row` card — that card also contains the day-strip (`daystripHtml`) with its own per-day `onclick` handlers (shipped in an earlier task today), and scoping the new click handler to only the top row avoids any event-target ambiguity between the two.

Full spec: `docs/superpowers/specs/2026-08-13-viikkokalorit-popup-ja-paivakorjaukset-design.md`.

## Before You Begin

If any exact block doesn't match, or `openDeficitBreakdownModal()`/`bmrInfo`/`foodKcal`/`exerciseKcal` don't exist where expected, ask now.

## Your Job

1. Make all three edits (weekRow signature, call site, new function) exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the 5 OTHER `weekRow(...)` calls (Salikertoja, Aktiviteettikertoja, Kilometrit, Unen keskiarvo, Painon muutos) are untouched and still render identically (no 6th argument passed, so `rowOnclick` is `undefined` for all of them).
- Confirm clicking a day-strip chip (inside the same card) and clicking the "Viikon kalorit" label/value area are two genuinely separate DOM elements with separate `onclick` handlers, not nested in a way that would double-fire.
- Hand-trace `openWeeklyCaloriesModal(1121, 13573, 892)` (example numbers) — confirm `net`, `sign`, and `label` all come out sensible.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced example
- Any issues or concerns

---

### Task 3: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools. If the Chrome extension isn't connecting, ask the user how to proceed rather than retrying endlessly.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Click a past/today day chip with logged exercise** — confirm popup shows Tavoite/Syöty/Liikunta/Erotus in that order, and Erotus correctly equals `Syöty − Tavoite − Liikunta`.

- [ ] **Step 3: Click the "Viikon kalorit" label/value area** (not a day chip) — confirm a new popup opens titled "Viikon kalorit" with BMR (viikko)/+ Liikunta/− Syöty ruoka/Total rows, and the total's sign/label agree.

- [ ] **Step 4: Click a day chip again after closing the weekly popup** — confirm it still opens the day popup correctly (no interference between the two click handlers).

- [ ] **Step 5: Check the browser console for errors** — expected: none.

- [ ] **Step 6: Clean up** — stop the local server, close the tab.

- [ ] **Step 7: Report result.** No commit needed.

---

### Task 4: Final code review

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the entire diff (Tasks 1-2) covering: spec fidelity, that the 5 untouched `weekRow` calls truly render identically to before, that the day-chip and weekly-row click handlers are genuinely independent, and that both popups' math is internally correct.

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (day popup fix) → Task 1. §2 (weekly popup + wiring) → Task 2. §3 exclusions (no touching `openDeficitBreakdownModal`, no new 7-bar chart on the weekly popup, no chip-color changes, no new queries) are respected — no task does any of them.
- **Type/name consistency:** `openWeeklyCaloriesModal(foodKcal, bmrWeekly, exerciseKcal)`'s parameter names/order are identical between the Task 2 call site and definition. `openDayBudgetModal`'s signature is unchanged from its existing call site (Task 1 only touches the body).
- **No placeholders:** every step shows exact before/after code, exact commands, exact expected output.
