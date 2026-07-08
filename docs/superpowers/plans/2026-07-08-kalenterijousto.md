# Kalenterijousto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing per-day session-override mechanism (the "Päivän tyyppi" picker on the Sali page) from a buggy `localStorage`-only implementation to a Supabase-backed one keyed by real calendar date, so it syncs across devices and no longer "leaks" across weeks.

**Architecture:** Single-file static app (`index.html`, vanilla JS + Supabase JS client, no build step, no test framework). One new Supabase table (`day_session_overrides`, keyed by `workout_date`). `loadWeekActivityData()` — already fetching `workout_sets`/`activity_data` for the visible week and caching them in `weekActivityCache` — gets a third parallel query added for overrides. `getActiveSession()`/`setActiveSession()` are rewritten to read/write that cache and Supabase instead of `localStorage`, keeping their existing call signature so all 10 existing call sites are unaffected.

**Tech Stack:** HTML/CSS/vanilla JS, Supabase JS client v2. No test runner — verification is manual, in a browser, using a local static server.

**Reference:** Design spec at `docs/superpowers/specs/2026-07-08-kalenterijousto-design.md`.

**How to manually test any task:** from the project root, run `python3 -m http.server 8080`, open `http://localhost:8080/index.html` in a browser, open the browser console (check for red errors after every interaction). Task 2 requires the Task 1 migration to have been applied to the live Supabase project first — this is a manual step performed via the Supabase SQL editor, not something you can do from within a sandboxed environment.

---

### Task 1: Supabase migration for `day_session_overrides`

**Files:**
- Create: `supabase/migrations/20260708_kalenterijousto.sql`

- [ ] **Step 1: Write the migration file**

```sql
create table day_session_overrides (
  workout_date  date primary key,
  session_type  text not null,
  created_at    timestamptz not null default now()
);

alter table day_session_overrides enable row level security;
create policy day_session_overrides_all on day_session_overrides
  for all to anon, authenticated using (true) with check (true);
```

- [ ] **Step 2: Note for the human operator**

This migration must be applied manually via the Supabase SQL editor (same process as the earlier `20260708_ohjelmaeditori.sql` migration) — there is no automated way to run it from this environment. Report this clearly rather than attempting `supabase db push` or similar; if no Supabase CLI/credentials are configured in your sandbox, that's expected, not a blocker for finishing this task's file-creation and commit steps.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260708_kalenterijousto.sql
git commit -m "feat: lisää day_session_overrides-taulu kalenterijoustolle"
```

---

### Task 2: Supabase-backed day override — extend `loadWeekActivityData`, rewrite `getActiveSession`/`setActiveSession`

**Files:**
- Modify: `index.html:1459-1493` (`loadWeekActivityData`)
- Modify: `index.html:1812-1814` (`getSessionKey`/`getActiveSession`/`setActiveSession`)

- [ ] **Step 1: Extend `loadWeekActivityData` to fetch and cache overrides**

Find the exact current function:

```js
async function loadWeekActivityData(o) {
  weekActivityCache = {};
  const mon = wStart(o);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const fromDate = mon.iso;
  const toDate   = localIso(sun);

  const [workoutRes, actRes] = await Promise.all([
    sb.from('workout_sets')
      .select('workout_date, exercise_name, set_number, weight_kg, reps')
      .gte('workout_date', fromDate)
      .lte('workout_date', toDate)
      .order('exercise_name')
      .order('set_number'),
    sb.from('activity_data')
      .select('activity_date, activity_type, duration_min, calories, avg_heart_rate, distance_km')
      .gte('activity_date', fromDate)
      .lte('activity_date', toDate),
  ]);

  (workoutRes.data || []).forEach(row => {
    if (!weekActivityCache[row.workout_date])
      weekActivityCache[row.workout_date] = { workout: {}, activities: [] };
    if (!weekActivityCache[row.workout_date].workout[row.exercise_name])
      weekActivityCache[row.workout_date].workout[row.exercise_name] = [];
    weekActivityCache[row.workout_date].workout[row.exercise_name].push(row);
  });

  (actRes.data || []).forEach(row => {
    if (!weekActivityCache[row.activity_date])
      weekActivityCache[row.activity_date] = { workout: {}, activities: [] };
    weekActivityCache[row.activity_date].activities.push(row);
  });
}
```

Replace with:

```js
async function loadWeekActivityData(o) {
  weekActivityCache = {};
  const mon = wStart(o);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const fromDate = mon.iso;
  const toDate   = localIso(sun);

  const [workoutRes, actRes, overrideRes] = await Promise.all([
    sb.from('workout_sets')
      .select('workout_date, exercise_name, set_number, weight_kg, reps')
      .gte('workout_date', fromDate)
      .lte('workout_date', toDate)
      .order('exercise_name')
      .order('set_number'),
    sb.from('activity_data')
      .select('activity_date, activity_type, duration_min, calories, avg_heart_rate, distance_km')
      .gte('activity_date', fromDate)
      .lte('activity_date', toDate),
    sb.from('day_session_overrides')
      .select('workout_date, session_type')
      .gte('workout_date', fromDate)
      .lte('workout_date', toDate),
  ]);

  (workoutRes.data || []).forEach(row => {
    if (!weekActivityCache[row.workout_date])
      weekActivityCache[row.workout_date] = { workout: {}, activities: [] };
    if (!weekActivityCache[row.workout_date].workout[row.exercise_name])
      weekActivityCache[row.workout_date].workout[row.exercise_name] = [];
    weekActivityCache[row.workout_date].workout[row.exercise_name].push(row);
  });

  (actRes.data || []).forEach(row => {
    if (!weekActivityCache[row.activity_date])
      weekActivityCache[row.activity_date] = { workout: {}, activities: [] };
    weekActivityCache[row.activity_date].activities.push(row);
  });

  (overrideRes.data || []).forEach(row => {
    if (!weekActivityCache[row.workout_date])
      weekActivityCache[row.workout_date] = { workout: {}, activities: [] };
    weekActivityCache[row.workout_date].override = row.session_type;
  });
}
```

- [ ] **Step 2: Rewrite `getSessionKey`/`getActiveSession`/`setActiveSession`**

Find:

```js
const getSessionKey    = (o, d)     => `w${o}_d${d}_sess`;
const getActiveSession = (o, d)     => LD[getSessionKey(o,d)] || SCHED[d];
const setActiveSession = (o, d, st) => { LD[getSessionKey(o,d)] = st; saveLD(); renderTreeni(); };
```

Replace with:

```js
const getActiveSession = (o, d) => {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const dayIso = localIso(dt);
  const cached = weekActivityCache[dayIso];
  return (cached && cached.override) || SCHED[d];
};

