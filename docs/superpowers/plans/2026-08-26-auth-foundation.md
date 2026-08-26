# Kirjautumisen perusta (osaprojekti 1/5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth email magic-link sign-in to Treeniapp — a full-screen login gate blocks the app until a session exists, a sidebar button signs out. No database changes, no RLS changes, no change to what data anyone sees.

**Architecture:** Pure additive frontend wiring on top of the already-loaded `@supabase/supabase-js@2` client (`sb`, `index.html:1578`), using its built-in `sb.auth.signInWithOtp()` / `sb.auth.signOut()` / `sb.auth.onAuthStateChange()`. The existing boot IIFE (`index.html:7887-7904`) becomes a named `initApp()` function that only runs once a session exists; a single `onAuthStateChange` listener decides whether to show the new `#auth-gate` overlay or run `initApp()`. Accounts are created out-of-band via the Supabase Dashboard — no signup UI.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Supabase Auth + Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-26-auth-foundation-design.md`

---

### Task 1: `#auth-gate` login screen — HTML + CSS

**Files:**
- Modify: `index.html` — CSS (insert before the Sidebar CSS section, line ~779-780), shared input selector (line 145), HTML (insert right after `<body>`, line ~1014-1016)

**Depends on:** none.

- [ ] **Step 1: Add `input[type=email]` to the shared input styling**

Find this exact block:

```css
input[type=number], input[type=date], input[type=text], input[type=password], select {
```

Replace with:

```css
input[type=number], input[type=date], input[type=text], input[type=password], input[type=email], select {
```

- [ ] **Step 2: Add the `#auth-gate` CSS**

Find this exact block:

```css
.prefill-btn { font-size:11px; padding:4px 10px; background:var(--surface3); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--accent); cursor:pointer; white-space:nowrap; margin-top:6px; display:inline-block; }

/* ─── Sidebar ────────────────────────────────────────────────── */
```

Replace with:

```css
.prefill-btn { font-size:11px; padding:4px 10px; background:var(--surface3); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--accent); cursor:pointer; white-space:nowrap; margin-top:6px; display:inline-block; }

/* ─── Auth-gate (kirjautumisnäkymä) ─────────────────────────── */
#auth-gate {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
#auth-gate.open { display: flex; }
.auth-gate-box { width: 100%; max-width: 340px; }
.auth-gate-title { font-size: 22px; font-weight: 700; color: var(--text); text-align: center; margin-bottom: 6px; }
.auth-gate-subtitle { font-size: 14px; color: var(--text2); text-align: center; margin-bottom: 24px; }

/* ─── Sidebar ────────────────────────────────────────────────── */
```

`#auth-gate` starts with `display:none` and is only ever shown by adding the `.open` class (never via direct `style.display` writes) — this keeps a single source of truth for its visibility, matching how `.modal-overlay.open` already works elsewhere in this file. `z-index: 1000` is deliberately higher than every other overlay in the file (`.ex-modal-overlay` at 999 is the previous highest) so the gate can never be covered by anything, including a stale modal left open from a previous session's DOM.

- [ ] **Step 3: Add the `#auth-gate` HTML**

Find this exact block:

```html
<body>

<div id="offline-banner"><span id="offline-banner-text"></span><button id="offline-banner-discard-btn" onclick="discardStuckQueueEntries()">Poista jumissa olevat</button></div>
```

Replace with:

```html
<body>

<div id="auth-gate">
  <div class="auth-gate-box">
    <div class="auth-gate-title">Valkku</div>
    <div class="auth-gate-subtitle">Kirjaudu sisään jatkaaksesi</div>
    <input type="email" id="auth-gate-email" placeholder="sähköposti@esimerkki.fi" autocomplete="email" style="width:100%;box-sizing:border-box;">
    <button class="btn-primary" onclick="sendAuthMagicLink()">Lähetä kirjautumislinkki</button>
    <div id="auth-gate-status" class="status"></div>
  </div>
</div>

<div id="offline-banner"><span id="offline-banner-text"></span><button id="offline-banner-discard-btn" onclick="discardStuckQueueEntries()">Poista jumissa olevat</button></div>
```

