-- Historique : fiches antérieures à la mise en service (chiffres journaliers, rapports, outils Excel DPS).
-- Elles sont marquées source = 'historique', déjà validées (donnée officielle reconstituée), sans heure de soumission :
-- elles comptent dans les courbes et la complétude, jamais dans la promptitude.

alter table public.daily_reports
  add column if not exists source text not null default 'saisie' check (source in ('saisie','historique')),
  add column if not exists source_detail text;
-- Les motifs n'existaient pas dans les rapports d'avant : pas exigés pour l'historique (les autres contrôles restent)
alter table public.daily_reports drop constraint if exists motif_inv_si_reste;
alter table public.daily_reports add constraint motif_inv_si_reste check (statut = 'brouillon' or source = 'historique' or cardinality(motifs_inv) > 0 or
    greatest(coalesce(alertes_validees,0) - coalesce(inv_realisees_jour,0), 0)
  + greatest(coalesce(inv_report_entrant,0) - coalesce(inv_realisees_report,0), 0) = 0);
create index if not exists daily_reports_source on public.daily_reports (source) where source = 'historique';

create or replace function public.trg_daily_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  locked boolean;
  data_changed boolean;
  meta text[] := array['statut','updated_at','updated_by','validated_by','validated_at','validated_zs_by','validated_zs_at','version','submitted_at','resubmitted_at',
                       'started_at','commentaire_validation','inv_non_faites','inv_report_sortant','ct_sorties','ct_a_suivre'];
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- Import de l'historique (fonction import_historique uniquement) : fiches déjà validées, sans heure de soumission
  if current_setting('survepi.import', true) = 'on' then
    if tg_op = 'INSERT' then new.started_at := now(); new.version := 1; end if;
    return new;
  end if;
  -- Hors import, une fiche est toujours une saisie ; l'origine ne change jamais
  if tg_op = 'INSERT' then new.source := 'saisie'; new.source_detail := null;
  else new.source := old.source; new.source_detail := old.source_detail; end if;
  if tg_op = 'INSERT' then
    new.started_at := now();
    new.version := 1;
    new.submitted_at := case when new.statut in ('soumis','incomplet') then now() end;
    new.validated_by := null; new.validated_at := null; new.validated_zs_by := null; new.validated_zs_at := null;
    if new.statut not in ('brouillon','soumis','incomplet') then
      raise exception 'Une nouvelle fiche commence en brouillon ou soumise' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Horodatages : jamais fournis par le client
  new.started_at := old.started_at;
  new.submitted_at := old.submitted_at;
  new.resubmitted_at := old.resubmitted_at;
  new.validated_by := old.validated_by; new.validated_at := old.validated_at;
  new.validated_zs_by := old.validated_zs_by; new.validated_zs_at := old.validated_zs_at;
  if new.statut in ('soumis','incomplet') and old.statut in ('brouillon','a_corriger','rouvert','incomplet') then
    if old.submitted_at is null then new.submitted_at := now(); else new.resubmitted_at := now(); end if;
  end if;

  locked := old.statut in ('valide_zs','valide_prov');
  -- Les colonnes générées sont NULL dans NEW en BEFORE trigger : on les exclut de la comparaison.
  data_changed := (to_jsonb(new) - meta) is distinct from (to_jsonb(old) - meta);
  if locked and data_changed then
    raise exception 'Fiche validée : réouverture supervisée nécessaire avant modification' using errcode = 'P0001';
  end if;

  -- Workflow par rôle
  if new.statut is distinct from old.statut then
    if new.statut in ('valide_zs') and public.app_role() not in ('epidemiologiste','validateur','team_lead','admin') and auth.uid() is not null then
      raise exception 'Validation ZS réservée aux épidémiologistes superviseurs / validateurs' using errcode = '42501';
    end if;
    if new.statut in ('valide_prov','rouvert') and public.app_role() not in ('team_lead','validateur','admin','data_manager') and auth.uid() is not null then
      raise exception 'Action réservée au niveau provincial' using errcode = '42501';
    end if;
    -- Double validation : ZS puis province, par deux personnes différentes
    if new.statut = 'valide_prov' and old.statut <> 'valide_zs' then
      raise exception 'Double validation : la validation ZS doit précéder la validation province' using errcode = 'P0001';
    end if;
    if new.statut = 'valide_prov' and old.validated_zs_by = (public.current_actor()).id then
      raise exception 'Double validation : la validation province doit être faite par une autre personne que la validation ZS' using errcode = 'P0001';
    end if;
    if new.statut = 'valide_zs' then
      new.validated_zs_at := now(); new.validated_zs_by := (public.current_actor()).id;
    elsif new.statut = 'valide_prov' then
      new.validated_at := now(); new.validated_by := (public.current_actor()).id;
    elsif new.statut in ('rouvert','a_corriger') then
      new.validated_zs_by := null; new.validated_zs_at := null; new.validated_by := null; new.validated_at := null;
    end if;
    insert into public.validations (report_id, action, from_statut, to_statut, commentaire, actor_id)
    values (new.id,
            case new.statut when 'valide_zs' then 'valider_zs' when 'valide_prov' then 'valider_prov' when 'rouvert' then 'rouvrir'
                            when 'a_corriger' then 'retourner' else 'soumettre' end,
            old.statut, new.statut, new.commentaire_validation, (public.current_actor()).id);
  end if;

  if data_changed then
    new.version := old.version + 1;
    insert into public.report_versions (report_id, version, data, changed_by) values (old.id, old.version, to_jsonb(old), auth.uid());
  end if;
  return new;
