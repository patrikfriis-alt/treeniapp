# Laajennettu ravintoainetieto per ruoka ("Lisätiedot") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable "Lisätiedot" nutrient panel to the food amount-entry step (fat split, sodium, 5 minerals, vitamin C/D, plus fiber/sugar/salt which already exist in the data but have never been shown per-food) and matching optional fields to the custom-food form, backed by a one-time bulk import of these fields from Fineli's official open dataset into `fineli_foods`.

**Architecture:** New nullable columns on `fineli_foods`/`food_cache`/`custom_foods` (mirroring the existing fiber/sugar/salt columns), populated for `fineli_foods` via a one-off Node import script pulling from Fineli Release 18's open-data CSVs (mirrored on GitHub, since `fineli.fi` itself blocks automated requests). Values flow through the existing search → cache → log pipeline exactly like the other nutrients, PLUS two pre-existing gaps get fixed along the way: `loadRecentFoods()` and the custom-food save path both currently drop fiber/sugar/salt when building `foodModalSelected`, which would make the new Lisätiedot panel silently empty for the two most-used food-selection paths (quick-reuse and "just created this custom food"). The panel itself is data-driven off a single `LISATIEDOT_FIELDS` config array rather than 15 hand-wired DOM blocks, grouped into labeled sections, with a shared `toggleCollapsible()` helper reused by the panel and the two new custom-food-form subsections.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST, a standalone Node 18+ script (no dependencies, built-in `fetch`) for the one-time data import. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-24-food-lisatiedot-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260824_food_extra_nutrients.sql`

**Depends on:** none.

**Run this task in the main session, not a subagent** — this project's Supabase CLI (`supabase db push`) hangs when run from this sandbox because it blocks direct Postgres TCP connections. The workaround: write the migration file, give the user the raw SQL to paste into the Supabase Dashboard's SQL editor, then mark it applied locally with `supabase migration repair`, and **always verify the columns actually exist via a REST API curl check afterward — do not trust a verbal "it's done" from the user.**

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260824_food_extra_nutrients.sql`:

```sql
-- Laajennettu ravintoainetieto ("Lisätiedot") -ominaisuus: rasvan jaottelu, natrium,
-- 5 kivennäisainetta, C/D-vitamiini sekä valmistustapaluokitus.
-- fineli_foods saa kaikki 13 saraketta (data täydennetään erillisellä tuontiskriptillä,
-- ks. Task 2). food_cache saa samat 13 (kopio Fineli-hausta, kuten fiber/sugar/salt jo).
-- custom_foods saa 12 numeerista saraketta MUTTA EI process_code-saraketta — käyttäjän
-- omalle tuotteelle ei ole mielekästä valmistustapaluokittelua.

alter table fineli_foods add column if not exists fat_saturated_per_100g numeric;
alter table fineli_foods add column if not exists fat_mono_per_100g numeric;
alter table fineli_foods add column if not exists fat_poly_per_100g numeric;
alter table fineli_foods add column if not exists fat_trans_per_100g numeric;
alter table fineli_foods add column if not exists sodium_per_100g numeric;
alter table fineli_foods add column if not exists calcium_per_100g numeric;
alter table fineli_foods add column if not exists potassium_per_100g numeric;
alter table fineli_foods add column if not exists magnesium_per_100g numeric;
alter table fineli_foods add column if not exists iron_per_100g numeric;
alter table fineli_foods add column if not exists zinc_per_100g numeric;
alter table fineli_foods add column if not exists vitamin_c_per_100g numeric;
alter table fineli_foods add column if not exists vitamin_d_per_100g numeric;
alter table fineli_foods add column if not exists process_code text;

alter table food_cache add column if not exists fat_saturated_per_100g numeric;
alter table food_cache add column if not exists fat_mono_per_100g numeric;
alter table food_cache add column if not exists fat_poly_per_100g numeric;
alter table food_cache add column if not exists fat_trans_per_100g numeric;
alter table food_cache add column if not exists sodium_per_100g numeric;
alter table food_cache add column if not exists calcium_per_100g numeric;
alter table food_cache add column if not exists potassium_per_100g numeric;
alter table food_cache add column if not exists magnesium_per_100g numeric;
alter table food_cache add column if not exists iron_per_100g numeric;
alter table food_cache add column if not exists zinc_per_100g numeric;
alter table food_cache add column if not exists vitamin_c_per_100g numeric;
alter table food_cache add column if not exists vitamin_d_per_100g numeric;
alter table food_cache add column if not exists process_code text;

alter table custom_foods add column if not exists fat_saturated_per_100g numeric;
alter table custom_foods add column if not exists fat_mono_per_100g numeric;
alter table custom_foods add column if not exists fat_poly_per_100g numeric;
alter table custom_foods add column if not exists fat_trans_per_100g numeric;
alter table custom_foods add column if not exists sodium_per_100g numeric;
alter table custom_foods add column if not exists calcium_per_100g numeric;
alter table custom_foods add column if not exists potassium_per_100g numeric;
alter table custom_foods add column if not exists magnesium_per_100g numeric;
alter table custom_foods add column if not exists iron_per_100g numeric;
alter table custom_foods add column if not exists zinc_per_100g numeric;
alter table custom_foods add column if not exists vitamin_c_per_100g numeric;
alter table custom_foods add column if not exists vitamin_d_per_100g numeric;
```

- [ ] **Step 2: Ask the user to run the migration**

Show the user the exact SQL from Step 1 and ask them to paste it into the Supabase Dashboard's SQL editor (project ref `yznuzwbbyasgqeqllxic`) and run it. Wait for their confirmation before continuing.

- [ ] **Step 3: Mark the migration as applied locally**

```bash
supabase migration repair --status applied 20260824
```

- [ ] **Step 4: Verify the columns actually exist — do not skip this even if the user says it's done**

```bash
SB_KEY=$(grep -o "const SB_KEY = '[^']*'" index.html | sed "s/const SB_KEY = '//;s/'//")
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/fineli_foods?select=fat_saturated_per_100g,sodium_per_100g,calcium_per_100g,potassium_per_100g,magnesium_per_100g,iron_per_100g,zinc_per_100g,vitamin_c_per_100g,vitamin_d_per_100g,process_code&limit=1" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/food_cache?select=fat_saturated_per_100g,sodium_per_100g,process_code&limit=1" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/custom_foods?select=fat_saturated_per_100g,vitamin_d_per_100g&limit=1" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
```

Expected: all three requests return `200` with a JSON array (even if empty/one row with `null` values) — NOT a `400`/`42703 column does not exist` error. If any curl fails, the migration did not land; stop and re-check with the user before proceeding.

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/20260824_food_extra_nutrients.sql
git commit -m "$(cat <<'EOF'
feat: rasva/natrium/kivennäisaine/vitamiini/valmistustapa-sarakkeet ruokatauluihin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of 6. Every later task depends on these columns existing — do not start Task 2 or Task 3 until Step 4's verification passes.

---

### Task 2: Fineli data import script

**Files:**
- Create: `scripts/import-fineli-extra-nutrients.mjs`

**Depends on:** Task 1 (columns must exist).

This populates the 13 new `fineli_foods` columns from Fineli's official open dataset (Release 18, THL, CC-BY 4.0), sourced via the GitHub mirror `mafredri/fineli-sql` since `fineli.fi` itself currently blocks automated requests (confirmed 403 during brainstorming, both plain and with a browser user-agent). The script only **updates existing** `fineli_foods` rows — it never inserts new food rows, matching the spec's explicit scope limit.

- [ ] **Step 1: Write the import script**

Create `scripts/import-fineli-extra-nutrients.mjs`:

```js
// One-time (re-runnable) import: pulls fat-split, sodium, mineral, vitamin, and
// processing-method data from Fineli's official open dataset (Release 18, THL,
// CC-BY 4.0) via the GitHub mirror https://github.com/mafredri/fineli-sql, and
// generates a SQL file that updates existing fineli_foods rows in place.
//
// Usage: node scripts/import-fineli-extra-nutrients.mjs
// Output: scripts/fineli-extra-nutrients-import.sql (paste into Supabase SQL editor)

