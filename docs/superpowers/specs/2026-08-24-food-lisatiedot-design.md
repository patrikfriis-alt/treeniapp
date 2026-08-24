# Treeniapp (Valkku) — Laajennettu ravintoainetieto per ruoka ("Lisätiedot")

**Päivämäärä:** 2026-08-24
**Laajuus:** Uusi laajennettu ravintoainetietonäkymä ruoan määräaskeleeseen (fineli-haetuille ruoille) sekä vastaavat valinnaiset kentät oman tuotteen lomakkeeseen. Kattaa taustalla tarvittavan skeemalaajennuksen, kertaluontoisen Fineli-datan tuontiskriptin ja UI:n.
**Riippuvuudet:** Olemassa oleva `fineli_foods`-taulu ja sen sisältämät `fiber_per_100g`/`sugar_per_100g`/`salt_per_100g`-sarakkeet, `food_cache`-/`custom_foods`-taulut, `searchFineli()`, `ensureFoodCache()`, `createCustomFood()`, `loadFoodDayEntries()`, määräaskeleen `updateFoodAmountPreview()`, oman tuotteen `CUSTOM_FOOD_LABELS`/`setCustomFoodEntryMode()`-malli. Sulamo-vertailun backlogin kohta 5 (ks. `project_sulamo_comparison_backlog`-muisti), seuraa kohtaa 4 ("beyond macros" -ravintoainepalkki, ks. `2026-08-21-nutrient-strip-design.md`).

---

## Tausta

Sulamo.fi:n ruoka-item-detail-näkymä näyttää huomattavasti enemmän kuin makrot: valmistustapa (raaka/prosessoitu), kuitu, sokeri (kokonais- vs. teollinen), rasva jaoteltuna tyydyttyneeseen/kerta-/moni­tyydyttymättömään/transrasvaan, suola JA natrium erikseen, kalsium, kalium, magnesium, rauta, sinkki, C- ja D-vitamiini, kasvis-%:na ja tuore-vihannes-lippuna. Treeniappin ruokahaku näyttää tällä hetkellä vain kcal/proteiini/hiilarit/rasva (plus kuitu/sokeri/suola summana päivätasolla, ei per-ruoka-näkymässä).

Alkuperäinen backlog-merkintä ei tiennyt mitä näistä Fineli-data oikeasti tarjoaa. Selvitys (2026-08-24) vahvisti Fineli-avoindatan (Release 18, THL, CC-BY 4.0) sisällön `component.csv`:n kautta (kolmannen osapuolen GitHub-peilaus `mafredri/fineli-sql`, joka julkaisee THL:n virallisen datan muuttamattomana):

- **Saatavilla:** rasvan jaottelu (`FASAT`/`FAMCIS`/`FAPU`/`FATRN`), natrium erikseen suolasta (`NA` vs. `NACL`, molemmat mg), kalsium/kalium/magnesium/rauta/sinkki (`CA`/`K`/`MG`/`FE`/`ZN`), C- ja D-vitamiini (`VITC`/`VITD`), sekä valmistustapaluokitus (`food.csv`:n `PROCESS`-sarake, esim. `RAW`, `BAK`, `BOIL`, `IND`).
- **Ei saatavilla missään lähteessä:** kasvis-%, tuore-vihannes-lippu, teollisen sokerin erottelu kokonaissokerista (Fineli tarjoaa vain kokonaissokerin `SUGAR` sekä yksittäiset sokerit fruktoosi/galaktoosi/glukoosi/laktoosi/maltoosi/sukroosi — ei jaottelua lisätty-vs-luonnollinen).
- Vahva viite että nykyinen `fineli_foods`-taulu on peräisin juuri tästä samasta datasetistä: `NACL`-yksikkö (mg) täsmää äskettäin korjattuun suola-yksikköbugiin (`9d519e2`).
- `fineli.fi` on tällä hetkellä Cloudflare-botintorjunnan takana (403 myös selaimen User-Agentilla) — live-API:a tai sivuston omaa latauspakettia ei voi hakea automaattisesti. GitHub-peilaus on siis käytännössä ainoa automatisoitavissa oleva lähde.

Kasvis-% ja teollinen-sokeri-erottelu jätetään pois laajuudesta — niille ei ole rehellistä datalähdettä.

## 1. Datalähde ja tuonti

Kertaluonteinen (mutta uudelleenajettava) Node-skripti `scripts/import-fineli.mjs`, joka:

1. Hakee `food.csv` ja `component_value.csv` osoitteesta `raw.githubusercontent.com/mafredri/fineli-sql/master/data/Fineli_Rel18_open/`.
2. Poimii `component_value.csv`:stä rivit joiden `EUFDNAME` ∈ `{FASAT, FAMCIS, FAPU, FATRN, NA, CA, K, MG, FE, ZN, VITC, VITD}`, pivotoi `FOODID`:n mukaan.
3. Poimii `food.csv`:stä `FOODID` → `PROCESS`-mapin.
4. Generoi `UPDATE fineli_foods SET <sarake> = <arvo> WHERE id = <FOODID>` -lauseet vain niille riveille joilla arvo löytyy — **ei koske olemassa oleviin kcal/protein/carbs/fat/fiber/sugar/salt-arvoihin**, ei myöskään lisää uusia `fineli_foods`-rivejä (ruoat joita paikallisessa taulussa ei entuudestaan ole, jäävät tuomatta — sama riski kuin alkuperäisessä kuitu/sokeri/suola-tuonnissa, ei tämän spekin piirissä korjata).
5. Ajetaan kerran manuaalisesti tämän ominaisuuden käyttöönoton yhteydessä; skripti jää repoon dokumentoiduksi, jotta se voidaan ajaa uudelleen jos `fineli_foods`-riviä laajennetaan tulevaisuudessa.

## 2. Skeema

Uusi migraatio lisää nullable `numeric`-sarakkeet sekä `fineli_foods`-, `food_cache`- että `custom_foods`-tauluihin:

`sodium_per_100g`, `fat_saturated_per_100g`, `fat_mono_per_100g`, `fat_poly_per_100g`, `fat_trans_per_100g`, `calcium_per_100g`, `potassium_per_100g`, `magnesium_per_100g`, `iron_per_100g`, `zinc_per_100g`, `vitamin_c_per_100g`, `vitamin_d_per_100g`.

Lisäksi nullable `text`-sarake `process_code` — **vain `fineli_foods`- ja `food_cache`-tauluihin**, ei `custom_foods`-tauluun (käyttäjän omalle tuotteelle ei ole mielekästä tapaa itse luokitella valmistustapaa Fineli-tyylisesti).

Ei muutoksia `food_log_entries`-tauluun — sama malli kuin kuitu/sokeri/suola-ominaisuudessa.

Yksiköt (natiivi Fineli-yksikkö → sovelluksen näyttöyksikkö, muunnos `searchFineli()`:ssä samalla mallilla kuin suola mg→g-korjauksessa):

| Kenttä | Fineli-yksikkö | Näyttöyksikkö |
|---|---|---|
| Rasvan jaottelu (4 kpl) | g | g (ei muunnosta) |
| Natrium | mg | mg (ei muunnosta) |
| Kalsium/kalium/magnesium/rauta/sinkki | mg | mg (ei muunnosta) |
| C-vitamiini | mg | mg (ei muunnosta) |
| D-vitamiini | µg | µg (ei muunnosta) |

(Vain suola tarvitsi aiemmin mg→g-muunnoksen, koska sen viitearvo ilmoitetaan grammoina; loput kentät näytetään Fineli-natiivissa yksikössään, kuten ravintosisältömerkinnöissä yleensä.)

## 3. Tietovirta

- **`searchFineli()`**: lisää 12 uutta saraketta + `process_code` hakukyselyyn, välittää `foodModalSelected`-objektiin.
- **`ensureFoodCache()`**: saa vastaavat uudet parametrit, kirjoittaa `food_cache`-upsertin mukana.
- **`createCustomFood()`**: saa 12 uutta **valinnaista** parametria (ei `process_code`:a).
- **`loadFoodDayEntries()`**: molemmat liitoshaut saavat uudet sarakkeet valintalistaansa (tarvitaan Lisätiedot-näkymän täyttöön kun ruoka on jo kirjattu — ei pelkkää hakuvaihetta varten).
- Ei uusia summa-apufunktioita (`entryX()`-tyyliä) — nämä kentät näytetään per-ruoka, ei päivätason summana, joten laskenta on suoraan `foodModalSelected.<kenttä> × grams / 100` samalla mallilla kuin `updateFoodAmountPreview()`.

## 4. UI — määräaskel

Uusi supistettava "▸ Lisätiedot" -osio olemassa olevan kcal/proteiini/hiilarit/rasva-esikatselurivin alle, määräaskeleessa (`food-search-step-amount`). Oletuksena kiinni, avautuu napautuksesta. Sisältö jaoteltu otsikoituihin alaosioihin, samaan tapaan kuin Sulamolla:

