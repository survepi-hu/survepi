// Matrice harmonisée V2.1 : alertes, recherche active, sous-groupes, cas par aire de santé (cahier des charges, 21 et annexe I)
import { describe, it, expect } from 'vitest';
import { validate, compute, completeness, carryOver, applyZeroReport, emptyReport, NUM_KEYS, MATRICE_V21 } from './report.js';
import { cumulsZs, statsAs, nouvellesAsDepuisCas } from './epi.js';
import { sommeAlertes } from './alertes.js';

const zero = (over = {}) => { const r = emptyReport('2026-11-10', 'isiro'); for (const k of NUM_KEYS) r[k] = 0; return { ...r, ...over }; };
const champs = (r) => validate(r).errors.map((e) => e.field);

describe('Alertes', () => {
  it('somme des sources ≠ alertes du jour : erreur bloquante', () => {
    expect(champs(zero({ alertes_vivantes: 3, src_ess: 1 }))).toContain('src_ess');
    expect(champs(zero({ alertes_vivantes: 2, alertes_deces: 1, src_ess: 1, src_ra: 2 }))).not.toContain('src_ess');
  });
  it('validées ≤ report + alertes du jour ; prélevés ≤ validées ; report final ≤ à traiter', () => {
    expect(champs(zero({ alertes_report: 1, alertes_vivantes: 1, src_ess: 1, alertes_validees: 3 }))).toContain('alertes_validees');
    expect(champs(zero({ alertes_vivantes: 2, src_ess: 2, alertes_validees: 1, suspects_preleves: 2 }))).toContain('suspects_preleves');
    expect(champs(zero({ alertes_vivantes: 1, src_ess: 1, alertes_report_final: 2 }))).toContain('alertes_report_final');
  });
  it('investiguées ≠ investigations réalisées : avertissement', () => {
    const r = zero({ alertes_vivantes: 2, src_ess: 2, alertes_validees: 2, alertes_investiguees: 1, inv_realisees_jour: 2 });
    expect(validate(r).warnings.map((w) => w.field)).toContain('alertes_investiguees');
  });
  it('report alertes repris du report final de la veille ; justification si modifié', () => {
    const prev = zero({ date: '2026-11-09', alertes_vivantes: 4, src_ess: 4, alertes_report_final: 3 });
    expect(carryOver(prev).alertes_report).toBe(3);
    const r = zero({ alertes_report: 1 });
    expect(validate(r, { prev }).errors.map((e) => e.field)).toContain('justif_report_alertes');
    expect(validate({ ...r, justif_report_alertes: 'Doublons retirés' }, { prev }).errors.map((e) => e.field)).not.toContain('justif_report_alertes');
  });
  it('rapport nul : le stock d’alertes est conservé', () => {
    const prev = zero({ alertes_report_final: 2 });
    const r = applyZeroReport(emptyReport('2026-11-10', 'isiro'), prev);
    expect([r.alertes_report, r.alertes_report_final]).toEqual([2, 2]);
    expect(validate(r, { prev }).errors).toHaveLength(0);
  });
  it('taux de validation et part de prélevés : NA si dénominateur nul', () => {
    expect(compute(zero()).taux_validation_alertes).toBeNull();
    expect(compute(zero({ alertes_report: 2, alertes_vivantes: 2, alertes_validees: 3 })).taux_validation_alertes).toBeCloseTo(0.75);
    expect(compute(zero({ suspects_isoles: 4, suspects_preleves: 3 })).part_preleves).toBeCloseTo(0.75);
  });
});

describe('Recherche active', () => {
  it('visites planifiées réalisées > planifiées : erreur ; les visites hors plan vont à part', () => {
    expect(champs(zero({ ra_planifiees: 2, ra_realisees_plan: 3 }))).toContain('ra_realisees_plan');
    const r = zero({ ra_planifiees: 2, ra_realisees_plan: 2, ra_non_planifiees: 1 });
    expect(champs(r)).not.toContain('ra_realisees_plan');
    expect(compute(r).taux_ra).toBe(1);
    expect(compute(zero()).taux_ra).toBeNull();
  });
  it('ESS et communauté : sous-totaux cohérents', () => {
    expect(champs(zero({ ra_ess_detectees: 1, ra_ess_validees: 1, ra_ess_en_cours: 1 }))).toContain('ra_ess_validees');
    expect(champs(zero({ ra_com_detectees: 1, ra_com_verifiees: 2 }))).toContain('ra_com_verifiees');
    expect(champs(zero({ ra_com_detectees: 2, ra_com_verifiees: 1, ra_com_validees: 2 }))).toContain('ra_com_validees');
    expect(champs(zero({ ra_com_deces_signales: 0, ra_com_deces_investigues: 1 }))).toContain('ra_com_deces_investigues');
  });
  it('source RA ≠ alertes détectées par la recherche active, types de sites ≠ visites : avertissements', () => {
    const w = validate(zero({ alertes_vivantes: 1, src_ra: 1, ra_planifiees: 2, ra_realisees_plan: 2, ra_site_cs: 1 })).warnings.map((x) => x.field);
    expect(w).toContain('src_ra');
    expect(w).toContain('ra_site_hgr');
  });
});

