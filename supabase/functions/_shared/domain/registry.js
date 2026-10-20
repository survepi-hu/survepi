// Registres détaillés : investigations, contacts (codes uniquement), suivi J1-J21, reports.
import { addDays, diffDays } from './time.js';

export const INV_STATUTS = {
  a_faire: 'À faire', en_cours: 'En cours', realisee: 'Réalisée', reportee: 'Reportée', cloturee: 'Clôturée',
};
export const CT_STATUTS = {
  actif: 'Actif', non_vu: 'Non vu', transfere: 'Transféré', perdu_vue: 'Perdu de vue', sorti_j21: 'Sorti J21',
  devenu_symptomatique: 'Devenu symptomatique', devenu_confirme: 'Devenu cas confirmé', decede: 'Décédé', autre: 'Autre sortie',
};
export const CT_ACTIFS = ['actif', 'non_vu'];
export const VISITE = { vu: 'Vu', non_vu: 'Non vu', reporte: 'Reporté', transfere: 'Transféré', sorti: 'Sorti', na: 'NA' };
export const ACTIONS = { poursuivre: 'Poursuivre', rattraper: 'Rattraper', transferer: 'Transférer', cloturer: 'Clôturer' };

/** Reporter une investigation : motif, nouvelle échéance et responsable obligatoires. */
export function deferInvestigation(inv, { motif, motif_detail = '', nouvelle_echeance, responsable_id }, todayStr) {
  const errors = [];
  if (!motif) errors.push('Motif obligatoire.');
  if (!nouvelle_echeance) errors.push('Nouvelle échéance obligatoire.');
  if (!responsable_id) errors.push('Responsable obligatoire.');
  if (nouvelle_echeance && nouvelle_echeance.slice(0, 10) < todayStr) errors.push("L'échéance ne peut pas être dans le passé.");
  if (inv.statut === 'cloturee') errors.push('Investigation clôturée : réouverture supervisée nécessaire.');
  if (errors.length) return { errors };
  const changed = (inv.nouvelle_echeance || null) !== nouvelle_echeance;
  const numero = (inv.nb_reports || 0) + (changed ? 1 : 0);
  return {
    errors: [],
    patch: { statut: 'reportee', motif_report: motif, motif_detail, nouvelle_echeance, responsable_id, nb_reports: numero },
    deferral: changed ? { objet: 'investigation', investigation_id: inv.id, code: inv.code, zs_id: inv.zs_id, date_initiale: inv.date_ref,
      date_report: todayStr, motif, motif_detail, responsable_id, nouvelle_echeance, numero, apure: false, date_apurement: null } : null,
  };
}

/** Réalisation : une investigation antérieure réalisée aujourd'hui compte comme « report apuré ». */
export function realisationKind(inv, dateRealisation) {
  return inv.date_ref < dateRealisation ? 'report_apure' : 'jour';
}

/** Dates de suivi d'un contact : J1 = lendemain de la dernière exposition, J21 = exposition + 21. */
export function contactDates(dateExposition, duree = 21) {
  if (!dateExposition) return { j1: null, j21: null };
  return { j1: addDays(dateExposition, 1), j21: addDays(dateExposition, duree) };
}

/** Listé dans les 24 h : écart identification -> listage ≤ 24 h (ou ≤ 1 jour calendaire si heures absentes). */
export function listedWithin24h(dateIdentification, dateListage) {
  if (!dateIdentification || !dateListage) return null;
  if (dateIdentification.length > 10 && dateListage.length > 10)
    return (Date.parse(dateListage) - Date.parse(dateIdentification)) <= 24 * 3600 * 1000;
  return diffDays(dateListage.slice(0, 10), dateIdentification.slice(0, 10)) <= 1;
}

export function jourSuivi(contact, dateStr) {
  if (!contact.date_exposition) return null;
  const j = diffDays(dateStr, contact.date_exposition);
  return j >= 1 && j <= (contact.duree || 21) ? j : null;
}

/** Grille J1-J21 : une ligne par jour avec la visite saisie (ou vide). */
export function followupGrid(contact, followups, todayStr) {
  const duree = contact.duree || 21;
  const byDay = new Map(followups.filter((f) => f.contact_id === contact.id).map((f) => [f.jour, f]));
  return Array.from({ length: duree }, (_, i) => {
    const jour = i + 1;
    const date = addDays(contact.date_exposition, jour);
    const f = byDay.get(jour) || null;
    let etat = f ? f.statut_visite : date < todayStr ? 'manquant' : date === todayStr ? 'du' : 'futur';
    return { jour, date, f, etat };
  });
}

/** Contact arrivé au bout de son suivi et toujours actif : proposer la sortie J21. */
export const shouldExitJ21 = (contact, todayStr) =>
  CT_ACTIFS.includes(contact.statut) && contact.date_exposition && todayStr > addDays(contact.date_exposition, contact.duree || 21);

/** Taux de sortie J21 = sortis J21 / arrivés à échéance J21 (registre). */
export function tauxSortieJ21(contacts, todayStr) {
  const echus = contacts.filter((c) => c.date_exposition && addDays(c.date_exposition, c.duree || 21) < todayStr);
  if (!echus.length) return null;
  return echus.filter((c) => c.statut === 'sorti_j21').length / echus.length;
}

/** Ancienneté d'un report non apuré, en jours depuis la date initiale. */
export const anciennete = (d, todayStr) => Math.max(0, diffDays(todayStr, d.date_initiale));
export function bucket(days) {
  if (days <= 1) return '1 jour';
  if (days === 2) return '2 jours';
  return '≥ 3 jours';
}

/** File « Action superviseur requise » : objets dont le nombre de reports atteint le seuil. */
export function needsSupervisor(obj, seuil = 2) {
  return (obj.nb_reports || 0) >= seuil && !['realisee', 'cloturee', 'sorti_j21'].includes(obj.statut);
}

/** Contrôle doublon de contact : même code, ou combinaison ZS + sexe + tranche d'âge + date d'exposition + cas source. */
export function findDuplicates(contacts) {
  const seen = new Map(), dups = [];
  for (const c of contacts) {
    const keys = [`code:${(c.code || '').trim().toLowerCase()}`,
      `combo:${c.zs_id}|${c.investigation_id}|${c.sexe}|${c.tranche_age}|${c.date_exposition}|${(c.aire_sante || '').toLowerCase()}|${(c.menage || '').toLowerCase()}`];
    for (const k of keys) {
      if (k.endsWith('|') || k === 'code:') continue;
      if (seen.has(k)) dups.push({ a: seen.get(k), b: c, rule: k.startsWith('code') ? 'Même code' : 'Même combinaison' });
      else seen.set(k, c);
    }
  }
  return dups;
}
