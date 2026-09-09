# UI-audit fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three issues found during a full browser-based UI audit of the app: (1) the "Juoksun kehitys" chart fetches the oldest 30 activities instead of the newest 30, (2) the exercise-detail modal's chart Y-axis shows duplicate rounded tick labels on a narrow weight range, (3) set/session-done state is trusted purely from `localStorage` with no reconciliation against the server, which can display stale local data as fully "done" with real-looking numbers.

**Architecture:** All three are isolated changes inside the single-file app `index.html`. Tasks 1 and 2 are one-line query/config fixes. Task 3 adds a new read-only reconciliation function called from the existing `renderSession()` flow — it never touches the write path (`saveSet`/`syncSet`/`toggleDone`), only overwrites local cache to match the server, while explicitly skipping any set that's mid-debounce or sitting in the offline-write queue so in-flight edits are never clobbered.

**Tech Stack:** Vanilla JS, Supabase JS client, Chart.js. No build step, no test framework — verification is manual, in-browser.

---

## File Structure

Everything lives in one file:
- **Modify: `index.html`**
  - `loadRunChart()` (~line 4503): fix query direction.
  - `loadModalChart()`'s `_modalChart` construction (~line 4453): add `maxTicksLimit` to the y-scale.
  - New function `reconcileSessionWithServer()` (placed near `loadPrevSession()`, ~line 1962) and one new call site inside `renderSession()` (~line 3092).

No new files.

---

### Task 1: Fix "Juoksun kehitys" chart fetching oldest instead of newest activities

**Files:**
- Modify: `index.html:4503-4511` (`loadRunChart()`)

- [ ] **Step 1: Fix the query direction**

Find in `index.html`:
```js
async function loadRunChart() {
  const type = document.getElementById('run-chart-type')?.value || 'distance';
  const { data, error } = await sb
    .from('activity_data')
    .select('activity_date, duration_min, distance_km')
    .in('activity_type', ['Juoksu', 'Kävely'])
    .not('distance_km', 'is', null)
    .order('activity_date', { ascending: true })
    .limit(30);
```
Replace with:
```js
async function loadRunChart() {
  const type = document.getElementById('run-chart-type')?.value || 'distance';
  const { data: rawData, error } = await sb
    .from('activity_data')
    .select('activity_date, duration_min, distance_km')
    .in('activity_type', ['Juoksu', 'Kävely'])
    .not('distance_km', 'is', null)
    .order('activity_date', { ascending: false })
    .limit(30);
  const data = rawData ? [...rawData].reverse() : rawData;
```
Everything after this (the `if (error || !data || !data.length)` check and the rest of the function) stays exactly as-is — it already reads from `data`, which now holds the 30 most recent activities in ascending chronological order (correct for a left-to-right time-series chart).

- [ ] **Step 2: Verify**

There is no automated test suite for this project. Verify by:
```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task1.js && node --check /tmp/task1.js
```
Confirm no syntax errors.

```bash
grep -n "ascending: false" index.html | grep -i "activity_date\|loadRunChart"
```
Won't match directly since the pattern spans lines — instead confirm by reading the function: `grep -n "async function loadRunChart" -A 12 index.html` and check the `.order('activity_date', { ascending: false })` line and the new `rawData`/`data` lines are present exactly as specified.

