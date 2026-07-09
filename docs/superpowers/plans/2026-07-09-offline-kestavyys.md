# Offline-kestävyys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rakenna geneerinen offline-kirjoitusjono (`sbWrite()` + `localStorage`-jono + banneri) ja siirrä kaikki 25 "kirjoita ja unohda" -tyyppistä Supabase-kirjoitusta käyttämään sitä, jotta yhteyskatko ei enää hukkaa dataa.

**Architecture:** Yksi geneerinen `sbWrite({table, op, payload, eq, opts})` -wrapper korvaa suorat `sb.from(...)`-kutsut. Wrapper yrittää kirjoituksen normaalisti; jos se epäonnistuu verkkovirheeltä näyttävästä syystä (`looksOffline()`), kirjoitus tallennetaan `localStorage`-jonoon (`sbOfflineQueue`) ja funktio palauttaa `{error: null}` — kutsuvan koodin olemassa oleva `if (error) {...}`-logiikka toimii siis muuttumattomana. Jono tyhjennetään (`flushQueue()`) `online`-eventistä ja sovelluksen käynnistyessä, FIFO-järjestyksessä, max 5 yritystä per alkio. Pysyvä banneri näyttää jonon tilan.

**Tech Stack:** Vanilla JS, `localStorage`, `navigator.onLine`, Supabase JS v2. Ei uusia riippuvuuksia.

---

### Task 1: Ydininfrastruktuuri — sbWrite, jono, banneri

**Files:**
- Modify: `index.html` (uusi CSS-lohko bannerille, uusi HTML-elementti bodyn alkuun, uusi JS-lohko apufunktioille, käynnistys-IIFE:n muutos)

**Konteksti ennen muutosta** — CSS, heti `#rest-timer`-lohkon jälkeen (`grep -n "rest-timer-count" index.html` löytää tämän):

```css
#rest-timer-count {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  min-width: 36px;
  text-align: center;
```

- [ ] **Step 1: Lisää bannerin CSS**

Etsi `/* ─── Rest timer ─────────────────────────────────────────── */`-kommentin yläpuolelta rivi `background: rgba(0,0,0,0.6);\n}` (modaalitaustan sulkeva rivi juuri ennen Rest timer -kommenttia), ja lisää sen jälkeen, ennen `/* ─── Rest timer ─────────────────────────────────────────── */`-riviä, uusi lohko:

```css
/* ─── Offline-banneri ───────────────────────────────────────── */
#offline-banner {
  display: none;
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--amber-bg);
  color: var(--amber);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  text-align: center;
  border-bottom: 1px solid var(--amber);
}
```

- [ ] **Step 2: Lisää bannerin HTML bodyn alkuun**

Konteksti ennen muutosta — `index.html` heti `<body>`-tagin jälkeen:

```html
<body>

<nav>
```

Korvaa:

```html
<body>

<div id="offline-banner"><span id="offline-banner-text"></span></div>

<nav>
```

- [ ] **Step 3: Lisää sbWrite/jono/banneri-apufunktiot**

Etsi käynnistys-IIFE (`grep -n "^(async () => {" index.html` löytää sen, rivi 4380). Lisää heti sitä edeltävä rivi (IIFE:n yläpuolelle, ennen `(async () => {`) uusi lohko:

