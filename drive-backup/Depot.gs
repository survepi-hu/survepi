/**
 * SurvEpi : import automatique de l'historique depuis un dossier Drive (« dépôt »).
 *
 * On dépose dans le dossier « SurvEpi - Dépôt historique » (Drive du compte de la riposte, partageable avec les
 * gestionnaires de données) : le modèle historique rempli et/ou les outils Excel DPS remplis.
 * Toutes les heures, ce script :
 *   1. lit les fichiers déposés (Excel ou Google Sheets) ;
 *   2. applique exactement les règles de la page Historique de l'app (ImportLib.gs, généré depuis le code de l'app) ;
 *   3. envoie les fiches valides à la base (une fiche saisie dans l'app n'est jamais écrasée) ;
 *   4. range les fichiers dans « Traités / <date heure> » avec un rapport ligne par ligne ;
 *   5. envoie un compte rendu par e-mail (ALERTE_EMAIL, et DEPOT_EMAIL s'il est défini).
 * Les lignes en erreur ne sont pas importées : corriger le fichier (voir le rapport) et le redéposer.
 *
 * Prérequis (une fois) : service avancé « Drive API » activé (déjà déclaré dans appsscript.json),
 * puis exécuter installer() pour créer le dossier et le déclencheur horaire.
 */
var DEPOT_NOM = 'SurvEpi - Dépôt historique';
var TYPES_TABLEUR = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12', 'application/vnd.google-apps.spreadsheet'];

function dossierDepot_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DEPOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* supprimé : on recrée */ } }
  var f = DriveApp.createFolder(DEPOT_NOM);
  f.setDescription('Déposer ici le modèle historique et/ou les outils Excel DPS remplis. Import automatique toutes les heures, compte rendu par e-mail.');
  props.setProperty('DEPOT_ID', f.getId());
  return f;
}

/** Lit tous les onglets d'un fichier (Excel converti à la volée en Google Sheets, copie temporaire supprimée). */
function lireClasseur_(fichier) {
  var id = fichier.getId(), temp = null;
  if (fichier.getMimeType() !== 'application/vnd.google-apps.spreadsheet') {
    temp = Drive.Files.create({ name: '(temp) ' + fichier.getName(), mimeType: 'application/vnd.google-apps.spreadsheet' }, fichier.getBlob());
    id = temp.id;
  }
  try {
    var onglets = {};
    SpreadsheetApp.openById(id).getSheets().forEach(function (sh) {
      if (sh.isSheetHidden()) return;
      var v = sh.getDataRange().getValues();
      while (v.length && v[v.length - 1].every(function (x) { return x === '' || x === null; })) v.pop();
      onglets[sh.getName()] = v;
    });
    return { nom: fichier.getName(), onglets: onglets };
  } finally {
    if (temp) DriveApp.getFileById(temp.id).setTrashed(true);
  }
}

function rpc_(c, fonction, corps) {
  var res = UrlFetchApp.fetch(c.SUPABASE_URL + '/rest/v1/rpc/' + fonction, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: headers_(c), payload: JSON.stringify(corps),
  });
  if (res.getResponseCode() >= 300) throw new Error(fonction + ' : HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText() || 'null');
}

