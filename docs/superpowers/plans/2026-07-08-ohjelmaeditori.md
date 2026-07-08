# Ohjelmaeditori ja liikekirjasto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `SESS`/`SCHED` JavaScript constants (the entire training program) with an editable Supabase-backed data model and an accordion-style editor UI, while keeping every existing consumer of `SESS`/`SCHED` (hero rendering, day tabs, Koonti cards, session picker) working unchanged by populating those same variable names at runtime.

**Architecture:** Single-file static app (`index.html`, vanilla JS + Supabase JS client, no build step, no test framework). Three new Supabase tables (`exercises`, `program_sessions`, `program_session_exercises`) seeded from the current hardcoded program via a one-time migration. `SESS`/`SCHED` become `let` variables populated by a new `loadProgram()` call at app init instead of literal object constants. New editor UI added to the existing `page-ohjelma` page, reusing the app's existing modal/card/stab-bar CSS conventions. SortableJS (CDN) handles drag-reordering.

**Tech Stack:** HTML/CSS/vanilla JS, Supabase JS client v2, SortableJS 1.15.2 (new CDN dependency). No test runner — verification is manual, in a browser, using a local static server.

**Reference:** Design spec at `docs/superpowers/specs/2026-07-08-ohjelmaeditori-design.md`.

**How to manually test any task:** from the project root, run `python3 -m http.server 8080`, open `http://localhost:8080/index.html` in a browser, open the browser console (check for red errors after every interaction). Tasks that touch Supabase require the migration from Task 1 to have been run against the project's Supabase instance first (the migration file is provided; running it against the live database is a manual step you perform via the Supabase SQL editor or CLI before testing Task 3 onward).

---

### Task 1: Supabase migration — new tables + seed from current program

**Files:**
- Create: `supabase/migrations/20260708_ohjelmaeditori.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Liikekirjasto
create table exercises (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  muscle_group  text,
  created_at    timestamptz not null default now()
);

alter table exercises enable row level security;
create policy exercises_all on exercises
  for all to anon, authenticated using (true) with check (true);

-- Sessiotyypit (korvaa SESS/SCHED-vakiot)
create table program_sessions (
  id                text primary key,
  name              text not null,
  focus             text not null default '',
  default_weekdays  int[] not null default '{}',
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

alter table program_sessions enable row level security;
create policy program_sessions_all on program_sessions
  for all to anon, authenticated using (true) with check (true);

-- Session sisältämät liikkeet
create table program_session_exercises (
  id                   bigint generated always as identity primary key,
  program_session_id  text not null references program_sessions(id) on delete cascade,
  exercise_name        text not null,
  target_sets          int not null default 3,
  target_display        text not null default '3×10',
  sort_order           int not null default 0
);

alter table program_session_exercises enable row level security;
create policy program_session_exercises_all on program_session_exercises
  for all to anon, authenticated using (true) with check (true);

-- Seed: nykyinen ohjelma (index.html:1089-1132 olleesta SESS/SCHED-datasta)
insert into program_sessions (id, name, focus, default_weekdays, sort_order) values
  ('t1', 'Treeni 1 — Työntävät', 'Rinta, olkapäät, ojentajat', '{0}', 0),
  ('t2', 'Treeni 2 — Vetävät', 'Selkä, takaolkapäät, hauikset', '{2}', 1),
  ('t3', 'Treeni 3 — Hartiat + hauikset + ojentajat', 'Yläkehon viimeistely', '{3}', 2),
  ('t4', 'Treeni 4 — Power & Core', 'Lisätreeni energiselle päivälle', '{5}', 3),
  ('kiekko', 'Jääkiekko', 'Harrastejääkiekko + 10 000 askelta', '{1,6}', 4),
  ('juoksu', 'Juoksu / kävely', 'Hölkkä tai reipas kävely', '{4}', 5),
  ('lepo', 'Lepopäivä', 'Palautuminen', '{}', 6);

insert into exercises (name, muscle_group) values
  ('Rintapunnerruslaite', null), ('Kalteva rintaprässi laitteella', null),
  ('Pec Deck (rintalaite)', null), ('Vipunostot vapailla käsipainoilla', null),
  ('Dippilaite', null), ('Erikoisjalkaprässi 38°', null), ('Vatsarutistuslaite', null),
  ('Ylätaljalaite', null), ('Tuettu soutulaite (Verti)', null), ('Face pulls taljassa', null),
  ('Selänojennuslaite', null), ('Hauiskääntölaite', null), ('Reiden koukistuslaite', null),
  ('Jalannostot', null), ('Vipunostolaite sivuille', null), ('Reverse Pec Deck', null),
  ('Pystypunnerruslaite', null), ('Kaapeli ojentajat pään yli', null),
  ('Hauiskääntö Hammer käsipainoilla', null), ('Hauiskääntö kaapelilla', null),
  ('Vinot vatsarutistukset', null), ('Smith-kalteva penkki', null),
  ('Jalkaprässi (38°)', null), ('Ylätalja kapealla otteella', null),
  ('Rintapunnerruslaite (yksi käsi)', null), ('Lankku', null),
  ('Hyperextension-penkki mahallaan', null), ('Pohjenostot laitteessa', null);

insert into program_session_exercises (program_session_id, exercise_name, target_sets, target_display, sort_order) values
  ('t1', 'Rintapunnerruslaite', 3, '3×8', 0),
  ('t1', 'Kalteva rintaprässi laitteella', 3, '3×10', 1),
  ('t1', 'Pec Deck (rintalaite)', 3, '3×12', 2),
  ('t1', 'Vipunostot vapailla käsipainoilla', 3, '3×15', 3),
  ('t1', 'Dippilaite', 3, '3×12', 4),
  ('t1', 'Erikoisjalkaprässi 38°', 3, '3×10', 5),
  ('t1', 'Vatsarutistuslaite', 3, '3×15', 6),
  ('t2', 'Ylätaljalaite', 3, '3×10', 0),
  ('t2', 'Tuettu soutulaite (Verti)', 3, '3×10', 1),
  ('t2', 'Face pulls taljassa', 3, '3×15', 2),
  ('t2', 'Selänojennuslaite', 3, '3×15', 3),
  ('t2', 'Hauiskääntölaite', 3, '3×12', 4),
  ('t2', 'Reiden koukistuslaite', 3, '3×15', 5),
  ('t2', 'Jalannostot', 3, '3×15', 6),
  ('t3', 'Vipunostolaite sivuille', 4, '4×15', 0),
  ('t3', 'Reverse Pec Deck', 3, '3×15', 1),
  ('t3', 'Pystypunnerruslaite', 3, '3×10', 2),
  ('t3', 'Kaapeli ojentajat pään yli', 4, '4×12', 3),
  ('t3', 'Hauiskääntö Hammer käsipainoilla', 3, '3×12', 4),
  ('t3', 'Hauiskääntö kaapelilla', 3, '3×10', 5),
  ('t3', 'Vinot vatsarutistukset', 4, '4×15', 6),
  ('t4', 'Smith-kalteva penkki', 4, '4×8', 0),
  ('t4', 'Jalkaprässi (38°)', 4, '4×10', 1),
  ('t4', 'Ylätalja kapealla otteella', 3, '3×10', 2),
  ('t4', 'Rintapunnerruslaite (yksi käsi)', 3, '3×12', 3),
  ('t4', 'Vatsarutistuslaite', 3, '3×15', 4),
  ('t4', 'Lankku', 3, '3×45s', 5),
  ('t4', 'Hyperextension-penkki mahallaan', 3, '3×15', 6),
  ('t4', 'Pohjenostot laitteessa', 3, '3×15', 7);
```

