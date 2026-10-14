import { expect, test } from '@playwright/test';

import { ADMIN, ADMIN_STATE, API, STORE_BASE, TRANSFER_OPTIONS, fillLogin } from './_helpers';

/**
 * EL camino que factura, de punta a punta y auto-contenido: crear tienda →
 * crear producto → la tienda pública lo muestra → checkout → pedido por
 * transferencia (sin pasarela: nada sale de la máquina) → la página de
 * "pendiente" con el número de pedido y los datos de la cuenta → el comercio
 * registra el pago en el panel y la venta queda pagada. Si esto pasa, el
 * negocio funciona.
 *
 * De paso cubre el envío gratis desde un monto: el medio de envío cobra
 * $3.500 salvo que la compra supere $1.000, y este carrito la supera.
 */
test.describe('con la sesión del admin', () => {
  test.use({ storageState: ADMIN_STATE });

  test('camino crítico: tienda → producto → checkout → transferencia → pago registrado', async ({ page }) => {
    test.setTimeout(180_000);
    const run = Date.now().toString(36);
    const sub = `e2e${run}`;
    const productName = `Producto E2E ${run}`;

    // --- 1. Entra el merchant ---
    // No hay registro público: el botón "Registrate" solo aparece con la base
    // vacía, y los usuarios nuevos los da de alta un dueño desde Usuarios.
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
    const headers = { 'X-Tenant-Id': tenant.id, 'Content-Type': 'application/json' };

    try {
      // La UI la refleja: aparece en Mis tiendas.
      await page.goto(`${ADMIN}/tenants`);
      await expect(page.getByText(`${sub}.${STORE_BASE}`)).toBeVisible({ timeout: 15_000 });

      // --- 3. Crear un producto publicado, con stock ---
      const created = await page.request.post(`${API}/api/v1/products`, {
        headers,
        data: {
          name: productName,
          description: 'Creado por el E2E del camino crítico',
          publish: true,
          variants: [{ sku: `E2E-${run}`, optionValues: [], priceAmount: 129_900, currency: 'ARS' }],
        },
      });
      expect(created.status(), 'crear producto').toBe(201);
      const product = await created.json();

      // Sin stock, el carrito/checkout descarta el ítem.
      const variantId = product.variants[0].id;
      const stockRes = await page.request.put(`${API}/api/v1/inventory/${variantId}`, {
        headers,
        data: { available: 10, reason: 'seed e2e' },
      });
      expect(stockRes.ok(), 'setear stock').toBeTruthy();

      // --- 4. Cobro por transferencia y envío gratis desde $1.000 ---
      const payRes = await page.request.put(`${API}/api/v1/admin/payments/options`, {
        headers,
        data: TRANSFER_OPTIONS,
      });
      expect(payRes.ok(), 'opciones de pago').toBeTruthy();
      const shipRes = await page.request.post(`${API}/api/v1/admin/shipping/methods`, {
        headers,
        data: { name: 'Envío a domicilio', kind: 'DELIVERY', price: 3500, freeAbove: 1000 },
      });
      expect(shipRes.status(), 'crear envío').toBe(201);

      // --- 5. La tienda pública muestra el producto ---
      await page.goto(`http://${sub}.${STORE_BASE}`);
      await expect(page.getByText(productName).first()).toBeVisible({ timeout: 20_000 });

      // --- 6. Detalle → "Comprar ahora" → checkout ---
      await page.getByText(productName).first().click();
      const buyNow = page.getByRole('button', { name: 'Comprar ahora' });
      await expect(buyNow).toBeVisible({ timeout: 15_000 });
      // force: el overlay de Next Dev Tools (solo dev) a veces intercepta el click.
      await buyNow.click({ force: true });
      await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });
      // Primera visita al checkout en dev = Next compila la página → margen amplio.
      const summary = page.getByRole('complementary', { name: 'Resumen del pedido' });
      await expect(summary.getByText(productName)).toBeVisible({ timeout: 30_000 });

      // --- 7. Entrega: el envío sale gratis porque la compra supera el umbral ---
      await page.getByLabel('E-mail').fill(`comprador+${run}@example.com`);
      const shipping = page.getByRole('radio', { name: /Envío a domicilio/ });
      await shipping.check();
      await expect(page.getByText('Sin cargo: tu compra supera $ 1.000')).toBeVisible();
      await page.getByLabel('Nombre', { exact: true }).fill('Ana');
      await page.getByLabel('Apellido').fill('Prueba');
      await page.getByLabel(/^Teléfono/).fill('11 2345 6789');
      await page.getByLabel(/^DNI o CUIT/).fill('30123456');
      await page.getByLabel('Calle').fill('Av. Corrientes');
      await page.getByLabel('Número', { exact: true }).fill('1234');
      await page.getByLabel('Ciudad').fill('CABA');
      await page.getByLabel('Código Postal').fill('1043');
      await page.getByRole('button', { name: 'Continuar para el pago' }).click();

      // --- 8. Pago por transferencia: sin pasarela, la orden queda pendiente ---
      await expect(page.getByRole('heading', { name: /Medio de pago/ })).toBeVisible();
      await expect(page.getByText(/te mostramos los datos de la cuenta para transferir/)).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();

      // --- 9. "Pendiente" con el número de pedido y los datos de la cuenta ---
      await expect(page).toHaveURL(/\/checkout\/pending\?order=/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Pago pendiente' })).toBeVisible({ timeout: 30_000 });
      const orderHeading = page.getByRole('heading', { name: /^Pedido #\d+$/ });
      await expect(orderHeading).toBeVisible();
      const orderLabel = (await orderHeading.textContent())!.replace('Pedido ', '').trim();
      const howToPay = page.getByRole('region', { name: 'Cómo pagar' });
      await expect(howToPay).toContainText(TRANSFER_OPTIONS.cbu);
      await expect(howToPay).toContainText(TRANSFER_OPTIONS.alias);

      // --- 10. En el panel: la venta espera el pago y "Registrar pago" la cierra ---
      await page.addInitScript((id) => localStorage.setItem('tiendafy.selectedStore', id), tenant.id);
      await page.goto(`${ADMIN}/ventas`);
      await page.getByText(orderLabel, { exact: true }).first().click();
      await expect(page.getByText('Paga por transferencia: falta registrar el pago')).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: 'Registrar pago' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click();
      await expect(page.getByText('Pago registrado')).toBeVisible({ timeout: 15_000 });

      // Ya no espera el pago: el aviso y el botón se van.
      await expect(page.getByText('Paga por transferencia: falta registrar el pago')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);

      // Y la venta quedó pagada de verdad (la API, no solo el cartel).
      const orders = await page.request.get(`${API}/api/v1/orders?limit=5`, { headers });
      const { items } = (await orders.json()) as { items: { number: number; status: string }[] };
      expect(items.find((o) => `#${o.number}` === orderLabel)?.status).toBe('PAID');
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
