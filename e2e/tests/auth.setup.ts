import { expect, test as setup } from '@playwright/test';

import { ADMIN_STATE, fillLogin } from './_helpers';

/**
 * Una sola sesión del admin del seed para toda la corrida. El login tiene un
 * cupo de 10 intentos cada 5 minutos por IP (anti fuerza bruta): si cada test
 * entrara por su cuenta, la suite se cortaría sola. Los tests que prueban el
 * login en sí siguen entrando por la pantalla.
 */
setup('sesión del admin', async ({ page }) => {
  await fillLogin(page);
  await expect(page.getByText(/Hola|Elegí una tienda/i).first()).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: ADMIN_STATE });
});
