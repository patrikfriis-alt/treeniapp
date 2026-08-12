# Treeniapp (Valkku) — Tyhjät tilat (empty states)

**Päivämäärä:** 2026-08-12
**Laajuus:** "Ei dataa vielä" -tyyppiset viestit ovat tällä hetkellä paljasta 12px harmaata tekstiä, ilman ikonia tai muuta visuaalista käsittelyä. Tämä spec lisää niihin ikonin (olemassa olevasta `ICONS`-setistä) ja paremman asettelun. Ei kopiomuutoksia, ei uusia toimintoja/CTA-nappeja — pelkkä visuaalinen käsittely rajatussa joukossa kohtia.
**Riippuvuudet:** Olemassa oleva `ICONS`/`svgIcon()`-järjestelmä (index.html:1403–1427).

---

## Tausta

Sovelluksessa on kahdenlaisia `.status`-luokkaa käyttäviä viestejä, jotka näyttävät samalta muttei tarkoita samaa:

1. **"Ei dataa vielä" -tyhjät tilat** — kertovat ettei mitään ole vielä kirjattu (treenikaavio, juoksukaavio, valmentajan keskustelulista, valmentajan muistiinpanot).
2. **Tallennuspalaute** — "Tallennettu ✓" tai virheviesti napin painalluksen jälkeen (n. 16 kohtaa: `act-status`, `body-status`, `profile-settings-status` jne.). Eri konsepti, ei kosketa tässä.

Tämä spec koskee vain ryhmää 1.

---

## 1. Uusi komponentti

```js
function emptyState(icon, text) {
  return `<div class="empty-state">${svgIcon(icon, 'var(--text3)', 32)}<div class="empty-state-text">${text}</div></div>`;
}
```

```css
.empty-state { display:flex; flex-direction:column; align-items:center; gap:8px; padding:20px 12px; }
.empty-state-text { font-size:13px; color:var(--text3); text-align:center; }
```

## 2. Kohteet (6 kpl)

| Rivi (n.) | Elementti | Ikoni | Nykyinen teksti |
|---|---|---|---|
| 3514 | `ex-chart-status` | `dumbbell` | "Ei dataa vielä." |
| 3531 | `ex-chart-status` | `dumbbell` | "Ei painodataa vielä." |
| 3624 | `ex-modal-chart-status` | `dumbbell` | "Ei dataa vielä." |
| 3737 | `run-chart-status` | `running` | "Ei juoksudataa vielä" |
| 5431 | valmentajan keskustelulista | `chat` | "Ei vielä keskusteluja" |
| 5451 | valmentajan muistiinpanot | `clipboard` | "Ei vielä muistiinpanoja — keskustele valmentajan kanssa niin se alkaa oppia." |

Jokaisessa kohdassa `statusEl.textContent = '...'` (tai vastaava template-string) korvataan `emptyState(icon, '...')`-kutsulla, joko `.innerHTML =`-sijoituksena tai template-stringin sisällä. Onnistumispolun `statusEl.textContent = ''` -tyhjennykset (3544, 3740 ym.) pysyvät ennallaan sellaisenaan — `textContent = ''` tyhjentää myös aiemmin asetetun `innerHTML`:n.

Rivin 6263 `ex-modal-chart-status`-elementin CSS-luokka `.ex-modal-status` (rgba(255,255,255,0.5), padding 16px) jätetään ennalleen — `emptyState()`-sisältö renderöityy sen sisään normaalisti.

## 3. Rajaus — mitä EI muuteta

- **Steps-modaalin viikkohuomautus** (rivi ~5201, "Ei kirjauksia vielä tällä viikolla") — täydentävä yksirivinen huomautus oikean datan alla samassa modaalissa, ei itsenäinen tyhjä näkymä. Iso ikoni näyttäisi tässä kontekstissa raskaalta.
- **Ruokahaun "Ei vielä aiempia ruokia"** (rivi ~4130, `.food-search-empty`-luokka) — muuttuu jatkuvasti käyttäjän kirjoittaessa hakukenttään; ikoni hyppisi häiritsevästi.
- **Kaikki `.status`/`.status.err`/`.status.ok`-tallennuspalautteet** (n. 16 kohtaa + virheviestit) — eri konsepti, ei tyhjä tila.

---

## Testaus

Ei automaattitestejä. Manuaalinen läpikäynti selaimessa (esim. `python3 -m http.server` + Chrome):

1. Avaa harjoitteen kehityskaavio liikkeelle jolla ei ole dataa — tarkista että `dumbbell`-ikoni + teksti näkyy keskitettynä.
2. Avaa Juoksu-kaavio kun juoksudataa ei ole — tarkista `running`-ikoni.
3. Avaa valmentajan keskustelulista tyhjänä tilana (esim. testitililtä ilman keskusteluja) — tarkista `chat`-ikoni + olemassa olevat napit ("+ Uusi keskustelu" ym.) toimivat edelleen normaalisti yläpuolella.
4. Avaa valmentajan muistiinpanot tyhjänä — tarkista `clipboard`-ikoni.
5. Varmista että kun dataa ON, ikoni/teksti eivät jää näkyviin (esim. vaihda harjoite datalliseen ja takaisin datattomaan, tarkista ettei vanhaa sisältöä jää roikkumaan).
