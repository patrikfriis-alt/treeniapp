# UX-katselmuksen korjaukset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Korjaa 9 löydöstä aiemmasta käytettävyyskatselmuksesta (3 bugia + 6 kitkakohtaa) — kaikki konkreettisia, tarkasti rajattuja korjauksia joilla on jo tiedossa täsmällinen sijainti ja ratkaisu.

**Architecture:** Kukin tehtävä on itsenäinen, kohdennettu muutos `index.html`:ään — ei uusia tietokantatauluja, ei uusia riippuvuuksia. Tehtävät ovat riippumattomia toisistaan (voidaan tehdä missä tahansa järjestyksessä).

**Tech Stack:** Vanilla JS, CSS, olemassa oleva `escapeHtml()`/`jsAttrEscape()`/`data-icon`-ikonijärjestelmä.

---

### Task 1: Sarjalaskuri ei päivity live kun sarja kirjataan

**Files:**
- Modify: `index.html` (sarjan HTML-render, `updateSetBox()`)

**Konteksti ennen muutosta** — liikkeen edistymislaskuri renderöinnissä:

```html
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="ex-block-progress">
            <div class="ex-block-prog-label">${doneCount}/${ex.s} sarjaa</div>
            <div class="ex-block-prog-bar"><div class="ex-block-prog-fill" style="width:${progPct}%"></div></div>
          </div>
          ${prefillBtn}
        </div>
```

- [ ] **Step 1: Lisää id:t edistymislaskurin elementteihin**

Etsi tarkka konteksti (`grep -n "ex-block-prog-label" index.html`). Korvaa yllä oleva lohko:

```html
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="ex-block-progress">
            <div class="ex-block-prog-label" id="ex-prog-label-${wOff}-${aDay}-${ei}">${doneCount}/${ex.s} sarjaa</div>
            <div class="ex-block-prog-bar"><div class="ex-block-prog-fill" id="ex-prog-fill-${wOff}-${aDay}-${ei}" style="width:${progPct}%"></div></div>
          </div>
          ${prefillBtn}
        </div>
```

**Konteksti ennen muutosta** — `updateSetBox()`-funktion loppu:

```js
  const ormEl = document.getElementById(`set-1rm-${o}-${d}-${e}-${s}`);
  if (ormEl) {
    const orm = calc1RM(parseFloat(sd.kg), parseInt(sd.reps));
    if (orm) {
      ormEl.textContent = `1RM ~${orm}kg`;
      ormEl.classList.add('visible');
    } else {
      ormEl.classList.remove('visible');
    }
  }
}
```

- [ ] **Step 2: Päivitä edistymislaskuri `updateSetBox()`:ssa**

Korvaa yllä oleva lohko:

```js
  const ormEl = document.getElementById(`set-1rm-${o}-${d}-${e}-${s}`);
  if (ormEl) {
    const orm = calc1RM(parseFloat(sd.kg), parseInt(sd.reps));
    if (orm) {
      ormEl.textContent = `1RM ~${orm}kg`;
      ormEl.classList.add('visible');
    } else {
      ormEl.classList.remove('visible');
    }
  }

  const exTarget = sess && sess.ex && sess.ex[e];
  if (exTarget) {
    const doneCount = (ed.sets || []).filter(row => {
      const rd = row || {};
      return (parseFloat(rd.kg) || null) !== null || (parseInt(rd.reps) || null) !== null;
    }).length;
    const progPct = exTarget.s > 0 ? Math.round(doneCount / exTarget.s * 100) : 0;
    const labelEl = document.getElementById(`ex-prog-label-${o}-${d}-${e}`);
    const fillEl  = document.getElementById(`ex-prog-fill-${o}-${d}-${e}`);
    if (labelEl) labelEl.textContent = `${doneCount}/${exTarget.s} sarjaa`;
    if (fillEl)  fillEl.style.width  = `${progPct}%`;
  }
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Käynnistä paikallinen palvelin, aloita treeni Sali-sivulla, kirjaa yhden sarjan kg+toistot. Tarkista liikkeen otsikon "X/3 sarjaa" -laskuri ja edistymispalkki päivittyvät VÄLITTÖMÄSTI (ei vaadi sivun uudelleenlatausta tai päivän vaihtoa).

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "fix: korjaa sarjalaskurin live-päivitys sarjaa kirjatessa"
```

---

### Task 2: Session poisto ei kysy vahvistusta

**Files:**
- Modify: `index.html` (`renderSessionExpand()`)

