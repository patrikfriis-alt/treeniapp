# Lepoajastimen kesto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing auto-start rest timer's duration (currently a hardcoded 90s constant) configurable via one global setting, following the exact same UI/data pattern as the existing "Askeltavoite" (steps goal) setting.

**Architecture:** One new nullable column on the existing `app_settings` singleton table. One new settings-menu row + modal (copy of the `openStepsGoalModal()`/`saveStepsGoal()` pattern). Two small edits to the existing `startRestTimer()`/`stopRestTimer()` functions to read the configured value instead of the constant, falling back to the constant when unset.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Postgres/PostgREST backend. No build step, no test framework — verification is manual (grep for structural correctness per task, live DB check + full browser walkthrough for the DB/behavioral tasks).

**Spec:** `docs/superpowers/specs/2026-08-13-lepoajastin-kesto-design.md`

**Note on one deviation from the spec doc:** The spec's UI section says to use the ⏱ emoji directly for the new settings-menu row icon. While mapping out the actual file structure for this plan, every other row in that settings menu (`index.html:1366-1391`) uses the app's SVG `data-icon="..."` system (rendered via `renderIcons()`/`svgIcon()`), not raw emoji — the ⏱ emoji is only used inside the rest-timer pill widget itself, a different, older UI element. Using a bare emoji in the settings list would visually clash with every sibling row (colored glyph vs. monochrome stroke icons). This plan instead adds a new `timer` icon (a simple hourglass, stroke-style, matching the existing icon set) to the shared `ICONS` object — consistent with how e.g. the `steps` icon was added when step tracking shipped. This keeps the spec's actual intent (a distinct icon, not reusing the already-used `watch` icon) while matching established codebase conventions.

---

### Task 1: Add the `app_settings.rest_timer_seconds` migration file

**Files:**
- Create: `supabase/migrations/20260813_rest_timer_seconds.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260813_rest_timer_seconds.sql` with exactly this content:

```sql
-- Lepoajastimen kesto asetettavaksi: null = käytä 90s oletusta (REST_DURATION-vakio).

alter table app_settings add column if not exists rest_timer_seconds integer;
```

- [ ] **Step 2: Verify the file**

Run:

```bash
cat supabase/migrations/20260813_rest_timer_seconds.sql
```

Expected: exactly the two lines above (comment + `alter table` statement), no trailing differences.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813_rest_timer_seconds.sql
git commit -m "$(cat <<'EOF'
feat: rest_timer_seconds-sarake app_settings-tauluun

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Apply the migration to the live Supabase database

**Files:** none (database operation only)

**Run this task in the main session, not a subagent** — it needs live Supabase CLI/API access. This project's Supabase project ref is `yznuzwbbyasgqeqllxic`.

Known quirk (from prior sessions on this project): `supabase db query --linked` sometimes hangs indefinitely at "Initialising login role..." — if this happens, don't wait it out; kill it and fall back to asking the user to run the SQL via the Supabase dashboard SQL editor instead.

- [ ] **Step 1: Confirm the CLI is linked to the right project**

```bash
supabase link --project-ref yznuzwbbyasgqeqllxic
```

Expected: `{"project_ref":"yznuzwbbyasgqeqllxic","message":""}` or similar success output.

- [ ] **Step 2: Try applying the migration via the CLI, backgrounded**

Run in the background (do not block on it):

```bash
supabase db query --linked -f supabase/migrations/20260813_rest_timer_seconds.sql
```

Check its output after a short wait. If it's still stuck at "Initialising login role..." with no progress, stop/kill the background task rather than waiting further, and instead ask the user to run the migration's SQL manually via the Supabase dashboard SQL editor (`https://supabase.com/dashboard/project/yznuzwbbyasgqeqllxic/sql/new`), pasting the contents of `supabase/migrations/20260813_rest_timer_seconds.sql`.

- [ ] **Step 3: Verify the column exists**

```bash
curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/app_settings?select=id,rest_timer_seconds" \
  -H "apikey: <SB_KEY from index.html>" \
  -H "Authorization: Bearer <SB_KEY from index.html>"
```

Expected: a JSON array with one row (`id: 1`), including a `rest_timer_seconds` key (value `null` is correct — the column now exists but is unset). If the request errors with something like `column app_settings.rest_timer_seconds does not exist`, the migration did not apply — go back to Step 2 (or the dashboard fallback) before proceeding to any later task.

- [ ] **Step 4: Report result**

