import { useState } from 'react';
import { useStore } from '../store.jsx';
import { anciennete, bucket, needsSupervisor, INV_STATUTS, CT_STATUTS } from '../domain/registry.js';
import { MOTIFS_INVESTIGATION, MOTIFS_SUIVI, compute, isSubmitted } from '../domain/report.js';
import { addDays, fmtDate } from '../domain/time.js';
import { Band, Section, Table, Pill, Tabs, Empty, num, Spark } from '../ui.jsx';
import { actorName, zsName } from './common.jsx';

const MOTIF = Object.fromEntries([...MOTIFS_INVESTIGATION, ...MOTIFS_SUIVI]);

export default function Reports() {
  const s = useStore();
  const T = s.np.date;
  const [tab, setTab] = useState('investigation');
  const [age, setAge] = useState('');
  const zsIds = s.visibleZs.map((z) => z.id);
  const open = s.data.deferrals.filter((d) => !d.apure && zsIds.includes(d.zs_id));
  // Un objet peut avoir plusieurs événements de report : on garde le dernier pour la file.
  const latest = Object.values(open.reduce((m, d) => { const k = d.investigation_id || d.contact_id; if (!m[k] || m[k].numero < d.numero) m[k] = d; return m; }, {}));
  const queue = latest.filter((d) => d.objet === tab).filter((d) => !age || bucket(anciennete(d, T)) === age).sort((a, b) => anciennete(b, T) - anciennete(a, T));
  const objOf = (d) => (d.objet === 'investigation' ? s.data.investigations.find((i) => i.id === d.investigation_id) : s.data.contacts.find((c) => c.id === d.contact_id));
  const sup = [...s.data.investigations, ...s.data.contacts].filter((o) => zsIds.includes(o.zs_id) && needsSupervisor(o, s.settings.seuil_escalade_reports));

  // Soldes de reports agrégés (fiches journalières) : tendance 7 jours par ZS
  const days = Array.from({ length: 7 }, (_, i) => addDays(s.date, i - 6));
  const solde = s.visibleZs.map((z) => {
    const vals = days.map((d) => { const r = s.idx.get(`${d}|${z.id}`); return r && isSubmitted(r) ? compute(r).inv_report_sortant : null; });
    const last = [...vals].reverse().find((v) => v !== null);
    return { z, vals, last: last ?? null };
  }).filter((x) => x.vals.some((v) => v));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Reports & souffrances</h1>
        <p className="sub">Deux files distinctes, investigations et contacts. Au-delà de {s.settings.seuil_escalade_reports} reports, l’objet passe en « Action superviseur requise ».</p>
      </header>
      <Band items={[
        { label: 'Investigations reportées', value: latest.filter((d) => d.objet === 'investigation').length },
        { label: 'Contacts reportés', value: latest.filter((d) => d.objet === 'contact').length },
        { label: 'Échéance dépassée', value: latest.filter((d) => d.nouvelle_echeance.slice(0, 10) < T).length, tone: 'bad' },
        { label: '≥ 3 jours d’ancienneté', value: latest.filter((d) => anciennete(d, T) >= 3).length, tone: 'warn' },
        { label: 'Action superviseur requise', value: sup.length, tone: sup.length ? 'bad' : null },
      ]} />

      {sup.length > 0 && (
        <Section title="Action superviseur requise">
          <Table className="compact">
            <thead><tr><th>Objet</th><th>ZS</th><th>Statut</th><th className="n">Reports</th><th>Responsable</th></tr></thead>
            <tbody>{sup.map((o) => (
              <tr key={o.id}><td className="mono">{o.code}</td><td>{zsName(s, o.zs_id)}</td><td>{INV_STATUTS[o.statut] || CT_STATUTS[o.statut]}</td><td className="n"><Pill tone="bad">{o.nb_reports}</Pill></td><td>{actorName(s, o.responsable_id || s.data.zs.find((z) => z.id === o.zs_id)?.rapporteur_id)}</td></tr>
            ))}</tbody>
          </Table>
        </Section>
      )}

      <div className="filters">
        <Tabs value={tab} onChange={setTab} tabs={[['investigation', 'File investigations'], ['contact', 'File contacts']]} />
        <select id="r-age" value={age} onChange={(e) => setAge(e.target.value)} aria-label="Ancienneté"><option value="">Toute ancienneté</option><option>1 jour</option><option>2 jours</option><option>≥ 3 jours</option></select>
      </div>
      <Section>
        {queue.length === 0 ? <Empty>Aucun report en souffrance dans cette file.</Empty> : (
          <Table>
            <thead><tr><th>Objet</th><th>ZS</th><th>Date initiale</th><th className="n">Ancienneté</th><th className="n">N° report</th><th>Motif</th><th>Nouvelle échéance</th><th>Responsable</th><th></th></tr></thead>
            <tbody>
              {queue.map((d) => {
                const a = anciennete(d, T), o = objOf(d), late = d.nouvelle_echeance.slice(0, 10) < T;
                return (
                  <tr key={d.id}>
                    <td className="mono">{d.code}</td>
                    <td>{zsName(s, d.zs_id)}</td>
                    <td>{fmtDate(d.date_initiale)}</td>
                    <td className="n"><Pill tone={a >= 3 ? 'bad' : a === 2 ? 'warn' : 'muted'}>{a} j</Pill></td>
                    <td className="n">{d.numero}</td>
                    <td>{MOTIF[d.motif] || d.motif}</td>
                    <td>{fmtDate(d.nouvelle_echeance.slice(0, 10))} {late && <Pill tone="bad">échue</Pill>}</td>
                    <td>{actorName(s, d.responsable_id)}</td>
                    <td className="row-actions">{s.canEditZs(d.zs_id) && s.role !== 'coordination' && (
                      <button className="btn small primary" onClick={async () => {
                        for (const x of open.filter((y) => (y.investigation_id || y.contact_id) === (d.investigation_id || d.contact_id))) await s.actions.update('deferrals', x.id, { apure: true, date_apurement: T });
                        if (o && d.objet === 'investigation') await s.actions.update('investigations', o.id, { statut: 'realisee', date_realisation: T, fin: new Date().toISOString() });
                        s.notify(`${d.code} apuré`);
                      }}>Apurer</button>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Solde des reports d’investigations déclarés (fiches journalières, 7 jours)">
        {solde.length === 0 ? <Empty>Aucun report déclaré sur la période.</Empty> : (
          <Table className="compact">
            <thead><tr><th>ZS</th><th>Tendance</th><th className="n">Dernier solde</th></tr></thead>
            <tbody>{solde.map((x) => <tr key={x.z.id}><td>{x.z.nom}</td><td><Spark values={x.vals} /></td><td className="n">{num(x.last)}</td></tr>)}</tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