- [ ] **Step 2: Run the migration against the Supabase project**

Open the Supabase project's SQL editor (or use `supabase db push` if using the CLI locally) and run the file above. Verify with:

```sql
select id, name, default_weekdays from program_sessions order by sort_order;
select count(*) from exercises;
select count(*) from program_session_exercises;
```

Expected: 7 rows in `program_sessions`, 28 rows in `exercises`, 29 rows in `program_session_exercises` (t1×7, t2×7, t3×7, t4×8).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260708_ohjelmaeditori.sql
git commit -m "feat: lisää ohjelmaeditorin taulut ja seed-data nykyisestä ohjelmasta"
```

---

### Task 2: Add SortableJS dependency

**Files:**
- Modify: `index.html:16-17`

- [ ] **Step 1: Add the CDN script tag**

Find:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
```

Replace with:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
```

- [ ] **Step 2: Manual test**

Open the app, open browser console, run `typeof Sortable` — expect `"function"`. Confirm no console errors on page load.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: lisää SortableJS-riippuvuus ohjelmaeditoria varten"
```

---

### Task 3: `loadProgram()` — populate SESS/SCHED from Supabase at runtime

**Files:**
- Modify: `index.html:1089-1132` (SESS/SCHED constants → `let` + `loadProgram()`)
- Modify: `index.html` INIT block (await `loadProgram()` before anything that depends on it)

- [ ] **Step 1: Replace the hardcoded SESS/SCHED constants**

Find the full block from `const SCHED = ...` through the closing `};` of `SESS` (index.html:1089-1132):

```js
const SCHED = { 0:'t1', 1:'kiekko', 2:'t2', 3:'t3', 4:'juoksu', 5:'t4', 6:'kiekko' };

const SESS = {
  t1: { name:'Treeni 1 — Työntävät', focus:'Rinta, olkapäät, ojentajat', ex:[
    { n:'Rintapunnerruslaite',        t:'3×8',  s:3 },
    { n:'Kalteva rintaprässi laitteella', t:'3×10', s:3 },
    { n:'Pec Deck (rintalaite)',      t:'3×12', s:3 },
    { n:'Vipunostot vapailla käsipainoilla', t:'3×15', s:3 },
    { n:'Dippilaite',                 t:'3×12', s:3 },
    { n:'Erikoisjalkaprässi 38°',     t:'3×10', s:3 },
    { n:'Vatsarutistuslaite',         t:'3×15', s:3 },
  ]},
  t2: { name:'Treeni 2 — Vetävät', focus:'Selkä, takaolkapäät, hauikset', ex:[
    { n:'Ylätaljalaite',                 t:'3×10', s:3 },
    { n:'Tuettu soutulaite (Verti)',     t:'3×10', s:3 },
    { n:'Face pulls taljassa',           t:'3×15', s:3 },
    { n:'Selänojennuslaite',             t:'3×15', s:3 },
    { n:'Hauiskääntölaite',              t:'3×12', s:3 },
    { n:'Reiden koukistuslaite',         t:'3×15', s:3 },
    { n:'Jalannostot',                   t:'3×15', s:3 },
  ]},
  t3: { name:'Treeni 3 — Hartiat + hauikset + ojentajat', focus:'Yläkehon viimeistely', ex:[
    { n:'Vipunostolaite sivuille',             t:'4×15', s:4 },
    { n:'Reverse Pec Deck',                    t:'3×15', s:3 },
    { n:'Pystypunnerruslaite',                 t:'3×10', s:3 },
    { n:'Kaapeli ojentajat pään yli',           t:'4×12', s:4 },
    { n:'Hauiskääntö Hammer käsipainoilla',    t:'3×12', s:3 },
    { n:'Hauiskääntö kaapelilla',               t:'3×10', s:3 },
    { n:'Vinot vatsarutistukset',               t:'4×15', s:4 },
  ]},
  t4: { name:'Treeni 4 — Power & Core', focus:'Lisätreeni energiselle päivälle', ex:[
    { n:'Smith-kalteva penkki',               t:'4×8',   s:4 },
    { n:'Jalkaprässi (38°)',               t:'4×10',  s:4 },
    { n:'Ylätalja kapealla otteella',      t:'3×10',  s:3 },
    { n:'Rintapunnerruslaite (yksi käsi)', t:'3×12',  s:3 },
    { n:'Vatsarutistuslaite',              t:'3×15',  s:3 },
    { n:'Lankku',                          t:'3×45s', s:3 },
    { n:'Hyperextension-penkki mahallaan', t:'3×15',  s:3 },
    { n:'Pohjenostot laitteessa',          t:'3×15',  s:3 },
  ]},
  kiekko: { name:'Jääkiekko',       focus:'Harrastejääkiekko + 10 000 askelta', ex:[] },
  juoksu: { name:'Juoksu / kävely', focus:'Hölkkä tai reipas kävely',           ex:[] },
  lepo:   { name:'Lepopäivä',       focus:'Palautuminen',                        ex:[] },
};
```

