# SVG-ikonisetti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Korvaa pysyvän UI-kromin (alaNavi, sivupalkki, Koonti-kortit, hero-mittarit) 13 emoji-ikonikohtaa itse piirretyllä, yhtenäisellä inline-SVG-ikonisetillä.

**Architecture:** Yksi `ICONS`-objekti (raaka SVG-path-data) ja `svgIcon()`/`renderIcons()`-apufunktiot. Suurin osa ikonikohdista on staattista HTML:ää, merkitään `data-icon`-attribuutilla ja renderöidään kerran sovelluksen käynnistyessä. Yksi kohta (Sali-sivun hero-mittarit) on JS-templatoitu ja regeneroituu päivä/viikko-navigoinnissa — sama mekanismi, mutta `renderIcons()` kutsutaan uudelleen sen renderöinnin jälkeen.

**Tech Stack:** Vanilla JS, inline SVG, ei ulkoisia tiedostoja tai kirjastoja.

---

### Task 1: ICONS-data ja renderöintifunktiot

**Files:**
- Modify: `index.html` (uusi JS-lohko: `ICONS`, `svgIcon()`, `renderIcons()`)
- Modify: `index.html` (käynnistys-IIFE, uusi kutsu)

**Konteksti ennen muutosta** — käynnistys-IIFE:

```js
(async () => {
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
  if (programLoaded) {
    migrateLD_v2();
    migrateLD_v3();
  } else {
    console.error('Ohjelmadataa ei saatu ladattua — ohitetaan kertaluontoiset migraatiot tällä kertaa.');
  }
  loadKoonti();
})();
```

- [ ] **Step 1: Lisää ICONS-data ja apufunktiot**

Etsi `<script>`-lohkon alkupuolelta jokin sopiva paikka apufunktioille — helpoin on lisätä ne heti ensimmäisen `<script>`-tagin jälkeen, ennen `CONFIG`-kommenttilohkoa (`grep -n "CONFIG" index.html` löytää sen). Lisää:

```js
/* ═══════════════════════════════════════════════════════════════
   IKONIT (SVG)
═══════════════════════════════════════════════════════════════ */
const ICONS = {
  home:      '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>',
  utensils:  '<path d="M18 8V6a2 2 0 00-2-2H8a2 2 0 00-2 2v2"/><path d="M20 8H4a1 1 0 00-1 1v2a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1z"/><path d="M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7"/>',
  dumbbell:  '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/><rect x="1" y="9" width="4" height="6" rx="1"/><rect x="19" y="9" width="4" height="6" rx="1"/><rect x="5" y="7" width="3" height="10" rx="1"/><rect x="16" y="7" width="3" height="10" rx="1"/>',
  flame:     '<path d="M12 2c-2 4-6 5-6 10a6 6 0 0012 0c0-2-1-3-2-4 0 2-1 3-2 2 1-3-1-5-2-8z"/>',
  running:   '<circle cx="14" cy="4" r="2"/><path d="M10 22l2-6 3-2-1-5-4 1-2 4M13 8l3 3 4-1M8 13l-3 2 1 5"/>',
  scale:     '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v4l3 2"/>',
  moon:      '<path d="M21 12.5A8.5 8.5 0 1111.5 3 7 7 0 0021 12.5z"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  target:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  watch:     '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M9 3h6l-1 3H10z"/>',
  upload:    '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
};

function svgIcon(name, color, size) {
  const path = ICONS[name];
  if (!path) return '';
  const c = color || 'currentColor';
  const s = size || 20;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function renderIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    if (!ICONS[name]) return;
    const color = el.dataset.iconColor || 'currentColor';
    el.innerHTML = svgIcon(name, color);
    if (el.dataset.iconBg) {
      el.style.cssText += `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:${el.dataset.iconBg};`;
    }
  });
}
```

- [ ] **Step 2: Kutsu `renderIcons()` sovelluksen käynnistyessä**

Korvaa käynnistys-IIFE:

```js
(async () => {
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
  if (programLoaded) {
    migrateLD_v2();
    migrateLD_v3();
  } else {
    console.error('Ohjelmadataa ei saatu ladattua — ohitetaan kertaluontoiset migraatiot tällä kertaa.');
  }
  loadKoonti();
})();
```

tällä (lisää `renderIcons();` ensimmäiseksi riviksi):

```js
(async () => {
  renderIcons();
  ['body-date','act-date','sleep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localIso(new Date());
  });

  const programLoaded = await loadProgram();
  if (programLoaded) {
    migrateLD_v2();
    migrateLD_v3();
  } else {
    console.error('Ohjelmadataa ei saatu ladattua — ohitetaan kertaluontoiset migraatiot tällä kertaa.');
  }
  loadKoonti();
})();
```

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: lisää SVG-ikonidata ja renderIcons()-apufunktio"
```

---

### Task 2: AlaNavi ja sivupalkki (ei taustalaattaa)

**Files:**
- Modify: `index.html` (alaNavi, 2 ikonia)
- Modify: `index.html` (sivupalkki, 6 ikonia)

**Konteksti ennen muutosta** — alaNavi:

```html
<nav>
  <button id="nav-koonti" class="active" onclick="showPage('koonti',this)">
    <span class="nav-icon">🏠</span>
    <span>Koonti</span>
  </button>
  <button id="nav-ruoka" onclick="showPage('ruoka',this)">
    <span class="nav-icon">🍽️</span>
    <span>Ruoka</span>
  </button>
  <button id="hamburger-btn" onclick="toggleSidebar()">
    <span class="nav-icon">≡</span>
    <span>Valikko</span>
  </button>
</nav>
```

- [ ] **Step 1: Päivitä alaNavi**

Korvaa yllä oleva lohko (vain kaksi ensimmäistä `<span class="nav-icon">`-riviä muuttuvat, hampurilaisikoni `≡` pysyy ennallaan koska se on jo pelkkä tekstimerkki, ei emoji):

```html
<nav>
  <button id="nav-koonti" class="active" onclick="showPage('koonti',this)">
    <span class="nav-icon" data-icon="home"></span>
    <span>Koonti</span>
  </button>
  <button id="nav-ruoka" onclick="showPage('ruoka',this)">
    <span class="nav-icon" data-icon="utensils"></span>
    <span>Ruoka</span>
  </button>
  <button id="hamburger-btn" onclick="toggleSidebar()">
    <span class="nav-icon">≡</span>
    <span>Valikko</span>
  </button>
</nav>
```

- [ ] **Step 2: Päivitä sivupalkki**

Etsi tämä exakti lohko (sivupalkin sisältö):

```html
  <button onclick="showPage('ohjelma',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">📋</span> Ohjelma
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Asetukset</div>
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🎯</span> Ravintotavoitteet
  </button>
  <button onclick="openActivityGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">🏃</span> Kestävyystavoitteet
  </button>
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">⌚</span> Kalorikerroin
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Vie data</div>
  <button id="export-activities-btn" onclick="exportActivitiesCSV();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">📤</span> Vie aktiviteetit (CSV)
  </button>
  <button id="export-sets-btn" onclick="exportWorkoutSetsCSV();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="font-size:18px;">📤</span> Vie salilokit (CSV)
  </button>
```

Korvaa (jokaisen `<span style="font-size:18px;">EMOJI</span>` tilalle `<span data-icon="nimi" style="display:inline-flex"></span>` — `display:inline-flex` pitää ikonin linjassa tekstin kanssa napin sisällä):

```html
  <button onclick="showPage('ohjelma',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="clipboard" style="display:inline-flex"></span> Ohjelma
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Asetukset</div>
  <button onclick="openGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="target" style="display:inline-flex"></span> Ravintotavoitteet
  </button>
  <button onclick="openActivityGoalsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="running" style="display:inline-flex"></span> Kestävyystavoitteet
  </button>
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Vie data</div>
  <button id="export-activities-btn" onclick="exportActivitiesCSV();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="upload" style="display:inline-flex"></span> Vie aktiviteetit (CSV)
  </button>
  <button id="export-sets-btn" onclick="exportWorkoutSetsCSV();closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="upload" style="display:inline-flex"></span> Vie salilokit (CSV)
  </button>
