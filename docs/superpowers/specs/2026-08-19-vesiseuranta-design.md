# Treeniapp (Valkku) — Vesiseuranta (water tracking)

**Päivämäärä:** 2026-08-19
**Laajuus:** Uusi "Vesi"-kortti Koonnin "Mittarit"-riville (Keho/Uni/Askeleet-sarjan neljäs jäsen), joka avaa napautettaessa pikakirjausmodaalin (+250ml/+500ml/vapaa määrä, "Kumoa viimeisin"), sekä päivittäinen tavoiteasetus samalla mallilla kuin askeltavoite.
**Riippuvuudet:** Olemassa oleva `app_settings`-taulu (`daily_steps_goal`-sarakkeen malli), `koonti-card`/`koonti-card-goal`/`koonti-progress-track`-CSS (jo käytössä Askeleet-kortilla), `openMetricModal`/`createModalOverlay`, `sbWrite`, `loadKoonti()`.

---

## Tausta

Kalorit, uni, askeleet ja nyt paasto seurataan jo — vesi puuttuu kokonaan. Tämä on tarkoituksella pieni, itsenäinen lisäys: pelkkä manuaalinen pikakirjaus, ei Apple Health -synkronointia (päätetty rajaus, eroaa askel-/unidatasta jotka synkronoituvat Shortcuts-automaatioilla).

## 1. Datamalli

**Ei** `step_data`/`sleep_data`-tyylistä yksi-rivi-per-päivä-taulua — vesi kirjataan useita kertoja päivässä (lasillinen kerrallaan), joten malli on sama kuin `food_log_entries`/`activity_data`: monta riviä per päivä, päivän summa lasketaan kysyttäessä.

```sql
create table water_log (
  id         uuid primary key default gen_random_uuid(),
  logged_at  date not null default current_date,
  amount_ml  integer not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create index water_log_logged_at_idx on water_log (logged_at);

alter table water_log enable row level security;

create policy water_log_select on water_log
  for select to anon, authenticated using (true);
create policy water_log_insert on water_log
  for insert to anon, authenticated with check (true);
create policy water_log_delete on water_log
  for delete to anon, authenticated using (true);
```

Ei update-policya — merkintöjä ei muokata paikan päällä, vain lisätään tai poistetaan ("Kumoa viimeisin").

**Tavoite:** uusi sarake olemassa olevaan `app_settings`-tauluun, sama malli kuin `daily_steps_goal`:

```sql
alter table app_settings add column daily_water_goal_ml integer;
```

## 2. Uusi ikoni

`ICONS`-objektissa (index.html, sama tiedosto jossa `steps`/`moon`/`scale` jo määritelty) ei ole vesipisara-ikonia. Lisätään uusi avain samalla viivapiirros-tyylillä kuin muut:

```js
droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',
```

## 3. Koonti-kortti

Neljäs kortti "Mittarit"-riville, tarkalleen samalla rakenteella kuin Askeleet-kortti (`kc-steps`), samalla `var(--green)`-värillä (rivin sisäinen väriyhtenäisyys, ei uutta väriä):

```html
<div class="koonti-card" id="kc-water" onclick="openWaterModal()">
  <span class="koonti-card-icon" data-icon="droplet" data-icon-color="var(--green)" data-icon-bg="var(--green-bg)"></span>
  <div class="koonti-card-label">Vesi</div>
  <div class="koonti-card-sub skel-sub" id="kc-water-sub">&nbsp;</div>
  <div class="koonti-card-goal" id="kc-water-goal" style="display:none"></div>
  <div class="koonti-progress-track" id="kc-water-bar-track" style="display:none"><div class="koonti-progress-fill" id="kc-water-bar-fill" style="width:0%"></div></div>
</div>
```

`loadKoonti()` hakee tämän päivän `water_log`-rivien summan (`gte`/`lte` `logged_at` = tänään, tai suoraan `eq`), täyttää `kc-water-sub`:iin summan (esim. "1250 ml", tai "Ei kirjauksia vielä" jos tyhjä), ja jos `daily_water_goal_ml` on asetettu, näyttää `kc-water-goal`:iin "1250/2000 ml" ja `kc-water-bar-fill`:in leveydeksi `min(100, round(total/goal*100))%` — täsmälleen sama logiikka kuin askelten `stepsGoal`-lohko.

