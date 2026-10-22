-- Matrice en 3 rubriques : I. Situation épidémiologique (nouveau), II. Investigations, III. Suivi des contacts.
-- Retour du sous-pilier (22/10/2026) :
--   * événements du jour seulement (cas confirmés vivants / décédés / dont PPL, décès parmi les confirmés, guéris,
--     décès non confirmés suivis à part) ; les cumuls sont recalculés à partir de ces événements, jamais recopiés ;
--   * aires de santé (AS) choisies dans une liste par ZS ; une AS déjà touchée ne peut pas redevenir « nouvelle » ;
--   * valeurs initiales par ZS (situation de référence), saisies ou corrigées par l'équipe de gestion des données.

-- ---------------------------------------------------------------- Aires de santé
create table if not exists public.health_areas (
  id          uuid primary key default gen_random_uuid(),
  zs_id       text not null references public.health_zones(id),
  nom         text not null,
  code_dhis2  text,
  touchee_le  date,            -- déjà touchée avant la mise en service (situation de référence)
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (zs_id, nom)
);
alter table public.health_areas enable row level security;
drop policy if exists as_read on public.health_areas;
create policy as_read on public.health_areas for select to authenticated using (public.app_role() <> 'aucun');
drop policy if exists as_write on public.health_areas;
create policy as_write on public.health_areas for all to authenticated
  using (public.app_role() in ('admin', 'team_lead', 'data_manager')) with check (public.app_role() in ('admin', 'team_lead', 'data_manager'));
drop trigger if exists health_areas_audit on public.health_areas;
create trigger health_areas_audit after insert or update or delete on public.health_areas for each row execute function public.trg_audit();

-- ---------------------------------------------------------------- Événements épidémiologiques du jour (fiche ZS)
alter table public.daily_reports
  add column if not exists cas_conf_vivants      int check (cas_conf_vivants >= 0),
  add column if not exists cas_conf_decedes      int check (cas_conf_decedes >= 0),
  add column if not exists cas_conf_ppl          int check (cas_conf_ppl >= 0),
  add column if not exists deces_parmi_confirmes int check (deces_parmi_confirmes >= 0),
  add column if not exists gueris                int check (gueris >= 0),
  add column if not exists deces_non_confirmes   int check (deces_non_confirmes >= 0),
  add column if not exists nouvelles_as          uuid[] not null default '{}';
alter table public.daily_reports drop constraint if exists ppl_le_confirmes;
alter table public.daily_reports add constraint ppl_le_confirmes
  check (cas_conf_ppl is null or cas_conf_ppl <= coalesce(cas_conf_vivants, 0) + coalesce(cas_conf_decedes, 0));

