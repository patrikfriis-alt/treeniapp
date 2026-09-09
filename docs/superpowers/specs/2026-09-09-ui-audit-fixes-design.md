# Treeniapp (Valkku) — UI-audit löydösten korjaukset: juoksukaavio, liikemodaalin kaavio, tilan täsmäytys

**Päivämäärä:** 2026-09-09
**Laajuus:** Kolme erillistä, riippumatonta korjausta jotka löytyivät koko sovelluksen läpikäyneessä UI-katselmuksessa selaimessa: (1) Aerobia-sivun "Juoksun kehitys" -kaavio näyttää vanhimmat 30 juoksua uusimpien sijaan, (2) liikemodaalin (`ex-modal-chart`) Y-akseli toistaa saman pyöristetyn kg-luvun monta kertaa kapealla arvoalueella, (3) treenilogin sarja-/istuntotila (`LD`, localStorage) ei koskaan täsmäydy palvelimen todellisen tilan kanssa, minkä havaittiin voivan näyttää täysin paikallisesti jääneen, synkronoimattoman datan valmiina/oikeana ilman mitään merkkiä siitä.
**Riippuvuudet:** Olemassa oleva `sb` (Supabase-client), `renderSession()`, `getED()`/`LD`, `loadQueue()`/`OFFLINE_QUEUE_KEY`, `syncTimers`, `getActiveSession()`, `wStart()`/`localIso()`, `workout_sets`- ja `workout_sessions`-taulut. Ei muutoksia tietokantaskeemaan.

---

## Tausta

2026-09-09: käyttäjä pyysi käymään koko sovelluksen läpi UI-parannusten löytämiseksi. Selaimessa (puhelinkokoisella näkymällä) käyty läpikäynti paljasti edellä mainitut kolme todellista virhettä (ei pelkkiä visuaalisia parannusehdotuksia). Käyttäjä valitsi nämä korjattavaksi ensin, ennen isompia layout-uudistuksia (Tilastot-sivu, Valikko-asetukset).

Kolmas löydös liittyy suoraan 2026-09-05 autofill-häiriöön: silloin selaimen oma autofill kirjoitti vääriä arvoja `set-tinput`-kenttiin, mikä johti korjaukseen (`autocomplete="off"` + uniikki `name`). Nyt UI-katselmuksen aikana löytyi **eri, syvempi juurisyy** samalle oiretyypille: `LD` (paikallinen `localStorage`-välimuisti, jonka avaimet ovat ISO-viikko+päivä+sessiotyyppi+liikeindeksi — ei kalenteripäivämäärä) on sovelluksen AINOA lähde sarjojen valmiustilalle ja arvoille. Mikään koodipolku ei koskaan hae/vertaa `LD`:n sisältöä siihen mitä `workout_sets`-taulussa todella on tallennettuna kyseiselle päivälle. Tämä todennettiin käytännössä: kehitystyökaluselaimen `localStorage`issa oli jäänteitä aiemmasta testauksesta (`57.5×10, 57.5×10, 52.5×10` kolmelle sarjalle), jotka näkyivät valmiina vihreillä valintamerkeillä heti "Aloita treeni" -painikkeen painamisen jälkeen — vaikka Supabasessa ei ollut riviäkään kyseiselle päivälle. Tämä on eri mekanismi kuin selaimen autofill, mutta tuottaa käyttäjälle identtisen oireen ("sarjat näyttävät valmiilta arvoilla joita en syöttänyt").

## 1. Juoksun kehitys -kaavion korjaus

**Tiedosto:** `index.html`, `loadRunChart()` (n. rivi 4503-4511).

Nykyinen kysely:
```js
const { data, error } = await sb
  .from('activity_data')
  .select('activity_date, duration_min, distance_km')
  .in('activity_type', ['Juoksu', 'Kävely'])
  .not('distance_km', 'is', null)
  .order('activity_date', { ascending: true })
  .limit(30);
```

`ascending: true` + `limit(30)` hakee **30 vanhinta** riviä, ei 30 uusinta — kun aktiviteetteja on kertynyt yli 30, uusimmat pudotetaan pois eikä kaavio koskaan näytä tuoreinta kehitystä. Korjaus: haetaan uusimmat 30 laskevassa järjestyksessä, käännetään sitten nousevaan järjestykseen JS:ssä kaavion piirtoa varten (sama data, oikea aikajärjestys):

```js
const { data: rawData, error } = await sb
  .from('activity_data')
  .select('activity_date, duration_min, distance_km')
  .in('activity_type', ['Juoksu', 'Kävely'])
  .not('distance_km', 'is', null)
  .order('activity_date', { ascending: false })
  .limit(30);
const data = rawData ? [...rawData].reverse() : rawData;
```

Kaikki tämän jälkeinen koodi (`labels`, `values`, kaavion rakennus) käyttää `data`-muuttujaa muuttumattomana — vain hakusuunta ja jälkikäteiskäännös muuttuvat.

## 2. Liikemodaalin kaavion Y-akselin korjaus