/** Point d'entrée du déclencheur horaire. Ne fait rien si le dossier est vide. */
function importerDepot() {
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) return;
  try {
    var c = cfg_();
    var depot = dossierDepot_();
    var fichiers = [], it = depot.getFiles();
    while (it.hasNext()) { var f = it.next(); if (TYPES_TABLEUR.indexOf(f.getMimeType()) >= 0) fichiers.push(f); }
    if (!fichiers.length) return;

    var tz = Session.getScriptTimeZone(), t0 = new Date();
    var stamp = Utilities.formatDate(t0, tz, 'yyyy-MM-dd HH.mm');
    var classeurs = [], illisibles = [];
    fichiers.forEach(function (f) { try { classeurs.push(lireClasseur_(f)); } catch (e) { illisibles.push(f.getName() + ' : ' + (e.message || e)); } });

    var r = SurvEpiImport.planifier(classeurs, {
      zsList: lireTable_(c, 'health_zones', 'id'),
      reports: lireTable_(c, 'daily_reports', 'date,zs_id'),
      today: Utilities.formatDate(t0, tz, 'yyyy-MM-dd'),
    });
    var detail = ('Dépôt Drive ' + stamp + ' : ' + fichiers.map(function (f) { return f.getName(); }).join(', ')).slice(0, 200);
    var bilan = { creees: 0, remplacees: 0, ignorees: [] };
    for (var i = 0; i < r.fiches.length; i += 300) {
      var b = rpc_(c, 'import_historique', { p_rows: r.fiches.slice(i, i + 300), p_detail: detail });
      bilan.creees += b.creees; bilan.remplacees += b.remplacees; bilan.ignorees = bilan.ignorees.concat(b.ignorees);
    }

    // Rangement + rapport ligne par ligne
    var traites = sousDossier_(sousDossier_(depot, 'Traités'), stamp);
    fichiers.forEach(function (f) { f.moveTo(traites); });
    var ss = SpreadsheetApp.create('Rapport import ' + stamp);
    DriveApp.getFileById(ss.getId()).moveTo(traites);
    var res = ss.getSheets()[0]; res.setName('Résumé');
    var p = r.plan.resume;
    res.getRange(1, 1, 8, 2).setValues([
      ['Fichiers', fichiers.map(function (f) { return f.getName(); }).join(', ')],
      ['Fiches créées', bilan.creees], ['Fiches remplacées (import précédent)', bilan.remplacees],
      ['Gardées (déjà saisies dans l’app)', p.ignoree], ['Lignes en erreur (non importées)', p.erreur],
      ['Fichiers illisibles', illisibles.join(' · ') || '–'],
      ['ZS inconnues (outils DPS)', r.notes && r.notes.zsInconnues.length ? r.notes.zsInconnues.join(', ') : '–'],
      ['Import du', Utilities.formatDate(t0, tz, 'dd/MM/yyyy HH:mm')],
    ]);
    res.getRange(1, 1, 8, 1).setFontWeight('bold'); res.autoResizeColumns(1, 2);
    var det = ss.insertSheet('Lignes');
    var lignes = [['ZS', 'Date', 'Ligne du modèle', 'Origine', 'Action', 'Erreurs', 'Remarques']].concat(r.plan.rows.map(function (x) {
      return [x.zs_nom || '', x.date || '', x.line || '', x.origine || '', x.action, x.errors.join(' · '), x.warnings.join(' · ')];
    }));
    det.getRange(1, 1, lignes.length, 7).setNumberFormat('@').setValues(lignes);
    det.setFrozenRows(1); det.getRange(1, 1, 1, 7).setFontWeight('bold');

    var statut = { at: t0.toISOString(), fichiers: fichiers.length, creees: bilan.creees, remplacees: bilan.remplacees, gardees: p.ignoree, erreurs: p.erreur, rapport_url: ss.getUrl() };
    UrlFetchApp.fetch(c.SUPABASE_URL + '/rest/v1/settings?on_conflict=key', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: Object.assign(headers_(c), { Prefer: 'resolution=merge-duplicates' }),
      payload: JSON.stringify([{ key: 'dernier_import_depot', value: statut }]),
    });
    var dest = [c.ALERTE_EMAIL, PropertiesService.getScriptProperties().getProperty('DEPOT_EMAIL')].filter(Boolean).join(',');
    MailApp.sendEmail(dest, 'SurvEpi : import du dépôt ' + stamp + (p.erreur ? ' (' + p.erreur + ' ligne(s) en erreur)' : ' OK'),
      'Fichiers : ' + fichiers.map(function (f) { return f.getName(); }).join(', ') + '\n\n' +
      'Fiches créées : ' + bilan.creees + '\nFiches remplacées : ' + bilan.remplacees + '\nGardées (déjà saisies dans l’app) : ' + p.ignoree +
      '\nLignes en erreur, non importées : ' + p.erreur + (illisibles.length ? '\nFichiers illisibles : ' + illisibles.join(' · ') : '') +
      '\n\nRapport ligne par ligne : ' + ss.getUrl() + '\nCorriger les lignes en erreur dans le fichier et le redéposer dans « ' + DEPOT_NOM + ' ».');
  } catch (e) {
    var cc = PropertiesService.getScriptProperties().getProperty('ALERTE_EMAIL');
    if (cc) MailApp.sendEmail(cc, 'SurvEpi : ÉCHEC de l’import du dépôt', String(e.stack || e) + '\n\nLes fichiers sont restés dans le dossier de dépôt : nouvel essai à l’heure suivante.');
    throw e;
  } finally {
    verrou.releaseLock();
  }
}
