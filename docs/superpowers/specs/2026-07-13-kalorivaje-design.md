# Treeniapp (Valkku) — Kalorivaje

**Päivämäärä:** 2026-07-13
**Laajuus:** Uusi ominaisuus. Päivän ja viikon kalorivajeen/-ylijäämän laskenta ja näyttö Koonti-sivulla.
**Riippuvuudet:** Uusi migraatio (`user_profile`-taulu). Käyttää olemassa olevaa `body_metrics`-, `activity_data`-, `workout_sessions`- ja `food_log_entries`-dataa, sekä nykyistä `app_settings.calorie_correction`-korjauskerrointa.

---

## Tavoite

Näyttää käyttäjälle kuinka paljon hän on kuluttanut energiaa yli/alle syömänsä määrän — sekä tänään että kuluvalla viikolla. Luvun pitää olla oikeasti mielekäs (perustua lepoaineenvaihduntaan, ei vain kirjattuun liikuntaan), mutta ei vaatia raskasta profiilinasetusta.

---

## 1. Profiili

Uusi kertaluontoinen asetus sivupalkkiin ("Profiili"), samaan tyyliin kuin nykyinen Kalorikerroin-modaali. Kolme kenttää:

- **Sukupuoli** (mies/nainen) — tarvitaan BMR-kaavaan.
- **Pituus (cm)**
- **Syntymäaika** — ikä lasketaan tästä aina automaattisesti oikein, ei vaadi vuosittaista päivitystä.

Paino haetaan aina tuoreimmasta `body_metrics`-mittauksesta — ei tallenneta profiiliin erikseen.

---

## 2. BMR-kaava (lepoaineenvaihdunta)

Kaksiportainen, riippuen onko tuoreimmassa painomittauksessa rasva%-arvo:

**Jos tuoreimmassa mittauksessa on `fat_pct`:** Katch-McArdle (tarkempi, huomioi lihasmassan):
```
lihasmassa_kg = paino_kg × (1 − rasva% / 100)
BMR = 370 + 21.6 × lihasmassa_kg
```

**Muuten:** Mifflin-St Jeor (ei vaadi kehonkoostumusta):
```
mies:  BMR = 10×paino_kg + 6.25×pituus_cm − 5×ikä + 5
nainen: BMR = 10×paino_kg + 6.25×pituus_cm − 5×ikä − 161
```

BMR lasketaan uudelleen joka kerta kun Koonti-sivu ladataan (ei tallenneta) — käyttää aina tuoreinta painomittausta ja senhetkistä ikää.

---

## 3. Päivän vaje

```
päivän vaje = BMR + päivän liikuntakalorit − päivän syödyt kalorit
```

- **Liikuntakalorit** = `activity_data.calories` (kerrottuna nykyisellä `app_settings.calorie_correction`-tekijällä, sama korjaus jota jo käytetään Aktiviteetit-sivulla) summattuna + `workout_sessions.calories` (Sali-treenin Apple Watch -kalorit, ei korjausta koska tämä ei ole sama epätarkkuuslähde). Molemmat lasketaan kyseiseltä päivämäärältä.
- **Syödyt kalorit** = `food_log_entries.kcal` summattuna kyseiseltä päivältä.
- **Ei aktiivisuustaso-kerrointa** — liikunta lasketaan vain kertaalleen, suoraan kirjatusta datasta (päätetty aiemmin: välttää tuplalaskennan).

Positiivinen luku = vaje (poltettu enemmän kuin syöty). Negatiivinen = ylijäämä. Näytetään neutraalisti ilman vihreä/punainen-arvottelua, koska tavoitesuunta (laihdutus/ylläpito/lihaskasvu) on käyttäjäkohtainen.

---

## 4. Viikon vaje

```
viikon vaje = BMR × kuluneet_päivät + viikon liikuntakalorit − viikon syödyt kalorit
```

