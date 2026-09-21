# Personal AI Assistant — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of the personal AI assistant (spec: `docs/superpowers/specs/2026-09-18-personal-assistant-design.md`) — task creation/management over Telegram, a nightly loop that autonomously implements DEV-domain tasks (via headless Claude Code CLI or GitHub Copilot, dispatched to your choice) and opens PRs, blocked/review notifications, a morning brief, and two-Claude-account parallelism.

**Architecture:** Extends the existing Unelma/Säleikkö repo and service (same Telegram bot, same VPS, same Supabase project) rather than a new codebase. New `assistant` schema holds `tasks`/`task_events`. New Telegram commands (`/task`, `/tasks`, `/promote`) manage the board; two new nightly cron jobs (mirroring the existing ingest/briefing jobs in `src/scheduler/index.ts`) drive execution and the morning brief. Dev-task execution shells out to the real `claude` CLI (headless/print mode) or dispatches to GitHub's Copilot coding agent via a GitHub issue — never a bespoke reimplementation of an agentic loop.

**Tech Stack:** TypeScript, Node.js `child_process` (built-in, no new dependency), `@anthropic-ai/sdk`, `@supabase/supabase-js`, `grammy`, `node-cron`, `zod`, `gh` CLI (system binary, not an npm package), `claude` CLI (system binary).

Repo: `/Users/patrikfriis/Projects/Unelma`. Spec: `docs/superpowers/specs/2026-09-18-personal-assistant-design.md` (this repo, `treeniapp`, per project convention).

**A note on two integrations this plan cannot fully pin down in advance:** the exact `claude` CLI flags for unattended headless execution (Task 5) and the exact mechanics of assigning a GitHub issue to Copilot's coding agent (Task 14) are both real, documented capabilities, but their precise current syntax should be re-verified against `claude --help` / GitHub's current docs at implementation time rather than trusted blindly from this plan — flagged explicitly in those tasks rather than glossed over.

---

### Task 1: `assistant` schema — tables and types

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `src/types.ts`
- Create: `src/supabase/assistantClient.ts`
- Test: `src/supabase/assistantClient.test.ts`

The existing `createSupabaseClient` (`src/supabase/client.ts`) is hardcoded to the `saleikko` schema (`db: { schema: "saleikko" }`), so a second client pointed at the new `assistant` schema is needed — Supabase JS clients are schema-scoped per instance, they can't query across schemas from one client.

- [ ] **Step 1: Write the failing test**

```ts
// src/supabase/assistantClient.test.ts
import { describe, it, expect, vi } from "vitest";
import { createAssistantClient } from "./assistantClient.js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ mocked: true })),
}));

describe("createAssistantClient", () => {
  it("creates a Supabase client scoped to the assistant schema", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    createAssistantClient({
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "key",
    } as any);

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "key",
      { db: { schema: "assistant" } },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/supabase/assistantClient.test.ts`
Expected: FAIL — `Cannot find module './assistantClient.js'`.

- [ ] **Step 3: Implement `assistantClient.ts`**

```ts
// src/supabase/assistantClient.ts
import { createClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";

export function createAssistantClient(config: Config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    db: { schema: "assistant" },
  });
}

export type AssistantClient = ReturnType<typeof createAssistantClient>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/supabase/assistantClient.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Add the schema and tables to `schema.sql`**

Append to `supabase/schema.sql` (after the existing `saleikko.app_state` block, at the end of the file):

```sql
create schema if not exists assistant;

create table assistant.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  domain text not null check (domain in ('coo', 'dev', 'politics', 'monitor')),
  stage text not null default 'backlog'
    check (stage in ('backlog', 'ready', 'in_progress', 'review', 'blocked', 'done')),
  priority int not null default 2 check (priority between 1 and 3),
  created_by text not null check (created_by in ('manual', 'telegram', 'claude_desktop', 'agent')),
  assigned_model text check (assigned_model in ('claude', 'gemini', 'ollama', 'copilot', 'auto')),
  context jsonb not null default '{}'::jsonb,
  result_summary text,
  artifacts text[] not null default '{}',
  repo text,
  pr_url text,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (domain != 'dev' or repo is not null)
);

create table assistant.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references assistant.tasks(id),
  from_stage text,
  to_stage text not null,
  model_used text,
  agent_note text,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 6: Add TypeScript types to `types.ts`**

Append to `src/types.ts`:

```ts
export type TaskDomain = "coo" | "dev" | "politics" | "monitor";
export type TaskStage = "backlog" | "ready" | "in_progress" | "review" | "blocked" | "done";
export type AssignedModel = "claude" | "gemini" | "ollama" | "copilot" | "auto";

export interface AssistantTask {
  id: string;
  title: string;
  description: string;
  domain: TaskDomain;
  stage: TaskStage;
  priority: number;
  created_by: "manual" | "telegram" | "claude_desktop" | "agent";
  assigned_model: AssignedModel | null;
  context: Record<string, unknown>;
  result_summary: string | null;
  artifacts: string[];
  repo: string | null;
  pr_url: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  from_stage: string | null;
  to_stage: string;
  model_used: string | null;
  agent_note: string | null;
  created_at: string;
}
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`
Expected: all existing tests still pass, plus the 1 new test; clean build.

- [ ] **Step 8: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add supabase/schema.sql src/types.ts src/supabase/assistantClient.ts src/supabase/assistantClient.test.ts
git commit -m "feat: add assistant schema (tasks, task_events) and types"
```

---

### Task 2: `/task` command — create a dev task in backlog

**Files:**
- Create: `src/assistant/repos.ts`
- Create: `src/assistant/repos.test.ts`
- Create: `src/telegram/assistantCommands.ts`
- Create: `src/telegram/assistantCommands.test.ts`

A separate `assistantCommands.ts` (rather than extending the existing `src/telegram/commands.ts`) keeps the politics-domain commands and the task-board commands in separate, independently-testable files — matching how `src/skills/politics/` and other domains are already separated by directory.

Only two repos exist right now (`treeniapp`, this one, and `unelma`/`saleikko`, the one this code lives in) — a small hardcoded alias map avoids the user having to type full GitHub URLs in a Telegram message, and avoids inventing a general-purpose config system nobody asked for yet.

- [ ] **Step 1: Write the failing test for the repo alias map**

```ts
// src/assistant/repos.test.ts
import { describe, it, expect } from "vitest";
import { resolveRepoAlias } from "./repos.js";

