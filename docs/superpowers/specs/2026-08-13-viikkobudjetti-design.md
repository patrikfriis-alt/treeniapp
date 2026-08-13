# Treeniapp (Valkku) — Viikkobudjetti (weekly calorie budget bar)

**Päivämäärä:** 2026-08-13
**Laajuus:** Korvaa Koonnin "Tällä viikolla" -kortin nykyisen "Viikon kalorit" -rivin (index.html:2100-2122) — sama alullaan oleva 1% painonpudotus -laskenta, mutta uudella kehyksellä ("montako kaloria voin vielä syödä") ja uudella päiväkohtaisella tilanauhalla nykyisen yhden koko-viikon palkin lisäksi.
**Riippuvuudet:** Olemassa olevat `getBmrInfo()`, `getDailyFoodCalories()`, `getDailyExerciseCalories()`, `getExerciseCalories()`, `getFoodCalories()` -apufunktiot ja `weekRow()`-rakentaja (index.html:2076-2083). **Ei uusia Supabase-tauluja tai -sarakkeita** — kaikki data on jo olemassa (`food_log_entries`, `activity_data`, `workout_sessions`, `body_metrics`).

**Pohjautuu (mutta ei toteuta sellaisenaan):** `specs/weekly-budget-spec.md` — konsepti (kasvava/kutistuva viikkobudjetti) on sama, mutta spec-tiedoston oma tietomalli (`weekly_budget`, `weekly_intake_log`, `model_calibration` -taulut) on **hylätty**: se on kirjoitettu ennen kuin nykyinen ruokapäiväkirja (`food_log_entries` ym., spec-tiedosto `food-diary-fineli-spec.md`) ja nykyinen BMR-laskenta (`calcBmr()`, Katch-McArdle) olivat olemassa. Tämä spec laskee kaiken suoraan olemassa olevasta datasta sen sijaan.

---

## Tausta

Koonnin "Tällä viikolla" -kortissa on jo rivi joka laskee viikon nettovajeen (`weeklyNet = foodKcal - bmrInfo.bmr * elapsedDays - exerciseKcal`) verrattuna automaattisesti lasketuun 1%-painonpudotustavoitteeseen (`goalWeeklyDeficit = weightKg * 0.01 * 7700`), yhtenä koko viikon palkkina. Käyttäjä haluaa saman laskennan **kehystettynä syötävissä olevana budjettina** ("voin vielä syödä X kcal") sekä **päiväkohtaisen tilanauhan**, joka näyttää minä päivinä pysyttiin budjetissa.

---

## 1. Laskenta (ei uutta dataa, pelkkää johdettua laskentaa)

```js
// Jo olemassa: bmrInfo.bmr, bmrInfo.weightKg (getBmrInfo())
const goalWeeklyDeficit = Math.round(bmrInfo.weightKg * 0.01 * 7700);           // ennallaan
const weeklyBudget = Math.round(bmrInfo.bmr * 7 + exerciseKcalSoFar - goalWeeklyDeficit);
const remaining = weeklyBudget - foodKcalSoFar;                                 // voi mennä negatiiviseksi

// Kiinteä päiväkohtainen "oma osuus" — EI riipu liikunnasta, pysyy samana koko viikon
const fairShareDaily = bmrInfo.bmr - goalWeeklyDeficit / 7;
```

`exerciseKcalSoFar`/`foodKcalSoFar` lasketaan samalla tavalla kuin nykyinen koodi jo tekee (`getExerciseCalories(mon.iso, localIso(sun))`/`getFoodCalories(...)`, rajattuna viikon alusta tähän hetkeen, ei koko viikon loppuun asti kesken viikkoa).

**Miksi `fairShareDaily` on kiinteä:** jos se laskettaisiin `weeklyBudget / 7`:sta, myöhemmin viikolla kirjattu liikunta kasvattaisi koko viikon budjettia ja näyttäisi *takautuvasti* aiemmat päivät vihreämpinä kuin ne olivat kirjaushetkellä — sekavaa. Kiinteä osuus perustuu vain BMR:ään ja tavoitevajeeseen, ei liikuntaan; liikunta vaikuttaa vain koko viikon `weeklyBudget`/`remaining`-lukuihin, ei päiväruutujen väreihin.

**Puuttuvat päivät:** jos `foodByDate[iso]` on `undefined`/0 (ei kirjauksia sinä päivänä), se lasketaan 0 kcal syödyksi → vertailu `0 <= fairShareDaily` on aina tosi → päivä näkyy vihreänä. (Ei erillistä "ei dataa" -tilaa menneille päiville — käyttäjän eksplisiittinen valinta.)

---

## 2. Ulkoasu

