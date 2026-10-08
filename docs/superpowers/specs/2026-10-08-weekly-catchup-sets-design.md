# Viikon rästit — undone sets carried into the extra workout (main)

**Status:** approved in chat 2026-10-08 (parts 1 and 2). Target: **main** (single-user app).
Later merged into beta as part of the main→beta merge.

## Goal

Sets left undone in a gym workout that was marked done during the week reappear as an extra
"Viikon rästit" section in the week's catch-up workout (Treeni 5), so they can be made up.
Treeni 5 keeps its own program unchanged; the catch-up section is added after it.

## Decisions (from the brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | What counts as undone | Only missing sets from workouts that were **done**. Workouts not done at all that week generate nothing. |
| 2 | When is a workout "done" | Marked done with "Merkitse tehdyksi" (`workout_sessions.is_done = true`). |
| 3 | Presentation | Own section **"Viikon rästit"** after the catch-up workout's own exercises. Same-named exercise already in the catch-up workout → sets merged into that row. |
| 4 | Which workout collects | A per-workout switch **"Kerää viikon rästit"** in the program editor (`program_sessions.collects_catchup`). The collecting workout keeps its own independent program. |

Week = ISO week, Monday–Sunday, of the day the collecting workout is shown on.

## Behaviour

### Counting undone sets (for one week)

1. Done workouts = `workout_sessions` rows in the week with `is_done = true`, whose session is a
   program session with exercises and **does not** have `collects_catchup` on.
2. For each done workout (session `S` on date `D`) and each exercise `ex` of `S`'s current
   program: `logged` = number of `workout_sets` rows on `D` for `ex.n` with a weight or reps
   value (same rule as the existing "done" check — prefilled suggestions aren't in the database,
   so they never count). `missing = max(0, ex.s − logged)`.
3. Missing sets are combined per exercise name across workouts: total missing, plus the list of
   origin workouts (e.g. "Treeni 2", or "Treeni 2, Treeni 3") and the first origin's
   `target_display` for the reps/format hint.
4. **Already caught up earlier this week:** for each name, sets logged on *other* days of the week
   whose session collects catch-up, minus that session's own target for that name (0 if it has
   none), floored at 0. These are subtracted from the total. The current day's own logged sets
   are not subtracted — they fill the rows shown on that day.
5. Names with 0 remaining are dropped. No remaining names → no section.

### The collecting workout's day view

- Its own exercises first, exactly as today.
- If a catch-up name equals one of its own exercise names: that row's set count becomes
  `own sets + catch-up sets`, with a small label "+N rästi(ä) <origin>:sta".
- Remaining catch-up names: a "Viikon rästit" section heading, then one row per exercise:
  name, origin ("Treeni 2"), and `N×<reps>` from the origin's target. Normal set rows.
- Logging a catch-up set works like any other set: `workout_sets` upsert with the day's date, the
  exercise name, set number, and `session_type` = the collecting session.
- "Merkitse tehdyksi" warning also lists catch-up rows with undone sets.

### Not changed

Statistics, progress charts, prefill history and the weight-plateau hint work as before (catch-up
sets are ordinary sets of the collecting workout). Past weeks are not recalculated or modified.
No existing data is changed.

## Technical design

### Database

`supabase/migrations/20261009_catchup_session.sql`:

```sql
alter table program_sessions add column collects_catchup boolean not null default false;
```

Applied by the user in the dashboard SQL editor, verified with a REST check (CLAUDE.md). Prefix
20261009 (not today's 20261008) because beta already has a `20261008_birth_year` migration and
the prefix is the migration ledger version. No backfill: the user switches it on for Treeni 5 in
the program editor. Missing column (before the SQL is run) → `collects_catchup` is `undefined`
→ feature off.

### Code (index.html)

1. **`computeWeekCatchup({ sessions, sets, program })`** — pure function, no DOM/Supabase.
   Inputs: the week's done `workout_sessions` rows, the week's `workout_sets` rows, and the
   program (`programSessionsRaw` + `SESS`). Output: `{ byName: { [exerciseName]: { remaining,
   origins: [sessionName], targetDisplay } } }` minus what was caught up on other collecting days
   (needs the date being viewed as an input).
2. **Week cache:** `loadWeekActivityData(o)` already fetches the week's sets; it additionally
   fetches the week's `workout_sessions` (`is_done`) once. The catch-up result per date is derived
   from this cache synchronously during render.
3. **`daySession(o, d, st)`** — returns `SESS[st]` unchanged for non-collecting sessions. For a
   collecting session returns a copy with `ex` = own exercises (merged set counts) + catch-up
   exercises `{ n, t, s, _id: 'rasti:' + name, catchup: { origins, merged } }`. The stable
   `rasti:` id keeps localStorage set keys (`eKey`) stable when the list changes.
4. **Call sites:** every place that reads a specific day's exercise list (`SESS[st].ex` with a
   known `o`/`d` — ~15 sites: render, syncSet, reconcile, prefill, set status, done warning,
   plateau/progress hints, Koonti "Kesken" text) switches to `daySession(o, d, st)`. Sites that
   need the *program* (program editor, per-session history) keep `SESS[st]`.
5. **Program editor:** switch "Kerää viikon rästit" in each session's expanded view; saved via
   `sbWrite` update on `program_sessions.collects_catchup`, then `loadProgram()`.

### Beta later

Same column on beta's `program_sessions` (already has `user_id`; the column is per row so per
user). Each tester picks their own collecting workout.

## Testing

Main uses the real database — **no test may write to it**. All browser tests intercept every
non-GET Supabase request; made-up data is injected only inside the test browser.

1. `computeWeekCatchup` against the real data (read-only): current week (W41) →
   `Yksikätinen soutulaite: 3, origin Treeni 2`; previous week (W40) → nothing. Edge cases with
   made-up input: missing sets in two workouts, same name in collecting workout (merge), two
   collecting days in a week, workout not done → ignored, prefilled-only sets → still missing.
2. Browser, writes blocked: catch-up section on a Treeni 5 day, merged row label, logging a
   catch-up set (intercepted upsert has the right date/name/set number/session_type), done
   warning lists catch-up rows, program editor switch sends the right update.
3. Regression: Treeni 1–4 day views render identically before/after (side-by-side, old main vs
   branch).
4. PR to main; the user tests in the app.
