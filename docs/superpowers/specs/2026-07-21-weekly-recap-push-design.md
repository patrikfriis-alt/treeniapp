# Treeniapp — Viikkokooste-push

**Päivämäärä:** 2026-07-21
**Laajuus:** Uusi ilmoitustyyppi olemassa olevaan `check-and-notify`-Edge Functioniin: viikon lyhyt kooste sunnuntai-iltana. Toinen kolmesta käyttäjän hyväksymästä ominaisuudesta (1: deload-huomiot, shipattu v1.27.0; 3: rasvaprosentti/lihasprosentti-seuranta seuraa omana syklinään).
**Riippuvuudet:** Olemassa oleva `supabase/functions/check-and-notify/index.ts` (streak- ja activity-tyyppiset muistutukset, `push_subscriptions`-taulu, `app_settings.push_enabled`, `web-push`-kirjasto), olemassa oleva `sw.js`:n geneerinen push-käsittelijä (näyttää minkä tahansa `{title, body}`-payloadin, ei muutoksia tarvita), olemassa oleva ulkoinen ajastuspalvelu cron-job.org (Supabase Free-tasolla ei pg_cron-tukea).

---

## 1. Uusi ilmoitustyyppi

`check-and-notify`:n `type`-parametrin sallittujen arvojen listaan (`'streak' | 'activity'`) lisätään kolmas arvo `'weekly-recap'`. Sama `x-cron-secret`-tarkistus ja `app_settings.push_enabled`-tarkistus kuin nykyisillä tyypeillä — ei uutta autentikointimekanismia.

**Ajastus:** uusi cron-job.org-ajastus, **sunnuntaisin klo 19:00 Europe/Helsinki**, `GET https://<project-ref>.supabase.co/functions/v1/check-and-notify?type=weekly-recap`, otsake `x-cron-secret: <CRON_SECRET>`. Tämä konfiguroidaan manuaalisesti cron-job.org:n webkäyttöliittymässä käyttöönoton yhteydessä, samaan tapaan kuin kaksi olemassa olevaa ajastusta — ei automatisoitavissa koodilla.

---

## 2. Viikon aikaväli ja tilastot

Viikon aikaväli lasketaan `check-and-notify`:n sisällä itsenäisesti (ei ristiin-importteja `coach-chat`-funktiosta — jokainen Edge Function pysyy itsenäisenä, sama käytäntö kuin `calcSleepScore`:n kahdennus `index.html`:n ja `context.ts`:n välillä): kuluvan viikon maanantai tähän päivään asti (joka on sunnuntai kun ajastus laukeaa).

Kolme tilastoa, kaikki jo muualla sovelluksessa käytetystä datasta:

1. **Aktiiviset päivät** — eri päivämäärien lukumäärä joilta löytyy rivi `activity_data`- tai `workout_sets`-taulusta tällä viikolla (sama määritelmä kuin `hasActivityOn`, laajennettuna viikon mittaiseksi ja eri päivien lukumääräksi yhden boolean-arvon sijaan).
2. **Tonnimäärä** — Σ `weight_kg × reps` kaikista `workout_sets`-riveistä tällä viikolla joissa molemmat kentät ovat asetettu (sama kaava kuin juuri shipatussa deload-huomiossa).
3. **Askeleet keskimäärin/pv** — `step_data.steps`-keskiarvo tällä viikolla. Jos ei yhtään askelrivi tältä viikolta, tämä lauseke jätetään kokonaan pois viestistä (ei placeholderia).

**Ohitusehto:** jos aktiivisia päiviä on 0, ilmoitusta ei lähetetä lainkaan (palautetaan hiljaisesti 200, sama malli kuin nykyinen "already active today" -pikapaluu). Jos aktiivisia päiviä on > 0 mutta tonnimäärä on 0 (esim. pelkkä kestävyysviikko), ilmoitus lähetetään silti — "0 kg nostettu" on rehellinen tieto, ei ohitussyy.

---

## 3. Viestin muoto

```
Otsikko: Valkku
Runko:   "Viikko takana: {N} treeniä, {tonnimäärä} kg nostettu, ka {askeleet} askelta/pv 💪"
```

Jos askeldataa ei ole tältä viikolta, muoto lyhenee: `"Viikko takana: {N} treeniä, {tonnimäärä} kg nostettu 💪"`.

Lähetys samalla `webpush.sendNotification`-mekanismilla kuin nykyiset kaksi tyyppiä, mukaan lukien sama vanhentuneiden tilausten siivous (404/410-vastauksesta `push_subscriptions`-rivin poisto).

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Kirjaa treenisarjoja ja/tai aktiviteetteja kuluvalle viikolle niin että aktiivisia päiviä on > 0. Kutsu `check-and-notify?type=weekly-recap` manuaalisesti `curl`illa oikealla `x-cron-secret`-otsakkeella — tarkista että ilmoitus saapuu oikeilla luvuilla (vertaa käsin laskettuun tonnimäärään ja askelkeskiarvoon).
2. Testaa askeldata puuttuu -haara: varmista ettei `step_data`-riviä ole tältä viikolta, kutsu uudelleen — tarkista että askellauseke puuttuu viestistä kokonaan eikä näytä esim. "NaN" tai "—".
3. Testaa ohitusehto: varmista ettei aktiviteetti- tai treenirivejä ole tältä viikolta, kutsu funktio — tarkista EI ilmoitusta lähetetä.
4. Kytke Ilmoitukset pois sivupalkista, kutsu funktio uudelleen aktiivisella viikolla — tarkista ei ilmoitusta (`push_enabled = false`).
5. Konfiguroi cron-job.org-ajastus (sunnuntai 19:00 Europe/Helsinki) — tarkista testiajolla webkäyttöliittymän kautta että pyyntö menee läpi.
