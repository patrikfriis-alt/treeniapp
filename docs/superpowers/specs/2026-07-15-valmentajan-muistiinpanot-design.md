# Treeniapp (Valkku) — Valmentajan pysyvät muistiinpanot

**Päivämäärä:** 2026-07-15
**Laajuus:** Tekoälyvalmentajan v2-jatko. Valmentaja ylläpitää lyhyttä, itse kirjoittamaansa muistiinpanoa käyttäjästä, joka päivittyy jokaisen keskusteluvaihdon jälkeen ja syötetään takaisin tulevien vastausten kontekstiin — tämä on se osa "oppimisesta ajan myötä" jota v1 (2026-07-14, `docs/superpowers/specs/2026-07-14-tekoalyvalmentaja-design.md`) tietoisesti rajasi pois.
**Riippuvuudet:** Olemassa oleva `coach-chat` Edge Function ja sen `context.ts`-datakonteksti, olemassa oleva `openMetricModal`-jaettu modaali (`index.html`), olemassa oleva Claude API -integraatio.

---

## Tausta

V1:n design-spec totesi: "Pysyvä muistiinpano-mekanismi... looginen v2, ei v1:ssä." V1 osoittautui toimivaksi (kts. tuotantokäytön vahvistus), joten tämä spec toteuttaa sen jatko-osan: valmentaja kirjoittaa itse lyhyitä, pysyviä havaintoja käyttäjästä keskustelujen pohjalta, eikä vain nojaa joka kerta tuoreeseen datayhteenvetoon.

---

## 1. Päivitysmekanismi

Muistiinpanot päivittyvät **jokaisen keskusteluvastauksen jälkeen**, ei erillisellä aikataululla. `coach-chat`-Edge Function tekee kaksi peräkkäistä Claude-kutsua saman pyynnön aikana:

1. Nykyinen kutsu: rakenna datakonteksti + muistiinpanot, vastaa käyttäjän kysymykseen (olemassa oleva logiikka, laajennettuna sisältämään muistiinpanot).
2. **Uusi kutsu**: näytä mallille nykyiset muistiinpanot + juuri käyty vaihto (käyttäjän kysymys + valmentajan vastaus), pyydä päivittämään muistiinpanot jos jotain pysyvästi hyödyllistä ilmeni.

Molemmat vastataan samassa pyynnössä ennen kuin selaimelle palautetaan vastaus — käyttäjä odottaa hieman kauemmin (~1-3s lisää), mutta toteutus pysyy yksinkertaisena eikä vaadi erillistä taustaprosessia tai ajastettua funktiota.

Toinen kutsu ei hae uudelleen koko datakontekstia (viikkoyhteenvedot, treenisessiot jne.) — se näkee vain nykyiset muistiinpanot ja juuri käydyn vaihdon, pitäen sen halvana ja keskittyneenä "mitä opin tästä keskustelusta" -kysymykseen, ei datan uudelleen-johtamiseen.

---

## 2. Tietokanta

Uusi migraatio:

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

Sama singleton-malli kuin `user_profile`/`app_settings`: aina täsmälleen yksi rivi. Rivi luodaan tyhjänä heti migraatiossa (ei `insert`-policya tarvita ajossa, koska sovellus ei koskaan luo uutta riviä — vain päivittää olemassa olevaa). Ei delete-policya.

---

## 3. Muistiinpanojen päivitysprompti

Erillinen, lyhyt system-prompt Claude-kutsulle #2 (ei sama kuin varsinainen valmentaja-prompti):

> "Sinun tehtäväsi on ylläpitää lyhyttä muistiinpanoa käyttäjästä havaintojen perusteella. Tässä ovat nykyiset muistiinpanot ja äskeinen keskusteluvaihto. Päivitä muistiinpanot jos jotain uutta ja pysyvästi hyödyllistä ilmeni (esim. toistuvia tapoja, mieltymyksiä, poikkeamia) — älä toista dataa jonka valmentaja jo näkee joka viestillä (esim. tarkkoja lukuja), keskity havaintoihin jotka eivät muuten näkyisi. Jos mikään ei ole muuttunut, palauta muistiinpanot muuttumattomina. Pidä muistiinpanot lyhyinä (muutama virke)."

Tämä ohjaa mallia nimenomaan pois raakadatan toistamisesta (jonka se jo saa joka viestillä `context.ts`:n kautta) ja kohti aidosti keskustelusta johdettuja, pysyviä havaintoja — sellaisia joita ei näkisi yhden päivän datapoiminnasta.

---

## 4. Muistiinpanojen käyttö varsinaisessa vastauksessa

`context.ts`:n `buildDataContext()` laajenee hakemaan `coach_notes`-rivin ja liittämään sen datayhteenvedon alkuun (ennen viikkoyhteenvetoja), jotta valmentaja näkee sen jokaisessa vastauksessaan heti kättelyssä.

---

## 5. Käyttöliittymä

Uusi rivi Valmentaja-sivun keskustelulistanäkymään (`+ Uusi keskustelu` -painikkeen läheisyyteen): **"Mitä valmentaja tietää sinusta →"**.

- Klikkaus avaa olemassa olevan jaetun `openMetricModal`-mallin mukaisen modaalin, joka näyttää nykyisen muistiinpanotekstin.
- Jos muistiinpanot ovat tyhjät, näytetään selittävä rivi tekstin sijaan: "Ei vielä muistiinpanoja — keskustele valmentajan kanssa niin se alkaa oppia."
- Modaalissa "Tyhjennä muistiinpanot" -painike, joka natiivin `confirm()`-varmistuksen jälkeen (sama malli kuin session-poistossa) tyhjentää `notes`-kentän. Valmentaja alkaa keräämään uusia havaintoja seuraavasta keskustelusta lähtien.

Ei tekstin muokkausmahdollisuutta — vain katselu ja tyhjennys, koska valmentaja kirjoittaa muistiinpanot itse joka tapauksessa uudelleen seuraavassa keskustelussa.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti:

1. Kerro valmentajalle jotain pysyvää/toistuvaa (esim. "treenaan yleensä tiistaisin ja torstaisin") — tarkista muistiinpanot päivittyvät sen mukaisesti.
2. Lähetä triviaali jatkokysymys johon ei liity mitään uutta muistettavaa — tarkista muistiinpanot pysyvät muuttumattomina.
3. Aloita uusi keskustelu ja kysy jotain joka hyötyisi aiemmasta havainnosta — tarkista valmentajan vastaus todella hyödyntää olemassa olevia muistiinpanoja.
4. "Mitä valmentaja tietää sinusta" -modaali näyttää nykyisen tekstin oikein, ja tyhjä-tila näkyy oikein kun muistiinpanoja ei vielä ole.
5. "Tyhjennä muistiinpanot" tyhjentää rivin ja seuraava keskustelu alkaa keräämään havaintoja alusta.
