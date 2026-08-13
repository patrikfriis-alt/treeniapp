# Päivän budjettitiedot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the weekly budget bar's past/today day chips (the small M-T-K-T-P-L-S circles) clickable, opening a popup with that day's eaten/fair-share/exercise/difference numbers. Future (gray) days stay inert.

**Architecture:** No new data fetching — `foodByDate`, `exByDate`, and `fairShareDaily` are already computed in `loadWeeklyReportCard()` for the bar itself. Bake the relevant numbers directly into each clickable day cell's `onclick` attribute, and add one new function (`openDayBudgetModal`) that reuses the existing `openMetricModal()` helper.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-13-paivan-budjettitiedot-design.md`

---

### Task 1: CSS cursor affordance for clickable days

**Files:**
- Modify: `index.html:381-382`

- [ ] **Step 1: Add the cursor rule**

Find this exact block:

```css
.kc-week-day.under { background:var(--green); color:#fff; }
.kc-week-day.over  { background:var(--red); color:#fff; }
```

Replace with:

```css
.kc-week-day.under { background:var(--green); color:#fff; }
.kc-week-day.over  { background:var(--red); color:#fff; }
.kc-week-day.under, .kc-week-day.over { cursor: pointer; }
```

- [ ] **Step 2: Verify**

```bash
grep -n "kc-week-day.under, .kc-week-day.over { cursor" index.html
```

Expected: 1 match.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: osoitinkursori klikattaville viikkobudjetin päiväruuduille

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 5-task plan making the weekly budget bar's day chips clickable. Only past/today chips ever get the `.under`/`.over` class (future days stay classless per existing logic) — so scoping `cursor:pointer` to exactly those two classes automatically limits the visual "clickable" affordance to the days that will actually be clickable once Task 2 lands, with no extra conditional needed.

Full spec: `docs/superpowers/specs/2026-08-13-paivan-budjettitiedot-design.md`.

## Before You Begin

If the exact block doesn't match what you find, ask now.

## Your Job

1. Add exactly the one CSS line specified
2. Verify with the exact grep command
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Did you change only this, leaving the `.under`/`.over` background/color rules untouched?

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 2: Wire onclick into the day-cell loop

**Files:**
- Modify: `index.html:2141-2153` (inside `loadWeeklyReportCard`)

**Depends on:** none to implement safely (the `onclick` references `openDayBudgetModal`, which doesn't exist until Task 3 — but since it's inside an HTML attribute string, not evaluated until a user actually clicks, this is safe to land first, same reasoning already used successfully earlier in this project for sequencing UI-shell-before-behavior).

- [ ] **Step 1: Replace the day-cell loop**

Find this exact block:

```js
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
```

Replace with:

```js
    const dayCells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon.date);
      d.setDate(mon.date.getDate() + i);
      const iso = localIso(d);
      let cls = '';
      let onclickAttr = '';
      if (iso <= todayIso) {
        const eaten = foodByDate[iso] || 0;
        const exKcal = exByDate[iso] || 0;
        cls = eaten <= fairShareDaily ? ' under' : ' over';
        onclickAttr = ` onclick="openDayBudgetModal('${iso}', ${Math.round(eaten)}, ${Math.round(fairShareDaily)}, ${Math.round(exKcal)})"`;
      }
      dayCells.push(`<div class="kc-week-day${cls}"${onclickAttr}>${DAYS[i][0]}</div>`);
    }
    const daystripHtml = `<div class="kc-week-daystrip">${dayCells.join('')}</div>`;
```

- [ ] **Step 2: Verify**

```bash
grep -n "openDayBudgetModal(" index.html
```

Expected: 1 match so far (the `onclick` call site — the function itself doesn't exist yet, that's Task 3, not yours).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: viikkobudjetin päiväruudut avaavat päivän tiedot klikattaessa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of a 5-task plan. `exByDate` is already fetched and available in this exact scope (`const [exByDate, foodByDate] = await Promise.all([...])`, a few lines above this loop, used already for the `exerciseKcal` weekly total) — you're just also reading it per-day inside the loop, nothing new to fetch. `fairShareDaily` and `todayIso` are also already in scope. Only past/today days (`iso <= todayIso`) get an `onclick`; future days keep `onclickAttr = ''`, staying inert exactly as before.

Full spec: `docs/superpowers/specs/2026-08-13-paivan-budjettitiedot-design.md`.

## Before You Begin

If the exact block doesn't match, or `exByDate` isn't in scope where expected, ask now.

## Your Job

