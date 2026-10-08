# Chart polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All 9 Chart.js charts share one validated visual system (palette, monotone lines, Finnish dates/numbers, recessive axes, consistent tooltips, reference lines), the body chart's dual axis becomes two charts, the forecast becomes continuous, and steps become bars with a goal line.

**Architecture:** A small "KAAVIOT" helper module in index.html (`CHART_COLORS`, `fmtNum`, `fmtDayShort`, `fmtDayLong`, `lineDataset`, `referenceLineDataset`, `baseChartOptions`) that every `new Chart(...)` builds from. Charts whose x labels are dates pass full ISO dates (`YYYY-MM-DD`) as labels and let the helper format ticks and tooltip titles.

**Tech Stack:** Single-file vanilla JS PWA (`index.html`), Chart.js 4.4.1 (already loaded), Supabase. No test framework; verification = `node --check` of the extracted inline script + controller browser screenshots.

**Spec:** `docs/superpowers/specs/2026-10-08-chart-polish-design.md`

## Global Constraints

- Target app: **main** (branch `feature/chart-polish` off `main`; ships via PR).
- **index.html uses CRLF line endings on every line — keep them.** Before each commit: `echo $(wc -l < index.html) $(grep -c $'\r$' index.html)` prints two equal numbers; `git diff --stat` shows only the intended lines.
- **Main uses the real Supabase database. Implementers never run the app, open a browser or curl Supabase.** Browser verification is done by the controller with every non-GET request intercepted.
- Palette (validated, dark surface `#121214`): slot 1 `#10a2b0`, slot 2 `#c98500`, slot 3 `#9085e9`, reference `#8a8a93`. Green/red are not series colours.
- Lines 2 px, `cubicInterpolationMode: 'monotone'`, never `tension`. Points radius 3 when ≤ 20 points, else 0 (hover 5). x ticks never rotated (`maxRotation: 0`, `maxTicksLimit: 6`).
- Dates: axis `8.10.`, tooltip title `ke 8.10.2026`. Numbers: `Intl.NumberFormat('fi-FI')`.
- Legend only for ≥ 2 data series (or a data series + reference line). Text never in series colour.
- Syntax check: extract with python (`open(path, newline='')`, `re.findall(r'<script>(.*?)</script>', text, re.S)`) to the session scratchpad `app.js`, then `node --check`.
- Untracked user files (`samantha_openclaw_tutkimus.md`, `transcript_804.md`, `supabase/.temp/`) are never touched; `git add` exact paths.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Shared chart helpers

**Files:** Modify `index.html` — insert directly before the line `const syncTimers = {};` (~line 1978, where `const charts = {};` lives) a new block.

**Interfaces — Produces:** `CHART_COLORS`, `fmtNum(v, unit)`, `fmtDayShort(iso)`, `fmtDayLong(iso)`, `lineDataset(label, data, color, extra)`, `referenceLineDataset(label, value, n)`, `baseChartOptions({ dateLabels, unit, legend, y, x })`.

- [ ] **Step 1: Add the block**

```js
/* ═══ KAAVIOT — yhteinen ilme ═══════════════════════════════════
   Palette validated with the dataviz skill (validate_palette.js --mode dark --surface #121214):
   lightness band, chroma, CVD separation, normal-vision floor and contrast all pass.
   Every chart builds its datasets/options from these helpers so the app has one look. */
const CHART_COLORS = { s1: '#10a2b0', s2: '#c98500', s3: '#9085e9', ref: '#8a8a93', tick: '#8a8a93', grid: 'rgba(255,255,255,0.06)' };
const CHART_FONT = { size: 10 };
const FI_NUM = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });
function fmtNum(v, unit = '') { return v == null || isNaN(v) ? '—' : FI_NUM.format(v) + unit; }
function isoToLocalDate(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDayShort(iso) { const d = isoToLocalDate(iso); return `${d.getDate()}.${d.getMonth() + 1}.`; }
function fmtDayLong(iso) {
  const d = isoToLocalDate(iso);
  return `${d.toLocaleDateString('fi-FI', { weekday: 'short' })} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

