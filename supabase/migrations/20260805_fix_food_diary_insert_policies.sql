-- Ruoan tallennus antoi RLS-virheen ("new row violates row-level security
-- policy") food_cache/custom_foods/food_log_entries-tauluille, vaikka
-- 20260706_food_diary.sql:n pitäisi sallia anon/authenticated-inserttaus.
-- Live-tietokannan policyt olivat ajautuneet pois linjasta migraatioista
-- (poistettu jotain kautta ilman migraatiota) - lähes kaikki alkuperäiset
-- policyt puuttuivat (vain food_cache_update oli jäljellä). INSERT-policyt
-- eivät yksin riitä, koska supabase-js pyytää RETURNING-rivin jokaisen
-- insertin yhteydessä, ja Postgres vaatii SELECT-policyn palautetun rivin
-- näkyvyydelle. Palautetaan kaikki puuttuvat policyt idempotentisti.

drop policy if exists food_cache_insert on food_cache;
create policy food_cache_insert on food_cache
  for insert to anon, authenticated with check (true);

drop policy if exists food_cache_select on food_cache;
create policy food_cache_select on food_cache
  for select to anon, authenticated using (true);

drop policy if exists custom_foods_insert on custom_foods;
create policy custom_foods_insert on custom_foods
  for insert to anon, authenticated with check (true);

drop policy if exists custom_foods_select on custom_foods;
create policy custom_foods_select on custom_foods
  for select to anon, authenticated using (true);

drop policy if exists custom_foods_update on custom_foods;
create policy custom_foods_update on custom_foods
  for update to anon, authenticated using (true) with check (true);

drop policy if exists custom_foods_delete on custom_foods;
create policy custom_foods_delete on custom_foods
  for delete to anon, authenticated using (true);

drop policy if exists food_log_entries_insert on food_log_entries;
create policy food_log_entries_insert on food_log_entries
  for insert to anon, authenticated with check (true);

drop policy if exists food_log_entries_select on food_log_entries;
create policy food_log_entries_select on food_log_entries
  for select to anon, authenticated using (true);

drop policy if exists food_log_entries_update on food_log_entries;
create policy food_log_entries_update on food_log_entries
  for update to anon, authenticated using (true) with check (true);

drop policy if exists food_log_entries_delete on food_log_entries;
create policy food_log_entries_delete on food_log_entries
  for delete to anon, authenticated using (true);
