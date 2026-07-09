# Treeniapp (Valkku) — Offline-kestävyys

**Päivämäärä:** 2026-07-09
**Laajuus:** Sprintti 3 osa 3 ("Offline-kestävyys", 4 pistettä laajennettuna käyttäjän pyynnöstä kattamaan kaikki fire-and-forget-kirjoitukset, ei vain salikertoja).
**Riippuvuudet:** Ei uutta migraatiota. Käyttää olemassa olevaa `sb` (Supabase JS -client) -instanssia ja `localStorage`-mekanismia (sama malli kuin `saveLD()`).

---

## Tavoite

Sovelluksen service worker (`sw.js`) cachettaa jo sovelluskuoren, joten Valkku *latautuu* offline-tilassa. Sen sijaan mikään Supabase-kirjoitus ei tällä hetkellä kestä yhteyskatkoa kunnolla: suurin osa kirjoituksista (`saveBodyMetrics`, `saveActivity`, `addFoodLogEntry`, ohjelman muokkaus, tavoitteet, jne.) on suoria `await sb.from(...)`-kutsuja jotka epäonnistuvat heti eikä dataa tallenneta mihinkään — käyttäjä näkee virheen ja data katoaa, ellei hän muista syöttää sitä uudelleen myöhemmin. Ainoa poikkeus on `saveSet()`/`syncSet()` (salikertojen tallennus), joka jo tallentaa paikallisesti (`LD`/`localStorage`) välittömästi ja yrittää synkronoida taustalla — mutta epäonnistuessaan ei yritä uudelleen, vain logaa konsoliin.

Tavoite: rakentaa geneerinen, uudelleenkäytettävä offline-kirjoitusjono joka kattaa kaikki "kirjoita ja unohda" -tyyppiset Supabase-kirjoitukset (~25 kohtaa), ja siirtää `saveSet()`/`syncSet()` käyttämään samaa mekanismia.

---

## 1. Laajuus — mitkä kirjoitukset jonotetaan

**Jonotetaan** (fire-and-forget, kutsuja ei tarvitse palautusarvoa jatkaakseen):

| Funktio | Taulu | Operaatio |
|---|---|---|
| `syncDone()` | `workout_sessions` | upsert |
| `syncSet()` | `workout_sets` | upsert |
| `setActiveSession()` | `day_session_overrides` | upsert |
| `saveBodyMetrics()` | `body_metrics` | upsert |
| `saveCalorieCorrection()` | `app_settings` | upsert |
| `saveOnboardingCompleted()` | `app_settings` | upsert |
| `updateActivity()` | `activity_data` | update (`.eq('id', id)`) |
| `deleteActivity()` | `activity_data` | delete (`.eq('id', id)`) |
| `saveActivity()` | `activity_data` | insert |
| `saveSleep()` | `sleep_data` | upsert |
| `addExerciseToCurrentSession()` | `program_session_exercises` | insert |
| `addFoodLogEntry()` | `food_log_entries` | insert |
| `updateFoodLogEntryAmount()` | `food_log_entries` | update (`.eq('id', entryId)`) |
| `deleteFoodLogEntry()` | `food_log_entries` | delete (`.eq('id', entryId)`) |
| `saveActivityGoals()` | `activity_goals` | upsert |
| `saveNutritionGoals()` | `nutrition_goals` | upsert |
| `renderOhjelma()` sort-käsittelijä (sessiot) | `program_sessions` | update (`.eq('id', id)`) × N |
| `renderOhjelma()` sort-käsittelijä (liikkeet) | `program_session_exercises` | update (`.eq('id', id)`) × N |
| `saveSessionField()` | `program_sessions` | update (`.eq('id', id)`) |
| `toggleSessionWeekday()` | `program_sessions` | update (`.eq('id', id)`) |
| `addNewProgramSession()` | `program_sessions` | insert |
| `deleteProgramSession()` | `program_sessions` | delete (`.eq('id', id)`) |
| `removeExerciseFromSession()` | `program_session_exercises` | delete (`.eq('id', exId)`) |
| `saveExerciseTarget()` | `program_session_exercises` | update (`.eq('id', exId)`) |

**Ei jonoteta** (kutsuja tarvitsee palvelimen generoiman arvon — esim. uuden rivin `id` — välittömästi jatkaakseen ketjutettuun toimintoon; jonotus ei voisi toimia koska arvoa ei ole olemassa ennen kuin kirjoitus oikeasti tapahtuu):

- `createNewExerciseAndAdd()` — `exercises.insert().select().single()`, tarvitsee `data.name` heti kutsuakseen `addExerciseToCurrentSession()`.
- `createCustomFood()` — `custom_foods.insert().select('id').single()`, tarvitsee `data.id` heti.
- `ensureFoodCache()` — `food_cache.upsert().select('id').single()`, tarvitsee `data.id` heti.

Nämä kolme säilyvät nykyisellä käytöksellä: jos verkkoa ei ole, kutsu epäonnistuu ja käyttäjä näkee virheen kuten tänäänkin. Ei regressiota — käytös ei muutu näiden kolmen osalta.

