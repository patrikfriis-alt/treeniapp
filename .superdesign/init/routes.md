# Routes — Treeniapp

No router (SPA with no URL routing at all — it's a single `index.html` served flat). "Pages" are sibling `<div id="page-*" class="page">` elements, always in the DOM, toggled via `showPage(name, navBtnEl)` which sets `.active` on the target and clears it from the others, plus updates bottom-nav active state where applicable.

## Page list (index.html, in DOM order)

| id | Purpose | Entry point in nav |
|---|---|---|
| `page-koonti` | Dashboard/home — **mockup target #1** | Bottom nav (default active) |
| `page-sali` | Gym workout logging — **mockup target #2** | Koonti "Sali" card, or Sidebar "Ohjelma" area |
| `page-aerobia` | Cardio/running logging | Koonti "Aerobinen" card |
| `page-keho` | Body metrics + weight-loss forecast | Koonti "Keho" card |
| `page-uni` | Sleep | Koonti "Uni" card |
| `page-ohjelma` | Workout program editor | Sidebar |
| `page-valmentaja` | AI coach chat | Sidebar |
| `page-nakemykset` | Insights/analytics (weekly notes, forecast-accuracy chart) | Sidebar |
| `page-tilastot` | Food-log stats table (card/table toggle) | Sidebar |
| `page-ruoka` | Food logging | Bottom nav |

## Mockup targets

### `/koonti` (Koonti dashboard)
Entry: `#page-koonti` (index.html:1086-1198)
Renders via `renderKoonti()`-family functions (loads streak/weekly summary/motivation data async, fills in `koonti-*` ids). Full dependency tree in `pages.md`.

### `/sali` (Sali workout logging, "Treeni" tab)
Entry: `#page-sali` (index.html:1201-1269)
Renders via `renderTreeni()` → `renderSession()`. Full dependency tree in `pages.md`.
