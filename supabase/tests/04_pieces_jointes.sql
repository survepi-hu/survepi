\set ON_ERROR_STOP 0
\pset footer off
-- Fiche d'Isiro (T1 de la recette) : le rapporteur d'Isiro joint ; un autre ne voit rien
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
\echo '--- P1 ajout fichier + ligne par le rapporteur (attendu : OK)'
insert into storage.objects (bucket_id, name, owner_id) values ('pieces-jointes', 'isiro/2026-10-15/a.jpg', '00000000-0000-0000-0000-00000000000a');
insert into public.report_attachments (report_id, zs_id, date, path, nom, type, taille)
select id, zs_id, date, 'isiro/2026-10-15/a.jpg', 'fiche.jpg', 'image/jpeg', 120000 from daily_reports where zs_id='isiro' and date='2026-10-15';
select nom, uploaded_by is not null as auteur from report_attachments;
\echo '--- P2 fichier sur une autre ZS (attendu : ERROR row-level security)'
insert into storage.objects (bucket_id, name, owner_id) values ('pieces-jointes', 'wamba/2026-10-15/b.jpg', '00000000-0000-0000-0000-00000000000a');
\echo '--- P3 chemin incohérent avec la fiche (attendu : ERROR check)'
insert into public.report_attachments (report_id, zs_id, date, path, nom, type, taille)
select id, zs_id, date, 'isiro/2026-01-01/x.jpg', 'x.jpg', 'image/jpeg', 10 from daily_reports where zs_id='isiro' and date='2026-10-15';
\echo '--- P4 le validateur (province) voit la pièce jointe et le fichier'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select count(*) as pj_vues from report_attachments;
select count(*) as fichiers_vus from storage.objects where bucket_id = 'pieces-jointes';
\echo '--- P5 suppression par l''auteur sur fiche validée refusée (0 ligne)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select statut from daily_reports where zs_id='isiro' and date='2026-10-15';
delete from report_attachments returning id;
reset role;
