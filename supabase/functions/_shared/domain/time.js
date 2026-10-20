// Outils de date. Toutes les dates métier sont des chaînes 'YYYY-MM-DD'
// exprimées dans le fuseau de la province (par défaut Africa/Lubumbashi, UTC+2).

export const DEFAULT_TZ = 'Africa/Lubumbashi';

const pad = (n) => String(n).padStart(2, '0');

/** Date et minutes écoulées depuis minuit dans le fuseau donné. */
export function localParts(instant = new Date(), tz = DEFAULT_TZ) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export const today = (tz) => localParts(new Date(), tz).date;

export function hhmmToMin(s) {
  if (!s) return null;
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}
export const minToHhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  // a - b en jours
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Semaine épidémiologique ISO (lundi-dimanche), utilisée par DHIS2 RDC. */
export function epiWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year, week, label: `S${pad(week)}-${year}` };
}

export function weekBounds(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  const monday = addDays(dateStr, 1 - day);
  return { from: monday, to: addDays(monday, 6) };
}

/** Jour de la semaine 1 = lundi … 7 = dimanche */
export const isoDow = (dateStr) => new Date(dateStr + 'T00:00:00Z').getUTCDay() || 7;

/** Minutes locales d'un horodatage ISO, et décalage en jours par rapport à une date de référence. */
export function submissionOffset(isoTs, refDate, tz = DEFAULT_TZ) {
  const p = localParts(new Date(isoTs), tz);
  return p.minutes + diffDays(p.date, refDate) * 1440;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export function fmtDate(dateStr, withDay = false) {
  if (!dateStr) return '';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  const s = `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
  return withDay ? `${JOURS[d.getUTCDay()]} ${s}` : s;
}
export function fmtTime(isoTs, tz = DEFAULT_TZ) {
  if (!isoTs) return '';
  return minToHhmm(localParts(new Date(isoTs), tz).minutes);
}
