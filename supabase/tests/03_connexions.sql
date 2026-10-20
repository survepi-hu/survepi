\set ON_ERROR_STOP 0
\pset footer off
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000ad') on conflict do nothing;
insert into public.actors (id, user_id, nom, fonction, role) values ('10000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000ad', 'Admin test', 'SAV', 'admin') on conflict do nothing;
update auth.users set last_sign_in_at = now() - interval '2 hours' where id = '00000000-0000-0000-0000-00000000000a';
insert into auth.sessions (user_id, refreshed_at) values ('00000000-0000-0000-0000-00000000000a', (now() - interval '5 minutes') at time zone 'UTC');
set role authenticated;
\echo '--- C1 le rapporteur journalise sa connexion, mais ne voit pas la synthèse'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.log_connexion('CONNEXION', 'Android · Chrome');
select public.log_connexion('PIRATAGE', 'x');
select count(*) from public.connexions_resume();
\echo '--- C2 admin : synthèse'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select nom, a_un_compte, derniere_connexion is not null as connecte, derniere_activite > now() - interval '10 minutes' as actif_recent, sessions_ouvertes, connexions_30j
from public.connexions_resume() where a_un_compte;
select action, new_data->>'appareil' as appareil, row_id is not null as acteur from audit_logs where table_name = 'sessions';
reset role;
set role anon;
\echo '--- C3 anonyme refusé'
select public.log_connexion('CONNEXION', 'x');
reset role;
