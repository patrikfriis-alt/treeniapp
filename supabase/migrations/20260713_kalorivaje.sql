-- Kalorivaje: user_profile-taulu (sukupuoli/pituus/syntymäaika BMR-laskentaan)

create table user_profile (
  id         bigint primary key default 1 check (id = 1),
  sex        text check (sex in ('male','female')),
  height_cm  numeric,
  birth_date date,
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

create policy user_profile_select on user_profile
  for select to anon, authenticated using (true);
create policy user_profile_insert on user_profile
  for insert to anon, authenticated with check (true);
create policy user_profile_update on user_profile
  for update to anon, authenticated using (true) with check (true);
