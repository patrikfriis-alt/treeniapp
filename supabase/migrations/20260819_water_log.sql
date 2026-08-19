-- Vesiseuranta: päivittäinen vedenjuonnin pikakirjaus

create table water_log (
  id         uuid primary key default gen_random_uuid(),
  logged_at  date not null default current_date,
  amount_ml  integer not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create index water_log_logged_at_idx on water_log (logged_at);

alter table water_log enable row level security;

create policy water_log_select on water_log
  for select to anon, authenticated using (true);
create policy water_log_insert on water_log
  for insert to anon, authenticated with check (true);
create policy water_log_delete on water_log
  for delete to anon, authenticated using (true);

alter table app_settings add column daily_water_goal_ml integer;
