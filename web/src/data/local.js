import { appareil } from '../appareil.js';
// Adaptateur « démo » : données en mémoire, persistées dans le navigateur quand c'est possible.
// Reproduit les règles serveur (horodatage, verrouillage, versions, workflow, audit)
// pour que la démo se comporte comme la version Supabase.
import { buildDemo } from './demoSeed.js';

const KEY = 'survepi-demo-v5';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const TABLES = ['zs', 'actors', 'assignments', 'reports', 'notifications', 'investigations', 'contacts', 'followups', 'deferrals', 'audit', 'versions', 'validations'];
const LOCKED = ['valide_zs', 'valide_prov'];
const META = ['commentaire_validation', 'validated_zs_by', 'validated_zs_at', 'statut', 'updated_at', 'updated_by', 'validated_by', 'validated_at', 'version', 'submitted_at', 'resubmitted_at', 'started_at'];

function strip(o) { const c = { ...o }; for (const k of META) delete c[k]; return JSON.stringify(c); }

export function createLocalAdapter() {
  let db = null;
  let user = null;

  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* stockage indisponible : la démo reste en mémoire */ } };
  const audit = (table, row_id, action, old_data, new_data) => {
    db.audit.unshift({ id: uid(), at: new Date().toISOString(), user_id: user?.id || null, user_nom: user?.nom || 'système', table_name: table, row_id, action, old_data, new_data });
    if (db.audit.length > 2000) db.audit.length = 2000;
  };

  const api = {
    mode: 'demo',
    async branding() { const s = db?.settings || {}; return { province_nom: s.province_nom, dps_nom: s.dps_nom, evenement: s.evenement, logo: s.logo }; },
    async init() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const t = new Date().toISOString().slice(0, 10);
          if (parsed.generated_for && parsed.generated_for >= new Date(Date.now() - 86400000).toISOString().slice(0, 10) && parsed.generated_for <= t) db = parsed;
        }
      } catch { /* ignore */ }
      if (!db) db = buildDemo(new Date());
      for (const t of TABLES) db[t] = db[t] || [];
      try { user = JSON.parse(sessionStorage.getItem(KEY + ':user')) || null; } catch { user = null; }
      if (user) user = db.actors.find((a) => a.id === user.id) || null;
      return { user };
    },
    async reset() { db = buildDemo(new Date()); for (const t of TABLES) db[t] = db[t] || []; persist(); },
    async signIn(actorId) {
      user = db.actors.find((a) => a.id === actorId) || null;
      try { sessionStorage.setItem(KEY + ':user', JSON.stringify({ id: user?.id })); } catch { /* ignore */ }
      audit('sessions', user?.id, 'CONNEXION', null, { nom: user?.nom, role: user?.role, appareil: appareil() });
      persist();
      return user;
    },
    async mustChangePassword() { return false; },
    async changePassword() { /* démo : rien à faire */ },
    async accountAction(action, actorId) {
      const a = db.actors.find((x) => x.id === actorId);
      if (!a) throw new Error('Acteur introuvable.');
      if (!a.email) throw new Error('Ajouter d’abord une adresse e-mail à cet acteur.');
      if (action === 'creer' && a.user_id) throw new Error('Cet acteur a déjà un compte. Utiliser « Nouveau mot de passe ».');
      const al = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const r = () => Array.from({ length: 4 }, () => al[Math.floor(Math.random() * al.length)]).join('');
      if (action === 'creer') a.user_id = 'demo-' + uid();
      audit('comptes', a.id, action === 'creer' ? 'CREATION_COMPTE' : 'REINIT_MOT_DE_PASSE', null, { acteur: a.nom, email: a.email });
      persist();
      return { ok: true, email: a.email, mot_de_passe: `${r()}-${r()}-${r()}`, email_envoye: false, deja_existant: false };
    },
    async connexions() {
      const events = db.audit.filter((x) => x.table_name === 'sessions').slice().sort((a, b) => (a.at < b.at ? 1 : -1));
      const resume = db.actors.map((a) => {
        const ev = events.filter((e) => e.row_id === a.id || e.user_id === a.id);
        const cx = ev.filter((e) => e.action === 'CONNEXION');
        return { actor_id: a.id, nom: a.nom, role: a.role, email: a.email, actif: a.actif !== false, a_un_compte: true,
          derniere_connexion: cx[0]?.at || null, derniere_activite: ev[0]?.at || null, sessions_ouvertes: user?.id === a.id ? 1 : 0,
          connexions_30j: ev.filter((e) => e.action !== 'DECONNEXION' && e.at > new Date(Date.now() - 30 * 864e5).toISOString()).length, compte_cree: null };
      }).sort((a, b) => ((b.derniere_connexion || '') > (a.derniere_connexion || '') ? 1 : -1));
      return { resume, events: events.map((e) => ({ ...e, row_id: e.row_id || e.user_id })) };
    },
    async signOut() { audit('sessions', user?.id, 'DECONNEXION', null, { appareil: appareil() }); user = null; try { sessionStorage.removeItem(KEY + ':user'); } catch { /* ignore */ } persist(); },
    async loadAll() {
      const actors = db.actors.map((a) => ({ ...a, zs_ids: db.assignments.filter((x) => x.actor_id === a.id).map((x) => x.zs_id) }));
      return { ...db, attachments: (db.attachments || []).map(({ _data, ...a }) => a), actors };
    },

    /** Fiche journalière : insertion / mise à jour avec règles serveur. */
    async saveReport(row) {
      const now = new Date().toISOString();
      const i = db.reports.findIndex((r) => r.date === row.date && r.zs_id === row.zs_id);
      const old = i >= 0 ? db.reports[i] : null;
      if (!old && row.id && db.reports.some((r) => r.id === row.id)) throw new Error('Doublon Date × ZS');
      const next = { ...row, updated_at: now, updated_by: user?.id };
      if (!old) {
        Object.assign(next, { id: row.id || uid(), started_at: now, version: 1, submitted_at: ['soumis', 'incomplet'].includes(row.statut) ? now : null, validated_by: null, validated_at: null });
        db.reports.push(next);
        audit('daily_reports', next.id, 'INSERT', null, next);
      } else {
        next.id = old.id; next.started_at = old.started_at; next.submitted_at = old.submitted_at; next.resubmitted_at = old.resubmitted_at;
        if (['soumis', 'incomplet'].includes(next.statut) && ['brouillon', 'a_corriger', 'rouvert', 'incomplet'].includes(old.statut)) {
          if (!old.submitted_at) next.submitted_at = now; else next.resubmitted_at = now;
        }
        const changed = strip(next) !== strip(old);
        if (LOCKED.includes(old.statut) && changed) throw new Error('Fiche validée : réouverture supervisée nécessaire avant modification.');
        if (next.statut !== old.statut) {
          next.validated_by = old.validated_by; next.validated_at = old.validated_at; next.validated_zs_by = old.validated_zs_by; next.validated_zs_at = old.validated_zs_at;
          if (next.statut === 'valide_prov' && old.statut !== 'valide_zs') throw new Error('Double validation : la validation ZS doit précéder la validation province.');
          if (next.statut === 'valide_prov' && old.validated_zs_by === user?.id) throw new Error('Double validation : la validation province doit être faite par une autre personne.');
          if (next.statut === 'valide_zs') { next.validated_zs_at = now; next.validated_zs_by = user?.id; }
          else if (next.statut === 'valide_prov') { next.validated_at = now; next.validated_by = user?.id; }
          else if (['rouvert', 'a_corriger'].includes(next.statut)) { next.validated_zs_by = null; next.validated_zs_at = null; next.validated_by = null; next.validated_at = null; }
          db.validations.unshift({ id: uid(), report_id: old.id, from_statut: old.statut, to_statut: next.statut, commentaire: next.commentaire_validation || '', actor_id: user?.id, at: now });
        }
        next.version = (old.version || 1) + (changed ? 1 : 0);
        if (changed) db.versions.unshift({ id: uid(), report_id: old.id, version: old.version || 1, data: old, changed_by: user?.id, changed_at: now });
        db.reports[i] = next;
        audit('daily_reports', next.id, 'UPDATE', old, next);
      }
      persist();
      return next;
    },

    async insert(table, row) {
      const r = { id: row.id || uid(), created_at: new Date().toISOString(), ...row };
      (db[table] ||= []).push(r);
      audit(table, r.id, 'INSERT', null, r);
      persist();
      return r;
    },
    async remove(table, id) {
      const old = (db[table] || []).find((x) => x.id === id);
      db[table] = (db[table] || []).filter((x) => x.id !== id);
      audit(table, id, 'DELETE', old, null); persist();
    },
    async update(table, id, patch) {
      const i = db[table].findIndex((x) => x.id === id);
      if (i < 0) throw new Error('Introuvable');
      const old = db[table][i];
      if (table === 'investigations' && old.statut === 'cloturee' && patch.statut !== 'en_cours' && !['epidemiologiste', 'validateur', 'team_lead', 'admin', 'data_manager'].includes(user?.role))
        throw new Error('Investigation clôturée : réouverture supervisée.');
      const next = { ...old, ...patch, updated_at: new Date().toISOString() };
      db[table][i] = next;
      audit(table, id, 'UPDATE', old, next);
      persist();
      return next;
    },
    async upsertFollowup(row) {
      const i = db.followups.findIndex((f) => f.contact_id === row.contact_id && f.jour === row.jour);
      const next = { ...(i >= 0 ? db.followups[i] : { id: uid() }), ...row, saisi_at: new Date().toISOString(), saisi_par: user?.id };
      if (i >= 0) { audit('contact_followups', next.id, 'UPDATE', db.followups[i], next); db.followups[i] = next; }
      else { db.followups.push(next); audit('contact_followups', next.id, 'INSERT', null, next); }
      persist();
      return next;
    },
    async importHistorique(rows, detail, onProgress) {
      const out = { creees: 0, remplacees: 0, ignorees: [] };
      const today = new Date().toISOString().slice(0, 10);
      for (const row of rows) {
        if (row.date > today) { out.ignorees.push({ date: row.date, zs_id: row.zs_id, motif: 'date future' }); continue; }
        const i = db.reports.findIndex((x) => x.date === row.date && x.zs_id === row.zs_id);
        if (i >= 0 && db.reports[i].source !== 'historique') { out.ignorees.push({ date: row.date, zs_id: row.zs_id, motif: 'fiche déjà saisie dans l’app' }); continue; }
        const rec = { motifs_inv: [], motifs_suivi: [], ...row, id: i >= 0 ? db.reports[i].id : uid(), statut: 'valide_prov', source: 'historique', source_detail: row.source_detail || detail,
          submitted_at: null, validated_by: user?.id, validated_at: new Date().toISOString(), version: 1 };
        if (i >= 0) { db.reports[i] = rec; out.remplacees++; } else { db.reports.push(rec); out.creees++; }
      }
      audit('daily_reports', null, 'IMPORT_HISTORIQUE', null, { fichiers: detail, creees: out.creees, remplacees: out.remplacees, ignorees: out.ignorees.length });
      persist(); onProgress?.(rows.length);
      return out;
    },
    async uploadAttachment(report, { blob, type, nom }, description) {
      if (blob.size > 1.5 * 1024 * 1024) throw new Error(`${nom} : trop lourd pour la démo (stockage du navigateur). En production, 10 Mo maximum.`);
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      const att = { id: uid(), report_id: report.id, zs_id: report.zs_id, date: report.date, path: `${report.zs_id}/${report.date}/${uid()}`, nom, type, taille: blob.size, description: description || null, uploaded_by: user?.id, uploaded_at: new Date().toISOString(), _data: dataUrl };
      (db.attachments ||= []).push(att);
      audit('report_attachments', att.id, 'INSERT', null, { nom, taille: blob.size });
      try { persist(); } catch { db.attachments.pop(); throw new Error('Stockage de la démo plein : supprimer des pièces jointes'); }
      return att;
    },
    async attachmentUrl(att) { return (db.attachments || []).find((a) => a.id === att.id)?._data || ''; },
    async deleteAttachment(att) {
      const r = db.reports.find((x) => x.id === att.report_id);
      const chef = ['admin', 'team_lead', 'data_manager'].includes(user?.role);
      if (!chef && (att.uploaded_by !== user?.id || ['valide_zs', 'valide_prov'].includes(r?.statut))) throw new Error('Suppression refusée : fiche validée, ou pièce envoyée par une autre personne');
      db.attachments = (db.attachments || []).filter((a) => a.id !== att.id);
      audit('report_attachments', att.id, 'DELETE', { nom: att.nom }, null); persist();
    },
    async supprimerHistorique() {
      const n = db.reports.filter((x) => x.source === 'historique').length;
      db.reports = db.reports.filter((x) => x.source !== 'historique');
      audit('daily_reports', null, 'SUPPRESSION_HISTORIQUE', null, { fiches: n }); persist();
      return n;
    },
    async saveSettings(settings) {
      audit('settings', 'global', 'UPDATE', db.settings, settings);
      db.settings = { ...settings };
      persist();
      return db.settings;
    },
    async saveAssignments(actorId, zsIds) {
      db.assignments = db.assignments.filter((a) => a.actor_id !== actorId).concat(zsIds.map((zs_id) => ({ actor_id: actorId, zs_id })));
      audit('assignments', actorId, 'UPDATE', null, { zs_ids: zsIds });
      persist();
    },
    async exportAll() {
      return { settings: Object.entries(db.settings).map(([key, value]) => ({ key, value })), health_zones: db.zs, health_areas: db.areas || [], actors: db.actors, assignments: db.assignments,
        daily_reports: db.reports, validations: db.validations, report_versions: db.versions, investigations: db.investigations, contacts: db.contacts,
        contact_followups: db.followups, deferrals: db.deferrals, notifications: db.notifications, audit_logs: db.audit };
    },
    async logEvent(action, details) { audit('exports', null, action, null, details); persist(); },
    async logNotifications(list) {
      for (const n of list) if (!db.notifications.some((x) => x.key === n.key)) db.notifications.unshift({ id: uid(), created_at: new Date().toISOString(), ...n });
      persist();
    },
  };
  return api;
}
