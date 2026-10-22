// Reconstitution de l'historique : fiches journalières Date × ZS antérieures à la mise en service.
// Deux sources, fusionnées champ par champ :
//   1. le modèle « SurvEpi_modele_historique.xlsx » (chiffres journaliers, rapports recopiés) : fait foi ;
//   2. les deux outils Excel DPS (registres investigations / contacts / visites) : chiffres recalculés, seulement des totaux.
// Les reports (investigations, contacts, non-vus) se calculent en chaîne d'un jour à l'autre quand ils manquent.
import { FIELDS, NUM_KEYS, compute, validate } from './report.js';
import { norm, dateFrom } from './importComptes.js';
import { addDays } from './time.js';

export const CARRY_KEYS = ['inv_report_entrant', 'ct_report', 'ct_nonvus_veille'];
const MOTIF_FIELDS = ['motifs_inv', 'motifs_suivi', 'motif_autre', 'justif_report_inv', 'justif_report_ct'];

/** En-têtes du modèle (le générateur Excel s'en sert aussi). */
export const HIST_HEADERS = [
  ['date', 'Date'], ['zs', 'Zone de santé'],
  ...FIELDS.map((f) => [f.key, f.label]),
  ['nouvelles_as', 'Nouvelles AS touchées'],
  ['commentaire', 'Commentaire'], ['source_detail', 'Source'],
];

const isBlank = (v) => v === '' || v === null || v === undefined;
const zsFinder = (zsList) => {
  const m = new Map();
  for (const z of zsList) { m.set(norm(z.nom), z); m.set(norm(z.id), z); if (z.code_dhis2) m.set(norm(z.code_dhis2), z); }
  return (name) => m.get(norm(name));
};

function headerKey(h) {
  const n = norm(h);
  if (!n) return null;
  for (const [key, label] of HIST_HEADERS) if (n === norm(label) || n === norm(key)) return key;
  for (const [key, label] of HIST_HEADERS) if (n.startsWith(norm(label))) return key; // « Date * », « Source (ex. …) »
  if (n.startsWith('zone') || n === 'zs') return 'zs';
  return null;
}

function num(v) {
  if (isBlank(v)) return { value: null };
  const s = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isInteger(s) && s >= 0 ? { value: s } : { error: `« ${v} » n’est pas un nombre entier positif` };
}

/** 1. Onglet « Historique » du modèle → fiches partielles. rows = objets { en-tête: valeur }. */
export function parseModele(rows, zsList) {
  const findZs = zsFinder(zsList);
  const out = [];
  rows.forEach((row, i) => {
    if (Object.values(row).every(isBlank)) return;
    const line = i + 2, errors = [], values = {};
    let date = null, zs = null, commentaire = '', source_detail = '', asNoms = null;
    for (const [h, v] of Object.entries(row)) {
      const k = headerKey(h);
      if (!k) continue;
      if (k === 'date') { const d = dateFrom(v); if (d.error) errors.push(`date : ${d.error}`); else date = d.value; }
      else if (k === 'zs') { if (!isBlank(v)) { zs = findZs(v); if (!zs) errors.push(`ZS inconnue « ${v} »`); } }
      else if (k === 'commentaire') commentaire = String(v ?? '').trim();
      else if (k === 'source_detail') source_detail = String(v ?? '').trim();
      else if (k === 'nouvelles_as') { if (!isBlank(v)) asNoms = String(v).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean); }
      else { const r = num(v); if (r.error) errors.push(`${FIELDS.find((f) => f.key === k).label} : ${r.error}`); else if (r.value !== null) values[k] = r.value; }
    }
    if (!date && !errors.some((e) => e.startsWith('date'))) errors.push('date manquante');
    if (!zs && !errors.some((e) => e.startsWith('ZS'))) errors.push('ZS manquante');
    out.push({ origine: 'modele', line, date, zs_id: zs?.id || null, values, asNoms, commentaire, source_detail, errors });
  });
  return out;
}

