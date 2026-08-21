# Kuitu/Sokeri/Suola-päiväyhteenveto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a day-total fiber/sugar/salt card to the Ruoka page, computed from data that has to be threaded through the food-logging pipeline for the first time — `fineli_foods` already has `fiber_per_100g`/`sugar_per_100g`/`salt_per_100g`, but `food_cache`/`custom_foods` don't carry those values forward today.

**Architecture:** New nullable columns on `food_cache`/`custom_foods` (mirroring `fineli_foods`); values flow through the existing search → cache → log pipeline exactly like carbs/fat already do; totals are derived at render time from the joined `food_cache`/`custom_foods` row × `amount_g` (new `entryFiber()`/`entrySugar()`/`entrySalt()` helpers, same shape as the existing `entryCarbs()`/`entryFat()`) — `food_log_entries` itself is untouched, so there's no backfill problem for historical rows. The custom-food form gains three optional fields. The UI reuses the existing `.koonti-progress-track`/`.koonti-progress-fill` bar component with two new color modifiers.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-21-nutrient-strip-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260821_food_cache_custom_foods_extra_nutrients.sql`

**Depends on:** none.

**Run this task in the main session, not a subagent** — this project's Supabase CLI (`supabase db push`) hangs when run from this sandbox because it blocks direct Postgres TCP connections (confirmed in earlier work on this project). The workaround: write the migration file, give the user the raw SQL to paste into the Supabase Dashboard's SQL editor, then mark it applied locally with `supabase migration repair`, and **always verify the columns actually exist via a REST API curl check afterward — do not trust a verbal "it's done" from the user.**

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260821_food_cache_custom_foods_extra_nutrients.sql`:

```sql
-- Kuitu/sokeri/suola-sarakkeet food_cache- ja custom_foods-tauluihin (päiväyhteenveto-kortin taustalle).
-- fineli_foods sisältää nämä jo (ks. 20260811_fineli_foods.sql) mutta arvot eivät tähän asti
-- ole kulkeneet eteenpäin kun ruoka kirjataan tai lisätään omana tuotteena.

alter table food_cache add column if not exists fiber_per_100g numeric;
alter table food_cache add column if not exists sugar_per_100g numeric;
alter table food_cache add column if not exists salt_per_100g numeric;

alter table custom_foods add column if not exists fiber_per_100g numeric;
alter table custom_foods add column if not exists sugar_per_100g numeric;
alter table custom_foods add column if not exists salt_per_100g numeric;
```

- [ ] **Step 2: Ask the user to run the migration**

Show the user the exact SQL from Step 1 and ask them to paste it into the Supabase Dashboard's SQL editor (project ref `yznuzwbbyasgqeqllxic`) and run it. Wait for their confirmation before continuing.

- [ ] **Step 3: Mark the migration as applied locally**

```bash
supabase migration repair --status applied 20260821
```

- [ ] **Step 4: Verify the columns actually exist — do not skip this even if the user says it's done**

```bash
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/food_cache?select=fiber_per_100g,sugar_per_100g,salt_per_100g&limit=1" \
  -H "apikey: $SB_ANON_KEY" -H "Authorization: Bearer $SB_ANON_KEY"
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/custom_foods?select=fiber_per_100g,sugar_per_100g,salt_per_100g&limit=1" \
  -H "apikey: $SB_ANON_KEY" -H "Authorization: Bearer $SB_ANON_KEY"
