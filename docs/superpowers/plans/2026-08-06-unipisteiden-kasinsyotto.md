# Unipisteiden käsinsyöttö Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile HealthKit sleep-stage sync with direct manual 0-100 sleep-score entry each morning, converting every place in the app that currently displays sleep *duration* (hours) to display the score instead, since duration will no longer be collected going forward.

**Architecture:** One new nullable `sleep_score` column on the existing `sleep_data` table (old columns untouched, no data loss). `calcSleepScore()` changes from a 4-field formula to a direct field read — every existing caller keeps working unchanged since they only consume its return value. The "Kirjaa uni" form drops from 4 fields to 1. Every duration-based display (Uni page hero, Koonti card, two weekly-average displays) converts to score-based. One now-redundant Huomioita insight (duration-trend) gets deleted outright since an equivalent score-based insight already exists and will keep working automatically once `calcSleepScore()` is updated.

**Tech Stack:** SQL migration, vanilla JS (`index.html`). No test framework — manual verification per this project's established pattern.

**Read first:** `docs/superpowers/specs/2026-08-06-unipisteiden-kasinsyotto-design.md` for full background/rationale.

---

### Task 1: `sleep_score` column

**Files:**
- Create: `supabase/migrations/20260806_sleep_score.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Unipisteiden käsinsyöttö: sleep_score-sarake korvaa HealthKit-pohjaisen
-- laskukaavan (duration_min/deep_sleep_min/rem_sleep_min/awakenings) suoralla
-- käsinsyötetyllä 0-100-pistemäärällä. Vanhat sarakkeet ja historiadata
-- säilytetään koskemattomina.

alter table sleep_data add column sleep_score integer check (sleep_score >= 0 and sleep_score <= 100);
```

- [ ] **Step 2: Apply to production via the Management API**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
python3 -c "
import json
sql = open('supabase/migrations/20260806_sleep_score.sql').read()
print(json.dumps({'query': sql}))
" > /tmp/sleep_score_payload.json
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/sleep_score_payload.json
```
Expected: `[]`.

- [ ] **Step 3: Verify the column exists with the right constraint**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select column_name, data_type from information_schema.columns where table_name = '"'"'sleep_data'"'"' and column_name = '"'"'sleep_score'"'"';"}'
```
Expected: `[{"column_name":"sleep_score","data_type":"integer"}]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260806_sleep_score.sql
git commit -m "feat: sleep_score-sarake unipisteiden käsinsyöttöä varten"
```

---

### Task 2: Frontend — score-based everywhere

**Files:**
- Modify: `index.html` (multiple spots — search by function/element name, not line number)

- [ ] **Step 1: Simplify `calcSleepScore()`**

Current code:
```js
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
Change to:
```js
function calcSleepScore(row) {
  return row && row.sleep_score != null ? row.sleep_score : null;
}
```
Every existing caller (`loadSleep`, the Koonti card code, the two Huomioita insights) only reads the return value — none of them need to change because of this specific edit (they change for their own reasons in later steps).

- [ ] **Step 2: Replace the "Kirjaa uni" form HTML**

Current code:
```html
    <div class="card">
      <div class="card-title">Kirjaa uni</div>
      <div class="form-row"><label>Päivämäärä</label><input type="date" id="sleep-date"></div>
      <div class="form-row"><label>Kesto (min)</label><input type="text" inputmode="numeric" id="sleep-dur" placeholder="esim. 450"></div>
      <div class="form-row"><label>Syvä uni (min)</label><input type="text" inputmode="numeric" id="sleep-deep" placeholder="esim. 90"></div>
      <div class="form-row"><label>REM (min)</label><input type="text" inputmode="numeric" id="sleep-rem" placeholder="esim. 100"></div>
      <div class="form-row"><label>Heräilyt</label><input type="text" inputmode="numeric" id="sleep-awk" placeholder="esim. 2"></div>
      <button class="btn btn-primary" onclick="saveSleep()">Tallenna</button>
      <div class="status" id="sleep-status"></div>
    </div>
