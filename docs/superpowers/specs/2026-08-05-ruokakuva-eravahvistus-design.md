# Treeniapp (Valkku) — Ruokakuvan erävahvistus (Fineli → tekoäly -putki)

**Päivämäärä:** 2026-08-05
**Laajuus:** Korvaa ruokakuva-tunnistuksen nykyisen "yksi komponentti kerrallaan hakuun ja vahvistukseen" -polun yhdellä eräkäsittelynäkymällä: kaikki tunnistetut komponentit näkyvät listana, käyttäjä voi lisätä puuttuvia rivejä, kaksi peräkkäistä painiketta hakevat makrot ensin Finelistä ja tarvittaessa tekoälyltä, ja yksi iso painike tallentaa koko listan ateriaan kerralla.
**Riippuvuudet:** Olemassa oleva `analyzeFoodPhotoFile`/`renderFoodPhotoComponents` (kuvatunnistus, ei muutu), olemassa oleva `searchFineli()` (Fineli-haku, uudelleenkäytetään), olemassa oleva `food-macro-estimate`-Edge Function (muutetaan yhden kohteen sijaan taulukolliseksi), olemassa oleva `ensureFoodCache`/`createCustomFood`/`addFoodLogEntry` (tallennuspolku, ei muutu).

**Korvaa:** Tämän illan aiemmin toteutetun "🤖 Arvioi tekoälyllä" -painikkeen per-haku-mekanismin (commit `db7683c`) — se poistetaan kokonaan tästä käyttöliittymästä ja korvataan alla kuvatulla erävahvistusnäkymällä. Taustapalvelu (`food-macro-estimate`) säilyy, mutta sen rajapinta laajennetaan taulukolliseksi (ks. kohta 3).

**Konkreettisesti poistettavat/korvattavat kohdat `index.html`:ssa (jotta toteutussuunnitelma ei jätä kuollutta koodia):**
- `renderFoodPhotoComponents()` — korvataan uudella rivilistan renderöinnillä (`foodPhotoRows`-pohjainen).
- `selectFoodPhotoComponent(i)` — poistuu kokonaan; ei enää yksittäisen rivin napautus-hae-vahvista-polkua.
- `updateFoodMacroEstimateButtonVisibility()`, `estimateFoodMacrosWithAI()` (nykyinen yhden-kohteen versio), ja niihin liittyvä `#food-macro-estimate-row`/`#food-macro-estimate-btn`/`#food-macro-estimate-status` HTML — poistuvat, korvautuvat Painike 1/2:lla uudessa näkymässä.
- `goToCustomFoodStep()`:n tämän illan lisäys (`foodPhotoMacroEstimate`-esitäyttö, `#custom-food-ai-hint`) — poistuu, koska kuvapolku ei enää reititä `goToCustomFoodStep()`:n kautta lainkaan. `goToCustomFoodStep()` palautuu takaisin alkuperäiseen (tyhjät kentät) muotoonsa; se palvelee edelleen erillistä, muuttumatonta "+ Lisää oma tuote" -polkua.
- `foodPhotoPendingGrams` — poistuu, koska määrä on nyt osa `foodPhotoRows`-rivin omaa dataa eikä yhden kerrallaan siirrettävä yksittäinen arvo.
- `backToFoodSearchList()` — säilyy, mutta sen kohde (`#food-search-step-photo`) sisältää nyt uuden erävahvistusnäkymän, ei vanhaa komponenttilistaa.

---

## Tausta

Nykyinen ruokakuva-polku pakottaa käyttäjän käymään jokaisen tunnistetun komponentin läpi erikseen: valitse rivi → siirry hakunäkymään → valitse Fineli-osuma tai (illalla lisätty) pyydä tekoälyarvio → vahvista määrä → tallenna → palaa listaan → toista seuraavalle riville. Käyttäjän oma kokemus: tämä on liian monivaiheinen kun kuvassa on 4-6 komponenttia. Tässä suunnitelmassa koko lista käsitellään yhdellä näkymällä: ensin yritetään löytää kaikki Finelistä automaattisesti (mutta käyttäjän aloittamana, ei täysin taustalla), sitten paikataan puuttuvat tekoälyllä, ja lopuksi tallennetaan kaikki kerralla.

---

## 1. Käyttöliittymä: erävahvistusnäkymä

Korvaa nykyisen `#food-search-step-photo`-välinäkymän sisällön (joka nyt vain listaa komponentit napautettavina rivinä) uudella rakenteella:

