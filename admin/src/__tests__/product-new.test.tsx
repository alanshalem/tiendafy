/**
 * Alta de producto desde el panel: el flujo simple (precio, promo, stock
 * limitado, imágenes) y el de variantes (opciones → combinaciones con precio,
 * SKU y stock por fila). Se verifica lo que viaja a la API, en orden: crear,
 * subir y adjuntar imágenes, cargar el stock inicial de cada variante. Y que
 * cada campo que se ve se guarda: código de barras, peso y medidas, marca,
 * categorías y SEO.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const created = fixture<{ id: string; variants: { id: string; sku: string; optionValues: string[] }[] }>(
  '/api/v1/products/:id',
);

async function open(api: MockApi) {
  api.on('POST', '/api/v1/products', { ...created, name: 'Remera' });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/nuevo');
  await screen.findByRole('heading', { name: 'Nuevo producto' });
  return user;
}

const writes = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path.startsWith(path));

describe('nuevo producto', () => {
  it('simple: precio con promo, stock limitado e imágenes', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example.com/remera.jpg' });
    const user = await open(api);

    const save = screen.getByRole('button', { name: 'Guardar producto' });
    expect(save).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Remera oversize'), 'Remera');
    await user.type(screen.getAllByPlaceholderText('28900')[0]!, '28900');
    await user.type(screen.getAllByPlaceholderText('—')[0]!, '25000');
    await user.click(screen.getByLabelText('Limitado'));
    await user.type(screen.getByPlaceholderText('Cantidad'), '7x');
    await user.type(screen.getByPlaceholderText('REM-001'), 'rem-1');
    await user.type(screen.getByLabelText(/^Código de barras/), '7790001112223');
    await user.type(screen.getByLabelText('Peso del paquete (kg)'), '1,5');
    await user.type(screen.getByLabelText('Largo (cm)'), '30');
    await user.type(screen.getByLabelText('Ancho (cm)'), '20');
    // Una medida sola no arma una caja: hasta completar las tres no se guarda.
    expect(
      await screen.findByText('Cargá las tres medidas (largo, ancho y alto) o ninguna.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Alto (cm)'), '10');
    await user.type(screen.getByPlaceholderText('Sin marca'), 'Hierro Pro');
    const category = (await screen.findAllByRole('button', { pressed: false })).find((b) =>
      b.closest('section')?.textContent?.startsWith('Categorías'),
    )!;
    await user.click(category);
    await user.type(screen.getByLabelText(/Título SEO/), 'Remera barata');
    await user.upload(
      document.querySelector<HTMLInputElement>('input[type=file]')!,
      new File(['png'], 'remera.png', { type: 'image/png' }),
    );
    expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeInTheDocument();
    await user.click(screen.getByLabelText('Mostrar en la tienda')); // queda como borrador

    expect(save).toBeEnabled();
    await user.click(save);
    await settle(4);

    const [create] = writes(api, 'POST', '/api/v1/products');
    expect(create!.body).toMatchObject({
      name: 'Remera',
      options: [],
      publish: false,
      variants: [
        {
          sku: 'REM-1',
          optionValues: [],
          currency: 'ARS',
          barcode: '7790001112223',
          weightGrams: 1500,
          lengthCm: 30,
          widthCm: 20,
          heightCm: 10,
        },
      ],
    });
    // Lo que el alta no recibe se guarda enseguida sobre el producto creado.
    expect(writes(api, 'PATCH', `/api/v1/products/${created.id}`)[0]!.body).toMatchObject({
      name: 'Remera',
      brand: 'Hierro Pro',
      seoTitle: 'Remera barata',
    });
    expect(writes(api, 'PUT', `/api/v1/products/${created.id}/categories`)[0]!.body).toEqual({
      categoryIds: [expect.any(String)],
    });
    expect(writes(api, 'POST', `/api/v1/products/${created.id}/images`)[0]!.body).toEqual({
      url: 'https://cdn.example.com/remera.jpg',
      altText: 'Remera',
    });
    expect(writes(api, 'PUT', `/api/v1/inventory/${created.variants[0]!.id}`)[0]!.body).toEqual({
      available: 7,
      reason: 'Alta de producto',
    });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Nuevo producto' })).not.toBeInTheDocument(),
    );
  });

  it('una imagen agregada se puede quitar antes de guardar', async () => {
    const api = mockApi();
    const user = await open(api);
    await user.upload(
      document.querySelector<HTMLInputElement>('input[type=file]')!,
      new File(['png'], 'a.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    expect(screen.queryByRole('button', { name: 'Quitar imagen' })).not.toBeInTheDocument();
  });

  it('con variantes: combinaciones, precio/SKU/stock por fila y stock inicial por variante', async () => {
    const api = mockApi();
    // La API devuelve las variantes creadas: el stock se carga por SKU o por combinación.
    api.on('GET', `/api/v1/products/${created.id}`, {
      ...created,
      variants: [
        { id: 'v-s-rojo', sku: 'REMERA-S-ROJO', optionValues: ['S', 'Rojo'] },
        { id: 'v-m-rojo', sku: 'OTRO', optionValues: ['M', 'Rojo'] },
      ],
    });
    const user = await open(api);
    await user.type(screen.getByPlaceholderText('Remera oversize'), 'Remera');
    await user.click(screen.getByLabelText('Este producto tiene variantes'));

    await user.type(screen.getByPlaceholderText('Talle'), 'Talle');
    await user.type(screen.getByPlaceholderText('S, M, L'), 'S, M, s, ');
    await user.click(screen.getByRole('button', { name: /Agregar opción/ }));
    const names = screen.getAllByPlaceholderText('Talle');
    const values = screen.getAllByPlaceholderText('S, M, L');
    await user.type(names[1]!, 'Color');
    await user.type(values[1]!, 'Rojo');
    await user.click(screen.getByRole('button', { name: /Agregar opción/ }));
    expect(screen.getByText('Máximo 3 opciones.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Quitar opción' }).at(-1)!);

    // Dos combinaciones: S/Rojo y M/Rojo.
    const table = within(screen.getByRole('table'));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const [s, m] = rows.map((r) => within(r));
    expect(screen.getByRole('button', { name: 'Guardar producto' })).toBeDisabled(); // falta precio
    await user.type(s!.getByPlaceholderText('28900'), '1000');
    await user.type(m!.getByPlaceholderText('28900'), '1200');
    await user.type(m!.getAllByPlaceholderText('—')[0]!, '1100');
    await user.type(s!.getAllByPlaceholderText('—').at(-1)!, '4');
    await user.type(m!.getAllByPlaceholderText('—').at(-1)!, '2a');
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    await settle(4);

    const body = writes(api, 'POST', '/api/v1/products')[0]!.body as {
      options: unknown;
      variants: { sku: string }[];
    };
    expect(body.options).toEqual([
      { name: 'Talle', values: ['S', 'M'] },
      { name: 'Color', values: ['Rojo'] },
    ]);
    expect(body.variants.map((v) => v.sku)).toEqual(['REMERA-S-ROJO', 'REMERA-M-ROJO']);
    expect(writes(api, 'PUT', '/api/v1/inventory/v-s-rojo')[0]!.body).toMatchObject({ available: 4 });
    expect(writes(api, 'PUT', '/api/v1/inventory/v-m-rojo')[0]!.body).toMatchObject({ available: 2 });
  });

  it('si la API rechaza el producto, muestra el motivo', async () => {
    const api = mockApi();
    const user = await open(api);
    api.on(
      'POST',
      '/api/v1/products',
      { title: 'Conflict', detail: 'Ya existe un producto con ese SKU.' },
      409,
    );
    await user.type(screen.getByPlaceholderText('Remera oversize'), 'Remera');
    await user.type(screen.getAllByPlaceholderText('28900')[0]!, '100');
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByText('Ya existe un producto con ese SKU.')).toBeInTheDocument();
  });

  it('cancelar vuelve al listado', async () => {
    const api = mockApi();
    const user = await open(api);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Nuevo producto' })).not.toBeInTheDocument(),
    );
  });

  it('con algo cargado, cancelar pregunta antes de descartar', async () => {
    const api = mockApi();
    const user = await open(api);
    await user.type(screen.getByPlaceholderText('Remera oversize'), 'Remera');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByPlaceholderText('Remera oversize')).toHaveValue('Remera');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Nuevo producto' })).not.toBeInTheDocument(),
    );
  });
});
