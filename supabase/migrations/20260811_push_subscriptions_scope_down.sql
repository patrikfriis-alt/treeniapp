-- push_subscriptions: poista tarpeeton anon-select/delete-oikeus.
-- Client tekee vain upsert(endpoint)-kirjoituksen (subJson.endpoint/p256dh/auth),
-- ei koskaan lue tai poista rivejä suoraan — vain check-and-notify (service role)
-- siivoaa vanhentuneet tilaukset 404/410-vastauksen perusteella.

drop policy if exists push_subscriptions_select on push_subscriptions;
drop policy if exists push_subscriptions_delete on push_subscriptions;
