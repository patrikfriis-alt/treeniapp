# Push-ilmoitukset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 is NOT subagent-dispatchable** — it requires live human access to the Supabase dashboard/CLI and a third-party cron service account. It must be performed by the coordinator together with the user directly, not delegated to an implementer subagent.

**Goal:** Kaksi päivittäistä Web Push -ilmoitusta (streak-varoitus klo 17:30, yleismuistutus klo 19:30) jotka toimivat vaikka Valkku on kokonaan kiinni.

**Architecture:** Uusi `push_subscriptions`-taulu + `app_settings.push_enabled`-lippu, sivupalkin kytkin joka tilaa selaimen Push-rajapinnan kautta, `sw.js`:n uudet `push`/`notificationclick`-käsittelijät, ja uusi Supabase Edge Function joka VAPID-allekirjoittaa ja lähettää ilmoitukset — laukaistaan ulkoisella ilmaisella ajastuspalvelulla (cron-job.org) koska Supabase-projekti on Free-tasolla.

**Tech Stack:** Vanilla JS (asiakas), Deno (Edge Function), `npm:web-push`, PostgreSQL/Supabase, cron-job.org.

---

### Task 1: Migraatio

**Files:**
- Create: `supabase/migrations/2026-07-10_push_ilmoitukset.sql`

- [ ] **Step 1: Kirjoita migraatiotiedosto**

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

- [ ] **Step 2: Committaa**

```bash
git add supabase/migrations/2026-07-10_push_ilmoitukset.sql
git commit -m "feat: migraatio push-ilmoituksille (push_subscriptions, app_settings.push_enabled)"
```

**Huom implementoijalle:** ÄLÄ yritä ajaa tätä migraatiota tietokantaan (ei CLI-linkitystä/palvelinavaimia käytettävissä). Pelkkä tiedoston kirjoittaminen ja committaaminen riittää tähän tehtävään — käyttäjä ajaa SQL:n Supabasen SQL-editorissa manuaalisesti Task 6:ssa.

---

### Task 2: Bell-ikoni ICONS-objektiin

**Files:**
- Modify: `index.html` (ICONS-objekti)

**Konteksti ennen muutosta:**

```js
  upload:    '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
};
```

- [ ] **Step 1: Lisää bell-avain**

Korvaa yllä oleva lohko:

```js
  upload:    '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
  bell:      '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
};
```

- [ ] **Step 2: Testaa manuaalisesti**

