# Extractable components — Treeniapp

Menu of patterns worth extracting as reusable Superdesign DraftComponents for the Koonti + Sali mockup pass. Full source for each is in `components.md`/`layouts.md`.

## Layout Components (appear on most pages)

## BottomNav
- Source: index.html:1064-1077 (HTML) + :67-106 (CSS)
- Category: layout
- Description: Fixed bottom nav, 3 buttons (Koonti/Ruoka/Valikko-sidebar-toggle), blurred translucent background
- Extractable props: activeItem (string: "koonti" | "ruoka" | none, default "koonti")
- Hardcoded: icon names (home/utensils), labels, the "≡ Valikko" sidebar-toggle button (not a real nav destination)

## Sidebar
- Source: index.html:1530-1586
- Category: layout
- Description: Slide-out settings/navigation drawer, 4 labeled sections
- Extractable props: none needed for this mockup pass (not one of the 2 target screens)
- Hardcoded: all section labels and item lists

## Basic Components (used across pages)

## Card
- Source: index.html:127-136
- Category: basic
- Description: Generic rounded surface container with optional uppercase label
- Extractable props: title (string, optional)
- Hardcoded: none — fully generic

## StabBar (segmented tab control)
- Source: index.html:771-784
- Category: basic
- Description: 2-button (or more) equal-width tab toggle, active tab gets accent-tinted background
- Extractable props: items (array of {label, active}), onSelect
- Hardcoded: none — fully generic

## StatePill
- Source: index.html:818-820
- Category: basic
- Description: Small rounded status badge, 2 variants (active=blue, done=green)
- Extractable props: variant ("active" | "done"), label (string)
- Hardcoded: the two color variants only — no neutral/error variant exists yet

## StatTile (HeroMetric)
- Source: index.html:202-214 (CSS) + Koonti usage at :1097-1132
- Category: basic
- Description: Small icon+value+label tile, used in a 3-per-row grid on Koonti; optional thin progress-bar variant
- Extractable props: icon (name), iconColor, iconBg, value (string), label (string), progressPct (number, optional), clickable (boolean)
- Hardcoded: none — fully generic, reused 5× on Koonti with different icon/color/value per instance

## KoontiCard
- Source: index.html:344-375 (CSS) + :1140-1191 (usage)
- Category: basic
- Description: 2-column (or wide 1-column) dashboard link-card with icon, label, subtitle, optional goal text + progress bar, optional done/in-progress state coloring
- Extractable props: icon, iconColor, iconBg, label, subtitle, goalText (optional), progressPct (optional), state ("default" | "done" | "inprogress")
- Hardcoded: onclick navigation target (per-instance, not a generic prop for mockup purposes)

## HeroCard (Sali gradient hero)
- Source: index.html:160-199 (CSS) + Sali usage at :3062-3070
- Category: layout (page-specific hero, not reused elsewhere in current app — Koonti's equivalent visual weight comes from the StatTile grid instead, not a matching hero card)
- Description: Full-width gradient card (dark blue → accent blue radial glow) with day label, session name (large), focus text, optional 3-stat row, state pill, and a full-width translucent CTA button
- Extractable props: dayLabel, sessionName, focusText, stats (array of {val,label}, optional), statePill ("active"|"done"|none), ctaLabel, ctaState ("default"|"done")
- Hardcoded: the specific gradient colors (`#0d1b4b → #0a2a6e → #0a84ff`) and glow blob

## DayTabs
- Source: index.html:531-547 (CSS) + Sali usage at :3093-3134
- Category: basic
- Description: 7-button horizontal day-of-week strip with active/done/rest color states, small state-dot indicator, optional logged-activity mini-badge below each
- Extractable props: days (array of {label, code, state: "default"|"active"|"done"|"rest", dot: "active"|"done"|none, badge: string|none})
- Hardcoded: none — fully generic, but currently no responsive wrapping strategy for narrower viewports (`flex-wrap:wrap` exists but rarely triggers at phone width)

## SessPicker
- Source: index.html:483-490 + :813-814 (CSS, note: two separate `.sess-btn` rule blocks exist in the file — the second one at :813 appears to be the one actually governing render, both included in `components.md`) + Sali usage at :3211-3218
- Category: basic
- Description: Wrapping row of pill buttons for picking which program/session-type applies to a day
- Extractable props: options (array of {label, active}), onSelect
- Hardcoded: none — fully generic

## SetTableRow (+ SetTableHeader)
- Source: index.html:612-687 (CSS) + Sali usage at :3277-3303
- Category: basic — this is the app's single most important interactive widget (where all workout data entry happens)
- Description: 4-column grid row (set number+check, kg input, reps input, previous-value readout+optional 1RM), background-tinted by comparison-to-previous status (worse/same/better/undone)
- Extractable props: setNumber, kgValue, repsValue, previousText, oneRepMax (optional), status ("undone"|"worse"|"same"|"better"), disabled (boolean)
- Hardcoded: none — fully generic, but the 4 status-tint colors (red/amber/blue/green backgrounds) are load-bearing information, not decoration — must survive any redesign

## ExerciseBlockHeader
- Source: index.html:593-610 (CSS) + Sali usage at :3263-3276
- Category: basic
- Description: Gradient-header card top for one exercise: name (clickable, opens detail), done-check, optional PR badge, sub-text (target sets×reps), right-aligned progress label+thin-bar, optional "use previous" prefill button
- Extractable props: name, subText, doneCheck (boolean), prBadge (boolean), progressLabel, progressPct, showPrefillButton (boolean)
- Hardcoded: the exact gradient (`#0d1b4b, #0a2a6e`) — same family as HeroCard's gradient, reinforcing it as the app's one signature "highlight" gradient
