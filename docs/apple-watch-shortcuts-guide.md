# Apple Watch -treenisynkkaus: Shortcuts-automaation rakentaminen

Tämä opas käydään läpi Shortcuts-sovelluksessa omalla iPhonella. Ei koodia — pelkkiä Shortcuts-toimintoja.

## 1. Luo Personal Automation

1. Avaa **Shortcuts**-sovellus → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Treeni** (Workout) → **Kun lopetan treenin** (When I End a Workout)
3. Valitse **Suorita heti** (Run Immediately) — EI "Kysy ennen suorittamista", jotta automaatio toimii ilman vahvistusta

## 2. Hae juuri päättynyt treeni

1. Lisää toiminto **Etsi treenit** (Find Workouts)
2. Aseta: Lajittele **Päättymispäivän** mukaan, laskeva järjestys, **Rajoita 1**:een

## 3. Poimi treenin tiedot

Lisää **Aseta muuttuja**-toiminnot (Set Variable) jokaiselle seuraavalle treenin kentälle (löytyvät "Etsi treenit"-tuloksen Magic Variable -valikosta):
- `WorkoutType` ← Treenin **Treenityyppi** (Workout Type)
- `Duration` ← **Kesto** minuutteina
- `Calories` ← **Aktiivinen energia** (Total Active Energy), yksikkö kcal
- `AvgHR` ← **Keskisyke** (Average Heart Rate), pyöristä **Pyöristä numero** (Round Number) -toiminnolla kokonaisluvuksi ennen tallennusta muuttujaan (HealthKitin syke on lähes aina desimaaliluku, esim. 142.37)
- `Distance` ← **Kokonaismatka** (Total Distance), yksikkö km (voi olla tyhjä salitreeneillä)
- `WorkoutUUID` ← Treenin **UUID**
- `EndDate` ← **Päättymispäivä**, muotoile **Muotoile päivämäärä** -toiminnolla muotoon `yyyy-MM-dd`

## 4. Reititys treenityypin mukaan (If/Otherwise)

**Tärkeää rakenteesta:** älä rakenna neljää erillistä "Hae sisältö URL:sta"-kopiota neljän eri if-haaran sisään (yksi Run:lle, yksi Walk:lle, yksi Hockey:lle, yksi "muu"-haaralle). Jos yksikin niistä haaroista jää rakentamatta, kopioituu väärin, tai sen Otherwise-liitos irtoaa myöhemmässä muokkauksessa, kyseisen tyypin treenit katoavat kokonaan äänettömästi — Shortcuts ei näytä mitään virhettä "Suorita heti"-tilassa. Rakenna sen sijaan yksi ainoa POST, jota edeltää pelkkä nimilapun valinta ilman verkkokutsuja, kuten alla.

Lisää **Jos**-toiminto (If): `WorkoutType` **sisältää** `Strength`

### Jos KYLLÄ (sali):

**Hae sisältö URL:sta** (Get Contents of URL):
- Metodi: `PATCH`
- URL: `https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/workout_sessions?workout_date=eq.[EndDate]`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
- Pyynnön runko (JSON):
  ```json
  { "calories": [Calories], "avg_heart_rate": [AvgHR] }
  ```

### Jos EI (kaikki muut treenityypit — tähän yhteen "Otherwise"-haaraan koko loppuosa):

1. Lisää **Aseta muuttuja**-toiminto `ActivityType`-nimiselle muuttujalle: **ei** vielä arvoa, vaan valitse arvo seuraavalla sisäkkäisellä if-ketjulla, joka **ei sisällä yhtäkään verkkokutsua** — pelkkiä "Aseta muuttuja"-toimintoja:
   - **Jos**: `WorkoutType` **sisältää** `Run` → **Aseta muuttuja** `ActivityType` = `Juoksu`
   - **Muuten jos** (Otherwise If): `WorkoutType` **sisältää** `Walk` → **Aseta muuttuja** `ActivityType` = `Kävely`
   - **Muuten jos**: `WorkoutType` **sisältää** `Hockey` → **Aseta muuttuja** `ActivityType` = `Jääkiekko`
   - **Muuten** (Otherwise): **Aseta muuttuja** `ActivityType` = `WorkoutType` (Watchin oma nimi sellaisenaan Magic Variablena)
