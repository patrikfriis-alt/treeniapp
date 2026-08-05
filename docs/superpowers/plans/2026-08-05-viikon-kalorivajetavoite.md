# Viikon kalorivajetavoite (1 % painonpudotus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing "Viikon kalorit" row in Koonti's "Tällä viikolla" card to show, alongside the actual weekly net calorie figure, a target weekly deficit that corresponds to losing 1% of current bodyweight per week.

**Architecture:** `getBmrInfo()` already fetches the latest `body_metrics.weight_kg` row internally but doesn't return it — add `weightKg` to its return value (one-line change, no new query). `loadWeeklyReportCard()` already computes the actual weekly net (`foodKcal - bmr*days - exerciseKcal`) — add a goal calculation (`weightKg * 0.01 * 7700`) right next to it and change the row's displayed string from `<net> kcal` to `<net> / <goal> kcal`, matching the "actual / goal" format already used elsewhere in the app (e.g. the Ruoka page's weekly row).

**Tech Stack:** Vanilla JS (`index.html`). No test framework — manual verification per this project's established pattern (arithmetic trace + real browser check via a local static server).

---

### Task 1: Return bodyweight from `getBmrInfo()`, use it in the weekly card

**Files:**
- Modify: `index.html:2779-2792` (`getBmrInfo`)
- Modify: `index.html:1977-1990` (`loadWeeklyReportCard`, the "Viikon kalorit" block)

- [ ] **Step 1: Add `weightKg` to `getBmrInfo()`'s return value**

Current code (`index.html:2779-2792`):
```js
async function getBmrInfo() {
  const profile = await loadUserProfile();
  if (!profile || !profile.sex || !profile.height_cm || !profile.birth_date) {
    return { bmr: null, missingProfile: true, missingWeight: false };
  }
  const { data: weightRows, error } = await sb.from('body_metrics').select('weight_kg,fat_pct')
    .order('measured_at', { ascending: false }).limit(1);
  if (error) console.error('getBmrInfo weight fetch failed:', error.message);
  const weightRow = weightRows && weightRows[0];
  if (!weightRow || weightRow.weight_kg == null) {
    return { bmr: null, missingProfile: false, missingWeight: true };
  }
  return { bmr: calcBmr(profile, weightRow), missingProfile: false, missingWeight: false };
}
```
Change to:
```js
async function getBmrInfo() {
  const profile = await loadUserProfile();
  if (!profile || !profile.sex || !profile.height_cm || !profile.birth_date) {
    return { bmr: null, weightKg: null, missingProfile: true, missingWeight: false };
  }
  const { data: weightRows, error } = await sb.from('body_metrics').select('weight_kg,fat_pct')
    .order('measured_at', { ascending: false }).limit(1);
  if (error) console.error('getBmrInfo weight fetch failed:', error.message);
  const weightRow = weightRows && weightRows[0];
  if (!weightRow || weightRow.weight_kg == null) {
    return { bmr: null, weightKg: null, missingProfile: false, missingWeight: true };
  }
  return { bmr: calcBmr(profile, weightRow), weightKg: weightRow.weight_kg, missingProfile: false, missingWeight: false };
}
```
This is purely additive — every existing caller of `getBmrInfo()` (`loadDeficitHeroMetric`, `openDeficitBreakdownModal`, `openProfileModal`, `loadWeeklyReportCard`) only reads `.bmr`/`.missingProfile`/`.missingWeight` today, so none of them are affected by the new field.

- [ ] **Step 2: Show the goal alongside the actual weekly net**

Current code (`index.html:1977-1990`):
```js
  const bmrInfo = await getBmrInfo();
  if (bmrInfo.bmr != null) {
    const mon = wStart(wOff);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const [exerciseKcal, foodKcal] = await Promise.all([
      getExerciseCalories(mon.iso, localIso(sun)),
      getFoodCalories(mon.iso, localIso(sun)),
    ]);
    const elapsedDays = wOff === 0 ? (todayIdx() + 1) : 7;
    const weeklyNet = Math.round(foodKcal - bmrInfo.bmr * elapsedDays - exerciseKcal);
    const weeklySign = weeklyNet >= 0 ? '+' : '';
    rows.push(`<div class="hist-item"><div class="hist-label">Viikon kalorit</div><div class="hist-val">${weeklySign}${weeklyNet} kcal</div></div>`);
  }
```
Change to:
```js
  const bmrInfo = await getBmrInfo();
  if (bmrInfo.bmr != null) {
    const mon = wStart(wOff);
    const sun = new Date(mon.date);
    sun.setDate(mon.date.getDate() + 6);
    const [exerciseKcal, foodKcal] = await Promise.all([
      getExerciseCalories(mon.iso, localIso(sun)),
      getFoodCalories(mon.iso, localIso(sun)),
    ]);
    const elapsedDays = wOff === 0 ? (todayIdx() + 1) : 7;
    const weeklyNet = Math.round(foodKcal - bmrInfo.bmr * elapsedDays - exerciseKcal);
    const weeklySign = weeklyNet >= 0 ? '+' : '';
    let weeklyValStr = `${weeklySign}${weeklyNet} kcal`;
    if (bmrInfo.weightKg != null) {
      const goalWeeklyDeficit = Math.round(bmrInfo.weightKg * 0.01 * 7700);
      weeklyValStr = `${weeklySign}${weeklyNet} / -${Math.abs(goalWeeklyDeficit)} kcal`;
    }
    rows.push(`<div class="hist-item"><div class="hist-label">Viikon kalorit</div><div class="hist-val">${weeklyValStr}</div></div>`);
  }
```
Note the goal is always expressed as a deficit (shown with a leading `-`), since the whole point of this row is "how close are you to the deficit needed for 1% weekly loss" — there's no bulking/surplus mode here. `Math.abs(...)` guards against a nonsensical negative bodyweight producing a double-negative string (can't happen in practice, but keeps the string construction correct regardless).

