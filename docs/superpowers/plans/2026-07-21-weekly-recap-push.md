# Weekly Recap Push Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `type=weekly-recap` branch to Treeniapp's existing `check-and-notify` Edge Function that sends a Sunday-evening push summarizing the week (active days, training tonnage, avg steps/day).

**Architecture:** One new code path inside the existing `Deno.serve` handler in `supabase/functions/check-and-notify/index.ts`, gated the same way as the two existing types (`x-cron-secret` header, `app_settings.push_enabled`), delivered through the same `webpush.sendNotification` loop. A new self-contained helper function computes the week's stats via three Supabase queries scoped to `[Monday, today]` — no imports from other Edge Functions, matching this codebase's existing convention of keeping each function independently deployable (e.g. `calcSleepScore` is already duplicated between `coach-chat/context.ts` and `index.html` rather than shared).

**Tech Stack:** Deno/TypeScript Supabase Edge Function. No test framework in this project — verification is manual, via `curl` with the `x-cron-secret` header against a real Supabase project, matching the project's established pattern (see the original push-notifications plan, `docs/superpowers/plans/2026-07-10-push-ilmoitukset.md`, for precedent).

---

### Task 1: `weekly-recap` notification type

**Files:**
- Modify: `supabase/functions/check-and-notify/index.ts` (entire file — see below for the exact before/after)

The current file (as of `main`) reads:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

function todayHelsinkiIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
}
function yesterdayHelsinkiIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
}

async function hasActivityOn(sb: ReturnType<typeof createClient>, dateIso: string): Promise<boolean> {
  const [{ count: c1, error: e1 }, { count: c2, error: e2 }] = await Promise.all([
    sb.from('activity_data').select('id', { count: 'exact', head: true }).eq('activity_date', dateIso),
    sb.from('workout_sets').select('id', { count: 'exact', head: true }).eq('workout_date', dateIso),
  ]);
  if (e1) console.error('activity_data count query failed:', e1.message);
  if (e2) console.error('workout_sets count query failed:', e2.message);
  return (c1 || 0) > 0 || (c2 || 0) > 0;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const type = new URL(req.url).searchParams.get('type');
  if (type !== 'streak' && type !== 'activity') {
    return new Response('Bad Request', { status: 400 });
  }

  const sb = createClient(SB_URL, SB_SERVICE_KEY);

  const { data: settings, error: settingsError } = await sb.from('app_settings').select('push_enabled').eq('id', 1).maybeSingle();
  if (settingsError) console.error('app_settings query failed:', settingsError.message);
  if (!settings || !settings.push_enabled) return new Response('push disabled', { status: 200 });

  const today = todayHelsinkiIso();
  const todayActive = await hasActivityOn(sb, today);
  if (todayActive) return new Response('already active today', { status: 200 });

  let title: string, body: string;
  if (type === 'streak') {
    const yesterdayActive = await hasActivityOn(sb, yesterdayHelsinkiIso());
    if (!yesterdayActive) return new Response('no streak to protect', { status: 200 });
    title = 'Valkku';
    body = '🔥 Streakisi katkeamassa tänään — ehdit vielä!';
  } else {
    title = 'Valkku';
    body = 'Et ole vielä liikkunut tänään 💪';
  }

  const { data: subs, error: subsError } = await sb.from('push_subscriptions').select('*');
  if (subsError) console.error('push_subscriptions query failed:', subsError.message);
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body }),
      );
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await sb.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('push send failed:', err.message);
      }
    }
  }
  return new Response('sent', { status: 200 });
});
```

- [ ] **Step 1: Add the `mondayOfThisWeekHelsinkiIso` and `weeklyRecapStats` helpers**

Insert this immediately after the existing `hasActivityOn` function (i.e. after its closing `}`, before `Deno.serve`):

```ts
function mondayOfThisWeekHelsinkiIso(): string {
  const todayIso = todayHelsinkiIso();
  const today = new Date(`${todayIso}T00:00:00Z`);
  const dow = today.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  today.setUTCDate(today.getUTCDate() + diff);
  return today.toISOString().slice(0, 10);
}

async function weeklyRecapStats(
  sb: ReturnType<typeof createClient>,
): Promise<{ activeDays: number; tonnage: number; avgSteps: number | null }> {
  const from = mondayOfThisWeekHelsinkiIso();
  const to = todayHelsinkiIso();

  const [
    { data: activityRows, error: actErr },
    { data: setsRows, error: setsErr },
    { data: stepsRows, error: stepsErr },
  ] = await Promise.all([
    sb.from('activity_data').select('activity_date').gte('activity_date', from).lte('activity_date', to),
    sb.from('workout_sets').select('workout_date,weight_kg,reps').gte('workout_date', from).lte('workout_date', to),
    sb.from('step_data').select('steps').gte('step_date', from).lte('step_date', to),
  ]);
  if (actErr) console.error('activity_data query failed:', actErr.message);
  if (setsErr) console.error('workout_sets query failed:', setsErr.message);
  if (stepsErr) console.error('step_data query failed:', stepsErr.message);

  const activeDaySet = new Set<string>();
  (activityRows || []).forEach((r: any) => activeDaySet.add(r.activity_date));
  (setsRows || []).forEach((r: any) => activeDaySet.add(r.workout_date));

  const tonnage = (setsRows || [])
    .filter((r: any) => r.weight_kg != null && r.reps != null)
    .reduce((s: number, r: any) => s + r.weight_kg * r.reps, 0);

  const stepsVals = (stepsRows || []).map((r: any) => r.steps).filter((v: any) => v != null) as number[];
  const avgSteps = stepsVals.length
    ? Math.round(stepsVals.reduce((s: number, v: number) => s + v, 0) / stepsVals.length)
    : null;

  return { activeDays: activeDaySet.size, tonnage, avgSteps };
}
```

Note: this deliberately does NOT reuse `hasActivityOn` (which answers "is there any activity on exactly this one date") — a week-range distinct-active-day count needs two range queries collecting distinct dates, which is far cheaper than calling `hasActivityOn` once per day of the week (7× the queries for no benefit).

- [ ] **Step 2: Widen the type check to accept `weekly-recap`**

Change:
```ts
  if (type !== 'streak' && type !== 'activity') {
    return new Response('Bad Request', { status: 400 });
  }
