// Alertes et recherche active : sommes par ZS / province et indicateurs (NA si dénominateur nul).
import { SOURCES_ALERTES, SITES_RA, isSubmitted, ratio, compute } from './report.js';

export const CLES_ALERTES = ['alertes_report', 'alertes_vivantes', 'alertes_deces', 'alertes_validees', 'alertes_investiguees', 'suspects_isoles',
  'suspects_preleves', 'alertes_report_final', ...SOURCES_ALERTES.map(([k]) => k)];
export const CLES_RA = ['ra_planifiees', 'ra_realisees_plan', 'ra_non_planifiees', ...SITES_RA.map(([k]) => k), 'ra_ess_dossiers', 'ra_ess_detectees',
  'ra_ess_validees', 'ra_ess_en_cours', 'ra_com_detectees', 'ra_com_verifiees', 'ra_com_validees', 'ra_com_deces_signales', 'ra_com_deces_investigues'];
const z = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/** Somme des fiches retenues + indicateurs dérivés. renseigne = au moins une fiche avec la rubrique remplie. */
export function sommeAlertes(reports) {
  const f = reports.filter((r) => r && isSubmitted(r));
  const t = Object.fromEntries([...CLES_ALERTES, ...CLES_RA].map((k) => [k, f.reduce((a, r) => a + z(r[k]), 0)]));
  t.alertes_jour = t.alertes_vivantes + t.alertes_deces;
  t.alertes_a_traiter = t.alertes_report + t.alertes_jour;
  t.alertes_cloturees = Math.max(0, t.alertes_a_traiter - t.alertes_report_final);
  t.taux_validation = ratio(t.alertes_validees, t.alertes_a_traiter);
  t.part_preleves = ratio(t.suspects_preleves, t.suspects_isoles);
  t.taux_ra = ratio(t.ra_realisees_plan, t.ra_planifiees);
  t.ra_visites = t.ra_realisees_plan + t.ra_non_planifiees;
  t.inv_total = f.reduce((a, r) => a + compute(r).inv_total_realisees, 0);
  t.fiches = f.length;
  t.renseigne = f.filter((r) => r.alertes_vivantes !== null && r.alertes_vivantes !== undefined).length;
  return t;
}
