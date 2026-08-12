import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true expone el dev server en todas las interfaces de red (no solo
    // localhost), para poder abrirlo desde otras maquinas de la red local
    // usando la IP de esta PC (ej. http://192.168.x.x:5000). Puerto fijo en
    // 5000 (mas facil de compartir) -- strictPort para que falle claro si
    // ese puerto ya esta ocupado, en vez de saltar a otro en silencio.
    host: true,
    port: 5000,
    strictPort: true,
    // Todo /api/* se reenvia al backend Express local (127.0.0.1:8787). Asi
    // el navegador -- este o cualquier otro en la red local -- solo necesita
    // hablar con UN puerto (5000); el reenvio al 8787 lo hace Vite del lado
    // del servidor, sin exponer ese segundo puerto a la red.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/public/logos/**', '**/public/botellas/**'],
    },
  },
});
