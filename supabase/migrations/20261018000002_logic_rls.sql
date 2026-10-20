-- Logique serveur : horodatage, verrouillage, versions, workflow, audit, vues, droits (RLS).

-- ---------------------------------------------------------------- Identité courante
create or replace function public.current_actor() returns public.actors
language sql stable security definer set search_path = public as $$
  select a.* from public.actors a where a.user_id = auth.uid() and a.actif limit 1
$$;

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.actors where user_id = auth.uid() and actif limit 1), 'aucun')
$$;

-- ZS visibles/éditables : affectations + ZS dont l'acteur est rapporteur ou suppléant
create or replace function public.app_zs_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select s.zs_id from public.assignments s join public.actors a on a.id = s.actor_id where a.user_id = auth.uid()
  union
  select z.id from public.health_zones z join public.actors a on a.id in (z.rapporteur_id, z.suppleant_id) where a.user_id = auth.uid()
$$;

create or replace function public.is_province_level() returns boolean
language sql stable as $$ select public.app_role() in ('team_lead','validateur','coordination','admin','data_manager') $$;

create or replace function public.can_edit_zs(z text) returns boolean
language sql stable as $$
  select public.app_role() in ('team_lead','validateur','admin','data_manager')
      or (public.app_role() in ('rapporteur','epidemiologiste','dos') and z in (select public.app_zs_ids()))
$$;

-- ---------------------------------------------------------------- Paramètre (lecture)
create or replace function public.setting(k text) returns jsonb
language sql stable security definer set search_path = public as $$ select value from public.settings where key = k $$;

-- ---------------------------------------------------------------- Catégorie ZS effective
create or replace function public.zs_categorie(z public.health_zones, d date default (now() at time zone 'Africa/Lubumbashi')::date)
returns text language sql stable as $$
  select case
    when z.date_premier_cas is null then coalesce(z.categorie_manuelle, 'preparation')
    when z.date_premier_cas > d then 'preparation'
    when d - coalesce(z.date_dernier_cas, z.date_premier_cas) >= coalesce((public.setting('jours_post_flambee'))::int, 42) then 'post_flambee'
    else 'touchee' end
$$;

create or replace view public.v_health_zones with (security_invoker = true) as
select z.*, public.zs_categorie(z) as categorie,
       ((now() at time zone 'Africa/Lubumbashi')::date - coalesce(z.date_dernier_cas, z.date_premier_cas)) as jours_sans_cas
from public.health_zones z;

-- ---------------------------------------------------------------- Pré-remplissage (reports de la veille)
create or replace function public.prefill_report(p_date date, p_zs text)
returns table (inv_report_entrant int, ct_report int, ct_nonvus_veille int)
language sql stable as $$
  select coalesce(r.inv_report_sortant, 0),
         coalesce(r.ct_a_suivre, 0),
         coalesce(greatest(r.ct_a_suivre - coalesce(r.ct_vus,0), 0), 0)
  from (select 1) x left join public.daily_reports r on r.zs_id = p_zs and r.date = p_date - 1
$$;

