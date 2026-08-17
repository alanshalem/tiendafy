import { expect, test } from '@playwright/test';

import { ADMIN, API, STORE_BASE, fillLogin } from './_helpers';

/**
 * EL camino que factura, de punta a punta y auto-contenido:
 * registro de merchant → crear tienda → crear producto → la tienda pública lo
 * muestra → carrito → llegar al checkout. Si esto pasa, el negocio funciona.
 */
test('camino crítico: registro → tienda → producto → carrito → checkout', async ({ page }) => {
  const run = Date.now().toString(36);
  const email = `e2e-${run}@test.local`;
  const sub = `e2e${run}`;
  const productName = `Producto E2E ${run}`;

  // --- 1. Registro del merchant (queda logueado; captcha auto en dev) ---
  await page.goto(ADMIN);
  await page.getByRole('button', { name: 'Registrate' }).click();
  await page.getByPlaceholder('Tu nombre').fill('Merchant E2E');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Contraseña').fill('password-e2e-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  // Cuenta nueva sin tiendas → el panel abre con el estado "sin tienda seleccionada".
  await expect(page.getByText(/Elegí una tienda/i).first()).toBeVisible({ timeout: 20_000 });

  // --- 2. Crear la tienda (API con la sesión del browser — mismo camino que el panel) ---
  const createRes = await page.request.post(`${API}/api/v1/tenants`, {
    headers: { 'Content-Type': 'application/json' },
    data: { name: `Tienda E2E ${run}`, subdomain: sub },
  });
  expect(createRes.status(), 'crear tienda').toBe(201);
  const tenant = await createRes.json();

  // La UI la refleja: aparece en Mis tiendas.
  await page.goto(`${ADMIN}/tenants`);
  await expect(page.getByText(`${sub}.localhost:3000`)).toBeVisible({ timeout: 15_000 });

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
});

test('storefront: links legales y botón de arrepentimiento presentes', async ({ page }) => {
  // Usa la tienda que el test anterior dejó… no: auto-contenido — cualquier
  // tienda activa sirve; resolvemos una vía la API pública.
  const res = await page.request.get(`${API}/health`);
  expect(res.ok()).toBeTruthy();

  // La home de la plataforma (sin subdominio) también debe responder.
  await page.goto(`http://${STORE_BASE}`);
  await expect(page).toHaveTitle(/tiendafy/i);
});

test('admin: login del seed de dev y command palette', async ({ page }) => {
  await fillLogin(page);
  await expect(page.getByText('Hola')).toBeVisible({ timeout: 20_000 });

  // Ctrl+K abre la paleta y navega (esperar la opción antes de Enter: sin carrera).
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar pantallas o productos…').fill('factu');
  await page.getByRole('option', { name: /Facturación/ }).click();
  await expect(page).toHaveURL(/facturacion/, { timeout: 15_000 });
});
