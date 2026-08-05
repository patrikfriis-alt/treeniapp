# Ruokakuvan erävahvistus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-component tap-through-to-search photo flow with one batch screen: all detected (plus manually added) rows sit in a list, a "Hae Finelistä" button fills macros for every row it can match, a conditional "Arvioi tekoälyllä" button fills whatever's left with one combined AI call, and a big "Tallenna kaikki" button saves everything at once.

**Architecture:** New client-side state (`foodPhotoRows`, replacing `foodPhotoComponents`/`foodPhotoPendingGrams`/`foodPhotoMacroEstimate`) holds one row per food item with optional macros/source. The existing `searchFineli()` gets reused in a loop for the Fineli button. The `food-macro-estimate` Edge Function (shipped earlier tonight) gets rewritten from single-item to array-based, mirroring how `food-photo` already returns an array from one Claude call — this keeps AI calls to one per batch instead of one per missing row. The save step reuses the existing `ensureFoodCache`/`createCustomFood`/`addFoodLogEntry` functions unchanged, just called once per row. This supersedes and removes the "🤖 Arvioi tekoälyllä"-per-search button mechanism shipped in commit `db7683c` a few hours ago — see the design spec's "Korvaa" section for the exact list of what gets deleted.

**Tech Stack:** Deno/TypeScript Supabase Edge Function, vanilla JS (`index.html`). No test framework — manual verification via a real food photo, per this project's established pattern.

**Read first:** `docs/superpowers/specs/2026-08-05-ruokakuva-eravahvistus-design.md` for full background/rationale — this plan implements it directly, code shown below is already final.

---

### Task 1: Rewrite `food-macro-estimate` as array-based

**Files:**
- Modify: `supabase/functions/food-macro-estimate/index.ts` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

Current file does single-item `{image, name, grams}` → `{kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g}`. Replace the whole file with:

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

const MACRO_ESTIMATE_SYSTEM_PROMPT = `Tehtäväsi on arvioida annettujen ruokien ravintosisältö per 100 grammaa kuvan ja nimien perusteella. Saat listan ruokia (nimi + arvioitu annoskoko grammoina, konteksiksi). Vastaa PELKÄSTÄÄN JSON-taulukolla, samassa järjestyksessä ja samanpituisena kuin annettu lista, ei muuta tekstiä: [{"kcalPer100g": number, "proteinPer100g": number, "carbsPer100g": number, "fatPer100g": number} | null, ...]. Käytä taulukon alkiona null sille kohdalle jota et pysty arvioimaan järkevästi kuvan ja nimen perusteella.`;

