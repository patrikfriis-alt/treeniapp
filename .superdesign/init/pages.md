# Pages — dependency trees for the 2 mockup targets

No file-based imports (single `index.html`) — "dependencies" here means the HTML block, its render function(s), the CSS classes it uses, and the icons it references.

## Koonti (dashboard) — mockup target #1

Entry: `#page-koonti`, index.html:1086-1198

```
#page-koonti
├── .koonti-navbar (sticky, fades in on scroll — "Koonti" title)
├── .koonti-greeting "Hei! 👋" + .koonti-date (today's date, Finnish)
├── #onboarding-card (.card, hidden after first use — skip in mockup)
├── .hero-metrics (row 1 of 3 tiles): streak (flame icon, amber) · viikon sali (dumbbell, accent) · viikon aktiiv. (running, red)
├── .hero-metrics (row 2 of 3 tiles): viikon aktiivisuus % w/ progress bar (calendar icon) · kuukausi count (calendar icon) · päivän kalorit deficit (scale icon)
├── #huomiot-card (.card, conditional — AI-generated weekly insight notes, hidden if none)
├── .koonti-section-label "Tänään"
├── .koonti-cards (2-col grid): kc-sali card (dumbbell icon, links to Sali) · kc-aerobia card (running icon, links to Aerobia, has an optional goal-progress bar)
├── .koonti-section-label "Mittarit"
├── .koonti-cards (2-col grid, 4 items): kc-keho (scale, green) · kc-uni (moon, green) · kc-steps (steps icon, green, has goal+progress bar) · kc-water (droplet, green, has goal+progress bar)
├── .koonti-cards--wide (1-col): kc-ruoka wide card (utensils icon inline in label, chevron "›" affordance)
└── .card "Tällä viikolla": #kc-weekly-rows (text rows: salikertoja/aktiviteettikertoja/kilometrit/unen-keskiarvo/viikon-kalorit-progress) + #kc-weekly-insights (auto-generated text notes, e.g. step-count % change, sleep drop, etc.)
```

**Render functions**: several async loaders populate this incrementally (`loadWeekSummary()`, `loadMotivationSummary()`, plus page-specific hero/koonti-card fillers) — all writing into fixed element ids (`koonti-ms-streak`, `koonti-ws-gym`, `kc-sali-sub`, etc.), not a single monolithic render function like Sali has.

**Icons used**: `flame`, `dumbbell`, `running`, `calendar` (×2), `scale`, `utensils`, `moon`, `steps`, `droplet`.

**Notable real content shapes** (for mockup realism): streak is a small integer + " pv" (days); weekly kcal deficit can be a large negative number (e.g. "-1879 kcal"); the "Tänään" Sali card subtitle shows either "Ei vielä" (not done) or a session name; step/water/activity cards show "X / goal" with a thin progress bar underneath, colored green/amber/red by over/under budget.

---

## Sali → Treeni tab (workout logging) — mockup target #2

Entry: `#page-sali`, index.html:1201-1269 (static shell) + `#hero-section`/`#session-content` (dynamically filled)

```
#page-sali
├── .page-header: back button (‹) + "Sali" title
├── #hero-section (filled by renderTreeni(), index.html:3062-3075)
│   └── .hero-card (gradient background, rounded 20px)
│       ├── .hero-glow (decorative radial-gradient blob, top-right)
│       ├── .hero-day: "TÄNÄÄN · 9. SYYSKUUTA" (uppercase, small)
│       ├── .hero-name: session name, e.g. "Treeni 2 — Vetävät" (large, 30px/800)
│       ├── .hero-focus: muscle-group focus text, e.g. "Selkä, takaolkapäät, hauikset"
│       ├── .state-pill (done/active badge — only if session started or done; moved here 2026-09-09, was previously duplicated below)
│       ├── .hero-stats-row (3 stats + separators): liikettä (exercise count) · min (est. duration) · sarjaa (total sets) — only if the day has a program
│       └── .hero-cta button: "Aloita treeni →" / "Jatka treeniä →" / "Treeni tehty ✓" depending on state
├── .week-nav: ← Viikko N / YYYY →
├── .day-tabs (7 buttons, Mon-Sun): each shows day abbrev + 2-letter session-type code, a small state dot (done=green/active=blue) top-right, optional small pill below showing a logged workout/activity (e.g. "💪 5 liik." or "🏃 Juoksu")
├── #day-nudge (conditional amber banner — "this is a different day's program" warning, usually empty)
├── .stab-bar: "Treeni" (active) / "Kehitys" tabs
└── #session-content (filled by renderSession(), index.html:3173+)
    ├── .card "Päivän tyyppi" + .sess-picker (.sess-btn pills, one per session type, active one highlighted)
    └── EITHER: .card.rest-card (name+focus text, for a non-exercise/rest day)
        OR, per exercise in the day's program:
        └── .ex-block
            ├── .ex-block-header (gradient bg): exercise name (clickable → opens detail modal) + optional ✓ done-check + optional PR badge, sub-text (sets×reps target), right-aligned progress label+bar, optional "↓ Käytä edell." prefill button
            ├── .ex-set-table: .set-table-hdr (S / KG / TOISTOT / EDELL.) + one .set-table-row per set (set number+check, kg input, reps input, previous-value + optional 1RM readout)
            └── .ex-next-bar (only between exercises): "Seuraavaksi: <next exercise name>"
        …then a full-width .complete-btn: "Aloita treeni" or "Merkitse tehdyksi"/"Treeni tehty ✓"
```

**Render functions**: `renderTreeni()` (hero + day-tabs + week-nav) → calls `renderSession()` (session-type picker + exercise blocks). Both are large, monolithic template-string builders (not componentized) — see `components.md` for the individual CSS/HTML pieces reused elsewhere.

**Icons used**: none directly in this tab's own markup (icons live in the bottom nav/sidebar/Koonti, not on Sali's Treeni tab itself — the hero and exercise cards are text/number-driven, not icon-driven).

**State-driven visuals to preserve in mockups**: exercise-set rows change background tint based on `set-table-row.s-{undone|worse|same|better}` — a real, meaningful signal (comparing today's set to the previous session's same set) that any redesign needs to keep legible, not just decorative.
