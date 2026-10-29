-- Sous-groupes parmi les cas confirmés (base des cumuls MVE-17 du 29/10/2026) : en plus des moins de 5 ans,
-- les PPL (décès et guérisons, les nouveaux confirmés existaient déjà) et les élèves (confirmés, décès, guérisons).
-- Chaque sous-groupe reste un sous-ensemble du total du jour correspondant ; ils peuvent se recouper entre eux.
-- L'import de l'historique lit ses colonnes dans la table : rien à y changer.

alter table public.daily_reports
  add column if not exists cas_conf_eleves int check (cas_conf_eleves >= 0),
  add column if not exists deces_ppl       int check (deces_ppl >= 0),
  add column if not exists deces_eleves    int check (deces_eleves >= 0),
  add column if not exists gueris_ppl      int check (gueris_ppl >= 0),
  add column if not exists gueris_eleves   int check (gueris_eleves >= 0);
alter table public.daily_reports add constraint eleves_le_confirmes
  check (cas_conf_eleves is null or cas_conf_eleves <= coalesce(cas_conf_vivants, 0) + coalesce(cas_conf_decedes, 0));
alter table public.daily_reports add constraint deces_ppl_le_deces
  check (deces_ppl is null or deces_ppl <= coalesce(cas_conf_decedes, 0) + coalesce(deces_parmi_confirmes, 0));
alter table public.daily_reports add constraint deces_eleves_le_deces
  check (deces_eleves is null or deces_eleves <= coalesce(cas_conf_decedes, 0) + coalesce(deces_parmi_confirmes, 0));
alter table public.daily_reports add constraint gueris_ppl_le_gueris
  check (gueris_ppl is null or gueris_ppl <= coalesce(gueris, 0));
alter table public.daily_reports add constraint gueris_eleves_le_gueris
  check (gueris_eleves is null or gueris_eleves <= coalesce(gueris, 0));

alter table public.health_zones
  add column if not exists base_deces_ppl     int check (base_deces_ppl >= 0),
  add column if not exists base_gueris_ppl    int check (base_gueris_ppl >= 0),
  add column if not exists base_eleves        int check (base_eleves >= 0),
  add column if not exists base_deces_eleves  int check (base_deces_eleves >= 0),
  add column if not exists base_gueris_eleves int check (base_gueris_eleves >= 0);
