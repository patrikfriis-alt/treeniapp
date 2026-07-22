# Body Composition Trend Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fat%/muscle% trend insights to Treeniapp's Koonti "Huomioita" section, mirroring the existing weight-trend insight, plus surface both metrics in the AI coach's weekly context.

**Architecture:** Two new insight blocks in `loadHuomioita()` (index.html), copy-pasted from the existing weight-trend block with the field name and unit swapped — same monotonic-3-week-trend logic, same `insights` array. One widened query plus two new per-week variables in `context.ts`'s weekly-summary loop, appended to the existing per-week line. No schema changes — `body_metrics.fat_pct`/`muscle_pct` already exist and are already populated via the existing manual-entry form.

**Tech Stack:** Vanilla JS (index.html), Deno/TypeScript (`coach-chat/context.ts`). No test framework — manual verification per this project's established pattern.

---

### Task 1: Fat%/muscle% trend insights in Koonti

**Files:**
- Modify: `index.html:2094` (widen the `weightRows` query)
- Modify: `index.html` (insert two new insight blocks after the existing "Paino" block, around line 2133)

- [ ] **Step 1: Widen the `weightRows` query**

Current code (`index.html:2094`):
```js
    sb.from('body_metrics').select('weight_kg,measured_at').gte('measured_at', from21).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
```
Change to:
```js
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').gte('measured_at', from21).lte('measured_at', todayIso).order('measured_at', { ascending: true }),
```
The existing "Paino" insight block only reads `r.weight_kg` and is unaffected by the extra columns.

- [ ] **Step 2: Add the two new insight blocks**

Current code (`index.html:2122-2133`):
```js
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
```
Insert this immediately after it (before the blank line that precedes the "Uni" insight block):
```js

  // Rasva%: monotoninen trendi viim. 3 viikolla, väh. 3 mittausta, kokonaismuutos >= 1.0pp
  const fatWithVal = (weightRows || []).filter(r => r.fat_pct != null);
  if (fatWithVal.length >= 3) {
    const vals = fatWithVal.map(r => r.fat_pct);
    const nonIncreasing = vals.every((v, i) => i === 0 || v <= vals[i - 1]);
    const nonDecreasing = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
    const totalChange = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10;
    if ((nonIncreasing || nonDecreasing) && Math.abs(totalChange) >= 1) {
      const dir = totalChange < 0 ? 'laskenut' : 'noussut';
      insights.push({ text: `Rasva% ${dir} ${Math.abs(totalChange)}pp viimeisen 3 viikon aikana`, magnitude: Math.abs(totalChange) / vals[0] });
    }
  }

  // Lihas%: monotoninen trendi viim. 3 viikolla, väh. 3 mittausta, kokonaismuutos >= 1.0pp
  const muscleWithVal = (weightRows || []).filter(r => r.muscle_pct != null);
  if (muscleWithVal.length >= 3) {
    const vals = muscleWithVal.map(r => r.muscle_pct);
    const nonIncreasing = vals.every((v, i) => i === 0 || v <= vals[i - 1]);
    const nonDecreasing = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
    const totalChange = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10;
    if ((nonIncreasing || nonDecreasing) && Math.abs(totalChange) >= 1) {
      const dir = totalChange < 0 ? 'laskenut' : 'noussut';
      insights.push({ text: `Lihas% ${dir} ${Math.abs(totalChange)}pp viimeisen 3 viikon aikana`, magnitude: Math.abs(totalChange) / vals[0] });
    }
  }
```
Note: `fatWithVal`/`muscleWithVal` deliberately use their OWN independent null-filtering of `weightRows` (not reusing `weightsWithVal`, which is filtered on `weight_kg != null` specifically) — a row can have a weight measurement without a fat%/muscle% measurement (the manual-entry form allows partial data), so each metric's trend must be computed from only the rows where THAT metric is present, same as how `weightsWithVal` itself only considers rows with `weight_kg`.

- [ ] **Step 3: Verify with fabricated data via browser console or direct arithmetic trace**

Trace through the code with example values: `fatWithVal` values `[38.2, 37.5, 36.9]` (3 measurements, monotonically decreasing) → `totalChange = Math.round((36.9 - 38.2) * 10) / 10 = -1.3`, `Math.abs(-1.3) >= 1` → fires, text `"Rasva% laskenut 1.3pp viimeisen 3 viikon aikana"`. Also trace a non-monotonic case (`[38.2, 39.0, 36.9]`) and confirm it does NOT fire even though total change is -1.3 (since `nonIncreasing` and `nonDecreasing` are both false).

