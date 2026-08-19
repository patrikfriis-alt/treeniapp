# Näkemykset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "Näkemykset" page (reachable from the sidebar) with two correlation charts (sleep → training tonnage, forecast accuracy) and a retroactive 12-week history of the existing Huomiot insight banners.

**Architecture:** No new tables — everything is derived from existing `workout_sets`/`sleep_data`/`body_metrics`/`model_calibration`/`food_log_entries`/`step_data`. `loadHuomioita()`'s inline insight-detection logic is extracted into 5 reusable pure functions (Task 1) so the exact same logic can be re-run for past weeks (Task 2) without duplicating it or changing the live Koonti banner's behavior. The forecast-accuracy chart reconstructs historical predictions by reusing the existing `calculateMaintenance()`/`getBodyComposition()` helpers with whichever `model_calibration` coefficient was active at each past point in time.

**Tech Stack:** Vanilla JS/CSS in a single static `index.html` file, Chart.js (already used elsewhere, e.g. `openStepsModal`'s line chart), Supabase Postgres/PostgREST. No build step, no test framework — verification is manual.

**Spec:** `docs/superpowers/specs/2026-08-19-nakemykset-design.md`

---

### Task 1: Extract Huomiot detectors into reusable pure functions

**Files:**
- Modify: `index.html` — `loadHuomioita()` (refactor only, no behavior change)

**Depends on:** none.

- [ ] **Step 1: Replace `loadHuomioita()` with the extracted-functions version**

Find this exact block:

```js
async function loadHuomioita() {
  const container = document.getElementById('huomiot-card');
  const list = document.getElementById('huomiot-list');
  if (!container || !list) return;

  const today = new Date();
  const todayIso = localIso(today);
  const d21 = new Date(today); d21.setDate(d21.getDate() - 21);
  const d42 = new Date(today); d42.setDate(d42.getDate() - 42);
  const from21 = localIso(d21), from42 = localIso(d42);

  const thisWeek = wStart(0);
  const lastWeekMon = wStart(-1);
  const lastWeekSun = new Date(thisWeek.date);
  lastWeekSun.setDate(thisWeek.date.getDate() - 1);
  const thisWeekFrom = thisWeek.iso, thisWeekTo = todayIso;
  const lastWeekFrom = lastWeekMon.iso, lastWeekTo = localIso(lastWeekSun);

  if (!appSettings) appSettings = await loadAppSettings();

  const [
    { data: setsRows },
    { data: weightRows },
    { data: sleepThis },
    { data: sleepLast },
    { data: stepsThis },
    { data: stepsLast },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', from42).lte('workout_date', todayIso),
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').gte('measured_at', from21).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', thisWeekFrom).lte('sleep_date', thisWeekTo),
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', lastWeekFrom).lte('sleep_date', lastWeekTo),
    sb.from('step_data').select('steps').gte('step_date', thisWeekFrom).lte('step_date', thisWeekTo),
    sb.from('step_data').select('steps').gte('step_date', lastWeekFrom).lte('step_date', lastWeekTo),
  ]);

  const insights = [];

  // 1RM-kehitys per liike: paras arvioitu 1RM viim. 21 pv vs. sitä edeltävät 21 pv
  const byExercise = {};
  (setsRows || []).forEach(r => {
    if (!r.weight_kg || !r.reps) return;
    if (!byExercise[r.exercise_name]) byExercise[r.exercise_name] = [];
    byExercise[r.exercise_name].push(r);
  });
  Object.entries(byExercise).forEach(([name, rows]) => {
    const recent = rows.filter(r => r.workout_date >= from21);
    const prior  = rows.filter(r => r.workout_date >= from42 && r.workout_date < from21);
    if (!recent.length || !prior.length) return;
    const best = arr => arr.reduce((max, r) => Math.max(max, calc1RM(r.weight_kg, r.reps) || 0), 0);
    const recentBest = best(recent), priorBest = best(prior);
    if (priorBest > 0 && recentBest > priorBest * 1.03) {
      const diff = Math.round(recentBest - priorBest);
      insights.push({ text: `${name} 1RM +${diff} kg (3 vk)`, magnitude: (recentBest - priorBest) / priorBest });
    }
  });

  // Paino/rasva%/lihas%: alkupuoliskon ka vs. loppupuoliskon ka viim. 3 viikolla, väh. 3 mittausta, muutos >= 1
  const halvesTrendInsight = (rows, field, label, unit) => {
    const vals = rows.filter(r => r[field] != null).map(r => r[field]);
    if (vals.length < 3) return null;
    const mid = Math.ceil(vals.length / 2);
    const firstHalf = vals.slice(0, mid), secondHalf = vals.slice(mid);
    if (!firstHalf.length || !secondHalf.length) return null;
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const totalChange = Math.round((avgSecond - avgFirst) * 10) / 10;
    if (Math.abs(totalChange) < 1) return null;
    const dir = totalChange < 0 ? 'laskenut' : 'noussut';
    return { text: `${label} ${dir} ${Math.abs(totalChange)}${unit} viimeisen 3 viikon aikana`, magnitude: Math.abs(totalChange) / avgFirst };
  };
  [
    halvesTrendInsight(weightRows || [], 'weight_kg', 'Paino', ' kg'),
    halvesTrendInsight(weightRows || [], 'fat_pct', 'Rasva%', 'pp'),
    halvesTrendInsight(weightRows || [], 'muscle_pct', 'Lihas%', 'pp'),
  ].forEach(i => { if (i) insights.push(i); });

  // Askeleet: tämä viikko vs. viime viikko, väh. 3 kirjausta molemmilla, kynnys 15%
  const stepsThisVals = (stepsThis || []).map(r => r.steps);
  const stepsLastVals = (stepsLast || []).map(r => r.steps);
  if (stepsThisVals.length >= 3 && stepsLastVals.length >= 3) {
    const avgThis = stepsThisVals.reduce((s, v) => s + v, 0) / stepsThisVals.length;
    const avgLast = stepsLastVals.reduce((s, v) => s + v, 0) / stepsLastVals.length;
    const pctChange = avgLast > 0 ? (avgThis - avgLast) / avgLast : 0;
    if (Math.abs(pctChange) >= 0.15) {
      const dir = pctChange < 0 ? 'laskenut' : 'noussut';
      insights.push({ text: `Askelmäärä ${dir} keskimäärin ${Math.round(Math.abs(pctChange) * 100)}% viime viikolla`, magnitude: Math.abs(pctChange) });
    }
  }

  // Unipisteet tälle ja viime viikolle (käytetään sekä uni- että ylikuormitushuomiossa)
  const sleepScoresThis = (sleepThis || []).map(r => calcSleepScore(r)).filter(s => s != null);
  const sleepScoresLast = (sleepLast || []).map(r => calcSleepScore(r)).filter(s => s != null);
  const hasSleepScoreData = sleepScoresThis.length >= 3 && sleepScoresLast.length >= 3;
  const avgScoreThis = hasSleepScoreData ? sleepScoresThis.reduce((s, v) => s + v, 0) / sleepScoresThis.length : null;
  const avgScoreLast = hasSleepScoreData ? sleepScoresLast.reduce((s, v) => s + v, 0) / sleepScoresLast.length : null;

  // Unipisteiden lasku: tämä viikko vs. viime viikko, väh. 3 kirjausta molemmilla, kynnys 10p
  if (hasSleepScoreData) {
    const scoreDrop = Math.round(avgScoreLast - avgScoreThis);
    if (scoreDrop >= 10) {
      insights.push({ text: `Unipisteet laskenut ${scoreDrop}p viime viikolla`, magnitude: scoreDrop / 100 });
    }
  }

  // Treenimäärän ja unipisteiden yhteisvaikutus: tonnimäärä +10% ja unipisteet -10p, molemmat viime viikkoon verrattuna
  const tonnageForRange = (from, to) => (setsRows || [])
    .filter(r => r.workout_date >= from && r.workout_date <= to && r.weight_kg != null && r.reps != null)
    .reduce((s, r) => s + r.weight_kg * r.reps, 0);
  const tonnageThis = tonnageForRange(thisWeekFrom, thisWeekTo);
  const tonnageLast = tonnageForRange(lastWeekFrom, lastWeekTo);
  const alreadyMarkedDeload = !!(appSettings && appSettings.deload_week_monday === thisWeek.iso);
  if (hasSleepScoreData && tonnageLast > 0 && !alreadyMarkedDeload) {
    const scoreDrop = Math.round(avgScoreLast - avgScoreThis);
    const tonnagePct = (tonnageThis - tonnageLast) / tonnageLast;
    if (tonnagePct >= 0.10 && scoreDrop >= 10) {
      insights.push({
        text: `Treenimäärä +${Math.round(tonnagePct * 100)}%, unipisteet -${scoreDrop}p — harkitse kevyempää viikkoa`,
        magnitude: tonnagePct + scoreDrop / 100,
        action: `<button class="huomio-action-btn" onclick="event.stopPropagation();markThisWeekDeload()">Merkitse kevyeksi viikoksi</button>`,
      });
    }
  }

  insights.sort((a, b) => b.magnitude - a.magnitude);
  const top3 = insights.slice(0, 3);

  if (!top3.length) {
    container.style.display = 'none';
    return;
  }
  list.innerHTML = top3.map(i => `<div class="huomio-row">${escapeHtml(i.text)}${i.action || ''}</div>`).join('');
  container.style.display = '';
}
```

Replace with:

```js
function detect1RMInsights(setsRows, from21, from42) {
  const byExercise = {};
  (setsRows || []).forEach(r => {
    if (!r.weight_kg || !r.reps) return;
    if (!byExercise[r.exercise_name]) byExercise[r.exercise_name] = [];
    byExercise[r.exercise_name].push(r);
  });
  const insights = [];
  Object.entries(byExercise).forEach(([name, rows]) => {
    const recent = rows.filter(r => r.workout_date >= from21);
    const prior  = rows.filter(r => r.workout_date >= from42 && r.workout_date < from21);
    if (!recent.length || !prior.length) return;
    const best = arr => arr.reduce((max, r) => Math.max(max, calc1RM(r.weight_kg, r.reps) || 0), 0);
    const recentBest = best(recent), priorBest = best(prior);
    if (priorBest > 0 && recentBest > priorBest * 1.03) {
      const diff = Math.round(recentBest - priorBest);
      insights.push({ text: `${name} 1RM +${diff} kg (3 vk)`, magnitude: (recentBest - priorBest) / priorBest });
    }
  });
  return insights;
}

function detectBodyTrendInsights(weightRows) {
  const halvesTrendInsight = (rows, field, label, unit) => {
    const vals = rows.filter(r => r[field] != null).map(r => r[field]);
    if (vals.length < 3) return null;
    const mid = Math.ceil(vals.length / 2);
    const firstHalf = vals.slice(0, mid), secondHalf = vals.slice(mid);
    if (!firstHalf.length || !secondHalf.length) return null;
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const totalChange = Math.round((avgSecond - avgFirst) * 10) / 10;
    if (Math.abs(totalChange) < 1) return null;
    const dir = totalChange < 0 ? 'laskenut' : 'noussut';
    return { text: `${label} ${dir} ${Math.abs(totalChange)}${unit} viimeisen 3 viikon aikana`, magnitude: Math.abs(totalChange) / avgFirst };
  };
  return [
    halvesTrendInsight(weightRows || [], 'weight_kg', 'Paino', ' kg'),
    halvesTrendInsight(weightRows || [], 'fat_pct', 'Rasva%', 'pp'),
    halvesTrendInsight(weightRows || [], 'muscle_pct', 'Lihas%', 'pp'),
  ].filter(Boolean);
}

function detectStepsInsight(stepsThisVals, stepsLastVals) {
  if (stepsThisVals.length < 3 || stepsLastVals.length < 3) return null;
  const avgThis = stepsThisVals.reduce((s, v) => s + v, 0) / stepsThisVals.length;
  const avgLast = stepsLastVals.reduce((s, v) => s + v, 0) / stepsLastVals.length;
  const pctChange = avgLast > 0 ? (avgThis - avgLast) / avgLast : 0;
  if (Math.abs(pctChange) < 0.15) return null;
  const dir = pctChange < 0 ? 'laskenut' : 'noussut';
  return { text: `Askelmäärä ${dir} keskimäärin ${Math.round(Math.abs(pctChange) * 100)}% viime viikolla`, magnitude: Math.abs(pctChange) };
}

function detectSleepInsight(sleepScoresThis, sleepScoresLast) {
  if (sleepScoresThis.length < 3 || sleepScoresLast.length < 3) return null;
  const avgScoreThis = sleepScoresThis.reduce((s, v) => s + v, 0) / sleepScoresThis.length;
  const avgScoreLast = sleepScoresLast.reduce((s, v) => s + v, 0) / sleepScoresLast.length;
  const scoreDrop = Math.round(avgScoreLast - avgScoreThis);
  if (scoreDrop < 10) return null;
  return { text: `Unipisteet laskenut ${scoreDrop}p viime viikolla`, magnitude: scoreDrop / 100 };
}

function detectDeloadInsight(tonnageThis, tonnageLast, sleepScoresThis, sleepScoresLast, includeAction) {
  const hasSleepScoreData = sleepScoresThis.length >= 3 && sleepScoresLast.length >= 3;
  if (!hasSleepScoreData || tonnageLast <= 0) return null;
  const avgScoreThis = sleepScoresThis.reduce((s, v) => s + v, 0) / sleepScoresThis.length;
  const avgScoreLast = sleepScoresLast.reduce((s, v) => s + v, 0) / sleepScoresLast.length;
  const scoreDrop = Math.round(avgScoreLast - avgScoreThis);
  const tonnagePct = (tonnageThis - tonnageLast) / tonnageLast;
  if (tonnagePct < 0.10 || scoreDrop < 10) return null;
  return {
    text: `Treenimäärä +${Math.round(tonnagePct * 100)}%, unipisteet -${scoreDrop}p — harkitse kevyempää viikkoa`,
    magnitude: tonnagePct + scoreDrop / 100,
    action: includeAction ? `<button class="huomio-action-btn" onclick="event.stopPropagation();markThisWeekDeload()">Merkitse kevyeksi viikoksi</button>` : '',
  };
}

async function loadHuomioita() {
  const container = document.getElementById('huomiot-card');
  const list = document.getElementById('huomiot-list');
  if (!container || !list) return;

  const today = new Date();
  const todayIso = localIso(today);
  const d21 = new Date(today); d21.setDate(d21.getDate() - 21);
  const d42 = new Date(today); d42.setDate(d42.getDate() - 42);
  const from21 = localIso(d21), from42 = localIso(d42);

  const thisWeek = wStart(0);
  const lastWeekMon = wStart(-1);
  const lastWeekSun = new Date(thisWeek.date);
  lastWeekSun.setDate(thisWeek.date.getDate() - 1);
  const thisWeekFrom = thisWeek.iso, thisWeekTo = todayIso;
  const lastWeekFrom = lastWeekMon.iso, lastWeekTo = localIso(lastWeekSun);

  if (!appSettings) appSettings = await loadAppSettings();

  const [
    { data: setsRows },
    { data: weightRows },
    { data: sleepThis },
    { data: sleepLast },
    { data: stepsThis },
    { data: stepsLast },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', from42).lte('workout_date', todayIso),
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').gte('measured_at', from21).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', thisWeekFrom).lte('sleep_date', thisWeekTo),
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', lastWeekFrom).lte('sleep_date', lastWeekTo),
    sb.from('step_data').select('steps').gte('step_date', thisWeekFrom).lte('step_date', thisWeekTo),
    sb.from('step_data').select('steps').gte('step_date', lastWeekFrom).lte('step_date', lastWeekTo),
  ]);

  const stepsThisVals = (stepsThis || []).map(r => r.steps);
  const stepsLastVals = (stepsLast || []).map(r => r.steps);
  const sleepScoresThis = (sleepThis || []).map(r => calcSleepScore(r)).filter(s => s != null);
  const sleepScoresLast = (sleepLast || []).map(r => calcSleepScore(r)).filter(s => s != null);

  const tonnageForRange = (from, to) => (setsRows || [])
    .filter(r => r.workout_date >= from && r.workout_date <= to && r.weight_kg != null && r.reps != null)
    .reduce((s, r) => s + r.weight_kg * r.reps, 0);
  const tonnageThis = tonnageForRange(thisWeekFrom, thisWeekTo);
  const tonnageLast = tonnageForRange(lastWeekFrom, lastWeekTo);
  const alreadyMarkedDeload = !!(appSettings && appSettings.deload_week_monday === thisWeek.iso);

  const insights = [
    ...detect1RMInsights(setsRows, from21, from42),
    ...detectBodyTrendInsights(weightRows),
  ];
  const stepsInsight = detectStepsInsight(stepsThisVals, stepsLastVals);
  if (stepsInsight) insights.push(stepsInsight);
  const sleepInsight = detectSleepInsight(sleepScoresThis, sleepScoresLast);
  if (sleepInsight) insights.push(sleepInsight);
  if (!alreadyMarkedDeload) {
    const deloadInsight = detectDeloadInsight(tonnageThis, tonnageLast, sleepScoresThis, sleepScoresLast, true);
    if (deloadInsight) insights.push(deloadInsight);
  }

  insights.sort((a, b) => b.magnitude - a.magnitude);
  const top3 = insights.slice(0, 3);

  if (!top3.length) {
    container.style.display = 'none';
    return;
  }
  list.innerHTML = top3.map(i => `<div class="huomio-row">${escapeHtml(i.text)}${i.action || ''}</div>`).join('');
  container.style.display = '';
}
```

This is a pure mechanical extraction — every formula, threshold, and string is byte-identical to the original inline code, just reorganized into named functions. The live Koonti banner's behavior must not change at all.

- [ ] **Step 2: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nakemykset_t1_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nakemykset_t1_check.js
grep -n "^function detect1RMInsights" index.html
grep -n "^function detectBodyTrendInsights" index.html
grep -n "^function detectStepsInsight" index.html
grep -n "^function detectSleepInsight" index.html
grep -n "^function detectDeloadInsight" index.html
grep -n "^async function loadHuomioita" index.html
```

Expected: `node --check` produces no output (syntax OK); 1 match each for the six greps.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
refactor: pura loadHuomioita()-logiikka uudelleenkäytettäviksi detektoreiksi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 1 of a 6-task plan. It's a pure refactor — nothing new is user-visible yet. Task 2 will call these new functions to build historical Huomiot reconstructions.

Full spec: `docs/superpowers/specs/2026-08-19-nakemykset-design.md`.

## Before You Begin

If the exact starting block doesn't match what's in `index.html`, ask now — do not improvise a different extraction.

## Your Job

1. Replace `loadHuomioita()` exactly as specified (5 new functions + 1 refactored function)
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace one full scenario through BOTH the old and new code mentally: given the same `setsRows`, does `detect1RMInsights(setsRows, from21, from42)` produce the exact same array of insight objects the old inline block would have pushed onto `insights`? Do this for at least 2 of the 5 detectors, not just 1.
- Confirm `detectDeloadInsight`'s `includeAction` parameter is `true` in `loadHuomioita()`'s call (preserving the live banner's action button) — this is the one place behavior-preservation is easy to get subtly wrong (e.g. accidentally hardcoding `false`).
- Confirm no detector function references `container`, `list`, or any other DOM element — they must be pure functions operating only on their arguments, since Task 2 will call them with historical data that has nothing to do with the live Koonti page's DOM.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Confirm the refactor is behavior-preserving (include your hand-traced comparison)
- Verification output
- Commit SHA
- Self-review findings (if any)
- Any issues or concerns

---

### Task 2: Näkemykset page shell, sidebar entry, and Huomiot history section

**Files:**
- Modify: `index.html` — `ICONS` (new `trending` key), new `<div id="page-nakemykset">` page, sidebar menu, `showPage()`, new `renderNakemyksetPage()`/`renderHuomiotHistorySection()`/`computeHuomiotHistory()` functions

**Depends on:** Task 1 (uses `detect1RMInsights`/`detectBodyTrendInsights`/`detectStepsInsight`/`detectSleepInsight`/`detectDeloadInsight`).

- [ ] **Step 1: Add the `trending` icon**

Find this exact block:

```js
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
  timer:     '<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/>',
  droplet:   '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',
};
```

Replace with:

```js
  steps:     '<ellipse cx="8" cy="7" rx="2.5" ry="3.5"/><ellipse cx="16" cy="16" rx="2.5" ry="3.5"/><circle cx="8" cy="3" r="1"/><circle cx="16" cy="12" r="1"/>',
  timer:     '<path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/>',
  droplet:   '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',
  trending:  '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
};
```

- [ ] **Step 2: Add the page HTML**

Find this exact block:

```html
<div id="page-valmentaja" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Valmentaja</span>
  </div>
  <div id="valmentaja-content"></div>
