# Treeniapp (Valkku) — Monikäyttäjätuki, osaprojekti 1: Kirjautumisen perusta

**Päivämäärä:** 2026-08-26
**Laajuus:** Ensimmäinen osaprojekti Treeniappin siirtämisessä yksinkäyttäjä- → monikäyttäjäsovellukseksi. Lisää Supabase Authin sähköposti-magic-link-kirjautumisen: kirjautumisnäkymä, istunnon tunnistus sovelluksen käynnistyessä, uloskirjautuminen. **Ei muutoksia tietokannan RLS-käytäntöihin eikä mihinkään olemassa olevaan kyselyyn** — data pysyy identtisesti kaikkien nähtävissä tämän osaprojektin jälkeenkin, koska nykyiset käytännöt myöntävät pääsyn sekä `anon`- että `authenticated`-rooleille samalla tavalla. Todellinen datan eristäminen tulee osaprojektissa 3.
**Riippuvuudet:** `sb` (jo olemassa oleva `@supabase/supabase-js@2`-asiakas, `index.html:1578`), ei uusia kirjastoja tai Supabase-projektin asetusmuutoksia (Supabase Auth on jo käytettävissä jokaisessa Supabase-projektissa, ei erikseen käyttöönotettava).

---

## Tausta

Aiemmin tehty tutkimus (ks. `project_multiuser_migration_estimate`-tyyppinen muisti/keskustelu 2026-08-25) vahvisti: Treeniappissa ei ole minkäänlaista autentikointia — kaikki 25 taulua sallivat täyden luku/kirjoitusoikeuden `anon`-roolille RLS-käytännöillä `using (true)`, eikä sovellus tunnista "käyttäjiä" mitenkään. Koko monikäyttäjämigraatio on liian suuri yhdeksi speksiksi, joten se on jaettu 5 osaprojektiin (käyttäjän hyväksymä järjestys 2026-08-25):

1. **Kirjautumisen perusta** (tämä speksi) — kirjautuminen toimii, mutta data näkyy kaikille edelleen samalla tavalla.
2. Per-käyttäjä-datamalli (`user_id`-sarakkeet, singleton-taulujen muutos, vanhan datan siirto).
3. RLS:n kiristäminen + singleton-kutsupaikkojen päivitys sovelluksessa.
4. Edge Functionien päivitys (erityisesti `check-and-notify`:n uudelleenkirjoitus).
5. Monitilitestaus ja käyttöönotto.

Käyttäjä on vahvistanut: kyseessä ovat oikeat, erilliset käyttäjätilit (ei vain perhe/profiilivalitsin), pieni kutsuttu joukko (ei julkista rekisteröitymistä), ja Homey (sisarprojekti) **ei** ole tämän migraation piirissä.

## 1. Tilien luonti — sovelluksen ulkopuolella

Ei rekisteröitymislomaketta sovelluksessa. Käyttäjätilit luodaan Supabase Dashboardin "Invite user" -toiminnolla (Authentication → Users), joka luo tilin ja lähettää kirjautumislinkin suoraan käyttäjän sähköpostiin. Sovellus tarvitsee vain kirjautumisnäkymän, ei rekisteröitymisnäkymää.

## 2. Sovelluksen käynnistyslogiikka

Ennen sovelluksen nykyistä käynnistyslogiikkaa (joka tällä hetkellä suoraan kutsuu `showPage('koonti')`-tyyppistä alustusta) tarkistetaan istunto: `const { data: { session } } = await sb.auth.getSession();`.

- **Ei istuntoa**: näytetään vain kirjautumisnäkymä (`#auth-gate`), koko `<nav>` ja kaikki `.page`-elementit pysyvät piilossa.
- **Istunto olemassa**: jatketaan nykyisellä alustuslogiikalla muuttumattomana.

Lisäksi kuunnellaan `sb.auth.onAuthStateChange((event, session) => { ... })`:
- `SIGNED_IN`: piilotetaan kirjautumisnäkymä, ajetaan sovelluksen normaali alustus (sama koodipolku kuin "istunto olemassa" -haarassa).
- `SIGNED_OUT`: näytetään kirjautumisnäkymä uudelleen, piilotetaan `<nav>` ja kaikki sivut.

