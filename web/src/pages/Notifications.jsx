import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { DEFAULT_STEPS, CIBLES, recipientsFor } from '../domain/reminders.js';
import { isComplete, isSubmitted } from '../domain/report.js';
import { isExpected, deadlineOf } from '../domain/indicators.js';
import { addDays, fmtDate, hhmmToMin, minToHhmm } from '../domain/time.js';
import { Section, Table, Pill, Empty, Band } from '../ui.jsx';
import { copyTable } from '../export.js';
import { zsName, actorName } from './common.jsx';

const OPERATEURS = ['data_manager', 'team_lead', 'validateur', 'admin'];

/** File d'envoi manuel WhatsApp : le système prépare, un opérateur envoie et coche. */
function WhatsAppQueue() {
  const s = useStore();
  const queue = s.data.notifications.filter((n) => n.mode === 'manuel' && n.statut === 'a_envoyer')
    .sort((a, b) => (a.destinataire_id === 'groupe' ? -1 : b.destinataire_id === 'groupe' ? 1 : (a.prevu_a || '') < (b.prevu_a || '') ? -1 : 1));
  const copy = async (n) => {
    try { await navigator.clipboard.writeText(n.message); s.notify('Message copié'); }
    catch { const ok = await copyTable([{ m: n.message }]); s.notify(ok ? 'Message copié' : 'Copie refusée : sélectionner le texte', ok ? 'good' : 'bad'); }
  };
  return (
    <Section title={`WhatsApp à envoyer · ${queue.length}`} aside={<span className="muted small">Ouvrir WhatsApp, envoyer, puis cocher « Envoyé ». Les e-mails, eux, partent seuls.</span>}>
      {queue.length === 0 ? <Empty>Aucun message WhatsApp en attente.</Empty> : (
        <ul className="wa-queue">
          {queue.map((n) => (
            <li key={n.id} className={n.destinataire_id === 'groupe' ? 'wa-group' : ''}>
              <div className="wa-head">
                <span className="mono">{n.prevu_a || ''}</span>
                <strong>{n.nom}</strong>
                <span className="muted">{n.destinataire_id === 'groupe' ? 'message récapitulatif, choisir le groupe dans WhatsApp' : `${n.role || ''} · ${n.adresse || 'numéro manquant'}`}</span>
                {n.zs_id && <Pill tone="muted">{zsName(s, n.zs_id)}</Pill>}
              </div>
              <p className="wa-msg">{n.message}</p>
              <div className="row-actions">
                <a className="btn small primary" href={n.lien} target="_blank" rel="noreferrer">Ouvrir WhatsApp</a>
                <button className="btn small ghost" onClick={() => copy(n)}>Copier</button>
                <button className="btn small ghost" onClick={() => s.actions.markSent(n, 'echec')}>Échec / injoignable</button>
                <button className="btn small" onClick={() => s.actions.markSent(n)}>Envoyé</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const STEP_LABEL = Object.fromEntries(DEFAULT_STEPS.map((x) => [x.id, x.libelle]));

export default function Notifications() {
  const s = useStore();
  const [fd, setFd] = useState(s.date);
  const [fst, setFst] = useState('');
  const steps = s.settings.rappels?.length ? s.settings.rappels : DEFAULT_STEPS;
  const isToday = s.date === s.np.date;
  const mine = (n) => s.isProvince || n.destinataire_id === s.user.id || s.myZs.includes(n.zs_id);
  const log = s.data.notifications.filter((n) => mine(n) && (!fd || n.date === fd) && (!fst || n.statut === fst));
  const dayAll = s.data.notifications.filter((n) => mine(n) && n.date === fd);

  // Ce qui partirait à chaque étape si rien ne change (aujourd'hui)
  const preview = useMemo(() => {
    if (!isToday) return [];
    return steps.map((st) => {
      const zones = s.visibleZs.filter((z) => {
        if (!isExpected(z, s.np.date, s.settings)) return false;
        const r = s.idx.get(`${s.np.date}|${z.id}`);
        const prev = s.idx.get(`${addDays(s.np.date, -1)}|${z.id}`);
        if (isSubmitted(r) && isComplete(r, { prev, seuilSuivi: s.settings.seuil_suivi })) return false;
        if (st.cible === 'sans_rapport' && isSubmitted(r)) return false;
        return true;
      });
      const at = hhmmToMin(st.heure);
      const sent = s.data.notifications.filter((n) => n.date === s.np.date && n.step === st.id).length;
      return { st, at, zones, sent, passed: s.np.minutes >= at };
    });
  }, [isToday, steps, s]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Notifications et rappels</h1>
        <p className="sub">{(s.settings.whatsapp_mode || 'manuel') === 'manuel' ? 'E-mails envoyés automatiquement. WhatsApp préparés par le système et envoyés à la main par l’opérateur.' : 'WhatsApp en principal, SMS en secours, e-mail en copie.'} Les rappels s’arrêtent dès qu’une fiche complète est soumise.</p>
      </header>

      {isToday && s.isProvince && (
        <Section title="Programme du jour" aside={s.mode === 'demo' && ['admin', 'team_lead'].includes(s.role) && (
          <button className="btn ghost" onClick={async () => { const rows = await s.actions.runReminders(); const m = rows.filter((x) => x.mode === 'manuel').length; s.notify(rows.length ? `${rows.length - m} e-mail(s) envoyé(s), ${m} WhatsApp à envoyer` : 'Aucun rappel dû à cette heure'); }}>Exécuter le planificateur maintenant</button>)}>
          <ol className="timeline">
            {preview.map(({ st, at, zones, sent, passed }) => (
              <li key={st.id} className={passed ? 'passed' : ''}>
                <span className="tl-time">{st.heure}</span>
                <div>
                  <strong>{st.libelle}</strong> <span className="muted">{CIBLES[st.cible]} · {st.destinataires.join(', ')}</span>
                  <p>{passed ? `${sent} message(s) envoyé(s).` : zones.length ? `Si rien ne change : ${zones.map((z) => z.nom).join(', ')} (${zones.reduce((a, z) => a + recipientsFor(st, z, s.data.actors).length, 0)} destinataires).` : 'Aucune ZS concernée à ce stade.'}</p>
                </div>
              </li>
            ))}
            <li className={s.np.minutes >= hhmmToMin(s.settings.heure_limite) ? 'passed' : ''}><span className="tl-time">{s.settings.heure_limite}</span><div><strong>Heure limite</strong> <span className="muted">calcul de la promptitude (heure serveur)</span></div></li>
          </ol>
          {s.visibleZs.some((z) => z.heure_limite) && <p className="muted small">ZS avec heure limite propre : {s.visibleZs.filter((z) => z.heure_limite).map((z) => `${z.nom} ${minToHhmm(deadlineOf(z, s.settings))}`).join(', ')}. Leurs rappels sont décalés d’autant.</p>}
        </Section>
      )}

      {OPERATEURS.includes(s.role) && <WhatsAppQueue />}

      <Band items={[
        { label: `Messages du ${fmtDate(fd)}`, value: dayAll.length },
        { label: 'Lus', value: dayAll.filter((n) => n.statut === 'lu').length },
        { label: 'Envoyés', value: dayAll.filter((n) => n.statut === 'envoye').length },
        { label: 'WhatsApp à envoyer', value: dayAll.filter((n) => n.statut === 'a_envoyer').length, tone: dayAll.some((n) => n.statut === 'a_envoyer') ? 'warn' : null },
        { label: 'Échecs', value: dayAll.filter((n) => n.statut === 'echec').length, tone: dayAll.some((n) => n.statut === 'echec') ? 'bad' : null },
      ]} />

      <div className="filters">
        <input id="n-date" type="date" value={fd} max={s.np.date} onChange={(e) => setFd(e.target.value)} aria-label="Date" />
        <select id="n-st" value={fst} onChange={(e) => setFst(e.target.value)} aria-label="Statut"><option value="">Tous statuts</option><option value="a_envoyer">À envoyer (WhatsApp)</option><option value="envoye">Envoyé</option><option value="lu">Lu</option><option value="echec">Échec</option><option value="en_attente">En attente</option></select>
      </div>
      <Section title="Journal">
        {log.length === 0 ? <Empty>Aucun message pour ces filtres.</Empty> : (
          <Table>
            <thead><tr><th>Heure</th><th>ZS</th><th>Étape</th><th>Destinataire</th><th>Canal</th><th>Statut</th><th>Message</th></tr></thead>
            <tbody>
              {log.slice(0, 300).map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.prevu_a || (n.sent_at || '').slice(11, 16)}</td>
                  <td>{n.zs_id ? zsName(s, n.zs_id) : '–'}</td>
                  <td>{STEP_LABEL[n.step] || n.step}</td>
                  <td>{n.nom}<small className="blk muted">{n.role}</small></td>
                  <td>{n.canal}{n.mode === 'manuel' && <Pill tone="muted">manuel</Pill>}<small className="blk muted">{n.adresse}</small></td>
                  <td><Pill tone={n.statut === 'echec' ? 'bad' : n.statut === 'lu' ? 'good' : n.statut === 'a_envoyer' ? 'warn' : n.statut === 'en_attente' ? 'pending' : 'muted'}>{n.statut === 'a_envoyer' ? 'à envoyer' : n.statut}</Pill>{n.envoye_par && <small className="blk muted">par {actorName(s, n.envoye_par)}</small>}{n.erreur && <small className="blk muted">{n.erreur}</small>}</td>
                  <td className="msg">{n.message}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