## 4. Vesimodaali

`openWaterModal()`, samalla `openMetricModal`/`createModalOverlay`-pohjalla kuin muut mittarimodaalit, mutta lisää oman sisäisen päivitysmekanismin (ei sulkeudu jokaisen lisäyksen jälkeen — käyttäjä voi napauttaa +250ml useita kertoja peräkkäin):

- Näyttää tämän päivän kokonaismäärän ja tavoitteen (jos asetettu).
- `+250ml` / `+500ml` -napit lisäävät välittömästi (`water_log`-riviin insert), sitten päivittävät modaalin oman näytön (uusi kysely + DOM-päivitys) — ei sulje modaalia.
- Vapaa määrä: numerokenttä + "Lisää"-nappi (`parseNum`-apufunktio, sama kuin muualla), positiivinen kokonaisluku vaaditaan.
- "Kumoa viimeisin" -nappi: poistaa tämän päivän uusimman (`created_at desc limit 1`) `water_log`-rivin. **Näkyy vain jos tänään on vähintään yksi merkintä** — sama "piilota jos ei sovellu" -käytäntö kuin muualla sovelluksessa. Kumoaminen ei koskaan ulotu eiliseen tai aiempaan päivään, vaikka tälle päivälle ei olisi vielä yhtään merkintää.
- Sulkeutuu vain käyttäjän omasta toiminnasta (`✕`-nappi, `openMetricModal`:n vakiokäytäntö), ei automaattisesti minkään lisäyksen jälkeen.
- Koonti-kortin oma näyttö päivittyy seuraavan kerran kun `loadKoonti()` ajetaan (esim. modaalin sulkemisen jälkeen sivu on jo auki taustalla) — ei tarvetta pakottaa taustakortin päivitystä modaalin ollessa auki, koska se on joka tapauksessa peitossa.

## 5. Tavoiteasetus

`openWaterGoalModal()` + `saveWaterGoal(goal)`, rivi riviltä identtinen `openStepsGoalModal()`/`saveStepsGoal()`:n kanssa, tallentaen `app_settings.daily_water_goal_ml`:iin `sbWrite`-upsertilla. Tavoitemodaalin avauspaikka (sivuvalikko tms.) päätetään toteutussuunnitelmassa samaan kohtaan kuin askeltavoitteen asetus jo on.

## 6. Rajaus

- Ei Apple Health / Shortcuts -synkronointia (päätetty rajaus).
- Ei viikko-/kuukausitrendikaaviota tässä versiossa — pelkkä tämän päivän summa ja tavoite, sama "pieni itsenäinen lisäys" -periaate kuin alkuperäinen idea.
- Ei merkintöjen muokkausta paikan päällä, vain lisäys ja "Kumoa viimeisin" -poisto.
- Ei muutoksia olemassa oleviin tauluihin paitsi `app_settings`-taulun uusi sarake.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa:

1. Avaa Koonti — tarkista että "Vesi"-kortti näkyy Mittarit-rivillä (Keho/Uni/Askeleet-sarjan neljäntenä), aluksi "Ei kirjauksia vielä".
2. Aseta tavoite (esim. 2000ml) — tarkista että kortti näyttää edistymispalkin ja "0/2000 ml" -tekstin.
3. Avaa vesimodaali, napauta +250ml kahdesti peräkkäin — tarkista että modaalin oma näyttämä summa päivittyy välittömästi kummankin napautuksen jälkeen ilman modaalin sulkeutumista.
4. Kokeile vapaata määrää (esim. 330ml) — tarkista lisäys.
5. Napauta "Kumoa viimeisin" — tarkista että vain viimeisin (330ml) rivi poistuu, summa palautuu oikein.
6. Sulje modaali, tarkista että Koonti-kortin summa ja edistymispalkki päivittyvät (lataa Koonti uudelleen tai navigoi pois ja takaisin).
7. Tarkista konsoli virheiden varalta koko läpikäynnin ajan.
