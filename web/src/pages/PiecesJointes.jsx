import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Section, Modal } from '../ui.jsx';
import { preparer, tailleTexte, TYPES_ACCEPTES } from '../pieces.js';
import { actorName } from './common.jsx';

const estImage = (a) => /^image\/(jpeg|png|webp)$/.test(a.type);

/** Vignette : l'image elle-même (lien signé, 1 h) ou une étiquette PDF / fichier. */
function Vignette({ att, onOpen }) {
  const s = useStore();
  const [url, setUrl] = useState(null);
  useEffect(() => { let ok = true; if (estImage(att)) s.actions.attachmentUrl(att).then((u) => ok && setUrl(u), () => {}); return () => { ok = false; }; }, [att.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" className="pj-vignette" onClick={onOpen} title={`Ouvrir ${att.nom}`}>
      {url ? <img src={url} alt={att.nom} loading="lazy" /> : <span className="pj-type">{att.type === 'application/pdf' ? 'PDF' : (att.nom.split('.').pop() || 'Fichier').toUpperCase()}</span>}
    </button>
  );
}

/**
 * Pièces jointes d'une fiche journalière : scans / photos de la fiche papier, plusieurs fichiers.
 * report : la fiche enregistrée (null tant que le brouillon n'existe pas).
 */
export default function PiecesJointes({ report, peutAjouter }) {
  const s = useStore();
  const [envoi, setEnvoi] = useState(null); // { fait, total }
  const [vue, setVue] = useState(null);     // { att, url }
  const [aSupprimer, setASupprimer] = useState(null);
  const liste = report ? (s.data.attachments || []).filter((a) => a.report_id === report.id) : [];
  const chef = ['admin', 'team_lead', 'data_manager'].includes(s.role);
  const valide = report && ['valide_zs', 'valide_prov'].includes(report.statut);
  const peutSupprimer = (a) => chef || (a.uploaded_by === s.user.id && !valide);

  const ajouter = async (files) => {
    if (!files.length) return;
    const prets = [], refus = [];
    setEnvoi({ fait: 0, total: files.length, etape: 'Préparation' });
    for (const f of files) { try { prets.push({ prepare: await preparer(f) }); } catch (e) { refus.push(e.message); } }
    if (refus.length) s.notify(refus.join(' · '), 'bad');
    if (prets.length) {
      setEnvoi({ fait: 0, total: prets.length, etape: 'Envoi' });
      await s.actions.uploadAttachments(report, prets, (fait) => setEnvoi({ fait, total: prets.length, etape: 'Envoi' }));
    }
    setEnvoi(null);
  };
  const ouvrir = async (att) => {
    try {
      const url = await s.actions.attachmentUrl(att);
      if (estImage(att)) setVue({ att, url }); else window.open(url, '_blank', 'noopener');
    } catch (e) { s.notify(`Ouverture impossible : ${e.message}`, 'bad'); }
  };

  return (
    <Section title={`Fiche papier et pièces jointes${liste.length ? ` · ${liste.length}` : ''}`}>
      {!report ? <p className="muted">Enregistrez d’abord le brouillon : vous pourrez ensuite joindre la photo ou le scan de la fiche papier.</p> : (
        <>
          {liste.length === 0 && <p className="muted">Aucune pièce jointe. Photo ou scan de la fiche remplie, PDF : plusieurs fichiers possibles.</p>}
          {liste.length > 0 && (
            <ul className="pj-liste">
              {liste.map((a) => (
                <li key={a.id}>
                  <Vignette att={a} onOpen={() => ouvrir(a)} />
                  <div className="pj-info">
                    <button type="button" className="linklike" onClick={() => ouvrir(a)}>{a.nom}</button>
                    <small className="muted">{tailleTexte(a.taille)} · {actorName(s, a.uploaded_by)} · {new Date(a.uploaded_at).toLocaleString('fr-FR', { timeZone: s.settings.fuseau, dateStyle: 'short', timeStyle: 'short' })}</small>
                    {a.description && <small>{a.description}</small>}
                  </div>
                  {peutSupprimer(a) && <button type="button" className="btn ghost small" onClick={() => setASupprimer(a)}>Supprimer</button>}
                </li>
              ))}
            </ul>
          )}
          {peutAjouter && (
            <div className="row">
              <label className="btn primary">Prendre une photo<input type="file" accept="image/*" capture="environment" hidden disabled={!!envoi} onChange={(e) => { ajouter([...e.target.files]); e.target.value = ''; }} /></label>
              <label className="btn ghost">Ajouter des fichiers<input type="file" accept={TYPES_ACCEPTES} multiple hidden disabled={!!envoi} onChange={(e) => { ajouter([...e.target.files]); e.target.value = ''; }} /></label>
              {envoi && <span className="muted small">{envoi.etape}… {envoi.fait} / {envoi.total}</span>}
            </div>
          )}
          <p className="muted small">Photos réduites automatiquement avant l’envoi (lisibles, plus légères pour le réseau). PDF et images : 10 Mo maximum par fichier. Visibles par les mêmes personnes que la fiche.</p>
        </>
      )}
      {vue && (
        <Modal wide title={vue.att.nom} onClose={() => setVue(null)}>
          <img className="pj-grande" src={vue.url} alt={vue.att.nom} />
          <div className="actions"><a className="btn ghost" href={vue.url} target="_blank" rel="noreferrer">Ouvrir en plein écran</a></div>
        </Modal>
      )}
      {aSupprimer && (
        <Modal title="Supprimer la pièce jointe ?" onClose={() => setASupprimer(null)}>
          <p>« {aSupprimer.nom} » sera supprimée. La suppression est inscrite dans le journal d’audit.</p>
          <div className="actions"><button className="btn ghost" onClick={() => setASupprimer(null)}>Annuler</button>
            <button className="btn primary" onClick={async () => { const a = aSupprimer; setASupprimer(null); try { await s.actions.deleteAttachment(a); } catch { /* affiché */ } }}>Supprimer</button></div>
        </Modal>
      )}
    </Section>
  );
}
