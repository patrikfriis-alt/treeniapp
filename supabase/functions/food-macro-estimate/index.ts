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
