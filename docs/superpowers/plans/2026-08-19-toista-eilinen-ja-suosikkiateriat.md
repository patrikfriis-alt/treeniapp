# Toista eilinen & Suosikkiateriat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two quick-add mechanisms on the Ruoka (food) page's meal cards: a "Toista eilinen" button that copies the previous day's entries for that meal type, and a "Tallenna suosikiksi" button that saves the current meal's entries as a named, reusable template surfaced in a new "Suosikit" section of food search.

**Architecture:** "Toista eilinen" is a pure copy operation over existing `food_log_entries` rows — no new schema. Favorites need two new tables (`meal_templates`, `meal_template_items`) mirroring `food_log_entries`' shape. Both mechanisms funnel through the existing `addFoodLogEntry()` helper or a direct bulk insert, matching established patterns (`sbWrite()` for the offline-queued daily-logging path, plain `sb.from()` for the non-critical favorites-management path — same split already used by `createCustomFood()`/`ensureFoodCache()` vs. `addFoodLogEntry()`).

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-19-toista-eilinen-ja-suosikkiateriat-design.md`

---

### Task 1: Database migration — `meal_templates` & `meal_template_items`

**Files:**
- Create: `supabase/migrations/20260819_meal_templates.sql`

**Depends on:** none.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260819_meal_templates.sql`:

```sql
-- Suosikkiateriat: nimetyt, uudelleenkäytettävät ateriamallit

create table meal_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table meal_template_items (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references meal_templates(id) on delete cascade,
  food_cache_id  bigint references food_cache(id) on delete restrict,
  custom_food_id uuid references custom_foods(id) on delete restrict,
  amount_g       numeric not null check (amount_g > 0),
  constraint meal_template_items_one_source check (
    (food_cache_id is not null)::int + (custom_food_id is not null)::int = 1
  )
);

create index meal_template_items_template_id_idx on meal_template_items (template_id);

-- RLS — sama malli kuin food_log_entries ym.: ei Supabase Authia käytössä
-- (pelkkä anon-avain), joten "omistajuus" on nimellinen, ei auth.uid()-pakotettu.
alter table meal_templates enable row level security;
alter table meal_template_items enable row level security;

create policy meal_templates_select on meal_templates
  for select to anon, authenticated using (true);
create policy meal_templates_insert on meal_templates
  for insert to anon, authenticated with check (true);
create policy meal_templates_delete on meal_templates
  for delete to anon, authenticated using (true);

create policy meal_template_items_select on meal_template_items
  for select to anon, authenticated using (true);
create policy meal_template_items_insert on meal_template_items
  for insert to anon, authenticated with check (true);
```

Column types matter here: `food_cache_id` is `bigint` (matches `food_cache.id`, which is `bigint generated always as identity`), `custom_food_id` is `uuid` (matches `custom_foods.id`, which is `uuid default gen_random_uuid()`) — these are two DIFFERENT types, copy them exactly as shown, do not make both the same type. The `meal_template_items_one_source` check constraint mirrors the existing `food_log_entries_one_source` constraint (see `supabase/migrations/20260706_food_diary.sql`) — exactly one of the two food references must be set, never both, never neither.

No `update` policy on either table and no `delete` policy on `meal_template_items` — per spec, favorites are never edited in place, and deleting a `meal_templates` row cascades to its items automatically (`on delete cascade`), so `meal_template_items` never needs a direct delete policy.

- [ ] **Step 2: Verify the file**

```bash
cat supabase/migrations/20260819_meal_templates.sql
```

Read it back and confirm: both tables present, both type choices correct (`bigint` vs `uuid`), the one-source check constraint present on `meal_template_items`, RLS enabled on both tables with the policies listed above (no more, no less).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819_meal_templates.sql
git commit -m "$(cat <<'EOF'
feat: meal_templates ja meal_template_items -taulut suosikkiaterioille

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: STOP — do not deploy this migration yourself**

