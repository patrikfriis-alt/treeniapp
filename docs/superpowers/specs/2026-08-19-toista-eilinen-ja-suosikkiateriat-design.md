# Treeniapp (Valkku) — Toista eilinen & Suosikkiateriat

**Päivämäärä:** 2026-08-19
**Laajuus:** Kaksi uutta pikalisäystapaa ruokapäiväkirjaan: (1) "Toista eilinen" -nappi jokaisella ateriakortilla, joka kopioi edellisen päivän saman aterian merkinnät tälle päivälle; (2) "Tallenna suosikiksi" -nappi, joka tallentaa nykyisen aterian sisällön nimettynä mallina, ja uusi "Suosikit"-osio ruokahaussa mallien selaamiseen ja lisäämiseen.
**Riippuvuudet:** Olemassa oleva `food_log_entries`-taulu, `MEAL_DEFS`, `renderMealCards()`, `openFoodSearch()`, `loadRecentFoods()`, `addFoodLogEntry()`, `sbWrite()`, `renderRuoka()`/`loadFoodDay()`.

---

## Tausta

Ruoan kirjaaminen vaatii aina hakua, vaikka moni ateria toistuu päivästä toiseen lähes samanlaisena (esim. aamiaiskahvi). Kaksi erillistä mekanismia helpottavat tätä ilman että ne sotkeutuvat toisiinsa:

1. **Toista eilinen** — hetkellinen, nimetön kopiointi: "mitä söin tähän ateriaan viimeksi" → yhdellä napautuksella samat merkinnät tälle päivälle.
2. **Suosikkiateriat** — pysyvä, nimetty malli: "tämä on minun tyypillinen aamiaiseni" → tallennetaan kertaalleen, käytettävissä milloin tahansa myöhemmin, riippumatta siitä milloin se alun perin syötiin.

Molemmat käyttävät samaa lopullista kirjoitusreittiä (`food_log_entries`-rivien lisäys), mutta niiden data-alkuperä on eri: edellinen kopioi suoraan eilisen rivit sellaisenaan (myös silloiset kcal/protein_g-arvot), suosikki laskee kcal/protein_g-arvot aina tuoreeltaan lisäyshetken `food_cache`/`custom_foods`-datasta (ks. alla miksi).

---

## 1. "Toista eilinen"

**Sääntö:** "Eilinen" tarkoittaa aina sitä päivää joka on yksi vähemmän kuin parhaillaan selattu ruokapäivä (`foodDayOffset - 1`), ei kalenterin todellista eilistä — jos käyttäjä on navigoinut nuolilla tiistain kohdalle, "Toista eilinen" Lounas-kortilla kopioi maanantain lounaan tiistaihin.

**Näkyvyys:** Nappi näkyy ateriakortilla vain jos ko. edellisellä päivällä on vähintään yksi merkintä samalle ateriatyypille — muuten näkymättömissä (sama käytäntö kuin muualla sovelluksessa: ei tyhjää toimintoa näkyville). Tämä vaatii `renderMealCards()`:lle tiedon edellisen päivän ateriatyypeittäisestä merkintämäärästä; haetaan kevyt kysely (`meal_type`-sarake riittää, ei tarvitse koko riviä) rinnakkain nykyisen päivän datan kanssa `loadFoodDay()`:ssä.

**Käyttäytyminen:** Napautus kopioi **välittömästi**, ei esikatselua eikä vahvistusta. Kopioidut rivit lisätään olemassa olevien tämän päivän merkintöjen **päälle** (ei korvaa) — jos tälle aterialle on jo kirjattu jotain tänään, "Toista eilinen" lisää eilisen rivit niiden lisäksi. Poistaminen onnistuu normaalisti rivin omasta muokkausdialogista jos kopio oli virhe.

