# Treeniapp (Valkku) — Kuitu/Sokeri/Suola-päiväyhteenveto

**Päivämäärä:** 2026-08-21
**Laajuus:** Uusi kortti Ruoka-sivulle, joka näyttää päivän kuidun, sokerin ja suolan yhteismäärät kiinteisiin viitearvoihin verrattuna. Kattaa myös taustalla tarvittavat skeemamuutokset ja tietovirran (haku → välimuisti → näyttö).
**Riippuvuudet:** Olemassa oleva `fineli_foods`-taulu (jo sisältää `fiber_per_100g`/`sugar_per_100g`/`salt_per_100g`), `food_cache`-/`custom_foods`-taulut (eivät vielä sisällä näitä), `searchFineli()`, `ensureFoodCache()`, `createCustomFood()`, `loadFoodDayEntries()`, `entryCarbs()`/`entryFat()`-mallin mukaiset apufunktiot, `renderFoodHero()`, oman tuotteen per-annos-toggle (`setCustomFoodEntryMode()`).

---

## Tausta

Sulamo.fi näyttää "Analyysi"-välilehdellään liian vähän → suositus → liian paljon -gradienttipalkin useille ravintoaineille. Alkuperäinen backlog-merkintä ("beyond macros -nutrient strip") olettikin tämän olevan lähes ilmaista, koska `fineli_foods`-taulussa on jo `fiber_per_100g`/`sugar_per_100g`/`salt_per_100g`-sarakkeet. Tarkempi tarkastelu paljasti että nämä sarakkeet ovat vain Fineli-hakulähteessä — kun ruoka kirjataan, se kulkee `food_cache`/`custom_foods`/`food_log_entries`-taulujen kautta, joista mikään ei tällä hetkellä välitä kuitu/sokeri/suola-arvoja eteenpäin (vain kcal/proteiini/hiilarit/rasva kopioituvat). Päivätason yhteenveto vaatii siis oikeasti skeemalaajennuksen — ei pelkkää UI:n lisäystä olemassa olevan datan päälle.

## 1. Skeema

Uusi migraatio lisää kolme nullable `numeric`-saraketta sekä `food_cache`- että `custom_foods`-tauluihin: `fiber_per_100g`, `sugar_per_100g`, `salt_per_100g`. Ei muutoksia `food_log_entries`-tauluun — kuitu/sokeri/suola-summat lasketaan näyttöhetkellä liitetystä `food_cache`/`custom_foods`-rivistä × `amount_g`, täsmälleen samalla mallilla kuin hiilarit/rasva jo lasketaan (`entryCarbs()`/`entryFat()`). Tämä tarkoittaa: ei taannehtivaa backfilliä, ei riskiä olemassa olevalle datalle — vanhat `food_log_entries`-rivit toimivat muuttumattomina, ja niiden kuitu/sokeri/suola-osuus on 0 kunnes vastaava ruoka haetaan/välimuistitetaan uudelleen tämän muutoksen jälkeen.

## 2. Tietovirta

- **`searchFineli()`**: lisää `fiber_per_100g, sugar_per_100g, salt_per_100g` hakukyselyn sarakkeisiin, välitetään `foodModalSelected`-objektiin muiden ravintoarvojen rinnalle.
- **`ensureFoodCache()`**: saa kolme uutta parametria, kirjoittaa ne `food_cache`-upsertin mukana (arvot tulevat `foodModalSelected`:sta `confirmAddFood()`-kutsun yhteydessä, sama kohta josta kcal/proteiini/hiilarit/rasva jo kulkevat).
- **`createCustomFood()`**: saa kolme uutta **valinnaista** parametria. Oman tuotteen lomake saa kolme uutta valinnaista kenttää — "Kuitu/100g", "Sokeri/100g", "Suola/100g" (tai `/annos`-muodossa jos "Per annos" -tila on valittuna, samalla muunnoslogiikalla kuin neljä olemassa olevaa kenttää). Tyhjäksi jätetty kenttä tallentuu `null`:ina, ei `0`:na — tuote jää "ei seurattu" -tilaan noiden ravintoaineiden osalta sen sijaan että väittäisi sisältävänsä nolla kuitua.
- **`loadFoodDayEntries()`**: molemmat liitoshaut (`food_cache(...)`, `custom_foods(...)`) saavat kolme uutta saraketta valintalistaansa.
- Uudet apufunktiot `entryFiber(entry)`, `entrySugar(entry)`, `entrySalt(entry)` — rakenteeltaan identtiset `entryCarbs()`/`entryFat()`:n kanssa, palauttavat 0 jos lähteen arvo on `null` (jotta seuraamattomat omat tuotteet eivät tuota `NaN`:ia päiväsummaan).

