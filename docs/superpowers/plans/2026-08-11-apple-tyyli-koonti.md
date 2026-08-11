# Apple-tyylinen visuaalinen päivitys (Koonti) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tehdä Koonti-sivusta visuaalisesti enemmän natiivin iOS-sovelluksen näköinen — huurrelasi-materiaalit, iOS:n typografia-mittakaava, pehmeämmät kulmat, ohuemmat ikonit. Puhtaasti visuaalinen päivitys, ei toiminnallisia muutoksia.

**Architecture:** Kaikki muutokset yhteen tiedostoon (`index.html`): CSS custom property -päivitykset, yksi uusi HTML-elementti (kelluva otsikkopalkki), yksi uusi globaali scroll-kuuntelija, ja pieniä olemassa olevien sääntöjen arvomuutoksia. Ei uusia tiedostoja, ei backend-muutoksia.

**Tech Stack:** Vanilla CSS + JS, sama kuin muu sovellus.

---

### Task 1: Jaetut design-tokenit — kulmapyöristys ja ikonien viivanpaksuus

**Files:**
- Modify: `index.html` (`:root`-lohko, `svgIcon()`-funktio, `.hero-metric`-sääntö)

- [ ] **Step 1: Kasvata `--radius-md`- ja `--radius-lg`-arvoja**

Nykyinen koodi (`:root`-lohkossa):
```css
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
```
Muuta:
```css
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 22px;
```

- [ ] **Step 2: Ohenna ikonien viivanpaksuus**

Nykyinen koodi (`svgIcon`-funktio):
```js
function svgIcon(name, color, size) {
  const path = ICONS[name];
  if (!path) return '';
  const c = color || 'currentColor';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
```
Muuta `stroke-width="2"` → `stroke-width="1.5"`:
```js
function svgIcon(name, color, size) {
  const path = ICONS[name];
  if (!path) return '';
  const c = color || 'currentColor';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
```

- [ ] **Step 3: Yhdenmukaista `.hero-metric`:n kulmapyöristys tokeniin**

`.hero-metric` käyttää tällä hetkellä kovakoodattua `14px`-arvoa oman `--radius-md`-muuttujan sijaan (`.koonti-card` sen sijaan käyttää jo `var(--radius-lg)`:tä oikein). Korjaa tämä epäjohdonmukaisuus.

Nykyinen koodi:
```css
.hero-metric { background:var(--surface); border-radius:14px; padding:12px; }
```
Muuta:
```css
.hero-metric { background:var(--surface); border-radius:var(--radius-md); padding:12px; }
```

- [ ] **Step 4: Selainkatselmus — ikonien luettavuus pienimmässä koossa**

Avaa sovellus paikallisesti (`python3 -m http.server`), tarkista Koonti-sivun `.kc-weekly-row-icon`-ikonit (20×20px, pienin käytössä oleva koko) — varmista että 1.5px-viiva pysyy selkeästi luettavana eikä näytä liian hennolta. Jos ikonit näyttävät liian ohuilta 20px-koossa, harkitse `1.75`:tä `1.5`:n sijaan tässä vaiheessa ennen commitia.

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: pehmeämmät kulmat ja ohuemmat ikonit (jaetut design-tokenit)"
```

---

### Task 2: Alanavigaatio — huurrelasin näkyvyyden lisäys

**Files:**
- Modify: `index.html` (`nav`-sääntö)

Alanavigaatiolla on jo `backdrop-filter: blur(20px)`, mutta taustan alfa-arvo (`0.95`) on niin korkea että blur-efekti ei juuri näy — se näyttää lähes täysin läpinäkymättömältä. Lasketaan alfaa jotta efekti tulee näkyviin, iOS:n tabBar-tyylin mukaisesti.

- [ ] **Step 1: Laske `nav`-taustan peittävyyttä**

Nykyinen koodi:
```css
nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(18,18,18,0.95);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--border);
  display: flex;
  padding: 6px 8px 10px;
  gap: 4px;
}
```
Muuta `background`- ja `border-top`-rivit:
```css
nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(20,20,22,0.78);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid rgba(255,255,255,0.08);
  display: flex;
  padding: 6px 8px 10px;
  gap: 4px;
}
```

- [ ] **Step 2: Selainkatselmus**

Vieritä mitä tahansa sivua jolla on tarpeeksi sisältöä scrollattavaksi (esim. Koonti tai Sali-lokit) ja tarkista että sisältö näkyy himmeästi/sumeana navigaation läpi vieritettäessä, ja että napit pysyvät luettavina omaa taustaansa vasten.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "fix: alanavigaation huurrelasi-efekti näkyviin (alfa-arvo liian korkea aiemmin)"
```

