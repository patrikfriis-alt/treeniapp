# Sali Weight-Plateau Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when an exercise has hit its target reps at the same weight across its last 2
occurrences of the same programmed session (e.g. two Treeni 1's in a row, not conflated with
Treeni 4), and show an inline hint in Sali suggesting a weight bump — independent of the existing
"cleanly performed" auto-progression, which misses this case when reps decline across sets within
a session even though every set still met the assigned target.

**Architecture:** Pure front-end addition inside `index.html`'s Sali render path. No schema change.
A new client-side cache (`stuckCache`) is populated by a new query alongside the existing
`loadPrevSession` call. A new inline banner renders in the exercise block (gated on the same
`noSetsYet` condition the existing auto-prefill already uses) when that exercise is in the cache.
Tapping the banner's button reuses the existing prefilled/confirm/collapse machinery already
shipped in the 2026-09-15 redesign — no new set-state work.

**Tech Stack:** Vanilla JS/CSS inside the existing single-file app. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-sali-weight-plateau-hint-design.md`

## Global Constraints

- Comparison is scoped by `session_type`, not just exercise name — several exercises (e.g.
  "Smith-kalteva penkki") appear in more than one programmed session per week.
- "Stuck" = every set in BOTH of the exercise's last 2 occurrences of this `session_type` hit
  `reps >= target reps` (parsed from `target_display`), AND the weight was identical across every
  set in both occurrences.
- Target reps come from the exercise's CURRENT `target_display`, not whatever was programmed
  historically. Exercises whose `target_display` doesn't end in a bare rep count (e.g. "3×45s")
  are silently skipped — no hint for those.
- Suggested weight reuses the exact existing rounding rule: `Math.round((weight * 1.025) / 2.5) * 2.5`,
  with a minimum one 2.5kg step if that rounds down to no change.
- The hint only renders when the exercise has no sets logged yet today (`noSetsYet`) — same gate
  the existing auto-prefill uses. No persistent dismiss state, and no new DOM-removal wiring into
  `saveSet` either (that would add a coupling point not worth it for a soft suggestion): the
  banner disappears when its own button is tapped (explicit removal, see Task 2), or naturally
  stops rendering on the next full re-render of the day (switching days and back, or reloading)
  once `noSetsYet` is false. It does NOT reactively vanish the instant you type into a set on the
  same page load — this app's incremental per-set updates (`saveSet`/`updateSetBox`) never trigger
  a full `renderSession` re-render, so nothing removes it mid-page automatically. This matches the
  existing "↓ Käytä edell." button's own behavior, which similarly stays visible after you've
  started entering values (it's gated on session state, not on `noSetsYet`) — so a hint banner
  that's still visible while you're mid-edit is consistent with how this page already behaves, not
  a regression.
- No automated test framework exists in this repo — every task's verification step is a manual
  in-browser check. **Never test against real/current-date data.** Use a date far enough in the
  future to be guaranteed empty, and — this is the load-bearing part, per the lesson from the prior
  Sali redesign's testing incident — **explicitly delete the seeded rows and verify empty via a
  fresh REST query afterward.** A future date is NOT self-cleaning.

---

### Task 1: `stuckCache`, `loadStuckWeightCache`, `parseTargetReps`, `suggestBumpedWeight`

**Files:**
- Modify: `index.html:2134` (add `stuckCache` declaration next to `prevCache`)
- Modify: `index.html:2171` (insert new functions after `loadPrevSession`)
- Modify: `index.html:3428` (wire the new load call into `renderSession`)

**Interfaces:**
- Produces: `stuckCache` (object, `stuckCache[exerciseName] = { weight: number }` when stuck,
  absent otherwise), `loadStuckWeightCache(o, d, requestId)` (async, populates `stuckCache`),
  `parseTargetReps(targetDisplay)` (returns `number | null`), `suggestBumpedWeight(weight)`
  (returns `number`). Task 2 reads `stuckCache` and calls `suggestBumpedWeight` from the render
  loop and from `applySuggestedWeight`.
- Consumes: `getActiveSession`, `SESS`, `wStart`, `localIso`, `sb` (Supabase client),
  `treeniRequestId` — all existing, unchanged.

- [ ] **Step 1: Add the `stuckCache` declaration**

  At `index.html:2134`, right after the existing line:
  ```js
  let prevCache = {};
  ```
  add immediately below it:
  ```js
  // stuckCache[exerciseName] = { weight } — present only when stuck; absent otherwise.
  //   weight — the identical weight_kg used across both of the last 2 occurrences of this
  //            exercise within today's session_type.
  // Populated by loadStuckWeightCache(o, d, requestId).
  let stuckCache = {};
  ```

- [ ] **Step 2: Add `loadStuckWeightCache` and its two helpers after `loadPrevSession`**

  `loadPrevSession` currently ends at `index.html:2171` with a closing `}` followed by a blank line
  and then `async function reconcileSessionWithServer(...)`. Insert the following between them:

  ```js
  async function loadStuckWeightCache(o, d, requestId) {
    stuckCache = {};
    const st = getActiveSession(o, d), sess = SESS[st];
    if (!sess || !sess.ex || !sess.ex.length) return;

    const names = sess.ex.map(e => e.n);
    const mon = wStart(o), dt = new Date(mon.date);
    dt.setDate(mon.date.getDate() + d);
    const todayStr = localIso(dt);

    const { data, error } = await sb
      .from('workout_sets')
      .select('workout_date,exercise_name,set_number,weight_kg,reps')
      .in('exercise_name', names)
      .eq('session_type', st)
      .lt('workout_date', todayStr)
      .order('workout_date', { ascending: false })
      .order('set_number',   { ascending: true  })
      .limit(400);

    if (requestId !== treeniRequestId) return;
    if (error) { console.error('loadStuckWeightCache failed:', error.message); return; }
    if (!data) return;

    // Group by exercise, keep only the 2 most recent distinct dates per exercise.
    const byExercise = {};
    data.forEach(r => {
      if (!byExercise[r.exercise_name]) byExercise[r.exercise_name] = { dates: [], byDate: {} };
      const eb = byExercise[r.exercise_name];
      if (!eb.byDate[r.workout_date]) {
        if (eb.dates.length >= 2) return; // already have the 2 most recent dates
        eb.dates.push(r.workout_date);
        eb.byDate[r.workout_date] = [];
      }
      if (eb.dates.includes(r.workout_date)) eb.byDate[r.workout_date].push(r);
    });

    sess.ex.forEach(ex => {
      const targetReps = parseTargetReps(ex.t);
      if (targetReps === null) return; // time-based or unparseable target (e.g. "3×45s") — skip
      const eb = byExercise[ex.n];
      if (!eb || eb.dates.length < 2) return; // fewer than 2 prior occurrences this session_type

      // `eb.dates` holds date strings; map to their arrays of set-rows. Deliberately not
      // named `d` for the lambda param — `d` is already this function's day-of-week arg.
      const [setsA, setsB] = eb.dates.map(dateStr => eb.byDate[dateStr]);
      const hitTarget = rows => rows.length > 0 && rows.every(r => (r.reps || 0) >= targetReps);
      if (!hitTarget(setsA) || !hitTarget(setsB)) return;

      const w1 = setsA[0].weight_kg;
      if (w1 == null) return;
      const sameWeight = setsA.every(r => r.weight_kg === w1) && setsB.every(r => r.weight_kg === w1);
      if (!sameWeight) return;

      stuckCache[ex.n] = { weight: w1 };
    });
  }

  // "3×10" -> 10, "4×12" -> 12, "3×45s" -> null (not a rep-based target)
  function parseTargetReps(targetDisplay) {
    const m = /×\s*(\d+)\s*$/.exec(targetDisplay || '');
    return m ? parseInt(m[1], 10) : null;
  }

  function suggestBumpedWeight(weight) {
    let suggested = Math.round((weight * 1.025) / 2.5) * 2.5;
    if (suggested <= weight) suggested = weight + 2.5;
    return suggested;
  }
  ```

- [ ] **Step 3: Wire the call site into `renderSession`**

  At `index.html:3428`, the existing code reads:
  ```js
    // Fetch previous session data
    await loadPrevSession(wOff, aDay, requestId);
    if (requestId !== treeniRequestId) return;
    await reconcileSessionWithServer(wOff, aDay, st, sess, requestId);
    if (requestId !== treeniRequestId) return;
  ```
  Change it to also fetch the stuck-weight cache, run concurrently with `loadPrevSession` since
  neither depends on the other's result:
  ```js
    // Fetch previous session data
    await Promise.all([
      loadPrevSession(wOff, aDay, requestId),
      loadStuckWeightCache(wOff, aDay, requestId),
    ]);
    if (requestId !== treeniRequestId) return;
    await reconcileSessionWithServer(wOff, aDay, st, sess, requestId);
    if (requestId !== treeniRequestId) return;
  ```

- [ ] **Step 4: Manual verification of this task in isolation**

  There's no automated test framework in this repo. Verify by opening the browser console on the
  Sali page (any date), running `renderSession`'s trigger (open any day), and checking in DevTools
  that `stuckCache` is a defined object (even if empty for real current data) and that no console
  errors appear. Full behavioral verification (does it actually detect a stuck exercise and show
  the right weight) happens in Task 3, once the UI exists to observe it through — at this stage
  you're only confirming the fetch runs cleanly and doesn't throw.

- [ ] **Step 5: Commit**

  ```bash
  git add index.html
  git commit -m "feat(sali): add weight-plateau detection cache and helpers"
  ```

---

### Task 2: Hint banner UI + `applySuggestedWeight`

Line numbers below were accurate as of before Task 1's edit, which adds code above some of these
locations and shifts them down. Re-locate each insertion point by searching for the surrounding
code shown in each step (e.g. search for `.ex-set-table {` for the CSS step, `Prefill-nappi` for
the render-loop step, the end of `prefillExercise` for the new-function step) rather than trusting
the line numbers literally.

**Files:**
- Modify: `index.html:647` (CSS — insert `.ex-stuck-hint` rules after `.ex-set-table`)
- Modify: `index.html:3495-3509` (render loop — insert banner markup in the exercise block)
- Modify: `index.html:2098` (insert `applySuggestedWeight` after `prefillExercise`)

**Interfaces:**
- Consumes: `stuckCache`, `suggestBumpedWeight` (Task 1), `noSetsYet` (already computed in scope
  at `index.html:3447` inside the same `sess.ex.forEach` loop this task's markup lives in),
  `eKey`, `saveLD`, `updateSetBox`, `LD`, `SESS`, `getActiveSession` — all existing, unchanged.
- Produces: `applySuggestedWeight(o, d, exId)` (global function, the banner's button handler).

- [ ] **Step 1: Add the CSS**

  At `index.html:647`, right after the closing `}` of `.ex-set-table` and before
  `.set-table-hdr {`, insert:
  ```css
  .ex-stuck-hint {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 12px; margin-bottom: 8px;
    background: var(--green-bg); border: 1px solid rgba(47,255,126,0.25);
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm); color: var(--text2);
  }
  .ex-stuck-hint button {
    flex: none; font-size: var(--fs-xs); font-weight: 700; color: #032b12;
    background: var(--green); border: none; border-radius: 6px; padding: 6px 10px;
  }
  ```

- [ ] **Step 2: Insert the banner markup in the render loop**

  At `index.html:3490-3509`, the existing code reads:
  ```js
      // Prefill-nappi
      const prefillBtn = prev && started && !done
        ? `<button onclick="prefillExercise(${wOff},${aDay},${exId},this)" class="prefill-btn">↓ Käytä edell.</button>`
        : '';

      html += `<div class="ex-block">
        <div class="ex-block-header">
          <div>
            <div class="ex-block-title" data-ex="${ex.n.replace(/"/g,'&quot;')}" onclick="openExerciseModal(this.dataset.ex)" style="cursor:pointer">${escapeHtml(ex.n)}<span class="ex-check" id="ex-check-${wOff}-${aDay}-${exId}"${exDone ? '' : ' style="display:none"'}>✓</span>${isPR ? '<span class="pr-badge">PR</span>' : ''}</div>
            <div class="ex-block-sub">${escapeHtml(ex.t)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <div class="ex-block-progress">
              <div class="ex-block-prog-label" id="ex-prog-label-${wOff}-${aDay}-${exId}">${doneCount}/${ex.s} sarjaa</div>
              <div class="ex-block-prog-bar"><div class="ex-block-prog-fill${exDone ? ' done' : ''}" id="ex-prog-fill-${wOff}-${aDay}-${exId}" style="width:${progPct}%"></div></div>
            </div>
            ${prefillBtn}
          </div>
        </div>
        <div class="ex-set-table">
          <div class="set-table-hdr">
            <span>S</span><span>KG</span><span>TOISTOT</span><span>EDELL.</span>
          </div>`;
  ```
  Change it to compute the stuck-hint markup and insert it between the closing `</div>` of
  `.ex-block-header` and the opening `<div class="ex-set-table">`:
  ```js
      // Prefill-nappi
      const prefillBtn = prev && started && !done
        ? `<button onclick="prefillExercise(${wOff},${aDay},${exId},this)" class="prefill-btn">↓ Käytä edell.</button>`
        : '';

      // Paino jumissa -vihje: sama paino + kohdetoistot täynnä 2 kertaa putkeen tässä session_typessa.
      const stuck = stuckCache[ex.n];
      const stuckHint = stuck && started && !done && noSetsYet
        ? `<div class="ex-stuck-hint" id="ex-stuck-${wOff}-${aDay}-${exId}">
             <span>💪 Sama paino 2 kertaa putkeen, kaikki toistot täynnä</span>
             <button onclick="applySuggestedWeight(${wOff},${aDay},${exId})">Kokeile ${suggestBumpedWeight(stuck.weight)} kg</button>
           </div>`
        : '';

      html += `<div class="ex-block">
        <div class="ex-block-header">
          <div>
            <div class="ex-block-title" data-ex="${ex.n.replace(/"/g,'&quot;')}" onclick="openExerciseModal(this.dataset.ex)" style="cursor:pointer">${escapeHtml(ex.n)}<span class="ex-check" id="ex-check-${wOff}-${aDay}-${exId}"${exDone ? '' : ' style="display:none"'}>✓</span>${isPR ? '<span class="pr-badge">PR</span>' : ''}</div>
            <div class="ex-block-sub">${escapeHtml(ex.t)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <div class="ex-block-progress">
              <div class="ex-block-prog-label" id="ex-prog-label-${wOff}-${aDay}-${exId}">${doneCount}/${ex.s} sarjaa</div>
              <div class="ex-block-prog-bar"><div class="ex-block-prog-fill${exDone ? ' done' : ''}" id="ex-prog-fill-${wOff}-${aDay}-${exId}" style="width:${progPct}%"></div></div>
            </div>
            ${prefillBtn}
          </div>
        </div>
        ${stuckHint}
        <div class="ex-set-table">
          <div class="set-table-hdr">
            <span>S</span><span>KG</span><span>TOISTOT</span><span>EDELL.</span>
          </div>`;
  ```
  Note `noSetsYet` is already computed earlier in this same loop iteration at `index.html:3447` —
  reuse it directly, don't recompute it.

- [ ] **Step 3: Add `applySuggestedWeight` after `prefillExercise`**

  `prefillExercise` currently ends at `index.html:2098` with a closing `}`, immediately followed by
  a comment block and then `function confirmPrefilledSet(...)`. Insert the new function right after
  `prefillExercise`'s closing brace, before that comment block:

  ```js
  // Applies the weight-plateau hint's suggested bumped weight to every set of an exercise,
  // targeting the exercise's current target rep count rather than copying historical per-set
  // reps (the point is to try the assigned target at a higher weight). Reuses the same
  // prefilled-set mechanism as prefillExercise/the auto-progression suggestion — tap-to-confirm,
  // the promotion animation, and collapse-on-confirm all already work on rows this touches.
  function applySuggestedWeight(o, d, exId) {
    const st = getActiveSession(o, d);
    const sess = SESS[st];
    const ex = sess && sess.ex.find(x => x._id === exId);
    if (!ex) return;
    const stuck = stuckCache[ex.n];
    if (!stuck) return;
    const targetReps = parseTargetReps(ex.t);
    if (targetReps === null) return;
    const bumpedKg = suggestBumpedWeight(stuck.weight);

    const k = eKey(o, d, st, exId);
    if (!LD[k]) LD[k] = { sets: [] };

    for (let s = 0; s < ex.s; s++) {
      if (!LD[k].sets[s]) LD[k].sets[s] = {};
      LD[k].sets[s].kg = String(bumpedKg);
      LD[k].sets[s].reps = String(targetReps);
      LD[k].sets[s].prefilled = true;

      const box = document.getElementById(`set-${o}-${d}-${exId}-${s}`);
      if (box) {
        const inputs = box.querySelectorAll('input[type="text"]');
        if (inputs[0]) inputs[0].value = LD[k].sets[s].kg;
        if (inputs[1]) inputs[1].value = LD[k].sets[s].reps;
      }

      updateSetBox(o, d, exId, s);
    }

    saveLD();

    const hintEl = document.getElementById(`ex-stuck-${o}-${d}-${exId}`);
    if (hintEl) hintEl.remove();
  }
  ```

- [ ] **Step 4: Manual verification of this task in isolation**

  No automated test framework exists in this repo. Because `stuckCache` will be empty against real
  current data (no fabricated plateau exists yet), this step only confirms the code path doesn't
  throw: open Sali on today's real date in the browser, confirm no console errors, confirm the
  page renders exactly as before (no visible `.ex-stuck-hint` anywhere, since nothing is
  legitimately stuck yet). Full behavioral verification — seeding a real plateau and confirming the
  banner appears and works — is Task 3.

- [ ] **Step 5: Commit**

  ```bash
  git add index.html
  git commit -m "feat(sali): show weight-plateau hint banner and wire apply-suggestion action"
  ```

---

### Task 3: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Seed a fabricated plateau on an isolated future date**

  Use Claude-in-Chrome tooling. Pick a date far in the future (e.g. 2026-11-02, matching Treeni 1's
  weekday) and the ONE BEFORE it that also matches Treeni 1's weekday (i.e. 7 days earlier,
  2026-10-26) — never today's or any recent real date, per this repo's established testing-safety
  rule (see Global Constraints; a prior Sali redesign left real test data live in production by
  skipping the cleanup step — do not repeat that).

  For one exercise in Treeni 1 (e.g. "Rintapunnerruslaite", target "3×8"), log identical data on
  BOTH of those two dates through the app's own UI: all 3 sets at the same weight (e.g. 60kg) with
  reps ≥ 8 (e.g. 8/8/8). Use the app's day/week navigation to reach each date and its Sali page,
  start the session, and enter the values through the normal set inputs — don't write to the
  database directly.

- [ ] **Step 2: Verify the hint appears with the correct suggested weight**

  Navigate to a THIRD Treeni 1 occurrence, one week after the second seeded date (2026-11-09).
  Confirm: the `.ex-stuck-hint` banner appears on "Rintapunnerruslaite" (and only on exercises that
  are actually stuck — check a different exercise in the same session that wasn't seeded and
  confirm no banner there), with text "Kokeile 62,5 kg" (60 × 1.025 rounds to 61.5, rounds to
  nearest 2.5 → 62.5).

- [ ] **Step 3: Verify tapping the button applies the suggestion correctly**

  Tap the banner's button. Confirm: all 3 sets are now prefilled (hollow dashed-ring set numbers,
  from the existing redesign) with kg=62.5 and reps=8 (the target rep count, not copied from
  history), the banner disappears, and tapping a set's ring to confirm it plays the existing
  promotion animation and collapses correctly — i.e. this fully interoperates with the shipped
  redesign's UI with no new bugs.

- [ ] **Step 4: Verify the hint does NOT appear when it shouldn't**

  Check a few negative cases using the same seeded/future-date approach as needed: an exercise
  where reps dropped below target on one of the two prior occurrences (no hint); an exercise where
  the weight differed between the two prior occurrences (no hint); a time-based exercise like
  "Lankku" even if you fabricate 2 identical-looking prior entries for it (no hint, since its
  target "3×45s" doesn't parse to a rep count); an exercise that appears in both Treeni 1 and
  Treeni 4 — confirm being stuck in Treeni 4 does NOT trigger a hint when opening Treeni 1 for that
  same exercise, and vice versa (session_type scoping works).

  Also confirm the expected (non-bug) persistence behavior from Global Constraints: on a session
  with a visible hint, type a value directly into one of that exercise's set inputs WITHOUT tapping
  the hint button. Confirm the banner stays visible (this is correct — nothing removes it until
  either its own button is tapped or the page does a full re-render, e.g. switching days and back).
  This is expected, not a defect to report.

- [ ] **Step 5: Clean up ALL seeded test data**

  This is the step the prior Sali redesign's testing got wrong — do not skip or abbreviate it.
  Delete every `workout_sets` row created during this verification (all the fabricated dates used
  across Steps 1-4) via a REST DELETE call, then re-query each of those dates via REST to confirm
  zero rows remain. Do not rely on "it's a future date so it's fine" — verify empty explicitly.
  Also confirm, via REST, that today's real date and any other real historical dates are
  unaffected (row counts/content unchanged from before this task started).

  **If the DELETE call is blocked** by a sandbox/permission restriction (this happened during the
  prior Sali redesign's verification): do not attempt to work around it. Instead, report back to
  the controller exactly which rows need deleting (dates, exercise names, row ids if visible via a
  REST GET) so the controller can ask the user for explicit confirmation and run the deletion
  itself, the same way it was handled last time.
