# Ruokakuva-avusteinen haku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user photograph a meal, have Claude's vision API identify each distinct food component and estimate its portion size, and use that as a starting point (name + grams) that feeds into the *existing* Fineli search-and-confirm flow — AI never decides final calories, only proposes a name and amount for the user to search, match, and confirm exactly as they do today.

**Architecture:** A new Supabase Edge Function (`food-photo`) mirrors the existing `coach-chat` function's security pattern (shared `COACH_SECRET` passphrase gate, a dedicated daily rate-limit table) but does a single vision-capable Claude call instead of a chat exchange, returning `{components: [{name, grams}]}`. The client resizes/compresses the photo via `<canvas>` before sending it, adds a photo-picker button and a new "component list" step to the existing food-search modal, and reuses every existing search/amount/confirm function unchanged — the new code only pre-fills inputs and decides when to route back to the component list instead of closing the modal.

**Tech Stack:** Vanilla JS in `index.html`, Supabase Edge Functions (Deno/TypeScript), Claude API (vision), native `<input type="file">` for photo capture/selection, `<canvas>` for client-side image resizing — no build step, no test framework.

---

### Task 1: `food_photo_calls` rate-limit table

**Files:**
- Create: `supabase/migrations/20260716_food_photo_calls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Ruokakuva-avusteinen haku: food_photo_calls-taulu päivärajan laskentaan

create table food_photo_calls (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table food_photo_calls enable row level security;
```

