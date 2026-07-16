# Treeniapp (Valkku) — Ruokakuva-avusteinen haku

**Päivämäärä:** 2026-07-16
**Laajuus:** Lisätään mahdollisuus tunnistaa ruoka valokuvasta ja käyttää tunnistusta olemassa olevan Fineli-hakukentän esitäyttöön — AI ei koskaan päätä lopullisia kaloreita, vain ehdottaa nimeä ja määrää joiden pohjalta käyttäjä hakee ja vahvistaa oikean Fineli-osuman kuten nytkin.
**Riippuvuudet:** Olemassa oleva ruokahaku (`openFoodSearch`, `runFoodSearch`, `searchFineli`), olemassa oleva Claude API -integraatio ja sen turvamalli (`coach-chat`-Edge Function, `COACH_SECRET`-passphrase-portti).

---

## Tausta

Nykyinen ruokakirjaus vaatii ruoan nimen kirjoittamista hakukenttään Fineli-tietokannasta löytämiseksi. Tämä lisää kuvapohjaisen avustuksen: käyttäjä ottaa/valitsee kuvan ateriasta, AI tunnistaa ruokakomponentit ja arvioi määrät, ja tunnistus esitäyttää olemassa olevan haku- ja vahvistuspolun — ei korvaa sitä. Kustannus on marginaalinen (arvioitu aiemmin session aikana), joten ei tarvetta tiukalle rajoitukselle, mutta säilytetään sama passphrase+rajaus-malli kuin valmentajalla väärinkäytön estämiseksi.

---

## 1. Käyttöliittymä: kuvan syöttö

Uusi "📷 Kuvasta" -painike `openFoodSearch`-modaalin hakukentän vieressä. Käyttää natiivia `<input type="file" accept="image/*">`-elementtiä, joka mobiiliselaimissa tarjoaa sekä kamera- että galleriavaihtoehdon ilman erillistä UI:ta.

---

## 2. Backend: `food-photo`-Edge Function

Uusi funktio `supabase/functions/food-photo/index.ts`, rakenteeltaan `coach-chat`:n kaltainen:

- Ottaa vastaan base64-koodatun JPEG-kuvan.
- Portti: sama `x-coach-secret`-header ja `COACH_SECRET`-arvo kuin `coach-chat`:lla (yksi jaettu "AI-ominaisuus"-salasana, ei kahta erillistä muistettavaa).
- Päiväraja: uusi `food_photo_calls`-taulu, rakenteeltaan identtinen `coach_api_calls`:n kanssa (pelkkä `id`+`created_at`, RLS ilman policyja — vain service role koskettaa), mutta oma, matalampi raja: 20/pv (koska kutsutaan muutaman kerran per ateria, ei per viesti, vs. valmentajan 100/pv).
- Kutsuu Claudea vision-syötteellä, promptilla joka pyytää palauttamaan PELKÄSTÄÄN JSON-taulukon `{name: string, grams: number}` jokaiselle kuvassa erottuvalle ruokakomponentille, suomenkielisillä nimillä (Fineli-yhteensopivuuden vuoksi).
- Jos Claude ei tunnista mitään syötävää, palauttaa tyhjän taulukon (ei virhettä) — asiakas näyttää selkeän "ei tunnistettu"-tilan.

---

## 3. Käyttöliittymä: komponenttilista ja vahvistus

Kuva-analyysin jälkeen `openFoodSearch`-modaaliin lisätään uusi väli-näkymä: lista tunnistetuista komponenteista (nimi + arvioitu grammamäärä per rivi). Napauttamalla riviä:

1. Siirrytään olemassa olevaan hakutulosnäkymään, hakukenttä esitäytettynä AI:n nimellä — laukaisee normaalin `runFoodSearch`:n, käyttäjä näkee oikeat Fineli-tulokset.
2. Kun käyttäjä valitsee osuman, määräkenttä esitäytetään AI:n grammaehdotuksella (muokattavissa).
3. Vahvistuksen jälkeen palataan komponenttilistaan seuraavaa riviä varten, kunnes kaikki on käyty läpi tai käyttäjä sulkee modaalin.

Jokainen komponentti kulkee siis täsmälleen saman haku+vahvistus-polun läpi kuin manuaalinen kirjaus tänään — AI vain esitäyttää lähtöarvot.

---

## 4. Virhetilanteet

- Kuvan lähetys/analyysi epäonnistuu (verkkovirhe, Claude-virhe): selkeä virheviesti, palataan normaaliin manuaaliseen hakuun — ei koskaan jumita käyttöliittymää.
- Ei tunnistettuja komponentteja: selkeä "ei tunnistettu, kokeile uudelleen tai hae manuaalisesti" -viesti.
- Päiväraja ylitetty: selkeä "päivän kuva-analyysiraja täynnä" -viesti, ei hiljainen epäonnistuminen.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Kuva yhdestä ruoasta → komponenttilistassa yksi rivi, uskottava nimi ja grammamäärä.
2. Kuva lautasesta jossa 2-3 erillistä ruokaa → jokainen omana rivinään.
3. Rivin napautus → hakukenttä esitäyttyy AI:n nimellä, oikeat Fineli-tulokset näkyvät; osuman valinnan jälkeen määräkenttä esitäyttyy AI:n grammaehdotuksella.
4. Yhden komponentin kirjaus, paluu listaan, toisen kirjaus → molemmat päätyvät erillisinä kirjauksina ateriaan.
5. Kuva jossa ei ruokaa (tai epäselvä/tyhjä kuva) → selkeä "ei tunnistettu" -viesti, manuaalinen haku toimii normaalisti sen jälkeen.
6. Päivärajan ylitys (tai rajalogiikan suora tarkistus) → selkeä "raja täynnä" -viesti, ei hiljainen epäonnistuminen.
7. Sekä kamera- että galleriapolku toimivat (testataan molemmat jos mahdollista).
