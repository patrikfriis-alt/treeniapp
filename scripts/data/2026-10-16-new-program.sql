-- New gym program (Push A / Pull A / Push B / Pull B + T5 Viimeistely), approved 2026-10-16.
-- One transaction: if any check fails, nothing is changed. Run in the TreeniApp SQL editor.
begin;

-- 1. History renames (exact counts via filtered count queries 2026-10-16: 46 / 46 / 6 / 6 / 8; target names empty → no clashes)
do $$
declare n int;
begin
  update workout_sets set exercise_name = 'Ylätaljalaite leveä ote' where exercise_name = 'Ylätaljalaite';
  get diagnostics n = row_count; if n <> 46 then raise exception 'Ylätaljalaite: expected 46, got %', n; end if;
  update workout_sets set exercise_name = 'Alatalja vivullinen' where exercise_name = 'Tuettu soutulaite (Verti)';
  get diagnostics n = row_count; if n <> 46 then raise exception 'Tuettu soutulaite: expected 46, got %', n; end if;
  update workout_sets set exercise_name = 'Rannekääntö' where exercise_name = 'Rannekääntö käsipainoilla';
  get diagnostics n = row_count; if n <> 6 then raise exception 'Rannekääntö: expected 6, got %', n; end if;
  update workout_sets set exercise_name = 'Reverse Pec Deck (lisätreeni)' where exercise_name = 'Reverse Pec Deck' and session_type = 't5';
  get diagnostics n = row_count; if n <> 6 then raise exception 'Reverse Pec Deck t5: expected 6, got %', n; end if;
  update workout_sets set exercise_name = 'Pohjenostot laitteessa (lisätreeni)' where exercise_name = 'Pohjenostot laitteessa' and session_type = 't5';
  get diagnostics n = row_count; if n <> 8 then raise exception 'Pohjenostot t5: expected 8, got %', n; end if;
end $$;

-- 2. Sessions: names, focus, default weekdays (0 = Mon), catch-up collector
update program_sessions set name = 'Treeni 1 — Push A',      focus = 'Alarinta, voima',                default_weekdays = '{0}', collects_catchup = false where id = 't1';
update program_sessions set name = 'Treeni 2 — Pull A',      focus = 'Selän paksuus, voima',           default_weekdays = '{2}', collects_catchup = false where id = 't2';
update program_sessions set name = 'Treeni 3 — Push B',      focus = 'Ylärintakehä, pumppi',           default_weekdays = '{3}', collects_catchup = false where id = 't3';
update program_sessions set name = 'Treeni 4 — Pull B',      focus = 'Selän leveys, hauikset',         default_weekdays = '{4}', collects_catchup = false where id = 't4';
update program_sessions set name = 'Treeni 5 — Viimeistely', focus = 'Supersarjat, pumppi, hifistely', default_weekdays = '{}',  collects_catchup = true  where id = 't5';
update program_sessions set default_weekdays = '{}' where id = 'juoksu';

-- 3. Exercises of t1–t5 replaced
delete from program_session_exercises where program_session_id in ('t1','t2','t3','t4','t5');
insert into program_session_exercises (program_session_id, exercise_name, target_sets, target_display, sort_order) values
  ('t1','Rintapunnerruslaite',4,'4×10',0),
  ('t1','Smith-penkki tasainen',3,'3×10',1),
  ('t1','Pec Deck (rintalaite)',3,'3×10',2),
  ('t1','Pystypunnerruslaite',3,'3×10',3),
  ('t1','Ojentajapunnerrus taljassa (kapea ote)',3,'3×10',4),
  ('t1','Jalkaprässi',3,'3×10',5),
  ('t2','Trap bar -maastaveto',4,'4×10',0),
  ('t2','Prone row',4,'4×10',1),
  ('t2','Alatalja vivullinen',3,'3×10',2),
  ('t2','Scott-penkki',3,'3×10',3),
  ('t2','Reverse Pec Deck',3,'3×10',4),
  ('t2','Reiden koukistuslaite',3,'3×10',5),
  ('t2','Pohjenostot laitteessa',4,'4×10',6),
  ('t3','Smith-kalteva penkki',4,'4×10',0),
  ('t3','Pec Deck (rintalaite)',3,'3×10',1),
  ('t3','Kaapelivipunostot sivuille',4,'4×10',2),
  ('t3','Vipunostot käsipainoilla sivulle',3,'3×10',3),
  ('t3','Kaapeli ojentajat pään yli',3,'3×10',4),
  ('t3','Hack-kyykky (hack squat -laite)',3,'3×10',5),
  ('t4','Ylätaljalaite leveä ote',4,'4×10',0),
  ('t4','Alatalja vivullinen',4,'4×10',1),
  ('t4','Yksikätinen soutulaite',3,'3×10',2),
  ('t4','Hauiskääntö kaapelilla',3,'3×10',3),
  ('t4','Hauiskääntö Hammer käsipainoilla',3,'3×10',4),
  ('t4','Reiden ojennuslaite',3,'3×10',5),
  ('t4','Pohjenostot laitteessa',4,'4×10',6),
  ('t5','Kaapelivipunostot sivuille (lisätreeni)',4,'4×10',0),
  ('t5','Hauiskääntö käsipainoilla kaltevalla penkillä',3,'Supersarja ojentaja · 3×10',1),
  ('t5','Ojentajapunnerrus taljassa köydellä',3,'Supersarja hauis · 3×10',2),
  ('t5','Yksikätinen hauiskääntö kaapelilla',3,'3×10',3),
  ('t5','Yksikätinen kaapeliojennus',3,'3×10',4),
  ('t5','Yksikätinen taljaveto selälle',3,'3×10',5),
  ('t5','Reverse Pec Deck (lisätreeni)',3,'3×10',6),
  ('t5','Käänteinen hauiskääntö EZ-tangolla',3,'Supersarja rannekääntö · 3×10',7),
  ('t5','Rannekääntö',3,'Supersarja käänt. hauis · 3×10',8),
  ('t5','Pohjenostot laitteessa (lisätreeni)',4,'4×10',9);

-- 4. Shared exercise library: make every program name searchable in the editor
insert into exercises (name)
select distinct exercise_name from program_session_exercises
on conflict (name) do nothing;

-- 5. Mesocycle starts Monday 19.10.2026
update app_settings set mesocycle_start_monday = '2026-10-19', updated_at = now() where id = 1;

commit;
