// Tests de recette fonctionnelle (cahier des charges §21) + règles du cahier « Suivi reporting ».
import { describe, it, expect } from 'vitest';
import { compute, validate, completeness, isComplete, statusOnSubmit, carryOver, applyZeroReport, emptyReport, NUM_KEYS } from './report.js';
import { zsCategory, isExpected, timeliness, provincial, indexReports, gapAlerts, rapporteurStats, aggregate } from './indicators.js';
import { planReminders } from './reminders.js';
import { deferInvestigation, contactDates, listedWithin24h, followupGrid, realisationKind, needsSupervisor, tauxSortieJ21 } from './registry.js';
import { epiWeek, localParts } from './time.js';

const S = { heure_limite: '16:30', seuil_suivi: 0.8, fuseau: 'Africa/Lubumbashi', jours_post_flambee: 42 };
const full = (over = {}) => {
  const r = emptyReport('2026-10-15', 'isiro');
  for (const k of NUM_KEYS) r[k] = 0;
  return Object.assign(r, over);
};
// 2026-10-15 16:00 à Isiro (UTC+2) = 14:00Z
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();

describe('Investigations', () => {
  it('10 alertes validées, 8 investigations du jour -> taux 80 %', () => {
    const c = compute(full({ alertes_validees: 10, inv_realisees_jour: 8 }));
    expect(c.taux_inv).toBeCloseTo(0.8);
    expect(c.inv_non_faites).toBe(2);
  });
  it('3 anciens reports apurés ne font pas dépasser le taux du jour', () => {
    const c = compute(full({ alertes_validees: 10, inv_realisees_jour: 8, inv_report_entrant: 5, inv_realisees_report: 3 }));
    expect(c.taux_inv).toBeCloseTo(0.8);
    expect(c.inv_total_realisees).toBe(11);
    expect(c.inv_report_sortant).toBe(2 + 2); // (A-Ij) + (R-Ir)
  });
  it('Ij > A et Ir > R sont bloquants', () => {
    const { errors } = validate(full({ alertes_validees: 3, inv_realisees_jour: 4, inv_report_entrant: 1, inv_realisees_report: 2, motifs_inv: ['autre'], motif_autre: 'x' }));
    expect(errors.map((e) => e.field)).toEqual(expect.arrayContaining(['inv_realisees_jour', 'inv_realisees_report']));
  });
  it('motif obligatoire si des investigations restent non faites', () => {
    expect(validate(full({ alertes_validees: 4, inv_realisees_jour: 3 })).errors.some((e) => e.field === 'motifs_inv')).toBe(true);
    expect(validate(full({ alertes_validees: 4, inv_realisees_jour: 3, motifs_inv: ['carburant'] })).errors).toHaveLength(0);
  });
  it('A = 0 -> taux NA, pas 0 %', () => {
    expect(compute(full()).taux_inv).toBeNull();
  });
});

describe('Contacts', () => {
  it('35 identifiés, 32 listés ≤ 24 h -> 91,4 %', () => {
    expect(compute(full({ ct_identifies: 35, ct_listes_24h: 32 })).taux_listage).toBeCloseTo(0.914, 3);
  });
  it('à suivre = report + listés - sorties ; vus ≤ à suivre', () => {
    const r = full({ ct_report: 100, ct_listes_24h: 10, ct_sortie_21j: 5, ct_sortie_perdus: 1, ct_vus: 95, motifs_suivi: ['absent'], ct_identifies: 10, reco_actifs: 5 });
    const c = compute(r);
    expect(c.ct_a_suivre).toBe(104);
    expect(c.ct_non_vus).toBe(9);
    expect(c.taux_suivi).toBeCloseTo(95 / 104);
    expect(validate({ ...r, ct_vus: 105 }).errors.some((e) => e.field === 'ct_vus')).toBe(true);
  });
  it('sorties > report + listés est bloquant', () => {
    expect(validate(full({ ct_report: 2, ct_sortie_21j: 3 })).errors.some((e) => e.field === 'ct_sortie_21j')).toBe(true);
  });
  it('report modifié par rapport à la veille -> justification', () => {
    const prev = full({ ct_report: 50, ct_vus: 50, reco_actifs: 3 });
    const r = full({ ct_report: 48, ct_vus: 48, reco_actifs: 3 });
    expect(validate(r, { prev }).errors.some((e) => e.field === 'justif_report_ct')).toBe(true);
    expect(validate({ ...r, justif_report_ct: 'Recomptage' }, { prev }).errors).toHaveLength(0);
  });
  it('carry-over : report entrant = report sortant veille', () => {
    const prev = full({ alertes_validees: 6, inv_realisees_jour: 4, inv_report_entrant: 3, inv_realisees_report: 1, ct_report: 20, ct_listes_24h: 5, ct_vus: 22 });
    expect(carryOver(prev)).toEqual({ inv_report_entrant: 4, ct_report: 25, ct_nonvus_veille: 3 });
  });
});