const BASE = 'https://raw.githubusercontent.com/mafredri/fineli-sql/master/data/Fineli_Rel18_open';
const SB_URL = 'https://yznuzwbbyasgqeqllxic.supabase.co';
const SB_KEY = (() => {
  const html = require('node:fs').readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/const SB_KEY = '([^']*)'/);
  if (!m) throw new Error('SB_KEY not found in index.html');
  return m[1];
})();

// EUFDNAME -> our column name, plus whether the source unit needs conversion.
// All of these are already in the unit we want to store (see spec's unit table) —
// no conversion needed, unlike the pre-existing salt mg->g conversion which happens
// at read time in searchFineli(), not at import time.
const COMPONENT_MAP = {
  FASAT:  'fat_saturated_per_100g',
  FAMCIS: 'fat_mono_per_100g',
  FAPU:   'fat_poly_per_100g',
  FATRN:  'fat_trans_per_100g',
  NA:     'sodium_per_100g',
  CA:     'calcium_per_100g',
  K:      'potassium_per_100g',
  MG:     'magnesium_per_100g',
  FE:     'iron_per_100g',
  ZN:     'zinc_per_100g',
  VITC:   'vitamin_c_per_100g',
  VITD:   'vitamin_d_per_100g',
};

function parseCsv(text) {
  return text.trim().split('\n').map(line => line.replace(/\r$/, '').split(';'));
}

async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
  return parseCsv(await res.text());
}

function sqlNum(v) {
  if (v == null || v === '') return 'null';
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : 'null';
}

function sqlStr(v) {
  if (v == null || v === '') return 'null';
  return `'${v.replace(/'/g, "''")}'`;
}

async function main() {
  console.log('Fetching existing fineli_foods ids from Supabase...');
  const existingRes = await fetch(`${SB_URL}/rest/v1/fineli_foods?select=id`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!existingRes.ok) throw new Error(`Failed to fetch existing ids: ${existingRes.status}`);
  const existingIds = new Set((await existingRes.json()).map(r => String(r.id)));
  console.log(`${existingIds.size} existing fineli_foods rows.`);

  console.log('Fetching food.csv and component_value.csv from GitHub mirror...');
  const [foodRows, componentRows] = await Promise.all([
    fetchCsv('food.csv'),
    fetchCsv('component_value.csv'),
  ]);

  const foodHeader = foodRows[0];
  const foodIdIdx = foodHeader.indexOf('FOODID');
  const processIdx = foodHeader.indexOf('PROCESS');
  const processByFoodId = new Map();
  for (const row of foodRows.slice(1)) {
    const id = row[foodIdIdx];
    if (existingIds.has(id)) processByFoodId.set(id, row[processIdx]);
  }

  const cvHeader = componentRows[0];
  const cvFoodIdIdx = cvHeader.indexOf('FOODID');
  const cvNameIdx = cvHeader.indexOf('EUFDNAME');
  const cvValueIdx = cvHeader.indexOf('BESTLOC');
  const valuesByFoodId = new Map(); // id -> { column: value }
  for (const row of componentRows.slice(1)) {
    const id = row[cvFoodIdIdx];
    if (!existingIds.has(id)) continue;
    const column = COMPONENT_MAP[row[cvNameIdx]];
    if (!column) continue;
    if (!valuesByFoodId.has(id)) valuesByFoodId.set(id, {});
    valuesByFoodId.get(id)[column] = row[cvValueIdx];
  }

  const columns = Object.values(COMPONENT_MAP);
  const lines = [
    '-- Generated by scripts/import-fineli-extra-nutrients.mjs — paste into Supabase SQL editor.',
    '-- Only updates fineli_foods rows that already exist locally; adds no new rows.',
  ];
  let rowCount = 0;
  for (const id of existingIds) {
    const values = valuesByFoodId.get(id);
    const process = processByFoodId.get(id);
    if (!values && !process) continue;
    const sets = columns
      .filter(col => values && values[col] !== undefined)
      .map(col => `${col} = ${sqlNum(values[col])}`);
    if (process) sets.push(`process_code = ${sqlStr(process)}`);
    if (sets.length === 0) continue;
    lines.push(`update fineli_foods set ${sets.join(', ')} where id = ${id};`);
    rowCount++;
  }

  require('node:fs').writeFileSync(
    new URL('./fineli-extra-nutrients-import.sql', import.meta.url),
    lines.join('\n') + '\n',
  );
  console.log(`Wrote ${rowCount} UPDATE statements to scripts/fineli-extra-nutrients-import.sql`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the script**

```bash
node scripts/import-fineli-extra-nutrients.mjs
```

Expected: prints the count of existing `fineli_foods` rows (should be several thousand), then "Wrote N UPDATE statements to scripts/fineli-extra-nutrients-import.sql" where N is close to (but possibly less than, since not every food has every component) that same count.

- [ ] **Step 3: Sanity-check the generated SQL**

```bash
wc -l scripts/fineli-extra-nutrients-import.sql
head -5 scripts/fineli-extra-nutrients-import.sql
grep -c "process_code" scripts/fineli-extra-nutrients-import.sql
```

Expected: a plausible number of `update` lines (thousands), each line syntactically a single `update fineli_foods set ... where id = <number>;`, most lines containing `process_code = '...'` since that field has near-universal coverage in Fineli.

- [ ] **Step 4: Ask the user to run the generated SQL**

Tell the user the file is large (likely 1-2 MB of SQL) and ask them to paste the full contents of `scripts/fineli-extra-nutrients-import.sql` into the Supabase Dashboard's SQL editor (project ref `yznuzwbbyasgqeqllxic`) and run it. Wait for their confirmation before continuing.

- [ ] **Step 5: Verify the data actually landed — do not skip this even if the user says it's done**

```bash
SB_KEY=$(grep -o "const SB_KEY = '[^']*'" index.html | sed "s/const SB_KEY = '//;s/'//")
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/fineli_foods?select=name_fi,fat_saturated_per_100g,sodium_per_100g,calcium_per_100g,process_code&fat_saturated_per_100g=not.is.null&limit=3" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
```

Expected: 3 rows with plausible non-null numeric values and a `process_code` like `"RAW"`, `"IND"`, `"BOIL"`, etc. — NOT an empty array (which would mean the paste didn't run or matched nothing).

- [ ] **Step 6: Commit the import script (not the generated SQL data file — it's a large derived artifact, not source)**

```bash
cat >> .gitignore <<'EOF'
scripts/fineli-extra-nutrients-import.sql
EOF
git add scripts/import-fineli-extra-nutrients.mjs .gitignore
git commit -m "$(cat <<'EOF'
feat: Fineli-tuontiskripti rasva/natrium/kivennäisaine/vitamiini-datalle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of 6, depends on Task 1. The script is dependency-free Node (built-in `fetch`, Node 26 confirmed available) — no `npm install` needed. If `require` inside an ESM (`.mjs`) file errors in the runtime being used, use `import { readFileSync } from 'node:fs'` at the top of the file instead and drop the two inline `require(...)` calls — verify with `node --check scripts/import-fineli-extra-nutrients.mjs` before running for real.

Full spec: `docs/superpowers/specs/2026-08-24-food-lisatiedot-design.md`.

## Before You Begin

Confirm the GitHub mirror URLs are still reachable before writing the full script — run `curl -sI https://raw.githubusercontent.com/mafredri/fineli-sql/master/data/Fineli_Rel18_open/food.csv` and expect `HTTP/2 200`. If it's not reachable, stop and ask for guidance rather than improvising a different data source.

## Your Job

1. Write and run the script exactly as specified
2. Verify with the exact commands (Steps 3 and 5)
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the script only ever produces `update ... where id = <existing id>` — never an `insert` — by construction (it only iterates `existingIds`).
- Confirm `sqlNum()` handles the Finnish decimal-comma format (e.g. `"12,34"` in `BESTLOC`) by replacing `,` with `.` before `parseFloat` — spot-check by grep'ing a few decimal values in the generated SQL file and confirming they use `.` not `,`.
- Confirm `sqlStr()` escapes single quotes (relevant if any `PROCESS` or component value ever contains one — unlikely for these controlled-vocabulary codes, but the guard should exist regardless).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output (row counts, sample data)
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 3: Fineli search → cache → recent-foods data flow

**Files:**
- Modify: `index.html` — `searchFineli()` (line ~4789), `runFoodSearch()`'s mapping (line ~4852), `ensureFoodCache()` (line ~5620), `confirmAddFood()`'s call site (line ~5670), `loadFoodDayEntries()` (line ~4472), `loadRecentFoods()` (line ~4750)

**Depends on:** Task 1 (migration must be live). Independent of Task 4 (different functions), both must land before Task 5 can be meaningfully tested end-to-end.

- [ ] **Step 1: Extend `searchFineli()`'s query and returned objects**

Find this exact block:

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
    // fineli_foods.salt_per_100g is stored in milligrams (unlike fiber/sugar, which are grams) —
    // convert to grams here so food_cache.salt_per_100g stays consistent with custom_foods
    // (entered directly in grams) and with entrySalt()'s gram-based math.
    salt: f.salt_per_100g != null ? f.salt_per_100g / 1000 : null,
  }));
}
```

Replace with:

```js
async function searchFineli(query) {
  const q = query.trim();
  const cols = 'id, name_fi, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, sugar_per_100g, salt_per_100g, fat_saturated_per_100g, fat_mono_per_100g, fat_poly_per_100g, fat_trans_per_100g, sodium_per_100g, calcium_per_100g, potassium_per_100g, magnesium_per_100g, iron_per_100g, zinc_per_100g, vitamin_c_per_100g, vitamin_d_per_100g, process_code';
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
    // fineli_foods.salt_per_100g is stored in milligrams (unlike fiber/sugar, which are grams) —
    // convert to grams here so food_cache.salt_per_100g stays consistent with custom_foods
    // (entered directly in grams) and with entrySalt()'s gram-based math.
    salt: f.salt_per_100g != null ? f.salt_per_100g / 1000 : null,
    fatSaturated: f.fat_saturated_per_100g,
    fatMono: f.fat_mono_per_100g,
    fatPoly: f.fat_poly_per_100g,
    fatTrans: f.fat_trans_per_100g,
    sodium: f.sodium_per_100g,
    calcium: f.calcium_per_100g,
    potassium: f.potassium_per_100g,
    magnesium: f.magnesium_per_100g,
    iron: f.iron_per_100g,
    zinc: f.zinc_per_100g,
    vitaminC: f.vitamin_c_per_100g,
    vitaminD: f.vitamin_d_per_100g,
    processCode: f.process_code,
  }));
}
```

- [ ] **Step 2: Extend `runFoodSearch()`'s mapping into `foodSearchItems`**

Find this exact block:

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
      fatSaturatedPer100g: item.fatSaturated,
      fatMonoPer100g: item.fatMono,
      fatPolyPer100g: item.fatPoly,
      fatTransPer100g: item.fatTrans,
      sodiumPer100g: item.sodium,
      calciumPer100g: item.calcium,
      potassiumPer100g: item.potassium,
      magnesiumPer100g: item.magnesium,
      ironPer100g: item.iron,
      zincPer100g: item.zinc,
      vitaminCPer100g: item.vitaminC,
      vitaminDPer100g: item.vitaminD,
      processCode: item.processCode,
      source: 'fineli',
      fineliId: item.id,
    }));
```

