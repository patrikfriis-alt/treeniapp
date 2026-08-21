# Oman tuotteen duplikaattivaroitus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As the user types a name on the custom-food creation form, show a live, non-blocking warning listing any existing `custom_foods` rows with a similar name, so near-duplicate custom products stop accumulating silently.

**Architecture:** Pure client-side addition — one new debounced search function mirroring the existing `onFoodSearchInput()`/`foodSearchDebounce`/`foodSearchRequestId` pattern already in this file, wired to the `custom-food-name` field's `oninput`. Results render into a new warning `<div>` using the app's existing `--amber`/`--amber-bg` color tokens (already used by `#offline-banner`). Never blocks or alters the save flow — `saveCustomFoodAndContinue()` is untouched.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-21-custom-food-duplicate-guard-design.md`

---

### Task 1: Live duplicate-name warning

**Files:**
- Modify: `index.html` — new `.custom-food-dup-warning` CSS rule, `food-search-step-custom` HTML block (new warning div, `oninput` on the name field), new `onCustomFoodNameInput()`/`checkCustomFoodDuplicates()` functions + `customFoodDupDebounce`/`customFoodDupRequestId` globals, `goToCustomFoodStep()`

**Depends on:** none. (Builds on the already-merged per-annos toggle from the previous task, but doesn't modify any of that code.)

- [ ] **Step 1: Add the CSS rule**

Find this exact block:

```css
.food-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; }
```

Replace with:

```css
.food-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; }
.custom-food-dup-warning {
  background: var(--amber-bg);
  color: var(--amber);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin: 8px 0;
}
.custom-food-dup-warning ul { margin: 4px 0 0; padding-left: 18px; }
```

`--amber`/`--amber-bg` already exist in this file's `:root` variables and are already used for the offline banner (`#offline-banner`) — reusing them here keeps the "heads up, but not an error" visual language consistent instead of introducing a new color.

- [ ] **Step 2: Add the warning div and wire `oninput` on the name field**

Find this exact block:

```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="stab-bar" style="margin-top:10px">
```

Replace with:

```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote" oninput="onCustomFoodNameInput()"></div>
      <div class="custom-food-dup-warning" id="custom-food-dup-warning" style="display:none"></div>
      <div class="stab-bar" style="margin-top:10px">
```

- [ ] **Step 3: Add `customFoodDupDebounce`/`customFoodDupRequestId` globals and the two new functions, and wire them into `goToCustomFoodStep()`**

Find this exact block:

```js
function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  document.getElementById('custom-food-name').value = document.getElementById('food-search-input').value.trim();
  document.getElementById('custom-food-servingsize').value = '';
  setCustomFoodEntryMode('100g', document.getElementById('custom-food-mode-100g'));
}
```

Replace with:

```js
let customFoodDupDebounce = null;
let customFoodDupRequestId = 0;

function onCustomFoodNameInput() {
  clearTimeout(customFoodDupDebounce);
  const q = document.getElementById('custom-food-name').value.trim();
  if (q.length < 2) {
    customFoodDupRequestId++;
    document.getElementById('custom-food-dup-warning').style.display = 'none';
    return;
  }
  customFoodDupDebounce = setTimeout(() => checkCustomFoodDuplicates(q), 300);
}

async function checkCustomFoodDuplicates(q) {
  const requestId = ++customFoodDupRequestId;
  const { data, error } = await sb.from('custom_foods').select('id, name').ilike('name', `%${q}%`).order('name').limit(5);
  if (error) { console.error('checkCustomFoodDuplicates failed:', error.message); return; }
  if (requestId !== customFoodDupRequestId) return;
  const el = document.getElementById('custom-food-dup-warning');
  if (!data || !data.length) {
    el.style.display = 'none';
    return;
  }
  el.innerHTML = `⚠️ Tarkista ettei tuote ole jo lisätty:<ul>${data.map(f => `<li>${escapeHtml(f.name)}</li>`).join('')}</ul>`;
  el.style.display = 'block';
}

function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  document.getElementById('custom-food-name').value = document.getElementById('food-search-input').value.trim();
  document.getElementById('custom-food-servingsize').value = '';
  setCustomFoodEntryMode('100g', document.getElementById('custom-food-mode-100g'));
  onCustomFoodNameInput();
}
```

