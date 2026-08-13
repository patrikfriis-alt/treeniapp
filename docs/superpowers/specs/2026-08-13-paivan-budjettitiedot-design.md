# Treeniapp (Valkku) — Päivän budjettitiedot (klikattava päiväruutu)

**Päivämäärä:** 2026-08-13
**Laajuus:** Viikkobudjetin päiväruudut (`.kc-week-day`, index.html:2141-2153, "Tällä viikolla" -kortin "Viikon kalorit" -rivillä) muuttuvat klikattaviksi menneiden/tämän päivän osalta — avaa popupin jossa kyseisen päivän syöty/oma osuus/liikunta/erotus. Tulevat (harmaat) päivät pysyvät klikkaamattomina.
**Riippuvuudet:** Olemassa oleva `openMetricModal(title, bodyHtml)` -apufunktio (index.html:5290), olemassa olevat `.metric-modal-row`/`.metric-modal-total`-CSS-luokat, olemassa oleva `foodByDate`/`exByDate`/`fairShareDaily`-data joka on jo laskettu `loadWeeklyReportCard()`:ssa viikkobudjettia varten (ei uusia kyselyitä).

---

## Tausta

Viikkobudjetti (shipattu tänään) näyttää 7 päiväruutua (vihreä/punainen/harmaa) mutta ei kerro mitään yksittäisestä päivästä klikkaamalla. Käyttäjä haluaa nähdä päivän tarkemmat luvut popupissa.

---

## 1. Datan välitys

`dayCells`-silmukka (index.html:2141-2153) rakentaa jo `iso`, `foodByDate[iso]` ja `fairShareDaily` jokaiselle päivälle — lisätään sama `exByDate[iso]` mukaan ja upotetaan kaikki neljä arvoa suoraan `onclick`-attribuuttiin (sama malli jota muuallakin sovelluksessa käytetään, esim. `onclick="toggleSessionWeekday('${s.id}',${i})"`) — ei erillistä hakua eikä globaalia välimuistia tarvita.

```js
const dayCells = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(mon.date);
  d.setDate(mon.date.getDate() + i);
  const iso = localIso(d);
  let cls = '';
  let onclickAttr = '';
  if (iso <= todayIso) {
    const eaten = foodByDate[iso] || 0;
    const exKcal = exByDate[iso] || 0;
    cls = eaten <= fairShareDaily ? ' under' : ' over';
    onclickAttr = ` onclick="openDayBudgetModal('${iso}', ${Math.round(eaten)}, ${Math.round(fairShareDaily)}, ${Math.round(exKcal)})"`;
  }
  dayCells.push(`<div class="kc-week-day${cls}"${onclickAttr}>${DAYS[i][0]}</div>`);
}
```

## 2. Popup

```js
function openDayBudgetModal(iso, eaten, fairShare, exKcal) {
  const dateObj = new Date(iso);
  const title = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const diff = eaten - fairShare;
  const sign = diff >= 0 ? '+' : '';
  const exRow = exKcal > 0
    ? `<div class="metric-modal-row"><span>Liikunta</span><span class="val">+${exKcal} kcal</span></div>`
    : '';
  const body = `
    <div class="metric-modal-row"><span>Syöty</span><span class="val">${eaten} kcal</span></div>
    <div class="metric-modal-row"><span>Oma osuus</span><span class="val">${fairShare} kcal</span></div>
    ${exRow}
    <div class="metric-modal-total"><span>Erotus</span><span>${sign}${diff} kcal</span></div>
  `;
  openMetricModal(title, body);
}
```

## 3. CSS

Klikattavuuden visuaalinen vihje vain niille ruuduille joilla on `onclick` (eli `.under`/`.over` — tulevat päivät ovat aina luokattomia):

```css
.kc-week-day.under, .kc-week-day.over { cursor: pointer; }
```

---

## 4. Rajaus

- Tulevat (harmaat, luokattomat) päiväruudut pysyvät klikkaamattomina — ei `onclick`-attribuuttia, ei `cursor:pointer`.
- Ei ruokalistausta popupissa — vain luvut (syöty/oma osuus/liikunta/erotus), ei erillistä kyselyä `food_log_entries`-tauluun.
- Ei muutoksia `openMetricModal()`-apufunktioon itseensä — käytetään sellaisenaan.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Koonti, "Tällä viikolla" -kortti — klikkaa mennyttä/tämän päivän ruutua, tarkista että popup avautuu oikealla päivämäärällä ja luvuilla (vertaa `foodByDate`/`fairShareDaily`-arvoihin konsolissa).
2. Klikkaa tulevaa (harmaata) ruutua — tarkista ettei mitään tapahdu.
3. Tarkista että popupin "Erotus"-rivi näyttää oikean etumerkin (plus jos yli oman osuuden, muuten ilman merkkiä tai negatiivisena).
