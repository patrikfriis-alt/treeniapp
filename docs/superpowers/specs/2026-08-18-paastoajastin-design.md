# Treeniapp (Valkku) — Paastoajastin (fasting timer)

**Päivämäärä:** 2026-08-18
**Laajuus:** Live-päivittyvä "aika viimeisestä ateriasta" Ruoka-sivun hero-osioon, sekä viikkotason paastoaika-yhteenveto Koonnin "Tällä viikolla" -korttiin (klikattava, avaa päiväkohtaisen erittelyn) — samalla mallilla kuin jo shipatut Viikon kalorit -rivi ja päiväpopupit.
**Riippuvuudet:** Olemassa oleva `food_log_entries`-taulu (`created_at`, `kcal` -sarakkeet jo olemassa, ei muutoksia), olemassa oleva `openMetricModal()`, olemassa oleva `weekRow()`-rakentaja (jo laajennettu valinnaisella `rowOnclick`-parametrilla), olemassa oleva `timer`-ikoni (`ICONS`-objektissa, lisätty lepoajastin-ominaisuudelle).

---

## Tausta

Käyttäjä haluaa nähdä ajan viimeisimmästä "oikeasta" ateriasta (paasto käynnissä) sekä yhteenlasketun paastoajan päivä-/viikkotasolla. "Oikea" ateria tarkoittaa yli 10 kcal:n merkintää — kahvi/tee/vesi eivät katkaise paastoa, koska ne kirjautuvat lähelle 0 kcal:aa Fineli-datassa. **Ei uutta tietomallia** — kaikki lasketaan suoraan olemassa olevasta `food_log_entries`-datasta (`created_at`, `kcal`).

---

## 1. Sääntö: mikä katkaisee paaston

Merkintä katkaisee paaston jos ja vain jos `kcal >= 10`. Kaikki alle tämän (kahvi, tee, vesi, purukumi jne.) jätetään huomiotta paastolaskennassa — eivät nollaa live-ajastinta eivätkä näy erotuslaskennassa.

## 2. Live-ajastin (Ruoka-sivun hero)

Uusi apufunktio, riippumaton valitusta päivästä (paasto on aina "nyt"-tilassa, ei sido tiettyyn kalenteripäivään):

```js
async function getLastRealFoodEntryAt() {
  const { data, error } = await sb.from('food_log_entries')
    .select('created_at')
    .gte('kcal', 10)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) { console.error('getLastRealFoodEntryAt failed:', error.message); return null; }
  return data && data[0] ? new Date(data[0].created_at) : null;
}
```

Uusi rivi Ruoka-heron alle, samalla tyylillä kuin olemassa oleva `food-week-row` (uudelleenkäytetään sen CSS-luokkaa sellaisenaan):

```html
<div class="food-week-row" id="food-fasting-row">
  <span>Paasto</span><span class="food-week-val" id="food-fasting-val">—</span>
</div>
```

Renderöinti + minuutin välein päivittyvä `setInterval` (samaan tapaan kuin `startRestTimer()`, mutta ylöspäin laskeva, ei kiinteää kestoa):

```js
let _fastingInterval = null;
let _lastRealFoodAt = null;

async function loadFastingTimer() {
  _lastRealFoodAt = await getLastRealFoodEntryAt();
  renderFastingTimer();
  if (_fastingInterval) clearInterval(_fastingInterval);
  _fastingInterval = setInterval(renderFastingTimer, 60000);
}

function renderFastingTimer() {
  const el = document.getElementById('food-fasting-val');
  if (!el) return;
  if (!_lastRealFoodAt) { el.textContent = '—'; return; }
  const ms = Date.now() - _lastRealFoodAt.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  el.textContent = `${h}h ${m}min`;
}
```

`loadFastingTimer()` kutsutaan `renderRuoka()`:n yhteydessä (rinnakkain `loadFoodDay()`:n kanssa) — riippumaton siitä minkä päivän merkintöjä käyttäjä selaa nuolilla, koska ajastin kysyy aina uusimman merkinnän koko historiasta, ei valitulta päivältä.

**Nollautuminen uuden aterian myötä:** ei erillistä koukutusta jokaiseen tallennuskohtaan (niitä on useita: hakutulos, ruokakuva, oma tuote) — koska kaikki tallennuspolut jo kutsuvat `renderRuoka()`/`loadFoodDay()`:ia onnistuneen tallennuksen jälkeen (olemassa oleva käytäntö), `loadFastingTimer()` lisätään samaan kutsuketjuun ja hakee automaattisesti tuoreimman datan — ei tarvitse muokata yksittäisiä tallennusfunktioita erikseen.

## 3. Päivä-/viikkokohtainen erotuslaskenta

**Sääntö:** päivän X paastoaika = summa aukoista peräkkäisten "oikeiden" (kcal≥10) merkintöjen välillä, jotka **päättyvät** päivänä X. Ensimmäinen aukko (edellisestä merkinnästä, mahdollisesti edelliseltä päivältä/aiemmin, päivän X ensimmäiseen merkintään) lasketaan kokonaan päivälle X — näin yön yli menevä paasto kohdistuu sille päivälle jolloin se päättyy, ei jää kokonaan laskematta. Päivä jolla on 0-1 merkintää: 0 min (ei väliä laskettavaksi, tai ei vielä syöty — aukko ei ole vielä "päättynyt").

