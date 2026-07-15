# Valmentajan pysyvät muistiinpanot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tekoälyvalmentaja kirjoittaa itse lyhyttä, pysyvää muistiinpanoa käyttäjästä jokaisen keskusteluvastauksen jälkeen, ja se syötetään takaisin tulevien vastausten kontekstiin — käyttäjä voi myös katsoa ja tyhjentää muistiinpanot.

**Architecture:** Uusi `coach_notes`-singleton-taulu. `coach-chat`-Edge Function tekee jokaisen viestin yhteydessä nykyisen vastauskutsun lisäksi toisen, kevyemmän Claude-kutsun joka päivittää muistiinpanot juuri käydyn vaihdon pohjalta. `context.ts` liittää nykyiset muistiinpanot jokaisen vastauksen datakontekstin alkuun.

**Tech Stack:** Supabase Edge Function (Deno, TypeScript, jatkaa olemassa olevaa `coach-chat`-functiota), Claude API, vanilla JS + Supabase JS -asiakas (`index.html`).

---

### Task 1: Tietokantamigraatio — `coach_notes`

**Files:**
- Create: `supabase/migrations/20260715_coach_notes.sql`

- [ ] **Step 1: Kirjoita migraatio**

```sql
create table coach_notes (
  id         bigint primary key default 1 check (id = 1),
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

alter table coach_notes enable row level security;

create policy coach_notes_select on coach_notes
  for select to anon, authenticated using (true);
create policy coach_notes_update on coach_notes
  for update to anon, authenticated using (true) with check (true);

insert into coach_notes (id, notes) values (1, '');
```

- [ ] **Step 2: Sovella migraatio**

```bash
supabase db query --linked -f supabase/migrations/20260715_coach_notes.sql
```

Vahvista:

```bash
supabase db query --linked -f /dev/stdin <<< "select id, notes from coach_notes;"
```

Odotettu tulos: yksi rivi, `id=1`, `notes=''`.

- [ ] **Step 3: Committaa**

```bash
git add supabase/migrations/20260715_coach_notes.sql
git commit -m "feat: coach_notes-taulu valmentajan pysyviä muistiinpanoja varten"
```

---

### Task 2: `context.ts` — hae ja liitä muistiinpanot

**Files:**
- Modify: `supabase/functions/coach-chat/context.ts`

**Konteksti ennen muutosta** (`grep -n "data: appSettings" supabase/functions/coach-chat/context.ts`):

```typescript
  const [
    { data: profile },
    { data: weightRows },
    { data: gymSetsAll },
    { data: activitiesAll },
    { data: sleepAll },
    { data: foodAll },
    { data: recentSets },
    { data: activeDaysAct },
    { data: activeDaysGym },
    { data: todaySessions },
    { data: appSettings },
  ] = await Promise.all([
    sb.from('user_profile').select('*').eq('id', 1).maybeSingle(),
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
    sb.from('workout_sets').select('workout_date').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
    sb.from('activity_data').select('activity_type,activity_date,duration_min,distance_km,calories').gte('activity_date', twelveWeeksAgoIso).lte('activity_date', todayIso),
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
    sb.from('food_log_entries').select('logged_at,kcal').gte('logged_at', twelveWeeksAgoIso).lte('logged_at', todayIso),
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', threeWeeksAgoIso).lte('workout_date', todayIso).order('workout_date', { ascending: true }),
    sb.from('activity_data').select('activity_date').gte('activity_date', ninetyDaysAgoIso).lte('activity_date', todayIso),
    sb.from('workout_sets').select('workout_date').gte('workout_date', ninetyDaysAgoIso).lte('workout_date', todayIso),
    sb.from('workout_sessions').select('calories').eq('workout_date', todayIso),
    sb.from('app_settings').select('calorie_correction').eq('id', 1).maybeSingle(),
  ]);

  const lines: string[] = [];

  lines.push(`Tämän päivän päivämäärä: ${todayIso}.`);
```

