import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests de lógica pura del storefront (lib/). Los componentes se cubren con E2E.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Solo .ts: los .tsx de lib (storefront-page) son composición de UI y se
      // cubren por E2E. Además el remapeo de vitest 4 no parsea .tsx sueltos.
      include: ['src/lib/**/*.ts'],
      reporter: ['text-summary', 'lcov'],
      // Ratchet: piso actual medido — si baja, el CI falla. Al subir cobertura,
      // subir el piso (nunca bajarlo). Recalibrado al migrar a vitest 4: el
      // motor AST-based cuenta distinto que el v1 (20.4% real hoy en la
      // escala nueva; el 55 anterior era de la escala vieja).
      thresholds: { lines: 20 },
    },
  },
});
