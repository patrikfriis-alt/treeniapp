# Treeniapp (Valkku) — Oman tuotteen ravintosisältö per annos

**Päivämäärä:** 2026-08-21
**Laajuus:** Oman tuotteen lisäys -lomakkeeseen (`food-search-step-custom`) uusi vaihtoehto syöttää ravintosisältö "per annos" -muodossa "per 100 g":n sijaan tai lisäksi.
**Riippuvuudet:** Olemassa oleva `custom_foods`-taulu (per-100g-skeema, ei muutoksia), `createCustomFood()`, `saveCustomFoodAndContinue()`, `parseNum()`, `showStatus()`, `.stab`-CSS.

---

## Tausta

Sulamo.fi (vertailtu kilpailijasovellus) antaa käyttäjän valita oman tuotteen ravintosisällön syöttömuodoksi joko "per 100 g" tai "per annos" — mikä tahansa vastaa suoraan pakkauksen tuoteselostetta. Treeniapissa oman tuotteen lomake vaatii aina per-100g-arvot, joten kun pakkauksessa lukee ravintosisältö per annos (esim. "1 annos (30 g): 120 kcal"), käyttäjän täytyy laskea 100g-muunnos itse ennen syöttöä. Tämä ominaisuus poistaa tuon manuaalisen laskutoimituksen.

## 1. UI

Uusi kaksipainikkeinen valitsin (`.stab`-tyylinen, sama ulkoasu kuin muualla tiedostossa käytetyt pikanäppäimet) lisätään oman tuotteen lomakkeen alkuun, Nimi-kentän ja neljän ravintoainekentän väliin:

```
[ Per 100g ]  [ Per annos ]
```

**Per 100g** on oletusvalinta (nykyinen käytös, ei muutu).

**Per annos** valittaessa:
- Uusi kenttä **"Annoskoko (g)"** ilmestyy heti Nimi-kentän jälkeen, ennen ravintoainekenttiä.
- Neljän ravintoainekentän labelit vaihtuvat: `Kcal/100g` → `Kcal/annos`, `Proteiini/100g` → `Proteiini/annos`, `Hiilarit/100g` → `Hiilarit/annos`, `Rasva/100g` → `Rasva/annos`.
- Tilan vaihto (kumpaan suuntaan tahansa) tyhjentää neljä ravintoainekenttää (ei Nimi-kenttää eikä Annoskoko-kenttää), jotta vanhassa tilassa syötetyt luvut eivät jää näkyviin väärän labelin alle.

## 2. Muunnos ja tallennus

Ei muutoksia `custom_foods`-tauluun eikä `createCustomFood()`-funktioon — ne pysyvät per-100g-skeemassa. `saveCustomFoodAndContinue()` laskee muunnoksen ennen `createCustomFood()`-kutsua kun "Per annos" on valittuna:

```
per100g = enteredValue * 100 / annoskoko
```

"Per 100g" -tilassa käytös on identtinen nykyiseen — ei muunnosta.

## 3. Validointi

"Per annos" -tilassa Annoskoko on pakollinen kenttä Nimen ja Kcal:n rinnalla (sama malli kuin nykyinen `if (!name || kcal == null)` -tarkistus). Jos Annoskoko puuttuu tai on ≤ 0, näytetään olemassa oleva `showStatus('custom-food-status', ..., true)` -virhe eikä jakolaskua suoriteta (estää nollalla jakamisen ja mielettömät per-100g-arvot).

## 4. Rajaus

- Ei muutoksia `custom_foods`-skeemaan — puhtaasti client-side-muunnos syöttövaiheessa.
- Ei vaikutusta olemassa oleviin oman tuotteen riveihin tai amount-step-laskentaan (`updateFoodAmountPreview()` jne. käyttävät edelleen per-100g-arvoja muuttumattomina).
- Annoskoko-arvoa itseään ei tallenneta mihinkään — se on vain väliaikainen muunnoskerroin syöttöhetkellä.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa oman tuotteen lomake, valitse "Per annos".
2. Syötä oikean pakkauksen luvut (esim. annoskoko 30 g, 120 kcal, 3 g proteiinia, 15 g hiilareita, 5 g rasvaa).
3. Tallenna ja jatka määrä-askeleeseen — tarkista että 100 g:n esikatselu näyttää oikein muunnetut arvot (400 kcal, 10 g proteiinia, 50 g hiilareita, 16,7 g rasvaa / 100 g).
4. Vaihda takaisin "Per 100g" -tilaan ja tarkista että vanha käytös (ei muunnosta, suorat per-100g-arvot) toimii edelleen.
5. Jätä Annoskoko tyhjäksi "Per annos" -tilassa ja tarkista että tallennus estyy virheilmoituksella.
6. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
