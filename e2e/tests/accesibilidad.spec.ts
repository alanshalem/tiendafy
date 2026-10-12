import { expect, test, type Page } from '@playwright/test';

import { ADMIN, ADMIN_STATE, STORE_BASE } from './_helpers';

/**
 * Accesibilidad en un navegador de verdad, con axe-core. Complementa a los
 * tests de jsdom (que corren en cada build): acá sí hay layout y colores, así
 * que se mide también el contraste. Se revisan las pantallas por las que
 * pasa todo comprador y las más usadas del panel.
 *
 * El contraste (WCAG AA, 4,5:1) va aparte: en el panel, con los dos temas;
 * en la tienda, con los colores que eligió el comercio (el texto sobre su
 * color se elige solo para que se lea).
 */
const STORE = process.env.E2E_SMOKE_STORE ?? 'canicari';
const storeUrl = (path = '/') => `http://${STORE}.${STORE_BASE}${path}`;
const AXE = require.resolve('axe-core/axe.min.js');

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; failureSummary: string }[];
}

/** Las violaciones de la página, con dónde está cada una y por qué falla. */
async function violations(page: Page, { contrast = false } = {}) {
  await page.addScriptTag({ path: AXE });
  const found = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: (ctx: Document, opts: object) => Promise<{ violations: Violation[] }> };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return result.violations;
  });
  const relevant = found.filter((v) => (v.id === 'color-contrast') === contrast);
  return relevant.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    where: v.nodes.slice(0, 8).map((n) => {
      const why = n.failureSummary.split(/\r?\n/).slice(1).join(' ').trim();
      return `${n.target.join(' ')} — ${why.slice(0, 160)}`;
    }),
  }));
}

test.describe('accesibilidad de la tienda', () => {
  for (const [name, path] of [
    ['portada', '/'],
    ['catálogo', '/productos'],
    ['contacto', '/contacto'],
    ['checkout (carrito vacío)', '/checkout'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(storeUrl(path));
      await page.waitForLoadState('networkidle');
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe('accesibilidad del panel', () => {
  test('login', async ({ page }) => {
    await page.goto(ADMIN);
    await page.waitForLoadState('networkidle');
    expect(await violations(page)).toEqual([]);
  });

  test.describe('con sesión', () => {
    test.use({ storageState: ADMIN_STATE });
    for (const [name, path] of [
      ['inicio', '/'],
      ['productos', '/productos'],
      ['ventas', '/ventas'],
    ] as const) {
      test(name, async ({ page }) => {
        await page.goto(`${ADMIN}${path}`);
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
        await page.waitForLoadState('networkidle');
        expect(await violations(page)).toEqual([]);
      });
    }
  });
});

test.describe('contraste de color', () => {
  test.use({ storageState: ADMIN_STATE });

  for (const theme of ['light', 'dark'] as const) {
    for (const [name, path] of [
      ['inicio', '/'],
      ['productos', '/productos'],
      ['ventas', '/ventas'],
    ] as const) {
      test(`panel (${theme === 'light' ? 'claro' : 'oscuro'}): ${name}`, async ({ page }) => {
        await page.addInitScript((mode) => localStorage.setItem('tiendafy.themeMode', mode), theme);
        await page.goto(`${ADMIN}${path}`);
        await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.waitForLoadState('networkidle');
        expect(await violations(page, { contrast: true })).toEqual([]);
      });
    }
  }

  for (const [name, path] of [
    ['portada', '/'],
    ['catálogo', '/productos'],
  ] as const) {
    test(`tienda: ${name}`, async ({ page }) => {
      await page.goto(storeUrl(path));
      await page.waitForLoadState('networkidle');
      expect(await violations(page, { contrast: true })).toEqual([]);
    });
  }
});
