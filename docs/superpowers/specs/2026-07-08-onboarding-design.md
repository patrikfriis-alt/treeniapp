# Treeniapp — Onboarding-tarkistuslista

**Päivämäärä:** 2026-07-08
**Laajuus:** Sprintti 1 osa 4/5. Kevyt tarkistuslista-kortti Koontiin, joka ohjaa uuden (tyhjän) tilin läpi kolmen perusasian asettamisen: harjoitusohjelma, ravintotavoitteet, kestävyystavoitteet.
**Riippuvuudet:** Käyttää olemassa olevia Ohjelmaeditori-, Ravintotavoite- ja Kestävyystavoite-toimintoja (kaikki jo mergetty mainiin). Ei muokkaa niitä.

---

## Tavoite

Sovelluksessa ei ole tällä hetkellä mitään ensikäynnistyslogiikkaa — se lataa suoraan mitä tahansa Supabasessa sattuu olemaan, eikä tunnista "uutta käyttäjää". Tyhjällä tilillä Koonti näyttää pelkkiä tyhjiä kortteja ilman ohjausta siitä, mistä aloittaa. Tavoite: kevyt, ei-pakottava tarkistuslista, joka ohjaa kolmen keskeisimmän asian pariin ja katoaa kun ne on hoidettu tai käyttäjä ohittaa sen.

Ei rakenneta uutta wizard-/stepper-komponenttia — kortti pelkästään linkittää olemassa oleviin, jo toimiviin näkymiin (Ohjelma-sivu, Ravintotavoitteet-modaali, Kestävyystavoitteet-modaali).

---

## 1. Datamalli

Lisätään sarake olemassa olevaan yhden rivin `app_settings`-tauluun (sama taulu jota kalorikerroin käyttää):

```sql
alter table app_settings
  add column onboarding_completed boolean not null default false;
```

Jos `app_settings`-riviä (id=1) ei vielä ole olemassa tilillä, `onboarding_completed` tulkitaan `false`:ksi (kortti näytetään) — sama fallback-malli kuin muillakin `app_settings`-kentillä.

---

## 2. Valmiuden tunnistus

Kolme riviä, kukin tunnistaa valmiutensa suoraan olemassa olevasta datasta (ei erillisiä per-kohde-flageja):

| Rivi | Linkki | Valmis kun |
|---|---|---|
| Luo harjoitusohjelma | `showPage('ohjelma', null)` | `Object.keys(SESS).length > 0` (SESS ladataan jo `loadProgram()`:lla käynnistyksessä) |
| Aseta ravintotavoitteet | `openGoalsModal()` | `nutrition_goals.daily_kcal != null` |
| Aseta kestävyystavoitteet | `openActivityGoalsModal()` | jokin `activity_goals.weekly_km / weekly_sessions / target_pace_min_per_km` ei ole `null` |

Valmis rivi näytetään ✓-merkillä, mutta pysyy silti klikattavana (voi palata muokkaamaan).

---

## 3. Kortti ja käyttäytyminen

**Sijainti:** Koonti-sivun ylimpänä, heti "Hei! 👋" -tervehdyksen alla, ennen streak/stats-riviä.

**Näkyvyys:** Kortti piilotetaan kokonaan (`display:none`) jos `app_settings.onboarding_completed === true`. Muuten näytetään aina, riippumatta siitä montako riviä on jo valmiina.

**Sisältö:**
```
┌─ Aloita tästä ─────────────────┐
│  ✓ Luo harjoitusohjelma        │
│  ○ Aseta ravintotavoitteet     │
│  ○ Aseta kestävyystavoitteet   │
│                     [Ohita]    │
└─────────────────────────────────┘
```

**"Ohita"-painike:** Kutsuu heti `saveOnboardingCompleted(true)`, kortti poistetaan DOM:sta.

**Automaattinen valmistuminen:** Joka kerta kun Koonti ladataan (`loadKoonti()`), tarkistetaan onko kaikki kolme ehtoa täyttynyt. Jos kyllä, kutsutaan `saveOnboardingCompleted(true)` automaattisesti ja kortti piilotetaan — käyttäjän ei tarvitse erikseen painaa "Ohita". Tämä myös varmistaa, ettei kortti palaa näkyviin myöhemmin (esim. jos ohjelma poistetaan), koska flagi on jo pysyvästi `true`.

**Rivin klikkaus:** Navigoi/avaa vastaavan olemassa olevan näkymän suoraan (ei muuta kortin tilaa itsessään — tila päivittyy vasta seuraavalla `loadKoonti()`-kutsulla, esim. käyttäjän palatessa Koontiin tallennuksen jälkeen).

---

## 4. Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Tyhjällä tilillä (ei ohjelmaa, ei tavoitteita, `onboarding_completed` puuttuu/false) — Koonnissa näkyy "Aloita tästä" -kortti, kaikki kolme riviä merkitsemättä.
2. Klikkaa "Luo harjoitusohjelma" → navigoi Ohjelma-sivulle. Luo sessio. Palaa Koontiin — rivi näyttää ✓:n.
3. Klikkaa "Aseta ravintotavoitteet" → avaa olemassa olevan modaalin, aseta kcal, tallenna. Palaa Koontiin — rivi näyttää ✓:n.
4. Klikkaa "Aseta kestävyystavoitteet" → avaa modaalin, aseta viikko-km, tallenna. Palaa Koontiin — kaikki kolme ✓, kortti katoaa automaattisesti (ei tarvitse painaa Ohita).
5. Uudella tyhjällä tilillä: paina "Ohita" heti — kortti katoaa, eikä palaa näkyviin vaikka sivu ladattaisiin uudelleen.