Then, with real or seeded `body_metrics` rows (via the keho page's manual-entry form or the Supabase dashboard) meeting the threshold, load Koonti in a browser and confirm the insight text appears exactly as computed above. Clean up any test rows afterward via exact-ID delete (per project convention — never a broad date-range delete).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: rasva%- ja lihas%-trendihuomiot Koontiin"
```

---

### Task 2: Fat%/muscle% in the AI coach's weekly context

**Files:**
- Modify: `supabase/functions/coach-chat/context.ts:89` (widen the `body_metrics` query)
- Modify: `supabase/functions/coach-chat/context.ts:135-136` (add `weekFat`/`weekMuscle`)
- Modify: `supabase/functions/coach-chat/context.ts:177-182` (append to the weekly summary line)

- [ ] **Step 1: Widen the `body_metrics` query**

Current code (`context.ts:89`):
```ts
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
```
Change to:
```ts
    sb.from('body_metrics').select('weight_kg,fat_pct,muscle_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
```
The existing `calcBmr(profile, latestWeight)` call (around line 234) reads `weightRow.fat_pct` only — unaffected by the extra `muscle_pct` column.

- [ ] **Step 2: Add `weekFat`/`weekMuscle` next to the existing `weekWeight`**

Current code (`context.ts:135-136`):
```ts
    const weekWeights = (weightRows || []).filter((r: any) => r.measured_at >= from && r.measured_at <= to);
    const weekWeight = weekWeights.length ? weekWeights[weekWeights.length - 1].weight_kg : null;
```
Change to:
```ts
    const weekWeights = (weightRows || []).filter((r: any) => r.measured_at >= from && r.measured_at <= to);
    const weekWeight = weekWeights.length ? weekWeights[weekWeights.length - 1].weight_kg : null;
    const weekFat = weekWeights.length ? weekWeights[weekWeights.length - 1].fat_pct : null;
    const weekMuscle = weekWeights.length ? weekWeights[weekWeights.length - 1].muscle_pct : null;
```
Same "latest measurement in the week" logic as `weekWeight`, just reading the other two fields off the same row.

- [ ] **Step 3: Append to the weekly summary line**

Current code (`context.ts:177-182`):
```ts
    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}, unipisteet keskim. ${avgSleepScore != null ? avgSleepScore + 'p' : '—'}.` +
      overloadClause,
    );
```
Change to:
```ts
    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `rasva% ${weekFat != null ? weekFat + '%' : '—'}, lihas% ${weekMuscle != null ? weekMuscle + '%' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}, unipisteet keskim. ${avgSleepScore != null ? avgSleepScore + 'p' : '—'}.` +
      overloadClause,
    );
```

- [ ] **Step 4: Verify**

Re-read the full `buildDataContext` function after editing to confirm braces/parens balance and that `weekFat`/`weekMuscle` are genuinely in scope where used (declared earlier in the same loop iteration, same as `weekWeight`).

Deploy:
```bash
supabase functions deploy coach-chat --project-ref dodrzzgbdlucjbkmxbjn
```

With real `body_metrics` data logged for the current week (fat%/muscle% both set), ask the coach something referencing body composition (e.g. "Miten kehonkoostumukseni on kehittynyt?") and confirm the reply references numbers consistent with what you logged. If the reply doesn't clearly reference it, check `supabase functions logs coach-chat --project-ref dodrzzgbdlucjbkmxbjn`, or temporarily add `console.log(dataContext)` right after `buildDataContext(sb)` is called in `index.ts`, redeploy, trigger one request, check the logs for the `rasva%`/`lihas%` clauses, then remove the `console.log` and redeploy again.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/coach-chat/context.ts
git commit -m "feat: rasva%/lihas% valmentajan viikkokontekstiin"
```

---

### Task 3: Version bump

**Files:**
- Modify: `index.html` (version chip)

- [ ] **Step 1: Bump the version chip**

Find the current version chip line and increment it by one minor version, with wording matching this feature.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "v1.28.0: rasva%- ja lihas%-trendihuomiot"
```