async function callClaudeVision(base64Image: string, items: { name: string; grams?: number }[]): Promise<string> {
  const itemsText = items
    .map((item, i) => `${i + 1}. ${item.name}${item.grams != null ? ` (~${Math.round(item.grams)}g)` : ''}`)
    .join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      system: MACRO_ESTIMATE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          { type: 'text', text: `Arvioi ravintosisältö per 100g näille ruoille:\n${itemsText}` },
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

type Estimate = { kcalPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number };

function parseEstimateEntry(entry: any): Estimate | null {
  if (entry === null || entry === undefined) return null;
  const fields = ['kcalPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'] as const;
  for (const f of fields) {
    if (entry[f] === null || entry[f] === undefined || !Number.isFinite(Number(entry[f]))) return null;
  }
  return {
    kcalPer100g: Number(entry.kcalPer100g),
    proteinPer100g: Number(entry.proteinPer100g),
    carbsPer100g: Number(entry.carbsPer100g),
    fatPer100g: Number(entry.fatPer100g),
  };
}

function parseEstimates(raw: string, expectedLength: number): (Estimate | null)[] | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== expectedLength) return null;
    return parsed.map(parseEstimateEntry);
  } catch (err) {
    console.error('parseEstimates failed:', err instanceof Error ? err.message : String(err), '| raw:', raw);
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

  let body: { image?: string; items?: { name?: string; grams?: number }[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
  }
  if (!body.image || !Array.isArray(body.items) || body.items.length === 0 || body.items.some((it) => !it.name)) {
    return new Response('Bad Request: image and non-empty items[].name required', { status: 400, headers: CORS_HEADERS });
  }
  const items = body.items as { name: string; grams?: number }[];

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
    raw = await callClaudeVision(body.image, items);
  } catch (err) {
    console.error('Claude vision call failed:', err instanceof Error ? err.message : String(err));
    return new Response('AI request failed', { status: 502, headers: CORS_HEADERS });
  }

  const estimates = parseEstimates(raw, items.length);
  if (!estimates) {
    return new Response('Could not estimate macros', { status: 502, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ estimates }), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
});
```

Note the `entry[f] === null` explicit check in `parseEstimateEntry` — this proactively avoids the exact bug that was found and fixed in the single-item version (`Number(null) === 0` passing `Number.isFinite`), applied per-field per-array-entry this time.

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy food-macro-estimate --project-ref yznuzwbbyasgqeqllxic
```
No `--no-verify-jwt` needed (same reasoning as before — this function is only ever called by the app's own client code with a valid apikey/authorization pair).

- [ ] **Step 3: Verify the auth gate and basic shape**

```bash
curl -s -w "\nHTTP:%{http_code}\n" -X POST "https://yznuzwbbyasgqeqllxic.supabase.co/functions/v1/food-macro-estimate" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bnV6d2JieWFzZ3FlcWxseGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTUyOTIsImV4cCI6MjEwMTQ5MTI5Mn0.udLk-y8c8jTy19yzF3DGMYxStN4D-EiNq9WEKc0IqPM" \
  -H "authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bnV6d2JieWFzZ3FlcWxseGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTUyOTIsImV4cCI6MjEwMTQ5MTI5Mn0.udLk-y8c8jTy19yzF3DGMYxStN4D-EiNq9WEKc0IqPM" \
  -H "content-type: application/json" \
  -d '{"image":"","items":[{"name":"test"}]}'
```
Expected: `Unauthorized` / `HTTP:401` (no `x-coach-secret` sent — confirms the function deployed and the auth gate runs before touching the rate-limit table).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/food-macro-estimate/index.ts
git commit -m "feat: food-macro-estimate hyväksyy nyt useita ruokia yhdellä kutsulla"
```

---

### Task 2: Frontend — batch row UI replacing the per-item photo flow

**Files:**
- Modify: `index.html` (multiple spots within the food-search-modal area — search by function/element name, not line number, since prior edits tonight may have shifted things slightly)

- [ ] **Step 1: Replace the module-level photo state**

Current code:
```js
let foodPhotoComponents = [];
let foodPhotoPendingGrams = null;
let foodPhotoLastImageBase64 = null;
let foodPhotoMacroEstimate = null;
```
Change to:
```js
let foodPhotoRows = [];
let foodPhotoFineliAttempted = false;
let foodPhotoLastImageBase64 = null;
```

- [ ] **Step 2: Update `openFoodSearch`'s reset block**

Current code:
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
Change to:
```js
async function openFoodSearch(mealType) {
  foodModalMeal = mealType;
  foodModalSelected = null;
  foodPhotoRows = [];
  foodPhotoFineliAttempted = false;
  foodPhotoLastImageBase64 = null;
  document.getElementById('food-search-input').value = '';
```
(the rest of the function body, below this point, is unchanged)

- [ ] **Step 3: Update `closeFoodSearch`'s reset**

Current code:
```js
function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
  foodPhotoLastImageBase64 = null;
  foodPhotoMacroEstimate = null;
}
```
Change to:
```js
function closeFoodSearch() {
  document.getElementById('food-search-modal').style.display = 'none';
  document.body.style.overflow = '';
  foodPhotoLastImageBase64 = null;
  foodPhotoRows = [];
  foodPhotoFineliAttempted = false;
}
```

- [ ] **Step 4: Update `analyzeFoodPhotoFile` to build `foodPhotoRows`**

Current code (the last part of the function, inside the `try` block after a successful response):
```js
    const data = await res.json();
    foodPhotoComponents = data.components || [];
    renderFoodPhotoComponents();
  } catch (err) {
    console.error('analyzeFoodPhotoFile failed:', err.message);
    showStatus('food-photo-status', 'Tunnistus epäonnistui, tarkista verkkoyhteys', true);
  }
}
```
Change to:
```js
    const data = await res.json();
    const components = data.components || [];
    foodPhotoRows = components.map(c => ({
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: c.name,
      grams: Math.round(c.grams),
      kcalPer100g: null,
      proteinPer100g: null,
      carbsPer100g: null,
      fatPer100g: null,
      source: null,
      fineliId: null,
    }));
    foodPhotoFineliAttempted = false;
    renderFoodPhotoRows();
  } catch (err) {
    console.error('analyzeFoodPhotoFile failed:', err.message);
    showStatus('food-photo-status', 'Tunnistus epäonnistui, tarkista verkkoyhteys', true);
  }
}
```
(everything above this point in `analyzeFoodPhotoFile` — the resize, the fetch call itself, the 429/non-ok handling — is unchanged; only the success-path body changes)

The `row-<timestamp>-<random>` id format matches this codebase's existing convention for client-generated ids (see `enqueueWrite`'s offline-queue entry ids).

- [ ] **Step 5: Replace `renderFoodPhotoComponents`, `updateFoodMacroEstimateButtonVisibility`, `selectFoodPhotoComponent`, and the old `estimateFoodMacrosWithAI` with the new row-based functions**

Current code (this whole block, in order, gets removed):
```js
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