```js
/* ═══════════════════════════════════════════════════════════════
   OFFLINE-KIRJOITUSJONO
═══════════════════════════════════════════════════════════════ */
const OFFLINE_QUEUE_KEY = 'sbOfflineQueue';
const MAX_RETRY_ATTEMPTS = 5;

function looksOffline(error) {
  if (!navigator.onLine) return true;
  const msg = ((error && error.message) || '').toLowerCase();
  const looksNetworky = msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed');
  const hasPostgrestCode = error && typeof error.code === 'string' && error.code.length > 0;
  return looksNetworky && !hasPostgrestCode;
}

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function persistQueue(q) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  updateOfflineBanner(q);
}

function updateOfflineBanner(queue) {
  const banner = document.getElementById('offline-banner');
  const text = document.getElementById('offline-banner-text');
  if (!banner || !text) return;
  if (queue.length === 0) { banner.style.display = 'none'; return; }
  const stuck = queue.filter(e => e.attempts >= MAX_RETRY_ATTEMPTS).length;
  const pending = queue.length - stuck;
  let msg = '';
  if (pending > 0) msg += `${pending} tallennusta odottaa synkronointia`;
  if (stuck > 0) msg += (msg ? ' · ' : '') + `${stuck} jumissa (yritä myöhemmin uudelleen)`;
  text.textContent = msg;
  banner.style.display = 'block';
}

function enqueueWrite(entry) {
  const q = loadQueue();
  q.push({ ...entry, id: Date.now() + '-' + Math.random().toString(36).slice(2), attempts: 0, ts: Date.now() });
  persistQueue(q);
}

async function sbWrite({ table, op, payload, eq, opts }) {
  try {
    let q = sb.from(table);
    if (op === 'insert') q = q.insert(payload);
    else if (op === 'upsert') q = q.upsert(payload, opts);
    else if (op === 'update') q = q.update(payload).eq(eq.column, eq.value);
    else if (op === 'delete') q = q.delete().eq(eq.column, eq.value);
    const { error } = await q;
    if (error) {
      if (looksOffline(error)) { enqueueWrite({ table, op, payload, eq, opts }); return { error: null }; }
      return { error };
    }
    return { error: null };
  } catch (e) {
    if (looksOffline(e)) { enqueueWrite({ table, op, payload, eq, opts }); return { error: null }; }
    return { error: e };
  }
}

async function flushQueue() {
  let q = loadQueue();
  if (q.length === 0) return;
  const remaining = [];
  for (let i = 0; i < q.length; i++) {
    const entry = q[i];
    if (entry.attempts >= MAX_RETRY_ATTEMPTS) { remaining.push(entry); continue; }
    const { error } = await sbWrite(entry);
    if (error) {
      entry.attempts += 1;
      remaining.push(entry);
      if (!navigator.onLine) {
        remaining.push(...q.slice(i + 1));
        break;
      }
    }
  }
  persistQueue(remaining);
}

window.addEventListener('online', flushQueue);

```

- [ ] **Step 4: Kutsu updateOfflineBanner ja flushQueue sovelluksen käynnistyessä**

Konteksti ennen muutosta — käynnistys-IIFE:

```js
(async () => {
  renderIcons();
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
```

Korvaa (lisää `updateOfflineBanner(loadQueue());` ja `flushQueue();` heti `renderIcons();`-rivin jälkeen):

```js
(async () => {
  renderIcons();
  updateOfflineBanner(loadQueue());
  flushQueue();
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
```

- [ ] **Step 5: Testaa manuaalisesti**

Käynnistä paikallinen palvelin (`python3 -m http.server 8080`), lataa sivu. Avaa selaimen konsoli ja aja:

```js
enqueueWrite({ table: 'body_metrics', op: 'upsert', payload: { measured_at: '2020-01-01', weight_kg: 1 }, opts: { onConflict: 'measured_at' } });
```

Tarkista banneri ilmestyy tekstillä "1 tallennus odottaa synkronointia". Aja sitten konsolissa `flushQueue()` — tarkista banneri katoaa (kirjoitus onnistuu koska ollaan oikeasti online-tilassa, testirivi menee body_metrics-tauluun päivämäärällä 2020-01-01). Siivoa testirivi: aja konsolissa `await sb.from('body_metrics').delete().eq('measured_at','2020-01-01')`.

- [ ] **Step 6: Committaa**

```bash
git add index.html
git commit -m "feat: offline-kirjoitusjonon ydininfrastruktuuri (sbWrite, jono, banneri)"
```

---

### Task 2: Sali/treeni-kirjoitukset (syncDone, syncSet, setActiveSession)

**Files:**
- Modify: `index.html` (`syncDone()`, `syncSet()`, `setActiveSession()`)

**Konteksti ennen muutosta** — `syncDone()`:

```js
async function syncDone(o, d, st, value) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const workout_date = localIso(dt);
  const { error } = await sb.from('workout_sessions').upsert({
    workout_date,
    session_type: st,
    is_done:      value,
    done_at:      value ? new Date().toISOString() : null,
  }, { onConflict: 'workout_date,session_type' });
  if (error) console.error('syncDone failed:', error.message);
}
```

