/**
 * Mercado Libre desde el panel, con la cuenta demo sembrada: facturar una
 * venta de ML, el chat del pack, responder preguntas (a mano o con la
 * sugerencia de la IA), y las publicaciones — vincular una al catálogo,
 * desvincularla, y publicar un producto nuevo con la categoría que sugiere ML.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { rx } from '../test/text';
import { settle } from '../test/explore';

interface MeliOrder {
  meliOrderId: number;
  packId: number | null;
  status: string;
  buyerNickname: string | null;
  fiscalDocumentId: string | null;
}
interface MeliItem {
  id: string;
  title: string;
  link: { meliVariationId: string | null } | null;
}
const orders = fixture<{ items: MeliOrder[] }>('/api/v1/admin/meli/orders').items;
const toInvoice = orders.find((o) => o.status === 'paid' && !o.fiscalDocumentId)!;
const items = fixture<{ items: MeliItem[] }>('/api/v1/admin/meli/items').items;
const question = fixture<{ questions: { id: number; text: string; status: string }[] }>(
  '/api/v1/admin/meli/questions',
).questions.find((q) => q.status === 'UNANSWERED')!;
const product = fixture<{ items: { id: string; name: string }[] }>('/api/v1/products').items[0]!;

async function open(tab: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(`/mercadolibre?tab=${tab}`);
  await settle(4);
  return { api, user };
}

const posted = (api: MockApi, path: string) =>
  api.calls.filter((c) => c.method === 'POST' && c.path === path).at(-1)?.body;

describe('Mercado Libre: ventas', () => {
  it('factura una venta pagada (con confirmación) y queda marcada', async () => {
    const { api, user } = await open('ventas', (a) =>
      a.on('POST', `/api/v1/admin/meli/orders/${toInvoice.meliOrderId}/invoice`, {
        cae: '7412',
        ptoVta: 3,
        number: 9,
      }),
    );
    await user.click(screen.getAllByRole('button', { name: /Facturar/ })[0]!);
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Emitir comprobante ARCA' })).getByRole('button', {
        name: 'Facturar',
      }),
    );
    expect(await screen.findByText(/Comprobante 0003-00000009 emitido \(CAE 7412\)/)).toBeInTheDocument();
    expect(posted(api, `/api/v1/admin/meli/orders/${toInvoice.meliOrderId}/invoice`)).toEqual({});
  });

  it('si ARCA no está lista, lo dice', async () => {
    const { user } = await open('ventas', (a) =>
      a.on(
        'POST',
        `/api/v1/admin/meli/orders/${toInvoice.meliOrderId}/invoice`,
        { detail: 'Configurá la facturación primero.' },
        409,
      ),
    );
    await user.click(screen.getAllByRole('button', { name: /Facturar/ })[0]!);
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Emitir comprobante ARCA' })).getByRole('button', {
        name: 'Facturar',
      }),
    );
    expect(await screen.findByText('Configurá la facturación primero.')).toBeInTheDocument();
  });

  it('el chat del pack: lee los mensajes y responde', async () => {
    const { api, user } = await open('ventas');
    await user.click(screen.getAllByRole('button', { name: /Mensajes/ })[0]!);
    const dialog = within(await screen.findByRole('dialog', { name: /Chat con/ }));
    expect(await dialog.findByText('Buenas! Ya salió el envío?')).toBeInTheDocument();
    await user.type(dialog.getByPlaceholderText(/Escribí tu respuesta/), 'Sale hoy');
    await user.click(dialog.getByRole('button', { name: /Enviar/ }));
    await settle(2);
    const sent = api.calls.find((c) => c.method === 'POST' && /\/packs\/\d+\/messages$/.test(c.path));
    expect(sent?.body).toEqual({ text: 'Sale hoy' });
  });
});

describe('Mercado Libre: preguntas', () => {
  it('responde a mano y con la sugerencia de la IA; filtra sin responder / todas', async () => {
    const { api, user } = await open('preguntas', (a) => {
      a.on('GET', '/api/v1/ai/status', { enabled: true });
      a.on('POST', '/api/v1/ai/ml-answer', { text: 'Sí, es compatible.' });
    });
    expect(await screen.findByText(question.text)).toBeInTheDocument();

    const card = screen.getByText(question.text).closest('div.rounded-lg') as HTMLElement;
    await user.click(within(card).getByTitle(/Sugerir una respuesta con IA/));
    await waitFor(() => expect(within(card).getByDisplayValue('Sí, es compatible.')).toBeInTheDocument());
    await user.type(within(card).getByPlaceholderText('Escribí tu respuesta…'), ' ¡Saludos!{Enter}');
    await settle(2);
    expect(posted(api, `/api/v1/admin/meli/questions/${question.id}/answer`)).toEqual({
      text: 'Sí, es compatible. ¡Saludos!',
    });

    await user.click(screen.getByRole('button', { name: 'Todas' }));
    await settle(2);
    await user.click(screen.getByRole('button', { name: 'Sin responder' }));
  });
});

describe('Mercado Libre: publicaciones', () => {
  const unlinked = items.find((i) => !i.link)!;
  const linked = items.find((i) => i.link);

  it('vincula una publicación con un producto del catálogo', async () => {
    const { api, user } = await open('publicaciones');
    const row = (await screen.findByText(unlinked.title)).closest(
      'div.rounded-lg, div[class*="rounded"]',
    ) as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Vincular' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Vincular con tu catálogo' }));
    expect(dialog.getByRole('button', { name: /Vincular/ })).toBeDisabled();
    await user.type(
      dialog.getByPlaceholderText('Buscar producto por nombre o SKU…'),
      product.name.slice(0, 5),
    );
    await user.click(await dialog.findByRole('button', { name: rx(product.name) }));
    expect(dialog.getByText(/Elegido:/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: /^Vincular/ }));
    await settle(2);
    expect(posted(api, `/api/v1/admin/meli/items/${unlinked.id}/link`)).toMatchObject({
      productId: product.id,
      title: unlinked.title,
    });
  });

  it('desvincula una publicación vinculada', async () => {
    if (!linked) return;
    const { api, user } = await open('publicaciones');
    const row = (await screen.findByText(linked.title)).closest('div[class*="rounded"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Desvincular' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Desvincular publicación' })).getByRole('button', {
        name: 'Desvincular',
      }),
    );
    await settle(2);
    expect(
      api.calls.some(
        (c) => c.method === 'DELETE' && c.path.startsWith(`/api/v1/admin/meli/items/${linked.id}/link`),
      ),
    ).toBe(true);
  });

  it('publica un producto con la categoría que sugiere Mercado Libre', async () => {
    const { api, user } = await open('publicaciones', (a) => {
      a.on('GET', '/api/v1/admin/meli/categories/predict', {
        suggestions: [
          { categoryId: 'MLA1234', categoryName: 'Mancuernas', domainName: 'Fitness' },
          { categoryId: 'MLA9999', categoryName: 'Pesas', domainName: null },
        ],
      });
      a.on('POST', `/api/v1/admin/meli/products/${product.id}/publish`, {
        itemId: 'MLA555',
        permalink: null,
      });
    });
    await user.click(screen.getByRole('button', { name: /Publicar un producto en ML/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Publicar en Mercado Libre' }));
    await user.type(
      dialog.getByPlaceholderText('Buscar producto por nombre o SKU…'),
      product.name.slice(0, 5),
    );
    await user.click(await dialog.findByRole('button', { name: rx(product.name) }));
    await user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Categoría de Mercado Libre' }),
      'MLA9999',
    );
    await user.click(dialog.getByRole('button', { name: /^Publicar/ }));
    await settle(2);
    expect(posted(api, `/api/v1/admin/meli/products/${product.id}/publish`)).toEqual({
      categoryId: 'MLA9999',
    });
    expect(await screen.findByText(/Publicado en Mercado Libre! \(MLA555\)/)).toBeInTheDocument();
  });

  it('sin categoría sugerida avisa y no deja publicar', async () => {
    const { user } = await open('publicaciones', (a) =>
      a.on('GET', '/api/v1/admin/meli/categories/predict', { suggestions: [] }),
    );
    await user.click(screen.getByRole('button', { name: /Publicar un producto en ML/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Publicar en Mercado Libre' }));
    await user.type(
      dialog.getByPlaceholderText('Buscar producto por nombre o SKU…'),
      product.name.slice(0, 5),
    );
    await user.click(await dialog.findByRole('button', { name: rx(product.name) }));
    expect(await dialog.findByText(/no sugirió una categoría/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /^Publicar/ })).toBeDisabled();
  });
});
