// Fonction Edge « rappels » : appelée toutes les 5 min par pg_cron.
// Réutilise le moteur de rappels du front (copié dans ../_shared/domain par `npm run sync-shared`).
//
// Variables d'environnement (supabase secrets set ...) :
// Mode par défaut (settings.whatsapp_mode = "manuel") : aucun compte WhatsApp Business.
//   Les messages WhatsApp sont enregistrés « à envoyer » avec un lien wa.me pré-rempli ;
//   un opérateur les envoie depuis la page Notifications. Les e-mails partent automatiquement.
// Variables d'environnement :
//   GMAIL_USER, GMAIL_APP_PASSWORD              (e-mails automatiques via Gmail, obligatoire)
//   MAIL_FROM_NAME                              (facultatif ; sinon « SurvEpi » + settings.province_nom)
// Gmail passe par le port 465 (SSL) : Supabase bloque 25 et 587 en sortie.
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (seulement si whatsapp_mode = "api")
//   SMS_PROVIDER = "africastalking" | "twilio"
//   AT_USERNAME, AT_API_KEY, AT_SENDER          (Africa's Talking)
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM       (Twilio)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.15';
import { planReminders, planDeferralReminders, planEventAlerts, dispatch, toNotifRow } from '../_shared/domain/reminders.js';
import { addDays, localParts } from '../_shared/domain/time.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

type Msg = { canal: string; adresse: string | null; secours?: string | null; copie_email?: string | null; message: string };

async function sendWhatsApp(to: string, text: string) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: to.replace(/[^\d]/g, ''), type: 'template',
      template: { name: env('WHATSAPP_TEMPLATE') || 'rappel_survepi', language: { code: 'fr' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 1000) }] }] },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `WhatsApp HTTP ${r.status}`);
  return j?.messages?.[0]?.id as string;
}

async function sendSms(to: string, text: string) {
  if (env('SMS_PROVIDER') === 'twilio') {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_SID')}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${env('TWILIO_SID')}:${env('TWILIO_TOKEN')}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: env('TWILIO_FROM'), Body: text }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.message ?? `Twilio HTTP ${r.status}`);
    return j.sid as string;
  }
  const r = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey: env('AT_API_KEY'), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: env('AT_USERNAME'), to, message: text, ...(env('AT_SENDER') ? { from: env('AT_SENDER') } : {}) }),
  });
  const j = await r.json();
  const rec = j?.SMSMessageData?.Recipients?.[0];
  if (!r.ok || !rec || rec.statusCode >= 300) throw new Error(rec?.status ?? `SMS HTTP ${r.status}`);
  return rec.messageId as string;
}

// Envoi : Gmail par défaut (GMAIL_USER + GMAIL_APP_PASSWORD). Autre fournisseur SMTP possible sans toucher au code :
// SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, MAIL_FROM (adresse d'expédition).
const smtpUser = () => env('SMTP_USER') || env('GMAIL_USER');
const smtpPass = () => env('SMTP_PASS') || env('GMAIL_APP_PASSWORD');
const mailFrom = () => env('MAIL_FROM') || env('GMAIL_USER') || smtpUser();
const smtpTransport = () => {
  const port = Number(env('SMTP_PORT') || 465);
  return nodemailer.createTransport({ host: env('SMTP_HOST') || 'smtp.gmail.com', port, secure: port === 465, auth: { user: smtpUser(), pass: smtpPass() } });
};
let mailer: ReturnType<typeof nodemailer.createTransport> | null = null;
let appNom = 'SurvEpi Haut-Uélé';   // remplacé par settings.province_nom à chaque passage
async function sendEmail(to: string, text: string) {
  if (!smtpUser() || !smtpPass()) throw new Error('E-mail non configuré : GMAIL_USER / GMAIL_APP_PASSWORD (ou SMTP_*)');
  mailer ??= smtpTransport();
  const info = await mailer.sendMail({
    from: `"${env('MAIL_FROM_NAME') || appNom}" <${mailFrom()}>`,
    to, subject: text.split('. ')[0].slice(0, 140), text,
  });
  return info.messageId as string;
}

