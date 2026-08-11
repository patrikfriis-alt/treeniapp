-- Kevyt viikko -merkintä: ylikuormitushuomion "Merkitse kevyeksi viikoksi" -toiminto.
-- Tallentaa merkityn viikon maanantain, jota käytetään sekä huomion piilottamiseen
-- (kun jo käsitelty) että auto-progressioehdotuksen +2.5%-korotuksen ohittamiseen.

alter table app_settings add column if not exists deload_week_monday date;
