import { describe, it, expect } from 'vitest';
import { cumulsZs, joursSansNouveauCas, asTouchees, asProposables, zsAvecDatesCas, situationProvince, detection, rapportPrecedent, avertissementsEpi } from './epi.js';
import { validate } from './report.js';

const zs = { id: 'isiro', nom: 'Isiro', actif: true, base_date: '2026-09-30', base_confirmes: 10, base_deces: 3, base_gueris: 4, base_ppl: 1 };
const f = (date, x, statut = 'valide_prov') => ({ id: `r-${date}`, zs_id: 'isiro', date, statut, submitted_at: `${date}T12:00:00Z`, nouvelles_as: [], ...x });
const reports = [
  f('2026-09-30', { cas_conf_vivants: 5 }),                                        // avant/à la date de référence : ignorée
  f('2026-10-01', { cas_conf_vivants: 2, cas_conf_decedes: 1, cas_conf_ppl: 1, gueris: 0, deces_parmi_confirmes: 0, nouvelles_as: ['as2'] }),
  f('2026-10-02', { cas_conf_vivants: 0, cas_conf_decedes: 0, cas_conf_ppl: 0, gueris: 2, deces_parmi_confirmes: 1 }),
  f('2026-10-03', { cas_conf_vivants: 1, cas_conf_decedes: 0, cas_conf_ppl: 0, gueris: 0, deces_parmi_confirmes: 0 }, 'brouillon'), // non soumise : ignorée
];
const areas = [
  { id: 'as1', zs_id: 'isiro', nom: 'Kele', touchee_le: '2026-09-01' },
  { id: 'as2', zs_id: 'isiro', nom: 'Mendambo' },
  { id: 'as3', zs_id: 'isiro', nom: 'Nangazizi' },
  { id: 'as4', zs_id: 'wamba', nom: 'Bafwabaka' },
];

describe('situation épidémiologique', () => {
  it('cumuls = valeurs initiales + événements après la date de référence (jamais de cumul additionné)', () => {
    const c = cumulsZs(zs, '2026-10-03', reports);
    expect(c.confirmes).toBe(10 + 3);            // 2 vivants + 1 décédé
    expect(c.deces).toBe(3 + 1 + 1);             // confirmé décédé + décès parmi confirmés
    expect(c.gueris).toBe(4 + 2);
    expect(c.ppl).toBe(2);
    expect(c.actifs).toBe(13 - 5 - 6);
    expect(c.letalite).toBeCloseTo(5 / 13);
  });
  it('une correction de fiche se répercute dans le cumul', () => {
    const corrige = reports.map((r) => (r.date === '2026-10-01' ? { ...r, cas_conf_vivants: 4 } : r));
    expect(cumulsZs(zs, '2026-10-03', corrige).confirmes).toBe(15);
  });
  it('jours sans nouveau cas et bascule automatique', () => {
    expect(joursSansNouveauCas(zs, '2026-10-05', reports)).toBe(4);
    const [enrichie] = zsAvecDatesCas([{ id: 'isiro', date_premier_cas: null, date_dernier_cas: null }], reports);
    expect(enrichie.date_premier_cas).toBe('2026-09-30');
    expect(enrichie.date_dernier_cas).toBe('2026-10-01');
  });
  it('aires de santé : touchées une seule fois, proposables sinon', () => {
    const t = asTouchees('isiro', '2026-10-03', areas, reports);
    expect([...t.keys()].sort()).toEqual(['as1', 'as2']);
    expect(asTouchees('isiro', '2026-09-15', areas, reports).size).toBe(1);
    expect(asProposables('isiro', '2026-10-05', areas, reports, 'nouvelle').map((a) => a.id)).toEqual(['as3']);
    expect(asProposables('isiro', '2026-10-01', areas, reports, 'r-2026-10-01').map((a) => a.id)).toEqual(['as2', 'as3']);
  });
  it('synthèse provinciale', () => {
    const p = situationProvince([zs, { id: 'wamba', nom: 'Wamba', actif: true }], '2026-10-01', reports, areas);
    expect(p.totaux.total).toBe(3);
    expect(p.totaux.nouvelles_as).toEqual(['Mendambo (Isiro)']);
    expect(p.totaux.as_touchees).toBe(2);
    expect(p.totaux.jours_sans_cas).toBe(0);
  });
  it('contrôles : PPL ≤ confirmés du jour (bloquant), guéris + décès ≤ cas en cours (avertissement)', () => {
    expect(validate({ cas_conf_vivants: 1, cas_conf_decedes: 0, cas_conf_ppl: 2 }).errors[0].field).toBe('cas_conf_ppl');
    expect(avertissementsEpi({ id: 'x', date: '2026-10-04', gueris: 20, deces_parmi_confirmes: 0, cas_conf_vivants: 0 }, zs, reports)[0].msg).toMatch(/dépassent/);
  });
});

