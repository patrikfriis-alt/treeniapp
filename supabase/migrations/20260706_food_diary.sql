-- Ruokapäiväkirja: Fineli-cache, omat tuotteet, päivän syömiset

create table food_cache (
  id             bigint generated always as identity primary key,
  fineli_id      integer not null unique,
  name_fi        text not null,
  kcal_per_100g  numeric not null,
  protein_per_100g numeric not null,
  carbs_per_100g numeric not null,
  fat_per_100g   numeric not null,
  created_at     timestamptz not null default now()
);

create table custom_foods (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kcal_per_100g  numeric not null,
  protein_per_100g numeric not null,
  carbs_per_100g numeric not null,
  fat_per_100g   numeric not null,
  created_at     timestamptz not null default now()
);

create table food_log_entries (
  id             uuid primary key default gen_random_uuid(),
  logged_at      date not null default current_date,
  food_cache_id  bigint references food_cache(id) on delete restrict,
  custom_food_id uuid references custom_foods(id) on delete restrict,
  amount_g       numeric not null check (amount_g > 0),
  kcal           numeric not null,
  protein_g      numeric,
  created_at     timestamptz not null default now(),
  constraint food_log_entries_one_source check (
    (food_cache_id is not null)::int + (custom_food_id is not null)::int = 1
  )
);

create index food_log_entries_logged_at_idx on food_log_entries (logged_at);

-- RLS
-- Huom: sovelluksessa ei tällä hetkellä ole Supabase Authia (pelkkä anon-avain,
-- ei kirjautumista), samoin kuin workout_sessions/body_metrics ym. tauluissa.
-- "Omistajuus" on siis nimellinen tässä vaiheessa, ei auth.uid()-pohjaisesti
-- pakotettu. Jos kirjautuminen otetaan myöhemmin käyttöön, nämä policyt
-- kannattaa kiristää auth.uid() = user_id -muotoon.

alter table food_cache enable row level security;
alter table custom_foods enable row level security;
alter table food_log_entries enable row level security;

-- food_cache: jaettu cache, luku kaikille kirjautuneille/anon-käyttäjille,
-- kirjoitus sallittu jotta sovellus voi tallentaa uusia Fineli-hakuja.
create policy food_cache_select on food_cache
  for select to anon, authenticated using (true);
create policy food_cache_insert on food_cache
  for insert to anon, authenticated with check (true);

-- custom_foods: vain omistajalle (nimellisesti - ks. huomautus yllä)
create policy custom_foods_select on custom_foods
  for select to anon, authenticated using (true);
create policy custom_foods_insert on custom_foods
  for insert to anon, authenticated with check (true);
create policy custom_foods_update on custom_foods
  for update to anon, authenticated using (true) with check (true);
create policy custom_foods_delete on custom_foods
  for delete to anon, authenticated using (true);

-- food_log_entries: vain omistajalle (nimellisesti - ks. huomautus yllä)
create policy food_log_entries_select on food_log_entries
  for select to anon, authenticated using (true);
create policy food_log_entries_insert on food_log_entries
  for insert to anon, authenticated with check (true);
create policy food_log_entries_update on food_log_entries
  for update to anon, authenticated using (true) with check (true);
create policy food_log_entries_delete on food_log_entries
  for delete to anon, authenticated using (true);
