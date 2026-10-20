import { useState } from 'react';
import { useStore } from '../store.jsx';
import { DEFAULT_STEPS, CIBLES, renderMessage } from '../domain/reminders.js';
import { Section, Field, Table, Pill } from '../ui.jsx';
import { backupState } from './common.jsx';

const DEST = [['rapporteur', 'Rapporteur titulaire'], ['suppleant', 'Suppléant'], ['epidemiologiste', 'Épidémiologiste'], ['mcz', 'MCZ'], ['team_lead', 'Team Lead'], ['validateur', 'Validateur / resp. sous-pilier'], ['data_manager', 'Data manager']];

/** Redimensionne l'image dans le navigateur (160 px de haut max) pour garder un logo léger. */
function lireLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error('Choisir une image PNG, JPEG, WebP ou SVG'));
    const img = new Image();
    img.onload = () => {
      const h = Math.min(160, img.naturalHeight || 160), w = Math.round((img.naturalWidth || 160) * (h / (img.naturalHeight || 160)));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      const url = c.toDataURL('image/png');
      if (url.length > 300000) return reject(new Error('Image trop lourde même réduite : choisir un logo plus simple'));
      resolve(url);
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = URL.createObjectURL(file);
  });
}

export default function Parametres() {
  const s = useStore();
  const [f, setF] = useState(() => ({ ...s.settings, mise_en_service: s.data.settings?.mise_en_service || '', rappels: (s.settings.rappels?.length ? s.settings.rappels : DEFAULT_STEPS).map((x) => ({ ...x })) }));
  const ro = s.role !== 'admin';
  const setStep = (i, patch) => setF({ ...f, rappels: f.rappels.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const z = s.data.zs[0];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Paramètres</h1>
        <p className="sub">{ro ? 'Lecture seule : seul l’administrateur modifie les paramètres.' : 'Valeurs proposées par le cahier des charges, à valider avec le sous-pilier.'}</p>
      </header>
      <Section title="Province et riposte">
        <div className="form-grid">
          <Field label="Nom de la province"><input id="p-prov" value={f.province_nom || ''} readOnly={ro} onChange={(e) => setF({ ...f, province_nom: e.target.value })} /></Field>
          <Field label="Nom affiché sous le logo"><input id="p-dps" value={f.dps_nom || ''} readOnly={ro} onChange={(e) => setF({ ...f, dps_nom: e.target.value })} /></Field>
          <Field label="Épidémie / événement suivi" hint="Affiché à côté du logo. Ex. MVE-17, Mpox, Choléra"><input id="p-evt" value={f.evenement || ''} readOnly={ro} onChange={(e) => setF({ ...f, evenement: e.target.value })} /></Field>
          <div className="field wide"><span className="field-label">Logo</span>
            <div className="logo-preview">
              {f.logo ? <img src={f.logo} alt="Logo actuel" /> : <span className="muted small">Aucun logo : l’étiquette « {f.evenement || 'MVE-17'} » s’affiche à la place.</span>}
              {!ro && <label className="btn ghost small">Choisir une image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setF({ ...f, logo: await lireLogo(file) }); } catch (x) { s.notify(x.message, 'bad'); } }} /></label>}
              {!ro && f.logo && <button className="btn ghost small" onClick={() => setF({ ...f, logo: '' })}>Retirer</button>}
            </div>
            <span className="field-hint">Affiché dans le menu et sur l’écran de connexion. Utiliser le logo de la DPS ou de la riposte, avec leur accord. Penser à « Enregistrer les paramètres ».</span>
          </div>
          <Field label="Code province" hint="Unique dans le pays (HU, TSH…), bloqué dès la 1re fiche"><input id="p-code" value={f.province_code || ''} readOnly={ro || s.data.reports.length > 0} onChange={(e) => setF({ ...f, province_code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} /></Field>
        </div>
      </Section>
      <Section title="Reporting">
        <div className="form-grid">
          <Field label="Date de mise en service" hint={`Avant cette date, une ZS sans fiche n’est pas comptée « non reçue ». Vide = 1re fiche saisie${s.settings.mise_en_service ? ` (${s.settings.mise_en_service.split('-').reverse().join('/')})` : ''}.`}><input id="p-mes" type="date" value={f.mise_en_service || ''} readOnly={ro} onChange={(e) => setF({ ...f, mise_en_service: e.target.value || '' })} /></Field>
          <Field label="Fuseau horaire" hint="Africa/Lubumbashi = UTC+2 (est de la RDC), Africa/Kinshasa = UTC+1 (ouest)"><input id="p-tz" value={f.fuseau} readOnly={ro} onChange={(e) => setF({ ...f, fuseau: e.target.value })} /></Field>
          <Field label="Heure limite globale"><input id="p-lim" type="time" value={f.heure_limite} readOnly={ro} onChange={(e) => setF({ ...f, heure_limite: e.target.value })} /></Field>
          <Field label="Seuil de taux de suivi" hint="Proposé 80 %, cible 100 %"><input id="p-seuil" type="number" min="0" max="100" value={Math.round(f.seuil_suivi * 100)} readOnly={ro} onChange={(e) => setF({ ...f, seuil_suivi: Number(e.target.value) / 100 })} /></Field>
          <Field label="Jours sans cas avant post-flambée"><input id="p-42" type="number" min="1" value={f.jours_post_flambee} readOnly={ro} onChange={(e) => setF({ ...f, jours_post_flambee: Number(e.target.value) })} /></Field>
          <Field label="Durée de suivi des contacts (jours)"><input id="p-21" type="number" min="1" value={f.duree_suivi} readOnly={ro} onChange={(e) => setF({ ...f, duree_suivi: Number(e.target.value) })} /></Field>
          <Field label="Seuil d’escalade des reports" hint="Nombre de reports avant « Action superviseur requise »"><input id="p-esc" type="number" min="1" value={f.seuil_escalade_reports} readOnly={ro} onChange={(e) => setF({ ...f, seuil_escalade_reports: Number(e.target.value) })} /></Field>
          <Field label="Rappel des reports échus (J+1)"><input id="p-rr" type="time" value={f.heure_rappel_reports} readOnly={ro} onChange={(e) => setF({ ...f, heure_rappel_reports: e.target.value })} /></Field>
          <label className="chk"><input type="checkbox" disabled={ro} checked={f.registres_actifs !== false} onChange={(e) => setF({ ...f, registres_actifs: e.target.checked })} />Registres détaillés (investigations, contacts J1-J21)</label>
        </div>
      </Section>
      <Section title="Canaux d’envoi">
        <div className="form-grid">
          <Field label="WhatsApp" hint="Manuel : le système prépare chaque message avec un lien WhatsApp pré-rempli, l’opérateur l’envoie et coche « Envoyé ».">
            <select id="p-wa" value={f.whatsapp_mode || 'manuel'} disabled={ro} onChange={(e) => setF({ ...f, whatsapp_mode: e.target.value })}>
              <option value="manuel">Envoi manuel assisté (sans WhatsApp Business)</option><option value="api">API WhatsApp Business (automatique)</option>
            </select></Field>
          <label className="chk"><input type="checkbox" disabled={ro} checked={f.email_auto !== false} onChange={(e) => setF({ ...f, email_auto: e.target.checked })} />E-mails automatiques (copie de chaque rappel)</label>
          <label className="chk"><input type="checkbox" disabled={ro} checked={f.whatsapp_groupe !== false} onChange={(e) => setF({ ...f, whatsapp_groupe: e.target.checked })} />Message récapitulatif par étape pour le groupe WhatsApp</label>
          <Field label="Nom du groupe WhatsApp"><input id="p-grp" value={f.whatsapp_groupe_nom || ''} readOnly={ro} onChange={(e) => setF({ ...f, whatsapp_groupe_nom: e.target.value })} /></Field>
          <label className="chk"><input type="checkbox" disabled={ro} checked={!!f.sms_actif} onChange={(e) => setF({ ...f, sms_actif: e.target.checked })} />SMS automatiques (fournisseur requis)</label>
        </div>
      </Section>
      <Section title="Rappels automatiques">
        <Table className="compact">
          <thead><tr><th>Heure</th><th>Libellé</th><th>Cible</th><th>Destinataires</th><th>Liste des manquants</th></tr></thead>
          <tbody>
            {f.rappels.map((st, i) => (
              <tr key={st.id}>
                <td><input id={`r-h-${i}`} type="time" value={st.heure} readOnly={ro} onChange={(e) => setStep(i, { heure: e.target.value })} /></td>
                <td><input id={`r-l-${i}`} value={st.libelle} readOnly={ro} onChange={(e) => setStep(i, { libelle: e.target.value })} /></td>
                <td><select id={`r-c-${i}`} value={st.cible} disabled={ro} onChange={(e) => setStep(i, { cible: e.target.value })}>{Object.entries(CIBLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td><div className="checks tight">{DEST.map(([k, v]) => (
                  <label key={k} className={`chk ${st.destinataires.includes(k) ? 'on' : ''}`}><input type="checkbox" disabled={ro} checked={st.destinataires.includes(k)} onChange={(e) => setStep(i, { destinataires: e.target.checked ? [...st.destinataires, k] : st.destinataires.filter((x) => x !== k) })} />{v}</label>
                ))}</div></td>
                <td><input type="checkbox" disabled={ro} checked={!!st.manquants} onChange={(e) => setStep(i, { manquants: e.target.checked })} aria-label="Inclure les champs manquants" /></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="muted small">Aperçu du message : {renderMessage({ zs: z || { nom: 'Isiro' }, date: s.np.date, etat: 'incomplet', limite: f.heure_limite, manquants: ['Contacts vus', 'RECO actifs'] })}</p>
      </Section>
      {!ro && <div className="actions"><button className="btn ghost" onClick={() => setF({ ...f, rappels: DEFAULT_STEPS.map((x) => ({ ...x })) })}>Horaires du cahier des charges</button><button className="btn primary" onClick={() => s.actions.saveSettings(f)}>Enregistrer les paramètres</button></div>}
      <Section title="Sauvegarde nocturne (Google Drive)">
        {(() => {
          const bk = backupState(s.settings);
          const c = bk.b?.compteurs || {};
          return (
            <>
              <p><Pill tone={bk.tone}>{bk.tone === 'good' ? 'OK' : 'À vérifier'}</Pill> {bk.text}</p>
              {bk.b?.fichier && <p className="muted small">Fichier de restauration : <span className="mono">{bk.b.fichier}</span>{bk.b.duree_s ? ` · ${bk.b.duree_s} s` : ''}{bk.b.dossier_url && <> · <a href={bk.b.dossier_url} target="_blank" rel="noreferrer">ouvrir le dossier Drive</a></>}</p>}
              {Object.keys(c).length > 0 && <p className="muted small">{Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
              <p className="muted small">Chaque nuit vers 23:30, le compte Google de la riposte copie toute la base dans son Drive : un Google Sheet lisible et un fichier .json.gz pour la restauration. 90 nuits gardées, compte rendu par e-mail.</p>
            </>
          );
        })()}
      </Section>
      {s.mode === 'demo' && s.role === 'admin' && (
        <Section title="Démonstration">
          <p className="muted">Régénère le jeu de données fictif à la date du jour (efface les saisies faites pendant la démo).</p>
          <button className="btn ghost" onClick={s.actions.resetDemo}>Régénérer les données de démo</button>
        </Section>
      )}
    </div>
  );
}
