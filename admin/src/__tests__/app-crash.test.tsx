/**
 * Las redes que quedaban sin poner: lo que falla por fuera de una pantalla
 * (providers, menú, layouts) dejaba el panel en blanco; una pestaña de antes
 * de un deploy fallaba al cambiar de pantalla; y un guardado que fallaba sin
 * `onError` no avisaba nada.
 */
import { QueryClient, QueryClientProvider, useMutation, type Mutation } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@tiendafy/ui';
import { RootBoundary, RouteCrash } from '../components/AppCrash';
import { QueryErrorToasts } from '../components/QueryErrorToasts';
import { ApiRequestError } from '../lib/api';
import { mutationFailureMessage } from '../lib/queryClient';
import { installStaleChunkReload, reloadOnceForStaleChunk } from '../lib/staleChunkReload';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

function Boom({ error = new Error('se rompió') }: { error?: Error }): never {
  throw error;
}

describe('pantalla de error del panel entero', () => {
  it('lo que tira por fuera de una pantalla (layout, menú) muestra el aviso del router', async () => {
    const router = createMemoryRouter([{ path: '*', element: <Boom />, errorElement: <RouteCrash /> }]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'El panel no pudo cargar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  });

  it('un provider que tira (por encima del router) tampoco deja la página en blanco', () => {
    render(
      <RootBoundary>
        <Boom />
      </RootBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'El panel no pudo cargar' })).toBeInTheDocument();
  });

  it('un chunk viejo después de un deploy pide recargar, no "algo falló"', () => {
    render(
      <RootBoundary>
        <Boom error={new TypeError('Failed to fetch dynamically imported module: /assets/x.js')} />
      </RootBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Hay una versión nueva del panel' })).toBeInTheDocument();
  });
});

describe('vite:preloadError', () => {
  it('recarga una sola vez por minuto: si el chunk sigue sin estar, no entra en bucle', () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk(reload, 1_000_000)).toBe(true);
    expect(reloadOnceForStaleChunk(reload, 1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // Otro deploy, más tarde en la misma pestaña: vuelve a recargar.
    expect(reloadOnceForStaleChunk(reload, 1_100_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('escucha el evento de Vite y lo frena mientras recarga', () => {
    const target = new EventTarget() as Window;
    // jsdom no implementa la navegación: el reload real se reemplaza.
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    installStaleChunkReload(target);
    const event = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    // El segundo, enseguida: no recarga y deja que el error siga.
    const again = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(again);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(again.defaultPrevented).toBe(false);
  });
});

describe('guardados que fallan', () => {
  const fail = () => Promise.reject(new ApiRequestError(500, { code: 'HTTP.500', message: 'x' }, false));
  const mutationWith = (options: Record<string, unknown>) =>
    new QueryClient().getMutationCache().build(new QueryClient(), options) as unknown as Mutation<
      unknown,
      unknown,
      unknown,
      unknown
    >;

  it('se avisan si nadie más lo hace; 401 no (ya se pide la clave)', () => {
    const err = new ApiRequestError(500, { code: 'HTTP.500', message: 'x' }, false);
    expect(mutationFailureMessage(mutationWith({}), err)).toMatch(/No se pudo guardar/);
    expect(mutationFailureMessage(mutationWith({ onError: () => {} }), err)).toBeNull();
    expect(mutationFailureMessage(mutationWith({ meta: { errorShown: true } }), err)).toBeNull();
    const expired = new ApiRequestError(401, { code: 'Auth.SessionExpired', message: 'x' });
    expect(mutationFailureMessage(mutationWith({}), expired)).toBeNull();
    // El mensaje que explicó la API le gana al genérico.
    const explained = new ApiRequestError(409, { code: 'X', message: 'Ya existe una con ese nombre' });
    expect(mutationFailureMessage(mutationWith({}), explained)).toBe('Ya existe una con ese nombre');
  });

  function Save({ onError }: { onError?: () => void }) {
    const m = useMutation({ mutationFn: fail, ...(onError ? { onError } : {}) });
    return (
      <button type="button" onClick={() => m.mutate()}>
        Guardar
      </button>
    );
  }

  const renderSave = (onError?: () => void) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <QueryErrorToasts />
          <Save onError={onError} />
        </ToastProvider>
      </QueryClientProvider>,
    );

  it('una mutación sin onError que falla muestra un aviso', async () => {
    renderSave();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/No se pudo guardar el cambio/)).toBeInTheDocument();
  });

  it('una con onError propio no se avisa dos veces', async () => {
    const onError = vi.fn();
    renderSave(onError);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.queryByText(/No se pudo guardar el cambio/)).toBeNull();
  });
});