- [ ] **Step 1: Muuta syncDone käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function syncDone(o, d, st, value) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const workout_date = localIso(dt);
  const { error } = await sbWrite({
    table: 'workout_sessions',
    op: 'upsert',
    payload: {
      workout_date,
      session_type: st,
      is_done:      value,
      done_at:      value ? new Date().toISOString() : null,
    },
    opts: { onConflict: 'workout_date,session_type' },
  });
  if (error) console.error('syncDone failed:', error.message);
}
```

**Konteksti ennen muutosta** — `syncSet()`:

```js
async function syncSet(o, d, e, s) {
  const st = getActiveSession(o, d), sess = SESS[st];
  if (!sess || !sess.ex[e]) return;
  const ex = sess.ex[e], ed = getED(o, d, st, e), sd = ed.sets[s] || {};
  if (!sd.kg && !sd.reps) return;
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const dtYear  = dt.getFullYear();
  const dtMonth = String(dt.getMonth() + 1).padStart(2, '0');
  const dtDay   = String(dt.getDate()).padStart(2, '0');
  const dtIso   = `${dtYear}-${dtMonth}-${dtDay}`;
  const { error } = await sb.from('workout_sets').upsert({
    workout_date:  dtIso,
    exercise_name: ex.n,
    set_number:    s + 1,
    weight_kg:     parseFloat(sd.kg)  || null,
    reps:          parseInt(sd.reps)  || null,
    session_type:  st,
  }, { onConflict: 'workout_date,exercise_name,set_number' });
  if (error) {
    console.error(`syncSet failed for "${ex.n}" set ${s + 1} on ${dtIso}:`, error.message);
  }
}
```

- [ ] **Step 2: Muuta syncSet käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function syncSet(o, d, e, s) {
  const st = getActiveSession(o, d), sess = SESS[st];
  if (!sess || !sess.ex[e]) return;
  const ex = sess.ex[e], ed = getED(o, d, st, e), sd = ed.sets[s] || {};
  if (!sd.kg && !sd.reps) return;
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const dtYear  = dt.getFullYear();
  const dtMonth = String(dt.getMonth() + 1).padStart(2, '0');
  const dtDay   = String(dt.getDate()).padStart(2, '0');
  const dtIso   = `${dtYear}-${dtMonth}-${dtDay}`;
  const { error } = await sbWrite({
    table: 'workout_sets',
    op: 'upsert',
    payload: {
      workout_date:  dtIso,
      exercise_name: ex.n,
      set_number:    s + 1,
      weight_kg:     parseFloat(sd.kg)  || null,
      reps:          parseInt(sd.reps)  || null,
      session_type:  st,
    },
    opts: { onConflict: 'workout_date,exercise_name,set_number' },
  });
  if (error) {
    console.error(`syncSet failed for "${ex.n}" set ${s + 1} on ${dtIso}:`, error.message);
  }
}
```

**Konteksti ennen muutosta** — `setActiveSession()`:

```js
async function setActiveSession(o, d, st) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const workout_date = localIso(dt);
  const { error } = await sb.from('day_session_overrides')
    .upsert({ workout_date, session_type: st }, { onConflict: 'workout_date' });
  if (error) { console.error('setActiveSession failed:', error.message); return; }
  renderTreeni();
}
```

- [ ] **Step 3: Muuta setActiveSession käyttämään sbWrite**

Korvaa yllä oleva lohko:

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

- [ ] **Step 4: Testaa manuaalisesti**

Käynnistä paikallinen palvelin, avaa Sali-sivu. Kytke DevTools Network-välilehdellä "Offline". Merkitse jokin sarja tehdyksi (kg+toistot) — tarkista ei virhettä konsolissa, banneri ilmestyy. Kytke takaisin "Online" — tarkista banneri tyhjenee ja arvo löytyy Supabasesta (esim. `await sb.from('workout_sets').select('*').order('id',{ascending:false}).limit(1)` konsolissa).

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: siirrä syncDone/syncSet/setActiveSession offline-jonoon"
```

---

### Task 3: Mittarit ja aktiviteetit (body_metrics, sleep_data, activity_data, app_settings)

**Files:**
- Modify: `index.html` (`saveBodyMetrics()`, `saveCalorieCorrection()`, `saveOnboardingCompleted()`, `updateActivity()`, `deleteActivity()`, `saveActivity()`, `saveSleep()`)

**Konteksti ennen muutosta** — `saveBodyMetrics()`:

```js
async function saveBodyMetrics() {
  const date = document.getElementById('body-date').value;
  if (!date) { showStatus('body-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#seuranta-keho .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sb.from('body_metrics').upsert({
      measured_at: date,
      weight_kg:   parseNum('body-weight'),
      fat_pct:     parseNum('body-fat'),
      muscle_pct:  parseNum('body-muscle'),
    }, { onConflict:'measured_at' });
    if (error) { showStatus('body-status','Virhe: '+error.message,true); return; }
    showStatus('body-status','Tallennettu!',false);
    loadBodyMetrics();
  } finally {
    btn.disabled = false;
  }
}
```

- [ ] **Step 1: Muuta saveBodyMetrics käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function saveBodyMetrics() {
  const date = document.getElementById('body-date').value;
  if (!date) { showStatus('body-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#seuranta-keho .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sbWrite({
      table: 'body_metrics',
      op: 'upsert',
      payload: {
        measured_at: date,
        weight_kg:   parseNum('body-weight'),
        fat_pct:     parseNum('body-fat'),
        muscle_pct:  parseNum('body-muscle'),
      },
      opts: { onConflict:'measured_at' },
    });
    if (error) { showStatus('body-status','Virhe: '+error.message,true); return; }
    showStatus('body-status','Tallennettu!',false);
    loadBodyMetrics();
  } finally {
    btn.disabled = false;
  }
}
```

