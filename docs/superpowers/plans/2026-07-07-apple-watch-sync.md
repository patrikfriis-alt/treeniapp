# Apple Watch -treenisynkronointi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mahdollistaa Apple Watch -treenidatan automaattinen synkkaus Supabaseen Shortcuts-automaation kautta, speksin `docs/superpowers/specs/2026-07-07-apple-watch-sync-design.md` mukaisesti.

**Architecture:** Kolme Supabase-skeemamuutosta (workout_sessions + activity_data laajennus, uusi app_settings-taulu), sovelluspuolen asetus-UI kalorikorjauskertoimelle, Aktiviteetti-listan päivitys näyttämään korjattu kalorilukema Watch-riveille, ja kirjallinen käyttöopas Shortcuts-automaation rakentamiseen (ei ohjelmallisesti automatisoitavissa — käyttäjä konfiguroi Shortcuts-sovelluksen itse omalla iPhonellaan).

**Tech Stack:** Vanilla JS (index.html), Supabase JS v2, Supabase Postgres + RLS, iOS Shortcuts (käyttäjän konfiguroima, ei koodia tässä repossa).

---

## Ennakkotiedot koodikannasta (jo varmistettu)

- `activity_data`-taulu on jo olemassa: `activity_date`, `activity_type`, `duration_min`, `calories`, `avg_heart_rate`, `distance_km`. Uniikki `(activity_date, activity_type)`. Näytetään Seuranta → Aktiviteetti-välilehdellä (`loadActivities()`, `index.html`).
- `workout_sessions`-taulu on jo olemassa: `workout_date`, `session_type`, `is_done`, `started_at`, `done_at`. Uniikki `(workout_date, session_type)`.
- `parseNum(id)`, `showStatus(id, msg, isErr)`, `closeSidebar()` ovat pre-existing apufunktioita.
- `openGoalsModal()`/`saveNutritionGoals()` (index.html) ovat suora malli jota tämä plan toistaa singleton-asetustaululle (`app_settings`) — sama dynaaminen overlay-kuvio, sama `.form-row`/`.btn`/`.status`-tyylit.
- Ei automaattitestikehystä — kaikki verifiointi manuaalista.
- Sovelluksen ajaminen selaimessa: `cd /Users/patrikfriis/Projects/treeniapp && python3 -m http.server 8000`, avaa `http://localhost:8000/index.html`.

---

### Task 1: Supabase-migraatio — workout_sessions, activity_data, app_settings

**Files:**
- Create: `supabase/migrations/20260708_apple_watch_sync.sql`

- [ ] **Step 1: Kirjoita migraatiotiedosto**

```sql
-- Apple Watch -treenisynkronointi: workout_sessions/activity_data laajennus + app_settings

alter table workout_sessions add column calories numeric;
alter table workout_sessions add column avg_heart_rate integer;

alter table activity_data add column source text not null default 'manual' check (source in ('manual','watch'));
alter table activity_data add column healthkit_uuid text unique;

create table app_settings (
  id                 bigint primary key default 1 check (id = 1),
  calorie_correction numeric not null default 0.72,
  updated_at         timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy app_settings_select on app_settings
  for select to anon, authenticated using (true);
create policy app_settings_insert on app_settings
  for insert to anon, authenticated with check (true);
create policy app_settings_update on app_settings
  for update to anon, authenticated using (true) with check (true);
```

- [ ] **Step 2: Aja migraatio Supabasen SQL-editorissa**