---

## 2. Tekninen toteutus

### 2.1 `sbWrite()` — geneerinen kirjoitus-wrapper

Uusi funktio korvaa yllä listattujen 25 kohdan suoran `sb.from(...)`-kutsun:

```js
async function sbWrite({ table, op, payload, eq, opts }) {
  // op: 'insert' | 'upsert' | 'update' | 'delete'
  // payload: rivin data (insert/upsert/update). null delete-operaatiolle.
  // eq: { column, value } — pakollinen update/delete, ei käytetä insert/upsert.
  // opts: esim. { onConflict: '...' } upsertille.
  try {
    let q = sb.from(table);
    if (op === 'insert') q = q.insert(payload);
    else if (op === 'upsert') q = q.upsert(payload, opts);
    else if (op === 'update') q = q.update(payload).eq(eq.column, eq.value);
    else if (op === 'delete') q = q.delete().eq(eq.column, eq.value);
    const { error } = await q;
    if (error) {
      if (looksOffline(error)) { enqueueWrite({ table, op, payload, eq, opts }); return { error: null }; }
      return { error };
    }
    return { error: null };
  } catch (e) {
    if (looksOffline(e)) { enqueueWrite({ table, op, payload, eq, opts }); return { error: null }; }
    return { error: e };
  }
}
```

Palautusmuoto on tarkoituksella identtinen natiivin Supabase-kutsun kanssa (`{ error }`, tai `{ data, error }` kun kutsuja tarvitsee datan — ks. alla), jotta jokaisen 25 kutsukohdan ympärillä oleva olemassa oleva `if (error) {...}`-logiikka toimii muuttumattomana. Ainoa muutos kutsujan näkökulmasta: jos kirjoitus jonotettiin, `error` on `null` (näyttää onnistuneelta) — käyttäjä ei näe turhaa virhettä tallennuksesta joka itse asiassa vain odottaa yhteyttä.

**Huom:** yllä oleva `sbWrite()` ei sisällä `.select()`-tukea, koska mikään jonotettava kutsu ei tarvitse palautusdataa (ks. laajuus-taulukko). Ei-jonotettavat kolme poikkeusta eivät käytä `sbWrite()`:tä ollenkaan.

### 2.2 Vikatunnistus — `looksOffline(error)`

```js
function looksOffline(error) {
  if (!navigator.onLine) return true;
  const msg = (error && error.message || '').toLowerCase();
  const looksNetworky = msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed');
  const hasPostgrestCode = error && typeof error.code === 'string' && error.code.length > 0;
  return looksNetworky && !hasPostgrestCode;
}
```

Postgrest-virheillä (esim. RLS-esto, constraint-rikkomus, virheellinen sarake) on aina `.code`-kenttä (esim. `23505`, `PGRST116`) — nämä näytetään käyttäjälle heti kuten nyt, ei jonoteta. Verkkovirheillä (fetch epäonnistuu ennen kuin pyyntö edes saavuttaa Supabasen) ei ole `.code`-kenttää ja viesti on selaimen geneerinen verkkovirheteksti.

### 2.3 Jono — `enqueueWrite()` / `flushQueue()`

```js
const OFFLINE_QUEUE_KEY = 'sbOfflineQueue';
const MAX_RETRY_ATTEMPTS = 5;

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
  catch { return []; }
}
function persistQueue(q) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  updateOfflineBanner(q);
}

function enqueueWrite(entry) {
  const q = loadQueue();
  q.push({ ...entry, id: Date.now() + '-' + Math.random().toString(36).slice(2), attempts: 0, ts: Date.now() });
  persistQueue(q);
}

async function flushQueue() {
  let q = loadQueue();
  if (q.length === 0) return;
  const remaining = [];
  for (const entry of q) {
    if (entry.attempts >= MAX_RETRY_ATTEMPTS) { remaining.push(entry); continue; }
    const { error } = await sbWrite(entry); // sbWrite itself re-queues on renewed offline failure
    if (error) {
      entry.attempts += 1;
      remaining.push(entry);
      if (!navigator.onLine) { // connection dropped mid-flush — stop, keep FIFO order intact
        remaining.push(...q.slice(q.indexOf(entry) + 1));
        break;
      }
    }
    // success (error === null): entry is dropped, not re-added to remaining
  }
  persistQueue(remaining);
}

window.addEventListener('online', flushQueue);
```

`flushQueue()` kutsutaan myös sovelluksen käynnistys-IIFE:ssä (jos jonossa on jäänteitä edellisestä offline-jaksosta, esim. selain suljettiin ennen kuin `online`-eventti ehti laueta).

