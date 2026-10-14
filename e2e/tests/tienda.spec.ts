import { expect, test } from '@playwright/test';

import { ADMIN_STATE, API, SEED, STORE_BASE, storeUrl } from './_helpers';

/**
 * Lo que cambió en la tienda en oct-2026 y solo se ve con un navegador de
 * verdad: el 404 adentro de la tienda con su buscador predictivo, los filtros
 * del catálogo en un panel en el celular y "en construcción" que ya no se
 * saltea con ?preview=1 sin un token válido del editor.
 */

test.describe('la tienda', () => {
  test('el 404 queda adentro de la tienda y su buscador sugiere productos', async ({ page }) => {
    // Un producto real del catálogo, para buscarlo por las primeras letras.
    await page.goto(storeUrl('/productos'));
    // El link del nombre: el de la foto lleva adentro el botón de favoritos.
    const firstProduct = page
      .locator('main a[href^="/productos/"]')
      .filter({ hasNot: page.getByRole('button') })
      .first();
    await expect(firstProduct).toBeVisible({ timeout: 30_000 });
    const name = (await firstProduct.innerText()).trim();

    const response = await page.goto(storeUrl('/esta-pagina-no-existe-e2e'));
    expect(response?.status()).toBe(404);
    // Con el encabezado y el pie de la tienda, no una página blanca.
    await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esta página' })).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    const search = page.getByRole('main').getByRole('combobox', { name: 'Buscar' });
    await search.pressSequentially(name.slice(0, 4).toLowerCase(), { delay: 50 });
    const suggestions = page.getByRole('listbox', { name: /Sugerencias para/ });
    await expect(suggestions.getByRole('option', { name: new RegExp(escapeRegExp(name)) })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('en el celular los filtros del catálogo van en un panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(storeUrl('/productos'));
    await page.getByRole('button', { name: 'Filtrar' }).click();

    const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Filtros' }) });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('switch', { name: /Solo con stock/ })).toBeVisible();

    if (SEED) {
      // El catálogo sembrado es fijo: desde $10.000 queda solo el mate.
      await sheet.getByRole('textbox', { name: 'Precio desde' }).fill('10000');
      await sheet.getByRole('button', { name: 'Aplicar' }).click();
      await expect(page).toHaveURL(/priceMin=10000/);
      await sheet.getByRole('button', { name: 'Ver 1 producto' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole('link', { name: 'Mate de calabaza', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Bombilla de acero', exact: true })).toHaveCount(0);
    } else {
      await sheet.getByRole('button', { name: 'Cerrar filtros' }).click();
      await expect(sheet).toBeHidden();
    }
  });
});

test.describe('tienda en construcción', () => {
  test.use({ storageState: ADMIN_STATE });

  test('"en construcción" tapa la tienda, también con ?preview=1 sin token del editor', async ({ page }) => {
    const run = Date.now().toString(36);
    const sub = `e2eobra${run}`;
    const created = await page.request.post(`${API}/api/v1/tenants`, {
      data: { name: `Obra E2E ${run}`, subdomain: sub },
    });
    expect(created.status(), 'crear tienda').toBe(201);
    const tenant = (await created.json()) as { id: string };
    const headers = { 'X-Tenant-Id': tenant.id };
    const url = (path: string) => `http://${sub}.${STORE_BASE}${path}`;

    try {
      // Publicar el diseño con "en construcción" prendido (como el editor).
      const draft = (await (await page.request.get(`${API}/api/v1/theme/draft`, { headers })).json()) as {
        comingSoon?: Record<string, unknown>;
      };
      const published = await page.request.post(`${API}/api/v1/theme/publish`, {
        headers,
        data: { ...draft, comingSoon: { ...draft.comingSoon, enabled: true, title: 'Abrimos muy pronto' } },
      });
      expect(published.ok(), 'publicar el diseño').toBe(true);

      const comingSoon = page.getByRole('heading', { name: 'Abrimos muy pronto' });

      await page.goto(url('/'));
      await expect(comingSoon).toBeVisible({ timeout: 30_000 });

      // ?preview=1 a secas era la puerta trasera: ahora es la visita de cualquiera.
      await page.goto(url('/?preview=1'));
      await expect(comingSoon).toBeVisible();
      await page.goto(url('/?preview=1&pt=token-inventado'));
      await expect(comingSoon).toBeVisible();

      // Con el token firmado que pide el editor sí se ve la tienda por dentro.
      const tokenRes = await page.request.post(`${API}/api/v1/theme/preview-token`, { headers });
      expect(tokenRes.ok(), 'token de vista previa').toBe(true);
      const { token } = (await tokenRes.json()) as { token: string };
      await page.goto(url(`/?preview=1&pt=${encodeURIComponent(token)}`));
      await expect(page.getByRole('banner')).toBeVisible({ timeout: 30_000 });
      await expect(comingSoon).toHaveCount(0);
    } finally {
      await page.request.delete(`${API}/api/v1/tenants/${tenant.id}/purge`);
    }
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