Applying a migration touches the live, shared production Supabase project (ref `yznuzwbbyasgqeqllxic`), not just this worktree. **Report DONE and stop here without running `supabase db push` or any other deploy command.** The controller (main session) will apply and verify the migration against the live database directly before Task 3 begins, the same way live-credential/live-state steps are handled elsewhere in this plan (see Task 5).

## Context

This is Task 1 of a 6-task plan. Nothing depends on this migration except Tasks 3 and 4 (the favorites feature) — Task 2 ("Toista eilinen") uses only the pre-existing `food_log_entries` table and has no dependency on this migration, so it can safely be implemented in parallel by a human, but this plan executes tasks sequentially regardless.

Full spec: `docs/superpowers/specs/2026-08-19-toista-eilinen-ja-suosikkiateriat-design.md`.

## Before You Begin

If you have any doubt about the exact column types (`food_cache_id` bigint vs `custom_food_id` uuid) or the check constraint syntax, re-read `supabase/migrations/20260706_food_diary.sql` in this repo first — it's the exact table this migration's shape is modeled on.

## Your Job

1. Write the migration file exactly as specified
2. Verify by reading it back
3. Commit with the exact message
4. Self-review (see below)
5. Report back — **do NOT deploy**

## Before Reporting Back: Self-Review

- Confirm `food_cache_id` is `bigint` and `custom_food_id` is `uuid` — swapping these would silently break every insert.
- Confirm the check constraint uses the exact same `(x is not null)::int + (y is not null)::int = 1` pattern as `food_log_entries_one_source`, not a looser `or`/`and` condition that would allow zero or two references.
- Confirm RLS is enabled on both new tables — an unprotected table is invisible to the anon client by default in this project's setup pattern... actually re-check: confirm the OPPOSITE isn't true — RLS must be enabled AND have policies, otherwise the anon client gets zero rows / permission errors on every query. Missing either half (enable, or policy) breaks the feature.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Confirm the migration file content matches spec exactly
- Commit SHA
- Explicit confirmation you did NOT run any deploy command
- Any issues or concerns

---

### Task 2: "Toista eilinen" — copy previous day's meal into today

**Files:**
- Modify: `index.html` — `loadFoodDay()` (fetch previous-day meal-type set), `renderMealCards()` (conditional button), new `repeatMealFromPreviousDay()` and `getMealTypesWithEntries()` functions

**Depends on:** none (uses only the pre-existing `food_log_entries` table).

- [ ] **Step 1: Add `getMealTypesWithEntries()` and `repeatMealFromPreviousDay()`**

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

async function getMealTypesWithEntries(dateIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select('meal_type')
    .eq('logged_at', dateIso);
  if (error) { console.error('getMealTypesWithEntries failed:', error.message); return new Set(); }
  return new Set((data || []).map(r => r.meal_type));
}

