-- SurvEpi Haut-Uélé : Investigations & Suivi des contacts (Riposte MVE-17)
-- Schéma relationnel. Les règles bloquantes du cahier des charges sont portées par
-- des contraintes CHECK : la base refuse une fiche incohérente, quel que soit le client.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Paramètres
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------- Acteurs
create table public.actors (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete set null,
  nom            text not null,
  fonction       text not null,
  organisation   text,
  role           text not null check (role in ('rapporteur','epidemiologiste','data_manager','team_lead','validateur','dos','mcz','coordination','admin')),
  whatsapp       text,
  sms            text,
  email          text,
  canal_prefere  text not null default 'whatsapp' check (canal_prefere in ('whatsapp','sms','email','in_app')),
  dispo_debut    time default '07:00',
  dispo_fin      time default '19:00',
  statut         text not null default 'actif' check (statut in ('actif','conge','rotation')),
  date_debut     date,
  date_fin       date,
  actif          boolean not null default true,  -- désactivation sans suppression
  created_at     timestamptz not null default now(),
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);

-- ---------------------------------------------------------------- Zones de santé
create table public.health_zones (
  id                 text primary key,               -- slug stable, ex. 'isiro'
  code_dhis2         text unique,
  nom                text not null unique,
  categorie_manuelle text check (categorie_manuelle in ('touchee','preparation','post_flambee')),
  hotspot            boolean not null default false,
  date_premier_cas   date,                           -- bascule auto en « touchée »
  date_dernier_cas   date,                           -- post-flambée après 42 j sans cas
  as_total           int check (as_total >= 0),
  as_affectees       int check (as_affectees >= 0),
  mcz_nom            text,
  mcz_contact        text,
  rapporteur_id      uuid references public.actors(id),
  suppleant_id       uuid references public.actors(id),
  epidemiologistes   text,
  dos                text,
  frequence          text not null default 'quotidienne' check (frequence in ('quotidienne','hebdomadaire')),
  jour_hebdo         int default 1 check (jour_hebdo between 1 and 7),
  heure_limite       time,                            -- null = heure limite globale
  lat                double precision,
  lon                double precision,
  actif              boolean not null default true,
  date_debut         date,
  created_at         timestamptz not null default now(),
  check (as_affectees is null or as_total is null or as_affectees <= as_total),
  check (date_dernier_cas is null or date_premier_cas is null or date_dernier_cas >= date_premier_cas)
);

create table public.assignments (
  actor_id uuid not null references public.actors(id) on delete cascade,
  zs_id    text not null references public.health_zones(id) on delete cascade,
  primary key (actor_id, zs_id)
);

