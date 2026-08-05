# Treeniapp (Valkku) — Viikon kalorivajeen tavoite (1 % painonpudotus/vko)

**Päivämäärä:** 2026-08-05
**Laajuus:** Laajennetaan Koonnin "Tällä viikolla" -kortin olemassa oleva "Viikon kalorit" -rivi näyttämään myös tavoite: viikoittainen kalorivaje joka vastaisi 1 %:n painonpudotusta nykyisestä painosta. Ei uusia tauluja, ei uutta asetusnäkymää.
**Riippuvuudet:** Olemassa oleva `loadWeeklyReportCard()`/`getBmrInfo()`/`getExerciseCalories()`/`getFoodCalories()` (Koonti-sivun "Viikon kalorit" -laskenta), olemassa oleva `body_metrics`-taulu (paino).

---

## Tausta

"Tällä viikolla" -kortissa on jo "Viikon kalorit" -rivi joka laskee todellisen nettovajeen/-ylijäämän viikolle (`ruoka − lepoaineenvaihdunta×päivät − liikunta`). Puuttuu vertailukohta: onko tämä riittävä 1 %:n viikoittaiseen painonpudotukseen, joka on yleisesti käytetty turvallinen/kohtuullinen tavoitenopeus. Lasketaan tavoite automaattisesti tuoreimmasta Keho-painosta, samaan tapaan kuin lepoaineenvaihdunta jo lasketaan tuoreimmasta mittauksesta — ei uutta syötekenttää käyttäjälle.

---

## 1. Laskentakaava

```
tavoiteltu viikkopudotus (kg) = tuorein paino (kg) × 0.01
tavoiteltu viikon kalorivaje (kcal) = tavoiteltu viikkopudotus (kg) × 7700
```

`7700 kcal/kg` on yleisesti käytetty arvio yhden kilon rasvakudoksen energiasisällöstä. Tavoite lasketaan aina täydelle 7 päivän viikolle riippumatta siitä onko viikko vielä kesken tai mennyttä — sama periaate kuin lepoaineenvaihdunnan laskenta jo käyttää tuoreinta painoa riippumatta katsotusta viikosta.

---

## 2. Datan haku: `getBmrInfo()` laajennus

`getBmrInfo()` hakee jo tuoreimman `body_metrics.weight_kg`-rivin BMR-laskentaan mutta ei palauta sitä kutsujalle. Lisätään paluuarvoon `weightKg`-kenttä (ei muuteta olemassa olevaa `bmr`/`missingProfile`/`missingWeight`-rakennetta, pelkkä lisäys):

```js
return { bmr: calcBmr(profile, weightRow), weightKg: weightRow.weight_kg, missingProfile: false, missingWeight: false };
```

---

## 3. Käyttöliittymä: "Viikon kalorit" -rivin laajennus

`loadWeeklyReportCard()`:ssa, kohdassa jossa `weeklyNet` jo lasketaan (rivi joka tuottaa "Viikon kalorit"-rivin), lisätään tavoite jos `bmrInfo.weightKg` on saatavilla:

```js
const goalWeeklyDeficit = Math.round(bmrInfo.weightKg * 0.01 * 7700);
```

Rivin arvo näytetään muodossa `<todellinen> / <tavoite> kcal`, samaa "toteuma / tavoite" -konventiota käyttäen kuin sovelluksessa jo muualla (esim. Ruoka-sivun viikkorivi):

```
Viikon kalorit   −3200 / −8755 kcal
```

Jos `bmrInfo.weightKg` puuttuu (ei painomittausta), näytetään rivi kuten nykyään — pelkkä todellinen nettoarvo, ei tavoitetta. Sama ehto kuin nykyinen `bmrInfo.bmr != null` -tarkistus, joten ei uusia virhetiloja.

---

## 4. Ei muutoksia muualle

- Ruoka-sivun olemassa oleva "Viikko"-rivi (`weekly_kcal`-ravintotavoite) pysyy täysin ennallaan — se on eri käsite (raaka syöntibudjetti, ei BMR/liikunta-korjattu vaje).
- Koonnin "päivän kalorit" (päivittäinen nettoarvo) ja sen 7 päivän palkkikaavio-modaali pysyvät ennallaan.
- Ei uutta asetusnäkymää — 1 %-kerroin on kiinteä koodissa (ei käyttäjän muokattavissa tässä vaiheessa).

---

## Testaus

Ei automaattitestejä (projektin vakiokäytäntö). Manuaalinen läpikäynti:

1. Profiili ja paino asetettuna → Koonti, "Tällä viikolla" -kortti → "Viikon kalorit" -rivi näyttää sekä todellisen nettoarvon että tavoitteen (`paino × 0.01 × 7700`, pyöristettynä).
2. Tarkista laskelma käsin tunnetulla painolla (esim. 113.7 kg → tavoite ≈ −8755 kcal).
3. Profiili tai paino puuttuu → rivi käyttäytyy kuten ennen muutosta (ei tavoitetta, ei virhettä, ei kaadu).
4. Vaihda viikkoa nuolilla (`wOff`) → tavoite pysyy samana (perustuu aina tuoreimpaan painoon, ei kyseisen viikon painoon) — tarkoituksellinen yksinkertaistus.
5. Kortin muut rivit (salikerrat, aktiviteettikerrat, km, uni, painon muutos) ja niiden alla näytettävät huomiot (`kc-weekly-insights`) pysyvät muuttumattomina.
