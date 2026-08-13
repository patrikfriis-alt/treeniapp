# Treeniapp (Valkku) — Viikon kalorit -popup + päiväpopupin korjaukset

**Päivämäärä:** 2026-08-13
**Laajuus:** Kolme pientä, toisiinsa liittyvää muutosta samaan "Tällä viikolla" -kortin "Viikon kalorit" -riviin: (1) päiväpopupin ("Erotus") laskenta korjataan huomioimaan liikunta, (2) "Oma osuus" nimetään uudelleen "Tavoite", rivijärjestys muutetaan, (3) itse "Viikon kalorit" -rivi tehdään klikattavaksi, avaten viikkotason vastineen olemassa olevasta "Päivän kalorit" -erittelymodaalista.
**Riippuvuudet:** Olemassa oleva `openDayBudgetModal()` (index.html:5307-5322, shipattu tänään), olemassa oleva `openDeficitBreakdownModal()` (index.html:6061-6105, käytetään suorana mallina viikkoversiolle), olemassa oleva `openMetricModal()`, olemassa oleva `weekRow()`-rakentaja `loadWeeklyReportCard()`:ssa (index.html:2088-2095).

---

## Tausta

Käyttäjä huomasi kaksi ongelmaa juuri shipatussa päiväpopupissa:

1. **"Liikunta +369 kcal" näytettiin muttei laskettu mukaan "Erotus"-loppusummaan** — visuaalisesti "+"-merkki antaa vaikutelman että se summautuu, samaan tapaan kuin olemassa olevassa `openDeficitBreakdownModal()`:ssa rivit oikeasti summautuvat. Todettiin matemaattisesti: jos jokaisen päivän `(eaten - fairShare - exercise)` lasketaan yhteen koko viikolta, summa täsmää tarkalleen `-remaining`:iin (viikon jäljellä olevaan budjettiin) — eli korjaus tekee päivätason luvuista aidosti yhteensopivia viikkotason lukujen kanssa, ei vain kosmeettinen korjaus.
2. **"Oma osuus" oli harhaanjohtava nimi** — käyttäjä epäili sen tarkoittavan lepoaineenvaihduntaa (BMR), mutta se on itse asiassa `BMR - viikkotavoitteen päiväosuus` (esim. BMR 1939 kcal → "Oma osuus" 688 kcal — ei lähelläkään BMR:ää). Oikea nimi on "Tavoite" (päivän syöntitavoite, ei lepoaineenvaihdunta).

Samalla käyttäjä pyysi uutta ominaisuutta: koko "Viikon kalorit" -rivin klikkaus avaisi vastaavan erittelyn kuin päiväkohtainen popup, mutta koko viikon tasolla — tälle on jo olemassa suora malli sovelluksessa (`openDeficitBreakdownModal`, käytössä "Päivän kalorit" -hero-kortissa), joten viikkoversio toteutetaan samalla rakenteella/sanamuodolla.

---

## 1. Päiväpopupin korjaukset (`openDayBudgetModal`)

**Rivijärjestys ja nimeäminen muuttuu:**

```js
function openDayBudgetModal(iso, eaten, fairShare, exKcal) {
  const dateObj = new Date(iso);
  const title = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const diff = eaten - fairShare - exKcal;
  const sign = diff >= 0 ? '+' : '';
  const exRow = exKcal > 0
    ? `<div class="metric-modal-row"><span>Liikunta</span><span class="val">+${exKcal} kcal</span></div>`
    : '';
  const body = `
    <div class="metric-modal-row"><span>Tavoite</span><span class="val">${fairShare} kcal</span></div>
    <div class="metric-modal-row"><span>Syöty</span><span class="val">${eaten} kcal</span></div>
    ${exRow}
    <div class="metric-modal-total"><span>Erotus</span><span>${sign}${diff} kcal</span></div>
  `;
  openMetricModal(title, body);
}
```

Muutokset edelliseen: (a) `diff`-kaavaan lisätty `- exKcal`, (b) rivijärjestys Tavoite → Syöty → (Liikunta) → Erotus, (c) "Oma osuus" → "Tavoite".

**Tiedostettu sivuvaikutus:** päiväruudun väri (vihreä/punainen) ei ota liikuntaa huomioon (tarkoituksella, ettei myöhempi viikon liikuntakirjaus värjää menneitä päiviä uudelleen). Tämän korjauksen jälkeen on siis mahdollista että punainen ruutu avaa popupin jossa "Erotus" on negatiivinen (esim. iso liikuntasuoritus kompensoi ylisyönnin) — tämä on hyväksytty, ei korjata: ruutu on nopea viikkotason indikaattori, popup antaa tarkemman kuvan samalta päivältä.

