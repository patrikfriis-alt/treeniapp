-- Liikekirjasto
create table exercises (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  muscle_group  text,
  created_at    timestamptz not null default now()
);

alter table exercises enable row level security;
create policy exercises_all on exercises
  for all to anon, authenticated using (true) with check (true);

-- Sessiotyypit (korvaa SESS/SCHED-vakiot)
create table program_sessions (
  id                text primary key,
  name              text not null,
  focus             text not null default '',
  default_weekdays  int[] not null default '{}',
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

alter table program_sessions enable row level security;
create policy program_sessions_all on program_sessions
  for all to anon, authenticated using (true) with check (true);

-- Session sisältämät liikkeet
create table program_session_exercises (
  id                   bigint generated always as identity primary key,
  program_session_id  text not null references program_sessions(id) on delete cascade,
  exercise_name        text not null,
  target_sets          int not null default 3,
  target_display        text not null default '3×10',
  sort_order           int not null default 0
);

alter table program_session_exercises enable row level security;
create policy program_session_exercises_all on program_session_exercises
  for all to anon, authenticated using (true) with check (true);

-- Seed: nykyinen ohjelma (index.html:1089-1132 olleesta SESS/SCHED-datasta)
insert into program_sessions (id, name, focus, default_weekdays, sort_order) values
  ('t1', 'Treeni 1 — Työntävät', 'Rinta, olkapäät, ojentajat', '{0}', 0),
  ('t2', 'Treeni 2 — Vetävät', 'Selkä, takaolkapäät, hauikset', '{2}', 1),
  ('t3', 'Treeni 3 — Hartiat + hauikset + ojentajat', 'Yläkehon viimeistely', '{3}', 2),
  ('t4', 'Treeni 4 — Power & Core', 'Lisätreeni energiselle päivälle', '{5}', 3),
  ('kiekko', 'Jääkiekko', 'Harrastejääkiekko + 10 000 askelta', '{1,6}', 4),
  ('juoksu', 'Juoksu / kävely', 'Hölkkä tai reipas kävely', '{4}', 5),
  ('lepo', 'Lepopäivä', 'Palautuminen', '{}', 6);

insert into exercises (name, muscle_group) values
  ('Rintapunnerruslaite', null), ('Kalteva rintaprässi laitteella', null),
  ('Pec Deck (rintalaite)', null), ('Vipunostot vapailla käsipainoilla', null),
  ('Dippilaite', null), ('Erikoisjalkaprässi 38°', null), ('Vatsarutistuslaite', null),
  ('Ylätaljalaite', null), ('Tuettu soutulaite (Verti)', null), ('Face pulls taljassa', null),
  ('Selänojennuslaite', null), ('Hauiskääntölaite', null), ('Reiden koukistuslaite', null),
  ('Jalannostot', null), ('Vipunostolaite sivuille', null), ('Reverse Pec Deck', null),
  ('Pystypunnerruslaite', null), ('Kaapeli ojentajat pään yli', null),
  ('Hauiskääntö Hammer käsipainoilla', null), ('Hauiskääntö kaapelilla', null),
  ('Vinot vatsarutistukset', null), ('Smith-kalteva penkki', null),
  ('Jalkaprässi (38°)', null), ('Ylätalja kapealla otteella', null),
  ('Rintapunnerruslaite (yksi käsi)', null), ('Lankku', null),
  ('Hyperextension-penkki mahallaan', null), ('Pohjenostot laitteessa', null);

insert into program_session_exercises (program_session_id, exercise_name, target_sets, target_display, sort_order) values
  ('t1', 'Rintapunnerruslaite', 3, '3×8', 0),
  ('t1', 'Kalteva rintaprässi laitteella', 3, '3×10', 1),
  ('t1', 'Pec Deck (rintalaite)', 3, '3×12', 2),
  ('t1', 'Vipunostot vapailla käsipainoilla', 3, '3×15', 3),
  ('t1', 'Dippilaite', 3, '3×12', 4),
  ('t1', 'Erikoisjalkaprässi 38°', 3, '3×10', 5),
  ('t1', 'Vatsarutistuslaite', 3, '3×15', 6),
  ('t2', 'Ylätaljalaite', 3, '3×10', 0),
  ('t2', 'Tuettu soutulaite (Verti)', 3, '3×10', 1),
  ('t2', 'Face pulls taljassa', 3, '3×15', 2),
  ('t2', 'Selänojennuslaite', 3, '3×15', 3),
  ('t2', 'Hauiskääntölaite', 3, '3×12', 4),
  ('t2', 'Reiden koukistuslaite', 3, '3×15', 5),
  ('t2', 'Jalannostot', 3, '3×15', 6),
  ('t3', 'Vipunostolaite sivuille', 4, '4×15', 0),
  ('t3', 'Reverse Pec Deck', 3, '3×15', 1),
  ('t3', 'Pystypunnerruslaite', 3, '3×10', 2),
  ('t3', 'Kaapeli ojentajat pään yli', 4, '4×12', 3),
  ('t3', 'Hauiskääntö Hammer käsipainoilla', 3, '3×12', 4),
  ('t3', 'Hauiskääntö kaapelilla', 3, '3×10', 5),
  ('t3', 'Vinot vatsarutistukset', 4, '4×15', 6),
  ('t4', 'Smith-kalteva penkki', 4, '4×8', 0),
  ('t4', 'Jalkaprässi (38°)', 4, '4×10', 1),
  ('t4', 'Ylätalja kapealla otteella', 3, '3×10', 2),
  ('t4', 'Rintapunnerruslaite (yksi käsi)', 3, '3×12', 3),
  ('t4', 'Vatsarutistuslaite', 3, '3×15', 4),
  ('t4', 'Lankku', 3, '3×45s', 5),
  ('t4', 'Hyperextension-penkki mahallaan', 3, '3×15', 6),
  ('t4', 'Pohjenostot laitteessa', 3, '3×15', 7);
