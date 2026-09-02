# Säleikkö: Taitojen (skills) rakennusjärjestelmä — suunnitteludokumentti

## Tausta

Tämä on toinen kolmesta suunnitellusta laajennuksesta Vaihe 1:n jälkeen (1. terminaalikanava — valmis, ks. `2026-09-02-saleikko-terminal-design.md`, 2. taitojen rakennusjärjestelmä — tämä spec, 3. päivittäisen työn agentti — myöhemmin). Inspiraationa toimivan Samantha/OpenClaw-arkkitehtuurin ydinperiaate (ks. `samantha_openclaw_tutkimus.md`) on "skills jaetaan, muisti pidetään erillään": yksi yhteinen taitoväylä, jonka päälle uusia kykyjä lisätään ilman että jokainen uusi kyky vaatii oman erillisen käyttöliittymän.

Tällä hetkellä Säleikön ainoa taito (paikallispolitiikka) on kytketty kiinteillä Telegram-slash-komennoilla suoraan `commands.ts`:ään, ja vapaa tekstikeskustelu (`gateway/chat.ts`) on pelkkä Claude-keskustelu ilman työkalukutsuja — se vain neuvoo käyttäjää kirjoittamaan slash-komentoja. Uusien avointen tehtävien (esim. puheiden tai esitysten laatiminen) lisääminen tällä mallilla vaatisi aina uuden slash-komennon jokaiselle kyvylle. Tämä spec rakentaa yleisen mekanismin, jolla vapaa teksti (sekä Telegram että terminaali, koska molemmat kulkevat saman `handleFreeTextMessage`-funktion kautta) voi kutsua taitoja suoraan luonnollisella kielellä Anthropic-työkalukutsujen (tool use) avulla, ja todistaa mekanismin toimivan rakentamalla sen päälle kaksi ensimmäistä uutta taitoa: puheiden ja esitysten laadinta.

## Laajuus

**Tähän specciin kuuluu:**
- Taitorekisteri (`src/skills/registry.ts`): yksinkertainen, käsin ylläpidetty lista taidoista, sama eksplisiittisen kytkennän tyyli kuin `commands.ts`:ssä jo on — ei tiedostojärjestelmän skannausta tai muuta dynaamista löytämistä.
- Työkalukutsusilmukka `gateway/chat.ts`:n `handleFreeTextMessage`-funktioon: rekisterin taidot välitetään Anthropic-työkaluina, ja Claude'n pyytämät työkalukutsut suoritetaan ja tulokset palautetaan, kunnes lopullinen tekstivastaus saadaan.
- Kaksi ohutta työkalukääreä olemassa olevalle paikallispolitiikka-taidolle (`search_archive`, `draft_kannanotto`), jotka käyttävät uudelleen täsmälleen samaa logiikkaa kuin `/hae`- ja `/kannanotto`-komennot — ei duplikointia.
- Kaksi uutta taitoa samalla, `positions.ts`:n kaltaisella rakenteella: puheiden laadinta (`speeches`) ja esitysten laadinta (`presentations`), kumpikin omalla Supabase-taulullaan tyylireferenssiä ja jäljitettävyyttä varten.
- Molemmat uudet taidot tallentavat luonnoksensa automaattisesti omaan tauluunsa heti valmistuttuaan (ks. "Tuotosten tallennus" alla).

**Ei kuulu tähän specciin (tietoisia rajauksia):**
- Olemassa olevien slash-komentojen (`/hae`, `/kannanotto`, `/opeta`, `/hyvaksy`, `/hylkaa`) migrointi rekisterin kautta kulkeviksi — ne toimivat, ovat testattuja ja tuotannossa; tämä spec jättää ne täysin koskemattomiksi. Ainoastaan `/kannanotto`:n sisäinen haku+luonnostelu-logiikka eriytetään jaettuun funktioon, jota molemmat (komento ja uusi työkalu) kutsuvat — itse komennon käyttöliittymä ja käytös ei muutu.
- ClawHub-tyylinen dynaaminen taitorekisteri (versiointi, vektorihaku, ajonaikainen lisäys ilman deployta) — ylimitoitettu yhden käyttäjän hobbyprojektiin. Uuden taidon lisääminen vaatii jatkossakin koodimuutoksen ja deployn, aivan kuten Vaihe 1:n paikallispolitiikka-taito rakennettiin.
- Erillinen, ei-sekoittuva muisti per taito (toisin kuin inspiraatiodokumentin Samantha/Stöbä-malli) — yhden käyttäjän kontekstissa jaettu `conversation_log` riittää, eikä trust-level-erottelulle (T1–T5) ole tarvetta. Jos joku taito myöhemmin tarvitsee todella erillisen muistin, se lisätään sille erikseen, ei yleisenä järjestelmäominaisuutena nyt (YAGNI).
- Kolmas sub-projekti ("päivittäisen työn agentti") — oma specinsä myöhemmin.
- Uudet taidot puheiden/esitysten sisällölle (esim. kalenteri- tai sähköpostidataan pohjautuva kontekstihaku) — rajattu puhtaaseen vapaan tekstin pohjalta laadintaan, ei ulkoisia tietolähteitä tässä vaiheessa.