**Tiedosto:** `index.html`, `loadModalChart()` sisällä oleva `_modalChart = new Chart(...)` (n. rivi 4435-4458).

Nykyinen Y-akseli:
```js
y: { ticks: { color: '#555', font: { size: 10 }, callback: v => Math.round(v) + ' kg' }, grid: { color: '#222' } },
```

Kapealla arvoalueella (esim. 72–73 kg) Chart.js:n automaattinen tick-generointi tuottaa useita desimaalilukuja (72.0, 72.17, 72.33...), jotka `Math.round()` pyöristää samoiksi kokonaisluvuiksi — näkyvä tulos on sama "73kg"-teksti toistuen 5-7 kertaa peräkkäin. Korjaus lisää `maxTicksLimit`, sama malli jota tiedosto jo käyttää x-akseleilla (rivit 2655, 6863, arvolla 8) — pienempi tick-määrä pakottaa Chart.js:n valitsemaan harvemmat, toisistaan erottuvat arvot:

```js
y: { ticks: { color: '#555', font: { size: 10 }, maxTicksLimit: 6, callback: v => Math.round(v) + ' kg' }, grid: { color: '#222' } },
```

## 3. Sarja-/istuntotilan täsmäytys palvelimen kanssa

**Tiedosto:** `index.html`, uusi funktio `reconcileSessionWithServer()`, kutsutaan `renderSession()`:sta.

### 3.1 Milloin ajetaan

`renderSession()`:ssa (n. rivi 3066), heti `await loadPrevSession(wOff, aDay, requestId)` -kutsun jälkeen ja ennen `sess.ex.forEach(...)`-silmukkaa (joka lukee `getED()`:n kautta `LD`:n) — eli aina kun istuntonäkymä renderöidään, riippumatta onko `started`/`done`. Sama `requestId`-suoja käytössä kuin muuallakin tässä funktiossa (nopea päivä-/viikkovaihto ei jätä vanhentunutta hakua ajamaan täsmäytystä väärälle päivälle).

### 3.2 Mitä haetaan

```js
async function reconcileSessionWithServer(o, d, st, sess, requestId) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const dateIso = localIso(dt);
  const names = sess.ex.map(e => e.n);

  const [{ data: setRows }, { data: sessionRows }] = await Promise.all([
    sb.from('workout_sets').select('exercise_name,set_number,weight_kg,reps')
      .eq('workout_date', dateIso).in('exercise_name', names),
    sb.from('workout_sessions').select('is_done')
      .eq('workout_date', dateIso).eq('session_type', st).limit(1),
  ]);
  if (requestId !== treeniRequestId) return;

  const queue = loadQueue();
  const isPendingSet = (exName, setNum) => queue.some(q =>
    q.table === 'workout_sets' && q.payload &&
    q.payload.workout_date === dateIso && q.payload.exercise_name === exName && q.payload.set_number === setNum);
  const isPendingDone = queue.some(q =>
    q.table === 'workout_sessions' && q.payload && q.payload.workout_date === dateIso);

  const serverByExercise = {};
  (setRows || []).forEach(r => {
    if (!serverByExercise[r.exercise_name]) serverByExercise[r.exercise_name] = {};
    serverByExercise[r.exercise_name][r.set_number] = r;
  });

  let changed = false;
  sess.ex.forEach((ex, ei) => {
    const k = eKey(o, d, st, ei);
    const ed = LD[k] || { sets: [] };
    for (let s = 0; s < ex.s; s++) {
      const timerKey = `${o}-${d}-${ei}-${s}`;
      if (syncTimers[timerKey]) continue; // juuri kirjoitettu, debounce kesken -> ei kosketa
      if (isPendingSet(ex.n, s + 1)) continue; // odottaa offline-jonossa -> ei kosketa

      const serverSet = serverByExercise[ex.n] && serverByExercise[ex.n][s + 1];
      const newVal = serverSet
        ? { kg: serverSet.weight_kg != null ? String(serverSet.weight_kg) : '', reps: serverSet.reps != null ? String(serverSet.reps) : '' }
        : {};
      const oldVal = ed.sets[s] || {};
      if ((oldVal.kg || '') !== (newVal.kg || '') || (oldVal.reps || '') !== (newVal.reps || '')) {
        ed.sets[s] = newVal;
        changed = true;
      }
    }
    LD[k] = ed;
  });

  const doneKey = `${dKey(o, d, st)}_done`;
  if (!isPendingDone) {
    const serverDone = !!(sessionRows && sessionRows[0] && sessionRows[0].is_done);
    if (LD[doneKey] !== serverDone) { LD[doneKey] = serverDone; changed = true; }
  }

  if (changed) saveLD();
}
```

Kutsupaikka `renderSession()`:ssa:
```js
  await loadPrevSession(wOff, aDay, requestId);
  if (requestId !== treeniRequestId) return;
  await reconcileSessionWithServer(wOff, aDay, st, sess, requestId);
  if (requestId !== treeniRequestId) return;
```

