# Säleikkö — henkilökohtainen AI-avustaja (Vaihe 1: ydin + paikallispolitiikka)

**Päivämäärä:** 2026-08-24
**Tila:** Hyväksytty suunnittelukeskustelussa, odottaa spec-katselmointia

## Tausta ja inspiraatio

Säleikkö on käyttäjän oma henkilökohtainen AI-avustaja, suunniteltu Sami Miettisen (Neuvottelija-podcast) julkisesti dokumentoiman Samantha/OpenClaw-agentin arkkitehtuurifilosofian pohjalta (ks. `samantha_openclaw_tutkimus.md` samassa repossa). Keskeiset lainatut periaatteet:

- Erilliset "taidot" (skills) jaetun gatewayn päällä, kukin taito omalla, ei-sekoittuvalla muistillaan.
- Jokainen tuotos jää jäljitettäväksi artefaktiksi — ei pelkkää chat-scrollbackia.
- Proaktiivisuus rakennetaan ajastettuina "taitoina", ei jatkuvana kaiken-kattavana valvontana.
- Rajaukset (mitä ei tarvitse käsitellä) rakennetaan järjestelmän rakenteeseen, ei toivelistaksi promptiin ("constraint decay" -oppi).
- Ei omaa fyysistä rautaa kotona — vuokrattu VPS ottaa saman "aina päällä" -roolin kuin Samin oma Mac mini/ThinkPad.

Käyttäjä on kunnan valtuutettu, ja paikallispolitiikan puolelta tulee paljon dataa (esityslistat, pöytäkirjat). Tämä on ensimmäinen ja tärkein taito, joka rakennetaan ytimen päälle.

## Laajuus

**Tähän specciin kuuluu (Vaihe 1):**
- Ydinarkkitehtuuri: Hetzner VPS -gateway + Supabase-muisti.
- Telegram-tekstikanava, käyttäjä-allowlistattu.
- Proaktiivisuusmoottori: päivittäinen briiffi + kiireelliset välittömät ilmoitukset.
- Paikallispolitiikka-taito kokonaisuudessaan: dokumenttien haku, kiinnostuspohjainen suodatus, tiivistys, briiffaus, kannanottoavustus, vapaa haku arkistosta.

**Ei kuulu tähän specciin (myöhemmät vaiheet, mainittu suunnan vuoksi):**
- Vaihe 2: Työasiat-taito (Microsoft 365: kalenteri, sähköposti, tehtävät, palaverimuistiinpanot).
- Vaihe 3: Puheviestit Telegramissa (STT/TTS).
- Vaihe 4: Puhelinsoitot (Twilio-pohjainen).

Kukin myöhempi vaihe suunnitellaan omana specinään, kun Vaihe 1 on toteutettu ja käytössä.

## Arkkitehtuuri

### Kokonaiskuva

```
Telegram (yksityinen botti, allowlist: 1 käyttäjä)
        │  webhook
        ▼
Hetzner VPS — "Säleikön runko"
  - Pitkään elävä prosessi (Node.js tai Python), systemd-palveluna
  - Gateway: reitittää saapuvan viestin oikealle taidolle
  - Sisäinen ajastin (node-cron / APScheduler): päivittäinen briiffi + ingest-ajot
  - Kutsuu Claude API:a (Anthropic, käyttöperusteinen laskutus)
        │  Supabase client / Postgres-yhteys
        ▼
Supabase — "Säleikön muisti"
  - Postgres: raw_documents, document_summaries, conversation_log,
    positions, reminders, gatekeeper_profile, gatekeeper_feedback
  - Storage: alkuperäiset PDF/asiakirjat kunnan järjestelmästä
```

**Miksi Hetzner-VPS eikä pelkkä Supabase Edge Functions:** Telegram-botin webhook-yhteys ja sisäinen ajastin hyötyvät pitkäikäisestä, aina käynnissä olevasta prosessista (ei kylmäkäynnistyksiä, voi pitää tilaa muistissa istunnon ajan). Tämä on suoraan sama malli jota Sami käytti Hermeksen kanssa ThinkPadilla: yksi user-level systemd-palvelu, joka selviää uudelleenkäynnistyksistä (`linger`-tyyppinen pysyvyys).

