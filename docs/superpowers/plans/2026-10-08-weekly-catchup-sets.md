# Viikon rästit (weekly catch-up sets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Undone sets from gym workouts marked done this week appear in the week's catch-up workout (the one with "Kerää viikon rästit" on) — merged into same-named rows, otherwise in a "Viikon rästit" section after the workout's own exercises.

**Architecture:** One pure function `computeWeekCatchup()` derives the catch-up list from the week's data. One function `daySession(o, d, st)` returns the exercise list *for a given day* (program exercises, plus catch-up for collecting sessions); every gym-page call site that reads a specific day's exercises switches from `SESS[st]` to it. A boolean column `program_sessions.collects_catchup` marks the collecting workout, toggled in the program editor.

**Tech Stack:** Single-file vanilla JS PWA (`index.html`), Supabase (PostgREST), Chart-free. Tests: plain Node scripts (no framework in this repo) + Playwright (`playwright-core` from `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core`) against `python3 -m http.server 8765` serving the repo.

**Spec:** `docs/superpowers/specs/2026-10-08-weekly-catchup-sets-design.md`

## Global Constraints

- Target app: **main** (branch `feature/catchup-sets` off `main`; ships via PR to `main`).
- **Main uses the real Supabase database (`yznuzwbbyasgqeqllxic`). No test may write to it.** Every browser test intercepts all non-GET/HEAD/OPTIONS requests to `supabase.co` and answers them locally (`route.fulfill({status:201, body:'[]'})`). Made-up data is injected only inside the test browser by fulfilling GET routes.
- No existing data is changed or deleted. The only schema change is adding `program_sessions.collects_catchup boolean not null default false`.
- Exercise ids are interpolated **unquoted** into inline handlers (`saveSet(${o},${d},${exId},…)`), so catch-up exercise ids must be **numbers**: negative integers from `catchupExId(name)` (real ids are positive bigint identities).
- UI text in Finnish: section heading `Viikon rästit`, editor switch `Kerää viikon rästit`, merged label `+N rästi(ä) <origin>:sta`.
- "Done workout" = `workout_sessions.is_done = true`. "Logged set" = a `workout_sets` row with `weight_kg != null || reps != null`.
- Week = Monday–Sunday of the viewed week (`wStart(o)`), same as the gym page.

---

### Task 1: Schema column + program loads the flag

**Files:**
- Create: `supabase/migrations/20261009_catchup_session.sql`
- Modify: `index.html` — `loadProgram()` (SESS construction, ~line 1821)

