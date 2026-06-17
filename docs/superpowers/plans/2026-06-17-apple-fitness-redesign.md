# Apple Fitness+ UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uudistaa Treeniapp:n visuaalinen ilme Apple Fitness+ -tyyliseksi — gradient hero-kortti, kompakti sarjataulukko, pill-navigointipalkki — muuttamatta yhtään toiminnallisuutta.

**Architecture:** Kaikki muutokset ovat yhdessä tiedostossa (`index.html`). CSS-muutokset tehdään olemassa olevaan `<style>`-blokkiin. Staattiset HTML-divit (greeting-header, week-summary, motivation-summary, prog-wrap) korvataan yhdellä `#hero-section`-diviksi, jonka `renderTreeni()` täyttää. Sarjarivit muutetaan flexbox-layoutista CSS grid -taulukoksi — samat elementti-ID:t säilyvät joten `saveSet()`, `prefillExercise()` ja `syncSet()` eivät tarvitse muutoksia.

**Tech Stack:** Vanilla HTML/CSS/JS, `-apple-system` / SF Pro -fontti (jo käytössä), ei uusia riippuvuuksia.

**Spec:** `docs/superpowers/specs/2026-06-17-apple-fitness-redesign.md`

---

## Tiedostot

- Muokataan: `index.html` (ainoa tiedosto)
  - `<style>`-blokki: rivit 12–411
  - HTML nav: rivit 415–428
  - HTML page-treeni: rivit 431–466
  - `renderTreeni()`: rivit 1095–1165
  - `renderSession()`: rivit 1179–1279
  - `updateSetBox()`: rivit 966–976

---

## Task 1: Pill-navigointipalkki (CSS-only)

**Tiedostot:** Muokataan `index.html` — `<style>`-blokki, `/* ─── Navigation ───*/`-osio

> Huom: sovelluksessa ei ole testiframeworkia. "Testi" = avaa `index.html` selaimessa ja tarkista visuaalisesti.

- [ ] **Step 1: Avaa sovellus selaimessa ennen muutosta**

  Avaa `index.html` (tai jos palvelin käynnissä, `http://localhost:56933`). Tarkista nykyinen nav-palkki: sininen viiva aktiivisen tabin yläpuolella.

- [ ] **Step 2: Korvaa nav CSS**

  Etsi `/* ─── Navigation ───*/`-osio (n. rivi 62). Korvaa koko nav-osio seuraavalla:

  ```css
  /* ─── Navigation ────────────────────────────────────────────── */
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
  nav button {
    flex: 1;
    padding: 7px 4px 6px;
    background: none;
    border: none;
    border-top: none;
    border-radius: 20px;
    color: var(--text2);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: .02em;
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--t);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .nav-icon {
    font-size: 22px;
    line-height: 1;
  }
  nav button.active { color: #fff; background: var(--accent); }
  nav button:not(.active):hover { color: var(--text); background: var(--surface2); }
  .version-chip {
    align-self: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-bg);
    border: 1px solid rgba(10,132,255,0.4);
    border-radius: 20px;
    padding: 3px 10px;
    margin: 0 8px;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.04em;
  }
  ```