A human will verify the actual chart behavior in-browser (query direction can't be tested without live Supabase data in this environment) — note in your report that this needs live verification against an account with more than 30 logged runs/walks.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
fix(aerobia): fetch newest activities for Juoksun kehitys chart

order(ascending: true).limit(30) fetched the oldest 30 Juoksu/Kävely
rows instead of the most recent 30, so the running-progress chart
silently stopped showing new activity once more than 30 had ever been
logged. Fetch newest-first with the same limit, then reverse in JS so
the chart still renders left-to-right in chronological order.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 2: Fix duplicate Y-axis tick labels in the exercise-detail modal chart

**Files:**
- Modify: `index.html:4453-4456` (inside `loadModalChart()`'s `_modalChart = new Chart(...)`)

- [ ] **Step 1: Add `maxTicksLimit` to the y-scale**

Find in `index.html`:
```js
        scales: {
          y: { ticks: { color: '#555', font: { size: 10 }, callback: v => Math.round(v) + ' kg' }, grid: { color: '#222' } },
          x: { ticks: { color: '#555', font: { size: 10 } }, grid: { display: false } },
        },
```
(this is inside the `options` object of the `_modalChart = new Chart(document.getElementById('ex-modal-chart'), {...})` call in `loadModalChart()` — confirm you're editing this exact chart instance, not one of the other charts in the file that has a similarly-shaped `scales` block).

Replace with:
```js
        scales: {
          y: { ticks: { color: '#555', font: { size: 10 }, maxTicksLimit: 6, callback: v => Math.round(v) + ' kg' }, grid: { color: '#222' } },
          x: { ticks: { color: '#555', font: { size: 10 } }, grid: { display: false } },
        },
```
This matches the existing `maxTicksLimit: 8` pattern already used on x-axes elsewhere in this file (lines ~2655, ~6863) — fewer auto-generated ticks means Chart.js spaces them further apart, which stops the post-rounding duplicate-label problem on narrow weight ranges (e.g. 72-73kg).

- [ ] **Step 2: Verify**

```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task2.js && node --check /tmp/task2.js
```
Confirm no syntax errors.

```bash
grep -n "maxTicksLimit" index.html
```
Confirm there are now 3 matches total (the 2 pre-existing x-axis ones, plus this new y-axis one) — and confirm via `grep -n "ex-modal-chart" -B 20 index.html | grep maxTicksLimit` (or by reading the surrounding lines directly) that the new one is specifically on the `ex-modal-chart`'s y-scale, not accidentally added to a different chart.

A human should verify visually in-browser: open an exercise with a narrow recent weight range (e.g. 1-2kg spread across sessions) and confirm the Y-axis no longer repeats the same rounded number multiple times in a row.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
fix(sali): stop duplicate Y-axis labels on exercise-detail chart

Chart.js's auto-generated ticks on a narrow weight range (e.g.
72-73kg) produced several fractional values that all rounded to the
same displayed integer, showing "73kg" repeated 5-7 times in a row.
Adds maxTicksLimit, matching the pattern already used on x-axes
elsewhere in this file, so fewer, more widely-spaced ticks are
generated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 3: Reconcile session set/done state against the server on load

**Files:**
- Modify: `index.html` (new function, placed immediately after `loadPrevSession()`, ~line 1962)
- Modify: `index.html:3091-3093` (inside `renderSession()`, the call site)

**Context for the implementer:** This app tracks in-progress workout data two ways: `LD` (a `localStorage`-backed object, keyed by `` `${isoWeekYear}-${isoWeek}_d${dayIndex}_${sessionType}_e${exerciseIndex}` ``, holding `{sets: [{kg, reps}, ...]}` per exercise) and the real database tables `workout_sets` (one row per set, keyed by the literal calendar date) and `workout_sessions` (one row per date+session_type, with an `is_done` flag). Until now, nothing ever reads `workout_sets`/`workout_sessions` back into `LD` to verify it — the UI trusts whatever is sitting in `localStorage` forever, which was confirmed (during a UI audit) to be able to show fully-"done" sets with real-looking numbers that were never actually saved to the server (e.g. leftover local data from an earlier session, or from testing on a shared/reused browser). This task adds a read-only reconciliation step: fetch what the server actually has for the exact calendar date being viewed, and overwrite `LD` to match — except for a set that was just typed into (still inside its 500ms debounce window, tracked in the existing `syncTimers` object) or is sitting in the existing offline-write retry queue (`loadQueue()`), since those are genuinely newer than what the server currently knows.

- [ ] **Step 1: Add `reconcileSessionWithServer()`**

Find in `index.html` (the end of the existing `loadPrevSession()` function):
```js
  data.forEach(r => {
    if (r.workout_date !== latestDate[r.exercise_name]) return;
    if (!prevCache[r.exercise_name]) prevCache[r.exercise_name] = [];
    prevCache[r.exercise_name].push(r);
  });
}
```
Add immediately after the closing `}` of `loadPrevSession`:
```js

async function reconcileSessionWithServer(o, d, st, sess, requestId) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const dateIso = localIso(dt);
  const names = sess.ex.map(e => e.n);

  const [{ data: setRows }, { data: sessionRows }] = await Promise.all([
    sb.from('workout_sets').select('exercise_name,set_number,weight_kg,reps')
      .eq('workout_date', dateIso).in('exercise_name', names),
    sb.from('workout_sessions').select('is_done')
      .eq('workout_date', dateIso).eq('session_type', st).limit(1),
  ]);
  if (requestId !== treeniRequestId) return;

  const queue = loadQueue();
  const isPendingSet = (exName, setNum) => queue.some(q =>
    q.table === 'workout_sets' && q.payload &&
    q.payload.workout_date === dateIso && q.payload.exercise_name === exName && q.payload.set_number === setNum);
  const isPendingDone = queue.some(q =>
    q.table === 'workout_sessions' && q.payload && q.payload.workout_date === dateIso);

  const serverByExercise = {};
  (setRows || []).forEach(r => {
    if (!serverByExercise[r.exercise_name]) serverByExercise[r.exercise_name] = {};
    serverByExercise[r.exercise_name][r.set_number] = r;
  });

  let changed = false;
  sess.ex.forEach((ex, ei) => {
    const k = eKey(o, d, st, ei);
    const ed = LD[k] || { sets: [] };
    for (let s = 0; s < ex.s; s++) {
      const timerKey = `${o}-${d}-${ei}-${s}`;
      if (syncTimers[timerKey]) continue;
      if (isPendingSet(ex.n, s + 1)) continue;

      const serverSet = serverByExercise[ex.n] && serverByExercise[ex.n][s + 1];
      const newVal = serverSet
        ? { kg: serverSet.weight_kg != null ? String(serverSet.weight_kg) : '', reps: serverSet.reps != null ? String(serverSet.reps) : '' }
        : {};
      const oldVal = ed.sets[s] || {};
      if ((oldVal.kg || '') !== (newVal.kg || '') || (oldVal.reps || '') !== (newVal.reps || '')) {
        ed.sets[s] = newVal;
        changed = true;
      }
    }
    LD[k] = ed;
  });

  const doneKey = `${dKey(o, d, st)}_done`;
  if (!isPendingDone) {
    const serverDone = !!(sessionRows && sessionRows[0] && sessionRows[0].is_done);
    if (LD[doneKey] !== serverDone) { LD[doneKey] = serverDone; changed = true; }
  }

  if (changed) saveLD();
}
```

- [ ] **Step 2: Call it from `renderSession()`**

Find in `index.html`:
```js
  // Fetch previous session data
  await loadPrevSession(wOff, aDay, requestId);
  if (requestId !== treeniRequestId) return;

  const done    = isDone(wOff, aDay, st);
```
Replace with:
```js
  // Fetch previous session data
  await loadPrevSession(wOff, aDay, requestId);
  if (requestId !== treeniRequestId) return;
  await reconcileSessionWithServer(wOff, aDay, st, sess, requestId);
  if (requestId !== treeniRequestId) return;

  const done    = isDone(wOff, aDay, st);
```
This runs after `loadPrevSession()` and before `done`/`started` are read from `LD` (via `isDone`/`isStarted`) and before `sess.ex.forEach(...)` reads set data via `getED()` — so the reconciled values are what the rest of this render pass actually uses.

- [ ] **Step 3: Manual verification**

There is no automated test suite for this project. Verify by:
```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task3.js && node --check /tmp/task3.js
```
Confirm no syntax errors.

```bash
grep -n "reconcileSessionWithServer" index.html
```
Confirm it appears exactly twice: once as the function definition, once as the call site inside `renderSession()`.

Read the full new function back and confirm:
- It never writes to `workout_sets`/`workout_sessions` (read-only — only `sb.from(...).select(...)`, no `.insert`/`.upsert`/`.update`).
- It never touches `isStarted`/`setStarted`/any `_started` localStorage key.
- The `syncTimers` and `loadQueue` identifiers it references are the actual pre-existing ones in this file (confirm their definitions still match: `const syncTimers = {};` and `function loadQueue() {...}` reading from `OFFLINE_QUEUE_KEY`).

A human should verify interactively in-browser (this can't be fully exercised without a live Supabase connection and real timing in this environment) — describe in your report the following checks for the human to run:
1. Run `localStorage.clear()` in the browser console, reload, open a day/session with no data logged for that exact calendar date yet — confirm all sets render empty/not-done (no false positives).
2. In the console, manually inject a stale/wrong value into `LD` for a set that does NOT match what's actually in `workout_sets` for that date (edit the `treeni_v3` localStorage key directly, or use `LD[...] = ...; saveLD();` in the console), then reload and reopen that same session — confirm the wrong value is replaced by the real server value (or cleared, if the server has no row for that set).
3. Type a new value into a KG field and, within less than 500ms, switch to a different day-tab and back — confirm the just-typed value is NOT wiped out by reconciliation (debounce guard working).
4. If practical: simulate an offline write (e.g. DevTools "Offline" mode while typing a value so it lands in the retry queue), then switch tabs away and back before reconnecting — confirm the queued value is not cleared by reconciliation.
5. Check the browser console for errors throughout, especially on day-tab switches (each one now fires two extra Supabase queries).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sali): reconcile session set/done state against the server on load

Set and done-state data was trusted entirely from localStorage (LD)
with no verification against what's actually saved in workout_sets/
workout_sessions. Confirmed during a UI audit that this can display
stale local data (e.g. leftover from a prior session on a reused
browser) as fully "done" with real-looking numbers never actually
saved -- the same user-visible symptom as the 2026-09-05 autofill
incident, via a different mechanism.

reconcileSessionWithServer() fetches the exact calendar date's real
saved sets/done-flag on every session render and overwrites LD to
match, except for a set still inside its debounce window (syncTimers)
or sitting in the offline-write retry queue, since those are newer
than what the server currently knows. Read-only: never touches the
write path (saveSet/syncSet/toggleDone) or the local-only isStarted
flag.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Design doc §1 (run chart) → Task 1. §2 (modal chart) → Task 2. §3 (reconciliation) → Task 3, matching the exact function body and call-site placement specified. §4 (Rajaus: no UI indicator, no `isStarted` changes, no new tables, no reconciliation on other pages) is respected — no task adds a loading/sync indicator, touches `isStarted`, adds a migration, or touches Aerobia/Keho/Uni rendering.
- **Placeholder scan:** no TBD/TODO; every step shows exact before/after code.
- **Type/name consistency:** `reconcileSessionWithServer`, `dateIso`, `isPendingSet`, `isPendingDone`, `serverByExercise` are each introduced once and used identically within the single function that defines them; `eKey`/`dKey`/`syncTimers`/`loadQueue`/`saveLD`/`treeniRequestId` are all pre-existing identifiers confirmed present elsewhere in the file, not redefined here.
