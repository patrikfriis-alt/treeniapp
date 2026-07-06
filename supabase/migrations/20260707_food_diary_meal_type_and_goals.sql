-- Ruokapäiväkirja: ateriaryhmittely + ravintotavoitteet

alter table food_log_entries
  add column meal_type text not null
  check (meal_type in ('aamiainen','lounas','paivallinen','valipala'));

create table nutrition_goals (
  id                bigint primary key default 1 check (id = 1),
  daily_kcal        numeric,
  daily_protein_g   numeric,
  daily_carbs_g     numeric,
  daily_fat_g       numeric,
  weekly_kcal       numeric,
  weekly_protein_g  numeric,
  weekly_carbs_g    numeric,
  weekly_fat_g      numeric,
  updated_at        timestamptz not null default now()
);

alter table nutrition_goals enable row level security;

create policy nutrition_goals_select on nutrition_goals
  for select to anon, authenticated using (true);
create policy nutrition_goals_insert on nutrition_goals
  for insert to anon, authenticated with check (true);
create policy nutrition_goals_update on nutrition_goals
  for update to anon, authenticated using (true) with check (true);