/** Canal principal, puis SMS de secours, e-mail en copie. */
async function deliver(m: Msg) {
  let provider_id: string | null = null, canal = m.canal, erreur: string | null = null;
  try {
    if (!m.adresse) throw new Error('Adresse manquante');
    if (m.canal === 'whatsapp') provider_id = await sendWhatsApp(m.adresse, m.message);
    else if (m.canal === 'sms') provider_id = await sendSms(m.adresse, m.message);
    else if (m.canal === 'email') provider_id = await sendEmail(m.adresse, m.message);
    else provider_id = 'in_app';
  } catch (e) {
    erreur = String((e as Error).message);
    if (m.secours && m.canal !== 'sms') {
      try { provider_id = await sendSms(m.secours, m.message); canal = 'sms (secours)'; erreur = null; }
      catch (e2) { erreur += ` | SMS : ${(e2 as Error).message}`; }
    }
  }
  if (m.copie_email) { try { await sendEmail(m.copie_email, m.message); } catch { /* copie facultative */ } }
  return { provider_id, canal, erreur };
}

const masque = (a: string) => (a ? a.replace(/^(.{3}).*(@.*)$/, '$1…$2') : '');

Deno.serve(async (req) => {
  const now = new Date();
  const url = new URL(req.url);
  // Diagnostic (sans aucun secret) et e-mail de test : réservés à la clé de service (le planificateur)
  if (url.searchParams.has('diag') || url.searchParams.has('test')) {
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    // verify_jwt=true : la passerelle a déjà vérifié la signature ; on exige le rôle service_role.
    let roleJwt = '';
    try { roleJwt = JSON.parse(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { /* pas un JWT */ }
    if (!bearer || (bearer !== env('SUPABASE_SERVICE_ROLE_KEY') && roleJwt !== 'service_role')) return new Response('Réservé au service', { status: 403 });
    const diag = { email_configure: !!(smtpUser() && smtpPass()), serveur: env('SMTP_HOST') || 'smtp.gmail.com', expediteur: masque(mailFrom()) };
    if (!url.searchParams.has('test')) return Response.json(diag);
    const to = url.searchParams.get('to') || mailFrom();
    try { const id = await sendEmail(to, `Test SurvEpi : envoi automatique des e-mails. Ce message confirme que les rappels et alertes partiront bien par e-mail. Envoyé le ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.`); return Response.json({ ...diag, test: 'envoye', id }); }
    catch (e) { return Response.json({ ...diag, test: 'echec', erreur: String((e as Error).message) }); }
  }
  const { data: s } = await db.from('settings').select('key,value');
  const settings: Record<string, unknown> = Object.fromEntries((s ?? []).map((x) => [x.key, x.value]));
  const tz = (settings.fuseau as string) || 'Africa/Lubumbashi';
  if (settings.province_nom) appNom = `SurvEpi ${settings.province_nom}`;
  const today = localParts(now, tz).date;

  const [{ data: zs }, { data: actors }, { data: asg }, { data: reports }, { data: sent }, { data: deferrals }] = await Promise.all([
    db.from('health_zones').select('*').eq('actif', true),
    db.from('actors').select('*').eq('actif', true),
    db.from('assignments').select('*'),
    db.from('daily_reports').select('*').gte('date', addDays(today, -1)).lte('date', today),
    // clés déjà traitées : 7 jours (les alertes sur événement ont des clés indépendantes du jour)
    db.from('notifications').select('key').gte('created_at', new Date(now.getTime() - 7 * 864e5).toISOString()),
    db.from('deferrals').select('*').eq('apure', false),
  ]);
  const depuis = new Date(now.getTime() - 2 * 864e5).toISOString();
  const seuil = Number(settings.seuil_escalade_reports ?? 2);
  const [{ data: validations }, { data: repsVal }, { data: invs }, { data: cts }] = await Promise.all([
    db.from('validations').select('*').gte('at', depuis),
    db.from('daily_reports').select('id,zs_id,date,statut,submitted_at,resubmitted_at,updated_by,validated_zs_by').gte('updated_at', depuis),
    db.from('investigations').select('id,code,zs_id,statut,nb_reports').gte('nb_reports', seuil),
    db.from('contacts').select('id,code,zs_id,statut,nb_reports').gte('nb_reports', seuil),
  ]);
  const actorsWithZs = (actors ?? []).map((a) => ({ ...a, zs_ids: (asg ?? []).filter((x) => x.actor_id === a.id).map((x) => x.zs_id) }));
  const sentKeys = new Set((sent ?? []).map((x) => x.key));

  const dryRun = url.searchParams.get('dry') === '1';
  const plan = [
    ...planReminders({ now, zsList: zs ?? [], actors: actorsWithZs, reports: reports ?? [], settings, sentKeys }),
    ...planDeferralReminders({ now, deferrals: deferrals ?? [], actors: actorsWithZs, zsList: zs ?? [], settings, sentKeys }),
  ];
  const evenements = planEventAlerts({ now, validations: validations ?? [], reports: [...(repsVal ?? []), ...(reports ?? [])], investigations: invs ?? [], contacts: cts ?? [],
    actors: actorsWithZs, zsList: zs ?? [], settings, sentKeys });
  if (dryRun) return Response.json({ now, rows: [...dispatch(plan, settings), ...evenements] });

  const rows = [...dispatch(plan, settings), ...evenements];
  const results = [];
  for (const row of rows) {
    // Réserver la clé d'abord : si deux exécutions se chevauchent, une seule traite la ligne.
    // Seules les colonnes de la table sont enregistrées (avant : le rôle et l'heure prévue faisaient échouer
    // l'enregistrement, et donc l'envoi, sans bruit).
    const { error: dup } = await db.from('notifications').insert(toNotifRow(row as Record<string, unknown>));
    if (dup) { if (dup.code !== '23505') console.error('notifications', row.key, dup.message); continue; } // 23505 : déjà traitée
    if (row.mode === 'manuel' || row.statut !== 'en_attente') continue; // manuel : file « à envoyer »
    const r = await deliver({ canal: row.canal, adresse: row.adresse, secours: (row as Record<string, unknown>).secours as string | null, message: row.message });
    await db.from('notifications').update({
      statut: r.erreur ? 'echec' : 'envoye', erreur: r.erreur, provider_id: r.provider_id, canal: r.canal, sent_at: new Date().toISOString(),
    }).eq('key', row.key);
    results.push({ key: row.key, ...r });
  }
  // Échecs : notification interne à l'administrateur
  const failed = results.filter((r) => r.erreur);
  if (failed.length) {
    // e-mail aux administrateurs (si l'échec ne vient pas de l'e-mail lui-même), plus la notification interne
    const admins = (actors ?? []).filter((a) => a.role === 'admin' && a.email);
    if (smtpUser() && smtpPass()) for (const a of admins) { try { await sendEmail(a.email, `SurvEpi : ${failed.length} rappel(s) en échec. Erreurs : ${[...new Set(failed.map((f) => f.erreur))].slice(0, 3).join(' ; ')}. Voir la page Notifications.`); } catch { /* journal interne ci-dessous */ } }
    await db.from('notifications').insert({
      key: `${today}|echecs|${now.toISOString().slice(0, 16)}`, date: today, step: 'echec_envoi', type: 'echec_envoi',
      destinataire_id: 'admin', nom: 'Administrateur', canal: 'in_app', message: `${failed.length} rappel(s) en échec. Voir le journal des notifications.`, statut: 'envoye',
    });
  }
  return Response.json({ automatiques: results.length, echecs: failed.length, whatsapp_a_envoyer: rows.filter((r) => r.mode === 'manuel').length });
});