// A line series in the shared style. Dense series (> 20 points) hide points until hovered.
function lineDataset(label, data, color = CHART_COLORS.s1, extra = {}) {
  const dense = data.filter(v => v != null).length > 20;
  return {
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2,
    pointRadius: dense ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: color, pointBorderWidth: 0,
    cubicInterpolationMode: 'monotone', fill: false, spanGaps: true, ...extra,
  };
}

// Dashed horizontal goal/target line spanning all n labels.
function referenceLineDataset(label, value, n) {
  return {
    type: 'line', label, data: Array(n).fill(value), isReference: true,
    borderColor: CHART_COLORS.ref, backgroundColor: CHART_COLORS.ref, borderWidth: 1.5, borderDash: [6, 4],
    pointRadius: 0, pointHoverRadius: 0, fill: false, order: 10,
  };
}

// Shared options. dateLabels: labels are ISO dates (formatted here). unit: appended to values.
// y / x: merged into the scale (e.g. { min, max, reverse, title }).
function baseChartOptions({ dateLabels = false, unit = '', legend = false, y = {}, x = {} } = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        labels: { color: CHART_COLORS.tick, font: CHART_FONT, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 },
      },
      tooltip: {
        callbacks: {
          title: items => (items.length ? (dateLabels ? fmtDayLong(items[0].label) : items[0].label) : ''),
          label: item => `${item.dataset.label}: ${fmtNum(item.parsed.y, unit)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: {
          color: CHART_COLORS.tick, font: CHART_FONT, maxRotation: 0, autoSkip: true, maxTicksLimit: 6,
          ...(dateLabels ? { callback(v) { return fmtDayShort(this.getLabelForValue(v)); } } : {}),
        },
        ...x,
      },
      y: {
        grid: { color: CHART_COLORS.grid }, border: { display: false },
        ticks: { color: CHART_COLORS.tick, font: CHART_FONT, maxTicksLimit: 6, callback: v => fmtNum(v, unit) },
        ...y,
      },
    },
  };
}
```

- [ ] **Step 2: Verify** — syntax check passes; CRLF counts equal.
- [ ] **Step 3: Commit** — `feat(kaaviot): yhteiset kaavioapurit ja validoitu paletti`

---

### Task 2: Body charts — weight chart + composition chart (no dual axis)

**Files:** Modify `index.html` — Keho markup (`<div class="chart-wrap"><canvas id="body-chart"></canvas></div>`, ~line 1514) and the chart block at the end of `loadBodyMetrics()` (`if (hist && hist.length > 1) { … }`).

**Interfaces — Consumes:** Task 1 helpers; existing `shown`, `weekLabel`, `labels`, `round1`, `profile` inside `loadBodyMetrics`.

- [ ] **Step 1: Markup** — replace

```html
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
```
with
```html
      <div class="chart-subtitle">Paino (kg)</div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
      <div class="chart-subtitle" style="margin-top:14px">Rasva% ja lihas%</div>
      <div class="chart-wrap" style="height:150px"><canvas id="body-comp-chart"></canvas></div>
```
and add CSS next to `.chart-wrap { … }`:
```css
.chart-subtitle { font-size: var(--fs-xs); color: var(--text3); margin: 4px 0 6px; }
```

- [ ] **Step 2: Replace the chart block** — inside `if (hist && hist.length > 1) {`, keep the `shown` / `thisYear` / `weekLabel` / `labels` lines, delete the `metrics` array, the `datasets` building loop and the single `charts.body = new Chart(...)`, and insert:

```js
    if (charts.bodyComp) charts.bodyComp.destroy();
    // Faded individual measurements behind a weekly line, stacked on their week.
    const dotsFor = (field, color) => ({
      label: 'Mittaus', kind: 'measurement', showLine: false, order: 2,
      data: shown.flatMap(w => w.measurements.filter(r => r[field] != null)
        .map(r => ({ x: weekLabel(w), y: Number(r[field]), date: r.measured_at }))),
      pointRadius: 3, pointHoverRadius: 4, borderWidth: 0, pointBackgroundColor: color + '66', pointBorderColor: 'transparent',
    });
    const weekLine = (label, field, color) => lineDataset(label, shown.map(w => (w[field] != null ? round1(w[field]) : null)), color, {
      kind: 'week', order: 1, counts: shown.map(w => w.measurements.filter(r => r[field] != null).length),
    });
    // Tooltip: week title, count per weekly value, date per individual measurement.
    const bodyTooltip = unit => ({
      callbacks: {
        title: items => { const w = shown[items[0].dataIndex]; return items[0].dataset.kind === 'week' && w ? `Vk ${w.week}/${w.year}` : items[0].label; },
        label: item => {
          const ds = item.dataset;
          if (ds.isReference) return `${ds.label}: ${fmtNum(item.parsed.y, unit)}`;
          if (ds.kind === 'measurement') { const p = ds.data[item.dataIndex]; return `${fmtDayShort(p.date)}: ${fmtNum(p.y, unit)}`; }
          const n = ds.counts[item.dataIndex];
          return `${ds.label}: ${fmtNum(item.parsed.y, unit)} (${n} ${n === 1 ? 'mittaus' : 'mittausta'})`;
        },
      },
    });

    const weightSets = [weekLine('Paino', 'weight_kg', CHART_COLORS.s1), dotsFor('weight_kg', CHART_COLORS.s1)];
    const target = profile && profile.target_weight_kg != null ? Number(profile.target_weight_kg) : null;
    if (target != null) weightSets.push(referenceLineDataset('Tavoitepaino', target, labels.length));
    const weightOpts = baseChartOptions({ unit: ' kg', legend: target != null });
    weightOpts.interaction = { mode: 'nearest', intersect: false };
    weightOpts.plugins.legend.labels.filter = item => weightSets[item.datasetIndex].kind !== 'measurement';
    weightOpts.plugins.tooltip = bodyTooltip(' kg');
    charts.body = new Chart(document.getElementById('body-chart'), { type: 'line', data: { labels, datasets: weightSets }, options: weightOpts });

    const compSets = [
      weekLine('Rasva%', 'fat_pct', CHART_COLORS.s1), dotsFor('fat_pct', CHART_COLORS.s1),
      weekLine('Lihas%', 'muscle_pct', CHART_COLORS.s2), dotsFor('muscle_pct', CHART_COLORS.s2),
    ];
    const compOpts = baseChartOptions({ unit: ' %', legend: true });
    compOpts.interaction = { mode: 'nearest', intersect: false };
    compOpts.plugins.legend.labels.filter = item => compSets[item.datasetIndex].kind !== 'measurement';
    compOpts.plugins.legend.onClick = (e, item, legend) => {
      const chart = legend.chart, hide = chart.isDatasetVisible(item.datasetIndex);
      [item.datasetIndex, item.datasetIndex + 1].forEach(i => chart.setDatasetVisibility(i, !hide));
      chart.update();
    };
    compOpts.plugins.tooltip = bodyTooltip(' %');
    charts.bodyComp = new Chart(document.getElementById('body-comp-chart'), { type: 'line', data: { labels, datasets: compSets }, options: compOpts });
```

(The `if (charts.body) charts.body.destroy();` line at the top of the block stays. `interaction.mode: 'nearest'` shows one point per hover, so no tooltip filter is needed.)

- [ ] **Step 3: Verify** — syntax check; CRLF counts equal; `grep -n "yAxisID: 'y2'\|y2:" index.html` returns nothing in `loadBodyMetrics`.
- [ ] **Step 4: Commit** — `feat(keho): paino ja koostumus omiin kaavioihin`

---

### Task 3: Forecast chart — continuous, target line, shared style

**Files:** Modify `index.html` — `renderForecastChart(startIso, endIso, profile, forecast)`.

- [ ] **Step 1: Continuity point** — after the `forecast.rows.forEach(...)` that fills `liveForecastByDate`, still inside the same `if`, add:

```js
    // Start the forecast line at the latest actual value so actual → forecast is one continuous path.
    const startIsoLive = forecastState.latest.measured_at;
    if (startIsoLive >= startIso && startIsoLive <= endIso && forecastState.latest.weight_kg != null) {
      liveForecastByDate[startIsoLive] = round1(forecastState.latest.weight_kg);
    }
```

- [ ] **Step 2: Datasets + options** — replace the `const datasets = [ … ];` block, the two `if (hasLive/hasHistorical) datasets.push(...)` and the `charts.forecast = new Chart(...)` call with:

```js
  const datasets = [lineDataset('Toteuma', actualData, CHART_COLORS.s1)];
  if (hasLive) datasets.push(lineDataset('Ennuste', liveData, CHART_COLORS.s2, { borderDash: [6, 4], pointRadius: 0 }));
  if (hasHistorical) datasets.push(lineDataset('Mennyt ennuste', historicalData, CHART_COLORS.ref, { borderDash: [2, 3], borderWidth: 1.5, pointRadius: 0 }));
  if (profile && profile.target_weight_kg != null) datasets.push(referenceLineDataset('Tavoitepaino', Number(profile.target_weight_kg), labels.length));

  charts.forecast = new Chart(document.getElementById('forecast-chart'), {
    type: 'line',
    data: { labels, datasets },
    options: baseChartOptions({ dateLabels: true, unit: ' kg', legend: true }),
  });
```
Note `labels` (ISO dates) is passed directly — the old `labels.map(d => d.slice(5))` is gone.

- [ ] **Step 3: Verify** — syntax check; CRLF.
- [ ] **Step 4: Commit** — `feat(ennuste): jatkuva ennusteviiva, tavoitepaino, yhteinen tyyli`

---

### Task 4: Sleep line + steps bars

**Files:** Modify `index.html` — chart part of `loadSleep()` and of `openStepsModal()`.

- [ ] **Step 1: Sleep** — replace the `charts.sleep = new Chart(...)` call with:

```js
    const sleepRows = [...chartData].reverse();
    const scores = sleepRows.map(d => d.sleep_score);
    const yMin = Math.max(0, Math.floor((Math.min(...scores) - 5) / 10) * 10);
    charts.sleep = new Chart(document.getElementById('sleep-chart'), {
      type: 'line',
      data: { labels: sleepRows.map(d => d.sleep_date), datasets: [lineDataset('Unipisteet', scores)] },
      options: baseChartOptions({ dateLabels: true, unit: ' p', y: { min: yMin, max: 100 } }),
    });
```

- [ ] **Step 2: Steps as bars** — replace the `charts.steps = new Chart(...)` call with:

```js
    const stepRows = [...rows].reverse();
    const stepValues = stepRows.map(r => r.steps);
    // Bars: goal-reaching days at full colour, others faded; dashed goal line when a goal is set.
    const stepDatasets = [{
      type: 'bar', label: 'Askeleet', data: stepValues, order: 1,
      backgroundColor: stepValues.map(v => (goal == null || v >= goal ? CHART_COLORS.s1 : CHART_COLORS.s1 + '66')),
      borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 14,
    }];
    if (goal != null) stepDatasets.push(referenceLineDataset('Tavoite', goal, stepRows.length));
    charts.steps = new Chart(document.getElementById('steps-chart'), {
      type: 'bar',
      data: { labels: stepRows.map(r => r.step_date), datasets: stepDatasets },
      options: baseChartOptions({ dateLabels: true, legend: goal != null, y: { beginAtZero: true } }),
    });
```

- [ ] **Step 3: Verify** — syntax check; CRLF.
- [ ] **Step 4: Commit** — `feat(kaaviot): uni ja askeleet (pylväät + tavoiteviiva)`

---

### Task 5: Exercise, exercise modal, run, insights charts

**Files:** Modify `index.html` — `loadExerciseChart`, `loadModalChart`, `loadRunChart`, `renderSleepTonnageChart`, `renderForecastAccuracyChart`.

- [ ] **Step 1: `loadExerciseChart`** — `labels` are already ISO dates (`Object.keys(byDate)` from `workout_date`). Replace the `charts.ex = new Chart(...)` call with:

```js
  charts.ex = new Chart(document.getElementById('ex-chart'), {
    type: 'line',
    data: { labels, datasets: [lineDataset(exName, values)] },
    options: baseChartOptions({ dateLabels: true, unit: ' kg' }),
  });
```

- [ ] **Step 2: `loadModalChart`** — replace the `_modalChart = new Chart(...)` call with:

```js
    _modalChart = new Chart(document.getElementById('ex-modal-chart'), {
      type: 'line',
      data: { labels: sortedDates, datasets: [lineDataset(_modalExName, sortedDates.map(d => Math.round(byDate[d] * 10) / 10))] },
      options: baseChartOptions({ dateLabels: true, unit: ' kg' }),
    });
```

- [ ] **Step 3: `loadRunChart`** — change `const labels = data.map(d => d.activity_date.slice(5));` to `const labels = data.map(d => d.activity_date);`, then replace the `charts.run = new Chart(...)` call with:

```js
  const isPace = type === 'pace';
  charts.run = new Chart(document.getElementById('run-chart'), {
    type: 'line',
    data: { labels, datasets: [lineDataset(isPace ? 'Vauhti' : 'Matka', values)] },
    options: baseChartOptions({
      dateLabels: true, unit: isPace ? ' min/km' : ' km',
      // Pace: lower is faster, so the axis is reversed (faster = higher) and titled.
      y: isPace ? { reverse: true, title: { display: true, text: 'min/km (nopeampi ylempänä)', color: CHART_COLORS.tick, font: CHART_FONT } } : {},
    }),
  });
```

- [ ] **Step 4: `renderSleepTonnageChart`** — replace the `charts.sleepTonnage = new Chart(...)` call with:

```js
  const scatterOpts = baseChartOptions({
    unit: ' kg',
    x: { type: 'linear', title: { display: true, text: 'Unipisteet (edellisyö)', color: CHART_COLORS.tick, font: CHART_FONT },
         ticks: { color: CHART_COLORS.tick, font: CHART_FONT, maxTicksLimit: 6, callback: v => fmtNum(v) } },
    y: { beginAtZero: true, title: { display: true, text: 'Tonnimäärä (kg)', color: CHART_COLORS.tick, font: CHART_FONT } },
  });
  scatterOpts.interaction = { mode: 'nearest', intersect: true };
  scatterOpts.plugins.tooltip.callbacks = {
    title: () => '',
    label: item => `Uni ${fmtNum(item.parsed.x, ' p')} → ${fmtNum(item.parsed.y, ' kg')}`,
  };
  charts.sleepTonnage = new Chart(document.getElementById('sleep-tonnage-chart'), {
    type: 'scatter',
    data: { datasets: [{ label: 'Unipisteet vs. tonnimäärä', data: points, backgroundColor: CHART_COLORS.s1, pointRadius: 4, pointHoverRadius: 6 }] },
    options: scatterOpts,
  });
```

- [ ] **Step 5: `renderForecastAccuracyChart`** — replace the `charts.forecastAccuracy = new Chart(...)` call with:

```js
  charts.forecastAccuracy = new Chart(document.getElementById('forecast-accuracy-chart'), {
    type: 'line',
    data: {
      labels: predicted.map(p => p.x),
      datasets: [
        lineDataset('Ennustettu rasvanpudotus', predicted.map(p => p.y), CHART_COLORS.s1),
        lineDataset('Toteutunut rasvanpudotus', actual.map(p => p.y), CHART_COLORS.s2),
      ],
    },
    options: baseChartOptions({ dateLabels: true, unit: ' kg', legend: true }),
  });
```

- [ ] **Step 6: Verify** — syntax check; CRLF; `grep -n "tension" index.html` returns no chart configs; `grep -n "#ff6b00\|#005c9e\|#2fff7e'," index.html` returns no chart configs.
- [ ] **Step 7: Commit** — `feat(kaaviot): liike-, juoksu- ja näkemyskaaviot yhteiseen tyyliin`

---

### Task 6: Controller verification, version, PR

(Run by the controller: real database, all writes intercepted.)

- [ ] Screenshot all 9 charts on the branch (same script as the "before" set) and compare against before: shared colours, Finnish dates/numbers, no overshoot, two body charts, continuous forecast with target line, sleep axis fitted, steps bars + goal line.
- [ ] Edge cases with injected data in the test browser: steps with no goal set; a single sleep score (chart hidden as today); body with exactly 2 measurements; forecast month with no live forecast.
- [ ] No console errors on any page; `node scripts/test-catchup.mjs` still passes.
- [ ] Version `v1.42.0` → `v1.43.0`, commit `chore: v1.43.0`.
- [ ] Report to the user; PR to main after approval.
