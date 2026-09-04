# Treenilogin päivävihje ja valmis-merkinnät — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a banner that nudges the user toward the existing same-day "Päivän tyyppi" picker when they're viewing a non-today, not-yet-done day-tab in the current week (instead of logging directly into the wrong calendar date), plus explicit done markers for individual sets and fully-completed exercises in the treenilogi (Sali page) view.

**Architecture:** Pure front-end change inside the single-file app `index.html`. No new database tables/columns — reuses the existing `day_session_overrides` table via the existing `setActiveSession()` function. Three independent, additive changes to `renderTreeni()`/`renderSession()`: (1) a banner container populated conditionally, (2) a per-set checkmark driven by the already-computed `setStatus()` result, (3) a per-exercise checkmark/progress-bar color driven by the already-computed `doneCount`/`ex.s`.

**Tech Stack:** Vanilla JS, template-literal HTML rendering, plain CSS custom properties (`var(--accent)`, `var(--green)`, `var(--amber)`, etc. already defined in `:root`). No build step — `index.html` is served as-is.

---

## File Structure

Everything lives in one file:
- **Modify: `index.html`**
  - CSS block (`<style>`, roughly lines 1-800): add `.day-nudge-banner`, `.day-nudge-btn`, `.set-check`, `.ex-check`, `.ex-block-prog-fill.done` rules.
  - HTML body (~line 1194): add `<div id="day-nudge"></div>` container.
  - JS (~line 1642 onward): add `catchUpToday()` function; modify `renderTreeni()` to populate the banner; modify `renderSession()`'s set-row and exercise-header template literals to add the checkmarks.

No new files. This is a small enough, single-surface change that splitting into multiple files would fight the existing single-file convention.

---

### Task 1: Missed-day nudge banner

**Files:**
- Modify: `index.html:1194` (HTML container)
- Modify: `index.html:566` (CSS, insert after `.day-done-btn:hover`)
- Modify: `index.html:3054-3066` (JS, add `catchUpToday()` near `setActiveSession`)
- Modify: `index.html:3038-3040` (JS, populate banner at end of `renderTreeni()`)

- [x] **Step 1: Add the banner container to the HTML**

In `index.html`, find:
```html
  <div class="day-tabs" id="day-tabs"></div>
```
(around line 1194, inside `#page-sali`). Change it to:
```html
  <div class="day-tabs" id="day-tabs"></div>
  <div id="day-nudge"></div>
```

- [x] **Step 2: Add the banner CSS**

Find (around line 566):
```css
.day-done-btn:hover { background: var(--green); color: #fff; }
```
Add immediately after it:
```css

/* ─── Missed-day nudge ──────────────────────────────────────── */
.day-nudge-banner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--amber-bg);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--text2);
}
.day-nudge-btn {
  background: var(--amber);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
```

- [x] **Step 3: Add `catchUpToday()`**

