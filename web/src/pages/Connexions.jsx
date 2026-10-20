import { useEffect, useMemo, useState } from 'react';
import { useStore, ROLES } from '../store.jsx';
import { Section, Table, Tabs, Pill, Band, Empty, num } from '../ui.jsx';
import { exportXlsx } from '../export.js';

let NOMS_PAYS = null;
try { NOMS_PAYS = new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { /* navigateur ancien */ }
const nomPays = (c) => { if (!c) return ''; try { return NOMS_PAYS?.of(c) || c; } catch { return c; } };
/** « Isiro, Haut-Uélé · RD Congo » */
export const lieuTexte = (d) => (d ? [[d.ville, d.region].filter(Boolean).join(', '), nomPays(d.pays)].filter(Boolean).join(' · ') : '');

const ACTIONS = { CONNEXION: 'Connexion', OUVERTURE: 'Ouverture (session active)', DECONNEXION: 'Déconnexion' };

/** « il y a 3 h », « il y a 2 j » */
function ilya(iso, now = Date.now()) {
  if (!iso) return '';
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 48 * 60) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}

export default function Connexions() {
  const s = useStore();
  const [tab, setTab] = useState('personnes');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [qui, setQui] = useState('');
  const [jours, setJours] = useState(30);
  const [horsPays, setHorsPays] = useState(false);
  const habituels = (Array.isArray(s.settings.pays_habituels) && s.settings.pays_habituels.length ? s.settings.pays_habituels : ['CD']).map((c) => String(c).toUpperCase());
  const inhabituel = (d) => !!d?.pays && !habituels.includes(d.pays);
  const tz = s.settings.fuseau || 'Africa/Lubumbashi';
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

  const charger = () => { setErr(null); s.actions.connexions().then(setData, (e) => setErr(e.message)); };
  useEffect(charger, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nomDe = useMemo(() => {
    const m = new Map();
    for (const a of s.data.actors) { m.set(a.id, a); if (a.user_id) m.set(a.user_id, a); }
    return (e) => m.get(e.row_id) || m.get(e.user_id);
  }, [s.data.actors]);

  const statut = (r) => {
    if (!r.a_un_compte) return ['Pas de compte', 'muted'];
    if (!r.derniere_connexion && !r.derniere_activite) return ['Jamais connecté', 'bad'];
    const last = r.derniere_activite || r.derniere_connexion;
    const j = (Date.now() - new Date(last).getTime()) / 864e5;
    if (j < 1) return ['Actif aujourd’hui', 'good'];
    if (j < 3) return ['Actif récemment', 'good'];
    if (j < 7) return [`Inactif depuis ${Math.floor(j)} j`, 'warn'];
    return [`Inactif depuis ${Math.floor(j)} j`, 'bad'];
  };

  if (err) return <div className="page"><header className="page-head"><h1>Connexions</h1></header><p className="field-error">{err}</p></div>;
  if (!data) return <div className="page"><header className="page-head"><h1>Connexions</h1></header><p className="muted">Chargement…</p></div>;

  const resume = data.resume.filter((r) => r.actif !== false);
  const avecCompte = resume.filter((r) => r.a_un_compte);
  const depuis = new Date(Date.now() - jours * 864e5).toISOString();
  const events = data.events.filter((e) => e.at >= depuis && (!qui || nomDe(e)?.id === qui) && (!horsPays || inhabituel(e.new_data)));
  const horsPays30 = data.events.filter((e) => e.at >= new Date(Date.now() - 30 * 864e5).toISOString() && inhabituel(e.new_data)).length;

  const exporter = () => exportXlsx(`SurvEpi_connexions_${s.np.date}.xlsx`, [
    { name: 'Par personne', rows: resume.map((r) => ({ Nom: r.nom, Rôle: ROLES[r.role] || r.role, 'E-mail': r.email || '', Statut: statut(r)[0], 'Dernière connexion': dt(r.derniere_connexion), 'Dernière activité': dt(r.derniere_activite), 'Sessions ouvertes': r.sessions_ouvertes, 'Connexions 30 j': r.connexions_30j, 'Dernière IP': r.dernier_lieu?.ip || '', 'Dernier lieu': lieuTexte(r.dernier_lieu) })) },
    { name: 'Journal', rows: events.map((e) => ({ 'Date et heure': dt(e.at), Personne: nomDe(e)?.nom || '–', Action: ACTIONS[e.action] || e.action, Appareil: e.new_data?.appareil || '', IP: e.new_data?.ip || '', Pays: e.new_data?.pays || '', 'Lieu (approx.)': lieuTexte(e.new_data), Opérateur: e.new_data?.reseau || '', 'Pays inhabituel': inhabituel(e.new_data) ? 'oui' : '' })) },
  ]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Connexions</h1>
        <p className="sub">Qui utilise SurvEpi, quand, depuis quel appareil et d’où. Adresse IP et pays relevés par le serveur ; ville et région estimées à partir de l’IP (approximatives, parfois la ville de l’opérateur). IP et lieu effacés après 180 jours. Heures de la province ({tz}). Journal gardé 90 jours à l’écran, sans limite dans la base et les sauvegardes.</p>
      </header>
      <Band items={[
        { label: 'Comptes actifs', value: num(avecCompte.length) },
        { label: 'Connectés aujourd’hui', value: num(avecCompte.filter((r) => statut(r)[0] === 'Actif aujourd’hui').length), tone: 'good' },
        { label: 'Inactifs depuis 7 j ou plus', value: num(avecCompte.filter((r) => statut(r)[1] === 'bad' && statut(r)[0] !== 'Jamais connecté').length), tone: 'warn' },
        { label: 'Connexions hors pays habituels (30 j)', value: num(horsPays30), tone: horsPays30 ? 'bad' : undefined },
        { label: 'Jamais connectés', value: num(avecCompte.filter((r) => statut(r)[0] === 'Jamais connecté').length), tone: 'bad' },
      ]} />
      <div className="row">
        <Tabs value={tab} onChange={setTab} tabs={[['personnes', `Par personne · ${resume.length}`], ['journal', `Journal · ${events.length}`]]} />
        <button className="btn ghost small" onClick={charger}>Actualiser</button>
        <button className="btn ghost small" onClick={exporter}>Exporter (Excel)</button>
      </div>

      {tab === 'personnes' && (
        <Section>
          <Table>
            <thead><tr><th>Nom</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Dernière activité</th><th>Dernier lieu connu</th><th className="n">Sessions ouvertes</th><th className="n">Connexions 30 j</th></tr></thead>
            <tbody>{resume.map((r) => {
              const [lab, tone] = statut(r);
              return (
                <tr key={r.actor_id}>
                  <td><strong>{r.nom}</strong><small className="blk muted">{r.email || 'sans e-mail'}</small></td>
                  <td>{ROLES[r.role] || r.role}</td>
                  <td><Pill tone={tone}>{lab}</Pill></td>
                  <td className="mono">{dt(r.derniere_connexion)}<small className="blk muted">{ilya(r.derniere_connexion)}</small></td>
                  <td className="mono">{dt(r.derniere_activite)}<small className="blk muted">{ilya(r.derniere_activite)}</small></td>
                  <td>{r.dernier_lieu ? <>{lieuTexte(r.dernier_lieu) || '–'}{inhabituel(r.dernier_lieu) && <> <Pill tone="bad">Pays inhabituel</Pill></>}<small className="blk muted mono">{r.dernier_lieu.ip}</small></> : '–'}</td>
                  <td className="n">{r.sessions_ouvertes}</td>
                  <td className="n"><button className="btn ghost small" onClick={() => { setQui(r.actor_id); setTab('journal'); }}>{r.connexions_30j}</button></td>
                </tr>
              );
            })}</tbody>
          </Table>
          <p className="muted small">« Dernière activité » : dernière ouverture de l’app ou dernier renouvellement de session. « Sessions ouvertes » : navigateurs encore connectés (téléphone, ordinateur…).</p>
        </Section>
      )}

      {tab === 'journal' && (
        <Section>
          <div className="filters">
            <select id="cx-qui" value={qui} onChange={(e) => setQui(e.target.value)} aria-label="Personne"><option value="">Toutes les personnes</option>{resume.filter((r) => r.a_un_compte).map((r) => <option key={r.actor_id} value={r.actor_id}>{r.nom}</option>)}</select>
            <label className="chk"><input type="checkbox" checked={horsPays} onChange={(e) => setHorsPays(e.target.checked)} />Seulement hors pays habituels ({habituels.join(', ')})</label>
            <select id="cx-j" value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période">{[1, 7, 30, 90].map((n) => <option key={n} value={n}>{n === 1 ? 'Dernières 24 h' : `${n} derniers jours`}</option>)}</select>
          </div>
          {events.length === 0 ? <Empty>Aucune connexion sur cette période.</Empty> : (
            <Table className="compact">
              <thead><tr><th>Date et heure</th><th>Personne</th><th>Action</th><th>Appareil</th><th>Adresse IP</th><th>Lieu (approximatif)</th></tr></thead>
              <tbody>{events.slice(0, 1000).map((e) => (
                <tr key={e.id}><td className="mono">{dt(e.at)}</td><td>{nomDe(e)?.nom || '–'}</td><td>{ACTIONS[e.action] || e.action}</td><td className="small">{e.new_data?.appareil || '–'}</td>
                  <td className="mono small">{e.new_data?.ip || '–'}</td>
                  <td className="small">{lieuTexte(e.new_data) || '–'}{e.new_data?.reseau && <small className="blk muted">{e.new_data.reseau}</small>}{inhabituel(e.new_data) && <Pill tone="bad">Pays inhabituel</Pill>}</td></tr>
              ))}</tbody>
            </Table>
          )}
        </Section>
      )}
    </div>
  );
}
