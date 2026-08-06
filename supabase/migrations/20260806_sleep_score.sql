-- Unipisteiden käsinsyöttö: sleep_score-sarake korvaa HealthKit-pohjaisen
-- laskukaavan (duration_min/deep_sleep_min/rem_sleep_min/awakenings) suoralla
-- käsinsyötetyllä 0-100-pistemäärällä. Vanhat sarakkeet ja historiadata
-- säilytetään koskemattomina.

alter table sleep_data add column sleep_score integer check (sleep_score >= 0 and sleep_score <= 100);
