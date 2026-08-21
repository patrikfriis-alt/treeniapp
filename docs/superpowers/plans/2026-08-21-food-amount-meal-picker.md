# Ateriavalitsin määrä-askeleeseen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user change which meal a food is being logged to right on the amount-entry step, instead of it being locked in the moment they tapped a meal's "+ Lisää ruoka" button.

**Architecture:** A single `<select>` dropdown, populated from the existing `MEAL_DEFS` array, added to `food-search-step-amount`. It defaults to the current `foodModalMeal` value each time the step opens and writes back to that same global on change. `confirmAddFood()` already reads `foodModalMeal` fresh at save time, so no save-path code changes — this is a pure UI addition on top of existing state.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-21-food-amount-meal-picker-design.md`

---

### Task 1: Meal-selector dropdown on the amount step

**Files:**
- Modify: `index.html` — `food-search-step-amount` HTML block (new `<select>`), `goToAmountStep()` (populate + default the select)

**Depends on:** none.

- [ ] **Step 1: Add the dropdown to the HTML**

Find this exact block:

```html
    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100" oninput="updateFoodAmountPreview()"></div>
```

Replace with:

```html
    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="form-row"><label>Ateria</label><select id="food-amount-meal" onchange="foodModalMeal = this.value"></select></div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100" oninput="updateFoodAmountPreview()"></div>
```

The `<select>` starts empty — its `<option>`s are populated from `MEAL_DEFS` in `goToAmountStep()` (Step 2) every time the step opens, rather than being hardcoded here, so the two never drift out of sync.

- [ ] **Step 2: Populate and default the dropdown in `goToAmountStep()`**

Find this exact block:

```js
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
  updateFoodAmountPreview();
  loadLastUsedAmount();
}
```

Replace with:

```js
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  const mealSelect = document.getElementById('food-amount-meal');
  mealSelect.innerHTML = MEAL_DEFS.map(m => `<option value="${m.key}">${m.icon} ${m.label}</option>`).join('');
  mealSelect.value = foodModalMeal;
  document.getElementById('food-amount-grams').value = 100;
  updateFoodAmountPreview();
  loadLastUsedAmount();
}
```

`MEAL_DEFS` (`key`, `icon`, `label` per meal) is already defined earlier in this file and used identically elsewhere (e.g. `openFoodSearch()`'s title). Rebuilding the `<option>`s on every open (rather than once at page load) guarantees `mealSelect.value = foodModalMeal` always has a matching `<option>` to select, and costs nothing meaningful since `MEAL_DEFS` only has 4 entries.

- [ ] **Step 3: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_famp_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_famp_check.js
grep -n 'id="food-amount-meal"' index.html
grep -n "mealSelect.value = foodModalMeal" index.html
grep -n "MEAL_DEFS.map(m =>" index.html
```

Expected: `node --check` produces no output (syntax OK); 1 match each for the three greps.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: ateriavalitsin ruokahaun määräaskeleeseen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 2-task plan (Task 2 is manual verification + final review + finish). `MEAL_DEFS`, `foodModalMeal`, `foodModalSelected`, `confirmAddFood()`, `.form-row`/`<select>` styling (already used elsewhere, e.g. `edit-act-type`) are all pre-existing — no new CSS. `confirmAddFood()` is not modified by this task — it already reads `foodModalMeal` at the moment it builds the insert payload, so a value written moments earlier by this dropdown's `onchange` flows through automatically.

Full spec: `docs/superpowers/specs/2026-08-21-food-amount-meal-picker-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make both edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `goToAmountStep()` sets `mealSelect.value = foodModalMeal` AFTER populating the `<option>`s, not before — setting `.value` before the options exist would silently fail to select anything.
- Trace the full round-trip: open the search from the Lounas button (`foodModalMeal = 'lounas'`) → amount step opens with the select showing "☀️ Lounas" selected → user changes it to "🌅 Aamiainen" (`onchange` sets `foodModalMeal = 'aamiainen'`) → `confirmAddFood()` runs and reads `foodModalMeal`, which is now `'aamiainen'`. Confirm nothing in `confirmAddFood()` (which you did not modify) caches `foodModalMeal` into a separate variable earlier in the flow that would shadow this change — it must read the live global at call time.
- Confirm that closing and reopening the food-search modal for a *different* meal (e.g. Lounas, then later Päivällinen) resets the dropdown's default correctly each time — trace through `openFoodSearch(mealType)` (unmodified) setting `foodModalMeal`, then `goToAmountStep()` re-populating and re-defaulting the select from that fresh value.
- Confirm the photo-scan bulk-save flow (`food-search-step-photo` / `saveAllFoodPhotoRows()`) was not touched and still uses whatever `foodModalMeal` was set to when the modal opened, unaffected by this new select (which only exists on the amount step).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the traced round-trip scenario
- Any issues or concerns

---

### Task 2: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Open food search from the Lounas section's "+ Lisää ruoka"**, select any Fineli search result, and confirm the amount step's meal dropdown defaults to "☀️ Lounas".

- [ ] **Step 3: Change the dropdown to "🌅 Aamiainen" and save** — confirm the entry appears under Aamiainen in the diary, not Lounas.

- [ ] **Step 4: Open food search again from a different meal's button** (e.g. Päivällinen) — confirm the dropdown now defaults to "🌇 Päivällinen", not the "🌅 Aamiainen" left over from the previous save.

- [ ] **Step 5: Repeat once more changing the meal in the other direction** (open from one meal, switch to another via the dropdown, save) to confirm the round-trip works symmetrically, not just in the one direction tested in Step 3.

- [ ] **Step 6: Spot-check the photo-scan entry point** (if reachable in this environment) to confirm it opens and behaves as before, with no dropdown appearing there.

- [ ] **Step 7: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 8: Clean up test data** — delete any food-log entries created during testing directly via the Supabase client in the browser console (e.g. `await sb.from('food_log_entries').delete().eq('id', '<id>')` for each test entry's id, found via a preceding `select`). Verify with a follow-up select that nothing test-related remains.

- [ ] **Step 9: Clean up** — stop the local server, close the tab.

- [ ] **Step 10: Dispatch a final code reviewer** for the diff covering: the option-population-before-value-assignment ordering, that `confirmAddFood()` and the photo bulk-save path are untouched, and that the dropdown's default always matches whichever meal button opened the modal.

- [ ] **Step 11: If issues are found, fix them and re-review until approved.**

- [ ] **Step 12: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (amount step only, not photo bulk-save) → Task 1 Step 1 (only touches `food-search-step-amount`). §2 (populate from `MEAL_DEFS`, default to current `foodModalMeal`, `onchange` writes back, no `confirmAddFood()` changes needed) → Task 1 Steps 1-2. §3 exclusions (no schema change, no photo-flow change, no persistence across sessions — confirmed since the select is always freshly repopulated/defaulted in `goToAmountStep()` rather than remembering a prior choice) — respected.
- **Type/name consistency:** `food-amount-meal`, `MEAL_DEFS`, `foodModalMeal` used identically wherever referenced; no new global variables introduced (the dropdown writes directly to the pre-existing `foodModalMeal`, per spec's explicit "puhdas UI-lisäys olemassa olevan globaalin päälle").
- **No placeholders:** exact before/after code, exact commands, exact expected output; self-review includes a concrete traced round-trip scenario and the option-population-ordering edge case rather than "verify it works."
