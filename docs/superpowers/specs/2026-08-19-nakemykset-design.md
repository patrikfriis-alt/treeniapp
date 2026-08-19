# Treeniapp (Valkku) — Näkemykset (correlated insights page)

**Päivämäärä:** 2026-08-19
**Laajuus:** Uusi "Näkemykset"-sivu (sivuvalikosta), jolla kaksi korrelaatiokaaviota (uni→treenisuoritus, ennusteen tarkkuus) sekä Huomiot-historia edellisiltä viikoilta, laskettuna takautuvasti olemassa olevasta datasta.
**Riippuvuudet:** Chart.js (jo käytössä), `loadHuomioita()`:n nykyinen huomiologiikka (puretaan uudelleenkäytettäviksi funktioiksi), `getBodyComposition()`, `calculateMaintenance()`, `getFoodCalories()`, `model_calibration`-taulu, `showPage()`-reititys.

---

## Tausta

`loadHuomioita()` laskee jo viikko-vs-viikko-huomioita (1RM-kehitys, paino/rasva%/lihas%-trendi, askeleet, unipisteet, treenimäärä+uni-yhdistelmä) ja näyttää parhaat 3 Koonnin bannerina. Tämä sivu ei korvaa sitä — se (a) tekee saman logiikan näkyväksi historiana useammalta viikolta, ja (b) lisää kaksi uutta, aiemmin laskematonta korrelaatiota omina kaavioinaan.

**Ei uutta tietomallia** — kaikki lasketaan olemassa olevasta datasta (`workout_sets`, `sleep_data`, `body_metrics`, `model_calibration`, `food_log_entries`, `step_data`).

---

## 1. Uusi sivu ja navigointi

Uusi `<div id="page-nakemykset" class="page">`, samalla `page-header`-rakenteella kuin `page-ohjelma`/`page-valmentaja`:

```html
<div id="page-nakemykset" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Näkemykset</span>
  </div>
  <div id="nakemykset-content"></div>
</div>
```

`showPage(name, btn)`:iin lisätään `if (name === 'nakemykset') renderNakemyksetPage();`.

Sivuvalikkoon uusi nappi "Ohjelma"/"Valmentaja"-ryhmän loppuun (Valmentajan jälkeen), uudella `trending`-ikonilla (ei sopivaa olemassa olevaa):

```js
trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
```

`border-bottom:1px solid var(--border)` (ryhmän visuaalinen erotin ennen "Asetukset"-otsikkoa) siirtyy Valmentaja-napista Näkemykset-nappiin, koska Näkemyksestä tulee ryhmän viimeinen.

---

## 2. Uni → treenisuoritus -kaavio

Scatter-kaavio (Chart.js `type: 'scatter'}`): x = edellisen yön unipisteet, y = seuraavan päivän treenitonnimäärä (paino × toistot summattuna päivälle).

```js
async function loadSleepTonnageChart() {
  const fromIso = localIso(addDays(new Date(), -90));
  const todayIso = localIso(new Date());
  const [{ data: sleepRows }, { data: setsRows }] = await Promise.all([
    sb.from('sleep_data').select('sleep_date,sleep_score').gte('sleep_date', fromIso).lte('sleep_date', todayIso),
    sb.from('workout_sets').select('workout_date,weight_kg,reps').gte('workout_date', fromIso).lte('workout_date', todayIso),
  ]);
  const sleepByDate = {};
  (sleepRows || []).forEach(r => { const s = calcSleepScore(r); if (s != null) sleepByDate[r.sleep_date] = s; });
  const tonnageByDate = {};
  (setsRows || []).forEach(r => {
    if (r.weight_kg == null || r.reps == null) return;
    tonnageByDate[r.workout_date] = (tonnageByDate[r.workout_date] || 0) + r.weight_kg * r.reps;
  });
  const points = [];
  Object.entries(tonnageByDate).forEach(([date, tonnage]) => {
    const prevDayIso = localIso(addDays(new Date(date + 'T00:00:00'), -1));
    const sleepScore = sleepByDate[prevDayIso];
    if (sleepScore != null) points.push({ x: sleepScore, y: Math.round(tonnage) });
  });
  return points;
}
```

90 päivän ikkuna riittää käytännössä (kattaa useita kuukausia treenidataa). Jos `points.length < 3`, näytetään tyhjätila-viesti kaavion sijaan ("Ei tarpeeksi dataa — tarvitaan väh. 3 treenipäivää joilla edellisyön unidata").

---

## 3. Ennusteen tarkkuus -kaavio

**Ongelma:** `model_calibration` tallentaa vain viritetyt kertoimet, ei mennyttä ennustetta. Ennuste jokaiselle mittausvälille rekonstruoidaan jälkikäteen samalla kaavalla kuin `calibrateModelIfDue()` käyttää — mutta ratkaisten *ennustetun rasvanpudotuksen* (tunnettua kerrointa käyttäen) sen sijaan että ratkaistaisiin *uusi kerroin* (tunnetusta rasvanpudotuksesta). Ei uutta taulua — pelkkä lisänäkymä olemassa olevaan dataan.

