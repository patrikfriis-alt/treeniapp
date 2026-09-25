# Telegram `/task` Domain Prefix — Design

Extends Telegram's `/task` command (`src/telegram/assistantCommands.ts`) to create non-`dev` tasks,
which is currently impossible — the command is hardcoded to `domain: "dev"` and requires a repo
alias.

## Problem

`/task <repo-alias> <description>` is the only way to create a task via Telegram today, and it
always creates a `dev`-domain task. There's no way to create a `coo`/`politics`/`monitor` task from
Telegram — the web UI's "New Task" form is the only path for those domains.

## Design

The command's first word is checked against the three non-dev domain names before falling back to
repo-alias resolution:

1. `/task coo <description>` / `/task politics <description>` / `/task monitor <description>` →
   inserts a task with `domain` set accordingly, `repo: null`, `stage: "backlog"`,
   `created_by: "telegram"` — same shape as the existing insert, just without a repo. Reply:
   `"Tehtävä lisätty backlogiin (coo)."` (mirroring the existing dev-task confirmation's format,
   domain name instead of repo).
2. Otherwise, falls back to the existing behavior unchanged: `resolveRepoAlias(firstWord)` — if it
   resolves, creates a `dev` task exactly as today (repo required, `domain: "dev"`).
3. If neither matches (unknown domain word AND unknown repo alias), the usage/error reply is updated
   to show both forms: `/task <coo|politics|monitor> <description>` or `/task <repo> <description>`,
   still listing known repo aliases.

Domain names are checked *before* repo-alias resolution specifically so a domain name always wins if
a repo alias were ever added with the same name (no such collision exists today — repo aliases are
`treeniapp`/`unelma`/`saleikko`, domains are `coo`/`dev`/`politics`/`monitor` — but checking domain
first is the safer order regardless).

`dev` itself is not a usable first word on its own (there's no "/task dev <description>" form) —
`dev` tasks always require a repo, so they continue to go exclusively through the repo-alias path,
unchanged from today.

## Out of scope

- Any change to the web UI's task creation (already supports all four domains).
- Any change to `/tasks` (the listing command) or `/promote`.
