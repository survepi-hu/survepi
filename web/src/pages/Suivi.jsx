import { useState } from 'react';
import { useStore } from '../store.jsx';
import { CT_ACTIFS, VISITE, jourSuivi } from '../domain/registry.js';
import { fmtDate } from '../domain/time.js';
import { Band, Section, Table, Pill, Empty, pct } from '../ui.jsx';
import { zsName } from './common.jsx';
import { ContactSheet } from './Contacts.jsx';

export default function Suivi() {
  const s = useStore();
  const d = s.date;
  const [fz, setFz] = useState('');
  const [by, setBy] = useState('zs');
  const [open, setOpen] = useState(null);
  const zsIds = s.visibleZs.map((z) => z.id);
  const due = s.data.contacts.filter((c) => zsIds.includes(c.zs_id) && (!fz || c.zs_id === fz) && CT_ACTIFS.includes(c.statut) && jourSuivi(c, d));
  const fuOf = (c) => s.data.followups.find((f) => f.contact_id === c.id && f.jour === jourSuivi(c, d));
  const seen = due.filter((c) => fuOf(c)?.statut_visite === 'vu').length;
  const notSeen = due.filter((c) => fuOf(c)?.statut_visite === 'non_vu').length;
  const todo = due.filter((c) => !fuOf(c)).length;
  const groups = {};
  for (const c of due) { const k = by === 'zs' ? zsName(s, c.zs_id) : c.agent || 'Sans agent'; (groups[k] ||= []).push(c); }
  const edit = (c) => s.canEditZs(c.zs_id) && s.role !== 'coordination' && d <= s.np.date;
  const mark = (c, statut_visite) => s.actions.upsertFollowup({ contact_id: c.id, jour: jourSuivi(c, d), date: d, statut_visite, agent: c.agent, heure: new Date().toTimeString().slice(0, 5), action: statut_visite === 'vu' ? 'poursuivre' : 'rattraper' });

  return (
    <div className="page">
      <header className="page-head">
        <h1>Suivi J1-J21 du {fmtDate(d, true)}</h1>
        <p className="sub">Contacts attendus ce jour : une visite par contact actif entre J1 et J21.</p>
      </header>
      <Band items={[
        { label: 'Visites attendues', value: due.length },
        { label: 'Vus', value: seen, sub: pct(due.length ? seen / due.length : null) },
        { label: 'Non vus', value: notSeen, tone: notSeen ? 'warn' : null },
        { label: 'Pas encore saisis', value: todo, tone: todo ? 'pending' : null },
      ]} />
      <div className="filters">
        <select id="s-fz" value={fz} onChange={(e) => setFz(e.target.value)} aria-label="ZS"><option value="">Toutes les ZS</option>{s.visibleZs.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
        <select id="s-by" value={by} onChange={(e) => setBy(e.target.value)} aria-label="Regrouper"><option value="zs">Par ZS</option><option value="agent">Par agent / RECO</option></select>
      </div>
      {due.length === 0 && <Empty>Aucun contact attendu ce jour pour ces filtres.</Empty>}
      {Object.entries(groups).sort().map(([k, list]) => (
        <Section key={k} title={k} aside={<span className="muted">{list.filter((c) => fuOf(c)?.statut_visite === 'vu').length} / {list.length} vus</span>}>
          <Table className="compact">
            <thead><tr><th>Code</th><th className="n">Jour</th><th>{by === 'zs' ? 'Agent' : 'ZS'}</th><th>Visite</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => {
                const f = fuOf(c);
                return (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td className="n">J{jourSuivi(c, d)}</td>
                    <td>{by === 'zs' ? c.agent : zsName(s, c.zs_id)}</td>
                    <td>{f ? <Pill tone={f.statut_visite === 'vu' ? 'good' : f.statut_visite === 'non_vu' ? 'bad' : 'warn'}>{VISITE[f.statut_visite]} {f.heure}</Pill> : <Pill tone="pending">À saisir</Pill>}</td>
                    <td className="row-actions">
                      {edit(c) && <><button className="btn small primary" onClick={() => mark(c, 'vu')}>Vu</button><button className="btn small ghost" onClick={() => mark(c, 'non_vu')}>Non vu</button></>}
                      <button className="btn small ghost" onClick={() => setOpen(c.id)}>Grille</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Section>
      ))}
      {open && <ContactSheet c={s.data.contacts.find((c) => c.id === open)} onClose={() => setOpen(null)} />}
    </div>
  );
}
