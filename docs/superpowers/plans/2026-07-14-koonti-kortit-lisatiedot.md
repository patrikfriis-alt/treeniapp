# Koonti-korttien lisätiedot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koonti-sivun 6 yläkorttia muuttuvat klikattaviksi, avaten kevyen modaalin jossa on erittely luvun taustalla olevasta datasta. Lisäksi korjataan kalorimerkin etumerkkikonventio (vaje=negatiivinen, ylijäämä=positiivinen) ja Aerobinen-kortin samapäiväisyys-bugi.

**Architecture:** Yksi jaettu `openMetricModal(title, bodyHtml)`-funktio rakentaa modaalin DOM:n (sama kuvio kuin olemassa oleva `openProfileModal`). Kuusi erillistä builder-funktiota (yksi per kortti) kokoavat sisällön jo ladatusta/laajennetusta datasta ja kutsuvat jaettua avaajaa. Kolme olemassa olevaa kyselyä laajenee valitsemaan muutaman lisäsarakkeen; yksi aidosti uusi kyselypari lasketaan vain kun "päivän kalorit" -modaali avataan (ei kuormita sivun alkulatausta).

**Tech Stack:** Vanilla JS, CSS, olemassa oleva Supabase-data (`workout_sets`, `activity_data`, `sleep_data`, `body_metrics`, `food_log_entries`, `workout_sessions`, `user_profile`), olemassa oleva `escapeHtml()`-XSS-suojaus.

---

### Task 1: Jaettu modaali-infrastruktuuri

**Files:**
- Modify: `index.html` (CSS `<style>`-lohko, uusi JS-funktio)

**Konteksti ennen muutosta** — CSS, hero-metric-säännöt (`grep -n "hero-metric-label { font-size" index.html`):

```css
.hero-metric { background:var(--surface); border-radius:14px; padding:12px; }
.hero-metric-icon  { font-size:20px; margin-bottom:4px; }
.hero-metric-val   { font-size:20px; font-weight:700; line-height:1; }
.hero-metric-label { font-size:10px; color:var(--text3); margin-top:2px; }
```

- [ ] **Step 1: Lisää modaalin sisältöä varten tarvittavat CSS-luokat**

Korvaa yllä oleva lohko (lisätty neljä uutta riviä loppuun):

```css
.hero-metric { background:var(--surface); border-radius:14px; padding:12px; }
.hero-metric-icon  { font-size:20px; margin-bottom:4px; }
.hero-metric-val   { font-size:20px; font-weight:700; line-height:1; }
.hero-metric-label { font-size:10px; color:var(--text3); margin-top:2px; }
.hero-metric--clickable { cursor:pointer; }
.metric-modal-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:13.5px; color:var(--text2); border-bottom:1px solid var(--border); }
.metric-modal-row:last-of-type { border-bottom:none; }
.metric-modal-row .val { color:var(--text); font-weight:600; font-variant-numeric:tabular-nums; }
.metric-modal-total { display:flex; justify-content:space-between; align-items:center; padding:10px 0 4px; margin-top:4px; border-top:1px solid var(--border2); font-size:14px; font-weight:600; color:var(--text); }
.metric-modal-sub { font-size:12px; color:var(--text3); margin:10px 0 6px; }
.metric-modal-dots { display:flex; gap:4px; flex-wrap:wrap; }
.metric-modal-dot { width:12px; height:12px; border-radius:50%; background:var(--surface2); }
.metric-modal-dot.on { background:var(--accent); }
.metric-modal-bars { display:flex; align-items:flex-end; gap:5px; height:60px; }
.metric-modal-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; }
.metric-modal-bar { width:100%; border-radius:3px 3px 0 0; background:var(--accent); min-height:2px; }
.metric-modal-bar.neg { background:var(--red); }
.metric-modal-bar-label { font-size:9px; color:var(--text3); }
```

**Konteksti ennen muutosta** — JS, `openProfileModal()`-funktion loppu (`grep -n "async function openProfileModal" index.html`, katso funktion loppu joka päättyy yksinäiseen `}`-riviin ennen seuraavaa funktiota):

Etsi `openProfileModal`-funktion päättävä `}`-rivi ja funktiota seuraava tyhjä rivi. Lisää heti sen jälkeen uusi funktio (älä muokkaa `openProfileModal`-funktion sisältöä).

- [ ] **Step 2: Lisää `openMetricModal()`-jaettu avaaja `openProfileModal()`-funktion jälkeen**

```js
function openMetricModal(title, bodyHtml) {
  const existing = document.getElementById('metric-info-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'metric-info-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;max-height:80vh;overflow-y:auto;';

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:600;color:var(--text)">${title}</div>
      <button onclick="document.getElementById('metric-info-overlay').remove()" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;line-height:1;">✕</button>
    </div>
    ${bodyHtml}
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Avaa selaimen konsoli, kutsu käsin `openMetricModal('Testi', '<div class="metric-modal-row"><span>Rivi</span><span class="val">42</span></div>')`. Tarkista modaali avautuu, sulkeutuu sekä ✕-napista että taustaa klikkaamalla.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: jaettu metric-info-modaali Koonti-korttien lisätietoja varten"
```

