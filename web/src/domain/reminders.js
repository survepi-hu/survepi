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
      canal: resp.canal_prefere || 'whatsapp', adresse: resp.whatsapp || resp.sms || resp.email,
      message: `Rappel SurvEpi - ${zs?.nom || ''}. ${d.objet === 'investigation' ? 'Investigation' : 'Contact'} ${d.code} reporté(e) au ${fmtDate(d.nouvelle_echeance.slice(0, 10))}, toujours non apuré(e). Merci de mettre à jour le registre.` });
  }
  return out;
}


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
