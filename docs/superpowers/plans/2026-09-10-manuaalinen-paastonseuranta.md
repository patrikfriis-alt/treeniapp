# Manual Fasting Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Treeniapp's automatic fasting-time calculation (derived from gaps between food-log entries) with an explicit manual Start/Stop tracking system.

**Architecture:** New Supabase table `fasting_sessions` (one row per fast, `ended_at IS NULL` means active) replaces the old derivation from `food_log_entries.created_at` gaps. Ruoka page gets a live status + Start/Stop button + editable recent-fasts list. Koonti's existing "Paastoaika" weekly summary row and its breakdown modal are extended (not replaced) to show live status and host the same Start/Stop control for quick access. `computeWeeklyFastingByDay()` is rewritten to read the new table. Everything lives in the single `index.html` file, matching the project's existing structure — no new files besides the migration.

**Tech Stack:** Vanilla JS, Supabase JS client (`sb`), Supabase Postgres (via CLI migration). No build step, no automated test framework — verification is manual, in-browser (Claude in Chrome), matching this project's established convention.

**Spec:** `docs/superpowers/specs/2026-09-10-manuaalinen-paastonseuranta-design.md` — full field-by-field schema, every function body, and every HTML/CSS block referenced below are defined there; this plan sequences and tests them. Written in Finnish (project convention for design docs); this plan is in English (matches the executing session).

## Global Constraints

