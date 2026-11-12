// Moteur de rappels : décide qui reçoit quel message, à quelle étape, sur quel canal.
// Pur et déterministe : la fonction serveur (cron toutes les 5 min) l'appelle avec l'heure
// courante et la liste des clés déjà envoyées, puis envoie et journalise.
import { isComplete, isSubmitted, missingFields } from './report.js';
import { deadlineOf, isExpected, indexReports } from './indicators.js';
import { addDays, fmtDate, hhmmToMin, localParts, minToHhmm } from './time.js';

export const DEFAULT_STEPS = [
  { id: 'ouverture', heure: '12:00', cible: 'tous', destinataires: ['rapporteur'], libelle: 'Rappel 1 (ouverture)' },
  { id: 'rappel2', heure: '15:00', cible: 'sans_rapport', destinataires: ['rapporteur', 'suppleant'], libelle: 'Rappel 2' },
  { id: 'final', heure: '16:00', cible: 'non_complet', destinataires: ['rapporteur', 'suppleant'], libelle: 'Rappel final', manquants: true },
  { id: 'escalade', heure: '16:45', cible: 'non_complet', destinataires: ['team_lead', 'mcz', 'validateur'], libelle: 'Escalade', manquants: true },
];

export const CIBLES = {
  tous: 'Toutes les ZS attendues sans rapport complet',
  sans_rapport: 'ZS sans rapport soumis',
  non_complet: 'ZS non soumises ou incomplètes',
};

const WINDOW_MIN = 60; // une étape manquée de plus d'une heure n'est plus rattrapée

function stateLabel(r, opts) {
  if (!isSubmitted(r)) return 'non reçu';
  if (!isComplete(r, opts)) return 'incomplet';
  return 'en retard';
}

export function renderMessage({ zs, date, etat, limite, manquants }) {
  const d = fmtDate(date);
  let s = `Rappel SurvEpi - ${zs.nom} - ${d}${d.endsWith('.') ? '' : '.'} Le reporting Investigations & Suivi des contacts est ${etat}. Heure limite : ${limite}.`;
  if (manquants && manquants.length) s += ` Éléments manquants : ${manquants.slice(0, 8).join(', ')}${manquants.length > 8 ? '…' : ''}.`;
  return s + ' Merci de compléter et soumettre.';
}

function isAvailable(actor) {
  return actor && (actor.statut || 'actif') === 'actif';
}

/** Destinataires d'une étape pour une ZS. Retourne [{id, nom, canal, adresse, copie_email}] */
export function recipientsFor(step, zs, actors) {
  const byId = Object.fromEntries(actors.map((a) => [a.id, a]));
  const out = [];
  const push = (a, role) => {
    if (!a) return;
    const canal = a.canal_prefere || (a.whatsapp ? 'whatsapp' : a.sms ? 'sms' : 'email');
    const adresse = canal === 'email' ? a.email : canal === 'sms' ? (a.sms || a.whatsapp) : canal === 'in_app' ? a.id : (a.whatsapp || a.sms);
    if (!out.find((x) => x.id === a.id)) out.push({ id: a.id, nom: a.nom, role, canal, adresse, secours: a.sms || null, copie_email: canal !== 'email' ? a.email || null : null });
  };
  for (const d of step.destinataires) {
    if (d === 'rapporteur') {
      const tit = byId[zs.rapporteur_id];
      if (isAvailable(tit)) push(tit, 'rapporteur');
      else push(byId[zs.suppleant_id], 'suppléant (titulaire absent)');
    } else if (d === 'suppleant') {
      if (isAvailable(byId[zs.suppleant_id])) push(byId[zs.suppleant_id], 'suppléant');
    } else if (d === 'mcz') {
      if (zs.mcz_contact) out.push({ id: `mcz:${zs.id}`, nom: zs.mcz_nom || `MCZ ${zs.nom}`, role: 'MCZ', canal: 'whatsapp', adresse: zs.mcz_contact, secours: zs.mcz_contact, copie_email: null });
    } else {
      for (const a of actors.filter((x) => x.role === d && isAvailable(x) && (!x.zs_ids?.length || x.zs_ids.includes(zs.id) || ['team_lead', 'validateur'].includes(d)))) push(a, d);
    }
  }
  return out;
}