```js
async function computeWeeklyFastingByDay(mondayIso, sundayIso) {
  const lookbackFrom = localIso(addDays(new Date(mondayIso), -14)); // puskuri: löytää viikkoa edeltävän viimeisen aterian
  const { data, error } = await sb.from('food_log_entries')
    .select('created_at')
    .gte('logged_at', lookbackFrom)
    .lte('logged_at', sundayIso)
    .gte('kcal', 10)
    .order('created_at', { ascending: true });
  if (error) { console.error('computeWeeklyFastingByDay failed:', error.message); return {}; }
  const entries = data || [];

  const byDay = {};
  for (let i = 0; i < 7; i++) {
    byDay[localIso(addDays(new Date(mondayIso), i))] = 0;
  }
  for (let i = 1; i < entries.length; i++) {
    const prev = new Date(entries[i - 1].created_at);
    const curr = new Date(entries[i].created_at);
    const endDayIso = localIso(curr);
    if (byDay[endDayIso] !== undefined) {
      byDay[endDayIso] += (curr - prev);
    }
  }
  return byDay; // { 'YYYY-MM-DD': millisekuntia }
}
```

14 päivän lookback-puskuri on riittävä käytännössä (jos käyttäjä ei ole syönyt 14 päivään, paastoaika ei ole sovelluksen suurin ongelma) — ei tarvitse hakea koko historiaa jokaisella Koonti-latauksella.

## 4. Käyttöliittymä — Koonti "Tällä viikolla"

Uusi rivi `loadWeeklyReportCard()`:iin, `timer`-ikonilla (jo olemassa), klikattava samalla `rowOnclick`-mekanismilla kuin Viikon kalorit:

```js
const fastingByDay = await computeWeeklyFastingByDay(mon.iso, sunIso);
const weeklyFastingMs = Object.values(fastingByDay).reduce((s, v) => s + v, 0);
const fastingStr = formatFastingDuration(weeklyFastingMs); // "14h 32min" -tyylinen apufunktio
rows.push(weekRow('timer', 'var(--accent)', 'Paastoaika', fastingStr, '',
  `openFastingBreakdownModal(${JSON.stringify(fastingByDay)})`));
```

**Ei JSON:ia onclick-merkkijonoon** (sisäkkäiset `"`-merkit rikkoisivat HTML-attribuutin) — `fastingByDay` puretaan seitsemäksi erilliseksi pyöristetyksi minuuttiargumentiksi, samaan tapaan kuin `openDayBudgetModal`:n erilliset numeeriset argumentit:

```js
const mondayIso = mon.iso;
const dayMinutes = [];
for (let i = 0; i < 7; i++) {
  dayMinutes.push(Math.round((fastingByDay[localIso(addDays(new Date(mondayIso), i))] || 0) / 60000));
}
rows.push(weekRow('timer', 'var(--accent)', 'Paastoaika', fastingStr, '',
  `openFastingBreakdownModal('${mondayIso}', ${dayMinutes.join(', ')})`));
```

Popup:

```js
function openFastingBreakdownModal(mondayIso, m0, m1, m2, m3, m4, m5, m6) {
  const minutes = [m0, m1, m2, m3, m4, m5, m6];
  const rowsHtml = minutes.map((min, i) => {
    const d = addDays(new Date(mondayIso), i);
    const label = `${DAYS[i]} ${d.getDate()}.${d.getMonth() + 1}.`;
    const h = Math.floor(min / 60), m = min % 60;
    return `<div class="metric-modal-row"><span>${label}</span><span class="val">${h}h ${m}min</span></div>`;
  }).join('');
  openMetricModal('Paastoaika', rowsHtml);
}
```

## 5. Rajaus

- Ei uusia tauluja/sarakkeita.
- Ei kahvin/teen erillistä tunnistusta nimen perusteella — pelkkä kcal-kynnysarvo (10 kcal).
- Ei ilmoituksia/push-viestejä paaston pituudesta.
- Ei tavoiteasetusta (esim. "16:8-tavoite") tässä versiossa — pelkkä mittaus, ei tavoitteenasetus.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Ruoka — tarkista että "Paasto"-rivi näyttää järkevän ajan viimeisimmästä ≥10kcal-merkinnästä.
2. Lisää uusi ruokamerkintä (≥10 kcal) — tarkista että Paasto-rivi nollautuu lähelle "0h 0min".
3. Lisää kahvi/vastaava alle 10 kcal:n merkintä — tarkista ettei Paasto-rivi nollaudu.
4. Avaa Koonti, klikkaa "Paastoaika"-riviä — tarkista että popup näyttää 7 päivän erittelyn ja että summa täsmää rivin omaan viikkolukuun.
5. Tarkista käsin yksi konkreettinen yön yli menevä tapaus (esim. eilinen viimeinen ateria klo 20, tämän päivän ensimmäinen klo 08) — vahvista että koko 12h kohdistuu TÄMÄN päivän lukuun, ei eiliselle.
