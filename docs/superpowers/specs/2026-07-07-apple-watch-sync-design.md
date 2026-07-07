# Treeniapp — Apple Watch -treenisynkronointi

**Päivämäärä:** 2026-07-07
**Laajuus:** Watch-treenidatan automaattinen synkkaus Shortcuts-automaation kautta suoraan Supabaseen, ilman Mac-väliporrasta.
**Riippuvuudet:** Olemassa olevat `workout_sessions`- ja `activity_data`-taulut (Supabase, jo tuotannossa).

---

## Tavoite

Käyttäjä käynnistää ja lopettaa treenin aina manuaalisesti Apple Watchista valiten treenityypin itse (ei automaattista lajintunnistusta). Kun treeni päättyy, iOS:n Personal Automation käynnistää Shortcutsin, joka lukee treenin tiedot HealthKitistä ja lähettää ne suoraan Supabasen REST-rajapintaan — ilman että käyttäjän tarvitsee koskea Treeniappiin.

Kaksi erillistä kohdetta treenityypin mukaan:
- **Sali (Traditional Strength Training):** treenin sisältö (sarjat/toistot/painot) on jo kirjattu appista käsin — Watch täydentää vain kalori-/syketiedon olemassa olevaan päivän sessioriviin.
- **Muut aktiviteetit (juoksu, kävely, jääkiekko, mikä tahansa muu):** näistä ei ole appissa valmiiksi tarkkaa dataa — Watch luo täyden aktiviteettirivin (kesto, kalorit, syke, matka).

Koska Applen kalorilaskenta on tutkitusti epäluotettava (ks. taustaselvitys alla), kaikki päivä-/viikkotason kalorivaje-/saldolaskenta käyttää jatkossa aina korjattua lukemaa, ei koskaan Applen raakalukemaa.

---

## Taustaselvitys: Applen kalorilaskennan tarkkuus

- Stanfordin validointitutkimus (2017): Apple Watch oli testatuista laitteista **tarkin** energiankulutuksen mittauksessa, mutta silti keskimäärin **~27% virhe** kävelyssä/juoksussa ja **~52% virhe** pyöräilyssä.
- 2025 meta-analyysi (Ole Miss, 56 tutkimusta): keskimääräinen virhe energiankulutuksessa **27.96%**, mutta virheen **suunta vaihtelee** — Apple aliarvioi miehillä, yliarvioi naisilla. Syke sen sijaan on tarkka (~2-4% virhe).
- Koska yhtä luotettavaa korjaussuuntaa ei ole olemassa, käytetään kiinteää **-28%** oletuskerrointa (0.72×) joka on käyttäjän muokattavissa, sen sijaan että esitettäisiin keinotekoisen tarkka "oikea" luku.

