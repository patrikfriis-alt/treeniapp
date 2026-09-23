# Kanban Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Kanban web UI (spec: `docs/superpowers/specs/2026-09-23-kanban-web-ui-design.md`) — a
password-protected React board at `unelmaboard.com` for viewing/managing `assistant.tasks`, backed by
new API routes added to the existing `saleikko` Node service, with live updates via Supabase Realtime.

**Architecture:** Backend: new Express app (added as a dependency — the existing raw `node:http` health
server doesn't scale to 8+ routes, auth, and static file serving without a lot of hand-rolled routing)
replaces `createHealthServer`, mounted in the same `saleikko` process/port. It exposes `/health`
(unchanged contract), `/api/auth/*`, `/api/tasks/*`, `/api/tasks/stream` (SSE), and serves the built
React app's static files. Frontend: a separate `webui/` package (Vite + React + TS) built independently
and deployed alongside the backend. Auth: single shared password, in-memory session store, httpOnly
cookie. Realtime: one shared Supabase Realtime subscription server-side, broadcast to connected SSE
clients.

**Interaction design:** built per this environment's `apple-design` personal skill (fluid, physical
motion translated for the web — instant press feedback, direct 1:1 pointer tracking, interruptible
velocity-aware springs, momentum, rubber-banding, translucent materials). This governs every
interactive surface, but the one place it becomes real *architecture* rather than styling is card
drag-and-drop (Tasks 21-23): cards are freely draggable to any column for the physical feel, but only
two column-boundaries are real backend transitions (Blocked→Backlog retry, Backlog→Ready promote) — a
drop anywhere else rubber-bands back to origin rather than silently failing or doing nothing.

**Tech Stack:** TypeScript, Express (new dependency), `cookie-parser`, React 18, Vite, `@testing-library/react`,
`motion` (spring physics + velocity-aware animation for drag — chosen over `dnd-kit` because this needs
direct control of interruptible, velocity-handoff spring animation that generic DnD libraries don't
expose; confirmed at Task 22), existing `@supabase/supabase-js`/Vitest.

Repo: `/Users/patrikfriis/Projects/Unelma`. Spec: `docs/superpowers/specs/2026-09-23-kanban-web-ui-design.md`
(this repo, `treeniapp`, per project convention).

**A note on things this plan cannot fully pin down in advance:** (1) Supabase Realtime, by default,
only publishes changes for tables in the `public` schema — `assistant.tasks`/`assistant.task_events`
need to be explicitly added to the `supabase_realtime` publication via the dashboard SQL editor before
Task 11's subscription can receive anything; this plan gives the exact SQL but its actual effect can
only be confirmed against the real Supabase project. (2) `unelmaboard.com` is Cloudflare-proxied (not
DNS-only) with TLS in Full (strict) mode via a Cloudflare Origin CA cert on the VPS, decided during
implementation (Task 24) specifically to unlock free-tier WAF geo-blocking/rate-limiting — nothing in
Tasks 1-23 depends on this, and it's mentioned here only because it's a real infra decision made
outside the original spec, tracked alongside its own backlog task. (3) The exact spring
`damping`/`response` values in Tasks 21-23 are
this plan's best-effort translation of the `apple-design` skill's guidance (critically damped for
commits, slight bounce only on momentum-driven rejects) — treat them as a starting point to feel out
and tune during implementation, not a value copied from a source that measured this exact interaction.

---

## Part A — Backend (Tasks 1-12)

### Task 1: `progress_status` column and type

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `src/types.ts`

- [ ] **Step 1: Add the column to `schema.sql`**

Append after the existing `assistant.tasks` table definition:

```sql
alter table assistant.tasks
  add column progress_status text;
```

- [ ] **Step 2: Add the field to `AssistantTask`**

In `src/types.ts`, add to the `AssistantTask` interface (after `stage`):

```ts
  progress_status: string | null;
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`
Expected: existing tests fail to compile only if some test builds an `AssistantTask` literal missing
`progress_status` — fix each by adding `progress_status: null` to the fixture object. Grep first:
`grep -rln "domain: \"dev\"" src/` to find every test fixture that constructs a full `AssistantTask`.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add supabase/schema.sql src/types.ts $(git diff --name-only)
git commit -m "feat: add progress_status column for live in-progress sub-status"
```

---

### Task 2: `devExecutor.ts` writes `progress_status` at each phase

**Files:**
- Modify: `src/assistant/devExecutor.ts`
- Modify: `src/assistant/devExecutor.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `devExecutor.test.ts` (read the current file first — it mocks `supabase.from("tasks").update`
via a shared `update` mock; these tests assert on additional calls to that same mock):

```ts
it("sets progress_status to cloning, then running_claude, then verifying_pr as it advances", async () => {
  const { runClaudeHeadless } = await import("./claudeCli.js");
  const { findPrForBranch } = await import("./githubPr.js");
  (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true, exitCode: 0, stdout: "done", stderr: "",
  });
  (findPrForBranch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    "https://github.com/patrikfriis-alt/treeniapp/pull/1",
  );
  const { supabase, update } = makeSupabaseMock();

  await executeDevTask(supabase, TASK, {
    claudeOauthToken: "test-oauth-token-account-1",
    workspaceBaseDir: "/opt/assistant-work",
    bot: { api: { sendMessage: vi.fn() } } as any,
    allowedUserId: 123456,
  });

  const progressUpdates = update.mock.calls
    .map((call) => (call[0] as Record<string, unknown>).progress_status)
    .filter((v) => v !== undefined);
  expect(progressUpdates).toEqual(["cloning", "running_claude", "verifying_pr"]);
});

it("clears progress_status to null when the task moves to blocked", async () => {
  const { runClaudeHeadless } = await import("./claudeCli.js");
  (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: false, exitCode: 1, stdout: "", stderr: "boom",
  });
  const { supabase, update } = makeSupabaseMock();

  await executeDevTask(supabase, TASK, {
    claudeOauthToken: "test-oauth-token-account-1",
    workspaceBaseDir: "/opt/assistant-work",
    bot: { api: { sendMessage: vi.fn() } } as any,
    allowedUserId: 123456,
  });

  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ stage: "blocked", progress_status: null }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/devExecutor.test.ts`
Expected: both new tests FAIL (no `progress_status` writes exist yet).

- [ ] **Step 3: Implement**

In `devExecutor.ts`, add a small helper below `updateTaskStage`:

```ts
async function setProgressStatus(
  supabase: AssistantClient,
  taskId: string,
  status: "cloning" | "running_claude" | "verifying_pr",
): Promise<void> {
  const { error } = await supabase.from("tasks").update({ progress_status: status }).eq("id", taskId);
  if (error) {
    console.error(`executeDevTask: failed to set progress_status for ${taskId}: ${error.message}`);
  }
}
```

Call it at the three phase boundaries inside `executeDevTask`'s `try` block:

```ts
  try {
    await setProgressStatus(supabase, task.id, "cloning");
    workDir = await setUpTaskWorkspace({ ... }); // unchanged

    await setProgressStatus(supabase, task.id, "running_claude");
    const result = await runClaudeHeadless({ ... }); // unchanged

    if (!result.success) {
      const message = `Claude epäonnistui: ${result.stderr}`.slice(0, 2000);
      await updateTaskStage(supabase, task, "in_progress", { stage: "blocked", progress_status: null, result_summary: message });
      // ... unchanged
    }

    await setProgressStatus(supabase, task.id, "verifying_pr");
    const prUrl = await findPrForBranch({ ... }); // unchanged

    if (!prUrl) {
      // ... add progress_status: null to this updateTaskStage call's fields too
    }

    await updateTaskStage(supabase, task, "in_progress", {
      stage: "review",
      pr_url: prUrl,
      progress_status: null,
      result_summary: result.stdout.slice(0, 2000),
    });
```

Also add `progress_status: null` to the outer `catch` block's `updateTaskStage` call (the
"Odottamaton virhe" branch) — every path that leaves `in_progress` must clear it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/devExecutor.test.ts`
Expected: PASS (existing tests + 2 new)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/devExecutor.ts src/assistant/devExecutor.test.ts
git commit -m "feat: write progress_status at each dev-task execution phase"
```

---

### Task 3: Password auth — session store, login, logout

**Files:**
- Create: `src/webui/auth.ts`
- Create: `src/webui/auth.test.ts`
- Modify: `src/config.ts`

A single shared password (spec §07) — no per-user accounts. Sessions are an in-memory token store
(fine for a single-process, single-user service); the password itself is never stored, only compared.

- [ ] **Step 1: Add the config field**

In `src/config.ts`, add to `Config`:

```ts
  kanbanUiPassword: string;
```

Add to `loadConfig()`:

```ts
    kanbanUiPassword: requireEnv("KANBAN_UI_PASSWORD"),
```

- [ ] **Step 2: Write the failing test**

```ts
// src/webui/auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionStore, checkPassword } from "./auth.js";

describe("checkPassword", () => {
  it("returns true for a matching password", () => {
    expect(checkPassword("correct-horse", "correct-horse")).toBe(true);
  });

  it("returns false for a non-matching password", () => {
    expect(checkPassword("correct-horse", "wrong")).toBe(false);
  });

  it("returns false for passwords of different length without throwing", () => {
    // timingSafeEqual throws on length mismatch if used directly on raw
    // strings - checkPassword must hash first to a fixed length so this
    // never throws.
    expect(() => checkPassword("short", "a-much-longer-password")).not.toThrow();
    expect(checkPassword("short", "a-much-longer-password")).toBe(false);
  });
});

describe("createSessionStore", () => {
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    store = createSessionStore();
  });

  it("issues a token that validates as a live session", () => {
    const token = store.create();
    expect(store.isValid(token)).toBe(true);
  });

  it("treats an unknown token as invalid", () => {
    expect(store.isValid("nonexistent-token")).toBe(false);
  });

  it("invalidates a token after destroy() is called", () => {
    const token = store.create();
    store.destroy(token);
    expect(store.isValid(token)).toBe(false);
  });

  it("expires a session after the configured TTL", () => {
    vi.useFakeTimers();
    const shortStore = createSessionStore({ ttlMs: 1000 });
    const token = shortStore.create();
    expect(shortStore.isValid(token)).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(shortStore.isValid(token)).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/auth.test.ts`
Expected: FAIL — `Cannot find module './auth.js'`.

- [ ] **Step 4: Implement `auth.ts`**

```ts
// src/webui/auth.ts
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export function checkPassword(expected: string, provided: string): boolean {
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionStoreOptions {
  ttlMs?: number;
}

export function createSessionStore(options: SessionStoreOptions = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const sessions = new Map<string, number>(); // token -> expiresAt (epoch ms)

  return {
    create(): string {
      const token = randomUUID();
      sessions.set(token, Date.now() + ttlMs);
      return token;
    },
    isValid(token: string): boolean {
      const expiresAt = sessions.get(token);
      if (expiresAt === undefined) return false;
      if (Date.now() > expiresAt) {
        sessions.delete(token);
        return false;
      }
      return true;
    },
    destroy(token: string): void {
      sessions.delete(token);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/auth.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/auth.ts src/webui/auth.test.ts src/config.ts src/config.test.ts
git commit -m "feat: add password check and in-memory session store for the web UI"
```

(If `config.test.ts` needed a `KANBAN_UI_PASSWORD` fixture addition, include that file in the commit too
— follow the exact same pattern used for every other required-field addition earlier in this project.)

---

### Task 4: Express app skeleton + auth routes + auth middleware