</div>
```

Replace with:

```html
<div id="page-valmentaja" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Valmentaja</span>
  </div>
  <div id="valmentaja-content"></div>
</div>

<div id="page-nakemykset" class="page">
  <div class="page-header">
    <button class="back-btn" onclick="showPage('koonti', document.getElementById('nav-koonti'))">‹</button>
    <span class="page-title">Näkemykset</span>
  </div>
  <div id="nakemykset-content">
    <div class="card">
      <div class="card-title">Uni → treenisuoritus</div>
      <div id="nakemykset-sleep-chart-wrap"></div>
    </div>
    <div class="card" style="margin-top:10px">
      <div class="card-title">Ennusteen tarkkuus</div>
      <div id="nakemykset-forecast-chart-wrap"></div>
    </div>
    <div class="card-title" style="margin:16px 0 8px">Huomiot-historia</div>
    <div id="nakemykset-history-list"></div>
  </div>
</div>
```

The two chart-wrap divs (`nakemykset-sleep-chart-wrap`, `nakemykset-forecast-chart-wrap`) are populated by Tasks 3 and 4 respectively — empty for now, that's expected.

- [ ] **Step 3: Add the sidebar menu entry**

Find this exact block:

```html
  <button onclick="showPage('valmentaja',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="chat" style="display:inline-flex"></span> Valmentaja
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Asetukset</div>
```

Replace with:

```html
  <button onclick="showPage('valmentaja',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="chat" style="display:inline-flex"></span> Valmentaja
  </button>
  <button onclick="showPage('nakemykset',null);closeSidebar()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="trending" style="display:inline-flex"></span> Näkemykset
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Asetukset</div>
```

Note the `border-bottom` moved from the Valmentaja button to the new Näkemykset button — it's a visual divider marking the end of the "pages" group before "Asetukset" starts, and Näkemykset is now the last item in that group.

- [ ] **Step 4: Wire `showPage()`**

Find this exact block:

```js
  if (name === 'ohjelma')   renderOhjelma();
  if (name === 'ruoka')     renderRuoka();
  if (name === 'valmentaja') renderCoachPage();
}
```

Replace with:

```js
  if (name === 'ohjelma')   renderOhjelma();
  if (name === 'ruoka')     renderRuoka();
  if (name === 'valmentaja') renderCoachPage();
  if (name === 'nakemykset') renderNakemyksetPage();
}
```

- [ ] **Step 5: Add `renderNakemyksetPage()`, `renderHuomiotHistorySection()`, `computeHuomiotHistory()`**

Find this exact block (immediately after `detectDeloadInsight()`'s closing brace, before `async function loadHuomioita()` — re-locate by content, this is right where Task 1 left off):

```js
async function loadHuomioita() {
```

Replace with:

```js
async function computeHuomiotHistory(numWeeks = 12) {
  const bufferWeeks = 6; // puskuri vanhimman tarkasteltavan viikon from42-ikkunalle
  const earliestMonday = wStart(-(numWeeks + bufferWeeks));
  const todayIso = localIso(new Date());

  const [
    { data: setsRows },
    { data: weightRows },
    { data: sleepRows },
    { data: stepsRows },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', earliestMonday.iso).lte('workout_date', todayIso),
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').gte('measured_at', earliestMonday.iso).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
    sb.from('sleep_data').select('sleep_date,sleep_score').gte('sleep_date', earliestMonday.iso).lte('sleep_date', todayIso),
    sb.from('step_data').select('step_date,steps').gte('step_date', earliestMonday.iso).lte('step_date', todayIso),
  ]);

  const tonnageForRange = (from, to) => (setsRows || [])
    .filter(r => r.workout_date >= from && r.workout_date <= to && r.weight_kg != null && r.reps != null)
    .reduce((s, r) => s + r.weight_kg * r.reps, 0);

  const history = [];
  for (let w = 0; w < numWeeks; w++) {
    const weekMon = wStart(-w);
    const weekTo = localIso(addDays(weekMon.date, 6));
    const prevMon = wStart(-w - 1);
    const prevFrom = prevMon.iso, prevTo = localIso(addDays(prevMon.date, 6));
    const from21 = localIso(addDays(weekMon.date, -21));
    const from42 = localIso(addDays(weekMon.date, -42));

    const weekInsights = [
      ...detect1RMInsights(setsRows, from21, from42),
      ...detectBodyTrendInsights((weightRows || []).filter(r => r.measured_at <= weekTo && r.measured_at >= from21)),
    ];

    const stepsThisVals = (stepsRows || []).filter(r => r.step_date >= weekMon.iso && r.step_date <= weekTo).map(r => r.steps);
    const stepsLastVals = (stepsRows || []).filter(r => r.step_date >= prevFrom && r.step_date <= prevTo).map(r => r.steps);
    const stepsInsight = detectStepsInsight(stepsThisVals, stepsLastVals);
    if (stepsInsight) weekInsights.push(stepsInsight);

    const sleepScoresThis = (sleepRows || []).filter(r => r.sleep_date >= weekMon.iso && r.sleep_date <= weekTo).map(r => calcSleepScore(r)).filter(s => s != null);
    const sleepScoresLast = (sleepRows || []).filter(r => r.sleep_date >= prevFrom && r.sleep_date <= prevTo).map(r => calcSleepScore(r)).filter(s => s != null);
    const sleepInsight = detectSleepInsight(sleepScoresThis, sleepScoresLast);
    if (sleepInsight) weekInsights.push(sleepInsight);

    const deloadInsight = detectDeloadInsight(
      tonnageForRange(weekMon.iso, weekTo), tonnageForRange(prevFrom, prevTo),
      sleepScoresThis, sleepScoresLast, false,
    );
    if (deloadInsight) weekInsights.push(deloadInsight);

    weekInsights.sort((a, b) => b.magnitude - a.magnitude);
    if (weekInsights.length) {
      history.push({
        weekLabel: `Viikko ${isoWeek(weekMon.date)} / ${isoWeekYear(weekMon.date)}`,
        insights: weekInsights.slice(0, 3),
      });
    }
  }
  return history;
}

