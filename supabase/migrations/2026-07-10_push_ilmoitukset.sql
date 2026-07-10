create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions
  for select to anon, authenticated using (true);
create policy push_subscriptions_insert on push_subscriptions
  for insert to anon, authenticated with check (true);
create policy push_subscriptions_delete on push_subscriptions
  for delete to anon, authenticated using (true);

alter table app_settings add column push_enabled boolean not null default true;
