# Treeniapp — SVG-ikonisetti

**Päivämäärä:** 2026-07-09
**Laajuus:** Sprintti 3 osa 1. Korvaa pysyvän UI-kromin (alaNavi, sivupalkki, Koonti-kortit, hero-mittarit) emoji-ikonit itse piirretyllä inline-SVG-ikonisetillä. Ei koske sisältö-/ilmaisuemojeja (tervehdys, aktiviteettityypit, juhlistus-toastit).
**Riippuvuudet:** Ei mitään — pelkkä HTML/CSS/JS-muutos olemassa olevaan yhteen tiedostoon.

---

## Tavoite

Alkuperäinen huomio: "Emoji-ikonit renderöityvät epäjohdonmukaisesti — havaittu itse testissä (🍽️ meni rikki eräässä selaimessa). Oikea SVG-ikonisetti puuttuu." Emoji-glyyfien ulkonäkö vaihtelee käyttöjärjestelmän/selaimen fonttiversion mukaan, ja jotkut (esim. 🍽️, 🗓️) ovat monimutkaisia moniväri-glyyfejä jotka voivat pudota takaisin tekstimuotoon tai näyttää rikkinäisiltä. Tavoite: korvata toistuva navigaatio-/mittari-kromi yhtenäisellä, itse piirretyllä stroke-SVG-setillä joka näyttää identtiseltä kaikkialla.

---

## 1. Laajuus — mitkä ikonit vaihtuvat

**AlaNavi** (ei taustalaattaa, `stroke="currentColor"`, perii ympäröivän tekstivärin — myös aktiivisen napin valkoisen värin automaattisesti):
- Koonti-nappi: `home`
- Ruoka-nappi: `utensils`
- (Hampurilaisikoni `≡` on jo pelkkä tekstimerkki, ei emoji — ei muutu)

**Sivupalkki** (ei taustalaattaa, `stroke="currentColor"`):
- Ohjelma: `clipboard`
- Ravintotavoitteet: `target`
- Kestävyystavoitteet: `running`
- Kalorikerroin: `watch`
- Vie aktiviteetit (CSV): `upload`
- Vie salilokit (CSV): `upload`

**Koonti-kortit** (pyöreä taustalaatta, väri per kortti):
- Sali: `dumbbell`, sininen (`--accent` / `--accent-bg`)
- Aerobinen: `running`, punainen (`--red` / `--red-bg`)
- Keho: `scale`, vihreä (`--green` / `--green-bg`)
- Uni: `moon`, vihreä (`--green` / `--green-bg`)

**Hero-mittarit** (Koonti + Sali-sivu, sama `.hero-metric`-luokka — pyöreä taustalaatta):
- Streak (molemmat sivut): `flame`, meripihka (`--amber` / `--amber-bg`)
- Viikon sali (molemmat sivut): `dumbbell`, sininen
- Viikon aktiiv. (Koonti): `running`, punainen
- Uni ka (Sali-sivu): `moon`, vihreä
- Viikon aktiivisuus % (Koonti): `calendar`, neutraali harmaa (`--surface2` tausta, `--text2` viiva)
- Kuukausi (Koonti): `calendar`, neutraali harmaa

**Ei muutu** (sisältö-/ilmaisuemojit, säilyvät emojina): tervehdyksen 👋, aktiviteettityyppien 🏒🚶🏃🏋️⚡ valintavaihtoehdot lomakkeissa, juhlistus-toastien 🔥🏆, oivallusten 🏆📊, PR-badgen tekstisisältö, muut yksittäiset/kertaluontoiset emoji-käytöt.

---

## 2. Tekninen toteutus

Kaikki 13 nykyistä ikonikohtaa ovat jo staattista HTML:ää (ei JavaScript-templatoituja merkkijonoja) — vain korttien/mittareiden *arvot* päivittyvät JS:llä, ikonit itse ovat kiinteitä sivun latautuessa. Tämä mahdollistaa yksinkertaisen, DRY-ratkaisun ilman JS-templatointia:

1. Uusi `ICONS`-objekti (JS): avaimena ikonin nimi, arvona raaka SVG:n sisäinen path-data merkkijonona.
2. Jokainen HTML-kohta merkitään `data-icon="nimi"`-attribuutilla (badge-konteksteissa lisäksi `data-icon-bg` ja `data-icon-color`).
3. Yksi `renderIcons()`-funktio, kutsutaan kerran sovelluksen käynnistyessä (samassa IIFE:ssä missä `loadProgram()`/`loadKoonti()` jo kutsutaan): silmukoi kaikki `[data-icon]`-elementit, injektoi SVG:n `innerHTML`:nä, kääri badge-taustaan jos `data-icon-bg` on asetettu.

```js
const ICONS = {
  home:     '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>',
  utensils: '<path d="M18 8V6a2 2 0 00-2-2H8a2 2 0 00-2 2v2"/><path d="M20 8H4a1 1 0 00-1 1v2a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1z"/><path d="M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7"/>',
  dumbbell: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/><rect x="1" y="9" width="4" height="6" rx="1"/><rect x="19" y="9" width="4" height="6" rx="1"/><rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/>',
  flame:    '<path d="M12 2c-2 4-6 5-6 10a6 6 0 0012 0c0-2-1-3-2-4 0 2-1 3-2 2 1-3-1-5-2-8z"/>',
  running:  '<circle cx="14" cy="4" r="2"/><path d="M10 22l2-6 3-2-1-5-4 1-2 4M13 8l3 3 4-1M8 13l-3 2 1 5"/>',
  scale:    '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v4l3 2"/>',
  moon:     '<path d="M21 12.5A8.5 8.5 0 1111.5 3 7 7 0 0021 12.5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clipboard:'<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  target:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  watch:    '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M9 3h6l-1 3H10z"/>',
  upload:   '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
};

function renderIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    const path = ICONS[name];
    if (!path) return;
    const color = el.dataset.iconColor || 'currentColor';
    const svg = `<svg viewBox="0 0 24 24" width="${el.dataset.iconSize || 20}" height="${el.dataset.iconSize || 20}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    if (el.dataset.iconBg) {
      el.innerHTML = svg;
      el.style.cssText += `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:${el.dataset.iconBg};`;
    } else {
      el.innerHTML = svg;
    }
  });
}
```

Kutsutaan `renderIcons();` sovelluksen alustus-IIFE:ssä, ennen tai jälkeen `loadKoonti()`-kutsun (järjestyksellä ei väliä, koska ikonit eivät riipu Supabase-datasta).

**HTML-esimerkki** (nav-ikoni, ei laattaa):
```html
<span class="nav-icon" data-icon="home"></span>
```

**HTML-esimerkki** (Koonti-kortti, laatta):
```html
<span class="koonti-card-icon" data-icon="dumbbell" data-icon-bg="var(--accent-bg)" data-icon-color="var(--accent)"></span>
```

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Lataa sovellus, tarkista että kaikki 13 ikonikohtaa näyttävät SVG-ikonin emojin sijaan: alaNavi (2), sivupalkki (6, avaa Valikko), Koonti-kortit (4), Koonti-hero-mittarit (5), Sali-sivun hero-mittarit (3).
2. Tarkista alaNavin aktiivinen-tila: ikonin väri vaihtuu valkoiseksi kun välilehti on aktiivinen (perii `currentColor`:n napin taustavärimuutoksen mukana).
3. Tarkista ettei konsoli näytä virheitä (esim. tuntematon `data-icon`-nimi).
4. Tarkista ettei mikään sisältöemoji (tervehdys, aktiviteettityypit, juhlistus-toastit, PR-badge) ole vahingossa muuttunut.
