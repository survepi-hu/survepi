// Référentiel ZS (règles de bascule), complétude, promptitude, consolidation provinciale,
// suivi des rapporteurs et notifications d'écart.
import { compute, completeness, isComplete, isSubmitted, ratio, validate } from './report.js';
import { addDays, dateRange, diffDays, hhmmToMin, isoDow, localParts, submissionOffset, epiWeek } from './time.js';

export const CATEGORIES = {
  touchee: 'Touchée',
  preparation: 'En préparation',
  post_flambee: 'Post-flambée',
};

/**
 * Catégorie effective d'une ZS à une date.
 * - En préparation -> touchée au 1er cas confirmé.
 * - Touchée -> post-flambée après N jours (42 par défaut) sans nouveau cas.
 */
export function zsCategory(zs, date, settings = {}) {
  const seuil = settings.jours_post_flambee ?? 42;
  if (!zs.date_premier_cas) return zs.categorie_manuelle || 'preparation'; // date du 1er cas inconnue : catégorie saisie
  if (zs.date_premier_cas > date) return 'preparation';
  const dernier = zs.date_dernier_cas || zs.date_premier_cas;
  if (diffDays(date, dernier) >= seuil) return 'post_flambee';
  return 'touchee';
}
export const groupOf = (cat) => (cat === 'preparation' ? 'preparation' : 'touchee');

export function joursSansCas(zs, date) {
  const dernier = zs.date_dernier_cas || zs.date_premier_cas;
  return dernier ? Math.max(0, diffDays(date, dernier)) : null;
}

export const deadlineOf = (zs, settings) => hhmmToMin(zs.heure_limite || settings.heure_limite || '16:30');

/** La ZS doit-elle rapporter ce jour-là ? */
export function isExpected(zs, date, settings = {}) {
  if (zs.actif === false) return false;
  if (zs.date_debut && date < zs.date_debut) return false;
  const cat = zsCategory(zs, date, settings);
  if (cat === 'touchee') return true;
  if ((zs.frequence || 'quotidienne') === 'quotidienne') return true;
  return isoDow(date) === Number(zs.jour_hebdo || 1);
}

/**
 * Ponctualité : 'a_temps' | 'en_retard' | 'non_recu' | 'en_attente'
 * nowParts = localParts(now, tz)
 */
export function timeliness(report, zs, date, settings, nowParts) {
  const deadline = deadlineOf(zs, settings);
  if (report?.source === 'historique' && isSubmitted(report)) return 'historique'; // heure d'envoi inconnue
  // Avant la mise en service, une fiche absente n'est pas « non reçue » : l'outil n'existait pas
  if (!report && settings.mise_en_service && date < settings.mise_en_service) return 'avant_service';
  if (isSubmitted(report)) {
    const off = submissionOffset(report.submitted_at, date, settings.fuseau);
    return off <= deadline ? 'a_temps' : 'en_retard';
  }
  if (date < nowParts.date || (date === nowParts.date && nowParts.minutes > deadline)) return 'non_recu';
  return 'en_attente';
}

/** Statut visuel d'une cellule ZS × jour (code couleur vert / orange / rouge / gris). */
export function cellState(report, zs, date, settings, nowParts, prev) {
  if (!isExpected(zs, date, settings)) return { state: 'na', tone: 'na', label: 'Non attendu' };
  const t = timeliness(report, zs, date, settings, nowParts);
  if (t === 'avant_service') return { state: 'na', tone: 'na', label: 'Avant la mise en service' };
  if (t === 'non_recu') return { state: 'non_recu', tone: 'bad', label: 'Non reçu' };
  if (t === 'en_attente') {
    if (report) return { state: 'brouillon', tone: 'pending', label: 'Brouillon en cours' };
    return { state: 'en_attente', tone: 'pending', label: 'En attente' };
  }
  const opts = { prev, seuilSuivi: settings.seuil_suivi };
  if (report.statut === 'a_corriger') return { state: 'a_corriger', tone: 'bad', label: 'À corriger', timeliness: t };
  const complete = isComplete(report, opts);
  if (!complete) return { state: 'incomplet', tone: 'warn', label: t === 'historique' ? 'Historique incomplet' : 'Incomplet', timeliness: t };
  if (t === 'historique') return { state: 'historique', tone: 'good', label: 'Historique (importé)', timeliness: t };
  if (t === 'en_retard') return { state: 'retard', tone: 'warn', label: 'Complet, en retard', timeliness: t };
  return { state: 'ok', tone: 'good', label: 'Complet à temps', timeliness: t };
}

/** Index des fiches par `${date}|${zs_id}` */
export function indexReports(reports) {
  const m = new Map();
  for (const r of reports) m.set(`${r.date}|${r.zs_id}`, r);
  return m;
}
const getR = (idx, date, zsId) => idx.get(`${date}|${zsId}`) || null;