None of the new fields use `|| 0` — `null` here means Fineli doesn't have this value for this food, and that must survive into `food_cache` as a real `null`.

- [ ] **Step 3: Extend `ensureFoodCache()` and its upsert payload**

Find this exact block:

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

Replace with:

```js
async function ensureFoodCache(fineliId, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g, sugarPer100g, saltPer100g, fatSaturatedPer100g, fatMonoPer100g, fatPolyPer100g, fatTransPer100g, sodiumPer100g, calciumPer100g, potassiumPer100g, magnesiumPer100g, ironPer100g, zincPer100g, vitaminCPer100g, vitaminDPer100g, processCode) {
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
      fat_saturated_per_100g: fatSaturatedPer100g ?? null,
      fat_mono_per_100g: fatMonoPer100g ?? null,
      fat_poly_per_100g: fatPolyPer100g ?? null,
      fat_trans_per_100g: fatTransPer100g ?? null,
      sodium_per_100g: sodiumPer100g ?? null,
      calcium_per_100g: calciumPer100g ?? null,
      potassium_per_100g: potassiumPer100g ?? null,
      magnesium_per_100g: magnesiumPer100g ?? null,
      iron_per_100g: ironPer100g ?? null,
      zinc_per_100g: zincPer100g ?? null,
      vitamin_c_per_100g: vitaminCPer100g ?? null,
      vitamin_d_per_100g: vitaminDPer100g ?? null,
      process_code: processCode ?? null,
    }, { onConflict: 'fineli_id', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) { console.error('ensureFoodCache upsert failed:', error.message); throw error; }
  return data.id;
}
```

- [ ] **Step 4: Pass the new values through at the `ensureFoodCache()` call site in `confirmAddFood()`**

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
        foodModalSelected.fiberPer100g,
        foodModalSelected.sugarPer100g,
        foodModalSelected.saltPer100g,
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
        foodModalSelected.fatSaturatedPer100g,
        foodModalSelected.fatMonoPer100g,
        foodModalSelected.fatPolyPer100g,
        foodModalSelected.fatTransPer100g,
        foodModalSelected.sodiumPer100g,
        foodModalSelected.calciumPer100g,
        foodModalSelected.potassiumPer100g,
        foodModalSelected.magnesiumPer100g,
        foodModalSelected.ironPer100g,
        foodModalSelected.zincPer100g,
        foodModalSelected.vitaminCPer100g,
        foodModalSelected.vitaminDPer100g,
        foodModalSelected.processCode,
      );
    }
