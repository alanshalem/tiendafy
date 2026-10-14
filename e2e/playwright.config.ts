import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el stack de dev CORRIENDO (./dev-up.ps1): API :5080, admin :5173,
 * storefront :3000 (tiendas en *.localhost:3000). Los tests son auto-contenidos:
 * registran su propio merchant/tienda/producto con sufijos únicos.
 *
 * En CI (.github/workflows/e2e.yml) corre contra builds de producción y una
 * base vacía que siembra tests/seed.setup.ts (E2E_SEED=1). Para otro stack:
 * E2E_API_URL, E2E_ADMIN_URL, E2E_STORE_DOMAIN y E2E_STORE.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Un solo worker: las specs comparten el stack de dev (el mismo usuario,
  // tiendas que se crean y se purgan); en paralelo se pisaban entre sí.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // En CI además anota cada falla sobre el PR (reporter 'github').
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inicia sesión una vez y guarda el estado (ver tests/auth.setup.ts).
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Con E2E_SEED=1 arma la tienda de la corrida (ver tests/seed.setup.ts).
    { name: 'seed', testMatch: /seed\.setup\.ts/, dependencies: ['setup'] },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['seed'] },
  ],
});
