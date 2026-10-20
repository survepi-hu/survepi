# SurvEpi Haut-Uélé

Logiciel de suivi des **investigations** et du **suivi des contacts** pour la riposte MVE-17 (DPS Haut-Uélé, pilier Surveillance épidémiologique).
Construit à partir des deux cahiers des charges de Dr Amosi (6 et 7 octobre 2026) et des deux classeurs Excel existants.

## Ce qui est livré

| Partie | Dossier | État |
|---|---|---|
| Règles métier (calculs, contrôles, complétude, promptitude, rappels, bascule des ZS, J1-J21, imports) | `web/src/domain/` | 40 tests qui passent (`npm test`) |
| Base de données Supabase / Postgres : tables, contraintes bloquantes, horodatage serveur, verrouillage après validation, versions, audit, droits par rôle et par ZS (RLS) | `supabase/migrations/` | Testée sur Postgres 16 (`supabase/tests/01_recette.sql`, 17 cas, dont la double validation) |
| Moteur de rappels (fonction Edge + cron toutes les 5 min) : e-mails automatiques par Gmail, WhatsApp préparés pour envoi manuel | `supabase/functions/rappels/` | Logique testée ; envoi Gmail à tester avec le vrai compte |
| Sauvegarde nocturne sur Google Drive (Apps Script) + script de restauration | `drive-backup/`, `scripts/restaurer-drive.mjs` | Restauration testée sur Postgres : mêmes compteurs, horodatages et validations conservés. Le script Drive lui-même est à lancer une 1re fois sur le vrai compte |
| Application web responsive (React) : 14 pages du §13 du cahier des charges | `web/src/pages/` | Testée dans Chromium (desktop, mobile, sombre) |
| Démo autonome avec données fictives | `web/dist-demo/index.html` | Un seul fichier, s'ouvre hors ligne |

## Lancer la démo

```bash
cd web
npm install
npm run dev          # http://localhost:5173, mode démo (aucune variable Supabase)
npm run build:demo   # produit dist-demo/index.html autonome
```

En mode démo, l'écran de connexion propose des profils (Team Lead, validateur, épidémiologiste, rapporteur, admin). Les données sont **fictives**, générées par rapport à la date du jour, et respectent tous les contrôles bloquants.

## Mise en production

1. Créer un projet Supabase, région Central EU (Frankfurt) ou West EU (Paris) : Supabase n’a pas de région en Afrique.
2. Appliquer le schéma :
   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase db push                # migrations 1 et 2
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
   Pour la migration 3 (cron), remplacer `<PROJECT_REF>` et créer le secret Vault `service_role_key`.
