import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests de lógica (lib/), de componentes y de páginas enteras del storefront.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
    // Una sola copia de React (los paquetes del workspace la traen como peer).
    dedupe: ['react', 'react-dom'],
  },
  // JSX automático: los componentes no importan React.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // Alcance: todo el código del storefront (lógica, componentes y páginas).
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/**/__tests__/**', 'src/instrumentation*.ts'],
      reporter: ['text-summary', 'lcov'],
      // Ratchet: piso actual medido — si baja, el CI falla. Al subir cobertura,
      // subir el piso (nunca bajarlo).
      thresholds: { lines: 95 },
    },
  },
});
