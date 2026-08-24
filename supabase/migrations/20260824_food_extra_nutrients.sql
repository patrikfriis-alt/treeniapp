-- Laajennettu ravintoainetieto ("Lisätiedot") -ominaisuus: rasvan jaottelu, natrium,
-- 5 kivennäisainetta, C/D-vitamiini sekä valmistustapaluokitus.
-- fineli_foods saa kaikki 13 saraketta (data täydennetään erillisellä tuontiskriptillä,
-- ks. Task 2). food_cache saa samat 13 (kopio Fineli-hausta, kuten fiber/sugar/salt jo).
-- custom_foods saa 12 numeerista saraketta MUTTA EI process_code-saraketta — käyttäjän
-- omalle tuotteelle ei ole mielekästä valmistustapaluokittelua.

alter table public.fineli_foods add column if not exists fat_saturated_per_100g numeric;
alter table public.fineli_foods add column if not exists fat_mono_per_100g numeric;
alter table public.fineli_foods add column if not exists fat_poly_per_100g numeric;
alter table public.fineli_foods add column if not exists fat_trans_per_100g numeric;
alter table public.fineli_foods add column if not exists sodium_per_100g numeric;
alter table public.fineli_foods add column if not exists calcium_per_100g numeric;
alter table public.fineli_foods add column if not exists potassium_per_100g numeric;
alter table public.fineli_foods add column if not exists magnesium_per_100g numeric;
alter table public.fineli_foods add column if not exists iron_per_100g numeric;
alter table public.fineli_foods add column if not exists zinc_per_100g numeric;
alter table public.fineli_foods add column if not exists vitamin_c_per_100g numeric;
alter table public.fineli_foods add column if not exists vitamin_d_per_100g numeric;
alter table public.fineli_foods add column if not exists process_code text;

alter table public.food_cache add column if not exists fat_saturated_per_100g numeric;
alter table public.food_cache add column if not exists fat_mono_per_100g numeric;
alter table public.food_cache add column if not exists fat_poly_per_100g numeric;
alter table public.food_cache add column if not exists fat_trans_per_100g numeric;
alter table public.food_cache add column if not exists sodium_per_100g numeric;
alter table public.food_cache add column if not exists calcium_per_100g numeric;
alter table public.food_cache add column if not exists potassium_per_100g numeric;
alter table public.food_cache add column if not exists magnesium_per_100g numeric;
alter table public.food_cache add column if not exists iron_per_100g numeric;
alter table public.food_cache add column if not exists zinc_per_100g numeric;
alter table public.food_cache add column if not exists vitamin_c_per_100g numeric;
alter table public.food_cache add column if not exists vitamin_d_per_100g numeric;
alter table public.food_cache add column if not exists process_code text;

alter table public.custom_foods add column if not exists fat_saturated_per_100g numeric;
alter table public.custom_foods add column if not exists fat_mono_per_100g numeric;
alter table public.custom_foods add column if not exists fat_poly_per_100g numeric;
alter table public.custom_foods add column if not exists fat_trans_per_100g numeric;
alter table public.custom_foods add column if not exists sodium_per_100g numeric;
alter table public.custom_foods add column if not exists calcium_per_100g numeric;
alter table public.custom_foods add column if not exists potassium_per_100g numeric;
alter table public.custom_foods add column if not exists magnesium_per_100g numeric;
alter table public.custom_foods add column if not exists iron_per_100g numeric;
alter table public.custom_foods add column if not exists zinc_per_100g numeric;
alter table public.custom_foods add column if not exists vitamin_c_per_100g numeric;
alter table public.custom_foods add column if not exists vitamin_d_per_100g numeric;
