# Piilossa oleva data näkyviin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kolme itsenäistä pientä korjausta Sprint 2:sta: aktiviteettien avaus/muokkaus/poisto Aerobia-sivulla, CSV-vienti aktiviteeteille ja salilokeille, sekä jo laskettujen mutta piilossa olevien viikko%/kuukausi-tilastojen näyttäminen Koonnissa.

**Architecture:** Kaikki muutokset yhteen tiedostoon (`index.html`). Aktiviteetin muokkaus mallinnetaan suoraan olemassa olevan ruokapäiväkirjan `openEditEntryDialog()`-mallin mukaan. CSV-vienti on puhdasta client-side JS:ää (Blob+download-linkki), ei backend-muutoksia. Viikko/kuukausi-tilastot kirjoitetaan olemassa olevasta `loadMotivationSummary()`-funktiosta uusiin HTML-elementteihin samalla kaksoiskirjoitus-mallilla kuin nykyinen streak-pari.

**Tech Stack:** Vanilla JS, Supabase JS client v2, ei build-stepiä (yksi `index.html`-tiedosto).

---

### Task 1: Aktiviteettien avaus/muokkaus/poisto

**Files:**
- Modify: `index.html:2183-2228` (`loadActivities()`)
- Modify: `index.html` (uudet funktiot `updateActivity`, `deleteActivity`, `openEditActivityDialog` — lisätään heti `loadActivities()`-funktion jälkeen)

**Konteksti ennen muutosta** (`index.html:2183-2228`):

```js
async function loadActivities() {
  if (!appSettings) appSettings = await loadAppSettings();
  const correction = (appSettings && appSettings.calorie_correction) ?? 1;

  const { data, error } = await sb.from('activity_data').select('*')
    .order('activity_date',{ ascending:false }).limit(10);
  if (error) { console.error('loadActivities failed:', error.message); return; }
  const el = document.getElementById('act-history');
  if (!data || !data.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px">Ei aktiviteetteja vielä</div>';
    return;
  }
  const heroType  = document.getElementById('hero-act-type');
  const heroSub   = document.getElementById('hero-act-sub');
  const heroDur   = document.getElementById('hero-act-dur');
  const heroCal   = document.getElementById('hero-act-cal');
  if (heroType && data[0]) {
    const a = data[0];
    heroType.textContent = a.activity_type || '—';
    if (heroSub) heroSub.textContent = a.activity_date || '';
    if (heroDur) heroDur.textContent = a.duration_min ? a.duration_min + '' : '—';
    if (heroCal) heroCal.textContent = a.calories ? a.calories + '' : '—';
  }
  el.innerHTML = data.map(a => {
    let paceStr = '';
    if (a.distance_km && a.duration_min) {
      const pMin = Math.floor(a.duration_min / a.distance_km);
      const pSec = Math.round((a.duration_min / a.distance_km - pMin) * 60);
      paceStr = ` · ${pMin}:${String(pSec).padStart(2,'0')} min/km`;
    }
    const sourceBadge = a.source === 'watch' ? '⌚ ' : '';
    const calStr = a.calories
      ? (a.source === 'watch'
          ? `${a.calories} kcal (Apple) · ~${Math.round(a.calories * correction)} kcal arvio`
          : `${a.calories} kcal`)
      : '';
    return `
    <div class="hist-item">
      <div><div class="hist-label">${sourceBadge}${a.activity_type}</div><div class="hist-date">${a.activity_date}</div></div>
      <div style="text-align:right">
        <div class="hist-val">${a.duration_min ? a.duration_min+' min' : '—'}</div>
        <div style="font-size:11px;color:var(--text3)">${calStr}${a.avg_heart_rate?' · '+a.avg_heart_rate+' bpm':''}${a.distance_km?' · '+a.distance_km+' km'+paceStr:''}</div>
      </div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 1: Lisää module-level cache-muuttuja aktiviteeteille**

Etsi tiedostosta rivi `let appSettings = null;` (index.html:2067, `ACTIVITIES`-lohkon alussa). Lisää heti sen jälkeen uusi rivi:

```js
let appSettings = null;
let lastActivities = [];
```

- [ ] **Step 2: Tallenna ladattu data cacheen ja tee rivit klikattaviksi**

Korvaa koko `loadActivities()`-funktio (Konteksti-lohko yllä) tällä versiolla (kaksi muutosta: `lastActivities = data;` heti onnistuneen haun jälkeen, ja `.hist-item`-divin `onclick`-attribuutti):

