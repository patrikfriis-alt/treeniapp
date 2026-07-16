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