1. Replace exactly the loop block specified
2. Verify with the exact grep command
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `exByDate` really is already in scope at this point in the function (don't just assume — read a few lines above the loop).
- Confirm future days still get `cls = ''` and now also `onclickAttr = ''` (no click handler), unchanged in spirit from before.
- Confirm the template literal correctly produces something like `<div class="kc-week-day under" onclick="openDayBudgetModal('2026-08-11', 1092, 688, 0)">T</div>` for a real past day — trace one iteration by hand.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced example
- Any issues or concerns

---

### Task 3: Add `openDayBudgetModal()`

**Files:**
- Modify: `index.html` — insert after `openMetricModal()` (currently ends around line 5301, right before `openStreakModal`)

- [ ] **Step 1: Insert the function**

Find this exact block:

```js
function openMetricModal(title, bodyHtml) {
  const { modal } = createModalOverlay('metric-info-overlay');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);padding:24px;width:100%;max-height:80vh;overflow-y:auto;';

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:600;color:var(--text)">${title}</div>
      <button onclick="document.getElementById('metric-info-overlay').remove()" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;line-height:1;">✕</button>
    </div>
    ${bodyHtml}
  `;
}

function openStreakModal() {
```

Replace with:

```js
function openMetricModal(title, bodyHtml) {
  const { modal } = createModalOverlay('metric-info-overlay');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);padding:24px;width:100%;max-height:80vh;overflow-y:auto;';

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:600;color:var(--text)">${title}</div>
      <button onclick="document.getElementById('metric-info-overlay').remove()" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;line-height:1;">✕</button>
    </div>
    ${bodyHtml}
  `;
}

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

function openStreakModal() {
```

- [ ] **Step 2: Verify**

```bash
grep -n "function openDayBudgetModal" index.html
```

Expected: 1 match.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: openDayBudgetModal()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 (final code task) of a 5-task plan. `.metric-modal-row` and `.metric-modal-total` are pre-existing CSS classes already used by sibling modals (e.g. `openDeficitBreakdownModal`) — reused here, not redefined. `iso` arrives as a `'YYYY-MM-DD'` string from the day cell's baked-in `onclick` argument (Task 2); `new Date('YYYY-MM-DD')` parses this correctly for `toLocaleDateString`.

Full spec: `docs/superpowers/specs/2026-08-13-paivan-budjettitiedot-design.md`.

## Before You Begin

If the exact block doesn't match, or `.metric-modal-row`/`.metric-modal-total` don't already exist in the file's CSS, ask now.

## Your Job

1. Insert exactly the function specified
2. Verify with the exact grep command
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `.metric-modal-row` and `.metric-modal-total` are pre-existing CSS classes (grep, don't assume).
- Trace through one example by hand: `openDayBudgetModal('2026-08-11', 1092, 688, 0)` — confirm the title, both rows, the empty `exRow` (since `exKcal` is 0), and the total row's sign/value all come out sensible, no `NaN`/`undefined`.
- Confirm `openMetricModal` (which this calls) is defined above this new function, not below (so there's no forward-reference issue even though JS function hoisting would handle it either way — just confirm the insertion point is correct).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced example
- Any issues or concerns

---

### Task 4: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools. If the Chrome extension isn't connecting, ask the user how to proceed rather than retrying endlessly.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Click a past/today day chip** on Koonti's "Tällä viikolla" → "Viikon kalorit" row — confirm a popup opens with the correct date, "Syöty"/"Oma osuus"/"Erotus" rows (and "Liikunta" if that day had any), matching what you can cross-check via the browser console (`foodByDate`, `fairShareDaily` aren't global, but you can independently query `getDailyFoodCalories`/`getDailyExerciseCalories` for that date range via the console to sanity-check the numbers shown).

- [ ] **Step 3: Click a future (gray) day chip** — confirm nothing happens.

- [ ] **Step 4: Close the popup** (✕ button) — confirm it closes cleanly, no leftover overlay.

- [ ] **Step 5: Check the browser console for errors** — expected: none.

- [ ] **Step 6: Clean up** — stop the local server, close the tab.

- [ ] **Step 7: Report result.** No commit needed.

---

### Task 5: Final code review

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the entire diff (Tasks 1-3) covering: spec fidelity, that future days are genuinely never clickable, and that the popup's numbers correctly correspond to the day-strip's own under/over verdict (i.e. the popup's "Erotus" sign should always agree with whether that day's chip was colored green or red).

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** Data-passing via `onclick` (§1) → Task 2. Popup (§2) → Task 3. CSS (§3) → Task 1. All exclusions (§4: no food-list query, no future-day clicks, no `openMetricModal` changes) respected — no task does any of them.
- **Type/name consistency:** `openDayBudgetModal(iso, eaten, fairShare, exKcal)`'s parameter names/order are identical between the Task 2 call site and the Task 3 definition.
- **No placeholders:** every step shows exact before/after code, exact commands, exact expected output.
