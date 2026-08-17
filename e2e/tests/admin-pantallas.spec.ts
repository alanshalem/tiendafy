import { expect, test, type Page } from '@playwright/test';

import { ADMIN, fillLogin } from './_helpers';

/**
 * Una spec por pantalla crítica del admin (la UI se cubre acá, no con unit
 * tests). Usa el admin seed de dev (membresía a todas las tiendas).
 */
async function login(page: Page) {
  await fillLogin(page);
  await expect(page.getByText(/Hola|Elegí una tienda/i).first()).toBeVisible({ timeout: 20_000 });
}

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

  test('editor de diseño: abre y el preview NO está en blanco', async ({ page }) => {
    await page.goto(`${ADMIN}/canales/tienda-online`);
    await expect(page.getByText('Editar diseño')).toBeVisible({ timeout: 30_000 });
    // Guardia de regresión del bug del preview (token de draft): el iframe
    // debe renderizar contenido real de la tienda, no una página en blanco.
    const iframe = page.frameLocator('iframe[title="Preview"]');
    await expect(iframe.locator('header').first()).toBeVisible({ timeout: 30_000 });
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
