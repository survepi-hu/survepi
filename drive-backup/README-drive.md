# Sauvegarde nocturne sur Google Drive

La base SurvEpi est copiée chaque nuit dans le Drive du compte Google de la riposte. Rien ne passe par un serveur tiers : le script tourne dans ce compte Google, lit la base, et écrit dans son propre Drive.

Chaque nuit vers 23:30 (heure d'Isiro), un dossier `SurvEpi AAAA-MM-JJ 23.30` apparaît dans le dossier `SurvEpi - Sauvegardes` avec :

| Fichier | À quoi il sert |
|---|---|
| `SurvEpi sauvegarde AAAA-MM-JJ` (Google Sheet) | Lire les données sans outil : un onglet par table, un onglet Compteurs |
| `survepi-AAAAMMJJ-HHMM.json.gz` | Restaurer la base à l'identique (script `scripts/restaurer-drive.mjs`) |

Les 90 dernières nuits sont gardées (réglable). Un e-mail de compte rendu part chaque nuit, et un message d'alerte en cas d'échec. L'application affiche aussi « Sauvegarde Drive OK » ou une alerte rouge sur l'accueil (admin, Team Lead, data manager) et dans Paramètres.

## Installation (15 minutes, une seule fois)

1. Dans le Drive du compte Gmail de la riposte, créer un dossier `SurvEpi - Sauvegardes`. Ouvrir le dossier et copier son identifiant : la fin de l'adresse, après `folders/`.
2. Aller sur https://script.google.com avec ce même compte, « Nouveau projet », le nommer `SurvEpi sauvegarde`.
3. Remplacer le contenu de `Code.gs` par celui de `Sauvegarde.gs`.
4. Paramètres du projet (roue dentée) : cocher « Afficher le fichier manifeste appsscript.json », puis remplacer son contenu par `appsscript.json`. Vérifier que le fuseau est `Africa/Lubumbashi`.
5. Paramètres du projet > Propriétés du script, ajouter :
   - `SUPABASE_URL` : `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_KEY` : Supabase > Settings > API > clé `service_role`
   - `DOSSIER_ID` : l'identifiant copié à l'étape 1
   - `ALERTE_EMAIL` : adresse(s) qui reçoivent le compte rendu, séparées par des virgules
   - `RETENTION_JOURS` : facultatif, 90 par défaut
6. Dans l'éditeur, choisir la fonction `installer` et cliquer « Exécuter ». Accepter les autorisations Google (Drive, Sheets, envoi d'e-mails, accès externe).
7. Choisir `sauvegardeNocturne` et cliquer « Exécuter » une fois pour faire la première sauvegarde tout de suite. Vérifier le dossier Drive et l'e-mail.

## Règles de sécurité

- Le dossier `SurvEpi - Sauvegardes` ne se partage qu'avec les personnes qui doivent pouvoir restaurer (Team Lead, admin). Il contient les coordonnées des acteurs et toutes les fiches.
- La clé `service_role` reste uniquement dans les propriétés du script. Si elle fuit : Supabase > Settings > API > régénérer, puis la remplacer dans le script.
- Les mots de passe des utilisateurs ne sont jamais copiés sur Drive. Après une restauration, chacun reçoit un lien pour choisir un nouveau mot de passe.

## Restaurer après un crash

1. Créer un nouveau projet Supabase, puis appliquer la structure (sans le seed) :
   ```bash
   supabase link --project-ref <NOUVEAU_REF> && supabase db push
   ```
2. Télécharger depuis Drive le `.json.gz` de la nuit voulue, puis :
   ```bash
   cd scripts && npm install
   DATABASE_URL="postgresql://postgres:<mdp>@db.<NOUVEAU_REF>.supabase.co:5432/postgres" \
   SUPABASE_URL="https://<NOUVEAU_REF>.supabase.co" SUPABASE_SERVICE_KEY="<clé service_role>" \
   node restaurer-drive.mjs survepi-20261018-2330.json.gz --recreer-comptes
   ```
   Le script refuse d'écrire dans une base qui contient déjà des données. Il recharge tout en une seule transaction (tout ou rien), garde les heures de soumission, les validations et l'audit d'origine, puis compare les compteurs à ceux de la sauvegarde. Avec `--recreer-comptes`, chaque acteur actif qui a un e-mail reçoit un lien pour choisir son mot de passe.
3. Redéployer la fonction `rappels` et ses secrets Gmail, mettre la nouvelle URL et la nouvelle clé dans le front (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), et mettre à jour `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` dans les propriétés du script de sauvegarde.
