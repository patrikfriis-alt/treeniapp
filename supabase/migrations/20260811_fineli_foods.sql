create table fineli_foods (
  id                bigint primary key,
  name_fi           text not null,
  name_en           text,
  name_sv           text,
  kcal_per_100g     numeric,
  protein_per_100g  numeric,
  fat_per_100g      numeric,
  carbs_per_100g    numeric,
  fiber_per_100g    numeric,
  sugar_per_100g    numeric,
  salt_per_100g     numeric
);

create index fineli_foods_name_fi_idx on fineli_foods (lower(name_fi) text_pattern_ops);

alter table fineli_foods enable row level security;
create policy fineli_foods_select on fineli_foods
  for select to anon, authenticated using (true);
