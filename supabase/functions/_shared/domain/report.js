// Fiche journalière Date × ZS : définition des champs, calculs, contrôles, complétude.
// Module pur (aucune dépendance au navigateur) : utilisé par le front, les tests
// et la fonction de rappels côté serveur.

export const MOTIFS_INVESTIGATION = [
  ['insecurite', 'Insécurité'],
  ['resistance', 'Résistance communautaire'],
  ['carburant', 'Carburant / logistique'],
  ['eloignement', 'Éloignement'],
  ['equipe_indispo', 'Équipe indisponible'],
  ['autre', 'Autre'],
];

export const MOTIFS_SUIVI = [
  ['absent', 'Contact absent du domicile'],
  ['refus', 'Refus / résistance'],
  ['insecurite', 'Insécurité'],
  ['acces', 'Accès difficile / pluie'],
  ['reco_indispo', 'RECO indisponible'],
  ['adresse', 'Adresse introuvable'],
  ['autre', 'Autre'],
];

export const SORTIES = [
  ['ct_sortie_21j', '21 jours terminés'],
  ['ct_sortie_symptomatiques', 'Devenus symptomatiques'],
  ['ct_sortie_confirmes', 'Devenus cas confirmés'],
  ['ct_sortie_perdus', 'Perdus de vue'],
  ['ct_sortie_deplaces', 'Déplacés / transférés'],
  ['ct_sortie_decedes', 'Décédés'],
  ['ct_sortie_doublons', 'Doublons retirés'],
];

/**
 * Date d'entrée en vigueur de la matrice harmonisée V2.1 (alertes, recherche active, décès des sous-groupes
 * à la confirmation). Avant cette date, ces champs ne comptent pas dans la complétude : les fiches déjà
 * saisies ne deviennent pas incomplètes après coup.
 */
export const MATRICE_V21 = '2026-11-09';

/** Sources des alertes (somme = alertes du jour). */
export const SOURCES_ALERTES = [
  ['src_ess', 'ESS (formations sanitaires)'],
  ['src_communaute', 'Communauté'],
  ['src_ra', 'Recherche active (RA)'],
  ['src_poe', 'PoE / PoC'],
];

/** Types de sites visités en recherche active (somme = visites réalisées, plan + hors plan). */
export const SITES_RA = [
  ['ra_site_hgr', 'Hôpital général de référence'],
  ['ra_site_ch', 'Centre hospitalier'],
  ['ra_site_cm', 'Centre médical'],
  ['ra_site_cs', 'Centre de santé'],
  ['ra_site_labo', 'Laboratoire'],
  ['ra_site_ps', 'Poste de santé'],
  ['ra_site_disp', 'Dispensaire'],
  ['ra_site_tradi', 'Tradipraticien'],
  ['ra_site_priere', 'Maison de prière'],
  ['ra_site_pharma', 'Pharmacie'],
];

/**
 * Sous-groupes suivis parmi les cas confirmés (peuvent se recouper : jamais additionnés au total).
 * Pour chacun : nouveaux confirmés (dont déjà décédés à la confirmation), décès ultérieurs parmi les déjà
 * confirmés, guéris du jour, et leurs valeurs initiales par ZS. Décès du sous-groupe = confDec + deces.
 */
export const SOUS_GROUPES = [
  { id: 'ppl', label: 'Personnel de Première Ligne (PPL)', court: 'PPL', bas: 'PPL', conf: 'cas_conf_ppl', confDec: 'cas_conf_decedes_ppl', deces: 'deces_ppl', gueris: 'gueris_ppl',
    base: 'base_ppl', base_deces: 'base_deces_ppl', base_gueris: 'base_gueris_ppl' },
  { id: 'moins5', label: 'Enfants de moins de 5 ans', court: '< 5 ans', bas: '< 5 ans', conf: 'cas_conf_moins5', confDec: 'cas_conf_decedes_moins5', deces: 'deces_moins5', gueris: 'gueris_moins5',
    base: 'base_moins5', base_deces: 'base_deces_moins5', base_gueris: 'base_gueris_moins5' },
  { id: 'eleves', label: 'Élèves', court: 'Élèves', bas: 'élèves', conf: 'cas_conf_eleves', confDec: 'cas_conf_decedes_eleves', deces: 'deces_eleves', gueris: 'gueris_eleves',
    base: 'base_eleves', base_deces: 'base_deces_eleves', base_gueris: 'base_gueris_eleves' },
];

