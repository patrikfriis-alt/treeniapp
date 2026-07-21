# Deload/Overtraining Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new insight types to Treeniapp's Koonti "Huomioita" section (weekly sleep-score decline, and combined training-tonnage-up/sleep-score-down divergence), plus a matching clause in the AI coach's weekly data context.

**Architecture:** Both new insights slot into the existing `loadHuomioita()` function's `insights` array (index.html) using the same `{text, magnitude}` shape as the four insights already there, competing for the same top-3 display slot — no new UI. The coach-context change appends a conditional sentence fragment to the existing per-week summary line in `context.ts`, following the same pattern already used for other weekly stats there. No schema changes; both changes only widen existing Supabase `select()` column lists and add pure-JS computation.

**Tech Stack:** Vanilla JS (index.html), Deno/TypeScript (Supabase Edge Function `coach-chat/context.ts`). No test framework in this project — verification is manual, via browser console against real/seeded Supabase data, matching the project's existing pattern for prior features.

---

### Task 1: Sleep-score decline + combined divergence insights in Koonti

**Files:**
- Modify: `index.html:2088-2089` (widen `sleepThis`/`sleepLast` queries)
- Modify: `index.html:2159-2160` (insert new insight blocks before `insights.sort(...)`)

This task adds both new insights to the existing `loadHuomioita()` function. It relies on `calcSleepScore()` (already defined at `index.html:1765`) and the `setsRows` query (already fetched at `index.html:2093`, covering 42 days back with `workout_date,exercise_name,weight_kg,reps` — already has everything needed for tonnage).

- [ ] **Step 1: Widen the sleep queries to fetch the fields `calcSleepScore()` needs**

Current code (`index.html:2085-2099`):
```js
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
```

Change the two `sleep_data` lines to also select `deep_sleep_min,rem_sleep_min,awakenings` (required by `calcSleepScore()`):
```js
    sb.from('sleep_data').select('duration_min,deep_sleep_min,rem_sleep_min,awakenings').gte('sleep_date', thisWeekFrom).lte('sleep_date', thisWeekTo),
    sb.from('sleep_data').select('duration_min,deep_sleep_min,rem_sleep_min,awakenings').gte('sleep_date', lastWeekFrom).lte('sleep_date', lastWeekTo),
```

The existing "Uni" insight block below (`index.html:2135-2146`) filters these rows on `r.duration_min != null` and never reads the other fields, so it keeps working unchanged.

- [ ] **Step 2: Add the two new insight blocks**

Current code (`index.html:2159-2162`):
```js
  insights.sort((a, b) => b.magnitude - a.magnitude);
  const top3 = insights.slice(0, 3);
```

Insert this immediately before that line (i.e. after the existing "Askeleet" block and before `insights.sort(...)`):
```js
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
  if (hasSleepScoreData && tonnageLast > 0) {
    const scoreDrop = Math.round(avgScoreLast - avgScoreThis);
    const tonnagePct = (tonnageThis - tonnageLast) / tonnageLast;
    if (tonnagePct >= 0.10 && scoreDrop >= 10) {
      insights.push({
        text: `Treenimäärä +${Math.round(tonnagePct * 100)}%, unipisteet -${scoreDrop}p — harkitse kevyempää viikkoa`,
        magnitude: tonnagePct + scoreDrop / 100,
      });
    }
  }

```

- [ ] **Step 3: Verify with fabricated data via browser console**

Open the deployed (or locally served) app in a browser, log in, open DevTools console on the Koonti page, and run:
```js
console.log(calcSleepScore({ duration_min: 420, deep_sleep_min: 55, rem_sleep_min: 90, awakenings: 1 }));
```
Expected: a number between 0 and 100 (sanity check that `calcSleepScore` is reachable from the console, confirming it's in scope).

Then insert two rows of real or test sleep data 8+ days apart via the Supabase dashboard Table Editor (or the Uni page's manual entry form) such that this week's average `calcSleepScore()` is at least 10 points below last week's (e.g. last week: 3 nights around 8h/good stages; this week: 3 nights around 5h/poor stages) and reload Koonti — the "Unipisteet laskenut Np viime viikolla" row should appear in Huomioita. Clean up any test rows afterward via exact-ID delete (per project convention — never a broad date-range delete).

- [ ] **Step 4: Verify the combined insight and the negative case**

With the same seeded low-sleep-score week, also log workout sets this week whose total tonnage (Σ weight_kg×reps) is at least 10% above last week's — the "Treenimäärä +N%, unipisteet -Mp — harkitse kevyempää viikkoa" row should appear. Then verify the negative case: with tonnage up but sleep score NOT down (or vice versa), neither new row appears — only change one variable at a time to confirm both conditions are actually required (guards against an `||` typo'd as `&&`, or vice versa).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: unipisteiden lasku ja ylikuormitushuomio Koontiin"
```

---

### Task 2: Overload clause in AI coach's weekly context

**Files:**
- Modify: `supabase/functions/coach-chat/context.ts:90` (widen `gymSetsAll` query)
- Modify: `supabase/functions/coach-chat/context.ts:117-153` (add overload clause inside the weekly-summary loop)

This task mirrors Task 1's logic for the coach's own weekly-summary loop, which already computes `avgSleepScore` per week (`context.ts:141-146`) but doesn't yet compute per-week tonnage or compare to the prior week.

- [ ] **Step 1: Widen the `gymSetsAll` query to include weight/reps**

Current code (`context.ts:90`):
```ts
    sb.from('workout_sets').select('workout_date').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
```

Change to:
```ts
    sb.from('workout_sets').select('workout_date,weight_kg,reps').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
```

The existing `gymDays` computation (`context.ts:126-128`) only reads `r.workout_date`, so it's unaffected by the extra columns.

- [ ] **Step 2: Compute this week's and the prior week's tonnage + sleep score, and append the overload clause**

Current code (`context.ts:141-152`):
```ts
    const weekSleepScores = weekSleep
      .map((r: any) => calcSleepScore(r))
      .filter((s: number | null) => s != null) as number[];
    const avgSleepScore = weekSleepScores.length
      ? Math.round(weekSleepScores.reduce((s: number, v: number) => s + v, 0) / weekSleepScores.length)
      : null;

    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}, unipisteet keskim. ${avgSleepScore != null ? avgSleepScore + 'p' : '—'}.`,
    );
  }
```

