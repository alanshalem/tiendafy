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
import { popupSeen } from '../components/store/sections/promo-popup';
import { ADMIN_ORIGIN } from '../components/store/preview';
import { nav } from '../test/next';
import { StoreCategoriesProvider } from '../components/store/CategoryMenu';
import { EDITOR_MSG, parseVideoUrl, videoEmbedUrl } from '@tiendafy/types';
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

describe('pop-up promocional', () => {
  const popup = (data: Record<string, unknown> = {}) =>
    section('promo-popup', {
      title: '10% off',
      text: 'En tu primera compra',
      couponCode: 'HOLA10',
      buttonText: 'Ver productos',
      link: '/productos',
      delaySeconds: 5,
      ...data,
    });
  const dialog = () => document.querySelector('dialog')!;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('no ocupa lugar y se abre a los segundos elegidos, como diálogo modal accesible', async () => {
    const { container } = render(ui(popup()));
    expect(dialog().open).toBe(false);
    expect(container.querySelector('[data-promo-popup]')).toHaveClass('contents');
    await act(async () => {
      vi.advanceTimersByTime(4900);
    });
    expect(dialog().open).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(dialog().open).toBe(true);
    expect(screen.getByRole('dialog', { name: '10% off' })).toBeInTheDocument();
    // El foco entra al diálogo (en el navegador, al botón de cerrar: sin abrir el teclado del celular).
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/productos');

    // Escape lo cierra (como el navegador).
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(dialog().open).toBe(false);
  });

  it('no vuelve a aparecer dentro de la frecuencia, por tienda', async () => {
    const first = render(ui(popup({ frequency: 'days', frequencyDays: 7 })));
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(dialog().open).toBe(true);
    first.unmount();

    render(ui(popup({ frequency: 'days', frequencyDays: 7 })));
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(dialog().open).toBe(false);
    expect(Object.keys(localStorage).some((k) => k.startsWith('tf:popup:'))).toBe(true);
  });

  it('la frecuencia decide cuándo vuelve', () => {
    const data = (frequency: string, frequencyDays = 7) =>
      ({ frequency, frequencyDays }) as unknown as Parameters<typeof popupSeen>[0];
    const now = Date.parse('2026-11-10T12:00:00Z');
    localStorage.setItem('k', String(now - 3 * 86_400_000));
    expect(popupSeen(data('days', 7), 'k', now)).toBe(true);
    expect(popupSeen(data('days', 2), 'k', now)).toBe(false);
    expect(popupSeen(data('once'), 'k', now)).toBe(true);
    expect(popupSeen(data('once'), 'otra', now)).toBe(false);
    expect(popupSeen(data('session'), 'k', now)).toBe(false);
    sessionStorage.setItem('k', '1');
    expect(popupSeen(data('session'), 'k', now)).toBe(true);
  });

  it('nunca en el checkout ni en la cuenta', async () => {
    nav.at('/checkout');
    render(ui(popup({ delaySeconds: 0 })));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(dialog().open).toBe(false);
  });

  it('al querer irse (mouse que sale por arriba), solo con mouse', async () => {
    const match = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }) as never,
      );
    render(ui(popup({ trigger: 'exit' })));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(dialog().open).toBe(false);
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0, relatedTarget: null }));
    });
    expect(dialog().open).toBe(true);
    match.mockRestore();
  });

  it('cierra con el botón y con un clic en el fondo; copia el cupón', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(ui(popup({ delaySeconds: 0 })));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Copiar' }).click();
    });
    expect(writeText).toHaveBeenCalledWith('HOLA10');
    expect(screen.getByText('Código copiado. Pegalo cuando pagues.')).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Cerrar' }).click();
    });
    expect(dialog().open).toBe(false);

    await act(async () => {
      dialog().showModal();
      dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dialog().open).toBe(false);
  });

  it('en el editor no se abre solo: se abre con su panel y se cierra al pasar a otro', async () => {
    render(ui(popup({ delaySeconds: 0 }), { preview: true }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(dialog().open).toBe(false);
    expect(screen.getByText(/En la tienda no ocupa lugar/)).toBeInTheDocument();

    const msg = (sectionId: string) =>
      act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: ADMIN_ORIGIN,
            data: { type: EDITOR_MSG.focusSection, target: 'section', sectionId },
          }),
        );
      });
    await msg('s-promo-popup');
    expect(dialog().open).toBe(true);
    await msg('otra');
    expect(dialog().open).toBe(false);
    // Un mensaje de otro origen no abre nada.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://otro.com',
          data: { type: EDITOR_MSG.focusSection, sectionId: 's-promo-popup' },
        }),
      );
    });
    expect(dialog().open).toBe(false);
    await act(async () => {
      screen.getByRole('button', { name: 'Ver el pop-up' }).click();
    });
    expect(dialog().open).toBe(true);
  });

  it('con newsletter muestra el formulario de suscripción', async () => {
    render(ui(popup({ delaySeconds: 0, newsletter: true, couponCode: '' })));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByRole('button', { name: 'Suscribirme' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument();
  });
});

