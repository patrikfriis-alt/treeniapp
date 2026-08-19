-- Suosikkiateriat: nimetyt, uudelleenkäytettävät ateriamallit

create table meal_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table meal_template_items (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references meal_templates(id) on delete cascade,
  food_cache_id  bigint references food_cache(id) on delete restrict,
  custom_food_id uuid references custom_foods(id) on delete restrict,
  amount_g       numeric not null check (amount_g > 0),
  constraint meal_template_items_one_source check (
    (food_cache_id is not null)::int + (custom_food_id is not null)::int = 1
  )
);

create index meal_template_items_template_id_idx on meal_template_items (template_id);

-- RLS — sama malli kuin food_log_entries ym.: ei Supabase Authia käytössä
-- (pelkkä anon-avain), joten "omistajuus" on nimellinen, ei auth.uid()-pakotettu.
alter table meal_templates enable row level security;
alter table meal_template_items enable row level security;

create policy meal_templates_select on meal_templates
  for select to anon, authenticated using (true);
create policy meal_templates_insert on meal_templates
  for insert to anon, authenticated with check (true);
create policy meal_templates_delete on meal_templates
  for delete to anon, authenticated using (true);

create policy meal_template_items_select on meal_template_items
  for select to anon, authenticated using (true);
create policy meal_template_items_insert on meal_template_items
  for insert to anon, authenticated with check (true);
