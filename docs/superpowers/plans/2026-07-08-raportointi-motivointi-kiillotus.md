# Raportointi, motivointi & Koonti-kiillotus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yhdistetty Sprint 2 -osaprojekti: viikkoraporttikortti oivalluksineen (kohdat 8+9), streak- ja PR-juhlistus (kohdat 10+11), Koonti-korttien visuaalinen tilahierarkia (kohta 14) ja skeleton-loaderit (kohta 15).

**Architecture:** Kaikki muutokset yhteen tiedostoon (`index.html`). Uusi "Tällä viikolla" -kortti Koonti-sivulle laskee viikkomittarit + vertailun edelliseen viikkoon olemassa olevista tauluista. Uusi jaettu `showCelebrationToast()`-komponentti käytetään sekä streak- että PR-juhlistukseen. Koonti-korttien tilat ja skeleton-loaderit ovat CSS+pieniä JS-lisäyksiä olemassa olevaan `loadKoonti()`-funktioon.

**Tech Stack:** Vanilla JS, Supabase JS client v2, ei build-stepiä (yksi `index.html`-tiedosto).

---

### Task 1: "Tällä viikolla" -kortti — viikkomittarit ja vertailu (kohta 8)

**Files:**
- Modify: `index.html` (Koonti-sivun HTML, uusi kortti)
- Modify: `index.html` (`loadKoonti()`, uusi funktiokutsu)
- Modify: `index.html` (kaksi uutta funktiota: `getWeekStats`, `loadWeeklyReportCard`)

**Konteksti ennen muutosta** — Koonti-sivun loppu:

```html
  <div class="koonti-cards koonti-cards--wide">
    <div class="koonti-card koonti-card--ruoka" id="kc-ruoka" onclick="showPage('ruoka', document.getElementById('nav-ruoka'))">
      <div>
        <div class="koonti-card-label">🍽️ Ruokailu</div>
        <div class="koonti-card-sub" id="kc-ruoka-sub">Ladataan…</div>
      </div>
      <div style="font-size:20px;color:var(--text3)">›</div>
    </div>
  </div>
</div>

<!-- ── SALI ───────────────────────────────────────────────────── -->
```

- [ ] **Step 1: Lisää uusi kortti Koonti-sivun HTML:ään**

Korvaa yllä oleva lohko (lisää uusi `<div class="card" id="kc-weekly-report">` -kortti heti Ruokailu-korttien jälkeen, ennen `#page-koonti`:n sulkevaa `</div>`:ä):

```html
  <div class="koonti-cards koonti-cards--wide">
    <div class="koonti-card koonti-card--ruoka" id="kc-ruoka" onclick="showPage('ruoka', document.getElementById('nav-ruoka'))">
      <div>
        <div class="koonti-card-label">🍽️ Ruokailu</div>
        <div class="koonti-card-sub" id="kc-ruoka-sub">Ladataan…</div>
      </div>
      <div style="font-size:20px;color:var(--text3)">›</div>
    </div>
  </div>

  <div class="card" id="kc-weekly-report" style="margin:0 12px 10px">
    <div class="card-title">Tällä viikolla</div>
    <div id="kc-weekly-rows">Ladataan…</div>
    <div id="kc-weekly-insights" style="display:none"></div>
  </div>
</div>

<!-- ── SALI ───────────────────────────────────────────────────── -->
```

- [ ] **Step 2: Lisää `getWeekStats()`-apufunktio**

Lisää tämä funktio heti `loadWeekSummary()`-funktion sulkevan `}`:n jälkeen (`index.html`, hae `async function loadWeekSummary()` ja etsi sen loppu):

```js
async function getWeekStats(offset) {
  const mon = wStart(offset);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const from = mon.iso, to = localIso(sun);

  const [
    { data: gymData },
    { data: actData },
    { data: sleepData },
    { data: weightData },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date').gte('workout_date', from).lte('workout_date', to),
    sb.from('activity_data').select('distance_km').gte('activity_date', from).lte('activity_date', to),
    sb.from('sleep_data').select('duration_min').gte('sleep_date', from).lte('sleep_date', to),
    sb.from('body_metrics').select('weight_kg,measured_at').gte('measured_at', from).lte('measured_at', to).order('measured_at', { ascending: true }),
  ]);

  const gymDays = new Set((gymData || []).map(r => r.workout_date)).size;
  const actCount = actData ? actData.length : 0;
  const totalKm = (actData || []).reduce((s, r) => s + (r.distance_km || 0), 0);
  const withDur = (sleepData || []).filter(r => r.duration_min !== null);
  const avgSleep = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length / 60 : null;
  const withWeight = (weightData || []).filter(r => r.weight_kg != null);
  const weightDelta = withWeight.length >= 2
    ? Math.round((withWeight[withWeight.length - 1].weight_kg - withWeight[0].weight_kg) * 10) / 10
    : null;

  return { gymDays, actCount, totalKm, avgSleep, weightDelta };
}
```

Huom: `wStart(offset)`, `localIso(date)` ovat jo olemassa olevia apufunktioita — ei uudelleenmääritellä.

- [ ] **Step 3: Lisää `loadWeeklyReportCard()`-funktio**

Lisää tämä funktio heti `getWeekStats()`-funktion jälkeen:

```js
async function loadWeeklyReportCard() {
  const [thisWeek, lastWeek] = await Promise.all([
    getWeekStats(wOff),
    getWeekStats(wOff - 1),
  ]);

  const fmtDelta = (cur, prev, unit) => {
    if (prev == null || cur == null) return '';
    const d = Math.round((cur - prev) * 10) / 10;
    if (d === 0) return '';
    return ` (${d > 0 ? '+' : ''}${d}${unit})`;
  };

  const rows = [];
  rows.push(`<div class="hist-item"><div class="hist-label">Salikertoja</div><div class="hist-val">${thisWeek.gymDays}${fmtDelta(thisWeek.gymDays, lastWeek.gymDays, '')}</div></div>`);
  rows.push(`<div class="hist-item"><div class="hist-label">Aktiviteettikertoja</div><div class="hist-val">${thisWeek.actCount}${fmtDelta(thisWeek.actCount, lastWeek.actCount, '')}</div></div>`);
  if (thisWeek.totalKm > 0 || lastWeek.totalKm > 0) {
    rows.push(`<div class="hist-item"><div class="hist-label">Kilometrit</div><div class="hist-val">${thisWeek.totalKm.toFixed(1)} km${fmtDelta(thisWeek.totalKm, lastWeek.totalKm, ' km')}</div></div>`);
  }
  if (thisWeek.avgSleep != null || lastWeek.avgSleep != null) {
    const curStr = thisWeek.avgSleep != null ? thisWeek.avgSleep.toFixed(1) + 'h' : '—';
    rows.push(`<div class="hist-item"><div class="hist-label">Unen keskiarvo</div><div class="hist-val">${curStr}${fmtDelta(thisWeek.avgSleep, lastWeek.avgSleep, 'h')}</div></div>`);
  }
  if (thisWeek.weightDelta != null) {
    const sign = thisWeek.weightDelta >= 0 ? '+' : '';
    rows.push(`<div class="hist-item"><div class="hist-label">Painon muutos</div><div class="hist-val">${sign}${thisWeek.weightDelta} kg</div></div>`);
  }

  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
}
```

- [ ] **Step 4: Kytke `loadWeeklyReportCard()` `loadKoonti()`:iin**

Etsi `loadKoonti()`-funktion alusta:

```js
  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
```

Korvaa:

```js
  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  loadWeeklyReportCard();
```

- [ ] **Step 5: Käynnistä paikallinen palvelin ja testaa manuaalisesti**

```bash
cd /Users/patrikfriis/Projects/treeniapp
python3 -m http.server 8080 &
```

Navigoi `http://localhost:8080/index.html`, tarkista Koonti-sivun lopussa "Tällä viikolla" -kortti näyttää oikeat luvut verrattuna manuaalisesti laskettuun Supabase-dataan (voi tarkistaa esim. curlilla). Tarkista konsoli virheiden varalta.

- [ ] **Step 6: Committaa**

```bash
git add index.html
git commit -m "feat: lisää Tällä viikolla -kortti viikkomittareilla ja vertailulla"
```

---

### Task 2: Oivallukset — paras juoksuviikko ja plateau-varoitus (kohta 9)

**Files:**
- Modify: `index.html` (kaksi uutta funktiota: `checkBestRunningWeek`, `checkPlateau`)
- Modify: `index.html` (`loadWeeklyReportCard()`, oivallusten näyttö)

**Konteksti ennen muutosta** — `loadWeeklyReportCard()`:n loppu (Task 1:ssä lisätty):

```js
  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
}
```

- [ ] **Step 1: Lisää `checkBestRunningWeek()`-funktio**

Lisää tämä funktio heti `loadWeeklyReportCard()`-funktion jälkeen:

```js
async function checkBestRunningWeek() {
  const mon0 = wStart(wOff - 11);
  const sunLast = new Date(wStart(wOff).date);
  sunLast.setDate(sunLast.getDate() + 6);
  const { data } = await sb.from('activity_data').select('activity_date,distance_km')
    .eq('activity_type', 'Juoksu')
    .gte('activity_date', mon0.iso).lte('activity_date', localIso(sunLast));

  const weekKm = new Array(12).fill(0);
  for (let i = 0; i < 12; i++) {
    const mon = wStart(wOff - i);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const from = mon.iso, to = localIso(sun);
    weekKm[i] = (data || [])
      .filter(r => r.activity_date >= from && r.activity_date <= to)
      .reduce((s, r) => s + (r.distance_km || 0), 0);
  }

  const currentKm = weekKm[0];
  const priorWeeksWithData = weekKm.slice(1).filter(k => k > 0).length;
  if (currentKm > 0 && priorWeeksWithData >= 4 && currentKm === Math.max(...weekKm)) {
    return '🏆 Paras juoksuviikkosi 3 kk aikana';
  }
  return null;
}
```

- [ ] **Step 2: Lisää `checkPlateau()`-funktio**

Lisää tämä funktio heti `checkBestRunningWeek()`-funktion jälkeen:

```js
async function checkPlateau() {
  const mon = wStart(wOff);
  const sun = new Date(mon.date);
  sun.setDate(mon.date.getDate() + 6);
  const { data: thisWeekSets } = await sb.from('workout_sets').select('exercise_name')
    .gte('workout_date', mon.iso).lte('workout_date', localIso(sun));
  const exercisesThisWeek = [...new Set((thisWeekSets || []).map(r => r.exercise_name))];
  if (!exercisesThisWeek.length) return null;

  const mon3 = wStart(wOff - 2);
  const { data: historySets } = await sb.from('workout_sets').select('exercise_name,weight_kg,workout_date')
    .in('exercise_name', exercisesThisWeek)
    .gte('workout_date', mon3.iso).lte('workout_date', localIso(sun));

  for (const exName of exercisesThisWeek) {
    const weekMax = [0, 1, 2].map(i => {
      const wm = wStart(wOff - i);
      const ws = new Date(wm.date);
      ws.setDate(wm.date.getDate() + 6);
      const from = wm.iso, to = localIso(ws);
      const weights = (historySets || [])
        .filter(r => r.exercise_name === exName && r.workout_date >= from && r.workout_date <= to)
        .map(r => r.weight_kg || 0);
      return weights.length ? Math.max(...weights) : null;
    });
    if (weekMax[0] != null && weekMax[1] != null && weekMax[2] != null && weekMax[2] >= weekMax[0]) {
      return `📊 ${escapeHtml(exName)} ei ole edistynyt 3 viikkoon`;
    }
  }
  return null;
}
```

Huom: `exName` tulee `workout_sets.exercise_name`-sarakkeesta, joka voi sisältää käyttäjän itse kirjoittamaa tekstiä (`createNewExerciseAndAdd()`-funktion kautta) — siksi `escapeHtml()`-käärintä on pakollinen tässä, samaan tapaan kuin muualla tiedostossa käyttäjän syöttämää tekstiä HTML:ään upotettaessa.

- [ ] **Step 3: Näytä oivallukset kortissa**

Korvaa `loadWeeklyReportCard()`-funktion loppu:

```js
  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');
}
```

tällä (lisää oivallusten haku ja näyttö):

```js
  document.getElementById('kc-weekly-rows').innerHTML = rows.join('');

  const [bestWeekInsight, plateauInsight] = await Promise.all([
    checkBestRunningWeek(),
    checkPlateau(),
  ]);
  const insights = [bestWeekInsight, plateauInsight].filter(Boolean);
  const insightsEl = document.getElementById('kc-weekly-insights');
  if (insights.length) {
    insightsEl.innerHTML = insights.map(i => `<div class="weekly-insight">${i}</div>`).join('');
    insightsEl.style.display = '';
  } else {
    insightsEl.style.display = 'none';
  }
}
```

- [ ] **Step 4: Lisää CSS `.weekly-insight`-luokalle**

Etsi CSS-tiedostosta `.koonti-card-goal`-sääntö (index.html, `<style>`-lohko):

```css
.koonti-card-goal  { font-size: 11px; color: var(--accent); margin-top: 2px; }
```

Lisää heti sen jälkeen:

```css
.koonti-card-goal  { font-size: 11px; color: var(--accent); margin-top: 2px; }
#kc-weekly-insights { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
.weekly-insight { font-size: 12px; color: var(--accent); margin-top: 6px; }
.weekly-insight:first-child { margin-top: 0; }
```

- [ ] **Step 5: Testaa manuaalisesti**

Lataa sivu, tarkista "Tällä viikolla" -kortti — jos testidatassa ei ole 12 viikon juoksuhistoriaa tai 3 viikon liikehistoriaa, oivallukset-rivi pysyy piilossa (odotettua). Voit tilapäisesti tarkistaa logiikan `checkBestRunningWeek()`/`checkPlateau()`-funktioita kutsumalla selaimen konsolista suoraan (`await checkBestRunningWeek()`) nähdäksesi palautuuko merkkijono vai `null`.

- [ ] **Step 6: Committaa**

```bash
git add index.html
git commit -m "feat: lisää oivallukset (paras juoksuviikko, plateau-varoitus)"
```

---

### Task 3: Koonti-korttien tilat — tehty/kesken/ei vielä (kohta 14)

**Files:**
- Modify: `index.html` (CSS: `.koonti-card`-säännöt)
- Modify: `index.html` (`loadKoonti()`, kaikki 5 korttia)

**Konteksti ennen muutosta** — CSS:

```css
.koonti-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: transform var(--t);
}
.koonti-card:active { transform: scale(.98); }
.koonti-card-icon  { font-size: 24px; margin-bottom: 8px; display: block; }
.koonti-card-label { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.koonti-card-sub   { font-size: 12px; color: var(--text3); }
.koonti-card--done .koonti-card-sub { color: var(--green); }
.koonti-card-goal  { font-size: 11px; color: var(--accent); margin-top: 2px; }
.koonti-card--ruoka { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 1: Päivitä CSS**

Korvaa yllä oleva lohko:

```css
.koonti-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: transform var(--t);
  position: relative;
}
.koonti-card:active { transform: scale(.98); }
.koonti-card-icon  { font-size: 24px; margin-bottom: 8px; display: block; }
.koonti-card-label { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.koonti-card-sub   { font-size: 12px; color: var(--text3); }
.koonti-card--done { background: var(--green-bg); border: 1px solid rgba(48,209,88,0.3); }
.koonti-card--done .koonti-card-sub { color: var(--green); }
.koonti-card--done::after { content: "✓"; position: absolute; top: 12px; right: 14px; color: var(--green); font-weight: 700; font-size: 13px; }
.koonti-card--inprogress { background: var(--accent-bg); border: 1px solid rgba(10,132,255,0.35); }
.koonti-card--inprogress .koonti-card-sub { color: var(--accent); }
.koonti-card--inprogress::after { content: "●"; position: absolute; top: 16px; right: 16px; color: var(--accent); font-size: 8px; }
.koonti-card-goal  { font-size: 11px; color: var(--accent); margin-top: 2px; }
.koonti-card--ruoka { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 2: Lisää "kesken"-tila Sali-kortille**

Etsi `loadKoonti()`-funktiosta:

```js
  const { data: wsRows } = await sb.from('workout_sessions')
    .select('is_done,session_type,calories')
    .eq('workout_date', todayIso).limit(1);
  const kcSaliCard = document.getElementById('kc-sali');
  const kcSaliSub  = document.getElementById('kc-sali-sub');
  if (wsRows && wsRows[0] && wsRows[0].is_done) {
    const cal = wsRows[0].calories ? ` · ${wsRows[0].calories} kcal` : '';
    kcSaliSub.textContent = `Tehty ✓${cal}`;
    kcSaliCard.classList.add('koonti-card--done');
  } else {
    kcSaliCard.classList.remove('koonti-card--done');
    const st = SCHED[(new Date().getDay() + 6) % 7];
    const hasEx = st && SESS[st] && SESS[st].ex && SESS[st].ex.length > 0;
    kcSaliSub.textContent = hasEx
      ? `Ei vielä · ${SESS[st].name}`
      : (st ? 'Ei salipäivä tänään' : 'Ei ohjelmoitua sessiota tänään');
  }
```

Korvaa:

```js
  const { data: wsRows } = await sb.from('workout_sessions')
    .select('is_done,session_type,calories')
    .eq('workout_date', todayIso).limit(1);
  const kcSaliCard = document.getElementById('kc-sali');
  const kcSaliSub  = document.getElementById('kc-sali-sub');
  kcSaliCard.classList.remove('koonti-card--done', 'koonti-card--inprogress');
  const todayIdx = (new Date().getDay() + 6) % 7;
  if (wsRows && wsRows[0] && wsRows[0].is_done) {
    const cal = wsRows[0].calories ? ` · ${wsRows[0].calories} kcal` : '';
    kcSaliSub.textContent = `Tehty ✓${cal}`;
    kcSaliCard.classList.add('koonti-card--done');
  } else {
    const st = SCHED[todayIdx];
    const hasEx = st && SESS[st] && SESS[st].ex && SESS[st].ex.length > 0;
    if (isStarted(0, todayIdx, st)) {
      kcSaliCard.classList.add('koonti-card--inprogress');
      kcSaliSub.textContent = hasEx ? `Kesken · ${SESS[st].name}` : 'Kesken';
    } else {
      kcSaliSub.textContent = hasEx
        ? `Ei vielä · ${SESS[st].name}`
        : (st ? 'Ei salipäivä tänään' : 'Ei ohjelmoitua sessiota tänään');
    }
  }
```

Huom: `isStarted(o, d, st)` on jo olemassa oleva funktio (paikallinen `LD`-tila, ei synkronoidu Supabaseen) — ei uudelleenmääritellä.

- [ ] **Step 3: Lisää "tehty"-tila Aerobinen-kortille**

Etsi:

```js
  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min')
    .order('activity_date', { ascending: false }).limit(1);
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  kcAerobiaSub.textContent = (actRows && actRows[0])
    ? `${actRows[0].activity_type} · ${actRows[0].duration_min ?? '—'} min (${actRows[0].activity_date})`
    : 'Ei aktiviteetteja vielä';
```

Korvaa:

```js
  const { data: actRows } = await sb.from('activity_data')
    .select('activity_type,activity_date,duration_min')
    .order('activity_date', { ascending: false }).limit(1);
  const kcAerobiaCard = document.getElementById('kc-aerobia');
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  const aerobiaDoneToday = !!(actRows && actRows[0] && actRows[0].activity_date === todayIso);
  kcAerobiaCard.classList.toggle('koonti-card--done', aerobiaDoneToday);
  kcAerobiaSub.textContent = (actRows && actRows[0])
    ? `${actRows[0].activity_type} · ${actRows[0].duration_min ?? '—'} min (${actRows[0].activity_date})`
    : 'Ei aktiviteetteja vielä';
```

- [ ] **Step 4: Lisää "tehty"-tila Keho-kortille**

Etsi:

```js
  const { data: bodyRows } = await sb.from('body_metrics')
    .select('weight_kg,measured_at')
    .order('measured_at', { ascending: false }).limit(2);
  const kcKehoSub = document.getElementById('kc-keho-sub');
  if (bodyRows && bodyRows[0] && bodyRows[0].weight_kg) {
```

Korvaa:

```js
  const { data: bodyRows } = await sb.from('body_metrics')
    .select('weight_kg,measured_at')
    .order('measured_at', { ascending: false }).limit(2);
  const kcKehoCard = document.getElementById('kc-keho');
  const kcKehoSub = document.getElementById('kc-keho-sub');
  const kehoDoneToday = !!(bodyRows && bodyRows[0] && bodyRows[0].measured_at === todayIso);
  kcKehoCard.classList.toggle('koonti-card--done', kehoDoneToday);
  if (bodyRows && bodyRows[0] && bodyRows[0].weight_kg) {
```

(Loput `kcKehoSub`-lohkosta pysyy ennallaan — vain kortin haku ja luokan asetus lisätään ennen olemassa olevaa `if`-lausetta.)

- [ ] **Step 5: Lisää "tehty"-tila Uni-kortille**

Etsi:

```js
  const { data: sleepRows } = await sb.from('sleep_data')
    .select('duration_min,sleep_date')
    .order('sleep_date', { ascending: false }).limit(7);
  const kcUniSub = document.getElementById('kc-uni-sub');
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
```

Korvaa:

```js
  const { data: sleepRows } = await sb.from('sleep_data')
    .select('duration_min,sleep_date')
    .order('sleep_date', { ascending: false }).limit(7);
  const kcUniCard = document.getElementById('kc-uni');
  const kcUniSub = document.getElementById('kc-uni-sub');
  const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
  kcUniCard.classList.toggle('koonti-card--done', uniDoneToday);
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
```

- [ ] **Step 6: Lisää "tehty"-tila Ruokailu-kortille**

Etsi:

```js
  const entries = await loadFoodDayEntries(todayIso);
  const kcRuokaSub = document.getElementById('kc-ruoka-sub');
  const totalKcal = entries.reduce((s, e) => s + (e.kcal || 0), 0);
  kcRuokaSub.textContent = entries.length ? `${Math.round(totalKcal)} kcal tänään` : 'Ei kirjauksia tänään';
}
```

Korvaa (huom: lopussa oleva `}` sulkee `loadKoonti()`-funktion, se pysyy):

```js
  const entries = await loadFoodDayEntries(todayIso);
  const kcRuokaCard = document.getElementById('kc-ruoka');
  const kcRuokaSub = document.getElementById('kc-ruoka-sub');
  kcRuokaCard.classList.toggle('koonti-card--done', entries.length > 0);
  const totalKcal = entries.reduce((s, e) => s + (e.kcal || 0), 0);
  kcRuokaSub.textContent = entries.length ? `${Math.round(totalKcal)} kcal tänään` : 'Ei kirjauksia tänään';
}
```

- [ ] **Step 7: Testaa manuaalisesti**

Lataa Koonti-sivu. Tarkista: kortit joilla on tänään dataa (esim. Ruokailu jos tänään on kirjauksia) näyttävät vihreän taustan+reunuksen+✓:n. Sali-kortti: jos treeni on aloitettu (`Aloita treeni` klikattu Sali-sivulla) muttei merkitty tehdyksi, Koonti-kortti näyttää sinisen "Kesken"-tilan. Kortit joissa ei dataa tänään pysyvät neutraaleina.

- [ ] **Step 8: Committaa**

```bash
git add index.html
git commit -m "feat: Koonti-korttien visuaalinen tilahierarkia (tehty/kesken/ei vielä)"
```

---

### Task 4: Skeleton-loaderit Koonti-korteille (kohta 15)

**Files:**
- Modify: `index.html` (CSS: uusi `.skel-sub`-luokka)
- Modify: `index.html` (Koonti-sivun HTML: kaikki 6 korttia)
- Modify: `index.html` (`loadKoonti()`: skeleton-luokan poisto jokaiselle kortille)

**Konteksti ennen muutosta** — CSS (`.koonti-card--ruoka`-säännön jälkeen, Task 3:n jälkeinen tila):

```css
.koonti-card--ruoka { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 1: Lisää skeleton-CSS**

Korvaa yllä oleva rivi:

```css
.koonti-card--ruoka { display: flex; align-items: center; justify-content: space-between; }
.skel-sub {
  display: inline-block;
  width: 70%;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%);
  background-size: 200% 100%;
  animation: skel-shimmer 1.5s infinite;
  color: transparent;
}
@keyframes skel-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 2: Lisää skeleton-luokka kaikkiin kortteihin HTML:ssä**

Etsi Koonti-sivun kortit (5 alkuperäistä `Ladataan…`-tekstillä varustettua sub-diviä):

```html
      <div class="koonti-card-sub" id="kc-sali-sub">Ladataan…</div>
```
```html
      <div class="koonti-card-sub" id="kc-aerobia-sub">Ladataan…</div>
```
```html
      <div class="koonti-card-sub" id="kc-keho-sub">Ladataan…</div>
```
```html
      <div class="koonti-card-sub" id="kc-uni-sub">Ladataan…</div>
```
```html
        <div class="koonti-card-sub" id="kc-ruoka-sub">Ladataan…</div>
```

Korvaa jokainen (lisää `skel-sub`-luokka, vaihda teksti `&nbsp;`:ksi):

```html
      <div class="koonti-card-sub skel-sub" id="kc-sali-sub">&nbsp;</div>
```
```html
      <div class="koonti-card-sub skel-sub" id="kc-aerobia-sub">&nbsp;</div>
```
```html
      <div class="koonti-card-sub skel-sub" id="kc-keho-sub">&nbsp;</div>
```
```html
      <div class="koonti-card-sub skel-sub" id="kc-uni-sub">&nbsp;</div>
```
```html
        <div class="koonti-card-sub skel-sub" id="kc-ruoka-sub">&nbsp;</div>
```

Lisäksi "Tällä viikolla" -kortin rivit (Task 1:ssä lisätty):

```html
    <div id="kc-weekly-rows">Ladataan…</div>
```

Korvaa:

```html
    <div id="kc-weekly-rows"><div class="koonti-card-sub skel-sub" style="width:100%">&nbsp;</div></div>
```

- [ ] **Step 3: Poista skeleton-luokka kun sisältö ladataan — Sali**

Etsi `loadKoonti()`-funktiosta (Task 3:n jälkeinen tila):

```js
  const kcSaliCard = document.getElementById('kc-sali');
  const kcSaliSub  = document.getElementById('kc-sali-sub');
  kcSaliCard.classList.remove('koonti-card--done', 'koonti-card--inprogress');
```

Korvaa:

```js
  const kcSaliCard = document.getElementById('kc-sali');
  const kcSaliSub  = document.getElementById('kc-sali-sub');
  kcSaliSub.classList.remove('skel-sub');
  kcSaliCard.classList.remove('koonti-card--done', 'koonti-card--inprogress');
```

- [ ] **Step 4: Poista skeleton-luokka — Aerobinen**

Etsi:

```js
  const kcAerobiaCard = document.getElementById('kc-aerobia');
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  const aerobiaDoneToday = !!(actRows && actRows[0] && actRows[0].activity_date === todayIso);
```

Korvaa:

```js
  const kcAerobiaCard = document.getElementById('kc-aerobia');
  const kcAerobiaSub = document.getElementById('kc-aerobia-sub');
  kcAerobiaSub.classList.remove('skel-sub');
  const aerobiaDoneToday = !!(actRows && actRows[0] && actRows[0].activity_date === todayIso);
```

- [ ] **Step 5: Poista skeleton-luokka — Keho**

Etsi:

```js
  const kcKehoCard = document.getElementById('kc-keho');
  const kcKehoSub = document.getElementById('kc-keho-sub');
  const kehoDoneToday = !!(bodyRows && bodyRows[0] && bodyRows[0].measured_at === todayIso);
```

Korvaa:

```js
  const kcKehoCard = document.getElementById('kc-keho');
  const kcKehoSub = document.getElementById('kc-keho-sub');
  kcKehoSub.classList.remove('skel-sub');
  const kehoDoneToday = !!(bodyRows && bodyRows[0] && bodyRows[0].measured_at === todayIso);
```

- [ ] **Step 6: Poista skeleton-luokka — Uni**

Etsi:

```js
  const kcUniCard = document.getElementById('kc-uni');
  const kcUniSub = document.getElementById('kc-uni-sub');
  const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
```

Korvaa:

```js
  const kcUniCard = document.getElementById('kc-uni');
  const kcUniSub = document.getElementById('kc-uni-sub');
  kcUniSub.classList.remove('skel-sub');
  const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
```

- [ ] **Step 7: Poista skeleton-luokka — Ruokailu**

Etsi:

```js
  const kcRuokaCard = document.getElementById('kc-ruoka');
  const kcRuokaSub = document.getElementById('kc-ruoka-sub');
  kcRuokaCard.classList.toggle('koonti-card--done', entries.length > 0);
```

Korvaa:

```js
  const kcRuokaCard = document.getElementById('kc-ruoka');
  const kcRuokaSub = document.getElementById('kc-ruoka-sub');
  kcRuokaSub.classList.remove('skel-sub');
  kcRuokaCard.classList.toggle('koonti-card--done', entries.length > 0);
```

Huom: "Tällä viikolla" -kortin skeleton poistuu automaattisesti, koska `loadWeeklyReportCard()` korvaa koko `kc-weekly-rows`-divin sisällön (`innerHTML = rows.join('')`) — ei tarvitse erillistä `classList.remove()`-kutsua.

- [ ] **Step 8: Testaa manuaalisesti**

Lataa sivu (voit hidastaa verkkoa selaimen DevToolsin "Network throttling" -asetuksella nähdäksesi skeleton-tilan selvemmin). Tarkista: kaikki 6 korttia näyttävät sykkivän harmaan palkin ennen dataa, korvautuvat oikealla tekstillä sitä mukaa kun kunkin oma kysely valmistuu.

- [ ] **Step 9: Committaa**

```bash
git add index.html
git commit -m "feat: skeleton-loaderit Koonti-korteille"
```

---

### Task 5: Juhlistus-infrastruktuuri ja streak-juhlistus (kohta 10)

**Files:**
- Modify: `index.html` (CSS: uusi `.celebration-toast`-lohko)
- Modify: `index.html` (uusi `showCelebrationToast()`-funktio)
- Modify: `index.html` (`loadMotivationSummary()`, streak-virstanpylväs-tarkistus)

**Konteksti ennen muutosta** — CSS (`.weekly-insight`-säännön jälkeen, Task 2:n jälkeinen tila):

```css
.weekly-insight { font-size: 12px; color: var(--accent); margin-top: 6px; }
.weekly-insight:first-child { margin-top: 0; }
```

- [ ] **Step 1: Lisää toast-CSS**

Korvaa yllä oleva lohko:

```css
.weekly-insight { font-size: 12px; color: var(--accent); margin-top: 6px; }
.weekly-insight:first-child { margin-top: 0; }
.celebration-toast {
  position: fixed;
  top: -100px;
  left: 16px;
  right: 16px;
  z-index: 300;
  background: linear-gradient(135deg, #ff9f0a, #ff453a);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  transition: top 0.3s ease;
}
.celebration-toast.visible { top: 16px; }
.celebration-toast--pr { background: linear-gradient(135deg, #0a84ff, #5e5ce6); }
.celebration-toast-icon { font-size: 28px; }
.celebration-toast-title { color: #fff; font-weight: 700; font-size: 15px; }
.celebration-toast-sub { color: #fff; font-size: 12px; opacity: 0.9; }
```

- [ ] **Step 2: Lisää `showCelebrationToast()`-funktio**

Lisää tämä funktio heti `loadMotivationSummary()`-funktion sulkevan `}`:n jälkeen (etsi `async function loadMotivationSummary()` ja sen loppu):

```js
function showCelebrationToast(icon, title, sub, type) {
  const existing = document.getElementById('celebration-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'celebration-toast';
  toast.className = `celebration-toast${type ? ' celebration-toast--' + type : ''}`;
  toast.innerHTML = `
    <div class="celebration-toast-icon">${icon}</div>
    <div>
      <div class="celebration-toast-title">${title}</div>
      <div class="celebration-toast-sub">${sub}</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
```

- [ ] **Step 3: Lisää streak-virstanpylväs-tarkistus**

Etsi `loadMotivationSummary()`-funktiosta:

```js
  const msStreakEl = document.getElementById('ms-streak');
  if (msStreakEl) msStreakEl.textContent = streak + ' pv';
  const kStreakEl = document.getElementById('koonti-ms-streak');
  if (kStreakEl) kStreakEl.textContent = streak + ' pv';
}
```

Korvaa (huom: lopussa oleva `}` sulkee `loadMotivationSummary()`-funktion, se pysyy):

```js
  const msStreakEl = document.getElementById('ms-streak');
  if (msStreakEl) msStreakEl.textContent = streak + ' pv';
  const kStreakEl = document.getElementById('koonti-ms-streak');
  if (kStreakEl) kStreakEl.textContent = streak + ' pv';

  const streakMilestones = [7, 14, 30, 50, 100];
  const isStreakMilestone = streakMilestones.includes(streak) || (streak > 100 && streak % 50 === 0);
  if (isStreakMilestone) {
    const lastCelebrated = parseInt(localStorage.getItem('celebratedStreak') || '0', 10);
    if (streak > lastCelebrated) {
      localStorage.setItem('celebratedStreak', String(streak));
      showCelebrationToast('🔥', `${streak} päivän streak!`, 'Pidät yllä upeaa vauhtia');
    }
  }
}
```

- [ ] **Step 4: Testaa manuaalisesti**

Selaimen konsolissa: `localStorage.setItem('celebratedStreak', '0')`, lataa sivu uudelleen — jos nykyinen streak on jokin virstanpylväistä (7/14/30/50/100), toast pitäisi näkyä ja kadota itsestään ~4s kuluttua. Lataa sivu uudelleen vielä kerran — toast EI saa näkyä toiseen kertaan (koska `celebratedStreak` on nyt päivittynyt).

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: juhlistus-infrastruktuuri ja streak-virstanpylväsjuhlistus"
```