const SUM_KEYS = ['alertes_validees', 'inv_report_entrant', 'inv_realisees_jour', 'inv_realisees_report', 'inv_moins_24h',
  'narratifs_attendus', 'narratifs_disponibles', 'mappings_attendus', 'mappings_disponibles',
  'ct_report', 'ct_identifies', 'ct_listes_24h', 'ct_listes_tardifs', 'ct_vus', 'ct_nonvus_veille', 'ct_rattrapes',
  'ct_sortie_21j', 'ct_sortie_symptomatiques', 'ct_sortie_confirmes', 'ct_sortie_perdus', 'ct_sortie_deplaces',
  'ct_sortie_decedes', 'ct_sortie_doublons', 'reco_actifs', 'superviseurs_reco'];
const COMP_KEYS = ['inv_non_faites', 'inv_report_sortant', 'inv_report_restant', 'inv_total_realisees', 'ct_a_suivre', 'ct_non_vus', 'ct_sorties', 'ct_non_listes_24h'];

/** Somme de fiches + taux recalculés sur les totaux (pas de moyenne de taux). */
export function aggregate(reports) {
  const t = Object.fromEntries([...SUM_KEYS, ...COMP_KEYS].map((k) => [k, 0]));
  for (const r of reports) {
    for (const k of SUM_KEYS) t[k] += Number(r[k]) || 0;
    const c = compute(r);
    for (const k of COMP_KEYS) t[k] += c[k];
  }
  t.n = reports.length;
  t.taux_inv = ratio(t.inv_realisees_jour, t.alertes_validees);
  t.taux_listage = ratio(t.ct_listes_24h, t.ct_identifies);
  t.taux_suivi = ratio(t.ct_vus, t.ct_a_suivre);
  t.taux_nonvus = ratio(t.ct_non_vus, t.ct_a_suivre);
  t.taux_narratifs = ratio(t.narratifs_disponibles, t.narratifs_attendus);
  t.taux_mappings = ratio(t.mappings_disponibles, t.mappings_attendus);
  t.taux_rattrapage = ratio(t.ct_rattrapes, t.ct_nonvus_veille);
  return t;
}

/** Ligne du tableau comparatif par ZS pour une date. */
export function zsRow(zs, date, idx, settings, nowParts) {
  const r = getR(idx, date, zs.id);
  const prev = getR(idx, addDays(date, -1), zs.id);
  const cat = zsCategory(zs, date, settings);
  const cell = cellState(r, zs, date, settings, nowParts, prev);
  const expected = isExpected(zs, date, settings) && cell.label !== 'Avant la mise en service';
  const opts = { prev, seuilSuivi: settings.seuil_suivi };
  return {
    zs, cat, expected, report: r, prev, cell,
    submitted: isSubmitted(r),
    completeness: r ? completeness(r, opts) : 0,
    c: r && isSubmitted(r) ? compute(r) : null,
    errors: r ? validate(r, opts).errors : [],
  };
}

/** Synthèse provinciale d'une date, séparée Touchées / En préparation. */
export function provincial(zsList, date, idx, settings, nowParts) {
  const rows = zsList.filter((z) => z.actif !== false).map((z) => zsRow(z, date, idx, settings, nowParts));
  const groups = {};
  for (const g of ['touchee', 'preparation', 'all']) {
    const gr = rows.filter((x) => x.expected && (g === 'all' || groupOf(x.cat) === g));
    const recues = gr.filter((x) => x.submitted);
    const aTemps = gr.filter((x) => x.cell.timeliness === 'a_temps');
    // Historique : compte comme complet (heure inconnue) et sort du calcul de la promptitude
    const completesATemps = gr.filter((x) => x.cell.state === 'ok' || x.cell.state === 'historique');
    const avecHeure = gr.filter((x) => x.cell.timeliness !== 'historique');
    groups[g] = {
      attendues: gr.length,
      recues: recues.length,
      a_temps: aTemps.length,
      completes_a_temps: completesATemps.length,
      taux_reception: ratio(recues.length, gr.length),
      promptitude: ratio(aTemps.length, avecHeure.length),
      completude: ratio(completesATemps.length, gr.length),
    };
  }
  const submittedReports = rows.filter((x) => x.submitted).map((x) => x.report);
  return { rows, groups, totals: aggregate(submittedReports) };
}

/** Série quotidienne provinciale (pour les tendances). */
export function dailySeries(zsList, from, to, idx, settings, nowParts) {
  return dateRange(from, to).map((d) => {
    const p = provincial(zsList, d, idx, settings, nowParts);
    return { date: d, ...p.totals, completude: p.groups.all.completude, promptitude: p.groups.all.promptitude,
      completude_touchees: p.groups.touchee.completude, completude_prep: p.groups.preparation.completude,
      recues: p.groups.all.recues, attendues: p.groups.all.attendues };
  });
}

