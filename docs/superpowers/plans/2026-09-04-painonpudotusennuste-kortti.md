# Painonpudotusennuste omana korttina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the weight-loss forecast out of the combined weight/fat%/muscle% chart on the Keho page into its own card with plain-language stat tiles and a month-by-month navigable chart that also shows, for past months, what the model would have predicted back then.

**Architecture:** Pure front-end change inside the single-file app `index.html`. No new database tables/columns — reuses `body_metrics`, `user_profile.target_weight_kg`, and `model_calibration` exactly as they are today, and reuses the existing `getBodyComposition()`/`calculateMaintenance()`/`simulateToTarget()` functions unchanged. The only generalized existing function is `getRecentAvgWeeklyIntake()`, which gains an optional "as of" date parameter (default unchanged) so it can also be used for historical retrodiction.

**Tech Stack:** Vanilla JS, template-literal HTML rendering, Chart.js (already loaded and used by `charts.body`/`charts.forecast` pattern). No build step.

---

## File Structure

Everything lives in one file:
- **Modify: `index.html`**
  - HTML body (~line 1357): remove `#m-forecast`; add a new `#forecast-card`/`#forecast-body` container after the existing "Kehitys" card on the Keho page.
  - JS (~line 1729): add `forecastState`/`forecastMonthOffset` module-level state.
  - JS (~line 3231-3338, `loadBodyMetrics()`): remove old forecast text/dataset logic, keep computing `forecast`, hand off to the new state + `renderForecastCard()`.
  - JS (new, near `loadBodyMetrics()`): `forecastMonthBounds()`, `changeForecastMonth()`, `renderForecastCard()`, `computeHistoricalForecast()`.
  - JS (~line 3457, `getRecentAvgWeeklyIntake()`): add optional `asOfIso` parameter.

No new files — this is a small, single-surface addition to an existing page, matching the app's single-file convention.

---

### Task 1: Remove the old forecast rendering, add new state

**Files:**
- Modify: `index.html:1357` (HTML — remove `#m-forecast`)
- Modify: `index.html:1729` (JS — add state variables)
- Modify: `index.html:3247-3318` (JS, inside `loadBodyMetrics()`)

Note: line numbers are current as of this plan being written — verify by grepping for the quoted text before editing, since earlier tasks in this same plan will shift later line numbers.

- [ ] **Step 1: Remove the `#m-forecast` element**

Find in `index.html` (around line 1354-1358):
```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
      <div id="m-forecast" class="kc-week-budget-sub" style="margin-top:10px;"></div>
    </div>
```
Change to:
```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
```

- [ ] **Step 2: Add module-level state**

Find:
```js
const charts = {};
```
Add immediately after it:
```js
let forecastState = null;        // { latest, profile, forecast } tai null
let forecastMonthOffset = 0;     // 0 = kuluva kuukausi, negatiivinen = mennyt, positiivinen = tuleva
```

- [ ] **Step 3: Simplify `loadBodyMetrics()` — remove old forecast text + chart-overlay, keep computing `forecast`**