`onclick="sendAuthMagicLink()"` references a function that doesn't exist yet — that's expected, Task 3 defines it. This task only builds the static shell; the gate is inert (visible if manually shown, but clicking the button does nothing) until Task 3 lands. `#auth-gate` itself starts hidden (`display:none` from its CSS, no `.open` class yet) — Task 2 is what makes it appear on page load when there's no session.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_auth_check1.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_auth_check1.js
grep -n "input\[type=number\], input\[type=date\], input\[type=text\], input\[type=password\], input\[type=email\], select" index.html
grep -n "^#auth-gate {" index.html
grep -n "^#auth-gate.open" index.html
grep -n 'id="auth-gate-email"' index.html
grep -n 'id="auth-gate-status"' index.html
grep -n 'onclick="sendAuthMagicLink()"' index.html
```

Expected: `node --check` produces no output; 1 match for each grep.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: kirjautumisnäkymän (#auth-gate) HTML ja CSS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of 4. `.btn-primary` (line ~500) and `.status`/`.status.ok`/`.status.err` (line ~737-739) are pre-existing and reused as-is — do not redefine them. `#auth-gate` deliberately does NOT reuse `.modal-overlay`/`.modal-sheet` (the bottom-sheet-style modal system used by `createModalOverlay()`): those are dismissible sheets that slide up over existing content and close on backdrop click, whereas the auth gate is a permanent, non-dismissible full-screen block with no backdrop-click handler at all — different component, different CSS.

Full spec: `docs/superpowers/specs/2026-08-26-auth-foundation-design.md`.

## Before You Begin

If either exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `#auth-gate` has no `onclick` handler on the outer div itself (unlike `#sidebar-overlay`, which closes on click) — this overlay must never be dismissible by clicking outside the box, since there is no "outside" state to return to when there's no session.
- Confirm the new HTML block was inserted directly after `<body>` and before `#offline-banner`, not nested inside any other element.
- Confirm `input[type=email]` was added to the existing shared selector line (not a brand-new separate CSS rule) — a duplicate/separate rule with different values would cause inconsistent styling if the shared rule is ever edited later.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 2: Boot-gate logic — session check, `onAuthStateChange`, `initApp()`

**Files:**
- Modify: `index.html` — replace the boot IIFE at the end of the main `<script>` block (line ~7884-7908)

**Depends on:** Task 1 (`showAuthGate()`/`hideAuthGate()` manipulate `#auth-gate`, which must exist in the DOM).

- [ ] **Step 1: Replace the boot IIFE with a gated version**

Find this exact block:

```js
/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
(async () => {
  renderIcons();
  updateOfflineBanner(loadQueue());
  flushQueue();
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
  if (programLoaded) {
    migrateLD_v2();
    migrateLD_v3();
  } else {
    console.error('Ohjelmadataa ei saatu ladattua — ohitetaan kertaluontoiset migraatiot tällä kertaa.');
  }
  loadKoonti();
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW rekisteröinti epäonnistui:', e));
}
```

Replace with:

```js
/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
let appInitialized = false;

function showAuthGate() {
  document.getElementById('auth-gate').classList.add('open');
  document.querySelector('nav').style.display = 'none';
}

function hideAuthGate() {
  document.getElementById('auth-gate').classList.remove('open');
  document.querySelector('nav').style.display = '';
}

async function initApp() {
  renderIcons();
  updateOfflineBanner(loadQueue());
  flushQueue();
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
  if (programLoaded) {
    migrateLD_v2();
    migrateLD_v3();
  } else {
    console.error('Ohjelmadataa ei saatu ladattua — ohitetaan kertaluontoiset migraatiot tällä kertaa.');
  }
  loadKoonti();
}

sb.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    hideAuthGate();
    if (!appInitialized) {
      appInitialized = true;
      await initApp();
    }
  } else {
    showAuthGate();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW rekisteröinti epäonnistui:', e));
}
```

This relies on a documented supabase-js v2 guarantee: `onAuthStateChange`'s callback fires once immediately upon subscription with the current session state (event `INITIAL_SESSION`), before any `SIGNED_IN`/`SIGNED_OUT` event can occur. That single callback covers every case the spec describes — the initial "is there a session" check on page load, the `SIGNED_IN` case (including the one that fires automatically after a magic-link redirect, since `detectSessionInUrl` is on by default), and `SIGNED_OUT`. No separate explicit `sb.auth.getSession()` call is needed.