## Arkkitehtuuri

### Taitorekisteri

Uusi tiedosto `src/skills/registry.ts` määrittelee tyypin ja listan:

```ts
export interface SkillContext {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  telegramUserId: number;
}

export interface Skill {
  name: string;              // Anthropic-työkalun nimi, esim. "draft_speech"
  description: string;       // Claude'lle näkyvä kuvaus, milloin työkalua käytetään
  input_schema: object;      // käsin kirjoitettu JSON Schema (ei uutta riippuvuutta zod-to-json-schema-tyyppiselle muunnokselle)
  handler: (args: unknown, ctx: SkillContext) => Promise<string>;
}

export const SKILLS: Skill[] = [searchArchiveSkill, draftKannanottoSkill, draftSpeechSkill, draftPresentationSkill];
```

`input_schema` on käsin kirjoitettu (skillejä on vähän, muunnoskirjasto olisi ylimitoitettu), mutta jokainen `handler` validoi saapuvat argumentit ajonaikaisesti `zod`illa (jo riippuvuutena) ennen käyttöä — tyyppiturva sekä käännösaikana (TS) että ajonaikana.

### Työkalukutsusilmukka

`gateway/chat.ts`:n `handleFreeTextMessage` saa `tools: SKILLS.map(toAnthropicTool)` mukaan `messages.create`-kutsuun. Uusi silmukka korvaa nykyisen yhden kutsun:

1. Kutsu Claude'a nykyisellä viestihistorialla + `tools`.
2. Jos `stop_reason !== "tool_use"`: käytä tekstivastausta kuten nyt, palauta.
3. Jos `stop_reason === "tool_use"`: suorita jokaiselle `tool_use`-lohkolle vastaava `SKILLS`-listan `handler` (rekisteristä nimen perusteella), kerää tulokset `tool_result`-sisältölohkoiksi, lisää sekä Claude'n työkalukutsuviesti että työkalutulosviesti `messages`-listaan, ja palaa kohtaan 1.
4. Turvaraja: enintään 5 kierrosta, jottei virheellinen työkalusilmukka jää pyörimään loputtomiin (Claude joka kutsuu työkalua toistuvasti). Rajan ylittyessä palautetaan käyttäjälle selkeä virheteksti sen sijaan että jäädään odottamaan.

Sama silmukka palvelee sekä Telegramia että terminaalia, koska molemmat kutsuvat samaa `handleFreeTextMessage`-funktiota (ks. terminaalispec).

### Paikallispolitiikan työkalukääreet

`commands.ts`:n `/kannanotto`-käsittelijän nykyinen kaksivaiheinen logiikka (`searchArchive` → löydä ensimmäinen osuma jolla on `body_text` → `draftPosition`) siirretään jaettuun funktioon `draftPositionForQuery(supabase, anthropic, query)` moduuliin `positions.ts`. `/kannanotto`-komento kutsuu jatkossa tätä funktiota (käytös identtinen, ei muutu käyttäjälle). Uusi `draft_kannanotto`-työkalu rekisterissä kutsuu samaa funktiota. `search_archive`-työkalu kutsuu suoraan olemassa olevaa `searchArchive`-funktiota. Tulosten muotoilu tekstiksi eriytetään pieneksi apufunktioksi (`formatSearchResults`) `commands.ts`:n `/hae`-käsittelijästä, jotta sekä komento että uusi työkalu käyttävät samaa muotoilulogiikkaa eikä sitä kirjoiteta kahdesti.

### Uudet taidot: puheet ja esitykset

