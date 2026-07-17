# Unen synkkaus ja unipisteet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Apple Shortcuts automation that syncs sleep-stage data (duration, deep, REM, awakenings) automatically each morning into the existing `sleep_data` table, and compute a 0-100 "unipisteet" (sleep score) from that data — shown on the Uni page hero, the Koonti dashboard card, and folded into the AI coach's weekly context.

**Architecture:** No database schema changes — `sleep_data` already has every column needed (`duration_min`, `deep_sleep_min`, `rem_sleep_min`, `awakenings`). This plan adds: a documented Shortcuts automation (mirroring the existing workout/step sync guides), a pure client-side scoring function computed on read (never stored), the same scoring logic ported to the coach's Deno Edge Function for its weekly summaries, and small UI updates to two already-existing display spots.

**Tech Stack:** Vanilla JS in `index.html`, Deno/TypeScript in `supabase/functions/coach-chat/context.ts`, Apple Shortcuts (iOS) — no build step, no test framework, no migrations.

---

### Task 1: Apple Shortcuts guide — Unen synkkaus

**Files:**
- Modify: `docs/apple-watch-shortcuts-guide.md`
- Modify: `docs/apple-watch-shortcuts-guide-en.md`

Both guides currently end after "## 7. Askelmäärän synkkaus" / "## 7. Step Count Sync". Add a new "## 8." section after it in each file, plus one new troubleshooting bullet in section 6.

- [ ] **Step 1: Append to `docs/apple-watch-shortcuts-guide.md`**

Add this content at the end of the file:

```markdown

## 8. Unen synkkaus

Uni ei ole treenin kaltainen yksittäinen tapahtuma eikä askelten kaltainen jatkuvasti kasvava luku — se on aikaleimattuja vaihejaksoja (kevyt/syvä/REM/hereillä) joita Watch tallentaa yön aikana. Tämä automaatio ajetaan kerran päivässä aamulla, jolloin edellisen yön data on jo kokonaan synkronoitunut.

### Luo automaatio

1. Avaa **Shortcuts** → **Automaatio**-välilehti → **+** (Luo henkilökohtainen automaatio)
2. Valitse laukaisin: **Kellonaika** (Time of Day) → valitse aamun ajankohta (esim. 9:00) → aseta **Suorita heti**

### Hae yön unijaksot

Unen eri vaiheet (Core/Deep/REM/Awake) haetaan erikseen, koska kukin tarvitaan omana summanaan tai lukumääränään.

1. Lisää neljä **Etsi terveysnäytteet** (Find Health Samples) -toimintoa, kukin näytetyypillä **Sleep Analysis** (Uni-analyysi), ajankohtana **Viimeiset 24 tuntia** (kokeile myös **Eilen** jos "Viimeiset 24 tuntia" ei osu oikeaan yöhön):
   - Yksi suodattimella (Filter) "Uni-analyysi on Nukkuu (Syvä)" ("Sleep Analysis is Asleep (Deep)")
   - Yksi suodattimella "Uni-analyysi on Nukkuu (REM)" ("Sleep Analysis is Asleep (REM)")
   - Yksi suodattimella "Uni-analyysi on Nukkuu (Kevyt)" ("Sleep Analysis is Asleep (Core)")
   - Yksi suodattimella "Uni-analyysi on Hereillä" ("Sleep Analysis is Awake")
2. Kolmelle ensimmäiselle (Syvä/REM/Kevyt): lisää **Calculate Statistics** -toiminto kunkin jälkeen, operaationa **Summa** (Sum) kestosta (Duration) → tallenna muuttujiin `DeepMin`, `RemMin`, `CoreMin`
3. Neljännelle (Hereillä): lisää **Calculate Statistics** -toiminto, operaationa **Lukumäärä** (Count) → tallenna muuttujaan `Awakenings`
4. Lisää **Aseta muuttuja** -toiminto laskemaan kokonaiskesto: `DeepMin + RemMin + CoreMin` → tallenna muuttujaan `TotalMin`
5. Lisää **Format Date** -toiminto **Nykyiselle päivämäärälle**, muodossa `yyyy-MM-dd`, tallenna muuttujaan `Today`

### Lähetä Supabaseen

**Hae sisältö URL:sta** (Get Contents of URL):
- Metodi: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/sleep_data?on_conflict=sleep_date`
- Headerit:
  - `apikey`: `<anon-avain index.html:sta>`
  - `Authorization`: `Bearer <sama anon-avain>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Runko (JSON):
  ```json
  { "sleep_date": "[Today]", "duration_min": [TotalMin], "deep_sleep_min": [DeepMin], "rem_sleep_min": [RemMin], "awakenings": [Awakenings] }
  ```

### Testaa

Paina automaation kohdalla **"Kokeile"** (Run) manuaalisesti — tarkista että edelliselle yölle ilmestyy rivi `sleep_data`-tauluun kaikilla neljällä kentällä täytettynä. Tarkat toimintonimet (erityisesti suodatinvaihtoehdot) saattavat poiketa hieman tästä ohjeesta iOS-version mukaan — jos et löydä täsmälleen näitä nimiä, katso mitä suodatinvaihtoehtoja **Etsi terveysnäytteet** todella tarjoaa Uni-analyysi-näytetyypille ja säädä vastaavasti.
```