---

### Task 2: Laajenna `loadWeekSummary()` ja välimuistita viikkodata

**Files:**
- Modify: `index.html` (`loadWeekSummary()`)

**Konteksti ennen muutosta** (`grep -n "async function loadWeekSummary" index.html`):

```js
async function loadWeekSummary() {
  const mon = wStart(wOff);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const from = mon.iso, to = localIso(sun);

  const [
    { data: gymData },
    { data: actData, error: actErr },
    { data: sleepData, error: sleepErr },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date').gte('workout_date', from).lte('workout_date', to),
    sb.from('activity_data').select('id').gte('activity_date', from).lte('activity_date', to),
    sb.from('sleep_data').select('duration_min').gte('sleep_date', from).lte('sleep_date', to),
  ]);

  const gymDays = new Set((gymData || []).map(r => r.workout_date));
  const gymEl = document.getElementById('ws-gym');
  if (gymEl) gymEl.textContent = gymDays.size;
  const kGymEl = document.getElementById('koonti-ws-gym');
  if (kGymEl) kGymEl.textContent = gymDays.size;

  if (actErr) { console.error('loadWeekSummary (act) failed:', actErr.message); }
  const actEl = document.getElementById('ws-act');
  if (actEl) actEl.textContent = actData ? actData.length : '—';
  const kActEl = document.getElementById('koonti-ws-act');
  if (kActEl) kActEl.textContent = actData ? actData.length : '—';

  if (sleepErr) { console.error('loadWeekSummary (sleep) failed:', sleepErr.message); }
  const withDur = sleepData ? sleepData.filter(r => r.duration_min !== null) : [];
  const sleepEl = document.getElementById('ws-sleep');
  if (withDur.length) {
    const avg = withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length;
    if (sleepEl) sleepEl.textContent = (avg / 60).toFixed(1) + 'h';
  } else {
    if (sleepEl) sleepEl.textContent = '—';
  }
}
```

- [ ] **Step 1: Lisää `weekCardCache`-välimuisti ja laajenna kyselyt**

Lisää heti `async function loadWeekSummary() {`-rivin YLÄPUOLELLE (funktion ulkopuolelle, moduulitason muuttujaksi):

```js
let weekCardCache = {};
```

Korvaa koko `loadWeekSummary`-funktio:

```js
async function loadWeekSummary() {
  const mon = wStart(wOff);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const from = mon.iso, to = localIso(sun);

  const [
    { data: gymData },
    { data: actData, error: actErr },
    { data: sleepData, error: sleepErr },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date,session_type').gte('workout_date', from).lte('workout_date', to),
    sb.from('activity_data').select('activity_type,activity_date,duration_min').gte('activity_date', from).lte('activity_date', to),
    sb.from('sleep_data').select('duration_min').gte('sleep_date', from).lte('sleep_date', to),
  ]);

  const gymDays = new Set((gymData || []).map(r => r.workout_date));
  const gymEl = document.getElementById('ws-gym');
  if (gymEl) gymEl.textContent = gymDays.size;
  const kGymEl = document.getElementById('koonti-ws-gym');
  if (kGymEl) kGymEl.textContent = gymDays.size;

  weekCardCache.gymByDate = {};
  (gymData || []).forEach(r => {
    if (!weekCardCache.gymByDate[r.workout_date]) weekCardCache.gymByDate[r.workout_date] = r.session_type;
  });

  if (actErr) { console.error('loadWeekSummary (act) failed:', actErr.message); }
  const actEl = document.getElementById('ws-act');
  if (actEl) actEl.textContent = actData ? actData.length : '—';
  const kActEl = document.getElementById('koonti-ws-act');
  if (kActEl) kActEl.textContent = actData ? actData.length : '—';

  weekCardCache.actList = actData || [];

  if (sleepErr) { console.error('loadWeekSummary (sleep) failed:', sleepErr.message); }
  const withDur = sleepData ? sleepData.filter(r => r.duration_min !== null) : [];
  const sleepEl = document.getElementById('ws-sleep');
  if (withDur.length) {
    const avg = withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length;
    if (sleepEl) sleepEl.textContent = (avg / 60).toFixed(1) + 'h';
  } else {
    if (sleepEl) sleepEl.textContent = '—';
  }
}
```

- [ ] **Step 2: Testaa manuaalisesti**