2. Sulje kaikki sisäkkäiset if:t (neljä **Lopeta jos**/End If -riviä siirtyy automaattisesti kun lisäät seuraavan toiminnon oikealle tasolle).
3. **Yhden ainoan kerran**, sisäkkäisten if:ien *jälkeen* (ei minkään niistä sisällä — tarkista sisennyksestä, että toiminto on samalla tasolla kuin askeleen 1 "Aseta muuttuja", ei sen sisällä), lisää tämä **Hae sisältö URL:sta**:
   - Metodi: `POST`
   - URL: `https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/activity_data?on_conflict=healthkit_uuid`
   - Headerit: sama `apikey`/`Authorization`/`Content-Type` + `Prefer`: `resolution=merge-duplicates`
   - Runko:
     ```json
     {
       "activity_date": "[EndDate]",
       "activity_type": "[ActivityType]",
       "duration_min": [Duration],
       "calories": [Calories],
       "avg_heart_rate": [AvgHR],
       "distance_km": [Distance],
       "source": "watch",
       "healthkit_uuid": "[WorkoutUUID]"
     }
     ```

Näin tämä POST suoritetaan aina täsmälleen kerran jokaiselle ei-sali-treenille riippumatta siitä, mikä nimilappu valikoitui — ainoa asia joka voi vaihdella on `activity_type`-arvo, ei se lähteekö rivi ollenkaan matkaan.

## 5. Testaa

Paina Shortcutsin automaation kohdalla **"Kokeile"** (Run) manuaalisesti ilman että teet oikeaa treeniä — jos sinulla on äskettäin päättynyt Watch-treeni Health-sovelluksessa, "Etsi treenit" löytää sen ja voit varmistaa että data menee oikeaan tauluun Supabasen dashboardista (Table Editor).

## 6. Vianetsintä

- Jos rivi ei ilmesty: tarkista että anon-avain on oikein kopioitu (löytyy `index.html`:n `SB_KEY`-vakiosta), ja että migraatiotiedosto `supabase/migrations/20260708_apple_watch_sync.sql` on ajettu.
- Jos yksittäiset treenityypit (esim. sisäpyöräily, stepper, crosstrainer) eivät koskaan ilmesty vaikka Juoksu/Kävely toimivat: tämä on merkki siitä että automaatio on rakennettu vanhalla, neljä erillistä POST-kopiota käyttävällä rakenteella eikä sen "muu"-haara (tai Hockey-haara) ole koskaan toiminut — tarkista Supabasen Table Editorista `activity_data`-taulusta onko sinne koskaan tullut `source: watch` -rivi jonka `activity_type` on jokin muu kuin Juoksu/Kävely/Jääkiekko. Jos ei ole, rakenna reititys-vaihe (kohta 4) uudelleen tämän oppaan nykyisen, yhden POST-toiminnon rakenteen mukaan äläkä neljän erillisen kopion mukaan.
- Jos sali-kalorit eivät päivity: varmista että olet merkinnyt kyseisen päivän session "tehdyksi" Treeniapista ennen tai pian Watch-treenin jälkeen — `workout_sessions`-rivi täytyy olla olemassa jotta `PATCH` löytää sen.
- Jos tallennus epäonnistuu virheellä joka viittaa `avg_heart_rate`-kenttään: varmista että käytit **Pyöristä numero** -toimintoa `AvgHR`-muuttujalle vaiheessa 3 — HealthKitin desimaaliluku voi hylkääntyä jos tietokannan sarake ei hyväksy desimaaleja.
- Jos askeleet eivät koskaan ilmesty: tarkista että migraatiotiedosto `supabase/migrations/20260715_step_data.sql` on ajettu, ja että Shortcutsilla on lupa lukea askeleita Health-sovelluksen tietosuoja-asetuksista (Health-sovellus → profiilikuvake → Sovellukset → Shortcuts → Askeleet-lupa päällä).
- Jos askelluku näyttää n. kaksinkertaiselta todelliseen verrattuna (esim. Watch näyttää 9000 mutta appi näyttää 17000): **Etsi terveysnäytteet** -toiminnosta puuttuu Lähde-suodatin, jolloin summa laskee mukaan sekä Watchin että iPhonen omat askelnäytteet — lisää suodatin **Lähde on *Watchisi nimi*** kohdassa 7.
- Jos unen kentät eivät täyty (syvä uni / REM / heräilyt jäävät tyhjiksi): tarkista että käytit oikeaa Uni-analyysi-suodatinta kussakin **Etsi terveysnäytteet** -toiminnossa, ja että Watch on tallentanut vaihekohtaista dataa (vanhemmat Watch-mallit tai watchOS-versiot saattavat tallentaa vain yhden yhtenäisen "Nukkuu"-arvon ilman vaihejakoa — tässä tapauksessa vaihekohtaisia kenttiä ei voi täyttää eikä unipisteitä voida laskea).