**Konteksti ennen muutosta:**

```html
    <button class="sess-delete-btn" onclick="deleteProgramSession('${s.id}')">Poista sessio</button>
```

- [ ] **Step 1: Lisää vahvistuskysely poisto-painikkeeseen**

Korvaa yllä oleva rivi:

```html
    <button class="sess-delete-btn" onclick="if (confirm('Poistetaanko sessio pysyvästi? Kaikki sen liikkeet poistuvat mukana.')) deleteProgramSession('${s.id}')">Poista sessio</button>
```

- [ ] **Step 2: Testaa manuaalisesti**

Avaa Ohjelma-sivu, laajenna jokin sessio, klikkaa "Poista sessio". Tarkista selaimen natiivi vahvistusdialogi avautuu tekstillä. Klikkaa "Peruuta"/"Cancel" — tarkista sessio EI poistu. Testaa uudelleen ja hyväksy dialogi jollain aidosti poistettavaksi tarkoitetulla testisessiolla (älä poista käyttäjän oikeaa harjoitusohjelmaa) — tarkista poisto toimii kuten ennenkin.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: lisää vahvistuskysely session poistoon"
```

---

### Task 3: Koonti-sivun Ruokailu-rivi puuttuu SVG-ikonisetistä

**Files:**
- Modify: `index.html` (Koonti-sivun Ruokailu-kortti)

**Konteksti ennen muutosta:**

```html
        <div class="koonti-card-label">🍽️ Ruokailu</div>
```

- [ ] **Step 1: Korvaa emoji SVG-ikonilla**

Korvaa yllä oleva rivi:

```html
        <div class="koonti-card-label"><span data-icon="utensils" style="display:inline-flex;vertical-align:-3px;margin-right:6px"></span>Ruokailu</div>
```

- [ ] **Step 2: Testaa manuaalisesti**

Lataa Koonti-sivu, tarkista "Ruokailu"-rivi näyttää saman viivapiirretyn haarukka/veitsi-ikonin kuin alanavigaation Ruoka-välilehti (ei enää 🍽️-emojia), ja ikoni asettuu siististi tekstin viereen (ei limity tai näytä rikkinäiseltä).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: korvaa Ruokailu-kortin emoji SVG-ikonilla"
```

---

### Task 4: "Päivän tyyppi" -pillit typistävät nimet

**Files:**
- Modify: `index.html` (`.sess-btn`-CSS)

**Konteksti ennen muutosta** — huomaa että `.sess-btn`-luokka on määritelty CSS:ssä KAHDESTI (rivit ~354 ja ~617); jälkimmäinen (Session components -osiossa) on se joka lopulta pätee selaimessa CSS-kaskadin takia, koska se tulee lähdekoodissa myöhemmin samalla spesifisyydellä. Muokataan vain jälkimmäistä:

```css
.sess-btn { font-size:11px; font-weight:400; padding:7px 3px; flex:1; min-width:64px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text2); cursor:pointer; white-space:nowrap; }
```

- [ ] **Step 1: Poista white-space:nowrap, salli tekstin rivittyä**

Etsi tarkka rivi (`grep -n "Session components" index.html` löytää kommentin juuri ennen tätä sääntöä). Korvaa:

```css
.sess-btn { font-size:11px; font-weight:400; padding:7px 3px; flex:1; min-width:64px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text2); cursor:pointer; white-space:nowrap; }
```

tällä (poistettu `white-space:nowrap;`):

```css
.sess-btn { font-size:11px; font-weight:400; padding:7px 3px; flex:1; min-width:64px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text2); cursor:pointer; }
```

- [ ] **Step 2: Testaa manuaalisesti**

Avaa Sali-sivu, tarkista "Päivän tyyppi" -pillirivi ("Treeni 1 — Työntävät", "Treeni 2 — Vetävät" jne.) — jokaisen pillin koko teksti on nyt luettavissa (rivittyy tarvittaessa kahdelle riville pillin sisällä), eikä mikään nimi enää typisty eikä vaadi vaakavieritystä nähdäkseen kokonaan.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: salli Päivän tyyppi -pillien tekstin rivittyä ettei se typisty"
```

---

### Task 5: Keho/Uni-lomakkeiden placeholder-luvut näyttävät todellisilta arvoilta

**Files:**
- Modify: `index.html` (Keho- ja Uni-lomakkeiden input-kentät)

**Konteksti ennen muutosta:**

```html
      <div class="form-row"><label>Paino (kg)</label><input type="text" inputmode="decimal" id="body-weight" placeholder="114,8"></div>
      <div class="form-row"><label>Rasva%</label><input type="text" inputmode="decimal" id="body-fat" placeholder="37,7"></div>
      <div class="form-row"><label>Lihas%</label><input type="text" inputmode="decimal" id="body-muscle" placeholder="29,3"></div>
