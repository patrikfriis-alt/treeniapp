# Treeniapp — Kestävyystavoitteet

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 1 osa 3/4. Lisää viikkotasoiset kestävyystavoitteet (km, kerrat, tavoitevauhti) mallinnettuna suoraan olemassa olevan ravintotavoite-toiminnon (`nutrition_goals`) mukaan.
**Riippuvuudet:** Ei riipu Ohjelmaeditorista tai Kalenterijoustosta (molemmat jo mergetty). Käyttää `activity_data`-taulua (olemassa) laskentaan.

---

## Tavoite

Ravintopuolella on jo täysi tavoiteasetus ja edistymän seuranta (`nutrition_goals`-taulu, `openGoalsModal()`, kcal/makrot päivä- ja viikkotasolla food-heron alla). Kestävyyspuolella (Aerobia-sivu) ei ole vastaavaa — käyttäjä ei voi asettaa viikkokilometritavoitetta, kertamäärätavoitetta eikä tavoitevauhtia, eikä nähdä edistymää niitä vasten. Tavoite: sama toiminnallisuus kestävyyspuolelle, samalla UI-mallilla.

---

## 1. Datamalli

```sql
create table activity_goals (
  id                       bigint primary key default 1 check (id = 1),
  weekly_km                numeric,
  weekly_sessions          integer,
  target_pace_min_per_km   numeric,
  updated_at               timestamptz not null default now()
);

alter table activity_goals enable row level security;

create policy activity_goals_select on activity_goals
  for select to anon, authenticated using (true);
create policy activity_goals_insert on activity_goals
  for insert to anon, authenticated with check (true);
create policy activity_goals_update on activity_goals
  for update to anon, authenticated using (true) with check (true);
```

Yksi rivi (`id=1`, sama upsert-malli kuin `nutrition_goals`), kaikki kentät valinnaisia — `null` tarkoittaa ettei kyseiselle mittarille ole asetettu tavoitetta, jolloin sitä ei näytetä edistymänäkymässä.

---

## 2. Asetusmodaali

Uusi rivi Valikkoon (sidebar), `openGoalsModal()`-napin viereen samalla ulkoasulla:

```html
<button onclick="openActivityGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
  <span style="font-size:18px;">🏃</span> Kestävyystavoitteet
</button>
```

`openActivityGoalsModal()` rakentuu identtisesti `openGoalsModal()`:n kanssa (sama overlay/modal-runko, sama `field()`-apufunktion käyttö kolmelle kentälle: "Viikko-km", "Viikkokerrat", "Tavoitevauhti (min/km)"), `saveActivityGoals()`-funktio peilaa `saveNutritionGoals()`:a (upsert `id:1`-riviin).

---

## 3. Edistymän laskenta ja näyttö

Uusi `loadActivityGoalProgress()` hakee kuluvan viikon (ma-su, sama viikkorajaus kuin `loadWeekSummary()` käyttää) `activity_data`-rivit ja laskee:
- `totalKm` — `sum(distance_km)`
- `sessionCount` — rivien lukumäärä (sama luku jo laskettu `ws-act`:lle `loadWeekSummary()`:ssa — uudelleenkäytetään sitä, ei lasketa kahdesti)
- `avgPace` — painotettu keskivauhti (`sum(duration_min) / sum(distance_km)` niiltä riveiltä joilla molemmat kentät ovat asetettuja)

**Aerobia-sivu:** uusi kortti "Viikkotavoite" lisätään hero-osion jälkeen (`aerobia-treeni`-lohkoon, ennen kirjauslomaketta). Piilossa (`display:none`) jos yhtäkään kolmesta tavoitteesta ei ole asetettu — sama malli kuin Ruoka-sivun `food-week-row`. Näyttää rivin per asetettu tavoite: "12 / 20 km", "2 / 3 kertaa", "ka 5:45 (tavoite 5:30 min/km)".

**Koonti-kortti:** `loadKoonti()`:n Aerobia-kortin logiikkaan lisätään toinen, pienempi teksti-rivi nykyisen "Juoksu · 6 min (pvm)" -rivin alle, näkyy vain jos tavoitteita on asetettu: "12/20 km · 2/3 krt".

---

## 4. Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Aseta kaikki kolme tavoitetta modaalista, tallenna — Aerobia-sivulla "Viikkotavoite"-kortti ilmestyy oikeilla luvuilla.
2. Poista yksi tavoite (tyhjennä kenttä, tallenna) — vastaava rivi katoaa kortista, muut säilyvät.
3. Poista kaikki kolme — kortti piiloutuu kokonaan.
4. Koonti-sivulla Aerobia-kortti näyttää lyhyen edistymärivin kun tavoitteita on asetettu.
5. Kirjaa uusi aktiviteetti Aerobia-sivulta — edistymä päivittyy sekä Aerobialla että Koonnissa seuraavalla latauksella.
