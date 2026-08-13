# Treeniapp (Valkku) — Lepoajastimen kesto asetettavaksi

**Päivämäärä:** 2026-08-13
**Laajuus:** Sovelluksessa on jo toimiva lepoajastin (`startRestTimer()`, käynnistyy automaattisesti kun sarjan kg+toistot on täytetty), mutta sen kesto on kovakoodattu 90 sekuntiin (`REST_DURATION`-vakio). Tämä spec tekee kestosta käyttäjän asetettavan, samalla mallilla kuin olemassa oleva Askeltavoite-asetus. Ei muutoksia ajastimen muuhun toimintaan (automaattikäynnistys, ääni, napauta-sulkeaksesi) — vain kesto muuttuu konfiguroitavaksi.
**Riippuvuudet:** Olemassa oleva `app_settings`-singleton-taulu ja sen lataus/välimuistikäytäntö (`appSettings`-globaali muuttuja, `loadAppSettings()`), olemassa oleva Askeltavoite-asetusmodaalin malli (`openStepsGoalModal()`/`saveStepsGoal()`, index.html:5274-5313).

---

## Tausta

Lepoajastin (`e5ddd83`) käynnistyy automaattisesti aina kun käyttäjä täyttää sarjan painon ja toistot, ja laskee 90 sekuntia alaspäin kelluvassa pillerissä ruudun alareunassa. Kesto on tällä hetkellä kiinteä vakio. Käyttäjä haluaa asettaa oman kestonsa (esim. lyhyemmän kevyille liikkeille, pidemmän raskaille), yhtenä globaalina asetuksena — ei per-liike- tai per-treenityyppi-tasolla, ja ilman lisäsäätimiä (pause/skip/pikanapit) ajastinpillerissä itsessään.

---

## 1. Tietomalli

```sql
alter table app_settings add column rest_timer_seconds integer;
```

Ei DB-tason oletusarvoa — `null` tarkoittaa "käytä 90s oletusta", sama malli kuin `daily_steps_goal`. Ei uutta taulua, ei uutta riviä — `app_settings` on jo yksirivinen singleton (`id = 1`).

---

## 2. Asetusnäkymä

Uusi rivi Valikko-sivun asetuslistaan, Askeltavoite-rivin tyylillä (index.html:1382-1383), sijoitetaan sen viereen. Ikonina käytetään samaa "⏱"-emojia kuin itse ajastinpillerissä (`#rest-timer-icon`, index.html:992) — **ei** olemassa olevaa `watch`-SVG-ikonia, koska se on jo käytössä Kalorikerroin-rivillä eri merkityksessä.

```html
<button onclick="openRestTimerModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
  <span style="display:inline-flex;width:20px;justify-content:center;">⏱</span> Lepoajastin
</button>
```

`openRestTimerModal()`/`saveRestTimerDuration()` toteutetaan `openStepsGoalModal()`/`saveStepsGoal()`:n mallilla (index.html:5274-5313):

- Modaali: otsikko "Lepoajastin", yksi `form-row` (`label`: "Kesto (s)", `input type="text" inputmode="numeric"`, esitäytetty `appSettings.rest_timer_seconds`-arvolla tai tyhjä jos `null`), Tallenna- ja Sulje-napit, `status`-div virheille.
- Validointi: kentän arvo joko tyhjä (→ tallennetaan `null`, palauttaa 90s oletukseen) tai positiivinen kokonaisluku (→ tallennetaan sellaisenaan). Muu syöte: virhe `status`-diviin, ei tallenneta.
- Tallennus: `sbWrite({ table: 'app_settings', op: 'update', payload: { id: 1, rest_timer_seconds: value, updated_at: new Date().toISOString() }, eq: { column: 'id', value: 1 } })`, sama kutsumuoto kuin `saveStepsGoal()`:ssa. Onnistuessa päivitetään paikallinen `appSettings.rest_timer_seconds` ja suljetaan modaali.

---

## 3. Ajastimen kytkentä

`index.html:1603-1638`, kaksi kohtaa:

**`startRestTimer()`** — nykyinen:
```js
function startRestTimer() {
  stopRestTimer();
  let remaining = REST_DURATION;
```
→
```js
function startRestTimer() {
  stopRestTimer();
  let remaining = (appSettings && appSettings.rest_timer_seconds) || REST_DURATION;
```

**`stopRestTimer()`** — nykyinen:
```js
    if (countEl) countEl.textContent = REST_DURATION;
```
→
```js
    if (countEl) countEl.textContent = (appSettings && appSettings.rest_timer_seconds) || REST_DURATION;
```

`REST_DURATION`-vakio (90) säilyy koodissa sellaisenaan — se on nyt oletusarvo, ei enää ainoa arvo.

Ei muutoksia `saveSet()`:n tai `startRestTimer()`:n synkronisuuteen: `appSettings` on jo tavallisessa käytössä ladattu välimuistiin siinä vaiheessa kun käyttäjä ehtii Sali-sivulle (Koonti lataa sen sovelluksen käynnistyessä, `loadKoonti()` → `if (!appSettings) appSettings = await loadAppSettings();`), sama malli jota mm. Askeltavoite-kortti jo käyttää synkronisesti lukiessaan `appSettings.daily_steps_goal`:ia. Jos `appSettings` poikkeuksellisesti ei vielä olisi ladattu, koodi taipuu siististi 90s-oletukseen — ei uutta virhetilaa.

---

## 4. Rajaus — mitä EI tehdä

- Ei pause/skip-nappeja ajastinpillerissä.
- Ei manuaalista käynnistystä (ajastin käynnistyy edelleen vain automaattisesti kg+toistot-täytöllä).
- Ei per-liike- tai per-treenityyppi-kestoa — yksi globaali arvo.
- Ei pikasäätönappeja (+15s/-15s) pillerissä.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Valikko, tarkista että "⏱ Lepoajastin" -rivi näkyy Askeltavoitteen vieressä.
2. Avaa asetus, aseta kesto esim. 45s, tallenna.
3. Mene Saliin, täytä sarjan kg+toistot — tarkista että ajastin käynnistyy 45 sekunnista, ei 90:stä.
4. Avaa asetus uudelleen, tyhjennä kenttä, tallenna — täytä uusi sarja, tarkista että ajastin käynnistyy jälleen 90 sekunnista.
5. Syötä asetukseen 0, negatiivinen luku tai teksti — tarkista että tallennus estyy ja virhe näkyy, arvo ei muutu.
