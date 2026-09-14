# Sali Set-Logging Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the distinction between a *suggested* set (prefilled from last time / +2.5% progression)
and an *actually performed* set unmistakable and delightful on Sali's per-exercise set table, and make
the set list fast to scan mid-workout by collapsing already-confirmed sets and highlighting the one set
that needs attention next.

**Architecture:** Pure front-end change inside `index.html`'s Sali render path. No schema change, no
new Supabase columns, no new sync behavior — `LD`/`workout_sets`/`prefilled` semantics are untouched.
Each set row keeps rendering both an "expanded" (editable, 4-column) and a "collapsed" (compact,
2-column) markup block; a CSS class on the row (`is-collapsed`) picks which one shows. A confirmed
(same/better/worse) set collapses by default; tapping it re-expands it for editing, so nothing about
today's editing capability regresses. The single next undone-or-unconfirmed set per exercise gets an
`is-next` glow, recomputed after every set-level change so the glow always tracks the true next set.

**Tech Stack:** Vanilla JS/CSS inside the existing single-file app. No new dependencies.

**Spec:** The approved design synthesis lives in the mockup artifact
`https://claude.ai/code/artifact/ad4afa31-4eac-4571-852b-45151ab895f9` ("Sali Set-Logging Directions") —
specifically **Suunta A "Vahvista varmuudella"** (hollow-ring prefilled indicator, inline +2,5 % reasoning,
promotion animation on confirm) combined with **Suunta B "Nopea skannaus"** (next-actionable-set glow,
collapsing confirmed rows to a compact summary). The user approved combining these two directions in
chat; this plan is that synthesis translated into the real codebase's constraints (notably: editing an
already-logged set must stay possible, unlike the static mockup).

## Global Constraints

- Do not regress any existing capability: editing a past/confirmed set, the "↓ Käytä edell." button,
  PR badges, 1RM display, per-exercise progress count/bar, or the "Seuraavaksi" next-exercise bar.
- `prefilled` sets never count toward `doneCount`/progress — unchanged (existing logic in
  `updateSetBox`/`renderSession`, not touched by this plan).
- Follow the existing dark iOS-native token system: `--accent`, `--green`, `--amber`, `--red`, `--text`,
  `--text2`, `--text3`, `--border`, `--surface`/`--surface2`/`--surface3`. No new colors.
- Respect `prefers-reduced-motion`: the confirm-promotion animation must have a no-motion fallback path
  (instant collapse, no transform/scale).
- No automated test framework exists in this repo — every task's verification step is a manual
  in-browser check. **Never test against real/current-date training data** — use a date far enough in
  the future that it's guaranteed empty (e.g. 2026-10-05), per this project's established testing safety
  rule (a near-miss deletion of real logged sets happened earlier this project from testing against a
  real date — see project memory `project_prefill_confirm_fix_2026-09-10.md`).
- Interfaces this plan produces, for later tasks in this same plan:
  - `refreshNextGlow(o, d, exId, exObj, ed)` — recomputes which one set row (if any) carries `is-next`
    for one exercise, and applies it to the DOM. Defined in Task 2, called from the render loop (Task 2)
    and from `updateSetBox` (Task 3).
  - Set-row DOM ids added in Task 2: `set-summary-${o}-${d}-${e}-${s}` (collapsed-row summary text) and
    `set-progbadge-${o}-${d}-${e}-${s}` (the "+2,5 %" badge). Task 3 updates both by id.
  - `expandSetRow(o, d, e, s)` — global function, defined in Task 2, click handler that removes
    `is-collapsed` from one row.

---

### Task 1: CSS — ring, badge, collapse layout, glow, promotion animation

**Files:**
- Modify: `index.html:664-720` (existing `.set-table-row` and children rules)

**Interfaces:**
- Produces: CSS classes `is-collapsed`, `is-next`, `is-confirming` on `.set-table-row`; child wrapper
  classes `.set-expanded` / `.set-collapsed`; `.badge-progress`; `.set-collapsed .delta` (`.up`/`.down`/`.flat`).
  Task 2's markup and Task 3/4's JS rely on these exact class names.
