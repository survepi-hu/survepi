-- Durcissement (conseils de sécurité Supabase, 20/10/2026). Aucun changement de comportement pour les utilisateurs.

-- 1. Les visiteurs non connectés (anon) ne peuvent appeler que public_branding (écran de connexion).
--    Les autres fonctions refusaient déjà (rôle « aucun »), mais elles n'ont pas à être exposées.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'public_branding'
             and not exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2. Fonctions déclencheurs : jamais appelées directement par l'API
revoke execute on function public.trg_audit() from authenticated;
revoke execute on function public.trg_daily_reports() from authenticated;
revoke execute on function public.trg_investigations() from authenticated;

-- 3. search_path figé sur les fonctions qui ne l'avaient pas
alter function public.is_province_level() set search_path = public;
alter function public.can_edit_zs(text) set search_path = public;
alter function public.zs_categorie(public.health_zones, date) set search_path = public;
alter function public.prefill_report(date, text) set search_path = public;
alter function public.trg_touch() set search_path = public;
alter function public.today_local() set search_path = public;
alter function public.trg_settings_province_code() set search_path = public;
alter function public.trg_settings_logo() set search_path = public;
