// I. Situation épidémiologique : cumuls, aires de santé touchées, jours sans nouveau cas, détection des données.
// Principe (retour du sous-pilier, 22/10/2026) : la fiche ne contient que les ÉVÉNEMENTS du jour. Les cumuls sont
// recalculés à chaque fois = valeurs initiales de la ZS + somme des événements des fiches retenues. Une correction
// validée d'une fiche passée se répercute donc d'elle-même, sans jamais additionner des cumuls entre eux.
import { NUM_KEYS, compute, isSubmitted, FIELD_BY_KEY } from './report.js';
import { diffDays } from './time.js';

export const EPI_KEYS = ['cas_conf_vivants', 'cas_conf_decedes', 'cas_conf_ppl', 'deces_parmi_confirmes', 'gueris', 'deces_non_confirmes'];
const z = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const retenue = (r) => isSubmitted(r);

/** Fiches retenues d'une ZS jusqu'à `date` incluse, après la date des valeurs initiales. */
function fichesZs(zs, date, reports) {
  return reports.filter((r) => r.zs_id === zs.id && r.date <= date && retenue(r) && (!zs.base_date || r.date > zs.base_date));
}

/** Cumuls d'une ZS à la fin de `date`. */
export function cumulsZs(zs, date, reports) {
  const f = fichesZs(zs, date, reports);
  const somme = (k) => f.reduce((a, r) => a + z(r[k]), 0);
  const confirmes = z(zs.base_confirmes) + somme('cas_conf_vivants') + somme('cas_conf_decedes');
  const deces = z(zs.base_deces) + somme('cas_conf_decedes') + somme('deces_parmi_confirmes');
  const gueris = z(zs.base_gueris) + somme('gueris');
  return {
    confirmes, deces, gueris,
    ppl: z(zs.base_ppl) + somme('cas_conf_ppl'),
    deces_non_confirmes: z(zs.base_deces_non_confirmes) + somme('deces_non_confirmes'),
    actifs: confirmes - deces - gueris,                       // cas confirmés encore en cours
    letalite: confirmes > 0 ? deces / confirmes : null,       // NA si aucun cas
    renseigne: !!zs.base_date || f.some((r) => EPI_KEYS.some((k) => r[k] !== null && r[k] !== undefined)),
  };
}

/** Dates du 1er et du dernier cas confirmé d'après les fiches (ou null). */
export function datesCasFiches(zsId, reports) {
  let premier = null, dernier = null;
  for (const r of reports) {
    if (r.zs_id !== zsId || !retenue(r) || z(r.cas_conf_vivants) + z(r.cas_conf_decedes) === 0) continue;
    if (!premier || r.date < premier) premier = r.date;
    if (!dernier || r.date > dernier) dernier = r.date;
  }
  return { premier, dernier };
}

/**
 * ZS enrichies : dates du 1er / dernier cas confirmé = les plus extrêmes entre la saisie manuelle (référentiel)
 * et les fiches. La bascule touchée / post-flambée devient automatique.
 */
export function zsAvecDatesCas(zsList, reports) {
  return zsList.map((zs) => {
    const d = datesCasFiches(zs.id, reports);
    const premier = [zs.date_premier_cas, d.premier].filter(Boolean).sort()[0] || null;
    const dernier = [zs.date_dernier_cas, d.dernier].filter(Boolean).sort().at(-1) || null;
    return premier === zs.date_premier_cas && dernier === zs.date_dernier_cas ? zs : { ...zs, date_premier_cas: premier, date_dernier_cas: dernier };
  });
}

/** Jours consécutifs sans nouveau cas confirmé à `date` (null si aucun cas connu). */
export function joursSansNouveauCas(zs, date, reports) {
  const d = datesCasFiches(zs.id, reports.filter((r) => r.date <= date));
  const dernier = [zs.date_dernier_cas && zs.date_dernier_cas <= date ? zs.date_dernier_cas : null, d.dernier].filter(Boolean).sort().at(-1);
  return dernier ? Math.max(0, diffDays(date, dernier)) : null;
}