describe('Complétude et promptitude', () => {
  it('champ obligatoire manquant -> fiche incomplète', () => {
    const r = full({ alertes_validees: null });
    expect(completeness(r)).toBeLessThan(1);
    expect(isComplete(r)).toBe(false);
    expect(statusOnSubmit(r).statut).toBe('incomplet');
    expect(statusOnSubmit(full()).statut).toBe('soumis');
  });
  it('rapport nul en un clic = fiche complète', () => {
    expect(isComplete(applyZeroReport(emptyReport('2026-10-15', 'faradje'), null))).toBe(true);
  });
  it('soumission après l’heure limite -> reçue mais non prompte', () => {
    const zs = { id: 'isiro', date_premier_cas: '2026-09-01' };
    const np = localParts(new Date(at('2026-10-15', '18:00')), S.fuseau);
    expect(timeliness({ statut: 'soumis', submitted_at: at('2026-10-15', '16:10') }, zs, '2026-10-15', S, np)).toBe('a_temps');
    expect(timeliness({ statut: 'soumis', submitted_at: at('2026-10-15', '16:45') }, zs, '2026-10-15', S, np)).toBe('en_retard');
    expect(timeliness(null, zs, '2026-10-15', S, np)).toBe('non_recu');
    const npTot = localParts(new Date(at('2026-10-15', '11:00')), S.fuseau);
    expect(timeliness(null, zs, '2026-10-15', S, npTot)).toBe('en_attente');
  });
  it('complétude provinciale séparée touchées / en préparation', () => {
    const zsList = [{ id: 'a', nom: 'A', date_premier_cas: '2026-09-01' }, { id: 'b', nom: 'B', date_premier_cas: '2026-09-01' }, { id: 'p', nom: 'P' }];
    const reports = [{ ...full(), zs_id: 'a', statut: 'soumis', submitted_at: at('2026-10-15', '15:00') }];
    const np = localParts(new Date(at('2026-10-15', '18:00')), S.fuseau);
    const p = provincial(zsList, '2026-10-15', indexReports(reports), S, np);
    expect(p.groups.touchee).toMatchObject({ attendues: 2, recues: 1, completude: 0.5 });
    expect(p.groups.preparation).toMatchObject({ attendues: 1, recues: 0, completude: 0 });
  });
});

describe('Référentiel ZS', () => {
  it('bascule en préparation -> touchée -> post-flambée après 42 jours', () => {
    const zs = { date_premier_cas: '2026-08-20', date_dernier_cas: '2026-09-01' };
    expect(zsCategory({}, '2026-10-15', S)).toBe('preparation');
    expect(zsCategory(zs, '2026-08-19', S)).toBe('preparation');
    expect(zsCategory(zs, '2026-10-12', S)).toBe('touchee');
    expect(zsCategory(zs, '2026-10-13', S)).toBe('post_flambee');
  });
  it('ZS en préparation hebdomadaire attendue un seul jour', () => {
    const zs = { frequence: 'hebdomadaire', jour_hebdo: 1 };
    expect(isExpected(zs, '2026-10-12', S)).toBe(true); // lundi
    expect(isExpected(zs, '2026-10-13', S)).toBe(false);
  });
});