/** Agrégation par semaine épidémiologique. */
export function weeklySeries(daily) {
  const by = new Map();
  for (const d of daily) {
    const w = epiWeek(d.date).label;
    if (!by.has(w)) by.set(w, []);
    by.get(w).push(d);
  }
  return [...by.entries()].map(([label, days]) => {
    const s = (k) => days.reduce((a, x) => a + (x[k] || 0), 0);
    const last = days[days.length - 1];
    const recues = s('recues'), attendues = s('attendues');
    return {
      label, from: days[0].date, to: last.date, jours: days.length,
      alertes_validees: s('alertes_validees'), inv_realisees_jour: s('inv_realisees_jour'), inv_realisees_report: s('inv_realisees_report'),
      taux_inv: ratio(s('inv_realisees_jour'), s('alertes_validees')),
      ct_identifies: s('ct_identifies'), ct_listes_24h: s('ct_listes_24h'), taux_listage: ratio(s('ct_listes_24h'), s('ct_identifies')),
      ct_vus: s('ct_vus'), ct_a_suivre: s('ct_a_suivre'), taux_suivi: ratio(s('ct_vus'), s('ct_a_suivre')),
      inv_report_sortant_fin: last.inv_report_sortant, ct_a_suivre_fin: last.ct_a_suivre,
      taux_reception: ratio(recues, attendues),
    };
  });
}

/**
 * Fiche rapporteur : jours consécutifs sans rapport, délai moyen, relances, ponctualité 7 et 30 j.
 */
export function rapporteurStats(actor, zsList, idx, settings, nowParts, notifications = []) {
  const zones = zsList.filter((z) => z.rapporteur_id === actor.id || z.suppleant_id === actor.id);
  const titulaire = zsList.filter((z) => z.rapporteur_id === actor.id);
  const end = nowParts.date;
  const window = (days) => {
    let attendus = 0, aTemps = 0, recus = 0; const delais = [];
    for (const z of titulaire) {
      for (const d of dateRange(addDays(end, -(days - 1)), end)) {
        if (!isExpected(z, d, settings)) continue;
        const r = getR(idx, d, z.id);
        const t = timeliness(r, z, d, settings, nowParts);
        if (t === 'en_attente' || t === 'historique' || t === 'avant_service') continue;
        attendus++;
        if (isSubmitted(r)) {
          recus++;
          delais.push(submissionOffset(r.submitted_at, d, settings.fuseau) - deadlineOf(z, settings));
        }
        if (t === 'a_temps') aTemps++;
      }
    }
    return { attendus, recus, a_temps: aTemps, ponctualite: ratio(aTemps, attendus),
      delai_moyen: delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null };
  };
  // Jours consécutifs sans rapport (sur la ZS la plus en retard)
  let consecutifs = 0;
  for (const z of titulaire) {
    let k = 0;
    for (let i = 0; i < 60; i++) {
      const d = addDays(end, -i);
      if (!isExpected(z, d, settings)) continue;
      const t = timeliness(getR(idx, d, z.id), z, d, settings, nowParts);
      if (t === 'en_attente') continue;
      if (t === 'non_recu') k++; else break;
    }
    consecutifs = Math.max(consecutifs, k);
  }
  const since30 = addDays(end, -29);
  const relances = notifications.filter((n) => n.destinataire_id === actor.id && n.type !== 'ouverture' && n.date >= since30 && !String(n.key || '').endsWith('|email')).length;
  return { zones, j7: window(7), j30: window(30), consecutifs, relances };
}

/**
 * Notifications d'écart pour une date :
 * 2 jours de suite sans rapport, taux de suivi sous le seuil, report d'investigations en hausse 2 jours de suite.
 */
export function gapAlerts(zsList, date, idx, settings, nowParts) {
  const out = [];
  const seuil = settings.seuil_suivi ?? 0.8;
  for (const z of zsList.filter((x) => x.actif !== false)) {
    // 2 jours attendus consécutifs non reçus
    const exp = [];
    for (let i = 0; i < 14 && exp.length < 2; i++) {
      const d = addDays(date, -i);
      if (!isExpected(z, d, settings)) continue;
      const t = timeliness(getR(idx, d, z.id), z, d, settings, nowParts);
      if (t === 'en_attente') continue;
      exp.push(t);
    }
    if (exp.length === 2 && exp.every((t) => t === 'non_recu'))
      out.push({ zs: z, type: 'sans_rapport', level: 'bad', msg: 'Deux jours de suite sans rapport' });
    const r0 = getR(idx, date, z.id);
    if (isSubmitted(r0)) {
      const c0 = compute(r0);
      if (c0.taux_suivi !== null && c0.taux_suivi < seuil)
        out.push({ zs: z, type: 'suivi_bas', level: 'warn', msg: `Taux de suivi ${Math.round(c0.taux_suivi * 100)} % (seuil ${Math.round(seuil * 100)} %)` });
      const r1 = getR(idx, addDays(date, -1), z.id), r2 = getR(idx, addDays(date, -2), z.id);
      if (isSubmitted(r1) && isSubmitted(r2)) {
        const a = compute(r2).inv_report_sortant, b = compute(r1).inv_report_sortant, c = c0.inv_report_sortant;
        if (a < b && b < c) out.push({ zs: z, type: 'report_hausse', level: 'warn', msg: `Report d'investigations en hausse : ${a} → ${b} → ${c}` });
      }
    }
  }
  return out;
}

export { localParts };
