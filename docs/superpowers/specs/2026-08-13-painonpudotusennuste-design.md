# Treeniapp (Valkku) — Painonpudotusennuste (self-calibrating weight-loss forecast)

**Päivämäärä:** 2026-08-13
**Laajuus:** Kaksiosastoinen (rasva + lihas) malli, joka ennustaa milloin tavoitepaino saavutetaan nykyisellä syömistahdilla, ja kalibroi itsensä automaattisesti todellisen datan perusteella. Näkyy Keho-sivun olemassa olevan "Kehitys"-kaavion laajennuksena.
**Riippuvuudet:** Olemassa oleva `body_metrics`-taulu (weight_kg, fat_pct, muscle_pct), olemassa oleva `user_profile`-taulu (sex, height_cm, birth_date), olemassa oleva `getFoodCalories(fromIso, toIso)` -apufunktio, olemassa oleva Keho-sivun `loadBodyMetrics()`/`saveBodyMetrics()` ja Profiili-modaali (`openProfileModal()`).

**Pohjautuu (mutta ei toteuta sellaisenaan):** `specs/weight-loss-forecast-spec.md` — laskentamalli (kaksi kudoskompartmenttia, kalibroituvat kertoimet, viikkosimulaatio) on sama, mutta spec-tiedoston oma tietomalli (`body_metrics` `user_id`-viittauksella, `weekly_intake_log`-taulu) on **hylätty**: kirjoitettu ennen kuin nykyinen no-auth-malli ja ruokapäiväkirja olivat olemassa. Tämä spec käyttää olemassa olevaa `body_metrics`-skeemaa sellaisenaan ja laskee viikkosaannin suoraan `food_log_entries`:stä, ei erillisestä rollup-taulusta.

---

## Tausta

Nykyinen BMR-laskenta (`calcBmr()`, index.html:2918-2926) käyttää Katch-McArdle-kaavaa (370 + 21.6 × laihamassa) kun rasva% tunnetaan — yhtä kudoskoostumuskerrointa koko laihamassalle, ei erikseen rasvaa/lihasta. Se on staattinen: ainoa säätömahdollisuus on käsin asetettava `calorie_correction`-kerroin (oletus 0.72), joka vaikuttaa vain liikunta-arvioihin, ei itse BMR:ään. Käyttäjä haluaa tarkemman, itsestään kalibroituvan mallin joka ennustaa milloin tavoitepaino saavutetaan — ei vain näytä nykyistä vajetta.

---

## 1. Tietomalli

**Ei muutoksia `body_metrics`-tauluun** — `weight_kg`, `fat_pct`, `muscle_pct` ovat jo olemassa.

```sql
-- Tavoitepaino, osa profiilia (ei erillistä tavoite-taulua)
alter table user_profile add column if not exists target_weight_kg numeric;

-- Kalibrointihistoria — uusi rivi joka kalibroinnilla, ei koskaan päivitetä olemassa olevaa
create table model_calibration (
  id uuid primary key default gen_random_uuid(),
  calibrated_at timestamptz not null default now(),
  other_tissue_kcal_per_kg numeric not null,
  activity_multiplier numeric not null,
  sample_weeks numeric not null
);

alter table model_calibration enable row level security;

create policy model_calibration_select on model_calibration
  for select to anon, authenticated using (true);
create policy model_calibration_insert on model_calibration
  for insert to anon, authenticated with check (true);
```

Ei delete-/update-policya (ei koskaan muokata/poisteta olemassa olevaa kalibrointia — vain lisätään uusia). Ei `weekly_intake_log`-taulua eikä `user_id`-viittauksia (sama no-auth-malli kuin kaikkialla muualla).

---

## 2. Laskentamoduuli

Uusi itsenäinen funktiojoukko (ei UI-riippuvuuksia), spec-tiedoston `weight-loss-forecast-spec.md` §3-4 mukaisesti, muuttumattomana lukuun ottamatta datalähdettä:

```js
const KCAL_PER_KG_FAT_RESTING = 4.5;
const KCAL_PER_KG_MUSCLE_RESTING = 13.0;
const KCAL_PER_KG_FAT_LOSS = 7700;
const DEFAULT_OTHER_TISSUE_COEFF = 30;
const DEFAULT_ACTIVITY_MULT = 1.5;

function getBodyComposition(weightKg, fatPct, musclePct) { /* → {fatKg, muscleKg, otherKg} */ }
function calculateMaintenance(fatKg, muscleKg, otherKg, otherTissueCoeff, activityMult) { /* → kcal/day */ }
function simulateToTarget({ fatKg, muscleKg, otherKg, targetWeightKg, weeklyIntakeKcal, otherTissueCoeff, activityMult, maxWeeks = 150 }) { /* → { weeksToTarget, rows } */ }
```

