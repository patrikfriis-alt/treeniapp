# Onboarding-tarkistuslista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lisää Koonti-sivun yläreunaan kevyt, ohitettava tarkistuslista-kortti, joka ohjaa uuden tyhjän tilin läpi kolmen perusasian asettamisen (harjoitusohjelma, ravintotavoitteet, kestävyystavoitteet) ja katoaa pysyvästi kun kaikki on hoidettu tai käyttäjä ohittaa sen.

**Architecture:** Uusi `onboarding_completed`-boolean-sarake olemassa olevaan yhden rivin `app_settings`-tauluun. Yksi uusi `.card`-lohko Koonti-sivun HTML:ään, renderöidään `loadKoonti()`:n yhteydessä johtamalla valmiustila suoraan jo ladatusta datasta (SESS, nutrition_goals, activity_goals) — ei uusia per-kohde-flageja eikä uutta wizard-komponenttia.

**Tech Stack:** Vanilla JS, Supabase JS client v2, ei build-stepiä (yksi `index.html`-tiedosto).

---

### Task 1: Supabase-migraatio — onboarding_completed-sarake

**Files:**
- Create: `supabase/migrations/20260708_onboarding.sql`

- [ ] **Step 1: Kirjoita migraatiotiedosto**

```sql
-- Onboarding: onboarding_completed-sarake app_settings-tauluun

alter table app_settings
  add column onboarding_completed boolean not null default false;
```

- [ ] **Step 2: Näytä SQL käyttäjälle ja pyydä ajamaan se Supabasen SQL-editorissa**

Tulosta tiedoston koko sisältö chattiin ja pyydä käyttäjää ajamaan se Supabase-projektin SQL-editorissa. Odota käyttäjän vahvistus (esim. "tehty") ennen kuin jatkat.

- [ ] **Step 3: Vahvista muutos REST-rajapinnan kautta**

Hae `SB_URL` ja `SB_KEY` arvot `index.html`-tiedostosta (`grep -n "SB_URL = \|SB_KEY = " index.html`), aja sitten:

```bash
curl -s "$SB_URL/rest/v1/app_settings?select=id,onboarding_completed" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
```

Odotettu: JSON-vastaus jossa `onboarding_completed` on mukana kentissä (arvo `false` tai olemassa olevan rivin mukainen), ei virhettä puuttuvasta sarakkeesta.

- [ ] **Step 4: Committaa migraatiotiedosto**

```bash
git add supabase/migrations/20260708_onboarding.sql
git commit -m "feat: lisää onboarding_completed-sarake app_settings-tauluun"
```

---

### Task 2: Onboarding-kortti Koontiin

**Files:**
- Modify: `index.html:819-821` (Koonti-sivun HTML, kortin lisäys)
- Modify: `index.html:2054-2064` (app_settings-lohko, uusi save-funktio)
- Modify: `index.html:3521` (`loadKoonti()`, kortin renderöinnin kytkentä)

**Konteksti ennen muutosta** — Koonti-sivun alkuosa (`index.html:817-822`):

```html
<!-- ── KOONTI ─────────────────────────────────────────────────── -->
<div id="page-koonti" class="page active">
  <div class="koonti-greeting">Hei! 👋</div>
  <div class="koonti-date" id="koonti-date"></div>

  <div class="hero-metrics">
```

`app_settings`-lohko (`index.html:2049-2064`):

```js
/* ═══════════════════════════════════════════════════════════════
   ACTIVITIES
═══════════════════════════════════════════════════════════════ */
let appSettings = null;

async function loadAppSettings() {
  const { data, error } = await sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('loadAppSettings failed:', error.message); return null; }
  return data;
}

async function saveCalorieCorrection(multiplier) {
  const { error } = await sb.from('app_settings')
    .upsert({ id: 1, calorie_correction: multiplier, updated_at: new Date().toISOString() });
  if (error) { console.error('saveCalorieCorrection failed:', error.message); throw error; }
}
```

