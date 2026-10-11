/**
 * Todas las pantallas del panel, una por una, con los datos reales de la
 * tienda sembrada. Ninguna puede romperse al renderizar.
 *
 * Es el "smoke" del frontend: no prueba que cada pantalla haga lo correcto
 * (eso es de los tests de cada componente y de los e2e), prueba que con datos
 * de verdad —listas largas, campos nulos, importes en centavos— ninguna
 * explota. Las rutas salen de la tabla de App.tsx: una pantalla nueva entra
 * sola.
 */
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PATHS } from '../App';
import { fixture, mockApi } from '../test/api';
import { renderApp } from '../test/render';

/** Deja correr las queries de React Query (varias rondas: unas disparan otras). */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

const errors: unknown[][] = [];

beforeEach(() => {
  errors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lo que React reporta cuando un componente revienta al renderizar. */
function renderCrashes() {
  return errors.filter(
    (args) =>
      // jsdom avisa que no navega (descargas, links externos): no es un error del panel.
      !args.some((a) => String(a).includes('Not implemented: navigation')) &&
      args.some(
        (a) => a instanceof Error || (typeof a === 'string' && /The above error occurred|Uncaught/.test(a)),
      ),
  );
}

const productId = fixture<{ items: { id: string }[] }>('/api/v1/products').items[0]!.id;
const paths = ALL_PATHS.map((p) => p.replace(':id', productId));

describe('pantallas del panel', () => {
  it('recorre más de cuarenta pantallas', () => {
    expect(paths.length).toBeGreaterThan(40);
  });

  it.each(paths)('%s se renderiza con datos reales sin romperse', async (path) => {
    mockApi();
    renderApp(path);
    await settle();

    expect(renderCrashes()).toEqual([]);
    // Pasó el login y cargó la tienda: el layout está en pantalla.
    expect(screen.queryByText('Iniciar sesión')).not.toBeInTheDocument();
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50);
  });
});
