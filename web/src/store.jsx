import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createLocalAdapter } from './data/local.js';
import { createSupabaseAdapter } from './data/supabase.js';
import { DEMO_SETTINGS } from './data/demoSeed.js';
import { indexReports, localParts } from './domain/indicators.js';
import { planReminders, planDeferralReminders, dispatch } from './domain/reminders.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;
const adapter = URL_ && KEY_ ? createSupabaseAdapter(URL_, KEY_) : createLocalAdapter();

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export const ROLES = {
  rapporteur: 'Rapporteur ZS', epidemiologiste: 'Épidémiologiste superviseur', data_manager: 'Gestionnaire de données',
  team_lead: 'Team Lead SurvEpi', validateur: 'Validateur', dos: 'DOS', mcz: 'MCZ', coordination: 'Coordination (lecture)', admin: 'Administrateur',
};
const PROVINCE = ['team_lead', 'validateur', 'coordination', 'admin', 'data_manager'];

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [mustChange, setMustChange] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const [date, setDate] = useState(null);
  const [branding, setBranding] = useState({});

  const settings = useMemo(() => {
    const s = { ...DEMO_SETTINGS, ...(data?.settings || {}) };
    // Mise en service : réglée dans Paramètres, sinon la date de la 1re fiche saisie dans l'app
    if (!s.mise_en_service && data?.reports) {
      const saisies = data.reports.filter((r) => r.source !== 'historique').map((r) => r.date);
      if (saisies.length) s.mise_en_service = saisies.reduce((a, b) => (a < b ? a : b));
    }
    return s;
  }, [data]);
  const np = useMemo(() => localParts(new Date(tick), settings.fuseau), [tick, settings.fuseau]);

  const reload = useCallback(async () => {
    try { setData(await adapter.loadAll()); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user: u } = await adapter.init();
        adapter.branding?.().then((b) => setBranding(b || {})).catch(() => {});
        setUser(u);
        if (u) setMustChange(await adapter.mustChangePassword?.() || false);
        if (u || adapter.mode === 'demo') await reload();
      } catch (e) { setError(e.message); }
      setReady(true);
    })();
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => { if (!date) setDate(np.date); }, [np.date, date]);

  const notify = useCallback((msg, tone = 'good') => {
    setToast({ msg, tone, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id > 3500 ? null : t)), 4000);
  }, []);

  const run = useCallback(async (fn, okMsg) => {
    try { const r = await fn(); await reload(); if (okMsg) notify(okMsg); return r; }
    catch (e) { notify(e.message, 'bad'); throw e; }
  }, [reload, notify]);

  const idx = useMemo(() => indexReports(data?.reports || []), [data]);
  const role = user?.role;
  const myZs = useMemo(() => {
    if (!user || !data) return [];
    const me = data.actors.find((a) => a.id === user.id) || user;
    const s = new Set(me.zs_ids || []);
    for (const z of data.zs) if (z.rapporteur_id === user.id || z.suppleant_id === user.id) s.add(z.id);
    return [...s];
  }, [user, data]);
  const isProvince = PROVINCE.includes(role);
  const visibleZs = useMemo(() => (data?.zs || []).filter((z) => isProvince || myZs.includes(z.id)), [data, isProvince, myZs]);
  const canEditZs = useCallback((zsId) => ['team_lead', 'validateur', 'admin', 'data_manager'].includes(role)
    || (['rapporteur', 'epidemiologiste', 'dos'].includes(role) && myZs.includes(zsId)), [role, myZs]);

  const actions = useMemo(() => ({
    login: async (...a) => { const u = await adapter.signIn(...a); setUser(u ? { ...u, zs_ids: [] } : null); if (u) setMustChange(await adapter.mustChangePassword?.() || false); await reload(); return u; },
    changePassword: async (pw) => { await adapter.changePassword(pw); setMustChange(false); notify('Mot de passe enregistré'); },
    accountAction: async (action, actorId) => { const r = await adapter.accountAction(action, actorId); await reload(); return r; },
    logout: async () => { await adapter.signOut(); setUser(null); },
    resetPassword: (email) => adapter.resetPassword?.(email),
    saveReport: (row, msg) => run(() => adapter.saveReport(row), msg),
    insert: (t, row, msg) => run(() => adapter.insert(t, row), msg),
    update: (t, id, patch, msg) => run(() => adapter.update(t, id, patch), msg),
    upsertFollowup: (row) => run(() => adapter.upsertFollowup(row)),
    saveSettings: (s) => run(() => adapter.saveSettings(s), 'Paramètres enregistrés'),
    saveAssignments: (id, z) => run(() => adapter.saveAssignments(id, z), 'Affectations enregistrées'),
    /** Opérations en série (import Excel) : un seul rechargement à la fin. */
    bulk: (fn, msg) => run(() => fn(adapter), msg),
    markSent: (n, statut = 'envoye') => run(() => adapter.update('notifications', n.id, { statut, envoye_par: user?.id, sent_at: new Date().toISOString() })),
    exportAll: () => adapter.exportAll(),
    connexions: () => adapter.connexions(),
    attachmentUrl: (att, dl) => adapter.attachmentUrl(att, dl),
    uploadAttachments: async (report, fichiers, onProgress) => {
      const ok = [], erreurs = [];
      for (let i = 0; i < fichiers.length; i++) {
        try { ok.push(await adapter.uploadAttachment(report, fichiers[i].prepare, fichiers[i].description)); } catch (e) { erreurs.push(e.message); }
        onProgress?.(i + 1);
      }
      await reload();
      if (ok.length) notify(`${ok.length} pièce(s) jointe(s) ajoutée(s)`);
      if (erreurs.length) notify(erreurs.join(' · '), 'bad');
      return { ok, erreurs };
    },
    deleteAttachment: (att) => run(() => adapter.deleteAttachment(att), 'Pièce jointe supprimée'),
    logEvent: (a, d) => adapter.logEvent?.(a, d),
    resetDemo: () => run(() => adapter.reset(), 'Données de démonstration régénérées'),
    /** Démo : exécute le moteur de rappels maintenant, comme le ferait le cron serveur. */
    runReminders: () => run(async () => {
      const sentKeys = new Set(data.notifications.map((n) => n.key));
      const now = new Date();
      const plan = [...planReminders({ now, zsList: data.zs, actors: data.actors, reports: data.reports, settings, sentKeys }),
        ...planDeferralReminders({ now, deferrals: data.deferrals, actors: data.actors, zsList: data.zs, settings, sentKeys })];
      // Démo : les e-mails « partent » tout de suite, les WhatsApp restent à envoyer à la main
      const rows = dispatch(plan, settings).map((p) => (p.mode === 'auto' && p.statut === 'en_attente' ? { ...p, statut: 'envoye', sent_at: now.toISOString() } : p));
      await adapter.logNotifications(rows);
      return rows;
    }),
  }), [run, reload, data, settings, user, notify]);

  const value = { branding, mustChange, ready, adapter, mode: adapter.mode, user: user && data ? (data.actors.find((a) => a.id === user.id) || user) : user,
    role, data, settings, np, idx, date: date || np.date, setDate, toast, notify, error, actions, reload,
    myZs, visibleZs, isProvince, canEditZs, pending: adapter.pending?.() || 0 };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