```

- [ ] **Step 1: Lisää "esim. " -etuliite Keho-lomakkeen placeholdereihin**

Korvaa yllä oleva lohko:

```html
      <div class="form-row"><label>Paino (kg)</label><input type="text" inputmode="decimal" id="body-weight" placeholder="esim. 114,8"></div>
      <div class="form-row"><label>Rasva%</label><input type="text" inputmode="decimal" id="body-fat" placeholder="esim. 37,7"></div>
      <div class="form-row"><label>Lihas%</label><input type="text" inputmode="decimal" id="body-muscle" placeholder="esim. 29,3"></div>
```

**Konteksti ennen muutosta:**

```html
      <div class="form-row"><label>Kesto (min)</label><input type="text" inputmode="numeric" id="sleep-dur" placeholder="450"></div>
      <div class="form-row"><label>Syvä uni (min)</label><input type="text" inputmode="numeric" id="sleep-deep" placeholder="90"></div>
      <div class="form-row"><label>REM (min)</label><input type="text" inputmode="numeric" id="sleep-rem" placeholder="100"></div>
      <div class="form-row"><label>Heräilyt</label><input type="text" inputmode="numeric" id="sleep-awk" placeholder="2"></div>
```

- [ ] **Step 2: Lisää "esim. " -etuliite Uni-lomakkeen placeholdereihin**

Korvaa yllä oleva lohko:

```html
      <div class="form-row"><label>Kesto (min)</label><input type="text" inputmode="numeric" id="sleep-dur" placeholder="esim. 450"></div>
      <div class="form-row"><label>Syvä uni (min)</label><input type="text" inputmode="numeric" id="sleep-deep" placeholder="esim. 90"></div>
      <div class="form-row"><label>REM (min)</label><input type="text" inputmode="numeric" id="sleep-rem" placeholder="esim. 100"></div>
      <div class="form-row"><label>Heräilyt</label><input type="text" inputmode="numeric" id="sleep-awk" placeholder="esim. 2"></div>
```

- [ ] **Step 3: Testaa manuaalisesti**

Avaa Keho-sivu ja Uni-sivu, tarkista kaikkien 7 kentän harmaa placeholder-teksti alkaa nyt "esim. " -sanalla, mikä tekee selväksi ettei kyseessä ole todellinen edellinen mittaus vaan pelkkä esimerkkiarvo.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "fix: merkitse Keho/Uni-lomakkeiden placeholder-luvut esimerkeiksi"
```

---

### Task 6: Ruoan määrän syöttövaihe ei näytä laskettuja kaloreita/makroja

**Files:**
- Modify: `index.html` (ruokahaun määrä-vaihe: HTML + `goToAmountStep()`/`setFoodAmount()` + uusi funktio)

**Konteksti ennen muutosta** — määrä-vaiheen HTML:

```html
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100"></div>
      <div class="food-amount-presets">
```

- [ ] **Step 1: Lisää esikatselu-elementti ja oninput-kutsu**

Korvaa yllä oleva lohko:

```html
      <div class="food-amount-name" id="food-amount-name">—</div>
      <div class="form-row"><label>Määrä (g)</label><input type="number" id="food-amount-grams" value="100" oninput="updateFoodAmountPreview()"></div>
      <div id="food-amount-preview" style="font-size:13px;color:var(--text2);margin:-4px 0 10px;"></div>
      <div class="food-amount-presets">
```

**Konteksti ennen muutosta** — `goToAmountStep()` ja `setFoodAmount()`:

```js
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'block';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
}

function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
}
```

- [ ] **Step 2: Lisää updateFoodAmountPreview()-funktio ja kutsut**

Korvaa yllä oleva lohko:

```js
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'block';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
  updateFoodAmountPreview();
}

function setFoodAmount(g) {
  document.getElementById('food-amount-grams').value = g;
  updateFoodAmountPreview();
}

function updateFoodAmountPreview() {
  const el = document.getElementById('food-amount-preview');
  if (!el || !foodModalSelected) return;
  const grams = parseFloat(document.getElementById('food-amount-grams').value) || 0;
  const kcal    = Math.round(foodModalSelected.kcalPer100g * grams / 100);
  const protein = Math.round(foodModalSelected.proteinPer100g * grams / 100 * 10) / 10;
  const carbs   = Math.round(foodModalSelected.carbsPer100g * grams / 100 * 10) / 10;
  const fat     = Math.round(foodModalSelected.fatPer100g * grams / 100 * 10) / 10;
  el.textContent = `${kcal} kcal · ${protein}g proteiini · ${carbs}g hiilarit · ${fat}g rasva`;
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Ruoka-sivulla lisää jokin ruoka (esim. hae "kana" ja valitse tulos). Määrä-vaiheessa tarkista esikatselurivi näyttää heti lasketut kcal/proteiini/hiilarit/rasva-arvot 100 g:lle. Vaihda määrä 200 g:aan (joko kirjoittamalla tai pikapainikkeesta) — tarkista luvut päivittyvät välittömästi kaksinkertaisiksi. Tarkista laskenta täsmää käsin laskien (arvo × grammat / 100).

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: näytä laskettu kcal/makroennuste ruoan määrän syötössä"
```

---

### Task 7: Ruokahaun määrä-näkymä käyttää tilaa huonosti

**Files:**
- Modify: `index.html` (uusi CSS-luokka, `goToAmountStep()`)

**Konteksti ennen muutosta:**

```html
    <div id="food-search-step-amount" style="display:none">
```

- [ ] **Step 1: Lisää keskitys-luokka määrä-vaiheelle**

Korvaa yllä oleva rivi:

```html
    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
```

**Konteksti ennen muutosta** — CSS, etsi `.food-search-custom-link`-säännön läheltä (`grep -n "food-search-custom-link" index.html`):

```css
.food-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; }
```

- [ ] **Step 2: Lisää .food-amount-centered-sääntö**

Korvaa yllä oleva rivi:

```css
.food-search-custom-link { color: var(--green); font-size:13px; cursor:pointer; }
.food-amount-centered { flex-direction: column; justify-content: center; min-height: 50vh; }
```

**Konteksti ennen muutosta** — `goToAmountStep()` (Task 6:n jälkeen tämä sisältää jo `updateFoodAmountPreview();`-kutsun):

```js
  document.getElementById('food-search-step-amount').style.display = 'block';
```

- [ ] **Step 3: Vaihda display-arvo block → flex**

Korvaa yllä oleva rivi:

```js
  document.getElementById('food-search-step-amount').style.display = 'flex';
```

- [ ] **Step 4: Testaa manuaalisesti**

Lisää ruokaa Ruoka-sivulta. Määrä-vaihe (nimi, määräkenttä, esikatselu, pikapainikkeet, Lisää-nappi) näkyy nyt pystysuunnassa keskitettynä näytöllä, ei enää ahdettuna pelkästään yläreunaan tyhjän tilan jäädessä alle. Tarkista myös ettei tämä muuta hakutulosten listanäkymää (`#food-search-step-list`) tai oman tuotteen lisäysnäkymää (`#food-search-step-custom`) — niiden pitää edelleen näkyä normaalisti ylhäältä alkaen, ei keskitettyinä.

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "fix: keskitä ruoan määrän syöttövaihe pystysuunnassa"
```

---

### Task 8: Ohjelma-sivulla ei ole otsikkoa eikä takaisin-nuolta

**Files:**
- Modify: `index.html` (`#page-ohjelma`)

**Konteksti ennen muutosta:**

```html
<div id="page-ohjelma" class="page">
  <div id="ohjelma-content"></div>
</div>
```

- [ ] **Step 1: Lisää page-header-lohko**

Korvaa yllä oleva lohko:

```html
<div id="page-ohjelma" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Ohjelma</span>
  </div>
  <div id="ohjelma-content"></div>
</div>
```

- [ ] **Step 2: Testaa manuaalisesti**

