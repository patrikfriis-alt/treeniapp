# Säleikkö Vaihe 1 (ydin + paikallispolitiikka) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Säleikkö Vaihe 1 — a Telegram-based personal AI assistant (repo: new `saleikko` project) that automatically monitors Kokkola's city council meeting documents, filters them against the user's interest topics, summarizes matches, sends a daily briefing plus urgent alerts, and helps draft position statements.

**Architecture:** A single long-running Node.js/TypeScript process runs on a Hetzner VPS (systemd service) and owns a Telegram bot via long-polling (chosen over webhooks to avoid needing a TLS-terminating reverse proxy for a single-user bot — same "always-on gateway" role, simpler ops), an in-process cron scheduler, and calls to the Anthropic API. All persistent data lives in Supabase Postgres. The politics skill polls Kokkola's public "Dynasty" meeting-document system (`kokkola10.oncloudos.com`) via its RSS feed and per-item HTML pages — verified against the live system during design (see Task 4/5 fixtures).

**Tech Stack:** Node.js 20+, TypeScript, grammY (Telegram), `@anthropic-ai/sdk` (Claude Sonnet 5 for reasoning, Claude Haiku 4.5 for classification), `@supabase/supabase-js`, `cheerio` (HTML parsing), `node-cron`, `vitest` (tests).

**Spec:** `docs/superpowers/specs/2026-08-24-saleikko-design.md`

---

## Before you start

All work happens in a **new, separate repository** at `/Users/patrikfriis/Projects/Unelma` (not inside `treeniapp`). Task 0 creates it. Every file path below is relative to that repo root unless stated otherwise.

## Task 0: Repo scaffold

**Files:**
- Create: `/Users/patrikfriis/Projects/Unelma/package.json`
- Create: `/Users/patrikfriis/Projects/Unelma/tsconfig.json`
- Create: `/Users/patrikfriis/Projects/Unelma/.gitignore`
- Create: `/Users/patrikfriis/Projects/Unelma/.env.example`
- Create: `/Users/patrikfriis/Projects/Unelma/vitest.config.ts`

- [ ] **Step 1: Clone the existing repo**

The GitHub repo `https://github.com/patrikfriis-alt/Unelma` already exists (created via GitHub, contains only a `README.md`). Clone it locally:

```bash
cd /Users/patrikfriis/Projects
git clone https://github.com/patrikfriis-alt/Unelma.git
cd Unelma
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "saleikko",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.70.0",
    "@supabase/supabase-js": "^2.45.0",
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.5",
    "grammy": "^1.30.0",
    "node-cron": "^3.0.3",
    "zod": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

> **Note (verified during Task 8):** `zod` must be v4, not v3 — `@anthropic-ai/sdk`'s `betaZodOutputFormat` helper (used in Task 8) internally calls `z.toJSONSchema(...)`, which only exists in zod v4. Confirmed directly against the installed packages' source (zod v3.25.76 has no `toJSONSchema` export; `@anthropic-ai/sdk@0.70.1`'s `betaZodOutputFormat` calls it unconditionally). The version above (`^4.5.0`) reflects this; if you're executing this plan against an older snapshot with `zod: "^3.23.8"`, upgrade it before Task 8.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 6: Write `.env.example`**

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DAILY_BRIEFING_HOUR=7
PORT=3000
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example package-lock.json
git commit -m "chore: scaffold saleikko project"
```

---

## Task 1: Config module

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const REQUIRED_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ALLOWED_USER_ID",
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of REQUIRED_VARS) delete process.env[key];
    delete process.env.DAILY_BRIEFING_HOUR;
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when a required variable is missing", async () => {
    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("parses all required variables and applies defaults", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_ALLOWED_USER_ID = "123456";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.telegramBotToken).toBe("bot-token");
    expect(config.telegramAllowedUserId).toBe(123456);
    expect(config.anthropicApiKey).toBe("sk-ant-test");
    expect(config.supabaseUrl).toBe("https://example.supabase.co");
    expect(config.supabaseServiceRoleKey).toBe("service-role-key");
    expect(config.dailyBriefingHour).toBe(7);
    expect(config.port).toBe(3000);
  });

  it("respects overridden DAILY_BRIEFING_HOUR and PORT", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_ALLOWED_USER_ID = "123456";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.DAILY_BRIEFING_HOUR = "9";
    process.env.PORT = "8080";

    const { loadConfig } = await import("./config.js");
    const config = loadConfig();

    expect(config.dailyBriefingHour).toBe(9);
    expect(config.port).toBe(8080);
  });

  it("throws a clear error when a numeric variable is not a valid number", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_ALLOWED_USER_ID = "not-a-number";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow(/Invalid number for TELEGRAM_ALLOWED_USER_ID/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `Cannot find module './config.js'`

- [ ] **Step 3: Write `src/config.ts`**

```typescript
import "dotenv/config";

export interface Config {
  telegramBotToken: string;
  telegramAllowedUserId: number;
  anthropicApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  dailyBriefingHour: number;
  port: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseNumber(value: string, varName: string): number {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid number for ${varName}: ${value}`);
  }
  return num;
}