```

(`$SB_ANON_KEY` is the `SB_KEY` constant embedded in `index.html` — extract it with `grep "const SB_KEY" index.html` if not already in your shell environment.)

Expected: both requests return `200` with a JSON array (even if empty/one row with `null` values) — NOT a `400`/`42703 column does not exist` error. If either curl fails, the migration did not land; stop and re-check with the user before proceeding to Task 2.

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/20260821_food_cache_custom_foods_extra_nutrients.sql
git commit -m "$(cat <<'EOF'
feat: fiber/sugar/salt-sarakkeet food_cacheen ja custom_foodsiin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of 5. Task 2 (Fineli data flow) and Task 3 (custom-food form) both depend on these columns existing — do not start them until Task 1's Step 4 verification passes.

---

### Task 2: Fineli search → cache data flow + render-time helpers

**Files:**
- Modify: `index.html` — `searchFineli()`, `runFoodSearch()`, `ensureFoodCache()`, `confirmAddFood()`, `loadFoodDayEntries()`, and new `entryFiber()`/`entrySugar()`/`entrySalt()` helpers next to the existing `entryCarbs()`/`entryFat()`

**Depends on:** Task 1 (migration must be live).

- [ ] **Step 1: Add the three new helper functions**

Find this exact block:

```js
function entryFat(entry) {
  const src = entrySource(entry);
  if (!src) return 0;
  return src.fat_per_100g * entry.amount_g / 100;
}
```

Replace with:

```js
function entryFat(entry) {
  const src = entrySource(entry);
  if (!src) return 0;
  return src.fat_per_100g * entry.amount_g / 100;
}

function entryFiber(entry) {
  const src = entrySource(entry);
  if (!src || src.fiber_per_100g == null) return 0;
  return src.fiber_per_100g * entry.amount_g / 100;
}

function entrySugar(entry) {
  const src = entrySource(entry);
  if (!src || src.sugar_per_100g == null) return 0;
  return src.sugar_per_100g * entry.amount_g / 100;
}

function entrySalt(entry) {
  const src = entrySource(entry);
  if (!src || src.salt_per_100g == null) return 0;
  return src.salt_per_100g * entry.amount_g / 100;
}
```

These follow `entryCarbs()`/`entryFat()`'s exact shape, with one addition: they return 0 (not `NaN`) when the source's value is `null` — which happens for any `food_cache`/`custom_foods` row created before this feature, or any custom food where the user left the field blank.

- [ ] **Step 2: Add the 3 columns to `loadFoodDayEntries()`'s joined select**

Find this exact block:

```js
async function loadFoodDayEntries(dateIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      id, meal_type, amount_g, kcal, protein_g, food_cache_id, custom_food_id,
      food_cache(name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g),
      custom_foods(name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g)
    `)
    .eq('logged_at', dateIso)
    .order('created_at', { ascending: true });
  if (error) { console.error('loadFoodDayEntries failed:', error.message); return []; }
  return data || [];
}
```

Replace with:

```js
async function loadFoodDayEntries(dateIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      id, meal_type, amount_g, kcal, protein_g, food_cache_id, custom_food_id,
      food_cache(name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g,salt_per_100g),
      custom_foods(name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g,salt_per_100g)
    `)
    .eq('logged_at', dateIso)
    .order('created_at', { ascending: true });
  if (error) { console.error('loadFoodDayEntries failed:', error.message); return []; }
  return data || [];
}
```

- [ ] **Step 3: Add the 3 columns to `searchFineli()`'s query and returned objects**

Find this exact block:

```js
async function searchFineli(query) {
  const q = query.trim();
  const cols = 'id, name_fi, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g';
  const [prefixRes, containsRes] = await Promise.all([
    sb.from('fineli_foods').select(cols).ilike('name_fi', `${q}%`).order('name_fi').limit(20),
    sb.from('fineli_foods').select(cols).ilike('name_fi', `%${q}%`).order('name_fi').limit(20),
  ]);
  if (prefixRes.error || containsRes.error) throw new Error('Fineli-haku epäonnistui');
  const seen = new Set();
  const merged = [...prefixRes.data, ...containsRes.data].filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  }).slice(0, 20);
  return merged.map(f => ({
    id: f.id,
    name: { fi: f.name_fi },
    energyKcal: f.kcal_per_100g,
    protein: f.protein_per_100g,
    fat: f.fat_per_100g,
    carbohydrate: f.carbs_per_100g,
  }));
}
```

Replace with:

```js
async function searchFineli(query) {
  const q = query.trim();
  const cols = 'id, name_fi, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, sugar_per_100g, salt_per_100g';
  const [prefixRes, containsRes] = await Promise.all([
    sb.from('fineli_foods').select(cols).ilike('name_fi', `${q}%`).order('name_fi').limit(20),
    sb.from('fineli_foods').select(cols).ilike('name_fi', `%${q}%`).order('name_fi').limit(20),
  ]);
  if (prefixRes.error || containsRes.error) throw new Error('Fineli-haku epäonnistui');
  const seen = new Set();
  const merged = [...prefixRes.data, ...containsRes.data].filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  }).slice(0, 20);
  return merged.map(f => ({
    id: f.id,
    name: { fi: f.name_fi },
    energyKcal: f.kcal_per_100g,
    protein: f.protein_per_100g,
    fat: f.fat_per_100g,
    carbohydrate: f.carbs_per_100g,
    fiber: f.fiber_per_100g,
    sugar: f.sugar_per_100g,
    salt: f.salt_per_100g,
  }));
}
```

- [ ] **Step 4: Carry fiber/sugar/salt through `runFoodSearch()`'s mapping into `foodModalSelected`**

Find this exact block:

```js
    foodSearchItems = results.map(item => ({
      name: item.name.fi,
      kcalPer100g: item.energyKcal || 0,
      proteinPer100g: item.protein || 0,
      carbsPer100g: item.carbohydrate || 0,
      fatPer100g: item.fat || 0,
      source: 'fineli',
      fineliId: item.id,
    }));
