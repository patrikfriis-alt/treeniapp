-- Painonpudotusennuste: tavoitepaino profiiliin + kalibrointihistoria kaksiosastomallille.

alter table user_profile add column if not exists target_weight_kg numeric;

create table model_calibration (
  id uuid primary key default gen_random_uuid(),
  calibrated_at timestamptz not null default now(),
  other_tissue_kcal_per_kg numeric not null,
  activity_multiplier numeric not null,
  sample_weeks numeric not null
);

alter table model_calibration enable row level security;

create policy model_calibration_select on model_calibration
  for select to anon, authenticated using (true);
create policy model_calibration_insert on model_calibration
  for insert to anon, authenticated with check (true);