/**
 * Plan des rappels dus à l'instant `now`.
 * @returns [{ key, date, zs_id, step, type, destinataire_id, nom, canal, adresse, secours, copie_email, message }]
 */
export function planReminders({ now = new Date(), zsList, actors, reports, settings, sentKeys = new Set() }) {
  const tz = settings.fuseau;
  const np = localParts(now, tz);
  const date = np.date;
  const idx = indexReports(reports);
  const steps = settings.rappels?.length ? settings.rappels : DEFAULT_STEPS;
  const globalDeadline = hhmmToMin(settings.heure_limite || '16:30');
  const out = [];

  for (const zs of zsList) {
    if (!isExpected(zs, date, settings)) continue;
    const r = idx.get(`${date}|${zs.id}`) || null;
    const prev = idx.get(`${addDays(date, -1)}|${zs.id}`) || null;
    const opts = { prev, seuilSuivi: settings.seuil_suivi };
    const complete = isSubmitted(r) && isComplete(r, opts);
    if (complete) continue; // arrêt des rappels dès un rapport complet
    const shift = deadlineOf(zs, settings) - globalDeadline; // heure limite propre à la ZS
    for (const step of steps) {
      const at = hhmmToMin(step.heure) + shift;
      if (np.minutes < at || np.minutes >= at + WINDOW_MIN) continue;
      if (step.cible === 'sans_rapport' && isSubmitted(r)) continue;
      const manquants = step.manquants && r ? missingFields(r, opts) : step.manquants ? ['fiche non commencée'] : [];
      const message = renderMessage({ zs, date, etat: stateLabel(r, opts), limite: minToHhmm(deadlineOf(zs, settings)), manquants });
      for (const dest of recipientsFor(step, zs, actors)) {
        const key = `${date}|${zs.id}|${step.id}|${dest.id}`;
        if (sentKeys.has(key)) continue;
        out.push({ key, date, zs_id: zs.id, step: step.id, type: step.id, destinataire_id: dest.id, nom: dest.nom, role: dest.role,
          canal: dest.canal, adresse: dest.adresse, secours: dest.secours, copie_email: dest.copie_email, message, prevu_a: minToHhmm(at),
          zs_nom: zs.nom, etat: stateLabel(r, opts), manquants, libelle: step.libelle, limite: minToHhmm(deadlineOf(zs, settings)) });
      }
    }
  }
  return out;
}

/**
 * Rappels des registres : reports d'investigations / contacts arrivés à échéance non apurés (J+1 matin),
 * et escalade superviseur quand le nombre de reports atteint le seuil.
 */
export function planDeferralReminders({ now = new Date(), deferrals, actors, zsList, settings, sentKeys = new Set() }) {
  const np = localParts(now, settings.fuseau);
  const at = hhmmToMin(settings.heure_rappel_reports || '08:00');
  if (np.minutes < at || np.minutes >= at + WINDOW_MIN) return [];
  const byId = Object.fromEntries(actors.map((a) => [a.id, a]));
  const zsById = Object.fromEntries(zsList.map((z) => [z.id, z]));
  const out = [];
  for (const d of deferrals.filter((x) => !x.apure && x.nouvelle_echeance && x.nouvelle_echeance.slice(0, 10) < np.date)) {
    const resp = byId[d.responsable_id];
    if (!resp) continue;
    const key = `${np.date}|${d.objet}|${d.investigation_id || d.contact_id}|echeance|${resp.id}`;
    if (sentKeys.has(key)) continue;
    const zs = zsById[d.zs_id];
    out.push({ key, date: np.date, zs_id: d.zs_id, step: 'report_echu', type: 'report_echu', destinataire_id: resp.id, nom: resp.nom,
      canal: resp.canal_prefere || 'whatsapp', adresse: (resp.canal_prefere === 'email' ? resp.email : null) || resp.whatsapp || resp.sms || resp.email,
      copie_email: resp.canal_prefere !== 'email' ? resp.email || null : null,
      message: `Rappel SurvEpi - ${zs?.nom || ''}. ${d.objet === 'investigation' ? 'Investigation' : 'Contact'} ${d.code} reporté(e) au ${fmtDate(d.nouvelle_echeance.slice(0, 10))}, toujours non apuré(e). Merci de mettre à jour le registre.` });
  }
  return out;
}