`appInitialized` intentionally makes `initApp()` (which calls the one-time `migrateLD_v2()`/`migrateLD_v3()` migrations) run **at most once per page load**, exactly matching current behavior where the old IIFE also only ever ran once. Signing out and back in within the same page load (without a reload) will re-show/re-hide the gate correctly via `showAuthGate()`/`hideAuthGate()`, but will NOT re-run `initApp()` a second time — this is a deliberate scoping choice to avoid re-invoking one-time migrations mid-session, not an oversight. A full page reload after signing back in would always re-run everything from scratch as normal.

- [ ] **Step 2: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_auth_check2.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_auth_check2.js
grep -n "^async function initApp" index.html
grep -n "^function showAuthGate" index.html
grep -n "^function hideAuthGate" index.html
grep -n "sb.auth.onAuthStateChange" index.html
grep -n "let appInitialized = false;" index.html
grep -c "(async () => {" index.html
```

Expected: `node --check` produces no output; 1 match for each of the first five greps; the last grep (counting any remaining top-level async IIFEs) should return `0` — the old boot IIFE is gone, replaced by named functions.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: istunnon tarkistus käynnistyksessä, onAuthStateChange-kuuntelija

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of 4. `renderIcons()`, `updateOfflineBanner()`, `loadQueue()`, `flushQueue()`, `localIso()`, `loadProgram()`, `migrateLD_v2()`, `migrateLD_v3()`, `loadKoonti()` are all pre-existing and untouched — `initApp()`'s body is byte-for-byte the old IIFE's body, just wrapped in a named `async function` instead of an immediately-invoked one. `sb` (the Supabase client) is defined earlier in the file at line ~1578 and is in scope here since everything lives in the same `<script>` block.

Full spec: `docs/superpowers/specs/2026-08-26-auth-foundation-design.md`.

## Before You Begin

If the exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make the edit exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace page load with an existing valid session: `onAuthStateChange` fires once with a truthy `session` → `hideAuthGate()` runs → `appInitialized` is `false` → it flips to `true` and `initApp()` runs. Confirm this matches "istunto olemassa: jatketaan nykyisellä alustuslogiikalla muuttumattomana" from the spec.
- Hand-trace page load with no session: `onAuthStateChange` fires once with `session === null` → `showAuthGate()` runs → `initApp()` never runs. Confirm `nav` and every `.page` stay inert (no data loaded, no icons rendered on the hidden nav — harmless since nav is `display:none`).
- Hand-trace a magic-link redirect landing on the page (no prior session, URL contains an auth fragment): confirm the reasoning for relying on `onAuthStateChange`'s automatic firing (rather than a manual `getSession()` + URL-parsing) is sound — supabase-js's `detectSessionInUrl` (default `true`) processes the URL fragment during client init and fires a `SIGNED_IN` event through this same listener once it succeeds, so no separate code path is needed.
- Confirm no other code in the file called the old top-level boot IIFE by any other means (e.g. no second reference expecting it to still be an IIFE) — search for any comment or code elsewhere referencing "INIT" that assumed the old shape.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the three hand-traced scenarios
- Any issues or concerns

---

### Task 3: Magic-link request, sign-out, sidebar button

**Files:**
- Modify: `index.html` — new functions after the `sb` client (line ~1578), `ICONS` object (line ~1546), sidebar HTML (near `export-food-btn`, line ~1518-1521)

**Depends on:** Task 1 (`#auth-gate-email`/`#auth-gate-status` must exist). Functionally relies on Task 2's `onAuthStateChange` listener being in place for `signOutUser()` to have any visible effect (it only calls `sb.auth.signOut()`; showing the gate again is the listener's job, not this task's) — but there is no direct code reference between them, so this task can be implemented independently of Task 2's internals.

- [ ] **Step 1: Add `sendAuthMagicLink()` and `signOutUser()`**

Find this exact block:

```js
const sb = supabase.createClient(SB_URL, SB_KEY);

/* ═══════════════════════════════════════════════════════════════
   SCHEDULE & SESSIONS
═══════════════════════════════════════════════════════════════ */
```

