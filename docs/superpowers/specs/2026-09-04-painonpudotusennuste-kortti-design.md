# Treeniapp (Valkku) — Painonpudotusennuste omana korttina, kuukausinavigoinnilla

**Päivämäärä:** 2026-09-04
**Laajuus:** Nykyinen ennustetoiminnallisuus (kts. tausta: `docs/superpowers/specs/2026-08-13-painonpudotusennuste-design.md`) irrotetaan Keho-sivun paino/rasva%/lihas%-kaaviosta omaksi kortikseen, jossa on selkeät tunnusluvut (ei "malli kalibroitu" -jargonia) ja kuukausi kerrallaan selattava aikajana, joka näyttää menneiltä kuukausilta myös sen mitä malli olisi silloin ennustanut — vertailuksi todelliseen kehitykseen.
**Riippuvuudet:** Olemassa oleva `body_metrics`-taulu, `user_profile.target_weight_kg`, `model_calibration`-taulu, `getFoodCalories(fromIso,toIso)`, `getBodyComposition()`, `simulateToTarget()`, `calculateMaintenance()` — kaikki pysyvät ennallaan (index.html:3428-3455). `loadBodyMetrics()` (index.html:3231-3338) muokataan, ei kirjoiteta uudelleen tyhjästä.

---

## Tausta

2026-09-04: käyttäjä pyysi painonpudotuksen ennustekaaviota. Sellainen on jo olemassa (2026-08-13 spec) — katkoviiva-"Ennuste" osana Keho-sivun paino/rasva%/lihas%-yhdistelmäkaaviota, plus tekstirivi "Ennuste: N viikkoa (pvm) · Malli kalibroitu X". Käyttäjä ei ollut huomannut sitä / ei ymmärtänyt sitä — palaute: kaavio on liian täynnä (kolme eri mittaria + ennuste samassa kuvaajassa) ja itse ennustetekstin käsitteet (viikkoa, "malli kalibroitu") eivät avaudu. Lisäksi toivottiin mahdollisuutta selata ennustetta/historiaa kuukausi kerrallaan, ja mennyttä aikaa selatessa nähdä sekä toteutunut paino että se, mitä malli olisi silloin ennustanut (tarkkuuden arviointiin).

Ratkaisu suunniteltu visuaalisen brainstorm-työkalun kautta (mockupit `.superpowers/brainstorm/`): irrotetaan ennuste omaksi kortiksi, korvataan jargon selkeillä tunnusluvuilla, ja lisätään kuukausinavigointi joka kattaa sekä menneisyyden että tulevaisuuden.

## 1. Vanhan kaavion siivous

Poistetaan `loadBodyMetrics()`:sta (index.html:3247-3283, 3292-3309, 3316-3318) kokonaan:
- `forecastEl`-tekstin kirjoitus (`Aseta tavoitepaino...`/`Kirjaa paino...`/`Ennuste: N viikkoa...`) — koko `#m-forecast`-elementin sisällön päivitys.
- `forecastData`-datasetin rakentaminen ja sen `push` `charts.body`:n `datasets`-taulukkoon.
- `forecastLabels`/`labels = [...histLabels, ...forecastLabels]` -laajennus — `labels` pysyy pelkkänä `histLabels`:na.

**HTML:** poistetaan `<div id="m-forecast" ...></div>` (index.html:1357) kokonaan Keho-sivulta.

Jäljelle jäävä `charts.body` näyttää siis pelkän paino/rasva%/lihas%-historian, kuten ennen ennustetta — ei toiminnallista muutosta itse kaavioon, vain ennusteosuuden poisto.

`forecast`-muuttuja (`simulateToTarget()`:n tulos) **säilytetään** `loadBodyMetrics()`:ssa — uusi kortti tarvitsee sen. Vain sen *piirto/tekstiys* siirtyy pois.

## 2. Uusi kortti: "Painonpudotusennuste"

**Sijainti:** Keho-sivulla, olemassa olevan "Kehitys"-kortin (index.html:1354-1358) jälkeen, ennen `#page-keho`:n sulkevaa `</div>`.

```html
<div class="card" id="forecast-card">
  <div class="card-title">Painonpudotusennuste</div>
  <div id="forecast-body"></div>
</div>
```

Kaikki sisältö (`#forecast-body`) renderöidään JS:llä `renderForecastCard()`-funktiolla — ei staattista markupia navigaatiolle/kaaviolle/tunnusluvuille, koska sisältö vaihtelee tilan mukaan (ei tavoitetta asetettu / ei dataa / normaali näkymä).

### 2.1 Tila

