import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Una sola copia de React, igual que en vitest.config.ts: @tiendafy/ui la
  // declara como peer y pnpm le instala la suya. Sin esto el build de
  // producción metía las dos y el panel arrancaba en negro ("reading
  // 'useState' of null" en el primer componente de @tiendafy/ui).
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    // 5173 (el puerto propio de Vite) y NO 3001: Next escala 3000 -> 3001
    // cuando el 3000 está ocupado, y ahí los dos dev servers se pisaban.
    port: 5173,
    strictPort: true,
  },
});
