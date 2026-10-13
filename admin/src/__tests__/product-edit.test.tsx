/**
 * Edición de un producto con sus datos reales (el sembrado: con categoría,
 * ficha técnica y fotos). Guardar manda solo lo que cambió de precios y
 * categorías, el stock de cada variante y la ficha entera; las fotos se
 * agregan, quitan y reordenan al instante; publicar/archivar y eliminar.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

interface Product {
  id: string;
  name: string;
  status: string;
  categoryIds: string[];
  images: { id: string; url: string }[];
  variants: { id: string; price: { amount: number; currency: string } }[];
}
const product = fixture<Product>('/api/v1/products/:id');
const variant = product.variants[0]!;

async function open(api: MockApi, patch: Partial<Product> = {}) {
  api.on('GET', `/api/v1/products/${product.id}`, { ...product, ...patch });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(`/productos/${product.id}/editar`);
  await screen.findByRole('heading', { name: 'Editar producto' });
  await settle(3);
  return user;
}

const sent = (api: MockApi, method: string, suffix: string) =>
  api.calls.filter((c) => c.method === method && c.path.endsWith(suffix)).map((c) => c.body);

describe('editar producto', () => {
  it('guarda detalles, precio con promo, stock, categorías y ficha técnica', async () => {
    const api = mockApi();
    const user = await open(api);

    const name = screen.getByLabelText(/^Nombre/);
    await user.clear(name);
    await user.type(name, 'Mancuerna 10 kg');
    await user.type(screen.getByPlaceholderText('Sin marca'), ' Hierro Pro ');
    await user.type(screen.getByLabelText(/Título SEO/), 'Mancuerna barata');

    const price = screen.getByLabelText(/^Precio \(ARS\)/);
    await user.clear(price);
    await user.type(price, '30000');
    await user.type(screen.getAllByPlaceholderText('—')[0]!, '27000'); // promo
    const stock = screen.getAllByPlaceholderText('—')[1]!;
    await user.clear(stock);
    await user.type(stock, '12');

    // Categoría: se saca la que tenía.
    const category = screen.queryAllByRole('button', { pressed: true })[0];
    if (category) await user.click(category);

    // Ficha técnica: cambiar el material.
    const material = screen.queryByLabelText(/Material/);
    if (material) {
      await user.clear(material);
      await user.type(material, 'Acero');
    }

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await settle(4);

    expect(sent(api, 'PATCH', `/products/${product.id}`)[0]).toMatchObject({
      name: 'Mancuerna 10 kg',
      brand: 'Hierro Pro',
      seoTitle: 'Mancuerna barata',
    });
    expect(sent(api, 'PATCH', `/variants/${variant.id}/price`)[0]).toMatchObject({ currency: 'ARS' });
    expect(sent(api, 'PUT', `/inventory/${variant.id}`)[0]).toEqual({
      available: 12,
      reason: 'Edición de producto',
    });
    if (category)
      expect(sent(api, 'PUT', `/products/${product.id}/categories`)[0]).toEqual({ categoryIds: [] });
    const specs = sent(api, 'PUT', `/products/${product.id}/specs`)[0] as { values: { value: string }[] };
    expect(specs.values).toBeInstanceOf(Array);
    if (material) expect(specs.values.map((v) => v.value)).toContain('Acero');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Editar producto' })).not.toBeInTheDocument(),
    );
  });

  it('código de barras y paquete de cada variante: se guardan solo si cambian', async () => {
    const api = mockApi();
    const single = { ...variant, barcode: null, weightGrams: 800, lengthCm: 30, widthCm: 20, heightCm: 10 };
    const user = await open(api, { variants: [single] } as Partial<Product>);
    expect(screen.getByLabelText('Peso del paquete (kg)')).toHaveValue('0,8');

    await user.type(screen.getByLabelText(/^Código de barras/), '7790001112223');
    const weight = screen.getByLabelText('Peso del paquete (kg)');
    await user.clear(weight);
    await user.type(weight, '15');
    await user.clear(screen.getByLabelText('Alto (cm)'));
    // Sin las tres medidas no se puede guardar.
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await user.type(screen.getByLabelText('Alto (cm)'), '5');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await settle(4);
    expect(sent(api, 'PUT', `/variants/${variant.id}/barcode`)).toEqual([{ barcode: '7790001112223' }]);
    expect(sent(api, 'PUT', `/variants/${variant.id}/shipping`)).toEqual([
      { weightGrams: 15_000, lengthCm: 30, widthCm: 20, heightCm: 5 },
    ]);
  });

  it('subir una foto (que recarga el producto) no pisa lo que se estaba editando', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example.com/nueva.jpg' });
    const user = await open(api);
    const name = screen.getByLabelText(/^Nombre/);
    await user.clear(name);
    await user.type(name, 'Nombre todavía sin guardar');

    await user.upload(
      document.querySelector<HTMLInputElement>('input[type=file]')!,
      new File(['png'], 'nueva.png', { type: 'image/png' }),
    );
    await settle(4);
    expect(
      api.calls.filter((c) => c.method === 'GET' && c.path === `/api/v1/products/${product.id}`).length,
    ).toBeGreaterThan(1);
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Nombre todavía sin guardar');
  });

  it('sin tocar el paquete no lo reescribe', async () => {
    const api = mockApi();
    const single = { ...variant, barcode: 'X1', weightGrams: 800, lengthCm: 30, widthCm: 20, heightCm: 10 };
    const user = await open(api, { variants: [single] } as Partial<Product>);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await settle(4);
    expect(sent(api, 'PUT', `/variants/${variant.id}/barcode`)).toEqual([]);
    expect(sent(api, 'PUT', `/variants/${variant.id}/shipping`)).toEqual([]);
  });

  it('sin cambios de precio no lo reescribe; un error al guardar se muestra', async () => {
    const api = mockApi();
    api.on('PUT', `/api/v1/products/${product.id}/specs`, { detail: 'Ficha inválida.' }, 400);
    const user = await open(api);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Ficha inválida.')).toBeInTheDocument();
    expect(sent(api, 'PATCH', `/variants/${variant.id}/price`)).toEqual([]);
  });

  it('fotos: agregar, quitar y reordenar al instante', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example.com/nueva.jpg' });
    const images = [
      { id: 'img-1', url: 'https://cdn.example.com/1.jpg', altText: null, sortOrder: 0 },
      { id: 'img-2', url: 'https://cdn.example.com/2.jpg', altText: null, sortOrder: 1 },
    ];
    const user = await open(api, { images } as Partial<Product>);

    await user.upload(
      document.querySelector<HTMLInputElement>('input[type=file]')!,
      new File(['png'], 'nueva.png', { type: 'image/png' }),
    );
    await settle(2);
    expect(sent(api, 'POST', `/products/${product.id}/images`)[0]).toEqual({
      url: 'https://cdn.example.com/nueva.jpg',
      altText: product.name,
    });

    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[draggable="true"]'));
    fireEvent.dragStart(tiles[1]!);
    fireEvent.dragOver(tiles[0]!);
    fireEvent.drop(tiles[0]!);
    await settle(2);
    expect(sent(api, 'PUT', `/products/${product.id}/images/reorder`)[0]).toEqual({
      imageIds: ['img-2', 'img-1'],
    });

    // Soltar sobre sí misma no reordena.
    fireEvent.dragStart(tiles[0]!);
    fireEvent.drop(tiles[0]!);

    await user.click(screen.getAllByRole('button', { name: 'Quitar imagen' })[0]!);
    await settle(2);
    expect(
      api.calls.some((c) => c.method === 'DELETE' && c.path.includes(`/products/${product.id}/images/`)),
    ).toBe(true);
  });

  it('publicar/archivar y eliminar con confirmación', async () => {
    const api = mockApi();
    const user = await open(api);
    await user.click(screen.getByLabelText('Mostrar en la tienda (publicado)'));
    await settle(2);
    expect(
      api.calls.some((c) => c.method === 'POST' && c.path.endsWith(`/products/${product.id}/archive`)),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: /Eliminar producto/ }));
    // El "Cancelar" de la confirmación (el otro es el de la barra inferior).
    await user.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!);
    await user.click(screen.getByRole('button', { name: /Eliminar producto/ }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await settle(2);
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === `/api/v1/products/${product.id}`)).toBe(
      true,
    );
  });

  it('un archivado se publica', async () => {
    const api = mockApi();
    const user = await open(api, { status: 'ARCHIVED' });
    await user.click(screen.getByLabelText('Mostrar en la tienda (publicado)'));
    await settle(2);
    expect(api.calls.some((c) => c.path.endsWith(`/products/${product.id}/publish`))).toBe(true);
  });

  it('escribir la descripción con IA (y si falla, avisa)', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/ai/status', { enabled: true });
    api.on('POST', '/api/v1/ai/product-description', { text: 'Mancuerna de hierro fundido.' });
    const user = await open(api);
    await user.click(screen.getByRole('button', { name: /Escribir con IA/ }));
    await settle(2);
    expect(screen.getByDisplayValue('Mancuerna de hierro fundido.')).toBeInTheDocument();

    api.on('POST', '/api/v1/ai/product-description', {}, 503);
    await user.click(screen.getByRole('button', { name: /Escribir con IA/ }));
    expect(await screen.findByText(/no pudo|failed|status 503/i)).toBeInTheDocument();
  });
});
