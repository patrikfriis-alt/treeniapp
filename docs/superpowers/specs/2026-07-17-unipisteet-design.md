# Treeniapp (Valkku) — Unen synkkaus ja unipisteet

**Päivämäärä:** 2026-07-17
**Laajuus:** Kaksi toisiinsa liittyvää lisäystä: (1) unen automaattinen synkkaus Apple Watchilta Shortcuts-automaation kautta (nykyisin täysin manuaalinen syöttö), ja (2) laskettu 0-100 "unipisteet" -arvo jokaiselle yölle, näkyvissä Uni-sivulla, Koonti-kortissa ja valmentajan kontekstissa.
**Riippuvuudet:** Olemassa oleva `sleep_data`-taulu (`sleep_date`, `duration_min`, `deep_sleep_min`, `rem_sleep_min`, `awakenings`), olemassa oleva Apple Shortcuts -synkkausmalli (`docs/apple-watch-shortcuts-guide.md`/`-en.md`), olemassa oleva Uni-sivu ja Koonti-kortti, olemassa oleva `coach-chat`-Edge Functionin `context.ts`-datakonteksti.

---

## Tausta

Uni syötetään tällä hetkellä täysin manuaalisesti Uni-sivun lomakkeella — toisin kuin treenit, aktiviteetit ja askeleet, joilla on jo Apple Watch -Shortcuts-synkkaus. Applen virallista sleep-pistemäärää ei ole julkisesti saatavilla (todettu aiemmin tässä projektissa), joten tämä spec toteuttaa oman, ei-tieteellisen mutta läpinäkyvän pistelaskennan olemassa olevista `sleep_data`-kentistä — vasta sen jälkeen kun data kertyy automaattisesti eikä vaadi manuaalista näppäilyä joka aamu.

---

## 1. Unen synkkaus (Shortcuts)

Uusi henkilökohtainen automaatio, aikaperusteinen laukaisin (kerran päivässä, esim. klo 9:00) — ei treenilaukaisinta kuten askeleilla, koska edellisen yön uni on siihen mennessä kokonaan synkronoitunut Watchilta puhelimeen, eikä dataa tarvitse hakea useasti kesken päivän kuten askelten kanssa.

Automaatio hakee **Sleep Analysis** -näytteet edelliseltä yöltä ("Find Health Samples", Sample Type: Sleep Analysis), ja johtaa niistä neljä arvoa jotka vastaavat suoraan `sleep_data`-taulun olemassa olevia sarakkeita:

- `duration_min` — kokonaisunen kesto (kaikki paitsi "Awake"-jaksot)
- `deep_sleep_min` — "Deep"-jaksojen yhteiskesto
- `rem_sleep_min` — "REM"-jaksojen yhteiskesto
- `awakenings` — "Awake"-jaksojen **lukumäärä** (ei kestoa)

`POST` samaan tapaan kuin askelseurannassa: `sleep_data?on_conflict=sleep_date`, `Prefer: resolution=merge-duplicates`, sama anon-avain. Koska Sleep Analysis palauttaa aikaleimattuja jaksoja eri vaihetyypeillä (ei yhtä valmista numeroa kuten askelten summa), tarkat Shortcuts-toimintojen nimet ja suodatuslogiikka per vaihetyyppi käydään läpi yhdessä oppaan kirjoitusvaiheessa ja/tai käyttäjän oman kokeilun kautta — sama käytäntö kuin askelseurannassa, jossa täsmällinen "Calculate Statistics" -toiminto löytyi vasta hands-on-vaiheessa. `docs/apple-watch-shortcuts-guide.md` ja `-en.md` laajenevat uudella "Unen synkkaus" -osiolla samassa formaatissa kuin muut osiot.

Manuaalinen syöttölomake Uni-sivulla säilyy ennallaan varajärjestelmänä (esim. jos automaatio ei jostain syystä toimi jonain päivänä) — sitä ei poisteta.

---

## 2. Unipisteiden kaava

Uusi client-side funktio `calcSleepScore(row)` `index.html`:ssä, joka laskee 0-100 pisteen `sleep_data`-rivistä. Jos `duration_min`, `deep_sleep_min`, `rem_sleep_min` tai `awakenings` on `null`, funktio palauttaa `null` — ei osittaista tai harhaanjohtavaa pistettä.

```
Kesto (40p):    min(40, round(duration_min / 480 * 40))
                — 8h (480 min) = täydet 40p, lyhyempi uni skaalautuu suhteessa, pidempi tasoittuu 40:een

Syvä uni (25p): 25 - abs(deep_pct - 18) * 1.5, clamp [0, 25]
                — deep_pct = deep_sleep_min / duration_min * 100, optimi 18 %

REM (20p):      20 - abs(rem_pct - 22.5) * 1.2, clamp [0, 20]
                — rem_pct = rem_sleep_min / duration_min * 100, optimi 22.5 %

Heräilyt (15p): max(0, 15 - awakenings * 5)
                — jokainen heräily -5p, 3+ heräilyä = 0p tästä osiosta

Unipisteet = round(Kesto + Syvä uni + REM + Heräilyt), maksimi 100
```

---

## 3. Käyttöliittymä

**Uni-sivun hero:** kesto pysyy nykyisellään pääsuureena ("VIIME YÖ · UNI"), unipisteet lisätään rinnalle (esim. hero-sub-riville tai kolmanneksi hero-stat-arvoksi). Jos pisteitä ei voida laskea, näytetään "—" pelkän tyhjän sijaan.

**Koonti-sivun Uni-kortti:** nykyinen alarivi `"{h}h · ka {ka}h"` laajenee sisältämään myös pisteet (esim. `"7.5h · 82p"`), tarkka muotoilu ratkaistaan toteutusvaiheessa niin että rivi pysyy luettavana kortin tilassa.

Ei muutosta manuaaliseen syöttölomakkeeseen — pisteet lasketaan aina näytettäessä, ei tallenneta erillisenä sarakkeena tietokantaan.

---

## 4. Valmentajan konteksti

`context.ts`:n viikkoyhteenveto-silmukka laskee jokaiselle 12 viikon ikkunan viikolle myös unipisteiden keskiarvon (sama `calcSleepScore`-logiikka Deno-puolen TypeScript-versiona), ja liittää sen olemassa olevaan viikkorivin tekstiin uutena lausekkeena — sama malli kuin askelmäärän liittäminen valmentajan kontekstiin askelseurannassa.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Aja Shortcuts-automaatio manuaalisesti aamulla kun edellisen yön unidataa on saatavilla — tarkista että `sleep_data`-riville ilmestyy kaikki neljä kenttää oikein.
2. Tarkista että Uni-sivun hero näyttää lasketut unipisteet oikein annetulla datalla (laske käsin ja vertaa).
3. Tarkista että Koonti-sivun Uni-kortti näyttää pisteet.
4. Kirjaa manuaalisesti uni jolta puuttuu esim. syvän unen kenttä — tarkista että pisteiden sijaan näkyy "—", ei virheellistä lukua.
5. Kysy valmentajalta unesta — tarkista että se viittaa oikeisiin unipisteisiin vastauksessaan.
