-- Manuaalinen paastonseuranta: korvaa ruokakirjausten aikaleimoista johdetun laskennan

create table fasting_sessions (
  id         uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);

create index fasting_sessions_started_at_idx on fasting_sessions (started_at);
create index fasting_sessions_ended_at_idx on fasting_sessions (ended_at);

-- Korkeintaan yksi aktiivinen (ended_at is null) paasto kerrallaan
create unique index fasting_sessions_single_active_idx on fasting_sessions ((1)) where ended_at is null;

alter table fasting_sessions enable row level security;

create policy fasting_sessions_select on fasting_sessions
  for select to anon, authenticated using (true);
create policy fasting_sessions_insert on fasting_sessions
  for insert to anon, authenticated with check (true);
create policy fasting_sessions_update on fasting_sessions
  for update to anon, authenticated using (true);
create policy fasting_sessions_delete on fasting_sessions
  for delete to anon, authenticated using (true);