-- ---------------------------------------------------------------- Fiche journalière Date × ZS
create table public.daily_reports (
  id                       uuid primary key default gen_random_uuid(),
  date                     date not null,
  zs_id                    text not null references public.health_zones(id),
  rapporteur_id            uuid references public.actors(id),
  statut                   text not null default 'brouillon'
                             check (statut in ('brouillon','soumis','incomplet','a_corriger','valide_zs','valide_prov','rouvert')),
  rapport_nul              boolean not null default false,
  -- Investigations
  alertes_validees         int check (alertes_validees >= 0),
  inv_report_entrant       int check (inv_report_entrant >= 0),
  inv_realisees_jour       int check (inv_realisees_jour >= 0),
  inv_realisees_report     int check (inv_realisees_report >= 0),
  inv_moins_24h            int check (inv_moins_24h >= 0),
  motifs_inv               text[] not null default '{}',
  motif_autre              text,
  justif_report_inv        text,
  narratifs_attendus       int check (narratifs_attendus >= 0),
  narratifs_disponibles    int check (narratifs_disponibles >= 0),
  mappings_attendus        int check (mappings_attendus >= 0),
  mappings_disponibles     int check (mappings_disponibles >= 0),
  -- Contacts
  ct_report                int check (ct_report >= 0),
  justif_report_ct         text,
  ct_identifies            int check (ct_identifies >= 0),
  ct_listes_24h            int check (ct_listes_24h >= 0),
  ct_listes_tardifs        int check (ct_listes_tardifs >= 0),
  ct_sortie_21j            int check (ct_sortie_21j >= 0),
  ct_sortie_symptomatiques int check (ct_sortie_symptomatiques >= 0),
  ct_sortie_confirmes      int check (ct_sortie_confirmes >= 0),
  ct_sortie_perdus         int check (ct_sortie_perdus >= 0),
  ct_sortie_deplaces       int check (ct_sortie_deplaces >= 0),
  ct_sortie_decedes        int check (ct_sortie_decedes >= 0),
  ct_sortie_doublons       int check (ct_sortie_doublons >= 0),
  ct_vus                   int check (ct_vus >= 0),
  ct_nonvus_veille         int check (ct_nonvus_veille >= 0),
  ct_rattrapes             int check (ct_rattrapes >= 0),
  motifs_suivi             text[] not null default '{}',
  reco_actifs              int check (reco_actifs >= 0),
  superviseurs_reco        int check (superviseurs_reco >= 0),
  commentaire              text,
  commentaire_validation   text,             -- dernier commentaire du superviseur (retour / validation)
  -- Colonnes calculées (cahier « Suivi reporting » §4)
  inv_non_faites     int generated always as (greatest(coalesce(alertes_validees,0) - coalesce(inv_realisees_jour,0), 0)) stored,
  inv_report_sortant int generated always as (
                       greatest(coalesce(alertes_validees,0) - coalesce(inv_realisees_jour,0), 0)
                     + greatest(coalesce(inv_report_entrant,0) - coalesce(inv_realisees_report,0), 0)) stored,
  ct_sorties         int generated always as (
                       coalesce(ct_sortie_21j,0) + coalesce(ct_sortie_symptomatiques,0) + coalesce(ct_sortie_confirmes,0)
                     + coalesce(ct_sortie_perdus,0) + coalesce(ct_sortie_deplaces,0) + coalesce(ct_sortie_decedes,0)
                     + coalesce(ct_sortie_doublons,0)) stored,
  ct_a_suivre        int generated always as (
                       coalesce(ct_report,0) + coalesce(ct_listes_24h,0) + coalesce(ct_listes_tardifs,0)
                     - (coalesce(ct_sortie_21j,0) + coalesce(ct_sortie_symptomatiques,0) + coalesce(ct_sortie_confirmes,0)
                     + coalesce(ct_sortie_perdus,0) + coalesce(ct_sortie_deplaces,0) + coalesce(ct_sortie_decedes,0)
                     + coalesce(ct_sortie_doublons,0))) stored,
  -- Horodatage serveur (non modifiable par le rapporteur : forcé par trigger)
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,          -- 1re soumission : sert à la promptitude
  resubmitted_at timestamptz,
  validated_zs_by uuid references public.actors(id),   -- 1re validation (ZS)
  validated_zs_at timestamptz,
  validated_by   uuid references public.actors(id),     -- 2e validation (province)
  validated_at   timestamptz,
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  unique (date, zs_id),                 -- une seule fiche par Date × ZS
  -- Contrôles bloquants
  constraint ij_le_a      check (inv_realisees_jour  is null or alertes_validees   is null or inv_realisees_jour  <= alertes_validees),
  constraint ir_le_r      check (inv_realisees_report is null or inv_report_entrant is null or inv_realisees_report <= inv_report_entrant),
  constraint m24_le_total check (inv_moins_24h is null or inv_moins_24h <= coalesce(inv_realisees_jour,0) + coalesce(inv_realisees_report,0)),
  constraint narr_le_att  check (narratifs_disponibles is null or narratifs_disponibles <= coalesce(narratifs_attendus,0)),
  constraint map_le_att   check (mappings_disponibles  is null or mappings_disponibles  <= coalesce(mappings_attendus,0)),
  constraint listes_le_id check (ct_listes_24h is null or ct_identifies is null or ct_listes_24h <= ct_identifies),
  constraint sorties_le_entrees check (
      coalesce(ct_sortie_21j,0) + coalesce(ct_sortie_symptomatiques,0) + coalesce(ct_sortie_confirmes,0)
    + coalesce(ct_sortie_perdus,0) + coalesce(ct_sortie_deplaces,0) + coalesce(ct_sortie_decedes,0) + coalesce(ct_sortie_doublons,0)
    <= coalesce(ct_report,0) + coalesce(ct_listes_24h,0) + coalesce(ct_listes_tardifs,0)),
  constraint vus_le_a_suivre check (ct_vus is null or ct_vus <=
      coalesce(ct_report,0) + coalesce(ct_listes_24h,0) + coalesce(ct_listes_tardifs,0)
    - (coalesce(ct_sortie_21j,0) + coalesce(ct_sortie_symptomatiques,0) + coalesce(ct_sortie_confirmes,0)
    + coalesce(ct_sortie_perdus,0) + coalesce(ct_sortie_deplaces,0) + coalesce(ct_sortie_decedes,0) + coalesce(ct_sortie_doublons,0))),
  constraint rattrapes_le_nonvus check (ct_rattrapes is null or ct_rattrapes <= coalesce(ct_nonvus_veille,0)),
  constraint motif_inv_si_reste check (statut = 'brouillon' or cardinality(motifs_inv) > 0 or
      greatest(coalesce(alertes_validees,0) - coalesce(inv_realisees_jour,0), 0)
    + greatest(coalesce(inv_report_entrant,0) - coalesce(inv_realisees_report,0), 0) = 0)
);
create index on public.daily_reports (zs_id, date desc);
create index on public.daily_reports (date);

