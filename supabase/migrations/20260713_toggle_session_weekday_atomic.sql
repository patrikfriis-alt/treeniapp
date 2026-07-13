-- Atomisoi session-viikonpäivän togglaus: korvaa asiakaspuolen luku-muokkaa-kirjoita
-- -kilpajuoksun (kaksi nopeaa peräkkäistä togglea saattoi hukata ensimmäisen)
-- yhdellä UPDATE-lauseella, jonka Postgres rivilukko sarjallistaa.

create or replace function toggle_session_weekday(p_session_id text, p_day_index int)
returns int[] as $$
declare
  result int[];
begin
  update program_sessions
  set default_weekdays = case
    when p_day_index = any(coalesce(default_weekdays, array[]::int[]))
      then array_remove(default_weekdays, p_day_index)
    else (select array_agg(d order by d) from unnest(coalesce(default_weekdays, array[]::int[]) || array[p_day_index]) as d)
  end
  where id = p_session_id
  returning default_weekdays into result;
  return result;
end;
$$ language plpgsql;
