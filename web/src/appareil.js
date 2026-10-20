/** Description courte de l'appareil, pour le journal des connexions (aucun identifiant unique). */
export function appareil(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Autre';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const type = /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'ordinateur';
  return `${os} · ${nav} (${type})`;
}

/**
 * Lieu approximatif (ville, région, opérateur) estimé à partir de l'adresse IP.
 * Indicatif seulement : l'IP et le pays enregistrés viennent du serveur, pas de cette estimation.
 * Service public sans clé (ipwho.is, sinon ipapi.co) ; 3 s maximum, puis on s'en passe.
 */
export async function lieuApproximatif() {
  try { const c = sessionStorage.getItem('survepi-lieu'); if (c) return JSON.parse(c); } catch { /* ignore */ }
  const essai = async (url, lire) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) return null; return lire(await r.json()); } catch { return null; } finally { clearTimeout(t); }
  };
  const lieu = await essai('https://ipwho.is/?fields=success,city,region,connection', (j) => (j.success === false ? null : { ville: j.city, region: j.region, reseau: j.connection?.isp }))
    || await essai('https://ipapi.co/json/', (j) => (j.error ? null : { ville: j.city, region: j.region, reseau: j.org }));
  if (lieu) try { sessionStorage.setItem('survepi-lieu', JSON.stringify(lieu)); } catch { /* ignore */ }
  return lieu;
}
