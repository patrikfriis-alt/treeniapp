# Säleikkö Terminal Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive terminal REPL (`src/cli.ts`) that lets the user chat with Säleikkö via SSH on the VPS, sharing the exact same conversation history and backend logic as the Telegram free-text channel.

**Architecture:** A single new entrypoint file wraps Node's built-in `readline` module around the already-built `handleFreeTextMessage` function (`src/gateway/chat.ts`) — no changes to any existing module, no schema changes, no new dependencies. The REPL reuses `loadConfig()`/`createSupabaseClient()`/`createAnthropicClient()` exactly as `src/index.ts` does, and passes `config.telegramAllowedUserId` as the identity for every message, so `conversation_log` rows are indistinguishable from ones written via Telegram — this is what makes history "shared" between the two channels with zero data-model changes.

**Tech Stack:** Node.js built-in `readline` and `node:stream` (no new npm dependencies), TypeScript, vitest.

**Reference:** Design spec at `docs/superpowers/specs/2026-09-02-saleikko-terminal-design.md`.

---

### Task 1: Terminal REPL entrypoint

**Files:**
- Create: `src/cli.ts`
- Test: `src/cli.test.ts`
- Modify: `package.json` (add a `chat` script)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/cli.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, Writable } from "node:stream";
import { runChatRepl } from "./cli.js";

