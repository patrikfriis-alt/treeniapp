-- Kalenterijousto: day_session_overrides -taulu päiväkohtaisille istuntotyypin korvikkeille

create table day_session_overrides (
  workout_date  date primary key,
  session_type  text not null,
  created_at    timestamptz not null default now()
);

alter table day_session_overrides enable row level security;
create policy day_session_overrides_all on day_session_overrides
  for all to anon, authenticated using (true) with check (true);