describe('Rappels', () => {
  const zsList = [{ id: 'isiro', nom: 'Isiro', date_premier_cas: '2026-09-01', rapporteur_id: 'r1', suppleant_id: 'r2' }];
  const actors = [
    { id: 'r1', nom: 'Rapporteur', whatsapp: '+243', canal_prefere: 'whatsapp', email: 'r@x' },
    { id: 'r2', nom: 'Suppléant', sms: '+243', canal_prefere: 'sms' },
    { id: 'tl', nom: 'Team Lead', role: 'team_lead', whatsapp: '+243' },
  ];
  it('absence de soumission -> rappel selon horaire, avec manquants au rappel final', () => {
    const p12 = planReminders({ now: new Date(at('2026-10-15', '12:05')), zsList, actors, reports: [], settings: S });
    expect(p12.map((x) => x.destinataire_id)).toEqual(['r1']);
    const p16 = planReminders({ now: new Date(at('2026-10-15', '16:02')), zsList, actors, reports: [], settings: S });
    expect(p16.map((x) => x.destinataire_id)).toEqual(['r1', 'r2']);
    expect(p16[0].message).toMatch(/Éléments manquants/);
    const esc = planReminders({ now: new Date(at('2026-10-15', '16:50')), zsList, actors, reports: [], settings: S });
    expect(esc.map((x) => x.destinataire_id)).toContain('tl');
  });
  it('arrêt des rappels dès un rapport complet ; pas de doublon', () => {
    const r = { ...full(), statut: 'soumis', submitted_at: at('2026-10-15', '13:00') };
    expect(planReminders({ now: new Date(at('2026-10-15', '15:01')), zsList, actors, reports: [r], settings: S })).toHaveLength(0);
    const first = planReminders({ now: new Date(at('2026-10-15', '12:05')), zsList, actors, reports: [], settings: S });
    const again = planReminders({ now: new Date(at('2026-10-15', '12:10')), zsList, actors, reports: [], settings: S, sentKeys: new Set(first.map((x) => x.key)) });
    expect(again).toHaveLength(0);
  });
  it('titulaire en congé -> suppléant', () => {
    const a2 = actors.map((a) => (a.id === 'r1' ? { ...a, statut: 'conge' } : a));
    const p = planReminders({ now: new Date(at('2026-10-15', '12:05')), zsList, actors: a2, reports: [], settings: S });
    expect(p.map((x) => x.destinataire_id)).toEqual(['r2']);
  });
});

describe('Registres', () => {
  it('report : motif, échéance et responsable obligatoires ; compteur incrémenté', () => {
    const inv = { id: 'i1', code: 'INV-1', date_ref: '2026-10-14', statut: 'a_faire', nb_reports: 0 };
    expect(deferInvestigation(inv, {}, '2026-10-15').errors.length).toBe(3);
    const d1 = deferInvestigation(inv, { motif: 'carburant', nouvelle_echeance: '2026-10-16', responsable_id: 'r1' }, '2026-10-15');
    expect(d1.patch.nb_reports).toBe(1);
    const d2 = deferInvestigation({ ...inv, ...d1.patch }, { motif: 'carburant', nouvelle_echeance: '2026-10-17', responsable_id: 'r1' }, '2026-10-16');
    expect(d2.patch.nb_reports).toBe(2);
    expect(needsSupervisor({ ...inv, ...d2.patch }, 2)).toBe(true);
  });
  it('investigation ancienne réalisée aujourd’hui = report apuré', () => {
    expect(realisationKind({ date_ref: '2026-10-14' }, '2026-10-15')).toBe('report_apure');
    expect(realisationKind({ date_ref: '2026-10-15' }, '2026-10-15')).toBe('jour');
  });
  it('J1-J21 calculés, grille de 21 jours', () => {
    expect(contactDates('2026-10-01')).toEqual({ j1: '2026-10-02', j21: '2026-10-22' });
    const g = followupGrid({ id: 'c', date_exposition: '2026-10-01' }, [{ contact_id: 'c', jour: 1, statut_visite: 'vu' }], '2026-10-05');
    expect(g).toHaveLength(21);
    expect(g[0].etat).toBe('vu');
    expect(g[1].etat).toBe('manquant');
    expect(g[3].etat).toBe('du');
    expect(tauxSortieJ21([{ date_exposition: '2026-09-01', statut: 'sorti_j21' }, { date_exposition: '2026-09-01', statut: 'perdu_vue' }], '2026-10-15')).toBe(0.5);
  });
  it('listage ≤ 24 h', () => {
    expect(listedWithin24h('2026-10-14T10:00', '2026-10-15T09:00')).toBe(true);
    expect(listedWithin24h('2026-10-14T10:00', '2026-10-15T11:00')).toBe(false);
  });
});

