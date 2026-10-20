import { it, expect } from 'vitest';
import { buildDemo } from './demoSeed.js';
import { validate } from '../domain/report.js';
import { indexReports, provincial, gapAlerts, localParts } from '../domain/indicators.js';
import { addDays } from '../domain/time.js';

it('le jeu de démo respecte tous les contrôles bloquants', () => {
  const d = buildDemo(new Date('2026-10-18T13:10:00+02:00'));
  const idx = indexReports(d.reports);
  const bad = d.reports.filter((r) => r.statut !== 'brouillon').map((r) => ({ r, v: validate(r, { prev: idx.get(`${addDays(r.date, -1)}|${r.zs_id}`), seuilSuivi: 0.8 }) }))
    .filter((x) => x.v.errors.length || x.v.needsComment);
  if (bad.length) console.log(JSON.stringify(bad.slice(0, 4).map((x) => [x.r.zs_id, x.r.date, x.r.rapport_nul, x.v.errors, x.v.warnings, x.r.commentaire])));
  expect(bad).toHaveLength(0);
  const np = localParts(new Date('2026-10-18T13:10:00+02:00'));
  const p = provincial(d.zs, '2026-10-17', idx, d.settings, np);
  console.log('hier', p.groups, 'reports', d.reports.length, 'notifs', d.notifications.length, 'inv', d.investigations.length, 'ct', d.contacts.length, 'fu', d.followups.length, 'def', d.deferrals.length);
  console.log(gapAlerts(d.zs, '2026-10-17', idx, d.settings, np).map((g) => g.zs.id + ':' + g.type));
});
