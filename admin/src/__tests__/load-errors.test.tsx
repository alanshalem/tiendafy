/**
 * Una carga que falla no puede verse como "no hay nada": ni "Conectá tu
 * cuenta" con la cuenta conectada, ni "sin configurar" con las credenciales
 * cargadas, ni "sin consultas" con la bandeja llena. Cada pantalla que
 * invitaba a hacer algo de más muestra el error con "Reintentar", y el resto
 * tiene la red de contención global: un aviso cuando una carga falla y la
 * pantalla no lo dice.
 */
import { Query, QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import { ApiRequestError } from '../lib/api';
import { loadFailureMessage, shouldRetry } from '../lib/queryClient';

const err = (status: number) => new ApiRequestError(status, { code: `HTTP.${status}`, message: 'x' }, false);

function queryWith(data: unknown, meta?: Record<string, unknown>) {
  const client = new QueryClient();
  const q = client.getQueryCache().build(client, { queryKey: ['x'], meta });
  if (data !== undefined) q.setData(data);
  return q as unknown as Query;
}

async function open(path: string, setup: (api: MockApi) => void) {
  const api = mockApi();
  setup(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(6);
  return { api, user };
}

describe('React Query: reintentos y aviso global', () => {
  it('no reintenta 401 ni 403; el resto, una vez', () => {
    expect(shouldRetry(0, err(500))).toBe(true);
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, err(500))).toBe(false);
    expect(shouldRetry(0, err(401))).toBe(false);
    expect(shouldRetry(0, err(403))).toBe(false);
  });

  it('avisa lo que la pantalla no muestra; no repite lo que sí, ni los 401/403/404', () => {
    expect(loadFailureMessage(queryWith(undefined), err(500))).toMatch(/No se pudieron cargar/);
    expect(loadFailureMessage(queryWith(undefined, { errorShown: true }), err(500))).toBeNull();
    // Una recarga que falla con datos viejos en pantalla: siempre se avisa.
    expect(loadFailureMessage(queryWith({ items: [] }, { errorShown: true }), err(502))).toMatch(
      /desactualizado/,
    );
    for (const status of [401, 403, 404])
      expect(loadFailureMessage(queryWith(undefined), err(status))).toBeNull();
  });

  it('una pantalla sin aviso propio: la carga caída se avisa, una sola vez por tanda', async () => {
    await open('/ventas/carritos', (api) => {
      api.on('GET', '/api/v1/stats/abandoned-carts', {}, 500);
      api.on('GET', '/api/v1/notifications/usage', {}, 503);
    });
    expect(await screen.findAllByText(/No se pudieron cargar algunos datos/)).toHaveLength(1);
  });

  it('una pantalla con su propio aviso no lo duplica', async () => {
    await open('/paginas', (api) => api.on('GET', '/api/v1/pages', {}, 500));
    expect(await screen.findByText('No se pudieron cargar las páginas.')).toBeInTheDocument();
    expect(screen.queryByText(/No se pudieron cargar algunos datos/)).not.toBeInTheDocument();
    // Y no invita a crear la primera (se terminaban duplicando).
    expect(screen.queryByText('Creá tu primera página')).not.toBeInTheDocument();
  });
});

describe('Mercado Libre', () => {
  it('si no se pudo saber el estado, no dice "Conectá tu cuenta": deja reintentar', async () => {
    const { api, user } = await open('/mercadolibre', (a) =>
      a.on('GET', '/api/v1/admin/meli/status', {}, 502),
    );
    expect(await screen.findByText('No se pudo cargar el estado de Mercado Libre.')).toBeInTheDocument();
    expect(screen.queryByText('Conectar mi cuenta')).not.toBeInTheDocument();

    api.on('GET', '/api/v1/admin/meli/status', { connected: true, nickname: 'TIENDA_ML' });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('TIENDA_ML')).toBeInTheDocument();
  });

  it('reclamos: un error no es "sin reclamos"', async () => {
    const { api, user } = await open('/mercadolibre?tab=reclamos', (a) => {
      a.on('GET', '/api/v1/admin/meli/status', { connected: true, nickname: 'TIENDA_ML' });
      a.on('GET', '/api/v1/admin/meli/claims', {}, 500);
    });
    expect(await screen.findByText('No se pudieron cargar los reclamos.')).toBeInTheDocument();
    expect(screen.queryByText(/Sin reclamos abiertos/)).not.toBeInTheDocument();
    api.on('GET', '/api/v1/admin/meli/claims', { claims: [] });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Sin reclamos abiertos/)).toBeInTheDocument();
  });
});

describe('Medios de envío', () => {
  it('si no se pudo leer la config de un correo, no invita a cargar las credenciales de nuevo', async () => {
    const { api, user } = await open('/configuracion/medios-de-envio', (a) =>
      a.on('GET', '/api/v1/admin/shipping/andreani', {}, 500),
    );
    expect(await screen.findByText('No se pudo cargar la configuración de Andreani.')).toBeInTheDocument();
    api.on('GET', '/api/v1/admin/shipping/andreani', {
      configured: true,
      active: true,
      homeDeliveryContract: 'C-1',
    });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.queryByText('No se pudo cargar la configuración de Andreani.')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Contrato C-1/)).toBeInTheDocument();
  });
});

