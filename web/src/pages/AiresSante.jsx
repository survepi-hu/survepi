import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { asTouchees, cumulsZs, statsAs, SOUS_GROUPES } from '../domain/epi.js';

/** Valeur actuellement calculée par l'app pour un champ de valeur initiale. */
function valeurApp(cu, k) {
  const direct = { base_confirmes: cu.confirmes, base_deces: cu.deces, base_gueris: cu.gueris, base_deces_non_confirmes: cu.deces_non_confirmes };
  if (k in direct) return direct[k];
  for (const g of SOUS_GROUPES) {
    if (k === g.base) return cu.groupes[g.id].confirmes;
    if (k === g.base_deces) return cu.groupes[g.id].deces;
    if (k === g.base_gueris) return cu.groupes[g.id].gueris;
  }
  return null;
}
import { fmtDate } from '../domain/time.js';
import { Section, Table, Pill, Modal, Field, num, pct } from '../ui.jsx';

// Référentiel des aires de santé : administrateur seul (cahier des charges V2.1, 4.3)
export const ROLES_AS = ['admin'];
// Valeurs initiales : saisie par l'admin, le Team Lead ou le data manager ; une fois validées, correction
// par le data manager (ou l'admin) seulement, avec motif (4.4, verrouillage)
export const ROLES_EPI = ['admin', 'team_lead', 'data_manager'];
export const peutBase = (role, zs) => (zs?.base_date ? ['admin', 'data_manager'] : ROLES_EPI).includes(role);
const norm = (x) => x.trim().replace(/\s+/g, ' ');
const cle = (x) => norm(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Onglet « Aires de santé » : liste par ZS, ajout (une par une ou liste collée), AS déjà touchées avant la mise en service. */
export function AiresSante() {
  const s = useStore();
  const areas = s.data.areas || [];
  const [zsId, setZsId] = useState(s.data.zs[0]?.id || '');
  const [ajout, setAjout] = useState(null); // { texte, touchee_le }
  const [edit, setEdit] = useState(null);
  const peut = ROLES_AS.includes(s.role);
  const zs = s.data.zs.find((z) => z.id === zsId);
  const touchees = useMemo(() => (zs ? asTouchees(zs.id, s.np.date, areas, s.data.reports) : new Map()), [zs, areas, s.data.reports, s.np.date]);
  const stats = useMemo(() => (zs ? statsAs(zs.id, s.np.date, areas, s.data.reports) : new Map()), [zs, areas, s.data.reports, s.np.date]);
  const liste = areas.filter((a) => a.zs_id === zsId).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const utilisee = (id) => s.data.reports.some((r) => (r.nouvelles_as || []).includes(id));

  const lignes = (ajout?.texte || '').split(/[\n;,]+/).map(norm).filter(Boolean);
  const existants = new Set(liste.map((a) => cle(a.nom)));
  const nouveaux = [...new Map(lignes.filter((n) => !existants.has(cle(n))).map((n) => [cle(n), n])).values()];

  const enregistrerAjout = async () => {
    await s.actions.bulk(async (ad) => {
      for (const nom of nouveaux) await ad.insert('areas', { zs_id: zsId, nom, touchee_le: ajout.touchee_le || null, actif: true });
    }, `${nouveaux.length} aire(s) de santé ajoutée(s)`);
    setAjout(null);
  };

  return (
    <>
      <p className="muted small">{peut ? '' : 'Liste gérée par l’administrateur. '}Liste des aires de santé (AS) de chaque ZS. Sur la fiche du jour, le rapporteur coche les AS qui enregistrent leur 1er cas confirmé : le comptage est automatique et une AS déjà touchée n’est jamais recomptée. Les AS touchées avant la mise en service se marquent ici avec leur date.</p>
      <Section title={null} aside={(
        <div className="row">
          <label className="inline">ZS
            <select id="as-zs" value={zsId} onChange={(e) => setZsId(e.target.value)}>
              {s.data.zs.map((z) => <option key={z.id} value={z.id}>{z.nom} ({areas.filter((a) => a.zs_id === z.id).length} AS)</option>)}
            </select>
          </label>
          {peut && zs && <button className="btn primary" onClick={() => setAjout({ texte: '', touchee_le: '' })}>Ajouter des AS</button>}
        </div>
      )}>
        {liste.length === 0 ? <p className="muted">Aucune aire de santé enregistrée pour {zs?.nom || 'cette ZS'}. {peut ? 'Coller la liste avec « Ajouter des AS ».' : ''}</p> : (
          <Table>
            <thead><tr><th>Aire de santé</th><th>Code DHIS2</th><th>Touchée</th><th>Dernier cas</th><th className="n">Cas saisis</th><th className="n">Jours sans nouveau cas</th><th>Origine</th><th>État</th><th></th></tr></thead>
            <tbody>
              {liste.map((a) => {
                const t = touchees.get(a.id);
                return (
                  <tr key={a.id} className={a.actif === false ? 'off' : ''}>
                    <td><strong>{a.nom}</strong></td>
                    <td className="mono">{a.code_dhis2 || <span className="muted">–</span>}</td>
                    <td>{t ? <Pill tone="bad">Touchée le {fmtDate(t.date, true)}</Pill> : <Pill tone="muted">Non touchée</Pill>}</td>
                    <td>{stats.get(a.id)?.dernier ? fmtDate(stats.get(a.id).dernier, true) : <span className="muted">–</span>}</td>
                    <td className="n">{stats.get(a.id)?.cas || <span className="muted">–</span>}</td>
                    <td className={`n ${stats.get(a.id)?.jours_sans_cas === 0 ? 'tone-bad' : ''}`}>{stats.get(a.id)?.jours_sans_cas ?? <span className="muted">–</span>}</td>
                    <td className="muted small">{t ? (t.origine === 'initiale' ? 'Valeur initiale' : 'Fiche du jour') : ''}</td>
                    <td>{a.actif === false ? <Pill tone="muted">Désactivée</Pill> : 'Active'}</td>
                    <td className="row-actions">{peut && <button className="btn ghost small" onClick={() => setEdit({ ...a })}>Modifier</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {zs && liste.length > 0 && <p className="muted small">{touchees.size} AS touchée(s) sur {liste.filter((a) => a.actif !== false).length} au {fmtDate(s.np.date)}.</p>}
      </Section>

      {ajout && (
        <Modal title={`Ajouter des aires de santé à ${zs.nom}`} onClose={() => setAjout(null)}>
          <Field label="Noms des AS" hint="Une par ligne (ou séparées par des virgules). Copier-coller depuis Excel possible.">
            <textarea id="as-liste" rows="8" value={ajout.texte} onChange={(e) => setAjout({ ...ajout, texte: e.target.value })} />
          </Field>
          <Field label="Déjà touchée(s) le" hint="Seulement pour des AS touchées avant la mise en service ou avant les valeurs initiales. Sinon laisser vide : la fiche du jour s’en charge.">
            <input id="as-touchee" type="date" value={ajout.touchee_le} onChange={(e) => setAjout({ ...ajout, touchee_le: e.target.value })} />
          </Field>
          <p className="muted small">{nouveaux.length} nouvelle(s){lignes.length > nouveaux.length ? ` · ${lignes.length - nouveaux.length} déjà présente(s) ou en double, ignorée(s)` : ''}</p>
          <div className="actions"><button className="btn primary" disabled={!nouveaux.length} onClick={enregistrerAjout}>Ajouter {nouveaux.length || ''}</button></div>
        </Modal>
      )}

      {edit && (
        <Modal title={`Modifier ${edit.nom}`} onClose={() => setEdit(null)}>
          <div className="form-grid">
            <Field label="Nom"><input id="as-nom" value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></Field>
            <Field label="Code DHIS2"><input id="as-dhis" value={edit.code_dhis2 || ''} onChange={(e) => setEdit({ ...edit, code_dhis2: e.target.value || null })} /></Field>
            <Field label="Touchée le (valeur initiale)" hint={utilisee(edit.id) ? 'Déjà déclarée nouvelle sur une fiche : la date vient de la fiche.' : 'Vide = pas encore touchée.'}>
              <input id="as-date" type="date" disabled={utilisee(edit.id)} value={edit.touchee_le || ''} onChange={(e) => setEdit({ ...edit, touchee_le: e.target.value || null })} />
            </Field>
            <label className="chk"><input type="checkbox" checked={edit.actif !== false} onChange={(e) => setEdit({ ...edit, actif: e.target.checked })} />AS active</label>
          </div>
          <div className="actions">
            {!utilisee(edit.id) && <button className="btn ghost" onClick={async () => { await s.actions.remove('areas', edit.id, 'AS supprimée'); setEdit(null); }}>Supprimer</button>}
            <button className="btn primary" disabled={!norm(edit.nom)} onClick={async () => {
              const { id, nom, code_dhis2, touchee_le, actif } = edit;
              await s.actions.update('areas', id, { nom: norm(nom), code_dhis2, touchee_le, actif }, 'AS mise à jour'); setEdit(null);
            }}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </>
  );
}

const BASE = [
  ['base_confirmes', 'Cumul cas confirmés'],
  ['base_deces', 'Cumul décès parmi les confirmés'],
  ['base_gueris', 'Cumul guéris'],
  ['base_ppl', 'Cumul PPL confirmés'],
  ['base_deces_ppl', 'Cumul décès de PPL'],
  ['base_gueris_ppl', 'Cumul PPL guéris'],
  ['base_moins5', 'Cumul confirmés de moins de 5 ans'],
  ['base_deces_moins5', 'Cumul décès de moins de 5 ans'],
  ['base_gueris_moins5', 'Cumul guéris de moins de 5 ans'],
  ['base_eleves', 'Cumul élèves confirmés'],
  ['base_deces_eleves', 'Cumul décès d’élèves'],
  ['base_gueris_eleves', 'Cumul élèves guéris'],
  ['base_deces_non_confirmes', 'Décès probables / communautaires (à part)'],
];

/** Valeurs initiales d'une ZS (situation à une date de référence), saisies après validation par l'équipe data. */
export function ValeursInitiales({ zs, onClose }) {
  const s = useStore();
  const ref = (s.data.zs_ref || s.data.zs).find((z) => z.id === zs.id) || zs;
  const correction = !!ref.base_date;
  const [f, setF] = useState({ base_date: ref.base_date || '', base_valide_par: ref.base_valide_par || '', base_valide_le: ref.base_valide_le || '',
    base_source: ref.base_source || '', base_motif: '',
    ...Object.fromEntries(BASE.map(([k]) => [k, ref[k] ?? ''])) });
  // Ce que l'app affiche aujourd'hui pour cette date (valeurs initiales actuelles + fiches) : sert de contrôle
  const fiches = f.base_date ? cumulsZs(ref, f.base_date, s.data.reports) : null;
  const avantRef = f.base_date ? s.data.reports.filter((r) => r.zs_id === zs.id && r.date <= f.base_date).length : 0;
  const n = (v) => (v === '' || v === null ? null : Math.max(0, Math.round(Number(v)) || 0));
  const ok = (!f.base_date || (f.base_valide_par.trim() && f.base_valide_le)) && (!correction || f.base_motif.trim());
  const incoherent = f.base_date && n(f.base_deces) + n(f.base_gueris) > n(f.base_confirmes);
  const m5Trop = f.base_date && SOUS_GROUPES.some((g) => n(f[g.base]) > n(f.base_confirmes) || n(f[g.base_deces]) > n(f.base_deces) || n(f[g.base_gueris]) > n(f.base_gueris)
    || n(f[g.base_deces]) + n(f[g.base_gueris]) > n(f[g.base]));

  const save = async () => {
    const patch = f.base_date
      ? { base_date: f.base_date, base_valide_par: f.base_valide_par.trim(), base_valide_le: f.base_valide_le, base_source: f.base_source.trim() || null,
          base_motif: correction ? f.base_motif.trim() : null, ...Object.fromEntries(BASE.map(([k]) => [k, n(f[k]) ?? 0])) }
      : { base_date: null, base_valide_par: null, base_valide_le: null, base_source: null, base_motif: correction ? f.base_motif.trim() : null, ...Object.fromEntries(BASE.map(([k]) => [k, null])) };
    await s.actions.update('zs', zs.id, patch, 'Valeurs initiales enregistrées');
    onClose();
  };

  return (
    <Modal wide title={`Valeurs initiales : ${zs.nom}`} onClose={onClose}>
      <p className="muted small">Situation de la ZS à une date de référence, telle que validée par l’équipe de gestion des données. Les cumuls de l’app partent de ces valeurs et ajoutent les événements des fiches postérieures à cette date. Si l’historique complet a été importé depuis le début de l’épidémie, laisser vide : les cumuls sont reconstitués à partir des fiches.</p>
      <div className="form-grid">
        <Field label="Situation arrêtée au" hint="Les fiches jusqu’à cette date incluse ne sont plus additionnées."><input id="vi-date" type="date" value={f.base_date} onChange={(e) => setF({ ...f, base_date: e.target.value })} /></Field>
        {BASE.map(([k, l]) => (
          <Field key={k} label={l}>
            <input id={`vi-${k}`} type="number" min="0" inputMode="numeric" disabled={!f.base_date} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            {fiches && <small className="blk muted">actuellement dans l’app : {num(valeurApp(fiches, k))}</small>}
          </Field>
        ))}
        <Field label="Validé par (équipe data)"><input id="vi-par" disabled={!f.base_date} value={f.base_valide_par} onChange={(e) => setF({ ...f, base_valide_par: e.target.value })} /></Field>
        <Field label="Validé le"><input id="vi-le" type="date" disabled={!f.base_date} value={f.base_valide_le} onChange={(e) => setF({ ...f, base_valide_le: e.target.value })} /></Field>
        <Field label="Source" hint="Ex. base des cumuls MVE-17 du 29/10, liste linéaire, SitRep."><input id="vi-source" disabled={!f.base_date} value={f.base_source} onChange={(e) => setF({ ...f, base_source: e.target.value })} /></Field>
        {correction && <Field label="Motif de la correction *" hint="Situation de référence déjà validée : motif obligatoire, ancienne et nouvelle valeurs gardées au journal d’audit."><input id="vi-motif" value={f.base_motif} onChange={(e) => setF({ ...f, base_motif: e.target.value })} /></Field>}
      </div>
      {f.base_date && avantRef > 0 && <p className="note tone-warn">{avantRef} fiche(s) de {zs.nom} datée(s) jusqu’au {fmtDate(f.base_date)} ne seront plus additionnées aux cumuls (elles restent visibles et comptent toujours pour la complétude, les investigations et le suivi).</p>}
      {incoherent && <p className="field-error">Décès + guéris dépassent les cas confirmés.</p>}
      {m5Trop && <p className="field-error">Sous-groupes incohérents (PPL, moins de 5 ans ou élèves) : chaque cumul doit rester inférieur au cumul total correspondant, et décès + guéris du sous-groupe ne peuvent pas dépasser ses confirmés.</p>}
      {f.base_date && n(f.base_confirmes) > 0 && <p className="muted small">Létalité initiale : {pct(n(f.base_deces) / n(f.base_confirmes), 1)}</p>}
      <p className="muted small">Pour les AS touchées avant cette date : onglet « Aires de santé », champ « Touchée le ».</p>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!ok || incoherent || m5Trop} onClick={save}>{f.base_date ? 'Enregistrer' : 'Enregistrer sans valeurs initiales'}</button>
      </div>
    </Modal>
  );
}
