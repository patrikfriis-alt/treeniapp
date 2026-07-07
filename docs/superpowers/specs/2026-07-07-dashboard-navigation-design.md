# Treeniapp — Koontisivu ja navigaation uudelleenjärjestely

**Päivämäärä:** 2026-07-07
**Laajuus:** Uusi "Koonti"-etusivu (dashboard), Sali/Aerobia/Keho/Uni erotetaan omiksi täysiksi sivuikseen nykyisen "Seuranta"-välilehden sijaan, Historia-sivun kaaviot siirtyvät Sali/Aerobia-sivuille, alapalkki supistuu kolmeen kohtaan.
**Riippuvuudet:** Ei uusia Supabase-tauluja. Kaikki data tulee olemassa olevista tauluista (`workout_sessions`, `activity_data`, ruumiinmittaukset, uni, `food_log_entries`). Yksi uusi kevyt kysely (streak/viikkolaskenta) lisätään Koonti-sivua varten.

---

## Tavoite

Nykyinen alanavigaatio (Treeni / Seuranta / Ruoka / Valikko) piilottaa Kehon, Aktiviteetin ja Unen saman "Seuranta"-välilehden taakse, eikä sovelluksessa ole yhtä paikkaa josta näkee koko päivän/viikon tilanteen kerralla. Tavoite on:

1. Uusi **Koonti**-etusivu, joka näyttää heti kokonaiskuvan (streak, tämän päivän tila, viimeisimmät mittarit) kortteina.
2. **Sali**, **Aerobia**, **Keho** ja **Uni** erotetaan omiksi itsenäisiksi sivuikseen, jotka avataan Koonnin korteista — ei enää tab-baaria "Seuranta"-sivun sisällä.
3. Sali- ja Aerobia-sivuista tulee itsenäisiä kokonaisuuksia: kirjaus ja niihin liittyvä historia/kaaviot samalla sivulla, sen sijaan että kaaviot ovat erikseen Valikko → Historia -takana.

---

## 1. Navigaatiorakenne

### Alapalkki (nav-elementti, index.html:687-703)

Nykyinen 4 nappia → **3 nappia**:

```
🏠 Koonti   🍽️ Ruoka   ≡ Valikko
```

`Treeni`- ja `Seuranta`-napit poistuvat alapalkista kokonaan. `showPage('koonti', this)` on oletuksena aktiivinen sivu sovelluksen käynnistyessä (korvaa nykyisen `showPage('treeni', this)`-oletuksen).

### Sivuhierarkia

```
page-koonti      (UUSI, alapalkin oletussivu)
  └─ kortti → page-sali       (push, korvaa page-treeni:n roolin oletussivuna)
  └─ kortti → page-aerobia    (push, korvaa seuranta-aktiviteetti-tabin)
  └─ kortti → page-keho       (push, korvaa seuranta-keho-tabin)
  └─ kortti → page-uni        (push, korvaa seuranta-uni-tabin)
  └─ kortti → page-ruoka      (push, sama sivu kuin alapalkin Ruoka)

page-ruoka        (ennallaan, tavoitettavissa alapalkista JA Koonnin kortista)
page-valikko/sidebar
  └─ Ohjelma      (ennallaan)
  └─ Asetukset    (ennallaan)
  (Historia-linkki POISTUU — sisältö siirtyy page-sali/page-aerobia:lle)
```

**Navigointisääntö:** jokainen kortti avaa kohdesivun täysinä push-näkyminä (sama mekaniikka kuin nykyisellä `showPage`:lla, ei modaalia). Jokaisen alasivun yläreunassa on `‹ Koonti` -paluunuoli, joka aina palaa Koontiin — sivujen välillä ei ole suoraa ristiinnavigointia (esim. Salista suoraan Aerobiaan).

### JS-muutokset `showPage`-funktioon (index.html:3054)

```js
function showPage(name, btn) {
  document.body.style.overflow = '';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'koonti')   loadKoonti();
  if (name === 'sali')     { populateExerciseDropdown(); loadWorkoutHistory(); }
  if (name === 'aerobia')  { loadActivities(); loadRunChart(); }
  if (name === 'keho')     loadBodyMetrics();
  if (name === 'uni')      loadSleep();
  if (name === 'ohjelma')  renderOhjelma();
  if (name === 'ruoka')    renderRuoka();
}
```

`showSeuranta(sub)` ja `showHistTab(tab, btn)` poistuvat (Seuranta- ja Historia-sivut lakkaavat olemasta omina sivuinaan). Niiden sisältö siirtyy uusiin per-sivu-funktioihin kohdissa 3–4.

**Paluunuoli-komponentti:** jokaisen uuden alasivun (`page-sali`, `page-aerobia`, `page-keho`, `page-uni`) yläreunaan lisätään yhteinen header-elementti:

```html
<div class="page-header">
  <button class="back-btn" onclick="showPage('koonti', document.querySelector('nav button'))">‹</button>
  <span class="page-title">Sali</span>
</div>
```

(`nav button` viittaa Koonti-nappiin, joka on ensimmäinen `nav`-elementin lapsi — se merkitään aktiiviseksi paluun yhteydessä.)

---

## 2. Koonti-sivu (uusi, `page-koonti`)

### Rakenne

```html
<div id="page-koonti" class="page active">
  <div class="koonti-header">
    <div class="koonti-greeting">Hei, Patrik 👋</div>
    <div class="koonti-date" id="koonti-date"></div>
  </div>
  <div class="koonti-streaks" id="koonti-streaks"></div>

  <div class="koonti-section-label">Tänään</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-sali" onclick="showPage('sali', navBtnKoonti)">…</div>
    <div class="koonti-card" id="kc-aerobia" onclick="showPage('aerobia', navBtnKoonti)">…</div>
  </div>

  <div class="koonti-section-label">Mittarit</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-keho" onclick="showPage('keho', navBtnKoonti)">…</div>
    <div class="koonti-card" id="kc-uni" onclick="showPage('uni', navBtnKoonti)">…</div>
  </div>

  <div class="koonti-cards koonti-cards--wide">
    <div class="koonti-card koonti-card--ruoka" id="kc-ruoka" onclick="showPage('ruoka', navBtnRuoka)">…</div>
  </div>
</div>
```

### `loadKoonti()` — data per kortti

| Kortti | Lähde | Kenttä |
|---|---|---|
| Sali | `workout_sessions` | tämän päivän `workout_date`-rivi(t): jos `is_done`, näytä "Tehty · kesto"; muuten "Ei vielä tänään" tai suunnitellun session tyyppi |
| Aerobia | `activity_data` | viimeisin rivi (`order by activity_date desc limit 1`): laji, kesto, kalorit |
| Keho | ruumiinmittaustaulu (sama jota `loadBodyMetrics()` käyttää) | viimeisin paino + delta edelliseen mittaukseen |
| Uni | uni-taulu (sama jota `loadSleep()` käyttää) | viime yön kesto + 7 pv keskiarvo |
| Ruoka | `food_log_entries` (sama logiikka kuin `renderFoodHero`) | tämän päivän kcal + proteiini/hiilari/rasva-palkki |

Jokainen kortti kutsuu kevyesti samaa Supabase-kyselyä jota kohdesivu jo tekee (esim. Keho-kortti tekee saman haun kuin `loadBodyMetrics()` muttei renderöi koko lomaketta) — ei uutta datamallia, vain suppeampi näkymä samasta datasta.

### Streak-rivi (uusi laskenta)

Kolme chippiä:
- **Putki:** peräkkäiset päivät (taaksepäin tästä päivästä) joilla joko `workout_sessions.is_done = true` TAI `activity_data`-rivi on olemassa kyseiselle päivälle. Katkeaa ensimmäiseen päivään jolla ei kumpaakaan.
- **Salit tällä viikolla:** `count(workout_sessions where is_done = true and workout_date between <ma> and <su>)`.
- **Km tällä viikolla:** `sum(activity_data.distance_km where activity_date between <ma> and <su>)`.

Uusi funktio `loadDashboardStreaks()` hakee nämä kolme lukua kahdella kyselyllä (workout_sessions + activity_data rajattuna esim. viimeiset 30 päivää putkilaskentaa varten, ja kuluva viikko erikseen).

---

## 3. Sali-sivu (`page-sali`, korvaa `page-treeni` + osan Historiasta)

**Yläosa (ennallaan, siirretty suoraan `page-treeni`:stä):** hero-section, viikkonavi, päivätabit, sessiosisältö — ei toiminnallisia muutoksia, pelkkä ID-nimen vaihto `page-treeni` → `page-sali`.

**Uusi "Kehitys"-välilehti** sivun alaosaan, stab-barina (samalla mekaniikalla kuin nykyinen Historia-sivun `hist-tab-kaaviot`/`hist-tab-lokit`):

```html
<div class="stab-bar">
  <button id="sali-tab-treeni" class="stab active" onclick="showSaliTab('treeni',this)">Treeni</button>
  <button id="sali-tab-kehitys" class="stab" onclick="showSaliTab('kehitys',this)">Kehitys</button>
</div>
```