- [ ] **Step 3: Arithmetic trace**

With `weightKg = 113.7`: `113.7 * 0.01 = 1.137`, `1.137 * 7700 = 8754.9`, `Math.round(8754.9) = 8755`. So the row should read e.g. `+64 / -8755 kcal` if `weeklyNet` were `+64`, or `-3200 / -8755 kcal` if `weeklyNet` were `-3200`.

- [ ] **Step 4: Manual verification in a browser**

Start a local static server and open the app:
```bash
python3 -m http.server 8800
```
Open `http://localhost:8800/index.html` in a browser, go to Koonti, scroll to "Tällä viikolla", and confirm the "Viikon kalorit" row shows `<actual> / -<goal> kcal` with the goal matching the arithmetic trace above for your current logged weight (check the "Keho" card's displayed weight to know what to expect). Check the browser console for errors (none expected).

The "no profile/weight set" case is guarded by the pre-existing `bmrInfo.bmr != null` check around the entire block, which this change does not touch or weaken — that guard is already proven correct by today's production behavior (the row already doesn't render when profile/weight is missing), so no new test is needed for it here.

Stop the local server when done:
```bash
pkill -f "http.server 8800"
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: viikon kalorivajetavoite (1 % painonpudotus) Tällä viikolla -korttiin"
```

---

### Task 2: Version bump

**Files:**
- Modify: `index.html:1247` (version chip)

- [ ] **Step 1: Bump the version chip**

Current code (`index.html:1247`):
```html
    <div class="version-chip" style="margin:0">v1.28.0</div>
```
Change to:
```html
    <div class="version-chip" style="margin:0">v1.29.0</div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "v1.29.0: viikon kalorivajetavoite"
```

---

### Task 3: Deploy

**Files:** none (no backend changes in this feature — pure client-side)

- [ ] **Step 1: Push to trigger the GitHub Pages deploy**

```bash
git push origin main
```

- [ ] **Step 2: Verify the live site picked up the change**

```bash
sleep 60 && curl -s "https://patrikfriis-alt.github.io/treeniapp/?cb=$RANDOM" | grep -o "goalWeeklyDeficit" | head -1
```
Expected output: `goalWeeklyDeficit` (confirms the new code is live). If empty, wait another 30-60s and retry — GitHub Pages rebuilds are not instant.