async function renderHuomiotHistorySection() {
  const el = document.getElementById('nakemykset-history-list');
  if (!el) return;
  el.innerHTML = '<div class="skel-sub" style="height:60px"></div>';
  const history = await computeHuomiotHistory(12);
  if (!history.length) {
    el.innerHTML = emptyState('trending', 'Ei vielä huomioita — kirjaa treenejä, unta ja mittauksia kertyäksesi historiaa');
    return;
  }
  el.innerHTML = history.map(w => `
    <div class="card" style="margin-bottom:8px">
      <div class="card-title">${escapeHtml(w.weekLabel)}</div>
      ${w.insights.map(i => `<div class="huomio-row">${escapeHtml(i.text)}</div>`).join('')}
    </div>
  `).join('');
}

async function renderNakemyksetPage() {
  await renderHuomiotHistorySection();
  await renderSleepTonnageChart();
  await renderForecastAccuracyChart();
}

async function loadHuomioita() {
```

`renderSleepTonnageChart()` and `renderForecastAccuracyChart()` don't exist yet (added in Tasks 3 and 4) — this is an expected forward reference, same pattern already used successfully earlier in this project (a Koonti card's `onclick` referencing a not-yet-defined modal function until a later task filled it in). `emptyState()` is a pre-existing helper (`function emptyState(icon, text)`).

- [ ] **Step 6: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nakemykset_t2_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nakemykset_t2_check.js
grep -n "trending:" index.html
grep -n 'id="page-nakemykset"' index.html
grep -n 'onclick="showPage(.nakemykset.,null)' index.html
grep -n "if (name === 'nakemykset')" index.html
grep -n "async function computeHuomiotHistory" index.html
grep -n "async function renderHuomiotHistorySection" index.html
grep -n "async function renderNakemyksetPage" index.html
```

Expected: `node --check` produces no output (syntax OK); 1 match each for the seven greps.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: Näkemykset-sivu, sivuvalikkonappi ja Huomiot-historia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 2 of a 6-task plan. `wStart`, `addDays`, `localIso`, `isoWeek`, `isoWeekYear`, `calcSleepScore`, `escapeHtml`, `emptyState`, `showPage` are all pre-existing. `.card`/`.card-title`/`.huomio-row`/`.skel-sub` CSS classes already exist and are reused as-is — no new CSS.

Full spec: `docs/superpowers/specs/2026-08-19-nakemykset-design.md`.

## Before You Begin

If any exact block doesn't match (especially Step 5's insertion point, which depends on Task 1's exact output), ask now.

## Your Job

1. Make all five edits exactly as specified
2. Verify with the exact grep commands
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm `computeHuomiotHistory`'s week loop uses `wStart(-w)` for `w = 0..numWeeks-1`, meaning `w=0` is the CURRENT week (matching Koonti's live banner) and increasing `w` walks backward in time — hand-trace `w=0` and `w=1` and confirm their date ranges don't overlap incorrectly.
- Confirm `detectDeloadInsight`'s 5th argument is `false` in `computeHuomiotHistory` (no action button in history) but was `true` in Task 1's `loadHuomioita()` (action button on the live banner) — these must differ, don't let one leak into the other.
- Confirm `renderNakemyksetPage()`'s three awaited calls are sequential (`await` each), not parallelized — this is intentional simplicity for a page that's opened relatively rarely, not a hot path; don't "optimize" this into a `Promise.all` unless explicitly asked.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output
- Commit SHA
- Self-review findings (if any) — include the hand-traced week-boundary scenario
- Any issues or concerns

