# Treeniapp (Valkku) — Unipisteiden käsinsyöttö

**Päivämäärä:** 2026-08-06
**Laajuus:** Korvaa epäluotettavan HealthKit-unisynkkauksen (Shortcuts-automaatio, joka syöttää `duration_min`/`deep_sleep_min`/`rem_sleep_min`/`awakenings`) suoralla käsinsyötöllä: käyttäjä kirjaa joka aamu pelkän unipistemäärän (0-100), sovellus rekisteröi ja seuraa sitä. Kaikki paikat jotka tähän asti ovat näyttäneet unen KESTOA (tunteina) muutetaan näyttämään unipisteitä sen sijaan, koska kestoa ei enää kerätä jatkossa.
**Riippuvuudet:** Olemassa oleva `sleep_data`-taulu (laajennetaan, ei korvata), olemassa oleva `calcSleepScore()` (yksinkertaistetaan), olemassa oleva "Kirjaa uni" -lomake Uni-sivulla (muokataan), olemassa olevat Huomioita-järjestelmän uni-huomiot (yksi poistuu tarpeettomana, yksi jää ennalleen).

**Ei koske:** Apple Shortcuts -automaatioita ei tarvitse enää korjata unen osalta — tämä muutos tekee niistä tarpeettomia unen osalta (askel- ja treenisynkkaus jatkuvat ennallaan, ne eivät liity tähän).

---

## Tausta

HealthKitin unisynkkaus (syvä uni / REM / heräilyt) on osoittautunut hauraaksi (locale-pilkku Duration-arvoissa, REM-suodattimen isojen kirjainten herkkyys, ks. `reference-apple-shortcuts-quirks`-muisti) ja vaatii jatkuvaa vianetsintää. `calcSleepScore()` vaatii lisäksi KAIKKI neljä kenttää ollakseen non-null — yksikin puuttuva kenttä tekee koko pisteytyksestä tyhjän. Sen sijaan että automaatiota yritettäisiin korjata jälleen, käyttäjä syöttää itse joka aamu kokonaisarvion unen laadusta yhtenä 0-100-pistelukuna (sama asteikko kuin nykyinen laskukaava tuottaa, joten historiallinen vertailu pysyy mielekkäänä).

Vanhat `duration_min`/`deep_sleep_min`/`rem_sleep_min`/`awakenings`-sarakkeet ja niiden historiadata **säilytetään** tietokannassa (ei poisteta, ei migraatiota joka pudottaisi sarakkeita) — niitä vain ei enää täytetä eikä lueta uusissa syötteissä. Tämä on tietoinen valinta: ei tarvetta hävittää historiallista dataa, ja mahdollistaa myöhemmän paluun jos HealthKit-synkkaus joskus halutaan ottaa uudelleen käyttöön eri muodossa.

---

## 1. Tietokanta: `sleep_score`-sarake

```sql
alter table sleep_data add column sleep_score integer check (sleep_score >= 0 and sleep_score <= 100);
```

Ei muuta muutosta skeemaan — `duration_min` ym. pysyvät sarakkeina, vain uusi `sleep_score` lisätään rinnalle.

---

## 2. `calcSleepScore()`: lue sen sijaan että laske

Nykyinen (index.html:1767-1779) laskee pistemäärän neljästä kentästä, vaatien kaikki neljä non-null. Korvataan suoralla luvulla:

```js
function calcSleepScore(row) {
  return row && row.sleep_score != null ? row.sleep_score : null;
}
```

Kaikki olemassa olevat kutsujat (`loadSleep()`, Koonnin `kcUniSub`, Huomioiden "Unipisteet laskenut" -huomio, ylikuormitushuomio) toimivat muuttumattomina — ne kutsuvat `calcSleepScore(row)`:ta ja lukevat palautusarvon, eivät riipu siitä MITEN se lasketaan sisäisesti.

---

## 3. "Kirjaa uni" -lomake: neljä kenttää yhdeksi

Nykyinen lomake (index.html:1184-1193) kysyy Kesto/Syvä uni/REM/Heräilyt. Korvataan yhdellä kentällä:

```html
<div class="card">
  <div class="card-title">Kirjaa uni</div>
  <div class="form-row"><label>Päivämäärä</label><input type="date" id="sleep-date"></div>
  <div class="form-row"><label>Unipisteet (0-100)</label><input type="text" inputmode="numeric" id="sleep-score" placeholder="esim. 82"></div>
  <button class="btn btn-primary" onclick="saveSleep()">Tallenna</button>
  <div class="status" id="sleep-status"></div>
</div>
```

