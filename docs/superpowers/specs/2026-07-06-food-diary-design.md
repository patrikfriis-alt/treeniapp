# Treeniapp — Ruokapäiväkirja

**Päivämäärä:** 2026-07-06
**Laajuus:** Uusi "Ruoka"-sivu, tavoiteasetukset sivupalkkiin, Fineli-integraatio
**Riippuvuudet:** `food_cache`, `custom_foods`, `food_log_entries` -taulut on jo luotu Supabaseen (migraatio `20260706_food_diary.sql`). Tämä speksi lisää kaksi täydentävää migraatiota (meal_type-sarake, nutrition_goals-taulu) ja määrittää sovelluspuolen toteutuksen.

---

## Tavoite

Lisätä Treeniapp:iin ruokapäiväkirja, jossa käyttäjä voi hakea ruokia THL:n Fineli-tietokannasta, kirjata syömisensä ateriaryhmittäin (aamiainen/lounas/päivällinen/välipala), asettaa päivä- ja viikkotason ravintotavoitteet (kcal/proteiini/hiilarit/rasva) ja seurata edistymistä niitä vasten.

Sovellus on yhden käyttäjän henkilökohtainen työkalu ilman Supabase Authia (sama arkkitehtuuri kuin muissa tauluissa: anon-avain, RLS päällä mutta sallii `anon`+`authenticated`-rooleille täyden pääsyn). "Omistajuus" RLS-käytännöissä on nimellinen — ei teknisesti auth.uid()-pohjaisesti pakotettu, ellei Auth oteta myöhemmin erikseen käyttöön.

---

## 1. Datamalli

### Olemassa olevat taulut (jo migroitu)

```sql
food_cache (id, fineli_id, name_fi, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at)
custom_foods (id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at)
food_log_entries (id, logged_at, food_cache_id, custom_food_id, amount_g, kcal, protein_g, created_at)
```

### Uusi migraatio 1 — `meal_type`

```sql
alter table food_log_entries
  add column meal_type text not null
  check (meal_type in ('aamiainen','lounas','paivallinen','valipala'));
```

Ei defaulttia — käyttäjä valitsee aterian aina napauttamalla kyseisen ateriakortin "+ Lisää ruoka" -nappia, joten arvo on aina eksplisiittisesti tiedossa lisäyshetkellä.

### Uusi migraatio 2 — `nutrition_goals`

```sql
create table nutrition_goals (
  id                bigint primary key default 1 check (id = 1),
  daily_kcal        numeric,
  daily_protein_g   numeric,
  daily_carbs_g     numeric,
  daily_fat_g       numeric,
  weekly_kcal       numeric,
  weekly_protein_g  numeric,
  weekly_carbs_g    numeric,
  weekly_fat_g      numeric,
  updated_at        timestamptz not null default now()
);

alter table nutrition_goals enable row level security;

create policy nutrition_goals_select on nutrition_goals
  for select to anon, authenticated using (true);
create policy nutrition_goals_upsert on nutrition_goals
  for insert to anon, authenticated with check (true);
create policy nutrition_goals_update on nutrition_goals
  for update to anon, authenticated using (true) with check (true);
```

Singleton-taulu (`id = 1` pakotettu checkillä) — päivä- ja viikkotavoitteet ovat erillisiä lukuja, ei automaattisesti laskettuja toisistaan (käyttäjä voi joustaa päivien välillä pysyen viikkobudjetissa).

### Laskennan periaate

- `kcal` ja `protein_g` `food_log_entries`-rivillä ovat kirjaushetken snapshotteja (`kcal_per_100g × amount_g / 100`), luetaan suoraan ilman liitosta.
- Hiilihydraatit ja rasva **lasketaan liitoksen kautta** lukuhetkellä: `carbs_per_100g`/`fat_per_100g` haetaan `food_cache`- tai `custom_foods`-taulusta (kumpi FK on asetettu) ja kerrotaan `amount_g / 100`:lla. Cache-rivit ovat muuttumattomia luonnin jälkeen, joten liitos on aina luotettava eikä vaadi omaa snapshottia.
- Viikkototaali lasketaan ISO-viikon (maanantai–sunnuntai) yli, samalla tavalla kuin Treeni-sivun viikkonavigointi jo laskee (`getISOWeekKey`/`wStart`-logiikka on uudelleenkäytettävissä).

