# Tyhjät tilat (empty states) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app's ~6 "no data yet" empty states an icon (from the existing `ICONS` set) instead of plain 12px gray text, without changing any copy or adding new UI elements.

**Architecture:** One shared helper `emptyState(icon, text)` (returns an HTML string: icon above text, centered) plus one new CSS class `.empty-state`. Applied at each of the 6 call sites in `index.html` that currently set `statusEl.textContent = '...'` or build a `<div class="status">...</div>` string for a genuine "nothing logged yet" case. Save/error feedback (`.status.err`, `.status.ok`, and all the `*-status` save-confirmation divs) is untouched — different concept, out of scope per the design doc.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file. No build step, no test framework — verification is manual (grep for structural correctness per task, full browser walkthrough at the end).

**Spec:** `docs/superpowers/specs/2026-08-12-tyhjat-tilat-design.md`

---

### Task 1: Add the `emptyState()` helper and `.empty-state` CSS class

**Files:**
- Modify: `index.html:719-721` (CSS, add after the `.status` block)
- Modify: `index.html:1421-1427` (JS, add after `svgIcon()`)

- [ ] **Step 1: Add the CSS class**

In `index.html`, find this exact block (around line 719):

```css
.status { font-size: 12px; text-align: center; padding: 6px; min-height: 24px; }
.status.ok  { color: var(--green); }
.status.err { color: var(--red); }
```

Replace it with:

```css
.status { font-size: 12px; text-align: center; padding: 6px; min-height: 24px; }
.status.ok  { color: var(--green); }
.status.err { color: var(--red); }
.empty-state { display:flex; flex-direction:column; align-items:center; gap:8px; padding:20px 12px; }
.empty-state-text { font-size:13px; color:var(--text3); text-align:center; }
```

- [ ] **Step 2: Add the `emptyState()` helper function**

In `index.html`, find this exact block (around line 1421):

```js
function svgIcon(name, color, size) {
  const path = ICONS[name];
  if (!path) return '';
  const c = color || 'currentColor';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
```

Replace it with:

```js
function svgIcon(name, color, size) {
  const path = ICONS[name];
  if (!path) return '';
  const c = color || 'currentColor';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function emptyState(icon, text) {
  return `<div class="empty-state">${svgIcon(icon, 'var(--text3)', 32)}<div class="empty-state-text">${text}</div></div>`;
}
```

- [ ] **Step 3: Verify the edits landed correctly**

Run:

```bash
grep -n "empty-state\b" index.html
grep -n "function emptyState" index.html
```

Expected: the CSS grep shows 2 matches (`.empty-state` and `.empty-state-text` selectors), the JS grep shows exactly 1 match (the function definition). No other output changes.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: emptyState()-apuri ja .empty-state-tyyli tyhjille tiloille

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire up the exercise chart empty states (2 call sites)

**Files:**
- Modify: `index.html:3514` and `index.html:3531` (`loadExerciseChart`, inline `ex-chart-status`)