Käynnistä paikallinen palvelin (`python3 -m http.server 8080`), avaa selaimen konsoli ja aja `svgIcon('bell', 'currentColor', 20)` — tarkista palautuu validi SVG-merkkijono ilman virhettä (`ICONS['bell']` löytyy).

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "feat: lisää bell-ikoni ICONS-objektiin"
```

---

### Task 3: Service Worker — push ja notificationclick

**Files:**
- Modify: `sw.js`

**Konteksti ennen muutosta** — koko nykyinen `sw.js`:

```js
const CACHE = 'treeniapp-v1';
const PRECACHE = [
  '/',
  '/index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Ei cacheta Supabase-kutsuja tai CDN-resursseja — vain app shell
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
```

- [ ] **Step 1: Lisää push- ja notificationclick-käsittelijät tiedoston loppuun**

Lisää edellä kuvatun sisällön PERÄÄN (tiedoston loppuun), älä muuta mitään olemassa olevaa:

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

- [ ] **Step 2: Testaa manuaalisesti**

Käynnistä paikallinen palvelin, lataa sivu (rekisteröi service workerin). Avaa DevTools → Application → Service Workers, tarkista service worker on aktiivinen. Aja DevToolsin konsolissa:

```js
navigator.serviceWorker.ready.then(reg => reg.showNotification('Testi', { body: 'Toimiiko?' }));
```

Tarkista selaimen ilmoitus näkyy näytöllä. Klikkaa ilmoitusta, tarkista sovellus fokusoituu (tai avautuu jos suljettu).

- [ ] **Step 3: Committaa**

```bash
git add sw.js
git commit -m "feat: service workerin push- ja notificationclick-käsittelijät"
```

---

### Task 4: Supabase Edge Function

**Files:**
- Create: `supabase/functions/check-and-notify/index.ts`

- [ ] **Step 1: Kirjoita Edge Function -tiedosto**

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
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
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

- [ ] **Step 2: Committaa**

```bash
git add supabase/functions/check-and-notify/index.ts
git commit -m "feat: check-and-notify Edge Function (streak/activity push)"
```

**Huom implementoijalle:** ÄLÄ yritä ajaa `supabase functions deploy` tai muita CLI-komentoja jotka vaativat linkitetyn/autentikoidun Supabase-projektin. Pelkkä tiedoston kirjoittaminen riittää — tätä ei voi testata paikallisesti ilman Supabasen palvelinavaimia ja VAPID-secretejä, jotka käyttäjä asettaa itse Task 6:ssa. Tarkista ainoastaan että TypeScript-syntaksi on validia (esim. `deno check supabase/functions/check-and-notify/index.ts` jos Deno on asennettu — jos ei ole, pelkkä huolellinen koodin läpiluku riittää).

---

### Task 5: Asiakaspuolen ilmoitus-kytkin

**Files:**
- Modify: `index.html` (sivupalkki, uusi JS-lohko, `loadKoonti()`)

**Konteksti ennen muutosta** — sivupalkki:

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Vie data</div>
```

- [ ] **Step 1: Lisää Ilmoitukset-kytkin sivupalkkiin**

Korvaa yllä oleva lohko:

```html
  <button onclick="openCalorieSettingsModal()" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span data-icon="watch" style="display:inline-flex"></span> Kalorikerroin
  </button>
  <button onclick="toggleNotifications()" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:11px 0;background:none;border:none;color:var(--text);font-size:14px;cursor:pointer;">
    <span style="display:flex;align-items:center;gap:10px;"><span data-icon="bell" style="display:inline-flex"></span> Ilmoitukset</span>
    <span id="notif-toggle-state" style="color:var(--text2);font-size:13px;"></span>
  </button>
  <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:20px;margin-bottom:12px;">Vie data</div>
```

**Konteksti ennen muutosta** — `saveOnboardingCompleted()`-funktion loppu:

```js
async function saveOnboardingCompleted() {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, onboarding_completed: true, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveOnboardingCompleted failed:', error.message); throw error; }
}

async function renderOnboardingCard() {
```

- [ ] **Step 2: Lisää push-ilmoitusten JS-lohko `saveOnboardingCompleted()`:n jälkeen**

Korvaa yllä oleva lohko (huomaa `saveOnboardingCompleted()` säilyy muuttumattomana, uusi lohko lisätään sen ja `renderOnboardingCard()`:n väliin):

```js
async function saveOnboardingCompleted() {
  const { error } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, onboarding_completed: true, updated_at: new Date().toISOString() },
  });
  if (error) { console.error('saveOnboardingCompleted failed:', error.message); throw error; }
}

/* ═══════════════════════════════════════════════════════════════
   PUSH-ILMOITUKSET
═══════════════════════════════════════════════════════════════ */
const VAPID_PUBLIC_KEY = 'REPLACE_WITH_VAPID_PUBLIC_KEY';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function renderNotifToggleState(enabled) {
  const el = document.getElementById('notif-toggle-state');
  if (el) el.textContent = enabled ? 'Päällä' : 'Pois';
}

async function initNotifToggle() {
  const settings = await loadAppSettings();
  renderNotifToggleState(!!(settings && settings.push_enabled));
}

async function toggleNotifications() {
  const settings = await loadAppSettings();
  const currentlyEnabled = !!(settings && settings.push_enabled);

  if (currentlyEnabled) {
    const { error } = await sbWrite({
      table: 'app_settings',
      op: 'upsert',
      payload: { id: 1, push_enabled: false, updated_at: new Date().toISOString() },
    });
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
  const { error: subError } = await sbWrite({
    table: 'push_subscriptions',
    op: 'upsert',
    payload: { endpoint: subJson.endpoint, p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
    opts: { onConflict: 'endpoint' },
  });
  if (subError) { console.error('push subscribe failed:', subError.message); return; }

  const { error: settingsError } = await sbWrite({
    table: 'app_settings',
    op: 'upsert',
    payload: { id: 1, push_enabled: true, updated_at: new Date().toISOString() },
  });
  if (settingsError) { console.error('push_enabled save failed:', settingsError.message); return; }
  renderNotifToggleState(true);
}

async function renderOnboardingCard() {
```

- [ ] **Step 3: Kutsu initNotifToggle() sivun latautuessa**

Konteksti ennen muutosta — `loadKoonti()`:n alku:

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  loadWeeklyReportCard();
```

Korvaa (lisää `initNotifToggle();` `renderOnboardingCard();`-rivin jälkeen):

```js
async function loadKoonti() {
  document.getElementById('koonti-date').textContent =
    new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });

  loadWeekSummary();
  loadMotivationSummary();
  renderOnboardingCard();
  initNotifToggle();
  loadWeeklyReportCard();
