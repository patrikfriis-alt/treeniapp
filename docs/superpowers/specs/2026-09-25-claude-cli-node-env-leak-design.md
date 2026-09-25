# Claude CLI `NODE_ENV` Leak — Design

A bug fix, discovered live 2026-09-25 during the first real "Run Now" execution: the dev task's own
PR description reported that `npm install` inside its cloned workspace silently skipped
devDependencies, forcing it to manually run `npm ci --include=dev` to get `vitest`/`typescript`
installed before it could verify its own change.

## Root cause

`runClaudeHeadless` (`src/assistant/claudeCli.ts:40`) spawns the `claude` CLI with
`env: { ...process.env, ...options.env }` — the full parent process's environment. The saleikko
service's systemd unit now sets `NODE_ENV=production` (added for the Kanban UI login's session
cookie `Secure` flag), and that value flows straight through into every headless dev-task
invocation, and from there into every shell command Claude runs inside the cloned task workspace —
including its own `npm install`, which respects `NODE_ENV=production` by skipping
devDependencies, a well-known standard npm behavior.

This isn't specific to the one task that happened to notice and work around it — it silently
affects every dev task run from now on, and a task that doesn't think to check could ship a PR it
never actually verified with tests.

## Fix

Strip `NODE_ENV` out of the environment passed to the spawned `claude` process, regardless of
whether the parent process has it set:

```ts
const { NODE_ENV: _nodeEnv, ...parentEnv } = process.env;
const child = spawn("claude", [
  "--print", options.prompt,
  "--dangerously-skip-permissions",
], {
  cwd: options.cwd,
  env: { ...parentEnv, ...options.env },
});
```

`NODE_ENV=production`'s only real purpose in this codebase is the web server's own session-cookie
`Secure` flag check (`src/webui/server.ts`) — it has no meaning for, and shouldn't affect, work done
inside an arbitrary task's cloned repo.

## Out of scope

- Any other environment variable audit — this fix addresses the one confirmed leak found in
  practice, not a general hardening pass.