## 7. Askelmäärän synkkaus

Askeleet eivät liity yksittäiseen treeniin, joten tämä tarvitsee toisen, erillisen henkilökohtaisen automaation, joka toimii aikataulun eikä treenilaukaisimen mukaan.

### Luo automaatio

1. Avaa **Shortcuts** → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Kellonaika** (Time of Day) → valitse aika (esim. 10:00) → aseta **Suorita heti**
3. Toista tämä automaatio muutaman kerran päivässä (esim. 10:00, 14:00, 18:00, 22:00 — yksi automaatio per ajankohta) — jokainen ajo vain korvaa päivän summan tuoreimmalla luvulla, joten useampi ajo päivässä pitää luvun kohtuullisen ajantasaisena ilman jatkuvaa laukaisinta.

### Hae päivän askeleet

1. Lisää toiminto **Etsi terveysnäytteet** (Find Health Samples)
2. Aseta: Näytetyyppi **Steps** (Askeleet), Ajankohta **Tänään**, yhdistelmä **Summa** (Sum)
3. **Lisää suodatin** (Add Filter): **Lähde** (Source Name) **on** *Watchisi nimi* (esim. "Patrikin Apple Watch") — **tärkeää**: ilman tätä suodatinta summa laskee mukaan sekä Watchin että iPhonen omat askelnäytteet (molemmat laitteet kirjaavat askeleet erikseen HealthKitiin), jolloin luku tuplaantuu jos kannat puhelinta mukana Watchin lisäksi
4. Lisää **Aseta muuttuja** -toiminto tuloksen tallentamiseksi muuttujaan `StepCount`
5. Lisää **Muotoile päivämäärä** -toiminto **Nykyiselle päivämäärälle**, muodossa `yyyy-MM-dd`, tallenna muuttujaan `Today`

### Lähetä Supabaseen

**Hae sisältö URL:sta** (Get Contents of URL):
- Metodi: `POST`
- URL: `https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/step_data?on_conflict=step_date`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Runko (JSON):
  ```json
  { "step_date": "[Today]", "steps": [StepCount], "source": "watch" }
  ```

### Testaa

Paina automaation kohdalla **"Kokeile"** (Run) manuaalisesti — tarkista että tälle päivälle ilmestyy rivi `step_data`-tauluun Supabasen dashboardista (Table Editor), ja että uudelleenajo päivittää saman rivin sen sijaan että loisi uuden.

## 8. Unen synkkaus (VANHENTUNUT — poistettu käytöstä v1.31.0:ssa)

Tämä HealthKit-pohjainen unisynkkaus on korvattu käsin syötettävällä unipistemäärällä (0-100) suoraan sovelluksen "Kirjaa uni" -lomakkeella. Jos tämä automaatio on yhä olemassa Shortcuts-sovelluksessa, se voidaan poistaa — sovellus ei enää lue `duration_min`/`deep_sleep_min`/`rem_sleep_min`/`awakenings`-sarakkeita mistään.

Alla oleva ohje on jätetty historialliseksi viitteeksi.

