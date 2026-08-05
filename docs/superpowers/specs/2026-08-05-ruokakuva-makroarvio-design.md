# Treeniapp (Valkku) — Ruokakuvan tekoälyavusteinen makroarvio

**Päivämäärä:** 2026-08-05
**Laajuus:** Ruokakuva-avusteisessa haussa (ks. `2026-07-16-ruokakuva-design.md`) tunnistettu komponentti ei aina löydy Finelistä samalla nimellä. Lisätään mahdollisuus pyytää tekoälyltä makroarvio (kcal/proteiini/hiilarit/rasva per 100g) samasta kuvasta, joka esitäyttää "+ Lisää oma tuote" -lomakkeen — käyttäjä tarkistaa/muokkaa arvion ennen tallennusta, ei koskaan tallenneta suoraan.
**Riippuvuudet:** Olemassa oleva ruokakuva-tunnistus (`analyzeFoodPhotoFile`, `selectFoodPhotoComponent`, `food-photo`-Edge Function), olemassa oleva oma tuote -tallennuspolku (`goToCustomFoodStep`, `saveCustomFoodAndContinue`, `createCustomFood`), sama `COACH_SECRET`-porttimalli.

---

## Tausta

Ruokakuva-tunnistus antaa usein oikean ruoan nimen, mutta Fineli-haku ei löydä osumaa (Fineli on lähinnä raaka-aine-/yksinkertaistietokanta, ei resepti-/annostietokanta, ja hakusanan sanamuoto ei aina täsmää). Tähän asti ainoa etenemistapa on ollut "+ Lisää oma tuote" -linkki tyhjällä lomakkeella — käyttäjän piti tietää ruoan ravintosisältö ulkoa, mikä tekee kuva-avusteisen haun koko pointin (ei tarvitse tietää etukäteen) tyhjäksi juuri niissä tapauksissa joissa sitä eniten tarvittaisiin. Tämä lisää tekoälyavusteisen arvion samaan lomakkeeseen, samalla "AI ehdottaa, käyttäjä vahvistaa" -periaatteella kuin nimi/grammat jo toimivat.

**Rajaus:** Koskee vain ruokakuva-polkua (ei manuaalista tekstihakua) — ks. keskustelu, tietoinen päätös pitää muutos suppeana.

---

## 1. Käyttöliittymä: painike hakutulosten yhteydessä

Kun hakukenttä on esitäytetty kuvakomponentin nimellä (`selectFoodPhotoComponent`:n kautta), näytetään uusi "🤖 Arvioi tekoälyllä" -painike **hakutulosten yläpuolella** (ei alapuolella kuten nykyinen "+ Lisää oma tuote" -linkki) — pysyy näkyvissä vierittämättä vaikka Fineli palauttaisi kymmeniä epäolennaisia sumeita osumia. Painike näkyy vain kun nykyinen haku on peräisin kuvapolusta (ei manuaalisessa tekstihaussa) — tunnistetaan siitä että kuvatiedon muistiin jäänyt kuva (`foodPhotoLastImageBase64`) on asetettu.

Manuaalinen "+ Lisää oma tuote" -linkki pysyy ennallaan tulosten alla, molempien polkujen rinnalla.

---

## 2. Tila: kuvan säilytys jatkokäyttöä varten

`analyzeFoodPhotoFile`:n resurssoima base64-kuva (jo laskettu kerran tunnistusta varten) tallennetaan uuteen moduulitason muuttujaan `foodPhotoLastImageBase64` analyysin onnistuttua. Nollataan `openFoodSearch`:n ja `closeFoodSearch`:n yhteydessä, samaan tapaan kuin `foodPhotoComponents`/`foodPhotoPendingGrams` jo nollataan.

---

## 3. Backend: uusi `food-macro-estimate`-Edge Function

Uusi funktio `supabase/functions/food-macro-estimate/index.ts`, rakenteeltaan `food-photo`:n kaltainen:

- Ottaa vastaan: base64-kuva, tunnistettu nimi (`name`), arvioitu määrä grammoina (`grams`, kontekstiksi promptiin — ei vaikuta per-100g-laskentaan).
- Portti: sama `x-coach-secret`-header/`COACH_SECRET`-arvo kuin `food-photo`:lla.
- Päiväraja: uusi `food_macro_estimate_calls`-taulu, identtinen rakenne kuin `food_photo_calls` (`id`+`created_at`, RLS ilman policyja), oma 20/pv-raja.
- Kutsuu Claudea vision-syötteellä (sama kuva uudelleen), promptilla joka pyytää PELKÄSTÄÄN JSON-olion: `{"kcalPer100g": number, "proteinPer100g": number, "carbsPer100g": number, "fatPer100g": number}` — ohjeistetaan arvioimaan tyypillinen ravintosisältö annetulle ruoalle/annokselle kuvan ja nimen perusteella.
- Jos Claude ei pysty arvioimaan järkevästi, palauttaa virheen (asiakas näyttää selkeän epäonnistumisviestin, ei tyhjiä/nollaarvoja lomakkeeseen).