- No new runtime dependencies, no CDN additions — stays vanilla JS/Supabase, matching the rest of the app.
- All new user-facing strings are Finnish, matching every other string in the app (e.g. "Aloita paasto", "Lopeta paasto", "Ei aktiivista paastoa").
- Migrations follow the existing naming convention: `supabase/migrations/YYYYMMDD_description.sql` (see `supabase/migrations/20260819_water_log.sql` for the closest reference example — same RLS policy shape: `for select/insert/update/delete to anon, authenticated using/with check (true)`).
- The Supabase project is already linked via the CLI (`supabase/.temp/project-ref` = `yznuzwbbyasgqeqllxic`, matches `SB_URL` in `index.html:1680`) — apply migrations with `supabase db push`, not by hand-pasting SQL into a dashboard.
- Every task's browser-verification step must also check the console for errors (`mcp__claude-in-chrome__read_console_messages`, `onlyErrors: true`) before being considered done — matches this session's established verification standard for this project.
- CRLF line endings: `index.html` uses CRLF. If any task edits it with a raw script instead of the Edit tool, verify with `file index.html` before committing (a prior incident in this project silently converted the whole file to LF via a Python script that didn't use `newline=''`).

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260910_fasting_sessions.sql`

**Interfaces:**
- Produces: table `fasting_sessions` (columns: `id uuid`, `started_at timestamptz not null`, `ended_at timestamptz` nullable, `created_at timestamptz not null default now()`), with a partial unique index guaranteeing at most one row where `ended_at is null` at any time. RLS policies open to `anon, authenticated` for select/insert/update/delete, matching the rest of this single-user app.

- [ ] **Step 1: Write the migration file**

```sql
-- Manuaalinen paastonseuranta: korvaa ruokakirjausten aikaleimoista johdetun laskennan

create table fasting_sessions (
  id         uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);

create index fasting_sessions_started_at_idx on fasting_sessions (started_at);
create index fasting_sessions_ended_at_idx on fasting_sessions (ended_at);

-- Korkeintaan yksi aktiivinen (ended_at is null) paasto kerrallaan
create unique index fasting_sessions_single_active_idx on fasting_sessions ((1)) where ended_at is null;

alter table fasting_sessions enable row level security;

create policy fasting_sessions_select on fasting_sessions
  for select to anon, authenticated using (true);
create policy fasting_sessions_insert on fasting_sessions
  for insert to anon, authenticated with check (true);
create policy fasting_sessions_update on fasting_sessions
  for update to anon, authenticated using (true);
create policy fasting_sessions_delete on fasting_sessions
  for delete to anon, authenticated using (true);
```

- [ ] **Step 2: Apply the migration to the linked project**

Run: `cd /Users/patrikfriis/Projects/treeniapp && supabase db push`
Expected: CLI lists `20260910_fasting_sessions.sql` as a pending migration and applies it successfully (exit code 0, no error output). If prompted for confirmation, confirm.

- [ ] **Step 3: Verify the table and RLS are live**

Run:
```bash
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/fasting_sessions?select=*" \
  -H "apikey: $(grep -o "SB_KEY = '[^']*'" index.html | sed "s/SB_KEY = '//;s/'$//")" \
  -H "Authorization: Bearer $(grep -o "SB_KEY = '[^']*'" index.html | sed "s/SB_KEY = '//;s/'$//")"
```
Expected: `[]` (empty array, HTTP 200) — table exists, is selectable, currently has zero rows. A 404 or permission error means the migration didn't apply or RLS is misconfigured; stop and re-check Step 1/2 before continuing.

- [ ] **Step 4: Verify the single-active-session constraint**

Run (insert two sessions with `ended_at` null back to back):
```bash
KEY=$(grep -o "SB_KEY = '[^']*'" index.html | sed "s/SB_KEY = '//;s/'$//")
curl -s -X POST "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/fasting_sessions" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"started_at":"2026-09-10T10:00:00Z"}'
curl -s -X POST "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/fasting_sessions" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"started_at":"2026-09-10T11:00:00Z"}'
```
Expected: first call returns 201 with the created row; second call returns an error containing `"code":"23505"` (unique violation) — confirms the partial unique index works.

- [ ] **Step 5: Clean up the test row**

Run:
```bash
curl -s -X DELETE "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/fasting_sessions?started_at=eq.2026-09-10T10:00:00Z" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: 204, table is empty again (re-run Step 3's curl to confirm `[]`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260910_fasting_sessions.sql
git commit -m "feat(db): add fasting_sessions table for manual fasting tracking"
```

---

## Task 2: Core state and Start/Stop functions

**Files:**
- Modify: `index.html` — add new JS near the existing fasting-related functions (currently around `index.html:5279-5350`, exact line numbers will have shifted since the spec was written; search for `getLastRealFoodEntryAt` to relocate).

**Interfaces:**
- Consumes: `sb` (Supabase client, defined at `index.html:1682`).
- Produces:
  - `let activeFastSession` (module-level, shape `{ id, started_at } | null`)
  - `async function loadActiveFastSession()` → `Promise<{id, started_at} | null>`
  - `async function startFast()` → inserts a new session, refreshes `activeFastSession`
  - `async function stopFast()` → ends the active session, refreshes `activeFastSession`
  - Both `startFast`/`stopFast` call `loadFastingTimer()` (built in Task 3) and `refreshKoontiFastingRow()` (built in Task 5) — these two calls will be no-ops/undefined-safe until those tasks land; see Step 3's note.

- [ ] **Step 1: Add the state variable and `loadActiveFastSession()`**

Find `getLastRealFoodEntryAt()` in `index.html` (search for that exact string) and add the new code directly above it (it will replace that function in Task 7 — for now they coexist):

```js
let activeFastSession = null;   // { id, started_at } or null
let recentFasts = [];           // most recent 5 completed fasts, edit-modal data source

async function loadActiveFastSession() {
  const { data, error } = await sb.from('fasting_sessions')
    .select('id,started_at')
    .is('ended_at', null)
    .maybeSingle();
  if (error) { console.error('loadActiveFastSession failed:', error.message); return null; }
  return data;
}
```

- [ ] **Step 2: Add `startFast()` and `stopFast()`**

Add directly below the code from Step 1:

```js
async function startFast() {
  const { error } = await sb.from('fasting_sessions').insert({ started_at: new Date().toISOString() });
  if (error) {
    console.error('startFast failed:', error.message);
    // 23505 = unique_violation -> an active fast already exists (e.g. a second tab beat this one)
    if (error.code === '23505') await loadFastingTimer();
    return;
  }
  await loadFastingTimer();
  refreshKoontiFastingRow();
}

async function stopFast() {
  if (!activeFastSession) return;
  const { error } = await sb.from('fasting_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', activeFastSession.id);
  if (error) { console.error('stopFast failed:', error.message); return; }
  await loadFastingTimer();
  await loadRecentFasts();
  refreshKoontiFastingRow();
}
```

Note on what exists at this point in the sequence: `loadFastingTimer()` already exists in `index.html` (it's the *old* automatic-calculation version, not yet rewritten — that happens in Task 3) — calling it from `startFast()`/`stopFast()` right now silently runs the old, soon-to-be-replaced logic; it does not throw. `loadRecentFasts()` and `refreshKoontiFastingRow()` do NOT exist yet anywhere (built in Tasks 4 and 5) — calling either would throw `ReferenceError`. This is harmless for this task because nothing wires a button to `startFast`/`stopFast` yet, and Step 3 below deliberately tests the lower-level Supabase calls directly rather than through `startFast()`/`stopFast()`, so the not-yet-defined functions are never actually invoked during this task's test.

- [ ] **Step 3: Verify via the browser console against the real Supabase table**

Start the local server and open the app:
```bash
cd /Users/patrikfriis/Projects/treeniapp && python3 -m http.server 8934
```
Using Claude in Chrome: navigate to `http://localhost:8934/index.html`, wait for load, then use `mcp__claude-in-chrome__javascript_tool` (or open DevTools manually) to run in the page's console:
```js
await loadActiveFastSession()   // expect: null (table is empty from Task 1's cleanup)
```
This will throw `ReferenceError: loadFastingTimer is not defined` when called from `startFast()`/`stopFast()` at this point — that's expected per the Step 2 note. Instead, verify the insert/update logic directly:
```js
const { error: e1 } = await sb.from('fasting_sessions').insert({ started_at: new Date().toISOString() });
console.log('insert error:', e1);           // expect: null
const active = await loadActiveFastSession();
console.log('active session:', active);      // expect: { id: <uuid>, started_at: <iso string> }
const { error: e2 } = await sb.from('fasting_sessions').update({ ended_at: new Date().toISOString() }).eq('id', active.id);
console.log('update error:', e2);            // expect: null
const stillActive = await loadActiveFastSession();
console.log('after stop:', stillActive);      // expect: null
```
Expected: all three `console.log` calls show the commented expected values. Check the console for unrelated errors too (`onlyErrors: true`).

- [ ] **Step 4: Stop the local server and commit**

```bash
git add index.html
git commit -m "feat(paasto): add fasting_sessions state and start/stop functions"
```

---

## Task 3: Ruoka page — live status and Start/Stop button

**Files:**
- Modify: `index.html`
  - HTML: replace the fasting `.food-week-row` block (search for `<span>Paasto</span>`, currently `index.html:1542-1544`)
  - CSS: add near the existing `.food-week-row` rules (search for `.food-week-row {`)
  - JS: replace `loadFastingTimer()`/`renderFastingTimer()` bodies (search for `function renderFastingTimer`), update `renderRuoka()` (search for `async function renderRuoka`)

**Interfaces:**
- Consumes: `activeFastSession`, `startFast()`, `stopFast()` (Task 2); `formatFastingDuration(ms)` (existing, unchanged).
- Produces: DOM elements `#food-fasting-val` (status text) and `#food-fasting-btn` (toggle button) stay live-updated every 60s while a fast is active — same ids as the old implementation, so nothing else in the file that might reference `#food-fasting-val` needs to change.

- [ ] **Step 1: Replace the Ruoka page HTML**

Find (search for `<span>Paasto</span>`):
```html
  <div class="food-week-row">
    <span>Paasto</span><span class="food-week-val" id="food-fasting-val">—</span>
  </div>
```
Replace with:
```html
  <div class="meal-card" style="margin-bottom:14px">
    <div class="food-fasting-row">
      <div>
        <div class="food-fasting-label">Paasto</div>
        <div class="food-fasting-status" id="food-fasting-val">—</div>
      </div>
      <button class="btn btn-primary" id="food-fasting-btn" style="width:auto;padding:10px 18px;">Aloita paasto</button>
    </div>
    <div id="food-fasting-recent"></div>
  </div>
```

- [ ] **Step 2: Add the new CSS**

Find `.food-week-row {` and add directly after that rule's closing brace:
```css
.food-fasting-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.food-fasting-label { font-size:var(--fs-sm); color:var(--text3); }
.food-fasting-status { font-size:var(--fs-lg); font-weight:700; color:var(--text); margin-top:2px; }
```

- [ ] **Step 3: Rewrite `loadFastingTimer()` and `renderFastingTimer()`**

Find the existing pair (search for `async function loadFastingTimer`) and replace both function bodies:
```js
async function loadFastingTimer() {
  activeFastSession = await loadActiveFastSession();
  renderFastingTimer();
  if (_fastingInterval) clearInterval(_fastingInterval);
  if (activeFastSession) _fastingInterval = setInterval(renderFastingTimer, 60000);
}

function renderFastingTimer() {
  const statusEl = document.getElementById('food-fasting-val');
  const btnEl = document.getElementById('food-fasting-btn');
  if (!statusEl || !btnEl) return;
  if (activeFastSession) {
    statusEl.textContent = formatFastingDuration(Date.now() - new Date(activeFastSession.started_at).getTime());
    btnEl.textContent = 'Lopeta paasto';
    btnEl.onclick = stopFast;
  } else {
    statusEl.textContent = 'Ei aktiivista paastoa';
    btnEl.textContent = 'Aloita paasto';
    btnEl.onclick = startFast;
  }
}
```
`_fastingInterval` is the existing module-level variable (unchanged, already declared above these functions).

- [ ] **Step 4: Verify in the browser**

Restart the local server if needed (`python3 -m http.server 8934`), open the app in Claude in Chrome, navigate to Ruoka (bottom nav).
- Screenshot: expect the "Paasto" card showing "Ei aktiivista paastoa" and a cyan "Aloita paasto" button.
- Click "Aloita paasto". Wait 1s, screenshot: expect the status to show "0h 0min" (or similar) and the button to now read "Lopeta paasto".
- Click "Lopeta paasto". Screenshot: expect status back to "Ei aktiivista paastoa", button back to "Aloita paasto".
- Check console for errors (`onlyErrors: true`): expect none.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(paasto): wire Start/Stop button into Ruoka page"
```

---

## Task 4: Recent fasts list and edit modal

**Files:**
- Modify: `index.html`
  - CSS: add near `.food-fasting-row` (added in Task 3)
  - JS: new functions near `loadFastingTimer()`; update `renderRuoka()` (search for `async function renderRuoka`)

**Interfaces:**
- Consumes: `recentFasts` (declared in Task 2), `openMetricModal(title, bodyHtml)` (existing, `index.html:6909`), `showStatus(id, msg, isErr)` (existing, `index.html:7410`), `createModalOverlay` indirectly via `openMetricModal`.
- Produces: `async function loadRecentFasts()`, `function renderRecentFasts()`, `function openEditFastModal(id)`, `async function saveFastEdit(id)`, `async function deleteFast(id)`, `function toLocalDatetimeInputValue(date)`.

- [ ] **Step 1: Add the recent-fasts CSS**

Add directly after the CSS block from Task 3 Step 2:
```css
.fasting-recent-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--border); cursor:pointer; font-size:var(--fs-sm); color:var(--text2); }
.fasting-recent-chev { color:var(--text3); }
```

Also find `input[type=date]::-webkit-calendar-picker-indicator { filter: invert(.5); }` (`index.html:179`) and replace it with:
```css
input[type=date]::-webkit-calendar-picker-indicator,
input[type=datetime-local]::-webkit-calendar-picker-indicator { filter: invert(.5); }
```

- [ ] **Step 2: Add `loadRecentFasts()` and `renderRecentFasts()`**

Add near `loadFastingTimer()`:
```js
async function loadRecentFasts() {
  const { data, error } = await sb.from('fasting_sessions')
    .select('id,started_at,ended_at')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(5);
  if (error) { console.error('loadRecentFasts failed:', error.message); return; }
  recentFasts = data || [];
  renderRecentFasts();
}