- Consumes: existing tokens only (`--accent`, `--green`, `--amber`, `--red`, `--text`, `--text2`,
  `--text3`, `--border`, `--surface`, `--surface2`, `--surface3`, `--fs-*`).

- [ ] **Step 1: Replace the `.set-table-row` block with the restructured version**

  Find this exact block at `index.html:664-685` (`.set-table-row { display: grid; ... }` through
  `.set-check { color: var(--green); ... }`) and replace it with:

  ```css
  .set-table-row {
    border-bottom: 1px solid var(--border);
    transition: background .2s;
    position: relative;
  }
  .set-table-row:last-child { border-bottom: none; }
  .set-table-row.s-undone    { background: rgba(255,62,62,0.04); }
  .set-table-row.s-prefilled { background: transparent; }
  .set-table-row.s-worse     { background: rgba(255,187,0,0.06); }
  .set-table-row.s-same      { background: rgba(0,242,255,0.06); border-left: 2px solid var(--accent); }
  .set-table-row.s-better    { background: rgba(47,255,126,0.04); border-left: 2px solid var(--green); }

  .set-table-row.is-next {
    box-shadow: inset 0 0 0 1px var(--accent);
    background: rgba(0,242,255,0.07);
    border-radius: 10px;
  }

  .set-expanded {
    display: grid;
    grid-template-columns: 34px 1fr 1fr 60px;
    padding: 10px 14px;
    align-items: center;
  }
  .set-table-row.is-collapsed .set-expanded { display: none; }

  .set-collapsed {
    display: none;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    cursor: pointer;
  }
  .set-table-row.is-collapsed .set-collapsed { display: flex; }
  .set-collapsed-summary {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text2);
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .set-collapsed .delta {
    font-size: var(--fs-2xs);
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 5px;
    white-space: nowrap;
  }
  .set-collapsed .delta.up   { background: rgba(47,255,126,0.14);  color: var(--green); }
  .set-collapsed .delta.down { background: rgba(255,187,0,0.14);  color: var(--amber); }
  .set-collapsed .delta.flat { background: rgba(0,242,255,0.14);  color: var(--accent); }

  .set-tnum { font-size:var(--fs-sm); font-weight:700; white-space:nowrap; }
  .set-table-row.s-undone    .set-tnum { color: var(--red); }
  .set-table-row.s-worse     .set-tnum { color: var(--amber); }
  .set-table-row.s-same      .set-tnum { color: var(--accent); }
  .set-table-row.s-better    .set-tnum { color: var(--green); }
  .set-check { color: var(--green); font-size: var(--fs-xs); margin-left: 2px; }

  /* Prefilled suggestion = hollow dashed ring, not a filled/colored number */
  .set-table-row.s-prefilled .set-tnum {
    width: 22px; height: 22px; border-radius: 50%;
    border: 1.5px dashed var(--text3);
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--text3);
    transition: all .25s cubic-bezier(.34,1.4,.4,1);
  }
  .set-table-row.is-confirming .set-expanded .set-tnum {
    border-style: solid; border-color: var(--green); background: var(--green);
    color: #032b12; transform: scale(1.15);
  }
  @media (prefers-reduced-motion: reduce) {
    .set-table-row.s-prefilled .set-tnum,
    .set-table-row.is-confirming .set-expanded .set-tnum { transition: none; transform: none; }
  }

  .badge-progress {
    display: inline-flex; align-items: center;
    font-size: var(--fs-2xs); font-weight: 700;
    color: #032b12; background: var(--green);
    border-radius: 5px; padding: 1px 5px; margin-left: 4px;
    white-space: nowrap;
  }
  ```

  This removes the old `border-left: 2px dashed var(--text3)` prefilled treatment (replaced by the ring)
  and moves `padding`/`grid-template-columns` off `.set-table-row` itself onto the new `.set-expanded`
  child, since the row now toggles between two different child layouts instead of always being one grid.