---

## 4. Datavirta: esitäyttö ja tallennus

**Ei uutta tallennuspolkua** — arvio esitäyttää ainoastaan olemassa olevan oma tuote -lomakkeen kentät, tallennus kulkee muuttumattomana nykyisen polun läpi.

1. Painikkeen napautus → `estimateFoodMacrosWithAI()`: hakee `COACH_SECRET`:n (`getCoachSecret()`/`promptCoachSecret`, sama malli kuin `analyzeFoodPhotoFile`), kutsuu `food-macro-estimate`-funktiota `{image: foodPhotoLastImageBase64, name: <hakukentän arvo>, grams: foodPhotoPendingGrams}`.
2. Onnistuessa: tallennetaan tulos uuteen moduulitason muuttujaan `foodPhotoMacroEstimate = {kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g}`, kutsutaan `goToCustomFoodStep()`.
3. `goToCustomFoodStep()` laajennetaan: esitäyttää `custom-food-name`:n hakukentän arvolla (jo olemassa oleva korjaus) JA `custom-food-kcal`/`-protein`/`-carbs`/`-fat` `foodPhotoMacroEstimate`:sta jos asetettu (muuten tyhjät, kuten nykyään). Näyttää pienen "Tekoälyn arvio, tarkista ennen tallennusta" -huomautuksen lomakkeen yläpuolella kun esitäyttö on peräisin arviosta. Kuluttaa (`foodPhotoMacroEstimate = null`) heti käytön jälkeen, jottei vanha arvio vuoda seuraavaan, arvioimattomaan oma tuote -kertaan.
4. Käyttäjä tarkistaa/muokkaa kenttiä normaalisti, napauttaa "Tallenna ja jatka" → **muuttumaton** `saveCustomFoodAndContinue()` → `createCustomFood()` (kirjoittaa `custom_foods`-tauluun täsmälleen kuten manuaalisessa kirjauksessa) → `goToAmountStep()` (grammat esitäytetty `foodPhotoPendingGrams`:sta, jo toimiva) → `confirmAddFood()` → `addFoodLogEntry()` (kirjoittaa `food_log_entries`-tauluun täsmälleen kuten nykyään).

Tietokannassa ei eroa: tekoälyn arvion kautta tallennettu oma tuote on identtinen manuaalisesti syötetyn kanssa (tietoinen valinta — käyttäjä on jo vahvistanut/muokannut arvon ennen tallennusta, joten erillistä "ai_estimated"-lippua ei lisätä).

---

## 5. Virhetilanteet

- Kuvan lähetys/analyysi epäonnistuu (verkkovirhe, Claude-virhe, Claude ei pysty arvioimaan): selkeä virheviesti painikkeen yhteydessä, käyttäjä voi yrittää uudelleen tai käyttää olemassa olevaa manuaalista "+ Lisää oma tuote" -linkkiä sen sijaan — ei jumita käyttöliittymää.
- Päiväraja ylitetty: selkeä "päivän arviointiraja täynnä" -viesti (sama sävy kuin `food-photo`:n 429-käsittely), ei hiljainen epäonnistuminen.
- `COACH_SECRET` puuttuu/väärä: sama `promptCoachSecret`-kierto kuin muillakin tekoälyominaisuuksilla.

---

## Testaus

Ei automaattitestejä (projektin vakiokäytäntö). Manuaalinen läpikäynti:

1. Kuva ruoasta jonka nimi ei löydy Finelistä → "🤖 Arvioi tekoälyllä" näkyy hakutulosten yläpuolella heti, ei vaadi vierittämistä vaikka Fineli palauttaisi paljon epäolennaisia osumia.
2. Painikkeen napautus → lataustila → oma tuote -lomake avautuu nimi + kaikki neljä ravintokenttää esitäytettynä, "Tekoälyn arvio, tarkista" -huomautus näkyvissä.
3. Arvojen muokkaus ja tallennus → määräkenttä (Sali-vaihe) esitäytetty oikealla grammamäärällä kuten ennenkin → tallennus onnistuu, näkyy oikeassa ateriassa oikealla kcal-määrällä.
4. Manuaalinen tekstihaku (ei kuvapolku) → painiketta ei näytetä, vain tavallinen "+ Lisää oma tuote".
5. Painike toisen kerran ilman uutta kuvaa (esim. peruutuksen jälkeen) → ei vanhaa/väärää arviota vahingossa uudelleenkäytössä (kulutuslogiikka nollaa `foodPhotoMacroEstimate`:n).
6. Päivärajan ylitys → selkeä virheviesti.
7. Verkkovirhe/Claude-virhe → selkeä virheviesti, "+ Lisää oma tuote" toimii edelleen varapolkuna.
