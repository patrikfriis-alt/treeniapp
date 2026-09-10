# Treeniapp (Valkku) — Manuaalinen paastonseuranta (Aloita/Lopeta)

**Päivämäärä:** 2026-09-10
**Laajuus:** Nykyinen automaattinen paastoajan laskenta (johdettu ruokakirjausten välisistä aikaväleistä) korvataan kokonaan manuaalisella Aloita/Lopeta-toiminnolla. Muutos koskee Ruoka-sivua, Koonti-sivun viikkoyhteenvetoa ja sen paastojaottelumodaalia. Vaatii uuden tietokantataulun.
**Riippuvuudet:** Uusi `fasting_sessions`-taulu (uusi migraatio). Olemassa olevat `openMetricModal()`/`createModalOverlay()` (index.html:7394, 6909), `weekRow()`-apufunktio (index.html:2385), `localIso()`/`addDays()`. Ei muutoksia `food_log_entries`-tauluun tai muuhun ruokakirjauslogiikkaan — paasto irtoaa kokonaan ruokakirjausten aikaleimoista.

---

## Tausta

Nykyinen paastonseuranta (index.html:5279-5350, 2460-2466, 7934-7942) on täysin automaattinen: "paastoaika" lasketaan perättäisten `food_log_entries`-rivien `created_at`-aikaleimojen välisenä erotuksena. Tässä on tunnettu, dokumentoitu rajoitus (index.html:5295-5298): laskenta käyttää `created_at`:ia (kirjaushetki) eikä `logged_at`:ia (käyttäjän valitsema päivä), joten jälkikäteen täytetyt ruokakirjaukset vinouttavat tulosta.

Käyttäjä haluaa tämän tilalle **manuaalisen** toiminnon: eksplisiittinen Aloita/Lopeta-painike, joka ei ole millään tavalla sidottu ruokakirjauksiin. Vanha automaattinen laskenta poistetaan kokonaan (ei säilytetä varajärjestelmänä).

Vaatimukset käyttäjän kanssa käydystä keskustelusta:
1. Aloita/Lopeta-ohjaus näkyy **molemmissa**: Ruoka-sivulla täysi näkymä (tila + painike + viimeisimmät paastot), Koonti-sivulla kompakti pikakäyttö.
2. Mennyt paasto on **muokattavissa** jälkikäteen (alku-/loppuaika), jos painike unohtuu painaa oikeaan aikaan.
3. Keskiyön ylittävä paasto lasketaan sen päivän kohdalle, jona se **päättyi** — sama käytäntö kuin vanhassa järjestelmässä.
4. Kesken oleva (ei vielä lopetettu) paasto lasketaan viikkosummaan kuluneen ajan verran, päivän kohdalle "tänään".

## 1. Tietokanta

Uusi migraatio `supabase/migrations/20260910_fasting_sessions.sql`:

```sql
-- Manuaalinen paastonseuranta: korvaa ruokakirjausten aikaleimoista johdetun laskennan

create table fasting_sessions (
  id         uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);

create index fasting_sessions_started_at_idx on fasting_sessions (started_at);
create index fasting_sessions_ended_at_idx on fasting_sessions (ended_at);

-- Korkeintaan yksi aktiivinen (ended_at is null) paasto kerrallaan
create unique index fasting_sessions_single_active_idx on fasting_sessions ((1)) where ended_at is null;

alter table fasting_sessions enable row level security;

create policy fasting_sessions_select on fasting_sessions
  for select to anon, authenticated using (true);
create policy fasting_sessions_insert on fasting_sessions
  for insert to anon, authenticated with check (true);
create policy fasting_sessions_update on fasting_sessions
  for update to anon, authenticated using (true);
create policy fasting_sessions_delete on fasting_sessions
  for delete to anon, authenticated using (true);
```