async function setActiveSession(o, d, st) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const workout_date = localIso(dt);
  const { error } = await sb.from('day_session_overrides')
    .upsert({ workout_date, session_type: st }, { onConflict: 'workout_date' });
  if (error) { console.error('setActiveSession failed:', error.message); return; }
  await loadWeekActivityData(o);
  renderTreeni();
}
```

(`getSessionKey` is deleted — it was only used by the two functions being replaced. Confirm no other code references it before deleting; see Step 3.)

- [ ] **Step 3: Confirm `getSessionKey` has no other callers**

```bash
grep -n "getSessionKey" index.html
```

Expected: zero matches after this change (the only two call sites, inside `getActiveSession`/`setActiveSession`, were both replaced in Step 2).

- [ ] **Step 4: Manual test**

**Requires the Task 1 migration to have been applied to the live Supabase project.** Open the app, go to Sali. Pick a different session from the "Päivän tyyppi" picker for some day — the day-tab short label and hero section update immediately (same as before this change). Reload the page (F5) — the override persists. Open the same URL in a second browser or incognito window — the override is visible there too (confirms Supabase sync, not just local state). Navigate to the next/previous week and back — the override stays on the correct date, doesn't appear on the adjacent week. Log a set on the overridden day — confirm it saves with the correct `session_type` in `workout_sets` (check via the Sali page's "Kehitys" tab chart for that exercise, or via Supabase's table editor). Confirm no console errors throughout.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: siirrä päiväkohtainen sessio-override Supabaseen oikealla päivämäärällä"
```

---

### Task 3: Full manual QA pass

**Files:** none (verification only)

- [ ] **Step 1: Run through the design spec's testing checklist**

(`docs/superpowers/specs/2026-07-08-kalenterijousto-design.md`, section 3 — this duplicates Task 2 Step 4's checks; run them once more here as a final pass after both tasks are committed, treating the branch as a whole rather than task-by-task.)

1. Override a day's session via the picker, confirm immediate UI update.
2. Reload — override persists.
3. Second browser/incognito — override visible (cross-device sync).
4. Week navigation — override stays pinned to the correct calendar date, doesn't bleed into adjacent weeks.
5. Override a day to a session that is then deleted via the Ohjelma editor — the day shows "Ei ohjelmoitua sessiota" without crashing.
6. Set-logging on an overridden day saves with the correct `session_type`.

- [ ] **Step 2: Grep for leftover references to the old mechanism**

```bash
grep -n "getSessionKey" index.html
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "v1.7.0: kalenterijousto siirretty Supabaseen"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec §1 (datamalli), Task 2 covers spec §2 (ajonaikainen integrointi — both the `loadWeekActivityData` extension and the `getActiveSession`/`setActiveSession` rewrite), Task 3 covers spec §3 (testaus) verbatim.
- **Placeholder scan:** no TBD/TODO; every step has literal before/after code.
- **Type/id consistency:** `weekActivityCache[dayIso].override` is written in Task 2 Step 1 (`loadWeekActivityData`) and read in Task 2 Step 2 (`getActiveSession`) — same property name, same shape. `day_session_overrides.workout_date`/`session_type` column names match between the Task 1 migration and Task 2's queries. No other task in the plan touches these same functions, so no cross-task drift risk.
