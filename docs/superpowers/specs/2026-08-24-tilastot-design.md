# Treeniapp (Valkku) — Ruokalogin raaka, järjestettävä taulukko ("Tilastot")

**Päivämäärä:** 2026-08-24
**Laajuus:** Uusi sivu Valikko-sivupalkin kautta: taulukkomuotoinen näkymä kaikkiin logattuihin ruokakirjauksiin, järjestettävissä minkä tahansa sarakkeen mukaan, neljällä aikagranulariteetilla (per kirjaus / per päivä / per viikko / per kuukausi). Kattaa myös CSV-viennin sivupalkin olemassa olevaan "Vie data" -osioon.
**Riippuvuudet:** `food_log_entries`, `food_cache`, `custom_foods` (sisältävät nyt kaikki tarvittavat ravintoainesarakkeet aiempien Sulamo-vertailun kohteiden 4 ja 5 ansiosta), `entrySource()`, `showPage()`, `downloadCSV()`, `localIso()`, olemassa oleva `ICONS`-objekti ja sivupalkin rakenne.

---

## Tausta

Sulamo-vertailun kohta 6 (ks. `project_sulamo_comparison_backlog`-muisti): Sulamon "Tilastot"-välilehti näyttää jokaisen logatun ruokakirjauksen taulukkona, järjestettävissä minkä tahansa sarakkeen otsikkoa napauttamalla, neljällä aikagranulariteetilla. Alkuperäinen backlog-merkintä sisälsi kenttiä joita Treeniappissa ei oikeasti ole ("teollinen sokeri" erillään kokonaissokerista, alkoholi, "annos"/kasvis-%-tyylinen mittari) — nämä on jätetty pois, koska kohdan 5 työ vahvisti ettei Fineli tarjoa lisätty-vs-luonnollinen-sokeri-erottelua, eikä alkoholia tai annosmittaria seurata Treeniappissa missään. Kaikki muut 19 ravintoainesaraketta (kcal/proteiini/hiilarit/rasva, kuitu/sokeri/suola, 4 rasvatyyppiä, natrium, 5 kivennäisainetta, C/D-vitamiini) ovat jo `food_cache`/`custom_foods`-tauluissa kohtien 4 ja 5 ansiosta — tämä on siis pääosin näyttö-/järjestämisongelma, ei enää dataongelma.

## 1. Sijainti sovelluksessa

Uusi sivu `page-tilastot`, avataan Valikko-sivupalkin uudesta "Tilastot"-napista (sijoitetaan Näkemykset-napin jälkeen, ennen "Asetukset"-otsikkoa). Sama `page-header`/`back-btn`/`page-title`-rakenne kuin Näkemykset-sivulla. `ICONS`-objektiin lisätään yksi uusi yksinkertainen ruudukko-ikoni ("table"), koska mikään olemassa oleva ikoni ei sovi.

## 2. Data ja sarakkeet

Haku: `food_log_entries` liitettynä `food_cache`/`custom_foods`-tauluihin (sama liitosmalli kuin `loadFoodDayEntries()`:ssä, laajennettuna kaikkiin 19 ravintoainesarakkeeseen + `logged_at`/`meal_type`/`amount_g`), rajattuna päivämääräväliin. Oletusväli: viimeiset 30 päivää. Kaksi `type="date"`-kenttää ("Alkupäivä"/"Loppupäivä") laajentavat väliä, "Näytä"-nappi hakee uudelleen.

Sarakkeet (kaikki näkyvissä samanaikaisesti, taulukko on tarkoituksella leveä — ei yritetä mahduttaa yhdelle ruudulle):

`Pvm, Ateria, Nimi, Määrä (g), Kcal, Proteiini, Hiilarit, Rasva, Kuitu, Sokeri, Tyydyttynyt rasva, Kertatyydyttymätön rasva, Monityydyttymätön rasva, Transrasva, Suola, Natrium, Kalsium, Kalium, Magnesium, Rauta, Sinkki, C-vitamiini, D-vitamiini`

Sarakkeet määritellään yhtenä `TILASTOT_COLUMNS`-konfiguraatiotaulukkona (sama malli kuin kohdan 5 `LISATIEDOT_FIELDS`): `{ key, label, unit, decimals, kind: 'text'|'number', getter(row) }`. Uuden ravintoainesarakkeen lisääminen tulevaisuudessa on yhden rivin muutos.

## 3. Granulariteetti

Neljä nappia: **Per kirjaus / Per päivä / Per viikko / Per kuukausi**. Kaikki neljä käyttävät samaa yhtä hakua — vaihtaminen ei hae uudelleen, vain ryhmittelee/laskee uudelleen selaimessa.