---

## 2. Navigaatio ja sivurakenne

**Alanavigaatio:** uusi 4. painike `🍽️ Ruoka` lisätään `<nav>`-palkkiin: `<button onclick="showPage('ruoka',this)"><span class="nav-icon">🍽️</span><span>Ruoka</span></button>`.

**Uusi sivu `#page-ruoka`:**

```
┌─────────────────────────────────────┐
│  ← 6.7.2026 →                       │  päivänavigointi
│                                     │
│  ┌─ Hero-kortti ─────────────────┐  │
│  │ TÄNÄÄN · RUOKA                │  │
│  │ 1 480 / 2 200 kcal            │  │
│  │ [Proteiini][Hiilarit][Rasva]  │  │
│  └───────────────────────────────┘  │
│  Viikko: 8 400 / 15 400 kcal        │  kevyt rivi heron alla
│                                     │
│  🌅 Aamiainen · 320 kcal            │
│    Kaurapuuro 250g      180 kcal    │
│    Banaani 1 kpl        105 kcal    │
│    [+ Lisää ruoka]                  │
│                                     │
│  ☀️ Lounas · 0 kcal                 │
│  🌇 Päivällinen · 0 kcal            │
│  🍎 Välipala · 0 kcal               │
└─────────────────────────────────────┘
```

Jos tavoitteita ei ole asetettu (`nutrition_goals`-taulu tyhjä), hero-kortti näyttää vain toteutuneen summan ilman `/ tavoite`-osaa, ja viikkorivi jää piiloon.

Hero-kortin muoto noudattaa hyväksyttyä mockupia tarkasti: iso kcal-luku näyttää `toteutunut / tavoite`, mutta kolme pientä alamittaria (Proteiini/Hiilarit/Rasva) näyttävät vain toteutuneen määrän (esim. "92g"), ei tavoitetta rinnalla — tavoitteiden vertailu näihin kolmeen tehdään vain asetuslomakkeessa, ei hero-kortissa.

**Sivupalkki (Asetukset):** nykyinen "Tulossa pian..." -platsholderi korvataan `Ravintotavoitteet`-rivillä, joka avaa lomakkeen kahdeksalle kentälle (päivä/viikko × kcal/proteiini/hiilarit/rasva).

**Merkinnän napautus** avaa pienen muokkausdialogin (grammakenttä esitäytettynä + Tallenna/Poista) — ei koko hakumodaalia uudestaan.

---

## 3. Ydintoiminnot

### Ruoan lisääminen

1. Ateriakortin "+ Lisää ruoka" avaa koko ruudun hakumodaalin, otsikossa valittu ateria.
2. Modaali avautuessaan näyttää **"Viimeksi käytetyt"** — käyttäjän omista `food_log_entries`-riveistä poimitut useimmin/viimeksi käytetyt ruoat (liitos `food_cache`/`custom_foods`-tauluihin, esim. `order by count(*) desc` viimeisen 30 päivän ajalta, top 5-8).
3. Hakukenttään kirjoitettaessa (debounce ~300ms) haetaan live Fineli-API:sta (`GET https://fineli.fi/fineli/api/v1/foods?q=...`), tulokset korvaavat "Viimeksi käytetyt" -listan. CORS on avoin (`access-control-allow-origin: *`, varmistettu aiemmin), joten kutsu tehdään suoraan selaimesta ilman proxya.
4. Tuloksen valinta avaa määrävaiheen: grammakenttä (oletus 100g) + pikavalintanapit 50/100/150/200g.
5. "Lisää":
   - jos Fineli-tulos ei vielä ole `food_cache`-taulussa (tarkistus `fineli_id`:llä), upsertataan se sinne ensin
   - lasketaan `kcal` ja `protein_g` annetusta määrästä
   - luodaan `food_log_entries`-rivi (`meal_type`, `logged_at`, `food_cache_id`, `amount_g`, `kcal`, `protein_g`)
