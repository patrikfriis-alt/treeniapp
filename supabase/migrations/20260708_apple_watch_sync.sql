-- Apple Watch -treenisynkronointi: workout_sessions/activity_data laajennus + app_settings

alter table workout_sessions add column calories numeric;
alter table workout_sessions add column avg_heart_rate numeric;

alter table activity_data add column source text not null default 'manual' check (source in ('manual','watch'));
alter table activity_data add column healthkit_uuid text unique;

create table app_settings (
  id                 bigint primary key default 1 check (id = 1),
  calorie_correction numeric not null default 0.72,
  updated_at         timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy app_settings_select on app_settings
  for select to anon, authenticated using (true);
create policy app_settings_insert on app_settings
  for insert to anon, authenticated with check (true);
create policy app_settings_update on app_settings
  for update to anon, authenticated using (true) with check (true);