- [ ] **Step 2: Verify `.set-tinput`, `.set-tprev`, `.set-1rm` rules still apply unchanged**

  These rules (originally `index.html:687-720`, unmoved by Step 1) target `.set-tinput`, `.set-tprev`,
  `.set-1rm` — all of which now live inside `.set-expanded` in Task 2's markup, so no selector changes
  are needed here. Confirm by reading the file after Step 1's edit that these rules are still present
  immediately after the block you just replaced.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "style(sali): restructure set-row CSS for collapse/glow/ring redesign"
  ```

---

### Task 2: Render loop — dual markup, next-glow, collapse-on-load, expand-on-tap

**Files:**
- Modify: `index.html:3298-3409` (the `sess.ex.forEach` block inside `renderSession`)

**Interfaces:**
- Consumes: `setStatus(sd, prev)` (existing, `index.html:2223`), `getPrevSet(exName, setIdx)` (existing,
  `index.html:2213`), CSS classes from Task 1.
- Produces: `refreshNextGlow(o, d, exId, exObj, ed)` (new global function) and `expandSetRow(o, d, e, s)`
  (new global function) — Task 3 calls `refreshNextGlow` from `updateSetBox`.

- [ ] **Step 1: Add `refreshNextGlow` and `expandSetRow` near `setStatus`**

  Insert immediately after the `setStatus` function (after `index.html:2241`, i.e. right before the
  `calcSleepScore` function at `index.html:2243`):

  ```js
  // The single set a lifter should do next for one exercise: the first set that's
  // either untouched or only a suggestion, in order. Never a confirmed set — those
  // collapse instead. Returns -1 once every set is confirmed.
  function computeNextSetIndex(ed, exObj) {
    for (let s = 0; s < exObj.s; s++) {
      const sd = (ed.sets && ed.sets[s]) || {};
      const prevSet = getPrevSet(exObj.n, s);
      const status = setStatus(sd, prevSet);
      if (status === 'undone' || status === 'prefilled') return s;
    }
    return -1;
  }

  function refreshNextGlow(o, d, exId, exObj, ed) {
    const nextIdx = computeNextSetIndex(ed, exObj);
    for (let s = 0; s < exObj.s; s++) {
      const row = document.getElementById(`set-${o}-${d}-${exId}-${s}`);
      if (row) row.classList.toggle('is-next', s === nextIdx);
    }
  }

  // Confirmed sets render collapsed by default; tapping one re-expands it for editing.
  function expandSetRow(o, d, e, s) {
    const box = document.getElementById(`set-${o}-${d}-${e}-${s}`);
    if (box) box.classList.remove('is-collapsed');
  }
  ```

- [ ] **Step 2: Replace the per-set render loop**

  Find the loop at `index.html:3375-3398` (`for (let s = 0; s < ex.s; s++) { ... html += ...set-table-row... }`)
  and replace its body with:

  ```js
    const nextIdx = computeNextSetIndex(ed, ex);
    for (let s = 0; s < ex.s; s++) {
      const sd = (ed.sets && ed.sets[s]) || {};
      const prevSet = getPrevSet(ex.n, s);
      const status  = setStatus(sd, prevSet);
      const prevStr = prevSet ? `${prevSet.weight_kg ?? '?'}×${prevSet.reps ?? '?'}` : '—';
      const statusIcon = { worse: '▼ ', same: '● ', better: '▲ ', prefilled: '↓ ' }[status] || '';
      const checkVisible = status !== 'undone' && status !== 'prefilled';

      const orm = status !== 'prefilled' ? calc1RM(parseFloat(sd.kg), parseInt(sd.reps)) : null;
      const confirmTap = status === 'prefilled' ? ` onclick="confirmPrefilledSet(${wOff},${aDay},${exId},${s})" style="cursor:pointer"` : '';
      const isCollapsed = status === 'same' || status === 'better' || status === 'worse';
      const isNext = s === nextIdx;
      const showProgBadge = status === 'prefilled' && prevSet && prevSet.weight_kg != null && parseFloat(sd.kg) > prevSet.weight_kg;

      const deltaCls  = { worse: 'down', same: 'flat', better: 'up' }[status] || 'flat';
      const deltaIcon = { worse: '▼', same: '●', better: '▲' }[status] || '';
      const summaryText = `${sd.kg || '?'}×${sd.reps || '?'} kg<span class="delta ${deltaCls}" id="set-delta-${wOff}-${aDay}-${exId}-${s}">${deltaIcon} ${prevStr}</span>`;

      html += `<div class="set-table-row s-${status}${isCollapsed ? ' is-collapsed' : ''}${isNext ? ' is-next' : ''}" id="set-${wOff}-${aDay}-${exId}-${s}">
        <div class="set-expanded">
          <span class="set-tnum"${confirmTap}>${s + 1}<span class="set-check" id="set-check-${wOff}-${aDay}-${exId}-${s}"${checkVisible ? '' : ' style="display:none"'}>✓</span></span>
          <input class="set-tinput" type="text" inputmode="decimal" placeholder="kg" autocomplete="off" name="set-kg-${wOff}-${aDay}-${exId}-${s}"
            value="${sd.kg || ''}" ${locked ? 'disabled' : ''}
            onchange="saveSet(${wOff},${aDay},${exId},${s},'kg',this.value.replace(',','.'))">
          <input class="set-tinput" type="text" inputmode="numeric" placeholder="tr" autocomplete="off" name="set-reps-${wOff}-${aDay}-${exId}-${s}"
            value="${sd.reps || ''}" ${locked ? 'disabled' : ''}
            onchange="saveSet(${wOff},${aDay},${exId},${s},'reps',this.value)">
          <span class="set-tprev">
            <span id="set-prevtext-${wOff}-${aDay}-${exId}-${s}">${statusIcon}${prevStr}<span class="badge-progress" id="set-progbadge-${wOff}-${aDay}-${exId}-${s}"${showProgBadge ? '' : ' style="display:none"'}>+2,5%</span></span>
            <span class="set-1rm${orm ? ' visible' : ''}" id="set-1rm-${wOff}-${aDay}-${exId}-${s}">${orm ? `1RM ~${orm}kg` : ''}</span>
          </span>
        </div>
        <div class="set-collapsed" onclick="expandSetRow(${wOff},${aDay},${exId},${s})">
          <span class="set-tnum">${s + 1}<span class="set-check">✓</span></span>
          <span class="set-collapsed-summary" id="set-summary-${wOff}-${aDay}-${exId}-${s}">${summaryText}</span>
        </div>
      </div>`;
    }
  ```

  Note the `nextIdx` computed once before the loop (via the same `computeNextSetIndex` added in Step 1)
  rather than inside it — the loop only reads it, it doesn't need to be recomputed per iteration.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "feat(sali): render collapsed/expanded set rows with next-set glow and progression badge"
  ```

