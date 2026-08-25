# Treeniapp (Valkku) — Kestävyystavoitteen viikon päivä-strip

**Päivämäärä:** 2026-08-25
**Laajuus:** Lisätään viikon 7-päiväinen tila-strip ("tapahtuiko liikuntaa tänä päivänä") olemassa olevaan "Kestävyystavoitteet"-korttiin Aerobia-sivulla, sekä napautettava päiväkohtainen aktiviteettilistamodaali. Viimeinen kohta Sulamo-vertailun backlogista.
**Riippuvuudet:** `renderAerobiaGoalCard()`, `loadActivityGoalProgress()`, `activity_data`-taulu, olemassa oleva `.kc-week-daystrip`/`.kc-week-day`-CSS (alun perin viikon kaloribudjetti-kortin käytössä), `openMetricModal()`, `DAYS`-vakio, `localIso()`/`wStart()`.

---

## Tausta

Sulamo-vertailun kohta 7 (viimeinen, ks. `project_sulamo_comparison_backlog`-muisti): Sulamon liikuntatavoitekortti näyttää 7 yksittäistä päiväpalkkia (ma–su). Treeniappin "Kestävyystavoitteet"-kortti (`#aerobia-goal-card` Aerobia-sivulla) näyttää tällä hetkellä vain yhden aggregoidun viikkoluvun per tavoitetyyppi (Kilometrit, Kerrat, Keskivauhti — käyttäjä voi asettaa 0–3 näistä samanaikaisesti).

Treeniappissa on jo täsmälleen tähän tarkoitukseen sopiva, uudelleenkäytettävä komponentti: `.kc-week-daystrip`/`.kc-week-day`-CSS ja "napauta päiväsolua → avaa yksityiskohtamodaali" -konventio, jota käyttää tällä hetkellä viikon kaloribudjetti-ominaisuus Näkemykset-sivulla (`openDayBudgetModal()`).

## 1. Sijainti ja laajuus

Vain Aerobia-sivun "Kestävyystavoitteet"-kortti (`renderAerobiaGoalCard()`). **Ei muutoksia Koonti-dashboardin kompaktiin "Aktiivinen"-korttiin** — se pysyy nykyisellään yhden rivin yhteenvetonaan. Kortilla ei ole tällä hetkellä viikkonavigointia (näyttää aina kuluvan viikon) — strip noudattaa samaa rajausta, ei viikkonavigointia lisätä.

## 2. Mitä strip näyttää

Yksi jaettu 7-solun rivi (Ma–Su, `DAYS`-vakion mukaisesti), lisätään kertaalleen olemassa olevien tavoiterividen (Kilometrit/Kerrat/Keskivauhti) alle — **ei erillistä stripiä per tavoitetyyppi**. Päiväsolu on vihreä (uudelleenkäyttäen `.kc-week-day.under`-luokkaa puhtaasti sen värin vuoksi, ei sen budjettimerkityksen) jos `activity_data`-taulussa on vähintään yksi rivi kyseiselle päivälle; muuten neutraali/harmaa (ei luokkaa). Tämä toimii identtisesti riippumatta siitä onko käyttäjällä km-tavoite, kertatavoite vai molemmat — molemmat kysyvät pohjimmiltaan "liikuitko sinä päivänä".

Vain tähän päivään asti kuluvasta viikosta renderöidään tilaluokka; myöhemmät päivät saavat ei luokkaa eivätkä ole napautettavissa — täsmälleen sama rajaus kuin kaloribudjetti-stripissä (`iso <= todayIso`).

Strip näytetään vain jos vähintään yksi tavoite on asetettu — sama ehto jonka kortti jo käyttää (`if (!rows.length) { card.style.display = 'none'; }`).

## 3. Data

`loadActivityGoalProgress()` hakee tällä hetkellä `activity_data`-rivit viikolta mutta valitsee vain `distance_km, duration_min` ja pelkistää ne heti viikkosummiksi, hyläten päiväkohtaisen tiedon. Laajennetaan valintaa: `id, activity_date, activity_type, distance_km, duration_min`. Raakarivit säilytetään palautusarvossa (nykyisten `totalKm`/`sessionCount`/`avgPace`-laskelmien rinnalla, ei niiden sijaan) jotta sekä strip että napautusmodaali voivat käyttää samaa hakua ilman toista verkkopyyntöä.

## 4. Napautuskäyttäytyminen

Aktiivisuutta sisältävän päiväsolun napautus avaa modaalin olemassa olevalla `openMetricModal(title, body)` -apufunktiolla:
- **Otsikko**: viikonpäivän nimi, samalla mallilla kuin `openDayBudgetModal()`: `date.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' })`.
- **Sisältö**: kyseisen päivän kaikki `activity_data`-rivit listattuna, sama rivimalli kuin `openWeeklyActivityModal()`:ssa (`activity_type — duration_min min`), mutta laajennettuna matkalla jos `distance_km` on asetettu (`activity_type — duration_min min · distance_km km`).

Päivät joilla ei ole aktiviteettia eivät ole napautettavissa (ei `onclick`-attribuuttia, ei osoitin-kursoria).

## 5. Rajaus

- Ei muutoksia Koonti-dashboardin "Aktiivinen"-korttiin.
- Ei erillistä stripiä per tavoitetyyppi (Kilometrit/Kerrat/Keskivauhti jakavat saman stripin).
- Ei viikkonavigointia kortille (pysyy nykyisellään kuluvaan viikkoon rajattuna).
- Ei uutta visuaalista komponenttia — puhdas `.kc-week-day`-uudelleenkäyttö.
- Tulevat (kuluvan viikon vielä koittamattomat) päivät eivät ole napautettavissa eivätkä saa tilaluokkaa.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Aseta vähintään yksi kestävyystavoite (km, kerrat tai molemmat) ja avaa Aerobia-sivu — tarkista että strip näkyy tavoiterividen alla.
2. Kirjaa aktiviteetti tälle viikolle usealle eri päivälle — tarkista että vastaavat päiväsolut muuttuvat vihreiksi, muut pysyvät neutraaleina.
3. Napauta vihreää päiväsolua — tarkista että modaali avautuu oikealla viikonpäivän nimellä ja listaa kyseisen päivän aktiviteetit oikein (tyyppi, kesto, matka jos asetettu).
4. Napauta päivää jolla ei ole aktiviteettia — tarkista ettei mitään tapahdu (ei virhettä, ei tyhjää modaalia).
5. Tarkista että tulevat viikonpäivät (esim. jos tänään on keskiviikko, torstai–sunnuntai) eivät saa tilaluokkaa eivätkä ole napautettavissa.
6. Poista kaikki kestävyystavoitteet — tarkista että koko kortti (rivit + strip) piiloutuu, kuten nykyäänkin.
7. Kirjaa päivälle useampi kuin yksi aktiviteetti — tarkista että modaali listaa kaikki, ei vain viimeisintä.
8. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