```

- [ ] **Step 4: Testaa manuaalisesti (VAPID-avainta lukuun ottamatta)**

Käynnistä paikallinen palvelin, lataa sivu. Avaa Valikko-sivupalkki, tarkista "Ilmoitukset"-rivi näkyy bell-ikonilla ja tilateksti ("Päällä" tai "Pois", riippuen `app_settings.push_enabled`-arvosta — oletus `true` migraation jälkeen, mutta migraatiota ei ole vielä ajettu tässä vaiheessa joten `loadAppSettings()` saattaa palauttaa `null` tai puuttua `push_enabled`-kenttä; tarkista tässä tapauksessa ettei koodi kaadu — `renderNotifToggleState(!!(settings && settings.push_enabled))` käsittelee tämän turvallisesti `false`-arvoksi). Klikkaa kytkintä — koska `VAPID_PUBLIC_KEY` on vielä placeholder-arvo, itse `pushManager.subscribe()`-kutsu epäonnistuu virheeseen (odotettua, korjaantuu Task 6:ssa kun oikea avain asetetaan) — tarkista ettei sovellus kaadu kokonaan, virhe näkyy vain konsolissa.

- [ ] **Step 5: Committaa**

```bash
git add index.html
git commit -m "feat: Ilmoitukset-kytkin sivupalkkiin, push-tilaus"
```

---

### Task 6: Manuaalinen käyttöönotto ja QA (koordinaattori + käyttäjä, EI alitehtäväagentille)

**Ei tiedostomuutoksia tässä vaiheessa paitsi Step 2:n VAPID-avaimen täyttö ja Step 8:n versionumero.**

Tämä tehtävä vaatii käyttäjän live-osallistumista (Supabase-dashboard/CLI-kirjautuminen, cron-job.org-tili) — koordinaattori (ei implementoija-alitehtäväagentti) käy tämän läpi yhdessä käyttäjän kanssa suoraan keskustelussa.

- [ ] **Step 1: Aja migraatio**

Käyttäjä liittää Task 1:n SQL:n Supabasen SQL-editoriin ja ajaa sen. Koordinaattori vahvistaa onnistumisen `curl`illa PostgREST-rajapintaa vasten (`push_subscriptions`-taulu vastaa tyhjällä listalla, `app_settings`-rivillä on `push_enabled: true`).

- [ ] **Step 2: Generoi VAPID-avainpari**

Käyttäjä ajaa `npx web-push generate-vapid-keys` (tai koordinaattori ajaa sen puolesta jos Node on käytettävissä). Julkinen avain menee `index.html`:n `VAPID_PUBLIC_KEY`-vakioon (korvaa `'REPLACE_WITH_VAPID_PUBLIC_KEY'`), committaa erikseen: `git commit -am "feat: aseta oikea VAPID-julkinen avain"`. Yksityinen avain + itse valittu mailto-osoite jäävät talteen seuraavaa askelta varten.

- [ ] **Step 3: Linkitä Supabase-projekti ja aseta secretit**

```bash
supabase init
supabase link --project-ref <project-ref>
supabase secrets set VAPID_PUBLIC_KEY=<julkinen-avain> VAPID_PRIVATE_KEY=<yksityinen-avain> VAPID_SUBJECT=mailto:<sähköposti> CRON_SECRET=<satunnainen-32-merkkinen-salasana>
```

- [ ] **Step 4: Deployaa Edge Function**

```bash
supabase functions deploy check-and-notify
```

Vahvista deploy onnistui (`supabase functions list` näyttää `check-and-notify`-funktion).

- [ ] **Step 5: Testaa Edge Function manuaalisesti**

```bash
curl -X GET "https://<project-ref>.supabase.co/functions/v1/check-and-notify?type=activity" \
  -H "x-cron-secret: <CRON_SECRET>"