describe('détection des données', () => {
  it('nouveau, inchangé, corrigé, non renseigné ; zéro = donnée rapportée', () => {
    const prec = rapportPrecedent('isiro', '2026-10-03', reports);
    expect(prec.date).toBe('2026-10-02');
    const form = { gueris: 2, deces_parmi_confirmes: 0, cas_conf_vivants: 0, cas_conf_decedes: null, alertes_validees: 7 };
    const versions = [{ data: { statut: 'valide_prov', alertes_validees: 5 } }];
    const { etats, compte } = detection(form, prec, versions);
    expect(etats.gueris.etat).toBe('inchange');
    expect(etats.deces_parmi_confirmes.etat).toBe('nouveau');   // 1 la veille, 0 aujourd'hui
    expect(etats.cas_conf_vivants.etat).toBe('inchange');       // 0 = 0, donnée bien rapportée
    expect(etats.cas_conf_decedes.etat).toBe('non_renseigne');
    expect(etats.alertes_validees.etat).toBe('corrige');
    expect(compte.non_renseigne).toBeGreaterThan(0);
  });
  it('moins de 5 ans : cumuls, létalité, contrôles', () => {
    const z5 = { ...zs, base_moins5: 3, base_deces_moins5: 1, base_gueris_moins5: 1 };
    const reps = [
      f('2026-10-01', { cas_conf_vivants: 2, cas_conf_decedes: 1, cas_conf_moins5: 2, deces_moins5: 1, gueris: 1, gueris_moins5: 0 }),
      f('2026-10-02', { cas_conf_vivants: 0, cas_conf_decedes: 0, cas_conf_moins5: 0, deces_parmi_confirmes: 1, deces_moins5: 0, gueris: 1, gueris_moins5: 1 }),
    ];
    const c = cumulsZs(z5, '2026-10-02', reps);
    expect([c.moins5, c.deces_moins5, c.gueris_moins5, c.actifs_moins5]).toEqual([5, 2, 2, 1]);
    expect(c.letalite_moins5).toBeCloseTo(2 / 5);
    const v = validate({ cas_conf_vivants: 1, cas_conf_decedes: 0, cas_conf_moins5: 2, deces_parmi_confirmes: 0, deces_moins5: 1, gueris: 0, gueris_moins5: 1 });
    expect(v.errors.map((e) => e.field).sort()).toEqual(['cas_conf_moins5', 'deces_moins5', 'gueris_moins5']);
    expect(avertissementsEpi({ id: 'x', date: '2026-10-03', gueris: 1, gueris_moins5: 1, deces_moins5: 1, deces_parmi_confirmes: 1, cas_conf_vivants: 0, cas_conf_moins5: 0 }, z5, reps)
      .some((w) => w.field === 'gueris_moins5')).toBe(true);
  });
  it('sous-groupes PPL et élèves : cumuls, contrôles, synthèse provinciale', () => {
    const zg = { ...zs, base_ppl: 4, base_deces_ppl: 1, base_gueris_ppl: 2, base_eleves: 2, base_deces_eleves: 0, base_gueris_eleves: 1 };
    const reps = [f('2026-10-01', { cas_conf_vivants: 2, cas_conf_decedes: 0, cas_conf_ppl: 1, cas_conf_eleves: 1, deces_parmi_confirmes: 1, deces_ppl: 1, gueris: 1, gueris_eleves: 1 })];
    const c = cumulsZs(zg, '2026-10-01', reps);
    expect(c.groupes.ppl).toMatchObject({ confirmes: 5, deces: 2, gueris: 2, actifs: 1 });
    expect(c.groupes.eleves).toMatchObject({ confirmes: 3, deces: 0, gueris: 2, actifs: 1 });
    const v = validate({ cas_conf_vivants: 1, cas_conf_decedes: 0, cas_conf_eleves: 2, deces_parmi_confirmes: 0, deces_ppl: 1, gueris: 0, gueris_ppl: 1 });
    expect(v.errors.map((e) => e.field).sort()).toEqual(['cas_conf_eleves', 'deces_ppl', 'gueris_ppl']);
    const p = situationProvince([zg], '2026-10-01', reps, []);
    expect(p.totaux.groupes.ppl.jour).toEqual({ conf: 1, deces: 1, gueris: 0 });
    expect(p.totaux.groupes.eleves.part).toBeCloseTo(3 / 12);
  });
});
