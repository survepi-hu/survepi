\echo '--- V1 sources ≠ alertes du jour (attendu ERROR sources_eq_alertes_jour)'
insert into daily_reports (date, zs_id, statut, alertes_vivantes, alertes_deces, src_ess, src_communaute, src_ra, src_poe) values ('2026-11-08','pawa','brouillon', 3, 0, 1, 1, 0, 0);
\echo '--- V2 RA réalisées > planifiées (attendu ERROR ra_plan_le_planifiees)'
insert into daily_reports (date, zs_id, statut, ra_planifiees, ra_realisees_plan) values ('2026-11-08','pawa','brouillon', 2, 3);
\echo '--- V3 décès PPL ultérieurs > décès parmi confirmés (attendu ERROR deces_ppl_le_parmi)'
insert into daily_reports (date, zs_id, statut, deces_parmi_confirmes, deces_ppl) values ('2026-11-08','pawa','brouillon', 0, 1);
\echo '--- V4 fiche cohérente complète (attendu OK)'
insert into daily_reports (date, zs_id, statut, alertes_report, alertes_vivantes, alertes_deces, alertes_validees, alertes_investiguees, suspects_isoles, suspects_preleves,
  src_ess, src_communaute, src_ra, src_poe, alertes_report_final, ra_planifiees, ra_realisees_plan, ra_non_planifiees, ra_ess_detectees, ra_ess_validees, ra_ess_en_cours,
  ra_com_detectees, ra_com_verifiees, ra_com_validees, cas_conf_vivants, cas_conf_decedes, cas_conf_ppl, cas_conf_decedes_ppl, cas_par_as)
values ('2026-11-08','pawa','brouillon', 1, 3, 1, 3, 3, 3, 2, 1, 2, 1, 0, 1, 4, 4, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, '[{"as_id":"a0000000-0000-0000-0000-000000000003","n":2}]')
returning alertes_report_final, ra_non_planifiees, cas_conf_decedes_ppl, jsonb_array_length(cas_par_as) as nb_as;
\echo '--- V5 import historique : nouvelles colonnes reprises (attendu src_ra 1, ra_planifiees 2)'
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select public.import_historique('[{"date":"2026-09-12","zs_id":"pawa","alertes_vivantes":1,"src_ra":1,"src_ess":0,"src_communaute":0,"src_poe":0,"ra_planifiees":2,"ra_realisees_plan":2}]', 'test v21');
reset role;
select src_ra, ra_planifiees from daily_reports where zs_id='pawa' and date='2026-09-12';
select set_config('request.jwt.claim.role', '', false);
\echo '--- V6 verrouillage des valeurs initiales'
update health_zones set base_date = '2026-10-01', base_confirmes = 5 where id = 'pawa';
select set_config('request.jwt.claim.sub', (select user_id::text from actors where role = 'team_lead' limit 1), false);
select set_config('request.jwt.claim.role', 'authenticated', false);
\echo '    team lead corrige (attendu ERROR réservée au gestionnaire)'
update health_zones set base_confirmes = 6 where id = 'pawa';
select set_config('request.jwt.claim.sub', (select user_id::text from actors where role = 'data_manager' limit 1), false);
\echo '    data manager sans motif (attendu ERROR motif obligatoire)'
update health_zones set base_confirmes = 6 where id = 'pawa';
\echo '    data manager avec motif (attendu OK 6)'
update health_zones set base_confirmes = 6, base_motif = 'erreur de saisie' where id = 'pawa' returning base_confirmes;
\echo '    autre champ de la ZS par le team lead (attendu OK)'
select set_config('request.jwt.claim.sub', (select user_id::text from actors where role = 'team_lead' limit 1), false);
update health_zones set heure_limite = heure_limite where id = 'pawa' returning id;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', '', false);
