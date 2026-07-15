# Treeniapp (Valkku) — Askelseuranta

**Päivämäärä:** 2026-07-15
**Laajuus:** Askelmäärän seuranta puuttuu sovelluksesta kokonaan, vaikka kaikki muu Apple Watch/Health-data (treenit, uni, paino) syötetään jo automaattisesti Shortcuts-automaatioiden kautta. Tämä spec lisää askeleet samaan malliin: automaattinen syöttö, näkyvyys Koonti-sivulla, päivätavoite ja valmentajan konteksti.
**Riippuvuudet:** Olemassa oleva Apple Shortcuts -synkronointimalli (`docs/apple-watch-shortcuts-guide-en.md`, `docs/apple-watch-shortcuts-guide.md`), olemassa oleva `openMetricModal`-jaettu modaali, olemassa oleva `app_settings`-singleton-taulu, olemassa oleva `coach-chat`-Edge Functionin `context.ts`-datakonteksti.

---

## Tausta

Käyttäjä huomasi askelmäärän puuttuvan kokonaan sovelluksesta. Kaikki muu päivittäinen HealthKit-data (uni, paino, treenit) syötetään jo Shortcuts-automaatioiden kautta suoraan Supabaseen — askeleet on looginen lisäys samaan malliin. Feasibility varmistettu manuaalisesti: Shortcuts-sovelluksen "Find Health Samples" -toiminto (eri toiminto kuin nykyisin käytetty "Find Workouts") tukee "Steps"-tyyppistä Health-näytettä.

Tämä on ensimmäinen kahdesta suunnitellusta projektista — toinen (laajennetut edistymisnäkymät ja progressioehdotukset) rakennetaan tämän päälle myöhemmin, hyödyntäen mm. tätä askeldataa.

---

## 1. Tietomalli

Uusi taulu, yksi rivi per päivä (samantyyppinen kuin `sleep_data`):

```sql
create table step_data (
  id          uuid primary key default gen_random_uuid(),
  step_date   date not null unique,
  steps       integer not null,
  source      text default 'watch',
  updated_at  timestamptz not null default now()
);

alter table step_data enable row level security;

create policy step_data_select on step_data
  for select to anon, authenticated using (true);
create policy step_data_insert on step_data
  for insert to anon, authenticated with check (true);
create policy step_data_update on step_data
  for update to anon, authenticated using (true) with check (true);
```

Ei delete-policya (ei manuaalista poisto-UI:ta tässä vaiheessa). `step_date`-kentän `unique`-rajoite mahdollistaa upsertin `on_conflict=step_date`-parametrilla.

`app_settings`-tauluun lisätään uusi sarake päivätavoitetta varten:

```sql
alter table app_settings add column daily_steps_goal integer;
```

---

## 2. Syöttömekanismi

Askeleet eivät ole yksittäinen tapahtuma kuten treenin päättyminen, joten syöttö ei voi nojata olemassa olevaan "Workout"-triggeriin. Sen sijaan: uusi **aikaperusteinen** henkilökohtainen automaatio, joka ajetaan muutaman kerran päivässä (esim. 2–3 tunnin välein valveillaoloaikana). Jokainen ajo:

1. Hakee **Find Health Samples** -toiminnolla päivän askeleet (Sample Type: Steps, aikaväli: tänään, aggregointi: Sum).
2. Lähettää `POST`-pyynnön:
   - URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/step_data?on_conflict=step_date`
   - Headerit: `apikey`/`Authorization` (sama anon key kuin muissa automaatioissa), `Content-Type: application/json`, `Prefer: resolution=merge-duplicates`
   - Body: `{ "step_date": "[Today, muodossa yyyy-MM-dd]", "steps": [StepCount], "source": "watch" }`

Koska jokainen ajo korvaa koko päivän `steps`-arvon tuoreimmalla kokonaissummalla, päivän sisäistä historiaa ei säilytetä — tarvitaan vain kunkin päivän lopullinen luku.

`docs/apple-watch-shortcuts-guide-en.md` ja `docs/apple-watch-shortcuts-guide.md` laajenevat uudella "Step Count Sync" -osiolla, samalla formaatilla kuin nykyiset ohjeet (numeroidut vaiheet, sama header-rakenne, Troubleshooting-lisäys askelrivin puuttumisen varalle).

---

## 3. Käyttöliittymä

**Koonti-sivu, "Mittarit"-osio:** kolmas kortti Keho/Uni-korttien rinnalle, otsikolla "Askeleet" (`koonti-card`-rakenne, kävely/juoksu-tyylinen ikoni). Kortti näyttää tämän päivän askelmäärän alarivinä, ja jos `daily_steps_goal` on asetettu, edistymisen tavoitteeseen (sama visuaalinen malli kuin Aerobinen-kortin `koonti-card-goal`).

Klikkaus avaa `openMetricModal`-pohjaisen modaalin (ei uutta erillistä sivua — askeleilla ei ole manuaalista syöttöä tai muokkausta, joten kevyt modaali riittää). Modaali näyttää:
- Tämän päivän askeleet
- Tämän viikon päiväkeskiarvo
- Tavoite ja edistyminen, jos `daily_steps_goal` asetettu; muuten ei tavoiteriviä

**Asetukset:** uusi rivi olemassa olevaan asetusnäkymään (Kalorikerroin/Kestävyystavoitteet-rivien tapaan), jossa `daily_steps_goal`-arvo voidaan asettaa tai jättää tyhjäksi.

---

## 4. Valmentajan konteksti

`supabase/functions/coach-chat/context.ts`:n `buildDataContext()` laajenee hakemaan `step_data`-rivit samalta 12 viikon ikkunalta kuin muu viikkoyhteenveto-data, ja liittää päiväkeskiarvon jokaisen viikon riville olemassa olevaan "Viikkoyhteenvedot"-lohkoon (samaan riviin salikäyntien/aktiviteettien/unen/painon kanssa, ei omaa erillistä lohkoa). Näin valmentaja näkee askeltrendit heti jokaisessa vastauksessaan ja voi viitata niihin sekä tallentaa pysyviä havaintoja niistä `coach_notes`-mekanismin kautta (ks. `2026-07-15-valmentajan-muistiinpanot-design.md`).

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Aseta uusi Shortcuts-automaatio puhelimeen, aja se manuaalisesti — tarkista että `step_data`-riviä ilmestyy Supabaseen tälle päivälle.
2. Aja automaatio uudelleen — tarkista että sama päivän rivi päivittyy (ei kahdennu).
3. Tarkista että Koonti-sivun "Askeleet"-kortti näyttää tämän päivän askelmäärän.
4. Aseta päivätavoite asetuksista, tarkista että modaali näyttää edistymisen tavoitteeseen.
5. Kysy valmentajalta askeleista — tarkista että se viittaa oikeaan dataan vastauksessaan, ja että pysyvät muistiinpanot päivittyvät jos jokin toistuva havainto ilmenee.