```js
async function loadActivities() {
  if (!appSettings) appSettings = await loadAppSettings();
  const correction = (appSettings && appSettings.calorie_correction) ?? 1;

  const { data, error } = await sb.from('activity_data').select('*')
    .order('activity_date',{ ascending:false }).limit(10);
  if (error) { console.error('loadActivities failed:', error.message); return; }
  lastActivities = data || [];
  const el = document.getElementById('act-history');
  if (!data || !data.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px">Ei aktiviteetteja vielä</div>';
    return;
  }
  const heroType  = document.getElementById('hero-act-type');
  const heroSub   = document.getElementById('hero-act-sub');
  const heroDur   = document.getElementById('hero-act-dur');
  const heroCal   = document.getElementById('hero-act-cal');
  if (heroType && data[0]) {
    const a = data[0];
    heroType.textContent = a.activity_type || '—';
    if (heroSub) heroSub.textContent = a.activity_date || '';
    if (heroDur) heroDur.textContent = a.duration_min ? a.duration_min + '' : '—';
    if (heroCal) heroCal.textContent = a.calories ? a.calories + '' : '—';
  }
  el.innerHTML = data.map(a => {
    let paceStr = '';
    if (a.distance_km && a.duration_min) {
      const pMin = Math.floor(a.duration_min / a.distance_km);
      const pSec = Math.round((a.duration_min / a.distance_km - pMin) * 60);
      paceStr = ` · ${pMin}:${String(pSec).padStart(2,'0')} min/km`;
    }
    const sourceBadge = a.source === 'watch' ? '⌚ ' : '';
    const calStr = a.calories
      ? (a.source === 'watch'
          ? `${a.calories} kcal (Apple) · ~${Math.round(a.calories * correction)} kcal arvio`
          : `${a.calories} kcal`)
      : '';
    return `
    <div class="hist-item" style="cursor:pointer" onclick="openEditActivityDialog('${a.id}')">
      <div><div class="hist-label">${sourceBadge}${a.activity_type}</div><div class="hist-date">${a.activity_date}</div></div>
      <div style="text-align:right">
        <div class="hist-val">${a.duration_min ? a.duration_min+' min' : '—'}</div>
        <div style="font-size:11px;color:var(--text3)">${calStr}${a.avg_heart_rate?' · '+a.avg_heart_rate+' bpm':''}${a.distance_km?' · '+a.distance_km+' km'+paceStr:''}</div>
      </div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 3: Lisää `updateActivity`/`deleteActivity`/`openEditActivityDialog`**

Lisää seuraavat kolme funktiota heti `loadActivities()`-funktion sulkevan `}`:n jälkeen (ennen `async function saveActivity()`):

```js
async function updateActivity(id, fields) {
  const { error } = await sb.from('activity_data').update(fields).eq('id', id);
  if (error) { console.error('updateActivity failed:', error.message); throw error; }
}

async function deleteActivity(id) {
  const { error } = await sb.from('activity_data').delete().eq('id', id);
  if (error) { console.error('deleteActivity failed:', error.message); throw error; }
}

function openEditActivityDialog(activityId) {
  const a = lastActivities.find(x => x.id === activityId);
  if (!a) return;

  const existing = document.getElementById('edit-act-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'edit-act-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const types = ['Jääkiekko', 'Juoksu', 'Kävely', 'Sali', 'Muu'];
  const typeOptions = types.map(t => `<option ${t === a.activity_type ? 'selected' : ''}>${t}</option>`).join('');

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;';
  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Muokkaa aktiviteettia</div>
    <div class="form-row"><label>Päivämäärä</label><input type="date" id="edit-act-date" value="${a.activity_date || ''}"></div>
    <div class="form-row"><label>Laji</label><select id="edit-act-type">${typeOptions}</select></div>
    <div class="form-row"><label>Kesto (min)</label><input type="text" inputmode="numeric" id="edit-act-duration" value="${a.duration_min ?? ''}"></div>
    <div class="form-row"><label>Kalorit</label><input type="text" inputmode="numeric" id="edit-act-calories" value="${a.calories ?? ''}"></div>
    <div class="form-row"><label>Syke (avg)</label><input type="text" inputmode="numeric" id="edit-act-hr" value="${a.avg_heart_rate ?? ''}"></div>
    <div class="form-row"><label>Matka (km)</label><input type="text" inputmode="decimal" id="edit-act-km" value="${a.distance_km ?? ''}"></div>
    <button class="btn btn-primary" id="edit-act-save-btn">Tallenna</button>
    <button class="btn" id="edit-act-delete-btn" style="margin-top:8px;background:var(--surface2);color:var(--red);width:100%;">Poista</button>
    <button class="btn" id="edit-act-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Peruuta</button>
    <div class="status" id="edit-act-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('edit-act-save-btn').onclick = async () => {
    const date = document.getElementById('edit-act-date').value;
    if (!date) { showStatus('edit-act-status', 'Valitse päivämäärä', true); return; }
    const saveBtn = document.getElementById('edit-act-save-btn');
    saveBtn.disabled = true;
    try {
      await updateActivity(a.id, {
        activity_date:  date,
        activity_type:  document.getElementById('edit-act-type').value,
        duration_min:   parseNum('edit-act-duration'),
        calories:       parseNum('edit-act-calories'),
        avg_heart_rate: parseNum('edit-act-hr'),
        distance_km:    parseFloat((document.getElementById('edit-act-km').value || '').replace(',','.')) || null,
      });
      overlay.remove();
      await loadActivities();
    } catch (err) {
      showStatus('edit-act-status', 'Tallennus epäonnistui', true);
      saveBtn.disabled = false;
    }
  };

  document.getElementById('edit-act-delete-btn').onclick = async () => {
    const deleteBtn = document.getElementById('edit-act-delete-btn');
    deleteBtn.disabled = true;
    try {
      await deleteActivity(a.id);
      overlay.remove();
      await loadActivities();
    } catch (err) {
      showStatus('edit-act-status', 'Poisto epäonnistui', true);
      deleteBtn.disabled = false;
    }
  };

  document.getElementById('edit-act-cancel-btn').onclick = () => overlay.remove();
}
```

