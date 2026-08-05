-- Ruokakuvan tekoälyavusteinen makroarvio: food_macro_estimate_calls-taulu
-- päivärajan laskentaan (sama malli kuin food_photo_calls).

create table food_macro_estimate_calls (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table food_macro_estimate_calls enable row level security;