- [ ] **Step 1: Lisää `coach_notes`-kysely ja liitä tulos konteksin alkuun**

Korvaa yllä oleva lohko:

```typescript
  const [
    { data: profile },
    { data: weightRows },
    { data: gymSetsAll },
    { data: activitiesAll },
    { data: sleepAll },
    { data: foodAll },
    { data: recentSets },
    { data: activeDaysAct },
    { data: activeDaysGym },
    { data: todaySessions },
    { data: appSettings },
    { data: notesRow },
  ] = await Promise.all([
    sb.from('user_profile').select('*').eq('id', 1).maybeSingle(),
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
    sb.from('workout_sets').select('workout_date').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
    sb.from('activity_data').select('activity_type,activity_date,duration_min,distance_km,calories').gte('activity_date', twelveWeeksAgoIso).lte('activity_date', todayIso),
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
    sb.from('food_log_entries').select('logged_at,kcal').gte('logged_at', twelveWeeksAgoIso).lte('logged_at', todayIso),
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', threeWeeksAgoIso).lte('workout_date', todayIso).order('workout_date', { ascending: true }),
    sb.from('activity_data').select('activity_date').gte('activity_date', ninetyDaysAgoIso).lte('activity_date', todayIso),
    sb.from('workout_sets').select('workout_date').gte('workout_date', ninetyDaysAgoIso).lte('workout_date', todayIso),
    sb.from('workout_sessions').select('calories').eq('workout_date', todayIso),
    sb.from('app_settings').select('calorie_correction').eq('id', 1).maybeSingle(),
    sb.from('coach_notes').select('notes').eq('id', 1).maybeSingle(),
  ]);

  const lines: string[] = [];

  if (notesRow && (notesRow as any).notes) {
    lines.push(`Muistiinpanot käyttäjästä (aiemmista keskusteluista): ${(notesRow as any).notes}`);
  }

  lines.push(`Tämän päivän päivämäärä: ${todayIso}.`);
```

- [ ] **Step 2: Deployaa ja testaa**

```bash
supabase functions deploy coach-chat --project-ref dodrzzgbdlucjbkmxbjn
```

Aseta testimuistiinpano suoraan:

```bash
cat > /tmp/set_test_notes.sql <<'EOF'
update coach_notes set notes = 'Käyttäjä treenaa yleensä tiistaisin ja torstaisin.' where id = 1;
EOF
supabase db query --linked -f /tmp/set_test_notes.sql
```

Lisää testiviesti ja kutsu functiota (sama curl-kuvio kuin aiemmissa taskeissa), kysy jotain joka ei liity muistiinpanoihin (esim. "montako kertaa treenasin viime viikolla?") — tarkista Claude-kutsun saama `system`-prompti (voit tarkistaa tämän välillisesti: vastaus voi viitata treenipäiviin, mutta tärkeintä on ettei functio kaadu). Palauta testimuistiinpano tyhjäksi testin jälkeen:

```bash
cat > /tmp/clear_test_notes.sql <<'EOF'
update coach_notes set notes = '' where id = 1;
EOF
supabase db query --linked -f /tmp/clear_test_notes.sql
rm -f /tmp/set_test_notes.sql /tmp/clear_test_notes.sql
```

Siivoa myös testiviesti `coach_messages`-taulusta (service-role-yhteydellä, koska anon-avaimella ei ole delete-policya).

- [ ] **Step 3: Committaa**

```bash
git add supabase/functions/coach-chat/context.ts
git commit -m "feat: liitä valmentajan muistiinpanot datakontekstiin"
```

---

### Task 3: `index.ts` — toinen Claude-kutsu muistiinpanojen päivitykseen

**Files:**
- Modify: `supabase/functions/coach-chat/index.ts`

**Konteksti ennen muutosta** (`grep -n "const COACH_SYSTEM_PROMPT" supabase/functions/coach-chat/index.ts`):

