# Treeniapp (Valkku) — Monikäyttäjätuki, osaprojekti 2: Per-käyttäjä-datamalli

**Päivämäärä:** 2026-08-26
**Laajuus:** Toinen osaprojekti Treeniappin siirtämisessä yksinkäyttäjä- → monikäyttäjäsovellukseksi. Lisää `user_id`-sarakkeen jokaiseen henkilökohtaista dataa sisältävään tauluun, muuntaa 5 singleton-taulua yhdeksi-riviksi-per-käyttäjä, ja siirtää (backfill) kaiken olemassa olevan tuotantodatan yhdelle omistajatilille. **Ei muutoksia RLS-käytäntöihin missään taulussa** — kaikki käytännöt pysyvät `using (true)`-muodossa, joten data näkyy edelleen identtisesti kaikille tämän osaprojektin jälkeenkin. Todellinen datan eristäminen (RLS-kiristys) tulee osaprojektissa 3.
**Riippuvuudet:** Osaprojekti 1 (kirjautumisen perusta, `docs/superpowers/specs/2026-08-26-auth-foundation-design.md`) on valmis — `sb.auth.onAuthStateChange`-kuuntelija ja istunnon hallinta ovat jo olemassa (`index.html`). Tämä osaprojekti laajentaa sitä uudella `currentUserId`-globaalilla.

---

## Tausta

Aiempi tutkimus (osaprojektin 1 speksin taustaosio) arvioi 25 taulua, 23 henkilökohtaista + 2 jaettua. Tämän speksin valmistelussa tehty elävän skeeman tarkistus (suora `curl`-kysely REST-rajapintaan + migraatiotiedostojen läpikäynti, ei arvausta) paljasti todellisen tilanteen tarkemmin:

**28 taulua yhteensä**, joista:
- **3 aidosti jaettua** (ei `user_id`-tarvetta, RLS pysyy avoimena): `fineli_foods`, `food_cache` (Fineli-cache, avaimena `fineli_id`), `model_calibration` (jaettu painonpudotusennuste-mallin kalibrointi).
- **5 singleton-taulua** muunnetaan yhdeksi-riviksi-per-käyttäjä: `app_settings`, `activity_goals`, `coach_notes`, `nutrition_goals`, `user_profile`. Kaikki käyttävät identtistä `id bigint primary key default 1 check (id = 1)` -mallia.
- **20 taulua** saa suoraviivaisen `user_id`-sarakkeen: `custom_foods`, `food_log_entries`, `program_sessions`, `program_session_exercises`, `day_session_overrides`, `step_data`, `water_log`, `meal_templates`, `meal_template_items`, `activity_data`, `body_metrics`, `sleep_data`, `workout_sessions`, `workout_sets`, `coach_messages`, `push_subscriptions`, `coach_api_calls`, `food_photo_calls`, `food_macro_estimate_calls`, `exercises`.

5 taulua (`activity_data`, `body_metrics`, `sleep_data`, `workout_sessions`, `workout_sets`) eivät ole minkään migraatiotiedoston luomia — ne on luotu suoraan Supabase Dashboardin kautta ennen migraatiotyönkulun käyttöönottoa. Niiden nykyinen skeema on vahvistettu suoraan REST-rajapinnasta, ei oletettu.

**Käyttäjän vahvistamat päätökset (2026-08-26):**
- `exercises` (nykyinen jaettu, vapaasti muokattava kirjasto) muuttuu per-käyttäjä-omaksi. Uusi käyttäjä aloittaa **tyhjällä** listalla — ei kopioida oletusliikkeitä, ei siemendataa.
- `coach_api_calls`/`food_photo_calls`/`food_macro_estimate_calls` (päivittäiset API-kutsurajat) muuttuvat per-käyttäjä-rajoiksi jaetun globaalin rajan sijaan. **Vain skeemamuutos tässä osaprojektissa** — nämä taulut luetaan/kirjoitetaan yksinomaan Edge Functioneista (`coach-chat`, `food-photo`, `food-macro-estimate`, ei kertaakaan `index.html`:stä), joten itse rajan tarkistuslogiikan per-käyttäjä-muutos on osaprojektin 4 (Edge Function -päivitys) vastuulla.
- Backfill-kohde: `patrik.friis@gmail.com` (jo olemassa oleva Supabase Auth -tili). Sen UUID haetaan Supabase Dashboardista (Authentication → Users) toteutusvaiheessa.
- Tilin poisto → data poistuu mukana kaikkialla (`on delete cascade` jokaisessa `user_id`-viiteavaimessa).
- Singleton-taulujen skeemamuutos JA niiden 5 kutsupaikan (`.eq('id', 1)` → `.eq('user_id', currentUserId)`) päivitys tehdään **molemmat tässä osaprojektissa** — alkuperäinen 5-osaprojektin jaottelu olisi jättänyt sovelluksen rikki näiden taulujen osalta osaprojektien 2 ja 3 välissä (skeeman muutos ilman kutsupaikan päivitystä tarkoittaisi että `.eq('id', 1)` ei löydä enää mitään riviä). Osaprojekti 3 kattaa siis jatkossa vain RLS-kiristyksen 23 muulle taululle (jotka eivät tarvitse mitään koodimuutosta, koska PostgREST suodattaa läpinäkyvästi).

