import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../store.jsx';
import { parseModele, deriveFromDps, buildPlan, recordsToImport, tableFrom } from '../domain/historique.js';
import { norm } from '../domain/importComptes.js';
import { compute } from '../domain/report.js';
import { fmtDate } from '../domain/time.js';
import { Section, Table, Pill, Tabs, Band, num } from '../ui.jsx';
import { saveFile } from '../export.js';
import modeleUrl from '../assets/SurvEpi_modele_historique.xlsx?url';

const ACTION = { nouvelle: ['Nouvelle', 'good'], remplace: ['Remplace', 'accent'], ignoree: ['Gardée (saisie)', 'muted'], erreur: ['Erreur', 'bad'] };
const ORIGINE = { modele: 'Modèle', dps: 'Outils DPS', mixte: 'Modèle + DPS' };
const AFFICHES = 300;

/** Reconnaît chaque classeur : modèle historique, outil investigations DPS, outil contacts DPS. */
function lireClasseur(name, buf) {
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = (...names) => wb.SheetNames.find((n) => names.includes(norm(n)));
  const arrays = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true });
  const out = { name, types: [] };
  const h = sheet('historique');
  if (h) { out.modele = XLSX.utils.sheet_to_json(wb.Sheets[h], { defval: '', raw: true }); out.types.push('Modèle historique'); }
  const inv = sheet('investigations');
  if (inv) { const t = tableFrom(arrays(inv), 'ID investigation'); if (t.length || !h) { out.inv = t; out.types.push(`Outil investigations DPS (${t.length} lignes)`); } }
  const ct = sheet('contacts');
  if (ct) { const t = tableFrom(arrays(ct), 'ID contact'); out.contacts = t; out.types.push(`Outil suivi des contacts DPS (${t.length} contacts)`); }
  const sq = sheet('suivi quotidien');
  if (sq) { out.suivi = tableFrom(arrays(sq), 'ID contact'); out.types.push(`journal des visites (${out.suivi.length} lignes)`); }
  if (!out.types.length) throw new Error(`${name} : ni onglet « Historique » ni registre DPS reconnu`);
  return out;
}

