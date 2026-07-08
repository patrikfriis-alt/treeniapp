-- Kestävyystavoitteet: activity_goals -taulu viikkokohtaisille juoksutavoitteille

create table activity_goals (
  id                       bigint primary key default 1 check (id = 1),
  weekly_km                numeric,
  weekly_sessions          integer,
  target_pace_min_per_km   numeric,
  updated_at               timestamptz not null default now()
);

alter table activity_goals enable row level security;

create policy activity_goals_select on activity_goals
  for select to anon, authenticated using (true);
create policy activity_goals_insert on activity_goals
  for insert to anon, authenticated with check (true);
create policy activity_goals_update on activity_goals
  for update to anon, authenticated using (true) with check (true);