async function repeatMealFromPreviousDay(mealType) {
  const prevIso  = localIso(addDays(new Date(), foodDayOffset - 1));
  const todayIso = localIso(addDays(new Date(), foodDayOffset));
  const { data, error } = await sb.from('food_log_entries')
    .select('food_cache_id, custom_food_id, amount_g, kcal, protein_g')
    .eq('logged_at', prevIso)
    .eq('meal_type', mealType);
  if (error) { console.error('repeatMealFromPreviousDay failed:', error.message); return; }
  if (!data || !data.length) return;

  const rows = data.map(r => ({
    meal_type: mealType,
    logged_at: todayIso,
    food_cache_id: r.food_cache_id,
    custom_food_id: r.custom_food_id,
    amount_g: r.amount_g,
    kcal: r.kcal,
    protein_g: r.protein_g,
  }));
  const { error: insErr } = await sbWrite({ table: 'food_log_entries', op: 'insert', payload: rows });
  if (insErr) { console.error('repeatMealFromPreviousDay insert failed:', insErr.message); return; }
  renderRuoka();
}
```

`sbWrite`'s `attemptWrite` calls `.insert(payload)` directly, and the Supabase JS client accepts an array for bulk insert — no per-row loop needed. "Previous day" is relative to whichever day `foodDayOffset` currently points at (`foodDayOffset - 1`), not literal calendar-yesterday, so this works correctly while day-browsing with the nav arrows, not just on "today."

- [ ] **Step 2: Fetch the previous-day meal-type set in `loadFoodDay()` and pass it to `renderMealCards()`**

Find this exact block:

```js
async function loadFoodDay() {
  const requestId = ++foodDayRequestId;
  const selectedDate = addDays(new Date(), foodDayOffset);
  const dateIso = localIso(selectedDate);
  const monday = mondayOf(selectedDate);
  const sunday = addDays(monday, 6);

  if (!foodGoals) foodGoals = await loadNutritionGoals();

  const [entries, weekKcal] = await Promise.all([
    loadFoodDayEntries(dateIso),
    loadFoodWeekKcal(localIso(monday), localIso(sunday)),
  ]);
  if (requestId !== foodDayRequestId) return;
  foodDayEntries = entries;

  renderFoodHero(entries, weekKcal);
  renderMealCards(entries);
}
```

Replace with:

```js
async function loadFoodDay() {
  const requestId = ++foodDayRequestId;
  const selectedDate = addDays(new Date(), foodDayOffset);
  const dateIso = localIso(selectedDate);
  const prevIso = localIso(addDays(selectedDate, -1));
  const monday = mondayOf(selectedDate);
  const sunday = addDays(monday, 6);

  if (!foodGoals) foodGoals = await loadNutritionGoals();

  const [entries, weekKcal, prevMealTypes] = await Promise.all([
    loadFoodDayEntries(dateIso),
    loadFoodWeekKcal(localIso(monday), localIso(sunday)),
    getMealTypesWithEntries(prevIso),
  ]);
  if (requestId !== foodDayRequestId) return;
  foodDayEntries = entries;

  renderFoodHero(entries, weekKcal);
  renderMealCards(entries, prevMealTypes);
}
```

- [ ] **Step 3: Render the button conditionally in `renderMealCards()`**

Find this exact block:

```js
function renderMealCards(entries) {
  const el = document.getElementById('food-meals');
  el.innerHTML = MEAL_DEFS.map(meal => {
    const mealEntries = entries.filter(e => e.meal_type === meal.key);
    const mealKcal = mealEntries.reduce((s, e) => s + (e.kcal || 0), 0);
    const rows = mealEntries.map(e => `
      <div class="meal-entry-row" onclick="openEditEntryDialog('${e.id}')">
        <span>${foodItemName(e)}, ${e.amount_g}g</span>
        <span class="meal-entry-kcal">${Math.round(e.kcal)} kcal</span>
      </div>`).join('');
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
      </div>`;
  }).join('');
}
```

Replace with:

```js
function renderMealCards(entries, prevMealTypes) {
  const el = document.getElementById('food-meals');
  el.innerHTML = MEAL_DEFS.map(meal => {
    const mealEntries = entries.filter(e => e.meal_type === meal.key);
    const mealKcal = mealEntries.reduce((s, e) => s + (e.kcal || 0), 0);
    const rows = mealEntries.map(e => `
      <div class="meal-entry-row" onclick="openEditEntryDialog('${e.id}')">
        <span>${foodItemName(e)}, ${e.amount_g}g</span>
        <span class="meal-entry-kcal">${Math.round(e.kcal)} kcal</span>
      </div>`).join('');
    const repeatBtn = prevMealTypes.has(meal.key)
      ? `<button class="meal-add-btn" style="color:var(--accent)" onclick="repeatMealFromPreviousDay('${meal.key}')">↻ Toista eilinen</button>`
      : '';
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
        ${repeatBtn}
      </div>`;
  }).join('');
}
```

(The "★ Tallenna suosikiksi" button is added in Task 3, right below `${repeatBtn}` — don't add it here, Task 3 will show you the exact updated block to replace this one with.)

- [ ] **Step 4: Verify**

```bash
grep -n "async function getMealTypesWithEntries" index.html
grep -n "async function repeatMealFromPreviousDay" index.html
grep -n "function renderMealCards(entries, prevMealTypes)" index.html
grep -n "prevMealTypes.has(meal.key)" index.html
```

Expected: 1 match each.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Toista eilinen -nappi ruokapäiväkirjan ateriakorteille

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of a 6-task plan — fully independent of Task 1's new tables, uses only `food_log_entries`. `foodDayOffset`, `addDays`, `localIso`, `sbWrite`, `renderRuoka` are pre-existing globals/helpers already used throughout this file.

Full spec: `docs/superpowers/specs/2026-08-19-toista-eilinen-ja-suosikkiateriat-design.md`.

## Before You Begin

If any exact block doesn't match what you find in `index.html`, ask now — don't guess or adapt silently.

## Your Job

1. Make all three edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm "previous day" is computed as `foodDayOffset - 1` (relative to the currently-browsed day), not a hardcoded literal-yesterday — re-read `repeatMealFromPreviousDay` and confirm both `prevIso` and `todayIso` use `foodDayOffset` correctly (the current day uses `foodDayOffset`, the previous day uses `foodDayOffset - 1`, both passed through `addDays(new Date(), ...)` the same way the rest of this file already computes the selected day).
- Confirm the button correctly does NOT show when yesterday's slot for that meal type is empty — hand-trace: if `prevMealTypes` is an empty `Set` (yesterday had zero entries at all), does `prevMealTypes.has(meal.key)` correctly evaluate to `false` for every meal, hiding all four repeat buttons?
- Confirm `repeatMealFromPreviousDay` copies `kcal`/`protein_g` directly from the source rows rather than recalculating from `food_cache`/`custom_foods` per-100g values — this is intentional per spec (reproduce exactly what was logged, not what it would compute today).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 3: "Tallenna suosikiksi" — save a meal as a named favorite

**Files:**
- Modify: `index.html` — `renderMealCards()` (add save button), new `saveMealAsFavorite()`, `openSaveFavoriteModal()`, `confirmSaveFavorite()` functions

**Depends on:** Task 1 (the `meal_templates`/`meal_template_items` tables must exist and be deployed — controller will confirm this before dispatching this task). Also depends on Task 2's `renderMealCards()` signature change (`entries, prevMealTypes`) already being in place.

- [ ] **Step 1: Add `saveMealAsFavorite()`, `openSaveFavoriteModal()`, `confirmSaveFavorite()`**

Find this exact block (the end of `openMetricModal()`, right before `openDayBudgetModal()` — re-locate by content, Task 2's edits may have shifted line numbers):

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

function openSaveFavoriteModal(mealType) {
  const entries = foodDayEntries.filter(e => e.meal_type === mealType);
  if (!entries.length) return;
  const suggestion = foodItemName(entries[0]);
  const body = `
    <input type="text" id="save-favorite-name-input" value="${escapeHtml(suggestion)}" style="width:100%;box-sizing:border-box;margin-bottom:12px;">
    <button class="btn btn-primary" style="width:100%;" onclick="confirmSaveFavorite('${mealType}')">Tallenna</button>
    <div class="status" id="save-favorite-status"></div>
  `;
  openMetricModal('Tallenna suosikiksi', body);
}

async function confirmSaveFavorite(mealType) {
  const name = document.getElementById('save-favorite-name-input').value.trim();
  if (!name) { showStatus('save-favorite-status', 'Anna nimi', true); return; }
  await saveMealAsFavorite(mealType, name);
  const overlay = document.getElementById('metric-info-overlay');
  if (overlay) overlay.remove();
}

async function saveMealAsFavorite(mealType, name) {
  const entries = foodDayEntries.filter(e => e.meal_type === mealType);
  if (!entries.length || !name.trim()) return;

  const { data: template, error: tErr } = await sb.from('meal_templates')
    .insert({ name: name.trim() }).select('id').single();
  if (tErr) { console.error('saveMealAsFavorite (template) failed:', tErr.message); return; }

  const items = entries.map(e => ({
    template_id: template.id,
    food_cache_id: e.food_cache_id,
    custom_food_id: e.custom_food_id,
    amount_g: e.amount_g,
  }));
  const { error: iErr } = await sb.from('meal_template_items').insert(items);
  if (iErr) { console.error('saveMealAsFavorite (items) failed:', iErr.message); return; }
}
```

