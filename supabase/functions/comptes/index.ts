// Fonction Edge « comptes » : création et réinitialisation des comptes de connexion.
// Appelée depuis la page « ZS & acteurs » par un administrateur connecté.
// La clé service_role reste ici, côté serveur ; le navigateur n'envoie que le jeton de l'utilisateur.
//
// Corps attendu : { action: "creer" | "reinitialiser", actor_id: "<uuid>", envoyer_email?: boolean, app_url?: string }
// Réponse : { ok: true, email, mot_de_passe, email_envoye, deja_existant }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.15';

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Mot de passe provisoire lisible : 3 blocs de 4 caractères sans lettres ambiguës. */
function motDePasse() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
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

async function nomApp() {
  const { data } = await admin.from('settings').select('value').eq('key', 'province_nom').maybeSingle();
  return `SurvEpi ${data?.value || 'Haut-Uélé'}`;
}

async function envoyerIdentifiants(to: string, nom: string, mdp: string, appUrl: string) {
  if (!smtpUser() || !smtpPass()) return false;
  const app = await nomApp();
  const t = smtpTransport();
  await t.sendMail({
    from: `"${env('MAIL_FROM_NAME') || app}" <${mailFrom()}>`,
    to,
    subject: `Votre accès à ${app}`,
    text: `Bonjour ${nom},\n\nVotre compte SurvEpi est prêt.\n\nAdresse : ${appUrl || '(lien communiqué par l’administrateur)'}\nIdentifiant : ${to}\nMot de passe provisoire : ${mdp}\n\nÀ la première connexion, l’application vous demandera de choisir votre propre mot de passe.\n\n${app}`,
  });
  return true;
}

async function trouverParEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // 1. Qui appelle ? Seul un administrateur actif peut gérer les comptes.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who?.user) return json({ ok: false, erreur: 'Session expirée : reconnectez-vous.' }, 401);
    const { data: appelant } = await admin.from('actors').select('id, role, actif').eq('user_id', who.user.id).maybeSingle();
    if (!appelant?.actif || appelant.role !== 'admin') return json({ ok: false, erreur: 'Réservé aux administrateurs.' }, 403);

    // 2. Pour quel acteur ?
    const { action, actor_id, envoyer_email = true, app_url = '' } = await req.json();
    const { data: acteur } = await admin.from('actors').select('id, nom, email, user_id, actif').eq('id', actor_id).maybeSingle();
    if (!acteur) return json({ ok: false, erreur: 'Acteur introuvable.' }, 404);
    if (!acteur.email) return json({ ok: false, erreur: 'Ajouter d’abord une adresse e-mail à cet acteur.' }, 400);
    if (!acteur.actif) return json({ ok: false, erreur: 'Acteur désactivé : le réactiver avant de créer son compte.' }, 400);

    const mdp = motDePasse();
    let userId = acteur.user_id as string | null;
    let dejaExistant = false;

    if (action === 'creer') {
      if (userId) return json({ ok: false, erreur: 'Cet acteur a déjà un compte. Utiliser « Nouveau mot de passe ».' }, 409);
      const { data: cree, error } = await admin.auth.admin.createUser({
        email: acteur.email, password: mdp, email_confirm: true, user_metadata: { must_change_password: true, nom: acteur.nom },
      });
      if (error) {
        // Compte déjà créé à la main dans Supabase : on le rattache et on lui donne un mot de passe provisoire.
        const existant = await trouverParEmail(acteur.email);
        if (!existant) return json({ ok: false, erreur: error.message }, 400);
        const { data: lie } = await admin.from('actors').select('id, nom').eq('user_id', existant.id).maybeSingle();
        if (lie) return json({ ok: false, erreur: `Cette adresse est déjà utilisée par ${lie.nom}.` }, 409);
        const { error: e2 } = await admin.auth.admin.updateUserById(existant.id, { password: mdp, user_metadata: { must_change_password: true, nom: acteur.nom } });
        if (e2) return json({ ok: false, erreur: e2.message }, 400);
        userId = existant.id;
        dejaExistant = true;
      } else {
        userId = cree.user.id;
      }
      const { error: e3 } = await admin.from('actors').update({ user_id: userId }).eq('id', acteur.id);
      if (e3) return json({ ok: false, erreur: e3.message }, 400);
    } else if (action === 'reinitialiser') {
      if (!userId) return json({ ok: false, erreur: 'Pas encore de compte : utiliser « Créer le compte ».' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: mdp, user_metadata: { must_change_password: true, nom: acteur.nom } });
      if (error) return json({ ok: false, erreur: error.message }, 400);
    } else {
      return json({ ok: false, erreur: 'Action inconnue.' }, 400);
    }

    // 3. Trace dans l'audit (jamais le mot de passe)
    await admin.from('audit_logs').insert({ user_id: who.user.id, table_name: 'comptes', row_id: acteur.id, action: action === 'creer' ? 'CREATION_COMPTE' : 'REINIT_MOT_DE_PASSE', new_data: { acteur: acteur.nom, email: acteur.email, deja_existant: dejaExistant } });

    let emailEnvoye = false;
    if (envoyer_email) { try { emailEnvoye = await envoyerIdentifiants(acteur.email, acteur.nom, mdp, app_url); } catch { emailEnvoye = false; } }
    return json({ ok: true, email: acteur.email, mot_de_passe: mdp, email_envoye: emailEnvoye, deja_existant: dejaExistant });
  } catch (e) {
    return json({ ok: false, erreur: String((e as Error).message || e) }, 500);
  }
});
