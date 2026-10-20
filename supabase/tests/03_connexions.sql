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
\echo '--- C4 IP et pays pris dans les en-têtes du serveur, ville fournie par le navigateur'
set role authenticated;
select set_config('request.headers', '{"cf-connecting-ip":"41.243.10.5","cf-ipcountry":"cd","x-forwarded-for":"41.243.10.5, 10.0.0.1"}', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.log_connexion('OUVERTURE', 'Android · Chrome (mobile)', '{"ville":"Isiro","region":"Haut-Uélé","reseau":"Vodacom"}');
select action, new_data->>'ip' ip, new_data->>'pays' pays, new_data->>'ville' ville from audit_logs where table_name='sessions' order by at desc limit 1;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select nom, dernier_lieu from public.connexions_resume() where dernier_lieu is not null;
reset role;
select public.purger_ip_connexions() as purgees_maintenant;
