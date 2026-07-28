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
      include: ['src/lib/**'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
