# Personal AI Assistant — Technical Specification v0.3

A 24/7 autonomous agent system covering professional work, civic engagement, and personal projects — built on existing Hetzner + Supabase infrastructure.

> **v0.3 changes (from v0.2, originally drafted at `/Users/patrikfriis/Downloads/assistant-spec.md`):** resolved data-separation approach (new schema, not new project), confirmed a VPS upgrade as a hard prerequisite for the Ollama layer, added GitHub Copilot as a manually-selectable dev-task executor alongside two parallel Claude accounts, and clarified the GitHub integration flow for each executor. Moved to this repo's `docs/superpowers/specs/` per project convention — specs live here regardless of which repo the code eventually lands in (same pattern as Säleikkö's own specs).

---

## 01 · Vision

A unified assistant that operates continuously across three life domains, processes tasks overnight without supervision, and delivers results every morning via Telegram. During the day it acts as a responsive collaborator; at night it works through the task queue autonomously.

Human oversight is preserved through a single mandatory checkpoint: tasks must be manually promoted from `backlog` to `ready` before the agent picks them up. Everything else is autonomous.

> **Core principle:** The human decides *what* gets worked on. The agent decides *how* — and executes without interruption unless it hits a genuine blocker.

---

## 02 · Domains

| Domain | Description |
|--------|-------------|
| **COO** | Documents, analysis, translations, email drafts, meeting prep, strategy materials. Writes results back to Obsidian. |
| **DEV** | Coding hobby projects. Runs in isolated git worktrees. Opens PRs, never merges to main. |
| **POLITICS** | Routes into Säleikkö's existing skills — council minutes analysis, draft texts, position papers. Sensitive tasks use local model. |
| **MONITOR** | AI/tech news aggregation. Weekly digest prepared for NotebookLM → audio overview delivered via Telegram. |

---

## 03 · Architecture

**Three layers:**

- **Interfaces** — Telegram (primary), Claude Desktop MCP, Kanban web UI (Phase 2)
- **Orchestration** — Hetzner (existing box for now; upgraded plan required before the Ollama layer ships — see §06 and §09 Phase 3), Node.js / TypeScript, Supabase Realtime, Claude Code /schedule
- **Executors** — Claude API on two separate accounts (default; the second account exists specifically for dev-domain parallelism, not failover), Gemini API (long docs), GitHub Copilot coding agent (dev domain, manually selected per task), Ollama local (sensitive — requires the VPS upgrade above)

**Flow:**

Task created (Telegram / Claude Desktop MCP) → lands in `backlog` → human promotes to `ready`, and for dev tasks explicitly picks the executor (Claude or GitHub Copilot — see §06) → Supabase Realtime triggers a worker → agent picks up the task and executes → result written to `review` or `blocked` → Telegram notification delivered.

---

## 04 · Task Stages

| Stage | Description |
|-------|-------------|
| `backlog` | Created, not yet queued |
| `ready` ✓ | **Human checkpoint** — agent picks up from here |
| `in_progress` | Agent working |
| `review` | Done — awaiting human sign-off |
| `blocked` | Vague spec or hard blocker — note explains why |
| `done` | Approved and closed |

A task that is too vague to act on moves to `blocked` with an explanation rather than sitting silently in `in_progress`.

---

## 05 · Data Model

New `assistant` schema within the **existing** Supabase project — the same pattern the `saleikko` schema already uses, so this gets clean separation from Säleikkö's own tables without provisioning a second project.

```sql
assistant.tasks
  id               uuid primary key
  title            text
  description      text
  domain           text        -- coo | dev | politics | monitor
  stage            text        -- backlog | ready | in_progress | review | blocked | done
  priority         int         -- 1 (high) – 3 (low)
  created_by       text        -- manual | telegram | claude_desktop | agent
  assigned_model   text        -- claude | gemini | ollama | copilot | auto
                                -- "model" is used loosely here — for `copilot` this
                                -- names the executor (GitHub's coding agent), not an
                                -- LLM you're calling directly. For dev-domain tasks,
                                -- this is chosen manually at creation, never `auto`
                                -- (see §06) — auto-routing only applies to non-dev domains.
  context          jsonb       -- { files, urls, notes, obsidian_path, github_issue_url }
  result_summary   text
  artifacts        text[]      -- output file paths, PR urls, etc.
  repo             text        -- for dev tasks
  pr_url           text
  scheduled_for    timestamptz -- run at specific time, null = next nightly
  created_at       timestamptz
  updated_at       timestamptz

assistant.task_events
  id         uuid primary key
  task_id    uuid references assistant.tasks
  from_stage text
  to_stage   text
  model_used text        -- e.g. "claude-account-1", "claude-account-2", "copilot", "gemini", "ollama"
  agent_note text
  created_at timestamptz
```

`task_events.model_used` records which specific executor/account handled a task's run, rather than adding a dedicated column to `tasks` for it — the assignment (`assigned_model`) and the actual execution record (`model_used`) are kept separate so a retried task can show a different `model_used` per attempt without the source-of-truth `tasks` row changing.

---

## 06 · Model Routing

