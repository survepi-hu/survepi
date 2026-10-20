-- Suivi des connexions : qui se connecte, quand, depuis quel appareil.
-- Le journal de connexion d'origine de Supabase Auth n'est plus écrit en base : l'app inscrit elle-même
-- chaque connexion / ouverture / déconnexion dans audit_logs (table_name = 'sessions'), et la synthèse
-- croise ce journal avec auth.users (dernière connexion) et auth.sessions (sessions ouvertes).

create or replace function public.log_connexion(p_action text, p_appareil text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_action not in ('CONNEXION', 'OUVERTURE', 'DECONNEXION') then
    raise exception 'Action de connexion inconnue' using errcode = '22023';
  end if;
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'sessions', (public.current_actor()).id::text, p_action,
          jsonb_build_object('appareil', left(coalesce(p_appareil, ''), 120)));
end $$;
revoke execute on function public.log_connexion(text, text) from public, anon;
grant execute on function public.log_connexion(text, text) to authenticated;

-- Synthèse par acteur (administrateur et Team Lead uniquement)
create or replace function public.connexions_resume()
returns table (actor_id uuid, nom text, role text, email text, actif boolean, a_un_compte boolean,
               derniere_connexion timestamptz, derniere_activite timestamptz, sessions_ouvertes int,
               connexions_30j int, compte_cree timestamptz)
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
         u.created_at
  from public.actors a left join auth.users u on u.id = a.user_id
  order by 7 desc nulls last, a.nom;
end $$;
revoke execute on function public.connexions_resume() from public, anon;
grant execute on function public.connexions_resume() to authenticated;

create index if not exists audit_logs_sessions on public.audit_logs (at desc) where table_name = 'sessions';