```
to:
```ts
  if (type !== 'streak' && type !== 'activity' && type !== 'weekly-recap') {
    return new Response('Bad Request', { status: 400 });
  }
```

- [ ] **Step 3: Branch the handler on `weekly-recap` before the existing "already active today" check**

The existing "already active today" early-return only makes sense for the daily reminder types (`streak`/`activity`) — a weekly recap should fire regardless of whether *today specifically* has activity, since it summarizes the whole week. Change:
```ts
  const today = todayHelsinkiIso();
  const todayActive = await hasActivityOn(sb, today);
  if (todayActive) return new Response('already active today', { status: 200 });

  let title: string, body: string;
  if (type === 'streak') {
    const yesterdayActive = await hasActivityOn(sb, yesterdayHelsinkiIso());
    if (!yesterdayActive) return new Response('no streak to protect', { status: 200 });
    title = 'Valkku';
    body = '🔥 Streakisi katkeamassa tänään — ehdit vielä!';
  } else {
    title = 'Valkku';
    body = 'Et ole vielä liikkunut tänään 💪';
  }
```
to:
```ts
  let title: string, body: string;
  if (type === 'weekly-recap') {
    const stats = await weeklyRecapStats(sb);
    if (stats.activeDays === 0) return new Response('no activity this week', { status: 200 });
    title = 'Valkku';
    const tonnageText = `${Math.round(stats.tonnage)} kg nostettu`;
    const stepsText = stats.avgSteps != null ? `, ka ${stats.avgSteps} askelta/pv` : '';
    body = `Viikko takana: ${stats.activeDays} treeniä, ${tonnageText}${stepsText} 💪`;
  } else {
    const today = todayHelsinkiIso();
    const todayActive = await hasActivityOn(sb, today);
    if (todayActive) return new Response('already active today', { status: 200 });

    if (type === 'streak') {
      const yesterdayActive = await hasActivityOn(sb, yesterdayHelsinkiIso());
      if (!yesterdayActive) return new Response('no streak to protect', { status: 200 });
      title = 'Valkku';
      body = '🔥 Streakisi katkeamassa tänään — ehdit vielä!';
    } else {
      title = 'Valkku';
      body = 'Et ole vielä liikkunut tänään 💪';
    }
  }
```
The rest of the handler (fetching `push_subscriptions` and the `webpush.sendNotification` loop) is unchanged — both branches assign `title`/`body` before reaching it.

- [ ] **Step 4: Re-read the full file and check balance**

After editing, re-read the whole file top to bottom. Confirm: exactly one `Deno.serve(async (req) => {` block, braces/parens balanced, `title`/`body` are assigned on every code path before the `push_subscriptions` fetch (including the `weekly-recap` early-return case, which returns before reaching that point — verify the early return is actually inside the `if (type === 'weekly-recap')` block and not accidentally placed after it).

- [ ] **Step 5: Deploy and verify manually**

```bash
supabase functions deploy check-and-notify --project-ref dodrzzgbdlucjbkmxbjn
```

Then, with real logged data for the current week (at least one `workout_sets` or `activity_data` row dated this week), verify via `curl`:
```bash
curl -s -X GET "https://dodrzzgbdlucjbkmxbjn.supabase.co/functions/v1/check-and-notify?type=weekly-recap" \
  -H "x-cron-secret: <CRON_SECRET>"
```
Expected: `sent` (if a push subscription exists — check your phone for the notification and confirm the numbers match what you'd expect by manually checking the data for this week), or `no activity this week` if you deliberately test with an empty week. Also confirm `type=streak` and `type=activity` still behave exactly as before (unaffected regression check) — call both once more and confirm the responses match their pre-existing behavior (`already active today` / `no streak to protect` / `sent`, depending on today's data).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/check-and-notify/index.ts
git commit -m "feat: viikkokooste-push sunnuntai-illalle"
```

---

### Task 2: Document the new cron-job.org schedule

**Files:** none — this task produces no code changes. The schedule is already documented in `docs/superpowers/specs/2026-07-21-weekly-recap-push-design.md` (section 1); this task is a reminder to relay the manual setup step to the user after Task 1 deploys.

This is a **manual step for the user, not something to automate** — cron-job.org has no public API in this project's setup, matching how the original two schedules were configured (per `docs/superpowers/specs/2026-07-10-push-ilmoitukset-design.md` section 7, "konfiguroidaan manuaalisesti cron-job.org:n webkäyttöliittymässä... ei automatisoitavissa koodilla").

- [ ] **Step 1: After Task 1 is deployed and verified, tell the user to add one new scheduled job in cron-job.org**

Report this to the user in plain text (no code needed):

> Add a third scheduled job in your cron-job.org account:
> - **Schedule:** Sundays, 19:00 Europe/Helsinki
> - **URL:** `GET https://dodrzzgbdlucjbkmxbjn.supabase.co/functions/v1/check-and-notify?type=weekly-recap`
> - **Header:** `x-cron-secret: <your CRON_SECRET value>`
>
> This mirrors the two existing jobs (17:30 streak-warning, 19:30 activity-reminder) already configured there.

No commit needed for this task — it's a runtime configuration step outside the codebase.
