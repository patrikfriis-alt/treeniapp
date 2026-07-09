# Treeniapp — Raportointi, motivointi & Koonti-kiillotus

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 2 osat 2-4 yhdistettynä (kohdat 8, 9, 10, 11, 14, 15 — 14 pistettä). Kohta 17 (Kehitys-välilehtien syvyys, 2p) jätetty pois, koska se oli alkuperäisessä katselmoinnissa merkitty tarkkailukohteeksi, ei rakennustehtäväksi.
**Riippuvuudet:** Käyttää olemassa olevia `activity_data`-, `workout_sets`-, `body_metrics`- ja `sleep_data`-tauluja. Ei uutta migraatiota.

---

## 1. "Tällä viikolla" -kortti (kohdat 8+9)

Uusi kortti Koonti-sivun loppuun, olemassa olevien korttien alle. Kaksi osaa: viikkomittarit ja oivallukset.

### 1.1 Viikkomittarit

Neljä riviä, jokaisessa tämän viikon arvo + muutos edelliseen viikkoon (paitsi painolla):

- **Salikertoja**: `workout_sets`-taulusta uniikkien `workout_date`-arvojen määrä viikolta (sama laskenta kuin nykyinen `loadWeekSummary()`:n `gymDays`). Delta: sama laskenta edelliselle viikolle (`wOff - 1`).
- **Aktiviteettikertoja**: `activity_data`-rivien määrä viikolta (sama kuin nykyinen `ws-act`). Delta: sama edelliselle viikolle.
- **Kilometrit**: `activity_data.distance_km` summattuna viikolta (uusi laskenta, ei aiemmin näkyvissä missään). Delta: sama edelliselle viikolle.
- **Unen keskiarvo**: `sleep_data.duration_min` keskiarvo viikolta (sama kuin nykyinen `ws-sleep`). Delta: sama edelliselle viikolle.
- **Painon muutos**: `body_metrics`-taulun viikon ensimmäinen ja viimeinen mittaus, delta = viimeisin − ensimmäinen. Ei erillistä toista deltaa (painon muutos ON jo delta-arvo — vertailu edelliseen viikkoon tekisi siitä sekavan "muutoksen muutoksen").

Rivi piilotetaan jos kyseiselle mittarille ei ole dataa kummallakaan viikolla (esim. painomittauksia ei ole tehty).

### 1.2 Oivallukset

Näkyy vain jos jompikumpi seuraavista osuu, omana pienenä huomiorivinä kortin alaosassa (voi näkyä molemmat yhtä aikaa):

- **"🏆 Paras juoksuviikkosi 3 kk aikana"**: lasketaan `activity_type = 'Juoksu'` -rivien `distance_km`-summa per ISO-viikko viimeisen 12 viikon ajalta (kuluva + 11 edellistä). Näytetään jos kuluvan viikon summa on korkein näistä 12:sta JA summa > 0 JA vähintään 4 aiemmasta viikosta löytyy dataa (ettei "paras viikko" näy triviaalisti tyhjän historian takia).
- **"📊 [Liike] ei ole edistynyt 3 viikkoon"**: kuluvalla viikolla harjoitellulle liikkeelle (esiintyy tämän viikon `workout_sets`-riveissä) lasketaan maksimipaino per ISO-viikko viimeisen 3 viikon ajalta. Jos 3 viikkoa sitten maksimi oli yhtä suuri tai suurempi kuin nyt (ei edistystä koko jaksolla) JA kaikilta kolmelta viikolta löytyy dataa kyseiselle liikkeelle, näytetään huomio ensimmäisestä tällaisesta liikkeestä (ei listata kaikkia, pidetään huomio yksittäisenä).

---

## 2. Streak- ja PR-juhlistus (kohdat 10+11)

Uusi jaettu toast-komponentti: liukuu sisään näytön yläreunasta, häviää itsestään ~4 sekunnin kuluttua. Ei aiempaa vastaavaa infrastruktuuria sovelluksessa — tämä on uusi, pieni, yleiskäyttöinen `showCelebrationToast(icon, title, sub)` -funktio.

### 2.1 Streak-juhlistus