```
Change to:
```html
    <div class="card">
      <div class="card-title">Kirjaa uni</div>
      <div class="form-row"><label>Päivämäärä</label><input type="date" id="sleep-date"></div>
      <div class="form-row"><label>Unipisteet (0-100)</label><input type="text" inputmode="numeric" id="sleep-score" placeholder="esim. 82"></div>
      <button class="btn btn-primary" onclick="saveSleep()">Tallenna</button>
      <div class="status" id="sleep-status"></div>
    </div>
```

- [ ] **Step 3: Replace the sleep hero HTML** (removes the "Syvä uni" stat and the now-redundant sub-label)

Current code:
```html
    <div class="seuranta-hero seuranta-hero--uni">
      <div class="seuranta-hero-glow" style="background:radial-gradient(circle,rgba(0,92,158,0.5) 0%,transparent 70%)"></div>
      <div class="seuranta-hero-label">VIIME YÖ · UNI</div>
      <div class="seuranta-hero-main" id="sleep-last">—</div>
      <div class="seuranta-hero-sub" id="hero-sleep-sub"></div>
      <div class="seuranta-hero-stats">
        <div><div class="seuranta-hero-stat-val" id="hero-sleep-deep">—</div><div class="seuranta-hero-stat-label">syvä uni</div></div>
        <div class="seuranta-hero-divider"></div>
        <div><div class="seuranta-hero-stat-val" id="sleep-avg">—</div><div class="seuranta-hero-stat-label">viikon ka</div></div>
      </div>
    </div>
```
Change to:
```html
    <div class="seuranta-hero seuranta-hero--uni">
      <div class="seuranta-hero-glow" style="background:radial-gradient(circle,rgba(0,92,158,0.5) 0%,transparent 70%)"></div>
      <div class="seuranta-hero-label">VIIME YÖ · UNI</div>
      <div class="seuranta-hero-main" id="sleep-last">—</div>
      <div class="seuranta-hero-stats">
        <div><div class="seuranta-hero-stat-val" id="sleep-avg">—</div><div class="seuranta-hero-stat-label">viikon ka</div></div>
      </div>
    </div>
