-- Import automatique depuis le dossier Drive « SurvEpi - Dépôt historique » (script Apps Script, clé service).
-- La fonction d'import accepte aussi l'appel serveur (rôle service_role), avec les mêmes règles :
-- jamais d'écrasement d'une fiche saisie, contrôles de cohérence de la table.

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
revoke all on function public.import_historique(jsonb, text) from public, anon;
grant execute on function public.import_historique(jsonb, text) to authenticated, service_role;
