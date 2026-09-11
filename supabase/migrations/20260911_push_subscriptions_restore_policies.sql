-- push_subscriptions had drifted from what its migration history describes: its UPDATE
-- policy was missing in the live database even though 20260710_push_ilmoitukset.sql
-- created it and no later migration ever dropped it (most likely an incomplete manual
-- dashboard-SQL application of that original migration), and its SELECT policy was
-- dropped by 20260811_push_subscriptions_scope_down.sql on the reasoning that the client
-- never reads rows directly — which missed that Postgres RLS also gates the RETURNING
-- projection of an INSERT/UPDATE against the SELECT policy, not just standalone SELECTs.
-- The app's upsert requests the written row back (Prefer: return=representation), so
-- every (re-)subscribe attempt failed with "new row violates row-level security policy".
--
-- Root-caused by reproducing via curl: the identical upsert succeeded with
-- Prefer: return=minimal and failed with return=representation, isolating the
-- RETURNING/SELECT-policy interaction precisely. This also explains why an earlier
-- read attempting to list the table came back empty even though real subscriptions
-- existed underneath: a missing SELECT policy makes matching rows invisible rather
-- than erroring, not "the table is empty".
--
-- DELETE stays intentionally without a client policy — that half of the 2026-08-11
-- migration's reasoning was correct; only check-and-notify's service role (which
-- bypasses RLS) needs to prune expired subscriptions.

drop policy if exists push_subscriptions_update on push_subscriptions;
create policy push_subscriptions_update on push_subscriptions
  for update to anon, authenticated using (true) with check (true);

create policy push_subscriptions_select on push_subscriptions
  for select to anon, authenticated using (true);