**Data:** kopioidaan suoraan `food_cache_id`, `custom_food_id`, `amount_g`, `kcal`, `protein_g` — **ei** lasketa uudelleen `food_cache`/`custom_foods`-taulun senhetkisistä per-100g-arvoista. Tämä on tarkoituksellista: "toista eilinen" tarkoittaa tarkalleen sitä mitä silloin kirjattiin, ei sitä mitä sama ruoka laskisi tänään jos Fineli-data olisi sittemmin korjautunut.

```js
async function repeatMealFromPreviousDay(mealType) {
  const prevIso  = localIso(addDays(new Date(), foodDayOffset - 1));
  const todayIso = localIso(addDays(new Date(), foodDayOffset));
  const { data, error } = await sb.from('food_log_entries')
    .select('food_cache_id, custom_food_id, amount_g, kcal, protein_g')
    .eq('logged_at', prevIso)
    .eq('meal_type', mealType);
  if (error) { console.error('repeatMealFromPreviousDay failed:', error.message); return; }
  if (!data || !data.length) return;

  const rows = data.map(r => ({
    meal_type: mealType,
    logged_at: todayIso,
    food_cache_id: r.food_cache_id,
    custom_food_id: r.custom_food_id,
    amount_g: r.amount_g,
    kcal: r.kcal,
    protein_g: r.protein_g,
  }));
  const { error: insErr } = await sbWrite({ table: 'food_log_entries', op: 'insert', payload: rows });
  if (insErr) { console.error('repeatMealFromPreviousDay insert failed:', insErr.message); return; }
  renderRuoka();
}
```