/** Champs numériques saisis. required = compte dans la complétude. */
export const FIELDS = [
  // 1. Alertes (données agrégées, aucun détail d'alerte stocké)
  { key: 'alertes_report', depuis: MATRICE_V21, label: 'Report alertes (stock initial)', group: 'alertes', required: true, carry: true,
    help: 'Alertes non clôturées à l’ouverture : pré-rempli avec le report final de la veille.' },
  { key: 'alertes_vivantes', depuis: MATRICE_V21, label: 'Nouvelles alertes vivantes', group: 'alertes', required: true },
  { key: 'alertes_deces', depuis: MATRICE_V21, label: 'Nouvelles alertes décès', group: 'alertes', required: true },
  { key: 'alertes_validees', label: 'Alertes validées (cas suspects)', short: 'A', group: 'alertes', required: true, aliases: ['Alertes validées du jour'],
    help: 'Validées comme cas suspects. Ce chiffre alimente le module Investigations.' },
  { key: 'alertes_investiguees', depuis: MATRICE_V21, label: 'Alertes investiguées', group: 'alertes', required: true,
    help: 'En principe égal aux investigations réalisées du jour (du jour + reports apurés) : un écart est signalé.' },
  { key: 'suspects_isoles', depuis: MATRICE_V21, label: 'Suspects isolés', group: 'alertes', required: true },
  { key: 'suspects_preleves', depuis: MATRICE_V21, label: 'Suspects prélevés', group: 'alertes', required: true },
  ...SOURCES_ALERTES.map(([key, label]) => ({ key, label, group: 'sources', required: true, depuis: MATRICE_V21 })),
  { key: 'alertes_report_final', depuis: MATRICE_V21, label: 'Report final (alertes non clôturées)', group: 'alertes', required: true,
    help: 'Stock d’alertes encore ouvertes en fin de journée : devient le report de demain.' },
  // 2. Recherche active
  { key: 'ra_planifiees', depuis: MATRICE_V21, label: 'Visites planifiées', group: 'ra', required: true },
  { key: 'ra_realisees_plan', depuis: MATRICE_V21, label: 'Visites planifiées réalisées', group: 'ra', required: true },
  { key: 'ra_non_planifiees', depuis: MATRICE_V21, label: 'Visites non planifiées réalisées', group: 'ra', required: true,
    help: 'Visites hors plan, enregistrées à part : elles ne comptent pas dans le taux de recherche active.' },
  ...SITES_RA.map(([key, label]) => ({ key, label, group: 'sites', required: false })),
  { key: 'ra_ess_dossiers', depuis: MATRICE_V21, label: 'ESS : dossiers / registres examinés', group: 'ra_ess', required: true },
  { key: 'ra_ess_detectees', depuis: MATRICE_V21, label: 'ESS : alertes détectées', group: 'ra_ess', required: true },
  { key: 'ra_ess_validees', depuis: MATRICE_V21, label: 'ESS : alertes validées comme cas suspects', group: 'ra_ess', required: true },
  { key: 'ra_ess_en_cours', depuis: MATRICE_V21, label: 'ESS : alertes en cours de validation', group: 'ra_ess', required: true },
  { key: 'ra_com_detectees', depuis: MATRICE_V21, label: 'Communauté : alertes détectées', group: 'ra_com', required: true },
  { key: 'ra_com_verifiees', depuis: MATRICE_V21, label: 'Communauté : alertes vérifiées', group: 'ra_com', required: true },
  { key: 'ra_com_validees', depuis: MATRICE_V21, label: 'Communauté : alertes validées comme cas suspects', group: 'ra_com', required: true },
  { key: 'ra_com_deces_signales', depuis: MATRICE_V21, label: 'Communauté : décès suspects signalés', group: 'ra_com', required: true },
  { key: 'ra_com_deces_investigues', depuis: MATRICE_V21, label: 'Communauté : décès suspects investigués', group: 'ra_com', required: true },
  // 3. Situation épidémiologique : événements du jour seulement (les cumuls sont calculés, jamais saisis)
  { key: 'cas_conf_vivants', label: 'Nouveaux cas confirmés vivants', group: 'epi', required: true },
  { key: 'cas_conf_decedes', label: 'Nouveaux cas confirmés décédés', group: 'epi', required: true,
    help: 'Confirmés ce jour et déjà décédés au moment de la confirmation.' },
  ...SOUS_GROUPES.flatMap((g) => [
    { key: g.conf, label: g.id === 'ppl' ? 'dont PPL' : `dont ${g.id === 'moins5' ? 'enfants < 5 ans' : 'élèves'}`, group: 'epi', required: true, sg: g.id,
      help: `${g.id === 'ppl' ? 'PPL = Personnel de Première Ligne. ' : ''}Parmi les nouveaux cas confirmés du jour (vivants + décédés)${g.id === 'eleves' ? ', élèves selon la définition validée par la coordination' : ''}.` },
    { key: g.confDec, label: `dont ${g.bas} déjà décédés`, group: 'epi', required: true, sg: g.id, depuis: MATRICE_V21,
      help: `Parmi les nouveaux ${g.bas} confirmés du jour, décédés au moment de la confirmation.` },
  ]),
  { key: 'deces_parmi_confirmes', label: 'Nouveaux décès parmi les cas confirmés', group: 'epi', required: true,
    help: 'Cas confirmés vivants les jours précédents, décédés aujourd’hui. Ce ne sont pas de nouveaux cas.' },
  ...SOUS_GROUPES.map((g) => ({ key: g.deces, label: `dont décès de ${g.bas} déjà confirmés`, group: 'epi', required: true, sg: g.id,
    help: `Parmi les nouveaux décès de cas déjà confirmés, ${g.bas} confirmés les jours précédents.` })),
  { key: 'gueris', label: 'Nouveaux guéris du jour', group: 'epi', required: true },
  ...SOUS_GROUPES.map((g) => ({ key: g.gueris, label: `dont ${g.bas} guéris`, group: 'epi', required: true, sg: g.id, help: 'Parmi les nouveaux guéris du jour.' })),
  { key: 'deces_non_confirmes', label: 'Décès probables / communautaires (non confirmés)', group: 'epi', required: false,
    help: 'Suivis à part : jamais ajoutés au cumul des décès parmi les cas confirmés ni à la létalité.' },
  // II. Investigations
  { key: 'inv_report_entrant', label: 'Report des investigations entrant', short: 'R', group: 'inv', required: true, carry: true,
    help: 'Pré-rempli avec le report sortant de la veille.' },
  { key: 'inv_realisees_jour', label: 'Réalisées sur les alertes du jour', short: 'Ij', group: 'inv', required: true },
  { key: 'inv_realisees_report', label: 'Réalisées sur le report (reports apurés)', short: 'Ir', group: 'inv', required: true },
  { key: 'inv_moins_24h', label: 'Dont réalisées en moins de 24 h', group: 'inv', required: false },
  { key: 'narratifs_attendus', label: 'Narratifs attendus', group: 'doc', required: false },
  { key: 'narratifs_disponibles', label: 'Narratifs disponibles', group: 'doc', required: false },
  { key: 'mappings_attendus', label: 'Mappings attendus', group: 'doc', required: false },
  { key: 'mappings_disponibles', label: 'Mappings disponibles', group: 'doc', required: false },
  // Contacts
  { key: 'ct_report', label: 'Report des contacts (actifs de la veille)', group: 'ct', required: true, carry: true,
    help: 'Pré-rempli avec les contacts à suivre de la veille.' },
  { key: 'ct_identifies', label: 'Contacts identifiés aujourd’hui', group: 'ct', required: true },
  { key: 'ct_listes_24h', label: 'Contacts listés dans les 24 h', group: 'ct', required: true },
  { key: 'ct_listes_tardifs', label: 'Contacts listés hors délai (> 24 h)', group: 'ct', required: false,
    help: 'Contacts des jours précédents listés aujourd’hui. Entrent dans le suivi mais pas dans le taux de listage.' },
  ...SORTIES.map(([key, label]) => ({ key, label, group: 'sorties', required: true })),
  { key: 'ct_vus', label: 'Contacts vus', group: 'suivi', required: true },
  { key: 'ct_nonvus_veille', label: 'Non-vus de la veille', group: 'suivi', required: false, carry: true },
  { key: 'ct_rattrapes', label: 'dont rattrapés aujourd’hui', group: 'suivi', required: false },
  { key: 'reco_actifs', label: 'RECO actifs', group: 'reco', required: true },
  { key: 'superviseurs_reco', label: 'Superviseurs RECO', group: 'reco', required: false },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
/** Champ obligatoire pour cette fiche (les champs datés ne le sont qu'à partir de leur date d'entrée en vigueur). */
export const requis = (f, r) => f.required && (!f.depuis || !r?.date || r.date >= f.depuis);
export const NUM_KEYS = FIELDS.map((f) => f.key);

export const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'muted' },
  soumis: { label: 'Soumis', tone: 'info' },
  incomplet: { label: 'Incomplet', tone: 'warn' },
  a_corriger: { label: 'À corriger', tone: 'bad' },
  valide_zs: { label: 'Validé ZS (1/2)', tone: 'info' },
  valide_prov: { label: 'Validé province (2/2)', tone: 'good' },
  rouvert: { label: 'Rouvert', tone: 'warn' },
};
export const SUBMITTED_STATUSES = ['soumis', 'incomplet', 'a_corriger', 'valide_zs', 'valide_prov', 'rouvert'];
/** Fiche reconstituée à partir des données d'avant l'app : validée, sans heure de soumission. */
export const isHistorique = (r) => !!r && r.source === 'historique';
export const isSubmitted = (r) => !!r && SUBMITTED_STATUSES.includes(r.statut) && (!!r.submitted_at || isHistorique(r));