```js
async function loadForecastAccuracyChart() {
  const [{ data: measurements }, { data: calibrations }] = await Promise.all([
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').order('measured_at', { ascending: true }),
    sb.from('model_calibration').select('other_tissue_kcal_per_kg,calibrated_at').order('calibrated_at', { ascending: true }),
  ]);
  const rows = (measurements || []).filter(m => m.weight_kg != null && m.fat_pct != null && m.muscle_pct != null);
  if (rows.length < 3) return { predicted: [], actual: [] };

  const pairs = [];
  for (let i = 1; i < rows.length; i++) {
    const days = (new Date(rows[i].measured_at) - new Date(rows[i - 1].measured_at)) / 86400000;
    if (days > 0) pairs.push({ m1: rows[i - 1], m2: rows[i], days });
  }

  const intakes = await Promise.all(pairs.map(p => getFoodCalories(p.m1.measured_at, p.m2.measured_at)));

  const coeffAt = (dateIso) => {
    let coeff = DEFAULT_OTHER_TISSUE_COEFF;
    (calibrations || []).forEach(c => { if (c.calibrated_at <= dateIso) coeff = c.other_tissue_kcal_per_kg; });
    return coeff;
  };

  const predicted = [], actual = [];
  pairs.forEach((p, i) => {
    const { m1, m2, days } = p;
    const comp1 = getBodyComposition(m1.weight_kg, m1.fat_pct, m1.muscle_pct);
    const comp2 = getBodyComposition(m2.weight_kg, m2.fat_pct, m2.muscle_pct);
    const actualFatLossKg = comp1.fatKg - comp2.fatKg;

    const coeff = coeffAt(m1.measured_at);
    const avgFat = (comp1.fatKg + comp2.fatKg) / 2;
    const avgMuscle = (comp1.muscleKg + comp2.muscleKg) / 2;
    const avgOther = (comp1.otherKg + comp2.otherKg) / 2;
    const predictedDailyExpenditure = calculateMaintenance(avgFat, avgMuscle, avgOther, coeff, DEFAULT_ACTIVITY_MULT);
    const predictedFatLossKg = (predictedDailyExpenditure * days - intakes[i]) / KCAL_PER_KG_FAT_LOSS;

    predicted.push({ x: m2.measured_at, y: Math.round(predictedFatLossKg * 10) / 10 });
    actual.push({ x: m2.measured_at, y: Math.round(actualFatLossKg * 10) / 10 });
  });
  return { predicted, actual };
}
```

`coeffAt(dateIso)` käyttää sitä kerrointa joka oli voimassa **mittausvälin alussa** (`m1.measured_at`) — ei nykyistä kerrointa — jotta ennuste vastaa sitä mitä malli olisi silloin oikeasti ennustanut, ei sitä mitä se ennustaisi tänään taannehtivasti korjatuilla kertoimilla. `intakes`-haut rinnakkaistetaan `Promise.all`:lla per pari (ei peräkkäisiä `await`-kutsuja silmukassa).

Renderöidään Chart.js-viivakaaviona kahdella sarjalla (Ennustettu / Toteutunut), x-akseli `m2.measured_at`-päivämäärät. Jos `pairs.length < 2`, tyhjätila-viesti ("Ei tarpeeksi mittauksia ennustevertailuun — tarvitaan väh. 3 Keho-mittausta").

---

## 4. Huomiot-historia (takautuva)

`loadHuomioita()`:n sisäinen huomiologiikka puretaan viideksi uudelleenkäytettäväksi, puhtaaksi funktioksi (sama logiikka, ei käyttäytymismuutosta live-bannerille):

- `detect1RMInsights(setsRows, from21, from42)` → array
- `detectBodyTrendInsights(weightRows)` → array
- `detectStepsInsight(stepsThisVals, stepsLastVals)` → yksi tai `null`
- `detectSleepInsight(sleepScoresThis, sleepScoresLast)` → yksi tai `null`
- `detectDeloadInsight(tonnageThis, tonnageLast, sleepScoresThis, sleepScoresLast, includeAction)` → yksi tai `null` (`includeAction`-parametri: `true` live-bannerissa jotta "Merkitse kevyeksi viikoksi" -nappi näkyy, `false` historiassa koska mennyttä viikkoa ei voi merkitä jälkikäteen)

`loadHuomioita()` kutsuu näitä täsmälleen samoilla syötteillä kuin nykyinen inline-koodi käyttää — ei toiminnallista muutosta Koonnin bannerille.

Uusi `computeHuomiotHistory(numWeeks = 12)` hakee raakadatan **kerran** riittävän laajalta ikkunalta (12 viikkoa + 6 viikon puskuri 1RM:n `from42`-vertailulle), ja ajaa saman detektorijoukon jokaiselle viikolle JS:ssä ilman lisäkyselyitä per viikko:

```js
async function computeHuomiotHistory(numWeeks = 12) {
  const bufferWeeks = 6; // from42-ikkunan puskuri vanhimmalle tarkasteltavalle viikolle
  const earliestMonday = wStart(-(numWeeks + bufferWeeks));
  const todayIso = localIso(new Date());

  const [
    { data: setsRows },
    { data: weightRows },
    { data: sleepRows },
    { data: stepsRows },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', earliestMonday.iso).lte('workout_date', todayIso),
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').gte('measured_at', earliestMonday.iso).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
    sb.from('sleep_data').select('sleep_date,sleep_score').gte('sleep_date', earliestMonday.iso).lte('sleep_date', todayIso),
    sb.from('step_data').select('step_date,steps').gte('step_date', earliestMonday.iso).lte('step_date', todayIso),
  ]);

  const tonnageForRange = (from, to) => (setsRows || [])
    .filter(r => r.workout_date >= from && r.workout_date <= to && r.weight_kg != null && r.reps != null)
    .reduce((s, r) => s + r.weight_kg * r.reps, 0);

  const history = [];
  for (let w = 0; w < numWeeks; w++) {
    const weekMon = wStart(-w);
    const weekTo = localIso(addDays(weekMon.date, 6));
    const prevMon = wStart(-w - 1);
    const prevFrom = prevMon.iso, prevTo = localIso(addDays(prevMon.date, 6));
    const from21 = localIso(addDays(weekMon.date, -21));
    const from42 = localIso(addDays(weekMon.date, -42));

    const weekInsights = [
      ...detect1RMInsights(setsRows, from21, from42),
      ...detectBodyTrendInsights((weightRows || []).filter(r => r.measured_at <= weekTo && r.measured_at >= from21)),
    ];

    const stepsThisVals = (stepsRows || []).filter(r => r.step_date >= weekMon.iso && r.step_date <= weekTo).map(r => r.steps);
    const stepsLastVals = (stepsRows || []).filter(r => r.step_date >= prevFrom && r.step_date <= prevTo).map(r => r.steps);
    const stepsInsight = detectStepsInsight(stepsThisVals, stepsLastVals);
    if (stepsInsight) weekInsights.push(stepsInsight);

    const sleepScoresThis = (sleepRows || []).filter(r => r.sleep_date >= weekMon.iso && r.sleep_date <= weekTo).map(r => calcSleepScore(r)).filter(s => s != null);
    const sleepScoresLast = (sleepRows || []).filter(r => r.sleep_date >= prevFrom && r.sleep_date <= prevTo).map(r => calcSleepScore(r)).filter(s => s != null);
    const sleepInsight = detectSleepInsight(sleepScoresThis, sleepScoresLast);
    if (sleepInsight) weekInsights.push(sleepInsight);

    const deloadInsight = detectDeloadInsight(
      tonnageForRange(weekMon.iso, weekTo), tonnageForRange(prevFrom, prevTo),
      sleepScoresThis, sleepScoresLast, false,
    );
    if (deloadInsight) weekInsights.push(deloadInsight);

    weekInsights.sort((a, b) => b.magnitude - a.magnitude);
    if (weekInsights.length) {
      history.push({
        weekLabel: `Viikko ${isoWeek(weekMon.date)} / ${isoWeekYear(weekMon.date)}`,
        insights: weekInsights.slice(0, 3),
      });
    }
  }
  return history; // uusin viikko ensin (w=0 = kuluva viikko)
}
```

Renderöinti: yksinkertainen lista, viikko-otsikko + sen top-3 huomiota tekstinä (ei action-nappeja, koska `includeAction=false`). Jos `history` on tyhjä, tyhjätila-viesti.

---

## 5. Rajaus

- Ei uusia tauluja/sarakkeita.
- Ei muutoksia `loadHuomioita()`:n käyttäytymiseen Koonnissa — puhdas refaktorointi, sama data sisään, sama ulos.
- Historia rajattu 12 viikkoon (n. 3 kk) — ei rajattoman pitkää takautuvaa listaa yhdellä kertaa.
- Ei kaavioiden interaktiivista aikaväliin suodatusta (esim. "näytä vain viim. 30 pv") tässä versiossa — kiinteät ikkunat (90 pv uni-kaaviolle, koko historia ennustekaaviolle).

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Näkemykset sivuvalikosta — tarkista että sivu latautuu, molemmat kaaviot ja historialista näkyvät (tai tyhjätila-viestit jos dataa ei ole tarpeeksi).
2. Tarkista uni→tonnimäärä-kaavio: pisteiden määrä täsmää päivien määrään joilla on sekä edellisyön unidata että treenidata.
3. Tarkista ennustekaavio: molemmat sarjat (ennustettu/toteutunut) näkyvät, arvot ovat järkeviä (ei NaN/Infinity).
4. Tarkista historialista: useampi viikko näkyy takautuvasti, tekstit vastaavat samaa logiikkaa kuin Koonnin Huomiot-banneri (vertaa kuluvan viikon historiarivi Koonnin bannerin sisältöön — pitäisi täsmätä).
5. Palaa Koontiin, tarkista että Huomiot-banneri toimii edelleen täsmälleen kuten ennen refaktorointia.
6. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
