# Kalorivaje Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laske ja näytä päivän ja viikon kalorivaje/-ylijäämä Koonti-sivulla, perustuen BMR-arvioon (Katch-McArdle tai Mifflin-St Jeor) plus kirjattu liikunta miinus kirjattu ruoka.

**Architecture:** Uusi `user_profile`-taulu (sukupuoli/pituus/syntymäaika, single-row kuten `app_settings`). Uudet JS-apufunktiot laskevat BMR:n tuoreimmasta painomittauksesta + profiilista, ja kalorisummat annetulta päivämääräväliltä. Päivän vaje näkyy uutena Koonti-sivun hero-mittarina, viikon vaje uutena rivinä "Tällä viikolla" -kortissa.

**Tech Stack:** Vanilla JS, Supabase, sama `sbWrite()`-offline-jono-mekanismi kuin muissa kirjoituksissa.

---

### Task 1: Migraatio

**Files:**
- Create: `supabase/migrations/20260713_kalorivaje.sql`

- [ ] **Step 1: Kirjoita migraatiotiedosto**

```sql
-- Kalorivaje: user_profile-taulu (sukupuoli/pituus/syntymäaika BMR-laskentaan)

create table user_profile (
  id         bigint primary key default 1 check (id = 1),
  sex        text check (sex in ('male','female')),
  height_cm  numeric,
  birth_date date,
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

create policy user_profile_select on user_profile
  for select to anon, authenticated using (true);
create policy user_profile_insert on user_profile
  for insert to anon, authenticated with check (true);
create policy user_profile_update on user_profile
  for update to anon, authenticated using (true) with check (true);
```

- [ ] **Step 2: Committaa**

```bash
git add supabase/migrations/20260713_kalorivaje.sql
git commit -m "feat: migraatio kalorivajeelle (user_profile-taulu)"
```

**Huom implementoijalle:** ÄLÄ yritä ajaa tätä migraatiota tietokantaan. Pelkkä tiedoston kirjoittaminen ja committaaminen riittää — käyttäjä ajaa SQL:n itse.

---

### Task 2: BMR- ja kalorilaskentafunktiot

**Files:**
- Modify: `index.html` (uusi JS-lohko)

**Konteksti ennen muutosta** — heti `loadAppSettings()`-funktion yläpuolella (`grep -n "async function loadAppSettings" index.html` löytää tämän, rivi 2401):

```js
async function loadAppSettings() {
  const { data, error } = await sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('loadAppSettings failed:', error.message); return null; }
  return data;
}
```

- [ ] **Step 1: Lisää KALORIVAJE-lohko `loadAppSettings()`:n yläpuolelle**

Lisää seuraava lohko heti ennen `async function loadAppSettings() {`-riviä:

```js
/* ═══════════════════════════════════════════════════════════════
   KALORIVAJE
═══════════════════════════════════════════════════════════════ */
function calcAge(birthDateIso) {
  const today = new Date();
  const birth = new Date(birthDateIso);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function loadUserProfile() {
  const { data, error } = await sb.from('user_profile').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('loadUserProfile failed:', error.message); return null; }
  return data;
}

function calcBmr(profile, weightRow) {
  const weight = weightRow.weight_kg;
  const height = profile.height_cm;
  if (weightRow.fat_pct != null) {
    const leanMass = weight * (1 - weightRow.fat_pct / 100);
    return Math.round(370 + 21.6 * leanMass);
  }
  const age = calcAge(profile.birth_date);
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(profile.sex === 'male' ? base + 5 : base - 161);
}

async function getBmrInfo() {
  const profile = await loadUserProfile();
  if (!profile || !profile.sex || !profile.height_cm || !profile.birth_date) {
    return { bmr: null, missingProfile: true, missingWeight: false };
  }
  const { data: weightRows, error } = await sb.from('body_metrics').select('weight_kg,fat_pct')
    .order('measured_at', { ascending: false }).limit(1);
  if (error) console.error('getBmrInfo weight fetch failed:', error.message);
  const weightRow = weightRows && weightRows[0];
  if (!weightRow || weightRow.weight_kg == null) {
    return { bmr: null, missingProfile: false, missingWeight: true };
  }
  return { bmr: calcBmr(profile, weightRow), missingProfile: false, missingWeight: false };
}

async function getExerciseCalories(fromIso, toIso) {
  if (!appSettings) appSettings = await loadAppSettings();
  const correction = (appSettings && appSettings.calorie_correction) ?? 1;
  const [{ data: actData }, { data: sessData }] = await Promise.all([
    sb.from('activity_data').select('calories').gte('activity_date', fromIso).lte('activity_date', toIso),
    sb.from('workout_sessions').select('calories').gte('workout_date', fromIso).lte('workout_date', toIso),
  ]);
  const actKcal  = (actData  || []).reduce((s, r) => s + (r.calories != null ? r.calories * correction : 0), 0);
  const sessKcal = (sessData || []).reduce((s, r) => s + (r.calories || 0), 0);
  return actKcal + sessKcal;
}

async function getFoodCalories(fromIso, toIso) {
  const { data, error } = await sb.from('food_log_entries').select('kcal')
    .gte('logged_at', fromIso).lte('logged_at', toIso);
  if (error) { console.error('getFoodCalories failed:', error.message); return 0; }
  return (data || []).reduce((s, r) => s + (r.kcal || 0), 0);
}

async function loadAppSettings() {
  const { data, error } = await sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('loadAppSettings failed:', error.message); return null; }
  return data;
}
```

