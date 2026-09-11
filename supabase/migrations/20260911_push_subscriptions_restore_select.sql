-- 2026-08-11:n "push_subscriptions_scope_down" poisti anon-select-oikeuden perustellen
-- ettei client koskaan lue rivejä suoraan. Tämä perustelu oli virheellinen: sb.upsert()
-- pyytää RETURNING-rivin takaisin (Prefer: return=representation), ja Postgres vaatii
-- SELECT-policyn läpäisyn myös RETURNING-projektiolle INSERT/UPDATE-lauseessa — ei vain
-- erilliselle SELECT-kyselylle. Ilman select-policya jokainen tilaus (push-ilmoitusten
-- käyttöönotto) epäonnistui "new row violates row-level security policy" -virheeseen,
-- vaikka insert/update-policyt itsessään olivat kunnossa.
--
-- Palautetaan select samalla avoimella using(true)-kaavalla kuin muillakin tämän
-- yhden käyttäjän sovelluksen tauluilla. _delete jätetään yhä poistetuksi (2026-08-11:n
-- perustelu sille piti paikkansa — vain check-and-notify:n service role siivoaa
-- vanhentuneet tilaukset, eikä RLS-policya tarvita, koska service role ohittaa RLS:n).

create policy push_subscriptions_select on push_subscriptions
  for select to anon, authenticated using (true);
