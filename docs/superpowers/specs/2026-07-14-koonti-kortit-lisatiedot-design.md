# Treeniapp (Valkku) — Koonti-korttien lisätiedot

**Päivämäärä:** 2026-07-14
**Laajuus:** Koonti-sivun 6 yläkortin ("streak", "viikon sali", "viikon aktiiv.", "viikon aktiivisuus", "kuukausi", "päivän kalorit") muuttaminen klikattaviksi, avaten lisätietoja sisältävän modaalin. Sisältää myös kaksi pientä, samaan koodialueeseen liittyvää korjausta: kalorimerkin etumerkin kääntö ja Aerobinen-kortin samapäiväisyys-bugi.
**Riippuvuudet:** Käyttää olemassa olevaa dataa (`workout_sets`, `activity_data`, `sleep_data`, `body_metrics`, `food_log_entries`, `workout_sessions`, `user_profile`). Ei uusia tietokantatauluja tai -sarakkeita. Laajentaa kalorivaje-ominaisuutta (v1.17.0).

---

## Tausta

Live-käytön yhteydessä havaittiin kolme löydöstä:

1. Koonti-sivun 6 yläkorttia (streak, viikon sali, viikon aktiiv., viikon aktiivisuus, kuukausi, päivän vaje) eivät reagoi klikkaukseen — käyttäjä ei pääse näkemään mistä luku koostuu.
2. "Aerobinen"-kortti Koonti-sivun TÄNÄÄN-osiossa näytti väärän aktiviteetin: kysely hakee viimeisimmän `activity_data`-rivin järjestettynä `activity_date desc`, mutta ei käytä toissijaista järjestystä. Kun samalle päivälle on kirjattu kaksi aktiviteettia (esim. juoksu ja myöhemmin samana iltana/seuraavana aamuna kirjattu kävely), kysely voi palauttaa kumman tahansa niistä sattumanvaraisesti tasapelin sattuessa — ei välttämättä viimeksi kirjattua.
3. "Päivän vaje" -mittarin etumerkki on vastakkainen kuin käyttäjä odottaa: nykyinen kaava näyttää kalorivajeen (poltettu enemmän kuin syöty) positiivisena lukuna. Käyttäjä haluaa etumerkin käännettäväksi niin, että vaje (hyvä suunta laihdutuksessa) näkyy negatiivisena ja ylijäämä positiivisena — sama konventio kuin monissa muissa kalorisovelluksissa ("net-tase").

---

## 1. Klikattavat kortit — yleinen interaktiomalli

Jokainen 6 kortista saa `cursor:pointer`-tyylin ja `onclick`-käsittelijän, joka avaa jaetun kevyen modaalin (sama visuaalinen tyyli kuin olemassa olevat Profiili-/Kalorikerroin-modaalit: tumma kortti, sulje ✕, ei sivunavigointia). Modaalin sisältö rakennetaan kortin mukaan.

"Päivän kalorit" -kortti säilyttää nykyisen käytöksensä kun profiilia ei ole asetettu (klikkaus avaa Profiili-modaalin). Kun profiili on asetettu, klikkaus avaa sen sijaan uuden erittely-modaalin.

---

## 2. Korttikohtainen sisältö

### Streak

- "X päivän putki"
- "Pisin putki (90 pv): Y" — pisin yhtäjaksoinen aktiivinen jakso jo ladatun 90 päivän ikkunan sisällä (ei koko historiaa, koska sitä ei ladata muualla — rehellisesti merkitty "(90 pv)")
- 14 pisteen ruudukko viimeisimmästä 14 päivästä (● aktiivinen / ○ ei-aktiivinen)
- Data: uudelleenkäyttää jo olemassa olevaa `activeDays90`-joukkoa (ladataan jo streak-laskentaa varten) — ei uutta kyselyä.

### Viikon sali

- Tämän viikon Ma–Su -rivi, merkiten mitkä päivät sisälsivät salisession (uudelleenkäyttää jo laskettua `gymDays`-joukkoa)
- Session nimi/tyyppi tunnetuilta päiviltä (esim. "Ke: Treeni 2 — Vetävät")
- Ei uutta kyselyä.

### Viikon aktiiv.

- Lista tämän viikon kirjatuista aktiviteeteista: tyyppi, päivä, kesto (esim. "Ti: Juoksu · 50 min")
- Data: laajentaa olemassa olevaa viikkokyselyä valitsemaan `activity_type`/`activity_date`/`duration_min` pelkän `id`:n sijaan (sama kysely, enemmän sarakkeita — ei uutta kyselyä).

### Viikon aktiivisuus

- "X/6 aktiivista päivää"
- Päiväkohtainen erittely (Ma–La, sama /6-nimittäjä kuin nykyisessä laskennassa), merkiten aktiivinen/ei-aktiivinen
- Data: uudelleenkäyttää jo laskettua `activeDaysThisWeek`-joukkoa — ei uutta kyselyä.

### Kuukausi