Tämä vaatii ihmisen (ei DB-tunnuksia tässä ympäristössä). Ihmisen tulee ajaa tiedoston sisältö `https://supabase.com/dashboard/project/dodrzzgbdlucjbkmxbjn/sql/new` ennen kuin Task 6:n verifiointi voidaan tehdä loppuun asti.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260708_apple_watch_sync.sql
git commit -m "feat: workout_sessions/activity_data laajennus + app_settings Watch-synkkausta varten"
```

---

### Task 2: JS — app_settings-datakerros

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Lisää tilamuuttuja ja luku/tallennusfunktiot**

Etsi:
```js
/* ═══════════════════════════════════════════════════════════════
   ACTIVITIES
═══════════════════════════════════════════════════════════════ */
async function loadActivities() {
```

Korvaa:
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

async function loadActivities() {
```

- [ ] **Step 2: Manuaalinen tarkistus**

Avaa sovellus selaimessa (`python3 -m http.server 8000`, `http://localhost:8000/index.html`). Avaa devtools-konsoli, suorita `await loadAppSettings()` — palauttaa `null` (taulu tyhjä, koska Task 1:n migraatiota ei ole vielä ajettu ihmisen toimesta, tai ajettu mutta rivi puuttuu — molemmat tuottavat `null` `.maybeSingle()`-kutsulla, ei virhettä). Vahvista ettei konsoliin tule muita virheitä sivun latautuessa.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: app_settings-datakerroksen luku/tallennus"
```

---

### Task 3: JS + HTML — Kalorikerroin-asetusmodaali

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Lisää sivupalkin linkki**

Etsi:
```html
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🎯</span> Ravintotavoitteet
  </button>
</div>
```

Korvaa:
```html
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🎯</span> Ravintotavoitteet
  </button>
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">⌚</span> Kalorikerroin
  </button>
</div>
```

- [ ] **Step 2: Lisää modaalifunktio**

Etsi (tiedoston loppupuolella, `openGoalsModal`-funktion jälkeen):
```js
  document.getElementById('goals-cancel-btn').onclick = () => overlay.remove();
}
```

Korvaa:
```js
  document.getElementById('goals-cancel-btn').onclick = () => overlay.remove();
}

async function openCalorieSettingsModal() {
  closeSidebar();
  const settings = (await loadAppSettings()) || { calorie_correction: 0.72 };
  const percentValue = Math.round((1 - settings.calorie_correction) * 100);

  const existing = document.getElementById('calorie-settings-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'calorie-settings-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;';

  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">Kalorikerroin</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">Apple Watchin kalorilukema on tutkitusti epätarkka. Tämä prosentti vähennetään Applen ilmoittamasta kalorimäärästä arvioidun todellisen kulutuksen laskemiseksi.</div>
    <div class="form-row"><label>Korjaus (%)</label><input type="text" inputmode="numeric" id="calorie-correction-pct" value="${percentValue}"></div>
    <button class="btn btn-primary" id="calorie-settings-save-btn">Tallenna</button>
    <button class="btn" id="calorie-settings-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Sulje</button>
    <div class="status" id="calorie-settings-status"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('calorie-settings-save-btn').onclick = async () => {
    const saveBtn = document.getElementById('calorie-settings-save-btn');
    const pct = parseNum('calorie-correction-pct');
    if (pct == null || pct < 0 || pct > 100) {
      showStatus('calorie-settings-status', 'Syötä luku 0-100', true);
      return;
    }
    saveBtn.disabled = true;
    try {
      await saveCalorieCorrection(Math.round(100 - pct) / 100);
      appSettings = null;
      overlay.remove();
    } catch (err) {
      showStatus('calorie-settings-status', 'Tallennus epäonnistui', true);
      saveBtn.disabled = false;
    }
  };
  document.getElementById('calorie-settings-cancel-btn').onclick = () => overlay.remove();
}
```

- [ ] **Step 3: Manuaalinen tarkistus**

Avaa sivupalkki (hampurilaisvalikko), vahvista "⌚ Kalorikerroin" -rivi näkyy "Ravintotavoitteet"-rivin alla. Napauta sitä — modaali avautuu, kenttä esitäytetty arvolla "28" (koska `app_settings`-taulu on vielä tyhjä, oletusarvo `0.72` → `Math.round((1-0.72)*100)=28`). Vaihda arvoksi 30, tallenna. Avaa modaali uudelleen — kentän pitäisi näyttää nyt "30" (jos Task 1:n migraatio on ajettu Supabasessa; jos ei, tallennus epäonnistuu näkyvällä "Tallennus epäonnistui" -virheellä, mikä on odotettua siihen asti kunnes migraatio on ajettu).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: kalorikerroin-asetusmodaali"
```

---

### Task 4: JS — Aktiviteetti-listan päivitys (lähde + korjattu kalorilukema)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Päivitä loadActivities-funktio**

Etsi:
```js
async function loadActivities() {
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
    return `
    <div class="hist-item">
      <div><div class="hist-label">${a.activity_type}</div><div class="hist-date">${a.activity_date}</div></div>
      <div style="text-align:right">
        <div class="hist-val">${a.duration_min ? a.duration_min+' min' : '—'}</div>
        <div style="font-size:11px;color:var(--text3)">${a.calories?a.calories+' kcal':''}${a.avg_heart_rate?' · '+a.avg_heart_rate+' bpm':''}${a.distance_km?' · '+a.distance_km+' km'+paceStr:''}</div>
      </div>
    </div>`;
  }).join('');
}
```

Korvaa:
```js
async function loadActivities() {
  if (!appSettings) appSettings = await loadAppSettings();
  const correction = (appSettings && appSettings.calorie_correction) || 1;

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

- [ ] **Step 2: Manuaalinen tarkistus**

Tämä vaatii Task 1:n migraation olevan ajettuna Supabasessa ja vähintään yhden `source='watch'`-rivin `activity_data`-taulussa. Simuloi Watch-rivi suoraan curlilla (korvaa `<anon-avain>` oikealla arvolla, löytyy `index.html`:n `SB_KEY`-muuttujasta):

```bash
curl -s "https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/activity_data" \
  -H "apikey: <anon-avain>" -H "Authorization: Bearer <anon-avain>" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -X POST -d '{
    "activity_date": "2026-07-07",
    "activity_type": "Juoksu",
    "duration_min": 32,
    "calories": 310,
    "avg_heart_rate": 152,
    "distance_km": 5.1,
    "source": "watch",
    "healthkit_uuid": "test-uuid-1"
  }'