---

### Task 3: Koonti — pienenevä otsikko (huurrelasi-palkki + suuri tervehdys)

**Files:**
- Modify: `index.html` (uusi CSS-sääntö, uusi HTML-elementti, uusi JS-scroll-kuuntelija, `.koonti-greeting`-säännön muutos)

- [ ] **Step 1: Lisää CSS uudelle `koonti-navbar`-palkille**

Lisää heti `.koonti-date`-säännön jälkeen (CSS-lohko, jossa on `.koonti-greeting`/`.koonti-date`):

Nykyinen koodi:
```css
.koonti-greeting { font-size: 22px; font-weight: 700; margin: 4px 12px 2px; }
.koonti-date      { font-size: 13px; color: var(--text2); margin: 0 12px 14px; }
```
Muuta:
```css
.koonti-greeting { font-size: 28px; font-weight: 700; margin: 4px 12px 2px; letter-spacing: -0.02em; }
.koonti-date      { font-size: 13px; color: var(--text2); margin: 0 12px 14px; }
.koonti-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90;
  padding: 14px 16px 10px;
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  background: rgba(20,20,22,0.72);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border-bottom: 0.5px solid rgba(255,255,255,0.08);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
```

Huom: `z-index: 90` on tarkoituksella pienempi kuin `nav`:n `z-index: 100`, palkki ei koskaan peitä alanavigaatiota (ne eivät muutenkaan voi olla päällekkäin, koska toinen on `top:0` ja toinen `bottom:0`, mutta selkeyden vuoksi arvo on silti pienempi).

- [ ] **Step 2: Lisää `koonti-navbar`-elementti HTML:ään**

Nykyinen koodi (`#page-koonti`:n alku):
```html
<div id="page-koonti" class="page active">
  <div class="koonti-greeting">Hei! 👋</div>
  <div class="koonti-date" id="koonti-date"></div>
```
Muuta:
```html
<div id="page-koonti" class="page active">
  <div class="koonti-navbar" id="koonti-navbar">Koonti</div>
  <div class="koonti-greeting">Hei! 👋</div>
  <div class="koonti-date" id="koonti-date"></div>
```

- [ ] **Step 3: Lisää scroll-kuuntelija joka häivyttää palkin näkyviin**

Lisää uusi rivi heti `showPage`-funktion jälkeen (funktion sulkevan `}`-merkin jälkeen, ennen `let coachActiveConversationId = null;`-riviä):

Nykyinen koodi:
```js
  if (name === 'valmentaja') renderCoachPage();
}

let coachActiveConversationId = null;
```
Muuta:
```js
  if (name === 'valmentaja') renderCoachPage();
}

window.addEventListener('scroll', () => {
  const navbar = document.getElementById('koonti-navbar');
  const koontiPage = document.getElementById('page-koonti');
  if (!navbar || !koontiPage || !koontiPage.classList.contains('active')) return;
  navbar.style.opacity = window.scrollY > 70 ? '1' : '0';
});

let coachActiveConversationId = null;
```

- [ ] **Step 4: Selainkatselmus**