```

- [ ] **Step 4: Rewrite `saveSleep()`**

Current code:
```js
async function saveSleep() {
  const date = document.getElementById('sleep-date').value;
  if (!date) { showStatus('sleep-status','Valitse päivämäärä',true); return; }
  const btn = document.querySelector('#page-uni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sbWrite({
      table: 'sleep_data',
      op: 'upsert',
      payload: {
        sleep_date:     date,
        duration_min:   parseNum('sleep-dur'),
        deep_sleep_min: parseNum('sleep-deep'),
        rem_sleep_min:  parseNum('sleep-rem'),
        awakenings:     parseNum('sleep-awk'),
      },
      opts: { onConflict:'sleep_date' },
    });
    if (error) { showStatus('sleep-status','Virhe',true); return; }
    showStatus('sleep-status','Tallennettu!',false);
    loadSleep();
  } finally {
    btn.disabled = false;
  }
}
```
Change to:
```js
async function saveSleep() {
  const date = document.getElementById('sleep-date').value;
  if (!date) { showStatus('sleep-status','Valitse päivämäärä',true); return; }
  const score = parseNum('sleep-score');
  if (score == null || score < 0 || score > 100) { showStatus('sleep-status','Syötä 0-100', true); return; }
  const btn = document.querySelector('#page-uni .btn-primary');
  btn.disabled = true;
  try {
    const { error } = await sbWrite({
      table: 'sleep_data',
      op: 'upsert',
      payload: { sleep_date: date, sleep_score: score },
      opts: { onConflict:'sleep_date' },
    });
    if (error) { showStatus('sleep-status','Virhe',true); return; }
    showStatus('sleep-status','Tallennettu!',false);
    loadSleep();
  } finally {
    btn.disabled = false;
  }
}
```

- [ ] **Step 5: Rewrite `loadSleep()`**

Current code:
```js
async function loadSleep() {
  const { data, error } = await sb.from('sleep_data').select('*')
    .order('sleep_date',{ ascending:false }).limit(7);
  if (error) { console.error('loadSleep failed:', error.message); return; }
  if (data && data[0] && data[0].duration_min !== null)
    document.getElementById('sleep-last').textContent = (data[0].duration_min/60).toFixed(1)+'h';
  const heroSleepSubEl = document.getElementById('hero-sleep-sub');
  const deepEl         = document.getElementById('hero-sleep-deep');
  if (data && data[0]) {
    if (heroSleepSubEl) {
      const score = calcSleepScore(data[0]);
      heroSleepSubEl.textContent = score != null ? `Unipisteet: ${score}` : 'Unipisteet: —';
    }
    if (deepEl)         deepEl.textContent          = data[0].deep_sleep_min ? data[0].deep_sleep_min + ' min' : '—';
  }
  if (data && data.length) {
    const withDur = data.filter(d => d.duration_min !== null);
    const avg = withDur.length ? withDur.reduce((s,d)=>s+d.duration_min,0)/withDur.length : 0;
    document.getElementById('sleep-avg').textContent = withDur.length ? (avg/60).toFixed(1)+'h' : '—';
    document.getElementById('sleep-history').innerHTML = data.map(s => `
      <div class="hist-item">
        <div><div class="hist-label">${s.sleep_date}</div></div>
        <div style="text-align:right">
          <div class="hist-val">${s.duration_min?(s.duration_min/60).toFixed(1)+'h':'—'}</div>
          <div style="font-size:11px;color:var(--text3)">${s.deep_sleep_min?'Syvä: '+s.deep_sleep_min+'min':''}${s.rem_sleep_min?' · REM: '+s.rem_sleep_min+'min':''}</div>
        </div>
      </div>`).join('');
  }
}
```
Change to:
```js
async function loadSleep() {
  const { data, error } = await sb.from('sleep_data').select('sleep_date,sleep_score')
    .order('sleep_date',{ ascending:false }).limit(7);
  if (error) { console.error('loadSleep failed:', error.message); return; }
  if (data && data[0] && data[0].sleep_score != null)
    document.getElementById('sleep-last').textContent = data[0].sleep_score + 'p';
  if (data && data.length) {
    const withScore = data.filter(d => d.sleep_score != null);
    const avg = withScore.length ? withScore.reduce((s,d)=>s+d.sleep_score,0)/withScore.length : null;
    document.getElementById('sleep-avg').textContent = avg != null ? Math.round(avg) + 'p' : '—';
    document.getElementById('sleep-history').innerHTML = data.map(s => `
      <div class="hist-item">
        <div><div class="hist-label">${s.sleep_date}</div></div>
        <div class="hist-val">${s.sleep_score != null ? s.sleep_score + 'p' : '—'}</div>
      </div>`).join('');
  }
}
```

- [ ] **Step 6: Update the Koonti "Uni" card block**

Current code:
```js
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
Change to:
```js
  const { data: sleepRows } = await sb.from('sleep_data')
    .select('sleep_date,sleep_score')
    .order('sleep_date', { ascending: false }).limit(7);
  const kcUniCard = document.getElementById('kc-uni');
  const kcUniSub = document.getElementById('kc-uni-sub');
  kcUniSub.classList.remove('skel-sub');
  const uniDoneToday = !!(sleepRows && sleepRows[0] && sleepRows[0].sleep_date === todayIso);
  kcUniCard.classList.toggle('koonti-card--done', uniDoneToday);
  if (sleepRows && sleepRows[0] && sleepRows[0].sleep_score != null) {
    kcUniSub.textContent = `${sleepRows[0].sleep_score}p`;
  } else {
    kcUniSub.textContent = 'Ei kirjauksia vielä';
  }
```

- [ ] **Step 7: Update `loadWeekSummary()`'s sleep query and `#ws-sleep` display**