**Files:**
- Create: `src/webui/server.ts`
- Create: `src/webui/server.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add dependencies**

```bash
cd /Users/patrikfriis/Projects/Unelma
npm install express cookie-parser
npm install --save-dev @types/express @types/cookie-parser supertest @types/supertest
```

`supertest` is for testing Express routes without binding a real port.

- [ ] **Step 2: Write the failing tests**

```ts
// src/webui/server.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createWebServer } from "./server.js";
import { createSessionStore } from "./auth.js";

function makeApp(password = "test-password") {
  const sessions = createSessionStore();
  const app = createWebServer({ kanbanUiPassword: password, sessions, staticDir: null });
  return { app, sessions };
}

describe("GET /health", () => {
  it("returns 200 ok without authentication", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});

describe("POST /api/auth/login", () => {
  it("sets a session cookie on correct password", async () => {
    const { app } = makeApp("correct-horse");
    const res = await request(app).post("/api/auth/login").send({ password: "correct-horse" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toContain("kanban_session=");
  });

  it("returns 401 on wrong password, no cookie set", async () => {
    const { app } = makeApp("correct-horse");
    const res = await request(app).post("/api/auth/login").send({ password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session so it's no longer valid", async () => {
    const { app, sessions } = makeApp("correct-horse");
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ password: "correct-horse" });
    await agent.post("/api/auth/logout");
    // A protected route should now reject this agent's cookie.
    const res = await agent.get("/api/tasks");
    expect(res.status).toBe(401);
  });
});

describe("auth middleware on /api/tasks", () => {
  it("rejects requests with no session cookie", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid session cookie", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/tasks").set("Cookie", "kanban_session=not-a-real-token");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`
Expected: FAIL — `Cannot find module './server.js'`.

- [ ] **Step 4: Implement `server.ts` (this task's slice: skeleton + `/health` + auth routes/middleware only — task routes are stubbed 401-free placeholders filled in by Tasks 5-10)**

```ts
// src/webui/server.ts
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { checkPassword, type SessionStore } from "./auth.js";

const SESSION_COOKIE = "kanban_session";

export interface WebServerDeps {
  kanbanUiPassword: string;
  sessions: SessionStore;
  staticDir: string | null; // null in tests; a real path in production (Task 12 wires the real value)
}

function requireAuth(sessions: SessionStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || !sessions.isValid(token)) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    next();
  };
}

export function createWebServer(deps: WebServerDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!checkPassword(deps.kanbanUiPassword, password)) {
      res.status(401).json({ error: "invalid password" });
      return;
    }
    const token = deps.sessions.create();
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.status(200).json({ ok: true });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") {
      deps.sessions.destroy(token);
    }
    res.clearCookie(SESSION_COOKIE);
    res.status(200).json({ ok: true });
  });

  const auth = requireAuth(deps.sessions);

  // Task-router placeholder - Tasks 5-10 replace this with real handlers.
  app.get("/api/tasks", auth, (_req, res) => {
    res.status(501).json({ error: "not implemented yet" });
  });

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(deps.staticDir!, "index.html"));
    });
  }

  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts package.json package-lock.json
git commit -m "feat: add Express app skeleton with password auth and session middleware"
```

---

### Task 5: `GET /api/tasks` — list all tasks

**Files:**
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`
- Modify: `src/index.ts` (deferred to Task 12 — not this task)

Domain filtering happens client-side (spec §05 — the board is small enough that fetching everything and
filtering in React is simpler than a query-param API). This route just returns every task, newest
`updated_at` first.

- [ ] **Step 1: Write the failing test**