`fasting_sessions_single_active_idx` estää tietokantatasolla kahden aktiivisen paaston olemassaolon samanaikaisesti (esim. jos Aloita-painiketta painetaan kahdesti eri välilehdiltä) — `startFast()` käsittelee tästä syntyvän insert-virheen käyttäjäystävällisesti (ks. 3.1).

## 2. Poistettava koodi

Kokonaan pois index.html:stä:
- `getLastRealFoodEntryAt()` (5279-5287) — ei enää tarvita, paasto ei riipu ruokakirjauksista.
- `_lastRealFoodAt`-muuttuja ja sen käyttö `renderFastingTimer()`:ssa.
- Rivit 5295-5298: kommentti `created_at` vs. `logged_at` -rajoituksesta — ei enää relevantti.
- `computeWeeklyFastingByDay()`:n nykyinen runko (5299-5323) — korvataan kokonaan uudella (ks. kohta 6), joka lukee `fasting_sessions`-taulua `food_log_entries`:n sijaan.

Säilyy sellaisenaan:
- `formatFastingDuration(ms)` (5289-5293) — muotoilufunktio, käytetään edelleen.
- `_fastingInterval`-muuttuja ja sen käyttömalli (setInterval/clearInterval joka minuutti) — sama periaate, uusi datalähde.

## 3. Uusi tila ja perusfunktiot

```js
let activeFastSession = null;   // { id, started_at } tai null
let recentFasts = [];           // viimeisimmät 5 päättynyttä paastoa, muokkausmodaalin datalähde

async function loadActiveFastSession() {
  const { data, error } = await sb.from('fasting_sessions')
    .select('id,started_at')
    .is('ended_at', null)
    .maybeSingle();
  if (error) { console.error('loadActiveFastSession failed:', error.message); return null; }
  return data;
}
```

### 3.1 Aloita/Lopeta

```js
async function startFast() {
  const { error } = await sb.from('fasting_sessions').insert({ started_at: new Date().toISOString() });
  if (error) {
    console.error('startFast failed:', error.message);
    // 23505 = unique_violation -> aktiivinen paasto on jo olemassa (esim. toinen välilehti ehti ensin)
    if (error.code === '23505') await loadFastingTimer();
    return;
  }
  await loadFastingTimer();
  refreshKoontiFastingRow();
}

async function stopFast() {
  if (!activeFastSession) return;
  const { error } = await sb.from('fasting_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', activeFastSession.id);
  if (error) { console.error('stopFast failed:', error.message); return; }
  await loadFastingTimer();
  await loadRecentFasts();
  refreshKoontiFastingRow();
}
```

`refreshKoontiFastingRow()` (ks. 5.2) päivittää Koonti-sivun paastorivin vain jos elementti on DOMissa (käyttäjä voi olla Ruoka-sivulla kun aloittaa/lopettaa).

## 4. Ruoka-sivu

### 4.1 HTML (korvaa nykyisen `.food-week-row`-rivin, index.html:1542-1544)

```html
<div class="meal-card" style="margin-bottom:14px">
  <div class="food-fasting-row">
    <div>
      <div class="food-fasting-label">Paasto</div>
      <div class="food-fasting-status" id="food-fasting-val">—</div>
    </div>
    <button class="btn btn-primary" id="food-fasting-btn" style="width:auto;padding:10px 18px;">Aloita paasto</button>
  </div>
  <div id="food-fasting-recent"></div>
</div>
```

Uusi CSS (samaan tyyliryhmään `.food-week-row`-sääntöjen kanssa):
```css
.food-fasting-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.food-fasting-label { font-size:var(--fs-sm); color:var(--text3); }
.food-fasting-status { font-size:var(--fs-lg); font-weight:700; color:var(--text); margin-top:2px; }
.fasting-recent-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--border); cursor:pointer; font-size:var(--fs-sm); color:var(--text2); }
.fasting-recent-chev { color:var(--text3); }
```