| Trigger | Executor | Rationale |
|---------|----------|-----------|
| Default / reasoning / writing (non-dev domains) | `claude-sonnet` | Primary model for COO, politics, monitor tasks — `auto` routing applies here |
| Dev task, Claude (default, manual choice) | `claude-sonnet`, account 1 or 2 | Two Claude accounts run concurrently — up to 2 dev tasks worked simultaneously per night. Which account picks up a given ready task is decided by the orchestrator at dispatch time (whichever is free), not part of the manual choice — the manual choice is only Claude-vs-Copilot |
| Dev task, manually assigned to Copilot | GitHub Copilot coding agent | Alternative dev-task executor, chosen explicitly at task creation — dispatched via GitHub issue assignment, not a direct API call (see §07) |
| Very long documents (>100k tokens) | `gemini-1.5-pro` | Long context window; also feeds NotebookLM pipeline |
| Tag: `confidential` | Ollama (local) | Politically sensitive drafts; nothing leaves Hetzner. **Blocked until the VPS upgrade in §09 Phase 3 ships** |
| Monitor / digest tasks | `gemini` → NotebookLM | Aggregation + audio overview generation |

Model is set per task in `assigned_model`. For COO/politics/monitor domains, the default is `auto`, which applies the rules above based on domain and tags. **Dev-domain tasks are always assigned manually** (Claude or Copilot) at task creation — there's no automatic routing between the two, by design (see §10 for why: predictability was prioritized over throughput for this decision).

---

## 07 · Integrations

### Telegram (existing)
- Create tasks: `/task [description]`
- Morning brief at configurable time (e.g. 07:00)
- Notification when task moves to `review` or `blocked`
- Approve / reject results inline

### M365 Graph API
- Calendar read → morning brief, auto-create prep tasks before meetings
- Email read → agent flags action items, proposes tasks
- Email send → always requires explicit Telegram approval before sending

### Obsidian (OneDrive)
- COO task results written back to vault as markdown notes
- Agent reads context files from vault when referenced in task description

### GitHub

**Claude-executed dev tasks** (default):
- Isolated worktree per task → commit → open PR
- Never pushes to main; PR link stored in `pr_url`

**Copilot-executed dev tasks** (manually assigned at task creation):
- Orchestrator creates a GitHub issue from the task's title/description and assigns it to Copilot's coding agent
- Issue URL stored in `context.github_issue_url`; orchestrator polls for the PR Copilot eventually opens on its own
- PR link stored in `pr_url` once available; the same "never merges to main" rule applies — Copilot's own agent mode already defaults to PR-only, this is just confirming it stays that way

### NotebookLM pipeline
- Weekly monitor task: Gemini aggregates AI/tech feeds into structured document
- Document pushed to NotebookLM → audio overview generated
- Delivered as Telegram voice message or link every Sunday

### Claude Desktop MCP
- Exposes `create_task` tool so Claude conversations can push tasks directly to Supabase
- Phase 1: Telegram is sufficient; MCP added in Phase 2

---

## 08 · Morning Brief

Delivered via Telegram at a configurable time. Contains:

- Overnight task results — what completed, what blocked and why
- Today's calendar — meetings with prep status
- Flagged emails — action items identified, drafts ready for review
- Politics monitoring — new council items or tracked topics
- Tasks requiring a decision before the agent can proceed

---

## 09 · Phased Rollout

### Phase 1 — October · Core infrastructure
- Supabase tables (`assistant` schema in the existing project)
- Telegram task commands
- Nightly loop for DEV tasks
- Two-Claude-account parallelism for DEV tasks
- GitHub Copilot as an alternative DEV-task executor (manual choice at task creation)
- Morning brief via Telegram
- Blocked state + notifications

### Phase 2 — November · COO domain
- M365 Graph API — calendar + email
- Document processing tasks
- Obsidian write-back
- Claude Desktop MCP
- Kanban web UI (Plane or custom)

### Phase 3 — December · Politics domain
- **VPS upgrade (RAM/CPU)** — hard prerequisite for local Ollama, sized once the model choice in §10 is settled
- Ollama local model for confidential tasks
- Säleikkö skills wired to task queue
- Council minutes auto-monitoring
- Draft texts to review queue

### Phase 4 — Q1 2027 · Monitoring + multi-model
- AI/tech digest pipeline
- NotebookLM audio summaries
- Full model routing logic
- Gemini long-doc integration

---

## 10 · Open Questions

1. **M365 Copilot API** — Does it expose an API for unattended execution? Needs investigation before it gets a real spec — likely Phase 3 or later.
2. **Kanban UI** — Build custom (full control, same TS stack) or use Plane (faster, self-hostable, has API)? Decision needed before Phase 2.
3. **Ollama model + VPS sizing** — Which local model for sensitive political tasks (Mistral or Llama 3 are the current candidates)? This also determines how big the Phase 3 VPS upgrade needs to be — benchmark on a trial box before committing to a plan size.
4. **Email send approval UX** — Inline Telegram button (approve/reject) or separate review flow?
5. **NotebookLM automation** — Can the audio generation step be triggered via API, or is it manual? Needs investigation.