```ts
describe("GET /api/tasks", () => {
  it("returns all tasks when authenticated", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const select = vi.fn(() => ({
      order: vi.fn(() =>
        Promise.resolve({
          data: [{ id: "task-1", title: "Do a thing", stage: "backlog" }],
          error: null,
        }),
      ),
    }));
    const assistantSupabase = { from: vi.fn(() => ({ select })) } as any;
    const app = createWebServer({
      kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase,
    });

    const res = await request(app).get("/api/tasks").set("Cookie", `kanban_session=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "task-1", title: "Do a thing", stage: "backlog" }]);
    expect(select).toHaveBeenCalledWith("*");
  });

  it("returns 502 with a clear error when the Supabase query fails", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const select = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({ data: null, error: { message: "db down" } })),
    }));
    const assistantSupabase = { from: vi.fn(() => ({ select })) } as any;
    const app = createWebServer({
      kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase,
    });

    const res = await request(app).get("/api/tasks").set("Cookie", `kanban_session=${token}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("db down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`
Expected: FAIL — the placeholder route returns 501, not real data.

- [ ] **Step 3: Implement**

Add `assistantSupabase: AssistantClient` to `WebServerDeps` (import `type { AssistantClient } from "../supabase/assistantClient.js"`). Replace the placeholder route:

```ts
  app.get("/api/tasks", auth, async (_req: Request, res: Response) => {
    const { data, error } = await deps.assistantSupabase
      .from("tasks")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      res.status(502).json({ error: `Failed to load tasks: ${error.message}` });
      return;
    }
    res.status(200).json(data);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add GET /api/tasks listing all tasks"
```

---

### Task 6: `GET /api/tasks/:id` — task detail with event history

**Files:**
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("GET /api/tasks/:id", () => {
  it("returns the task plus its task_events history", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const taskSingle = vi.fn(() =>
      Promise.resolve({ data: { id: "task-1", title: "Do a thing" }, error: null }),
    );
    const taskEq = vi.fn(() => ({ single: taskSingle }));
    const eventsOrder = vi.fn(() =>
      Promise.resolve({ data: [{ from_stage: "backlog", to_stage: "ready" }], error: null }),
    );
    const eventsEq = vi.fn(() => ({ order: eventsOrder }));
    const assistantSupabase = {
      from: vi.fn((table: string) => {
        if (table === "tasks") return { select: vi.fn(() => ({ eq: taskEq })) };
        if (table === "task_events") return { select: vi.fn(() => ({ eq: eventsEq })) };
        throw new Error(`unexpected table ${table}`);
      }),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app).get("/api/tasks/task-1").set("Cookie", `kanban_session=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      task: { id: "task-1", title: "Do a thing" },
      events: [{ from_stage: "backlog", to_stage: "ready" }],
    });
  });

  it("returns 404 when the task doesn't exist", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const taskSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: "no rows" } }));
    const assistantSupabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: taskSingle })) })) })),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app).get("/api/tasks/missing").set("Cookie", `kanban_session=${token}`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 3: Implement**

```ts
  app.get("/api/tasks/:id", auth, async (req: Request, res: Response) => {
    const { data: task, error: taskError } = await deps.assistantSupabase
      .from("tasks")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (taskError || !task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const { data: events, error: eventsError } = await deps.assistantSupabase
      .from("task_events")
      .select("*")
      .eq("task_id", req.params.id)
      .order("created_at", { ascending: true });
    if (eventsError) {
      res.status(502).json({ error: `Failed to load task history: ${eventsError.message}` });
      return;
    }
    res.status(200).json({ task, events });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add GET /api/tasks/:id with task_events history"
```

---

### Task 7: `POST /api/tasks` — create

**Files:**
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`

Reuses `resolveRepoAlias`-free direct repo values (the web form's repo dropdown, per spec §06, posts the
already-resolved `owner/repo` string directly — no alias resolution needed here, unlike Telegram's
`/task`).

- [ ] **Step 1: Write the failing tests**

```ts
describe("POST /api/tasks", () => {
  it("creates a task in backlog", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const assistantSupabase = { from: vi.fn(() => ({ insert })) } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks")
      .set("Cookie", `kanban_session=${token}`)
      .send({
        title: "Add dark mode",
        description: "Add a toggle in settings",
        domain: "dev",
        repo: "patrikfriis-alt/treeniapp",
        priority: 2,
      });

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Add dark mode",
        description: "Add a toggle in settings",
        domain: "dev",
        repo: "patrikfriis-alt/treeniapp",
        priority: 2,
        stage: "backlog",
        created_by: "manual",
      }),
    );
  });

  it("rejects a dev-domain task with no repo", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const assistantSupabase = { from: vi.fn() } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks")
      .set("Cookie", `kanban_session=${token}`)
      .send({ title: "x", description: "y", domain: "dev", priority: 2 });

    expect(res.status).toBe(400);
    expect(assistantSupabase.from).not.toHaveBeenCalled();
  });

  it("rejects a missing title or description", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const assistantSupabase = { from: vi.fn() } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks")
      .set("Cookie", `kanban_session=${token}`)
      .send({ title: "", description: "", domain: "coo", priority: 2 });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 3: Implement**

```ts
  app.post("/api/tasks", auth, async (req: Request, res: Response) => {
    const { title, description, domain, repo, priority } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || typeof description !== "string" || !description.trim()) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    if (domain === "dev" && (typeof repo !== "string" || !repo.trim())) {
      res.status(400).json({ error: "repo is required for dev-domain tasks" });
      return;
    }
    const { error } = await deps.assistantSupabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim(),
      domain,
      repo: domain === "dev" ? repo : null,
      priority: typeof priority === "number" ? priority : 2,
      stage: "backlog",
      created_by: "manual",
    });
    if (error) {
      res.status(502).json({ error: `Failed to create task: ${error.message}` });
      return;
    }
    res.status(201).json({ ok: true });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add POST /api/tasks to create backlog tasks from the web UI"
```

---

### Task 8: `PATCH /api/tasks/:id` — edit (backlog only)

**Files:**
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`

Per spec §09 (out of scope), only `backlog` tasks are editable in v1 — this keeps the edit form from
ever conflicting with a task the agent is actively touching.

- [ ] **Step 1: Write the failing tests**

```ts
describe("PATCH /api/tasks/:id", () => {
  it("updates a backlog task's editable fields", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() => Promise.resolve({ data: { id: "task-1", stage: "backlog" }, error: null }));
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    const assistantSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })),
        update,
      })),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .patch("/api/tasks/task-1")
      .set("Cookie", `kanban_session=${token}`)
      .send({ title: "New title", description: "New description", priority: 1 });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New title", description: "New description", priority: 1 }),
    );
  });

  it("rejects editing a task that isn't in backlog", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() => Promise.resolve({ data: { id: "task-1", stage: "review" }, error: null }));
    const assistantSupabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })) })),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .patch("/api/tasks/task-1")
      .set("Cookie", `kanban_session=${token}`)
      .send({ title: "New title" });

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 3: Implement**

```ts
  app.patch("/api/tasks/:id", auth, async (req: Request, res: Response) => {
    const { data: task, error: fetchError } = await deps.assistantSupabase
      .from("tasks")
      .select("id, stage")
      .eq("id", req.params.id)
      .single();
    if (fetchError || !task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.stage !== "backlog") {
      res.status(409).json({ error: `Cannot edit a task in stage "${task.stage}" - only backlog tasks are editable` });
      return;
    }
    const { title, description, domain, repo, priority } = req.body ?? {};
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof title === "string") fields.title = title.trim();
    if (typeof description === "string") fields.description = description.trim();
    if (typeof domain === "string") fields.domain = domain;
    if (typeof repo === "string") fields.repo = repo;
    if (typeof priority === "number") fields.priority = priority;

    const { error } = await deps.assistantSupabase.from("tasks").update(fields).eq("id", req.params.id);
    if (error) {
      res.status(502).json({ error: `Failed to update task: ${error.message}` });
      return;
    }
    res.status(200).json({ ok: true });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add PATCH /api/tasks/:id, backlog tasks only"
```

---

### Task 9: `POST /api/tasks/:id/promote` — claude only

**Files:**
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`

Mirrors `/promote`'s Telegram logic (`src/telegram/assistantCommands.ts`) but the UI only ever sends
`"claude"` (Copilot is hidden per spec §06) — still validated server-side so a stray request can't
promote with something else.

- [ ] **Step 1: Write the failing tests**

```ts
describe("POST /api/tasks/:id/promote", () => {
  it("promotes a backlog dev task to ready with claude assigned", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() =>
      Promise.resolve({ data: { id: "task-1", stage: "backlog", domain: "dev" }, error: null }),
    );
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const assistantSupabase = {
      from: vi.fn((table: string) => {
        if (table === "tasks") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })), update };
        if (table === "task_events") return { insert };
        throw new Error(`unexpected table ${table}`);
      }),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks/task-1/promote")
      .set("Cookie", `kanban_session=${token}`)
      .send({ executor: "claude" });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ stage: "ready", assigned_model: "claude" }));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ from_stage: "backlog", to_stage: "ready" }),
    );
  });

  it("rejects any executor other than claude", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() =>
      Promise.resolve({ data: { id: "task-1", stage: "backlog", domain: "dev" }, error: null }),
    );
    const assistantSupabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })) })),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks/task-1/promote")
      .set("Cookie", `kanban_session=${token}`)
      .send({ executor: "copilot" });

    expect(res.status).toBe(400);
  });

  it("rejects promoting a task that isn't in backlog", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() =>
      Promise.resolve({ data: { id: "task-1", stage: "ready", domain: "dev" }, error: null }),
    );
    const assistantSupabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })) })),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks/task-1/promote")
      .set("Cookie", `kanban_session=${token}`)
      .send({ executor: "claude" });

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 3: Implement**

```ts
  app.post("/api/tasks/:id/promote", auth, async (req: Request, res: Response) => {
    const { executor } = req.body ?? {};
    if (executor !== "claude") {
      res.status(400).json({ error: 'executor must be "claude"' });
      return;
    }
    const { data: task, error: fetchError } = await deps.assistantSupabase
      .from("tasks")
      .select("id, stage, domain")
      .eq("id", req.params.id)
      .single();
    if (fetchError || !task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.stage !== "backlog") {
      res.status(409).json({ error: `Cannot promote a task in stage "${task.stage}"` });
      return;
    }
    const { error: updateError } = await deps.assistantSupabase
      .from("tasks")
      .update({ stage: "ready", assigned_model: "claude", updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (updateError) {
      res.status(502).json({ error: `Failed to promote task: ${updateError.message}` });
      return;
    }
    const { error: eventError } = await deps.assistantSupabase.from("task_events").insert({
      task_id: req.params.id,
      from_stage: "backlog",
      to_stage: "ready",
    });
    if (eventError) {
      console.error(`POST /api/tasks/:id/promote: failed to log task_event: ${eventError.message}`);
    }
    res.status(200).json({ ok: true });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add POST /api/tasks/:id/promote, claude only"
```

---

### Task 10: `POST /api/tasks/:id/retry` — blocked → backlog

**Files:**
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("POST /api/tasks/:id/retry", () => {
  it("moves a blocked task back to backlog", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() => Promise.resolve({ data: { id: "task-1", stage: "blocked" }, error: null }));
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const assistantSupabase = {
      from: vi.fn((table: string) => {
        if (table === "tasks") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })), update };
        if (table === "task_events") return { insert };
        throw new Error(`unexpected table ${table}`);
      }),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks/task-1/retry")
      .set("Cookie", `kanban_session=${token}`);

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ stage: "backlog" }));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ from_stage: "blocked", to_stage: "backlog" }),
    );
  });

  it("rejects retrying a task that isn't blocked", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const fetchSingle = vi.fn(() => Promise.resolve({ data: { id: "task-1", stage: "ready" }, error: null }));
    const assistantSupabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: fetchSingle })) })) })),
    } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase });

    const res = await request(app)
      .post("/api/tasks/task-1/retry")
      .set("Cookie", `kanban_session=${token}`);

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 3: Implement**

```ts
  app.post("/api/tasks/:id/retry", auth, async (req: Request, res: Response) => {
    const { data: task, error: fetchError } = await deps.assistantSupabase
      .from("tasks")
      .select("id, stage")
      .eq("id", req.params.id)
      .single();
    if (fetchError || !task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.stage !== "blocked") {
      res.status(409).json({ error: `Cannot retry a task in stage "${task.stage}" - only blocked tasks can be retried` });
      return;
    }
    const { error: updateError } = await deps.assistantSupabase
      .from("tasks")
      .update({ stage: "backlog", updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (updateError) {
      res.status(502).json({ error: `Failed to retry task: ${updateError.message}` });
      return;
    }
    const { error: eventError } = await deps.assistantSupabase.from("task_events").insert({
      task_id: req.params.id,
      from_stage: "blocked",
      to_stage: "backlog",
    });
    if (eventError) {
      console.error(`POST /api/tasks/:id/retry: failed to log task_event: ${eventError.message}`);
    }
    res.status(200).json({ ok: true });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add POST /api/tasks/:id/retry, blocked to backlog"
```

---

### Task 11: Realtime SSE stream

**Files:**
- Create: `src/webui/sse.ts`
- Create: `src/webui/sse.test.ts`
- Modify: `src/webui/server.ts`
- Modify: `src/webui/server.test.ts`

**BEFORE implementing:** Supabase Realtime only publishes changes for tables already in the
`supabase_realtime` publication, which defaults to `public`-schema tables only. Run this in the
Supabase dashboard SQL editor (same project/workflow as every other migration in this project) before
this task's subscription can receive anything real:

```sql
alter publication supabase_realtime add table assistant.tasks, assistant.task_events;
```

Verify it actually took effect (per this project's "don't trust done, verify" convention) via:

```sql
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'assistant';
```

Expected: both `tasks` and `task_events` listed. This can't be verified from a sandbox — confirm on the
real project before or alongside this task.

- [ ] **Step 1: Write the failing test for the broadcast hub**

```ts
// src/webui/sse.ts's exported createBroadcastHub is a plain in-memory pub/sub -
// this part is fully unit-testable without a real Supabase connection.

// src/webui/sse.test.ts
import { describe, it, expect, vi } from "vitest";
import { createBroadcastHub } from "./sse.js";

function makeFakeResponse() {
  const writes: string[] = [];
  return {
    write: vi.fn((chunk: string) => { writes.push(chunk); return true; }),
    writes,
  };
}

describe("createBroadcastHub", () => {
  it("sends a message to every subscribed client", () => {
    const hub = createBroadcastHub();
    const clientA = makeFakeResponse();
    const clientB = makeFakeResponse();
    hub.subscribe(clientA as any);
    hub.subscribe(clientB as any);

    hub.broadcast({ type: "task_changed" });

    expect(clientA.writes[0]).toContain('data: {"type":"task_changed"}');
    expect(clientB.writes[0]).toContain('data: {"type":"task_changed"}');
  });

  it("stops sending to a client after it unsubscribes", () => {
    const hub = createBroadcastHub();
    const client = makeFakeResponse();
    const unsubscribe = hub.subscribe(client as any);

    unsubscribe();
    hub.broadcast({ type: "task_changed" });

    expect(client.write).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/sse.test.ts`
Expected: FAIL — `Cannot find module './sse.js'`.

- [ ] **Step 3: Implement `sse.ts`**

```ts
// src/webui/sse.ts
import type { Response } from "express";
import type { AssistantClient } from "../supabase/assistantClient.js";

export interface BroadcastMessage {
  type: "task_changed";
}

export function createBroadcastHub() {
  const clients = new Set<Response>();
  return {
    subscribe(res: Response): () => void {
      clients.add(res);
      return () => clients.delete(res);
    },
    broadcast(message: BroadcastMessage): void {
      const payload = `data: ${JSON.stringify(message)}\n\n`;
      for (const client of clients) {
        client.write(payload);
      }
    },
  };
}

export type BroadcastHub = ReturnType<typeof createBroadcastHub>;

// Subscribes once to Supabase Realtime for both tables and forwards every
// change as a single generic "task_changed" broadcast - the client just
// refetches the task list on any event (the board is small; fine-grained
// patching isn't worth the complexity here).
export function subscribeToTaskChanges(supabase: AssistantClient, hub: BroadcastHub): void {
  supabase
    .channel("assistant-tasks-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "assistant", table: "tasks" },
      () => hub.broadcast({ type: "task_changed" }),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "assistant", table: "task_events" },
      () => hub.broadcast({ type: "task_changed" }),
    )
    .subscribe();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/sse.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the SSE route**

Add to `server.test.ts`:

```ts
describe("GET /api/tasks/stream", () => {
  it("registers the connection with the broadcast hub and keeps it open", async () => {
    const sessions = createSessionStore();
    const token = sessions.create();
    const hub = { subscribe: vi.fn(() => vi.fn()), broadcast: vi.fn() };
    const assistantSupabase = { from: vi.fn() } as any;
    const app = createWebServer({ kanbanUiPassword: "x", sessions, staticDir: null, assistantSupabase, broadcastHub: hub as any });

    // supertest can't easily assert on a never-ending stream; assert the
    // connection was registered with the hub, which is what actually
    // matters for this route's behavior.
    const req = request(app).get("/api/tasks/stream").set("Cookie", `kanban_session=${token}`);
    req.end(() => {}); // fire and forget - don't await, this connection never closes on its own
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hub.subscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/webui/server.test.ts`

- [ ] **Step 7: Wire the route into `server.ts`**

Add `broadcastHub: BroadcastHub` to `WebServerDeps` (import from `./sse.js`), and add the route:

```ts
  app.get("/api/tasks/stream", auth, (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const unsubscribe = deps.broadcastHub.subscribe(res);
    req.on("close", unsubscribe);
  });
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test`

- [ ] **Step 9: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 10: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/webui/sse.ts src/webui/sse.test.ts src/webui/server.ts src/webui/server.test.ts
git commit -m "feat: add realtime SSE stream bridged from Supabase Realtime"
```

---

### Task 12: Wire the web server into `index.ts`, replacing the raw health server

**Files:**
- Modify: `src/index.ts`
- Modify: `src/config.ts`
- Delete: `src/health.ts`
- Delete: `src/health.test.ts`

**Note:** an external uptime monitor may depend on `GET /health` returning exactly `200 "ok"` — this
task's Express route (added in Task 4) already replicates that exact contract, so this is safe, but
worth a real check against the live monitor after deploying (Task 24's smoke test).

- [ ] **Step 1: Add the static-dir config field**

In `src/config.ts`, add to `Config`:

```ts
  webuiStaticDir: string;
```

Add to `loadConfig()` (needs `import path from "node:path";` at the top of the file):

```ts
    webuiStaticDir: process.env.WEBUI_STATIC_DIR ?? path.join(process.cwd(), "webui", "dist"),
```

- [ ] **Step 2: Update `index.ts`**

Replace the `createHealthServer` import/call with the new web server. Read the current file first (it
was last touched in the command-registration-order fix) to get the exact surrounding structure right;
the shape of the change is:

```ts
import { createAssistantClient } from "./supabase/assistantClient.js";
import { createWebServer } from "./webui/server.js";
import { createSessionStore } from "./webui/auth.js";
import { createBroadcastHub, subscribeToTaskChanges } from "./webui/sse.js";
// remove: import { createHealthServer } from "./health.js";

async function main() {
  const config = loadConfig();
  // ... existing client creation, unchanged ...

  const sessions = createSessionStore();
  const broadcastHub = createBroadcastHub();
  subscribeToTaskChanges(assistantSupabase, broadcastHub);
  const webServer = createWebServer({
    kanbanUiPassword: config.kanbanUiPassword,
    sessions,
    staticDir: config.webuiStaticDir,
    assistantSupabase,
    broadcastHub,
  });
  webServer.listen(config.port, () => {
    console.log(`Web server (health + API + UI) listening on :${config.port}`);
  });

  // remove: createHealthServer(config.port); and its console.log
  // ... rest unchanged (bot.start(), etc.) ...
}
```

- [ ] **Step 3: Delete the old health server files**

```bash
cd /Users/patrikfriis/Projects/Unelma
rm src/health.ts src/health.test.ts
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`
Expected: all tests pass (health.test.ts's 3 tests are gone, replaced by server.test.ts's coverage of
the same `/health` contract from Task 4), clean build.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/index.ts src/config.ts src/config.test.ts
git rm src/health.ts src/health.test.ts
git commit -m "feat: wire the web server into main, replacing the raw health server"
```

---

## Part B — Frontend (Tasks 13-20)

### Task 13: Scaffold the Vite React TS project

**Files:**
- Create: `webui/package.json`
- Create: `webui/vite.config.ts`
- Create: `webui/tsconfig.json`
- Create: `webui/index.html`
- Create: `webui/src/main.tsx`
- Create: `webui/src/App.tsx`
- Create: `webui/src/types.ts`
- Create: `webui/src/api.ts`
- Modify: `.gitignore` (repo root)

Not TDD (project scaffolding) — the first genuinely-tested code starts at Task 14.

- [ ] **Step 1: Scaffold with Vite**

```bash
cd /Users/patrikfriis/Projects/Unelma
npm create vite@latest webui -- --template react-ts
cd webui
npm install
npm install motion
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

`motion` (the current package name for what used to be published as `framer-motion`) provides the
spring animation primitives Tasks 21-23 need for drag — critically-damped/bouncy springs, velocity
handoff on release, and animating from an element's live presentation value rather than a fixed target
(interruptibility), none of which a plain CSS transition can do.

- [ ] **Step 2: Add the Vitest config to `vite.config.ts`**

```ts
// webui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
```

Create `webui/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `webui/package.json`'s `scripts`: `"test": "vitest run"`.

- [ ] **Step 3: Shared types**

```ts
// webui/src/types.ts
export type TaskStage = "backlog" | "ready" | "in_progress" | "review" | "blocked" | "done";
export type TaskDomain = "coo" | "dev" | "politics" | "monitor";

export interface Task {
  id: string;
  title: string;
  description: string;
  domain: TaskDomain;
  stage: TaskStage;
  priority: number;
  assigned_model: string | null;
  progress_status: string | null;
  repo: string | null;
  pr_url: string | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: API client**

```ts
// webui/src/api.ts
import type { Task } from "./types.js";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  login: (password: string) => request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  listTasks: () => request<Task[]>("/tasks"),
  getTask: (id: string) => request<{ task: Task; events: unknown[] }>(`/tasks/${id}`),
  createTask: (fields: { title: string; description: string; domain: string; repo?: string; priority: number }) =>
    request<{ ok: true }>("/tasks", { method: "POST", body: JSON.stringify(fields) }),
  updateTask: (id: string, fields: Partial<{ title: string; description: string; domain: string; repo: string; priority: number }>) =>
    request<{ ok: true }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
  promoteTask: (id: string) => request<{ ok: true }>(`/tasks/${id}/promote`, { method: "POST", body: JSON.stringify({ executor: "claude" }) }),
  retryTask: (id: string) => request<{ ok: true }>(`/tasks/${id}/retry`, { method: "POST" }),
};
```

- [ ] **Step 4.5: Base styles — typography, press feedback, reduced-motion (per the `apple-design` skill)**

Replace the Vite-generated `webui/src/index.css` with:

```css
/* webui/src/index.css */
:root {
  color-scheme: dark;
  font: 100%/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; /* platform font, comfortable leading */
}

body { margin: 0; background: #0e0e0e; color: #f0f0f0; }

h1, h2, h3 { letter-spacing: -0.02em; line-height: 1.1; } /* negative tracking, tight leading on large text */
p, span, div { letter-spacing: 0; } /* near-zero tracking on body text */

button {
  font: inherit;
  cursor: pointer;
  transition: transform 100ms ease-out; /* instant, cheap press feedback */
}
button:active { transform: scale(0.97); }

.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px) saturate(140%); /* translucent material, not a flat scrim */
  animation: overlay-materialize 200ms ease-out; /* materialize, don't just fade */
}
.overlay-panel {
  background: rgba(26, 26, 26, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px;
  min-width: 360px;
  animation: overlay-materialize 200ms ease-out;
}

@keyframes overlay-materialize {
  from { opacity: 0; backdrop-filter: blur(0); transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
  button:active { transform: none; }
  .overlay, .overlay-panel { animation: none; }
}
```

Delete `webui/src/App.css` (the Vite template's per-component stylesheet) — this project keeps styling
inline per-component plus this one shared base file, not a growing pile of CSS-module files.

- [ ] **Step 5: Minimal `App.tsx`/`main.tsx`**

Leave Vite's generated `main.tsx` as-is. Replace `App.tsx` with a placeholder that Task 14 fills in:

```tsx
// webui/src/App.tsx
export default function App() {
  return <div>Loading...</div>;
}
```

- [ ] **Step 6: Add `webui/dist` and `webui/node_modules` to the repo-root `.gitignore`**

```
webui/node_modules/
webui/dist/
```

- [ ] **Step 7: Verify the scaffold builds and the test runner works**

```bash
cd /Users/patrikfriis/Projects/Unelma/webui
npm run build
npx vitest run
```

Expected: build succeeds (empty `dist/` output with the placeholder App), Vitest runs with 0 tests (no
test files yet) and exits cleanly.

- [ ] **Step 8: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/ .gitignore
git commit -m "feat: scaffold the Vite React TS project for the Kanban web UI"
```

---

### Task 14: Login page

**Files:**
- Create: `webui/src/pages/Login.tsx`
- Create: `webui/src/pages/Login.test.tsx`
- Modify: `webui/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// webui/src/pages/Login.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Login } from "./Login.js";
import { api } from "../api.js";

vi.mock("../api.js", () => ({ api: { login: vi.fn() } }));

describe("Login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls api.login with the entered password and onSuccess on success", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    render(<Login onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/password/i), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(api.login).toHaveBeenCalledWith("correct-horse");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows an error message and does not call onSuccess on failure", async () => {
    (api.login as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("invalid password"));
    const onSuccess = vi.fn();
    render(<Login onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid password/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/pages/Login.test.tsx`
Expected: FAIL — `Cannot find module './Login.js'`.

- [ ] **Step 3: Implement**

```tsx
// webui/src/pages/Login.tsx
import { useState, type FormEvent } from "react";
import { api } from "../api.js";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 320, margin: "80px auto" }}>
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", width: "100%", margin: "8px 0" }}
      />
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={submitting}>Log in</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/pages/Login.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into `App.tsx`**

```tsx
// webui/src/App.tsx
import { useState } from "react";
import { Login } from "./pages/Login.js";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  if (!loggedIn) {
    return <Login onSuccess={() => setLoggedIn(true)} />;
  }
  return <div>Board goes here (Task 15)</div>;
}
```

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/pages/Login.tsx webui/src/pages/Login.test.tsx webui/src/App.tsx
git commit -m "feat: add login page"
```

---

### Task 15: Board page — fetch and render 6 columns

**Files:**
- Create: `webui/src/pages/Board.tsx`
- Create: `webui/src/pages/Board.test.tsx`
- Modify: `webui/src/App.tsx`

Stage → column label mapping (spec §04): `review` displays as "Needs Attention" — a display-only
rename, the underlying `stage` value is untouched everywhere else.

- [ ] **Step 1: Write the failing test**

```tsx
// webui/src/pages/Board.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Board } from "./Board.js";
import { api } from "../api.js";
import type { Task } from "../types.js";

vi.mock("../api.js", () => ({ api: { listTasks: vi.fn() } }));

const TASK = (overrides: Partial<Task>): Task => ({
  id: "task-1", title: "Do a thing", description: "...", domain: "dev", stage: "backlog",
  priority: 2, assigned_model: null, progress_status: null, repo: "patrikfriis-alt/treeniapp",
  pr_url: null, result_summary: null, created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
  ...overrides,
});

describe("Board", () => {
  it("renders all 6 columns with the review column labeled Needs Attention", async () => {
    (api.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<Board />);

    await waitFor(() => expect(api.listTasks).toHaveBeenCalled());
    for (const label of ["Backlog", "Ready", "In Progress", "Needs Attention", "Blocked", "Done"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("places each task under its stage's column", async () => {
    (api.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      TASK({ id: "t1", title: "Backlog task", stage: "backlog" }),
      TASK({ id: "t2", title: "Blocked task", stage: "blocked" }),
    ]);
    render(<Board />);

    expect(await screen.findByText("Backlog task")).toBeInTheDocument();
    expect(await screen.findByText("Blocked task")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/pages/Board.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// webui/src/pages/Board.tsx
import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { Task, TaskStage } from "../types.js";

const COLUMNS: { stage: TaskStage; label: string }[] = [
  { stage: "backlog", label: "Backlog" },
  { stage: "ready", label: "Ready" },
  { stage: "in_progress", label: "In Progress" },
  { stage: "review", label: "Needs Attention" },
  { stage: "blocked", label: "Blocked" },
  { stage: "done", label: "Done" },
];

export function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.listTasks().then(setTasks).catch((err) => console.error("Failed to load tasks:", err));
  }, []);

  return (
    <div style={{ display: "flex", gap: 12, padding: 16 }}>
      {COLUMNS.map(({ stage, label }) => (
        <div key={stage} style={{ flex: 1, minWidth: 0 }}>
          <h3>{label}</h3>
          {tasks.filter((t) => t.stage === stage).map((t) => (
            <div key={t.id}>{t.title}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/pages/Board.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into `App.tsx`**

Replace the placeholder `<div>Board goes here</div>` with `<Board />`.

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/pages/Board.tsx webui/src/pages/Board.test.tsx webui/src/App.tsx
git commit -m "feat: add board page with 6 stage columns"
```

---

### Task 16: `TaskCard` component

**Files:**
- Create: `webui/src/components/TaskCard.tsx`
- Create: `webui/src/components/TaskCard.test.tsx`
- Modify: `webui/src/pages/Board.tsx`

Compact style (spec §05): title, domain, priority, repo/executor, relative time, plus an inline
preview for review (PR #) and blocked (truncated reason) cards.

- [ ] **Step 1: Write the failing tests**

```tsx
// webui/src/components/TaskCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskCard } from "./TaskCard.js";
import type { Task } from "../types.js";

const TASK = (overrides: Partial<Task>): Task => ({
  id: "task-1", title: "Add dark mode", description: "...", domain: "dev", stage: "backlog",
  priority: 2, assigned_model: "claude", progress_status: null, repo: "patrikfriis-alt/treeniapp",
  pr_url: null, result_summary: null, created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
  ...overrides,
});

describe("TaskCard", () => {
  it("shows title, domain, priority, repo and executor", () => {
    render(<TaskCard task={TASK({})} />);
    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
    expect(screen.getByText("DEV")).toBeInTheDocument();
    expect(screen.getByText(/treeniapp/)).toBeInTheDocument();
    expect(screen.getByText(/claude/)).toBeInTheDocument();
  });

  it("shows the PR number inline for a review-stage card", () => {
    render(<TaskCard task={TASK({ stage: "review", pr_url: "https://github.com/patrikfriis-alt/treeniapp/pull/42" })} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("shows a truncated block reason inline for a blocked card", () => {
    render(<TaskCard task={TASK({ stage: "blocked", result_summary: "Claude epäonnistui: something went quite wrong in a very long way that should get truncated" })} />);
    const preview = screen.getByText(/Claude epäonnistui/);
    expect(preview.textContent!.length).toBeLessThan(80);
  });

  it("shows the progress_status sub-label for an in-progress card", () => {
    render(<TaskCard task={TASK({ stage: "in_progress", progress_status: "running_claude" })} />);
    expect(screen.getByText("running_claude")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/TaskCard.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// webui/src/components/TaskCard.tsx
import type { Task } from "../types.js";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function TaskCard({ task }: { task: Task }) {
  const prNumber = task.pr_url?.match(/\/pull\/(\d+)/)?.[1];
  const blockPreview = task.result_summary ? task.result_summary.slice(0, 60) : null;

  return (
    <div style={{ border: "1px solid #444", borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7 }}>
        <span>{task.domain.toUpperCase()}</span>
        <span>P{task.priority}</span>
      </div>
      <div style={{ margin: "6px 0", fontWeight: 600 }}>{task.title}</div>
      <div style={{ fontSize: 11, opacity: 0.7 }}>
        {task.repo && <>{task.repo.split("/")[1]} &middot; </>}
        {task.assigned_model && <>{task.assigned_model} &middot; </>}
        {relativeTime(task.updated_at)}
      </div>
      {task.stage === "in_progress" && task.progress_status && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{task.progress_status}</div>
      )}
      {task.stage === "review" && prNumber && (
        <div style={{ fontSize: 11, marginTop: 4 }}>PR #{prNumber}</div>
      )}
      {task.stage === "blocked" && blockPreview && (
        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{blockPreview}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/TaskCard.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into `Board.tsx`**

Replace `<div key={t.id}>{t.title}</div>` with `<TaskCard key={t.id} task={t} />` (import it).

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/components/TaskCard.tsx webui/src/components/TaskCard.test.tsx webui/src/pages/Board.tsx
git commit -m "feat: add compact TaskCard with inline PR/blocked-reason preview"
```

---

### Task 17: `DomainFilter` — multi-select chips with `localStorage`

**Files:**
- Create: `webui/src/components/DomainFilter.tsx`
- Create: `webui/src/components/DomainFilter.test.tsx`
- Modify: `webui/src/pages/Board.tsx`
- Modify: `webui/src/pages/Board.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// webui/src/components/DomainFilter.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DomainFilter } from "./DomainFilter.js";

describe("DomainFilter", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to all domains selected", () => {
    const onChange = vi.fn();
    render(<DomainFilter selected={["coo", "dev", "politics", "monitor"]} onChange={onChange} />);
    for (const label of ["COO", "DEV", "Politics", "Monitor"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("toggles a domain off when clicked, calling onChange with the new set", async () => {
    const onChange = vi.fn();
    render(<DomainFilter selected={["coo", "dev", "politics", "monitor"]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "DEV" }));

    expect(onChange).toHaveBeenCalledWith(["coo", "politics", "monitor"]);
  });

  it("toggles a domain back on when clicked again", async () => {
    const onChange = vi.fn();
    render(<DomainFilter selected={["coo", "politics", "monitor"]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "DEV" }));

    expect(onChange).toHaveBeenCalledWith(["coo", "politics", "monitor", "dev"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/DomainFilter.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// webui/src/components/DomainFilter.tsx
import type { TaskDomain } from "../types.js";

const DOMAINS: { value: TaskDomain; label: string }[] = [
  { value: "coo", label: "COO" },
  { value: "dev", label: "DEV" },
  { value: "politics", label: "Politics" },
  { value: "monitor", label: "Monitor" },
];

export function DomainFilter({
  selected,
  onChange,
}: {
  selected: TaskDomain[];
  onChange: (next: TaskDomain[]) => void;
}) {
  function toggle(domain: TaskDomain) {
    if (selected.includes(domain)) {
      onChange(selected.filter((d) => d !== domain));
    } else {
      onChange([...selected, domain]);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {DOMAINS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={selected.includes(value)}
          onClick={() => toggle(value)}
          style={{
            padding: "4px 10px",
            borderRadius: 10,
            background: selected.includes(value) ? "#2a4a2a" : "#2a2a2a",
            border: "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/DomainFilter.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `localStorage` persistence in `Board.tsx`**

Add to `Board.test.tsx`:

```tsx
it("restores the domain filter from localStorage on load, and saves changes to it", async () => {
  localStorage.setItem("unelmaboard.domainFilter", JSON.stringify(["dev"]));
  (api.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
    TASK({ id: "t1", title: "Dev task", domain: "dev", stage: "backlog" }),
    TASK({ id: "t2", title: "COO task", domain: "coo", stage: "backlog" }),
  ]);
  render(<Board />);

  expect(await screen.findByText("Dev task")).toBeInTheDocument();
  expect(screen.queryByText("COO task")).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/pages/Board.test.tsx`

- [ ] **Step 7: Wire filtering + persistence into `Board.tsx`**

```tsx
// webui/src/pages/Board.tsx
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { TaskCard } from "../components/TaskCard.js";
import { DomainFilter } from "../components/DomainFilter.js";
import type { Task, TaskStage, TaskDomain } from "../types.js";

const STORAGE_KEY = "unelmaboard.domainFilter";
const ALL_DOMAINS: TaskDomain[] = ["coo", "dev", "politics", "monitor"];

function loadStoredDomains(): TaskDomain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_DOMAINS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ALL_DOMAINS;
  } catch {
    return ALL_DOMAINS;
  }
}

// COLUMNS unchanged from Task 15

export function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<TaskDomain[]>(loadStoredDomains);

  useEffect(() => {
    api.listTasks().then(setTasks).catch((err) => console.error("Failed to load tasks:", err));
  }, []);

  function handleDomainChange(next: TaskDomain[]) {
    setDomains(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const visibleTasks = tasks.filter((t) => domains.includes(t.domain));

  return (
    <div style={{ padding: 16 }}>
      <DomainFilter selected={domains} onChange={handleDomainChange} />
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {COLUMNS.map(({ stage, label }) => (
          <div key={stage} style={{ flex: 1, minWidth: 0 }}>
            <h3>{label}</h3>
            {visibleTasks.filter((t) => t.stage === stage).map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run`

- [ ] **Step 9: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 10: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/components/DomainFilter.tsx webui/src/components/DomainFilter.test.tsx webui/src/pages/Board.tsx webui/src/pages/Board.test.tsx
git commit -m "feat: add domain filter chips, persisted to localStorage"
```

---

### Task 18: `TaskForm` — create/edit modal

**Files:**
- Create: `webui/src/components/TaskForm.tsx`
- Create: `webui/src/components/TaskForm.test.tsx`
- Modify: `webui/src/pages/Board.tsx`

No executor field (spec §06). Repo field only shown/required for the `dev` domain.

- [ ] **Step 1: Write the failing tests**

```tsx
// webui/src/components/TaskForm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskForm } from "./TaskForm.js";
import { api } from "../api.js";

vi.mock("../api.js", () => ({ api: { createTask: vi.fn(), updateTask: vi.fn() } }));

describe("TaskForm", () => {
  it("creates a new task with the entered fields", async () => {
    (api.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<TaskForm mode="create" onDone={onDone} />);

    await userEvent.type(screen.getByLabelText(/title/i), "Add dark mode");
    await userEvent.type(screen.getByLabelText(/description/i), "Add a toggle");
    await userEvent.click(screen.getByRole("button", { name: /dev/i }));
    await userEvent.type(screen.getByLabelText(/repo/i), "patrikfriis-alt/treeniapp");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Add dark mode", description: "Add a toggle", domain: "dev",
        repo: "patrikfriis-alt/treeniapp", priority: 2,
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("has no executor field", () => {
    render(<TaskForm mode="create" onDone={vi.fn()} />);
    expect(screen.queryByLabelText(/executor/i)).not.toBeInTheDocument();
  });

  it("shows the repo field only when domain is dev", async () => {
    render(<TaskForm mode="create" onDone={vi.fn()} />);
    expect(screen.queryByLabelText(/repo/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /dev/i }));
    expect(screen.getByLabelText(/repo/i)).toBeInTheDocument();
  });

  it("edit mode pre-fills fields and calls updateTask", async () => {
    (api.updateTask as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(
      <TaskForm
        mode="edit"
        taskId="task-1"
        initial={{ title: "Old title", description: "Old desc", domain: "coo", priority: 3 }}
        onDone={onDone}
      />,
    );

    expect(screen.getByLabelText(/title/i)).toHaveValue("Old title");
    await userEvent.clear(screen.getByLabelText(/title/i));
    await userEvent.type(screen.getByLabelText(/title/i), "New title");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(api.updateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ title: "New title" }));
    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/TaskForm.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// webui/src/components/TaskForm.tsx
import { useState, type FormEvent } from "react";
import { api } from "../api.js";
import type { TaskDomain } from "../types.js";

const DOMAINS: TaskDomain[] = ["coo", "dev", "politics", "monitor"];

export interface TaskFormInitial {
  title: string;
  description: string;
  domain: TaskDomain;
  repo?: string;
  priority: number;
}

export function TaskForm({
  mode,
  taskId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  taskId?: string;
  initial?: TaskFormInitial;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [domain, setDomain] = useState<TaskDomain>(initial?.domain ?? "dev");
  const [repo, setRepo] = useState(initial?.repo ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? 2);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fields = { title, description, domain, repo: domain === "dev" ? repo : undefined, priority };
    try {
      if (mode === "create") {
        await api.createTask(fields);
      } else {
        await api.updateTask(taskId!, fields);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="title">Title</label>
      <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label htmlFor="description">Description</label>
      <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <div>
        {DOMAINS.map((d) => (
          <button key={d} type="button" aria-pressed={domain === d} onClick={() => setDomain(d)}>
            {d.toUpperCase()}
          </button>
        ))}
      </div>

      {domain === "dev" && (
        <>
          <label htmlFor="repo">Repo</label>
          <input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </>
      )}

      <label htmlFor="priority">Priority</label>
      <select id="priority" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
        <option value={1}>1 — High</option>
        <option value={2}>2 — Normal</option>
        <option value={3}>3 — Low</option>
      </select>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit">{mode === "create" ? "Create" : "Save"}</button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/TaskForm.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire a "New Task" button + modal into `Board.tsx`**

No modal library needed — a fixed-position overlay `<div>` is enough. Add local `showForm` state, a
button that sets it, and conditionally render `TaskForm` inside the overlay when it's true:

```tsx
// webui/src/pages/Board.tsx — full file after this step
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { TaskCard } from "../components/TaskCard.js";
import { DomainFilter } from "../components/DomainFilter.js";
import { TaskForm } from "../components/TaskForm.js";
import type { Task, TaskStage, TaskDomain } from "../types.js";

const STORAGE_KEY = "unelmaboard.domainFilter";
const ALL_DOMAINS: TaskDomain[] = ["coo", "dev", "politics", "monitor"];

const COLUMNS: { stage: TaskStage; label: string }[] = [
  { stage: "backlog", label: "Backlog" },
  { stage: "ready", label: "Ready" },
  { stage: "in_progress", label: "In Progress" },
  { stage: "review", label: "Needs Attention" },
  { stage: "blocked", label: "Blocked" },
  { stage: "done", label: "Done" },
];

function loadStoredDomains(): TaskDomain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_DOMAINS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ALL_DOMAINS;
  } catch {
    return ALL_DOMAINS;
  }
}

export function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<TaskDomain[]>(loadStoredDomains);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listTasks().then(setTasks).catch((err) => console.error("Failed to load tasks:", err));
  }, []);

  function handleDomainChange(next: TaskDomain[]) {
    setDomains(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function refetch() {
    api.listTasks().then(setTasks).catch((err) => console.error("Failed to load tasks:", err));
  }

  const visibleTasks = tasks.filter((t) => domains.includes(t.domain));

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <DomainFilter selected={domains} onChange={handleDomainChange} />
        <button type="button" onClick={() => setShowForm(true)}>New Task</button>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {COLUMNS.map(({ stage, label }) => (
          <div key={stage} style={{ flex: 1, minWidth: 0 }}>
            <h3>{label}</h3>
            {visibleTasks.filter((t) => t.stage === stage).map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ))}
      </div>
      {showForm && (
        <div className="overlay">
          <div className="overlay-panel">
            <TaskForm mode="create" onDone={() => { setShowForm(false); refetch(); }} />
            <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/components/TaskForm.tsx webui/src/components/TaskForm.test.tsx webui/src/pages/Board.tsx
git commit -m "feat: add create/edit task form"
```

---

### Task 19: `TaskDetail` view — promote/retry actions

**Files:**
- Create: `webui/src/components/TaskDetail.tsx`
- Create: `webui/src/components/TaskDetail.test.tsx`
- Modify: `webui/src/pages/Board.tsx`

Opened by clicking a card. Shows full description, full block reason / PR link (not the truncated card
preview), and the promote (backlog) or retry (blocked) action.

- [ ] **Step 1: Write the failing tests**

```tsx
// webui/src/components/TaskDetail.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDetail } from "./TaskDetail.js";
import { api } from "../api.js";
import type { Task } from "../types.js";

vi.mock("../api.js", () => ({ api: { promoteTask: vi.fn(), retryTask: vi.fn() } }));

const TASK = (overrides: Partial<Task>): Task => ({
  id: "task-1", title: "Add dark mode", description: "Full description here", domain: "dev",
  stage: "backlog", priority: 2, assigned_model: null, progress_status: null,
  repo: "patrikfriis-alt/treeniapp", pr_url: null, result_summary: null,
  created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
  ...overrides,
});

describe("TaskDetail", () => {
  it("shows a Promote button for a backlog task, calling promoteTask on click", async () => {
    (api.promoteTask as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<TaskDetail task={TASK({ stage: "backlog" })} onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: /promote/i }));

    expect(api.promoteTask).toHaveBeenCalledWith("task-1");
    expect(onDone).toHaveBeenCalled();
  });

  it("shows a Retry button for a blocked task with the full reason, calling retryTask on click", async () => {
    (api.retryTask as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<TaskDetail task={TASK({ stage: "blocked", result_summary: "Full detailed error message" })} onDone={onDone} />);

    expect(screen.getByText("Full detailed error message")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(api.retryTask).toHaveBeenCalledWith("task-1");
    expect(onDone).toHaveBeenCalled();
  });

  it("shows neither action for a task in review", () => {
    render(<TaskDetail task={TASK({ stage: "review", pr_url: "https://github.com/x/y/pull/1" })} onDone={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pull\/1/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/TaskDetail.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// webui/src/components/TaskDetail.tsx
import { useState } from "react";
import { api } from "../api.js";
import type { Task } from "../types.js";

export function TaskDetail({ task, onDone }: { task: Task; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handlePromote() {
    setError(null);
    try {
      await api.promoteTask(task.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRetry() {
    setError(null);
    try {
      await api.retryTask(task.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h2>{task.title}</h2>
      <p>{task.description}</p>
      {task.stage === "blocked" && task.result_summary && <p>{task.result_summary}</p>}
      {task.stage === "review" && task.pr_url && (
        <a href={task.pr_url} target="_blank" rel="noreferrer">{task.pr_url}</a>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {task.stage === "backlog" && <button onClick={handlePromote}>Promote</button>}
      {task.stage === "blocked" && <button onClick={handleRetry}>Retry</button>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/TaskDetail.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into `Board.tsx`**

Add `selectedTaskId` state; wrap each rendered `TaskCard` in a clickable div that sets it; when set,
look up the task and render `TaskDetail` in the same overlay pattern `TaskForm` uses (Task 18):

```tsx
// webui/src/pages/Board.tsx — changes on top of Task 18's version
import { TaskDetail } from "../components/TaskDetail.js"; // new import

export function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<TaskDomain[]>(loadStoredDomains);
  const [showForm, setShowForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null); // new

  // ... useEffect, handleDomainChange, refetch unchanged from Task 18 ...

  const visibleTasks = tasks.filter((t) => domains.includes(t.domain));
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null; // new

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <DomainFilter selected={domains} onChange={handleDomainChange} />
        <button type="button" onClick={() => setShowForm(true)}>New Task</button>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {COLUMNS.map(({ stage, label }) => (
          <div key={stage} style={{ flex: 1, minWidth: 0 }}>
            <h3>{label}</h3>
            {visibleTasks.filter((t) => t.stage === stage).map((t) => (
              <div key={t.id} onClick={() => setSelectedTaskId(t.id)} style={{ cursor: "pointer" }}>
                <TaskCard task={t} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {showForm && (
        <div className="overlay">
          <div className="overlay-panel">
            <TaskForm mode="create" onDone={() => { setShowForm(false); refetch(); }} />
            <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {selectedTask && (
        <div className="overlay">
          <div className="overlay-panel">
            <TaskDetail task={selectedTask} onDone={() => { setSelectedTaskId(null); refetch(); }} />
            <button type="button" onClick={() => setSelectedTaskId(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/components/TaskDetail.tsx webui/src/components/TaskDetail.test.tsx webui/src/pages/Board.tsx
git commit -m "feat: add task detail view with promote/retry actions"
```

---

### Task 20: Realtime — SSE client hook

**Files:**
- Create: `webui/src/hooks/useRealtimeTasks.ts`
- Create: `webui/src/hooks/useRealtimeTasks.test.ts`
- Modify: `webui/src/pages/Board.tsx`

On any `task_changed` SSE message, refetch the full task list (spec §02 — simplicity over fine-grained
patching, board is small).

- [ ] **Step 1: Write the failing test**

```ts
// webui/src/hooks/useRealtimeTasks.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRealtimeTasks } from "./useRealtimeTasks.js";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
}

describe("useRealtimeTasks", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("opens an EventSource to /api/tasks/stream and calls onChange on a message", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTasks(onChange));

    expect(FakeEventSource.instances[0]?.url).toBe("/api/tasks/stream");
    FakeEventSource.instances[0]!.onmessage!({ data: '{"type":"task_changed"}' } as MessageEvent);
    expect(onChange).toHaveBeenCalled();
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useRealtimeTasks(vi.fn()));
    unmount();
    expect(FakeEventSource.instances[0]!.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/hooks/useRealtimeTasks.test.ts`

- [ ] **Step 3: Implement**

```ts
// webui/src/hooks/useRealtimeTasks.ts
import { useEffect } from "react";

export function useRealtimeTasks(onChange: () => void): void {
  useEffect(() => {
    const source = new EventSource("/api/tasks/stream");
    source.onmessage = () => onChange();
    return () => source.close();
  }, [onChange]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/hooks/useRealtimeTasks.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into `Board.tsx`**

```tsx
  const refetch = () => api.listTasks().then(setTasks).catch((err) => console.error("Failed to load tasks:", err));
  useEffect(() => { refetch(); }, []);
  useRealtimeTasks(refetch);
```

(Replace the existing `useEffect` that calls `api.listTasks` directly with this `refetch`-based version,
and import `useRealtimeTasks`.)

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/hooks/useRealtimeTasks.ts webui/src/hooks/useRealtimeTasks.test.ts webui/src/pages/Board.tsx
git commit -m "feat: live-refresh the board via SSE on any task change"
```

---

### Task 21: `useDragCard` — pointer tracking, velocity, hysteresis

**Files:**
- Create: `webui/src/hooks/useDragCard.ts`
- Create: `webui/src/hooks/useDragCard.test.ts`

Pure gesture-tracking logic, decoupled from rendering (per `apple-design` §2/§3): 1:1 offset tracking
from the exact grab point, a small movement threshold before committing to "this is a drag, not a
click" (§10), and a short position/timestamp history so a release velocity can be computed (§5). No
rendering or animation here — that's Task 22.

- [ ] **Step 1: Write the failing tests**

```ts
// webui/src/hooks/useDragCard.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragCard } from "./useDragCard.js";
import type { PointerEvent as ReactPointerEvent } from "react";

function fakeEvent(x: number, y: number): ReactPointerEvent {
  return {
    clientX: x,
    clientY: y,
    pointerId: 1,
    target: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
  } as unknown as ReactPointerEvent;
}

describe("useDragCard", () => {
  it("stays not-dragging until movement exceeds the hysteresis threshold", () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useDragCard({ onRelease, hysteresis: 10 }));

    act(() => result.current.handlers.onPointerDown(fakeEvent(0, 0)));
    act(() => result.current.handlers.onPointerMove(fakeEvent(3, 3)));

    expect(result.current.state.isDragging).toBe(false);
  });

  it("becomes dragging and tracks offset 1:1 once past the threshold", () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useDragCard({ onRelease, hysteresis: 10 }));

    act(() => result.current.handlers.onPointerDown(fakeEvent(0, 0)));
    act(() => result.current.handlers.onPointerMove(fakeEvent(20, 5)));

    expect(result.current.state.isDragging).toBe(true);
    expect(result.current.state.offset).toEqual({ x: 20, y: 5 });
  });

  it("calls onRelease with the final offset, a computed velocity, and the raw release point", () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useDragCard({ onRelease, hysteresis: 10 }));

    act(() => result.current.handlers.onPointerDown(fakeEvent(0, 0)));
    act(() => result.current.handlers.onPointerMove(fakeEvent(50, 0)));
    act(() => result.current.handlers.onPointerUp(fakeEvent(60, 0)));

    expect(onRelease).toHaveBeenCalledTimes(1);
    const [offset, velocity, releasePoint] = onRelease.mock.calls[0];
    expect(offset).toEqual({ x: 50, y: 0 }); // offset from grab point, tracked up to the last MOVE
    expect(typeof velocity.x).toBe("number");
    expect(releasePoint).toEqual({ x: 60, y: 0 }); // the actual pointer-up screen position
  });

  it("resets to not-dragging and zero offset after release", () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useDragCard({ onRelease, hysteresis: 10 }));

    act(() => result.current.handlers.onPointerDown(fakeEvent(0, 0)));
    act(() => result.current.handlers.onPointerMove(fakeEvent(50, 0)));
    act(() => result.current.handlers.onPointerUp(fakeEvent(50, 0)));

    expect(result.current.state.isDragging).toBe(false);
    expect(result.current.state.offset).toEqual({ x: 0, y: 0 });
  });

  it("does nothing on pointerup if no drag was in progress", () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useDragCard({ onRelease, hysteresis: 10 }));

    act(() => result.current.handlers.onPointerUp(fakeEvent(0, 0)));

    expect(onRelease).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/hooks/useDragCard.test.ts`
Expected: FAIL — `Cannot find module './useDragCard.js'`.

- [ ] **Step 3: Implement**

```ts
// webui/src/hooks/useDragCard.ts
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface Point {
  x: number;
  y: number;
}

export interface UseDragCardOptions {
  onRelease: (offset: Point, velocity: Point, releasePoint: Point) => void;
  hysteresis?: number; // px of movement before it counts as a drag, not a click
}

interface HistoryEntry {
  x: number;
  y: number;
  t: number;
}

const HISTORY_LENGTH = 5; // only recent samples matter for velocity

export function useDragCard({ onRelease, hysteresis = 10 }: UseDragCardOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const grabStart = useRef<Point | null>(null);
  const history = useRef<HistoryEntry[]>([]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    (e.target as Partial<Element>).setPointerCapture?.(e.pointerId); // jsdom in tests has no real impl - safe no-op there
    grabStart.current = { x: e.clientX, y: e.clientY };
    history.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!grabStart.current) return;
      const dx = e.clientX - grabStart.current.x;
      const dy = e.clientY - grabStart.current.y;
      if (!isDragging && Math.hypot(dx, dy) < hysteresis) return;
      setIsDragging(true);
      setOffset({ x: dx, y: dy });
      history.current.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (history.current.length > HISTORY_LENGTH) history.current.shift();
    },
    [isDragging, hysteresis],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!grabStart.current) return;
      (e.target as Partial<Element>).releasePointerCapture?.(e.pointerId);
      const velocity = computeVelocity(history.current);
      const finalOffset = offset;
      const releasePoint: Point = { x: e.clientX, y: e.clientY };
      grabStart.current = null;
      setIsDragging(false);
      setOffset({ x: 0, y: 0 });
      onRelease(finalOffset, velocity, releasePoint);
    },
    [offset, onRelease],
  );

  return {
    state: { isDragging, offset },
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}

function computeVelocity(history: HistoryEntry[]): Point {
  if (history.length < 2) return { x: 0, y: 0 };
  const first = history[0]!;
  const last = history[history.length - 1]!;
  const dtSeconds = (last.t - first.t) / 1000;
  if (dtSeconds <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dtSeconds, y: (last.y - first.y) / dtSeconds }; // px/s
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/hooks/useDragCard.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/hooks/useDragCard.ts webui/src/hooks/useDragCard.test.ts
git commit -m "feat: add pointer drag-tracking hook with velocity and hysteresis"
```

---

### Task 22: `DraggableTaskCard` — spring-animated drag wrapper

**Files:**
- Create: `webui/src/components/DraggableTaskCard.tsx`
- Create: `webui/src/components/DraggableTaskCard.test.tsx`

**BEFORE implementing:** confirm the exact `motion` package export surface against the version actually
installed (`npm ls motion` in `webui/`) — this plan assumes `motion.div`, `useMotionValue`, and `animate`
are all importable from `"motion/react"`, matching the package's current docs at the time this plan was
written, but package export paths do shift between versions and this can't be verified from a sandbox.
If `animate` isn't exported from `"motion/react"` in the installed version, check `"motion"`'s root
export instead.

Wraps the presentational `TaskCard` (Task 16) with drag behavior: instant grab feedback (scale + shadow,
§1), 1:1 tracking while dragging (§2), and on release either commits (handled by the caller) or springs
back to origin carrying the release velocity (§3, §5, §9) — never a hard, non-interruptible snap.

- [ ] **Step 1: Write the failing tests**

```tsx
// webui/src/components/DraggableTaskCard.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraggableTaskCard } from "./DraggableTaskCard.js";
import type { Task } from "../types.js";

const TASK: Task = {
  id: "task-1", title: "Add dark mode", description: "...", domain: "dev", stage: "backlog",
  priority: 2, assigned_model: null, progress_status: null, repo: "patrikfriis-alt/treeniapp",
  pr_url: null, result_summary: null, created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
};

describe("DraggableTaskCard", () => {
  it("calls onClick on a plain click with no drag movement", () => {
    const onClick = vi.fn();
    render(<DraggableTaskCard task={TASK} onClick={onClick} onDragRelease={vi.fn()} />);

    fireEvent.click(screen.getByTestId("draggable-card"));

    expect(onClick).toHaveBeenCalled();
  });

  it("calls onDragRelease with the task id, offset, velocity, and release point after a real drag", () => {
    const onDragRelease = vi.fn().mockReturnValue(true);
    render(<DraggableTaskCard task={TASK} onClick={vi.fn()} onDragRelease={onDragRelease} />);
    const card = screen.getByTestId("draggable-card");

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 40, clientY: 0, pointerId: 1 });

    expect(onDragRelease).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ x: 40, y: 0 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not call onClick after a real drag past the hysteresis threshold", () => {
    const onClick = vi.fn();
    render(<DraggableTaskCard task={TASK} onClick={onClick} onDragRelease={vi.fn().mockReturnValue(true)} />);
    const card = screen.getByTestId("draggable-card");

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.click(card);

    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/DraggableTaskCard.test.tsx`
Expected: FAIL — `Cannot find module './DraggableTaskCard.js'`.

- [ ] **Step 3: Implement**

```tsx
// webui/src/components/DraggableTaskCard.tsx
import { useEffect } from "react";
import { motion, useMotionValue, animate } from "motion/react";
import { useDragCard, type Point } from "../hooks/useDragCard.js";
import { TaskCard } from "./TaskCard.js";
import type { Task } from "../types.js";

export function DraggableTaskCard({
  task,
  onClick,
  onDragRelease,
}: {
  task: Task;
  onClick: () => void;
  // Returns (or resolves to) whether the drop was accepted. Rejected drops rubber-band back to origin.
  onDragRelease: (taskId: string, offset: Point, velocity: Point, releasePoint: Point) => Promise<boolean> | boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const { state, handlers } = useDragCard({
    onRelease: async (offset, velocity, releasePoint) => {
      const accepted = await onDragRelease(task.id, offset, velocity, releasePoint);
      if (accepted) {
        // The card will vanish from this column on the caller's next refetch - freeze in place,
        // no animation needed (nothing here is disruptive to interrupt).
        x.set(0);
        y.set(0);
        return;
      }
      // Rejected: spring back to origin, carrying the release velocity through the re-target
      // (§3/§5/§9) - a hard reset here would be exactly the "brick wall" the skill warns against.
      animate(x, 0, { type: "spring", bounce: 0.2, duration: 0.4, velocity: velocity.x });
      animate(y, 0, { type: "spring", bounce: 0.2, duration: 0.4, velocity: velocity.y });
    },
  });

  // Only drive x/y from the live drag offset while actively dragging - once released, the
  // animate()/set() calls above are the sole owners of these values. Touching them here
  // unconditionally on every render would fight (and immediately cancel) the spring-back animation.
  useEffect(() => {
    if (state.isDragging) {
      x.set(state.offset.x);
      y.set(state.offset.y);
    }
  }, [state.isDragging, state.offset.x, state.offset.y, x, y]);

  return (
    <motion.div
      data-testid="draggable-card"
      style={{ x, y, cursor: state.isDragging ? "grabbing" : "grab", touchAction: "none" }}
      animate={{
        scale: state.isDragging ? 1.03 : 1,
        boxShadow: state.isDragging ? "0 8px 24px rgba(0,0,0,0.4)" : "0 0 0 rgba(0,0,0,0)",
      }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onClick={() => {
        if (!state.isDragging) onClick();
      }}
    >
      <TaskCard task={task} />
    </motion.div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/components/DraggableTaskCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/components/DraggableTaskCard.tsx webui/src/components/DraggableTaskCard.test.tsx
git commit -m "feat: add spring-animated draggable task card wrapper"
```

---

### Task 23: Board drag-and-drop integration — hit-testing, valid transitions, rubber-banding

**Files:**
- Create: `webui/src/lib/dragLogic.ts`
- Create: `webui/src/lib/dragLogic.test.ts`
- Modify: `webui/src/pages/Board.tsx`
- Modify: `webui/src/pages/Board.test.tsx`

Only two column-boundaries are real backend transitions (spec decision, confirmed during brainstorming):
Blocked→Backlog (retry) and Backlog→Ready (promote). Every other drop — including back onto the card's
own column — rubber-bands back via `DraggableTaskCard`'s own reject path (Task 22); this task only
decides *which* drops are valid and dispatches the matching API call.

- [ ] **Step 1: Write the failing tests for the pure logic**

```ts
// webui/src/lib/dragLogic.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDragAction, project, hitTestColumn } from "./dragLogic.js";

describe("resolveDragAction", () => {
  it("resolves blocked -> backlog as a retry", () => {
    expect(resolveDragAction("blocked", "backlog")).toBe("retry");
  });

  it("resolves backlog -> ready as a promote", () => {
    expect(resolveDragAction("backlog", "ready")).toBe("promote");
  });

  it("resolves any other pair as null (not a real transition)", () => {
    expect(resolveDragAction("backlog", "backlog")).toBeNull();
    expect(resolveDragAction("ready", "in_progress")).toBeNull();
    expect(resolveDragAction("review", "done")).toBeNull();
    expect(resolveDragAction("backlog", null)).toBeNull();
  });
});

describe("project", () => {
  it("returns 0 for 0 velocity", () => {
    expect(project(0)).toBe(0);
  });

  it("projects further for higher velocity", () => {
    expect(project(500)).toBeGreaterThan(project(100));
  });

  it("projects backward for negative velocity", () => {
    expect(project(-500)).toBeLessThan(0);
  });
});

describe("hitTestColumn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the stage of the column element under the given point", () => {
    const columnEl = { getAttribute: () => "ready" };
    const target = { closest: () => columnEl };
    vi.spyOn(document, "elementFromPoint").mockReturnValue(target as unknown as Element);

    expect(hitTestColumn({ x: 10, y: 10 }, { x: 0, y: 0 })).toBe("ready");
  });

  it("falls back to the velocity-projected point when the raw point misses", () => {
    const columnEl = { getAttribute: () => "backlog" };
    const hitTarget = { closest: () => columnEl };
    const missTarget = { closest: () => null };
    vi.spyOn(document, "elementFromPoint")
      .mockReturnValueOnce(missTarget as unknown as Element) // raw point: miss
      .mockReturnValueOnce(hitTarget as unknown as Element); // projected point: hit

    expect(hitTestColumn({ x: 10, y: 10 }, { x: 800, y: 0 })).toBe("backlog");
  });

  it("returns null when both the raw and projected points miss", () => {
    vi.spyOn(document, "elementFromPoint").mockReturnValue(null);
    expect(hitTestColumn({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/lib/dragLogic.test.ts`
Expected: FAIL — `Cannot find module './dragLogic.js'`.

- [ ] **Step 3: Implement `dragLogic.ts`**

```ts
// webui/src/lib/dragLogic.ts
import type { TaskStage } from "../types.js";
import type { Point } from "../hooks/useDragCard.js";

export function resolveDragAction(from: TaskStage, to: TaskStage | null): "retry" | "promote" | null {
  if (from === "blocked" && to === "backlog") return "retry";
  if (from === "backlog" && to === "ready") return "promote";
  return null;
}

// Apple's exponential-decay momentum projection (Designing Fluid Interfaces, WWDC 2018) -
// where a flick of this velocity would "land" if it decelerated naturally, in px.
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function elementColumnStage(point: Point): TaskStage | null {
  const el = document.elementFromPoint(point.x, point.y);
  const columnEl = el?.closest("[data-column-stage]");
  return (columnEl?.getAttribute("data-column-stage") as TaskStage | null) ?? null;
}

// Checks the raw release point first; if that misses, checks where the gesture's momentum would
// have carried it (§6) - so a fast flick that's released just short of a column boundary still
// counts, matching "take a small input and make a big output."
export function hitTestColumn(releasePoint: Point, velocity: Point): TaskStage | null {
  const raw = elementColumnStage(releasePoint);
  if (raw) return raw;
  const projected: Point = {
    x: releasePoint.x + project(velocity.x),
    y: releasePoint.y + project(velocity.y),
  };
  return elementColumnStage(projected);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/lib/dragLogic.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Write the failing test for the Board wiring**

Add to `Board.test.tsx`:

```tsx
import { api } from "../api.js";
vi.mock("../api.js", () => ({
  api: { listTasks: vi.fn(), retryTask: vi.fn(), promoteTask: vi.fn() },
}));

// ... existing TASK helper and tests unchanged ...

describe("Board drag-and-drop", () => {
  it("renders each column with a data-column-stage attribute matching its stage", async () => {
    (api.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { container } = render(<Board />);
    await screen.findByText("Backlog");

    for (const stage of ["backlog", "ready", "in_progress", "review", "blocked", "done"]) {
      expect(container.querySelector(`[data-column-stage="${stage}"]`)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run src/pages/Board.test.tsx`

- [ ] **Step 7: Wire `DraggableTaskCard` + drag handling into `Board.tsx`**

```tsx
// webui/src/pages/Board.tsx — changes on top of Task 20's version
import { DraggableTaskCard } from "../components/DraggableTaskCard.js";
import { resolveDragAction, hitTestColumn } from "../lib/dragLogic.js";
import type { Point } from "../hooks/useDragCard.js";
// ... other imports unchanged ...

export function Board() {
  // ... existing state (tasks, domains, showForm, selectedTaskId) and
  // useEffect/handleDomainChange/refetch/useRealtimeTasks unchanged from Tasks 17-20 ...

  async function handleDragRelease(
    taskId: string,
    _offset: Point,
    velocity: Point,
    releasePoint: Point,
  ): Promise<boolean> {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return false;

    const targetStage = hitTestColumn(releasePoint, velocity);
    const action = resolveDragAction(task.stage, targetStage);
    if (!action) return false;

    try {
      if (action === "retry") await api.retryTask(taskId);
      if (action === "promote") await api.promoteTask(taskId);
      refetch();
      return true;
    } catch (err) {
      console.error(`Failed to ${action} task via drag:`, err);
      return false;
    }
  }

  // ... visibleTasks, selectedTask unchanged ...

  return (
    <div style={{ padding: 16 }}>
      {/* ... DomainFilter + New Task button row unchanged ... */}
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {COLUMNS.map(({ stage, label }) => (
          <div key={stage} data-column-stage={stage} style={{ flex: 1, minWidth: 0 }}>
            <h3>{label}</h3>
            {visibleTasks.filter((t) => t.stage === stage).map((t) => (
              <DraggableTaskCard
                key={t.id}
                task={t}
                onClick={() => setSelectedTaskId(t.id)}
                onDragRelease={handleDragRelease}
              />
            ))}
          </div>
        ))}
      </div>
      {/* ... showForm/selectedTask overlays unchanged from Task 19 ... */}
    </div>
  );
}
```

(Replace the plain `<div onClick=... style={{cursor:"pointer"}}><TaskCard task={t} /></div>` wrapper
from Task 19 with `<DraggableTaskCard>` above — `TaskCard` itself, Task 16's component, is unchanged;
`DraggableTaskCard` already renders it internally.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run`

- [ ] **Step 9: Run the full frontend suite and build**

Run: `cd /Users/patrikfriis/Projects/Unelma/webui && npx vitest run && npm run build`

- [ ] **Step 10: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add webui/src/lib/dragLogic.ts webui/src/lib/dragLogic.test.ts webui/src/pages/Board.tsx webui/src/pages/Board.test.tsx
git commit -m "feat: wire card drag-and-drop with column hit-testing and rubber-band rejection"
```

---

## Part C — Deployment (Task 24)

### Task 24: DNS, reverse proxy/TLS, deploy build step, and end-to-end verification

**Files:** none (infrastructure + manual verification, matching Phase 1's Task 16 pattern)

- [ ] **Step 1: Point DNS — Cloudflare-proxied, not DNS-only**

In Cloudflare's dashboard for `unelmaboard.com`: add an `A` record for `@` (and optionally `www`)
pointing at `46.62.211.102`, with the proxy status set to **Proxied** (orange cloud) — decided
deliberately, not left open, specifically so the free-tier WAF is available: an EU-only geo-block rule
and a rate limit on `POST /api/auth/login` (tracked as its own backlog task, "Cloudflare EU geo-block +
rate-limit for unelmaboard.com" — do that dashboard config as part of this step, or right after; it's
infra work, not something to promote for automated dev-task execution).

- [ ] **Step 2: Set up the reverse proxy + TLS on the VPS**

Since traffic is Cloudflare-proxied (Step 1), set Cloudflare's SSL/TLS mode to **Full (strict)** —
Flexible mode would leave the Cloudflare-to-VPS hop unencrypted, which defeats the point. Full (strict)
still requires a valid cert on the VPS itself, but Cloudflare issues a free, long-lived (15-year)
**Origin CA certificate** for exactly this purpose — install that as a static cert rather than running
Let's Encrypt/certbot on the VPS (no ACME renewal automation needed; note the 15-year expiry somewhere
so it's not a forgotten problem in 2041).

Install and configure Caddy (simplest for a single-domain personal setup) to terminate that cert and
reverse-proxy to the app:

```
unelmaboard.com {
  tls /etc/caddy/unelmaboard-origin.pem /etc/caddy/unelmaboard-origin-key.pem
  reverse_proxy localhost:3000
}
```

(Paths illustrative — place the downloaded Origin CA cert/key wherever the actual Caddy install
convention puts them.) Exact Caddy install command depends on the OS package available at
implementation time (`sudo apt install caddy` via Caddy's official apt repo, similar process to the
`gh` install in Phase 1's plan, `docs/superpowers/plans/2026-09-21-personal-assistant-phase1-plan.md`,
Task 16).

- [ ] **Step 3: Add the frontend build to the deploy path**

Update the standard deploy sequence (documented in project memory) from:
```
git pull && npm install && npm run build
```
to also build the frontend:
```
git pull && npm install && npm run build && (cd webui && npm install && npm run build)
```

- [ ] **Step 4: Set the new env vars**

Add to `/opt/saleikko/.env`: `KANBAN_UI_PASSWORD` (choose a real password, not a placeholder).
`WEBUI_STATIC_DIR` can be left unset (defaults to `webui/dist` relative to the process's cwd, which is
already `/opt/saleikko`).

- [ ] **Step 5: Apply the `progress_status` migration**

Same dashboard-SQL-editor workflow as every other migration in this project:
`https://supabase.com/dashboard/project/dydaacdthjkoxvmnfddx/sql/new` — paste Task 1's
`alter table` statement, then Task 11's `alter publication` statement. Verify both took effect: the
column via a REST curl check (`Accept-Profile: assistant`, confirm `progress_status` appears in a
returned row), the publication via the `pg_publication_tables` query given in Task 11.

- [ ] **Step 6: Deploy and smoke-test**

1. Redeploy via the standard `patrik` sudo path (now including the frontend build from Step 3), restart
   the service.
2. Visit `https://unelmaboard.com` — confirm the login page loads over HTTPS with a valid cert (no
   browser warning).
3. Log in with the real password, confirm it lands on the board with all 6 columns.
4. Create a test task via the UI, confirm it appears in Backlog and (via `/tasks` on Telegram) that
   Telegram sees the same task — proves both interfaces share the same data correctly.
5. Promote it, confirm it moves to Ready in the UI without a manual refresh (proves the realtime SSE
   path works end to end).
6. Delete the test task afterward via a direct REST call (same cleanup pattern used for Phase 1's smoke
   test) — this UI has no delete endpoint by design (§09), so cleanup goes through the REST API
   directly, same as before.

- [ ] **Step 7: Update project memory**

Record what was learned: which reverse proxy was actually used, any deviation from this plan's DNS/TLS
assumptions, and confirmation that the `assistant` schema Realtime publication actually delivered
events end to end (the one genuinely unverifiable-from-a-sandbox assumption this plan made).

---

## Self-Review

**Spec coverage:** every section of `2026-09-23-kanban-web-ui-design.md` maps to a task — architecture
(Tasks 4, 12, 13), data model (Task 1), board layout (Tasks 15-16), cards/filtering (Tasks 16-17), task
actions (Tasks 7-10, 18-19), auth (Tasks 3-4), hosting (Task 24). The retry-target decision (backlog,
not straight to ready) is reflected in Task 10's implementation exactly as decided during brainstorming.
Drag-and-drop (Tasks 21-23) and its "only 2 of 6 column-boundaries are real, everything else
rubber-bands" scoping were decided in a follow-up round of brainstorming after the spec was written
(triggered by explicitly invoking the `apple-design` skill) — not reflected in the spec document itself,
since the spec predates that decision. Worth a follow-up edit to the spec to record this scoping
decision permanently, rather than leaving it only in this plan.

**Type consistency:** `Task`/`TaskStage`/`TaskDomain` in `webui/src/types.ts` mirror the backend's
`AssistantTask`/`TaskStage`/`TaskDomain` from `src/types.ts` by name and shape — kept as a separate,
intentionally-duplicated type file (the frontend is a genuinely separate package with its own
`package.json`/build, not sharing TS types across the Vite/tsc boundary without real module-resolution
work that isn't worth it for a handful of fields). `WebServerDeps` in `src/webui/server.ts` is extended
incrementally across Tasks 4-11 exactly as `SchedulerDeps` was extended incrementally in Phase 1 — each
extension's test includes every field defined so far. `Point` (from `useDragCard.ts`, Task 21) is reused
by name in `DraggableTaskCard.tsx` (Task 22) and `dragLogic.ts` (Task 23) rather than redefined.

**Honesty about unresolved specifics:** Task 11 explicitly flags the Supabase Realtime publication
requirement as something that must be verified against the real project, not assumed. Task 22 flags the
exact `motion` package export surface (`motion/react` vs `motion`) as needing confirmation against the
actually-installed version. Task 24 decides Cloudflare-proxied + Origin CA over DNS-only + Let's Encrypt
(unlocking free WAF geo-blocking/rate-limiting), consistent with how Phase 1's plan handled
its own genuinely-unverifiable-from-a-sandbox specifics (Tasks 5, 13, 14, 15 there). The spring
`damping`/`response` values throughout Tasks 21-23 are explicitly flagged in this plan's header as a
starting point to tune, not a source-verified constant — unlike, say, the `project()` deceleration-rate
constant (`0.998`), which comes directly from Apple's own published sample code and isn't a guess.