**Miksi Supabase muistikerroksena:** Sama, jo tuttu malli kuin treeniapp-projektissa (Postgres + Storage + service-role-avaimet ympäristömuuttujina). pg_cronia ei käytetä Vaihe 1:ssä — kaikki ajastus tapahtuu Hetzner-prosessin sisällä, Supabase toimii puhtaasti datana.

### Malli ja kustannukset

- **Claude Sonnet 5** (`claude-sonnet-5`) pääasialliseen järkeilyyn: dokumenttitiivistykset, kannanottoluonnokset, päivittäisen briiffin koostaminen.
- **Claude Haiku 4.5** (`claude-haiku-4-5`) halpaan/tiheään kiinnostusluokitteluun (osuuko uusi pykälä johonkin seurattuun aiheeseen).
- Molemmat Anthropicin API:sta käyttöperusteisesti laskutettuna — ei kuukausitilausta, ei riskiä tilin porttikiellosta väärinkäytön takia.
- Karkea kustannusarvio Vaihe 1:n käytölle: n. 5–10 €/kk (dokumenttitiivistykset + luokittelu + päivittäinen briiffi), riippuen kokousten/pykälien määrästä kuukaudessa.

## Tietomalli

Kaikki taulut Supabase Postgresissa, `saleikko`-skeemassa (erillään mahdollisista muista projekteista samassa Supabase-organisaatiossa, jos sellainen joskus jaetaan).

| Taulu | Tarkoitus |
|---|---|
| `raw_documents` | Yksi rivi per RSS:stä nähty pykälä, riippumatta portinvartijan päätöksestä. Sisältää aina otsikon, toimielimen, kokouspäivän, lähde-URL:n ja portinvartijan päätöksen (`match`/`no_match`/`uncertain`) + lyhyen perustelun. `body_text` ja `pdf_url` täytetään vasta jos päätös oli match/uncertain — hylätyille pykälille ei koskaan haeta täyttä sisältöä. Rivi on aina totuuslähde eikä sitä muokata jälkikäteen. |
| `document_summaries` | Claude-generoitu tiivistelmä per **match/uncertain**-pykälä, 1:1-viittaus `raw_documents`-riviin. Luodaan vasta täyden sisällön haun jälkeen. |
| `gatekeeper_profile` | Yksi rivi, vapaamuotoinen tekstidokumentti joka kuvaa mikä käyttäjää kiinnostaa ja miksi (ei pelkkä avainsanalista). Tätä käytetään Haiku-portinvartijan system-promptina jokaisella luokittelukerralla. Päivittyy `/opeta`-komennolla käyttäjän hyväksynnän kautta. |
| `gatekeeper_feedback` | Loki `/opeta`-komennoilla annetusta vapaamuotoisesta palautteesta ja siitä generoidusta profiiliehdotuksesta, sekä onko ehdotus hyväksytty (`applied`). Uusin hyväksymätön rivi on aina "odottava ehdotus". |
| `positions` | Käyttäjän aiemmat kannanotot/puheenvuorot — tyyli- ja arvopohjareferenssi uusia kannanottoja varten. |
| `reminders` | Kokoukset ja määräajat, erityisesti match/uncertain-pykäliin liittyvät. |
| `conversation_log` | Koko Telegram-keskusteluhistoria, tallennetaan ennen kuin Claude näkee viestin (lossless-periaate). |

## Paikallispolitiikka-taidon toiminta

Kaksivaiheinen suodatus, jotta kalliimpi käsittely (täyden sisällön haku, Sonnet-tiivistys) kohdistuu vain oikeasti relevantteihin pykäliin — ei koko kunnan kaikkiin kokousasioihin:

1. **Ingest-ajo** (ajastettu, esim. muutaman tunnin välein): hakee kunnan RSS-syötteestä uudet pykälät metatietoineen (otsikko, toimielin, kokouspäivä, linkki). Konkreettinen hakutapa on toteutussuunnitelmassa tarkistettu oikeaa, elävää dataa vasten (Kokkolan Dynasty-järjestelmä).
2. **Idempotenssitarkistus:** jo nähdyt `source_id`:t (`raw_documents`-taulussa, riippumatta aiemmasta päätöksestä) ohitetaan — ei koskaan luokitella samaa pykälää uudelleen.
3. **Vaihe 1 — Portinvartija (Haiku, halpa, vain otsikko+lyhyt kuvaus):** uusi pykälä luokitellaan `gatekeeper_profile`-dokumenttia vasten pelkän RSS-otsikon perusteella, **ei täyttä sisältöä hakematta**. Tulos (`match`/`no_match`/`uncertain` + lyhyt perustelu) tallennetaan suoraan `raw_documents`-riviin — tämä rivi luodaan aina, myös hylätyille, jotta idempotenssi säilyy ilman että hylättyjen pykälien täyttä sisältöä koskaan haetaan tai luokitellaan uudelleen. Epävarmuustilanteessa valitaan mieluummin "uncertain" kuin "no_match" — relevantin asian huomaamatta jättäminen on pahempi virhe kuin turha jatkokäsittely.
4. **Vaihe 2 — vain match/uncertain-pykälille:** haetaan täysi sisältö kunnan järjestelmästä, päivitetään `raw_documents`-rivi (`body_text`, `pdf_url`), ja tuotetaan Sonnet-tiivistelmä `document_summaries`-tauluun.
5. **Ulostulot:**
   - Päivittäinen/viikoittainen Telegram-briiffi: vain match/uncertain-pykälät kyseiseltä jaksolta, linkki alkuperäiseen dokumenttiin.
   - Välitön ilmoitus, jos match/uncertain-pykälällä on lähestyvä kokous (esim. < 48h).
   - Komento `/kannanotto <pykälä>`: hakee pykälän + `positions`-taulun aiemmat kannanotot tyylireferenssiksi, auttaa muotoilla luonnoksen käyttäjän viimeisteltäväksi.
   - Komento `/hae <hakusana>`: vapaa haku koko `raw_documents`-arkistosta (myös hylätyt pykälät löytyvät otsikkotasolla, vaikka täyttä sisältöä ei ole haettu).
   - Komento `/opeta <vapaa teksti>`: käyttäjä kuvaa vapaasti mikä on/ei ole kiinnostavaa. Sonnet muotoilee tästä ehdotuksen `gatekeeper_profile`-päivitykseksi ja näyttää sen käyttäjälle diffinä, tallentaen sen `gatekeeper_feedback`-riviksi (`applied=false`).
   - Komento `/hyväksy`: soveltaa uusimman hyväksymättömän `gatekeeper_feedback`-ehdotuksen `gatekeeper_profile`-dokumenttiin.
   - Komento `/hylkää`: hylkää uusimman hyväksymättömän ehdotuksen soveltamatta sitä.

## Telegram-kanava ja komennot

- Yksityinen botti, allowlist rajaa vastaukset yhteen Telegram-käyttäjä-ID:hen. Muut käyttäjät saavat hiljaisen hylkäyksen (ei paljasteta botin olemassaoloa/toimintaa).
- Vapaamuotoinen keskustelu tuetaan (kysymykset arkistosta, pyynnöt tiivistää jotain uudelleen jne.) — ei vain kiinteät komennot.
- Kiinteät komennot: `/hae <hakusana>`, `/kannanotto <pykälä>`, `/opeta <vapaa teksti>`, `/hyväksy`, `/hylkää`.

## Proaktiivisuusmoottori

- **Päivittäinen briiffi:** kiinteä kellonaika (oletus klo 7, muokattavissa), kooste edellisen jakson osuneista pykälistä + tulevat määräajat.
- **Kiireelliset heti:** ingest-ajon löytäessä osuneen pykälän jolla on lähestyvä määräaika, ilmoitus lähtee saman tien briiffiaikataulusta riippumatta.
- Toteutetaan yksinkertaisena in-process-ajastimena (node-cron tai APScheduler) Hetzner-prosessin sisällä.

## Turvallisuus