```

Avaa Seuranta → Aktiviteetti selaimessa. Vahvista rivi näkyy muodossa "⌚ Juoksu" ja kaloririvillä lukee "310 kcal (Apple) · ~223 kcal arvio" (310 × 0.72 ≈ 223, jos kalorikorjaus on oletusarvossa). Poista testirivi lopuksi:

```bash
curl -s "https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/activity_data?healthkit_uuid=eq.test-uuid-1" \
  -H "apikey: <anon-avain>" -H "Authorization: Bearer <anon-avain>" -X DELETE
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: Aktiviteetti-lista näyttää lähteen ja korjatun kalorilukeman Watch-riveille"
```

---

### Task 5: Kirjallinen Shortcuts-käyttöopas

**Files:**
- Create: `docs/apple-watch-shortcuts-guide.md`

- [ ] **Step 1: Kirjoita opas**

```markdown
# Apple Watch -treenisynkkaus: Shortcuts-automaation rakentaminen

Tämä opas käydään läpi Shortcuts-sovelluksessa omalla iPhonella. Ei koodia — pelkkiä Shortcuts-toimintoja.

## 1. Luo Personal Automation

1. Avaa **Shortcuts**-sovellus → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Treeni** (Workout) → **Kun lopetan treenin** (When I End a Workout)
3. Valitse **Suorita heti** (Run Immediately) — EI "Kysy ennen suorittamista", jotta automaatio toimii ilman vahvistusta

## 2. Hae juuri päättynyt treeni

1. Lisää toiminto **Etsi treenit** (Find Workouts)
2. Aseta: Lajittele **Päättymispäivän** mukaan, laskeva järjestys, **Rajoita 1**:een

## 3. Poimi treenin tiedot

Lisää **Aseta muuttuja**-toiminnot (Set Variable) jokaiselle seuraavalle treenin kentälle (löytyvät "Etsi treenit"-tuloksen Magic Variable -valikosta):
- `WorkoutType` ← Treenin **Treenityyppi** (Workout Type)
- `Duration` ← **Kesto** minuutteina
- `Calories` ← **Aktiivinen energia** (Total Active Energy), yksikkö kcal
- `AvgHR` ← **Keskisyke** (Average Heart Rate)
- `Distance` ← **Kokonaismatka** (Total Distance), yksikkö km (voi olla tyhjä salitreeneillä)
- `WorkoutUUID` ← Treenin **UUID**
- `EndDate` ← **Päättymispäivä**, muotoile **Muotoile päivämäärä** -toiminnolla muotoon `yyyy-MM-dd`

## 4. Reititys treenityypin mukaan (If/Otherwise)

Lisää **Jos**-toiminto (If): `WorkoutType` **sisältää** `Strength`

### Jos KYLLÄ (sali):

**Hae sisältö URL:sta** (Get Contents of URL):
- Metodi: `PATCH`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/workout_sessions?workout_date=eq.[EndDate]`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
- Pyynnön runko (JSON):
  ```json
  { "calories": [Calories], "avg_heart_rate": [AvgHR] }
  ```

### Jos EI — toinen sisäkkäinen Jos: `WorkoutType` **sisältää** `Run`

**Get Contents of URL:**
- Metodi: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/activity_data?on_conflict=healthkit_uuid`
- Headerit: sama `apikey`/`Authorization`/`Content-Type` + `Prefer`: `resolution=merge-duplicates`
- Runko:
  ```json
  {
    "activity_date": "[EndDate]",
    "activity_type": "Juoksu",
    "duration_min": [Duration],
    "calories": [Calories],
    "avg_heart_rate": [AvgHR],
    "distance_km": [Distance],
    "source": "watch",
    "healthkit_uuid": "[WorkoutUUID]"
  }
  ```

