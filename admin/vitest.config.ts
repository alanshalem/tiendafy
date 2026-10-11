import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Una sola copia de React: @tiendafy/ui la declara como peer y, sin esto,
  // en los tests cada paquete resolvía la suya ("reading 'useState' of null").
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Componentes con DOM: jsdom para todos (los tests de lógica pura no lo
    // necesitan, pero tampoco les molesta y evita dos configuraciones).
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // Alcance: todo el código del panel (lógica, componentes y pantallas).
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'lcov'],
      // Ratchet: piso actual de TODO el panel — solo puede subir.
      thresholds: { lines: 55 },
    },
  },
});