---

## 2. Viikon kalorit -rivi klikattavaksi

**Klikkausalue:** vain `.kc-weekly-row-top` (otsikko+arvo-rivi), ei koko `.kc-weekly-row`-korttia — näin klikkaus ei ole ristiriidassa päiväruutujen omien klikkausten kanssa jotka sijaitsevat samassa kortissa mutta eri sisarelementissä (`daystripHtml`).

`weekRow()`-rakentajaan lisätään valinnainen 6. parametri:

```js
const weekRow = (icon, iconColor, label, valHtml, barHtml, rowOnclick) => `
    <div class="kc-weekly-row">
      <div class="kc-weekly-row-top"${rowOnclick ? ` onclick="${rowOnclick}" style="cursor:pointer;"` : ''}>
        <div class="kc-weekly-row-label"><span class="kc-weekly-row-icon" data-icon="${icon}" data-icon-color="${iconColor}"></span>${label}</div>
        <div class="kc-weekly-row-val">${valHtml}</div>
      </div>
      ${barHtml || ''}
    </div>`;
```

Muut 5 kutsua (`weekRow('dumbbell', ...)` jne.) jättävät 6. parametrin pois — käyttäytyvät ennallaan.

"Viikon kalorit" -kutsu saa `rowOnclick`-argumentin (kaikki tarvittava data on jo laskettu tässä funktion scopessa, ei uusia kyselyitä):

```js
rows.push(weekRow('flame', 'var(--amber)', 'Viikon kalorit', weeklyValStr, barHtml + subHtml + daystripHtml,
  `openWeeklyCaloriesModal(${Math.round(foodKcal)}, ${Math.round(bmrInfo.bmr * 7)}, ${Math.round(exerciseKcal)})`));
```

**Uusi funktio, suoraan `openDeficitBreakdownModal()`:n mallilla mutta viikkotasolla (ei omaa 7-palkkikaaviota — se on jo olemassa erikseen `openDeficitBreakdownModal`:ssa päivätasolla):**

```js
function openWeeklyCaloriesModal(foodKcal, bmrWeekly, exerciseKcal) {
  const net = foodKcal - bmrWeekly - exerciseKcal;
  const sign = net >= 0 ? '+' : '';
  const label = net < 0 ? 'nettovaje' : (net > 0 ? 'nettoylijäämä' : 'tasan');
  const body = `
    <div class="metric-modal-row"><span>BMR (viikko)</span><span class="val">${bmrWeekly} kcal</span></div>
    <div class="metric-modal-row"><span>+ Liikunta</span><span class="val">+${exerciseKcal} kcal</span></div>
    <div class="metric-modal-row"><span>− Syöty ruoka</span><span class="val">−${foodKcal} kcal</span></div>
    <div class="metric-modal-total"><span>Viikko (${label})</span><span>${sign}${net} kcal</span></div>
  `;
  openMetricModal('Viikon kalorit', body);
}
```

---

## 3. Rajaus

- Ei kosketa `openDeficitBreakdownModal()`:ia itseään (päivätason hero-popup) — pysyy ennallaan, eri näkymä.
- Ei uutta 7-palkkikaaviota viikkopopupiin (se olisi outo — viikkopopup näyttää yhden viikon summan, ei useamman viikon trendiä).
- Ei muuteta päiväruutujen väritystä (`under`/`over`-luokat) — vain popupin sisältöä.
- Ei uusia Supabase-kyselyitä missään kohtaa — kaikki data on jo laskettu `loadWeeklyReportCard()`:n scopessa.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Klikkaa päiväruutua jolla on liikuntaa — tarkista rivijärjestys (Tavoite, Syöty, Liikunta, Erotus) ja että Erotus = Syöty − Tavoite − Liikunta.
2. Klikkaa "Viikon kalorit" -rivin otsikko/arvo-aluetta — tarkista että viikkopopup avautuu oikealla BMR/Liikunta/Syöty/Total-erittelyllä.
3. Klikkaa saman kortin päiväruutua (ei rivin otsikkoa) — tarkista että VAIN päiväpopup avautuu, ei molemmat.
4. Tarkista Total-rivin sanamuoto (nettovaje/nettoylijäämä/tasan) vastaa etumerkkiä oikein.