No policies — matches the existing `coach_api_calls` table exactly (RLS enabled with zero policies locks the table out entirely for `anon`; only the Edge Function's service-role key can touch it).

- [ ] **Step 2: Apply the migration**

Run: `supabase db query --linked -f supabase/migrations/20260716_food_photo_calls.sql`

Expected: command completes without error. If `supabase db query --linked` hangs or times out (this has happened before in this environment), do not keep retrying more than 2-3 times — report the issue and ask the plan owner to run the SQL manually via the Supabase dashboard SQL editor instead.

- [ ] **Step 3: Verify via curl**

Get the anon key: `grep "const SB_KEY" index.html`

```bash
SB_URL='https://dodrzzgbdlucjbkmxbjn.supabase.co'
SB_KEY='<ANON_KEY>'
curl -s "$SB_URL/rest/v1/food_photo_calls?select=*&limit=1" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY"
```

Expected: `[]` (empty array, not an error) — confirms the table exists and RLS correctly returns zero rows to `anon` (no select policy, so `anon` gets an empty result rather than an error, matching `coach_api_calls`'s behavior). Also confirm `anon` cannot insert:

```bash
curl -s -X POST "$SB_URL/rest/v1/food_photo_calls" -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" -H "content-type: application/json" -d '{}'
```

Expected: an RLS-violation error (not a successful insert) — confirms `anon` truly cannot write to this table directly, only the Edge Function's service-role key can.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260716_food_photo_calls.sql
git commit -m "feat: food_photo_calls-taulu ruokakuva-analyysin päivärajaa varten"
```

---

### Task 2: `food-photo` Edge Function

**Files:**
- Create: `supabase/functions/food-photo/index.ts`

- [ ] **Step 1: Write the function**

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COACH_SECRET = Deno.env.get('COACH_SECRET')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const DAILY_PHOTO_LIMIT = 20;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-coach-secret',
};

const FOOD_PHOTO_SYSTEM_PROMPT = `Tehtäväsi on tunnistaa kuvasta ruokakomponentit ja arvioida niiden määrä grammoina. Vastaa PELKÄSTÄÄN JSON-taulukolla, ei muuta tekstiä: [{"name": "ruoan nimi suomeksi", "grams": arvioitu_määrä_grammoina}, ...]. Jos kuvassa on useampi erillinen ruoka (esim. lautasella kanaa, riisiä ja salaattia), listaa jokainen omana kohtanaan. Jos kuvassa ei ole tunnistettavaa ruokaa, palauta tyhjä taulukko []. Käytä lyhyitä, Fineli-tietokannan kaltaisia ruokien nimiä (esim. "kananrinta", "keitetty riisi", "vihreä salaatti").`;

async function callClaudeVision(base64Image: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: FOOD_PHOTO_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          { type: 'text', text: 'Tunnista ruokakomponentit tästä kuvasta.' },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b: any) => b.type === 'text');
  return textBlock?.text || '[]';
}

function parseComponents(raw: string): { name: string; grams: number }[] {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item.name === 'string' && typeof item.grams === 'number')
      .map((item: any) => ({ name: item.name, grams: item.grams }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }
  if (req.headers.get('x-coach-secret') !== COACH_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
  }
  if (!body.image) {
    return new Response('Bad Request: image required', { status: 400, headers: CORS_HEADERS });
  }

  const sb = createClient(SB_URL, SB_SERVICE_KEY);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: todayCount, error: countError } = await sb
    .from('food_photo_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());
  if (countError) {
    console.error('daily count query failed:', countError.message);
    return new Response('Rate limit check failed', { status: 500, headers: CORS_HEADERS });
  }
  if ((todayCount || 0) >= DAILY_PHOTO_LIMIT) {
    return new Response('Daily photo limit reached', { status: 429, headers: CORS_HEADERS });
  }

  const { error: trackError } = await sb.from('food_photo_calls').insert({});
  if (trackError) {
    console.error('failed to record photo call:', trackError.message);
    return new Response('Rate limit check failed', { status: 500, headers: CORS_HEADERS });
  }

  let raw: string;
  try {
    raw = await callClaudeVision(body.image);
  } catch (err) {
    console.error('Claude vision call failed:', err instanceof Error ? err.message : String(err));
    return new Response('AI request failed', { status: 502, headers: CORS_HEADERS });
  }

  const components = parseComponents(raw);

  return new Response(JSON.stringify({ components }), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
});
```

This mirrors `coach-chat/index.ts`'s structure exactly: same CORS headers shape, same `x-coach-secret` check, same daily-rate-limit-table pattern (count then insert), same error-handling style (`console.error` + appropriate HTTP status). The only structural difference is the Claude call takes an image instead of a text history, and there's no data-context-building step since this function has nothing to do with the user's fitness data.

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy food-photo --project-ref dodrzzgbdlucjbkmxbjn`

Expected: deploy succeeds (no `--no-verify-jwt` — this function needs standard Supabase anon-key auth + CORS, matching `coach-chat`'s deployment). Note: `supabase db query` (direct Postgres connection) is known to be unreliable in this environment, but `supabase functions deploy` is a different code path (Management API, not a direct DB connection) and should work fine.

- [ ] **Step 3: Verify the function is live**

```bash
curl -s -X OPTIONS https://dodrzzgbdlucjbkmxbjn.supabase.co/functions/v1/food-photo -i
```

Expected: `HTTP/2 200` with `access-control-allow-origin: *` and `access-control-allow-headers` including `x-coach-secret` — confirms the function deployed and is serving, without needing the actual secret value.

If you have the `COACH_SECRET` value available, you can also do a full end-to-end test: base64-encode any small JPEG and POST it with the secret header, confirm you get back `{"components": [...]}`. If you don't have the secret, that's expected — do not guess or fabricate it; report DONE_WITH_CONCERNS and note that live verification with a real image needs to be completed by someone with the secret.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/food-photo/index.ts
git commit -m "feat: food-photo Edge Function ruokakuvien tunnistukseen"
```

---

### Task 3: Client UI — photo picker, component list, wiring into existing search flow

**Files:**
- Modify: `index.html`

This task adds a photo button to the existing food-search modal, a new "component list" step, and hooks into three existing functions (`goToAmountStep`, `confirmAddFood`, `openFoodSearch`) so photo-identified components flow through the exact same search-and-confirm path as manual entries.

- [ ] **Step 1: Add the photo button and hidden file input to the search step**

Find (in the `#food-search-modal` HTML, the `#food-search-step-list` div):

```html
    <div id="food-search-step-list">
      <input type="text" id="food-search-input" placeholder="Hae esim. kananrinta..."
             oninput="onFoodSearchInput()" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
      <div id="food-search-results"></div>
      <div style="text-align:center;margin-top:10px;">
        <span class="food-search-custom-link" onclick="goToCustomFoodStep()">+ Lisää oma tuote</span>
      </div>
    </div>
```

Replace with:

```html
    <div id="food-search-step-list">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" id="food-search-input" placeholder="Hae esim. kananrinta..."
               oninput="onFoodSearchInput()" style="flex:1;box-sizing:border-box;">
        <button class="btn" onclick="openFoodPhotoPicker()" style="flex:none;padding:0 14px;" title="Tunnista kuvasta">📷</button>
      </div>
      <input type="file" id="food-photo-input" accept="image/*" style="display:none" onchange="onFoodPhotoSelected(this)">
      <div id="food-search-results"></div>
      <div style="text-align:center;margin-top:10px;">
        <span class="food-search-custom-link" onclick="goToCustomFoodStep()">+ Lisää oma tuote</span>
      </div>
    </div>
```

- [ ] **Step 2: Add the new "photo results" step**

Find (right after the closing `</div>` of `#food-search-step-list` and before `#food-search-step-amount`):

```html
    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
```

Replace with:

```html
    <div id="food-search-step-photo" style="display:none">
      <div id="food-photo-status" class="status"></div>
      <div id="food-photo-components"></div>
      <button class="btn" onclick="backToFoodSearchList()" style="margin-top:10px;background:none;color:var(--text2);width:100%;">← Takaisin hakuun</button>
    </div>

    <div id="food-search-step-amount" class="food-amount-centered" style="display:none">
```

- [ ] **Step 3: Add the photo-handling JavaScript**

Find `function selectFoodItem(i) {` and insert this new code directly before it:

```javascript
let foodPhotoComponents = [];
let foodPhotoPendingGrams = null;

function openFoodPhotoPicker() {
  document.getElementById('food-photo-input').click();
}

async function onFoodPhotoSelected(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if (!file) return;

  const secret = getCoachSecret();
  if (!secret) {
    promptCoachSecret(() => analyzeFoodPhotoFile(file));
    return;
  }
  await analyzeFoodPhotoFile(file);
}

function resizeImageToBase64(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Tiedoston luku epäonnistui'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Kuvan lataus epäonnistui'));
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round(height * maxDim / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * maxDim / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl.split(',')[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function analyzeFoodPhotoFile(file) {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-photo').style.display = 'block';
  document.getElementById('food-photo-components').innerHTML = '';
  const statusEl = document.getElementById('food-photo-status');
  statusEl.textContent = 'Tunnistetaan...';
  statusEl.className = 'status';

  let base64;
  try {
    base64 = await resizeImageToBase64(file, 1024);
  } catch (err) {
    showStatus('food-photo-status', 'Kuvan käsittely epäonnistui', true);
    return;
  }

  const secret = getCoachSecret();
  try {
    const res = await fetch(`${SB_URL}/functions/v1/food-photo`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'authorization': `Bearer ${SB_KEY}`,
        'x-coach-secret': secret,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ image: base64 }),
    });
    if (res.status === 429) {
      showStatus('food-photo-status', 'Päivän kuva-analyysiraja täynnä, yritä huomenna', true);
      return;
    }
    if (!res.ok) {
      showStatus('food-photo-status', 'Tunnistus epäonnistui, yritä uudelleen', true);
      return;
    }
    const data = await res.json();
    foodPhotoComponents = data.components || [];
    renderFoodPhotoComponents();
  } catch (err) {
    console.error('analyzeFoodPhotoFile failed:', err.message);
    showStatus('food-photo-status', 'Tunnistus epäonnistui, tarkista verkkoyhteys', true);
  }
}

function renderFoodPhotoComponents() {
  const statusEl = document.getElementById('food-photo-status');
  statusEl.textContent = '';
  statusEl.className = 'status';
  const el = document.getElementById('food-photo-components');
  if (!foodPhotoComponents.length) {
    el.innerHTML = `<div class="food-search-empty">Ei tunnistettuja ruokia, kokeile toista kuvaa tai hae manuaalisesti</div>`;
    return;
  }
  el.innerHTML = foodPhotoComponents.map((c, i) => `
    <div class="food-search-result-row" onclick="selectFoodPhotoComponent(${i})">
      <span>${escapeHtml(c.name)}</span>
      <span class="food-search-result-kcal">~${Math.round(c.grams)}g</span>
    </div>`).join('');
}

function selectFoodPhotoComponent(i) {
  const component = foodPhotoComponents[i];
  foodPhotoComponents.splice(i, 1);
  foodPhotoPendingGrams = component.grams;
  document.getElementById('food-search-step-photo').style.display = 'none';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-input').value = component.name;
  runFoodSearch(component.name);
}

function backToFoodSearchList() {
  document.getElementById('food-search-step-photo').style.display = 'none';
  document.getElementById('food-search-step-list').style.display = 'block';
}

```

`getCoachSecret`, `promptCoachSecret`, `showStatus`, `escapeHtml`, `SB_URL`, `SB_KEY`, `runFoodSearch` are all pre-existing helpers — this reuses the exact same secret (`localStorage`'s `coachSecret`) already used by the AI coach feature, so if the user has already unlocked the coach, photo search works immediately with no extra setup.

- [ ] **Step 4: Pre-fill the amount step with the AI's gram estimate when applicable**

Find:

```javascript
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
  updateFoodAmountPreview();
}
```

Replace with:

```javascript
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = foodPhotoPendingGrams != null ? Math.round(foodPhotoPendingGrams) : 100;
  foodPhotoPendingGrams = null;
  updateFoodAmountPreview();
}
```

- [ ] **Step 5: Route back to the component list after confirming, if more components remain**

Find (inside `confirmAddFood()`):

```javascript
    closeFoodSearch();
    await renderRuoka();
  } catch (err) {
    showStatus('food-amount-status', 'Tallennus epäonnistui, yritä uudelleen', true);
```

Replace with:

```javascript
    if (foodPhotoComponents.length > 0) {
      document.getElementById('food-search-step-amount').style.display = 'none';
      document.getElementById('food-search-step-photo').style.display = 'block';
      renderFoodPhotoComponents();
    } else {
      closeFoodSearch();
    }
    await renderRuoka();
  } catch (err) {
    showStatus('food-amount-status', 'Tallennus epäonnistui, yritä uudelleen', true);
```

- [ ] **Step 6: Reset photo state when the modal opens/closes fresh**

Find:

```javascript
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  document.getElementById('food-search-input').value = '';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
```

Replace with:

```javascript
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  foodPhotoComponents = [];
  foodPhotoPendingGrams = null;
  document.getElementById('food-search-input').value = '';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-photo').style.display = 'none';
```

- [ ] **Step 7: Syntax-check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"
```
Expected: no output (success).

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: kuva-avusteinen ruokahaku"
```

---

### Task 4: Manual QA and version bump

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Manual QA checklist**

Requires browser access and the `COACH_SECRET` value (the shared AI-feature passphrase). If you lack either, report DONE_WITH_CONCERNS and list which items remain for the plan owner.

1. Open the food search modal for any meal, confirm the 📷 button appears next to the search field.
2. Tap it, select/take a photo of a single food item — confirm the component-list step shows one entry with a plausible name and gram estimate.
3. Tap the component — confirm the search field pre-fills with that name and real Fineli results appear.
4. Pick a Fineli match — confirm the amount field pre-fills with the AI's gram estimate (not 100).
5. Confirm/save it — confirm it returns to the component list (or closes the modal if that was the only component) and the entry appears in today's food log.
6. Repeat with a photo containing 2-3 distinct foods — confirm each is listed separately, and confirming one after another correctly logs all of them as separate entries.
7. Try a photo with no food in it — confirm a clear "ei tunnistettu" message and that manual search still works afterward.
8. Confirm the "← Takaisin hakuun" button returns to manual search without losing the ability to also start a new photo analysis.
9. Rate-limit logic check (live-testing this would require 20 real photo analyses in a row, which is wasteful — `anon` cannot insert into `food_photo_calls` directly since it has no insert policy by design, so there's no cheap way to fake the count). Instead, verify by reading `supabase/functions/food-photo/index.ts` directly: confirm the count query correctly filters to today (`gte('created_at', todayStart.toISOString())` with `todayStart` set to `setUTCHours(0,0,0,0)`), confirm the threshold check (`>= DAILY_PHOTO_LIMIT`) happens before the Claude call (so a blocked request never reaches the paid API), and confirm the 429 response includes a clear message the client already knows how to display (`res.status === 429` branch in `analyzeFoodPhotoFile`).

- [ ] **Step 2: Bump the version chip**

Find (in the sidebar):

```html
    <div class="version-chip" style="margin:0">v1.23.0</div>
```

Replace with:

```html
    <div class="version-chip" style="margin:0">v1.24.0</div>
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
git commit -m "v1.24.0: Kuva-avusteinen ruokahaku"
```