- **Rivilista** — jokainen rivi (sekä tekoälyn tunnistama että käyttäjän itse lisäämä) näyttää:
  - Nimi (tekstikenttä, muokattavissa)
  - Määrä grammoina (numerokenttä, muokattavissa)
  - Laskettu yhteenveto kyseiselle määrälle: `"X kcal · Yg proteiini · Zg hiilarit · Wg rasva"` (harmaa, ei-muokattava teksti) kun rivillä on makrot; muuten `"Makrot puuttuvat"` (harmaa placeholder-teksti)
  - Pieni lähdemerkintä kun makrot on täytetty: `"Fineli"` tai `"🤖 AI-arvio"`
  - Poista-painike (×) joka poistaa rivin listalta kokonaan
  - Napauttamalla yhteenvetotekstiä avautuu pieni muokkausdialogi (sama overlay+modal-tyyli kuin `openEditEntryDialog`:ssa, ks. `index.html:4572`) jossa neljä numerokenttää (kcal/proteiini/hiilarit/rasva per 100g) ovat suoraan muokattavissa — tätä tarvitaan harvoin, vain kun Fineli-osuma tai tekoälyarvio on selvästi väärä.
- **"+ Lisää rivi"** -linkki listan alla: lisää uuden tyhjän rivin (nimi + määrä käyttäjän täytettäväksi, makrot tyhjänä/puuttuvana) samaan listaan.
- **Painike 1: "Hae Finelistä"** — käy läpi jokaisen rivin jolla ei vielä ole makroja, hakee `searchFineli(rivi.nimi)` ja täyttää makrot ensimmäisestä (Finelin omalla sijoituksella parhaasta) osumasta jos tuloksia löytyy. Rivit joille ei löydy yhtään osumaa jäävät tyhjiksi.
- **Painike 2: "Arvioi tekoälyllä"** — näkyy vasta kun Painiketta 1 on painettu vähintään kerran JA listalla on vielä rivejä ilman makroja sen jälkeen. Kerää kaikki vielä-tyhjät rivit ja kutsuu `food-macro-estimate`-funktiota YHDELLÄ kutsulla koko joukolle (ks. kohta 3), täyttää palautetut arviot.
- **Painike 3: "Tallenna kaikki"** — iso, kiinnitetty näkymän alaosaan (samaan tyyliin kuin `#food-amount-add-btn`). Aktiivinen vain kun jokaisella (poistamattomalla) rivillä on makrot. Tallentaa jokaisen rivin ateriaan (ks. kohta 4), sulkee modaalin, päivittää Ruoka-sivun.

Manuaalinen tekstihaku ja "+ Lisää oma tuote" (kokonaan kuvan ohi) pysyvät täysin ennallaan — tämä muutos koskee vain kuvapolkua kuvatunnistuksen jälkeen.

---

## 2. Datamalli

Uusi moduulitason tila (korvaa nykyisen `foodPhotoComponents`-taulukon käyttötavan tässä näkymässä — taulukon MUOTO laajenee):

```js
let foodPhotoRows = []; // [{ id, name, grams, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, source, fineliId }]
let foodPhotoFineliAttempted = false; // tuliko Painiketta 1 painettua vähintään kerran
```

Rivin kentät alussa (heti kuvatunnistuksen jälkeen, per komponentti): `{ id: crypto.randomUUID(), name: component.name, grams: component.grams, kcalPer100g: null, proteinPer100g: null, carbsPer100g: null, fatPer100g: null, source: null, fineliId: null }`. `source` on `'fineli' | 'ai' | null`.

**Nimen muokkaus tyhjentää makrot:** kun rivin nimikenttä muuttuu (`onchange`/`blur`, ei jokaisella näppäimenpainalluksella) JA rivillä on jo makrot, nollataan `kcalPer100g`/`proteinPer100g`/`carbsPer100g`/`fatPer100g`/`source`/`fineliId` takaisin `null`iksi — koska makrot kuuluivat vanhalle nimelle. Näin Painike 1/2 käsittelee rivin uudelleen seuraavalla ajolla. Määrän (grams) muokkaus EI tyhjennä makroja, koska per-100g-arvot ovat määrästä riippumattomia.

---

## 3. Backend-muutos: `food-macro-estimate` taulukolliseksi

Nykyinen (tältä illalta, commit `436fb26`/`2ae3c75`) `food-macro-estimate`-funktio ottaa vastaan yhden `{image, name, grams}` ja palauttaa yhden makroarvion. Muutetaan taulukolliseksi, samaan tapaan kuin `food-photo` jo palauttaa taulukon komponentteja yhdellä Claude-kutsulla:

**Pyyntö:** `{ image: string, items: [{ name: string, grams?: number }] }`
**Vastaus:** `{ estimates: [{ kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g } | null] }` — sama järjestys ja pituus kuin `items`; `null` sille kohdalle jota Claude ei pystynyt arvioimaan (sama `null`-käsittelyongelma kuin ennenkin: `parseEstimate`in on tarkistettava eksplisiittisesti `!== null` ennen `Number.isFinite`-tarkistusta jokaiselle kentälle jokaiselle taulukon alkiolle, koska `Number(null) === 0` läpäisisi tarkistuksen muuten).