3. Fonction de rappels :
   ```bash
   cd web && npm run sync-shared   # copie les règles métier dans supabase/functions/_shared
   supabase secrets set GMAIL_USER=survepi.hautuele@gmail.com GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx MAIL_FROM_NAME="SurvEpi Haut-Uélé"
   supabase functions deploy rappels
   ```
   Tester sans envoyer : `GET /functions/v1/rappels?dry=1`.
   Autre fournisseur que Gmail (si Google bloque le mot de passe d'application) : `supabase secrets set SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... MAIL_FROM=adresse.verifiee@...` puis redéployer `rappels` et `comptes`. Les variables SMTP_* passent avant GMAIL_*.
   Gmail : activer la validation en deux étapes sur le compte, puis créer un **mot de passe d'application** (Compte Google > Sécurité > Mots de passe des applications). Envoi par smtp.gmail.com, port 465 (Supabase bloque 25 et 587). Limite Gmail d'environ 500 e-mails par jour : SurvEpi en envoie quelques dizaines.
4. Comptes : déployer la fonction `supabase functions deploy comptes`. Ensuite, tout se fait dans l'application, page « ZS & acteurs » (admin) : « Ajouter un acteur » (nom, rôle, e-mail, ZS) puis « Créer le compte ». Un mot de passe provisoire s'affiche (et part par e-mail si Gmail est configuré) ; la personne choisit le sien à la première connexion. « Nouveau mot de passe » sert en cas d'oubli. Seul le tout premier compte admin se crée à la main (Supabase Auth + une ligne `actors`).
   **En nombre** : « ZS & acteurs » > Acteurs > « Importer depuis Excel ». Télécharger le modèle (`SurvEpi_modele_comptes.xlsx`, onglets Acteurs et ZS avec listes déroulantes), le faire remplir, le recharger : aperçu ligne par ligne, puis création des acteurs, des affectations, des titulaires/suppléants et des comptes en une fois. Les mots de passe provisoires s'affichent à la fin (bouton WhatsApp par personne, ou liste Excel à supprimer après remise). Pour une autre province : `python3 scripts/creer-modele-comptes.py sortie.xlsx "ZS1,ZS2,…"`.
5. Front :
   ```bash
   cd web
   echo "VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co" > .env.production
   echo "VITE_SUPABASE_ANON_KEY=<ANON_KEY>" >> .env.production
   npm run build        # dist/ à déployer (Netlify, Vercel, Supabase Storage…)
   ```
   `npm run build` s'arrête si l'URL ou la clé manquent (pour ne jamais mettre la démo en ligne). Garder une copie de `web/.env.local` hors du dossier du projet (ex. `~/survepi-config/`) et la recopier après chaque nouveau zip.
   ```
   ```
6. Sauvegardes : installer le script Drive (`drive-backup/README-drive.md`) et faire un test de restauration dans un projet Supabase de test avant la mise en service.

## Historique (données d'avant la mise en service)

Page « Historique » (admin, Team Lead, gestionnaire de données). Trois sources, chargées ensemble ou séparément :

- **Modèle `SurvEpi_modele_historique.xlsx`** (téléchargeable depuis la page) : une ligne par date et par ZS, mêmes chiffres que la fiche du jour. Pour les compilations journalières, les SitRep et les rapports des ZS. Une case vide = inconnu ; les reports (investigations, contacts à suivre, non-vus) se calculent en chaîne d'un jour à l'autre.
- **Outils Excel DPS remplis** (investigations, suivi des contacts + journal des visites) : l'app recalcule des totaux par jour et par ZS (alertes, investigations du jour / sur report, contacts listés, sorties, vus, agents de suivi). Aucun nom ni téléphone n'est repris. Limites affichées : taux de listage à 100 % par construction, RECO = agents distincts du jour.
- Fusion champ par champ : **le modèle prime**, les outils DPS complètent.

Aperçu avant import (nouvelles, remplacées, gardées, erreurs). Les contrôles de la fiche s'appliquent, sauf les motifs et justifications (absents des anciens rapports). Une fiche saisie dans l'app n'est jamais écrasée ; réimporter remplace l'historique des mêmes dates. Les fiches historiques sont validées d'office (`source = 'historique'`, sans heure de soumission) : elles comptent dans les courbes, les totaux et la complétude, **jamais dans la promptitude**. Grille de reporting : cases hachurées. « Retirer tout l'historique importé » annule l'opération.

Paramètres > « Date de mise en service » : avant cette date, une ZS sans fiche est « avant la mise en service » (pas « non reçue »). Vide = date de la 1re fiche saisie. Tableau de bord : période « Depuis le début ».

## Pièces jointes (fiche papier)

Sur chaque fiche journalière enregistrée : « Prendre une photo » (appareil photo du téléphone) ou « Ajouter des fichiers » (plusieurs à la fois, photos ou PDF, 10 Mo max). Les photos sont réduites à 2000 px avant l'envoi (≈ 100 à 600 Ko). Stockage privé Supabase (`pieces-jointes/<zs>/<date>/…`), mêmes droits que la fiche, liens d'accès temporaires (1 h). Suppression : l'auteur tant que la fiche n'est pas validée, ou admin / Team Lead / data manager ; tout est dans le journal d'audit. La page Validation affiche « n PJ ». Sauvegarde : chaque nuit, les nouvelles pièces jointes sont copiées dans Drive (« SurvEpi - Pièces jointes / ZS / date », fichiers nommés `<id>__<nom>`, jamais supprimés de Drive). Retard important : fonction `rattraperPiecesJointes` dans Apps Script. Restauration : `restaurer-drive.mjs … --pieces-jointes=<dossier téléchargé>`.

## Mises à jour du code (GitHub → Netlify)

Netlify (offre gratuite) ne construit un dépôt privé que pour **un seul contributeur** : le compte GitHub `survepi-hu`. Chaque commit envoyé sur `main` doit donc avoir pour **auteur et committer** l'adresse de ce compte (`pilliersurveillanceepidemio@gmail.com`), sinon le déploiement échoue avec « unrecognized Git contributor ».

## Autres provinces

Une installation = une province : un projet Supabase, un lien, une sauvegarde Drive, des comptes séparés. Le code est le même pour toutes. Le nom de la province, le nom de la DPS, l'épidémie suivie (MVE-17, Mpox…), le code province et le fuseau sont des paramètres (page Paramètres > Province), plus rien n'est écrit en dur.

**Ajouter une ZS dans une province existante** : page « ZS & acteurs » > « Ajouter une ZS ». Rien d'autre.

**Monter une nouvelle province** (environ 30 minutes) :

1. Créer un nouveau projet Supabase (même organisation, région Frankfurt ou Paris).
2. Dans le dossier du projet : `supabase link --project-ref <REF_NOUVEAU_PROJET>` puis `supabase db push`.
3. SQL Editor : coller `supabase/seed-nouvelle-province.sql` après avoir remplacé les `<< >>` (nom, code, ZS).
4. Créer le secret Vault `service_role_key` et le cron des rappels (comme pour le Haut-Uélé, avec la nouvelle REF).
5. `supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=...` puis `supabase functions deploy rappels` et `supabase functions deploy comptes`.
6. Front : `.env.production` avec la nouvelle URL, la nouvelle clé anon, `VITE_PROVINCE_NOM=<Nom>` et `VITE_EVENEMENT=<épidémie>` (affichés sur l'écran de connexion), puis `npm run build` et un nouveau site sur l'hébergeur.
7. Premier compte admin à la main, puis tous les autres depuis l'application.
8. Sauvegarde Drive : un 2e script Apps Script avec les identifiants du nouveau projet et un dossier Drive à part. Les fichiers portent le code province (`survepi-TSH-AAAAMMJJ-HHMM.json.gz`).

**Pour garder ouverte la base multi-provinces (option 2)**, trois règles dès maintenant :

- Chaque province a un **code province** unique (HU, TSH…). Il est bloqué en base dès la 1re fiche et il est écrit dans chaque sauvegarde.
- Renseigner le **code DHIS2** de chaque ZS. C'est la clé nationale qui permettra de regrouper les ZS sans doublon.
- Ne pas modifier le schéma de la base dans une seule province : toutes les installations gardent les mêmes migrations.

Le passage à l'option 2 consistera à : ajouter une table `provinces` et une colonne `province_id` aux ZS et aux acteurs ; ajouter un niveau « national » dans les droits ; puis importer chaque sauvegarde Drive avec son code province (les identifiants de fiches sont des UUID, ils ne se chevauchent pas). Les données saisies d'ici là seront reprises telles quelles.

## Où sont les données, et que faire en cas de crash

| Quoi | Où | Copie de secours |
|---|---|---|
| Données (fiches, registres, validations, notifications, audit, ZS, acteurs, paramètres) | Base Postgres du projet Supabase | **Chaque nuit dans le Google Drive du compte de la riposte** : un Google Sheet lisible + un fichier de restauration, 90 nuits gardées |
| Comptes de connexion | Supabase Auth | Recréés à la restauration (lien de mot de passe envoyé à chacun) ; les mots de passe ne sortent jamais |
| Code, structure de la base, scripts | Dépôt Git privé | Le dépôt, et ce zip |
| Application web | Hébergeur statique | Reconstruite depuis le dépôt |

La sauvegarde Drive est faite par un script Google Apps Script qui tourne dans le compte Gmail de la riposte : aucune autre plateforme ne garde les données. Installation et restauration pas à pas : `drive-backup/README-drive.md`. L'accueil de l'app affiche « Sauvegarde Drive OK » ou une alerte rouge si la nuit a échoué.

En plus, le plan Pro de Supabase (25 $/mois) ajoute une sauvegarde quotidienne côté Supabase (7 jours). Le plan gratuit n'en fait aucune. Et l'export « Sauvegarde complète (Excel) » reste disponible à la demande dans l'app.

## Rappels sans WhatsApp Business

- **E-mails : automatiques.** Chaque rappel part par e-mail à chaque destinataire qui a une adresse.
- **WhatsApp : envoi manuel assisté.** À chaque étape (12:00, 15:00, 16:00, 16:45), le système crée les messages dans la file « WhatsApp à envoyer » (page Notifications, visible du data manager, Team Lead, validateur, admin) :
  - un message **récapitulatif pour le groupe** WhatsApp SurvEpi (liste des ZS non reçues et incomplètes avec les champs manquants) ;
  - un message **individuel** par rapporteur / suppléant / MCZ.
  L'opérateur clique « Ouvrir WhatsApp » (lien wa.me pré-rempli, marche sur téléphone et WhatsApp Web), envoie, puis coche « Envoyé » (ou « Échec / injoignable »). Tout est journalisé avec le nom de l'opérateur.
- Les rappels s'arrêtent dès qu'une fiche complète est soumise : un message préparé pour une ZS qui a soumis entre-temps reste dans la file, l'opérateur le marque sans l'envoyer.
- Le jour où un compte WhatsApp Business existe : Paramètres → WhatsApp → « API », et ajouter `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` (modèle approuvé, 1 paramètre texte, langue fr).
- SMS désactivés par défaut : un destinataire qui préfère le SMS passe dans la file WhatsApp manuelle.

## Double validation

Brouillon → soumis → **1re validation (ZS)** par l'épidémiologiste superviseur → **2e validation (province)** par le Team Lead ou le validateur. La 2e validation est refusée si elle vient de la même personne que la 1re (contrôlé en base, pas seulement dans l'écran). Seules les fiches « validé province (2/2) » sont la donnée officielle. Un retour pour correction ou une réouverture efface les deux validations : la fiche repasse par les deux niveaux.

## Niveaux d'accès

| Niveau | Rôle | Usage |
|---|---|---|
| Suivi technique / SAV | `admin` | Comptes, paramètres, audit, sauvegardes |
| Administrateur de la riposte | `team_lead` | Vue provinciale, ZS, 2e validation, réouvertures |
| Utilisateurs | `rapporteur`, `epidemiologiste` (1re validation), `validateur` (2e validation), `data_manager`, `coordination` (lecture) | Selon la fonction |

## Rôles

| Rôle | Peut |
|---|---|
| Rapporteur ZS | Saisir et soumettre la fiche de ses ZS, consulter son historique |
| Épidémiologiste superviseur | Corriger, retourner, valider (ZS) sur ses ZS |
| Gestionnaire de données | Contrôle qualité, corrections tracées, exports, toutes ZS |
| Team Lead / validateur | Vue provinciale, validation province, réouverture, escalades |
| Coordination | Lecture seule |
| Administrateur | Comptes, ZS, horaires, seuils, audit |

## Choix faits là où les deux cahiers diffèrent

- **Horaires** : ceux du cahier du 7 octobre (12:00, 15:00, 16:00, limite 16:30, escalade 16:45, UTC+2). Tous modifiables dans Paramètres, et l'heure limite peut être propre à une ZS (les rappels se décalent).
- **Contacts** : registre en **codes uniquement**, sans nom ni téléphone (« données agrégées uniquement, aucune donnée nominale », cahier du 7 octobre). Les registres détaillés (investigations, contacts J1-J21) se désactivent d'un clic si la coordination préfère l'agrégé seul.
- **Contacts à suivre** = report (actifs de la veille) + listés ≤ 24 h + listés hors délai − sorties. J'ai ajouté « listés hors délai » : sans cette ligne, un contact listé après 24 h n'entrait jamais dans le suivi.
- **Complétude** : deux mesures sont affichées. Complétude = ZS complètes **et** à temps / attendues (cahier du 7 oct.) ; Réception = ZS ayant soumis / attendues (cahier du 6 oct.).
- **Veille manquante** : le pré-remplissage reprend le dernier rapport disponible (14 jours max) avec un avertissement.
- **Taux = NA** quand le dénominateur est nul, jamais 0 %.
- **Reports d'investigations et de contacts** : une seule table `deferrals` avec un champ `objet`, au lieu de deux tables. Même information, requêtes plus simples.

## Points à confirmer avec le sous-pilier

1. Noms, numéros WhatsApp et suppléants des rapporteurs par ZS.
2. Les 5 ZS en préparation manquantes (seule Faradje est connue) et les codes DHIS2.
3. Dates du 1er et du dernier cas confirmé par ZS (pour la bascule automatique touchée / post-flambée).
4. Heures de rappel et heure limite définitives.
5. Alertes validées : saisie manuelle (actuel) ou import depuis l'outil Alertes.
6. Qui tient la file WhatsApp manuelle (data manager provincial ?) et le nom exact du groupe WhatsApp.
7. Le compte Gmail d'envoi (validation en deux étapes + mot de passe d'application).

## Lot 3 (non fait)

Saisie hors ligne complète avec synchronisation (une file d'attente simple existe déjà pour les fiches journalières), rapports PDF mis en page, API documentée pour d'autres outils, MFA.