Tämä kuuntelija laukeaa automaattisesti myös silloin kun käyttäjä avaa magic link -sähköpostin linkin (supabase-js tunnistaa istunnon URL:n fragmentista oletusarvoisesti, `detectSessionInUrl` on päällä oletuksena) — erillistä URL-parsintakoodia ei tarvita.

## 3. Kirjautumisnäkymä

Uusi, koko näytön peittävä näkymä (`#auth-gate`), ei suljettavissa oleva modaali vaan pysyvä esto kun istuntoa ei ole. Sisältää:
- Sähköpostikenttä.
- "Lähetä kirjautumislinkki" -nappi, kutsuu `sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } })`.
- Onnistuneen lähetyksen jälkeen: tilaviesti "Tarkista sähköpostisi — lähetimme kirjautumislinkin osoitteeseen {email}".
- Virhetilanteessa (esim. tuntematon sähköposti — huom: Supabase ei oletuksena paljasta onko sähköposti olemassa, joten virheviesti on yleisluontoinen: "Kirjautumislinkin lähetys epäonnistui, yritä uudelleen").

Ei salasanakenttää, ei rekisteröitymislinkkiä, ei "unohtuiko salasana" -toimintoa — pelkkä magic link.

## 4. Uloskirjautuminen

Uusi "Kirjaudu ulos" -nappi Valikko-sivupalkkiin (samaan tyyliin kuin olemassa olevat sivupalkin napit, esim. "Profiili"), sijoitetaan sivupalkin loppuun oman erottimensa alle. Kutsuu `sb.auth.signOut()`, joka laukaisee `SIGNED_OUT`-tapahtuman ja näyttää kirjautumisnäkymän edellä kuvatulla tavalla.

## 5. Datan näkyvyys ei muutu

Koska nykyiset RLS-käytännöt (`using (true)`) myöntävät pääsyn identtisesti sekä `anon`- että `authenticated`-roolille, kirjautuminen sisään EI muuta mitä data kukin näkee — kaikki näkevät edelleen kaiken datan, aivan kuten ennen tätäkin osaprojektia. Tämä on tarkoituksellista: tämä osaprojekti todistaa vain että "joku voi tunnistautua ja pysyä tunnistettuna", ei rajoita mitään. Todellinen eristäminen on osaprojektin 3 vastuulla.

## 6. Rajaus

- Ei rekisteröitymislomaketta sovelluksessa.
- Ei salasanapohjaista kirjautumista.
- Ei sähköpostien sallittujen-listaa (allowlist) tietokannassa — tilien luonti on kokonaan Supabase Dashboardin kautta.
- Ei muutoksia mihinkään olemassa olevaan RLS-käytäntöön tai `sb.from(...)`-kutsuun.
- Ei muutoksia Edge Functioneihin.
- Ei "muista minut" -asetusta tai erillistä istunnon kestoasetusta — käytetään supabase-js:n oletuskäytäntöä (pitkäikäinen refresh-token, automaattinen uusinta), ei rakenneta mitään päälle.
- Ei tukea useamman tilin väliseen vaihtamiseen samalla laitteella ilman uloskirjautumista.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Ilman istuntoa: avaa sovellus, tarkista että vain kirjautumisnäkymä näkyy, ei navigaatiota eikä sivuja.
2. Syötä sähköposti (oma testitili, luotu Supabase Dashboardin kautta), lähetä kirjautumislinkki — tarkista tilaviesti "Tarkista sähköpostisi".
3. Avaa sähköpostista tullut linkki samassa selaimessa — tarkista että sovellus näyttää normaalin Koonti-näkymän kirjautumisnäkymän sijaan.
4. Päivitä sivu (F5) — tarkista että istunto säilyy (ei palaa kirjautumisnäkymään), koska supabase-js säilyttää istunnon selaimen tallennustilassa.
5. Kirjaudu ulos Valikko-sivupalkista — tarkista että kirjautumisnäkymä ilmestyy uudelleen ja navigaatio/sivut piiloutuvat.
6. Syötä virheellinen/olematon sähköposti — tarkista että virheviesti näkyy eikä sovellus kaadu (tarkista konsoli).
7. Tarkista että kaikki nykyiset ominaisuudet (Ruoka, Sali, Tilastot jne.) toimivat muuttumattomina kirjautuneena — data näkyy täsmälleen samana kuin ennen tätä ominaisuutta.
8. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
