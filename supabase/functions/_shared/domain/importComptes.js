// Import du classeur « SurvEpi_modele_comptes.xlsx » : acteurs (comptes) et zones de santé.
// Module pur : reçoit les lignes déjà lues (objets { en-tête: valeur }) et l'état actuel de la base,
// rend un plan ligne par ligne (créer / mettre à jour / erreur) que l'écran affiche avant d'appliquer.

export const norm = (v) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = (s) => norm(s).replace(/ /g, '-');

/** Libellés proposés dans la liste déroulante du modèle → rôle technique. */
export const ROLE_CHOICES = [
  ['Rapporteur ZS', 'rapporteur'],
  ['Épidémiologiste superviseur (1re validation ZS)', 'epidemiologiste'],
  ['Validateur (2e validation province)', 'validateur'],
  ['Team Lead / administrateur de la riposte', 'team_lead'],
  ['Gestionnaire de données', 'data_manager'],
  ['Coordination (lecture seule)', 'coordination'],
  ['MCZ', 'mcz'],
  ['DOS', 'dos'],
  ['Administrateur technique (SAV)', 'admin'],
];
const ROLE_CODES = ['rapporteur', 'epidemiologiste', 'data_manager', 'team_lead', 'validateur', 'dos', 'mcz', 'coordination', 'admin'];
export function roleFrom(v) {
  const n = norm(v);
  if (!n) return null;
  for (const [label, code] of ROLE_CHOICES) if (norm(label) === n) return code;
  for (const code of ROLE_CODES) if (norm(code) === n || n.replace(/ /g, '_') === code) return code;
  // tolérance : début du libellé (« Validateur », « Épidémiologiste superviseur »…)
  for (const [label, code] of ROLE_CHOICES) if (norm(label).startsWith(n) || n.startsWith(norm(label).split(' ')[0])) return code;
  return null;
}

const CANAUX = { whatsapp: 'whatsapp', sms: 'sms', 'e mail': 'email', email: 'email', mail: 'email', application: 'in_app', 'dans l application': 'in_app' };

/** Retrouve une colonne par le début de son en-tête (les en-têtes du modèle portent « * » ou une précision). */
function pick(row, ...starts) {
  for (const key of Object.keys(row)) {
    const k = norm(key);
    if (starts.some((s) => k === norm(s) || k.startsWith(norm(s)))) return row[key];
  }
  return '';
}
const txt = (v) => (v instanceof Date ? '' : String(v ?? '').trim());
const isEmptyRow = (row) => Object.values(row).every((v) => v === '' || v === null || v === undefined);