### 2.1 Palkki (korvaa nykyisen `koonti-progress-track`/`-fill`-parin sisällön, ei rakennetta)

- Täyttöprosentti: `Math.min(100, Math.round(foodKcalSoFar / weeklyBudget * 100))`
- Väri: `var(--accent)` kun `foodKcalSoFar <= weeklyBudget` (sama oletusväri kuin muillakin Koonnin palkeilla); `var(--red)` kun yli — **sama punainen jota olemassa oleva `openDeficitBreakdownModal()`:n 7-päivän palkkikaavio jo käyttää ylijäämäpäiville** (`.metric-modal-bar.neg { background:var(--red); }`), ei uusi väri.
- Uusi CSS-luokka `.koonti-progress-fill.over { background:var(--red); }`

### 2.2 Rivin arvo (`weekRow()`:n `valHtml`-parametri)

`"{eatenSoFar} / {weeklyBudget} kcal"` — sama tiivis muoto kuin Askeltavoite-kortilla (`"633/10 000"`).

### 2.3 Alarivi palkin alla (uusi)

```
Voit vielä syödä {remaining} kcal tällä viikolla        [kun remaining >= 0]
Ylitit budjetin {Math.abs(remaining)} kcal:lla           [kun remaining < 0]
```

Tyyli: `font-size:12px; color:var(--text3); margin-top:4px;` (sama sävy kuin muut Koonti-kortin apu­tekstit).

### 2.4 Päiväkohtainen tilanauha (uusi)

7 pientä pyöreää "chippiä" (Ma–Su), sama visuaalinen kieli kuin olemassa olevassa `.wd-btn`-viikonpäivävalitsimessa (index.html:437-442: `border-radius:50%`, `var(--surface2)`-oletustausta), mutta pienempänä ja tilan mukaan väritettynä:

```css
.kc-week-daystrip { display:flex; gap:6px; margin-top:8px; }
.kc-week-day {
  width:28px; height:28px; border-radius:50%; background:var(--surface2);
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:600; color:var(--text3);
}
.kc-week-day.under { background:var(--green); color:#fff; }
.kc-week-day.over  { background:var(--red); color:#fff; }
```

Logiikka per päivä (Ma...Su, tämän ISO-viikon):
- **Tuleva päivä** (myöhemmin tällä viikolla kuin tänään): ei luokkaa, pelkkä oletus `var(--surface2)`-harmaa, kirjain `var(--text3)`-sävyllä — ei arviota.
- **Tänään tai mennyt päivä**: `foodByDate[iso] <= fairShareDaily` → `.under`-luokka (vihreä); muuten → `.over`-luokka (punainen).

Kirjaimet: `M T K T P L S` (yksi kirjain per päivä, samat alkukirjaimet kuin `DAYS`-vakion lyhenteissä, vain ensimmäinen kirjain ison koon säästämiseksi 28px-ympyrässä).

---

## 3. Rajaus — mitä EI tehdä

- Ei kosketa `openDeficitBreakdownModal()`:ia tai "Päivän kalorit" -hero-metriikkaa (`loadDeficitHeroMetric()`) — ne pysyvät ennallaan, eri näkymä (päivätaso, ei viikkotaso).
- Ei uusia Supabase-tauluja/-sarakkeita.
- Ei kosketusta/tap-toimintoa päiväruutuihin (pelkkä passiivinen näyttö).
- Ei retroaktiivista päivien uudelleenväritystä liikunnan mukaan (ks. yllä, tietoinen valinta).
- Ei muuta `target_loss_pct`:ia käyttöliittymästä — 1% pysyy kiinteänä vakiona kuten nykyiselläänkin (`* 0.01`).

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Koonti, tarkista "Tällä viikolla" -kortin "Viikon kalorit" -rivi: arvo muodossa "X / Y kcal", palkki täyttyy oikein, alarivillä "Voit vielä syödä..." -teksti.
2. Tarkista päiväruudut: menneet päivät vihreitä/punaisia dataan perustuen, tulevat päivät harmaita.
3. Kirjaa ruokaa tänään yli päivän oman osuuden (`fairShareDaily`) — tarkista että tämän päivän ruutu muuttuu punaiseksi, mutta eiliset päivät eivät muutu.
4. Kirjaa liikuntaa tänään — tarkista että `weeklyBudget`/`remaining`-luvut ja palkin täyttöprosentti päivittyvät, mutta päiväruutujen värit eivät muutu retroaktiivisesti.
5. Kirjaa niin paljon ruokaa että viikon kokonaisbudjetti ylittyy — tarkista että palkki ja alariv vaihtuvat punaiseksi/"Ylitit budjetin..." -tekstiksi.
