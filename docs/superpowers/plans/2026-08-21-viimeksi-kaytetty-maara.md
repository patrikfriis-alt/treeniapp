# Viimeksi käytetty määrä Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 5th preset button in the food-amount step, "Viimeksi Xg", showing the user's own last-used amount for the exact food being added — shown only when that food has been logged before, populated asynchronously so it never delays the step opening.

**Architecture:** No new schema. Pure read against existing `food_log_entries`/`food_cache`, gated by a request-id counter matching the established pattern (`foodDayRequestId`, `foodSearchRequestId`, `coachRequestId`, `treeniRequestId`) elsewhere in this file.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-21-viimeksi-kaytetty-maara-design.md`

---

### Task 1: "Viimeksi käytetty" preset button

**Files:**
- Modify: `index.html` — `food-search-step-amount` HTML (new button), new `loadLastUsedAmount()` function + `lastUsedAmountRequestId` global, `goToAmountStep()` (wire the call)

**Depends on:** none.

- [ ] **Step 1: Add the button to the HTML**

Find this exact block:

```html
      <div class="food-amount-presets">
        <button class="stab" onclick="setFoodAmount(50)">50g</button>
        <button class="stab" onclick="setFoodAmount(100)">100g</button>
        <button class="stab" onclick="setFoodAmount(150)">150g</button>
        <button class="stab" onclick="setFoodAmount(200)">200g</button>
      </div>
```

Replace with:

```html
      <div class="food-amount-presets">
        <button class="stab" id="food-amount-last-used-btn" style="display:none"></button>
        <button class="stab" onclick="setFoodAmount(50)">50g</button>
        <button class="stab" onclick="setFoodAmount(100)">100g</button>
        <button class="stab" onclick="setFoodAmount(150)">150g</button>
        <button class="stab" onclick="setFoodAmount(200)">200g</button>
      </div>
```

The button has no `onclick` in the HTML — its click handler and text are both set dynamically in `loadLastUsedAmount()` once a match is found, since the amount it should set isn't known until the async lookup resolves.

- [ ] **Step 2: Add `lastUsedAmountRequestId` and `loadLastUsedAmount()`**

Find this exact block:

```js
function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
  updateFoodAmountPreview();
}
```

Replace with:

```js
function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
  updateFoodAmountPreview();
}

let lastUsedAmountRequestId = 0;

async function loadLastUsedAmount() {
  const requestId = ++lastUsedAmountRequestId;
  const btn = document.getElementById('food-amount-last-used-btn');
  if (!btn) return;
  btn.style.display = 'none';

  const sel = foodModalSelected;
  if (!sel) return;

  let cacheId  = sel.source === 'cache'  ? sel.cacheId  : null;
  let customId = sel.source === 'custom' ? sel.customId : null;

  if (!cacheId && !customId && sel.source === 'fineli' && sel.fineliId) {
    const { data, error } = await sb.from('food_cache').select('id').eq('fineli_id', sel.fineliId).maybeSingle();
    if (error) { console.error('loadLastUsedAmount (food_cache lookup) failed:', error.message); return; }
    if (requestId !== lastUsedAmountRequestId) return;
    if (data) cacheId = data.id;
  }
  if (!cacheId && !customId) return;

  let query = sb.from('food_log_entries').select('amount_g').order('created_at', { ascending: false }).limit(1);
  query = cacheId != null ? query.eq('food_cache_id', cacheId) : query.eq('custom_food_id', customId);
  const { data: rows, error: entryErr } = await query;
  if (entryErr) { console.error('loadLastUsedAmount failed:', entryErr.message); return; }
  if (requestId !== lastUsedAmountRequestId) return;
  if (!rows || !rows.length) return;

  const grams = rows[0].amount_g;
  btn.textContent = `Viimeksi ${grams}g`;
  btn.onclick = () => setFoodAmount(grams);
  btn.style.display = '';
}
```

`lastUsedAmountRequestId` follows the exact same pattern as `foodDayRequestId`/`foodSearchRequestId` elsewhere in this file: captured once at the top of the async function, re-checked after every `await` before touching shared state (here, the button's own DOM) — if the user has already selected a different food by the time either query resolves, the stale response silently no-ops instead of showing the wrong food's amount on the button.

- [ ] **Step 3: Wire the call into `goToAmountStep()`**

Find this exact block:

```js
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
  updateFoodAmountPreview();
}
```

Replace with:

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

`loadLastUsedAmount()` is intentionally called without `await` — the amount step opens immediately with its existing default behavior; the last-used button fades in a moment later if (and only if) a match is found, matching the spec's "never delay the step opening" requirement.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_vkm_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_vkm_check.js
grep -n 'id="food-amount-last-used-btn"' index.html
grep -n "let lastUsedAmountRequestId" index.html
grep -n "async function loadLastUsedAmount" index.html
grep -n "loadLastUsedAmount();" index.html
```

