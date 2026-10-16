-- 6-week mesocycle: the Monday the current cycle started. Null = not started yet; the app sets it
-- to the current week's Monday on the first gym-page load and rolls it forward in whole 6-week
-- steps (week 6 of every cycle is the deload week).
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS mesocycle_start_monday date;