/**
 * Alertes sur événement (cahier des charges, 17) envoyées par e-mail à chaque destinataire qui a une adresse
 * (sinon notification interne). Circuit de la fiche :
 *  - soumission (statut « soumis ») -> 1er validateur (niveau ZS) : action attendue ;
 *  - 1re validation -> 2e validateur (niveau province, autre personne) : action attendue ;
 *  - 2e validation -> toute la chaîne (rapporteur, suppléant, auteur, validateurs, data managers) ;
 *  - retour pour correction -> rapporteur, suppléant et auteur de la soumission (+ 1er validateur si retour par la province) ;
 *  - réouverture, seuil de reports dépassé.
 * Clés stables (une seule alerte par événement et par destinataire), indépendantes du jour.
 */
export function planEventAlerts({ now = new Date(), validations = [], reports = [], investigations = [], contacts = [], actors, zsList, settings, sentKeys = new Set() }) {
  const np = localParts(now, settings.fuseau);
  const zsById = Object.fromEntries(zsList.map((z) => [z.id, z]));
  const repById = Object.fromEntries(reports.map((r) => [r.id, r]));
  const actById = Object.fromEntries(actors.map((a) => [a.id, a]));
  const lien = settings.app_url || 'https://survepidemio.pages.dev';
  const out = [];
  const envoyer = (key, a, role, zs, sujet, corps) => {
    if (!a || sentKeys.has(key) || out.some((o) => o.key === key)) return;
    out.push({ key, date: np.date, zs_id: zs?.id || null, step: role, type: role, destinataire_id: a.id, nom: a.nom,
      canal: a.email ? 'email' : 'in_app', adresse: a.email || a.id, message: `${sujet}. ${corps}`, mode: 'auto', statut: a.email ? 'en_attente' : 'envoye' });
  };
  const actif = (a) => a && (a.statut || 'actif') === 'actif' && a.actif !== false;
  const uniques = (liste) => [...new Map(liste.filter(actif).map((a) => [a.id, a])).values()];
  const rapporteurs = (zs) => recipientsFor({ destinataires: ['rapporteur', 'suppleant'] }, zs, actors).map((d) => actById[d.id]).filter(Boolean);
  const parRole = (roles, zs) => actors.filter((a) => roles.includes(a.role) && actif(a) && (!a.zs_ids?.length || !zs || a.zs_ids.includes(zs.id) || ['team_lead', 'validateur', 'data_manager', 'admin'].includes(a.role)));
  const niveau1 = (zs) => { const n = parRole(settings.roles_validation_zs || ['epidemiologiste'], zs); return n.length ? n : parRole(['validateur'], zs); };
  const niveau2 = (zs, sauf) => parRole(settings.roles_validation_prov || ['validateur', 'team_lead'], zs).filter((a) => a.id !== sauf);
  const parUser = (uid) => uid ? actors.find((a) => a.user_id === uid) : null;
  const auteur = (r) => ['soumis', 'incomplet', 'a_corriger', 'valide_zs', 'valide_prov'].includes(r.statut) ? parUser(r.submitted_by || r.updated_by) : null;
  const titre = (zs, r, etat) => `SurvEpi - ${zs.nom} - ${fmtDate(r.date)} : ${etat}`;
  const limite = new Date(now.getTime() - 2 * 864e5).toISOString();

  // Soumission : le 1er validateur doit agir
  for (const r of reports) {
    const zs = zsById[r.zs_id]; const quand = r.resubmitted_at || r.submitted_at;
    if (!zs || r.statut !== 'soumis' || !quand || new Date(quand).toISOString() < limite) continue;
    const qui = auteur(r);
    for (const a of uniques(niveau1(zs)).filter((x) => x.id !== qui?.id)) envoyer(`evt|soumis|${r.id}|${quand}|${a.id}`, a, 'validation_attendue', zs,
      titre(zs, r, `fiche ${r.resubmitted_at ? 'resoumise' : 'soumise'}, 1re validation attendue`),
      `${qui ? `${qui.nom} a soumis la fiche. ` : ''}Merci de la vérifier puis de faire la 1re validation (ZS) ou de la retourner pour correction : ${lien}`);
  }

  for (const v of validations) {
    const r = repById[v.report_id]; const zs = r && zsById[r.zs_id];
    if (!r || !zs) continue;
    const par = actById[v.actor_id];
    if (v.action === 'retourner') {
      const dest = [...rapporteurs(zs), auteur(r), ...(v.from_statut === 'valide_zs' ? niveau1(zs) : [])];
      for (const a of uniques(dest).filter((x) => x.id !== v.actor_id)) envoyer(`evt|retour|${v.id}|${a.id}`, a, 'correction_demandee', zs, titre(zs, r, 'fiche rejetée, correction demandée'),
        `${par ? `${par.nom} a retourné la fiche` : 'La fiche est retournée'} pour correction${v.commentaire ? ` : « ${v.commentaire} »` : ''}. Merci de revoir le rapport et de le resoumettre : ${lien}`);
    } else if (v.action === 'rouvrir') {
      for (const a of uniques(rapporteurs(zs))) envoyer(`evt|rouvert|${v.id}|${a.id}`, a, 'fiche_rouverte', zs, titre(zs, r, 'fiche rouverte'),
        `La fiche validée a été rouverte pour correction (modification tracée).${v.commentaire ? ` Motif : « ${v.commentaire} ».` : ''} ${lien}`);
    } else if (v.action === 'valider_zs') {
      for (const a of uniques(niveau2(zs, v.actor_id))) envoyer(`evt|attente2|${v.id}|${a.id}`, a, 'validation_attendue', zs, titre(zs, r, '2e validation attendue'),
        `${par ? `${par.nom} a fait` : 'La fiche a reçu'} la 1re validation (ZS). Merci de faire la 2e validation (province) ou de la retourner pour correction : ${lien}`);
      for (const a of uniques([...rapporteurs(zs), auteur(r)])) envoyer(`evt|valide|${v.id}|${a.id}`, a, 'validation_effectuee', zs, titre(zs, r, '1re validation faite'),
        'La fiche a reçu la 1re validation (ZS) et attend la 2e validation (province).');
    } else if (v.action === 'valider_prov') {
      const chaine = [...rapporteurs(zs), auteur(r), actById[r.validated_zs_by], ...niveau1(zs), ...niveau2(zs), ...parRole(['data_manager'], zs)];
      for (const a of uniques(chaine)) envoyer(`evt|valide|${v.id}|${a.id}`, a, 'validation_effectuee', zs, titre(zs, r, 'fiche validée'),
        `2e validation (province) faite${par ? ` par ${par.nom}` : ''}. La fiche est validée : c'est désormais une donnée officielle.`);
    }
  }
  const seuil = Number(settings.seuil_escalade_reports ?? 2);
  for (const [objet, liste, ouvert] of [['investigation', investigations, (x) => !['realisee', 'cloturee'].includes(x.statut)], ['contact', contacts, (x) => !['sorti_j21', 'sorti', 'decede'].includes(x.statut)]]) {
    for (const o of liste.filter((x) => (x.nb_reports || 0) >= seuil && ouvert(x))) {
      const zs = zsById[o.zs_id];
      for (const a of parRole(['epidemiologiste', 'team_lead'], zs)) envoyer(`evt|seuil|${objet}|${o.id}|${o.nb_reports}|${a.id}`, a, 'seuil_reports', zs,
        `SurvEpi - ${zs?.nom || ''} : action superviseur requise`, `${objet === 'investigation' ? 'Investigation' : 'Contact'} ${o.code || ''} reporté(e) ${o.nb_reports} fois (seuil : ${seuil}). Merci d’intervenir.`);
    }
  }
  return out;
}

