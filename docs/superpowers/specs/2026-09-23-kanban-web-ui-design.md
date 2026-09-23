# Kanban Web UI — Technical Specification v0.1

The first piece of Phase 2 of the personal AI assistant (spec:
`docs/superpowers/specs/2026-09-18-personal-assistant-design.md`, §09) — a real web-based Kanban board
for the `assistant.tasks` board, replacing Telegram as the primary way to view and manage tasks
day-to-day.

> **Why split out of Phase 2:** Phase 2 as originally listed bundled five largely-independent pieces
> (M365 Graph API, document processing, Obsidian write-back, Claude Desktop MCP, Kanban web UI). Each
> has its own integration surface and design questions; building all five as one spec/plan repeats the
> mistake Phase 1 avoided by staying to one coherent domain (DEV execution). This spec covers only the
> Kanban UI — the other four pieces get their own spec when picked up.

---

## 01 · Purpose

Right now the only interface to the task board is Telegram commands (`/task`, `/tasks`, `/promote`).
That's fine for quick capture and notifications, but poor for actually *seeing* the board — comparing
tasks across stages, spotting what's stuck, reviewing a blocked task's full reason, or managing several
tasks at once. This ships a real web UI for that, while leaving Telegram's existing commands and
notifications untouched (both interfaces read/write the same `assistant.tasks`/`assistant.task_events`
tables).

---

## 02 · Architecture

- **Frontend:** React app with a build step (Vite), reached at `https://unelmaboard.com` (domain
  already registered). No other framework/library commitments beyond what a drag-and-drop Kanban needs
  (e.g. `dnd-kit`) — resolved at implementation time.
- **Backend:** new API routes added to the **existing `saleikko` Node service** (same process that
  already runs the Telegram bot and cron jobs) — not a new service, port, or deploy step. The built
  React app's static files are served from this same service.
- **Data access:** the frontend talks only to this new backend API, never directly to Supabase — the
  backend holds the service-role key server-side, same pattern the rest of the codebase already uses.
  This also means auth (§06) and the retry/promote logic live in one place, reusable by both Telegram
  and the web UI where they overlap (e.g. promoting a task).
- **Live updates:** the backend subscribes to Supabase Realtime for `assistant.tasks`/
  `assistant.task_events` changes and pushes them to connected browser clients (mechanism — WebSocket
  vs Server-Sent Events — resolved at implementation time; SSE is likely simpler given this is
  one-directional server→client push).
- **Hosting:** `unelmaboard.com`, HTTPS via Let's Encrypt (needs a reverse proxy in front of the Node
  process — e.g. Caddy or nginx with certbot — since Node doesn't terminate TLS itself in this stack
  today; exact choice resolved at implementation time).

---

## 03 · Data Model Changes

One addition to the existing `assistant.tasks` table (all other columns unchanged from Phase 1):

```sql
alter table assistant.tasks
  add column progress_status text;
```

Set by `executeDevTask` (`src/assistant/devExecutor.ts`) at meaningful phase boundaries while a task is
`in_progress`, so the UI can show a live sub-label instead of an opaque "In Progress":

| `progress_status` value | Meaning |
|---|---|
| `"cloning"` | `setUpTaskWorkspace` is running |
| `"running_claude"` | `runClaudeHeadless` is running |
| `"verifying_pr"` | `findPrForBranch` is running |
| `null` | Not in progress (backlog/ready/review/blocked/done), or in_progress but not yet past the first phase |

Cleared back to `null` whenever the task leaves `in_progress` (moves to `review` or `blocked`). No
change to `TaskStage`, `TaskDomain`, or `AssignedModel` — this is purely additive.

---

## 04 · Board Layout

Six columns, one per stage, always visible (no domain-scoped board splitting — domain is a filter, see
§05):

| Column | Backend stage | Notes |
|---|---|---|
| Backlog | `backlog` | |
| Ready | `ready` | |
| In Progress | `in_progress` | Card shows `progress_status` as a sub-label when set |
| Needs Attention | `review` | Relabeled in the UI only — backend stage name (`review`) is unchanged, this is purely a display string |
| Blocked | `blocked` | |
| Done | `done` | |

---

## 05 · Task Cards & Filtering

**Card content (compact style):**
- Title, domain badge, priority
- Repo + assigned executor (dev tasks)
- Relative time (e.g. "2h ago", based on `updated_at`)
- **Needs Attention cards:** inline PR number/link preview
- **Blocked cards:** inline truncated block-reason preview (from `result_summary`)

**Domain filter:** multi-select chips (COO / DEV / Politics / Monitor) above the board. Selection is
saved per-browser via `localStorage` and restored on load — no "all domains" reset each visit.

---

## 06 · Task Actions

**Create / edit** (new — Phase 1 only supported creation via Telegram):
- Fields: title, description, domain, repo (dev-domain tasks only), priority.
- **No executor field at creation** — matches the existing human-checkpoint design principle (what to
  work on vs. how/when it executes are separate decisions). New tasks land in `backlog`, same as
  `/task` today.

**Promote** (backlog → ready):
- Executor picker shows **only "Claude"** for now — Copilot is hidden entirely, not shown-disabled,
  since it's not functional on the current GitHub plan (see
  `project_personal_assistant_phase1_state.md` memory). Add it back to the picker whenever Copilot
  dispatch (Phase 1's deferred Tasks 14-15) actually ships.

**Retry** (blocked → backlog — new action, doesn't exist today):
- One action on a blocked task's detail view: moves it back to `backlog`, logs a `task_events` entry
  (`from_stage: "blocked"`, `to_stage: "backlog"`). Lets you edit the description first if that's what
  caused the block, then re-promote through the normal flow. Reuses the existing `/promote`-equivalent
  backend logic for the subsequent re-promotion — no new "retry directly to ready" path.

---

## 07 · Auth

Single shared password (set by you, not per-user accounts — this is a personal single-user tool).
Checked via a login form; session tracked via a cookie. No OAuth/magic-link (a prior attempt at
magic-link auth on treeniapp broke login and had to be reverted — avoiding that path here).

---

## 08 · Hosting & Domain

- Domain: `unelmaboard.com` (registered via Cloudflare Registrar, ~$10-12/year at-cost).
- HTTPS via Let's Encrypt, terminated by a reverse proxy in front of the existing `saleikko` process.
- DNS: point `unelmaboard.com` at the VPS's IP (`46.62.211.102`) — exact record type/setup at
  implementation time.

---

## 09 · Explicitly Out of Scope (v1)

- Copilot executor option in the UI (hidden until Phase 1's Tasks 14-15 are unblocked).
- Per-user accounts / multi-user access (single shared password only).
- Editing tasks that are `in_progress`, `review`, or `done` (only backlog/ready/blocked are
  editable/actionable from the UI in v1 — resolved as needed if it turns out to matter).
- Mobile-optimized layout (desktop-first; Telegram remains the fast mobile-friendly path for on-the-go
  task creation and notifications).
