# Säleikkö: Taitojen (skills) rakennusjärjestelmä — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Säleikkö's free-text chat (Telegram DM + terminal REPL, both via `handleFreeTextMessage`) the ability to call skills through Anthropic tool-calling, and prove the mechanism works with two real skills: speech drafting and presentation drafting.

**Architecture:** A skill registry (`src/skills/registry.ts` + `src/skills/index.ts`) lists `Skill` objects (`name`, `description`, `input_schema`, `handler`). `handleFreeTextMessage` passes the registry's tools to `messages.create`, and loops (max 5 rounds) executing any `tool_use` blocks Claude requests until a final text reply comes back. Two existing politics functions (`searchArchive`, and a new `draftPositionForQuery` extracted from the `/kannanotto` handler) are wrapped as tools without duplicating logic; two new skills (`speeches`, `presentations`) follow `positions.ts`'s existing shape (own table, own style-reference lookup, own Claude call) and persist their drafts immediately since the free-text path has no separate save step.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk` (`^0.70.0`, native `tools`/`tool_use` support), `zod` (already a dependency, used for handler-side runtime argument validation), Supabase (`saleikko` schema), Vitest.

Repo: `/Users/patrikfriis/Projects/Unelma`. Spec: `docs/superpowers/specs/2026-09-02-saleikko-skills-design.md` (in this repo, `treeniapp`, per project convention).

---

### Task 1: Add `Speech`/`Presentation` types and their Supabase tables

**Files:**
- Modify: `/Users/patrikfriis/Projects/Unelma/src/types.ts`
- Modify: `/Users/patrikfriis/Projects/Unelma/supabase/schema.sql`

- [ ] **Step 1: Add the two new types to `types.ts`**

Append after the existing `Position` interface (after line 45):

```ts
export interface Speech {
  id: string;
  topic: string;
  body_text: string;
  created_at: string;
}

export interface Presentation {
  id: string;
  topic: string;
  body_text: string;
  created_at: string;
}
```

- [ ] **Step 2: Add the two new tables to `schema.sql`**

Append after the `saleikko.positions` table definition (after line 55, before `saleikko.reminders`):

```sql
create table saleikko.speeches (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  body_text text not null,
  created_at timestamptz not null default now()
);