```

- [ ] **Step 5: Extend `loadFoodDayEntries()`'s joined select**

Find this exact block:

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

Replace with:

```js
async function loadFoodDayEntries(dateIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      id, meal_type, amount_g, kcal, protein_g, food_cache_id, custom_food_id,
      food_cache(name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g,salt_per_100g,fat_saturated_per_100g,fat_mono_per_100g,fat_poly_per_100g,fat_trans_per_100g,sodium_per_100g,calcium_per_100g,potassium_per_100g,magnesium_per_100g,iron_per_100g,zinc_per_100g,vitamin_c_per_100g,vitamin_d_per_100g,process_code),
      custom_foods(name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g,salt_per_100g,fat_saturated_per_100g,fat_mono_per_100g,fat_poly_per_100g,fat_trans_per_100g,sodium_per_100g,calcium_per_100g,potassium_per_100g,magnesium_per_100g,iron_per_100g,zinc_per_100g,vitamin_c_per_100g,vitamin_d_per_100g)
    `)
    .eq('logged_at', dateIso)
    .order('created_at', { ascending: true });
  if (error) { console.error('loadFoodDayEntries failed:', error.message); return []; }
  return data || [];
}
```

(`custom_foods` has no `process_code` column — omitted here, matching the schema from Task 1.)

- [ ] **Step 6: Fix `loadRecentFoods()` — it currently drops fiber/sugar/salt too, not just the new fields**

Find this exact block:

```js
async function loadRecentFoods() {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      food_cache_id, custom_food_id,
      food_cache(id,name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g),
      custom_foods(id,name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g)
    `)
    .gte('logged_at', localIso(from))
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.error('loadRecentFoods failed:', error.message); return []; }

  const counts = new Map();
  (data || []).forEach(row => {
    const isCache = !!row.food_cache_id;
    const food = isCache ? row.food_cache : row.custom_foods;
    if (!food) return;
    const key = (isCache ? 'cache:' : 'custom:') + food.id;
    if (!counts.has(key)) {
      counts.set(key, {
        name: isCache ? food.name_fi : food.name,
        kcalPer100g: food.kcal_per_100g,
        proteinPer100g: food.protein_per_100g,
        carbsPer100g: food.carbs_per_100g,
        fatPer100g: food.fat_per_100g,
        source: isCache ? 'cache' : 'custom',
        cacheId: isCache ? food.id : null,
        customId: isCache ? null : food.id,
        count: 0,
      });
    }
    counts.get(key).count++;
  });

  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}
