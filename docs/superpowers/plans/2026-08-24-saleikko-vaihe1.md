# Säleikkö Vaihe 1 (ydin + paikallispolitiikka) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Säleikkö Vaihe 1 — a Telegram-based personal AI assistant (repo: new `saleikko` project) that automatically monitors Kokkola's city council meeting documents, filters them against the user's interest topics, summarizes matches, sends a daily briefing plus urgent alerts, and helps draft position statements.

**Architecture:** A single long-running Node.js/TypeScript process runs on a Hetzner VPS (systemd service) and owns a Telegram bot via long-polling (chosen over webhooks to avoid needing a TLS-terminating reverse proxy for a single-user bot — same "always-on gateway" role, simpler ops), an in-process cron scheduler, and calls to the Anthropic API. All persistent data lives in Supabase Postgres. The politics skill polls Kokkola's public "Dynasty" meeting-document system (`kokkola10.oncloudos.com`) via its RSS feed and per-item HTML pages — verified against the live system during design (see Task 4/5 fixtures).

**Tech Stack:** Node.js 20+, TypeScript, grammY (Telegram), `@anthropic-ai/sdk` (Claude Sonnet 5 for reasoning, Claude Haiku 4.5 for classification), `@supabase/supabase-js`, `cheerio` (HTML parsing), `node-cron`, `vitest` (tests).

**Spec:** `docs/superpowers/specs/2026-08-24-saleikko-design.md`

---

## Before you start

All work happens in a **new, separate repository** at `/Users/patrikfriis/Projects/saleikko` (not inside `treeniapp`). Task 0 creates it. Every file path below is relative to that repo root unless stated otherwise.

## Task 0: Repo scaffold

**Files:**
- Create: `/Users/patrikfriis/Projects/saleikko/package.json`
- Create: `/Users/patrikfriis/Projects/saleikko/tsconfig.json`
- Create: `/Users/patrikfriis/Projects/saleikko/.gitignore`
- Create: `/Users/patrikfriis/Projects/saleikko/.env.example`
- Create: `/Users/patrikfriis/Projects/saleikko/vitest.config.ts`

- [ ] **Step 1: Create the repo directory and initialize git**

```bash
mkdir -p /Users/patrikfriis/Projects/saleikko
cd /Users/patrikfriis/Projects/saleikko
git init
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
    "zod": "^3.23.8"
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

export function loadConfig(): Config {
  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    telegramAllowedUserId: Number(requireEnv("TELEGRAM_ALLOWED_USER_ID")),
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    dailyBriefingHour: Number(process.env.DAILY_BRIEFING_HOUR ?? "7"),
    port: Number(process.env.PORT ?? "3000"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (3 tests)

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
  body_text text not null,
  source_url text not null,
  pdf_url text,
  fetched_at timestamptz not null default now()
);

create table saleikko.topics_of_interest (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  created_at timestamptz not null default now()
);

create table saleikko.document_summaries (
  id uuid primary key default gen_random_uuid(),
  raw_document_id uuid not null references saleikko.raw_documents(id),
  matched boolean not null,
  matched_topic text,
  confidence text not null check (confidence in ('match', 'no_match', 'uncertain')),
  summary text,
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

- [ ] **Step 2: Apply the schema**

Open the Supabase project dashboard → SQL Editor → paste the contents of `supabase/schema.sql` → Run. Verify all 7 tables appear under the `saleikko` schema in the Table Editor.

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
export interface RawDocument {
  id: string;
  source_id: string;
  meeting_id: string;
  board: string;
  meeting_date: string;
  title: string;
  body_text: string;
  source_url: string;
  pdf_url: string | null;
  fetched_at: string;
}

export interface TopicOfInterest {
  id: string;
  keyword: string;
  created_at: string;
}

export type ClassificationConfidence = "match" | "no_match" | "uncertain";

export interface DocumentSummary {
  id: string;
  raw_document_id: string;
  matched: boolean;
  matched_topic: string | null;
  confidence: ClassificationConfidence;
  summary: string | null;
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
      "https://kokkola10.oncloudos.com/cgi/kokous/20261273-7.PDF",
    );
  });

  it("returns null pdfUrl when no PDF link is present", () => {
    const html = `<html><body><div class='data-part-block-htm'><p>Just text</p></div></body></html>`;
    const result = parseMeetingItemDetail(
      html,
      "https://kokkola10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=1-1",
    );
    expect(result.pdfUrl).toBeNull();
    expect(result.bodyText).toBe("Just text");
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
Expected: PASS (2 tests)

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

## Task 7: Topics of interest

**Files:**
- Create: `src/skills/politics/topics.ts`
- Test: `src/skills/politics/topics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/topics.test.ts
import { describe, it, expect, vi } from "vitest";
import { addTopic, removeTopic, listTopics } from "./topics.js";
import type { SupabaseClient } from "../../supabase/client.js";

