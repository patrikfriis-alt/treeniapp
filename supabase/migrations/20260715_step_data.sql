-- Askelseuranta: step_data-taulu päivittäisille askelmäärille + tavoiteasetus

create table step_data (
  id          uuid primary key default gen_random_uuid(),
  step_date   date not null unique,
  steps       integer not null,
  source      text default 'watch',
  updated_at  timestamptz not null default now()
);

alter table step_data enable row level security;

create policy step_data_select on step_data
  for select to anon, authenticated using (true);
create policy step_data_insert on step_data
  for insert to anon, authenticated with check (true);
create policy step_data_update on step_data
  for update to anon, authenticated using (true) with check (true);

alter table app_settings add column daily_steps_goal integer;
