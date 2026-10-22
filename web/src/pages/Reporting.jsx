import PiecesJointes from './PiecesJointes.jsx';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { FIELD_BY_KEY, MOTIFS_INVESTIGATION, MOTIFS_SUIVI, SORTIES, applyZeroReport, can, canValidate, carryOver, completeness, compute, emptyReport, isLocked, statusOnSubmit, validate } from '../domain/report.js';
import { cellState, zsCategory, isExpected } from '../domain/indicators.js';
import { ETATS, detection, rapportPrecedent, cumulsZs, joursSansNouveauCas, asTouchees, asProposables, avertissementsEpi } from '../domain/epi.js';
import { addDays, dateRange, fmtDate, fmtTime } from '../domain/time.js';
import { Pill, Section, pct, num, Empty, Dot } from '../ui.jsx';
import { CELL_TONE, CatPill, StatutPill, actorName } from './common.jsx';

function Matrix({ zsList, end, onPick, sel }) {
  const s = useStore();
  const days = dateRange(addDays(end, -13), end);
  return (
    <div className="matrix-wrap">
      <table className="matrix" aria-label="Matrice ZS × jour">
        <thead><tr><th>ZS</th>{days.map((d) => <th key={d} className={d === s.date ? 'cur' : ''}>{fmtDate(d).split(' ')[0]}<small>{fmtDate(d).split(' ')[1]}</small></th>)}</tr></thead>
        <tbody>
          {zsList.map((z) => (
            <tr key={z.id} className={sel === z.id ? 'sel' : ''}>
              <th><button className="link" onClick={() => onPick(z.id, s.date)}>{z.nom}</button></th>
              {days.map((d) => {
                const r = s.idx.get(`${d}|${z.id}`);
                const c = cellState(r, z, d, s.settings, s.np, s.idx.get(`${addDays(d, -1)}|${z.id}`));
                return (
                  <td key={d}>
                    <button className={`cell tone-${CELL_TONE[c.state]} ${sel === z.id && d === s.date ? 'cur' : ''}`} title={`${z.nom}, ${fmtDate(d, true)} : ${c.label}${r?.submitted_at ? ' à ' + fmtTime(r.submitted_at) : ''}`}
                      onClick={() => onPick(z.id, d)} aria-label={`${z.nom} ${d} ${c.label}`}>{r?.rapport_nul ? '0' : ''}</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend-line">
        <span><Dot tone="good" />Complet à temps</span><span><Dot tone="warn" />En retard ou incomplet</span><span><Dot tone="bad" />Non reçu ou à corriger</span>
        <span><Dot tone="pending" />En attente</span><span><Dot tone="na" />Non attendu</span><span><Dot tone="hist" />Historique importé</span><span>« 0 » rapport nul</span>
      </p>
    </div>
  );
}

function Etat({ d }) {
  if (!d) return null;
  const e = ETATS[d.etat];
  const titre = `${e.aide}${d.avant !== null && d.avant !== undefined ? ` (rapport précédent : ${d.avant})` : ''}${d.etat === 'corrige' && d.valide !== null ? ` (valeur validée : ${d.valide})` : ''}`;
  return <span className={`etat etat-${d.etat}`} title={titre}>{e.label}</span>;
}

function NumInput({ k, form, set, errors, readOnly, prevHint, det }) {
  const f = FIELD_BY_KEY[k];
  const err = errors.find((e) => e.field === k);
  return (
    <label className={`field num-field ${err ? 'has-error' : ''}`}>
      <span className="field-label">{f.short && <b className="short">{f.short}</b>}{f.label}{f.required && <i className="req" title="Obligatoire">*</i>}<Etat d={det?.etats?.[k]} /></span>
      <input id={`f-${k}`} type="number" inputMode="numeric" min="0" step="1" value={form[k] ?? ''} readOnly={readOnly}
        onChange={(e) => set({ [k]: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))) })} />
      {prevHint !== undefined && <span className="field-hint">veille : {num(prevHint)}</span>}
      {f.help && f.group === 'epi' && <span className="field-hint">{f.help}</span>}
      {err && <span className="field-error">{err.msg}</span>}
    </label>
  );
}

function Calc({ label, value, tone }) {
  return <div className={`calc ${tone ? 'tone-' + tone : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Checks({ options, value, onChange, readOnly, id }) {
  return (
    <div className="checks" id={id}>
      {options.map(([k, label]) => (
        <label key={k} className={`chk ${value.includes(k) ? 'on' : ''}`}>
          <input type="checkbox" disabled={readOnly} checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />{label}
        </label>
      ))}
    </div>
  );
}

export default function Reporting() {
  const s = useStore();
  const zsList = s.visibleZs;
  const [zsId, setZsId] = useState(() => {
    let v = null; try { v = sessionStorage.getItem('survepi:zs'); sessionStorage.removeItem('survepi:zs'); } catch { /* ignore */ }
    return v || s.myZs[0] || zsList[0]?.id;
  });
  const zs = zsList.find((z) => z.id === zsId) || zsList[0];
  const date = s.date;
  const existing = zs ? s.idx.get(`${date}|${zs.id}`) : null;
  const prev = zs ? s.idx.get(`${addDays(date, -1)}|${zs.id}`) : null;
  // Veille manquante : on reprend le dernier rapport disponible (14 jours max) pour ne pas perdre les reports
  const lastPrev = useMemo(() => {
    if (!zs || prev) return prev;
    for (let i = 2; i <= 14; i++) { const r = s.idx.get(`${addDays(date, -i)}|${zs.id}`); if (r) return r; }
    return null;
  }, [zs?.id, date, prev, s.idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [returnMsg, setReturnMsg] = useState('');

  useEffect(() => {
    if (!zs) return;
    setForm(existing ? { ...existing } : { ...emptyReport(date, zs.id), ...carryOver(lastPrev), rapporteur_id: s.user.id });
    setShowAll(false);
  }, [zs?.id, date, existing?.id, existing?.version, existing?.statut]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = { prev, seuilSuivi: s.settings.seuil_suivi };
  const v = useMemo(() => (form ? validate(form, opts) : { errors: [], warnings: [] }), [form, prev]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => (form ? compute(form) : null), [form]);
  const precedent = useMemo(() => (zs ? rapportPrecedent(zs.id, date, s.data.reports) : null), [zs?.id, date, s.data.reports]); // eslint-disable-line react-hooks/exhaustive-deps
  const det = useMemo(() => (form ? detection(form, precedent, existing ? s.data.versions.filter((x) => x.report_id === existing.id) : []) : null), [form, precedent, existing, s.data.versions]);
  // Fiche en cours comptée comme retenue, pour montrer les cumuls « si cette fiche est validée »
  const avecFiche = useMemo(() => (form ? [...s.data.reports.filter((r) => !(r.zs_id === form.zs_id && r.date === form.date)), { ...form, id: existing?.id || 'en-cours', statut: 'soumis', submitted_at: form.submitted_at || 'en-cours' }] : []), [form, s.data.reports, existing?.id]);
  if (!zs) return <Empty>Aucune zone de santé dans votre périmètre.</Empty>;
  if (!form) return null;

  const cat = zsCategory(zs, date, s.settings);
  const expected = isExpected(zs, date, s.settings);
  const editable = s.canEditZs(zs.id) && !isLocked(existing) && s.role !== 'coordination';
  const ro = !editable;
  const set = (patch) => setForm((f) => ({ ...f, ...patch, rapport_nul: patch.rapport_nul ?? (Object.keys(patch).some((k) => FIELD_BY_KEY[k]) ? false : f.rapport_nul) }));
  const carry = carryOver(prev);
  const versions = existing ? s.data.versions.filter((x) => x.report_id === existing.id) : [];
  const vals = existing ? s.data.validations.filter((x) => x.report_id === existing.id) : [];
  const cell = cellState(existing, zs, date, s.settings, s.np, prev);
  const showErr = showAll ? v.errors : v.errors.filter((e) => ['motifs_inv', 'motifs_suivi', 'justif_report_inv', 'justif_report_ct', 'motif_autre'].includes(e.field) ? false : true);

  const save = async () => { await s.actions.saveReport({ ...form, statut: existing?.statut && existing.statut !== 'brouillon' ? existing.statut : 'brouillon' }, 'Brouillon enregistré'); };
  const submit = async () => {
    setShowAll(true);
    const st = statusOnSubmit(form, opts);
    if (!st.ok) { s.notify(`${st.reason} : ${st.errors.length} point(s) à corriger.`, 'bad'); return; }
    await s.actions.saveReport({ ...form, statut: st.statut }, st.statut === 'soumis' ? 'Fiche soumise, complète' : 'Fiche soumise mais incomplète');
  };
  const zero = () => setForm(applyZeroReport(form, prev));
  const zsRef = s.data.zs.find((x) => x.id === zs.id) || zs;
  const cu = cumulsZs(zsRef, date, avecFiche);
  const jsc = joursSansNouveauCas(zsRef, date, avecFiche);
  const asZs = s.data.areas.filter((a) => a.zs_id === zs.id && a.actif !== false);
  const touchees = asTouchees(zs.id, date, s.data.areas, avecFiche);
  const proposables = asProposables(zs.id, date, s.data.areas, s.data.reports, existing?.id);
  const asOptions = [...new Map([...proposables, ...(form.nouvelles_as || []).map((id) => s.data.areas.find((a) => a.id === id)).filter(Boolean)].map((a) => [a.id, a])).values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const avertEpi = avertissementsEpi(form, zsRef, s.data.reports);
  const transition = async (action, to) => {
    if (action === 'retourner' && !returnMsg.trim()) { s.notify('Indiquer ce qu’il faut corriger.', 'bad'); return; }
    await s.actions.saveReport({ ...existing, statut: to, commentaire_validation: returnMsg || null }, { valider_zs: 'Fiche validée (ZS)', valider_prov: 'Fiche validée (province)', retourner: 'Fiche retournée au rapporteur', rouvrir: 'Fiche rouverte : modification tracée' }[action]);
    setReturnMsg('');
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Reporting journalier</h1>
        <p className="sub">Une fiche par date et par zone de santé. Les reports de la veille sont pré-remplis.</p>
      </header>

      <Matrix zsList={zsList} end={s.np.date < addDays(date, 6) ? s.np.date : addDays(date, 6)} sel={zs.id} onPick={(id, d) => { setZsId(id); s.setDate(d); }} />

      <div className="fiche-head">
        <div className="fiche-id">
          <select id="zs-select" value={zs.id} onChange={(e) => setZsId(e.target.value)} aria-label="Zone de santé">
            {zsList.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
          </select>
          <span className="fiche-date">{fmtDate(date, true)}</span>
          <CatPill cat={cat} hotspot={zs.hotspot} />
          {existing ? <StatutPill statut={existing.statut} /> : <Pill tone="muted">Nouvelle fiche</Pill>}
          <Pill tone={CELL_TONE[cell.state]}>{cell.label}</Pill>
        </div>
        <div className="fiche-meta">
          {existing?.source === 'historique' && <span>Fiche historique importée{existing.source_detail ? ` (${existing.source_detail})` : ''}</span>}
          {existing?.submitted_at && <span>Soumise à {fmtTime(existing.submitted_at)}{existing.resubmitted_at ? `, resoumise à ${fmtTime(existing.resubmitted_at)}` : ''}</span>}
          {existing?.validated_zs_by && <span>1re validation : {actorName(s, existing.validated_zs_by)}</span>}
          {existing?.validated_by && <span>2e validation : {actorName(s, existing.validated_by)}</span>}
          <span>Complétude {pct(completeness(form, opts))}</span>
          <span>Rapporteur : {actorName(s, zs.rapporteur_id)}</span>
        </div>
      </div>
      {!existing && !prev && lastPrev && <p className="note tone-warn">Pas de fiche la veille : reports repris du dernier rapport ({fmtDate(lastPrev.date, true)}). À vérifier.</p>}
      {!expected && <p className="note">Cette ZS n’est pas attendue ce jour-là (fréquence {zs.frequence}). La saisie reste possible.</p>}
      {existing?.statut === 'a_corriger' && <p className="note tone-bad">Retour superviseur : {existing.commentaire_validation || vals.find((x) => x.to_statut === 'a_corriger')?.commentaire || 'voir commentaire'}</p>}
      {ro && <p className="note">{isLocked(existing) ? 'Fiche validée : lecture seule. Une réouverture supervisée est nécessaire pour la corriger.' : 'Lecture seule pour votre profil.'}</p>}

      {det && (
        <p className="detection-resume">
          <strong>Détection</strong>{precedent ? ` (comparé au rapport du ${fmtDate(precedent.date, true)})` : ' (pas de rapport précédent)'} :
          {' '}<span className="etat etat-nouveau">{det.compte.nouveau} nouvelle(s)</span>
          <span className="etat etat-inchange">{det.compte.inchange} inchangée(s)</span>
          {det.compte.corrige > 0 && <span className="etat etat-corrige">{det.compte.corrige} corrigée(s)</span>}
          <span className="etat etat-non_renseigne">{det.compte.non_renseigne} non renseignée(s)</span>
          <small className="muted">Zéro compte comme une donnée rapportée.</small>
        </p>
      )}

      <form className="fiche" onSubmit={(e) => e.preventDefault()}>
        <h2 className="rubrique">I. Situation épidémiologique</h2>
        <fieldset className="blk">
          <legend>Événements du jour</legend>
          <div className="grid-fields">
            {['cas_conf_vivants', 'cas_conf_decedes', 'cas_conf_ppl', 'deces_parmi_confirmes', 'gueris', 'deces_non_confirmes'].map((k) => <NumInput key={k} k={k} det={det} {...{ form, set, errors: showErr, readOnly: ro }} />)}
          </div>
          <div className="sub-block">
            <span className="field-label">Nouvelles aires de santé touchées <small className="muted">(1er cas confirmé dans l’AS)</small></span>
            {asZs.length === 0 ? <p className="muted small">Aucune aire de santé enregistrée pour cette ZS : liste à compléter dans « ZS & acteurs », onglet Aires de santé.</p>
              : asOptions.length === 0 ? <p className="muted small">Toutes les aires de santé de la ZS sont déjà touchées.</p>
                : <Checks id="nouvelles_as" options={asOptions.map((a) => [a.id, a.nom])} value={form.nouvelles_as || []} readOnly={ro} onChange={(x) => set({ nouvelles_as: x })} />}
          </div>
          <div className="calcs">
            <Calc label="Nouveaux confirmés du jour" value={num(c.cas_conf_total)} tone={c.cas_conf_total ? 'bad' : null} />
            <Calc label="Nouvelles AS touchées" value={num((form.nouvelles_as || []).length)} />
            <Calc label="AS touchées (cumul)" value={`${num(touchees.size)}${asZs.length ? ` / ${asZs.length}` : ''}`} />
            <Calc label="Jours sans nouveau cas confirmé" value={jsc === null ? 'NA' : num(jsc)} tone={jsc === 0 ? 'bad' : null} />
            <Calc label="Cumul cas confirmés" value={num(cu.confirmes)} />
            <Calc label="Cumul décès (confirmés)" value={num(cu.deces)} />
            <Calc label="Létalité" value={pct(cu.letalite, 1)} />
            <Calc label="Cumul guéris" value={num(cu.gueris)} />
            <Calc label="Cumul PPL confirmés" value={num(cu.ppl)} />
            <Calc label="Cas confirmés en cours" value={num(cu.actifs)} />
          </div>
          <p className="muted small">Cumuls recalculés = valeurs initiales de la ZS{zsRef.base_date ? ` au ${fmtDate(zsRef.base_date)}` : ''} + événements des fiches soumises, y compris celle-ci. Jamais recopiés d’un jour à l’autre.</p>
          {avertEpi.map((w) => <p key={w.msg} className="note tone-warn">{w.msg}</p>)}
        </fieldset>

        <h2 className="rubrique">II. Investigations</h2>
        <fieldset className="blk">
          <legend>Investigations</legend>
          <div className="grid-fields">
            <NumInput det={det} k="alertes_validees" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="inv_report_entrant" {...{ form, set, errors: showErr, readOnly: ro }} prevHint={prev ? carry.inv_report_entrant : undefined} />
            <NumInput det={det} k="inv_realisees_jour" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="inv_realisees_report" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="inv_moins_24h" {...{ form, set, errors: showErr, readOnly: ro }} />
          </div>
          <div className="calcs">
            <Calc label="Non faites (A − Ij)" value={num(c.inv_non_faites)} tone={c.inv_non_faites ? 'warn' : null} />
            <Calc label="Report sortant (repris demain)" value={num(c.inv_report_sortant)} tone={c.inv_report_sortant ? 'warn' : null} />
            <Calc label="Taux d’investigation (Ij / A)" value={pct(c.taux_inv)} />
            <Calc label="Total réalisées (Ij + Ir)" value={num(c.inv_total_realisees)} />
          </div>
          {(c.inv_report_sortant > 0 || form.motifs_inv?.length > 0) && (
            <div className="sub-block">
              <span className="field-label">Motif de non-réalisation<i className="req">*</i></span>
              <Checks id="motifs_inv" options={MOTIFS_INVESTIGATION} value={form.motifs_inv || []} readOnly={ro} onChange={(x) => set({ motifs_inv: x })} />
              {form.motifs_inv?.includes('autre') && <input id="motif_autre" placeholder="Préciser" value={form.motif_autre || ''} readOnly={ro} onChange={(e) => set({ motif_autre: e.target.value })} />}
              {v.errors.filter((e) => ['motifs_inv', 'motif_autre'].includes(e.field)).map((e) => <span key={e.field} className="field-error">{e.msg}</span>)}
            </div>
          )}
          {prev && form.inv_report_entrant !== null && form.inv_report_entrant !== carry.inv_report_entrant && (
            <label className="field wide"><span className="field-label">Justification du report modifié (veille : {carry.inv_report_entrant})<i className="req">*</i></span>
              <input id="justif_report_inv" value={form.justif_report_inv || ''} readOnly={ro} onChange={(e) => set({ justif_report_inv: e.target.value })} /></label>
          )}
        </fieldset>

        <fieldset className="blk">
          <legend>Documentation</legend>
          <div className="grid-fields">
            {['narratifs_attendus', 'narratifs_disponibles', 'mappings_attendus', 'mappings_disponibles'].map((k) => <NumInput det={det} key={k} k={k} {...{ form, set, errors: showErr, readOnly: ro }} />)}
          </div>
        </fieldset>

        <h2 className="rubrique">III. Suivi des contacts</h2>
        <fieldset className="blk">
          <legend>Contacts : listage</legend>
          <div className="grid-fields">
            <NumInput det={det} k="ct_report" {...{ form, set, errors: showErr, readOnly: ro }} prevHint={prev ? carry.ct_report : undefined} />
            <NumInput det={det} k="ct_identifies" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="ct_listes_24h" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="ct_listes_tardifs" {...{ form, set, errors: showErr, readOnly: ro }} />
          </div>
          <div className="calcs">
            <Calc label="Taux de listage ≤ 24 h" value={pct(c.taux_listage)} />
            <Calc label="Non listés dans les 24 h" value={num(c.ct_non_listes_24h)} tone={c.ct_non_listes_24h ? 'warn' : null} />
          </div>
          {prev && form.ct_report !== null && form.ct_report !== carry.ct_report && (
            <label className="field wide"><span className="field-label">Justification du report contacts modifié (veille : {carry.ct_report})<i className="req">*</i></span>
              <input id="justif_report_ct" value={form.justif_report_ct || ''} readOnly={ro} onChange={(e) => set({ justif_report_ct: e.target.value })} /></label>
          )}
        </fieldset>

        <fieldset className="blk">
          <legend>Sorties de suivi</legend>
          <div className="grid-fields">
            {SORTIES.map(([k]) => <NumInput det={det} key={k} k={k} {...{ form, set, errors: showErr, readOnly: ro }} />)}
          </div>
          <div className="calcs">
            <Calc label="Total sorties" value={num(c.ct_sorties)} />
            <Calc label="Contacts à suivre aujourd’hui" value={num(c.ct_a_suivre)} />
          </div>
        </fieldset>

        <fieldset className="blk">
          <legend>Suivi du jour</legend>
          <div className="grid-fields">
            <NumInput det={det} k="ct_vus" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="ct_nonvus_veille" {...{ form, set, errors: showErr, readOnly: ro }} prevHint={prev ? carry.ct_nonvus_veille : undefined} />
            <NumInput det={det} k="ct_rattrapes" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="reco_actifs" {...{ form, set, errors: showErr, readOnly: ro }} />
            <NumInput det={det} k="superviseurs_reco" {...{ form, set, errors: showErr, readOnly: ro }} />
          </div>
          <div className="calcs">
            <Calc label="Non vus" value={num(c.ct_non_vus)} tone={c.ct_non_vus ? 'warn' : null} />
            <Calc label="Taux de suivi" value={pct(c.taux_suivi)} tone={c.taux_suivi !== null && c.taux_suivi < s.settings.seuil_suivi ? 'bad' : null} />
            <Calc label="Taux de rattrapage" value={pct(c.taux_rattrapage)} />
          </div>
          {(c.ct_non_vus > 0 || form.motifs_suivi?.length > 0) && (
            <div className="sub-block">
              <span className="field-label">Motif de non-suivi<i className="req">*</i></span>
              <Checks id="motifs_suivi" options={MOTIFS_SUIVI} value={form.motifs_suivi || []} readOnly={ro} onChange={(x) => set({ motifs_suivi: x })} />
              {v.errors.filter((e) => e.field === 'motifs_suivi').map((e) => <span key={e.field} className="field-error">{e.msg}</span>)}
            </div>
          )}
        </fieldset>

        <fieldset className="blk">
          <legend>Commentaire</legend>
          {v.warnings.length > 0 && (
            <ul className="warns">{v.warnings.map((w, i) => <li key={i}><Dot tone="warn" />{w.msg}</li>)}</ul>
          )}
          <textarea id="commentaire" rows="3" value={form.commentaire || ''} readOnly={ro} placeholder={v.warnings.length ? 'Commentaire obligatoire : expliquer les avertissements ci-dessus.' : 'Commentaire qualité (facultatif)'}
            onChange={(e) => set({ commentaire: e.target.value })} />
          {showAll && v.errors.filter((e) => e.field === 'justif_report_inv' || e.field === 'justif_report_ct').map((e) => <span key={e.field} className="field-error">{e.msg}</span>)}
        </fieldset>

        {editable && (
          <div className="actions sticky-actions">
            <span className="errs">{v.errors.length ? `${v.errors.length} contrôle(s) bloquant(s)` : 'Aucun contrôle bloquant'}{form.rapport_nul ? ' · rapport nul' : ''}</span>
            <button type="button" className={`btn ${cat === 'preparation' ? 'accent' : 'ghost'}`} onClick={zero} title="Toutes les valeurs du jour à zéro, reports de la veille conservés">Rapport nul</button>
            <button type="button" className="btn ghost" onClick={save}>Enregistrer le brouillon</button>
            <button type="button" className="btn primary" onClick={submit}>{existing?.submitted_at ? 'Resoumettre' : 'Soumettre'}</button>
          </div>
        )}
      </form>

      <PiecesJointes report={existing} peutAjouter={s.canEditZs(zs.id) && s.role !== 'coordination'} />

      {existing && (can('valider_zs', s.role, existing.statut) || canValidate('valider_prov', s.role, existing, s.user.id) || can('retourner', s.role, existing.statut) || can('rouvrir', s.role, existing.statut)) && (
        <Section title="Supervision">
          <div className="actions">
            <input id="retour" className="grow" placeholder="Commentaire de validation ou ce qu’il faut corriger" value={returnMsg} onChange={(e) => setReturnMsg(e.target.value)} />
            {can('retourner', s.role, existing.statut) && <button className="btn ghost" onClick={() => transition('retourner', 'a_corriger')}>Retourner pour correction</button>}
            {can('valider_zs', s.role, existing.statut) && <button className="btn primary" disabled={validate(existing, opts).errors.length > 0} onClick={() => transition('valider_zs', 'valide_zs')}>1re validation (ZS)</button>}
            {canValidate('valider_prov', s.role, existing, s.user.id) && <button className="btn primary" disabled={validate(existing, opts).errors.length > 0} onClick={() => transition('valider_prov', 'valide_prov')}>2e validation (province)</button>}
            {can('rouvrir', s.role, existing.statut) && <button className="btn ghost" onClick={() => transition('rouvrir', 'rouvert')}>Rouvrir</button>}
          </div>
        </Section>
      )}

      {(versions.length > 0 || vals.length > 0) && (
        <Section title="Historique de la fiche">
          <ul className="history">
            {vals.map((x) => <li key={x.id}><span>{new Date(x.at).toLocaleString('fr-FR')}</span> {actorName(s, x.actor_id)} : {x.from_statut} → <strong>{x.to_statut}</strong>{x.commentaire ? ` · « ${x.commentaire} »` : ''}</li>)}
            {versions.map((x) => <li key={x.id}><span>{new Date(x.changed_at).toLocaleString('fr-FR')}</span> version {x.version} archivée</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}