6. Jos hausta ei löydy sopivaa: **"+ Lisää oma tuote"** -linkki tulosten alla → lomake (nimi, kcal/proteiini/hiilarit/rasva per 100g) → tallennus `custom_foods`-tauluun → sama määrävaihe kuin yllä, mutta `custom_food_id`:llä.

### Merkinnän muokkaus/poisto

Napautus avaa dialogin: grammakenttä esitäytettynä nykyisellä arvolla + "Tallenna" (päivittää `amount_g`, `kcal`, `protein_g` uudelleenlaskettuna) ja "Poista" (poistaa rivin).

### Päivä- ja viikkonavigointi

`← →` -painikkeet vaihtavat `logged_at`-suodattimen ja lataavat kyseisen päivän merkinnät + hero-kortin uudelleen. Viikkorivi laskee aina saman ISO-viikon summan riippumatta katsotusta päivästä.

### Tavoiteasetukset

Sivupalkin lomake tekee upsertin `nutrition_goals`-tauluun (`id=1`).

---

## 4. Virheenkäsittely

- **Fineli-haku epäonnistuu** (verkkovirhe/timeout): inline-viesti "Haku epäonnistui, yritä uudelleen" tulosalueella, modaali pysyy auki, "Viimeksi käytetyt" säilyy näkyvissä jos jo ladattu.
- **Tyhjä hakutulos:** "Ei tuloksia" + korostettu "+ Lisää oma tuote" -linkki.
- **Supabase-kirjoitus epäonnistuu** (cache-upsert, log-insert, custom_food-insert, goals-upsert): näkyvä virheilmoitus, lomake/modaali pysyy auki eikä tyhjennä syötettyä dataa, jotta yritys voidaan uusia.
- **Määrävaihe:** "Lisää"/"Tallenna" on disabloitu jos grammakenttä on tyhjä, nolla tai negatiivinen; tietokannan `check (amount_g > 0)` on viimeinen varmistus.
- **`food_log_entries_one_source`-check** (täsmälleen yksi FK asetettu) ei voi rikkoutua client-koodista, koska UI-polku asettaa aina vain toisen viittauksen kerrallaan.

---

## 5. Testaus ja varmennus

Repossa ei ole automaattitestikehystä (vanilla JS, ei build-vaihetta) — varmennus tehdään manuaalisesti selaimessa toteutuksen jälkeen:

- Fineli-haku → tuloksen valinta → määrän syöttö → merkintä ilmestyy oikeaan ateriaan, hero-kortti päivittyy
- "Viimeksi käytetyt" näyttää aiemmin lisätyn ruoan heti modaalin avatessa
- Oman tuotteen luonti kun Finelistä ei löydy
- Merkinnän muokkaus (määrän muutos) ja poisto
- Päivänavigointi ← → näyttää oikean päivän merkinnät, viikkorivi laskee oikein ISO-viikon yli
- Tavoiteasetusten tallennus ja niiden näkyminen hero-kortin tavoitearvoina
- Virhetilanne: katkaistu verkko haun aikana ei kaada modaalia

Ei suorituskyky- tai kuormitustestejä — yhden käyttäjän henkilökohtainen sovellus.

---

## Rajaukset (ei tässä versiossa)

- Ei Supabase Authia / oikeaa monikäyttäjätukea — RLS-omistajuus on nimellinen
- Ei offline-kirjoitusjonoa (sama kuin muualla sovelluksessa — ei indexedDB/queue-logiikkaa)
- Ei viivakoodiskanneria
- Ei annoskoko-valitsinta (Finelin `units`-lista) — pelkkä grammamäärä + pikavalintanapit
- Ei ravintoainehistoriakäyriä/trendigraafeja ensimmäisessä versiossa (voidaan lisätä myöhemmin samaan tapaan kuin Seuranta-sivun historiagraafit)