function renderRecentFasts() {
  const el = document.getElementById('food-fasting-recent');
  if (!el) return;
  el.innerHTML = recentFasts.map(s => {
    const start = new Date(s.started_at), end = new Date(s.ended_at);
    const dateStr = end.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    return `<div class="fasting-recent-row" onclick="openEditFastModal('${s.id}')">
      <span>${dateStr} · ${formatFastingDuration(end - start)}</span>
      <span class="fasting-recent-chev">›</span>
    </div>`;
  }).join('');
}
```

- [ ] **Step 3: Wire `loadRecentFasts()` into `renderRuoka()`**

Find `async function renderRuoka()` and change it to:
```js
async function renderRuoka() {
  document.getElementById('food-day-label').textContent = formatFoodDayLabel(foodDayOffset);
  await loadFoodDay();
  loadFastingTimer();
  loadRecentFasts();
}
```
(Both new/existing calls stay fire-and-forget, unawaited — matches the file's existing convention at this call site.)

- [ ] **Step 4: Add the edit modal functions**

Add near the functions from Step 2:
```js
function toLocalDatetimeInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openEditFastModal(id) {
  const s = recentFasts.find(f => f.id === id);
  if (!s) return;
  const body = `
    <div class="form-row"><label>Alkoi</label><input type="datetime-local" id="edit-fast-start" value="${toLocalDatetimeInputValue(new Date(s.started_at))}"></div>
    <div class="form-row"><label>Päättyi</label><input type="datetime-local" id="edit-fast-end" value="${toLocalDatetimeInputValue(new Date(s.ended_at))}"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="saveFastEdit('${id}')">Tallenna</button>
    <button class="btn" style="width:100%;margin-top:8px;color:var(--red);" onclick="deleteFast('${id}')">Poista</button>
    <div class="status" id="edit-fast-status"></div>
  `;
  openMetricModal('Muokkaa paastoa', body);
}