export function loadConfig(): Config {
  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    telegramAllowedUserId: parseNumber(
      requireEnv("TELEGRAM_ALLOWED_USER_ID"),
      "TELEGRAM_ALLOWED_USER_ID",
    ),
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    dailyBriefingHour: parseNumber(
      process.env.DAILY_BRIEFING_HOUR ?? "7",
      "DAILY_BRIEFING_HOUR",
    ),
    port: parseNumber(process.env.PORT ?? "3000", "PORT"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add config loader"
```

---

## Task 2: Supabase schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write the schema**

```sql
-- supabase/schema.sql
-- Run this once in the Supabase project's SQL editor (Dashboard > SQL Editor > New query),
-- or via `supabase db push` if you have the Supabase CLI linked to the project.

create schema if not exists saleikko;

create table saleikko.raw_documents (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  meeting_id text not null,
  board text not null,
  meeting_date date not null,
  title text not null,
  source_url text not null,
  gatekeeper_decision text not null check (gatekeeper_decision in ('match', 'no_match', 'uncertain')),
  gatekeeper_reasoning text,
  body_text text,
  pdf_url text,
  seen_at timestamptz not null default now(),
  fetched_at timestamptz,
  check (gatekeeper_decision = 'no_match' or body_text is not null or fetched_at is null)
);

create table saleikko.document_summaries (
  id uuid primary key default gen_random_uuid(),
  raw_document_id uuid not null unique references saleikko.raw_documents(id),
  summary text not null,
  created_at timestamptz not null default now()
);

create table saleikko.gatekeeper_profile (
  id int primary key default 1,
  profile_text text not null,
  updated_at timestamptz not null default now(),
  check (id = 1)
);

insert into saleikko.gatekeeper_profile (id, profile_text)
values (1, 'Ei vielä ohjeistusta. Merkitse kaikki "uncertain", kunnes käyttäjä antaa palautetta /opeta-komennolla.')
on conflict (id) do nothing;

create table saleikko.gatekeeper_feedback (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  proposed_profile_text text,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

create table saleikko.positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_text text not null,
  created_at timestamptz not null default now()
);

create table saleikko.reminders (
  id uuid primary key default gen_random_uuid(),
  raw_document_id uuid references saleikko.raw_documents(id),
  due_at timestamptz not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table saleikko.conversation_log (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table saleikko.app_state (
  key text primary key,
  value text not null
);

insert into saleikko.app_state (key, value)
values ('last_briefing_at', '1970-01-01T00:00:00Z')
on conflict (key) do nothing;
```

Note on `raw_documents`: a row is created for every RSS item seen, regardless of `gatekeeper_decision` — this is what makes the idempotency check in the ingest pipeline work without ever re-classifying a `no_match` item. `body_text`/`pdf_url`/`fetched_at` stay null for `no_match` rows, since Vaihe 2 (full content fetch) never runs for them — this is the mechanism that avoids "parsing everything."

- [ ] **Step 2: Apply the schema**

Open the Supabase project dashboard → SQL Editor → paste the contents of `supabase/schema.sql` → Run. Verify all 9 tables appear under the `saleikko` schema in the Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema for saleikko"
```

---

## Task 3: Supabase client and shared types

**Files:**
- Create: `src/types.ts`
- Create: `src/supabase/client.ts`

- [ ] **Step 1: Write `src/types.ts`**

```typescript
export type GatekeeperDecision = "match" | "no_match" | "uncertain";

export interface RawDocument {
  id: string;
  source_id: string;
  meeting_id: string;
  board: string;
  meeting_date: string;
  title: string;
  source_url: string;
  gatekeeper_decision: GatekeeperDecision;
  gatekeeper_reasoning: string | null;
  body_text: string | null;
  pdf_url: string | null;
  seen_at: string;
  fetched_at: string | null;
}

export interface DocumentSummary {
  id: string;
  raw_document_id: string;
  summary: string;
  created_at: string;
}

export interface GatekeeperProfile {
  id: number;
  profile_text: string;
  updated_at: string;
}

export interface GatekeeperFeedback {
  id: string;
  raw_text: string;
  proposed_profile_text: string | null;
  applied: boolean;
  created_at: string;
}

export interface Position {
  id: string;
  title: string;
  body_text: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  raw_document_id: string | null;
  due_at: string;
  description: string;
  created_at: string;
}
```

- [ ] **Step 2: Write `src/supabase/client.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";

export function createSupabaseClient(config: Config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    db: { schema: "saleikko" },
  });
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/supabase/client.ts
git commit -m "feat: add shared types and Supabase client factory"
```

---

## Task 4: Kokkola RSS ingestion source

This is the concrete, verified integration with Kokkola's public meeting-document system (`kokkola10.oncloudos.com`, a "Dynasty" municipal case-management platform). Verified live during design:

- RSS feed of new agenda items: `https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=N` — served as `charset=iso-8859-1`.
- Each `<item>` has `<title>` in the form `"{Board} {DD.MM.YYYY} / {ItemTitle}"`, and `<link>` containing `...&id={meetingId}-{itemNumber}`.

**Files:**
- Create: `src/skills/politics/kokkolaRss.ts`
- Test: `src/skills/politics/kokkolaRss.test.ts`

- [ ] **Step 1: Write the failing test with a real fixture**

```typescript
// src/skills/politics/kokkolaRss.test.ts
import { describe, it, expect } from "vitest";
import { parseMeetingItemsRss } from "./kokkolaRss.js";

// Trimmed, real sample captured from
// https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=10
const SAMPLE_RSS = `<?xml version='1.0' encoding='iso-8859-1'?><rss version='2.0'><channel><title><![CDATA[Dynasty]]></title><description><![CDATA[Dynasty - Kokousasiat]]></description><link><![CDATA[https://kokkola10.oncloudos.com:443/cgi/DREQUEST.PHP?page=meeting_frames]]></link><item><title><![CDATA[Konserni- ja kaupunkikehitysjaosto 27.08.2026 / Asuntotuotannon edistäminen kunnassa]]></title><description><![CDATA[Asuntotuotannon edistäminen kunnassa]]></description><link><![CDATA[https://kokkola10.oncloudos.com:443/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-7]]></link></item><item><title><![CDATA[Konserni- ja kaupunkikehitysjaosto 27.08.2026 / Työjärjestyksen hyväksyminen]]></title><description><![CDATA[Työjärjestyksen hyväksyminen]]></description><link><![CDATA[https://kokkola10.oncloudos.com:443/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-3]]></link></item></channel></rss>`;

describe("parseMeetingItemsRss", () => {
  it("parses items into structured MeetingItemLink entries", () => {
    const items = parseMeetingItemsRss(SAMPLE_RSS);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      sourceId: "20261273-7",
      meetingId: "20261273",
      board: "Konserni- ja kaupunkikehitysjaosto",
      meetingDate: "2026-08-27",
      title: "Asuntotuotannon edistäminen kunnassa",
      url: "https://kokkola10.oncloudos.com:443/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-7",
    });
    expect(items[1].sourceId).toBe("20261273-3");
    expect(items[1].title).toBe("Työjärjestyksen hyväksyminen");
  });

  it("returns an empty array for a feed with no items", () => {
    const empty = `<?xml version='1.0'?><rss version='2.0'><channel><title><![CDATA[Dynasty]]></title></channel></rss>`;
    expect(parseMeetingItemsRss(empty)).toEqual([]);
  });

  it("skips items whose title does not match the expected format", () => {
    const malformed = `<?xml version='1.0'?><rss version='2.0'><channel><item><title><![CDATA[Not a valid title format]]></title><description><![CDATA[x]]></description><link><![CDATA[https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=1-1]]></link></item></channel></rss>`;
    expect(parseMeetingItemsRss(malformed)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/kokkolaRss.test.ts`
Expected: FAIL — `Cannot find module './kokkolaRss.js'`

- [ ] **Step 3: Write `src/skills/politics/kokkolaRss.ts`**

```typescript
export interface MeetingItemLink {
  sourceId: string;
  meetingId: string;
  board: string;
  meetingDate: string; // ISO yyyy-mm-dd
  title: string;
  url: string;
}

const KOKKOLA_RSS_URL =
  "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=50";

const ITEM_RE = /<item>(.*?)<\/item>/gs;
const TITLE_RE = /<title><!\[CDATA\[(.*?)\]\]><\/title>/s;
const LINK_RE = /<link><!\[CDATA\[(.*?)\]\]><\/link>/s;
const TITLE_FORMAT_RE = /^(.+?) (\d{2})\.(\d{2})\.(\d{4}) \/ (.+)$/s;
const ID_RE = /[?&]id=([\d-]+)/;

export function parseMeetingItemsRss(xml: string): MeetingItemLink[] {
  const items: MeetingItemLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = ITEM_RE.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = TITLE_RE.exec(block);
    const linkMatch = LINK_RE.exec(block);
    if (!titleMatch || !linkMatch) continue;

    const url = linkMatch[1];
    const idMatch = ID_RE.exec(url);
    if (!idMatch) continue;
    const sourceId = idMatch[1];
    const meetingId = sourceId.split("-")[0];

    const titleParts = TITLE_FORMAT_RE.exec(titleMatch[1]);
    if (!titleParts) continue;
    const [, board, dd, mm, yyyy, title] = titleParts;

    items.push({
      sourceId,
      meetingId,
      board: board.trim(),
      meetingDate: `${yyyy}-${mm}-${dd}`,
      title: title.trim(),
      url,
    });
  }

  return items;
}

export async function fetchMeetingItemsRss(
  showCount = 50,
): Promise<MeetingItemLink[]> {
  const url = `https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=${showCount}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Kokkola RSS fetch failed: HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const xml = new TextDecoder("iso-8859-1").decode(buffer);
  return parseMeetingItemsRss(xml);
}

export { KOKKOLA_RSS_URL };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/kokkolaRss.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/kokkolaRss.ts src/skills/politics/kokkolaRss.test.ts
git commit -m "feat: parse Kokkola Dynasty meeting-items RSS feed"
```

---

## Task 5: Kokkola meeting item detail fetch + parse

Verified live: `https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id={sourceId}` returns `charset=UTF-8` HTML. The full agenda-item text (title, valmistelija, selostus, päätösesitys) is inside `<div class='data-part-block-htm'>`. A PDF copy is linked from an `<a href="../kokous/{sourceId}.PDF">`.

**Files:**
- Create: `src/skills/politics/kokkolaDetail.ts`
- Test: `src/skills/politics/kokkolaDetail.test.ts`

- [ ] **Step 1: Write the failing test with a real (trimmed) fixture**

```typescript
// src/skills/politics/kokkolaDetail.test.ts
import { describe, it, expect } from "vitest";
import { parseMeetingItemDetail } from "./kokkolaDetail.js";

// Trimmed real fixture captured from
// https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-7
const SAMPLE_HTML = `<!DOCTYPE html>
<html><body>
<div class='data-part page-navigation'>
<a class='' target='_blank' href='../kokous/20261273-7.PDF'>Kokousasia</a>
</div>
<div class='data-part meetingitem'>
<div class='data-part-block-htm'>
<div><p><span style="font-weight:bold">Asuntotuotannon edistäminen kunnassa</span></p>
<p><span>Konserni- ja kaupunkikehitysjaosto</span> <span>27.08.2026</span></p>
<p><span>Valmistelija</span><span>Hallintojohtaja Ben Weizmann ja controller Jenni Sinkkonen</span></p>
<p><span>Kunta voi vaikuttaa asuntomarkkinoihin ja siten kunnan elinvoimaisuuteen harjoittamansa asuntopolitiikan avulla.</span></p>
<p><span>Kaupunginjohtaja</span><span>Konserni- ja kaupunkikehitysjaosto päättää, että kaupunki ei edistä asuntotuotantoa osallistumalla markkinaehtoisiin rakennushankkeisiin.</span></p>
</div></div></div>
</body></html>`;

describe("parseMeetingItemDetail", () => {
  it("extracts body text and pdf url", () => {
    const result = parseMeetingItemDetail(
      SAMPLE_HTML,
      "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-7",
    );

    expect(result.bodyText).toContain("Asuntotuotannon edistäminen kunnassa");
    expect(result.bodyText).toContain("Valmistelija");
    expect(result.bodyText).toContain(
      "Konserni- ja kaupunkikehitysjaosto päättää",
    );
    expect(result.pdfUrl).toBe(
      "https://kokkola10.oncloudos.com/kokous/20261273-7.PDF",
    );
  });

  it("returns null pdfUrl when no PDF link is present", () => {
    const html = `<html><body><div class='data-part-block-htm'><p>Just plain text, no PDF link here</p></div></body></html>`;
    const result = parseMeetingItemDetail(
      html,
      "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=1-1",
    );
    expect(result.pdfUrl).toBeNull();
    expect(result.bodyText).toBe("Just plain text, no PDF link here");
  });

  it("throws if the page structure changed and no body text was found", () => {
    const html = `<html><body><div class='some-other-layout'><p>Dynasty changed their markup</p></div></body></html>`;

    expect(() =>
      parseMeetingItemDetail(
        html,
        "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=1-1",
      ),
    ).toThrow(/empty body text/i);
  });

  it("throws if the body text is suspiciously short", () => {
    const html = `<html><body><div class='data-part-block-htm'><p>...</p></div></body></html>`;

    expect(() =>
      parseMeetingItemDetail(
        html,
        "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=1-1",
      ),
    ).toThrow(/empty body text/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/kokkolaDetail.test.ts`
Expected: FAIL — `Cannot find module './kokkolaDetail.js'`

- [ ] **Step 3: Write `src/skills/politics/kokkolaDetail.ts`**

```typescript
import * as cheerio from "cheerio";

export interface MeetingItemDetail {
  bodyText: string;
  pdfUrl: string | null;
}

const MIN_BODY_TEXT_LENGTH = 20;

export function parseMeetingItemDetail(
  html: string,
  pageUrl: string,
): MeetingItemDetail {
  const $ = cheerio.load(html);

  const bodyText = $("div.data-part-block-htm")
    .text()
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();

  if (bodyText.length < MIN_BODY_TEXT_LENGTH) {
    throw new Error(
      `parseMeetingItemDetail: empty body text extracted from ${pageUrl} - ` +
        "Kokkola's Dynasty page structure may have changed " +
        "(expected a 'div.data-part-block-htm' element with real content).",
    );
  }

  const pdfHref = $("a[href*='/kokous/']").attr("href");
  const pdfUrl = pdfHref ? new URL(pdfHref, pageUrl).toString() : null;

  return { bodyText, pdfUrl };
}

export async function fetchMeetingItemDetail(
  sourceId: string,
): Promise<MeetingItemDetail> {
  const url = `https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=${encodeURIComponent(sourceId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Kokkola meeting item fetch failed for ${sourceId}: HTTP ${res.status}`,
    );
  }
  const buffer = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buffer);
  return parseMeetingItemDetail(html, url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/kokkolaDetail.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/kokkolaDetail.ts src/skills/politics/kokkolaDetail.test.ts
git commit -m "feat: parse Kokkola Dynasty meeting item detail pages"
```

---

## Task 6: Claude client wrapper

**Files:**
- Create: `src/claude/client.ts`

- [ ] **Step 1: Write `src/claude/client.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";

export const SONNET_MODEL = "claude-sonnet-5";
export const HAIKU_MODEL = "claude-haiku-4-5";

export function createAnthropicClient(config: Config): Anthropic {
  return new Anthropic({ apiKey: config.anthropicApiKey });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/claude/client.ts
git commit -m "feat: add Anthropic client factory"
```

---

## Task 7: Gatekeeper profile management

Replaces a flat keyword list with a single evolving free-text profile document, refined over time via user feedback (`/opeta`) — the profile is what Task 8's classifier reads on every decision. Updates always go through a propose → user-approves flow, never applied automatically.

**Files:**
- Create: `src/skills/politics/gatekeeper.ts`
- Test: `src/skills/politics/gatekeeper.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/gatekeeper.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  getProfile,
  proposeProfileUpdate,
  getPendingFeedback,
  approvePendingFeedback,
  rejectPendingFeedback,
} from "./gatekeeper.js";
import type { SupabaseClient } from "../../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

function makeFakeSupabase(overrides: Partial<Record<string, any>> = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "gatekeeper_profile") {
        return (
          overrides.gatekeeper_profile ?? {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { profile_text: "Kaavoitus kiinnostaa aina." },
                    error: null,
                  }),
                ),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          }
        );
      }
      if (table === "gatekeeper_feedback") {
        return overrides.gatekeeper_feedback ?? {};
      }
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("getProfile", () => {
  it("returns the current profile text", async () => {
    const supabase = makeFakeSupabase();
    const text = await getProfile(supabase);
    expect(text).toBe("Kaavoitus kiinnostaa aina.");
  });
});

describe("proposeProfileUpdate", () => {
  it("asks Sonnet to merge feedback into the profile and stores the proposal unapplied", async () => {
    const insertedRow = {
      id: "fb-1",
      raw_text: "kaavoitus kiinnostaa, mutta ei rakennusluvat",
      proposed_profile_text: "Kaavoitus kiinnostaa aina. Rakennusluvat eivät kiinnosta.",
      applied: false,
      created_at: "2026-01-01",
    };
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: insertedRow, error: null })),
      })),
    }));
    const supabase = makeFakeSupabase({ gatekeeper_feedback: { insert } });

    const create = vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        content: [
          { type: "text", text: "Kaavoitus kiinnostaa aina. Rakennusluvat eivät kiinnosta." },
        ],
      }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const result = await proposeProfileUpdate(
      supabase,
      anthropic,
      "kaavoitus kiinnostaa, mutta ei rakennusluvat",
    );

    expect(result).toEqual(insertedRow);
    expect(insert).toHaveBeenCalledWith({
      raw_text: "kaavoitus kiinnostaa, mutta ei rakennusluvat",
      proposed_profile_text: "Kaavoitus kiinnostaa aina. Rakennusluvat eivät kiinnosta.",
      applied: false,
    });
    const callArgs = create.mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain("Kaavoitus kiinnostaa aina.");
    expect(JSON.stringify(callArgs)).toContain("kaavoitus kiinnostaa, mutta ei rakennusluvat");
  });
});

describe("getPendingFeedback", () => {
  it("returns the latest unapplied feedback row", async () => {
    const limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "fb-2", raw_text: "x", proposed_profile_text: "y", applied: false, created_at: "2026-01-02" }],
        error: null,
      }),
    );
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = makeFakeSupabase({ gatekeeper_feedback: { select } });

    const pending = await getPendingFeedback(supabase);

    expect(eq).toHaveBeenCalledWith("applied", false);
    expect(pending?.id).toBe("fb-2");
  });

  it("returns null when there is no pending feedback", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = makeFakeSupabase({ gatekeeper_feedback: { select } });

    const pending = await getPendingFeedback(supabase);

    expect(pending).toBeNull();
  });
});

describe("approvePendingFeedback", () => {
  it("applies the pending proposal to the profile and marks it applied", async () => {
    const limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "fb-3", raw_text: "x", proposed_profile_text: "Uusi profiiliteksti.", applied: false, created_at: "2026-01-03" }],
        error: null,
      }),
    );
    const order = vi.fn(() => ({ limit }));
    const eqSelect = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq: eqSelect }));

    const eqUpdateFeedback = vi.fn(() => Promise.resolve({ error: null }));
    const updateFeedback = vi.fn(() => ({ eq: eqUpdateFeedback }));

    const eqUpdateProfile = vi.fn(() => Promise.resolve({ error: null }));
    const updateProfile = vi.fn(() => ({ eq: eqUpdateProfile }));

    const supabase = makeFakeSupabase({
      gatekeeper_feedback: { select, update: updateFeedback },
      gatekeeper_profile: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: { profile_text: "Vanha." }, error: null }),
            ),
          })),
        })),
        update: updateProfile,
      },
    });

    await approvePendingFeedback(supabase);

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profile_text: "Uusi profiiliteksti." }),
    );
    expect(eqUpdateProfile).toHaveBeenCalledWith("id", 1);
    expect(updateFeedback).toHaveBeenCalledWith({ applied: true });
    expect(eqUpdateFeedback).toHaveBeenCalledWith("id", "fb-3");
  });

  it("throws when there is no pending feedback to approve", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = makeFakeSupabase({ gatekeeper_feedback: { select } });

    await expect(approvePendingFeedback(supabase)).rejects.toThrow(/no pending proposal/i);
  });
});

describe("rejectPendingFeedback", () => {
  it("marks the pending feedback applied without changing the profile", async () => {
    const limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "fb-4", raw_text: "x", proposed_profile_text: "y", applied: false, created_at: "2026-01-04" }],
        error: null,
      }),
    );
    const order = vi.fn(() => ({ limit }));
    const eqSelect = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq: eqSelect }));

    const eqUpdate = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq: eqUpdate }));

    const profileUpdate = vi.fn();
    const supabase = makeFakeSupabase({
      gatekeeper_feedback: { select, update },
      gatekeeper_profile: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { profile_text: "x" }, error: null })) })),
        })),
        update: profileUpdate,
      },
    });

    await rejectPendingFeedback(supabase);

    expect(update).toHaveBeenCalledWith({ applied: true });
    expect(eqUpdate).toHaveBeenCalledWith("id", "fb-4");
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("throws when there is no pending feedback to reject", async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = makeFakeSupabase({ gatekeeper_feedback: { select } });

    await expect(rejectPendingFeedback(supabase)).rejects.toThrow(/no pending proposal/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/gatekeeper.test.ts`
Expected: FAIL — `Cannot find module './gatekeeper.js'`

- [ ] **Step 3: Write `src/skills/politics/gatekeeper.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../../supabase/client.js";
import type { GatekeeperFeedback } from "../../types.js";
import { SONNET_MODEL } from "../../claude/client.js";

export async function getProfile(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("gatekeeper_profile")
    .select("profile_text")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`getProfile failed: ${error.message}`);
  return data.profile_text;
}

export async function proposeProfileUpdate(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  feedbackText: string,
): Promise<GatekeeperFeedback> {
  const currentProfile = await getProfile(supabase);

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system:
      "Olet Säleikkö. Käyttäjä antaa sinulle vapaamuotoista palautetta siitä, " +
      "mitkä kunnan kokousasiat kiinnostavat häntä ja mitkä eivät. Päivitä " +
      "annettu portinvartijaprofiili tämän palautteen perusteella. Säilytä " +
      "aiemmat, yhä relevantit ohjeet, lisää tai tarkenna uuden palautteen " +
      "perusteella. Vastaa VAIN päivitetyllä profiilitekstillä, ei muuta.",
    messages: [
      {
        role: "user",
        content:
          `Nykyinen profiili:\n${currentProfile}\n\nUusi palaute:\n${feedbackText}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new Error("proposeProfileUpdate: no text block in response");
  }

  const { data, error } = await supabase
    .from("gatekeeper_feedback")
    .insert({
      raw_text: feedbackText,
      proposed_profile_text: textBlock.text,
      applied: false,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(
      `proposeProfileUpdate: failed to store feedback: ${error?.message}`,
    );
  }
  return data as GatekeeperFeedback;
}

export async function getPendingFeedback(
  supabase: SupabaseClient,
): Promise<GatekeeperFeedback | null> {
  const { data, error } = await supabase
    .from("gatekeeper_feedback")
    .select("*")
    .eq("applied", false)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getPendingFeedback failed: ${error.message}`);
  return data && data.length > 0 ? data[0] : null;
}

export async function approvePendingFeedback(
  supabase: SupabaseClient,
): Promise<void> {
  const pending = await getPendingFeedback(supabase);
  if (!pending || !pending.proposed_profile_text) {
    throw new Error("approvePendingFeedback: no pending proposal to approve");
  }

  const { error: updateError } = await supabase
    .from("gatekeeper_profile")
    .update({
      profile_text: pending.proposed_profile_text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (updateError) {
    throw new Error(
      `approvePendingFeedback: failed to update profile: ${updateError.message}`,
    );
  }

  const { error: markError } = await supabase
    .from("gatekeeper_feedback")
    .update({ applied: true })
    .eq("id", pending.id);
  if (markError) {
    throw new Error(
      `approvePendingFeedback: failed to mark feedback applied: ${markError.message}`,
    );
  }
}

export async function rejectPendingFeedback(
  supabase: SupabaseClient,
): Promise<void> {
  const pending = await getPendingFeedback(supabase);
  if (!pending) {
    throw new Error("rejectPendingFeedback: no pending proposal to reject");
  }

  const { error } = await supabase
    .from("gatekeeper_feedback")
    .update({ applied: true })
    .eq("id", pending.id);
  if (error) {
    throw new Error(
      `rejectPendingFeedback: failed to mark feedback rejected: ${error.message}`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/gatekeeper.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/gatekeeper.ts src/skills/politics/gatekeeper.test.ts
git commit -m "feat: add gatekeeper profile management (propose/approve/reject)"
```

---

## Task 8: Gatekeeper classification (Haiku, title-only)

Uses `client.messages.parse` with a Zod output schema (structured outputs), per the Claude API TypeScript reference. Classifies using **only the RSS item's title/board/date** — deliberately does NOT fetch or read the full document body. This is what keeps the cost and the archive proportional to what the user actually cares about: this cheap classification runs on every new item from the RSS feed (city-wide, all boards), and only items it flags `match`/`uncertain` ever trigger a full-content fetch (Task 5) or Sonnet summarization (Task 9). Errs toward `"uncertain"` rather than `"no_match"` when unsure — a missed relevant item is worse than one extra fetch (per spec's Testing section).

**Files:**
- Create: `src/skills/politics/classify.ts`
- Test: `src/skills/politics/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/classify.test.ts
import { describe, it, expect, vi } from "vitest";
import { classifyByTitle } from "./classify.js";
import type Anthropic from "@anthropic-ai/sdk";
import type { MeetingItemLink } from "./kokkolaRss.js";

function makeFakeAnthropic(parsedOutput: unknown) {
  return {
    beta: {
      messages: {
        parse: vi.fn(() => Promise.resolve({ parsed_output: parsedOutput })),
      },
    },
  } as unknown as Anthropic;
}

const ITEM: MeetingItemLink = {
  sourceId: "20261273-7",
  meetingId: "20261273",
  board: "Konserni- ja kaupunkikehitysjaosto",
  meetingDate: "2026-08-27",
  title: "Asuntotuotannon edistäminen kunnassa",
  url: "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-7",
};

const PROFILE_TEXT = "Asuntopolitiikka ja kaavoitus kiinnostavat aina.";

describe("classifyByTitle", () => {
  it("returns a match decision from the parsed output", async () => {
    const anthropic = makeFakeAnthropic({
      decision: "match",
      reasoning: "Title is directly about housing production policy.",
    });

    const result = await classifyByTitle(anthropic, ITEM, PROFILE_TEXT);

    expect(result.decision).toBe("match");
    expect(result.reasoning).toContain("housing");
  });

  it("returns uncertain when the title is ambiguous relative to the profile", async () => {
    const anthropic = makeFakeAnthropic({
      decision: "uncertain",
      reasoning: "Title is ambiguous relative to the profile.",
    });

    const result = await classifyByTitle(anthropic, ITEM, PROFILE_TEXT);

    expect(result.decision).toBe("uncertain");
  });

  it("returns no_match when the title is unrelated to the profile", async () => {
    const anthropic = makeFakeAnthropic({
      decision: "no_match",
      reasoning: "Procedural item unrelated to the profile.",
    });

    const result = await classifyByTitle(anthropic, ITEM, PROFILE_TEXT);

    expect(result.decision).toBe("no_match");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/classify.test.ts`
Expected: FAIL — `Cannot find module './classify.js'`

- [ ] **Step 3: Write `src/skills/politics/classify.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { HAIKU_MODEL } from "../../claude/client.js";
import type { GatekeeperDecision } from "../../types.js";
import type { MeetingItemLink } from "./kokkolaRss.js";

const GatekeeperSchema = z.object({
  decision: z.enum(["match", "no_match", "uncertain"]),
  reasoning: z.string(),
});

export interface GatekeeperResult {
  decision: GatekeeperDecision;
  reasoning: string;
}

export async function classifyByTitle(
  anthropic: Anthropic,
  item: MeetingItemLink,
  profileText: string,
): Promise<GatekeeperResult> {
  const response = await anthropic.beta.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 512,
    system:
      "Olet Säleikkö, kunnanvaltuutetun portinvartija-avustaja. Päätä PELKÄN " +
      "OTSIKON perusteella (et näe vielä koko sisältöä) kannattaako tämä " +
      "kunnan kokousasia hakea ja käsitellä kokonaan. Käytä annettua " +
      "profiilia siitä mikä käyttäjää kiinnostaa. Jos olet epävarma, valitse " +
      "mieluummin 'uncertain' kuin 'no_match' - relevantin asian huomaamatta " +
      "jättäminen on pahempi virhe kuin turha jatkokäsittely.",
    messages: [
      {
        role: "user",
        content:
          `Käyttäjän kiinnostusprofiili:\n${profileText}\n\n` +
          `Toimielin: ${item.board}\n` +
          `Kokouspäivä: ${item.meetingDate}\n` +
          `Asian otsikko: ${item.title}\n\n` +
          "Kannattaako tämä asia hakea ja käsitellä kokonaan?",
      },
    ],
    output_format: betaZodOutputFormat(GatekeeperSchema),
  });

  if (!response.parsed_output) {
    throw new Error(
      `classifyByTitle: failed to parse output for ${item.sourceId}`,
    );
  }

  return response.parsed_output;
}
```

> **Note (verified against installed SDK):** the plan originally specified `client.messages.parse` + `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` + `output_config: { format: ... }`, matching newer Anthropic API docs. The actually-installed `@anthropic-ai/sdk@0.70.1` (pinned by Task 0's `^0.70.0`) only exposes this feature under the beta namespace: `client.beta.messages.parse`, `betaZodOutputFormat` from `@anthropic-ai/sdk/helpers/beta/zod`, and a top-level `output_format` field (not nested under `output_config`). Verified directly against the package's `.d.ts` files rather than guessed. The response field `parsed_output` (used below) is present on both the beta and non-beta result types, so that part was already correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/classify.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/classify.ts src/skills/politics/classify.test.ts
git commit -m "feat: add title-only gatekeeper classification (Haiku)"
```

---

## Task 9: Summarization (Sonnet)

**Files:**
- Create: `src/skills/politics/summarize.ts`
- Test: `src/skills/politics/summarize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/summarize.test.ts
import { describe, it, expect, vi } from "vitest";
import { summarizeDocument } from "./summarize.js";
import type Anthropic from "@anthropic-ai/sdk";

function makeFakeAnthropic(text: string) {
  return {
    messages: {
      create: vi.fn(() =>
        Promise.resolve({ content: [{ type: "text", text }] }),
      ),
    },
  } as unknown as Anthropic;
}

const DOC = {
  id: "doc-1",
  source_id: "20261273-7",
  meeting_id: "20261273",
  board: "Konserni- ja kaupunkikehitysjaosto",
  meeting_date: "2026-08-27",
  title: "Asuntotuotannon edistäminen kunnassa",
  source_url: "https://kokkola10.oncloudos.com/...",
  gatekeeper_decision: "match" as const,
  gatekeeper_reasoning: "Matches housing policy interest.",
  body_text: "Kunta voi vaikuttaa asuntomarkkinoihin...",
  pdf_url: null,
  seen_at: "2026-08-24T09:00:00Z",
  fetched_at: "2026-08-24T10:00:00Z",
};

describe("summarizeDocument", () => {
  it("returns the text block from the response", async () => {
    const anthropic = makeFakeAnthropic("Tiivistelmä: kaupunki ei osallistu markkinaehtoiseen asuntotuotantoon.");

    const summary = await summarizeDocument(anthropic, DOC);

    expect(summary).toBe(
      "Tiivistelmä: kaupunki ei osallistu markkinaehtoiseen asuntotuotantoon.",
    );
  });

  it("throws if the response has no text block", async () => {
    const anthropic = {
      messages: { create: vi.fn(() => Promise.resolve({ content: [] })) },
    } as unknown as Anthropic;

    await expect(summarizeDocument(anthropic, DOC)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/summarize.test.ts`
Expected: FAIL — `Cannot find module './summarize.js'`

- [ ] **Step 3: Write `src/skills/politics/summarize.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { SONNET_MODEL } from "../../claude/client.js";
import type { RawDocument } from "../../types.js";

export async function summarizeDocument(
  anthropic: Anthropic,
  doc: RawDocument,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system:
      "Olet Säleikkö, kunnanvaltuutetun avustaja. Tiivistä kokousasia " +
      "3-6 lauseeseen: mistä on kyse, mitä esitetään päätettäväksi, ja miksi " +
      "tämä on merkityksellistä valtuutetulle. Kirjoita selkeää suomea, " +
      "älä toista koko alkuperäistekstiä.",
    messages: [
      {
        role: "user",
        content:
          `Toimielin: ${doc.board}\nKokouspäivä: ${doc.meeting_date}\n` +
          `Otsikko: ${doc.title}\n\nSisältö:\n${doc.body_text}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new Error(`summarizeDocument: no text block for ${doc.source_id}`);
  }
  return textBlock.text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/summarize.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/summarize.ts src/skills/politics/summarize.test.ts
git commit -m "feat: add Sonnet-based document summarization"
```

---

## Task 10: Ingest pipeline orchestration

Combines Tasks 4/5/7/8/9 into the two-stage flow: fetch new RSS items → skip already-ingested `source_id`s → **Stage 1**: classify by title only against the gatekeeper profile (Task 8), insert a `raw_documents` row for every item regardless of decision (this is what preserves idempotency without ever re-classifying a rejected item) → **Stage 2, only for match/uncertain**: fetch full detail (Task 5), update the row with the fetched content, summarize (Task 9), store `document_summaries`, create a `reminders` row when the meeting is within 14 days → return the list of matched items (used by Task 16 for immediate urgent notification). `no_match` items never trigger a detail fetch or a Sonnet call.

**Files:**
- Create: `src/skills/politics/pipeline.ts`
- Test: `src/skills/politics/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runIngestPipeline } from "./pipeline.js";
import type { SupabaseClient } from "../../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

const RSS_ITEM = {
  sourceId: "20261273-7",
  meetingId: "20261273",
  board: "Konserni- ja kaupunkikehitysjaosto",
  meetingDate: "2026-08-27",
  title: "Asuntotuotannon edistäminen kunnassa",
  url: "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=20261273-7",
};

vi.mock("./kokkolaRss.js", () => ({
  fetchMeetingItemsRss: vi.fn(() => Promise.resolve([RSS_ITEM])),
}));

vi.mock("./kokkolaDetail.js", () => ({
  fetchMeetingItemDetail: vi.fn(() =>
    Promise.resolve({
      bodyText: "Kunta voi vaikuttaa asuntomarkkinoihin...",
      pdfUrl: "https://kokkola10.oncloudos.com/kokous/20261273-7.PDF",
    }),
  ),
}));

vi.mock("./classify.js", () => ({
  classifyByTitle: vi.fn(() =>
    Promise.resolve({ decision: "match", reasoning: "About housing policy." }),
  ),
}));

vi.mock("./summarize.js", () => ({
  summarizeDocument: vi.fn(() => Promise.resolve("Lyhyt tiivistelmä.")),
}));

vi.mock("./gatekeeper.js", () => ({
  getProfile: vi.fn(() => Promise.resolve("Asuntopolitiikka kiinnostaa aina.")),
}));

function makeFakeSupabase() {
  let nextId = 1;

  return {
    from: vi.fn((table: string) => {
      if (table === "raw_documents") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          insert: vi.fn((row: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { id: `doc-${nextId++}`, ...row },
                  error: null,
                }),
              ),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      if (table === "document_summaries") {
        return {
          insert: vi.fn((row: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { id: `sum-${nextId++}`, created_at: "2026-08-24T10:05:00Z", ...row },
                  error: null,
                }),
              ),
            })),
          })),
        };
      }
      if (table === "reminders") {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("runIngestPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies a new item by title, fetches and summarizes a match, and returns it", async () => {
    const supabase = makeFakeSupabase();
    const anthropic = {} as Anthropic;

    const matched = await runIngestPipeline(supabase, anthropic);

    expect(matched).toHaveLength(1);
    expect(matched[0].summary.summary).toBe("Lyhyt tiivistelmä.");
    expect(matched[0].doc.title).toBe("Asuntotuotannon edistäminen kunnassa");
    expect(matched[0].doc.body_text).toBe(
      "Kunta voi vaikuttaa asuntomarkkinoihin...",
    );
    expect(matched[0].doc.gatekeeper_decision).toBe("match");
  });

  it("stores a lightweight record but never fetches or summarizes a no_match item", async () => {
    const { classifyByTitle } = await import("./classify.js");
    (classifyByTitle as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      decision: "no_match",
      reasoning: "Unrelated procedural item.",
    });
    const { fetchMeetingItemDetail } = await import("./kokkolaDetail.js");
    const { summarizeDocument } = await import("./summarize.js");

    const supabase = makeFakeSupabase();
    const anthropic = {} as Anthropic;

    const matched = await runIngestPipeline(supabase, anthropic);

    expect(matched).toEqual([]);
    expect(fetchMeetingItemDetail).not.toHaveBeenCalled();
    expect(summarizeDocument).not.toHaveBeenCalled();
  });

  it("is idempotent: skips classify/fetch/summarize entirely for an already-known source_id", async () => {
    const { classifyByTitle } = await import("./classify.js");
    const { fetchMeetingItemDetail } = await import("./kokkolaDetail.js");
    const { summarizeDocument } = await import("./summarize.js");

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "raw_documents") {
          return {
            select: vi.fn(() => ({
              in: vi.fn((_col: string, ids: string[]) =>
                Promise.resolve({
                  data: ids.map((id) => ({ source_id: id })),
                  error: null,
                }),
              ),
            })),
          };
        }
        throw new Error(`Unexpected table in idempotency test: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const anthropic = {} as Anthropic;

    const matched = await runIngestPipeline(supabase, anthropic);

    expect(matched).toEqual([]);
    expect(classifyByTitle).not.toHaveBeenCalled();
    expect(fetchMeetingItemDetail).not.toHaveBeenCalled();
    expect(summarizeDocument).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/pipeline.test.ts`
Expected: FAIL — `Cannot find module './pipeline.js'`

- [ ] **Step 3: Write `src/skills/politics/pipeline.ts`**

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../../supabase/client.js";
import type { RawDocument, DocumentSummary } from "../../types.js";
import { fetchMeetingItemsRss } from "./kokkolaRss.js";
import { fetchMeetingItemDetail } from "./kokkolaDetail.js";
import { classifyByTitle } from "./classify.js";
import { summarizeDocument } from "./summarize.js";
import { getProfile } from "./gatekeeper.js";

export interface MatchedItem {
  doc: RawDocument;
  summary: DocumentSummary;
}

const URGENT_WINDOW_DAYS = 14;

export async function runIngestPipeline(
  supabase: SupabaseClient,
  anthropic: Anthropic,
): Promise<MatchedItem[]> {
  const rssItems = await fetchMeetingItemsRss(50);
  if (rssItems.length === 0) return [];

  const { data: existing } = await supabase
    .from("raw_documents")
    .select("source_id")
    .in(
      "source_id",
      rssItems.map((item) => item.sourceId),
    );
  const existingIds = new Set((existing ?? []).map((row: any) => row.source_id));

  const newItems = rssItems.filter((item) => !existingIds.has(item.sourceId));
  if (newItems.length === 0) return [];

  const profileText = await getProfile(supabase);
  const matched: MatchedItem[] = [];

  for (const item of newItems) {
    const classification = await classifyByTitle(anthropic, item, profileText);
    const isRelevant =
      classification.decision === "match" ||
      classification.decision === "uncertain";

    const { data: inserted, error: insertError } = await supabase
      .from("raw_documents")
      .insert({
        source_id: item.sourceId,
        meeting_id: item.meetingId,
        board: item.board,
        meeting_date: item.meetingDate,
        title: item.title,
        source_url: item.url,
        gatekeeper_decision: classification.decision,
        gatekeeper_reasoning: classification.reasoning,
      })
      .select()
      .single();
    if (insertError || !inserted) {
      throw new Error(
        `runIngestPipeline: failed to insert ${item.sourceId}: ${insertError?.message}`,
      );
    }

    if (!isRelevant) continue;

    let doc = inserted as RawDocument;
    const detail = await fetchMeetingItemDetail(item.sourceId);
    const fetchedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("raw_documents")
      .update({
        body_text: detail.bodyText,
        pdf_url: detail.pdfUrl,
        fetched_at: fetchedAt,
      })
      .eq("id", doc.id);
    if (updateError) {
      throw new Error(
        `runIngestPipeline: failed to update ${item.sourceId} with fetched content: ${updateError.message}`,
      );
    }
    doc = {
      ...doc,
      body_text: detail.bodyText,
      pdf_url: detail.pdfUrl,
      fetched_at: fetchedAt,
    };

    const summaryText = await summarizeDocument(anthropic, doc);

    const { data: insertedSummary, error: summaryError } = await supabase
      .from("document_summaries")
      .insert({ raw_document_id: doc.id, summary: summaryText })
      .select()
      .single();
    if (summaryError || !insertedSummary) {
      throw new Error(
        `runIngestPipeline: failed to insert summary for ${doc.source_id}: ${summaryError?.message}`,
      );
    }

    const daysUntilMeeting =
      (new Date(doc.meeting_date).getTime() - Date.now()) /
      (1000 * 60 * 60 * 24);
    if (daysUntilMeeting >= 0 && daysUntilMeeting <= URGENT_WINDOW_DAYS) {
      const { error: reminderError } = await supabase.from("reminders").insert({
        raw_document_id: doc.id,
        due_at: doc.meeting_date,
        description: `${doc.board}: ${doc.title}`,
      });
      if (reminderError) {
        throw new Error(
          `runIngestPipeline: failed to insert reminder for ${doc.source_id}: ${reminderError.message}`,
        );
      }
    }

    matched.push({
      doc,
      summary: insertedSummary as DocumentSummary,
    });
  }

  return matched;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/pipeline.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/pipeline.ts src/skills/politics/pipeline.test.ts
git commit -m "feat: wire two-stage ingest pipeline (title-gate, fetch, summarize, remind)"
```

---

## Task 11: Daily briefing composer

**Files:**
- Create: `src/skills/politics/briefing.ts`
- Test: `src/skills/politics/briefing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/briefing.test.ts
import { describe, it, expect, vi } from "vitest";
import { composeDailyBriefing, markBriefingSent } from "./briefing.js";
import type { SupabaseClient } from "../../supabase/client.js";

function makeFakeSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "app_state") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { key: "last_briefing_at", value: "2026-08-23T04:00:00Z" },
                  error: null,
                }),
              ),
            })),
          })),
        };
      }
      if (table === "document_summaries") {
        return {
          select: vi.fn(() => ({
            gt: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    summary: "Kaupunki ei edistä markkinaehtoista asuntotuotantoa.",
                    raw_documents: {
                      title: "Asuntotuotannon edistäminen kunnassa",
                      board: "Konserni- ja kaupunkikehitysjaosto",
                      meeting_date: "2026-08-27",
                      source_url: "https://kokkola10.oncloudos.com/...",
                    },
                  },
                ],
                error: null,
              }),
            ),
          })),
        };
      }
      if (table === "reminders") {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    due_at: "2026-08-27",
                    description: "Konserni- ja kaupunkikehitysjaosto: Asuntotuotannon edistäminen kunnassa",
                  },
                ],
                error: null,
              }),
            ),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("composeDailyBriefing", () => {
  it("includes matched summaries and upcoming reminders", async () => {
    const supabase = makeFakeSupabase();

    const { message, generatedAt } = await composeDailyBriefing(supabase);

    expect(message).toContain("Asuntotuotannon edistäminen kunnassa");
    expect(message).toContain("Kaupunki ei edistä markkinaehtoista asuntotuotantoa.");
    expect(message).toContain("Tulevat kokoukset");
    expect(typeof generatedAt).toBe("string");
  });

  it("says nothing new when there are no matched summaries", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "app_state") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { key: "last_briefing_at", value: "2026-08-23T04:00:00Z" },
                    error: null,
                  }),
                ),
              })),
            })),
          };
        }
        if (table === "document_summaries") {
          return {
            select: vi.fn(() => ({
              gt: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          };
        }
        if (table === "reminders") {
          return { select: vi.fn(() => ({ gte: vi.fn(() => Promise.resolve({ data: [], error: null })) })) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    const { message } = await composeDailyBriefing(supabase);

    expect(message).toContain("Ei uusia");
  });
});

describe("markBriefingSent", () => {
  it("updates app_state with the generated timestamp", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    } as unknown as SupabaseClient;

    await markBriefingSent(supabase, "2026-08-31T06:00:00.000Z");

    expect(update).toHaveBeenCalledWith({ value: "2026-08-31T06:00:00.000Z" });
    expect(eq).toHaveBeenCalledWith("key", "last_briefing_at");
  });

  it("throws when the update fails", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: { message: "boom" } }));
    const update = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    } as unknown as SupabaseClient;

    await expect(markBriefingSent(supabase, "2026-08-31T06:00:00.000Z")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/briefing.test.ts`
Expected: FAIL — `Cannot find module './briefing.js'`

- [ ] **Step 3: Write `src/skills/politics/briefing.ts`**

```typescript
import type { SupabaseClient } from "../../supabase/client.js";

export interface DailyBriefing {
  message: string;
  generatedAt: string;
}

export async function composeDailyBriefing(
  supabase: SupabaseClient,
): Promise<DailyBriefing> {
  const { data: stateRow } = await supabase
    .from("app_state")
    .select("*")
    .eq("key", "last_briefing_at")
    .single();
  const since = stateRow?.value ?? new Date(0).toISOString();
  const generatedAt = new Date().toISOString();

  const { data: summaries, error: summariesError } = await supabase
    .from("document_summaries")
    .select("summary, raw_documents(title, board, meeting_date, source_url)")
    .gt("created_at", since);
  if (summariesError) {
    throw new Error(`composeDailyBriefing: ${summariesError.message}`);
  }

  // due_at holds only a date (midnight UTC), so comparing against the
  // current instant would exclude meetings happening later today. Compare
  // against the start of today (UTC) instead.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const { data: reminders, error: remindersError } = await supabase
    .from("reminders")
    .select("due_at, description")
    .gte("due_at", startOfToday.toISOString());
  if (remindersError) {
    throw new Error(`composeDailyBriefing: ${remindersError.message}`);
  }

  const lines: string[] = ["🗂 Säleikön päivittäinen briiffi"];

  if (!summaries || summaries.length === 0) {
    lines.push("", "Ei uusia osuneita pykäliä sitten viime briiffin.");
  } else {
    lines.push("");
    for (const row of summaries as any[]) {
      const doc = row.raw_documents;
      lines.push(`• ${doc.board} — ${doc.title} (${doc.meeting_date})`);
      lines.push(`  ${row.summary}`);
      lines.push(`  ${doc.source_url}`);
    }
  }

  if (reminders && reminders.length > 0) {
    lines.push("", "📅 Tulevat kokoukset:");
    for (const r of reminders as any[]) {
      lines.push(`• ${r.due_at}: ${r.description}`);
    }
  }

  return { message: lines.join("\n"), generatedAt };
}

export async function markBriefingSent(
  supabase: SupabaseClient,
  generatedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("app_state")
    .update({ value: generatedAt })
    .eq("key", "last_briefing_at");
  if (error) {
    throw new Error(`markBriefingSent: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/briefing.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/briefing.ts src/skills/politics/briefing.test.ts
git commit -m "feat: add daily briefing composer"
```

---

## Task 12: Archive search and kannanotto (position) drafting

**Files:**
- Create: `src/skills/politics/search.ts`
- Create: `src/skills/politics/positions.ts`
- Test: `src/skills/politics/search.test.ts`
- Test: `src/skills/politics/positions.test.ts`

- [ ] **Step 1: Write the failing test for search**

```typescript
// src/skills/politics/search.test.ts
import { describe, it, expect, vi } from "vitest";
import { searchArchive } from "./search.js";
import type { SupabaseClient } from "../../supabase/client.js";

describe("searchArchive", () => {
  it("searches title and body_text with ilike", async () => {
    const or = vi.fn(() =>
      Promise.resolve({
        data: [{ id: "1", title: "Asuntotuotanto", body_text: "..." }],
        error: null,
      }),
    );
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const results = await searchArchive(supabase, "asunto");

    expect(select).toHaveBeenCalledWith("*");
    expect(or).toHaveBeenCalledWith(
      "title.ilike.%asunto%,body_text.ilike.%asunto%",
    );
    expect(results).toHaveLength(1);
  });

  it("strips % and _ wildcard characters from the query before building the filter", async () => {
    const or = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    await searchArchive(supabase, "50%_alennus");

    expect(or).toHaveBeenCalledWith(
      "title.ilike.%50alennus%,body_text.ilike.%50alennus%",
    );
  });

  it("throws when the Supabase query fails", async () => {
    const or = vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } }));
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    await expect(searchArchive(supabase, "asunto")).rejects.toThrow("searchArchive failed: boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/search.test.ts`
Expected: FAIL — `Cannot find module './search.js'`

- [ ] **Step 3: Write `src/skills/politics/search.ts`**

```typescript
import type { SupabaseClient } from "../../supabase/client.js";
import type { RawDocument } from "../../types.js";

export async function searchArchive(
  supabase: SupabaseClient,
  query: string,
): Promise<RawDocument[]> {
  const escaped = query.replace(/[%_]/g, "");
  const { data, error } = await supabase
    .from("raw_documents")
    .select("*")
    .or(`title.ilike.%${escaped}%,body_text.ilike.%${escaped}%`);
  if (error) throw new Error(`searchArchive failed: ${error.message}`);
  return (data ?? []) as RawDocument[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/search.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for kannanotto drafting**

```typescript
// src/skills/politics/positions.test.ts
import { describe, it, expect, vi } from "vitest";
import { draftPosition } from "./positions.js";
import type { SupabaseClient } from "../../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

const DOC = {
  id: "doc-1",
  source_id: "20261273-7",
  meeting_id: "20261273",
  board: "Konserni- ja kaupunkikehitysjaosto",
  meeting_date: "2026-08-27",
  title: "Asuntotuotannon edistäminen kunnassa",
  source_url: "https://kokkola10.oncloudos.com/...",
  gatekeeper_decision: "match" as const,
  gatekeeper_reasoning: "Matches housing policy interest.",
  body_text: "Kunta voi vaikuttaa asuntomarkkinoihin...",
  pdf_url: null,
  seen_at: "2026-08-24T09:00:00Z",
  fetched_at: "2026-08-24T10:00:00Z",
};

describe("draftPosition", () => {
  it("passes past positions as style reference and returns drafted text", async () => {
    const select = vi.fn(() => ({
      order: vi.fn(() =>
        Promise.resolve({
          data: [{ id: "p1", title: "Vanha kannanotto", body_text: "Aiempi teksti tyylinäytteeksi.", created_at: "2026-01-01" }],
          error: null,
        }),
      ),
    }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    const create = vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        content: [{ type: "text", text: "Luonnos kannanotoksi asuntotuotannosta." }],
      }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const draft = await draftPosition(supabase, anthropic, DOC);

    expect(draft).toBe("Luonnos kannanotoksi asuntotuotannosta.");
    const callArgs = create.mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain("Aiempi teksti tyylinäytteeksi.");
  });

  it("throws when the document has no body_text", async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    await expect(draftPosition(supabase, anthropic, { ...DOC, body_text: null })).rejects.toThrow(
      "no body_text",
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/positions.test.ts`
Expected: FAIL — `Cannot find module './positions.js'`

- [ ] **Step 7: Write `src/skills/politics/positions.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../../supabase/client.js";
import type { RawDocument, Position } from "../../types.js";
import { SONNET_MODEL } from "../../claude/client.js";

async function listPositions(supabase: SupabaseClient): Promise<Position[]> {
  const { data, error } = await supabase
    .from("positions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPositions failed: ${error.message}`);
  return (data ?? []) as Position[];
}

export async function draftPosition(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  doc: RawDocument,
): Promise<string> {
  if (!doc.body_text) {
    throw new Error(`draftPosition: document ${doc.source_id} has no body_text to draft from`);
  }
  const pastPositions = await listPositions(supabase);
  const styleReference = pastPositions
    .slice(0, 5)
    .map((p) => `--- ${p.title} ---\n${p.body_text}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system:
      "Olet Säleikkö, kunnanvaltuutetun avustaja. Auta valmistelemaan " +
      "kannanottoluonnos annetusta kokousasiasta. Käytä käyttäjän aiempia " +
      "kannanottoja tyylin ja arvopohjan referenssinä, mutta älä kopioi niitä " +
      "suoraan. Tuota luonnos jonka käyttäjä viimeistelee itse - älä esitä " +
      "sitä valmiina lopullisena tekstinä.",
    messages: [
      {
        role: "user",
        content:
          `Kokousasia: ${doc.title}\nToimielin: ${doc.board}\n` +
          `Sisältö:\n${doc.body_text}\n\n` +
          `Käyttäjän aiemmat kannanotot tyylireferenssiksi:\n${styleReference || "(ei aiempia kannanottoja tallennettuna)"}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new Error(`draftPosition: no text block for ${doc.source_id}`);
  }
  return textBlock.text;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/positions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/skills/politics/search.ts src/skills/politics/search.test.ts src/skills/politics/positions.ts src/skills/politics/positions.test.ts
git commit -m "feat: add archive search and position-statement drafting"
```

---

## Task 13: Telegram bot core (allowlist)

**Files:**
- Create: `src/telegram/bot.ts`
- Test: `src/telegram/bot.test.ts`

> **Note (added after Task 15's code-quality review):** Task 15's command handlers
> (`/opeta`, `/hyvaksy`, `/hylkaa`, `/hae`, `/kannanotto`, free-text fallback) call
> functions that can throw, and none of those handlers has its own try/catch. Without
> a bot-level error handler, an uncaught error inside any handler would mean the user
> gets silence — no reply, no indication anything went wrong. `createBot` below
> registers `bot.catch(...)`, grammY's global error handler, instead of wrapping every
> handler individually — this is idiomatic grammY and avoids repeating the same
> try/catch six times.

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram/bot.test.ts
import { describe, it, expect, vi } from "vitest";
import { BotError } from "grammy";
import { createAllowlistMiddleware, createBot } from "./bot.js";
import type { Config } from "../config.js";

describe("createAllowlistMiddleware", () => {
  it("calls next() when the sender matches the allowed user id", async () => {
    const middleware = createAllowlistMiddleware(123456);
    const next = vi.fn(() => Promise.resolve());
    const ctx = { from: { id: 123456 }, reply: vi.fn() } as any;

    await middleware(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("silently ignores messages from other user ids", async () => {
    const middleware = createAllowlistMiddleware(123456);
    const next = vi.fn(() => Promise.resolve());
    const ctx = { from: { id: 999 }, reply: vi.fn() } as any;

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ignores updates with no sender", async () => {
    const middleware = createAllowlistMiddleware(123456);
    const next = vi.fn(() => Promise.resolve());
    const ctx = { from: undefined, reply: vi.fn() } as any;

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("createBot error handling", () => {
  it("registers an error handler that replies with a generic message and logs the error", async () => {
    const config: Config = {
      telegramBotToken: "123456:test-token",
      telegramAllowedUserId: 123456,
      anthropicApiKey: "test",
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "test",
      dailyBriefingHour: 7,
      port: 3000,
    };
    const bot = createBot(config);

    const reply = vi.fn(() => Promise.resolve());
    const ctx = { reply } as any;
    const err = new BotError(new Error("boom"), ctx);

    await bot.errorHandler(err);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Tapahtui virhe"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/telegram/bot.test.ts`
Expected: FAIL — `Cannot find module './bot.js'`

- [ ] **Step 3: Write `src/telegram/bot.ts`**

```typescript
import { Bot, type BotError, type Context, type NextFunction } from "grammy";
import type { Config } from "../config.js";

export function createAllowlistMiddleware(allowedUserId: number) {
  return async (ctx: Context, next: NextFunction) => {
    if (ctx.from?.id !== allowedUserId) {
      console.warn(
        `Ignoring update from unauthorized Telegram user id: ${ctx.from?.id ?? "unknown"}`,
      );
      return;
    }
    await next();
  };
}

export function createBot(config: Config): Bot {
  const bot = new Bot(config.telegramBotToken);
  bot.use(createAllowlistMiddleware(config.telegramAllowedUserId));
  bot.catch((err: BotError<Context>) => {
    const message = err.error instanceof Error ? err.error.message : String(err.error);
    console.error(`Unhandled error while processing update: ${message}`);
    err.ctx
      .reply("Tapahtui virhe komennon käsittelyssä. Yritä myöhemmin uudelleen.")
      .catch(() => {
        // Avoid throwing again if even the error-notification reply itself fails.
      });
  });
  return bot;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/telegram/bot.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/telegram/bot.ts src/telegram/bot.test.ts
git commit -m "feat: add Telegram bot with allowlist middleware"
```

---

## Task 14: Gateway free-text chat handler

**Files:**
- Create: `src/gateway/chat.ts`
- Test: `src/gateway/chat.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/gateway/chat.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleFreeTextMessage } from "./chat.js";
import type { SupabaseClient } from "../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

describe("handleFreeTextMessage", () => {
  it("logs the user message, calls Claude with history, logs and returns the reply", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const limit = vi.fn(() =>
      Promise.resolve({
        data: [
          { role: "user", content: "Aiempi kysymys" },
          { role: "assistant", content: "Aiempi vastaus" },
        ],
        error: null,
      }),
    );
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ insert, select })),
    } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Vastaus käyttäjälle." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const reply = await handleFreeTextMessage(supabase, anthropic, 123456, "Uusi kysymys");

    expect(reply).toBe("Vastaus käyttäjälle.");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ telegram_user_id: 123456, role: "user", content: "Uusi kysymys" }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ telegram_user_id: 123456, role: "assistant", content: "Vastaus käyttäjälle." }),
    );
  });

  it("throws when logging the user message fails", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: { message: "insert failed" } }));
    const supabase = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    await expect(handleFreeTextMessage(supabase, anthropic, 123456, "Kysymys")).rejects.toThrow(
      "insert failed",
    );
  });

  it("throws when fetching history fails", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const limit = vi.fn(() => Promise.resolve({ data: null, error: { message: "select failed" } }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ insert, select })),
    } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    await expect(handleFreeTextMessage(supabase, anthropic, 123456, "Kysymys")).rejects.toThrow(
      "select failed",
    );
  });

  it("still returns the reply even when logging the assistant message fails", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "log failed" } });
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ insert, select })),
    } as unknown as SupabaseClient;

    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Vastaus." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    const reply = await handleFreeTextMessage(supabase, anthropic, 123456, "Kysymys");

    expect(reply).toBe("Vastaus.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gateway/chat.test.ts`
Expected: FAIL — `Cannot find module './chat.js'`

- [ ] **Step 3: Write `src/gateway/chat.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../supabase/client.js";
import { SONNET_MODEL } from "../claude/client.js";

const HISTORY_LIMIT = 20;

export async function handleFreeTextMessage(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  telegramUserId: number,
  text: string,
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

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system:
      "Olet Säleikkö, käyttäjän henkilökohtainen avustaja paikallispolitiikan " +
      "seurannassa. Vastaa ytimekkäästi suomeksi. Käytä /hae ja /kannanotto " +
      "-komentoja arkistohakuun ja kannanottojen valmisteluun kun se on relevanttia.",
    messages,
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  const reply = textBlock?.text ?? "En osannut muodostaa vastausta.";

  const { error: assistantInsertError } = await supabase
    .from("conversation_log")
    .insert({ telegram_user_id: telegramUserId, role: "assistant", content: reply });
  if (assistantInsertError) {
    // The reply was already generated (an API call already happened) — don't
    // withhold it from the user just because logging it failed. Surface the
    // failure to the console instead of throwing, unlike the two checks above.
    console.error(
      `handleFreeTextMessage: failed to log assistant reply: ${assistantInsertError.message}`,
    );
  }

  return reply;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gateway/chat.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/gateway/chat.ts src/gateway/chat.test.ts
git commit -m "feat: add free-text chat gateway with conversation logging"
```

---

## Task 15: Telegram commands

**Files:**
- Create: `src/telegram/commands.ts`
- Test: `src/telegram/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram/commands.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerCommands } from "./commands.js";
import type { Bot } from "grammy";
import type { SupabaseClient } from "../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";

function makeFakeBot() {
  const handlers: Record<string, (ctx: any) => Promise<void>> = {};
  const bot = {
    command: vi.fn((name: string, handler: any) => {
      handlers[name] = handler;
    }),
    on: vi.fn((_event: string, handler: any) => {
      handlers["__text__"] = handler;
    }),
  } as unknown as Bot;
  return { bot, handlers };
}

describe("registerCommands", () => {
  it("registers /opeta, /hyvaksy, /hylkaa, /hae, /kannanotto and text handler", async () => {
    const { bot, handlers } = makeFakeBot();
    const supabase = {} as SupabaseClient;
    const anthropic = {} as Anthropic;

    registerCommands(bot, supabase, anthropic);

    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining([
        "opeta",
        "hyvaksy",
        "hylkaa",
        "hae",
        "kannanotto",
        "__text__",
      ]),
    );
  });

  it("/opeta proposes a profile update and shows it for approval", async () => {
    const { bot, handlers } = makeFakeBot();
    const proposeResult = {
      id: "fb-1",
      raw_text: "kaavoitus kiinnostaa",
      proposed_profile_text: "Kaavoitus kiinnostaa aina.",
      applied: false,
      created_at: "2026-01-01",
    };
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: proposeResult, error: null })),
      })),
    }));
    const profileSingle = vi.fn(() =>
      Promise.resolve({ data: { profile_text: "Vanha profiili." }, error: null }),
    );
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "gatekeeper_profile") {
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: profileSingle })) })) };
        }
        if (table === "gatekeeper_feedback") {
          return { insert };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Kaavoitus kiinnostaa aina." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { match: "kaavoitus kiinnostaa", reply } as any;
    await handlers["opeta"](ctx);

    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("Kaavoitus kiinnostaa aina."),
    );
  });

  it("/kannanotto tells the user when no matching document has body_text yet", async () => {
    const { bot, handlers } = makeFakeBot();
    const or = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "1",
            title: "Kaavamuutos",
            board: "Kaupunginhallitus",
            meeting_date: "2026-09-01",
            source_url: "https://kokkola10.oncloudos.com/...",
            body_text: null,
          },
        ],
        error: null,
      }),
    );
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { match: "kaava", reply } as any;
    await handlers["kannanotto"](ctx);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("ei ole vielä haettu"));
  });

  it("/hyvaksy approves the pending profile proposal", async () => {
    const { bot, handlers } = makeFakeBot();
    const pending = {
      id: "fb-2",
      raw_text: "asuntopolitiikka",
      proposed_profile_text: "Uusi profiiliteksti.",
      applied: false,
      created_at: "2026-01-01",
    };
    const feedbackSelectLimit = vi.fn(() => Promise.resolve({ data: [pending], error: null }));
    const feedbackSelectOrder = vi.fn(() => ({ limit: feedbackSelectLimit }));
    const feedbackSelectEq = vi.fn(() => ({ order: feedbackSelectOrder }));
    const profileUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const feedbackUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "gatekeeper_feedback") {
          return {
            select: vi.fn(() => ({ eq: feedbackSelectEq })),
            update: vi.fn(() => ({ eq: feedbackUpdateEq })),
          };
        }
        if (table === "gatekeeper_profile") {
          return { update: vi.fn(() => ({ eq: profileUpdateEq })) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const anthropic = {} as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { reply } as any;
    await handlers["hyvaksy"](ctx);

    expect(profileUpdateEq).toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("päivitetty"));
  });

  it("/hylkaa rejects the pending profile proposal", async () => {
    const { bot, handlers } = makeFakeBot();
    const pending = {
      id: "fb-3",
      raw_text: "joukkoliikenne",
      proposed_profile_text: "Ehdotettu teksti.",
      applied: false,
      created_at: "2026-01-01",
    };
    const feedbackSelectLimit = vi.fn(() => Promise.resolve({ data: [pending], error: null }));
    const feedbackSelectOrder = vi.fn(() => ({ limit: feedbackSelectLimit }));
    const feedbackSelectEq = vi.fn(() => ({ order: feedbackSelectOrder }));
    const feedbackUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "gatekeeper_feedback") {
          return {
            select: vi.fn(() => ({ eq: feedbackSelectEq })),
            update: vi.fn(() => ({ eq: feedbackUpdateEq })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const anthropic = {} as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { reply } as any;
    await handlers["hylkaa"](ctx);

    expect(feedbackUpdateEq).toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("hylätty"));
  });

  it("/hae replies with formatted search results", async () => {
    const { bot, handlers } = makeFakeBot();
    const or = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "1",
            board: "Kaupunginhallitus",
            title: "Talousarvio 2027",
            meeting_date: "2026-10-01",
            source_url: "https://kokkola10.oncloudos.com/foo",
          },
        ],
        error: null,
      }),
    );
    const select = vi.fn(() => ({ or }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const anthropic = {} as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { match: "talous", reply } as any;
    await handlers["hae"](ctx);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Talousarvio 2027"));
  });

  it("routes non-command text messages through handleFreeTextMessage", async () => {
    const { bot, handlers } = makeFakeBot();
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const supabase = {
      from: vi.fn(() => ({ insert, select })),
    } as unknown as SupabaseClient;
    const create = vi.fn(() =>
      Promise.resolve({ content: [{ type: "text", text: "Vastaus." }] }),
    );
    const anthropic = { messages: { create } } as unknown as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = {
      message: { text: "Mitä mieltä olet kaavoituksesta?" },
      from: { id: 123456 },
      reply,
    } as any;
    await handlers["__text__"](ctx);

    expect(reply).toHaveBeenCalledWith("Vastaus.");
  });

  it("ignores text messages that start with a slash in the free-text handler", async () => {
    const { bot, handlers } = makeFakeBot();
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    const anthropic = { messages: { create: vi.fn() } } as unknown as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { message: { text: "/jokin" }, from: { id: 123456 }, reply } as any;
    await handlers["__text__"](ctx);

    expect(reply).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/telegram/commands.test.ts`
Expected: FAIL — `Cannot find module './commands.js'`

- [ ] **Step 3: Write `src/telegram/commands.ts`**

```typescript
import type { Bot } from "grammy";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../supabase/client.js";
import {
  proposeProfileUpdate,
  approvePendingFeedback,
  rejectPendingFeedback,
} from "../skills/politics/gatekeeper.js";
import { searchArchive } from "../skills/politics/search.js";
import { draftPosition } from "../skills/politics/positions.js";
import { handleFreeTextMessage } from "../gateway/chat.js";

export function registerCommands(
  bot: Bot,
  supabase: SupabaseClient,
  anthropic: Anthropic,
): void {
  bot.command("opeta", async (ctx) => {
    const feedbackText = ctx.match?.toString().trim();
    if (!feedbackText) {
      await ctx.reply(
        "Käytä muotoa: /opeta <vapaa teksti siitä mikä kiinnostaa tai ei kiinnosta>",
      );
      return;
    }
    const feedback = await proposeProfileUpdate(supabase, anthropic, feedbackText);
    await ctx.reply(
      `Ehdotus päivitetyksi profiiliksi:\n\n${feedback.proposed_profile_text}\n\n` +
        "Hyväksy komennolla /hyvaksy tai hylkää komennolla /hylkaa.",
    );
  });

  bot.command("hyvaksy", async (ctx) => {
    await approvePendingFeedback(supabase);
    await ctx.reply("Profiili päivitetty.");
  });

  bot.command("hylkaa", async (ctx) => {
    await rejectPendingFeedback(supabase);
    await ctx.reply("Ehdotus hylätty, profiili ennallaan.");
  });

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

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const reply = await handleFreeTextMessage(
      supabase,
      anthropic,
      ctx.from.id,
      ctx.message.text,
    );
    await ctx.reply(reply);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/telegram/commands.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/telegram/commands.ts src/telegram/commands.test.ts
git commit -m "feat: register Telegram commands and free-text fallback"
```

---

## Task 16: Scheduler

Wires the ingest pipeline (hourly), the daily briefing (configurable hour), and immediate urgent notification for newly matched items whose meeting is within 48 hours.

**Files:**
- Create: `src/scheduler/index.ts`
- Test: `src/scheduler/index.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/scheduler/index.test.ts
import { describe, it, expect, vi } from "vitest";
import cron from "node-cron";
import { scheduleJobs } from "./index.js";
import type { SupabaseClient } from "../supabase/client.js";
import type Anthropic from "@anthropic-ai/sdk";
import type { Bot } from "grammy";

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

vi.mock("../skills/politics/pipeline.js", () => ({
  runIngestPipeline: vi.fn(),
}));
vi.mock("../skills/politics/briefing.js", () => ({
  composeDailyBriefing: vi.fn(() =>
    Promise.resolve({ message: "briiffi", generatedAt: "2026-08-31T06:00:00.000Z" }),
  ),
  markBriefingSent: vi.fn(() => Promise.resolve()),
}));

describe("scheduleJobs", () => {
  it("schedules an hourly ingest job and a daily briefing job at the configured hour", () => {
    const supabase = {} as SupabaseClient;
    const anthropic = {} as Anthropic;
    const bot = { api: { sendMessage: vi.fn() } } as unknown as Bot;

    scheduleJobs({
      supabase,
      anthropic,
      bot,
      allowedUserId: 123456,
      dailyBriefingHour: 7,
    });

    const scheduleCalls = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(scheduleCalls).toHaveLength(2);
    expect(scheduleCalls[0][0]).toBe("0 * * * *");
    expect(scheduleCalls[1][0]).toBe("0 7 * * *");
  });

  it("notifies the user on Telegram when the ingest job throws", async () => {
    const { runIngestPipeline } = await import("../skills/politics/pipeline.js");
    (runIngestPipeline as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Kokkola RSS fetch failed: HTTP 500"),
    );

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
    });

    const ingestJobFn = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as () => Promise<void>;
    await ingestJobFn();

    expect(sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining("Kokkola RSS fetch failed: HTTP 500"),
    );
  });

  it("marks the briefing as sent only after the message is sent successfully", async () => {
    const { markBriefingSent } = await import("../skills/politics/briefing.js");

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
    });

    const briefingJobFn = (cron.schedule as unknown as ReturnType<typeof vi.fn>).mock
      .calls[1][1] as () => Promise<void>;
    await briefingJobFn();

    expect(sendMessage).toHaveBeenCalledWith(123456, "briiffi");
    expect(markBriefingSent).toHaveBeenCalledWith(supabase, "2026-08-31T06:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scheduler/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`

- [ ] **Step 3: Write `src/scheduler/index.ts`**

```typescript
import cron from "node-cron";
import type { Bot } from "grammy";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "../supabase/client.js";
import { runIngestPipeline } from "../skills/politics/pipeline.js";
import { composeDailyBriefing, markBriefingSent } from "../skills/politics/briefing.js";

const URGENT_HOURS = 48;

export interface SchedulerDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  bot: Bot;
  allowedUserId: number;
  dailyBriefingHour: number;
}

export function scheduleJobs(deps: SchedulerDeps): void {
  const { supabase, anthropic, bot, allowedUserId, dailyBriefingHour } = deps;

  cron.schedule("0 * * * *", async () => {
    try {
      const matched = await runIngestPipeline(supabase, anthropic);
      for (const item of matched) {
        const hoursUntilMeeting =
          (new Date(item.doc.meeting_date).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilMeeting >= 0 && hoursUntilMeeting <= URGENT_HOURS) {
          await bot.api.sendMessage(
            allowedUserId,
            `⚠️ Kiireellinen: ${item.doc.board} — ${item.doc.title} ` +
              `(kokous ${item.doc.meeting_date})\n${item.summary.summary}\n${item.doc.source_url}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await bot.api.sendMessage(
        allowedUserId,
        `⚠️ Paikallispolitiikan tiedonhaku epäonnistui: ${message}`,
      );
    }
  });

  cron.schedule(`0 ${dailyBriefingHour} * * *`, async () => {
    try {
      const { message, generatedAt } = await composeDailyBriefing(supabase);
      await bot.api.sendMessage(allowedUserId, message);
      await markBriefingSent(supabase, generatedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await bot.api.sendMessage(
        allowedUserId,
        `⚠️ Päivittäisen briiffin koostaminen epäonnistui: ${message}`,
      );
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scheduler/index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/scheduler/index.ts src/scheduler/index.test.ts
git commit -m "feat: schedule ingest, urgent alerts and daily briefing"
```

---

## Task 17: Main entrypoint and health check endpoint

An external uptime monitor (Task 18) needs an HTTP endpoint to poll — this is the only way to detect a fully-down VPS or network partition, since in that scenario Säleikkö cannot send itself a Telegram warning (systemd only detects the *process* crashing, not the whole machine going dark).

**Files:**
- Create: `src/health.ts`
- Test: `src/health.test.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write the failing test for the health server**

```typescript
// src/health.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createHealthServer } from "./health.js";
import type { Server } from "node:http";

describe("createHealthServer", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it("responds 200 OK on GET /health", async () => {
    server = createHealthServer(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected server to bind a port");
    }

    const res = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("responds 404 for any other path", async () => {
    server = createHealthServer(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected server to bind a port");
    }

    const res = await fetch(`http://127.0.0.1:${address.port}/other`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/health.test.ts`
Expected: FAIL — `Cannot find module './health.js'`

- [ ] **Step 3: Write `src/health.ts`**

```typescript
import { createServer, type Server } from "node:http";

export function createHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  server.listen(port);
  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/health.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/health.ts src/health.test.ts
git commit -m "feat: add health check HTTP endpoint for external uptime monitoring"
```

- [ ] **Step 6: Write `src/index.ts`**

```typescript
import { loadConfig } from "./config.js";
import { createSupabaseClient } from "./supabase/client.js";
import { createAnthropicClient } from "./claude/client.js";
import { createBot } from "./telegram/bot.js";
import { registerCommands } from "./telegram/commands.js";
import { scheduleJobs } from "./scheduler/index.js";
import { createHealthServer } from "./health.js";

async function main() {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);
  const anthropic = createAnthropicClient(config);
  const bot = createBot(config);

  registerCommands(bot, supabase, anthropic);

  scheduleJobs({
    supabase,
    anthropic,
    bot,
    allowedUserId: config.telegramAllowedUserId,
    dailyBriefingHour: config.dailyBriefingHour,
  });

  createHealthServer(config.port);
  console.log(`Health endpoint listening on :${config.port}/health`);

  await bot.start({
    onStart: () => console.log("Säleikkö started (long polling)."),
  });
}

main().catch((error) => {
  console.error("Säleikkö failed to start:", error);
  process.exit(1);
});
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass (Tasks 1, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 — 41 tests total).

- [ ] **Step 9: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire main entrypoint with health server"
```

---

## Task 18: Deployment to Hetzner VPS

**Files:**
- Create: `deploy/saleikko.service`
- Create: `deploy/README.md`

- [ ] **Step 1: Write the systemd unit file**

```ini
# deploy/saleikko.service
[Unit]
Description=Saleikko personal assistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=saleikko
WorkingDirectory=/opt/saleikko
EnvironmentFile=/opt/saleikko/.env
ExecStart=/usr/bin/node /opt/saleikko/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

- [ ] **Step 2: Write deployment instructions**

```markdown
<!-- deploy/README.md -->
# Säleikön käyttöönotto Hetzner-VPS:llä

1. Luo VPS (esim. Hetzner CX22, Ubuntu 24.04). Kirjaudu SSH:lla.
2. Asenna Node.js 20 LTS: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`
3. Luo palvelukäyttäjä: `sudo useradd -r -m -d /opt/saleikko saleikko`
4. Kloonaa repo palvelimelle: `sudo -u saleikko git clone <repo-url> /opt/saleikko`
5. `cd /opt/saleikko && sudo -u saleikko npm install && sudo -u saleikko npm run build`
6. Kopioi `.env.example` -> `.env` ja täytä oikeat arvot (Telegram-token, Anthropic-avain, Supabase-tunnukset). `sudo chown saleikko:saleikko .env && sudo chmod 600 .env`
7. Kirjoita portinvartijaprofiilin ensimmäiset ohjeet ensimmäisellä käynnistyksellä Telegramissa `/opeta`-komennolla, ja vahvista ehdotus `/hyvaksy`-komennolla.
8. Kopioi systemd-yksikkö: `sudo cp deploy/saleikko.service /etc/systemd/system/saleikko.service`
9. `sudo systemctl daemon-reload && sudo systemctl enable --now saleikko`
10. Varmista tila: `sudo systemctl status saleikko` ja `sudo journalctl -u saleikko -f`
11. `linger`-tuki uudelleenkäynnistyksen yli: `sudo loginctl enable-linger saleikko` (varmistaa palvelun käynnistymisen jo ennen käyttäjän kirjautumista rebootin jälkeen — relevantti jos User-tason systemd-yksikköä käytettäisiin; tässä System-tason yksikkö kattaa saman jo `WantedBy=default.target` + `enable`).

## Kulukatto (tee ennen tuotantoon vientiä)

12. Kirjaudu [console.anthropic.com](https://console.anthropic.com) → Settings → Limits, ja aseta kuukausittainen käyttökatto (esim. 20-30 € kattamaan Vaihe 1:n arvioitu 5-10 €/kk reilulla marginaalilla). Tämä on riippumaton koodista — pysäyttää kulun API-tasolla vaikka ohjelmassa olisi bugi joka kutsuisi Claudea odottamattoman usein.

## Ulkoinen terveystarkastus

13. Avaa palvelimen palomuurista portti (oletus 3000, sama kuin `.env`:n `PORT`) vain terveystarkastuspalvelun tarvitsemille lähdeosoitteille, tai aseta se localhostiin ja käytä käänteisproxyä jos haluat rajoittaa pääsyä tarkemmin — Vaihe 1:n MVP:ssä riittää avata portti suoraan, koska `/health` ei paljasta mitään arkaluontoista.
14. Rekisteröi ilmainen ulkoinen uptime-tarkistus (esim. [UptimeRobot](https://uptimerobot.com) tai [Healthchecks.io](https://healthchecks.io)) osoittamaan `http://<vps-ip>:3000/health` muutaman minuutin välein, ja liitä siihen sähköposti-/push-hälytys jos tarkistus epäonnistuu useita kertoja peräkkäin.
```

- [ ] **Step 3: Commit**

```bash
git add deploy/saleikko.service deploy/README.md
git commit -m "docs: add Hetzner deployment instructions"
```

---

## Task 19: Manual end-to-end verification

Not automated — run once against the real Kokkola system and real Telegram bot before relying on the schedule.

- [ ] **Step 1: Set up a real Telegram bot**

Message `@BotFather` on Telegram, run `/newbot`, follow prompts, copy the token into `.env` as `TELEGRAM_BOT_TOKEN`. Get your own numeric Telegram user id (message `@userinfobot`) and put it in `TELEGRAM_ALLOWED_USER_ID`.

- [ ] **Step 2: Apply the Supabase schema**

Follow Task 2, Step 2 against your real Supabase project.

- [ ] **Step 3: Set the gatekeeper profile's first real instructions**

Run locally: `npm run dev`, then in Telegram send `/opeta asuntopolitiikka ja kaavoitus kiinnostavat aina` (or feedback matching a currently open Kokkola agenda item, checkable at `https://www.kokkola.fi/hallinto-ja-paatoksenteko/esityslistat-poytakirjat-ja-viranhaltijapaatokset/`), then confirm the proposal with `/hyvaksy`.

- [ ] **Step 4: Trigger one manual ingest run**

Since the hourly cron won't fire immediately, temporarily call `runIngestPipeline` directly, e.g. via a scratch script `node --loader tsx src/scripts/manual-ingest.ts` that imports and calls it once. (Create this throwaway script only for this verification step; it is not part of the committed plan.)

Expected: at least one row appears in `saleikko.raw_documents` in Supabase, and if it matches your topic, a row in `saleikko.document_summaries` with `matched = true` and a non-null `summary`.

- [ ] **Step 5: Verify the daily briefing manually**

Send `/hae asunto` in Telegram (or your chosen topic's keyword) and confirm results come back with real Kokkola links that open correctly.

- [ ] **Step 6: Verify allowlist rejection**

Ask a second Telegram account (or a friend) to message the bot. Confirm no reply is sent and nothing is logged as an error (silent ignore, per spec).

- [ ] **Step 7: Deploy per Task 18 and confirm the systemd service survives a reboot**

`sudo reboot`, then after reconnecting: `sudo systemctl status saleikko` shows `active (running)`.

- [ ] **Step 8: Confirm the Anthropic Console spend limit is active**

Go to console.anthropic.com → Settings → Limits and verify the monthly cap set in Task 18 is showing as active, not just saved as a draft value.

- [ ] **Step 9: Confirm the external health check is live**

`curl http://<vps-ip>:3000/health` from your own machine returns `ok`. Confirm the uptime monitor (Task 18, step 14) shows the check as "up". Then stop the service (`sudo systemctl stop saleikko`) and confirm the monitor flips to "down" and sends its alert within its configured interval — this proves the alert path actually works, not just that it's configured. Restart with `sudo systemctl start saleikko` afterwards.