describe('texto con formato', () => {
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Envíos' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Mandamos ' },
          { type: 'text', text: 'a todo el país', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' ver ' },
          { type: 'text', text: 'tarifas', marks: [{ type: 'link', attrs: { href: '/paginas/envios' } }] },
        ],
      },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Correo' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Moto' }] }] },
        ],
      },
      { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Cambios' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rápido' }] }] },
    ],
  };

  it('dibuja títulos debajo del h2 de la sección, listas, citas y links de la tienda', () => {
    render(ui(section('rich-text', { title: 'Cómo trabajamos', body })));
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo trabajamos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Envíos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Cambios' })).toBeInTheDocument();
    expect(screen.getByText('a todo el país').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'tarifas' })).toHaveAttribute('href', '/paginas/envios');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Rápido').closest('blockquote')).not.toBeNull();
  });

  it('nunca dibuja HTML del tema: un <script> escrito es texto y un link peligroso no es link', () => {
    const { container } = render(
      ui(
        section('rich-text', {
          title: '<img src=x onerror=alert(1)>',
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '<script>alert(1)</script>' },
                  {
                    type: 'text',
                    text: 'clic',
                    marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                  },
                ],
              },
              { type: 'html', html: '<iframe src="https://malo.com"></iframe>' },
              { type: 'image', attrs: { src: 'https://malo.com/x.png', onerror: 'alert(1)' } },
            ],
          },
        }),
      ),
    );
    expect(container.querySelector('script, iframe, [onerror]')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'clic' })).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('con imagen a un lado o arriba; sin nada no se muestra', () => {
    const { container, rerender } = render(
      ui(
        section('rich-text', {
          title: 'T',
          body,
          image: 'https://cdn.example.com/a.jpg',
          imagePosition: 'right',
        }),
      ),
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/a.jpg');
    expect(container.querySelector('.md\\:grid-cols-2')).not.toBeNull();
    rerender(
      ui(section('rich-text', { title: 'T', image: 'https://cdn.example.com/a.jpg', imagePosition: 'top' })),
    );
    expect(container.querySelector('.md\\:grid-cols-2')).toBeNull();
    rerender(ui(section('rich-text', { body: { type: 'doc', content: [{ type: 'paragraph' }] } })));
    expect(container).toBeEmptyDOMElement();
  });
});

const CATS = [
  { id: 'c1', name: 'Ropa', parentId: null, path: 'ropa' },
  { id: 'c2', name: 'Remeras', parentId: 'c1', path: 'ropa/remeras' },
  { id: 'c3', name: 'Calzado', parentId: null, path: 'calzado' },
  { id: 'c4', name: 'Accesorios', parentId: null, path: 'accesorios' },
];
const withCats = (node: ReactNode) => (
  <StoreCategoriesProvider categories={CATS}>{node}</StoreCategoriesProvider>
);