Avaa Koonti-sivu paikallisesti, vieritä alaspäin — tarkista että huurrelasipalkki "Koonti"-tekstillä häivytetysti ilmestyy kun tervehdys vierii pois näkyvistä (~70px vieritys), ja katoaa taas kun vieritetään takaisin ylös. Vaihda toiselle sivulle (esim. Sali) ja takaisin Koontiin — varmista ettei scroll-kuuntelija aiheuta virheitä konsoliin muilla sivuilla (kuuntelija palaa varhain jos Koonti ei ole aktiivinen).

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: Koonnin pienenevä otsikko (huurrelasi-palkki tervehdyksen tilalle vieritettäessä)"
```

---

### Task 4: Koonti — väljyys hero-metrics- ja koonti-card-elementeissä

**Files:**
- Modify: `index.html` (`.hero-metric`, `.koonti-card`)

- [ ] **Step 1: Kasvata `.hero-metric`-paddingia**

Nykyinen koodi (Task 1 Step 3:n jälkeen):
```css
.hero-metric { background:var(--surface); border-radius:var(--radius-md); padding:12px; }
```
Muuta:
```css
.hero-metric { background:var(--surface); border-radius:var(--radius-md); padding:14px; }
```

- [ ] **Step 2: Kasvata `.koonti-card`-paddingia**

Nykyinen koodi:
```css
.koonti-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: transform var(--t);
  position: relative;
}
```
Muuta `padding`-rivi:
```css
.koonti-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 18px;
  cursor: pointer;
  transition: transform var(--t);
  position: relative;
}
```

- [ ] **Step 3: Selainkatselmus**

Tarkista Koonti-sivu kokonaisuudessaan — hero-metrics-rivit, Tänään/Mittarit-korttiruudukko, Tällä viikolla -kortti. Varmista ettei mikään teksti/sisältö tunnu ahtaalta tai leikkaannu uuden paddingin myötä, erityisesti kapeimmilla korteilla (esim. Askeleet-kortti jossa on eniten tekstiä + palkki).

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: lisää väljyyttä Koonnin hero-metrics- ja korttielementteihin"
```

---

### Task 5: Kokonaisvaltainen selainkatselmus ja versiopäivitys

**Files:**
- Modify: `index.html` (versio-chip)

- [ ] **Step 1: Staattinen tarkistus**

Pura inline `<script>`-sisältö ja aja `node --check` varmistaaksesi ettei syntaksivirheitä ole tullut minkään tehtävän aikana.

- [ ] **Step 2: Kokonaisvaltainen selainkatselmus**

Käynnistä paikallinen palvelin, käy läpi kaikki sivut (Koonti, Sali, Aerobia, Keho, Uni, Ruoka, Valmentaja, Ohjelma) ja varmista:
- Ei mitään rakenteellista rikkoutumista millään sivulla (vain Koontiin piti tulla rakenteellisia muutoksia, muiden sivujen tulisi näyttää identtisiltä paitsi hieman pehmeämmät kulmat ja ohuemmat ikonit)
- Koonnin pienenevä otsikko toimii oikein edestakaisin vieritettäessä
- Alanavigaation huurrelasi näkyy kaikilla sivuilla
- Ei virheitä selaimen konsolissa millään sivulla
- Testaa myös oikealla iPhonella jos mahdollista (backdrop-filter-suorituskyky ja visuaalinen vaikutelma varmuuden vuoksi, ks. designin riskit-osio)

- [ ] **Step 3: Versionumeron nosto**

Etsi nykyinen versio-chip (`grep -n 'class="version-chip"' index.html`) ja nosta se seuraavaan minor-versioon (esim. jos nykyinen on `v1.35.0`, uusi on `v1.36.0`).

- [ ] **Step 4: Committaa, yhdistä ja julkaise**

```bash
git add index.html
git commit -m "v1.36.0: Apple-tyylinen visuaalinen päivitys Koontiin"
```

Yhdistä `main`-haaraan paikallisesti, työnnä GitHubiin, varmista GitHub Pages -julkaisu pollaamalla `curl`illa kunnes uusi versionumero näkyy livenä (sama kaava kuin aiemmissa tämän session julkaisuissa).