Replace with:

```js
const sb = supabase.createClient(SB_URL, SB_KEY);

async function sendAuthMagicLink() {
  const emailEl = document.getElementById('auth-gate-email');
  const email = emailEl.value.trim();
  const statusEl = document.getElementById('auth-gate-status');
  if (!email) return;
  statusEl.textContent = '';
  statusEl.className = 'status';
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    console.error('sendAuthMagicLink failed:', error.message);
    statusEl.textContent = 'Kirjautumislinkin lähetys epäonnistui, yritä uudelleen';
    statusEl.className = 'status err';
    return;
  }
  statusEl.textContent = `Tarkista sähköpostisi — lähetimme kirjautumislinkin osoitteeseen ${email}`;
  statusEl.className = 'status ok';
}

async function signOutUser() {
  await sb.auth.signOut();
}

/* ═══════════════════════════════════════════════════════════════
   SCHEDULE & SESSIONS
═══════════════════════════════════════════════════════════════ */
```

`statusEl.textContent = ...` (not `innerHTML`) is used deliberately so the user-supplied email cannot inject HTML — no `escapeHtml()` call is needed here since `textContent` never interprets its argument as markup.

- [ ] **Step 2: Add the "logout" icon**

Find this exact block:

```js
  table:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
};
```

Replace with:

```js
  table:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
  logout:    '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};
```

`svgIcon()` (line ~6949) inserts each `ICONS` entry's raw markup directly inside an `<svg>` wrapper, so mixing `<polyline>`/`<line>` with `<path>` here works the same way the pre-existing `table`/`steps` entries already mix `<rect>`/`<ellipse>`/`<circle>` with `<path>`.

- [ ] **Step 3: Add the "Kirjaudu ulos" sidebar button**

Find this exact block:

```html
  <button id="export-food-btn" onclick="exportFoodLogCSV();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="upload" style="display:inline-flex"></span> Vie ruokalogi (CSV)
  </button>
</div>
```

Replace with:

```html
  <button id="export-food-btn" onclick="exportFoodLogCSV();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="upload" style="display:inline-flex"></span> Vie ruokalogi (CSV)
  </button>
  <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:8px;">
    <button id="signout-btn" onclick="signOutUser();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--red);font-size:14px;cursor:pointer;">
      <span data-icon="logout" style="display:inline-flex"></span> Kirjaudu ulos
    </button>
  </div>
</div>
```

This is its own divider (`border-top` on a wrapping div), not reusing the "Vie data" section's `Asetukset`-style uppercase label divider — the spec calls for "oman erottimensa" (its own separator), and a plain top border reads as "unrelated, standalone action" rather than grouping sign-out under either the settings or export sections.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_auth_check3.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_auth_check3.js
grep -n "^async function sendAuthMagicLink" index.html
grep -n "^async function signOutUser" index.html
grep -n "logout:    '<path d=\"M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4\"/>" index.html
grep -n 'id="signout-btn"' index.html
grep -n 'onclick="signOutUser();closeSidebar()"' index.html
```

Expected: `node --check` produces no output; 1 match for each grep.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: kirjautumislinkin lähetys, uloskirjautuminen ja sivupalkin nappi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of 4, independent of Task 2 (different regions of the file, no shared identifiers). `closeSidebar()` is pre-existing and unchanged. `.red` CSS variable (`--red`) is pre-existing, used elsewhere for destructive-leaning actions.

Full spec: `docs/superpowers/specs/2026-08-26-auth-foundation-design.md`.

## Before You Begin

If any exact block doesn't match what's in `index.html`, ask now — don't improvise a different insertion point.

## Your Job

1. Make all edits exactly as specified
2. Verify with the exact commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `sendAuthMagicLink()` never reveals whether an email address has an existing account — trace the `error` branch: the message shown is the generic "Kirjautumislinkin lähetys epäonnistui, yritä uudelleen" regardless of what `error.message` actually says, and the real error is only logged to `console.error`, never shown to the user.
- Confirm `signOutUser()` does nothing beyond calling `sb.auth.signOut()` — it must not directly manipulate `#auth-gate` or `nav` itself, since that's Task 2's `onAuthStateChange` listener's responsibility; duplicating it here would be redundant and risk the two falling out of sync.
- Confirm the new sidebar button sits after `export-food-btn` and before the sidebar's closing `</div>`, in its own bordered wrapper div, not nested inside the "Vie data" section.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 4: Manual browser verification + final review + finish branch

