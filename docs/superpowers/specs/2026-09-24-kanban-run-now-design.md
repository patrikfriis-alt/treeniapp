# Kanban "Run Now" — Design

A manual trigger for a `ready` dev task in the Kanban web UI (`unelmaboard.com`), so a task doesn't
have to wait for the nightly cron batch (`src/scheduler/index.ts`, fires once at a fixed hour) to
start executing.

## Problem

The web UI currently has Promote (`backlog` → `ready`) and Retry (`blocked` → `backlog`), but nothing
actually *starts* execution — that only ever happens via the nightly job. A user who wants a task
worked on right now has no way to do that from the UI.

## Concurrency

`executeDevTask` (`src/assistant/devExecutor.ts`) writes `stage: "in_progress"` as its very first
action, with no atomic guard against two callers picking up the same or different tasks at once. A
naive "run now" button would create a real double-dispatch race against the nightly job or another
manual click.

**Decision:** at most one dev task executes at a time, regardless of source (nightly batch or manual
trigger) — checked fresh against the database (`stage = 'in_progress' AND domain = 'dev'`), not an
in-memory flag, since the nightly job's own concurrency is entirely separate from this feature and
must still be correctly detected as "busy."

Rather than rejecting a "Run Now" click outright when something's already running, it's **queued**
and picked up automatically once the gate clears — no need to remember to click it again, and no
cancel action (keeps v1 simple).

## Architecture

**`src/assistant/devTaskQueue.ts`** (new): `createDevTaskQueue({assistantSupabase, claudeOauthToken,
workspaceBaseDir, bot, allowedUserId})` returns `{enqueue(taskId): Promise<"started" | "queued" |
"not_found" | "not_eligible">}`.

Internally:
- An in-memory array of pending task IDs (this is a single-process Node service — no external queue
  infra needed).
- `enqueue(taskId)`: fetches the task fresh, rejects with `"not_found"` / `"not_eligible"` (not
  `stage === "ready"`, not `domain === "dev"`, or not `assigned_model === "claude"`) before queuing
  anything. Otherwise adds the id to the queue (no-op if already present — a double-click doesn't
  double-queue) and immediately attempts `processNext()`.
- `processNext()`: checks the DB fresh for any `dev` task in `in_progress`. If busy, does nothing
  (the poll timer or the next `executeDevTask` completion will retry). If clear, pops the next queued
  id, **re-fetches it fresh** (it may have changed while waiting — e.g. edited or retried elsewhere)
  and re-validates `stage === "ready"` before dispatching; if it's no longer eligible, skips it and
  recurses to the next queued item instead. Dispatches via the existing `executeDevTask`, always using
  account 1's OAuth token (manual runs don't get their own account — they wait for account 1's slot
  like everything else). On completion (success or failure — `executeDevTask` already has its own
  internal catch-all that marks the task blocked rather than throwing; this is a second safety layer
  in case that ever fails too), calls `processNext()` again to chain to whatever's queued next.
- A 30-second poll timer calls `processNext()` unconditionally (harmless no-op when the queue is
  empty or the gate is still busy) — this is what catches the case where the *nightly* job, not
  another manual run, is what's holding the gate, since the queue has no direct visibility into the
  scheduler's own batch loop.

**Route:** `POST /api/tasks/:id/run` (auth-gated, alongside the existing `/promote` and `/retry`
routes in `src/webui/server.ts`). Calls `deps.devTaskQueue.enqueue(id)`; `"not_found"` → 404,
`"not_eligible"` → 409 with a message explaining only ready dev tasks assigned to Claude can be run
now, otherwise `200 {ok: true, status: "started" | "queued"}`.

**Wiring:** `src/index.ts` constructs the queue once at startup, reusing the same
`config.claudeAccount1OauthToken`, `config.assistantWorkspaceBaseDir`, `bot`, and
`config.telegramAllowedUserId` already passed to `scheduleJobs` — then adds it to the
`createWebServer({...})` deps object. The route itself never touches Claude accounts, workspace
paths, or the bot directly; that's entirely the queue module's concern.

**Frontend:** a "Run Now" button on `TaskDetail.tsx`, shown alongside the existing Promote button for
tasks in `ready` stage with `domain === "dev"`. Clicking it calls the new `api.runTask(id)` and then
`onDone()` — identical behavior to Promote/Retry (closes the detail overlay, refetches). No separate
"queued" indicator: a queued task just stays visibly in the Ready column until it actually starts, at
which point the existing realtime `progress_status` sub-label under "In Progress" shows it running,
same as any nightly-triggered task — the existing SSE/realtime plumbing already covers this, nothing
new needed there.

## Out of scope

- Cancelling a queued (not yet started) manual run.
- Showing queue position or an explicit "queued" UI state.
- Letting a manual run use the 2nd Claude account for extra throughput — always serialized to one
  dev task at a time, regardless of source.
- Any change to the nightly job's own existing 2-account batching logic — untouched by this feature.
