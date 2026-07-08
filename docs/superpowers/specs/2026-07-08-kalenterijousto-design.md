# Treeniapp — Kalenterijousto (päiväkohtainen sessio-override Supabaseen)

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 1 osa 2/4. Siirtää olemassa olevan päiväkohtaisen sessio-override-mekanismin (Sali-sivun "Päivän tyyppi" -valitsin) `localStorage`:sta Supabaseen, laitteiden välillä synkronoituvaksi, ja korjaa samalla nykyisen mekanismin virheellisen suhteellisen viikkoavaimen.
**Riippuvuudet:** Ohjelmaeditori (Sprintti 1 osa 1/4) on jo toteutettu ja mergetty — tämä ominaisuus käyttää sen `program_sessions`-dataa (`SESS`) mutta ei muokkaa sitä tauluja.

---

## Tavoite

Sali-sivulla on jo "Päivän tyyppi" -valitsin jolla voi vaihtaa minkä tahansa yksittäisen päivän session tyypin ilman että viikko-ohjelman oletus muuttuu — tämä on käytännössä jo Kalenterijousto. Ongelma: mekanismi tallentaa valinnan `localStorage`:iin avaimella `w${viikko-offset}_d${päivä}_sess`, jossa `viikko-offset` on suhteellinen ("tämä viikko" = 0) eikä absoluuttinen. Koska offset lasketaan aina uudelleen suhteessa "nyt"-hetkeen, sama avain (`w0_d1_sess`) osuu eri kalenteriviikolle riippuen milloin sovellusta käytetään — vanha override "vuotaa" tulevaisuuteen. Lisäksi override ei synkronoidu laitteiden välillä.

Tavoite: siirtää sama toiminnallisuus Supabaseen, avaimena oikea kalenteripäivämäärä (sama konventio kuin `workout_sessions.workout_date`/`activity_data.activity_date`), jolloin bugi korjaantuu samalla ja override toimii laitteesta riippumatta.

**Ei migroida olemassa olevia paikallisia overrideja** — ne ovat jo epäluotettavan avainskeeman takana, uusi järjestelmä alkaa tyhjästä.

---

## 1. Datamalli

```sql
create table day_session_overrides (
  workout_date  date primary key,
  session_type  text not null,
  created_at    timestamptz not null default now()
);

alter table day_session_overrides enable row level security;
create policy day_session_overrides_all on day_session_overrides
  for all to anon, authenticated using (true) with check (true);
```

`session_type` on vapaata tekstiä, ei FK:ta `program_sessions`-tauluun — sama konventio kuin `workout_sessions.session_type`/`workout_sets.exercise_name`. Jos overridattu sessio poistetaan myöhemmin Ohjelma-editorissa, override-rivi jää tauluun mutta `SESS[override]` on `undefined` ajonaikaisesti — `renderSession()` näyttää tällöin jo olemassa olevan "Ei ohjelmoitua sessiota" -tilan (sama polku kuin päivällä jolla ei ole `default_weekdays`-osumaa, toteutettu ja testattu Ohjelmaeditori-osiossa).

---

## 2. Ajonaikainen integrointi

### `loadWeekActivityData(o)` laajennus

Nykyinen funktio (index.html:1459) hakee `workout_sets`- ja `activity_data`-rivit viikon päivämääräväliltä ja rakentaa `weekActivityCache[dayIso] = { workout: {}, activities: [] }`. Lisätään kolmas rinnakkainen kysely samalle väliltä:

```js
sb.from('day_session_overrides')
  .select('workout_date, session_type')
  .gte('workout_date', fromDate)
  .lte('workout_date', toDate),
```

ja jokaiselle tulosriville asetetaan `weekActivityCache[row.workout_date].override = row.session_type` (luoden cache-rivin jos sitä ei vielä ole, samalla `{ workout: {}, activities: [] }`-alustuksella kuin muillakin datalähteillä).

### `getActiveSession`/`setActiveSession` uudelleenkirjoitus

```js
const getActiveSession = (o, d) => {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const dayIso = localIso(dt);
  const cached = weekActivityCache[dayIso];
  return (cached && cached.override) || SCHED[d];
};

async function setActiveSession(o, d, st) {
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const workout_date = localIso(dt);
  const { error } = await sb.from('day_session_overrides')
    .upsert({ workout_date, session_type: st }, { onConflict: 'workout_date' });
  if (error) { console.error('setActiveSession failed:', error.message); return; }
  await loadWeekActivityData(o);
  renderTreeni();
}
```

Kaikki nykyiset `getActiveSession(o, d)`-kutsupaikat (10 kpl, mm. `saveSet`, `syncSet`, `prefillExercise`, `renderTreeni`, `renderSession`, `toggleDone`, `startSession`) toimivat sellaisenaan, koska funktion paluuarvon MUOTO ei muutu — vain sen datalähde. **Vahvistettu:** jokainen kutsupaikka operoi aina sillä viikolla joka on juuri renderöity (`renderTreeni()` kutsuu aina ensin `await loadWeekActivityData(wOff)` ennen kuin mitään päivätabeja tai session-sisältöä renderöidään), joten `weekActivityCache` on aina valmiiksi ladattu sille viikolle kun `getActiveSession` kutsutaan käyttäjän interaktiosta — ei race conditionia.

`setActiveSession` oli aiemmin synkroninen, nyt asynkroninen — sen ainoa kutsupaikka on "Päivän tyyppi" -valitsimen `onclick`-attribuutti (`onclick="setActiveSession(...)"`), joka toimii identtisesti vaikka funktio palauttaa nyt Promisen (onclick ei odota paluuarvoa).

### Käyttäytymisen säilyminen

"Päivän tyyppi" -valitsin näyttää ja toimii täysin identtisesti nykyiseen nähden — sama UI, sama välitön tallennus jokaisesta valinnasta. Ei lisätä "poista poikkeus" -toimintoa (ei ole nytkään olemassa) — YAGNI, sama rajoitus kuin nykyisessä paikallisessa versiossa.

---

## 3. Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Sali-sivulla valitaan jollekin päivälle eri sessio "Päivän tyyppi" -valitsimesta — päivätabin lyhytnimi ja hero-osio päivittyvät heti.
2. Sivun uudelleenlataus (F5) — override säilyy, näkyy oikein.
3. Toisessa selaimessa/incognito-ikkunassa (simuloi toista laitetta) sama override näkyy — vahvistaa Supabase-synkan toimivan.
4. Viikon vaihto edestakaisin (`←`/`→`) ja takaisin — override pysyy oikealla päivämäärällä, ei "vuoda" viereiselle viikolle.
5. Overridataan päivä sessioon joka sitten poistetaan Ohjelma-editorista — päivä näyttää "Ei ohjelmoitua sessiota" eikä kaadu.
6. Sarjakirjaus (`saveSet`/`syncSet`) overridatulle päivälle tallentuu oikealla `session_type`-arvolla `workout_sets`-tauluun.
