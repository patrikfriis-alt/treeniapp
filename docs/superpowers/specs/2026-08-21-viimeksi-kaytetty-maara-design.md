# Treeniapp (Valkku) — Viimeksi käytetty määrä (last-used amount preset)

**Päivämäärä:** 2026-08-21
**Laajuus:** Ruokahaun määrä-askeleeseen (food-search-step-amount) uusi, ehdollinen pikanäppäin joka näyttää käyttäjän viimeksi kirjaaman määrän juuri tälle ruualle — riippumatta siitä minkä aterian yhteydessä se silloin kirjattiin.
**Riippuvuudet:** Olemassa oleva `food_log_entries`-taulu, `foodModalSelected`-globaali, `goToAmountStep()`/`setFoodAmount()`/`confirmAddFood()`, `.food-amount-presets`-CSS.

---

## Tausta

Sulamo.fi (vertailtu kilpailijasovellus) näyttää määrän syöttövaiheessa useita valmiiksi laskettuja pikavaihtoehtoja, joista hyödyllisin ja ainoa suoraan olemassa olevasta datasta rakennettavissa oleva on "Viime annos" — käyttäjän oma viimeksi käyttämä määrä juuri tälle tuotteelle. "Suositettu annos" ja kpl-kokoiset (pieni/keskikokoinen/iso) vaihtoehdot vaatisivat per-tuote annoskokodataa, jota ei ole `food_cache`-, `custom_foods`- eikä `fineli_foods`-tauluissa — ne rajataan pois.

## 1. Mistä "viimeksi käytetty" haetaan

Ruualla on kolme mahdollista "lähdettä" (`foodModalSelected.source`) määrä-askeleeseen tultaessa:

- **`cache`** (Viimeksi käytetyt -listasta) — `foodModalSelected.cacheId` on jo olemassa.
- **`custom`** (oma tuote, aiemmin luotu) — `foodModalSelected.customId` on jo olemassa.
- **`fineli`** (tuore Fineli-hakutulos) — ei vielä `cacheId`/`customId`:tä, koska `food_cache`-riviä ei luoda ennen `confirmAddFood()`:ia. **Tämä on yleisin polku** kun käyttäjä hakee uudelleen jo aiemmin syömäänsä ruokaa nimellä, koska haku palauttaa aina Fineli-tuloksia riippumatta siitä onko tuote joskus jo cachettu. Jotta "viimeksi käytetty" toimisi myös tässä yleisimmässä tapauksessa, tehdään ensin kevyt hakuluku `food_cache`-tauluun `fineli_id`:n perusteella (ei kirjoitusta) — jos rivi löytyy, sen `id`:tä käytetään `cacheId`:nä hakuun.

Jos mikään kolmesta ei tuota `cacheId`/`customId`:tä (ruokaa ei ole koskaan kirjattu missään muodossa), pikanäppäintä ei näytetä lainkaan.

## 2. Haku ja näyttö

```js
let lastUsedAmountRequestId = 0;

async function loadLastUsedAmount() {
  const requestId = ++lastUsedAmountRequestId;
  const btn = document.getElementById('food-amount-last-used-btn');
  if (!btn) return;
  btn.style.display = 'none';

  const sel = foodModalSelected;
  if (!sel) return;

  let cacheId  = sel.source === 'cache'  ? sel.cacheId  : null;
  let customId = sel.source === 'custom' ? sel.customId : null;

  if (!cacheId && !customId && sel.source === 'fineli' && sel.fineliId) {
    const { data, error } = await sb.from('food_cache').select('id').eq('fineli_id', sel.fineliId).maybeSingle();
    if (error) { console.error('loadLastUsedAmount (food_cache lookup) failed:', error.message); return; }
    if (requestId !== lastUsedAmountRequestId) return;
    if (data) cacheId = data.id;
  }
  if (!cacheId && !customId) return;

  let query = sb.from('food_log_entries').select('amount_g').order('created_at', { ascending: false }).limit(1);
  query = cacheId != null ? query.eq('food_cache_id', cacheId) : query.eq('custom_food_id', customId);
  const { data: rows, error: entryErr } = await query;
  if (entryErr) { console.error('loadLastUsedAmount failed:', entryErr.message); return; }
  if (requestId !== lastUsedAmountRequestId) return;
  if (!rows || !rows.length) return;

  const grams = rows[0].amount_g;
  btn.textContent = `Viimeksi ${grams}g`;
  btn.onclick = () => setFoodAmount(grams);
  btn.style.display = '';
}
```

`lastUsedAmountRequestId` seuraa samaa mallia kuin `foodDayRequestId`/`foodSearchRequestId`/`coachRequestId`/`treeniRequestId` muualla tiedostossa — jos käyttäjä ehtii valita toisen ruuan ennen kuin haku palaa, vanhentunut vastaus ei koskaan pääse näyttämään väärän ruuan määrää.

`goToAmountStep()` kutsuu `loadLastUsedAmount()`:ia ilman `await`:ia (ei viivytä askeleen avautumista) heti muun alustuksen jälkeen. Nappi ilmestyy hetkeä myöhemmin jos osuma löytyy — ei koskaan enne sitä eikä koskaan jos osumaa ei ole.

## 3. Sijoittelu

Uusi `<button id="food-amount-last-used-btn" style="display:none">` ensimmäisenä `.food-amount-presets`-listassa, ennen 50g/100g/150g/200g-nappeja — henkilökohtaisesti relevantein vaihtoehto ensin kun se on saatavilla. Olemassa olevat neljä nappia pysyvät muuttumattomina, tätä ei korvata mikään niistä.

## 4. Rajaus

- Ei "suositeltu annos"- tai kpl-kokoisia vaihtoehtoja — ei dataa niiden laskemiseen.
- "Viimeksi käytetty" ei ole ateriakohtainen (ei erottele oliko viimeksi syöty aamiaisella vai päivällisellä) — pelkkä viimeisin määrä riippumatta ateriasta.
- Ei muutoksia `food_log_entries`-, `food_cache`- tai `custom_foods`-tauluihin.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Kirjaa jokin ruoka tietyllä määrällä (esim. 137g).
2. Hae sama ruoka uudelleen NIMELLÄ (Fineli-hakutuloksena, ei "Viimeksi käytetyt" -listasta) — tarkista että "Viimeksi 137g" -nappi ilmestyy määrä-askeleeseen hetken kuluttua, ja että sitä napauttamalla määräkenttä täyttyy oikein.
3. Valitse sama ruoka "Viimeksi käytetyt" -listasta (source=`cache`) — tarkista että nappi toimii identtisesti.
4. Hae ruoka jota ei ole koskaan kirjattu — tarkista ettei nappia näytetä lainkaan.
5. Valitse ruoka A, vaihda nopeasti ruokaan B ennen kuin A:n haku ehtii palata — tarkista ettei A:n määrä koskaan ilmesty B:n napiksi (konsolista voi tarkistaa ettei virheitä tule).
6. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
