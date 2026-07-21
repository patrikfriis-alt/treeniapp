# Treeniapp — Deload/ylikuormitushuomiot

**Päivämäärä:** 2026-07-21
**Laajuus:** Kaksi uutta huomiotyyppiä olemassa olevaan Koonti-sivun "Huomioita"-osioon (`loadHuomioita()`, index.html:2067): (1) unipisteiden lasku, (2) treenimäärän ja unipisteiden yhteisvaikutus (mahdollinen ylikuormitus). Ensimmäinen kolmesta käyttäjän hyväksymästä ominaisuudesta (2: viikkokooste-push, 3: rasvaprosentti/lihasprosentti-seuranta seuraavat omina sykleinään).
**Riippuvuudet:** Olemassa oleva `loadHuomioita()`-logiikka ja sen `insights`-taulukko (`{text, magnitude}`-rakenne, top 3 näytetään), olemassa oleva `calcSleepScore()` (unipisteet), olemassa olevat `workout_sets`- ja `sleep_data`-taulut, olemassa oleva `context.ts`:n viikkoyhteenveto-silmukka (unipisteet-keskiarvo per viikko jo laskettuna).

---

## 1. Unipisteiden lasku

Uusi huomio `loadHuomioita()`:ssa. Lasketaan keskimääräinen unipisteet (`calcSleepScore()` jokaiselle `sleep_data`-riville, keskiarvo) kuluvalle viikolle ja edelliselle viikolle (sama `thisWeek`/`lastWeek`-aikaväli kuin olemassa olevassa uni-kesto-huomiossa). Vaatii vähintään 3 kirjausta molemmilta viikoilta joilta pisteet voidaan laskea (rivit joissa `calcSleepScore()` palauttaa `null` puuttuvien kenttien takia eivät lasketa mukaan).

Kynnys: pudotus ≥ 10 pistettä viime viikkoon verrattuna.

```
Teksti: "Unipisteet laskenut {pudotus}p viime viikolla"
Magnitude: pudotus / 100
```

## 2. Treenimäärän ja unipisteiden yhteisvaikutus

Uusi huomio samassa funktiossa. Lasketaan treenitonnimäärä (Σ weight_kg × reps kaikista `workout_sets`-riveistä joissa molemmat kentät ovat asetettu) kuluvalle ja edelliselle viikolle — käyttää samaa `workout_sets`-kyselyä joka jo haetaan 1RM-huomiota varten, mutta ryhmittelee viikoittain 21/42 päivän ikkunoiden sijaan. Käyttää samaa unipisteiden viikkokeskiarvoa kuin kohta 1.

Kynnys: tonnimäärä nousee ≥ 10 % JA unipisteet laskee ≥ 10 pistettä, molemmat viime viikkoon verrattuna. Vaatii vähintään 3 unikirjausta molemmilta viikoilta, ja edellisen viikon tonnimäärän tulee olla > 0 (vältetään merkityksetön prosenttiluku nolla-pohjalta).

```
Teksti: "Treenimäärä +{nousu}%, unipisteet -{pudotus}p — harkitse kevyempää viikkoa"
Magnitude: (nousu/100) + (pudotus/100)  // yhdistetty suuruusluokka kilpailemaan muiden huomioiden kanssa
```

Molemmat huomiot työnnetään samaan `insights`-taulukkoon muiden neljän tyypin (1RM, paino, uni-kesto, askeleet) kanssa ja kilpailevat samasta top-3-paikasta `magnitude`-järjestyksellä — ei uutta UI-elementtiä.

---

## 3. Valmentajan konteksti

`context.ts`:n viikkoyhteenveto-silmukka (joka jo laskee jokaiselle 12 viikon ikkunan viikolle unipisteiden keskiarvon unipisteet-ominaisuudesta) saa uuden lausekkeen olemassa olevan rivin perään kun kyseisen viikon tonnimäärä nousi ≥ 10 % JA unipisteet laski ≥ 10 pistettä edelliseen viikkoon verrattuna — sama "lisää lauseke olemassa olevaan riviin" -malli jota käytetään jo askelmäärän liittämisessä.

---

## Testaus

Ei automaattitestejä (olemassa oleva projektikäytäntö). Manuaalinen läpikäynti:

1. Kirjaa unta jolla unipisteet ovat selvästi matalammat tälle viikolle kuin viime viikolle (≥10p ero, väh. 3 kirjausta molemmilla) — tarkista että huomio ilmestyy Koontiin.
2. Kirjaa treenisarjoja niin että tämän viikon tonnimäärä on ≥10% viime viikkoa suurempi, samalla unipisteet ≥10p matalammat — tarkista että yhdistetty huomio ilmestyy.
3. Tarkista raja-arvot: pelkkä tonnimäärän nousu ilman unipisteiden laskua EI tuota huomiota, ja päinvastoin.
4. Kysy valmentajalta viikon treeneistä/palautumisesta kun ehdot täyttyvät — tarkista että se mainitsee kuormitus/palautuma-havainnon.