---

### Task 6: PR-juhlistus (kohta 11)

**Files:**
- Modify: `index.html` (`saveSet()`, uusi PR-tarkistus)
- Modify: `index.html` (uusi `checkForPR()`-funktio ja `celebratedPRExercises`-muuttuja)

**Konteksti ennen muutosta** — `saveSet()`-funktio:

```js
function saveSet(o, d, e, s, field, value) {
  const st = getActiveSession(o, d);
  const k = eKey(o, d, st, e);
  if (!LD[k]) LD[k] = { sets: [] };
  if (!LD[k].sets[s]) LD[k].sets[s] = {};
  LD[k].sets[s][field] = value;
  saveLD();
  updateSetBox(o, d, e, s);

  // Käynnistä lepoajastin kun sarja on täysin tallennettu (kg + toistot)
  const sd = LD[k].sets[s];
  if (sd && sd.kg && sd.reps) startRestTimer();

  const timerKey = `${o}-${d}-${e}-${s}`;
  clearTimeout(syncTimers[timerKey]);
  syncTimers[timerKey] = setTimeout(() => {
    syncSet(o, d, e, s);
    delete syncTimers[timerKey];
  }, 500);
}
```

- [ ] **Step 1: Lisää `celebratedPRExercises`-muuttuja ja `checkForPR()`-funktio**

