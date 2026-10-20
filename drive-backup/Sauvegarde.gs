/**
 * SurvEpi Haut-Uélé : sauvegarde nocturne sur Google Drive.
 *
 * Tourne dans le compte Google de la riposte (le même que celui qui envoie les e-mails).
 * Chaque nuit à 23:30 (heure d'Isiro) :
 *   1. lit toutes les tables de la base Supabase ;
 *   2. crée dans le dossier Drive un sous-dossier « SurvEpi AAAA-MM-JJ » contenant
 *      - un Google Sheet lisible (un onglet par table + un onglet Compteurs),
 *      - un fichier survepi-AAAAMMJJ-HHMM.json.gz qui sert à la restauration ;
 *   3. supprime les sauvegardes plus vieilles que RETENTION_JOURS (90 par défaut) ;
 *   4. écrit « dernière sauvegarde » dans l'application et envoie un e-mail de compte rendu.
 *
 * Installation (une seule fois) : voir README-drive.md
 * Propriétés du script (Paramètres du projet > Propriétés du script) :
 *   SUPABASE_URL          https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY  clé « service_role » (Settings > API). Ne jamais la mettre ailleurs.
 *   DOSSIER_ID            identifiant du dossier Drive « SurvEpi - Sauvegardes » (fin de l'URL du dossier)
 *   ALERTE_EMAIL          adresse(s) qui reçoivent le compte rendu, séparées par des virgules
 *   RETENTION_JOURS       facultatif, 90 par défaut
 *
 * Pièces jointes (photos / scans des fiches) : copiées une seule fois chacune dans le sous-dossier
 * « SurvEpi - Pièces jointes / <ZS> / <date> » du dossier de sauvegarde. Jamais supprimées de Drive
 * (archive), même si elles sont retirées de l'application. Nom : <id>__<nom d'origine> (sert à la restauration).
 */

var TABLES = [
  ['settings', 'key'], ['health_zones', 'id'], ['actors', 'id'], ['assignments', 'actor_id,zs_id'],
  ['daily_reports', 'id'], ['report_attachments', 'id'], ['validations', 'id'], ['report_versions', 'id'],
  ['investigations', 'id'], ['contacts', 'id'], ['contact_followups', 'id'], ['deferrals', 'id'],
  ['notifications', 'id'], ['audit_logs', 'id'],
];
var PAGE = 1000;
var MAX_CELL = 49000; // limite Google Sheets : 50 000 caractères par cellule

function cfg_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'DOSSIER_ID', 'ALERTE_EMAIL'].forEach(function (k) {
    if (!p[k]) throw new Error('Propriété du script manquante : ' + k);
  });
  p.SUPABASE_URL = p.SUPABASE_URL.replace(/\/+$/, '');
  p.RETENTION_JOURS = Number(p.RETENTION_JOURS || 90);
  return p;
}

var PJ_DOSSIER = 'SurvEpi - Pièces jointes';
var PJ_BUDGET_MS = 4 * 60 * 1000; // Apps Script coupe à 6 min : le reste est copié la nuit suivante