`src/skills/speeches/draft.ts` ja `src/skills/presentations/draft.ts`, kumpikin `positions.ts`:n `draftPosition`-funktion rakenteen mukainen mutta oma kokonaisuutensa (erilliset taidot, kuten päätettiin — ei yhtä yhdistettyä "draft_document"-taitoa):

```ts
export async function draftSpeech(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  topic: string,
): Promise<string> {
  const past = await listRecentSpeeches(supabase); // 5 viimeisintä, tyylireferenssiksi
  // Claude-kutsu, oma taitokohtainen system-prompti, samaan tapaan kuin draftPosition
  // palauttaa luonnostekstin
}
```

Ensimmäisellä kutsulla `past` on tyhjä (kylmäkäynnistys) — sama, tietoisesti hyväksytty rajoitus kuin `draftPosition`:lla jo on. `presentations`-taito on rakenteeltaan identtinen, oma tiedostonsa ja taulunsa.

### Tuotosten tallennus

Toisin kuin `draftPosition` (joka lukee `positions`-taulua muttei koskaan kirjoita siihen — käyttäjä tallentaa kannanoton itse muualla slash-komentopolun jälkeen), uusien taitojen `handler`-funktiot **kirjoittavat** luonnoksen omaan tauluunsa heti generoinnin jälkeen. Tämä on ainoa tapa jolla tuotos jää talteen puhtaassa vapaan tekstin -polussa, koska siellä ei ole erillistä hyväksymis-/tallennusvaihetta kuten slash-komennoissa. Insert epäonnistuminen ei estä vastauksen palauttamista käyttäjälle (sama asymmetrinen virhekäsittelyperiaate kuin `handleFreeTextMessage`:n oma `conversation_log`-kirjoitus jo noudattaa) — luonnos näytetään joka tapauksessa, tallennusvirhe vain lokitetaan.

## Datamalli

Kaksi uutta taulua, `positions`-taulun kaltaisella rakenteella:

```sql
create table speeches (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  body_text text not null,
  created_at timestamptz not null default now()
);

create table presentations (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  body_text text not null,
  created_at timestamptz not null default now()
);
```

Lisätään `supabase/schema.sql`:ään samaan tapaan kuin muut taulut.

## Virheenkäsittely

Jos jonkin taidon `handler` heittää virheen (esim. Supabase- tai Anthropic-katko kesken taidon suorituksen), työkalukutsusilmukka nappaa virheen per työkalukutsu ja välittää Claude'lle `tool_result`-lohkon jossa `is_error: true` ja virheen sanoma sisältönä — Claude voi tämän jälkeen selittää epäonnistumisen käyttäjälle luonnollisella kielellä sen sijaan että koko keskustelukierros kaatuisi (sama periaate kuin `bot.catch()`:ssa jo Telegram-puolella). Koko `handleFreeTextMessage`-kutsu epäonnistuu edelleen kokonaan vain, jos itse Claude-API-kutsu epäonnistuu (verkko-/autentikointivirhe), ei jos yksittäinen työkalu epäonnistuu.

## Testaus

- Yksikkötestit uusille taidoille (`speeches`, `presentations`): luonnostelu onnistuu, tallennus tauluun onnistuu, kylmäkäynnistys tyhjällä historialla toimii — samaan tapaan kuin olemassa olevat `positions`-testit.
- Rekisteritason testi: jokaisen `SKILLS`-listan alkion `input_schema` on validi JSON Schema -muoto ja jokainen `name` on uniikki.
- `gateway/chat.ts`:n testeihin lisätään työkalukutsusilmukan täysi kierros mockatulla Anthropic-clientilla (ensin `tool_use`-vastaus, sitten lopullinen tekstivastaus) — sama mockaustyyli kuin nykyisissä `chat.test.ts`-testeissä jo on.
- `/kannanotto`-komennon olemassa olevat testit toimivat sellaisenaan sen jälkeen kun sisälogiikka on siirretty `draftPositionForQuery`-funktioon (behavior-preserving refaktorointi, ei uutta testikattavuustarvetta sille itselleen — mutta uusi `draftPositionForQuery`-funktio testataan suoraan kerran, koska sillä on nyt kaksi kutsujaa).

## Käyttöönotto

Vaatii uuden Supabase-skeemamuutoksen (`speeches`- ja `presentations`-taulut) toisin kuin terminaalilaajennus. Ei uusia ympäristömuuttujia. Käyttöönotto VPS:llä: aja skeemamuutos Supabaseen, sitten normaali `git pull && npm install && npm run build && sudo systemctl restart saleikko`.