- Kokonaismäärä tältä kuukaudelta
- Erittely aktiviteettityypin mukaan (esim. "Juoksu: 5, Kävely: 3")
- Data: laajentaa olemassa olevaa kuukausikyselyä valitsemaan `activity_type` pelkän `id`:n sijaan, ryhmitellään asiakaspuolella — ei uutta kyselyä.

### Päivän kalorit

- Erittely: BMR / + liikunta / − syöty ruoka / = tänään (uusi etumerkkikonventio, ks. kohta 3)
- 7 päivän minipalkkikaavio samasta nettoluvusta per päivä
- Data: **uusi** — kaksi aluekyselyä viimeisen 7 päivän ajalta (liikunta: `activity_data` + `workout_sessions`; ruoka: `food_log_entries`), ryhmitellään asiakaspuolella päivämäärän mukaan. BMR ei vaadi päiväkohtaista uudelleenlaskentaa (riippuu profiilista + tuoreimmasta painomittauksesta, ei päivästä) — sama `bmrInfo.bmr` käytetään jokaiselle 7 päivälle.

---

## 3. Etumerkin kääntö ja uudelleennimeäminen

Nykyinen kaava (`BMR + liikunta − ruoka`) säilyy sellaisenaan laskennassa, mutta **näytetty arvo käännetään**: `näytetty = -(BMR + liikunta − ruoka) = ruoka − BMR − liikunta`.

- Negatiivinen luku = nettovaje (poltettu enemmän kuin syöty)
- Positiivinen luku = nettoylijäämä (syöty enemmän kuin poltettu)

Koska positiivinen luku ei enää tarkoita "vajetta", nimikkeet päivitetään:

- Koonti-sivun hero-mittarin otsikko: "päivän vaje" → **"päivän kalorit"**
- "Tällä viikolla" -kortin rivi: "Viikon vaje" → **"Viikon kalorit"** (sama etumerkkikonventio, sama laskentakaava käännettynä: `viikon näytetty = ruoka − BMR×kuluneet_päivät − liikunta`)

Molemmat säilyttävät nykyisen "ei väriarvottelua" -periaatteen (ei vihreä/punainen), koska tavoitesuunta on käyttäjäkohtainen.

---

## 4. Aerobinen-kortin korjaus

Koonti-sivun TÄNÄÄN-osion Aerobinen-kortin kysely:

```js
const { data: actRows } = await sb.from('activity_data')
  .select('activity_type,activity_date,duration_min')
  .order('activity_date', { ascending: false }).limit(1);
```

muutetaan lisäämällä toissijainen järjestys `created_at`:n mukaan, jotta samalle päivälle kirjatuista useista aktiviteeteista näytetään aina viimeksi kirjattu:

```js
const { data: actRows } = await sb.from('activity_data')
  .select('activity_type,activity_date,duration_min,created_at')
  .order('activity_date', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(1);
```

---

## 5. Tekninen toteutustapa

- Yksi jaettu modaali-DOM-rakenne (uudelleenkäyttää sovelluksen olemassa olevaa modaali-CSS:ää), ja jokaiselle 6 mittarille oma pieni sisällönrakennusfunktio.
- Ei uusia tietokantatauluja tai -sarakkeita.
- Kolme olemassa olevaa kyselyä laajenee valitsemaan muutaman lisäsarakkeen (`id`:n sijaan `activity_type`/`activity_date`/`duration_min`).
- Yksi aidosti uusi kyselypari (7 päivän liikunta + ruoka -aggregaatit "päivän kalorit" -erittelyä varten).
- Etumerkin kääntö ja Aerobinen-korjaus toteutetaan osana samaa plania, koska ne koskettavat samaa koodialuetta.

---

## Testaus

Ei automaattitestejä (ei testikehystä projektissa). Manuaalinen läpikäynti oikeassa selaimessa:

1. Jokainen 6 kortista: klikkaus avaa modaalin, luvut täsmäävät käsin laskettuun.
2. Streak-modaali: putki + pisin putki (90 pv) + 14 pisteen ruudukko täsmää aktiivipäiviin.
3. Viikon sali / viikon aktiiv. / viikon aktiivisuus -modaalit: päiväkohtainen erittely täsmää viikon oikeaan dataan.
4. Kuukausi-modaali: tyyppikohtainen erittely täsmää kuukauden dataan.
5. Päivän kalorit -modaali: BMR/liikunta/ruoka-erittely täsmää, 7 päivän palkkikaavio näyttää oikeat arvot ja etumerkit.
6. Profiilia vailla oleva käyttäjä: "päivän kalorit" -kortin klikkaus avaa yhä Profiili-modaalin (ei uutta erittely-modaalia).
7. "Tällä viikolla" -kortin "Viikon kalorit" -rivi näyttää käännetyn etumerkin oikein.
8. Aerobinen-kortti: kun samalle päivälle on kirjattu kaksi aktiviteettia, kortti näyttää viimeksi kirjatun (todennettu myös suoraan Supabasesta `created_at`-aikaleimalla).
