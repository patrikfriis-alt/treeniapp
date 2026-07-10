# Treeniapp (Valkku) — Push-ilmoitukset

**Päivämäärä:** 2026-07-10
**Laajuus:** Sprintti 3 osa 4 ("Push-ilmoitukset", 5 pistettä).
**Riippuvuudet:** Uusi migraatio (`push_subscriptions`-taulu + `app_settings.push_enabled`), uusi Supabase Edge Function, ulkoinen ilmainen ajastuspalvelu (cron-job.org) koska Supabase-projekti on Free-tasolla eikä pg_cron ole käytettävissä.

---

## Tavoite

Valkku on jo asennettu kotinäytölle standalone-PWA:na (`manifest.json`: `"display": "standalone"`), mikä täyttää iOS Safarin Web Push -vaatimuksen (tuki iOS 16.4:stä alkaen, mutta VAIN kotinäytölle asennetuille sovelluksille, ei tavallisille Safari-välilehdille). Tavoite: kaksi päivittäistä push-ilmoitusta jotka toimivat vaikka sovellus on kokonaan kiinni — muistutus jos päivällä ei ole vielä liikuttu (klo 19:30) ja erillinen aiempi varoitus jos aktiivinen streak on katkeamassa (klo 17:30). Ei koske lepopäiviä erikseen — molemmat tarkistukset ajetaan joka päivä riippumatta ohjelmoidusta päivätyypistä.

---

## 1. Laajuus — mitkä ilmoitukset

- **17:30 — streak-varoitus**: lähtee VAIN jos käyttäjällä oli aktiivinen streak eilen asti (vähintään 1 peräkkäinen aktiivinen päivä päättyen eiliseen) JA tänään ei ole vielä `activity_data`- tai `workout_sets`-riviä. Viesti: "🔥 Streakisi katkeamassa tänään — ehdit vielä!"
- **19:30 — yleismuistutus**: lähtee AINA jos tänään ei ole vielä `activity_data`- tai `workout_sets`-riviä, riippumatta streakista. Viesti: "Et ole vielä liikkunut tänään 💪"
- Molemmat käyttävät samaa "aktiivinen päivä" -määritelmää kuin nykyinen `fetchActiveDays()` (index.html:1750): rivi jommassakummassa taulussa kyseiselle päivämäärälle.
- Ei muita ilmoitustyyppejä tässä laajuudessa (PR-juhlistus, oivallukset jne. pysyvät sovelluksen sisäisinä toasteina, koska ne vaativat sovelluksen olevan jo auki treeniä tehdessä).
- Lepopäiviä ei ohiteta erikseen (tietoinen päätös).

---

## 2. Tietokanta

Uusi migraatio `supabase/migrations/2026-07-10_push_ilmoitukset.sql`:

```sql
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions
  for select to anon, authenticated using (true);
create policy push_subscriptions_insert on push_subscriptions
  for insert to anon, authenticated with check (true);
create policy push_subscriptions_delete on push_subscriptions
  for delete to anon, authenticated using (true);

alter table app_settings add column push_enabled boolean not null default true;
```

(Ei `update`-policya `push_subscriptions`-taululle — tilaukset joko luodaan tai poistetaan, ei koskaan muokata paikallaan.)

---

## 3. VAPID-avainpari

Generoidaan kertaalleen (esim. `npx web-push generate-vapid-keys` tai vastaava npm-paketti):
- **Julkinen avain**: menee `index.html`:ään JS-vakiona (`const VAPID_PUBLIC_KEY = '...'`) — turvallinen paljastaa asiakkaalle, se on suunniteltu julkiseksi.
- **Yksityinen avain + mailto-subject**: tallennetaan Supabase Edge Function -secreteinä (`supabase secrets set VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...`) — EI koskaan asiakaspuolen koodiin.

---

## 4. Asiakas (`index.html`)

Uusi "Ilmoitukset"-kytkin sivupalkkiin, Asetukset-osioon (samaan tyyliin kuin nykyiset asetuspainikkeet):

```html
<button onclick="toggleNotifications()" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
  <span style="display:flex;align-items:center;gap:10px;"><span data-icon="bell" style="display:inline-flex"></span> Ilmoitukset</span>
  <span id="notif-toggle-state" style="color:var(--text2);font-size:13px;"></span>
</button>
```

(Huom: `bell`-ikoni ei ole vielä `ICONS`-objektissa — lisätään uusi avain samalla tyylillä kuin muut SVG-ikonisetin ikonit: `bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>'`.)

```js
const VAPID_PUBLIC_KEY = '<julkinen-avain-tähän>';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function toggleNotifications() {
  const settings = await loadAppSettings();
  const currentlyEnabled = settings ? settings.push_enabled : false;

  if (currentlyEnabled) {
    const { error } = await sbWrite({ table: 'app_settings', op: 'upsert', payload: { id: 1, push_enabled: false, updated_at: new Date().toISOString() } });
    if (!error) renderNotifToggleState(false);
    return;
  }

  if (Notification.permission === 'denied') {
    alert('Ilmoitukset on estetty puhelimen asetuksista. Salli ne Asetukset → Safari/Valkku → Ilmoitukset.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const subJson = sub.toJSON();
  const { error } = await sbWrite({
    table: 'push_subscriptions',
    op: 'upsert',
    payload: { endpoint: subJson.endpoint, p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
    opts: { onConflict: 'endpoint' },
  });
  if (error) { console.error('push subscribe failed:', error.message); return; }
  await sbWrite({ table: 'app_settings', op: 'upsert', payload: { id: 1, push_enabled: true, updated_at: new Date().toISOString() } });
  renderNotifToggleState(true);
}

function renderNotifToggleState(enabled) {
  const el = document.getElementById('notif-toggle-state');
  if (el) el.textContent = enabled ? 'Päällä' : 'Pois';
}
```

