-- Matrice harmonisée V2.1 (cahier des charges du 08/11/2026) :
--   1. alertes agrégées en tête de fiche, 2. recherche active, 3. sous-groupes : décès à la confirmation séparés,
--   cas par aire de santé, valeurs initiales verrouillées (motif, source), statuts des narratifs / mappings,
--   référentiel des aires de santé réservé à l'administrateur.
-- Écrite sans aucune suppression (pas de drop) : elle s'applique telle quelle par le connecteur.

-- 1. Alertes (nombres agrégés, aucun détail d'alerte)
alter table public.daily_reports
  add column if not exists alertes_report        int check (alertes_report >= 0),
  add column if not exists alertes_vivantes      int check (alertes_vivantes >= 0),
  add column if not exists alertes_deces         int check (alertes_deces >= 0),
  add column if not exists alertes_investiguees  int check (alertes_investiguees >= 0),
  add column if not exists suspects_isoles       int check (suspects_isoles >= 0),
  add column if not exists suspects_preleves     int check (suspects_preleves >= 0),
  add column if not exists src_ess               int check (src_ess >= 0),
  add column if not exists src_communaute        int check (src_communaute >= 0),
  add column if not exists src_ra                int check (src_ra >= 0),
  add column if not exists src_poe               int check (src_poe >= 0),
  add column if not exists alertes_report_final  int check (alertes_report_final >= 0),
  add column if not exists justif_report_alertes text;

-- 2. Recherche active
alter table public.daily_reports
  add column if not exists ra_planifiees            int check (ra_planifiees >= 0),
  add column if not exists ra_realisees_plan        int check (ra_realisees_plan >= 0),
  add column if not exists ra_non_planifiees        int check (ra_non_planifiees >= 0),
  add column if not exists ra_site_hgr              int check (ra_site_hgr >= 0),
  add column if not exists ra_site_ch               int check (ra_site_ch >= 0),
  add column if not exists ra_site_cm               int check (ra_site_cm >= 0),
  add column if not exists ra_site_cs               int check (ra_site_cs >= 0),
  add column if not exists ra_site_labo             int check (ra_site_labo >= 0),
  add column if not exists ra_site_ps               int check (ra_site_ps >= 0),
  add column if not exists ra_site_disp             int check (ra_site_disp >= 0),
  add column if not exists ra_site_tradi            int check (ra_site_tradi >= 0),
  add column if not exists ra_site_priere           int check (ra_site_priere >= 0),
  add column if not exists ra_site_pharma           int check (ra_site_pharma >= 0),
  add column if not exists ra_ess_dossiers          int check (ra_ess_dossiers >= 0),
  add column if not exists ra_ess_detectees         int check (ra_ess_detectees >= 0),
  add column if not exists ra_ess_validees          int check (ra_ess_validees >= 0),
  add column if not exists ra_ess_en_cours          int check (ra_ess_en_cours >= 0),
  add column if not exists ra_com_detectees         int check (ra_com_detectees >= 0),
  add column if not exists ra_com_verifiees         int check (ra_com_verifiees >= 0),
  add column if not exists ra_com_validees          int check (ra_com_validees >= 0),
  add column if not exists ra_com_deces_signales    int check (ra_com_deces_signales >= 0),
  add column if not exists ra_com_deces_investigues int check (ra_com_deces_investigues >= 0);

-- 3. Sous-groupes : nouveaux confirmés déjà décédés à la confirmation (les décès deces_* deviennent les décès
--    ultérieurs parmi les déjà confirmés ; jusqu'ici tous nuls en base, aucune reprise nécessaire)
alter table public.daily_reports
  add column if not exists cas_conf_decedes_ppl    int check (cas_conf_decedes_ppl >= 0),
  add column if not exists cas_conf_decedes_moins5 int check (cas_conf_decedes_moins5 >= 0),
  add column if not exists cas_conf_decedes_eleves int check (cas_conf_decedes_eleves >= 0),
  -- Nouveaux cas confirmés par aire de santé : [{ "as_id": uuid, "n": entier }]
  add column if not exists cas_par_as jsonb not null default '[]'::jsonb check (jsonb_typeof(cas_par_as) = 'array');

-- Contrôles en base (les mêmes que dans l'app ; ne s'appliquent que si les champs sont renseignés)
alter table public.daily_reports
  add constraint sources_eq_alertes_jour check (src_ess is null or src_communaute is null or src_ra is null or src_poe is null
    or src_ess + src_communaute + src_ra + src_poe = coalesce(alertes_vivantes, 0) + coalesce(alertes_deces, 0)),
  add constraint validees_le_alertes check (alertes_vivantes is null or alertes_validees is null
    or alertes_validees <= coalesce(alertes_report, 0) + alertes_vivantes + coalesce(alertes_deces, 0)),
  add constraint report_final_le_alertes check (alertes_report_final is null
    or alertes_report_final <= coalesce(alertes_report, 0) + coalesce(alertes_vivantes, 0) + coalesce(alertes_deces, 0)),
  add constraint preleves_le_validees check (suspects_preleves is null or alertes_validees is null or suspects_preleves <= alertes_validees),
  add constraint ra_plan_le_planifiees check (ra_realisees_plan is null or ra_realisees_plan <= coalesce(ra_planifiees, 0)),
  add constraint ra_ess_coherent check (ra_ess_detectees is null or coalesce(ra_ess_validees, 0) + coalesce(ra_ess_en_cours, 0) <= ra_ess_detectees),
  add constraint ra_com_verif_le_detect check (ra_com_verifiees is null or ra_com_verifiees <= coalesce(ra_com_detectees, 0)),
  add constraint ra_com_valid_le_verif check (ra_com_validees is null or ra_com_validees <= coalesce(ra_com_verifiees, 0)),
  add constraint ra_com_deces_coherent check (ra_com_deces_investigues is null or ra_com_deces_investigues <= coalesce(ra_com_deces_signales, 0)),
  add constraint conf_dec_ppl_coherent check (cas_conf_decedes_ppl is null or cas_conf_decedes_ppl <= least(coalesce(cas_conf_ppl, 0), coalesce(cas_conf_decedes, 0))),
  add constraint conf_dec_moins5_coherent check (cas_conf_decedes_moins5 is null or cas_conf_decedes_moins5 <= least(coalesce(cas_conf_moins5, 0), coalesce(cas_conf_decedes, 0))),
  add constraint conf_dec_eleves_coherent check (cas_conf_decedes_eleves is null or cas_conf_decedes_eleves <= least(coalesce(cas_conf_eleves, 0), coalesce(cas_conf_decedes, 0))),
  add constraint deces_ppl_le_parmi check (deces_ppl is null or deces_ppl <= coalesce(deces_parmi_confirmes, 0)),
  add constraint deces_moins5_le_parmi check (deces_moins5 is null or deces_moins5 <= coalesce(deces_parmi_confirmes, 0)),
  add constraint deces_eleves_le_parmi check (deces_eleves is null or deces_eleves <= coalesce(deces_parmi_confirmes, 0));

-- Valeurs initiales : source et motif ; après validation, correction par le data manager ou l'admin, avec motif
alter table public.health_zones
  add column if not exists base_source text,
  add column if not exists base_motif  text;

create or replace function public.trg_base_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  champs text[] := array['base_date','base_confirmes','base_deces','base_gueris','base_ppl','base_deces_ppl','base_gueris_ppl',
    'base_moins5','base_deces_moins5','base_gueris_moins5','base_eleves','base_deces_eleves','base_gueris_eleves',
    'base_deces_non_confirmes','base_valide_par','base_valide_le','base_source'];
  avant jsonb; apres jsonb; k text;
begin
  if old.base_date is null or auth.uid() is null then return new; end if;   -- 1re saisie, ou opération serveur
  avant := '{}'::jsonb; apres := '{}'::jsonb;
  foreach k in array champs loop
    avant := avant || jsonb_build_object(k, to_jsonb(old) -> k);
    apres := apres || jsonb_build_object(k, to_jsonb(new) -> k);
  end loop;
  if avant is not distinct from apres then return new; end if;
  if public.app_role() not in ('data_manager', 'admin') then
    raise exception 'Situation de référence validée : correction réservée au gestionnaire de données' using errcode = '42501';
  end if;
  if coalesce(btrim(new.base_motif), '') = '' then
    raise exception 'Correction de la situation de référence : motif obligatoire' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.trg_base_lock() from public, anon, authenticated;
create trigger health_zones_base_lock before update on public.health_zones for each row execute function public.trg_base_lock();

-- Référentiel des aires de santé : écriture réservée à l'administrateur (politiques restrictives ajoutées
-- aux permissives existantes ; la lecture ne change pas)
create policy as_insert_admin on public.health_areas as restrictive for insert to authenticated with check (public.app_role() = 'admin');
create policy as_update_admin on public.health_areas as restrictive for update to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy as_delete_admin on public.health_areas as restrictive for delete to authenticated using (public.app_role() = 'admin');

-- Narratifs / descriptifs et mappings : statut (attendu, reçu, reçu mais mal nommé, à corriger, validé)
alter table public.investigations
  add column if not exists narratif_statut text check (narratif_statut in ('non_attendu','attendu','recu','mal_nomme','a_corriger','valide')),
  add column if not exists mapping_statut  text check (mapping_statut in ('non_attendu','attendu','recu','mal_nomme','a_corriger','valide'));