end $$;

-- Import en lot. Une fiche saisie dans l'app n'est jamais écrasée ; une fiche historique est remplacée.
create or replace function public.import_historique(p_rows jsonb, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; ex record; n_ins int := 0; n_rep int := 0; ignorees jsonb := '[]'::jsonb; moi uuid;
begin
  if public.app_role() not in ('admin','team_lead','data_manager') then
    raise exception 'Import de l''historique réservé à l''administrateur, au Team Lead et au gestionnaire de données' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Liste de fiches attendue' using errcode = '22023'; end if;
  moi := (public.current_actor()).id;
  perform set_config('survepi.import', 'on', true);
  for r in select value from jsonb_array_elements(p_rows) loop
    if (r->>'date')::date > (now() at time zone public.app_tz())::date then
      ignorees := ignorees || jsonb_build_object('date', r->>'date', 'zs_id', r->>'zs_id', 'motif', 'date future');
      continue;
    end if;
    select id, source into ex from public.daily_reports where date = (r->>'date')::date and zs_id = r->>'zs_id';
    if found and ex.source = 'saisie' then
      ignorees := ignorees || jsonb_build_object('date', r->>'date', 'zs_id', r->>'zs_id', 'motif', 'fiche déjà saisie dans l''app');
      continue;
    end if;
    if found then delete from public.daily_reports where id = ex.id; n_rep := n_rep + 1; else n_ins := n_ins + 1; end if;
    insert into public.daily_reports (date, zs_id, statut, rapport_nul, source, source_detail, commentaire, motifs_inv, motifs_suivi,
                                      validated_by, validated_at, alertes_validees, inv_report_entrant, inv_realisees_jour, inv_realisees_report, inv_moins_24h, narratifs_attendus, narratifs_disponibles, mappings_attendus, mappings_disponibles, ct_report, ct_identifies, ct_listes_24h, ct_listes_tardifs, ct_sortie_21j, ct_sortie_symptomatiques, ct_sortie_confirmes, ct_sortie_perdus, ct_sortie_deplaces, ct_sortie_decedes, ct_sortie_doublons, ct_vus, ct_nonvus_veille, ct_rattrapes, reco_actifs, superviseurs_reco)
    select x.date, x.zs_id, 'valide_prov', coalesce(x.rapport_nul, false), 'historique',
           left(coalesce(r->>'source_detail', p_detail), 300), x.commentaire, '{}', '{}', moi, now(), x.alertes_validees, x.inv_report_entrant, x.inv_realisees_jour, x.inv_realisees_report, x.inv_moins_24h, x.narratifs_attendus, x.narratifs_disponibles, x.mappings_attendus, x.mappings_disponibles, x.ct_report, x.ct_identifies, x.ct_listes_24h, x.ct_listes_tardifs, x.ct_sortie_21j, x.ct_sortie_symptomatiques, x.ct_sortie_confirmes, x.ct_sortie_perdus, x.ct_sortie_deplaces, x.ct_sortie_decedes, x.ct_sortie_doublons, x.ct_vus, x.ct_nonvus_veille, x.ct_rattrapes, x.reco_actifs, x.superviseurs_reco
    from jsonb_populate_record(null::public.daily_reports, r) x;
  end loop;
  perform set_config('survepi.import', 'off', true);
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'daily_reports', null, 'IMPORT_HISTORIQUE',
          jsonb_build_object('fichiers', p_detail, 'creees', n_ins, 'remplacees', n_rep, 'ignorees', jsonb_array_length(ignorees)));
  return jsonb_build_object('creees', n_ins, 'remplacees', n_rep, 'ignorees', ignorees);
end $$;
revoke all on function public.import_historique(jsonb, text) from public;
grant execute on function public.import_historique(jsonb, text) to authenticated;

-- Retirer tout l'historique importé (les saisies ne sont jamais touchées)
create or replace function public.supprimer_historique()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.app_role() not in ('admin','team_lead') then
    raise exception 'Réservé à l''administrateur et au Team Lead' using errcode = '42501';
  end if;
  delete from public.daily_reports where source = 'historique';
  get diagnostics n = row_count;
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'daily_reports', null, 'SUPPRESSION_HISTORIQUE', jsonb_build_object('fiches', n));
  return n;
end $$;
revoke all on function public.supprimer_historique() from public;
grant execute on function public.supprimer_historique() to authenticated;