Lataa Koonti-sivu, avaa konsoli, kirjoita `weekCardCache` ja tarkista että `gymByDate` ja `actList` sisältävät odotetun datan tältä viikolta. Tarkista myös että "viikon sali"- ja "viikon aktiiv."-korttien luvut Koonti-sivulla ja Sali-sivun omat vastaavat luvut (`ws-gym`/`ws-act`) näkyvät edelleen oikein (ei regressiota).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: laajenna loadWeekSummary-kysely ja välimuistita viikkodata modaaleja varten"
```

---

### Task 3: Laajenna `loadMotivationSummary()` ja välimuistita streak/kuukausi-data

**Files:**
- Modify: `index.html` (`loadMotivationSummary()`)

**Konteksti ennen muutosta** (`grep -n "async function loadMotivationSummary" index.html`):

```js
async function loadMotivationSummary() {
  // Kuukauden aktiviteettikertoja
  const now = new Date();
  const monthStart = localIso(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd   = localIso(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data: actMonth } = await sb.from('activity_data').select('id')
    .gte('activity_date', monthStart).lte('activity_date', monthEnd);
  const monthCount = actMonth ? actMonth.length : 0;
  const msMonthEl = document.getElementById('ms-month');
  if (msMonthEl) msMonthEl.textContent = monthCount + ' krt';
  const kMonthEl = document.getElementById('koonti-ms-month');
  if (kMonthEl) kMonthEl.textContent = monthCount + ' krt';

  // Streak + viikko% — yksi kysely 90 päivälle kattaa molemmat
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyAgo = new Date(today);
  ninetyAgo.setDate(today.getDate() - 89);
  const streakFrom = localIso(ninetyAgo);
  const streakTo   = localIso(today);
  const activeDays90 = await fetchActiveDays(streakFrom, streakTo);

  const mon2 = wStart(wOff);
  const sun2 = new Date(mon2.date);
  sun2.setDate(mon2.date.getDate() + 6);
  const weekFrom = mon2.iso, weekTo = localIso(sun2);
  const activeDaysThisWeek = new Set([...activeDays90].filter(d => d >= weekFrom && d <= weekTo));
  const weekPct = Math.min(100, Math.round(activeDaysThisWeek.size / 6 * 100));
  const msWeekEl = document.getElementById('ms-week');
  if (msWeekEl) msWeekEl.textContent = weekPct + '%';
  const kWeekEl = document.getElementById('koonti-ms-week');
  if (kWeekEl) kWeekEl.textContent = weekPct + '%';

  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = localIso(d);
    if (activeDays90.has(dateStr)) {
      streak++;
    } else {
      if (i === 0) continue; // tänään voi olla vielä tekemättä
      break;
    }
  }
  const msStreakEl = document.getElementById('ms-streak');
  if (msStreakEl) msStreakEl.textContent = streak + ' pv';
  const kStreakEl = document.getElementById('koonti-ms-streak');
  if (kStreakEl) kStreakEl.textContent = streak + ' pv';

  const streakMilestones = [7, 14, 30, 50, 100];
  const isStreakMilestone = streakMilestones.includes(streak) || (streak > 100 && streak % 50 === 0);
  if (isStreakMilestone) {
    const lastCelebrated = parseInt(localStorage.getItem('celebratedStreak') || '0', 10);
    if (streak > lastCelebrated) {
      localStorage.setItem('celebratedStreak', String(streak));
      showCelebrationToast('🔥', `${streak} päivän streak!`, 'Pidät yllä upeaa vauhtia');
    }
  }
}
```

- [ ] **Step 1: Lisää `motivationCache`-välimuisti, laajenna kuukausikysely, laske pisin putki ja 14 päivän ruudukko**

Lisää heti `async function loadMotivationSummary() {`-rivin YLÄPUOLELLE:

```js
let motivationCache = {};
```

Korvaa koko `loadMotivationSummary`-funktio:

```js
async function loadMotivationSummary() {
  // Kuukauden aktiviteettikertoja
  const now = new Date();
  const monthStart = localIso(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd   = localIso(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data: actMonth } = await sb.from('activity_data').select('activity_type')
    .gte('activity_date', monthStart).lte('activity_date', monthEnd);
  const monthCount = actMonth ? actMonth.length : 0;
  const msMonthEl = document.getElementById('ms-month');
  if (msMonthEl) msMonthEl.textContent = monthCount + ' krt';
  const kMonthEl = document.getElementById('koonti-ms-month');
  if (kMonthEl) kMonthEl.textContent = monthCount + ' krt';

  const monthByType = {};
  (actMonth || []).forEach(r => { monthByType[r.activity_type] = (monthByType[r.activity_type] || 0) + 1; });
  motivationCache.monthCount = monthCount;
  motivationCache.monthByType = monthByType;

  // Streak + viikko% — yksi kysely 90 päivälle kattaa molemmat
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyAgo = new Date(today);
  ninetyAgo.setDate(today.getDate() - 89);
  const streakFrom = localIso(ninetyAgo);
  const streakTo   = localIso(today);
  const activeDays90 = await fetchActiveDays(streakFrom, streakTo);
  motivationCache.activeDays90 = activeDays90;

  const mon2 = wStart(wOff);
  const sun2 = new Date(mon2.date);
  sun2.setDate(mon2.date.getDate() + 6);
  const weekFrom = mon2.iso, weekTo = localIso(sun2);
  const activeDaysThisWeek = new Set([...activeDays90].filter(d => d >= weekFrom && d <= weekTo));
  const weekPct = Math.min(100, Math.round(activeDaysThisWeek.size / 6 * 100));
  const msWeekEl = document.getElementById('ms-week');
  if (msWeekEl) msWeekEl.textContent = weekPct + '%';
  const kWeekEl = document.getElementById('koonti-ms-week');
  if (kWeekEl) kWeekEl.textContent = weekPct + '%';

  const weekDayMarks = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(mon2.date);
    d.setDate(mon2.date.getDate() + i);
    weekDayMarks.push({ day: DAYS[i], active: activeDays90.has(localIso(d)) });
  }
  motivationCache.weekDayMarks = weekDayMarks;

  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = localIso(d);
    if (activeDays90.has(dateStr)) {
      streak++;
    } else {
      if (i === 0) continue; // tänään voi olla vielä tekemättä
      break;
    }
  }
  const msStreakEl = document.getElementById('ms-streak');
  if (msStreakEl) msStreakEl.textContent = streak + ' pv';
  const kStreakEl = document.getElementById('koonti-ms-streak');
  if (kStreakEl) kStreakEl.textContent = streak + ' pv';
  motivationCache.streak = streak;

  let longestStreak = 0, currentRun = 0;
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (activeDays90.has(localIso(d))) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 0;
    }
  }
  motivationCache.longestStreak = longestStreak;

  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    last14.push(activeDays90.has(localIso(d)));
  }
  motivationCache.last14 = last14;

  const streakMilestones = [7, 14, 30, 50, 100];
  const isStreakMilestone = streakMilestones.includes(streak) || (streak > 100 && streak % 50 === 0);
  if (isStreakMilestone) {
    const lastCelebrated = parseInt(localStorage.getItem('celebratedStreak') || '0', 10);
    if (streak > lastCelebrated) {
      localStorage.setItem('celebratedStreak', String(streak));
      showCelebrationToast('🔥', `${streak} päivän streak!`, 'Pidät yllä upeaa vauhtia');
    }
  }
}
```

- [ ] **Step 2: Testaa manuaalisesti**

Lataa Koonti-sivu, avaa konsoli, kirjoita `motivationCache` ja tarkista `monthByType`, `longestStreak`, `last14` (14 alkion boolean-taulukko), `weekDayMarks` (6 alkion `{day,active}`-taulukko) näyttävät järkeviltä verrattuna oikeaan dataan. Tarkista streak-juhlinta (`showCelebrationToast`) ei laukea turhaan (ei regressiota).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: laajenna loadMotivationSummary ja välimuistita streak/kuukausi-erittely"
```

