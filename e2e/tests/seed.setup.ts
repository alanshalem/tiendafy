import { expect, test as setup } from '@playwright/test';

import { ADMIN_STATE, API, SEED, STORE, TRANSFER_OPTIONS } from './_helpers';

/**
 * La tienda contra la que corren el smoke y la accesibilidad, armada desde
 * cero cuando la base está vacía (CI, o un stack propio con su base aparte).
 * Solo con E2E_SEED=1: contra el stack de dev de todos los días se usa una
 * tienda que ya existe (E2E_STORE), y contra un deploy no se crea nada.
 *
 * Idempotente: cada bloque mira si lo suyo ya está antes de crearlo, así que
 * correr la suite dos veces sobre la misma base no duplica nada. Los datos son
 * fijos (nombres, precios, stock): las pantallas se ven igual en cada corrida.
 */
setup.use({ storageState: ADMIN_STATE });

/** El catálogo de la tienda de prueba. Precios en centavos. */
const PRODUCTS = [
  { name: 'Mate de calabaza', sku: 'E2E-MATE', price: 1_850_000 },
  { name: 'Bombilla de acero', sku: 'E2E-BOMBILLA', price: 690_000 },
  { name: 'Yerba orgánica 1 kg', sku: 'E2E-YERBA', price: 520_000 },
] as const;

setup('tienda sembrada para la corrida', async ({ page }) => {
  setup.skip(!SEED, 'Sin E2E_SEED: se usa una tienda que ya existe.');
  setup.setTimeout(180_000);
  const req = page.request;

  // --- La tienda ---
  const list = await req.get(`${API}/api/v1/tenants/?limit=100`);
  expect(list.ok(), 'listar tiendas').toBe(true);
  const { items } = (await list.json()) as { items: { id: string; subdomain: string }[] };
  let tenantId = items.find((t) => t.subdomain === STORE)?.id;
  if (!tenantId) {
    const created = await req.post(`${API}/api/v1/tenants`, {
      data: { name: 'Tienda E2E', subdomain: STORE },
    });
    expect(created.status(), 'crear la tienda').toBe(201);
    tenantId = ((await created.json()) as { id: string }).id;
  }
  const headers = { 'X-Tenant-Id': tenantId };

  // --- El catálogo, con stock ---
  const existing = await req.get(`${API}/api/v1/products?limit=100`, { headers });
  expect(existing.ok(), 'listar productos').toBe(true);
  const names = new Set(((await existing.json()) as { items: { name: string }[] }).items.map((p) => p.name));
  for (const p of PRODUCTS.filter((x) => !names.has(x.name))) {
    const created = await req.post(`${API}/api/v1/products`, {
      headers,
      data: {
        name: p.name,
        description: `${p.name} de la tienda de prueba del e2e.`,
        publish: true,
        variants: [{ sku: p.sku, optionValues: [], priceAmount: p.price, currency: 'ARS' }],
      },
    });
    expect(created.status(), `crear ${p.name}`).toBe(201);
    const variantId = ((await created.json()) as { variants: { id: string }[] }).variants[0]!.id;
    const stock = await req.put(`${API}/api/v1/inventory/${variantId}`, {
      headers,
      data: { available: 50, reason: 'seed e2e' },
    });
    expect(stock.ok(), `stock de ${p.name}`).toBe(true);
  }

  // --- Cobro por transferencia (sin pasarela) y un envío a domicilio ---
  const payment = await req.put(`${API}/api/v1/admin/payments/options`, {
    headers,
    data: TRANSFER_OPTIONS,
  });
  expect(payment.ok(), 'opciones de pago').toBe(true);

  const methods = await req.get(`${API}/api/v1/admin/shipping/methods`, { headers });
  expect(methods.ok(), 'listar envíos').toBe(true);
  const { items: shipping } = (await methods.json()) as { items: { name: string }[] };
  if (!shipping.some((m) => m.name === 'Envío a domicilio')) {
    const created = await req.post(`${API}/api/v1/admin/shipping/methods`, {
      headers,
      data: {
        name: 'Envío a domicilio',
        kind: 'DELIVERY',
        price: 3500,
        description: 'Llega en 3 a 5 días hábiles',
      },
    });
    expect(created.status(), 'crear envío').toBe(201);
  }

  // --- Ventas, clientes y visitas de ejemplo (semilla fija del backend) ---
  // Para que Ventas, Inicio y Estadísticas tengan algo que mostrar.
  const demo = await req.post(`${API}/api/v1/dev/demo-seed`, { headers });
  expect(demo.ok(), 'demo-seed').toBe(true);
});
