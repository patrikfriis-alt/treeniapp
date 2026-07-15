create table coach_api_calls (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table coach_api_calls enable row level security;