- Kaikki salaisuudet (Telegram-botti-token, Anthropic API -avain, Supabase service-role-avain) Hetzner-VPS:n ympäristömuuttujina, ei koodissa eikä versionhallinnassa.
- Allowlist-tarkistus on gatewayn ensimmäinen askel jokaiselle saapuvalle viestille.
- `raw_documents` on muuttumaton totuuslähde — Claude ei koskaan muokkaa sitä, vain tuottaa erillisiä, siihen viittaavia tiivistelmiä.
- **Kulukatto:** Anthropic Consoleen (Settings → Limits) asetetaan kuukausittainen käyttökatto ennen tuotantoon vientiä, jotta ohjelmointivirhe tai odottamaton datamäärä ei voi tuottaa yllättävän suurta laskua (ks. jaksolla #804 käsitelty riski hallitsemattomasta tokenkulusta).
- **Idempotenssi ingest-ajossa:** jokainen Kokkolan kokousasia tunnistetaan pysyvällä `source_id`:llä (esim. `20261273-7`). Ennen kuin mitään haetaan tai luokitellaan Claudella, ingest-ajo tarkistaa Supabasesta mitkä RSS-syötteen `source_id`:t on jo tallennettu `raw_documents`-tauluun, ja käsittelee (hakee, luokittelee, tiivistää) vain uudet. `raw_documents.source_id` on lisäksi tietokantatasolla `unique`, joten kaksoiskirjaus estyy myös rinnakkaisajossa. Tämä pitää Haiku/Sonnet-kulut suhteessa uusiin pykäliin, ei ajokertoihin.

## Virheenkäsittely

- Jos kunnan asiakirjahaku epäonnistuu (esim. lähdejärjestelmä muuttunut), Säleikkö ilmoittaa siitä proaktiivisesti Telegramissa sen sijaan että jää hiljaiseksi.
- Systemd-palvelu käynnistyy automaattisesti uudelleen kaatumisen jälkeen.
- Claude API -kutsuille tavanomainen retry-logiikka (429/5xx-virheet).
- **Ulkoinen terveystarkastus:** systemd huomaa vain prosessin oman kaatumisen, ei koko VPS:n tai verkkoyhteyden katkeamista. Säleikkö tarjoaa kevyen `GET /health`-HTTP-päätepisteen, johon osoitetaan ilmainen ulkoinen uptime-tarkistus (esim. UptimeRobot tai Healthchecks.io) muutaman minuutin välein. Jos tarkistus epäonnistuu toistuvasti, palvelu lähettää hälytyksen ulkoisen työkalun kautta (sähköposti/push) — tämä on ainoa tapa huomata täydellinen palvelinkatko, jolloin Säleikkö itse ei voi enää ilmoittaa mitään Telegramissa.
- **Tunnettu rajoitus — osittainen epäonnistuminen ingest-ajossa:** jos prosessi kaatuu kesken yksittäisen pykälän käsittelyä (Vaiheen 1 rivi on jo tallennettu, mutta Vaihe 2 — sisällön haku ja tiivistys — ei ole vielä valmistunut), kyseinen pykälä jää pysyvästi "kesken" -tilaan, koska idempotenssitarkistus perustuu pelkkään `source_id`:n olemassaoloon, ei valmistumiseen. Tämä on tietoinen, hyväksytty rajoitus Vaihe 1:ssä (yhden käyttäjän hobbyprojekti, ei tuotantoluokan vaatimuksia) — täysi korjaus vaatisi erillisen tila-/valmistumissarakkeen, mikä on ylimitoitettua tähän mittakaavaan. Käytännön korjaus jos näin käy: poista kyseinen rivi manuaalisesti Supabasen Table Editorista, jolloin ingest-ajo käsittelee sen uudelleen seuraavalla kierroksella.

## Testaus

- Kiinnostusluokittelun (Haiku) tarkkuus testataan käsin kuratoidulla testijoukolla oikeita ja vääriä pykäliä ennen tuotantoon vientiä. Väärä negatiivi (relevantti pykälä jää huomaamatta) on pahempi virhe kuin väärä positiivi — kynnys asetetaan mieluummin liian herkäksi.
- Manuaalinen läpiajo koko putkesta (haku → luokittelu → tiivistys → briiffi) yhdellä oikealla, jo julkaistulla kokousaineistolla ennen ajastuksen käyttöönottoa tuotannossa.

## Avoimet kysymykset toteutusvaiheeseen

- ~~Kunnan asiakirjajärjestelmän tarkka rajapinta/rakenne~~ — ratkaistu: kunta on Kokkola, joka käyttää Dynasty-järjestelmää (`kokkola10.oncloudos.com`). Rajapinta (RSS-syöte + per-pykälä HTML-sivu) on tarkistettu toteutussuunnitelmassa oikeaa, elävää dataa vasten.
- Päivittäisen briiffin täsmällinen kellonaika ja mahdollinen viikonloppupoikkeus.
