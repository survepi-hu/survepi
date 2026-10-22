import { useState } from 'react';
import { useStore } from '../store.jsx';
import { compute, completeness, isSubmitted, STATUTS, FIELDS } from '../domain/report.js';
import { aggregate, dailySeries, weeklySeries, provincial, timeliness, CATEGORIES } from '../domain/indicators.js';
import { addDays, dateRange, epiWeek, fmtTime, weekBounds } from '../domain/time.js';
import { anciennete } from '../domain/registry.js';
import { exportXlsx, exportCsv, copyTable } from '../export.js';
import { Section, Field } from '../ui.jsx';
import { actorName, zsName } from './common.jsx';
import { situationProvince } from '../domain/epi.js';

const P = (v) => (v === null || v === undefined ? 'NA' : Math.round(v * 1000) / 10);

export default function Exports() {
  const s = useStore();
  const [from, setFrom] = useState(addDays(s.date, -6));
  const [to, setTo] = useState(s.date);
  const zsIds = s.visibleZs.map((z) => z.id);

  const situation = (d = s.date) => {
    const p = provincial(s.visibleZs, d, s.idx, s.settings, s.np);
    const kpi = [
      ['ZS attendues', p.groups.all.attendues], ['Rapports reçus', p.groups.all.recues],
      ['Complétude (%)', P(p.groups.all.completude)], ['Complétude touchées (%)', P(p.groups.touchee.completude)], ['Complétude préparation (%)', P(p.groups.preparation.completude)],
      ['Promptitude (%)', P(p.groups.all.promptitude)], ['Alertes validées du jour', p.totals.alertes_validees], ['Investigations réalisées du jour', p.totals.inv_realisees_jour],
      ['Reports apurés', p.totals.inv_realisees_report], ['Investigations non faites', p.totals.inv_non_faites], ['Taux d’investigation (%)', P(p.totals.taux_inv)],
      ['Reports investigations en souffrance', p.totals.inv_report_sortant], ['Contacts identifiés', p.totals.ct_identifies], ['Contacts listés ≤ 24 h', p.totals.ct_listes_24h],
      ['Taux de listage (%)', P(p.totals.taux_listage)], ['Contacts attendus au suivi', p.totals.ct_a_suivre], ['Contacts vus', p.totals.ct_vus], ['Taux de suivi (%)', P(p.totals.taux_suivi)],
      ['Contacts non vus', p.totals.ct_non_vus],
    ].map(([Indicateur, Valeur]) => ({ Indicateur, Valeur }));
    const zs = p.rows.map((r) => ({
      ZS: r.zs.nom, Statut: CATEGORIES[r.cat], Rapport: r.cell.label, Heure: r.report?.submitted_at ? fmtTime(r.report.submitted_at) : '',
      'Complétude (%)': r.report ? P(r.completeness) : 0, 'Alertes validées': r.c ? r.report.alertes_validees : '', 'Inv. réalisées': r.c ? r.report.inv_realisees_jour : '',
      'Inv. non faites': r.c ? r.c.inv_non_faites : '', 'Reports inv.': r.c ? r.c.inv_report_sortant : '', 'Contacts à suivre': r.c ? r.c.ct_a_suivre : '',
      'Contacts vus': r.c ? r.report.ct_vus : '', '% vus': r.c ? P(r.c.taux_suivi) : '', 'Listés ≤ 24 h (%)': r.c ? P(r.c.taux_listage) : '',
    }));
    return { kpi, zs };
  };
  const areas = s.data.areas || [];
  const nomsAs = (ids) => (ids || []).map((id) => areas.find((a) => a.id === id)?.nom || '?').join(', ');
  const epi = (d = s.date) => {
    const p = situationProvince(s.visibleZs, d, s.data.reports, areas);
    const ligne = (nom, j, x) => ({ ZS: nom, 'Nouvelles AS touchées': x.nas, 'AS touchées (cumul)': x.ast, 'Jours sans nouveau cas confirmé': x.jsc ?? 'NA',
      'Nouveaux confirmés vivants': j.vivants ?? '', 'Nouveaux confirmés décédés': j.decedes ?? '', 'Nouveaux confirmés (total)': j.total ?? '', 'dont PPL': j.ppl ?? '',
      'Nouveaux décès parmi confirmés': j.deces_parmi ?? '', 'Nouveaux guéris': j.gueris ?? '', 'Cumul confirmés': x.c, 'Cumul décès (confirmés)': x.dc,
      'Létalité (%)': P(x.let), 'Cumul guéris': x.g, 'Cumul PPL confirmés': x.ppl, 'Cas confirmés en cours': x.act, 'Décès probables / communautaires (cumul, à part)': x.dnc });
    const rows = p.rows.map((r) => ligne(r.zs.nom, r.jour || {}, { nas: r.nouvelles_as.join(', '), ast: r.as_total ? `${r.as_touchees}/${r.as_total}` : r.as_touchees, jsc: r.jours_sans_cas,
      c: r.cumuls.confirmes, dc: r.cumuls.deces, let: r.cumuls.letalite, g: r.cumuls.gueris, ppl: r.cumuls.ppl, act: r.cumuls.actifs, dnc: r.cumuls.deces_non_confirmes }));
    const t = p.totaux;
    rows.push(ligne('Province', t, { nas: t.nouvelles_as.join(', '), ast: t.as_touchees, jsc: t.jours_sans_cas, c: t.confirmes, dc: t.deces, let: t.letalite, g: t.gueris_cumul, ppl: t.ppl_cumul, act: t.actifs, dnc: t.deces_nc_cumul }));
    return rows;
  };
  const epiSerie = () => dateRange(from, to).map((d) => {
    const t = situationProvince(s.visibleZs, d, s.data.reports, areas).totaux;
    return { Date: d, SE: epiWeek(d).label, 'Nouveaux confirmés': t.total, Vivants: t.vivants, Décédés: t.decedes, PPL: t.ppl, 'Décès parmi confirmés': t.deces_parmi, Guéris: t.gueris,
      'Nouvelles AS': t.nouvelles_as.join(', '), 'Cumul confirmés': t.confirmes, 'Cumul décès': t.deces, 'Cumul guéris': t.gueris_cumul, 'Cumul PPL': t.ppl_cumul, 'En cours': t.actifs, 'Jours sans cas': t.jours_sans_cas ?? 'NA' };
  });
  const reportsList = () => s.data.deferrals.filter((d) => !d.apure && zsIds.includes(d.zs_id)).map((d) => ({
    Type: d.objet, Code: d.code, ZS: zsName(s, d.zs_id), 'Date initiale': d.date_initiale, 'Ancienneté (j)': anciennete(d, s.np.date), 'N° report': d.numero,
    Motif: d.motif, 'Nouvelle échéance': d.nouvelle_echeance.slice(0, 10), Responsable: actorName(s, d.responsable_id),
  }));
  const brut = () => s.data.reports.filter((r) => zsIds.includes(r.zs_id) && r.date >= from && r.date <= to).sort((a, b) => (a.date + a.zs_id < b.date + b.zs_id ? -1 : 1)).map((r) => {
    const c = compute(r); const z = s.data.zs.find((x) => x.id === r.zs_id);
    const o = { Date: r.date, SE: epiWeek(r.date).label, ZS: z?.nom, Statut: STATUTS[r.statut]?.label, 'Rapport nul': r.rapport_nul ? 'oui' : 'non',
      Soumission: r.submitted_at ? fmtTime(r.submitted_at) : '', Ponctualité: isSubmitted(r) ? timeliness(r, z, r.date, s.settings, s.np) : 'non reçu',
      'Complétude (%)': P(completeness(r)) };
    for (const f of FIELDS) o[f.label] = r[f.key];
    o['Nouvelles AS touchées'] = nomsAs(r.nouvelles_as);
    Object.assign(o, { 'Inv. non faites': c.inv_non_faites, 'Report sortant': c.inv_report_sortant, 'Taux inv. (%)': P(c.taux_inv), 'Contacts à suivre': c.ct_a_suivre,
      'Non vus': c.ct_non_vus, 'Taux suivi (%)': P(c.taux_suivi), 'Taux listage (%)': P(c.taux_listage), 'Motifs inv.': (r.motifs_inv || []).join(', '),
      'Motifs non-suivi': (r.motifs_suivi || []).join(', '), Commentaire: r.commentaire || '' });
    return o;
  });
  const performance = () => s.visibleZs.map((z) => {
    const reps = dateRange(from, to).map((d) => s.idx.get(`${d}|${z.id}`)).filter((r) => r && isSubmitted(r));
    const t = aggregate(reps);
    const att = dateRange(from, to).filter((d) => d <= s.np.date).length;
    const onTime = reps.filter((r) => timeliness(r, z, r.date, s.settings, s.np) === 'a_temps').length;
    return { ZS: z.nom, 'Jours attendus': att, 'Rapports reçus': reps.length, 'Promptitude (%)': P(att ? onTime / att : null), 'Alertes validées': t.alertes_validees,
      'Taux inv. (%)': P(t.taux_inv), 'Reports apurés': t.inv_realisees_report, 'Contacts identifiés': t.ct_identifies, 'Taux listage (%)': P(t.taux_listage), 'Taux suivi (%)': P(t.taux_suivi),
      'Narratifs (%)': P(t.taux_narratifs), 'Mappings (%)': P(t.taux_mappings) };
  });
  const se = () => {
    const wb = weekBounds(s.date);
    return weeklySeries(dailySeries(s.visibleZs, addDays(wb.from, -35), s.date, s.idx, s.settings, s.np)).map((w) => ({
      Semaine: w.label, Du: w.from, Au: w.to, 'Alertes validées': w.alertes_validees, 'Inv. du jour': w.inv_realisees_jour, 'Reports apurés': w.inv_realisees_report,
      'Taux inv. (%)': P(w.taux_inv), Identifiés: w.ct_identifies, 'Listage ≤ 24 h (%)': P(w.taux_listage), 'Taux suivi (%)': P(w.taux_suivi), 'Réception (%)': P(w.taux_reception) }));
  };
  const audit = () => s.data.audit.map((a) => ({ Date: a.at, Utilisateur: a.user_nom || a.user_id, Table: a.table_name, Objet: a.row_id, Action: a.action }));

  const go = async (name, fn) => { s.actions.logEvent(`export:${name}`, { from, to, zs: zsIds }); try { const ok = await fn(); if (ok !== false) s.notify('Export généré'); } catch (e) { s.notify(`Export impossible : ${e.message}`, 'bad'); } };
  const copy = async (rows, label) => { const ok = await copyTable(rows); s.notify(ok ? `${label} copié : coller dans PowerPoint, Word ou Excel` : 'Copie refusée par le navigateur', ok ? 'good' : 'bad'); };
  const d = s.date;

  const products = [
    { k: 'situation', t: 'Situation journalière', desc: `Matrice en 3 rubriques du ${d} : situation épidémiologique, investigations et suivi des contacts par ZS, reports en souffrance.`,
      xlsx: () => { const x = situation(); return exportXlsx(`SurvEpi_situation_${d}.xlsx`, [{ name: 'Situation épidémio', rows: epi() }, { name: 'KPI', rows: x.kpi }, { name: 'ZS', rows: x.zs }, { name: 'Reports', rows: reportsList() }]); },
      copy: () => copy(situation().zs, 'Tableau ZS'), copy2: () => copy(situation().kpi, 'KPI') },
    { k: 'epi', t: 'Situation épidémiologique (évolution)', desc: 'Nouveaux cas, décès, guéris, AS touchées et cumuls provinciaux, jour par jour.', period: true,
      xlsx: () => exportXlsx(`SurvEpi_situation_epi_${from}_${to}.xlsx`, [{ name: 'Par jour', rows: epiSerie() }, { name: `ZS au ${to}`, rows: epi(to) }]), copy: () => copy(epi(), 'Situation épidémio') },
    { k: 'se', t: 'Rapport semaine épidémiologique', desc: 'Tendances hebdomadaires : investigations, listage, suivi, réception.',
      xlsx: () => exportXlsx(`SurvEpi_SE_${epiWeek(d).label}.xlsx`, [{ name: 'Semaines', rows: se() }]), copy: () => copy(se(), 'Synthèse SE') },
    { k: 'reports', t: 'Liste des reports', desc: 'Investigations et contacts non apurés, en temps réel.',
      xlsx: () => exportXlsx(`SurvEpi_reports_${s.np.date}.xlsx`, [{ name: 'Reports', rows: reportsList() }]), copy: () => copy(reportsList(), 'Liste des reports') },
    { k: 'perf', t: 'Performance des ZS', desc: 'Comparaison des indicateurs sur la période choisie.', period: true,
      xlsx: () => exportXlsx(`SurvEpi_performance_${from}_${to}.xlsx`, [{ name: 'Performance', rows: performance() }]), copy: () => copy(performance(), 'Performance ZS') },
    { k: 'brut', t: 'Export brut des fiches', desc: 'Toutes les variables saisies et calculées, une ligne par fiche Date × ZS.', period: true,
      xlsx: () => exportXlsx(`SurvEpi_fiches_${from}_${to}.xlsx`, [{ name: 'Fiches', rows: brut() }]), csv: () => exportCsv(`SurvEpi_fiches_${from}_${to}.csv`, brut()) },
    ...(['admin', 'team_lead', 'data_manager'].includes(s.role) ? [{ k: 'sauvegarde', t: 'Sauvegarde complète (Excel)', desc: 'Toutes les tables, toutes les dates, un onglet par table. Copie lisible hors ligne, en plus de la sauvegarde nocturne de la base.',
      xlsx: async () => {
        const all = await s.actions.exportAll();
        const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v])));
        return exportXlsx(`SurvEpi_sauvegarde_${s.np.date}.xlsx`, Object.entries(all).map(([name, rows]) => ({ name, rows: flat(rows) })));
      } }] : []),
    ...(['admin', 'team_lead'].includes(s.role) ? [{ k: 'audit', t: 'Historique d’audit', desc: 'Modifications, validations, réouvertures, connexions, exports.',
      xlsx: () => exportXlsx(`SurvEpi_audit_${s.np.date}.xlsx`, [{ name: 'Audit', rows: audit() }]) }] : []),
  ];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Rapports & exports</h1>
        <p className="sub">Les exports respectent votre périmètre ({s.visibleZs.length} ZS) et sont journalisés.</p>
      </header>
      <div className="filters">
        <Field label="Période du"><input id="e-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="au"><input id="e-to" type="date" value={to} max={s.np.date} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Section>
        <ul className="products">
          {products.map((p) => (
            <li key={p.k}>
              <div><strong>{p.t}</strong>{p.period && <small className="muted"> · période</small>}<p>{p.desc}</p></div>
              <div className="row-actions">
                {p.copy && <button className="btn ghost small" onClick={p.copy}>Copier le tableau</button>}
                {p.copy2 && <button className="btn ghost small" onClick={p.copy2}>Copier les KPI</button>}
                {p.csv && <button className="btn ghost small" onClick={() => go(p.k + ':csv', p.csv)}>CSV</button>}
                <button className="btn small primary" onClick={() => go(p.k, p.xlsx)}>Excel</button>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