async function saveFastEdit(id) {
  const startVal = document.getElementById('edit-fast-start').value;
  const endVal = document.getElementById('edit-fast-end').value;
  if (!startVal || !endVal) { showStatus('edit-fast-status', 'Täytä molemmat ajat', true); return; }
  if (new Date(endVal) <= new Date(startVal)) { showStatus('edit-fast-status', 'Lopun on oltava alun jälkeen', true); return; }
  const { error } = await sb.from('fasting_sessions')
    .update({ started_at: new Date(startVal).toISOString(), ended_at: new Date(endVal).toISOString() })
    .eq('id', id);
  if (error) { showStatus('edit-fast-status', 'Tallennus epäonnistui', true); return; }
  document.getElementById('metric-info-overlay').remove();
  await loadRecentFasts();
  refreshKoontiFastingRow();
}

async function deleteFast(id) {
  const { error } = await sb.from('fasting_sessions').delete().eq('id', id);
  if (error) { console.error('deleteFast failed:', error.message); return; }
  document.getElementById('metric-info-overlay').remove();
  await loadRecentFasts();
  refreshKoontiFastingRow();
}
```
`refreshKoontiFastingRow()` doesn't exist yet (Task 5) — same "safe because not yet invoked from a wired button that's actually clicked in this task's test" reasoning as Task 2. It IS invoked here, but only after a successful save/delete, and this task's test (Step 5 below) exercises exactly that path, so implement Task 5's `refreshKoontiFastingRow()` stub now if the test would otherwise throw:

```js
function refreshKoontiFastingRow() {
  if (document.getElementById('page-koonti').classList.contains('active')) loadWeeklyReportCard(0);
}
```
Add this stub in this task (it's a one-line function with no dependency on anything Task 5-specific beyond `loadWeeklyReportCard`, which already exists) so `saveFastEdit`/`deleteFast` don't throw. Task 5 will reuse this exact same function without changes.

- [ ] **Step 5: Verify in the browser**

With the local server running, navigate to Ruoka:
- Start a fast, then immediately stop it (via the button from Task 3).
- Screenshot: expect a new row under the Paasto card showing today's date and a short duration (e.g. "10.9. · 0h 1min").
- Click that row. Expect a modal titled "Muokkaa paastoa" with two pre-filled datetime-local inputs and "Tallenna"/"Poista" buttons.
- Change the end time to something clearly different, click "Tallenna". Expect the modal to close and the recent-fasts row to reflect the new duration.
- Click the row again, click "Poista". Expect the modal to close and the row to disappear from the list.
- Check console for errors: expect none.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(paasto): add recent-fasts list with edit/delete"
```