const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const z = (v) => n(v) ?? 0;
export const ratio = (num, den) => (den > 0 ? num / den : null); // null => « NA »

/** Fiche vide (tous les champs à null) */
export function emptyReport(date, zs_id) {
  const r = { date, zs_id, statut: 'brouillon', rapport_nul: false, motifs_inv: [], motifs_suivi: [], nouvelles_as: [],
    motif_autre: '', justif_report_inv: '', justif_report_ct: '', justif_report_alertes: '', commentaire: '', cas_par_as: [] };
  for (const k of NUM_KEYS) r[k] = null;
  return r;
}

/** Pré-remplissage à partir de la fiche de la veille (reports). */
export function carryOver(prev) {
  if (!prev) return { inv_report_entrant: 0, ct_report: 0, ct_nonvus_veille: 0, alertes_report: 0 };
  const c = compute(prev);
  return { inv_report_entrant: c.inv_report_sortant, ct_report: c.ct_a_suivre, ct_nonvus_veille: c.ct_non_vus,
    alertes_report: n(prev.alertes_report_final) ?? 0 };
}

/** Rapport nul : tout à zéro sauf les reports, qui restent ceux de la veille. */
export function applyZeroReport(r, prev) {
  const out = { ...r, rapport_nul: true, nouvelles_as: [], cas_par_as: [] };
  for (const k of NUM_KEYS) out[k] = 0;
  const carry = carryOver(prev);
  Object.assign(out, carry);
  out.alertes_report_final = carry.alertes_report; // aucune alerte nouvelle ni clôturée : le stock reste
  out.ct_vus = carry.ct_report; // rapport nul : pas de contact actif attendu, sinon le rapporteur saisit
  return out;
}

