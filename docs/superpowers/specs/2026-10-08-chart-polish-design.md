# Chart polish — one visual system for all 9 charts (main)

**Status:** approved in chat 2026-10-08 (parts 1 and 2; steps as bars). Target: **main**.
Later merged into beta with the other main features.

## Goal

All charts look like one app and never misrepresent the data: one shared style, Finnish date and
number formats, no overshooting curves, no dual axes, goal/reference lines where the app knows a
goal.

## Findings this fixes (from screenshots of real data, 2026-10-08)

- Every chart picks its own colours (purple, blue, cyan, green, orange), point sizes and widths.
- Three date formats ("08-20", "10-08", "2026-09-03"); none Finnish. Thousands as "16,000".
- `tension: .3` makes lines overshoot the data (exercise chart dips below the lowest lift; steps
  dip below the lowest day).
- Body chart: kg and % on two y-axes (dual axis).
- Forecast: actual and forecast lines are disconnected; target weight not shown.
- Sleep: y-axis from 0 squashes 55–100 scores; tilted, crowded date labels.
- Steps: goal (10 000) not shown.

## Part 1 — shared visual system

### Palette (validated)

Computed with the dataviz skill's `validate_palette.js --mode dark --surface #121214` — all
checks pass (lightness band 0.48–0.67, chroma, CVD ΔE 17.5 worst adjacent, normal-vision 23.2,
contrast ≥ 3:1):

| Slot | Colour | Use |
|---|---|---|
| 1 | `#10a2b0` (app cyan, toned for dark surface) | every single-series chart; first series |
| 2 | `#c98500` (app amber, toned) | second series |
| 3 | `#9085e9` (violet) | reserve |
| ref | `#8a8a93` dashed | goal / target reference lines |

Green (`--green`) and red (`--red`) stay reserved for done/warning status and are not chart
series colours.

### Rules (all charts)

- One shared module of helpers in index.html (`CHART_COLORS`, `fmtNum`, `fmtDayShort`,
  `fmtDayLong`, `baseChartOptions(...)`, `lineDataset(...)`, `referenceLineDataset(...)`); every
  chart builds its options from it.
- Lines 2 px, `cubicInterpolationMode: 'monotone'` (curved but never past the data) — no `tension`.
- Points radius 3 on sparse series (≤ 20 points); on dense series radius 0 with hover radius 5.
- Axes: tick text `#8a8a93` at the app's `--fs-2xs`, grid `rgba(255,255,255,0.06)`, no x grid,
  x labels never rotated (`maxRotation: 0`, `autoSkip`, `maxTicksLimit` ~6).
- Dates: axis "8.10."; tooltip title "ke 8.10.2026" (fi-FI weekday short + date).
- Numbers: `Intl.NumberFormat('fi-FI')` — "16 000", "110,5"; units in ticks/tooltips.
- Tooltip: same look everywhere, title = date, body = value + unit.
- Legend only when ≥ 2 data series (point-style circles, text in muted ink, never series colour).
- Reference lines: dashed `#8a8a93`, 1.5 px, labelled in the tooltip/legend as e.g. "Tavoite".

## Part 2 — per chart

1. **Body — weight (kg)** (`body-chart`): weekly values + faded individual-measurement dots (as in
   v1.41.0) in slot 1; dashed target-weight line if `user_profile.target_weight_kg` is set.
2. **Body — composition (%)** (new canvas under the weight chart): fat% slot 1, muscle% slot 2,
   one % axis, legend; same week labels as the weight chart. Existing caption kept under both.
   Replaces the dual-axis chart.
3. **Forecast** (`forecast-chart`): forecast line starts at the latest actual measurement point
   (continuous); actual solid slot 1, forecast dashed slot 2, target weight reference line.
4. **Sleep** (`sleep-chart`): y-axis fitted to data (min ≈ floor of data min − 5, max 100),
   dense-series points, unrotated dates.
5. **Steps** (`steps-chart`, modal): **bars** in slot 1, bars on goal-reaching days at full
   opacity and others at reduced opacity, dashed goal line at `app_settings.daily_steps_goal`
   (fallback 10 000 as today).
6. **Exercise progress** (`ex-chart`, Sali → Kehitys) and 7. **exercise modal**
   (`ex-modal-chart`): shared style, Finnish dates, monotone line.
8. **Run/walk** (`run-chart`): slot 1 instead of orange; pace keeps the reversed axis, axis
   title "min/km".
9. **Insights** — sleep vs tonnage scatter (`sleep-tonnage-chart`): shared style + Finnish
   numbers; forecast accuracy (`forecast-accuracy-chart`): predicted slot 1, actual slot 2.

## Not changing

What each chart measures and where it lives; data queries (except the forecast's continuity point,
which reuses data already loaded); the v1.41.0 weekly-value logic.

## Testing

Main uses the real database — no test may write to it (all non-GET Supabase requests
intercepted). Before/after screenshots of all 9 charts with real data; edge cases with injected
data in the test browser: no data, one point, a goal reached / not reached. Syntax check of the
inline script; `node scripts/test-catchup.mjs` still passes. index.html keeps CRLF line endings.
