import { useState } from 'react';
import { useStore, ROLES } from '../store.jsx';
import { Signature, PROVINCE_ENV, EVENEMENT_ENV } from '../ui.jsx';

/** Bandeau du haut : logo et nom lus avant connexion (paramètres publics), sinon valeurs de build. */
function LoginBar({ b }) {
  return <header className="login-bar">{b.logo && <img src={b.logo} alt="" />}<span>SurvEpi {b.province_nom || PROVINCE_ENV}</span></header>;
}

const DEMO_USERS = [
  ['tl', 'Vue provinciale, validation de niveau supérieur, paramètres'],
  ['amosi', '2e validation (province) des fiches'],
  ['epi-nord', '1re validation (ZS) : Isiro, Wamba, Pawa'],
  ['dm', 'Envoie les WhatsApp préparés, exports'],
  ['r-isiro', 'Saisit la fiche d’Isiro'],
  ['r-faradje', 'ZS en préparation : rapport nul en un clic'],
  ['admin', 'Comptes, ZS, horaires de rappel, audit'],
];

export default function Login() {
  const s = useStore();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const actors = s.data?.actors || [];

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await s.actions.login(email, pw); } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <div className="login">
      <LoginBar b={s.branding || {}} />
      <div className="login-panel">
        <p className="eyebrow">Riposte {s.branding?.evenement || EVENEMENT_ENV} · Pilier Surveillance épidémiologique</p>
        <h1>SurvEpi {s.branding?.province_nom || PROVINCE_ENV}</h1>
        <p className="lede">Investigations et suivi des contacts, du rapport de chaque zone de santé au tableau de bord provincial.</p>
        {s.mode === 'demo' ? (
          <>
            <p className="note">Démonstration avec des <strong>données fictives</strong>. Choisir un profil pour voir l’application avec ses droits.</p>
            <div className="who-list">
              {DEMO_USERS.map(([id, desc]) => {
                const a = actors.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <button key={id} className="who-btn" onClick={() => s.actions.login(id)}>
                    <span className="who-name">{a.nom}</span>
                    <span className="who-r">{ROLES[a.role]}</span>
                    <span className="who-d">{desc}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="login-form">
            <label className="field"><span className="field-label">E-mail</span><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
            <label className="field"><span className="field-label">Mot de passe</span><input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
            {err && <p className="field-error">{err}</p>}
            <div className="row">
              <button className="btn primary" disabled={busy}>Se connecter</button>
              <button type="button" className="btn ghost" onClick={async () => { if (!email) return setErr('Saisir l’e-mail d’abord.'); await s.actions.resetPassword(email); setErr('Lien de réinitialisation envoyé.'); }}>Mot de passe oublié</button>
            </div>
          </form>
        )}
        <p className="login-privacy">Pour la sécurité des données, chaque connexion est enregistrée : date, heure, appareil, adresse IP et lieu approximatif.</p>
        <Signature />
      </div>
    </div>
  );
}

/** Premier accès avec un mot de passe provisoire : choix du mot de passe personnel. */
export function ChangePassword() {
  const s = useStore();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = a && a.length < 10 ? 'Au moins 10 caractères.' : a && b && a !== b ? 'Les deux saisies sont différentes.' : '';
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (a.length < 10 || a !== b) return setErr(problem || 'Saisir deux fois le même mot de passe.');
    setBusy(true);
    try { await s.actions.changePassword(a); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <div className="login">
      <LoginBar b={s.branding || {}} />
      <div className="login-panel">
        <p className="eyebrow">Premier accès</p>
        <h1>Choisir votre mot de passe</h1>
        <p className="lede">Bonjour {s.user?.nom}. Le mot de passe reçu était provisoire : choisissez le vôtre pour continuer.</p>
        <form onSubmit={submit} className="login-form">
          <label className="field"><span className="field-label">Nouveau mot de passe</span><input id="pw1" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label className="field"><span className="field-label">Confirmer</span><input id="pw2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></label>
          {(err || problem) && <p className="field-error">{err || problem}</p>}
          <div className="row"><button className="btn primary" disabled={busy}>Enregistrer et continuer</button>
            <button type="button" className="btn ghost" onClick={s.actions.logout}>Se déconnecter</button></div>
        </form>
        <Signature />
      </div>
    </div>
  );
}