/** Calculs dérivés. Les taux valent null quand le dénominateur est nul (« NA »). */
export function compute(r) {
  const A = z(r.alertes_validees), R = z(r.inv_report_entrant);
  const Ij = z(r.inv_realisees_jour), Ir = z(r.inv_realisees_report);
  const sorties = SORTIES.reduce((s, [k]) => s + z(r[k]), 0);
  const entrees = z(r.ct_report) + z(r.ct_listes_24h) + z(r.ct_listes_tardifs);
  const aSuivre = entrees - sorties;
  const vus = z(r.ct_vus);
  const nonVus = Math.max(0, aSuivre - vus);
  const alertesJour = z(r.alertes_vivantes) + z(r.alertes_deces);
  const sourcesTotal = SOURCES_ALERTES.reduce((a, [k]) => a + z(r[k]), 0);
  const sitesTotal = SITES_RA.reduce((a, [k]) => a + z(r[k]), 0);
  return {
    alertes_jour: alertesJour,
    alertes_a_traiter: z(r.alertes_report) + alertesJour,
    alertes_cloturees: Math.max(0, z(r.alertes_report) + alertesJour - z(r.alertes_report_final)),
    sources_total: sourcesTotal,
    taux_validation_alertes: ratio(z(r.alertes_validees), z(r.alertes_report) + alertesJour),
    part_preleves: ratio(z(r.suspects_preleves), z(r.suspects_isoles)),
    ra_visites: z(r.ra_realisees_plan) + z(r.ra_non_planifiees),
    ra_sites_total: sitesTotal,
    taux_ra: ratio(z(r.ra_realisees_plan), z(r.ra_planifiees)),
    cas_conf_total: z(r.cas_conf_vivants) + z(r.cas_conf_decedes),
    deces_confirmes_jour: z(r.cas_conf_decedes) + z(r.deces_parmi_confirmes),
    inv_non_faites: Math.max(0, A - Ij),
    inv_report_restant: Math.max(0, R - Ir),
    inv_report_sortant: Math.max(0, A - Ij) + Math.max(0, R - Ir),
    inv_total_realisees: Ij + Ir,
    taux_inv: ratio(Ij, A),
    taux_inv_24h: ratio(z(r.inv_moins_24h), Ij + Ir),
    taux_narratifs: ratio(z(r.narratifs_disponibles), z(r.narratifs_attendus)),
    taux_mappings: ratio(z(r.mappings_disponibles), z(r.mappings_attendus)),
    ct_sorties: sorties,
    ct_entrees: entrees,
    ct_a_suivre: aSuivre,
    ct_non_vus: nonVus,
    ct_non_listes_24h: Math.max(0, z(r.ct_identifies) - z(r.ct_listes_24h)),
    taux_listage: ratio(z(r.ct_listes_24h), z(r.ct_identifies)),
    taux_suivi: ratio(vus, aSuivre),
    taux_nonvus: ratio(nonVus, aSuivre),
    taux_rattrapage: ratio(z(r.ct_rattrapes), z(r.ct_nonvus_veille)),
    taux_sortie_21j: null, // nécessite le registre (contacts arrivés à J21)
  };
}

