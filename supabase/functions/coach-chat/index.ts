import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildDataContext } from './context.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COACH_SECRET = Deno.env.get('COACH_SECRET')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const DAILY_MESSAGE_LIMIT = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-coach-secret',
};

const COACH_SYSTEM_PROMPT = `Olet Valkku-sovelluksen henkilökohtainen valmentaja. Käyttäjä harjoittelee salilla ja kestävyysurheilua, seuraa unta, painoa ja ruokailua.

Säännöt:
- Anna ehdotuksia ja havaintoja, älä koskaan väitä tehneesi muutoksia dataan tai sovellukseen — et voi kirjoittaa mitään, vain lukea ja keskustella.
- Perusta vastauksesi annettuun dataan. Jos dataa ei ole tarpeeksi jonkin kysymyksen vastaamiseen, sano niin suoraan äläkä arvaa.
- Viittaa konkreettisiin lukuihin kun mahdollista.
- Ole ytimekäs — muutama virke riittää useimpiin vastauksiin, ellei käyttäjä pyydä pidempää analyysiä.
- Vastaa suomeksi.`;

const NOTES_SYSTEM_PROMPT = `Sinun tehtäväsi on ylläpitää lyhyttä muistiinpanoa käyttäjästä havaintojen perusteella. Tässä ovat nykyiset muistiinpanot ja äskeinen keskusteluvaihto. Päivitä muistiinpanot jos jotain uutta ja pysyvästi hyödyllistä ilmeni (esim. toistuvia tapoja, mieltymyksiä, poikkeamia) — älä toista dataa jonka valmentaja jo näkee joka viestillä (esim. tarkkoja lukuja), keskity havaintoihin jotka eivät muuten näkyisi. Jos mikään ei ole muuttunut, palauta muistiinpanot muuttumattomina. Pidä muistiinpanot lyhyinä (muutama virke). Vastaa PELKÄSTÄÄN päivitetyillä muistiinpanoilla, ei muuta tekstiä.`;

async function callClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[],
): Promise<string> {
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
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b: any) => b.type === 'text');
  return textBlock?.text || '(ei vastausta)';
}

async function updateCoachNotes(
  sb: ReturnType<typeof createClient>,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  const { data: currentNotesRow, error: fetchErr } = await sb
    .from('coach_notes')
    .select('notes')
    .eq('id', 1)
    .maybeSingle();
  if (fetchErr) {
    console.error('coach_notes fetch failed:', fetchErr.message);
    return;
  }
  const currentNotes = (currentNotesRow as any)?.notes || '(ei vielä muistiinpanoja)';

  const notesPrompt = `Nykyiset muistiinpanot:\n${currentNotes}\n\nÄskeinen keskusteluvaihto:\nKäyttäjä: ${userMessage}\nValmentaja: ${assistantReply}`;

  let updatedNotes: string;
  try {
    updatedNotes = await callClaude(NOTES_SYSTEM_PROMPT, [{ role: 'user', content: notesPrompt }]);
  } catch (err) {
    console.error('notes update Claude call failed:', err instanceof Error ? err.message : String(err));
    return;
  }

  const { error: updateErr } = await sb
    .from('coach_notes')
    .update({ notes: updatedNotes.trim(), updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (updateErr) console.error('coach_notes update failed:', updateErr.message);
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

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
  }
  if (!body.conversation_id) {
    return new Response('Bad Request: conversation_id required', { status: 400, headers: CORS_HEADERS });
  }

  const sb = createClient(SB_URL, SB_SERVICE_KEY);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: todayCount, error: countError } = await sb
    .from('coach_api_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());
  if (countError) {
    console.error('daily count query failed:', countError.message);
    return new Response('Rate limit check failed', { status: 500, headers: CORS_HEADERS });
  }
  if ((todayCount || 0) >= DAILY_MESSAGE_LIMIT) {
    return new Response('Daily message limit reached', { status: 429, headers: CORS_HEADERS });
  }

  const { error: trackError } = await sb.from('coach_api_calls').insert({});
  if (trackError) {
    console.error('failed to record api call:', trackError.message);
    return new Response('Rate limit check failed', { status: 500, headers: CORS_HEADERS });
  }

  const { data: history, error: historyError } = await sb
    .from('coach_messages')
    .select('role,content')
    .eq('conversation_id', body.conversation_id)
    .order('created_at', { ascending: true });
  if (historyError) console.error('history query failed:', historyError.message);
  if (!history || !history.length) {
    return new Response('Bad Request: no messages found for conversation', { status: 400, headers: CORS_HEADERS });
  }

  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  let dataContext: string;
  try {
    dataContext = await buildDataContext(sb);
  } catch (err) {
    console.error('buildDataContext failed:', err instanceof Error ? err.message : String(err));
    dataContext = '(datan haku epäonnistui, vastaa ilman sitä ja mainitse tämä käyttäjälle)';
  }
  const fullSystemPrompt = `${COACH_SYSTEM_PROMPT}\n\n---\n\nKäyttäjän data:\n${dataContext}`;

  let reply: string;
  try {
    reply = await callClaude(fullSystemPrompt, messages);
  } catch (err) {
    console.error('Claude call failed:', err instanceof Error ? err.message : String(err));
    return new Response('AI request failed', { status: 502, headers: CORS_HEADERS });
  }

  const lastUserMessage = messages[messages.length - 1]?.content || '';
  await updateCoachNotes(sb, lastUserMessage, reply);

  return new Response(JSON.stringify({ reply }), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
});
