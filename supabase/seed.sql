-- Pré-chargement (cahier « Suivi reporting » §1-3). À compléter par l'administrateur :
-- codes DHIS2, MCZ, rapporteurs, 5 ZS en préparation manquantes, dates des cas confirmés.

insert into public.settings (key, value) values
  ('province_nom',         '"Haut-Uélé"'),
  ('province_code',        '"HU"'),
  ('dps_nom',              '"DPS Haut-Uélé"'),
  ('evenement',            '"MVE-17"'),
  ('fuseau',               '"Africa/Lubumbashi"'),
  ('heure_limite',         '"16:30"'),
  ('seuil_suivi',          '0.8'),
  ('jours_post_flambee',   '42'),
  ('seuil_escalade_reports','2'),
  ('heure_rappel_reports', '"08:00"'),
  ('duree_suivi',          '21'),
  ('registres_actifs',     'true'),
  ('whatsapp_mode',        '"manuel"'),   -- pas de WhatsApp Business : messages préparés, envoyés à la main
  ('whatsapp_groupe',      'true'),
  ('whatsapp_groupe_nom',  '"Groupe WhatsApp SurvEpi Haut-Uélé"'),
  ('email_auto',           'true'),
  ('sms_actif',            'false'),
  ('rappels', '[
     {"id":"ouverture","heure":"12:00","cible":"tous","destinataires":["rapporteur"],"libelle":"Rappel 1 (ouverture)"},
     {"id":"rappel2","heure":"15:00","cible":"sans_rapport","destinataires":["rapporteur","suppleant"],"libelle":"Rappel 2"},
     {"id":"final","heure":"16:00","cible":"non_complet","destinataires":["rapporteur","suppleant"],"libelle":"Rappel final","manquants":true},
     {"id":"escalade","heure":"16:45","cible":"non_complet","destinataires":["team_lead","mcz","validateur"],"libelle":"Escalade","manquants":true}
   ]')
on conflict (key) do nothing;

insert into public.health_zones (id, nom, categorie_manuelle, hotspot) values
  ('isiro',         'Isiro',         'touchee', true),
  ('wamba',         'Wamba',         'touchee', true),
  ('pawa',          'Pawa',          'touchee', true),
  ('boma-mangbetu', 'Boma-Mangbetu', 'touchee', true),
  ('dungu',         'Dungu',         'touchee', false),
  ('rungu',         'Rungu',         'touchee', false),
  ('gombari',       'Gombari',       'touchee', false),
  ('faradje',       'Faradje',       'preparation', false)
on conflict (id) do nothing;

insert into public.actors (nom, fonction, organisation, role, canal_prefere) values
  ('Dr Trésor Mosomo', 'Team Lead SurvEpi', 'OMS', 'team_lead', 'whatsapp'),
  ('Dr Amosi Kikwata', 'Épidémiologiste terrain, validateur Investigations et Suivi des contacts', 'OMS', 'validateur', 'whatsapp');