---

### Task 4: Uudet päiväkohtaiset kalorikyselyt

**Files:**
- Modify: `index.html` (uudet funktiot `getFoodCalories()`-funktion jälkeen)

**Konteksti ennen muutosta** (`grep -n "async function getFoodCalories" -A 6 index.html`):

```js
async function getFoodCalories(fromIso, toIso) {
  const { data, error } = await sb.from('food_log_entries').select('kcal')
    .gte('logged_at', fromIso).lte('logged_at', toIso);
  if (error) { console.error('getFoodCalories failed:', error.message); return 0; }
  return (data || []).reduce((s, r) => s + (r.kcal || 0), 0);
}
```

- [ ] **Step 1: Lisää `getDailyExerciseCalories()` ja `getDailyFoodCalories()` heti `getFoodCalories()`-funktion jälkeen**

```js
async function getFoodCalories(fromIso, toIso) {
  const { data, error } = await sb.from('food_log_entries').select('kcal')
    .gte('logged_at', fromIso).lte('logged_at', toIso);
  if (error) { console.error('getFoodCalories failed:', error.message); return 0; }
  return (data || []).reduce((s, r) => s + (r.kcal || 0), 0);
}

async function getDailyExerciseCalories(fromIso, toIso) {
  if (!appSettings) appSettings = await loadAppSettings();
  const correction = (appSettings && appSettings.calorie_correction) ?? 1;
  const [{ data: actData }, { data: sessData }] = await Promise.all([
    sb.from('activity_data').select('calories,activity_date').gte('activity_date', fromIso).lte('activity_date', toIso),
    sb.from('workout_sessions').select('calories,workout_date').gte('workout_date', fromIso).lte('workout_date', toIso),
  ]);
  const byDate = {};
  (actData || []).forEach(r => {
    if (r.calories != null) byDate[r.activity_date] = (byDate[r.activity_date] || 0) + r.calories * correction;
  });
  (sessData || []).forEach(r => {
    if (r.calories != null) byDate[r.workout_date] = (byDate[r.workout_date] || 0) + r.calories;
  });
  return byDate;
}

async function getDailyFoodCalories(fromIso, toIso) {
  const { data, error } = await sb.from('food_log_entries').select('kcal,logged_at')
    .gte('logged_at', fromIso).lte('logged_at', toIso);
  if (error) { console.error('getDailyFoodCalories failed:', error.message); return {}; }
  const byDate = {};
  (data || []).forEach(r => {
    if (r.kcal != null) byDate[r.logged_at] = (byDate[r.logged_at] || 0) + r.kcal;
  });
  return byDate;
}
```

- [ ] **Step 2: Testaa manuaalisesti**

