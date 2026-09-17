# Sali Weight-Plateau Hint — Design Spec

## Overview

Treeniapp's Sali page already auto-suggests a weight bump when a set is logged "cleanly"
(`renderSession`'s "Puhtaasti suoritettu" block, ~index.html:3300-3335): if reps didn't decline
across sets in the *immediately previous* session for an exercise, the next session prefills a
+2.5%-rounded-to-2.5kg suggestion. That heuristic has a real gap: it checks whether reps declined
*within* one session, not whether reps actually met the exercise's *assigned target*. A lifter who
consistently does e.g. 12/11/10 reps against a target of "3×10" is hitting target every time, but
because reps "declined" across those sets, `cleanly` is false and the app never suggests a bump —
the exercise can plateau at the same weight indefinitely without the user (or the app) noticing.

This feature adds an explicit, independent check: if an exercise's two most recent occurrences of
the *same programmed session* (e.g. Treeni 1's Rintapunnerruslaite, not conflated with Treeni 4's
Rintapunnerruslaite if the same movement appears in both) both hit the assigned target reps on
every set, at the identical weight, show an inline hint suggesting a weight increase — independent
of whatever the existing quiet auto-prefill did or didn't do.

## Data & Detection Logic

**Why session_type-scoped, not just "last 2 times logged":** several exercises appear in more than
one programmed session per week (e.g. "Smith-kalteva penkki" is in both Treeni 1 and Treeni 4).
Naively taking "the last 2 times this exercise name was logged" would compare across different
session slots with potentially different targets and different weekly cadence, which isn't what
"stuck for 2 sessions in a row" means. The comparison must be: the last 2 occurrences of this
exercise *within this same session_type*.

**New client-side cache**, loaded alongside the existing `loadPrevSession` call (same trigger:
when a day's session is opened), NOT folded into `prevCache` — `prevCache` is single-most-recent
and session_type-agnostic by design (existing, reviewed behavior; out of scope to change here).

```js
// stuckCache[exerciseName] = { weight } — present only when stuck; absent otherwise.
//   weight — the identical weight_kg used across both of the last 2 occurrences of this
//            exercise within today's session_type.
//   Populated by loadStuckWeightCache(o, d, requestId), called once per session open.
let stuckCache = {};

async function loadStuckWeightCache(o, d, requestId) {
  stuckCache = {};
  const st = getActiveSession(o, d), sess = SESS[st];
  if (!sess || !sess.ex || !sess.ex.length) return;

  const names = sess.ex.map(e => e.n);
  const mon = wStart(o), dt = new Date(mon.date);
  dt.setDate(mon.date.getDate() + d);
  const todayStr = localIso(dt);

  const { data, error } = await sb
    .from('workout_sets')
    .select('workout_date,exercise_name,set_number,weight_kg,reps')
    .in('exercise_name', names)
    .eq('session_type', st)
    .lt('workout_date', todayStr)
    .order('workout_date', { ascending: false })
    .order('set_number',   { ascending: true  })
    .limit(400);

  if (requestId !== treeniRequestId) return;
  if (error) { console.error('loadStuckWeightCache failed:', error.message); return; }
  if (!data) return;

  // Group by exercise, keep only the 2 most recent distinct dates per exercise.
  const byExercise = {};
  data.forEach(r => {
    if (!byExercise[r.exercise_name]) byExercise[r.exercise_name] = { dates: [], byDate: {} };
    const eb = byExercise[r.exercise_name];
    if (!eb.byDate[r.workout_date]) {
      if (eb.dates.length >= 2) return; // already have the 2 most recent dates
      eb.dates.push(r.workout_date);
      eb.byDate[r.workout_date] = [];
    }
    if (eb.dates.includes(r.workout_date)) eb.byDate[r.workout_date].push(r);
  });

  sess.ex.forEach(ex => {
    const targetReps = parseTargetReps(ex.t);
    if (targetReps === null) return; // time-based or unparseable target (e.g. "3×45s") — skip
    const eb = byExercise[ex.n];
    if (!eb || eb.dates.length < 2) return; // fewer than 2 prior occurrences this session_type

    // Note: `eb.dates` holds date STRINGS, mapped here to arrays of set-rows — deliberately
    // not named `d` for the lambda param, since `d` is already this function's day-of-week arg.
    const [setsA, setsB] = eb.dates.map(dateStr => eb.byDate[dateStr]);
    const hitTarget = rows => rows.length > 0 && rows.every(r => (r.reps || 0) >= targetReps);
    if (!hitTarget(setsA) || !hitTarget(setsB)) return;

    const w1 = setsA[0].weight_kg;
    if (w1 == null) return;
    const sameWeight = setsA.every(r => r.weight_kg === w1) && setsB.every(r => r.weight_kg === w1);
    if (!sameWeight) return;

    stuckCache[ex.n] = { weight: w1 };
  });
}

// "3×10" -> 10, "4×12" -> 12, "3×45s" -> null (not a rep-based target)
function parseTargetReps(targetDisplay) {
  const m = /×\s*(\d+)\s*$/.exec(targetDisplay || '');
  return m ? parseInt(m[1], 10) : null;
}
```

Called from the same place `loadPrevSession` is called (search for its call site in the day-open
flow) with the same `requestId` guard pattern already used throughout the file.

## Suggested Weight

Reuse the exact rounding rule already used for auto-progression (index.html:~3320-3325), applied
to `stuckCache[ex.n].weight`:

```js
function suggestBumpedWeight(weight) {
  let suggested = Math.round((weight * 1.025) / 2.5) * 2.5;
  if (suggested <= weight) suggested = weight + 2.5;
  return suggested;
}
```

## UI

A slim banner inside the exercise block, between `.ex-block-header` and `.ex-set-table` — same
visual family as the existing `.day-nudge-banner` pattern (index.html:598-610), scoped to one
exercise rather than the whole page. Uses the `--green` token family (same green already used for
the redesign's progression badge), since this is a positive/actionable "you're ready to grow"
signal, distinct from the PR badge's amber.

```html
<!-- suggestedKg here is suggestBumpedWeight(stuckCache[ex.n].weight), computed at render time -->
<div class="ex-stuck-hint" id="ex-stuck-${wOff}-${aDay}-${exId}">
  <span>💪 Sama paino 2 kertaa putkeen, kaikki toistot täynnä</span>
  <button onclick="applySuggestedWeight(${wOff},${aDay},${exId})">Kokeile ${suggestedKg} kg</button>
</div>
```

```css
.ex-stuck-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 12px; margin-bottom: 8px;
  background: var(--green-bg); border: 1px solid rgba(47,255,126,0.25);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm); color: var(--text2);
}
.ex-stuck-hint button {
  flex: none; font-size: var(--fs-xs); font-weight: 700; color: #032b12;
  background: var(--green); border: none; border-radius: 6px; padding: 6px 10px;
}
```

(`--green-bg: rgba(47,255,126,0.12)` already exists in `:root` at index.html:35 — used elsewhere,
e.g. `.koonti-card--done`, `.complete-btn.done`. No new token needed.)

## Interaction

- The hint renders only when `stuckCache[ex.n]` is set AND the exercise has no sets logged yet
  today (`noSetsYet`, same gate the existing auto-prefill uses) — i.e., before you've touched this
  exercise today. This is deliberately the same gating condition already used for the "cleanly
  performed" auto-suggestion, so the two mechanisms are visually consistent about *when* they can
  appear (though independent in *what* they check).
- Tapping the button calls `applySuggestedWeight(o, d, exId)`, which prefills every set's `kg` to
  the calculated suggested weight and `reps` to the exercise's target rep count (not last time's
  literal reps — the point is to try the target rep count at a higher weight), marks each set
  `prefilled: true` (identical mechanism to `prefillExercise`/the auto-suggestion — this reuses the
  existing prefilled/confirm-tap/promotion-animation UI from the redesign shipped 2026-09-15, no
  new set-state work needed), and hides the banner.
- No persistent "dismiss" state. If the user ignores the hint and starts typing into a set manually,
  the banner disappears on the next render pass along with any other "no sets yet" affordance
  (mirrors how the "↓ Käytä edell." button already disappears once sets exist) — no need to track a
  dismissed-but-still-stuck state across reloads.

## Non-Goals / Explicit Simplifications

- **Not calendar-week-aligned.** "2 sessions in a row" means the two most recent times this
  exercise was logged under this exact session_type, not "the last 2 distinct ISO weeks with no
  gap." If a session was skipped one week, the comparison still uses the two most recent actual
  occurrences. Good enough for the stated goal; strict week-gap validation is unnecessary
  complexity for a hint that's easy to ignore if wrong.
- **No interaction with the existing auto-progression/"cleanly" logic.** The two mechanisms run
  independently and can disagree (e.g. auto-progression already prefilled the same old weight
  because `cleanly` was false, while this hint separately notices the target was actually met both
  times and suggests a bump). This is intentional — this feature exists specifically to catch what
  the existing heuristic misses.
- **Target reps come from the exercise's current `target_display`,** not whatever was programmed
  at the time of the two historical sessions being compared. If a user edited the target between
  then and now, the check uses the current target. Acceptable simplification — programs change
  infrequently in this app based on observed usage.
- **Time/bodyweight-based exercises (target ending in a unit other than a bare rep count, e.g.
  "3×45s") are silently skipped.** No hint mechanism for those in this feature.

## Testing

No automated test framework exists in this repo. Verification will be manual, in-browser, against
an isolated future date with fabricated data seeded (and deleted afterward — see the explicit
lesson from the prior Sali redesign's testing incident: a future date is not self-cleaning, always
delete-and-verify-empty after manual browser testing against production Supabase data).
