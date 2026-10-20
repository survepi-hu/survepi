import { useMemo, useRef, useState } from 'react';
import { fmtDate } from './domain/time.js';

export const pct = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? 'NA' : `${(v * 100).toFixed(d).replace('.', ',')} %`);
export const num = (v) => (v === null || v === undefined || v === '' ? '–' : Number(v).toLocaleString('fr-FR'));
export const toneOfRate = (v, seuil = 0.8) => (v === null || v === undefined ? 'na' : v >= 0.95 ? 'good' : v >= seuil ? 'warn' : 'bad');

export function Pill({ tone = 'muted', children, title }) {
  return <span className={`pill pill-${tone}`} title={title}>{children}</span>;
}

export function Dot({ tone }) { return <span className={`dot dot-${tone}`} aria-hidden="true" />; }

export function Section({ title, aside, children, id }) {
  return (
    <section className="section" id={id}>
      {(title || aside) && <header className="section-head"><h2>{title}</h2>{aside && <div className="section-aside">{aside}</div>}</header>}
      {children}
    </section>
  );
}

/** Bande de chiffres clés : un seul bloc à séparateurs, pas une grille de cartes. */
export function Band({ items }) {
  return (
    <dl className="band">
      {items.filter(Boolean).map((it) => (
        <div key={it.label} className={`band-item ${it.tone ? 'tone-' + it.tone : ''}`}>
          <dt>{it.label}</dt>
          <dd><span className="band-v">{it.value}</span>{it.sub && <span className="band-sub">{it.sub}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ children, className = '' }) {
  return <div className="table-wrap"><table className={`tbl ${className}`}>{children}</table></div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header><h3>{title}</h3><button className="btn ghost" onClick={onClose} aria-label="Fermer">Fermer</button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error, wide }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${wide ? 'wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Empty({ children }) { return <p className="empty">{children}</p>; }

/** Courbes (taux ou effectifs) avec réticule et info-bulle. */
export function LineChart({ series, height = 200, yMax, yFormat = num, threshold, xFormat = (x) => fmtDate(x) }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 640, H = height, L = 44, R = 12, T = 12, B = 26;
  const xs = series[0]?.values.map((v) => v.x) || [];
  const allY = series.flatMap((s) => s.values.map((v) => v.y)).filter((v) => v !== null && v !== undefined);
  const max = yMax ?? Math.max(1, ...allY) * 1.1;
  const sx = (i) => L + (xs.length <= 1 ? 0 : (i * (W - L - R)) / (xs.length - 1));
  const sy = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = useMemo(() => {
    const n = 4; return Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
  }, [max]);
  const path = (vals) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v.y === null || v.y === undefined) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v.y).toFixed(1)}`; pen = true;
    });
    return d;
  };
  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((x - L) / (W - L - R)) * (xs.length - 1));
    setHover(i >= 0 && i < xs.length ? i : null);
  };
  const every = Math.max(1, Math.ceil(xs.length / 7));
  return (
    <figure className="chart">
      {series.length > 1 && (
        <figcaption className="legend">{series.map((s, k) => <span key={s.name}><i className={`sw sw-${k + 1}`} />{s.name}</span>)}</figcaption>
      )}
      <div className="chart-box">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(', ')}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} className="grid" />
              <text x={L - 6} y={sy(t) + 4} textAnchor="end" className="axis">{yFormat(t)}</text>
            </g>
          ))}
          {threshold !== undefined && (
            <g><line x1={L} x2={W - R} y1={sy(threshold)} y2={sy(threshold)} className="threshold" />
              <text x={W - R} y={sy(threshold) - 4} textAnchor="end" className="axis">seuil {yFormat(threshold)}</text></g>
          )}
          {xs.map((x, i) => (i % every === 0 || i === xs.length - 1) && (
            <text key={x} x={sx(i)} y={H - 8} textAnchor="middle" className="axis">{xFormat(x)}</text>
          ))}
          {series.map((s, k) => (
            <g key={s.name}>
              <path d={path(s.values)} className={`line s-${k + 1}`} fill="none" />
              {(() => { const i = s.values.length - 1; const v = s.values[i]; return v && v.y !== null ? <circle cx={sx(i)} cy={sy(v.y)} r="4" className={`pt s-${k + 1}`} /> : null; })()}
            </g>
          ))}
          {hover !== null && (
            <g>
              <line x1={sx(hover)} x2={sx(hover)} y1={T} y2={H - B} className="cross" />
              {series.map((s, k) => s.values[hover]?.y !== null && s.values[hover]?.y !== undefined && (
                <circle key={s.name} cx={sx(hover)} cy={sy(s.values[hover].y)} r="4.5" className={`pt s-${k + 1}`} />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="tip" style={{ left: `${(sx(hover) / W) * 100}%` }}>
            <strong>{fmtDate(xs[hover], true)}</strong>
            {series.map((s, k) => <span key={s.name}><i className={`sw sw-${k + 1}`} />{s.name} : {yFormat(s.values[hover]?.y ?? null)}</span>)}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Barres horizontales par ZS (taux), avec seuil. */
export function Bars({ rows, threshold = 0.8, format = pct, max = 1 }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className="bar-row" title={`${r.label} : ${format(r.value)}${r.detail ? ' (' + r.detail + ')' : ''}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            {r.value !== null && r.value !== undefined && <span className={`bar-fill tone-${r.tone || 'accent'}`} style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }} />}
            {threshold !== null && <span className="bar-threshold" style={{ left: `${(threshold / max) * 100}%` }} />}
          </span>
          <span className="bar-value">{format(r.value)}</span>
          {r.detail && <span className="bar-detail">{r.detail}</span>}
        </div>
      ))}
    </div>
  );
}

export function Spark({ values, max }) {
  const v = values.map((x) => (x === null || x === undefined ? null : x));
  const m = max ?? Math.max(1, ...v.filter((x) => x !== null));
  const W = 80, H = 22;
  let d = '', pen = false;
  v.forEach((y, i) => {
    if (y === null) { pen = false; return; }
    const x = (i * W) / Math.max(1, v.length - 1), yy = H - 2 - (y / m) * (H - 4);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`; pen = true;
  });
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={d} fill="none" /></svg>;
}

/** Nom de la province : paramètre de la base, sinon variable de build (écran de connexion, avant lecture des paramètres). */
export const PROVINCE_ENV = import.meta.env.VITE_PROVINCE_NOM || 'Haut-Uélé';
export const provinceNom = (settings) => settings?.province_nom || PROVINCE_ENV;
/** Épidémie ou événement suivi (MVE-17, Mpox…) : paramètre, sinon variable de build pour l'écran de connexion. */
export const EVENEMENT_ENV = import.meta.env.VITE_EVENEMENT || 'MVE-17';
export const evenementNom = (settings) => settings?.evenement || EVENEMENT_ENV;
export const dpsNom = (settings) => settings?.dps_nom || `DPS ${provinceNom(settings)}`;

/** Logo de la riposte (s'il a été envoyé dans Paramètres) ET étiquette de l'épidémie suivie : les deux toujours visibles. */
export function BrandMark({ settings }) {
  const evt = <span className="brand-mark" title="Épidémie / événement suivi">{evenementNom(settings)}</span>;
  if (!settings?.logo) return evt;
  return <span className="brand-logo-wrap"><img className="brand-logo" src={settings.logo} alt="" />{evt}</span>;
}

export function Signature() {
  return (
    <footer className="signature">
      Application Pensée par <strong>Dr AMOSI KIKWATA</strong> et Développée par <strong>Konan SAOURE</strong> avec l’appui technique de Claude AI.
    </footer>
  );
}