`loadKoonti()`:n alku (`index.html:3521-3528`):

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();

  const todayIso = localIso(new Date());
```

- [ ] **Step 1: Lisää kortin HTML Koonti-sivulle**

Muokkaa `index.html:817-822` seuraavasti (lisää uusi `<div class="card" id="onboarding-card">`-lohko `koonti-date`-rivin jälkeen, ennen `hero-metrics`-lohkoa):

```html
<!-- ── KOONTI ─────────────────────────────────────────────────── -->
<div id="page-koonti" class="page active">
  <div class="koonti-greeting">Hei! 👋</div>
  <div class="koonti-date" id="koonti-date"></div>

  <div class="card" id="onboarding-card" style="display:none">
    <div class="card-title">Aloita tästä</div>
    <div id="onboarding-rows"></div>
    <button class="btn" id="onboarding-skip-btn" onclick="skipOnboarding()" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Ohita</button>
  </div>

  <div class="hero-metrics">
```

- [ ] **Step 2: Lisää `saveOnboardingCompleted()`-funktio app_settings-lohkoon**

Muokkaa `index.html:2060-2064` (`saveCalorieCorrection`-funktion jälkeen) lisäämällä uusi funktio heti perään:

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

- [ ] **Step 3: Lisää `renderOnboardingCard()` ja `skipOnboarding()` -funktiot**

Lisää nämä kaksi funktiota heti `saveOnboardingCompleted()`-funktion jälkeen (samaan kohtaan Step 2:sta):

```js
async function renderOnboardingCard() {
  const card = document.getElementById('onboarding-card');
  appSettings = await loadAppSettings();
  if (appSettings && appSettings.onboarding_completed) {
    card.style.display = 'none';
    return;
  }

  const hasProgram = Object.keys(SESS).length > 0;

  const nGoals = await loadNutritionGoals();
  const hasNutritionGoals = !!(nGoals && nGoals.daily_kcal != null);

  if (!activityGoals) activityGoals = await loadActivityGoals();
  const hasActivityGoals = !!(activityGoals && (
    activityGoals.weekly_km != null ||
    activityGoals.weekly_sessions != null ||
    activityGoals.target_pace_min_per_km != null
  ));

  if (hasProgram && hasNutritionGoals && hasActivityGoals) {
    await saveOnboardingCompleted();
    card.style.display = 'none';
    return;
  }

  const rows = [
    { done: hasProgram,        label: 'Luo harjoitusohjelma',       action: "showPage('ohjelma', null)" },
    { done: hasNutritionGoals, label: 'Aseta ravintotavoitteet',    action: 'openGoalsModal()' },
    { done: hasActivityGoals,  label: 'Aseta kestävyystavoitteet',  action: 'openActivityGoalsModal()' },
  ];
  document.getElementById('onboarding-rows').innerHTML = rows.map(r => `
    <div class="hist-item" style="cursor:pointer" onclick="${r.action}">
      <div class="hist-label">${r.done ? '✓' : '○'} ${r.label}</div>
    </div>
  `).join('');
  card.style.display = '';
}

async function skipOnboarding() {
  await saveOnboardingCompleted();
  document.getElementById('onboarding-card').style.display = 'none';
}
```

**Huomio:** `activityGoals`-muuttuja on jo olemassa moduulitason muuttujana (`index.html:3310`, Kestävyystavoitteet-ominaisuudesta) — sitä käytetään uudelleen tässä, ei määritellä uudestaan. `loadNutritionGoals()` ja `loadActivityGoals()` ovat myös jo olemassa (Ravintotavoitteet- ja Kestävyystavoitteet-ominaisuuksista).

- [ ] **Step 4: Kytke `renderOnboardingCard()` `loadKoonti()`:n alkuun**

Muokkaa `index.html:3521-3528`:

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();

  const todayIso = localIso(new Date());
```