Lisää nämä heti `saveSet()`-funktion YLÄPUOLELLE (ennen `function saveSet(...)`-riviä):

```js
const celebratedPRExercises = new Set();

function checkForPR(o, d, st, e) {
  const sess = SESS[st];
  if (!sess || !sess.ex[e]) return;
  const exName = sess.ex[e].n;
  if (celebratedPRExercises.has(exName)) return;
  const prevSets = prevCache[exName];
  if (!prevSets || !prevSets.length) return;
  const prevMax = Math.max(...prevSets.map(s => s.weight_kg || 0));
  if (prevMax <= 0) return;

  const k = eKey(o, d, st, e);
  const currentSets = (LD[k] && LD[k].sets) || [];
  const currentWeights = currentSets.map(s => parseFloat(s && s.kg)).filter(n => !isNaN(n));
  if (!currentWeights.length) return;
  const currentMax = Math.max(...currentWeights);

  if (currentMax > prevMax) {
    celebratedPRExercises.add(exName);
    showCelebrationToast('🏆', 'Uusi ennätys!', `${escapeHtml(exName)} ${currentMax}kg`, 'pr');
  }
}
```

Huom: `exName` tulee samasta `exercises`-lähteestä kuin Task 2:n `escapeHtml()`-käärintä koski — sama varotoimi tarvitaan tässäkin, koska teksti upotetaan `showCelebrationToast()`:n kautta HTML:ksi (`toast.innerHTML`).

