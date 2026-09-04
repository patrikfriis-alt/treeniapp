# Treeniapp — Treenilogin päivävihje ja sarjan/liikkeen valmis-merkintä

**Päivämäärä:** 2026-09-04
**Laajuus:** (1) Vihje/pikanäppäin, joka ohjaa käyttäjän käyttämään olemassa olevaa "Päivän tyyppi" -valitsinta kun hän katsoo kuluvan viikon ei-tämänpäiväistä välilehteä, sekä (2) selkeä valmis-merkintä yksittäiselle sarjalle ja koko liikkeelle treenilogissa.
**Riippuvuudet:** `renderTreeni()`, `renderSession()`, `getActiveSession()`, `setActiveSession()`, `day_session_overrides`-taulu (ei muutoksia), `aDay`/`wOff`-tila, `DAYS`-vakio, `isDone()`/`isStarted()`, `saveSet()`, `ex-block`/`set-table-row`-CSS.

---

## Tausta

2026-09-04: käyttäjä teki salitreenin torstaina (2026-09-03), mutta oli treenilogissa "Maanantai"-välilehdellä (koska halusi tehdä viikon vielä tekemättömän t1-ohjelman). Kaikki sarjat tallentuivat `workout_date = 2026-08-31` (maanantai), ei todelliselle treenipäivälle. Data oli teknisesti tallessa, mutta ei näkynyt missään "tänään/eilen"-näkymässä. Data korjattiin manuaalisesti (`UPDATE ... workout_date = '2026-09-03'`).

Tutkimuksessa selvisi, että sovelluksessa on jo tismalleen tähän tarkoitettu ominaisuus: jokaisen päivän treeninäkymässä näytettävä "Päivän tyyppi" -valitsin (`setActiveSession(o,d,st)`), joka kirjoittaa `day_session_overrides`-tauluun ja vaihtaa **kyseisen kalenteripäivän** ohjelman toiseksi — pysyvästi kyseiselle päivämäärälle, ei vain kertaluontoisesti. Jos käyttäjä olisi pysynyt tämän päivän (torstain) välilehdellä ja valinnut sieltä "t1", data olisi tallentunut oikealle päivälle automaattisesti, koska `workout_date` lasketaan aina auki olevan välilehden (`wOff`+`aDay`) mukaan, ei valitun ohjelmatyypin mukaan.

Ongelma ei siis ole puuttuva ominaisuus vaan sen huono löydettävyys: mikään ei kehota käyttäjää käyttämään "Päivän tyyppi" -valitsinta silloin kun hän on menossa navigoimaan väärälle päivälle vain saadakseen tietyn ohjelman auki.

Toinen, tästä riippumaton käyttäjän raportoima ongelma: treenilogissa ei ole selkeää tapaa nähdä yhdellä vilkaisulla, mitkä sarjat (ja mitkä koko liikkeet) on jo tehty — tällä hetkellä ainoa vihje on se, että KG/toistot-kentät sattuvat olemaan täytettyjä.

## 1. Päivävihje kuluvalla viikolla

**Laukaisuehto** (tarkistetaan `renderTreeni()`:ssä joka renderöinnillä):
- `wOff === 0` (ollaan kuluvalla viikolla — ei mennä nykyisillä viikoilla taaksepäin selatessa, se on eri käyttötarkoitus: vanhan datan tarkastelu/korjaus, ei elävä kirjaus)
- valittu päivä (`aDay`) **ei** ole tämä päivä (`!isToday`, sama laskenta kuin nykyinen `dayLabel`-logiikka rivillä ~2930)
- kyseisen päivän ohjelmalla on liikkeitä (`sess && sess.ex && sess.ex.length`) — ei näytetä lepopäivillä
- kyseistä sessiota **ei** ole vielä merkitty tehdyksi (`!isDone(wOff, aDay, st)`) — valmiiksi tehtyä päivää selatessa ei vihjata, se on pelkkää katselua

**Ulkoasu**: kapea huomiobanneri hero-kortin yläpuolella, esim.:

> ⚠️ Tämä on **Maanantai 31.8.** -treeni, ei tämän päivän.
> [ Tee tämä ohjelma tänään sen sijaan → ]

**Napin toiminta** (`catchUpToday()`, uusi funktio):
1. Lue tapetun välilehden ohjelmatyyppi: `const st = getActiveSession(wOff, aDay);`
2. `await setActiveSession(wOff, todayIdx(), st)` — kirjoittaa `day_session_overrides`-tauluun (**olemassa oleva** funktio, ei muutoksia siihen)
3. `aDay = todayIdx();`
4. `renderTreeni()`

Tämän jälkeen käyttäjä on automaattisesti tämän päivän välilehdellä, jolla on nyt valitun ohjelman liikkeet — kaikki tästä eteenpäin kirjattava data tallentuu oikein `workout_date`:lle = tänään. Banneri ei enää näy, koska `isToday` on nyt tosi.

**Ei estoa**: banneri on pelkkä vihje, ei lukitse mitään. Käyttäjä voi yhä kirjata sarjoja suoraan ei-tämänpäiväiselle välilehdelle jos niin haluaa (esim. korjaamassa unohtunutta merkintää kyseiselle päivälle) — inputit eivät disabloidu, ainoastaan banneri kehottaa vaihtoehtoiseen tapaan.