No commit needed for this task (it's a database-only operation, nothing in git changes). State clearly whether the column now exists, and if the dashboard fallback was used, note that so the user knows it happened outside the automated flow.

---

### Task 3: Add the `timer` icon and the "Lepoajastin" settings-menu row

**Files:**
- Modify: `index.html:1403-1419` (the `ICONS` object)
- Modify: `index.html:1382-1384` (settings menu, insert new row after Askeltavoite)

**Depends on:** none (pure markup/data, can run independently of Tasks 1-2, but must land before Task 4/5's modal is wired up for the button to do anything when clicked).

- [ ] **Step 1: Add the `timer` icon**

Find this exact line in the `ICONS` object (around line 1418):

```js
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
```

Replace with (adds a new `timer` entry right after `steps`):

```js
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
  timer:     '<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/>',
```

- [ ] **Step 2: Add the settings-menu row**

Find this exact block (around line 1382):

```html
  <button onclick="openStepsGoalModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="steps" style="display:inline-flex"></span> Askeltavoite
  </button>
```

Replace with:

```html
  <button onclick="openStepsGoalModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="steps" style="display:inline-flex"></span> Askeltavoite
  </button>
  <button onclick="openRestTimerModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="timer" style="display:inline-flex"></span> Lepoajastin
  </button>
```

- [ ] **Step 3: Verify the edits**

```bash
grep -n "timer:" index.html
grep -n "openRestTimerModal" index.html
```

Expected: first grep shows 1 match (the `ICONS.timer` entry). Second grep shows 1 match so far (the `onclick` reference) — the function itself doesn't exist yet, that's Task 4.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: lisää timer-ikoni ja Lepoajastin-rivi asetusvalikkoon

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `openRestTimerModal()` and `saveRestTimerDuration()`

**Files:**
- Modify: `index.html:5320-5321` (insert two new functions right after `saveStepsGoal()`)

**Depends on:** Task 3 (the settings-menu button calling `openRestTimerModal()` should already exist, though this task doesn't strictly require it to run — it's just where the function will be called from).

This task follows `openStepsGoalModal()`/`saveStepsGoal()` (`index.html:5274-5320`) as its exact template, with two behavioral differences called out in the spec: (1) blank input means "reset to the 90s default" (saves `null`), not "disable the feature" — the timer always auto-starts, only the duration changes; (2) after a successful save this plan invalidates the settings cache via `appSettings = null` (forces a fresh reload on next access), exactly like `saveStepsGoal()`'s own success handler already does — not a manual in-place patch of the cached object.

- [ ] **Step 1: Add the two functions**

Find this exact block (around line 5313-5321):

```js
async function saveStepsGoal(goal) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, daily_steps_goal: goal, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveStepsGoal failed:', error.message); throw error; }
}

/* ═══════════════════════════════════════════════════════════════
```

Replace with:

```js
async function saveStepsGoal(goal) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, daily_steps_goal: goal, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveStepsGoal failed:', error.message); throw error; }
}

async function openRestTimerModal() {
  closeSidebar();
  const settings = (await loadAppSettings()) || {};
  const currentDuration = settings.rest_timer_seconds != null ? settings.rest_timer_seconds : '';

  const { overlay, modal } = createModalOverlay('rest-timer-settings-overlay');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);padding:24px;width:100%;';

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Lepoajastin</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">Kuinka pitkä lepoajastin käynnistyy automaattisesti kun täytät sarjan. Jätä tyhjäksi jos haluat oletuksen (90s).</div>
    <div class="form-row"><label>Kesto (s)</label><input type="text" inputmode="numeric" id="rest-timer-duration-input" value="${currentDuration}"></div>
    <button class="btn btn-primary" id="rest-timer-duration-save-btn">Tallenna</button>
    <button class="btn" id="rest-timer-duration-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="rest-timer-duration-status"></div>
  `;

  document.getElementById('rest-timer-duration-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('rest-timer-duration-save-btn');
    const raw = document.getElementById('rest-timer-duration-input').value.trim();
    const duration = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && (duration === null || isNaN(duration) || duration <= 0)) {
      showStatus('rest-timer-duration-status', 'Syötä positiivinen kokonaisluku tai jätä tyhjäksi', true);
      return;
    }
    saveBtn.disabled = true;
    try {
      await saveRestTimerDuration(duration);
      appSettings = null;
      overlay.remove();
    } catch (err) {
      showStatus('rest-timer-duration-status', 'Tallennus epäonnistui', true);
      saveBtn.disabled = false;
    }
  };
  document.getElementById('rest-timer-duration-cancel-btn').onclick = () => overlay.remove();
}

async function saveRestTimerDuration(seconds) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, rest_timer_seconds: seconds, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveRestTimerDuration failed:', error.message); throw error; }
}