Kytkimen tila ladataan sivun käynnistyessä (`renderNotifToggleState(settings.push_enabled)` osana olemassa olevaa asetusten latausta).

---

## 5. Service Worker (`sw.js`)

Uudet tapahtumakuuntelijat lisätään olemassa olevan `sw.js`:n loppuun:

```js
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Valkku', body: '' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%230a84ff\' rx=\'22\'/><path d=\'M10 54h16l8-28 12 56 12-40 8 12h24\' fill=\'none\' stroke=\'%23fff\' stroke-width=\'9\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>',
      tag: 'valkku-reminder',
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('/');
    })
  );
});
```

(Sama app-ikonin SVG data-URI kuin `manifest.json`:ssa/faviconissa — yhtenäinen ilme, ks. Branding-sub-projekti.)

---

## 6. Supabase Edge Function

Uusi tiedosto `supabase/functions/check-and-notify/index.ts` (Deno-runtime). Yksi funktio, `?type=streak` tai `?type=activity` -parametrilla:

```ts
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
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' }); // 'sv-SE' antaa YYYY-MM-DD-muodon
}
function yesterdayHelsinkiIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
}

async function hasActivityOn(sb: ReturnType<typeof createClient>, dateIso: string): Promise<boolean> {
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    sb.from('activity_data').select('id', { count: 'exact', head: true }).eq('activity_date', dateIso),
    sb.from('workout_sets').select('id', { count: 'exact', head: true }).eq('workout_date', dateIso),
  ]);
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

  const { data: settings } = await sb.from('app_settings').select('push_enabled').eq('id', 1).maybeSingle();
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

  const { data: subs } = await sb.from('push_subscriptions').select('*');
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
```

`CRON_SECRET` on itse keksitty jaettu salasana (esim. satunnainen 32-merkkinen merkkijono), asetetaan sekä Edge Function -secretinä että ulkoisen ajastuspalvelun pyynnön otsakkeeksi — estää ulkopuolisia laukaisemasta ilmoituksia tuntemalla vain funktion URL:n.

**Käyttöönotto (manuaalinen, tehdään kertaalleen Supabase CLI:llä):**
```bash
supabase init          # jos supabase/config.toml puuttuu vielä
supabase link --project-ref <project-ref>
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... CRON_SECRET=...
supabase functions deploy check-and-notify
```

---

## 7. Ajastus (cron-job.org)

Kaksi ajastettua HTTP-pyyntöä (ilmainen tili, https://cron-job.org):
- **17:30 Europe/Helsinki**, `GET https://<project-ref>.supabase.co/functions/v1/check-and-notify?type=streak`, otsake `x-cron-secret: <CRON_SECRET>`
- **19:30 Europe/Helsinki**, `GET https://<project-ref>.supabase.co/functions/v1/check-and-notify?type=activity`, otsake `x-cron-secret: <CRON_SECRET>`

Tämä konfiguroidaan manuaalisesti cron-job.org:n webkäyttöliittymässä käyttöönoton yhteydessä — ei automatisoitavissa koodilla.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Kytke Ilmoitukset-kytkin päälle sivupalkista — selain kysyy lupaa, hyväksy, tarkista `push_subscriptions`-tauluun ilmestyy rivi ja `app_settings.push_enabled = true`.
2. Kutsu `check-and-notify?type=activity` manuaalisesti (esim. `curl` oikealla `x-cron-secret`-otsakkeella) päivänä jolloin ei ole vielä liikuttu — tarkista ilmoitus saapuu puhelimeen vaikka Valkku on kokonaan kiinni.
3. Merkitse päivän aktiviteetti tehdyksi, kutsu funktio uudelleen — tarkista EI ilmoitusta (koska tänään jo aktiivinen).
4. Testaa `type=streak`-haara: varmista edellisen päivän data on olemassa (streak elossa), tarkista ilmoitus tulee jos tänään ei vielä liikuttu; testaa myös tilanne jossa eilen ei liikuttu (streak nolla) — tarkista EI ilmoitusta.
5. Kytke Ilmoitukset pois sivupalkista, kutsu funktio manuaalisesti — tarkista ei ilmoitusta (`push_enabled = false`).
6. Klikkaa saapunutta ilmoitusta — tarkista Valkku avautuu/fokusoituu Koonti-sivulle.
7. Testaa vanhentuneen tilauksen siivous: poista sovellus kotinäytöltä (mitätöi tilauksen selaimen puolella), kutsu funktio — tarkista `push_subscriptions`-rivi poistuu automaattisesti kun `web-push` palauttaa 404/410.