Note: `saveMealAsFavorite`/`confirmSaveFavorite` are two separate functions on purpose — `saveMealAsFavorite(mealType, name)` is the reusable data-writing function (matches the spec's exact signature), `confirmSaveFavorite(mealType)` is the modal's button handler that reads the input field and closes the modal. Direct `sb.from(...)` calls, not `sbWrite()` — matches the existing convention that non-critical, non-offline-queued writes (like `createCustomFood()`) skip the offline queue wrapper.

- [ ] **Step 2: Add the button in `renderMealCards()`**

Find this exact block (as left by Task 2):

```js
    const repeatBtn = prevMealTypes.has(meal.key)
      ? `<button class="meal-add-btn" style="color:var(--accent)" onclick="repeatMealFromPreviousDay('${meal.key}')">↻ Toista eilinen</button>`
      : '';
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
        ${repeatBtn}
      </div>`;
```

Replace with:

```js
    const repeatBtn = prevMealTypes.has(meal.key)
      ? `<button class="meal-add-btn" style="color:var(--accent)" onclick="repeatMealFromPreviousDay('${meal.key}')">↻ Toista eilinen</button>`
      : '';
    const saveFavBtn = mealEntries.length
      ? `<button class="meal-add-btn" style="color:var(--amber)" onclick="openSaveFavoriteModal('${meal.key}')">★ Tallenna suosikiksi</button>`
      : '';
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
        ${repeatBtn}
        ${saveFavBtn}
      </div>`;
```

- [ ] **Step 3: Verify**

```bash
grep -n "async function saveMealAsFavorite" index.html
grep -n "function openSaveFavoriteModal" index.html
grep -n "async function confirmSaveFavorite" index.html
grep -n "mealEntries.length" index.html
grep -n "openSaveFavoriteModal(" index.html
```

Expected: 1, 1, 1, at least 1 (the new saveFavBtn condition), 2 (definition + onclick call site).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Tallenna suosikiksi -nappi ja nimeämismodaali

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of a 6-task plan. `foodDayEntries`, `foodItemName()`, `openMetricModal()`, `createModalOverlay()`, `showStatus()`, `escapeHtml()` are all pre-existing. The `meal_templates`/`meal_template_items` tables from Task 1 must already be deployed to the live database — the controller confirms this before dispatching you; if any insert into these tables fails with a "relation does not exist" or permission error, that means the migration wasn't actually applied yet — report BLOCKED rather than guessing at a workaround.

Full spec: `docs/superpowers/specs/2026-08-19-toista-eilinen-ja-suosikkiateriat-design.md`.

## Before You Begin

If the exact blocks don't match (e.g. Task 2's edits landed differently than expected), ask now.