```

Replace with:

```js
    foodSearchItems = results.map(item => ({
      name: item.name.fi,
      kcalPer100g: item.energyKcal || 0,
      proteinPer100g: item.protein || 0,
      carbsPer100g: item.carbohydrate || 0,
      fatPer100g: item.fat || 0,
      fiberPer100g: item.fiber,
      sugarPer100g: item.sugar,
      saltPer100g: item.salt,
      source: 'fineli',
      fineliId: item.id,
    }));
```

Note `fiberPer100g`/`sugarPer100g`/`saltPer100g` are NOT defaulted with `|| 0` the way the four required macros are — `null` here means "Fineli itself doesn't have this value for this food," and that distinction must survive into `food_cache` as a real `null`, not a false claim of zero fiber.

- [ ] **Step 5: Add the 3 parameters to `ensureFoodCache()` and its upsert payload**

Find this exact block:

```js
async function ensureFoodCache(fineliId, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g) {
  const { data, error } = await sb.from('food_cache')
    .upsert({
      fineli_id: fineliId,
      name_fi: name,
      kcal_per_100g: kcalPer100g,
      protein_per_100g: proteinPer100g,
      carbs_per_100g: carbsPer100g,
      fat_per_100g: fatPer100g,
    }, { onConflict: 'fineli_id', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) { console.error('ensureFoodCache upsert failed:', error.message); throw error; }
  return data.id;
}
```

Replace with:

```js
async function ensureFoodCache(fineliId, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g, sugarPer100g, saltPer100g) {
  const { data, error } = await sb.from('food_cache')
    .upsert({
      fineli_id: fineliId,
      name_fi: name,
      kcal_per_100g: kcalPer100g,
      protein_per_100g: proteinPer100g,
      carbs_per_100g: carbsPer100g,
      fat_per_100g: fatPer100g,
      fiber_per_100g: fiberPer100g ?? null,
      sugar_per_100g: sugarPer100g ?? null,
      salt_per_100g: saltPer100g ?? null,
    }, { onConflict: 'fineli_id', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) { console.error('ensureFoodCache upsert failed:', error.message); throw error; }
  return data.id;
}
```

- [ ] **Step 6: Pass the 3 new values through at the `ensureFoodCache()` call site in `confirmAddFood()`**

Find this exact block:

```js
    if (foodModalSelected.source === 'fineli') {
      cacheId = await ensureFoodCache(
        foodModalSelected.fineliId,
        foodModalSelected.name,
        foodModalSelected.kcalPer100g,
        foodModalSelected.proteinPer100g,
        foodModalSelected.carbsPer100g,
        foodModalSelected.fatPer100g,
      );
    }
```

Replace with:

```js
    if (foodModalSelected.source === 'fineli') {
      cacheId = await ensureFoodCache(
        foodModalSelected.fineliId,
        foodModalSelected.name,
        foodModalSelected.kcalPer100g,
        foodModalSelected.proteinPer100g,
        foodModalSelected.carbsPer100g,
        foodModalSelected.fatPer100g,
        foodModalSelected.fiberPer100g,
        foodModalSelected.sugarPer100g,
        foodModalSelected.saltPer100g,
      );
    }
```

- [ ] **Step 7: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nutri_check2.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nutri_check2.js
grep -n "function entryFiber" index.html
grep -n "function entrySugar" index.html
grep -n "function entrySalt" index.html
grep -n "fiber_per_100g,sugar_per_100g,salt_per_100g" index.html
grep -n "fiberPer100g, sugarPer100g, saltPer100g" index.html
```

Expected: `node --check` produces no output; 1 match each for `entryFiber`/`entrySugar`/`entrySalt` definitions; 2 matches for the joined-columns grep (one in `food_cache(...)`, one in `custom_foods(...)`); 1 match for the `ensureFoodCache` parameter-list grep.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: fiber/sokeri/suola-arvot Fineli-haun ja food_cachen läpi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of 5. `entrySource()`, `parseNum`, `sb` are pre-existing. Items selected from "Viimeksi käytetyt" (recent foods, `source: 'cache'`) or favorites (`source: 'custom'`) do NOT need any changes here — `confirmAddFood()` only calls `ensureFoodCache()` for fresh `source: 'fineli'` selections; already-cached items reuse their existing `food_cache`/`custom_foods` row untouched.

Full spec: `docs/superpowers/specs/2026-08-21-nutrient-strip-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `runFoodSearch()`'s new `fiberPer100g`/`sugarPer100g`/`saltPer100g` fields do NOT use `|| 0` — trace what happens when Fineli's own `fiber_per_100g` is `null` for a food: it must stay `null` all the way into `food_cache`, not become `0`.
- Confirm `ensureFoodCache()`'s new parameters use `?? null` (nullish coalescing, not `|| 0`) in the upsert payload — `0` and `null`/`undefined` must be treated differently here (a genuine 0g-fiber food is different from "unknown").
- Hand-trace `entryFiber()` for three cases: (a) a `food_cache` row with `fiber_per_100g: 3.2` and `amount_g: 150` → should return `4.8`; (b) a row with `fiber_per_100g: null` → should return `0`, not `NaN`; (c) an entry whose `entrySource()` returns `null` (shouldn't normally happen, but the existing `entryCarbs()`/`entryFat()` guard against it too) → should return `0`.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 3: Custom-food form fields

**Files:**
- Modify: `index.html` — `food-search-step-custom` HTML block, `CUSTOM_FOOD_LABELS`, `setCustomFoodEntryMode()`, `createCustomFood()`, `saveCustomFoodAndContinue()`

**Depends on:** Task 1 (migration must be live). Independent of Task 2 (touches different functions), but both must land before Task 4 can be meaningfully tested end-to-end.

- [ ] **Step 1: Add the three optional fields to the HTML**

Find this exact block:

```html
      <div class="form-row"><label id="custom-food-fat-label">Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
```

Replace with:

```html
      <div class="form-row"><label id="custom-food-fat-label">Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <div class="form-row"><label id="custom-food-fiber-label">Kuitu/100g</label><input type="text" inputmode="decimal" id="custom-food-fiber" placeholder="valinnainen"></div>
      <div class="form-row"><label id="custom-food-sugar-label">Sokeri/100g</label><input type="text" inputmode="decimal" id="custom-food-sugar" placeholder="valinnainen"></div>
      <div class="form-row"><label id="custom-food-salt-label">Suola/100g</label><input type="text" inputmode="decimal" id="custom-food-salt" placeholder="valinnainen"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
```

- [ ] **Step 2: Add the 3 label pairs to `CUSTOM_FOOD_LABELS` and update `setCustomFoodEntryMode()`**

Find this exact block:

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
```

Replace with:

```js
const CUSTOM_FOOD_LABELS = {
  '100g':  { kcal: 'Kcal/100g',  protein: 'Proteiini/100g',  carbs: 'Hiilarit/100g',  fat: 'Rasva/100g',  fiber: 'Kuitu/100g',  sugar: 'Sokeri/100g',  salt: 'Suola/100g'  },
  'annos': { kcal: 'Kcal/annos', protein: 'Proteiini/annos', carbs: 'Hiilarit/annos', fat: 'Rasva/annos', fiber: 'Kuitu/annos', sugar: 'Sokeri/annos', salt: 'Suola/annos' },
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
  document.getElementById('custom-food-fiber-label').textContent = labels.fiber;
  document.getElementById('custom-food-sugar-label').textContent = labels.sugar;
  document.getElementById('custom-food-salt-label').textContent = labels.salt;
  ['custom-food-kcal', 'custom-food-protein', 'custom-food-carbs', 'custom-food-fat', 'custom-food-fiber', 'custom-food-sugar', 'custom-food-salt'].forEach(id => {
    document.getElementById(id).value = '';
  });
}
```

- [ ] **Step 3: Add the 3 optional parameters to `createCustomFood()`**

Find this exact block:

```js
async function createCustomFood({ name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g }) {
  const { data, error } = await sb.from('custom_foods').insert({
    name,
    kcal_per_100g: kcalPer100g,
    protein_per_100g: proteinPer100g,
    carbs_per_100g: carbsPer100g,
    fat_per_100g: fatPer100g,
  }).select('id').single();
  if (error) { console.error('createCustomFood failed:', error.message); throw error; }
  return data.id;
}
```

Replace with:

```js
async function createCustomFood({ name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g, sugarPer100g, saltPer100g }) {
  const { data, error } = await sb.from('custom_foods').insert({
    name,
    kcal_per_100g: kcalPer100g,
    protein_per_100g: proteinPer100g,
    carbs_per_100g: carbsPer100g,
    fat_per_100g: fatPer100g,
    fiber_per_100g: fiberPer100g ?? null,
    sugar_per_100g: sugarPer100g ?? null,
    salt_per_100g: saltPer100g ?? null,
  }).select('id').single();
  if (error) { console.error('createCustomFood failed:', error.message); throw error; }
  return data.id;
}
```

- [ ] **Step 4: Read, convert (if in "annos" mode), and pass through the 3 new fields in `saveCustomFoodAndContinue()`**

Find this exact block:

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
  btn.disabled = true;
  try {
    const id = await createCustomFood({
      name, kcalPer100g: kcal, proteinPer100g: protein || 0, carbsPer100g: carbs || 0, fatPer100g: fat || 0,
    });
    foodModalSelected = {
      name,
      kcalPer100g: kcal,
      proteinPer100g: protein || 0,
      carbsPer100g: carbs || 0,
      fatPer100g: fat || 0,
      source: 'custom',
      customId: id,
    };
    goToAmountStep();
  } catch (err) {
    showStatus('custom-food-status', 'Tallennus epäonnistui', true);
  } finally {
    btn.disabled = false;
  }
}
```

Replace with:

```js
async function saveCustomFoodAndContinue() {
  const name = document.getElementById('custom-food-name').value.trim();
  let kcal = parseNum('custom-food-kcal');
  let protein = parseNum('custom-food-protein');
  let carbs = parseNum('custom-food-carbs');
  let fat = parseNum('custom-food-fat');
  let fiber = parseNum('custom-food-fiber');
  let sugar = parseNum('custom-food-sugar');
  let salt = parseNum('custom-food-salt');
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
    fiber   = fiber   != null ? fiber   * 100 / servingSize : null;
    sugar   = sugar   != null ? sugar   * 100 / servingSize : null;
    salt    = salt    != null ? salt    * 100 / servingSize : null;
  }
  const btn = document.getElementById('custom-food-save-btn');
  btn.disabled = true;
  try {
    const id = await createCustomFood({
      name, kcalPer100g: kcal, proteinPer100g: protein || 0, carbsPer100g: carbs || 0, fatPer100g: fat || 0,
      fiberPer100g: fiber, sugarPer100g: sugar, saltPer100g: salt,
    });
    foodModalSelected = {
      name,
      kcalPer100g: kcal,
      proteinPer100g: protein || 0,
      carbsPer100g: carbs || 0,
      fatPer100g: fat || 0,
      source: 'custom',
      customId: id,
    };
    goToAmountStep();
  } catch (err) {
    showStatus('custom-food-status', 'Tallennus epäonnistui', true);
  } finally {
    btn.disabled = false;
  }
}
```

Note `fiberPer100g`/`sugarPer100g`/`saltPer100g` are passed to `createCustomFood()` WITHOUT a `|| 0` fallback (unlike `protein`/`carbs`/`fat`) — a blank optional field must stay `null` ("untracked"), not become a false `0`.

- [ ] **Step 5: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nutri_check3.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nutri_check3.js
grep -n 'id="custom-food-fiber"' index.html
grep -n 'id="custom-food-sugar"' index.html
grep -n 'id="custom-food-salt"' index.html
grep -n "fiberPer100g: fiber, sugarPer100g: sugar, saltPer100g: salt" index.html
```