function sousDossier_(parent, nom) {
  var it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

/**
 * Copie dans Drive les pièces jointes pas encore copiées (repère : date d'envoi + id, gardé dans les propriétés du script).
 * Retourne { copiees, restantes, erreurs }.
 */
function copierPiecesJointes_(c, pieces, racine, debut) {
  var props = PropertiesService.getScriptProperties();
  var repere = props.getProperty('PJ_REPERE') || ''; // « uploaded_at|id » de la dernière pièce copiée
  var aCopier = pieces.filter(function (p) { return (p.uploaded_at + '|' + p.id) > repere; })
    .sort(function (a, b) { return (a.uploaded_at + '|' + a.id) < (b.uploaded_at + '|' + b.id) ? -1 : 1; });
  var out = { copiees: 0, restantes: 0, erreurs: [] };
  if (!aCopier.length) return out;
  var base = sousDossier_(racine, PJ_DOSSIER);
  for (var i = 0; i < aCopier.length; i++) {
    if (new Date() - debut > PJ_BUDGET_MS) { out.restantes = aCopier.length - i; break; }
    var p = aCopier[i];
    var res = UrlFetchApp.fetch(c.SUPABASE_URL + '/storage/v1/object/pieces-jointes/' + p.path.split('/').map(encodeURIComponent).join('/'),
      { headers: headers_(c), muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var dossier = sousDossier_(sousDossier_(base, p.zs_id), p.date);
      dossier.createFile(res.getBlob().setName(p.id + '__' + p.nom));
      out.copiees++;
    } else if (res.getResponseCode() === 404 || res.getResponseCode() === 400) {
      out.erreurs.push(p.nom + ' (' + p.zs_id + ', ' + p.date + ') : fichier absent du stockage');
    } else {
      out.restantes = aCopier.length - i; // erreur réseau : on reprendra ici la prochaine fois
      out.erreurs.push(p.nom + ' : HTTP ' + res.getResponseCode());
      break;
    }
    props.setProperty('PJ_REPERE', p.uploaded_at + '|' + p.id);
  }
  return out;
}

/** À lancer à la main pour rattraper un gros retard de pièces jointes (sans refaire la sauvegarde de la base). */
function rattraperPiecesJointes() {
  var c = cfg_();
  var r = copierPiecesJointes_(c, lireTable_(c, 'report_attachments', 'id'), DriveApp.getFolderById(c.DOSSIER_ID), new Date());
  Logger.log('Pièces jointes copiées : ' + r.copiees + ', restantes : ' + r.restantes + (r.erreurs.length ? '\n' + r.erreurs.join('\n') : ''));
}

function headers_(c) {
  return { apikey: c.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + c.SUPABASE_SERVICE_KEY };
}

/** Lit une table entière, page par page, dans un ordre stable. */
function lireTable_(c, table, ordre) {
  var rows = [];
  for (var from = 0; ; from += PAGE) {
    var url = c.SUPABASE_URL + '/rest/v1/' + table + '?select=*&order=' + encodeURIComponent(ordre.split(',').map(function (x) { return x + '.asc'; }).join(','));
    var h = headers_(c);
    h.Range = from + '-' + (from + PAGE - 1);
    h['Range-Unit'] = 'items';
    var res = UrlFetchApp.fetch(url, { headers: h, muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code !== 200 && code !== 206) throw new Error(table + ' : HTTP ' + code + ' ' + res.getContentText().slice(0, 300));
    var data = JSON.parse(res.getContentText());
    rows = rows.concat(data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function ecrireOnglet_(ss, nom, rows) {
  var sh = ss.insertSheet(nom);
  if (!rows.length) { sh.getRange(1, 1).setValue('(vide)'); return; }
  var cols = Object.keys(rows[0]);
  var values = [cols].concat(rows.map(function (r) {
    return cols.map(function (k) {
      var v = r[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') v = JSON.stringify(v);
      if (typeof v === 'string' && v.length > MAX_CELL) v = v.slice(0, MAX_CELL) + ' […tronqué, voir le .json.gz]';
      return v;
    });
  }));
  for (var i = 0; i < values.length; i += 5000) {
    var chunk = values.slice(i, i + 5000);
    sh.getRange(i + 1, 1, chunk.length, cols.length).setNumberFormat('@').setValues(chunk);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
}

function noterDansApp_(c, valeur) {
  UrlFetchApp.fetch(c.SUPABASE_URL + '/rest/v1/settings?on_conflict=key', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: Object.assign(headers_(c), { Prefer: 'resolution=merge-duplicates' }),
    payload: JSON.stringify([{ key: 'derniere_sauvegarde', value: valeur }]),
  });
}

/** Point d'entrée du déclencheur nocturne. */
function sauvegardeNocturne() {
  var c = cfg_();
  var t0 = new Date();
  var tz = Session.getScriptTimeZone();
  var jour = Utilities.formatDate(t0, tz, 'yyyy-MM-dd');
  var stamp = Utilities.formatDate(t0, tz, 'yyyyMMdd-HHmm');
  try {
    var donnees = {}, compteurs = {};
    TABLES.forEach(function (t) {
      donnees[t[0]] = lireTable_(c, t[0], t[1]);
      compteurs[t[0]] = donnees[t[0]].length;
    });

    var prov = {};
    donnees.settings.forEach(function (r) { if (r.key === 'province_code' || r.key === 'province_nom') prov[r.key] = r.value; });
    var code = prov.province_code || 'XX';
    var racine = DriveApp.getFolderById(c.DOSSIER_ID);
    var dossier = racine.createFolder('SurvEpi ' + code + ' ' + jour + ' ' + Utilities.formatDate(t0, tz, 'HH.mm'));

    // 1. Fichier de restauration (complet, compressé)
    var json = JSON.stringify({ format: 'survepi-sauvegarde', version: 1, province_code: code, province_nom: prov.province_nom || null, cree_le: t0.toISOString(), fuseau: tz, compteurs: compteurs, tables: donnees });
    var gz = Utilities.gzip(Utilities.newBlob(json, 'application/json', 'survepi-' + code + '-' + stamp + '.json'), 'survepi-' + code + '-' + stamp + '.json.gz');
    var fichier = dossier.createFile(gz);

    // 2. Copie lisible
    var ss = SpreadsheetApp.create('SurvEpi sauvegarde ' + jour);
    DriveApp.getFileById(ss.getId()).moveTo(dossier);
    var cpt = ss.getSheets()[0];
    cpt.setName('Compteurs');
    cpt.getRange(1, 1, 1, 2).setValues([['Table', 'Lignes']]).setFontWeight('bold');
    cpt.getRange(2, 1, TABLES.length, 2).setValues(TABLES.map(function (t) { return [t[0], compteurs[t[0]]]; }));
    cpt.getRange(TABLES.length + 3, 1, 2, 2).setValues([['Sauvegarde du', Utilities.formatDate(t0, tz, 'dd/MM/yyyy HH:mm')], ['Fichier de restauration', fichier.getName()]]);
    TABLES.forEach(function (t) { ecrireOnglet_(ss, t[0], donnees[t[0]]); });

    // 3. Pièces jointes (nouvelles seulement)
    var pj = copierPiecesJointes_(c, donnees.report_attachments || [], racine, t0);

    // 4. Rétention des sauvegardes de la base (le dossier des pièces jointes n'est jamais touché)
    var limite = new Date(t0.getTime() - c.RETENTION_JOURS * 86400000), supprimes = 0;
    var it = racine.getFolders();
    while (it.hasNext()) {
      var f = it.next();
      if (/^SurvEpi ([A-Z0-9-]+ )?\d{4}-\d{2}-\d{2}/.test(f.getName()) && f.getDateCreated() < limite) { f.setTrashed(true); supprimes++; }
    }

    var duree = Math.round((new Date() - t0) / 1000);
    noterDansApp_(c, { at: t0.toISOString(), statut: 'ok', compteurs: compteurs, dossier_url: dossier.getUrl(), fichier: fichier.getName(), duree_s: duree,
      pieces_jointes: { copiees: pj.copiees, restantes: pj.restantes, erreurs: pj.erreurs.length } });
    MailApp.sendEmail(c.ALERTE_EMAIL, 'SurvEpi : sauvegarde du ' + jour + ' OK',
      'Sauvegarde terminée en ' + duree + ' s.\n\n' +
      TABLES.map(function (t) { return t[0] + ' : ' + compteurs[t[0]]; }).join('\n') +
      '\n\nPièces jointes copiées cette nuit : ' + pj.copiees + (pj.restantes ? ' (encore ' + pj.restantes + ' à copier : la suite la nuit prochaine, ou lancer rattraperPiecesJointes)' : '') +
      (pj.erreurs.length ? '\nProblèmes :\n' + pj.erreurs.slice(0, 20).join('\n') : '') +
      '\n\nDossier : ' + dossier.getUrl() + '\nAnciennes sauvegardes supprimées : ' + supprimes);
  } catch (e) {
    noterDansApp_(c, { at: t0.toISOString(), statut: 'echec', erreur: String(e.message || e) });
    MailApp.sendEmail(c.ALERTE_EMAIL, 'SurvEpi : ÉCHEC de la sauvegarde du ' + jour,
      'La sauvegarde nocturne a échoué :\n\n' + (e.stack || e) + '\n\nRelancer à la main : ouvrir le projet Apps Script, fonction sauvegardeNocturne, Exécuter.');
    throw e;
  }
}

/** À exécuter une fois : vérifie la configuration et crée le déclencheur nocturne. */
function installer() {
  var c = cfg_();
  DriveApp.getFolderById(c.DOSSIER_ID); // vérifie l'accès au dossier
  lireTable_(c, 'settings', 'key');      // vérifie l'accès à la base
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sauvegardeNocturne') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sauvegardeNocturne').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
  Logger.log('Déclencheur créé : chaque nuit vers 23:30 (' + Session.getScriptTimeZone() + ').');
  // Import automatique : dossier de dépôt + passage toutes les heures
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importerDepot') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importerDepot').timeBased().everyHours(1).create();
  Logger.log('Dossier de dépôt : ' + dossierDepot_().getUrl() + ' (import automatique toutes les heures).');
}
