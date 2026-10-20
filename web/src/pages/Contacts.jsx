import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { CT_STATUTS, CT_ACTIFS, VISITE, ACTIONS, contactDates, followupGrid, listedWithin24h, findDuplicates, jourSuivi, shouldExitJ21, needsSupervisor } from '../domain/registry.js';
import { MOTIFS_SUIVI } from '../domain/report.js';
import { fmtDate, addDays } from '../domain/time.js';
import { Table, Section, Pill, Modal, Field, Empty, num } from '../ui.jsx';
import { zsName } from './common.jsx';
import { nextCode } from './Investigations.jsx';

const TONE = { actif: 'good', non_vu: 'warn', transfere: 'info', perdu_vue: 'bad', sorti_j21: 'muted', devenu_symptomatique: 'bad', devenu_confirme: 'bad', decede: 'muted', autre: 'muted' };
const VTONE = { vu: 'good', non_vu: 'bad', reporte: 'warn', transfere: 'info', sorti: 'muted', na: 'na', manquant: 'bad-soft', du: 'pending', futur: 'na' };
const MOTIF = Object.fromEntries(MOTIFS_SUIVI);

export function ContactSheet({ c, onClose }) {
  const s = useStore();
  const T = s.np.date;
  const grid = followupGrid(c, s.data.followups, T);
  const [day, setDay] = useState(null);
  const [st, setSt] = useState({ statut: c.statut, zs_destination: c.zs_destination || '', motif_report: c.motif_report || '' });
  const edit = s.canEditZs(c.zs_id) && s.role !== 'coordination';
  const inv = s.data.investigations.find((i) => i.id === c.investigation_id);
  const saveDay = async (g, statut_visite, extra = {}) => {
    await s.actions.upsertFollowup({ contact_id: c.id, jour: g.jour, date: g.date, statut_visite, agent: c.agent, heure: extra.heure || new Date().toTimeString().slice(0, 5),
      observation: extra.observation || '', action: statut_visite === 'vu' ? 'poursuivre' : statut_visite === 'non_vu' ? 'rattraper' : statut_visite === 'transfere' ? 'transferer' : statut_visite === 'sorti' ? 'cloturer' : 'poursuivre' });
    if (statut_visite === 'non_vu' && c.statut === 'actif') await s.actions.update('contacts', c.id, { statut: 'non_vu' });
    if (statut_visite === 'vu' && c.statut === 'non_vu') await s.actions.update('contacts', c.id, { statut: 'actif' });
    if (statut_visite === 'reporte') {
      const n = (c.nb_reports || 0) + 1;
      await s.actions.update('contacts', c.id, { nb_reports: n, motif_report: extra.motif || 'absent' });
      await s.actions.insert('deferrals', { objet: 'contact', contact_id: c.id, code: c.code, zs_id: c.zs_id, date_initiale: g.date, date_report: T, motif: extra.motif || 'absent',
        responsable_id: s.data.zs.find((z) => z.id === c.zs_id)?.rapporteur_id, nouvelle_echeance: `${addDays(g.date, 1)}T12:00:00+02:00`, numero: n, apure: false, date_apurement: null });
    }
    if (statut_visite === 'vu') for (const d of s.data.deferrals.filter((x) => x.contact_id === c.id && !x.apure)) await s.actions.update('deferrals', d.id, { apure: true, date_apurement: T });
    setDay(null);
  };
  return (
    <Modal wide title={`Contact ${c.code}`} onClose={onClose}>
      <div className="sheet-meta">
        <span><b>ZS</b> {zsName(s, c.zs_id)} · {c.aire_sante}</span>
        <span><b>Cas source</b> {inv ? inv.code : '–'}</span>
        <span><b>Exposition</b> {fmtDate(c.date_exposition)}</span>
        <span><b>J1 → J21</b> {fmtDate(contactDates(c.date_exposition).j1)} → {fmtDate(contactDates(c.date_exposition, c.duree).j21)}</span>
        <span><b>Listé ≤ 24 h</b> {listedWithin24h(c.date_identification, c.date_listage) === null ? '–' : listedWithin24h(c.date_identification, c.date_listage) ? 'oui' : 'non'}</span>
        <span><b>Agent</b> {c.agent || '–'}</span>
        <span><b>Reports</b> {num(c.nb_reports)}{needsSupervisor(c, s.settings.seuil_escalade_reports) && <Pill tone="bad">superviseur</Pill>}</span>
      </div>
      {shouldExitJ21(c, T) && <p className="note tone-warn">J21 dépassé : clôturer le suivi (sortie J21).</p>}
      <div className="jgrid" role="grid" aria-label="Suivi J1 à J21">
        {grid.map((g) => (
          <button key={g.jour} className={`jcell tone-${VTONE[g.etat]}`} disabled={!edit || g.date > T} onClick={() => setDay(g)}
            title={`J${g.jour} · ${fmtDate(g.date, true)} : ${g.f ? VISITE[g.f.statut_visite] + (g.f.observation ? ' · ' + g.f.observation : '') : g.etat === 'manquant' ? 'visite non saisie' : g.etat === 'du' ? 'visite du jour' : 'à venir'}`}>
            <b>J{g.jour}</b><small>{fmtDate(g.date).split(' ')[0]}</small>
          </button>
        ))}
      </div>
      <p className="legend-line"><span><i className="sq tone-good" />Vu</span><span><i className="sq tone-bad" />Non vu</span><span><i className="sq tone-warn" />Reporté</span><span><i className="sq tone-bad-soft" />Non saisi</span><span><i className="sq tone-pending" />Du aujourd’hui</span></p>
      {day && (
        <div className="day-edit">
          <strong>J{day.jour} · {fmtDate(day.date, true)}</strong>
          {['vu', 'non_vu', 'reporte', 'na'].map((k) => <button key={k} className={`btn small ${k === 'vu' ? 'primary' : 'ghost'}`} onClick={() => saveDay(day, k)}>{VISITE[k]}</button>)}
          {day.f && <span className="muted">Saisi : {VISITE[day.f.statut_visite]} {day.f.heure} · {ACTIONS[day.f.action] || ''}</span>}
        </div>
      )}
      {edit && (
        <div className="form-grid">
          <Field label="Statut du contact"><select id="c-st" value={st.statut} onChange={(e) => setSt({ ...st, statut: e.target.value })}>{Object.entries(CT_STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {st.statut === 'transfere' && <Field label="ZS de destination"><select id="c-dest" value={st.zs_destination} onChange={(e) => setSt({ ...st, zs_destination: e.target.value })}><option value="">–</option>{s.data.zs.filter((z) => z.id !== c.zs_id).map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></Field>}
          <div className="actions"><button className="btn primary" disabled={st.statut === 'transfere' && !st.zs_destination} onClick={async () => { await s.actions.update('contacts', c.id, { statut: st.statut, zs_destination: st.zs_destination || null }, 'Statut du contact mis à jour'); onClose(); }}>Enregistrer le statut</button></div>
        </div>
      )}
    </Modal>
  );
}

export default function Contacts() {
  const s = useStore();
  const T = s.np.date;
  const [fz, setFz] = useState('');
  const [fs, setFs] = useState('actifs');
  const [fl, setFl] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState(null);
  const zsIds = s.visibleZs.map((z) => z.id);
  const mine = s.data.contacts.filter((c) => zsIds.includes(c.zs_id));
  const dups = useMemo(() => findDuplicates(mine), [mine]);
  const list = mine
    .filter((c) => !fz || c.zs_id === fz)
    .filter((c) => fs === 'tous' || (fs === 'actifs' ? CT_ACTIFS.includes(c.statut) : fs === 'superviseur' ? needsSupervisor(c, s.settings.seuil_escalade_reports) : c.statut === fs))
    .filter((c) => !fl || (fl === 'oui') === !!listedWithin24h(c.date_identification, c.date_listage))
    .filter((c) => !q || `${c.code} ${c.agent} ${c.aire_sante}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.code < b.code ? 1 : -1));
  const lastVisit = (c) => s.data.followups.filter((f) => f.contact_id === c.id).sort((a, b) => b.jour - a.jour)[0];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Registre des contacts</h1>
        <p className="sub">Codes uniquement : aucune donnée nominative de contact n’est enregistrée (nom, téléphone, adresse).</p>
      </header>
      <div className="filters">
        <select id="c-fz" value={fz} onChange={(e) => setFz(e.target.value)} aria-label="ZS"><option value="">Toutes les ZS</option>{s.visibleZs.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
        <select id="c-fs" value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Statut"><option value="actifs">En suivi (actifs, non vus)</option><option value="superviseur">Action superviseur requise</option>{Object.entries(CT_STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="tous">Tous</option></select>
        <select id="c-fl" value={fl} onChange={(e) => setFl(e.target.value)} aria-label="Listage"><option value="">Listage : tous</option><option value="oui">Listés ≤ 24 h</option><option value="non">Listés &gt; 24 h</option></select>
        <input id="c-q" placeholder="Code, agent, aire de santé" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        {s.role !== 'coordination' && <button className="btn primary" onClick={() => setAdd({ zs_id: fz || s.myZs[0] || zsIds[0], date_exposition: addDays(T, -1), date_identification: `${T}T10:00`, date_listage: `${T}T12:00`, sexe: 'ND', tranche_age: 'ND', agent: '', investigation_id: '', aire_sante: '', menage: '' })}>Nouveau contact</button>}
      </div>
      {dups.length > 0 && <p className="note tone-warn">{dups.length} doublon(s) possible(s) : {dups.slice(0, 4).map((d) => `${d.a.code} / ${d.b.code} (${d.rule})`).join(', ')}{dups.length > 4 ? '…' : ''}</p>}
      <Section aside={<span className="muted">{list.length} contact(s)</span>}>
        {list.length === 0 ? <Empty>Aucun contact pour ces filtres.</Empty> : (
          <Table>
            <thead><tr><th>Code</th><th>ZS / AS</th><th>Profil</th><th>Exposition</th><th className="n">Jour</th><th>Statut</th><th>Listé ≤ 24 h</th><th>Dernière visite</th><th>Agent</th><th></th></tr></thead>
            <tbody>
              {list.slice(0, 300).map((c) => {
                const lv = lastVisit(c), j = jourSuivi(c, T), l24 = listedWithin24h(c.date_identification, c.date_listage);
                return (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td>{zsName(s, c.zs_id)}<small className="blk muted">{c.aire_sante}</small></td>
                    <td>{c.sexe} · {c.tranche_age}</td>
                    <td>{fmtDate(c.date_exposition)}</td>
                    <td className="n">{j ? `J${j}` : '–'}</td>
                    <td><Pill tone={TONE[c.statut]}>{CT_STATUTS[c.statut]}</Pill>{shouldExitJ21(c, T) && <Pill tone="warn">J21 dépassé</Pill>}</td>
                    <td>{l24 === null ? '–' : l24 ? 'oui' : <Pill tone="warn">non</Pill>}</td>
                    <td>{lv ? `J${lv.jour} ${VISITE[lv.statut_visite]}` : '–'}{c.motif_report ? <small className="blk muted">{MOTIF[c.motif_report] || c.motif_report}</small> : null}</td>
                    <td>{c.agent}</td>
                    <td className="row-actions"><button className="btn ghost small" onClick={() => setOpen(c.id)}>Fiche J1-J21</button></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {list.length > 300 && <p className="muted small">300 premiers contacts affichés. Affiner les filtres.</p>}
      </Section>
      {open && <ContactSheet c={s.data.contacts.find((c) => c.id === open)} onClose={() => setOpen(null)} />}
      {add && (
        <Modal title="Nouveau contact" onClose={() => setAdd(null)}>
          <div className="form-grid">
            <Field label="Zone de santé"><select id="n-zs" value={add.zs_id} onChange={(e) => setAdd({ ...add, zs_id: e.target.value })}>{s.visibleZs.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></Field>
            <Field label="Investigation / cas source"><select id="n-inv" value={add.investigation_id} onChange={(e) => setAdd({ ...add, investigation_id: e.target.value })}><option value="">–</option>{s.data.investigations.filter((i) => i.zs_id === add.zs_id).map((i) => <option key={i.id} value={i.id}>{i.code} · {fmtDate(i.date_ref)}</option>)}</select></Field>
            <Field label="Aire de santé"><input id="n-as" value={add.aire_sante} onChange={(e) => setAdd({ ...add, aire_sante: e.target.value })} /></Field>
            <Field label="Code ménage" hint="Sert à détecter les doublons"><input id="n-men" value={add.menage} onChange={(e) => setAdd({ ...add, menage: e.target.value })} /></Field>
            <Field label="Sexe"><select id="n-sexe" value={add.sexe} onChange={(e) => setAdd({ ...add, sexe: e.target.value })}><option>M</option><option>F</option><option>ND</option></select></Field>
            <Field label="Tranche d’âge"><select id="n-age" value={add.tranche_age} onChange={(e) => setAdd({ ...add, tranche_age: e.target.value })}>{['<5', '5-14', '15-24', '25-44', '45-64', '65+', 'ND'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Dernière exposition"><input id="n-exp" type="date" max={T} value={add.date_exposition} onChange={(e) => setAdd({ ...add, date_exposition: e.target.value })} /></Field>
            <Field label="Identification"><input id="n-id" type="datetime-local" value={add.date_identification} onChange={(e) => setAdd({ ...add, date_identification: e.target.value })} /></Field>
            <Field label="Listage" error={add.date_listage && add.date_listage < add.date_identification ? 'Listage avant identification' : null}
              hint={listedWithin24h(add.date_identification, add.date_listage) === false ? 'Hors délai de 24 h' : 'J1 et J21 calculés automatiquement'}>
              <input id="n-list" type="datetime-local" value={add.date_listage} onChange={(e) => setAdd({ ...add, date_listage: e.target.value })} /></Field>
            <Field label="RECO / agent de suivi"><input id="n-agent" value={add.agent} onChange={(e) => setAdd({ ...add, agent: e.target.value })} /></Field>
          </div>
          <div className="actions"><button className="btn primary" disabled={!add.date_exposition || (add.date_listage && add.date_listage < add.date_identification)} onClick={async () => {
            const toIso = (v) => (v ? new Date(v + ':00+02:00').toISOString() : null);
            await s.actions.insert('contacts', { ...add, code: nextCode(s.data.contacts, 'CT', add.zs_id), investigation_id: add.investigation_id || null,
              date_identification: toIso(add.date_identification), date_listage: toIso(add.date_listage), duree: s.settings.duree_suivi || 21, statut: 'actif', nb_reports: 0 }, 'Contact enregistré');
            setAdd(null);
          }}>Enregistrer</button></div>
        </Modal>
      )}
    </div>
  );
}
