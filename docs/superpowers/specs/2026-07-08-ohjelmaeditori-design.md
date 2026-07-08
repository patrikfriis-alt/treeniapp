# Treeniapp — Ohjelmaeditori ja liikekirjasto

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 1 osa 1/4 (kokonaislistasta: ohjelmaeditori + liikekirjasto + viikkokaavan muokkaus). Kalenterijousto (viikkokohtaiset poikkeukset), kestävyystavoitteet ja onboarding ovat omia jatkoprojektejaan tämän päälle.
**Riippuvuudet:** Ei riipu muista Sprintti 1 -kohdista, mutta ne kaikki riippuvat tästä.

---

## Tavoite

Nykyinen treeniohjelma (`SESS`/`SCHED`-vakiot, index.html:1091-1131) on kiinteä JavaScript-lähdekoodissa: neljä salisessiota (T1–T4) liikkeineen, jääkiekko/juoksu/lepo-päivät, ja kiinteä viikkokaava joka määrittää minkä session mikäkin viikonpäivä oletuksena saa. Kukaan muu kuin sovelluksen alkuperäinen käyttäjä ei voi käyttää sovellusta omalla ohjelmallaan.

Tavoite: tehdä koko ohjelma (sessiotyypit, niiden liikkeet, ja viikonpäiväjako) muokattavaksi sovelluksen sisällä, sekä lisätä itsenäinen haettava liikekirjasto joka toimii sekä ohjelman rakennuspalikkana että pohjana myöhemmälle sarjakirjaukselle.

---

## 1. Datamalli

Kolme uutta Supabase-taulua:

```sql
create table exercises (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  muscle_group  text,  -- 'rinta' | 'selka' | 'jalat' | 'hartiat' | 'kasivarret' | 'vatsa' | 'muu' | null
  created_at    timestamptz not null default now()
);

create table program_sessions (
  id                text primary key,   -- slug, esim. 't1', 'kiekko', tai uusille "selkapaiva"
  name              text not null,
  focus             text default '',
  default_weekdays  int[] not null default '{}',  -- 0=Ma .. 6=Su
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create table program_session_exercises (
  id                  bigint generated always as identity primary key,
  program_session_id  text not null references program_sessions(id) on delete cascade,
  exercise_name       text not null,  -- vapaa teksti, ei FK:ta exercises-tauluun (ks. alla)
  target_sets         int not null default 3,
  target_display      text not null default '3×10',  -- esim. "3×8", "3×45s"
  sort_order          int not null default 0
);

alter table exercises enable row level security;
alter table program_sessions enable row level security;
alter table program_session_exercises enable row level security;
-- RLS-policyt samalla mallilla kuin muissa tauluissa: anon+authenticated saavat täyden pääsyn
-- (create policy ..._all on <table> for all to anon, authenticated using (true) with check (true);)
```

**Liikkeen tunniste pysyy nimenä.** `program_session_exercises.exercise_name` ja olemassa oleva `workout_sets.exercise_name` ovat molemmat vapaata tekstiä — ei FK:ta `exercises`-tauluun. `exercises`-taulu on puhtaasti liikekirjaston hakua ja lihasryhmätageja varten. Tämä tarkoittaa: liikkeen nimen muuttaminen kirjastossa ei automaattisesti päivitä historiadataa (hyväksytty rajoite), mutta ei myöskään vaadi mitään migraatiota nykyiselle `workout_sets`-datalle.

**`program_sessions.id` on teksti-slug, ei numero.** Migraatio siirtää nykyiset avaimet (`t1`, `t2`, `t3`, `t4`, `kiekko`, `juoksu`, `lepo`) sellaisenaan slugeiksi — `workout_sessions.session_type` ja `workout_sets`-taulun historiadata pysyvät koskemattomina, ei tarvitse migroida yhtään vanhaa riviä. Uusi käyttäjän luoma sessio saa sluggifioidun nimen (esim. "Selkäpäivä" → `selkapaiva`), törmäystarkistuksella (`_2`-pääte jos slug on jo käytössä).

**Seed-migraatio** (`supabase/migrations/20260708_ohjelmaeditori.sql`) luo taulut ja täyttää `program_sessions`/`program_session_exercises` nykyisen `SESS`/`SCHED`-datan pohjalta (staattiset INSERT-lauseet, käännetty suoraan index.html:n nykyisistä vakioista) sekä `exercises`-taulun kaikilla liikkeillä joita SESS-datassa esiintyy (lihasryhmä jätetään `null`:ksi seedatuille, käyttäjä voi täydentää myöhemmin).

---

## 2. Ajonaikainen integrointi