/** Trouve la ligne d'en-tête d'un onglet lu en tableaux (header: 1) et rend des objets. */
export function tableFrom(arrays, mustHave) {
  const i = arrays.findIndex((r) => (r || []).some((c) => norm(c) === norm(mustHave)));
  if (i < 0) return [];
  const head = arrays[i].map((c) => String(c ?? '').trim());
  return arrays.slice(i + 1).map((r) => Object.fromEntries(head.map((h, j) => [h, (r || [])[j] ?? '']))).filter((o) => Object.values(o).some((v) => !isBlank(v)));
}
const col = (row, ...names) => { for (const n of names) for (const k of Object.keys(row)) if (norm(k) === norm(n) || norm(k).startsWith(norm(n))) return row[k]; return ''; };
const d = (v) => dateFrom(v).value || null;

/**
 * 2. Outils Excel DPS → fiches partielles par Date × ZS (totaux seulement, aucun nom ne sort).
 * inv, contacts, suivi : lignes des onglets Investigations, Contacts, Suivi quotidien (objets).
 */
export function deriveFromDps({ inv = [], contacts = [], suivi = [] }, zsList, today) {
  const findZs = zsFinder(zsList);
  const cells = new Map(); // `${zs}|${date}` → compteurs
  const zsDates = new Map(); // zs → { min, max, suivi: bool }
  const notes = { zsInconnues: new Set(), sansDate: 0, sortiesSansDate: 0, clampIr: 0, clampVus: 0, confirmes: 0, lignes: { inv: 0, contacts: 0, suivi: 0 } };
  const avecClassif = new Set(); // ZS dont le registre renseigne la classification finale : leurs jours sans confirmé valent 0
  const asPremier = new Map(); // zs → Map(nom normalisé → { nom, date du 1er cas confirmé })
  const cell = (zs, date) => {
    const k = `${zs}|${date}`;
    if (!cells.has(k)) cells.set(k, { A: 0, Ij: 0, Ir: 0, m24: 0, CV: 0, CD: 0, L: 0, s21: 0, ssym: 0, sper: 0, sdep: 0, vus: new Set(), agents: new Set() });
    const z = zsDates.get(zs) || { min: date, max: date, suivi: false };
    if (date < z.min) z.min = date; if (date > z.max) z.max = date;
    zsDates.set(zs, z);
    return cells.get(k);
  };
  const zsOf = (row) => { const v = col(row, 'Zone de santé'); if (isBlank(v)) return null; const z = findZs(v); if (!z) notes.zsInconnues.add(String(v).trim()); return z; };
  const ok = (date) => date && date <= today;

  for (const r of inv) {
    const z = zsOf(r); if (!z) continue;
    if (norm(col(r, 'Statut investigation')) === norm('Non retenue')) continue;
    const da = d(col(r, 'Date notification DPS')) || d(col(r, 'Date alerte'));
    if (!ok(da)) { notes.sansDate++; continue; }
    notes.lignes.inv++;
    cell(z.id, da).A++;
    // I. Situation épidémiologique : cas confirmés, comptés à la date du résultat (sinon prélèvement, sinon notification)
    const classif = norm(col(r, 'Classification finale'));
    if (classif) avecClassif.add(z.id);
    if (classif === norm('Confirmé')) {
      const dc = [d(col(r, 'Date résultat')), d(col(r, 'Date prélèvement')), da].find(ok) || da;
      const decede = norm(col(r, 'Type événement')) === norm('Décès');
      cell(z.id, dc)[decede ? 'CD' : 'CV']++;
      notes.confirmes++;
      const nomAs = String(col(r, 'Aire de santé') ?? '').trim();
      if (nomAs) {
        if (!asPremier.has(z.id)) asPremier.set(z.id, new Map());
        const m = asPremier.get(z.id), k = norm(nomAs);
        if (!m.has(k) || m.get(k).date > dc) m.set(k, { nom: nomAs, date: dc });
      }
    }
    const di = d(col(r, 'Date début investigation'));
    if (ok(di)) {
      const jour = di < da ? da : di;
      if (jour === da) cell(z.id, da).Ij++; else cell(z.id, jour).Ir++;
      if (jour <= addDays(da, 1)) cell(z.id, jour).m24++;
    }
  }
  for (const r of contacts) {
    const z = zsOf(r); if (!z) continue;
    const dl = d(col(r, 'Date début suivi'));
    if (!ok(dl)) { notes.sansDate++; continue; }
    notes.lignes.contacts++;
    cell(z.id, dl).L++;
    const statut = norm(col(r, 'Statut contact')), issue = norm(col(r, 'Issue du suivi'));
    const derniere = d(col(r, 'Dernière visite')), fin = d(col(r, 'Date fin prévue')), sympt = d(col(r, 'Date début symptômes'));
    let type = null, date = null;
    if (statut === 'fin de suivi' || issue.startsWith('termine')) { type = 's21'; date = fin || derniere; }
    else if (statut.startsWith('devenu suspect') || issue.startsWith('suspect')) { type = 'ssym'; date = sympt || derniere; }
    else if (statut.startsWith('perdu') || issue.startsWith('perdu')) { type = 'sper'; date = derniere || fin; }
    else if (statut.startsWith('transfer')) { type = 'sdep'; date = derniere; }
    if (type) {
      if (!ok(date)) { if (!date) notes.sortiesSansDate++; continue; }
      cell(z.id, date < dl ? dl : date)[type]++;
    }
  }
  for (const r of suivi) {
    const z = zsOf(r); if (!z) continue;
    const dv = d(col(r, 'Date'));
    if (!ok(dv)) continue;
    notes.lignes.suivi++;
    const c = cell(z.id, dv);
    zsDates.get(z.id).suivi = true;
    if (norm(col(r, 'Vu/Joint', 'Vu')) === 'oui') c.vus.add(String(col(r, 'ID contact')) || `l${notes.lignes.suivi}`);
    const ag = String(col(r, 'Agent de suivi') ?? '').trim(); if (ag) c.agents.add(norm(ag));
  }

  // Une fiche par jour, du premier au dernier jour d'activité de chaque ZS (les jours sans activité valent 0)
  const out = [];
  for (const [zs, r] of zsDates) {
    for (let date = r.min; date <= r.max; date = addDays(date, 1)) {
      const c = cells.get(`${zs}|${date}`) || { A: 0, Ij: 0, Ir: 0, m24: 0, CV: 0, CD: 0, L: 0, s21: 0, ssym: 0, sper: 0, sdep: 0, vus: new Set(), agents: new Set() };
      const epi = avecClassif.has(zs) ? { cas_conf_vivants: c.CV || 0, cas_conf_decedes: c.CD || 0 } : {};
      const asNoms = avecClassif.has(zs) ? [...(asPremier.get(zs)?.values() || [])].filter((x) => x.date === date).map((x) => x.nom) : null;
      const values = {
        ...epi,
        alertes_validees: c.A, inv_realisees_jour: c.Ij, inv_realisees_report: c.Ir, inv_moins_24h: c.m24,
        ct_identifies: c.L, ct_listes_24h: c.L, ct_listes_tardifs: 0,
        ct_sortie_21j: c.s21, ct_sortie_symptomatiques: c.ssym, ct_sortie_confirmes: 0, ct_sortie_perdus: c.sper,
        ct_sortie_deplaces: c.sdep, ct_sortie_decedes: 0, ct_sortie_doublons: 0,
      };
      if (r.suivi) { values.ct_vus = c.vus.size; values.reco_actifs = c.agents.size; }
      out.push({ origine: 'dps', line: null, date, zs_id: zs, values, asNoms, commentaire: '', source_detail: 'Outils Excel DPS (recalculé)', errors: [] });
    }
  }
  return { fiches: out, notes: { ...notes, zsInconnues: [...notes.zsInconnues] } };
}