/**
 * Contrôles. Retourne { errors, warnings } : chaque élément { field, msg }.
 * errors = bloquants (empêchent la soumission), warnings = demandent un commentaire.
 */
export function validate(r, { prev = null, seuilSuivi = 0.8 } = {}) {
  const errors = [], warnings = [];
  const c = compute(r);
  const val = (k) => n(r[k]);
  const E = (field, msg) => errors.push({ field, msg });
  const W = (field, msg) => warnings.push({ field, msg });

  for (const f of FIELDS) {
    const v = val(f.key);
    if (v !== null && (v < 0 || !Number.isInteger(v))) E(f.key, `${f.label} : entier positif attendu.`);
  }
  // 1. Alertes
  const alertesTraitables = z(r.alertes_report) + c.alertes_jour;
  const alertesSaisies = ['alertes_report', 'alertes_vivantes', 'alertes_deces'].some((k) => val(k) !== null);
  if (alertesSaisies && val('alertes_validees') !== null && val('alertes_validees') > alertesTraitables)
    E('alertes_validees', `Alertes validées (${val('alertes_validees')}) > report + alertes du jour (${alertesTraitables}).`);
  if (alertesSaisies && val('alertes_investiguees') !== null && val('alertes_investiguees') > alertesTraitables)
    E('alertes_investiguees', `Alertes investiguées (${val('alertes_investiguees')}) > report + alertes du jour (${alertesTraitables}).`);
  if (val('suspects_preleves') !== null && val('alertes_validees') !== null && val('suspects_preleves') > z(r.alertes_validees))
    E('suspects_preleves', `Suspects prélevés (${val('suspects_preleves')}) > alertes validées (${z(r.alertes_validees)}).`);
  if (SOURCES_ALERTES.some(([k]) => val(k) !== null) && c.sources_total !== c.alertes_jour)
    E('src_ess', `Somme des sources (${c.sources_total}) ≠ alertes du jour (${c.alertes_jour}).`);
  if (val('alertes_report_final') !== null && val('alertes_report_final') > alertesTraitables)
    E('alertes_report_final', `Report final (${val('alertes_report_final')}) > report + alertes du jour (${alertesTraitables}).`);
  // 2. Recherche active
  if (val('ra_realisees_plan') !== null && val('ra_realisees_plan') > z(r.ra_planifiees))
    E('ra_realisees_plan', `Visites planifiées réalisées (${val('ra_realisees_plan')}) > visites planifiées (${z(r.ra_planifiees)}). Les visites hors plan vont dans « non planifiées ».`);
  if (val('ra_ess_detectees') !== null && z(r.ra_ess_validees) + z(r.ra_ess_en_cours) > val('ra_ess_detectees'))
    E('ra_ess_validees', `ESS : validées + en cours (${z(r.ra_ess_validees) + z(r.ra_ess_en_cours)}) > alertes détectées (${val('ra_ess_detectees')}).`);
  if (val('ra_com_verifiees') !== null && val('ra_com_verifiees') > z(r.ra_com_detectees))
    E('ra_com_verifiees', `Communauté : vérifiées (${val('ra_com_verifiees')}) > détectées (${z(r.ra_com_detectees)}).`);
  if (val('ra_com_validees') !== null && val('ra_com_validees') > z(r.ra_com_verifiees))
    E('ra_com_validees', `Communauté : validées (${val('ra_com_validees')}) > vérifiées (${z(r.ra_com_verifiees)}).`);
  if (val('ra_com_deces_investigues') !== null && val('ra_com_deces_investigues') > z(r.ra_com_deces_signales))
    E('ra_com_deces_investigues', `Décès suspects investigués (${val('ra_com_deces_investigues')}) > signalés (${z(r.ra_com_deces_signales)}).`);
  // 3. Sous-groupes : chacun ≤ son total du jour correspondant
  for (const g of SOUS_GROUPES) {
    if (val(g.conf) !== null && val(g.conf) > c.cas_conf_total)
      E(g.conf, `${g.court} (${val(g.conf)}) > nouveaux cas confirmés du jour (${c.cas_conf_total}).`);
    if (val(g.confDec) !== null && val(g.confDec) > Math.min(z(r[g.conf]), z(r.cas_conf_decedes)))
      E(g.confDec, `${g.court} déjà décédés (${val(g.confDec)}) > ${g.court} confirmés du jour (${z(r[g.conf])}) ou confirmés décédés (${z(r.cas_conf_decedes)}).`);
    if (val(g.deces) !== null && val(g.deces) > z(r.deces_parmi_confirmes))
      E(g.deces, `Décès de ${g.court} déjà confirmés (${val(g.deces)}) > nouveaux décès parmi les confirmés (${z(r.deces_parmi_confirmes)}).`);
    if (val(g.gueris) !== null && val(g.gueris) > (val('gueris') ?? 0))
      E(g.gueris, `Guéris ${g.court} (${val(g.gueris)}) > nouveaux guéris (${val('gueris') ?? 0}).`);
  }
  // Aires de santé : si des cas par AS sont saisis, leur somme = nouveaux cas confirmés
  const casAs = (r.cas_par_as || []).reduce((a, x) => a + z(x.n), 0);
  if ((r.cas_par_as || []).length && casAs !== c.cas_conf_total)
    E('cas_par_as', `Cas répartis par aire de santé (${casAs}) ≠ nouveaux cas confirmés (${c.cas_conf_total}).`);
  if (val('inv_realisees_jour') !== null && val('alertes_validees') !== null && val('inv_realisees_jour') > val('alertes_validees'))
    E('inv_realisees_jour', 'Investigations réalisées du jour (Ij) > alertes validées (A).');
  if (val('inv_realisees_report') !== null && val('inv_report_entrant') !== null && val('inv_realisees_report') > val('inv_report_entrant'))
    E('inv_realisees_report', 'Reports apurés (Ir) > report entrant (R).');
  if (val('inv_moins_24h') !== null && val('inv_moins_24h') > c.inv_total_realisees)
    E('inv_moins_24h', 'Réalisées en moins de 24 h > investigations réalisées.');
  if (val('narratifs_disponibles') !== null && val('narratifs_disponibles') > z(r.narratifs_attendus))
    E('narratifs_disponibles', 'Narratifs disponibles > attendus.');
  if (val('mappings_disponibles') !== null && val('mappings_disponibles') > z(r.mappings_attendus))
    E('mappings_disponibles', 'Mappings disponibles > attendus.');
  if (val('ct_listes_24h') !== null && val('ct_identifies') !== null && val('ct_listes_24h') > val('ct_identifies'))
    E('ct_listes_24h', 'Contacts listés ≤ 24 h > contacts identifiés.');
  if (c.ct_sorties > c.ct_entrees)
    E('ct_sortie_21j', `Sorties (${c.ct_sorties}) > report + listés (${c.ct_entrees}).`);
  if (val('ct_vus') !== null && val('ct_vus') > Math.max(0, c.ct_a_suivre))
    E('ct_vus', `Contacts vus (${val('ct_vus')}) > contacts à suivre (${c.ct_a_suivre}).`);
  if (val('ct_rattrapes') !== null && val('ct_rattrapes') > z(r.ct_nonvus_veille))
    E('ct_rattrapes', 'Rattrapés > non-vus de la veille.');

  // Motifs obligatoires (n'existaient pas dans les rapports d'avant : pas exigés pour l'historique)
  const hist = isHistorique(r);
  if (!hist && c.inv_report_sortant > 0 && !(r.motifs_inv || []).length)
    E('motifs_inv', `${c.inv_report_sortant} investigation(s) restent non faites : motif obligatoire.`);
  if ((r.motifs_inv || []).includes('autre') && !String(r.motif_autre || '').trim())
    E('motif_autre', 'Préciser le motif « Autre ».');
  if (!hist && c.ct_non_vus > 0 && !(r.motifs_suivi || []).length)
    E('motifs_suivi', `${c.ct_non_vus} contact(s) non vus : motif de non-suivi obligatoire.`);

  // Report modifié par rapport à la veille => justification
  if (prev && !hist) {
    const carry = carryOver(prev);
    if (val('inv_report_entrant') !== null && val('inv_report_entrant') !== carry.inv_report_entrant && !String(r.justif_report_inv || '').trim())
      E('justif_report_inv', `Report entrant modifié (veille : ${carry.inv_report_entrant}) : justification obligatoire.`);
    if (val('ct_report') !== null && val('ct_report') !== carry.ct_report && !String(r.justif_report_ct || '').trim())
      E('justif_report_ct', `Report contacts modifié (veille : ${carry.ct_report}) : justification obligatoire.`);
    if (n(prev.alertes_report_final) !== null && val('alertes_report') !== null && val('alertes_report') !== carry.alertes_report && !String(r.justif_report_alertes || '').trim())
      E('justif_report_alertes', `Report alertes modifié (report final de la veille : ${carry.alertes_report}) : justification obligatoire.`);
  }

  // Avertissements
  if (val('alertes_investiguees') !== null && val('inv_realisees_jour') !== null && val('alertes_investiguees') !== c.inv_total_realisees)
    W('alertes_investiguees', `Alertes investiguées (${val('alertes_investiguees')}) ≠ investigations réalisées du jour (${c.inv_total_realisees}, du jour + reports apurés).`);
  if (val('src_ra') !== null && val('ra_ess_detectees') !== null && val('ra_com_detectees') !== null && val('src_ra') !== z(r.ra_ess_detectees) + z(r.ra_com_detectees))
    W('src_ra', `Alertes de source RA (${val('src_ra')}) ≠ alertes détectées par la recherche active (ESS + communauté : ${z(r.ra_ess_detectees) + z(r.ra_com_detectees)}).`);
  if (SITES_RA.some(([k]) => val(k) !== null) && c.ra_sites_total !== c.ra_visites)
    W('ra_site_hgr', `Somme des types de sites (${c.ra_sites_total}) ≠ visites réalisées (${c.ra_visites}, plan + hors plan).`);
  if (c.cas_conf_total > 0 && !(r.cas_par_as || []).length)
    W('cas_par_as', 'Nouveaux cas confirmés sans répartition par aire de santé.');
  if (c.taux_suivi !== null && c.taux_suivi < seuilSuivi)
    W('ct_vus', `Taux de suivi ${(c.taux_suivi * 100).toFixed(0)} % sous le seuil de ${(seuilSuivi * 100).toFixed(0)} %.`);
  if (z(r.ct_identifies) > 0 && c.inv_total_realisees === 0)
    W('ct_identifies', 'Contacts identifiés sans aucune investigation réalisée ce jour.');
  if (c.ct_non_listes_24h > 0)
    W('ct_listes_24h', `${c.ct_non_listes_24h} contact(s) identifiés non listés dans les 24 h.`);
  if (val('narratifs_attendus') !== null && val('narratifs_attendus') > 0 && z(r.narratifs_disponibles) < val('narratifs_attendus'))
    W('narratifs_disponibles', 'Narratifs manquants.');
  if (val('reco_actifs') === 0 && c.ct_a_suivre > 0)
    W('reco_actifs', 'Contacts à suivre sans RECO actif déclaré.');

  return { errors, warnings, needsComment: warnings.length > 0 && !String(r.commentaire || '').trim() };
}