Lähteet: [Ole Miss -tutkimus](https://olemiss.edu/news/2025/06/apple-watch-accuracy-study/index.html), [MacRumors-yhteenveto](https://www.macrumors.com/2025/06/05/apple-watch-gets-fitness-metric-wrong/), [ScienceInsights: Stanford-tutkimus](https://scienceinsights.org/how-accurate-is-the-apple-watch-for-calories/)

---

## 1. Datamalli

### `workout_sessions` — kaksi uutta saraketta

```sql
alter table workout_sessions add column calories numeric;
alter table workout_sessions add column avg_heart_rate integer;
```

Päivittyvät `UPDATE`-kutsulla (ei uutta riviä) kun Watch-synkkaus tunnistaa sali-treenin.

### `activity_data` — kaksi uutta saraketta

```sql
alter table activity_data add column source text not null default 'manual' check (source in ('manual','watch'));
alter table activity_data add column healthkit_uuid text unique;
```

`healthkit_uuid` on uusi estotunniste Watch-riveille: estää saman treenin tuplakirjautumisen jos Shortcut ajetaan vahingossa kahdesti, ja mahdollistaa useamman saman lajin merkinnän samana päivänä (esim. kaksi juoksulenkkiä). Olemassa oleva `(activity_date, activity_type)`-uniikkius jää koskemaan vain käsin syötettyjä rivejä (`healthkit_uuid is null`) — Postgres sallii useita `NULL`-arvoja uniikissa sarakkeessa, joten tämä ei riko nykyistä käsin-syöttöä.

### Uusi `app_settings`-taulu (singleton, sama malli kuin `nutrition_goals`)

```sql
create table app_settings (
  id                 bigint primary key default 1 check (id = 1),
  calorie_correction numeric not null default 0.72,
  updated_at         timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy app_settings_select on app_settings
  for select to anon, authenticated using (true);
create policy app_settings_insert on app_settings
  for insert to anon, authenticated with check (true);
create policy app_settings_update on app_settings
  for update to anon, authenticated using (true) with check (true);
```

`calorie_correction = 0.72` vastaa -28% oletuskorjausta. Muokattavissa sivupalkin asetuksista.

---

## 2. Reititys ja Shortcuts-integraatio

Koska ei ole varmuutta palauttaako watchOS/Shortcuts täsmällisen merkkijonon "Outdoor Run" vai geneerisen "Running" Indoor/Outdoor-varianteille (Apple ei dokumentoi tätä yksiselitteisesti — sisä/ulko on usein vain metatieto saman `HKWorkoutActivityType`-arvon päällä, ei erillinen tyyppi), reititys tehdään **"sisältää"-ehdoilla** täsmällisen vastaavuuden sijaan:

| Ehto (Workout Type sisältää) | Kohde | Toiminto |
|---|---|---|
| "Strength" | `workout_sessions` | `UPDATE ... WHERE workout_date = <päivä>` — `calories`, `avg_heart_rate` |
| "Run" | `activity_data`, `activity_type='Juoksu'` | Upsert, `onConflict: healthkit_uuid` |
| "Walk" | `activity_data`, `activity_type='Kävely'` | Upsert, `onConflict: healthkit_uuid` |
| "Hockey" | `activity_data`, `activity_type='Jääkiekko'` | Upsert, `onConflict: healthkit_uuid` |
| (ei mikään yllä) | `activity_data`, `activity_type=<Watchin oma englanninkielinen nimi sellaisenaan>` | Upsert, `onConflict: healthkit_uuid` |

Tämä kattaa automaattisesti sekä Indoor- että Outdoor-variantit riippumatta Applen tarkasta nimeämiskäytännöstä. "Muu"-rivit näkyvät Aktiviteetti-listassa olemassa olevalla yleisellä ⚡-varaikonilla (koodi jo tukee tuntematonta `activity_type`-arvoa tälle).

### Shortcuts-automaation rakenne (käyttäjä konfiguroi itse laitteellaan)

1. **Personal Automation**, laukaisin: *Workout → When I End a Workout*, "Run Immediately" (ei vahvistuskysymystä).
2. **Find Workouts** -toiminto hakee juuri päättyneen treenin (Sort by End Date descending, Limit 1).
3. Luetaan treenistä: `Workout Type` (nimi), `Duration`, `Total Active Energy` (kalorit), `Average Heart Rate`, `Total Distance` (jos saatavilla), sekä treenin oma UUID (dedup-avaimeksi).
4. `If`/`Otherwise`-haarautuminen yllä olevan taulukon "sisältää"-ehtojen mukaan.
5. **Get Contents of URL** -toiminto lähettää datan Supabaseen:
   - Sali: `PATCH https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/workout_sessions?workout_date=eq.<pvm>` runko `{"calories": <n>, "avg_heart_rate": <n>}`
   - Muut: `POST https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/activity_data` headerilla `Prefer: resolution=merge-duplicates` ja query-parametrilla `on_conflict=healthkit_uuid`, runko sisältää kaikki kentät + `source: "watch"` + `healthkit_uuid`
   - Headerit molemmissa: `apikey` ja `Authorization: Bearer <anon-avain>` (sama avain jota web-sovellus jo käyttää — julkinen anon-key, ei erillistä salaisuutta paljasteta)

Tarkat askel-askeleelta-ohjeet Shortcutsin rakentamiseen kirjoitetaan erilliseksi käyttöoppaaksi toteutusvaiheessa, koska Shortcuts-sovelluksen konfigurointi tapahtuu käyttäjän omalla laitteella eikä ole ohjelmallisesti automatisoitavissa tästä ympäristöstä.

---

## 3. Kalorikorjauskerroin

- Uusi sivupalkin asetusrivi "Kalorikerroin" (Ravintotavoitteet-linkin vieressä), avaa pienen modaalin jossa yksi kenttä (%, oletus -28).
- Tallennetaan `app_settings.calorie_correction`-sarakkeeseen (esim. -28% → 0.72).
- **Periaate:** kaikkialla missä lasketaan päivä-/viikkotason kalorisaldoa tai -vajetta (nykyisin tai tulevaisuudessa), käytetään aina `apple_kcal × calorie_correction`. Applen raakalukema näytetään rinnalla vain FYI-tietona (esim. "227 kcal (Apple) · ~163 kcal arvio"), ei koskaan syötteenä laskuihin. Tämä periaate kirjataan tähän spekseihin ohjaamaan mahdollista tulevaa kalorivaje-ominaisuutta — sellaista ei rakenneta vielä tässä yhteydessä, koska sovelluksessa ei tällä hetkellä ole mitään kalorisaldolaskentaa.

---

## 4. Virheenkäsittely

- **Ei vastaavaa `workout_sessions`-riviä** synkkaushetkellä (Watch ehtii ennen kuin appista on merkitty sessio tehdyksi): `UPDATE` osuu 0 riviin, kalori/syke-data häviää hiljaisesti. Tunnettu, hyväksytty reunatapaus — ei erillistä virheilmoitusta (ei käytännöllistä toteuttaa Shortcutsin sisällä). Korjaus: aja Shortcut manuaalisesti uudelleen kun sessio on merkitty appista, tai merkitse sessio appista ennen Watch-treenin lopettamista.
- **Tuntematon treenityyppi:** menee "Muu"-haaraan (ks. yllä), ei koskaan hiljaa kadonnut.
- **Verkkovirhe Shortcutissa:** epäonnistuu hiljaa taustalla ("Run Immediately" ei näytä virheilmoitusta käyttäjälle). Ei uudelleenyritys-logiikkaa (YAGNI) — jos data puuttuu, käyttäjä huomaa sen Aktiviteetti-listasta ja voi ajaa Shortcutin manuaalisesti Shortcuts-sovelluksesta.
- **`healthkit_uuid`-konflikti** (sama treeni synkataan kahdesti): upsert `onConflict: healthkit_uuid` päivittää saman rivin sen sijaan että loisi duplikaatin.

---

## 5. Testaus

Ei automaattitestejä (sama käytäntö kuin muualla sovelluksessa — ei build-vaihetta, ei testikehystä). Manuaalinen varmennus toteutuksen jälkeen:

1. Kirjoita ja aja kolme SQL-migraatiota Supabasen SQL-editorissa, vahvista sarakkeet/taulu olemassa.
2. Konfiguroi Shortcuts-automaatio käyttäjän omalla iPhonella annettujen ohjeiden mukaan (ei automatisoitavissa tästä ympäristöstä).
3. Testaa jokainen neljä reititystapausta (sali, juoksu, kävely, jääkiekko) joko oikealla Watch-treenillä tai Shortcutsin manuaalisella "Run"-testillä, vahvista rivi ilmestyy oikeaan tauluun Supabasessa oikeilla arvoilla.
4. Testaa "Muu"-reititys jollain neljän ulkopuolisella treenityypillä (esim. pyöräily), vahvista `activity_type` tallentuu Watchin omalla nimellä ja näkyy ⚡-ikonilla Aktiviteetti-listassa.
5. Testaa `healthkit_uuid`-dedup ajamalla sama Shortcut-testi kahdesti samalle treenille, vahvista vain yksi rivi syntyy (päivittyy, ei duplikaatu).
6. Tarkista sovelluksen Aktiviteetti- ja Treeni-näkymät näyttävät uuden datan oikein, ja että kalorikorjauskerroin-asetus toimii (arvon muutos, tallennus, näkyminen).

---

## Rajaukset (ei tässä versiossa)

- Ei automaattista uudelleenyritystä epäonnistuneille Shortcuts-lähetyksille.
- Ei varsinaista kalorivaje-/saldo-ominaisuutta rakenneta vielä — vain periaate ("käytä aina korjattua lukemaa") kirjataan tulevaa varten.
- Ei tukea useammalle kuin yhdelle sali-sessiolle per päivä (`workout_sessions`-taulun olemassa oleva `(workout_date, session_type)`-uniikkius ei muutu).
- Shortcuts-automaation rakentaminen käyttäjän laitteelle ei ole ohjelmallisesti automatisoitavissa — toteutussuunnitelma sisältää kirjallisen askel-askeleelta-oppaan, ei valmista `.shortcut`-tiedostoa.