```typescript
const COACH_SYSTEM_PROMPT = `Olet Valkku-sovelluksen henkilökohtainen valmentaja. Käyttäjä harjoittelee salilla ja kestävyysurheilua, seuraa unta, painoa ja ruokailua.

Säännöt:
- Anna ehdotuksia ja havaintoja, älä koskaan väitä tehneesi muutoksia dataan tai sovellukseen — et voi kirjoittaa mitään, vain lukea ja keskustella.
- Perusta vastauksesi annettuun dataan. Jos dataa ei ole tarpeeksi jonkin kysymyksen vastaamiseen, sano niin suoraan äläkä arvaa.
- Viittaa konkreettisiin lukuihin kun mahdollista.
- Ole ytimekäs — muutama virke riittää useimpiin vastauksiin, ellei käyttäjä pyydä pidempää analyysiä.
- Vastaa suomeksi.`;

async function callClaude(
```

- [ ] **Step 1: Lisää `NOTES_SYSTEM_PROMPT` ja `updateCoachNotes()`-funktio**

Korvaa yllä oleva lohko (lisätään uusi vakio ennen `callClaude`-funktiota):

```typescript
const COACH_SYSTEM_PROMPT = `Olet Valkku-sovelluksen henkilökohtainen valmentaja. Käyttäjä harjoittelee salilla ja kestävyysurheilua, seuraa unta, painoa ja ruokailua.

Säännöt:
- Anna ehdotuksia ja havaintoja, älä koskaan väitä tehneesi muutoksia dataan tai sovellukseen — et voi kirjoittaa mitään, vain lukea ja keskustella.
- Perusta vastauksesi annettuun dataan. Jos dataa ei ole tarpeeksi jonkin kysymyksen vastaamiseen, sano niin suoraan äläkä arvaa.
- Viittaa konkreettisiin lukuihin kun mahdollista.
- Ole ytimekäs — muutama virke riittää useimpiin vastauksiin, ellei käyttäjä pyydä pidempää analyysiä.
- Vastaa suomeksi.`;

const NOTES_SYSTEM_PROMPT = `Sinun tehtäväsi on ylläpitää lyhyttä muistiinpanoa käyttäjästä havaintojen perusteella. Tässä ovat nykyiset muistiinpanot ja äskeinen keskusteluvaihto. Päivitä muistiinpanot jos jotain uutta ja pysyvästi hyödyllistä ilmeni (esim. toistuvia tapoja, mieltymyksiä, poikkeamia) — älä toista dataa jonka valmentaja jo näkee joka viestillä (esim. tarkkoja lukuja), keskity havaintoihin jotka eivät muuten näkyisi. Jos mikään ei ole muuttunut, palauta muistiinpanot muuttumattomina. Pidä muistiinpanot lyhyinä (muutama virke). Vastaa PELKÄSTÄÄN päivitetyillä muistiinpanoilla, ei muuta tekstiä.`;

async function callClaude(
```

- [ ] **Step 2: Lisää `updateCoachNotes()`-funktio heti `callClaude()`-funktion jälkeen**

Konteksti ennen muutosta (`callClaude`-funktion loppu, `grep -n "^Deno.serve" supabase/functions/coach-chat/index.ts` löytää seuraavan lohkon alun):

```typescript
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

Deno.serve(async (req) => {
```

Korvaa:

```typescript
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
```

- [ ] **Step 3: Kutsu `updateCoachNotes()` vastauksen jälkeen, ennen palautusta**

Konteksti ennen muutosta (`grep -n "reply = await callClaude" supabase/functions/coach-chat/index.ts`):

```typescript
  let reply: string;
  try {
    reply = await callClaude(fullSystemPrompt, messages);
  } catch (err) {
    console.error('Claude call failed:', err instanceof Error ? err.message : String(err));
    return new Response('AI request failed', { status: 502, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ reply }), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
});
```

Korvaa:

```typescript
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
```