Uni ei ole treenin kaltainen yksittäinen tapahtuma eikä askelten kaltainen jatkuvasti kasvava luku — se on aikaleimattuja vaihejaksoja (kevyt/syvä/REM/hereillä) joita Watch tallentaa yön aikana. Tämä automaatio ajetaan kerran päivässä aamulla, jolloin edellisen yön data on jo kokonaan synkronoitunut.

### Luo automaatio

1. Avaa **Shortcuts** → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Kellonaika** (Time of Day) → valitse aamun ajankohta (esim. 9:00) → aseta **Suorita heti**

### Hae yön unijaksot

Unen eri vaiheet (Core/Deep/REM/Awake) haetaan erikseen, koska kukin tarvitaan omana summanaan tai lukumääränään.

1. Lisää neljä **Etsi terveysnäytteet** (Find Health Samples) -toimintoa, kukin näytetyypillä **Sleep Analysis** (Uni-analyysi), ajankohtana **Viimeiset 24 tuntia** (kokeile myös **Eilen** jos "Viimeiset 24 tuntia" ei osu oikeaan yöhön):
   - Yksi suodattimella (Filter) "Uni-analyysi on Nukkuu (Syvä)" ("Sleep Analysis is Asleep (Deep)")
   - Yksi suodattimella "Uni-analyysi on Nukkuu (REM)" ("Sleep Analysis is Asleep (REM)")
   - Yksi suodattimella "Uni-analyysi on Nukkuu (Kevyt)" ("Sleep Analysis is Asleep (Core)")
   - Yksi suodattimella "Uni-analyysi on Hereillä" ("Sleep Analysis is Awake")
2. Kolmelle ensimmäiselle (Syvä/REM/Kevyt): lisää **Calculate Statistics** -toiminto suoraan sen omaan **Etsi terveysnäytteet** -toiminnon alle (älä lisää kaikkia neljää hakua ensin ja tilastoja vasta perään — koska toimintoja on neljä samannimistä, Shortcuts voi muuten yhdistää tilaston väärään hakuun), operaationa **Summa** (Sum) kestosta (Duration) → tallenna muuttujiin `DeepMin`, `RemMin`, `CoreMin`. Kun lisäät kunkin Calculate Statistics -toiminnon, tarkista Magic Variable -valikosta että se todella viittaa juuri sen yläpuolella olevaan Etsi terveysnäytteet -tulokseen (esim. "Etsi terveysnäytteet Tulos 2"), ei automaattisesti johonkin toiseen hakuun.
3. Neljännelle (Hereillä): lisää **Calculate Statistics** -toiminto samalla periaatteella suoraan sen oman hakunsa alle, operaationa **Lukumäärä** (Count) → tallenna muuttujaan `Awakenings`
4. **Aseta muuttuja** ei osaa itse laskea summia — lisää ensin **Laske**-toiminto laskemaan `DeepMin + RemMin + CoreMin`, ja sen jälkeen **Aseta muuttuja** -toiminto joka tallentaa Laske-toiminnon tuloksen muuttujaan `TotalMin`
5. Lisää **Muotoile päivämäärä** -toiminto **Nykyiselle päivämäärälle**, muodossa `yyyy-MM-dd`, tallenna muuttujaan `Today`

### Lähetä Supabaseen

**Hae sisältö URL:sta** (Get Contents of URL):
- Metodi: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/sleep_data?on_conflict=sleep_date`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Runko (JSON):
  ```json
  { "sleep_date": "[Today]", "duration_min": [TotalMin], "deep_sleep_min": [DeepMin], "rem_sleep_min": [RemMin], "awakenings": [Awakenings] }
  ```

### Testaa

Paina automaation kohdalla **"Kokeile"** (Run) manuaalisesti — tarkista että edelliselle yölle ilmestyy rivi `sleep_data`-tauluun kaikilla neljällä kentällä täytettynä. Tarkat toimintonimet (erityisesti suodatinvaihtoehdot) saattavat poiketa hieman tästä ohjeesta iOS-version mukaan — jos et löydä täsmälleen näitä nimiä, katso mitä suodatinvaihtoehtoja **Etsi terveysnäytteet** todella tarjoaa Uni-analyysi-näytetyypille ja säädä vastaavasti.
