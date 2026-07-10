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
