# Claude Desktop MCP — Design

The last of Phase 2's originally-bundled sub-projects (`docs/superpowers/specs/2026-09-18-personal-assistant-design.md`,
§07/§09) to get built — a fourth interface to `assistant.tasks`, alongside Telegram and the Kanban
web UI (`unelmaboard.com`), reachable from a Claude Desktop conversation.

## Scope

The original spec (§07) scoped this down to a single `create_task` tool ("Claude conversations can
push tasks directly to Supabase"). This build goes further, matching the fuller interface already
built for the web UI: **create, list, promote, and retry** — not edit, not run-now, not the rest of
the Kanban UI's surface.

## Architecture

A **local** MCP server — the standard MCP pattern for a desktop client: Claude Desktop spawns it as
a local process over `stdio`, configured in Claude Desktop's own settings
(`claude_desktop_config.json`). It is a thin translator, not a new backend: every tool call becomes
an HTTPS request to the **already-existing** `https://unelmaboard.com/api/*` endpoints — the same
ones the Kanban web UI itself calls. No new server-side code, no new deployment, no new auth
mechanism to design; the existing username+password login, session cookie, and route-level
validation are reused as-is.

**Package:** a new `mcp-server/` subpackage in the Unelma repo, with its own `package.json` (matching
`webui/`'s existing precedent as a separate deployable artifact) — this one runs on the user's own
Mac, not the VPS. Built with the official `@modelcontextprotocol/sdk` (TypeScript).

**Credentials:** supplied via environment variables in Claude Desktop's own MCP server config
(`KANBAN_UI_URL`, `KANBAN_UI_USERNAME`, `KANBAN_UI_PASSWORD`) — the user edits that config file
themselves, the same way they've always managed this password directly on the VPS; Claude Code never
sees or handles it.

**Session handling:** the server logs in once on startup (`POST /api/auth/login`), holds the
resulting session cookie in memory for the process's lifetime, and re-authenticates automatically if
a call comes back `401` (covers the cookie's 30-day TTL expiring during a long-running Desktop
session, or the server process outliving a server-side restart that cleared its in-memory session
store — the same in-memory `SessionStore` gotcha already seen in this project).

## Tools

- **`create_task({title, description, domain, repo?, priority?})`** → `POST /api/tasks`. Mirrors the
  web UI's create form exactly — `repo` only meaningful for `domain: "dev"`, `priority` optional
  (server defaults to 2 if omitted, matching the existing route).
- **`list_tasks({domain?, stage?})`** → `GET /api/tasks`, then filtered client-side in the MCP
  server (the API returns the full task list with no query-param filtering, and adding
  server-side filtering isn't worth it for a personal task volume — filtering a few dozen JSON
  objects in memory is trivial).
- **`promote_task({id})`** → `POST /api/tasks/:id/promote`. For `dev`-domain tasks, hardcodes
  `executor: "claude"` in the request body, matching exactly what the web UI's `TaskDetail.tsx`
  already does (Copilot isn't functional yet, per existing project history).
- **`retry_task({id})`** → `POST /api/tasks/:id/retry`.

Each tool's error path surfaces the API's own error message (e.g. a 409 "cannot promote a task in
stage X") back through the MCP tool result, rather than a generic failure — matching how the web UI
already surfaces these same errors inline.

## Out of scope

- Editing tasks (`PATCH /api/tasks/:id`).
- Run Now (`POST /api/tasks/:id/run`).
- Any read beyond the task list itself (no per-task detail/history fetch, no SSE/realtime — this is
  a request/response tool interface, not a live view).
- Any change to the existing backend, auth system, or database schema — this is a pure client
  reusing what already exists.
