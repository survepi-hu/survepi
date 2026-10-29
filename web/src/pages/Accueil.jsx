import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { Band, Section, Pill, Dot, pct, num, Table, Empty, toneOfRate } from '../ui.jsx';
import { useDay, useGaps, CELL_TONE, CatPill, zsName, backupState } from './common.jsx';
import { DEFAULT_STEPS } from '../domain/reminders.js';
import { hhmmToMin, fmtTime, fmtDate } from '../domain/time.js';
import { needsSupervisor } from '../domain/registry.js';
import { situationProvince, SOUS_GROUPES } from '../domain/epi.js';

export default function Accueil({ go }) {
  const s = useStore();
  const day = useDay(s.date);
  const gaps = useGaps(s.date);
  const t = day.totals;
  const g = day.groups;
  const isToday = s.date === s.np.date;

  const steps = s.settings.rappels?.length ? s.settings.rappels : DEFAULT_STEPS;
  const next = isToday ? steps.find((x) => hhmmToMin(x.heure) > s.np.minutes) : null;
  const toValidate = s.data.reports.filter((r) => ['soumis', 'valide_zs'].includes(r.statut) && s.visibleZs.some((z) => z.id === r.zs_id));
  const openDef = s.data.deferrals.filter((d) => !d.apure && s.visibleZs.some((z) => z.id === d.zs_id));
  const sup = [...s.data.investigations, ...s.data.contacts].filter((o) => needsSupervisor(o, s.settings.seuil_escalade_reports) && s.visibleZs.some((z) => z.id === o.zs_id));
  const waQueue = s.data.notifications.filter((n) => n.mode === 'manuel' && n.statut === 'a_envoyer').length;
  const epi = useMemo(() => situationProvince(s.visibleZs, s.date, s.data.reports, s.data.areas || []).totaux, [s.visibleZs, s.date, s.data.reports, s.data.areas]);
  const mine = useMemo(() => day.rows.filter((r) => s.myZs.includes(r.zs.id)), [day, s.myZs]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>{isToday ? 'Situation du jour' : `Situation du ${fmtDate(s.date, true)}`}</h1>
        <p className="sub">{g.all.recues} rapport(s) reçu(s) sur {g.all.attendues} attendus{next ? ` · prochain rappel ${next.heure} (${next.libelle})` : isToday ? ' · tous les rappels du jour sont passés' : ''}</p>
      </header>

      {mine.length > 0 && (
        <Section title="Ma fiche">
          <div className="my-zs">
            {mine.map((r) => (
              <div key={r.zs.id} className={`my-zs-row tone-${CELL_TONE[r.cell.state]}`}>
                <Dot tone={CELL_TONE[r.cell.state]} />
                <strong>{r.zs.nom}</strong>
                <span>{r.cell.label}{r.report?.submitted_at ? ` · soumis à ${fmtTime(r.report.submitted_at)}` : ''}</span>
                <span className="grow" />
                {r.expected && <button className="btn primary" onClick={() => { sessionStorage.setItem('survepi:zs', r.zs.id); go('reporting'); }}>
                  {r.report ? (r.submitted ? 'Voir la fiche' : 'Continuer la fiche') : 'Remplir la fiche'}</button>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Band items={[
        { label: 'Nouveaux cas confirmés', value: num(epi.total), sub: `${num(epi.vivants)} vivants · ${num(epi.decedes)} décédés`, tone: epi.total ? 'bad' : null },
        { label: 'Nouvelles AS touchées', value: num(epi.nouvelles_as.length), sub: epi.nouvelles_as.join(', ') || `${num(epi.as_touchees)} au total`, tone: epi.nouvelles_as.length ? 'warn' : null },
        { label: 'Jours sans nouveau cas', value: epi.jours_sans_cas === null ? '–' : num(epi.jours_sans_cas), sub: 'toutes ZS' },
        { label: 'Cumul confirmés', value: num(epi.confirmes), sub: `${num(epi.deces)} décès · ${num(epi.gueris_cumul)} guéris` },
        { label: 'Cas en cours', value: num(epi.actifs), sub: `létalité ${epi.letalite === null ? 'NA' : pct(epi.letalite, 1)}` },
      ]} />

      <Band items={['confirmes', 'deces', 'gueris'].map((k) => ({
        label: `Sous-groupes : cumul ${{ confirmes: 'confirmés', deces: 'décès', gueris: 'guéris' }[k]}`,
        value: SOUS_GROUPES.map((g) => num(epi.groupes[g.id][k])).join(' · '),
        sub: SOUS_GROUPES.map((g) => g.court).join(' · '),
      }))} />

      <Band items={[
        { label: 'Rapports reçus', value: `${g.all.recues} / ${g.all.attendues}`, sub: `touchées ${g.touchee.recues}/${g.touchee.attendues} · prépa ${g.preparation.recues}/${g.preparation.attendues}` },
        { label: 'Complétude', value: pct(g.all.completude), tone: toneOfRate(g.all.completude), sub: 'complets et à temps' },
        { label: 'Promptitude', value: pct(g.all.promptitude), tone: toneOfRate(g.all.promptitude) },
        { label: 'Taux d’investigation', value: pct(t.taux_inv), tone: toneOfRate(t.taux_inv), sub: `${num(t.inv_realisees_jour)} / ${num(t.alertes_validees)} alertes validées` },
        { label: 'Taux de suivi', value: pct(t.taux_suivi), tone: toneOfRate(t.taux_suivi, s.settings.seuil_suivi), sub: `${num(t.ct_vus)} vus / ${num(t.ct_a_suivre)} à suivre` },
        { label: 'Listés ≤ 24 h', value: pct(t.taux_listage), tone: toneOfRate(t.taux_listage), sub: `${num(t.ct_listes_24h)} / ${num(t.ct_identifies)} identifiés` },
      ]} />

      <div className="split">
        <Section title="À traiter">
          <ul className="todo">
            {gaps.map((x, i) => (
              <li key={i} className={`tone-${x.level}`}><Dot tone={x.level} /><strong>{x.zs.nom}</strong> {x.msg}</li>
            ))}
            {s.isProvince || s.role === 'epidemiologiste' ? (
              <li><Dot tone={toValidate.length ? 'warn' : 'good'} /><a href="#validation" onClick={() => go('validation')}>{toValidate.length} fiche(s) en attente de validation</a></li>
            ) : null}
            {['data_manager', 'team_lead', 'validateur', 'admin'].includes(s.role) && waQueue > 0 && (
              <li className="tone-warn"><Dot tone="warn" /><a href="#notifications" onClick={() => go('notifications')}>{waQueue} message(s) WhatsApp à envoyer</a></li>
            )}
            {['admin', 'team_lead', 'data_manager'].includes(s.role) && (() => {
              const bk = backupState(s.settings);
              return <li className={`tone-${bk.tone}`}><Dot tone={bk.tone} />{bk.b?.dossier_url ? <a href={bk.b.dossier_url} target="_blank" rel="noreferrer">{bk.text}</a> : bk.text}</li>;
            })()}
            <li><Dot tone={openDef.length ? 'warn' : 'good'} /><a href="#reports" onClick={() => go('reports')}>{openDef.length} report(s) non apuré(s) dans les registres</a></li>
            {sup.length > 0 && <li className="tone-bad"><Dot tone="bad" /><a href="#reports" onClick={() => go('reports')}>{sup.length} objet(s) « Action superviseur requise » (≥ {s.settings.seuil_escalade_reports} reports)</a></li>}
            {!gaps.length && !toValidate.length && !openDef.length && <li><Dot tone="good" />Rien d’urgent.</li>}
          </ul>
        </Section>

        <Section title="Volumes du jour">
          <Table className="compact">
            <tbody>
              <tr><th>Alertes validées (entrée)</th><td className="n">{num(t.alertes_validees)}</td></tr>
              <tr><th>Investigations réalisées du jour</th><td className="n">{num(t.inv_realisees_jour)}</td></tr>
              <tr><th>Reports apurés</th><td className="n">{num(t.inv_realisees_report)}</td></tr>
              <tr><th>Investigations non faites</th><td className="n">{num(t.inv_non_faites)}</td></tr>
              <tr><th>Reports d’investigation en souffrance</th><td className="n strong">{num(t.inv_report_sortant)}</td></tr>
              <tr><th>Contacts identifiés</th><td className="n">{num(t.ct_identifies)}</td></tr>
              <tr><th>Contacts à suivre</th><td className="n">{num(t.ct_a_suivre)}</td></tr>
              <tr><th>Contacts non vus</th><td className="n strong">{num(t.ct_non_vus)}</td></tr>
              <tr><th>RECO actifs</th><td className="n">{num(t.reco_actifs)}</td></tr>
            </tbody>
          </Table>
        </Section>
      </div>

      <Section title="Zones de santé" aside={<a href="#tableau" onClick={() => go('tableau')}>Tableau comparatif complet</a>}>
        {day.rows.length === 0 ? <Empty>Aucune ZS dans votre périmètre.</Empty> : (
          <Table>
            <thead><tr><th>ZS</th><th>Statut</th><th>Rapport</th><th className="n">Heure</th><th className="n">Complétude</th><th className="n">Taux inv.</th><th className="n">% vus</th><th className="n">Report inv.</th></tr></thead>
            <tbody>
              {day.rows.map((r) => (
                <tr key={r.zs.id}>
                  <td><strong>{r.zs.nom}</strong></td>
                  <td><CatPill cat={r.cat} hotspot={r.zs.hotspot} /></td>
                  <td><Pill tone={CELL_TONE[r.cell.state]}>{r.cell.label}</Pill></td>
                  <td className="n">{r.report?.submitted_at ? fmtTime(r.report.submitted_at) : '–'}</td>
                  <td className="n">{r.report ? pct(r.completeness) : '–'}</td>
                  <td className="n">{r.c ? pct(r.c.taux_inv) : '–'}</td>
                  <td className="n">{r.c ? pct(r.c.taux_suivi) : '–'}</td>
                  <td className="n">{r.c ? num(r.c.inv_report_sortant) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      {!s.isProvince && <p className="muted small">Périmètre : {s.myZs.map((id) => zsName(s, id)).join(', ') || 'aucune ZS affectée'}.</p>}
    </div>
  );
}