## 2. Sarjan valmis-merkintä

Jokainen `set-table-row` saa nykyisen suoritustason ilmaisimen (`s-worse`/`s-same`/`s-better`, pysyy ennallaan — se vertaa edelliseen kertaan) **lisäksi** oman valmis/ei-valmis-tilan:

- **Valmis** kun sekä KG- että toistot-kenttä sisältävät kelvollisen arvon (sama ehto kuin nykyinen `doneCount`-laskenta rivillä ~3153-3156).
- Visuaalinen merkki: sarjanumero-ympyrä (`set-tnum`) saa vihreän täytön ja ✓-merkin numeron tilalle (tai rinnalle) kun valmis; muuten pysyy neutraalina numerona.
- Ei vaikuta olemassa olevaan edellisen kerran vertailunuoleen (▼/●/▲) — ne näytetään rinnakkain, eri asia (suoritustaso vs. onko tehty).

## 3. Liikkeen valmis-merkintä

Kun kaikki liikkeen sarjat ovat valmiit (`doneCount === ex.s`, sama muuttuja joka jo laskee progress-palkin arvon `ex-block-progress`-osiossa):

- Liikkeen otsikkoon (`ex-block-title`) lisätään ✓-merkki nykyisen PR-badgen viereen.
- Progress-palkin täyttö (`ex-block-prog-fill`) vaihtuu vihreäksi (nykyinen neutraali väri → vihreä kun 100%).
- Ei muuta rakennetta — pelkkä ehdollinen CSS-luokka (`ex-block done`) olemassa olevien elementtien päälle.

## 4. Data ja tila

**Ei muutoksia tietokantaan.** Kaikki kolme kohtaa ovat puhtaasti front-end-logiikkaa olemassa olevien funktioiden/kenttien päällä:
- Kohta 1 käyttää olemassa olevaa `setActiveSession()`/`day_session_overrides`-mekanismia sellaisenaan.
- Kohdat 2-3 lukevat jo laskettua `doneCount`/`ex.s`-dataa, eivät tarvitse uutta hakua.
- Ei uutta pysyvää tilaa (esim. ei uutta `LD`-avainta) — banneri lasketaan joka renderöinnillä suoraan `wOff`/`aDay`/`isDone()`-arvoista.

## Rajaus

- Ei muutoksia menneiden viikkojen (`wOff !== 0`) välilehtikäyttäytymiseen — historian selaus/korjaus pysyy nykyisellään, ei banneria.
- Ei estetä suoraa kirjaamista ei-tämänpäiväiselle välilehdelle — pelkkä vihje, ei lukko.
- Ei muutoksia `day_session_overrides`-taulun semantiikkaan (pysyy päivämääräkohtaisena pysyvänä korvikkeena, kuten nyt).
- Ei muutoksia `activity_data`/`workout_sessions`/`workout_sets`-skeemaan.
- Ei kosketa Kestävyystavoitteet-korttia tai muita aiemmin toteutettuja päivä-stripejä.

---

## Testaus

Ei automaattitestejä (front-end-only UI-muutos ilman testikehystä projektissa). Manuaalinen läpikäynti selaimessa:

1. Avaa treenilogi kuluvalla viikolla, valitse tämän päivän välilehti — tarkista ettei banneria näy.
2. Vaihda välilehti johonkin toiseen kuluvan viikon päivään, jolla on ohjelmoitu liikkeitä eikä sitä ole vielä merkitty tehdyksi — tarkista että banneri näkyy oikealla päivän nimellä/päivämäärällä.
3. Paina bannerin nappia — tarkista että näkymä hyppää automaattisesti tämän päivän välilehdelle, ohjelma on vaihtunut oikeaksi (sama liikelista kuin äsken katsotulla päivällä), ja `day_session_overrides`-tauluun on tullut/päivittynyt rivi tälle päivämäärälle.
4. Kirjaa sarja tällä (nyt tämän päivän) välilehdellä — tarkista Supabasesta että `workout_sets.workout_date` on tämä päivä, ei alkuperäinen.
5. Navigoi ei-tämänpäiväiselle välilehdelle, jolla ohjelma on jo merkitty tehdyksi — tarkista ettei banneria näy (pelkkä katselu, ei vihjettä).
6. Navigoi lepopäivälle (ei liikkeitä) — tarkista ettei banneria näy.
7. Navigoi menneelle viikolle (`wOff !== 0`) — tarkista ettei banneria näy millään päivällä, riippumatta valmiustilasta.
8. Täytä liikkeen kaikki sarjat (KG+toistot) yksi kerrallaan — tarkista että kunkin sarjan numero-ympyrä muuttuu heti vihreäksi/✓:ksi kun molemmat kentät on täytetty, ja että koko liikkeen otsikkoon ilmestyy ✓ vasta kun kaikki sarjat on täytetty ja progress-palkki värjäytyy vihreäksi.
9. Tyhjennä yksi jo täytetty sarja (poista arvo kentästä) — tarkista että sekä sarjan että liikkeen valmis-merkintä poistuu vastaavasti.
10. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
