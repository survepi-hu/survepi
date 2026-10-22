import { extension, uid as nouvelId } from '../pieces.js';
import { appareil, lieuApproximatif } from '../appareil.js';
// Adaptateur production : Supabase (Postgres + Auth + RLS).
// Même interface que l'adaptateur démo. Les écritures de fiches faites hors connexion
// sont mises en file d'attente locale et rejouées au retour du réseau.
import { createClient } from '@supabase/supabase-js';
import { addDays, today } from '../domain/time.js';

const TABLE = { areas: 'health_areas', zs: 'health_zones', reports: 'daily_reports', followups: 'contact_followups', investigations: 'investigations', contacts: 'contacts', deferrals: 'deferrals', actors: 'actors', notifications: 'notifications' };
const GENERATED = { daily_reports: ['inv_non_faites', 'inv_report_sortant', 'ct_sorties', 'ct_a_suivre'], contacts: ['j1', 'j21', 'liste_24h'] };
const QUEUE = 'survepi-outbox';
const clean = (table, row) => {
  const r = { ...row };
  for (const k of GENERATED[table] || []) delete r[k];
  for (const k of Object.keys(r)) if (k.startsWith('_') || k === 'zs_ids') delete r[k];
  return r;
};
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const isNetwork = (e) => !navigator.onLine || /fetch|network|Failed to fetch/i.test(String(e?.message || e));