Replace with:

```js
let SCHED = {};
let SESS = {};
let programSessionsRaw = [];
let programSessionExercisesRaw = [];

async function loadProgram() {
  const [{ data: sessions }, { data: exercises }] = await Promise.all([
    sb.from('program_sessions').select('*').order('sort_order'),
    sb.from('program_session_exercises').select('*').order('sort_order'),
  ]);
  programSessionsRaw = sessions || [];
  programSessionExercisesRaw = exercises || [];

  const newSESS = {};
  programSessionsRaw.forEach(s => {
    newSESS[s.id] = { name: s.name, focus: s.focus || '', ex: [] };
  });
  programSessionExercisesRaw.forEach(e => {
    if (newSESS[e.program_session_id]) {
      newSESS[e.program_session_id].ex.push({
        n: e.exercise_name, t: e.target_display, s: e.target_sets, _id: e.id,
      });
    }
  });

  const newSCHED = {};
  programSessionsRaw.forEach(s => {
    (s.default_weekdays || []).forEach(d => { newSCHED[d] = s.id; });
  });

  SESS = newSESS;
  SCHED = newSCHED;
}
```

- [ ] **Step 2: Wrap INIT in an async function that awaits `loadProgram()` first**

Find (index.html, INIT block):

```js
['body-date','act-date','sleep-date'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.value = localIso(new Date());
});

migrateLD_v2();
migrateLD_v3();
loadKoonti();
```

Replace with:

```js
(async () => {
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  await loadProgram();
  migrateLD_v2();
  migrateLD_v3();
  loadKoonti();
})();
```

(`migrateLD_v2()` reads `SCHED[Number(d)]` as a fallback — it must run after `loadProgram()` populates `SCHED`.)

- [ ] **Step 3: Manual test**