Olemassa oleva sääntö `input[type=date]::-webkit-calendar-picker-indicator { filter: invert(.5); }` (index.html:179) laajennetaan kattamaan myös uudet `datetime-local`-kentät (muokkausmodaali, kohta 4.4) — sama tumman teeman ikonin näkyvyyskorjaus:
```css
input[type=date]::-webkit-calendar-picker-indicator,
input[type=datetime-local]::-webkit-calendar-picker-indicator { filter: invert(.5); }
```

### 4.2 Live-tila ja painike

```js
async function loadFastingTimer() {
  activeFastSession = await loadActiveFastSession();
  renderFastingTimer();
  if (_fastingInterval) clearInterval(_fastingInterval);
  if (activeFastSession) _fastingInterval = setInterval(renderFastingTimer, 60000);
}

function renderFastingTimer() {
  const statusEl = document.getElementById('food-fasting-val');
  const btnEl = document.getElementById('food-fasting-btn');
  if (!statusEl || !btnEl) return;
  if (activeFastSession) {
    statusEl.textContent = formatFastingDuration(Date.now() - new Date(activeFastSession.started_at).getTime());
    btnEl.textContent = 'Lopeta paasto';
    btnEl.onclick = stopFast;
  } else {
    statusEl.textContent = 'Ei aktiivista paastoa';
    btnEl.textContent = 'Aloita paasto';
    btnEl.onclick = startFast;
  }
}
```

`renderRuoka()` (index.html:5351-5355) pysyy ennallaan — kutsuu jo `loadFastingTimer()`:ia lopuksi, ei muutosta itse funktioon.

### 4.3 Viimeisimmät paastot + muokkaus

```js
async function loadRecentFasts() {
  const { data, error } = await sb.from('fasting_sessions')
    .select('id,started_at,ended_at')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(5);
  if (error) { console.error('loadRecentFasts failed:', error.message); return; }
  recentFasts = data || [];
  renderRecentFasts();
}

function renderRecentFasts() {
  const el = document.getElementById('food-fasting-recent');
  if (!el) return;
  el.innerHTML = recentFasts.map(s => {
    const start = new Date(s.started_at), end = new Date(s.ended_at);
    const dateStr = end.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    return `<div class="fasting-recent-row" onclick="openEditFastModal('${s.id}')">
      <span>${dateStr} · ${formatFastingDuration(end - start)}</span>
      <span class="fasting-recent-chev">›</span>
    </div>`;
  }).join('');
}
```

`renderRuoka()` (index.html:5351-5355) kutsuu tällä hetkellä `loadFastingTimer()`:ia ilman `await`:ia (fire-and-forget, samaan tapaan kuin `loadFoodDay()`:n jälkeen). `loadRecentFasts()` lisätään samalla periaatteella, ei `Promise.all`:ia, jottei olemassa olevaa kutsutyyliä muuteta tarpeettomasti:
```js
async function renderRuoka() {
  document.getElementById('food-day-label').textContent = formatFoodDayLabel(foodDayOffset);
  await loadFoodDay();
  loadFastingTimer();
  loadRecentFasts();
}
```

### 4.4 Muokkausmodaali