-- ---------------------------------------------------------------- Trigger fiche journalière
create or replace function public.trg_daily_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  locked boolean;
  data_changed boolean;
  meta text[] := array['statut','updated_at','updated_by','validated_by','validated_at','validated_zs_by','validated_zs_at','version','submitted_at','resubmitted_at',
                       'started_at','commentaire_validation','inv_non_faites','inv_report_sortant','ct_sorties','ct_a_suivre'];
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.started_at := now();
    new.version := 1;
    new.submitted_at := case when new.statut in ('soumis','incomplet') then now() end;
    new.validated_by := null; new.validated_at := null; new.validated_zs_by := null; new.validated_zs_at := null;
    if new.statut not in ('brouillon','soumis','incomplet') then
      raise exception 'Une nouvelle fiche commence en brouillon ou soumise' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Horodatages : jamais fournis par le client
  new.started_at := old.started_at;
  new.submitted_at := old.submitted_at;
  new.resubmitted_at := old.resubmitted_at;
  new.validated_by := old.validated_by; new.validated_at := old.validated_at;
  new.validated_zs_by := old.validated_zs_by; new.validated_zs_at := old.validated_zs_at;
  if new.statut in ('soumis','incomplet') and old.statut in ('brouillon','a_corriger','rouvert','incomplet') then
    if old.submitted_at is null then new.submitted_at := now(); else new.resubmitted_at := now(); end if;
  end if;

  locked := old.statut in ('valide_zs','valide_prov');
  -- Les colonnes générées sont NULL dans NEW en BEFORE trigger : on les exclut de la comparaison.
  data_changed := (to_jsonb(new) - meta) is distinct from (to_jsonb(old) - meta);
  if locked and data_changed then
    raise exception 'Fiche validée : réouverture supervisée nécessaire avant modification' using errcode = 'P0001';
  end if;

  -- Workflow par rôle
  if new.statut is distinct from old.statut then
    if new.statut in ('valide_zs') and public.app_role() not in ('epidemiologiste','validateur','team_lead','admin') and auth.uid() is not null then
      raise exception 'Validation ZS réservée aux épidémiologistes superviseurs / validateurs' using errcode = '42501';
    end if;
    if new.statut in ('valide_prov','rouvert') and public.app_role() not in ('team_lead','validateur','admin','data_manager') and auth.uid() is not null then
      raise exception 'Action réservée au niveau provincial' using errcode = '42501';
    end if;
    -- Double validation : ZS puis province, par deux personnes différentes
    if new.statut = 'valide_prov' and old.statut <> 'valide_zs' then
      raise exception 'Double validation : la validation ZS doit précéder la validation province' using errcode = 'P0001';
    end if;
    if new.statut = 'valide_prov' and old.validated_zs_by = (public.current_actor()).id then
      raise exception 'Double validation : la validation province doit être faite par une autre personne que la validation ZS' using errcode = 'P0001';
    end if;
    if new.statut = 'valide_zs' then
      new.validated_zs_at := now(); new.validated_zs_by := (public.current_actor()).id;
    elsif new.statut = 'valide_prov' then
      new.validated_at := now(); new.validated_by := (public.current_actor()).id;
    elsif new.statut in ('rouvert','a_corriger') then
      new.validated_zs_by := null; new.validated_zs_at := null; new.validated_by := null; new.validated_at := null;
    end if;
    insert into public.validations (report_id, action, from_statut, to_statut, commentaire, actor_id)
    values (new.id,
            case new.statut when 'valide_zs' then 'valider_zs' when 'valide_prov' then 'valider_prov' when 'rouvert' then 'rouvrir'
                            when 'a_corriger' then 'retourner' else 'soumettre' end,
            old.statut, new.statut, new.commentaire_validation, (public.current_actor()).id);
  end if;

  if data_changed then
    new.version := old.version + 1;
    insert into public.report_versions (report_id, version, data, changed_by) values (old.id, old.version, to_jsonb(old), auth.uid());
  end if;
  return new;
end $$;

create trigger daily_reports_biu before insert or update on public.daily_reports
for each row execute function public.trg_daily_reports();

-- ---------------------------------------------------------------- Investigation clôturée : réouverture supervisée
create or replace function public.trg_investigations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and old.statut = 'cloturee' and public.app_role() not in ('epidemiologiste','validateur','team_lead','admin','data_manager') and auth.uid() is not null then
    raise exception 'Investigation clôturée : réouverture supervisée' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger investigations_bu before insert or update on public.investigations
for each row execute function public.trg_investigations();

create or replace function public.trg_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger contacts_bu before update on public.contacts for each row execute function public.trg_touch();

