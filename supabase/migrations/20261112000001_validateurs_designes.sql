-- Validateurs désignés par nom pour les e-mails du circuit de validation (rappels).
-- 1er niveau par ZS (« * » = toutes les autres ZS), 2e niveau = liste.
insert into public.settings(key, value) values
 ('validateurs_zs', '{"isiro":["f9c85135-2e36-477e-9baf-ef89801d166e"],"*":["e06d5bc0-fd0a-454a-a84b-fb6c47d2e76b"]}'::jsonb),
 ('validateurs_prov', '["4285e946-1095-43d9-b3b7-52e2b3137e2f"]'::jsonb)
on conflict (key) do update set value = excluded.value;