Then add one bullet to the existing "## 6. Vianetsintä" section (insert as the last bullet, after the askel-bullet):

```markdown
- Jos unen kentät eivät täyty (syvä uni / REM / heräilyt jäävät tyhjiksi): tarkista että käytit oikeaa Uni-analyysi-suodatinta kussakin **Etsi terveysnäytteet** -toiminnossa, ja että Watch on tallentanut vaihekohtaista dataa (vanhemmat Watch-mallit tai watchOS-versiot saattavat tallentaa vain yhden yhtenäisen "Nukkuu"-arvon ilman vaihejakoa — tässä tapauksessa vaihekohtaisia kenttiä ei voi täyttää eikä unipisteitä voida laskea).
```

- [ ] **Step 2: Append the matching English section to `docs/apple-watch-shortcuts-guide-en.md`**

Add this content at the end of the file:

```markdown

## 8. Sleep Sync

Sleep isn't a discrete event like a workout, or a simple growing number like steps — it's a series of timestamped stage segments (light/deep/REM/awake) the Watch records overnight. This automation runs once a day in the morning, by which point the previous night's data has fully synced.

### Create the automation

1. Open **Shortcuts** → **Automation** tab → **+** (Create Personal Automation)
2. Choose trigger: **Time of Day** → pick a morning time (e.g. 9:00) → set **Run Immediately**

### Read the night's sleep stages

Each sleep stage (Core/Deep/REM/Awake) is queried separately, since each needs its own sum or count.

1. Add four **Find Health Samples** actions, each with Sample Type **Sleep Analysis**, Date **Last 24 Hours** (also try **Yesterday** if "Last 24 Hours" doesn't land on the right night):
   - One filtered "Sleep Analysis is Asleep (Deep)"
   - One filtered "Sleep Analysis is Asleep (REM)"
   - One filtered "Sleep Analysis is Asleep (Core)"
   - One filtered "Sleep Analysis is Awake"
2. For the first three (Deep/REM/Core): add a **Calculate Statistics** action after each, operation **Sum** on Duration → store in variables `DeepMin`, `RemMin`, `CoreMin`
3. For the fourth (Awake): add a **Calculate Statistics** action, operation **Count** → store in variable `Awakenings`
4. Add a **Set Variable** action computing total duration: `DeepMin + RemMin + CoreMin` → store in `TotalMin`
5. Add a **Format Date** action for **Current Date**, formatted as `yyyy-MM-dd`, stored as `Today`

### Push it to Supabase

**Get Contents of URL:**
- Method: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/sleep_data?on_conflict=sleep_date`
- Headers:
  - `apikey`: `<anon key from index.html>`
  - `Authorization`: `Bearer <same anon key>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Request body (JSON):
  ```json
  { "sleep_date": "[Today]", "duration_min": [TotalMin], "deep_sleep_min": [DeepMin], "rem_sleep_min": [RemMin], "awakenings": [Awakenings] }
  ```

### Test it

Tap **"Run"** on the automation manually — confirm a row for the previous night appears in the `sleep_data` table with all four fields filled in. Exact action names (especially the filter options) may vary slightly by iOS version from what's described here — if you can't find these exact labels, check what filter options **Find Health Samples** actually offers for the Sleep Analysis sample type and adjust accordingly.
```