-- Une AS ne peut être « nouvelle » qu'une fois, dans sa ZS, et pas si elle était déjà touchée à cette date
create or replace function public.trg_nouvelles_as() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if coalesce(cardinality(new.nouvelles_as), 0) = 0 then return new; end if;
  if tg_op = 'UPDATE' and new.nouvelles_as is not distinct from old.nouvelles_as then return new; end if;
  for a in select h.id, h.nom, h.zs_id, h.touchee_le from public.health_areas h where h.id = any(new.nouvelles_as) loop
    if a.zs_id <> new.zs_id then
      raise exception 'Aire de santé % : elle n''appartient pas à cette ZS', a.nom using errcode = 'P0001';
    end if;
    if a.touchee_le is not null and a.touchee_le <= new.date then
      raise exception 'Aire de santé % : déjà touchée depuis le %', a.nom, to_char(a.touchee_le, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    if exists (select 1 from public.daily_reports r where r.id <> new.id and r.zs_id = new.zs_id and a.id = any(r.nouvelles_as)) then
      raise exception 'Aire de santé % : déjà déclarée comme nouvelle AS touchée dans une autre fiche', a.nom using errcode = 'P0001';
    end if;
  end loop;
  if (select count(*) from public.health_areas h where h.id = any(new.nouvelles_as)) <> cardinality(new.nouvelles_as) then
    raise exception 'Aire de santé inconnue dans la liste des nouvelles AS' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.trg_nouvelles_as() from public, anon, authenticated;
drop trigger if exists daily_reports_nouvelles_as on public.daily_reports;
create trigger daily_reports_nouvelles_as before insert or update on public.daily_reports
  for each row execute function public.trg_nouvelles_as();

-- ---------------------------------------------------------------- Valeurs initiales par ZS (situation de référence)
alter table public.health_zones
  add column if not exists base_date                date,
  add column if not exists base_confirmes           int check (base_confirmes >= 0),
  add column if not exists base_deces               int check (base_deces >= 0),
  add column if not exists base_gueris              int check (base_gueris >= 0),
  add column if not exists base_ppl                 int check (base_ppl >= 0),
  add column if not exists base_deces_non_confirmes int check (base_deces_non_confirmes >= 0),
  add column if not exists base_valide_par          text,
  add column if not exists base_valide_le           timestamptz;
-- L'équipe de gestion des données (data manager) peut renseigner / corriger ces valeurs
drop policy if exists hz_update_dm on public.health_zones;
create policy hz_update_dm on public.health_zones for update to authenticated
  using (public.app_role() = 'data_manager') with check (public.app_role() = 'data_manager');

-- ---------------------------------------------------------------- Import de l'historique : nouveaux champs
create or replace function public.import_historique(p_rows jsonb, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; ex record; n_ins int := 0; n_rep int := 0; ignorees jsonb := '[]'::jsonb; moi uuid;
begin
  -- Admin / Team Lead / data manager connectés, ou le script de dépôt Drive (clé service, côté serveur)
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
     and (e.value->>'date')::date <= (now() at time zone public.app_tz())::date;
  get diagnostics n_rep = row_count;
  for r in select value from jsonb_array_elements(p_rows) loop
    if (r->>'date')::date > (now() at time zone public.app_tz())::date then
      ignorees := ignorees || jsonb_build_object('date', r->>'date', 'zs_id', r->>'zs_id', 'motif', 'date future');
      continue;
    end if;
    select id, source into ex from public.daily_reports where date = (r->>'date')::date and zs_id = r->>'zs_id';
    if found then
      ignorees := ignorees || jsonb_build_object('date', r->>'date', 'zs_id', r->>'zs_id', 'motif',
        case when ex.source = 'saisie' then 'fiche déjà saisie dans l''app' else 'en double dans le lot' end);
      continue;
    end if;
    n_ins := n_ins + 1;
    insert into public.daily_reports (date, zs_id, statut, rapport_nul, source, source_detail, commentaire, motifs_inv, motifs_suivi,
                                      validated_by, validated_at, alertes_validees, inv_report_entrant, inv_realisees_jour, inv_realisees_report, inv_moins_24h, narratifs_attendus, narratifs_disponibles, mappings_attendus, mappings_disponibles, ct_report, ct_identifies, ct_listes_24h, ct_listes_tardifs, ct_sortie_21j, ct_sortie_symptomatiques, ct_sortie_confirmes, ct_sortie_perdus, ct_sortie_deplaces, ct_sortie_decedes, ct_sortie_doublons, ct_vus, ct_nonvus_veille, ct_rattrapes, reco_actifs, superviseurs_reco,
                                      cas_conf_vivants, cas_conf_decedes, cas_conf_ppl, deces_parmi_confirmes, gueris, deces_non_confirmes, nouvelles_as)
    select x.date, x.zs_id, 'valide_prov', coalesce(x.rapport_nul, false), 'historique',
           left(coalesce(r->>'source_detail', p_detail), 300), x.commentaire, '{}', '{}', moi, now(), x.alertes_validees, x.inv_report_entrant, x.inv_realisees_jour, x.inv_realisees_report, x.inv_moins_24h, x.narratifs_attendus, x.narratifs_disponibles, x.mappings_attendus, x.mappings_disponibles, x.ct_report, x.ct_identifies, x.ct_listes_24h, x.ct_listes_tardifs, x.ct_sortie_21j, x.ct_sortie_symptomatiques, x.ct_sortie_confirmes, x.ct_sortie_perdus, x.ct_sortie_deplaces, x.ct_sortie_decedes, x.ct_sortie_doublons, x.ct_vus, x.ct_nonvus_veille, x.ct_rattrapes, x.reco_actifs, x.superviseurs_reco,
           x.cas_conf_vivants, x.cas_conf_decedes, x.cas_conf_ppl, x.deces_parmi_confirmes, x.gueris, x.deces_non_confirmes, coalesce(x.nouvelles_as, '{}')
    from jsonb_populate_record(null::public.daily_reports, r) x;
  end loop;
  perform set_config('survepi.import', 'off', true);
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'daily_reports', null, 'IMPORT_HISTORIQUE',
          jsonb_build_object('fichiers', p_detail, 'creees', n_ins - least(n_ins, n_rep), 'remplacees', least(n_ins, n_rep), 'ignorees', jsonb_array_length(ignorees)));
  return jsonb_build_object('creees', n_ins - least(n_ins, n_rep), 'remplacees', least(n_ins, n_rep), 'ignorees', ignorees);
end $$;
revoke all on function public.import_historique(jsonb, text) from public, anon;
grant execute on function public.import_historique(jsonb, text) to authenticated, service_role;