- [ ] **Step 2: Kutsu `checkForPR()` `saveSet()`:stä**

Korvaa `saveSet()`-funktio:

```js
function saveSet(o, d, e, s, field, value) {
  const st = getActiveSession(o, d);
  const k = eKey(o, d, st, e);
  if (!LD[k]) LD[k] = { sets: [] };
  if (!LD[k].sets[s]) LD[k].sets[s] = {};
  LD[k].sets[s][field] = value;
  saveLD();
  updateSetBox(o, d, e, s);

  // Käynnistä lepoajastin kun sarja on täysin tallennettu (kg + toistot)
  const sd = LD[k].sets[s];
  if (sd && sd.kg && sd.reps) startRestTimer();

  const timerKey = `${o}-${d}-${e}-${s}`;
  clearTimeout(syncTimers[timerKey]);
  syncTimers[timerKey] = setTimeout(() => {
    syncSet(o, d, e, s);
    delete syncTimers[timerKey];
  }, 500);
}
```

tällä (lisää `checkForPR(o, d, st, e);` -kutsu):

```js
function saveSet(o, d, e, s, field, value) {
  const st = getActiveSession(o, d);
  const k = eKey(o, d, st, e);
  if (!LD[k]) LD[k] = { sets: [] };
  if (!LD[k].sets[s]) LD[k].sets[s] = {};
  LD[k].sets[s][field] = value;
  saveLD();
  updateSetBox(o, d, e, s);

  // Käynnistä lepoajastin kun sarja on täysin tallennettu (kg + toistot)
  const sd = LD[k].sets[s];
  if (sd && sd.kg && sd.reps) startRestTimer();

  checkForPR(o, d, st, e);

  const timerKey = `${o}-${d}-${e}-${s}`;
  clearTimeout(syncTimers[timerKey]);
  syncTimers[timerKey] = setTimeout(() => {
    syncSet(o, d, e, s);
    delete syncTimers[timerKey];
  }, 500);
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Sali-sivulla, liikkeelle jolla on edellisen session dataa (`prevCache`-tila näkyy "EDELL."-sarakkeessa sarjataulukossa), syötä paino joka ylittää edellisen session korkeimman painon kyseiselle liikkeelle. Tarkista että sininen/violetti PR-toast ilmestyy välittömästi kentän tallennuksen (onchange) yhteydessä, näyttäen liikkeen nimen ja uuden painon. Syötä toinen vielä korkeampi paino samalle liikkeelle samassa sessiossa — toast EI saa ilmestyä uudelleen (dedupetty per liike per sivulataus).

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: PR-juhlistus live-tarkistuksella"
```