Avaa konsoli, kutsu `await getDailyExerciseCalories('2026-07-08', '2026-07-14')` ja `await getDailyFoodCalories('2026-07-08', '2026-07-14')`. Tarkista molemmat palauttavat `{ 'YYYY-MM-DD': kcal, ... }` -muotoisen objektin, ja summa täsmää `getExerciseCalories`/`getFoodCalories`-funktioiden palauttamaan kokonaissummaan samalta väliltä.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: lisää päiväkohtaiset kaloriky­selyt päivän kalorit -historiaa varten"
```

---

### Task 5: Lisää klikkaus + kursori 6 Koonti-korttiin

**Files:**
- Modify: `index.html` (Koonti-sivun hero-metrics-HTML)

**Konteksti ennen muutosta** (`grep -n 'id="koonti-ms-streak"' index.html` löytää tarkan sijainnin):

```html
  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="flame" data-icon-color="var(--amber)" data-icon-bg="var(--amber-bg)"></div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="dumbbell" data-icon-color="var(--accent)" data-icon-bg="var(--accent-bg)"></div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="running" data-icon-color="var(--red)" data-icon-bg="var(--red-bg)"></div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>

  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="calendar" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-ms-week">—</div>
      <div class="hero-metric-label">viikon aktiivisuus</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="calendar" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-ms-month">—</div>
      <div class="hero-metric-label">kuukausi</div>
    </div>
    <div class="hero-metric" id="koonti-deficit-wrap">
      <div class="hero-metric-icon" data-icon="scale" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-deficit-val">—</div>
      <div class="hero-metric-label" id="koonti-deficit-label">päivän vaje</div>
    </div>
  </div>
```

- [ ] **Step 1: Lisää `hero-metric--clickable`-luokka ja onclick-kutsut**

Korvaa yllä oleva lohko:

```html
  <div class="hero-metrics">
    <div class="hero-metric hero-metric--clickable" onclick="openStreakModal()">
      <div class="hero-metric-icon" data-icon="flame" data-icon-color="var(--amber)" data-icon-bg="var(--amber-bg)"></div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric hero-metric--clickable" onclick="openWeeklyGymModal()">
      <div class="hero-metric-icon" data-icon="dumbbell" data-icon-color="var(--accent)" data-icon-bg="var(--accent-bg)"></div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric hero-metric--clickable" onclick="openWeeklyActivityModal()">
      <div class="hero-metric-icon" data-icon="running" data-icon-color="var(--red)" data-icon-bg="var(--red-bg)"></div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>

  <div class="hero-metrics">
    <div class="hero-metric hero-metric--clickable" onclick="openWeeklyPercentModal()">
      <div class="hero-metric-icon" data-icon="calendar" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-ms-week">—</div>
      <div class="hero-metric-label">viikon aktiivisuus</div>
    </div>
    <div class="hero-metric hero-metric--clickable" onclick="openMonthModal()">
      <div class="hero-metric-icon" data-icon="calendar" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-ms-month">—</div>
      <div class="hero-metric-label">kuukausi</div>
    </div>
    <div class="hero-metric hero-metric--clickable" id="koonti-deficit-wrap">
      <div class="hero-metric-icon" data-icon="scale" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-deficit-val">—</div>
      <div class="hero-metric-label" id="koonti-deficit-label">päivän kalorit</div>
    </div>
  </div>
```

(Huomaa: `koonti-deficit-wrap`:in `onclick` asetetaan dynaamisesti JS:stä Task 8:ssa — HTML:ssä ei ole staattista `onclick`-attribuuttia sille, vain uusi `hero-metric--clickable`-luokka.)

- [ ] **Step 2: Testaa manuaalisesti**

Lataa Koonti-sivu, tarkista kaikilla 6 kortilla näkyy osoitin-kursori hoveroidessa. Kortit eivät vielä toimi (funktioita ei ole vielä määritelty — seuraavassa taskissa), joten klikkaus voi heittää konsoliin `ReferenceError` tässä vaiheessa; se on odotettua ja korjaantuu Task 6:ssa.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: tee Koonti-sivun 6 yläkorttia klikattaviksi"
```

---

### Task 6: Viisi popup-builder-funktiota (streak, viikon sali, viikon aktiiv., viikon aktiivisuus, kuukausi)

**Files:**
- Modify: `index.html` (uudet funktiot `openMetricModal()`-funktion jälkeen)

- [ ] **Step 1: Lisää viisi builder-funktiota heti `openMetricModal()`-funktion jälkeen (Task 1:ssä lisätty funktio)**

