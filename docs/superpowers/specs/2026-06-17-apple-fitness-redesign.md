# Treeniapp — Apple Fitness+ -uudistus

**Päivämäärä:** 2026-06-17  
**Laajuus:** Treeni-sivu (hero-kortti, sarjarivit), navigointipalkki  
**Jatko:** Seuranta- ja Historia-sivut myöhemmin erillisessä kierroksessa

---

## Tavoite

Uudistaa sovelluksen visuaalinen ilme Apple Fitness+ -tyyliseksi: tummansininen gradient hero-kortti, kompakti sarjataulukko treenin aikana, ja pill-navigointipalkki. Toiminnallisuus ei muutu — vain UI.

---

## 1. Treeni-sivu (page-treeni)

### Hero-kortti

Nykyinen greeting-header + session-info korvataan yhdellä gradient-kortilla.

**Rakenne:**
```
┌─────────────────────────────────────────┐
│  TÄNÄÄN · TIISTAI                       │ ← 10px, uppercase, rgba(255,255,255,0.5)
│  Treeni 1                               │ ← 30px, weight 800, valkoinen
│  Työntävät lihasryhmät                  │ ← 14px, rgba(255,255,255,0.6)
│                                         │
│  7        ~45        21                 │ ← stats: isot numerot + pieni label alla
│  liikettä  min       sarjaa             │
│                                         │
│  [ Aloita treeni → ]                    │ ← glassmorphism-nappi
└─────────────────────────────────────────┘
```

**Tyylit:**
- Tausta: `linear-gradient(145deg, #0d1b4b 0%, #0a2a6e 40%, #0a84ff 100%)`
- Radial glow oikeassa yläkulmassa: `radial-gradient(circle, rgba(10,132,255,0.4) 0%, transparent 70%)`
- Border-radius: `20px`, margin `12px`
- "Aloita treeni" -nappi: `background: rgba(255,255,255,0.15)`, `backdrop-filter: blur(10px)`, `border: 1px solid rgba(255,255,255,0.2)`

**Hero-kortin tilamuutokset (vastaa nykyistä started/done-logiikkaa):**
- `!started` → nappi "Aloita treeni →", ei edistymispalkkia
- `started && !done` → nappi "Jatka treeniä →", edistymispalkki näkyvissä
- `done` → kortti saa vihreän reunavärin, nappi "Treeni tehty ✓" vihreällä, gradient pysyy

### Sessiotyypin valitsin (T1/T2/T3/T4)

Nykyinen sessiotyyppi-kortti säilyy rakenteeltaan samana mutta tyylitellään uudelleen: tumma `#1c1c1e`-tausta, napit pill-tyylillä (sama kuin navigointi — aktiivinen `#0a84ff`, inaktiiviset `#2c2c2e`). Sijainti pysyy session-contenin yläosassa.

### Tilastoruudukko (hero-kortin alla)

3 ruutua rinnakkain, jokaisessa emoji + iso numero + pieni label:

| Ruutu | Ikoni | Arvo | Väri |
|-------|-------|------|------|
| Streak | 🔥 | N pv | `#ff9f0a` |
| Viikon sali | 💪 | N/4 | `#0a84ff` |
| Uni ka | 😴 | N.Nh | `#30d158` |

- Tausta: `#1c1c1e`, border-radius `14px`

### Viikonpäiväpalkki

7 kompaktia nappia rivissä hero-kortin ja stats-ruudukon välissä:
- **Tehty:** vihreä piste (`#30d158`) + nimike
- **Tänään/aktiivinen:** sininen pill-tausta (`#0a84ff`), valkoinen piste
- **Tuleva:** harmaa, opacity 0.35

Poistetaan nykyinen `prog-wrap` edistymispalkki — tieto näkyy viikonpäiväpalkissa.

---

## 2. Sarjarivit treenin aikana

Kun käyttäjä on aloittanut treenin, jokainen liike renderöidään uudella layoutilla.

### Liike-header

Mini gradient-kortti liikkeen nimen yllä:
```
┌────────────────────────────────────┐
│ Rintapunnerruslaite    1/3 sarjaa  │
│ 3 × 8                  ▓░░░       │  ← progress bar
└────────────────────────────────────┘
```
- Tausta: `linear-gradient(135deg, #0d1b4b, #0a2a6e)`
- Edistymispalkki: `#0a84ff` täyttö `#1c3a7a` pohjalla

### Sarjataulukko

```
┌─────┬──────────┬──────────┬─────────┐
│  S  │  KG      │  TOISTOT │  EDELL. │  ← header
├─────┼──────────┼──────────┼─────────┤
│  1  │  80      │  8       │  80×8   │  ← tehty: vihreä tausta
│  2  │ [80   ]  │ [    ]   │  80×8   │  ← aktiivinen: sininen border
│  3  │   —      │   —      │  80×8   │  ← tuleva: opacity 0.35
└─────┴──────────┴──────────┴─────────┘
```

**Tila-tyylit:**
- Tehty: `background: rgba(48,209,88,0.06)`, numerot pelkkää tekstiä
- Aktiivinen: `background: rgba(10,132,255,0.08)`, kg-input `border: 2px solid #0a84ff`
- Tuleva: `opacity: 0.35`, inputit disabloitu

**Edellinen sessio** näkyy samalla rivillä oikeassa reunassa (`rgba(255,255,255,0.3)`) — ei enää erillisellä rivillä.

### "Seuraavaksi"-palkki

Jokaisen liike-taulukon alla:
```
Seuraavaksi  →  Pec Deck (rintalaite)  ·  3 × 12
```
- Tausta `#1c1c1e`, border-radius `16px`
- Piilotetaan viimeisellä liikkeellä

---

## 3. Navigointipalkki

**Nykyinen** (border-top highlight) korvataan **pill-tyylillä**:

```
┌────────────────────────────────────┐
│  [🏋️ Treeni]   📊 Seuranta   ≡    │
│   ^^pill^^                         │
└────────────────────────────────────┘
```

- Aktiivinen tab: `background: #0a84ff`, `border-radius: 20px`, padding `6px`
- Inaktiiviset: opacity `0.4`, ei taustaa
- Nav-bar: `background: rgba(18,18,18,0.95)`, `backdrop-filter: blur(20px)`
- Tekstit ja ikonit säilyvät

---

## Muutokset koodiin

Kaikki muutokset ovat yhdessä tiedostossa (`index.html`):

1. **CSS:** Nav-bar-tyylit, `.set-row` → taulukkorakenne, hero-card-tyylit, stats-ruudukko
2. **`renderTreeni()`:** Hero-kortti + tilastoruudukko + viikonpäiväpalkki
3. **`renderSession()`:** Sarjataulukko liike-headerin kanssa
4. **`updateSetBox()`:** Päivitetty tila-logiikka uusille CSS-luokille

---

## Rajaukset

- Seuranta- ja Historia-sivut **eivät muutu** tässä kierroksessa
- Sidebar ei muutu
- Toiminnallisuus (Supabase-synkronointi, edellinen sessio, PR-merkinnät) säilyy identtisenä
- Ei uusia ominaisuuksia — vain UI-muutos
