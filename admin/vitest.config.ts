import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Cobertura sobre TODO src (números honestos, no solo lo testeado).
      include: ['src/**'],
      exclude: ['src/**/*.test.*', 'src/main.tsx'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
