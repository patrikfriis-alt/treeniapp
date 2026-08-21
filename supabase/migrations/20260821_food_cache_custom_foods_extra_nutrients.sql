-- Kuitu/sokeri/suola-sarakkeet food_cache- ja custom_foods-tauluihin (päiväyhteenveto-kortin taustalle).
-- fineli_foods sisältää nämä jo (ks. 20260811_fineli_foods.sql) mutta arvot eivät tähän asti
-- ole kulkeneet eteenpäin kun ruoka kirjataan tai lisätään omana tuotteena.

alter table food_cache add column if not exists fiber_per_100g numeric;
alter table food_cache add column if not exists sugar_per_100g numeric;
alter table food_cache add column if not exists salt_per_100g numeric;

alter table custom_foods add column if not exists fiber_per_100g numeric;
alter table custom_foods add column if not exists sugar_per_100g numeric;
alter table custom_foods add column if not exists salt_per_100g numeric;