`muscleChangeKgPerWeek` pidetään aina `0`:na (spec-tiedoston oma oletusarvo) — lihasmuutoksen kalibrointi jätetään pois laajuudesta, kuten alkuperäinen spec itsekin ehdottaa yksinkertaisimpana versiona.

### 2.1 Kalibrointi

```js
async function calibrateModelIfDue() {
  const { data: measurements } = await sb.from('body_metrics').select('*')
    .order('measured_at', { ascending: true });
  if (!measurements || measurements.length < 3) return; // ei vielä tarpeeksi dataa

  const { data: lastCal } = await sb.from('model_calibration').select('calibrated_at')
    .order('calibrated_at', { ascending: false }).limit(1).maybeSingle();
  if (lastCal) {
    const daysSince = (Date.now() - new Date(lastCal.calibrated_at)) / 86400000;
    if (daysSince < 14) return; // liian pian edellisestä
  }

  const m1 = measurements[measurements.length - 2];
  const m2 = measurements[measurements.length - 1];
  const comp1 = getBodyComposition(m1.weight_kg, m1.fat_pct, m1.muscle_pct);
  const comp2 = getBodyComposition(m2.weight_kg, m2.fat_pct, m2.muscle_pct);
  const actualFatLossKg = comp1.fatKg - comp2.fatKg;
  const actualFatLossKcal = actualFatLossKg * KCAL_PER_KG_FAT_LOSS;

  const weeksBetween = (new Date(m2.measured_at) - new Date(m1.measured_at)) / 86400000 / 7;
  const totalIntakeKcal = await getFoodCalories(m1.measured_at, m2.measured_at); // olemassa oleva apufunktio

  const actualDailyExpenditure = (totalIntakeKcal + actualFatLossKcal) / (weeksBetween * 7);
  const avgFat = (comp1.fatKg + comp2.fatKg) / 2;
  const avgMuscle = (comp1.muscleKg + comp2.muscleKg) / 2;
  const avgOther = (comp1.otherKg + comp2.otherKg) / 2;
  const bmrImplied = actualDailyExpenditure / DEFAULT_ACTIVITY_MULT;
  const otherContribution = bmrImplied - (avgFat * KCAL_PER_KG_FAT_RESTING) - (avgMuscle * KCAL_PER_KG_MUSCLE_RESTING);
  const newCoeff = otherContribution / avgOther;

  await sbWrite({
    table: 'model_calibration', op: 'insert',
    payload: { other_tissue_kcal_per_kg: newCoeff, activity_multiplier: DEFAULT_ACTIVITY_MULT, sample_weeks: weeksBetween },
  });
}
```

**Laukaisin:** kutsutaan `saveBodyMetrics()`:n onnistuneen tallennuksen jälkeen (index.html:2887-2888, `loadBodyMetrics()`-kutsun vierestä) — ei odoteta, ei estetä UI:ta sen valmistumisella (fire-and-forget, samaan tapaan kuin muutkin taustapäivitykset tässä sovelluksessa).

**Miksi vain 2 viimeisintä mittausta:** alkuperäinen spec ehdottaa yksinkertaisinta versiota 2 pisteellä, ja mainitsee että >6 mittauksella kannattaisi harkita painotettua keskiarvoa/regressiota. Tämä jätetään myöhemmäksi — ei osa tätä specciä (YAGNI, sama periaate kuin muissakin tämän session speceissä).

---

## 3. Ennusteen syöttödata

**Viikkosaanti simulaatioon:** käyttäjän viimeisten 3 viikon todellinen keskimääräinen syönti, ei manuaalinen syöte eikä viikkobudjetin tavoite:

```js
async function getRecentAvgWeeklyIntake() {
  const to = localIso(new Date());
  const from = localIso(addDays(new Date(), -20)); // ~3 viikkoa
  const totalKcal = await getFoodCalories(from, to); // olemassa oleva apufunktio
  return totalKcal / 3;
}
```