export function createSupabaseAdapter(url, key) {
  const sb = createClient(url, key, { auth: { persistSession: true } });
  let user = null;

  const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE)) || []; } catch { return []; } };
  const writeQueue = (q) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* ignore */ } };

  async function loadActor() {
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) return null;
    const { data } = await sb.from('actors').select('*').eq('user_id', s.session.user.id).eq('actif', true).maybeSingle();
    return data;
  }

  const api = {
    mode: 'supabase',
    sb,
    /** Nom, épidémie et logo, lisibles avant connexion. */
    async branding() { const { data, error } = await sb.rpc('public_branding'); if (error) throw error; return data || {}; },
    async init() {
      user = await loadActor();
      // Ouverture de l'app avec une session déjà active : notée au plus une fois toutes les 6 h par navigateur
      if (user) {
        const k = `survepi-ouverture-${user.id}`;
        let last = 0; try { last = Number(localStorage.getItem(k) || 0); } catch { /* ignore */ }
        if (Date.now() - last > 6 * 3600e3) {
          lieuApproximatif().then((lieu) => sb.rpc('log_connexion', { p_action: 'OUVERTURE', p_appareil: appareil(), p_lieu: lieu })).then(() => { try { localStorage.setItem(k, String(Date.now())); } catch { /* ignore */ } }, () => {});
        }
      }
      window.addEventListener('online', () => api.flush());
      return { user };
    },
    pending: () => readQueue().length,
    async flush() {
      const q = readQueue();
      const rest = [];
      for (const item of q) {
        try { await api.saveReport(item, true); } catch (e) { if (isNetwork(e)) rest.push(item); }
      }
      writeQueue(rest);
      return rest.length;
    },
    async signIn(email, password) {
      ok(await sb.auth.signInWithPassword({ email, password }));
      user = await loadActor();
      if (!user) throw new Error("Compte sans profil acteur actif. Contacter l'administrateur.");
      lieuApproximatif().then((lieu) => sb.rpc('log_connexion', { p_action: 'CONNEXION', p_appareil: appareil(), p_lieu: lieu })).then(() => { try { localStorage.setItem(`survepi-ouverture-${user.id}`, String(Date.now())); } catch { /* ignore */ } }, () => {});
      return user;
    },
    async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin })); },
    async signOut() {
      try { await sb.rpc('log_connexion', { p_action: 'DECONNEXION', p_appareil: appareil(), p_lieu: await lieuApproximatif() }); } catch { /* journal facultatif */ }
      await sb.auth.signOut(); user = null;
    },
    /** Suivi des connexions (admin, Team Lead) : synthèse par acteur + journal horodaté (90 jours). */
    async connexions() {
      const { data: resume, error } = await sb.rpc('connexions_resume');
      if (error) throw new Error(error.message);
      const events = ok(await sb.from('audit_logs').select('id,at,user_id,row_id,action,new_data').eq('table_name', 'sessions')
        .gte('at', new Date(Date.now() - 90 * 864e5).toISOString()).order('at', { ascending: false }).limit(5000));
      return { resume, events };
    },
    /** Mot de passe provisoire : changement demandé à la première connexion. */
    async mustChangePassword() {
      const { data } = await sb.auth.getUser();
      return !!data?.user?.user_metadata?.must_change_password;
    },
    async changePassword(password) {
      ok(await sb.auth.updateUser({ password, data: { must_change_password: false } }));
    },
    /** Création / réinitialisation d'un compte via la fonction serveur « comptes » (admin seulement). */
    async accountAction(action, actorId) {
      const { data, error } = await sb.functions.invoke('comptes', { body: { action, actor_id: actorId, app_url: location.origin } });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); msg = j.erreur || msg; } catch { /* réponse non JSON */ }
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.erreur || 'Échec de la création du compte');
      return data;
    },
    async loadAll() {
      // Toutes les fiches journalières, historique compris : lecture par pages de 1000 (limite du serveur)
      const allReports = async () => {
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const page = ok(await sb.from('daily_reports').select('*').order('date').order('zs_id').range(from, from + 999));
          rows.push(...page);
          if (page.length < 1000) return rows;
        }
      };
      const [settings, zs, actors, assignments, reports, investigations, contacts, deferrals, notifications] = await Promise.all([
        sb.from('settings').select('key,value').then(ok),
        sb.from('health_zones').select('*').order('nom').then(ok),
        sb.from('actors').select('*').order('nom').then(ok),
        sb.from('assignments').select('*').then(ok),
        allReports(),
        sb.from('investigations').select('*').gte('date_ref', addDays(today(), -90)).then(ok),
        sb.from('contacts').select('*').gte('date_exposition', addDays(today(), -60)).then(ok),
        sb.from('deferrals').select('*').or(`apure.eq.false,date_report.gte.${addDays(today(), -30)}`).then(ok),
        sb.from('notifications').select('*').gte('date', addDays(today(), -30)).order('created_at', { ascending: false }).limit(3000).then(ok),
      ]);
      const ids = contacts.map((c) => c.id);
      const followups = [];
      for (let i = 0; i < ids.length; i += 200) followups.push(...ok(await sb.from('contact_followups').select('*').in('contact_id', ids.slice(i, i + 200))));
      const audit = ['admin', 'team_lead'].includes(user?.role) ? ok(await sb.from('audit_logs').select('*').order('at', { ascending: false }).limit(1000)) : [];
      // Pièces jointes : liste vide si la table n'existe pas encore (base pas encore mise à jour)
      const areas = await sb.from('health_areas').select('*').order('nom').then(({ data, error }) => (error ? [] : data));
      const attachments = await sb.from('report_attachments').select('*').order('uploaded_at').limit(10000).then(({ data, error }) => (error ? [] : data));
      const versions = ok(await sb.from('report_versions').select('*').order('changed_at', { ascending: false }).limit(500));
      const validations = ok(await sb.from('validations').select('*').order('at', { ascending: false }).limit(1000)).map((v) => ({ ...v, report_id: v.report_id }));
      return {
        settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
        zs, areas, assignments, reports, investigations, contacts, deferrals, notifications, followups, audit, versions, validations, attachments,
        actors: actors.map((a) => ({ ...a, zs_ids: assignments.filter((x) => x.actor_id === a.id).map((x) => x.zs_id) })),
      };
    },
    async saveReport(row, fromQueue = false) {
      const payload = clean('daily_reports', row);
      delete payload.submitted_at; delete payload.started_at; delete payload.validated_at; delete payload.validated_by; delete payload.version;
      try {
        return ok(await sb.from('daily_reports').upsert(payload, { onConflict: 'date,zs_id' }).select().single());
      } catch (e) {
        if (!fromQueue && isNetwork(e)) {
          const q = readQueue().filter((x) => !(x.date === row.date && x.zs_id === row.zs_id));
          q.push(row); writeQueue(q);
          return { ...row, _pending: true };
        }
        throw e;
      }
    },
    async insert(table, row) { return ok(await sb.from(TABLE[table] || table).insert(clean(TABLE[table], row)).select().single()); },
    async remove(table, id) { ok(await sb.from(TABLE[table] || table).delete().eq('id', id)); },
    async update(table, id, patch) { return ok(await sb.from(TABLE[table] || table).update(clean(TABLE[table], patch)).eq('id', id).select().single()); },
    async upsertFollowup(row) { return ok(await sb.from('contact_followups').upsert(clean('contact_followups', row), { onConflict: 'contact_id,jour' }).select().single()); },
    async saveSettings(settings) {
      ok(await sb.from('settings').upsert(Object.entries(settings).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => ({ key, value }))));
      return settings;
    },
    async saveAssignments(actorId, zsIds) {
      ok(await sb.from('assignments').delete().eq('actor_id', actorId));
      if (zsIds.length) ok(await sb.from('assignments').insert(zsIds.map((zs_id) => ({ actor_id: actorId, zs_id }))));
    },
    /** Copie intégrale de toutes les tables visibles (sauvegarde Excel depuis l'application). */
    async exportAll() {
      const tables = ['settings', 'health_zones', 'health_areas', 'actors', 'assignments', 'daily_reports', 'report_attachments', 'validations', 'report_versions', 'investigations', 'contacts', 'contact_followups', 'deferrals', 'notifications', 'audit_logs'];
      const out = {};
      for (const t of tables) {
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from(t).select('*').range(from, from + 999);
          if (error) { if (t === 'audit_logs') break; throw new Error(`${t} : ${error.message}`); }
          rows.push(...data);
          if (data.length < 1000) break;
        }
        out[t] = rows;
      }
      return out;
    },
    /** Import de l'historique : par paquets de 300 fiches (chaque paquet est tout ou rien). */
    async importHistorique(rows, detail, onProgress) {
      const out = { creees: 0, remplacees: 0, ignorees: [] };
      for (let i = 0; i < rows.length; i += 300) {
        const { data, error } = await sb.rpc('import_historique', { p_rows: rows.slice(i, i + 300), p_detail: detail });
        if (error) throw new Error(`Fiches ${i + 1} à ${Math.min(i + 300, rows.length)} : ${error.message}`);
        out.creees += data.creees; out.remplacees += data.remplacees; out.ignorees.push(...data.ignorees);
        onProgress?.(Math.min(i + 300, rows.length));
      }
      return out;
    },
    /** Pièces jointes d'une fiche : fichier dans le stockage privé, puis ligne en base (le fichier est retiré si la ligne échoue). */
    async uploadAttachment(report, { blob, type, nom }, description) {
      const path = `${report.zs_id}/${report.date}/${nouvelId()}.${extension(type, nom)}`;
      const up = await sb.storage.from('pieces-jointes').upload(path, blob, { contentType: type, upsert: false });
      if (up.error) throw new Error(`${nom} : ${up.error.message}`);
      const { data, error } = await sb.from('report_attachments').insert({ report_id: report.id, zs_id: report.zs_id, date: report.date, path, nom, type, taille: blob.size, description: description || null }).select().single();
      if (error) { await sb.storage.from('pieces-jointes').remove([path]); throw new Error(`${nom} : ${error.message}`); }
      return data;
    },
    async attachmentUrl(att, telecharger = false) {
      const { data, error } = await sb.storage.from('pieces-jointes').createSignedUrl(att.path, 3600, telecharger ? { download: att.nom } : undefined);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    async deleteAttachment(att) {
      const { data, error } = await sb.from('report_attachments').delete().eq('id', att.id).select();
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Suppression refusée : fiche validée, ou pièce envoyée par une autre personne');
      await sb.storage.from('pieces-jointes').remove([att.path]);
    },
    async supprimerHistorique() { const { data, error } = await sb.rpc('supprimer_historique'); if (error) throw new Error(error.message); return data; },
    async logEvent(action, details) { await sb.rpc('log_event', { p_action: action, p_details: details }); },
    async logNotifications() { /* côté serveur : la fonction « rappels » journalise elle-même */ },
  };
  return api;
}