Then add one bullet to the existing "## 6. Troubleshooting" section (insert as the last bullet, after the steps-bullet):

```markdown
- **Sleep fields stay empty (deep/REM/awakenings never populate):** check you used the correct Sleep Analysis filter in each **Find Health Samples** action, and that the Watch actually recorded stage-level data (older Watch models or watchOS versions may only record a single combined "Asleep" value with no stage breakdown — in that case the stage-specific fields can't be filled and a sleep score can't be computed).
```

- [ ] **Step 3: Commit**

```bash
git add docs/apple-watch-shortcuts-guide.md docs/apple-watch-shortcuts-guide-en.md
git commit -m "docs: unen synkkausohje Shortcuts-oppaisiin"
```

---

### Task 2: Sleep score calculation + UI

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `calcSleepScore()`**

Find `function calc1RM(kg, reps) {` and insert this new function directly before it:

```javascript
function calcSleepScore(row) {
  if (!row) return null;
  const { duration_min, deep_sleep_min, rem_sleep_min, awakenings } = row;
  if (duration_min == null || deep_sleep_min == null || rem_sleep_min == null || awakenings == null) return null;
  if (duration_min <= 0) return null;
  const durationScore = Math.min(40, Math.round(duration_min / 480 * 40));
  const deepPct = deep_sleep_min / duration_min * 100;
  const deepScore = Math.max(0, Math.min(25, 25 - Math.abs(deepPct - 18) * 1.5));
  const remPct = rem_sleep_min / duration_min * 100;
  const remScore = Math.max(0, Math.min(20, 20 - Math.abs(remPct - 22.5) * 1.2));
  const awakeningsScore = Math.max(0, 15 - awakenings * 5);
  return Math.round(durationScore + deepScore + remScore + awakeningsScore);
}

```

- [ ] **Step 2: Show the score on the Uni page hero**

Find (inside `loadSleep()`):

```javascript
  const heroSleepSubEl = document.getElementById('hero-sleep-sub');
  const deepEl         = document.getElementById('hero-sleep-deep');
  if (data && data[0]) {
    if (heroSleepSubEl) heroSleepSubEl.textContent = data[0].sleep_date || '';
    if (deepEl)         deepEl.textContent          = data[0].deep_sleep_min ? data[0].deep_sleep_min + ' min' : '—';
  }
```

Replace with:

```javascript
  const heroSleepSubEl = document.getElementById('hero-sleep-sub');
  const deepEl         = document.getElementById('hero-sleep-deep');
  if (data && data[0]) {
    if (heroSleepSubEl) {
      const score = calcSleepScore(data[0]);
      heroSleepSubEl.textContent = score != null ? `Unipisteet: ${score}` : 'Unipisteet: —';
    }
    if (deepEl)         deepEl.textContent          = data[0].deep_sleep_min ? data[0].deep_sleep_min + ' min' : '—';
  }
```

- [ ] **Step 3: Show the score on the Koonti Uni card**

Find (inside `loadKoonti()`):