**Files:** none (verification and review only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools, a real Supabase Auth test account (created via the Supabase Dashboard's "Invite user"), and access to the invited email inbox to click the magic link.

**Before starting:** ask the user to create a test account via Supabase Dashboard → Authentication → Users → "Invite user", using an email they can access, since this cannot be done from the app or from this session.

- [ ] **Step 1: Serve the app locally, open in Chrome**

- [ ] **Step 2: Load the app with no session** (fresh/incognito profile, or after calling `sb.auth.signOut()` once via the console) — confirm only `#auth-gate` is visible: no nav, no page content, no console errors.

- [ ] **Step 3: Enter the test account's email and click "Lähetä kirjautumislinkki"** — confirm the status message "Tarkista sähköpostisi — lähetimme kirjautumislinkin osoitteeseen {email}" appears in green.

- [ ] **Step 4: Open the magic link from the test inbox in the same browser** — confirm the app loads the normal Koonti view instead of the login screen, and the nav bar appears.

- [ ] **Step 5: Refresh the page (F5)** — confirm the session persists (no return to the login screen).

- [ ] **Step 6: Open the Valikko sidebar, click "Kirjaudu ulos"** — confirm `#auth-gate` reappears and nav/pages disappear.

- [ ] **Step 7: Enter an invalid/non-existent email and send a link** — confirm an error message shows (generic wording, not revealing whether the account exists) and the app doesn't crash; check the console for the logged (not displayed) real error.

- [ ] **Step 8: Sign back in via a fresh magic link, then click through a few existing features** (Ruoka, Sali, Tilastot) — confirm everything behaves exactly as before this feature, with the same data visible as always.

- [ ] **Step 9: Check the browser console for errors** throughout all of the above — expected: none beyond the intentionally-logged, generic sign-in failure from Step 7.

- [ ] **Step 10: Dispatch a final code reviewer** for the combined diff across Tasks 1-3, covering: `#auth-gate` cannot be dismissed by any means other than a real session existing, `initApp()`'s body is unchanged from the old IIFE (no accidental behavior drift), the `appInitialized` single-run guard is correctly scoped, `sendAuthMagicLink()` never leaks account-existence information, and no RLS policy, migration, or `sb.from(...)` call site was touched anywhere in the diff (this sub-project is explicitly scoped to auth wiring only).

- [ ] **Step 11: If issues are found, fix them and re-review until approved.**

- [ ] **Step 12: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (tilien luonti Dashboardin kautta, ei UI:ta) — no in-app signup exists anywhere in this plan, confirmed by omission. §2 (käynnistyslogiikka + onAuthStateChange) → Task 2. §3 (kirjautumisnäkymä) → Task 1 (HTML/CSS) + Task 3 (`sendAuthMagicLink()`). §4 (uloskirjautuminen) → Task 3. §5 (datan näkyvyys ei muutu) — no RLS/migration/query touched in any task, confirmed by omission and called out explicitly in Task 4's final review. §6 (rajaus: ei salasanaa, ei allowlistia, ei tilinvaihtoa) — respected throughout, nothing in any task adds those. Testaus §1-8 → Task 4 covers all eight manual steps.
- **Type/name consistency:** `showAuthGate()`/`hideAuthGate()` (Task 2) match the class name (`open`) and element id (`auth-gate`) defined in Task 1 exactly. `sendAuthMagicLink()` (Task 3) matches the `onclick` reference already written into the HTML in Task 1. `signOutUser()` (Task 3) matches the sidebar button's `onclick` in the same task. `auth-gate-email`/`auth-gate-status` ids are used identically in Task 1 (HTML) and Task 3 (JS `getElementById` calls).
- **No placeholders:** exact before/after code throughout, exact verification commands with expected output, self-review sections include concrete hand-traced scenarios rather than "verify it works."