---

## Task 5: Koonti weekly row — live status and quick Start/Stop

**Files:**
- Modify: `index.html`
  - JS: `loadWeeklyReportCard()` (search for `async function loadWeeklyReportCard`), `openFastingBreakdownModal()` (search for `function openFastingBreakdownModal`)

**Interfaces:**
- Consumes: `activeFastSession`, `startFast()`, `stopFast()` (Task 2); `loadActiveFastSession()` (Task 2); `refreshKoontiFastingRow()` (stubbed in Task 4 Step 4 — this task is where it becomes meaningfully exercised end-to-end via the UI, though it needs no code change here since Task 4 already wrote its final form).
- Produces: the "Paastoaika" row on Koonti shows " (käynnissä)" when a fast is active; `openFastingBreakdownModal()` gains a Start/Stop control above the per-day breakdown.

- [ ] **Step 1: Fetch `activeFastSession` alongside the weekly stats**

Find in `loadWeeklyReportCard()` (search for `getWeekStats(offset - 1),`):
```js
  const [thisWeek, lastWeek] = await Promise.all([
    getWeekStats(offset),
    getWeekStats(offset - 1),
  ]);
```
Replace with:
```js
  const [thisWeek, lastWeek, activeFast] = await Promise.all([
    getWeekStats(offset),
    getWeekStats(offset - 1),
    loadActiveFastSession(),
  ]);
  activeFastSession = activeFast;
```