- [ ] **Step 3: Tarkista selaimessa**

  Lataa sivu uudelleen. Tarkista:
  - Aktiivinen "Treeni"-nappi: sininen pyöristetty tausta, valkoinen teksti
  - Inaktiiviset napit: harmaat, ei taustaväriä
  - Nav-palkki: hieman tummempi, blur-efekti

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "ui: pill-navigointipalkki — aktiivinen tab sinisellä taustalla"
  ```

---

## Task 2: Hero card — CSS-luokat

**Tiedostot:** Muokataan `index.html` — `<style>`-blokki, lisätään uudet luokat ennen `</style>`-tagia

- [ ] **Step 1: Lisää hero-card CSS `</style>`-tagin eteen**

  ```css
  /* ─── Hero card (Fitness+ -tyyli) ──────────────────────────── */
  .hero-card {
    margin: 12px;
    border-radius: 20px;
    background: linear-gradient(145deg, #0d1b4b 0%, #0a2a6e 40%, #0a84ff 100%);
    padding: 20px;
    position: relative;
    overflow: hidden;
  }
  .hero-glow {
    position: absolute;
    top: -30px; right: -30px;
    width: 160px; height: 160px;
    background: radial-gradient(circle, rgba(10,132,255,0.4) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }
  .hero-day   { font-size:10px; font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:.12em; margin-bottom:10px; }
  .hero-name  { font-size:30px; font-weight:800; color:#fff; letter-spacing:-0.03em; line-height:1.1; margin-bottom:4px; }
  .hero-focus { font-size:14px; color:rgba(255,255,255,0.6); margin-bottom:20px; }
  .hero-stats-row { display:flex; align-items:center; margin-bottom:20px; }
  .hero-stat { }
  .hero-stat-val   { font-size:22px; font-weight:700; color:#fff; line-height:1; }
  .hero-stat-label { font-size:10px; color:rgba(255,255,255,0.5); margin-top:2px; }
  .hero-stat-sep   { width:1px; background:rgba(255,255,255,0.15); height:32px; margin:0 20px; }
  .hero-cta {
    width:100%;
    background:rgba(255,255,255,0.15);
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
    border:1px solid rgba(255,255,255,0.2);
    border-radius:12px;
    color:#fff;
    font-size:15px;
    font-weight:600;
    padding:12px;
    cursor:pointer;
    letter-spacing:-0.01em;
    transition:all var(--t);
  }
  .hero-cta:hover { background:rgba(255,255,255,0.25); }
  .hero-cta.done  { background:rgba(48,209,88,0.2); border-color:rgba(48,209,88,0.4); color:#30d158; }

  /* ─── Hero metrics (streak/sali/uni alla) ───────────────────── */
  .hero-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin: 0 12px 10px;
  }
  .hero-metric { background:var(--surface); border-radius:14px; padding:12px; }
  .hero-metric-icon  { font-size:20px; margin-bottom:4px; }
  .hero-metric-val   { font-size:20px; font-weight:700; line-height:1; }
  .hero-metric-label { font-size:10px; color:var(--text3); margin-top:2px; }

  /* ─── Sessiotyypin valitsin (pill-tyyli) ────────────────────── */
  .sess-picker { display:flex; gap:5px; flex-wrap:wrap; }
  .sess-btn {
    font-size:11px; font-weight:500; padding:6px 10px; flex:1; min-width:64px;
    background:var(--surface2); border:none; border-radius:20px;
    color:var(--text2); cursor:pointer; white-space:nowrap; transition:all var(--t);
  }
  .sess-btn.active { background:var(--accent); color:#fff; font-weight:600; }
  .sess-btn:not(.active):hover { background:var(--surface3); color:var(--text); }
  ```

- [ ] **Step 2: Tarkista ettei sivurakenne rikkoutunut**

  Lataa sivu — kaiken pitäisi näyttää samalta kuin ennen (uudet luokat eivät vaikuta mihinkään vielä).

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: lisää hero-card ja hero-metrics CSS-luokat"
  ```

---

## Task 3: HTML — korvaa staattiset divit hero-sectionilla

**Tiedostot:** Muokataan `index.html` — `#page-treeni` HTML-rakenne (n. rivit 431–466)

- [ ] **Step 1: Korvaa page-treeni sisältö**

  Etsi `<div id="page-treeni" class="page active">` ja korvaa kaikki sen sisältö:

  ```html
  <!-- ── TREENI ─────────────────────────────────────────────────── -->
  <div id="page-treeni" class="page active">
    <div id="hero-section"></div>
    <div class="week-nav">
      <button class="week-btn" onclick="changeWeek(-1)">←</button>
      <span class="week-label" id="week-label"></span>
      <button class="week-btn" onclick="changeWeek(1)">→</button>
    </div>
    <div class="day-tabs" id="day-tabs"></div>
    <div id="session-content"></div>
  </div>
  ```

  Poistetut elementit: `#greeting-header`, `#week-summary`, `#motivation-summary`, `.prog-wrap`.

- [ ] **Step 2: Tarkista selaimessa**

  Sivun yläosa on tyhjä (`#hero-section` on tyhjä) — tämä on odotettua. Week-nav, day-tabs ja session-content ovat edelleen näkyvissä.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: korvaa treeni-sivun staattiset divit hero-sectionilla"
  ```

---

## Task 4: JS — renderTreeni() hero-kortti ja tilastoruudukko

**Tiedostot:** Muokataan `index.html` — `renderTreeni()` (n. rivit 1095–1165)

- [ ] **Step 1: Lisää null-guardit loadWeekSummary() ja loadMotivationSummary():iin**

  `loadWeekSummary()` ja `loadMotivationSummary()` päivittävät elementtejä (`#ws-act`, `#ms-month`, `#ms-week`) jotka poistuvat HTML:stä. Ilman null-guardeja ne heittäisivät TypeError:n. Lisää `?.`-optional chaining jokaiselle `getElementById`-kutsulle molemmissa funktioissa:

  ```javascript
  // loadWeekSummary():
  document.getElementById('ws-gym')?.textContent = gymDays.size;
  // ...
  document.getElementById('ws-act')?.textContent = actData ? actData.length : '—';
  // ...
  const sleepEl = document.getElementById('ws-sleep');
  if (sleepEl) sleepEl.textContent = withDur.length ? (avg / 60).toFixed(1) + 'h' : '—';

  // loadMotivationSummary():
  document.getElementById('ms-month')?.textContent = monthCount + ' krt';
  document.getElementById('ms-week')?.textContent  = weekPct + '%';
  document.getElementById('ms-streak')?.textContent = streak + ' pv';
  ```

  Huom: `element?.textContent = value` ei toimi JavaScriptissä (optional chaining ei tue assignment:ia). Käytä sen sijaan null-tarkistusta:

  ```javascript
  const el = document.getElementById('ws-gym');
  if (el) el.textContent = gymDays.size;
  ```

  Päivitä kaikki `getElementById(...).textContent = ...` -rivit molemmissa funktioissa samalla tavalla.

- [ ] **Step 2: Korvaa renderTreeni() alkuosa**

  Etsi funktio `async function renderTreeni()` ja korvaa sen sisältö kokonaan:

  ```javascript
  async function renderTreeni() {
    await loadWeekActivityData(wOff);

    const ws = wStart(wOff), wk = isoWeek(ws.date);
    document.getElementById('week-label').textContent = `Viikko ${wk} / ${ws.date.getFullYear()}`;

    const st = getActiveSession(wOff, aDay);
    const sess = SESS[st];
    const started = isStarted(wOff, aDay, st);
    const done    = isDone(wOff, aDay, st);

    // Päivän nimi suomeksi
    const dayNames = ['Maanantai','Tiistai','Keskiviikko','Torstai','Perjantai','Lauantai','Sunnuntai'];
    const dayDate  = new Date(ws.date);
    dayDate.setDate(ws.date.getDate() + aDay);
    const isToday  = localIso(dayDate) === localIso(new Date());
    const dayLabel = (isToday ? 'Tänään' : dayNames[aDay]) + ' · ' + dayDate.toLocaleDateString('fi-FI',{day:'numeric',month:'long'}).toUpperCase();

    // Hero CTA
    let ctaLabel, ctaClass, ctaOnclick;
    if (done) {
      ctaLabel = 'Treeni tehty ✓'; ctaClass = 'hero-cta done';
      ctaOnclick = `toggleDone()`;
    } else if (started) {
      ctaLabel = 'Jatka treeniä →'; ctaClass = 'hero-cta';
      ctaOnclick = `document.getElementById('session-content').scrollIntoView({behavior:'smooth'})`;
    } else if (sess && sess.ex && sess.ex.length) {
      ctaLabel = 'Aloita treeni →'; ctaClass = 'hero-cta';
      ctaOnclick = `startSession()`;
    } else {
      ctaLabel = null;
    }

    // Hero stats (liikkeitä, sarjoja, est. min)
    let heroStatsHtml = '';
    if (sess && sess.ex && sess.ex.length) {
      const exCount  = sess.ex.length;
      const setCount = sess.ex.reduce((sum, e) => sum + e.s, 0);
      const estMin   = Math.round(setCount * 2.5);
      heroStatsHtml = `
        <div class="hero-stats-row">
          <div class="hero-stat"><div class="hero-stat-val">${exCount}</div><div class="hero-stat-label">liikettä</div></div>
          <div class="hero-stat-sep"></div>
          <div class="hero-stat"><div class="hero-stat-val">~${estMin}</div><div class="hero-stat-label">min</div></div>
          <div class="hero-stat-sep"></div>
          <div class="hero-stat"><div class="hero-stat-val">${setCount}</div><div class="hero-stat-label">sarjaa</div></div>
        </div>`;
    }

    document.getElementById('hero-section').innerHTML = `
      <div class="hero-card">
        <div class="hero-glow"></div>
        <div class="hero-day">${dayLabel}</div>
        <div class="hero-name">${sess ? sess.name : '—'}</div>
        <div class="hero-focus">${sess ? sess.focus : ''}</div>
        ${heroStatsHtml}
        ${ctaLabel ? `<button class="${ctaClass}" onclick="${ctaOnclick}">${ctaLabel}</button>` : ''}
      </div>
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
    tabs.innerHTML = '';
    DAYS.forEach((lb, i) => {
      const ist = getActiveSession(wOff, i), isSali = ['t1','t2','t3','t4'].includes(ist);
      const btn = document.createElement('button');
      btn.className = 'day-tab';
      if (i === aDay)                btn.classList.add('active');
      else if (isDone(wOff, i, ist)) btn.classList.add('done');
      else if (!isSali)              btn.classList.add('rest');
      btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
      const dotDone    = isDone(wOff, i, ist);
      const dotStarted = isStarted(wOff, i, ist);
      const dotCls     = dotDone ? 'done' : dotStarted ? 'active' : '';
      const dotHtml    = dotCls ? `<div class="day-state-dot ${dotCls}"></div>` : '';
      btn.innerHTML = `<span>${lb}</span><span style="font-size:9px;opacity:.6">${ist.toUpperCase()}</span>${dotHtml}`;
      btn.onclick = () => { aDay = i; renderTreeni(); };

      const dayD = new Date(ws.date);
      dayD.setDate(ws.date.getDate() + i);
      const dayIso = localIso(dayD);
      const dayData = weekActivityCache[dayIso];
      if (dayData) {
        const hasWorkout  = Object.keys(dayData.workout).length > 0;
        const hasActivity = dayData.activities.length > 0;
        if (hasWorkout || hasActivity) {
          const indicator = document.createElement('button');
          indicator.className = 'day-done-btn';
          if (hasWorkout) {
            indicator.textContent = `💪 ${Object.keys(dayData.workout).length} liik.`;
          } else {
            const act = dayData.activities[0];
            const icon = act.activity_type === 'Jääkiekko' ? '🏒' :
                         act.activity_type === 'Juoksu'    ? '🏃' :
                         act.activity_type === 'Kävely'    ? '🚶' : '⚡';
            indicator.textContent = `${icon} ${act.activity_type}`;
          }
          indicator.onclick = (e) => { e.stopPropagation(); openDayPopup(dayIso, dayData); };
          btn.appendChild(indicator);
        }
      }
      tabs.appendChild(btn);
    });

    loadWeekSummary();
    loadMotivationSummary();
    await renderSession();
  }
  ```

- [ ] **Step 3: Tarkista selaimessa**

  Lataa sivu. Tarkista:
  - Hero-kortti näkyy gradientilla oikeassa yläkulmassa glow-efektillä
  - Treenin nimi ja fokus näkyvät
  - Liikettä/min/sarjaa -stats näkyvät
  - "Aloita treeni →" -nappi glassmorphism-tyylillä
  - 🔥/💪/😴 -metriikat latautuvat (aluksi `—`, päivittyvät hetken kuluttua)
  - Päivätabit toimivat kuten ennen

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "ui: hero-kortti renderTreeni():ssä — gradient, stats, CTA, null-guardit"
  ```

---

## Task 5: JS — renderSession() sessiotyypin valitsin päivitetään pill-tyyliin

**Tiedostot:** Muokataan `index.html` — `renderSession()` sessiotyyppikortti (n. rivi 1184–1193)

- [ ] **Step 1: Korvaa sessiotyypin valitsin renderSession():ssä**

  Etsi `renderSession()`-funktiossa kohta jossa rakennetaan "Päivän tyyppi" -kortti. Korvaa tämä osa:

  ```javascript
  // Session type picker
  let html = `<div class="card" style="margin-bottom:8px">
    <div class="card-title">Päivän tyyppi</div>
    <div class="sess-picker">`;
  Object.entries(SESSION_LABELS).forEach(([key, lbl]) => {
    const active = key === st;
    html += `<button onclick="setActiveSession(${wOff},${aDay},'${key}')"
      class="sess-btn${active ? ' active' : ''}">
      ${lbl}</button>`;
  });
  html += `</div></div>`;
  ```

- [ ] **Step 2: Tarkista selaimessa**

  Lataa sivu ja aloita treeni. Tarkista sessiotyypin valitsimen napit: aktiivinen sininen pill, muut harmaat.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: sessiotyypin valitsin pill-napeiksi"
  ```

---

## Task 6: CSS — sarjataulukko (ex-set-table)

**Tiedostot:** Muokataan `index.html` — `<style>`-blokki, lisätään taulukkorakenne

- [ ] **Step 1: Poista vanhat set-row-tyylit ja lisää uudet**

  Etsi `/* ─── Set rows ───*/`-osio CSS:ssä. Korvaa koko osio (`.sets-col`, `.set-row`, `.set-row-num` jne.) seuraavalla:

  ```css
  /* ─── Set rows (taulukkorakenne) ───────────────────────────── */
  .ex-block { margin-bottom: 10px; }

  .ex-block-header {
    background: linear-gradient(135deg, #0d1b4b, #0a2a6e);
    border-radius: 16px 16px 0 0;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ex-block-title { font-size:15px; font-weight:600; color:#fff; letter-spacing:-0.01em; }
  .ex-block-sub   { font-size:12px; color:rgba(255,255,255,0.5); margin-top:2px; }
  .ex-block-progress { text-align:right; flex-shrink:0; }
  .ex-block-prog-label { font-size:11px; color:rgba(255,255,255,0.4); margin-bottom:4px; }
  .ex-block-prog-bar  { width:50px; height:3px; background:#1c3a7a; border-radius:3px; }
  .ex-block-prog-fill { height:3px; background:#0a84ff; border-radius:3px; }

  .ex-set-table {
    background: var(--surface);
    border-radius: 0 0 16px 16px;
    overflow: hidden;
  }
  .set-table-hdr {
    display: grid;
    grid-template-columns: 28px 1fr 1fr 60px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface2);
  }
  .set-table-hdr span {
    font-size: 10px;
    font-weight: 600;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .set-table-hdr span:last-child { text-align: right; }

  .set-table-row {
    display: grid;
    grid-template-columns: 28px 1fr 1fr 60px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    align-items: center;
    transition: background .2s;
  }
  .set-table-row:last-child { border-bottom: none; }
  .set-table-row.s-undone { background: rgba(255,69,58,0.06); }
  .set-table-row.s-worse  { background: rgba(255,159,10,0.08); }
  .set-table-row.s-same   { background: rgba(10,132,255,0.08); }
  .set-table-row.s-better { background: rgba(48,209,88,0.06); }

  .set-tnum { font-size:13px; font-weight:700; }
  .set-table-row.s-undone .set-tnum { color: var(--red); }
  .set-table-row.s-worse  .set-tnum { color: #ff9f0a; }
  .set-table-row.s-same   .set-tnum { color: var(--accent); }
  .set-table-row.s-better .set-tnum { color: var(--green); }

  .set-tinput {
    width: 58px;
    height: 36px;
    padding: 0 6px;
    font-size: 17px;
    font-weight: 600;
    background: var(--surface3);
    border: 1.5px solid transparent;
    border-radius: 8px;
    color: var(--text);
    text-align: center;
    outline: none;
    transition: border-color var(--t);
  }
  .set-tinput:focus    { border-color: var(--accent); }
  .set-tinput:disabled { opacity: 0.35; }

  .set-tprev {
    font-size: 11px;
    color: var(--text3);
    text-align: right;
    letter-spacing: -0.1px;
  }

  .ex-header-right { display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; }

  /* "Seuraavaksi"-palkki */
  .ex-next-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--surface);
    border-radius: 12px;
    margin-top: 4px;
  }
  .ex-next-label {
    font-size: 11px;
    color: var(--text3);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    white-space: nowrap;
  }
  .ex-next-name { font-size: 13px; font-weight: 500; color: var(--text2); }
  ```

- [ ] **Step 2: Tarkista ettei sivurakenne rikkoutunut**

  Lataa sivu. Uudet CSS-luokat eivät vaikuta vielä — treeninäkymä käyttää vielä vanhoja `.set-row`-luokkia. Sivun pitäisi näyttää normaalilta.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: lisää ex-set-table CSS-luokat sarjataulukolle"
  ```

---

## Task 7: JS — renderSession() sarjataulukkorakenne

**Tiedostot:** Muokataan `index.html` — `renderSession()` liike-renderöinti (n. rivit 1221–1278)

- [ ] **Step 1: Korvaa liike-renderöinti renderSession():ssä**

  Etsi `renderSession()`-funktiosta kohta jossa iteroidaan `sess.ex.forEach((ex, ei) => {`. Korvaa kaikki `forEach`:n sisältö (mukaan lukien sulkeva `});`) sekä `bottomBtn`-rakenne seuraavalla:

  ```javascript
  sess.ex.forEach((ex, ei) => {
    const ed   = getED(wOff, aDay, st, ei);
    const prev = prevCache[ex.n];

    // PR-tarkistus
    const cWeights = (ed.sets || []).map(s => parseFloat(s && s.kg)).filter(n => !isNaN(n));
    const pWeights = prev ? prev.map(s => s.weight_kg || 0) : [];
    const isPR = pWeights.length > 0 && cWeights.length > 0 && Math.max(...cWeights) > Math.max(...pWeights);

    // Sarjojen edistyminen
    const doneCount = (ed.sets || []).filter((s, si) => {
      const sd = s || {};
      return (parseFloat(sd.kg) || null) !== null || (parseInt(sd.reps) || null) !== null;
    }).length;
    const progPct = ex.s > 0 ? Math.round(doneCount / ex.s * 100) : 0;

    // Prefill-nappi
    const prefillBtn = prev && started && !done
      ? `<button onclick="prefillExercise(${wOff},${aDay},${ei},this)" class="prefill-btn">↓ Käytä edell.</button>`
      : '';

    html += `<div class="ex-block">
      <div class="ex-block-header">
        <div>
          <div class="ex-block-title">${ex.n}${isPR ? '<span class="pr-badge">PR</span>' : ''}</div>
          <div class="ex-block-sub">${ex.t}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="ex-block-progress">
            <div class="ex-block-prog-label">${doneCount}/${ex.s} sarjaa</div>
            <div class="ex-block-prog-bar"><div class="ex-block-prog-fill" style="width:${progPct}%"></div></div>
          </div>
          ${prefillBtn}
        </div>
      </div>
      <div class="ex-set-table">
        <div class="set-table-hdr">
          <span>S</span><span>KG</span><span>TOISTOT</span><span>EDELL.</span>
        </div>`;

    for (let s = 0; s < ex.s; s++) {
      const sd = (ed.sets && ed.sets[s]) || {};
      const prevSet = getPrevSet(ex.n, s);
      const status  = setStatus(sd, prevSet);
      const prevStr = prevSet ? `${prevSet.weight_kg ?? '?'}×${prevSet.reps ?? '?'}` : '—';

      html += `<div class="set-table-row s-${status}" id="set-${wOff}-${aDay}-${ei}-${s}">
        <span class="set-tnum">${s + 1}</span>
        <input class="set-tinput" type="text" inputmode="decimal" placeholder="kg"
          value="${sd.kg || ''}" ${locked ? 'disabled' : ''}
          onchange="saveSet(${wOff},${aDay},${ei},${s},'kg',this.value.replace(',','.'))">
        <input class="set-tinput" type="text" inputmode="numeric" placeholder="tr"
          value="${sd.reps || ''}" ${locked ? 'disabled' : ''}
          onchange="saveSet(${wOff},${aDay},${ei},${s},'reps',this.value)">
        <span class="set-tprev">${prevStr}</span>
      </div>`;
    }

    html += `</div>`; // ex-set-table

    // "Seuraavaksi"-palkki (piilotetaan viimeisellä liikkeellä)
    if (ei < sess.ex.length - 1) {
      const nextEx = sess.ex[ei + 1];
      html += `<div class="ex-next-bar">
        <span class="ex-next-label">Seuraavaksi</span>
        <span class="ex-next-name">${nextEx.n} · ${nextEx.t}</span>
      </div>`;
    }

    html += `</div>`; // ex-block
  });

  const bottomBtn = !started
    ? `<button class="complete-btn" onclick="startSession()">Aloita treeni</button>`
    : `<button class="complete-btn ${done ? 'done' : ''}" onclick="toggleDone()">
         ${done ? 'Treeni tehty ✓' : 'Merkitse tehdyksi'}
       </button>`;
  html += bottomBtn;
  ```

- [ ] **Step 2: Tarkista selaimessa**

  Aloita treeni. Tarkista:
  - Jokainen liike: gradient-header + taulukko
  - Sarjataulukko: S | KG | TOISTOT | EDELL. -otsikkorivi
  - Inputit: toimivat, kg saa sinisen reunan focuksessa
  - Edellinen sessio oikeassa reunassa
  - "Seuraavaksi"-palkki liikkeiden välissä, ei viimeisen jälkeen
  - Statustila-värit (vihreä/sininen/punainen) toimivat
  - Prefill-nappi toimii ja täyttää arvot
  - PR-badge näkyy

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: sarjarivit taulukkorakenteeksi — kompakti grid, seuraavaksi-palkki"
  ```

---

## Task 8: JS — updateSetBox() uusille CSS-luokille

**Tiedostot:** Muokataan `index.html` — `updateSetBox()` (n. rivi 966)

- [ ] **Step 1: Päivitä updateSetBox() käyttämään uutta luokkanimeä**

  Etsi `function updateSetBox(o, d, e, s)` ja korvaa viimeinen rivi:

  ```javascript
  // Vanha:
  box.className = `set-row s-${setStatus(sd, prev)}`;

  // Uusi:
  box.className = `set-table-row s-${setStatus(sd, prev)}`;
  ```

- [ ] **Step 2: Tarkista selaimessa**

  Kirjoita paino ja toistot. Tarkista:
  - Rivi saa oikean värin heti (vihreä = parempi, oranssi = heikompi, sininen = sama)
  - Edistymispalkki liike-headerissa päivittyy (sarjojen laskuri)

  Huom: edistymispalkki päivittyy vasta `renderTreeni()`-kutsulla (eli kun siirryt toiseen päivään). Laskuri ja värit päivittyvät `updateSetBox()`:n kautta reaaliajassa.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: updateSetBox käyttää set-table-row luokkaa"
  ```

---

## Task 9: Siivous — poista vanhat CSS-luokat

**Tiedostot:** Muokataan `index.html` — `<style>`-blokki

- [ ] **Step 1: Poista käyttämättömät luokat**

  Nyt kun taulukkorakenne on käytössä, nämä vanhat luokat ovat kuolleita — poista CSS:stä:
  - `.sets-col` (jos jäi yli edellisestä korvauksesta)
  - `.set-row-num`, `.set-row-inputs`, `.set-row-inputs-row`, `.set-row-prev`
  - `.set-row-input`, `.set-row-sep`, `.set-row-status`

  Tarkista `grep "set-row" index.html` — pitäisi löytyä vain `set-table-row` viittauksia JS:ssä.

- [ ] **Step 2: Tarkista selaimessa**

  Koko sovellus toimii normaalisti — poistot eivät vaikuta koska nämä luokat eivät ole enää käytössä.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "ui: poista vanhat set-row CSS-luokat"
  ```

---

## Loppuvarmistus

- [ ] Treeni-sivu latautuu: hero-kortti, metrics, päivätabit
- [ ] Viikkonavigaatio (← →) toimii, hero-kortti päivittyy
- [ ] Treeni aloitetaan: CTA muuttuu "Jatka treeniä →", sarjataulukko aktivoituu
- [ ] Inputit tallentuvat Supabaseen (avaa DevTools → Network)
- [ ] Prefill toimii: "↓ Käytä edell." täyttää arvot
- [ ] PR-badge näkyy oikein
- [ ] Treeni merkitään tehdyksi: CTA vihreäksi, bottom-nappi "Treeni tehty ✓"
- [ ] Navigointi: Treeni / Seuranta / Valikko — pill-tyyli toimii
- [ ] Seuranta- ja Historia-sivut toimivat ennallaan
