import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore, ROLES } from '../store.jsx';
import { planImport, norm } from '../domain/importComptes.js';
import { waLink } from '../domain/reminders.js';
import { Modal, Table, Pill, provinceNom } from '../ui.jsx';
import { saveFile, exportXlsx } from '../export.js';
import modeleUrl from '../assets/SurvEpi_modele_comptes.xlsx?url';

const CHAMPS = { nom: 'nom', code_dhis2: 'code DHIS2', categorie_manuelle: 'catégorie', hotspot: 'hotspot', date_premier_cas: '1er cas', date_dernier_cas: 'dernier cas', as_total: 'AS total', as_affectees: 'AS affectées', mcz_nom: 'MCZ', mcz_contact: 'contact MCZ', heure_limite: 'heure limite', frequence: 'fréquence' };
const ACTION = { creer: ['Nouveau', 'good'], maj: ['Mise à jour', 'accent'], inchange: ['Inchangé', 'muted'], erreur: ['Erreur', 'bad'] };

export async function telechargerModele() {
  const blob = await (await fetch(modeleUrl)).blob();
  return saveFile('SurvEpi_modele_comptes.xlsx', blob);
}

function lireClasseur(buf) {
  const wb = XLSX.read(buf, { cellDates: true });
  const find = (...names) => wb.SheetNames.find((n) => names.includes(norm(n)));
  const rows = (name) => (name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : []);
  const acteurs = find('acteurs', 'acteur', 'comptes'), zs = find('zs', 'zones de sante');
  if (!acteurs && !zs) throw new Error('Onglets « Acteurs » et « ZS » introuvables : utiliser le modèle SurvEpi.');
  return { acteurs: rows(acteurs), zs: rows(zs) };
}