/** Colonnes de la table notifications : tout le reste (rôle, heure prévue, état…) sert au calcul et n'est pas stocké. */
export const NOTIF_COLS = ['key', 'date', 'zs_id', 'step', 'type', 'destinataire_id', 'nom', 'canal', 'adresse', 'message', 'mode', 'lien', 'statut', 'erreur'];
export const toNotifRow = (row) => Object.fromEntries(NOTIF_COLS.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));

// ------------------------------------------------------------------ Canaux
// Sans compte WhatsApp Business : les messages WhatsApp sont préparés par le système et
// envoyés à la main (lien wa.me pré-rempli), les e-mails partent automatiquement.

/** Lien WhatsApp pré-rempli. Sans numéro : WhatsApp demande le destinataire (ex. le groupe). */
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Message unique pour le groupe WhatsApp SurvEpi : toutes les ZS concernées par une étape. */
export function groupMessage(items) {
  const first = items[0];
  const byZs = new Map();
  for (const it of items) if (!byZs.has(it.zs_id)) byZs.set(it.zs_id, it);
  const z = [...byZs.values()];
  const nonRecu = z.filter((x) => x.etat === 'non reçu').map((x) => x.zs_nom);
  const incomplet = z.filter((x) => x.etat === 'incomplet').map((x) => `${x.zs_nom}${x.manquants?.length ? ` (${x.manquants.slice(0, 3).join(', ')})` : ''}`);
  let s = `Rappel SurvEpi - ${fmtDate(first.date)} - ${first.libelle || first.step}. Reporting Investigations & Suivi des contacts, heure limite ${first.limite || ''}.`;
  if (nonRecu.length) s += ` Non reçu : ${nonRecu.join(', ')}.`;
  if (incomplet.length) s += ` Incomplet : ${incomplet.join(' ; ')}.`;
  return s + ' Merci de compléter et soumettre.';
}

