/**
 * Fichas del catálogo con IA, del lado del panel (segunda parte): la lista de trabajos, la revisión de las fichas de uno
 * (aprobar, editar, descartar, elegir la categoría), pausar y reanudar, y actualizar la ficha en Mercado Libre.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { AiCatalogItem, AiCatalogJob, AiCatalogPreview } from '../lib/aiCatalog';

const JOBS = '/api/v1/ai/catalog/jobs';
const ITEMS = '/api/v1/ai/catalog/items';
const JOB_ID = '7f1c0a52-3b6e-4d57-9d2b-5a1f0c9e7b01';
const JOB = `${JOBS}/${JOB_ID}`;
const ITEM_ID = '0b9e6c1e-8f3c-4a43-b61c-2f0a5d4c1a11';

const ready = {
  tasks: [
    { task: 'CatalogWrite', available: true, reason: null, code: null },
    { task: 'CatalogJudge', available: true, reason: null, code: null },
  ],
};

const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
const products = fixture<{ items: { id: string; name: string }[] }>('/api/v1/products#paged').items;

const job = (
  over: Partial<AiCatalogJob> = {},
  byStatus: Partial<AiCatalogJob['byStatus']> = {},
): AiCatalogJob => ({
  id: JOB_ID,
  status: 'Done',
  total: 3,
  processed: 3,
  byStatus: { Pending: 0, NeedsCategory: 0, Review: 0, Approved: 0, Discarded: 0, Failed: 0, ...byStatus },
  estimatedCostMicroUsd: 40_674,
  actualCostMicroUsd: 31_200,
  pauseReason: null,
  createdAt: '2026-10-26T15:00:00Z',
  createdByName: 'Ana Dueña',
  ...over,
});

const item = (over: Partial<AiCatalogItem> = {}): AiCatalogItem => ({
  id: ITEM_ID,
  productId: products[0]!.id,
  status: 'Review',
  passed: true,
  attempts: 1,
  score: 5,
  judgeNotes: null,
  current: {
    name: 'Taladro percutor Bosch',
    description: 'Taladro viejo.',
    seoTitle: null,
    seoDescription: null,
    brand: 'Bosch',
    specs: [{ name: 'Material', value: 'Acero' }],
  },
  proposal: {
    description: 'Un taladro percutor pensado para el hogar y el taller.',
    seoTitle: 'Taladro percutor Bosch',
    seoDescription: 'Taladro percutor Bosch para el hogar y el taller.',
    attributes: [
      {
        id: 'COLOR',
        name: 'Color',
        value: 'Negro',
        valueId: '52049',
        valueName: 'Negro',
        unit: null,
        target: 'meli',
      },
      {
        id: 'POWER',
        name: 'Potencia',
        value: '600 W',
        valueId: null,
        valueName: '600',
        unit: null,
        target: 'spec',
      },
    ],
  },
  missing: [
    {
      attributeId: 'GTIN',
      name: 'GTIN',
      kind: 'Text',
      values: [],
      units: [],
      defaultUnit: null,
      required: true,
    },
  ],
  category: { id: 'MLA1', name: 'Taladros eléctricos' },
  suggestions: [],
  hasMeliListing: false,
  failureReason: null,
  ...over,
});

interface ReviewOptions {
  jobData?: AiCatalogJob;
  passed?: number;
  setup?: (api: MockApi) => void;
  permissions?: string[];
}

async function openReview(items: AiCatalogItem[], options: ReviewOptions = {}) {
  const { jobData = job({}, { Review: items.length }), passed, setup, permissions } = options;
  const api = mockApi();
  api.on('GET', '/api/v1/ai/status', ready);
  if (permissions) api.on('GET', '/api/v1/me/permissions', { ...perms, permissions });
  api.on('GET', JOB, jobData);
  api.on('GET', `${JOB}/items`, {
    items,
    total: items.length,
    passed: passed ?? items.filter((i) => i.passed).length,
  });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(`/productos/fichas-ia/${JOB_ID}`);
  await screen.findByRole('heading', { name: /Revisar fichas con IA/ });
  await settle(2);
  return { api, user };
}

const posted = (api: MockApi, path: string) =>
  api.calls.filter((c) => c.method === 'POST' && c.path === path);

describe('lista de trabajos de fichas con IA', () => {
  it('muestra cada trabajo con su estado, su avance y su costo, y lleva a la revisión', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/ai/status', ready);
    api.on('GET', JOBS, { items: [job({ status: 'PausedBudget', processed: 1 })] });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/productos/fichas-ia');

    expect(await screen.findByText('3 productos')).toBeInTheDocument();
    expect(screen.getByText('Pausado por el tope')).toBeInTheDocument();
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByText(/Ana Dueña/)).toBeInTheDocument();

    api.on('GET', JOB, job());
    await user.click(screen.getByRole('link', { name: /3 productos/ }));
    expect(await screen.findByRole('heading', { name: /Revisar fichas con IA/ })).toBeInTheDocument();
  });

  it('sin trabajos explica cómo empezar', async () => {
    const api = mockApi();
    api.on('GET', JOBS, { items: [] });
    renderApp('/productos/fichas-ia');
    expect(await screen.findByText('Todavía no mejoraste fichas con IA')).toBeInTheDocument();
  });
});

describe('revisión de fichas', () => {
  it('muestra lo actual y lo propuesto, y "Le falta para Mercado Libre" con el GTIN', async () => {
    await openReview([item()]);

    const card = within(screen.getByRole('article', { name: 'Ficha de Taladro percutor Bosch' }));
    expect(card.getByText('Taladro viejo.')).toBeInTheDocument();
    expect(card.getByLabelText('Descripción')).toHaveValue(
      'Un taladro percutor pensado para el hogar y el taller.',
    );
    expect(card.getByText('Pasó la evaluación')).toBeInTheDocument();
    expect(card.getByText('Ficha de la tienda')).toBeInTheDocument();
    expect(card.getByText('Solo Mercado Libre')).toBeInTheDocument();
    expect(card.getByRole('group', { name: 'Le falta para Mercado Libre' })).toBeInTheDocument();
    expect(card.getByLabelText('GTIN (obligatorio)')).toBeInTheDocument();
  });

  it('completar el GTIN y aprobar manda ese dato (y lo editado)', async () => {
    const { api, user } = await openReview([item()]);
    const card = within(screen.getByRole('article', { name: 'Ficha de Taladro percutor Bosch' }));

    await user.type(card.getByLabelText('GTIN (obligatorio)'), '4006381333931');
    await user.clear(card.getByLabelText('Título SEO'));
    await user.type(card.getByLabelText('Título SEO'), 'Mi título');
    await user.click(card.getByRole('button', { name: /Aprobar/ }));
    await settle(2);

    const body = posted(api, `${ITEMS}/${ITEM_ID}/approve`).at(0)!.body as { attributes: unknown[] };
    expect(body).toMatchObject({
      description: 'Un taladro percutor pensado para el hogar y el taller.',
      seoTitle: 'Mi título',
    });
    expect(body.attributes).toEqual([{ id: 'GTIN', valueName: '4006381333931' }]);
    // Aprobar vuelve a leer el trabajo y sus fichas.
    expect(api.calls.filter((c) => c.method === 'GET' && c.path === JOB).length).toBeGreaterThan(1);
  });

  it('un dato de lista se elige y viaja con su id; un número con unidad, con su unidad', async () => {
    const missing: AiCatalogItem['missing'] = [
      {
        attributeId: 'IS_KIT',
        name: 'Es kit',
        kind: 'Boolean',
        required: false,
        units: [],
        defaultUnit: null,
        values: [
          { id: '242085', name: 'Sí' },
          { id: '242084', name: 'No' },
        ],
      },
      {
        attributeId: 'LENGTH',
        name: 'Largo del cable',
        kind: 'NumberUnit',
        required: false,
        values: [],
        units: ['cm', 'm'],
        defaultUnit: 'm',
      },
    ];
    const { api, user } = await openReview([item({ missing })]);
    const card = within(screen.getByRole('article'));

    await user.selectOptions(card.getByLabelText('Es kit'), '242084');
    await user.type(card.getByLabelText('Largo del cable'), '2');
    await user.click(card.getByRole('button', { name: /Aprobar/ }));
    await settle(2);

    const body = posted(api, `${ITEMS}/${ITEM_ID}/approve`).at(0)!.body as { attributes: unknown[] };
    expect(body.attributes).toEqual([
      { id: 'IS_KIT', valueId: '242084', valueName: 'No' },
      { id: 'LENGTH', valueName: '2', unit: 'm' },
    ]);
  });

  it('lo que se deja vacío no se manda', async () => {
    const { api, user } = await openReview([item()]);

    await user.click(within(screen.getByRole('article')).getByRole('button', { name: /Aprobar/ }));
    await settle(2);

    const body = posted(api, `${ITEMS}/${ITEM_ID}/approve`).at(0)!.body as { attributes: unknown[] };
    expect(body.attributes).toEqual([]);
  });

  it('si el servidor rechaza un dato, avisa y deja la ficha para corregirla', async () => {
    const { api, user } = await openReview([item()], {
      setup: (a) =>
        a.on(
          'POST',
          `${ITEMS}/${ITEM_ID}/approve`,
          { title: 'AiCatalog.BadEdit', detail: 'El GTIN «1» no es válido: revisá los dígitos.' },
          400,
        ),
    });
    const card = within(screen.getByRole('article'));
    await user.type(card.getByLabelText('GTIN (obligatorio)'), '1');
    await user.click(card.getByRole('button', { name: /Aprobar/ }));

    expect(await screen.findByText('El GTIN «1» no es válido: revisá los dígitos.')).toBeInTheDocument();
    expect(posted(api, `${ITEMS}/${ITEM_ID}/approve`)).toHaveLength(1);
    expect(card.getByLabelText('GTIN (obligatorio)')).toHaveValue('1');
  });

  it('descartar no guarda nada y lo avisa', async () => {
    const { api, user } = await openReview([item()]);

    await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Descartar' }));
    await settle(2);

    expect(posted(api, `${ITEMS}/${ITEM_ID}/discard`)).toHaveLength(1);
    expect(await screen.findByText('Ficha descartada. No se guardó nada.')).toBeInTheDocument();
  });

  it('una ficha que no pasó muestra el puntaje y lo que marcó el evaluador', async () => {
    await openReview([
      item({ passed: false, score: 3, judgeNotes: 'Sacá la potencia: no figura.\nSuena exagerada.' }),
    ]);

    const card = within(screen.getByRole('article'));
    expect(card.getByText(/puntaje 3 de 5/)).toBeInTheDocument();
    expect(card.getByText('Sacá la potencia: no figura.')).toBeInTheDocument();
    expect(card.getByText('Suena exagerada.')).toBeInTheDocument();
  });

  it('"Elegí la categoría" ofrece las sugerencias y al elegir una la manda', async () => {
    const needs = item({
      status: 'NeedsCategory',
      proposal: null,
      missing: [],
      category: null,
      suggestions: [
        { id: 'MLA7', name: 'Taladros eléctricos' },
        { id: 'MLA8', name: 'Atornilladores' },
      ],
    });
    const { api, user } = await openReview([needs], { jobData: job({}, { NeedsCategory: 1 }) });

    const picker = within(await screen.findByRole('group', { name: 'Categorías sugeridas' }));
    expect(picker.getAllByRole('button')).toHaveLength(2);
    await user.click(picker.getByRole('button', { name: 'Atornilladores' }));
    await settle(2);

    const put = api.calls.find((c) => c.method === 'PUT' && c.path === `${ITEMS}/${ITEM_ID}/category`);
    expect(put?.body).toEqual({ categoryId: 'MLA8' });
  });

  it('"Elegí la categoría" también busca con lo que escribe la persona', async () => {
    const needs = item({
      status: 'NeedsCategory',
      proposal: null,
      missing: [],
      category: null,
      suggestions: [],
    });
    const { api, user } = await openReview([needs], {
      jobData: job({}, { NeedsCategory: 1 }),
      setup: (a) =>
        a.on('GET', '/api/v1/ai/catalog/categories/search', {
          suggestions: [
            { categoryId: 'MLA55', categoryName: 'Taladros de banco', domainName: 'Herramientas' },
          ],
        }),
    });

    await user.type(screen.getByPlaceholderText(/Buscar otra categoría/), 'taladro');
    const results = within(await screen.findByRole('group', { name: 'Resultados de la búsqueda' }));
    await user.click(results.getByRole('button', { name: 'Taladros de banco · Herramientas' }));
    await settle(2);

    expect(api.calls.some((c) => c.path.startsWith('/api/v1/ai/catalog/categories/search?q=taladro'))).toBe(
      true,
    );
    expect(
      api.calls.find((c) => c.method === 'PUT' && c.path === `${ITEMS}/${ITEM_ID}/category`)?.body,
    ).toEqual({
      categoryId: 'MLA55',
    });
  });

  it('"Aprobar todos los que pasaron" pide confirmación con la cuenta y llama al servidor', async () => {
    const two = [item({ id: 'a1' }), item({ id: 'a2', passed: false })];
    const { api, user } = await openReview(two, {
      passed: 2,
      setup: (a) => a.on('POST', `${JOB}/approve-passed`, { approved: 2, failed: [] }),
    });

    await user.click(screen.getByRole('button', { name: /Aprobar todos los que pasaron/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Aprobar las que pasaron' }));
    expect(
      dialog.getByText('Se guardan 2 fichas en tu tienda. Mercado Libre no cambia hasta que lo actualices.'),
    ).toBeInTheDocument();
    expect(posted(api, `${JOB}/approve-passed`)).toHaveLength(0);

    await user.click(dialog.getByRole('button', { name: 'Aprobar' }));
    await settle(2);
    expect(posted(api, `${JOB}/approve-passed`)).toHaveLength(1);
    expect(await screen.findByText('2 fichas aprobadas.')).toBeInTheDocument();
  });

  it('un trabajo pausado por el tope muestra el motivo y "Reanudar"', async () => {
    const reason = 'Se alcanzó el tope mensual de IA. Subilo o esperá al mes que viene y reanudá.';
    const { api, user } = await openReview([], {
      jobData: job({ status: 'PausedBudget', processed: 1, pauseReason: reason }, { Pending: 2 }),
    });

    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText(/faltan 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reanudar/ }));
    await settle(2);

    expect(posted(api, `${JOB}/resume`)).toHaveLength(1);
  });

  it('cancelar pide confirmación', async () => {
    const { api, user } = await openReview([], { jobData: job({ status: 'Running' }, { Pending: 2 }) });

    await user.click(screen.getByRole('button', { name: /^Cancelar$/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Cancelar el trabajo' }));
    expect(posted(api, `${JOB}/cancel`)).toHaveLength(0);
    await user.click(dialog.getByRole('button', { name: 'Cancelar el trabajo' }));
    await settle(2);

    expect(posted(api, `${JOB}/cancel`)).toHaveLength(1);
  });

  it('un trabajo terminado no vuelve a preguntar solo', async () => {
    const { api } = await openReview([item()]);
    const jobCalls = () => api.calls.filter((c) => c.method === 'GET' && c.path === JOB).length;

    const before = jobCalls();
    await settle(3);

    expect(jobCalls()).toBe(before);
  });

  it('un trabajo que no existe muestra el error', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/ai/status', ready);
    api.on('GET', JOB, { title: 'AiCatalog.JobNotFound', detail: 'Ese trabajo de fichas no existe.' }, 404);
    renderApp(`/productos/fichas-ia/${JOB_ID}`);

    expect((await screen.findAllByText('Ese trabajo de fichas no existe.')).length).toBeGreaterThan(0);
  });
});

describe('actualizar la ficha en Mercado Libre', () => {
  const approved = (over: Partial<AiCatalogItem> = {}) =>
    item({ status: 'Approved', missing: [], hasMeliListing: true, ...over });

  it('no aparece sin el permiso de publicar en ML', async () => {
    await openReview([approved()], {
      jobData: job({}, { Approved: 1 }),
      permissions: perms.permissions.filter((p) => p !== 'meli.publish'),
    });

    expect(screen.queryByRole('button', { name: /Actualizar la ficha en ML/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actualizar en ML los aprobados/ })).toBeNull();
  });

  it('por producto: una publicación, un clic', async () => {
    const { api, user } = await openReview([approved()], {
      jobData: job({}, { Approved: 1 }),
      setup: (a) => a.on('POST', `${ITEMS}/${ITEM_ID}/push-to-meli`, { updatedListings: 1 }),
    });

    await user.click(screen.getByRole('button', { name: 'Actualizar la ficha en ML' }));
    await settle(2);

    expect(posted(api, `${ITEMS}/${ITEM_ID}/push-to-meli`)).toHaveLength(1);
    expect(await screen.findByText('Se actualizó la publicación en Mercado Libre.')).toBeInTheDocument();
  });

  it('una ficha aprobada sin publicación no ofrece actualizar', async () => {
    await openReview([approved({ hasMeliListing: false })], { jobData: job({}, { Approved: 1 }) });

    expect(screen.queryByRole('button', { name: 'Actualizar la ficha en ML' })).toBeNull();
    expect(screen.getByText('Aprobada y guardada en tu tienda.')).toBeInTheDocument();
  });

  it('en lote: vuelve a llamar con after hasta que next sea null y lista lo que falló', async () => {
    const second = '11111111-2222-4333-8444-555555555555';
    const failedProduct = '99999999-2222-4333-8444-555555555555';
    const { api, user } = await openReview([approved()], {
      jobData: job({}, { Approved: 25 }),
      setup: (a) =>
        a.on('POST', `${JOB}/push-to-meli`, (body: unknown) =>
          (body as { after?: string }).after === undefined
            ? { updated: 20, failed: [], next: second }
            : {
                updated: 4,
                failed: [{ productId: failedProduct, message: 'Mercado Libre: item.attributes.invalid' }],
                next: null,
              },
        ),
    });

    await user.click(screen.getByRole('button', { name: 'Actualizar en ML los aprobados' }));
    await settle(3);

    const calls = posted(api, `${JOB}/push-to-meli`);
    expect(calls.map((c) => c.body)).toEqual([{ limit: 20 }, { after: second, limit: 20 }]);
    const summary = within(screen.getByRole('region', { name: 'Actualización en Mercado Libre' }));
    expect(summary.getByText(/24 productos actualizados/)).toBeInTheDocument();
    expect(summary.getByText(/Mercado Libre: item.attributes.invalid/)).toBeInTheDocument();
  });
});

describe('crear el trabajo lleva a su revisión', () => {
  it('confirmar en el diálogo abre la pantalla del trabajo creado', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/ai/status', ready);
    api.on('POST', `${JOBS}/preview`, {
      count: 3,
      matched: 3,
      capped: false,
      estimatedCostMicroUsd: 40_674,
      budgetMicroUsd: 20_000_000,
      committedMicroUsd: 0,
      remainingMicroUsd: 20_000_000,
      fitsBudget: true,
      writeModel: 'Claude Sonnet 5.5',
      judgeModel: 'GPT-6 Luna',
      available: true,
      reason: null,
    } satisfies AiCatalogPreview);
    api.on('POST', JOBS, { jobId: JOB_ID, total: 3 });
    api.on('GET', JOB, job({ status: 'Queued', processed: 0 }, { Pending: 3 }));
    api.on('GET', `${JOB}/items`, { items: [], total: 0, passed: 0 });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/productos');
    await screen.findByText(products[0]!.name);
    await settle(2);
    for (const p of products.slice(0, 3)) await user.click(screen.getByLabelText(`Seleccionar ${p.name}`));
    await user.click(screen.getByRole('button', { name: /Mejorar con IA/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Mejorar fichas con IA' }));
    await dialog.findByText('3 productos');

    await user.click(dialog.getByRole('button', { name: /Confirmar/ }));

    expect(await screen.findByRole('heading', { name: /Revisar fichas con IA/ })).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'GET' && c.path === JOB)).toBe(true);
    expect(await screen.findByText('En cola')).toBeInTheDocument();
  });
});