- **Hiilihydraatit**: kuitu, sokeri (arvot ovat jo `foodModalSelected`:ssa päiväyhteenvedon takia, mutta niitä ei tähän asti ole näytetty per-ruoka-tasolla lainkaan — tässä ensimmäinen kerta kun ne näkyvät määräaskeleessa)
- **Rasvat**: tyydyttynyt, kertatyydyttymätön, monityydyttymätön, trans
- **Kivennäisaineet**: natrium, suola (suola samoin jo olemassa taustalla, näytetään nyt ensimmäistä kertaa per-ruoka), kalsium, kalium, magnesium, rauta, sinkki
- **Vitamiinit**: C-vitamiini, D-vitamiini

Sekä erillinen valmistustapa-badge otsikon alla (ei osiona): `process_code === 'RAW'` → 🟢 "Käsittelemätön", muu arvo → 🟠 "Prosessoitu", `null` → badge piilotettu kokonaan.

Kaikki arvot skaalautuvat elävästi gramma-kentän mukana, kuten nykyinenkin esikatselu. **Jos kentän arvo on `null`, rivi piilotetaan kokonaan — ei näytetä "0":na**, koska Fineli ei kata kaikkia ravintoaineita jokaiselle ruoalle, ja nollan näyttäminen väittäisi virheellisesti ettei ruoka sisällä kyseistä ainetta lainkaan.

Omalle tuotteelle (custom food) sama Lisätiedot-osio näytetään samalla logiikalla (null-kentät piilossa), mutta ilman valmistustapa-badgea.

## 5. UI — oman tuotteen lomake

Lomake saa 12 uutta valinnaista kenttää, ryhmiteltynä kahteen oletuksena kiinni olevaan supistettavaan alaosioon olemassa olevien kenttien (kcal/proteiini/hiilarit/rasva/kuitu/sokeri/suola) alle:

- **"Rasvat"**: tyydyttynyt/100g (tai /annos), kertatyydyttymätön, monityydyttymätön, trans
- **"Kivennäisaineet ja vitamiinit"**: natrium, kalsium, kalium, magnesium, rauta, sinkki, C-vitamiini, D-vitamiini

Sama per-100g/per-annos-nimilogiikka kuin `CUSTOM_FOOD_LABELS`/`setCustomFoodEntryMode()`:ssä — laajennetaan olemassa olevaa mappia näillä 12 kentällä samalla rakenteella. Tyhjäksi jätetty kenttä tallentuu `null`:ina, sama "ei seurattu, ei nolla" -periaate kuin kuitu/sokeri/suola-kentissä.

## 6. Rajaus

- Ei kasvis-%:a, ei tuore-vihannes-lippua, ei teollinen-vs-luonnollinen-sokeri-erottelua — ei datalähdettä kummallekaan.
- Ei muutoksia `food_log_entries`-skeemaan, ei taannehtivaa datakorjausta vanhoille kirjauksille.
- Ei uutta päivätason yhteenvetokorttia (eri asia kuin kohta 4:n ravintoainepalkki) — tämä on per-ruoka-näkymä.
- Ei valmistustapa-luokittelua omille tuotteille.
- Tuontiskripti täydentää vain olemassa olevia `fineli_foods`-rivejä; ei tuo uusia Fineli-ruokia jotka puuttuvat paikallisesta taulusta kokonaan.
- Ei muutoksia viitteellisiin päiväarvoihin/tavoitteisiin näille uusille ravintoaineille (ei esim. rauta-tavoitepalkkia) — pelkkä informatiivinen näyttö.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Aja tuontiskripti kehitysympäristöä vasten, tarkista pistokokein muutama tunnettu ruoka (esim. maitotuote — tarkista kalsium-arvo järkeväksi; kasvisöljy — tarkista rasvajaottelu järkeväksi).
2. Hae ja valitse Fineli-ruoka jolla tunnetusti on kattavat arvot (esim. täysjyväleipä) — avaa Lisätiedot, tarkista että kaikki neljä osiota näyttävät järkeviä arvoja jotka skaalautuvat gramma-kentän mukana.
3. Hae ruoka jolta puuttuu joku yksittäinen arvo (esim. D-vitamiini) — tarkista että kyseinen rivi on piilossa eikä näy "0":na.
4. Tarkista valmistustapa-badge sekä raaka- (esim. hedelmä) että prosessoidulle (esim. valmisruoka) ruoalle, sekä tapaus jossa `process_code` puuttuu (badge piilossa).
5. Luo oma tuote täyttäen kaikki 12 uutta kenttää, kirjaa se — tarkista Lisätiedot-näkymä logatulle kirjaukselle.
6. Luo oma tuote jättäen uudet kentät tyhjäksi — tarkista ettei Lisätiedot-osio näytä mitään uusista kentistä (ei nollia) eikä kirjaus riko mitään.
7. Vaihda per-100g/per-annos-tilaa oman tuotteen lomakkeella, tarkista että kaikkien 12 uuden kentän otsikot vaihtuvat oikein.
8. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
