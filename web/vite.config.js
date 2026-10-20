import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`       : application à mettre en ligne. Exige VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
//                         (.env.local ou .env.production), sinon le build s'arrête : jamais de démo en ligne par erreur.
// `npm run build:demo`  : un seul fichier HTML autonome (démo hors ligne / aperçu)
// `npm run dev`         : sans ces variables, l'app démarre en démo (normal pour essayer)
export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const manque = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !env[k]);
    if (manque.length) {
      throw new Error(`\n\n  Build arrêté : ${manque.join(' et ')} absent(s).\n  Le fichier web/.env.local manque ou est incomplet : sans lui, l'app partirait en ligne en mode démo.\n  Le recréer (ou : cp ~/survepi-config/.env.local .), puis relancer npm run build.\n`);
    }
    if (!/^eyJ/.test(env.VITE_SUPABASE_ANON_KEY)) console.warn('\n  Attention : VITE_SUPABASE_ANON_KEY ne ressemble pas à une clé anon (elle commence normalement par eyJ).\n');
  }
  return {
    plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
    build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
    test: { environment: 'node' },
  };
});
