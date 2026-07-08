# Treeniapp — Piilossa oleva data näkyviin

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 2 osa 1/4. Kolme itsenäistä pientä korjausta jotka kaikki liittyvät jo olemassa olevaan, mutta piilossa tai puutteellisesti käytettävissä olevaan dataan: aktiviteettien CRUD (kohta 4), CSV-vienti (kohta 6), ms-week/ms-month näkyviin (kohta 7).
**Riippuvuudet:** Ei riipu muista Sprint 2 -kohteista. Käyttää olemassa olevia `activity_data`- ja `workout_sets`-tauluja.

---

## 1. Aktiviteettien avaus/muokkaus/poisto

**Nykytila:** Aerobia-sivun "Viimeiset"-lista (`loadActivities()`, index.html:2183) renderöi jokaisen `activity_data`-rivin pelkkänä staattisena `.hist-item`-divinä ilman interaktiota — toisin kuin ruokapäiväkirja (`openEditEntryDialog`) ja salin liikkeet (`openExerciseModal`), joissa klikkaus avaa muokkausnäkymän.

**Muutos:**
- Jokaisesta `.hist-item`-rivistä `loadActivities()`:ssa tulee klikattava: `onclick="openEditActivityDialog('${a.id}')"`.
- Uusi `openEditActivityDialog(activityId)`-funktio mallinnetaan suoraan `openEditEntryDialog()`:n (index.html:3313) rakenteen mukaan: overlay + modal, kentät esitäytettyinä nykyisillä arvoilla (päivämäärä, laji — `<select>` samat vaihtoehdot kuin `act-type`, kesto, kalorit, syke, matka), "Tallenna"/"Poista"/"Peruuta"-napit.
- Kaksi uutta Supabase-apufunktiota:
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
- Tallennuksen/poiston jälkeen `overlay.remove()` ja `loadActivities()` uudelleen (päivittää sekä listan että hero-kortin).

---

## 2. CSV-vienti

**Nykytila:** Sovelluksessa ei ole minkäänlaista datan vientiä.

**Muutos:**
- Kaksi uutta nappia Valikkoon (sidebar), uuden "Vie data" -osiorivin alle, Asetukset-osion jälkeen (index.html:1140-1149 kohdan jälkeen):
  ```html
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Vie data</div>
  <button onclick="exportActivitiesCSV()" ...><span>📤</span> Vie aktiviteetit (CSV)</button>
  <button onclick="exportWorkoutSetsCSV()" ...><span>📤</span> Vie salilokit (CSV)</button>
  ```
- Client-side CSV-generointi, ei backend-muutoksia: hae kaikki rivit (`sb.from(...).select('*')`, ei limit-rajausta), muodosta CSV-merkkijono manuaalisesti (pilkkuerotettu, otsikkorivi + data), lataa selaimessa `Blob`+`URL.createObjectURL`+näkymätön `<a download="...">`-elementti jota klikataan ohjelmallisesti.
- **Aktiviteetit-CSV** (`activity_data`), sarakkeet: `activity_date, activity_type, duration_min, calories, avg_heart_rate, distance_km`.
- **Salilokit-CSV** (`workout_sets`), sarakkeet: `workout_date, exercise_name, set_number, weight_kg, reps, session_type`.
- Tiedostonimi: `treeniapp-aktiviteetit-YYYY-MM-DD.csv` / `treeniapp-salilokit-YYYY-MM-DD.csv` (nykyinen päivämäärä).
- CSV-kentät joissa voi olla pilkku/lainausmerkki (ei näissä tauluissa realistisesti, mutta varmuuden vuoksi): jokainen kenttä kääritään lainausmerkkeihin (`"..."`), sisäiset lainausmerkit tuplataan (`""`) — standardi CSV-escape.

---

## 3. ms-week / ms-month näkyviin

**Nykytila:** `loadMotivationSummary()` (index.html:1667) laskee jo viikon aktiivisuus-%:n (`weekPct`) ja kuukauden aktiviteettikertojen määrän (`monthCount`), ja yrittää kirjoittaa ne elementteihin `ms-week`/`ms-month` — joita ei ole olemassa missään HTML:ssä. Data lasketaan joka latauksella ja heitetään pois.

**Muutos (vain Koonti-sivu, ei Sali-sivua):**
- Uusi toinen rivi Koonti-sivun hero-metrics-ruudukon (index.html:828) alle, 2 saraketta:
  ```html
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
- `loadMotivationSummary()`:iin lisätään kaksoiskirjoitus samaan tapaan kuin nykyinen `ms-streak`/`koonti-ms-streak`-pari: `weekPct`-laskennan jälkeen myös `document.getElementById('koonti-ms-week')`, `monthCount`-laskennan jälkeen myös `document.getElementById('koonti-ms-month')`.
- Olemassa olevia `ms-week`/`ms-month`-hakuja (jotka jäävät edelleen no-opiksi koska niitä vastaavaa elementtiä ei ole) ei poisteta — ne ovat harmittomia (`if (el)`-suojattuja) eikä niiden poistaminen kuulu tämän kohdan laajuuteen.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Aerobia-sivu: klikkaa "Viimeiset"-listan riviä → modaali avautuu esitäytetyillä arvoilla. Muokkaa kestoa, tallenna → rivi päivittyy listassa. Klikkaa toista riviä, paina Poista → rivi katoaa listasta.
2. Valikko → "Vie aktiviteetit (CSV)" → tiedosto latautuu, avaa ja tarkista sarakkeet/data täsmää Supabasen dataan. Sama "Vie salilokit (CSV)":lle.
3. Koonti-sivu: tarkista että hero-metrics-ruudukon alla näkyy uusi rivi "viikon aktiivisuus %" ja "kuukausi" -arvoilla, molemmat ei-tyhjiä.