Current code:
```js
    sb.from('sleep_data').select('duration_min').gte('sleep_date', from).lte('sleep_date', to),
  ]);
```
(this is one of three parallel queries in a `Promise.all` — only this one line changes)
```js
  if (sleepErr) { console.error('loadWeekSummary (sleep) failed:', sleepErr.message); }
  const withDur = sleepData ? sleepData.filter(r => r.duration_min !== null) : [];
  const sleepEl = document.getElementById('ws-sleep');
  if (withDur.length) {
    const avg = withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length;
    if (sleepEl) sleepEl.textContent = (avg / 60).toFixed(1) + 'h';
  } else {
    if (sleepEl) sleepEl.textContent = '—';
  }
}
```
Change the query line to:
```js
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', from).lte('sleep_date', to),
  ]);
```
And the block below to:
```js
  if (sleepErr) { console.error('loadWeekSummary (sleep) failed:', sleepErr.message); }
  const withScore = sleepData ? sleepData.filter(r => r.sleep_score != null) : [];
  const sleepEl = document.getElementById('ws-sleep');
  if (withScore.length) {
    const avg = withScore.reduce((s, r) => s + r.sleep_score, 0) / withScore.length;
    if (sleepEl) sleepEl.textContent = Math.round(avg) + 'p';
  } else {
    if (sleepEl) sleepEl.textContent = '—';
  }
}
```

- [ ] **Step 8: Update `getWeekStats()`'s sleep query and `avgSleep` calculation**