describe("resolveRepoAlias", () => {
  it("resolves known aliases to owner/repo", () => {
    expect(resolveRepoAlias("treeniapp")).toBe("patrikfriis-alt/treeniapp");
    expect(resolveRepoAlias("unelma")).toBe("patrikfriis-alt/Unelma");
    expect(resolveRepoAlias("saleikko")).toBe("patrikfriis-alt/Unelma");
  });

  it("is case-insensitive", () => {
    expect(resolveRepoAlias("Treeniapp")).toBe("patrikfriis-alt/treeniapp");
  });

  it("returns null for an unknown alias", () => {
    expect(resolveRepoAlias("nonexistent")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/repos.test.ts`
Expected: FAIL — `Cannot find module './repos.js'`.

- [ ] **Step 3: Implement `repos.ts`**

```ts
// src/assistant/repos.ts
const REPO_ALIASES: Record<string, string> = {
  treeniapp: "patrikfriis-alt/treeniapp",
  unelma: "patrikfriis-alt/Unelma",
  saleikko: "patrikfriis-alt/Unelma",
};

export function resolveRepoAlias(alias: string): string | null {
  return REPO_ALIASES[alias.toLowerCase()] ?? null;
}

export function listRepoAliases(): string[] {
  return Object.keys(REPO_ALIASES);
}
```

**IMPORTANT:** verify the exact `owner/repo` values above against the real GitHub remotes before implementing — confirm with `git remote -v` in both `/Users/patrikfriis/Projects/treeniapp` and `/Users/patrikfriis/Projects/Unelma`, don't assume the values above are correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/repos.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `/task`**

```ts
// src/telegram/assistantCommands.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerAssistantCommands } from "./assistantCommands.js";
import type { Bot } from "grammy";
import type { AssistantClient } from "../supabase/assistantClient.js";

function makeFakeBot() {
  const handlers: Record<string, (ctx: any) => Promise<void>> = {};
  const bot = {
    command: vi.fn((name: string, handler: any) => {
      handlers[name] = handler;
    }),
  } as unknown as Bot;
  return { bot, handlers };
}

describe("registerAssistantCommands", () => {
  it("registers /task, /tasks and /promote", () => {
    const { bot, handlers } = makeFakeBot();
    const supabase = {} as AssistantClient;

    registerAssistantCommands(bot, supabase);

    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining(["task", "tasks", "promote"]),
    );
  });

  it("/task creates a backlog dev task for a known repo alias", async () => {
    const { bot, handlers } = makeFakeBot();
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as AssistantClient;

    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    const ctx = { match: "treeniapp lisää tumma teema", reply } as any;
    await handlers["task"](ctx);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "dev",
        stage: "backlog",
        created_by: "telegram",
        repo: "patrikfriis-alt/treeniapp",
        description: "lisää tumma teema",
      }),
    );
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Tehtävä lisätty"));
  });

  it("/task replies with usage when the repo alias is missing or unknown", async () => {
    const { bot, handlers } = makeFakeBot();
    const supabase = { from: vi.fn() } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["task"]({ match: "jotain ilman repoa", reply } as any);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Käytä muotoa"));
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/assistantCommands.test.ts`
Expected: FAIL — `Cannot find module './assistantCommands.js'`.

- [ ] **Step 7: Implement `assistantCommands.ts` (this task's slice — just `/task`; `/tasks` and `/promote` are stubbed to satisfy the registration test and filled in by Tasks 3–4)**

```ts
// src/telegram/assistantCommands.ts
import type { Bot } from "grammy";
import type { AssistantClient } from "../supabase/assistantClient.js";
import { resolveRepoAlias, listRepoAliases } from "../assistant/repos.js";

export function registerAssistantCommands(bot: Bot, supabase: AssistantClient): void {
  bot.command("task", async (ctx) => {
    const raw = ctx.match?.toString().trim() ?? "";
    const [aliasRaw, ...rest] = raw.split(" ");
    const description = rest.join(" ").trim();
    const repo = aliasRaw ? resolveRepoAlias(aliasRaw) : null;

    if (!aliasRaw || !repo || !description) {
      await ctx.reply(
        `Käytä muotoa: /task <repo> <kuvaus>\nTunnetut repot: ${listRepoAliases().join(", ")}`,
      );
      return;
    }

    const { error } = await supabase.from("tasks").insert({
      title: description.slice(0, 80),
      description,
      domain: "dev",
      stage: "backlog",
      created_by: "telegram",
      repo,
    });
    if (error) {
      await ctx.reply(`Tehtävän luonti epäonnistui: ${error.message}`);
      return;
    }
    await ctx.reply(`Tehtävä lisätty backlogiin (${repo}).`);
  });

  bot.command("tasks", async (ctx) => {
    await ctx.reply("(toteutetaan Tehtävässä 3)");
  });

  bot.command("promote", async (ctx) => {
    await ctx.reply("(toteutetaan Tehtävässä 4)");
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/assistantCommands.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Wire `registerAssistantCommands` into `src/index.ts`**

Read the current `src/index.ts` first to confirm its exact shape (it was last modified in the skills-registry work), then add the assistant client + command registration alongside the existing `registerCommands` call — following the same pattern (create client, pass to register function, call before `bot.start()`).

- [ ] **Step 10: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`
Expected: all tests pass, clean build.

- [ ] **Step 11: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/repos.ts src/assistant/repos.test.ts src/telegram/assistantCommands.ts src/telegram/assistantCommands.test.ts src/index.ts
git commit -m "feat: add /task command to create backlog dev tasks"
```

---

### Task 3: `/tasks` command — list tasks by stage

**Files:**
- Modify: `src/telegram/assistantCommands.ts`
- Modify: `src/telegram/assistantCommands.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `assistantCommands.test.ts`:

```ts
describe("/tasks", () => {
  it("defaults to listing backlog tasks", async () => {
    const { bot, handlers } = makeFakeBot();
    const order = vi.fn(() =>
      Promise.resolve({
        data: [
          { id: "11111111-1111-1111-1111-111111111111", title: "Lisää tumma teema", repo: "patrikfriis-alt/treeniapp" },
        ],
        error: null,
      }),
    );
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["tasks"]({ match: "", reply } as any);

    expect(eq).toHaveBeenCalledWith("stage", "backlog");
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Lisää tumma teema"));
  });

  it("lists a specific stage when given as an argument", async () => {
    const { bot, handlers } = makeFakeBot();
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["tasks"]({ match: "review", reply } as any);

    expect(eq).toHaveBeenCalledWith("stage", "review");
  });

  it("rejects an invalid stage name", async () => {
    const { bot, handlers } = makeFakeBot();
    const supabase = { from: vi.fn() } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["tasks"]({ match: "ei_ole_vaihe", reply } as any);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Tuntematon vaihe"));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("says when a stage has no tasks", async () => {
    const { bot, handlers } = makeFakeBot();
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["tasks"]({ match: "backlog", reply } as any);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Ei tehtäviä"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/assistantCommands.test.ts`
Expected: the 4 new tests FAIL (current `/tasks` handler is a stub).

- [ ] **Step 3: Implement the `/tasks` handler**

Add near the top of `assistantCommands.ts`:

```ts
import type { TaskStage } from "../types.js";

const VALID_STAGES: TaskStage[] = ["backlog", "ready", "in_progress", "review", "blocked", "done"];
```

Replace the stub `bot.command("tasks", ...)` block with:

```ts
  bot.command("tasks", async (ctx) => {
    const arg = ctx.match?.toString().trim();
    const stage = (arg || "backlog") as TaskStage;
    if (!VALID_STAGES.includes(stage)) {
      await ctx.reply(`Tuntematon vaihe "${arg}". Käytä jotain näistä: ${VALID_STAGES.join(", ")}`);
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, repo")
      .eq("stage", stage)
      .order("created_at", { ascending: true });
    if (error) {
      await ctx.reply(`Tehtävien haku epäonnistui: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      await ctx.reply(`Ei tehtäviä vaiheessa "${stage}".`);
      return;
    }
    const lines = data.map(
      (t: any) => `• [${t.id.slice(0, 8)}] ${t.title}${t.repo ? ` (${t.repo})` : ""}`,
    );
    await ctx.reply(`Vaihe "${stage}":\n${lines.join("\n")}`);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/assistantCommands.test.ts`
Expected: PASS (7 tests total: 3 from Task 2 + 4 new)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/telegram/assistantCommands.ts src/telegram/assistantCommands.test.ts
git commit -m "feat: add /tasks command to list tasks by stage"
```

---

### Task 4: `/promote` command — backlog → ready, with executor choice

**Files:**
- Modify: `src/telegram/assistantCommands.ts`
- Modify: `src/telegram/assistantCommands.test.ts`

Per the spec (§06), dev-task executor assignment is always manual, never automatic — `/promote` is where that choice is made.

- [ ] **Step 1: Write the failing tests**

Add to `assistantCommands.test.ts`:

```ts
describe("/promote", () => {
  it("promotes a dev task to ready with the given executor", async () => {
    const { bot, handlers } = makeFakeBot();
    const single = vi.fn(() =>
      Promise.resolve({ data: { id: "aaaaaaaa-0000-0000-0000-000000000000", domain: "dev" }, error: null }),
    );
    const selectEq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq: selectEq }));
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tasks") return { select, update };
        if (table === "task_events") return { insert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["promote"]({ match: "aaaaaaaa claude", reply } as any);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "ready", assigned_model: "claude" }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ from_stage: "backlog", to_stage: "ready" }),
    );
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Siirretty"));
  });

  it("requires an executor for dev-domain tasks", async () => {
    const { bot, handlers } = makeFakeBot();
    const single = vi.fn(() =>
      Promise.resolve({ data: { id: "aaaaaaaa-0000-0000-0000-000000000000", domain: "dev" }, error: null }),
    );
    const selectEq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq: selectEq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["promote"]({ match: "aaaaaaaa", reply } as any);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Käytä muotoa"));
  });

  it("rejects an executor other than claude or copilot", async () => {
    const { bot, handlers } = makeFakeBot();
    const single = vi.fn(() =>
      Promise.resolve({ data: { id: "aaaaaaaa-0000-0000-0000-000000000000", domain: "dev" }, error: null }),
    );
    const selectEq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq: selectEq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["promote"]({ match: "aaaaaaaa gemini", reply } as any);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("claude"));
  });

  it("replies when the task id prefix does not match any task", async () => {
    const { bot, handlers } = makeFakeBot();
    const single = vi.fn(() => Promise.resolve({ data: null, error: { message: "no rows" } }));
    const selectEq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq: selectEq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;
    registerAssistantCommands(bot, supabase);

    const reply = vi.fn();
    await handlers["promote"]({ match: "zzzzzzzz claude", reply } as any);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Tehtävää ei löytynyt"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/assistantCommands.test.ts`
Expected: the 4 new tests FAIL (current `/promote` is a stub).

**Note on the id-prefix lookup:** the tests above pass an 8-character prefix (matching what `/tasks` displays, per Task 3's `t.id.slice(0, 8)`) and expect a `.eq("id", ...)` style lookup to still work — since Postgres `uuid` columns don't support prefix matching via `eq`, the real implementation must query by prefix differently (e.g. `.ilike("id::text", "aaaaaaaa%")` is not valid on a uuid column either). **Resolve this before implementing:** either change `/tasks` to display the full UUID (simplest, avoids the prefix-matching problem entirely — just less convenient to type back), or add a `short_id` generated column. Recommend the former (full UUID) to keep this task small; update Task 3's display format and this task's tests accordingly if so.

- [ ] **Step 3: Implement the `/promote` handler**

(Adjust based on the id-prefix decision above — this shows the full-UUID version, the simpler option:)

```ts
  bot.command("promote", async (ctx) => {
    const parts = (ctx.match?.toString().trim() ?? "").split(/\s+/).filter(Boolean);
    const [id, executor] = parts;

    if (!id) {
      await ctx.reply("Käytä muotoa: /promote <id> [claude|copilot]");
      return;
    }

    const { data: task, error: fetchError } = await supabase
      .from("tasks")
      .select("id, domain")
      .eq("id", id)
      .single();
    if (fetchError || !task) {
      await ctx.reply(`Tehtävää ei löytynyt id:llä "${id}".`);
      return;
    }

    let assignedModel: string | null = null;
    if (task.domain === "dev") {
      if (!executor) {
        await ctx.reply("Käytä muotoa: /promote <id> <claude|copilot> (dev-tehtävä vaatii toteuttajan)");
        return;
      }
      if (executor !== "claude" && executor !== "copilot") {
        await ctx.reply('Toteuttajan pitää olla "claude" tai "copilot".');
        return;
      }
      assignedModel = executor;
    }

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ stage: "ready", assigned_model: assignedModel })
      .eq("id", id);
    if (updateError) {
      await ctx.reply(`Siirto epäonnistui: ${updateError.message}`);
      return;
    }

    const { error: eventError } = await supabase.from("task_events").insert({
      task_id: id,
      from_stage: "backlog",
      to_stage: "ready",
    });
    if (eventError) {
      console.error(`promote: failed to log task_event for ${id}: ${eventError.message}`);
    }

    await ctx.reply(`Siirretty valmiiksi (ready)${assignedModel ? ` — toteuttaja: ${assignedModel}` : ""}.`);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/assistantCommands.test.ts`
Expected: PASS (11 tests total)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/telegram/assistantCommands.ts src/telegram/assistantCommands.test.ts
git commit -m "feat: add /promote command, manual executor choice for dev tasks"
```

---

### Task 5: Headless Claude Code CLI invocation wrapper

**Files:**
- Create: `src/assistant/claudeCli.ts`
- Create: `src/assistant/claudeCli.test.ts`

**BEFORE implementing this task:** run `claude --help` (and check current Claude Code CLI docs) on a machine with the CLI installed, and confirm:
1. The exact flag for one-shot non-interactive execution (this plan assumes `--print` / `-p`).
2. The exact flag for skipping interactive tool-use approval when no human is present to approve (this plan assumes `--dangerously-skip-permissions` — a real, documented flag for unattended/CI use, but confirm it still exists under this name).
3. Whether `--output-format json` (or similar) is available to get structured success/failure info instead of parsing free-text stdout.

If any of these differ from what's below, update the implementation accordingly — do not implement against unverified assumptions.

This wrapper only handles *spawning the CLI and capturing its result*; it does not know about git, worktrees, or Supabase — those are Task 6 and Task 8's job. Keeping this narrow makes it mockable via `child_process` in every other task's tests.

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/claudeCli.test.ts
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runClaudeHeadless } from "./claudeCli.js";

function makeFakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe("runClaudeHeadless", () => {
  it("resolves with stdout when the process exits 0", async () => {
    const child = makeFakeChild();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(child);

    const resultPromise = runClaudeHeadless({
      prompt: "tee jotain",
      cwd: "/tmp/task-1",
      configDir: "/home/saleikko/.claude-account-1",
    });

    child.stdout.emit("data", Buffer.from("valmis\n"));
    child.emit("close", 0);

    const result = await resultPromise;
    expect(result).toEqual({ success: true, stdout: "valmis\n", stderr: "" });
    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--print", "tee jotain", "--dangerously-skip-permissions"]),
      expect.objectContaining({
        cwd: "/tmp/task-1",
        env: expect.objectContaining({ CLAUDE_CONFIG_DIR: "/home/saleikko/.claude-account-1" }),
      }),
    );
  });

  it("resolves with success: false and stderr when the process exits non-zero", async () => {
    const child = makeFakeChild();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(child);

    const resultPromise = runClaudeHeadless({
      prompt: "tee jotain",
      cwd: "/tmp/task-1",
      configDir: "/home/saleikko/.claude-account-1",
    });

    child.stderr.emit("data", Buffer.from("virhe\n"));
    child.emit("close", 1);

    const result = await resultPromise;
    expect(result).toEqual({ success: false, stdout: "", stderr: "virhe\n" });
  });

  it("resolves with success: false if the process errors before spawning (e.g. binary not found)", async () => {
    const child = makeFakeChild();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(child);

    const resultPromise = runClaudeHeadless({
      prompt: "tee jotain",
      cwd: "/tmp/task-1",
      configDir: "/home/saleikko/.claude-account-1",
    });

    child.emit("error", new Error("spawn claude ENOENT"));

    const result = await resultPromise;
    expect(result).toEqual({ success: false, stdout: "", stderr: "spawn claude ENOENT" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/claudeCli.test.ts`
Expected: FAIL — `Cannot find module './claudeCli.js'`.

- [ ] **Step 3: Implement `claudeCli.ts`**

```ts
// src/assistant/claudeCli.ts
import { spawn } from "node:child_process";

export interface RunClaudeHeadlessOptions {
  prompt: string;
  cwd: string;
  configDir: string;
}

export interface RunClaudeHeadlessResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export function runClaudeHeadless(
  options: RunClaudeHeadlessOptions,
): Promise<RunClaudeHeadlessResult> {
  return new Promise((resolve) => {
    const child = spawn("claude", [
      "--print", options.prompt,
      "--dangerously-skip-permissions",
    ], {
      cwd: options.cwd,
      env: { ...process.env, CLAUDE_CONFIG_DIR: options.configDir },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (error) => {
      resolve({ success: false, stdout: "", stderr: error.message });
    });

    child.on("close", (code) => {
      resolve({ success: code === 0, stdout: code === 0 ? stdout : "", stderr: code === 0 ? "" : stderr });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/claudeCli.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/claudeCli.ts src/assistant/claudeCli.test.ts
git commit -m "feat: add headless Claude Code CLI invocation wrapper"
```

---

### Task 6: Fresh-clone worktree setup for a task

**Files:**
- Create: `src/assistant/taskWorkspace.ts`
- Create: `src/assistant/taskWorkspace.test.ts`

Rather than maintaining a persistent local clone + `git worktree add` per task (which would require pre-cloning every repo the assistant might ever touch), each task gets a **fresh `git clone`** into its own directory — functionally just as isolated, and simpler when the set of target repos isn't fixed in advance. Slightly slower per task, which doesn't matter for an overnight batch job.

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/taskWorkspace.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd, _args, _opts, cb) => cb(null, "", "")),
}));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  rm: vi.fn(() => Promise.resolve()),
}));

import { execFile } from "node:child_process";
import { setUpTaskWorkspace, tearDownTaskWorkspace } from "./taskWorkspace.js";

describe("setUpTaskWorkspace", () => {
  it("creates a fresh branch and clones the repo into a task-scoped directory", async () => {
    const path = await setUpTaskWorkspace({
      taskId: "aaaaaaaa-0000-0000-0000-000000000000",
      repo: "patrikfriis-alt/treeniapp",
      baseDir: "/opt/assistant-work",
    });

    expect(path).toBe("/opt/assistant-work/aaaaaaaa-0000-0000-0000-000000000000");
    expect(execFile).toHaveBeenCalledWith(
      "git",
      [
        "clone",
        "git@github.com:patrikfriis-alt/treeniapp.git",
        "/opt/assistant-work/aaaaaaaa-0000-0000-0000-000000000000",
      ],
      expect.anything(),
      expect.any(Function),
    );
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["checkout", "-b", "assistant/aaaaaaaa-0000-0000-0000-000000000000"],
      expect.objectContaining({ cwd: "/opt/assistant-work/aaaaaaaa-0000-0000-0000-000000000000" }),
      expect.any(Function),
    );
  });
});

describe("tearDownTaskWorkspace", () => {
  it("removes the task-scoped directory", async () => {
    const { rm } = await import("node:fs/promises");
    await tearDownTaskWorkspace({
      taskId: "aaaaaaaa-0000-0000-0000-000000000000",
      baseDir: "/opt/assistant-work",
    });
    expect(rm).toHaveBeenCalledWith(
      "/opt/assistant-work/aaaaaaaa-0000-0000-0000-000000000000",
      { recursive: true, force: true },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/taskWorkspace.test.ts`
Expected: FAIL — `Cannot find module './taskWorkspace.js'`.

- [ ] **Step 3: Implement `taskWorkspace.ts`**

```ts
// src/assistant/taskWorkspace.ts
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const execFile = promisify(execFileCb);

export interface SetUpTaskWorkspaceOptions {
  taskId: string;
  repo: string;
  baseDir: string;
}

export async function setUpTaskWorkspace(options: SetUpTaskWorkspaceOptions): Promise<string> {
  const workDir = path.join(options.baseDir, options.taskId);
  await mkdir(options.baseDir, { recursive: true });
  await execFile("git", ["clone", `git@github.com:${options.repo}.git`, workDir]);
  await execFile("git", ["checkout", "-b", `assistant/${options.taskId}`], { cwd: workDir });
  return workDir;
}

export interface TearDownTaskWorkspaceOptions {
  taskId: string;
  baseDir: string;
}

export async function tearDownTaskWorkspace(options: TearDownTaskWorkspaceOptions): Promise<void> {
  const workDir = path.join(options.baseDir, options.taskId);
  await rm(workDir, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/taskWorkspace.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/taskWorkspace.ts src/assistant/taskWorkspace.test.ts
git commit -m "feat: add fresh-clone workspace setup/teardown for dev tasks"
```

---

### Task 7: PR-verification helper

**Files:**
- Create: `src/assistant/githubPr.ts`
- Create: `src/assistant/githubPr.test.ts`

After the `claude` CLI run finishes, we need to confirm it actually pushed a branch and opened a PR (rather than trusting its stdout, which could claim success without having actually done anything) — `gh pr list --head <branch>` gives a ground-truth check.

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/githubPr.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { findPrForBranch } from "./githubPr.js";

describe("findPrForBranch", () => {
  it("returns the PR url when gh finds one for the branch", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd, _args, _opts, cb) =>
        cb(null, JSON.stringify([{ url: "https://github.com/patrikfriis-alt/treeniapp/pull/42" }]), ""),
    );

    const url = await findPrForBranch({
      repo: "patrikfriis-alt/treeniapp",
      branch: "assistant/aaaaaaaa",
      cwd: "/opt/assistant-work/aaaaaaaa",
    });

    expect(url).toBe("https://github.com/patrikfriis-alt/treeniapp/pull/42");
    expect(execFile).toHaveBeenCalledWith(
      "gh",
      ["pr", "list", "--head", "assistant/aaaaaaaa", "--repo", "patrikfriis-alt/treeniapp", "--json", "url"],
      expect.objectContaining({ cwd: "/opt/assistant-work/aaaaaaaa" }),
      expect.any(Function),
    );
  });

  it("returns null when no PR exists for the branch yet", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd, _args, _opts, cb) => cb(null, "[]", ""),
    );

    const url = await findPrForBranch({
      repo: "patrikfriis-alt/treeniapp",
      branch: "assistant/aaaaaaaa",
      cwd: "/opt/assistant-work/aaaaaaaa",
    });

    expect(url).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/githubPr.test.ts`
Expected: FAIL — `Cannot find module './githubPr.js'`.

- [ ] **Step 3: Implement `githubPr.ts`**

```ts
// src/assistant/githubPr.ts
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface FindPrForBranchOptions {
  repo: string;
  branch: string;
  cwd: string;
}

export async function findPrForBranch(options: FindPrForBranchOptions): Promise<string | null> {
  const { stdout } = await execFile(
    "gh",
    ["pr", "list", "--head", options.branch, "--repo", options.repo, "--json", "url"],
    { cwd: options.cwd },
  );
  const prs = JSON.parse(stdout) as { url: string }[];
  return prs[0]?.url ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/githubPr.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/githubPr.ts src/assistant/githubPr.test.ts
git commit -m "feat: add PR-verification helper via gh pr list"
```

---

### Task 8: Per-task dev executor

**Files:**
- Create: `src/assistant/devExecutor.ts`
- Create: `src/assistant/devExecutor.test.ts`

Ties Tasks 5–7 together into the actual per-task flow: mark `in_progress` → set up workspace → invoke `claude` headlessly → verify a PR exists → mark `review` (with `pr_url`) or `blocked` (with a note) → always tear down the workspace.

- [ ] **Step 1: Write the failing tests**

```ts
// src/assistant/devExecutor.test.ts
import { describe, it, expect, vi } from "vitest";
import { executeDevTask } from "./devExecutor.js";
import type { AssistantClient } from "../supabase/assistantClient.js";
import type { AssistantTask } from "../types.js";

vi.mock("./taskWorkspace.js", () => ({
  setUpTaskWorkspace: vi.fn(() => Promise.resolve("/opt/assistant-work/task-1")),
  tearDownTaskWorkspace: vi.fn(() => Promise.resolve()),
}));
vi.mock("./claudeCli.js", () => ({
  runClaudeHeadless: vi.fn(),
}));
vi.mock("./githubPr.js", () => ({
  findPrForBranch: vi.fn(),
}));

const TASK: AssistantTask = {
  id: "task-1",
  title: "Lisää tumma teema",
  description: "Lisää tumma teema asetuksiin",
  domain: "dev",
  stage: "ready",
  priority: 2,
  created_by: "telegram",
  assigned_model: "claude",
  context: {},
  result_summary: null,
  artifacts: [],
  repo: "patrikfriis-alt/treeniapp",
  pr_url: null,
  scheduled_for: null,
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
};

function makeSupabaseMock() {
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "tasks") return { update };
      if (table === "task_events") return { insert };
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as AssistantClient;
  return { supabase, update, insert };
}

describe("executeDevTask", () => {
  it("marks the task in_progress, then review with the PR url on success", async () => {
    const { runClaudeHeadless } = await import("./claudeCli.js");
    const { findPrForBranch } = await import("./githubPr.js");
    (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true, stdout: "done", stderr: "",
    });
    (findPrForBranch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "https://github.com/patrikfriis-alt/treeniapp/pull/42",
    );
    const { supabase, update } = makeSupabaseMock();

    await executeDevTask(supabase, TASK, {
      claudeConfigDir: "/home/saleikko/.claude-account-1",
      workspaceBaseDir: "/opt/assistant-work",
    });

    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({ stage: "in_progress" }));
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stage: "review", pr_url: "https://github.com/patrikfriis-alt/treeniapp/pull/42" }),
    );
  });

  it("marks the task blocked when claude exits non-zero", async () => {
    const { runClaudeHeadless } = await import("./claudeCli.js");
    (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false, stdout: "", stderr: "jotain meni pieleen",
    });
    const { supabase, update } = makeSupabaseMock();

    await executeDevTask(supabase, TASK, {
      claudeConfigDir: "/home/saleikko/.claude-account-1",
      workspaceBaseDir: "/opt/assistant-work",
    });

    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stage: "blocked", result_summary: expect.stringContaining("jotain meni pieleen") }),
    );
  });

  it("marks the task blocked when claude reports success but no PR was actually opened", async () => {
    const { runClaudeHeadless } = await import("./claudeCli.js");
    const { findPrForBranch } = await import("./githubPr.js");
    (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true, stdout: "done", stderr: "",
    });
    (findPrForBranch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { supabase, update } = makeSupabaseMock();

    await executeDevTask(supabase, TASK, {
      claudeConfigDir: "/home/saleikko/.claude-account-1",
      workspaceBaseDir: "/opt/assistant-work",
    });

    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stage: "blocked", result_summary: expect.stringContaining("ei PR:ää") }),
    );
  });

  it("tears down the workspace even when claude fails", async () => {
    const { runClaudeHeadless } = await import("./claudeCli.js");
    const { tearDownTaskWorkspace } = await import("./taskWorkspace.js");
    (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false, stdout: "", stderr: "boom",
    });
    const { supabase } = makeSupabaseMock();

    await executeDevTask(supabase, TASK, {
      claudeConfigDir: "/home/saleikko/.claude-account-1",
      workspaceBaseDir: "/opt/assistant-work",
    });

    expect(tearDownTaskWorkspace).toHaveBeenCalledWith({ taskId: "task-1", baseDir: "/opt/assistant-work" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/devExecutor.test.ts`
Expected: FAIL — `Cannot find module './devExecutor.js'`.

- [ ] **Step 3: Implement `devExecutor.ts`**

```ts
// src/assistant/devExecutor.ts
import type { AssistantClient } from "../supabase/assistantClient.js";
import type { AssistantTask } from "../types.js";
import { setUpTaskWorkspace, tearDownTaskWorkspace } from "./taskWorkspace.js";
import { runClaudeHeadless } from "./claudeCli.js";
import { findPrForBranch } from "./githubPr.js";

export interface ExecuteDevTaskOptions {
  claudeConfigDir: string;
  workspaceBaseDir: string;
}

function buildPrompt(task: AssistantTask): string {
  return (
    `Implement this task, following the repository's existing conventions (check CLAUDE.md if present). ` +
    `When finished, commit your changes and open a pull request against main (never push to main directly) ` +
    `using the gh CLI.\n\nTitle: ${task.title}\n\nDescription:\n${task.description}`
  );
}

async function updateTaskStage(
  supabase: AssistantClient,
  task: AssistantTask,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("tasks").update(fields).eq("id", task.id);
  if (error) {
    console.error(`executeDevTask: failed to update task ${task.id}: ${error.message}`);
  }
  const { error: eventError } = await supabase.from("task_events").insert({
    task_id: task.id,
    from_stage: task.stage,
    to_stage: fields.stage,
    model_used: "claude",
    agent_note: typeof fields.result_summary === "string" ? fields.result_summary : null,
  });
  if (eventError) {
    console.error(`executeDevTask: failed to log task_event for ${task.id}: ${eventError.message}`);
  }
}

export async function executeDevTask(
  supabase: AssistantClient,
  task: AssistantTask,
  options: ExecuteDevTaskOptions,
): Promise<void> {
  if (!task.repo) {
    throw new Error(`executeDevTask: task ${task.id} has no repo`);
  }

  await updateTaskStage(supabase, task, { stage: "in_progress" });

  const workDir = await setUpTaskWorkspace({
    taskId: task.id,
    repo: task.repo,
    baseDir: options.workspaceBaseDir,
  });

  try {
    const result = await runClaudeHeadless({
      prompt: buildPrompt(task),
      cwd: workDir,
      configDir: options.claudeConfigDir,
    });

    if (!result.success) {
      await updateTaskStage(supabase, task, {
        stage: "blocked",
        result_summary: `Claude epäonnistui: ${result.stderr}`,
      });
      return;
    }

    const prUrl = await findPrForBranch({
      repo: task.repo,
      branch: `assistant/${task.id}`,
      cwd: workDir,
    });

    if (!prUrl) {
      await updateTaskStage(supabase, task, {
        stage: "blocked",
        result_summary: "Claude raportoi onnistumisen, mutta ei PR:ää löytynyt.",
      });
      return;
    }

    await updateTaskStage(supabase, task, {
      stage: "review",
      pr_url: prUrl,
      result_summary: result.stdout.slice(0, 2000),
    });
  } finally {
    await tearDownTaskWorkspace({ taskId: task.id, baseDir: options.workspaceBaseDir });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/devExecutor.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/devExecutor.ts src/assistant/devExecutor.test.ts
git commit -m "feat: add per-task dev executor tying workspace+claude+PR-check together"
```

---

### Task 9: Nightly dev-task cron job

**Files:**
- Modify: `src/scheduler/index.ts`
- Modify: `src/scheduler/index.test.ts`
- Modify: `src/config.ts`

Mirrors the existing hourly-ingest and daily-briefing jobs in the same file exactly — same `cron.schedule(..., { timezone: SCHEDULER_TIMEZONE })` pattern.

- [ ] **Step 1: Add new config fields**

Add to `Config` in `src/config.ts`:

```ts
  nightlyAssistantHour: number;
  claudeAccount1ConfigDir: string;
  assistantWorkspaceBaseDir: string;
```

Add to `loadConfig()`:

```ts
    nightlyAssistantHour: parseNumber(
      process.env.NIGHTLY_ASSISTANT_HOUR ?? "22",
      "NIGHTLY_ASSISTANT_HOUR",
    ),
    claudeAccount1ConfigDir: requireEnv("CLAUDE_ACCOUNT_1_CONFIG_DIR"),
    assistantWorkspaceBaseDir: process.env.ASSISTANT_WORKSPACE_BASE_DIR ?? "/opt/assistant-work",
```

- [ ] **Step 2: Write the failing test**

Add to `src/scheduler/index.test.ts` (following the exact structure of the existing daily-briefing test — read the current file first to match its mock setup precisely, since `SchedulerDeps` is being extended):

```ts
it("processes ready dev tasks nightly via executeDevTask", async () => {
  const { executeDevTask } = await import("../assistant/devExecutor.js");
  const task = { id: "task-1", domain: "dev", stage: "ready", repo: "patrikfriis-alt/treeniapp" };
  const order = vi.fn(() => Promise.resolve({ data: [task], error: null }));
  const eq2 = vi.fn(() => ({ order }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const assistantSupabase = { from: vi.fn(() => ({ select })) };

  const supabase = {} as SupabaseClient;
  const anthropic = {} as Anthropic;
  const bot = { api: { sendMessage: vi.fn() } } as unknown as Bot;

  scheduleJobs({
    supabase,
    anthropic,
    bot,
    allowedUserId: 123456,
    dailyBriefingHour: 7,
    assistantSupabase: assistantSupabase as any,
    nightlyAssistantHour: 22,
    claudeAccount1ConfigDir: "/home/saleikko/.claude-account-1",
    assistantWorkspaceBaseDir: "/opt/assistant-work",
  });

  const scheduleCalls = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls;
  // 3rd registered job: hourly ingest, daily briefing, then this one
  const nightlyJobFn = scheduleCalls[2][1] as () => Promise<void>;
  await nightlyJobFn();

  expect(executeDevTask).toHaveBeenCalledWith(assistantSupabase, task, expect.objectContaining({
    claudeConfigDir: "/home/saleikko/.claude-account-1",
    workspaceBaseDir: "/opt/assistant-work",
  }));
});
```

Also add near the top of the test file, alongside the other `vi.mock` calls:

```ts
vi.mock("../assistant/devExecutor.js", () => ({
  executeDevTask: vi.fn(() => Promise.resolve()),
}));
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/scheduler/index.test.ts`
Expected: FAIL — `scheduleJobs` doesn't accept the new fields yet / only 2 cron jobs registered.

- [ ] **Step 4: Extend `SchedulerDeps` and add the cron job**

In `src/scheduler/index.ts`, add to the imports:

```ts
import type { AssistantClient } from "../supabase/assistantClient.js";
import { executeDevTask } from "../assistant/devExecutor.js";
```

Extend `SchedulerDeps`:

```ts
export interface SchedulerDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  bot: Bot;
  allowedUserId: number;
  dailyBriefingHour: number;
  assistantSupabase: AssistantClient;
  nightlyAssistantHour: number;
  claudeAccount1ConfigDir: string;
  assistantWorkspaceBaseDir: string;
}
```

Destructure the new fields at the top of `scheduleJobs` and add a third `cron.schedule` call (after the existing daily-briefing one, before the closing brace of `scheduleJobs`):

```ts
  cron.schedule(
    `0 ${nightlyAssistantHour} * * *`,
    async () => {
      try {
        const { data: readyDevTasks, error } = await assistantSupabase
          .from("tasks")
          .select("*")
          .eq("domain", "dev")
          .eq("stage", "ready")
          .order("priority", { ascending: true });
        if (error) {
          throw new Error(`nightly assistant job: ${error.message}`);
        }
        for (const task of (readyDevTasks ?? []) as AssistantTask[]) {
          if (task.assigned_model !== "claude") continue; // copilot dispatch: Task 14
          await executeDevTask(assistantSupabase, task, {
            claudeConfigDir: claudeAccount1ConfigDir,
            workspaceBaseDir: assistantWorkspaceBaseDir,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await notifyError(bot, allowedUserId, `⚠️ Yön tehtäväajo epäonnistui: ${message}`);
      }
    },
    { timezone: SCHEDULER_TIMEZONE },
  );
```

Add the `AssistantTask` import from `../types.js` alongside the other type imports.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/scheduler/index.test.ts`
Expected: PASS — check the exact number of tests matches existing + 1 new.

- [ ] **Step 6: Update `src/index.ts` to pass the new `scheduleJobs` args**

Wire in `createAssistantClient(config)` and the new config fields alongside the existing `scheduleJobs(...)` call.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 8: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/scheduler/index.ts src/scheduler/index.test.ts src/config.ts src/index.ts
git commit -m "feat: add nightly cron job dispatching ready dev tasks to Claude"
```

---

### Task 10: Blocked/review Telegram notifications

**Files:**
- Modify: `src/assistant/devExecutor.ts`
- Modify: `src/assistant/devExecutor.test.ts`

`executeDevTask` currently has no way to notify Telegram — thread the `bot`/`allowedUserId` through so the human finds out about a `review` or `blocked` result without having to run `/tasks` and check manually.

- [ ] **Step 1: Write the failing tests**

Add to `devExecutor.test.ts` (extend the existing `ExecuteDevTaskOptions` object in every existing test call to include `bot` and `allowedUserId`, since the signature is changing — update all 4 existing tests' options objects, then add):

```ts
it("notifies Telegram when the task moves to review", async () => {
  const { runClaudeHeadless } = await import("./claudeCli.js");
  const { findPrForBranch } = await import("./githubPr.js");
  (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true, stdout: "done", stderr: "",
  });
  (findPrForBranch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    "https://github.com/patrikfriis-alt/treeniapp/pull/42",
  );
  const { supabase } = makeSupabaseMock();
  const sendMessage = vi.fn();

  await executeDevTask(supabase, TASK, {
    claudeConfigDir: "/home/saleikko/.claude-account-1",
    workspaceBaseDir: "/opt/assistant-work",
    bot: { api: { sendMessage } } as any,
    allowedUserId: 123456,
  });

  expect(sendMessage).toHaveBeenCalledWith(
    123456,
    expect.stringContaining("https://github.com/patrikfriis-alt/treeniapp/pull/42"),
  );
});

it("notifies Telegram when the task is blocked", async () => {
  const { runClaudeHeadless } = await import("./claudeCli.js");
  (runClaudeHeadless as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: false, stdout: "", stderr: "boom",
  });
  const { supabase } = makeSupabaseMock();
  const sendMessage = vi.fn();

  await executeDevTask(supabase, TASK, {
    claudeConfigDir: "/home/saleikko/.claude-account-1",
    workspaceBaseDir: "/opt/assistant-work",
    bot: { api: { sendMessage } } as any,
    allowedUserId: 123456,
  });

  expect(sendMessage).toHaveBeenCalledWith(123456, expect.stringContaining("Jumissa"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/devExecutor.test.ts`
Expected: existing 4 tests FAIL (missing `bot`/`allowedUserId` in options — TypeScript will also flag this at build time), 2 new tests FAIL.

- [ ] **Step 3: Implement the notification**

In `devExecutor.ts`, add to imports:

```ts
import type { Bot } from "grammy";
```

Extend `ExecuteDevTaskOptions`:

```ts
export interface ExecuteDevTaskOptions {
  claudeConfigDir: string;
  workspaceBaseDir: string;
  bot: Bot;
  allowedUserId: number;
}
```

At each of the three `updateTaskStage(supabase, task, { stage: "blocked" | "review", ... })` call sites in `executeDevTask`, add a Telegram notification right after. For the `review` case:

```ts
    await updateTaskStage(supabase, task, {
      stage: "review",
      pr_url: prUrl,
      result_summary: result.stdout.slice(0, 2000),
    });
    await options.bot.api.sendMessage(
      options.allowedUserId,
      `✅ Tehtävä valmis tarkistettavaksi: ${task.title}\n${prUrl}`,
    );
    return;
```

For both `blocked` call sites, add after each:

```ts
    await options.bot.api.sendMessage(
      options.allowedUserId,
      `🚧 Jumissa: ${task.title}\n${/* the same result_summary string used above */}`,
    );
```

(Use the actual local variable holding each blocked message rather than repeating the string literal — refactor each blocked branch to build the message once, pass it to both `updateTaskStage` and `sendMessage`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/devExecutor.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Update the Task 9 call site in `scheduler/index.ts`**

Pass `bot` and `allowedUserId` through to `executeDevTask`'s options object (both already in scope in the cron job closure).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/devExecutor.ts src/assistant/devExecutor.test.ts src/scheduler/index.ts
git commit -m "feat: notify Telegram when a dev task reaches review or blocked"
```

---

### Task 11: Morning brief composer (dev-domain slice)

**Files:**
- Create: `src/assistant/morningBrief.ts`
- Create: `src/assistant/morningBrief.test.ts`

Only summarizes dev-task overnight activity in Phase 1 (COO/politics/monitor domains aren't executed yet, so there's nothing to report there) — reuses the existing `splitIntoTelegramChunks` from `src/skills/politics/briefing.ts` in case a busy night produces a long summary, same reasoning as the daily-briefing fix earlier in this project.

- [ ] **Step 1: Write the failing tests**

```ts
// src/assistant/morningBrief.test.ts
import { describe, it, expect, vi } from "vitest";
import { composeMorningBrief } from "./morningBrief.js";
import type { AssistantClient } from "../supabase/assistantClient.js";

describe("composeMorningBrief", () => {
  it("summarizes tasks that reached review or blocked since the given timestamp", async () => {
    const inFilter = vi.fn(() => ({
      gte: vi.fn(() =>
        Promise.resolve({
          data: [
            { title: "Lisää tumma teema", stage: "review", pr_url: "https://github.com/x/pull/1", result_summary: null },
            { title: "Korjaa build", stage: "blocked", pr_url: null, result_summary: "Testit eivät menneet läpi." },
          ],
          error: null,
        }),
      ),
    }));
    const select = vi.fn(() => ({ in: inFilter }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;

    const message = await composeMorningBrief(supabase, "2026-09-20T22:00:00Z");

    expect(message).toContain("Lisää tumma teema");
    expect(message).toContain("https://github.com/x/pull/1");
    expect(message).toContain("Korjaa build");
    expect(message).toContain("Testit eivät menneet läpi.");
  });

  it("says nothing happened when no tasks changed stage", async () => {
    const inFilter = vi.fn(() => ({ gte: vi.fn(() => Promise.resolve({ data: [], error: null })) }));
    const select = vi.fn(() => ({ in: inFilter }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as AssistantClient;

    const message = await composeMorningBrief(supabase, "2026-09-20T22:00:00Z");

    expect(message).toContain("Ei yön aikana valmistuneita");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/morningBrief.test.ts`
Expected: FAIL — `Cannot find module './morningBrief.js'`.

- [ ] **Step 3: Implement `morningBrief.ts`**

```ts
// src/assistant/morningBrief.ts
import type { AssistantClient } from "../supabase/assistantClient.js";

export async function composeMorningBrief(
  supabase: AssistantClient,
  since: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("tasks")
    .select("title, stage, pr_url, result_summary")
    .in("stage", ["review", "blocked"])
    .gte("updated_at", since);
  if (error) {
    throw new Error(`composeMorningBrief: ${error.message}`);
  }

  const lines: string[] = ["🌅 Aamubriiffi — yön tehtäväajo"];

  if (!data || data.length === 0) {
    lines.push("", "Ei yön aikana valmistuneita tai jumiin jääneitä tehtäviä.");
    return lines.join("\n");
  }

  const reviews = data.filter((t: any) => t.stage === "review");
  const blocked = data.filter((t: any) => t.stage === "blocked");

  if (reviews.length > 0) {
    lines.push("", "✅ Tarkistettavana:");
    for (const t of reviews as any[]) {
      lines.push(`• ${t.title}${t.pr_url ? `\n  ${t.pr_url}` : ""}`);
    }
  }

  if (blocked.length > 0) {
    lines.push("", "🚧 Jumissa:");
    for (const t of blocked as any[]) {
      lines.push(`• ${t.title}${t.result_summary ? `\n  ${t.result_summary}` : ""}`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/morningBrief.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/morningBrief.ts src/assistant/morningBrief.test.ts
git commit -m "feat: add morning brief composer for overnight dev-task results"
```

---

### Task 12: Morning brief cron job

**Files:**
- Modify: `src/scheduler/index.ts`
- Modify: `src/scheduler/index.test.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Add config field**

Add to `Config` in `src/config.ts`:

```ts
  morningBriefHour: number;
```

Add to `loadConfig()`:

```ts
    morningBriefHour: parseNumber(process.env.MORNING_BRIEF_HOUR ?? "7", "MORNING_BRIEF_HOUR"),
```

- [ ] **Step 2: Write the failing test**

Add to `src/scheduler/index.test.ts`:

```ts
vi.mock("../assistant/morningBrief.js", () => ({
  composeMorningBrief: vi.fn(() => Promise.resolve("aamubriiffi")),
}));

it("sends the morning brief covering the last 24h", async () => {
  const { composeMorningBrief } = await import("../assistant/morningBrief.js");
  const assistantSupabase = {} as any;
  const supabase = {} as SupabaseClient;
  const anthropic = {} as Anthropic;
  const sendMessage = vi.fn();
  const bot = { api: { sendMessage } } as unknown as Bot;

  scheduleJobs({
    supabase,
    anthropic,
    bot,
    allowedUserId: 123456,
    dailyBriefingHour: 7,
    assistantSupabase,
    nightlyAssistantHour: 22,
    claudeAccount1ConfigDir: "/home/saleikko/.claude-account-1",
    assistantWorkspaceBaseDir: "/opt/assistant-work",
    morningBriefHour: 7,
  });

  const scheduleCalls = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const morningBriefJobFn = scheduleCalls[3][1] as () => Promise<void>;
  await morningBriefJobFn();

  expect(composeMorningBrief).toHaveBeenCalledWith(assistantSupabase, expect.any(String));
  expect(sendMessage).toHaveBeenCalledWith(123456, "aamubriiffi");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/scheduler/index.test.ts`
Expected: FAIL — 4th cron job doesn't exist yet.

- [ ] **Step 4: Implement the cron job**

Add to imports in `scheduler/index.ts`:

```ts
import { composeMorningBrief } from "../assistant/morningBrief.js";
import { splitIntoTelegramChunks } from "../skills/politics/briefing.js";
```

Add `morningBriefHour: number;` to `SchedulerDeps`, destructure it, and add a 4th `cron.schedule` call:

```ts
  cron.schedule(
    `0 ${morningBriefHour} * * *`,
    async () => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const message = await composeMorningBrief(assistantSupabase, since);
        for (const chunk of splitIntoTelegramChunks(message)) {
          await bot.api.sendMessage(allowedUserId, chunk);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await notifyError(bot, allowedUserId, `⚠️ Aamubriiffin koostaminen epäonnistui: ${message}`);
      }
    },
    { timezone: SCHEDULER_TIMEZONE },
  );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/scheduler/index.test.ts`
Expected: PASS

- [ ] **Step 6: Update `src/index.ts`**

Pass `morningBriefHour: config.morningBriefHour` into `scheduleJobs(...)`.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 8: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/scheduler/index.ts src/scheduler/index.test.ts src/config.ts src/index.ts
git commit -m "feat: add morning brief cron job"
```

---

### Task 13: Two-Claude-account parallelism

**Files:**
- Modify: `src/config.ts`
- Modify: `src/scheduler/index.ts`
- Modify: `src/scheduler/index.test.ts`

**BEFORE implementing:** confirm `CLAUDE_CONFIG_DIR` (used in Task 5) is genuinely the correct, current mechanism for pointing the `claude` CLI at a second, independently-authenticated account/config on the same machine — verify against current Claude Code CLI docs, since this is the crux of the whole parallelism feature.

- [ ] **Step 1: Add second account config**

Add to `Config` in `src/config.ts`:

```ts
  claudeAccount2ConfigDir: string;
```

Add to `loadConfig()`:

```ts
    claudeAccount2ConfigDir: requireEnv("CLAUDE_ACCOUNT_2_CONFIG_DIR"),
```

- [ ] **Step 2: Write the failing test**

Add to `src/scheduler/index.test.ts` — this test replaces the single-task assertion from Task 9's test with a 2-task, 2-account scenario:

```ts
it("dispatches up to 2 ready claude dev tasks concurrently, one per account", async () => {
  const { executeDevTask } = await import("../assistant/devExecutor.js");
  const taskA = { id: "task-a", domain: "dev", stage: "ready", assigned_model: "claude", repo: "patrikfriis-alt/treeniapp" };
  const taskB = { id: "task-b", domain: "dev", stage: "ready", assigned_model: "claude", repo: "patrikfriis-alt/Unelma" };
  const order = vi.fn(() => Promise.resolve({ data: [taskA, taskB], error: null }));
  const eq2 = vi.fn(() => ({ order }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const assistantSupabase = { from: vi.fn(() => ({ select })) };

  const supabase = {} as SupabaseClient;
  const anthropic = {} as Anthropic;
  const bot = { api: { sendMessage: vi.fn() } } as unknown as Bot;

  scheduleJobs({
    supabase, anthropic, bot, allowedUserId: 123456, dailyBriefingHour: 7,
    assistantSupabase: assistantSupabase as any,
    nightlyAssistantHour: 22,
    claudeAccount1ConfigDir: "/home/saleikko/.claude-account-1",
    claudeAccount2ConfigDir: "/home/saleikko/.claude-account-2",
    assistantWorkspaceBaseDir: "/opt/assistant-work",
    morningBriefHour: 7,
  });

  const scheduleCalls = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const nightlyJobFn = scheduleCalls[2][1] as () => Promise<void>;
  await nightlyJobFn();

  expect(executeDevTask).toHaveBeenCalledWith(assistantSupabase, taskA, expect.objectContaining({
    claudeConfigDir: "/home/saleikko/.claude-account-1",
  }));
  expect(executeDevTask).toHaveBeenCalledWith(assistantSupabase, taskB, expect.objectContaining({
    claudeConfigDir: "/home/saleikko/.claude-account-2",
  }));
});
```

Remove or update Task 9's original single-task test if it now conflicts with this one (both exercise the same cron job — consolidate into this richer version rather than keeping a redundant weaker test).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/scheduler/index.test.ts`
Expected: FAIL — both tasks currently get `claudeAccount1ConfigDir`, run sequentially not concurrently (test itself doesn't strictly prove concurrency, only account assignment — see note below).

- [ ] **Step 4: Implement concurrent dispatch across both accounts**

Replace the `for (const task of ...)` loop from Task 9 in the nightly cron job with:

```ts
        const claudeTasks = (readyDevTasks ?? []).filter(
          (t: AssistantTask) => t.assigned_model === "claude",
        ) as AssistantTask[];
        const configDirs = [claudeAccount1ConfigDir, claudeAccount2ConfigDir];

        for (let i = 0; i < claudeTasks.length; i += configDirs.length) {
          const batch = claudeTasks.slice(i, i + configDirs.length);
          await Promise.all(
            batch.map((task, idx) =>
              executeDevTask(assistantSupabase, task, {
                claudeConfigDir: configDirs[idx],
                workspaceBaseDir: assistantWorkspaceBaseDir,
                bot,
                allowedUserId,
              }),
            ),
          );
        }
```

This processes tasks in batches of 2 (one per account), each batch running concurrently via `Promise.all`, then moving to the next batch — so throughput is 2x, but never more than 2 tasks in flight at once.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/scheduler/index.test.ts`
Expected: PASS

- [ ] **Step 6: Update `src/index.ts`**

Pass `claudeAccount2ConfigDir: config.claudeAccount2ConfigDir` into `scheduleJobs(...)`.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 8: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/config.ts src/scheduler/index.ts src/scheduler/index.test.ts src/index.ts
git commit -m "feat: dispatch dev tasks across both Claude accounts, 2 concurrent"
```

---

### Task 14: GitHub Copilot dispatch — issue creation and assignment

**Files:**
- Create: `src/assistant/copilotDispatch.ts`
- Create: `src/assistant/copilotDispatch.test.ts`

**BEFORE implementing:** this is the least-proven integration in the whole plan. Confirm, against GitHub's current docs, before writing real code:
1. That GitHub Copilot's coding agent is actually enabled/available for the target repos on your current plan (it requires Copilot Business/Enterprise or an eligible individual plan with the feature turned on per-repo).
2. The exact identifier to assign an issue to Copilot (this plan assumes the `gh issue create --assignee` flow works with a value like `copilot` or `copilot-swe-agent`, but the real bot/app username may differ — check `gh api repos/{owner}/{repo}/assignees` or GitHub's docs for the exact current value).

If Copilot's coding agent isn't actually available on your plan, treat this task as blocked and fall back to Claude-only dispatch until it is.

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/copilotDispatch.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
import { dispatchToCopilot } from "./copilotDispatch.js";
import type { AssistantTask } from "../types.js";

const TASK: AssistantTask = {
  id: "task-1",
  title: "Lisää tumma teema",
  description: "Lisää tumma teema asetuksiin",
  domain: "dev",
  stage: "ready",
  priority: 2,
  created_by: "telegram",
  assigned_model: "copilot",
  context: {},
  result_summary: null,
  artifacts: [],
  repo: "patrikfriis-alt/treeniapp",
  pr_url: null,
  scheduled_for: null,
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
};

describe("dispatchToCopilot", () => {
  it("creates a GitHub issue assigned to Copilot and returns its URL", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd, _args, _opts, cb) => cb(null, "https://github.com/patrikfriis-alt/treeniapp/issues/7\n", ""),
    );

    const issueUrl = await dispatchToCopilot(TASK);

    expect(issueUrl).toBe("https://github.com/patrikfriis-alt/treeniapp/issues/7");
    expect(execFile).toHaveBeenCalledWith(
      "gh",
      [
        "issue", "create",
        "--repo", "patrikfriis-alt/treeniapp",
        "--title", "Lisää tumma teema",
        "--body", "Lisää tumma teema asetuksiin",
        "--assignee", "copilot",
      ],
      expect.anything(),
      expect.any(Function),
    );
  });

  it("throws when the task has no repo", async () => {
    await expect(dispatchToCopilot({ ...TASK, repo: null })).rejects.toThrow("repo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/copilotDispatch.test.ts`
Expected: FAIL — `Cannot find module './copilotDispatch.js'`.

- [ ] **Step 3: Implement `copilotDispatch.ts`**

```ts
// src/assistant/copilotDispatch.ts
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { AssistantTask } from "../types.js";

const execFile = promisify(execFileCb);

export async function dispatchToCopilot(task: AssistantTask): Promise<string> {
  if (!task.repo) {
    throw new Error(`dispatchToCopilot: task ${task.id} has no repo`);
  }
  const { stdout } = await execFile("gh", [
    "issue", "create",
    "--repo", task.repo,
    "--title", task.title,
    "--body", task.description,
    "--assignee", "copilot",
  ]);
  return stdout.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/copilotDispatch.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into the nightly cron job**

In `scheduler/index.ts`'s nightly job, alongside the existing claude-task batching, add handling for `assigned_model === "copilot"` tasks: for each, call `dispatchToCopilot(task)`, then update the task's `context.github_issue_url` field and move it to `in_progress` (it stays `in_progress` until Task 15's polling job finds a resulting PR — Copilot works asynchronously on its own schedule, not within this cron run).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/copilotDispatch.ts src/assistant/copilotDispatch.test.ts src/scheduler/index.ts
git commit -m "feat: dispatch copilot-assigned dev tasks as GitHub issues"
```

---

### Task 15: GitHub Copilot PR-polling

**Files:**
- Create: `src/assistant/copilotPoll.ts`
- Create: `src/assistant/copilotPoll.test.ts`
- Modify: `src/scheduler/index.ts`
- Modify: `src/scheduler/index.test.ts`

Since Copilot works asynchronously on its own timeline (not within the nightly cron run itself), a separate, more frequent polling job checks `in_progress` copilot tasks for a resulting PR.

- [ ] **Step 1: Write the failing test**

```ts
// src/assistant/copilotPoll.test.ts
import { describe, it, expect, vi } from "vitest";
import { pollCopilotTasks } from "./copilotPoll.js";
import type { AssistantClient } from "../supabase/assistantClient.js";

vi.mock("./githubPr.js", () => ({ findPrForBranch: vi.fn() }));

describe("pollCopilotTasks", () => {
  it("moves a task to review once Copilot has opened a PR linked to its issue", async () => {
    const { findPrForBranch } = await import("./githubPr.js");
    (findPrForBranch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "https://github.com/patrikfriis-alt/treeniapp/pull/9",
    );

    const eq2 = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "task-1", repo: "patrikfriis-alt/treeniapp", context: { github_issue_url: "https://github.com/patrikfriis-alt/treeniapp/issues/7" } }],
        error: null,
      }),
    );
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tasks") return { select, update };
        if (table === "task_events") return { insert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as AssistantClient;

    await pollCopilotTasks(supabase);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "review", pr_url: "https://github.com/patrikfriis-alt/treeniapp/pull/9" }),
    );
  });

  it("leaves a task alone if Copilot hasn't opened a PR yet", async () => {
    const { findPrForBranch } = await import("./githubPr.js");
    (findPrForBranch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const eq2 = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "task-1", repo: "patrikfriis-alt/treeniapp", context: { github_issue_url: "https://github.com/patrikfriis-alt/treeniapp/issues/7" } }],
        error: null,
      }),
    );
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const update = vi.fn();
    const supabase = { from: vi.fn(() => ({ select, update })) } as unknown as AssistantClient;

    await pollCopilotTasks(supabase);

    expect(update).not.toHaveBeenCalled();
  });
});
```

**Note on branch-name lookup:** Copilot's coding agent creates its own branch name for the PR (not the `assistant/<task-id>` convention used for Claude-executed tasks), so `findPrForBranch` as written in Task 7 (which requires an exact branch name) won't work here as-is. Before implementing, either: (a) extend `githubPr.ts` with a variant that finds a PR by the linked issue number instead of branch name (GitHub's `gh pr list --search "linked:<issue-number>"` or similar), or (b) confirm Copilot's actual branch-naming convention and match on a prefix. Resolve this — don't assume the Task 7 helper works unmodified.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/copilotPoll.test.ts`
Expected: FAIL — `Cannot find module './copilotPoll.js'`.

- [ ] **Step 3: Implement `copilotPoll.ts`**

```ts
// src/assistant/copilotPoll.ts
import type { AssistantClient } from "../supabase/assistantClient.js";
import { findPrForBranch } from "./githubPr.js"; // or its issue-based variant, per the note above

export async function pollCopilotTasks(supabase: AssistantClient): Promise<void> {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, repo, context")
    .eq("stage", "in_progress")
    .eq("assigned_model", "copilot");
  if (error) {
    throw new Error(`pollCopilotTasks: ${error.message}`);
  }

  for (const task of (tasks ?? []) as any[]) {
    const prUrl = await findPrForBranch({
      repo: task.repo,
      // see the note above - this needs the issue-linked lookup, not a fixed branch name
      branch: "", // placeholder pending the githubPr.ts extension decided above
      cwd: process.cwd(),
    });
    if (!prUrl) continue;

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ stage: "review", pr_url: prUrl })
      .eq("id", task.id);
    if (updateError) {
      console.error(`pollCopilotTasks: failed to update task ${task.id}: ${updateError.message}`);
    }
    const { error: eventError } = await supabase.from("task_events").insert({
      task_id: task.id,
      from_stage: "in_progress",
      to_stage: "review",
      model_used: "copilot",
    });
    if (eventError) {
      console.error(`pollCopilotTasks: failed to log task_event for ${task.id}: ${eventError.message}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/assistant/copilotPoll.test.ts`
Expected: PASS (2 tests) — once the branch-vs-issue lookup from the note above is actually resolved and implemented, not left as the placeholder shown here.

- [ ] **Step 5: Add a polling cron job**

In `scheduler/index.ts`, add a 5th `cron.schedule` call running more frequently than the nightly/morning jobs — e.g. `"*/30 * * * *"` (every 30 minutes) — calling `pollCopilotTasks(assistantSupabase)`, wrapped in the same try/catch + `notifyError` pattern as the other jobs. Add a corresponding test in `scheduler/index.test.ts` following the exact structure of the existing cron-job tests.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test && npm run build`

- [ ] **Step 7: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/assistant/copilotPoll.ts src/assistant/copilotPoll.test.ts src/scheduler/index.ts src/scheduler/index.test.ts
git commit -m "feat: poll for Copilot-opened PRs and move tasks to review"
```

---

### Task 16: Manual VPS prerequisites and end-to-end verification

**Files:** none (documentation + manual verification, matching Vaihe 1's Task 19 pattern)

This system's core capability — an agent editing real code and opening real PRs unattended — cannot be meaningfully verified by unit tests alone. This task documents the one-time manual setup and the final real-world check.

- [ ] **Step 1: Document and perform manual VPS setup**

On the VPS (`ssh patrik@46.62.211.102`):
1. Install the `claude` CLI and `gh` CLI (`sudo apt install gh` or per GitHub's install docs; `claude` per Anthropic's current install instructions for the target OS/architecture).
2. Authenticate `gh`: `gh auth login`, with a token/account that has write access to both `treeniapp` and `Unelma` repos.
3. Authenticate `claude` twice, into two separate config directories, one per Claude account (exact commands depend on the answer to Task 5's flag-verification step — likely something like running `claude` interactively once per account with `CLAUDE_CONFIG_DIR` pointed at each target directory, then confirming both work non-interactively before relying on them unattended).
4. Set up SSH access for `git clone`/`git push` from the VPS to both target repos (a deploy key per repo, or a single key with access to both, added as a GitHub SSH key — `Unelma` already has one from the original Vaihe 1 deploy; `treeniapp` needs its own).
5. **Enable branch protection on `main`** in both `treeniapp` and `Unelma`, requiring PR review before merge — this is the actual technical backstop against an accidental direct push, not just the agent's own good behavior.
6. Set the new env vars in `/opt/saleikko/.env`: `NIGHTLY_ASSISTANT_HOUR`, `CLAUDE_ACCOUNT_1_CONFIG_DIR`, `CLAUDE_ACCOUNT_2_CONFIG_DIR`, `ASSISTANT_WORKSPACE_BASE_DIR`, `MORNING_BRIEF_HOUR`.

- [ ] **Step 2: Apply the `assistant` schema migration**

Same process as every prior migration on this project: paste Task 1's SQL into the Supabase Dashboard SQL Editor for the production project (the Supabase CLI's logged-in account still can't reach this project — see `project_vps_connectivity_incident_2026-09-03.md` memory). Verify via `curl` with `-H "Accept-Profile: assistant"` that both tables return `200`.

- [ ] **Step 3: Deploy and smoke-test the whole loop manually, once, in daylight**

1. Deploy via the standard `patrik` sudo path (`git pull && npm install && npm run build && sudo systemctl restart saleikko`).
2. Send `/task treeniapp <some small, genuinely safe test change>` over Telegram.
3. `/promote <id> claude`.
4. Manually trigger the nightly job once rather than waiting for the actual scheduled hour (temporarily invoke it directly, e.g. via a one-off script or by lowering `NIGHTLY_ASSISTANT_HOUR` to the next few minutes and reverting after) — confirm it actually clones, runs `claude` headlessly, and opens a real PR.
5. Confirm the Telegram notification arrives, and that `/tasks review` shows the task.
6. Review the actual PR content for sanity before ever letting this run unattended overnight for real.

- [ ] **Step 4: Update project memory**

Once verified, save what was learned (exact `claude`/`gh` CLI flags that actually worked, any deviations from this plan's assumptions, VPS spec after the upgrade) to a project memory file — this plan made several explicit "verify at implementation time" assumptions (Tasks 5, 13, 14, 15) that are worth recording as confirmed-or-corrected facts once real, rather than leaving them as open questions forever.

---

## Self-Review

**Spec coverage:** every Phase 1 bullet from `2026-09-18-personal-assistant-design.md` §09 maps to a task — Supabase tables (Task 1), Telegram task commands (Tasks 2–4), nightly DEV loop (Tasks 5–10), two-Claude parallelism (Task 13), GitHub Copilot as an alternative executor (Tasks 14–15), morning brief (Tasks 11–12), blocked state + notifications (Task 10). Manual VPS/GitHub setup and real-world verification (Task 16) matches the established pattern from Vaihe 1's Task 19.

**Type consistency:** `AssistantTask`/`TaskStage`/`TaskDomain`/`AssignedModel` are defined once in Task 1 (`src/types.ts`) and imported by name everywhere else without redefinition. `ExecuteDevTaskOptions` is introduced in Task 8 and extended (not redefined) in Task 10 to add `bot`/`allowedUserId`. `SchedulerDeps` is extended incrementally across Tasks 9, 12, and 13 rather than each task silently assuming fields the previous one didn't actually add — each extension task's test explicitly includes every field defined so far.

**Honesty about unresolved specifics:** Tasks 5, 13, 14, and 15 each contain an explicit "verify before implementing" callout for real external-tool behavior (`claude` CLI flags, multi-account config-dir mechanism, GitHub Copilot's exact assignment identifier and PR-linking mechanism) that this plan cannot fully pin down without a machine that actually has these tools installed and authenticated. These are flagged inline rather than either guessed at with false confidence or silently omitted — an implementer following this plan needs to resolve them at the specific step called out, not discover the gap mid-task.
