-- Modèle de pré-chargement pour une NOUVELLE province (une installation Supabase par province).
-- À lancer une fois, après `supabase db push`, dans le SQL Editor du nouveau projet.
-- Remplacer tout ce qui est entre << >>, puis supprimer les lignes d'exemple inutiles.

-- 1. Identité de la province
insert into public.settings (key, value) values
  ('province_nom',  '"<<Tshopo>>"'),
  ('province_code', '"<<TSH>>"'),        -- court, unique dans le pays, ne change plus après la 1re fiche
  ('dps_nom',       '"<<DPS Tshopo>>"'),
  ('evenement',     '"<<MVE-17>>"'),        -- épidémie ou événement suivi
  ('fuseau',        '"Africa/Lubumbashi"'),   -- est de la RDC (UTC+2) ; ouest : Africa/Kinshasa (UTC+1)
  ('whatsapp_groupe_nom', '"<<Groupe WhatsApp SurvEpi Tshopo>>"')
on conflict (key) do update set value = excluded.value;

-- 2. Paramètres de reporting (mêmes valeurs que le Haut-Uélé, modifiables ensuite dans Paramètres)
insert into public.settings (key, value) values
  ('heure_limite',         '"16:30"'),
  ('seuil_suivi',          '0.8'),
  ('jours_post_flambee',   '42'),
  ('seuil_escalade_reports','2'),
  ('heure_rappel_reports', '"08:00"'),
  ('duree_suivi',          '21'),
  ('registres_actifs',     'true'),
  ('whatsapp_mode',        '"manuel"'),
  ('whatsapp_groupe',      'true'),
  ('email_auto',           'true'),
  ('sms_actif',            'false'),
  ('rappels', '[
     {"id":"ouverture","heure":"12:00","cible":"tous","destinataires":["rapporteur"],"libelle":"Rappel 1 (ouverture)"},
     {"id":"rappel2","heure":"15:00","cible":"sans_rapport","destinataires":["rapporteur","suppleant"],"libelle":"Rappel 2"},
     {"id":"final","heure":"16:00","cible":"non_complet","destinataires":["rapporteur","suppleant"],"libelle":"Rappel final","manquants":true},
     {"id":"escalade","heure":"16:45","cible":"non_complet","destinataires":["team_lead","mcz","validateur"],"libelle":"Escalade","manquants":true}
   ]')
on conflict (key) do nothing;

-- 3. Zones de santé. id = nom en minuscules sans accents ni espaces.
--    Renseigner code_dhis2 dès que possible : c'est la clé qui servira à regrouper les provinces (option 2).
insert into public.health_zones (id, nom, code_dhis2, categorie_manuelle, hotspot) values
  ('<<zs-exemple-1>>', '<<ZS Exemple 1>>', null, 'touchee', false),
  ('<<zs-exemple-2>>', '<<ZS Exemple 2>>', null, 'preparation', false)
on conflict (id) do nothing;

-- 4. Le premier compte admin se crée à la main (Authentication > Add user), puis :
-- insert into public.actors (nom, fonction, organisation, role, email, user_id)
-- values ('<<Nom>>', 'Administrateur SurvEpi', 'OMS', 'admin', '<<email>>', '<<uuid du compte>>');
-- Tous les autres comptes : page « ZS & acteurs » > « Créer le compte ».