/* ═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Verify the edits**

```bash
grep -n "async function openRestTimerModal\|async function saveRestTimerDuration" index.html
```

Expected: 2 matches, one per function.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: openRestTimerModal() ja saveRestTimerDuration()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire `startRestTimer()`/`stopRestTimer()` to the configured duration

**Files:**
- Modify: `index.html:1603-1638` (`startRestTimer()`, `stopRestTimer()`)

**Depends on:** none functionally (reads `appSettings.rest_timer_seconds`, which is `undefined`/absent until Tasks 1-2 land, and `(appSettings && appSettings.rest_timer_seconds) || REST_DURATION` degrades safely to `REST_DURATION` in that case) — but for the full feature to actually work end-to-end, Tasks 1-2 (migration) and Task 4 (the way the value gets set) must also be done. Safe to implement and commit independently either way.

- [ ] **Step 1: Update `startRestTimer()`**

Find this exact block (around line 1603):

```js
function startRestTimer() {
  stopRestTimer();
  let remaining = REST_DURATION;
```

Replace with:

```js
function startRestTimer() {
  stopRestTimer();
  let remaining = (appSettings && appSettings.rest_timer_seconds) || REST_DURATION;
```

- [ ] **Step 2: Update `stopRestTimer()`**

Find this exact line (around line 1634):

```js
    if (countEl) countEl.textContent = REST_DURATION;
```

Replace with:

```js
    if (countEl) countEl.textContent = (appSettings && appSettings.rest_timer_seconds) || REST_DURATION;
```

- [ ] **Step 3: Verify the edits**

```bash
grep -n "appSettings && appSettings.rest_timer_seconds" index.html
```

Expected: 2 matches (one in `startRestTimer()`, one in `stopRestTimer()`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: lepoajastin käyttää asetettavaa kestoa oletuksen sijaan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — it needs the `claude-in-chrome` browser tools and a live connection to the already-migrated Supabase database (Task 2 must be complete first). Follows the same pattern used for prior features in this project (serve `index.html` locally with `python3 -m http.server`, drive it via Chrome MCP tools).

- [ ] **Step 1: Serve the app locally**

Run in the background (do not block on it):

```bash
python3 -m http.server 8937
```

- [ ] **Step 2: Open it in Chrome, resize to phone viewport (430x932)**

- [ ] **Step 3: Verify the settings row and default state**

Open Valikko — confirm a "Lepoajastin" row appears right after "Askeltavoite", with a distinct hourglass-style icon (not the same icon as "Kalorikerroin"). Click it — confirm the modal opens with an empty duration field (since `rest_timer_seconds` is still `null` from Task 2's verification).

- [ ] **Step 4: Set a custom duration and verify it's used**

In the modal, enter `45`, save. Confirm the modal closes with no error. Navigate to Sali, open today's session, fill in a set's weight and reps (any exercise) — confirm the rest-timer pill appears at the bottom and counts down starting from 45, not 90.

- [ ] **Step 5: Verify blank resets to the 90s default**

Reopen the Lepoajastin settings modal — confirm it now shows `45` pre-filled. Clear the field, save. Fill in another set's weight and reps — confirm the timer now counts down from 90 again.

- [ ] **Step 6: Verify validation**

Reopen the modal, enter `0`, save — confirm an error message appears in the modal and it does NOT close. Try `-5` and then `abc` — confirm both are also rejected the same way. Close the modal without saving.

- [ ] **Step 7: Check the browser console for errors**

Use `read_console_messages` — expected: no new JS errors introduced by this change.

- [ ] **Step 8: Clean up**

Stop the local server, close the browser tab.

- [ ] **Step 9: Report result**

Summarize what was verified (or any issue found and how it was fixed). No commit needed — verification only.

---

### Task 7: Final code review

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent, as in prior features on this project).

- [ ] **Step 1: Dispatch a final code reviewer for the entire diff** (Tasks 1, 3, 4, 5 — the index.html and migration changes; Task 2 and 6 are operational/verification, not diffed code) covering: spec/design-doc fidelity, consistency of the new icon/modal/wiring with existing patterns, and that the documented emoji-vs-SVG-icon deviation (noted at the top of this plan) is the only intentional departure from the written spec.

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1-2), settings UI (Task 3-4), timer wiring (Task 5), and all four manual test scenarios from the spec's "Testaus" section (Task 6, steps 3-6) are all covered.
- **Documented deviation:** The emoji→SVG-icon change is called out explicitly at the top of the plan and will be flagged to the user when presenting this plan, since it diverges from the literal (but not the intended) spec text.
- **Type/name consistency:** `openRestTimerModal()`/`saveRestTimerDuration()` names and the `rest_timer_seconds` field name are used identically across Tasks 3, 4, and 5.
- **No placeholders:** every step shows exact before/after code, exact commands, and exact expected output.
