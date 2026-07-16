# Treeniapp (Valkku) — Edistymisnäkymät ja progressioehdotukset

**Päivämäärä:** 2026-07-16
**Laajuus:** Kaksi toisiinsa liittyvää edistymisen näkyvyyttä parantavaa lisäystä: (1) Koonti-sivulle automaattisesti poimittu "Huomioita"-osio, joka nostaa esiin 1-3 merkittävintä viimeaikaista muutosta olemassa olevasta datasta, ja (2) Sali-sivun sarjariveille esitäytetty paino/toistoehdotus edellisen kerran perusteella.
**Riippuvuudet:** Olemassa oleva `calc1RM`-Epley-funktio, olemassa olevat `body_metrics`/`sleep_data`/`step_data`/`workout_sets`-taulut, olemassa oleva Koonti-sivun renderöintilogiikka (`loadKoonti()`), olemassa oleva Sali-sivun sarjarivien renderöinti.

---

## Tausta

Käyttäjä pyysi laajennettuja edistymisnäkymiä ja progressioehdotuksia — alun perin ehdotettu neljän parannusidean joukosta, toteutus siirtyi Tekoälyvalmentajan ja Askelseurannan tieltä. Askelseurannan valmistuttua tämä on looginen seuraava projekti, koska se voi hyödyntää nyt kerättävää askeldataa yhtenä signaalina muiden joukossa.

Molemmat osat ovat itsenäisesti hyödyllisiä mutta liittyvät samaan teemaan ("näytä käyttäjälle mitä on muuttumassa, ilman että pitää itse kaivaa dataa esiin") — siksi yksi yhteinen spec/plan, ei kahta erillistä.

---

## 1. Koonti "Huomioita" -osio

Uusi pieni tekstiosio Koonti-sivulle, joka näyttää 1-3 merkittävintä viimeaikaista muutosta. Lasketaan asiakaspuolella jo ladatusta datasta (ei uusia erillisiä taustakyselyjä paitsi missä dataa ei muuten jo haettaisi Koontia varten) — jokainen sääntö joko laukeaa tai ei laukea, jokaisella Koonti-latauksella uudelleenlaskettuna.

### Säännöt

**1RM-kehitys** (per liike, `workout_sets`-datasta, Epley-kaavalla, olemassa olevaa `calc1RM`-funktiota käyttäen): jokaiselle liikkeelle jolla on sarjoja viimeisen 6 viikon aikana, verrataan parasta arvioitua 1RM:ää viimeisen 3 viikon aikana parhaaseen 1RM:ään sitä edeltävän 3 viikon aikana. Jos nousua on vähintään 3%, muodostuu huomio: *"[Liike] 1RM +X kg (3 vk)"*.

**Paino** (`body_metrics`-datasta): tarkastellaan viimeisen 3 viikon painomittauksia. Jos on vähintään 3 mittausta ja ne ovat monotonisesti samaan suuntaan (jokainen mittaus ≤ tai ≥ edellinen, ei sekaisin) ja kokonaismuutos on vähintään 1 kg, muodostuu huomio: *"Paino [laskenut/noussut] X kg viimeisen 3 viikon aikana"*.

**Uni** (`sleep_data`-datasta): jos tämän viikon keskimääräinen unen kesto poikkeaa vähintään 30 minuuttia viime viikon keskiarvosta (kummassakin viikossa oltava vähintään 3 kirjausta), muodostuu huomio: *"Uni [lyhentynyt/pidentynyt] keskimäärin X min viime viikolla"*.

**Askeleet** (`step_data`-datasta): sama viikko-viikolta-vertailu kuin unelle mutta kynnyksenä vähintään 15% suhteellinen muutos, ja vain jos molemmilla viikoilla on vähintään 3 kirjausta — käytännössä tämä huomio ei voi laueta ennen kuin dataa on kertynyt pari viikkoa (askelseuranta alkoi 2026-07-16).

### Valinta ja näyttö

Jos useampi kuin 3 sääntöä laukeaa, valitaan 3 merkittävintä muutoksen suuruuden mukaan (esim. suhteellinen prosenttimuutos). Jos yksikään ei laukea, osiota ei näytetä lainkaan — ei tyhjää tilaa tai placeholderia.

---

## 2. Sali-sivun progressioehdotus

Kun liikkeen sarjarivi avataan päivän aikana ensimmäistä kertaa, sovellus hakee saman liikkeen viimeisimmän aiemman session (`workout_sets`, suodatettu `exercise_name`:n mukaan, uusin `workout_date` ennen tätä päivää).

**"Suoritettu puhtaasti" -määritelmä** (itsenäinen, ei riipu ohjelman `target_display`-tekstikentästä joka on vapaamuotoinen kuten "3×12" eikä siksi luotettavasti jäsennettävissä): viimeisimmän session jokainen sarja teki vähintään yhtä monta toistoa kuin ensimmäinen sarja — eli toistomäärä ei laskenut sarjojen edetessä.

- **Jos suoritettu puhtaasti**: ehdotetaan edellisestä painosta **+2.5%**, pyöristettynä lähimpään 2.5 kg:aan (tavallinen levypainoinkrementti), sama toistomäärä kuin viimeksi.
- **Jos toistomäärä laski sarjojen aikana** (merkki uupumisesta): ehdotetaan **samaa painoa ja toistomäärää** kuin viimeksi, ei nousua.
- **Jos liikkeelle ei ole aiempaa sessiota**: ei ehdotusta, kentät pysyvät nykyisellä oletuksella (tyhjä/nolla, kuten nytkin).

Paino- ja toistokentät esitäytetään tällä ehdotuksella kun liikkeen sarjasyöttö avataan päivälle ensimmäistä kertaa — täysin muokattavissa, ei pakotettu.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Kirjaa puhdas sessio liikkeelle (kaikki sarjat sama tai nouseva toistomäärä) → seuraavalla kerralla paino/toistot esitäyttyvät +2.5% (pyöristetty 2.5kg:aan) ehdotuksella.
2. Kirjaa sessio jossa toistomäärä laski sarjojen aikana → seuraavalla kerralla ehdotus vastaa tarkalleen viimeisintä painoa/toistomäärää, ei nousua.
3. Avaa liike jota ei ole koskaan kirjattu → ei esitäyttöä, toimii kuten nyt.
4. Kun 1RM/paino/uni-dataa on tarpeeksi laukaisemaan vähintään yhden huomion, tarkista että Koonnin "Huomioita"-osio näyttää 1-3 relevanttia, oikein sanoitettua huomiota.
5. Kun mikään alue ei osoita merkittävää muutosta, tarkista ettei osiota näytetä lainkaan.
6. Kun askeldataa on kertynyt 2+ viikkoa, tarkista että askelhuomio voi näkyä; tarkista ettei se näy sitä ennen.