describe('Notifications d’écart et rapporteurs', () => {
  const zsList = [{ id: 'z', nom: 'Z', date_premier_cas: '2026-09-01', rapporteur_id: 'r1' }];
  const np = localParts(new Date(at('2026-10-15', '18:00')), S.fuseau);
  it('deux jours de suite sans rapport ; report en hausse', () => {
    expect(gapAlerts(zsList, '2026-10-15', indexReports([]), S, np).map((x) => x.type)).toContain('sans_rapport');
    const mk = (date, A) => ({ ...full({ alertes_validees: A, motifs_inv: ['carburant'], reco_actifs: 1 }), date, zs_id: 'z', statut: 'soumis', submitted_at: at(date, '15:00') });
    const reps = [mk('2026-10-13', 1), mk('2026-10-14', 2), mk('2026-10-15', 3)];
    expect(gapAlerts(zsList, '2026-10-15', indexReports(reps), S, np).map((x) => x.type)).toContain('report_hausse');
  });
  it('fiche rapporteur : ponctualité et jours consécutifs', () => {
    const reps = [{ ...full(), date: '2026-10-15', zs_id: 'z', statut: 'soumis', submitted_at: at('2026-10-15', '15:30') }];
    const s = rapporteurStats({ id: 'r1' }, zsList, indexReports(reps), S, np, []);
    expect(s.j7).toMatchObject({ attendus: 7, recus: 1, a_temps: 1 });
    expect(s.j7.delai_moyen).toBe(-60);
    expect(s.consecutifs).toBe(0);
  });
  it('agrégat : taux recalculés sur totaux', () => {
    const t = aggregate([full({ alertes_validees: 10, inv_realisees_jour: 5 }), full({ alertes_validees: 30, inv_realisees_jour: 30 })]);
    expect(t.taux_inv).toBeCloseTo(35 / 40);
  });
  it('semaine épidémiologique ISO', () => {
    expect(epiWeek('2026-10-15').label).toBe('S42-2026');
  });
});

import { dispatch, waLink } from './reminders.js';
import { canValidate } from './report.js';

describe('Double validation', () => {
  it('province seulement après ZS, par une autre personne', () => {
    expect(canValidate('valider_prov', 'team_lead', { statut: 'soumis' }, 'tl')).toBe(false);
    expect(canValidate('valider_prov', 'team_lead', { statut: 'valide_zs', validated_zs_by: 'tl' }, 'tl')).toBe(false);
    expect(canValidate('valider_prov', 'validateur', { statut: 'valide_zs', validated_zs_by: 'epi' }, 'amosi')).toBe(true);
    expect(canValidate('valider_zs', 'epidemiologiste', { statut: 'soumis' }, 'epi')).toBe(true);
  });
});

describe('Canaux sans WhatsApp Business', () => {
  const plan = [
    { key: 'd|isiro|final|r1', date: '2026-10-15', zs_id: 'isiro', zs_nom: 'Isiro', step: 'final', type: 'final', destinataire_id: 'r1', nom: 'R', canal: 'whatsapp', adresse: '+243 81 000 0101', copie_email: 'r@x.cd', message: 'Rappel SurvEpi - Isiro', etat: 'non reçu', libelle: 'Rappel final', limite: '16:30' },
    { key: 'd|isiro|final|r2', date: '2026-10-15', zs_id: 'isiro', zs_nom: 'Isiro', step: 'final', type: 'final', destinataire_id: 'r2', nom: 'S', canal: 'sms', adresse: '+243810000102', message: 'Rappel SurvEpi - Isiro', etat: 'non reçu', libelle: 'Rappel final', limite: '16:30' },
    { key: 'd|pawa|final|r3', date: '2026-10-15', zs_id: 'pawa', zs_nom: 'Pawa', step: 'final', type: 'final', destinataire_id: 'r3', nom: 'P', canal: 'email', adresse: 'p@x.cd', message: 'Rappel SurvEpi - Pawa', etat: 'incomplet', manquants: ['Contacts vus'], libelle: 'Rappel final', limite: '16:30' },
  ];
  it('WhatsApp en file manuelle, e-mails automatiques, SMS basculé en WhatsApp, message de groupe', () => {
    const rows = dispatch(plan, {});
    const wa = rows.filter((r) => r.mode === 'manuel');
    const mail = rows.filter((r) => r.canal === 'email');
    expect(wa.map((r) => r.destinataire_id)).toEqual(['r1', 'r2', 'groupe']);
    expect(wa.every((r) => r.statut === 'a_envoyer' && r.lien.startsWith('https://wa.me/'))).toBe(true);
    expect(wa[0].lien).toContain('wa.me/243810000101?text=');
    expect(mail.map((r) => r.adresse)).toEqual(['r@x.cd', 'p@x.cd']);
    expect(mail.every((r) => r.mode === 'auto' && r.statut === 'en_attente')).toBe(true);
    expect(wa[2].message).toMatch(/Non reçu : Isiro\. Incomplet : Pawa \(Contacts vus\)/);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
  it('lien de groupe sans numéro', () => {
    expect(waLink('', 'a b')).toBe('https://wa.me/?text=a%20b');
  });
});