### Jos EI — toinen sisäkkäinen Jos: `WorkoutType` **sisältää** `Walk`

Sama kuin yllä, mutta `"activity_type": "Kävely"`.

### Jos EI — toinen sisäkkäinen Jos: `WorkoutType` **sisältää** `Hockey`

Sama kuin yllä, mutta `"activity_type": "Jääkiekko"`.

### Muuten (kaikki muut tyypit)

Sama rakenne, mutta `"activity_type": "[WorkoutType]"` (Watchin oma nimi sellaisenaan Magic Variablena).

## 5. Testaa

Paina Shortcutsin automaation kohdalla **"Kokeile"** (Run) manuaalisesti ilman että teet oikeaa treeniä — jos sinulla on äskettäin päättynyt Watch-treeni Health-sovelluksessa, "Etsi treenit" löytää sen ja voit varmistaa että data menee oikeaan tauluun Supabasen dashboardista (Table Editor).

## 6. Vianetsintä

- Jos rivi ei ilmesty: tarkista että anon-avain on oikein kopioitu (löytyy `index.html`:n `SB_KEY`-vakiosta), ja että migraatiotiedosto `supabase/migrations/20260708_apple_watch_sync.sql` on ajettu.
- Jos sali-kalorit eivät päivity: varmista että olet merkinnyt kyseisen päivän session "tehdyksi" Treeniapista ennen tai pian Watch-treenin jälkeen — `workout_sessions`-rivi täytyy olla olemassa jotta `PATCH` löytää sen.
```

- [ ] **Step 2: Commit**

```bash
git add docs/apple-watch-shortcuts-guide.md
git commit -m "docs: Apple Watch Shortcuts -automaation käyttöopas"
```

---

### Task 6: Loppuverifiointi

**Files:** (ei koodimuutoksia)

- [ ] **Step 1: Varmista migraatio ajettu**

Kysy käyttäjältä onko `supabase/migrations/20260708_apple_watch_sync.sql` ajettu Supabasessa. Jos ei, näytä sisältö ja pyydä ajamaan ennen jatkoa.

- [ ] **Step 2: Selainverifiointi**

Käy läpi Task 2-4:n manuaaliset tarkistukset uudelleen kokonaisuutena yhdellä kertaa: kalorikerroin-modaalin avaus/tallennus/uudelleenavaus, simuloitu Watch-rivi Aktiviteetti-listassa oikealla korjatulla kalorilukemalla, olemassa olevan Aktiviteetti-toiminnallisuuden (käsin syöttö) regressiotarkistus.

- [ ] **Step 3: Kerro käyttäjälle Shortcuts-vaihe**

Muistuta että Task 5:n opas (`docs/apple-watch-shortcuts-guide.md`) pitää käydä läpi käyttäjän omalla iPhonella — tätä ei voi automatisoida tai verifioida tästä ympäristöstä. Pyydä käyttäjää testaamaan yhdellä oikealla Watch-treenillä ja vahvistamaan että data ilmestyy Supabaseen/appiin odotetusti.

---

## Itsetarkistus (tehty suunnitelmaa kirjoittaessa)

- **Spec-kattavuus:** Datamalli → Task 1; Reititys/Shortcuts → Task 5 (kirjallinen opas, ei koodia — perusteltu speksissä); Kalorikorjauskerroin → Task 2-3; Aktiviteetti-näyttö → Task 4; Virheenkäsittely → sisäänrakennettu (esim. `.maybeSingle()`-fallbackit, disabled-napit); Testaus → Task 6.
- **Placeholderit:** Ei TBD/TODO-merkintöjä. Opas (Task 5) sisältää `<anon-avain index.html:sta>` -viittauksen, mikä on tarkoituksellista (avain on jo julkisesti näkyvissä index.html:ssä, käyttäjä kopioi sen itse — ei salaisuus jota pitäisi piilottaa tässä dokumentissa).
- **Tyyppijohdonmukaisuus:** `appSettings`/`loadAppSettings`/`saveCalorieCorrection` -nimet ja `calorie_correction`-kentän muoto (multiplier, esim. 0.72) pysyvät samana Task 2:n määrittelystä Task 3:n (modaali, % ↔ multiplier -muunnos) ja Task 4:n (kertolasku Aktiviteetti-listassa) läpi.