`onCustomFoodNameInput()` is called at the end of `goToCustomFoodStep()` (not just wired to the field's `oninput`) because the Nimi field is often pre-filled from the main search box's text (the most common way to reach "+ Lisää oma tuote" is searching a name that returned no Fineli results) — programmatic `.value =` assignment doesn't fire `oninput`, so without this explicit call the duplicate check would never run for that pre-filled name until the user typed an additional character. Calling `onCustomFoodNameInput()` here reuses the exact same debounce/clear/2-char-minimum logic for both paths instead of duplicating it.

`checkCustomFoodDuplicates` follows the same request-id race-guard pattern as `foodSearchRequestId`/`runFoodSearch` elsewhere in this file: if the user keeps typing (or reopens the step for a different food) before a slower response resolves, the stale response is discarded instead of showing duplicate names for whatever was typed a moment ago. `escapeHtml` (already defined elsewhere in this file) prevents a custom food name containing HTML from being interpreted as markup in the warning list.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_cfdup_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_cfdup_check.js
grep -n 'id="custom-food-dup-warning"' index.html
grep -n 'oninput="onCustomFoodNameInput()"' index.html
grep -n "function onCustomFoodNameInput" index.html
grep -n "async function checkCustomFoodDuplicates" index.html
grep -n "onCustomFoodNameInput();" index.html
```

Expected: `node --check` produces no output (syntax OK); 1 match each for the first four greps, 2 matches for the last one (the `oninput` HTML attribute and the call inside `goToCustomFoodStep()`).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: oman tuotteen duplikaattivaroitus lisäyslomakkeeseen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 2-task plan (Task 2 is manual verification + final review + finish). `sb`, `escapeHtml`, `setCustomFoodEntryMode`, `--amber`/`--amber-bg` CSS variables are all pre-existing — no new colors, no schema changes. `saveCustomFoodAndContinue()` is not touched by this task — the warning is purely informational and never affects save behavior.

Full spec: `docs/superpowers/specs/2026-08-21-custom-food-duplicate-guard-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all three edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace the race scenario: user types "Testi" (triggers a debounced check at t=0ms, resolves slowly), then before it resolves, clears the field and types "Banaani" (a second debounced check starts, resolves quickly). Confirm the fast "Banaani" response's `requestId` is higher than the stale "Testi" response's, so when the slow "Testi" response finally arrives, `requestId !== customFoodDupRequestId` correctly discards it instead of overwriting the "Banaani" results already shown.
- Confirm that typing fewer than 2 characters (e.g. clearing the field down to 1 character) hides the warning immediately, without waiting for any in-flight debounced request to resolve.
- Confirm that reopening the custom-food step for a second product in the same session (e.g. add one custom food, then click "+ Lisää oma tuote" again for a different search) does NOT show stale warning content from the previous product before the new debounced check resolves — trace through `goToCustomFoodStep()`'s call to `onCustomFoodNameInput()` and confirm it correctly hides the warning (via the `q.length < 2` branch) when the new pre-filled name is empty, and correctly starts a fresh debounced check when it isn't.
- Confirm `saveCustomFoodAndContinue()` was not modified at all by this task — the warning must never block or alter saving regardless of whether it's currently showing.
- Confirm the warning list uses `escapeHtml()` on each matched product name, so a custom food name containing characters like `<` or `&` renders as text, not as HTML.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced race scenario
- Any issues or concerns

---

### Task 2: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Create a test custom food** (e.g. name "Duptest Alpha", any valid nutrition values) via the normal flow, and confirm it saves successfully with no warning shown for a first-of-its-kind name.

- [ ] **Step 3: Start creating a second custom food, type a name that shares a substring with the first** (e.g. "Duptest") — confirm the amber warning appears a moment after typing (not instantly — it's debounced) and lists "Duptest Alpha".

- [ ] **Step 4: Keep typing past the match** (e.g. finish typing "Duptest Beta Nonmatching") — confirm the warning disappears once the name no longer matches anything.

- [ ] **Step 5: Clear the name field down to 1 character** — confirm the warning hides immediately (no lingering stale content).

- [ ] **Step 6: Type a matching name again and save anyway while the warning is showing** — confirm the save succeeds normally and proceeds to the amount step, exactly as it would with no warning present.

- [ ] **Step 7: Test the pre-filled-name path** — from the main food search box, search for a name that returns no Fineli results but matches an existing custom food (e.g. search "Duptest"), click "+ Lisää oma tuote", and confirm the warning appears for the pre-filled name without requiring any additional typing.

- [ ] **Step 8: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 9: Clean up test data** — delete the "Duptest Alpha"/"Duptest Beta Nonmatching" custom foods and any logged entries created during testing directly via the Supabase client in the browser console (`await sb.from('custom_foods').delete().ilike('name', 'Duptest%')`), and delete any corresponding `food_log_entries` rows first if either was actually logged to a meal. Verify with a follow-up select that nothing named "Duptest%" remains.

- [ ] **Step 10: Clean up** — stop the local server, close the tab.

- [ ] **Step 11: Dispatch a final code reviewer** for the diff covering: the request-id race-guard correctness, the pre-filled-name trigger path, that `saveCustomFoodAndContinue()` is untouched, and that `escapeHtml()` is applied to rendered names.

- [ ] **Step 12: If issues are found, fix them and re-review until approved.**

- [ ] **Step 13: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (debounced ilike search, 2+ chars, limit 5, request-id guard) → Task 1 Step 3. §2 (warning UI placement, passive/non-clickable, appears/disappears live) → Task 1 Steps 1-2. §3 (never blocks save) → respected by leaving `saveCustomFoodAndContinue()` untouched. §4 exclusions (only `custom_foods` checked, no schema changes, no confirmation step) — respected.
- **Type/name consistency:** `customFoodDupDebounce`, `customFoodDupRequestId`, `onCustomFoodNameInput`, `checkCustomFoodDuplicates`, `custom-food-dup-warning` used identically wherever referenced.
- **No placeholders:** exact before/after code, exact commands, exact expected output; self-review includes concrete hand-traced race scenario and the pre-filled-name edge case rather than "verify it works."