Expected: `node --check` produces no output; 1 match each for the four greps.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: oman tuotteen kuitu/sokeri/suola-kentät

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of 5, independent of Task 2 (different functions), both depend on Task 1's migration. `parseNum`, `showStatus`, `goToAmountStep` are pre-existing.

Full spec: `docs/superpowers/specs/2026-08-21-nutrient-strip-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the 3 new custom-food fields use `|| 0`-free pass-through into `createCustomFood()` — trace what happens when a user leaves "Sokeri/100g" blank: `parseNum` returns `null`, and it must reach `createCustomFood()`'s `sugarPer100g` parameter as `null`, then the insert payload as `sugar_per_100g: null` (via `?? null`), not `0`.
- Confirm the "Per annos" conversion branch correctly skips the multiplication for a blank field — trace `fiber = fiber != null ? fiber * 100 / servingSize : null;` when the Kuitu field was left empty: `fiber` is `null` going in, the ternary's `!= null` check is false, so `fiber` stays `null` — the conversion must never attempt `null * 100 / servingSize` (which would produce `0`, silently turning "untracked" into "definitely zero").
- Confirm `setCustomFoodEntryMode()`'s field-clearing forEach includes the 3 new field ids — switching between "Per 100g" and "Per annos" must clear Kuitu/Sokeri/Suola along with the other 4 fields, not leave stale values under a relabeled field.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 4: Day-total UI card

**Files:**
- Modify: `index.html` — new CSS (`.food-nutrient-row`, `.koonti-progress-fill.good`, `.koonti-progress-fill.low`), new HTML card (in the Ruoka page, after the Paasto row), new `renderFoodNutrientCard()` function + 3 constants, wired into `loadFoodDay()`

**Depends on:** Task 2 and Task 3 (needs real fiber/sugar/salt data flowing in to be meaningfully testable, though the card itself will render — just at 0g — even without them).

- [ ] **Step 1: Add the CSS**

Find this exact block:

```css
.koonti-progress-fill.over { background:var(--red); }
```

Replace with:

```css
.koonti-progress-fill.over { background:var(--red); }
.koonti-progress-fill.good { background:var(--green); }
.koonti-progress-fill.low  { background:var(--amber); }