## 1. Jaettujen taulujen käsittely

`fineli_foods`, `food_cache`, `model_calibration` — **ei muutoksia**. Ei `user_id`-saraketta, ei RLS-muutosta, ei kutsupaikkamuutoksia.

## 2. Suoraviivaiset taulut (20 kpl) — `user_id`-sarake

Sama kaava jokaiselle näistä 20 taulusta:

```sql
alter table <taulu> add column user_id uuid references auth.users(id) on delete cascade default auth.uid();
update <taulu> set user_id = '<gmail-tilin-uuid>' where user_id is null;
alter table <taulu> alter column user_id set not null;
```

`default auth.uid()` on pysyvä (ei vain backfill-ajan apu) — Supabasen sisäänrakennettu funktio joka lukee kirjautuneen käyttäjän ID:n suoraan JWT:stä, jonka supabase-js liittää automaattisesti jokaiseen pyyntöön istunnon ollessa olemassa. Tämä tarkoittaa että **yksikään näiden 20 taulun ~85 olemassa olevasta `sb.from(...).insert(...)`-kutsupaikasta index.html:ssä ei tarvitse koodimuutosta** — sarake täyttyy itsestään jokaisella uudella rivillä.

**Poikkeus: `push_subscriptions`.** Tämä taulu ei tee tavallista insertiä vaan `upsert(..., {onConflict: 'endpoint'})`. `default auth.uid()` laukeaa vain insertin polulla — jos sama laite (`endpoint`) oli aiemmin tilattu eri tilillä, upsert osuisi update-polkuun eikä oletusarvo päivittyisi, jolloin ilmoitukset saattaisivat mennä väärälle käyttäjälle. Koska tämän taulun koko tarkoitus on ohjata ilmoitukset oikealle henkilölle, tämä taulu saa yhden tarkoituksellisen poikkeuksen: index.html:n upsert-kutsuun lisätään eksplisiittisesti `user_id: currentUserId` payloadiin, ei luoteta pelkkään oletusarvoon.

## 3. Singleton-taulut (5 kpl) — muunnos yhdeksi-riviksi-per-käyttäjä

Sama kaava jokaiselle näistä 5 taulusta (`app_settings`, `activity_goals`, `coach_notes`, `nutrition_goals`, `user_profile`):

```sql
alter table <taulu> add column user_id uuid references auth.users(id) on delete cascade;
update <taulu> set user_id = '<gmail-tilin-uuid>' where user_id is null;
alter table <taulu> alter column user_id set not null;
alter table <taulu> drop constraint <taulu>_pkey;
alter table <taulu> drop constraint <taulu>_id_check;
alter table <taulu> add primary key (user_id);
alter table <taulu> drop column id;
```

`id bigint default 1 check (id = 1)` poistuu kokonaan — `user_id` on uusi ensisijaisavain. Näissä ei käytetä `default auth.uid()`-mallia insertille, koska sovelluksen nykyinen tapa on todennäköisesti "hae rivi, jos ei löydy niin luo" -logiikka pikemminkin kuin pelkkä plain insert — toteutusvaiheessa tarkistetaan tarkka nykyinen kutsupaikan koodi ja varmistetaan että uuden rivin luonti (jos sitä ei ole) asettaa `user_id`:n eksplisiittisesti `currentUserId`-arvoon, samaan tapaan kuin `push_subscriptions`.

### Kutsupaikkojen päivitys (index.html)