`loadProgram()`-funktio hakee kolme uutta taulua ja koostaa tuloksen **täsmälleen samaan muotoon** kuin nykyiset `SESS`/`SCHED`-vakiot:

```js
SESS  = { t1: { name, focus, ex: [{ n, t, s }, ...] }, ... }
SCHED = { 0: 't1', 1: 'kiekko', ... }  // rakennetaan default_weekdays-taulukoista
```

`const SESS` / `const SCHED` muuttuvat `let`-muuttujiksi jotka `loadProgram()` täyttää sovelluksen INIT-vaiheessa (ennen `loadKoonti()`-kutsua). **Kaikki nykyinen renderöintilogiikka pysyy koskemattomana** — `renderTreeni()`, `getActiveSession()`, `populateExerciseDropdown()`, päivätabit, Koonti-korttien treenidata — ne kaikki vain lukevat samoja muuttujia jotka nyt täyttyvät Supabasesta koodiin kirjoittamisen sijaan. Editori kutsuu `loadProgram()`:n uudelleen jokaisen muutoksen jälkeen.

`SESSION_LABELS`-vakio (index.html:1760) poistuu tarpeettomana — päivätabien lyhytnimi johdetaan `SESS[key].name`:sta ajonaikaisesti.

**Reunatapaus — päivä ilman sessiota:** jos `default_weekdays` ei kata jotain viikonpäivää, `getActiveSession()` palauttaa `null`. `renderTreeni()` näyttää tällöin "Ei ohjelmoitua sessiota tälle päivälle" -tilan CTA-napilla joka vie Ohjelma-sivulle.

---

## 3. Ohjelma-editori (UI)

Ohjelma-sivu muuttuu accordion-tyyliseksi listaksi:

- **Sessiolista:** jokainen sessio omana korttinaan (nimi, liikemäärä, viikonpäivät lyhyesti). Napautus laajentaa kortin paikan päällä — vain yksi kortti auki kerrallaan. "+ Uusi sessio" -nappi yläreunassa luo tyhjän session välittömästi ja avaa sen muokattavaksi.
- **Auki oleva kortti sisältää:** nimi- ja kuvauskenttä, viikonpäivävalitsin (7 ympyrää, monivalinta), liikelista, "+ Lisää liike" -hakuarkki, "Poista sessio" -nappi.
- **Liikkeen lisäys:** hakuarkki hakee `exercises`-taulusta nimellä (`ilike`) + lihasryhmäsuodatin (Rinta/Selkä/Jalat/Hartiat/Käsivarret/Vatsa/Muu). Jos haku ei osu mihinkään, "+ Lisää uusi liike [hakusana]" luo uuden `exercises`-rivin ja kysyy lihasryhmän.
- **Liikkeen tavoite** (esim. "3×8") on napautettava rivillä — avaa kaksi pientä kenttää (sarjat, toistot-teksti) jotka tallentuvat blur:lla.
- **Järjestäminen:** SortableJS (CDN, `<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js">`) sekä sessiolistassa että session sisäisessä liikelistassa, raahauskahvalla (`.drag-handle`). `onEnd`-callback kirjoittaa uudet `sort_order`-arvot kaikille listan riveille.
- **Tallennus on välitöntä joka kentästä** — ei erillistä "Tallenna"-nappia. Sama malli kuin nykyinen `toggleDone()`/`syncDone()`: kentän `onblur`/`onchange`/raahauksen päättyminen kirjoittaa Supabaseen heti ja kutsuu `loadProgram()`:n uudelleen.

---

## 4. Testaus

Ei automaattitestejä (staattinen HTML/JS + Supabase, ks. muut speksit). Manuaalinen läpikäynti:

1. Sovelluksen käynnistyessä `loadProgram()` hakee migraation seedaaman datan, ja Sali-sivu/Koonti-kortit näyttävät täsmälleen saman ohjelman kuin ennen muutosta (regressio-check).
2. Uuden session luonti, nimeäminen, viikonpäivien valinta, liikkeen lisäys kirjastosta ja uuden liikkeen luonti kirjastoon toimivat ja tallentuvat.
3. Session/liikkeiden järjestäminen raahaamalla pysyy tallessa sivun uudelleenlatauksen jälkeen.
4. Session poisto poistaa myös sen liikkeet (`on delete cascade`) mutta ei koske olemassa olevaa `workout_sets`/`workout_sessions`-historiadataa.
5. Päivä jolla ei ole sessiota näyttää "Ei ohjelmoitua sessiota" -tilan eikä kaadu.
6. Olemassa oleva sarjakirjaus (Sali-sivun `set-table`), 1RM-kaaviot ja Watch-synkka toimivat muuttumattomina, koska `workout_sets`/`workout_sessions` eivät muutu.
