# Ruokakuvan tekoälyavusteinen makroarvio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a ruokakuva-detected food component doesn't match anything in Fineli, let the user request an AI-estimated per-100g macro breakdown (from the same photo) that pre-fills the existing "add custom product" form, instead of leaving them to guess the nutrition facts themselves.

**Architecture:** One new Edge Function (`food-macro-estimate`, mirrors `food-photo`'s shape exactly: same `COACH_SECRET` gate, same daily-rate-limit-table pattern, same Claude vision call style) plus one new dedicated rate-limit table. Client-side: the already-resized photo gets held in memory a bit longer (`foodPhotoLastImageBase64`), a new button appears above the Fineli results whenever that's set, and a successful estimate flows into the *existing* `goToCustomFoodStep()`/`saveCustomFoodAndContinue()`/`createCustomFood()`/`addFoodLogEntry()` pipeline unchanged — no new save path, no new schema on the `custom_foods`/`food_log_entries` side.

**Tech Stack:** Deno/TypeScript Supabase Edge Function (Claude vision via Anthropic API), vanilla JS (`index.html`). No test framework — manual verification via a real food photo, per this project's established pattern for the vision features (`food-photo`, `coach-chat`).

---

### Task 1: `food_macro_estimate_calls` rate-limit table

**Files:**
- Create: `supabase/migrations/20260805_food_macro_estimate_calls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Ruokakuvan tekoälyavusteinen makroarvio: food_macro_estimate_calls-taulu
-- päivärajan laskentaan (sama malli kuin food_photo_calls).

create table food_macro_estimate_calls (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table food_macro_estimate_calls enable row level security;
```

- [ ] **Step 2: Apply the migration to the production project**

Direct `supabase db push`/`db query --linked` are unreliable in this environment (they hang on "Initialising login role..." — a known issue in this project, see the `project-supabase-tooling-quirks` memory). Apply via the Management API instead, which has been reliable all session:

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
python3 -c "
import json
sql = open('supabase/migrations/20260805_food_macro_estimate_calls.sql').read()
print(json.dumps({'query': sql}))
" > /tmp/food_macro_estimate_calls_payload.json
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/food_macro_estimate_calls_payload.json
```
Expected output: `[]` (successful DDL execution returns no rows).

- [ ] **Step 3: Verify the table exists**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select relrowsecurity from pg_class where relname = '"'"'food_macro_estimate_calls'"'"';"}'
```
Expected output: `[{"relrowsecurity":true}]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260805_food_macro_estimate_calls.sql
git commit -m "feat: food_macro_estimate_calls-taulu ruokakuvan makroarvion päivärajaa varten"
```

---

### Task 2: `food-macro-estimate` Edge Function

**Files:**
- Create: `supabase/functions/food-macro-estimate/index.ts`

- [ ] **Step 1: Write the function**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COACH_SECRET = Deno.env.get('COACH_SECRET')!; // shared AI-feature secret, same value gates coach-chat/food-photo
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const DAILY_ESTIMATE_LIMIT = 20;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-coach-secret',
};

const MACRO_ESTIMATE_SYSTEM_PROMPT = `Tehtäväsi on arvioida annetun ruoan ravintosisältö per 100 grammaa kuvan ja nimen perusteella. Vastaa PELKÄSTÄÄN JSON-oliolla, ei muuta tekstiä: {"kcalPer100g": number, "proteinPer100g": number, "carbsPer100g": number, "fatPer100g": number}. Jos et pysty arvioimaan järkevästi kuvan ja nimen perusteella, palauta {"kcalPer100g": null, "proteinPer100g": null, "carbsPer100g": null, "fatPer100g": null}.`;

async function callClaudeVision(base64Image: string, name: string, grams: number | undefined): Promise<string> {
  const gramsText = grams != null
    ? ` Arvioitu annoskoko: ${Math.round(grams)}g (tämä on vain kontekstiksi, älä käytä sitä per-100g-laskennassa).`
    : '';
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
      system: MACRO_ESTIMATE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          { type: 'text', text: `Arvioi ravintosisältö per 100g tälle ruoalle: "${name}".${gramsText}` },
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
  return textBlock?.text || '{}';
}