```js
function openStreakModal() {
  const c = motivationCache;
  const dots = (c.last14 || []).map(on => `<div class="metric-modal-dot${on ? ' on' : ''}"></div>`).join('');
  const body = `
    <div class="metric-modal-row"><span>Nykyinen putki</span><span class="val">${c.streak ?? 0} pv</span></div>
    <div class="metric-modal-row"><span>Pisin putki (90 pv)</span><span class="val">${c.longestStreak ?? 0} pv</span></div>
    <div class="metric-modal-sub">Viimeiset 14 päivää</div>
    <div class="metric-modal-dots">${dots}</div>
  `;
  openMetricModal('Streak', body);
}

function openWeeklyGymModal() {
  const byDate = weekCardCache.gymByDate || {};
  const mon = wStart(wOff);
  const rows = DAYS.map((label, i) => {
    const d = new Date(mon.date);
    d.setDate(mon.date.getDate() + i);
    const iso = localIso(d);
    const sessType = byDate[iso];
    const name = sessType && SESS[sessType] ? escapeHtml(SESS[sessType].name) : '—';
    return `<div class="metric-modal-row"><span>${label}</span><span class="val">${name}</span></div>`;
  }).join('');
  openMetricModal('Viikon sali', rows);
}

function openWeeklyActivityModal() {
  const list = weekCardCache.actList || [];
  if (!list.length) {
    openMetricModal('Viikon aktiviteetit', '<div class="metric-modal-row"><span>Ei aktiviteetteja tällä viikolla</span></div>');
    return;
  }
  const sorted = [...list].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
  const rows = sorted.map(r => {
    const d = new Date(r.activity_date + 'T00:00:00');
    const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
    return `<div class="metric-modal-row"><span>${DAYS[dayIdx]}: ${escapeHtml(r.activity_type)}</span><span class="val">${r.duration_min ?? '—'} min</span></div>`;
  }).join('');
  openMetricModal('Viikon aktiviteetit', rows);
}

function openWeeklyPercentModal() {
  const c = motivationCache;
  const marks = c.weekDayMarks || [];
  const rows = marks.map(m =>
    `<div class="metric-modal-row"><span>${m.day}</span><span class="val">${m.active ? '✓ Aktiivinen' : '—'}</span></div>`
  ).join('');
  const body = `
    <div class="metric-modal-row"><span>Aktiivisia päiviä</span><span class="val">${marks.filter(m => m.active).length}/6</span></div>
    ${rows}
  `;
  openMetricModal('Viikon aktiivisuus', body);
}

function openMonthModal() {
  const c = motivationCache;
  const entries = Object.entries(c.monthByType || {}).sort((a, b) => b[1] - a[1]);
  const rows = entries.length
    ? entries.map(([type, count]) => `<div class="metric-modal-row"><span>${escapeHtml(type)}</span><span class="val">${count}</span></div>`).join('')
    : '<div class="metric-modal-row"><span>Ei aktiviteetteja vielä tässä kuussa</span></div>';
  const body = `
    <div class="metric-modal-row"><span>Yhteensä</span><span class="val">${c.monthCount ?? 0} krt</span></div>
    ${rows}
  `;
  openMetricModal('Kuukausi', body);
}
```

- [ ] **Step 2: Testaa manuaalisesti**