```js
let forecastState = null;        // { latest, profile, forecast, targetWeightKg } tai null
let forecastMonthOffset = 0;     // 0 = kuluva kuukausi, negatiivinen = mennyt, positiivinen = tuleva
```

`loadBodyMetrics()`:ssa, heti nykyisen `forecast = simulateToTarget({...})`-kutsun jälkeen (index.html:3264-3268), lisätään:

```js
forecastState = (profile && profile.target_weight_kg != null && latest && latest.fat_pct != null && latest.muscle_pct != null)
  ? { latest, profile, forecast }
  : null;
forecastMonthOffset = 0;
renderForecastCard();
```

Jos ehto ei täyty (`forecastState = null`), `renderForecastCard()` näyttää pelkän ohjeviestin eikä navigointia/kaaviota (kts. 2.4).

### 2.2 Kuukausinavigointi

```js
function changeForecastMonth(dir) { forecastMonthOffset += dir; renderForecastCard(); }

function forecastMonthBounds(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0); // kk:n viimeinen päivä
  return { startIso: localIso(start), endIso: localIso(end), label: start.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' }) };
}
```

Navigointipalkki uudelleenkäyttää olemassa olevaa `.week-nav`/`.week-btn`-CSS:ää (Sali-sivun viikkonavigoinnista, index.html:531 tienoilla) — ei uutta CSS:ää tarvita:

```html
<div class="week-nav">
  <button class="week-btn" onclick="changeForecastMonth(-1)">←</button>
  <span class="week-label">${label}</span>
  <button class="week-btn" onclick="changeForecastMonth(1)">→</button>
</div>
```

### 2.3 Tunnusluvut (aina koko ennusteesta, eivät riipu selatusta kuukaudesta)

Jos `forecastState.forecast.weeksToTarget >= 150` (ei konvergoinut, sama tarkistus kuin vanhassa koodissa):

```html
<div class="kc-week-budget-sub">Nykyisellä syömistahdilla tavoitetta ei saavuteta ennustejaksolla</div>
```
— ei tunnuslukuja eikä tulevaisuuden katkoviivaa kaaviossa (menneiden kuukausien toteuma/retrospektiivi näkyvät silti normaalisti).

Muuten kolme tiiliä (uudelleenkäyttää `.seuranta-hero-stats`/`.seuranta-hero-stat-val`/`.seuranta-hero-stat-label`-luokkia Keho-sivun omasta hero-osiosta):

```js
const etaDate = new Date();
etaDate.setDate(etaDate.getDate() + forecastState.forecast.weeksToTarget * 7);
const etaStr = etaDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
const weeklyPaceKg = -(forecastState.forecast.rows[0].weeklyDeficit / KCAL_PER_KG_FAT_LOSS).toFixed(1);
```
```html
<div class="seuranta-hero-stats">
  <div><div class="seuranta-hero-stat-val">${etaStr}</div><div class="seuranta-hero-stat-label">arvioitu pvm</div></div>
  <div class="seuranta-hero-divider"></div>
  <div><div class="seuranta-hero-stat-val">${weeklyPaceKg}kg</div><div class="seuranta-hero-stat-label">/ viikko</div></div>
  <div class="seuranta-hero-divider"></div>
  <div><div class="seuranta-hero-stat-val">${forecastState.forecast.weeksToTarget}</div><div class="seuranta-hero-stat-label">viikkoa jäljellä</div></div>
</div>
```

### 2.4 Tyhjät tilat

Jos `forecastState === null`, `#forecast-body` näyttää **vain** jommankumman viestin (ei navigointia, ei kaaviota — sama rajaus kuin ennenkin, siirretty suoraan vanhasta `#m-forecast`-logiikasta):

```js
if (!forecastState) {
  el.innerHTML = (!profile || profile.target_weight_kg == null)
    ? `Aseta tavoitepaino <a href="#" onclick="openProfileModal();return false;" style="color:var(--accent)">profiilissa</a> nähdäksesi ennusteen`
    : 'Kirjaa paino, rasva% ja lihas% nähdäksesi ennusteen';
  return;
}
```

### 2.5 Kaavio

Uusi `<canvas id="forecast-chart">` `#forecast-body`:n sisällä, uusi `charts.forecast`-instanssi (erillinen `charts.body`:sta).

Kolme datasettia, kaikki samaa `labels`-taulukkoa vasten (union kaikista kyseisen kuukauden datapisteiden päivämääristä, ISO-järjestyksessä, näytetään `iso.slice(5)`-muodossa kuten olemassa olevassa kaaviossa):