Laukeaa `loadMotivationSummary()`:n streak-laskennan yhteydessä, kun streak saavuttaa virstanpylvään. Virstanpylväät: 7, 14, 30, 50, 100, ja siitä eteenpäin joka 50. (esim. 150, 200, 250...). Näytetään kertaalleen per virstanpylväs: `localStorage`-avain (`celebratedStreak`) tallentaa viimeksi juhlitun virstanpylvään, jotta sama ilmoitus ei toistu joka kerta kun sovellus avataan samana päivänä tai selainta vaihdettaessa (uudessa selaimessa/laitteessa ilmoitus voi näkyä uudelleen kerran — hyväksyttävää, koska streak-tila on jo muutenkin vain paikallisesti laskettu näyttöä varten, ei kriittinen synkronoitava tila).

### 2.2 PR-juhlistus

Sali-sivulla on jo staattinen "PR"-badge liikkeen otsikon vieressä (`isPR`-tarkistus `renderTreeni()`:ssä), mutta se päivittyy vain kokonaisrenderöinnissä, ei live kun käyttäjä syöttää arvoja. Toast vaatii live-tarkistuksen: `saveSet()`-funktioon lisätään tarkistus joka kerta kun kg- tai reps-kenttä tallennetaan — jos tämän hetken sarjojen maksimipaino kyseiselle liikkeelle ylittää edellisen session maksimin (`prevCache[ex.n]`), JA tätä liikettä ei ole vielä juhlittu tällä sivulatauksella (in-memory `Set`, ei persistoitu — nollautuu sivun uudelleenlatauksessa, mikä on hyväksyttävää koska badge jää pysyvästi näkyviin muistuttamaan), näytetään toast: "🏆 Uusi ennätys! [Liike] [paino]kg".

---

## 3. Koonti-korttien hierarkia (kohta 14)

**Sali-kortti** (ainoa jolla on olemassa oleva "kesken"-käsite paikallisen `isStarted()`/`isDone()`-tilan kautta): kolme visuaalista tilaa:
- **Tehty**: vihreä taustavärisävy + vihreä reunus + ✓-merkki kortin oikeassa yläkulmassa.
- **Kesken** (`isStarted(0, todayIndex, st) === true` ja `isDone(...) === false`): sininen taustavärisävy + sininen reunus + pieni piste-indikaattori.
- **Ei vielä**: nykyinen neutraali ulkoasu, ei muutosta.

**Muut neljä korttia** (Aerobinen, Keho, Uni, Ruokailu): kaksi tilaa, sama vihreä tausta+reunus+✓ "tehty"-tilalle kuin Sali-kortilla, muuten neutraali. Ei "kesken"-tilaa näille — mikään niistä ei tällä hetkellä erota "aloitettu muttei valmis" -tilaa datamallissa.

---

## 4. Skeleton-loaderit (kohta 15)

Kaikki viisi Koonti-korttia (Sali, Aerobinen, Keho, Uni, Ruokailu) näyttävät sykkivän harmaan placeholder-ulkoasun (`shimmer`-animaatio) heti sivun HTML:ssä, korvautuen oikealla sisällöllä sitä mukaa kun kunkin kortin oma osakysely `loadKoonti()`:ssa valmistuu — ei odoteta kaikkien viiden valmistumista yhtä aikaa. Sama malli sovelletaan myös uuteen "Tällä viikolla" -korttiin (kohta 1).

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Koonti-sivulla tarkistetaan skeleton-tila hetkellisesti sivun latautuessa (voi vaatia verkon hidastamista DevToolsissa nähdäkseen selvästi), sitten että jokainen kortti korvautuu oikealla datalla.
2. "Tällä viikolla" -kortti näyttää kaikki neljä mittaria oikeilla deltoilla verrattuna manuaalisesti laskettuun Supabase-dataan.
3. Oivallukset: simuloidaan tilanne jossa viikon km on korkein 12 viikkoon (tai todetaan ettei osu, jos ei ole realistista testidataa) ja jossa jokin liike ei ole edistynyt 3 viikkoon.
4. Streak-toast: asetetaan `localStorage`-tila niin että seuraava lataus ylittää virstanpylvään, tarkistetaan toast näkyy ja katoaa itsestään; ladataan sivu uudelleen, tarkistetaan ettei toast näy toiseen kertaan.
5. PR-toast: Sali-sivulla syötetään liikkeelle paino joka ylittää edellisen session maksimin, tarkistetaan toast näkyy välittömästi kentän tallennuksen yhteydessä.
6. Koonti-korttien tilat: Sali-kortti kolmessa tilassa (ei aloitettu, aloitettu muttei tehty, tehty), muut kortit kahdessa tilassa.