Huom: `parseNum(id)` ja `showStatus(id, msg, isErr)` ovat jo olemassa olevia apufunktioita (käytetty mm. Kestävyystavoitteet-modaalissa) — ei uudelleenmääritellä, vain kutsutaan.

- [ ] **Step 4: Käynnistä paikallinen palvelin ja testaa manuaalisesti**

```bash
cd /Users/patrikfriis/Projects/treeniapp
python3 -m http.server 8080 &
```

Navigoi `http://localhost:8080/index.html`, siirry Aerobia-sivulle. Klikkaa "Viimeiset"-listan riviä → modaali avautuu esitäytetyillä kentillä. Muokkaa kestoa, paina Tallenna → modaali sulkeutuu, lista päivittyy uudella arvolla. Klikkaa toista riviä, paina Poista → rivi katoaa listasta. Tarkista selaimen konsoli virheiden varalta.

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: aktiviteettien avaus/muokkaus/poisto Aerobia-sivulla"
```

---

### Task 2: CSV-vienti aktiviteeteille ja salilokeille

**Files:**
- Modify: `index.html:1149-1150` (sidebar, uudet napit)
- Modify: `index.html` (uudet funktiot `downloadCSV`, `exportActivitiesCSV`, `exportWorkoutSetsCSV`)

**Konteksti ennen muutosta** (`index.html:1147-1150`):

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">⌚</span> Kalorikerroin
  </button>
</div>
```

- [ ] **Step 1: Lisää sidebar-napit**

Korvaa yllä oleva lohko:

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">⌚</span> Kalorikerroin
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Vie data</div>
  <button onclick="exportActivitiesCSV()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">📤</span> Vie aktiviteetit (CSV)
  </button>
  <button onclick="exportWorkoutSetsCSV()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">📤</span> Vie salilokit (CSV)
  </button>
</div>
```

- [ ] **Step 2: Lisää CSV-apufunktiot**

Lisää seuraavat kolme funktiota heti `openEditActivityDialog()`-funktion (Task 1) jälkeen:

```js
function downloadCSV(filename, headers, rows) {
  const escapeCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escapeCSV).join(',')];
  rows.forEach(row => lines.push(row.map(escapeCSV).join(',')));
  const csv = lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportActivitiesCSV() {
  const { data, error } = await sb.from('activity_data').select('*').order('activity_date', { ascending: false });
  if (error) { console.error('exportActivitiesCSV failed:', error.message); return; }
  const headers = ['activity_date', 'activity_type', 'duration_min', 'calories', 'avg_heart_rate', 'distance_km'];
  const rows = (data || []).map(a => [a.activity_date, a.activity_type, a.duration_min, a.calories, a.avg_heart_rate, a.distance_km]);
  downloadCSV(`treeniapp-aktiviteetit-${localIso(new Date())}.csv`, headers, rows);
}