Avaa Ohjelma-sivu sivupalkin linkistä. Tarkista sivun yläreunassa näkyy nyt "‹ Ohjelma" -otsikkorivi samassa tyylissä kuin Keho-/Uni-sivuilla. Klikkaa "‹"-nuolta, tarkista se palauttaa Koonti-sivulle.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: lisää otsikko ja takaisin-nuoli Ohjelma-sivulle"
```

---

### Task 9: Kehitys-välilehden Salilokit-rivit eivät ole klikattavissa

**Files:**
- Modify: `index.html` (`loadWorkoutHistory()`)

**Konteksti ennen muutosta:**

```js
  el.innerHTML = Object.entries(byDate).map(([date, exMap]) => `
    <div class="hist-day">
      <div class="hist-day-header">${date}</div>
      ${Object.entries(exMap).map(([exName, sets]) => `
        <div class="hist-item hist-item-indent">
          <div class="hist-label">${escapeHtml(exName)}</div>
          <div style="font-size:12px;color:var(--text3)">${sets.sort((a,b)=>a.set_number-b.set_number).map(s=>`${s.weight_kg||'?'}×${s.reps||'?'}`).join(' | ')}</div>
        </div>`).join('')}
    </div>`).join('');
}
```

- [ ] **Step 1: Tee liikkeen nimi klikattavaksi**

Korvaa yllä oleva lohko:

```js
  el.innerHTML = Object.entries(byDate).map(([date, exMap]) => `
    <div class="hist-day">
      <div class="hist-day-header">${date}</div>
      ${Object.entries(exMap).map(([exName, sets]) => `
        <div class="hist-item hist-item-indent">
          <div class="hist-label" data-ex="${exName.replace(/"/g,'&quot;')}" onclick="openExerciseModal(this.dataset.ex)" style="cursor:pointer">${escapeHtml(exName)}</div>
          <div style="font-size:12px;color:var(--text3)">${sets.sort((a,b)=>a.set_number-b.set_number).map(s=>`${s.weight_kg||'?'}×${s.reps||'?'}`).join(' | ')}</div>
        </div>`).join('')}
    </div>`).join('');
}
```

- [ ] **Step 2: Testaa manuaalisesti**

Avaa Sali-sivun Kehitys-välilehti, varmista "Salilokit"-osiossa näkyy lokimerkintöjä. Klikkaa jonkin liikkeen nimeä — tarkista sama liikehistoria/graafi-modaali avautuu kuin Treeni-välilehdellä liikkeen nimeä klikatessa.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: tee Kehitys-välilehden liikkeiden nimet klikattaviksi"
```

---

### Task 10: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko planin läpikäynti**

Käy läpi kaikki 9 korjausta kertaalleen samassa selainistunnossa varmistaaksesi ettei mikään yksittäinen korjaus riko toista: sarjan kirjaus + laskuri (Task 1), session poisto + vahvistus (Task 2), Koonti-sivun Ruokailu-ikoni (Task 3), Sali-sivun Päivän tyyppi -pillit (Task 4), Keho/Uni-lomakkeet (Task 5), ruoan lisäys määrä-esikatselulla ja keskitetyllä näkymällä (Task 6+7 — testaa yhdessä koska molemmat koskettavat samaa näkymää), Ohjelma-sivun otsikko (Task 8), Kehitys-välilehden klikattavat rivit (Task 9). Tarkista konsoli ei näytä virheitä missään vaiheessa.

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.17.0` arvoon `v1.18.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.18.0: UX-katselmuksen korjaukset"
```

---

## Self-Review Notes

- **Kattavuus:** Kaikki 9 aiemmin hyväksyttyä löydöstä (3 bugia + 6 kitkakohtaa) on katettu Task 1–9:ssä, kukin omana itsenäisenä, testattavana muutoksenaan.
- **Rajaus:** Kaksi jäljelle jäävää audit-ehdotusta ("kesken"-tilan laajennus muihin Koonti-kortteihin, terveyslaite-integraatio) EIVÄT sisälly tähän planiin — ne ovat avoimempia tuoteideoita jotka vaativat oman lyhyen brainstorming-kierroksen ennen kuin niistä voi kirjoittaa täsmällisen planin. Ei placeholder-tehtävää näille, koska ne eivät ole vielä riittävän tarkkaan määriteltyjä toteutettaviksi.
- **Riippumattomuus:** Tehtävät 1–9 eivät riipu toisistaan (eri koodialueet), paitsi Task 7 joka rakentuu Task 6:n `goToAmountStep()`-muutoksen päälle (molemmat koskettavat samaa funktiota) — jos toteutusjärjestystä muutetaan, Task 7 kannattaa tehdä Task 6:n jälkeen.
- **Ei placeholdereita:** kaikki koodilohkot täydellisiä, ei TBD/TODO-merkintöjä.
- **Versionumero:** edellisen sub-projektin (Kalorivaje) päätteeksi versio oli v1.17.0, joten tämä nostaa sen v1.18.0:aan.