**Kalibrointikertoimet:** haetaan tuorein `model_calibration`-rivi; jos ei yhtään, käytetään `DEFAULT_OTHER_TISSUE_COEFF`/`DEFAULT_ACTIVITY_MULT` ja merkitään UI:ssa "ei vielä kalibroitu".

**Lähtötila simulaatiolle:** tuorein `body_metrics`-rivi (`getBodyComposition()`:iin).

---

## 4. Käyttöliittymä

**Sijainti:** Keho-sivun olemassa olevan "Kehitys"-kaavion (`loadBodyMetrics()`, index.html:2824-2865) laajennus — ei uutta sivua/korttia.

**Kaavio:** lisätään olemassa olevaan `charts.body`-Chart.js-instanssiin kolmas/neljäs datasetti "Ennuste" — katkoviiva (`borderDash:[5,5]`), sama väri kuin Paino-viiva mutta himmeämpi, jatkuu viimeisimmästä oikeasta mittauspisteestä `simulateToTarget()`:n palauttamien viikkorivien mukaisesti tavoitepainoon asti.

**Tekstiosio kaavion alla (uusi):**
- Jos `target_weight_kg` ei asetettu: `"Aseta tavoitepaino profiilissa nähdäksesi ennusteen"` + linkki/nappi joka avaa `openProfileModal()`.
- Jos asetettu ja ≥1 mittaus: `"Ennuste: {weeksToTarget} viikkoa ({arvioitu päivämäärä})"`, alarivillä `"Malli kalibroitu {N} mittauksesta"` tai `"Ei vielä kalibroitu — käytetään oletusarvoja"` jos `model_calibration` on tyhjä.
- Jos `weeksToTarget` saavuttaa `maxWeeks`-katon (150) ilman että tavoite täyttyi (esim. `weeklyIntakeKcal` ylittää ylläpitotarpeen eikä painonpudotusta tapahdu) — `simulateToTarget()`:n `while`-ehto ei koskaan tule todeksi, joten `weeksToTarget === maxWeeks` on tarkka signaali "ei konvergoinut": näytetään `"Nykyisellä syömistahdilla tavoitetta ei saavuteta ennustejaksolla"` — ei kaadu, ei näytä virheellistä lukua.

**Profiili-modaali:** uusi kenttä `openProfileModal()`:iin, saman kaavan mukaan kuin sukupuoli/pituus/syntymäaika:
```html
<div class="form-row"><label>Tavoitepaino (kg)</label><input type="text" inputmode="decimal" id="profile-target-weight" value="${profile.target_weight_kg ?? ''}"></div>
```
Valinnainen — tyhjä sallitaan (ei validointivirhettä), tallennetaan `null`.

---

## 5. Rajaus — mitä EI tehdä

- Ei luottamusväliä ("±1 viikko") — pelkkä yksittäinen ennusteluku.
- Ei manuaalista viikkosaanti-syötettä — aina viimeisten 3 viikon todellinen keskiarvo.
- Ei lihasmuutoksen kalibrointia (`muscleChangeKgPerWeek` pysyy 0:na).
- Ei painotettua/regressiokalibrointia usealla mittauksella — aina yksinkertaisin 2-pisteversio kahdesta tuoreimmasta mittauksesta.
- Ei kalibrointihistorian selausnäkymää — käytetään aina vain tuorein kalibrointi, vaikka historia tallennetaankin.
- Ei koske olemassa olevaa `calcBmr()`/`getBmrInfo()`-laskentaa (Koonnin päivän kalorit -hero, viikkobudjetti) — eri, erillinen laskentapolku, ei korvata tällä.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Profiili, aseta tavoitepaino, tallenna.
2. Mene Keho-sivulle jolla on ≥2 aiempaa mittausta — tarkista että "Ennuste"-teksti näkyy "Ei vielä kalibroitu" -tilassa (jos <3 mittausta yhteensä) ja kaavioon ilmestyy katkoviivaennuste.
3. Lisää mittauksia (esim. testidatana) kunnes yhteensä ≥3 — tarkista konsolista/Supabasesta että `model_calibration`-riviä ilmestyy tallennuksen jälkeen.
4. Tarkista että 14 päivän sisällä uudelleentallennus EI luo uutta kalibrointiriviä (`daysSince < 14`-suoja toimii).
5. Aseta tavoitepaino nykyistä painoa korkeammaksi (mahdoton laihdutustavoite) — tarkista että näytetään "ei saavuteta" -viesti eikä sovellus kaadu tai näytä `NaN`/`Infinity`.
