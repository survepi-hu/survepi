\set ON_ERROR_STOP 0
\pset footer off
reset role;
insert into public.health_areas (id, zs_id, nom, touchee_le) values
 ('a0000000-0000-0000-0000-000000000001', 'isiro', 'Kele', '2026-09-01'),
 ('a0000000-0000-0000-0000-000000000002', 'isiro', 'Mendambo', null),
 ('a0000000-0000-0000-0000-000000000003', 'wamba', 'Bafwabaka', null);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
\echo '--- E1 fiche avec événements du jour et une nouvelle AS (attendu OK)'
insert into daily_reports (date, zs_id, statut, cas_conf_vivants, cas_conf_decedes, cas_conf_ppl, deces_parmi_confirmes, gueris, nouvelles_as)
values ('2026-10-10','isiro','brouillon', 2, 1, 1, 0, 3, '{a0000000-0000-0000-0000-000000000002}');
select date, cas_conf_vivants + cas_conf_decedes as total, nouvelles_as from daily_reports where date='2026-10-10';
\echo '--- E2 PPL > confirmés du jour (attendu ERROR ppl_le_confirmes)'
insert into daily_reports (date, zs_id, statut, cas_conf_vivants, cas_conf_decedes, cas_conf_ppl) values ('2026-10-11','isiro','brouillon', 1, 0, 2);
\echo '--- E3 AS déjà touchée avant la mise en service (attendu ERROR déjà touchée)'
insert into daily_reports (date, zs_id, statut, nouvelles_as) values ('2026-10-11','isiro','brouillon','{a0000000-0000-0000-0000-000000000001}');
\echo '--- E4 même AS déclarée nouvelle une 2e fois (attendu ERROR autre fiche)'
insert into daily_reports (date, zs_id, statut, nouvelles_as) values ('2026-10-12','isiro','brouillon','{a0000000-0000-0000-0000-000000000002}');
\echo '--- E5 AS d''une autre ZS (attendu ERROR n''appartient pas)'
insert into daily_reports (date, zs_id, statut, nouvelles_as) values ('2026-10-13','isiro','brouillon','{a0000000-0000-0000-0000-000000000003}');
\echo '--- E6 le rapporteur ne peut pas modifier la liste des AS ni les valeurs initiales (0 ligne)'
update health_areas set nom = 'X' returning id;
update health_zones set base_confirmes = 99 where id = 'isiro' returning id;
\echo '--- E7 le data manager renseigne les valeurs initiales'
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000dd') on conflict do nothing;
insert into public.actors (id, user_id, nom, fonction, role) values ('10000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000dd', 'DM test', 'Data', 'data_manager') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000dd', false);
update health_zones set base_date = '2026-09-30', base_confirmes = 12, base_deces = 4, base_gueris = 5 where id = 'isiro' returning id, base_confirmes;
\echo '--- E8 import historique avec champs épidémio et AS (service)'
reset role;
set role service_role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', 'service_role', false);
select public.import_historique('[{"date":"2026-09-20","zs_id":"wamba","cas_conf_vivants":3,"cas_conf_decedes":0,"cas_conf_ppl":0,"gueris":0,"nouvelles_as":["a0000000-0000-0000-0000-000000000003"]}]', 'test');
reset role;
select date, cas_conf_vivants, nouvelles_as from daily_reports where zs_id='wamba' and date='2026-09-20';
\echo '--- E9 réimport : l AS passe du 20/09 au 18/09 (attendu : remplacees 1, creees 1)'
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select public.import_historique('[{"date":"2026-09-18","zs_id":"wamba","cas_conf_vivants":1,"nouvelles_as":["a0000000-0000-0000-0000-000000000003"]},{"date":"2026-09-20","zs_id":"wamba","cas_conf_vivants":2,"nouvelles_as":[]}]', 'test2');
reset role;
select date, cas_conf_vivants, nouvelles_as from daily_reports where zs_id='wamba' and source='historique' order by date;
select set_config('request.jwt.claim.role', '', false);
