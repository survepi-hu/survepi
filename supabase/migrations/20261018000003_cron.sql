-- Planificateur : la fonction « rappels » est appelée toutes les 5 minutes.
-- Elle calcule les rappels dus (étapes paramétrées dans settings.rappels), les envoie
-- et les journalise dans public.notifications (clé unique => jamais deux fois le même).
--
-- Avant d'appliquer : remplacer <PROJECT_REF> et stocker la clé de service dans Vault :
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'survepi-rappels',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Bascule automatique quotidienne : rien à stocker, la catégorie est calculée (v_health_zones).
-- Sauvegarde logique quotidienne recommandée en plus des sauvegardes Supabase (voir README).
