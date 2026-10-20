import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { rapporteurStats, cellState } from '../domain/indicators.js';
import { addDays, dateRange, fmtDate, fmtTime } from '../domain/time.js';
import { Section, Table, Pill, Modal, pct, num, toneOfRate } from '../ui.jsx';
import { CELL_TONE } from './common.jsx';

const delai = (m) => (m === null ? '–' : `${m <= 0 ? '' : '+'}${Math.round(m / 60 * 10) / 10} h`.replace('.', ','));

export default function Rapporteurs() {
  const s = useStore();
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => s.data.actors
    .filter((a) => s.visibleZs.some((z) => z.rapporteur_id === a.id || z.suppleant_id === a.id))
    .map((a) => ({ a, st: rapporteurStats(a, s.visibleZs, s.idx, s.settings, s.np, s.data.notifications) }))
    .sort((x, y) => y.st.consecutifs - x.st.consecutifs || (x.st.j7.ponctualite ?? 2) - (y.st.j7.ponctualite ?? 2)), [s]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Suivi des rapporteurs</h1>
        <p className="sub">Délai moyen : heure de soumission par rapport à l’heure limite (négatif = en avance). Relances : rappels reçus hors ouverture, 30 jours.</p>
      </header>
      <Section>
        <Table>
          <thead><tr><th>Rapporteur</th><th>ZS</th><th>Statut</th><th>Canal</th><th className="n">Jours consécutifs sans rapport</th><th className="n">Délai moyen</th><th className="n">Relances 30 j</th><th className="n">Ponctualité 7 j</th><th className="n">Ponctualité 30 j</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ a, st }) => (
              <tr key={a.id}>
                <td><strong>{a.nom}</strong><small className="blk muted">{s.visibleZs.some((z) => z.rapporteur_id === a.id) ? 'titulaire' : 'suppléant'}</small></td>
                <td>{st.zones.map((z) => z.nom).join(', ')}</td>
                <td><Pill tone={a.statut === 'actif' ? 'good' : 'warn'}>{{ actif: 'Actif', conge: 'En congé', rotation: 'En rotation' }[a.statut || 'actif']}</Pill></td>
                <td>{a.canal_prefere}</td>
                <td className="n">{st.consecutifs ? <Pill tone={st.consecutifs >= 2 ? 'bad' : 'warn'}>{st.consecutifs}</Pill> : 0}</td>
                <td className="n">{delai(st.j30.delai_moyen)}</td>
                <td className="n">{num(st.relances)}</td>
                <td className={`n tone-${toneOfRate(st.j7.ponctualite)}`}>{st.j7.attendus ? pct(st.j7.ponctualite) : '–'}</td>
                <td className={`n tone-${toneOfRate(st.j30.ponctualite)}`}>{st.j30.attendus ? pct(st.j30.ponctualite) : '–'}</td>
                <td><button className="btn ghost small" onClick={() => setOpen(a.id)}>Fiche</button></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
      {open && (() => {
        const { a, st } = rows.find((r) => r.a.id === open);
        const days = dateRange(addDays(s.np.date, -29), s.np.date);
        const notifs = s.data.notifications.filter((n) => n.destinataire_id === a.id).slice(0, 15);
        return (
          <Modal wide title={a.nom} onClose={() => setOpen(null)}>
            <div className="sheet-meta">
              <span><b>Fonction</b> {a.fonction}</span><span><b>WhatsApp</b> {a.whatsapp || '–'}</span><span><b>SMS</b> {a.sms || '–'}</span><span><b>E-mail</b> {a.email || '–'}</span>
              <span><b>Disponibilité</b> {a.dispo_debut || '07:00'} → {a.dispo_fin || '19:00'}</span>
              <span><b>Reçus / attendus 30 j</b> {st.j30.recus} / {st.j30.attendus}</span>
            </div>
            {st.zones.filter((z) => z.rapporteur_id === a.id).map((z) => (
              <div key={z.id} className="strip">
                <span className="strip-label">{z.nom}</span>
                <div className="strip-cells">
                  {days.map((d) => {
                    const r = s.idx.get(`${d}|${z.id}`);
                    const c = cellState(r, z, d, s.settings, s.np, s.idx.get(`${addDays(d, -1)}|${z.id}`));
                    return <span key={d} className={`cell tone-${CELL_TONE[c.state]}`} title={`${fmtDate(d, true)} : ${c.label}${r?.submitted_at ? ' à ' + fmtTime(r.submitted_at) : ''}`} />;
                  })}
                </div>
              </div>
            ))}
            <h4>Derniers rappels reçus</h4>
            <ul className="history">{notifs.length ? notifs.map((n) => <li key={n.id}><span>{fmtDate(n.date)} {n.prevu_a || ''}</span> {n.step} · {n.canal} · <Pill tone={n.statut === 'echec' ? 'bad' : n.statut === 'lu' ? 'good' : 'muted'}>{n.statut}</Pill></li>) : <li>Aucun rappel.</li>}</ul>
          </Modal>
        );
      })()}
    </div>
  );
}