Replace the entire block above with:
```js
function renderFoodPhotoRows() {
  const statusEl = document.getElementById('food-photo-status');
  statusEl.textContent = '';
  statusEl.className = 'status';
  const el = document.getElementById('food-photo-rows');
  if (!foodPhotoRows.length) {
    el.innerHTML = `<div class="food-search-empty">Ei tunnistettuja ruokia, kokeile toista kuvaa, hae manuaalisesti, tai lisää rivi käsin</div>`;
  } else {
    el.innerHTML = foodPhotoRows.map(row => {
      const hasMacros = row.kcalPer100g != null;
      const summary = hasMacros
        ? `${Math.round(row.kcalPer100g * row.grams / 100)} kcal · ${Math.round(row.proteinPer100g * row.grams / 100 * 10) / 10}g proteiini · ${Math.round(row.carbsPer100g * row.grams / 100 * 10) / 10}g hiilarit · ${Math.round(row.fatPer100g * row.grams / 100 * 10) / 10}g rasva`
        : 'Makrot puuttuvat';
      const sourceTag = row.source === 'fineli' ? ' · Fineli' : row.source === 'ai' ? ' · 🤖 AI-arvio' : '';
      return `
      <div class="food-photo-row">
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" value="${escapeHtml(row.name)}" onchange="updateFoodPhotoRowName('${row.id}', this.value)" style="flex:1;box-sizing:border-box;">
          <input type="number" value="${row.grams}" onchange="updateFoodPhotoRowGrams('${row.id}', this.value)" style="width:70px;box-sizing:border-box;">
          <span onclick="removeFoodPhotoRow('${row.id}')" style="cursor:pointer;color:var(--red);font-size:18px;">×</span>
        </div>
        <div onclick="openEditFoodPhotoRowMacrosDialog('${row.id}')" style="font-size:13px;color:var(--text2);margin-top:4px;cursor:pointer;">
          ${summary}${sourceTag}
        </div>
      </div>`;
    }).join('');
  }
  const missingCount = foodPhotoRows.filter(r => r.kcalPer100g == null).length;
  document.getElementById('food-photo-fineli-btn').style.display = foodPhotoRows.length ? 'block' : 'none';
  document.getElementById('food-photo-ai-btn').style.display = (foodPhotoFineliAttempted && missingCount > 0) ? 'block' : 'none';
  document.getElementById('food-photo-save-btn').disabled = foodPhotoRows.length === 0 || missingCount > 0;
}

function updateFoodPhotoRowName(id, value) {
  const row = foodPhotoRows.find(r => r.id === id);
  if (!row) return;
  const trimmed = value.trim();
  if (trimmed !== row.name && row.kcalPer100g != null) {
    row.kcalPer100g = null;
    row.proteinPer100g = null;
    row.carbsPer100g = null;
    row.fatPer100g = null;
    row.source = null;
    row.fineliId = null;
  }
  row.name = trimmed;
  renderFoodPhotoRows();
}

function updateFoodPhotoRowGrams(id, value) {
  const row = foodPhotoRows.find(r => r.id === id);
  if (!row) return;
  const grams = parseFloat(value);
  row.grams = grams > 0 ? grams : row.grams;
  renderFoodPhotoRows();
}

function removeFoodPhotoRow(id) {
  foodPhotoRows = foodPhotoRows.filter(r => r.id !== id);
  renderFoodPhotoRows();
}

function addFoodPhotoRow() {
  foodPhotoRows.push({
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
    grams: 100,
    kcalPer100g: null,
    proteinPer100g: null,
    carbsPer100g: null,
    fatPer100g: null,
    source: null,
    fineliId: null,
  });
  renderFoodPhotoRows();
}

function openEditFoodPhotoRowMacrosDialog(id) {
  const row = foodPhotoRows.find(r => r.id === id);
  if (!row) return;

  const existing = document.getElementById('edit-photo-row-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'edit-photo-row-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;max-width:360px;width:100%;';
  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)">${escapeHtml(row.name)}</div>
    <div class="form-row"><label>Kcal/100g</label><input type="text" inputmode="decimal" id="edit-photo-row-kcal" value="${row.kcalPer100g ?? ''}"></div>
    <div class="form-row"><label>Proteiini/100g</label><input type="text" inputmode="decimal" id="edit-photo-row-protein" value="${row.proteinPer100g ?? ''}"></div>
    <div class="form-row"><label>Hiilarit/100g</label><input type="text" inputmode="decimal" id="edit-photo-row-carbs" value="${row.carbsPer100g ?? ''}"></div>
    <div class="form-row"><label>Rasva/100g</label><input type="text" inputmode="decimal" id="edit-photo-row-fat" value="${row.fatPer100g ?? ''}"></div>
    <button class="btn btn-primary" id="edit-photo-row-save-btn">Tallenna</button>
    <button class="btn" id="edit-photo-row-cancel-btn" style="margin-top:8px;background:none;color:var(--text2);width:100%;">Peruuta</button>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  document.getElementById('edit-photo-row-save-btn').onclick = () => {
    const kcal = parseNum('edit-photo-row-kcal');
    const protein = parseNum('edit-photo-row-protein');
    const carbs = parseNum('edit-photo-row-carbs');
    const fat = parseNum('edit-photo-row-fat');
    if (kcal == null) return;
    row.kcalPer100g = kcal;
    row.proteinPer100g = protein || 0;
    row.carbsPer100g = carbs || 0;
    row.fatPer100g = fat || 0;
    if (row.source == null) row.source = 'ai';
    overlay.remove();
    renderFoodPhotoRows();
  };
  document.getElementById('edit-photo-row-cancel-btn').onclick = () => overlay.remove();
}

function backToFoodSearchList() {
  document.getElementById('food-search-step-photo').style.display = 'none';
  document.getElementById('food-search-step-list').style.display = 'block';
}

async function fetchFineliForAllRows() {
  const btn = document.getElementById('food-photo-fineli-btn');
  btn.disabled = true;
  const rowsToSearch = foodPhotoRows.filter(r => r.kcalPer100g == null && r.name.trim());
  await Promise.all(rowsToSearch.map(async row => {
    try {
      const results = await searchFineli(row.name.trim());
      if (results && results.length > 0) {
        const item = results[0];
        row.kcalPer100g = item.energyKcal || 0;
        row.proteinPer100g = item.protein || 0;
        row.carbsPer100g = item.carbohydrate || 0;
        row.fatPer100g = item.fat || 0;
        row.source = 'fineli';
        row.fineliId = item.id;
      }
    } catch (err) {
      console.error('fetchFineliForAllRows failed for row', row.id, err.message);
    }
  }));
  foodPhotoFineliAttempted = true;
  btn.disabled = false;
  renderFoodPhotoRows();
}

async function estimateMissingRowsWithAI() {
  const secret = getCoachSecret();
  if (!secret) {
    promptCoachSecret(() => estimateMissingRowsWithAI());
    return;
  }
  const rowsToEstimate = foodPhotoRows.filter(r => r.kcalPer100g == null && r.name.trim());
  if (!rowsToEstimate.length) return;
  const btn = document.getElementById('food-photo-ai-btn');
  const statusEl = document.getElementById('food-photo-ai-status');
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
        items: rowsToEstimate.map(r => ({ name: r.name.trim(), grams: r.grams })),
      }),
    });
    if (res.status === 429) {
      btn.disabled = false;
      showStatus('food-photo-ai-status', 'Päivän arviointiraja täynnä, yritä huomenna', true);
      return;
    }
    if (!res.ok) {
      btn.disabled = false;
      showStatus('food-photo-ai-status', 'Arviointi epäonnistui, yritä uudelleen', true);
      return;
    }
    const data = await res.json();
    const estimates = data.estimates || [];
    rowsToEstimate.forEach((row, i) => {
      const est = estimates[i];
      if (!est) return;
      row.kcalPer100g = est.kcalPer100g;
      row.proteinPer100g = est.proteinPer100g;
      row.carbsPer100g = est.carbsPer100g;
      row.fatPer100g = est.fatPer100g;
      row.source = 'ai';
    });
    btn.disabled = false;
    renderFoodPhotoRows();
  } catch (err) {
    console.error('estimateMissingRowsWithAI failed:', err.message);
    btn.disabled = false;
    showStatus('food-photo-ai-status', 'Arviointi epäonnistui, tarkista verkkoyhteys', true);
  }
}

async function saveAllFoodPhotoRows() {
  const btn = document.getElementById('food-photo-save-btn');
  btn.disabled = true;
  const dateIso = localIso(addDays(new Date(), foodDayOffset));
  const rows = [...foodPhotoRows];
  const results = await Promise.allSettled(rows.map(async row => {
    let cacheId = null;
    let customId = null;
    if (row.source === 'fineli') {
      cacheId = await ensureFoodCache(row.fineliId, row.name, row.kcalPer100g, row.proteinPer100g, row.carbsPer100g, row.fatPer100g);
    } else {
      customId = await createCustomFood({ name: row.name, kcalPer100g: row.kcalPer100g, proteinPer100g: row.proteinPer100g, carbsPer100g: row.carbsPer100g, fatPer100g: row.fatPer100g });
    }
    await addFoodLogEntry({
      mealType: foodModalMeal,
      dateIso,
      foodCacheId: cacheId,
      customFoodId: customId,
      amountG: row.grams,
      kcalPer100g: row.kcalPer100g,
      proteinPer100g: row.proteinPer100g,
    });
    return row.id;
  }));
  const savedIds = new Set(results.filter(r => r.status === 'fulfilled').map(r => r.value));
  foodPhotoRows = foodPhotoRows.filter(r => !savedIds.has(r.id));
  const failedCount = results.filter(r => r.status === 'rejected').length;
  if (failedCount > 0) {
    results.forEach(r => { if (r.status === 'rejected') console.error('saveAllFoodPhotoRows row failed:', r.reason); });
    btn.disabled = false;
    showStatus('food-photo-save-status', `${failedCount} riviä ei tallentunut, yritä uudelleen`, true);
    renderFoodPhotoRows();
    return;
  }
  closeFoodSearch();
  await renderRuoka();
}
```