(`sbWrite`'s underlying `attemptWrite` calls `.insert(payload)` directly — the Supabase client already accepts an array for bulk insert, no per-row loop needed.)

---

## 2. "Tallenna suosikiksi"

**Näkyvyys:** Nappi näkyy ateriakortilla vain jos tälle päivälle on jo vähintään yksi merkintä kyseiselle aterialle (ei voi tallentaa tyhjää).

**Nimeäminen:** Napautus avaa pienen syötekentän (ei selaimen natiivia `prompt()`-dialogia — sovellus ei käytä sellaista muualla; toteutetaan samalla tyylillä kuin oman tuotteen lisäyslomake, esim. oma modaali-vaihe). Kenttä esitäytetään ehdotuksella (aterian ensimmäisen rivin nimi, esim. "Kahvi, cappuccino..."), käyttäjä voi muokata tai hyväksyä sellaisenaan. Tyhjällä nimellä ei voi tallentaa.

**Data-alkuperä eron peruste:** Suosikki lasketaan **aina tuoreeltaan** lisäyshetkellä nykyisistä `food_cache`/`custom_foods`-per-100g-arvoista (ei tallenneta kcal/protein_g-arvoja itse malliin). Tämä koska suosikki on tarkoitettu käytettäväksi mistä tahansa hetkestä eteenpäin, mahdollisesti kuukausienkin päästä — jos Fineli-data korjaantuu välissä, suosikki heijastaa aina ajantasaista arvoa, ei tallennushetken arvoa.

### Uudet taulut

```sql
create table meal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table meal_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references meal_templates(id) on delete cascade,
  food_cache_id bigint references food_cache(id),
  custom_food_id bigint references custom_foods(id),
  amount_g numeric not null
);
```

(Tyyppi `food_cache_id`/`custom_food_id`: sama tyyppi kuin `food_log_entries`-taulun vastaavat sarakkeet — tarkista migraationkirjoitushetkellä `\d food_log_entries` tarkka tyyppi, oletus `bigint` tässä spekissä on parhaan arvauksen mukainen.)

**Ei** `meal_type`-saraketta `meal_templates`-tauluun — suosikki ei ole sidottu siihen ateriatyyppiin josta se alun perin tallennettiin, se voidaan lisätä mille tahansa aterialle myöhemmin (sama malli kuin "Viimeksi käytetyt" -lista, joka on jo ateriatyypistä riippumaton).

### Tallennus

```js
async function saveMealAsFavorite(mealType, name) {
  const entries = foodDayEntries.filter(e => e.meal_type === mealType);
  if (!entries.length || !name.trim()) return;

  const { data: template, error: tErr } = await sb.from('meal_templates')
    .insert({ name: name.trim() }).select('id').single();
  if (tErr) { console.error('saveMealAsFavorite (template) failed:', tErr.message); return; }

  const items = entries.map(e => ({
    template_id: template.id,
    food_cache_id: e.food_cache_id,
    custom_food_id: e.custom_food_id,
    amount_g: e.amount_g,
  }));
  const { error: iErr } = await sb.from('meal_template_items').insert(items);
  if (iErr) { console.error('saveMealAsFavorite (items) failed:', iErr.message); return; }
}
```

(Suora `sb.from(...).insert(...)`, ei `sbWrite()`-wrapperia — suosikin tallennus ei ole päivän ruokakirjanpitoa, offline-jonotus ei ole tarpeen tälle, samalla tavalla kuin `createCustomFood()` ja `ensureFoodCache()` käyttävät suoraa `sb.from()`-kutsua eivätkä `sbWrite()`:iä.)

### Suosikit-osio ruokahaussa

`openFoodSearch(mealType)` hakee suosikkilistan (`meal_templates` + `meal_template_items` joinilla food_cache/custom_foods-nimillä ja per-100g-arvoilla, sama join-kuvio kuin `loadFoodDayEntries()`/`loadRecentFoods()`) ja renderöi uuden "Suosikit"-osion **ennen** "Viimeksi käytetyt" -osiota. Napautus suosikkiin lisää **kaikki** sen sisältämät rivit kerralla valittuun ateriaan (samalla `addFoodLogEntry()`-reitillä kuin yksittäinen ruoka, per-item, laskien kcal/protein_g tuoreista per-100g-arvoista × tallennettu `amount_g`) — ei mene "määrä grammoina" -välivaiheen kautta, koska määrä on jo osa suosikkia.

**Poisto:** pieni poistokontrolli jokaisen suosikkirivin yhteydessä, `confirm()`-varmistuksella ennen poistoa (sama käytäntö kuin `deleteProgramSession()`:ssa), tyyli `color:var(--red)` (sama kuin muut poistonapit sovelluksessa). Poisto (`delete from meal_templates where id = ...`, `on delete cascade` hoitaa rivien poiston) piilottaa suosikin listasta heti.

**Puuttuva viittaus:** jos suosikin rivin `food_cache_id`/`custom_food_id` osoittaa poistettuun tuotteeseen (harvinainen, `custom_foods`-riviä ei tällä hetkellä voi poistaa sovelluksesta, mutta varaudutaan), kyseinen rivi ohitetaan hiljaisesti lisäyksessä (`console.error` lokiin) sen sijaan että koko suosikin lisäys epäonnistuisi.

---

## 3. Rajaus

- Ei suosikin muokkausta (nimen vaihto tai rivien lisäys/poisto jälkikäteen) — vain tallenna/käytä/poista.
- Ei suosikin sitomista tiettyyn ateriatyyppiin.
- Ei "Toista eilinen" -historiaa pidemmälle kuin yksi päivä taaksepäin (ei "toista kolme päivää sitten").
- Ei muutoksia olemassa olevaan `food_log_entries`-tauluun tai sen sarakkeisiin.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Kirjaa jotain tälle päivälle esim. Lounaalle, avaa Ruoka seuraavana päivänä (tai navigoi nuolella) — tarkista että "Toista eilinen" näkyy Lounas-kortilla ja kopioi oikeat rivit oikeilla kcal/protein-arvoilla.
2. Tarkista että "Toista eilinen" EI näy kortilla jolla edellisellä päivällä ei ollut merkintöjä.
3. Tallenna suosikki jostain ateriasta, anna nimi — avaa ruokahaku toiselle aterialle, tarkista että suosikki näkyy "Suosikit"-osiossa ja lisää oikeat rivit oikeilla, tuoreilla kcal-arvoilla.
4. Poista suosikki — tarkista `confirm()`-varmistus ja että se katoaa listasta.
5. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