**Requires Task 1's migration to have been run against Supabase first.** Open the app. Koonti should load exactly as before (same Sali card text, same streak numbers). Open Sali — hero section, week nav, day tabs, session content should look identical to before this change (data now comes from Supabase instead of the hardcoded constant, but it's the same data). Confirm no console errors. If you see a blank/broken Sali page, check the browser console for a Supabase error — most likely the migration wasn't run yet.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: lataa SESS/SCHED Supabasesta loadProgram()-funktiolla"
```

---

### Task 4: Generalize hardcoded session-key assumptions

**Files:**
- Modify: `index.html` (`renderTreeni()` day-tabs loop, `loadKoonti()` Sali card, `renderSession()`)

- [ ] **Step 1: Fix day-tabs loop — generalize `isSali` and guard undefined session**

Find (in `renderTreeni()`):

```js
  DAYS.forEach((lb, i) => {
    const ist = getActiveSession(wOff, i), isSali = ['t1','t2','t3','t4'].includes(ist);
    const btn = document.createElement('button');
    btn.className = 'day-tab';
    if (i === aDay)                btn.classList.add('active');
    else if (isDone(wOff, i, ist)) btn.classList.add('done');
    else if (!isSali)              btn.classList.add('rest');
    btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    const dotDone    = isDone(wOff, i, ist);
    const dotStarted = isStarted(wOff, i, ist);
    const dotCls     = dotDone ? 'done' : dotStarted ? 'active' : '';
    const dotHtml    = dotCls ? `<div class="day-state-dot ${dotCls}"></div>` : '';
    btn.innerHTML = `<span>${lb}</span><span style="font-size:9px;opacity:.6">${ist.toUpperCase()}</span>${dotHtml}`;
    btn.onclick = () => { aDay = i; renderTreeni(); };
```

Replace with:

```js
  DAYS.forEach((lb, i) => {
    const ist = getActiveSession(wOff, i);
    const hasEx = ist && SESS[ist] && SESS[ist].ex && SESS[ist].ex.length > 0;
    const btn = document.createElement('button');
    btn.className = 'day-tab';
    if (i === aDay)                btn.classList.add('active');
    else if (isDone(wOff, i, ist)) btn.classList.add('done');
    else if (!hasEx)                btn.classList.add('rest');
    btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    const dotDone    = isDone(wOff, i, ist);
    const dotStarted = isStarted(wOff, i, ist);
    const dotCls     = dotDone ? 'done' : dotStarted ? 'active' : '';
    const dotHtml    = dotCls ? `<div class="day-state-dot ${dotCls}"></div>` : '';
    const shortLabel = ist ? ist.toUpperCase() : '—';
    btn.innerHTML = `<span>${lb}</span><span style="font-size:9px;opacity:.6">${shortLabel}</span>${dotHtml}`;
    btn.onclick = () => { aDay = i; renderTreeni(); };
```

- [ ] **Step 2: Fix Koonti's Sali card — generalize `isSaliDay` and guard undefined session**

Find (in `loadKoonti()`):

```js
  } else {
    kcSaliCard.classList.remove('koonti-card--done');
    const st = SCHED[(new Date().getDay() + 6) % 7];
    const isSaliDay = ['t1','t2','t3','t4'].includes(st);
    kcSaliSub.textContent = isSaliDay
      ? `Ei vielä · ${SESS[st].name}`
      : 'Ei salipäivä tänään';
  }
```

Replace with:

```js
  } else {
    kcSaliCard.classList.remove('koonti-card--done');
    const st = SCHED[(new Date().getDay() + 6) % 7];
    const hasEx = st && SESS[st] && SESS[st].ex && SESS[st].ex.length > 0;
    kcSaliSub.textContent = hasEx
      ? `Ei vielä · ${SESS[st].name}`
      : (st ? 'Ei salipäivä tänään' : 'Ei ohjelmoitua sessiota tänään');
  }
```

- [ ] **Step 3: Replace `SESSION_LABELS` with a dynamic session picker + generalize the rest-day fallback**

Find:

```js
const SESSION_LABELS = {
  t1:'T1 Työntävät', t2:'T2 Vetävät', t3:'T3 Hartiat',
  t4:'T4 Power', kiekko:'Jääkiekko', juoksu:'Juoksu', lepo:'Lepo',
};

async function renderSession() {
  const st = getActiveSession(wOff, aDay), sess = SESS[st];
  const el = document.getElementById('session-content');

  // Session type picker
  let html = `<div class="card" style="margin-bottom:8px">
    <div class="card-title">Päivän tyyppi</div>
    <div class="sess-picker">`;
  Object.entries(SESSION_LABELS).forEach(([key, lbl]) => {
    const active = key === st;
    html += `<button onclick="setActiveSession(${wOff},${aDay},'${key}')"
      class="sess-btn${active ? ' active' : ''}">
      ${lbl}</button>`;
  });
  html += `</div></div>`;

  // Rest / activity day (no exercises)
  if (!sess || !sess.ex || !sess.ex.length) {
    const isRest = ['kiekko','juoksu','lepo'].includes(st);
    el.innerHTML = html + (isRest ? `<div class="card rest-card">
      <div class="sess-name" style="margin-bottom:6px">${sess ? sess.name : '—'}</div>
      <div class="sess-focus">${sess ? sess.focus : ''}</div>
    </div>` : '');
    return;
  }
```

Replace with:

```js
async function renderSession() {
  const st = getActiveSession(wOff, aDay), sess = SESS[st];
  const el = document.getElementById('session-content');

  // Session type picker
  let html = `<div class="card" style="margin-bottom:8px">
    <div class="card-title">Päivän tyyppi</div>
    <div class="sess-picker">`;
  Object.entries(SESS).forEach(([key, s]) => {
    const active = key === st;
    html += `<button onclick="setActiveSession(${wOff},${aDay},'${key}')"
      class="sess-btn${active ? ' active' : ''}">
      ${s.name}</button>`;
  });
  html += `</div></div>`;

  // Rest / activity day (no exercises)
  if (!sess || !sess.ex || !sess.ex.length) {
    el.innerHTML = html + `<div class="card rest-card">
      <div class="sess-name" style="margin-bottom:6px">${sess ? sess.name : 'Ei ohjelmoitua sessiota'}</div>
      <div class="sess-focus">${sess ? sess.focus : ''}</div>
    </div>`;
    return;
  }
```

(The `isRest` check is gone — since we're already inside the `!sess.ex.length` branch, showing the rest-card is always correct there, regardless of the session's key.)

- [ ] **Step 4: Manual test**

Open Sali. Day tabs should render correctly for every day (no `undefined` labels, no console errors). Open a day and check "Päivän tyyppi" picker — it should list all 7 seeded sessions by name (not the old hardcoded short labels). Select "Jääkiekko" or "Lepopäivä" — should show the rest-card with name/focus, not a blank area. Select "Treeni 1" — should show the exercise list as before. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: yleistä sessiotyyppien käsittely SESSION_LABELS-vakion sijaan"
```

---

### Task 5: Editor CSS

**Files:**
- Modify: `index.html` (inside `<style>`, after the `.koonti-card--ruoka` rule added in the dashboard-navigation work, and after `.food-search-custom-link` for the ex-search-* rules)

- [ ] **Step 1: Add session-list/accordion CSS**

Find:

```css
.koonti-card--ruoka { display: flex; align-items: center; justify-content: space-between; }
```

Insert immediately after it:

```css

/* ─── Ohjelmaeditori ─────────────────────────────────────────── */
.ohj-header { display:flex; align-items:center; justify-content:space-between; padding:2px 2px 14px; }
.ohj-add-btn { font-size:14px; font-weight:600; color:var(--accent); background:none; border:none; cursor:pointer; }

.sess-card { background:var(--surface); border-radius:var(--radius-lg); margin-bottom:10px; overflow:hidden; }
.sess-card-row { display:flex; align-items:center; gap:12px; padding:14px; cursor:pointer; }
.sess-drag-handle { color:var(--text3); font-size:18px; letter-spacing:2px; cursor:grab; }
.sess-card-info { flex:1; }
.sess-card-name { font-size:15px; font-weight:600; }
.sess-card-meta { font-size:12px; color:var(--text3); margin-top:2px; }
.sess-card-chev { color:var(--text3); font-size:16px; transition:transform var(--t); }
.sess-card-chev.open { transform:rotate(90deg); color:var(--accent); }

.sess-expand { border-top:1px solid var(--border2); padding:14px; }
.sess-field-label { font-size:11px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
.sess-name-input { font-size:14px; font-weight:600; margin-bottom:6px; width:100%; box-sizing:border-box; }
.sess-focus-input { font-size:13px; width:100%; box-sizing:border-box; }

.weekday-picker { display:flex; gap:6px; margin-top:8px; }
.wd-btn {
  width:34px; height:34px; border-radius:50%; background:var(--surface2); border:none;
  display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600;
  color:var(--text3); cursor:pointer;
}
.wd-btn.on { background:var(--accent); color:#fff; }

.sess-ex-row { display:flex; align-items:center; gap:10px; background:var(--surface2); border-radius:12px; padding:10px 12px; margin-bottom:6px; }
.sess-ex-drag { color:var(--text3); font-size:16px; cursor:grab; }
.sess-ex-info { flex:1; cursor:pointer; }
.sess-ex-name { font-size:13.5px; font-weight:600; }
.sess-ex-target { font-size:11.5px; color:var(--text3); margin-top:2px; }
.sess-ex-remove { color:var(--red); font-size:16px; background:none; border:none; cursor:pointer; }

.sess-add-ex-btn {
  width:100%; padding:11px; border-radius:12px; background:var(--accent-bg);
  border:1px dashed rgba(10,132,255,0.4); color:var(--accent); font-size:13.5px; font-weight:600;
  text-align:center; cursor:pointer; margin-top:4px;
}
.sess-delete-btn {
  width:100%; padding:10px; margin-top:14px; border-radius:12px; background:var(--red-bg);
  color:var(--red); font-size:13px; font-weight:600; text-align:center; cursor:pointer; border:none;
}

.ex-target-edit { display:flex; gap:6px; }
.ex-target-edit input { padding:6px 8px; font-size:12px; }
```

- [ ] **Step 2: Add exercise-search CSS (mirrors `.food-search-*`, separate classes so food search is untouched)**

Find:

```css
.food-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; }
```

Insert immediately after it:

```css
.ex-search-section-label {
  font-size:11px; font-weight:600; color:var(--text3); text-transform:uppercase;
  letter-spacing:.06em; margin:4px 0 8px;
}
.ex-search-result-row {
  display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border2);
  font-size:13px; color:var(--text); cursor:pointer;
}
.ex-search-result-muscle { color: var(--text3); font-size:11px; }
.ex-search-empty { color: var(--text3); font-size:13px; text-align:center; padding:20px 0; }
.ex-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; padding:10px 0; }
.ex-muscle-filter { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
.ex-muscle-filter .stab { flex:none; padding:5px 12px; }
```

- [ ] **Step 3: Manual test**

Open the app, confirm no visual regressions anywhere (this task only adds unused CSS classes). Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "style: lisää ohjelmaeditorin ja liikehaun CSS"
```

---

### Task 6: Exercise picker modal (HTML + search/create logic)

**Files:**
- Modify: `index.html` (add modal HTML before `</body>`, add JS functions near the food-search functions)

- [ ] **Step 1: Add the modal HTML**

Find the end of the existing food-search modal, right before `</body>`:

```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>

  </div>
</div>
</body>
</html>
```

Replace with:

```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>

  </div>
</div>

<div id="exercise-picker-modal" class="ex-modal-overlay" style="display:none">
  <div class="ex-modal-header">
    <div class="ex-modal-nav">
      <button class="ex-modal-back" onclick="closeExercisePicker()">← Peruuta</button>
    </div>
    <div class="ex-modal-title">Lisää liike</div>
  </div>
  <div class="ex-modal-body">
    <input type="text" id="ex-search-input" placeholder="Hae liikettä..."
           oninput="onExerciseSearchInput()" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
    <div class="ex-muscle-filter" id="ex-muscle-filter">
      <button class="stab active" onclick="setExerciseMuscleFilter('', this)">Kaikki</button>
      <button class="stab" onclick="setExerciseMuscleFilter('rinta', this)">Rinta</button>
      <button class="stab" onclick="setExerciseMuscleFilter('selka', this)">Selkä</button>
      <button class="stab" onclick="setExerciseMuscleFilter('jalat', this)">Jalat</button>
      <button class="stab" onclick="setExerciseMuscleFilter('hartiat', this)">Hartiat</button>
      <button class="stab" onclick="setExerciseMuscleFilter('kasivarret', this)">Käsivarret</button>
      <button class="stab" onclick="setExerciseMuscleFilter('vatsa', this)">Vatsa</button>
    </div>
    <div id="ex-search-results"></div>
  </div>
</div>
</body>
</html>
```

- [ ] **Step 2: Add the JS functions**

Find `function closeFoodSearch() {` and insert a new block immediately **before** it:

```js
let exercisePickerSessionId = null;
let exerciseLibraryCache = null;
let exerciseSearchDebounce = null;
let exerciseMuscleFilter = '';

async function loadExerciseLibrary() {
  if (exerciseLibraryCache) return exerciseLibraryCache;
  const { data } = await sb.from('exercises').select('*').order('name');
  exerciseLibraryCache = data || [];
  return exerciseLibraryCache;
}

function renderExerciseResults(items) {
  const el = document.getElementById('ex-search-results');
  const q = document.getElementById('ex-search-input').value.trim();
  const exactMatch = items.some(i => i.name.toLowerCase() === q.toLowerCase());
  let html = '';
  if (!items.length) {
    html += `<div class="ex-search-empty">Ei tuloksia</div>`;
  } else {
    html += items.map(item => `
      <div class="ex-search-result-row" onclick="selectExerciseFromLibrary(${item.id})">
        <span>${item.name}</span>
        <span class="ex-search-result-muscle">${item.muscle_group || ''}</span>
      </div>`).join('');
  }
  if (q.length >= 2 && !exactMatch) {
    html += `<div class="ex-search-custom-link" onclick="createNewExerciseAndAdd('${q.replace(/'/g, "\\'")}')">+ Lisää uusi liike "${q}"</div>`;
  }
  el.innerHTML = html;
}

async function runExerciseSearch() {
  const q = document.getElementById('ex-search-input').value.trim().toLowerCase();
  const all = await loadExerciseLibrary();
  const filtered = all.filter(e => {
    const matchesQuery = !q || e.name.toLowerCase().includes(q);
    const matchesMuscle = !exerciseMuscleFilter || e.muscle_group === exerciseMuscleFilter;
    return matchesQuery && matchesMuscle;
  });
  renderExerciseResults(filtered);
}

function onExerciseSearchInput() {
  clearTimeout(exerciseSearchDebounce);
  exerciseSearchDebounce = setTimeout(runExerciseSearch, 200);
}

function setExerciseMuscleFilter(muscle, btn) {
  exerciseMuscleFilter = muscle;
  document.querySelectorAll('#ex-muscle-filter .stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  runExerciseSearch();
}

async function openExercisePicker(sessionId) {
  exercisePickerSessionId = sessionId;
  exerciseMuscleFilter = '';
  document.getElementById('ex-search-input').value = '';
  document.querySelectorAll('#ex-muscle-filter .stab').forEach(b => b.classList.remove('active'));
  document.querySelector('#ex-muscle-filter .stab').classList.add('active');
  document.getElementById('exercise-picker-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  exerciseLibraryCache = null;
  await runExerciseSearch();
}

function closeExercisePicker() {
  document.getElementById('exercise-picker-modal').style.display = 'none';
  document.body.style.overflow = '';
}

async function addExerciseToCurrentSession(exerciseName) {
  const existing = programSessionExercisesRaw.filter(e => e.program_session_id === exercisePickerSessionId);
  const nextOrder = existing.length ? Math.max(...existing.map(e => e.sort_order)) + 1 : 0;
  const { error } = await sb.from('program_session_exercises').insert({
    program_session_id: exercisePickerSessionId,
    exercise_name: exerciseName,
    target_sets: 3,
    target_display: '3×10',
    sort_order: nextOrder,
  });
  if (error) { console.error('addExerciseToCurrentSession failed:', error.message); return; }
  closeExercisePicker();
  await loadProgram();
  renderOhjelma();
}

async function selectExerciseFromLibrary(exerciseId) {
  const ex = exerciseLibraryCache.find(e => e.id === exerciseId);
  if (ex) await addExerciseToCurrentSession(ex.name);
}

async function createNewExerciseAndAdd(name) {
  const { data, error } = await sb.from('exercises')
    .insert({ name, muscle_group: exerciseMuscleFilter || null })
    .select().single();
  if (error) { console.error('createNewExerciseAndAdd failed:', error.message); return; }
  exerciseLibraryCache = null;
  await addExerciseToCurrentSession(data.name);
}

```

- [ ] **Step 3: Manual test**

Open Ohjelma (Valikko → Ohjelma). This task doesn't wire the picker into the UI yet (that's Task 7) — verify only that there are no console errors on page load, and manually smoke-test in the console: `openExercisePicker('t1')` should open the modal and show the exercise list; typing in the search box should filter; clicking "Kaikki"/"Rinta" etc. should filter by muscle group (all `null` right now since seed data has no muscle groups, so the filter buttons will show empty results except "Kaikki" — expected until muscle groups are assigned manually or via new exercises).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: lisää liikekirjaston hakumodaali"
```

---

### Task 7: Ohjelma-editori — sessiolista, accordion, CRUD, SortableJS

**Files:**
- Modify: `index.html` (replace `renderOhjelma()`, add supporting functions)

- [ ] **Step 1: Replace `renderOhjelma()` with the new editor**

Find the full function:

```js
function renderOhjelma(selected) {
  const saliKeys = ['t1','t2','t3','t4'];
  const defaultKey = saliKeys.includes(SCHED[aDay]) ? SCHED[aDay] : 't1';
  const key  = selected || defaultKey;
  const sess = SESS[key];
  const el   = document.getElementById('ohjelma-content');

  let html = `<div class="card" style="margin-bottom:8px">
    <div class="card-title">Harjoitus</div>
    <select onchange="renderOhjelma(this.value)" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);padding:8px 11px;font-size:14px;outline:none;">`;
  saliKeys.forEach(k => {
    html += `<option value="${k}" ${k === key ? 'selected' : ''}>${SESS[k].name}</option>`;
  });
  html += `</select></div>`;

  html += `<div class="card">
    <div style="font-size:16px;font-weight:600;margin-bottom:4px">${sess.name}</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:16px">${sess.focus}</div>`;

  sess.ex.forEach((ex, i) => {
    html += `<div class="hist-item">
      <div class="hist-label">${i + 1}. ${ex.n}</div>
      <div class="hist-val" style="font-size:13px">${ex.t}</div>
    </div>`;
  });

  html += `</div>`;
  el.innerHTML = html;
}
```

Replace with:

```js
let ohjelmaExpandedId = null;

function renderOhjelma() {
  const el = document.getElementById('ohjelma-content');
  const sessions = [...programSessionsRaw].sort((a, b) => a.sort_order - b.sort_order);

  let html = `<div class="ohj-header">
    <span></span>
    <button class="ohj-add-btn" onclick="addNewProgramSession()">+ Uusi sessio</button>
  </div>
  <div id="sess-list">`;

  sessions.forEach(s => {
    const exCount = SESS[s.id] ? SESS[s.id].ex.length : 0;
    const dayLabels = (s.default_weekdays || []).map(d => DAYS[d]).join(', ') || '—';
    const isOpen = s.id === ohjelmaExpandedId;
    html += `<div class="sess-card" data-session-id="${s.id}">
      <div class="sess-card-row" onclick="toggleSessionExpand('${s.id}')">
        <span class="sess-drag-handle">⠿</span>
        <div class="sess-card-info">
          <div class="sess-card-name">${s.name}</div>
          <div class="sess-card-meta">${exCount} liikettä · ${dayLabels}</div>
        </div>
        <span class="sess-card-chev${isOpen ? ' open' : ''}">›</span>
      </div>`;
    if (isOpen) html += renderSessionExpand(s);
    html += `</div>`;
  });

  html += `</div>`;
  el.innerHTML = html;

  new Sortable(document.getElementById('sess-list'), {
    handle: '.sess-drag-handle',
    animation: 150,
    onEnd: async () => {
      const ids = [...document.getElementById('sess-list').children].map(c => c.dataset.sessionId);
      await Promise.all(ids.map((id, i) => sb.from('program_sessions').update({ sort_order: i }).eq('id', id)));
      await loadProgram();
      renderOhjelma();
    },
  });

  if (ohjelmaExpandedId) {
    const exList = document.getElementById(`ex-list-${ohjelmaExpandedId}`);
    if (exList) {
      new Sortable(exList, {
        handle: '.sess-ex-drag',
        animation: 150,
        onEnd: async () => {
          const ids = [...exList.children].map(c => Number(c.dataset.exId));
          await Promise.all(ids.map((id, i) => sb.from('program_session_exercises').update({ sort_order: i }).eq('id', id)));
          await loadProgram();
          renderOhjelma();
        },
      });
    }
  }
}

function renderSessionExpand(s) {
  const ex = SESS[s.id] ? SESS[s.id].ex : [];
  let html = `<div class="sess-expand">
    <div class="sess-field-label">Nimi ja kuvaus</div>
    <input type="text" class="sess-name-input" value="${s.name}" onblur="saveSessionField('${s.id}','name',this.value)">
    <input type="text" class="sess-focus-input" value="${s.focus || ''}" onblur="saveSessionField('${s.id}','focus',this.value)">

    <div class="sess-field-label" style="margin-top:14px">Viikonpäivät</div>
    <div class="weekday-picker">`;
  DAYS.forEach((lb, i) => {
    const on = (s.default_weekdays || []).includes(i);
    html += `<button class="wd-btn${on ? ' on' : ''}" onclick="toggleSessionWeekday('${s.id}',${i})">${lb}</button>`;
  });
  html += `</div>

    <div class="sess-field-label" style="margin-top:14px">Liikkeet</div>
    <div id="ex-list-${s.id}">`;
  ex.forEach(e => {
    html += `<div class="sess-ex-row" data-ex-id="${e._id}">
      <span class="sess-ex-drag">⠿</span>
      <div class="sess-ex-info" onclick="editExerciseTarget(${e._id},'${e.n.replace(/'/g, "\\'")}',${e.s},'${e.t}')">
        <div class="sess-ex-name">${e.n}</div>
        <div class="sess-ex-target" id="ex-target-${e._id}">${e.t}</div>
      </div>
      <button class="sess-ex-remove" onclick="removeExerciseFromSession(${e._id})">✕</button>
    </div>`;
  });
  html += `</div>
    <div class="sess-add-ex-btn" onclick="openExercisePicker('${s.id}')">+ Lisää liike</div>
    <button class="sess-delete-btn" onclick="deleteProgramSession('${s.id}')">Poista sessio</button>
  </div>`;
  return html;
}

function toggleSessionExpand(id) {
  ohjelmaExpandedId = ohjelmaExpandedId === id ? null : id;
  renderOhjelma();
}

async function saveSessionField(id, field, value) {
  const { error } = await sb.from('program_sessions').update({ [field]: value }).eq('id', id);
  if (error) { console.error('saveSessionField failed:', error.message); return; }
  await loadProgram();
}

async function toggleSessionWeekday(id, dayIndex) {
  const s = programSessionsRaw.find(r => r.id === id);
  if (!s) return;
  const days = new Set(s.default_weekdays || []);
  if (days.has(dayIndex)) days.delete(dayIndex); else days.add(dayIndex);
  const { error } = await sb.from('program_sessions')
    .update({ default_weekdays: [...days].sort((a, b) => a - b) }).eq('id', id);
  if (error) { console.error('toggleSessionWeekday failed:', error.message); return; }
  await loadProgram();
  renderOhjelma();
}

function slugify(name) {
  const map = { ä:'a', ö:'o', å:'a', Ä:'a', Ö:'o', Å:'a' };
  const base = name.trim().toLowerCase()
    .replace(/[äöåÄÖÅ]/g, c => map[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'sessio';
}

async function addNewProgramSession() {
  let slug = slugify('Uusi sessio');
  let n = 1;
  while (programSessionsRaw.some(s => s.id === slug)) { n++; slug = `${slugify('Uusi sessio')}-${n}`; }
  const nextOrder = programSessionsRaw.length
    ? Math.max(...programSessionsRaw.map(s => s.sort_order)) + 1 : 0;
  const { error } = await sb.from('program_sessions').insert({
    id: slug, name: 'Uusi sessio', focus: '', default_weekdays: [], sort_order: nextOrder,
  });
  if (error) { console.error('addNewProgramSession failed:', error.message); return; }
  await loadProgram();
  ohjelmaExpandedId = slug;
  renderOhjelma();
}

async function deleteProgramSession(id) {
  const { error } = await sb.from('program_sessions').delete().eq('id', id);
  if (error) { console.error('deleteProgramSession failed:', error.message); return; }
  ohjelmaExpandedId = null;
  await loadProgram();
  renderOhjelma();
}

async function removeExerciseFromSession(exId) {
  const { error } = await sb.from('program_session_exercises').delete().eq('id', exId);
  if (error) { console.error('removeExerciseFromSession failed:', error.message); return; }
  await loadProgram();
  renderOhjelma();
}

function editExerciseTarget(exId, name, currentSets, currentDisplay) {
  const el = document.getElementById(`ex-target-${exId}`);
  el.innerHTML = `<div class="ex-target-edit">
    <input type="text" inputmode="numeric" value="${currentSets}" style="width:40px" id="ex-target-sets-${exId}">
    <input type="text" value="${currentDisplay}" style="width:70px" id="ex-target-display-${exId}">
  </div>`;
  const saveIt = () => saveExerciseTarget(exId);
  document.getElementById(`ex-target-sets-${exId}`).onblur = saveIt;
  document.getElementById(`ex-target-display-${exId}`).onblur = saveIt;
  document.getElementById(`ex-target-sets-${exId}`).focus();
}

async function saveExerciseTarget(exId) {
  const setsEl = document.getElementById(`ex-target-sets-${exId}`);
  const dispEl = document.getElementById(`ex-target-display-${exId}`);
  if (!setsEl || !dispEl) return;
  const target_sets = parseInt(setsEl.value, 10) || 1;
  const target_display = dispEl.value.trim() || `${target_sets}×10`;
  const { error } = await sb.from('program_session_exercises')
    .update({ target_sets, target_display }).eq('id', exId);
  if (error) { console.error('saveExerciseTarget failed:', error.message); return; }
  await loadProgram();
  renderOhjelma();
}
```

- [ ] **Step 2: Manual test**

Open Ohjelma page. All 7 seeded sessions appear as collapsed cards with correct liike-määrä/viikonpäivä-teksti. Tap a card — it expands in place, others stay collapsed. Edit the name field and click elsewhere — refresh the page, confirm the new name persisted. Toggle a weekday chip — confirm it saves (refresh, check). Click "+ Lisää liike" — exercise picker opens; search and pick an exercise — it appears in the list. Tap an exercise's target text — two small inputs appear; change values and blur — confirm it saves. Click the ✕ on an exercise — confirm it's removed. Drag the ⠿ handle on a session card to reorder — confirm order persists after reload. Click "+ Uusi sessio" — a new "Uusi sessio" card appears, already expanded — rename it, add weekdays, add exercises. Click "Poista sessio" on it — confirm it disappears and doesn't affect other sessions.

Then verify the rest of the app still works with the new session: go to Koonti, go to Sali, change to a day mapped to your new/edited session, confirm the hero and day-tabs render it correctly.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: toteuta ohjelmaeditorin accordion-UI, CRUD ja raahausjärjestys"
```

---

### Task 8: Full manual QA pass

**Files:** none (verification only)

- [ ] **Step 1: Run through the design spec's testing checklist**

(`docs/superpowers/specs/2026-07-08-ohjelmaeditori-design.md`, section 4)

1. App boots, Sali/Koonti show the exact same program as before the change (seeded data matches old hardcoded data).
2. New session creation, naming, weekday selection, exercise add-from-library, and new-exercise-creation all work and persist across reload.
3. Reordering sessions and reordering exercises within a session both persist across reload.
4. Deleting a session removes its exercises (cascade) but does not affect existing `workout_sets`/`workout_sessions` history — verify by checking a past logged set for a deleted session's exercise still shows correctly in Sali's "Kehitys" tab charts.
5. A weekday with no session assigned shows "Ei ohjelmoitua sessiota" and does not crash the day-tabs or hero section.
6. Existing set-logging (`set-table`), 1RM charts, and Watch sync still work unchanged.

- [ ] **Step 2: Grep for leftover hardcoded assumptions**

```bash
grep -n "SESSION_LABELS\|\['t1','t2','t3','t4'\]" index.html
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "v1.6.0: ohjelmaeditori ja liikekirjasto"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec §1 (datamalli + migraatio), Task 3 covers spec §2 (ajonaikainen integrointi), Tasks 5-7 cover spec §3 (editori-UI, SortableJS, hakuarkki), Task 8 covers spec §4 (testaus).
- **Placeholder scan:** no TBD/TODO; every step has literal before/after code.
- **Type/id consistency:** `program_sessions.id` (text slug) used consistently as `SESS`/`SCHED` keys, `program_session_exercises.id` used consistently as `_id` on `SESS[x].ex[]` entries and as `data-ex-id`/`ex-target-*` DOM ids. `exercisePickerSessionId` set in `openExercisePicker` and consumed in `addExerciseToCurrentSession` — consistent across Task 6 and Task 7 (picker is opened from `renderSessionExpand`'s "+ Lisää liike" button with the session id).
- **Known follow-up (not in this plan):** muscle-group tagging for the 28 seeded exercises is left `null` — the app remains fully functional, but the "Kaikki" filter is the only one that will show results until exercises are tagged manually through the picker's future edit UI or directly in Supabase. Acceptable per the design's YAGNI stance; not worth a task on its own here.