function makeFakeSupabase(overrides: Partial<Record<string, any>> = {}) {
  return {
    from: vi.fn(() => ({
      insert: overrides.insert ?? vi.fn(() => ({ error: null })),
      delete: overrides.delete ?? vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
      select: overrides.select ?? vi.fn(() => ({
        order: vi.fn(() =>
          Promise.resolve({
            data: [{ id: "1", keyword: "kaavoitus", created_at: "2026-01-01" }],
            error: null,
          }),
        ),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe("topics of interest", () => {
  it("addTopic inserts a keyword", async () => {
    const insert = vi.fn(() => ({ error: null }));
    const supabase = makeFakeSupabase({ insert });

    await addTopic(supabase, "kaavoitus");

    expect(insert).toHaveBeenCalledWith({ keyword: "kaavoitus" });
  });

  it("removeTopic deletes by keyword", async () => {
    const eq = vi.fn(() => ({ error: null }));
    const del = vi.fn(() => ({ eq }));
    const supabase = makeFakeSupabase({ delete: del });

    await removeTopic(supabase, "kaavoitus");

    expect(eq).toHaveBeenCalledWith("keyword", "kaavoitus");
  });

  it("listTopics returns keywords", async () => {
    const supabase = makeFakeSupabase();

    const topics = await listTopics(supabase);

    expect(topics).toEqual([
      { id: "1", keyword: "kaavoitus", created_at: "2026-01-01" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/topics.test.ts`
Expected: FAIL — `Cannot find module './topics.js'`

- [ ] **Step 3: Write `src/skills/politics/topics.ts`**

```typescript
import type { SupabaseClient } from "../../supabase/client.js";
import type { TopicOfInterest } from "../../types.js";

export async function addTopic(
  supabase: SupabaseClient,
  keyword: string,
): Promise<void> {
  const { error } = await supabase
    .from("topics_of_interest")
    .insert({ keyword });
  if (error) throw new Error(`addTopic failed: ${error.message}`);
}

export async function removeTopic(
  supabase: SupabaseClient,
  keyword: string,
): Promise<void> {
  const { error } = await supabase
    .from("topics_of_interest")
    .delete()
    .eq("keyword", keyword);
  if (error) throw new Error(`removeTopic failed: ${error.message}`);
}

export async function listTopics(
  supabase: SupabaseClient,
): Promise<TopicOfInterest[]> {
  const { data, error } = await supabase
    .from("topics_of_interest")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listTopics failed: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/topics.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/topics.ts src/skills/politics/topics.test.ts
git commit -m "feat: add topics-of-interest CRUD"
```

---

## Task 8: Classification (Haiku)

Uses `client.messages.parse` with a Zod output schema (structured outputs), per the Claude API TypeScript reference. Errs toward `"uncertain"` rather than `"no_match"` when unsure — a missed relevant item is worse than one extra summary (per spec's Testing section).

**Files:**
- Create: `src/skills/politics/classify.ts`
- Test: `src/skills/politics/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/politics/classify.test.ts
import { describe, it, expect, vi } from "vitest";
import { classifyDocument } from "./classify.js";
import type Anthropic from "@anthropic-ai/sdk";

function makeFakeAnthropic(parsedOutput: unknown) {
  return {
    messages: {
      parse: vi.fn(() => Promise.resolve({ parsed_output: parsedOutput })),
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
  body_text: "Kunta voi vaikuttaa asuntomarkkinoihin...",
  source_url: "https://kokkola10.oncloudos.com/...",
  pdf_url: null,
  fetched_at: "2026-08-24T10:00:00Z",
};

const TOPICS = [
  { id: "t1", keyword: "asuntopolitiikka", created_at: "2026-01-01" },
];

describe("classifyDocument", () => {
  it("returns a match result from the parsed output", async () => {
    const anthropic = makeFakeAnthropic({
      confidence: "match",
      matchedTopic: "asuntopolitiikka",
      reasoning: "Item is directly about housing production policy.",
    });

    const result = await classifyDocument(anthropic, DOC, TOPICS);

    expect(result.confidence).toBe("match");
    expect(result.matchedTopic).toBe("asuntopolitiikka");
  });

  it("returns no_match with null matchedTopic", async () => {
    const anthropic = makeFakeAnthropic({
      confidence: "no_match",
      matchedTopic: null,
      reasoning: "Unrelated procedural item.",
    });

    const result = await classifyDocument(anthropic, DOC, TOPICS);

    expect(result.confidence).toBe("no_match");
    expect(result.matchedTopic).toBeNull();
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
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { HAIKU_MODEL } from "../../claude/client.js";
import type { RawDocument, TopicOfInterest, ClassificationConfidence } from "../../types.js";

const ClassificationSchema = z.object({
  confidence: z.enum(["match", "no_match", "uncertain"]),
  matchedTopic: z.string().nullable(),
  reasoning: z.string(),
});

export interface ClassificationResult {
  confidence: ClassificationConfidence;
  matchedTopic: string | null;
  reasoning: string;
}

export async function classifyDocument(
  anthropic: Anthropic,
  doc: RawDocument,
  topics: TopicOfInterest[],
): Promise<ClassificationResult> {
  const topicList = topics.map((t) => `- ${t.keyword}`).join("\n");

  const response = await anthropic.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 512,
    system:
      "Olet Säleikkö, kunnanvaltuutetun avustaja. Tehtäväsi on arvioida osuuko " +
      "yksi kunnan kokousasia käyttäjän seuraamiin aihepiireihin. Jos olet " +
      "epävarma, valitse mieluummin 'uncertain' kuin 'no_match' - relevantin " +
      "asian huomaamatta jättäminen on pahempi virhe kuin turha ilmoitus.",
    messages: [
      {
        role: "user",
        content:
          `Seurattavat aihepiirit:\n${topicList}\n\n` +
          `Kokousasian otsikko: ${doc.title}\n` +
          `Toimielin: ${doc.board}\n` +
          `Sisältö:\n${doc.body_text}\n\n` +
          "Osuuko tämä asia johonkin seurattuun aihepiiriin?",
      },
    ],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`classifyDocument: failed to parse output for ${doc.source_id}`);
  }

  return response.parsed_output;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/classify.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/classify.ts src/skills/politics/classify.test.ts
git commit -m "feat: add Haiku-based interest classification"
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
  body_text: "Kunta voi vaikuttaa asuntomarkkinoihin...",
  source_url: "https://kokkola10.oncloudos.com/...",
  pdf_url: null,
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

Combines Tasks 4/5/7/8/9: fetch new RSS items → skip already-ingested `source_id`s → fetch detail → store `raw_documents` → classify against topics → store `document_summaries` → summarize matches → create a `reminders` row when the meeting is within 14 days → return the list of newly matched items (used by Task 12 for immediate urgent notification).

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
      pdfUrl: "https://kokkola10.oncloudos.com/cgi/kokous/20261273-7.PDF",
    }),
  ),
}));

vi.mock("./classify.js", () => ({
  classifyDocument: vi.fn(() =>
    Promise.resolve({
      confidence: "match",
      matchedTopic: "asuntopolitiikka",
      reasoning: "About housing policy.",
    }),
  ),
}));

vi.mock("./summarize.js", () => ({
  summarizeDocument: vi.fn(() => Promise.resolve("Lyhyt tiivistelmä.")),
}));

function makeFakeSupabase() {
  const existingSourceIds = new Set<string>();
  const insertedDocs: any[] = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "raw_documents") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((_col: string, ids: string[]) =>
              Promise.resolve({
                data: ids
                  .filter((id) => existingSourceIds.has(id))
                  .map((id) => ({ source_id: id })),
                error: null,
              }),
            ),
          })),
          insert: vi.fn((row: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(() => {
                const inserted = { id: "doc-1", ...row };
                insertedDocs.push(inserted);
                return Promise.resolve({ data: inserted, error: null });
              }),
            })),
          })),
        };
      }
      if (table === "document_summaries") {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) };
      }
      if (table === "topics_of_interest") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: [{ id: "t1", keyword: "asuntopolitiikka", created_at: "2026-01-01" }],
                error: null,
              }),
            ),
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

  it("ingests, classifies, summarizes a new matched item and returns it", async () => {
    const supabase = makeFakeSupabase();
    const anthropic = {} as Anthropic;

    const matched = await runIngestPipeline(supabase, anthropic);

    expect(matched).toHaveLength(1);
    expect(matched[0].summary.summary).toBe("Lyhyt tiivistelmä.");
    expect(matched[0].doc.title).toBe("Asuntotuotannon edistäminen kunnassa");
  });

  it("is idempotent: skips fetch/classify/summarize entirely for an already-known source_id", async () => {
    const { fetchMeetingItemDetail } = await import("./kokkolaDetail.js");
    const { classifyDocument } = await import("./classify.js");
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
        if (table === "topics_of_interest") {
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          };
        }
        throw new Error(`Unexpected table in idempotency test: ${table}`);
      }),
    } as unknown as SupabaseClient;
    const anthropic = {} as Anthropic;

    const matched = await runIngestPipeline(supabase, anthropic);

    expect(matched).toEqual([]);
    expect(fetchMeetingItemDetail).not.toHaveBeenCalled();
    expect(classifyDocument).not.toHaveBeenCalled();
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
import { classifyDocument } from "./classify.js";
import { summarizeDocument } from "./summarize.js";
import { listTopics } from "./topics.js";

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

  const topics = await listTopics(supabase);
  const matched: MatchedItem[] = [];

  for (const item of newItems) {
    const detail = await fetchMeetingItemDetail(item.sourceId);

    const { data: inserted, error: insertError } = await supabase
      .from("raw_documents")
      .insert({
        source_id: item.sourceId,
        meeting_id: item.meetingId,
        board: item.board,
        meeting_date: item.meetingDate,
        title: item.title,
        body_text: detail.bodyText,
        source_url: item.url,
        pdf_url: detail.pdfUrl,
      })
      .select()
      .single();
    if (insertError || !inserted) {
      throw new Error(
        `runIngestPipeline: failed to insert ${item.sourceId}: ${insertError?.message}`,
      );
    }
    const doc = inserted as RawDocument;

    const classification = await classifyDocument(anthropic, doc, topics);
    const isRelevant =
      classification.confidence === "match" ||
      classification.confidence === "uncertain";

    let summaryText: string | null = null;
    if (isRelevant) {
      summaryText = await summarizeDocument(anthropic, doc);
    }

    const { error: summaryError } = await supabase
      .from("document_summaries")
      .insert({
        raw_document_id: doc.id,
        matched: isRelevant,
        matched_topic: classification.matchedTopic,
        confidence: classification.confidence,
        summary: summaryText,
      });
    if (summaryError) {
      throw new Error(
        `runIngestPipeline: failed to insert summary for ${doc.source_id}: ${summaryError.message}`,
      );
    }

    if (isRelevant) {
      const daysUntilMeeting =
        (new Date(doc.meeting_date).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      if (daysUntilMeeting >= 0 && daysUntilMeeting <= URGENT_WINDOW_DAYS) {
        await supabase.from("reminders").insert({
          raw_document_id: doc.id,
          due_at: doc.meeting_date,
          description: `${doc.board}: ${doc.title}`,
        });
      }

      matched.push({
        doc,
        summary: {
          id: "",
          raw_document_id: doc.id,
          matched: true,
          matched_topic: classification.matchedTopic,
          confidence: classification.confidence,
          summary: summaryText,
          created_at: new Date().toISOString(),
        },
      });
    }
  }

  return matched;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/pipeline.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/skills/politics/pipeline.ts src/skills/politics/pipeline.test.ts
git commit -m "feat: wire ingest pipeline (fetch, classify, summarize, remind)"
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
import { composeDailyBriefing } from "./briefing.js";
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
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      if (table === "document_summaries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
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
          })),
        };
      }
      if (table === "reminders") {
        return {
          select: vi.fn(() => ({
            gt: vi.fn(() =>
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

    const message = await composeDailyBriefing(supabase);

    expect(message).toContain("Asuntotuotannon edistäminen kunnassa");
    expect(message).toContain("Kaupunki ei edistä markkinaehtoista asuntotuotantoa.");
    expect(message).toContain("Tulevat kokoukset");
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
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          };
        }
        if (table === "document_summaries") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ gt: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
            })),
          };
        }
        if (table === "reminders") {
          return { select: vi.fn(() => ({ gt: vi.fn(() => Promise.resolve({ data: [], error: null })) })) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    const message = await composeDailyBriefing(supabase);

    expect(message).toContain("Ei uusia");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/politics/briefing.test.ts`
Expected: FAIL — `Cannot find module './briefing.js'`

- [ ] **Step 3: Write `src/skills/politics/briefing.ts`**

```typescript
import type { SupabaseClient } from "../../supabase/client.js";

export async function composeDailyBriefing(
  supabase: SupabaseClient,
): Promise<string> {
  const { data: stateRow } = await supabase
    .from("app_state")
    .select("*")
    .eq("key", "last_briefing_at")
    .single();
  const since = stateRow?.value ?? new Date(0).toISOString();
  const now = new Date().toISOString();

  const { data: summaries, error: summariesError } = await supabase
    .from("document_summaries")
    .select("summary, raw_documents(title, board, meeting_date, source_url)")
    .eq("matched", true)
    .gt("created_at", since);
  if (summariesError) {
    throw new Error(`composeDailyBriefing: ${summariesError.message}`);
  }

  const { data: reminders, error: remindersError } = await supabase
    .from("reminders")
    .select("due_at, description")
    .gt("due_at", now);
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

  await supabase
    .from("app_state")
    .update({ value: now })
    .eq("key", "last_briefing_at");

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/politics/briefing.test.ts`
Expected: PASS (2 tests)

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
Expected: PASS (1 test)

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
  body_text: "Kunta voi vaikuttaa asuntomarkkinoihin...",
  source_url: "https://kokkola10.oncloudos.com/...",
  pdf_url: null,
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

    const create = vi.fn(() =>
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
Expected: PASS (1 test)

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

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram/bot.test.ts
import { describe, it, expect, vi } from "vitest";
import { createAllowlistMiddleware } from "./bot.js";

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
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/telegram/bot.test.ts`
Expected: FAIL — `Cannot find module './bot.js'`

- [ ] **Step 3: Write `src/telegram/bot.ts`**

```typescript
import { Bot, type Context, type NextFunction } from "grammy";
import type { Config } from "../config.js";

export function createAllowlistMiddleware(allowedUserId: number) {
  return async (ctx: Context, next: NextFunction) => {
    if (ctx.from?.id !== allowedUserId) {
      return;
    }
    await next();
  };
}

export function createBot(config: Config): Bot {
  const bot = new Bot(config.telegramBotToken);
  bot.use(createAllowlistMiddleware(config.telegramAllowedUserId));
  return bot;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/telegram/bot.test.ts`
Expected: PASS (3 tests)

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
    const order = vi.fn(() =>
      Promise.resolve({
        data: [
          { role: "user", content: "Aiempi kysymys" },
          { role: "assistant", content: "Aiempi vastaus" },
        ],
        error: null,
      }),
    );
    const limit = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ order: limit }));
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
  await supabase
    .from("conversation_log")
    .insert({ telegram_user_id: telegramUserId, role: "user", content: text });

  const { data: history } = await supabase
    .from("conversation_log")
    .select("role, content")
    .eq("telegram_user_id", telegramUserId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

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

  await supabase
    .from("conversation_log")
    .insert({ telegram_user_id: telegramUserId, role: "assistant", content: reply });

  return reply;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gateway/chat.test.ts`
Expected: PASS (1 test)

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
  it("registers /seuraa, /lopeta_seuranta, /hae, /kannanotto and text handler", async () => {
    const { bot, handlers } = makeFakeBot();
    const supabase = {} as SupabaseClient;
    const anthropic = {} as Anthropic;

    registerCommands(bot, supabase, anthropic);

    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining(["seuraa", "lopeta_seuranta", "hae", "kannanotto", "__text__"]),
    );
  });

  it("/seuraa adds a topic via Supabase and replies with confirmation", async () => {
    const { bot, handlers } = makeFakeBot();
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
    const anthropic = {} as Anthropic;

    registerCommands(bot, supabase, anthropic);

    const reply = vi.fn();
    const ctx = { match: "kaavoitus", reply } as any;
    await handlers["seuraa"](ctx);

    expect(insert).toHaveBeenCalledWith({ keyword: "kaavoitus" });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("kaavoitus"));
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
import { addTopic, removeTopic } from "../skills/politics/topics.js";
import { searchArchive } from "../skills/politics/search.js";
import { draftPosition } from "../skills/politics/positions.js";
import { handleFreeTextMessage } from "../gateway/chat.js";

export function registerCommands(
  bot: Bot,
  supabase: SupabaseClient,
  anthropic: Anthropic,
): void {
  bot.command("seuraa", async (ctx) => {
    const keyword = ctx.match?.toString().trim();
    if (!keyword) {
      await ctx.reply("Käytä muotoa: /seuraa <aihe>");
      return;
    }
    await addTopic(supabase, keyword);
    await ctx.reply(`Lisätty seurantaan: ${keyword}`);
  });

  bot.command("lopeta_seuranta", async (ctx) => {
    const keyword = ctx.match?.toString().trim();
    if (!keyword) {
      await ctx.reply("Käytä muotoa: /lopeta_seuranta <aihe>");
      return;
    }
    await removeTopic(supabase, keyword);
    await ctx.reply(`Poistettu seurannasta: ${keyword}`);
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
    const draft = await draftPosition(supabase, anthropic, results[0]);
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
Expected: PASS (2 tests)

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
  composeDailyBriefing: vi.fn(() => Promise.resolve("briiffi")),
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
import { composeDailyBriefing } from "../skills/politics/briefing.js";

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
      const message = await composeDailyBriefing(supabase);
      await bot.api.sendMessage(allowedUserId, message);
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
Expected: PASS (1 test)

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
Expected: all tests pass (Tasks 1, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 — 27 tests total).

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
7. Aseta paikallispolitiikan seurantatopikit ensimmäisellä käynnistyksellä Telegramissa `/seuraa`-komennoilla.
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

- [ ] **Step 3: Add one real topic of interest**

Run locally: `npm run dev`, then in Telegram send `/seuraa asuntopolitiikka` (or another topic matching a currently open Kokkola agenda item, checkable at `https://www.kokkola.fi/hallinto-ja-paatoksenteko/esityslistat-poytakirjat-ja-viranhaltijapaatokset/`).

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