1. **Toteuma** (yhtenäinen viiva) — `body_metrics`-rivit `[startIso, endIso]`-välillä:
   ```js
   const { data: monthActual } = await sb.from('body_metrics').select('measured_at,weight_kg')
     .gte('measured_at', startIso).lte('measured_at', endIso).order('measured_at');
   ```
2. **Elävä ennuste** (katkoviiva, `borderDash:[5,5]`) — vain jos `endIso >= tänään` JA `forecastState.forecast.weeksToTarget < 150`. Lasketaan `forecastState.forecast.rows`:sta kalenteripäivät `forecastState.latest.measured_at + rivi.week*7pv`, suodatetaan `[startIso, endIso]`-väliin.
3. **Menneen ennuste** (pisteviiva, `borderDash:[2,3]`, himmeämpi väri) — **vain jos** `endIso < tänään` (täysin mennyt kuukausi). Lasketaan uudella `computeHistoricalForecast()`-funktiolla (kts. 2.6).

```js
const labels = [...new Set([...monthActual.map(r=>r.measured_at), ...forecastDates, ...historicalDates])].sort();
```
(kolme dataset-taulukkoa rakennetaan `labels`:n mukaan, `null` niille päiville joilla kyseisellä sarjalla ei ole pistettä — sama tekniikka kuin vanhassa yhdistelmäkaaviossa, index.html:3300-3308.)

```js
charts.forecast = new Chart(document.getElementById('forecast-chart'), {
  type: 'line',
  data: { labels, datasets: [
    { label:'Toteuma', data: actualData, borderColor:'#1D9E75', borderWidth:2, pointRadius:3, tension:.3, fill:false },
    ...(liveForecastData ? [{ label:'Ennuste', data: liveForecastData, borderColor:'rgba(29,158,117,0.5)', borderDash:[5,5], borderWidth:2, pointRadius:0, tension:.3, fill:false }] : []),
    ...(historicalData ? [{ label:'Mennyt ennuste', data: historicalData, borderColor:'rgba(150,150,150,0.6)', borderDash:[2,3], borderWidth:1.5, pointRadius:0, tension:.3, fill:false }] : []),
  ]},
  options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true, labels:{boxWidth:10,font:{size:10}}}},
    scales: { y:{ ticks:{color:'#555',font:{size:10}}, grid:{color:'#222'} }, x:{ ticks:{color:'#555',font:{size:10}}, grid:{display:false} } } },
});
```

Legenda näytetään tässä kaaviossa (toisin kuin `charts.body`:ssa) koska kolmen viivan ero (toteuma/ennuste/mennyt ennuste) ei ole yhtä itsestäänselvä kuin paino/rasva%/lihas%.

### 2.6 Menneen ennusteen laskenta

Uusi funktio, käyttää olemassa olevia laskentafunktioita muuttumattomana — vain syöttödata on historiallinen:

```js
async function computeHistoricalForecast(cutoffIso, targetWeightKg) {
  const [{ data: priorMetrics }, { data: priorCal }] = await Promise.all([
    sb.from('body_metrics').select('*').lt('measured_at', cutoffIso).order('measured_at', { ascending: false }).limit(1),
    sb.from('model_calibration').select('*').lte('calibrated_at', cutoffIso).order('calibrated_at', { ascending: false }).limit(1),
  ]);
  const metric = priorMetrics && priorMetrics[0];
  if (!metric || metric.fat_pct == null || metric.muscle_pct == null) return null; // ei vielä dataa tuolta ajalta

  const cal = priorCal && priorCal[0];
  const otherTissueCoeff = cal ? cal.other_tissue_kcal_per_kg : DEFAULT_OTHER_TISSUE_COEFF;
  const activityMult = cal ? cal.activity_multiplier : DEFAULT_ACTIVITY_MULT;
  const weeklyIntakeKcal = await getRecentAvgWeeklyIntake(cutoffIso);
  const comp = getBodyComposition(metric.weight_kg, metric.fat_pct, metric.muscle_pct);
  const { rows } = simulateToTarget({ fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg, targetWeightKg, weeklyIntakeKcal, otherTissueCoeff, activityMult });
  return { startDate: metric.measured_at, rows };
}
```

`cutoffIso` = selatun kuukauden ensimmäinen päivä (`startIso`) — käytetään sekä lähtömittauksen (viimeisin ennen kuukautta) että kalibroinnin (viimeisin ennen kuukautta) että ruokasaannin (`getRecentAvgWeeklyIntake(cutoffIso)`, kts. alla) rajana, jotta ennuste käyttää vain sitä dataa mikä olisi ollut saatavilla ennen kyseistä kuukautta.

**`getRecentAvgWeeklyIntake()` yleistetään** (index.html:3457-3462) ottamaan valinnainen ajankohta, oletuksena tämä päivä — olemassa olevat kutsupaikat toimivat muuttumattomana:

```js
async function getRecentAvgWeeklyIntake(asOfIso = localIso(new Date())) {
  const to = asOfIso;
  const from = localIso(addDays(new Date(asOfIso), -20));
  const totalKcal = await getFoodCalories(from, to);
  return totalKcal / 3;
}
```

**Tunnettu rajoitus (hyväksytty käyttäjän toimesta):** `targetWeightKg` on aina **nykyinen** tavoitepaino (`forecastState.profile.target_weight_kg`), ei se mikä tavoite oli menneisyydessä — `user_profile`-taulussa ei ole tavoitepainon historiaa. Jos tavoite ei ole muuttunut, ei vaikutusta; jos on muuttunut, "mennyt ennuste" -viiva näyttää mitä nykyisellä tavoitteella *olisi* ennustettu, ei sitä mitä silloin todella näytettiin.

## 3. Rajaus — mitä EI tehdä

- Ei muutoksia `simulateToTarget()`/`calculateMaintenance()`/`getBodyComposition()`/`calibrateModelIfDue()`-funktioihin — kaikki pysyvät täysin ennallaan.
- Ei muutoksia `charts.body`:n paino/rasva%/lihas%-datasetteihin — vain ennusteosuus poistetaan siitä.
- Ei tavoitepainon historiaa/versiointia `user_profile`-tauluun (kts. rajoitus yllä) — hyväksytty yksinkertaistus.
- Ei uutta tietokantataulua — kaikki "mennyt ennuste" -data lasketaan aina uudelleen pyynnöstä olemassa olevasta `body_metrics`/`model_calibration`/ruokalogi-datasta, ei tallenneta erikseen.
- Ei kuukausinavigointia rajata mihinkään tiettyyn väliin (esim. "vain 6kk taaksepäin") — käyttäjä voi selata niin pitkälle taakse/eteen kuin haluaa; kuukaudet joilta ei löydy dataa näyttävät vain tyhjän kaavion (ei virhettä).
- Ei muuteta `#m-weight`/`#m-fat`/`#m-muscle`-hero-osion sisältöä (Keho-sivun ylin "TÄNÄÄN · KEHO" -osio) — eri, erillinen osa sivua.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Ilman tavoitepainoa: Keho-sivulla uusi kortti näyttää linkin "Aseta tavoitepaino profiilissa" -viestin, ei navigointia eikä kaaviota. Vanha yhdistelmäkaavio (paino/rasva%/lihas%) näkyy edelleen normaalisti, ei ennustekatkoviivaa eikä `#m-forecast`-tekstiä (elementti kokonaan poistettu).
2. Aseta tavoitepaino, mutta ilman rasva%/lihas%-mittausta: "Kirjaa paino, rasva% ja lihas% nähdäksesi ennusteen".
3. Kirjaa mittaus rasva%/lihas%:lla, tavoite asetettu: kortti näyttää kolme tunnuslukua (arvioitu pvm, kg/viikko, viikkoa jäljellä) ja kaavion kuluvalle kuukaudelle: toteuma tähän päivään asti (yhtenäinen), ennuste tästä eteenpäin (katkoviiva).
4. Paina "→" (seuraava kuukausi): kaavio päivittyy kokonaan katkoviiva-ennusteeksi kyseiselle kuukaudelle, tunnusluvut pysyvät samoina (eivät riipu selatusta kuukaudesta).
5. Paina "←" useita kertoja menneisyyteen, kuukauteen jolta löytyy sekä toteumaa että vähintään yksi mittaus sitä ennen: kaaviossa näkyy sekä "Toteuma"-viiva (yhtenäinen) että "Mennyt ennuste" -viiva (pisteviiva) samalla kuukaudella — vertaile visuaalisesti osuivatko ne lähelle toisiaan.
6. Selaa kuukauteen ennen ensimmäistä koskaan kirjattua mittausta: kaavio on tyhjä (ei kaadu, ei virhettä), navigointi toimii silti.
7. Aseta tavoite mahdottomaksi (esim. nykyistä painoa korkeammaksi) — tunnuslukujen sijaan näytetään "Nykyisellä syömistahdilla tavoitetta ei saavuteta ennustejaksolla", kaaviossa ei näy tulevaisuuden katkoviivaa millään kuukaudella, mutta menneiden kuukausien toteuma/mennyt-ennuste -vertailu toimii edelleen.
8. Tarkista konsoli virheiden varalta koko läpikäynnin ajan, erityisesti kuukausinavigoinnin jokaisella painalluksella (uusi Supabase-kysely joka kerta).
