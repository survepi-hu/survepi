import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Section, Table, Empty } from '../ui.jsx';

const diff = (a, b) => {
  if (!a || !b) return '';
  const keys = Object.keys({ ...a, ...b }).filter((k) => !['updated_at', 'updated_by', 'version', 'started_at'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return keys.slice(0, 6).map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join(' · ') + (keys.length > 6 ? ' …' : '');
};

export default function Audit() {
  const s = useStore();
  const [t, setT] = useState('');
  const [q, setQ] = useState('');
  const tables = [...new Set(s.data.audit.map((a) => a.table_name))];
  const list = s.data.audit.filter((a) => (!t || a.table_name === t) && (!q || JSON.stringify(a).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="page">
      <header className="page-head">
        <h1>Journal d’audit</h1>
        <p className="sub">Toute création, correction, validation, réouverture, connexion et export. Non modifiable par les utilisateurs.</p>
      </header>
      <div className="filters">
        <select id="au-t" value={t} onChange={(e) => setT(e.target.value)} aria-label="Objet"><option value="">Tous les objets</option>{tables.map((x) => <option key={x}>{x}</option>)}</select>
        <input id="au-q" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Section>
        {list.length === 0 ? <Empty>{s.mode === 'demo' ? 'Le journal se remplit au fil des actions faites dans la démo (saisie, validation, export, connexion).' : 'Aucune entrée.'}</Empty> : (
          <Table>
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Objet</th><th>Action</th><th>Changements</th></tr></thead>
            <tbody>{list.slice(0, 400).map((a) => (
              <tr key={a.id}>
                <td className="mono">{new Date(a.at).toLocaleString('fr-FR')}</td>
                <td>{a.user_nom || s.data.actors.find((x) => x.user_id === a.user_id || x.id === a.user_id)?.nom || (a.user_id ? '–' : 'système')}</td>
                <td>{a.table_name}<small className="blk muted mono">{a.row_id}</small></td>
                <td>{a.action}</td>
                <td className="msg">{a.action === 'UPDATE' ? diff(a.old_data, a.new_data) : a.new_data ? JSON.stringify(a.new_data).slice(0, 140) : ''}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