**Interfaces:**
- Produces: `SESS[id].collectsCatchup: boolean` (false when the column doesn't exist yet).

- [ ] **Step 1: Write the migration**

```sql
-- Marks the program session that collects the week's undone sets ("Viikon rästit").
-- Off by default; the user switches it on for the extra workout in the program editor.
alter table program_sessions add column collects_catchup boolean not null default false;
```

- [ ] **Step 2: Carry the flag into SESS** — in `loadProgram()` change

```js
    newSESS[s.id] = { name: s.name, focus: s.focus || '', ex: [] };
```
to
```js
    newSESS[s.id] = { name: s.name, focus: s.focus || '', ex: [], collectsCatchup: s.collects_catchup === true };
```

- [ ] **Step 3: Verify** — syntax check (`node --check` on the extracted inline script, see Task 2 step 2 for the extraction one-liner) and, in the browser test of Task 6, that `SESS.t5.collectsCatchup` reflects the injected program row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261009_catchup_session.sql index.html
git commit -m "feat(sali): collects_catchup-sarake ohjelman sessioille"
```

The user applies the SQL in the dashboard (`https://supabase.com/dashboard/project/yznuzwbbyasgqeqllxic/sql/new`) after the PR is approved, verified with a REST check per CLAUDE.md; then syncs the ledger with `insert into supabase_migrations.schema_migrations (version) values ('20261009') on conflict do nothing;`.

---

### Task 2: Pure function `computeWeekCatchup` (TDD)

**Files:**
- Modify: `index.html` — add after `getActiveSession` (~line 3590)
- Create: `scripts/test-catchup.mjs`

**Interfaces:**
- Produces:
```js
// computeWeekCatchup({ doneSessions, setsByDate, program, daySessionByDate, viewDate })
//   doneSessions:     [{ workout_date: 'YYYY-MM-DD', session_type: string, is_done: true }]
//   setsByDate:       { [iso]: { [exerciseName]: [{ set_number, weight_kg, reps }] } }
//   program:          SESS-shaped { [id]: { name, ex: [{ n, t, s }], collectsCatchup } }
//   daySessionByDate: { [iso]: sessionId }   (the 7 days of the week → active session)
//   viewDate:         iso of the collecting day being shown
// returns { [exerciseName]: { remaining: number, origins: string[], targetDisplay: string } }
```

- [ ] **Step 1: Write the failing test** — `scripts/test-catchup.mjs`:

```js
// Unit test for computeWeekCatchup, extracted from index.html (no build step in this repo).
// Run: node scripts/test-catchup.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/\nfunction computeWeekCatchup\([\s\S]*?\n\}\n/);
assert.ok(src, 'computeWeekCatchup not found in index.html');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src[0] + '\nthis.f = computeWeekCatchup;', ctx);
const f = ctx.f;

const program = {
  t1: { name: 'Treeni 1', ex: [{ n: 'Penkki', t: '3×8', s: 3 }, { n: 'Soutu', t: '3×10', s: 3 }], collectsCatchup: false },
  t2: { name: 'Treeni 2', ex: [{ n: 'Ylätalja', t: '3×10', s: 3 }, { n: 'Reverse Pec Deck', t: '3×15', s: 3 }], collectsCatchup: false },
  t5: { name: 'Treeni 5', ex: [{ n: 'Reverse Pec Deck', t: '3×15', s: 3 }, { n: 'Pohjenousu', t: '4×12', s: 4 }], collectsCatchup: true },
  lepo: { name: 'Lepo', ex: [], collectsCatchup: false },
};
const set = (n, kg = 50, reps = 10) => ({ set_number: n, weight_kg: kg, reps });
const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
const days = (map) => Object.fromEntries(week.map((d, i) => [d, map[i] || 'lepo']));
const run = (o) => JSON.parse(JSON.stringify(f(o)));

// 1. Missing sets in a done workout → catch-up; untouched exercise counts fully.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), { Soutu: { remaining: 2, origins: ['Treeni 1'], targetDisplay: '3×10' } });

// 2. Not-done workout → ignored, even with missing sets.
assert.deepEqual(run({
  doneSessions: [],
  setsByDate: { [week[0]]: { Penkki: [set(1)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), {});

// 3. Same exercise missing in two workouts → combined, both origins listed.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[1], session_type: 't2', is_done: true },
                 { workout_date: week[2], session_type: 't2', is_done: true }],
  setsByDate: { [week[1]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1), set(2)] },
                [week[2]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1)] } },
  program, daySessionByDate: days({ 1: 't2', 2: 't2', 6: 't5' }), viewDate: week[6],
}), { 'Reverse Pec Deck': { remaining: 3, origins: ['Treeni 2'], targetDisplay: '3×15' } });

// 4. Rows without weight AND reps don't count as logged.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), { set_number: 3, weight_kg: null, reps: null }], Soutu: [set(1), set(2), set(3)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), { Penkki: { remaining: 1, origins: ['Treeni 1'], targetDisplay: '3×8' } });

// 5. A collecting workout never generates catch-up itself, even when done with missing sets.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[4], session_type: 't5', is_done: true }],
  setsByDate: { [week[4]]: { Pohjenousu: [set(1)] } },
  program, daySessionByDate: days({ 4: 't5', 6: 't5' }), viewDate: week[6],
}), {});

// 6. Caught up on an EARLIER collecting day this week → subtracted on the later one.
//    Fri (t5): own Reverse Pec Deck 3 + 1 catch-up logged = 4 sets → 1 caught up of 2.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[1], session_type: 't2', is_done: true }],
  setsByDate: { [week[1]]: { Ylätalja: [set(1), set(2), set(3)], 'Reverse Pec Deck': [set(1)] },
                [week[4]]: { 'Reverse Pec Deck': [set(1), set(2), set(3), set(4)] } },
  program, daySessionByDate: days({ 1: 't2', 4: 't5', 6: 't5' }), viewDate: week[6],
}), { 'Reverse Pec Deck': { remaining: 1, origins: ['Treeni 2'], targetDisplay: '3×15' } });

// 7. The viewed day's own logged sets are NOT subtracted (they fill the rows shown).
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1)] },
                [week[6]]: { Soutu: [set(1), set(2)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), { Soutu: { remaining: 2, origins: ['Treeni 1'], targetDisplay: '3×10' } });

// 8. Everything done → nothing.
assert.deepEqual(run({
  doneSessions: [{ workout_date: week[0], session_type: 't1', is_done: true }],
  setsByDate: { [week[0]]: { Penkki: [set(1), set(2), set(3)], Soutu: [set(1), set(2), set(3)] } },
  program, daySessionByDate: days({ 0: 't1', 6: 't5' }), viewDate: week[6],
}), {});

console.log('computeWeekCatchup: all 8 cases pass');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/test-catchup.mjs`
Expected: `AssertionError … computeWeekCatchup not found in index.html`

- [ ] **Step 3: Implement** — add to `index.html` directly after the `getActiveSession` arrow function:

```js
// Weekly catch-up ("Viikon rästit") for the collecting workout shown on viewDate.
// Undone = target sets minus logged sets (a row with weight or reps) of each exercise in a
// workout marked done this week; collecting workouts never generate catch-up themselves.
// Sets already made up on OTHER collecting days this week are subtracted; the viewed day's own
// logged sets are not (they fill the rows shown). Pure: no DOM, no Supabase.
function computeWeekCatchup({ doneSessions, setsByDate, program, daySessionByDate, viewDate }) {
  const loggedCount = (iso, name) =>
    ((setsByDate[iso] || {})[name] || []).filter(r => r.weight_kg != null || r.reps != null).length;
  const out = {};
  for (const row of doneSessions || []) {
    const sess = program[row.session_type];
    if (!row.is_done || !sess || sess.collectsCatchup || !sess.ex || !sess.ex.length) continue;
    for (const ex of sess.ex) {
      const missing = Math.max(0, ex.s - loggedCount(row.workout_date, ex.n));
      if (!missing) continue;
      if (!out[ex.n]) out[ex.n] = { remaining: 0, origins: [], targetDisplay: ex.t };
      out[ex.n].remaining += missing;
      if (!out[ex.n].origins.includes(sess.name)) out[ex.n].origins.push(sess.name);
    }
  }
  for (const [iso, sid] of Object.entries(daySessionByDate || {})) {
    const sess = program[sid];
    if (iso === viewDate || !sess || !sess.collectsCatchup) continue;
    for (const name of Object.keys(out)) {
      const own = (sess.ex.find(e => e.n === name) || { s: 0 }).s;
      out[name].remaining -= Math.max(0, loggedCount(iso, name) - own);
    }
  }
  for (const name of Object.keys(out)) if (out[name].remaining <= 0) delete out[name];
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/test-catchup.mjs`
Expected: `computeWeekCatchup: all 8 cases pass`

Also syntax-check the page script:
```bash
python3 -I -c "import re;h=open('index.html').read();open('/tmp/app.js','w').write('\n'.join(re.findall(r'<script>(.*?)</script>',h,re.S)))" && node --check /tmp/app.js
```
(use the session scratchpad path instead of `/tmp` when running inside Claude Code)

- [ ] **Step 5: Commit**

```bash
git add index.html scripts/test-catchup.mjs
git commit -m "feat(sali): computeWeekCatchup + yksikkötesti"
```

---

### Task 3: Week data + `daySession()` + `catchupExId()`

**Files:**
- Modify: `index.html` — `loadWeekActivityData()` (~line 2433), new functions after `computeWeekCatchup`

**Interfaces:**
- Consumes: `computeWeekCatchup` (Task 2), `SESS[id].collectsCatchup` (Task 1).
- Produces:
  - `let weekDoneSessions = []` and `let weekActivityOffset = null` (globals next to `weekActivityCache`).
  - `catchupExId(name: string): number` — stable negative integer.
  - `daySession(o: number, d: number, st: string)` → `SESS[st]` unchanged for non-collecting sessions / unknown `st` / a week that isn't loaded; for collecting sessions a copy `{ ...SESS[st], ex: [...own, ...extra] }` where merged own rows are `{ ...e, s: e.s + c.remaining, catchup: { remaining, origins, targetDisplay, merged: true } }` and extra rows are `{ n, t: targetDisplay, s: remaining, _id: catchupExId(n), catchup: { remaining, origins, targetDisplay, merged: false } }`.

- [ ] **Step 1: Fetch the week's done workouts** — in `loadWeekActivityData`, add a 4th query to the `Promise.all` and destructure it:

```js
  const [workoutRes, actRes, overrideRes, doneRes] = await Promise.all([
    /* …existing three queries unchanged… */
    sb.from('workout_sessions')
      .select('workout_date, session_type, is_done')
      .eq('is_done', true)
      .gte('workout_date', fromDate)
      .lte('workout_date', toDate),
  ]);
```
After the `requestId` check:
```js
  if (doneRes.error) console.error('loadWeekActivityData (workout_sessions) failed:', doneRes.error.message);
  weekDoneSessions = doneRes.data || [];
  weekActivityOffset = o;
```
and at the top of the function, next to `weekActivityCache = {};`: `weekDoneSessions = []; weekActivityOffset = null;`. Declare the two globals right after `let weekActivityCache = {};`:
```js
let weekDoneSessions = [];   // workout_sessions rows with is_done for the loaded week
let weekActivityOffset = null; // which week (wOff) weekActivityCache/weekDoneSessions describe
```

- [ ] **Step 2: Add the helpers** after `computeWeekCatchup`:

```js
// Catch-up exercises have no program row, so they get a synthetic id: a stable NEGATIVE integer
// (real ids are positive) because ids are written unquoted into inline handlers.
function catchupExId(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return -((h >>> 0) % 2147483646) - 1;
}

// The exercise list for one day: the program's exercises, plus the week's catch-up sets when the
// day's workout collects them (merged into a same-named row, otherwise appended). Every gym-page
// code path that works on a specific day must use this instead of SESS[st].
function daySession(o, d, st) {
  const sess = SESS[st];
  if (!sess || !sess.collectsCatchup || o !== weekActivityOffset) return sess;
  const mon = wStart(o);
  const isos = [...Array(7)].map((_, i) => { const x = new Date(mon.date); x.setDate(mon.date.getDate() + i); return localIso(x); });
  const catchup = computeWeekCatchup({
    doneSessions: weekDoneSessions,
    setsByDate: Object.fromEntries(isos.map(iso => [iso, (weekActivityCache[iso] && weekActivityCache[iso].workout) || {}])),
    program: SESS,
    daySessionByDate: Object.fromEntries(isos.map((iso, i) => [iso, getActiveSession(o, i)])),
    viewDate: isos[d],
  });
  if (!Object.keys(catchup).length) return sess;
  const own = sess.ex.map(e => catchup[e.n]
    ? { ...e, s: e.s + catchup[e.n].remaining, catchup: { ...catchup[e.n], merged: true } }
    : e);
  const extra = Object.entries(catchup)
    .filter(([n]) => !sess.ex.some(e => e.n === n))
    .map(([n, c]) => ({ n, t: c.targetDisplay, s: c.remaining, _id: catchupExId(n), catchup: { ...c, merged: false } }));
  return { ...sess, ex: [...own, ...extra] };
}
```

- [ ] **Step 3: Extend the unit test** — append to `scripts/test-catchup.mjs` before the final `console.log`:

```js
// catchupExId: stable, negative, distinct for distinct names.
const idSrc = html.match(/\nfunction catchupExId\([\s\S]*?\n\}\n/);
assert.ok(idSrc, 'catchupExId not found');
vm.runInContext(idSrc[0] + '\nthis.id = catchupExId;', ctx);
const a = ctx.id('Yksikätinen soutulaite'), b = ctx.id('Yksikätinen soutulaite'), c = ctx.id('Reverse Pec Deck');
assert.equal(a, b); assert.ok(a < 0 && Number.isInteger(a)); assert.notEqual(a, c);
console.log('catchupExId: ok');
```
Run: `node scripts/test-catchup.mjs` → both lines print.

- [ ] **Step 4: Commit**

```bash
git add index.html scripts/test-catchup.mjs
git commit -m "feat(sali): daySession() ja viikon tehdyt treenit välimuistiin"
```

---

### Task 4: Switch day-specific call sites to `daySession()`

**Files:**
- Modify: `index.html` — the functions below. Program-level uses (`renderSessionExpand`, `renderOhjelma`, week-tab `hasEx`, session picker list, Koonti "Kesken · name") stay on `SESS`.

**Interfaces:**
- Consumes: `daySession(o, d, st)` (Task 3).

- [ ] **Step 1: Replace the lookups** — each of these lines changes from `SESS[st]` to `daySession(o, d, st)` (use the function's own `o`/`d` parameters; in `renderTreeni`, `renderSession` and `toggleDone` they are `wOff`/`aDay`):

| Function | Before | After |
|---|---|---|
| `checkForPR(o, d, st, e)` | `const sess = SESS[st];` | `const sess = daySession(o, d, st);` |
| `syncSet(o, d, st, e, s)` | `const sess = SESS[st];` | `const sess = daySession(o, d, st);` |
| `prefillExercise(o, d, exId, btnEl)` | `const sess = SESS[st];` | `const sess = daySession(o, d, st);` |
| `applySuggestedWeight(o, d, exId)` | `const sess = SESS[st];` | `const sess = daySession(o, d, st);` |
| `loadPrevSession(o, d, requestId)` | `const st = getActiveSession(o, d), sess = SESS[st];` | `const st = getActiveSession(o, d), sess = daySession(o, d, st);` |
| `loadStuckWeightCache(o, d, requestId)` | same as above | same as above |
| `updateSetBox(o, d, e, s)` | `const sess = SESS[st];` | `const sess = daySession(o, d, st);` |
| `renderTreeni()` | `const sess = SESS[st];` (after `const st = getActiveSession(wOff, aDay);`) | `const sess = daySession(wOff, aDay, st);` |
| `renderSession(requestId)` | `const st = getActiveSession(wOff, aDay), sess = SESS[st];` | `const st = getActiveSession(wOff, aDay), sess = daySession(wOff, aDay, st);` |
| `toggleDone()` | `const sess = SESS[st];` | `const sess = daySession(wOff, aDay, st);` |

Find each with `grep -n "const sess = SESS\[st\]\|sess = SESS\[st\]" index.html` and confirm the enclosing function before editing. `reconcileSessionWithServer` needs no change: it receives `sess` from `renderSession`.

- [ ] **Step 2: Verify nothing else reads a day's list from SESS**

Run: `grep -n "SESS\[st\]\|SESS\[ist\]" index.html`
Expected remaining hits only: the session picker loop in `renderSession` (`Object.entries(SESS)`), the week tabs (`SESS[ist]`), Koonti (`SESS[st].name` / `hasEx`), `daySession` itself, and the program editor.

- [ ] **Step 3: Regression check (no catch-up → identical)** — with no session having `collectsCatchup` (column not yet applied → all false), `daySession` returns `SESS[st]` itself, so behaviour is unchanged. Syntax check as in Task 2; `node scripts/test-catchup.mjs` still passes.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(sali): päiväkohtainen liikelista daySession()-funktiosta"
```

---

### Task 5: Render the catch-up section and merged-row label

**Files:**
- Modify: `index.html` — `renderSession()` exercise loop (~line 3651) and CSS block (`.ex-block-sub` area)

**Interfaces:**
- Consumes: `ex.catchup` (`{ remaining, origins, targetDisplay, merged }`) on entries from `daySession`.

- [ ] **Step 1: CSS** — next to the existing `.ex-block-sub` rule add:

```css
.catchup-heading { margin: 22px 2px 10px; font-size: var(--fs-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--amber, var(--accent)); }
.catchup-tag { display: inline-block; margin-top: 4px; font-size: var(--fs-xs); color: var(--amber, var(--accent)); }
```

- [ ] **Step 2: Heading before the first appended catch-up exercise and the origin/merge labels** — in `renderSession`, at the top of `sess.ex.forEach((ex, ei) => {` insert:

```js
    if (ex.catchup && !ex.catchup.merged && !(ei > 0 && sess.ex[ei - 1].catchup && !sess.ex[ei - 1].catchup.merged)) {
      html += `<div class="catchup-heading">Viikon rästit</div>`;
    }
    const catchupTag = !ex.catchup ? ''
      : ex.catchup.merged
        ? `<div class="catchup-tag">+${ex.catchup.remaining} ${ex.catchup.remaining === 1 ? 'rästi' : 'rästiä'} ${escapeHtml(ex.catchup.origins.join(', '))}:sta</div>`
        : `<div class="catchup-tag">Rästi · ${escapeHtml(ex.catchup.origins.join(', '))}</div>`;
```

and in the header markup change

```js
          <div class="ex-block-sub">${escapeHtml(ex.t)}</div>
```
to
```js
          <div class="ex-block-sub">${escapeHtml(ex.t)}</div>
          ${catchupTag}
```

For appended rows the sub-line should show the missing count: since `ex.t` for them is the origin's target (e.g. `3×10`) and `ex.s` is the missing count, keep `ex.t` (reps hint) — the progress label already reads `0/N sarjaa`.

- [ ] **Step 3: Verify** — syntax check; unit test still passes. Visual check happens in Task 6.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(sali): Viikon rästit -osio ja rästimerkinnät"
```

---

### Task 6: Program editor switch

**Files:**
- Modify: `index.html` — `renderSessionExpand(s)` (~line 8663) and a new `toggleCollectsCatchup(id)` next to `toggleSessionWeekday`

**Interfaces:**
- Consumes: `programSessionsRaw` rows (have `collects_catchup` once the column exists), `sbWrite`, `loadProgram`, `renderOhjelma`.

- [ ] **Step 1: Switch markup** — in `renderSessionExpand`, after the weekday picker's closing `</div>` (before `<div class="sess-field-label" style="margin-top:14px">Liikkeet</div>`), insert:

```js
    <label class="sess-catchup-toggle" style="display:flex;align-items:center;gap:10px;margin-top:14px;font-size:var(--fs-sm);color:var(--text2);cursor:pointer;">
      <input type="checkbox" ${s.collects_catchup ? 'checked' : ''} onchange="toggleCollectsCatchup('${s.id}', this.checked)">
      Kerää viikon rästit
    </label>
```

- [ ] **Step 2: Save handler** — after `toggleSessionWeekday`:

```js
// "Kerää viikon rästit": this session's day view gets the week's undone sets (see daySession).
async function toggleCollectsCatchup(id, on) {
  const { error } = await sbWrite({ table: 'program_sessions', op: 'update', payload: { collects_catchup: on }, eq: { column: 'id', value: id } });
  if (error) { console.error('toggleCollectsCatchup failed:', error.message); return; }
  await loadProgram();
  renderOhjelma();
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ohjelma): Kerää viikon rästit -kytkin"
```

---

### Task 7: Browser verification (writes blocked), regression, version, PR

**Files:**
- Modify: `index.html` — version chip `v1.41.0` → `v1.42.0`
- Test scripts live in the session scratchpad (not committed).

- [ ] **Step 1: Real data, read-only** — Playwright against `http://127.0.0.1:8765/index.html` with all non-GET Supabase requests intercepted. Inject `collects_catchup: true` for `t5` by fulfilling the `program_sessions` GET with the real rows plus that flag. Open the gym page for week 41 (`wOff = 0`), set `aDay` to a day, `setActiveSession` is a WRITE → instead fulfil `day_session_overrides` GET with an extra row making Sunday `t5`. Expect on Sunday: section "Viikon rästit" containing `Yksikätinen soutulaite`, tag `Rästi · Treeni 2 — Vetävät`, `0/3 sarjaa`. Expect Monday (t1) unchanged.
- [ ] **Step 2: Logging a catch-up set** — fill kg/reps in the first catch-up row; assert the intercepted `workout_sets` upsert body has the Sunday date, `exercise_name: 'Yksikätinen soutulaite'`, `set_number: 1`, `session_type: 't5'` (captured from the blocked request, never sent).
- [ ] **Step 3: Merged row** — inject (GET fulfil) a week where Treeni 2's `Reverse Pec Deck` has 2 of 3 sets logged: t5's own `Reverse Pec Deck` row shows `0/4 sarjaa` and `+1 rästi Treeni 2 — Vetävät:sta`.
- [ ] **Step 4: Done warning** — with a catch-up row undone, call `toggleDone()` with a `dialog` handler that records the message and dismisses: the message lists the catch-up exercise.
- [ ] **Step 5: Program editor** — open Ohjelma, expand t5, tick the switch: intercepted PATCH to `program_sessions?id=eq.t5` with body `{"collects_catchup":true}`.
- [ ] **Step 6: Regression** — compare Treeni 1–4 day views (`#session-content` innerHTML) between unchanged `main` (export with `git show main:index.html` to a scratch dir, serve on 8766) and the branch, same intercepts: identical.
- [ ] **Step 7: Version + commit**

```bash
sed -i '' 's/v1\.41\.0/v1.42.0/' index.html
git add index.html && git commit -m "chore: v1.42.0"
```

- [ ] **Step 8: Hand off** — report results to the user; after approval: SQL to the dashboard + REST check + ledger insert, PR (`git push origin feature/catchup-sets`, `gh pr create`, `gh pr merge <n> --merge --delete-branch`), then the user switches "Kerää viikon rästit" on for Treeni 5.