Replace with:
```ts
    const weekSleepScores = weekSleep
      .map((r: any) => calcSleepScore(r))
      .filter((s: number | null) => s != null) as number[];
    const avgSleepScore = weekSleepScores.length
      ? Math.round(weekSleepScores.reduce((s: number, v: number) => s + v, 0) / weekSleepScores.length)
      : null;

    const weekTonnage = (gymSetsAll || [])
      .filter((r: any) => r.workout_date >= from && r.workout_date <= to && r.weight_kg != null && r.reps != null)
      .reduce((s: number, r: any) => s + r.weight_kg * r.reps, 0);

    const prevMonday = mondayOfWeeksAgo(w + 1);
    const prevSunday = new Date(prevMonday);
    prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
    const prevFrom = isoDate(prevMonday);
    const prevTo = isoDate(prevSunday);
    const prevTonnage = (gymSetsAll || [])
      .filter((r: any) => r.workout_date >= prevFrom && r.workout_date <= prevTo && r.weight_kg != null && r.reps != null)
      .reduce((s: number, r: any) => s + r.weight_kg * r.reps, 0);
    const prevSleepScores = (sleepAll || [])
      .filter((r: any) => r.sleep_date >= prevFrom && r.sleep_date <= prevTo)
      .map((r: any) => calcSleepScore(r))
      .filter((s: number | null) => s != null) as number[];
    const prevAvgSleepScore = prevSleepScores.length
      ? Math.round(prevSleepScores.reduce((s: number, v: number) => s + v, 0) / prevSleepScores.length)
      : null;

    let overloadClause = '';
    if (prevTonnage > 0 && avgSleepScore != null && prevAvgSleepScore != null) {
      const tonnageChangePct = (weekTonnage - prevTonnage) / prevTonnage;
      const sleepScoreChange = avgSleepScore - prevAvgSleepScore;
      if (tonnageChangePct >= 0.10 && sleepScoreChange <= -10) {
        overloadClause = ` Huom: treenimäärä nousi ${Math.round(tonnageChangePct * 100)}% ja unipisteet laski ${Math.abs(sleepScoreChange)}p edelliseen viikkoon verrattuna — mahdollinen ylikuormitus.`;
      }
    }

    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}, unipisteet keskim. ${avgSleepScore != null ? avgSleepScore + 'p' : '—'}.` +
      overloadClause,
    );
  }
```

Note: for `w === 11` (the oldest week in the 12-week window), `prevFrom`/`prevTo` fall outside the fetched date range (`gymSetsAll`/`sleepAll` are only fetched from `twelveWeeksAgoIso` onward), so `prevTonnage` and `prevSleepScores` will naturally compute as `0`/`[]` from the empty filter result — the `prevTonnage > 0` guard already skips the clause correctly for that week without needing a separate explicit check.

- [ ] **Step 3: Deploy and verify**

Deploy the function:
```bash
supabase functions deploy coach-chat --project-ref dodrzzgbdlucjbkmxbjn
```

With the same seeded data from Task 1 Step 4 still in place (or freshly re-seeded so this week's tonnage is up ≥10% and unipisteet down ≥10p vs. last week), send a real message to the coach asking directly: "Onko treenimäärässäni ja unessani ristiriitaa tällä viikolla?" — via the app UI, or via `curl` with the `x-coach-secret` header per the project's established verification pattern. Confirm the reply references the load/sleep divergence with numbers matching the seeded data. If the reply is vague, check `supabase functions logs coach-chat --project-ref dodrzzgbdlucjbkmxbjn` for the actual `buildDataContext` output isn't logged by default — instead, temporarily add `console.log(dataContext)` in `index.ts` right after `buildDataContext(sb)` is called, redeploy, trigger one request, check the logs for the overload clause text, then remove the `console.log` and redeploy again.

Clean up any test rows afterward via exact-ID delete.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/coach-chat/context.ts
git commit -m "feat: ylikuormitushuomio valmentajan viikkokontekstiin"
```

---

### Task 3: Version bump

**Files:**
- Modify: `index.html` (version chip)

- [ ] **Step 1: Bump the version chip**

Find the current version chip line (currently `v1.26.0`) and increment to `v1.27.0`, with wording matching this feature.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "v1.27.0: unipisteiden lasku ja ylikuormitushuomio"
```
