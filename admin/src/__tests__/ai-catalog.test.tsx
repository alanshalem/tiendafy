/**
 * Fichas del catálogo con IA en lote, del lado del panel: "Mejorar con IA" desde Productos (con lo elegido o con un filtro),
 * la cuenta previa (cuántos, costo estimado, tope) y crear el trabajo.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { AiCatalogPreview } from '../lib/aiCatalog';

const PREVIEW = '/api/v1/ai/catalog/jobs/preview';
const JOBS = '/api/v1/ai/catalog/jobs';

const ready = {
  tasks: [
    { task: 'CatalogWrite', available: true, reason: null, code: null },
    { task: 'CatalogJudge', available: true, reason: null, code: null },
  ],
};

const products = fixture<{ items: { id: string; name: string }[] }>('/api/v1/products#paged').items;

const preview = (over: Partial<AiCatalogPreview> = {}): AiCatalogPreview => ({
  count: 3,
  matched: 3,
  capped: false,
  estimatedCostMicroUsd: 40_674,
  budgetMicroUsd: 20_000_000,
  committedMicroUsd: 2_500_000,
  remainingMicroUsd: 17_500_000,
  fitsBudget: true,
  writeModel: 'Claude Sonnet 5.5',
  judgeModel: 'GPT-6 Luna',
  available: true,
  reason: null,
  ...over,
});

async function open(setup?: (api: MockApi) => void, status: unknown = ready) {
  const api = mockApi();
  api.on('GET', '/api/v1/ai/status', status);
  api.on('POST', PREVIEW, preview());
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos');
  await screen.findByText(products[0]!.name);
  await settle(2);
  return { api, user };
}

const previews = (api: MockApi) => api.calls.filter((c) => c.method === 'POST' && c.path === PREVIEW);

async function selectFirst(user: ReturnType<typeof userEvent.setup>, count: number) {
  for (const p of products.slice(0, count)) await user.click(screen.getByLabelText(`Seleccionar ${p.name}`));
}

describe('Mejorar con IA desde el catálogo', () => {
  it('con 3 productos elegidos pide la cuenta de esos 3 y muestra cuántos son y el costo', async () => {
    const { api, user } = await open();
    await selectFirst(user, 3);

    await user.click(screen.getByRole('button', { name: /Mejorar con IA/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    expect(await dialog.findByText('3 productos')).toBeInTheDocument();
    expect(previews(api).at(-1)!.body).toEqual({ productIds: products.slice(0, 3).map((p) => p.id) });
    expect(dialog.getByText(/US\$ 0,04/)).toBeInTheDocument();
    expect(dialog.getByText('Estimado.')).toBeInTheDocument();
    expect(dialog.getByText(/Te quedan US\$ 17,50 del tope de este mes/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeEnabled();
  });

  it('sin la IA lista, el botón queda deshabilitado con el motivo; sin armar, no existe', async () => {
    const reason =
      'La inteligencia artificial está apagada en esta tienda. Prendela en Configuración → Inteligencia artificial.';
    const { user } = await open(undefined, {
      tasks: [{ task: 'CatalogWrite', available: false, reason, code: 'Ai.Disabled' }],
    });
    await selectFirst(user, 1);

    const button = screen.getByRole('button', { name: /Mejorar con IA/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', reason);
  });

  it('una tienda que no armó la IA no ve el botón', async () => {
    const { user } = await open(undefined, {
      tasks: [
        { task: 'CatalogWrite', available: false, reason: 'Elegí un modelo.', code: 'Ai.TaskNotConfigured' },
      ],
    });
    await selectFirst(user, 1);

    expect(screen.queryByRole('button', { name: /Mejorar con IA/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mejorar fichas con IA/ })).toBeNull();
  });

  it('con available: false confirmar está deshabilitado y se ve el motivo', async () => {
    const reason =
      'Conectá tu cuenta de Mercado Libre: las fichas se completan con los atributos de su categoría.';
    const { user } = await open((api) => api.on('POST', PREVIEW, preview({ available: false, reason })));
    await selectFirst(user, 2);

    await user.click(screen.getByRole('button', { name: /Mejorar con IA/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    expect(await dialog.findByText(reason)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeDisabled();
  });

  it('sin elegir nada, el filtro arranca vacío y marcar "Sin descripción" lo manda', async () => {
    const { api, user } = await open();

    await user.click(screen.getByRole('button', { name: /Mejorar fichas con IA/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    expect(dialog.getByText('Marcá al menos una condición o elegí una categoría.')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeDisabled();
    expect(previews(api)).toHaveLength(0);

    await user.click(dialog.getByLabelText('Sin descripción'));
    await waitFor(() => expect(previews(api)).toHaveLength(1));
    expect(previews(api)[0]!.body).toEqual({
      filter: { missingDescription: true, shortDescription: false, missingMeliData: false },
    });

    await user.click(dialog.getByLabelText(/Sin datos de Mercado Libre/));
    await waitFor(() => expect(previews(api)).toHaveLength(2));
    expect(previews(api)[1]!.body).toMatchObject({
      filter: { missingDescription: true, missingMeliData: true },
    });
  });

  it('si hay más de 500, avisa que se toman los primeros 500', async () => {
    const { user } = await open((api) =>
      api.on('POST', PREVIEW, preview({ count: 500, matched: 731, capped: true })),
    );

    await user.click(screen.getByRole('button', { name: /Mejorar fichas con IA/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    await user.click(dialog.getByLabelText('Sin descripción'));

    expect(await dialog.findByText(/Se toman los primeros 500 de 731/)).toBeInTheDocument();
    expect(dialog.getByText('500 productos')).toBeInTheDocument();
  });

  it('si el tope no alcanza lo avisa pero deja confirmar', async () => {
    const { user } = await open((api) =>
      api.on('POST', PREVIEW, preview({ fitsBudget: false, remainingMicroUsd: 10_000 })),
    );
    await selectFirst(user, 3);

    await user.click(screen.getByRole('button', { name: /Mejorar con IA/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    expect(
      await dialog.findByText('El tope no alcanza para todos: el trabajo se va a pausar al llegar.'),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeEnabled();
  });

  it('un error de la cuenta previa se muestra en el diálogo', async () => {
    const { user } = await open((api) =>
      api.on(
        'POST',
        PREVIEW,
        { title: 'AiCatalog.Empty', detail: 'No hay productos para mejorar con esa elección.' },
        400,
      ),
    );
    await selectFirst(user, 1);

    await user.click(screen.getByRole('button', { name: /Mejorar con IA/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    expect(await dialog.findByText('No hay productos para mejorar con esa elección.')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeDisabled();
  });

  it('confirmar crea el trabajo con lo mismo que se previsualizó', async () => {
    const { api, user } = await open((a) =>
      a.on('POST', JOBS, { jobId: 'f3c1a5f0-0000-4000-8000-000000000001', total: 3 }),
    );
    await selectFirst(user, 3);
    await user.click(screen.getByRole('button', { name: /Mejorar con IA/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    await dialog.findByText('3 productos');

    await user.click(dialog.getByRole('button', { name: /Confirmar/ }));
    await settle(2);

    const created = api.calls.filter((c) => c.method === 'POST' && c.path === JOBS);
    expect(created).toHaveLength(1);
    expect(created[0]!.body).toEqual({ productIds: products.slice(0, 3).map((p) => p.id) });
  });

  it('con más de 500 elegidos avisa y no deja confirmar', async () => {
    // El listado no junta tantos de una: se prueba el diálogo suelto con 501 ids.
    const { AiCatalogDialog } = await import('../pages/Products/AiCatalogDialog');
    const { renderWithProviders } = await import('../test/render');
    const api = mockApi();
    api.on('GET', '/api/v1/ai/status', ready);
    renderWithProviders(
      <AiCatalogDialog
        open
        onClose={() => {}}
        productIds={Array.from({ length: 501 }, (_, i) => `id-${i}`)}
      />,
    );
    await settle(3);

    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Elegiste 501 productos y el máximo por vez es 500');
    expect(dialog.getByRole('button', { name: /Confirmar/ })).toBeDisabled();
    expect(previews(api)).toHaveLength(0);
  });
});