**Konteksti ennen muutosta** — `saveCalorieCorrection()` ja `saveOnboardingCompleted()`:

```js
async function saveCalorieCorrection(multiplier) {
  const { error } = await sb.from('app_settings')
    .upsert({ id: 1, calorie_correction: multiplier, updated_at: new Date().toISOString() });
  if (error) { console.error('saveCalorieCorrection failed:', error.message); throw error; }
}

async function saveOnboardingCompleted() {
  const { error } = await sb.from('app_settings')
    .upsert({ id: 1, onboarding_completed: true, updated_at: new Date().toISOString() });
  if (error) { console.error('saveOnboardingCompleted failed:', error.message); throw error; }
}
```

- [ ] **Step 2: Muuta saveCalorieCorrection ja saveOnboardingCompleted käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function saveCalorieCorrection(multiplier) {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, calorie_correction: multiplier, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveCalorieCorrection failed:', error.message); throw error; }
}

async function saveOnboardingCompleted() {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, onboarding_completed: true, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveOnboardingCompleted failed:', error.message); throw error; }
}
```

**Konteksti ennen muutosta** — `updateActivity()` ja `deleteActivity()`:

```js
async function updateActivity(id, fields) {
  const { error } = await sb.from('activity_data').update(fields).eq('id', id);
  if (error) { console.error('updateActivity failed:', error.message); throw error; }
}

async function deleteActivity(id) {
  const { error } = await sb.from('activity_data').delete().eq('id', id);
  if (error) { console.error('deleteActivity failed:', error.message); throw error; }
}
```

- [ ] **Step 3: Muuta updateActivity ja deleteActivity käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function updateActivity(id, fields) {
  const { error } = await sbWrite({ table: 'activity_data', op: 'update', payload: fields, eq: { column: 'id', value: id } });
  if (error) { console.error('updateActivity failed:', error.message); throw error; }
}

async function deleteActivity(id) {
  const { error } = await sbWrite({ table: 'activity_data', op: 'delete', eq: { column: 'id', value: id } });
  if (error) { console.error('deleteActivity failed:', error.message); throw error; }
}
```

**Konteksti ennen muutosta** — `saveActivity()`:

```js
async function saveActivity() {
  const date = document.getElementById('act-date').value;
  if (!date) { showStatus('act-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#aerobia-treeni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sb.from('activity_data').insert({
      activity_date:  date,
      activity_type:  document.getElementById('act-type').value,
      duration_min:   parseNum('act-duration'),
      calories:       parseNum('act-calories'),
      avg_heart_rate: parseNum('act-hr'),
      distance_km:    parseFloat((document.getElementById('act-km').value || '').replace(',','.')) || null,
    });
    if (error) { showStatus('act-status','Virhe',true); return; }
    showStatus('act-status','Tallennettu!',false);
    loadActivities();
  } finally {
    btn.disabled = false;
  }
}
```

- [ ] **Step 4: Muuta saveActivity käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function saveActivity() {
  const date = document.getElementById('act-date').value;
  if (!date) { showStatus('act-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#aerobia-treeni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sbWrite({
      table: 'activity_data',
      op: 'insert',
      payload: {
        activity_date:  date,
        activity_type:  document.getElementById('act-type').value,
        duration_min:   parseNum('act-duration'),
        calories:       parseNum('act-calories'),
        avg_heart_rate: parseNum('act-hr'),
        distance_km:    parseFloat((document.getElementById('act-km').value || '').replace(',','.')) || null,
      },
    });
    if (error) { showStatus('act-status','Virhe',true); return; }
    showStatus('act-status','Tallennettu!',false);
    loadActivities();
  } finally {
    btn.disabled = false;
  }
}
```

**Konteksti ennen muutosta** — `saveSleep()`:

```js
async function saveSleep() {
  const date = document.getElementById('sleep-date').value;
  if (!date) { showStatus('sleep-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#seuranta-uni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sb.from('sleep_data').upsert({
      sleep_date:     date,
      duration_min:   parseNum('sleep-dur'),
      deep_sleep_min: parseNum('sleep-deep'),
      rem_sleep_min:  parseNum('sleep-rem'),
      awakenings:     parseNum('sleep-awk'),
    }, { onConflict:'sleep_date' });
    if (error) { showStatus('sleep-status','Virhe',true); return; }
    showStatus('sleep-status','Tallennettu!',false);
    loadSleep();
  } finally {
    btn.disabled = false;
  }
}
```

- [ ] **Step 5: Muuta saveSleep käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function saveSleep() {
  const date = document.getElementById('sleep-date').value;
  if (!date) { showStatus('sleep-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#seuranta-uni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sbWrite({
      table: 'sleep_data',
      op: 'upsert',
      payload: {
        sleep_date:     date,
        duration_min:   parseNum('sleep-dur'),
        deep_sleep_min: parseNum('sleep-deep'),
        rem_sleep_min:  parseNum('sleep-rem'),
        awakenings:     parseNum('sleep-awk'),
      },
      opts: { onConflict:'sleep_date' },
    });
    if (error) { showStatus('sleep-status','Virhe',true); return; }
    showStatus('sleep-status','Tallennettu!',false);
    loadSleep();
  } finally {
    btn.disabled = false;
  }
}
```