Notes on this code:
- `onchange` (not `oninput`) is used for the name/grams inputs deliberately — the whole row list re-renders its `innerHTML` on every state change, and `oninput` would fight the user's cursor position mid-keystroke; `onchange` (fires on blur/Enter) avoids that.
- `parseNum`, `escapeHtml`, `showStatus`, `localIso`, `addDays`, `foodDayOffset`, `renderRuoka`, `getCoachSecret`, `promptCoachSecret`, `searchFineli`, `ensureFoodCache`, `createCustomFood`, `addFoodLogEntry` are all pre-existing globals elsewhere in this file — nothing new needs defining for them.
- In `openEditFoodPhotoRowMacrosDialog`, if `row.source` was `null` (row never got macros from anywhere) and the user fills them in by hand, `source` is set to `'ai'` purely so `saveAllFoodPhotoRows` knows to route it through `createCustomFood` rather than `ensureFoodCache` (which requires a `fineliId` this row never had) — this is a save-routing label, not a claim about where the numbers came from.

- [ ] **Step 6: Revert `goToCustomFoodStep()` — remove the now-obsolete AI-estimate prefill, keep the still-valid name prefill**

Current code:
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
Change to:
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
**Important:** keep the `custom-food-name` prefill-from-search-input line (that's an unrelated, still-valid fix from earlier tonight, commit `30637f3`) — only the `foodPhotoMacroEstimate`/AI-hint parts are being removed here, this function is now used ONLY by the unchanged manual "+ Lisää oma tuote" path.

- [ ] **Step 7: Revert `goToAmountStep()` — remove the now-unused `foodPhotoPendingGrams` reference**

Current code:
```js
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
Change to:
```js
function goToAmountStep() {
  document.getElementById('food-search-step-list').style.display = 'none';
  document.getElementById('food-search-step-custom').style.display = 'none';
  document.getElementById('food-search-step-amount').style.display = 'flex';
  document.getElementById('food-amount-name').textContent = foodModalSelected.name;
  document.getElementById('food-amount-grams').value = 100;
  updateFoodAmountPreview();
}
```
This function is now only reached via the manual search/custom-food paths (`selectFoodItem`, `saveCustomFoodAndContinue`), neither of which ever had a "pending grams from a photo" concept of their own — that concept only existed for the now-removed per-item photo flow.

- [ ] **Step 8: Revert `confirmAddFood()`'s post-save branch**

Current code (the relevant part, inside `confirmAddFood`):
```js
    if (foodPhotoComponents.length > 0) {
      document.getElementById('food-search-step-amount').style.display = 'none';
      document.getElementById('food-search-step-photo').style.display = 'block';
      renderFoodPhotoComponents();
    } else {
      closeFoodSearch();
    }
    await renderRuoka();
```
Change to:
```js
    closeFoodSearch();
    await renderRuoka();
```
`confirmAddFood()` is reached only via the manual search/custom-food single-item paths now (`goToAmountStep` → this function) — there's no more "loop back to the photo list for the next component" behavior, since all photo-detected rows are handled together on the batch screen via `saveAllFoodPhotoRows()`, not through this function at all.

- [ ] **Step 9: Update the modal HTML — remove the old button row, replace the photo step's content, remove the AI hint**

Current code (the `food-search-step-list` div's macro-estimate row):
```html
      <input type="file" id="food-photo-input" accept="image/*" style="display:none" onchange="onFoodPhotoSelected(this)">
      <div id="food-macro-estimate-row" style="display:none;margin-bottom:10px;">
        <button class="btn" id="food-macro-estimate-btn" onclick="estimateFoodMacrosWithAI()" style="width:100%;">🤖 Arvioi tekoälyllä</button>
        <div class="status" id="food-macro-estimate-status"></div>
      </div>
      <div id="food-search-results"></div>
```
Change to:
```html
      <input type="file" id="food-photo-input" accept="image/*" style="display:none" onchange="onFoodPhotoSelected(this)">
      <div id="food-search-results"></div>
```

Current code (the whole `food-search-step-photo` div):
```html
    <div id="food-search-step-photo" style="display:none">
      <div id="food-photo-status" class="status"></div>
      <div id="food-photo-components"></div>
      <button class="btn" onclick="backToFoodSearchList()" style="margin-top:10px;background:none;color:var(--text2);width:100%;">← Takaisin hakuun</button>
    </div>
```
Change to:
```html
    <div id="food-search-step-photo" style="display:none">
      <div id="food-photo-status" class="status"></div>
      <div id="food-photo-rows"></div>
      <div style="text-align:center;margin:10px 0;">
        <span class="food-search-custom-link" onclick="addFoodPhotoRow()">+ Lisää rivi</span>
      </div>
      <button class="btn" id="food-photo-fineli-btn" onclick="fetchFineliForAllRows()" style="display:none;width:100%;margin-bottom:8px;">Hae Finelistä</button>
      <button class="btn" id="food-photo-ai-btn" onclick="estimateMissingRowsWithAI()" style="display:none;width:100%;margin-bottom:8px;">🤖 Arvioi tekoälyllä</button>
      <div class="status" id="food-photo-ai-status"></div>
      <button class="btn" onclick="backToFoodSearchList()" style="background:none;color:var(--text2);width:100%;">← Takaisin hakuun</button>
      <button class="btn btn-primary" id="food-photo-save-btn" onclick="saveAllFoodPhotoRows()" disabled style="width:100%;margin-top:10px;font-size:16px;padding:14px;">Tallenna kaikki</button>
      <div class="status" id="food-photo-save-status"></div>
    </div>
```

Current code (the AI hint inside `food-search-step-custom`):
```html
    <div id="food-search-step-custom" style="display:none">
      <div id="custom-food-ai-hint" style="display:none;color:var(--text2);font-size:13px;margin-bottom:10px;">🤖 Tekoälyn arvio — tarkista ennen tallennusta</div>
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
```
Change to:
```html
    <div id="food-search-step-custom" style="display:none">
      <div class="form-row"><label>Nimi</label><input type="text" id="custom-food-name" placeholder="Oma tuote"></div>
```

- [ ] **Step 10: Add the `.food-photo-row` CSS class**

Find the existing `.food-search-result-row` / `.food-search-empty` CSS rules and add this immediately after them:
```css
.food-photo-row { padding:10px 0; border-bottom:1px solid var(--border2); }
.food-photo-row:last-child { border-bottom:none; }
```

- [ ] **Step 11: Static sanity check**

```bash
node --check <(python3 -c "
import re
html = open('index.html').read()
m = re.search(r'<script>(.*)</script>', html, re.S)
print(m.group(1))
")
```
(If this exact one-liner doesn't work in your shell, any equivalent way of extracting the inline `<script>` content and running `node --check` on it is fine — the goal is just confirming no syntax errors before manual browser testing.)

- [ ] **Step 12: Commit**

```bash
git add index.html
git commit -m "feat: ruokakuvan erävahvistus - Fineli-erähaku, tekoälytäydennys ja yhden painikkeen tallennus"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start a local server and open the app**

```bash
python3 -m http.server 8804
```
Open `http://localhost:8804/index.html`.

- [ ] **Step 2: Take/select a real multi-item food photo**

Go to Ruoka → pick a meal → "+ Lisää ruoka" → 📷 → choose a real photo with several distinguishable food items. Wait for detection.

- [ ] **Step 3: Confirm the row list renders correctly**

Each detected item should appear as its own row with name + grams pre-filled and editable, "Makrot puuttuvat" shown, no source tag. "Hae Finelistä" button visible, "🤖 Arvioi tekoälyllä" NOT visible yet (it shouldn't be, since Fineli hasn't been tried), "Tallenna kaikki" disabled.

- [ ] **Step 4: Add a manual row**

Tap "+ Lisää rivi" → confirm a new blank row appears, editable, with "Makrot puuttuvat".

- [ ] **Step 5: Tap "Hae Finelistä"**

Confirm rows that have a real Fineli match get filled in with a "Fineli" tag and plausible macros; rows with no match (very likely including your manually-typed row unless you typed a Fineli-recognizable name) stay as "Makrot puuttuvat". Confirm "🤖 Arvioi tekoälyllä" now appears if anything is still missing.

- [ ] **Step 6: Tap "🤖 Arvioi tekoälyllä" (if it appeared)**

Confirm the remaining rows get filled with a "🤖 AI-arvio" tag and plausible macros, in one request (check the network tab or console — should be a single call to `food-macro-estimate`, not one per row).

- [ ] **Step 7: Edit a row's macros by hand**

Tap a row's summary line → confirm the edit dialog opens with the current per-100g values, change one, save → confirm the row's displayed summary updates accordingly.

- [ ] **Step 8: Edit a row's name after it has macros**

Confirm the macros and source tag clear back to "Makrot puuttuvat" — re-running "Hae Finelistä"/"Arvioi tekoälyllä" should pick it up again.

- [ ] **Step 9: Remove a row**

Tap × on one row → confirm it disappears and doesn't affect the others.

- [ ] **Step 10: Fill everything and save**

Once every remaining row has macros, confirm "Tallenna kaikki" becomes enabled, tap it, confirm the modal closes and the Ruoka page shows all the new entries in the correct meal with sensible kcal totals.

- [ ] **Step 11: Check for console errors throughout, then clean up**

No errors expected at any step above. Delete the test entries you just saved via the UI (tap each → "Poista"), and check for any orphaned `custom_foods` rows from AI-sourced entries:
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
curl -s -X POST "https://api.supabase.com/v1/projects/yznuzwbbyasgqeqllxic/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select id, name from custom_foods order by created_at desc limit 5;"}'
```
Delete any test rows found by their exact `id` (never a broad delete).

- [ ] **Step 12: Stop the local server**

```bash
pkill -f "http.server 8804"
```

---

### Task 4: Version bump and deploy

**Files:**
- Modify: `index.html` (version chip)

- [ ] **Step 1: Bump the version chip**

Check the current value first (`grep -n "version-chip" index.html`) and increment by one minor version. E.g. if it currently reads `v1.30.0`:
```html
    <div class="version-chip" style="margin:0">v1.31.0</div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "v1.31.0: ruokakuvan erävahvistus"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Verify the live site picked up the change**

```bash
sleep 60 && curl -s "https://patrikfriis-alt.github.io/treeniapp/?cb=$RANDOM" | grep -o "food-photo-save-btn" | head -1
```
Expected: `food-photo-save-btn`. If empty, wait another 30-60s and retry.
