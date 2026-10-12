import { expect, test } from '@playwright/test';

import { ADMIN, API, STORE_BASE, fillLogin } from './_helpers';

/**
 * Smoke: lo mínimo para saber que un despliegue está vivo, en menos de un
 * minuto. Corre solo con `pnpm --filter tiendafy-e2e test --grep @smoke` (o
 * `pnpm test:smoke` desde la raíz), por ejemplo después de cada deploy.
 *
 * No crea nada: solo lee. La tienda es la que diga E2E_SMOKE_STORE (por
 * defecto una de las de dev).
 */
const STORE = process.env.E2E_SMOKE_STORE ?? 'canicari';
const storeUrl = (path = '/') => `http://${STORE}.${STORE_BASE}${path}`;

test.describe('smoke @smoke', () => {
  test.setTimeout(120_000);

  test('la API responde y su chequeo de salud está bien', async ({ request }) => {
    const health = await request.get(`${API}/health`);
    expect(health.ok()).toBe(true);
  });

  test('la tienda resuelve por host y muestra su portada', async ({ page }) => {
    const response = await page.goto(storeUrl());
    expect(response?.ok()).toBe(true);
    // Abierta (con su encabezado) o "en construcción" (su pantalla de espera):
    // las dos prueban que el host resolvió la tienda y la página se armó.
    await expect(page.locator('header, main h1').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Tienda no encontrada')).toHaveCount(0);
  });

  test('el catálogo lista productos y la ficha abre', async ({ page }) => {
    await page.goto(storeUrl('/productos'));
    const firstProduct = page.locator('a[href^="/productos/"]').first();
    const construction = page.getByText(/está en camino|en construcción/i);
    // Lo que llegue primero: el catálogo o la pantalla de espera.
    await expect(firstProduct.or(construction).first()).toBeVisible({ timeout: 60_000 });
    test.skip(await construction.isVisible(), `${STORE} está en construcción: el catálogo no se muestra`);
    // Holgado: en dev la primera visita compila la ruta.
    await expect(firstProduct).toBeVisible({ timeout: 60_000 });
    await firstProduct.click();
    await expect(page).toHaveURL(/\/productos\/[^/?]+/);
    await expect(page.getByRole('button', { name: 'Agregar al carrito' }).first()).toBeVisible();
  });

  test('sitemap y robots apuntan a la tienda', async ({ request }) => {
    // Desde Node *.localhost no resuelve: se va al storefront con el Host de la tienda.
    const host = { host: `${STORE}.${STORE_BASE}` };
    const sitemap = await request.get(`http://${STORE_BASE}/sitemap.xml`, { headers: host });
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain(`<loc>http://${STORE}.${STORE_BASE}/</loc>`);
    const robots = await request.get(`http://${STORE_BASE}/robots.txt`, { headers: host });
    expect(await robots.text()).toContain(`${STORE}.${STORE_BASE}/sitemap.xml`);
  });

  test('el panel deja entrar', async ({ page }) => {
    await fillLogin(page);
    await expect(page.getByText(/Hola|Elegí una tienda/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('el panel sin sesión pide entrar', async ({ page }) => {
    await page.goto(ADMIN);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
