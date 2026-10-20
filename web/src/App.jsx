import { useEffect, useState } from 'react';
import { useStore, ROLES } from './store.jsx';
import { Signature, provinceNom, dpsNom, BrandMark } from './ui.jsx';
import { addDays, fmtDate, minToHhmm, epiWeek } from './domain/time.js';
import Login, { ChangePassword } from './pages/Login.jsx';
import Accueil from './pages/Accueil.jsx';
import Reporting from './pages/Reporting.jsx';
import Validation from './pages/Validation.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Investigations from './pages/Investigations.jsx';
import Contacts from './pages/Contacts.jsx';
import Suivi from './pages/Suivi.jsx';
import Reports from './pages/Reports.jsx';
import Rapporteurs from './pages/Rapporteurs.jsx';
import Exports from './pages/Exports.jsx';
import Referentiel from './pages/Referentiel.jsx';
import Notifications from './pages/Notifications.jsx';
import Parametres from './pages/Parametres.jsx';
import Audit from './pages/Audit.jsx';
import Historique from './pages/Historique.jsx';

const ALL = null;
const SUP = ['epidemiologiste', 'validateur', 'team_lead', 'data_manager', 'admin'];
const PROV = ['team_lead', 'validateur', 'coordination', 'admin', 'data_manager', 'epidemiologiste'];
export const NAV = [
  { group: 'Quotidien' },
  { k: 'accueil', label: 'Accueil', C: Accueil, roles: ALL },
  { k: 'reporting', label: 'Reporting journalier', C: Reporting, roles: ALL },
  { k: 'validation', label: 'Validation', C: Validation, roles: SUP },
  { k: 'tableau', label: 'Tableau de bord', C: Dashboard, roles: ALL },
  { group: 'Registres', registres: true },
  { k: 'investigations', label: 'Investigations', C: Investigations, roles: ALL, registres: true },
  { k: 'contacts', label: 'Contacts', C: Contacts, roles: ALL, registres: true },
  { k: 'suivi', label: 'Suivi J1-J21', C: Suivi, roles: ALL, registres: true },
  { k: 'reports', label: 'Reports & souffrances', C: Reports, roles: ALL },
  { group: 'Pilotage' },
  { k: 'rapporteurs', label: 'Rapporteurs', C: Rapporteurs, roles: PROV },
  { k: 'exports', label: 'Rapports & exports', C: Exports, roles: ALL },
  { k: 'notifications', label: 'Notifications', C: Notifications, roles: ALL },
  { group: 'Administration' },
  { k: 'referentiel', label: 'ZS & acteurs', C: Referentiel, roles: ALL },
  { k: 'historique', label: 'Historique', C: Historique, roles: ['admin', 'team_lead', 'data_manager'] },
  { k: 'parametres', label: 'Paramètres', C: Parametres, roles: ['admin', 'team_lead'] },
  { k: 'audit', label: 'Journal d’audit', C: Audit, roles: ['admin', 'team_lead'] },
];

function useHash() {
  const get = () => (location.hash.replace('#', '') || 'accueil');
  const [h, setH] = useState(get);
  useEffect(() => { const f = () => setH(get()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return [h, (k) => { location.hash = k; setH(k); }];
}

export default function App() {
  const s = useStore();
  const [page, go] = useHash();
  const [menu, setMenu] = useState(false);
  const prov = provinceNom(s.settings);
  useEffect(() => { document.title = `SurvEpi ${prov}`; }, [prov]);
  if (!s.ready) return <div className="boot">Chargement de SurvEpi…</div>;
  if (!s.user) return <Login />;
  if (s.mustChange) return <ChangePassword />;
  if (!s.data) return <div className="boot">{s.error || 'Chargement des données…'}</div>;

  const allowed = NAV.filter((n) => n.k && (!n.roles || n.roles.includes(s.role)) && (!n.registres || s.settings.registres_actifs !== false));
  const cur = allowed.find((n) => n.k === page) || allowed[0];
  const Page = cur.C;
  const w = epiWeek(s.date);

  return (
    <div className={`shell ${menu ? 'menu-open' : ''}`}>
      <aside className="side">
        <div className="brand">
          <BrandMark settings={s.settings} />
          <div><strong>SurvEpi</strong><small>{dpsNom(s.settings)}</small></div>
        </div>
        <nav onClick={() => setMenu(false)}>
          {NAV.filter((n) => (n.group ? (!n.registres || s.settings.registres_actifs !== false) : allowed.includes(n))).map((n, i) => n.group
            ? <span key={'g' + i} className="nav-group">{n.group}</span>
            : <a key={n.k} href={'#' + n.k} className={cur.k === n.k ? 'on' : ''} onClick={() => go(n.k)}>{n.label}</a>)}
        </nav>
        <div className="side-foot">
          <span className="who">{s.user.nom}</span>
          <span className="who-role">{ROLES[s.role]}</span>
          <button className="btn ghost small" onClick={s.actions.logout}>Se déconnecter</button>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <button className="btn ghost menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">Menu</button>
          <div className="day-nav">
            <button className="btn ghost small" onClick={() => s.setDate(addDays(s.date, -1))} aria-label="Jour précédent">←</button>
            <input id="workdate" type="date" value={s.date} max={s.np.date} onChange={(e) => e.target.value && s.setDate(e.target.value)} aria-label="Date de travail" />
            <button className="btn ghost small" disabled={s.date >= s.np.date} onClick={() => s.setDate(addDays(s.date, 1))} aria-label="Jour suivant">→</button>
            {s.date !== s.np.date && <button className="btn ghost small" onClick={() => s.setDate(s.np.date)}>Aujourd’hui</button>}
            <span className="day-label">{fmtDate(s.date, true)} · {w.label}</span>
          </div>
          <div className="clock" title="Heure de la province (fuseau paramétré)">
            {prov} {minToHhmm(s.np.minutes)} · limite {s.settings.heure_limite}
            {s.mode === 'demo' && <span className="demo-tag" title="Données fictives générées pour la démonstration">Démo</span>}
            {s.pending > 0 && <span className="demo-tag warn">{s.pending} en attente de synchro</span>}
          </div>
        </header>
        <main className="content">
          <Page go={go} />
          <Signature />
        </main>
      </div>
      {s.toast && <div className={`toast tone-${s.toast.tone}`} role="status">{s.toast.msg}</div>}
    </div>
  );
}