"Kehitys"-välilehti sisältää nykyisen Historia-sivun `hist-kaaviot`-kortin "Liikkeen kehitys" -osan (liikevalinta, 1RM/volyymikaaviot, graffi-modaali — `loadExerciseChart`, `openExerciseModal`) sekä `hist-lokit`-kortin "Salilokit"-listan (`loadWorkoutHistory`). Funktiot `loadExerciseChart`, `populateExerciseDropdown`, `loadWorkoutHistory`, `openExerciseModal` pysyvät nimeltään samoina, kutsutaan vain uudesta `showSaliTab('kehitys')`-haarasta `showPage('sali')`:n sijaan `showPage('historia')`:n sijaan.

## 4. Aerobia-sivu (`page-aerobia`, korvaa `seuranta-aktiviteetti` + osan Historiasta)

**Yläosa (ennallaan, siirretty `seuranta-aktiviteetti`:stä):** hero, kirjauslomake (laji/kesto/kalorit/syke/matka/vauhti), "Viimeiset"-lista.

**Uusi "Kehitys"-välilehti** sivun alaosaan, samalla stab-bar-mekaniikalla kuin Sali-sivulla:

```html
<div class="stab-bar">
  <button id="aerobia-tab-treeni" class="stab active" onclick="showAerobiaTab('treeni',this)">Aktiviteetti</button>
  <button id="aerobia-tab-kehitys" class="stab" onclick="showAerobiaTab('kehitys',this)">Kehitys</button>
</div>
```

"Kehitys"-välilehti sisältää nykyisen Historia-sivun "Juoksun kehitys" -kortin (matka/vauhtikaavio, `loadRunChart` pysyy nimeltään samana, kutsutaan vain uudesta `showAerobiaTab('kehitys')`-haarasta).

## 5. Keho- ja Uni-sivut (`page-keho`, `page-uni`)

Sisältö on identtinen nykyisten `seuranta-keho`- ja `seuranta-uni`-lohkojen kanssa (mittaus-/unilomake + kaavio/historia ovat jo samalla näkymällä, ei erillistä Historia-integraatiota tarvita). Muutos on puhtaasti rakenteellinen: lohkot irrotetaan `page-seuranta`:n sisältä omiksi `page-keho`/`page-uni`-diveiksi, ja niiden lataus tapahtuu suoraan `showPage`:sta (`loadBodyMetrics()`, `loadSleep()`) `showSeuranta()`-välikäden sijaan.

## 6. Ruoka ja Valikko

- `page-ruoka`: ei muutoksia sisältöön. Reachable sekä alapalkista että Koonnin Ruokailu-kortista (molemmat kutsuvat `showPage('ruoka', ...)`).
- Sivupalkki (Valikko): "Historia"-rivi poistetaan valikosta kokonaan (index.html:940 kohdan nappi). Ohjelma ja Asetukset pysyvät ennallaan.

---

## 7. Poistuvat/uudelleennimettävät elementit

| Poistuu | Korvaa |
|---|---|
| `page-treeni` (id) | `page-sali` |
| `page-seuranta` + `stab-bar` (Keho/Aktiviteetti/Uni) | `page-keho`, `page-aerobia`, `page-uni` erillisinä |
| `page-historia` + `stab-bar` (Kaaviot/Lokit) | Kaaviot jaettu `page-sali`:n ja `page-aerobia`:n "Kehitys"-välilehdille |
| `showSeuranta(sub)` | poistuu, korvaa `showPage`:n suorat haarat |
| `showHistTab(tab, btn)` | korvaa uusi `showSaliTab`/`showAerobiaTab` per sivu |
| Valikon "Historia"-nappi | poistuu |

Kaikki datafunktiot (`loadBodyMetrics`, `saveBodyMetrics`, `loadSleep`, `saveSleep`, `saveActivity`, `loadExerciseChart`, `loadRunChart`, `loadWorkoutHistory`, ruoka-funktiot) pysyvät muuttumattomina — vain se, mistä `showPage`-haara niitä kutsuu, muuttuu.

---

## 8. Testaus

Sovelluksessa ei ole automaattitestejä (staattinen HTML/JS + Supabase). Toteutuksen jälkeen manuaalinen läpikäynti selaimessa:

1. Sovellus avautuu Koontiin, ei Saliin.
2. Jokainen viisi korttia (Sali, Aerobia, Keho, Uni, Ruoka) avautuu oikealle sivulle oikealla datalla.
3. Jokaisen alasivun paluunuoli palaa Koontiin, ja Koonti-napin aktiivitila on oikein alapalkissa.
4. Sali- ja Aerobia-sivujen "Kehitys"-välilehdet näyttävät samat kaaviot/lokit jotka ennen löytyivät Historiasta.
5. Ruoka toimii identtisesti sekä alapalkista että Koonti-kortista avattuna.
6. Valikosta Historia-rivi on poissa, Ohjelma/Asetukset toimivat ennallaan.
7. Streak-chipit näyttävät oikeat luvut (verrataan manuaalisesti Supabasen taulusisältöön).