/** Numéro : 0812345678 → +243812345678 ; garde les numéros déjà internationaux. */
export function phone(v, indicatif = '+243') {
  let s = txt(v).replace(/[\s.()-]/g, '');
  if (!s) return '';
  if (/^00\d+/.test(s)) s = '+' + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = indicatif + s.slice(1);
  if (/^\d{9}$/.test(s)) s = indicatif + s;
  if (/^243\d{9}$/.test(s)) s = '+' + s;
  return s;
}
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Date Excel (objet Date, nombre de série, JJ/MM/AAAA ou AAAA-MM-JJ) → 'AAAA-MM-JJ'. */
export function dateFrom(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  const p2 = (n) => String(n).padStart(2, '0');
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // SheetJS rend les dates à minuit heure locale : arrondir à la date la plus proche
    const d = new Date(v.getTime() + 12 * 3600e3);
    return { value: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` };
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return { value: d.toISOString().slice(0, 10) };
  }
  const s = txt(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return { value: `${m[3]}-${p2(m[2])}-${p2(m[1])}` };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { value: `${m[1]}-${m[2]}-${m[3]}` };
  return { error: `date illisible « ${s} » (format JJ/MM/AAAA)` };
}

/** Heure : '16:30', fraction de jour Excel, ou Date. */
export function heureFrom(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  const p2 = (n) => String(n).padStart(2, '0');
  if (v instanceof Date) return { value: `${p2(v.getHours())}:${p2(v.getMinutes())}` };
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return { value: `${p2(Math.floor(m / 60))}:${p2(m % 60)}` }; }
  const m = txt(v).match(/^(\d{1,2})[:h](\d{2})$/i);
  if (m && +m[1] < 24 && +m[2] < 60) return { value: `${p2(m[1])}:${m[2]}` };
  return { error: `heure illisible « ${txt(v)} » (format HH:MM)` };
}
const intFrom = (v) => {
  if (v === '' || v === null || v === undefined) return { value: null };
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? { value: n } : { error: `nombre entier attendu (« ${txt(v)} »)` };
};
const ouiNon = (v) => { const n = norm(v); return n ? ['oui', 'o', 'yes', 'x', '1', 'vrai'].includes(n) : null; };

/**
 * Construit le plan d'import.
 * @param {{acteurs: object[], zs: object[]}} sheets lignes des onglets « Acteurs » et « ZS » (1re ligne = en-têtes, ligne Excel = index + 2)
 * @param {{zs: object[], actors: object[]}} current état de la base
 */
export function planImport(sheets, current) {
  const zsByKey = new Map();
  for (const z of current.zs) { zsByKey.set(norm(z.nom), z); zsByKey.set(norm(z.id), z); if (z.code_dhis2) zsByKey.set(norm(z.code_dhis2), z); }

  // ---------- ZS
  const zsOps = [];
  const fileZs = new Map(); // nom normalisé → { id, nom }
  (sheets.zs || []).forEach((row, i) => {
    if (isEmptyRow(row)) return;
    const line = i + 2, errors = [], patch = {};
    const nom = txt(pick(row, 'Zone de sante', 'ZS', 'Nom'));
    if (!nom) { errors.push('nom de la ZS manquant'); zsOps.push({ line, nom: '', action: 'erreur', errors, patch }); return; }
    const code = txt(pick(row, 'Code DHIS2'));
    const exist = zsByKey.get(norm(nom)) || (code && zsByKey.get(norm(code)));
    if (code) patch.code_dhis2 = code;
    const cat = norm(pick(row, 'Categorie'));
    if (cat) {
      if (cat.startsWith('touch')) patch.categorie_manuelle = 'touchee';
      else if (cat.startsWith('prep') || cat.startsWith('en prep')) patch.categorie_manuelle = 'preparation';
      else errors.push(`catégorie inconnue « ${txt(pick(row, 'Categorie'))} »`);
    }
    const hot = ouiNon(pick(row, 'Hotspot')); if (hot !== null) patch.hotspot = hot;
    for (const [col, key] of [['Date du 1er cas', 'date_premier_cas'], ['Date du dernier cas', 'date_dernier_cas']]) {
      const r = dateFrom(pick(row, col)); if (r.error) errors.push(`${col} : ${r.error}`); else if (r.value) patch[key] = r.value;
    }
    for (const [col, key] of [['AS total', 'as_total'], ['AS affectees', 'as_affectees']]) {
      const r = intFrom(pick(row, col)); if (r.error) errors.push(`${col} : ${r.error}`); else if (r.value !== null) patch[key] = r.value;
    }
    const mcz = txt(pick(row, 'MCZ nom', 'Nom du MCZ', 'MCZ')); if (mcz) patch.mcz_nom = mcz;
    const mczc = phone(pick(row, 'Contact MCZ', 'WhatsApp MCZ')); if (mczc) patch.mcz_contact = mczc;
    const h = heureFrom(pick(row, 'Heure limite')); if (h.error) errors.push(h.error); else if (h.value) patch.heure_limite = h.value;
    const fr = norm(pick(row, 'Frequence'));
    if (fr) { if (fr.startsWith('quot')) patch.frequence = 'quotidienne'; else if (fr.startsWith('hebd')) patch.frequence = 'hebdomadaire'; else errors.push('fréquence : Quotidienne ou Hebdomadaire'); }
    const d1 = patch.date_premier_cas || exist?.date_premier_cas, d2 = patch.date_dernier_cas || exist?.date_dernier_cas;
    if (d1 && d2 && d2 < d1) errors.push('le dernier cas est avant le 1er cas');
    const ast = patch.as_total ?? exist?.as_total, asa = patch.as_affectees ?? exist?.as_affectees;
    if (ast != null && asa != null && asa > ast) errors.push('plus d’AS affectées que d’AS au total');
    if (fileZs.has(norm(nom))) errors.push('ZS en double dans le fichier');

    const id = exist?.id || slug(nom);
    fileZs.set(norm(nom), { id, nom });
    if (code) fileZs.set(norm(code), { id, nom });
    const changed = exist ? Object.fromEntries(Object.entries(patch).filter(([k, v]) => exist[k] !== v)) : patch;
    zsOps.push({ line, nom, id, action: errors.length ? 'erreur' : !exist ? 'creer' : Object.keys(changed).length ? 'maj' : 'inchange', errors, patch: exist ? changed : { nom, frequence: 'quotidienne', actif: true, categorie_manuelle: 'preparation', hotspot: false, ...patch } });
  });
  const findZs = (name) => fileZs.get(norm(name)) || zsByKey.get(norm(name));
  const splitZs = (v) => txt(v).split(/[,;/\n]+/).map((x) => x.trim()).filter(Boolean);

  // ---------- Acteurs
  const actorOps = [];
  const seenEmail = new Map(), seenTit = new Map(), seenSup = new Map();
  const byEmail = new Map(current.actors.filter((a) => a.email).map((a) => [a.email.toLowerCase(), a]));
  const byName = new Map(current.actors.map((a) => [norm(a.nom), a]));
  (sheets.acteurs || []).forEach((row, i) => {
    if (isEmptyRow(row)) return;
    const line = i + 2, errors = [], warnings = [];
    const nom = txt(pick(row, 'Nom complet', 'Nom'));
    const fonction = txt(pick(row, 'Fonction'));
    const roleTxt = txt(pick(row, 'Role'));
    const role = roleFrom(roleTxt);
    const email = txt(pick(row, 'E-mail', 'Email', 'Adresse e-mail')).toLowerCase();
    if (!nom) errors.push('nom manquant');
    if (!fonction) errors.push('fonction manquante');
    if (!roleTxt) errors.push('rôle manquant'); else if (!role) errors.push(`rôle inconnu « ${roleTxt} »`);
    if (email && !emailOk(email)) errors.push(`e-mail invalide « ${email} »`);
    if (email && seenEmail.has(email)) errors.push(`e-mail déjà utilisé ligne ${seenEmail.get(email)}`);
    if (email) seenEmail.set(email, line);
    if (!email) warnings.push('pas d’e-mail : pas de compte de connexion possible');

    const zsIds = new Set();
    const unknown = [];
    const resolve = (names) => names.map((n) => { const z = findZs(n); if (!z) unknown.push(n); return z?.id; }).filter(Boolean);
    resolve(splitZs(pick(row, 'ZS suivies', 'ZS'))).forEach((id) => zsIds.add(id));
    const tit = resolve(splitZs(pick(row, 'Rapporteur titulaire', 'Titulaire')));
    const sup = resolve(splitZs(pick(row, 'Rapporteur suppleant', 'Suppleant')));
    tit.forEach((id) => zsIds.add(id)); sup.forEach((id) => zsIds.add(id));
    if (unknown.length) errors.push(`ZS inconnue(s) : ${unknown.join(', ')} (ajouter la ZS dans l’onglet ZS)`);
    for (const id of tit) { if (seenTit.has(id)) errors.push(`titulaire de ${id} déjà donné ligne ${seenTit.get(id)}`); seenTit.set(id, line); }
    for (const id of sup) { if (seenSup.has(id)) errors.push(`suppléant de ${id} déjà donné ligne ${seenSup.get(id)}`); seenSup.set(id, line); }
    if (['rapporteur', 'epidemiologiste', 'dos', 'mcz'].includes(role) && zsIds.size === 0) warnings.push('aucune ZS : cette personne ne verra aucune fiche');

    const canalTxt = norm(pick(row, 'Canal'));
    const canal = canalTxt ? CANAUX[canalTxt] : null;
    if (canalTxt && !canal) warnings.push('canal inconnu : WhatsApp retenu');
    const whatsapp = phone(pick(row, 'WhatsApp'));
    const exist = (email && byEmail.get(email)) || byName.get(norm(nom));
    const fields = { nom, fonction, role, organisation: txt(pick(row, 'Organisation')) || null, email: email || null, whatsapp: whatsapp || null };
    if (canal) fields.canal_prefere = canal; else if (!exist) fields.canal_prefere = whatsapp ? 'whatsapp' : email ? 'email' : 'whatsapp';
    if (exist?.user_id && email && exist.email && exist.email.toLowerCase() !== email) warnings.push('a déjà un compte avec une autre adresse : l’adresse de connexion ne change pas');

    let action = 'creer', patch = fields;
    if (exist) {
      patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== null && v !== '' && exist[k] !== v));
      const oldZs = new Set(exist.zs_ids || []);
      const sameZs = zsIds.size === 0 || (zsIds.size === oldZs.size && [...zsIds].every((z) => oldZs.has(z)));
      action = Object.keys(patch).length || !sameZs ? 'maj' : 'inchange';
    }
    actorOps.push({
      line, nom, email, role, action: errors.length ? 'erreur' : action, errors, warnings, existingId: exist?.id || null,
      hasAccount: !!exist?.user_id, patch, zs_ids: [...zsIds], titulaire: tit, suppleant: sup,
    });
  });

  const count = (ops, a) => ops.filter((o) => o.action === a).length;
  return {
    zsOps, actorOps,
    resume: {
      zs: { creer: count(zsOps, 'creer'), maj: count(zsOps, 'maj'), inchange: count(zsOps, 'inchange'), erreur: count(zsOps, 'erreur') },
      acteurs: { creer: count(actorOps, 'creer'), maj: count(actorOps, 'maj'), inchange: count(actorOps, 'inchange'), erreur: count(actorOps, 'erreur') },
    },
  };
}