Current code:
```js
    sb.from('sleep_data').select('duration_min').gte('sleep_date', from).lte('sleep_date', to),
```
(one line inside its own `Promise.all` — only this line changes)
```js
  const withDur = (sleepData || []).filter(r => r.duration_min !== null);
  const avgSleep = withDur.length ? withDur.reduce((s, r) => s + r.duration_min, 0) / withDur.length / 60 : null;
```
Change the query line to:
```js
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', from).lte('sleep_date', to),
```
And the calculation to:
```js
  const withScore = (sleepData || []).filter(r => r.sleep_score != null);
  const avgSleep = withScore.length ? withScore.reduce((s, r) => s + r.sleep_score, 0) / withScore.length : null;
```
(`avgSleep` is now a score, not hours — the variable name stays the same since it's already generically named and every consumer of it is updated in the next step)

- [ ] **Step 9: Update the "Unen keskiarvo" row in `loadWeeklyReportCard()`**

Current code:
```js
  if (thisWeek.avgSleep != null || lastWeek.avgSleep != null) {
    const curStr = thisWeek.avgSleep != null ? thisWeek.avgSleep.toFixed(1) + 'h' : '—';
    rows.push(`<div class="hist-item"><div class="hist-label">Unen keskiarvo</div><div class="hist-val">${curStr}${fmtDelta(thisWeek.avgSleep, lastWeek.avgSleep, 'h')}</div></div>`);
  }
```
Change to:
```js
  if (thisWeek.avgSleep != null || lastWeek.avgSleep != null) {
    const curStr = thisWeek.avgSleep != null ? Math.round(thisWeek.avgSleep) + 'p' : '—';
    rows.push(`<div class="hist-item"><div class="hist-label">Unen keskiarvo</div><div class="hist-val">${curStr}${fmtDelta(thisWeek.avgSleep, lastWeek.avgSleep, 'p')}</div></div>`);
  }
```
(`fmtDelta` itself is untouched — it already rounds its delta to 1 decimal regardless of unit, same as it already does for the existing kg-based "Painon muutos" row, so no change needed there)

- [ ] **Step 10: Delete the redundant duration-based Huomioita insight**

Current code (delete this whole block — the comment line, the two filter/map lines, and the `if` block):
```js
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

```
Delete it entirely (including the trailing blank line before the next comment block, `// Askeleet: ...`). Do NOT touch the "Askeleet" block that follows, or the "Unipisteet tälle ja viime viikolle" block further down (that one already uses `calcSleepScore()` and needs no changes from this step).

- [ ] **Step 11: Narrow the `sleepThis`/`sleepLast` queries that feed the score-based insights**

Current code (the two queries inside the same `Promise.all` that step 10's deleted block used to consume):
```js
    sb.from('sleep_data').select('duration_min,deep_sleep_min,rem_sleep_min,awakenings').gte('sleep_date', thisWeekFrom).lte('sleep_date', thisWeekTo),
    sb.from('sleep_data').select('duration_min,deep_sleep_min,rem_sleep_min,awakenings').gte('sleep_date', lastWeekFrom).lte('sleep_date', lastWeekTo),
```
Change to:
```js
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', thisWeekFrom).lte('sleep_date', thisWeekTo),
    sb.from('sleep_data').select('sleep_score').gte('sleep_date', lastWeekFrom).lte('sleep_date', lastWeekTo),
```
The two existing score-based insights ("Unipisteet laskenut Xp viime viikolla" and the tonnage/sleep overload insight) call `calcSleepScore(r)` on each row of `sleepThis`/`sleepLast` — after step 1's simplification, `calcSleepScore` just reads `.sleep_score`, so narrowing these queries to only fetch that column is sufficient and doesn't break either insight.

- [ ] **Step 12: Static sanity check**

Extract the inline `<script>` content and run `node --check` on it to confirm no syntax errors before manual testing.

- [ ] **Step 13: Commit**

```bash
git add index.html
git commit -m "feat: unipisteiden käsinsyöttö korvaa HealthKit-unisynkkauksen"
```

---

### Task 3: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start a local server and open the app**

```bash
python3 -m http.server 8806
```
Open `http://localhost:8806/index.html`.

- [ ] **Step 2: Check the "Kirjaa uni" form**

Go to Uni page (via Koonti's "Uni" card or nav). Confirm only "Päivämäärä" and "Unipisteet (0-100)" fields show — no Kesto/Syvä uni/REM/Heräilyt.

- [ ] **Step 3: Save a score for today**

Enter today's date and a score (e.g. 85), save. Confirm: status shows "Tallennettu!", the hero's main value updates to "85p", "viikon ka" updates, and the history list shows today's row as "85p".

- [ ] **Step 4: Check validation**

Try saving with an empty score, and with an out-of-range value (e.g. 150) — confirm both are rejected with the "Syötä 0-100" message and nothing is written.

- [ ] **Step 5: Check the Koonti card**

Go back to Koonti. Confirm the "Uni" card now shows just "85p" (no hours), and is marked done for today.

- [ ] **Step 6: Check the "Tällä viikolla" card**

Confirm "Unen keskiarvo" shows a rounded point value (e.g. "85p"), not hours, with a delta in parentheses if last week also has data.

- [ ] **Step 7: Console check**

Check the browser console for errors throughout steps 2-6. None expected.

- [ ] **Step 8: Verify old data isn't broken**

Query a historical `sleep_data` row that only has `duration_min` (no `sleep_score`) via the Management API, and confirm the Uni page's history list shows it as "—" (not a crash, not stale hour-based text):
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select sleep_date, duration_min, sleep_score from sleep_data where sleep_score is null order by sleep_date desc limit 3;"}'
```

- [ ] **Step 9: Clean up test data and stop the server**

If the score you saved in Step 3 was purely a test (not a real morning entry you want to keep), delete it:
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"update sleep_data set sleep_score = null where sleep_date = current_date;"}'
```
(Only run this if the entry was purely a test — if it's your real score for today, leave it.)
```bash
pkill -f "http.server 8806"
```

---

### Task 4: Version bump and deploy

**Files:**
- Modify: `index.html` (version chip)

- [ ] **Step 1: Bump the version chip**

Check current value (`grep -n "version-chip" index.html`) and increment by one minor version.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "vX.Y.0: unipisteiden käsinsyöttö"
```
(replace X.Y with the actual incremented version)

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Verify the live site picked up the change**

```bash
sleep 60 && curl -s "https://patrikfriis-alt.github.io/treeniapp/?cb=$RANDOM" | grep -o "sleep-score" | head -1
```
Expected: `sleep-score`. If empty, wait another 30-60s and retry.