```js
function toLocalDatetimeInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openEditFastModal(id) {
  const s = recentFasts.find(f => f.id === id);
  if (!s) return;
  const body = `
    <div class="form-row"><label>Alkoi</label><input type="datetime-local" id="edit-fast-start" value="${toLocalDatetimeInputValue(new Date(s.started_at))}"></div>
    <div class="form-row"><label>Päättyi</label><input type="datetime-local" id="edit-fast-end" value="${toLocalDatetimeInputValue(new Date(s.ended_at))}"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="saveFastEdit('${id}')">Tallenna</button>
    <button class="btn" style="width:100%;margin-top:8px;color:var(--red);" onclick="deleteFast('${id}')">Poista</button>
    <div class="status" id="edit-fast-status"></div>
  `;
  openMetricModal('Muokkaa paastoa', body);
}

async function saveFastEdit(id) {
  const startVal = document.getElementById('edit-fast-start').value;
  const endVal = document.getElementById('edit-fast-end').value;
  if (!startVal || !endVal) { showStatus('edit-fast-status', 'Täytä molemmat ajat', true); return; }
  if (new Date(endVal) <= new Date(startVal)) { showStatus('edit-fast-status', 'Lopun on oltava alun jälkeen', true); return; }
  const { error } = await sb.from('fasting_sessions')
    .update({ started_at: new Date(startVal).toISOString(), ended_at: new Date(endVal).toISOString() })
    .eq('id', id);
  if (error) { showStatus('edit-fast-status', 'Tallennus epäonnistui', true); return; }
  document.getElementById('metric-info-overlay').remove();
  await loadRecentFasts();
  refreshKoontiFastingRow();
}

async function deleteFast(id) {
  const { error } = await sb.from('fasting_sessions').delete().eq('id', id);
  if (error) { console.error('deleteFast failed:', error.message); return; }
  document.getElementById('metric-info-overlay').remove();
  await loadRecentFasts();
  refreshKoontiFastingRow();
}
```

`showStatus(elId, msg, isError)` on olemassa oleva apufunktio (käytetään useassa muussa lomakkeessa jo) — ei uutta koodia sille.

## 5. Koonti-sivu — viikkorivi ja pikaohjaus

Ei uutta korttia Mittarit-ruudukkoon (välttää parittoman korttimäärän layout-ongelman 2-sarakkeisessa ruudukossa). Sen sijaan laajennetaan olemassa olevaa viikkoyhteenveto-riviä "Paastoaika" (index.html:2460-2466), joka jo avaa jaottelumodaalin napautettaessa — lisätään sinne "(käynnissä)"-tila ja itse modaaliin Aloita/Lopeta-painike ylös.

### 5.1 Rivin arvo

Viikkorivit rakentaa `loadWeeklyReportCard(offset, bmrInfo)` (index.html:2372-2469, kutsutaan `loadWeeklyReportCard(0)`:na Koonti-sivun renderöityessä, index.html:6901). `activeFastSession` haetaan sen omaan `Promise.all`-kutsuun mukaan (index.html:2373-2376), jotta tila on ajan tasalla myös suoraan Koontiin tultaessa ilman että Ruoka-sivulla on käyty samalla istunnolla ensin:

```js
const [thisWeek, lastWeek, activeFast] = await Promise.all([
  getWeekStats(offset),
  getWeekStats(offset - 1),
  loadActiveFastSession(),
]);
activeFastSession = activeFast;
```

Rivin rakennus:
```js
const weeklyFastingMs = Object.values(fastingByDay).reduce((s, v) => s + v, 0);
const dayMinutes = [];
for (let i = 0; i < 7; i++) {
  dayMinutes.push(Math.round((fastingByDay[localIso(addDays(mon.date, i))] || 0) / 60000));
}
const fastingSuffix = activeFastSession ? ' (käynnissä)' : '';
rows.push(weekRow('timer', 'var(--accent)', 'Paastoaika', formatFastingDuration(weeklyFastingMs) + fastingSuffix, '',
  `openFastingBreakdownModal('${mon.iso}', [${dayMinutes.join(', ')}])`));
```

`refreshKoontiFastingRow()` kutsuu suoraan samaa, jo olemassa olevaa funktiota:
```js
function refreshKoontiFastingRow() {
  if (document.getElementById('page-koonti').classList.contains('active')) loadWeeklyReportCard(0);
}
```

### 5.2 Jaottelumodaali + pikaohjaus