Expected: `node --check` produces no output (syntax OK); 1 match each for the four greps.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Viimeksi käytetty määrä -pikanäppäin ruokahaun määräaskeleeseen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 3-task plan (Task 2 is manual verification, Task 3 is final review + finish). `foodModalSelected`, `sb`, `setFoodAmount`, `updateFoodAmountPreview` are all pre-existing. `.stab` CSS class already exists and is reused as-is (matches the other 4 preset buttons) — no new CSS.

Full spec: `docs/superpowers/specs/2026-08-21-viimeksi-kaytetty-maara-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all three edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace the race scenario from the spec's own test plan: user selects food A (starts `loadLastUsedAmount`, `requestId=1`), immediately backs out and selects food B (`requestId=2`) before A's query resolves. When A's query finally resolves, does `requestId !== lastUsedAmountRequestId` (`1 !== 2`) correctly cause it to bail out before touching `btn.textContent`/`btn.onclick`? Walk through both possible resolution orderings (A resolves after B starts vs. A resolves after B also finishes) and confirm neither can leave the wrong amount on the button.
- Confirm the `food_cache` lookup by `fineli_id` only runs when `sel.source === 'fineli'` AND both `cacheId`/`customId` are still null — trace: if `sel.source === 'cache'`, does the code correctly skip the `food_cache` lookup entirely and go straight to using `sel.cacheId`?
- Confirm the button has no static `onclick` attribute in the HTML (only a dynamically-assigned `.onclick` property set inside `loadLastUsedAmount()`) — if a stale `onclick` from a previous food somehow persisted while the button was hidden mid-lookup for a new food, tapping it during that gap could set the wrong amount. Check whether `btn.style.display = 'none'` at the top of `loadLastUsedAmount()` combined with the button having no click target until explicitly assigned is sufficient (a hidden button can't be tapped), or whether an additional `btn.onclick = null` reset at the top is warranted for defense-in-depth.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced race scenario
- Any issues or concerns

---

### Task 2: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Log a food with a distinctive amount** (e.g. 137g of something) via a fresh Fineli search result (not from "Viimeksi käytetyt").

- [ ] **Step 3: Search for the SAME food by name again** (this should return it as a Fineli result again, not from the recent-foods list) — confirm the "Viimeksi 137g" button appears in the amount step a moment after it opens (not instantly — it's async), and confirm tapping it sets the amount field to 137.

- [ ] **Step 4: Select the same food from "Viimeksi käytetyt"** instead of searching by name — confirm the button appears and works identically via this path too.

- [ ] **Step 5: Search for a food never logged before** — confirm no "Viimeksi" button ever appears (not even briefly).

- [ ] **Step 6: Rapid food-switch check** — open the amount step for one food, immediately go back and select a different food before the first one's lookup could plausibly finish, and confirm the button never shows the wrong food's amount.

- [ ] **Step 7: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 8: Clean up** — stop the local server, close the tab.

- [ ] **Step 9: Report result.** No commit needed.

---

### Task 3: Final code review + finish branch

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the diff covering: the request-id race guard's correctness (re-verify independently), the three-source lookup logic (`cache`/`custom`/`fineli`) correctly gating which id is used, that no new Supabase tables/columns were introduced, and that the button's dynamic `onclick` assignment can't retain a stale handler across food switches.

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (three-source lookup, fineli fallback via food_cache) → Task 1. §2 (async load, request-id guard) → Task 1. §3 (button placement, first among presets, additive not replacing) → Task 1. §4 exclusions (no recommended/piece-size presets, not meal-specific, no schema changes) — respected.
- **Type/name consistency:** `loadLastUsedAmount`, `lastUsedAmountRequestId`, `food-amount-last-used-btn` used identically wherever referenced.
- **No placeholders:** exact before/after code, exact commands, exact expected output; self-review includes concrete hand-traced race scenarios rather than "verify it works."