- [ ] **Step 2: Update the Paastoaika row to show live status**

Find (search for `'Paastoaika', formatFastingDuration`):
```js
    rows.push(weekRow('timer', 'var(--accent)', 'Paastoaika', formatFastingDuration(weeklyFastingMs), '',
      `openFastingBreakdownModal('${mon.iso}', [${dayMinutes.join(', ')}])`));
```
Replace with:
```js
    const fastingSuffix = activeFastSession ? ' (käynnissä)' : '';
    rows.push(weekRow('timer', 'var(--accent)', 'Paastoaika', formatFastingDuration(weeklyFastingMs) + fastingSuffix, '',
      `openFastingBreakdownModal('${mon.iso}', [${dayMinutes.join(', ')}])`));
```
(This line sits just after `const weeklyFastingMs = ...` and the `dayMinutes` loop — leave those two untouched, only the `rows.push(weekRow(...))` call changes.)

- [ ] **Step 3: Add the Start/Stop control to the breakdown modal**

Find `function openFastingBreakdownModal(mondayIso, minutes) {` and replace the whole function body:
```js
function openFastingBreakdownModal(mondayIso, minutes) {
  const controlHtml = activeFastSession
    ? `<div class="food-fasting-status" style="margin-bottom:4px;">${formatFastingDuration(Date.now() - new Date(activeFastSession.started_at).getTime())}</div>
       <button class="btn btn-primary" style="width:100%;margin-bottom:16px;" onclick="stopFast();document.getElementById('metric-info-overlay').remove();">Lopeta paasto</button>`
    : `<button class="btn btn-primary" style="width:100%;margin-bottom:16px;" onclick="startFast();document.getElementById('metric-info-overlay').remove();">Aloita paasto</button>`;

  const rowsHtml = minutes.map((min, i) => {
    const d = addDays(new Date(mondayIso), i);
    const label = `${DAYS[i]} ${d.getDate()}.${d.getMonth() + 1}.`;
    const h = Math.floor(min / 60), m = min % 60;
    return `<div class="metric-modal-row"><span>${label}</span><span class="val">${h}h ${m}min</span></div>`;
  }).join('');
  openMetricModal('Paastoaika', controlHtml + rowsHtml);
}
```