```

Tarkista vastaus (`"sent"`, `"already active today"`, tms.) vastaa odotettua tilannetta. Jos "sent" ja kytkin on päällä puhelimessa, tarkista ilmoitus saapuu oikeasti — vaatii että Step 6 (kytkimen käyttöönotto puhelimella) on tehty ensin, joten järjestä uudelleen tarpeen mukaan.

- [ ] **Step 6: Ota kytkin käyttöön puhelimella**

Käyttäjä avaa Valkun kotinäytön kuvakkeesta (EI Safari-välilehdestä), avaa Valikko, klikkaa "Ilmoitukset", hyväksyy selaimen lupa-kyselyn. Koordinaattori vahvistaa `push_subscriptions`-tauluun ilmestyi rivi.

- [ ] **Step 7: Konfiguroi cron-job.org**

Käyttäjä luo ilmaisen tilin osoitteessa cron-job.org, lisää kaksi ajastettua tehtävää:
- 17:30 Europe/Helsinki, `GET https://<project-ref>.supabase.co/functions/v1/check-and-notify?type=streak`, otsake `x-cron-secret: <CRON_SECRET>`
- 19:30 Europe/Helsinki, `GET https://<project-ref>.supabase.co/functions/v1/check-and-notify?type=activity`, otsake `x-cron-secret: <CRON_SECRET>`

- [ ] **Step 8: Koko speksin testauslistan läpikäynti**

Käy läpi speksin (`docs/superpowers/specs/2026-07-10-push-ilmoitukset-design.md`) Testaus-osion kaikki 7 kohtaa:
1. Kytkimen käyttöönotto tallentaa tilauksen ja `push_enabled=true` — jo tehty Step 6:ssa.
2. `type=activity`-kutsu päivänä jolloin ei ole liikuttu lähettää ilmoituksen suljettuun sovellukseen.
3. Merkitse päivä aktiiviseksi, kutsu uudelleen — EI ilmoitusta.
4. `type=streak`: testaa sekä streak-elossa- että streak-nolla-tilanne.
5. Kytke pois päältä, kutsu — EI ilmoitusta.
6. Klikkaa ilmoitusta — Valkku avautuu/fokusoituu Koontiin.
7. Poista sovellus kotinäytöltä, kutsu funktio — vanhentunut `push_subscriptions`-rivi poistuu automaattisesti (404/410-käsittely).

- [ ] **Step 9: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.15.0` arvoon `v1.16.0`.

- [ ] **Step 10: Committaa**

```bash
git add index.html
git commit -m "v1.16.0: Push-ilmoitukset"
```

---

## Self-Review Notes

- **Spec-kattavuus:** Speksin kaikki osat (migraatio, VAPID, asiakas, service worker, Edge Function, cron-ajastus, testaus) on katettu Task 1–6:ssa.
- **Tyyppijohdonmukaisuus:** `sbWrite`-kutsut Task 5:ssä käyttävät samaa `{table, op, payload, opts}`-muotoa kuin koko offline-kestävyys-branchi; `push_subscriptions`-taulun sarakkeet (`endpoint`, `p256dh`, `auth`) ovat identtiset migraatiossa (Task 1), asiakaskoodissa (Task 5) ja Edge Functionissa (Task 4).
- **Ei placeholdereita paitsi yksi tarkoituksellinen:** `VAPID_PUBLIC_KEY = 'REPLACE_WITH_VAPID_PUBLIC_KEY'` on tietoinen poikkeus — oikeaa arvoa ei voi tietää ennen kuin avainpari generoidaan Task 6:ssa; korvataan silloin eksplisiittisenä committina (Task 6 Step 2), ei jää roikkumaan.
- **Task 6:n erityisluonne:** merkitty selvästi ei-alitehtäväagentille-dispatchattavaksi sekä plan-headerissa että task-otsikossa, koska se vaatii live Supabase-CLI-kirjautumisen ja cron-job.org-tilin — subagentilla ei ole näihin pääsyä eikä sen pidä yrittää.