**Huomio:** `updateCoachNotes()` nielee omat virheensä (lokittaa ja palaa, ei heitä) — jos muistiinpanojen päivitys epäonnistuu, varsinainen vastaus palautuu silti käyttäjälle normaalisti. Tämä on tietoinen valinta: muistiinpanojen päivitys ei saa koskaan estää itse vastauksen saamista.

- [ ] **Step 4: Deployaa ja testaa oikealla datalla**

```bash
supabase functions deploy coach-chat --project-ref dodrzzgbdlucjbkmxbjn
```

Varmista muistiinpanot ovat tyhjät ennen testiä (`select notes from coach_notes;` pitäisi olla `''`). Lisää testiviesti joka sisältää jotain pysyvästi muistettavaa, esim. "Treenaan yleensä tiistaisin ja torstaisin, ja vihaan burpeeta." — kutsu functiota samalla curl-kuviolla kuin aiemmissa taskeissa. Odota vastaus, sitten tarkista `coach_notes`-rivi päivittyi:

```bash
supabase db query --linked -f /dev/stdin <<< "select notes from coach_notes;"
```

Odotettu: muistiinpanot sisältävät jotain treenipäivistä tai burpee-inhosta. Lähetä sama keskusteluun toinen, triviaali viesti (esim. "kiitos") — tarkista muistiinpanot pysyvät samana (malli päättää ettei mikään muuttunut). Palauta muistiinpanot tyhjäksi testin jälkeen, siivoa testiviestit `coach_messages`-taulusta.

- [ ] **Step 5: Committaa**

```bash
git add supabase/functions/coach-chat/index.ts
git commit -m "feat: lisää valmentajan muistiinpanojen automaattinen päivitys"
```

---

### Task 4: Käyttöliittymä — "Mitä valmentaja tietää sinusta" -modaali

**Files:**
- Modify: `index.html`

**Konteksti ennen muutosta** (`grep -n "Uusi keskustelu" index.html`):

```js
  el.innerHTML = `
    <button class="btn btn-primary" onclick="startNewCoachConversation()" style="margin-bottom:16px;">+ Uusi keskustelu</button>
    <div id="coach-conversation-list">${listHtml}</div>
  `;
}
```

- [ ] **Step 1: Lisää "Mitä valmentaja tietää sinusta" -painike**

Korvaa yllä oleva lohko:

```js
  el.innerHTML = `
    <button class="btn btn-primary" onclick="startNewCoachConversation()" style="margin-bottom:16px;">+ Uusi keskustelu</button>
    <button class="btn" onclick="openCoachNotesModal()" style="margin-bottom:16px;background:var(--surface2);color:var(--text2);">Mitä valmentaja tietää sinusta →</button>
    <div id="coach-conversation-list">${listHtml}</div>
  `;
}
```

- [ ] **Step 2: Lisää `openCoachNotesModal()` ja `clearCoachNotes()`**

Lisää nämä kaksi funktiota heti `renderCoachPage()`-funktion jälkeen (`grep -n "^async function renderCoachPage" index.html` löytää funktion, etsi sen päättävä `}`-rivi):

```js
async function openCoachNotesModal() {
  const { data, error } = await sb.from('coach_notes').select('notes').eq('id', 1).maybeSingle();
  if (error) {
    console.error('openCoachNotesModal failed:', error.message);
    openMetricModal('Mitä valmentaja tietää sinusta', '<div class="status err">Virhe ladattaessa muistiinpanoja</div>');
    return;
  }
  const notes = (data && data.notes) || '';
  const body = notes
    ? `<div style="white-space:pre-wrap;font-size:14px;color:var(--text2);line-height:1.5;">${escapeHtml(notes)}</div>
       <button class="btn" onclick="clearCoachNotes()" style="margin-top:16px;background:var(--surface2);color:var(--red);width:100%;">Tyhjennä muistiinpanot</button>`
    : `<div class="status">Ei vielä muistiinpanoja — keskustele valmentajan kanssa niin se alkaa oppia.</div>`;
  openMetricModal('Mitä valmentaja tietää sinusta', body);
}

async function clearCoachNotes() {
  if (!confirm('Tyhjennetäänkö valmentajan muistiinpanot?')) return;
  const { error } = await sb.from('coach_notes').update({ notes: '', updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) {
    console.error('clearCoachNotes failed:', error.message);
    return;
  }
  openCoachNotesModal();
}
```

