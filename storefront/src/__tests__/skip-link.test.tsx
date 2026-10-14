/**
 * "Saltar al contenido": lo primero que alcanza el Tab en cualquier página de
 * la tienda, y lleva al contenido salteando la barra de anuncio y el menú.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorefrontView } from '../components/store/StorefrontView';
import { mergeTheme, type ThemeConfig } from '../lib/theme';
import { fixture, fixtureTenantId, mockApi } from '../test/api';

const theme = mergeTheme(fixture<ThemeConfig>('/api/v1/theme'));

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

describe('saltar al contenido', () => {
  it('es lo primero del Tab y lleva al contenido de la página, que recibe el foco', async () => {
    render(
      <StorefrontView tenantId={fixtureTenantId} tenantName="Tienda" theme={theme} products={[]}>
        <main>
          <h1>Contacto</h1>
        </main>
      </StorefrontView>,
    );
    const user = userEvent.setup();
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(skip).toHaveFocus();

    const target = document.querySelector(skip.getAttribute('href')!)!;
    expect(target).toHaveAttribute('tabindex', '-1'); // enfocable por el salto, no por el Tab
    expect(target).toContainElement(screen.getByRole('heading', { name: 'Contacto' }));
    expect(target.closest('header')).toBeNull();
  });
});