(`renderOnboardingCard()` ei ole `await`-kutsuttu, samaan tapaan kuin `loadWeekSummary()` ja `loadMotivationSummary()` rivillä yllä — kortti renderöityy asynkronisesti eikä hidasta muun Koonti-sivun latausta.)

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: lisää onboarding-tarkistuslista Koonti-sivulle"
```

---

### Task 3: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Käynnistä paikallinen palvelin ja avaa selaimessa**

```bash
python3 -m http.server 8080 &
```

Navigoi `http://localhost:8080/index.html`, tarkista konsoli virheiden varalta.

- [ ] **Step 2: Testaa tyhjän tilin tila**

Jos testitilillä on jo ohjelma/tavoitteita asetettuna aiemmista ominaisuuksista, tyhjennä väliaikaisesti testausta varten (esim. aseta `activity_goals`- ja `nutrition_goals`-rivien kentät nulliksi suoraan REST-rajapinnan kautta, älä poista SESS-dataa pysyvästi ellei se ole jo tyhjä). Varmista, että Koonnissa näkyy "Aloita tästä" -kortti kolmella rivillä, ei yhtään ✓-merkkiä (jos ohjelma on jo olemassa aiemmista ominaisuuksista, sen rivi näyttää valmiiksi ✓:n — tämä on odotettu, koska valmius johdetaan oikeasta datasta).

- [ ] **Step 3: Testaa "Ohita"-painike**

Klikkaa "Ohita". Kortin pitää kadota heti. Lataa sivu uudelleen (F5-tyyppinen refresh selaimen navigoinnilla) — kortti ei saa palata näkyviin.

- [ ] **Step 4: Testaa automaattinen valmistuminen**

Palauta `onboarding_completed` takaisin `false`:ksi REST-rajapinnan kautta (PATCH `app_settings?id=eq.1` body `{"onboarding_completed":false}`). Lataa sivu uudelleen. Aseta vuorotellen kaikki kolme puuttuvaa kohdetta (luo sessio Ohjelma-sivulla jos SESS on tyhjä, aseta ravintotavoite `daily_kcal`-kenttään arvo, aseta kestävyystavoite). Palaa Koontiin jokaisen jälkeen ja tarkista rivin ✓-merkki. Kun kaikki kolme on ✓, kortti katoaa automaattisesti seuraavalla Koonti-latauksella ilman "Ohita"-klikkausta.

- [ ] **Step 5: Palauta testidata siistiin tilaan**

Jos Step 2/4:ssä muokattiin oikeita `nutrition_goals`/`activity_goals`-arvoja pelkkää testausta varten, palauta ne REST-rajapinnan kautta takaisin siihen tilaan mikä niissä oli ennen testausta (tai käyttäjän oikeiden tavoitteiden mukaisiksi, jos käyttäjä niin haluaa).

- [ ] **Step 6: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.8.0` arvoon `v1.9.0`.

- [ ] **Step 7: Committaa**

```bash
git add index.html
git commit -m "v1.9.0: onboarding-tarkistuslista"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Kaikki speksin kohdat (datamalli, valmiuden tunnistus, kortin sijainti/käyttäytyminen, Ohita-nappi, automaattinen valmistuminen, testaus) on katettu Task 1–3:ssa.
- **Tyyppijohdonmukaisuus:** `activityGoals`-muuttuja ja `loadActivityGoals()`/`openActivityGoalsModal()` ovat identtiset Kestävyystavoitteet-ominaisuuden nimien kanssa (index.html:3310+). `loadNutritionGoals()`/`openGoalsModal()` identtiset Ravintotavoitteet-ominaisuuden kanssa. `SESS`/`showPage()` identtiset Ohjelmaeditori-ominaisuuden kanssa.
- **Ei placeholdereita:** Kaikki koodilohkot ovat täydellisiä, ei TBD/TODO-merkintöjä.