- `kuluneet_päivät` = montako päivää kuluvasta (Sali-sivulla parhaillaan valitusta, `wOff`-muuttujan mukaisesta) viikosta on jo mennyt: jos tarkastellaan nykyistä viikkoa (`wOff === 0`), käytetään tämänhetkistä viikonpäivä-indeksiä (Ma=1 … Su=7); jos tarkastellaan mennyttä viikkoa, käytetään aina 7. Sama malli kuin nykyisessä "Tällä viikolla" -kortissa, joka jo reagoi `wOff`:iin.
- Liikunta- ja syöty-summat lasketaan samalla tavalla kuin nykyiset "Salikertoja"/"Aktiviteettikertoja"-rivit: yksi aggregoitu kysely koko viikon ajalta, ei päiväkohtaista erittelyä (BMR:n oletetaan pysyvän vakiona koko viikon, koska painonvaihtelu viikon sisällä on merkityksetöntä laskennan tarkkuuden kannalta).

---

## 5. Puuttuva data

Jos profiilia (sukupuoli/pituus/syntymäaika) ei ole vielä asetettu TAI yhtään painomittausta ei löydy `body_metrics`-taulusta, hero-mittari näyttää luvun sijaan lyhyen "Aseta profiili →" -linkin, joka avaa profiilimodaalin suoraan. "Tällä viikolla" -kortin vaje-rivi piilotetaan kokonaan samassa tilanteessa (sama malli kuin nykyiset rivit, jotka piilotetaan jos dataa ei ole, esim. "Kilometrit"-rivi).

Päivä jolta ei löydy ruokakirjauksia näyttää vajeen silti normaalisti (BMR + liikunta − 0), koska se on teknisesti oikea luku, ei puuttuva tieto.

---

## 6. Tietokanta

Uusi migraatio:

```sql
create table user_profile (
  id         bigint primary key default 1 check (id = 1),
  sex        text check (sex in ('male','female')),
  height_cm  numeric,
  birth_date date,
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

create policy user_profile_select on user_profile
  for select to anon, authenticated using (true);
create policy user_profile_insert on user_profile
  for insert to anon, authenticated with check (true);
create policy user_profile_update on user_profile
  for update to anon, authenticated using (true) with check (true);
```

(Ei delete-policya — rivi on aina täsmälleen yksi, `id=1`, sama malli kuin `app_settings`.)

---

## 7. Näyttö

**Hero-mittari** ("Päivän vaje"): lisätään Koonti-sivun toiseen hero-mittari-riviin (nykyisin "viikon aktiivisuus" + "kuukausi", 2 saraketta) kolmanneksi mittariksi, rivi muutetaan 3-sarakkeiseksi (sama tyyli kuin ylin rivi). Ikoni: uudelleenkäytetään olemassa olevaa `scale`-ikonia (energiatasapaino-metafora), neutraali harmaa väri kuten "kuukausi"-mittarilla. Muoto: `+420 kcal` tai `−180 kcal`.

**"Tällä viikolla" -kortti**: uusi rivi "Viikon vaje" olemassa olevien rivien (Salikertoja, Aktiviteettikertoja, Kilometrit, Unen keskiarvo, Painon muutos) joukkoon, samalla `hist-item`/`hist-val`-tyylillä. Ei delta-vertailua edelliseen viikkoon (ei tarvita speksin mukaan, samaan tapaan kuin "Painon muutos" ei näytä omaa deltaansa).

**Sivupalkki**: uusi "Profiili"-rivi Asetukset-osioon, Kalorikerroin-rivin viereen, sama ikonityyli.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Ennen profiilin asettamista: Koonti näyttää "Aseta profiili →" hero-mittarin sijaan, "Tällä viikolla" -kortin vaje-rivi on piilossa.
2. Aseta profiili (sukupuoli, pituus, syntymäaika) sivupalkista. Tarkista tallennus onnistuu ja Koonti päivittyy.
3. Tarkista BMR-kaavan valinta: jos tuorein painomittaus sisältää rasva%:n, tarkista laskettu arvo vastaa Katch-McArdlea käsin laskien; jos ei sisällä, tarkista Mifflin-St Jeor.
4. Kirjaa päivälle ruokaa ja/tai aktiviteetti, tarkista päivän vaje päivittyy oikein molempien suuntaan.
5. Tarkista viikon vaje kasvaa/pienenee oikein kuluneiden päivien mukaan, ja että mennyttä viikkoa tarkasteltaessa (`wOff !== 0`) käytetään täyttä 7 päivää BMR-kertoimena.
6. Tarkista negatiivinen vaje (ylijäämä) näkyy oikealla etumerkillä ("−180 kcal") ilman väriarvottelua.
