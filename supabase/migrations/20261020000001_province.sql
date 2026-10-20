-- Une installation = une province (option 1).
-- La province est un paramètre, plus rien n'est écrit en dur dans la base.
-- Préparation de l'option 2 (base multi-provinces) : chaque installation porte un code province stable,
-- repris dans les sauvegardes, pour pouvoir fusionner les bases plus tard sans ambiguïté.

insert into public.settings (key, value) values
  ('province_nom',  '"Haut-Uélé"'),
  ('province_code', '"HU"'),            -- code court, stable, unique au niveau national (sert à la fusion)
  ('dps_nom',       '"DPS Haut-Uélé"')
on conflict (key) do nothing;

-- Fuseau lu dans les paramètres (Africa/Lubumbashi par défaut)
create or replace function public.app_tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.setting('fuseau') #>> '{}', 'Africa/Lubumbashi')
$$;

create or replace function public.today_local() returns date
language sql stable as $$ select (now() at time zone public.app_tz())::date $$;

create or replace function public.zs_categorie(z public.health_zones, d date default public.today_local())
returns text language sql stable as $$
  select case
    when z.date_premier_cas is null then coalesce(z.categorie_manuelle, 'preparation')
    when z.date_premier_cas > d then 'preparation'
    when d - coalesce(z.date_dernier_cas, z.date_premier_cas) >= coalesce((public.setting('jours_post_flambee'))::int, 42) then 'post_flambee'
    else 'touchee' end
$$;

create or replace view public.v_health_zones with (security_invoker = true) as
select z.*, public.zs_categorie(z) as categorie,
       (public.today_local() - coalesce(z.date_dernier_cas, z.date_premier_cas)) as jours_sans_cas
from public.health_zones z;

create or replace view public.v_reports with (security_invoker = true) as
select r.*,
  z.nom as zs_nom,
  public.zs_categorie(z, r.date) as zs_categorie,
  to_char(r.date, 'IYYY-"S"IW') as semaine_epi,
  case when r.alertes_validees > 0 then round(100.0 * r.inv_realisees_jour / r.alertes_validees, 1) end as taux_inv,
  case when r.ct_identifies > 0 then round(100.0 * r.ct_listes_24h / r.ct_identifies, 1) end as taux_listage,
  case when r.ct_a_suivre > 0 then round(100.0 * r.ct_vus / r.ct_a_suivre, 1) end as taux_suivi,
  greatest(r.ct_a_suivre - coalesce(r.ct_vus,0), 0) as ct_non_vus,
  case when r.submitted_at is null then null
       else (r.submitted_at at time zone public.app_tz()) <=
            (r.date + coalesce(z.heure_limite, (public.setting('heure_limite')#>>'{}')::time)) end as a_temps
from public.daily_reports r join public.health_zones z on z.id = r.zs_id;

-- Le code province ne doit pas changer une fois des données saisies (clé de fusion future).
create or replace function public.trg_settings_province_code() returns trigger
language plpgsql as $$
begin
  if new.key = 'province_code' and old.value is distinct from new.value
     and exists (select 1 from public.daily_reports limit 1) then
    raise exception 'Le code province ne peut plus changer : des fiches existent déjà' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists settings_province_code on public.settings;
create trigger settings_province_code before update on public.settings
  for each row execute function public.trg_settings_province_code();