function parseEstimate(raw: string): { kcalPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number } | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    const fields = ['kcalPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'] as const;
    for (const f of fields) {
      if (!Number.isFinite(Number(parsed[f]))) return null;
    }
    return {
      kcalPer100g: Number(parsed.kcalPer100g),
      proteinPer100g: Number(parsed.proteinPer100g),
      carbsPer100g: Number(parsed.carbsPer100g),
      fatPer100g: Number(parsed.fatPer100g),
    };
  } catch (err) {
    console.error('parseEstimate failed:', err instanceof Error ? err.message : String(err), '| raw:', raw);
    return null;
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

  let body: { image?: string; name?: string; grams?: number };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
  }
  if (!body.image || !body.name) {
    return new Response('Bad Request: image and name required', { status: 400, headers: CORS_HEADERS });
  }

  const sb = createClient(SB_URL, SB_SERVICE_KEY);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: todayCount, error: countError } = await sb
    .from('food_macro_estimate_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());
  if (countError) {
    console.error('daily count query failed:', countError.message);
    return new Response('Rate limit check failed', { status: 500, headers: CORS_HEADERS });
  }
  if ((todayCount || 0) >= DAILY_ESTIMATE_LIMIT) {
    return new Response('Daily estimate limit reached', { status: 429, headers: CORS_HEADERS });
  }

  const { error: trackError } = await sb.from('food_macro_estimate_calls').insert({});
  if (trackError) {
    console.error('failed to record estimate call:', trackError.message);
    return new Response('Rate limit check failed', { status: 500, headers: CORS_HEADERS });
  }

  let raw: string;
  try {
    raw = await callClaudeVision(body.image, body.name, body.grams);
  } catch (err) {
    console.error('Claude vision call failed:', err instanceof Error ? err.message : String(err));
    return new Response('AI request failed', { status: 502, headers: CORS_HEADERS });
  }

  const estimate = parseEstimate(raw);
  if (!estimate) {
    return new Response('Could not estimate macros', { status: 502, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify(estimate), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy food-macro-estimate --project-ref yznuzwbbyasgqeqllxic
```
No `--no-verify-jwt` needed here — like `food-photo` (and unlike `check-and-notify`), this function is only ever called by the app's own client code, which already sends a valid `apikey`/`authorization: Bearer <anon key>` pair, so the default JWT verification passes normally.

- [ ] **Step 3: Verify it's reachable and the secret gate works**

```bash
curl -s -w "\nHTTP:%{http_code}\n" -X POST "https://yznuzwbbyasgqeqllxic.supabase.co/functions/v1/food-macro-estimate" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bnV6d2JieWFzZ3FlcWxseGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTUyOTIsImV4cCI6MjEwMTQ5MTI5Mn0.udLk-y8c8jTy19yzF3DGMYxStN4D-EiNq9WEKc0IqPM" \
  -H "authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bnV6d2JieWFzZ3FlcWxseGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTUyOTIsImV4cCI6MjEwMTQ5MTI5Mn0.udLk-y8c8jTy19yzF3DGMYxStN4D-EiNq9WEKc0IqPM" \
  -H "content-type: application/json" \
  -d '{"image":"","name":"test"}'
```
Expected: `Unauthorized` with `HTTP:401` (no `x-coach-secret` header sent — this confirms the function is live and the secret check runs, without spending an actual AI call or touching the rate-limit table).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/food-macro-estimate/index.ts
git commit -m "feat: food-macro-estimate Edge Function"
```

---

### Task 3: Frontend wiring

**Files:**
- Modify: `index.html:4038-4058` (`openFoodSearch`)
- Modify: `index.html:4181-4187` (`closeFoodSearch`, module state declarations)
- Modify: `index.html:4235-4278` (`analyzeFoodPhotoFile`)
- Modify: `index.html:4296-4309` (`selectFoodPhotoComponent`, `backToFoodSearchList`)
- Modify: `index.html:4342-4350` (`goToCustomFoodStep`)
- Modify: `index.html:5895-5936` (search modal HTML: new button row, new AI hint)

- [ ] **Step 1: Add the two new module-level state variables**

Current code (`index.html:4186-4187`):
```js
let foodPhotoComponents = [];
let foodPhotoPendingGrams = null;
```
Change to:
```js
let foodPhotoComponents = [];
let foodPhotoPendingGrams = null;
let foodPhotoLastImageBase64 = null;
let foodPhotoMacroEstimate = null;
```

- [ ] **Step 2: Reset the new state alongside the existing photo state in `openFoodSearch`**

Current code (`index.html:4038-4043`):
```js
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  foodPhotoComponents = [];
  foodPhotoPendingGrams = null;
  document.getElementById('food-search-input').value = '';
```
Change to:
```js
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  foodPhotoComponents = [];
  foodPhotoPendingGrams = null;
  foodPhotoLastImageBase64 = null;
  foodPhotoMacroEstimate = null;
  document.getElementById('food-macro-estimate-row').style.display = 'none';
  document.getElementById('food-search-input').value = '';
```

- [ ] **Step 3: Same reset in `closeFoodSearch`**

Current code (`index.html:4181-4184`):
```js
function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
}
```
Change to:
```js
function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
  foodPhotoLastImageBase64 = null;
  foodPhotoMacroEstimate = null;
}
```

- [ ] **Step 4: Store the resized photo after a successful analysis**

Current code (`index.html:4243-4249`):
```js
  let base64;
  try {
    base64 = await resizeImageToBase64(file, 1024);
  } catch (err) {
    showStatus('food-photo-status', 'Kuvan käsittely epäonnistui', true);
    return;
  }
```
Change to:
```js
  let base64;
  try {
    base64 = await resizeImageToBase64(file, 1024);
  } catch (err) {
    showStatus('food-photo-status', 'Kuvan käsittely epäonnistui', true);
    return;
  }
  foodPhotoLastImageBase64 = base64;
```

- [ ] **Step 5: Add a helper that shows/hides the new button, call it from `selectFoodPhotoComponent` and `backToFoodSearchList`**

Current code (`index.html:4296-4309`):
```js
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
Change to:
```js
function updateFoodMacroEstimateButtonVisibility() {
  document.getElementById('food-macro-estimate-row').style.display = foodPhotoLastImageBase64 ? 'block' : 'none';
}

function selectFoodPhotoComponent(i) {
  const component = foodPhotoComponents[i];
  foodPhotoComponents.splice(i, 1);
  foodPhotoPendingGrams = component.grams;
  document.getElementById('food-search-step-photo').style.display = 'none';
  document.getElementById('food-search-step-list').style.display = 'block';
  document.getElementById('food-search-input').value = component.name;
  updateFoodMacroEstimateButtonVisibility();
  runFoodSearch(component.name);
}

function backToFoodSearchList() {
  document.getElementById('food-search-step-photo').style.display = 'none';
  document.getElementById('food-search-step-list').style.display = 'block';
  updateFoodMacroEstimateButtonVisibility();
}
```

- [ ] **Step 6: Add `estimateFoodMacrosWithAI()`**

Add this new function right after `selectFoodPhotoComponent`/`backToFoodSearchList` (i.e. after the code from Step 5):
```js
async function estimateFoodMacrosWithAI() {
  const secret = getCoachSecret();
  if (!secret) {
    promptCoachSecret(() => estimateFoodMacrosWithAI());
    return;
  }
  const statusEl = document.getElementById('food-macro-estimate-status');
  const btn = document.getElementById('food-macro-estimate-btn');
  btn.disabled = true;
  statusEl.textContent = 'Arvioidaan...';
  statusEl.className = 'status';
  try {
    const res = await fetch(`${SB_URL}/functions/v1/food-macro-estimate`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'authorization': `Bearer ${SB_KEY}`,
        'x-coach-secret': secret,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        image: foodPhotoLastImageBase64,
        name: document.getElementById('food-search-input').value.trim(),
        grams: foodPhotoPendingGrams,
      }),
    });
    if (res.status === 429) {
      btn.disabled = false;
      showStatus('food-macro-estimate-status', 'Päivän arviointiraja täynnä, yritä huomenna', true);
      return;
    }
    if (!res.ok) {
      btn.disabled = false;
      showStatus('food-macro-estimate-status', 'Arviointi epäonnistui, yritä uudelleen', true);
      return;
    }
    const data = await res.json();
    foodPhotoMacroEstimate = {
      kcalPer100g: data.kcalPer100g,
      proteinPer100g: data.proteinPer100g,
      carbsPer100g: data.carbsPer100g,
      fatPer100g: data.fatPer100g,
    };
    btn.disabled = false;
    goToCustomFoodStep();
  } catch (err) {
    console.error('estimateFoodMacrosWithAI failed:', err.message);
    btn.disabled = false;
    showStatus('food-macro-estimate-status', 'Arviointi epäonnistui, tarkista verkkoyhteys', true);
  }
}
```

- [ ] **Step 7: Extend `goToCustomFoodStep()` to pre-fill the AI estimate**

Current code (`index.html:4342-4350`):
```js
function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  document.getElementById('custom-food-name').value = document.getElementById('food-search-input').value.trim();
  ['custom-food-kcal','custom-food-protein','custom-food-carbs','custom-food-fat'].forEach(id => {
    document.getElementById(id).value = '';
  });
}
```
Change to:
```js
function goToCustomFoodStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'block';
  document.getElementById('custom-food-name').value = document.getElementById('food-search-input').value.trim();
  const est = foodPhotoMacroEstimate;
  document.getElementById('custom-food-kcal').value = est ? est.kcalPer100g : '';
  document.getElementById('custom-food-protein').value = est ? est.proteinPer100g : '';
  document.getElementById('custom-food-carbs').value = est ? est.carbsPer100g : '';
  document.getElementById('custom-food-fat').value = est ? est.fatPer100g : '';
  document.getElementById('custom-food-ai-hint').style.display = est ? 'block' : 'none';
  foodPhotoMacroEstimate = null;
}
```
The `foodPhotoMacroEstimate = null` at the end is deliberate — it's a one-shot pre-fill, consumed immediately, so a later unrelated visit to this same form (e.g. clicking "+ Lisää oma tuote" normally after this) doesn't accidentally reuse a stale estimate.

- [ ] **Step 8: Add the new button/status row to the search-results step HTML**

Current code (`index.html:5895-5906`):
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
Change to:
```html
    <div id="food-search-step-list">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" id="food-search-input" placeholder="Hae esim. kananrinta..."
               oninput="onFoodSearchInput()" style="flex:1;box-sizing:border-box;">
        <button class="btn" onclick="openFoodPhotoPicker()" style="flex:none;padding:0 14px;" title="Tunnista kuvasta">📷</button>
      </div>
      <input type="file" id="food-photo-input" accept="image/*" style="display:none" onchange="onFoodPhotoSelected(this)">
      <div id="food-macro-estimate-row" style="display:none;margin-bottom:10px;">
        <button class="btn" id="food-macro-estimate-btn" onclick="estimateFoodMacrosWithAI()" style="width:100%;">🤖 Arvioi tekoälyllä</button>
        <div class="status" id="food-macro-estimate-status"></div>
      </div>
      <div id="food-search-results"></div>
      <div style="text-align:center;margin-top:10px;">
        <span class="food-search-custom-link" onclick="goToCustomFoodStep()">+ Lisää oma tuote</span>
      </div>
    </div>