- [ ] **Step 4: Verify in the browser**

Navigate to Koonti (bottom nav). Find the "Tällä viikolla" card's "Paastoaika" row.
- With no active fast: screenshot, confirm the row shows a plain duration with no "(käynnissä)" suffix.
- Tap the row: expect a modal with an "Aloita paasto" button above the 7-day breakdown list.
- Tap "Aloita paasto": modal closes. Screenshot the Koonti page again: expect the Paastoaika row to now show "(käynnissä)".
- Tap the row again: expect the modal to now show an elapsed-time readout and a "Lopeta paasto" button.
- Tap "Lopeta paasto": modal closes, row's "(käynnissä)" suffix disappears.
- Check console for errors: expect none.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(paasto): show live status and quick start/stop on Koonti"
```

---

## Task 6: Rewrite the weekly-total calculation

**Files:**
- Modify: `index.html` — `computeWeeklyFastingByDay()` (search for `async function computeWeeklyFastingByDay`)

**Interfaces:**
- Consumes: `sb`, `localIso()`, `addDays()` (all existing, unchanged).
- Produces: same signature as before — `async function computeWeeklyFastingByDay(mondayIso, sundayIso)` → `Promise<{[dateIso]: milliseconds}>` — so its one caller (in `loadWeeklyReportCard()`, unchanged call site) needs no changes.

- [ ] **Step 1: Replace the function body**

Find `async function computeWeeklyFastingByDay(mondayIso, sundayIso) {` and replace the entire function (through its closing `}`) with:
```js
async function computeWeeklyFastingByDay(mondayIso, sundayIso) {
  const lookbackFrom = localIso(addDays(new Date(mondayIso), -14));
  const { data, error } = await sb.from('fasting_sessions')
    .select('started_at,ended_at')
    .gte('started_at', lookbackFrom)
    .lte('started_at', sundayIso + 'T23:59:59');
  if (error) { console.error('computeWeeklyFastingByDay failed:', error.message); return {}; }
  const sessions = data || [];

  const byDay = {};
  for (let i = 0; i < 7; i++) {
    byDay[localIso(addDays(new Date(mondayIso), i))] = 0;
  }
  const now = new Date();
  sessions.forEach(s => {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : now; // in-progress fast -> elapsed time so far
    const endDayIso = localIso(end);
    if (byDay[endDayIso] !== undefined) byDay[endDayIso] += (end - start);
  });
  return byDay;
}
```

- [ ] **Step 2: Verify with real data**

With the local server running:
- On Ruoka, start a fast, then immediately stop it (creates one short completed session for today).
- Start a second fast and leave it running (creates one active session).
- Navigate to Koonti, tap the "Paastoaika" row to open the breakdown modal.
- Expect today's row in the per-day list to show a small non-zero duration (roughly the sum of the ~seconds-long completed fast plus the still-accumulating active one) — confirms both the completed-session and in-progress-session branches of the `sessions.forEach` are being exercised and attributed to today.
- Stop the second fast via the modal's "Lopeta paasto" button before moving on, to leave the app in a clean state for Task 7.
- Check console for errors: expect none.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(paasto): source weekly fasting total from fasting_sessions"
```

---

## Task 7: Remove the old automatic calculation

**Files:**
- Modify: `index.html` — delete `getLastRealFoodEntryAt()` and the now-obsolete comment block (search for `async function getLastRealFoodEntryAt` and the comment starting `// Käyttää created_at:ia`, originally around `index.html:5279-5298`).

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is pure removal. No other function in the file calls `getLastRealFoodEntryAt()` after Task 3 rewrote `loadFastingTimer()` to use `loadActiveFastSession()` instead; confirm this with the grep in Step 1 before deleting.

- [ ] **Step 1: Confirm nothing else references the old function**