```javascript
  const { data: sleepRows } = await sb.from('sleep_data')
    .select('duration_min,sleep_date')
    .order('sleep_date', { ascending: false }).limit(7);
  const kcUniCard = document.getElementById('kc-uni');
  const kcUniSub = document.getElementById('kc-uni-sub');
  kcUniSub.classList.remove('skel-sub');
  const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
  kcUniCard.classList.toggle('koonti-card--done', uniDoneToday);
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
    const withDur = sleepRows.filter(r => r.duration_min !== null);
    const avg = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length : 0;
    kcUniSub.textContent = `${(sleepRows[0].duration_min / 60).toFixed(1)}h · ka ${(avg / 60).toFixed(1)}h`;
  } else {
    kcUniSub.textContent = 'Ei kirjauksia vielä';
  }
```

Replace with:

```javascript
  const { data: sleepRows } = await sb.from('sleep_data')
    .select('duration_min,sleep_date,deep_sleep_min,rem_sleep_min,awakenings')
    .order('sleep_date', { ascending: false }).limit(7);
  const kcUniCard = document.getElementById('kc-uni');
  const kcUniSub = document.getElementById('kc-uni-sub');
  kcUniSub.classList.remove('skel-sub');
  const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
  kcUniCard.classList.toggle('koonti-card--done', uniDoneToday);
  if (sleepRows && sleepRows[0] && sleepRows[0].duration_min !== null) {
    const withDur = sleepRows.filter(r => r.duration_min !== null);
    const avg = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length : 0;
    const score = calcSleepScore(sleepRows[0]);
    kcUniSub.textContent = `${(sleepRows[0].duration_min / 60).toFixed(1)}h · ${score != null ? score + 'p' : 'ka ' + (avg / 60).toFixed(1) + 'h'}`;
  } else {
    kcUniSub.textContent = 'Ei kirjauksia vielä';
  }
```

- [ ] **Step 4: Syntax-check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 5: Verify the formula by hand and via curl**

Hand-check the formula with a plausible night: `duration_min=450, deep_sleep_min=81, rem_sleep_min=101, awakenings=1`.
- Duration: `min(40, round(450/480*40))` = `min(40, round(37.5))` = `min(40, 38)` = `38`
- Deep %: `81/450*100` = `18.0` → deep score: `25 - abs(18-18)*1.5` = `25`
- REM %: `101/450*100` ≈ `22.44` → rem score: `20 - abs(22.44-22.5)*1.2` ≈ `20 - 0.07` ≈ `19.9` → rounds into total
- Awakenings: `max(0, 15 - 1*5)` = `10`
- Total ≈ `round(38 + 25 + 19.9 + 10)` = `93`

Confirm this matches what `calcSleepScore({duration_min:450, deep_sleep_min:81, rem_sleep_min:101, awakenings:1})` actually returns — you can check this quickly with `node -e` by pasting the function body and calling it directly, or by temporarily calling it in a browser console against the deployed page.

Get the anon key: `grep "const SB_KEY" index.html`. Confirm `sleep_data` still has real rows with all four fields queryable:
```bash
SB_URL='https://dodrzzgbdlucjbkmxbjn.supabase.co'
SB_KEY='<ANON_KEY>'
curl -s "$SB_URL/rest/v1/sleep_data?select=sleep_date,duration_min,deep_sleep_min,rem_sleep_min,awakenings&order=sleep_date.desc&limit=3" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"
```

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: unipisteiden laskenta ja näyttö"
```

---

### Task 3: Coach context — sleep score

**Files:**
- Modify: `supabase/functions/coach-chat/context.ts`

- [ ] **Step 1: Widen the `sleepAll` query to include `awakenings`**

Find:

```typescript
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
```

Replace with:

```typescript
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min,awakenings').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
```

- [ ] **Step 2: Add the Deno-side `calcSleepScore()` helper**

Find `function calcBmr(profile: any, weightRow: any): number | null {` and insert this new function directly before it:

```typescript
function calcSleepScore(row: { duration_min: number | null; deep_sleep_min: number | null; rem_sleep_min: number | null; awakenings: number | null }): number | null {
  const { duration_min, deep_sleep_min, rem_sleep_min, awakenings } = row;
  if (duration_min == null || deep_sleep_min == null || rem_sleep_min == null || awakenings == null) return null;
  if (duration_min <= 0) return null;
  const durationScore = Math.min(40, Math.round(duration_min / 480 * 40));
  const deepPct = deep_sleep_min / duration_min * 100;
  const deepScore = Math.max(0, Math.min(25, 25 - Math.abs(deepPct - 18) * 1.5));
  const remPct = rem_sleep_min / duration_min * 100;
  const remScore = Math.max(0, Math.min(20, 20 - Math.abs(remPct - 22.5) * 1.2));
  const awakeningsScore = Math.max(0, 15 - awakenings * 5);
  return Math.round(durationScore + deepScore + remScore + awakeningsScore);
}

```

- [ ] **Step 3: Fold the weekly average sleep score into the weekly-summary line**

Find the weekly-summary loop:

```typescript
    const weekSteps = (stepsAll || []).filter((r: any) => r.step_date >= from && r.step_date <= to);
    const avgSteps = weekSteps.length
      ? Math.round(weekSteps.reduce((s: number, r: any) => s + r.steps, 0) / weekSteps.length)
      : null;

    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}.`,
    );
```

