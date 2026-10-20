-- Pièces jointes des fiches journalières : scans et photos de la fiche papier, plusieurs par fiche.
-- Fichiers dans un espace de stockage privé (bucket « pieces-jointes »), rangés par ZS et par date :
--   pieces-jointes/<zs_id>/<date>/<uuid>.<ext>
-- Mêmes droits que les fiches : on voit ce qu'on a le droit de voir, on ajoute sur les ZS qu'on peut saisir.
-- Suppression : par la personne qui a envoyé tant que la fiche n'est pas validée, ou par l'admin / Team Lead / data manager.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pieces-jointes', 'pieces-jointes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.report_attachments (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.daily_reports(id) on delete cascade,
  zs_id        text not null references public.health_zones(id),
  date         date not null,
  path         text not null unique,
  nom          text not null,
  type         text not null,
  taille       int  not null check (taille > 0 and taille <= 10485760),
  description  text,
  uploaded_by  uuid references public.actors(id),
  uploaded_at  timestamptz not null default now(),
  check (path like zs_id || '/' || date::text || '/%')
);
create index if not exists report_attachments_report on public.report_attachments (report_id);
create index if not exists report_attachments_zs_date on public.report_attachments (zs_id, date);

-- Cohérence avec la fiche + auteur forcé côté serveur
create or replace function public.trg_report_attachments() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.daily_reports;
begin
  select * into r from public.daily_reports where id = new.report_id;
  if r.id is null or r.zs_id <> new.zs_id or r.date <> new.date then
    raise exception 'Pièce jointe : la fiche ne correspond pas (ZS / date)' using errcode = 'P0001';
  end if;
  new.uploaded_by := (public.current_actor()).id;
  new.uploaded_at := now();
  return new;
end $$;
revoke execute on function public.trg_report_attachments() from public, anon, authenticated;
drop trigger if exists report_attachments_bi on public.report_attachments;
create trigger report_attachments_bi before insert on public.report_attachments
  for each row execute function public.trg_report_attachments();
drop trigger if exists report_attachments_audit on public.report_attachments;
create trigger report_attachments_audit after insert or delete on public.report_attachments
  for each row execute function public.trg_audit();

alter table public.report_attachments enable row level security;
drop policy if exists pj_read on public.report_attachments;
create policy pj_read on public.report_attachments for select to authenticated
  using (public.is_province_level() or zs_id in (select public.app_zs_ids()));
drop policy if exists pj_insert on public.report_attachments;
create policy pj_insert on public.report_attachments for insert to authenticated
  with check (public.can_edit_zs(zs_id));
drop policy if exists pj_delete on public.report_attachments;
create policy pj_delete on public.report_attachments for delete to authenticated
  using (public.app_role() in ('admin', 'team_lead', 'data_manager')
     or (uploaded_by = (public.current_actor()).id
         and not exists (select 1 from public.daily_reports r where r.id = report_id and r.statut in ('valide_zs', 'valide_prov'))));

-- Droits sur les fichiers eux-mêmes (1er dossier du chemin = ZS)
drop policy if exists pj_objets_lecture on storage.objects;
create policy pj_objets_lecture on storage.objects for select to authenticated
  using (bucket_id = 'pieces-jointes' and (public.is_province_level() or (storage.foldername(name))[1] in (select public.app_zs_ids())));
drop policy if exists pj_objets_ajout on storage.objects;
create policy pj_objets_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'pieces-jointes' and public.can_edit_zs((storage.foldername(name))[1]));
drop policy if exists pj_objets_suppression on storage.objects;
create policy pj_objets_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'pieces-jointes' and (owner_id = auth.uid()::text or public.app_role() in ('admin', 'team_lead', 'data_manager')));