`saveSleep()` (index.html:3305-3329) tallentaa vain `sleep_date`/`sleep_score`:

```js
async function saveSleep() {
  const date = document.getElementById('sleep-date').value;
  if (!date) { showStatus('sleep-status','Valitse päivämäärä',true); return; }
  const score = parseNum('sleep-score');
  if (score == null || score < 0 || score > 100) { showStatus('sleep-status','Syötä 0-100', true); return; }
  const btn = document.querySelector('#page-uni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sbWrite({
      table: 'sleep_data',
      op: 'upsert',
      payload: { sleep_date: date, sleep_score: score },
      opts: { onConflict: 'sleep_date' },
    });
    if (error) { showStatus('sleep-status','Virhe',true); return; }
    showStatus('sleep-status','Tallennettu!',false);
    loadSleep();
  } finally {
    btn.disabled = false;
  }
}
```

Huom: `upsert` päivittää koko rivin `onConflict: 'sleep_date'` -ehdolla, mutta koska `payload` ei enää sisällä `duration_min` ym., mahdollisesti jo olemassa olevat historialliset arvot samalle `sleep_date`:lle (esim. jos joku päivä oli aiemmin sekä HealthKit-synkattu että nyt käsin päivitetty) **säilyvät ennallaan** — Supabasen upsert päivittää vain annetut sarakkeet, ei nollaa puuttuvia. Tämä on toivottu käytös.

---

## 4. Uni-sivun hero: pisteytys tunti-arvon sijaan

Nykyinen hero (index.html:1173-1183, `loadSleep()` index.html:3275-3303) näyttää tuntimäärän + "Syvä uni" -tilaston. Uudessa versiossa unipisteet on ainoa mitattu suure:

```html
<div class="seuranta-hero seuranta-hero--uni">
  <div class="seuranta-hero-glow" style="background:radial-gradient(circle,rgba(0,92,158,0.5) 0%,transparent 70%)"></div>
  <div class="seuranta-hero-label">VIIME YÖ · UNI</div>
  <div class="seuranta-hero-main" id="sleep-last">—</div>
  <div class="seuranta-hero-stats">
    <div><div class="seuranta-hero-stat-val" id="sleep-avg">—</div><div class="seuranta-hero-stat-label">viikon ka</div></div>
  </div>
</div>
```

(Poistettu: `hero-sleep-sub` — sisälsi aiemmin "Unipisteet: X", mikä on nyt turha koska pääarvo ITSE on unipisteet. Poistettu myös "Syvä uni" -tilasto kokonaan yhden-tilaston riviksi, koska syvän unen minuutteja ei enää kerätä.)

```js
async function loadSleep() {
  const { data, error } = await sb.from('sleep_data').select('sleep_date,sleep_score')
    .order('sleep_date',{ ascending:false }).limit(7);
  if (error) { console.error('loadSleep failed:', error.message); return; }
  if (data && data[0] && data[0].sleep_score != null)
    document.getElementById('sleep-last').textContent = data[0].sleep_score + 'p';
  if (data && data.length) {
    const withScore = data.filter(d => d.sleep_score != null);
    const avg = withScore.length ? withScore.reduce((s,d)=>s+d.sleep_score,0)/withScore.length : null;
    document.getElementById('sleep-avg').textContent = avg != null ? Math.round(avg) + 'p' : '—';
    document.getElementById('sleep-history').innerHTML = data.map(s => `
      <div class="hist-item">
        <div><div class="hist-label">${s.sleep_date}</div></div>
        <div class="hist-val">${s.sleep_score != null ? s.sleep_score + 'p' : '—'}</div>
      </div>`).join('');
  }
}
```

---

## 5. Koonnin "Uni"-kortti: pelkkä pistemäärä

Nykyinen (index.html:5581-5596) näyttää `"${tunnit}h · ${pisteet}p"` tai fallback-keskiarvon. Koska tunteja ei enää ole, yksinkertaistetaan:

```js
const { data: sleepRows } = await sb.from('sleep_data')
  .select('sleep_score,sleep_date')
  .order('sleep_date', { ascending: false }).limit(7);
const kcUniCard = document.getElementById('kc-uni');
const kcUniSub = document.getElementById('kc-uni-sub');
kcUniSub.classList.remove('skel-sub');
const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
kcUniCard.classList.toggle('koonti-card--done', uniDoneToday);
if (sleepRows && sleepRows[0] && sleepRows[0].sleep_score != null) {
  kcUniSub.textContent = `${sleepRows[0].sleep_score}p`;
} else {
  kcUniSub.textContent = 'Ei kirjauksia vielä';
}
```

