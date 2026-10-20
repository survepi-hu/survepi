-- Recette : import de l'historique
\set ON_ERROR_STOP 0
\pset footer off
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000ad') on conflict do nothing;
insert into public.actors (id, user_id, nom, fonction, role) values ('10000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000ad', 'Admin test', 'SAV', 'admin') on conflict do nothing;
set role authenticated;

\echo '--- H1 rapporteur : import refusé (attendu: ERROR réservé)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.import_historique('[{"date":"2026-09-01","zs_id":"isiro","alertes_validees":3}]');

\echo '--- H2 admin : 3 fiches dont une sur une date déjà saisie (ignorée) et une future (ignorée)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select public.import_historique('[
 {"date":"2026-09-01","zs_id":"isiro","alertes_validees":5,"inv_report_entrant":0,"inv_realisees_jour":3,"inv_realisees_report":0,"ct_report":0,"ct_identifies":10,"ct_listes_24h":10,"ct_vus":8,"reco_actifs":4},
 {"date":"2026-09-02","zs_id":"isiro","alertes_validees":2,"inv_report_entrant":2,"inv_realisees_jour":2,"inv_realisees_report":1,"ct_report":10,"ct_identifies":0,"ct_listes_24h":0,"ct_vus":10,"reco_actifs":4},
 {"date":"2026-10-15","zs_id":"isiro","alertes_validees":1},
 {"date":"2099-01-01","zs_id":"isiro","alertes_validees":1}
]', 'test.xlsx') as resultat;
select date, statut, source, source_detail, submitted_at is null as sans_heure, validated_by is not null as valide, inv_report_sortant, ct_a_suivre
from daily_reports where source = 'historique' order by date;

\echo '--- H3 réimport : la fiche historique est remplacée, pas doublée'
select public.import_historique('[{"date":"2026-09-01","zs_id":"isiro","alertes_validees":6,"inv_report_entrant":0,"inv_realisees_jour":6,"inv_realisees_report":0}]', 'v2.xlsx');
select count(*) as fiches_0109, max(alertes_validees) as a from daily_reports where date = '2026-09-01';

\echo '--- H4 incohérence (Ij > A) refusée par la base (attendu: ERROR ij_le_a)'
select public.import_historique('[{"date":"2026-09-03","zs_id":"isiro","alertes_validees":1,"inv_realisees_jour":4}]');

\echo '--- H5 une saisie normale ne peut pas se déclarer historique'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into daily_reports (date, zs_id, source, statut) values ('2026-10-17','isiro','historique','brouillon');
select date, source from daily_reports where date = '2026-10-17';

\echo '--- H6 suppression de tout l''historique (admin)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select public.supprimer_historique() as supprimees;
select count(*) filter (where source='historique') as hist_restantes, count(*) filter (where source='saisie') as saisies from daily_reports;
reset role;