## 3. UI

Uusi kortti Ruoka-sivulle, "Viikko"/"Paasto"-rivien alle, ennen ateriakortteja. Kolme riviä, kukin uudelleenkäyttäen olemassa olevaa `.koonti-progress-track`/`.koonti-progress-fill`-palkkikomponenttia (sama jota proteiinitavoitepalkki jo käyttää), ehdollisella täyttövärillä:

- **Kuitu**: tavoite ≥ 25 g (Pohjoismaiden ravitsemussuositusten alaraja). Täyttö = `min(100, summa/25×100)%`, vihreä kun ≥ 25 g saavutettu, muuten keltainen/amber.
- **Sokeri**: raja ≤ 50 g (WHO:n vapaan sokerin suositus). Täyttö = `min(100, summa/50×100)%`, vihreä kun alle rajan, punainen kun ylitetty.
- **Suola**: raja ≤ 5 g (WHO/Suomen suositus). Täyttö = `min(100, summa/5×100)%`, vihreä kun alle rajan, punainen kun ylitetty.

Jokainen rivi näyttää myös lukuarvon tekstinä palkin lisäksi (esim. "18g / 25g"), jotta tieto ei jää pelkän värin varaan.

Viitearvot ovat kiinteitä vakioita — eivät käyttäjäkohtaisesti muokattavissa (sama malli kuin Sulamolla), ei uutta asetusnäkymää.

## 4. Rajaus

- Ei muutoksia `food_log_entries`-skeemaan — arvot lasketaan aina näyttöhetkellä.
- Ei taannehtivaa datan korjausta/backfilliä vanhoille kirjauksille.
- Viitearvot kiinteitä, ei muokattavissa asetuksista.
- Ei toteuteta Sulamon täyttä kolmivyöhykkeistä gradienttipalkkia — yksinkertaistettu yhden kynnysarvon palkki, joka on visuaalisesti yhtenäinen muun sovelluksen kanssa.
- Oman tuotteen kuitu/sokeri/suola-kentät ovat valinnaisia — ei pakoteta täyttämään.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Hae ja kirjaa Fineli-ruoka jolla on tunnettu kuitu/sokeri/suola-arvo (esim. täysjyväleipä) — tarkista että päiväkortin kolme palkkia päivittyvät oikein lasketuilla arvoilla.
2. Luo oma tuote täyttäen kaikki kentät mukaan lukien kuitu/sokeri/suola, kirjaa se — tarkista että sen osuus näkyy summissa.
3. Luo oma tuote jättäen kuitu/sokeri/suola tyhjäksi, kirjaa se — tarkista ettei se tuota virhettä eikä vääristä summia (osuus 0, ei NaN).
4. Tarkista värilogiikka: kirjaa riittävästi kuitua ylittääksesi 25 g — palkki muuttuu vihreäksi. Kirjaa riittävästi sokeria/suolaa ylittääksesi rajan — palkki muuttuu punaiseksi.
5. Tarkista päivä jolla ei ole yhtään kirjausta — kortti näyttää 0g kaikissa kolmessa, ei virhettä.
6. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
