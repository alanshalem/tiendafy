import { expect, test } from '@playwright/test';

import { ADMIN, ADMIN_STATE, API, STORE_BASE, fillLogin } from './_helpers';

/**
 * EL camino que factura, de punta a punta y auto-contenido:
 * registro de merchant → crear tienda → crear producto → la tienda pública lo
 * muestra → carrito → llegar al checkout. Si esto pasa, el negocio funciona.
 */
test.describe('con la sesión del admin', () => {
  test.use({ storageState: ADMIN_STATE });

  test('camino crítico: login → tienda → producto → carrito → checkout', async ({ page }) => {
    const run = Date.now().toString(36);
    const sub = `e2e${run}`;
    const productName = `Producto E2E ${run}`;

    // --- 1. Entra el merchant ---
    // No hay registro público: el botón "Registrate" solo aparece con la base
    // vacía, y los usuarios nuevos los da de alta un dueño desde Usuarios. Este
    // test se registraba y llevaba roto desde que se cerró el registro.
    // (la sesión viene de auth.setup.ts)
    await page.goto(ADMIN);
    await expect(page.getByText(/Hola|Elegí una tienda/i).first()).toBeVisible({ timeout: 20_000 });

    // --- 2. Crear la tienda (API con la sesión del browser — mismo camino que el panel) ---
    const createRes = await page.request.post(`${API}/api/v1/tenants`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: `Tienda E2E ${run}`, subdomain: sub },
    });
    expect(createRes.status(), 'crear tienda').toBe(201);
    const tenant = await createRes.json();

    try {
      // La UI la refleja: aparece en Mis tiendas.
      await page.goto(`${ADMIN}/tenants`);
      await expect(page.getByText(`${sub}.${STORE_BASE}`)).toBeVisible({ timeout: 15_000 });

      // --- 3. Crear un producto publicado ---
      const created = await page.request.post(`${API}/api/v1/products`, {
        headers: { 'X-Tenant-Id': tenant.id, 'Content-Type': 'application/json' },
        data: {
          name: productName,
          description: 'Creado por el E2E del camino crítico',
          publish: true,
          variants: [{ sku: `E2E-${run}`, optionValues: [], priceAmount: 129_900, currency: 'ARS' }],
        },
      });
      expect(created.status(), 'crear producto').toBe(201);
      const product = await created.json();

      // Stock para la variante: sin stock, el carrito/checkout descarta el ítem.
      const variantId = product.variants[0].id;
      const stockRes = await page.request.put(`${API}/api/v1/inventory/${variantId}`, {
        headers: { 'X-Tenant-Id': tenant.id, 'Content-Type': 'application/json' },
        data: { available: 10, reason: 'seed e2e' },
      });
      expect(stockRes.ok(), 'setear stock').toBeTruthy();

      // --- 4. La tienda pública muestra el producto ---
      await page.goto(`http://${sub}.${STORE_BASE}`);
      await expect(page.getByText(productName).first()).toBeVisible({ timeout: 20_000 });

      // --- 5. Detalle → "Comprar ahora" → checkout ---
      await page.getByText(productName).first().click();
      const buyNow = page.getByRole('button', { name: 'Comprar ahora' });
      await expect(buyNow).toBeVisible({ timeout: 15_000 });
      // force: el overlay de Next Dev Tools (solo dev) a veces intercepta el click.
      await buyNow.click({ force: true });
      await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });
      // Primera visita al checkout en dev = Next compila la página → margen amplio.
      await expect(page.getByText(productName).first()).toBeVisible({ timeout: 30_000 });
    } finally {
      // Sin dejar rastro: la purga (solo existe en desarrollo) borra la tienda y
      // todo lo suyo. Sin esto, cada corrida sumaba una "Tienda E2E" a Mis tiendas.
      await page.request.delete(`${API}/api/v1/tenants/${tenant.id}/purge`);
    }
  });

  test('storefront: links legales y botón de arrepentimiento presentes', async ({ page }) => {
    // Antes este test solo miraba que la API respondiera y el título de la
    // landing de la plataforma: los links que nombra no los buscaba. El botón
    // de arrepentimiento es obligatorio (Res. 424/2020) en toda tienda que
    // vende, así que se busca en una de verdad.
    //
    // Auto-contenido: el admin del seed ve todas las tiendas. Sirve la primera
    // que muestre su pie; una "en construcción" no lo tiene, y está bien —no
    // vende—.
    // La sesión del admin viene de auth.setup.ts (las cookies van con page.request).
    const { items } = (await (await page.request.get(`${API}/api/v1/tenants/`)).json()) as {
      items: { subdomain: string; status: string }[];
    };

    const terminos = page.getByRole('link', { name: 'Términos y condiciones' });
    let encontrada: string | null = null;
    for (const t of items.filter((x) => x.status === 'ACTIVE')) {
      await page.goto(`http://${t.subdomain}.${STORE_BASE}`);
      if (await terminos.isVisible()) {
        encontrada = t.subdomain;
        break;
      }
    }
    test.skip(
      encontrada === null,
      'No hay ninguna tienda activa vendiendo (todas en construcción o ninguna creada).',
    );

    await expect(terminos).toHaveAttribute('href', '/terminos');
    await expect(page.getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/privacidad');
    await expect(page.getByRole('link', { name: 'Botón de arrepentimiento' })).toHaveAttribute(
      'href',
      '/arrepentimiento',
    );
  });
});

test('admin: login del seed de dev y command palette', async ({ page }) => {
  await fillLogin(page);
  await expect(page.getByText('Hola')).toBeVisible({ timeout: 20_000 });

  // Ctrl+K abre la paleta y navega (esperar la opción antes de Enter: sin carrera).
  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox', { name: 'Buscar en el panel' }).fill('factu');
  await page.getByRole('option', { name: /Facturación/ }).click();
  await expect(page).toHaveURL(/facturacion/, { timeout: 15_000 });
});
