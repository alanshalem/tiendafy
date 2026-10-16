import path from 'node:path';
import type { Page } from '@playwright/test';

/** URLs y credenciales compartidas por las specs (antes duplicadas en cada una). */
export const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
export const API = process.env.E2E_API_URL ?? 'http://localhost:5080';
export const STORE_BASE = process.env.E2E_STORE_DOMAIN ?? 'localhost:3000';

/**
 * La tienda que miran el smoke y la accesibilidad. Contra el dev de todos los
 * días, una que ya existe; con E2E_SEED=1 (CI, o un stack con base propia) la
 * arma seed.setup.ts desde cero. E2E_SMOKE_STORE es el nombre de antes.
 */
export const STORE = process.env.E2E_STORE ?? process.env.E2E_SMOKE_STORE ?? 'canicari';
export const storeUrl = (path = '/') => `http://${STORE}.${STORE_BASE}${path}`;

/** true = la base arranca vacía y seed.setup.ts siembra la tienda de la corrida. */
export const SEED = process.env.E2E_SEED === '1';

/** La sesión del admin del seed que guarda auth.setup.ts (ignorada por git). */
export const ADMIN_STATE = path.join(__dirname, '.auth', 'admin.json');

/** Credenciales del seed de dev (fuente: backend DevAdminSeeder). */
const SEED_ADMIN = { email: 'admin@tiendafy.local', password: 'password123' };

/**
 * Completa el formulario de login del admin y lo envía. NO incluye la
 * aserción post-login: cada spec verifica lo suyo (dashboard vs selector).
 */
export async function fillLogin(page: Page) {
  await page.goto(ADMIN);
  // Por el rótulo, no por el placeholder: el login cambió de placeholders el
  // 13-oct ("nombre@empresa.com", y la contraseña sin ninguno) y con eso se
  // cayó la suite entera sin que nadie lo viera.
  await page.getByLabel('Email').fill(SEED_ADMIN.email);
  await page.getByLabel('Contraseña').fill(SEED_ADMIN.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Transferencia con 10 % de descuento: la usa también el camino crítico. */
export const TRANSFER_OPTIONS = {
  transferEnabled: true,
  discountPercent: 10,
  bankName: 'Banco de Prueba',
  accountHolder: 'Tienda E2E SRL',
  holderTaxId: '30-71234567-8',
  cbu: '0000003100012345678901',
  alias: 'TIENDA.E2E.PRUEBA',
  instructions: 'Mandanos el comprobante por WhatsApp.',
  holdHours: 48,
  cashOnPickupEnabled: false,
  installmentsMax: 0,
  installmentsNote: null,
};