- [ ] **Step 6: Testaa manuaalisesti**

Kytke DevTools "Offline". Tallenna kehon mittaus, uni-data, ja aktiviteetti (Aerobia-sivulla "Kirjaa aktiviteetti"). Tarkista ettei virheilmoituksia näy (kaikki näyttävät "Tallennettu!" tai sulkeutuvat normaalisti), banneri näyttää 3 odottavaa kirjoitusta. Kytke "Online", tarkista banneri tyhjenee.

- [ ] **Step 7: Committaa**

```bash
git add index.html
git commit -m "feat: siirrä mittarit ja aktiviteetit offline-jonoon"
```

---

### Task 4: Ruokapäiväkirja (food_log_entries)

**Files:**
- Modify: `index.html` (`addFoodLogEntry()`, `updateFoodLogEntryAmount()`, `deleteFoodLogEntry()`)

**Konteksti ennen muutosta:**

```js
async function addFoodLogEntry({ mealType, dateIso, foodCacheId, customFoodId, amountG, kcalPer100g, proteinPer100g }) {
  const kcal = Math.round(kcalPer100g * amountG / 100);
  const protein_g = Math.round(proteinPer100g * amountG / 100 * 10) / 10;
  const { error } = await sb.from('food_log_entries').insert({
    meal_type: mealType,
    logged_at: dateIso,
    food_cache_id: foodCacheId || null,
    custom_food_id: customFoodId || null,
    amount_g: amountG,
    kcal,
    protein_g,
  });
  if (error) { console.error('addFoodLogEntry failed:', error.message); throw error; }
}
```

- [ ] **Step 1: Muuta addFoodLogEntry käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function addFoodLogEntry({ mealType, dateIso, foodCacheId, customFoodId, amountG, kcalPer100g, proteinPer100g }) {
  const kcal = Math.round(kcalPer100g * amountG / 100);
  const protein_g = Math.round(proteinPer100g * amountG / 100 * 10) / 10;
  const { error } = await sbWrite({
    table: 'food_log_entries',
    op: 'insert',
    payload: {
      meal_type: mealType,
      logged_at: dateIso,
      food_cache_id: foodCacheId || null,
      custom_food_id: customFoodId || null,
      amount_g: amountG,
      kcal,
      protein_g,
    },
  });
  if (error) { console.error('addFoodLogEntry failed:', error.message); throw error; }
}
```

**Konteksti ennen muutosta** — `updateFoodLogEntryAmount()` ja `deleteFoodLogEntry()`:

```js
async function updateFoodLogEntryAmount(entryId, amountG, kcalPer100g, proteinPer100g) {
  const kcal = Math.round(kcalPer100g * amountG / 100);
  const protein_g = Math.round(proteinPer100g * amountG / 100 * 10) / 10;
  const { error } = await sb.from('food_log_entries')
    .update({ amount_g: amountG, kcal, protein_g })
    .eq('id', entryId);
  if (error) { console.error('updateFoodLogEntryAmount failed:', error.message); throw error; }
}

async function deleteFoodLogEntry(entryId) {
  const { error } = await sb.from('food_log_entries').delete().eq('id', entryId);
  if (error) { console.error('deleteFoodLogEntry failed:', error.message); throw error; }
}
```

- [ ] **Step 2: Muuta updateFoodLogEntryAmount ja deleteFoodLogEntry käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function updateFoodLogEntryAmount(entryId, amountG, kcalPer100g, proteinPer100g) {
  const kcal = Math.round(kcalPer100g * amountG / 100);
  const protein_g = Math.round(proteinPer100g * amountG / 100 * 10) / 10;
  const { error } = await sbWrite({
    table: 'food_log_entries',
    op: 'update',
    payload: { amount_g: amountG, kcal, protein_g },
    eq: { column: 'id', value: entryId },
  });
  if (error) { console.error('updateFoodLogEntryAmount failed:', error.message); throw error; }
}

async function deleteFoodLogEntry(entryId) {
  const { error } = await sbWrite({ table: 'food_log_entries', op: 'delete', eq: { column: 'id', value: entryId } });
  if (error) { console.error('deleteFoodLogEntry failed:', error.message); throw error; }
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Huom: `confirmAddFood()` kutsuu tarvittaessa `ensureFoodCache()`:tä ennen `addFoodLogEntry()`:tä — `ensureFoodCache()` EI käytä `sbWrite()`:tä (ks. speksin poikkeuslista), joten se epäonnistuu näkyvästi offline-tilassa jos syötetään täysin uusi Fineli-hakutulos. Testaa siis lisäämällä ruokaa joka on JO kertaalleen haettu (siis jo `food_cache`-taulussa) tai omaa ruoka-ainetta (`custom_foods`), jolloin `ensureFoodCache()`:tä ei kutsuta lainkaan ja `addFoodLogEntry()` yksin jonottuu offline-tilassa. Kytke DevTools "Offline", lisää aiemmin haettu ruoka-annos — tarkista ei virhettä, banneri näyttää odottavan kirjoituksen. Kytke "Online", tarkista rivi ilmestyy Supabaseen.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: siirrä ruokapäiväkirja offline-jonoon"
```