Run: `grep -n "getLastRealFoodEntryAt\|_lastRealFoodAt" index.html`
Expected: zero matches, or matches only inside the function/comment about to be deleted in Step 2. If anything else references these, stop and investigate before proceeding — the plan's assumption (Task 3 fully replaced their only call site) would be wrong.

- [ ] **Step 2: Delete the function and its explanatory comment**

Find and delete this whole block (function plus the Finnish comment directly below it explaining the `created_at`-vs-`logged_at` limitation that no longer applies):
```js
async function getLastRealFoodEntryAt() {
  const { data, error } = await sb.from('food_log_entries')
    .select('created_at')
    .gte('kcal', 10)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) { console.error('getLastRealFoodEntryAt failed:', error.message); return null; }
  return data && data[0] ? new Date(data[0].created_at) : null;
}

function formatFastingDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}min`;
}

// Käyttää created_at:ia (kirjaushetki) syömisajan approksimaationa, ei logged_at:ia
// (käyttäjän valitsema päivä) — jälkikäteen täytetyt merkinnät (esim. eilisen aterian
// kirjaus tänään) vinouttavat aukkolaskentaa, koska created_at ei silloin vastaa
// todellista syömisaikaa. Tunnettu, hyväksytty rajoitus — ei uutta ajastussaraketta.
```
Delete only `getLastRealFoodEntryAt()` and the trailing 4-line comment — **keep `formatFastingDuration()`**, it's still used throughout (Tasks 3-6 all call it). Re-insert `formatFastingDuration()` in place if your search-and-replace accidentally removed it along with its neighbors.

- [ ] **Step 3: Verify the file still parses and the app still loads**

Run:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const scriptMatch = content.match(/<script>([\s\S]*)<\/script>/);
new Function(scriptMatch[1]);
console.log('Script parses OK');
"
```
Expected: `Script parses OK` (this only checks syntax validity, not runtime correctness — Step 4 covers that). If it throws, the delete in Step 2 broke something structurally; fix before continuing.

Then start the local server, load the app in Claude in Chrome, and do a full click-through: Koonti → Ruoka (start/stop a fast once more) → Koonti's Paastoaika modal. Check console for errors: expect none, including no `ReferenceError` for the removed function.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(paasto): remove obsolete automatic fasting calculation"
```

---

## Task 8: Full regression pass

**Files:** none (verification only).

**Interfaces:** none — this task exercises everything built in Tasks 1-7 together in one continuous session, matching the spec's own testing checklist (`docs/superpowers/specs/2026-09-10-manuaalinen-paastonseuranta-design.md`, section 7).

- [ ] **Step 1: Run the full spec checklist in one session**

With the local server running, using Claude in Chrome at a phone-width viewport, walk through all 6 items from the spec's Testaus section without reloading between them (to catch any state-leakage issue a fresh-reload test would hide):
1. Ruoka: "Aloita paasto" → status becomes "Xh Ymin", updates on its own after a minute passes (or force it by editing `_fastingInterval`'s delay temporarily via console for a faster check, then revert — don't leave debug changes in the file), button becomes "Lopeta paasto".
2. "Lopeta paasto" → status returns to "Ei aktiivista paastoa"; a new row appears in "Viimeisimmät".
3. Tap that row → edit modal with correctly pre-filled times; save updates the list; delete removes the row.
4. Koonti: Paastoaika row shows "(käynnissä)" while active; tapping it opens the modal with Start/Stop at the top and the per-day breakdown below.
5. Simulate the two-tab race from Task 1 Step 4 again, this time through `startFast()` twice in the browser console back to back — confirm the second call's console error is caught gracefully (no uncaught exception, no broken UI state) rather than just re-verifying the raw DB constraint.
6. Console: zero errors across the entire walkthrough.

- [ ] **Step 2: Stop the local dev server**

```bash
pkill -f "http.server 8934"
```

- [ ] **Step 3: Report completion**

Summarize to the user: all 8 tasks complete, feature verified end-to-end, ready for `git push` (per this project's established pattern: merge locally, then ask before pushing — see finishing-a-development-branch).