vi.mock("./config.js", () => ({
  loadConfig: vi.fn(() => ({
    telegramBotToken: "t",
    telegramAllowedUserId: 123456,
    anthropicApiKey: "a",
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "s",
    dailyBriefingHour: 7,
    port: 3000,
  })),
}));
vi.mock("./supabase/client.js", () => ({
  createSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("./claude/client.js", () => ({
  createAnthropicClient: vi.fn(() => ({})),
}));
vi.mock("./gateway/chat.js", () => ({
  handleFreeTextMessage: vi.fn(),
}));

function makeStreams() {
  const input = new Readable({ read() {} });
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { input, output, chunks };
}

describe("runChatRepl", () => {
  beforeEach(async () => {
    const { handleFreeTextMessage } = await import("./gateway/chat.js");
    (handleFreeTextMessage as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("sends a typed line to handleFreeTextMessage and prints the reply, then exits cleanly", async () => {
    const { handleFreeTextMessage } = await import("./gateway/chat.js");
    const mockFn = handleFreeTextMessage as unknown as ReturnType<typeof vi.fn>;

    const { input, output, chunks } = makeStreams();
    // Pushing "exit" from inside the mock (rather than up front) means it
    // arrives while this handler's await is still in flight — this is a
    // regression test for a race where 'exit' closed rl mid-await and the
    // pending handler's rl.prompt() then threw ERR_USE_AFTER_CLOSE.
    mockFn.mockImplementationOnce(async () => {
      input.push("exit\n");
      return "Vastaus käyttäjälle.";
    });
    input.push("Mitä mieltä olet kaavoituksesta?\n");

    await runChatRepl(input, output);

    expect(mockFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      123456,
      "Mitä mieltä olet kaavoituksesta?",
    );
    expect(chunks.join("")).toContain("Vastaus käyttäjälle.");
  });

  it("prints an error to stderr and keeps the loop going when handleFreeTextMessage throws", async () => {
    const { handleFreeTextMessage } = await import("./gateway/chat.js");
    const mockFn = handleFreeTextMessage as unknown as ReturnType<typeof vi.fn>;

    const { input, output, chunks } = makeStreams();
    mockFn.mockImplementationOnce(async () => {
      input.push("toinen viesti\n");
      throw new Error("Supabase down");
    });
    mockFn.mockImplementationOnce(async () => {
      input.push("exit\n");
      return "Toinen vastaus.";
    });
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    input.push("ensimmäinen viesti\n");

    await runChatRepl(input, output);

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Supabase down"));
    expect(chunks.join("")).toContain("Toinen vastaus.");

    stderrWrite.mockRestore();
  });

  it("exits cleanly on 'exit' without calling handleFreeTextMessage", async () => {
    const { handleFreeTextMessage } = await import("./gateway/chat.js");
    const mockFn = handleFreeTextMessage as unknown as ReturnType<typeof vi.fn>;

    const { input, output } = makeStreams();
    input.push("exit\n");

    await runChatRepl(input, output);

    expect(mockFn).not.toHaveBeenCalled();
  });

  it("ignores blank lines without calling handleFreeTextMessage", async () => {
    const { handleFreeTextMessage } = await import("./gateway/chat.js");
    const mockFn = handleFreeTextMessage as unknown as ReturnType<typeof vi.fn>;

    const { input, output } = makeStreams();
    input.push("   \n");
    input.push("exit\n");

    await runChatRepl(input, output);

    expect(mockFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli.test.ts`
Expected: FAIL — `Cannot find module './cli.js'`

- [ ] **Step 3: Write `src/cli.ts`**

> **Note (verified during implementation):** the code below already includes a
> `closed` guard around `rl.prompt()` calls. Without it, if `exit` is
> processed while a prior message's `handleFreeTextMessage` call is still in
> flight (piped/pasted multi-line input, or a user typing `exit` quickly),
> the pending handler's trailing `rl.prompt()` fires after `rl` is already
> closed and throws `ERR_USE_AFTER_CLOSE` as an unhandled rejection —
> confirmed live via a real crash and via 3 unhandled-rejection warnings
> during the test run (the 4 given assertions still passed since none of them
> checked for this).

```typescript
import { createInterface } from "node:readline";
import { loadConfig } from "./config.js";
import { createSupabaseClient } from "./supabase/client.js";
import { createAnthropicClient } from "./claude/client.js";
import { handleFreeTextMessage } from "./gateway/chat.js";

const EXIT_COMMANDS = new Set(["exit", "quit"]);

export async function runChatRepl(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<void> {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);
  const anthropic = createAnthropicClient(config);

  const rl = createInterface({ input, output, prompt: "> " });
  output.write("Säleikkö-terminaali. Kirjoita viesti, tai 'exit'/'quit' lopettaaksesi.\n");
  rl.prompt();

  // If 'exit' is queued right behind an in-flight message (e.g. both already
  // buffered in the same input chunk, or the user types 'exit' before a
  // reply lands), the 'line' handler for 'exit' can close rl while the
  // earlier handler's await is still pending. output.write/stderr.write are
  // safe either way (they're a separate stream from rl), but calling
  // rl.prompt() on an already-closed interface throws ERR_USE_AFTER_CLOSE —
  // so only rl.prompt() needs the guard.
  let closed = false;

  rl.on("line", async (line) => {
    const text = line.trim();
    if (EXIT_COMMANDS.has(text)) {
      rl.close();
      return;
    }
    if (!text) {
      if (!closed) rl.prompt();
      return;
    }
    try {
      const reply = await handleFreeTextMessage(
        supabase,
        anthropic,
        config.telegramAllowedUserId,
        text,
      );
      output.write(`${reply}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Virhe: ${message}\n`);
    }
    if (!closed) rl.prompt();
  });

  return new Promise((resolve) => {
    rl.on("close", () => {
      closed = true;
      output.write("Näkemiin.\n");
      resolve();
    });
  });
}

// Only auto-start the REPL against real stdin/stdout when this file is run
// directly (`tsx src/cli.ts` or `node dist/cli.js`) — not when `runChatRepl`
// is imported by the test file above, which would otherwise hang the test
// process waiting on real stdin.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runChatRepl(process.stdin, process.stdout).catch((error) => {
    console.error("Säleikkö-terminaali kaatui:", error);
    process.exit(1);
  });
}
```

IMPORTANT: before considering this step done, actually verify the `isMainModule` guard works as intended in THIS project's setup (`"module": "NodeNext"` in `tsconfig.json`, run via `tsx` in dev and plain `node` after `tsc` build):
1. Run `npx tsx src/cli.ts` directly (with a real, valid `.env` present, or accept it may throw on `loadConfig()` if no `.env` exists locally — that's fine, the point is confirming the REPL actually starts and prints its welcome line before any config error, or if you don't have a local `.env`, temporarily create a throwaway one with dummy values just to confirm the REPL loop itself starts). Type `exit` to confirm it exits cleanly. Ctrl+C out if needed.
2. Confirm that when `src/cli.test.ts` imports `./cli.js`, the real REPL does NOT start (i.e., the test suite doesn't hang waiting on real stdin). If it does hang, the guard isn't working — investigate `import.meta.url` vs `process.argv[1]` in this project's actual module runner (tsx/vitest) rather than guessing a fix.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the `chat` script to `package.json`**

In `package.json`'s `"scripts"` block, add:
```json
"chat": "tsx src/cli.ts"
```

(Alongside the existing `dev`, `build`, `start`, `test` scripts — don't reorder or modify the others.)

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all tests pass, zero failures (existing suite plus the 4 new `cli.test.ts` tests).

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/cli.test.ts package.json
git commit -m "feat: add terminal REPL sharing conversation history with Telegram"
```

---

## Deployment

Not part of the automated plan — after this task is reviewed and merged, deploy exactly like every prior change to this VPS:

```bash
ssh root@<vps-ip> "cd /opt/saleikko && sudo -u saleikko git pull && sudo -u saleikko npm run build"
```

No systemd changes needed — `cli.ts` is not a long-running service, it's invoked on demand:

```bash
ssh root@<vps-ip>
sudo -u saleikko node dist/cli.js
```

## Manual verification (not automated)

- [ ] SSH into the VPS, run `sudo -u saleikko node dist/cli.js`, send a free-text message, confirm a real Claude-generated reply comes back.
- [ ] Send a message via the terminal, then check Telegram (or vice versa) — confirm the conversation history is genuinely shared (e.g. ask a follow-up question in one channel that only makes sense with context from the other).
- [ ] Type `exit` and confirm the REPL exits cleanly back to the shell.
- [ ] Confirm Ctrl+D also exits cleanly (readline's native EOF handling, not the explicit `exit`/`quit` check).
