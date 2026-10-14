import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el stack de dev CORRIENDO (./dev-up.ps1): API :5080, admin :5173,
 * storefront :3000 (tiendas en *.localhost:3000). Los tests son auto-contenidos:
 * registran su propio merchant/tienda/producto con sufijos únicos.
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
  reporter: [['list'], ['html', { open: 'never' }]],
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
