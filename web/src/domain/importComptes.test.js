import { describe, it, expect } from 'vitest';
import { planImport, roleFrom, phone, dateFrom, heureFrom } from './importComptes.js';

const current = {
  zs: [{ id: 'isiro', nom: 'Isiro', as_total: 20 }, { id: 'wamba', nom: 'Wamba' }, { id: 'faradje', nom: 'Faradje' }],
  actors: [{ id: 'a1', nom: 'Admin SurvEpi', email: 'admin@x.org', role: 'admin', fonction: 'Admin', user_id: 'u1', zs_ids: [] }],
};

describe('import du classeur de comptes', () => {
  it('reconnaît les rôles par libellé, code ou début de libellé', () => {
    expect(roleFrom('Rapporteur ZS')).toBe('rapporteur');
    expect(roleFrom('Épidémiologiste superviseur (1re validation ZS)')).toBe('epidemiologiste');
    expect(roleFrom('validateur')).toBe('validateur');
    expect(roleFrom('Team Lead')).toBe('team_lead');
    expect(roleFrom('data_manager')).toBe('data_manager');
    expect(roleFrom('Chauffeur')).toBe(null);
  });
  it('normalise les numéros congolais et lit les dates et heures', () => {
    expect(phone('0812 345 678')).toBe('+243812345678');
    expect(phone('00243812345678')).toBe('+243812345678');
    expect(phone('+225 07 07 49 72 31')).toBe('+2250707497231');
    expect(dateFrom('05/09/2026').value).toBe('2026-09-05');
    expect(dateFrom(46270).value).toBe('2026-09-05');
    expect(dateFrom('hier').error).toMatch(/illisible/);
    expect(heureFrom(0.6875).value).toBe('16:30');
    expect(heureFrom('16h00').value).toBe('16:00');
  });
  it('construit le plan : créations, mises à jour, erreurs ligne par ligne', () => {
    const plan = planImport({
      zs: [
        { 'Zone de santé *': 'Isiro', 'Code DHIS2': 'HU-ISI', 'Date du 1er cas': '01/09/2026' },
        { 'Zone de santé *': 'Niangara', 'Catégorie': 'En préparation' },
        { 'Zone de santé *': 'Wamba', 'AS total': 10, 'AS affectées': 12 },
      ],
      acteurs: [
        { 'Nom complet *': 'Jean Rapporteur', 'Fonction *': 'IT', 'Rôle *': 'Rapporteur ZS', 'E-mail': 'Jean@X.org', 'WhatsApp': '0811111111', 'Rapporteur titulaire de': 'Niangara' },
        { 'Nom complet *': 'Paul Epi', 'Fonction *': 'Epi', 'Rôle *': 'Épidémiologiste superviseur (1re validation ZS)', 'E-mail': 'paul@x.org', 'ZS suivies': 'Isiro, Wamba' },
        { 'Nom complet *': 'Doublon', 'Fonction *': 'X', 'Rôle *': 'Validateur', 'E-mail': 'jean@x.org' },
        { 'Nom complet *': 'Sans ZS', 'Fonction *': 'X', 'Rôle *': 'Rapporteur ZS', 'ZS suivies': 'Poko' },
        { 'Nom complet *': 'Admin SurvEpi', 'Fonction *': 'Admin', 'Rôle *': 'Administrateur technique (SAV)', 'E-mail': 'admin@x.org' },
        { 'Nom complet *': '', 'Fonction *': '', 'Rôle *': '' },
      ],
    }, current);
    expect(plan.zsOps.map((o) => o.action)).toEqual(['maj', 'creer', 'erreur']);
    expect(plan.zsOps[0].patch).toEqual({ code_dhis2: 'HU-ISI', date_premier_cas: '2026-09-01' });
    expect(plan.zsOps[1].id).toBe('niangara');
    const [jean, paul, doublon, sansZs, admin] = plan.actorOps;
    expect(plan.actorOps).toHaveLength(5); // la ligne vide est ignorée
    expect(jean.action).toBe('creer');
    expect(jean.patch.email).toBe('jean@x.org');
    expect(jean.patch.whatsapp).toBe('+243811111111');
    expect(jean.zs_ids).toEqual(['niangara']);
    expect(jean.titulaire).toEqual(['niangara']);
    expect(paul.zs_ids).toEqual(['isiro', 'wamba']);
    expect(doublon.action).toBe('erreur');
    expect(doublon.errors[0]).toMatch(/ligne 2/);
    expect(sansZs.errors[0]).toMatch(/Poko/);
    expect(sansZs.warnings[0]).toMatch(/e-mail/);
    expect(admin.action).toBe('inchange');
    expect(admin.existingId).toBe('a1');
    expect(plan.resume.acteurs).toEqual({ creer: 2, maj: 0, inchange: 1, erreur: 2 });
  });
});
