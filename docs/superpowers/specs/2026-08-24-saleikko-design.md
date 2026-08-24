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
    positions, reminders, topics_of_interest
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
| `raw_documents` | Kunnan järjestelmästä haetut alkuperäiset pykälät/asiakirjat sellaisenaan: lähde-URL, kokous, päivämäärä, alkuperäistiedosto (linkki Storageen). Ei koskaan muokata jälkikäteen — tämä on totuuslähde. |
| `document_summaries` | Claude-generoidut tiivistelmät per pykälä, viittaus `raw_documents`-riviin. Sisältää myös Haiku-luokittelun tuloksen (osui/ei osunut/epävarma, mihin `topics_of_interest`-riviin). |
| `topics_of_interest` | Käyttäjän ylläpitämä lista seurattavista aiheista/avainsanoista/lautakunnista. Muokattavissa Telegram-komennoilla `/seuraa` ja `/lopeta_seuranta`. |
| `positions` | Käyttäjän aiemmat kannanotot/puheenvuorot — tyyli- ja arvopohjareferenssi uusia kannanottoja varten. |
| `reminders` | Kokoukset ja määräajat, erityisesti osuneisiin pykäliin liittyvät. |
| `conversation_log` | Koko Telegram-keskusteluhistoria, tallennetaan ennen kuin Claude näkee viestin (lossless-periaate). |

## Paikallispolitiikka-taidon toiminta

1. **Ingest-ajo** (ajastettu, esim. muutaman tunnin välein): hakee kunnan järjestelmästä uudet/muuttuneet esityslistat ja pöytäkirjat. Konkreettinen hakutapa (mikä kunnan asiakirjajärjestelmä, esim. Dynasty10/CaseM-tyyppinen ratkaisu tai muu) tarkennetaan toteutusvaiheessa käyttäjän kunnan mukaan — tässä specissä rajapintavaatimus on: "palauttaa lista uusista pykälistä metatietoineen (otsikko, kokous, päivämäärä, linkki alkuperäiseen)".
2. Jokainen uusi pykälä tallennetaan `raw_documents`-tauluun riippumatta kiinnostavuudesta.
3. **Kiinnostusluokittelu** (Haiku): jokainen uusi pykälä luokitellaan `topics_of_interest`-listaa vasten. Vain osuvat ja epävarmat (varmuuden vuoksi mieluummin liian herkkä kuin liian tiukka kynnys) etenevät seuraavaan vaiheeseen.
4. **Tiivistys** (Sonnet): osuneille pykälille tuotetaan tiivistelmä, tallennetaan `document_summaries`-tauluun.
5. **Ulostulot:**
   - Päivittäinen/viikoittainen Telegram-briiffi: vain osuneet pykälät kyseiseltä jaksolta, linkki alkuperäiseen dokumenttiin.
   - Välitön ilmoitus, jos osuneella pykälällä on lähestyvä määräaika (esim. < 48h).
   - Komento `/kannanotto <pykälä>`: hakee pykälän + `positions`-taulun aiemmat kannanotot tyylireferenssiksi, auttaa muotoilla luonnoksen käyttäjän viimeisteltäväksi.
   - Komento `/hae <hakusana>`: vapaa haku koko arkistosta (`raw_documents` + `document_summaries`), kattaa myös ei-osuneet pykälät.

## Telegram-kanava ja komennot

- Yksityinen botti, allowlist rajaa vastaukset yhteen Telegram-käyttäjä-ID:hen. Muut käyttäjät saavat hiljaisen hylkäyksen (ei paljasteta botin olemassaoloa/toimintaa).
- Vapaamuotoinen keskustelu tuetaan (kysymykset arkistosta, pyynnöt tiivistää jotain uudelleen jne.) — ei vain kiinteät komennot.
- Kiinteät komennot: `/seuraa <aihe>`, `/lopeta_seuranta <aihe>`, `/hae <hakusana>`, `/kannanotto <pykälä>`.

## Proaktiivisuusmoottori

- **Päivittäinen briiffi:** kiinteä kellonaika (oletus klo 7, muokattavissa), kooste edellisen jakson osuneista pykälistä + tulevat määräajat.
- **Kiireelliset heti:** ingest-ajon löytäessä osuneen pykälän jolla on lähestyvä määräaika, ilmoitus lähtee saman tien briiffiaikataulusta riippumatta.
- Toteutetaan yksinkertaisena in-process-ajastimena (node-cron tai APScheduler) Hetzner-prosessin sisällä.

## Turvallisuus

- Kaikki salaisuudet (Telegram-botti-token, Anthropic API -avain, Supabase service-role-avain) Hetzner-VPS:n ympäristömuuttujina, ei koodissa eikä versionhallinnassa.
- Allowlist-tarkistus on gatewayn ensimmäinen askel jokaiselle saapuvalle viestille.
- `raw_documents` on muuttumaton totuuslähde — Claude ei koskaan muokkaa sitä, vain tuottaa erillisiä, siihen viittaavia tiivistelmiä.

## Virheenkäsittely

- Jos kunnan asiakirjahaku epäonnistuu (esim. lähdejärjestelmä muuttunut), Säleikkö ilmoittaa siitä proaktiivisesti Telegramissa sen sijaan että jää hiljaiseksi.
- Systemd-palvelu käynnistyy automaattisesti uudelleen kaatumisen jälkeen.
- Claude API -kutsuille tavanomainen retry-logiikka (429/5xx-virheet).

## Testaus

- Kiinnostusluokittelun (Haiku) tarkkuus testataan käsin kuratoidulla testijoukolla oikeita ja vääriä pykäliä ennen tuotantoon vientiä. Väärä negatiivi (relevantti pykälä jää huomaamatta) on pahempi virhe kuin väärä positiivi — kynnys asetetaan mieluummin liian herkäksi.
- Manuaalinen läpiajo koko putkesta (haku → luokittelu → tiivistys → briiffi) yhdellä oikealla, jo julkaistulla kokousaineistolla ennen ajastuksen käyttöönottoa tuotannossa.

## Avoimet kysymykset toteutusvaiheeseen

- Kunnan asiakirjajärjestelmän tarkka rajapinta/rakenne (mikä alusta, onko rakenteista dataa vai pelkkää HTML/PDF-scrapea) — käyttäjä täsmentää kunnan toteutusvaiheen alussa.
- Päivittäisen briiffin täsmällinen kellonaika ja mahdollinen viikonloppupoikkeus.
