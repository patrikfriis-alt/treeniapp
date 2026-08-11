# Apple-tyylinen visuaalinen päivitys (Koonti) — Design

**Goal:** Tehdä Koonti-sivusta visuaalisesti enemmän natiivin iOS-sovelluksen näköinen, käyttäen sovelluksen jo olemassa olevaa iOS-järjestelmävärimaailmaa pohjana. Puhtaasti visuaalinen päivitys — ei toiminnallisia muutoksia.

**Taustaa:** Sovelluksen väripaletti (`--bg:#000`, `--surface:#1c1c1e`, `--accent:#0a84ff` jne.) ja fonttipino (`-apple-system, SF Pro Display`) jäljittelevät jo iOS:n omaa tumman tilan järjestelmää. Puuttuvat elementit ovat lähinnä materiaalit (huurrelasi/blur), typografian mittakaava, kulmien pehmeys ja ikonien viiva-paksuus.

**Prosessi:** Kolme visuaalista vaihtoehtoa esitettiin (A: hienosäätö nykyistä korttirakennetta säilyttäen, B: natiivi Settings-tyylinen ryhmitelty lista, C: hybridi) — käyttäjä valitsi **A: Refined**. Erillisessä kierroksessa valittiin huurrelasi-yläpalkki kiinteän/läpinäkymättömän sijaan.

---

## Laajuus

**Sisältyy:**
- Koonti-sivun (`#page-koonti`) rakenteelliset ja typografiset muutokset
- Alanavigaation (`<nav>`, näkyy joka sivulla) visuaalinen materiaalimuutos huurrelasiksi — tämä on jaettua kromia, ei minkään muun sivun sisällön muutos
- Jaetut design-tokenit (kulmapyöristys, ikonien viivanpaksuus) — nämä ovat globaaleja CSS-muuttujia/funktioita, joten niiden päivitys vaikuttaa visuaalisesti huomaamattomasti myös muihin sivuihin (ikonit/kulmat näyttävät hieman erilaisilta kaikkialla). Tämä on tarkoituksellista: erilliset token-setit vain Koontia varten loisivat visuaalisen epäjohdonmukaisuuden sivujen välillä, mikä näyttäisi bugilta eikä tarkoitukselliselta.

**Ei sisälly (tässä vaiheessa):**
- Sali/Aerobia/Keho/Uni/Ruoka/Valmentaja-sivujen rakenteellinen uudelleensuunnittelu (korttien/listojen layout pysyy ennallaan)
- Modaalien (createModalOverlay-pohjaiset) visuaalinen päivitys
- Korttirakenteen muuttaminen ryhmitellyiksi listoiksi (vaihtoehto B — ei valittu)
- Todelliset "squircle"-kulmat (jatkuva kulmakaarevuus) — CSS:n `border-radius` ei tue tätä natiivisti ilman `clip-path`-superellipsiä, joka on hauras eri näyttökoossa. Pyöristystä vain kasvatetaan hieman pehmeämmän tunnun saamiseksi.

---

## 1. Jaetut design-tokenit (globaali, matala riski)

Muutetaan `:root`-muuttujia ja `svgIcon()`-funktiota `index.html`:ssä:

- `--radius-md`: `14px` → `16px`
- `--radius-lg`: `20px` → `22px`
- (`--radius-sm: 10px` pysyy ennallaan — pienissä elementeissä kuten napeissa nykyinen pyöristys toimii jo hyvin)
- `svgIcon()`-funktion `stroke-width`: `2` → `1.5` (ohuempi viiva, lähempänä SF Symbols -tyyliä). Tarkistettava manuaalisesti selaimessa että ikonit pysyvät luettavina pienimmässä käyttökoossa (20×20, `.kc-weekly-row-icon`).

## 2. Alanavigaatio → huurrelasi (globaali, matala riski)

