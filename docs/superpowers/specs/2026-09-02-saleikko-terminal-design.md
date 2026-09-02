# Säleikkö: Terminaalikanava — suunnitteludokumentti

## Tausta

Käyttäjä haluaa käyttää Säleikköä myös terminaalin kautta, Telegramin rinnalla. Tämä on ensimmäinen kolmesta suunnitellusta laajennuksesta Vaihe 1:n jälkeen (1. terminaalikanava, 2. taitojen (skills) rakennusjärjestelmä, 3. päivittäisen työn agentti) — tämä spec kattaa vain terminaalikanavan. Muut kaksi suunnitellaan omina speceinään myöhemmin.

## Laajuus

**Tähän specciin kuuluu:**
- Uusi CLI-komentorivikäyttöliittymä (interaktiivinen REPL), joka ajetaan Hetzner-VPS:llä SSH:n kautta.
- Vapaa tekstikeskustelu, käyttäen samaa `handleFreeTextMessage`-funktiota kuin Telegram.
- Jaettu keskusteluhistoria Telegramin kanssa: sama `conversation_log`-taulu, sama käyttäjätunniste (`telegramAllowedUserId`) riippumatta kanavasta, koska kyseessä on yhden käyttäjän työkalu.

**Ei kuulu tähän specciin (tietoisia rajauksia):**
- Slash-komennot terminaalissa (`/hae`, `/kannanotto` jne.) — vain vapaa teksti aluksi.
- Uudet taidot tai avoimet tehtävät (esitysten tai puheiden laatiminen) — kuuluvat seuraavaan sub-projektiin ("uudet taidot"), ei tähän.
- Paikallinen (Mac) käyttöliittymä — hylätty tietoisesti: VPS on jo "aina päällä" -arkkitehtuurin ydin, paikallinen ajo tarkoittaisi joko salaisuuksien kahdentamista koneelle tai erillisen autentikointimekanismin rakentamista, kumpikaan ei tuo lisäarvoa SSH:hon verrattuna.
- Erillinen kanavamerkintä `conversation_log`-riveille (esim. `channel`-sarake) — ei rakenneta nyt, koska jaettu, erottelematon historia on juuri se mitä pyydettiin (YAGNI). Voidaan lisätä myöhemmin jos ilmenee todellinen tarve erottaa kanavat.

## Arkkitehtuuri

- Uusi tiedosto `src/cli.ts`, joka käyttää Node.js:n sisäänrakennettua `readline`-moduulia interaktiiviseen REPL-silmukkaan (ei uusia riippuvuuksia).
- Jokainen käyttäjän syöttämä rivi välitetään suoraan `handleFreeTextMessage(supabase, anthropic, config.telegramAllowedUserId, text)`-funktiolle — täsmälleen sama funktio jota Telegramin vapaa tekstikäsittelijä (`src/telegram/commands.ts`) jo kutsuu `bot.on("message:text", ...)`-käsittelijässään.
- Koska sama funktio ja sama tunniste-arvo ovat käytössä, keskusteluhistoria on automaattisesti jaettu Telegramin kanssa ilman mitään skeemamuutoksia — `cli.ts` ei tarvitse omaa Supabase- tai Anthropic-alustuslogiikkaa erikseen, se käyttää samoja `loadConfig()`/`createSupabaseClient()`/`createAnthropicClient()`-funktioita kuin `src/index.ts`.
- `package.json`:iin uusi script `"chat": "tsx src/cli.ts"` kehitykseen; build-prosessi (`npm run build`) kääntää sen osaksi `dist/`-hakemistoa kuten muutkin tiedostot, joten tuotannossa ajetaan `node dist/cli.js`.

## Käyttö

1. SSH VPS:lle.
2. `cd /opt/saleikko && sudo -u saleikko node dist/cli.js`
3. REPL tulostaa lyhyen tervetulorivin, jää odottamaan syötettä. Käyttäjä kirjoittaa viestin, saa vastauksen, jatkaa keskustelua — kunnes kirjoittaa `exit` tai `quit`, tai painaa Ctrl+D/Ctrl+C.

## Pääsynhallinta

Ei uutta autentikointia rakenneta. SSH-avaimen hallussapito on ainoa pääsyrajoitus tähän REPL:iin, sama kuin kaikkeen muuhunkin VPS:llä. `cli.ts` ei validoi käyttäjää erikseen (toisin kuin Telegramin allowlist-middleware, joka on olemassa koska Telegram on julkinen kanava — SSH-yhteys itsessään on jo se rajaus).

## Virheenkäsittely

Jos `handleFreeTextMessage` heittää virheen (esim. Supabase- tai Anthropic-API-katko), REPL tulostaa selkeän virheilmoituksen `stderr`:iin ja jatkaa silmukkaa kaatumatta — sama periaate kuin Telegram-botin `bot.catch()`-käsittelijässä.

## Testaus

`src/cli.ts` on ohut I/O-liima olemassa olevan, jo kattavasti testatun `handleFreeTextMessage`-funktion päällä (4 testiä, ks. `src/gateway/chat.test.ts`). Lisätään kevyt yksikkötesti REPL-silmukan virheenkäsittelylle ja peruskululle (mockatulla `readline`-rajapinnalla tai suoralla funktiokutsulla), mutta täyttä interaktiivista terminaalikäyttöä ei voi automatisoida — lopullinen varmennus tehdään manuaalisesti SSH:n kautta oikeaa VPS:ää vasten, samaan tapaan kuin Vaihe 1:n Task 19:ssä.

## Käyttöönotto

Ei vaadi uutta Supabase-skeemamuutosta eikä uusia ympäristömuuttujia — `cli.ts` käyttää täysin samoja `.env`-arvoja jotka VPS:llä on jo käytössä. Käyttöönotto on pelkkä `git pull` + `npm run build` VPS:llä, sama prosessi jota on jo käytetty aiempien muutosten viemiseen.
