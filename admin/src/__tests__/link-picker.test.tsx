/**
 * El selector de links del editor de diseño: elegir un producto, una
 * categoría, una página, escribir una URL (con aviso en vivo y https://
 * completado) o armar un WhatsApp; y al volver a un link guardado, mostrar a
 * qué apunta con su nombre. Lo guardado es siempre un href común.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkPicker, type LinkPick, type LinkPickerProps } from '../components/LinkPicker';
import { fixture, mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

const products = fixture<{ items: { name: string; slug: string }[] }>('/api/v1/products').items;
const bySlug = fixture<{ name: string }>('/api/v1/products/by-slug/x');

/** Lo último que se eligió (href + qué era). */
let last: { href: string; pick?: LinkPick; newTab?: boolean };

function Harness(props: Partial<LinkPickerProps> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '');
  const [newTab, setNewTab] = useState(false);
  return (
    <LinkPicker
      {...props}
      value={value}
      newTab={newTab}
      onNewTabChange={(v) => {
        setNewTab(v);
        last = { ...last, newTab: v };
      }}
      onChange={(href, pick) => {
        setValue(href);
        last = { href, pick };
      }}
    />
  );
}

async function show(props: Partial<LinkPickerProps> & { initial?: string } = {}) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderWithProviders(<Harness {...props} />);
  await settle(4);
  return user;
}

const group = () => screen.getByRole('group', { name: 'Link' });
const tab = (name: string) => within(group()).getByRole('button', { name: new RegExp(`^${name}$`) });

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
  last = { href: '' };
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('LinkPicker: elegir', () => {
  it('producto: busca, elige y muestra "Producto: …"', async () => {
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    expect(tab('Producto')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: 'Buscar producto' })).toHaveFocus();
    const list = await screen.findByRole('list', { name: 'Productos' });
    await user.click(within(list).getByRole('button', { name: products[0]!.name }));
    expect(last.href).toBe(`/productos/${products[0]!.slug}`);
    expect(last.pick).toMatchObject({ type: 'product', label: products[0]!.name });
    expect(last.pick?.refId).toBeTruthy();
    // El nombre que se ve sale del producto (por slug).
    expect(await within(group()).findByText(bySlug.name)).toBeInTheDocument();
  });

  it('categoría: la ruta legible en ?category=', async () => {
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(tab('Categoría'));
    const list = await screen.findByRole('list', { name: 'Categorías' });
    await user.click(within(list).getByRole('button', { name: 'Musculación' }));
    expect(last.href).toBe('/productos?category=musculacion');
    expect(await within(group()).findByText('Musculación')).toBeInTheDocument();
    expect(within(group()).getByText('Categoría:')).toBeInTheDocument();
  });

  it('página: las fijas de la tienda y las publicadas', async () => {
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(tab('Página'));
    const list = screen.getByRole('list', { name: 'Páginas' });
    for (const fixed of [
      'Inicio',
      'Productos',
      'Contacto',
      'Favoritos',
      'Privacidad',
      'Botón de arrepentimiento',
    ])
      expect(within(list).getByRole('button', { name: fixed })).toBeInTheDocument();
    await user.click(await within(list).findByRole('button', { name: 'Cómo comprar' }));
    expect(last.href).toBe('/paginas/como-comprar');
    expect(last.pick).toMatchObject({ type: 'page', label: 'Cómo comprar' });
    expect(await within(group()).findByText('Cómo comprar')).toBeInTheDocument();
  });

  it('URL: avisa lo inválido mientras se escribe y completa el https://', async () => {
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(tab('URL'));
    const input = screen.getByRole('textbox', { name: /Dirección web/ });
    expect(input).toHaveFocus();
    const use = within(group()).getByRole('button', { name: 'Usar' });

    await user.type(input, 'javascript:alert(1)');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(within(group()).getByText(/no está permitido/)).toBeInTheDocument();
    expect(use).toBeDisabled();
    await user.keyboard('{Enter}'); // con error, Enter no guarda
    expect(last.href).toBe('');

    await user.clear(input);
    await user.type(input, 'www.cking.com.ar');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(within(group()).getByText('Se va a guardar como https://www.cking.com.ar')).toBeInTheDocument();
    // La casilla de pestaña nueva también está acá.
    await user.click(within(group()).getByRole('checkbox', { name: 'Abrir en pestaña nueva' }));
    expect(last.newTab).toBe(true);
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(last.href).toBe('https://www.cking.com.ar');
    expect(within(group()).getByText('Web:')).toBeInTheDocument();
    expect(within(group()).getByRole('checkbox', { name: 'Abrir en pestaña nueva' })).toBeChecked();
  });

  it('WhatsApp: número con código de país y mensaje opcional', async () => {
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(tab('WhatsApp'));
    const phone = screen.getByRole('textbox', { name: /Número/ });
    await user.type(phone, '123');
    expect(within(group()).getByText(/parece incompleto/)).toBeInTheDocument();
    expect(within(group()).getByRole('button', { name: 'Usar este WhatsApp' })).toBeDisabled();
    await user.clear(phone);
    await user.type(phone, '+54 9 11 2233-4455');
    await user.type(screen.getByRole('textbox', { name: /Mensaje/ }), 'Hola!');
    await user.click(within(group()).getByRole('button', { name: 'Usar este WhatsApp' }));
    expect(last.href).toBe('https://wa.me/5491122334455?text=Hola!');
    expect(within(group()).getByText('+5491122334455')).toBeInTheDocument();
  });

  it('solo los tipos pedidos, sin selector si hay uno solo', async () => {
    const user = await show({ types: ['url'] });
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    expect(within(group()).queryByRole('group', { name: 'Tipo de destino' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Dirección web/ })).toBeInTheDocument();
  });
});