## Your Job

1. Make both edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the save button only renders when `mealEntries.length` is truthy (non-empty) — trace: for an empty meal card, does `saveFavBtn` correctly evaluate to `''`?
- Confirm `saveMealAsFavorite` stores `food_cache_id`/`custom_food_id`/`amount_g` only — NOT `kcal`/`protein_g` — on `meal_template_items`. This is intentional (favorites recompute macros fresh at use-time in Task 4, not from a stale snapshot) — if you find yourself wanting to add kcal/protein_g here, stop, that contradicts the spec.
- Confirm `confirmSaveFavorite` correctly closes the modal (`metric-info-overlay`) only AFTER `saveMealAsFavorite` completes (uses `await`), not before — closing before the write finishes would look like a silent failure if the write errors.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 4: "Suosikit" section in food search

**Files:**
- Modify: `index.html` — `openFoodSearch()` (load + render favorites), HTML for `food-search-modal` (new container div), new `loadMealTemplates()`, `renderFavoritesSection()`, `addFavoriteMealToLog()`, `deleteFavoriteMeal()` functions

**Depends on:** Task 1 (tables must be deployed), Task 3 (uses the same `meal_templates`/`meal_template_items` tables, though not Task 3's specific functions — could technically run independently of Task 3, but this plan executes sequentially).

- [ ] **Step 1: Add the `food-search-favorites` container in the HTML**

Find this exact block:

```html
    <div id="food-search-step-list">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" id="food-search-input" placeholder="Hae esim. kananrinta..."
               oninput="onFoodSearchInput()" style="flex:1;box-sizing:border-box;">
        <button class="btn" onclick="openFoodPhotoPicker()" style="flex:none;padding:0 14px;" title="Tunnista kuvasta">📷</button>
      </div>
      <input type="file" id="food-photo-input" accept="image/*" style="display:none" onchange="onFoodPhotoSelected(this)">
      <div id="food-search-results"></div>
```

Replace with:

```html
    <div id="food-search-step-list">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" id="food-search-input" placeholder="Hae esim. kananrinta..."
               oninput="onFoodSearchInput()" style="flex:1;box-sizing:border-box;">
        <button class="btn" onclick="openFoodPhotoPicker()" style="flex:none;padding:0 14px;" title="Tunnista kuvasta">📷</button>
      </div>
      <input type="file" id="food-photo-input" accept="image/*" style="display:none" onchange="onFoodPhotoSelected(this)">
      <div id="food-search-favorites"></div>
      <div id="food-search-results"></div>
```

This new container sits ABOVE the search results and is populated once when the modal opens — it is deliberately never touched by `renderFoodResultsList()`/`onFoodSearchInput()`, so favorites stay visible while the user types a search query below them.

- [ ] **Step 2: Add `loadMealTemplates()` and `renderFavoritesSection()`**

Find this exact block:

```js
async function loadRecentFoods() {
```

Replace with:

```js
let foodSearchFavorites = [];

async function loadMealTemplates() {
  const { data, error } = await sb.from('meal_templates')
    .select(`
      id, name,
      meal_template_items(id, food_cache_id, custom_food_id, amount_g,
        food_cache(name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g),
        custom_foods(name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g)
      )
    `)
    .order('created_at', { ascending: false });
  if (error) { console.error('loadMealTemplates failed:', error.message); return []; }
  return data || [];
}

function renderFavoritesSection(templates) {
  const el = document.getElementById('food-search-favorites');
  if (!el) return;
  if (!templates.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="food-search-section-label">Suosikit</div>` +
    templates.map(t => `
      <div class="food-search-result-row" style="align-items:center;">
        <span onclick="addFavoriteMealToLog('${t.id}')" style="flex:1;cursor:pointer;">${escapeHtml(t.name)}</span>
        <span onclick="deleteFavoriteMeal('${t.id}')" style="color:var(--red);padding-left:10px;cursor:pointer;">✕</span>
      </div>`).join('');
}