Find this whole block (from the `forecastEl` declaration through the end of the `if (hist && hist.length > 1)` block's dataset-building, right before `charts.body = new Chart(...)`):
```js
  const forecastEl = document.getElementById('m-forecast');
  let forecast = null;
  if (forecastEl) {
    if (!profile || profile.target_weight_kg == null) {
      forecastEl.innerHTML = `Aseta tavoitepaino <a href="#" onclick="openProfileModal();return false;" style="color:var(--accent)">profiilissa</a> nähdäksesi ennusteen`;
    } else if (!latest || latest.fat_pct == null || latest.muscle_pct == null) {
      forecastEl.textContent = 'Kirjaa paino, rasva% ja lihas% nähdäksesi ennusteen';
    } else {
      const comp = getBodyComposition(latest.weight_kg, latest.fat_pct, latest.muscle_pct);
      const [{ data: calRows }, weeklyIntakeKcal] = await Promise.all([
        sb.from('model_calibration').select('*').order('calibrated_at', { ascending: false }).limit(1),
        getRecentAvgWeeklyIntake(),
      ]);
      const cal = calRows && calRows[0];
      const otherTissueCoeff = cal ? cal.other_tissue_kcal_per_kg : DEFAULT_OTHER_TISSUE_COEFF;
      const activityMult = cal ? cal.activity_multiplier : DEFAULT_ACTIVITY_MULT;

      forecast = simulateToTarget({
        fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg,
        targetWeightKg: profile.target_weight_kg,
        weeklyIntakeKcal, otherTissueCoeff, activityMult,
      });

      const calStr = cal
        ? `Malli kalibroitu ${new Date(cal.calibrated_at).toLocaleDateString('fi-FI')}`
        : 'Ei vielä kalibroitu — käytetään oletusarvoja';

      if (forecast.weeksToTarget >= 150) {
        forecastEl.textContent = `Nykyisellä syömistahdilla tavoitetta ei saavuteta ennustejaksolla · ${calStr}`;
      } else {
        const etaDate = new Date();
        etaDate.setDate(etaDate.getDate() + forecast.weeksToTarget * 7);
        const etaStr = etaDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
        forecastEl.textContent = `Ennuste: ${forecast.weeksToTarget} viikkoa (${etaStr}) · ${calStr}`;
      }
    }
  }

  if (hist && hist.length > 1) {
    if (charts.body) charts.body.destroy();
    const histLabels = [...hist].reverse().map(d => d.measured_at.slice(5));
    const histWeights = [...hist].reverse().map(d => d.weight_kg);
    const histFat = [...hist].reverse().map(d => d.fat_pct);
    const histMuscle = [...hist].reverse().map(d => d.muscle_pct);

    let labels = histLabels, weightData = histWeights, fatData = histFat, muscleData = histMuscle, forecastData = null;
    if (forecast && forecast.rows.length && forecast.weeksToTarget < 150) {
      const lastDate = new Date(latest.measured_at);
      const forecastLabels = forecast.rows.map(r => {
        const d = new Date(lastDate);
        d.setDate(lastDate.getDate() + r.week * 7);
        return localIso(d).slice(5);
      });
      labels = [...histLabels, ...forecastLabels];
      weightData = [...histWeights, ...forecastLabels.map(() => null)];
      fatData = [...histFat, ...forecastLabels.map(() => null)];
      muscleData = [...histMuscle, ...forecastLabels.map(() => null)];
      forecastData = [
        ...histWeights.slice(0, -1).map(() => null),
        histWeights[histWeights.length - 1],
        ...forecast.rows.map(r => r.totalWeight),
      ];
    }

    const datasets = [
      { label:'Paino',  data: weightData, borderColor:'#1D9E75', borderWidth:2, pointRadius:3, pointBackgroundColor:'#1D9E75', tension:.3, fill:false, yAxisID:'y1' },
      { label:'Rasva%', data: fatData,    borderColor:'#378ADD', borderWidth:2, pointRadius:3, pointBackgroundColor:'#378ADD', tension:.3, fill:false, yAxisID:'y2' },
      { label:'Lihas%', data: muscleData, borderColor:'#EF9F27', borderWidth:2, pointRadius:3, pointBackgroundColor:'#EF9F27', tension:.3, fill:false, yAxisID:'y2' },
    ];
    if (forecastData) {
      datasets.push({ label:'Ennuste', data: forecastData, borderColor:'rgba(29,158,117,0.5)', borderDash:[5,5], borderWidth:2, pointRadius:0, tension:.3, fill:false, yAxisID:'y1' });
    }
```
Replace with:
```js
  let forecast = null;
  const hasTarget = profile && profile.target_weight_kg != null;
  const hasComposition = latest && latest.fat_pct != null && latest.muscle_pct != null;
  if (hasTarget && hasComposition) {
    const comp = getBodyComposition(latest.weight_kg, latest.fat_pct, latest.muscle_pct);
    const [{ data: calRows }, weeklyIntakeKcal] = await Promise.all([
      sb.from('model_calibration').select('*').order('calibrated_at', { ascending: false }).limit(1),
      getRecentAvgWeeklyIntake(),
    ]);
    const cal = calRows && calRows[0];
    const otherTissueCoeff = cal ? cal.other_tissue_kcal_per_kg : DEFAULT_OTHER_TISSUE_COEFF;
    const activityMult = cal ? cal.activity_multiplier : DEFAULT_ACTIVITY_MULT;
    forecast = simulateToTarget({
      fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg,
      targetWeightKg: profile.target_weight_kg,
      weeklyIntakeKcal, otherTissueCoeff, activityMult,
    });
  }

  forecastState = (hasTarget && hasComposition) ? { latest, profile, forecast } : null;
  forecastMonthOffset = 0;
  renderForecastCard();

  if (hist && hist.length > 1) {
    if (charts.body) charts.body.destroy();
    const histLabels = [...hist].reverse().map(d => d.measured_at.slice(5));
    const histWeights = [...hist].reverse().map(d => d.weight_kg);
    const histFat = [...hist].reverse().map(d => d.fat_pct);
    const histMuscle = [...hist].reverse().map(d => d.muscle_pct);

    const datasets = [
      { label:'Paino',  data: histWeights, borderColor:'#1D9E75', borderWidth:2, pointRadius:3, pointBackgroundColor:'#1D9E75', tension:.3, fill:false, yAxisID:'y1' },
      { label:'Rasva%', data: histFat,    borderColor:'#378ADD', borderWidth:2, pointRadius:3, pointBackgroundColor:'#378ADD', tension:.3, fill:false, yAxisID:'y2' },
      { label:'Lihas%', data: histMuscle, borderColor:'#EF9F27', borderWidth:2, pointRadius:3, pointBackgroundColor:'#EF9F27', tension:.3, fill:false, yAxisID:'y2' },
    ];
```
(the rest of the function — `charts.body = new Chart(document.getElementById('body-chart'), { ... labels, datasets ... })` and everything after — stays exactly as it already is; `labels` in that `Chart` call now refers to `histLabels` directly, so also change the one remaining `data: { labels, datasets }` line's `labels` reference to `histLabels`: find `data: { labels, datasets },` and change to `data: { labels: histLabels, datasets },`).

`renderForecastCard` does not exist yet — it's added in Task 3. This task will leave a temporary `ReferenceError` if you try to load the page now; that's expected and fixed by Task 3. Don't add a stub function here — Task 3 owns that.

- [ ] **Step 4: Verify (partial — full flow not testable until Task 3)**

```bash
grep -n "m-forecast\|forecastState\|forecastMonthOffset" index.html
```
Confirm: zero matches for `m-forecast`, and `forecastState`/`forecastMonthOffset` each appear where expected (declaration + the three new usages in `loadBodyMetrics`).

```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task1.js && node --check /tmp/task1.js
```
This is expected to **pass** (a missing function is a runtime `ReferenceError`, not a syntax error — `node --check` only validates syntax). Confirming no syntax errors is the correct bar for this intermediate step.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
refactor(painonpudotusennuste): remove forecast overlay from body chart

Prepares for a dedicated forecast card (next commits) by stripping the
dashed forecast line and text summary out of the combined weight/fat%/
muscle% chart, which becomes pure history again. forecast computation
itself is kept and handed off to new module-level state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 2: New card HTML, generalized intake helper, historical forecast function

**Files:**
- Modify: `index.html:1358` (HTML — new card, right after the "Kehitys" card, before `#page-keho`'s closing `</div>`)
- Modify: `index.html` (JS, `getRecentAvgWeeklyIntake()`)
- Modify: `index.html` (JS, new functions near `loadBodyMetrics()`)

- [ ] **Step 1: Add the new card container**

Find (this is now right after Task 1's edit, so it should look exactly like this):
```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
</div>

<!-- ── UNI ────────────────────────────────────────────────────── -->
```
Change to:
```html
    <div class="card">
      <div class="card-title">Kehitys</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>
    <div class="card" id="forecast-card">
      <div class="card-title">Painonpudotusennuste</div>
      <div id="forecast-body"></div>
    </div>
</div>

<!-- ── UNI ────────────────────────────────────────────────────── -->
```

- [ ] **Step 2: Generalize `getRecentAvgWeeklyIntake()`**

Find:
```js
async function getRecentAvgWeeklyIntake() {
  const to = localIso(new Date());
  const from = localIso(addDays(new Date(), -20));
  const totalKcal = await getFoodCalories(from, to);
  return totalKcal / 3;
}
```
Replace with:
```js
async function getRecentAvgWeeklyIntake(asOfIso = localIso(new Date())) {
  const to = asOfIso;
  const from = localIso(addDays(asOfIso, -20));
  const totalKcal = await getFoodCalories(from, to);
  return totalKcal / 3;
}
```
(`addDays` already accepts a string or a `Date` — confirmed by reading its definition, `new Date(base)` inside — so passing `asOfIso` directly works.)

- [ ] **Step 3: Add `forecastMonthBounds()`, `changeForecastMonth()`, `computeHistoricalForecast()`**

Find the `getRecentAvgWeeklyIntake` function you just edited, and add these three new functions immediately after it:
```js
function forecastMonthBounds(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    startIso: localIso(start),
    endIso: localIso(end),
    label: start.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' }),
  };
}

function changeForecastMonth(dir) {
  forecastMonthOffset += dir;
  renderForecastCard();
}

async function computeHistoricalForecast(cutoffIso, targetWeightKg) {
  const [{ data: priorMetrics }, { data: priorCal }] = await Promise.all([
    sb.from('body_metrics').select('*').lt('measured_at', cutoffIso).order('measured_at', { ascending: false }).limit(1),
    sb.from('model_calibration').select('*').lte('calibrated_at', cutoffIso).order('calibrated_at', { ascending: false }).limit(1),
  ]);
  const metric = priorMetrics && priorMetrics[0];
  if (!metric || metric.fat_pct == null || metric.muscle_pct == null) return null;

  const cal = priorCal && priorCal[0];
  const otherTissueCoeff = cal ? cal.other_tissue_kcal_per_kg : DEFAULT_OTHER_TISSUE_COEFF;
  const activityMult = cal ? cal.activity_multiplier : DEFAULT_ACTIVITY_MULT;
  const weeklyIntakeKcal = await getRecentAvgWeeklyIntake(cutoffIso);
  const comp = getBodyComposition(metric.weight_kg, metric.fat_pct, metric.muscle_pct);
  const { rows } = simulateToTarget({
    fatKg: comp.fatKg, muscleKg: comp.muscleKg, otherKg: comp.otherKg,
    targetWeightKg, weeklyIntakeKcal, otherTissueCoeff, activityMult,
  });
  return { startDate: metric.measured_at, rows };
}
```

- [ ] **Step 4: Verify**

```bash
grep -n "forecastMonthBounds\|changeForecastMonth\|computeHistoricalForecast\|forecast-card\|forecast-body" index.html
```
Confirm each new identifier appears where expected (one function/element definition each; `changeForecastMonth` will get its `onclick` usage in Task 3).

```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task2.js && node --check /tmp/task2.js
```
Confirm no syntax errors (still expected to pass — `renderForecastCard` still doesn't exist yet, but that's a runtime concern, not a syntax one, exactly like Task 1).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(painonpudotusennuste): add forecast card container and helpers

Adds the new card's HTML shell, generalizes getRecentAvgWeeklyIntake()
to accept a historical as-of date, and adds the month-bounds/navigation/
retrospective-forecast helper functions the card's renderer will use.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 3: `renderForecastCard()` — empty states, stat tiles, month nav

**Files:**
- Modify: `index.html` (JS, new function near `computeHistoricalForecast()`)

- [ ] **Step 1: Add `renderForecastCard()` (without the chart yet — chart is Task 4)**

Add this new function immediately after `computeHistoricalForecast()`:
```js
async function renderForecastCard() {
  const el = document.getElementById('forecast-body');
  if (!el) return;

  if (!forecastState) {
    const profile = await loadUserProfile();
    el.innerHTML = (!profile || profile.target_weight_kg == null)
      ? `Aseta tavoitepaino <a href="#" onclick="openProfileModal();return false;" style="color:var(--accent)">profiilissa</a> nähdäksesi ennusteen`
      : 'Kirjaa paino, rasva% ja lihas% nähdäksesi ennusteen';
    return;
  }

  const { profile, forecast } = forecastState;
  const { startIso, endIso, label } = forecastMonthBounds(forecastMonthOffset);

  let statsHtml;
  if (!forecast || forecast.weeksToTarget >= 150) {
    statsHtml = `<div class="kc-week-budget-sub">Nykyisellä syömistahdilla tavoitetta ei saavuteta ennustejaksolla</div>`;
  } else {
    const etaDate = new Date();
    etaDate.setDate(etaDate.getDate() + forecast.weeksToTarget * 7);
    const etaStr = etaDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    const weeklyPaceKg = (-(forecast.rows[0].weeklyDeficit / KCAL_PER_KG_FAT_LOSS)).toFixed(1);
    statsHtml = `
      <div class="seuranta-hero-stats">
        <div><div class="seuranta-hero-stat-val">${etaStr}</div><div class="seuranta-hero-stat-label">arvioitu pvm</div></div>
        <div class="seuranta-hero-divider"></div>
        <div><div class="seuranta-hero-stat-val">${weeklyPaceKg}kg</div><div class="seuranta-hero-stat-label">/ viikko</div></div>
        <div class="seuranta-hero-divider"></div>
        <div><div class="seuranta-hero-stat-val">${forecast.weeksToTarget}</div><div class="seuranta-hero-stat-label">viikkoa jäljellä</div></div>
      </div>`;
  }

  el.innerHTML = `
    <div class="week-nav">
      <button class="week-btn" onclick="changeForecastMonth(-1)">←</button>
      <span class="week-label">${label}</span>
      <button class="week-btn" onclick="changeForecastMonth(1)">→</button>
    </div>
    <div class="chart-wrap"><canvas id="forecast-chart"></canvas></div>
    ${statsHtml}`;

  await renderForecastChart(startIso, endIso, profile, forecast);
}
```

`loadUserProfile()` is the existing function already used elsewhere in `loadBodyMetrics()` (via `Promise.all`) — confirm this by grepping for its definition before using it here; this step just calls it a second time, which is cheap and keeps `renderForecastCard()` self-contained (callable on its own, e.g. from `changeForecastMonth()`, without needing the caller to pass profile data through).

- [ ] **Step 2: Add a temporary stub for `renderForecastChart()`**

`renderForecastCard()` now calls `renderForecastChart(startIso, endIso, profile, forecast)`, which doesn't exist until Task 4. Add a temporary stub immediately after `renderForecastCard()` so this task is independently testable:
```js
async function renderForecastChart(startIso, endIso, profile, forecast) {
  // TODO(Task 4): build labels/datasets and render charts.forecast
}
```

- [ ] **Step 3: Manual verification**

```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task3.js && node --check /tmp/task3.js
```
Confirm no syntax errors.

There is no automated test suite for this project. A human will verify in-browser once Task 4 is done (the chart canvas will be empty until then, which is expected). For this task, confirm via code reading that:
- `grep -n "renderForecastCard\|renderForecastChart" index.html` shows the two new functions defined once each, plus `renderForecastCard`'s two existing call sites from Task 1 (`loadBodyMetrics()`).
- The stat-tile math (`weeklyPaceKg`) matches the spec: `-(forecast.rows[0].weeklyDeficit / KCAL_PER_KG_FAT_LOSS)`, negated so a calorie deficit (positive `weeklyDeficit`) shows as a negative (weight-loss) pace.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(painonpudotusennuste): render forecast card stats and month nav

Adds renderForecastCard() covering the two empty states (no target
weight / no body composition logged), the three plain-language stat
tiles, and the month navigation bar. Chart rendering itself is a
temporary stub, completed in the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

### Task 4: `renderForecastChart()` — the actual/live-forecast/historical-forecast chart

**Files:**
- Modify: `index.html` (JS — replace the `renderForecastChart()` stub from Task 3)

- [ ] **Step 1: Implement the chart**

Find:
```js
async function renderForecastChart(startIso, endIso, profile, forecast) {
  // TODO(Task 4): build labels/datasets and render charts.forecast
}
```
Replace with:
```js
async function renderForecastChart(startIso, endIso, profile, forecast) {
  const todayIso = localIso(new Date());

  const { data: monthActual } = await sb.from('body_metrics')
    .select('measured_at,weight_kg')
    .gte('measured_at', startIso).lte('measured_at', endIso)
    .order('measured_at');
  const actualByDate = {};
  (monthActual || []).forEach(r => { if (r.weight_kg != null) actualByDate[r.measured_at] = r.weight_kg; });

  const liveForecastByDate = {};
  if (forecast && forecast.rows.length && forecast.weeksToTarget < 150 && endIso >= todayIso) {
    const lastDate = new Date(forecastState.latest.measured_at);
    forecast.rows.forEach(r => {
      const d = new Date(lastDate);
      d.setDate(lastDate.getDate() + r.week * 7);
      const iso = localIso(d);
      if (iso >= startIso && iso <= endIso) liveForecastByDate[iso] = r.totalWeight;
    });
  }

  const historicalByDate = {};
  if (endIso < todayIso) {
    const historical = await computeHistoricalForecast(startIso, profile.target_weight_kg);
    if (historical) {
      const startDate = new Date(historical.startDate);
      historical.rows.forEach(r => {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + r.week * 7);
        const iso = localIso(d);
        if (iso >= startIso && iso <= endIso) historicalByDate[iso] = r.totalWeight;
      });
    }
  }

  const labels = [...new Set([
    ...Object.keys(actualByDate),
    ...Object.keys(liveForecastByDate),
    ...Object.keys(historicalByDate),
  ])].sort();

  if (charts.forecast) charts.forecast.destroy();
  if (!labels.length) {
    document.getElementById('forecast-chart').getContext('2d').clearRect(0, 0, 9999, 9999);
    return;
  }

  const actualData = labels.map(d => actualByDate[d] ?? null);
  const liveData = labels.map(d => liveForecastByDate[d] ?? null);
  const historicalData = labels.map(d => historicalByDate[d] ?? null);
  const hasLive = liveData.some(v => v != null);
  const hasHistorical = historicalData.some(v => v != null);

  const datasets = [
    { label: 'Toteuma', data: actualData, borderColor: '#1D9E75', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#1D9E75', tension: .3, fill: false },
  ];
  if (hasLive) {
    datasets.push({ label: 'Ennuste', data: liveData, borderColor: 'rgba(29,158,117,0.5)', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, tension: .3, fill: false });
  }
  if (hasHistorical) {
    datasets.push({ label: 'Mennyt ennuste', data: historicalData, borderColor: 'rgba(150,150,150,0.6)', borderDash: [2, 3], borderWidth: 1.5, pointRadius: 0, tension: .3, fill: false });
  }

  charts.forecast = new Chart(document.getElementById('forecast-chart'), {
    type: 'line',
    data: { labels: labels.map(d => d.slice(5)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: {
        y: { ticks: { color: '#555', font: { size: 10 } }, grid: { color: '#222' } },
        x: { ticks: { color: '#555', font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}
```

Notes for the implementer:
- `endIso >= todayIso` (string comparison) works correctly for `YYYY-MM-DD` ISO dates — lexical order matches chronological order.
- The empty-chart-with-no-labels branch (`if (!labels.length)`) avoids constructing a `Chart` with zero data points, matching the spec's "kuukausi jolta ei löydy dataa näyttää vain tyhjän kaavion, ei virhettä" requirement — clearing the canvas is enough since there's nothing to plot.
- `forecastState.latest` (used for the live-forecast date anchor) is safe to read here because `renderForecastChart()` is only ever called from `renderForecastCard()` after confirming `forecastState` is non-null.

- [ ] **Step 2: Manual verification**

```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/task4.js && node --check /tmp/task4.js
```
Confirm no syntax errors.

```bash
grep -n "TODO(Task 4)" index.html
```
Confirm zero matches (stub fully replaced).

This task completes the full feature — a human should now verify it end-to-end in a browser (no automated test suite exists for this project):

1. Open the Keho page. If no target weight is set: new card shows the "Aseta tavoitepaino" link, no chart/nav. Old "Kehitys" chart above it shows plain weight/fat%/muscle% history with no forecast line and no leftover `#m-forecast` text.
2. Set a target weight and confirm at least one `body_metrics` row has weight/fat%/muscle% logged. Reload — new card shows three stat tiles and a chart for the current month: solid actual line up to today, dashed forecast line from today forward.
3. Click "→" — chart updates to next month, entirely dashed (no actual data yet), stat tiles unchanged.
4. Click "←" repeatedly back to a month with both a real measurement and at least one earlier measurement before that month started — chart shows both "Toteuma" (solid) and "Mennyt ennuste" (dotted) for that month.
5. Click "←" past the earliest ever logged measurement — chart area is empty, no console error, nav still works.
6. Set an impossible target (higher than current weight) — stat tiles are replaced by the "ei saavuteta" message; no dashed future line appears on any month, but past-month solid/dotted comparison still renders.
7. Check the browser console for errors throughout, especially on each month-nav click (each one fires a new Supabase query).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(painonpudotusennuste): render actual/forecast/retrospective chart

Completes the forecast card: plots real weigh-ins, the live forecast
toward the target from today forward, and (for fully past months) a
retrospective line showing what the model would have predicted back
then, computed on demand from historical body_metrics/calibration/food
data with no new storage.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BMrcPH7kSdLpGnn3eDVphq
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (old chart cleanup) → Task 1. §2.1-2.4 (state, nav, empty states, stat tiles) → Tasks 2-3. §2.5-2.6 (chart, historical forecast) → Tasks 2 & 4. Rajaus items (no new tables, no changes to `simulateToTarget`/etc., no changes to the hero section) are respected — no task touches those.
- **Placeholder scan:** the only `TODO` is the intentional, temporary Task 3→4 stub, explicitly checked-for-removal in Task 4 Step 2. No other placeholders.
- **Type/name consistency:** `forecastState`, `forecastMonthOffset`, `forecastMonthBounds`, `changeForecastMonth`, `computeHistoricalForecast`, `renderForecastCard`, `renderForecastChart` are each introduced once and referenced identically everywhere they're used across tasks.