These are the two empty-data checks inside `loadExerciseChart()` — the inline chart shown under an exercise row (not the "Kehitys" modal, that's Task 3).

- [ ] **Step 1: Update the first check (no data at all)**

Find this exact line (around line 3514):

```js
  if (error || !data || !data.length) { statusEl.textContent = 'Ei dataa vielä.'; return; }
```

Replace with:

```js
  if (error || !data || !data.length) { statusEl.innerHTML = emptyState('dumbbell', 'Ei dataa vielä.'); return; }
```

- [ ] **Step 2: Update the second check (no weight data)**

Find this exact line (around line 3531):

```js
  if (!labels.length) { statusEl.textContent = 'Ei painodataa vielä.'; return; }
```

Replace with:

```js
  if (!labels.length) { statusEl.innerHTML = emptyState('dumbbell', 'Ei painodataa vielä.'); return; }
```

- [ ] **Step 3: Verify the edits landed correctly**

Run:

```bash
grep -n "statusEl.innerHTML = emptyState('dumbbell'" index.html
```

Expected: 2 matches so far (from this task — Task 3 will add a 3rd).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: harjoituskaavion tyhjä tila käyttää emptyState()-apuria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire up the exercise detail modal chart empty state

**Files:**
- Modify: `index.html:3621-3626` (`loadModalChart`, `ex-modal-chart-status`)

This is the "Kehitys" modal opened via `openExerciseModal()` — a separate surface from Task 2's inline chart, same message text, same icon.

- [ ] **Step 1: Update the empty-data check**

Find this exact block (around line 3621):

```js
  const { data, error } = await query;
  try {
    if (error || !data || !data.length) {
      statusEl.textContent = 'Ei dataa vielä.';
      return;
    }
```

Replace with:

```js
  const { data, error } = await query;
  try {
    if (error || !data || !data.length) {
      statusEl.innerHTML = emptyState('dumbbell', 'Ei dataa vielä.');
      return;
    }
```

- [ ] **Step 2: Verify the edit landed correctly**

Run:

```bash
grep -n "statusEl.innerHTML = emptyState('dumbbell'" index.html
```

Expected: 3 matches total (2 from Task 2, 1 new here).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: harjoitusmodaalin kehityskaavion tyhjä tila käyttää emptyState()-apuria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire up the run chart empty state

**Files:**
- Modify: `index.html:3737` (`loadRunChart`, `run-chart-status`)

- [ ] **Step 1: Update the empty-data check**

Find this exact line (around line 3737):

```js
    if (statusEl) statusEl.textContent = 'Ei juoksudataa vielä';
```

Replace with:

```js
    if (statusEl) statusEl.innerHTML = emptyState('running', 'Ei juoksudataa vielä');
```

- [ ] **Step 2: Verify the edit landed correctly**

Run:

```bash
grep -n "emptyState('running'" index.html
```

Expected: 1 match.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: juoksukaavion tyhjä tila käyttää emptyState()-apuria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire up the coach conversation list and coach notes empty states

**Files:**
- Modify: `index.html:5431` (coach conversation list)
- Modify: `index.html:5451` (coach notes)

Both belong to the "Valmentaja" (coach) area, so they're grouped in one task.

- [ ] **Step 1: Update the conversation list empty state**

Find this exact line (around line 5431):

```js
    : '<div class="status">Ei vielä keskusteluja</div>';
```

Replace with:

```js
    : emptyState('chat', 'Ei vielä keskusteluja');
```

- [ ] **Step 2: Update the coach notes empty state**

Find this exact line (around line 5451):

```js
    : `<div class="status">Ei vielä muistiinpanoja — keskustele valmentajan kanssa niin se alkaa oppia.</div>`;
```

Replace with:

```js
    : emptyState('clipboard', 'Ei vielä muistiinpanoja — keskustele valmentajan kanssa niin se alkaa oppia.');
```

- [ ] **Step 3: Verify the edits landed correctly**

Run:

```bash
grep -n "emptyState('chat'\|emptyState('clipboard'" index.html
```

Expected: 2 matches.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: valmentajan keskustelulistan ja muistiinpanojen tyhjät tilat käyttävät emptyState()-apuria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full manual browser verification

**Files:** none (verification only)

Run this task in the main session (not a subagent) — it needs the `claude-in-chrome` browser tools, which may not be available to a dispatched subagent. This follows the same pattern already used earlier in this project to verify the input font-size fix.

- [ ] **Step 1: Serve the app locally**

```bash
cd /Users/patrikfriis/Projects/treeniapp && (python3 -m http.server 8935 >/tmp/treeniapp_server.log 2>&1 &)
```

- [ ] **Step 2: Open it in Chrome via the claude-in-chrome MCP tools**

Navigate to `http://localhost:8935/index.html`, resize to a phone-sized viewport (e.g. 430x932).

- [ ] **Step 3: Trigger and screenshot each of the 5 empty-state surfaces**

1. Open an exercise's inline chart for an exercise with no logged sets yet (or an exercise not yet trained this range) — confirm the `dumbbell` icon + "Ei dataa vielä." appear centered, no clipping.
2. Open the same exercise's "Kehitys" detail modal — confirm the `dumbbell` icon appears there too (separate surface from step 1).
3. Open the Aerobinen/run chart for a period with no run data (or switch chart type if one variant has none) — confirm the `running` icon + "Ei juoksudataa vielä".
4. Open Valmentaja → if there's a way to view an empty conversation list (or note current conversations still show correctly) — confirm `chat` icon renders correctly and the "+ Uusi keskustelu" / "Mitä valmentaja tietää sinusta" buttons above it still work normally.
5. Open "Mitä valmentaja tietää sinusta" (coach notes) — if notes are empty, confirm `clipboard` icon + message; if notes exist, confirm the notes view is unaffected (this code path wasn't touched).

- [ ] **Step 4: Confirm no regressions when data IS present**

For at least one surface (e.g. an exercise with logged data), confirm the chart renders normally and no leftover empty-state icon/text remains from a previous empty render.

- [ ] **Step 5: Check the browser console for errors**

Use `read_console_messages` — expected: no new JS errors introduced by this change.

- [ ] **Step 6: Clean up**

```bash
pkill -f "http.server 8935" 2>/dev/null
```

Close the browser tab via `tabs_close_mcp`.

- [ ] **Step 7: Report result to the user**

Summarize what was visually confirmed (or any issue found and how it was fixed) — no commit needed for this task, it's verification-only.

---

## Self-Review Notes

- **Spec coverage:** All 6 call sites from the design doc's table are covered (Task 2: rows 1–2, Task 3: row 3, Task 4: row 4, Task 5: rows 5–6). The design doc's explicit exclusions (steps-modal weekly note, food-search empty, save/error `.status` messages) are not touched anywhere in this plan — confirmed no task references them.
- **Type/name consistency:** `emptyState(icon, text)` signature is identical across every call site (Tasks 2–5) and matches the definition in Task 1.
- **No placeholders:** every step shows exact before/after code and exact grep commands with expected output counts.