Find in `index.html` (around line 3054):
```js
async function setActiveSession(o, d, st) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const workout_date = localIso(dt);
  const { error } = await sbWrite({
    table: 'day_session_overrides',
    op: 'upsert',
    payload: { workout_date, session_type: st },
    opts: { onConflict: 'workout_date' },
  });
  if (error) { console.error('setActiveSession failed:', error.message); return; }
  renderTreeni();
}
```
Add immediately after it:
```js

async function catchUpToday() {
  const st = getActiveSession(wOff, aDay);
  aDay = todayIdx();
  await setActiveSession(wOff, aDay, st);
}
```
(`setActiveSession` already calls `renderTreeni()` on success, so no extra render call is needed here. Setting `aDay` before the `await` means that re-render already shows today's tab as active.)

- [x] **Step 4: Populate the banner in `renderTreeni()`**

Find (around line 3038-3040):
```js
  loadWeekSummary();
  loadMotivationSummary();
  await renderSession(requestId);
}
```
Change to:
```js
  const nudgeEl = document.getElementById('day-nudge');
  const hasEx   = sess && sess.ex && sess.ex.length > 0;
  if (wOff === 0 && !isToday && hasEx && !done) {
    const dateStr = dayDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    nudgeEl.innerHTML = `
      <div class="day-nudge-banner">
        <span>⚠️ Tämä on <strong>${dayNames[aDay]} ${dateStr}</strong> -treeni, ei tämän päivän.</span>
        <button class="day-nudge-btn" onclick="catchUpToday()">Tee tämä ohjelma tänään sen sijaan →</button>
      </div>`;
  } else {
    nudgeEl.innerHTML = '';
  }

  loadWeekSummary();
  loadMotivationSummary();
  await renderSession(requestId);
}
```

This relies on `sess`, `done`, `isToday`, `dayNames`, `dayDate` already being declared earlier in the same `renderTreeni()` function (lines ~2921-2931) — they are `const`s in the same function scope, so no changes needed there.

- [x] **Step 5: Manual verification**

Start a local static server from the repo root and open the app:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000/index.html` in a browser, log in, go to the "Sali" page.

Check:
1. On today's day-tab: no banner appears.
2. Click a different day-tab in the current week that has exercises and isn't marked done: the banner appears with the correct weekday name and date, and the correct "not done" wording.
3. Click the banner's button: the view jumps back to today's tab, the exercise list now matches the program you were just viewing, and the banner disappears (because you're now on `isToday`).
4. Open the Supabase table editor (or `curl` the REST API as used earlier in this session) and confirm `day_session_overrides` has a row for today's date with the session type you picked.
5. Click a day-tab in the current week that's already marked done (green): confirm no banner appears.
6. Click a day-tab with no exercises (rest day): confirm no banner appears.
7. Use the week-nav arrows to go to a previous week (`wOff !== 0`): confirm no banner appears on any tab there, regardless of done state.
8. Check the browser console for errors throughout.

- [x] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(treenilogi): nudge toward same-day program picker on stale day-tabs

When viewing a non-today, not-yet-done day-tab in the current week,
show a banner offering to switch today's program instead of letting
data silently save under the wrong calendar date (root cause of the
2026-09-03 gym-session mis-filing incident).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 2: Per-set done checkmark

**Files:**
- Modify: `index.html:622-626` (CSS, insert after `.set-tnum` color rules)
- Modify: `index.html:3191-3192` (JS template literal in `renderSession()`)

- [x] **Step 1: Add the checkmark CSS**

Find (around line 626):
```css
.set-table-row.s-better .set-tnum { color: var(--green); }
```
Add immediately after it:
```css
.set-check { color: var(--green); font-size: 11px; margin-left: 2px; }
```

- [x] **Step 2: Render the checkmark**

Find in `renderSession()` (around line 3191-3192):
```js
      html += `<div class="set-table-row s-${status}" id="set-${wOff}-${aDay}-${ei}-${s}">
        <span class="set-tnum">${s + 1}</span>
```
Change the `set-tnum` line to:
```js
      const setDoneMark = status !== 'undone' ? ' <span class="set-check">✓</span>' : '';
      html += `<div class="set-table-row s-${status}" id="set-${wOff}-${aDay}-${ei}-${s}">
        <span class="set-tnum">${s + 1}${setDoneMark}</span>
```

`status` is already computed a few lines above (`const status = setStatus(sd, prevSet);`, around line 3186) and already returns `'undone'` when both `kg` and `reps` are empty — this is the existing definition of "not done", no new logic needed.

- [x] **Step 3: Manual verification**

With the local server still running, open a session that has been started (tap "Aloita treeni" if needed):

1. For a set with empty KG/reps: no checkmark next to the set number (still shows the existing reddish "undone" tint).
2. Type a KG value and a reps value into a set's inputs, then blur the field (triggers `onchange`): a green ✓ appears next to that set's number immediately after the row re-renders.
3. Clear one of the two values back out: the checkmark disappears again.
4. Confirm the existing ▼/●/▲ previous-performance indicator in the right-hand column is unaffected and still shows correctly.
5. Check the browser console for errors.

- [x] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(treenilogi): show explicit checkmark on completed sets

Reuses the existing setStatus() undone/worse/same/better classification
so a filled set is unambiguously marked done regardless of which of the
three performance colors it also gets.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 3: Per-exercise done checkmark and progress-bar color

**Files:**
- Modify: `index.html:585` (CSS, insert after `.ex-block-prog-fill`)
- Modify: `index.html:683-693` (CSS, insert after `.pr-badge`)
- Modify: `index.html:3164-3177` (JS template literal in `renderSession()`)

- [x] **Step 1: Add the CSS**

Find (around line 585):
```css
.ex-block-prog-fill { height:3px; background:#0a84ff; border-radius:3px; }
```
Add immediately after it:
```css
.ex-block-prog-fill.done { background: var(--green); }
```

Find (around line 693, after the `.pr-badge` rule):
```css
.pr-badge {
  font-size: 10px;
  background: var(--amber-bg);
  color: var(--amber);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 6px;
  font-weight: 600;
  letter-spacing: .03em;
}
```
Add immediately after it:
```css
.ex-check { color: var(--green); font-size: 13px; margin-left: 4px; }
```

- [x] **Step 2: Compute and render the exercise-done state**

Find in `renderSession()` (around line 3157, right after `progPct` is computed):
```js
    const progPct = ex.s > 0 ? Math.round(doneCount / ex.s * 100) : 0;
```
Add immediately after it:
```js
    const exDone = ex.s > 0 && doneCount === ex.s;
```

Then find the exercise header template literal (around line 3164-3177):
```js
    html += `<div class="ex-block">
      <div class="ex-block-header">
        <div>
          <div class="ex-block-title" data-ex="${ex.n.replace(/"/g,'&quot;')}" onclick="openExerciseModal(this.dataset.ex)" style="cursor:pointer">${escapeHtml(ex.n)}${isPR ? '<span class="pr-badge">PR</span>' : ''}</div>
          <div class="ex-block-sub">${escapeHtml(ex.t)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="ex-block-progress">
            <div class="ex-block-prog-label" id="ex-prog-label-${wOff}-${aDay}-${ei}">${doneCount}/${ex.s} sarjaa</div>
            <div class="ex-block-prog-bar"><div class="ex-block-prog-fill" id="ex-prog-fill-${wOff}-${aDay}-${ei}" style="width:${progPct}%"></div></div>
          </div>
          ${prefillBtn}
        </div>
      </div>
```
Change the title line and the prog-fill line to:
```js
    html += `<div class="ex-block">
      <div class="ex-block-header">
        <div>
          <div class="ex-block-title" data-ex="${ex.n.replace(/"/g,'&quot;')}" onclick="openExerciseModal(this.dataset.ex)" style="cursor:pointer">${escapeHtml(ex.n)}${exDone ? ' <span class="ex-check">✓</span>' : ''}${isPR ? '<span class="pr-badge">PR</span>' : ''}</div>
          <div class="ex-block-sub">${escapeHtml(ex.t)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="ex-block-progress">
            <div class="ex-block-prog-label" id="ex-prog-label-${wOff}-${aDay}-${ei}">${doneCount}/${ex.s} sarjaa</div>
            <div class="ex-block-prog-bar"><div class="ex-block-prog-fill${exDone ? ' done' : ''}" id="ex-prog-fill-${wOff}-${aDay}-${ei}" style="width:${progPct}%"></div></div>
          </div>
          ${prefillBtn}
        </div>
      </div>
```

- [x] **Step 3: Manual verification**

With the local server still running, open a session that has been started, on an exercise with more than one set:

1. Fill in KG+reps for all but one set: progress label shows e.g. `2/3 sarjaa`, bar is still the neutral blue, no ✓ next to the exercise name.
2. Fill in the last set: bar immediately turns green and a ✓ appears next to the exercise name.
3. Clear one set's value back out: both the ✓ and the green bar color revert.
4. Confirm the existing PR badge (if present on a personal-record set) still renders correctly alongside the new ✓.
5. Check the browser console for errors.

- [x] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(treenilogi): mark fully completed exercises with a checkmark

Adds an explicit done signal at the exercise level (checkmark + green
progress bar) once every set is filled, on top of the existing X/Y
sarjaa counter.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (missed-day nudge) → Task 1. Section 2 (set marker) → Task 2. Section 3 (exercise marker) → Task 3. Section 4 (no DB changes) → confirmed, no migration files added anywhere in this plan. All "Rajaus" exclusions (past weeks, no blocking, no schema changes) are respected — no task touches `wOff !== 0` rendering or disables any input.
- **Placeholder scan:** no TBD/TODO; every step shows exact before/after code.
- **Type/name consistency:** `catchUpToday`, `day-nudge` id, `set-check`, `ex-check`, `exDone` are each introduced once and referenced identically in every later step that uses them.
