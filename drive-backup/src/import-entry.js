// Point d'entrée du paquet « ImportLib.gs » : les mêmes règles que la page Historique de l'app,
// regroupées pour Google Apps Script (npm run build:gas dans web/).
import { parseModele, deriveFromDps, buildPlan, recordsToImport, tableFrom } from '../../web/src/domain/historique.js';

/** Lignes d'un onglet lu en tableaux → objets { en-tête: valeur } (1re ligne = en-têtes). */
function objets(arrays) {
  if (!arrays.length) return [];
  const head = arrays[0].map((c) => String(c ?? '').trim());
  return arrays.slice(1).map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] ?? ''])));
}

/**
 * classeurs : [{ nom, onglets: { <nom d'onglet>: tableaux } }]
 * Rend le plan d'import (mêmes contrôles que l'app) et les fiches à envoyer.
 */
export function planifier(classeurs, { zsList, reports, today }) {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const modele = [], inv = [], contacts = [], suivi = [], lus = [];
  for (const c of classeurs) {
    const types = [];
    for (const [nom, arrays] of Object.entries(c.onglets)) {
      const n = norm(nom);
      if (n === 'historique') { modele.push(...parseModele(objets(arrays), zsList).map((x) => ({ ...x, source_detail: x.source_detail || c.nom }))); types.push('modèle historique'); }
      else if (n === 'investigations') { const t = tableFrom(arrays, 'ID investigation'); inv.push(...t); if (t.length) types.push(`${t.length} investigations`); }
      else if (n === 'contacts') { const t = tableFrom(arrays, 'ID contact'); contacts.push(...t); if (t.length) types.push(`${t.length} contacts`); }
      else if (n === 'suivi quotidien') { const t = tableFrom(arrays, 'ID contact'); suivi.push(...t); if (t.length) types.push(`${t.length} visites`); }
    }
    lus.push({ nom: c.nom, types });
  }
  const d = inv.length + contacts.length + suivi.length ? deriveFromDps({ inv, contacts, suivi }, zsList, today) : { fiches: [], notes: null };
  const plan = buildPlan({ modele, dps: d.fiches }, { reports, zsList, today });
  return { plan, notes: d.notes, lus, fiches: recordsToImport(plan) };
}
