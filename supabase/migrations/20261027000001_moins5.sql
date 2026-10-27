-- Situation épidémiologique : précision « enfants de moins de 5 ans » (demande du sous-pilier, 27/10/2026).
-- Trois événements du jour, chacun sous-ensemble d'un événement existant, et leurs valeurs initiales par ZS.
-- Les cumuls restent calculés dans l'app (valeurs initiales + événements), jamais saisis.

alter table public.daily_reports
  add column if not exists cas_conf_moins5 int check (cas_conf_moins5 >= 0),  -- parmi les nouveaux confirmés (vivants + décédés)
  add column if not exists deces_moins5    int check (deces_moins5 >= 0),     -- parmi les décès du jour chez les confirmés
  add column if not exists gueris_moins5   int check (gueris_moins5 >= 0);    -- parmi les nouveaux guéris
alter table public.daily_reports add constraint moins5_le_confirmes
  check (cas_conf_moins5 is null or cas_conf_moins5 <= coalesce(cas_conf_vivants, 0) + coalesce(cas_conf_decedes, 0));
alter table public.daily_reports add constraint deces_moins5_le_deces
  check (deces_moins5 is null or deces_moins5 <= coalesce(cas_conf_decedes, 0) + coalesce(deces_parmi_confirmes, 0));
alter table public.daily_reports add constraint gueris_moins5_le_gueris
  check (gueris_moins5 is null or gueris_moins5 <= coalesce(gueris, 0));

alter table public.health_zones
  add column if not exists base_moins5        int check (base_moins5 >= 0),
  add column if not exists base_deces_moins5  int check (base_deces_moins5 >= 0),
  add column if not exists base_gueris_moins5 int check (base_gueris_moins5 >= 0);

-- Import de l'historique : colonnes lues dans la table elle-même. Un nouvel indicateur de la fiche est donc
-- importé sans retoucher cette fonction. Les champs de workflow (statut, validation, horodatages) restent imposés.
create or replace function public.import_historique(p_rows jsonb, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v jsonb; ex record; n_ins int := 0; n_rep int := 0; ignorees jsonb := '[]'::jsonb; moi uuid; cols text;
  aujourdhui date := (now() at time zone public.app_tz())::date;
  -- jamais repris du fichier : identifiant, horodatages et validation posés par la base
  exclues text[] := array['id','created_at','updated_at','updated_by','started_at','submitted_at','resubmitted_at',
                          'validated_zs_by','validated_zs_at','version'];
begin
  if public.app_role() not in ('admin','team_lead','data_manager') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Import de l''historique réservé à l''administrateur, au Team Lead et au gestionnaire de données' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Liste de fiches attendue' using errcode = '22023'; end if;
  moi := (public.current_actor()).id;
  perform set_config('survepi.import', 'on', true);
  -- 1er passage : retirer d'un coup les fiches historiques remplacées (une AS peut changer de jour d'un import à l'autre)
  delete from public.daily_reports d
   using jsonb_array_elements(p_rows) e
   where d.source = 'historique' and d.date = (e.value->>'date')::date and d.zs_id = e.value->>'zs_id'
     and (e.value->>'date')::date <= aujourdhui;
  get diagnostics n_rep = row_count;
  for r in select value from jsonb_array_elements(p_rows) loop
    if (r->>'date')::date > aujourdhui then
      ignorees := ignorees || jsonb_build_object('date', r->>'date', 'zs_id', r->>'zs_id', 'motif', 'date future');
      continue;
    end if;
    select id, source into ex from public.daily_reports where date = (r->>'date')::date and zs_id = r->>'zs_id';
    if found then
      ignorees := ignorees || jsonb_build_object('date', r->>'date', 'zs_id', r->>'zs_id', 'motif',
        case when ex.source = 'saisie' then 'fiche déjà saisie dans l''app' else 'en double dans le lot' end);
      continue;
    end if;
    v := r || jsonb_build_object(
      'statut', 'valide_prov', 'source', 'historique', 'source_detail', left(coalesce(r->>'source_detail', p_detail), 300),
      'rapport_nul', coalesce((r->>'rapport_nul')::boolean, false), 'motifs_inv', '[]'::jsonb, 'motifs_suivi', '[]'::jsonb,
      'validated_by', moi, 'validated_at', now(), 'nouvelles_as', coalesce(r->'nouvelles_as', '[]'::jsonb));
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'daily_reports' and c.is_generated = 'NEVER'
       and c.column_name <> all (exclues) and v ? c.column_name;
    execute format('insert into public.daily_reports (%s) select %s from jsonb_populate_record(null::public.daily_reports, $1)', cols, cols) using v;
    n_ins := n_ins + 1;
  end loop;
  perform set_config('survepi.import', 'off', true);
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'daily_reports', null, 'IMPORT_HISTORIQUE',
          jsonb_build_object('fichiers', p_detail, 'creees', n_ins - least(n_ins, n_rep), 'remplacees', least(n_ins, n_rep), 'ignorees', jsonb_array_length(ignorees)));
  return jsonb_build_object('creees', n_ins - least(n_ins, n_rep), 'remplacees', least(n_ins, n_rep), 'ignorees', ignorees);
end $$;
revoke all on function public.import_historique(jsonb, text) from public, anon;
grant execute on function public.import_historique(jsonb, text) to authenticated, service_role;
