/** Description courte de l'appareil, pour le journal des connexions (aucun identifiant unique). */
export function appareil(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Autre';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const type = /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'ordinateur';
  return `${os} · ${nav} (${type})`;
}