```js
function openFastingBreakdownModal(mondayIso, minutes) {
  const controlHtml = activeFastSession
    ? `<div class="food-fasting-status" style="margin-bottom:4px;">${formatFastingDuration(Date.now() - new Date(activeFastSession.started_at).getTime())}</div>
       <button class="btn btn-primary" style="width:100%;margin-bottom:16px;" onclick="stopFast();document.getElementById('metric-info-overlay').remove();">Lopeta paasto</button>`
    : `<button class="btn btn-primary" style="width:100%;margin-bottom:16px;" onclick="startFast();document.getElementById('metric-info-overlay').remove();">Aloita paasto</button>`;

  const rowsHtml = minutes.map((min, i) => {
    const d = addDays(new Date(mondayIso), i);
    const label = `${DAYS[i]} ${d.getDate()}.${d.getMonth() + 1}.`;
    const h = Math.floor(min / 60), m = min % 60;
    return `<div class="metric-modal-row"><span>${label}</span><span class="val">${h}h ${m}min</span></div>`;
  }).join('');
  openMetricModal('Paastoaika', controlHtml + rowsHtml);
}
```

Modaali suljetaan heti painikkeen painalluksesta (ei jäädä odottamaan `startFast()`/`stopFast()`:n asynkronista vastausta ennen sulkemista) — sama UX-malli kuin muualla sovelluksessa (esim. suosikkiruoan tallennus ei jää modaaliin odottamaan). Koonti-sivun rivi päivittyy taustalla `refreshKoontiFastingRow()`:n kautta.

## 6. Viikkolaskenta — `computeWeeklyFastingByDay()` uudelleenkirjoitus

```js
async function computeWeeklyFastingByDay(mondayIso, sundayIso) {
  const lookbackFrom = localIso(addDays(new Date(mondayIso), -14));
  const { data, error } = await sb.from('fasting_sessions')
    .select('started_at,ended_at')
    .gte('started_at', lookbackFrom)
    .lte('started_at', sundayIso + 'T23:59:59');
  if (error) { console.error('computeWeeklyFastingByDay failed:', error.message); return {}; }
  const sessions = data || [];

  const byDay = {};
  for (let i = 0; i < 7; i++) {
    byDay[localIso(addDays(new Date(mondayIso), i))] = 0;
  }
  const now = new Date();
  sessions.forEach(s => {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : now; // kesken oleva paasto -> kulunut aika tähän hetkeen asti
    const endDayIso = localIso(end);
    if (byDay[endDayIso] !== undefined) byDay[endDayIso] += (end - start);
  });
  return byDay;
}
```

Sama päivälle-kohdistus kuin vanhassa: paasto lasketaan sen päivän kohdalle jona se päättyi (tai, kesken olevalle, "tänään"). 14 vrk taaksepäin -haku säilyy samasta syystä kuin ennen — jos viikon ensimmäinen paasto alkoi ennen maanantaita mutta päättyy viikon sisällä, se pitää löytää.

## 7. Testaus

Toteutuksen jälkeen selaimessa varmistettava (Claude in Chrome, puhelinleveys):
1. Ruoka-sivu: "Aloita paasto" → tila vaihtuu "Xh Ymin"-näytöksi, päivittyy minuutin välein, painike vaihtuu "Lopeta paasto"ksi.
2. "Lopeta paasto" → tila palaa "Ei aktiivista paastoa", uusi rivi ilmestyy "Viimeisimmät"-listaan.
3. Listan rivin napautus → muokkausmodaali oikeilla esitäytetyillä ajoilla; tallennus päivittää listan; poisto poistaa rivin.
4. Koonti: "Paastoaika"-rivi näyttää "(käynnissä)" kun paasto on aktiivinen; napautus avaa modaalin jossa Aloita/Lopeta-painike ylhäällä ja päiväjaottelu alla.
5. Kahden välilehden simulointi (tai suora insert Supabaseen) unique-indeksin toiminnan varmistamiseksi — toinen `startFast()`-kutsu ei kaadu näkyvästi.
6. Konsoli: ei virheitä koko kierroksen aikana.
