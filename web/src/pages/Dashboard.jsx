import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { dailySeries, weeklySeries, aggregate, isExpected, groupOf, zsCategory } from '../domain/indicators.js';
import { isSubmitted } from '../domain/report.js';
import { addDays, dateRange, fmtTime, fmtDate } from '../domain/time.js';
import { tauxSortieJ21, anciennete } from '../domain/registry.js';
import { Band, Bars, LineChart, Section, Table, Tabs, Pill, pct, num, toneOfRate } from '../ui.jsx';
import { useDay, CELL_TONE, CatPill } from './common.jsx';

export default function Dashboard() {
  const s = useStore();
  const [tab, setTab] = useState('province');
  const [span, setSpan] = useState(21);
  const end = s.date;
  // « Depuis le début » : à partir de la plus ancienne fiche (historique importé compris)
  const debut = useMemo(() => s.data.reports.reduce((m, r) => (r.date < m ? r.date : m), end), [s.data.reports, end]);
  const toutJours = Math.max(1, Math.round((new Date(end) - new Date(debut)) / 864e5) + 1);
  const from = addDays(end, -((span === 0 ? toutJours : span) - 1));
  const day = useDay(end);
  const series = useMemo(() => dailySeries(s.visibleZs, from, end, s.idx, s.settings, s.np), [s.visibleZs, from, end, s.idx, s.settings, s.np]);
  const weeks = useMemo(() => weeklySeries(dailySeries(s.visibleZs, from < addDays(end, -55) ? from : addDays(end, -55), end, s.idx, s.settings, s.np)), [s.visibleZs, from, end, s.idx, s.settings, s.np]);
  const seuil = s.settings.seuil_suivi;
  const perZs = useMemo(() => s.visibleZs.map((z) => {
    const reps = dateRange(from, end).map((d) => s.idx.get(`${d}|${z.id}`)).filter((r) => r && isSubmitted(r));
    return { z, cat: zsCategory(z, end, s.settings), t: aggregate(reps), last: reps[reps.length - 1] || null };
  }), [s.visibleZs, from, end, s.idx, s.settings]);
  const ser = (k) => series.map((d) => ({ x: d.date, y: d[k] }));
  const g = day.groups;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Tableau de bord</h1>
        <div className="row">
          <Tabs value={tab} onChange={setTab} tabs={[['province', 'Provincial'], ['inv', 'Investigations'], ['ct', 'Contacts'], ['groupes', 'Touchées / préparation'], ['se', 'Semaines épi']]} />
          <label className="inline">Période
            <select id="span" value={span} onChange={(e) => setSpan(Number(e.target.value))}>
              {[7, 14, 21, 30, 42, 90, 180].map((n) => <option key={n} value={n}>{n} jours</option>)}
              <option value={0}>Depuis le début ({toutJours} j)</option>
            </select>
          </label>
        </div>
      </header>

      {tab === 'province' && (
        <>
          <Band items={[
            { label: 'ZS attendues', value: num(g.all.attendues) },
            { label: 'Rapports reçus', value: `${g.all.recues} / ${g.all.attendues}` },
            { label: 'Complétude', value: pct(g.all.completude), tone: toneOfRate(g.all.completude) },
            { label: 'Promptitude', value: pct(g.all.promptitude), tone: toneOfRate(g.all.promptitude) },
            { label: 'Alertes validées', value: num(day.totals.alertes_validees) },
            { label: 'Inv. réalisées du jour', value: num(day.totals.inv_realisees_jour), sub: `+ ${num(day.totals.inv_realisees_report)} reports apurés` },
            { label: 'Inv. non faites', value: num(day.totals.inv_non_faites) },
            { label: 'Reports inv. en souffrance', value: num(day.totals.inv_report_sortant), tone: day.totals.inv_report_sortant ? 'warn' : null },
          ]} />
          <Band items={[
            { label: 'Contacts identifiés', value: num(day.totals.ct_identifies) },
            { label: 'Listés ≤ 24 h', value: `${num(day.totals.ct_listes_24h)}`, sub: pct(day.totals.taux_listage, 1) },
            { label: 'Attendus au suivi', value: num(day.totals.ct_a_suivre) },
            { label: 'Contacts vus', value: num(day.totals.ct_vus), sub: pct(day.totals.taux_suivi, 1), tone: toneOfRate(day.totals.taux_suivi, seuil) },
            { label: 'Contacts non vus', value: num(day.totals.ct_non_vus), tone: day.totals.ct_non_vus ? 'warn' : null },
            { label: 'Reports contacts en souffrance', value: num(s.data.deferrals.filter((d) => d.objet === 'contact' && !d.apure).length) },
          ]} />
          <Section title="Tableau comparatif par ZS">
            <Table>
              <thead><tr><th>ZS</th><th>Statut</th><th>Rapport</th><th className="n">Heure</th><th className="n">Complétude</th><th className="n">Alertes val.</th><th className="n">Inv. réal.</th><th className="n">Inv. non faites</th><th className="n">Reports inv.</th><th className="n">Contacts suivis</th><th className="n">% vus</th><th className="n">Listés ≤ 24 h</th></tr></thead>
              <tbody>
                {day.rows.map((r) => (
                  <tr key={r.zs.id}>
                    <td><strong>{r.zs.nom}</strong></td>
                    <td><CatPill cat={r.cat} hotspot={r.zs.hotspot} /></td>
                    <td><Pill tone={CELL_TONE[r.cell.state]}>{r.cell.label}</Pill></td>
                    <td className="n">{r.report?.submitted_at ? fmtTime(r.report.submitted_at) : '–'}</td>
                    <td className="n">{r.report ? pct(r.completeness) : '0 %'}</td>
                    <td className="n">{r.c ? num(r.report.alertes_validees) : '–'}</td>
                    <td className="n">{r.c ? num(r.report.inv_realisees_jour) : '–'}</td>
                    <td className="n">{r.c ? num(r.c.inv_non_faites) : '–'}</td>
                    <td className="n">{r.c ? num(r.c.inv_report_sortant) : '–'}</td>
                    <td className="n">{r.c ? num(r.report.ct_vus) : '–'}</td>
                    <td className={`n tone-${r.c ? toneOfRate(r.c.taux_suivi, seuil) : 'na'}`}>{r.c ? pct(r.c.taux_suivi) : '–'}</td>
                    <td className="n">{r.c ? pct(r.c.taux_listage) : '–'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan="5">Province</th><td className="n">{num(day.totals.alertes_validees)}</td><td className="n">{num(day.totals.inv_realisees_jour)}</td><td className="n">{num(day.totals.inv_non_faites)}</td><td className="n">{num(day.totals.inv_report_sortant)}</td><td className="n">{num(day.totals.ct_vus)}</td><td className="n">{pct(day.totals.taux_suivi)}</td><td className="n">{pct(day.totals.taux_listage)}</td></tr></tfoot>
            </Table>
          </Section>
          <Section title={`Complétude et promptitude, ${span === 0 ? `depuis le ${fmtDate(debut)}` : `${span} derniers jours`}`}>
            <LineChart yMax={1} yFormat={(v) => pct(v)} series={[{ name: 'Complétude', values: ser('completude') }, { name: 'Promptitude', values: ser('promptitude') }]} />
          </Section>
        </>
      )}

      {tab === 'inv' && (
        <>
          <div className="split">
            <Section title="Taux d’investigation par ZS (période)">
              <Bars rows={perZs.filter((x) => x.t.alertes_validees > 0 || x.cat !== 'preparation').map((x) => ({ label: x.z.nom, value: x.t.taux_inv, tone: toneOfRate(x.t.taux_inv), detail: `${x.t.inv_realisees_jour}/${x.t.alertes_validees}` }))} />
            </Section>
            <Section title="Documentation des investigations (période)">
              <Bars threshold={null} rows={perZs.filter((x) => x.t.narratifs_attendus > 0).flatMap((x) => [
                { label: `${x.z.nom} · narratifs`, value: x.t.taux_narratifs, tone: toneOfRate(x.t.taux_narratifs) },
                { label: `${x.z.nom} · mappings`, value: x.t.taux_mappings, tone: toneOfRate(x.t.taux_mappings) },
              ])} />
            </Section>
          </div>
          <Section title="Évolution quotidienne : taux d’investigation">
            <LineChart yMax={1} yFormat={(v) => pct(v)} series={[{ name: 'Taux d’investigation', values: ser('taux_inv') }]} />
          </Section>
          <Section title="Reports d’investigations en souffrance (fin de journée)">
            <LineChart series={[{ name: 'Report sortant', values: ser('inv_report_sortant') }, { name: 'Alertes validées', values: ser('alertes_validees') }]} />
          </Section>
          <Section title="Ancienneté des reports du registre">
            <Bars threshold={null} format={num} max={Math.max(1, s.data.deferrals.filter((d) => !d.apure).length)} rows={['1 jour', '2 jours', '≥ 3 jours'].map((b) => {
              const n = s.data.deferrals.filter((d) => !d.apure && d.objet === 'investigation' && (b === '1 jour' ? anciennete(d, s.np.date) <= 1 : b === '2 jours' ? anciennete(d, s.np.date) === 2 : anciennete(d, s.np.date) >= 3)).length;
              return { label: b, value: n, tone: b === '≥ 3 jours' ? 'bad' : 'warn' };
            })} />
          </Section>
        </>
      )}

      {tab === 'ct' && (
        <>
          <Band items={[
            { label: 'Contacts actifs (fin de journée)', value: num(day.totals.ct_a_suivre) },
            { label: `Taux de suivi moyen ${span || toutJours} j`, value: pct(aggregate(perZs.map((x) => x.t)).taux_suivi) },
            { label: 'Taux de sortie J21 (registre)', value: pct(tauxSortieJ21(s.data.contacts.filter((c) => s.visibleZs.some((z) => z.id === c.zs_id)), s.np.date)) },
            { label: `Sorties J21 sur ${span || toutJours} j`, value: num(series.reduce((a, d) => a + d.ct_sortie_21j, 0)) },
            { label: `Perdus de vue sur ${span || toutJours} j`, value: num(series.reduce((a, d) => a + d.ct_sortie_perdus, 0)), tone: 'warn' },
          ]} />
          <Section title="Taux de suivi quotidien">
            <LineChart yMax={1} threshold={seuil} yFormat={(v) => pct(v)} series={[{ name: 'Taux de suivi', values: ser('taux_suivi') }, { name: 'Listés ≤ 24 h', values: ser('taux_listage') }]} />
          </Section>
          <div className="split">
            <Section title="Taux de suivi par ZS (période)">
              <Bars threshold={seuil} rows={perZs.filter((x) => x.t.ct_a_suivre > 0).map((x) => ({ label: x.z.nom, value: x.t.taux_suivi, tone: toneOfRate(x.t.taux_suivi, seuil), detail: `${num(x.last?.ct_vus)} vus hier` }))} />
            </Section>
            <Section title="Contacts actifs et non vus">
              <LineChart series={[{ name: 'À suivre', values: ser('ct_a_suivre') }, { name: 'Non vus', values: ser('ct_non_vus') }]} />
            </Section>
          </div>
        </>
      )}

      {tab === 'groupes' && (
        <div className="split">
          {['touchee', 'preparation'].map((grp) => {
            const G = g[grp];
            const rows = day.rows.filter((r) => groupOf(r.cat) === grp);
            const t = aggregate(rows.filter((r) => r.submitted).map((r) => r.report));
            return (
              <Section key={grp} title={grp === 'touchee' ? 'ZS touchées (y compris post-flambée)' : 'ZS en préparation'}>
                <Table className="compact">
                  <tbody>
                    <tr><th>ZS attendues</th><td className="n">{G.attendues}</td></tr>
                    <tr><th>Rapports reçus</th><td className="n">{G.recues}</td></tr>
                    <tr><th>Complétude (complets à temps)</th><td className="n">{pct(G.completude)}</td></tr>
                    <tr><th>Promptitude</th><td className="n">{pct(G.promptitude)}</td></tr>
                    <tr><th>Rapports nuls</th><td className="n">{rows.filter((r) => r.report?.rapport_nul).length}</td></tr>
                    <tr><th>Taux d’investigation</th><td className="n">{pct(t.taux_inv)}</td></tr>
                    <tr><th>Taux de suivi</th><td className="n">{pct(t.taux_suivi)}</td></tr>
                  </tbody>
                </Table>
                <LineChart height={150} yMax={1} yFormat={(v) => pct(v)} series={[{ name: 'Complétude', values: ser(grp === 'touchee' ? 'completude_touchees' : 'completude_prep') }]} />
                <p className="muted small">{rows.map((r) => r.zs.nom).join(', ') || 'Aucune ZS'}{grp === 'preparation' ? ` · ${s.data.zs.filter((z) => isExpected(z, end, s.settings) && zsCategory(z, end, s.settings) === 'preparation').length} sur 6 attendues au cahier des charges` : ''}</p>
              </Section>
            );
          })}
        </div>
      )}

      {tab === 'se' && (
        <Section title="Synthèse par semaine épidémiologique">
          <Table>
            <thead><tr><th>Semaine</th><th className="n">Jours</th><th className="n">Alertes val.</th><th className="n">Inv. du jour</th><th className="n">Reports apurés</th><th className="n">Taux inv.</th><th className="n">Identifiés</th><th className="n">Listés ≤ 24 h</th><th className="n">Taux suivi</th><th className="n">Reports fin SE</th><th className="n">Réception</th></tr></thead>
            <tbody>
              {weeks.slice().reverse().map((w) => (
                <tr key={w.label}>
                  <td><strong>{w.label}</strong></td><td className="n">{w.jours}</td><td className="n">{num(w.alertes_validees)}</td><td className="n">{num(w.inv_realisees_jour)}</td>
                  <td className="n">{num(w.inv_realisees_report)}</td><td className="n">{pct(w.taux_inv)}</td><td className="n">{num(w.ct_identifies)}</td><td className="n">{pct(w.taux_listage)}</td>
                  <td className="n">{pct(w.taux_suivi)}</td><td className="n">{num(w.inv_report_sortant_fin)}</td><td className="n">{pct(w.taux_reception)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}
    </div>
  );
}
