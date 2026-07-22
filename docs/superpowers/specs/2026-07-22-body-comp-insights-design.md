# Treeniapp — Rasva%/lihas%-huomiot

**Päivämäärä:** 2026-07-22
**Laajuus:** Kaksi uutta huomiotyyppiä olemassa olevaan Koonti-sivun "Huomioita"-osioon (`loadHuomioita()`, index.html) plus vastaava laajennus valmentajan viikkokontekstiin (`context.ts`). Kolmas ja viimeinen kolmesta käyttäjän hyväksymästä ominaisuudesta (1: deload-huomiot, shipattu v1.27.0; 2: viikkokooste-push, shipattu) — laajuus tarkentui alkuperäisestä "lisää rasva%/lihas%-seuranta" muotoon "näytä trendit", koska seuranta itsessään (`body_metrics.fat_pct`/`muscle_pct`, keho-sivun lomake + hero + kaavio) oli jo olemassa ennen tätä sessiota.
**Riippuvuudet:** Olemassa oleva `body_metrics`-taulu (`weight_kg`, `fat_pct`, `muscle_pct`, `measured_at`), olemassa oleva paino-trendi-huomio `loadHuomioita()`:ssa, olemassa oleva `context.ts`:n viikkoyhteenveto-silmukka ja sen `weightRows`-kysely (nykyisin `weight_kg,fat_pct`, käytetään BMR-laskennassa mutta ei näytetä viikkorivillä).

---

## 1. Koonti: rasva%- ja lihas%-trendihuomiot

Kaksi uutta huomiota `loadHuomioita()`:ssa, kumpikin täsmälleen samalla logiikalla kuin olemassa oleva paino-trendi-huomio: monotoninen trendi (kaikki arvot ei-kasvavia TAI kaikki ei-laskevia) viimeisen 3 viikon mittausikkunassa (`from21`–`todayIso`, sama kuin painolla), vaatii vähintään 3 mittausta joissa kyseinen kenttä ei ole `null`, kynnys kokonaismuutos ≥ 1.0 prosenttiyksikköä.

Olemassa oleva `weightRows`-kysely (`sb.from('body_metrics').select('weight_kg,measured_at')...`) laajennetaan valitsemaan myös `fat_pct,muscle_pct` — sama kysely, ei uutta kyselyä.

```
Teksti (rasva%): "Rasva% {suunta} {muutos}pp viimeisen 3 viikon aikana"
Teksti (lihas%): "Lihas% {suunta} {muutos}pp viimeisen 3 viikon aikana"
Magnitude: abs(muutos) / [viimeisin arvo ikkunan alussa]  — sama kaava kuin painolla
```

Molemmat työnnetään samaan `insights`-taulukkoon muiden kanssa, kilpailevat itsenäisesti top-3-paikasta.

---

## 2. Valmentajan konteksti: rasva%/lihas% viikkoriville

`context.ts`:n `weightRows`-kysely (nykyisin `weight_kg,fat_pct`) laajennetaan valitsemaan myös `muscle_pct`. Viikkoyhteenveto-silmukan olemassa oleva `weekWeight`-logiikka (kyseisen viikon viimeisin mittaus) monistetaan `weekFat`/`weekMuscle`-muuttujiksi, ja olemassa oleva viikkorivin `paino {kg} kg`-lauseke laajenee: `rasva% {N}%, lihas% {N}%` — `—` jos ei mittausta kyseiseltä viikolta, sama malli kuin painolla.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Kirjaa rasva%-mittauksia keho-sivulla niin että arvo laskee/nousee monotonisesti ≥1.0pp viimeisen 3 viikon aikana (väh. 3 mittausta) — tarkista että "Rasva% ..." -huomio ilmestyy Koontiin. Toista lihas%:lle.
2. Tarkista raja-arvo: alle 1.0pp muutos EI tuota huomiota; ei-monotoninen sarja (esim. ylös-alas-ylös) EI tuota huomiota vaikka kokonaismuutos ylittäisi kynnyksen.
3. Kysy valmentajalta kehonkoostumuksesta — tarkista että vastaus viittaa oikeisiin rasva%/lihas%-lukuihin viikkokontekstista.