/**
 * Transforme le plan en lignes de notification selon les canaux disponibles.
 * settings.whatsapp_mode : 'manuel' (défaut) | 'api'
 * settings.email_auto    : true (défaut)
 * settings.sms_actif     : false (défaut) ; si inactif, un numéro SMS passe en WhatsApp manuel
 * settings.whatsapp_groupe : true => un message récapitulatif par étape pour le groupe
 * Retourne des lignes { key, ..., canal, mode: 'auto'|'manuel', statut, lien? }
 */
export function dispatch(plan, settings = {}) {
  const manual = (settings.whatsapp_mode || 'manuel') === 'manuel';
  const emailAuto = settings.email_auto !== false;
  const smsOn = settings.sms_actif === true;
  const rows = [];
  const base = (p) => { const { secours, copie_email, manquants, etat, zs_nom, libelle, limite, ...rest } = p; return rest; };
  for (const p of plan) {
    let canal = p.canal;
    let adresse = p.adresse;
    if (canal === 'sms' && !smsOn) { canal = 'whatsapp'; adresse = p.adresse || p.secours; }
    if (canal === 'whatsapp' && manual) {
      rows.push({ ...base(p), canal: 'whatsapp', adresse, mode: 'manuel', statut: 'a_envoyer', lien: waLink(adresse, p.message) });
    } else if (canal === 'email') {
      rows.push({ ...base(p), canal: 'email', adresse, mode: 'auto', statut: emailAuto && adresse ? 'en_attente' : 'echec', erreur: adresse ? null : 'Adresse e-mail manquante' });
    } else if (canal === 'in_app') {
      rows.push({ ...base(p), canal, adresse, mode: 'auto', statut: 'envoye' });
    } else {
      rows.push({ ...base(p), canal, adresse, mode: 'auto', statut: 'en_attente', secours: p.secours });
    }
    if (p.copie_email && emailAuto && canal !== 'email')
      rows.push({ ...base(p), key: `${p.key}|email`, canal: 'email', adresse: p.copie_email, mode: 'auto', statut: 'en_attente' });
  }
  if (manual && settings.whatsapp_groupe !== false) {
    const bySteps = new Map();
    for (const p of plan.filter((x) => x.zs_nom && x.step !== 'report_echu')) {
      const k = `${p.date}|${p.step}`;
      if (!bySteps.has(k)) bySteps.set(k, []);
      bySteps.get(k).push(p);
    }
    for (const [k, items] of bySteps) {
      const message = groupMessage(items);
      rows.push({ key: `${k}|groupe`, date: items[0].date, zs_id: null, step: items[0].step, type: items[0].type, destinataire_id: 'groupe',
        nom: settings.whatsapp_groupe_nom || 'Groupe WhatsApp SurvEpi', role: 'groupe', canal: 'whatsapp', adresse: '', mode: 'manuel',
        statut: 'a_envoyer', message, lien: waLink('', message), prevu_a: items[0].prevu_a });
    }
  }
  return rows;
}
