-- Recette base de données : contraintes, workflow, horodatage, RLS, audit.
\set ON_ERROR_STOP 0
\pset footer off
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.actors (id, user_id, nom, fonction, role) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Rapporteur Isiro', 'Data', 'rapporteur');
update public.actors set user_id = '00000000-0000-0000-0000-00000000000b' where role = 'validateur';
update public.health_zones set rapporteur_id = '10000000-0000-0000-0000-000000000001' where id = 'isiro';

-- === En tant que rapporteur d'Isiro
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select 'role' t, public.app_role();

\echo '--- T1 fiche valide, horodatage client ignoré'
insert into daily_reports (date, zs_id, alertes_validees, inv_report_entrant, inv_realisees_jour, inv_realisees_report, motifs_inv,
  ct_report, ct_identifies, ct_listes_24h, ct_vus, statut, submitted_at)
values ('2026-10-15','isiro', 10, 5, 8, 3, '{carburant}', 100, 35, 32, 120, 'soumis', '2000-01-01');
select zs_id, statut, inv_report_sortant, ct_a_suivre, submitted_at > now() - interval '1 minute' as horodatage_serveur from daily_reports;

\echo '--- T2 doublon Date x ZS refusé (attendu: ERROR unique)'
insert into daily_reports (date, zs_id) values ('2026-10-15','isiro');
\echo '--- T3 Ij > A refusé (attendu: ERROR ij_le_a)'
insert into daily_reports (date, zs_id, alertes_validees, inv_realisees_jour) values ('2026-10-16','isiro', 3, 4);
\echo '--- T4 vus > à suivre refusé (attendu: ERROR vus_le_a_suivre)'
insert into daily_reports (date, zs_id, ct_report, ct_vus) values ('2026-10-16','isiro', 5, 6);
\echo '--- T5 soumis sans motif alors que reste non fait (attendu: ERROR motif_inv_si_reste)'
insert into daily_reports (date, zs_id, alertes_validees, inv_realisees_jour, statut) values ('2026-10-16','isiro', 4, 2, 'soumis');
\echo '--- T6 ZS non affectée refusée (attendu: ERROR row-level security)'
insert into daily_reports (date, zs_id) values ('2026-10-15','wamba');
\echo '--- T7 rapporteur ne peut pas valider (attendu: ERROR Validation ZS réservée)'
update daily_reports set statut = 'valide_zs' where zs_id = 'isiro';
\echo '--- T8 prefill veille'
select * from prefill_report('2026-10-16','isiro');

-- === En tant que validateur (Dr Amosi)
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
\echo '--- T9 validateur valide'
update daily_reports set statut = 'valide_zs' where zs_id = 'isiro';
select statut, validated_zs_by is not null as valide_zs_par, version from daily_reports;
\echo '--- T10 modification après validation refusée (attendu: ERROR Fiche validée)'
update daily_reports set ct_vus = 10 where zs_id = 'isiro';
\echo '--- T11 réouverture puis correction tracée'
update daily_reports set statut = 'rouvert' where zs_id = 'isiro';
update daily_reports set ct_vus = 110 where zs_id = 'isiro';
select statut, ct_vus, version, (select count(*) from report_versions) as versions, (select string_agg(action, ',' order by id) from validations) as workflow from daily_reports;
\echo '--- T12 vue export'
select zs_nom, zs_categorie, semaine_epi, taux_inv, taux_listage, taux_suivi, ct_non_vus, a_temps from v_reports;
\echo '--- T13 report investigation incomplet refusé (attendu: ERROR report_complet)'
insert into investigations (code, date_ref, zs_id, statut) values ('INV-ISI-0001', '2026-10-15', 'isiro', 'reportee');
\echo '--- T14 contact : J1/J21 et listage 24 h calculés'
insert into contacts (code, zs_id, date_exposition, date_identification, date_listage) values ('CT-ISI-0001','isiro','2026-10-10','2026-10-14 10:00+02','2026-10-15 09:00+02');
select code, j1, j21, liste_24h from contacts;
\echo '--- T15 suppression impossible (0 ligne)'
delete from daily_reports;
select count(*) as fiches_restantes from daily_reports;
\echo '--- T16 audit lisible seulement admin/TL (validateur: 0)'
select count(*) from audit_logs;
reset role;
select table_name, action, count(*) from audit_logs group by 1,2 order by 1,2;

\echo '--- T17 double validation'
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000c');
update public.actors set user_id = '00000000-0000-0000-0000-00000000000c' where role = 'team_lead';
insert into daily_reports (date, zs_id, alertes_validees, inv_report_entrant, inv_realisees_jour, inv_realisees_report, ct_report, ct_vus, statut)
values ('2026-10-16','isiro', 2, 0, 2, 0, 0, 0, 'soumis');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
\echo '   province directement depuis soumis (attendu: ERROR la validation ZS doit précéder)'
update daily_reports set statut = 'valide_prov' where date = '2026-10-16';
update daily_reports set statut = 'valide_zs' where date = '2026-10-16';
\echo '   même personne en province (attendu: ERROR autre personne)'
update daily_reports set statut = 'valide_prov' where date = '2026-10-16';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
update daily_reports set statut = 'valide_prov' where date = '2026-10-16';
select statut, validated_zs_by is not null as v1, validated_by is not null as v2, validated_zs_by <> validated_by as deux_personnes from daily_reports where date = '2026-10-16';