`<nav>`-elementin tausta muutetaan läpinäkymättömästä huurrelasiksi:
- `background: rgba(20,20,22,0.78)`
- `backdrop-filter: blur(20px) saturate(1.6)`
- `-webkit-backdrop-filter: blur(20px) saturate(1.6)` (Safari-yhteensopivuus)
- `border-top: 0.5px solid rgba(255,255,255,0.08)` nykyisen `border-top`-arvon tilalle

Sisältö vierii nyt visuaalisesti navigaation alle scrollattaessa — tämä on iOS:n tabBar-käytös. Ei rakenteellisia muutoksia navigaation logiikkaan (`showPage()` pysyy koskemattomana).

## 3. Koonti: pienenevä otsikko (uusi, Koonti-spesifinen)

Uusi kiinteä/tahmea (sticky) otsikkopalkki lisätään `#page-koonti`:n alkuun:

- Uusi elementti, esim. `<div id="koonti-navbar" class="koonti-navbar">Koonti</div>` — `position: fixed`, `top: 0`, täysleveä, `z-index` navigaation yläpuolella mutta sisällön alla scrollatessa
- Alkutilassa läpinäkyvä (`opacity: 0`, `pointer-events: none`)
- JS-scroll-kuuntelija (`window.addEventListener('scroll', ...)`, vain kun `#page-koonti` on aktiivinen — sovellus scrollaa `body`:ä suoraan, ei sisäkkäistä scroll-konttia, joten tämä on suoraviivaista) hälventää palkin näkyviin (`opacity` siirtymällä 0→1) kun `window.scrollY` ylittää tervehdyslohkon korkeuden (arvio: ~70px, tarkennetaan visuaalisesti)
- Palkin tyyli: sama huurrelasi kuin alanavigaatiossa (`rgba(20,20,22,0.72)`, `backdrop-filter: blur(20px) saturate(1.6)`, `border-bottom: 0.5px solid rgba(255,255,255,0.08)`), otsikkoteksti `font-size:17px; font-weight:600` (vastaa iOS:n pienennettyä nav-otsikkoa)
- Olemassa oleva `.koonti-greeting` ("Hei! 👋") toimii suurena otsikkona: `font-size` `22px` → `28px`, `letter-spacing: -0.02em` lisätään (iOS Large Title -tuntu)

## 4. Koonti: väljyys ja mittasuhteet

Pieniä paddaus-lisäyksiä ilmavuuden lisäämiseksi (ei rakenteellisia muutoksia, ei uusia elementtejä):
- `.hero-metric` padding: `12px` → `14px`
- `.koonti-card` padding: `16px` → `18px`

Olemassa olevat edistymispalkit (askeleet/aerobinen/viikon aktiivisuus/viikon kalorit — lisätty edellisessä istunnossa) pysyvät toiminnallisesti ennallaan, vain kulmapyöristys perii uuden `--radius`-arvon automaattisesti koska ne käyttävät `var(--radius-*)`-tokeneita epäsuorasti samankaltaisen `border-radius`-arvon kautta (tarkistettava plänissä että `.koonti-progress-track`/`.koonti-progress-fill`-arvot skaalautuvat siististi, ne on tällä hetkellä koodattu kiinteinä pikseleinä `3px`).

---

## Riskit / avoimet kysymykset planille

- `backdrop-filter` on iOS Safarissa tuettu ja halpa, mutta kannattaa silti testata oikealla laitteella (ei vain työpöytä-Chromen emuloinnilla) ennen julkaisua, koska sovellus on juuri sinun puhelimellasi käytetty PWA.
- Scroll-kuuntelijan tarkka kynnysarvo (milloin otsikko häivytetään näkyviin) päätetään lopullisesti visuaalisella kokeilulla selaimessa, ei etukäteen kiveen hakattuna lukuna.
- `ex-block-prog-fill`/`.koonti-progress-fill` ja muut olemassa olevat pyöristetyt elementit: tarkistettava ettei `--radius-md/lg`-muutos riko mitään olemassa olevaa visuaalista sommittelua (esim. liian pyöreä kulma ahtaassa kortissa).
