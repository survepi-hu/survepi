// Jeu de données FICTIF pour la démonstration. Aucun chiffre réel de la riposte.
// Généré de façon déterministe relativement à la date du jour, en respectant
// les reports d'un jour sur l'autre et tous les contrôles bloquants.
import { NUM_KEYS, compute, emptyReport } from '../domain/report.js';
import { planReminders, DEFAULT_STEPS, dispatch } from '../domain/reminders.js';
import { addDays, localParts, hhmmToMin } from '../domain/time.js';

export const DEMO_SETTINGS = {
  evenement: 'MVE-17',
  province_nom: 'Haut-Uélé',
  province_code: 'HU',
  dps_nom: 'DPS Haut-Uélé',
  fuseau: 'Africa/Lubumbashi',
  heure_limite: '16:30',
  seuil_suivi: 0.8,
  jours_post_flambee: 42,
  seuil_escalade_reports: 2,
  heure_rappel_reports: '08:00',
  duree_suivi: 21,
  registres_actifs: true,
  whatsapp_mode: 'manuel',
  whatsapp_groupe: true,
  whatsapp_groupe_nom: 'Groupe WhatsApp SurvEpi Haut-Uélé',
  email_auto: true,
  sms_actif: false,
  rappels: DEFAULT_STEPS,
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZS = [
  { id: 'isiro', nom: 'Isiro', code_dhis2: 'DEMO-ISI', hotspot: true, premier: -40, dernier: -1, as_total: 21, as_affectees: 9, base: 6, suivi: 0.96, ct0: 180, lat: 2.775, lon: 27.616 },
  { id: 'wamba', nom: 'Wamba', code_dhis2: 'DEMO-WAM', hotspot: true, premier: -37, dernier: -3, as_total: 24, as_affectees: 7, base: 5, suivi: 0.9, ct0: 140, lat: 2.144, lon: 27.993 },
  { id: 'pawa', nom: 'Pawa', code_dhis2: 'DEMO-PAW', hotspot: true, premier: -33, dernier: -2, as_total: 18, as_affectees: 5, base: 4, suivi: 0.73, ct0: 110, lat: 2.35, lon: 28.1 },
  { id: 'boma-mangbetu', nom: 'Boma-Mangbetu', code_dhis2: 'DEMO-BOM', hotspot: true, premier: -30, dernier: -4, as_total: 16, as_affectees: 4, base: 4, suivi: 0.91, ct0: 90, lat: 3.2, lon: 27.4 },
  { id: 'dungu', nom: 'Dungu', code_dhis2: 'DEMO-DUN', hotspot: false, premier: -21, dernier: -2, as_total: 22, as_affectees: 3, base: 2, suivi: 0.88, ct0: 40, lat: 3.62, lon: 28.56 },
  { id: 'rungu', nom: 'Rungu', code_dhis2: 'DEMO-RUN', hotspot: false, premier: -18, dernier: -9, as_total: 20, as_affectees: 2, base: 1, suivi: 0.92, ct0: 25, lat: 2.9, lon: 27.2 },
  { id: 'gombari', nom: 'Gombari', code_dhis2: 'DEMO-GOM', hotspot: false, premier: -15, dernier: -11, as_total: 17, as_affectees: 1, base: 1, suivi: 0.94, ct0: 18, lat: 2.97, lon: 29.47 },
  { id: 'faradje', nom: 'Faradje', code_dhis2: 'DEMO-FAR', hotspot: false, premier: null, dernier: null, as_total: 19, as_affectees: 0, base: 0, suivi: 1, ct0: 0, lat: 3.74, lon: 29.71 },
];

const phone = (i) => `+243 81 000 ${String(100 + i).padStart(4, '0')}`;

export function buildDemo(now = new Date()) {
  const r = rng(42);
  const tz = DEMO_SETTINGS.fuseau;
  const np = localParts(now, tz);
  const T = np.date;
  const ts = (date, min) => new Date(`${date}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00+02:00`).toISOString();

  // ---------------- Acteurs
  const actors = [
    { id: 'tl', nom: 'Dr Trésor Mosomo', fonction: 'Team Lead SurvEpi', organisation: 'OMS', role: 'team_lead', canal_prefere: 'whatsapp', whatsapp: phone(1), email: 'teamlead@demo.invalid', statut: 'actif', actif: true, zs_ids: [] },
    { id: 'amosi', nom: 'Dr Amosi Kikwata', fonction: 'Épidémiologiste terrain, validateur', organisation: 'OMS', role: 'validateur', canal_prefere: 'whatsapp', whatsapp: phone(2), statut: 'actif', actif: true, zs_ids: [] },
    { id: 'dm', nom: 'Data manager provincial', fonction: 'Gestionnaire de données', organisation: 'DPS', role: 'data_manager', canal_prefere: 'email', email: 'data@demo.invalid', statut: 'actif', actif: true, zs_ids: [] },
    { id: 'admin', nom: 'Administrateur SurvEpi', fonction: 'Administrateur', organisation: 'OMS', role: 'admin', canal_prefere: 'in_app', statut: 'actif', actif: true, zs_ids: [] },
    { id: 'coord', nom: 'Coordination provinciale', fonction: 'Lecture seule', organisation: 'DPS', role: 'coordination', canal_prefere: 'email', statut: 'actif', actif: true, zs_ids: [] },
    { id: 'epi-nord', nom: 'Épidémiologiste superviseur Isiro / Wamba', fonction: 'Épidémiologiste', organisation: 'OMS', role: 'epidemiologiste', canal_prefere: 'whatsapp', whatsapp: phone(3), statut: 'actif', actif: true, zs_ids: ['isiro', 'wamba', 'pawa'] },
  ];
  const zs = ZS.map((z, i) => {
    const tit = { id: `r-${z.id}`, nom: `Rapporteur ${z.nom}`, fonction: 'Data ZS', organisation: 'BCZ', role: 'rapporteur', canal_prefere: 'whatsapp', whatsapp: phone(10 + i * 2), sms: phone(10 + i * 2), email: `${z.id}@demo.invalid`, statut: z.id === 'dungu' ? 'conge' : 'actif', actif: true, zs_ids: [z.id], dispo_debut: '07:00', dispo_fin: '19:00' };
    const sup = { id: `s-${z.id}`, nom: `Suppléant ${z.nom}`, fonction: 'Data ZS', organisation: 'BCZ', role: 'rapporteur', canal_prefere: 'sms', sms: phone(11 + i * 2), statut: 'actif', actif: true, zs_ids: [z.id], dispo_debut: '07:00', dispo_fin: '19:00' };
    actors.push(tit, sup);
    return {
      id: z.id, code_dhis2: z.code_dhis2, nom: z.nom, hotspot: z.hotspot,
      categorie_manuelle: z.premier === null ? 'preparation' : 'touchee',
      date_premier_cas: z.premier === null ? null : addDays(T, z.premier),
      date_dernier_cas: z.dernier === null ? null : addDays(T, z.dernier),
      as_total: z.as_total, as_affectees: z.as_affectees,
      mcz_nom: `MCZ ${z.nom}`, mcz_contact: phone(40 + i), rapporteur_id: tit.id, suppleant_id: sup.id,
      epidemiologistes: ['isiro', 'wamba', 'pawa'].includes(z.id) ? 'Épidémiologiste superviseur Isiro / Wamba' : 'Équipe provinciale',
      dos: z.premier === null ? '' : 'DOS ' + z.nom, frequence: 'quotidienne', jour_hebdo: 1, heure_limite: null,
      lat: z.lat, lon: z.lon, actif: true, date_debut: addDays(T, -34),
    };
  });
  const assignments = actors.flatMap((a) => (a.zs_ids || []).map((zs_id) => ({ actor_id: a.id, zs_id })));

  // ---------------- Fiches journalières
  const reports = [];
  const start = addDays(T, -34);
  for (const z of ZS) {
    let carry = { inv: 0, ct: 0, nonvus: 0, nonListes: 0 };
    let burst = z.ct0; // listage initial au 1er jour actif
    for (let k = 0; k <= 34; k++) {
      const d = addDays(start, k);
      const ago = -k + 34; // 0 = aujourd'hui
      // Absences scénarisées
      if (z.id === 'wamba' && (ago === 1 || ago === 2)) continue; // deux jours sans rapport
      if (ago === 0 && ['wamba', 'pawa', 'dungu', 'rungu'].includes(z.id)) continue; // en attente aujourd'hui
      if (r() < 0.025 && ago > 3) continue; // quelques trous

      const zp = zs.find((x) => x.id === z.id);
      const actif = zp.date_premier_cas && d >= zp.date_premier_cas;
      const rep = emptyReport(d, z.id);
      for (const key of NUM_KEYS) rep[key] = 0;
      rep.rapporteur_id = `r-${z.id}`;
      if (!actif) {
        rep.rapport_nul = true;
        rep.ct_report = carry.ct; rep.inv_report_entrant = carry.inv;
      } else {
        let base = z.base * (ago < 12 ? 1.2 : 0.8);
        if (z.id === 'dungu' && ago <= 2) base = 4;
        const A = Math.max(0, Math.round(base * (0.55 + r() * 0.9)));
        let Ij = Math.max(0, A - (r() < 0.35 ? 1 : 0) - (r() < 0.1 ? 1 : 0));
        if (z.id === 'dungu' && ago <= 2) Ij = Math.max(0, A - 2);
        const R = carry.inv;
        const Ir = R > 0 ? Math.max(0, R - (r() < 0.35 ? 1 : 0)) : 0;
        Object.assign(rep, { alertes_validees: A, inv_report_entrant: R, inv_realisees_jour: Ij, inv_realisees_report: z.id === 'dungu' && ago <= 2 ? 0 : Ir });
        const tot = Ij + rep.inv_realisees_report;
        rep.inv_moins_24h = Math.max(0, Ij - (r() < 0.4 ? 1 : 0));
        rep.narratifs_attendus = tot; rep.narratifs_disponibles = Math.max(0, tot - (r() < 0.3 ? 1 : 0));
        rep.mappings_attendus = tot; rep.mappings_disponibles = Math.max(0, tot - (r() < 0.4 ? 1 : 0));
        const ident = Math.round(tot * (2.5 + r() * 3)) + burst;
        burst = 0;
        const listes = Math.max(0, ident - (r() < 0.35 ? Math.ceil(ident * 0.12) : 0));
        rep.ct_identifies = ident; rep.ct_listes_24h = listes; rep.ct_listes_tardifs = carry.nonListes;
        rep.ct_report = carry.ct;
        const entrees = carry.ct + listes + carry.nonListes;
        const s21 = Math.min(entrees, Math.round((carry.ct / 21) * (0.7 + r() * 0.6)));
        let reste = entrees - s21;
        const take = (p) => { const v = Math.min(reste, r() < p ? 1 + Math.floor(r() * 2) : 0); reste -= v; return v; };
        Object.assign(rep, { ct_sortie_21j: s21, ct_sortie_symptomatiques: take(0.25), ct_sortie_confirmes: take(0.06),
          ct_sortie_perdus: take(z.suivi < 0.8 ? 0.4 : 0.1), ct_sortie_deplaces: take(0.1), ct_sortie_decedes: take(0.02), ct_sortie_doublons: take(0.08) });
        const aSuivre = compute(rep).ct_a_suivre;
        const rate = Math.min(1, z.suivi + (r() - 0.5) * 0.06);
        rep.ct_vus = Math.min(aSuivre, Math.round(aSuivre * rate));
        rep.ct_nonvus_veille = carry.nonvus;
        rep.ct_rattrapes = Math.round(carry.nonvus * (0.4 + r() * 0.4));
        rep.reco_actifs = Math.max(1, Math.ceil(aSuivre / 11));
        rep.superviseurs_reco = Math.max(1, Math.ceil(rep.reco_actifs / 8));
        const c = compute(rep);
        if (c.inv_report_sortant > 0) rep.motifs_inv = [['carburant', 'eloignement', 'insecurite', 'equipe_indispo'][Math.floor(r() * 4)]];
        if (c.ct_non_vus > 0) rep.motifs_suivi = [['absent', 'acces', 'refus', 'reco_indispo'][Math.floor(r() * 4)]];
        if (c.taux_suivi !== null && c.taux_suivi < 0.8) rep.commentaire = 'Pluies, deux aires de santé difficiles d’accès. Renfort RECO demandé.';
        else if (c.ct_non_listes_24h > 0 || (rep.narratifs_disponibles < rep.narratifs_attendus)) rep.commentaire = 'Listage et narratifs en cours de finalisation, complétés demain.';
        else if (ident > 0 && tot === 0) rep.commentaire = 'Contacts issus d’une investigation de la veille.';
      }
      // Justification si la veille manque
      const prevExists = reports.some((x) => x.zs_id === z.id && x.date === addDays(d, -1));
      if (!prevExists && k > 0) { rep.justif_report_inv = 'Fiche de la veille non transmise, report repris du dernier rapport.'; rep.justif_report_ct = rep.justif_report_inv; }

      // Heure de soumission
      let sub = hhmmToMin('13:30') + Math.floor(r() * 150);
      if (r() < 0.12) sub = hhmmToMin('16:35') + Math.floor(r() * 80);
      if (ago === 0) sub = { isiro: hhmmToMin('11:40'), gombari: hhmmToMin('11:55'), faradje: hhmmToMin('11:20') }[z.id] ?? null;
      if (ago === 0 && z.id === 'boma-mangbetu') { // brouillon commencé, pas soumis
        rep.statut = 'brouillon'; rep.ct_vus = null; rep.reco_actifs = null; rep.motifs_suivi = []; rep.started_at = ts(d, hhmmToMin('10:50'));
      } else {
        rep.submitted_at = ts(d, sub);
        rep.started_at = ts(d, sub - 25);
        rep.statut = ago > 2 ? 'valide_prov' : ago === 2 ? 'valide_zs' : ago === 1 ? (r() < 0.5 ? 'valide_zs' : 'soumis') : 'soumis';
        if (z.id === 'rungu' && ago === 1) { rep.statut = 'a_corriger'; rep.commentaire = 'Retour superviseur : vérifier les sorties « doublons ».'; }
        if (['valide_zs', 'valide_prov'].includes(rep.statut)) {
          rep.validated_zs_by = ['isiro', 'wamba', 'pawa'].includes(z.id) ? 'epi-nord' : 'tl'; rep.validated_zs_at = ts(d, Math.min(sub + 45, 1430));
        }
        if (rep.statut === 'valide_prov') { rep.validated_by = 'amosi'; rep.validated_at = ts(d, Math.min(sub + 120, 1435)); }
      }
      rep.id = `rep-${z.id}-${d}`;
      rep.version = 1;
      reports.push(rep);
      const c = compute(rep);
      carry = { inv: c.inv_report_sortant, ct: c.ct_a_suivre, nonvus: c.ct_non_vus, nonListes: c.ct_non_listes_24h };
    }
  }

  // ---------------- Notifications (rejouées avec le moteur de rappels)
  const notifications = [];
  const sentKeys = new Set();
  for (let ago = 13; ago >= 0; ago--) {
    const d = addDays(T, -ago);
    for (const step of DEFAULT_STEPS) {
      const m = hhmmToMin(step.heure) + 2;
      if (ago === 0 && m > np.minutes) continue;
      const at = new Date(ts(d, m));
      const visible = reports.filter((x) => x.date !== d || (x.submitted_at && x.submitted_at <= at.toISOString()))
        .map((x) => (x.date === d && x.submitted_at > at.toISOString() ? { ...x, statut: 'brouillon', submitted_at: null } : x));
      const plan = planReminders({ now: at, zsList: zs, actors, reports: visible, settings: DEMO_SETTINGS, sentKeys });
      for (const p of dispatch(plan, DEMO_SETTINGS)) {
        sentKeys.add(p.key);
        const x = r();
        const pending = ago === 0 && p.mode === 'manuel' && m > np.minutes - 90; // WhatsApp récents pas encore envoyés à la main
        const statut = p.mode === 'manuel' ? (pending ? 'a_envoyer' : x < 0.85 ? 'envoye' : 'lu') : x < 0.03 ? 'echec' : 'envoye';
        notifications.push({ id: `n-${notifications.length}`, ...p, statut, envoye_par: p.mode === 'manuel' && !pending ? 'dm' : null,
          erreur: statut === 'echec' ? 'Boîte e-mail pleine (réponse du serveur destinataire)' : null,
          sent_at: pending ? null : new Date(at.getTime() + (p.mode === 'manuel' ? 8 * 60000 : 0)).toISOString(), created_at: at.toISOString() });
      }
    }
  }

  // ---------------- Registres (investigations, contacts, suivi J1-J21, reports)
  const investigations = [], contacts = [], followups = [], deferrals = [];
  let ctN = 0;
  for (const z of ZS.filter((x) => x.base > 0)) {
    const abbr = z.id.slice(0, 3).toUpperCase();
    let n = 0;
    for (let ago = 24; ago >= 0; ago--) {
      const d = addDays(T, -ago);
      const rep = reports.find((x) => x.zs_id === z.id && x.date === d);
      if (!rep || !rep.alertes_validees) continue;
      const A = Math.min(rep.alertes_validees, z.base > 3 ? 3 : 2);
      for (let i = 0; i < A; i++) {
        n++;
        const code = `INV-${abbr}-${String(n).padStart(4, '0')}`;
        const id = `inv-${z.id}-${n}`;
        const realisee = !(i === A - 1 && rep.inv_realisees_jour < rep.alertes_validees);
        const inv = { id, code, date_ref: d, zs_id: z.id, aire_sante: `AS ${['Centre', 'Nord', 'Mission', 'Rive', 'Gare'][Math.floor(r() * 5)]}`,
          code_cas: r() < 0.5 ? `CAS-${abbr}-${100 + n}` : '', debut: `${d}T09:00:00+02:00`, fin: realisee ? `${d}T14:00:00+02:00` : null,
          statut: realisee ? (ago > 5 ? 'cloturee' : 'realisee') : 'reportee', date_realisation: realisee ? d : null,
          responsable_id: `r-${z.id}`, motif_report: null, motif_detail: '', nouvelle_echeance: null, nb_reports: 0,
          narratif: realisee && r() > 0.15, mapping: realisee && r() > 0.25, nb_contacts: 0, commentaire: '' };
        if (!realisee) {
          const nbr = ago > 3 ? 2 : 1;
          if (ago > 6) { inv.statut = 'realisee'; inv.date_realisation = addDays(d, 2); inv.fin = `${addDays(d, 2)}T15:00:00+02:00`; }
          for (let k = 1; k <= nbr; k++) {
            const ech = addDays(d, k + (ago > 6 ? 0 : 1));
            deferrals.push({ id: `def-${id}-${k}`, objet: 'investigation', investigation_id: id, code, zs_id: z.id, date_initiale: d, date_report: addDays(d, k - 1),
              motif: ['carburant', 'eloignement', 'insecurite'][k % 3], motif_detail: '', responsable_id: `r-${z.id}`, nouvelle_echeance: `${ech}T17:00:00+02:00`,
              numero: k, apure: ago > 6, date_apurement: ago > 6 ? addDays(d, 2) : null });
            inv.nouvelle_echeance = `${ech}T17:00:00+02:00`; inv.motif_report = ['carburant', 'eloignement', 'insecurite'][k % 3];
          }
          inv.nb_reports = nbr;
        }
        investigations.push(inv);
        if (!inv.date_realisation) continue;
        const nc = 1 + Math.floor(r() * 3);
        inv.nb_contacts = nc;
        for (let j = 0; j < nc; j++) {
          ctN++;
          const exp = addDays(inv.date_realisation, -Math.floor(r() * 3));
          const late = r() < 0.12;
          const idc = `ct-${ctN}`;
          const c = { id: idc, code: `CT-${abbr}-${String(ctN).padStart(4, '0')}`, investigation_id: id, zs_id: z.id, aire_sante: inv.aire_sante,
            menage: `M${Math.floor(r() * 400)}`, sexe: r() < 0.5 ? 'F' : 'M', tranche_age: ['<5', '5-14', '15-24', '25-44', '45-64', '65+'][Math.floor(r() * 6)],
            date_exposition: exp, date_identification: `${inv.date_realisation}T13:00:00+02:00`,
            date_listage: late ? `${addDays(inv.date_realisation, 1)}T16:00:00+02:00` : `${inv.date_realisation}T18:00:00+02:00`,
            duree: 21, agent: `RECO ${['Kabila', 'Mbuyi', 'Ngoy', 'Ilunga', 'Baraka', 'Asani'][Math.floor(r() * 6)]}`, statut: 'actif', nb_reports: 0,
            motif_report: '', zs_destination: null, commentaire: '' };
          const j21 = addDays(exp, 21);
          const perdu = r() < (z.suivi < 0.8 ? 0.12 : 0.03);
          let lastDay = 0;
          for (let jour = 1; jour <= 21; jour++) {
            const dd = addDays(exp, jour);
            if (dd > T || dd < inv.date_realisation) continue;
            if (dd === T && r() < 0.6) continue; // visites du jour pas encore saisies
            if (perdu && jour > 8) break;
            const vu = r() < z.suivi;
            followups.push({ id: `fu-${idc}-${jour}`, contact_id: idc, jour, date: dd, statut_visite: vu ? 'vu' : 'non_vu',
              heure: `${8 + Math.floor(r() * 8)}:${r() < 0.5 ? '00' : '30'}`, agent: c.agent, observation: vu ? 'RAS, température normale' : 'Absent au passage',
              action: vu ? 'poursuivre' : 'rattraper', saisi_at: `${dd}T18:00:00+02:00` });
            lastDay = jour;
          }
          if (perdu && lastDay >= 8) c.statut = 'perdu_vue';
          else if (j21 < T) c.statut = 'sorti_j21';
          else if (followups.length && followups[followups.length - 1].contact_id === idc && followups[followups.length - 1].statut_visite === 'non_vu') c.statut = 'non_vu';
          contacts.push(c);
        }
      }
    }
  }

  const nuit = new Date(ts(addDays(T, -1), hhmmToMin('23:30')));
  const derniere_sauvegarde = { at: nuit.toISOString(), statut: 'ok', duree_s: 74, fichier: `survepi-${addDays(T, -1).replace(/-/g, '')}-2330.json.gz`, dossier_url: null,
    compteurs: { daily_reports: reports.length, investigations: investigations.length, contacts: contacts.length, contact_followups: followups.length, notifications: notifications.length } };
  return { settings: { ...DEMO_SETTINGS, derniere_sauvegarde }, zs, actors, assignments, reports, notifications, investigations, contacts, followups, deferrals, audit: [], generated_for: T };
}
