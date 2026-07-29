import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Alcance: la LÓGICA unit-testeable (lib + stats). La UI (pages/
      // components) se cubre con los E2E de Playwright, no con unit tests.
      include: ['src/lib/**', 'src/components/stats/**'],
      exclude: ['src/**/*.test.*'],
      reporter: ['text-summary', 'lcov'],
      // Ratchet: piso actual — solo puede subir. Recalibrado con vitest 4
      // (motor AST-based: 19.4% real en la escala nueva).
      thresholds: { lines: 19 },
    },
  },
});