.food-nutrient-row { margin-bottom:10px; }
.food-nutrient-row:last-child { margin-bottom:0; }
.food-nutrient-row-top { display:flex; justify-content:space-between; font-size:13px; color:var(--text2); margin-bottom:4px; }
```

- [ ] **Step 2: Add the card HTML**

Find this exact block:

```html
  <div class="food-week-row">
    <span>Paasto</span><span class="food-week-val" id="food-fasting-val">—</span>
  </div>

  <div id="food-meals"></div>
```

Replace with:

```html
  <div class="food-week-row">
    <span>Paasto</span><span class="food-week-val" id="food-fasting-val">—</span>
  </div>

  <div class="meal-card">
    <div class="meal-card-header" style="margin-bottom:10px">Ravintoaineet</div>
    <div class="food-nutrient-row">
      <div class="food-nutrient-row-top"><span>Kuitu</span><span id="food-nutrient-fiber-val">0g / 25g</span></div>
      <div class="koonti-progress-track"><div class="koonti-progress-fill" id="food-nutrient-fiber-bar" style="width:0%"></div></div>
    </div>
    <div class="food-nutrient-row">
      <div class="food-nutrient-row-top"><span>Sokeri</span><span id="food-nutrient-sugar-val">0g / 50g</span></div>
      <div class="koonti-progress-track"><div class="koonti-progress-fill" id="food-nutrient-sugar-bar" style="width:0%"></div></div>
    </div>
    <div class="food-nutrient-row">
      <div class="food-nutrient-row-top"><span>Suola</span><span id="food-nutrient-salt-val">0g / 5g</span></div>
      <div class="koonti-progress-track"><div class="koonti-progress-fill" id="food-nutrient-salt-bar" style="width:0%"></div></div>
    </div>
  </div>

  <div id="food-meals"></div>