Kaikki 5 kutsupaikkaa muuttuvat muodosta `.eq('id', 1)` muotoon `.eq('user_id', currentUserId)`. Uusi globaali `currentUserId` lisätään osaprojekti 1:n `onAuthStateChange`-kuuntelijaan (jossa `appInitialized` jo asetetaan), luetaan `session.user.id`:stä:

```js
sb.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    currentUserId = session.user.id;
    hideAuthGate();
    ...
```

## 4. `exercises`-taulun erikoiskohtelu

Sama `user_id`-kaava kuin muilla 20 suoraviivaisella taululla (osio 2), mutta lisäksi:
- Nykyinen `exercises_all`-RLS-käytäntö (`for all to anon, authenticated using (true) with check (true)`) **pysyy koskemattomana** tässä osaprojektissa (RLS-muutokset ovat osaprojekti 3:n vastuulla) — käytännössä tämä tarkoittaa että vaikka data on nyt merkitty `user_id`:llä, kaikki näkevät edelleen kaikkien liikkeet tämän osaprojektin jälkeenkin, aivan kuten muutkin taulut.
- Uusi käyttäjä ei saa mitään valmiiksi siemennettyä dataa — tyhjä lista kunnes he lisäävät itse.

## 5. Backfill-suoritus

Yksi ajo, ei vaiheistettua julkaisuikkunaa — koska RLS pysyy avoimena koko osaprojektin ajan, kellään ei ole pääsyongelmaa migraation aikana eikä sen jälkeen (tämä osaprojekti ei muuta kuka näkee mitä, vain datan muotoa). Migraatiotiedostot jaetaan loogisiin ryhmiin (singleton-muunnos omaan tiedostoonsa, suoraviivaiset taulut toiseen) tämän repon vakiintuneen yhden-muutoksen-per-tiedosto-käytännön mukaisesti.

## 6. Rajaus

- Ei RLS-käytäntömuutoksia missään taulussa.
- Ei muutoksia jaettuihin tauluihin (`fineli_foods`, `food_cache`, `model_calibration`).
- Ei Edge Function -muutoksia (myös `coach_api_calls`/`food_photo_calls`/`food_macro_estimate_calls`-taulujen per-käyttäjä-rajalogiikka on osaprojekti 4:ssä, ei tässä).
- Ei siemendataa uusille käyttäjille `exercises`-taulussa.
- Ei muutoksia mihinkään muuhun kutsupaikkaan kuin 5 singleton-kutsupaikkaan ja `push_subscriptions`-upsertiin — kaikki muut ~85 kutsupaikkaa toimivat muuttumattomina `default auth.uid()`:n ansiosta.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Ennen migraatiota: tallenna jokaisen 28 taulun rivimäärä (`select count(*) from <taulu>`) vertailupohjaksi.
2. Aja molemmat migraatiot. Tarkista jokaisen taulun rivimäärä säilyy identtisenä (ei rivikatoa).
3. Tarkista `select user_id, count(*) from <taulu> group by user_id` jokaiselle 25 taululle (20 suoraviivaista + 5 singleton) — kaikkien rivien pitää osoittaa gmail-tilin UUID:hen, ei yhtään NULL-riviä.
4. Kirjaudu sisään gmail-tilillä selaimessa, käy läpi Koonti/Ruoka/Sali/Aerobia/Keho/Uni-sivut — kaikki data näkyy täsmälleen ennallaan.
5. Tarkista sivupalkin asetukset (Ravintotavoitteet, Kestävyystavoitteet, Kalorikerroin, Profiili, Valmentaja-muistiinpanot) — kaikki lataavat ja tallentavat oikein uuden `user_id`-pohjaisen kyselyn kautta.
6. Lisää uusi ruokakirjaus, uusi aktiviteetti, uusi salitreeni — tarkista että uusi rivi saa `user_id`:n automaattisesti oikein (`default auth.uid()` toimii).
7. Lisää uusi liike (exercise) — tarkista että se tallentuu ja näkyy `user_id`:llä merkittynä.
8. Kirjaudu ulos ja sisään outlook-testitilillä — tarkista että kaikki sivut näyttävät **saman** datan kuin gmail-tilillä (RLS ei vielä rajaa, tämä on odotettua tässä vaiheessa) mutta että mikään ei kaadu tai virheile pelkän skeemamuutoksen vuoksi.
9. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
