-- Moins de 5 ans : contraintes et import historique générique
\echo '--- M1 moins de 5 ans > confirmés du jour (attendu ERROR moins5_le_confirmes)'
insert into daily_reports (date, zs_id, statut, cas_conf_vivants, cas_conf_decedes, cas_conf_moins5) values ('2026-10-20','pawa','brouillon', 1, 0, 2);
\echo '--- M2 décès < 5 ans > décès du jour (attendu ERROR deces_moins5_le_deces)'
insert into daily_reports (date, zs_id, statut, cas_conf_decedes, deces_parmi_confirmes, deces_moins5) values ('2026-10-20','pawa','brouillon', 0, 1, 2);
\echo '--- M3 fiche cohérente (attendu OK)'
insert into daily_reports (date, zs_id, statut, cas_conf_vivants, cas_conf_decedes, cas_conf_moins5, deces_parmi_confirmes, deces_moins5, gueris, gueris_moins5)
values ('2026-10-20','pawa','soumis', 2, 1, 2, 1, 1, 3, 1) returning cas_conf_moins5, deces_moins5, gueris_moins5;
\echo '--- M4 import historique avec moins de 5 ans, commentaire et motifs imposés (service)'
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select public.import_historique('[{"date":"2026-09-10","zs_id":"pawa","cas_conf_vivants":2,"cas_conf_moins5":1,"gueris":1,"gueris_moins5":1,"alertes_validees":3,"inv_realisees_jour":3,"commentaire":"SitRep 4","statut":"brouillon","version":99,"inv_non_faites":7}]', 'test m5');
reset role;
select date, statut, source, version, cas_conf_moins5, gueris_moins5, alertes_validees, inv_non_faites, commentaire, source_detail, motifs_inv, nouvelles_as
  from daily_reports where zs_id='pawa' and date='2026-09-10';
\echo '--- M5 réimport du même jour : remplacé (attendu remplacees 1)'
set role service_role;
select public.import_historique('[{"date":"2026-09-10","zs_id":"pawa","cas_conf_vivants":3,"cas_conf_moins5":2}]', 'test m5 v2');
reset role;
select cas_conf_vivants, cas_conf_moins5, alertes_validees from daily_reports where zs_id='pawa' and date='2026-09-10';
select set_config('request.jwt.claim.role', '', false);
