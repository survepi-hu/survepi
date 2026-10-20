// Pièces jointes : préparation des fichiers avant envoi (photos allégées pour les connexions lentes).
export const TYPES_ACCEPTES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';
export const TAILLE_MAX = 10 * 1024 * 1024;

export const tailleTexte = (o) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

/**
 * Photo → JPEG de 2000 px maximum (lisible pour une fiche papier, ~300-600 Ko au lieu de 3-8 Mo).
 * PDF et images que le navigateur ne sait pas lire (certains HEIC) : envoyés tels quels si ≤ 10 Mo.
 */
export async function preparer(file) {
  const estImage = /^image\//.test(file.type);
  if (estImage && file.type !== 'image/heic' && file.type !== 'image/heif') {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      if (blob && blob.size < file.size) {
        return { blob, type: 'image/jpeg', nom: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
      }
    } catch { /* on garde l'original */ }
  }
  if (file.size > TAILLE_MAX) throw new Error(`${file.name} : ${tailleTexte(file.size)}, maximum 10 Mo`);
  if (!TYPES_ACCEPTES.split(',').includes(file.type)) throw new Error(`${file.name} : seuls les photos (JPEG, PNG, WebP, HEIC) et les PDF sont acceptés`);
  return { blob: file, type: file.type, nom: file.name };
}

export const extension = (type, nom) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'image/heic': 'heic', 'image/heif': 'heif' }[type] || (nom.split('.').pop() || 'bin').toLowerCase());
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