create table saleikko.presentations (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  body_text text not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 3: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/types.ts supabase/schema.sql
git commit -m "feat: add Speech/Presentation types and tables"
```

---

### Task 2: Skill registry core (`registry.ts`)

**Files:**
- Create: `/Users/patrikfriis/Projects/Unelma/src/skills/registry.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/skills/registry.test.ts
import { describe, it, expect } from "vitest";
import { toAnthropicTool } from "./registry.js";
import type { Skill } from "./registry.js";

describe("toAnthropicTool", () => {
  it("converts a Skill into an Anthropic tool definition", () => {
    const skill: Skill = {
      name: "test_skill",
      description: "A skill for testing.",
      input_schema: {
        type: "object",
        properties: { foo: { type: "string" } },
        required: ["foo"],
      },
      handler: async () => "ok",
    };

    expect(toAnthropicTool(skill)).toEqual({
      name: "test_skill",
      description: "A skill for testing.",
      input_schema: skill.input_schema,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/registry.test.ts`
Expected: FAIL — `Cannot find module './registry.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/skills/registry.ts
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../supabase/client.js";

export interface SkillContext {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  telegramUserId: number;
}

export interface SkillInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface Skill {
  name: string;
  description: string;
  input_schema: SkillInputSchema;
  handler: (args: unknown, ctx: SkillContext) => Promise<string>;
}

export function toAnthropicTool(skill: Skill): Anthropic.Tool {
  return {
    name: skill.name,
    description: skill.description,
    input_schema: skill.input_schema,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/registry.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/registry.ts src/skills/registry.test.ts
git commit -m "feat: add Skill type and toAnthropicTool converter"
```

---

### Task 3: Extract `draftPositionForQuery` in `positions.ts`

**Files:**
- Modify: `/Users/patrikfriis/Projects/Unelma/src/skills/politics/positions.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/politics/positions.test.ts`

This pulls the search→draft sequence currently inlined in `commands.ts`'s `/kannanotto` handler into a reusable function, so both the slash command (Task 6) and the new `draft_kannanotto` tool (Task 5) call one implementation. Behavior is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `positions.test.ts` (after the existing `describe("draftPosition", ...)` block, same file, new top-level `describe`):

```ts
describe("draftPositionForQuery", () => {
  it("returns no_match when nothing is found", async () => {
    const or = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    const result = await draftPositionForQuery(supabase, anthropic, "ei löydy");

    expect(result).toEqual({ status: "no_match" });
  });

  it("returns no_content when matches exist but none have body_text", async () => {
    const or = vi.fn(() =>
      Promise.resolve({
        data: [{ ...DOC, body_text: null }],
        error: null,
      }),
    );
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    const result = await draftPositionForQuery(supabase, anthropic, "kaava");

    expect(result).toEqual({ status: "no_content" });
  });

  it("returns ok with the drafted text when a match with body_text exists", async () => {
    const or = vi.fn(() => Promise.resolve({ data: [DOC], error: null }));
    const searchSelect = vi.fn(() => ({ or }));
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const positionsSelect = vi.fn(() => ({ order }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "raw_documents") return { select: searchSelect };
        if (table === "positions") return { select: positionsSelect };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Luonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const result = await draftPositionForQuery(supabase, anthropic, "kaava");

    expect(result).toEqual({ status: "ok", draft: "Luonnos." });
  });
});
```

Add `import { searchArchive... }`? No — this test doesn't need it directly. But `draftPositionForQuery` internally imports `searchArchive` from `./search.js`, which the test above exercises indirectly via `supabase.from("raw_documents")`. No new imports needed in the test file beyond what's already there (`describe`, `it`, `expect`, `vi`, `draftPosition`, `SupabaseClient`, `Anthropic`) plus the new `draftPositionForQuery` — update the existing import line:

```ts
import { draftPosition, draftPositionForQuery } from "./positions.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/politics/positions.test.ts`
Expected: FAIL — `draftPositionForQuery is not a function` / TS error, `Module '"./positions.js"' has no exported member 'draftPositionForQuery'`.

- [ ] **Step 3: Implement `draftPositionForQuery`**

Add to `positions.ts` (after the existing `draftPosition` function, and add the `searchArchive` import at the top alongside the existing imports):

```ts
import { searchArchive } from "./search.js";
```

```ts
export type DraftPositionForQueryResult =
  | { status: "no_match" }
  | { status: "no_content" }
  | { status: "ok"; draft: string };

export async function draftPositionForQuery(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  query: string,
): Promise<DraftPositionForQueryResult> {
  const results = await searchArchive(supabase, query);
  if (results.length === 0) {
    return { status: "no_match" };
  }
  const match = results.find((doc) => doc.body_text);
  if (!match) {
    return { status: "no_content" };
  }
  const draft = await draftPosition(supabase, anthropic, match);
  return { status: "ok", draft };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/politics/positions.test.ts`
Expected: PASS (5 tests: 2 existing `draftPosition` + 3 new `draftPositionForQuery`)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/politics/positions.ts src/skills/politics/positions.test.ts
git commit -m "feat: extract draftPositionForQuery for reuse by the future skills tool"
```

---

### Task 4: Extract `formatSearchResults` in `search.ts`

**Files:**
- Modify: `/Users/patrikfriis/Projects/Unelma/src/skills/politics/search.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/politics/search.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `search.test.ts`:

```ts
describe("formatSearchResults", () => {
  it("formats each result as a bulleted line with board, title, date and URL", () => {
    const results = [
      {
        id: "1",
        source_id: "s1",
        meeting_id: "m1",
        board: "Kaupunginhallitus",
        meeting_date: "2026-10-01",
        title: "Talousarvio 2027",
        source_url: "https://kokkola10.oncloudos.com/foo",
        gatekeeper_decision: "match" as const,
        gatekeeper_reasoning: null,
        body_text: null,
        pdf_url: null,
        seen_at: "2026-09-01",
        fetched_at: null,
      },
    ];

    expect(formatSearchResults(results)).toBe(
      "• Kaupunginhallitus — Talousarvio 2027 (2026-10-01)\n  https://kokkola10.oncloudos.com/foo",
    );
  });

  it("caps output at 10 results", () => {
    const makeDoc = (n: number) => ({
      id: String(n),
      source_id: `s${n}`,
      meeting_id: `m${n}`,
      board: "Lautakunta",
      meeting_date: "2026-10-01",
      title: `Asia ${n}`,
      source_url: "https://example.com",
      gatekeeper_decision: "match" as const,
      gatekeeper_reasoning: null,
      body_text: null,
      pdf_url: null,
      seen_at: "2026-09-01",
      fetched_at: null,
    });
    const results = Array.from({ length: 15 }, (_, i) => makeDoc(i));

    expect(formatSearchResults(results).split("\n").filter((l) => l.startsWith("• "))).toHaveLength(10);
  });
});
```

Replace line 3 of `search.test.ts`:

```ts
import { searchArchive } from "./search.js";
```

with:

```ts
import { searchArchive, formatSearchResults } from "./search.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/politics/search.test.ts`
Expected: FAIL — `formatSearchResults is not a function`.

- [ ] **Step 3: Implement `formatSearchResults`**

Add to `search.ts` (after the existing `searchArchive` function):

```ts
export function formatSearchResults(results: RawDocument[]): string {
  return results
    .slice(0, 10)
    .map((doc) => `• ${doc.board} — ${doc.title} (${doc.meeting_date})\n  ${doc.source_url}`)
    .join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/politics/search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/politics/search.ts src/skills/politics/search.test.ts
git commit -m "feat: extract formatSearchResults for reuse by the future skills tool"
```

---

### Task 5: Politics tool wrappers (`search_archive`, `draft_kannanotto`)

**Files:**
- Create: `/Users/patrikfriis/Projects/Unelma/src/skills/politics/tools.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/politics/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/skills/politics/tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { searchArchiveSkill, draftKannanottoSkill } from "./tools.js";
import type { SkillContext } from "../registry.js";
import type { SupabaseClient } from "../../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

describe("searchArchiveSkill", () => {
  it("returns a no-results message when nothing is found", async () => {
    const or = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const ctx: SkillContext = { supabase, anthropic: {} as Anthropic, telegramUserId: 1 };

    const result = await searchArchiveSkill.handler({ query: "ei löydy" }, ctx);

    expect(result).toContain('Ei tuloksia haulle "ei löydy"');
  });

  it("returns formatted results when matches are found", async () => {
    const or = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "1",
            source_id: "s1",
            meeting_id: "m1",
            board: "Kaupunginhallitus",
            meeting_date: "2026-10-01",
            title: "Talousarvio 2027",
            source_url: "https://kokkola10.oncloudos.com/foo",
            gatekeeper_decision: "match",
            gatekeeper_reasoning: null,
            body_text: null,
            pdf_url: null,
            seen_at: "2026-09-01",
            fetched_at: null,
          },
        ],
        error: null,
      }),
    );
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const ctx: SkillContext = { supabase, anthropic: {} as Anthropic, telegramUserId: 1 };

    const result = await searchArchiveSkill.handler({ query: "talous" }, ctx);

    expect(result).toContain("Talousarvio 2027");
  });
});

describe("draftKannanottoSkill", () => {
  it("returns the draft text when a match with body_text exists", async () => {
    const or = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "1",
            source_id: "s1",
            meeting_id: "m1",
            board: "Kaupunginhallitus",
            meeting_date: "2026-10-01",
            title: "Kaavamuutos",
            source_url: "https://kokkola10.oncloudos.com/foo",
            gatekeeper_decision: "match",
            gatekeeper_reasoning: null,
            body_text: "Sisältöä.",
            pdf_url: null,
            seen_at: "2026-09-01",
            fetched_at: "2026-09-01",
          },
        ],
        error: null,
      }),
    );
    const searchSelect = vi.fn(() => ({ or }));
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const positionsSelect = vi.fn(() => ({ order }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "raw_documents") return { select: searchSelect };
        if (table === "positions") return { select: positionsSelect };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Kannanottoluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const ctx: SkillContext = { supabase, anthropic, telegramUserId: 1 };

    const result = await draftKannanottoSkill.handler({ query: "kaava" }, ctx);

    expect(result).toBe("Kannanottoluonnos.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/politics/tools.test.ts`
Expected: FAIL — `Cannot find module './tools.js'`.

- [ ] **Step 3: Implement `tools.ts`**

```ts
// src/skills/politics/tools.ts
import { z } from "zod";
import type { Skill } from "../registry.js";
import { searchArchive, formatSearchResults } from "./search.js";
import { draftPositionForQuery } from "./positions.js";

const SearchArchiveArgs = z.object({ query: z.string().min(1) });

export const searchArchiveSkill: Skill = {
  name: "search_archive",
  description:
    "Hae Kokkolan kunnan kokousarkistosta (esityslistat, pöytäkirjat) hakusanalla. " +
    "Käytä kun käyttäjä kysyy jotain mikä voisi löytyä kunnan päätöksenteosta.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Hakusana tai -lause" } },
    required: ["query"],
  },
  handler: async (args, ctx) => {
    const { query } = SearchArchiveArgs.parse(args);
    const results = await searchArchive(ctx.supabase, query);
    if (results.length === 0) {
      return `Ei tuloksia haulle "${query}".`;
    }
    return formatSearchResults(results);
  },
};

const DraftKannanottoArgs = z.object({ query: z.string().min(1) });

export const draftKannanottoSkill: Skill = {
  name: "draft_kannanotto",
  description:
    "Laadi kannanottoluonnos kunnan kokousasiasta hakusanan perusteella. " +
    "Käytä kun käyttäjä pyytää kannanottoa tai lausuntoa tietystä kokousasiasta.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Hakusana kokousasialle" } },
    required: ["query"],
  },
  handler: async (args, ctx) => {
    const { query } = DraftKannanottoArgs.parse(args);
    const result = await draftPositionForQuery(ctx.supabase, ctx.anthropic, query);
    if (result.status === "no_match") {
      return `En löytänyt pykälää haulla "${query}".`;
    }
    if (result.status === "no_content") {
      return `Löysin osumia haulla "${query}", mutta niiden sisältöä ei ole vielä haettu — kannanottoa ei voi vielä laatia.`;
    }
    return result.draft;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/politics/tools.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/politics/tools.ts src/skills/politics/tools.test.ts
git commit -m "feat: wrap politics search/kannanotto as skill-registry tools"
```

---

### Task 6: Refactor `commands.ts` to reuse the extracted functions

**Files:**
- Modify: `/Users/patrikfriis/Projects/Unelma/src/telegram/commands.ts`

This is a behavior-preserving refactor — no new tests, but the existing `commands.test.ts` suite must still pass unchanged afterward, since it locks down `/hae` and `/kannanotto`'s observable behavior.

- [ ] **Step 1: Update imports**

Replace (lines 9-10 of `commands.ts`):

```ts
import { searchArchive } from "../skills/politics/search.js";
import { draftPosition } from "../skills/politics/positions.js";
```

with:

```ts
import { searchArchive, formatSearchResults } from "../skills/politics/search.js";
import { draftPositionForQuery } from "../skills/politics/positions.js";
```

- [ ] **Step 2: Replace the `/hae` handler body**

Replace (lines 43-58):

```ts
  bot.command("hae", async (ctx) => {
    const query = ctx.match?.toString().trim();
    if (!query) {
      await ctx.reply("Käytä muotoa: /hae <hakusana>");
      return;
    }
    const results = await searchArchive(supabase, query);
    if (results.length === 0) {
      await ctx.reply(`Ei tuloksia haulle "${query}".`);
      return;
    }
    const lines = results
      .slice(0, 10)
      .map((doc) => `• ${doc.board} — ${doc.title} (${doc.meeting_date})\n  ${doc.source_url}`);
    await ctx.reply(lines.join("\n"));
  });
```

with:

```ts
  bot.command("hae", async (ctx) => {
    const query = ctx.match?.toString().trim();
    if (!query) {
      await ctx.reply("Käytä muotoa: /hae <hakusana>");
      return;
    }
    const results = await searchArchive(supabase, query);
    if (results.length === 0) {
      await ctx.reply(`Ei tuloksia haulle "${query}".`);
      return;
    }
    await ctx.reply(formatSearchResults(results));
  });
```

- [ ] **Step 3: Replace the `/kannanotto` handler body**

Replace (lines 60-80):

```ts
  bot.command("kannanotto", async (ctx) => {
    const query = ctx.match?.toString().trim();
    if (!query) {
      await ctx.reply("Käytä muotoa: /kannanotto <hakusana pykälälle>");
      return;
    }
    const results = await searchArchive(supabase, query);
    if (results.length === 0) {
      await ctx.reply(`En löytänyt pykälää haulla "${query}".`);
      return;
    }
    const match = results.find((doc) => doc.body_text);
    if (!match) {
      await ctx.reply(
        `Löysin osumia haulla "${query}", mutta niiden sisältöä ei ole vielä haettu — kannanottoa ei voi vielä laatia.`,
      );
      return;
    }
    const draft = await draftPosition(supabase, anthropic, match);
    await ctx.reply(draft);
  });
```

with:

```ts
  bot.command("kannanotto", async (ctx) => {
    const query = ctx.match?.toString().trim();
    if (!query) {
      await ctx.reply("Käytä muotoa: /kannanotto <hakusana pykälälle>");
      return;
    }
    const result = await draftPositionForQuery(supabase, anthropic, query);
    if (result.status === "no_match") {
      await ctx.reply(`En löytänyt pykälää haulla "${query}".`);
      return;
    }
    if (result.status === "no_content") {
      await ctx.reply(
        `Löysin osumia haulla "${query}", mutta niiden sisältöä ei ole vielä haettu — kannanottoa ei voi vielä laatia.`,
      );
      return;
    }
    await ctx.reply(result.draft);
  });
```

- [ ] **Step 4: Run the existing command tests to confirm no regressions**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/commands.test.ts`
Expected: PASS, all tests unchanged (7 tests, same as before this task)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/telegram/commands.ts
git commit -m "refactor: route /hae and /kannanotto through the extracted shared functions"
```

---

### Task 7: `speeches` skill

**Files:**
- Create: `/Users/patrikfriis/Projects/Unelma/src/skills/speeches/draft.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/speeches/draft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/skills/speeches/draft.test.ts
import { describe, it, expect, vi } from "vitest";
import { draftSpeech, speechSkill } from "./draft.js";
import type { SkillContext } from "../registry.js";
import type { SupabaseClient } from "../../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

describe("draftSpeech", () => {
  it("passes past speeches as style reference and returns drafted text", async () => {
    const limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "s1", topic: "Vanha aihe", body_text: "Aiempi puheteksti.", created_at: "2026-01-01" }],
        error: null,
      }),
    );
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Puheluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const draft = await draftSpeech(supabase, anthropic, "Kuntatalous");

    expect(draft).toBe("Puheluonnos.");
    const callArgs = create.mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain("Aiempi puheteksti.");
  });

  it("works with no past speeches (cold start)", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Ensimmäinen puheluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const draft = await draftSpeech(supabase, anthropic, "Kuntatalous");

    expect(draft).toBe("Ensimmäinen puheluonnos.");
  });
});

describe("speechSkill", () => {
  it("drafts and saves the speech to the speeches table", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn(() => ({ select, insert })),
    } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Puheluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const ctx: SkillContext = { supabase, anthropic, telegramUserId: 1 };

    const result = await speechSkill.handler({ topic: "Kuntatalous" }, ctx);

    expect(result).toBe("Puheluonnos.");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "Kuntatalous", body_text: "Puheluonnos." }),
    );
  });

  it("still returns the draft even if saving it fails", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const insert = vi.fn(() => Promise.resolve({ error: { message: "insert failed" } }));
    const supabase = {
      from: vi.fn(() => ({ select, insert })),
    } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Puheluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const ctx: SkillContext = { supabase, anthropic, telegramUserId: 1 };

    const result = await speechSkill.handler({ topic: "Kuntatalous" }, ctx);

    expect(result).toBe("Puheluonnos.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/speeches/draft.test.ts`
Expected: FAIL — `Cannot find module './draft.js'`.

- [ ] **Step 3: Implement `draft.ts`**

```ts
// src/skills/speeches/draft.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { SupabaseClient } from "../../supabase/client.js";
import type { Speech } from "../../types.js";
import { SONNET_MODEL } from "../../claude/client.js";
import type { Skill } from "../registry.js";

async function listRecentSpeeches(supabase: SupabaseClient): Promise<Speech[]> {
  const { data, error } = await supabase
    .from("speeches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`listRecentSpeeches failed: ${error.message}`);
  return (data ?? []) as Speech[];
}

export async function draftSpeech(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  topic: string,
): Promise<string> {
  const past = await listRecentSpeeches(supabase);
  const styleReference = past.map((s) => `--- ${s.topic} ---\n${s.body_text}`).join("\n\n");

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system:
      "Olet Säleikkö, kunnanvaltuutetun avustaja. Laadi puheluonnos annetusta " +
      "aiheesta. Käytä käyttäjän aiempia puheita tyylin ja äänensävyn " +
      "referenssinä, mutta älä kopioi niitä suoraan. Tuota luonnos jonka " +
      "käyttäjä viimeistelee itse - älä esitä sitä valmiina lopullisena tekstinä.",
    messages: [
      {
        role: "user",
        content:
          `Puheen aihe: ${topic}\n\n` +
          `Käyttäjän aiemmat puheet tyylireferenssiksi:\n${styleReference || "(ei aiempia puheita tallennettuna)"}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new Error(`draftSpeech: no text block for topic "${topic}"`);
  }
  return textBlock.text;
}

const DraftSpeechArgs = z.object({ topic: z.string().min(1) });

export const speechSkill: Skill = {
  name: "draft_speech",
  description:
    "Laadi puheluonnos annetusta aiheesta. Käytä kun käyttäjä pyytää puhetta, " +
    "juhlapuhetta tai vastaavaa esitettävää tekstiä.",
  input_schema: {
    type: "object",
    properties: { topic: { type: "string", description: "Puheen aihe" } },
    required: ["topic"],
  },
  handler: async (args, ctx) => {
    const { topic } = DraftSpeechArgs.parse(args);
    const draft = await draftSpeech(ctx.supabase, ctx.anthropic, topic);
    const { error } = await ctx.supabase.from("speeches").insert({ topic, body_text: draft });
    if (error) {
      console.error(`draft_speech: failed to save speech: ${error.message}`);
    }
    return draft;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/speeches/draft.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/speeches/draft.ts src/skills/speeches/draft.test.ts
git commit -m "feat: add speech-drafting skill"
```

---

### Task 8: `presentations` skill

**Files:**
- Create: `/Users/patrikfriis/Projects/Unelma/src/skills/presentations/draft.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/presentations/draft.test.ts`

Identical structure to Task 7, own table, own wording.

- [ ] **Step 1: Write the failing test**

```ts
// src/skills/presentations/draft.test.ts
import { describe, it, expect, vi } from "vitest";
import { draftPresentation, presentationSkill } from "./draft.js";
import type { SkillContext } from "../registry.js";
import type { SupabaseClient } from "../../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

describe("draftPresentation", () => {
  it("passes past presentations as style reference and returns drafted text", async () => {
    const limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "p1", topic: "Vanha aihe", body_text: "Aiempi esitysteksti.", created_at: "2026-01-01" }],
        error: null,
      }),
    );
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Esitysluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const draft = await draftPresentation(supabase, anthropic, "Talousarvio");

    expect(draft).toBe("Esitysluonnos.");
    const callArgs = create.mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain("Aiempi esitysteksti.");
  });

  it("works with no past presentations (cold start)", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Ensimmäinen esitysluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const draft = await draftPresentation(supabase, anthropic, "Talousarvio");

    expect(draft).toBe("Ensimmäinen esitysluonnos.");
  });
});

describe("presentationSkill", () => {
  it("drafts and saves the presentation to the presentations table", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn(() => ({ select, insert })),
    } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Esitysluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const ctx: SkillContext = { supabase, anthropic, telegramUserId: 1 };

    const result = await presentationSkill.handler({ topic: "Talousarvio" }, ctx);

    expect(result).toBe("Esitysluonnos.");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "Talousarvio", body_text: "Esitysluonnos." }),
    );
  });

  it("still returns the draft even if saving it fails", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const insert = vi.fn(() => Promise.resolve({ error: { message: "insert failed" } }));
    const supabase = {
      from: vi.fn(() => ({ select, insert })),
    } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Esitysluonnos." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const ctx: SkillContext = { supabase, anthropic, telegramUserId: 1 };

    const result = await presentationSkill.handler({ topic: "Talousarvio" }, ctx);

    expect(result).toBe("Esitysluonnos.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/presentations/draft.test.ts`
Expected: FAIL — `Cannot find module './draft.js'`.

- [ ] **Step 3: Implement `draft.ts`**

```ts
// src/skills/presentations/draft.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { SupabaseClient } from "../../supabase/client.js";
import type { Presentation } from "../../types.js";
import { SONNET_MODEL } from "../../claude/client.js";
import type { Skill } from "../registry.js";

async function listRecentPresentations(supabase: SupabaseClient): Promise<Presentation[]> {
  const { data, error } = await supabase
    .from("presentations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`listRecentPresentations failed: ${error.message}`);
  return (data ?? []) as Presentation[];
}

export async function draftPresentation(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  topic: string,
): Promise<string> {
  const past = await listRecentPresentations(supabase);
  const styleReference = past.map((p) => `--- ${p.topic} ---\n${p.body_text}`).join("\n\n");

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system:
      "Olet Säleikkö, kunnanvaltuutetun avustaja. Laadi esitysluonnos " +
      "(jäsennelty runko dioille tai vastaavalle) annetusta aiheesta. Käytä " +
      "käyttäjän aiempia esityksiä rakenteen ja tyylin referenssinä, mutta " +
      "älä kopioi niitä suoraan. Tuota luonnos jonka käyttäjä viimeistelee " +
      "itse - älä esitä sitä valmiina lopullisena tekstinä.",
    messages: [
      {
        role: "user",
        content:
          `Esityksen aihe: ${topic}\n\n` +
          `Käyttäjän aiemmat esitykset tyylireferenssiksi:\n${styleReference || "(ei aiempia esityksiä tallennettuna)"}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new Error(`draftPresentation: no text block for topic "${topic}"`);
  }
  return textBlock.text;
}

const DraftPresentationArgs = z.object({ topic: z.string().min(1) });

export const presentationSkill: Skill = {
  name: "draft_presentation",
  description:
    "Laadi esitysluonnos (dio-/runkomuotoinen) annetusta aiheesta. Käytä kun " +
    "käyttäjä pyytää esitystä, diaesitystä tai vastaavaa jäsenneltyä sisältöä.",
  input_schema: {
    type: "object",
    properties: { topic: { type: "string", description: "Esityksen aihe" } },
    required: ["topic"],
  },
  handler: async (args, ctx) => {
    const { topic } = DraftPresentationArgs.parse(args);
    const draft = await draftPresentation(ctx.supabase, ctx.anthropic, topic);
    const { error } = await ctx.supabase.from("presentations").insert({ topic, body_text: draft });
    if (error) {
      console.error(`draft_presentation: failed to save presentation: ${error.message}`);
    }
    return draft;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/presentations/draft.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/presentations/draft.ts src/skills/presentations/draft.test.ts
git commit -m "feat: add presentation-drafting skill"
```

---

### Task 9: Wire the registry (`src/skills/index.ts`)

**Files:**
- Create: `/Users/patrikfriis/Projects/Unelma/src/skills/index.ts`
- Test: `/Users/patrikfriis/Projects/Unelma/src/skills/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/skills/index.test.ts
import { describe, it, expect } from "vitest";
import { SKILLS } from "./index.js";

describe("SKILLS registry", () => {
  it("has a unique name for every skill", () => {
    const names = SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes all four skills built so far", () => {
    const names = SKILLS.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(["search_archive", "draft_kannanotto", "draft_speech", "draft_presentation"]),
    );
  });

  it("every skill declares an object-type input_schema whose required fields exist in properties", () => {
    for (const skill of SKILLS) {
      expect(skill.input_schema.type).toBe("object");
      for (const required of skill.input_schema.required ?? []) {
        expect(skill.input_schema.properties).toHaveProperty(required);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Implement `index.ts`**

```ts
// src/skills/index.ts
import type { Skill } from "./registry.js";
import { searchArchiveSkill, draftKannanottoSkill } from "./politics/tools.js";
import { speechSkill } from "./speeches/draft.js";
import { presentationSkill } from "./presentations/draft.js";

export const SKILLS: Skill[] = [
  searchArchiveSkill,
  draftKannanottoSkill,
  speechSkill,
  presentationSkill,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/skills/index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/skills/index.ts src/skills/index.test.ts
git commit -m "feat: wire the skill registry together"
```

---

### Task 10: Tool-calling loop in `gateway/chat.ts`

**Files:**
- Modify: `/Users/patrikfriis/Projects/Unelma/src/gateway/chat.ts`
- Modify: `/Users/patrikfriis/Projects/Unelma/src/gateway/chat.test.ts`

The `skills` parameter defaults to the real `SKILLS` registry so `index.ts`/`cli.ts`/`commands.ts` need no changes, but tests can inject fake skills instead of depending on real Supabase table shapes.

- [ ] **Step 1: Write the three new failing tests**

Append to `chat.test.ts` (add `import type { Skill } from "../skills/registry.js";` to the top of the file alongside the existing imports):

```ts
it("executes a tool call and returns the model's final text reply", async () => {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const supabase = {
    from: vi.fn(() => ({ insert, select })),
  } as unknown as SupabaseClient;

  const create = vi
    .fn()
    .mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tool-1", name: "fake_skill", input: { query: "kaava" } }],
    })
    .mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Löysin osuman kaavamuutoksesta." }],
    });
  const anthropic = { messages: { create } } as unknown as Anthropic;

  const fakeSkill: Skill = {
    name: "fake_skill",
    description: "test skill",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: vi.fn(async (args: any) => `Tulos haulle: ${args.query}`),
  };

  const reply = await handleFreeTextMessage(
    supabase,
    anthropic,
    123456,
    "Etsi kaavamuutoksesta",
    [fakeSkill],
  );

  expect(reply).toBe("Löysin osuman kaavamuutoksesta.");
  expect(create).toHaveBeenCalledTimes(2);
  expect(fakeSkill.handler).toHaveBeenCalledWith(
    { query: "kaava" },
    expect.objectContaining({ telegramUserId: 123456 }),
  );
});

it("passes handler errors back to Claude as an error tool_result instead of failing the whole turn", async () => {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const supabase = {
    from: vi.fn(() => ({ insert, select })),
  } as unknown as SupabaseClient;

  const create = vi
    .fn()
    .mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tool-1", name: "failing_skill", input: {} }],
    })
    .mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Työkalu epäonnistui, mutta tässä on vastaus." }],
    });
  const anthropic = { messages: { create } } as unknown as Anthropic;

  const failingSkill: Skill = {
    name: "failing_skill",
    description: "test skill that throws",
    input_schema: { type: "object", properties: {} },
    handler: vi.fn(async () => {
      throw new Error("boom");
    }),
  };

  const reply = await handleFreeTextMessage(supabase, anthropic, 123456, "Kokeile", [failingSkill]);

  expect(reply).toBe("Työkalu epäonnistui, mutta tässä on vastaus.");
  const secondCallMessages = create.mock.calls[1][0].messages;
  const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
  expect(toolResultMessage.content[0]).toEqual(
    expect.objectContaining({ type: "tool_result", is_error: true, content: "boom" }),
  );
});

it("returns a fallback message if the model keeps requesting tools past the round limit", async () => {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const supabase = {
    from: vi.fn(() => ({ insert, select })),
  } as unknown as SupabaseClient;

  const loopingSkill: Skill = {
    name: "looping_skill",
    description: "test skill",
    input_schema: { type: "object", properties: {} },
    handler: vi.fn(async () => "tulos"),
  };

  const create = vi.fn(() =>
    Promise.resolve({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tool-x", name: "looping_skill", input: {} }],
    }),
  );
  const anthropic = { messages: { create } } as unknown as Anthropic;

  const reply = await handleFreeTextMessage(supabase, anthropic, 123456, "Jää jumiin", [loopingSkill]);

  expect(reply).toBe("Pyyntö vaati liian monta työkaluvaihetta - yritä tarkentaa kysymystäsi.");
  expect(create).toHaveBeenCalledTimes(5);
});
```

- [ ] **Step 2: Run tests to verify the three new ones fail**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/gateway/chat.test.ts`
Expected: the 4 pre-existing tests PASS, the 3 new ones FAIL (current `handleFreeTextMessage` takes no `skills` argument and never checks `stop_reason`/`tools`).

- [ ] **Step 3: Implement the tool-calling loop**

Replace the entire contents of `chat.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../supabase/client.js";
import { SONNET_MODEL } from "../claude/client.js";
import { SKILLS } from "../skills/index.js";
import { toAnthropicTool } from "../skills/registry.js";
import type { Skill, SkillContext } from "../skills/registry.js";

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 5;

export async function handleFreeTextMessage(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  telegramUserId: number,
  text: string,
  skills: Skill[] = SKILLS,
): Promise<string> {
  const { error: userInsertError } = await supabase
    .from("conversation_log")
    .insert({ telegram_user_id: telegramUserId, role: "user", content: text });
  if (userInsertError) {
    throw new Error(`handleFreeTextMessage: ${userInsertError.message}`);
  }

  const { data: history, error: historyError } = await supabase
    .from("conversation_log")
    .select("role, content")
    .eq("telegram_user_id", telegramUserId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (historyError) {
    throw new Error(`handleFreeTextMessage: ${historyError.message}`);
  }

  const messages: Anthropic.MessageParam[] = (history ?? [])
    .reverse()
    .map((row: any) => ({ role: row.role, content: row.content }));

  const skillContext: SkillContext = { supabase, anthropic, telegramUserId };
  const tools = skills.map(toAnthropicTool);

  let reply = "En osannut muodostaa vastausta.";
  let gotFinalReply = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2048,
      system:
        "Olet Säleikkö, käyttäjän henkilökohtainen avustaja paikallispolitiikan " +
        "seurannassa. Vastaa ytimekkäästi suomeksi. Käytä saatavilla olevia " +
        "työkaluja kun käyttäjän pyyntö niihin sopii.",
      messages,
      tools,
    });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      reply = textBlock?.text ?? reply;
      gotFinalReply = true;
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const skill = skills.find((s) => s.name === block.name);
      if (!skill) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tuntematon työkalu: ${block.name}`,
          is_error: true,
        });
        continue;
      }
      try {
        const result = await skill.handler(block.input, skillContext);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: message,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!gotFinalReply) {
    reply = "Pyyntö vaati liian monta työkaluvaihetta - yritä tarkentaa kysymystäsi.";
  }

  const { error: assistantInsertError } = await supabase
    .from("conversation_log")
    .insert({ telegram_user_id: telegramUserId, role: "assistant", content: reply });
  if (assistantInsertError) {
    console.error(
      `handleFreeTextMessage: failed to log assistant reply: ${assistantInsertError.message}`,
    );
  }

  return reply;
}
```

- [ ] **Step 4: Run all `chat.test.ts` tests to verify everything passes**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/gateway/chat.test.ts`
Expected: PASS, all 7 tests (4 pre-existing + 3 new)

- [ ] **Step 5: Run `commands.test.ts` and `cli.test.ts` too, since both exercise `handleFreeTextMessage` indirectly**

Run: `cd /Users/patrikfriis/Projects/Unelma && npx vitest run src/telegram/commands.test.ts src/cli.test.ts`
Expected: PASS — both call `handleFreeTextMessage` with 4 args, which still works since `skills` defaults to `SKILLS`.

- [ ] **Step 6: Commit**

```bash
cd /Users/patrikfriis/Projects/Unelma
git add src/gateway/chat.ts src/gateway/chat.test.ts
git commit -m "feat: add tool-calling loop to the free-text gateway"
```

---

### Task 11: Full verification and deployment note

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm test`
Expected: PASS, all tests (existing suite + all tests added in Tasks 2-10)

- [ ] **Step 2: Typecheck**

Run: `cd /Users/patrikfriis/Projects/Unelma && npm run build`
Expected: exits 0, no TypeScript errors (this also verifies the `Anthropic.ContentBlock[]` → `Anthropic.MessageParam.content` assignment in `chat.ts` and the `Anthropic.Tool` shape used in `registry.ts` are structurally compatible with the SDK's types)

- [ ] **Step 3: Manual production step — requires the user, not automatable from here**

This is the same category as Vaihe 1's Task 19: it touches the live production Supabase project and VPS, and needs the user's own credentials.

1. Apply the schema change from Task 1 to the real Supabase project (Dashboard → SQL Editor, or `supabase db push` if the CLI is linked) — creates `saleikko.speeches` and `saleikko.presentations`.
2. On the VPS: `cd /opt/saleikko && sudo -u saleikko git pull && sudo -u saleikko npm install && sudo -u saleikko npm run build && sudo systemctl restart saleikko`.
3. Smoke-test over Telegram or `npm run chat`: ask for a search (e.g. "hae kaavamuutoksista"), a kannanotto draft, a speech draft, and a presentation draft in free text, and confirm each one gets routed to the right tool and (for the two new skills) actually lands a row in `speeches`/`presentations`.

---

## Self-Review

**Spec coverage:** registry + tool-calling loop (Task 2, 10), politics-as-tools reusing existing logic without duplication (Tasks 3-5), existing slash commands left behaviorally identical (Task 6), two new skills as separate skills with own tables and self-referencing style lookup (Tasks 1, 7-8), draft persistence on generation since there's no manual save step in free text (Tasks 7-8 `handler`), error handling via `tool_result.is_error` (Task 10), testing at each layer (all tasks), schema migration + deployment (Tasks 1, 11) — every spec section maps to a task.

**Type consistency:** `Skill`/`SkillContext`/`SkillInputSchema` defined once in Task 2 (`registry.ts`) and imported everywhere else without redefinition. `draftPositionForQuery`'s `DraftPositionForQueryResult` discriminated union (`no_match`/`no_content`/`ok`) is defined in Task 3 and consumed identically in Task 5 (`tools.ts`) and Task 6 (`commands.ts`). `handleFreeTextMessage`'s new `skills` parameter and its default (`= SKILLS`) are introduced once in Task 10 and don't require changes anywhere else, since `index.ts`, `cli.ts`, and `commands.ts` all call it with the original 4-argument signature.