describe('Sous-groupes (annexe D et I)', () => {
  it('élève confirmé vivant à J1, décédé à J4 : +1 cas à J1, +1 décès à J4, +0 nouveau cas à J4', () => {
    const zs = { id: 'isiro' };
    const reps = [zero({ date: '2026-11-10', statut: 'soumis', submitted_at: 'x', cas_conf_vivants: 1, cas_conf_eleves: 1 }),
      zero({ date: '2026-11-13', statut: 'soumis', submitted_at: 'x', deces_parmi_confirmes: 1, deces_eleves: 1 })];
    const j1 = cumulsZs(zs, '2026-11-10', reps), j4 = cumulsZs(zs, '2026-11-13', reps);
    expect([j1.confirmes, j1.groupes.eleves.confirmes, j1.groupes.eleves.deces]).toEqual([1, 1, 0]);
    expect([j4.confirmes, j4.deces, j4.groupes.eleves.confirmes, j4.groupes.eleves.deces]).toEqual([1, 1, 1, 1]);
  });
  it('élève de moins de 5 ans dans les deux sous-groupes, total inchangé', () => {
    const c = cumulsZs({ id: 'isiro' }, '2026-11-10', [zero({ date: '2026-11-10', statut: 'soumis', submitted_at: 'x', cas_conf_vivants: 1, cas_conf_eleves: 1, cas_conf_moins5: 1 })]);
    expect([c.confirmes, c.groupes.eleves.confirmes, c.groupes.moins5.confirmes]).toEqual([1, 1, 1]);
  });
  it('déjà décédés du sous-groupe ≤ ses confirmés et ≤ confirmés décédés ; décès ultérieurs ≤ décès parmi confirmés', () => {
    expect(champs(zero({ cas_conf_vivants: 1, cas_conf_ppl: 1, cas_conf_decedes_ppl: 1 }))).toContain('cas_conf_decedes_ppl');
    expect(champs(zero({ cas_conf_decedes: 1, cas_conf_ppl: 1, cas_conf_decedes_ppl: 1 }))).not.toContain('cas_conf_decedes_ppl');
    expect(champs(zero({ deces_parmi_confirmes: 0, deces_moins5: 1 }))).toContain('deces_moins5');
  });
  it('décès du sous-groupe = déjà décédés à la confirmation + décès ultérieurs', () => {
    const c = cumulsZs({ id: 'isiro', base_date: '2026-11-01', base_ppl: 2, base_deces_ppl: 1 }, '2026-11-10',
      [zero({ date: '2026-11-10', statut: 'soumis', submitted_at: 'x', cas_conf_decedes: 1, cas_conf_ppl: 1, cas_conf_decedes_ppl: 1, deces_parmi_confirmes: 1, deces_ppl: 1 })]);
    expect(c.groupes.ppl).toMatchObject({ confirmes: 3, deces: 3, actifs: 0 });
  });
});

describe('Aires de santé : cas par AS', () => {
  const areas = [{ id: 'a', zs_id: 'isiro', nom: 'Kele' }, { id: 'b', zs_id: 'isiro', nom: 'Nala', touchee_le: '2026-10-01' }];
  it('somme des cas par AS = nouveaux cas confirmés', () => {
    expect(champs(zero({ cas_conf_vivants: 3, cas_par_as: [{ as_id: 'a', n: 2 }] }))).toContain('cas_par_as');
    expect(champs(zero({ cas_conf_vivants: 3, cas_par_as: [{ as_id: 'a', n: 2 }, { as_id: 'b', n: 1 }] }))).not.toContain('cas_par_as');
  });
  it('une AS déjà touchée qui notifie des cas n’est pas nouvelle ; une AS jamais touchée l’est, une seule fois', () => {
    const f = zero({ id: 'f1', cas_conf_vivants: 3, cas_par_as: [{ as_id: 'a', n: 2 }, { as_id: 'b', n: 1 }] });
    expect(nouvellesAsDepuisCas(f, areas, [])).toEqual(['a']);
    const avant = [{ ...f, statut: 'soumis', submitted_at: 'x', nouvelles_as: ['a'] }];
    const f2 = zero({ id: 'f2', date: '2026-11-12', cas_conf_vivants: 1, cas_par_as: [{ as_id: 'a', n: 1 }] });
    expect(nouvellesAsDepuisCas(f2, areas, avant)).toEqual([]);
  });
  it('dates du 1er et du dernier cas, cumul et jours sans nouveau cas par AS', () => {
    const reps = [zero({ date: '2026-11-10', statut: 'soumis', submitted_at: 'x', cas_conf_vivants: 2, cas_par_as: [{ as_id: 'a', n: 2 }], nouvelles_as: ['a'] }),
      zero({ date: '2026-11-12', statut: 'soumis', submitted_at: 'x', cas_conf_vivants: 1, cas_par_as: [{ as_id: 'a', n: 1 }] })];
    const st = statsAs('isiro', '2026-11-15', areas, reps);
    expect(st.get('a')).toMatchObject({ premier: '2026-11-10', dernier: '2026-11-12', cas: 3, jours_sans_cas: 3 });
    expect(st.get('b')).toMatchObject({ premier: '2026-10-01', cas: 0 });
  });
});

describe('Entrée en vigueur et sommes', () => {
  it('les nouveaux champs ne rendent pas incomplètes les fiches d’avant la matrice V2.1', () => {
    const avant = { ...zero({ date: '2026-11-05' }) };
    for (const k of ['alertes_vivantes', 'ra_planifiees', 'cas_conf_decedes_ppl']) avant[k] = null;
    expect(completeness(avant)).toBe(1);
    expect(completeness({ ...avant, date: MATRICE_V21 })).toBeLessThan(1);
  });
  it('somme provinciale des alertes', () => {
    const t = sommeAlertes([zero({ statut: 'soumis', submitted_at: 'x', alertes_vivantes: 2, alertes_report: 1, alertes_validees: 2, ra_planifiees: 4, ra_realisees_plan: 3 }),
      zero({ statut: 'soumis', submitted_at: 'x', alertes_vivantes: 1, alertes_validees: 1 }), null]);
    expect([t.alertes_jour, t.alertes_a_traiter, t.alertes_validees, t.fiches]).toEqual([3, 4, 3, 2]);
    expect(t.taux_ra).toBeCloseTo(0.75);
  });
});
