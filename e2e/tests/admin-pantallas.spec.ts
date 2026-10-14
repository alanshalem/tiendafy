import { expect, test, type Page } from '@playwright/test';

import { ADMIN, ADMIN_STATE, SEED } from './_helpers';

/**
 * Una spec por pantalla crítica del admin (la UI se cubre acá, no con unit
 * tests). Usa el admin seed de dev (membresía a todas las tiendas).
 */
async function login(page: Page) {
  // La sesión ya viene de auth.setup.ts: solo se entra al panel.
  await page.goto(ADMIN);
  await expect(page.getByText(/Hola|Elegí una tienda/i).first()).toBeVisible({ timeout: 20_000 });
}

test.use({ storageState: ADMIN_STATE });

test.describe('pantallas críticas del admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('productos: la lista carga con productos', async ({ page }) => {
    await page.goto(`${ADMIN}/productos`);
    await expect(page.getByRole('link', { name: /agregar|nuevo/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('ventas: la lista de órdenes carga', async ({ page }) => {
    await page.goto(`${ADMIN}/ventas`);
    await expect(page.getByRole('heading', { name: /ventas/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  // Las pantallas de la operación diaria que entraron en oct-2026: abren con
  // su título y sin el cartel de "no se pudo cargar".
  for (const [title, path] of [
    ['Bandeja', '/bandeja'],
    ['Despacho', '/ventas/despacho'],
    ['Stock bajo', '/productos/stock-bajo'],
    ['Reseñas', '/resenas'],
  ] as const) {
    test(`${title.toLowerCase()}: la pantalla carga`, async ({ page }) => {
      await page.goto(`${ADMIN}${path}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/No se pudo|No se pudieron/)).toHaveCount(0);
    });
  }

  test('ventas: cada venta se nombra con su número de pedido', async ({ page }) => {
    test.skip(!SEED, 'Necesita las ventas de la demo (E2E_SEED=1).');
    await page.goto(`${ADMIN}/ventas`);
    await expect(page.getByText(/^#\d{4,}$/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('editor de diseño: abre y el preview NO está en blanco', async ({ page }) => {
    await page.goto(`${ADMIN}/canales/tienda-online`);
    await expect(page.getByText('Editar diseño')).toBeVisible({ timeout: 30_000 });
    // Guardia de regresión del bug del preview (token de draft): el iframe
    // debe renderizar contenido real de la tienda, no una página en blanco.
    const iframe = page.frameLocator('iframe[title="Preview"]');
    await expect(iframe.locator('header').first()).toBeVisible({ timeout: 30_000 });
  });

  test('editor de diseño: cada sección del inicio tiene su menú ⋯', async ({ page }) => {
    await page.goto(`${ADMIN}/canales/tienda-online`);
    await page.getByRole('button', { name: 'Página de inicio' }).click();

    // Solo se abre y se cierra: el borrador se guarda solo, y esto puede
    // correr contra la tienda de alguien.
    const more = page.getByRole('button', { name: /^Más acciones de «/ }).first();
    await expect(more).toBeVisible({ timeout: 30_000 });
    const section = (await more.getAttribute('aria-label'))!;
    await more.click();
    const menu = page.getByRole('menu', { name: section });
    await expect(menu).toBeVisible();
    for (const item of ['Duplicar', 'Mover abajo', 'Eliminar']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sin cambios' })).toBeVisible();
  });

  test('estadísticas: el selector de rango funciona', async ({ page }) => {
    await page.goto(`${ADMIN}/estadisticas/ventas`);
    await expect(page.getByText(/Período:/)).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Fecha').selectOption('Hoy');
    await expect(page.getByText(/Período: hoy/i)).toBeVisible({ timeout: 15_000 });
  });

  test('configuración: la pantalla de facturación ARCA carga su wizard', async ({ page }) => {
    await page.goto(`${ADMIN}/configuracion/facturacion`);
    // Heading explícito: el texto suelto ahora matchea también el HelpLink del pie.
    await expect(page.getByRole('heading', { name: 'Facturación electrónica (ARCA)' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Datos del emisor').first()).toBeVisible();
  });
});