-- Historique des versions de chaque fiche
create table public.report_versions (
  id         bigserial primary key,
  report_id  uuid not null references public.daily_reports(id) on delete cascade,
  version    int not null,
  data       jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- Workflow de validation
create table public.validations (
  id          bigserial primary key,
  report_id   uuid not null references public.daily_reports(id) on delete cascade,
  action      text not null check (action in ('soumettre','retourner','valider_zs','valider_prov','rouvrir')),
  from_statut text,
  to_statut   text not null,
  commentaire text,
  actor_id    uuid references public.actors(id),
  at          timestamptz not null default now()
);

-- ---------------------------------------------------------------- Registre des investigations
create table public.investigations (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  date_ref          date not null,
  zs_id             text not null references public.health_zones(id),
  aire_sante        text,
  code_cas          text,
  debut             timestamptz,
  fin               timestamptz,
  statut            text not null default 'a_faire' check (statut in ('a_faire','en_cours','realisee','reportee','cloturee')),
  date_realisation  date,
  responsable_id    uuid references public.actors(id),
  motif_report      text,
  motif_detail      text,
  nouvelle_echeance timestamptz,
  nb_reports        int not null default 0 check (nb_reports >= 0),
  narratif          boolean not null default false,
  mapping           boolean not null default false,
  nb_contacts       int not null default 0 check (nb_contacts >= 0),
  commentaire       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (fin is null or debut is null or fin >= debut),
  constraint report_complet check (statut <> 'reportee' or (motif_report is not null and nouvelle_echeance is not null and responsable_id is not null))
);
create index on public.investigations (zs_id, date_ref);

-- ---------------------------------------------------------------- Registre des contacts (codes uniquement)
create table public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,            -- non réutilisable, aucune donnée nominative
  investigation_id    uuid references public.investigations(id),
  zs_id               text not null references public.health_zones(id),
  aire_sante          text,
  menage              text,                            -- code ménage, pour la détection de doublons
  sexe                text check (sexe in ('M','F','ND')),
  tranche_age         text check (tranche_age in ('<5','5-14','15-24','25-44','45-64','65+','ND')),
  date_exposition     date not null,
  date_identification timestamptz not null,
  date_listage        timestamptz,
  duree               int not null default 21,
  j1                  date generated always as (date_exposition + 1) stored,
  j21                 date generated always as (date_exposition + duree) stored,
  liste_24h           boolean generated always as (date_listage is not null and date_listage - date_identification <= interval '24 hours') stored,
  agent               text,                             -- RECO / agent de suivi
  statut              text not null default 'actif' check (statut in ('actif','non_vu','transfere','perdu_vue','sorti_j21','devenu_symptomatique','devenu_confirme','decede','autre')),
  nb_reports          int not null default 0,
  motif_report        text,
  zs_destination      text references public.health_zones(id),
  commentaire         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (date_listage is null or date_listage >= date_identification),
  check (statut <> 'transfere' or zs_destination is not null)
);
create index on public.contacts (zs_id, statut);

create table public.contact_followups (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  jour          int not null check (jour between 1 and 42),
  date          date not null,
  statut_visite text not null check (statut_visite in ('vu','non_vu','reporte','transfere','sorti','na')),
  heure         time,
  agent         text,
  observation   text,
  action        text check (action in ('poursuivre','rattraper','transferer','cloturer')),
  saisi_at      timestamptz not null default now(),
  saisi_par     uuid,
  unique (contact_id, jour)
);

-- ---------------------------------------------------------------- Registre transversal des reports
create table public.deferrals (
  id                uuid primary key default gen_random_uuid(),
  objet             text not null check (objet in ('investigation','contact')),
  investigation_id  uuid references public.investigations(id) on delete cascade,
  contact_id        uuid references public.contacts(id) on delete cascade,
  code              text not null,
  zs_id             text not null references public.health_zones(id),
  date_initiale     date not null,
  date_report       date not null,
  motif             text not null,
  motif_detail      text,
  responsable_id    uuid not null references public.actors(id),
  nouvelle_echeance timestamptz not null,
  numero            int not null,
  apure             boolean not null default false,
  date_apurement    date,
  created_at        timestamptz not null default now(),
  check ((objet = 'investigation') = (investigation_id is not null)),
  check ((objet = 'contact') = (contact_id is not null)),
  check (not apure or date_apurement is not null)
);
create index on public.deferrals (apure, zs_id);

-- ---------------------------------------------------------------- Notifications & audit
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,      -- date|zs|étape|destinataire : un rappel n'est jamais envoyé deux fois
  date            date not null,
  zs_id           text references public.health_zones(id),
  step            text not null,
  type            text not null,
  destinataire_id text,
  nom             text,
  canal           text not null,
  adresse         text,
  message         text not null,
  mode            text not null default 'auto' check (mode in ('auto','manuel')),  -- manuel = WhatsApp envoyé à la main
  lien            text,                      -- lien wa.me pré-rempli pour l'envoi manuel
  statut          text not null default 'en_attente' check (statut in ('a_envoyer','en_attente','envoye','lu','echec')),
  envoye_par      uuid references public.actors(id),
  erreur          text,
  provider_id     text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.notifications (date);

create table public.audit_logs (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  row_id     text,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb
);
create index on public.audit_logs (table_name, row_id);
create index on public.audit_logs (at desc);