/** Champs obligatoires manquants (null), y compris les champs conditionnels. */
export function missingFields(r, opts) {
  const miss = FIELDS.filter((f) => requis(f, r) && n(r[f.key]) === null).map((f) => f.label);
  const { errors } = validate(r, opts);
  for (const e of errors) if (['motifs_inv', 'motifs_suivi', 'motif_autre', 'justif_report_inv', 'justif_report_ct', 'justif_report_alertes'].includes(e.field)) miss.push(e.msg.split(':')[0].trim());
  return miss;
}

/** Complétude de la fiche : champs obligatoires renseignés / attendus (conditionnels inclus). */
export function completeness(r, opts) {
  if (!r) return 0;
  const required = FIELDS.filter((f) => requis(f, r));
  let expected = required.length, filled = required.filter((f) => n(r[f.key]) !== null).length;
  const c = compute(r);
  const cond = [
    [c.inv_report_sortant > 0, (r.motifs_inv || []).length > 0],
    [c.ct_non_vus > 0, (r.motifs_suivi || []).length > 0],
  ];
  if (!isHistorique(r)) for (const [applies, ok] of cond) if (applies) { expected++; if (ok) filled++; }
  return expected ? filled / expected : 1;
}

/** Fiche « complète » : 100 % et aucun contrôle bloquant. */
export function isComplete(r, opts) {
  return completeness(r, opts) === 1 && validate(r, opts).errors.length === 0;
}

