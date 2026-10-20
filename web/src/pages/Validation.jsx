import { useState } from 'react';
import { useStore } from '../store.jsx';
import { can, canValidate, compute, completeness, validate } from '../domain/report.js';
import { addDays, fmtDate, fmtTime } from '../domain/time.js';
import { Table, Section, Pill, pct, num, Empty, Modal, Field, Tabs } from '../ui.jsx';
import { StatutPill, zsName, actorName } from './common.jsx';
import { timeliness } from '../domain/indicators.js';

export default function Validation({ go }) {
  const s = useStore();
  const [tab, setTab] = useState('attente');
  const [ret, setRet] = useState(null);
  const [msg, setMsg] = useState('');
  const zsIds = new Set(s.visibleZs.map((z) => z.id));
  const filters = {
    attente: (r) => ['soumis', 'incomplet', 'rouvert'].includes(r.statut),
    zs: (r) => r.statut === 'valide_zs',
    corriger: (r) => r.statut === 'a_corriger',
  };
  const rows = s.data.reports.filter((r) => zsIds.has(r.zs_id) && filters[tab](r)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const enrich = (r) => {
    const prev = s.idx.get(`${addDays(r.date, -1)}|${r.zs_id}`);
    const v = validate(r, { prev, seuilSuivi: s.settings.seuil_suivi });
    const z = s.data.zs.find((x) => x.id === r.zs_id);
    return { r, v, c: compute(r), comp: completeness(r, { prev }), t: timeliness(r, z, r.date, s.settings, s.np) };
  };
  const list = rows.map(enrich);
  const conformes = list.filter((x) => !x.v.errors.length && x.comp === 1);
  const okFor = (to) => conformes.filter((x) => canValidate(to === 'valide_zs' ? 'valider_zs' : 'valider_prov', s.role, x.r, s.user.id));
  const act = async (r, to, comment) => s.actions.saveReport({ ...r, statut: to, commentaire_validation: comment || null },
    to === 'a_corriger' ? 'Fiche retournée au rapporteur' : 'Fiche validée');
  const bulk = async (to) => {
    const ok = okFor(to);
    for (const x of ok) await s.actions.saveReport({ ...x.r, statut: to, commentaire_validation: 'Validation groupée (fiche conforme)' });
    s.notify(`${ok.length} fiche(s) validée(s)`);
  };
  const open = (r) => { try { sessionStorage.setItem('survepi:zs', r.zs_id); } catch { /* ignore */ } s.setDate(r.date); go('reporting'); };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Validation</h1>
        <p className="sub">Double validation : 1re validation par l’épidémiologiste superviseur de la ZS, 2e validation par la province (Team Lead ou validateur), par deux personnes différentes. Une fiche avec un contrôle bloquant ne peut pas être validée.</p>
      </header>
      <Tabs value={tab} onChange={setTab} tabs={[['attente', `1re validation (ZS) · ${s.data.reports.filter((r) => zsIds.has(r.zs_id) && filters.attente(r)).length}`],
        ['zs', `2e validation (province) · ${s.data.reports.filter((r) => zsIds.has(r.zs_id) && filters.zs(r)).length}`],
        ['corriger', `Retournées · ${s.data.reports.filter((r) => zsIds.has(r.zs_id) && filters.corriger(r)).length}`]]} />
      <Section aside={(
        <>
          {tab === 'attente' && okFor('valide_zs').length > 0 && <button className="btn primary" onClick={() => bulk('valide_zs')}>1re validation des {okFor('valide_zs').length} fiches conformes</button>}
          {tab === 'zs' && okFor('valide_prov').length > 0 && <button className="btn primary" onClick={() => bulk('valide_prov')}>2e validation des {okFor('valide_prov').length} fiches conformes</button>}
          {tab === 'zs' && conformes.length > okFor('valide_prov').length && <span className="muted small">{conformes.length - okFor('valide_prov').length} fiche(s) validée(s) en 1re par vous : 2e validation par une autre personne.</span>}
        </>
      )}>
        {list.length === 0 ? <Empty>Rien à traiter dans cette file.</Empty> : (
          <Table>
            <thead><tr><th>Date</th><th>ZS</th><th>Statut</th><th className="n">Soumise</th><th className="n">Complétude</th><th className="n">Taux inv.</th><th className="n">% vus</th><th>1re validation</th><th>Anomalies</th><th></th></tr></thead>
            <tbody>
              {list.map(({ r, v, c, comp, t }) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date, true)}</td>
                  <td><strong>{zsName(s, r.zs_id)}</strong>{r.rapport_nul && <Pill tone="muted">nul</Pill>}</td>
                  <td><StatutPill statut={r.statut} /></td>
                  <td className="n">{fmtTime(r.submitted_at)} {t === 'en_retard' && <Pill tone="warn">retard</Pill>}</td>
                  <td className="n">{pct(comp)}</td>
                  <td className="n">{pct(c.taux_inv)}</td>
                  <td className="n">{pct(c.taux_suivi)}</td>
                  <td>{r.validated_zs_by ? actorName(s, r.validated_zs_by) : '–'}</td>
                  <td className="anoms">
                    {v.errors.map((e, i) => <span key={'e' + i} className="anom bad">{e.msg}</span>)}
                    {v.warnings.map((w, i) => <span key={'w' + i} className="anom warn">{w.msg}</span>)}
                    {!v.errors.length && !v.warnings.length && <span className="muted">Aucune</span>}
                    {r.commentaire && <span className="anom note">« {r.commentaire} »</span>}
                  </td>
                  <td className="row-actions">
                    <button className="btn ghost small" onClick={() => open(r)}>Ouvrir</button>
                    {can('retourner', s.role, r.statut) && <button className="btn ghost small" onClick={() => { setRet(r); setMsg(''); }}>Retourner</button>}
                    {canValidate('valider_zs', s.role, r, s.user.id) && <button className="btn small primary" disabled={v.errors.length > 0} onClick={() => act(r, 'valide_zs')}>1re validation</button>}
                    {canValidate('valider_prov', s.role, r, s.user.id) && <button className="btn small primary" disabled={v.errors.length > 0} onClick={() => act(r, 'valide_prov')}>2e validation</button>}
                    {can('valider_prov', s.role, r.statut) && !canValidate('valider_prov', s.role, r, s.user.id) && <span className="muted small">1re validation faite par vous</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      {ret && (
        <Modal title={`Retourner ${zsName(s, ret.zs_id)} du ${fmtDate(ret.date)}`} onClose={() => setRet(null)}>
          <Field label="Ce qu’il faut corriger" hint="Envoyé au rapporteur avec la fiche.">
            <textarea id="retour-msg" rows="3" value={msg} onChange={(e) => setMsg(e.target.value)} />
          </Field>
          <div className="actions"><button className="btn primary" disabled={!msg.trim()} onClick={async () => { await act(ret, 'a_corriger', msg); setRet(null); }}>Retourner la fiche</button></div>
        </Modal>
      )}
      <p className="muted small">Statuts : brouillon → soumis → validé ZS (1/2) → validé province (2/2), donnée officielle. Une correction après validation passe par « Rouvrir » et reste tracée dans l’historique. {num(s.data.validations.length)} action(s) de validation journalisées.</p>
    </div>
  );
}