---

## 6. Viikkonäytöt: kesto-keskiarvo → piste-keskiarvo

**`getWeekStats()`** (index.html:1920+, syöttää "Tällä viikolla" -kortin "Unen keskiarvo" -rivin): `sleep_data`-kysely vaihtuu `duration_min` → `sleep_score`, ja `avgSleep`-laskenta (rivi ~1934, 1941-1942) käyttää `sleep_score`:a suoraan (ei enää `/60` tuntimuunnosta):

```js
sb.from('sleep_data').select('sleep_score').gte('sleep_date', from).lte('sleep_date', to),
```
```js
const withScore = (sleepData || []).filter(r => r.sleep_score != null);
const avgSleep = withScore.length ? withScore.reduce((s, r) => s + r.sleep_score, 0) / withScore.length : null;
```
"Tällä viikolla" -kortin rivi (`loadWeeklyReportCard`, joka jo käyttää `avgSleep`:ia näyttämiseen) pysyy muuten muuttumattomana paitsi yksikkömerkintä `'h'` → `'p'` ja `.toFixed(1)` → `Math.round(...)` (pisteet ovat kokonaislukuja, ei desimaaleja).

**`loadWeekSummary()`** (index.html:~1880-1918, syöttää `#ws-sleep`-hero-tilaston "uni ka"): sama muutos — `duration_min` → `sleep_score`, `/60`+`'h'` → suora pyöristetty `'p'`.

---

## 7. Huomioiden siivous

**Poistetaan kokonaan** (index.html:2168-2179): kesto-pohjainen "Uni lyhentynyt/pidentynyt X min viime viikolla" -huomio + sen datariippuvuus (`sleepThisVals`/`sleepLastVals`, jotka suodattavat `duration_min != null`). Tämä on tarpeeton, koska olemassa oleva pistepohjainen "Unipisteet laskenut Xp viime viikolla" -huomio (index.html:2201-2207, käyttää jo `calcSleepScore()`:aa) kattaa saman tarkoituksen automaattisesti heti kun `calcSleepScore()` lukee uutta `sleep_score`-kenttää — ei tarvitse kirjoittaa mitään uutta, riittää poistaa vanha.

**Ei muuteta:** "Unipisteet laskenut Xp viime viikolla" -huomio (2201-2207) ja ylikuormitushuomio (2209-2224) — molemmat käyttävät jo `calcSleepScore()`:aa, joten ne toimivat automaattisesti oikein `sleep_score`-datalla heti kun kohdan 2 muutos on tehty. Näiden kyselyt (`sleepThis`/`sleepLast`, rivit 2102-2103) voidaan jättää hakemaan koko rivin (`select('*')` tai nykyiset 4 saraketta) ilman haittaa, koska `calcSleepScore()` yksinkertaisesti lukee `.sleep_score`-kentän riippumatta mitä muuta rivillä on — mutta siistimpää on kaventaa myös nämä kaksi kyselyä pelkkään `sleep_score`:aan, koska muita kenttiä ei enää tarvita mihinkään.

---

## Testaus

Ei automaattitestejä (projektin vakiokäytäntö). Manuaalinen läpikäynti:

1. Uni-sivu → "Kirjaa uni" näyttää vain Päivämäärä + Unipisteet-kentän (ei enää Kesto/Syvä uni/REM/Heräilyt).
2. Syötä pistemäärä (esim. 82) tälle päivälle → tallennus onnistuu, hero päivittyy näyttämään "82p" pääarvona, "viikon ka" päivittyy.
3. Koonti-sivun "Uni"-kortti näyttää saman pistemäärän ("82p"), ei enää tuntimäärää.
4. "Tällä viikolla" -kortin "Unen keskiarvo" näyttää pistekeskiarvon (esim. "78p"), ei tuntimäärää.
5. Syötä useamman päivän pistemäärät niin että viikon keskiarvo laskee ≥10p edellisviikosta → "Unipisteet laskenut Xp viime viikolla" -huomio ilmestyy Koontiin.
6. Vahvista ettei vanha "Uni lyhentynyt/pidentynyt X min" -huomio enää koskaan ilmesty (koodi poistettu).
7. Syötä virheellinen arvo (esim. 150 tai tyhjä) → selkeä validointivirhe, ei tallennu.
8. Vanhat, jo olemassa olevat HealthKit-synkatut rivit (joilla on `duration_min` mutta ei `sleep_score`) → näkyvät historialistassa "—" pistemääränä (koska `sleep_score` on null niille), eivät riko mitään.
