# Oman tuotteen per annos -syöttö Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Per 100g" / "Per annos" toggle to the custom-food creation form so users can type a package's per-serving nutrition facts directly instead of hand-converting to per-100g first.

**Architecture:** Pure client-side UI + conversion. No schema change — `custom_foods` stays per-100g-only. A new `.stab-bar` toggle (reusing the app's existing active-button pattern from `setHistRange`/`showSaliTab`) switches an entry-mode variable, swaps the 4 macro-field labels, and shows/hides a new "Annoskoko (g)" field. On save, if in "annos" mode, the 4 entered values are converted to per-100g (`value * 100 / annoskoko`) before the existing `createCustomFood()` call — that function and the DB insert are untouched.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-21-custom-food-per-annos-design.md`

---

### Task 1: Toggle UI, label-swap, and save-time conversion

**Files:**
- Modify: `index.html` — `food-search-step-custom` HTML block, new `setCustomFoodEntryMode()` function + `customFoodEntryMode` global + `CUSTOM_FOOD_LABELS` constant, `goToCustomFoodStep()`, `saveCustomFoodAndContinue()`

**Depends on:** none.

- [ ] **Step 1: Replace the custom-food HTML block**

Find this exact block:

```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>
```

Replace with:

```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="stab-bar" style="margin-top:10px">
        <button class="stab active" id="custom-food-mode-100g" onclick="setCustomFoodEntryMode('100g', this)">Per 100g</button>
        <button class="stab" id="custom-food-mode-annos" onclick="setCustomFoodEntryMode('annos', this)">Per annos</button>
      </div>
      <div class="form-row" id="custom-food-servingsize-row" style="display:none"><label>Annoskoko (g)</label><input type="text" inputmode="decimal" id="custom-food-servingsize"></div>
      <div class="form-row"><label id="custom-food-kcal-label">Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label id="custom-food-protein-label">Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label id="custom-food-carbs-label">Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label id="custom-food-fat-label">Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>
```

The `.stab-bar` / `.stab` / `.stab.active` classes already exist in this file's CSS (used by `hist-range-*` and `sali-tab-*` buttons) — no new CSS needed. The label `<label>` tags each got an `id` so `setCustomFoodEntryMode()` can swap their text.

- [ ] **Step 2: Add `customFoodEntryMode`, `CUSTOM_FOOD_LABELS`, and `setCustomFoodEntryMode()`**

Find this exact block:

```js
function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  document.getElementById('custom-food-name').value = document.getElementById('food-search-input').value.trim();
  ['custom-food-kcal','custom-food-protein','custom-food-carbs','custom-food-fat'].forEach(id => {
    document.getElementById(id).value = '';
  });
}
```

Replace with:

```js
const CUSTOM_FOOD_LABELS = {
  '100g':  { kcal: 'Kcal/100g',  protein: 'Proteiini/100g',  carbs: 'Hiilarit/100g',  fat: 'Rasva/100g'  },
  'annos': { kcal: 'Kcal/annos', protein: 'Proteiini/annos', carbs: 'Hiilarit/annos', fat: 'Rasva/annos' },
};

let customFoodEntryMode = '100g';

function setCustomFoodEntryMode(mode, btn) {
  customFoodEntryMode = mode;
  ['custom-food-mode-100g', 'custom-food-mode-annos'].forEach(id => document.getElementById(id).classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('custom-food-servingsize-row').style.display = mode === 'annos' ? '' : 'none';
  const labels = CUSTOM_FOOD_LABELS[mode];
  document.getElementById('custom-food-kcal-label').textContent = labels.kcal;
  document.getElementById('custom-food-protein-label').textContent = labels.protein;
  document.getElementById('custom-food-carbs-label').textContent = labels.carbs;
  document.getElementById('custom-food-fat-label').textContent = labels.fat;
  ['custom-food-kcal', 'custom-food-protein', 'custom-food-carbs', 'custom-food-fat'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  document.getElementById('custom-food-name').value = document.getElementById('food-search-input').value.trim();
  document.getElementById('custom-food-servingsize').value = '';
  setCustomFoodEntryMode('100g', document.getElementById('custom-food-mode-100g'));
}
```

`setCustomFoodEntryMode` follows the exact same active-button-swap pattern as `setHistRange`/`showSaliTab` elsewhere in this file (remove `.active` from both mode buttons by id, add it to the clicked one). `goToCustomFoodStep()` now delegates macro-field clearing to `setCustomFoodEntryMode('100g', ...)` instead of its own forEach — this also guarantees the form always re-opens in "Per 100g" mode with the annoskoko row hidden, even if a previous custom-food creation in the same session left it in "annos" mode.

- [ ] **Step 3: Add conversion + validation to `saveCustomFoodAndContinue()`**

Find this exact block:

```js
async function saveCustomFoodAndContinue() {
  const name = document.getElementById('custom-food-name').value.trim();
  const kcal = parseNum('custom-food-kcal');
  const protein = parseNum('custom-food-protein');
  const carbs = parseNum('custom-food-carbs');
  const fat = parseNum('custom-food-fat');
  if (!name || kcal == null) {
    showStatus('custom-food-status', 'Nimi ja kcal vaaditaan', true);
    return;
  }
  const btn = document.getElementById('custom-food-save-btn');
```

Replace with:

```js
async function saveCustomFoodAndContinue() {
  const name = document.getElementById('custom-food-name').value.trim();
  let kcal = parseNum('custom-food-kcal');
  let protein = parseNum('custom-food-protein');
  let carbs = parseNum('custom-food-carbs');
  let fat = parseNum('custom-food-fat');
  if (!name || kcal == null) {
    showStatus('custom-food-status', 'Nimi ja kcal vaaditaan', true);
    return;
  }
  if (customFoodEntryMode === 'annos') {
    const servingSize = parseNum('custom-food-servingsize');
    if (!servingSize || servingSize <= 0) {
      showStatus('custom-food-status', 'Annoskoko vaaditaan', true);
      return;
    }
    kcal    = kcal * 100 / servingSize;
    protein = protein != null ? protein * 100 / servingSize : null;
    carbs   = carbs   != null ? carbs   * 100 / servingSize : null;
    fat     = fat     != null ? fat     * 100 / servingSize : null;
  }
  const btn = document.getElementById('custom-food-save-btn');
```

The rest of the function (the `try`/`catch` block calling `createCustomFood()`) is unchanged — `protein || 0` / `carbs || 0` / `fat || 0` at the call site already handles `null` the same way it did before this change, so no further edits are needed there. `kcal`/`protein`/`carbs`/`fat` were changed from `const` to `let` because the "annos" branch reassigns them.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_cfa_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_cfa_check.js
grep -n 'id="custom-food-mode-100g"' index.html
grep -n 'id="custom-food-mode-annos"' index.html
grep -n 'id="custom-food-servingsize-row"' index.html
grep -n "function setCustomFoodEntryMode" index.html
grep -n "customFoodEntryMode === 'annos'" index.html
```

Expected: `node --check` produces no output (syntax OK); 1 match each for the five greps.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: oman tuotteen ravintosisältö per annos -syöttö

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 2-task plan (Task 2 is manual verification + final review + finish). `parseNum`, `showStatus`, `createCustomFood`, `goToAmountStep`, `.stab`/`.stab-bar`/`.stab.active` CSS are all pre-existing — no new CSS. The `custom_foods` table schema and `createCustomFood()`'s signature are unchanged; this task only touches how values are gathered from the form before that function is called.

Full spec: `docs/superpowers/specs/2026-08-21-custom-food-per-annos-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all three edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace the conversion math with the spec's own worked example: servingsize=30g, kcal=120, protein=3, carbs=15, fat=5 entered in "annos" mode. Confirm the computed per-100g values are kcal=400, protein=10, carbs=50, fat=16.666...
- Confirm that switching from "annos" mode back to "100g" mode (or vice versa) clears the 4 macro fields but leaves the Nimi field and (if already entered) the Annoskoko field untouched — re-read `setCustomFoodEntryMode` and confirm it only clears `custom-food-kcal`/`custom-food-protein`/`custom-food-carbs`/`custom-food-fat`.
- Confirm that opening the custom-food step a second time in the same session (e.g. add one custom food, then add another) always resets to "100g" mode with the annoskoko row hidden, even if the previous custom food was saved in "annos" mode — trace through `goToCustomFoodStep()`'s call to `setCustomFoodEntryMode('100g', ...)`.
- Confirm that in "100g" mode, `saveCustomFoodAndContinue()` behaves byte-for-byte the same as before this change (no conversion applied, same validation, same `createCustomFood()` call shape) — this is a regression risk since the function's guard clauses were restructured.
- Confirm the "Annoskoko vaaditaan" error fires and prevents saving when Annoskoko is left blank or is 0/negative while in "annos" mode, and that it does NOT fire in "100g" mode even if the (now-hidden, unused) annoskoko field happens to be empty.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced conversion math
- Any issues or concerns

---

### Task 2: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Open the food-add modal, click "Lisää oma tuote" (or equivalent path to `goToCustomFoodStep()`) and confirm the form opens in "Per 100g" mode by default** — toggle shows "Per 100g" active, no Annoskoko row visible, labels read "Kcal/100g" etc.

- [ ] **Step 3: Click "Per annos"** — confirm the Annoskoko row appears, and all 4 macro labels change to the "/annos" variants.

- [ ] **Step 4: Enter the spec's worked example** (Annoskoko 30, Kcal 120, Proteiini 3, Hiilarit 15, Rasva 5), save, and confirm it proceeds to the amount step. Set the amount to 100g and confirm the preview shows 400 kcal · 10g proteiini · 50g hiilarit · 16,7g rasva (or equivalent rounding).

- [ ] **Step 5: Add a second custom food from scratch** (new search, "Lisää oma tuote" again) and confirm the form re-opens in "Per 100g" mode (not still in "annos" mode from Step 4).

- [ ] **Step 6: Test the per-100g path still works unchanged** — enter values directly in "Per 100g" mode, save, confirm the amount-step preview matches the entered per-100g values with no conversion applied.

- [ ] **Step 7: Test the annoskoko validation** — switch to "Per annos", leave Annoskoko blank, try to save, confirm the "Annoskoko vaaditaan" error shows and nothing is saved.

- [ ] **Step 8: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 9: Clean up** — stop the local server, close the tab.

- [ ] **Step 10: Dispatch a final code reviewer** for the diff covering: the conversion math, the mode-reset-on-reopen behavior, that "100g" mode is unaffected, and that no schema/DB changes were introduced.

- [ ] **Step 11: If issues are found, fix them and re-review until approved.**

- [ ] **Step 12: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (toggle UI, Annoskoko field, label swap, clear-on-toggle) → Task 1 Steps 1-2. §2 (conversion formula, unchanged schema/`createCustomFood`) → Task 1 Step 3. §3 (Annoskoko required + >0 validation) → Task 1 Step 3. §4 exclusions (no schema change, no amount-step changes, annoskoko value itself not persisted) — respected; `custom_foods` insert payload shape is untouched.
- **Type/name consistency:** `customFoodEntryMode`, `setCustomFoodEntryMode`, `CUSTOM_FOOD_LABELS`, `custom-food-servingsize`/`custom-food-servingsize-row`, `custom-food-mode-100g`/`custom-food-mode-annos` used identically wherever referenced.
- **No placeholders:** exact before/after code, exact commands, exact expected output; self-review includes concrete hand-traced conversion math and mode-reset scenarios rather than "verify it works."