(Huom: yllä oleva sisältää olemassa olevan `loadAppSettings()`-funktion muuttumattomana lohkon lopussa — varmista ettet luo sitä kahteen kertaan, vain KALORIVAJE-lohko on uutta.)

- [ ] **Step 2: Testaa manuaalisesti selaimen konsolissa**

Käynnistä paikallinen palvelin (`python3 -m http.server 8080`), lataa sivu, avaa konsoli:

```js
calcAge('1990-06-15')
```

Tarkista palauttaa oikean iän tämänhetkiseen päivämäärään nähden (kokonaisluku).

```js
calcBmr({ sex: 'male', height_cm: 180, birth_date: '1990-06-15' }, { weight_kg: 80, fat_pct: null })
```

Tarkista tulos vastaa Mifflin-St Jeor -kaavaa käsin laskien (`10×80 + 6.25×180 − 5×ikä + 5`).

```js
calcBmr({ sex: 'male', height_cm: 180, birth_date: '1990-06-15' }, { weight_kg: 80, fat_pct: 20 })
```

Tarkista tulos vastaa Katch-McArdlea (`370 + 21.6 × (80×0.8)`).

```js
await getBmrInfo()
```

Tarkista palauttaa `{ bmr: null, missingProfile: true, missingWeight: false }` (koska `user_profile`-taulua ei ole vielä luotu/täytetty tässä vaiheessa).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: BMR- ja kalorilaskentafunktiot (Katch-McArdle/Mifflin-St Jeor)"
```

---

### Task 3: Profiili-asetusmodaali sivupalkkiin

**Files:**
- Modify: `index.html` (sivupalkki, uusi JS-modaalifunktio)

**Konteksti ennen muutosta** — sivupalkki:

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
  <button onclick="toggleNotifications()" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
```

- [ ] **Step 1: Lisää Profiili-rivi sivupalkkiin**

Korvaa yllä oleva lohko:

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
  <button onclick="openProfileModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="scale" style="display:inline-flex"></span> Profiili
  </button>
  <button onclick="toggleNotifications()" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
