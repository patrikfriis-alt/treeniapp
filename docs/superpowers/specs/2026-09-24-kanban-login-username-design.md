# Kanban Login Username — Design

A small hardening pass on `unelmaboard.com`'s login (see
`docs/superpowers/specs/2026-09-23-kanban-web-ui-design.md`, §07 Auth): add a username field
alongside the existing shared password, raising the bar slightly above a bare password without
building real multi-user accounts (still explicitly out of scope — single shared login).

## Changes

- **New env var:** `KANBAN_UI_USERNAME` (required, alongside the existing `KANBAN_UI_PASSWORD`),
  read via `requireEnv` in `src/config.ts` and passed through `WebServerDeps` the same way the
  password already is. Value: `patrik.friis`. Set directly on the VPS via SSH, same as the password —
  not something Claude Code ever sees or stores.
- **Login form (`webui/src/pages/Login.tsx`):** add a "Username" text input above the existing
  "Password" field. Both fields required to submit; the request body sent to `POST /api/auth/login`
  gains a `username` field alongside the existing `password` field.
- **Backend (`src/webui/auth.ts` / `src/webui/server.ts`):** the login route checks both fields:
  - Username: plain string equality against `KANBAN_UI_USERNAME`. Not timing-safe — it isn't a
    secret (the user has already told it to a chat conversation), so there's nothing to protect by
    making the comparison constant-time.
  - Password: unchanged — keeps the existing `checkPassword` (SHA-256-then-`timingSafeEqual`) check.
  - If either check fails, respond identically: `401 {"error": "invalid username or password"}`.
    The response does not reveal which field was wrong, standard practice even for a single-user
    system, and free to do correctly.
- **Session/cookie behavior:** entirely unchanged — this only affects what's checked before a
  session is created, not how the session itself works.

## Out of scope

- Real multi-user accounts (each person their own login) — unchanged from the original spec's
  explicit v1 scope decision.
- Changing or storing the username/password anywhere Claude Code can read them.
