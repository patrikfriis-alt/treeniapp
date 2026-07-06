# Ruokapäiväkirja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lisätä Treeniapp:iin ruokapäiväkirja (Fineli-haku, oma tuote, ateriaryhmittely, päivä/viikkotavoitteet) speksin `docs/superpowers/specs/2026-07-06-food-diary-design.md` mukaisesti.

**Architecture:** Kaikki koodi lisätään olemassa olevaan `index.html`-tiedostoon (vanilla JS, ei build-vaihetta) samaa mallia noudattaen kuin muu sovellus: uusi `<div class="page">`, oma CSS-lohko, ja JS-funktiot jotka käyttävät jo alustettua `sb` (Supabase-client) -oliota. Kaksi uutta SQL-migraatiota täydentää olemassa olevaa skeemaa.

**Tech Stack:** Vanilla JS, Supabase JS v2 (CDN), Supabase Postgres + RLS, Fineli REST-API (suora fetch selaimesta, CORS avoin).

---

## Ennakkotiedot koodikannasta (jo varmistettu)

- `sb` = `supabase.createClient(...)`, määritelty `index.html`:n scriptin alussa.
- `localIso(d)` — muotoilee `Date`-olion `YYYY-MM-DD`-merkkijonoksi.
- `parseNum(id)` — lukee `<input>`-elementin arvon `id`:llä, tukee pilkkudesimaalia, palauttaa `null` jos ei numero.
- `showStatus(id, msg, isErr)` — näyttää tekstin `.status`-elementissä 3s ajan.
- `showPage(name, btn)` — vaihtaa aktiivisen `.page`-divin, kutsuu sivukohtaisen latausfunktion.
- CSS-muuttujat: `--surface`, `--surface2`, `--border`, `--border2`, `--text`, `--text2`, `--text3`, `--accent`, `--green`, `--red`, `--radius-sm`/`--rs`, `--radius-md`, `--radius-lg`.
- `.page { padding: 14px 14px 90px; }` — sivun sisältö saa jo 14px vaakasuuntaisen tilan, joten tavalliset kortit (`.card`) eivät lisää omaa vaakamarginaalia. `.seuranta-hero` on poikkeus (oma 12px-marginaali hero-korteille), tätä poikkeusta jatketaan uuden `.food-hero`:n kanssa.
- Ei automaattitestikehystä repossa — kaikki verifiointi tehdään manuaalisesti selaimessa.

**Sovelluksen ajaminen selaimessa verifiointia varten (jokaisen tehtävän jälkeen):**
```bash
cd /Users/patrikfriis/Projects/treeniapp && python3 -m http.server 8000
```
Avaa `http://localhost:8000/index.html` Chromessa (ei `file://`, jotta Supabase/Fineli-kutsut ja service worker toimivat normaalisti).

---

### Task 1: Supabase-migraatio — meal_type ja nutrition_goals

**Files:**
- Create: `supabase/migrations/20260707_food_diary_meal_type_and_goals.sql`

- [ ] **Step 1: Kirjoita migraatiotiedosto**

```sql
-- Ruokapäiväkirja: ateriaryhmittely + ravintotavoitteet

alter table food_log_entries
  add column meal_type text not null
  check (meal_type in ('aamiainen','lounas','paivallinen','valipala'));

create table nutrition_goals (
  id                bigint primary key default 1 check (id = 1),
  daily_kcal        numeric,
  daily_protein_g   numeric,
  daily_carbs_g     numeric,
  daily_fat_g       numeric,
  weekly_kcal       numeric,
  weekly_protein_g  numeric,
  weekly_carbs_g    numeric,
  weekly_fat_g      numeric,
  updated_at        timestamptz not null default now()
);

alter table nutrition_goals enable row level security;

create policy nutrition_goals_select on nutrition_goals
  for select to anon, authenticated using (true);
create policy nutrition_goals_insert on nutrition_goals
  for insert to anon, authenticated with check (true);
create policy nutrition_goals_update on nutrition_goals
  for update to anon, authenticated using (true) with check (true);
```

- [ ] **Step 2: Aja migraatio Supabasen SQL-editorissa**

Avaa `https://supabase.com/dashboard/project/dodrzzgbdlucjbkmxbjn/sql/new`, liitä tiedoston sisältö, aja. Ei automatisoitavissa tästä ympäristöstä (ei service-role-avainta/CLI-yhteyttä) — ihmisen täytyy ajaa tämä manuaalisesti ja vahvistaa "OK, ajettu" ennen seuraavaan tehtävään siirtymistä.

- [ ] **Step 3: Vahvista sarakkeet olemassa**

