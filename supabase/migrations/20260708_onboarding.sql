-- Onboarding: onboarding_completed-sarake app_settings-tauluun

alter table app_settings
  add column onboarding_completed boolean not null default false;
