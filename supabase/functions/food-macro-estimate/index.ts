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