---

### Task 7: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko osaprojektin läpikäynti selaimessa**

Käy läpi kaikki kuusi ominaisuutta yhdessä istunnossa: "Tällä viikolla" -kortti mittareineen ja oivalluksineen, streak- ja PR-toastit, Koonti-korttien tilat, skeleton-loaderit. Tarkista ettei mikään aiempi Koonti-toiminnallisuus (onboarding-kortti, hero-metrics, muut kortit) ole rikkoutunut. Tarkista konsoli koko ajan.

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.11.0` arvoon `v1.12.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.12.0: raportointi, motivointi ja Koonti-kiillotus"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Kaikki neljä speksin osaa (viikkoraportti+oivallukset, streak+PR-juhlistus, korttihierarkia, skeleton-loaderit) on katettu Task 1–6:ssa, testaus Task 7:ssä. Kohta 17 jätetty pois speksin mukaisesti.
- **Tyyppijohdonmukaisuus:** `showCelebrationToast(icon, title, sub, type)` -signatuuria käytetään identtisesti Task 5:ssä (streak, ei type-parametria) ja Task 6:ssa (PR, `type='pr'`). `checkForPR(o, d, st, e)` käyttää samoja parametrinimiä kuin `saveSet(o, d, e, s, ...)`, `eKey(o, d, st, e)`. `getWeekStats(offset)` palauttaa saman `{gymDays, actCount, totalKm, avgSleep, weightDelta}`-muodon jota sekä Task 1 (rows) että Task 2 (ei suoraan, mutta samat kentät) käyttävät johdonmukaisesti.
- **Tehtävien järjestys:** Task 1→2→3→4 rakentuvat samaan `loadKoonti()`-funktioon peräkkäin — jokainen tehtävä olettaa edellisen jo sovelletuksi (esim. Task 3:n "Konteksti ennen muutosta" -lohkot näyttävät Task 1/2:n jälkeisen tilan, Task 4:n lohkot näyttävät Task 3:n jälkeisen tilan). Task 5→6 rakentuvat samoin peräkkäin.
- **Ei placeholdereita:** Kaikki koodilohkot ovat täydellisiä, ei TBD/TODO-merkintöjä.
