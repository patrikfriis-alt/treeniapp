# Treeniapp (Valkku) — Oman tuotteen duplikaattivaroitus

**Päivämäärä:** 2026-08-21
**Laajuus:** Oman tuotteen lisäys -lomakkeeseen (`food-search-step-custom`) live-haku, joka varoittaa jos samannimisiä tuotteita on jo olemassa `custom_foods`-taulussa.
**Riippuvuudet:** Olemassa oleva `custom_foods`-taulu, `goToCustomFoodStep()`, `custom-food-name`-kenttä, `foodSearchDebounce`/`foodSearchRequestId`-mallin mukainen debounce-kuvio.

---

## Tausta

Sulamo.fi (vertailtu kilpailijasovellus) näyttää oman tuotteen lisäyslomakkeella live-listan samannimisistä olemassa olevista tuotteista ja varoituksen ("tarkista ettei tuote ole jo lisätty") ennen tallennusta. Treeniapissa oman tuotteen lisäys ei tarkista mitenkään onko samanniminen tuote jo olemassa — eikä `custom_foods`-tuotteita edes näytetä missään muualla haussa (pääruokahaku hakee vain `fineli_foods`-taulusta), joten käyttäjä ei voi muutenkaan huomata luovansa duplikaattia. Tämä ominaisuus lisää sen ainoan kohdan, jossa duplikaatti syntyy: itse luontilomakkeen.

## 1. Haku ja ajoitus

Debounced haku (300ms, sama malli kuin `onFoodSearchInput()`/`foodSearchDebounce`) käynnistyy kun `custom-food-name`-kenttään on kirjoitettu vähintään 2 merkkiä:

```js
sb.from('custom_foods').select('id, name').ilike('name', `%${q}%`).order('name').limit(5)
```

Haku on case-insensitive automaattisesti (`ilike`). Jokainen haku käyttää samaa request-id-suojausta kuin muut tämän tiedoston async-haut (esim. `foodSearchRequestId`), jotta hidas vastaus ei ylikirjoita nopeamman myöhemmän haun tulosta.

## 2. UI

Uusi tulosalue ilmestyy Nimi-kentän alle, ennen Per 100g / Per annos -valitsinta, **vain kun osumia löytyy**:

```
⚠️ Tarkista ettei tuote ole jo lisätty:
  • Kreikkalainen jogurtti 0%
  • Kreikkalainen jogurtti 2%
```

- Alue on täysin passiivinen (ei klikattava, ei linkkejä) — pelkkä informatiivinen lista.
- Alue katoaa heti kun kenttä tyhjenee alle 2 merkin tai haku ei tuota osumia.
- Ei vaikuta lomakkeen muihin osiin (Per 100g/Per annos -valitsin, kentät, tallennuspainike) millään tavalla.

## 3. Tallennuskäytös

**Ei koskaan estä tallennusta.** "Tallenna ja jatka" toimii identtisesti riippumatta siitä näytetäänkö varoitus vai ei — puhtaasti informatiivinen ominaisuus, kuten Sulamon vastaava. Tämä välttää väärät positiiviset (esim. kaksi eri makuista jogurttia samalla perusnimellä) estämästä laillista käyttöä.

## 4. Rajaus

- Tarkistetaan vain `custom_foods`-taulua — `food_cache`-rivit eivät voi duplikoitua koska ne upsertataan `fineli_id`:n perusteella, joten niitä ei tarvitse tarkistaa.
- Ei muutoksia `custom_foods`-skeemaan.
- Ei estä tallennusta missään tilanteessa, ei vaadi lisävahvistusta.
- Tulosalue ei ole klikattava/interaktiivinen — pelkkä nimilista.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Luo oma tuote nimellä "Testijogurtti" (tallenna ja jatka onnistuneesti).
2. Aloita uuden oman tuotteen luonti, kirjoita Nimi-kenttään "Testi" — tarkista että varoitus ja "Testijogurtti" ilmestyvät listaan hetken kuluttua (debounce).
3. Jatka kirjoittamista niin että nimi ei enää täsmää mihinkään olemassa olevaan (esim. "Testi123xyz") — tarkista että varoitus katoaa.
4. Tyhjennä kenttä yhden merkin mittaiseksi — tarkista ettei hakua käynnistetä eikä varoitusta näytetä.
5. Tallenna uusi tuote vaikka varoitus on näkyvissä — tarkista että tallennus onnistuu normaalisti eikä mikään estä sitä.
6. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
