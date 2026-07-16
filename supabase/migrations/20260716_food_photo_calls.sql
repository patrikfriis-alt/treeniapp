-- Ruokakuva-avusteinen haku: food_photo_calls-taulu päivärajan laskentaan

create table food_photo_calls (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table food_photo_calls enable row level security;
