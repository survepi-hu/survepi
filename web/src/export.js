import * as XLSX from 'xlsx';

/**
 * Enregistre un fichier. Dans l'aperçu claude.ai, passe par la capacité « downloads »
 * (confirmation du visiteur) ; dans l'application déployée, téléchargement classique.
 */
let dlPromise = null;
const downloadsApi = () => {
  if (!dlPromise) dlPromise = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  return dlPromise;
};
export async function saveFile(filename, blob) {
  const dl = await downloadsApi();
  if (dl) {
    try { await dl.save({ filename, data: blob }); return true; }
    catch (e) { if (e?.code === 'declined') return false; throw new Error(e?.message || 'Téléchargement indisponible ici'); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

/** Classeur Excel : sheets = [{ name, rows: [ {col: val} ] }] */
export function exportXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Info: 'Aucune donnée pour ces filtres' }]);
    const cols = Object.keys(s.rows[0] || { Info: '' });
    ws['!cols'] = cols.map((c) => ({ wch: Math.min(40, Math.max(10, c.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return saveFile(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export function exportCsv(filename, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = '﻿' + XLSX.utils.sheet_to_csv(ws, { FS: ';' });
  return saveFile(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

/** Tableau prêt à coller dans PowerPoint / Word / Excel (TSV). */
export async function copyTable(rows) {
  if (!rows.length) return false;
  const cols = Object.keys(rows[0]);
  const tsv = [cols.join('\t'), ...rows.map((r) => cols.map((c) => String(r[c] ?? '')).join('\t'))].join('\n');
  try { await navigator.clipboard.writeText(tsv); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = tsv; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
