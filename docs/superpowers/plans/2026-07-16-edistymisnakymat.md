# Edistymisnäkymät ja progressioehdotukset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface 1-3 automatically-detected notable changes ("Huomioita") on the Koonti dashboard, and pre-fill Sali-page set inputs with a data-driven progression suggestion (+2.5% if the last session was completed cleanly, same weight/reps otherwise) when an exercise is opened for the first time each day.

**Architecture:** Both pieces are pure client-side additions to `index.html` — no new tables, no backend changes. The Koonti insight section reuses existing helpers (`calc1RM`, `wStart`, `localIso`) and fetches its own data in a new `loadHuomioita()` function, following the same "fire-and-forget, render into its own DOM container" pattern already used by `loadMotivationSummary()`/`loadWeeklyReportCard()`. The Sali progression suggestion reuses the *already-existing* `prevCache`/`getPrevSet`/`loadPrevSession` infrastructure (built for the existing manual "↓ Käytä edell." button) — it does not duplicate that data-fetching, it just adds an automatic, percentage-adjusted variant of what that button already does manually.

**Tech Stack:** Vanilla JS in `index.html`, Supabase JS client, no build step, no test framework — verification is manual/browser-based, matching this project's convention.

---

### Task 1: Koonti "Huomioita" -osio

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the CSS**

Find (around line 262, right after the `.koonti-section-label` block):

```css
.koonti-section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text3);
  margin: 18px 12px 8px;
```

Read a few more lines to find where this rule's closing `}` is, then add immediately after it:

```css
.huomio-row { font-size: 14px; color: var(--text); padding: 6px 0; line-height: 1.4; }
.huomio-row + .huomio-row { border-top: 1px solid var(--border); }
```

- [ ] **Step 2: Add the HTML container**

Find (the end of the second `hero-metrics` block and the start of the "Tänään" section, around line 918-928):

```html
    <div class="hero-metric hero-metric--clickable" id="koonti-deficit-wrap">
      <div class="hero-metric-icon" data-icon="scale" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-deficit-val">—</div>
      <div class="hero-metric-label" id="koonti-deficit-label">päivän kalorit</div>
    </div>
  </div>

  <div class="koonti-section-label">Tänään</div>
```

Replace with:

```html
    <div class="hero-metric hero-metric--clickable" id="koonti-deficit-wrap">
      <div class="hero-metric-icon" data-icon="scale" data-icon-color="var(--text2)" data-icon-bg="var(--surface2)"></div>
      <div class="hero-metric-val" id="koonti-deficit-val">—</div>
      <div class="hero-metric-label" id="koonti-deficit-label">päivän kalorit</div>
    </div>
  </div>

  <div class="card" id="huomiot-card" style="display:none">
    <div class="card-title">Huomioita</div>
    <div id="huomiot-list"></div>
  </div>

  <div class="koonti-section-label">Tänään</div>
```

- [ ] **Step 3: Add `loadHuomioita()`**

Find `loadMotivationSummary`'s opening (`async function loadMotivationSummary() {`) and insert this new function directly before it:

```javascript
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

  const [
    { data: setsRows },
    { data: weightRows },
    { data: sleepThis },
    { data: sleepLast },
    { data: stepsThis },
    { data: stepsLast },
  ] = await Promise.all([
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', from42).lte('workout_date', todayIso),
    sb.from('body_metrics').select('weight_kg,measured_at').gte('measured_at', from21).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
    sb.from('sleep_data').select('duration_min').gte('sleep_date', thisWeekFrom).lte('sleep_date', thisWeekTo),
    sb.from('sleep_data').select('duration_min').gte('sleep_date', lastWeekFrom).lte('sleep_date', lastWeekTo),
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

  // Paino: monotoninen trendi viim. 3 viikolla, väh. 3 mittausta, kokonaismuutos >= 1kg
  const weightsWithVal = (weightRows || []).filter(r => r.weight_kg != null);
  if (weightsWithVal.length >= 3) {
    const vals = weightsWithVal.map(r => r.weight_kg);
    const nonIncreasing = vals.every((v, i) => i === 0 || v <= vals[i - 1]);
    const nonDecreasing = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
    const totalChange = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10;
    if ((nonIncreasing || nonDecreasing) && Math.abs(totalChange) >= 1) {
      const dir = totalChange < 0 ? 'laskenut' : 'noussut';
      insights.push({ text: `Paino ${dir} ${Math.abs(totalChange)} kg viimeisen 3 viikon aikana`, magnitude: Math.abs(totalChange) / vals[0] });
    }
  }

  // Uni: tämä viikko vs. viime viikko, väh. 3 kirjausta molemmilla, kynnys 30 min
  const sleepThisVals = (sleepThis || []).filter(r => r.duration_min != null).map(r => r.duration_min);
  const sleepLastVals = (sleepLast || []).filter(r => r.duration_min != null).map(r => r.duration_min);
  if (sleepThisVals.length >= 3 && sleepLastVals.length >= 3) {
    const avgThis = sleepThisVals.reduce((s, v) => s + v, 0) / sleepThisVals.length;
    const avgLast = sleepLastVals.reduce((s, v) => s + v, 0) / sleepLastVals.length;
    const diffMin = Math.round(avgThis - avgLast);
    if (Math.abs(diffMin) >= 30) {
      const dir = diffMin < 0 ? 'lyhentynyt' : 'pidentynyt';
      insights.push({ text: `Uni ${dir} keskimäärin ${Math.abs(diffMin)} min viime viikolla`, magnitude: Math.abs(diffMin) / avgLast });
    }
  }

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

  insights.sort((a, b) => b.magnitude - a.magnitude);
  const top3 = insights.slice(0, 3);

  if (!top3.length) {
    container.style.display = 'none';
    return;
  }
  list.innerHTML = top3.map(i => `<div class="huomio-row">${escapeHtml(i.text)}</div>`).join('');
  container.style.display = '';
}

```

- [ ] **Step 4: Wire it into `loadKoonti()`**

Find (near the top of `loadKoonti()`):

```javascript
  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  initNotifToggle();
  loadWeeklyReportCard();
  loadDeficitHeroMetric();
```

Replace with:

```javascript
  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  initNotifToggle();
  loadWeeklyReportCard();
  loadDeficitHeroMetric();
  loadHuomioita();
```

- [ ] **Step 5: Syntax-check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 6: Manual verification via curl (data shape check, not UI)**

Get the anon key: `grep "const SB_KEY" index.html`

```bash
SB_URL='https://dodrzzgbdlucjbkmxbjn.supabase.co'
SB_KEY='<ANON_KEY>'
curl -s "$SB_URL/rest/v1/workout_sets?select=exercise_name,weight_kg,reps,workout_date&order=workout_date.desc&limit=5" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"
curl -s "$SB_URL/rest/v1/body_metrics?select=weight_kg,measured_at&order=measured_at.desc&limit=5" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"
```