/**
 * 3. Plan d'import : fusion (le modèle prime sur les outils DPS, champ par champ), reports en chaîne,
 *    contrôles, et comparaison avec les fiches déjà en base.
 */
export function buildPlan({ modele = [], dps = [] }, { reports = [], zsList = [], today, areas = [] }) {
  const zsName = Object.fromEntries(zsList.map((z) => [z.id, z.nom]));
  const existing = new Map(reports.map((r) => [`${r.date}|${r.zs_id}`, r]));
  const merged = new Map();
  const invalid = [];
  for (const f of dps) merged.set(`${f.date}|${f.zs_id}`, { ...f, values: { ...f.values }, fromDps: new Set(Object.keys(f.values)), errors: [], sources: ['Outils DPS'] });
  const seen = new Map();
  for (const f of modele) {
    if (f.errors.length || !f.date || !f.zs_id) { invalid.push({ ...f, key: `l${f.line}`, action: 'erreur', warnings: [], calcules: [] }); continue; }
    const key = `${f.date}|${f.zs_id}`;
    if (seen.has(key)) { invalid.push({ ...f, key: `l${f.line}`, action: 'erreur', errors: [`déjà donnée ligne ${seen.get(key)} (même date et même ZS)`], warnings: [], calcules: [] }); continue; }
    seen.set(key, f.line);
    const base = merged.get(key);
    if (base) {
      for (const k of Object.keys(f.values)) base.fromDps.delete(k);
      Object.assign(base.values, f.values);
      if (f.asNoms) { base.asNoms = f.asNoms; base.asModele = true; }
      Object.assign(base, { line: f.line, origine: 'mixte', commentaire: f.commentaire || base.commentaire, source_detail: f.source_detail || base.source_detail });
      base.sources.unshift(f.source_detail || 'Modèle');
    } else merged.set(key, { ...f, values: { ...f.values }, fromDps: new Set(), asModele: !!f.asNoms, sources: [f.source_detail || 'Modèle'] });
  }

  // Aires de santé : déjà touchées hors de ce lot (valeur initiale, ou fiche gardée en base)
  const remplacees = new Set([...merged.keys()].filter((k) => existing.get(k)?.source === 'historique'));
  const asAilleurs = new Map(); // id → date d'une fiche gardée qui la déclare déjà nouvelle (quelle que soit la date)
  for (const r of reports) {
    if (remplacees.has(`${r.date}|${r.zs_id}`)) continue;
    for (const id of r.nouvelles_as || []) asAilleurs.set(id, r.date);
  }
  const asParNom = new Map(areas.map((a) => [`${a.zs_id}|${norm(a.nom)}`, a]));

  // Reports en chaîne, ZS par ZS, dans l'ordre des dates
  const byZs = new Map();
  for (const f of merged.values()) { if (!byZs.has(f.zs_id)) byZs.set(f.zs_id, []); byZs.get(f.zs_id).push(f); }
  const rows = [];
  for (const [zs_id, list] of byZs) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    let prev = null; // { date, record }
    const asLot = new Map(); // id → date (déclarées nouvelles plus tôt dans ce lot)
    for (const f of list) {
      const errors = [...f.errors], warnings = [], calcules = [];
      const record = { date: f.date, zs_id, source: 'historique', rapport_nul: false, commentaire: f.commentaire || null, source_detail: f.sources.join(' + ').slice(0, 300), nouvelles_as: [] };
      for (const k of NUM_KEYS) record[k] = f.values[k] ?? null;

      // Nouvelles AS touchées : noms → liste de la ZS ; une AS déjà touchée n'est jamais recomptée
      for (const nom of f.asNoms || []) {
        const a = asParNom.get(`${zs_id}|${norm(nom)}`);
        if (!a) {
          const msg = `AS « ${nom} » absente de la liste de la ZS (à ajouter dans ZS & acteurs > Aires de santé)`;
          if (f.asModele) errors.push(msg); else warnings.push(`${msg} : non comptée`);
          continue;
        }
        const avant = (a.touchee_le && a.touchee_le <= f.date ? a.touchee_le : null) || asAilleurs.get(a.id) || asLot.get(a.id);
        if (avant) { warnings.push(`AS ${a.nom} déjà touchée (${avant}) : pas recomptée`); continue; }
        if (!record.nouvelles_as.includes(a.id)) record.nouvelles_as.push(a.id);
      }

      // Veille : la fiche précédente du lot, sinon une fiche déjà en base (14 jours max)
      let veille = prev && prev.date >= addDays(f.date, -14) ? prev.record : null;
      if (!veille) for (let i = 1; i <= 14 && !veille; i++) { const r = existing.get(`${addDays(f.date, -i)}|${zs_id}`); if (r) veille = r; }
      const c0 = veille ? compute(veille) : null;
      const carry = { inv_report_entrant: c0 ? c0.inv_report_sortant : 0, ct_report: c0 ? c0.ct_a_suivre : 0, ct_nonvus_veille: c0 ? c0.ct_non_vus : 0 };
      for (const k of CARRY_KEYS) if (record[k] === null) { record[k] = Math.max(0, carry[k]); calcules.push(k); }
      if (!veille && calcules.length) warnings.push('pas de jour précédent connu : reports de départ à 0');

      // Chiffres recalculés depuis les registres : on borne au lieu de bloquer, et on le signale
      if (f.fromDps.has('inv_realisees_report') && record.inv_realisees_report > record.inv_report_entrant) {
        warnings.push(`reports apurés ramenés de ${record.inv_realisees_report} à ${record.inv_report_entrant} (registre incomplet avant cette date)`);
        record.inv_realisees_report = record.inv_report_entrant;
      }
      if (record.inv_moins_24h !== null && record.inv_moins_24h > (record.inv_realisees_jour || 0) + (record.inv_realisees_report || 0)) record.inv_moins_24h = (record.inv_realisees_jour || 0) + (record.inv_realisees_report || 0);
      const c1 = compute(record);
      if (f.fromDps.has('ct_vus') && record.ct_vus > Math.max(0, c1.ct_a_suivre)) {
        warnings.push(`contacts vus ramenés de ${record.ct_vus} à ${Math.max(0, c1.ct_a_suivre)} (visites de contacts absents du registre)`);
        record.ct_vus = Math.max(0, c1.ct_a_suivre);
      }
      if (c1.ct_sorties > c1.ct_entrees && [...f.fromDps].some((k) => k.startsWith('ct_sortie'))) {
        warnings.push('sorties supérieures aux contacts suivis : sorties remises à 0 ce jour (registre incomplet)');
        for (const k of FIELDS.filter((x) => x.key.startsWith('ct_sortie')).map((x) => x.key)) if (f.fromDps.has(k)) record[k] = 0;
      }
      if (record.ct_rattrapes !== null && record.ct_rattrapes > (record.ct_nonvus_veille || 0)) errors.push('rattrapés > non-vus de la veille');

      if (f.date > today) errors.push('date future');
      const v = validate(record, { seuilSuivi: 0 });
      for (const e of v.errors) if (!MOTIF_FIELDS.includes(e.field)) errors.push(e.msg);

      const ex = existing.get(`${f.date}|${zs_id}`);
      const action = errors.length ? 'erreur' : ex && ex.source !== 'historique' ? 'ignoree' : ex ? 'remplace' : 'nouvelle';
      if (action === 'ignoree') warnings.push('déjà saisie dans l’app : la saisie est gardée');
      rows.push({ key: `${f.date}|${zs_id}`, line: f.line, origine: f.origine, date: f.date, zs_id, zs_nom: zsName[zs_id] || zs_id, action, errors, warnings, calcules, record });
      if (!errors.length) prev = { date: f.date, record: ex && ex.source !== 'historique' ? ex : record };
      if (action === 'nouvelle' || action === 'remplace') for (const id of record.nouvelles_as) asLot.set(id, f.date);
    }
  }
  for (const f of invalid) rows.push({ ...f, zs_nom: zsName[f.zs_id] || f.zs_id || '–', record: null });
  rows.sort((a, b) => (a.zs_nom + a.date < b.zs_nom + b.date ? -1 : 1));

  const parZs = [...byZs.keys()].map((id) => {
    const r = rows.filter((x) => x.zs_id === id && x.record);
    return { zs_id: id, zs_nom: zsName[id] || id, du: r[0]?.date, au: r[r.length - 1]?.date, fiches: r.filter((x) => ['nouvelle', 'remplace'].includes(x.action)).length, erreurs: r.filter((x) => x.action === 'erreur').length };
  }).sort((a, b) => (a.zs_nom < b.zs_nom ? -1 : 1));
  const count = (a) => rows.filter((x) => x.action === a).length;
  return { rows, parZs, resume: { nouvelle: count('nouvelle'), remplace: count('remplace'), ignoree: count('ignoree'), erreur: count('erreur') } };
}

/** Fiches à envoyer à la base (seulement les champs de la table). */
export const recordsToImport = (plan) => plan.rows.filter((r) => ['nouvelle', 'remplace'].includes(r.action)).map((r) => r.record);
