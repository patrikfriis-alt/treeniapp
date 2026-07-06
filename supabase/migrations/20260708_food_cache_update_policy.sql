-- food_cache: lisää puuttuva UPDATE-policy, jotta ensureFoodCache()-funktion
-- upsert (insert ... on conflict (fineli_id) do update) on aina yhdenmukainen
-- muiden taulujen upsert-käytäntöjen kanssa (vrt. nutrition_goals).

create policy food_cache_update on food_cache
  for update to anon, authenticated using (true) with check (true);
