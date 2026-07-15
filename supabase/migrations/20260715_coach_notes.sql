create table coach_notes (
  id         bigint primary key default 1 check (id = 1),
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

alter table coach_notes enable row level security;

create policy coach_notes_select on coach_notes
  for select to anon, authenticated using (true);
create policy coach_notes_update on coach_notes
  for update to anon, authenticated using (true) with check (true);

insert into coach_notes (id, notes) values (1, '');
