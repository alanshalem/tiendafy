/**
 * Las secciones de la portada que llegaron con la fase 2 del editor, cada una
 * con lo suyo: el cronómetro que no se desfasa al hidratar, el producto
 * destacado que respeta las variantes, el pop-up accesible, el texto con
 * formato que nunca dibuja HTML crudo, las categorías, el video que no carga
 * YouTube hasta que se toca, las columnas y el collage.
 */
import type { SectionType, ThemeSection } from '@tiendafy/types';
import { act, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionRenderer } from '../components/store/sections';
import { PreviewContext } from '../components/store/preview';
import { SectionProductsContext } from '../components/store/SectionProductsContext';
import type { StoreProduct } from '../components/store/ProductCard';
import { toStoreProducts, type ProductDto } from '../lib/catalog';
import { excerptOf } from '../lib/catalog-map';
import { useCart } from '../components/store/cart';
import userEvent from '@testing-library/user-event';
import { fixture, mockApi } from '../test/api';
import { renderInStore as render, StoreProviders } from '../test/store';

const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
const products = toStoreProducts(
  Array.from({ length: 4 }, (_, i) => ({ ...dto, id: `p-${i}`, slug: `prod-${i}`, name: `Producto ${i}` })),
).map((p, i) => (i < 2 ? { ...p, compareAtAmount: p.priceAmount * 2 } : p));

const section = (type: SectionType, data: Record<string, unknown>, id = `s-${type}`): ThemeSection =>
  ({ id, type, visible: true, data }) as ThemeSection;

function ui(
  s: ThemeSection,
  opts: { preview?: boolean; resolved?: Record<string, StoreProduct[]> } = {},
): ReactNode {
  return (
    <PreviewContext.Provider value={!!opts.preview}>
      <SectionProductsContext.Provider value={opts.resolved ?? {}}>
        <SectionRenderer section={s} products={products} storeName="Tienda" />
      </SectionProductsContext.Provider>
    </PreviewContext.Provider>
  );
}

beforeEach(() => {
  mockApi();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ofertas con cronómetro', () => {
  const NOW = Date.parse('2026-11-10T12:00:00.000Z');
  // 2 días, 3 horas, 4 minutos y 5 segundos después.
  const END = new Date(NOW + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000).toISOString();

  it('el servidor manda guiones y la fecha escrita; el navegador hidrata sin diferencias y cuenta', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    const s = section('countdown-offer', { title: 'Hot Sale', endsAt: END });
    const tree = <StoreProviders>{ui(s)}</StoreProviders>;
    const html = renderToString(tree);
    expect(html).toContain('--');
    expect(html).toContain('Termina el jueves 12/11 a las 12:04');
    expect(html).not.toMatch(/>0[0-9]</);

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();

    // Ya hidratado, cuenta: 02 días 03 horas 04 min 05 seg.
    const digits = () => Array.from(container.querySelectorAll('.tabular-nums')).map((el) => el.textContent);
    expect(digits()).toEqual(['02', '03', '04', '05']);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(digits()).toEqual(['02', '03', '04', '02']);
    // El lector de pantalla oye minutos, no segundos.
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe(
      'Termina en 2 días, 3 horas y 5 minutos.',
    );
    // Los números no se leen dos veces (las cajas son decorativas).
    expect(container.querySelector('.tabular-nums')!.closest('[aria-hidden="true"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('al terminar se oculta (o muestra el mensaje, sin productos)', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    const ending = new Date(NOW + 2000).toISOString();
    const { container, rerender } = render(
      ui(section('countdown-offer', { title: 'Promo', endsAt: ending })),
    );
    expect(screen.getByText('Promo')).toBeInTheDocument();
    expect(screen.getAllByText(/Producto [01]/).length).toBeGreaterThan(0);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(container).toBeEmptyDOMElement();

    rerender(
      ui(
        section('countdown-offer', {
          title: 'Promo',
          endsAt: ending,
          whenEnded: 'message',
          endedText: 'Se terminó',
        }),
      ),
    );
    expect(screen.getByText('Se terminó')).toBeInTheDocument();
    expect(screen.queryByText(/Producto 0/)).not.toBeInTheDocument();
  });

  it('en la vista previa avisa en vez de desaparecer, y pide la fecha si falta', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    const past = new Date(NOW - 1000).toISOString();
    const { rerender } = render(
      ui(section('countdown-offer', { title: 'Vieja', endsAt: past }), { preview: true }),
    );
    expect(screen.getByText(/en la tienda esta sección no se muestra/)).toBeInTheDocument();
    rerender(ui(section('countdown-offer', { title: 'Sin fecha' }), { preview: true }));
    expect(screen.getByText(/Elegí cuándo termina/)).toBeInTheDocument();
  });

  it('muestra los productos de su origen y, si la API no respondió, los que están en oferta', () => {
    const s = section('countdown-offer', { title: 'Promo', endsAt: END, carousel: false });
    const { rerender } = render(ui(s));
    // Sin resolver: los dos con precio tachado.
    expect(screen.getByText('Producto 0')).toBeInTheDocument();
    expect(screen.getByText('Producto 1')).toBeInTheDocument();
    expect(screen.queryByText('Producto 2')).not.toBeInTheDocument();
    rerender(ui(s, { resolved: { [s.id]: [products[3]!] } }));
    expect(screen.getByText('Producto 3')).toBeInTheDocument();
    expect(screen.queryByText('Producto 0')).not.toBeInTheDocument();
  });

  it('el botón va solo con un link válido', () => {
    const s = (link: string) =>
      section('countdown-offer', { title: 'P', endsAt: END, buttonText: 'Ver todo', link });
    const { rerender } = render(ui(s('/productos')));
    expect(screen.getByRole('link', { name: 'Ver todo' })).toHaveAttribute('href', '/productos');
    rerender(ui(s('javascript:alert(1)')));
    expect(screen.queryByText('Ver todo')).not.toBeInTheDocument();
  });
});