```

Replace with:

```js
async function loadRecentFoods() {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      food_cache_id, custom_food_id,
      food_cache(id,name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g,salt_per_100g,fat_saturated_per_100g,fat_mono_per_100g,fat_poly_per_100g,fat_trans_per_100g,sodium_per_100g,calcium_per_100g,potassium_per_100g,magnesium_per_100g,iron_per_100g,zinc_per_100g,vitamin_c_per_100g,vitamin_d_per_100g,process_code),
      custom_foods(id,name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g,salt_per_100g,fat_saturated_per_100g,fat_mono_per_100g,fat_poly_per_100g,fat_trans_per_100g,sodium_per_100g,calcium_per_100g,potassium_per_100g,magnesium_per_100g,iron_per_100g,zinc_per_100g,vitamin_c_per_100g,vitamin_d_per_100g)
    `)
    .gte('logged_at', localIso(from))
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.error('loadRecentFoods failed:', error.message); return []; }

  const counts = new Map();
  (data || []).forEach(row => {
    const isCache = !!row.food_cache_id;
    const food = isCache ? row.food_cache : row.custom_foods;
    if (!food) return;
    const key = (isCache ? 'cache:' : 'custom:') + food.id;
    if (!counts.has(key)) {
      counts.set(key, {
        name: isCache ? food.name_fi : food.name,
        kcalPer100g: food.kcal_per_100g,
        proteinPer100g: food.protein_per_100g,
        carbsPer100g: food.carbs_per_100g,
        fatPer100g: food.fat_per_100g,
        fiberPer100g: food.fiber_per_100g,
        sugarPer100g: food.sugar_per_100g,
        saltPer100g: food.salt_per_100g,
        fatSaturatedPer100g: food.fat_saturated_per_100g,
        fatMonoPer100g: food.fat_mono_per_100g,
        fatPolyPer100g: food.fat_poly_per_100g,
        fatTransPer100g: food.fat_trans_per_100g,
        sodiumPer100g: food.sodium_per_100g,
        calciumPer100g: food.calcium_per_100g,
        potassiumPer100g: food.potassium_per_100g,
        magnesiumPer100g: food.magnesium_per_100g,
        ironPer100g: food.iron_per_100g,
        zincPer100g: food.zinc_per_100g,
        vitaminCPer100g: food.vitamin_c_per_100g,
        vitaminDPer100g: food.vitamin_d_per_100g,
        processCode: isCache ? food.process_code : null,
        source: isCache ? 'cache' : 'custom',
        cacheId: isCache ? food.id : null,
        customId: isCache ? null : food.id,
        count: 0,
      });
    }
    counts.get(key).count++;
  });

  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}
```

This is a real pre-existing gap, not new scope creep: `loadRecentFoods()` feeds the "Viimeksi käytetyt" quick-reuse list, the most common way foods get selected day-to-day. Without this fix, the Lisätiedot panel built in Task 5 would be empty every time a food is picked this way, even though the underlying `food_cache`/`custom_foods` row already has the data (note `salt_per_100g` on `food_cache` is already gram-converted at write time — no re-conversion needed here, only `searchFineli()`'s fresh-from-`fineli_foods` path needed the mg→g conversion).

- [ ] **Step 7: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_lisatiedot_check3.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_lisatiedot_check3.js
grep -n "fat_saturated_per_100g, fat_mono_per_100g" index.html
grep -c "vitamin_d_per_100g" index.html
grep -n "processCode: f.process_code" index.html
grep -n "foodModalSelected.processCode," index.html
grep -n "processCode: isCache ? food.process_code : null" index.html
```

Expected: `node --check` produces no output; at least 1 match for the first grep; the `vitamin_d_per_100g` count should be 5+ (searchFineli return, ensureFoodCache payload, loadFoodDayEntries × 2 joins, loadRecentFoods × 2 joins — 6 total); 1 match each for the other three greps.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: rasva/natrium/kivennäisaine/vitamiini-arvot Fineli-haun ja välimuistin läpi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of 6. `entrySource()`, `parseNum`, `sb`, `localIso` are pre-existing. Full spec: `docs/superpowers/specs/2026-08-24-food-lisatiedot-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm none of the 12 new fields use `|| 0` anywhere in this task's edits — trace a food missing `VITD` in Fineli: `f.vitamin_d_per_100g` is `null` from the query, stays `null` through `searchFineli()`'s return, `null` through `runFoodSearch()`'s mapping (`vitaminDPer100g: item.vitaminD`), and reaches `ensureFoodCache()`'s payload as `vitamin_d_per_100g: null` via `?? null` — never `0`.
- Confirm the `loadRecentFoods()` fix actually threads through: hand-trace a `food_cache` row with `fat_saturated_per_100g: 2.1` — it must appear as `fatSaturatedPer100g: 2.1` on the object returned in the array, not be silently dropped.
- Confirm `custom_foods` selects do NOT include `process_code` anywhere in this task (it has no such column) — grep for `custom_foods(` + `process_code` co-occurring on the same line and confirm zero matches.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 4: Custom-food form fields

**Files:**
- Modify: `index.html` — `food-search-step-custom` HTML block (line ~7455), `CUSTOM_FOOD_LABELS`/`setCustomFoodEntryMode()` (line ~5491), `createCustomFood()` (line ~5554), `saveCustomFoodAndContinue()` (line ~5569)

**Depends on:** Task 1 (migration must be live). Independent of Task 3 (touches different functions), both must land before Task 5 can be meaningfully tested end-to-end.

- [ ] **Step 1: Add the two collapsible field groups to the HTML**

Find this exact block:

```html
      <div class="form-row"><label id="custom-food-fat-label">Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <div class="form-row"><label id="custom-food-fiber-label">Kuitu/100g</label><input type="text" inputmode="decimal" id="custom-food-fiber" placeholder="valinnainen"></div>
      <div class="form-row"><label id="custom-food-sugar-label">Sokeri/100g</label><input type="text" inputmode="decimal" id="custom-food-sugar" placeholder="valinnainen"></div>
      <div class="form-row"><label id="custom-food-salt-label">Suola/100g</label><input type="text" inputmode="decimal" id="custom-food-salt" placeholder="valinnainen"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
```

Replace with:

```html
      <div class="form-row"><label id="custom-food-fat-label">Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <div class="form-row"><label id="custom-food-fiber-label">Kuitu/100g</label><input type="text" inputmode="decimal" id="custom-food-fiber" placeholder="valinnainen"></div>
      <div class="form-row"><label id="custom-food-sugar-label">Sokeri/100g</label><input type="text" inputmode="decimal" id="custom-food-sugar" placeholder="valinnainen"></div>
      <div class="form-row"><label id="custom-food-salt-label">Suola/100g</label><input type="text" inputmode="decimal" id="custom-food-salt" placeholder="valinnainen"></div>
      <div class="lisatiedot-toggle" id="custom-food-fats-toggle" onclick="toggleCollapsible('custom-food-fats-toggle','custom-food-fats-panel','Rasvat')">▸ Rasvat</div>
      <div class="lisatiedot-panel" id="custom-food-fats-panel" style="display:none">
        <div class="form-row"><label id="custom-food-fat-saturated-label">Tyydyttynyt rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat-saturated" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-fat-mono-label">Kertatyydyttymätön rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat-mono" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-fat-poly-label">Monityydyttymätön rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat-poly" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-fat-trans-label">Transrasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat-trans" placeholder="valinnainen"></div>
      </div>
      <div class="lisatiedot-toggle" id="custom-food-micros-toggle" onclick="toggleCollapsible('custom-food-micros-toggle','custom-food-micros-panel','Kivennäisaineet ja vitamiinit')">▸ Kivennäisaineet ja vitamiinit</div>
      <div class="lisatiedot-panel" id="custom-food-micros-panel" style="display:none">
        <div class="form-row"><label id="custom-food-sodium-label">Natrium/100g</label><input type="text" inputmode="decimal" id="custom-food-sodium" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-calcium-label">Kalsium/100g</label><input type="text" inputmode="decimal" id="custom-food-calcium" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-potassium-label">Kalium/100g</label><input type="text" inputmode="decimal" id="custom-food-potassium" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-magnesium-label">Magnesium/100g</label><input type="text" inputmode="decimal" id="custom-food-magnesium" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-iron-label">Rauta/100g</label><input type="text" inputmode="decimal" id="custom-food-iron" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-zinc-label">Sinkki/100g</label><input type="text" inputmode="decimal" id="custom-food-zinc" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-vitamin-c-label">C-vitamiini/100g</label><input type="text" inputmode="decimal" id="custom-food-vitamin-c" placeholder="valinnainen"></div>
        <div class="form-row"><label id="custom-food-vitamin-d-label">D-vitamiini/100g</label><input type="text" inputmode="decimal" id="custom-food-vitamin-d" placeholder="valinnainen"></div>
      </div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
```

(`.lisatiedot-toggle`/`.lisatiedot-panel` CSS classes and the `toggleCollapsible()` function are added in Task 5 — this task's HTML/JS references them but Task 5 makes them actually styled/functional. If Task 5 hasn't landed yet when testing this task in isolation, the toggles will still work functionally via `style.display` but look like plain unstyled text — that's expected and resolves once Task 5 lands.)

- [ ] **Step 2: Extend `CUSTOM_FOOD_LABELS`, add `CUSTOM_FOOD_FIELD_IDS`, rewrite `setCustomFoodEntryMode()`**

Find this exact block:

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

Replace with:

```js
const CUSTOM_FOOD_LABELS = {
  '100g': {
    kcal: 'Kcal/100g', protein: 'Proteiini/100g', carbs: 'Hiilarit/100g', fat: 'Rasva/100g',
    fiber: 'Kuitu/100g', sugar: 'Sokeri/100g', salt: 'Suola/100g',
    fatSaturated: 'Tyydyttynyt rasva/100g', fatMono: 'Kertatyydyttymätön rasva/100g',
    fatPoly: 'Monityydyttymätön rasva/100g', fatTrans: 'Transrasva/100g',
    sodium: 'Natrium/100g', calcium: 'Kalsium/100g', potassium: 'Kalium/100g',
    magnesium: 'Magnesium/100g', iron: 'Rauta/100g', zinc: 'Sinkki/100g',
    vitaminC: 'C-vitamiini/100g', vitaminD: 'D-vitamiini/100g',
  },
  'annos': {
    kcal: 'Kcal/annos', protein: 'Proteiini/annos', carbs: 'Hiilarit/annos', fat: 'Rasva/annos',
    fiber: 'Kuitu/annos', sugar: 'Sokeri/annos', salt: 'Suola/annos',
    fatSaturated: 'Tyydyttynyt rasva/annos', fatMono: 'Kertatyydyttymätön rasva/annos',
    fatPoly: 'Monityydyttymätön rasva/annos', fatTrans: 'Transrasva/annos',
    sodium: 'Natrium/annos', calcium: 'Kalsium/annos', potassium: 'Kalium/annos',
    magnesium: 'Magnesium/annos', iron: 'Rauta/annos', zinc: 'Sinkki/annos',
    vitaminC: 'C-vitamiini/annos', vitaminD: 'D-vitamiini/annos',
  },
};

// Maps each label/value key to its input-element id suffix (e.g. custom-food-fat-saturated).
const CUSTOM_FOOD_FIELD_IDS = {
  kcal: 'kcal', protein: 'protein', carbs: 'carbs', fat: 'fat',
  fiber: 'fiber', sugar: 'sugar', salt: 'salt',
  fatSaturated: 'fat-saturated', fatMono: 'fat-mono', fatPoly: 'fat-poly', fatTrans: 'fat-trans',
  sodium: 'sodium', calcium: 'calcium', potassium: 'potassium', magnesium: 'magnesium', iron: 'iron', zinc: 'zinc',
  vitaminC: 'vitamin-c', vitaminD: 'vitamin-d',
};

// The subset of CUSTOM_FOOD_FIELD_IDS that are optional/null-preserving (everything
// except kcal/protein/carbs/fat, which keep their existing required/|| 0 behavior).
const CUSTOM_FOOD_OPTIONAL_FIELDS = ['fiber', 'sugar', 'salt', 'fatSaturated', 'fatMono', 'fatPoly', 'fatTrans', 'sodium', 'calcium', 'potassium', 'magnesium', 'iron', 'zinc', 'vitaminC', 'vitaminD'];

let customFoodEntryMode = '100g';

function setCustomFoodEntryMode(mode, btn) {
  customFoodEntryMode = mode;
  ['custom-food-mode-100g', 'custom-food-mode-annos'].forEach(id => document.getElementById(id).classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('custom-food-servingsize-row').style.display = mode === 'annos' ? '' : 'none';
  const labels = CUSTOM_FOOD_LABELS[mode];
  Object.entries(CUSTOM_FOOD_FIELD_IDS).forEach(([key, idSuffix]) => {
    document.getElementById(`custom-food-${idSuffix}-label`).textContent = labels[key];
    document.getElementById(`custom-food-${idSuffix}`).value = '';
  });
}
```

- [ ] **Step 3: Extend `createCustomFood()`**

Find this exact block:

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

Replace with:

```js
async function createCustomFood({ name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g, sugarPer100g, saltPer100g, fatSaturatedPer100g, fatMonoPer100g, fatPolyPer100g, fatTransPer100g, sodiumPer100g, calciumPer100g, potassiumPer100g, magnesiumPer100g, ironPer100g, zincPer100g, vitaminCPer100g, vitaminDPer100g }) {
  const { data, error } = await sb.from('custom_foods').insert({
    name,
    kcal_per_100g: kcalPer100g,
    protein_per_100g: proteinPer100g,
    carbs_per_100g: carbsPer100g,
    fat_per_100g: fatPer100g,
    fiber_per_100g: fiberPer100g ?? null,
    sugar_per_100g: sugarPer100g ?? null,
    salt_per_100g: saltPer100g ?? null,
    fat_saturated_per_100g: fatSaturatedPer100g ?? null,
    fat_mono_per_100g: fatMonoPer100g ?? null,
    fat_poly_per_100g: fatPolyPer100g ?? null,
    fat_trans_per_100g: fatTransPer100g ?? null,
    sodium_per_100g: sodiumPer100g ?? null,
    calcium_per_100g: calciumPer100g ?? null,
    potassium_per_100g: potassiumPer100g ?? null,
    magnesium_per_100g: magnesiumPer100g ?? null,
    iron_per_100g: ironPer100g ?? null,
    zinc_per_100g: zincPer100g ?? null,
    vitamin_c_per_100g: vitaminCPer100g ?? null,
    vitamin_d_per_100g: vitaminDPer100g ?? null,
  }).select('id').single();
  if (error) { console.error('createCustomFood failed:', error.message); throw error; }
  return data.id;
}
```

- [ ] **Step 4: Rewrite `saveCustomFoodAndContinue()`**

Find this exact block:

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

Replace with:

```js
async function saveCustomFoodAndContinue() {
  const name = document.getElementById('custom-food-name').value.trim();
  let kcal = parseNum('custom-food-kcal');
  let protein = parseNum('custom-food-protein');
  let carbs = parseNum('custom-food-carbs');
  let fat = parseNum('custom-food-fat');
  const extra = {};
  CUSTOM_FOOD_OPTIONAL_FIELDS.forEach(key => {
    extra[key] = parseNum(`custom-food-${CUSTOM_FOOD_FIELD_IDS[key]}`);
  });
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
    CUSTOM_FOOD_OPTIONAL_FIELDS.forEach(key => {
      extra[key] = extra[key] != null ? extra[key] * 100 / servingSize : null;
    });
  }
  const btn = document.getElementById('custom-food-save-btn');
  btn.disabled = true;
  try {
    const id = await createCustomFood({
      name, kcalPer100g: kcal, proteinPer100g: protein || 0, carbsPer100g: carbs || 0, fatPer100g: fat || 0,
      fiberPer100g: extra.fiber, sugarPer100g: extra.sugar, saltPer100g: extra.salt,
      fatSaturatedPer100g: extra.fatSaturated, fatMonoPer100g: extra.fatMono, fatPolyPer100g: extra.fatPoly, fatTransPer100g: extra.fatTrans,
      sodiumPer100g: extra.sodium, calciumPer100g: extra.calcium, potassiumPer100g: extra.potassium, magnesiumPer100g: extra.magnesium,
      ironPer100g: extra.iron, zincPer100g: extra.zinc, vitaminCPer100g: extra.vitaminC, vitaminDPer100g: extra.vitaminD,
    });
    foodModalSelected = {
      name,
      kcalPer100g: kcal,
      proteinPer100g: protein || 0,
      carbsPer100g: carbs || 0,
      fatPer100g: fat || 0,
      fiberPer100g: extra.fiber, sugarPer100g: extra.sugar, saltPer100g: extra.salt,
      fatSaturatedPer100g: extra.fatSaturated, fatMonoPer100g: extra.fatMono, fatPolyPer100g: extra.fatPoly, fatTransPer100g: extra.fatTrans,
      sodiumPer100g: extra.sodium, calciumPer100g: extra.calcium, potassiumPer100g: extra.potassium, magnesiumPer100g: extra.magnesium,
      ironPer100g: extra.iron, zincPer100g: extra.zinc, vitaminCPer100g: extra.vitaminC, vitaminDPer100g: extra.vitaminD,
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

This also fixes a second pre-existing gap: the previous version of this function never put `fiberPer100g`/`sugarPer100g`/`saltPer100g` onto `foodModalSelected` at all after saving a custom food — so a custom food you'd just finished filling in would show nothing in the (Task 5) Lisätiedot panel immediately after creation, even though you'd literally just typed those values. Now `foodModalSelected` carries everything through, matching what's actually in the database row that was just inserted.

- [ ] **Step 5: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_lisatiedot_check4.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_lisatiedot_check4.js
grep -n 'id="custom-food-fat-saturated"' index.html
grep -n 'id="custom-food-vitamin-d"' index.html
grep -n "const CUSTOM_FOOD_FIELD_IDS" index.html
grep -n "const CUSTOM_FOOD_OPTIONAL_FIELDS" index.html
grep -n "fatSaturatedPer100g: extra.fatSaturated" index.html
```

Expected: `node --check` produces no output; 1 match each for the five greps.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: oman tuotteen rasva/natrium/kivennäisaine/vitamiini-kentät

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of 6, independent of Task 3 (different functions), both depend on Task 1's migration. `parseNum`, `showStatus`, `goToAmountStep` are pre-existing. `toggleCollapsible()` is added in Task 5 — this task's HTML calls it, but it doesn't need to exist yet for this task's own verification (the `node --check` syntax check doesn't require the function to be defined, only referenced).

Full spec: `docs/superpowers/specs/2026-08-24-food-lisatiedot-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `CUSTOM_FOOD_OPTIONAL_FIELDS`-driven parsing in `saveCustomFoodAndContinue()` preserves `null` for a blank field all the way to the insert payload — trace leaving "Rauta/100g" blank: `parseNum('custom-food-iron')` returns `null`, `extra.iron` is `null`, the annos-conversion ternary's `!= null` check is false so it stays `null`, and `createCustomFood()`'s `iron_per_100g: ironPer100g ?? null` payload gets `null`, not `0`.
- Confirm `foodModalSelected` after a custom-food save now includes all 15 optional fields (fiber/sugar/salt + 12 new) — this was the gap described in Step 4, verify it's actually fixed and not just described.
- Confirm `setCustomFoodEntryMode()`'s generic loop actually clears and relabels all 19 fields (4 required + 15 optional) by counting `Object.keys(CUSTOM_FOOD_FIELD_IDS).length` mentally against the HTML — should be 19, matching every `custom-food-*-label`/`custom-food-*` id pair added in Step 1 plus the 4 pre-existing required ones.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 5: Lisätiedot panel in the amount-entry step

**Files:**
- Modify: `index.html` — new CSS (near line ~955), new HTML in `food-search-step-amount` (near line ~7439), new `LISATIEDOT_FIELDS` config + `toggleCollapsible()`/`renderLisatiedotPanel()` functions + wiring into `goToAmountStep()`/`updateFoodAmountPreview()` (near line ~5427-5489)

**Depends on:** Task 3 and Task 4 (needs real data flowing through `foodModalSelected` from both the Fineli-search and custom-food paths to be meaningfully testable, though the panel itself will render — just empty/hidden — even without them).

- [ ] **Step 1: Add the CSS**

Find this exact block:

```css
.food-amount-presets { display:flex; gap:6px; margin-bottom:14px; }
.food-amount-presets .stab { flex:1; }
```

Replace with:

```css
.food-amount-presets { display:flex; gap:6px; margin-bottom:14px; }
.food-amount-presets .stab { flex:1; }

.lisatiedot-badge { font-size:13px; color:var(--text2); margin:-8px 0 10px; }
.lisatiedot-toggle { font-size:13px; color:var(--accent); cursor:pointer; margin:-4px 0 10px; user-select:none; }
.lisatiedot-panel { margin:-4px 0 14px; padding:10px 12px; background:var(--surface2); border-radius:10px; }
.lisatiedot-section { margin-bottom:8px; }
.lisatiedot-section:last-child { margin-bottom:0; }
.lisatiedot-section-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; color:var(--text2); margin-bottom:4px; }
.lisatiedot-row { display:flex; justify-content:space-between; font-size:13px; color:var(--text); padding:2px 0; }
```

- [ ] **Step 2: Add the badge + toggle + panel HTML**

Find this exact block:

```html
    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="form-row"><label>Ateria</label><select id="food-amount-meal" onchange="foodModalMeal = this.value"></select></div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100" oninput="updateFoodAmountPreview()"></div>
      <div id="food-amount-preview" style="font-size:13px;color:var(--text2);margin:-4px 0 10px;"></div>
      <div class="food-amount-presets">
```

Replace with:

```html
    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="lisatiedot-badge" id="food-amount-process-badge" style="display:none"></div>
      <div class="form-row"><label>Ateria</label><select id="food-amount-meal" onchange="foodModalMeal = this.value"></select></div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100" oninput="updateFoodAmountPreview()"></div>
      <div id="food-amount-preview" style="font-size:13px;color:var(--text2);margin:-4px 0 10px;"></div>
      <div class="lisatiedot-toggle" id="food-amount-lisatiedot-toggle" style="display:none" onclick="toggleCollapsible('food-amount-lisatiedot-toggle','food-amount-lisatiedot-panel','Lisätiedot')">▸ Lisätiedot</div>
      <div class="lisatiedot-panel" id="food-amount-lisatiedot-panel" style="display:none"></div>
      <div class="food-amount-presets">
```

- [ ] **Step 3: Add `LISATIEDOT_FIELDS`, `toggleCollapsible()`, `renderLisatiedotPanel()`, and wire them into `goToAmountStep()`/`updateFoodAmountPreview()`**

Find this exact block:

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

function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
  updateFoodAmountPreview();
}
```

Replace with:

```js
const LISATIEDOT_FIELDS = [
  { key: 'fiberPer100g',        label: 'Kuitu',                    unit: 'g',  decimals: 1, section: 'Hiilihydraatit' },
  { key: 'sugarPer100g',        label: 'Sokeri',                   unit: 'g',  decimals: 1, section: 'Hiilihydraatit' },
  { key: 'fatSaturatedPer100g', label: 'Tyydyttynyt rasva',        unit: 'g',  decimals: 1, section: 'Rasvat' },
  { key: 'fatMonoPer100g',      label: 'Kertatyydyttymätön rasva', unit: 'g',  decimals: 1, section: 'Rasvat' },
  { key: 'fatPolyPer100g',      label: 'Monityydyttymätön rasva',  unit: 'g',  decimals: 1, section: 'Rasvat' },
  { key: 'fatTransPer100g',     label: 'Transrasva',               unit: 'g',  decimals: 1, section: 'Rasvat' },
  { key: 'saltPer100g',         label: 'Suola',                    unit: 'g',  decimals: 2, section: 'Kivennäisaineet' },
  { key: 'sodiumPer100g',       label: 'Natrium',                  unit: 'mg', decimals: 0, section: 'Kivennäisaineet' },
  { key: 'calciumPer100g',      label: 'Kalsium',                  unit: 'mg', decimals: 0, section: 'Kivennäisaineet' },
  { key: 'potassiumPer100g',    label: 'Kalium',                   unit: 'mg', decimals: 0, section: 'Kivennäisaineet' },
  { key: 'magnesiumPer100g',    label: 'Magnesium',                unit: 'mg', decimals: 0, section: 'Kivennäisaineet' },
  { key: 'ironPer100g',         label: 'Rauta',                    unit: 'mg', decimals: 1, section: 'Kivennäisaineet' },
  { key: 'zincPer100g',         label: 'Sinkki',                   unit: 'mg', decimals: 1, section: 'Kivennäisaineet' },
  { key: 'vitaminCPer100g',     label: 'C-vitamiini',              unit: 'mg', decimals: 0, section: 'Vitamiinit' },
  { key: 'vitaminDPer100g',     label: 'D-vitamiini',              unit: 'µg', decimals: 1, section: 'Vitamiinit' },
];

const LISATIEDOT_SECTION_ORDER = ['Hiilihydraatit', 'Rasvat', 'Kivennäisaineet', 'Vitamiinit'];

function toggleCollapsible(headerId, panelId, label) {
  const panel = document.getElementById(panelId);
  const header = document.getElementById(headerId);
  const opening = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = opening ? 'block' : 'none';
  header.textContent = (opening ? '▾ ' : '▸ ') + label;
}

function renderLisatiedotPanel(grams) {
  const toggle = document.getElementById('food-amount-lisatiedot-toggle');
  const panel = document.getElementById('food-amount-lisatiedot-panel');
  const badge = document.getElementById('food-amount-process-badge');
  if (!toggle || !panel || !foodModalSelected) return;

  const sel = foodModalSelected;
  const hasAnyData = LISATIEDOT_FIELDS.some(f => sel[f.key] != null);
  toggle.style.display = hasAnyData ? '' : 'none';
  if (!hasAnyData) panel.style.display = 'none';

  if (sel.processCode === 'RAW') {
    badge.textContent = '🟢 Käsittelemätön';
    badge.style.display = '';
  } else if (sel.processCode) {
    badge.textContent = '🟠 Prosessoitu';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }

  const bySection = new Map();
  LISATIEDOT_SECTION_ORDER.forEach(s => bySection.set(s, []));
  LISATIEDOT_FIELDS.forEach(f => {
    const raw = sel[f.key];
    if (raw == null) return;
    const scaled = raw * grams / 100;
    const factor = Math.pow(10, f.decimals);
    const value = Math.round(scaled * factor) / factor;
    bySection.get(f.section).push(`<div class="lisatiedot-row"><span>${f.label}</span><span>${value}${f.unit}</span></div>`);
  });

  panel.innerHTML = LISATIEDOT_SECTION_ORDER
    .filter(s => bySection.get(s).length > 0)
    .map(s => `<div class="lisatiedot-section"><div class="lisatiedot-section-title">${s}</div>${bySection.get(s).join('')}</div>`)
    .join('');
}

function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  const mealSelect = document.getElementById('food-amount-meal');
  mealSelect.innerHTML = MEAL_DEFS.map(m => `<option value="${m.key}">${m.icon} ${m.label}</option>`).join('');
  mealSelect.value = foodModalMeal;
  document.getElementById('food-amount-grams').value = 100;
  document.getElementById('food-amount-lisatiedot-panel').style.display = 'none';
  document.getElementById('food-amount-lisatiedot-toggle').textContent = '▸ Lisätiedot';
  updateFoodAmountPreview();
  loadLastUsedAmount();
}

function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
  updateFoodAmountPreview();
}
```

- [ ] **Step 4: Call `renderLisatiedotPanel()` from `updateFoodAmountPreview()`**

Find this exact block:

```js
function updateFoodAmountPreview() {
  const el = document.getElementById('food-amount-preview');
  if (!el || !foodModalSelected) return;
  const grams = parseFloat(document.getElementById('food-amount-grams').value) || 0;
  const kcal    = Math.round(foodModalSelected.kcalPer100g * grams / 100);
  const protein = Math.round(foodModalSelected.proteinPer100g * grams / 100 * 10) / 10;
  const carbs   = Math.round(foodModalSelected.carbsPer100g * grams / 100 * 10) / 10;
  const fat     = Math.round(foodModalSelected.fatPer100g * grams / 100 * 10) / 10;
  el.textContent = `${kcal} kcal · ${protein}g proteiini · ${carbs}g hiilarit · ${fat}g rasva`;
}
```

Replace with:

```js
function updateFoodAmountPreview() {
  const el = document.getElementById('food-amount-preview');
  if (!el || !foodModalSelected) return;
  const grams = parseFloat(document.getElementById('food-amount-grams').value) || 0;
  const kcal    = Math.round(foodModalSelected.kcalPer100g * grams / 100);
  const protein = Math.round(foodModalSelected.proteinPer100g * grams / 100 * 10) / 10;
  const carbs   = Math.round(foodModalSelected.carbsPer100g * grams / 100 * 10) / 10;
  const fat     = Math.round(foodModalSelected.fatPer100g * grams / 100 * 10) / 10;
  el.textContent = `${kcal} kcal · ${protein}g proteiini · ${carbs}g hiilarit · ${fat}g rasva`;
  renderLisatiedotPanel(grams);
}
```

- [ ] **Step 5: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_lisatiedot_check5.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_lisatiedot_check5.js
grep -n "function toggleCollapsible" index.html
grep -n "function renderLisatiedotPanel" index.html
grep -n "const LISATIEDOT_FIELDS" index.html
grep -n "renderLisatiedotPanel(grams);" index.html
grep -n 'id="food-amount-process-badge"' index.html
```

Expected: `node --check` produces no output; 1 match each for the five greps.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Lisätiedot-paneeli ruoan määräaskeleeseen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 5 of 6. `foodModalSelected` (Tasks 3-4), `--accent`/`--surface2`/`--text`/`--text2` CSS variables (pre-existing) are required. `toggleCollapsible()` is also referenced by Task 4's custom-food-form HTML — if Task 4 landed first, its toggles will start working correctly the moment this task's `toggleCollapsible()` definition lands; if this task lands first, Task 4's toggles simply don't exist as clickable elements yet, which is fine since they're added together before Task 6's manual testing.

Full spec: `docs/superpowers/specs/2026-08-24-food-lisatiedot-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace `renderLisatiedotPanel(200)` for a `foodModalSelected` with `fiberPer100g: 5, sugarPer100g: null, vitaminDPer100g: 1.2`, everything else `null`: fiber row shows `10g` (5×200/100=10, 1 decimal), sugar is skipped (null), vitamin D row shows `2.4µg` (1.2×2=2.4, 1 decimal) — confirm the "Hiilihydraatit" section only contains the Kuitu row (not an empty Sokeri row), and "Vitamiinit" only contains D, not an empty C row.
- Confirm `hasAnyData` correctly hides the whole toggle (not just an empty panel) when a custom food has zero optional fields filled in — trace `LISATIEDOT_FIELDS.some(f => sel[f.key] != null)` when every one of the 15 keys is `undefined` on `sel`: `some()` returns `false`, `toggle.style.display = 'none'`.
- Confirm the process badge logic correctly distinguishes all three cases: `processCode: 'RAW'` → green/Käsittelemätön; `processCode: 'BOIL'` (or any other non-RAW truthy code) → orange/Prosessoitu; `processCode: null` or `undefined` (custom foods, or a Fineli food with no PROCESS value) → badge hidden entirely, not shown as an empty/blank badge.
- Confirm `goToAmountStep()`'s panel-reset happens before `updateFoodAmountPreview()` is called (so a freshly-opened food starts collapsed even if the previous food had it expanded) — check the line order.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the three hand-traced scenarios
- Any issues or concerns

---

### Task 6: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Search for and select a Fineli food with rich data** (e.g. a whole-grain bread — should have fiber, sugar, salt, sodium, some minerals, and a `process_code`). Confirm the process badge appears and reads correctly, tap "▸ Lisätiedot" and confirm it expands with grouped sections showing plausible values, change the grams field and confirm values scale live.

- [ ] **Step 3: Search for and select a Fineli food likely to have sparse data** (e.g. something obscure or a pure-fat item where several minerals/vitamins are genuinely absent from Fineli) — confirm missing fields are simply absent from the panel (no "0mg" rows, no empty sections shown).

- [ ] **Step 4: Pick a food from "Viimeksi käytetyt"** (requires having logged at least one food previously — log one first if needed) — confirm the Lisätiedot panel populates correctly for this path too (this is the `loadRecentFoods()` fix from Task 3).

- [ ] **Step 5: Create a custom food, filling in all fields including the two collapsible "Rasvat" and "Kivennäisaineet ja vitamiinit" groups** — log it, confirm the amount step immediately shows the Lisätiedot panel with the values just entered (this is the `saveCustomFoodAndContinue()` fix from Task 4), including correct scaling if "Per annos" mode was used.

- [ ] **Step 6: Create a second custom food leaving all optional fields blank** — confirm no console error, and confirm the Lisätiedot toggle does not appear at all for this food (since `hasAnyData` is false).

- [ ] **Step 7: Confirm the existing day-total fiber/sugar/salt card (from the prior nutrient-strip feature) still works correctly** — this feature touches `loadFoodDayEntries()` and `loadRecentFoods()`, both of which the day-total card also depends on; log a food and confirm the card's numbers are still correct, not broken by the new columns being added to the same select statements.

- [ ] **Step 8: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 9: Clean up test data** — delete the test `food_log_entries` and `custom_foods` rows created during testing directly via the Supabase client in the browser console (query first to get exact ids, then delete only those, being careful not to touch the user's real pre-existing data). Verify with a follow-up select that nothing test-related remains.

- [ ] **Step 10: Clean up** — stop the local server, close the tab.

- [ ] **Step 11: Dispatch a final code reviewer** for the combined diff across Tasks 1-5, covering: null-vs-zero handling throughout (search → cache → recent-foods → custom-food → render), the migration's safety (`add column if not exists`, nullable, no data loss), the import script's scope (updates only, no inserts), the two pre-existing-gap fixes (`loadRecentFoods()`, post-save `foodModalSelected`), and that `food_log_entries` was never touched.

- [ ] **Step 12: If issues are found, fix them and re-review until approved.**

- [ ] **Step 13: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (data source/import) → Task 2. §2 (schema: 12 numeric + `process_code`, table-by-table scope) → Task 1. §3 (data flow: `searchFineli`/`ensureFoodCache`/`createCustomFood`/`loadFoodDayEntries`, plus the newly-discovered `loadRecentFoods()` and post-save `foodModalSelected` gaps) → Tasks 3-4. §4 (UI: amount-step Lisätiedot panel with sections + process badge, custom-food form's two collapsible groups) → Tasks 4-5. §6 exclusions (no vegetable-%, no added-sugar split, no `food_log_entries` changes, no new day-level card, no custom-food processing classification) — respected throughout; Task 6 Step 7 explicitly re-verifies the existing day-total card is undisturbed.
- **Type/name consistency:** camelCase JS keys (`fatSaturatedPer100g`, `sodiumPer100g`, etc.) and snake_case DB columns (`fat_saturated_per_100g`, `sodium_per_100g`, etc.) used identically across Tasks 1, 3, 4, 5. `CUSTOM_FOOD_FIELD_IDS`/`CUSTOM_FOOD_OPTIONAL_FIELDS` (Task 4) and `LISATIEDOT_FIELDS` (Task 5) intentionally use different key naming (`fatSaturated` short-form vs. `fatSaturatedPer100g` full param name) because they serve different purposes — the former maps to HTML id suffixes and `createCustomFood()` parameter names, the latter maps directly to `foodModalSelected` property names; each is internally consistent within its own task.
- **No placeholders:** exact before/after code throughout, exact commands, exact expected output; self-review sections include concrete hand-traced scenarios (null propagation, section-hiding, badge branching) rather than "verify it works."
