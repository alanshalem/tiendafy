/**
 * Reseñas en el panel: la bandeja por estado (con las denunciadas marcadas),
 * aprobar, ocultar, responder y la configuración; y la demanda de "Avisame
 * cuando ingrese" en Productos y en la edición de cada producto.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';
import type { AdminReview } from '../pages/Reviews';

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
});
afterEach(() => expect(crashes()).toEqual([]));

const review = (id: string, extra: Partial<AdminReview> = {}): AdminReview => ({
  id,
  productId: 'p1',
  productName: 'Taladro percutor',
  variantLabel: null,
  orderId: 'o1',
  rating: 2,
  title: 'No me convenció',
  body: 'Hace mucho ruido y la batería dura poco.',
  authorName: 'Ana P.',
  buyerEmail: 'ana@mail.com',
  photos: ['https://cdn.example.com/r.jpg'],
  status: 'pending',
  reply: null,
  repliedAtUtc: null,
  helpfulCount: 0,
  reportCount: 0,
  flagged: false,
  createdAtUtc: '2026-10-10T12:00:00Z',
  moderatedAtUtc: null,
  ...extra,
});

const LIST = {
  items: [review('r1'), review('r2', { flagged: true, reportCount: 3, rating: 5, title: 'Excelente' })],
  total: 2,
  counts: { pending: 2, approved: 7, hidden: 1, flagged: 1 },
};

async function open(path: string, heading: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: heading, level: 1 });
  await settle(3);
  return { api, user };
}

describe('reseñas: la bandeja', () => {
  it('muestra las pendientes con sus contadores y avisa de las denunciadas', async () => {
    const { api } = await open('/resenas', 'Reseñas', (a) => a.on('GET', '/api/v1/admin/reviews', LIST));
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/admin/reviews?status=pending'))).toBe(true);
    expect(screen.getByRole('tab', { name: /Pendientes\s*2/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/denunciada por varias personas/)).toBeInTheDocument();
    expect(screen.getByText('Denunciada (3)')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'ana@mail.com' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: '2 de 5 estrellas' })).toHaveLength(1);
  });

  it('el estado, las estrellas y la búsqueda van a la URL y al pedido', async () => {
    const { api, user } = await open('/resenas?estado=hidden&estrellas=1', 'Reseñas', (a) =>
      a.on('GET', '/api/v1/admin/reviews', { ...LIST, items: [] }),
    );
    const last = () => api.calls.filter((c) => c.path.startsWith('/api/v1/admin/reviews?')).at(-1)!.path;
    expect(last()).toContain('status=hidden');
    expect(last()).toContain('rating=1');
    await user.type(screen.getByRole('searchbox', { name: 'Buscar reseñas' }), 'ruido');
    await waitFor(() => expect(last()).toContain('q=ruido'));
    await user.click(screen.getByRole('tab', { name: /Aprobadas/ }));
    await waitFor(() => expect(last()).toContain('status=approved'));
  });

  it('aprobar, ocultar y responder', async () => {
    const { api, user } = await open('/resenas', 'Reseñas', (a) =>
      a.on('GET', '/api/v1/admin/reviews', LIST),
    );
    const [first] = screen.getAllByRole('article');
    await user.click(within(first!).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/v1/admin/reviews/r1/approve')).toBe(true),
    );
    expect(await screen.findByText('Reseña publicada.')).toBeInTheDocument();

    await user.click(within(first!).getByRole('button', { name: 'Ocultar' }));
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/v1/admin/reviews/r1/hide')).toBe(true));

    await user.click(within(first!).getByRole('button', { name: 'Responder' }));
    await user.type(
      within(first!).getByRole('textbox', { name: 'Respuesta pública' }),
      'Te escribimos por privado.',
    );
    await user.click(within(first!).getByRole('button', { name: 'Publicar respuesta' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.path === '/api/v1/admin/reviews/r1/reply')?.body).toEqual({
        reply: 'Te escribimos por privado.',
      }),
    );
  });

  it('la configuración: aprobación automática, mostrar en la tienda y el email', async () => {
    const settings = {
      autoApproveMinRating: 4,
      requestDelayDays: 7,
      showOnStore: true,
      requestEmailEnabled: true,
    };
    const { api, user } = await open('/resenas', 'Reseñas', (a) => {
      a.on('GET', '/api/v1/admin/reviews', LIST);
      a.on('GET', '/api/v1/admin/reviews/settings', settings);
      a.on('PUT', '/api/v1/admin/reviews/settings', (body: unknown) => body);
    });
    await user.click(screen.getByRole('button', { name: /Configuración/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Configuración de reseñas' });
    await user.selectOptions(within(dialog).getByRole('combobox'), 'none');
    const days = within(dialog).getByRole('spinbutton');
    await user.clear(days);
    await user.type(days, '10');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(
        api.calls.find((c) => c.method === 'PUT' && c.path === '/api/v1/admin/reviews/settings')?.body,
      ).toEqual({
        ...settings,
        autoApproveMinRating: null,
        requestDelayDays: 10,
      }),
    );
  });
});

describe('avisame cuando ingrese: la demanda', () => {
  it('lista lo que espera la gente, de lo más pedido a lo menos', async () => {
    await open('/productos/esperando', 'Avisame cuando ingrese', (a) =>
      a.on('GET', '/api/v1/admin/back-in-stock', {
        items: [
          {
            productId: 'p1',
            variantId: 'v1',
            productName: 'Campera inflable',
            variantLabel: 'Negro / M',
            sku: 'CAM-N-M',
            waiting: 14,
            sinceUtc: '2026-10-01T10:00:00Z',
            available: 0,
          },
          {
            productId: 'p2',
            variantId: 'v2',
            productName: 'Gorro',
            variantLabel: null,
            sku: 'GOR',
            waiting: 3,
            sinceUtc: '2026-10-05T10:00:00Z',
            available: 4,
          },
        ],
        total: 2,
        totalWaiting: 17,
      }),
    );
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Campera inflable' })).toHaveAttribute(
      'href',
      '/productos/p1/editar',
    );
    expect(screen.getByText('Negro / M · CAM-N-M')).toBeInTheDocument();
    expect(screen.getByText(/se avisa en minutos/)).toBeInTheDocument();
  });

  it('sin nadie esperando lo dice', async () => {
    await open('/productos/esperando', 'Avisame cuando ingrese', (a) =>
      a.on('GET', '/api/v1/admin/back-in-stock', { items: [], total: 0, totalWaiting: 0 }),
    );
    expect(screen.getByText('Nadie está esperando un producto agotado.')).toBeInTheDocument();
  });

  it('la edición del producto dice cuánta gente lo espera', async () => {
    const products = fixture<{ items: { id: string }[] }>('/api/v1/products');
    const id = products.items[0]!.id;
    await open(`/productos/${id}/editar`, 'Editar producto', (a) =>
      a.on('GET', '/api/v1/admin/back-in-stock/products/:id', { waiting: 5, notified: 2, variants: [] }),
    );
    expect(await screen.findByRole('link', { name: '5 personas esperan que vuelva' })).toHaveAttribute(
      'href',
      '/productos/esperando',
    );
  });
});
