\echo '--- S1 élèves > confirmés du jour (attendu ERROR eleves_le_confirmes)'
insert into daily_reports (date, zs_id, statut, cas_conf_vivants, cas_conf_decedes, cas_conf_eleves) values ('2026-10-21','pawa','brouillon', 1, 0, 2);
\echo '--- S2 PPL guéris > guéris (attendu ERROR gueris_ppl_le_gueris)'
insert into daily_reports (date, zs_id, statut, gueris, gueris_ppl) values ('2026-10-21','pawa','brouillon', 0, 1);
\echo '--- S3 fiche cohérente + import historique avec élèves (attendu OK, colonnes reprises)'
insert into daily_reports (date, zs_id, statut, cas_conf_vivants, cas_conf_decedes, cas_conf_eleves, deces_parmi_confirmes, deces_ppl, deces_eleves, gueris, gueris_ppl, gueris_eleves)
values ('2026-10-21','pawa','soumis', 2, 0, 1, 1, 1, 0, 2, 1, 1) returning cas_conf_eleves, deces_ppl, gueris_ppl, gueris_eleves;
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select public.import_historique('[{"date":"2026-09-11","zs_id":"pawa","cas_conf_vivants":2,"cas_conf_eleves":1,"gueris":1,"gueris_ppl":1}]', 'test sg');
reset role;
select cas_conf_eleves, gueris_ppl from daily_reports where zs_id='pawa' and date='2026-09-11';
select set_config('request.jwt.claim.role', '', false);
