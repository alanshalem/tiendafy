import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 (el puerto propio de Vite) y NO 3001: Next escala 3000 -> 3001
    // cuando el 3000 está ocupado, y ahí los dos dev servers se pisaban.
    port: 5173,
    strictPort: true,
  },
});
