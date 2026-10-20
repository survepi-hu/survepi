import { useState } from 'react';
import { waLink } from '../domain/reminders.js';
import { useStore, ROLES } from '../store.jsx';
import { zsCategory, joursSansCas } from '../domain/indicators.js';
import { fmtDate } from '../domain/time.js';
import { Section, Table, Tabs, Pill, Modal, Field, provinceNom } from '../ui.jsx';
import { CatPill, actorName } from './common.jsx';
import ImportComptes from './ImportComptes.jsx';

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Referentiel() {
  const s = useStore();
  const [tab, setTab] = useState('zs');
  const [ez, setEz] = useState(null);
  const [ea, setEa] = useState(null);
  const [acct, setAcct] = useState(null); // { actor, action, busy, result, error }
  const [imp, setImp] = useState(false);
  const T = s.np.date;
  const canZs = ['admin', 'team_lead'].includes(s.role);
  const canActors = s.role === 'admin';
  const prep = s.data.zs.filter((z) => zsCategory(z, T, s.settings) === 'preparation').length;
  const people = s.data.actors.filter((a) => a.actif !== false);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Zones de santé et acteurs</h1>
        <Tabs value={tab} onChange={setTab} tabs={[['zs', `Zones de santé · ${s.data.zs.length}`], ['acteurs', `Acteurs · ${people.length}`]]} />
      </header>

      {tab === 'zs' && (
        <>
          {prep < 6 && <p className="note tone-warn">{prep} ZS en préparation enregistrée(s) sur 6 prévues : liste à compléter (seule Faradje figure dans les documents).</p>}
          <p className="muted small">Bascule automatique : en préparation → touchée à la date du 1er cas confirmé ; touchée → post-flambée après {s.settings.jours_post_flambee} jours sans nouveau cas.</p>
          <Section aside={canZs && <button className="btn primary" onClick={() => setEz({ nom: '', hotspot: false, frequence: 'quotidienne', jour_hebdo: 1, actif: true, categorie_manuelle: 'preparation' })}>Ajouter une ZS</button>}>
            <Table>
              <thead><tr><th>ZS</th><th>Code DHIS2</th><th>Catégorie</th><th>1er cas confirmé</th><th className="n">Jours sans cas</th><th className="n">AS affectées</th><th>MCZ</th><th>Rapporteur / suppléant</th><th>Fréquence</th><th>Limite</th><th></th></tr></thead>
              <tbody>
                {s.data.zs.map((z) => (
                  <tr key={z.id} className={z.actif === false ? 'off' : ''}>
                    <td><strong>{z.nom}</strong></td>
                    <td className="mono">{z.code_dhis2 || <span className="muted">à saisir</span>}</td>
                    <td><CatPill cat={zsCategory(z, T, s.settings)} hotspot={z.hotspot} /></td>
                    <td>{z.date_premier_cas ? fmtDate(z.date_premier_cas) : '–'}</td>
                    <td className="n">{joursSansCas(z, T) ?? '–'}</td>
                    <td className="n">{z.as_affectees ?? '–'} / {z.as_total ?? '–'}</td>
                    <td>{z.mcz_nom || '–'}<small className="blk muted">{z.mcz_contact}</small></td>
                    <td>{actorName(s, z.rapporteur_id)}<small className="blk muted">{actorName(s, z.suppleant_id)}</small></td>
                    <td>{z.frequence}{z.frequence === 'hebdomadaire' ? ` (j${z.jour_hebdo})` : ''}</td>
                    <td>{z.heure_limite || s.settings.heure_limite}</td>
                    <td>{canZs && <button className="btn ghost small" onClick={() => setEz({ ...z })}>Modifier</button>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        </>
      )}

      {tab === 'acteurs' && (
        <Section aside={canActors && <div className="row"><button className="btn ghost" onClick={() => setImp(true)}>Importer depuis Excel</button><button className="btn primary" onClick={() => setEa({ nom: '', fonction: '', role: 'rapporteur', canal_prefere: 'whatsapp', statut: 'actif', actif: true, zs_ids: [] })}>Ajouter un acteur</button></div>}>
          <Table>
            <thead><tr><th>Nom</th><th>Rôle</th><th>ZS</th><th>WhatsApp / SMS</th><th>E-mail</th><th>Canal</th><th>Statut</th><th>Connexion</th><th></th></tr></thead>
            <tbody>
              {s.data.actors.map((a) => (
                <tr key={a.id} className={a.actif === false ? 'off' : ''}>
                  <td><strong>{a.nom}</strong><small className="blk muted">{a.fonction}{a.organisation ? ` · ${a.organisation}` : ''}</small></td>
                  <td>{ROLES[a.role]}</td>
                  <td>{(a.zs_ids || []).map((id) => s.data.zs.find((z) => z.id === id)?.nom).filter(Boolean).join(', ') || (['team_lead', 'validateur', 'admin', 'data_manager', 'coordination'].includes(a.role) ? 'Province' : '–')}</td>
                  <td>{a.whatsapp || '–'}<small className="blk muted">{a.sms}</small></td>
                  <td>{a.email || '–'}</td>
                  <td>{a.canal_prefere}</td>
                  <td><Pill tone={a.actif === false ? 'muted' : a.statut === 'actif' ? 'good' : 'warn'}>{a.actif === false ? 'Désactivé' : { actif: 'Actif', conge: 'En congé', rotation: 'En rotation' }[a.statut || 'actif']}</Pill></td>
                  <td>{a.user_id ? <Pill tone="good">Compte actif</Pill> : <Pill tone="muted">Pas de compte</Pill>}
                    {(a.date_debut || a.date_fin) && <small className="blk muted">{a.date_debut ? fmtDate(a.date_debut) : ''}{a.date_fin ? ` → ${fmtDate(a.date_fin)}` : ''}</small>}</td>
                  <td className="row-actions">{canActors && (
                    <>
                      {a.actif !== false && (a.user_id
                        ? <button className="btn ghost small" onClick={() => setAcct({ actor: a, action: 'reinitialiser' })}>Nouveau mot de passe</button>
                        : <button className="btn small primary" disabled={!a.email} title={a.email ? '' : 'Ajouter d’abord un e-mail'} onClick={() => setAcct({ actor: a, action: 'creer' })}>Créer le compte</button>)}
                      <button className="btn ghost small" onClick={() => setEa({ ...a })}>Modifier</button>
                    </>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      {ez && (
        <Modal wide title={ez.id ? `Modifier ${ez.nom}` : 'Nouvelle zone de santé'} onClose={() => setEz(null)}>
          <div className="form-grid">
            <Field label="Nom"><input id="z-nom" value={ez.nom} onChange={(e) => setEz({ ...ez, nom: e.target.value })} /></Field>
            <Field label="Code DHIS2"><input id="z-dhis" value={ez.code_dhis2 || ''} onChange={(e) => setEz({ ...ez, code_dhis2: e.target.value })} /></Field>
            <Field label="Catégorie si 1er cas inconnu" hint="La date du 1er cas confirmé prime"><select id="z-cat" value={ez.categorie_manuelle || 'preparation'} onChange={(e) => setEz({ ...ez, categorie_manuelle: e.target.value })}><option value="touchee">Touchée</option><option value="preparation">En préparation</option></select></Field>
            <label className="chk"><input type="checkbox" checked={!!ez.hotspot} onChange={(e) => setEz({ ...ez, hotspot: e.target.checked })} />Hotspot</label>
            <Field label="Date du 1er cas confirmé"><input id="z-d1" type="date" value={ez.date_premier_cas || ''} onChange={(e) => setEz({ ...ez, date_premier_cas: e.target.value || null })} /></Field>
            <Field label="Date du dernier cas confirmé"><input id="z-d2" type="date" value={ez.date_dernier_cas || ''} onChange={(e) => setEz({ ...ez, date_dernier_cas: e.target.value || null })} /></Field>
            <Field label="Aires de santé (total)"><input id="z-ast" type="number" min="0" value={ez.as_total ?? ''} onChange={(e) => setEz({ ...ez, as_total: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Aires de santé affectées"><input id="z-asa" type="number" min="0" value={ez.as_affectees ?? ''} onChange={(e) => setEz({ ...ez, as_affectees: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="MCZ"><input id="z-mcz" value={ez.mcz_nom || ''} onChange={(e) => setEz({ ...ez, mcz_nom: e.target.value })} /></Field>
            <Field label="Contact MCZ (WhatsApp)"><input id="z-mczc" value={ez.mcz_contact || ''} onChange={(e) => setEz({ ...ez, mcz_contact: e.target.value })} /></Field>
            <Field label="Rapporteur titulaire"><select id="z-rap" value={ez.rapporteur_id || ''} onChange={(e) => setEz({ ...ez, rapporteur_id: e.target.value || null })}><option value="">–</option>{people.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></Field>
            <Field label="Rapporteur suppléant"><select id="z-sup" value={ez.suppleant_id || ''} onChange={(e) => setEz({ ...ez, suppleant_id: e.target.value || null })}><option value="">–</option>{people.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></Field>
            <Field label="Épidémiologistes affectés"><input id="z-epi" value={ez.epidemiologistes || ''} onChange={(e) => setEz({ ...ez, epidemiologistes: e.target.value })} /></Field>
            <Field label="DOS affectés"><input id="z-dos" value={ez.dos || ''} onChange={(e) => setEz({ ...ez, dos: e.target.value })} /></Field>
            <Field label="Fréquence"><select id="z-freq" value={ez.frequence} onChange={(e) => setEz({ ...ez, frequence: e.target.value })}><option value="quotidienne">Quotidienne</option><option value="hebdomadaire">Hebdomadaire (ZS en préparation)</option></select></Field>
            {ez.frequence === 'hebdomadaire' && <Field label="Jour du rapport"><select id="z-jour" value={ez.jour_hebdo} onChange={(e) => setEz({ ...ez, jour_hebdo: Number(e.target.value) })}>{['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((j, i) => <option key={j} value={i + 1}>{j}</option>)}</select></Field>}
            <Field label="Heure limite propre" hint={`Vide = ${s.settings.heure_limite}. Les rappels se décalent d’autant.`}><input id="z-lim" type="time" value={ez.heure_limite || ''} onChange={(e) => setEz({ ...ez, heure_limite: e.target.value || null })} /></Field>
            <Field label="Latitude"><input id="z-lat" type="number" step="0.0001" value={ez.lat ?? ''} onChange={(e) => setEz({ ...ez, lat: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Longitude"><input id="z-lon" type="number" step="0.0001" value={ez.lon ?? ''} onChange={(e) => setEz({ ...ez, lon: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <label className="chk"><input type="checkbox" checked={ez.actif !== false} onChange={(e) => setEz({ ...ez, actif: e.target.checked })} />ZS active</label>
          </div>
          <div className="actions"><button className="btn primary" disabled={!ez.nom.trim()} onClick={async () => {
            if (ez.id) await s.actions.update('zs', ez.id, ez, 'ZS mise à jour');
            else await s.actions.insert('zs', { ...ez, id: slug(ez.nom) }, 'ZS ajoutée');
            setEz(null);
          }}>Enregistrer</button></div>
        </Modal>
      )}

      {ea && (
        <Modal wide title={ea.id ? `Modifier ${ea.nom}` : 'Nouvel acteur'} onClose={() => setEa(null)}>
          <div className="form-grid">
            <Field label="Nom complet"><input id="a-nom" value={ea.nom} onChange={(e) => setEa({ ...ea, nom: e.target.value })} /></Field>
            <Field label="Fonction"><input id="a-fct" value={ea.fonction} onChange={(e) => setEa({ ...ea, fonction: e.target.value })} /></Field>
            <Field label="Organisation"><input id="a-org" value={ea.organisation || ''} onChange={(e) => setEa({ ...ea, organisation: e.target.value })} /></Field>
            <Field label="Rôle dans le logiciel"><select id="a-role" value={ea.role} onChange={(e) => setEa({ ...ea, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="WhatsApp" hint="Format international, ex. +243 81 …"><input id="a-wa" value={ea.whatsapp || ''} onChange={(e) => setEa({ ...ea, whatsapp: e.target.value })} /></Field>
            <Field label="SMS"><input id="a-sms" value={ea.sms || ''} onChange={(e) => setEa({ ...ea, sms: e.target.value })} /></Field>
            <Field label="E-mail"><input id="a-mail" type="email" value={ea.email || ''} onChange={(e) => setEa({ ...ea, email: e.target.value })} /></Field>
            <Field label="Canal préféré"><select id="a-canal" value={ea.canal_prefere} onChange={(e) => setEa({ ...ea, canal_prefere: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">E-mail</option><option value="in_app">Dans l’application</option></select></Field>
            <Field label="Disponible de"><input id="a-d1" type="time" value={ea.dispo_debut || '07:00'} onChange={(e) => setEa({ ...ea, dispo_debut: e.target.value })} /></Field>
            <Field label="à"><input id="a-d2" type="time" value={ea.dispo_fin || '19:00'} onChange={(e) => setEa({ ...ea, dispo_fin: e.target.value })} /></Field>
            <Field label="Statut"><select id="a-st" value={ea.statut || 'actif'} onChange={(e) => setEa({ ...ea, statut: e.target.value })}><option value="actif">Actif</option><option value="conge">En congé</option><option value="rotation">En rotation</option></select></Field>
            <Field label="Début"><input id="a-db" type="date" value={ea.date_debut || ''} onChange={(e) => setEa({ ...ea, date_debut: e.target.value || null })} /></Field>
            <Field label="Fin"><input id="a-df" type="date" value={ea.date_fin || ''} onChange={(e) => setEa({ ...ea, date_fin: e.target.value || null })} /></Field>
            <label className="chk"><input type="checkbox" checked={ea.actif !== false} onChange={(e) => setEa({ ...ea, actif: e.target.checked })} />Compte actif (désactiver sans supprimer l’historique)</label>
            <div className="field wide"><span className="field-label">ZS affectées</span>
              <div className="checks">{s.data.zs.map((z) => (
                <label key={z.id} className={`chk ${(ea.zs_ids || []).includes(z.id) ? 'on' : ''}`}><input type="checkbox" checked={(ea.zs_ids || []).includes(z.id)} onChange={(e) => setEa({ ...ea, zs_ids: e.target.checked ? [...(ea.zs_ids || []), z.id] : ea.zs_ids.filter((x) => x !== z.id) })} />{z.nom}</label>
              ))}</div></div>
          </div>
          <div className="actions"><button className="btn primary" disabled={!ea.nom.trim() || !ea.fonction.trim()} onClick={async () => {
            const { zs_ids, ...row } = ea;
            const saved = ea.id ? await s.actions.update('actors', ea.id, row) : await s.actions.insert('actors', row);
            await s.actions.saveAssignments(saved.id, zs_ids || []);
            setEa(null);
            if (!ea.id && saved.email) setAcct({ actor: saved, action: 'creer' }); // proposer la création du compte tout de suite
          }}>Enregistrer</button></div>
        </Modal>
      )}
      {imp && <ImportComptes onClose={() => setImp(false)} />}
      {acct && (() => {
        const a = acct.actor;
        const creer = acct.action === 'creer';
        const r = acct.result;
        const texte = r ? `SurvEpi ${provinceNom(s.settings)}\nAdresse : ${location.origin}\nIdentifiant : ${r.email}\nMot de passe provisoire : ${r.mot_de_passe}\nÀ la première connexion, choisissez votre propre mot de passe.` : '';
        const go = async () => {
          setAcct({ ...acct, busy: true, error: null });
          try { setAcct({ ...acct, busy: false, result: await s.actions.accountAction(acct.action, a.id) }); }
          catch (e) { setAcct({ ...acct, busy: false, error: e.message }); }
        };
        const copy = async () => { try { await navigator.clipboard.writeText(texte); s.notify('Identifiants copiés'); } catch { s.notify('Copie refusée : sélectionner le texte', 'bad'); } };
        return (
          <Modal title={creer ? `Créer le compte de ${a.nom}` : `Nouveau mot de passe pour ${a.nom}`} onClose={() => setAcct(null)}>
            {!r ? (
              <>
                <p>{creer ? 'Un compte de connexion va être créé avec cette adresse :' : 'Un nouveau mot de passe provisoire va remplacer l’actuel pour :'} <strong>{a.email}</strong></p>
                <p className="muted small">Rôle : {ROLES[a.role]}. Le mot de passe provisoire s’affiche une seule fois. À sa première connexion, la personne devra choisir le sien.</p>
                {acct.error && <p className="field-error">{acct.error}</p>}
                <div className="actions"><button className="btn ghost" onClick={() => setAcct(null)}>Annuler</button>
                  <button className="btn primary" disabled={acct.busy} onClick={go}>{acct.busy ? 'En cours…' : creer ? 'Créer le compte' : 'Générer le mot de passe'}</button></div>
              </>
            ) : (
              <>
                <p className="note">{r.deja_existant ? 'Un compte existait déjà pour cette adresse : il est maintenant rattaché à cet acteur. ' : ''}{r.email_envoye ? `Les identifiants ont été envoyés par e-mail à ${r.email}.` : 'Aucun e-mail envoyé : transmettre les identifiants ci-dessous à la personne.'}</p>
                <dl className="creds">
                  <dt>Identifiant</dt><dd className="mono">{r.email}</dd>
                  <dt>Mot de passe provisoire</dt><dd className="mono big">{r.mot_de_passe}</dd>
                </dl>
                <p className="muted small">Ce mot de passe ne sera plus affiché. En cas d’oubli, utiliser « Nouveau mot de passe ».</p>
                <div className="actions">
                  <button className="btn ghost" onClick={copy}>Copier les identifiants</button>
                  {(a.whatsapp || a.sms) && <a className="btn ghost" href={waLink(a.whatsapp || a.sms, texte)} target="_blank" rel="noreferrer">Envoyer par WhatsApp</a>}
                  <button className="btn primary" onClick={() => setAcct(null)}>Terminé</button>
                </div>
              </>
            )}
          </Modal>
        );
      })()}
    </div>
  );
}