/** Statut à appliquer à la soumission. */
export function statusOnSubmit(r, opts) {
  const v = validate(r, opts);
  if (v.errors.length) return { ok: false, reason: 'Contrôles bloquants', errors: v.errors };
  if (v.needsComment) return { ok: false, reason: 'Commentaire requis pour les avertissements', errors: [{ field: 'commentaire', msg: 'Expliquer les avertissements dans le commentaire.' }] };
  return { ok: true, statut: completeness(r, opts) === 1 ? 'soumis' : 'incomplet' };
}

/** Transitions de workflow autorisées par rôle. */
export const TRANSITIONS = {
  soumettre: { from: ['brouillon', 'incomplet', 'a_corriger', 'rouvert'], roles: ['rapporteur', 'epidemiologiste', 'data_manager', 'admin'] },
  retourner: { from: ['soumis', 'incomplet', 'valide_zs'], to: 'a_corriger', roles: ['epidemiologiste', 'data_manager', 'team_lead', 'validateur', 'admin'] },
  valider_zs: { from: ['soumis'], to: 'valide_zs', roles: ['epidemiologiste', 'validateur', 'team_lead', 'admin'] },
  valider_prov: { from: ['valide_zs'], to: 'valide_prov', roles: ['team_lead', 'validateur', 'admin'] },
  rouvrir: { from: ['valide_zs', 'valide_prov'], to: 'rouvert', roles: ['team_lead', 'validateur', 'data_manager', 'admin'] },
};
export const can = (action, role, statut) => {
  const t = TRANSITIONS[action];
  return !!t && t.roles.includes(role) && t.from.includes(statut || 'brouillon');
};
/**
 * Double validation : 1re validation ZS (épidémiologiste superviseur), 2e validation province
 * (Team Lead / validateur), par deux personnes différentes.
 */
export function canValidate(action, role, report, actorId) {
  if (!can(action, role, report?.statut)) return false;
  if (action === 'valider_prov' && report.validated_zs_by && report.validated_zs_by === actorId) return false;
  return true;
}
export const isLocked = (r) => r && ['valide_zs', 'valide_prov'].includes(r.statut);