### 3.3 Miksi tämä on turvallinen

- **Palvelin voittaa aina**, paitsi kahdessa tapauksessa: (a) `syncTimers`issa on kesken oleva 500ms debounce-ajastin kyseiselle sarjalle (käyttäjä kirjoitti juuri, kirjoitus ei ole vielä edes yrittänyt synkronoitua), (b) offline-kirjoitusjonossa (`sbOfflineQueue`) on täsmäävä rivi (kirjoitus on yritetty mutta epäonnistunut väliaikaisesti verkko-ongelman vuoksi, odottaa uudelleenyritystä). Molemmissa tapauksissa paikallinen arvo on *tuoreempi* kuin mitä palvelin vielä tietää, joten sitä ei saa korvata.
- **Ei vaikuta `isStarted`-tilaan** — se on tarkoituksella pelkkä paikallinen UI-tila (ei koskaan synkronoitu palvelimelle alun perinkään, kts. `setStarted()`), joten sillä ei ole palvelinversiota jota vasten täsmäyttää.
- **Ei uusia tietokantatauluja tai -sarakkeita** — pelkkiä lukukyselyjä olemassa oleviin tauluihin.
- **Ei muuta `syncSet()`/`saveSet()`/`toggleDone()`-kirjoituslogiikkaa** — täsmäytys on puhtaasti lukusuunta (palvelin → paikallinen), kirjoitussuunta (paikallinen → palvelin) pysyy ennallaan.

## 4. Rajaus — mitä EI tehdä

- Ei käyttäjälle näkyvää "synkronoidaan..."-indikaattoria tai virheilmoitusta jos täsmäytyshaku epäonnistuu (verkkovirhe) — epäonnistunut haku jätetään hiljaa väliin (`error`-arvoa ei edes tarkisteta erikseen; jos `setRows`/`sessionRows` on `null`/`undefined`, `(setRows || [])` ja `sessionRows && sessionRows[0]` -suojaukset pitävät funktion turvallisena, eikä mitään muuteta). Sama hiljainen virheenkäsittelytyyli kuin muuallakin tässä sovelluksessa read-kyselyille.
- Ei muuteta `isStarted`-tilaa millään tavalla.
- Ei kosketa muita `LD`-avaimia (esim. profiilidata, painonpudotusennusteen tila) — vain kyseisen istunnon sarjat ja valmiuslippu.
- Ei lisätä täsmäytystä muihin näkymiin (Aerobia, Keho, Uni) — nämä eivät koskaan näyttäneet vastaavaa "paikallinen väärä valmiustila" -oiretta katselmuksessa, koska niillä ei ole vastaavaa "sarja valmis" -käsitettä joka luetaan suoraan `LD`:stä ilman minkäänlaista palvelinvahvistusta.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. **Juoksukaavio:** varmista Supabasesta/koodista että Juoksu/Kävely-aktiviteetteja on yli 30 riviä; avaa Aerobia → Kehitys — tarkista että kaavion viimeinen päivämäärä vastaa tuorienta oikeasti kirjattua aktiviteettia (ei jää viikkoja/kuukausia taakse).
2. **Liikemodaalin kaavio:** avaa liike jolla on niukka painovaihtelu viimeaikaisissa sarjoissa (esim. 1-2kg ero) — tarkista ettei Y-akselilla toistu sama luku useita kertoja peräkkäin.
3. **Täsmäytys, perustapaus:** `localStorage.clear()` selaimen konsolissa, lataa sivu uudelleen, avaa Sali-sivu jollain päivällä jolla EI ole vielä mitään kirjattua kyseiselle päivämäärälle — tarkista että kaikki sarjat näkyvät tyhjinä/ei-valmiina (ei false-positiiveja).
4. **Täsmäytys, jäänteen korjaus:** aseta konsolista käsin `LD`:hen väärä/vanha arvo jollekin sarjalle joka EI vastaa palvelimen dataa kyseiselle päivälle (`localStorage.setItem`/suora `LD`-muokkaus + `saveLD()`), lataa sivu uudelleen ja avaa sama päivä — tarkista että väärä arvo korvautuu oikealla (tai tyhjenee, jos palvelimella ei ole riviä).
5. **Täsmäytys ei riko kesken olevaa kirjoitusta:** kirjoita nopeasti arvo KG-kenttään ja välittömästi (alle 500ms sisällä) vaihda päivätabia ja takaisin — tarkista ettei juuri kirjoitettu arvo katoa/nollaudu (debounce-suoja toimii).
6. **Täsmäytys offline-jonon kanssa:** simuloi offline-kirjoitus (esim. DevTools "Offline"-tila päällä kirjoitushetkellä niin että kirjaus jää jonoon), palauta yhteys pois päältä, vaihda päivätabia pois ja takaisin ennen kuin jono on ehtinyt tyhjentyä — tarkista ettei jonossa oleva, vielä synkronoimaton arvo häviä/nollaudu täsmäytyksen takia.
7. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
