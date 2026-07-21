# Treeniapp — Kolme pientä korjausta

**Päivämäärä:** 2026-07-21
**Laajuus:** Kolme itsenäistä, aiemmissa katselmoinneissa tunnistettua pientä korjausta: Sali-sivun PR-merkin ennenaikainen laukeaminen, valmentajan päivittäisen rajan alilaskenta, ja unen synkkauksen Shortcuts-oppaan sanamuoto. Ei uusia ominaisuuksia — vain olemassa olevan käytöksen korjaamista.

---

## 1. Sali: PR-merkki laukeaa liian aikaisin

**Ongelma:** `renderSession()`:n automaattinen progressioehdotus (index.html) kirjoittaa ehdotetun painon suoraan `LD[k].sets[s].kg`-kenttään ohittaen `saveSet()`-funktion. PR-merkin `isPR`-laskenta (index.html:2527) käyttää samaa `ed.sets`-dataa riippumatta siitä onko se käyttäjän oikeasti suorittama vai vasta ehdotettu — koska "puhdas" progressio ehdottaa aina +2.5% edellistä maksimia enemmän, merkki syttyy välittömästi kun liike avataan, ennen kuin mitään on nostettu.

**Korjaus:** `isPR` ehdollistetaan `done`-muuttujalla (jo scopessa `renderSession()`:ssä, treenin "Merkitse tehdyksi" -tilaa vastaava):

```js
const isPR = done && pWeights.length > 0 && cWeights.length > 0 && Math.max(...cWeights) > Math.max(...pWeights);
```

Tämä tekee merkistä jälkikäteisen ("treeni merkitty tehdyksi ja se ylitti ennätyksen") sen sijaan että se olisi ennakoiva ("saatat ylittää ennätyksen") — sama luottamusraja jota muu osa renderöintilogiikkaa jo käyttää `done`-tilalle. Erillinen toast-ilmoitus (`checkForPR`, laukeaa vain oikeista `saveSet()`-kutsuista) ei muutu.

**Hylätty vaihtoehto:** merkitä automaattitäytetyt sarjat `auto`-lipulla joka tyhjennetään `saveSet()`:ssä käyttäjän muokatessa kenttää. Ei toimi, koska useimmat käyttäjät hyväksyvät ehdotuksen sellaisenaan koskematta kenttään — `saveSet()` ei silloin koskaan laukea eikä lippu koskaan tyhjenny, jolloin merkki ei syttyisi koskaan edes oikean ennätyksen jälkeen.

---

## 2. Valmentajan päivittäinen raja ei laske toista Claude-kutsua

**Ongelma:** `supabase/functions/coach-chat/index.ts`:n `updateCoachNotes()` tekee oman, erillisen `callClaude()`-kutsun päivittääkseen `coach_notes`-taulun, mutta tätä kutsua ei koskaan lasketa `coach_api_calls`-tauluun. Todellinen Anthropic-API-käyttö on siis ~2x se mitä `DAILY_MESSAGE_LIMIT`-raja (100) todellisuudessa rajoittaa.

**Korjaus:** lisätään toinen seurantarivi `updateCoachNotes()`:n sisällä heti kun sen oma `callClaude()`-kutsu onnistuu (ei jos `coach_notes`-haku epäonnistuu ennen kutsua, eikä jos itse Claude-kutsu epäonnistuu):

```ts
try {
  updatedNotes = await callClaude(NOTES_SYSTEM_PROMPT, [{ role: 'user', content: notesPrompt }]);
} catch (err) {
  console.error('notes update Claude call failed:', err instanceof Error ? err.message : String(err));
  return;
}
const { error: trackError } = await sb.from('coach_api_calls').insert({});
if (trackError) console.error('failed to record notes-update api call:', trackError.message);
```

`DAILY_MESSAGE_LIMIT` pysyy arvossa 100 — rajaa ei nosteta kompensoimaan, koska rajan koko tarkoitus on kustannuskatto, ja korjauksen pointti on että se toteutuu oikeasti (aiemmin todellinen käyttö saattoi nousta ~200:aan asti huomaamatta).

---

## 3. Unen synkkauksen oppaan sanamuoto

**Ongelma:** Molempien oppaiden (`docs/apple-watch-shortcuts-guide.md` ja `-en.md`) "Unen synkkaus" / "Sleep Sync" -osion vaihe 4 ohjeistaa laskemaan `TotalMin`-summan suoraan **Aseta muuttuja** / **Set Variable** -toiminnon sisällä (`DeepMin + RemMin + CoreMin`). Shortcuts ei kuitenkaan tue laskutoimituksia suoraan Aseta muuttuja -toiminnossa — summa vaatii erillisen **Laske** / **Calculate** -toiminnon ensin, jonka tulos sitten tallennetaan Aseta muuttuja -toiminnolla.

**Korjaus:** päivitetään vaihe 4 molemmissa kielitiedostoissa ohjeistamaan erillisen Laske/Calculate-toiminnon lisäämistä ennen Aseta muuttuja -toimintoa, samaan tapaan kuin osion vaiheessa 2 jo ohjeistetaan Magic Variable -sidonnan tarkistamista.

---

## Testaus

Ei automaattitestejä (olemassa oleva projektikäytäntö). Manuaalinen läpikäynti:

1. **PR-merkki:** avaa progressioiva liike Sali-sivulla ennen treenin merkitsemistä tehdyksi — merkki EI näy vaikka ehdotettu paino ylittäisi edellisen maksimin. Merkitse treeni tehdyksi ilman muokkauksia (ehdotettu paino todella ylitti edellisen maksimin) — merkki näkyy.
2. **Rate limit:** lähetä yksi viesti valmentajalle, tarkista `coach_api_calls`-taulusta Supabasen dashboardista että kaksi riviä lisättiin (yksi vastaukselle, yksi muistiinpanopäivitykselle).
3. **Opas:** lue molemmat päivitetyt osiot läpi, tarkista ettei sisäinen ristiriita jää (esim. myöhempi Testaus-osio yhä olettaa `TotalMin`-muuttujan olevan olemassa).
