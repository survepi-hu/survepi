#!/usr/bin/env node
// Restaure une sauvegarde Drive (survepi-AAAAMMJJ-HHMM.json.gz) dans une base vide.
// Pré-requis : nouveau projet Supabase avec les migrations appliquées (supabase db push), SANS le seed.
//
//   cd scripts && npm install
//   DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" node restaurer-drive.mjs survepi-20261018-2330.json.gz
//
// Option --recreer-comptes (avec SUPABASE_URL et SUPABASE_SERVICE_KEY) : recrée un compte de connexion
// pour chaque acteur actif qui a un e-mail, puis lui envoie un lien pour choisir son mot de passe.
// Les mots de passe ne sont jamais sauvegardés sur Drive.
//
// Option --pieces-jointes=<dossier> (avec SUPABASE_URL et SUPABASE_SERVICE_KEY) : renvoie dans le stockage les photos /
// scans des fiches. <dossier> = « SurvEpi - Pièces jointes » téléchargé depuis Drive et décompressé. Les fichiers
// s'appellent <id>__<nom> : l'id retrouve leur emplacement d'origine dans la sauvegarde.
import fs from 'node:fs';
import zlib from 'node:zlib';
import pg from 'pg';

const ORDRE = ['settings', 'actors', 'health_zones', 'health_areas', 'assignments', 'daily_reports', 'report_attachments', 'report_versions', 'validations',
  'investigations', 'contacts', 'contact_followups', 'deferrals', 'notifications', 'audit_logs'];
const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const recreer = process.argv.includes('--recreer-comptes');
const dossierPj = (process.argv.find((a) => a.startsWith('--pieces-jointes=')) || '').split('=').slice(1).join('=');
if (!file || !process.env.DATABASE_URL) { console.error('Usage : DATABASE_URL=... node restaurer-drive.mjs <fichier.json.gz> [--recreer-comptes]'); process.exit(1); }

const raw = fs.readFileSync(file);
const dump = JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
if (dump.format !== 'survepi-sauvegarde') throw new Error('Ce fichier n’est pas une sauvegarde SurvEpi.');
console.log(`Province de la sauvegarde : ${dump.province_nom || '?'} (${dump.province_code || 'code absent'}), du ${dump.cree_le}`);
console.log(`Sauvegarde du ${dump.cree_le}`);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  for (const t of ORDRE) {
    const { rows } = await db.query(`select count(*)::int n from public.${t}`);
    if (rows[0].n > 0) throw new Error(`La table ${t} n'est pas vide : restaurer dans une base neuve (migrations sans seed).`);
  }
  await db.query('begin');
  // Triggers coupés : heures de soumission, versions et audit restent ceux d'origine.
  await db.query('set local session_replication_role = replica');
  for (const t of ORDRE) {
    const rows = dump.tables[t] || [];
    if (!rows.length) continue;
    const { rows: cols } = await db.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`, [t]);
    const list = cols.map((c) => `"${c.column_name}"`).join(', ');
    for (let i = 0; i < rows.length; i += 2000) {
      let chunk = rows.slice(i, i + 2000);
      if (t === 'actors') chunk = chunk.map((a) => ({ ...a, user_id: null })); // comptes recréés plus bas
      await db.query(`insert into public.${t} (${list}) select ${list} from json_populate_recordset(null::public.${t}, $1::json)`, [JSON.stringify(chunk)]);
    }
    process.stdout.write(`${t} : ${rows.length}\n`);
  }
  for (const [t, col] of [['report_versions', 'id'], ['validations', 'id'], ['audit_logs', 'id']])
    await db.query(`select setval(pg_get_serial_sequence('public.${t}', '${col}'), greatest((select max(${col}) from public.${t}), 1))`);
  await db.query('commit');
} catch (e) {
  await db.query('rollback').catch(() => {});
  console.error('Restauration annulée, rien n’a été écrit :', e.message);
  process.exit(1);
}

let ecart = 0;
for (const t of ORDRE) {
  const { rows } = await db.query(`select count(*)::int n from public.${t}`);
  if (rows[0].n !== (dump.compteurs?.[t] ?? (dump.tables[t] || []).length)) { ecart++; console.error(`Écart sur ${t} : ${rows[0].n} au lieu de ${dump.compteurs[t]}`); }
}
console.log(ecart ? `${ecart} table(s) avec écart.` : 'OK : mêmes compteurs que la sauvegarde.');

if (recreer) {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, ''), key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY requis pour --recreer-comptes');
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const { rows: acteurs } = await db.query(`select id, nom, email from public.actors where actif and email is not null and email <> ''`);
  for (const a of acteurs) {
    const r = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email: a.email, email_confirm: true }) });
    const j = await r.json();
    if (!r.ok) { console.error(`Compte ${a.email} : ${j.msg || j.message || r.status}`); continue; }
    await db.query('update public.actors set user_id = $1 where id = $2', [j.id, a.id]);
    await fetch(`${url}/auth/v1/recover`, { method: 'POST', headers: h, body: JSON.stringify({ email: a.email }) });
    console.log(`Compte recréé, lien envoyé : ${a.nom} <${a.email}>`);
  }
}
if (dossierPj) {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, ''), key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY requis pour --pieces-jointes');
  const parId = new Map((dump.tables.report_attachments || []).map((p) => [p.id, p]));
  const fichiers = [];
  const parcourir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = `${d}/${e.name}`; if (e.isDirectory()) parcourir(f); else fichiers.push(f); } };
  parcourir(dossierPj);
  let ok = 0, inconnus = 0, erreurs = 0;
  for (const f of fichiers) {
    const id = (f.split('/').pop().match(/^([0-9a-f-]{36})__/) || [])[1];
    const p = id && parId.get(id);
    if (!p) { inconnus++; continue; }
    const r = await fetch(`${url}/storage/v1/object/pieces-jointes/${p.path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': p.type, 'x-upsert': 'true' }, body: fs.readFileSync(f) });
    if (r.ok) ok++; else { erreurs++; console.error(`${p.nom} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); }
  }
  console.log(`Pièces jointes renvoyées : ${ok}${erreurs ? `, en erreur : ${erreurs}` : ''}${inconnus ? `, fichiers non reconnus ignorés : ${inconnus}` : ''}.`);
}
await db.end();