Lataa Koonti-sivu. Klikkaa vuorotellen: streak, viikon sali, viikon aktiiv., viikon aktiivisuus, kuukausi. Tarkista jokainen avaa modaalin oikealla sisällöllä (vertaa käsin laskettuun/oikeaan dataan Supabasesta), ja modaalit sulkeutuvat oikein. "Päivän kalorit" -kortti ei vielä toimi (seuraava taski).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: lisää 5 korttikohtaista lisätieto-modaalia (streak, viikko, kuukausi)"
```

---

### Task 7: "Päivän kalorit" -modaali + etumerkin kääntö + uudelleennimeäminen

**Files:**
- Modify: `index.html` (`loadDeficitHeroMetric()`, uusi `openDeficitBreakdownModal()`-funktio)

**Konteksti ennen muutosta** (`grep -n "async function loadDeficitHeroMetric" -A 25 index.html`):

```js
async function loadDeficitHeroMetric() {
  const wrap  = document.getElementById('koonti-deficit-wrap');
  const valEl = document.getElementById('koonti-deficit-val');
  const lblEl = document.getElementById('koonti-deficit-label');
  const bmrInfo = await getBmrInfo();
  if (bmrInfo.missingProfile || bmrInfo.missingWeight) {
    valEl.textContent = 'Aseta →';
    lblEl.textContent = 'profiili';
    wrap.style.cursor = 'pointer';
    wrap.onclick = () => openProfileModal();
    return;
  }
  wrap.style.cursor = '';
  wrap.onclick = null;
  const todayIso = localIso(new Date());
  const [exerciseKcal, foodKcal] = await Promise.all([
    getExerciseCalories(todayIso, todayIso),
    getFoodCalories(todayIso, todayIso),
  ]);
  const deficit = Math.round(bmrInfo.bmr + exerciseKcal - foodKcal);
  const sign = deficit >= 0 ? '+' : '';
  valEl.textContent = `${sign}${deficit} kcal`;
  lblEl.textContent = 'päivän vaje';
}
```

- [ ] **Step 1: Käännä etumerkki, vaihda otsikko, kytke uusi modaali**

Korvaa koko `loadDeficitHeroMetric`-funktio:

```js
async function loadDeficitHeroMetric() {
  const wrap  = document.getElementById('koonti-deficit-wrap');
  const valEl = document.getElementById('koonti-deficit-val');
  const lblEl = document.getElementById('koonti-deficit-label');
  const bmrInfo = await getBmrInfo();
  if (bmrInfo.missingProfile || bmrInfo.missingWeight) {
    valEl.textContent = 'Aseta →';
    lblEl.textContent = 'profiili';
    wrap.onclick = () => openProfileModal();
    return;
  }
  const todayIso = localIso(new Date());
  const [exerciseKcal, foodKcal] = await Promise.all([
    getExerciseCalories(todayIso, todayIso),
    getFoodCalories(todayIso, todayIso),
  ]);
  const net = Math.round(foodKcal - bmrInfo.bmr - exerciseKcal);
  const sign = net >= 0 ? '+' : '';
  valEl.textContent = `${sign}${net} kcal`;
  lblEl.textContent = 'päivän kalorit';
  wrap.onclick = () => openDeficitBreakdownModal(bmrInfo, exerciseKcal, foodKcal);
}
```

- [ ] **Step 2: Lisää `openDeficitBreakdownModal()` heti `loadDeficitHeroMetric()`-funktion jälkeen**

```js
async function openDeficitBreakdownModal(bmrInfo, exerciseKcal, foodKcal) {
  const today = new Date();
  const todayIso = localIso(today);
  const netToday = Math.round(foodKcal - bmrInfo.bmr - exerciseKcal);
  const sign = netToday >= 0 ? '+' : '';
  const label = netToday < 0 ? 'nettovaje' : (netToday > 0 ? 'nettoylijäämä' : 'tasan');

  const from7 = new Date(today);
  from7.setDate(today.getDate() - 6);
  const from7Iso = localIso(from7);

  const [exByDate, foodByDate] = await Promise.all([
    getDailyExerciseCalories(from7Iso, todayIso),
    getDailyFoodCalories(from7Iso, todayIso),
  ]);

  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = localIso(d);
    const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const net = (foodByDate[iso] || 0) - bmrInfo.bmr - (exByDate[iso] || 0);
    bars.push({ label: DAYS[dayIdx], net });
  }
  const maxAbs = Math.max(1, ...bars.map(b => Math.abs(b.net)));
  const barsHtml = bars.map(b => {
    const heightPct = Math.max(4, Math.round(Math.abs(b.net) / maxAbs * 100));
    const cls = b.net < 0 ? ' neg' : '';
    return `<div class="metric-modal-bar-col"><div class="metric-modal-bar${cls}" style="height:${heightPct}%"></div><div class="metric-modal-bar-label">${b.label}</div></div>`;
  }).join('');

  const body = `
    <div class="metric-modal-row"><span>BMR</span><span class="val">${Math.round(bmrInfo.bmr)} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${Math.round(exerciseKcal)} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${Math.round(foodKcal)} kcal</span></div>
    <div class="metric-modal-total"><span>Tänään (${label})</span><span>${sign}${netToday} kcal</span></div>
    <div class="metric-modal-sub">Viimeiset 7 päivää (miinus=vaje, plus=ylijäämä)</div>
    <div class="metric-modal-bars">${barsHtml}</div>
  `;
  openMetricModal('Päivän kalorit', body);
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Lataa Koonti-sivu (profiili jo asetettu tässä sovelluksessa). Tarkista hero-mittari näyttää nyt uuden etumerkkikonvention (ylijäämä positiivisena, vaje negatiivisena) otsikolla "päivän kalorit". Klikkaa korttia — tarkista modaali avautuu, BMR/liikunta/ruoka-erittely täsmää käsin laskettuun, 7 päivän palkkikaavio näyttää oikeat suunnat (miinus=vaje palkki punaisena, plus=ylijäämä sinisenä). Poista väliaikaisesti profiili (jos testaat puuttuvan profiilin polkua) ja tarkista kortti avaa yhä Profiili-modaalin, ei uutta erittelyä — palauta profiili testin jälkeen.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: käännä päivän kalorit -etumerkki ja lisää erittely-modaali"
```

---

### Task 8: "Viikon vaje" → "Viikon kalorit" -etumerkin kääntö

**Files:**
- Modify: `index.html` (`loadWeeklyReportCard()`)

**Konteksti ennen muutosta** (`grep -n "Viikon vaje" index.html`):

```js
  const bmrInfo = await getBmrInfo();
  if (bmrInfo.bmr != null) {
    const mon = wStart(wOff);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const [exerciseKcal, foodKcal] = await Promise.all([
      getExerciseCalories(mon.iso, localIso(sun)),
      getFoodCalories(mon.iso, localIso(sun)),
    ]);
    const elapsedDays = wOff === 0 ? (todayIdx() + 1) : 7;
    const weeklyDeficit = Math.round(bmrInfo.bmr * elapsedDays + exerciseKcal - foodKcal);
    const weeklySign = weeklyDeficit >= 0 ? '+' : '';
    rows.push(`<div class="hist-item"><div class="hist-label">Viikon vaje</div><div class="hist-val">${weeklySign}${weeklyDeficit} kcal</div></div>`);
  }