export default function Historique() {
  const s = useStore();
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState(null);
  const [vue, setVue] = useState('problemes');
  const [busy, setBusy] = useState(null);
  const [res, setRes] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(false);
  const canDelete = ['admin', 'team_lead'].includes(s.role);
  const deja = useMemo(() => s.data.reports.filter((r) => r.source === 'historique').sort((a, b) => (a.date < b.date ? -1 : 1)), [s.data.reports]);

  const ajouter = async (list) => {
    setErr(null); setRes(null);
    const lus = [];
    for (const f of list) {
      try { lus.push(lireClasseur(f.name, await f.arrayBuffer())); } catch (e) { setErr(e.message); }
    }
    setFiles((old) => [...old.filter((o) => !lus.some((l) => l.name === o.name)), ...lus]);
  };

  const { plan, notes } = useMemo(() => {
    if (!files.length) return {};
    const modele = files.flatMap((f) => (f.modele ? parseModele(f.modele, s.data.zs).map((x) => ({ ...x, source_detail: x.source_detail || f.name })) : []));
    const dpsIn = { inv: files.flatMap((f) => f.inv || []), contacts: files.flatMap((f) => f.contacts || []), suivi: files.flatMap((f) => f.suivi || []) };
    const hasDps = dpsIn.inv.length + dpsIn.contacts.length + dpsIn.suivi.length > 0;
    const d = hasDps ? deriveFromDps(dpsIn, s.data.zs, s.np.date) : { fiches: [], notes: null };
    return { plan: buildPlan({ modele, dps: d.fiches }, { reports: s.data.reports, zsList: s.data.zs, today: s.np.date }), notes: d.notes };
  }, [files, s.data.zs, s.data.reports, s.np.date]);

  const lignes = plan ? plan.rows.filter((r) => vue === 'toutes' || r.errors.length || r.warnings.length) : [];
  const aImporter = plan ? recordsToImport(plan) : [];

  const importer = async () => {
    setBusy({ fait: 0, total: aImporter.length });
    try {
      const out = await s.actions.bulk((ad) => ad.importHistorique(aImporter, files.map((f) => f.name).join(', ').slice(0, 200), (fait) => setBusy({ fait, total: aImporter.length })), 'Historique importé');
      setRes(out); setFiles([]);
    } catch { /* message déjà affiché */ }
    setBusy(null);
  };
  const supprimer = async () => {
    setConfirmSuppr(false);
    try { const n = await s.actions.bulk((ad) => ad.supprimerHistorique(), 'Historique retiré'); setRes({ supprimees: n }); } catch { /* affiché */ }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Historique</h1>
        <p className="sub">Reprendre les données d’avant la mise en service, pour que les courbes et les comparaisons partent du début de la riposte.</p>
      </header>

      <Section title="1. Préparer les fichiers">
        <ul className="plain">
          <li><strong>Chiffres journaliers, SitRep, rapports des ZS</strong> : les recopier dans le modèle, une ligne par date et par ZS. Les reports se calculent tout seuls.</li>
          <li><strong>Outils Excel DPS remplis</strong> (investigations, suivi des contacts) : les charger tels quels. L’app en tire des totaux par jour et par ZS ; aucun nom n’est repris.</li>
          <li>Les deux peuvent être chargés ensemble : le modèle prime, les outils DPS complètent les cases vides.</li>
        </ul>
        <div className="row">
          <button className="btn ghost" onClick={async () => { try { await saveFile('SurvEpi_modele_historique.xlsx', await (await fetch(modeleUrl)).blob()); } catch (e) { s.notify(e.message, 'bad'); } }}>Télécharger le modèle historique</button>
          <label className="btn primary">Charger des fichiers<input type="file" multiple accept=".xlsx,.xls,.xlsm" hidden onChange={(e) => { ajouter([...(e.target.files || [])]); e.target.value = ''; }} /></label>
          {files.length > 0 && <button className="btn ghost" onClick={() => setFiles([])}>Tout retirer</button>}
        </div>
        {err && <p className="field-error">{err}</p>}
        {files.length > 0 && <ul className="plain small">{files.map((f) => <li key={f.name}><strong>{f.name}</strong> : {f.types.join(', ')} <button className="btn ghost small" onClick={() => setFiles(files.filter((x) => x !== f))}>Retirer</button></li>)}</ul>}
      </Section>

      {plan && (
        <Section title="2. Vérifier">
          <Band items={[
            { label: 'Fiches nouvelles', value: num(plan.resume.nouvelle), tone: 'good' },
            { label: 'Remplacent un import précédent', value: num(plan.resume.remplace) },
            { label: 'Déjà saisies dans l’app (gardées)', value: num(plan.resume.ignoree) },
            { label: 'En erreur (ignorées)', value: num(plan.resume.erreur), tone: plan.resume.erreur ? 'bad' : undefined },
          ]} />
          {notes && (
            <p className="note">
              Outils DPS : {notes.lignes.inv} investigations, {notes.lignes.contacts} contacts, {notes.lignes.suivi} visites lus.
              {notes.zsInconnues.length > 0 && <> ZS inconnues, lignes ignorées : <strong>{notes.zsInconnues.join(', ')}</strong> (les ajouter dans « ZS & acteurs » puis recharger).</>}
              {notes.sansDate > 0 && <> {notes.sansDate} ligne(s) sans date utilisable ignorée(s).</>}
              {notes.sortiesSansDate > 0 && <> {notes.sortiesSansDate} sortie(s) de suivi sans date non comptée(s).</>}
              {' '}Limites : le taux de listage sort à 100 % (le registre n’a pas la date d’identification), et les RECO actifs = agents de suivi distincts du jour.
            </p>
          )}
          <Table className="compact">
            <thead><tr><th>ZS</th><th>Du</th><th>Au</th><th className="n">Fiches à importer</th><th className="n">Erreurs</th></tr></thead>
            <tbody>{plan.parZs.map((z) => <tr key={z.zs_id}><td><strong>{z.zs_nom}</strong></td><td>{z.du ? fmtDate(z.du) : '–'}</td><td>{z.au ? fmtDate(z.au) : '–'}</td><td className="n">{z.fiches}</td><td className={`n ${z.erreurs ? 'tone-bad' : ''}`}>{z.erreurs}</td></tr>)}</tbody>
          </Table>
          <Tabs value={vue} onChange={setVue} tabs={[['problemes', `Erreurs et remarques · ${plan.rows.filter((r) => r.errors.length || r.warnings.length).length}`], ['toutes', `Toutes les lignes · ${plan.rows.length}`]]} />
          {lignes.length === 0 ? <p className="muted">Aucune remarque.</p> : (
            <Table className="compact">
              <thead><tr><th>ZS</th><th>Date</th><th>Ligne</th><th>Origine</th><th>Action</th><th className="n">Alertes</th><th className="n">Inv. jour</th><th className="n">Reports apurés</th><th className="n">Contacts listés</th><th className="n">Vus / à suivre</th><th>Remarques</th></tr></thead>
              <tbody>{lignes.slice(0, AFFICHES).map((r) => {
                const c = r.record ? compute(r.record) : null;
                return (
                  <tr key={r.key}>
                    <td>{r.zs_nom}</td><td>{r.date ? fmtDate(r.date) : '–'}</td><td className="n muted">{r.line || ''}</td><td className="small">{ORIGINE[r.origine] || '–'}</td>
                    <td><Pill tone={ACTION[r.action][1]}>{ACTION[r.action][0]}</Pill></td>
                    <td className="n">{r.record?.alertes_validees ?? '–'}</td><td className="n">{r.record?.inv_realisees_jour ?? '–'}</td><td className="n">{r.record?.inv_realisees_report ?? '–'}</td>
                    <td className="n">{r.record?.ct_listes_24h ?? '–'}</td><td className="n">{r.record ? `${r.record.ct_vus ?? '–'} / ${c.ct_a_suivre}` : '–'}</td>
                    <td className="small">{r.errors.length > 0 && <span className="field-error">{r.errors.join(' · ')}</span>}{r.warnings.length > 0 && <span className="muted">{r.warnings.join(' · ')}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </Table>
          )}
          {lignes.length > AFFICHES && <p className="muted small">{AFFICHES} premières lignes affichées sur {lignes.length}.</p>}
          <div className="actions">
            <button className="btn primary" disabled={!aImporter.length || !!busy} onClick={importer}>
              {busy ? `Import en cours… ${busy.fait} / ${busy.total}` : `3. Importer ${aImporter.length} fiche(s)`}
            </button>
          </div>
        </Section>
      )}

      {res && (
        <p className="note tone-good">
          {res.supprimees !== undefined ? `${res.supprimees} fiche(s) historique(s) retirée(s).`
            : `${res.creees} fiche(s) créée(s), ${res.remplacees} remplacée(s)${res.ignorees.length ? `, ${res.ignorees.length} ignorée(s) (${[...new Set(res.ignorees.map((i) => i.motif))].join(', ')})` : ''}. Elles apparaissent dans le tableau de bord, la grille de reporting (cases hachurées) et les exports.`}
        </p>
      )}

      <Section title="Import automatique (dossier Drive)">
        <p>Sans passer par cette page : déposer les fichiers (modèle historique, outils Excel DPS) dans le dossier Google Drive <strong>« SurvEpi - Dépôt historique »</strong> du compte de la riposte. Ils sont importés automatiquement toutes les heures, avec les mêmes contrôles qu’ici, puis rangés dans « Traités » avec un rapport ligne par ligne ; un compte rendu part par e-mail.</p>
        {(() => {
          const d = s.settings.dernier_import_depot;
          if (!d?.at) return <p className="muted small">Aucun import automatique pour l’instant.</p>;
          return <p className="small">Dernier import automatique : {new Date(d.at).toLocaleString('fr-FR', { timeZone: s.settings.fuseau, dateStyle: 'short', timeStyle: 'short' })} · {d.fichiers} fichier(s) · {d.creees} fiche(s) créée(s), {d.remplacees} remplacée(s){d.erreurs ? `, ${d.erreurs} ligne(s) en erreur` : ''}{d.rapport_url && <> · <a href={d.rapport_url} target="_blank" rel="noreferrer">rapport</a></>}</p>;
        })()}
      </Section>

      <Section title="Historique déjà importé">
        {deja.length === 0 ? <p className="muted">Aucune fiche historique pour l’instant.</p> : (
          <>
            <p>{deja.length} fiche(s), du {fmtDate(deja[0].date)} au {fmtDate(deja[deja.length - 1].date)}. Elles sont validées d’office, comptent dans la complétude et les courbes, mais pas dans la promptitude (heure d’envoi inconnue).</p>
            {canDelete && (!confirmSuppr
              ? <button className="btn ghost" onClick={() => setConfirmSuppr(true)}>Retirer tout l’historique importé</button>
              : <div className="row"><span className="field-error">Retirer les {deja.length} fiches historiques ? Les fiches saisies dans l’app ne sont pas touchées.</span>
                  <button className="btn ghost" onClick={() => setConfirmSuppr(false)}>Annuler</button><button className="btn primary" onClick={supprimer}>Oui, retirer</button></div>)}
          </>
        )}
      </Section>
    </div>
  );
}