---

### Task 5: Ohjelman muokkaus (program_sessions, program_session_exercises)

**Files:**
- Modify: `index.html` (`addExerciseToCurrentSession()`, `renderOhjelma()`:n kaksi Sortable-käsittelijää, `saveSessionField()`, `toggleSessionWeekday()`, `addNewProgramSession()`, `deleteProgramSession()`, `removeExerciseFromSession()`, `saveExerciseTarget()`)

**Konteksti ennen muutosta** — `addExerciseToCurrentSession()`:

```js
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
  if (error) {
    console.error('addExerciseToCurrentSession failed:', error.message);
    document.getElementById('ex-search-results').innerHTML = `<div class="ex-search-empty">Lisäys epäonnistui, yritä uudelleen</div>`;
    return;
  }
  closeExercisePicker();
  await loadProgram();
  renderOhjelma();
}
```

- [ ] **Step 1: Muuta addExerciseToCurrentSession käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function addExerciseToCurrentSession(exerciseName) {
  const existing = programSessionExercisesRaw.filter(e => e.program_session_id === exercisePickerSessionId);
  const nextOrder = existing.length ? Math.max(...existing.map(e => e.sort_order)) + 1 : 0;
  const { error } = await sbWrite({
    table: 'program_session_exercises',
    op: 'insert',
    payload: {
      program_session_id: exercisePickerSessionId,
      exercise_name: exerciseName,
      target_sets: 3,
      target_display: '3×10',
      sort_order: nextOrder,
    },
  });
  if (error) {
    console.error('addExerciseToCurrentSession failed:', error.message);
    document.getElementById('ex-search-results').innerHTML = `<div class="ex-search-empty">Lisäys epäonnistui, yritä uudelleen</div>`;
    return;
  }
  closeExercisePicker();
  await loadProgram();
  renderOhjelma();
}
```

Huom: jos kirjoitus jonottuu (offline), `loadProgram()` ei näytä uutta liikettä ennen kuin jono synkronoituu ja sivu ladataan uudelleen — tämä on speksin hyväksymä rajoitus (ei optimistista UI-päivitystä), ei tämän tehtävän korjattava bugi.

**Konteksti ennen muutosta** — `renderOhjelma()`:n kaksi Sortable-käsittelijää:

```js
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
```

- [ ] **Step 2: Muuta molemmat Sortable-käsittelijät käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
  new Sortable(document.getElementById('sess-list'), {
    handle: '.sess-drag-handle',
    animation: 150,
    onEnd: async () => {
      const ids = [...document.getElementById('sess-list').children].map(c => c.dataset.sessionId);
      await Promise.all(ids.map((id, i) => sbWrite({ table: 'program_sessions', op: 'update', payload: { sort_order: i }, eq: { column: 'id', value: id } })));
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
          await Promise.all(ids.map((id, i) => sbWrite({ table: 'program_session_exercises', op: 'update', payload: { sort_order: i }, eq: { column: 'id', value: id } })));
          await loadProgram();
          renderOhjelma();
        },
      });
    }
  }
```

**Konteksti ennen muutosta** — `saveSessionField()` ja `toggleSessionWeekday()`:

```js
async function saveSessionField(id, field, value) {
  const { error } = await sb.from('program_sessions').update({ [field]: value }).eq('id', id);
  if (error) { console.error('saveSessionField failed:', error.message); return; }
  await loadProgram();
  if (field === 'name') {
    const nameEl = document.querySelector(`.sess-card[data-session-id="${id}"] .sess-card-name`);
    if (nameEl) nameEl.textContent = value;
  }
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
```