```

- [ ] **Step 9: Add the "AI estimate, verify" hint to the custom-food form HTML**

Current code (`index.html:5928-5936`):
```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>
```
Change to:
```html
    <div id="food-search-step-custom" style="display:none">
      <div id="custom-food-ai-hint" style="display:none;color:var(--text2);font-size:13px;margin-bottom:10px;">🤖 Tekoälyn arvio — tarkista ennen tallennusta</div>
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
      <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="custom-food-kcal"></div>
      <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="custom-food-protein"></div>
      <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="custom-food-carbs"></div>
      <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="custom-food-fat"></div>
      <button class="btn btn-primary" id="custom-food-save-btn" onclick="saveCustomFoodAndContinue()">Tallenna ja jatka</button>
      <div class="status" id="custom-food-status"></div>
    </div>
```

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "feat: ruokakuvan tekoälyavusteinen makroarvio kun Fineli-osumaa ei löydy"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start a local server and open the app**

```bash
python3 -m http.server 8800
```
Open `http://localhost:8800/index.html` in a browser.

- [ ] **Step 2: Take/select a real photo of any food**

Go to Ruoka → pick a meal → "+ Lisää ruoka" → tap 📷 → choose a real photo containing food (any photo works — a meal, a snack, anything recognizable). Wait for detection to complete and tap one of the detected components.

