-- Marks the program session that collects the week's undone sets ("Viikon rästit").
-- Off by default; the user switches it on for the extra workout in the program editor.
alter table program_sessions add column collects_catchup boolean not null default false;