Replace with:

```typescript
    const weekSteps = (stepsAll || []).filter((r: any) => r.step_date >= from && r.step_date <= to);
    const avgSteps = weekSteps.length
      ? Math.round(weekSteps.reduce((s: number, r: any) => s + r.steps, 0) / weekSteps.length)
      : null;
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
```

`weekSleep` is already defined earlier in the same loop (it's the array used to compute `avgSleepH`) — confirm this by reading the surrounding code before making the edit, since this plan assumes that variable name and shape are unchanged from the current file.

- [ ] **Step 4: Deploy**

Run: `supabase functions deploy coach-chat --project-ref dodrzzgbdlucjbkmxbjn`

Expected: deploy succeeds. `supabase db query` is known to be unreliable in this environment, but `supabase functions deploy` is a different, reliable code path (Management API, not a direct DB connection).

- [ ] **Step 5: Verify the function is live**

```bash
curl -s -X OPTIONS https://dodrzzgbdlucjbkmxbjn.supabase.co/functions/v1/coach-chat -i
```

Expected: `HTTP/2 200` with the expected CORS headers — confirms the redeploy actually took effect.

If you have the `COACH_SECRET` value available, you can also do a full end-to-end test: send a message asking about sleep to a real conversation and confirm the reply references sleep score data. If you don't have the secret, that's expected — do not guess or fabricate it; report DONE_WITH_CONCERNS and note that live verification with a real message needs to be completed by someone with the secret.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/coach-chat/context.ts
git commit -m "feat: liitä unipisteet valmentajan kontekstiin"
```

---

### Task 4: Manual QA and version bump

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Manual QA checklist**

1. Set up the Shortcuts automation from Task 1 on your phone, run it manually — confirm a row appears in `sleep_data` for last night with all four fields.
2. Open the Uni page — confirm the hero shows "Unipisteet: N" (or "Unipisteet: —" if a field is missing) alongside the existing duration.
3. Confirm the Koonti dashboard's Uni card shows the score (e.g. "7.5h · 82p") when available, falling back to the previous "ka Xh" format when the score can't be computed.
4. Manually edit/enter a sleep row via the existing form that's missing one field (e.g. no REM value) — confirm the hero shows "Unipisteet: —" rather than a wrong number.
5. Ask the coach about sleep — confirm the reply references real sleep score data.

Requires browser access and the `COACH_SECRET` value for items 2-5's live verification; if you lack either, report DONE_WITH_CONCERNS and list which items remain for the plan owner.

- [ ] **Step 2: Bump the version chip**

Find (in the sidebar):

```html
    <div class="version-chip" style="margin:0">v1.24.0</div>
```

Replace with:

```html
    <div class="version-chip" style="margin:0">v1.25.0</div>
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
git commit -m "v1.25.0: Unipisteet"
```