- [ ] **Step 3: Confirm the new button appears and is usable even when Fineli finds nothing useful**

Confirm "🤖 Arvioi tekoälyllä" is visible directly above the search results (no scrolling needed), regardless of how many/few Fineli results came back. Tap it.

- [ ] **Step 4: Confirm the estimate lands in the custom-food form**

Expected: the "Lisää oma tuote" form opens automatically with Nimi already filled (from the earlier fix), all four macro fields filled with plausible numbers for the photographed food, and the "🤖 Tekoälyn arvio — tarkista ennen tallennusta" hint visible above the fields.

- [ ] **Step 5: Save and confirm the full pipeline still works unchanged**

Adjust a value if you want, tap "Tallenna ja jatka" → confirm the amount step shows the AI-detected grams pre-filled (same as before this feature) → tap "Lisää" → confirm the entry appears in the correct meal on the Ruoka page with a sensible kcal total.

- [ ] **Step 6: Check for console errors**

Check the browser console — no errors expected through the whole flow.

- [ ] **Step 7: Clean up the test entry**

Delete the test food log entry via the UI (tap the entry → "Poista"). Then remove the orphaned `custom_foods` row it created (the delete above only removes the `food_log_entries` row, not the `custom_foods` row it references — same as any custom food):
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select id, name from custom_foods order by created_at desc limit 3;"}'
```
Identify the test row by name/recency, then delete it by its exact `id` (never a broad date-range delete):
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"delete from custom_foods where id = '"'"'<exact-id-from-above>'"'"';"}'
```

- [ ] **Step 8: Stop the local server**

```bash
pkill -f "http.server 8800"
```

---

### Task 5: Version bump and deploy

**Files:**
- Modify: `index.html:1247` (version chip — note: this line number assumes Task 1's plan from `2026-08-05-viikon-kalorivajetavoite.md` has NOT yet been applied; re-check the current version chip value before editing if both plans are being executed together)

- [ ] **Step 1: Bump the version chip**

Read the current version chip value first:
```bash
grep -n "version-chip" index.html
```
Increment it by one minor version from whatever it currently shows, with wording matching this feature. For example if it currently reads `v1.29.0`, change it to:
```html
    <div class="version-chip" style="margin:0">v1.30.0</div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "v1.30.0: ruokakuvan tekoälyavusteinen makroarvio"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Verify the live site picked up the change**

```bash
sleep 60 && curl -s "https://patrikfriis-alt.github.io/treeniapp/?cb=$RANDOM" | grep -o "food-macro-estimate-btn" | head -1
```
Expected output: `food-macro-estimate-btn`. If empty, wait another 30-60s and retry.
