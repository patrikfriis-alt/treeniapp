# Kanban Repo Dropdown — Design

Replaces the free-text "Repo" input in the Kanban web UI's task form (`webui/src/components/TaskForm.tsx`)
with a dropdown, so creating/editing a `dev`-domain task doesn't require remembering/typing an exact
`owner/repo` string by hand.

## Design

A hardcoded `REPOS` list, matching the file's existing `DOMAINS` list convention exactly (same file,
same pattern — no backend change, no new API route):

```ts
const REPOS = [
  { value: "patrikfriis-alt/treeniapp", label: "treeniapp" },
  { value: "patrikfriis-alt/Unelma", label: "Unelma" },
];
```

Deduplicated by actual repo: `src/assistant/repos.ts`'s `"unelma"` and `"saleikko"` aliases both
resolve to `patrikfriis-alt/Unelma`, so the dropdown lists it once, not twice as two aliases would.

The repo field becomes a native `<select>` (matching the existing Priority field's style in this
same form, per the chosen approach — not chip buttons like Domain), still shown only when
`domain === "dev"` (condition unchanged), storing/sending the full `owner/repo` string as the
`value` — exactly what `POST /api/tasks` and `PATCH /api/tasks/:id` already expect, so the backend
needs zero changes.

An explicit placeholder first option (`<option value="">Select a repo</option>`) represents "not yet
chosen" — this matches the existing initial state (`repo` defaults to `initial?.repo ?? ""`,
unchanged) and gracefully handles editing a task whose stored `repo` value doesn't match either
known option exactly (e.g. a legacy/stray value): the select simply shows the placeholder rather than
silently defaulting to the first real option.

## Out of scope

- Any backend change (`src/webui/server.ts`'s create/update routes already accept a raw `repo`
  string and need nothing new).
- Exposing the repo list via an API endpoint — explicitly rejected in favor of hardcoding, matching
  the existing `DOMAINS` list's own precedent in this file.
- Any change to Telegram's `/task` repo-alias resolution (`src/assistant/repos.ts`) — untouched.