describe('LinkPicker: un link guardado', () => {
  it.each([
    ['/productos/mancuerna-hexagonal-10kg', 'Producto:', bySlug.name],
    ['/productos?category=musculacion', 'Categoría:', 'Musculación'],
    ['/paginas/preguntas-frecuentes', 'Página:', 'Preguntas frecuentes'],
    ['/terminos', 'Página:', 'Términos y condiciones'],
    ['https://wa.me/5491122334455', 'WhatsApp:', '+5491122334455'],
    ['mailto:hola@cking.com.ar', 'Email:', 'hola@cking.com.ar'],
    ['tel:+541145551234', 'Teléfono:', '+541145551234'],
    ['https://www.cking.com.ar/', 'Web:', 'www.cking.com.ar/'],
    ['/productos?q=pesas', 'Link:', '/productos?q=pesas'],
    ['javascript:alert(1)', 'Link inválido:', 'javascript:alert(1)'],
  ])('%s → %s %s', async (initial, prefix, name) => {
    await show({ initial });
    expect(within(group()).getByText(prefix)).toBeInTheDocument();
    expect(await within(group()).findByText(name)).toBeInTheDocument();
  });

  it('un producto o una categoría que ya no existe muestra lo que dice el link', async () => {
    mockApi().on('GET', '/api/v1/products/by-slug/:slug', {}, 404);
    await show({ initial: '/productos/borrado' });
    expect(await within(group()).findByText('borrado')).toBeInTheDocument();
  });

  it('cambiar abre en el tipo que corresponde; Escape y Cancelar no tocan nada', async () => {
    const onCancel = vi.fn();
    const user = await show({ initial: '/productos?category=musculacion', onCancel });
    await user.click(within(group()).getByRole('button', { name: 'Cambiar link' }));
    expect(tab('Categoría')).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(within(group()).getByText('Categoría:')).toBeInTheDocument();

    await user.click(within(group()).getByRole('button', { name: 'Cambiar link' }));
    await user.click(within(group()).getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(last.href).toBe('');
  });

  it('cambiar una URL la trae para corregirla', async () => {
    const user = await show({ initial: 'https://cking.com.ar' });
    await user.click(within(group()).getByRole('button', { name: 'Cambiar link' }));
    expect(screen.getByRole('textbox', { name: /Dirección web/ })).toHaveValue('https://cking.com.ar');
  });

  it('cambiar un WhatsApp trae el número y el mensaje', async () => {
    const user = await show({ initial: 'https://wa.me/5491122334455?text=Hola%20che' });
    await user.click(within(group()).getByRole('button', { name: 'Cambiar link' }));
    expect(screen.getByRole('textbox', { name: /Número/ })).toHaveValue('5491122334455');
    expect(screen.getByRole('textbox', { name: /Mensaje/ })).toHaveValue('Hola che');
  });

  it('quitar deja el campo vacío (o no se ofrece si no se puede)', async () => {
    const user = await show({ initial: '/contacto' });
    await user.click(within(group()).getByRole('button', { name: 'Quitar link' }));
    expect(last.href).toBe('');
    expect(screen.getByRole('button', { name: /Elegir a dónde lleva/ })).toBeInTheDocument();
  });

  it('sin quitar cuando clearable es false', async () => {
    await show({ initial: '/contacto', clearable: false });
    expect(within(group()).queryByRole('button', { name: 'Quitar link' })).not.toBeInTheDocument();
  });

  it('abierto de entrada (agregar) y con muchas categorías, con buscador', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      name: i === 11 ? 'Zapatillas' : `Rubro ${i}`,
      path: `rubro-${i}`,
      depth: (i % 2) + 1,
    }));
    mockApi().on('GET', '/api/v1/categories', { items: many });
    const user = await show({ defaultOpen: true, types: ['category'] });
    const search = await screen.findByRole('searchbox', { name: 'Buscar categoría' });
    await user.type(search, 'zapa');
    const list = screen.getByRole('list', { name: 'Categorías' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    await user.clear(search);
    await user.type(search, 'nada que ver');
    expect(screen.getByText('Sin resultados.')).toBeInTheDocument();
  });

  it('mientras cargan los productos lo dice', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = mockApi();
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/api/v1/products?')) await gate;
        return api.fetch(input, init);
      }),
    );
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    expect(within(group()).getByText('Cargando…')).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(within(group()).queryByText('Cargando…')).not.toBeInTheDocument());
    vi.stubGlobal('fetch', original);
  });
});
