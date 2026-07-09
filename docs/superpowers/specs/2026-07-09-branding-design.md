# Treeniapp — Branding ("Valkku")

**Päivämäärä:** 2026-07-09
**Laajuus:** Sprintti 3 osa 2 (kohta "Branding", 2 pistettä). Nimen, app-ikonin ja favoritenit vaihto — ei muutoksia väriteemaan.
**Riippuvuudet:** Ei mitään — pelkkä HTML/manifest-muutos olemassa oleviin tiedostoihin.

---

## Tavoite

Sovelluksen nimi on tähän asti ollut geneerinen "Treeniapp"/"Treeni", ja PWA-ikoni on emoji-pohjainen SVG (🏋️ sinisellä pyöristetyllä taustalla) — sama emoji-renderöinnin epäjohdonmukaisuusongelma joka äskettäin korjattiin muualta sovelluksesta (ks. SVG-ikonisetti-projekti). Tavoite: antaa sovellukselle oma nimi ("Valkku") ja korvata emoji-ikoni itse piirretyllä, riippuvuusvapaalla SVG-ikonilla — sekä lisätä puuttuva favicon-linkki selaimen välilehteä varten.

---

## 1. Nimi

`Treeniapp` / `Treeni` → `Valkku` (sama nimi käytetään sekä täyspitkänä että lyhyenä nimenä — ei erillistä lyhennettä).

Muutettavat kohdat:
- `index.html:10` — `<meta name="apple-mobile-web-app-title" content="Treeniapp">` → `content="Valkku"`
- `index.html:12` — `<title>Treeniapp</title>` → `<title>Valkku</title>`
- `manifest.json` — `"name": "Treeniapp"` → `"name": "Valkku"`, `"short_name": "Treeni"` → `"short_name": "Valkku"`

Sovelluksen sisäisessä UI:ssa (sivupalkki, otsikot, tervehdys) ei esiinny nimeä missään muualla — vain versiochippi näkyy sivupalkissa, eikä se sisällä nimeä. Ei muita kohtia muutettavaksi.

---

## 2. App-ikoni ja favicon

Nykyinen `manifest.json`-ikoni on data-URI SVG jossa emoji 🏋️ tekstinä SVG:n sisällä:
```
<svg ...><rect .../><text ...>🏋️</text></svg>
```

Korvataan itse piirretyllä stroke-SVG:llä — abstrakti pulssi/kehitys-viiva (visuaalisessa vertailussa valittu vaihtoehto "C"), valkoinen viiva sinisellä (`#0a84ff`) pyöristetyllä taustalla:

```svg
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
  <rect width='100' height='100' fill='%230a84ff' rx='22'/>
  <path d='M10 54h16l8-28 12 56 12-40 8 12h24' fill='none' stroke='%23fff' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/>
</svg>
```

(Path skaalattu 100×100-viewBoxiin samasta muodosta kuin mockupissa näytetty 24×24-versio: `M2 13h4l2-7 3 14 3-10 2 3h6`.)

`manifest.json`-muutos:
```json
"icons": [
  {
    "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230a84ff' rx='22'/><path d='M10 54h16l8-28 12 56 12-40 8 12h24' fill='none' stroke='%23fff' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    "sizes": "any",
    "type": "image/svg+xml",
    "purpose": "any maskable"
  }
]
```

**Favicon:** `index.html`:ssä ei tällä hetkellä ole lainkaan `<link rel="icon">`-tagia, joten selaimen välilehdellä ei näy sovelluksen omaa ikonia. Lisätään sama SVG data-URI faviconiksi:

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230a84ff' rx='22'/><path d='M10 54h16l8-28 12 56 12-40 8 12h24' fill='none' stroke='%23fff' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/></svg>">
```

Lisätään `<title>`-tagin läheisyyteen `index.html`:n `<head>`-osioon.

---

## 3. Väriteema

Ei muutoksia. `theme-color` (`#000000`), `background_color` (`#000000`) ja sovelluksen `--accent`-sininen (`#0a84ff`) säilyvät ennallaan — käyttäjä valitsi tietoisesti säilyttää nykyisen musta+sininen-teeman.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Selaimen välilehdellä näkyy uusi sininen pulssi-ikoni faviconina (ei oletusikonia/tyhjää).
2. Selaimen title-teksti näyttää "Valkku".
3. `manifest.json` validoi (esim. `python3 -m json.tool manifest.json` ei virhettä) ja sisältää `"name": "Valkku"`, `"short_name": "Valkku"`.
4. PWA-asennusdialogi (jos testattavissa DevToolsin "Add to Home Screen" -simulaatiolla) näyttää nimen "Valkku" ja uuden ikonin.
5. Ei konsolivirheitä sivun latautuessa.