/** Lo que hay en el carrito (para ver que "Agregar" agregó). */
function CartProbe() {
  const { count, open } = useCart();
  return <output aria-label="carrito">{`${count} ${open ? 'abierto' : 'cerrado'}`}</output>;
}

describe('producto destacado', () => {
  const s = (data: Record<string, unknown>) => section('featured-product', { productId: 'p-2', ...data });

  it('con una sola variante agrega al carrito y lo abre', async () => {
    const user = userEvent.setup();
    render(
      <>
        {ui(s({ badge: 'Elegido del mes' }))}
        <CartProbe />
      </>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Producto 2' })).toBeInTheDocument();
    expect(screen.getByText('Elegido del mes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver producto' })).toHaveAttribute('href', '/productos/prod-2');
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));
    expect(screen.getByLabelText('carrito')).toHaveTextContent('1 abierto');
  });

  it('con varias variantes lleva a elegir; agotado no se agrega; "Ver producto" si se eligió así', () => {
    const many = { ...products[2]!, variantCount: 3 };
    const { rerender } = render(ui(s({}), { resolved: { 's-featured-product': [many] } }));
    expect(screen.getByRole('link', { name: 'Elegir opciones' })).toHaveAttribute(
      'href',
      '/productos/prod-2',
    );
    expect(screen.queryByRole('button', { name: 'Agregar al carrito' })).not.toBeInTheDocument();

    rerender(ui(s({}), { resolved: { 's-featured-product': [{ ...products[2]!, stock: 0 }] } }));
    expect(screen.getByRole('button', { name: 'Sin stock' })).toBeDisabled();

    rerender(ui(s({ button: 'link' })));
    expect(screen.getByRole('link', { name: 'Ver producto' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('muestra precio tachado, descuento y el resumen de la descripción (si se pide)', () => {
    const { rerender } = render(ui(s({ productId: 'p-0' })));
    expect(screen.getByText('-50%')).toBeInTheDocument();
    expect(screen.getByText(products[0]!.excerpt!)).toBeInTheDocument();
    rerender(ui(s({ productId: 'p-0', showDescription: false })));
    expect(screen.queryByText(products[0]!.excerpt!)).not.toBeInTheDocument();
  });

  it('lo resuelto por la API manda; sin producto, nada en la tienda y un aviso en el editor', () => {
    const { container, rerender } = render(ui(s({}), { resolved: { 's-featured-product': [products[3]!] } }));
    expect(screen.getByRole('heading', { name: 'Producto 3' })).toBeInTheDocument();
    rerender(ui(s({}), { resolved: { 's-featured-product': [] } }));
    expect(container).toBeEmptyDOMElement();
    rerender(ui(s({}), { resolved: { 's-featured-product': [] }, preview: true }));
    expect(screen.getByText('Elegí el producto que querés destacar')).toBeInTheDocument();
  });

  it('el resumen de la descripción va en una línea y cortado en una palabra', () => {
    expect(excerptOf('  Banco\n\nregulable   de acero ')).toBe('Banco regulable de acero');
    const long = 'palabra '.repeat(60);
    const out = excerptOf(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('palabra…')).toBe(true);
  });
});
