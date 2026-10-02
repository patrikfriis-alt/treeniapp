# Treeniapp — project conventions

Single-file vanilla HTML/CSS/JS PWA (`index.html`), backed by Supabase, no build step, no automated
test framework — all verification is manual (in-browser, curl against the REST API).

## Supabase CLI hangs in this sandbox — use the dashboard instead

Any Supabase CLI command that opens a direct Postgres connection hangs indefinitely at
"Initialising login role..." and never returns: `supabase db push`, `supabase db query`,
`supabase migration list --linked`, `supabase migration repair`. Root cause: this sandbox blocks
non-HTTP(S) TCP egress (Postgres needs port 5432/6543). Don't retry these or wait longer — they
will not complete. Reliable CLI commands (HTTPS-based): `supabase functions deploy`, `supabase link`.

**To apply a migration:**
1. Give the user the migration's raw SQL to paste into the dashboard SQL editor:
   `https://supabase.com/dashboard/project/yznuzwbbyasgqeqllxic/sql/new`
2. Have them confirm it ran.
3. **Verify it actually landed** with a curl REST check before trusting "done" — a user confirming
   isn't proof (confirmed once: user said done when the table was still 404).
   ```bash
   curl -s "https://yznuzwbbyasgqeqllxic.supabase.co/rest/v1/<table>?select=*&limit=1" \
     -H "apikey: $(grep -o "SB_KEY = '[^']*'" index.html | sed "s/SB_KEY = '//;s/'$//")" \
     -H "Authorization: Bearer $(grep -o "SB_KEY = '[^']*'" index.html | sed "s/SB_KEY = '//;s/'$//")"
   ```
4. Since `migration repair` also hangs, sync the CLI's local ledger with a manual insert instead
   (same dashboard SQL editor):
   ```sql
   insert into supabase_migrations.schema_migrations (version)
   values ('<YYYYMMDD>')  -- the migration filename's date prefix, e.g. 20260910_fasting_sessions.sql -> 20260910
   on conflict (version) do nothing;
   ```
   Without this, the next `supabase db push` re-attempts that migration's DDL and fails on
   "already exists."

## Checking "what's next" / the backlog

Recent work and open items live in this project's auto-memory (`project_*.md` files), not in a
backlog doc in the repo. Treat those memories as point-in-time snapshots, not live state — verify
any shipped/unshipped claim against `git log --oneline` before repeating it as fact; a memory can be
weeks stale while the repo has moved on.

When the user picks a backlog item to work on, they want it worked **one item at a time** with an
explicit approval gate before implementation starts (per `superpowers:brainstorming`'s bounded/
architectural path) — not the whole list implemented in one pass.