---

### Task 3: Sleep → training tonnage scatter chart

**Files:**
- Modify: `index.html` — new `renderSleepTonnageChart()` function

**Depends on:** Task 2 (the `nakemykset-sleep-chart-wrap` container and the forward reference in `renderNakemyksetPage()`).

- [ ] **Step 1: Add `renderSleepTonnageChart()`**

Find this exact block (immediately after `computeHuomiotHistory()`'s closing brace, before `renderHuomiotHistorySection()` — re-locate by content):

```js
async function renderHuomiotHistorySection() {
```

Replace with:

```js
async function renderSleepTonnageChart() {
  const wrap = document.getElementById('nakemykset-sleep-chart-wrap');
  if (!wrap) return;
  const fromIso = localIso(addDays(new Date(), -90));
  const todayIso = localIso(new Date());
  const [{ data: sleepRows }, { data: setsRows }] = await Promise.all([
    sb.from('sleep_data').select('sleep_date,sleep_score').gte('sleep_date', fromIso).lte('sleep_date', todayIso),
    sb.from('workout_sets').select('workout_date,weight_kg,reps').gte('workout_date', fromIso).lte('workout_date', todayIso),
  ]);
  const sleepByDate = {};
  (sleepRows || []).forEach(r => { const s = calcSleepScore(r); if (s != null) sleepByDate[r.sleep_date] = s; });
  const tonnageByDate = {};
  (setsRows || []).forEach(r => {
    if (r.weight_kg == null || r.reps == null) return;
    tonnageByDate[r.workout_date] = (tonnageByDate[r.workout_date] || 0) + r.weight_kg * r.reps;
  });
  const points = [];
  Object.entries(tonnageByDate).forEach(([date, tonnage]) => {
    const prevDayIso = localIso(addDays(new Date(date + 'T00:00:00'), -1));
    const sleepScore = sleepByDate[prevDayIso];
    if (sleepScore != null) points.push({ x: sleepScore, y: Math.round(tonnage) });
  });

  if (points.length < 3) {
    wrap.innerHTML = emptyState('moon', 'Ei tarpeeksi dataa — tarvitaan väh. 3 treenipäivää joilla on edellisyön unidata');
    return;
  }

  wrap.innerHTML = `<div class="chart-wrap" style="margin-top:12px"><canvas id="sleep-tonnage-chart"></canvas></div>`;
  if (charts.sleepTonnage) charts.sleepTonnage.destroy();
  charts.sleepTonnage = new Chart(document.getElementById('sleep-tonnage-chart'), {
    type: 'scatter',
    data: {
      datasets: [{ label: 'Unipisteet vs. tonnimäärä', data: points, backgroundColor: '#30d158' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Unipisteet (edellisyö)', color: '#555' }, ticks: { color: '#555', font: { size: 10 } }, grid: { color: '#222' } },
        y: { title: { display: true, text: 'Tonnimäärä (kg)', color: '#555' }, beginAtZero: true, ticks: { color: '#555', font: { size: 10 } }, grid: { color: '#222' } },
      },
    },
  });
}

async function renderHuomiotHistorySection() {
```

Date parsing uses `date + 'T00:00:00'` (explicit local-time parse) — matches the established correct pattern in this file for turning a bare `YYYY-MM-DD` string into a `Date`, not the bare `new Date(dateString)` UTC-midnight footgun. `charts.sleepTonnage` follows the same registry+destroy-before-recreate pattern as `charts.steps` in `openStepsModal()`.

- [ ] **Step 2: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nakemykset_t3_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nakemykset_t3_check.js
grep -n "async function renderSleepTonnageChart" index.html
grep -n "charts.sleepTonnage" index.html
```

Expected: `node --check` produces no output (syntax OK); first grep 1 match, second grep 2 matches (declaration-site read in the destroy guard + assignment).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: uni → treenisuoritus -korrelaatiokaavio Näkemyksiin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 3 of a 6-task plan. `charts` (the `{}` registry), `Chart` (Chart.js global), `calcSleepScore`, `addDays`, `localIso`, `emptyState` are all pre-existing.

Full spec: `docs/superpowers/specs/2026-08-19-nakemykset-design.md`.

## Before You Begin

If the exact insertion block doesn't match, ask now.

## Your Job

1. Add the function exactly as specified
2. Verify with `node --check` on the extracted inline script AND the two grep commands above
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Confirm the date-shift math is correct: for a training day `2026-08-15`, the code looks up `sleepByDate['2026-08-14']` (the PREVIOUS day) — hand-trace `addDays(new Date('2026-08-15T00:00:00'), -1)` and confirm it produces August 14th, not 15th or 13th.
- Confirm `date + 'T00:00:00'` is used (not a bare `new Date(date)`) — this file has a documented history of UTC-midnight parsing bugs from skipping this suffix.
- Confirm the empty-state path (`points.length < 3`) returns before ever touching `document.getElementById('sleep-tonnage-chart')` — that canvas element doesn't exist yet at that point since `wrap.innerHTML` hasn't been set to include it.

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output (node --check + both greps)
- Commit SHA
- Self-review findings (if any) — include the hand-traced date-shift example
- Any issues or concerns

---

### Task 4: Forecast accuracy line chart

**Files:**
- Modify: `index.html` — new `renderForecastAccuracyChart()` function

**Depends on:** Task 2 (the `nakemykset-forecast-chart-wrap` container and the forward reference in `renderNakemyksetPage()`). Uses `calculateMaintenance()`, `getBodyComposition()`, `getFoodCalories()`, `DEFAULT_OTHER_TISSUE_COEFF`, `DEFAULT_ACTIVITY_MULT`, `KCAL_PER_KG_FAT_LOSS` — all pre-existing from the weight-loss forecast feature.

- [ ] **Step 1: Add `renderForecastAccuracyChart()`**

Find this exact block (immediately after `renderSleepTonnageChart()`'s closing brace from Task 3, before `renderHuomiotHistorySection()` — re-locate by content):

```js
async function renderHuomiotHistorySection() {
```

Replace with:

```js
async function renderForecastAccuracyChart() {
  const wrap = document.getElementById('nakemykset-forecast-chart-wrap');
  if (!wrap) return;
  const [{ data: measurements }, { data: calibrations }] = await Promise.all([
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').order('measured_at', { ascending: true }),
    sb.from('model_calibration').select('other_tissue_kcal_per_kg,calibrated_at').order('calibrated_at', { ascending: true }),
  ]);
  const rows = (measurements || []).filter(m => m.weight_kg != null && m.fat_pct != null && m.muscle_pct != null);

  const pairs = [];
  for (let i = 1; i < rows.length; i++) {
    const days = (new Date(rows[i].measured_at + 'T00:00:00') - new Date(rows[i - 1].measured_at + 'T00:00:00')) / 86400000;
    if (days > 0) pairs.push({ m1: rows[i - 1], m2: rows[i], days });
  }

  if (pairs.length < 2) {
    wrap.innerHTML = emptyState('scale', 'Ei tarpeeksi mittauksia ennustevertailuun — tarvitaan väh. 3 Keho-mittausta');
    return;
  }

  const intakes = await Promise.all(pairs.map(p => getFoodCalories(p.m1.measured_at, p.m2.measured_at)));

  const coeffAt = (dateIso) => {
    const boundary = new Date(dateIso + 'T00:00:00');
    let coeff = DEFAULT_OTHER_TISSUE_COEFF;
    (calibrations || []).forEach(c => { if (new Date(c.calibrated_at) <= boundary) coeff = c.other_tissue_kcal_per_kg; });
    return coeff;
  };

  const predicted = [], actual = [];
  pairs.forEach((p, i) => {
    const { m1, m2, days } = p;
    const comp1 = getBodyComposition(m1.weight_kg, m1.fat_pct, m1.muscle_pct);
    const comp2 = getBodyComposition(m2.weight_kg, m2.fat_pct, m2.muscle_pct);
    const actualFatLossKg = comp1.fatKg - comp2.fatKg;

    const coeff = coeffAt(m1.measured_at);
    const avgFat = (comp1.fatKg + comp2.fatKg) / 2;
    const avgMuscle = (comp1.muscleKg + comp2.muscleKg) / 2;
    const avgOther = (comp1.otherKg + comp2.otherKg) / 2;
    const predictedDailyExpenditure = calculateMaintenance(avgFat, avgMuscle, avgOther, coeff, DEFAULT_ACTIVITY_MULT);
    const predictedFatLossKg = (predictedDailyExpenditure * days - intakes[i]) / KCAL_PER_KG_FAT_LOSS;

    predicted.push({ x: m2.measured_at, y: Math.round(predictedFatLossKg * 10) / 10 });
    actual.push({ x: m2.measured_at, y: Math.round(actualFatLossKg * 10) / 10 });
  });

  wrap.innerHTML = `<div class="chart-wrap" style="margin-top:12px"><canvas id="forecast-accuracy-chart"></canvas></div>`;
  if (charts.forecastAccuracy) charts.forecastAccuracy.destroy();
  charts.forecastAccuracy = new Chart(document.getElementById('forecast-accuracy-chart'), {
    type: 'line',
    data: {
      labels: predicted.map(p => p.x),
      datasets: [
        { label: 'Ennustettu rasvanpudotus (kg)', data: predicted.map(p => p.y), borderColor: '#0a84ff', borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#0a84ff', tension: .3, fill: false },
        { label: 'Toteutunut rasvanpudotus (kg)', data: actual.map(p => p.y), borderColor: '#30d158', borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#30d158', tension: .3, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: '#999', font: { size: 10 } } } },
      scales: {
        y: { ticks: { color: '#555', font: { size: 10 } }, grid: { color: '#222' } },
        x: { ticks: { color: '#555', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
      },
    },
  });
}

async function renderHuomiotHistorySection() {
```

Two deliberate correctness details:
1. `coeffAt(dateIso)` compares using `Date` objects (`new Date(c.calibrated_at) <= boundary`), NOT raw string comparison — `calibrated_at` is a `timestamptz` string (e.g. `2026-08-13T10:22:01+00:00`) while `dateIso` is a bare `date` string (e.g. `2026-08-13`); comparing these as raw strings would be subtly wrong (a same-day timestamptz string sorts as lexicographically *greater* than the bare date string it should be compared against, since it's a longer string with the same prefix), so both are converted to real `Date` objects first.
2. `intakes` is fetched via `Promise.all(pairs.map(...))` — all pairs' food-calorie sums are fetched in parallel, not through a sequential `await` inside the `pairs.forEach` loop.

- [ ] **Step 2: Verify**

```bash
python3 -c "
import re
with open('index.html') as f:
    content = f.read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
with open('/tmp/_nakemykset_t4_check.js', 'w') as f:
    f.write(scripts[-1] if scripts else '')
"
node --check /tmp/_nakemykset_t4_check.js
grep -n "async function renderForecastAccuracyChart" index.html
grep -n "function coeffAt" index.html
grep -n "charts.forecastAccuracy" index.html
```

Expected: `node --check` produces no output (syntax OK); grep counts 1, 1, 2 (destroy-guard read + assignment) matches respectively.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: ennusteen tarkkuus -kaavio Näkemyksiin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is Task 4 of a 6-task plan — the most mathematically involved task. `calculateMaintenance(fatKg, muscleKg, otherKg, otherTissueCoeff, activityMult)` already exists and returns predicted daily expenditure directly — reuse it, don't reimplement the BMR formula inline. `getBodyComposition`, `getFoodCalories`, `DEFAULT_OTHER_TISSUE_COEFF` (= 30), `DEFAULT_ACTIVITY_MULT` (= 1.5), `KCAL_PER_KG_FAT_LOSS` (= 7700) are all pre-existing constants/functions from the weight-loss-forecast feature (`supabase/migrations/20260813_painonpudotusennuste.sql`, and the surrounding JS in this file).

Full spec: `docs/superpowers/specs/2026-08-19-nakemykset-design.md` (§3 explains the math derivation in detail — read it before implementing if anything here is unclear).

## Before You Begin

If the exact insertion block doesn't match, or any of the referenced pre-existing functions/constants don't exist under these exact names, ask now — don't guess at alternate names.

## Your Job

1. Add the function exactly as specified
2. Verify with `node --check` on the extracted inline script AND the three grep commands above
3. Commit with the exact message
4. Self-review (see below)
5. Report back

## Before Reporting Back: Self-Review

- Hand-trace `coeffAt()` with a concrete example: 3 calibrations at `2026-06-01`, `2026-07-01`, `2026-08-01` (calibrated_at, as timestamptz with some time-of-day), asking for `coeffAt('2026-07-15')` — confirm it returns the `2026-07-01` calibration's coefficient (the most recent one at or before the boundary date), not the `2026-08-01` one (which is in the future relative to the boundary) and not the `2026-06-01` one (which is stale).
- Confirm `intakes[i]` in the `pairs.forEach((p, i) => ...)` callback correctly corresponds to `pairs[i]` — since `intakes` was built via `Promise.all(pairs.map(...))`, array order is preserved, so `intakes[i]` matches `pairs[i]`'s own `getFoodCalories()` call. Confirm this alignment explicitly, it's easy to get subtly wrong if the mapping function or array order changes.
- Confirm neither `predictedFatLossKg` nor `actualFatLossKg` can produce `NaN`/`Infinity` for any of the self-review's traced scenario's inputs — walk through the arithmetic once with plausible numbers (e.g. `avgFat=25`, `avgMuscle=30`, `avgOther=55`, `coeff=30`, `days=14`, `intakes[i]=25000`) and confirm the result is a plausible small number (not thousands, not NaN).

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Verification output (node --check + all three greps)
- Commit SHA
- Self-review findings (if any) — include the hand-traced `coeffAt()` example and the plausible-numbers arithmetic check
- Any issues or concerns

---

### Task 5: Manual browser verification

**Files:** none (verification only)

**Run this task in the main session, not a subagent** — needs `claude-in-chrome` tools and live Supabase data.

- [ ] **Step 1: Serve the app locally, open in Chrome at phone viewport (430x932)**

- [ ] **Step 2: Confirm the live Koonti Huomiot banner still works exactly as before** — open Koonti, note whatever Huomiot banner (if any) currently shows, and confirm it's unchanged from before this branch (Task 1's refactor should be fully invisible here).

- [ ] **Step 3: Navigate to Näkemykset** via the sidebar (Valikko → Näkemykset, positioned after Valmentaja) — confirm the page loads with its header and back button working.

- [ ] **Step 4: Sleep → tonnage chart** — confirm it renders (scatter points) or shows the empty-state message if there isn't enough data. If it renders, spot-check one or two points against known training-day tonnage and the previous night's actual sleep score (cross-reference against the Uni page / Sali history).

- [ ] **Step 5: Forecast accuracy chart** — confirm it renders (two-line chart) or shows its empty-state message. If it renders, confirm the two lines have plausible values (not NaN, not absurdly large numbers) and roughly move together in direction (predicted and actual should usually agree on the sign of fat change, even if magnitudes differ).

- [ ] **Step 6: Huomiot history** — confirm a list of past weeks appears (or the empty-state message). If there's a current-week entry, confirm its text matches what's shown in the live Koonti Huomiot banner from Step 2 (same underlying data, same detectors — should agree).

- [ ] **Step 7: Check the browser console for errors** throughout all of the above — expected: none.

- [ ] **Step 8: Clean up** — stop the local server, close the tab.

- [ ] **Step 9: Report result.** No commit needed.

---

### Task 6: Final code review + finish branch

**Files:** none (review only)

**Run this task in the main session** (dispatch a review subagent).

- [ ] **Step 1: Dispatch a final code reviewer** for the entire diff (Tasks 1-4) covering: that Task 1's refactor is genuinely behavior-preserving for the live Koonti banner (re-verify independently, don't just trust Task 1's own self-review), the `coeffAt()` Date-object comparison correctness, the `Promise.all`-parallelized `intakes` fetch, that no new Supabase tables/columns were introduced anywhere (this feature is explicitly derive-only), and that the sidebar's `border-bottom` visual divider correctly landed on the Näkemykset button (not duplicated on both Valmentaja and Näkemykset, and not missing from both).

- [ ] **Step 2: If issues are found, fix them and re-review until approved.**

- [ ] **Step 3: Proceed to `superpowers:finishing-a-development-branch`** once approved.

---

## Self-Review Notes

- **Spec coverage:** §1 (new page + nav) → Task 2. §2 (sleep→tonnage chart) → Task 3. §3 (forecast accuracy chart + math derivation) → Task 4. §4 (Huomiot history, detector extraction) → Tasks 1-2. §5 exclusions (no new tables, no behavior change to live Huomiot, 12-week history cap, no interactive date-range filtering) — respected, no task does any of them.
- **Type/name consistency:** `detect1RMInsights`, `detectBodyTrendInsights`, `detectStepsInsight`, `detectSleepInsight`, `detectDeloadInsight`, `computeHuomiotHistory`, `renderHuomiotHistorySection`, `renderNakemyksetPage`, `renderSleepTonnageChart`, `renderForecastAccuracyChart` used with identical names/signatures across every task that references them.
- **No placeholders:** every step shows exact before/after code, exact commands, exact expected output; Tasks 1-4 include concrete hand-trace scenarios in their self-review sections rather than vague "verify it works" instructions.
- **Forward references:** Task 2's `renderNakemyksetPage()` references `renderSleepTonnageChart`/`renderForecastAccuracyChart` before Tasks 3/4 define them — explicitly called out as expected, matching a pattern already used successfully in this project's history.