- [ ] **Step 3: Testaa manuaalisesti**

Avaa Valmentaja-sivu, tarkista "Mitä valmentaja tietää sinusta →" -painike näkyy "+ Uusi keskustelu" -painikkeen alla. Klikkaa sitä ennen kuin mitään muistiinpanoja on olemassa — tarkista "Ei vielä muistiinpanoja..." -teksti näkyy. Aseta testimuistiinpano suoraan tietokantaan (`update coach_notes set notes = 'Testi' where id = 1;`), avaa modaali uudelleen — tarkista teksti näkyy oikein. Klikkaa "Tyhjennä muistiinpanot", hyväksy vahvistus — tarkista muistiinpanot tyhjenevät ja modaali päivittyy näyttämään tyhjän tilan. Testaa myös "Peruuta" vahvistusdialogissa — tarkista muistiinpanot EIVÄT tyhjenny.

- [ ] **Step 4: Committaa**

```bash
git add index.html
git commit -m "feat: lisää Mitä valmentaja tietää sinusta -modaali"
```

---

### Task 5: Manuaalinen QA ja versionumeron päivitys

**Files:**
- Modify: `index.html` (version-chip)

- [ ] **Step 1: Koko ominaisuuden läpikäynti**

Käy läpi oikeassa selaimessa/curlilla:

1. Kerro valmentajalle jotain pysyvää keskustelussa — tarkista muistiinpanot päivittyvät (tarkista `coach_notes`-taulusta tai "Mitä valmentaja tietää sinusta" -modaalista).
2. Lähetä triviaali jatkokysymys — tarkista muistiinpanot pysyvät ennallaan jos mikään ei muuttunut.
3. Aloita uusi keskustelu, kysy jotain joka hyötyisi aiemmasta havainnosta — tarkista vastaus viittaa siihen (esim. Claude-kutsun systeemipromptin sisältö, tai epäsuorasti vastauksen sisällöstä).
4. "Mitä valmentaja tietää sinusta" -modaali toimii sekä tyhjässä että täytetyssä tilassa.
5. "Tyhjennä muistiinpanot" toimii ja vahvistuskysely estää vahingossa tyhjentämisen.
6. Konsoli ei näytä virheitä normaalikäytössä.

- [ ] **Step 2: Päivitä versionumero**

Etsi `grep -n "version-chip" index.html`, vaihda kortin teksti nykyisestä `v1.20.0` arvoon `v1.21.0`.

- [ ] **Step 3: Committaa**

```bash
git add index.html
git commit -m "v1.21.0: Valmentajan pysyvät muistiinpanot"
```

---

## Self-Review Notes

- **Kattavuus:** Kaikki design-specin osat (päivitysmekanismi, tietokanta, päivitysprompti, kontekstin käyttö, käyttöliittymä) on katettu Task 1–4:ssä, Task 5 kokoaa QA:n ja versionumeron.
- **Riippuvuudet:** Tehtävät ovat peräkkäisiä (Task 3 rakentuu Task 2:n päälle, Task 4 vaatii Task 1:n taulun olemassaolon) — suositeltu järjestys 1→5.
- **Virheiden käsittely:** `updateCoachNotes()` on tietoisesti "parhaan yrityksen" -toiminto joka ei koskaan estä varsinaisen vastauksen palautumista, dokumentoitu eksplisiittisesti Task 3:n huomiossa.
- **Ei placeholdereita:** kaikki koodilohkot täydellisiä, ei TBD/TODO-merkintöjä.
- **Versionumero:** edellisen sub-projektin (Tekoälyvalmentaja v1) päätteeksi versio oli v1.20.0, joten tämä nostaa sen v1.21.0:aan.
