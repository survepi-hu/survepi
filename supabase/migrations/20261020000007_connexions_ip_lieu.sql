-- Connexions : adresse IP et lieu, pour le suivi et la sécurité des accès.
-- IP et pays viennent des en-têtes posés par le serveur (Cloudflare devant Supabase) : le navigateur ne peut pas les falsifier.
-- Ville et région : estimation à partir de l'IP, fournie par le navigateur (approximative, à titre indicatif).
-- Conservation : IP et lieu effacés du journal après 180 jours (la date, la personne et l'action restent).

drop function if exists public.tmp_entetes();          -- diagnostic du 20/10, plus utile
drop function if exists public.log_connexion(text, text);

create or replace function public.log_connexion(p_action text, p_appareil text default null, p_lieu jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  ip text := trim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for', ''), ',', 1));
begin
  if auth.uid() is null then return; end if;
  if p_action not in ('CONNEXION', 'OUVERTURE', 'DECONNEXION') then
    raise exception 'Action de connexion inconnue' using errcode = '22023';
  end if;
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'sessions', (public.current_actor()).id::text, p_action,
          jsonb_strip_nulls(jsonb_build_object(
            'appareil', left(coalesce(p_appareil, ''), 120),
            'ip', nullif(left(ip, 64), ''),
            'pays', nullif(upper(left(coalesce(h->>'cf-ipcountry', ''), 2)), ''),
            'ville', nullif(left(coalesce(p_lieu->>'ville', ''), 80), ''),
            'region', nullif(left(coalesce(p_lieu->>'region', ''), 80), ''),
            'reseau', nullif(left(coalesce(p_lieu->>'reseau', ''), 80), ''))));
end $$;
revoke execute on function public.log_connexion(text, text, jsonb) from public, anon;
grant execute on function public.log_connexion(text, text, jsonb) to authenticated;

-- Synthèse : + dernière IP et dernier lieu connus
drop function if exists public.connexions_resume();
create or replace function public.connexions_resume()
returns table (actor_id uuid, nom text, role text, email text, actif boolean, a_un_compte boolean,
               derniere_connexion timestamptz, derniere_activite timestamptz, sessions_ouvertes int,
               connexions_30j int, compte_cree timestamptz, dernier_lieu jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'team_lead') then
    raise exception 'Réservé à l''administrateur et au Team Lead' using errcode = '42501';
  end if;
  return query
  select a.id, a.nom, a.role, a.email, a.actif, a.user_id is not null,
         greatest(u.last_sign_in_at, (select max(l.at) from public.audit_logs l where l.table_name = 'sessions' and l.user_id = a.user_id and l.action = 'CONNEXION')),
         greatest((select max(coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at)) from auth.sessions s where s.user_id = a.user_id),
                  (select max(l.at) from public.audit_logs l where l.table_name = 'sessions' and l.user_id = a.user_id)),
         (select count(*)::int from auth.sessions s where s.user_id = a.user_id and (s.not_after is null or s.not_after > now())),
         (select count(*)::int from public.audit_logs l where l.table_name = 'sessions' and l.user_id = a.user_id
            and l.action in ('CONNEXION', 'OUVERTURE') and l.at > now() - interval '30 days'),
         u.created_at,
         coalesce((select l.new_data - 'appareil' from public.audit_logs l where l.table_name = 'sessions' and l.user_id = a.user_id and l.new_data ? 'ip' order by l.at desc limit 1),
                  (select jsonb_build_object('ip', host(s.ip)) from auth.sessions s where s.user_id = a.user_id and s.ip is not null order by s.created_at desc limit 1))
  from public.actors a left join auth.users u on u.id = a.user_id
  order by 7 desc nulls last, a.nom;
end $$;
revoke execute on function public.connexions_resume() from public, anon;
grant execute on function public.connexions_resume() to authenticated;

-- Pays considérés comme habituels (les autres sont signalés dans la page Connexions)
insert into public.settings (key, value) values ('pays_habituels', '["CD"]') on conflict (key) do nothing;

-- Purge : IP et lieu retirés après 180 jours, chaque nuit à 02:15 UTC
create or replace function public.purger_ip_connexions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.audit_logs set new_data = new_data - 'ip' - 'ville' - 'region' - 'reseau'
  where table_name = 'sessions' and at < now() - interval '180 days' and (new_data ? 'ip' or new_data ? 'ville');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purger_ip_connexions() from public, anon, authenticated;
do $$ begin
  perform cron.unschedule('purge-ip-connexions') where exists (select 1 from cron.job where jobname = 'purge-ip-connexions');
  perform cron.schedule('purge-ip-connexions', '15 2 * * *', 'select public.purger_ip_connexions()');
exception when undefined_table or invalid_schema_name or undefined_function then
  raise notice 'pg_cron absent : purge à lancer à la main (select public.purger_ip_connexions())';
end $$;
