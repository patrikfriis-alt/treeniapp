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

Lisää **Jos**-toiminto (If): `WorkoutType` **sisältää** `Strength`

### Jos KYLLÄ (sali):

**Hae sisältö URL:sta** (Get Contents of URL):
- Metodi: `PATCH`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/workout_sessions?workout_date=eq.[EndDate]`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
- Pyynnön runko (JSON):
  ```json
  { "calories": [Calories], "avg_heart_rate": [AvgHR] }
  ```

### Jos EI — toinen sisäkkäinen Jos: `WorkoutType` **sisältää** `Run`

**Get Contents of URL:**
- Metodi: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/activity_data?on_conflict=healthkit_uuid`
- Headerit: sama `apikey`/`Authorization`/`Content-Type` + `Prefer`: `resolution=merge-duplicates`
- Runko:
  ```json
  {
    "activity_date": "[EndDate]",
    "activity_type": "Juoksu",
    "duration_min": [Duration],
    "calories": [Calories],
    "avg_heart_rate": [AvgHR],
    "distance_km": [Distance],
    "source": "watch",
    "healthkit_uuid": "[WorkoutUUID]"
  }
  ```

### Jos EI — toinen sisäkkäinen Jos: `WorkoutType` **sisältää** `Walk`

Sama kuin yllä, mutta `"activity_type": "Kävely"`.

### Jos EI — toinen sisäkkäinen Jos: `WorkoutType` **sisältää** `Hockey`

Sama kuin yllä, mutta `"activity_type": "Jääkiekko"`.

### Muuten (kaikki muut tyypit)

Sama rakenne, mutta `"activity_type": "[WorkoutType]"` (Watchin oma nimi sellaisenaan Magic Variablena).

## 5. Testaa

Paina Shortcutsin automaation kohdalla **"Kokeile"** (Run) manuaalisesti ilman että teet oikeaa treeniä — jos sinulla on äskettäin päättynyt Watch-treeni Health-sovelluksessa, "Etsi treenit" löytää sen ja voit varmistaa että data menee oikeaan tauluun Supabasen dashboardista (Table Editor).

## 6. Vianetsintä

- Jos rivi ei ilmesty: tarkista että anon-avain on oikein kopioitu (löytyy `index.html`:n `SB_KEY`-vakiosta), ja että migraatiotiedosto `supabase/migrations/20260708_apple_watch_sync.sql` on ajettu.
- Jos sali-kalorit eivät päivity: varmista että olet merkinnyt kyseisen päivän session "tehdyksi" Treeniapista ennen tai pian Watch-treenin jälkeen — `workout_sessions`-rivi täytyy olla olemassa jotta `PATCH` löytää sen.
- Jos tallennus epäonnistuu virheellä joka viittaa `avg_heart_rate`-kenttään: varmista että käytit **Pyöristä numero** -toimintoa `AvgHR`-muuttujalle vaiheessa 3 — HealthKitin desimaaliluku voi hylkääntyä jos tietokannan sarake ei hyväksy desimaaleja.
- Jos askeleet eivät koskaan ilmesty: tarkista että migraatiotiedosto `supabase/migrations/20260715_step_data.sql` on ajettu, ja että Shortcutsilla on lupa lukea askeleita Health-sovelluksen tietosuoja-asetuksista (Health-sovellus → profiilikuvake → Sovellukset → Shortcuts → Askeleet-lupa päällä).

## 7. Askelmäärän synkkaus

Askeleet eivät liity yksittäiseen treeniin, joten tämä tarvitsee toisen, erillisen henkilökohtaisen automaation, joka toimii aikataulun eikä treenilaukaisimen mukaan.

### Luo automaatio

1. Avaa **Shortcuts** → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Kellonaika** (Time of Day) → valitse aika (esim. 10:00) → aseta **Suorita heti**
3. Toista tämä automaatio muutaman kerran päivässä (esim. 10:00, 14:00, 18:00, 22:00 — yksi automaatio per ajankohta) — jokainen ajo vain korvaa päivän summan tuoreimmalla luvulla, joten useampi ajo päivässä pitää luvun kohtuullisen ajantasaisena ilman jatkuvaa laukaisinta.

### Hae päivän askeleet

1. Lisää toiminto **Etsi terveysnäytteet** (Find Health Samples)
2. Aseta: Näytetyyppi **Steps** (Askeleet), Ajankohta **Tänään**, yhdistelmä **Summa** (Sum)
3. Lisää **Aseta muuttuja** -toiminto tuloksen tallentamiseksi muuttujaan `StepCount`
4. Lisää **Muotoile päivämäärä** -toiminto **Nykyiselle päivämäärälle**, muodossa `yyyy-MM-dd`, tallenna muuttujaan `Today`

### Lähetä Supabaseen

**Get Contents of URL:**
- Metodi: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/step_data?on_conflict=step_date`
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