```

**Konteksti ennen muutosta** — `openCalorieSettingsModal()`-funktion loppu (`grep -n "async function openCalorieSettingsModal" index.html` löytää tämän):

```js
async function openCalorieSettingsModal() {
  closeSidebar();
```

- [ ] **Step 2: Lisää openProfileModal()-funktio heti openCalorieSettingsModal():n yläpuolelle**

Lisää seuraava funktio heti ennen `async function openCalorieSettingsModal() {`-riviä:

```js
async function openProfileModal() {
  closeSidebar();
  const profile = (await loadUserProfile()) || {};

  const existing = document.getElementById('profile-settings-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'profile-settings-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;';

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Profiili</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">Käytetään kalorivajeen laskentaan (lepoaineenvaihdunta). Paino haetaan aina tuoreimmasta Keho-mittauksesta.</div>
    <div class="form-row"><label>Sukupuoli</label>
      <select id="profile-sex">
        <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Mies</option>
        <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Nainen</option>
      </select>
    </div>
    <div class="form-row"><label>Pituus (cm)</label><input type="text" inputmode="numeric" id="profile-height" value="${profile.height_cm ?? ''}"></div>
    <div class="form-row"><label>Syntymäaika</label><input type="date" id="profile-birthdate" value="${profile.birth_date ?? ''}"></div>
    <button class="btn btn-primary" id="profile-settings-save-btn">Tallenna</button>
    <button class="btn" id="profile-settings-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="profile-settings-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('profile-settings-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('profile-settings-save-btn');
    const sex = document.getElementById('profile-sex').value;
    const height = parseNum('profile-height');
    const birthDate = document.getElementById('profile-birthdate').value;
    if (!height || height < 100 || height > 250) {
      showStatus('profile-settings-status', 'Syötä pituus välillä 100-250 cm', true);
      return;
    }
    if (!birthDate) {
      showStatus('profile-settings-status', 'Valitse syntymäaika', true);
      return;
    }
    saveBtn.disabled = true;
    const { error } = await sbWrite({
      table: 'user_profile',
      op: 'upsert',
      payload: { id: 1, sex, height_cm: height, birth_date: birthDate, updated_at: new Date().toISOString() },
    });
    saveBtn.disabled = false;
    if (error) { showStatus('profile-settings-status', 'Virhe: ' + error.message, true); return; }
    showStatus('profile-settings-status', 'Tallennettu!', false);
    loadDeficitHeroMetric();
    loadWeeklyReportCard();
    setTimeout(() => { const ov = document.getElementById('profile-settings-overlay'); if (ov) ov.remove(); }, 800);
  };

  document.getElementById('profile-settings-cancel-btn').onclick = () => overlay.remove();
}

async function openCalorieSettingsModal() {
  closeSidebar();
```

(Huom: `loadDeficitHeroMetric()`-kutsu tallennuksen jälkeen viittaa Task 4:ssä luotavaan funktioon — tämä on odotettua, funktio on olemassa siinä vaiheessa kun koko plani on suoritettu loppuun. Jos Task 3 testataan ennen Task 4:ää, tämä rivi aiheuttaa `ReferenceError`in konsoliin napin painalluksen yhteydessä, mutta ei estä profiilin tallentumista tietokantaan — tallennus (`sbWrite`-kutsu) tapahtuu ennen tätä riviä.)

- [ ] **Step 3: Testaa manuaalisesti**

Avaa Valikko-sivupalkki, tarkista "Profiili"-rivi näkyy vaaka-ikonilla Kalorikerroin-rivin alla. Klikkaa, tarkista modaali avautuu kentillä Sukupuoli/Pituus/Syntymäaika. Täytä kentät (esim. Mies, 180, 1990-06-15), paina Tallenna. Tarkista Supabasesta (`curl` PostgREST-rajapintaan `user_profile`-taulua vasten) että rivi tallentui oikein.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: Profiili-asetusmodaali sivupalkkiin"
```

---

### Task 4: Päivän vaje -hero-mittari Koontiin

**Files:**
- Modify: `index.html` (Koonti-sivun toinen hero-mittari-rivi, uusi JS-funktio, `loadKoonti()`)

**Konteksti ennen muutosta** — Koonti-sivun toinen hero-mittari-rivi:

```html
  <div class="hero-metrics" style="grid-template-columns:1fr 1fr">
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
  </div>
```

- [ ] **Step 1: Muuta rivi 3-sarakkeiseksi ja lisää Päivän vaje -mittari**

Korvaa yllä oleva lohko:

```html
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

(Huom: poistettu `style="grid-template-columns:1fr 1fr"` — `.hero-metrics`-luokan oletusarvo on jo `1fr 1fr 1fr`, sama kuin ylemmässä rivissä.)

**Konteksti ennen muutosta** — `loadKoonti()`-funktion alku:

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  initNotifToggle();
  loadWeeklyReportCard();
```

- [ ] **Step 2: Lisää loadDeficitHeroMetric()-funktio ja kutsu se loadKoonti():sta**

Korvaa yllä oleva lohko (lisää `loadDeficitHeroMetric();` `loadWeeklyReportCard();`-rivin jälkeen):

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  initNotifToggle();
  loadWeeklyReportCard();
  loadDeficitHeroMetric();
```

Lisää itse `loadDeficitHeroMetric()`-funktio `loadKoonti()`-funktion loppuun. Etsi tarkka ankkuri (`grep -n "kcal tänään" index.html`):

```js
  const totalKcal = entries.reduce((s, e) => s + (e.kcal || 0), 0);
  kcRuokaSub.textContent = entries.length ? `${Math.round(totalKcal)} kcal tänään` : 'Ei kirjauksia tänään';
}


function toggleSidebar() {
```

Korvaa yllä oleva lohko (lisää uusi funktio `loadKoonti()`:n päättävän `}`-rivin ja `function toggleSidebar()`:n väliin):

```js
  const totalKcal = entries.reduce((s, e) => s + (e.kcal || 0), 0);
  kcRuokaSub.textContent = entries.length ? `${Math.round(totalKcal)} kcal tänään` : 'Ei kirjauksia tänään';
}

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

- [ ] **Step 3: Testaa manuaalisesti**

Ilman profiilia asetettuna: lataa Koonti-sivu, tarkista uusi mittari näyttää "Aseta →" / "profiili", ja sen klikkaaminen avaa Profiili-modaalin. Aseta profiili (Task 3:n testissä jo tehty), lataa Koonti-sivu uudelleen: tarkista mittari näyttää lasketun kcal-arvon oikealla etumerkillä. Kirjaa päivälle ruokaa (Ruoka-sivulla), lataa Koonti uudelleen, tarkista luku pienenee syödyn kalorimäärän verran.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: Päivän vaje -hero-mittari Koonti-sivulle"
```

---

### Task 5: Viikon vaje -rivi "Tällä viikolla" -korttiin

**Files:**
- Modify: `index.html` (`loadWeeklyReportCard()`)

**Konteksti ennen muutosta:**

```js
  if (thisWeek.weightDelta != null) {
    const sign = thisWeek.weightDelta >= 0 ? '+' : '';
    rows.push(`<div class="hist-item"><div class="hist-label">Painon muutos</div><div class="hist-val">${sign}${thisWeek.weightDelta} kg</div></div>`);
  }

  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
```

- [ ] **Step 1: Lisää viikon vaje -rivi ennen rows.join():ia**

Korvaa yllä oleva lohko:

```js
  if (thisWeek.weightDelta != null) {
    const sign = thisWeek.weightDelta >= 0 ? '+' : '';
    rows.push(`<div class="hist-item"><div class="hist-label">Painon muutos</div><div class="hist-val">${sign}${thisWeek.weightDelta} kg</div></div>`);
  }

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

  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
```

- [ ] **Step 2: Testaa manuaalisesti**

Profiili asetettuna (Task 3:sta): lataa Koonti-sivu, tarkista "Tällä viikolla" -kortissa näkyy "Viikon vaje" -rivi lasketulla arvolla. Tarkista arvo on suuruusluokaltaan järkevä (BMR × kuluneet päivät ± liikunta/ruoka). Vaihda Sali-sivulla viikkoa taaksepäin (`←`-nuoli) ja palaa Koontiin: tarkista viikon vaje -rivi käyttää täyttä 7 päivää kertoimena (ei enää tämänhetkistä viikonpäivä-indeksiä).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: Viikon vaje -rivi Tällä viikolla -korttiin"
```

---

### Task 6: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko speksin testauslistan läpikäynti**

Käy läpi speksin (`docs/superpowers/specs/2026-07-13-kalorivaje-design.md`) Testaus-osion kaikki 6 kohtaa:

1. Ennen profiilin asettamista: "Aseta profiili →" näkyy hero-mittarissa, "Tällä viikolla" -kortin vaje-rivi on piilossa.
2. Profiilin asettaminen sivupalkista onnistuu, Koonti päivittyy heti ilman sivun uudelleenlatausta.
3. BMR-kaavan valinta: testaa sekä tapaus jossa tuoreimmassa painomittauksessa on rasva% (Katch-McArdle) että tapaus jossa ei ole (Mifflin-St Jeor) — vaihda tätä väliaikaisesti Keho-sivulla ja tarkista laskettu arvo molemmissa käsin laskien.
4. Ruoan/aktiviteetin kirjaaminen päivittää päivän vajeen oikeaan suuntaan.
5. Viikon vaje kasvaa/pienenee oikein kuluneiden päivien mukaan, käyttää 7 päivää menneelle viikolle.
6. Negatiivinen vaje (ylijäämä) näkyy oikealla etumerkillä ilman väriarvottelua (sama neutraali harmaa kuin muut hero-mittarit).

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.16.0` arvoon `v1.17.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.17.0: Kalorivaje"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Speksin kaikki osat (profiili, BMR-kaava kaksiportaisena, päivän vaje, viikon vaje, puuttuva data, tietokanta, näyttö) on katettu Task 1–5:ssä.
- **Tyyppijohdonmukaisuus:** `getBmrInfo()`:n palauttama `{bmr, missingProfile, missingWeight}`-muoto on identtinen Task 2:ssa määriteltynä ja Task 4/5:ssä käytettynä. `getExerciseCalories(fromIso, toIso)`/`getFoodCalories(fromIso, toIso)` -signatuurit pysyvät samoina molemmissa käyttökohteissa (päivän ja viikon laskenta).
- **Tehokkuushuomio (tietoinen päätös, ei bugi):** `getBmrInfo()` kutsutaan erikseen sekä `loadDeficitHeroMetric()`:ssa (Task 4) että `loadWeeklyReportCard()`:ssa (Task 5) — kumpikin tekee oman profiili+painokyselynsä. Tämä on tarkoituksella yksinkertainen ratkaisu (2 ylimääräistä kevyttä kyselyä per Koonti-lataus) monimutkaisemman välimuistitusmekanismin sijaan, samassa hengessä kuin sovelluksen muukin koodi ei toteuta erillistä per-sivulataus-välimuistia näille kevyille hakuille.
- **Ei placeholdereita:** kaikki koodilohkot täydellisiä, ei TBD/TODO-merkintöjä.
- **Versionumero:** edellisen sub-projektin (Push-ilmoitukset) päätteeksi versio oli v1.16.0, joten tämä nostaa sen v1.17.0:aan.