```

- [ ] **Step 3: Testaa manuaalisesti**

Käynnistä paikallinen palvelin (`python3 -m http.server 8080`), lataa sivu. Tarkista alaNavin kaksi ikonia näkyvät SVG:nä, vaihda aktiivista välilehteä ja tarkista väri muuttuu valkoiseksi. Avaa Valikko, tarkista kaikki 6 ikonia näkyvät SVG:nä ympäröivän tekstin värisinä.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: SVG-ikonit alaNaviin ja sivupalkkiin"
```

---

### Task 3: Koonti-kortit ja Koonnin hero-mittarit (taustalaatta)

**Files:**
- Modify: `index.html` (Koonti-kortit, 4 ikonia)
- Modify: `index.html` (Koonnin hero-mittarit, 5 ikonia)

**Konteksti ennen muutosta** — hero-mittarit:

```html
  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon">🔥</div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏋️</div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🏃</div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>

  <div class="hero-metrics" style="grid-template-columns:1fr 1fr">
    <div class="hero-metric">
      <div class="hero-metric-icon">📅</div>
      <div class="hero-metric-val" id="koonti-ms-week">—</div>
      <div class="hero-metric-label">viikon aktiivisuus</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon">🗓️</div>
      <div class="hero-metric-val" id="koonti-ms-month">—</div>
      <div class="hero-metric-label">kuukausi</div>
    </div>
  </div>
```

- [ ] **Step 1: Päivitä Koonnin hero-mittarit**

Korvaa yllä oleva lohko:

```html
  <div class="hero-metrics">
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="flame" data-icon-color="var(--amber)" data-icon-bg="var(--amber-bg)"></div>
      <div class="hero-metric-val" id="koonti-ms-streak">—</div>
      <div class="hero-metric-label">streak</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="dumbbell" data-icon-color="var(--accent)" data-icon-bg="var(--accent-bg)"></div>
      <div class="hero-metric-val" id="koonti-ws-gym">—</div>
      <div class="hero-metric-label">viikon sali</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="running" data-icon-color="var(--red)" data-icon-bg="var(--red-bg)"></div>
      <div class="hero-metric-val" id="koonti-ws-act">—</div>
      <div class="hero-metric-label">viikon aktiiv.</div>
    </div>
  </div>

  <div class="hero-metrics" style="grid-template-columns:1fr 1fr">
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="calendar" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-ms-week">—</div>
      <div class="hero-metric-label">viikon aktiivisuus</div>
    </div>
    <div class="hero-metric">
      <div class="hero-metric-icon" data-icon="calendar" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-ms-month">—</div>
      <div class="hero-metric-label">kuukausi</div>
    </div>
  </div>
```

- [ ] **Step 2: Päivitä Koonti-kortit**

Etsi:

```html
  <div class="koonti-section-label">Tänään</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-sali" onclick="showPage('sali', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">🏋️</span>
      <div class="koonti-card-label">Sali</div>
      <div class="koonti-card-sub skel-sub" id="kc-sali-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-aerobia" onclick="showPage('aerobia', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">🏃</span>
      <div class="koonti-card-label">Aerobinen</div>
      <div class="koonti-card-sub skel-sub" id="kc-aerobia-sub">&nbsp;</div>
      <div class="koonti-card-goal" id="kc-aerobia-goal" style="display:none"></div>
    </div>
  </div>

  <div class="koonti-section-label">Mittarit</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-keho" onclick="showPage('keho', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">⚖️</span>
      <div class="koonti-card-label">Keho</div>
      <div class="koonti-card-sub skel-sub" id="kc-keho-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-uni" onclick="showPage('uni', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon">😴</span>
      <div class="koonti-card-label">Uni</div>
      <div class="koonti-card-sub skel-sub" id="kc-uni-sub">&nbsp;</div>
    </div>
  </div>
```

Korvaa:

```html
  <div class="koonti-section-label">Tänään</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-sali" onclick="showPage('sali', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="dumbbell" data-icon-color="var(--accent)" data-icon-bg="var(--accent-bg)"></span>
      <div class="koonti-card-label">Sali</div>
      <div class="koonti-card-sub skel-sub" id="kc-sali-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-aerobia" onclick="showPage('aerobia', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="running" data-icon-color="var(--red)" data-icon-bg="var(--red-bg)"></span>
      <div class="koonti-card-label">Aerobinen</div>
      <div class="koonti-card-sub skel-sub" id="kc-aerobia-sub">&nbsp;</div>
      <div class="koonti-card-goal" id="kc-aerobia-goal" style="display:none"></div>
    </div>
  </div>

  <div class="koonti-section-label">Mittarit</div>
  <div class="koonti-cards">
    <div class="koonti-card" id="kc-keho" onclick="showPage('keho', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="scale" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Keho</div>
      <div class="koonti-card-sub skel-sub" id="kc-keho-sub">&nbsp;</div>
    </div>
    <div class="koonti-card" id="kc-uni" onclick="showPage('uni', document.getElementById('nav-koonti'))">
      <span class="koonti-card-icon" data-icon="moon" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
      <div class="koonti-card-label">Uni</div>
      <div class="koonti-card-sub skel-sub" id="kc-uni-sub">&nbsp;</div>
    </div>
  </div>
```

- [ ] **Step 3: Testaa manuaalisesti**

Lataa Koonti-sivu. Tarkista kaikki 4 korttia ja 5 hero-mittaria näyttävät pyöreän taustalaatan sisällä olevan SVG-ikonin oikealla värillä (sali=sininen, aerobinen=punainen, keho/uni=vihreä, streak=meripihka, viikko/kuukausi=harmaa).

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: SVG-ikonit Koonti-korteille ja hero-mittareille"
```

---

### Task 4: Sali-sivun hero-mittarit (JS-templatoitu, regeneroituu)

**Files:**
- Modify: `index.html` (`renderTreeni()`-funktio, hero-mittarien template + `renderIcons()`-uudelleenkutsu)

**Tärkeä ero edellisiin tehtäviin:** tämä lohko EI ole staattista HTML:ää — se on osa `renderTreeni()`-funktion `innerHTML =`-templaattia ja regeneroituu joka kerta kun käyttäjä vaihtaa päivää tai viikkoa Sali-sivulla. Siksi pelkkä `data-icon`-attribuuttien lisääminen templaattiin ei riitä — `renderIcons()` pitää kutsua uudelleen JOKAISEN tämän lohkon renderöinnin jälkeen, muuten uudet `data-icon`-elementit jäävät tyhjiksi.

**Konteksti ennen muutosta:**

```js
    <div class="hero-metrics">
      <div class="hero-metric">
        <div class="hero-metric-icon">🔥</div>
        <div class="hero-metric-val" style="color:#ff9f0a" id="ms-streak">—</div>
        <div class="hero-metric-label">streak</div>
      </div>
      <div class="hero-metric">
        <div class="hero-metric-icon">💪</div>
        <div class="hero-metric-val" style="color:#0a84ff" id="ws-gym">—</div>
        <div class="hero-metric-label">viikon sali</div>
      </div>
      <div class="hero-metric">
        <div class="hero-metric-icon">😴</div>
        <div class="hero-metric-val" style="color:#30d158" id="ws-sleep">—</div>
        <div class="hero-metric-label">uni ka</div>
      </div>
    </div>`;

  // Päivätabit
  const tabs = document.getElementById('day-tabs');
```

- [ ] **Step 1: Päivitä template ja lisää `renderIcons()`-uudelleenkutsu**

Korvaa yllä oleva lohko:

```js
    <div class="hero-metrics">
      <div class="hero-metric">
        <div class="hero-metric-icon" data-icon="flame" data-icon-color="var(--amber)" data-icon-bg="var(--amber-bg)"></div>
        <div class="hero-metric-val" style="color:#ff9f0a" id="ms-streak">—</div>
        <div class="hero-metric-label">streak</div>
      </div>
      <div class="hero-metric">
        <div class="hero-metric-icon" data-icon="dumbbell" data-icon-color="var(--accent)" data-icon-bg="var(--accent-bg)"></div>
        <div class="hero-metric-val" style="color:#0a84ff" id="ws-gym">—</div>
        <div class="hero-metric-label">viikon sali</div>
      </div>
      <div class="hero-metric">
        <div class="hero-metric-icon" data-icon="moon" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></div>
        <div class="hero-metric-val" style="color:#30d158" id="ws-sleep">—</div>
        <div class="hero-metric-label">uni ka</div>
      </div>
    </div>`;
  renderIcons();

  // Päivätabit
  const tabs = document.getElementById('day-tabs');
```

Huom: `renderIcons()` skannaa KAIKKI `[data-icon]`-elementit koko sivulta joka kerta kun sitä kutsutaan, myös ne jotka on jo renderöity aiemmin (esim. alaNavi, Koonti-kortit) — tämä on harmitonta koska `svgIcon()`-kutsu on idempotentti (sama tulos joka kerta), vain hieman ylimääräistä työtä. Ei tarvita erillistä "vain tämä lohko" -rajausta.

- [ ] **Step 2: Testaa manuaalisesti**

Siirry Sali-sivulle, tarkista kolme hero-mittaria (streak, viikon sali, uni ka) näyttävät SVG-ikonit taustalaatassa. Vaihda päivää päivätabista tai viikkoa nuolinapeista — tarkista ikonit näkyvät edelleen (eivät jää tyhjiksi) uudelleenrenderöinnin jälkeen.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: SVG-ikonit Sali-sivun hero-mittareille"
```

---

### Task 5: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko sovelluksen läpikäynti selaimessa**

Käy läpi kaikki 13 ikonikohtaa: alaNavi (2), sivupalkki (6), Koonti-kortit (4), Koonnin hero-mittarit (5), Sali-sivun hero-mittarit (3, testaa myös päivä/viikko-vaihto). Tarkista ettei konsoli näytä virheitä. Tarkista ettei mikään sisältöemoji (tervehdys "Hei! 👋", aktiviteettityyppien valintavaihtoehdot, juhlistus-toastit, PR-badge, oivallukset) ole vahingossa muuttunut — niiden pitää näkyä edelleen alkuperäisinä emojeina.

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.12.0` arvoon `v1.13.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.13.0: SVG-ikonisetti"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Kaikki speksin 13 ikonikohtaa (alaNavi 2, sivupalkki 6, Koonti-kortit 4, Koonnin hero-mittarit 5, Sali-sivun hero-mittarit 3 — huom yhteensä 20 mainintaa koska osa ikoneista toistuu useassa kohdassa, esim. dumbbell/flame/moon esiintyvät sekä Koonnissa että Sali-sivulla) on katettu Task 2–4:ssä.
- **Arkkitehtoninen korjaus brainstormauksen jälkeen:** design-speksi olettaa virheellisesti että KAIKKI 13 kohtaa ovat staattista HTML:ää — Sali-sivun hero-mittarit ovat itse asiassa osa `renderTreeni()`:n JS-templaattia ja regeneroituvat päivä/viikko-navigoinnissa. Task 4 korjaa tämän lisäämällä `renderIcons()`-uudelleenkutsun kyseisen lohkon jälkeen — muuten ikonit jäisivät tyhjiksi navigoinnin jälkeen.
- **Tyyppijohdonmukaisuus:** `data-icon`/`data-icon-color`/`data-icon-bg`-attribuuttinimet ja `ICONS`-avainten nimet (`home`, `utensils`, `dumbbell`, `flame`, `running`, `scale`, `moon`, `calendar`, `clipboard`, `target`, `watch`, `upload`) ovat identtiset kaikissa neljässä tehtävässä.
- **Ei placeholdereita:** kaikki koodilohkot ovat täydellisiä, ei TBD/TODO-merkintöjä.