Aja Supabasen SQL-editorissa:
```sql
select column_name from information_schema.columns where table_name = 'food_log_entries';
select column_name from information_schema.columns where table_name = 'nutrition_goals';
```
Odotettu: `food_log_entries` sisältää `meal_type`; `nutrition_goals` sisältää kaikki 9 saraketta (`id`, 4×daily, 4×weekly, `updated_at`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260707_food_diary_meal_type_and_goals.sql
git commit -m "feat: meal_type-sarake ja nutrition_goals-taulu ruokapäiväkirjaa varten"
```

---

### Task 2: CSS — Ruoka-sivun perustyylit

**Files:**
- Modify: `index.html` (CSS-lohko, `<style>`-osio)

- [ ] **Step 1: Lisää hero-kortin, viikkorivin ja ateriakorttien CSS**

Etsi tämä olemassa oleva kohta (rivit ~589-591):

```css
.seuranta-hero-stat-val   { font-size: 18px; font-weight: 700; color: #fff; }
.seuranta-hero-stat-label { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 2px; }
/* ─── Exercise history modal ─────────────────────────────────── */
```

Korvaa se tällä (lisää uusi lohko ennen exercise-modal-kommenttia, säilytä kommentti sellaisenaan):

```css
.seuranta-hero-stat-val   { font-size: 18px; font-weight: 700; color: #fff; }
.seuranta-hero-stat-label { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 2px; }

/* ─── Ruokapäiväkirja ────────────────────────────────────────── */
.food-hero {
  position: relative; border-radius: 20px; padding: 18px; margin: 12px 12px 10px; overflow: hidden;
  background: linear-gradient(145deg,#0d1b4b 0%,#0a2a6e 40%,#0a84ff 100%);
}
.food-hero-glow {
  position: absolute; top: -20px; right: -20px; width: 140px; height: 140px; border-radius: 50%;
  background: radial-gradient(circle, rgba(10,132,255,0.4) 0%, transparent 70%); pointer-events: none;
}
.food-hero-label { font-size:10px; font-weight:700; letter-spacing:.12em; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-bottom:6px; }
.food-hero-main  { font-size:28px; font-weight:800; color:#fff; letter-spacing:-0.03em; position:relative; }
.food-hero-stats { display:flex; align-items:center; gap:16px; margin-top:14px; position:relative; }
.food-hero-divider { width:1px; height:28px; background:rgba(255,255,255,0.15); flex-shrink:0; }
.food-hero-stat-val { font-size:16px; font-weight:700; color:#fff; }
.food-hero-stat-label { font-size:10px; color:rgba(255,255,255,0.4); margin-top:2px; }

.food-week-row {
  display:flex; justify-content:space-between; align-items:center;
  background:var(--surface); border-radius:12px; padding:10px 14px; margin-bottom:14px;
  font-size:13px; color:var(--text2);
}
.food-week-row .food-week-val { color: var(--green); font-weight:600; }

.meal-card { background: var(--surface); border-radius: var(--radius-lg); padding:12px; margin-bottom:10px; }
.meal-card-header { display:flex; justify-content:space-between; font-size:13px; font-weight:600; color:var(--text); }
.meal-card-kcal { color: var(--text3); font-weight:400; }
.meal-entry-row {
  display:flex; justify-content:space-between; padding:8px 0 0; margin-top:8px;
  border-top:1px solid var(--border2); font-size:13px; color:var(--text2); cursor:pointer;
}
.meal-entry-kcal { color: var(--text3); }
.meal-add-btn {
  width:100%; margin-top:10px; font-size:12px; padding:8px;
  background:var(--surface2); border:1px solid var(--border); border-radius:var(--rs);
  color:var(--text2); cursor:pointer;
}
/* ─── Exercise history modal ─────────────────────────────────── */
```

- [ ] **Step 2: Manuaalinen tarkistus**

Avaa sovellus selaimessa (ks. yllä). Sivu ei vielä näytä muutosta (uusi sivu ei ole vielä olemassa), mutta tarkista devtoolsin konsolista ettei tullut CSS-syntaksivirheitä eikä sivu hajonnut (Treeni-sivu latautuu kuten ennen).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: ruokapäiväkirjan hero-kortin ja ateriakorttien CSS"
```

---

### Task 3: HTML — Navigaatiopainike ja Ruoka-sivun runko

**Files:**
- Modify: `index.html` (`<nav>`, uusi `#page-ruoka`, sivupalkki)

- [ ] **Step 1: Lisää "Ruoka"-painike alanavigaatioon**

Etsi:
```html
  <button onclick="showPage('seuranta',this)">
    <span class="nav-icon">📊</span>
    <span>Seuranta</span>
  </button>
  <button id="hamburger-btn" onclick="toggleSidebar()">
```

Korvaa:
```html
  <button onclick="showPage('seuranta',this)">
    <span class="nav-icon">📊</span>
    <span>Seuranta</span>
  </button>
  <button onclick="showPage('ruoka',this)">
    <span class="nav-icon">🍽️</span>
    <span>Ruoka</span>
  </button>
  <button id="hamburger-btn" onclick="toggleSidebar()">
```

- [ ] **Step 2: Lisää `#page-ruoka`-sivu**

Etsi:
```html
<!-- ── OHJELMA ─────────────────────────────────────────────────── -->
<div id="page-ohjelma" class="page">
  <div id="ohjelma-content"></div>
</div>

<!-- ── SIDEBAR ────────────────────────────────────────────────── -->
```

Korvaa:
```html
<!-- ── OHJELMA ─────────────────────────────────────────────────── -->
<div id="page-ohjelma" class="page">
  <div id="ohjelma-content"></div>
</div>

<!-- ── RUOKA ───────────────────────────────────────────────────── -->
<div id="page-ruoka" class="page">
  <div class="week-nav">
    <button class="week-btn" onclick="changeFoodDay(-1)">←</button>
    <span class="week-label" id="food-day-label">Tänään</span>
    <button class="week-btn" onclick="changeFoodDay(1)">→</button>
  </div>

  <div class="food-hero">
    <div class="food-hero-glow"></div>
    <div class="food-hero-label">RUOKA</div>
    <div class="food-hero-main" id="food-hero-kcal">0 kcal</div>
    <div class="food-hero-stats">
      <div><div class="food-hero-stat-val" id="food-hero-protein">0g</div><div class="food-hero-stat-label">Proteiini</div></div>
      <div class="food-hero-divider"></div>
      <div><div class="food-hero-stat-val" id="food-hero-carbs">0g</div><div class="food-hero-stat-label">Hiilarit</div></div>
      <div class="food-hero-divider"></div>
      <div><div class="food-hero-stat-val" id="food-hero-fat">0g</div><div class="food-hero-stat-label">Rasva</div></div>
    </div>
  </div>

  <div class="food-week-row" id="food-week-row" style="display:none">
    <span>Viikko</span><span class="food-week-val"></span>
  </div>

  <div id="food-meals"></div>
</div>

<!-- ── SIDEBAR ────────────────────────────────────────────────── -->
```

- [ ] **Step 3: Korvaa sivupalkin "Tulossa pian..." Ravintotavoitteet-linkillä**

Etsi:
```html
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Asetukset</div>
  <div style="font-size:13px;color:var(--text3);">Tulossa pian...</div>
```

Korvaa:
```html
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Asetukset</div>
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🎯</span> Ravintotavoitteet
  </button>
```

- [ ] **Step 4: Kytke `showPage`-reititys**

Etsi:
```js
  if (name === 'seuranta')  showSeuranta(seurantaPage);
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
  if (name === 'ohjelma')   renderOhjelma();
}
```

Korvaa:
```js
  if (name === 'seuranta')  showSeuranta(seurantaPage);
  if (name === 'historia')  { populateExerciseDropdown(); loadWorkoutHistory(); loadRunChart(); }
  if (name === 'ohjelma')   renderOhjelma();
  if (name === 'ruoka')     renderRuoka();
}
```

- [ ] **Step 5: Manuaalinen tarkistus**

Avaa sovellus selaimessa. Alanavigaatiossa näkyy nyt 4 painiketta (Treeni/Seuranta/Ruoka/Valikko). Napauta "Ruoka" → sivu vaihtuu, hero-kortti näkyy (arvot "0 kcal"/"0g", koska `renderRuoka` ei vielä ole määritelty — devtools-konsoliin tulee `renderRuoka is not defined`, tämä on odotettua tässä vaiheessa, korjautuu Task 6:ssa). Tarkista sivupalkista että "Ravintotavoitteet"-nappi näkyy Asetukset-otsikon alla.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Ruoka-sivun HTML-runko ja navigaatio"
```

---

### Task 4: HTML + CSS — Hakumodaali

**Files:**
- Modify: `index.html` (uusi `#food-search-modal`, CSS-täydennykset)

- [ ] **Step 1: Lisää hakumodaalin CSS**

Etsi (Task 2:ssa lisätyn lohkon loppu):
```css
.meal-add-btn {
  width:100%; margin-top:10px; font-size:12px; padding:8px;
  background:var(--surface2); border:1px solid var(--border); border-radius:var(--rs);
  color:var(--text2); cursor:pointer;
}
/* ─── Exercise history modal ─────────────────────────────────── */
```

Korvaa:
```css
.meal-add-btn {
  width:100%; margin-top:10px; font-size:12px; padding:8px;
  background:var(--surface2); border:1px solid var(--border); border-radius:var(--rs);
  color:var(--text2); cursor:pointer;
}
.food-search-section-label {
  font-size:11px; font-weight:600; color:var(--text3); text-transform:uppercase;
  letter-spacing:.06em; margin:4px 0 8px;
}
.food-search-result-row {
  display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border2);
  font-size:13px; color:var(--text); cursor:pointer;
}
.food-search-result-kcal { color: var(--text3); }
.food-search-empty { color: var(--text3); font-size:13px; text-align:center; padding:20px 0; }
.food-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; }
.food-amount-name { font-size:15px; font-weight:600; color:var(--text); margin-bottom:14px; }
.food-amount-presets { display:flex; gap:6px; margin-bottom:14px; }
.food-amount-presets .stab { flex:1; }
/* ─── Exercise history modal ─────────────────────────────────── */
```

- [ ] **Step 2: Lisää hakumodaalin HTML**

Etsi (tiedoston loppuosa, ex-modalin jälkeen):
```html
    <div class="ex-modal-sessions-card" id="ex-modal-sessions-list"></div>
  </div>
</div>
</body>
</html>
```

Korvaa:
```html
    <div class="ex-modal-sessions-card" id="ex-modal-sessions-list"></div>
  </div>
</div>

<div id="food-search-modal" class="ex-modal-overlay" style="display:none">
  <div class="ex-modal-header">
    <div class="ex-modal-nav">
      <button class="ex-modal-back" onclick="closeFoodSearch()">← Peruuta</button>
    </div>
    <div class="ex-modal-title" id="food-search-title">Lisää ruoka</div>
  </div>
  <div class="ex-modal-body">

    <div id="food-search-step-list">
      <input type="text" id="food-search-input" placeholder="Hae esim. kananrinta..."
             oninput="onFoodSearchInput()" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
      <div id="food-search-results"></div>
      <div style="text-align:center;margin-top:10px;">
        <span class="food-search-custom-link" onclick="goToCustomFoodStep()">+ Lisää oma tuote</span>
      </div>
    </div>

    <div id="food-search-step-amount" style="display:none">
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100"></div>
      <div class="food-amount-presets">
        <button class="stab" onclick="setFoodAmount(50)">50g</button>
        <button class="stab" onclick="setFoodAmount(100)">100g</button>
        <button class="stab" onclick="setFoodAmount(150)">150g</button>
        <button class="stab" onclick="setFoodAmount(200)">200g</button>
      </div>
      <button class="btn btn-primary" onclick="confirmAddFood()">Lisää</button>
      <div class="status" id="food-amount-status"></div>
    </div>

    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>

  </div>
</div>
</body>
</html>
```

- [ ] **Step 3: Manuaalinen tarkistus**

Avaa sovellus selaimessa, avaa devtools-konsoli. Suorita konsolissa `document.getElementById('food-search-modal').style.display = 'flex'` — modaali täyttää koko ruudun, otsikko "Lisää ruoka", hakukenttä ja "+ Lisää oma tuote" -linkki näkyvät. Sulje konsolista: `document.getElementById('food-search-modal').style.display = 'none'`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: hakumodaalin HTML ja CSS"
```

---

### Task 5: JS — Data-kerroksen apufunktiot ja Supabase-kyselyt

**Files:**
- Modify: `index.html` (uusi JS-lohko ennen UTILITIES-osiota)

- [ ] **Step 1: Lisää päivämääräapufunktiot, tilamuuttujat ja luku-kyselyt**

Etsi:
```js
/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function parseNum(id) {
```

Korvaa:
```js
/* ═══════════════════════════════════════════════════════════════
   RUOKAPÄIVÄKIRJA — data
═══════════════════════════════════════════════════════════════ */
const MEAL_DEFS = [
  { key: 'aamiainen',   icon: '🌅', label: 'Aamiainen' },
  { key: 'lounas',      icon: '☀️', label: 'Lounas' },
  { key: 'paivallinen', icon: '🌇', label: 'Päivällinen' },
  { key: 'valipala',    icon: '🍎', label: 'Välipala' },
];

let foodDayOffset = 0;
let foodDayEntries = [];
let foodGoals = null;

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function entrySource(entry) {
  return entry.food_cache || entry.custom_foods || null;
}

function foodItemName(entry) {
  const src = entrySource(entry);
  if (!src) return '—';
  return entry.food_cache ? src.name_fi : src.name;
}

function entryCarbs(entry) {
  const src = entrySource(entry);
  if (!src) return 0;
  return src.carbs_per_100g * entry.amount_g / 100;
}

function entryFat(entry) {
  const src = entrySource(entry);
  if (!src) return 0;
  return src.fat_per_100g * entry.amount_g / 100;
}

async function loadNutritionGoals() {
  const { data, error } = await sb.from('nutrition_goals').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('loadNutritionGoals failed:', error.message); return null; }
  return data;
}

async function loadFoodDayEntries(dateIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      id, meal_type, amount_g, kcal, protein_g, food_cache_id, custom_food_id,
      food_cache(name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g),
      custom_foods(name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g)
    `)
    .eq('logged_at', dateIso)
    .order('created_at', { ascending: true });
  if (error) { console.error('loadFoodDayEntries failed:', error.message); return []; }
  return data || [];
}

async function loadFoodWeekKcal(mondayIso, sundayIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select('kcal')
    .gte('logged_at', mondayIso)
    .lte('logged_at', sundayIso);
  if (error) { console.error('loadFoodWeekKcal failed:', error.message); return 0; }
  return (data || []).reduce((sum, r) => sum + (r.kcal || 0), 0);
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function parseNum(id) {
```

- [ ] **Step 2: Manuaalinen tarkistus**

Avaa sovellus selaimessa, devtools-konsoliin: `await loadNutritionGoals()` → palauttaa `null` (taulu on vielä tyhjä, tämä on oikea tulos). `mondayOf(new Date()).getDay()` → palauttaa `1` (maanantai). Ei konsolivirheitä sivun latautuessa.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: ruokapäiväkirjan data-kerroksen apufunktiot"
```

---

### Task 6: JS — Ruoka-sivun renderöinti (hero, ateriakortit, päivänavigointi)

**Files:**
- Modify: `index.html` (jatkaa Task 5:n JS-lohkoa)

- [ ] **Step 1: Lisää renderRuoka, loadFoodDay, hero- ja ateriakorttirenderöinti**

Etsi (Task 5:n lisäämän lohkon loppu):
```js
async function loadFoodWeekKcal(mondayIso, sundayIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select('kcal')
    .gte('logged_at', mondayIso)
    .lte('logged_at', sundayIso);
  if (error) { console.error('loadFoodWeekKcal failed:', error.message); return 0; }
  return (data || []).reduce((sum, r) => sum + (r.kcal || 0), 0);
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

Korvaa:
```js
async function loadFoodWeekKcal(mondayIso, sundayIso) {
  const { data, error } = await sb.from('food_log_entries')
    .select('kcal')
    .gte('logged_at', mondayIso)
    .lte('logged_at', sundayIso);
  if (error) { console.error('loadFoodWeekKcal failed:', error.message); return 0; }
  return (data || []).reduce((sum, r) => sum + (r.kcal || 0), 0);
}

function changeFoodDay(dir) { foodDayOffset += dir; renderRuoka(); }

function formatFoodDayLabel(offset) {
  if (offset === 0) return 'Tänään';
  if (offset === -1) return 'Eilen';
  const d = addDays(new Date(), offset);
  return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

async function renderRuoka() {
  document.getElementById('food-day-label').textContent = formatFoodDayLabel(foodDayOffset);
  await loadFoodDay();
}

async function loadFoodDay() {
  const selectedDate = addDays(new Date(), foodDayOffset);
  const dateIso = localIso(selectedDate);
  const monday = mondayOf(selectedDate);
  const sunday = addDays(monday, 6);

  if (!foodGoals) foodGoals = await loadNutritionGoals();

  const [entries, weekKcal] = await Promise.all([
    loadFoodDayEntries(dateIso),
    loadFoodWeekKcal(localIso(monday), localIso(sunday)),
  ]);
  foodDayEntries = entries;

  renderFoodHero(entries, weekKcal);
  renderMealCards(entries);
}

function renderFoodHero(entries, weekKcal) {
  const totalKcal    = entries.reduce((s, e) => s + (e.kcal || 0), 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein_g || 0), 0);
  const totalCarbs   = entries.reduce((s, e) => s + entryCarbs(e), 0);
  const totalFat     = entries.reduce((s, e) => s + entryFat(e), 0);

  const kcalTarget = foodGoals && foodGoals.daily_kcal;
  document.getElementById('food-hero-kcal').textContent = kcalTarget
    ? `${Math.round(totalKcal)} / ${Math.round(kcalTarget)} kcal`
    : `${Math.round(totalKcal)} kcal`;
  document.getElementById('food-hero-protein').textContent = Math.round(totalProtein) + 'g';
  document.getElementById('food-hero-carbs').textContent   = Math.round(totalCarbs) + 'g';
  document.getElementById('food-hero-fat').textContent     = Math.round(totalFat) + 'g';

  const weekRow = document.getElementById('food-week-row');
  const weeklyTarget = foodGoals && foodGoals.weekly_kcal;
  if (weeklyTarget) {
    weekRow.style.display = 'flex';
    weekRow.querySelector('.food-week-val').textContent = `${Math.round(weekKcal)} / ${Math.round(weeklyTarget)} kcal`;
  } else {
    weekRow.style.display = 'none';
  }
}

function renderMealCards(entries) {
  const el = document.getElementById('food-meals');
  el.innerHTML = MEAL_DEFS.map(meal => {
    const mealEntries = entries.filter(e => e.meal_type === meal.key);
    const mealKcal = mealEntries.reduce((s, e) => s + (e.kcal || 0), 0);
    const rows = mealEntries.map(e => `
      <div class="meal-entry-row" onclick="openEditEntryDialog('${e.id}')">
        <span>${foodItemName(e)}, ${e.amount_g}g</span>
        <span class="meal-entry-kcal">${Math.round(e.kcal)} kcal</span>
      </div>`).join('');
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

- [ ] **Step 2: Manuaalinen tarkistus**

Avaa sovellus selaimessa, napauta "Ruoka"-välilehteä. Näet 4 tyhjää ateriakorttia (Aamiainen/Lounas/Päivällinen/Välipala), kussakin "0 kcal" ja "+ Lisää ruoka" -nappi. Hero-kortti näyttää "0 kcal" (ei tavoitetta, koska `nutrition_goals` on tyhjä). Napauta ← → -nuolia: päivälabel vaihtuu ("Eilen", päivämäärä...) eikä konsoliin tule virheitä. Napauta "+ Lisää ruoka" — devtools-konsoliin tulee `openFoodSearch is not defined`, odotettua tässä vaiheessa (korjautuu Task 7:ssä).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: Ruoka-sivun hero-kortin ja ateriakorttien renderöinti"
```

---

### Task 7: JS — Fineli-haku ja "Viimeksi käytetyt"

**Files:**
- Modify: `index.html` (jatkaa JS-lohkoa)

- [ ] **Step 1: Lisää hakumodaalin avaus, Fineli-haku ja tulosten renderöinti**

Etsi (Task 6:n lisäämän lohkon loppu — `renderMealCards`-funktion jälkeinen UTILITIES-kommentti):
```js
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

Korvaa:
```js
    return `
      <div class="meal-card">
        <div class="meal-card-header">
          <span>${meal.icon} ${meal.label}</span>
          <span class="meal-card-kcal">${Math.round(mealKcal)} kcal</span>
        </div>
        ${rows}
        <button class="meal-add-btn" onclick="openFoodSearch('${meal.key}')">+ Lisää ruoka</button>
      </div>`;
  }).join('');
}

let foodModalMeal = null;
let foodModalSelected = null;
let foodRecentItems = [];
let foodSearchItems = [];
let foodSearchDebounce = null;

async function loadRecentFoods() {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const { data, error } = await sb.from('food_log_entries')
    .select(`
      food_cache_id, custom_food_id,
      food_cache(id,name_fi,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g),
      custom_foods(id,name,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g)
    `)
    .gte('logged_at', localIso(from))
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.error('loadRecentFoods failed:', error.message); return []; }

  const counts = new Map();
  (data || []).forEach(row => {
    const isCache = !!row.food_cache_id;
    const food = isCache ? row.food_cache : row.custom_foods;
    if (!food) return;
    const key = (isCache ? 'cache:' : 'custom:') + food.id;
    if (!counts.has(key)) {
      counts.set(key, {
        name: isCache ? food.name_fi : food.name,
        kcalPer100g: food.kcal_per_100g,
        proteinPer100g: food.protein_per_100g,
        carbsPer100g: food.carbs_per_100g,
        fatPer100g: food.fat_per_100g,
        source: isCache ? 'cache' : 'custom',
        cacheId: isCache ? food.id : null,
        customId: isCache ? null : food.id,
        count: 0,
      });
    }
    counts.get(key).count++;
  });

  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

async function searchFineli(query) {
  const res = await fetch(`https://fineli.fi/fineli/api/v1/foods?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Fineli-haku epäonnistui');
  return res.json();
}

function renderFoodResultsList(items, label, emptyLabel) {
  const el = document.getElementById('food-search-results');
  if (!items.length) {
    el.innerHTML = `<div class="food-search-empty">${emptyLabel}</div>`;
    return;
  }
  el.innerHTML = `<div class="food-search-section-label">${label}</div>` +
    items.map((item, i) => `
      <div class="food-search-result-row" onclick="selectFoodItem(${i})">
        <span>${item.name}</span>
        <span class="food-search-result-kcal">${Math.round(item.kcalPer100g)} kcal/100g</span>
      </div>`).join('');
}

function onFoodSearchInput() {
  clearTimeout(foodSearchDebounce);
  const q = document.getElementById('food-search-input').value.trim();
  if (q.length < 2) {
    foodSearchItems = foodRecentItems;
    renderFoodResultsList(foodSearchItems, 'Viimeksi käytetyt', 'Ei vielä aiempia ruokia');
    return;
  }
  foodSearchDebounce = setTimeout(() => runFoodSearch(q), 300);
}

async function runFoodSearch(q) {
  const el = document.getElementById('food-search-results');
  el.innerHTML = `<div class="food-search-empty">Haetaan...</div>`;
  try {
    const results = await searchFineli(q);
    foodSearchItems = results.map(item => ({
      name: item.name.fi,
      kcalPer100g: item.energyKcal,
      proteinPer100g: item.protein,
      carbsPer100g: item.carbohydrate,
      fatPer100g: item.fat,
      source: 'fineli',
      fineliId: item.id,
    }));
    renderFoodResultsList(foodSearchItems, 'Hakutulokset', 'Ei tuloksia');
  } catch (err) {
    console.error('runFoodSearch failed:', err.message);
    el.innerHTML = `<div class="food-search-empty">Haku epäonnistui, yritä uudelleen</div>`;
  }
}

async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  document.getElementById('food-search-input').value = '';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';

  const meal = MEAL_DEFS.find(m => m.key === mealType);
  document.getElementById('food-search-title').textContent = `${meal.icon} ${meal.label}`;
  document.getElementById('food-search-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  document.getElementById('food-search-results').innerHTML = `<div class="food-search-empty">Ladataan...</div>`;
  foodRecentItems = await loadRecentFoods();
  foodSearchItems = foodRecentItems;
  renderFoodResultsList(foodSearchItems, 'Viimeksi käytetyt', 'Ei vielä aiempia ruokia');
}

function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

- [ ] **Step 2: Manuaalinen tarkistus**

Avaa sovellus selaimessa, Ruoka-sivu, napauta minkä tahansa aterian "+ Lisää ruoka". Koko ruudun hakumodaali avautuu, otsikossa oikea ateria. Tulosalueella lukee "Ei vielä aiempia ruokia" (Viimeksi käytetyt -otsikon alla, koska ei vielä ole lisätty mitään). Kirjoita hakukenttään "kananrinta" — n. 300ms viiveellä ilmestyy "Hakutulokset"-otsikko ja Fineli-tulokset kcal/100g-arvoineen. Napauta "← Peruuta" — modaali sulkeutuu.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: Fineli-haku ja viimeksi käytetyt hakumodaalissa"
```

---

### Task 8: JS — Määrävaihe, oma tuote ja tallennus

**Files:**
- Modify: `index.html` (jatkaa JS-lohkoa)

- [ ] **Step 1: Lisää amount-step, custom-food-step ja confirmAddFood**

Etsi (Task 7:n lisäämän lohkon loppu):
```js
function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

Korvaa:
```js
function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function selectFoodItem(i) {
  foodModalSelected = foodSearchItems[i];
  goToAmountStep();
}

function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'block';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
}

function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
}

function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  ['custom-food-name','custom-food-kcal','custom-food-protein','custom-food-carbs','custom-food-fat'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

async function createCustomFood({ name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g }) {
  const { data, error } = await sb.from('custom_foods').insert({
    name,
    kcal_per_100g: kcalPer100g,
    protein_per_100g: proteinPer100g,
    carbs_per_100g: carbsPer100g,
    fat_per_100g: fatPer100g,
  }).select('id').single();
  if (error) { console.error('createCustomFood failed:', error.message); throw error; }
  return data.id;
}

async function saveCustomFoodAndContinue() {
  const name = document.getElementById('custom-food-name').value.trim();
  const kcal = parseNum('custom-food-kcal');
  const protein = parseNum('custom-food-protein');
  const carbs = parseNum('custom-food-carbs');
  const fat = parseNum('custom-food-fat');
  if (!name || kcal == null) {
    showStatus('custom-food-status', 'Nimi ja kcal vaaditaan', true);
    return;
  }
  try {
    const id = await createCustomFood({
      name, kcalPer100g: kcal, proteinPer100g: protein, carbsPer100g: carbs, fatPer100g: fat,
    });
    foodModalSelected = {
      name,
      kcalPer100g: kcal,
      proteinPer100g: protein || 0,
      carbsPer100g: carbs || 0,
      fatPer100g: fat || 0,
      source: 'custom',
      customId: id,
    };
    goToAmountStep();
  } catch (err) {
    showStatus('custom-food-status', 'Tallennus epäonnistui', true);
  }
}

async function ensureFoodCache(fineliId, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g) {
  const { data: existing, error: selErr } = await sb.from('food_cache')
    .select('id').eq('fineli_id', fineliId).maybeSingle();
  if (selErr) { console.error('ensureFoodCache select failed:', selErr.message); throw selErr; }
  if (existing) return existing.id;

  const { data: inserted, error: insErr } = await sb.from('food_cache').insert({
    fineli_id: fineliId,
    name_fi: name,
    kcal_per_100g: kcalPer100g,
    protein_per_100g: proteinPer100g,
    carbs_per_100g: carbsPer100g,
    fat_per_100g: fatPer100g,
  }).select('id').single();
  if (insErr) { console.error('ensureFoodCache insert failed:', insErr.message); throw insErr; }
  return inserted.id;
}

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

async function confirmAddFood() {
  const grams = parseFloat(document.getElementById('food-amount-grams').value);
  if (!grams || grams <= 0) {
    showStatus('food-amount-status', 'Syötä kelvollinen määrä', true);
    return;
  }
  try {
    let cacheId  = foodModalSelected.source === 'cache'  ? foodModalSelected.cacheId  : null;
    let customId = foodModalSelected.source === 'custom' ? foodModalSelected.customId : null;

    if (foodModalSelected.source === 'fineli') {
      cacheId = await ensureFoodCache(
        foodModalSelected.fineliId,
        foodModalSelected.name,
        foodModalSelected.kcalPer100g,
        foodModalSelected.proteinPer100g,
        foodModalSelected.carbsPer100g,
        foodModalSelected.fatPer100g,
      );
    }

    await addFoodLogEntry({
      mealType: foodModalMeal,
      dateIso: localIso(addDays(new Date(), foodDayOffset)),
      foodCacheId: cacheId,
      customFoodId: customId,
      amountG: grams,
      kcalPer100g: foodModalSelected.kcalPer100g,
      proteinPer100g: foodModalSelected.proteinPer100g,
    });

    closeFoodSearch();
    await renderRuoka();
  } catch (err) {
    showStatus('food-amount-status', 'Tallennus epäonnistui, yritä uudelleen', true);
  }
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

- [ ] **Step 2: Manuaalinen tarkistus — Fineli-polku**

Ruoka-sivulla napauta "Aamiainen"-kortin "+ Lisää ruoka", hae "kananrinta", valitse tulos. Määrävaihe avautuu, nimi näkyy otsikkona. Napauta "150g"-pikavalinta (kenttä muuttuu 150:ksi), napauta "Lisää". Modaali sulkeutuu, Aamiainen-kortissa näkyy uusi rivi ("Kananrinta ..., 150g" + kcal), kortin kcal-summa ja hero-kortin kcal päivittyvät. Tarkista Supabasen dashboardista (Table Editor) että `food_cache`-tauluun ilmestyi uusi rivi ja `food_log_entries`-tauluun uusi rivi oikealla `meal_type`-arvolla.

- [ ] **Step 3: Manuaalinen tarkistus — oma tuote -polku**

Napauta "Lounas"-kortin "+ Lisää ruoka", hae jotain mitä ei löydy (esim. "asdfqwerty"), tulosalue näyttää "Ei tuloksia". Napauta "+ Lisää oma tuote", täytä nimi + kcal (esim. 250) + proteiini/hiilarit/rasva, napauta "Tallenna ja jatka" → siirtyy määrävaiheeseen samalla tavalla, napauta "Lisää". Lounas-kortissa näkyy uusi rivi. Tarkista Supabasesta että `custom_foods`-tauluun ilmestyi rivi ja `food_log_entries.custom_food_id` osoittaa siihen (`food_cache_id` on `null`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: ruoan määrävaihe, oman tuotteen lomake ja tallennus"
```

---

### Task 9: JS — Merkinnän muokkaus ja poisto

**Files:**
- Modify: `index.html` (jatkaa JS-lohkoa)

- [ ] **Step 1: Lisää muokkausdialogi**

Etsi (Task 8:n lisäämän lohkon loppu):
```js
    closeFoodSearch();
    await renderRuoka();
  } catch (err) {
    showStatus('food-amount-status', 'Tallennus epäonnistui, yritä uudelleen', true);
  }
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

Korvaa:
```js
    closeFoodSearch();
    await renderRuoka();
  } catch (err) {
    showStatus('food-amount-status', 'Tallennus epäonnistui, yritä uudelleen', true);
  }
}

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

function openEditEntryDialog(entryId) {
  const entry = foodDayEntries.find(e => e.id === entryId);
  if (!entry) return;
  const src = entrySource(entry);
  const name = foodItemName(entry);

  const existing = document.getElementById('edit-entry-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'edit-entry-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;';
  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">${name}</div>
    <div class="form-row"><label>Määrä (g)</label><input type="number" id="edit-entry-grams" value="${entry.amount_g}"></div>
    <button class="btn btn-primary" id="edit-entry-save-btn">Tallenna</button>
    <button class="btn" id="edit-entry-delete-btn" style="margin-top:8px;background:var(--surface2);color:var(--red);width:100%;">Poista</button>
    <button class="btn" id="edit-entry-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Peruuta</button>
    <div class="status" id="edit-entry-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('edit-entry-save-btn').onclick = async () => {
    const grams = parseFloat(document.getElementById('edit-entry-grams').value);
    if (!grams || grams <= 0) {
      showStatus('edit-entry-status', 'Syötä kelvollinen määrä', true);
      return;
    }
    try {
      await updateFoodLogEntryAmount(entry.id, grams, src.kcal_per_100g, src.protein_per_100g);
      overlay.remove();
      await renderRuoka();
    } catch (err) {
      showStatus('edit-entry-status', 'Tallennus epäonnistui', true);
    }
  };

  document.getElementById('edit-entry-delete-btn').onclick = async () => {
    try {
      await deleteFoodLogEntry(entry.id);
      overlay.remove();
      await renderRuoka();
    } catch (err) {
      showStatus('edit-entry-status', 'Poisto epäonnistui', true);
    }
  };

  document.getElementById('edit-entry-cancel-btn').onclick = () => overlay.remove();
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

- [ ] **Step 2: Manuaalinen tarkistus**

Napauta Task 8:ssa lisättyä merkintää (esim. kananrinta-rivi Aamiainen-kortissa). Pieni dialogi avautuu keskelle ruutua, grammakenttä esitäytettynä (150). Vaihda arvoksi 180, napauta "Tallenna" — dialogi sulkeutuu, ateriakortin ja hero-kortin kcal-arvot päivittyvät vastaamaan 180g:aa. Napauta merkintää uudelleen, napauta "Poista" — rivi katoaa kortista, kcal-summat päivittyvät. Tarkista Supabasesta että rivi todella poistui `food_log_entries`-taulusta.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: ruokamerkinnän muokkaus ja poisto"
```

---

### Task 10: JS — Ravintotavoitteet-asetusmodaali

**Files:**
- Modify: `index.html` (jatkaa JS-lohkoa)

- [ ] **Step 1: Lisää tavoiteasetusten tallennus ja modaali**

Etsi (Task 9:n lisäämän lohkon loppu):
```js
  document.getElementById('edit-entry-cancel-btn').onclick = () => overlay.remove();
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

Korvaa:
```js
  document.getElementById('edit-entry-cancel-btn').onclick = () => overlay.remove();
}

async function saveNutritionGoals(goals) {
  const { error } = await sb.from('nutrition_goals')
    .upsert({ id: 1, ...goals, updated_at: new Date().toISOString() });
  if (error) { console.error('saveNutritionGoals failed:', error.message); throw error; }
}

async function openGoalsModal() {
  closeSidebar();
  const goals = (await loadNutritionGoals()) || {};

  const existing = document.getElementById('goals-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'goals-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:400px;width:100%;max-height:85vh;overflow-y:auto;';

  const field = (id, label, val) =>
    `<div class="form-row"><label>${label}</label><input type="text" inputmode="decimal" id="${id}" value="${val == null ? '' : val}"></div>`;

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Ravintotavoitteet</div>
    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Päivä</div>
    ${field('goal-daily-kcal', 'Kcal', goals.daily_kcal)}
    ${field('goal-daily-protein', 'Proteiini (g)', goals.daily_protein_g)}
    ${field('goal-daily-carbs', 'Hiilarit (g)', goals.daily_carbs_g)}
    ${field('goal-daily-fat', 'Rasva (g)', goals.daily_fat_g)}
    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px;">Viikko</div>
    ${field('goal-weekly-kcal', 'Kcal', goals.weekly_kcal)}
    ${field('goal-weekly-protein', 'Proteiini (g)', goals.weekly_protein_g)}
    ${field('goal-weekly-carbs', 'Hiilarit (g)', goals.weekly_carbs_g)}
    ${field('goal-weekly-fat', 'Rasva (g)', goals.weekly_fat_g)}
    <button class="btn btn-primary" id="goals-save-btn">Tallenna</button>
    <button class="btn" id="goals-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="goals-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('goals-save-btn').onclick = async () => {
    try {
      await saveNutritionGoals({
        daily_kcal: parseNum('goal-daily-kcal'),
        daily_protein_g: parseNum('goal-daily-protein'),
        daily_carbs_g: parseNum('goal-daily-carbs'),
        daily_fat_g: parseNum('goal-daily-fat'),
        weekly_kcal: parseNum('goal-weekly-kcal'),
        weekly_protein_g: parseNum('goal-weekly-protein'),
        weekly_carbs_g: parseNum('goal-weekly-carbs'),
        weekly_fat_g: parseNum('goal-weekly-fat'),
      });
      foodGoals = null;
      overlay.remove();
    } catch (err) {
      showStatus('goals-status', 'Tallennus epäonnistui', true);
    }
  };
  document.getElementById('goals-cancel-btn').onclick = () => overlay.remove();
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
```

- [ ] **Step 2: Manuaalinen tarkistus**

Avaa sivupalkki (hampurilaisvalikko), napauta "Ravintotavoitteet". Modaali avautuu 8 kentällä (Päivä: Kcal/Proteiini/Hiilarit/Rasva, Viikko: samat). Syötä esim. Päivä Kcal=2200, Proteiini=160, Hiilarit=220, Rasva=70; Viikko Kcal=15400, Proteiini=1120, Hiilarit=1540, Rasva=490. Napauta "Tallenna" — modaali sulkeutuu. Siirry Ruoka-sivulle: hero-kortin kcal näyttää nyt "X / 2200 kcal", viikkorivi näkyy ja näyttää "X / 15400 kcal". Avaa "Ravintotavoitteet" uudelleen — kentät ovat esitäytetty juuri tallennetuilla arvoilla (upsert toimii). Tarkista Supabasesta että `nutrition_goals`-taulussa on täsmälleen yksi rivi (`id=1`).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: ravintotavoitteiden asetusmodaali"
```

---

### Task 11: Koko golden pathin ja virhetilanteiden manuaalinen verifiointi

**Files:** (ei koodimuutoksia — puhdas verifiointitehtävä)

- [ ] **Step 1: Golden path -läpikävely**

Selaimessa (`http://localhost:8000/index.html`):
1. Ruoka-sivu → aseta ravintotavoitteet (jos ei jo tehty Task 10:ssä).
2. Lisää yksi ruoka jokaiseen neljään ateriaan (vähintään yksi Fineli-haulla, yksi omalla tuotteella).
3. Tarkista hero-kortin kcal/proteiini/hiilarit/rasva-summat täsmäävät käsin laskettuun summaan (Fineli-arvo × grammat / 100 + oma tuote × grammat / 100).
4. Vaihda päivää ← -painikkeella eiliseen — eilisen näkymä on tyhjä (ei tämän päivän merkintöjä).
5. Palaa tälle päivälle (→), muokkaa yhtä merkintää grammamäärän suhteen, poista toinen — hero ja ateriakortti päivittyvät molemmilla kerroilla.
6. Avaa hakumodaali uudelleen — "Viimeksi käytetyt" näyttää nyt äsken lisätyt ruoat kärjessä.

- [ ] **Step 2: Virhetilanteiden tarkistus**

1. Devtoolsin Network-välilehdellä aseta Fineli-domain (`fineli.fi`) throttlattavaksi/blokatuksi (offline-emulointi vain kyseiselle pyynnölle ei ole triviaalia Chromessa — vaihtoehtoisesti kytke koko selain offline-tilaan `Network > Offline`), yritä hakea ruokaa → tulosalueelle ilmestyy "Haku epäonnistui, yritä uudelleen", modaali pysyy auki. Kytke online-tila takaisin päälle.
2. Määrävaiheessa yritä tallentaa tyhjällä/nolla grammamäärällä → "Lisää"-painike näyttää virheilmoituksen ("Syötä kelvollinen määrä"), ei tee Supabase-kutsua (tarkista Network-välilehdeltä ettei `food_log_entries`-POST-pyyntöä lähetetty).
3. Oman tuotteen lomakkeessa yritä tallentaa ilman nimeä → "Nimi ja kcal vaaditaan" -virhe, lomake pysyy auki eikä tyhjenny.

- [ ] **Step 3: Koko sivun regressiotarkistus**

Käy läpi Treeni-, Seuranta-, Historia- ja Ohjelma-sivut varmistaaksesi, ettei Ruoka-sivun lisäys rikkonut mitään olemassa olevaa toiminnallisuutta (navigointi, modaalit, kaaviot latautuvat kuten ennen).

- [ ] **Step 4: Merkitse valmiiksi**

Jos kaikki yllä olevat kohdat läpäisevät, ruokapäiväkirja-ominaisuus on valmis. Ei erillistä committia tässä vaiheessa (ei koodimuutoksia) — jos verifioinnissa löytyy bugeja, korjaa ne kyseisen taskin tiedostoihin ja tee uusi commit kuvaavalla viestillä.

---

## Itsetarkistus (tehty suunnitelmaa kirjoittaessa)

- **Spec-kattavuus:** Kaikki speksin osiot (1. Datamalli → Task 1,5; 2. Navigaatio → Task 3; 3. Ydintoiminnot → Task 6-10; 4. Virheenkäsittely → sisäänrakennettu jokaiseen tallennus-/hakufunktioon + Task 11 Step 2; 5. Testaus → Task 11) on katettu tehtävillä.
- **Platshollarit:** Ei TBD/TODO-merkintöjä, kaikki koodi on täydellistä ja suoraan käyttöönotettavaa.
- **Tyyppijohdonmukaisuus:** `foodModalSelected`-olion kentät (`name`, `kcalPer100g`, `proteinPer100g`, `carbsPer100g`, `fatPer100g`, `source`, `cacheId`/`customId`/`fineliId`) ovat samat Task 7:n (`loadRecentFoods`, `runFoodSearch`) ja Task 8:n (`selectFoodItem`, `confirmAddFood`, `saveCustomFoodAndContinue`) välillä. `entry`-olion kentät (`food_cache`, `custom_foods`, `amount_g`, `kcal`, `protein_g`) ovat samat Task 5:n (`loadFoodDayEntries`) ja Task 6/9:n (`renderMealCards`, `openEditEntryDialog`) välillä.