async function loadRecentFoods() {
```

- [ ] **Step 3: Add `addFavoriteMealToLog()` and `deleteFavoriteMeal()`**

Find this exact block (right after `openFoodSearch()`'s closing brace — re-locate by content):

```js
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  foodPhotoRows = [];
  foodPhotoFineliAttempted = false;
  foodPhotoLastImageBase64 = null;
  document.getElementById('food-search-input').value = '';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-photo').style.display = 'none';

  const meal = MEAL_DEFS.find(m => m.key === mealType);
  document.getElementById('food-search-title').textContent = `${meal.icon} ${meal.label}`;
  document.getElementById('food-search-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  document.getElementById('food-search-results').innerHTML = `<div class="food-search-empty">Ladataan...</div>`;
  foodRecentItems = await loadRecentFoods();
  foodSearchItems = foodRecentItems;
  renderFoodResultsList(foodSearchItems, 'Viimeksi käytetyt', 'Ei vielä aiempia ruokia');
}
```

Replace with:

```js
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  foodPhotoRows = [];
  foodPhotoFineliAttempted = false;
  foodPhotoLastImageBase64 = null;
  document.getElementById('food-search-input').value = '';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-photo').style.display = 'none';

  const meal = MEAL_DEFS.find(m => m.key === mealType);
  document.getElementById('food-search-title').textContent = `${meal.icon} ${meal.label}`;
  document.getElementById('food-search-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  document.getElementById('food-search-results').innerHTML = `<div class="food-search-empty">Ladataan...</div>`;
  document.getElementById('food-search-favorites').innerHTML = '';
  const [recentItems, templates] = await Promise.all([loadRecentFoods(), loadMealTemplates()]);
  foodRecentItems = recentItems;
  foodSearchItems = foodRecentItems;
  foodSearchFavorites = templates;
  renderFavoritesSection(templates);
  renderFoodResultsList(foodSearchItems, 'Viimeksi käytetyt', 'Ei vielä aiempia ruokia');
}

async function addFavoriteMealToLog(templateId) {
  const template = foodSearchFavorites.find(t => t.id === templateId);
  if (!template) return;
  for (const item of template.meal_template_items) {
    const src = item.food_cache || item.custom_foods;
    if (!src) { console.error('addFavoriteMealToLog: missing food reference for item', item.id); continue; }
    try {
      await addFoodLogEntry({
        mealType: foodModalMeal,
        dateIso: localIso(addDays(new Date(), foodDayOffset)),
        foodCacheId: item.food_cache_id,
        customFoodId: item.custom_food_id,
        amountG: item.amount_g,
        kcalPer100g: src.kcal_per_100g,
        proteinPer100g: src.protein_per_100g,
      });
    } catch (err) {
      console.error('addFavoriteMealToLog item failed:', err.message);
    }
  }
  closeFoodSearch();
  renderRuoka();
}

async function deleteFavoriteMeal(templateId) {
  if (!confirm('Poistetaanko suosikki pysyvästi?')) return;
  const { error } = await sb.from('meal_templates').delete().eq('id', templateId);
  if (error) { console.error('deleteFavoriteMeal failed:', error.message); return; }
  foodSearchFavorites = foodSearchFavorites.filter(t => t.id !== templateId);
  renderFavoritesSection(foodSearchFavorites);
}
```

`addFavoriteMealToLog` reuses `addFoodLogEntry()` — the exact same insert path normal single-item food search uses — per item, computing kcal/protein fresh from the CURRENT `food_cache`/`custom_foods` per-100g values (not from any stored snapshot, since none is stored — matches Task 3's design). A missing `src` (deleted underlying food reference) is skipped with a console error rather than aborting the whole favorite, matching the spec's "puuttuva viittaus" handling.

- [ ] **Step 4: Verify**

```bash
grep -n 'id="food-search-favorites"' index.html
grep -n "async function loadMealTemplates" index.html
grep -n "function renderFavoritesSection" index.html
grep -n "async function addFavoriteMealToLog" index.html
grep -n "async function deleteFavoriteMeal" index.html
grep -n "let foodSearchFavorites" index.html
```

Expected: 1 match each.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Suosikit-osio ruokahakuun (lisää ja poista suosikkiateria)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of a 6-task plan — the final piece wiring Task 1's tables and Task 3's save mechanism into a usable browse/add/delete flow. `addFoodLogEntry()`, `closeFoodSearch()`, `MEAL_DEFS`, `foodModalMeal`, `foodDayOffset`, `localIso`, `addDays`, `escapeHtml` are all pre-existing. `.food-search-result-row` and `.food-search-section-label` CSS classes already exist and are reused as-is — no new CSS.

Full spec: `docs/superpowers/specs/2026-08-19-toista-eilinen-ja-suosikkiateriat-design.md`.

## Before You Begin

If any exact block doesn't match, or the `meal_templates`/`meal_template_items` tables don't exist yet (query fails with a schema error), ask now / report BLOCKED — don't guess at a migration.

## Your Job

1. Make all four edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `#food-search-favorites` is populated once in `openFoodSearch()` and is never touched by `onFoodSearchInput()`/`runFoodSearch()`/`renderFoodResultsList()` — re-grep those three functions to confirm none of them reference `food-search-favorites`.
- Confirm `addFavoriteMealToLog` uses `foodModalMeal` (the meal type the search modal was opened for) as the target, not some other/wrong meal type source.
- Confirm `deleteFavoriteMeal` requires `confirm()` before deleting — matches the existing `deleteProgramSession()` destructive-action pattern in this file.
- Hand-trace: a favorite with 3 items, one of which references a `custom_food_id` that's somehow gone (returns null on join) — confirm `addFavoriteMealToLog` still successfully adds the other 2 valid items and only skips the broken one, rather than throwing and adding zero.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced broken-reference scenario
- Any issues or concerns

---

### Task 5: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: "Toista eilinen"** — pick a meal type that has entries on the previous day but none today (or navigate a day forward from one that does). Confirm the "↻ Toista eilinen" button appears. Tap it — confirm the previous day's exact entries (same items, amounts, kcal) appear on today's card instantly, no confirmation dialog. Confirm the button does NOT appear on a meal type with no entries the previous day.

- [ ] **Step 3: "Tallenna suosikiksi"** — on a meal card with at least one entry, confirm the "★ Tallenna suosikiksi" button appears (and does NOT appear on an empty meal card). Tap it, confirm a modal opens with a pre-filled editable name field, save with a custom name.

- [ ] **Step 4: Suosikit in food search** — open food search for a DIFFERENT meal type than the one you saved from. Confirm a "Suosikit" section appears above "Viimeksi käytetyt" with your saved favorite. Tap it — confirm all its items get added at once to the meal type you opened search from (not the original meal type it was saved from), with correct kcal/macros, and the modal closes automatically.

- [ ] **Step 5: Delete a favorite** — open food search again, tap the ✕ next to a favorite, confirm the native confirm() dialog appears, confirm it disappears from the list after confirming.

- [ ] **Step 6: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 7: Clean up** — stop the local server, close the tab.

- [ ] **Step 8: Report result.** No commit needed.

---

### Task 6: Final code review + finish branch

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the entire diff (Tasks 1-4) covering: migration correctness (types, constraints, RLS), the "one bulk insert, no per-row loop" claim for `repeatMealFromPreviousDay`, that favorites correctly compute macros fresh at use-time rather than from a stored snapshot, that `renderMealCards()`'s three conditional buttons (`+ Lisää ruoka` always, `↻ Toista eilinen` / `★ Tallenna suosikiksi` conditionally) don't interfere with each other or with the existing `meal-entry-row` click handlers, and that no unrelated code was touched.

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (Toista eilinen: relative-day copy, visibility gating, direct-copy semantics) → Task 2. §2 (Tallenna suosikiksi: visibility gating, naming, fresh-macro-at-use-time, new tables, Suosikit section, delete with confirm, missing-reference handling) → Tasks 1, 3, 4. §3 exclusions (no favorite editing, no meal-type binding, no multi-day-back repeat, no `food_log_entries` schema changes) — respected, no task does any of them.
- **Type/name consistency:** `getMealTypesWithEntries`, `repeatMealFromPreviousDay`, `saveMealAsFavorite`, `openSaveFavoriteModal`, `confirmSaveFavorite`, `loadMealTemplates`, `renderFavoritesSection`, `addFavoriteMealToLog`, `deleteFavoriteMeal` are used with identical names/signatures across every task that references them.
- **No placeholders:** every step shows exact before/after code, exact commands, exact expected output; Tasks 2-4 include concrete hand-trace scenarios in their self-review sections rather than vague "verify it works" instructions.
- **Deploy safety:** Task 1 explicitly stops before deployment and hands that off to the controller — the only step in this plan that touches live infrastructure outside the worktree's own git history.