-- ---------------------------------------------------------------- Audit (non modifiable par les utilisateurs)
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (user_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'key'),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','actors','health_zones','assignments','daily_reports','investigations','contacts','contact_followups','deferrals']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.trg_audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Vues d'export
create or replace view public.v_reports with (security_invoker = true) as
select r.*,
  z.nom as zs_nom,
  public.zs_categorie(z, r.date) as zs_categorie,
  to_char(r.date, 'IYYY-"S"IW') as semaine_epi,
  case when r.alertes_validees > 0 then round(100.0 * r.inv_realisees_jour / r.alertes_validees, 1) end as taux_inv,
  case when r.ct_identifies > 0 then round(100.0 * r.ct_listes_24h / r.ct_identifies, 1) end as taux_listage,
  case when r.ct_a_suivre > 0 then round(100.0 * r.ct_vus / r.ct_a_suivre, 1) end as taux_suivi,
  greatest(r.ct_a_suivre - coalesce(r.ct_vus,0), 0) as ct_non_vus,
  case when r.submitted_at is null then null
       else (r.submitted_at at time zone 'Africa/Lubumbashi') <=
            (r.date + coalesce(z.heure_limite, (public.setting('heure_limite')#>>'{}')::time)) end as a_temps
from public.daily_reports r join public.health_zones z on z.id = r.zs_id;

-- ---------------------------------------------------------------- RLS
alter table public.settings          enable row level security;
alter table public.actors            enable row level security;
alter table public.health_zones      enable row level security;
alter table public.assignments       enable row level security;
alter table public.daily_reports     enable row level security;
alter table public.report_versions   enable row level security;
alter table public.validations       enable row level security;
alter table public.investigations    enable row level security;
alter table public.contacts          enable row level security;
alter table public.contact_followups enable row level security;
alter table public.deferrals         enable row level security;
alter table public.notifications     enable row level security;
alter table public.audit_logs        enable row level security;

-- Référentiels : lecture pour tout compte actif, écriture admin
create policy ref_read on public.settings     for select to authenticated using (public.app_role() <> 'aucun');
create policy ref_read on public.health_zones for select to authenticated using (public.app_role() <> 'aucun');
create policy ref_read on public.assignments  for select to authenticated using (public.app_role() <> 'aucun');
create policy ref_read on public.actors       for select to authenticated using (public.app_role() <> 'aucun');
create policy ref_admin on public.settings     for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy ref_admin on public.health_zones for all to authenticated using (public.app_role() in ('admin','team_lead')) with check (public.app_role() in ('admin','team_lead'));
create policy ref_admin on public.assignments  for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy ref_admin on public.actors       for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Données opérationnelles : province = tout ; ZS = ses ZS (moindre privilège)
create policy rep_read on public.daily_reports for select to authenticated
  using (public.is_province_level() or zs_id in (select public.app_zs_ids()));
create policy rep_insert on public.daily_reports for insert to authenticated
  with check (public.can_edit_zs(zs_id));
create policy rep_update on public.daily_reports for update to authenticated
  using (public.can_edit_zs(zs_id)) with check (public.can_edit_zs(zs_id));
-- aucune policy DELETE : la suppression physique est interdite

create policy ver_read on public.report_versions for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = report_id));
create policy val_read on public.validations for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = report_id));

do $$
declare t text;
begin
  foreach t in array array['investigations','contacts','deferrals']
  loop
    execute format('create policy reg_read on public.%I for select to authenticated using (public.is_province_level() or zs_id in (select public.app_zs_ids()))', t);
    execute format('create policy reg_insert on public.%I for insert to authenticated with check (public.can_edit_zs(zs_id))', t);
    execute format('create policy reg_update on public.%I for update to authenticated using (public.can_edit_zs(zs_id)) with check (public.can_edit_zs(zs_id))', t);
  end loop;
end $$;

create policy fu_read on public.contact_followups for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));
create policy fu_write on public.contact_followups for insert to authenticated
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_zs(c.zs_id)));
create policy fu_update on public.contact_followups for update to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.can_edit_zs(c.zs_id)));

-- Notifications : chacun voit les siennes, la province voit tout ; écriture par le service (fonction de rappels)
create policy notif_read on public.notifications for select to authenticated
  using (public.is_province_level() or destinataire_id = (public.current_actor()).id::text or zs_id in (select public.app_zs_ids()));
create policy notif_ack on public.notifications for update to authenticated
  using (destinataire_id = (public.current_actor()).id::text) with check (statut = 'lu');
-- Envoi manuel des WhatsApp : l'opérateur (data manager, Team Lead, validateur, admin) marque « envoyé »
create policy notif_manual on public.notifications for update to authenticated
  using (mode = 'manuel' and public.app_role() in ('data_manager','team_lead','validateur','admin'))
  with check (mode = 'manuel' and statut in ('a_envoyer','envoye','echec'));

-- Audit : lecture admin / Team Lead uniquement, aucune écriture possible par les utilisateurs
create policy audit_read on public.audit_logs for select to authenticated
  using (public.app_role() in ('admin','team_lead'));

-- Traçabilité des exports et téléchargements (appelée par le front)
create or replace function public.log_event(p_action text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (user_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'exports', null, left(p_action, 60), p_details)
$$;
grant execute on function public.log_event(text, jsonb) to authenticated;