/**
 * Aires de santé touchées d'une ZS à `date` : Map id → { date, origine }.
 * Origine « initiale » (touchée avant la mise en service) ou la fiche qui l'a déclarée nouvelle.
 */
export function asTouchees(zsId, date, areas, reports) {
  const m = new Map();
  for (const a of areas) if (a.zs_id === zsId && a.touchee_le && a.touchee_le <= date) m.set(a.id, { date: a.touchee_le, origine: 'initiale' });
  for (const r of reports) {
    if (r.zs_id !== zsId || r.date > date || !retenue(r)) continue;
    for (const id of r.nouvelles_as || []) if (!m.has(id) || m.get(id).date > r.date) m.set(id, { date: r.date, origine: r.id });
  }
  return m;
}

/**
 * AS proposables comme « nouvelles » sur la fiche (zs, date) : actives, pas encore touchées à cette date,
 * et pas déjà déclarées nouvelles dans une autre fiche (quelle que soit sa date).
 */
export function asProposables(zsId, date, areas, reports, reportId) {
  const ailleurs = new Set(reports.filter((r) => r.zs_id === zsId && r.id !== reportId).flatMap((r) => r.nouvelles_as || []));
  return areas.filter((a) => a.zs_id === zsId && a.actif !== false && !(a.touchee_le && a.touchee_le <= date) && !ailleurs.has(a.id))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Situation épidémiologique d'une ZS à `date` (ligne du tableau de bord). */
export function situationZs(zs, date, reports, areas) {
  const r = reports.find((x) => x.zs_id === zs.id && x.date === date && retenue(x)) || null;
  const touchees = asTouchees(zs.id, date, areas, reports);
  const nouvelles = r ? (r.nouvelles_as || []).map((id) => areas.find((a) => a.id === id)?.nom || '?') : [];
  return {
    zs, report: r,
    jour: r ? { vivants: r.cas_conf_vivants, decedes: r.cas_conf_decedes, total: r.cas_conf_vivants === null && r.cas_conf_decedes === null ? null : compute(r).cas_conf_total,
      ppl: r.cas_conf_ppl, deces_parmi: r.deces_parmi_confirmes, gueris: r.gueris, deces_nc: r.deces_non_confirmes } : null,
    nouvelles_as: nouvelles,
    as_touchees: touchees.size,
    as_total: areas.filter((a) => a.zs_id === zs.id && a.actif !== false).length || zs.as_total || null,
    jours_sans_cas: joursSansNouveauCas(zs, date, reports),
    cumuls: cumulsZs(zs, date, reports),
  };
}

/** Synthèse provinciale : somme des ZS ; jours sans nouveau cas = le plus petit écart (dernier cas, toutes ZS). */
export function situationProvince(zsList, date, reports, areas) {
  const rows = zsList.filter((x) => x.actif !== false).map((zs) => situationZs(zs, date, reports, areas));
  const s = (f) => rows.reduce((a, x) => a + (f(x) || 0), 0);
  const jsc = rows.map((x) => x.jours_sans_cas).filter((x) => x !== null);
  const confirmes = s((x) => x.cumuls.confirmes), deces = s((x) => x.cumuls.deces);
  return {
    rows,
    totaux: {
      vivants: s((x) => x.jour?.vivants), decedes: s((x) => x.jour?.decedes), total: s((x) => x.jour?.total), ppl: s((x) => x.jour?.ppl),
      deces_parmi: s((x) => x.jour?.deces_parmi), gueris: s((x) => x.jour?.gueris), deces_nc: s((x) => x.jour?.deces_nc),
      nouvelles_as: rows.flatMap((x) => x.nouvelles_as.map((n) => `${n} (${x.zs.nom})`)),
      as_touchees: s((x) => x.as_touchees),
      jours_sans_cas: jsc.length ? Math.min(...jsc) : null,
      confirmes, deces, gueris_cumul: s((x) => x.cumuls.gueris), ppl_cumul: s((x) => x.cumuls.ppl), deces_nc_cumul: s((x) => x.cumuls.deces_non_confirmes),
      actifs: s((x) => x.cumuls.actifs), letalite: confirmes > 0 ? deces / confirmes : null,
      fiches: rows.filter((x) => x.report).length,
    },
  };
}

/** Contrôles qui demandent le contexte des jours précédents (avertissements, pas de blocage). */
export function avertissementsEpi(form, zs, reports) {
  const out = [];
  const veille = cumulsZs(zs, prevDay(form.date), reports.filter((r) => r.id !== form.id));
  const sorties = z(form.deces_parmi_confirmes) + z(form.gueris);
  if (sorties > Math.max(0, veille.actifs) + z(form.cas_conf_vivants))
    out.push({ field: 'gueris', msg: `Guéris + décès parmi les confirmés (${sorties}) dépassent les cas confirmés en cours (${Math.max(0, veille.actifs) + z(form.cas_conf_vivants)}). Vérifier les valeurs initiales de la ZS.` });
  return out;
}
const prevDay = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- Détection des données
export const ETATS = {
  nouveau: { label: 'Nouveau', tone: 'accent', aide: 'Valeur nouvellement renseignée ou différente du rapport précédent' },
  inchange: { label: 'Inchangé', tone: 'muted', aide: 'Même valeur que le rapport précédent' },
  corrige: { label: 'Corrigé', tone: 'warn', aide: 'Valeur modifiée après une validation (réouverture tracée)' },
  non_renseigne: { label: 'Non renseigné', tone: 'bad', aide: 'Aucune valeur (zéro compte comme une donnée rapportée)' },
};

/** Rapport précédent de la ZS (le dernier retenu avant cette date, quel que soit l'écart). */
export function rapportPrecedent(zsId, date, reports) {
  let best = null;
  for (const r of reports) if (r.zs_id === zsId && r.date < date && retenue(r) && (!best || r.date > best.date)) best = r;
  return best;
}

/**
 * État de chaque indicateur : nouveau / inchangé / corrigé / non renseigné.
 * versions : copies archivées de la fiche (report_versions.data). Zéro = donnée rapportée, vide = non renseigné.
 */
export function detection(form, precedent, versions = []) {
  const valides = versions.map((v) => v.data || v).filter((d) => ['valide_zs', 'valide_prov'].includes(d?.statut));
  const etats = {}, compte = { nouveau: 0, inchange: 0, corrige: 0, non_renseigne: 0 };
  for (const k of NUM_KEYS) {
    const v = form[k];
    let e;
    if (v === null || v === undefined || v === '') e = 'non_renseigne';
    else if (valides.some((d) => d[k] !== null && d[k] !== undefined && Number(d[k]) !== Number(v))) e = 'corrige';
    else if (!precedent || precedent[k] === null || precedent[k] === undefined || Number(precedent[k]) !== Number(v)) e = 'nouveau';
    else e = 'inchange';
    etats[k] = { etat: e, avant: precedent ? precedent[k] ?? null : null, valide: valides.length ? valides[valides.length - 1][k] ?? null : null };
    compte[e]++;
  }
  return { etats, compte };
}

/** Nouveautés d'une fiche : les indicateurs nouveaux ou corrigés, lisibles (pour la vue « Nouveautés du jour »). */
export function nouveautes(form, precedent, versions) {
  const { etats } = detection(form, precedent, versions);
  return Object.entries(etats).filter(([, x]) => x.etat === 'nouveau' || x.etat === 'corrige')
    .map(([k, x]) => ({ key: k, label: FIELD_BY_KEY[k].label, group: FIELD_BY_KEY[k].group, valeur: form[k], avant: x.avant, etat: x.etat }));
}
