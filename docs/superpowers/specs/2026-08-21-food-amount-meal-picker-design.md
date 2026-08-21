# Treeniapp (Valkku) — Ateriavalitsin määrä-askeleeseen

**Päivämäärä:** 2026-08-21
**Laajuus:** Ruokahaun määrä-askeleeseen (`food-search-step-amount`) uusi ateriavalitsin, joka mahdollistaa aterian vaihtamisen juuri ennen tallennusta — ei vaikutuksia kuvaskannauksen (`food-search-step-photo`) monirivisen bulkkitallennuksen kulkuun.
**Riippuvuudet:** Olemassa oleva `MEAL_DEFS`-taulukko, `foodModalMeal`-globaali, `openFoodSearch(mealType)`, `goToAmountStep()`, `confirmAddFood()`.

---

## Tausta

Sulamo.fi (vertailtu kilpailijasovellus) näyttää ateriavalinnan pudotusvalikkona suoraan määrä/lisätiedot-askeleessa, jolloin ateria voidaan vaihtaa vielä juuri ennen tallennusta ilman että koko hakua tarvitsee aloittaa uudelleen väärästä ateriasta. Treeniapissa ateria lukitaan heti kun käyttäjä painaa jonkin aterian "+ Lisää ruoka" -nappia (`openFoodSearch(mealType)` asettaa `foodModalMeal`:in), eikä sitä voi enää muuttaa myöhemmin samassa haku-istunnossa.

## 1. Laajuus

Valitsin lisätään **vain** määrä-askeleeseen (`food-search-step-amount`) — ei kuvaskannauksen bulkkitallennukseen (`food-search-step-photo`/`saveAllFoodPhotoRows()`), jossa yksi `foodModalMeal`-arvo koskee useaa riviä kerralla eikä Sulamollakaan ole vastaavaa rivikohtaista valitsinta siellä.

## 2. UI ja käytös

Uusi `<select id="food-amount-meal">` lisätään `food-amount-name`-elementin jälkeen, ennen Määrä (g) -kenttää. Vaihtoehdot tulevat suoraan `MEAL_DEFS`-taulukosta (`🌅 Aamiainen`, `☀️ Lounas`, `🌇 Päivällinen`, `🍎 Välipala`).

- Kun määrä-askel avataan (`goToAmountStep()`), valitsimen arvoksi asetetaan nykyinen `foodModalMeal` (eli se ateria, jonka "+ Lisää ruoka" -nappia painettiin) — sama oletuskäytös kuin nyt, ei muutosta olemassa olevaan reittiin.
- Valitsimen `onchange` päivittää `foodModalMeal`-globaalin suoraan käyttäjän valintaan.
- `confirmAddFood()` lukee `foodModalMeal`:in vasta tallennushetkellä, joten mitään muuta tallennuslogiikkaa ei tarvitse muuttaa — valitsin on puhdas UI-lisäys olemassa olevan globaalin päälle.
- Valinta ei tallennu istunnon yli — seuraavan kerran kun haku avataan, ateria määräytyy taas sen mukaan mitä nappia painettiin, kuten tänäänkin.

## 3. Rajaus

- Ei muutoksia `food_log_entries`-skeemaan.
- Ei muutoksia kuvaskannauksen bulkkitallennukseen.
- Ei tallenneta käyttäjän viimeksi valitsemaa ateriaa mihinkään — puhtaasti kertakäyttöinen valinta per haku-istunto.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa ruoan lisäys Lounas-ateriasta ("+ Lisää ruoka" Lounas-osiossa) — valitse mikä tahansa ruoka, tarkista että määrä-askeleen valitsin näyttää oletuksena "☀️ Lounas".
2. Vaihda valitsimesta "🌅 Aamiainen", tallenna — tarkista että ruoka ilmestyy päiväkirjassa Aamiainen-osioon, ei Lounaaseen.
3. Toista päinvastoin: avaa Aamiainen-osiosta, vaihda valitsimella Päivällinen, tallenna, tarkista että ruoka menee Päivällinen-osioon.
4. Avaa haku uudelleen jostain ateriasta sen jälkeen kun edellisessä haussa vaihdettiin toiseen ateriaan — tarkista että valitsin näyttää taas oletuksena sen aterian jota juuri painettiin, ei edellisen haun valintaa.
5. Tarkista ettei kuvaskannauksen bulkkitallennusnäkymä muutu millään tavalla.
6. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
