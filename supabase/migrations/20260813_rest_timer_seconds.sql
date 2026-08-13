-- Lepoajastimen kesto asetettavaksi: null = käytä 90s oletusta (REST_DURATION-vakio).

alter table app_settings add column if not exists rest_timer_seconds integer;