---

### Task 3: `updateSetBox` — keep collapse/glow/badge in sync with live edits

**Files:**
- Modify: `index.html:2253-2303` (`updateSetBox`)

**Interfaces:**
- Consumes: `refreshNextGlow` and `computeNextSetIndex` (Task 2).
- Produces: nothing new — this task makes the existing `updateSetBox` (already called by `saveSet`,
  `confirmPrefilledSet`, `prefillExercise`, `reconcileSessionWithServer`) correctly maintain the new
  per-row state after any single-set change, without needing a full `renderSession` re-render.

- [ ] **Step 1: Replace `updateSetBox`'s body**

  Replace the whole function at `index.html:2253-2303` with:

  ```js
  function updateSetBox(o, d, e, s) {
    const box = document.getElementById(`set-${o}-${d}-${e}-${s}`);
    if (!box) return;
    const st   = getActiveSession(o, d);
    const ed   = getED(o, d, st, e);
    const sd   = (ed.sets && ed.sets[s]) || {};
    const sess = SESS[st];
    const exObj = sess && sess.ex.find(x => x._id === e);
    const exName = exObj ? exObj.n : null;
    const prev = exName ? getPrevSet(exName, s) : null;
    const status = setStatus(sd, prev);

    // Manual typing (saveSet) must never auto-collapse a row out from under the person
    // editing it — only the confirm-tap promotion flow explicitly adds is-collapsed
    // (in confirmPrefilledSet) right before calling this function. So: preserve whatever
    // collapse state the row already had, as long as the new status still allows it.
    const wasCollapsed = box.classList.contains('is-collapsed');
    const stillCollapsible = status === 'same' || status === 'better' || status === 'worse';
    box.className = `set-table-row s-${status}`;
    if (wasCollapsed && stillCollapsible) box.classList.add('is-collapsed');

    const checkEl = document.getElementById(`set-check-${o}-${d}-${e}-${s}`);
    if (checkEl) checkEl.style.display = (status !== 'undone' && status !== 'prefilled') ? '' : 'none';

    const prevTextEl = document.getElementById(`set-prevtext-${o}-${d}-${e}-${s}`);
    const prevStr = prev ? `${prev.weight_kg ?? '?'}×${prev.reps ?? '?'}` : '—';
    if (prevTextEl) {
      // The "+2,5%" badge lives inside this span (see Task 2's markup) — rebuilt inline
      // here rather than patched separately, since prevTextEl.innerHTML fully replaces it
      // either way.
      const statusIcon = { worse: '▼ ', same: '● ', better: '▲ ', prefilled: '↓ ' }[status] || '';
      const showBadge = status === 'prefilled' && prev && prev.weight_kg != null && parseFloat(sd.kg) > prev.weight_kg;
      prevTextEl.innerHTML = `${statusIcon}${prevStr}<span class="badge-progress" id="set-progbadge-${o}-${d}-${e}-${s}"${showBadge ? '' : ' style="display:none"'}>+2,5%</span>`;
    }

    const ormEl = document.getElementById(`set-1rm-${o}-${d}-${e}-${s}`);
    if (ormEl) {
      const orm = status !== 'prefilled' ? calc1RM(parseFloat(sd.kg), parseInt(sd.reps)) : null;
      if (orm) {
        ormEl.textContent = `1RM ~${orm}kg`;
        ormEl.classList.add('visible');
      } else {
        ormEl.classList.remove('visible');
      }
    }

    const summaryEl = document.getElementById(`set-summary-${o}-${d}-${e}-${s}`);
    if (summaryEl) {
      const deltaCls  = { worse: 'down', same: 'flat', better: 'up' }[status] || 'flat';
      const deltaIcon = { worse: '▼', same: '●', better: '▲' }[status] || '';
      summaryEl.innerHTML = `${sd.kg || '?'}×${sd.reps || '?'} kg<span class="delta ${deltaCls}">${deltaIcon} ${prevStr}</span>`;
    }

    if (exObj) refreshNextGlow(o, d, e, exObj, ed);

    const exTarget = exObj;
    if (exTarget) {
      const doneCount = (ed.sets || []).filter(row => {
        const rd = row || {};
        if (rd.prefilled) return false;
        return numOrNull(parseFloat(rd.kg)) !== null || numOrNull(parseInt(rd.reps)) !== null;
      }).length;
      const progPct = exTarget.s > 0 ? Math.round(doneCount / exTarget.s * 100) : 0;
      const exDone  = exTarget.s > 0 && doneCount === exTarget.s;
      const labelEl   = document.getElementById(`ex-prog-label-${o}-${d}-${e}`);
      const fillEl    = document.getElementById(`ex-prog-fill-${o}-${d}-${e}`);
      const exCheckEl = document.getElementById(`ex-check-${o}-${d}-${e}`);
      if (labelEl) labelEl.textContent = `${doneCount}/${exTarget.s} sarjaa`;
      if (fillEl)  { fillEl.style.width = `${progPct}%`; fillEl.classList.toggle('done', exDone); }
      if (exCheckEl) exCheckEl.style.display = exDone ? '' : 'none';
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add index.html
  git commit -m "fix(sali): keep collapse state, next-glow, and progression badge in sync after set edits"
  ```