async function exportWorkoutSetsCSV() {
  const { data, error } = await sb.from('workout_sets').select('*').order('workout_date', { ascending: false });
  if (error) { console.error('exportWorkoutSetsCSV failed:', error.message); return; }
  const headers = ['workout_date', 'exercise_name', 'set_number', 'weight_kg', 'reps', 'session_type'];
  const rows = (data || []).map(s => [s.workout_date, s.exercise_name, s.set_number, s.weight_kg, s.reps, s.session_type]);
  downloadCSV(`treeniapp-salilokit-${localIso(new Date())}.csv`, headers, rows);
}
```

Huom: `localIso(date)` on jo olemassa oleva apufunktio (palauttaa `YYYY-MM-DD`-merkkijonon) — ei uudelleenmääritellä.

- [ ] **Step 3: Testaa manuaalisesti**

Avaa Valikko, klikkaa "Vie aktiviteetit (CSV)" → selain lataa tiedoston `treeniapp-aktiviteetit-<pvm>.csv`. Avaa tiedosto tekstieditorissa tai taulukkolaskennassa, tarkista että otsikkorivi ja data täsmäävät Supabasen `activity_data`-tauluun. Toista "Vie salilokit (CSV)":lle, tarkista `workout_sets`-taulua vasten.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: CSV-vienti aktiviteeteille ja salilokeille"
```

---

### Task 3: ms-week / ms-month näkyviin Koonnissa

**Files:**
- Modify: `index.html:828-844` (Koonti-sivun hero-metrics)
- Modify: `index.html:1667-1713` (`loadMotivationSummary()`)

**Konteksti ennen muutosta** (`index.html:828-844`):

```html
  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon">🔥</div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏋️</div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏃</div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>
```

- [ ] **Step 1: Lisää toinen rivi hero-metrics-ruudukon jälkeen**

Korvaa yllä oleva lohko (lisää uusi `<div class="hero-metrics">`-rivi heti ensimmäisen sulkevan `</div>`:n jälkeen):

```html
  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon">🔥</div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏋️</div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏃</div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>

  <div class="hero-metrics" style="grid-template-columns:1fr 1fr">
    <div class="hero-metric">
      <div class="hero-metric-icon">📅</div>
      <div class="hero-metric-val" id="koonti-ms-week">—</div>
      <div class="hero-metric-label">viikon aktiivisuus</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🗓️</div>
      <div class="hero-metric-val" id="koonti-ms-month">—</div>
      <div class="hero-metric-label">kuukausi</div>
    </div>
  </div>
```

- [ ] **Step 2: Kirjoita arvot uusiin elementteihin `loadMotivationSummary()`:ssa**

Muokkaa `index.html:1673-1695`. Nykyinen sisältö:

```js
  const { data: actMonth } = await sb.from('activity_data').select('id')
    .gte('activity_date', monthStart).lte('activity_date', monthEnd);
  const monthCount = actMonth ? actMonth.length : 0;
  const msMonthEl = document.getElementById('ms-month');
  if (msMonthEl) msMonthEl.textContent = monthCount + ' krt';

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
```

Korvaa tällä (lisää `koonti-ms-month`-kirjoitus `msMonthEl`-lohkon jälkeen, ja `koonti-ms-week`-kirjoitus `msWeekEl`-lohkon jälkeen):

```js
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
```

- [ ] **Step 3: Testaa manuaalisesti**

Navigoi Koonti-sivulle. Tarkista että hero-metrics-ruudukon alla näkyy uusi rivi kahdella arvolla ("viikon aktiivisuus" %-lukuna, "kuukausi" krt-lukuna), kumpikaan ei jää "—"-tilaan. Tarkista konsoli virheiden varalta.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: näytä viikkoaktiivisuus ja kuukauden treenit Koonnissa"
```

---

### Task 4: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko sub-projektin läpikäynti selaimessa**

Käy läpi kaikki kolme spesissä (`docs/superpowers/specs/2026-07-08-piilossa-oleva-data-design.md`) mainittua testauskohtaa vielä kerran yhdessä istunnossa peräkkäin (aktiviteetin muokkaus/poisto, molemmat CSV-viennit, ms-week/ms-month näkyvyys), varmistaen ettei mikään aiempi ominaisuus (Koonti, Aerobia, Valikko) ole rikkoutunut. Tarkista konsoli koko ajan.

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.10.0` arvoon `v1.11.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.11.0: piilossa oleva data näkyviin"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Speksin kaikki kolme osa-aluetta (aktiviteetin CRUD, CSV-vienti, ms-week/ms-month) on katettu Task 1–3:ssa, testaus Task 4:ssä.
- **Tyyppijohdonmukaisuus:** `openEditActivityDialog(activityId)` käyttää `lastActivities`-cachea samaan tapaan kuin olemassa oleva `foodDayEntries`/`openEditEntryDialog`-pari. `updateActivity`/`deleteActivity` peilaavat `updateFoodLogEntryAmount`/`deleteFoodLogEntry`-nimeämismallia. `koonti-ms-week`/`koonti-ms-month` peilaavat olemassa olevaa `koonti-ms-streak`-nimeämismallia.
- **Ei placeholdereita:** Kaikki koodilohkot ovat täydellisiä.