- **Per kirjaus**: yksi rivi per `food_log_entries`-rivi. Pvm/Ateria/Nimi täytettyinä. Kcal ja Proteiini luetaan suoraan jo tallennetuista `entry.kcal`/`entry.protein_g`-sarakkeista (lasketaan valmiiksi kirjaushetkellä, ei uudelleen tästä). Loput 17 ravintoainesaraketta (Hiilarit, Rasva, Kuitu, Sokeri, 4 rasvatyyppiä, Suola, Natrium, 5 kivennäisainetta, C/D-vitamiini) lasketaan `entryX()`-apufunktioilla liitetystä `food_cache`/`custom_foods`-rivistä × `amount_g` (`entryCarbs()`/`entryFat()`/`entryFiber()`/`entrySugar()`/`entrySalt()` jo olemassa; 12 uutta apufunktiota lisätään samalla mallilla — kukin palauttaa 0 jos lähdearvo on `null`, samoin kuin olemassa olevat).
- **Per päivä / viikko / kuukausi**: rivi = aikaväli (ISO-päivä / ISO-viikko / kuukausi). Nimi/Ateria-sarakkeiden tilalla yksi **Kirjauksia**-sarake (kirjausten lukumäärä kyseisellä välillä). Määrä ja kaikki 19 ravintoainesaraketta summataan välin sisällä.

## 4. Järjestäminen

Minkä tahansa sarakeotsikon napautus järjestää sen mukaan nousevasti; toinen napautus vaihtaa laskevaksi; pieni nuoli osoittaa aktiivisen järjestyksen ja suunnan. Järjestäminen tapahtuu selaimessa (`Array.prototype.sort`) — 30 päivän oletusväli pitää rivimäärän pienenä (kymmeniä–muutama sata), joten palvelinpuolen järjestämistä/sivutusta ei tarvita. Numeeriset sarakkeet järjestyvät numeerisesti, Nimi/Ateria/Kirjauksia tekstinä.

## 5. Taulukon UI

Oikea `<table>`-elementti `overflow-x:auto`-kääreessä. Ensimmäinen sarake (Pvm tai aikavälin nimi) on `position:sticky; left:0`, jotta se pysyy näkyvissä vaakasuunnassa vieritettäessä 19 ravintoainesarakkeen läpi. Ladataan-tila ja tyhjä-tila noudattavat muun sovelluksen konventiota ("Ladataan...", "Ei kirjauksia tällä aikavälillä").

## 6. CSV-vienti

Uusi "Vie ruokalogi (CSV)" -nappi sivupalkin olemassa olevaan "Vie data" -osioon, täsmälleen `exportActivitiesCSV()`:n mallin mukaan: `downloadCSV()`-apufunktio, `.limit(100000)`, ei päivämäärärajausta (vie kaiken koskaan logatun, ei vain näkyvillä olevaa 30 päivän ikkunaa). Yksi rivi per kirjaus (per-kirjaus-granulariteetin muoto), sarakkeina kaikki 19 ravintoainetta + Pvm/Ateria/Nimi/Määrä.

## 7. Rajaus

- Vain katselu — ei muokkausta/poistoa tästä taulukosta (käytä olemassa olevaa Ruoka-päivänäkymää siihen).
- Ei linkkiä riviltä ruoan tarkempiin tietoihin/Lisätiedot-paneeliin.
- Ei tallenneta järjestys-/granulariteetti-/aikaväli-valintaa käyntikertojen välillä — nollautuu joka avauksella.
- Ei palvelinpuolen sivutusta v1:ssä — laajan aikavälin valitseminen (esim. "kaikki") tuottaa ison, mutta silti selaimen käsiteltävissä olevan taulukon; tämä on tietoinen kompromissi power-user-näkymälle, ei jotain jota puolustavasti estetään.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Tilastot sivupalkista — tarkista että viimeisen 30 päivän kirjaukset latautuvat per-kirjaus-näkymässä oletuksena.
2. Napauta eri sarakeotsikoita — tarkista että järjestys vaihtuu oikein (numeerinen ja tekstisarake), ja että toinen napautus kääntää suunnan.
3. Vaihda granulariteettia (päivä/viikko/kuukausi) — tarkista että rivit ryhmittyvät oikein, summat täsmäävät manuaalisesti laskettuun, Kirjauksia-sarake näyttää oikean lukumäärän.
4. Laajenna aikaväliä päivämääräkentillä ja hae uudelleen — tarkista että uudet rivit ilmestyvät.
5. Tarkista rivi jolla on puuttuvia ravintoainearvoja (esim. oma tuote jolta puuttuu D-vitamiini) — arvo näkyy 0:na per-kirjaus-summauksessa (ei NaN), koska `entryX()`-apufunktiot jo palauttavat 0 null-arvoille (sama malli kuin päiväyhteenvedossa).
6. Vieritä taulukkoa vaakasuunnassa — tarkista että ensimmäinen sarake pysyy näkyvissä (sticky).
7. Testaa CSV-vienti — avaa tiedosto, tarkista sarakeotsikot ja että se sisältää kirjauksia myös 30 päivän ikkunan ulkopuolelta.
8. Tarkista päivä/aikaväli jolla ei ole yhtään kirjausta — näkyy tyhjä-tila, ei virhettä.
9. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