describe('categorías principales', () => {
  it('automático: las de primer nivel, hasta la cantidad elegida, con su link y la inicial si no hay foto', () => {
    render(withCats(ui(section('category-list', { title: 'Comprá por categoría', mode: 'auto', count: 2 }))));
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('category='));
    expect(links).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ropa' })).toHaveAttribute('href', '/productos?category=ropa');
    expect(screen.getByRole('link', { name: 'Calzado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/productos');
  });

  it('a mano: en su orden, con nombre y foto propios; las borradas no dejan hueco', () => {
    const { container } = render(
      withCats(
        ui(
          section('category-list', {
            mode: 'manual',
            showAll: false,
            shape: 'portrait',
            items: [
              { categoryId: 'c2', title: 'Remeras de verano', image: 'https://cdn.example.com/r.jpg' },
              { categoryId: 'borrada', title: 'Fantasma' },
              { categoryId: 'c4' },
            ],
          }),
        ),
      ),
    );
    expect(screen.getByRole('link', { name: 'Remeras de verano' })).toHaveAttribute(
      'href',
      '/productos?category=ropa/remeras',
    );
    expect(screen.queryByText('Fantasma')).not.toBeInTheDocument();
    expect(screen.getByText('Accesorios')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/r.jpg');
    expect(container.querySelector('.aspect-\\[3\\/4\\]')).not.toBeNull();
    expect(screen.queryByText('Ver todas')).not.toBeInTheDocument();
  });

  it('en carrusel es una lista que se desliza; en grilla, las columnas elegidas', () => {
    const { container, rerender } = render(
      withCats(ui(section('category-list', { layout: 'carousel', columnsMobile: 2, columnsDesktop: 5 }))),
    );
    expect(container.querySelector('ul.overflow-x-auto')).not.toBeNull();
    rerender(withCats(ui(section('category-list', { layout: 'grid', columnsMobile: 3, columnsDesktop: 7 }))));
    expect(container.querySelector('ul')).toHaveClass('grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-7');
  });

  it('sin categorías: nada en la tienda y un aviso en el editor', () => {
    const empty = (node: ReactNode) => (
      <StoreCategoriesProvider categories={[]}>{node}</StoreCategoriesProvider>
    );
    const { container, rerender } = render(empty(ui(section('category-list', { title: 'Cats' }))));
    expect(container).toBeEmptyDOMElement();
    rerender(empty(ui(section('category-list', { title: 'Cats' }), { preview: true })));
    expect(screen.getByText(/Todavía no hay categorías/)).toBeInTheDocument();
  });
});

describe('video', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'youtube', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ?si=abc', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/live/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/123456789', 'vimeo', '123456789'],
    ['https://vimeo.com/channels/staffpicks/123456789', 'vimeo', '123456789'],
  ])('reconoce %s', (url, provider, id) => {
    expect(parseVideoUrl(url)).toMatchObject({ provider, id });
  });

  it('un video privado de Vimeo conserva su clave; lo que no es un video no se embebe', () => {
    expect(parseVideoUrl('https://vimeo.com/123456789/abcdef1234')).toEqual({
      provider: 'vimeo',
      id: '123456789',
      hash: 'abcdef1234',
    });
    expect(videoEmbedUrl(parseVideoUrl('https://player.vimeo.com/video/42?h=ff00ff')!)).toBe(
      'https://player.vimeo.com/video/42?autoplay=1&dnt=1&h=ff00ff',
    );
    for (const bad of [
      'https://malo.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=corto',
      'javascript:alert(1)',
      '',
    ])
      expect(parseVideoUrl(bad)).toBeNull();
  });

  it('YouTube no se carga hasta que se toca reproducir; después va sin cookies', async () => {
    const user = userEvent.setup();
    const { container } = render(
      ui(section('video', { source: 'link', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Cómo se arma' })),
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    await user.click(screen.getByRole('button', { name: 'Reproducir: Cómo se arma' }));
    const frame = container.querySelector('iframe')!;
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1',
    );
    expect(frame).toHaveAttribute('title', 'Cómo se arma');
  });

  it('el MP4 arranca solo y sin sonido, con pausa a mano; con "reducir movimiento" no arranca', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const mp4 = section('video', { source: 'file', file: 'https://cdn.example.com/v.mp4', ratio: '9:16' });
    const { container, unmount } = render(ui(mp4));
    const video = container.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(container.querySelector('.aspect-\\[9\\/16\\]')).not.toBeNull();
    await act(async () => {
      video.dispatchEvent(new Event('play'));
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Pausar el video' }).click();
    });
    expect(pause).toHaveBeenCalled();
    unmount();

    play.mockClear();
    const reduce = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (q) =>
          ({
            matches: q.includes('reduce'),
            media: q,
            addEventListener() {},
            removeEventListener() {},
          }) as never,
      );
    render(ui(mp4));
    expect(play).not.toHaveBeenCalled();
    reduce.mockRestore();

    // Sin "reproducir solo": los controles del navegador.
    const { container: c2 } = render(
      ui(section('video', { source: 'file', file: 'https://cdn.example.com/v.mp4', autoplay: false })),
    );
    expect(c2.querySelector('video')).toHaveAttribute('controls');
    expect(screen.queryByRole('button', { name: 'Pausar el video' })).not.toBeInTheDocument();
  });

  it('sin video: nada en la tienda; en el editor, qué falta', () => {
    const bad = section('video', { source: 'link', url: 'https://malo.com/v' });
    const { container, rerender } = render(ui(bad));
    expect(container).toBeEmptyDOMElement();
    rerender(ui(bad, { preview: true }));
    expect(screen.getByText('Ese link no es de un video de YouTube o Vimeo.')).toBeInTheDocument();
  });
});