This just confirms the queried tables/columns exist and return data in the expected shape (`exercise_name`/`weight_kg`/`reps`/`workout_date` and `weight_kg`/`measured_at` respectively) — full behavioral verification (does a real insight actually render) requires a browser and happens in Task 3's manual QA.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: Koonti-sivun Huomioita-osio"
```

---

### Task 2: Sali-sivun progressioehdotus

**Files:**
- Modify: `index.html`

This task hooks into the existing exercise-set rendering loop inside `renderSession()`. It reuses `prevCache`/`getPrevSet` (already populated by the existing `loadPrevSession()` call at the top of `renderSession()`, used today by the manual "↓ Käytä edell." button) — no new data-fetching is introduced.

- [ ] **Step 1: Change `const ed` to `let ed` so it can be reassigned after an auto-suggestion writes new data**

Find (inside the `sess.ex.forEach((ex, ei) => { ... })` callback, its very first line):

```javascript
  sess.ex.forEach((ex, ei) => {
    const ed   = getED(wOff, aDay, st, ei);
    const prev = prevCache[ex.n];
```

Replace with:

```javascript
  sess.ex.forEach((ex, ei) => {
    let ed     = getED(wOff, aDay, st, ei);
    const prev = prevCache[ex.n];
```

- [ ] **Step 2: Insert the auto-suggestion logic right after `doneCount`/`progPct` are computed, before the prefill-button line**

Find:

```javascript
    // Sarjojen edistyminen
    const doneCount = (ed.sets || []).filter(s => {
      const sd = s || {};
      return (parseFloat(sd.kg) || null) !== null || (parseInt(sd.reps) || null) !== null;
    }).length;
    const progPct = ex.s > 0 ? Math.round(doneCount / ex.s * 100) : 0;

    // Prefill-nappi
    const prefillBtn = prev && started && !done
```

Replace with:

```javascript
    // Sarjojen edistyminen
    const doneCount = (ed.sets || []).filter(s => {
      const sd = s || {};
      return (parseFloat(sd.kg) || null) !== null || (parseInt(sd.reps) || null) !== null;
    }).length;
    const progPct = ex.s > 0 ? Math.round(doneCount / ex.s * 100) : 0;

    // Progressioehdotus: automaattinen esitäyttö kun liike avataan päivälle ensimmäistä kertaa.
    // "Puhtaasti suoritettu" = toistomäärä ei laskenut sarjojen aikana viime kerralla -> +2.5% (pyöristys 2.5kg:aan).
    // Muuten sama paino/toistot kuin viimeksi. Sama started/!done-ehto kuin manuaalisella "Käytä edell."-napilla.
    if (prev && started && !done && doneCount === 0) {
      const repsList = prev.map(s => s.reps).filter(r => r != null);
      const cleanly = repsList.length > 0 && repsList.every(r => r >= repsList[0]);
      const k = eKey(wOff, aDay, st, ei);
      if (!LD[k]) LD[k] = { sets: [] };
      let anyApplied = false;
      for (let s = 0; s < ex.s; s++) {
        const prevSet = getPrevSet(ex.n, s);
        if (!prevSet || prevSet.weight_kg == null) continue;
        const suggestedKg = cleanly
          ? Math.round((prevSet.weight_kg * 1.025) / 2.5) * 2.5
          : prevSet.weight_kg;
        if (!LD[k].sets[s]) LD[k].sets[s] = {};
        LD[k].sets[s].kg   = String(suggestedKg);
        LD[k].sets[s].reps = prevSet.reps != null ? String(prevSet.reps) : '';
        scheduleSyncSet(wOff, aDay, ei, s);
        anyApplied = true;
      }
      if (anyApplied) { saveLD(); ed = LD[k]; }
    }

    // Prefill-nappi
    const prefillBtn = prev && started && !done
```

Note: the rest of the loop (the per-set rendering below, which reads `sd = (ed.sets && ed.sets[s]) || {}`) is unchanged — because `ed` now points at the freshly-written `LD[k]` when a suggestion was applied, those reads automatically pick up the suggested values with no further code changes needed.

- [ ] **Step 3: Syntax-check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: automaattinen progressioehdotus salin sarjariveille"
```

---

### Task 3: Manual QA and version bump

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Manual QA checklist (browser)**

1. Open the Koonti page. If you have enough history in at least one of 1RM/weight/sleep/steps to cross a threshold (see Task 1's thresholds: 1RM +3%, weight ±1kg monotonic over 3+ weigh-ins, sleep ±30min week-over-week with 3+ nights each week, steps ±15% week-over-week with 3+ days each week), confirm the "Huomioita" card appears with 1-3 correctly worded lines. If nothing currently crosses a threshold, confirm the card is simply absent (not an empty box).
2. Go to the Sali page, pick a day, start today's session. Open an exercise you've logged before (has `prevCache` data) for the first time today — confirm the weight/reps fields are pre-filled. Compare the value against the exercise's last logged session: if that session's reps didn't decline across sets, the suggested weight should be ~2.5% higher than last time (rounded to the nearest 2.5kg), same reps. If reps did decline across that session, the suggestion should exactly match last time's weight/reps.
3. Open an exercise you've never logged before — confirm the fields are NOT pre-filled (stay empty, same as before this change).
4. Confirm the existing manual "↓ Käytä edell." button still works and still copies the exact previous values (unrelated to the new automatic suggestion, should be untouched).
5. Refresh/re-render the Sali page after an auto-suggestion has been applied (e.g. switch away and back to the day) — confirm it doesn't re-trigger and overwrite anything you've since typed.

- [ ] **Step 2: Bump the version chip**

Find (in the sidebar):

```html
    <div class="version-chip" style="margin:0">v1.22.0</div>
```

Replace with:

```html
    <div class="version-chip" style="margin:0">v1.23.0</div>
```

- [ ] **Step 3: Final syntax check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "v1.23.0: Edistymisnäkymät ja progressioehdotukset"
```