```

`.meal-card` (surface background, rounded corners, padding) and `.meal-card-header` already exist in this file's CSS and are reused as-is — no new card-container styling needed.

- [ ] **Step 3: Add `renderFoodNutrientCard()` and the 3 reference constants, wire into `loadFoodDay()`**

Find this exact block:

```js
  renderFoodHero(entries, weekKcal);
  renderMealCards(entries, prevMealTypes);
}

function renderFoodHero(entries, weekKcal) {
```

Replace with:

```js
  renderFoodHero(entries, weekKcal);
  renderFoodNutrientCard(entries);
  renderMealCards(entries, prevMealTypes);
}

const FIBER_TARGET_G = 25;
const SUGAR_LIMIT_G = 50;
const SALT_LIMIT_G = 5;

function setNutrientBar(barId, valId, total, threshold, goodWhenAbove) {
  const bar = document.getElementById(barId);
  bar.style.width = Math.min(100, total / threshold * 100) + '%';
  bar.classList.remove('good', 'low', 'over');
  const isGood = goodWhenAbove ? total >= threshold : total <= threshold;
  bar.classList.add(isGood ? 'good' : (goodWhenAbove ? 'low' : 'over'));
  document.getElementById(valId).textContent = `${Math.round(total)}g / ${threshold}g`;
}

