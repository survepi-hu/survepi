import { describe, it, expect } from 'vitest';
import { parseModele, deriveFromDps, buildPlan, recordsToImport, tableFrom } from './historique.js';
import { cellState, provincial, indexReports } from './indicators.js';

const zsList = [{ id: 'isiro', nom: 'Isiro', frequence: 'quotidienne', actif: true, categorie_manuelle: 'touchee' }, { id: 'wamba', nom: 'Wamba', frequence: 'quotidienne', actif: true, categorie_manuelle: 'touchee' }];
const today = '2026-10-20';

describe('historique', () => {
  it('lit le modèle et calcule les reports en chaîne', () => {
    const modele = parseModele([
      { 'Date *': '01/09/2026', 'Zone de santé *': 'Isiro', 'Alertes validées du jour': 5, 'Réalisées sur les alertes du jour': 3, 'Réalisées sur le report (reports apurés)': 0, 'Contacts identifiés aujourd’hui': 10, 'Contacts listés dans les 24 h': 10, 'Contacts vus': 8, 'RECO actifs': 4 },
      { 'Date *': '02/09/2026', 'Zone de santé *': 'isiro', 'Alertes validées du jour': 2, 'Réalisées sur les alertes du jour': 2, 'Réalisées sur le report (reports apurés)': 1, 'Contacts identifiés aujourd’hui': 0, 'Contacts listés dans les 24 h': 0, 'Contacts vus': 10, 'RECO actifs': 4 },
      { 'Date *': '02/09/2026', 'Zone de santé *': 'Isiro', 'Alertes validées du jour': 9 },
      { 'Date *': 'hier', 'Zone de santé *': 'Poko' },
      { 'Date *': '', 'Zone de santé *': '' },
    ], zsList);
    expect(modele).toHaveLength(4);
    expect(modele[3].errors.join()).toMatch(/illisible.*|Poko/);
    const plan = buildPlan({ modele }, { reports: [], zsList, today });
    const [j1, j2] = plan.rows.filter((r) => r.record);
    expect(j1.record.inv_report_entrant).toBe(0);
    expect(j1.calcules).toContain('ct_report');
    expect(j2.record.inv_report_entrant).toBe(2);   // 5 alertes - 3 faites
    expect(j2.record.ct_report).toBe(10);
    expect(j2.record.ct_nonvus_veille).toBe(2);
    expect(plan.resume).toEqual({ nouvelle: 2, remplace: 0, ignoree: 0, erreur: 2 });
    expect(plan.rows.find((r) => r.line === 4).errors[0]).toMatch(/ligne 3/);
  });

  it('ne remplace jamais une saisie, remplace un historique', () => {
    const modele = parseModele([{ Date: '2026-10-15', ZS: 'Isiro', 'Alertes validées du jour': 1 }, { Date: '2026-10-14', ZS: 'Isiro', 'Alertes validées du jour': 1 }], zsList);
    const reports = [{ date: '2026-10-15', zs_id: 'isiro', statut: 'soumis', source: 'saisie' }, { date: '2026-10-14', zs_id: 'isiro', statut: 'valide_prov', source: 'historique' }];
    const plan = buildPlan({ modele }, { reports, zsList, today });
    expect(plan.rows.map((r) => r.action).sort()).toEqual(['ignoree', 'remplace']);
  });

  it('refuse les incohérences du modèle', () => {
    const modele = parseModele([{ Date: '2026-09-01', ZS: 'Isiro', 'Alertes validées du jour': 1, 'Réalisées sur les alertes du jour': 4 }], zsList);
    const plan = buildPlan({ modele }, { reports: [], zsList, today });
    expect(plan.rows[0].action).toBe('erreur');
    expect(plan.rows[0].errors.join()).toMatch(/Ij/);
  });

  it('recalcule les chiffres journaliers depuis les outils DPS, sans nom', () => {
    const inv = tableFrom([
      ['REGISTRE PROVINCIAL'], [],
      ['ID investigation', 'Zone de santé', 'Date alerte', 'Date notification DPS', 'Statut investigation', 'Date début investigation', 'Nom/Code cas'],
      ['I1', 'Isiro', '01/09/2026', '', 'Terminée', '01/09/2026', 'Jean X'],
      ['I2', 'Isiro', '01/09/2026', '', 'Terminée', '03/09/2026', 'Marie Y'],
      ['I3', 'Isiro', '02/09/2026', '', 'Non retenue', '', ''],
      ['I4', 'Bili', '02/09/2026', '', 'En cours', '', ''],
    ], 'ID investigation');
    const contacts = tableFrom([
      ['ID contact', 'Zone de santé', 'Date début suivi', 'Date fin prévue', 'Statut contact', 'Dernière visite/appel', 'Nom/Code contact'],
      ['C1', 'Isiro', '01/09/2026', '21/09/2026', 'Fin de suivi', '21/09/2026', 'Paul'],
      ['C2', 'Isiro', '01/09/2026', '21/09/2026', 'Perdu de vue', '02/09/2026', 'Luc'],
    ], 'ID contact');
    const suivi = tableFrom([
      ['Date', 'ID contact', 'Zone de santé', 'Vu/Joint', 'Agent de suivi'],
      ['01/09/2026', 'C1', 'Isiro', 'Oui', 'RECO A'], ['01/09/2026', 'C2', 'Isiro', 'Oui', 'RECO B'],
      ['02/09/2026', 'C1', 'Isiro', 'Oui', 'RECO A'], ['02/09/2026', 'C1', 'Isiro', 'Oui', 'RECO A'],
    ], 'ID contact');
    const { fiches, notes } = deriveFromDps({ inv, contacts, suivi }, zsList, today);
    expect(notes.zsInconnues).toEqual(['Bili']);
    const j = (d) => fiches.find((f) => f.date === d).values;
    expect(j('2026-09-01')).toMatchObject({ alertes_validees: 2, inv_realisees_jour: 1, ct_identifies: 2, ct_listes_24h: 2, ct_vus: 2, reco_actifs: 2 });
    expect(j('2026-09-02')).toMatchObject({ alertes_validees: 0, ct_sortie_perdus: 1, ct_vus: 1, reco_actifs: 1 });
    expect(j('2026-09-03')).toMatchObject({ inv_realisees_report: 1 });
    expect(fiches.at(-1).date).toBe('2026-09-21');
    expect(JSON.stringify(fiches)).not.toMatch(/Jean|Marie|Paul|Luc/);
    const plan = buildPlan({ dps: fiches }, { reports: [], zsList, today });
    expect(plan.resume.erreur).toBe(0);
    const r = Object.fromEntries(plan.rows.map((x) => [x.date, x.record]));
    expect(r['2026-09-02'].inv_report_entrant).toBe(1);
    expect(r['2026-09-03'].inv_report_entrant).toBe(1);
    expect(r['2026-09-21'].ct_sortie_21j).toBe(1);
    expect(recordsToImport(plan).every((x) => x.source === 'historique')).toBe(true);
  });

  it('le modèle prime sur les outils DPS, champ par champ', () => {
    const dps = [{ origine: 'dps', date: '2026-09-01', zs_id: 'isiro', values: { alertes_validees: 2, inv_realisees_jour: 1, inv_realisees_report: 0, reco_actifs: 3 }, commentaire: '', source_detail: 'Outils DPS', errors: [] }];
    const modele = parseModele([{ Date: '2026-09-01', ZS: 'Isiro', 'Alertes validées du jour': 4, 'Réalisées sur les alertes du jour': 4, Source: 'SitRep 12' }], zsList);
    const plan = buildPlan({ modele, dps }, { reports: [], zsList, today });
    expect(plan.rows[0].record).toMatchObject({ alertes_validees: 4, inv_realisees_jour: 4, reco_actifs: 3 });
    expect(plan.rows[0].record.source_detail).toBe('SitRep 12 + Outils DPS');
  });

  it('une fiche historique compte dans la complétude, pas dans la promptitude', () => {
    const settings = { heure_limite: '16:30', seuil_suivi: 0.8, fuseau: 'Africa/Lubumbashi', jours_post_flambee: 42 };
    const full = { cas_conf_vivants: 0, cas_conf_decedes: 0, cas_conf_ppl: 0, cas_conf_moins5: 0, cas_conf_eleves: 0, deces_parmi_confirmes: 0, deces_ppl: 0, deces_moins5: 0, deces_eleves: 0, gueris: 0, gueris_ppl: 0, gueris_moins5: 0, gueris_eleves: 0, alertes_validees: 1, inv_report_entrant: 0, inv_realisees_jour: 1, inv_realisees_report: 0, ct_report: 0, ct_identifies: 0, ct_listes_24h: 0,
      ct_sortie_21j: 0, ct_sortie_symptomatiques: 0, ct_sortie_confirmes: 0, ct_sortie_perdus: 0, ct_sortie_deplaces: 0, ct_sortie_decedes: 0, ct_sortie_doublons: 0, ct_vus: 0, reco_actifs: 2 };
    const reports = [{ ...full, date: '2026-09-01', zs_id: 'isiro', statut: 'valide_prov', source: 'historique', submitted_at: null },
      { ...full, alertes_validees: 3, date: '2026-09-01', zs_id: 'wamba', statut: 'valide_prov', source: 'historique', submitted_at: null }];
    const np = { date: today, minutes: 600 };
    expect(cellState(reports[0], zsList[0], '2026-09-01', settings, np, null).state).toBe('historique');
    const p = provincial(zsList, '2026-09-01', indexReports(reports), settings, np);
    expect(p.groups.all.completude).toBe(1);
    expect(p.groups.all.promptitude).toBe(null); // NA : aucune heure connue
    expect(p.totals.alertes_validees).toBe(4);
    // Avant la mise en service, la ZS sans fiche n'est pas « non reçue »
    const p2 = provincial(zsList, '2026-09-01', indexReports([reports[0]]), { ...settings, mise_en_service: '2026-10-01' }, np);
    expect(p2.groups.all.attendues).toBe(1);
    expect(p2.groups.all.completude).toBe(1);
    const p3 = provincial(zsList, '2026-09-01', indexReports([reports[0]]), settings, np);
    expect(p3.groups.all.completude).toBe(0.5);
  });
  it('AS : noms résolus dans la liste de la ZS, jamais recomptées', () => {
    const areas = [{ id: 'a1', zs_id: 'isiro', nom: 'Kélé' }, { id: 'a2', zs_id: 'isiro', nom: 'Mendambo', touchee_le: '2026-08-30' }, { id: 'a3', zs_id: 'isiro', nom: 'Bassa' }, { id: 'a4', zs_id: 'isiro', nom: 'Rungu centre' }];
    const reports = [{ date: '2026-10-15', zs_id: 'isiro', statut: 'soumis', source: 'saisie', nouvelles_as: ['a4'] }];
    const modele = parseModele([
      { Date: '2026-09-01', ZS: 'Isiro', 'Nouveaux cas confirmés vivants': 2, 'Nouveaux cas confirmés décédés': 0, 'Nouvelles AS touchées': 'kele, Mendambo, Rungu centre' },
      { Date: '2026-09-02', ZS: 'Isiro', 'Nouveaux cas confirmés vivants': 1, 'Nouvelles AS touchées': 'Kele; Bassa' },
      { Date: '2026-09-03', ZS: 'Isiro', 'Nouveaux cas confirmés vivants': 1, 'Nouvelles AS touchées': 'Inconnue' },
    ], zsList);
    expect(modele[0].asNoms).toEqual(['kele', 'Mendambo', 'Rungu centre']);
    const plan = buildPlan({ modele }, { reports, zsList, today, areas });
    const [j1, j2, j3] = plan.rows;
    expect(j1.record.nouvelles_as).toEqual(['a1']);
    expect(j1.warnings.join()).toMatch(/Mendambo déjà touchée/);
    expect(j1.warnings.join()).toMatch(/Rungu centre déjà touchée/); // déclarée dans une saisie, même plus tard
    expect(j2.record.nouvelles_as).toEqual(['a3']);
    expect(j3.action).toBe('erreur');
    expect(recordsToImport(plan).every((r) => Array.isArray(r.nouvelles_as))).toBe(true);
  });

  it('DPS : cas confirmés à la date du résultat, décès à part, 1re AS touchée', () => {
    const areas = [{ id: 'k', zs_id: 'isiro', nom: 'Kele' }];
    const inv = [
      { 'Zone de santé': 'Isiro', 'Aire de santé': 'Kele', 'Date notification DPS': '2026-09-01', 'Type événement': 'Cas suspect', 'Classification finale': 'Confirmé', 'Date résultat': '2026-09-03' },
      { 'Zone de santé': 'Isiro', 'Aire de santé': 'Kele', 'Date notification DPS': '2026-09-02', 'Type événement': 'Décès', 'Classification finale': 'Confirmé', 'Date résultat': '2026-09-04' },
      { 'Zone de santé': 'Isiro', 'Aire de santé': 'Nala', 'Date notification DPS': '2026-09-02', 'Type événement': 'Alerte', 'Classification finale': 'Écarté' },
      { 'Zone de santé': 'Wamba', 'Date notification DPS': '2026-09-02', 'Type événement': 'Alerte' },
    ];
    const d = deriveFromDps({ inv }, zsList, today);
    const f = (z, date) => d.fiches.find((x) => x.zs_id === z && x.date === date);
    expect(f('isiro', '2026-09-03').values).toMatchObject({ cas_conf_vivants: 1, cas_conf_decedes: 0 });
    expect(f('isiro', '2026-09-04').values).toMatchObject({ cas_conf_vivants: 0, cas_conf_decedes: 1 });
    expect(f('isiro', '2026-09-01').values.cas_conf_vivants).toBe(0);
    expect(f('isiro', '2026-09-03').asNoms).toEqual(['Kele']);
    expect(f('isiro', '2026-09-04').asNoms).toEqual([]);
    expect(f('wamba', '2026-09-02').values.cas_conf_vivants).toBeUndefined(); // pas de classification : inconnu, pas 0
    const plan = buildPlan({ dps: d.fiches }, { reports: [], zsList, today, areas });
    expect(plan.rows.find((r) => r.date === '2026-09-03' && r.zs_id === 'isiro').record.nouvelles_as).toEqual(['k']);
  });
});