export default function ImportComptes({ onClose }) {
  const s = useStore();
  const [fichier, setFichier] = useState(null);
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(null);
  const [creerComptes, setCreerComptes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rapport, setRapport] = useState(null);

  const charger = async (f) => {
    setErr(null); setPlan(null); setFichier(f?.name || null);
    if (!f) return;
    try { setPlan(planImport(lireClasseur(await f.arrayBuffer()), { zs: s.data.zs, actors: s.data.actors })); }
    catch (e) { setErr(e.message); }
  };

  const appliquer = async () => {
    setBusy(true);
    const out = { zs: 0, acteurs: 0, comptes: [], erreurs: [] };
    try {
      await s.actions.bulk(async (ad) => {
        for (const o of plan.zsOps) {
          try {
            if (o.action === 'creer') { await ad.insert('zs', { ...o.patch, id: o.id }); out.zs++; }
            else if (o.action === 'maj') { await ad.update('zs', o.id, o.patch); out.zs++; }
          } catch (e) { out.erreurs.push(`ZS ${o.nom} (ligne ${o.line}) : ${e.message}`); }
        }
        const ids = new Map();
        for (const o of plan.actorOps) {
          if (o.action === 'erreur') continue;
          try {
            let id = o.existingId;
            if (o.action === 'creer') { id = (await ad.insert('actors', { ...o.patch, statut: 'actif', actif: true })).id; out.acteurs++; }
            else if (o.action === 'maj') { if (Object.keys(o.patch).length) await ad.update('actors', id, o.patch); out.acteurs++; }
            if (o.zs_ids.length && o.action !== 'inchange') await ad.saveAssignments(id, o.zs_ids);
            for (const z of o.titulaire) await ad.update('zs', z, { rapporteur_id: id });
            for (const z of o.suppleant) await ad.update('zs', z, { suppleant_id: id });
            ids.set(o, id);
          } catch (e) { out.erreurs.push(`${o.nom} (ligne ${o.line}) : ${e.message}`); }
        }
        if (creerComptes) {
          for (const [o, id] of ids) {
            if (!o.email || o.hasAccount) continue;
            try { const r = await ad.accountAction('creer', id); out.comptes.push({ ...o, ok: true, mot_de_passe: r.mot_de_passe, email_envoye: r.email_envoye, whatsapp: o.patch.whatsapp }); }
            catch (e) { out.comptes.push({ ...o, ok: false, erreur: e.message }); }
          }
        }
      }, 'Import terminé');
    } catch { /* message déjà affiché */ }
    s.actions.logEvent?.('IMPORT_COMPTES', { fichier, zs: out.zs, acteurs: out.acteurs, comptes: out.comptes.filter((c) => c.ok).length, erreurs: out.erreurs.length });
    setBusy(false); setRapport(out);
  };

  const texte = (c) => `SurvEpi ${provinceNom(s.settings)}\nAdresse : ${location.origin}\nIdentifiant : ${c.email}\nMot de passe provisoire : ${c.mot_de_passe}\nÀ la première connexion, choisissez votre propre mot de passe.`;
  const exporterIdentifiants = () => exportXlsx(`SurvEpi_identifiants_${s.np.date}.xlsx`, [{
    name: 'Identifiants', rows: rapport.comptes.map((c) => ({ Nom: c.nom, Rôle: ROLES[c.role], 'E-mail (identifiant)': c.email, 'Mot de passe provisoire': c.ok ? c.mot_de_passe : '', WhatsApp: c.whatsapp || '', Résultat: c.ok ? 'Compte créé' : c.erreur })),
  }]);

  if (rapport) {
    const okc = rapport.comptes.filter((c) => c.ok);
    return (
      <Modal wide title="Import terminé" onClose={onClose}>
        <p>{rapport.zs} ZS et {rapport.acteurs} acteur(s) enregistrés. {creerComptes ? `${okc.length} compte(s) créé(s).` : ''}</p>
        {rapport.erreurs.length > 0 && <div className="note tone-bad">{rapport.erreurs.map((e) => <div key={e}>{e}</div>)}</div>}
        {rapport.comptes.length > 0 && (
          <>
            <p className="note tone-warn">Les mots de passe provisoires ne s’affichent qu’ici. Transmettez-les maintenant (bouton WhatsApp) ou téléchargez la liste, puis supprimez ce fichier une fois les identifiants remis.</p>
            <Table className="compact">
              <thead><tr><th>Nom</th><th>Identifiant</th><th>Mot de passe provisoire</th><th></th></tr></thead>
              <tbody>{rapport.comptes.map((c) => (
                <tr key={c.line}><td>{c.nom}<small className="blk muted">{ROLES[c.role]}</small></td><td className="mono">{c.email}</td>
                  <td>{c.ok ? <span className="mono">{c.mot_de_passe}</span> : <span className="field-error">{c.erreur}</span>}</td>
                  <td>{c.ok && c.whatsapp && <a className="btn ghost small" href={waLink(c.whatsapp, texte(c))} target="_blank" rel="noreferrer">WhatsApp</a>}</td></tr>
              ))}</tbody>
            </Table>
          </>
        )}
        <div className="actions">
          {rapport.comptes.length > 0 && <button className="btn ghost" onClick={exporterIdentifiants}>Télécharger les identifiants (Excel)</button>}
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </Modal>
    );
  }

  const r = plan?.resume;
  const aImporter = plan ? plan.zsOps.filter((o) => ['creer', 'maj'].includes(o.action)).length + plan.actorOps.filter((o) => ['creer', 'maj'].includes(o.action)).length : 0;
  const nbComptes = plan ? plan.actorOps.filter((o) => o.action !== 'erreur' && o.email && !o.hasAccount).length : 0;
  return (
    <Modal wide title="Importer les comptes depuis Excel" onClose={onClose}>
      <p className="muted small">1. Télécharger le modèle, le faire remplir (onglets « Acteurs » et « ZS »). 2. Le charger ici : rien n’est enregistré avant d’avoir vérifié l’aperçu.</p>
      <div className="row">
        <button className="btn ghost" onClick={() => telechargerModele().catch((e) => s.notify(e.message, 'bad'))}>Télécharger le modèle Excel</button>
        <label className="btn primary">Choisir le fichier rempli<input type="file" accept=".xlsx,.xls" hidden onChange={(e) => charger(e.target.files?.[0])} /></label>
        {fichier && <span className="muted small">{fichier}</span>}
      </div>
      {err && <p className="field-error">{err}</p>}
      {plan && (
        <>
          <p>ZS : {r.zs.creer} nouvelle(s), {r.zs.maj} mise(s) à jour{r.zs.erreur ? `, ${r.zs.erreur} en erreur` : ''}. Acteurs : {r.acteurs.creer} nouveau(x), {r.acteurs.maj} mis à jour, {r.acteurs.inchange} inchangé(s){r.acteurs.erreur ? `, ${r.acteurs.erreur} en erreur` : ''}.</p>
          {(r.zs.erreur + r.acteurs.erreur) > 0 && <p className="note tone-warn">Les lignes en erreur seront ignorées. Corriger le fichier et le recharger, ou importer le reste maintenant et les ajouter plus tard.</p>}
          {plan.zsOps.length > 0 && (
            <Table className="compact">
              <thead><tr><th>Ligne</th><th>ZS</th><th>Action</th><th>Détail</th></tr></thead>
              <tbody>{plan.zsOps.map((o) => (
                <tr key={'z' + o.line}><td className="n">{o.line}</td><td>{o.nom || '–'}</td><td><Pill tone={ACTION[o.action][1]}>{ACTION[o.action][0]}</Pill></td>
                  <td className="small">{o.errors.length ? <span className="field-error">{o.errors.join(' · ')}</span> : Object.keys(o.patch).filter((k) => CHAMPS[k]).map((k) => CHAMPS[k]).join(', ') || '–'}</td></tr>
              ))}</tbody>
            </Table>
          )}
          {plan.actorOps.length > 0 && (
            <Table className="compact">
              <thead><tr><th>Ligne</th><th>Nom</th><th>Rôle</th><th>E-mail</th><th>ZS</th><th>Action</th><th>Remarques</th></tr></thead>
              <tbody>{plan.actorOps.map((o) => (
                <tr key={'a' + o.line}><td className="n">{o.line}</td><td>{o.nom || '–'}</td><td>{ROLES[o.role] || '–'}</td><td className="mono small">{o.email || '–'}</td>
                  <td className="small">{o.zs_ids.map((id) => s.data.zs.find((z) => z.id === id)?.nom || plan.zsOps.find((z) => z.id === id)?.nom || id).join(', ') || '–'}{o.titulaire.length ? ' (titulaire)' : o.suppleant.length ? ' (suppléant)' : ''}</td>
                  <td><Pill tone={ACTION[o.action][1]}>{ACTION[o.action][0]}</Pill>{o.hasAccount && <small className="blk muted">a déjà un compte</small>}</td>
                  <td className="small">{o.errors.length > 0 && <span className="field-error">{o.errors.join(' · ')}</span>}{o.warnings.length > 0 && <span className="muted">{o.warnings.join(' · ')}</span>}</td></tr>
              ))}</tbody>
            </Table>
          )}
          <label className="chk"><input type="checkbox" checked={creerComptes} onChange={(e) => setCreerComptes(e.target.checked)} />Créer aussi les comptes de connexion ({nbComptes} personne(s) avec e-mail et sans compte)</label>
          <div className="actions"><button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" disabled={busy || aImporter === 0} onClick={appliquer}>{busy ? 'Import en cours…' : `Importer ${aImporter} ligne(s)`}</button></div>
        </>
      )}
    </Modal>
  );
}