describe('Redes', () => {
  it('si fallan las cuentas, no dice que no hay ninguna conectada', async () => {
    const { api, user } = await open('/redes', (a) => a.on('GET', '/api/v1/admin/social/accounts', {}, 500));
    expect(await screen.findByText('No se pudieron cargar las redes sociales.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nuevo post/ }));
    expect(screen.queryByText('Conectá una cuenta primero (pestaña Cuentas).')).not.toBeInTheDocument();

    api.on('GET', '/api/v1/admin/social/accounts', fixture('/api/v1/admin/social/accounts'));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.queryByText('No se pudieron cargar las redes sociales.')).not.toBeInTheDocument(),
    );
  });
});

describe('Chat posventa', () => {
  it('una bandeja que no cargó no es "sin consultas"; una recarga que falla no la vacía', async () => {
    const { api, user } = await open('/posventa', (a) =>
      a.on('GET', '/api/v1/support/conversations', {}, 500),
    );
    expect(await screen.findByText('No se pudieron cargar las consultas.')).toBeInTheDocument();
    expect(screen.queryByText('Sin consultas todavía.')).not.toBeInTheDocument();

    const inbox = fixture<{ items: { customerName?: string; subject?: string }[] }>(
      '/api/v1/support/conversations',
    );
    api.on('GET', '/api/v1/support/conversations', inbox);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.queryByText('No se pudieron cargar las consultas.')).not.toBeInTheDocument(),
    );

    // La API se cae de nuevo: "Actualizar" falla pero la bandeja sigue ahí.
    api.on('GET', '/api/v1/support/conversations', {}, 500);
    const before = screen.queryAllByRole('button').length;
    await user.click(screen.getByRole('button', { name: /Actualizar/ }));
    await settle(3);
    expect(screen.queryByText('Sin consultas todavía.')).not.toBeInTheDocument();
    if (inbox.items.length > 0) expect(screen.queryAllByRole('button').length).toBeGreaterThanOrEqual(before);
    expect(await screen.findByText(/No se pudo actualizar la bandeja/)).toBeInTheDocument();
  });
});

describe('listas que invitaban a crear lo que ya existe', () => {
  it('categorías: un error no es un catálogo sin categorías', async () => {
    const { api, user } = await open('/productos/categorias', (a) =>
      a.on('GET', '/api/v1/categories', {}, 500),
    );
    expect(await screen.findByText('No se pudieron cargar las categorías.')).toBeInTheDocument();
    expect(screen.queryByText('Organizá tu catálogo')).not.toBeInTheDocument();
    api.on('GET', '/api/v1/categories', { items: [] });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Organizá tu catálogo')).toBeInTheDocument();
  });

  it('cupones: un error no es "sin cupones"', async () => {
    await open('/descuentos', (a) => a.on('GET', '/api/v1/coupons', {}, 500));
    expect(await screen.findByText('No se pudieron cargar los cupones.')).toBeInTheDocument();
  });

  it('las tiendas: si la lista no llegó, no pide "elegí una tienda" ni olvida la elegida', async () => {
    localStorage.setItem('tiendafy.selectedStore', 'la-elegida');
    const { api, user } = await open('/paginas', (a) => a.on('GET', '/api/v1/tenants', {}, 500));
    expect(await screen.findByText('No se pudieron cargar tus tiendas.')).toBeInTheDocument();
    expect(localStorage.getItem('tiendafy.selectedStore')).toBe('la-elegida');
    api.on('GET', '/api/v1/tenants', fixture('/api/v1/tenants'));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Páginas de contenido' })).toBeInTheDocument();
  });
});

describe('editar producto', () => {
  const product = fixture<{ id: string }>('/api/v1/products/:id');

  it('si el producto no carga, lo dice (antes quedaba el esqueleto para siempre)', async () => {
    const { api, user } = await open(`/productos/${product.id}/editar`, (a) =>
      a.on('GET', `/api/v1/products/${product.id}`, {}, 500),
    );
    expect(await screen.findByText('No se pudo cargar el producto.')).toBeInTheDocument();
    api.on('GET', `/api/v1/products/${product.id}`, product);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Editar producto' })).toBeInTheDocument();
  });

  it('si el stock no carga, el campo vacío no pasa por "sin stock"', async () => {
    await open(`/productos/${product.id}/editar`, (a) => a.on('GET', '/api/v1/inventory', {}, 500));
    expect(await screen.findByText('No se pudo cargar el stock actual.')).toBeInTheDocument();
  });
});

describe('WhatsApp automático', () => {
  it('si no se pudo leer la conexión, no ofrece cargar las credenciales de nuevo', async () => {
    const { api, user } = await open('/configuracion/whatsapp-automatico', (a) =>
      a.on('GET', '/api/v1/whatsapp/connection', {}, 500),
    );
    expect(await screen.findByText('No se pudo cargar la conexión con WhatsApp.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Phone Number ID/i)).not.toBeInTheDocument();
    api.on('GET', '/api/v1/whatsapp/connection', { connected: false });
    await user.click(screen.getAllByRole('button', { name: 'Reintentar' })[0]!);
    await waitFor(() =>
      expect(screen.queryByText('No se pudo cargar la conexión con WhatsApp.')).not.toBeInTheDocument(),
    );
  });
});