```

- [ ] **Step 1: Käännä etumerkki ja vaihda rivin nimi**

Korvaa yllä oleva lohko:

```js
  const bmrInfo = await getBmrInfo();
  if (bmrInfo.bmr != null) {
    const mon = wStart(wOff);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const [exerciseKcal, foodKcal] = await Promise.all([
      getExerciseCalories(mon.iso, localIso(sun)),
      getFoodCalories(mon.iso, localIso(sun)),
    ]);
    const elapsedDays = wOff === 0 ? (todayIdx() + 1) : 7;
    const weeklyNet = Math.round(foodKcal - bmrInfo.bmr * elapsedDays - exerciseKcal);
    const weeklySign = weeklyNet >= 0 ? '+' : '';
    rows.push(`<div class="hist-item"><div class="hist-label">Viikon kalorit</div><div class="hist-val">${weeklySign}${weeklyNet} kcal</div></div>`);
  }
```

- [ ] **Step 2: Testaa manuaalisesti**

Avaa Koonti-sivun "Tällä viikolla" -kortti, tarkista "Viikon kalorit" -rivi näyttää käännetyn etumerkin (sama laskentaperiaate kuin "päivän kalorit": ylijäämä=positiivinen, vaje=negatiivinen). Vertaa lukua käsin laskettuun.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: käännä Viikon kalorit -rivin etumerkki samaan konventioon päivän kanssa"
```

---

### Task 9: Aerobinen-kortin samapäiväisyys-bugi

**Files:**
- Modify: `index.html` (Koonti-sivun latausfunktio, Aerobinen-kortin kysely)

**Konteksti ennen muutosta** (`grep -n "kc-aerobia\b" index.html` löytää tarkan sijainnin, katso rivi joka alkaa `const { data: actRows }`):

```js
  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min')
    .order('activity_date', { ascending: false }).limit(1);
```

- [ ] **Step 1: Lisää toissijainen järjestys `created_at`:n mukaan**

Korvaa yllä oleva lohko:

```js
  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min,created_at')
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
```

- [ ] **Step 2: Testaa manuaalisesti**

Kirjaa kaksi aktiviteettia samalle päivämäärälle (esim. aamulla juoksu, illalla kävely). Tarkista Koonti-sivun "Aerobinen"-kortti näyttää sen, joka kirjattiin VIIMEKSI (uusin `created_at`), ei sitä joka sattuu olemaan tietokannan palautusjärjestyksessä ensin. Voit varmistaa tämän myös suoraan Supabasesta: `curl` `activity_data`-taulua `order=activity_date.desc,created_at.desc&limit=1` ja vertaa kortin näyttämään arvoon. Poista testidata jälkikäteen jos loit sitä vain testiä varten.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: korjaa Aerobinen-kortin samapäiväisyys-bugi lisäämällä created_at-tiebreak"
```

---

### Task 10: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko planin läpikäynti**

Käy läpi kaikki muutokset kertaalleen samassa selainistunnossa:

1. Kaikki 6 Koonti-korttia avautuvat oikealla sisällöllä (streak, viikon sali, viikon aktiiv., viikon aktiivisuus, kuukausi, päivän kalorit).
2. "Päivän kalorit" -kortin erittely ja 7 päivän palkkikaavio täsmäävät käsin laskettuun.
3. "Tällä viikolla" -kortin "Viikon kalorit" -rivi näyttää käännetyn etumerkin.
4. Aerobinen-kortti näyttää viimeksi kirjatun aktiviteetin samapäiväisyystilanteessa.
5. Profiilia vailla oleva tila (jos testattavissa): "päivän kalorit" -kortti avaa yhä Profiili-modaalin.
6. Konsoli ei näytä virheitä missään vaiheessa.

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.18.0` arvoon `v1.19.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.19.0: Koonti-korttien lisätiedot"
```

---

## Self-Review Notes

- **Kattavuus:** Kaikki design-specin osat (kaikki 6 korttia, etumerkin kääntö + uudelleennimeäminen sekä Koonti- että Tällä viikolla -kortissa, Aerobinen-korjaus) on katettu Task 1–9:ssä.
- **Riippuvuudet:** Task 5 (klikkaus HTML:ään) tuottaa väliaikaisesti toimimattomia nappeja kunnes Task 6–7 lisäävät varsinaiset funktiot — tämä on mainittu Task 5:n testausvaiheessa eksplisiittisesti, ei yllätä toteuttajaa. Task 6–7 riippuvat Task 2–4:n välimuisteista/funktioista, jotka on tehtävä ensin. Suositeltu järjestys: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.
- **Ei placeholdereita:** kaikki koodilohkot täydellisiä, ei TBD/TODO-merkintöjä.
- **Tyyppijohdonmukaisuus:** `motivationCache`/`weekCardCache`-kenttien nimet (`activeDays90`, `streak`, `longestStreak`, `last14`, `monthCount`, `monthByType`, `weekDayMarks`, `gymByDate`, `actList`) pysyvät samoina Task 3/2:sta läpi Task 6/7:n käyttöön asti.
- **Versionumero:** edellisen sub-projektin (UX-katselmuksen korjaukset) päätteeksi versio oli v1.18.0, joten tämä nostaa sen v1.19.0:aan.
