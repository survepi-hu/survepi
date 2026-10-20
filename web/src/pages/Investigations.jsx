import { useState } from 'react';
import { useStore } from '../store.jsx';
import { INV_STATUTS, deferInvestigation, needsSupervisor, realisationKind } from '../domain/registry.js';
import { MOTIFS_INVESTIGATION } from '../domain/report.js';
import { addDays, fmtDate } from '../domain/time.js';
import { Table, Section, Pill, Modal, Field, Empty, num } from '../ui.jsx';
import { actorName, zsName } from './common.jsx';

const TONE = { a_faire: 'pending', en_cours: 'info', realisee: 'good', reportee: 'warn', cloturee: 'muted' };
const MOTIF = Object.fromEntries(MOTIFS_INVESTIGATION);

export function nextCode(list, prefix, zs) {
  const abbr = zs.slice(0, 3).toUpperCase();
  const n = list.filter((x) => x.code?.startsWith(`${prefix}-${abbr}-`)).map((x) => Number(x.code.split('-').pop()) || 0);
  return `${prefix}-${abbr}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, '0')}`;
}

export default function Investigations() {
  const s = useStore();
  const T = s.np.date;
  const [fz, setFz] = useState('');
  const [fs, setFs] = useState('ouvertes');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [defer, setDefer] = useState(null);
  const zsIds = s.visibleZs.map((z) => z.id);
  const list = s.data.investigations
    .filter((i) => zsIds.includes(i.zs_id) && (!fz || i.zs_id === fz))
    .filter((i) => fs === 'toutes' || (fs === 'ouvertes' ? ['a_faire', 'en_cours', 'reportee'].includes(i.statut) : fs === 'superviseur' ? needsSupervisor(i, s.settings.seuil_escalade_reports) : i.statut === fs))
    .filter((i) => !q || `${i.code} ${i.code_cas} ${i.aire_sante}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.date_ref < b.date_ref ? 1 : -1));
  const responsables = s.data.actors.filter((a) => a.actif !== false && ['rapporteur', 'epidemiologiste', 'dos', 'data_manager'].includes(a.role));
  const canEdit = (i) => s.canEditZs(i.zs_id) && s.role !== 'coordination';

  const realise = async (i) => {
    await s.actions.update('investigations', i.id, { statut: 'realisee', fin: new Date().toISOString(), date_realisation: T, debut: i.debut || new Date().toISOString() },
      realisationKind(i, T) === 'report_apure' ? `${i.code} réalisée : comptée comme report apuré` : `${i.code} réalisée`);
    for (const d of s.data.deferrals.filter((x) => x.investigation_id === i.id && !x.apure)) await s.actions.update('deferrals', d.id, { apure: true, date_apurement: T });
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Registre des investigations</h1>
        <p className="sub">Le nombre d’alertes validées reste une simple entrée de la fiche journalière : aucune alerte n’est gérée ici.</p>
      </header>
      <div className="filters">
        <select id="f-zs" value={fz} onChange={(e) => setFz(e.target.value)} aria-label="ZS"><option value="">Toutes les ZS</option>{s.visibleZs.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
        <select id="f-st" value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Statut">
          <option value="ouvertes">Ouvertes</option><option value="superviseur">Action superviseur requise</option>
          {Object.entries(INV_STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="toutes">Toutes</option>
        </select>
        <input id="f-q" placeholder="Code, cas, aire de santé" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        {s.role !== 'coordination' && <button className="btn primary" onClick={() => setEdit({ date_ref: T, zs_id: fz || s.myZs[0] || zsIds[0], statut: 'a_faire', narratif: false, mapping: false, nb_contacts: 0, nb_reports: 0, responsable_id: '' })}>Nouvelle investigation</button>}
      </div>
      <Section>
        {list.length === 0 ? <Empty>Aucune investigation pour ces filtres.</Empty> : (
          <Table>
            <thead><tr><th>Code</th><th>Date réf.</th><th>ZS / AS</th><th>Statut</th><th>Responsable</th><th className="n">Reports</th><th>Échéance</th><th>Doc.</th><th className="n">Contacts</th><th></th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.code}{i.code_cas && <small className="blk muted">{i.code_cas}</small>}</td>
                  <td>{fmtDate(i.date_ref)}</td>
                  <td>{zsName(s, i.zs_id)}<small className="blk muted">{i.aire_sante}</small></td>
                  <td><Pill tone={TONE[i.statut]}>{INV_STATUTS[i.statut]}</Pill>
                    {i.date_realisation && realisationKind(i, i.date_realisation) === 'report_apure' && <Pill tone="info">report apuré</Pill>}
                    {needsSupervisor(i, s.settings.seuil_escalade_reports) && <Pill tone="bad">superviseur</Pill>}</td>
                  <td>{actorName(s, i.responsable_id)}</td>
                  <td className="n">{num(i.nb_reports)}</td>
                  <td>{i.statut === 'reportee' && i.nouvelle_echeance ? <>{fmtDate(i.nouvelle_echeance.slice(0, 10))}{i.nouvelle_echeance.slice(0, 10) < T && <Pill tone="bad">échue</Pill>}<small className="blk muted">{MOTIF[i.motif_report] || i.motif_report}</small></> : '–'}</td>
                  <td>{i.narratif ? 'N' : '·'} {i.mapping ? 'M' : '·'}</td>
                  <td className="n">{num(i.nb_contacts)}</td>
                  <td className="row-actions">
                    {canEdit(i) && i.statut === 'a_faire' && <button className="btn ghost small" onClick={() => s.actions.update('investigations', i.id, { statut: 'en_cours', debut: new Date().toISOString() }, 'Investigation démarrée')}>Démarrer</button>}
                    {canEdit(i) && ['a_faire', 'en_cours', 'reportee'].includes(i.statut) && <button className="btn small primary" onClick={() => realise(i)}>Réalisée</button>}
                    {canEdit(i) && ['a_faire', 'en_cours', 'reportee'].includes(i.statut) && <button className="btn ghost small" onClick={() => setDefer({ inv: i, motif: '', motif_detail: '', nouvelle_echeance: `${addDays(T, 1)}T17:00`, responsable_id: i.responsable_id || '' })}>Reporter</button>}
                    {canEdit(i) && i.statut === 'realisee' && <button className="btn ghost small" onClick={() => s.actions.update('investigations', i.id, { statut: 'cloturee' }, 'Investigation clôturée')}>Clôturer</button>}
                    {i.statut === 'cloturee' && ['epidemiologiste', 'validateur', 'team_lead', 'admin', 'data_manager'].includes(s.role) && <button className="btn ghost small" onClick={() => s.actions.update('investigations', i.id, { statut: 'en_cours' }, 'Réouverture supervisée (tracée)')}>Rouvrir</button>}
                    {canEdit(i) && i.statut !== 'cloturee' && <button className="btn ghost small" onClick={() => setEdit({ ...i })}>Modifier</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {edit && (
        <Modal title={edit.id ? `Modifier ${edit.code}` : 'Nouvelle investigation'} onClose={() => setEdit(null)}>
          <div className="form-grid">
            <Field label="Date de référence"><input id="i-date" type="date" value={edit.date_ref} max={T} onChange={(e) => setEdit({ ...edit, date_ref: e.target.value })} /></Field>
            <Field label="Zone de santé"><select id="i-zs" value={edit.zs_id} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, zs_id: e.target.value })}>{s.visibleZs.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></Field>
            <Field label="Aire de santé"><input id="i-as" value={edit.aire_sante || ''} onChange={(e) => setEdit({ ...edit, aire_sante: e.target.value })} /></Field>
            <Field label="Code du cas / investigation" hint="Si disponible"><input id="i-cas" value={edit.code_cas || ''} onChange={(e) => setEdit({ ...edit, code_cas: e.target.value })} /></Field>
            <Field label="Responsable"><select id="i-resp" value={edit.responsable_id || ''} onChange={(e) => setEdit({ ...edit, responsable_id: e.target.value })}><option value="">–</option>{responsables.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></Field>
            <Field label="Contacts identifiés"><input id="i-nbc" type="number" min="0" value={edit.nb_contacts} onChange={(e) => setEdit({ ...edit, nb_contacts: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <label className="chk"><input type="checkbox" checked={!!edit.narratif} onChange={(e) => setEdit({ ...edit, narratif: e.target.checked })} />Narratif disponible</label>
            <label className="chk"><input type="checkbox" checked={!!edit.mapping} onChange={(e) => setEdit({ ...edit, mapping: e.target.checked })} />Mapping disponible</label>
            <Field label="Commentaire" wide><textarea id="i-com" rows="2" value={edit.commentaire || ''} onChange={(e) => setEdit({ ...edit, commentaire: e.target.value })} /></Field>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={async () => {
              const row = { ...edit };
              if (row.id) await s.actions.update('investigations', row.id, row, 'Investigation mise à jour');
              else await s.actions.insert('investigations', { ...row, code: nextCode(s.data.investigations, 'INV', row.zs_id), responsable_id: row.responsable_id || null }, 'Investigation créée');
              setEdit(null);
            }}>Enregistrer</button>
          </div>
        </Modal>
      )}

      {defer && (() => {
        const res = deferInvestigation(defer.inv, { ...defer, nouvelle_echeance: defer.nouvelle_echeance ? new Date(defer.nouvelle_echeance + ':00+02:00').toISOString() : '' }, T);
        return (
          <Modal title={`Reporter ${defer.inv.code}`} onClose={() => setDefer(null)}>
            <p className="muted">Report n° {(defer.inv.nb_reports || 0) + 1}. À partir de {s.settings.seuil_escalade_reports} reports, l’investigation passe dans la file « Action superviseur requise ».</p>
            <div className="form-grid">
              <Field label="Motif"><select id="d-motif" value={defer.motif} onChange={(e) => setDefer({ ...defer, motif: e.target.value })}><option value="">–</option>{MOTIFS_INVESTIGATION.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Nouvelle échéance"><input id="d-ech" type="datetime-local" value={defer.nouvelle_echeance} onChange={(e) => setDefer({ ...defer, nouvelle_echeance: e.target.value })} /></Field>
              <Field label="Responsable"><select id="d-resp" value={defer.responsable_id} onChange={(e) => setDefer({ ...defer, responsable_id: e.target.value })}><option value="">–</option>{responsables.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></Field>
              <Field label="Précision"><input id="d-det" value={defer.motif_detail} onChange={(e) => setDefer({ ...defer, motif_detail: e.target.value })} /></Field>
            </div>
            {res.errors.length > 0 && <ul className="warns">{res.errors.map((e) => <li key={e} className="field-error">{e}</li>)}</ul>}
            <div className="actions"><button className="btn primary" disabled={res.errors.length > 0} onClick={async () => {
              await s.actions.update('investigations', defer.inv.id, res.patch, 'Investigation reportée');
              if (res.deferral) await s.actions.insert('deferrals', res.deferral);
              setDefer(null);
            }}>Reporter</button></div>
          </Modal>
        );
      })()}
    </div>
  );
}