Tämä yhdistää KAIKKI puuttuvat rivit yhdeksi Claude-kutsuksi (ei yhtä kutsua per rivi) — säästää päivärajaa (`food_macro_estimate_calls`, 20/pv) ja on nopeampi. Promptin systeemiviesti päivitetään pyytämään taulukollista vastausta jokaiselle annetulle `items`-alkiolle samassa järjestyksessä.

Rajoitin (`food_macro_estimate_calls`) pysyy ennallaan — yksi rivi taulukossa yhdellä kutsulla vastaa yhtä laskuria, riippumatta siitä montako `items`-alkiota kutsu sisältää (yksi kuva/pyyntö = yksi rajoitinrivi, ei yksi per ruoka).

---

## 4. Tallennus: Painike 3

Ei uutta tallennuspolkua — jokainen rivi kulkee jo olemassa olevan reitin läpi sen `source`-kentän mukaan:

- `source === 'fineli'`: `ensureFoodCache(rivi.fineliId, rivi.name, rivi.kcalPer100g, rivi.proteinPer100g, rivi.carbsPer100g, rivi.fatPer100g)` → saatu `foodCacheId` → `addFoodLogEntry({ foodCacheId, ... })`.
- `source === 'ai'`: `createCustomFood({ name: rivi.name, kcalPer100g: rivi.kcalPer100g, ... })` → saatu `customId` → `addFoodLogEntry({ customFoodId: customId, ... })`.

Kaikki rivit käsitellään rinnakkain (`Promise.all`), kukin oma `ensureFoodCache`/`createCustomFood` → `addFoodLogEntry`-ketjunsa. Onnistumisen jälkeen: tyhjennetään `foodPhotoRows`, suljetaan modaali (`closeFoodSearch()`), päivitetään Ruoka-sivu (`renderRuoka()`) — sama loppurutiini kuin nykyisessä `confirmAddFood()`:ssa.

Jos yksittäinen rivi epäonnistuu tallennuksessa (harvinaista, esim. verkkovirhe), näytetään selkeä virhe eikä suljeta modaalia — käyttäjä näkee mikä rivi jäi tallentamatta ja voi yrittää Painiketta 3 uudelleen (jo tallennetut rivit eivät tallennu kahdesti, koska onnistuneesti tallennettu rivi poistetaan `foodPhotoRows`-listalta heti sen oman tallennuksensa onnistuttua).

---

## 5. Virhetilanteet

- Painike 1 (Fineli-haku) epäonnistuu verkkovirheeseen yksittäisen rivin kohdalla: kyseinen rivi jää tyhjäksi (kuten "ei osumaa"), muut rivit käsittelevät normaalisti — ei koko toiminnon kaatumista yhden rivin takia.
- Painike 2 (tekoälyarvio) epäonnistuu (429/502/verkkovirhe): selkeä virheviesti, rivit pysyvät tyhjinä, käyttäjä voi yrittää uudelleen tai täyttää makrot käsin muokkausdialogista.
- Painike 3 aktivoituu vasta kun kaikilla riveillä on makrot — ei tarvita erillistä "puuttuvia arvoja" -virhettä, koska painike on muuten disabloitu.

---

## Testaus

Ei automaattitestejä (projektin vakiokäytäntö). Manuaalinen läpikäynti:

1. Kuva 4-6 komponentin ateriasta → kaikki rivit näkyvät nimillä/määrillä, ei makroja vielä, Painike 3 disabloitu.
2. "+ Lisää rivi" → uusi tyhjä rivi ilmestyy, täytettävissä käsin.
3. Painike 1 → osa riveistä täyttyy Fineli-lähteellä ("Fineli"-merkintä), osa (jos ei osumaa) jää tyhjäksi.
4. Jos rivejä jäi tyhjäksi → Painike 2 ilmestyy → napautus täyttää loput yhdellä Claude-kutsulla ("🤖 AI-arvio"-merkintä).
5. Kaikki rivit täytettyinä → Painike 3 aktivoituu → napautus tallentaa kaikki, sulkee modaalin, Ruoka-sivu näyttää kaikki uudet kirjaukset oikeassa ateriassa.
6. Rivin nimen muokkaus täytön jälkeen → makrot tyhjenevät kyseiseltä riviltä, "Fineli"/"AI-arvio"-merkintä katoaa, Painike 3 disabloituu jos tämä oli viimeinen täytetty rivi.
7. Rivin poisto (×) → rivi katoaa listalta, ei vaikuta muihin, Painike 3:n aktivointiehto päivittyy.
8. Rivin makrojen käsinmuokkaus (napautus yhteenvetotekstiä) → dialogi avautuu, tallennus päivittää rivin yhteenvedon.
9. Päivärajan ylitys Painike 2:lla → selkeä virheviesti.
10. Manuaalinen tekstihaku ja "+ Lisää oma tuote" (ilman kuvaa) → toimivat täysin ennallaan, tämä näkymä ei vaikuta niihin.