- [ ] **Step 3: Muuta saveSessionField ja toggleSessionWeekday käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function saveSessionField(id, field, value) {
  const { error } = await sbWrite({ table: 'program_sessions', op: 'update', payload: { [field]: value }, eq: { column: 'id', value: id } });
  if (error) { console.error('saveSessionField failed:', error.message); return; }
  await loadProgram();
  if (field === 'name') {
    const nameEl = document.querySelector(`.sess-card[data-session-id="${id}"] .sess-card-name`);
    if (nameEl) nameEl.textContent = value;
  }
}

async function toggleSessionWeekday(id, dayIndex) {
  const s = programSessionsRaw.find(r => r.id === id);
  if (!s) return;
  const days = new Set(s.default_weekdays || []);
  if (days.has(dayIndex)) days.delete(dayIndex); else days.add(dayIndex);
  const { error } = await sbWrite({
    table: 'program_sessions',
    op: 'update',
    payload: { default_weekdays: [...days].sort((a, b) => a - b) },
    eq: { column: 'id', value: id },
  });
  if (error) { console.error('toggleSessionWeekday failed:', error.message); return; }
  await loadProgram();
  renderOhjelma();
}
```

**Konteksti ennen muutosta** — `addNewProgramSession()`, `deleteProgramSession()`, `removeExerciseFromSession()`:

```js
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
```

- [ ] **Step 4: Muuta addNewProgramSession, deleteProgramSession, removeExerciseFromSession käyttämään sbWrite**

Korvaa yllä oleva lohko:

```js
async function addNewProgramSession() {
  let slug = slugify('Uusi sessio');
  let n = 1;
  while (programSessionsRaw.some(s => s.id === slug)) { n++; slug = `${slugify('Uusi sessio')}-${n}`; }
  const nextOrder = programSessionsRaw.length
    ? Math.max(...programSessionsRaw.map(s => s.sort_order)) + 1 : 0;
  const { error } = await sbWrite({
    table: 'program_sessions',
    op: 'insert',
    payload: { id: slug, name: 'Uusi sessio', focus: '', default_weekdays: [], sort_order: nextOrder },
  });
  if (error) { console.error('addNewProgramSession failed:', error.message); return; }
  await loadProgram();
  ohjelmaExpandedId = slug;
  renderOhjelma();
}

async function deleteProgramSession(id) {
  const { error } = await sbWrite({ table: 'program_sessions', op: 'delete', eq: { column: 'id', value: id } });
  if (error) { console.error('deleteProgramSession failed:', error.message); return; }
  ohjelmaExpandedId = null;
  await loadProgram();
  renderOhjelma();
}

