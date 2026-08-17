import type { Page } from '@playwright/test';

/** URLs y credenciales compartidas por las specs (antes duplicadas en cada una). */
export const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001';
export const API = process.env.E2E_API_URL ?? 'http://localhost:5080';
export const STORE_BASE = process.env.E2E_STORE_DOMAIN ?? 'localhost:3000';

/** Credenciales del seed de dev (fuente: backend DevAdminSeeder). */
export const SEED_ADMIN = { email: 'admin@tiendafy.local', password: 'password123' };

/**
 * Completa el formulario de login del admin y lo envía. NO incluye la
 * aserción post-login: cada spec verifica lo suyo (dashboard vs selector).
 */
export async function fillLogin(page: Page) {
  await page.goto(ADMIN);
  await page.getByPlaceholder('Email').fill(SEED_ADMIN.email);
  await page.getByPlaceholder('Contraseña').fill(SEED_ADMIN.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}
