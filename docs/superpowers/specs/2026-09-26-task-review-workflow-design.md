# Task Review Workflow — Design

Closes a real, confirmed gap: nothing anywhere in this codebase (not the web UI, not Telegram, not
any backend route) ever writes `stage: "done"`. Once a dev task reaches `review` ("Needs Attention"
in the Kanban UI), it has no path forward through any interface — the user can only review the PR on
GitHub directly, with the board never reflecting that. This adds a real human-review loop: approve
(merge the PR, mark done) or send back with feedback (agent revises the *same* PR, not a fresh one).

## New stage: `revising`

`TASK_STAGES` gains a new value, inserted conceptually between `review` and `in_progress`:
`["backlog", "ready", "in_progress", "review", "revising", "blocked", "done"]` (exact array order in
`src/types.ts` doesn't need to match this narrative order, just needs the new value present).

A `revising` task is functionally identical to a `ready` task for automated-execution purposes — it
must be treated as pickup-eligible everywhere `ready` currently is:
- The nightly scheduler's query (`src/scheduler/index.ts`) fetches `ready` **or** `revising` dev
  tasks assigned to Claude.
- The manual Run Now queue's eligibility check and its re-validation-before-dispatch check
  (`src/assistant/devTaskQueue.ts`) both accept `ready` **or** `revising`.
- The "Run Now" button's visibility condition (`webui/src/components/TaskDetail.tsx`) shows for
  `ready` **or** `revising` dev tasks.

Once picked up, a `revising` task follows the *exact same* `in_progress → review`/`blocked` lifecycle
a `ready` task does — `executeDevTask`'s existing `updateTaskStage(supabase, task, task.stage, {stage:
"in_progress"})` already uses `task.stage` generically as the "from" value, so no change is needed
there. `revising` exists purely so the board can distinguish "never started" from "agent needs to
address feedback" at a glance — a new Kanban column, not a new code path once execution begins.

**Migration:** `assistant.tasks`'s `stage` check constraint needs `revising` added — same
dashboard-SQL-editor workflow as every other migration in this project.

## Revision flow (Send Back)

1. On a `review`-stage task's detail view, clicking **Send Back** opens a required feedback text
   field (empty submission rejected — without new information, re-running the same task against the
   same PR would likely just repeat the same result).
2. On submit: `POST /api/tasks/:id/send-back` appends the feedback to `task.description` with a
   timestamp marker (so multiple rounds of feedback build a visible, permanent history in the
   description itself — no new column needed), and moves the task to `revising`.
3. When picked up (nightly or Run Now), `executeDevTask` checks `task.pr_url`:
   - **If set** (this is a revision): `setUpTaskWorkspace` checks out the **existing**
     `assistant/<taskId>` branch (`git fetch origin <branch> && git checkout <branch>`) instead of
     creating a new one via `checkout -b` — this is the fix for a real bug the existing "retry"
     action doesn't hit today (retry only applies to `blocked` tasks, which never successfully
     pushed a branch in the first place, so `checkout -b` was always safe there; a `revising` task
     genuinely has an existing remote branch, and colliding with it via a fresh `checkout -b` would
     be a real, previously-unencountered failure mode).
   - **If not set** (fresh task): unchanged, `checkout -b` as today.
   - `buildPrompt` branches the same way: a revision prompt says "this task already has an open pull
     request at `<pr_url>` on branch `assistant/<taskId>` — the user reviewed it and requested
     changes (see the latest notes in the description below); check out the existing branch, address
     the feedback, commit, and push to the **same** branch — do not open a new PR." A fresh-task
     prompt is unchanged from today's wording.
4. Same outcome as any dev task run: moves to `review` again (same `pr_url` — `findPrForBranch` finds
   the same PR, now updated with new commits) or `blocked` if the revision attempt itself fails.

## Approve flow

A new `POST /api/tasks/:id/approve` route: validates the task is `dev`-domain, `review`-stage, and
has a `pr_url`, then shells out to `gh pr merge <pr_url> --squash` (matching the existing `gh`-CLI
invocation style already used in `src/assistant/githubPr.ts`'s `findPrForBranch` — no need to clone
anything, since `gh pr merge` works given just a PR URL and the saleikko user's already-configured
global `gh` auth). Squash merge specifically, per the chosen strategy — one clean commit on `main`
per task regardless of how many commits accumulated across revision rounds.

- **On success:** `stage → done`.
- **On failure** (merge conflict, failing required checks, branch protection rejection): task stays
  in `review`, the `gh` error message is surfaced back to the user — never blindly marks `done` on a
  failed merge.

## Review card messaging

`TaskDetail.tsx` for `review`-stage tasks gains:
- A clear header framing what's being asked ("Ready for your review" or similar — exact copy is an
  implementation detail, not a design decision).
- Claude's own `result_summary` for this run — **currently only ever shown for `blocked` tasks**;
  extending it to also show for `review` tasks surfaces Claude's own account of what it did, which is
  valuable context that already exists in the data but isn't currently displayed here.
- The PR link (already shown today, unchanged).
- Two actions: **Approve & Merge**, **Send Back** (reveals the required feedback field described
  above).

A `revising`-stage task's detail view shows the feedback that was given (visible as part of the
updated description) and, once picked up, behaves identically to an `in_progress` task's live
`progress_status` display — no new UI concept needed there, reusing what already exists.

## Out of scope

- Any change to how a *fresh* (non-revision) task's workspace/branch/prompt behaves — untouched.
- Editing the merge strategy per-task (always squash, no per-task override).
- Any notification/Telegram-specific change beyond what already generically works (`/tasks revising`
  already works today with zero code change, since `/tasks <stage>` validates against `TASK_STAGES`
  generically).
- Multiple pending revision rounds queued at once beyond what the existing single-task lifecycle
  already handles — a task is either `revising` (waiting), `in_progress` (being revised), or
  `review`/`blocked` (done revising) at any one time, same one-task-one-state model as today.