**Ei deduplikointia.** Jos sama rivi (esim. sama salikerta) jonottuu useaan kertaan offline-jakson aikana (käyttäjä muokkaa arvoa moneen kertaan), kaikki versiot toistetaan järjestyksessä kun yhteys palaa — `upsert`/`update` konvergoi aina viimeisimpään arvoon, joten lopputulos on oikea, vain hieman ylimääräisiä pyyntöjä. `insert`/`delete`-operaatiot ovat luonnostaan turvallisia toistaa FIFO-järjestyksessä (uusi rivi tai poisto samalle avaimelle ei riko mitään kun järjestys säilyy).

**5 yrityksen katto:** jos yksittäinen jono-alkio epäonnistuu 5 kertaa (esim. todellinen datavirhe joka sattumalta näytti verkkovirheeltä ensimmäisellä kerralla — esim. juuri palanneen yhteyden epävakaus), se jää jonoon näkyviin mutta lakkaa yrittämästä automaattisesti. Banneri näyttää nämä erikseen (ks. 2.4).

### 2.4 UI — banneri

Ohut pysyvä banneri näytön yläreunassa (uusi `<div id="offline-banner">`, piilotettu oletuksena `display:none`):

```html
<div id="offline-banner" style="display:none;position:sticky;top:0;z-index:100;background:var(--amber-bg);color:var(--amber);font-size:13px;padding:8px 16px;text-align:center;border-bottom:1px solid var(--amber);">
  <span id="offline-banner-text"></span>
</div>
```

```js
function updateOfflineBanner(queue) {
  const banner = document.getElementById('offline-banner');
  const text = document.getElementById('offline-banner-text');
  if (!banner || !text) return;
  if (queue.length === 0) { banner.style.display = 'none'; return; }
  const stuck = queue.filter(e => e.attempts >= MAX_RETRY_ATTEMPTS).length;
  const pending = queue.length - stuck;
  let msg = '';
  if (pending > 0) msg += `${pending} tallennusta odottaa synkronointia`;
  if (stuck > 0) msg += (msg ? ' · ' : '') + `${stuck} jumissa (yritä myöhemmin uudelleen)`;
  text.textContent = msg;
  banner.style.display = 'block';
}
```

Banneri päivittyy joka kerta kun jono muuttuu (`persistQueue()` kutsuu `updateOfflineBanner()`), ja renderöityy myös sovelluksen käynnistyessä nykyisen jonon tilan mukaan.

### 2.5 `saveSet()`/`syncSet()`-integraatio

`syncSet()` (rivi 1499) ja `syncDone()` (rivi 1362) muutetaan käyttämään `sbWrite()`:tä suoran `sb.from(...)`-kutsun sijaan — poistaa niiden nykyisen bespoke `console.error`-vain-käytöksen, ne saavat saman jonotus- ja uudelleenyritysmekanismin kuin kaikki muut kirjoitukset. `saveSet()`:n paikallinen `LD`/`localStorage`-tallennus (joka jo tapahtuu synkronisesti ennen `syncSet()`-kutsua) säilyy täysin ennallaan — se on jo toimiva mekanismi eikä sitä kosketa tämä muutos.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti Chrome DevToolsin "Offline"-verkkokytkimellä:

1. Kytke DevTools Networkiin "Offline". Tee jokin fire-and-forget-kirjoitus (esim. tallenna salikerta, tallenna kehon mittaus). Tarkista ettei virheilmoitusta näytetä käyttäjälle (koska `sbWrite()` palauttaa `error: null` jonottaessaan), ja että banneri ilmestyy tekstillä "1 tallennus odottaa synkronointia".
2. Tee 2-3 kirjoitusta lisää offline-tilassa eri lomakkeille (aktiviteetti, uni, ruokapäiväkirja). Tarkista bannerin laskuri kasvaa.
3. Kytke DevTools takaisin "Online"-tilaan. Tarkista `online`-eventti laukaisee `flushQueue()`:n, kaikki jonotetut kirjoitukset synkronoituvat Supabaseen (varmista Supabasen taulukoista tai lataamalla sivu uudelleen), ja banneri katoaa.
4. Lataa sivu uudelleen offline-tilassa jonon ollessa ei-tyhjä (esim. simuloi jättämällä yksi kirjoitus offline-tilaan, sulje ja avaa sivu uudelleen offline-tilassa). Tarkista banneri näyttää edelleen oikean määrän käynnistyksen jälkeen.
5. Simuloi pysyvästi epäonnistuva kirjoitus (esim. syötä jono-alkioon manuaalisesti virheellinen `table`-nimi DevTools-konsolista) ja tarkista että 5 epäonnistuneen yrityksen jälkeen alkio merkitään "jumissa"-tilaan bannerissa eikä sitä enää yritetä automaattisesti.
6. Tarkista ettei oikea data-/oikeusvirhe (esim. yritä tallentaa virheellistä dataa online-tilassa) näytä banneria tai jonotu — virhe näkyy käyttäjälle heti kuten ennen muutosta.
7. Tarkista `createNewExerciseAndAdd()`, `createCustomFood()`, `ensureFoodCache()` säilyvät ennallaan: offline-tilassa ne epäonnistuvat heti näkyvällä virheellä, eivät jonotu.
