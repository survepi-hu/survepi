import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { provincial, gapAlerts, CATEGORIES } from '../domain/indicators.js';
import { STATUTS } from '../domain/report.js';
import { Pill } from '../ui.jsx';

export function useDay(date) {
  const s = useStore();
  return useMemo(() => provincial(s.visibleZs, date, s.idx, s.settings, s.np), [s.visibleZs, date, s.idx, s.settings, s.np]);
}
export function useGaps(date) {
  const s = useStore();
  return useMemo(() => gapAlerts(s.visibleZs, date, s.idx, s.settings, s.np), [s.visibleZs, date, s.idx, s.settings, s.np]);
}

export const CELL_TONE = { historique: 'hist', ok: 'good', retard: 'warn', incomplet: 'warn', a_corriger: 'bad', non_recu: 'bad', en_attente: 'pending', brouillon: 'pending', na: 'na' };

export function CatPill({ cat, hotspot }) {
  return (
    <span className="cat">
      <Pill tone={cat === 'preparation' ? 'info' : cat === 'post_flambee' ? 'muted' : 'accent'}>{CATEGORIES[cat]}</Pill>
      {hotspot && <Pill tone="hot" title="Hotspot">hotspot</Pill>}
    </span>
  );
}
export function StatutPill({ statut }) {
  const st = STATUTS[statut] || { label: statut, tone: 'muted' };
  return <Pill tone={st.tone}>{st.label}</Pill>;
}
/** État de la sauvegarde nocturne sur Google Drive (écrit chaque nuit par le script Apps Script). */
export function backupState(settings, now = new Date()) {
  const b = settings.derniere_sauvegarde;
  if (!b?.at) return { tone: 'bad', text: 'Aucune sauvegarde Drive enregistrée : vérifier le script de sauvegarde.' };
  const h = (now - new Date(b.at)) / 3600000;
  const quand = new Date(b.at).toLocaleString('fr-FR', { timeZone: settings.fuseau, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (b.statut !== 'ok') return { tone: 'bad', text: `Sauvegarde Drive en échec (${quand}) : ${b.erreur || 'voir l’e-mail de compte rendu'}`, b };
  if (h > 36) return { tone: 'bad', text: `Dernière sauvegarde Drive il y a ${Math.round(h / 24)} jour(s) (${quand}) : la sauvegarde nocturne ne tourne plus.`, b };
  const n = b.compteurs?.daily_reports;
  return { tone: 'good', text: `Sauvegarde Drive OK, ${quand}${n !== undefined ? ` · ${n} fiches` : ''}`, b };
}
export const actorName = (s, id) => s.data.actors.find((a) => a.id === id)?.nom || '–';
export const zsName = (s, id) => s.data.zs.find((z) => z.id === id)?.nom || id;
