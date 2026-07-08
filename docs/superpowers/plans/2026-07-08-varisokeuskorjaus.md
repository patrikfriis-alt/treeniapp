# Värisokeuskorjaus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lisää ikoni (▼/●/▲) Sali-sivun sarjataulukon rivien vertailutilan (`worse`/`same`/`better`) viereen, jotta tila ei riipu pelkästä väristä — värisokealle käyttäjälle helpompi erottaa tilat toisistaan.

**Architecture:** Yksi rivinlisäys `renderTreeni()`-funktioon (index.html): status-merkkijonolle ("worse"/"same"/"better") vastaava ikoni lisätään olemassa olevan `prevStr`-tekstin eteen `.set-tprev`-spanissa. Ei uusia CSS-luokkia, ei uutta dataa, ei muutoksia `setStatus()`-logiikkaan.

**Tech Stack:** Vanilla JS, ei build-stepiä (yksi `index.html`-tiedosto).

---

### Task 1: Ikoni sarjarivin vertailutilan viereen

**Files:**
- Modify: `index.html:1936-1956` (`renderTreeni()`, sarjarivin HTML-generointi)

**Konteksti ennen muutosta** (`index.html:1936-1956`):

```js
    for (let s = 0; s < ex.s; s++) {
      const sd = (ed.sets && ed.sets[s]) || {};
      const prevSet = getPrevSet(ex.n, s);
      const status  = setStatus(sd, prevSet);
      const prevStr = prevSet ? `${prevSet.weight_kg ?? '?'}×${prevSet.reps ?? '?'}` : '—';

      const orm = calc1RM(parseFloat(sd.kg), parseInt(sd.reps));
      html += `<div class="set-table-row s-${status}" id="set-${wOff}-${aDay}-${ei}-${s}">
        <span class="set-tnum">${s + 1}</span>
        <input class="set-tinput" type="text" inputmode="decimal" placeholder="kg"
          value="${sd.kg || ''}" ${locked ? 'disabled' : ''}
          onchange="saveSet(${wOff},${aDay},${ei},${s},'kg',this.value.replace(',','.'))">
        <input class="set-tinput" type="text" inputmode="numeric" placeholder="tr"
          value="${sd.reps || ''}" ${locked ? 'disabled' : ''}
          onchange="saveSet(${wOff},${aDay},${ei},${s},'reps',this.value)">
        <span class="set-tprev">
          <span>${prevStr}</span>
          <span class="set-1rm${orm ? ' visible' : ''}" id="set-1rm-${wOff}-${aDay}-${ei}-${s}">${orm ? `1RM ~${orm}kg` : ''}</span>
        </span>
      </div>`;
    }
```

- [ ] **Step 1: Lisää `statusIcon`-muuttuja ja käytä sitä `prevStr`:n edessä**

Korvaa yllä oleva lohko tällä (kaksi muutosta: uusi `statusIcon`-rivi `prevStr`-rivin jälkeen, ja `<span>${prevStr}</span>` muuttuu muotoon `<span>${statusIcon}${prevStr}</span>`):

```js
    for (let s = 0; s < ex.s; s++) {
      const sd = (ed.sets && ed.sets[s]) || {};
      const prevSet = getPrevSet(ex.n, s);
      const status  = setStatus(sd, prevSet);
      const prevStr = prevSet ? `${prevSet.weight_kg ?? '?'}×${prevSet.reps ?? '?'}` : '—';
      const statusIcon = { worse: '▼ ', same: '● ', better: '▲ ' }[status] || '';

      const orm = calc1RM(parseFloat(sd.kg), parseInt(sd.reps));
      html += `<div class="set-table-row s-${status}" id="set-${wOff}-${aDay}-${ei}-${s}">
        <span class="set-tnum">${s + 1}</span>
        <input class="set-tinput" type="text" inputmode="decimal" placeholder="kg"
          value="${sd.kg || ''}" ${locked ? 'disabled' : ''}
          onchange="saveSet(${wOff},${aDay},${ei},${s},'kg',this.value.replace(',','.'))">
        <input class="set-tinput" type="text" inputmode="numeric" placeholder="tr"
          value="${sd.reps || ''}" ${locked ? 'disabled' : ''}
          onchange="saveSet(${wOff},${aDay},${ei},${s},'reps',this.value)">
        <span class="set-tprev">
          <span>${statusIcon}${prevStr}</span>
          <span class="set-1rm${orm ? ' visible' : ''}" id="set-1rm-${wOff}-${aDay}-${ei}-${s}">${orm ? `1RM ~${orm}kg` : ''}</span>
        </span>
      </div>`;
    }
```

Huom: `status` on aina yksi arvoista `'undone'`, `'worse'`, `'same'`, `'better'` (`setStatus()`:n paluuarvot, index.html:1530-1547). `{ worse: '▼ ', same: '● ', better: '▲ ' }[status] || ''` antaa tyhjän merkkijonon `'undone'`-tilassa (tarkoituksellista — spec-dokumentin mukaan "Ei kirjattu" -tilaan ei lisätä ikonia).

- [ ] **Step 2: Käynnistä paikallinen palvelin ja tarkista visuaalisesti**

```bash
cd /Users/patrikfriis/Projects/treeniapp
python3 -m http.server 8080 &
```

Navigoi `http://localhost:8080/index.html`, siirry Sali-sivulle. Tarkista jokaisesta sarjarivistä (eri liikkeet/sarjat joilla on eri historiaa):
- `worse`-tila (oranssi rivi): "edellinen"-tekstin edessä näkyy ▼
- `same`-tila (sininen rivi): edessä näkyy ●
- `better`-tila (vihreä rivi): edessä näkyy ▲
- `undone`-tila (punainen rivi, ei vielä dataa): ei ikonia, pelkkä "—"

Tarkista selaimen konsoli virheiden varalta.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: lisää ikoni sarjarivin vertailutilan viereen (värisokeuskorjaus)"
```

---

### Task 2: Versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.9.0` arvoon `v1.10.0`.

- [ ] **Step 2: Committaa**

```bash
git add index.html
git commit -m "v1.10.0: värisokeuskorjaus"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Speksin ainoa vaatimus (ikoni kolmelle vertailutilalle, ei ikonia undone-tilaan, ikoni "edellinen"-tekstin eteen) on katettu kokonaan Task 1:ssä.
- **Ei placeholdereita:** Koodilohko on täydellinen, ei TBD/TODO-merkintöjä.
- **Laajuus:** Tämä on koko Sprint 1:n pienin kohde (1 piste) — yksi rivinlisäys plus versionumero, ei erillistä migraatiota, ei uutta dataa.
