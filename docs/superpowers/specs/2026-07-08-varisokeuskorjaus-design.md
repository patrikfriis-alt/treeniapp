# Treeniapp — Värisokeuskorjaus

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 1 osa 5/5 (viimeinen). Lisää ikoni sarjataulukon rivien vertailutilan (`.set-table-row.s-*`) rinnalle, jotta tila ei riipu pelkästä väristä.
**Riippuvuudet:** Ei mitään — pelkkä CSS/markup-muutos olemassa olevaan Sali-sivun sarjataulukkoon.

---

## Tavoite

Sali-sivun sarjataulukon jokainen rivi värjätään sen mukaan miten sarja meni edelliseen kertaan verrattuna (`setStatus()`: `undone`/`worse`/`same`/`better`), mutta tila näkyy tällä hetkellä VAIN värillä (`.set-table-row.s-*` taustaväri + `.set-tnum` tekstiväri: punainen/oranssi/sininen/vihreä). Punavihersokealle (yleisin väriaistipoikkeama) etenkin `worse` (oranssi) ja `better` (vihreä) voivat näyttää lähes samalta. Tavoite: lisätä ikoni väriä täydentämään, ei korvaamaan.

## Ratkaisu

Kolmelle vertailutilalle (`worse`/`same`/`better`) lisätään symboli suoraan `.set-tprev`-tekstin eteen (kohta jossa edellisen kerran tulos näkyy, esim. "85×8"):

| Tila | Ikoni | Esimerkki |
|---|---|---|
| `worse`  | ▼ | ▼ 85×8 |
| `same`   | ● | ● 85×8 |
| `better` | ▲ | ▲ 85×8 |
| `undone` | (ei ikonia) | — |

`undone`-tila (rivi jossa sarjaa ei ole vielä kirjattu) ei ole vertailutila vaan pelkkä "tyhjä kenttä" -muistutus, joten siihen ei lisätä ikonia — punainen tausta riittää kiinnittämään huomion, eikä sitä sekoiteta muihin kolmeen väriin koska niissä KAIKISSA on nyt ikoni ja tässä ei ole.

## Toteutus

`renderTreeni()`:n sisällä (index.html:1707+), missä `prevStr` muodostetaan rivillä 1940 ja käytetään `.set-tprev`-spanissa rivillä 1951-1952, lisätään ikoni `status`-muuttujan (rivi 1939, jo laskettu `setStatus(sd, prevSet)`:lla) perusteella `prevStr`:n eteen. Ei uusia CSS-luokkia tarvita — ikoni on pelkkä tekstimerkki olemassa olevan `.set-tprev`-tekstin sisällä, perii saman (neutraalin) värin kuin muukin `.set-tprev`-teksti. Ikonin MUOTO kantaa merkityksen, ei väri — tämä on koko korjauksen ydin.

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti Sali-sivulla: neljä sarjaa neljässä eri tilassa (ei kirjattu, huonompi, sama, parempi edelliseen verrattuna) — tarkista että jokaisessa näkyy oikea ikoni (tai ei ikonia `undone`-tilassa) ikonin vieressä oleva "edellinen"-teksti pysyy luettavana.
