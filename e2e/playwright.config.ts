import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el stack de dev CORRIENDO (./dev-up.ps1): API :5080, admin :3001,
 * storefront :3000 (tiendas en *.localhost:3000). Los tests son auto-contenidos:
 * registran su propio merchant/tienda/producto con sufijos únicos.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