function renderFoodNutrientCard(entries) {
  const totalFiber = entries.reduce((s, e) => s + entryFiber(e), 0);
  const totalSugar = entries.reduce((s, e) => s + entrySugar(e), 0);
  const totalSalt  = entries.reduce((s, e) => s + entrySalt(e), 0);

  setNutrientBar('food-nutrient-fiber-bar', 'food-nutrient-fiber-val', totalFiber, FIBER_TARGET_G, true);
  setNutrientBar('food-nutrient-sugar-bar', 'food-nutrient-sugar-val', totalSugar, SUGAR_LIMIT_G, false);
  setNutrientBar('food-nutrient-salt-bar',  'food-nutrient-salt-val',  totalSalt,  SALT_LIMIT_G,  false);
}

function renderFoodHero(entries, weekKcal) {
```

`setNutrientBar()` is a small shared helper (not in the original spec's function list, but a natural DRY extraction) — `goodWhenAbove: true` for fiber (higher is better, "low" color when under target), `goodWhenAbove: false` for sugar/salt (lower is better, "over" color when exceeding the limit). This avoids writing the same 5-line bar-update logic three times with only the comparison direction differing.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nutri_check4.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nutri_check4.js
grep -n 'id="food-nutrient-fiber-bar"' index.html
grep -n 'id="food-nutrient-sugar-bar"' index.html
grep -n 'id="food-nutrient-salt-bar"' index.html
grep -n "function renderFoodNutrientCard" index.html
grep -n "renderFoodNutrientCard(entries);" index.html
```

Expected: `node --check` produces no output; 1 match each for the five greps.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: kuitu/sokeri/suola-päiväyhteenveto Ruoka-sivulle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of 5. `entryFiber`/`entrySugar`/`entrySalt` (Task 2), `.koonti-progress-track`/`.koonti-progress-fill` (pre-existing), `.meal-card`/`.meal-card-header` (pre-existing) are all required. `--green`/`--amber`/`--red` CSS variables are pre-existing (already used by `.koonti-progress-fill.over` and elsewhere).

Full spec: `docs/superpowers/specs/2026-08-21-nutrient-strip-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace `setNutrientBar('food-nutrient-fiber-bar', ..., total=30, threshold=25, goodWhenAbove=true)`: `30/25*100 = 120`, clamped to `100` width; `isGood = 30 >= 25` → `true` → `.good` (green) class added. Now trace `total=10`: `isGood = 10 >= 25` → `false` → since `goodWhenAbove` is `true`, falls to the `.low` (amber) branch, not `.over`.
- Hand-trace `setNutrientBar('food-nutrient-sugar-bar', ..., total=60, threshold=50, goodWhenAbove=false)`: `isGood = 60 <= 50` → `false` → since `goodWhenAbove` is `false`, falls to `.over` (red) branch, not `.low`.
- Confirm `bar.classList.remove('good', 'low', 'over')` runs before adding the new class every time `renderFoodNutrientCard()` is called — re-rendering the day (e.g. after adding a food) must not leave a stale color class from a previous state stacked alongside the new one.
- Confirm `renderFoodNutrientCard(entries)` is called with the same `entries` array `renderFoodHero(entries, weekKcal)` already receives — not a separate/stale fetch.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the two hand-traced bar-color scenarios
- Any issues or concerns

---

### Task 5: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Search for and log a Fineli food with known fiber/sugar/salt values** (e.g. a whole-grain bread or similar) — confirm the day's nutrient card updates with plausible non-zero values.

- [ ] **Step 3: Create a custom food filling in Kuitu/Sokeri/Suola, log it** — confirm its contribution shows up in the day totals.

- [ ] **Step 4: Create a second custom food leaving Kuitu/Sokeri/Suola blank, log it** — confirm no console error and the day totals are unaffected by this entry for those three nutrients (i.e. it contributes 0, not `NaN`).

- [ ] **Step 5: Push the fiber total above 25g** (log enough fiber-containing food) — confirm the Kuitu bar turns green.

- [ ] **Step 6: Push the sugar or salt total above its limit** — confirm that bar turns red.

- [ ] **Step 7: Navigate to a day with zero food entries** (e.g. via the day-forward arrow to a future empty day) — confirm the card shows 0g on all three bars with no error.

- [ ] **Step 8: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 9: Clean up test data** — delete the test `food_log_entries` and `custom_foods` rows created during testing directly via the Supabase client in the browser console (query first to get exact ids, then delete only those, being careful not to touch the user's real pre-existing data — e.g. the historical "APPELSIINI, KUORITTU, 137g" entry from `2026-08-21` seen in prior testing this session must NOT be touched). Verify with a follow-up select that nothing test-related remains.

- [ ] **Step 10: Clean up** — stop the local server, close the tab.

- [ ] **Step 11: Dispatch a final code reviewer** for the combined diff across Tasks 1-4, covering: null-vs-zero handling throughout (search → cache → custom food → render), the migration's safety (`add column if not exists`, nullable, no data loss), the `setNutrientBar()` color-branch logic, and that `food_log_entries` was genuinely never touched (confirming the "no backfill needed" claim in the spec holds).

- [ ] **Step 12: If issues are found, fix them and re-review until approved.**

- [ ] **Step 13: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (schema: nullable columns on `food_cache`/`custom_foods`, no `food_log_entries` change) → Task 1. §2 (data flow: `searchFineli`→`runFoodSearch`→`ensureFoodCache`, custom-food form, `loadFoodDayEntries`, `entryFiber`/`entrySugar`/`entrySalt`) → Tasks 2-3. §3 (UI: reused progress bar, fixed reference constants, text value alongside bar) → Task 4. §4 exclusions (no `food_log_entries` schema change, no backfill, fixed non-editable targets, simplified single-threshold bar not 3-zone gradient, optional custom-food fields) — respected throughout.
- **Type/name consistency:** `entryFiber`/`entrySugar`/`entrySalt`, `fiberPer100g`/`sugarPer100g`/`saltPer100g`, `fiber_per_100g`/`sugar_per_100g`/`salt_per_100g`, `custom-food-fiber`/`custom-food-sugar`/`custom-food-salt`, `food-nutrient-fiber-bar`/`food-nutrient-sugar-bar`/`food-nutrient-salt-bar` used identically wherever referenced across all four implementation tasks.
- **No placeholders:** exact before/after code, exact commands, exact expected output; self-review sections include concrete hand-traced scenarios (null-propagation, bar-color branching) rather than "verify it works."