async function removeExerciseFromSession(exId) {
  const { error } = await sbWrite({ table: 'program_session_exercises', op: 'delete', eq: { column: 'id', value: exId } });
  if (error) { console.error('removeExerciseFromSession failed:', error.message); return; }
  await loadProgram();
  renderOhjelma();
}
```

**Konteksti ennen muutosta** — `saveExerciseTarget()`:

```js
async function saveExerciseTarget(exId) {
  const setsEl = document.getElementById(`ex-target-sets-${exId}`);
  const dispEl = document.getElementById(`ex-target-display-${exId}`);
  if (!setsEl || !dispEl) return;
  const target_sets = parseInt(setsEl.value, 10) || 1;
  const target_display = dispEl.value.trim() || `${target_sets}×10`;
  const { error } = await sb.from('program_session_exercises')
    .update({ target_sets, target_display }).eq('id', exId);
```

- [ ] **Step 5: Muuta saveExerciseTarget käyttämään sbWrite**

Korvaa `.update()`-kutsurivi:

```js
  const { error } = await sb.from('program_session_exercises')
    .update({ target_sets, target_display }).eq('id', exId);
```

tällä:

```js
  const { error } = await sbWrite({
    table: 'program_session_exercises',
    op: 'update',
    payload: { target_sets, target_display },
    eq: { column: 'id', value: exId },
  });
```

- [ ] **Step 6: Testaa manuaalisesti**

Avaa Ohjelma-sivu. Kytke DevTools "Offline". Muuta session nimeä, järjestä liikkeitä raahaamalla, poista liike. Tarkista ei virheitä konsolissa, banneri kasvaa. Kytke "Online", tarkista banneri tyhjenee ja `program_sessions`/`program_session_exercises`-taulut päivittyvät (esim. lataa sivu uudelleen ja tarkista muutokset näkyvät).

- [ ] **Step 7: Committaa**

```bash
git add index.html
git commit -m "feat: siirrä ohjelman muokkaus offline-jonoon"
```

---

### Task 6: Tavoitteet (activity_goals, nutrition_goals)

**Files:**
- Modify: `index.html` (`saveActivityGoals()`, `saveNutritionGoals()`)

**Konteksti ennen muutosta:**

```js
async function saveActivityGoals(goals) {
  const { error } = await sb.from('activity_goals')
    .upsert({ id: 1, ...goals, updated_at: new Date().toISOString() });
  if (error) { console.error('saveActivityGoals failed:', error.message); throw error; }
}
```

```js
async function saveNutritionGoals(goals) {
  const { error } = await sb.from('nutrition_goals')
    .upsert({ id: 1, ...goals, updated_at: new Date().toISOString() });
  if (error) { console.error('saveNutritionGoals failed:', error.message); throw error; }
}
```

- [ ] **Step 1: Muuta saveActivityGoals ja saveNutritionGoals käyttämään sbWrite**

Korvaa ensimmäisen lohkon:

```js
async function saveActivityGoals(goals) {
  const { error } = await sbWrite({
    table: 'activity_goals',
    op: 'upsert',
    payload: { id: 1, ...goals, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveActivityGoals failed:', error.message); throw error; }
}
```

Korvaa toisen lohkon:

```js
async function saveNutritionGoals(goals) {
  const { error } = await sbWrite({
    table: 'nutrition_goals',
    op: 'upsert',
    payload: { id: 1, ...goals, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveNutritionGoals failed:', error.message); throw error; }
}
```

- [ ] **Step 2: Testaa manuaalisesti**

Kytke DevTools "Offline". Avaa Kestävyystavoitteet- ja Ravintotavoitteet-modaalit sivupalkista, tallenna kumpikin. Tarkista ei virhettä, banneri kasvaa kahdella. Kytke "Online", tarkista banneri tyhjenee.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: siirrä tavoitteet offline-jonoon"
```

---

### Task 7: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko speksin testauslistan läpikäynti**

Käy läpi speksin (`docs/superpowers/specs/2026-07-09-offline-kestavyys-design.md`) Testaus-osion kaikki 7 kohtaa Chrome DevToolsin Offline-kytkimellä:

1. Yksittäinen offline-kirjoitus ei näytä virhettä, banneri ilmestyy oikealla laskurilla.
2. Useampi offline-kirjoitus eri lomakkeille kasvattaa bannerin laskuria.
3. `online`-eventti tyhjentää jonon, data löytyy Supabasesta, banneri katoaa.
4. Sivun uudelleenlataus offline-tilassa jonon ollessa ei-tyhjä säilyttää bannerin oikean tilan.
5. Pysyvästi epäonnistuva kirjoitus (testaa esim. `enqueueWrite({table:'ei_olemassa', op:'insert', payload:{x:1}})` konsolissa ja aja `flushQueue()` viisi kertaa online-tilassa) merkitään "jumissa"-tilaan 5 yrityksen jälkeen eikä sitä enää yritetä.
6. Oikea data-/oikeusvirhe (esim. yritä tallentaa kehon mittaus jolla `measured_at` on `null` suoraan konsolista `sbWrite({table:'body_metrics', op:'upsert', payload:{measured_at:null}, opts:{onConflict:'measured_at'}})`) EI jonotu — palauttaa oikean virheen.
7. `createNewExerciseAndAdd()`, `createCustomFood()`, `ensureFoodCache()` epäonnistuvat näkyvästi offline-tilassa (testaa esim. lisäämällä täysin uusi liike Ohjelma-sivulla offline-tilassa).

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.14.0` arvoon `v1.15.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.15.0: Offline-kestävyys"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Kaikki speksin 25 jonotettavaa kirjoituskohtaa on katettu Task 2–6:ssa (Sali/treeni: 3, mittarit/aktiviteetit: 7, ruoka: 3, ohjelma: 8+2 sort-käsittelijää, tavoitteet: 2). Kolme poikkeusta (`createNewExerciseAndAdd`, `createCustomFood`, `ensureFoodCache`) on eksplisiittisesti jätetty koskemattomiksi ja testataan Task 7:ssä säilyvän ennallaan.
- **Tyyppijohdonmukaisuus:** `sbWrite({table, op, payload, eq, opts})`-signatuuri on identtinen jokaisessa kutsukohdassa Task 2–6:ssa. `eq: {column, value}`-muoto ja `opts: {onConflict}`-muoto pysyvät samoina läpi koko planin, määritelty Task 1:ssä.
- **Ei placeholdereita:** kaikki koodilohkot täydellisiä, ei TBD/TODO-merkintöjä.
- **Tunnettu rajoitus (ei bugi):** `addExerciseToCurrentSession()` ei päivitä UI:ta optimistisesti kun kirjoitus jonottuu offline-tilassa — käyttäjä näkee uuden liikkeen vasta kun jono synkronoituu ja sivu ladataan uudelleen. Tämä vastaa speksin laajuutta (taustajono, ei optimistinen UI) eikä ole korjattava tässä planissa.