---

### Task 4: `confirmPrefilledSet` — promotion animation

**Files:**
- Modify: `index.html:2037-2050` (`confirmPrefilledSet`)

**Interfaces:**
- Consumes: `updateSetBox` (Task 3), CSS `is-confirming`/`is-collapsed` (Task 1).

- [ ] **Step 1: Replace `confirmPrefilledSet`**

  Replace the function at `index.html:2040-2050` with:

  ```js
  function confirmPrefilledSet(o, d, e, s) {
    const st = getActiveSession(o, d);
    const k = eKey(o, d, st, e);
    const sd = LD[k] && LD[k].sets && LD[k].sets[s];
    if (!sd || !sd.prefilled) return;
    delete sd.prefilled;
    saveLD();

    const box = document.getElementById(`set-${o}-${d}-${e}-${s}`);
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (box && !reduceMotion) {
      box.classList.add('is-confirming');
      setTimeout(() => {
        box.classList.remove('is-confirming');
        box.classList.add('is-collapsed');
        updateSetBox(o, d, e, s);
      }, 380);
    } else {
      if (box) box.classList.add('is-collapsed');
      updateSetBox(o, d, e, s);
    }
    checkForPR(o, d, st, e);
    scheduleSyncSet(o, d, st, e, s);
  }
  ```

  This keeps the existing PR-check and sync-scheduling calls unconditional (they don't depend on the
  animation), and only defers the visual collapse+`updateSetBox` refresh by 380ms so the ring-fill
  animation (Task 1's `.is-confirming .set-tnum` rule) is visible before the row collapses into its
  compact summary.

- [ ] **Step 2: Commit**

  ```bash
  git add index.html
  git commit -m "feat(sali): animate prefilled-set confirmation before collapsing the row"
  ```

---

### Task 5: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Open Sali on an isolated future date**

  Use Claude-in-Chrome tooling to navigate to the app, go to Sali, and pick a date far in the future
  (e.g. 2026-10-05, a Sunday matching Treeni 1's `default_weekdays`) — never today's or a recent real
  date, per this repo's established testing-safety rule (see Global Constraints).

- [ ] **Step 2: Verify undone/prefilled states render correctly**

  Start the session (so auto-suggestion prefill runs). Confirm:
  - The first exercise's sets show as suggested: hollow dashed-ring set numbers, not solid.
  - Exactly one row across the whole exercise list carries the cyan `is-next` glow, and it's the
    first set of the first exercise.
  - If the suggested weight is higher than last time's (progression applied), a small green
    "+2,5%" badge appears next to the EDELL. text; if the exercise has no prior data, no crash occurs
    and rows render as plain `undone` (red-tinted, ring-free).

- [ ] **Step 3: Verify tap-to-confirm promotion animation**

  Tap a prefilled set's ring number. Confirm: the ring briefly fills solid green and scales up
  (~380ms), then the row collapses into a compact one-line summary (`kg×reps` + a colored delta badge
  vs. last time), and the `is-next` glow moves to the next undone/prefilled set in that exercise.

- [ ] **Step 4: Verify manual entry does not auto-collapse**

  Type a kg/reps value directly into an `undone` row's inputs (not via prefill/confirm-tap). Confirm
  the row updates its status color/border as before but stays expanded (inputs still visible, not
  collapsed) — this is the "don't regress editing" / "don't surprise-collapse while typing" check.

- [ ] **Step 5: Verify expand-on-tap for already-confirmed rows**

  Tap a collapsed (same/better/worse) row's compact summary. Confirm it expands back into the full
  editable kg/reps inputs with the correct existing values, and that editing them (onchange) still
  updates the row correctly (status, 1RM badge, progress count) without re-collapsing unexpectedly.

- [ ] **Step 6: Verify unaffected existing capabilities**

  On the same test date: confirm the "↓ Käytä edell." button still prefills sets (dashed rings, no
  progress-count change until confirmed); confirm the PR badge still appears when a same-or-later
  exercise's max weight beats history; confirm the per-exercise "X/Y sarjaa" progress bar and the
  "Seuraavaksi" next-exercise bar are unchanged.

- [ ] **Step 7: Verify reduced-motion fallback**

  Using Chrome DevTools' rendering emulation (or the OS-level reduced-motion setting), enable
  "prefers-reduced-motion: reduce" and repeat Step 3 — confirm the row still collapses correctly
  immediately, with no ring-scale animation and no console errors.

- [ ] **Step 8: Clean up test data**

  Since this was tested on a future empty date, no real data was touched — no cleanup required. Confirm
  by reloading Sali on today's real date and verifying nothing there changed.
